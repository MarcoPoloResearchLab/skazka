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
      <script type="module">
        import('${READER_MODULE_URL}')
          .then(({ createReader }) => {
            window.bookReader = createReader;
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

const LINE_BREAK_FLOW = `<p>${Array.from({ length: 200 }, (_, index) => `Line ${index + 1}`).join('<br>')}</p>`;
const VIEWPORT = { width: 1024, height: 768 };

/** @type {{
  name: string,
  harnessHtml: string,
  flowHtml: string,
  expectedLastToken: string,
  expectedLeadingFootnotes?: number,
  expectedDanglingSup?: number
}[]} */
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
  {
    name: 'FootnoteReferencesStayInline',
    harnessHtml: buildHarnessHtml({ pageWidth: 1024, pageHeight: 'calc(100vh - 160px)' }),
    flowHtml: `<p>${Array.from({ length: 600 }, (_, index) => `word${index + 1}`).join(' ')} <sup class="footnote-ref" data-footnote-id="fn1">[1]</sup> ${Array.from({ length: 400 }, (_, index) => `tail${index + 1}`).join(' ')}</p>`,
    expectedLastToken: 'tail400',
    expectedLeadingFootnotes: 0,
    expectedDanglingSup: 0,
  },
];

module.exports = async function runPaginationTests() {
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
        const leadingFootnotes = pages.filter((node) => {
          const firstElement = node.firstElementChild || node.firstChild;
          if (!firstElement) return false;
          if (firstElement.nodeType === Node.ELEMENT_NODE && firstElement.tagName === 'SUP') {
            return true;
          }
          if (firstElement.nodeType === Node.TEXT_NODE) {
            return firstElement.textContent.trim().startsWith('[');
          }
          if (firstElement.nodeType === Node.ELEMENT_NODE && firstElement.tagName === 'P') {
            const text = firstElement.textContent.trim();
            return text.startsWith('[');
          }
          return false;
        }).length;

        const danglingSup = pages.reduce((count, node) => {
          const refs = Array.from(node.querySelectorAll('sup.footnote-ref'));
          const invalid = refs.filter((ref) => {
            const parent = ref.parentElement;
            if (!parent) return true;
            const parentTag = parent.tagName;
            if (parentTag === 'P' || parentTag === 'EM' || parentTag === 'SPAN' || parentTag === 'STRONG') {
              return false;
            }
            return true;
          });
          return count + invalid.length;
        }, 0);

        return {
          overflowCount,
          maxOverflow: overflowDiffs.reduce((max, diff) => Math.max(max, diff), 0),
          trailingToken,
          leadingFootnotes,
          danglingSup,
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

      if (typeof testCase.expectedLeadingFootnotes === 'number') {
        assertEqual(
          metrics.leadingFootnotes,
          testCase.expectedLeadingFootnotes,
          `${testCase.name}: expected ${testCase.expectedLeadingFootnotes} pages to start with footnote markers, found ${metrics.leadingFootnotes}`,
        );
      }

      if (typeof testCase.expectedDanglingSup === 'number') {
        assertEqual(
          metrics.danglingSup,
          testCase.expectedDanglingSup,
          `${testCase.name}: expected ${testCase.expectedDanglingSup} dangling footnote markers outside inline containers, found ${metrics.danglingSup}`,
        );
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }
};
