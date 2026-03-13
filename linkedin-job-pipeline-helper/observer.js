(function registerObserver(globalObj) {
  const { log } = globalObj.LinkedInPipeline.utils;

  const processedCardIds = new Set();
  const observedCards = new WeakSet();

  const CARD_SELECTORS = [
    "li[data-occludable-job-id]",
    ".jobs-search-results__list-item",
    ".job-card-container",
    ".job-card-list__entity-lockup",
    ".scaffold-layout__list-item",
    "[data-job-id]",
    'li.ember-view[id^="ember"]'
  ].join(", ");

  const LIST_CONTAINER_SELECTORS = [
    ".jobs-search-results-list",
    ".scaffold-layout__list-container",
    ".jobs-search-results__list",
    '[role="list"]'
  ];

  function getCardFingerprint(card) {
    return (
      card.getAttribute("data-occludable-job-id") ||
      card.getAttribute("data-entity-urn") ||
      card.getAttribute("data-job-id") ||
      card.dataset?.jobId ||
      card.querySelector('a[href*="/jobs/view/"]')?.href ||
      ""
    );
  }

  function isJobCard(el) {
    if (el.matches?.(CARD_SELECTORS)) return true;
    if (el.querySelector?.('a[href*="/jobs/view/"]')) return true;
    return false;
  }

  function detectJobCards(rootNode = document) {
    const fromSelectors = Array.from(rootNode.querySelectorAll(CARD_SELECTORS));
    if (fromSelectors.length) return fromSelectors;

    for (const containerSel of LIST_CONTAINER_SELECTORS) {
      const container = rootNode.querySelector(containerSel);
      if (!container) continue;
      const items = Array.from(container.children).filter(
        (child) => child.querySelector('a[href*="/jobs/view/"]')
      );
      if (items.length) return items;
    }

    return Array.from(
      rootNode.querySelectorAll('a[href*="/jobs/view/"]')
    ).reduce((cards, link) => {
      const card =
        link.closest("li") ||
        link.closest('[class*="job-card"]') ||
        link.parentElement?.parentElement;
      if (card && !cards.includes(card)) cards.push(card);
      return cards;
    }, []);
  }

  function shouldProcessCard(card) {
    if (!card || observedCards.has(card)) return false;

    const fingerprint = getCardFingerprint(card);
    if (fingerprint && processedCardIds.has(fingerprint)) return false;

    observedCards.add(card);
    if (fingerprint) processedCardIds.add(fingerprint);
    return true;
  }

  function initObserver(onCardsDetected) {
    const processBatch = (cards) => {
      const newCards = cards.filter(shouldProcessCard);
      if (newCards.length) {
        log(`Job detected — ${newCards.length} new card(s)`);
        onCardsDetected(newCards);
      }
    };

    const initialCards = detectJobCards(document);
    log(`Initial scan found ${initialCards.length} card(s)`);
    processBatch(initialCards);

    const observer = new MutationObserver((mutations) => {
      const cards = [];
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (isJobCard(node)) {
            cards.push(node);
            return;
          }
          cards.push(...detectJobCards(node));
        });
      }
      if (cards.length) processBatch(cards);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    log("Observer initialized");
    return observer;
  }

  globalObj.LinkedInPipeline.observer = {
    initObserver,
    detectJobCards
  };
})(globalThis);
