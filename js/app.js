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

const ensureStringsStore = () => {
  const Alpine = window.Alpine;
  if (Alpine && typeof Alpine.store === 'function') {
    Alpine.store('strings', STRINGS);
    return true;
  }
  if (!window.$store) {
    window.$store = {};
  }
  if (!window.$store.strings) {
    window.$store.strings = STRINGS;
  }
  return false;
};

const startAlpineWhenReady = () => {
  ensureStringsStore();
  if (typeof window.__startAlpine === 'function') {
    window.__startAlpine();
    delete window.__startAlpine;
    return;
  }
  requestAnimationFrame(startAlpineWhenReady);
};

startAlpineWhenReady();
