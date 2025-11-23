import type { Post } from "../entities/Post.js";
import type { Area } from "../value-objects/Area.js";

export interface LinkedInScraper {
  searchPosts(area: Area, maxPosts?: number): Promise<Post[]>;
}
