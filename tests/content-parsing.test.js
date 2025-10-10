// @ts-check

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');
const { loadReaderHarness } = require('./helpers/harness');
const ASSET_ALENKIJ = path.join(__dirname, '..', 'assets', 'texts', 'alenkij.txt');
const ASSET_GORODOK = path.join(
  __dirname,
  '..',
  'assets',
  'texts',
  'В. Ф. Одоевский. Городок в табакерке. Текст произведения.txt',
);

function readFileAsBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

module.exports = async function runContentParsingTests() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await loadReaderHarness(page);

    const results = await page.evaluate(
      async ({ alenkijBase64, gorodokBase64 }) => {
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

        const collectSnapshot = () => {
          const supNodes = Array.from(
            reader.pagesEl.querySelectorAll('.footnote-ref[data-footnote-id]'),
          );
          const ids = supNodes.map((node) => node.getAttribute('data-footnote-id'));
          const snippet = reader.pagesEl.textContent
            ? reader.pagesEl.textContent.trim().slice(0, 160)
            : '';
          const uniqueIds = Array.from(new Set(ids));
          return {
            title: reader.bookTitle,
            author: reader.bookAuthor,
            footnoteIds: uniqueIds,
            snippet,
          };
        };

        const snapshots = [];

        const firstBuffer = decodeFromBase64(alenkijBase64);
        reader.lastRaw = { buffer: firstBuffer, url: null, name: 'alenkij.txt', provider: 'auto' };
        reader.decodeAndConsume(firstBuffer);
        await new Promise((resolve) => setTimeout(resolve, 0));
        snapshots.push(collectSnapshot());

        const secondBuffer = decodeFromBase64(gorodokBase64);
        reader.lastRaw = {
          buffer: secondBuffer,
          url: null,
          name: 'gorodok.txt',
          provider: 'auto',
        };
        reader.decodeAndConsume(secondBuffer);
        await new Promise((resolve) => setTimeout(resolve, 0));
        snapshots.push(collectSnapshot());

        return snapshots;
      },
      {
        alenkijBase64: readFileAsBase64(ASSET_ALENKIJ),
        gorodokBase64: readFileAsBase64(ASSET_GORODOK),
      },
    );

    const [alenkijSnapshot, gorodokSnapshot] = results;

    assertEqual(
      /Сказка/i.test(alenkijSnapshot.title) || alenkijSnapshot.title.includes('Аленький'),
      true,
      'Аленький цветочек: title should reference the tale heading',
    );
    assertEqual(
      alenkijSnapshot.author.includes('Аксаков'),
      true,
      'Аленький цветочек: author should reference Аксаков',
    );
    assertEqual(
      alenkijSnapshot.footnoteIds.includes('fn1'),
      true,
      'Аленький цветочек: expected to detect footnote reference fn1',
    );
    assertEqual(
      alenkijSnapshot.footnoteIds.includes('fn20'),
      true,
      'Аленький цветочек: expected to detect the final footnote reference fn20',
    );

    assertEqual(
      gorodokSnapshot.title.includes('Городок'),
      true,
      'Городок в табакерке: title should include the work name',
    );
    assertEqual(
      gorodokSnapshot.author.includes('Одоев'),
      true,
      'Городок в табакерке: author should reference Одоевского',
    );
    assertEqual(
      gorodokSnapshot.snippet.includes('http'),
      false,
      'Городок в табакерке: leading snippet should be cleaned of catalog URLs',
    );
  } finally {
    await browser.close();
  }
};
