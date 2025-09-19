(function () {
  const config = window.SCOPE_STATS_CONFIG;
  if (!config) {
    console.warn("[Scope Stats] Missing SCOPE_STATS_CONFIG. Did config.js load?");
    return;
  }

  const log = (...args) => {
    if (config.debug) {
      console.log("[Scope Stats]", ...args);
    }
  };

  const hostAllowed = Array.isArray(config.allowedHosts) && config.allowedHosts.length
    ? config.allowedHosts.some((host) => window.location.hostname === host)
    : true;

  const pathAllowed = Array.isArray(config.allowedPaths) && config.allowedPaths.length
    ? config.allowedPaths.some((path) => window.location.pathname.startsWith(path))
    : true;

  if (!hostAllowed || !pathAllowed) {
    log("Skipping Scope Stats on this page", window.location.href);
    return;
  }

  const normalise = (value) => (value == null ? "" : String(value).trim());
  const toKey = (value) => normalise(value).toLowerCase();

  const statusMatchers = Object.entries(config.statusBuckets || {}).map(([bucket, keywords]) => ({
    bucket,
    keywords: (keywords || []).map((keyword) => keyword.toLowerCase())
  }));

  const bucketForStatus = (statusRaw) => {
    const key = toKey(statusRaw);
    if (!key) {
      return config.fallbackBucket || "unknown";
    }

    for (const matcher of statusMatchers) {
      if (matcher.keywords.some((keyword) => key.includes(keyword))) {
        return matcher.bucket;
      }
    }

    return config.fallbackBucket || "unknown";
  };

  const buildBucketsSeed = () => {
    const buckets = Object.keys(config.statusBuckets || {}).reduce((acc, bucket) => {
      acc[bucket] = 0;
      return acc;
    }, {});

    if (config.fallbackBucket) {
      buckets[config.fallbackBucket] = buckets[config.fallbackBucket] || 0;
    } else {
      buckets.unknown = buckets.unknown || 0;
    }

    return buckets;
  };

  const quickSearchConfig = config.quickSearch;
  const appliedBucketSet = new Set(
    (config.appliedBuckets || ["applied"]).map((bucket) => String(bucket).toLowerCase())
  );

  const parseCount = (value) => {
    const text = normalise(value).replace(/,/g, "");
    if (!text) {
      return null;
    }
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return null;
    }
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const scrapeQuickSearches = () => {
    if (!quickSearchConfig?.itemSelector) {
      return [];
    }

    const elements = Array.from(document.querySelectorAll(quickSearchConfig.itemSelector));
    if (!elements.length) {
      return [];
    }

    return elements
      .map((element) => {
        const labelSource = quickSearchConfig.fields?.label
          ? element.querySelector(quickSearchConfig.fields.label)
          : element;
        const countSource = quickSearchConfig.fields?.count
          ? element.querySelector(quickSearchConfig.fields.count)
          : element;
        const linkSource = quickSearchConfig.fields?.link
          ? element.querySelector(quickSearchConfig.fields.link)
          : element.closest("a");

        const label = normalise(labelSource?.textContent);
        const parsedCount = parseCount(countSource?.textContent);
        const href = linkSource?.getAttribute("href") || null;

        if (!label) {
          return null;
        }

        return {
          label,
          count: parsedCount,
          href
        };
      })
      .filter(Boolean);
  };

  let lastSignature = null;
  let debounceTimer = null;

  const computeSignature = (rows, quickSearches, declaredTotal) =>
    JSON.stringify({
      rows: rows.map((row) => [row.title, row.company, row.statusRaw]),
      quick: quickSearches.map((item) => [item.label, item.count, item.href]),
      total: declaredTotal
    });

  const scrape = () => {
    const nodeList = config.itemSelector ? document.querySelectorAll(config.itemSelector) : [];

    const buckets = buildBucketsSeed();
    const rows = [];
    const unknownStatuses = new Set();
    let appliedCount = 0;

    nodeList.forEach((element) => {
      const title = normalise(element.querySelector(config.fields?.title)?.textContent);
      const company = normalise(element.querySelector(config.fields?.company)?.textContent);
      let statusRaw = normalise(element.querySelector(config.fields?.status)?.textContent);
      if (!statusRaw && config.fields?.applyAction) {
        statusRaw = normalise(element.querySelector(config.fields.applyAction)?.textContent);
      }
      const status = bucketForStatus(statusRaw);

      if (!(status in buckets)) {
        buckets[status] = 0;
      }
      buckets[status] += 1;

      if (status === (config.fallbackBucket || "unknown")) {
        if (statusRaw) {
          unknownStatuses.add(statusRaw);
        }
      }

      if (appliedBucketSet.has(status.toLowerCase())) {
        appliedCount += 1;
      }

      rows.push({ title, company, statusRaw, status });
    });

    const quickSearches = scrapeQuickSearches();
    const declaredTotal = config.totalSelector
      ? parseCount(document.querySelector(config.totalSelector)?.textContent)
      : null;

    if (!rows.length) {
      Object.keys(buckets).forEach((bucket) => {
        buckets[bucket] = buckets[bucket] || 0;
      });
    }

    if (!rows.length && !quickSearches.length) {
      log("No matching data found on page");
      return;
    }

    const signature = computeSignature(rows, quickSearches, declaredTotal);
    if (signature === lastSignature) {
      return;
    }
    lastSignature = signature;

    const totalRows = rows.length;
    const notAppliedCount = Math.max(0, totalRows - appliedCount);

    const payload = {
      totals: {
        total: totalRows,
        ...buckets
      },
      sample: rows.slice(0, config.sampleSize || 50),
      unknownStatuses: Array.from(unknownStatuses),
      quickSearches,
      pageMeta: {
        declaredTotal
      },
      appliedSummary: {
        applied: appliedCount,
        notApplied: notAppliedCount,
        total: totalRows,
        appliedRate: totalRows > 0 ? appliedCount / totalRows : 0
      }
    };

    log("Sending payload", payload);
    chrome.runtime.sendMessage({ type: "SCOPE_STATS_UPDATE", payload }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[Scope Stats] Failed to send update", chrome.runtime.lastError);
        return;
      }
      if (!response?.ok) {
        console.warn("[Scope Stats] Background rejected update", response?.error);
      }
    });
  };

  const scheduleScrape = (delay = 250) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(scrape, delay);
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "SCOPE_STATS_TRIGGER") {
      scheduleScrape(100);
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  const observer = new MutationObserver(() => scheduleScrape());

  const start = () => {
    scheduleScrape(500);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
