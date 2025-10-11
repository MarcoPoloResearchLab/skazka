// @ts-check

/**
 * Create an off-screen staging element containing the flow HTML.
 * @param {string} flowHtml
 * @param {number} widthPx
 * @returns {HTMLElement}
 */
export function createStage(flowHtml, widthPx) {
  const stage = document.createElement('div');
  stage.style.position = 'absolute';
  stage.style.visibility = 'hidden';
  stage.style.pointerEvents = 'none';
  stage.style.left = '-99999px';
  stage.style.top = '0';
  stage.style.width = `${widthPx}px`;
  stage.innerHTML = flowHtml;
  document.body.appendChild(stage);
  return stage;
}

/**
 * Remove a stage previously created with {@link createStage}.
 * @param {HTMLElement|null} stage
 */
export function removeStage(stage) {
  if (stage && stage.parentNode) {
    stage.parentNode.removeChild(stage);
  }
}

/**
 * Create a page element that mirrors the current typography custom properties.
 * @param {{ widthPx: number, heightPx: number }} metrics
 */
export function createPageElement({ widthPx, heightPx }) {
  const element = document.createElement('div');
  element.className = 'page';
  element.style.width = `${widthPx}px`;
  element.style.height = `${heightPx}px`;
  element.style.boxSizing = 'border-box';
  const rootStyle = getComputedStyle(document.documentElement);
  element.style.padding = rootStyle.getPropertyValue('--page-padding');
  element.style.fontSize = rootStyle.getPropertyValue('--base-font-size');
  element.style.lineHeight = rootStyle.getPropertyValue('--line-height') || '1.62';
  element.style.overflow = 'hidden';
  return element;
}

/**
 * Split a DOM node at the specified text offset.
 * @param {Node} node
 * @param {number} offset
 * @returns {{ head: Node|null, tail: Node|null }}
 */
export function splitNodeAtOffset(node, offset) {
  const totalLength = node && typeof node.textContent === 'string' ? node.textContent.length : 0;
  if (offset <= 0) {
    return { head: null, tail: node.cloneNode(true) };
  }
  if (offset >= totalLength) {
    return { head: node.cloneNode(true), tail: null };
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    const headText = text.slice(0, offset);
    const tailText = text.slice(offset);
    return {
      head: headText ? document.createTextNode(headText) : null,
      tail: tailText ? document.createTextNode(tailText) : null
    };
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = /** @type {HTMLElement} */ (node);
    const tagName = (element.tagName || '').toUpperCase();
    if (tagName === 'SUP') {
      if (offset >= totalLength) {
        return { head: element.cloneNode(true), tail: null };
      }
      if (offset <= 0) {
        return { head: null, tail: element.cloneNode(true) };
      }
      return { head: element.cloneNode(true), tail: null };
    }

    const headClone = element.cloneNode(false);
    const tailClone = element.cloneNode(false);
    let consumed = 0;
    const children = Array.from(element.childNodes);

    for (const child of children) {
      const childLength = child.textContent ? child.textContent.length : 0;
      if (consumed + childLength <= offset) {
        headClone.appendChild(child.cloneNode(true));
        consumed += childLength;
        continue;
      }
      if (consumed >= offset) {
        tailClone.appendChild(child.cloneNode(true));
        consumed += childLength;
        continue;
      }

      const childOffset = offset - consumed;
      const split = splitNodeAtOffset(child, childOffset);
      if (split.head) {
        headClone.appendChild(split.head);
      }
      if (split.tail) {
        tailClone.appendChild(split.tail);
      }
      consumed += childLength;
    }

    return {
      head: headClone.childNodes.length ? headClone : null,
      tail: tailClone.childNodes.length ? tailClone : null
    };
  }

  return { head: null, tail: null };
}

/**
 * Remove leading whitespace in the provided node recursively.
 * @param {Node|null} node
 * @returns {Node|null}
 */
