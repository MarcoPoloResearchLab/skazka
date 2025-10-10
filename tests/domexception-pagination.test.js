// @ts-check

const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { createHarnessFile } = require('./helpers/harness');

const READER_MODULE_URL = pathToFileURL(path.join(__dirname, '..', 'js', 'ui', 'reader.js')).href;

function buildHarnessHtml() {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        :root{
          --page-width: 720px;
          --page-height: 480px;
          --page-padding: 24px;
          --base-font-size: 18px;
          --line-height: 1.6;
          --page-bg: #ffffff;
          --page-fg: #111111;
        }
        body { margin:0; height:100vh; display:flex; }
        .shell { display:flex; flex-direction:column; height:100vh; flex:1 1 auto; }
        .toolbar { flex:0 0 auto; height:72px; border-bottom:1px solid #ccc; }
        .area { flex:1 1 auto; display:flex; background:var(--page-bg); color:var(--page-fg); width:720px; }
        .pages {
          display:flex;
          overflow-x:auto;
          overflow-y:hidden;
          -webkit-overflow-scrolling:touch;
          scroll-snap-type:x mandatory;
          gap:0;
          height: var(--page-height);
          width: 720px;
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

module.exports = async function runDomExceptionPaginationTest() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const errorMessages = [];
    page.on('pageerror', (error) => {
      errorMessages.push(String(error && error.message ? error.message : error));
    });

    const harnessUrl = createHarnessFile(buildHarnessHtml());
    await page.goto(harnessUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__bookReaderReady === true || typeof window.bookReader === 'function');

    const introParagraph = Array.from({ length: 600 }, () => 'Intro').join(' ');
    const chapterParagraph = Array.from({ length: 1400 }, (_, index) => `Paragraph${index + 1}`).join(' ');
    const FLOW = [
      '<h1>Test Book</h1>',
      `<p>${introParagraph}</p>`,
      '<h2>Chapter Heading</h2>',
      `<p>${chapterParagraph}</p>`
    ].join('');

    const metrics = await page.evaluate((flow) => {
      const reader = window.attachReader(flow);
      const pages = Array.from(reader.pagesEl.children);
      const combinedText = pages.map((node) => (node.textContent || '').trim()).join(' ');
      return {
        totalPages: reader.ui.totalPageCount,
        trailing: combinedText.slice(-40),
      };
    }, FLOW);

    assertEqual(
      errorMessages.length,
      0,
      `Expected no DOMExceptions during pagination but captured: ${errorMessages.join('; ')}`,
    );

    assertEqual(
      metrics.totalPages > 1,
      true,
      'Expected sample content to span multiple pages.',
    );

    assertEqual(
      metrics.trailing.includes('Paragraph1400'),
      true,
      'Expected final token from pagination output to be preserved.',
    );
  } finally {
    await browser.close();
  }
};
