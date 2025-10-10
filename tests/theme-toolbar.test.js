// @ts-check

const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { loadReaderHarness } = require('./helpers/harness');

const CONTROL_SELECTORS = [
  { selector: 'select[x-model="provider"]', name: 'provider select' },
  { selector: 'select[x-model="encoding"]', name: 'encoding select' },
  { selector: 'input[x-model="loadUrl"]', name: 'URL input' },
  { selector: 'select[x-model="theme"]', name: 'theme select' },
];

module.exports = async function runToolbarThemeTests() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await loadReaderHarness(page);

    const measurements = await page.evaluate((controls) => {
      const reader = bookReader();
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();
      reader.ui.theme = 'dark';
      reader.applyTheme();
      document.body.className = reader.themeClass;

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

      return controls.map((control) => {
        const node = document.querySelector(control.selector);
        if (!node) {
          throw new Error(`Failed to locate ${control.name}`);
        }
        const styles = getComputedStyle(node);
        return {
          name: control.name,
          background: styles.backgroundColor,
          color: styles.color,
          expectedBg,
          expectedFg,
        };
      });
    }, CONTROL_SELECTORS);

    measurements.forEach((measurement) => {
      assertEqual(
        measurement.background,
        measurement.expectedBg,
        `${measurement.name} must adopt the themed background color in dark mode`,
      );

      assertEqual(
        measurement.color,
        measurement.expectedFg,
        `${measurement.name} must adopt the themed foreground color in dark mode`,
      );
    });
  } finally {
    await browser.close();
  }
};
