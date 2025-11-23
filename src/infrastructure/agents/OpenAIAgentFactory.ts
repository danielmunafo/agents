import OpenAI from "openai";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import type { Post } from "../../domain/entities/Post.js";
import type { TrendAnalysis } from "../../domain/entities/Trend.js";
import { Area } from "../../domain/value-objects/Area.js";
import { AREA_INSTRUCTIONS } from "../../application/config/areaInstructions.js";
import { env } from "../../shared/config/index.js";
import { logger } from "../../shared/utils/logger.js";

/**
 * OpenAI agent implementation that uses OpenAI's API directly
 */
class OpenAIAgentImpl implements Agent {
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly systemPrompt: string;

  constructor(
    private readonly area: Area,
    private readonly instructions: string
  ) {
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    // Default to gpt-4o-mini: cheapest model with excellent rate limits
    // 200,000 TPM, 500 RPM, 10,000 RPD, 2,000,000 TPD
    // Typically cheaper than gpt-3.5-turbo with same/better capabilities
    this.model = env.OPENAI_MODEL || "gpt-4o-mini";

    // Create system prompt with area-specific instructions
    this.systemPrompt = `You are an expert analyst specializing in ${this.area} trends. ${this.instructions}

When analyzing LinkedIn posts, provide a JSON response with the following structure:
- mainAspects: array of main trend aspects (at least 3)
- whyImportant: explanation of why these trends became important (2-3 sentences)
- toolsFrameworks: array of relevant tools/frameworks mentioned
- suggestedActions: array of actionable recommendations for engineers (at least 3)

Always respond with valid JSON only, no markdown code blocks or additional text.`;
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

    const userPrompt = `Analyze these LinkedIn posts about ${this.area}:

${postsText}

Provide a JSON response with:
- mainAspects: array of main trend aspects (at least 3)
- whyImportant: explanation of why these trends became important (2-3 sentences)
- toolsFrameworks: array of relevant tools/frameworks mentioned
- suggestedActions: array of actionable recommendations for engineers (at least 3)`;

    try {
      logger.debug(
        { area: this.area, postCount: posts.length, model: this.model },
        "Calling OpenAI API for analysis"
      );

      // Try with JSON mode first (supported by newer models)
      // If it fails, fall back to regular mode
      let response;
      try {
        response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: "system",
              content: this.systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        });
      } catch (jsonModeError) {
        const jsonErrorMsg =
          jsonModeError instanceof Error
            ? jsonModeError.message
            : String(jsonModeError);

        // Check if it's a critical error (quota, auth, rate limit)
        const isCriticalError =
          jsonErrorMsg.includes("quota") ||
          jsonErrorMsg.includes("insufficient_quota") ||
          jsonErrorMsg.includes("429") ||
          jsonErrorMsg.includes("401") ||
          jsonErrorMsg.includes("authentication") ||
          jsonErrorMsg.includes("Invalid API key") ||
          jsonErrorMsg.includes("rate_limit");

        if (isCriticalError) {
          // Re-throw critical errors immediately - don't try fallback
          throw jsonModeError;
        }

        // Fallback for models that don't support JSON mode (non-critical errors)
        logger.debug(
          { area: this.area, model: this.model, error: jsonErrorMsg },
          "JSON mode not supported, falling back to regular mode"
        );
        response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: "system",
              content: this.systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0.7,
        });
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI API returned empty response");
      }

      logger.debug(
        {
          area: this.area,
          contentLength: content.length,
          contentPreview: content.substring(0, 300),
        },
        "Received response from OpenAI"
      );

      // Parse JSON response
      let parsed: TrendAnalysis;
      try {
        parsed = JSON.parse(content) as TrendAnalysis;
      } catch (parseError) {
        const errorMessage =
          parseError instanceof Error ? parseError.message : String(parseError);
        // If not JSON, try to extract JSON from markdown code blocks
        const jsonMatch =
          content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) ||
          content.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]) as TrendAnalysis;
        } else {
          logger.warn(
            { area: this.area, contentPreview: content.substring(0, 500) },
            "Could not parse JSON from response, using fallback"
          );
          throw new Error("Could not parse JSON from response", {
            cause: parseError,
          });
        }
        throw new Error("Could not parse JSON from response", {
          cause: errorMessage,
        });
      }

      // Validate parsed response has required fields
      if (!parsed.mainAspects || !Array.isArray(parsed.mainAspects)) {
        logger.warn(
          {
            area: this.area,
            parsed,
            contentPreview: content.substring(0, 500),
          },
          "Parsed response missing mainAspects, using fallback"
        );
        throw new Error("Parsed response missing required fields: mainAspects");
      }
      if (
        !parsed.whyImportant ||
        typeof parsed.whyImportant !== "string" ||
        parsed.whyImportant.trim().length === 0
      ) {
        logger.warn(
          { area: this.area, parsed },
          "Parsed response missing whyImportant, using fallback"
        );
        throw new Error(
          "Parsed response missing required fields: whyImportant"
        );
      }

      // Ensure arrays exist (even if empty)
      if (!parsed.toolsFrameworks || !Array.isArray(parsed.toolsFrameworks)) {
        logger.debug(
          { area: this.area },
          "Setting empty toolsFrameworks array"
        );
        parsed.toolsFrameworks = [];
      }
      if (!parsed.suggestedActions || !Array.isArray(parsed.suggestedActions)) {
        logger.debug(
          { area: this.area },
          "Setting empty suggestedActions array"
        );
        parsed.suggestedActions = [];
      }

      logger.debug(
        {
          area: this.area,
          mainAspects: parsed.mainAspects?.length,
          hasWhyImportant: !!parsed.whyImportant,
          toolsFrameworks: parsed.toolsFrameworks?.length,
          suggestedActions: parsed.suggestedActions?.length,
        },
        "Successfully parsed trend analysis"
      );

      return parsed;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check for critical errors that should stop the workflow
      const isQuotaError =
        errorMessage.includes("quota") ||
        errorMessage.includes("insufficient_quota") ||
        errorMessage.includes("429");
      const isAuthError =
        errorMessage.includes("401") ||
        errorMessage.includes("authentication") ||
        errorMessage.includes("Invalid API key");
      const isRateLimitError =
        errorMessage.includes("rate_limit") || errorMessage.includes("429");

      if (isQuotaError || isAuthError || isRateLimitError) {
        logger.error(
          {
            area: this.area,
            error: errorMessage,
            postCount: posts.length,
            errorType: isQuotaError
              ? "quota"
              : isAuthError
                ? "authentication"
                : "rate_limit",
          },
          "Critical OpenAI API error - stopping workflow"
        );
        // Throw error to stop the workflow completely
        throw new Error(
          `OpenAI API error: ${errorMessage}. This is a critical error (${isQuotaError ? "quota exceeded" : isAuthError ? "authentication failed" : "rate limit exceeded"}) that prevents analysis. Please check your OpenAI API key, billing, and quota.`
        );
      }

      // For other errors, log and use fallback
      logger.error(
        { area: this.area, error: errorMessage, postCount: posts.length },
        "Error analyzing area with OpenAI, using fallback"
      );
      // Return fallback structure with flag
      return {
        mainAspects: [
          `Trends in ${this.area} based on ${posts.length} posts`,
          "Analysis incomplete - manual review recommended",
          "Check collected posts for key insights",
        ],
        whyImportant: `Analysis failed for ${this.area}. Please review the ${posts.length} collected posts manually to identify trends and their importance.`,
        toolsFrameworks: [],
        suggestedActions: [
          "Review the collected posts for this area",
          "Manually identify key trends and tools",
          "Update the trend analysis based on post content",
        ],
        _isFallback: true, // Mark as fallback
      };
    }
  }

  async generateText(prompt: string): Promise<string> {
    try {
      logger.debug(
        { area: this.area, model: this.model },
        "Calling OpenAI API for text generation"
      );

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: this.systemPrompt,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI API returned empty response");
      }

      return content;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check for critical errors that should stop the workflow
      const isQuotaError =
        errorMessage.includes("quota") ||
        errorMessage.includes("insufficient_quota") ||
        errorMessage.includes("429");
      const isAuthError =
        errorMessage.includes("401") ||
        errorMessage.includes("authentication") ||
        errorMessage.includes("Invalid API key");
      const isRateLimitError =
        errorMessage.includes("rate_limit") || errorMessage.includes("429");

      if (isQuotaError || isAuthError || isRateLimitError) {
        logger.error(
          {
            area: this.area,
            error: errorMessage,
            errorType: isQuotaError
              ? "quota"
              : isAuthError
                ? "authentication"
                : "rate_limit",
          },
          "Critical OpenAI API error - stopping workflow"
        );
        // Throw error to stop the workflow completely
        throw new Error(
          `OpenAI API error: ${errorMessage}. This is a critical error (${isQuotaError ? "quota exceeded" : isAuthError ? "authentication failed" : "rate limit exceeded"}) that prevents text generation. Please check your OpenAI API key, billing, and quota.`
        );
      }

      logger.error(
        { area: this.area, error: errorMessage },
        "Error generating text with OpenAI"
      );
      throw error;
    }
  }
}

/**
 * Factory for creating OpenAI agents for each area
 */
export class OpenAIAgentFactory {
  private readonly agents: Map<Area, Agent> = new Map();

  /**
   * Get or create an agent for a specific area
   */
  getAgent(area: Area): Agent {
    if (!this.agents.has(area)) {
      const instructions = AREA_INSTRUCTIONS[area];
      const agent = new OpenAIAgentImpl(area, instructions);
      this.agents.set(area, agent);
      logger.debug({ area }, "Created OpenAI agent");
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
    return new OpenAIAgentImpl(tempArea, instructions);
  }
}

// Singleton instance
export const agentFactory = new OpenAIAgentFactory();
