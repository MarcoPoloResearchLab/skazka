// @ts-check

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { INDEX_HTML_PATH, loadReaderHarness } = require('./helpers/harness');
const { EXPECTED_PAGE_PADDING_PX } = require('./helpers/constants');
const SAMPLE_FLOW = '<p>Margin test paragraph content.</p>';
const READER_JS_PATH = path.join(__dirname, '..', 'js', 'ui', 'reader.js');

module.exports = async function runPageMarginTests() {
  const markup = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  assertEqual(
    markup.includes('handlePagePaddingSliderInput'),
    false,
    'Page margin slider must be removed from the toolbar markup',
  );

  const readerSource = fs.readFileSync(READER_JS_PATH, 'utf8');
  assertEqual(
    readerSource.includes('handlePagePaddingSliderInput'),
    false,
    'Page padding change handler must not remain in reader.js once margins are fixed',
  );

  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    await loadReaderHarness(page);

    const metrics = await page.evaluate(
      ({ flow, expectedPadding }) => {
        const reader = bookReader();
        reader.pagesEl = document.getElementById('readerPages');
        reader.applyTypography();
        reader.renderPages(flow);

        const firstPage = reader.pagesEl.firstElementChild;
        if (!firstPage) {
          throw new Error('Reader failed to render pages for margin test');
        }

        const computedPaddingLeft = parseFloat(getComputedStyle(firstPage).paddingLeft);
        const uiHasPaddingState = Object.prototype.hasOwnProperty.call(reader.ui, 'pagePaddingPx');
        return { computedPaddingLeft, uiHasPaddingState, expectedPadding };
      },
      { flow: SAMPLE_FLOW, expectedPadding: EXPECTED_PAGE_PADDING_PX },
    );

    assertEqual(
      metrics.uiHasPaddingState,
      false,
      'Reader UI state should not expose adjustable page padding when margin is fixed',
    );

    assertEqual(
      metrics.computedPaddingLeft,
      metrics.expectedPadding,
      `Rendered pages must use a fixed padding of ${EXPECTED_PAGE_PADDING_PX}px`,
    );
  } finally {
    await browser.close();
  }
};
