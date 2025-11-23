import { LoadWeeklySummariesUseCase } from "../../application/use-cases/LoadWeeklySummariesUseCase.js";
import { CreateRecommendationsUseCase } from "../../application/use-cases/CreateRecommendationsUseCase.js";
import { CreatePRUseCase } from "../../application/use-cases/CreatePRUseCase.js";
import { container } from "../../infrastructure/di/container.js";
import { logger } from "../../shared/utils/logger.js";
import type { PRData } from "../../domain/repositories/GitHubRepository.js";

export class MonthlyWorkflow {
  private readonly loadSummariesUseCase: LoadWeeklySummariesUseCase;
  private readonly createRecommendationsUseCase: CreateRecommendationsUseCase;
  private readonly createPRUseCase: CreatePRUseCase;

  constructor() {
    const githubRepository = container.getGitHubRepository();

    // Create a general-purpose Mastra agent for recommendations
    const recommendationsAgent = container.createGeneralAgent(
      "You are an expert analyst specializing in creating actionable recommendations for managers, engineers, and product owners based on tech trend analysis. Provide structured, practical recommendations with clear impacts and references."
    );

    this.loadSummariesUseCase = new LoadWeeklySummariesUseCase(
      githubRepository
    );
    this.createRecommendationsUseCase = new CreateRecommendationsUseCase(
      recommendationsAgent
    );
    this.createPRUseCase = new CreatePRUseCase(githubRepository);
  }

  async execute(year?: number, month?: number): Promise<void> {
    const now = new Date();
    const yr = year || now.getFullYear();
    const mth = month || now.getMonth() + 1;

    logger.info({ month: mth, year: yr }, "Starting monthly workflow");
    logger.debug("Reading weekly summaries from weekly PR branches");

    // Step 1: Load weekly summaries
    const weeklySummaries = await this.loadSummariesUseCase.execute(yr, mth);

    if (weeklySummaries.length === 0) {
      logger.warn(
        { month: mth, year: yr },
        "No weekly summaries found. Make sure weekly workflow has run and created summary PRs"
      );
      return;
    }

    logger.info(
      { count: weeklySummaries.length },
      "Loaded weekly summaries from PR branches"
    );

    // Step 2: Generate recommendations
    logger.debug("Step 2: Generating recommendations from weekly summaries");
    const recommendations = await this.createRecommendationsUseCase.execute(
      yr,
      mth,
      weeklySummaries
    );

    // Step 3: Create recommendations PR
    logger.debug("Step 3: Creating recommendations PR");
    const prData: PRData = {
      weekNumber: 0, // Not used for monthly
      year: yr,
      markdownContent: recommendations,
      filename: "Recommendations.md",
    };

    await this.createPRUseCase.execute("monthly", prData);
    logger.info("Monthly workflow completed");
  }
}
