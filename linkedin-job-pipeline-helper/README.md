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
├ options.html
├ options.js
├ popup.css
├ utils.js
├ utils/
│  ├ timing.js                 (randomDelay / jitter — anti-detection timing)
│  ├ categoryExtractor.js      (post-card selectors shared with the runner)
│  └ linkedInOriginMirror.js   (mirrors ledger + run snapshot to linkedin.com localStorage)
├ services/
│  └ commentGenerator.js       (short, non-generic, slightly randomised comments)
└ content/
   ├ categoryRunner.js         (headless helpers for each of the 3 pages)
   └ topContentMain.js         (state-driven dispatcher across page loads)
```

## LinkedIn Top Content Comment Runner

A second feature is bundled in the same extension. It only activates on
`https://www.linkedin.com/top-content/*` and `https://www.linkedin.com/feed/update/*`,
and is completely separate from the passive Jobs pipeline above.

### Flow

The runner is fully headless (no in-page UI) and triggered from the extension
popup via the **Start Comment Process** button. Run state (current category,
post counter, list of already-commented posts, list of completed categories)
is persisted in `chrome.storage.local` so the workflow survives full page
reloads and keeps advancing after each navigation.

```
Popup:
  Set run state { running: true }.
  If the active tab is not already on /top-content/* or /feed/update/*,
  navigate it to https://www.linkedin.com/top-content/.

Hub page (/top-content/):
  If we have an in-progress category with < 5 successful posts done → go to that category.
  Else → pick the first visible category link that isn't completed (processed list
  OR already has 5 posted rows in the ledger for that category path) → navigate.
  If none remain → set run to idle (progress lists are kept).

Category page (/top-content/<slug>/...):
  If counter already reached 5 → mark category done, return to hub.
  Else → scroll to load posts, find the first visible post whose comment
  link is not in commentedPosts → navigate to that post detail URL.
  If no uncommented post is found → mark category done, return to hub.

Post detail page (/feed/update/...):
  Record the post as seen (so we never retry it, even on failure).
  Click Like (if not already liked).
  Generate a short comment from the post text.
  Type it into the ql-editor → click the submit button.
  If the comment posted successfully → increment the category counter.
  If the counter reaches 5 → mark the category done.
  Navigate back to the hub to continue the loop.
```

The loop therefore walks every category in DOM order, posting up to 5
comments in each, and stops once no unprocessed categories remain. Random
delays (0.8–5 s) are applied between steps. Failures on a single post are
logged but don't abort the run — that post is blocklisted and the runner
moves to the next one.

### OpenAI comment generation

1. Open the extension popup → **Top Content — OpenAI key** (or Chrome →
   Extensions → this extension → **Extension options**).
2. Paste your **OpenAI API key** and save. Keys are stored only in
   `chrome.storage.local` in this browser profile and are sent only to
   `https://api.openai.com` from the **service worker** (never hard-code a key
   in the repo).
3. Optional: set a model id (default `gpt-4o-mini`).

On each post detail page, the extension reads a **title** and **description**
from the DOM, asks the model for a short comment (at most **3 lines**), then
falls back to the built-in template generator if the key is missing or the
API errors.

### Global post ledger + LinkedIn `localStorage` mirror

Every visited post path is recorded under `topContentPostLedger` in
`chrome.storage.local` (title, category path, description snippet, timestamps,
outcome). Each post row stores **`categoryPath`** so the runner can tell when a
category already has **5 successful** comments even if `processedCategories`
was out of sync.

The extension **also mirrors** the ledger and a small run snapshot into
`localStorage` on `https://www.linkedin.com` (key `__lJobPipe_tc_mirror_v2__`).
That data **survives removing and reinstalling the extension** in the same
browser profile, because it lives under LinkedIn’s origin until you clear
site data for LinkedIn. On the next LinkedIn visit after reinstall, the
content script **hydrates** extension storage from that mirror.

Use **Extension options** to see completed categories, the post table, **Export
JSON backup**, **Import**, or **Clear all Top Content history** (clears
extension storage and queues a wipe of the mirror on the next LinkedIn load).

Do not paste API keys into chat or source control; revoke any exposed key in
the OpenAI dashboard and create a new one.

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
