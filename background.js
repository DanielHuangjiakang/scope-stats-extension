const STORAGE_KEY = "scopeStats";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ [STORAGE_KEY]: null }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  if (message.type === "SCOPE_STATS_UPDATE") {
    const payload = {
      ...message.payload,
      updatedAt: new Date().toISOString(),
      tabUrl: sender?.tab?.url ?? null
    };

    chrome.storage.local
      .set({ [STORAGE_KEY]: payload })
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error("[Scope Stats] Failed to persist data", error);
        sendResponse({ ok: false, error: String(error) });
      });

    return true; // keep the message channel open for async response
  }

  if (message.type === "SCOPE_STATS_REQUEST") {
    chrome.storage.local
      .get(STORAGE_KEY)
      .then((result) => {
        sendResponse({ ok: true, data: result[STORAGE_KEY] ?? null });
      })
      .catch((error) => {
        console.error("[Scope Stats] Failed to read data", error);
        sendResponse({ ok: false, error: String(error) });
      });

    return true;
  }

  return false;
});
