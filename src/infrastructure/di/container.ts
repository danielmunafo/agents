import { LinkedInScraperImpl } from "../scrapers/LinkedInScraperImpl.js";
import { GitHubRepositoryImpl } from "../github/GitHubRepositoryImpl.js";
import { agentFactory } from "../agents/MastraAgentFactory.js";
import type { LinkedInScraper } from "../../domain/repositories/LinkedInScraper.js";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import type { GitHubRepository } from "../../domain/repositories/GitHubRepository.js";
import type { Area } from "../../domain/value-objects/Area.js";

/**
 * Dependency Injection Container
 * Provides instances of infrastructure implementations
 */
export class Container {
  private linkedInScraper: LinkedInScraperImpl | null = null;
  private githubRepository: GitHubRepository | null = null;

  getLinkedInScraper(): LinkedInScraper {
    if (!this.linkedInScraper) {
      this.linkedInScraper = new LinkedInScraperImpl();
    }
    return this.linkedInScraper;
  }

  /**
   * Get a Mastra agent for a specific area
   */
  getAgent(area: Area): Agent {
    return agentFactory.getAgent(area);
  }

  /**
   * Get all agents
   */
  getAllAgents(): Map<Area, Agent> {
    return agentFactory.getAllAgents();
  }

  /**
   * Create a general-purpose agent with custom instructions
   */
  createGeneralAgent(instructions: string): Agent {
    return agentFactory.createGeneralAgent(instructions);
  }

  getGitHubRepository(): GitHubRepository {
    if (!this.githubRepository) {
      this.githubRepository = new GitHubRepositoryImpl();
    }
    return this.githubRepository;
  }

  async cleanup(): Promise<void> {
    if (this.linkedInScraper) {
      await this.linkedInScraper.close();
      this.linkedInScraper = null;
    }
  }
}

// Singleton instance
export const container = new Container();
