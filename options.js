const STORAGE_KEY = "scopeStats";
const statusList = document.getElementById("statusPreview");
const quickList = document.getElementById("quickPreview");
const appliedList = document.getElementById("appliedPreview");
const rawPre = document.getElementById("statsRaw");

const renderList = (container, items, emptyText) => {
  container.innerHTML = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    li.style.color = "#667085";
    container.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = item.label;
    const value = document.createElement("span");
    value.textContent = item.value;
    li.appendChild(label);
    li.appendChild(value);
    container.appendChild(li);
  });
};

const render = (stats) => {
  if (!stats) {
    renderList(statusList, [], "暂无数据");
    renderList(appliedList, [], "暂无数据");
    renderList(quickList, [], "暂无数据");
    rawPre.textContent = "暂无数据";
    return;
  }

  const totals = stats.totals || {};
  const statusItems = [];

  if (typeof totals.total === "number") {
    statusItems.push({ label: "Total", value: totals.total });
  }

  Object.entries(totals)
    .filter(([bucket]) => bucket !== "total")
    .forEach(([bucket, value]) => {
      statusItems.push({ label: bucket, value: typeof value === "number" ? value : "-" });
    });

  if (Array.isArray(stats.unknownStatuses) && stats.unknownStatuses.length) {
    statusItems.push({
      label: "Unmapped",
      value: stats.unknownStatuses.join(", ")
    });
  }

  renderList(statusList, statusItems, "暂无统计");

  const summary = stats.appliedSummary || {};
  const appliedItems = [
    { label: "Applied", value: summary.applied ?? "-" },
    { label: "Remaining", value: summary.notApplied ?? "-" },
    { label: "Total", value: summary.total ?? "-" }
  ];

  if (typeof stats.pageMeta?.declaredTotal === "number") {
    appliedItems.push({ label: "Declared Total", value: stats.pageMeta.declaredTotal });
  }

  renderList(appliedList, appliedItems, "暂无数据");

  const quickItems = Array.isArray(stats.quickSearches)
    ? stats.quickSearches.map((entry) => ({
        label: entry.label,
        value: entry.count != null ? entry.count : "?"
      }))
    : [];

  renderList(quickList, quickItems, "暂无 Quick Searches 数据");

  rawPre.textContent = JSON.stringify(stats, null, 2);
};

chrome.storage.local.get(STORAGE_KEY).then((result) => {
  render(result[STORAGE_KEY] || null);
});
