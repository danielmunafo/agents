import type { Trend } from "../../domain/entities/Trend.js";
import type { Area } from "../../domain/value-objects/Area.js";
import type { GitHubRepository } from "../../domain/repositories/GitHubRepository.js";
import { logger } from "../../shared/utils/logger.js";

export class LoadTrendsFromPRUseCase {
  constructor(private readonly githubRepository: GitHubRepository) {}

  async execute(
    weekNumber: number,
    year: number,
    areas: Area[]
  ): Promise<Record<Area, Trend>> {
    const trends: Record<Area, Trend> = {} as Record<Area, Trend>;

    for (const area of areas) {
      const trend = await this.githubRepository.loadTrendFromPR(
        weekNumber,
        year,
        area
      );
      if (trend) {
        trends[area] = trend;
      } else {
        logger.warn({ area, weekNumber, year }, "No trend found in PR");
      }
    }

    return trends;
  }
}
