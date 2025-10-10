// @ts-check

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');

const APP_JS_PATH = path.join(__dirname, '..', 'js', 'app.js');
const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');

function extractTypographyStyles() {
  const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const match = indexHtml.match(/<style>([\s\S]*?)<\/style>/i);
  if (!match) {
    throw new Error('Inline styles not found in index.html');
  }
  return match[1];
}

function buildHarnessHtml() {
  const inlineStyles = extractTypographyStyles();
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
      <script>${appSource}</script>
    </body>
  </html>`;
}

const LONG_PARAGRAPH_FLOW = `<p>${Array.from({ length: 1200 }, (_, index) => `Sentence ${index + 1}.`).join(' ')}</p>`;

module.exports = async function runTypographyTests() {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    await page.setContent(buildHarnessHtml(), { waitUntil: 'domcontentloaded' });

    const metrics = await page.evaluate((flowHtml) => {
      const reader = bookReader();
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();
      reader.renderPages(flowHtml);

      const pageNodes = Array.from(reader.pagesEl.children);
      if (!pageNodes.length) {
        throw new Error('No pages rendered for typography test');
      }

      const firstPage = pageNodes[0];
      const initialComputed = getComputedStyle(firstPage);
      const initialFontSize = initialComputed.fontSize;
      const initialPadding = initialComputed.paddingLeft;

      const overflowBefore = pageNodes.filter((node) => node.scrollHeight > node.clientHeight + 0.5).length;

      reader.ui.fontSizePx = 24;
      reader.handleFontSizeSliderInput();

      const pageNodesAfterFont = Array.from(reader.pagesEl.children);
      const afterFontComputed = getComputedStyle(pageNodesAfterFont[0]);
      const updatedFontSize = afterFontComputed.fontSize;
      const overflowAfterFont = pageNodesAfterFont.filter(
        (node) => node.scrollHeight > node.clientHeight + 0.5,
      ).length;

      reader.ui.pagePaddingPx = 40;
      reader.handlePagePaddingSliderInput();
      const pageNodesAfterPadding = Array.from(reader.pagesEl.children);
      const afterPaddingComputed = getComputedStyle(pageNodesAfterPadding[0]);
      const updatedPadding = afterPaddingComputed.paddingLeft;

      return {
        initialFontSize,
        updatedFontSize,
        initialPadding,
        updatedPadding,
        overflowBefore,
        overflowAfterFont,
        totalPages: reader.ui.totalPageCount,
        pageCountMatches: reader.ui.totalPageCount === reader.pagesEl.children.length,
      };
    }, LONG_PARAGRAPH_FLOW);

    assertEqual(
      metrics.updatedFontSize === metrics.initialFontSize,
      false,
      'Font size slider must update the rendered page font size',
    );

    assertEqual(
      metrics.overflowAfterFont > 0,
      false,
      'Typography change must trigger repagination to avoid overflowing pages',
    );

    assertEqual(
      metrics.updatedPadding === metrics.initialPadding,
      false,
      'Page padding slider must change the rendered page padding',
    );

    assertEqual(
      metrics.pageCountMatches,
      true,
      'Rendered page count must stay in sync with pagination metadata after typography changes',
    );
  } finally {
    await browser.close();
  }
};
