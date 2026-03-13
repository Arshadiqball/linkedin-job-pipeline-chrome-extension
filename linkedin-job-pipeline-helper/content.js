(function bootContent(globalObj) {
  const pipeline = globalObj.LinkedInPipeline;
  const { log, nowIso } = pipeline.utils;
  const { initObserver, detectJobCards } = pipeline.observer;
  const { extractJobData, detectEasyApply, captureExternalApplyLink } = pipeline.extractor;
  const { categorizeRole, detectJobType } = pipeline.classifier;
  const { calculatePriorityScore } = pipeline.prioritizer;
  const { saveJob, updateJob, removeJob } = pipeline.storage;

  const EXTERNAL_LINK_POLL_MS = 2500;
  const RESCAN_INTERVAL_MS = 5000;
  const EASY_APPLY_RECHECK_MS = 800;
  let lastCaptured = "";
  let observerRef = null;

  function isLinkedInJobsPage() {
    return /^https:\/\/www\.linkedin\.com\/jobs\//i.test(window.location.href);
  }

  function isValidJob(data) {
    if (!data.jobId) return false;
    if (!data.jobTitle) return false;
    if (!data.companyName && !data.location) return false;
    return true;
  }

  async function processCard(card) {
    const jobData = extractJobData(card);

    if (!isValidJob(jobData)) {
      if (jobData.jobId || jobData.jobTitle) {
        log("Incomplete card skipped", {
          jobId: jobData.jobId || "(none)",
          title: jobData.jobTitle || "(none)",
          company: jobData.companyName || "(none)"
        });
      }
      return;
    }

    log("Job detected", { jobId: jobData.jobId, title: jobData.jobTitle });

    if (detectEasyApply(card)) {
      log("Easy Apply skipped", { jobId: jobData.jobId });
      return;
    }

    const roleCategory = categorizeRole(jobData.jobTitle);
    const jobType = detectJobType(jobData.location);
    const enriched = {
      ...jobData,
      roleCategory,
      jobType,
      priorityScore: 0,
      timestamp: nowIso(),
      source: "linkedin"
    };

    log("Role categorized", { jobId: enriched.jobId, roleCategory: enriched.roleCategory });

    enriched.priorityScore = calculatePriorityScore(enriched);
    log("Job prioritized", { jobId: enriched.jobId, priorityScore: enriched.priorityScore });

    await saveJob(enriched);

    scheduleEasyApplyRecheck(card, enriched.jobId);
  }

  function scheduleEasyApplyRecheck(card, jobId) {
    setTimeout(async () => {
      if (detectEasyApply(card)) {
        log("Easy Apply detected on recheck — removing", { jobId });
        await removeJob(jobId);
      }
    }, EASY_APPLY_RECHECK_MS);

    setTimeout(async () => {
      if (detectEasyApply(card)) {
        log("Easy Apply detected on second recheck — removing", { jobId });
        await removeJob(jobId);
      }
    }, EASY_APPLY_RECHECK_MS * 3);
  }

  async function applyExternalLinkIfAvailable() {
    const captured = captureExternalApplyLink();
    if (!captured || !captured.externalApplyLink) return;

    const captureKey = `${captured.jobId}:${captured.externalApplyLink}`;
    if (captureKey === lastCaptured) return;
    lastCaptured = captureKey;

    const patch = { externalApplyLink: captured.externalApplyLink };
    const updated = await updateJob(captured.jobId, patch);
    if (!updated) return;

    const { getJobs } = pipeline.storage;
    const jobs = await getJobs();
    const target = jobs.find((job) => job.jobId === captured.jobId);
    if (!target) return;

    const priorityScore = calculatePriorityScore(target);
    await updateJob(captured.jobId, { priorityScore });
    log("Job prioritized", { jobId: captured.jobId, priorityScore });
  }

  function initExternalLinkWatcher() {
    const detailsObserver = new MutationObserver(() => {
      void applyExternalLinkIfAvailable();
    });
    detailsObserver.observe(document.body, { childList: true, subtree: true });
    window.setInterval(() => {
      void applyExternalLinkIfAvailable();
    }, EXTERNAL_LINK_POLL_MS);
  }

  function processNewCards(cards) {
    cards.forEach((card) => {
      void processCard(card);
    });
  }

  function startPeriodicRescan() {
    window.setInterval(() => {
      if (!isLinkedInJobsPage()) return;
      const cards = detectJobCards(document);
      if (cards.length) processNewCards(cards);
    }, RESCAN_INTERVAL_MS);
  }

  let lastUrl = window.location.href;
  function watchSpaNavigation() {
    window.setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        log("SPA navigation detected", { url: lastUrl });
        if (isLinkedInJobsPage()) {
          setTimeout(() => {
            const cards = detectJobCards(document);
            log(`Post-navigation scan found ${cards.length} card(s)`);
            processNewCards(cards);
          }, 1500);
        }
      }
    }, 1000);
  }

  async function bootstrap() {
    if (!isLinkedInJobsPage()) {
      log("Not a LinkedIn Jobs page, watching for SPA navigation");
      watchSpaNavigation();
      return;
    }

    log("Bootstrapping pipeline on " + window.location.href);

    observerRef = initObserver(processNewCards);
    initExternalLinkWatcher();
    await applyExternalLinkIfAvailable();
    startPeriodicRescan();
    watchSpaNavigation();
  }

  void bootstrap();
})(globalThis);
