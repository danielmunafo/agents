import type { Post } from "../entities/Post.js";
import type { Trend, TrendAnalysis } from "../entities/Trend.js";
import type { Area } from "../value-objects/Area.js";

export class TrendService {
  calculateRelevanceScore(posts: Post[]): number {
    if (posts.length === 0) return 0;

    const totalEngagement = posts.reduce((sum, post) => {
      return (
        sum +
        post.engagement.likes +
        post.engagement.comments * 2 + // Comments weighted more
        post.engagement.shares * 3 // Shares weighted most
      );
    }, 0);

    // Normalize by number of posts and scale
    return Math.round((totalEngagement / posts.length) * 10) / 10;
  }

  createTrend(area: Area, analysis: TrendAnalysis, posts: Post[]): Trend {
    const trend: Trend & { _isFallback?: boolean } = {
      area,
      mainAspects: analysis.mainAspects,
      whyImportant: analysis.whyImportant,
      toolsFrameworks: analysis.toolsFrameworks,
      suggestedActions: analysis.suggestedActions,
      referencePosts: posts.slice(0, 10), // Top 10 posts
      relevanceScore: this.calculateRelevanceScore(posts),
    };

    // Preserve fallback flag if present
    if (analysis._isFallback) {
      trend._isFallback = true;
    }

    return trend;
  }
}
