(function registerCategoryExtractor(globalObj) {
  const ns = (globalObj.LinkedInTopContent = globalObj.LinkedInTopContent || {});

  const POST_SELECTORS = [
    "div.feed-shared-update-v2",
    "li.feed-shared-update-v2",
    "article[data-urn^='urn:li:activity']",
    "div[data-urn^='urn:li:activity']",
    "div.update-components-update-v2",
    // Top Content / keyword landing pages (e.g. /top-content/business-strategy/)
    "article.main-feed-activity-card",
    "article.keyword-landing-page__post",
    "article[data-activity-urn]",
    "article[data-featured-activity-urn]"
  ];

  const HEADING_SELECTORS = [
    "h1",
    "h2",
    "h3",
    "h4",
    "[role='heading']",
    "[data-test-id*='category' i]",
    "[class*='category' i]",
    "[class*='topic' i]",
    "[class*='title' i]",
    "span[aria-label]",
    "strong"
  ].join(", ");
  const MAX_POSTS_PER_CATEGORY = 5;

  function textOf(el) {
    return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
  }

  function isPlausibleCategoryName(text) {
    if (!text) return false;
    if (text.length < 2 || text.length > 120) return false;
    // Filter out common non-category headings
    const deny = /^(linkedin|feed|jobs|messaging|notifications|my network|search|comments?|reactions?|home|for you|follow|all)$/i;
    if (deny.test(text)) return false;
    // Filter likely UI labels/buttons
    if (/^(see more|show more|view all|learn more|sort|filter|save|share|follow)$/i.test(text)) return false;
    if (text.split(" ").length > 12) return false;
    return true;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    return true;
  }

  function queryPosts(container) {
    const out = [];
    for (const sel of POST_SELECTORS) {
      const nodes = container.querySelectorAll(sel);
      nodes.forEach((n) => {
        if (!out.includes(n)) out.push(n);
      });
    }
    return out;
  }

  function collectPostsInContainer(container, seen) {
    const out = [];
    const nodes = queryPosts(container);
    nodes.forEach((n) => {
      if (!isVisible(n)) return;
      if (seen.has(n)) return;
      // Skip nested duplicates
      if (out.some((existing) => existing.contains(n) || n.contains(existing))) return;
      seen.add(n);
      out.push(n);
    });
    return out.slice(0, MAX_POSTS_PER_CATEGORY);
  }

  function resolveScopeForHeading(heading) {
    // Prefer a dedicated section/category container if present
    const preferred = heading.closest(
      "section, [role='region'], [data-test-id*='category' i], [class*='category' i], [class*='section' i]"
    );
    if (preferred && preferred !== document.body) return preferred;

    // Fallback: walk up until we find an ancestor that contains at least one post
    let cursor = heading.parentElement;
    while (cursor && cursor !== document.body) {
      for (const sel of POST_SELECTORS) {
        if (cursor.querySelector(sel)) return cursor;
      }
      cursor = cursor.parentElement;
    }
    return null;
  }

  function extractByHeadingScopes(doc, seenPosts) {
    const headings = Array.from(doc.querySelectorAll(HEADING_SELECTORS));
    const categories = [];
    const usedScopes = new Set();

    for (const heading of headings) {
      const name = textOf(heading);
      if (!isPlausibleCategoryName(name)) continue;

      const scope = resolveScopeForHeading(heading);
      if (!scope || usedScopes.has(scope)) continue;

      const posts = collectPostsInContainer(scope, seenPosts);
      if (posts.length === 0) continue;

      usedScopes.add(scope);
      categories.push({ categoryName: name, posts });
    }

    return categories;
  }

  function extractByCategoryContainers(doc, seenPosts) {
    const categories = [];
    const candidates = Array.from(
      doc.querySelectorAll(
        "section, article, div[role='region'], div[class*='category' i], div[data-test-id*='category' i], div[class*='topic' i]"
      )
    );

    for (const container of candidates) {
      const posts = collectPostsInContainer(container, seenPosts);
      if (posts.length === 0) continue;

      const titleNode = container.querySelector(HEADING_SELECTORS);
      const name = textOf(titleNode) || "Top Content";
      if (!isPlausibleCategoryName(name) && name !== "Top Content") continue;

      categories.push({ categoryName: name, posts });
      if (categories.length >= 12) break;
    }

    return categories;
  }

  function collectGlobalVisiblePosts(doc, seenPosts) {
    const posts = collectPostsInContainer(doc, seenPosts);
    return posts.slice(0, MAX_POSTS_PER_CATEGORY);
  }

  function extractCategories(root) {
    const doc = root || document;
    const seenPosts = new WeakSet();
    const byHeadings = extractByHeadingScopes(doc, seenPosts);
    if (byHeadings.length > 0) return byHeadings;

    const byContainers = extractByCategoryContainers(doc, seenPosts);
    if (byContainers.length > 0) return byContainers;

    // Fallback: run against visible posts even when categories are not clearly labeled.
    const fallbackPosts = collectGlobalVisiblePosts(doc, seenPosts);
    if (fallbackPosts.length > 0) {
      return [{ categoryName: "Top Content", posts: fallbackPosts }];
    }

    return [];
  }

  ns.categoryExtractor = { extractCategories, MAX_POSTS_PER_CATEGORY };
})(globalThis);
