import type { Post } from "../entities/Post.js";
import type { TrendAnalysis } from "../entities/Trend.js";
import type { Area } from "../value-objects/Area.js";

export interface Agent {
  analyze(posts: Post[], area: Area): Promise<TrendAnalysis>;

  generateText(prompt: string): Promise<string>;
}
