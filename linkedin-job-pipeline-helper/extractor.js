(function registerExtractor(globalObj) {
  const {
    log,
    nowIso,
    textOrEmpty,
    parseJobIdFromCard,
    parseJobIdFromHref
  } = globalObj.LinkedInPipeline.utils;

  const TITLE_SELECTORS = [
    ".job-card-list__title strong",
    ".job-card-list__title span",
    ".job-card-list__title",
    ".job-card-container__link strong",
    ".job-card-container__link span",
    ".job-card-container__link",
    "a.job-card-list__title",
    ".artdeco-entity-lockup__title a span",
    ".artdeco-entity-lockup__title a",
    ".artdeco-entity-lockup__title span",
    ".artdeco-entity-lockup__title",
    'a[data-control-name="job_card_title"] span',
    'a[data-control-name="job_card_title"]',
    '[class*="job-card"] a[href*="/jobs/view/"] span',
    'a[href*="/jobs/view/"] span',
    'a[href*="/jobs/view/"]'
  ];

  const COMPANY_SELECTORS = [
    ".job-card-container__company-name",
    ".job-card-container__primary-description",
    ".artdeco-entity-lockup__subtitle > span:first-child",
    ".artdeco-entity-lockup__subtitle span",
    ".artdeco-entity-lockup__subtitle",
    '[class*="company-name"]',
    '[data-control-name="job_card_company"]'
  ];

  const LOCATION_SELECTORS = [
    ".job-card-container__metadata-item",
    ".job-card-container__metadata-wrapper li",
    ".artdeco-entity-lockup__caption > span:first-child",
    ".artdeco-entity-lockup__caption span",
    ".artdeco-entity-lockup__caption",
    '[class*="job-card"] .artdeco-entity-lockup__caption'
  ];

  const POSTED_TIME_SELECTORS = [
    "time",
    ".job-card-list__footer-wrapper li",
    ".job-card-container__footer-item",
    ".job-card-container__listed-status",
    '[class*="listed-time"]',
    '[class*="posted-date"]'
  ];

  function leafText(node) {
    if (!node) return "";
    const children = node.children;
    if (children && children.length) {
      for (const child of children) {
        if (child.offsetParent === null && !child.getAttribute("aria-hidden")) continue;
        const t = textOrEmpty(child.innerText ?? child.textContent);
        if (t) return t;
      }
    }
    return textOrEmpty(node.innerText ?? node.textContent);
  }

  function queryText(root, selectors) {
    for (const selector of selectors) {
      try {
        const node = root.querySelector(selector);
        if (!node) continue;
        const text = leafText(node);
        if (text) return text;
      } catch (_) {
        /* skip invalid selector */
      }
    }
    return "";
  }

  function normalizeWhitespace(str) {
    return str.replace(/[\u00a0\u2007\u202f\u200b\s]+/g, " ");
  }

  function containsEasyApply(text) {
    const normalized = normalizeWhitespace(text.toLowerCase());
    return (
      normalized.includes("easy apply") ||
      normalized.includes("easyapply") ||
      normalized.includes("easy-apply")
    );
  }

  function detectEasyApply(card) {
    if (!card) return false;

    const scope = card.closest("li") || card;

    const easyApplyEls = scope.querySelectorAll(
      [
        'button[aria-label*="Easy Apply"]',
        '[aria-label*="Easy Apply"]',
        '.job-card-container__apply-method',
        '[class*="easy-apply"]',
        '[class*="easyApply"]',
        '[class*="footer"] li-icon',
        'li-icon[type="linkedin-bug"]',
        'svg[data-test-icon="linkedin-bug"]'
      ].join(", ")
    );

    for (const el of easyApplyEls) {
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      if (containsEasyApply(ariaLabel)) return true;

      const elText = (el.textContent || "").toLowerCase();
      if (containsEasyApply(elText)) return true;

      if (el.tagName === "LI-ICON" || el.tagName === "svg") return true;
    }

    const allText = scope.textContent || "";
    if (containsEasyApply(allText)) return true;

    const innerHtml = scope.innerHTML || "";
    if (/easy[\s\u00a0-]*apply/i.test(innerHtml)) return true;

    return false;
  }

  function extractJobData(card) {
    const jobTitle = queryText(card, TITLE_SELECTORS);
    const companyName = queryText(card, COMPANY_SELECTORS);
    const location = queryText(card, LOCATION_SELECTORS);
    const postedTime = queryText(card, POSTED_TIME_SELECTORS);

    const titleLinkNode = card.querySelector('a[href*="/jobs/view/"]');
    const jobLink = titleLinkNode?.href || "";
    const jobId =
      card.getAttribute("data-occludable-job-id") ||
      parseJobIdFromCard(card) ||
      parseJobIdFromHref(jobLink);

    return {
      jobId,
      jobTitle,
      companyName,
      location,
      postedTime,
      jobLink,
      externalApplyLink: "",
      timestamp: nowIso(),
      source: "linkedin"
    };
  }

  const EXTERNAL_APPLY_SELECTORS = [
    'a[data-control-name="jobdetails_topcard_external_apply"]',
    'a[data-control-name="jobdetails_topcard_inapply"]',
    '.jobs-apply-button[href]',
    'a.jobs-apply-button',
    'a[class*="apply-button"][href]:not([href*="linkedin.com/easy-apply"])',
    '.jobs-unified-top-card a[href]:not([href*="linkedin.com"])',
    'button[aria-label*="Apply"]'
  ];

  function captureExternalApplyLink() {
    for (const selector of EXTERNAL_APPLY_SELECTORS) {
      const node = document.querySelector(selector);
      if (!node) continue;

      const href = node.href || node.getAttribute("href") || "";
      if (!href || href.includes("easy-apply") || href.startsWith("javascript")) continue;
      if (href.includes("linkedin.com") && !href.includes("/jobs/view/")) continue;

      const detailsPanel =
        node.closest(".jobs-search__job-details--container") ||
        node.closest(".jobs-details") ||
        node.closest('[class*="job-details"]') ||
        document;

      const titleAnchor = detailsPanel.querySelector('a[href*="/jobs/view/"]');
      const activeLink = titleAnchor?.href || window.location.href;
      const jobId = parseJobIdFromHref(activeLink);

      if (!jobId) continue;

      log("External link captured", { jobId, href });
      return { jobId, externalApplyLink: href };
    }

    return null;
  }

  globalObj.LinkedInPipeline.extractor = {
    detectEasyApply,
    extractJobData,
    captureExternalApplyLink
  };
})(globalThis);
