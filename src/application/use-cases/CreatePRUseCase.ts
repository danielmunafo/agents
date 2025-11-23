import type {
  GitHubRepository,
  PRData,
} from "../../domain/repositories/GitHubRepository.js";
import { logger } from "../../shared/utils/logger.js";

export class CreatePRUseCase {
  constructor(private readonly githubRepository: GitHubRepository) {}

  async execute(
    type: "area" | "summary" | "monthly",
    data: PRData
  ): Promise<string> {
    try {
      const prUrl = await this.githubRepository.createPR(type, data);
      logger.info({ type, prUrl }, "Created PR");
      return prUrl;
    } catch (error) {
      logger.error({ type, error }, "Failed to create PR");
      throw error;
    }
  }
}
