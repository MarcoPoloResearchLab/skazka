// @ts-check

const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { loadReaderHarness } = require('./helpers/harness');
const { EXPECTED_PAGE_PADDING_PX } = require('./helpers/constants');

const LONG_PARAGRAPH_FLOW = `<p>${Array.from({ length: 1200 }, (_, index) => `Sentence ${index + 1}.`).join(' ')}</p>`;

module.exports = async function runTypographyTests() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    await loadReaderHarness(page);

    const metrics = await page.evaluate(({ flowHtml, expectedPadding }) => {
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
      const initialPaddingPx = parseFloat(initialComputed.paddingLeft);

      const overflowBefore = pageNodes.filter((node) => node.scrollHeight > node.clientHeight + 0.5).length;

      reader.ui.fontSizePx = 24;
      reader.handleFontSizeSliderInput();

      const pageNodesAfterFont = Array.from(reader.pagesEl.children);
      const afterFontComputed = getComputedStyle(pageNodesAfterFont[0]);
      const updatedFontSize = afterFontComputed.fontSize;
      const overflowAfterFont = pageNodesAfterFont.filter(
        (node) => node.scrollHeight > node.clientHeight + 0.5,
      ).length;

      const paddingAfterFontPx = parseFloat(afterFontComputed.paddingLeft);

      return {
        initialFontSize,
        updatedFontSize,
        initialPaddingPx,
        paddingAfterFontPx,
        overflowBefore,
        overflowAfterFont,
        totalPages: reader.ui.totalPageCount,
        pageCountMatches: reader.ui.totalPageCount === reader.pagesEl.children.length,
        expectedPadding,
      };
    }, { flowHtml: LONG_PARAGRAPH_FLOW, expectedPadding: EXPECTED_PAGE_PADDING_PX });

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
      metrics.initialPaddingPx,
      metrics.expectedPadding,
      `Default page padding must be ${EXPECTED_PAGE_PADDING_PX}px to frame page content`,
    );

    assertEqual(
      metrics.paddingAfterFontPx,
      metrics.expectedPadding,
      'Page padding must remain fixed when typography settings change',
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
