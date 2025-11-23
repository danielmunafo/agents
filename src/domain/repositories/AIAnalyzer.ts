import type { Post } from "../entities/Post.js";
import type { TrendAnalysis } from "../entities/Trend.js";

export interface Agent {
  analyze(posts: Post[]): Promise<TrendAnalysis>;

  generateText(prompt: string): Promise<string>;
}
