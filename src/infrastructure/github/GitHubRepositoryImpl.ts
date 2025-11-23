import { Octokit } from "@octokit/rest";
import type { Post } from "../../domain/entities/Post.js";
import type { Trend } from "../../domain/entities/Trend.js";
import type { Area } from "../../domain/value-objects/Area.js";
import type {
  GitHubRepository,
  PRData,
} from "../../domain/repositories/GitHubRepository.js";
import { env, getRepoInfo } from "../../shared/config/index.js";
import { getAreaSlug } from "../../domain/value-objects/Area.js";
import { logger } from "../../shared/utils/logger.js";

export class GitHubRepositoryImpl implements GitHubRepository {
  private readonly octokit: Octokit;

  constructor() {
    this.octokit = new Octokit({
      auth: env.GITHUB_TOKEN,
    });
  }

  async createPR(
    type: "area" | "summary" | "monthly",
    data: PRData
  ): Promise<string> {
    const { owner, repo } = getRepoInfo();
    const branchName = this.getBranchName(type, data);
    const prTitle = this.getPRTitle(type, data);

    try {
      // Get default branch
      const { data: repoData } = await this.octokit.repos.get({ owner, repo });
      const defaultBranch = repoData.default_branch;

      // Create or get branch
      await this.createOrGetBranch(owner, repo, branchName, defaultBranch);

      // Create or update markdown file
      const filePath = this.getFilePath(type, data);
      await this.createOrUpdateFile(
        owner,
        repo,
        branchName,
        filePath,
        data.markdownContent
      );

      // Also commit data files to PR branch for persistence
      if (type === "area" && data.area) {
        const weekDir = `data/${data.year}-W${data.weekNumber.toString().padStart(2, "0")}`;

        // Commit posts JSON if provided
        if (data.postsJson) {
          const postsPath = `${weekDir}/posts/${getAreaSlug(data.area)}.json`;
          await this.createOrUpdateFile(
            owner,
            repo,
            branchName,
            postsPath,
            data.postsJson
          );
        }

        // Commit trend JSON if provided
        if (data.trendJson) {
          const trendPath = `${weekDir}/trends/${getAreaSlug(data.area)}.json`;
          await this.createOrUpdateFile(
            owner,
            repo,
            branchName,
            trendPath,
            data.trendJson
          );
        }
      }

      // Create or update PR
      const prBody = this.getPRBody(type, data);

      // Check for existing PR from this branch
      // For same-repo PRs, head is just the branch name
      const { data: existingPRs } = await this.octokit.pulls.list({
        owner,
        repo,
        state: "open",
        head: branchName,
      });

      let pr;
      if (existingPRs.length > 0) {
        // Update the existing PR
        pr = (
          await this.octokit.pulls.update({
            owner,
            repo,
            pull_number: existingPRs[0].number,
            title: prTitle,
            body: prBody,
          })
        ).data;
      } else {
        // Create a new PR
        pr = (
          await this.octokit.pulls.create({
            owner,
            repo,
            title: prTitle,
            body: prBody,
            head: branchName,
            base: defaultBranch,
          })
        ).data;
      }

      return pr.html_url;
    } catch (error) {
      logger.error({ type, error }, "Error creating PR");
      throw error;
    }
  }

  async loadPostsFromPR(
    weekNumber: number,
    year: number,
    area: Area
  ): Promise<Post[] | null> {
    const { owner, repo } = getRepoInfo();
    const areaSlug = getAreaSlug(area);
    const branchName = `trends/${year}-W${weekNumber.toString().padStart(2, "0")}-${areaSlug}`;
    const filePath = `data/${year}-W${weekNumber.toString().padStart(2, "0")}/posts/${areaSlug}.json`;

    try {
      const { data: fileData } = await this.octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branchName,
      });

