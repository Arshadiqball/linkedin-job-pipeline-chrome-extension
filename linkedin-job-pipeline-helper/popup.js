(function initPopup(globalObj) {
  const { getJobs, clearJobs } = globalObj.LinkedInPipeline.storage;
  const { exportCSV, exportJSON } = globalObj.LinkedInPipeline.exporter;

  const dom = {
    body: document.getElementById("jobsTableBody"),
    headerStats: document.getElementById("headerStats"),
    countryFilter: document.getElementById("countryFilter"),
    emptyState: document.getElementById("emptyState"),
    tableWrapper: document.getElementById("tableWrapper"),
    refreshBtn: document.getElementById("refreshBtn"),
    sortBtn: document.getElementById("sortBtn"),
    exportCsvBtn: document.getElementById("exportCsvBtn"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    clearBtn: document.getElementById("clearBtn")
  };

  let allJobs = [];
  let filteredJobs = [];
  let activeCountry = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildGoogleSearchUrl(companyName, jobTitle) {
    const query = `"${companyName}" "${jobTitle}" apply`;
    return "https://www.google.com/search?q=" + encodeURIComponent(query);
  }

  function parseCountry(location) {
    const loc = (location || "").trim();
    if (!loc) return "Unknown";
    const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (/remote|work from home|anywhere/i.test(last)) return "Remote";
    return last || "Unknown";
  }

  function buildCountryMap(jobs) {
    const map = new Map();
    for (const job of jobs) {
      const country = parseCountry(job.location);
      map.set(country, (map.get(country) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderCountryPills(jobs) {
    dom.countryFilter.innerHTML = "";
    const countryMap = buildCountryMap(jobs);
    if (countryMap.length === 0) return;

    const allPill = document.createElement("button");
    allPill.className = "country-pill" + (activeCountry === null ? " active" : "");
    allPill.innerHTML = `All <span class="pill-count">(${jobs.length})</span>`;
    allPill.addEventListener("click", () => { activeCountry = null; applyFilter(); });
    dom.countryFilter.appendChild(allPill);

    for (const [country, count] of countryMap) {
      const pill = document.createElement("button");
      pill.className = "country-pill" + (activeCountry === country ? " active" : "");
      pill.innerHTML = `${escapeHtml(country)} <span class="pill-count">(${count})</span>`;
      pill.addEventListener("click", () => { activeCountry = country; applyFilter(); });
      dom.countryFilter.appendChild(pill);
    }
  }

  function typeBadgeClass(type) {
    if (type === "Remote") return "badge-remote";
    if (type === "Hybrid") return "badge-hybrid";
    return "badge-onsite";
  }

  function scoreClass(score) {
    if (score >= 60) return "score-high";
    if (score >= 30) return "score-medium";
    return "score-low";
  }

  function renderHeaderStats(items) {
    const total = items.length;
    const ext = items.filter((j) => Boolean(j.externalApplyLink)).length;
    const remote = items.filter((j) => j.jobType === "Remote").length;

    dom.headerStats.innerHTML = `
      <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--green)">${ext}</div><div class="stat-label">External</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--purple)">${remote}</div><div class="stat-label">Remote</div></div>
    `;
  }

  function renderTable(items) {
    dom.body.innerHTML = "";

    if (items.length === 0) {
      dom.emptyState.classList.remove("hidden");
      dom.tableWrapper.classList.add("hidden");
      return;
    }

    dom.emptyState.classList.add("hidden");
    dom.tableWrapper.classList.remove("hidden");

    for (const job of items) {
      const tr = document.createElement("tr");
      const score = job.priorityScore ?? 0;
      const googleUrl = buildGoogleSearchUrl(job.companyName || "", job.jobTitle || "");

      let applyCell;
      if (job.externalApplyLink) {
        applyCell = `<a class="apply-link" href="${escapeHtml(job.externalApplyLink)}" target="_blank" rel="noreferrer noopener">Apply &#x2197;</a>`;
      } else {
        applyCell = `<a class="visit-link" href="${escapeHtml(googleUrl)}" target="_blank" rel="noreferrer noopener">Visit &#x1F50D;</a>`;
      }

      tr.innerHTML = `
        <td><span class="job-title">${escapeHtml(job.jobTitle)}</span></td>
        <td><span class="company-name">${escapeHtml(job.companyName)}</span></td>
        <td>${escapeHtml(job.location)}</td>
        <td><span class="badge ${typeBadgeClass(job.jobType)}">${escapeHtml(job.jobType)}</span></td>
        <td><span class="badge badge-category">${escapeHtml(job.roleCategory)}</span></td>
        <td><span class="score ${scoreClass(score)}">${score}</span></td>
        <td>${applyCell}</td>
      `;
      dom.body.appendChild(tr);
    }
  }

  function applyFilter() {
    if (activeCountry === null) {
      filteredJobs = [...allJobs];
    } else {
      filteredJobs = allJobs.filter((job) => parseCountry(job.location) === activeCountry);
    }
    renderCountryPills(allJobs);
    renderHeaderStats(filteredJobs);
    renderTable(filteredJobs);
  }

  async function refreshData() {
    allJobs = await getJobs();
    activeCountry = null;
    applyFilter();
  }

  function sortByPriority() {
    filteredJobs = [...filteredJobs].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    renderTable(filteredJobs);
  }

  async function onClearData() {
    await clearJobs();
    allJobs = [];
    activeCountry = null;
    applyFilter();
  }

  dom.refreshBtn.addEventListener("click", () => void refreshData());
  dom.sortBtn.addEventListener("click", sortByPriority);
  dom.exportCsvBtn.addEventListener("click", () => exportCSV(filteredJobs));
  dom.exportJsonBtn.addEventListener("click", () => exportJSON(filteredJobs));
  dom.clearBtn.addEventListener("click", () => void onClearData());

  void refreshData();

  globalObj.LinkedInPipeline.popup = { renderTable };
})(globalThis);
