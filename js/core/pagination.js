// @ts-check

import {
  createStage,
  removeStage,
  createPageElement,
  splitNodeAtOffset,
  trimLeadingWhitespaceNode,
  startsWithFootnote,
  findPreviousWordBoundary,
  isSplittableBlock,
  relinkDanglingFootnotes
} from '../utils/pagination-dom.js';

/**
 * Paginate the supplied HTML into fixed-sized pages appended to the container.
 * @param {string} flowHtml
 * @param {{
 *   container: HTMLElement,
 *   pageWidthPx: number,
 *   pageHeightPx: number,
 *   preserveRatio?: number|null,
 *   createPage?: () => HTMLElement
 * }} options
 * @returns {{ targetIndex: number, totalPages: number }}
 */
export function paginateFlowHtml(flowHtml, options) {
  const {
    container,
    pageWidthPx,
    pageHeightPx,
    preserveRatio = null,
    createPage = () => createPageElement({ widthPx: pageWidthPx, heightPx: pageHeightPx })
  } = options;

  const stage = createStage(flowHtml, pageWidthPx);

  let page = createPage();
  container.appendChild(page);

  const fits = () => page.scrollHeight <= page.clientHeight;

  while (stage.firstChild) {
    /** @type {Node} */
    let node = stage.firstChild;
    stage.removeChild(node);

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (!text.trim()) {
        continue;
      }
      const wrapper = document.createElement('p');
      wrapper.textContent = text;
      node = wrapper;
    }

    page.appendChild(node);
    if (fits()) {
      continue;
    }

    page.removeChild(node);

    const headingCarry = extractTrailingHeading(page);

    const nextPage = createPage();
    container.appendChild(nextPage);

    if (headingCarry) {
      nextPage.appendChild(headingCarry);
    }

    if (isSplittableBlock(node)) {
      const parts = splitBlockForPage(node, nextPage);
      if (parts.first) {
        nextPage.appendChild(parts.first);
      }
      if (parts.remainder) {
        stage.insertBefore(parts.remainder, stage.firstChild);
      }
    } else {
      nextPage.appendChild(node);
    }

    page = nextPage;
  }

  removeStage(stage);

  relinkDanglingFootnotes(container, trimLeadingWhitespaceNode);

  const totalPages = container.children.length || 1;
  let targetIndex = 0;
  if (typeof preserveRatio === 'number' && totalPages > 1) {
    const clamped = Math.min(1, Math.max(0, preserveRatio));
    const maxIndex = Math.max(1, totalPages - 1);
    targetIndex = Math.max(0, Math.min(totalPages - 1, Math.round(clamped * maxIndex)));
  }

  return { targetIndex, totalPages };
}

/**
 * Remove trailing headings from a page so they stay visually attached.
 * @param {HTMLElement} pageElement
 */
function extractTrailingHeading(pageElement) {
  if (!pageElement) {
    return null;
  }
  const last = pageElement.lastElementChild;
  if (!last) {
    return null;
  }
  const tagName = (last.tagName || '').toUpperCase();
  if (!/^H[1-3]$/.test(tagName)) {
    return null;
  }
  pageElement.removeChild(last);
  return last;
}

/**
 * Split a block so the leading part fits the destination page.
 * @param {Node} node
 * @param {HTMLElement} destinationPage
 */
function splitBlockForPage(node, destinationPage) {
  const totalLength = (node.textContent || '').length;
  if (totalLength === 0) {
    return { first: null, remainder: node };
  }

  let low = 1;
  let high = totalLength;
  let best = 0;

  const fitsWithOffset = (offset) => {
    const parts = splitNodeAtOffset(node, offset);
    if (!parts.head) {
      return false;
    }
    destinationPage.appendChild(parts.head);
    const ok = destinationPage.scrollHeight <= destinationPage.clientHeight;
    destinationPage.removeChild(destinationPage.lastChild);
    return ok;
  };

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fitsWithOffset(mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best === 0) {
    return { first: null, remainder: node };
  }

  let parts = splitNodeAtOffset(node, best);

  if (parts.tail && startsWithFootnote(parts.tail)) {
    const rollbackOffset = findPreviousWordBoundary(node, best);
    if (rollbackOffset >= 0 && rollbackOffset < best) {
      best = rollbackOffset;
      parts = splitNodeAtOffset(node, best);
    } else {
      const tailTextLength = parts.tail.textContent ? parts.tail.textContent.length : 0;
      const adjustment = Math.min(tailTextLength, totalLength - best);
      if (adjustment > 0 && fitsWithOffset(best + adjustment)) {
        best += adjustment;
        parts = splitNodeAtOffset(node, best);
      }
    }
  }

  const first = parts.head;
  let remainder = parts.tail;
  remainder = trimLeadingWhitespaceNode(remainder);

  return { first, remainder };
}

