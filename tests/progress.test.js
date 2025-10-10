// @ts-check

const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { createHarnessFile } = require('./helpers/harness');
const READER_MODULE_URL = pathToFileURL(path.join(__dirname, '..', 'js', 'ui', 'reader.js')).href;

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
        .area { flex:1 1 auto; display:flex; background:var(--page-bg); color:var(--page-fg); width:${pageWidth}px; }
        .footer { flex:0 0 auto; height:64px; border-top:1px solid #ccc; }
        .pages {
          display:flex;
          overflow-x:auto;
          overflow-y:hidden;
          -webkit-overflow-scrolling:touch;
          scroll-snap-type:x mandatory;
          gap:0;
          height: var(--page-height);
          width: ${pageWidth}px;
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
        <div class="footer">
          <div id="progressSummary" data-test="progress-summary"></div>
        </div>
      </div>
      <script type="module">
        import('${READER_MODULE_URL}')
          .then(({ createReader }) => {
            window.attachReader = function(flowHtml) {
              const reader = createReader();
              reader.pagesEl = document.getElementById('readerPages');
              reader.applyTypography();
              reader.renderPages(flowHtml);
              return reader;
            };
            window.__bookReaderReady = true;
          })
          .catch((error) => {
            console.error('Failed to load reader module', error);
            window.__bookReaderReady = false;
          });
      </script>
    </body>
  </html>`;
}

const REPEATED_PARAGRAPHS = `<p>${Array.from({ length: 900 }, (_, index) => `Paragraph ${index + 1}.` ).join(' ')}</p>`;
const VIEWPORT = { width: 1024, height: 768 };

/** @typedef {{name: string, harnessHtml: string, flowHtml: string, expectMultiPage: boolean}} ProgressTestCase */

/** @type {ProgressTestCase[]} */
const testCases = [
  {
    name: 'ProgressReflectsCurrentPage',
    harnessHtml: buildHarnessHtml({ pageWidth: 600, pageHeight: '240px' }),
    flowHtml: REPEATED_PARAGRAPHS,
    expectMultiPage: true,
  },
  {
    name: 'SinglePage_StartsAtZero',
    harnessHtml: buildHarnessHtml({ pageWidth: 600, pageHeight: '600px' }),
    flowHtml: '<p>Short story.</p>',
    expectMultiPage: false,
  },
];

module.exports = async function runProgressTests() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    for (const testCase of testCases) {
      const page = await browser.newPage();
      if (VIEWPORT) {
        await page.setViewport(VIEWPORT);
      }
      const fileUrl = createHarnessFile(testCase.harnessHtml);
      await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__bookReaderReady === true || typeof window.bookReader === 'function');

      const metrics = await page.evaluate((flowHtml) => {
        const reader = window.attachReader(flowHtml);

        const capture = () => {
          const percent = Math.round(typeof reader.progressPercent === 'function' ? reader.progressPercent() : NaN);
          const summary = typeof reader.progressPageSummary === 'function'
            ? reader.progressPageSummary()
            : null;
          return { percent, summary, index: reader.ui.currentPageIndex };
        };

        const totalPages = reader.ui.totalPageCount;
        const initial = capture();

        const targetIndex = totalPages > 1 ? 1 : 0;
        reader.pagesEl.scrollLeft = targetIndex * reader.pageWidthPx;
        reader.recomputePages();
        const mid = capture();

        const lastIndex = Math.max(0, totalPages - 1);
        reader.pagesEl.scrollLeft = lastIndex * reader.pageWidthPx;
        reader.recomputePages();
        const final = capture();

        let indexOnly = null;
        if (totalPages > 0) {
          reader.pagesEl.scrollLeft = 0;
          reader.ui.currentPageIndex = lastIndex;
          indexOnly = capture();
        }

        return { totalPages, initial, mid, final, indexOnly };
      }, testCase.flowHtml);

      if (testCase.expectMultiPage) {
        assertEqual(
          metrics.totalPages > 1,
          true,
          `${testCase.name}: expected content to paginate across multiple pages`,
        );
      } else {
        assertEqual(
          metrics.totalPages,
          1,
          `${testCase.name}: expected content to fit within a single page`,
        );
      }

      assertEqual(
        metrics.initial.percent,
        0,
        `${testCase.name}: expected progress to start at 0% on the first page`,
      );

      const expectedInitialSummary = metrics.totalPages >= 1 ? `1/${metrics.totalPages}` : null;
      assertEqual(
        metrics.initial.summary,
        expectedInitialSummary,
        `${testCase.name}: expected progress summary to show total/current page at start`,
      );

      if (testCase.expectMultiPage) {
        const expectedMidPercent = Math.round((1 / (metrics.totalPages - 1)) * 100);
        assertEqual(
          metrics.mid.percent,
          expectedMidPercent,
          `${testCase.name}: expected progress to reflect advancement to the next page`,
        );

        const expectedMidSummary = `2/${metrics.totalPages}`;
        assertEqual(
          metrics.mid.summary,
          expectedMidSummary,
          `${testCase.name}: expected progress summary to update with the current page`,
        );

        assertEqual(
          metrics.final.percent,
          100,
          `${testCase.name}: expected progress to reach 100% on the last page`,
        );

        const expectedFinalSummary = `${metrics.totalPages}/${metrics.totalPages}`;
        assertEqual(
          metrics.final.summary,
          expectedFinalSummary,
          `${testCase.name}: expected progress summary to report reaching the last page`,
        );

        if (metrics.indexOnly) {
          assertEqual(
            metrics.indexOnly.percent,
            100,
            `${testCase.name}: expected progress to report completion even if scrollLeft is reset`,
          );
        }
      } else {
        assertEqual(
          metrics.mid.percent,
          0,
          `${testCase.name}: expected progress to remain 0% while no additional pages exist`,
        );
        assertEqual(
          metrics.final.percent,
          0,
          `${testCase.name}: expected progress to remain 0% for single-page content`,
        );

        const expectedSummary = `${metrics.totalPages}/1`;
        assertEqual(
          metrics.final.summary,
          expectedSummary,
          `${testCase.name}: expected summary to reflect single-page state`,
        );
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }
};
