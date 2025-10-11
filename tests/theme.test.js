// @ts-check

const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { loadReaderHarness } = require('./helpers/harness');

const OFFCANVAS_MARKUP = `
  <div class="offcanvas offcanvas-start toc-offcanvas" id="tocDrawer">
    <div class="offcanvas-header">Contents</div>
    <div class="offcanvas-body">
      <div class="list-group">
        <a class="list-group-item list-group-item-action" id="tocItem">Chapter 1</a>
      </div>
    </div>
  </div>`;

module.exports = async function runThemeTests() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await loadReaderHarness(page, { extraBodyMarkup: OFFCANVAS_MARKUP });

    const metrics = await page.evaluate(() => {
      const reader = bookReader();
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();
      reader.ui.theme = 'dark';
      reader.applyTheme();
      document.body.className = reader.themeClass;

      const offcanvas = document.getElementById('tocDrawer');
      const styles = getComputedStyle(offcanvas);
      return {
        bodyClass: document.body.className,
        offcanvasBackground: styles.backgroundColor,
        offcanvasColor: styles.color,
      };
    });

    assertEqual(
      metrics.bodyClass.includes('theme-dark'),
      true,
      'Applying dark theme should decorate the reader root with .theme-dark class',
    );

    assertEqual(
      metrics.offcanvasBackground.startsWith('rgb'),
      true,
      'Offcanvas background should resolve to a computed color in dark theme',
    );

    assertEqual(
      metrics.offcanvasColor.startsWith('rgb'),
      true,
      'Offcanvas foreground should resolve to a computed color in dark theme',
    );
  } finally {
    await browser.close();
  }
};
