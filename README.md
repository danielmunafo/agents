# Proposal

## Why

Many professionals in IT would agree that it's not easy to keep up to date with the market trends.
How could one be able to properly follow and act over them?

## What

This repo summarizes tech trends in LinkedIn weekly through agents operations
The trends to be analyzed are:

- General IT trends
- Back end
- Front end
- AI, LLM and Machine learning
- Database
- DevOps and infrastructure
- Architecture, governance and design
- Testing and QA

## Output

### Weekly on Sundays

**For each of the given topics, one pull request will be opened containing:**

- PR Title: [WeekNumber]-[Area] Trends
- A [Area].md file in the /trends/[WeekNumber] directory
- The .md file references the main aspects of the trend and a summary over:
  - How come it became important;
  - What are the tools/frameworks involved;
  - Suggested actions for engineers in the area;
  - Reference posts;

**One overall pull request summarizing all the previously gathered trends (in /trends) containing:**

- PR Title: [WeekNumber] Trends Knowledge Base Summary
- A [Summary].md file in the /trends/[WeekNumber] directory
- The .md file summarizes all the trends:
  - Sort them by relevance (engagement and impact in the market)
  - Links to pull requests of each Area's trend referenced in the file

### Monthly on 1st

**One pull request will be opened with the following purpose:**

- Recommended actions for managers;
- Recommended actions for engineers;
- Recommended actions for product owners;

Recommended actions consist in:

- Topics to study
- Impacts
- Reference topic and/or pull request

## Setup

### Prerequisites

- Node.js 20.x or higher
- npm or yarn
- OpenAI API key
- GitHub Personal Access Token (for creating PRs)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd agents
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
# Create a .env file or set environment variables
export OPENAI_API_KEY="your-openai-api-key"
export GITHUB_TOKEN="your-github-token"
# Optional: Override repo info
export GITHUB_REPO_OWNER="your-username"
export GITHUB_REPO_NAME="agents"
# Optional: Logging configuration
export LOG_LEVEL="debug"  # debug, info, warn, error (default: info in production, debug in development)
export NODE_ENV="development"  # development or production
# Optional: LinkedIn cookies path (default: linkedin-cookies.json in project root)
export LINKEDIN_COOKIES_PATH="path/to/linkedin-cookies.json"
```

4. **LinkedIn Authentication (Required for scraping):**

   LinkedIn requires authentication to view search results. You need to export your LinkedIn cookies:

   **Option 1: Using Browser Extension (Recommended)**

   Install a cookie export extension (Export Cookes)[https://chromewebstore.google.com/detail/export-cookie-json-file-f/nmckokihipjgplolmcmjakknndddifde?hl=en-US&utm_source=ext_sidebar], then:
   1. Log in to LinkedIn in your browser
   2. Use the extension to export cookies for `linkedin.com`
   3. Convert the exported format to JSON (see below)
   4. Save as `linkedin-cookies.json` in the project root

   **Cookie JSON Format:**

   ```json
   [
     {
       "name": "li_at",
       "value": "your-session-cookie-value",
       "domain": ".linkedin.com",
       "path": "/",
       "expires": 1234567890,
       "httpOnly": true,
       "secure": true,
       "sameSite": "None"
     },
     {
       "name": "JSESSIONID",
       "value": "your-jsessionid-value",
       "domain": ".linkedin.com",
       "path": "/",
       "expires": -1,
       "httpOnly": true,
       "secure": true,
       "sameSite": "None"
     }
   ]
   ```

   **Important Notes:**
   - The `li_at` cookie is the most important one (your session token)
   - Cookies expire, so you may need to refresh them periodically
   - Keep `linkedin-cookies.json` in `.gitignore` (it's already there) - never commit your cookies!
   - **For GitHub Actions:** Store the entire JSON array as a repository secret named `LINKEDIN_COOKIES`. The workflow will automatically create the file from the secret.

### Running Locally

#### Test a single agent:

```bash
npm run test:agent
# Or with custom area:
AREA="Back end" MAX_POSTS=5 npm run test:agent
```

#### Run weekly workflow manually:

```bash
npm run weekly
# Or with specific week:
WEEK_NUMBER=1 YEAR=2024 npm run weekly
```

#### Run monthly workflow manually:

```bash
npm run monthly
# Or with specific month:
YEAR=2024 MONTH=1 npm run monthly
```

#### Run daily workflow manually:

```bash
# Run for all areas:
npm run daily

