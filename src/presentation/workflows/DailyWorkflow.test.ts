import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedObject,
} from "vitest";
import { DailyWorkflow } from "./DailyWorkflow.js";
import { Area } from "../../domain/value-objects/Area.js";
import type { Post } from "../../domain/entities/Post.js";
import type { Trend } from "../../domain/entities/Trend.js";
import type { Agent } from "../../domain/repositories/AIAnalyzer.js";
import type { LinkedInScraper } from "../../domain/repositories/LinkedInScraper.js";
import type { GitHubRepository } from "../../domain/repositories/GitHubRepository.js";

// Mock dependencies
vi.mock("../../infrastructure/di/container.js", () => ({
  container: {
    getLinkedInScraper: vi.fn(),
    getGitHubRepository: vi.fn(),
    getAllAgents: vi.fn(),
    getAgent: vi.fn(),
    cleanup: vi.fn(),
  },
}));

vi.mock("../../application/use-cases/CollectPostsUseCase.js");
vi.mock("../../application/use-cases/AnalyzeTrendsUseCase.js");
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
import { CollectPostsUseCase } from "../../application/use-cases/CollectPostsUseCase.js";
import { AnalyzeTrendsUseCase } from "../../application/use-cases/AnalyzeTrendsUseCase.js";
import { CreatePRUseCase } from "../../application/use-cases/CreatePRUseCase.js";

