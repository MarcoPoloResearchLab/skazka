// @ts-check

const fs = require('fs');
const path = require('path');
const { assertEqual } = require('./assert');

const INDEX_HTML_PATH = path.join(__dirname, '..', 'index.html');
const APP_JS_PATH = path.join(__dirname, '..', 'js', 'app.js');

module.exports = async function runFitHeightTests() {
  const markup = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  assertEqual(
    markup.includes('fitHeightSwitch'),
    false,
    'Fit height toggle must not be present in the reader toolbar markup',
  );

  const labelOccurrences = (markup.match(/Fit Height/gi) || []).length;
  assertEqual(
    labelOccurrences,
    0,
    'Fit height label should be removed when the behavior is always enabled',
  );

  const appSource = fs.readFileSync(APP_JS_PATH, 'utf8');
  assertEqual(
    appSource.includes('fitViewportHeight'),
    false,
    'Fit height must be treated as default behavior without toggleable state in app.js',
  );
};
