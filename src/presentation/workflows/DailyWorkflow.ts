import type { Area } from "../../domain/value-objects/Area.js";
import type { Trend } from "../../domain/entities/Trend.js";
import type { Post } from "../../domain/entities/Post.js";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import { AREAS } from "../../domain/value-objects/Area.js";
import { getCurrentWeek } from "../../shared/utils/weekCalculator.js";
import { CollectPostsUseCase } from "../../application/use-cases/CollectPostsUseCase.js";
import { AnalyzeTrendsUseCase } from "../../application/use-cases/AnalyzeTrendsUseCase.js";
import { CreatePRUseCase } from "../../application/use-cases/CreatePRUseCase.js";
import { MarkdownService } from "../../domain/services/MarkdownService.js";
import { container } from "../../infrastructure/di/container.js";
import { logger } from "../../shared/utils/logger.js";
import type { PRData } from "../../domain/repositories/GitHubRepository.js";

export class DailyWorkflow {
  private readonly collectPostsUseCase: CollectPostsUseCase;
  private readonly analyzeTrendsUseCase: AnalyzeTrendsUseCase;
  private readonly createPRUseCase: CreatePRUseCase;
  private readonly markdownService = new MarkdownService();
  private readonly agents: Map<Area, Agent>;

  constructor() {
    const linkedInScraper = container.getLinkedInScraper();
    const githubRepository = container.getGitHubRepository();

    // Get all Mastra agents for all areas
    this.agents = container.getAllAgents();

    // Ensure agents exist for all areas
    for (const area of AREAS) {
      if (!this.agents.has(area)) {
        this.agents.set(area, container.getAgent(area));
      }
    }

    this.collectPostsUseCase = new CollectPostsUseCase(linkedInScraper);
    this.analyzeTrendsUseCase = new AnalyzeTrendsUseCase();
    this.createPRUseCase = new CreatePRUseCase(githubRepository);
  }

