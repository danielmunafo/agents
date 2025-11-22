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
