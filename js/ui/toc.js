// @ts-check

import { EVENTS, STRINGS } from '../constants.js';
import { dispatchEvent } from '../utils/dom.js';

/**
 * Alpine factory for the TOC drawer.
 */
export function createToc() {
  return {
    entries: [],
    bookTitle: '',
    emptyMessage: STRINGS.tocEmptyMessage,
    init() {
      this._handleToc = (event) => {
        this.handleTocUpdated(event.detail);
      };
      document.addEventListener(EVENTS.TOC_UPDATED, this._handleToc);
    },
    destroy() {
      if (this._handleToc) {
        document.removeEventListener(EVENTS.TOC_UPDATED, this._handleToc);
      }
    },
    /**
     * Update state when the reader publishes new headings.
     * @param {{ bookTitle?: string, entries?: Array<{ id: string, text: string, level: string }> }} detail
     */
    handleTocUpdated(detail) {
      if (!detail) {
        return;
      }
      if (typeof detail.bookTitle === 'string') {
        this.bookTitle = detail.bookTitle;
      }
      if (Array.isArray(detail.entries)) {
        this.entries = detail.entries.map((entry) => ({
          id: entry.id,
          text: entry.text,
          level: entry.level,
        }));
      }
    },
    /**
     * Dispatch a navigation request to the reader component.
     * @param {string} id
     */
    handleEntryClick(id) {
      if (!id) {
        return;
      }
      dispatchEvent(this.$el, EVENTS.GOTO_HEADING, { id });
    }
  };
}
