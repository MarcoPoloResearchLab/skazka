// @ts-check

const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { buildReaderHarnessHtml } = require('./helpers/harness');

const TOC_MARKUP = `
<div class="offcanvas offcanvas-start toc-offcanvas" id="tocDrawer">
  <div class="offcanvas-body">
    <div class="list-group" id="tocEntries"></div>
  </div>
</div>`;

module.exports = async function runTocThemeTests() {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setContent(
      buildReaderHarnessHtml({ extraBodyMarkup: TOC_MARKUP }),
      { waitUntil: 'domcontentloaded' },
    );

    const metrics = await page.evaluate(() => {
      const reader = bookReader();
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();

      const listGroup = document.getElementById('tocEntries');
      listGroup.innerHTML = '<a class="list-group-item list-group-item-action" data-test="toc-item">Chapter 1</a>';

      reader.ui.theme = 'dark';
      reader.applyTheme();
      document.body.className = reader.themeClass;

      const item = document.querySelector('[data-test="toc-item"]');
      if (!item) {
        throw new Error('Failed to render TOC list item for theme test');
      }

      const hexToRgb = (hex) => {
        const normalized = hex.trim();
        if (!normalized.startsWith('#')) {
          return normalized;
        }
        const value = normalized.length === 4
          ? normalized.slice(1).split('').map((char) => char + char).join('')
          : normalized.slice(1);
        const int = parseInt(value, 16);
        const r = (int >> 16) & 255;
        const g = (int >> 8) & 255;
        const b = int & 255;
        return `rgb(${r}, ${g}, ${b})`;
      };

      const themedStyles = getComputedStyle(document.body);
      const expectedBg = hexToRgb(themedStyles.getPropertyValue('--page-bg'));
      const expectedFg = hexToRgb(themedStyles.getPropertyValue('--page-fg'));

      const computed = getComputedStyle(item);
      return {
        expectedBg,
        expectedFg,
        background: computed.backgroundColor,
        color: computed.color,
      };
    });

    assertEqual(
      metrics.background,
      metrics.expectedBg,
      'TOC entries must adopt the themed background color when switching themes',
    );

    assertEqual(
      metrics.color,
      metrics.expectedFg,
      'TOC entries must adopt the themed foreground color when switching themes',
    );
  } finally {
    await browser.close();
  }
};
