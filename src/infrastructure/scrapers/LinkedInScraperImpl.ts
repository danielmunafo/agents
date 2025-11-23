import puppeteer, { type Browser, type Page, type Cookie } from "puppeteer";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { Post, ScrapedPost } from "../../domain/entities/Post.js";
import type { Area } from "../../domain/value-objects/Area.js";
import type { LinkedInScraper } from "../../domain/repositories/LinkedInScraper.js";
import { AREA_KEYWORDS, SCRAPER_CONFIG } from "../../shared/config/index.js";
import { logger } from "../../shared/utils/logger.js";

export class LinkedInScraperImpl implements LinkedInScraper {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (this.browser) return;

    logger.debug(
      {
        headless: SCRAPER_CONFIG.headless,
        slowMo: SCRAPER_CONFIG.slowMo,
        devtools: SCRAPER_CONFIG.devtools,
      },
      "Initializing Puppeteer browser"
    );

    this.browser = await puppeteer.launch({
      headless: SCRAPER_CONFIG.headless,
      slowMo: SCRAPER_CONFIG.slowMo,
      devtools: SCRAPER_CONFIG.devtools,
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

  /**
   * Load cookies from file if available
   */
  private async loadCookies(): Promise<Cookie[] | null> {
    const cookiePath =
      process.env.LINKEDIN_COOKIES_PATH || "linkedin-cookies.json";
    const fullPath = join(process.cwd(), cookiePath);

    if (!existsSync(fullPath)) {
      logger.debug(
        { cookiePath: fullPath },
        "No LinkedIn cookies file found - authentication may be required"
      );
      return null;
    }

    try {
      const cookieData = await readFile(fullPath, "utf-8");
      const cookies = JSON.parse(cookieData) as Cookie[];
      logger.debug(
        { cookieCount: cookies.length },
        "Loaded LinkedIn cookies from file"
      );
      return cookies;
    } catch (error) {
      logger.warn(
        { cookiePath: fullPath, error },
        "Failed to load LinkedIn cookies"
      );
      return null;
    }
  }

  private async searchByKeyword(
    keyword: string,
    area: Area,
    maxPosts: number
  ): Promise<Post[]> {
    const page = await this.browser!.newPage();

    try {
      // Enable console logging from the page (filter out noise)
      page.on("console", (msg) => {
        const text = msg.text();
        // Filter out common noise messages that don't indicate real errors
        const noisePatterns = [
          "Failed to load resource",
          "net::ERR_FAILED",
          "link rel=preload",
          "GSI_LOGGER",
          "JSHandle@error",
          "TMS load event",
        ];

        const isNoise = noisePatterns.some((pattern) =>
          text.toLowerCase().includes(pattern.toLowerCase())
        );

        // Only log if it's not noise, or if it's an actual error
        const msgType = msg.type();
        if (!isNoise || msgType === "error") {
          logger.debug(
            { keyword, area, console: text, type: msgType },
            "Browser console"
          );
        }
      });

      // Log page errors
      page.on("pageerror", (error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error({ keyword, area, error: errorMessage }, "Page error");
      });

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Load and set cookies if available
      const cookies = await this.loadCookies();
      if (cookies && cookies.length > 0) {
        // First navigate to LinkedIn domain to set cookies
        await page.goto("https://www.linkedin.com", {
          waitUntil: "domcontentloaded",
        });
        await page.setCookie(...cookies);
        logger.debug(
          { keyword, area, cookieCount: cookies.length },
          "Set LinkedIn cookies"
        );

        // Verify cookies worked by checking if we're logged in
        await this.delay(1000);
        const currentUrl = page.url();
        if (
          currentUrl.includes("/login") ||
          currentUrl.includes("/checkpoint")
        ) {
          logger.warn(
            { keyword, area, url: currentUrl },
            "Cookies may be invalid or expired - LinkedIn is still showing login page"
          );
        }
      } else {
        logger.warn(
          { keyword, area },
          "No LinkedIn cookies found - authentication will be required. See README.md for instructions on exporting cookies."
        );
      }

      logger.debug({ keyword, area }, "Navigating to LinkedIn search");

      // Build search URL matching the exact LinkedIn structure
      // Using contentType=posts (for text content), datePosted=past-24h, origin=FACETED_SEARCH, sortBy=relevance
      const searchUrl = `https://www.linkedin.com/search/results/content/?contentType=%22posts%22&datePosted=%22past-24h%22&keywords=${encodeURIComponent(keyword)}&origin=FACETED_SEARCH&sortBy=%22relevance%22`;
      logger.debug({ keyword, area, url: searchUrl }, "Loading search page");

      await page.goto(searchUrl, {
        waitUntil: "networkidle2",
        timeout: SCRAPER_CONFIG.timeout,
      });

      logger.debug({ keyword, area }, "Page loaded, waiting for content");
      // Wait for content to load
      await this.delay(3000);

      // Try to wait for search results or any content
      try {
        await page
          .waitForSelector(
            '[data-testid="search-result"], .search-result, .feed-shared-update-v2',
            {
              timeout: 10000,
            }
          )
          .catch(() => {
            logger.debug(
              { keyword, area },
              "No posts found with expected selectors, continuing anyway"
            );
          });
      } catch (error) {
        logger.debug({ keyword, area, error }, "Error waiting for selectors");
      }

      // Scroll to load more content
      logger.debug({ keyword, area }, "Scrolling to load more content");
      await this.scrollPage(page, 3);

      // Wait a bit more after scrolling
      await this.delay(2000);

      // Always take a screenshot for debugging when posts are 0
      // This helps diagnose why no posts are found
      try {
        const screenshotPath = `debug-screenshot-${keyword.replace(/\s+/g, "-")}-${Date.now()}.png`;
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
        });
        logger.debug(
          { keyword, area, screenshotPath },
          "Screenshot saved for debugging"
        );
      } catch (screenshotError) {
        logger.debug(
          { keyword, area, error: screenshotError },
          "Failed to take screenshot"
        );
      }

      // Extract posts
      logger.debug({ keyword, area }, "Extracting posts from page");

      // Check if we're on a login page or if LinkedIn blocked us
      const pageTitle = await page.title();
      const pageUrl = page.url();
      logger.debug(
        { keyword, area, pageTitle, pageUrl },
        "Page info before extraction"
      );

      // Check if we see a login prompt
      const isLoginPage =
        pageUrl.includes("/login") || pageTitle.toLowerCase().includes("login");
      if (isLoginPage) {
        const cookieFile =
          process.env.LINKEDIN_COOKIES_PATH || "linkedin-cookies.json";
        const errorMessage = `LinkedIn authentication required. The scraper was redirected to a login page (${pageUrl}). Please export your LinkedIn cookies to ${cookieFile}. See README.md for instructions.`;
        logger.error(
          {
            keyword,
            area,
            pageUrl,
            cookieFile,
          },
          errorMessage
        );
        // Throw error to fail the workflow instead of silently returning empty results
        throw new Error(errorMessage);
      }

      // Get page content snippet for debugging
      const pageContent = await page
        .evaluate(() => {
          // @ts-expect-error - document is available in browser context
          return document.body?.innerText?.substring(0, 500) || "No content";
        })
        .catch(() => "Failed to get page content");

      // Check for common LinkedIn blocking/authentication messages
      const hasLoginPrompt =
        pageContent.toLowerCase().includes("sign in") ||
        pageContent.toLowerCase().includes("log in") ||
        pageContent.toLowerCase().includes("join linkedin");
      const hasBlockedMessage =
        pageContent.toLowerCase().includes("unusual activity") ||
        pageContent.toLowerCase().includes("verify") ||
        pageContent.toLowerCase().includes("captcha");

      logger.debug(
        {
          keyword,
          area,
          contentPreview:
            typeof pageContent === "string"
              ? pageContent.substring(0, 200)
              : pageContent,
          hasLoginPrompt,
          hasBlockedMessage,
        },
        "Page content preview"
      );

      if (hasLoginPrompt) {
        const cookieFile =
          process.env.LINKEDIN_COOKIES_PATH || "linkedin-cookies.json";
        const errorMessage = `LinkedIn authentication required. The page content indicates a login prompt. Please export your LinkedIn cookies to ${cookieFile}. See README.md for instructions.`;
        logger.error({ keyword, area, pageUrl, cookieFile }, errorMessage);
        // Throw error to fail the workflow instead of silently continuing
        throw new Error(errorMessage);
      }
      if (hasBlockedMessage) {
        const errorMessage = `LinkedIn may be blocking the scraper. The page content indicates unusual activity or verification required. Please check your LinkedIn cookies and authentication setup.`;
        logger.error({ keyword, area, pageUrl }, errorMessage);
        // Throw error to fail the workflow
        throw new Error(errorMessage);
      }

      // Check what selectors are actually available on the page
      const availableSelectors = await page.evaluate(() => {
        const selectors = [
          '[data-testid="search-result"]',
          ".search-result",
          ".feed-shared-update-v2",
          ".update-components-actor",
          '[data-testid="feed-shared-update-v2"]',
          ".reusable-search__result-container",
          ".search-results__list-item",
          "article",
          "[data-urn]",
        ];

        const results: Record<string, number> = {};
        for (const selector of selectors) {
          try {
            // @ts-expect-error - document is available in browser context
            const elements = document.querySelectorAll(selector);
            results[selector] = elements.length;
          } catch {
            results[selector] = -1; // Error
          }
        }
        return results;
      });

      logger.debug(
        { keyword, area, selectorCounts: availableSelectors },
        "Available selectors and their counts"
      );

      const posts = await page
        .evaluate((max) => {
          const selectors = [
            '[data-testid="search-result"]',
            ".reusable-search__result-container",
            ".search-results__list-item",
            "article[data-urn]",
            ".feed-shared-update-v2",
            ".update-components-actor",
            '[data-testid="feed-shared-update-v2"]',
          ];

          // @ts-expect-error - NodeListOf and Element are available in browser context
          let postElements: NodeListOf<Element> | null = null;
          let usedSelector = "";

          // Try each selector until we find one with results
          for (const selector of selectors) {
            try {
              // @ts-expect-error - document is available in browser context
              const elements = document.querySelectorAll(selector);
              console.log(
                `Selector "${selector}": found ${elements.length} elements`
              );
              if (elements.length > 0) {
                postElements = elements;
                usedSelector = selector;
                console.log(
                  `Using selector: ${selector} with ${elements.length} elements`
                );
                break;
              }
            } catch (error) {
              console.log(`Selector "${selector}": error - ${error}`);
            }
          }

          if (!postElements || postElements.length === 0) {
            console.log("No post elements found with any selector");
            // Try to find ANY article or post-like elements
            // @ts-expect-error - document is available in browser context
            const allArticles = document.querySelectorAll(
              "article, [data-urn], .feed-shared-update-v2"
            );
            console.log(
              `Found ${allArticles.length} potential article elements`
            );
            if (allArticles.length > 0) {
              postElements = allArticles;
              usedSelector = "fallback-articles";
            }
          }

          if (!postElements || postElements.length === 0) {
            console.log(
              "Still no elements found. Page structure may have changed."
            );
            return {
              results: [],
              parseErrors: ["No post elements found on page"],
              usedSelector: "",
            };
          }

          console.log(
            `Processing ${postElements.length} elements with selector: ${usedSelector}`
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

              // Extract author - try multiple selectors
              const authorSelectors = [
                ".feed-shared-actor__name",
                ".update-components-actor__name",
                ".feed-shared-actor__name-link",
                ".update-components-actor__name-link",
                '[data-testid="actor-name"]',
                ".actor-name",
                "span[dir='ltr']", // LinkedIn often uses this for names
              ];

              let author = "Unknown";
              // @ts-expect-error - Element is available in browser context
              let authorEl: Element | null = null;
              for (const selector of authorSelectors) {
                authorEl = element.querySelector(selector);
                if (authorEl) {
                  author = authorEl.textContent?.trim() || "Unknown";
                  if (author !== "Unknown" && author.length > 0) {
                    break;
                  }
                }
              }

              // If still unknown, try to extract from any link with /in/ pattern
              if (author === "Unknown") {
                const authorLink = element.querySelector(
                  'a[href*="/in/"]'
                  // @ts-expect-error - HTMLAnchorElement is available in browser context
                ) as HTMLAnchorElement | null;
                if (authorLink) {
                  const linkText = authorLink.textContent?.trim();
                  if (
                    linkText &&
                    linkText.length > 0 &&
                    linkText.length < 100
                  ) {
                    author = linkText;
                  }
                }
              }

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
              const commentsText =
                commentsEl?.getAttribute("aria-label") || "0";
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
                url:
                  url || `https://www.linkedin.com/feed/update/${Date.now()}`,
              });
            } catch (err) {
              // Skip posts that fail to parse
              // Track errors to log them after evaluate returns (logger not available in browser context)
              const errorMsg = err instanceof Error ? err.message : String(err);
              parseErrors.push(errorMsg);
            }
          }

          return {
            results,
            parseErrors,
            usedSelector,
            totalFound: postElements.length,
          };
        }, maxPosts)
        .catch((error) => {
          logger.error(
            { keyword, area, error },
            "Error during page.evaluate()"
          );
          return {
            results: [],
            parseErrors: [
              error instanceof Error ? error.message : String(error),
            ],
          };
        });

      // Log results
      logger.info(
        {
          keyword,
          area,
          foundPosts: posts.results.length,
          totalElements: (posts as { totalFound?: number }).totalFound || 0,
          usedSelector:
            (posts as { usedSelector?: string }).usedSelector || "unknown",
          parseErrors: posts.parseErrors?.length || 0,
        },
        "Post extraction completed"
      );

      // If no posts found, log more details
      if (posts.results.length === 0) {
        logger.warn(
          {
            keyword,
            area,
            pageUrl,
            pageTitle,
            availableSelectors,
            parseErrors: posts.parseErrors,
          },
          "No posts extracted - check selectors or page structure"
        );
      }

      // Log parse errors if any occurred
      if (posts.parseErrors && posts.parseErrors.length > 0) {
        logger.debug(
          {
            keyword,
            area,
            errors: posts.parseErrors,
            errorCount: posts.parseErrors.length,
          },
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
