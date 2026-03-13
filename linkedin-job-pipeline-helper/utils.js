(function registerUtils(globalObj) {
  const NAMESPACE = "LinkedIn Pipeline";

  function log(message, payload) {
    if (payload !== undefined) {
      console.log(`[${NAMESPACE}] ${message}`, payload);
      return;
    }
    console.log(`[${NAMESPACE}] ${message}`);
  }

  function textOrEmpty(value) {
    return (value || "").trim();
  }

  function queryText(root, selectors) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node && textOrEmpty(node.textContent)) {
        return textOrEmpty(node.textContent);
      }
    }
    return "";
  }

  function parseJobIdFromHref(href) {
    if (!href) return "";
    const patterns = [/\/jobs\/view\/(\d+)/i, /currentJobId=(\d+)/i, /jobId=(\d+)/i];
    for (const pattern of patterns) {
      const match = href.match(pattern);
      if (match?.[1]) return match[1];
    }
    return "";
  }

  function parseJobIdFromCard(card) {
    const occludable = card.getAttribute("data-occludable-job-id");
    if (occludable && /^\d+$/.test(occludable.trim())) return occludable.trim();

    const dataAttr =
      card.getAttribute("data-entity-urn") ||
      card.getAttribute("data-job-id") ||
      card.dataset?.jobId ||
      card.dataset?.entityUrn ||
      "";

    const attrMatch = dataAttr.match(/(\d{5,})/);
    if (attrMatch?.[1]) return attrMatch[1];

    const link = card.querySelector('a[href*="/jobs/view/"]');
    return parseJobIdFromHref(link?.href || "");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  globalObj.LinkedInPipeline = globalObj.LinkedInPipeline || {};
  globalObj.LinkedInPipeline.utils = {
    log,
    nowIso,
    queryText,
    textOrEmpty,
    parseJobIdFromHref,
    parseJobIdFromCard
  };
})(globalThis);
