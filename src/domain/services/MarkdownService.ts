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
    for (const post of trend.referencePosts) {
      markdown += `### ${post.author}\n\n`;
      markdown += `${post.content.substring(0, 200)}${post.content.length > 200 ? "..." : ""}\n\n`;
      markdown += `- **Engagement:** ${post.engagement.likes} likes, ${post.engagement.comments} comments, ${post.engagement.shares} shares\n`;
      markdown += `- **Link:** [View Post](${post.url})\n\n`;
    }

    return markdown;
  }
}
