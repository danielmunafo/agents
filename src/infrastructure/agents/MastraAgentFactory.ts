// Import Mastra Agent class
import { Agent as MastraAgent } from "@mastra/core/agent";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import type { Post } from "../../domain/entities/Post.js";
import type { TrendAnalysis } from "../../domain/entities/Trend.js";
import { Area } from "../../domain/value-objects/Area.js";
import { AREA_INSTRUCTIONS } from "../../application/config/areaInstructions.js";
import { env } from "../../shared/config/index.js";
import { logger } from "../../shared/utils/logger.js";

/**
 * Mastra agent implementation that wraps Mastra's Agent class
 */
class MastraAgentImpl implements Agent {
  private readonly agent: MastraAgent;

  constructor(
    private readonly area: Area,
    private readonly instructions: string
  ) {
    // Mastra expects model as a string in format 'provider/model-name'
    // The API key is read from OPENAI_API_KEY environment variable automatically
    const modelName = env.OPENAI_MODEL || "gpt-4";
    this.agent = new MastraAgent({
      name: `${this.area.toLowerCase().replace(/\s+/g, "-")}-analyzer`,
      instructions: this.instructions,
      model: `openai/${modelName}`,
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
      logger.debug(
        { area: this.area, postCount: posts.length },
        "Calling Mastra agent generate"
      );
      // Try AISDK format first as it's simpler and returns text directly
      let response: unknown;
      try {
        response = await this.agent.generate(prompt, { format: "aisdk" });
        logger.debug({ area: this.area }, "Using AISDK format response");
      } catch (aisdkError) {
        logger.debug(
          { area: this.area, error: aisdkError },
          "AISDK format failed, trying mastra format"
        );
        response = await this.agent.generate(prompt, { format: "mastra" });
      }

      // Extract text content from Mastra response
      let content: string = "";
      if (typeof response === "string") {
        content = response;
      } else {
        const responseObj = response as {
          text?: string | Promise<string>;
          getFullOutput?: () => Promise<{ text?: string }>;
          steps?: Array<{ text?: string; content?: unknown[] }>;
          messageList?: {
            getLastMessage?: () => {
              content?: string | Array<{ text?: string }>;
            };
            messages?: Array<{ content?: string | Array<{ text?: string }> }>;
          };
        };

        // Try to get text directly
        if (responseObj.text) {
          const textValue =
            typeof responseObj.text === "string"
              ? responseObj.text
              : await responseObj.text;
          if (
            textValue &&
            typeof textValue === "string" &&
            textValue.trim().length > 0
          ) {
            content = textValue;
          }
        }

        // If text is empty, try getFullOutput() method
        if (
          typeof content === "string" &&
          content.trim().length === 0 &&
          responseObj.getFullOutput
        ) {
          try {
            const fullOutput = await responseObj.getFullOutput();
            if (fullOutput?.text && fullOutput.text.trim().length > 0) {
              content = fullOutput.text;
            }
          } catch (error) {
            logger.debug({ area: this.area, error }, "getFullOutput() failed");
          }
        }

        // If text is empty, try messageList
        if (
          typeof content === "string" &&
          content.trim().length === 0 &&
          responseObj.messageList
        ) {
          try {
            const lastMessage = responseObj.messageList.getLastMessage?.();
            if (lastMessage?.content) {
              if (typeof lastMessage.content === "string") {
                content = lastMessage.content;
              } else if (Array.isArray(lastMessage.content)) {
                const texts = lastMessage.content
                  .map((item) =>
                    typeof item === "object" && item?.text ? item.text : ""
                  )
                  .filter((t) => t.trim().length > 0);
                if (texts.length > 0) {
                  content = texts.join("\n");
                }
              }
            } else if (
              responseObj.messageList.messages &&
              responseObj.messageList.messages.length > 0
            ) {
              const lastMsg =
                responseObj.messageList.messages[
                  responseObj.messageList.messages.length - 1
                ];
              if (lastMsg?.content) {
                if (typeof lastMsg.content === "string") {
                  content = lastMsg.content;
                } else if (Array.isArray(lastMsg.content)) {
                  const texts = lastMsg.content
                    .map((item) =>
                      typeof item === "object" && item?.text ? item.text : ""
                    )
                    .filter((t) => t.trim().length > 0);
                  if (texts.length > 0) {
                    content = texts.join("\n");
                  }
                }
              }
            }
          } catch (error) {
            logger.debug(
              { area: this.area, error },
              "Failed to extract from messageList"
            );
          }
        }

        // If still empty, try extracting from steps array
        if (
          typeof content === "string" &&
          content.trim().length === 0 &&
          responseObj.steps
        ) {
          const stepTexts = responseObj.steps
            .map((step) => {
              if (step.text && step.text.trim().length > 0) {
                return step.text;
              }
              // Try to extract from content array if it exists
              if (step.content && Array.isArray(step.content)) {
                return step.content
                  .map((item: unknown) => {
                    if (typeof item === "string") return item;
                    if (item && typeof item === "object" && "text" in item) {
                      return (item as { text?: string }).text || "";
                    }
                    return "";
                  })
                  .filter((t: string) => t.trim().length > 0)
                  .join("\n");
              }
              return "";
            })
            .filter((t: string) => t.trim().length > 0);

          if (stepTexts.length > 0) {
            content = stepTexts.join("\n");
          }
        }

        // Last resort: try other fields or stringify
        if (typeof content === "string" && content.trim().length === 0) {
          const responseContent = (response as { content?: unknown })?.content;
          const responseOutput = (response as { output?: unknown })?.output;

          // Ensure we convert to string
          if (typeof responseContent === "string") {
            content = responseContent;
          } else if (typeof responseOutput === "string") {
            content = responseOutput;
          } else {
            content = "";
          }

          // If still empty, log the full response structure for debugging
          if (
            !content ||
            (typeof content === "string" && content.trim().length === 0)
          ) {
            logger.warn(
              {
                area: this.area,
                responseKeys: Object.keys(response as object),
                responseType: typeof response,
              },
              "Could not extract text from Mastra response, response structure may have changed"
            );
            // Stringify as last resort, but this won't be parseable JSON
            content = JSON.stringify(response);
          }
        }
      }

      // Ensure content is always a string
      if (typeof content !== "string") {
        content =
          typeof content === "object"
            ? JSON.stringify(content)
            : String(content || "");
      }

      // If content is still empty or just JSON structure, log full response for debugging
      if (
        !content ||
        content.trim().length === 0 ||
        content.startsWith('{"text":""')
      ) {
        logger.warn(
          {
            area: this.area,
            contentLength: content.length,
            contentPreview: content.substring(0, 500),
            responseType: typeof response,
            responseKeys:
              typeof response === "object"
                ? Object.keys(response as object)
                : [],
          },
          "Mastra response appears empty or malformed, trying alternative extraction"
        );

        // Try using AISDK format instead
        try {
          const aisdkResponse: unknown = await this.agent.generate(prompt, {
            format: "aisdk",
          });
          if (typeof aisdkResponse === "string") {
            const aisdkText = aisdkResponse.trim();
            if (aisdkText.length > 0) {
              content = aisdkResponse;
            }
          } else if (aisdkResponse && typeof aisdkResponse === "object") {
            const aisdkObj = aisdkResponse as {
              text?: string | Promise<string>;
            };
            if (aisdkObj.text) {
              const aisdkText =
                typeof aisdkObj.text === "string"
                  ? aisdkObj.text
                  : await aisdkObj.text;
              if (
                aisdkText &&
                typeof aisdkText === "string" &&
                aisdkText.trim().length > 0
              ) {
                content = aisdkText;
              }
            }
          }
          // Ensure content is still a string after AISDK attempt
          if (typeof content !== "string") {
            content =
              typeof content === "object"
                ? JSON.stringify(content)
                : String(content || "");
          }
          logger.debug(
            { area: this.area, aisdkContentLength: content.length },
            "Tried AISDK format"
          );
        } catch (aisdkError) {
          logger.debug(
            { area: this.area, error: aisdkError },
            "AISDK format also failed"
          );
        }
      }

      // Ensure content is a string before logging or parsing
      if (typeof content !== "string") {
        content =
          typeof content === "object"
            ? JSON.stringify(content)
            : String(content || "");
      }

      logger.debug(
        {
          area: this.area,
          contentLength: content.length,
          contentPreview: content.substring(0, 300),
        },
        "Received response from Mastra agent"
      );

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
          logger.warn(
            { area: this.area, contentPreview: content.substring(0, 500) },
            "Could not parse JSON from response, using fallback"
          );
          throw new Error("Could not parse JSON from response");
        }
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
      logger.error(
        { area: this.area, error: errorMessage, postCount: posts.length },
        "Error analyzing area with Mastra agent, using fallback"
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
      const response = await this.agent.generate(prompt, { format: "mastra" });
      // Extract text content from Mastra response (text is a Promise<string>)
      if (typeof response === "string") {
        return response;
      }
      const text = (response as { text?: Promise<string> | string })?.text;
      if (text) {
        return typeof text === "string" ? text : await text;
      }
      return (
        (response as { content?: string })?.content ||
        (response as { output?: string })?.output ||
        JSON.stringify(response)
      );
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
