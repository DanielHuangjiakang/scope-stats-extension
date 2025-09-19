const statusTotalsEl = document.getElementById("statusTotals");
const quickTotalsEl = document.getElementById("quickTotals");
const totalBadge = document.getElementById("totalBadge");
const refreshBtn = document.getElementById("refresh");
const updatedEl = document.getElementById("updated");
const unknownEl = document.getElementById("unknown");
const messageEl = document.getElementById("message");
const pieSection = document.getElementById("pieSection");
const pieCanvas = document.getElementById("statusPie");
const pieLegend = document.getElementById("pieLegend");
const pieColors = {
  applied: "#2563eb",
  remaining: "#94a3b8"
};

let pieContext = null;

const ensurePieContext = () => {
  if (!pieCanvas) {
    return null;
  }

  const dpr = window.devicePixelRatio || 1;
  const size = pieCanvas.clientWidth || 160;
  const finalSize = size > 0 ? size : 160;
  pieCanvas.width = finalSize * dpr;
  pieCanvas.height = finalSize * dpr;

  pieContext = pieCanvas.getContext("2d");
  pieContext.dpr = dpr;
  pieContext.setTransform(dpr, 0, 0, dpr, 0, 0);

  return pieContext;
};

const resetPie = () => {
  if (pieContext) {
    const dpr = pieContext.dpr || 1;
    pieContext.setTransform(1, 0, 0, 1, 0, 0);
    pieContext.clearRect(0, 0, pieCanvas.width, pieCanvas.height);
    pieContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  pieLegend.innerHTML = "";
  pieSection.classList.remove("visible");
};

const clearContainers = () => {
  statusTotalsEl.innerHTML = "";
  quickTotalsEl.innerHTML = "";
  unknownEl.textContent = "";
  updatedEl.textContent = "";
  messageEl.textContent = "";
  totalBadge.hidden = true;
  resetPie();
};

const appendEmptyMessage = (container, text) => {
  const empty = document.createElement("p");
  empty.style.margin = "0";
  empty.style.fontSize = "12px";
  empty.style.color = "#52606d";
  empty.textContent = text;
  container.appendChild(empty);
};

const renderBarList = (container, items, { color, fallback }) => {
  container.innerHTML = "";

  if (!items.length) {
    appendEmptyMessage(container, fallback);
    return;
  }

  const maxValue = Math.max(...items.map((item) => (typeof item.value === "number" ? item.value : 0)), 0);
  const denominator = maxValue > 0 ? maxValue : 1;

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "bar-row";

    const meta = document.createElement("div");
    meta.className = "bar-meta";

    const labelEl = document.createElement("span");
    labelEl.className = "bar-label";
    labelEl.textContent = item.label;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.background = color;
    const ratio = Math.max(0, Math.min(1, (typeof item.value === "number" ? item.value : 0) / denominator));
    fill.style.transform = `scaleX(${ratio})`;

    track.appendChild(fill);
    meta.appendChild(labelEl);
    meta.appendChild(track);

    const valueEl = document.createElement("span");
    valueEl.className = "bar-value";
    valueEl.textContent = item.displayValue ?? (typeof item.value === "number" ? String(item.value) : "?");

    row.appendChild(meta);
    row.appendChild(valueEl);
    container.appendChild(row);
  });
};

