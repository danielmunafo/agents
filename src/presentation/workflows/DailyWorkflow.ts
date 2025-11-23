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
import type { GitHubRepository } from "../../domain/repositories/GitHubRepository.js";

export class DailyWorkflow {
  private readonly collectPostsUseCase: CollectPostsUseCase;
  private readonly analyzeTrendsUseCase: AnalyzeTrendsUseCase;
  private readonly createPRUseCase: CreatePRUseCase;
  private readonly markdownService = new MarkdownService();
  private readonly agents: Map<Area, Agent>;
  private readonly githubRepository: GitHubRepository;

  constructor() {
    const linkedInScraper = container.getLinkedInScraper();
    this.githubRepository = container.getGitHubRepository();

    // Get all OpenAI agents for all areas
    this.agents = container.getAllAgents();

    // Ensure agents exist for all areas
    for (const area of AREAS) {
      if (!this.agents.has(area)) {
        this.agents.set(area, container.getAgent(area));
      }
    }

    this.collectPostsUseCase = new CollectPostsUseCase(linkedInScraper);
    this.analyzeTrendsUseCase = new AnalyzeTrendsUseCase();
    this.createPRUseCase = new CreatePRUseCase(this.githubRepository);
  }

  /**
   * Merge new posts with existing posts, deduplicating by URL
   */
  private mergePosts(existingPosts: Post[], newPosts: Post[]): Post[] {
    const postsMap = new Map<string, Post>();

    // Add existing posts first
    for (const post of existingPosts) {
      postsMap.set(post.url, post);
    }

    // Add new posts (will overwrite if URL exists, keeping the newer one)
    for (const post of newPosts) {
      postsMap.set(post.url, post);
    }

    return Array.from(postsMap.values());
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

    // Step 0: Load existing posts from PR branch (if any)
    logger.debug({ area }, "Step 0: Loading existing posts from PR branch");
    const existingPosts =
      (await this.githubRepository.loadPostsFromPR(week, yr, area)) || [];
    logger.debug(
      { area, existingPostCount: existingPosts.length },
      "Loaded existing posts"
    );

    // Step 1: Collect new posts
    logger.debug({ area }, "Step 1: Collecting new posts");
    const postsByArea = await this.collectPostsUseCase.execute([area]);
    const newPosts = postsByArea[area];

    if (newPosts.length === 0 && existingPosts.length === 0) {
      logger.warn(
        { area },
        "No posts collected and no existing posts, skipping"
      );
      return;
    }

    // Merge new posts with existing posts (deduplicate by URL)
    const allPosts = this.mergePosts(existingPosts, newPosts);
    logger.debug(
      {
        area,
        existingCount: existingPosts.length,
        newCount: newPosts.length,
        totalCount: allPosts.length,
      },
      "Merged posts"
    );

    // Step 2: Analyze using OpenAI agent for this area with all accumulated posts
    logger.debug(
      { area, postCount: allPosts.length },
      "Step 2: Analyzing trends with all accumulated posts"
    );
    const areaPosts = { [area]: allPosts } as Record<Area, Post[]>;
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
    // The _isFallback flag is set by OpenAIAgentFactory when analysis fails
    const analysisFailed =
      (trend as { _isFallback?: boolean })._isFallback === true;
    if (analysisFailed) {
      const errorMsg = `AI analysis failed for area "${area}". The OpenAI agent could not generate a proper trend analysis. This usually means:
1. The OpenAI API returned an unexpected response structure
2. Network or API errors occurred
3. The response could not be parsed as valid JSON

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
      postsJson: JSON.stringify(allPosts, null, 2),
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

    // Step 1: Collect new posts
    logger.debug("Step 1: Collecting new posts for all areas");
    const newPostsByArea = await this.collectPostsUseCase.execute(AREAS);

    // Step 2: Load existing posts and merge with new posts
    logger.debug("Step 2: Loading existing posts and merging");
    const allPostsByArea: Record<Area, Post[]> = {} as Record<Area, Post[]>;
    for (const area of AREAS) {
      const existingPosts =
        (await this.githubRepository.loadPostsFromPR(week, yr, area)) || [];
      const newPosts = newPostsByArea[area] || [];
      allPostsByArea[area] = this.mergePosts(existingPosts, newPosts);
      logger.debug(
        {
          area,
          existingCount: existingPosts.length,
          newCount: newPosts.length,
          totalCount: allPostsByArea[area].length,
        },
        "Merged posts for area"
      );
    }

    // Step 3: Analyze using OpenAI agents with all accumulated posts
    logger.debug(
      "Step 3: Analyzing trends for all areas using OpenAI agents with accumulated posts"
    );
    const trends = await this.analyzeTrendsUseCase.execute(
      allPostsByArea,
      this.agents
    );

    // Step 4: Generate markdown and create PRs
    logger.debug("Step 4: Generating markdown files and creating PRs");
    for (const [area, trend] of Object.entries(trends) as [Area, Trend][]) {
      const markdown = this.markdownService.trendToMarkdown(trend, week, yr);
      const allPosts = allPostsByArea[area];

      const prData: PRData = {
        weekNumber: week,
        year: yr,
        area,
        trend,
        markdownContent: markdown,
        filename: `${area}.md`,
        postsJson: JSON.stringify(allPosts, null, 2),
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
