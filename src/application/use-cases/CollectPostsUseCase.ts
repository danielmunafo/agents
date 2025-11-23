import type { Post } from "../../domain/entities/Post.js";
import type { Area } from "../../domain/value-objects/Area.js";
import type { LinkedInScraper } from "../../domain/repositories/LinkedInScraper.js";
import { logger } from "../../shared/utils/logger.js";

export class CollectPostsUseCase {
  constructor(private readonly linkedInScraper: LinkedInScraper) {}

  async execute(areas: Area[]): Promise<Record<Area, Post[]>> {
    const results: Record<Area, Post[]> = {} as Record<Area, Post[]>;

    for (const area of areas) {
      logger.debug({ area }, "Collecting posts");
      // If authentication fails, the scraper will throw an error
      // which will propagate up and fail the workflow immediately
      const posts = await this.linkedInScraper.searchPosts(area);
      results[area] = posts;
      logger.info({ area, count: posts.length }, "Collected posts");
    }

    return results;
  }
}
