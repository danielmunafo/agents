import puppeteer, { type Browser, type Page } from "puppeteer";
import type { Post, ScrapedPost } from "../../domain/entities/Post.js";
import type { Area } from "../../domain/value-objects/Area.js";
import type { LinkedInScraper } from "../../domain/repositories/LinkedInScraper.js";
import { AREA_KEYWORDS, SCRAPER_CONFIG } from "../../shared/config/index.js";
import { logger } from "../../shared/utils/logger.js";

export class LinkedInScraperImpl implements LinkedInScraper {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (this.browser) return;

    this.browser = await puppeteer.launch({
      headless: SCRAPER_CONFIG.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async searchPosts(
    area: Area,
    maxPosts: number = SCRAPER_CONFIG.maxPostsPerArea
  ): Promise<Post[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const keywords = AREA_KEYWORDS[area];
    const allPosts: Post[] = [];

    for (const keyword of keywords.slice(0, 3)) {
      // Limit to first 3 keywords to avoid too many requests
      try {
        const posts = await this.searchByKeyword(
          keyword,
          area,
          Math.ceil(maxPosts / 3)
        );
        allPosts.push(...posts);

        // Delay between keyword searches
        await this.delay(SCRAPER_CONFIG.delayBetweenRequests);

        if (allPosts.length >= maxPosts) break;
      } catch (error) {
        logger.error({ keyword, area, error }, "Error searching for keyword");
        // Continue with next keyword
      }
    }

    // Remove duplicates and limit
    const uniquePosts = this.deduplicatePosts(allPosts);
    return uniquePosts.slice(0, maxPosts);
  }

  private async searchByKeyword(
    keyword: string,
    area: Area,
    maxPosts: number
  ): Promise<Post[]> {
    const page = await this.browser!.newPage();

    try {
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to LinkedIn search
      const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}&origin=GLOBAL_SEARCH_HEADER`;
      await page.goto(searchUrl, {
        waitUntil: "networkidle2",
        timeout: SCRAPER_CONFIG.timeout,
      });

      // Wait for content to load
      await this.delay(3000);

      // Scroll to load more content
      await this.scrollPage(page, 3);

      // Extract posts
      const posts = await page.evaluate((max) => {
        // @ts-expect-error - document is available in browser context
        const postElements = document.querySelectorAll(
          '[data-testid="search-result"]'
        );
        const results: ScrapedPost[] = [];
        const parseErrors: string[] = [];

        for (const element of Array.from(postElements).slice(
          0,
          max
          // @ts-expect-error - Element is available in browser context
        ) as Element[]) {
          try {
            // Extract content
            const contentEl =
              element.querySelector(".feed-shared-text") ||
              element.querySelector(".update-components-text");
            const content = contentEl?.textContent?.trim() || "";

            if (!content || content.length < 50) continue; // Skip very short posts

            // Extract author
            const authorEl =
              element.querySelector(".feed-shared-actor__name") ||
              element.querySelector(".update-components-actor__name");
            const author = authorEl?.textContent?.trim() || "Unknown";

            // Extract author URL
            const authorLink = element.querySelector(
              'a[href*="/in/"]'
              // @ts-expect-error - HTMLAnchorElement is available in browser context
            ) as HTMLAnchorElement | null;
            const authorUrl = authorLink?.href;

            // Extract engagement
            const likesEl = element.querySelector(
              '[aria-label*="like"], [aria-label*="Like"]'
            );
            const likesText = likesEl?.getAttribute("aria-label") || "0";
            const likes = parseInt(likesText.match(/\d+/)?.[0] || "0", 10);

            const commentsEl = element.querySelector(
              '[aria-label*="comment"], [aria-label*="Comment"]'
            );
            const commentsText = commentsEl?.getAttribute("aria-label") || "0";
            const comments = parseInt(
              commentsText.match(/\d+/)?.[0] || "0",
              10
            );

            const sharesEl = element.querySelector(
              '[aria-label*="share"], [aria-label*="Share"]'
            );
            const sharesText = sharesEl?.getAttribute("aria-label") || "0";
            const shares = parseInt(sharesText.match(/\d+/)?.[0] || "0", 10);

            // Extract post URL
            const postLink = element.querySelector(
              'a[href*="/posts/"], a[href*="/activity-"]'
              // @ts-expect-error - HTMLAnchorElement is available in browser context
            ) as HTMLAnchorElement | null;
            const url = postLink?.href || "";

            // Extract date (simplified - LinkedIn uses relative dates)
            const dateEl = element.querySelector(
              "time, .feed-shared-actor__sub-description"
            );
            const dateText =
              dateEl?.textContent?.trim() || new Date().toISOString();

            results.push({
              content,
              author,
              authorUrl: authorUrl || undefined,
              date: dateText,
              engagement: {
                likes,
                comments,
                shares,
              },
              url: url || `https://www.linkedin.com/feed/update/${Date.now()}`,
            });
          } catch (err) {
            // Skip posts that fail to parse
            // Track errors to log them after evaluate returns (logger not available in browser context)
            const errorMsg = err instanceof Error ? err.message : String(err);
            parseErrors.push(errorMsg);
          }
        }

        return { results, parseErrors };
      }, maxPosts);

      // Log parse errors if any occurred
      if (posts.parseErrors && posts.parseErrors.length > 0) {
        logger.debug(
          { keyword, area, errorCount: posts.parseErrors.length },
          "Some posts failed to parse during scraping"
        );
      }

      // Convert to Post format
      return posts.results.map((post, index) => ({
        id: `${keyword}-${Date.now()}-${index}`,
        content: post.content,
        author: post.author,
        authorUrl: post.authorUrl,
        date: this.parseDate(post.date),
        engagement: post.engagement,
        url: post.url,
        area,
      }));
    } finally {
      await page.close();
    }
  }

  private async scrollPage(page: Page, times: number): Promise<void> {
    for (let i = 0; i < times; i++) {
      await page.evaluate(() => {
        // @ts-expect-error - window is available in browser context
        window.scrollBy(0, window.innerHeight);
      });
      await this.delay(2000);
    }
  }

  private parseDate(dateString: string): Date {
    // LinkedIn uses relative dates like "2h", "3d", "1w"
    // For simplicity, we'll use current date minus estimated time
    const now = new Date();

    if (dateString.includes("h")) {
      const hours = parseInt(dateString.match(/\d+/)?.[0] || "0", 10);
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }
    if (dateString.includes("d")) {
      const days = parseInt(dateString.match(/\d+/)?.[0] || "0", 10);
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    if (dateString.includes("w")) {
      const weeks = parseInt(dateString.match(/\d+/)?.[0] || "0", 10);
      return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
    }
    if (dateString.includes("m")) {
      const months = parseInt(dateString.match(/\d+/)?.[0] || "0", 10);
      return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
    }

    // Default to now if we can't parse
    return now;
  }

  private deduplicatePosts(posts: Post[]): Post[] {
    const seen = new Set<string>();
    return posts.filter((post) => {
      // Use content hash as unique identifier
      const key = `${post.content.substring(0, 100)}-${post.author}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
