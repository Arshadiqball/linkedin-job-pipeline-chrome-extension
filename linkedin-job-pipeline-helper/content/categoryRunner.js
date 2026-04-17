(function registerCategoryRunner(globalObj) {
  const ns = (globalObj.LinkedInTopContent = globalObj.LinkedInTopContent || {});
  const LOG_PREFIX = "[LinkedIn Top Content]";

  function log(...args) {
    try { console.log(LOG_PREFIX, ...args); } catch (_e) {}
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 4 && rect.height > 4;
  }

  function normalizePath(url) {
    if (!url) return "";
    try {
      const u = new URL(url, location.origin);
      return (u.pathname || "").replace(/\/+$/, "");
    } catch (_e) {
      return String(url).split("?")[0].replace(/\/+$/, "");
    }
  }

  function waitFor(queryFn, { timeoutMs = 15000, intervalMs = 300 } = {}) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        let result = null;
        try { result = queryFn(); } catch (_e) { result = null; }
        if (result) return resolve(result);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---------- Page 1: /top-content/ hub ----------
  function findFirstCategoryLink(skipPaths) {
    const skip = skipPaths instanceof Set ? skipPaths : new Set(skipPaths || []);
    const anchors = Array.from(document.querySelectorAll("a[href*='/top-content/']"));
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      let path;
      try {
        path = new URL(a.href, location.origin).pathname;
      } catch (_e) {
        continue;
      }
      if (/^\/top-content\/?$/.test(path)) continue;
      if (!/^\/top-content\/[^/]+/.test(path)) continue;
      const norm = normalizePath(a.href);
      if (skip.has(norm)) continue;
      return a;
    }
    return null;
  }

  function waitForFirstCategoryLink(skipPaths, timeoutMs = 15000) {
    return waitFor(() => findFirstCategoryLink(skipPaths), { timeoutMs });
  }

  // ---------- Page 2: /top-content/<slug>/ category ----------
  const POST_SELECTORS = [
    "article.main-feed-activity-card",
    "article.keyword-landing-page__post",
    "article[data-activity-urn]",
    "article[data-featured-activity-urn]",
    "article[data-urn^='urn:li:activity']",
    "div.feed-shared-update-v2",
    "li.feed-shared-update-v2"
  ];

  function collectVisiblePosts() {
    const out = [];
    for (const sel of POST_SELECTORS) {
      document.querySelectorAll(sel).forEach((n) => {
        if (!isVisible(n)) return;
        if (out.some((existing) => existing.contains(n) || n.contains(existing))) return;
        out.push(n);
      });
    }
    return out;
  }

  function findCommentLinkInPost(post) {
    const candidates = [
      "a.social-action-bar__button[aria-label='Comment']",
      "a[data-feed-control='comment_box'][href*='/feed/update/']",
      "a[data-tracking-control-name*='comment-cta' i][href*='/feed/update/']",
      "a[aria-label='Comment'][href*='/feed/update/']",
      "a[href*='/feed/update/']"
    ];
    for (const sel of candidates) {
      const links = Array.from(post.querySelectorAll(sel));
      for (const link of links) {
        if (!link.href) continue;
        if (!isVisible(link)) continue;
        return link;
      }
    }
    return null;
  }

  function findUncommentedPostCommentLink(commentedPaths) {
    const commented = commentedPaths instanceof Set
      ? commentedPaths
      : new Set(commentedPaths || []);
    for (const post of collectVisiblePosts()) {
      const link = findCommentLinkInPost(post);
      if (!link) continue;
      const norm = normalizePath(link.href);
      if (commented.has(norm)) continue;
      return link;
    }
    return null;
  }

  async function waitForUncommentedPostCommentLink(commentedPaths, timeoutMs = 25000) {
    const start = Date.now();
    let found = findUncommentedPostCommentLink(commentedPaths);
    if (found) return found;

    let scrollStep = 0;
    while (Date.now() - start < timeoutMs) {
      try {
        window.scrollBy({
          top: Math.max(400, window.innerHeight * 0.8),
          behavior: "smooth"
        });
      } catch (_e) {}
      await sleep(900 + Math.floor(Math.random() * 600));
      found = findUncommentedPostCommentLink(commentedPaths);
      if (found) return found;
      scrollStep++;
      if (scrollStep > 10) break;
    }
    return null;
  }

  // ---------- Page 3: /feed/update/... post detail ----------
  const TITLE_SELECTORS = [
    "h1.break-words",
    ".update-components-actor__title span[dir='ltr']",
    ".feed-shared-actor__title span[dir='ltr']",
    ".update-components-actor__title",
    ".feed-shared-actor__title",
    ".update-components-actor__name span[dir='ltr']",
    ".feed-shared-actor__name span[dir='ltr']",
    "article h2",
    "[data-test-id='main-feed-activity-card'] .visually-hidden + span"
  ];

  function extractDetailPostTitleAndDescription() {
    let title = "";
    for (const sel of TITLE_SELECTORS) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length > 2 && t.length < 400) {
        title = t;
        break;
      }
    }
    if (!title) {
      const h1 = document.querySelector("h1");
      const ht = h1 ? (h1.textContent || "").replace(/\s+/g, " ").trim() : "";
      if (ht && ht.length < 400) title = ht;
    }

    const bodyNode =
      document.querySelector("[data-test-id='main-feed-activity-card__commentary']") ||
      document.querySelector(".feed-shared-update-v2__description") ||
      document.querySelector(".update-components-text") ||
      document.querySelector(".attributed-text-segment-list__content");
    const description = (bodyNode ? bodyNode.textContent : "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    return {
      title: title.slice(0, 400),
      description,
      combined: `${title}\n\n${description}`.replace(/\s+/g, " ").trim().slice(0, 4000)
    };
  }

  function extractDetailPostText() {
    const { description, combined } = extractDetailPostTitleAndDescription();
    const raw = description || combined;
    if (raw) return raw.slice(0, 600);
    const node = document.querySelector("article") || document.body;
    return ((node && node.textContent) || "").replace(/\s+/g, " ").trim().slice(0, 600);
  }

  function findLikeButtonOnDetail() {
    const scopes = [
      document.querySelector(".feed-shared-social-action-bar"),
      document.querySelector(".social-details-social-action-bar"),
      document.querySelector(".social-action-bar"),
      document
    ].filter(Boolean);

    for (const scope of scopes) {
      const toggles = Array.from(
        scope.querySelectorAll(
          "button[data-control-name='like_toggle'], button[data-feed-control='like_toggle'], button.react-button__trigger, button.reactions-react-button"
        )
      );
      for (const b of toggles) {
        const label = (b.getAttribute("aria-label") || "").toLowerCase();
        if (/open reactions menu/.test(label)) continue;
        if (isVisible(b)) return b;
      }
      const all = Array.from(scope.querySelectorAll("button"));
      const byText = all.find(
        (b) => /^like$/i.test((b.textContent || "").trim()) && isVisible(b)
      );
      if (byText) return byText;
      const byAria = all.find((b) => {
        const label = b.getAttribute("aria-label") || "";
        return /^(like|react like)\b/i.test(label) && isVisible(b);
      });
      if (byAria) return byAria;
    }
    return null;
  }

  function isAlreadyLiked(btn) {
    if (!btn) return false;
    if (btn.getAttribute("aria-pressed") === "true") return true;
    const label = (btn.getAttribute("aria-label") || "").toLowerCase();
    if (/unlike|remove like|reacted like/.test(label)) return true;
    if (btn.classList.contains("react-button--active")) return true;
    if (btn.classList.contains("active")) return true;
    return false;
  }

  async function likeOnDetailPage() {
    const btn = await waitFor(findLikeButtonOnDetail, { timeoutMs: 10000 });
    if (!btn) {
      log("like: button not found");
      return false;
    }
    if (isAlreadyLiked(btn)) {
      log("like: already liked");
      return true;
    }
    try { btn.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_e) {}
    await ns.timing.randomDelay(500, 1200);
    btn.click();
    log("like: clicked");
    await ns.timing.randomDelay(800, 1600);
    return true;
  }

  function findCommentEditor() {
    return (
      document.querySelector(".comments-comment-box div.ql-editor[contenteditable='true']") ||
      document.querySelector("div.ql-editor[contenteditable='true'][data-placeholder*='comment' i]") ||
      document.querySelector("div.ql-editor[contenteditable='true']") ||
      document.querySelector("div[role='textbox'][contenteditable='true']")
    );
  }

  function findSubmitButton() {
    const scope =
      document.querySelector(".comments-comment-box") ||
      document.querySelector(".comments-comment-texteditor") ||
      document;

    const selectors = [
      "button.comments-comment-box__submit-button--cr",
      "button.comments-comment-box__submit-button",
      "button[data-test-comments-comment-box-submit-button]"
    ];
    for (const sel of selectors) {
      const btn = scope.querySelector(sel);
      if (btn) return btn;
    }
    const buttons = Array.from(scope.querySelectorAll("button"));
    return (
      buttons.find((b) => /^(post|comment)$/i.test((b.textContent || "").trim())) || null
    );
  }

  async function typeIntoEditor(editor, text) {
    editor.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    } catch (_e) {}

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch (_e) {
      inserted = false;
    }
    if (!inserted) {
      try {
        editor.innerHTML = "";
        const p = document.createElement("p");
        p.textContent = text;
        editor.appendChild(p);
      } catch (_e) {
        editor.textContent = text;
      }
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
      );
    }
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function postCommentOnDetailPage(text) {
    if (!text || !text.trim()) {
      log("postCommentOnDetailPage: empty text, aborting");
      return false;
    }

    const editor = await waitFor(findCommentEditor, { timeoutMs: 20000 });
    if (!editor) {
      log("postCommentOnDetailPage: comment editor not found");
      return false;
    }

    try { editor.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_e) {}
    await ns.timing.randomDelay(600, 1400);

    await typeIntoEditor(editor, text);
    log("postCommentOnDetailPage: typed comment");

    await ns.timing.randomDelay(1200, 2400);

    const btn = await waitFor(() => {
      const b = findSubmitButton();
      if (!b) return null;
      if (b.disabled) return null;
      if (b.getAttribute("aria-disabled") === "true") return null;
      return b;
    }, { timeoutMs: 8000 });

    if (!btn) {
      log("postCommentOnDetailPage: submit button not available");
      return false;
    }

    btn.click();
    log("postCommentOnDetailPage: submit clicked");
    await ns.timing.randomDelay(1400, 2400);
    return true;
  }

  ns.categoryRunner = {
    log,
    waitFor,
    normalizePath,
    findFirstCategoryLink,
    waitForFirstCategoryLink,
    collectVisiblePosts,
    findCommentLinkInPost,
    findUncommentedPostCommentLink,
    waitForUncommentedPostCommentLink,
    extractDetailPostTitleAndDescription,
    extractDetailPostText,
    findLikeButtonOnDetail,
    isAlreadyLiked,
    likeOnDetailPage,
    postCommentOnDetailPage
  };
})(globalThis);
