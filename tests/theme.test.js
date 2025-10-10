// @ts-check

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');

const APP_JS_PATH = path.join(__dirname, '..', 'js', 'app.js');
const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');

function extractThemeCss() {
  const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const styleMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/i);
  if (!styleMatch) {
    throw new Error('Failed to locate inline styles in index.html');
  }
  return styleMatch[1];
}

function buildHarnessHtml() {
  const inlineStyles = extractThemeCss();
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        ${inlineStyles}
        .offcanvas {
          background-color: #ffffff;
          color: #212529;
          padding: 16px;
        }
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

      <div class="offcanvas offcanvas-start toc-offcanvas" id="tocDrawer">
        <div class="offcanvas-header">TOC</div>
        <div class="offcanvas-body">Entries</div>
      </div>

      <script>${appSource}</script>
    </body>
  </html>`;
}

module.exports = async function runThemeTests() {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setContent(buildHarnessHtml(), { waitUntil: 'domcontentloaded' });

    const metrics = await page.evaluate(() => {
      const reader = bookReader();
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();
      reader.ui.theme = 'dark';
      reader.applyTheme();
      document.body.className = reader.themeClass;

      const offcanvas = document.getElementById('tocDrawer');
      const styles = getComputedStyle(offcanvas);
      return {
        bodyClass: document.body.className,
        offcanvasBackground: styles.backgroundColor,
        offcanvasColor: styles.color,
      };
    });

    assertEqual(
      metrics.bodyClass.includes('theme-dark'),
      true,
      'Theme class should be applied to the document body when switching to dark mode',
    );

    assertEqual(
      metrics.offcanvasBackground !== 'rgb(255, 255, 255)',
      true,
      'TOC offcanvas background should change from the light default when dark theme is applied',
    );

    assertEqual(
      metrics.offcanvasColor !== 'rgb(33, 37, 41)',
      true,
      'TOC offcanvas foreground color should change from the light default when dark theme is applied',
    );
  } finally {
    await browser.close();
  }
};
