(function registerPrioritizer(globalObj) {
  function calculatePriorityScore(job) {
    let score = 0;

    if (job.externalApplyLink) score += 40;
    if (job.jobType === "Remote") score += 25;

    if (/\b(senior|staff|lead|principal|sr\.?)\b/i.test(job.jobTitle || "")) {
      score += 15;
    }

    if (job.roleCategory && job.roleCategory !== "Other") {
      score += 10;
    }

    if (/\b(today|just now|hour|minute)\b/i.test(job.postedTime || "")) {
      score += 10;
    }

    return Math.max(0, Math.min(score, 100));
  }

  globalObj.LinkedInPipeline.prioritizer = {
    calculatePriorityScore
  };
})(globalThis);
