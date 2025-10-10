// @ts-check

const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');
const { assertEqual, assertDeepEqual } = require('./assert');
const { createHarnessFile, inlineStyles } = require('./helpers/harness');

const PROJECT_ROOT = path.join(__dirname, '..');

module.exports = async function runCoreModuleTests() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await runTextNormalizerUnit(page);
    await runPaginationServiceScenario(page);
  } finally {
    await browser.close();
  }
};

async function runTextNormalizerUnit(page) {
  const normalizerUrl = pathToFileURL(path.join(PROJECT_ROOT, 'js', 'core', 'text-normalizer.js')).href;

  const html = `<!DOCTYPE html>
  <html>
    <head><meta charset="utf-8"></head>
    <body>
      <script type="module">
        import { prepareContent, stripByProvider } from '${normalizerUrl}';
        const filler = 'Extended paragraph '.repeat(40);
        const gutenbergSample = [
          '*** START OF THIS PROJECT GUTENBERG EBOOK',
          'Title: Sample Tale',
          'Author: Fiction Writer',
          '',
          'CHAPTER 1',
          'This is the opening line[1].',
          filler,
          '',
          'Footnotes',
          '[1] First footnote content.',
          '*** END OF THIS PROJECT GUTENBERG EBOOK ***'
        ].join('\\n');
        const processed = prepareContent(gutenbergSample, { provider: 'gutenberg' });
        const direct = stripByProvider(gutenbergSample, 'gutenberg');
        window.__normalizerResult = {
          strippedHasHeader: processed.stripped.includes('START OF THIS PROJECT GUTENBERG'),
          metadata: processed.metadata,
          sectionsLength: processed.segmented.sections.length,
          flowHtmlHasFootnote: /footnote-inline/.test(processed.flowHtml),
        };
      </script>
    </body>
  </html>`;

  const fileUrl = createHarnessFile(html);
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => Boolean(window.__normalizerResult));
  const outcome = await page.evaluate(() => window.__normalizerResult);

  assertEqual(outcome.strippedHasHeader, false, 'stripByProvider should drop Gutenberg headers');
  assertDeepEqual(
    outcome.metadata,
    { title: 'Sample Tale', author: 'Fiction Writer' },
    'prepareContent should extract metadata'
  );
  assertEqual(outcome.sectionsLength > 0, true, 'prepareContent should detect at least one section');
  assertEqual(outcome.flowHtmlHasFootnote, true, 'Flow HTML should include inline footnote markup');
}

async function runPaginationServiceScenario(page) {
  const paginationModuleUrl = pathToFileURL(path.join(PROJECT_ROOT, 'js', 'core', 'pagination.js')).href;

  const outcome = await page.evaluate(async ({ url, styles }) => {
    const { paginateFlowHtml } = await import(url);
    document.head.innerHTML = `
        <style>
          ${styles}
          :root{
            --page-padding: 24px;
            --base-font-size: 18px;
            --line-height: 1.6;
            --page-height: 560px;
            --page-width: 420px;
          }
        </style>
      `;
    document.body.innerHTML = '<div id="pages" class="pages"></div>';
    const container = /** @type {HTMLElement} */ (document.getElementById('pages'));
    container.style.width = '420px';
    container.style.height = '560px';
    const longParagraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
    const flowHtml = `
        <h1 id="heading-1">Chapter 1</h1>
        <p>${longParagraph.repeat(120)}</p>
        <p>${longParagraph.repeat(60)}</p>
      `;
    const result = paginateFlowHtml(flowHtml, {
      container,
      pageWidthPx: 420,
      pageHeightPx: 560,
      preserveRatio: null,
    });
    const pageLengths = Array.from(container.children).map((child) => child.textContent.trim().length);
    return {
      totalPages: result.totalPages,
      childCount: container.children.length,
      filledCount: pageLengths.filter((length) => length > 0).length,
    };
  }, { url: paginationModuleUrl, styles: inlineStyles });

  assertEqual(outcome.totalPages, outcome.childCount, 'paginateFlowHtml totalPages should match rendered pages');
  assertEqual(outcome.totalPages > 1, true, 'Sample content should span multiple pages');
  assertEqual(outcome.filledCount > 0, true, 'Pagination should preserve text content');
}
