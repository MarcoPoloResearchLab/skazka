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

    const assetPath = path.join(__dirname, '..', 'assets', 'texts', 'alenkij.txt');
    const assetBytes = Array.from(fs.readFileSync(assetPath));
    const result = await page.evaluate(
      (snippet, assetBuffer) => {
        const reader = bookReader();
        reader.pagesEl = document.getElementById('readerPages');
        reader.applyTypography();

        const makeFiller = (count) =>
          `<p>${Array.from({ length: count }, (_, index) => `pref${index + 1}`).join(' ')}</p>`;

        for (let fillerWords = 200; fillerWords <= 2600; fillerWords += 200) {
          const flowHtml = `${makeFiller(fillerWords)}${snippet}`;
          reader.renderPages(flowHtml);

          const pages = Array.from(reader.pagesEl.children);
          const totals = pages.reduce((sum, pageEl) => {
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

          if (totals.dangling > 0 || totals.leading > 0) {
            return { stats: totals, merged: '', offenders: [] };
          }
        }

        const mergedFlow = reader.convertLinesToHtml([
          'В некиим [1]',
          '',
          'царстве, в некиим государстве жил-был богатый купец, именитый человек. Много у него было всякого богатства, дорогих товаров заморских, жемчугу, драгоценных камениев, золотой и серебряной казны[2]',
          '',
          'и было у того купца три дочери, все три красавицы писаные, а меньшая лучше всех; и любил он дочерей своих',
        ], {});

        const arrayBuffer = new Uint8Array(assetBuffer).buffer;
        reader.renderPages('<p>placeholder</p>');
        reader.decodeAndConsume(arrayBuffer);
        const offenders = Array.from(reader.pagesEl.querySelectorAll('p')).filter((paragraph) => {
          const prev = paragraph.previousElementSibling;
          if (!prev || prev.tagName !== 'P') return false;
          const prevHtml = prev.innerHTML.trim();
          const currentText = (paragraph.textContent || '').trim();
          if (!prevHtml || !currentText) return false;
          if (!/(<\/sup>|\[[0-9]+])\s*$/.test(prevHtml)) return false;
          const stripped = currentText.replace(/^["'«»„“”‚‛(\[]+/, '');
          if (!stripped) return false;
          const firstChar = stripped.charAt(0);
          if (!firstChar) return false;
          if (!/\p{L}/u.test(firstChar)) return false;
          return firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase();
        });

        return { stats: { dangling: 0, leading: 0 }, merged: mergedFlow, offenders: offenders.map((p) => p.textContent.slice(0, 80)) };
      },
      SNIPPET_HTML,
      assetBytes,
    );

    assertEqual(result.stats.leading, 0, 'Footnote references must not begin a paragraph after pagination');
    assertEqual(
      result.stats.dangling,
      0,
      'Footnote references must remain inline within paragraph content across pagination',
    );

    assertEqual(
      result.merged.includes('</sup> и '),
      true,
      'Footnote paragraphs produced from raw text must keep the sentence inline after footnote markers',
    );
    assertEqual(
      result.offenders.length,
      0,
      `Footnote pagination must not leave standalone paragraphs after markers (found ${result.offenders.join(' | ')})`,
    );
  } finally {
    await browser.close();
  }
};