export function trimLeadingWhitespaceNode(node) {
  if (!node) {
    return null;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    node.textContent = (node.textContent || '').replace(/^\s+/, '');
    return node.textContent && node.textContent.length ? node : null;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    while (node.firstChild) {
      const trimmed = trimLeadingWhitespaceNode(node.firstChild);
      if (!trimmed) {
        node.removeChild(node.firstChild);
        continue;
      }
      if (trimmed !== node.firstChild) {
        node.replaceChild(trimmed, node.firstChild);
      }
      break;
    }
    return node.childNodes.length ? node : null;
  }
  return node;
}

/**
 * Determine whether the node begins with a footnote reference.
 * @param {Node|null} node
 */
export function startsWithFootnote(node) {
  if (!node) {
    return false;
  }
  if (node.nodeType === Node.ELEMENT_NODE && /** @type {HTMLElement} */ (node).tagName === 'SUP') {
    return true;
  }
  let current = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE && /** @type {HTMLElement} */ (current).tagName === 'SUP') {
      return true;
    }
    if (current.firstChild) {
      current = current.firstChild;
      continue;
    }
    break;
  }
  return false;
}

/**
 * Find the previous word boundary for the supplied offset.
 * @param {Node} node
 * @param {number} offset
 */
export function findPreviousWordBoundary(node, offset) {
  const text = node && typeof node.textContent === 'string' ? node.textContent : '';
  if (!text) {
    return -1;
  }
  let index = Math.max(0, Math.min(offset, text.length));
  while (index > 0 && /\s/.test(text[index - 1])) {
    index -= 1;
  }
  while (index > 0 && !/\s/.test(text[index - 1])) {
    index -= 1;
  }
  return index;
}

/**
 * Detect whether a block-level element can be split across pages.
 * @param {Node} node
 */
export function isSplittableBlock(node) {
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  const tag = (node.tagName || '').toUpperCase();
  if (tag !== 'P' && tag !== 'BLOCKQUOTE' && tag !== 'PRE') {
    return false;
  }
  return (node.textContent || '').trim().length > 0;
}

/**
 * Relink dangling footnotes so they attach to paragraphs rather than staging nodes.
 * @param {HTMLElement} container
 * @param {(node: Node|null) => Node|null} whitespaceTrimmer
 */
export function relinkDanglingFootnotes(container, whitespaceTrimmer) {
  const pages = Array.from(container.children);
  pages.forEach((pageEl) => {
    const directSup = Array.from(pageEl.querySelectorAll(':scope > sup.footnote-ref'));

    directSup.forEach((sup) => {
      const previousParagraph = sup.previousElementSibling && sup.previousElementSibling.tagName === 'P'
        ? sup.previousElementSibling
        : null;
      if (previousParagraph) {
        appendWithSpacing(previousParagraph, sup);
        return;
      }

      const nextParagraph = sup.nextElementSibling && sup.nextElementSibling.tagName === 'P'
        ? sup.nextElementSibling
        : null;
      if (nextParagraph) {
        prependWithSpacing(nextParagraph, sup);
        return;
      }

      let parentParagraph = sup.parentElement;
      while (parentParagraph && parentParagraph.tagName !== 'P') {
        parentParagraph = parentParagraph.parentElement;
      }
      if (parentParagraph) {
        appendWithSpacing(parentParagraph, sup);
      }
    });

    mergeContinuationParagraphs(pageEl, whitespaceTrimmer);

    const previousPage = pageEl.previousElementSibling;
    if (!previousPage) {
      return;
    }
    mergeContinuationBetweenPages(previousPage, pageEl, whitespaceTrimmer);
  });
}

function ensureTrailingSpace(element) {
  const lastChild = element.lastChild;
  if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
    if (!/\s$/.test(lastChild.textContent || '')) {
      lastChild.textContent = `${lastChild.textContent || ''} `;
    }
  } else if (element.childNodes.length) {
    element.appendChild(document.createTextNode(' '));
  }
}

function appendWithSpacing(element, node) {
  if (!node) {
    return;
  }
  ensureTrailingSpace(element);
  element.appendChild(node);
}

