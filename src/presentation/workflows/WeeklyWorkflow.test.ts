import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedObject,
} from "vitest";
import { WeeklyWorkflow } from "./WeeklyWorkflow.js";
import { Area } from "../../domain/value-objects/Area.js";
import type { Trend } from "../../domain/entities/Trend.js";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import type { GitHubRepository } from "../../domain/repositories/GitHubRepository.js";

// Mock dependencies
vi.mock("../../infrastructure/di/container.js", () => ({
  container: {
    getGitHubRepository: vi.fn(),
    createGeneralAgent: vi.fn(),
  },
}));

vi.mock("../../application/use-cases/LoadTrendsFromPRUseCase.js");
vi.mock("../../application/use-cases/CreateSummaryUseCase.js");
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
import { LoadTrendsFromPRUseCase } from "../../application/use-cases/LoadTrendsFromPRUseCase.js";
import { CreateSummaryUseCase } from "../../application/use-cases/CreateSummaryUseCase.js";
import { CreatePRUseCase } from "../../application/use-cases/CreatePRUseCase.js";

describe("WeeklyWorkflow", () => {
  let mockGitHubRepository: GitHubRepository;
  let mockAgent: Agent;
  let mockLoadTrendsUseCase: MockedObject<LoadTrendsFromPRUseCase>;
  let mockCreateSummaryUseCase: MockedObject<CreateSummaryUseCase>;
  let mockCreatePRUseCase: MockedObject<CreatePRUseCase>;
  let workflow: WeeklyWorkflow;

  const mockTrend: Trend = {
    area: Area.BACKEND,
    mainAspects: ["Microservices", "API Design"],
    whyImportant: "Important trends",
    toolsFrameworks: ["Node.js"],
    suggestedActions: ["Learn patterns"],
    referencePosts: [],
    relevanceScore: 8.5,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock agent
    mockAgent = {
      analyze: vi.fn(),
      generateText: vi.fn().mockResolvedValue("Generated summary text"),
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
    mockLoadTrendsUseCase = {
      execute: vi.fn(),
    } as MockedObject<LoadTrendsFromPRUseCase>;

    mockCreateSummaryUseCase = {
      execute: vi.fn().mockResolvedValue("# Weekly Summary\n\nContent"),
    } as MockedObject<CreateSummaryUseCase>;

    mockCreatePRUseCase = {
      execute: vi.fn().mockResolvedValue("https://github.com/pr/123"),
    } as MockedObject<CreatePRUseCase>;

    // Replace use case constructors
    vi.mocked(LoadTrendsFromPRUseCase).mockImplementation(
      () => mockLoadTrendsUseCase
    );
    vi.mocked(CreateSummaryUseCase).mockImplementation(
      () => mockCreateSummaryUseCase
    );
    vi.mocked(CreatePRUseCase).mockImplementation(() => mockCreatePRUseCase);

    workflow = new WeeklyWorkflow();
  });

  describe("execute", () => {
    it("should execute weekly workflow successfully", async () => {
      // Arrange
      const weekNumber = 1;
      const year = 2024;

      vi.mocked(mockLoadTrendsUseCase.execute).mockResolvedValue({
        [Area.BACKEND]: mockTrend,
        [Area.FRONTEND]: { ...mockTrend, area: Area.FRONTEND },
      } as Record<Area, Trend>);

      // Act
      await workflow.execute(weekNumber, year);

      // Assert
      expect(mockLoadTrendsUseCase.execute).toHaveBeenCalledWith(
        weekNumber,
        year,
        expect.any(Array)
      );
      expect(mockCreateSummaryUseCase.execute).toHaveBeenCalledWith(
        weekNumber,
        year,
        expect.any(Object)
      );
      expect(mockCreatePRUseCase.execute).toHaveBeenCalledWith("summary", {
        weekNumber,
        year,
        markdownContent: "# Weekly Summary\n\nContent",
        filename: "Summary.md",
      });
    });

    it("should skip execution when no trends are found", async () => {
      // Arrange
      const weekNumber = 1;
      const year = 2024;

      vi.mocked(mockLoadTrendsUseCase.execute).mockResolvedValue(
        {} as Record<Area, Trend>
      );

      // Act
      await workflow.execute(weekNumber, year);

      // Assert
      expect(mockLoadTrendsUseCase.execute).toHaveBeenCalled();
      expect(mockCreateSummaryUseCase.execute).not.toHaveBeenCalled();
      expect(mockCreatePRUseCase.execute).not.toHaveBeenCalled();
    });

    it("should use current week when weekNumber and year are not provided", async () => {
      // Arrange
      vi.mocked(mockLoadTrendsUseCase.execute).mockResolvedValue({
        [Area.BACKEND]: mockTrend,
      } as Record<Area, Trend>);

      // Act
      await workflow.execute();

      // Assert
      expect(mockLoadTrendsUseCase.execute).toHaveBeenCalled();
      const callArgs = vi.mocked(mockLoadTrendsUseCase.execute).mock.calls[0];
      expect(callArgs[0]).toBeDefined(); // weekNumber
      expect(callArgs[1]).toBeDefined(); // year
    });

    it("should handle errors during summary creation", async () => {
      // Arrange
      const weekNumber = 1;
      const year = 2024;

      vi.mocked(mockLoadTrendsUseCase.execute).mockResolvedValue({
        [Area.BACKEND]: mockTrend,
      } as Record<Area, Trend>);

      vi.mocked(mockCreateSummaryUseCase.execute).mockRejectedValue(
        new Error("Summary creation failed")
      );

      // Act & Assert
      await expect(workflow.execute(weekNumber, year)).rejects.toThrow(
        "Summary creation failed"
      );
    });
  });
});
