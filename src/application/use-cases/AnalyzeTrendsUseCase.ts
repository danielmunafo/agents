import type { Post } from "../../domain/entities/Post.js";
import type { Trend } from "../../domain/entities/Trend.js";
import type { Area } from "../../domain/value-objects/Area.js";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import { TrendService } from "../../domain/services/TrendService.js";
import { logger } from "../../shared/utils/logger.js";

export class AnalyzeTrendsUseCase {
  private readonly trendService = new TrendService();

  /**
   * Analyze trends using Mastra agents
   * @param postsByArea Posts organized by area
   * @param agents Optional map of agents per area. If not provided, agents will be fetched from container
   */
  async execute(
    postsByArea: Record<Area, Post[]>,
    agents?: Map<Area, Agent>
  ): Promise<Record<Area, Trend>> {
    const trends: Record<Area, Trend> = {} as Record<Area, Trend>;

    for (const [area, posts] of Object.entries(postsByArea) as [
      Area,
      Post[],
    ][]) {
      logger.debug({ area, postCount: posts.length }, "Analyzing area");

      // Get agent for this area
      const agent = agents?.get(area);
      if (!agent) {
        throw new Error(`No agent provided for area: ${area}`);
      }

      const analysis = await agent.analyze(posts, area);
      const trend = this.trendService.createTrend(area, analysis, posts);

      trends[area] = trend;
    }

    return trends;
  }
}
