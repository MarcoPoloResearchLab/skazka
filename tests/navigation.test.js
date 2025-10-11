// @ts-check

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { createHarnessFile } = require('./helpers/harness');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const READER_MODULE_URL = pathToFileURL(path.join(__dirname, '..', 'js', 'ui', 'reader.js')).href;

function buildMarkup() {
  const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  return indexHtml
    .replace(/<script[^>]+https:\/\/cdn\.jsdelivr[^>]*><\/script>\s*/g, '')
    .replace(
      /<script\s+type="module"\s+src="js\/app\.js"><\/script>/i,
      `<script type="module">\n        import('${READER_MODULE_URL}')\n          .then(({ createReader }) => {\n            window.bookReader = createReader;\n            window.__bookReaderReady = true;\n          })\n          .catch((error) => {\n            console.error('Failed to load reader module', error);\n            window.__bookReaderReady = false;\n          });\n      </script>`,
    );
}

module.exports = async function runNavigationTests() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    const fileUrl = createHarnessFile(buildMarkup());
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__bookReaderReady === true || typeof window.bookReader === 'function');

    const metrics = await page.evaluate(() => ({
      toolbarLeft: document.querySelectorAll('.toolbar i.bi-chevron-left').length,
      toolbarRight: document.querySelectorAll('.toolbar i.bi-chevron-right').length,
      overlayButtons: document.querySelectorAll('.area .page-nav-btn').length,
    }));

    assertEqual(
      metrics.toolbarLeft,
      0,
      'Toolbar must not include a secondary previous-page button',
    );

    assertEqual(
      metrics.toolbarRight,
      0,
      'Toolbar must not include a secondary next-page button',
    );

    assertEqual(
      metrics.overlayButtons,
      2,
      'Exactly two overlay navigation buttons should remain in the reading area',
    );
  } finally {
    await browser.close();
  }
};
