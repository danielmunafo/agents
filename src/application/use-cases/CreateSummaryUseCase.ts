import type { Trend } from "../../domain/entities/Trend.js";
import type { Area } from "../../domain/value-objects/Area.js";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import { getAreaSlug } from "../../domain/value-objects/Area.js";
import { logger } from "../../shared/utils/logger.js";

export class CreateSummaryUseCase {
  constructor(private readonly agent: Agent) {}

  async execute(
    weekNumber: number,
    year: number,
    trends: Record<Area, Trend>
  ): Promise<string> {
    // Calculate relevance scores and sort
    const sortedTrends = Object.entries(trends)
      .map(([area, trend]) => ({
        area,
        trend,
        relevanceScore: trend.relevanceScore,
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Create summary markdown
    let markdown = `# ${weekNumber} Trends Knowledge Base Summary\n\n`;
    markdown += `**Week:** ${weekNumber}, ${year}\n\n`;
    markdown += `This summary consolidates all tech trends analyzed during week ${weekNumber} of ${year}.\n\n`;

    markdown += `## Trends by Relevance\n\n`;

    for (const item of sortedTrends) {
      const { area, trend } = item;
      const areaSlug = getAreaSlug(area as Area);
      const prLink = `[${weekNumber}-${areaSlug}-trends](./${area}.md)`;

      markdown += `### ${area} (Relevance Score: ${trend.relevanceScore})\n\n`;
      markdown += `**PR:** ${prLink}\n\n`;
      markdown += `**Main Aspects:**\n`;
      for (const aspect of trend.mainAspects) {
        markdown += `- ${aspect}\n`;
      }
      markdown += `\n**Why Important:** ${trend.whyImportant}\n\n`;
      markdown += `---\n\n`;
    }

    // Use AI to enhance the summary
    const prompt = `Create a comprehensive executive summary of these tech trends for week ${weekNumber}:

${JSON.stringify(
  sortedTrends.map(({ area, trend }) => ({
    areaName: area,
    ...trend,
  })),
  null,
  2
)}

Provide a 2-3 paragraph executive summary that highlights the most important trends and their implications for the tech industry.`;

    try {
      // Use OpenAI agent for summary generation
      const summaryText = await this.agent.generateText(prompt);
      markdown += `## Executive Summary\n\n${summaryText}\n\n`;
    } catch (error) {
      logger.error({ error }, "Error generating executive summary");
      markdown += `## Executive Summary\n\n*Summary generation failed. Please refer to individual area trends above.*\n\n`;
    }

    return markdown;
  }
}
