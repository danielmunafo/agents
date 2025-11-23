import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedObject,
} from "vitest";
import { MonthlyWorkflow } from "./MonthlyWorkflow.js";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import type { GitHubRepository } from "../../domain/repositories/GitHubRepository.js";
import type { WeeklySummary } from "../../application/use-cases/LoadWeeklySummariesUseCase.js";

// Mock dependencies
vi.mock("../../infrastructure/di/container.js", () => ({
  container: {
    getGitHubRepository: vi.fn(),
    createGeneralAgent: vi.fn(),
  },
}));

vi.mock("../../application/use-cases/LoadWeeklySummariesUseCase.js");
vi.mock("../../application/use-cases/CreateRecommendationsUseCase.js");
vi.mock("../../application/use-cases/CreatePRUseCase.js");
vi.mock("../../shared/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { container } from "../../infrastructure/di/container.js";
import { LoadWeeklySummariesUseCase } from "../../application/use-cases/LoadWeeklySummariesUseCase.js";
import { CreateRecommendationsUseCase } from "../../application/use-cases/CreateRecommendationsUseCase.js";
import { CreatePRUseCase } from "../../application/use-cases/CreatePRUseCase.js";

describe("MonthlyWorkflow", () => {
  let mockGitHubRepository: GitHubRepository;
  let mockAgent: Agent;
  let mockLoadSummariesUseCase: MockedObject<LoadWeeklySummariesUseCase>;
  let mockCreateRecommendationsUseCase: MockedObject<CreateRecommendationsUseCase>;
  let mockCreatePRUseCase: MockedObject<CreatePRUseCase>;
  let workflow: MonthlyWorkflow;

  const mockWeeklySummary: WeeklySummary = {
    weekNumber: 1,
    year: 2024,
    summary: "# Weekly Summary\n\nContent",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock agent
    mockAgent = {
      analyze: vi.fn(),
      generateText: vi.fn().mockResolvedValue("Generated recommendations"),
    };

    // Mock container
    mockGitHubRepository = {
      createPR: vi.fn(),
      loadPostsFromPR: vi.fn(),
      loadTrendFromPR: vi.fn(),
      loadWeeklySummaryFromPR: vi.fn(),
    } as GitHubRepository;
    vi.mocked(container.getGitHubRepository).mockReturnValue(
      mockGitHubRepository
    );
    vi.mocked(container.createGeneralAgent).mockReturnValue(mockAgent);

    // Mock use cases
    mockLoadSummariesUseCase = {
      execute: vi.fn(),
    } as MockedObject<LoadWeeklySummariesUseCase>;

    mockCreateRecommendationsUseCase = {
      execute: vi.fn().mockResolvedValue("# Recommendations\n\nContent"),
    } as MockedObject<CreateRecommendationsUseCase>;

    mockCreatePRUseCase = {
      execute: vi.fn().mockResolvedValue("https://github.com/pr/123"),
    } as MockedObject<CreatePRUseCase>;

    // Replace use case constructors
    vi.mocked(LoadWeeklySummariesUseCase).mockImplementation(
      () => mockLoadSummariesUseCase
    );
    vi.mocked(CreateRecommendationsUseCase).mockImplementation(
      () => mockCreateRecommendationsUseCase
    );
    vi.mocked(CreatePRUseCase).mockImplementation(() => mockCreatePRUseCase);

    workflow = new MonthlyWorkflow();
  });

  describe("execute", () => {
    it("should execute monthly workflow successfully", async () => {
      // Arrange
      const year = 2024;
      const month = 1;

      vi.mocked(mockLoadSummariesUseCase.execute).mockResolvedValue([
        mockWeeklySummary,
        {
          ...mockWeeklySummary,
          weekNumber: 2,
          summary: "# Weekly Summary\n\nContent",
        },
      ]);

      // Act
      await workflow.execute(year, month);

      // Assert
      expect(mockLoadSummariesUseCase.execute).toHaveBeenCalledWith(
        year,
        month
      );
      expect(mockCreateRecommendationsUseCase.execute).toHaveBeenCalledWith(
        year,
        month,
        expect.any(Array)
      );
      expect(mockCreatePRUseCase.execute).toHaveBeenCalledWith("monthly", {
        weekNumber: 0,
        year,
        month,
        markdownContent: "# Recommendations\n\nContent",
        filename: "Recommendations.md",
      });
    });

    it("should skip execution when no weekly summaries are found", async () => {
      // Arrange
      const year = 2024;
      const month = 1;

      vi.mocked(mockLoadSummariesUseCase.execute).mockResolvedValue([]);

      // Act
      await workflow.execute(year, month);

      // Assert
      expect(mockLoadSummariesUseCase.execute).toHaveBeenCalled();
      expect(mockCreateRecommendationsUseCase.execute).not.toHaveBeenCalled();
      expect(mockCreatePRUseCase.execute).not.toHaveBeenCalled();
    });

    it("should use current month and year when not provided", async () => {
      // Arrange
      vi.mocked(mockLoadSummariesUseCase.execute).mockResolvedValue([
        mockWeeklySummary,
      ]);

      // Act
      await workflow.execute();

      // Assert
      expect(mockLoadSummariesUseCase.execute).toHaveBeenCalled();
      const callArgs = vi.mocked(mockLoadSummariesUseCase.execute).mock
        .calls[0];
      expect(callArgs[0]).toBeDefined(); // year
      expect(callArgs[1]).toBeDefined(); // month
      expect(callArgs[1]).toBeGreaterThanOrEqual(1);
      expect(callArgs[1]).toBeLessThanOrEqual(12);
    });

    it("should handle errors during recommendations creation", async () => {
      // Arrange
      const year = 2024;
      const month = 1;

      vi.mocked(mockLoadSummariesUseCase.execute).mockResolvedValue([
        mockWeeklySummary,
      ]);

      vi.mocked(mockCreateRecommendationsUseCase.execute).mockRejectedValue(
        new Error("Recommendations creation failed")
      );

      // Act & Assert
      await expect(workflow.execute(year, month)).rejects.toThrow(
        "Recommendations creation failed"
      );
    });

    it("should process multiple weekly summaries", async () => {
      // Arrange
      const year = 2024;
      const month = 1;

      const summaries = [
        mockWeeklySummary,
        { ...mockWeeklySummary, weekNumber: 2 },
        { ...mockWeeklySummary, weekNumber: 3 },
      ];

      vi.mocked(mockLoadSummariesUseCase.execute).mockResolvedValue(summaries);

      // Act
      await workflow.execute(year, month);

      // Assert
      expect(mockCreateRecommendationsUseCase.execute).toHaveBeenCalledWith(
        year,
        month,
        summaries
      );
    });
  });
});
