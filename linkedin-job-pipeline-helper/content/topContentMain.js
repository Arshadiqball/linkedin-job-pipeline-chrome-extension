(function bootTopContent(globalObj) {
  const ns = globalObj.LinkedInTopContent;
  if (!ns || !ns.categoryRunner || !ns.timing || !ns.commentGenerator || !ns.originMirror) {
    console.warn("[LinkedIn Top Content] namespace not ready");
    return;
  }

  const R = ns.categoryRunner;
  const T = ns.timing;

  const STATE_KEY = "topContentRunState";
  const LEDGER_KEY = "topContentPostLedger";
  const HUB_URL = "https://www.linkedin.com/top-content/";
  const MAX_POSTS_PER_CATEGORY = 5;

  function log(...args) { R.log(...args); }

  function clampCommentToThreeLines(text) {
    const raw = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!raw) return "";
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("\n");
  }

  function getLedger() {
    return new Promise((resolve) => {
      chrome.storage.local.get([LEDGER_KEY], (res) => {
        const ledger = res[LEDGER_KEY];
        if (ledger && typeof ledger === "object" && ledger.posts && typeof ledger.posts === "object") {
          resolve(ledger);
          return;
        }
        resolve({ version: 1, posts: {} });
      });
    });
  }

  let mirrorTimer = null;
  function schedulePersistMirror() {
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(() => {
      void ns.originMirror.persistFromChrome(MAX_POSTS_PER_CATEGORY);
    }, 450);
  }

  function mergeLedger(mutator) {
    return new Promise((resolve) => {
      chrome.storage.local.get([LEDGER_KEY], (res) => {
        let ledger = res[LEDGER_KEY];
        if (!ledger || typeof ledger !== "object") ledger = { version: 1, posts: {} };
        if (!ledger.posts || typeof ledger.posts !== "object") ledger.posts = {};
        mutator(ledger.posts);
        ledger.version = 1;
        chrome.storage.local.set({ [LEDGER_KEY]: ledger }, () => {
          schedulePersistMirror();
          resolve();
        });
      });
    });
  }

  async function getCommentedPathSet() {
    const ledger = await getLedger();
    return new Set(Object.keys(ledger.posts || {}));
  }

  function getState() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STATE_KEY], (res) => {
          resolve((res && res[STATE_KEY]) || null);
        });
      } catch (_e) {
        resolve(null);
      }
    });
  }

  function setState(patch) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STATE_KEY], (res) => {
        const current = (res && res[STATE_KEY]) || {};
        const next = Object.assign({}, current, patch, { updatedAt: Date.now() });
        chrome.storage.local.set({ [STATE_KEY]: next }, () => {
          schedulePersistMirror();
          resolve(next);
        });
      });
    });
  }

  function ensureDefaults(state) {
    return {
      running: !!state.running,
      phase: state.phase || "start",
      startedAt: state.startedAt || Date.now(),
      currentCategoryUrl: state.currentCategoryUrl || null,
      currentCategoryPostCount: state.currentCategoryPostCount || 0,
      currentPostUrl: state.currentPostUrl || null,
      commentedPosts: Array.isArray(state.commentedPosts) ? state.commentedPosts : [],
      processedCategories: Array.isArray(state.processedCategories)
        ? state.processedCategories
        : []
    };
  }

  function isHubPage() {
    return /^\/top-content\/?$/.test(location.pathname);
  }
  function isCategoryPage() {
    const p = location.pathname;
    return /^\/top-content\/[^/]+/.test(p) && !/^\/top-content\/?$/.test(p);
  }
  function isPostDetailPage() {
    return /^\/feed\/update\//.test(location.pathname);
  }

  async function goTo(url, label) {
    log(`navigate → ${label || url}`);
    await T.randomDelay(800, 1600).catch(() => {});
    location.assign(url);
  }

  let busy = false;

  async function handleHub(state) {
    log(
      `hub: processed=${state.processedCategories.length} commented=${state.commentedPosts.length} ` +
        `current=${state.currentCategoryUrl ? R.normalizePath(state.currentCategoryUrl) : "(none)"} ` +
        `catCount=${state.currentCategoryPostCount}/${MAX_POSTS_PER_CATEGORY}`
    );
    await T.randomDelay(1200, 2400).catch(() => {});

    // Resume the in-progress category if it hasn't hit the 5-post cap.
    if (
      state.currentCategoryUrl &&
      state.currentCategoryPostCount < MAX_POSTS_PER_CATEGORY &&
      !state.processedCategories.includes(R.normalizePath(state.currentCategoryUrl))
    ) {
      await goTo(state.currentCategoryUrl, "resume category");
      return;
    }

    const ledger = await getLedger();
    const quotaDone = ns.originMirror.categoriesCompleteFromLedger(
      ledger.posts,
      MAX_POSTS_PER_CATEGORY
    );
    const skip = new Set([
      ...state.processedCategories.map((p) => R.normalizePath(p)),
      ...quotaDone
    ]);
    const link = await R.waitForFirstCategoryLink(skip, 20000);
    if (!link) {
      log("hub: no more unprocessed categories — run complete");
      await setState({
        running: false,
        phase: "complete",
        currentCategoryUrl: null,
        currentCategoryPostCount: 0,
        currentPostUrl: null
      });
      return;
    }

    const targetUrl = link.href;
    const label = (link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    log(`hub: next category → "${label}" (${R.normalizePath(targetUrl)})`);
    await setState({
      phase: "goto-category",
      currentCategoryUrl: targetUrl,
      currentCategoryPostCount: 0
    });
    await goTo(targetUrl, "category");
  }

  async function handleCategory(state) {
    log(
      `category: ${location.pathname} count=${state.currentCategoryPostCount}/${MAX_POSTS_PER_CATEGORY}`
    );

    // If the 5-post cap is already reached, mark done and return to hub.
    if (state.currentCategoryPostCount >= MAX_POSTS_PER_CATEGORY) {
      const processed = state.processedCategories.slice();
      const norm = R.normalizePath(state.currentCategoryUrl || location.href);
      if (!processed.includes(norm)) processed.push(norm);
      await setState({
        processedCategories: processed,
        currentCategoryUrl: null,
        currentCategoryPostCount: 0,
        currentPostUrl: null,
        phase: "category-done"
      });
      await goTo(HUB_URL, "hub (category done)");
      return;
    }

    // Make sure the current category tracked matches the page we're on.
    if (!state.currentCategoryUrl) {
      await setState({ currentCategoryUrl: location.href });
    }

    await T.randomDelay(2000, 3500).catch(() => {});

    const ledgerPaths = await getCommentedPathSet();
    const commented = new Set([...ledgerPaths, ...state.commentedPosts]);
    const link = await R.waitForUncommentedPostCommentLink(commented, 30000);
    if (!link) {
      log("category: no more uncommented posts — marking done and returning to hub");
      const processed = state.processedCategories.slice();
      const norm = R.normalizePath(state.currentCategoryUrl || location.href);
      if (!processed.includes(norm)) processed.push(norm);
      await setState({
        processedCategories: processed,
        currentCategoryUrl: null,
        currentCategoryPostCount: 0,
        currentPostUrl: null,
        phase: "category-done"
      });
      await goTo(HUB_URL, "hub (category exhausted)");
      return;
    }

    const targetUrl = link.href;
    const normTarget = R.normalizePath(targetUrl);
    log(`category: opening post ${normTarget}`);
    await setState({
      phase: "goto-post",
      currentPostUrl: normTarget
    });
    await goTo(targetUrl, "post detail");
  }

  async function handlePostDetail(state) {
    log(`post-detail: ${location.pathname}`);
    await T.randomDelay(2500, 4000).catch(() => {});

    const postPath = R.normalizePath(location.href);
    const catNorm = state.currentCategoryUrl ? R.normalizePath(state.currentCategoryUrl) : "";
    const td = R.extractDetailPostTitleAndDescription();
    const postText = R.extractDetailPostText();

    await mergeLedger((posts) => {
      const prev = posts[postPath] || {};
      posts[postPath] = Object.assign({}, prev, {
        path: postPath,
        categoryPath: catNorm || prev.categoryPath || "",
        title: (td.title || prev.title || "").slice(0, 400),
        descriptionSnippet: (td.description || prev.descriptionSnippet || "").slice(0, 2000),
        firstVisitedAt: prev.firstVisitedAt || Date.now(),
        updatedAt: Date.now(),
        lastOutcome: "in_progress"
      });
    });

    const commented = state.commentedPosts.slice();
    if (!commented.includes(postPath)) commented.push(postPath);
    if (state.currentPostUrl && state.currentPostUrl !== postPath) {
      if (!commented.includes(state.currentPostUrl)) commented.push(state.currentPostUrl);
    }

    try {
      await R.likeOnDetailPage();
    } catch (e) {
      log("post-detail: like error", e && e.message ? e.message : e);
    }

    let comment = "";
    try {
      const ai = await chrome.runtime.sendMessage({
        type: "OPENAI_GENERATE_COMMENT",
        title: td.title,
        description: td.description || td.combined,
        postText
      });
      if (ai && ai.ok && ai.text) {
        comment = clampCommentToThreeLines(ai.text);
        log("post-detail: OpenAI comment ready");
      } else {
        log("post-detail: OpenAI unavailable —", ai && ai.error ? ai.error : "unknown");
      }
    } catch (e) {
      log("post-detail: OpenAI message error", e && e.message ? e.message : e);
    }
    if (!comment) {
      comment = clampCommentToThreeLines(ns.commentGenerator.generateComment(postText));
    }
    log("post-detail: comment draft →", comment);

    let ok = false;
    try {
      ok = await R.postCommentOnDetailPage(comment);
    } catch (e) {
      log("post-detail: comment error", e && e.message ? e.message : e);
    }
    log(ok ? "post-detail: comment posted ✓" : "post-detail: comment NOT posted");

    await mergeLedger((posts) => {
      const prev = posts[postPath] || { path: postPath };
      const next = Object.assign({}, prev, {
        lastOutcome: ok ? "posted" : "failed",
        lastCommentAttemptAt: Date.now(),
        updatedAt: Date.now(),
        categoryPath: prev.categoryPath || catNorm || ""
      });
      if (ok) {
        next.commentedAt = Date.now();
        next.lastCommentText = String(comment || "").slice(0, 2000);
      }
      posts[postPath] = next;
    });

    let count = state.currentCategoryPostCount;
    if (ok) count += 1;

    const processed = state.processedCategories.slice();
    let currentCategoryUrl = state.currentCategoryUrl;
    if (count >= MAX_POSTS_PER_CATEGORY && currentCategoryUrl) {
      const norm = R.normalizePath(currentCategoryUrl);
      if (!processed.includes(norm)) processed.push(norm);
      log(`post-detail: category quota reached (${MAX_POSTS_PER_CATEGORY}) — marking done`);
      currentCategoryUrl = null;
      count = 0;
    }

    const ledgerPaths = await getCommentedPathSet();
    const mergedCommented = Array.from(new Set([...ledgerPaths, ...commented]));

    await setState({
      phase: ok ? "post-done" : "post-failed",
      commentedPosts: mergedCommented,
      processedCategories: processed,
      currentCategoryUrl,
      currentCategoryPostCount: count,
      currentPostUrl: null,
      lastOk: !!ok
    });

    await T.randomDelay(2500, 5000).catch(() => {});
    await goTo(HUB_URL, "hub (cycle)");
  }

  async function dispatch() {
    if (busy) return;
    busy = true;
    try {
      const raw = await getState();
      if (!raw || !raw.running) return;
      const state = ensureDefaults(raw);

      if (isPostDetailPage()) {
        await handlePostDetail(state);
      } else if (isHubPage()) {
        await handleHub(state);
      } else if (isCategoryPage()) {
        await handleCategory(state);
      } else {
        log("dispatch: unrecognized page", location.pathname);
      }
    } finally {
      busy = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "LINKEDIN_TOP_CONTENT_START") return;
    void (async () => {
      const existing = await getState();
      const base = existing || {};
      const ledger = await getLedger();
      const ledgerPaths = Object.keys(ledger.posts || {}).map((p) => R.normalizePath(p));
      const quotaDone = ns.originMirror.categoriesCompleteFromLedger(
        ledger.posts,
        MAX_POSTS_PER_CATEGORY
      );
      const commentedPosts = Array.from(
        new Set([...(base.commentedPosts || []), ...ledgerPaths].map((p) => R.normalizePath(p)))
      );
      const processedCategories = Array.from(
        new Set(
          [...(base.processedCategories || []).map((p) => R.normalizePath(p)), ...quotaDone]
        )
      );

      let currentCategoryUrl = base.currentCategoryUrl || null;
      let currentCategoryPostCount = Number(base.currentCategoryPostCount) || 0;
      if (currentCategoryUrl) {
        const cn = R.normalizePath(currentCategoryUrl);
        if (processedCategories.includes(cn)) {
          currentCategoryUrl = null;
          currentCategoryPostCount = 0;
        } else {
          let postedHere = 0;
          for (const row of Object.values(ledger.posts || {})) {
            if (R.normalizePath(row.categoryPath || "") !== cn) continue;
            if (row.lastOutcome === "posted" || row.commentedAt) postedHere++;
          }
          currentCategoryPostCount = Math.max(currentCategoryPostCount, postedHere);
          if (currentCategoryPostCount >= MAX_POSTS_PER_CATEGORY) {
            if (!processedCategories.includes(cn)) processedCategories.push(cn);
            currentCategoryUrl = null;
            currentCategoryPostCount = 0;
          }
        }
      }

      const next = Object.assign({}, base, {
        commentedPosts,
        processedCategories,
        currentCategoryUrl,
        currentCategoryPostCount,
        currentPostUrl: null,
        running: true,
        phase: "start",
        startedAt: Date.now()
      });
      chrome.storage.local.set({ [STATE_KEY]: next }, () => {
        sendResponse({ ok: true });
        dispatch();
      });
    })();
    return true;
  });

  function watchForSpaNavigation() {
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => { dispatch(); }, 1500);
      }
    }, 1000);
  }

  async function boot() {
    try {
      await new Promise((resolve) => {
        chrome.storage.local.get(["topContentClearMirrorPending"], (res) => {
          if (res.topContentClearMirrorPending) {
            try { globalObj.localStorage.removeItem(ns.originMirror.MIRROR_KEY); } catch (_e) {}
            chrome.storage.local.remove(["topContentClearMirrorPending"], () => resolve());
          } else resolve();
        });
      });
      await ns.originMirror.hydrateToChrome(MAX_POSTS_PER_CATEGORY);
      log("origin mirror: synced linkedin.com storage ↔ extension");
    } catch (e) {
      log("origin mirror hydrate error", e && e.message ? e.message : e);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", dispatch, { once: true });
    } else {
      dispatch();
    }
    watchForSpaNavigation();
  }

  void boot();
})(globalThis);
