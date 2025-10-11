// @ts-check

const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');

module.exports = async function runDropdownPopulationTests() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--allow-file-access-from-files'],
  });
  try {
    const page = await browser.newPage();
    const indexUrl = path.join(__dirname, '..', 'index.html');
    await page.goto(`file://${indexUrl}`, { waitUntil: 'domcontentloaded' });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const dropdownData = await page.evaluate(() => {
      const providerSelect = document.querySelector('[x-data="readerToolbar()"] select');
      const encodingSelect = document.querySelectorAll('[x-data="readerToolbar()"] select')[1];
      const providerOptions = providerSelect
        ? Array.from(providerSelect.options).map((option) => option.textContent)
        : [];
      const encodingOptions = encodingSelect
        ? Array.from(encodingSelect.options).map((option) => option.textContent)
        : [];
      return {
        providerOptions,
        encodingOptions,
      };
    });

    assertEqual(
      dropdownData.providerOptions.length > 0,
      true,
      'Provider dropdown should contain predefined options',
    );
    assertEqual(
      dropdownData.encodingOptions.length > 0,
      true,
      'Encoding dropdown should contain predefined options',
    );

    assertEqual(dropdownData.providerOptions.includes('Auto'), true, 'Provider dropdown must include Auto');
    assertEqual(dropdownData.encodingOptions.includes('utf-8'), true, 'Encoding dropdown must include utf-8');
  } finally {
    await browser.close();
  }
};
