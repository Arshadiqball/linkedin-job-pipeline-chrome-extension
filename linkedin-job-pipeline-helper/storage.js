(function registerStorage(globalObj) {
  const { log, nowIso } = globalObj.LinkedInPipeline.utils;

  async function getJobs() {
    const { jobs } = await chrome.storage.local.get(["jobs"]);
    return Array.isArray(jobs) ? jobs : [];
  }

  async function saveJob(job) {
    if (!job.jobId || !job.jobTitle) {
      log("Save rejected — missing jobId or jobTitle", { jobId: job.jobId });
      return false;
    }

    const jobs = await getJobs();
    if (jobs.some((existing) => existing.jobId === job.jobId)) {
      return false;
    }

    jobs.push({ ...job, timestamp: job.timestamp || nowIso(), source: "linkedin" });
    await chrome.storage.local.set({ jobs });
    log("Job saved", { jobId: job.jobId, title: job.jobTitle });
    return true;
  }

  async function updateJob(jobId, patch) {
    if (!jobId) return false;

    const jobs = await getJobs();
    const targetIndex = jobs.findIndex((item) => item.jobId === jobId);
    if (targetIndex < 0) return false;

    jobs[targetIndex] = { ...jobs[targetIndex], ...patch };
    await chrome.storage.local.set({ jobs });
    return true;
  }

  async function removeJob(jobId) {
    if (!jobId) return false;
    const jobs = await getJobs();
    const filtered = jobs.filter((item) => item.jobId !== jobId);
    if (filtered.length === jobs.length) return false;
    await chrome.storage.local.set({ jobs: filtered });
    log("Job removed", { jobId });
    return true;
  }

  async function clearJobs() {
    await chrome.storage.local.set({ jobs: [] });
  }

  globalObj.LinkedInPipeline.storage = {
    getJobs,
    saveJob,
    updateJob,
    removeJob,
    clearJobs
  };
})(globalThis);
