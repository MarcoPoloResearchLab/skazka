// @ts-check

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { loadReaderHarness } = require('./helpers/harness');

const FIXTURE_NAME = 'В. Ф. Одоевский. Городок в табакерке. Текст произведения.txt';
const EXPECTED_FRAGMENT = 'и вдруг пружинка лопнула';

function readFixtureBase64() {
  const fixturePath = path.join(__dirname, '..', 'assets', 'texts', FIXTURE_NAME);
  return fs.readFileSync(fixturePath).toString('base64');
}

module.exports = async function runTextTruncationSuite() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await loadReaderHarness(page);

    const renderedText = await page.evaluate((fixtureBase64) => {
      const reader = bookReader();
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();

      const decodeFromBase64 = (b64) => {
        const binary = atob(b64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
      };

      const buffer = decodeFromBase64(fixtureBase64);
      reader.lastRaw = { buffer, url: null, name: 'gorodok.txt', provider: 'auto' };
      reader.decodeAndConsume(buffer);

      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const container = document.getElementById('readerPages');
          resolve(container ? container.textContent || '' : '');
        });
      });
    }, readFixtureBase64());

    assertEqual(
      renderedText.includes(EXPECTED_FRAGMENT),
      true,
      `Rendered story should include continuation fragment "${EXPECTED_FRAGMENT}".`,
    );
  } finally {
    await browser.close();
  }
};
