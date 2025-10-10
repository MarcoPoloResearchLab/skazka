// @ts-check

import { STRINGS } from './constants.js';
import { createReader } from './ui/reader.js';
import { createToolbar } from './ui/toolbar.js';
import { createNotifications } from './ui/notifications.js';
import { createToc } from './ui/toc.js';

if (typeof window !== 'undefined') {
  window.bookReader = createReader;
  window.reader = createReader;
  window.readerToolbar = createToolbar;
  window.appNotifications = createNotifications;
  window.readerToc = createToc;
}

const registerFactories = (Alpine) => {
  if (!Alpine || typeof Alpine.data !== 'function') {
    return;
  }
  if (typeof Alpine.store === 'function') {
    Alpine.store('strings', STRINGS);
  } else {
    window.$store = window.$store || {};
    window.$store.strings = STRINGS;
  }
  Alpine.data('reader', createReader);
  Alpine.data('readerToolbar', createToolbar);
  Alpine.data('appNotifications', createNotifications);
  Alpine.data('readerToc', createToc);
};

document.addEventListener('alpine:init', (event) => {
  registerFactories(event.detail || window.Alpine);
});

if (window.Alpine) {
  registerFactories(window.Alpine);
}
