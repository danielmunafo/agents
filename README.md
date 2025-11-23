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
```

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
