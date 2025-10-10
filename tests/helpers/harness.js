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

/**
 * Builds a minimal HTML document that wires the reader layout and embeds app.js.
 * @param {Object} [options]
 * @param {string} [options.extraBodyMarkup]
 * @returns {string}
 */
function buildReaderHarnessHtml(options = {}) {
  const { extraBodyMarkup = '' } = options;
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
        <div class="toolbar"></div>
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
