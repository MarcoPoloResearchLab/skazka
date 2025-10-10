// @ts-check

const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');

module.exports = async function runReaderFlowTests() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--allow-file-access-from-files'],
  });
  try {
    const page = await browser.newPage();
    const indexUrl = path.join(__dirname, '..', 'index.html');
    await page.goto(`file://${indexUrl}`, { waitUntil: 'domcontentloaded' });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const fileInput = await page.$('input[type="file"]');
    const bookPath = path.join(
      __dirname,
      '..',
      'assets',
      'texts',
      'В. Ф. Одоевский. Городок в табакерке. Текст произведения.txt',
    );
    await fileInput.uploadFile(bookPath);

    await page.waitForFunction(
      () => document.querySelectorAll('.pages .page').length > 1,
      { timeout: 10000 },
    );

    const initialState = await page.evaluate(() => {
      const summaryText = document.querySelector('[data-test="progress-pages"]').textContent.trim();
      const progressStyle = document.querySelector('.progress-bar').style.width;
      const prevDisabled = document.querySelector('.page-prev').disabled;
      const nextDisabled = document.querySelector('.page-next').disabled;
      const tocItems = Array.from(document.querySelectorAll('#tocDrawer .list-group-item')).length;

      return {
        summaryText,
        progressStyle,
        prevDisabled,
        nextDisabled,
        tocItems,
      };
    });

    assertEqual(initialState.prevDisabled, true, 'Previous button must be disabled on the first page');
    assertEqual(initialState.nextDisabled, false, 'Next button must be enabled on the first page');
    assertEqual(initialState.summaryText.startsWith('1/'), true, 'Page summary should start at page 1');
    assertEqual(initialState.progressStyle.endsWith('%'), true, 'Progress bar width should be set');
    assertEqual(initialState.tocItems > 0, true, 'TOC must contain entries after loading a book');

    await page.click('.page-next');
    await page.waitForFunction(
      () => document.querySelector('[data-test="progress-pages"]').textContent.trim().startsWith('2/'),
      { timeout: 10000 },
    );

    const afterAdvance = await page.evaluate(() => {
      const summaryText = document.querySelector('[data-test="progress-pages"]').textContent.trim();
      const prevDisabled = document.querySelector('.page-prev').disabled;
      const nextDisabled = document.querySelector('.page-next').disabled;
      return { summaryText, prevDisabled, nextDisabled };
    });

    assertEqual(afterAdvance.summaryText.startsWith('2/'), true, 'Page summary should advance after navigating');
    assertEqual(afterAdvance.prevDisabled, false, 'Previous button should be enabled after advancing');
    assertEqual(afterAdvance.nextDisabled, false, 'Next button should remain enabled when more pages remain');
  } finally {
    await browser.close();
  }
};
