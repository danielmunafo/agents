// Try different import patterns for Mastra
// @ts-expect-error - Mastra does not provide TypeScript types, and the API may vary between versions
import { createAgent } from "@mastra/core";
// @ts-expect-error - Mastra provider import may vary and lacks TypeScript types
import { openai } from "@mastra/core/providers/openai";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import type { Post } from "../../domain/entities/Post.js";
import type { TrendAnalysis } from "../../domain/entities/Trend.js";
import { Area } from "../../domain/value-objects/Area.js";
import { AREA_INSTRUCTIONS } from "../../application/config/areaInstructions.js";
import { env } from "../../shared/config/index.js";
import { logger } from "../../shared/utils/logger.js";

/**
 * Mastra agent implementation that wraps Mastra's createAgent
 */
class MastraAgentImpl implements Agent {
  private readonly agent: ReturnType<typeof createAgent>;

  constructor(
    private readonly area: Area,
    private readonly instructions: string
  ) {
    this.agent = createAgent({
      name: `${this.area.toLowerCase().replace(/\s+/g, "-")}-analyzer`,
      instructions: this.instructions,
      model: openai("gpt-4"),
      providerApiKey: env.OPENAI_API_KEY,
    });
  }

  async analyze(posts: Post[]): Promise<TrendAnalysis> {
    // Format posts for analysis
    const postsText = posts
      .map(
        (post, idx) => `
Post ${idx + 1}:
Author: ${post.author}
Content: ${post.content.substring(0, 500)}
Engagement: ${post.engagement.likes} likes, ${post.engagement.comments} comments, ${post.engagement.shares} shares
URL: ${post.url}
`
      )
      .join("\n");

    const prompt = `Analyze these LinkedIn posts about ${this.area}:

${postsText}

Provide a JSON response with:
- mainAspects: array of main trend aspects (at least 3)
- whyImportant: explanation of why these trends became important (2-3 sentences)
- toolsFrameworks: array of relevant tools/frameworks mentioned
- suggestedActions: array of actionable recommendations for engineers (at least 3)`;

    try {
      const response =
        (await this.agent.generate?.(prompt)) ||
        (await this.agent.run?.(prompt)) ||
        (await this.agent.execute?.(prompt));
      const content =
        typeof response === "string"
          ? response
          : response?.text ||
            response?.content ||
            response?.output ||
            JSON.stringify(response);

      // Try to parse as JSON, fallback to text extraction
      let parsed: TrendAnalysis;
      try {
        parsed = JSON.parse(content) as TrendAnalysis;
      } catch {
        // If not JSON, try to extract JSON from markdown code blocks
        const jsonMatch =
          content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) ||
          content.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]) as TrendAnalysis;
        } else {
          throw new Error("Could not parse JSON from response");
        }
      }

      return parsed;
    } catch (error) {
      logger.error(
        { area: this.area, error },
        "Error analyzing area with Mastra agent"
      );
      // Return fallback structure
      return {
        mainAspects: [`Trends in ${this.area} based on ${posts.length} posts`],
        whyImportant: "Analysis failed. Please review posts manually.",
        toolsFrameworks: [],
        suggestedActions: ["Review the collected posts for this area"],
      };
    }
  }

  async generateText(prompt: string): Promise<string> {
    try {
      const response =
        (await this.agent.generate?.(prompt)) ||
        (await this.agent.run?.(prompt)) ||
        (await this.agent.execute?.(prompt));
      return typeof response === "string"
        ? response
        : response?.text ||
            response?.content ||
            response?.output ||
            JSON.stringify(response);
    } catch (error) {
      logger.error(
        { area: this.area, error },
        "Error generating text with Mastra agent"
      );
      throw error;
    }
  }
}

/**
 * Factory for creating Mastra agents for each area
 */
export class MastraAgentFactory {
  private readonly agents: Map<Area, Agent> = new Map();

  /**
   * Get or create an agent for a specific area
   */
  getAgent(area: Area): Agent {
    if (!this.agents.has(area)) {
      const instructions = AREA_INSTRUCTIONS[area];
      const agent = new MastraAgentImpl(area, instructions);
      this.agents.set(area, agent);
      logger.debug({ area }, "Created Mastra agent");
    }
    return this.agents.get(area)!;
  }

  /**
   * Get all agents for all areas
   */
  getAllAgents(): Map<Area, Agent> {
    return new Map(this.agents);
  }

  /**
   * Create a general-purpose agent (for summaries, recommendations, etc.)
   */
  createGeneralAgent(instructions: string): Agent {
    // Create a temporary area-specific agent with custom instructions
    const tempArea = Area.GENERAL_IT;
    return new MastraAgentImpl(tempArea, instructions);
  }
}

// Singleton instance
export const agentFactory = new MastraAgentFactory();
