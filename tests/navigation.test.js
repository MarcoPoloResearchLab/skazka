// @ts-check

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { assertEqual } = require('./assert');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const APP_JS_PATH = path.join(__dirname, '..', 'js', 'app.js');

function buildMarkup() {
  const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');
  return indexHtml
    .replace(/<script[^>]+https:\/\/cdn\.jsdelivr[^>]*><\/script>\s*/g, '')
    .replace(/<script[^>]+js\/app\.js"><\/script>/i, `<script>${appSource}</script>`);
}

module.exports = async function runNavigationTests() {
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    await page.setContent(buildMarkup(), { waitUntil: 'domcontentloaded' });

    const metrics = await page.evaluate(() => ({
      toolbarLeft: document.querySelectorAll('.toolbar i.bi-chevron-left').length,
      toolbarRight: document.querySelectorAll('.toolbar i.bi-chevron-right').length,
      overlayButtons: document.querySelectorAll('.area .page-nav-btn').length,
    }));

    assertEqual(
      metrics.toolbarLeft,
      0,
      'Toolbar must not include a secondary previous-page button',
    );

    assertEqual(
      metrics.toolbarRight,
      0,
      'Toolbar must not include a secondary next-page button',
    );

    assertEqual(
      metrics.overlayButtons,
      2,
      'Exactly two overlay navigation buttons should remain in the reading area',
    );
  } finally {
    await browser.close();
  }
};
