// @ts-check

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual, assertDeepEqual } = require('./assert');
const { loadReaderHarness } = require('./helpers/harness');

const FIXTURES = {
  first: 'book-one.txt',
  second: 'book-two.txt',
};

function readFixtureBase64(filename) {
  const filePath = path.join(__dirname, 'fixtures', filename);
  return fs.readFileSync(filePath, 'utf8');
}

function encodeBase64(content) {
  return Buffer.from(content, 'utf8').toString('base64');
}

module.exports = async function runTocRefreshTests() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await loadReaderHarness(page);

    const events = await page.evaluate(async ({ firstText, secondText }) => {
      const reader = bookReader();
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();

      window.__tocEvents = [];
      document.addEventListener('reader:tocUpdated', (event) => {
        const detail = event && typeof event.detail === 'object' ? event.detail : {};
        window.__tocEvents.push({
          bookTitle: detail.bookTitle || null,
          headings: Array.isArray(detail.headings) ? detail.headings.slice() : [],
        });
      });

      const decodeBuffer = (text) => {
        const encoder = new TextEncoder();
        return encoder.encode(text).buffer;
      };

      const loadFixture = (text, name) => {
        const buffer = decodeBuffer(text);
        reader.lastRaw = { buffer, url: null, name, provider: 'auto' };
        reader.decodeAndConsume(buffer);
      };

      loadFixture(firstText, 'first.txt');
      await new Promise((resolve) => setTimeout(resolve, 0));
      loadFixture(secondText, 'second.txt');
      await new Promise((resolve) => setTimeout(resolve, 0));

      return window.__tocEvents.slice();
    }, {
      firstText: readFixtureBase64(FIXTURES.first),
      secondText: readFixtureBase64(FIXTURES.second),
    });

    assertEqual(Array.isArray(events), true, 'TOC update events should be captured');
    assertEqual(events.length, 2, 'Expected two TOC updates after loading two fixtures');

    assertDeepEqual(
      events[0],
      {
        bookTitle: 'Title: Book One',
        headings: [
          'Title: Book One',
          'CHAPTER 1:  First Chapter',
          'CHAPTER 2:  Second Chapter',
        ],
      },
      'First TOC event should match the first fixture headings',
    );

    assertDeepEqual(
      events[1],
      {
        bookTitle: 'Title: Book Two',
        headings: [
          'Title: Book Two',
          'CHAPTER I:  Dawn',
          'CHAPTER II:  New Horizon',
        ],
      },
      'Second TOC event should match the second fixture headings',
    );
  } finally {
    await browser.close();
  }
};
