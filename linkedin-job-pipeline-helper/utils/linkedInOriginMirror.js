(function registerLinkedInOriginMirror(globalObj) {
  const ns = (globalObj.LinkedInTopContent = globalObj.LinkedInTopContent || {});

  const MIRROR_KEY = "__lJobPipe_tc_mirror_v2__";
  const LEDGER_KEY = "topContentPostLedger";
  const STATE_KEY = "topContentRunState";

  function normalizePath(url) {
    if (!url) return "";
    try {
      const u = new URL(url, "https://www.linkedin.com");
      return (u.pathname || "").replace(/\/+$/, "");
    } catch (_e) {
      return String(url).split("?")[0].replace(/\/+$/, "");
    }
  }

  function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
  }

  function readMirror() {
    try {
      const raw = globalObj.localStorage.getItem(MIRROR_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 2) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function writeMirror(payload) {
    try {
      globalObj.localStorage.setItem(MIRROR_KEY, JSON.stringify(payload));
    } catch (e) {
      try {
        console.warn("[LinkedIn Top Content] origin mirror write failed", e && e.message);
      } catch (_e2) {}
    }
  }

  function mergePostRows(a, b) {
    const ta = (a && (a.updatedAt || a.firstVisitedAt)) || 0;
    const tb = (b && (b.updatedAt || b.firstVisitedAt)) || 0;
    const newer = ta >= tb ? a : b;
    const older = ta >= tb ? b : a;
    return Object.assign({}, older, newer, {
      categoryPath: (newer && newer.categoryPath) || (older && older.categoryPath) || ""
    });
  }

  function mergeLedgers(chromeLedger, mirrorLedger) {
    const A = (chromeLedger && chromeLedger.posts) || {};
    const B = (mirrorLedger && mirrorLedger.posts) || {};
    const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
    const posts = {};
    keys.forEach((k) => {
      posts[k] = mergePostRows(A[k] || {}, B[k] || {});
    });
    return { version: 1, posts };
  }

  function categoriesCompleteFromLedger(posts, maxPerCategory) {
    const counts = new Map();
    for (const row of Object.values(posts || {})) {
      const cat = normalizePath(row && row.categoryPath);
      if (!cat) continue;
      const posted = row.lastOutcome === "posted" || Boolean(row.commentedAt);
      if (!posted) continue;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    const done = [];
    counts.forEach((n, cat) => {
      if (n >= maxPerCategory) done.push(cat);
    });
    return done;
  }

  function mergeRunSnapshots(chromeState, mirrorSnap, mergedPosts, maxPerCategory) {
    const m = mirrorSnap || {};
    const c = chromeState || {};
    const fromLedger = categoriesCompleteFromLedger(mergedPosts, maxPerCategory);
    const processed = uniq(
      [
        ...(Array.isArray(c.processedCategories) ? c.processedCategories : []),
        ...(Array.isArray(m.processedCategories) ? m.processedCategories : []),
        ...fromLedger
      ].map((p) => normalizePath(p))
    );

    const pathKeys = Object.keys(mergedPosts || {});
    const commented = uniq(
      [
        ...(Array.isArray(c.commentedPosts) ? c.commentedPosts : []),
        ...(Array.isArray(m.commentedPosts) ? m.commentedPosts : []),
        ...pathKeys
      ].map((p) => normalizePath(p))
    );

    let currentCategoryUrl = c.currentCategoryUrl || m.currentCategoryUrl || null;
    let currentCategoryPostCount = Number(c.currentCategoryPostCount || m.currentCategoryPostCount || 0) || 0;
    const curNorm = currentCategoryUrl ? normalizePath(currentCategoryUrl) : "";
    if (curNorm && processed.includes(curNorm)) {
      currentCategoryUrl = null;
      currentCategoryPostCount = 0;
    } else if (curNorm) {
      let postedHere = 0;
      for (const row of Object.values(mergedPosts || {})) {
        if (normalizePath(row.categoryPath) !== curNorm) continue;
        if (row.lastOutcome === "posted" || row.commentedAt) postedHere++;
      }
      currentCategoryPostCount = Math.max(currentCategoryPostCount, postedHere);
    }

    return {
      processedCategories: processed,
      commentedPosts: commented,
      currentCategoryUrl,
      currentCategoryPostCount,
      currentPostUrl: c.currentPostUrl || m.currentPostUrl || null
    };
  }

  function hydrateToChrome(maxPerCategory) {
    const max = Number(maxPerCategory) || 5;
    return new Promise((resolve) => {
      const mirror = readMirror();
      chrome.storage.local.get([LEDGER_KEY, STATE_KEY], (res) => {
        const chromeLedger = res[LEDGER_KEY] || { version: 1, posts: {} };
        const mirrorLedger = (mirror && mirror.postLedger) || { version: 1, posts: {} };
        const mergedPosts = mergeLedgers(chromeLedger, mirrorLedger);
        const chromeState = res[STATE_KEY] || null;
        const mirrorSnap = mirror && mirror.runSnapshot;
        const mergedRun = mergeRunSnapshots(chromeState, mirrorSnap, mergedPosts.posts, max);

        const nextState = Object.assign({}, chromeState || {}, {
          commentedPosts: mergedRun.commentedPosts,
          processedCategories: mergedRun.processedCategories,
          currentCategoryUrl: mergedRun.currentCategoryUrl,
          currentCategoryPostCount: mergedRun.currentCategoryPostCount,
          currentPostUrl: mergedRun.currentPostUrl,
          updatedAt: Date.now()
        });

        chrome.storage.local.set(
          {
            [LEDGER_KEY]: mergedPosts,
            [STATE_KEY]: nextState
          },
          () => {
            writeMirror({
              version: 2,
              updatedAt: Date.now(),
              postLedger: mergedPosts,
              runSnapshot: {
                processedCategories: mergedRun.processedCategories,
                commentedPosts: mergedRun.commentedPosts,
                currentCategoryUrl: mergedRun.currentCategoryUrl,
                currentCategoryPostCount: mergedRun.currentCategoryPostCount,
                currentPostUrl: mergedRun.currentPostUrl
              }
            });
            resolve({ ok: true });
          }
        );
      });
    });
  }

  function persistFromChrome(maxPerCategory) {
    const max = Number(maxPerCategory) || 5;
    return new Promise((resolve) => {
      chrome.storage.local.get([LEDGER_KEY, STATE_KEY], (res) => {
        const ledger = res[LEDGER_KEY] || { version: 1, posts: {} };
        const st = res[STATE_KEY] || {};
        const snap = {
          processedCategories: uniq(
            (Array.isArray(st.processedCategories) ? st.processedCategories : [])
              .map(normalizePath)
              .concat(categoriesCompleteFromLedger(ledger.posts, max))
          ),
          commentedPosts: uniq(
            (Array.isArray(st.commentedPosts) ? st.commentedPosts : [])
              .map(normalizePath)
              .concat(Object.keys(ledger.posts || {}))
          ),
          currentCategoryUrl: st.currentCategoryUrl || null,
          currentCategoryPostCount: st.currentCategoryPostCount || 0,
          currentPostUrl: st.currentPostUrl || null
        };
        writeMirror({
          version: 2,
          updatedAt: Date.now(),
          postLedger: ledger,
          runSnapshot: snap
        });
        resolve({ ok: true });
      });
    });
  }

  ns.originMirror = {
    MIRROR_KEY,
    readMirror,
    writeMirror,
    hydrateToChrome,
    persistFromChrome,
    normalizePath,
    categoriesCompleteFromLedger
  };
})(globalThis);
