// @ts-check

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { buildReaderHarnessHtml } = require('./helpers/harness');

const SNIPPET_HTML = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'footnote-snippet.html'),
  'utf8',
);

module.exports = async function runFootnoteInlineTests() {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1200 });
    await page.setContent(buildReaderHarnessHtml(), { waitUntil: 'domcontentloaded' });

    const stats = await page.evaluate((snippet) => {
      const reader = bookReader();
      reader.pagesEl = document.getElementById('readerPages');
      reader.applyTypography();

      const makeFiller = (count) =>
        `<p>${Array.from({ length: count }, (_, index) => `pref${index + 1}`).join(' ')}</p>`;

      for (let fillerWords = 200; fillerWords <= 2600; fillerWords += 200) {
        const flowHtml = `${makeFiller(fillerWords)}${snippet}`;
        reader.renderPages(flowHtml);

        const pages = Array.from(reader.pagesEl.children);
        const { dangling, leading } = pages.reduce((sum, pageEl) => {
          const refs = Array.from(pageEl.querySelectorAll('sup.footnote-ref'));
          const invalid = refs.filter((ref) => {
            const parent = ref.parentElement;
            if (!parent) return true;
            return parent.tagName !== 'P' && parent.tagName !== 'EM' && parent.tagName !== 'SPAN';
          });
          const leadingRefs = Array.from(pageEl.querySelectorAll('p')).filter((paragraph) => {
            const firstChild = paragraph.firstChild;
            return firstChild && firstChild.nodeType === Node.ELEMENT_NODE && firstChild.classList.contains('footnote-ref');
          }).length;

          return {
            dangling: sum.dangling + invalid.length,
            leading: sum.leading + leadingRefs,
          };
        }, { dangling: 0, leading: 0 });

        if (dangling.dangling > 0 || dangling.leading > 0) {
          return dangling;
        }
      }

      return { dangling: 0, leading: 0 };
    }, SNIPPET_HTML);

    assertEqual(stats.leading, 0, 'Footnote references must not begin a paragraph after pagination');
    assertEqual(
      stats.dangling,
      0,
      'Footnote references must remain inline within paragraph content across pagination',
    );
  } finally {
    await browser.close();
  }
};