function prependWithSpacing(element, node) {
  if (!node) {
    return;
  }
  if (element.firstChild && element.firstChild.nodeType === Node.TEXT_NODE) {
    const firstText = element.firstChild;
    if (!/^\s/.test(firstText.textContent || '')) {
      firstText.textContent = ` ${firstText.textContent || ''}`;
    }
  }
  element.insertBefore(node, element.firstChild || null);
}

function mergeContinuationParagraphs(root, whitespaceTrimmer) {
  const paragraphs = Array.from(root.querySelectorAll('p'));
  const endsWithFootnote = (el) => !!el && /(<\/sup>|\[[0-9]+])\s*$/.test((el.innerHTML || '').trim());
  const startsWithContinuation = (paragraph) => {
    if (!paragraph) return false;
    const text = (paragraph.textContent || '').trim();
    if (!text) return false;
    const stripped = text.replace(/^["'«»„“”‚‛(\[]+/, '');
    if (!stripped) return false;
    const firstChar = stripped.charAt(0);
    if (!firstChar) return false;
    return /\p{L}/u.test(firstChar) && firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase();
  };

  const mergeParagraphs = (source, target) => {
    if (!source || !target || source === target) {
      return;
    }
    whitespaceTrimmer(source);
    while (source.firstChild) {
      const child = source.firstChild;
      source.removeChild(child);
      if (child.nodeType === Node.TEXT_NODE) {
        const value = child.textContent || '';
        if (!value.trim()) {
          continue;
        }
        const normalized = value.replace(/^\s+/, '');
        if (!normalized) {
          continue;
        }
        appendWithSpacing(target, document.createTextNode(normalized));
      } else {
        appendWithSpacing(target, child);
      }
    }
    if (!source.textContent || !source.textContent.trim()) {
      source.remove();
    }
  };

  const mergeContinuationsIn = () => {
    let changed = false;
    for (let index = 1; index < paragraphs.length; index += 1) {
      const previous = paragraphs[index - 1];
      const current = paragraphs[index];
      if (endsWithFootnote(previous) && startsWithContinuation(current)) {
        mergeParagraphs(current, previous);
        paragraphs.splice(index, 1);
        changed = true;
        break;
      }
    }
    return changed;
  };

  while (mergeContinuationsIn()) {
    // iteratively merge until stability
  }
}

function mergeContinuationBetweenPages(previousPage, currentPage, whitespaceTrimmer) {
  const previousParagraphs = previousPage.querySelectorAll('p');
  const lastPrevious = previousParagraphs.length ? previousParagraphs[previousParagraphs.length - 1] : null;
  if (!lastPrevious) {
    return;
  }
  const endsWithFootnote = (el) => !!el && /(<\/sup>|\[[0-9]+])\s*$/.test((el.innerHTML || '').trim());
  const startsWithContinuation = (paragraph) => {
    if (!paragraph) return false;
    const text = (paragraph.textContent || '').trim();
    if (!text) return false;
    const stripped = text.replace(/^["'«»„“”‚‛(\[]+/, '');
    if (!stripped) return false;
    const firstChar = stripped.charAt(0);
    if (!firstChar) return false;
    return /\p{L}/u.test(firstChar) && firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase();
  };

  let firstCurrent = currentPage.querySelector('p');
  while (lastPrevious && firstCurrent && endsWithFootnote(lastPrevious) && startsWithContinuation(firstCurrent)) {
    whitespaceTrimmer(firstCurrent);
    while (firstCurrent.firstChild) {
      const child = firstCurrent.firstChild;
      firstCurrent.removeChild(child);
      if (child.nodeType === Node.TEXT_NODE) {
        const value = child.textContent || '';
        if (!value.trim()) {
          continue;
        }
        const normalized = value.replace(/^\s+/, '');
        if (!normalized) {
          continue;
        }
        appendWithSpacing(lastPrevious, document.createTextNode(normalized));
      } else {
        appendWithSpacing(lastPrevious, child);
      }
    }
    if (!firstCurrent.textContent || !firstCurrent.textContent.trim()) {
      const toRemove = firstCurrent;
      firstCurrent = currentPage.querySelector('p');
      toRemove.remove();
    } else {
      break;
    }
  }
}

