// @ts-check

/**
 * Produce a user-facing page indicator string.
 * @param {number} currentIndex Zero-based page index.
 * @param {number} totalPages Total number of pages.
 * @returns {string}
 */
export function formatPageDisplay(currentIndex, totalPages) {
  const safeTotal = Math.max(1, totalPages);
  const safeCurrent = Math.min(safeTotal, Math.max(1, currentIndex + 1));
  return `Page ${safeCurrent} / ${safeTotal}`;
}

/**
 * Produce a compact `current/total` summary string.
 * @param {number} currentIndex Zero-based page index.
 * @param {number} totalPages Total number of pages.
 * @returns {string}
 */
export function formatProgressSummary(currentIndex, totalPages) {
  const safeTotal = Math.max(1, totalPages);
  const safeCurrent = Math.min(safeTotal, Math.max(1, currentIndex + 1));
  return `${safeCurrent}/${safeTotal}`;
}