# Run for a specific area:
AREA="Back end" npm run daily

# Or with specific week:
AREA="Front end" WEEK_NUMBER=1 YEAR=2024 npm run daily
```

### GitHub Actions Setup

1. Add secrets to your GitHub repository:
   - Go to Settings → Secrets and variables → Actions
   - Add `OPENAI_API_KEY` with your OpenAI API key
   - **Add `LINKEDIN_COOKIES` secret:**
     - Export your LinkedIn cookies as JSON (see "LinkedIn Authentication" section above)
     - Copy the entire JSON array content (e.g., `[{"name":"li_at","value":"...",...}]`)
     - Create a new secret named `LINKEDIN_COOKIES` and paste the JSON array as the value
     - The workflow will automatically create `linkedin-cookies.json` from this secret at runtime
   - `GITHUB_TOKEN` is automatically available in GitHub Actions

2. The workflows will run automatically in a **funnel architecture**:
   - **Daily**: Every day at 02:00 UTC (`.github/workflows/daily.yml`)
     - Runs all 8 area agents in parallel (one job per area)
     - Each area agent **scrapes LinkedIn**, analyzes trends, and updates its PR
     - This is the only workflow that scrapes LinkedIn
   - **Weekly**: Every Sunday at 00:00 UTC (`.github/workflows/weekly.yml`)
     - **Reads trends from daily PR branches** (no scraping)
     - Creates summary PR consolidating all weekly trends from daily PRs
   - **Monthly**: On the 1st of every month at 00:00 UTC (`.github/workflows/monthly.yml`)
     - **Reads weekly summaries from weekly PR branches** (no scraping)
     - Creates recommendations PR for managers, engineers, and product owners

3. You can also trigger workflows manually from the Actions tab.

### Project Structure

The project follows **Clean Architecture** principles with clear separation of concerns:

```
src/
  domain/                 # Core business logic (entities, value objects, interfaces)
    entities/             # Domain entities (Post, Trend)
    value-objects/        # Value objects (Area, WeekInfo)
    repositories/         # Repository interfaces (contracts)
    services/             # Domain services (TrendService, MarkdownService)

  application/           # Application layer (use cases, business logic)
    use-cases/            # Use cases (CollectPosts, AnalyzeTrends, CreatePR, etc.)
    config/               # Application configuration (area instructions)

  infrastructure/         # External implementations
    scrapers/             # LinkedIn scraper implementation
    ai/                   # OpenAI analyzer implementation
    github/               # GitHub API implementation
    di/                   # Dependency injection container

  presentation/           # Presentation layer (workflows, entrypoints)
    workflows/            # Workflow orchestration (Daily, Weekly, Monthly)
    entrypoints/          # CLI entrypoints

  shared/                 # Shared utilities and configuration
    config/               # Environment configuration
    utils/                # Shared utilities (logger, week calculator)
