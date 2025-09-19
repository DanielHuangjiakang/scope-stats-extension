window.SCOPE_STATS_CONFIG = {
  /**
   * Restrict scraping to specific hosts/paths so we don't run on unrelated pages.
   */
  allowedHosts: ["scope.sciencecoop.ubc.ca"],
  allowedPaths: ["/myAccount/co-op/postings.htm"],
  /**
   * Selector that matches a single application row/card on the Scope listing page.
   * Replace this with a selector copied from your DOM.
   */
  itemSelector: "#postingsTable tbody tr",
  /**
   * Within each row, locate the relevant text nodes.
   */
  fields: {
    title: "td:nth-child(5) a", // 职位名称
    company: "td:nth-child(6)", // 公司名称
    status: "td:nth-child(2)", // 状态文本
    applyAction: "td:first-child .btn.btn-primary" // 按钮文本（用于空白状态）
  },
  /**
   * Map raw status text to the buckets you care about. Edit the strings to match Scope's wording.
   */
  statusBuckets: {
    applied: [
      "applied via scope",
      "applied via employer",
      "application submitted",
      "applied"
    ],
    shortlisted: ["shortlist", "shortlisted", "候选"],
    viewed: ["viewed", "已查看"],
    ready: ["apply", "not applied", "eligible"],
    rejected: ["not selected", "unsuccessful", "declined", "rejected"],
    offer: ["offer", "hired", "accepted"],
    interview: ["interview", "面试", "screen"],
    other: ["new", "pending", "unspecified"]
  },
  /**
   * Optional: specify the bucket to use when no keyword matches.
   */
  fallbackBucket: "other",
  /**
   * Control how many full records to keep in storage for sampling/export features.
   */
  sampleSize: 100,
  appliedBuckets: ["applied"],
  totalSelector: "#totalOverAllPacks",
  /**
   * Optional: scrape the "Quick Searches" sidebar so the popup can chart those counters too.
   * Update the selectors so they match your portal.
   */
  quickSearch: null
};
