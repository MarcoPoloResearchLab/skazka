// @ts-check

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');

const APP_JS_PATH = path.join(__dirname, '..', 'js', 'app.js');
const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');

/**
 * @param {object} options
 * @param {number} options.pageWidth
 * @param {string} options.pageHeight
 */
function buildHarnessHtml({ pageWidth, pageHeight }) {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        :root{
          --page-width: ${pageWidth}px;
          --page-height: ${pageHeight};
          --page-padding: 24px;
          --base-font-size: 18px;
          --line-height: 1.6;
          --page-bg: #ffffff;
          --page-fg: #111111;
        }
        body { margin:0; height:100vh; display:flex; }
        .shell { display:flex; flex-direction:column; height:100vh; flex:1 1 auto; }
        .toolbar { flex:0 0 auto; height:72px; border-bottom:1px solid #ccc; }
        .area { flex:1 1 auto; display:flex; background:var(--page-bg); color:var(--page-fg); }
        .footer { flex:0 0 auto; height:64px; border-top:1px solid #ccc; }
        .pages {
          display:flex;
          overflow-x:auto;
          overflow-y:hidden;
          -webkit-overflow-scrolling:touch;
          scroll-snap-type:x mandatory;
          gap:0;
          height: var(--page-height);
          background: var(--page-bg);
          color: var(--page-fg);
        }
        .page {
          flex: 0 0 var(--page-width);
          height: var(--page-height);
          padding: var(--page-padding);
          font-size: var(--base-font-size);
          line-height: var(--line-height);
          box-sizing: border-box;
          overflow: hidden;
          scroll-snap-align: start;
          white-space: normal;
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
      <script>${appSource}</script>
    </body>
  </html>`;
}

const LINE_BREAK_FLOW = `<p>${Array.from({ length: 200 }, (_, index) => `Line ${index + 1}`).join('<br>')}</p>`;
const VIEWPORT = { width: 1024, height: 768 };

/** @type {{name: string, harnessHtml: string, flowHtml: string, expectedLastToken: string}[]} */
const testCases = [
  {
    name: 'SingleBlock_ShouldNotOverflow',
    harnessHtml: buildHarnessHtml({ pageWidth: 1024, pageHeight: 'calc(100vh - 160px)' }),
    flowHtml: LINE_BREAK_FLOW,
    expectedLastToken: '200',
  },
  {
    name: 'LongParagraph_WordsWrap',
    harnessHtml: buildHarnessHtml({ pageWidth: 1024, pageHeight: 'calc(100vh - 160px)' }),
    flowHtml: `<p>${Array.from({ length: 2000 }, (_, index) => `word${index + 1}`).join(' ')}</p>`,
    expectedLastToken: 'word2000',
  },
  {
    name: 'RawTextNodes_ShouldPaginateCleanly',
    harnessHtml: buildHarnessHtml({ pageWidth: 1024, pageHeight: 'calc(100vh - 160px)' }),
    flowHtml: Array.from({ length: 1200 }, (_, index) => `token${index + 1}`).join('  '),
    expectedLastToken: 'token1200',
  },
];

module.exports = async function runPaginationTests() {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    for (const testCase of testCases) {
      const page = await browser.newPage();
      if (VIEWPORT) {
        await page.setViewport(VIEWPORT);
      }
      await page.setContent(testCase.harnessHtml, { waitUntil: 'domcontentloaded' });

      const metrics = await page.evaluate((flowHtml) => {
        const reader = bookReader();
        reader.pagesEl = document.getElementById('readerPages');
        reader.applyTypography();
        reader.renderPages(flowHtml);

      const pages = Array.from(reader.pagesEl.children);
      const overflowDiffs = pages.map((node) => node.scrollHeight - node.clientHeight);
      const overflowCount = overflowDiffs.filter((diff) => diff > 0.5).length;
      const combinedText = pages.map((node) => (node.textContent || '').trim()).join(' ').trim();
      const tokens = combinedText ? combinedText.split(/\s+/) : [];
      const trailingToken = tokens.length ? tokens[tokens.length - 1] : '';

        return {
          overflowCount,
          maxOverflow: overflowDiffs.reduce((max, diff) => Math.max(max, diff), 0),
          trailingToken,
        };
      }, testCase.flowHtml);

      assertEqual(
        metrics.overflowCount,
        0,
        `${testCase.name}: expected no overflow but found ${metrics.overflowCount} page(s) overflowing`,
      );

      assertEqual(
        metrics.trailingToken,
        testCase.expectedLastToken,
        `${testCase.name}: expected trailing token "${testCase.expectedLastToken}" but found "${metrics.trailingToken}"`,
      );

      await page.close();
    }
  } finally {
    await browser.close();
  }
};