```

### Testing

Run tests:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

Format code:

```bash
npm run format
```

### Notes

- **Funnel Architecture**:
  - **Daily** → Scrapes LinkedIn and creates/updates area PRs
  - **Weekly** → Reads from daily PRs and creates summary PR
  - **Monthly** → Reads from weekly PRs and creates recommendations PR
  - This ensures efficient data flow and avoids redundant scraping

- **Data Persistence**: Since GitHub Actions runners are ephemeral, all data (posts and trends JSON files) are committed directly to PR branches instead of the filesystem. This ensures data persists even after the action completes.

- **Data Storage**:
  - Markdown files: `trends/[year]-W[week]/[Area].md` (committed to PR branches)
  - Data files: `data/[year]-W[week]/posts/[area].json` and `data/[year]-W[week]/trends/[area].json` (committed to PR branches)
  - You can read previous week's data from PR branches using `loadPostsFromPR()` and `loadTrendFromPR()` utilities

- **LinkedIn Scraping**:
  - Only happens in the daily workflow
  - Uses Puppeteer and accesses public posts only (no login required)
  - Includes rate limiting to avoid being blocked
  - Weekly and monthly workflows read from PRs, not LinkedIn

- **PRs**: Created automatically with proper branch names and file structure
- Each area PR contains both the markdown summary and the raw JSON data files for reference

## Known Limitations

This project has several limitations that users should be aware of:

### Agent Capabilities

- **No Tool Usage**: The AI agents are not using external tools or function calling. They operate as simple LLM-based analyzers that process text input (LinkedIn posts) and generate structured JSON responses. Agents cannot browse the web, access databases, or perform any actions beyond text analysis.

- **Limited to Prompt-Based Analysis**: All analysis is performed through prompt engineering. Agents rely solely on the content provided in LinkedIn posts and cannot fetch additional context or verify information from external sources.

### LinkedIn Data Limitations

- **Search Result Dependency**: Agent outputs are entirely limited by what LinkedIn's search returns. The quality and relevance of trend analysis depends directly on:
  - The posts LinkedIn's search algorithm surfaces
  - LinkedIn's search ranking and filtering mechanisms
  - The keywords used for each area (limited to first 3 keywords per area)
  - LinkedIn's content moderation and visibility rules

- **Time Window Restriction**: The scraper only retrieves posts from the **past 24 hours**. This means:
  - Trends are based on very recent activity only
  - Longer-term patterns may be missed
  - Daily runs accumulate data throughout the week, but each day only sees 24-hour windows

- **Public Posts Only**: The system can only access public LinkedIn posts. Private posts, restricted content, or posts requiring special permissions are not included in the analysis.

- **Limited Post Volume**: By default, the system collects a maximum of **20 posts per area** per day. This limitation helps manage API costs and processing time but may miss important trends if they're not in the top results.

- **LinkedIn UI Fragility**: The scraper relies on specific CSS selectors and page structure. If LinkedIn changes their UI, the scraper may break and require updates to selectors and extraction logic.

### Authentication & Access

- **Cookie Expiration**: LinkedIn cookies expire periodically (typically every few weeks to months). When cookies expire, the workflow will fail until new cookies are exported and updated in the GitHub secret.

- **Rate Limiting**: LinkedIn may rate-limit or block requests if:
  - Too many requests are made in a short time
  - Unusual activity patterns are detected
  - The account appears to be automated

### AI Analysis Limitations

- **Model Dependency**: Analysis quality depends on the OpenAI model used (default: `gpt-4o-mini`). While cost-effective, this model may have limitations in:
  - Understanding complex technical concepts
  - Identifying nuanced trends
  - Distinguishing between genuine trends and marketing content

- **Fallback Content**: When AI analysis fails (API errors, parsing issues, etc.), the system generates fallback content that requires manual review. These fallback trends are marked with `_isFallback: true` in the data.

- **No Fact-Checking**: Agents analyze and summarize content but do not verify the accuracy of claims made in LinkedIn posts. Users should validate important information independently.

### Cost & Performance

- **OpenAI API Costs**: Each analysis requires API calls to OpenAI. Costs scale with:
  - Number of areas analyzed (8 areas × daily runs)
  - Number of posts analyzed
  - Model used (gpt-4o-mini is cheaper but less capable than gpt-4o)

- **OpenAI Rate Limits**: The system is subject to OpenAI's rate limits:
  - Token limits per minute/day
  - Request limits per minute/day
  - Critical errors (quota exceeded, authentication failed) will stop the workflow

### Data Quality

- **LinkedIn Post Quality**: The quality of trend analysis is directly tied to the quality of posts on LinkedIn. Issues include:
  - Marketing/sponsored content may dominate results
  - Low-quality or spam posts may be included
  - Biased or opinionated content may skew trends
  - Limited technical depth in many posts

- **Keyword Limitations**: Each area uses only the first 3 keywords from a predefined list. This may miss relevant posts that use different terminology or phrasing.

### Operational Limitations

- **No Real-Time Updates**: Workflows run on fixed schedules (daily at 02:00 UTC, weekly on Sundays, monthly on the 1st). There's no real-time monitoring or immediate trend detection.

- **Manual Intervention Required**: Some scenarios require manual intervention:
  - Updating expired LinkedIn cookies
  - Fixing broken scrapers after LinkedIn UI changes
  - Reviewing and correcting fallback content
  - Handling API quota issues

- **GitHub Actions Dependency**: The system relies on GitHub Actions for automation. Any GitHub Actions outages or issues will prevent workflows from running.

