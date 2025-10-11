// @ts-check

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const INDEX_HTML_PATH = path.join(PROJECT_ROOT, 'index.html');
const READER_MODULE_URL = pathToFileURL(path.join(PROJECT_ROOT, 'js', 'ui', 'reader.js')).href;

const inlineStyles = (() => {
  const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const match = indexHtml.match(/<style>([\s\S]*?)<\/style>/i);
  if (!match) {
    throw new Error('Inline styles not found in index.html');
  }
  return match[1];
})();

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
            <select class="form-select form-select-sm" x-model="theme">
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
      ${buildReaderModuleScript()}
    </body>
  </html>`;
}

function buildReaderModuleScript() {
  return `<script type="module">
        import('${READER_MODULE_URL}')
          .then((module) => {
            window.bookReader = module.createReader;
            window.__bookReaderReady = true;
          })
          .catch((error) => {
            console.error('Failed to load reader module', error);
            window.__bookReaderReady = false;
          });
      </script>`;
}

const TMP_DIR = path.join(PROJECT_ROOT, 'tests', '.tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

let harnessCounter = 0;

function createHarnessFile(markup) {
  const filename = `harness-${Date.now()}-${harnessCounter += 1}.html`;
  const fullPath = path.join(TMP_DIR, filename);
  fs.writeFileSync(fullPath, markup, 'utf8');
  return pathToFileURL(fullPath).href;
}

async function loadReaderHarness(page, options = {}) {
  const fileUrl = createHarnessFile(buildReaderHarnessHtml(options));
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__bookReaderReady === true || typeof window.bookReader === 'function');
}

module.exports = {
  buildReaderHarnessHtml,
  INDEX_HTML_PATH,
  inlineStyles,
  READER_MODULE_URL,
  buildReaderModuleScript,
  loadReaderHarness,
  createHarnessFile,
};
