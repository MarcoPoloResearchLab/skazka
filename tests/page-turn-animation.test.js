// @ts-check

const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { buildReaderHarnessHtml, inlineStyles } = require('./helpers/harness');
const { PAGE_TURN_ANIMATION_MS } = require('./helpers/constants');

const LONG_FLOW = `<p>${Array.from({ length: 1500 }, (_, index) => `Story sentence ${index + 1}.`).join(' ')}</p>`;
const PAGE_FLIP_CLASS = 'page--corner-flip';
const PAGE_FLIP_KEYFRAME = '@keyframes pageCornerFlip';

module.exports = async function runPageTurnAnimationTests() {
  assertEqual(
    inlineStyles.includes(PAGE_FLIP_KEYFRAME),
    true,
    'Reader styles must define the page corner flip keyframes',
  );

  assertEqual(
    inlineStyles.includes(`.${PAGE_FLIP_CLASS}`),
    true,
    'Reader styles must expose a page corner flip class hook',
  );

  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(buildReaderHarnessHtml(), { waitUntil: 'domcontentloaded' });

    const pageCount = await page.evaluate((flowHtml) => {
      window.__reader = bookReader();
      const reader = window.__reader;
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();
      reader.renderPages(flowHtml);
      return reader.pagesEl.children.length;
    }, LONG_FLOW);

    assertEqual(
      pageCount > 1,
      true,
      'Long flow should paginate into multiple pages for the flip animation test',
    );

    const classDuringTurn = await page.evaluate((className) => {
      const reader = window.__reader;
      reader.scrollToPage(1, 0);
      const target = reader.pagesEl.children[1];
      if (!target) {
        throw new Error('Expected at least two pages when checking flip animation class');
      }
      return target.classList.contains(className);
    }, PAGE_FLIP_CLASS);

    assertEqual(
      classDuringTurn,
      true,
      'Page turn should apply the corner flip animation class to the target page',
    );

    await page.evaluate(
      (delay) => new Promise((resolve) => {
        setTimeout(resolve, delay);
      }),
      PAGE_TURN_ANIMATION_MS + 100,
    );

    const classAfterAnimation = await page.evaluate((className) => {
      const reader = window.__reader;
      const target = reader.pagesEl.children[1];
      if (!target) {
        throw new Error('Expected at least two pages when verifying animation reset');
      }
      return target.classList.contains(className);
    }, PAGE_FLIP_CLASS);

    assertEqual(
      classAfterAnimation,
      false,
      'Corner flip animation class should be removed after the animation completes',
    );
  } finally {
    await browser.close();
  }
};
