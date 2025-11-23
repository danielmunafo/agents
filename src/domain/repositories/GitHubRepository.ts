import type { Post } from "../entities/Post.js";
import type { Trend } from "../entities/Trend.js";
import type { Area } from "../value-objects/Area.js";

export interface PRData {
  weekNumber: number;
  year: number;
  area?: Area;
  trend?: Trend;
  summary?: string;
  markdownContent: string;
  filename: string;
  postsJson?: string;
  trendJson?: string;
}

export interface GitHubRepository {
  createPR(type: "area" | "summary" | "monthly", data: PRData): Promise<string>;
  loadPostsFromPR(
    weekNumber: number,
    year: number,
    area: Area
  ): Promise<Post[] | null>;
  loadTrendFromPR(
    weekNumber: number,
    year: number,
    area: Area
  ): Promise<Trend | null>;
  loadWeeklySummaryFromPR(
    weekNumber: number,
    year: number
  ): Promise<string | null>;
}