  async executeForArea(
    area: Area,
    weekNumber?: number,
    year?: number
  ): Promise<void> {
    const weekInfo =
      weekNumber && year ? { weekNumber, year } : getCurrentWeek();
    const { weekNumber: week, year: yr } = weekInfo;

    logger.info({ area, week, year: yr }, "Starting daily workflow for area");

    // Step 1: Collect posts
    logger.debug({ area }, "Step 1: Collecting posts");
    const postsByArea = await this.collectPostsUseCase.execute([area]);
    const posts = postsByArea[area];

    if (posts.length === 0) {
      logger.warn({ area }, "No posts collected, skipping");
      return;
    }

    // Step 2: Analyze using Mastra agent for this area
    logger.debug({ area }, "Step 2: Analyzing trends");
    const areaPosts = { [area]: posts } as Record<Area, Post[]>;
    const areaAgents = new Map<Area, Agent>();
    const agent = this.agents.get(area);
    if (!agent) {
      throw new Error(`No agent found for area: ${area}`);
    }
    areaAgents.set(area, agent);
    const trends = await this.analyzeTrendsUseCase.execute(
      areaPosts,
      areaAgents
    );
    const trend = trends[area];

    if (!trend) {
      throw new Error(`No trend found for area: ${area}`);
    }

    // Check if analysis failed (fallback was used)
    // The _isFallback flag is set by MastraAgentFactory when analysis fails
    const analysisFailed =
      (trend as { _isFallback?: boolean })._isFallback === true;
    if (analysisFailed) {
      const errorMsg = `AI analysis failed for area "${area}". The Mastra agent could not generate a proper trend analysis. This usually means:
1. The agent response format changed or is incompatible
2. The OpenAI API returned an unexpected response structure
3. Network or API errors occurred

Check the logs for detailed error information. The workflow will not create a PR when analysis fails.`;
      logger.error({ area, trend }, errorMsg);
      throw new Error(errorMsg);
    }

    // Validate trend structure
    if (!trend.mainAspects || !Array.isArray(trend.mainAspects)) {
      logger.error({ area, trend }, "Trend missing mainAspects array");
      throw new Error(
        `Invalid trend structure: missing mainAspects for area ${area}`
      );
    }
    if (!trend.whyImportant) {
      logger.error({ area, trend }, "Trend missing whyImportant");
      throw new Error(
        `Invalid trend structure: missing whyImportant for area ${area}`
      );
    }
    if (!trend.toolsFrameworks || !Array.isArray(trend.toolsFrameworks)) {
      logger.warn({ area }, "Trend missing toolsFrameworks, using empty array");
      trend.toolsFrameworks = [];
    }
    if (!trend.suggestedActions || !Array.isArray(trend.suggestedActions)) {
      logger.warn(
        { area },
        "Trend missing suggestedActions, using empty array"
      );
      trend.suggestedActions = [];
    }
    if (!trend.referencePosts || !Array.isArray(trend.referencePosts)) {
      logger.warn({ area }, "Trend missing referencePosts, using empty array");
      trend.referencePosts = [];
    }
    if (typeof trend.relevanceScore !== "number") {
      logger.warn({ area }, "Trend missing relevanceScore, using 0");
      trend.relevanceScore = 0;
    }

    logger.debug(
      {
        area,
        trend: {
          mainAspects: trend.mainAspects?.length,
          toolsFrameworks: trend.toolsFrameworks?.length,
          suggestedActions: trend.suggestedActions?.length,
          referencePosts: trend.referencePosts?.length,
        },
      },
      "Trend validated"
    );

    // Step 3: Generate markdown
    logger.debug({ area }, "Step 3: Generating markdown");
    let markdown: string;
    try {
      markdown = this.markdownService.trendToMarkdown(trend, week, yr);
      logger.debug(
        { area, markdownLength: markdown.length },
        "Markdown generated successfully"
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        {
          area,
          error: errorMessage,
          stack: errorStack,
          trend: JSON.stringify(trend, null, 2),
          week,
          year: yr,
        },
        "Failed to generate markdown"
      );
      throw error;
    }

    // Step 4: Create PR
    logger.debug({ area }, "Step 4: Creating/updating PR");
    const prData: PRData = {
      weekNumber: week,
      year: yr,
      area,
      trend,
      markdownContent: markdown,
      filename: `${area}.md`,
      postsJson: JSON.stringify(posts, null, 2),
      trendJson: JSON.stringify(trend, null, 2),
    };

    await this.createPRUseCase.execute("area", prData);
    logger.info({ area }, "Daily workflow completed");
  }

  async executeAll(weekNumber?: number, year?: number): Promise<void> {
    const weekInfo =
      weekNumber && year ? { weekNumber, year } : getCurrentWeek();
    const { weekNumber: week, year: yr } = weekInfo;

    logger.info({ week, year: yr }, "Starting daily workflow for all areas");

    // Step 1: Collect posts
    logger.debug("Step 1: Collecting posts for all areas");
    const postsByArea = await this.collectPostsUseCase.execute(AREAS);

    // Step 2: Analyze using Mastra agents
    logger.debug("Step 2: Analyzing trends for all areas using Mastra agents");
    const trends = await this.analyzeTrendsUseCase.execute(
      postsByArea,
      this.agents
    );

    // Step 3: Generate markdown and create PRs
    logger.debug("Step 3: Generating markdown files and creating PRs");
    for (const [area, trend] of Object.entries(trends) as [Area, Trend][]) {
      const markdown = this.markdownService.trendToMarkdown(trend, week, yr);
      const posts = postsByArea[area];

      const prData: PRData = {
        weekNumber: week,
        year: yr,
        area,
        trend,
        markdownContent: markdown,
        filename: `${area}.md`,
        postsJson: JSON.stringify(posts, null, 2),
        trendJson: JSON.stringify(trend, null, 2),
      };

      try {
        await this.createPRUseCase.execute("area", prData);
      } catch (error) {
        logger.error({ area, error }, "Failed to create/update PR");
      }
    }

    logger.info("Daily workflow completed for all areas");
  }

  async cleanup(): Promise<void> {
    await container.cleanup();
  }
}
