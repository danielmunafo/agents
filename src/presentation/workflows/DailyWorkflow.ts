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
    areaAgents.set(area, this.agents.get(area)!);
    const trends = await this.analyzeTrendsUseCase.execute(
      areaPosts,
      areaAgents
    );
    const trend = trends[area];

    // Step 3: Generate markdown
    logger.debug({ area }, "Step 3: Generating markdown");
    const markdown = this.markdownService.trendToMarkdown(trend, week, yr);

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