const renderStats = (stats) => {
  clearContainers();

  if (!stats) {
    appendEmptyMessage(statusTotalsEl, "No data yet. Open your Scope applications page to sync.");
    appendEmptyMessage(quickTotalsEl, "Quick Filters counters will appear after configuring selectors.");
    return;
  }

  renderPie(stats.appliedSummary);

  const totalCount = typeof stats.totals?.total === "number" ? stats.totals.total : null;
  const declaredTotal = typeof stats.pageMeta?.declaredTotal === "number"
    ? stats.pageMeta.declaredTotal
    : null;
  if (totalCount != null) {
    totalBadge.hidden = false;
    totalBadge.textContent = declaredTotal && declaredTotal !== totalCount
      ? `Total · ${totalCount} / ${declaredTotal}`
      : `Total · ${totalCount}`;
  }

  const statusItems = Object.entries(stats.totals || {})
    .filter(([bucket]) => bucket !== "total")
    .map(([bucket, value]) => ({
      label: bucket,
      value: typeof value === "number" ? value : 0
    }))
    .filter((item) => item.value > 0);

  statusItems.sort((a, b) => b.value - a.value);

  renderBarList(statusTotalsEl, statusItems, {
    color: "#2563eb",
    fallback: "等待匹配到投递记录…"
  });

  const quickItems = Array.isArray(stats.quickSearches)
    ? stats.quickSearches.map((entry) => ({
        label: entry.label,
        value: typeof entry.count === "number" ? entry.count : 0,
        displayValue: entry.count != null ? String(entry.count) : "?"
      }))
    : [];

  quickItems.sort((a, b) => b.value - a.value);

  renderBarList(quickTotalsEl, quickItems, {
    color: "#14b8a6",
    fallback: "Quick Filters 计数未抓取，检查 config.quickSearch.* 选择器"
  });

  if (stats.updatedAt) {
    const date = new Date(stats.updatedAt);
    if (!Number.isNaN(date.valueOf())) {
      updatedEl.textContent = `Last updated: ${date.toLocaleString()}`;
    }
  }

  if (stats.unknownStatuses?.length) {
    unknownEl.textContent = `Unmapped statuses: ${stats.unknownStatuses.join(", ")}`;
  }
};

const fetchStats = () => {
  chrome.runtime.sendMessage({ type: "SCOPE_STATS_REQUEST" }, (response) => {
    if (chrome.runtime.lastError) {
      clearContainers();
      messageEl.textContent = chrome.runtime.lastError.message;
      return;
    }

    if (!response?.ok) {
      clearContainers();
      messageEl.textContent = "Failed to load stats";
      return;
    }

    renderStats(response.data);
  });
};

const renderPie = (summary) => {
  resetPie();

  if (!summary || summary.total <= 0) {
    return;
  }

  const applied = Math.max(0, summary.applied || 0);
  const remaining = Math.max(0, summary.notApplied || summary.total - applied);
  const total = applied + remaining;

  if (total <= 0) {
    return;
  }

  const ctx = ensurePieContext();
  if (!ctx) {
    return;
  }

  const dpr = ctx.dpr || 1;
  const size = pieCanvas.width / dpr;
  const radius = size / 2;
  const center = { x: radius, y: radius };
  let startAngle = -Math.PI / 2;

  const segments = [
    { label: "Applied", value: applied, color: pieColors.applied },
    { label: "Remaining", value: remaining, color: pieColors.remaining }
  ].filter((segment) => segment.value > 0);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  segments.forEach((segment) => {
    const angle = (segment.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.arc(center.x, center.y, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = segment.color;
    ctx.fill();
    startAngle = endAngle;
  });

  // Cutout for donut appearance
  ctx.beginPath();
  ctx.fillStyle = "#f7f9fc";
  ctx.arc(center.x, center.y, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Text in the middle
  const appliedRate = total > 0 ? Math.round((applied / total) * 100) : 0;
  ctx.fillStyle = "#1f2933";
  ctx.font = "bold 16px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${appliedRate}%`, center.x, center.y - 4);
  ctx.font = "12px 'Segoe UI', sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(`${applied}/${total}`, center.x, center.y + 12);

  pieLegend.innerHTML = "";
  segments.forEach((segment) => {
    const item = document.createElement("span");
    item.className = "pie-legend-item";
    const swatch = document.createElement("span");
    swatch.className = "pie-legend-swatch";
    swatch.style.background = segment.color;
    const label = document.createElement("span");
    label.textContent = `${segment.label} · ${segment.value}`;
    item.appendChild(swatch);
    item.appendChild(label);
    pieLegend.appendChild(item);
  });

  pieSection.classList.add("visible");
};

const triggerRefresh = () => {
  refreshBtn.disabled = true;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const [tab] = tabs;
    if (!tab?.id) {
      refreshBtn.disabled = false;
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "SCOPE_STATS_TRIGGER" }, () => {
      setTimeout(() => {
        fetchStats();
        refreshBtn.disabled = false;
      }, 500);
    });
  });
};

refreshBtn.addEventListener("click", triggerRefresh);

document.addEventListener("DOMContentLoaded", () => {
  fetchStats();
});
