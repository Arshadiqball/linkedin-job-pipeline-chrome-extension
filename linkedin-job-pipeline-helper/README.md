# LinkedIn Job Pipeline Helper (Chrome Extension - Manifest V3)

A passive LinkedIn Jobs data collector that captures **already visible** job listings while you browse normally, skips **Easy Apply** jobs, and prepares an export-ready dataset for job pipeline automation.

## Features

- Passively observes LinkedIn Jobs pages (`https://www.linkedin.com/jobs/*`) without automating user behavior.
- Detects job cards that are already rendered in the DOM.
- Extracts key metadata:
  - `jobId`
  - `jobTitle`
  - `companyName`
  - `location`
  - `jobLink`
  - `timestamp`
  - `source`
- Skips jobs marked **Easy Apply**.
- Captures external apply URLs from the job details panel when available.
- Classifies roles by job title keywords (Backend, Frontend, Fullstack, Mobile, DevOps/SRE, Data, ML/AI, PM, Design, QA, Marketing, Sales, Operations, Other).
- Detects job type:
  - `Remote`
  - `Hybrid`
  - `Onsite`
- Calculates `priorityScore` (0-100) based on:
  - external apply availability
  - remote role
  - seniority indicators
  - categorized role relevance
  - recent posting hints
- Saves data to `chrome.storage.local` with duplicate protection by `jobId`.
- Country filter bar above the jobs table:
  - Extracts countries/regions from job locations automatically.
  - Shows clickable pills with job counts per country.
  - Click a country to filter the table to only that country's jobs.
  - "All" pill resets to show every job.
  - CSV/JSON exports respect the active country filter.
- Popup UI with:
  - refresh data
  - sort by priority
  - export CSV
  - export JSON
  - clear data
- Scrollable jobs table in popup (`max-height: 450px`, `overflow-y: auto`).

## Safety-First Design

This extension is intentionally passive and account-safe:

- No automated clicking
- No automated scrolling
- No automated page navigation
- No automated pagination
- No background crawling
- No mass scraping loops

It only processes data that appears in the page DOM from your normal browsing actions.

## Stored Job Schema

Each saved job record includes:

```json
{
  "jobId": "39283923",
  "jobTitle": "Senior Backend Engineer",
  "companyName": "Stripe",
  "location": "Remote",
  "jobType": "Remote",
  "roleCategory": "Backend Engineering",
  "jobLink": "https://www.linkedin.com/jobs/view/39283923/",
  "externalApplyLink": "https://company.com/jobs/123",
  "priorityScore": 92,
  "timestamp": "2026-03-10T12:00:00.000Z",
  "source": "linkedin"
}
```

## Export Outputs

- CSV file: `linkedin_external_jobs.csv`
- JSON file: `linkedin_external_jobs.json`

Export-ready fields:

- `jobTitle`
- `companyName`
- `location`
- `jobType`
- `roleCategory`
- `externalApplyLink`
- `jobLink`
- `priorityScore`

## Project Structure

```text
linkedin-job-pipeline-helper/
├ manifest.json
├ background.js
├ content.js
├ observer.js
├ extractor.js
├ classifier.js
├ prioritizer.js
├ storage.js
├ exporter.js
├ popup.html
├ popup.js
├ popup.css
└ utils.js
```

## Installation (Load Unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `linkedin-job-pipeline-helper` folder.

## Usage

1. Open LinkedIn Jobs search page: `https://www.linkedin.com/jobs/search/`.
2. Browse normally (search, scroll, and open job cards manually).
3. Open the extension popup to:
   - view collected jobs
   - sort by priority
   - export CSV/JSON
   - clear stored data

## Console Logs

The extension logs pipeline events with prefix:

- `[LinkedIn Pipeline] Job detected`
- `[LinkedIn Pipeline] Easy Apply skipped`
- `[LinkedIn Pipeline] Role categorized`
- `[LinkedIn Pipeline] Job prioritized`
- `[LinkedIn Pipeline] External link captured`
- `[LinkedIn Pipeline] Job saved`
