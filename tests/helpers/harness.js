// @ts-check

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const INDEX_HTML_PATH = path.join(PROJECT_ROOT, 'index.html');
const APP_JS_PATH = path.join(PROJECT_ROOT, 'js', 'app.js');

const inlineStyles = (() => {
  const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const match = indexHtml.match(/<style>([\s\S]*?)<\/style>/i);
  if (!match) {
    throw new Error('Inline styles not found in index.html');
  }
  return match[1];
})();

const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');

const DEFAULT_TOOLBAR_MARKUP = `
      <div class="toolbar">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <div class="input-group input-group-sm" style="width: 230px;">
            <span class="input-group-text">Provider</span>
            <select class="form-select form-select-sm" x-model="provider">
              <option value="auto">Auto</option>
              <option value="libru">Lib.ru</option>
            </select>
          </div>

          <div class="input-group input-group-sm" style="width: 210px;">
            <span class="input-group-text">Encoding</span>
            <select class="form-select form-select-sm" x-model="encoding">
              <option value="auto">auto</option>
              <option value="utf-8">utf-8</option>
            </select>
          </div>

          <div class="input-group input-group-sm" style="width: 320px;">
            <span class="input-group-text">URL</span>
            <input type="url" class="form-control form-control-sm" placeholder="https://example.com" x-model="loadUrl">
            <button class="btn btn-outline-primary btn-sm">Load</button>
          </div>

          <div class="d-flex align-items-center gap-2">
            <label class="form-label m-0"><i class="bi bi-palette"></i></label>
            <select class="form-select form-select-sm" x-model="ui.theme">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
      </div>`;

/**
 * Builds a minimal HTML document that wires the reader layout and embeds app.js.
 * @param {Object} [options]
 * @param {string} [options.extraBodyMarkup]
 * @param {string} [options.toolbarMarkup]
 * @returns {string}
 */
function buildReaderHarnessHtml(options = {}) {
  const { extraBodyMarkup = '', toolbarMarkup = DEFAULT_TOOLBAR_MARKUP } = options;
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${inlineStyles}
      </style>
    </head>
    <body>
      <div class="shell">
        ${toolbarMarkup}
        <div class="area">
          <div id="readerPages" class="pages" style="flex:1 1 auto;"></div>
        </div>
        <div class="footer"></div>
      </div>
      ${extraBodyMarkup}
      <script>${appSource}</script>
    </body>
  </html>`;
}

module.exports = {
  buildReaderHarnessHtml,
  APP_JS_PATH,
  INDEX_HTML_PATH,
  inlineStyles,
};
