(function initPopup(globalObj) {
  const { getJobs, clearJobs } = globalObj.LinkedInPipeline.storage;
  const { exportCSV, exportJSON } = globalObj.LinkedInPipeline.exporter;

  const LEDGER_KEY = "topContentPostLedger";
  const STATE_KEY = "topContentRunState";

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
    clearBtn: document.getElementById("clearBtn"),
    startCommentProcessBtn: document.getElementById("startCommentProcessBtn"),
    openTopContentOptionsBtn: document.getElementById("openTopContentOptionsBtn"),
    tabJobs: document.getElementById("tabJobs"),
    tabPosting: document.getElementById("tabPosting"),
    panelJobs: document.getElementById("panelJobs"),
    panelPosting: document.getElementById("panelPosting"),
    postingRefreshBtn: document.getElementById("postingRefreshBtn"),
    postingExportBackupBtn: document.getElementById("postingExportBackupBtn"),
    postingCategoriesList: document.getElementById("postingCategoriesList"),
    postingCategoriesEmpty: document.getElementById("postingCategoriesEmpty"),
    postingPostsBody: document.getElementById("postingPostsBody"),
    postingPostsEmpty: document.getElementById("postingPostsEmpty"),
    postingTableWrap: document.getElementById("postingTableWrap")
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

  function normalizePath(url) {
    if (!url) return "";
    try {
      const u = new URL(url, "https://www.linkedin.com");
      return (u.pathname || "").replace(/\/+$/, "");
    } catch (_e) {
      return String(url).split("?")[0].replace(/\/+$/, "");
    }
  }

  function setActiveTab(tab) {
    const isJobs = tab === "jobs";
    if (dom.tabJobs) {
      dom.tabJobs.classList.toggle("active", isJobs);
      dom.tabJobs.setAttribute("aria-selected", isJobs ? "true" : "false");
    }
    if (dom.tabPosting) {
      dom.tabPosting.classList.toggle("active", !isJobs);
      dom.tabPosting.setAttribute("aria-selected", !isJobs ? "true" : "false");
    }
    if (dom.panelJobs) dom.panelJobs.classList.toggle("hidden", !isJobs);
    if (dom.panelPosting) dom.panelPosting.classList.toggle("hidden", isJobs);
    if (!isJobs) renderPostingProgress();
  }

  function renderPostingProgress() {
    if (!dom.postingCategoriesList || !dom.postingPostsBody) return;
    chrome.storage.local.get([LEDGER_KEY, STATE_KEY], (res) => {
      const ledger = (res[LEDGER_KEY] && res[LEDGER_KEY].posts) || {};
      const st = res[STATE_KEY] || {};
      const processed = Array.isArray(st.processedCategories) ? st.processedCategories : [];

      dom.postingCategoriesList.innerHTML = "";
      if (!processed.length) {
        dom.postingCategoriesEmpty.classList.remove("hidden");
      } else {
        dom.postingCategoriesEmpty.classList.add("hidden");
        processed.forEach((p) => {
          const li = document.createElement("li");
          li.innerHTML = `<code>${escapeHtml(normalizePath(p))}</code> <span class="badge badge-category">done</span>`;
          dom.postingCategoriesList.appendChild(li);
        });
      }

      const rows = Object.entries(ledger).map(([path, row]) => ({ path, row: row || {} }));
      rows.sort((a, b) => (b.row.updatedAt || 0) - (a.row.updatedAt || 0));

      dom.postingPostsBody.innerHTML = "";
      if (!rows.length) {
        dom.postingPostsEmpty.classList.remove("hidden");
        dom.postingTableWrap.classList.add("hidden");
      } else {
        dom.postingPostsEmpty.classList.add("hidden");
        dom.postingTableWrap.classList.remove("hidden");
        rows.slice(0, 150).forEach(({ path, row }) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${escapeHtml(row.lastOutcome || "—")}</td>
            <td class="mono">${escapeHtml(normalizePath(row.categoryPath || "") || "—")}</td>
            <td>${escapeHtml((row.title || "").slice(0, 72) || "—")}</td>
            <td class="mono">${escapeHtml(path)}</td>`;
          dom.postingPostsBody.appendChild(tr);
        });
      }
    });
  }

  function exportPostingBackup() {
    chrome.storage.local.get([LEDGER_KEY, STATE_KEY], (res) => {
      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        topContentPostLedger: res[LEDGER_KEY] || { version: 1, posts: {} },
        topContentRunState: res[STATE_KEY] || {}
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "linkedin-top-content-backup.json";
      a.click();
      URL.revokeObjectURL(url);
    });
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

  const TOP_CONTENT_HUB_URL = "https://www.linkedin.com/top-content/";
  const TOP_CONTENT_MATCH = /^https:\/\/www\.linkedin\.com\/(top-content|feed\/update)\//i;

  function persistRunState() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(["topContentRunState"], (res) => {
          const existing = (res && res.topContentRunState) || {};
          const next = Object.assign(
            {
              commentedPosts: [],
              processedCategories: [],
              currentCategoryUrl: null,
              currentCategoryPostCount: 0,
              currentPostUrl: null
            },
            existing,
            { running: true, phase: "start", startedAt: Date.now() }
          );
          chrome.storage.local.set({ topContentRunState: next }, () => resolve());
        });
      } catch (_e) {
        resolve();
      }
    });
  }

  async function onStartCommentProcess() {
    dom.startCommentProcessBtn.disabled = true;
    const originalText = dom.startCommentProcessBtn.textContent;
    dom.startCommentProcessBtn.textContent = "Starting...";
    let resetDelayMs = 1400;

    function resetButton() {
      setTimeout(() => {
        dom.startCommentProcessBtn.textContent = originalText;
        dom.startCommentProcessBtn.disabled = false;
      }, resetDelayMs);
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs && tabs[0];

      if (!activeTab || !activeTab.id) {
        dom.startCommentProcessBtn.textContent = "No active tab";
        resetDelayMs = 1600;
        resetButton();
        return;
      }

      await persistRunState();

      const tabUrl = activeTab.url || "";
      const onSupportedPage = TOP_CONTENT_MATCH.test(tabUrl);

      if (onSupportedPage) {
        try {
          await chrome.tabs.sendMessage(activeTab.id, {
            type: "LINKEDIN_TOP_CONTENT_START"
          });
        } catch (_msgErr) {
          // Content script may not yet be ready — state is persisted, so dispatch
          // will run on next page load.
        }
        dom.startCommentProcessBtn.textContent = "Started";
        resetDelayMs = 1200;
      } else {
        await chrome.tabs.update(activeTab.id, { url: TOP_CONTENT_HUB_URL });
        dom.startCommentProcessBtn.textContent = "Opening Top Content…";
        resetDelayMs = 1600;
      }
      resetButton();
    } catch (_err) {
      dom.startCommentProcessBtn.textContent = "Start failed";
      resetDelayMs = 1800;
      resetButton();
    }
  }

  dom.refreshBtn.addEventListener("click", () => void refreshData());
  dom.sortBtn.addEventListener("click", sortByPriority);
  dom.exportCsvBtn.addEventListener("click", () => exportCSV(filteredJobs));
  dom.exportJsonBtn.addEventListener("click", () => exportJSON(filteredJobs));
  dom.clearBtn.addEventListener("click", () => void onClearData());
  dom.startCommentProcessBtn.addEventListener("click", () => void onStartCommentProcess());
  if (dom.openTopContentOptionsBtn) {
    dom.openTopContentOptionsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }
  if (dom.tabJobs) {
    dom.tabJobs.addEventListener("click", () => setActiveTab("jobs"));
  }
  if (dom.tabPosting) {
    dom.tabPosting.addEventListener("click", () => setActiveTab("posting"));
  }
  if (dom.postingRefreshBtn) {
    dom.postingRefreshBtn.addEventListener("click", () => renderPostingProgress());
  }
  if (dom.postingExportBackupBtn) {
    dom.postingExportBackupBtn.addEventListener("click", () => exportPostingBackup());
  }

  chrome.storage.onChanged.addListener(() => {
    renderPostingProgress();
  });

  void refreshData();
  renderPostingProgress();

  globalObj.LinkedInPipeline.popup = { renderTable, renderPostingProgress, setActiveTab };
})(globalThis);
