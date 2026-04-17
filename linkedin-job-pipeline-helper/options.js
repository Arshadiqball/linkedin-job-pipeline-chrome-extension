(function initOptions() {
  const LEDGER_KEY = "topContentPostLedger";
  const STATE_KEY = "topContentRunState";

  const apiKeyEl = document.getElementById("apiKey");
  const modelEl = document.getElementById("model");
  const saveBtn = document.getElementById("saveBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importFile = document.getElementById("importFile");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const statusEl = document.getElementById("status");
  const categoriesList = document.getElementById("categoriesList");
  const categoriesEmpty = document.getElementById("categoriesEmpty");
  const postsBody = document.getElementById("postsBody");
  const postsEmpty = document.getElementById("postsEmpty");

  function setStatus(text, isError) {
    statusEl.textContent = text || "";
    statusEl.style.color = isError ? "#a50d12" : "#0a5c0a";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function renderProgress() {
    chrome.storage.local.get([LEDGER_KEY, STATE_KEY], (res) => {
      const ledger = (res[LEDGER_KEY] && res[LEDGER_KEY].posts) || {};
      const st = res[STATE_KEY] || {};
      const processed = Array.isArray(st.processedCategories) ? st.processedCategories : [];

      categoriesList.innerHTML = "";
      if (!processed.length) {
        categoriesEmpty.style.display = "block";
      } else {
        categoriesEmpty.style.display = "none";
        processed.forEach((p) => {
          const li = document.createElement("li");
          li.innerHTML = `<code class="path">${escapeHtml(normalizePath(p))}</code> <span class="pill done">done</span>`;
          categoriesList.appendChild(li);
        });
      }

      const rows = Object.entries(ledger).map(([path, row]) => ({
        path,
        row: row || {}
      }));
      rows.sort((a, b) => (b.row.updatedAt || 0) - (a.row.updatedAt || 0));

      postsBody.innerHTML = "";
      if (!rows.length) {
        postsEmpty.style.display = "block";
      } else {
        postsEmpty.style.display = "none";
        rows.slice(0, 200).forEach(({ path, row }) => {
          const tr = document.createElement("tr");
          const out = escapeHtml(row.lastOutcome || "—");
          const cat = escapeHtml(normalizePath(row.categoryPath || ""));
          const title = escapeHtml((row.title || "").slice(0, 80));
          tr.innerHTML = `
            <td>${out}</td>
            <td><code class="path">${cat || "—"}</code></td>
            <td>${title || "—"}</td>
            <td><code class="path">${escapeHtml(path)}</code></td>`;
          postsBody.appendChild(tr);
        });
      }
    });
  }

  chrome.storage.local.get(["openaiApiKey", "openaiModel"], (res) => {
    if (res.openaiApiKey) {
      apiKeyEl.placeholder = "A key is already saved — paste a new key to replace it";
    }
    if (res.openaiModel) modelEl.value = res.openaiModel;
  });

  saveBtn.addEventListener("click", () => {
    const key = (apiKeyEl.value || "").trim();
    const model = (modelEl.value || "").trim() || "gpt-4o-mini";
    if (!key) {
      chrome.storage.local.remove(["openaiApiKey"], () => {
        setStatus("API key cleared. Comments will use the offline template until you save a key.");
      });
      return;
    }
    chrome.storage.local.set({ openaiApiKey: key, openaiModel: model }, () => {
      setStatus("API settings saved.");
      apiKeyEl.value = "";
      apiKeyEl.placeholder = "A key is already saved — paste a new key to replace it";
    });
  });

  exportBtn.addEventListener("click", () => {
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
      setStatus("Backup downloaded.");
    });
  });

  importFile.addEventListener("change", () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        const ledger = data.topContentPostLedger || data.postLedger || { version: 1, posts: {} };
        const run = data.topContentRunState || data.runSnapshot || {};
        if (!ledger.posts || typeof ledger.posts !== "object") {
          setStatus("Invalid backup: missing post ledger.", true);
          return;
        }
        const mergedRun = {
          commentedPosts: Array.isArray(run.commentedPosts) ? run.commentedPosts : [],
          processedCategories: Array.isArray(run.processedCategories) ? run.processedCategories : [],
          currentCategoryUrl: run.currentCategoryUrl || null,
          currentCategoryPostCount: Number(run.currentCategoryPostCount) || 0,
          currentPostUrl: null,
          running: false,
          phase: "idle",
          updatedAt: Date.now()
        };
        chrome.storage.local.set(
          {
            [LEDGER_KEY]: { version: 1, posts: ledger.posts },
            [STATE_KEY]: mergedRun,
            topContentClearMirrorPending: true
          },
          () => {
            setStatus("Import saved. Open linkedin.com once to resync the LinkedIn-side copy.");
            renderProgress();
          }
        );
      } catch (_e) {
        setStatus("Could not parse JSON file.", true);
      }
    };
    reader.readAsText(file);
  });

  clearHistoryBtn.addEventListener("click", () => {
    if (!window.confirm("Delete all Top Content progress and post ledger?")) return;
    chrome.storage.local.set(
      {
        [LEDGER_KEY]: { version: 1, posts: {} },
        [STATE_KEY]: {
          commentedPosts: [],
          processedCategories: [],
          currentCategoryUrl: null,
          currentCategoryPostCount: 0,
          currentPostUrl: null,
          running: false,
          phase: "idle",
          updatedAt: Date.now()
        },
        topContentClearMirrorPending: true
      },
      () => {
        setStatus("Cleared. Visit LinkedIn once to wipe the mirrored copy in site storage.");
        renderProgress();
      }
    );
  });

  chrome.storage.onChanged.addListener(() => renderProgress());
  renderProgress();
})();
