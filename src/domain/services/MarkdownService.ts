import type { Trend } from "../entities/Trend.js";

export class MarkdownService {
  trendToMarkdown(trend: Trend, weekNumber: number, year: number): string {
    let markdown = `# ${trend.area} Trends - Week ${weekNumber}, ${year}\n\n`;

    markdown += `## Main Aspects\n\n`;
    for (const aspect of trend.mainAspects) {
      markdown += `- ${aspect}\n`;
    }
    markdown += `\n`;

    markdown += `## Why It Became Important\n\n`;
    markdown += `${trend.whyImportant}\n\n`;

    markdown += `## Tools & Frameworks\n\n`;
    for (const tool of trend.toolsFrameworks) {
      markdown += `- ${tool}\n`;
    }
    markdown += `\n`;

    markdown += `## Suggested Actions for Engineers\n\n`;
    for (const action of trend.suggestedActions) {
      markdown += `- ${action}\n`;
    }
    markdown += `\n`;

    markdown += `## Reference Posts\n\n`;
    markdown += `**Relevance Score:** ${trend.relevanceScore}\n\n`;
    for (let i = 0; i < trend.referencePosts.length; i++) {
      const post = trend.referencePosts[i];

      // Generate a meaningful title - use author if available, otherwise use content preview
      let postTitle: string;
      if (post.author && post.author !== "Unknown") {
        postTitle = post.author;
      } else {
        // Use first meaningful part of content as title
        const contentPreview =
          post.content
            .trim()
            .split(/\n|\.|!|\?/)
            .find((line) => line.trim().length > 20) ||
          post.content.substring(0, 60);
        postTitle =
          contentPreview.trim() +
          (contentPreview.length < post.content.length ? "..." : "");
      }

      markdown += `### ${postTitle}\n\n`;
      markdown += `${post.content.substring(0, 200)}${post.content.length > 200 ? "..." : ""}\n\n`;

      // Only show author if it's not "Unknown"
      if (post.author && post.author !== "Unknown") {
        markdown += `- **Author:** ${post.author}\n`;
      }

      markdown += `- **Engagement:** ${post.engagement.likes} likes, ${post.engagement.comments} comments, ${post.engagement.shares} shares\n`;
      markdown += `- **Link:** [View Post](${post.url})\n\n`;
    }

    return markdown;
  }
}