describe("DailyWorkflow", () => {
  let mockLinkedInScraper: LinkedInScraper;
  let mockGitHubRepository: GitHubRepository;
  let mockAgent: Agent;
  let mockCollectPostsUseCase: MockedObject<CollectPostsUseCase>;
  let mockAnalyzeTrendsUseCase: MockedObject<AnalyzeTrendsUseCase>;
  let mockCreatePRUseCase: MockedObject<CreatePRUseCase>;
  let workflow: DailyWorkflow;

  const mockPost: Post = {
    id: "post-1",
    content: "Test post content about backend development",
    author: "Test Author",
    date: new Date(),
    engagement: { likes: 10, comments: 5, shares: 2 },
    url: "https://linkedin.com/posts/test",
    area: Area.BACKEND,
  };

  const mockTrend: Trend = {
    area: Area.BACKEND,
    mainAspects: ["Microservices", "API Design", "Performance"],
    whyImportant: "These trends are shaping modern backend development",
    toolsFrameworks: ["Node.js", "Docker", "Kubernetes"],
    suggestedActions: [
      "Learn microservices patterns",
      "Focus on API design",
      "Study containerization",
    ],
    referencePosts: [mockPost],
    relevanceScore: 8.5,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock agent
    mockAgent = {
      analyze: vi.fn().mockResolvedValue({
        mainAspects: mockTrend.mainAspects,
        whyImportant: mockTrend.whyImportant,
        toolsFrameworks: mockTrend.toolsFrameworks,
        suggestedActions: mockTrend.suggestedActions,
      }),
      generateText: vi.fn().mockResolvedValue("Generated text"),
    };

    // Mock container
    mockLinkedInScraper = {
      searchPosts: vi.fn(),
    } as LinkedInScraper;
    mockGitHubRepository = {
      createPR: vi.fn().mockResolvedValue("https://github.com/pr/123"),
      loadPostsFromPR: vi.fn(),
      loadTrendFromPR: vi.fn(),
      loadWeeklySummaryFromPR: vi.fn(),
    } as GitHubRepository;

    vi.mocked(container.getLinkedInScraper).mockReturnValue(
      mockLinkedInScraper
    );
    vi.mocked(container.getGitHubRepository).mockReturnValue(
      mockGitHubRepository
    );
    vi.mocked(container.getAllAgents).mockReturnValue(
      new Map([[Area.BACKEND, mockAgent]])
    );
    vi.mocked(container.getAgent).mockReturnValue(mockAgent);
    vi.mocked(container.cleanup).mockResolvedValue();

    // Mock use cases
    mockCollectPostsUseCase = {
      execute: vi.fn(),
    } as MockedObject<CollectPostsUseCase>;

    mockAnalyzeTrendsUseCase = {
      execute: vi.fn(),
    } as MockedObject<AnalyzeTrendsUseCase>;

    mockCreatePRUseCase = {
      execute: vi.fn().mockResolvedValue("https://github.com/pr/123"),
    } as MockedObject<CreatePRUseCase>;

    // Replace use case constructors
    vi.mocked(CollectPostsUseCase).mockImplementation(
      () => mockCollectPostsUseCase
    );
    vi.mocked(AnalyzeTrendsUseCase).mockImplementation(
      () => mockAnalyzeTrendsUseCase
    );
    vi.mocked(CreatePRUseCase).mockImplementation(() => mockCreatePRUseCase);

    workflow = new DailyWorkflow();
  });

  describe("executeForArea", () => {
    it("should execute workflow for a single area successfully", async () => {
      // Arrange
      const area = Area.BACKEND;
      const weekNumber = 1;
      const year = 2024;

      vi.mocked(mockCollectPostsUseCase.execute).mockResolvedValue({
        [area]: [mockPost],
      } as Record<Area, Post[]>);

      vi.mocked(mockAnalyzeTrendsUseCase.execute).mockResolvedValue({
        [area]: mockTrend,
      } as Record<Area, Trend>);

      // Act
      await workflow.executeForArea(area, weekNumber, year);

      // Assert
      expect(mockCollectPostsUseCase.execute).toHaveBeenCalledWith([area]);
      expect(mockAnalyzeTrendsUseCase.execute).toHaveBeenCalled();
      expect(mockCreatePRUseCase.execute).toHaveBeenCalledWith("area", {
        weekNumber,
        year,
        area,
        trend: mockTrend,
        markdownContent: expect.any(String),
        filename: `${area}.md`,
        postsJson: expect.any(String),
        trendJson: expect.any(String),
      });
    });

    it("should skip execution when no posts are collected", async () => {
      // Arrange
      const area = Area.BACKEND;

      vi.mocked(mockCollectPostsUseCase.execute).mockResolvedValue({
        [area]: [],
      } as unknown as Record<Area, Post[]>);

      // Act
      await workflow.executeForArea(area);

      // Assert
      expect(mockCollectPostsUseCase.execute).toHaveBeenCalled();
      expect(mockAnalyzeTrendsUseCase.execute).not.toHaveBeenCalled();
      expect(mockCreatePRUseCase.execute).not.toHaveBeenCalled();
    });

    it("should use current week when weekNumber and year are not provided", async () => {
      // Arrange
      const area = Area.BACKEND;

      vi.mocked(mockCollectPostsUseCase.execute).mockResolvedValue({
        [area]: [mockPost],
      } as Record<Area, Post[]>);

      vi.mocked(mockAnalyzeTrendsUseCase.execute).mockResolvedValue({
        [area]: mockTrend,
      } as Record<Area, Trend>);

      // Act
      await workflow.executeForArea(area);

      // Assert
      expect(mockCreatePRUseCase.execute).toHaveBeenCalled();
      const callArgs = vi.mocked(mockCreatePRUseCase.execute).mock.calls[0][1];
      expect(callArgs.weekNumber).toBeDefined();
      expect(callArgs.year).toBeDefined();
    });
  });

  describe("executeAll", () => {
    it("should execute workflow for all areas", async () => {
      // Arrange
      const weekNumber = 1;
      const year = 2024;

      vi.mocked(mockCollectPostsUseCase.execute).mockResolvedValue({
        [Area.BACKEND]: [mockPost],
        [Area.FRONTEND]: [mockPost],
      } as Record<Area, Post[]>);

      vi.mocked(mockAnalyzeTrendsUseCase.execute).mockResolvedValue({
        [Area.BACKEND]: mockTrend,
        [Area.FRONTEND]: { ...mockTrend, area: Area.FRONTEND },
      } as Record<Area, Trend>);

      // Act
      await workflow.executeAll(weekNumber, year);

      // Assert
      expect(mockCollectPostsUseCase.execute).toHaveBeenCalled();
      expect(mockAnalyzeTrendsUseCase.execute).toHaveBeenCalled();
      expect(mockCreatePRUseCase.execute).toHaveBeenCalledTimes(2);
    });

    it("should continue processing other areas if one fails", async () => {
      // Arrange
      const weekNumber = 1;
      const year = 2024;

      vi.mocked(mockCollectPostsUseCase.execute).mockResolvedValue({
        [Area.BACKEND]: [mockPost],
        [Area.FRONTEND]: [mockPost],
      } as Record<Area, Post[]>);

      vi.mocked(mockAnalyzeTrendsUseCase.execute).mockResolvedValue({
        [Area.BACKEND]: mockTrend,
        [Area.FRONTEND]: { ...mockTrend, area: Area.FRONTEND },
      } as Record<Area, Trend>);

      vi.mocked(mockCreatePRUseCase.execute)
        .mockResolvedValueOnce("https://github.com/pr/123")
        .mockRejectedValueOnce(new Error("PR creation failed"));

      // Act
      await workflow.executeAll(weekNumber, year);

      // Assert
      expect(mockCreatePRUseCase.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe("cleanup", () => {
    it("should call container cleanup", async () => {
      // Act
      await workflow.cleanup();

      // Assert
      expect(container.cleanup).toHaveBeenCalled();
    });
  });
});
