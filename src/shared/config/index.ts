import "dotenv/config";
import { z } from "zod";
import { Area } from "../../domain/value-objects/Area.js";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),
  GITHUB_REPO_OWNER: z.string().optional(),
  GITHUB_REPO_NAME: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
});

export const env = envSchema.parse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER,
  GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
});

// Get repo info from environment or git remote
export function getRepoInfo(): { owner: string; repo: string } {
  if (env.GITHUB_REPO_OWNER && env.GITHUB_REPO_NAME) {
    return {
      owner: env.GITHUB_REPO_OWNER,
      repo: env.GITHUB_REPO_NAME,
    };
  }

  // Try to extract from GITHUB_REPOSITORY (set by GitHub Actions)
  if (process.env.GITHUB_REPOSITORY) {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
    return { owner, repo };
  }

  // Default fallback (should be overridden)
  return {
    owner: "danielmunafo",
    repo: "agents",
  };
}

// LinkedIn search keywords per area
export const AREA_KEYWORDS: Record<Area, string[]> = {
  [Area.GENERAL_IT]: [
    "technology trends",
    "IT innovation",
    "digital transformation",
    "tech industry",
    "software development",
  ],
  [Area.BACKEND]: [
    "backend development",
    "server-side",
    "API design",
    "microservices",
    "backend architecture",
    "Node.js",
    "Python backend",
    "Java backend",
  ],
  [Area.FRONTEND]: [
    "frontend development",
    "React",
    "Vue",
    "Angular",
    "web development",
    "UI/UX",
    "JavaScript",
    "TypeScript",
  ],
  [Area.AI_LLM]: [
    "artificial intelligence",
    "machine learning",
    "LLM",
    "GPT",
    "AI development",
    "ML models",
    "neural networks",
    "generative AI",
  ],
  [Area.DATABASE]: [
    "database",
    "SQL",
    "NoSQL",
    "data engineering",
    "data architecture",
    "PostgreSQL",
    "MongoDB",
    "Redis",
  ],
  [Area.DEVOPS]: [
    "DevOps",
    "CI/CD",
    "cloud infrastructure",
    "Kubernetes",
    "Docker",
    "AWS",
    "Azure",
    "infrastructure as code",
  ],
  [Area.ARCHITECTURE]: [
    "software architecture",
    "system design",
    "enterprise architecture",
    "design patterns",
    "governance",
    "technical leadership",
  ],
  [Area.TESTING]: [
    "software testing",
    "QA",
    "test automation",
    "TDD",
    "testing strategies",
    "quality assurance",
  ],
};

// Scraper configuration
export const SCRAPER_CONFIG = {
  maxPostsPerArea: 20,
  delayBetweenRequests: 2000, // 2 seconds
  timeout: 30000, // 30 seconds
  headless: process.env.PUPPETEER_HEADLESS !== "false", // Set PUPPETEER_HEADLESS=false to see browser
  slowMo: process.env.PUPPETEER_SLOW_MO
    ? parseInt(process.env.PUPPETEER_SLOW_MO, 10)
    : 0, // Slow down operations (ms)
  devtools: process.env.PUPPETEER_DEVTOOLS === "true", // Open DevTools
} as const;
