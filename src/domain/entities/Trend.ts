import type { Post } from "./Post.js";
import type { Area } from "../value-objects/Area.js";

export interface Trend {
  area: Area;
  mainAspects: string[];
  whyImportant: string;
  toolsFrameworks: string[];
  suggestedActions: string[];
  referencePosts: Post[];
  relevanceScore: number; // Calculated from engagement + impact
}

export interface TrendAnalysis {
  mainAspects: string[];
  whyImportant: string;
  toolsFrameworks: string[];
  suggestedActions: string[];
}
