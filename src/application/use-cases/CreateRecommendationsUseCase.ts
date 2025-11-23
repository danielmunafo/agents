import { logger } from "../../shared/utils/logger.js";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import type { WeeklySummary } from "./LoadWeeklySummariesUseCase.js";

export class CreateRecommendationsUseCase {
  constructor(private readonly agent: Agent) {}

  async execute(
    year: number,
    month: number,
    weeklySummaries: WeeklySummary[]
  ): Promise<string> {
    const summariesText = weeklySummaries
      .map(
        (s) =>
          `Week ${s.weekNumber}, ${s.year}:\n${s.summary.substring(0, 500)}...`
      )
      .join("\n\n");

    const prompt = `Based on the weekly tech trend summaries from ${month}/${year}, create actionable recommendations for:

1. Managers - strategic decisions, team investments, technology adoption
2. Engineers - skills to learn, tools to explore, practices to adopt
3. Product Owners - features to consider, market opportunities, user needs

Weekly Summaries:
${summariesText}

Provide structured recommendations with:
- Topics to study
- Impacts
- Reference to relevant trends and weeks

Format as markdown with clear sections.`;

    logger.debug("Generating recommendations from weekly summaries");

    try {
      return await this.agent.generateText(prompt);
    } catch (error) {
      logger.error({ error }, "Error generating recommendations");
      return "No recommendations generated.";
    }
  }
}
