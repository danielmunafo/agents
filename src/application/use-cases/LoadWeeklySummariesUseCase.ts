import type { GitHubRepository } from "../../domain/repositories/GitHubRepository.js";
import { getWeek, getYear } from "date-fns";

export interface WeeklySummary {
  weekNumber: number;
  year: number;
  summary: string;
}

export class LoadWeeklySummariesUseCase {
  constructor(private readonly githubRepository: GitHubRepository) {}

  async execute(year: number, month: number): Promise<WeeklySummary[]> {
    const summaries: WeeklySummary[] = [];

    // Get all weeks in the month
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    // Calculate week numbers for the month
    const weeks = new Set<number>();
    for (
      let day = new Date(firstDay);
      day <= lastDay;
      day.setDate(day.getDate() + 1)
    ) {
      const weekInfo = this.getWeekInfo(day);
      weeks.add(weekInfo.weekNumber);
    }

    // Load summaries for each week
    for (const weekNumber of weeks) {
      const summary = await this.githubRepository.loadWeeklySummaryFromPR(
        weekNumber,
        year
      );
      if (summary) {
        summaries.push({ weekNumber, year, summary });
      }
    }

    return summaries;
  }

  private getWeekInfo(date: Date): { weekNumber: number; year: number } {
    const weekNumber = getWeek(date, {
      weekStartsOn: 0,
      firstWeekContainsDate: 1,
    });
    const year = getYear(date);
    return { weekNumber, year };
  }
}