      if ("content" in fileData && fileData.encoding === "base64") {
        const content = Buffer.from(fileData.content, "base64").toString(
          "utf-8"
        );
        return JSON.parse(content) as Post[];
      }
    } catch {
      // PR or file doesn't exist
    }

    return null;
  }

  async loadTrendFromPR(
    weekNumber: number,
    year: number,
    area: Area
  ): Promise<Trend | null> {
    const { owner, repo } = getRepoInfo();
    const areaSlug = getAreaSlug(area);
    const branchName = `trends/${year}-W${weekNumber.toString().padStart(2, "0")}-${areaSlug}`;
    const filePath = `data/${year}-W${weekNumber.toString().padStart(2, "0")}/trends/${areaSlug}.json`;

    try {
      const { data: fileData } = await this.octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branchName,
      });

      if ("content" in fileData && fileData.encoding === "base64") {
        const content = Buffer.from(fileData.content, "base64").toString(
          "utf-8"
        );
        return JSON.parse(content) as Trend;
      }
    } catch {
      // PR or file doesn't exist
    }

    return null;
  }

  async loadWeeklySummaryFromPR(
    weekNumber: number,
    year: number
  ): Promise<string | null> {
    const { owner, repo } = getRepoInfo();
    const branchName = `trends/${year}-W${weekNumber.toString().padStart(2, "0")}-summary`;
    const filePath = `trends/${year}-W${weekNumber.toString().padStart(2, "0")}/Summary.md`;

    try {
      const { data: fileData } = await this.octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branchName,
      });

      if ("content" in fileData && fileData.encoding === "base64") {
        return Buffer.from(fileData.content, "base64").toString("utf-8");
      }
    } catch {
      // PR or file doesn't exist
    }

    return null;
  }

  private getBranchName(type: string, data: PRData): string {
    if (type === "area" && data.area) {
      const areaSlug = getAreaSlug(data.area);
      return `trends/${data.year}-W${data.weekNumber.toString().padStart(2, "0")}-${areaSlug}`;
    }
    if (type === "summary") {
      return `trends/${data.year}-W${data.weekNumber.toString().padStart(2, "0")}-summary`;
    }
    if (type === "monthly") {
      if (!data.month) {
        throw new Error("Month is required for monthly PRs");
      }
      return `trends/${data.year}-${data.month.toString().padStart(2, "0")}-recommendations`;
    }
    throw new Error(`Unknown PR type: ${type}`);
  }

  private getPRTitle(type: string, data: PRData): string {
    if (type === "area" && data.area) {
      return `${data.weekNumber}-${data.area} Trends`;
    }
    if (type === "summary") {
      return `${data.weekNumber} Trends Knowledge Base Summary`;
    }
    if (type === "monthly") {
      if (!data.month) {
        throw new Error("Month is required for monthly PRs");
      }
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const monthName = monthNames[data.month - 1];
      return `${monthName} ${data.year} Recommended Actions`;
    }
    throw new Error(`Unknown PR type: ${type}`);
  }

  private getFilePath(type: string, data: PRData): string {
    if (type === "area" && data.area) {
      return `trends/${data.year}-W${data.weekNumber.toString().padStart(2, "0")}/${data.area}.md`;
    }
    if (type === "summary") {
      return `trends/${data.year}-W${data.weekNumber.toString().padStart(2, "0")}/Summary.md`;
    }
    if (type === "monthly") {
      if (!data.month) {
        throw new Error("Month is required for monthly PRs");
      }
      return `trends/${data.year}-${data.month.toString().padStart(2, "0")}/Recommendations.md`;
    }
    throw new Error(`Unknown PR type: ${type}`);
  }

  private getPRBody(type: string, data: PRData): string {
    if (type === "area" && data.area && data.trend) {
      return `## ${data.area} Trends - Week ${data.weekNumber}, ${data.year}

This PR contains the analyzed trends for ${data.area} based on LinkedIn posts.

### Key Highlights:
${data.trend.mainAspects.map((a) => `- ${a}`).join("\n")}

### Tools & Frameworks:
${data.trend.toolsFrameworks.map((t) => `- ${t}`).join("\n")}

See the attached markdown file for full details.`;
    }
    if (type === "summary") {
      return `## Trends Knowledge Base Summary - Week ${data.weekNumber}, ${data.year}

This PR summarizes all tech trends analyzed during week ${data.weekNumber} of ${data.year}, sorted by relevance.

See the attached Summary.md file for details.`;
    }
    if (type === "monthly") {
      if (!data.month) {
        throw new Error("Month is required for monthly PRs");
      }
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const monthName = monthNames[data.month - 1];
      return `## Recommended Actions - ${monthName} ${data.year}

This PR contains recommended actions for managers, engineers, and product owners based on the trends analyzed this month.

See the attached Recommendations.md file for details.`;
    }
    return "";
  }

  private async createOrGetBranch(
    owner: string,
    repo: string,
    branchName: string,
    defaultBranch: string
  ): Promise<void> {
    try {
      // Try to get the branch
      await this.octokit.repos.getBranch({ owner, repo, branch: branchName });
      // Branch exists, we'll update it
    } catch {
      // Branch doesn't exist, create it
      const { data: refData } = await this.octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`,
      });

      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: refData.object.sha,
      });
    }
  }

  private async createOrUpdateFile(
    owner: string,
    repo: string,
    branch: string,
    path: string,
    content: string
  ): Promise<void> {
    try {
      // Try to get existing file
      const { data: fileData } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });

      if (Array.isArray(fileData)) {
        // Path is a directory, this shouldn't happen for files
        throw new Error(`Path ${path} is a directory, not a file`);
      }

      if ("sha" in fileData) {
        // Update existing file
        await this.octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path,
          message: `Update ${path}`,
          content: Buffer.from(content).toString("base64"),
          sha: fileData.sha,
          branch,
        });
        return;
      }
    } catch (error: unknown) {
      // File doesn't exist or other error - try to create it
      const errorObj = error as { status?: number };
      if (errorObj.status === 404) {
        // File doesn't exist, create it
        // GitHub API automatically creates parent directories
        await this.octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path,
          message: `Add ${path}`,
          content: Buffer.from(content).toString("base64"),
          branch,
        });
        return;
      }
      // Re-throw other errors
      throw error;
    }
  }
}
