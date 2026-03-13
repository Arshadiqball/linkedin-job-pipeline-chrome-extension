chrome.runtime.onInstalled.addListener(async () => {
  const { jobs } = await chrome.storage.local.get(["jobs"]);
  if (!Array.isArray(jobs)) {
    await chrome.storage.local.set({ jobs: [] });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING_PIPELINE") {
    sendResponse({ ok: true, tabId: sender?.tab?.id ?? null });
    return true;
  }

  return false;
});
