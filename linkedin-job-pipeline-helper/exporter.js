(function registerExporter(globalObj) {
  function toPipelineRows(jobs) {
    return jobs.map((job) => ({
      jobTitle: job.jobTitle || "",
      companyName: job.companyName || "",
      location: job.location || "",
      jobType: job.jobType || "",
      roleCategory: job.roleCategory || "",
      externalApplyLink: job.externalApplyLink || "",
      jobLink: job.jobLink || "",
      priorityScore: job.priorityScore || 0
    }));
  }

  function downloadBlob(filename, mimeType, content) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportJSON(jobs) {
    const rows = toPipelineRows(jobs);
    downloadBlob("linkedin_external_jobs.json", "application/json", JSON.stringify(rows, null, 2));
  }

  function exportCSV(jobs) {
    const rows = toPipelineRows(jobs);
    const headers = [
      "jobTitle",
      "companyName",
      "location",
      "jobType",
      "roleCategory",
      "externalApplyLink",
      "priorityScore"
    ];

    const escapeCell = (value) => {
      const str = String(value ?? "");
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(","))
    ];

    downloadBlob("linkedin_external_jobs.csv", "text/csv;charset=utf-8", csvLines.join("\n"));
  }

  globalObj.LinkedInPipeline = globalObj.LinkedInPipeline || {};
  globalObj.LinkedInPipeline.exporter = {
    exportCSV,
    exportJSON
  };
})(globalThis);
