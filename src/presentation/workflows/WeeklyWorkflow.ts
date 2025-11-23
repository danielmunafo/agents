import { AREAS } from "../../domain/value-objects/Area.js";
import { getPreviousWeek } from "../../shared/utils/weekCalculator.js";
import { LoadTrendsFromPRUseCase } from "../../application/use-cases/LoadTrendsFromPRUseCase.js";
import { CreateSummaryUseCase } from "../../application/use-cases/CreateSummaryUseCase.js";
import { CreatePRUseCase } from "../../application/use-cases/CreatePRUseCase.js";
import { container } from "../../infrastructure/di/container.js";
import { logger } from "../../shared/utils/logger.js";
import type { PRData } from "../../domain/repositories/GitHubRepository.js";

export class WeeklyWorkflow {
  private readonly loadTrendsUseCase: LoadTrendsFromPRUseCase;
  private readonly createSummaryUseCase: CreateSummaryUseCase;
  private readonly createPRUseCase: CreatePRUseCase;

  constructor() {
    const githubRepository = container.getGitHubRepository();

    // Create a general-purpose OpenAI agent for summaries
    const summaryAgent = container.createGeneralAgent(
      "You are an expert analyst specializing in creating executive summaries of tech trends. Create comprehensive, well-structured summaries that highlight the most important trends and their implications."
    );

    this.loadTrendsUseCase = new LoadTrendsFromPRUseCase(githubRepository);
    this.createSummaryUseCase = new CreateSummaryUseCase(summaryAgent);
    this.createPRUseCase = new CreatePRUseCase(githubRepository);
  }

  async execute(weekNumber?: number, year?: number): Promise<void> {
    // If weekNumber and year are provided, use them
    // Otherwise, use previous week (for scheduled runs on Sunday, we summarize the completed week)
    const weekInfo =
      weekNumber && year ? { weekNumber, year } : getPreviousWeek();
    const { weekNumber: week, year: yr } = weekInfo;

    logger.info({ week, year: yr }, "Starting weekly workflow");
    logger.debug("Reading trends from daily PR branches");

    // Step 1: Load trends from daily PRs
    const trends = await this.loadTrendsUseCase.execute(week, yr, AREAS);

    if (Object.keys(trends).length === 0) {
      logger.warn(
        { week, year: yr },
        "No trends found. Make sure daily workflow has run and created PRs"
      );
      return;
    }

    logger.info(
      { count: Object.keys(trends).length },
      "Loaded trends from daily PR branches"
    );

    // Step 2: Create summary
    logger.debug("Step 2: Creating summary from daily trends");
    const summary = await this.createSummaryUseCase.execute(week, yr, trends);

    // Step 3: Create summary PR
    logger.debug("Step 3: Creating summary PR");
    const prData: PRData = {
      weekNumber: week,
      year: yr,
      markdownContent: summary,
      filename: "Summary.md",
    };

    await this.createPRUseCase.execute("summary", prData);
    logger.info("Weekly workflow completed");
  }
}
