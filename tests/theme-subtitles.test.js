// @ts-check

const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { buildReaderHarnessHtml } = require('./helpers/harness');

const BOOK_INFO_TOOLBAR = `
      <div class="toolbar">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <div class="ms-1 me-auto">
            <strong>Skazka Skazok</strong>
            <span class="text-muted ms-2" data-test="author-subtitle">by Сергей Тимофеевич Аксаков</span>
            <span class="text-muted ms-3" data-test="page-summary">Page 22 / 41</span>
          </div>
        </div>
      </div>`;

module.exports = async function runSubtitleThemeTests() {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setContent(
      buildReaderHarnessHtml({ toolbarMarkup: BOOK_INFO_TOOLBAR }),
      { waitUntil: 'domcontentloaded' },
    );
    await page.addStyleTag({ content: '.text-muted { color: rgb(108, 117, 125); }' });

    const measurements = await page.evaluate(() => {
      const reader = bookReader();
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();
      reader.ui.theme = 'dark';
      reader.applyTheme();
      document.body.className = reader.themeClass;

      const themedStyles = getComputedStyle(document.body);
      const expectedColor = themedStyles.getPropertyValue('--page-fg').trim();

      const hexToRgb = (hex) => {
        const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
        const value = normalized.length === 3
          ? normalized.split('').map((char) => char + char).join('')
          : normalized;
        const int = parseInt(value, 16);
        const r = (int >> 16) & 255;
        const g = (int >> 8) & 255;
        const b = int & 255;
        return `rgb(${r}, ${g}, ${b})`;
      };

      const resolvedExpected = hexToRgb(expectedColor);

      const authorColor = getComputedStyle(document.querySelector('[data-test="author-subtitle"]')).color;
      const pageColor = getComputedStyle(document.querySelector('[data-test="page-summary"]')).color;

      return { resolvedExpected, authorColor, pageColor };
    });

    assertEqual(
      measurements.authorColor,
      measurements.resolvedExpected,
      'Author subtitle must respect the themed foreground color',
    );

    assertEqual(
      measurements.pageColor,
      measurements.resolvedExpected,
      'Page summary text must respect the themed foreground color',
    );
  } finally {
    await browser.close();
  }
};
