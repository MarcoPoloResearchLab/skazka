// @ts-check

/**
 * @typedef {import('../types.d.js').ProviderHint} ProviderHint
 */

const CANDIDATE_ENCODINGS = Object.freeze(['utf-8', 'windows-1251', 'koi8-r', 'iso-8859-5']);
const RU_WORDS = Object.freeze([
  'и', 'в', 'не', 'на', 'что', 'я', 'он', 'с', 'как', 'а', 'к', 'по', 'она', 'из', 'у', 'за', 'то', 'это',
  'для', 'его', 'ее', 'мы', 'вы', 'они', 'бы', 'же', 'от', 'так', 'но', 'же', 'что', 'такой', 'были'
]);
const RU_BIGRAMS = Object.freeze([
  'ст', 'но', 'то', 'ро', 'ен', 'на', 'ов', 'ко', 'ра', 'ли', 'не', 'пр', 'по', 'ре', 'че', 'во', 'та', 'ни'
]);

/**
 * Decode the provided buffer honouring the encoding preference.
 * Falls back to heuristic detection when `encoding` equals `"auto"`.
 * @param {ArrayBuffer} buffer
 * @param {{ encoding: string, providerHint: ProviderHint }} options
 */
export function decodeBuffer(buffer, { encoding, providerHint }) {
  if (encoding === 'auto') {
    return decodeBest(buffer, providerHint);
  }
  return {
    text: safeDecode(buffer, encoding),
    encoding
  };
}

/**
 * Attempt to decode with the requested encoding, falling back to UTF-8.
 * @param {ArrayBuffer} buffer
 * @param {string} encoding
 * @returns {string}
 */
export function safeDecode(buffer, encoding) {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch (_error) {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

/**
 * Pick the most suitable encoding for the buffer.
 * @param {ArrayBuffer} buffer
 * @param {ProviderHint} providerHint
 * @returns {{ text: string, encoding: string }}
 */
export function decodeBest(buffer, providerHint) {
  /** @type {{ text: string, encoding: string, score: number }} */
  let best = { text: '', encoding: 'utf-8', score: Number.POSITIVE_INFINITY };
  const expectRussian = providerHint === 'libru' || providerHint === 'auto';

  for (const candidate of CANDIDATE_ENCODINGS) {
    let decoded;
    try {
      decoded = new TextDecoder(candidate).decode(buffer);
    } catch (_error) {
      continue;
    }

    const score = scoreDecodedText(decoded, candidate, { expectRussian });
    if (score < best.score) {
      best = { text: decoded, encoding: candidate, score };
    }
  }

  return { text: best.text, encoding: best.encoding };
}

/**
 * Score the decoded text so lower numbers are better.
 * @param {string} text
 * @param {string} encoding
 * @param {{ expectRussian: boolean }} options
 */
function scoreDecodedText(text, encoding, { expectRussian }) {
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  const controlCount = (text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  const cyr = countCyrillic(text);

  let wordHits = 0;
  let bigramHits = 0;
  if (expectRussian || cyr > 50) {
    const lower = text.toLowerCase();
    wordHits = RU_WORDS.reduce((sum, word) => sum + countOccurrences(lower, new RegExp(`\\b${word}\\b`, 'g')), 0);
    bigramHits = RU_BIGRAMS.reduce((sum, bigram) => sum + countOccurrences(lower, new RegExp(bigram, 'g')), 0);
  }

  const latinLetters = (text.match(/[A-Z]/g) || []).length;
  const latinSoupPenalty = cyr < 20 && latinLetters > 500 ? 200 : 0;

  let score = replacementCount * 120 + controlCount * 2 - (cyr * 0.08) - (wordHits * 6) - (bigramHits * 0.8) + latinSoupPenalty;
  if (expectRussian && cyr > 50 && (encoding === 'windows-1251' || encoding === 'koi8-r')) {
    score -= 80;
  }
  return score;
}

/**
 * Count the occurrences of the given regex inside the text.
 * @param {string} text
 * @param {RegExp} regex
 * @returns {number}
 */
function countOccurrences(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Count Cyrillic characters inside the text.
 * @param {string} text
 */
export function countCyrillic(text) {
  const matches = text.match(/[\u0400-\u04FF]/g);
  return matches ? matches.length : 0;
}

/**
 * Heuristic detection of HTML-like content.
 * @param {string} source
 */
export function looksLikeHtml(source) {
  return /^\s*<\s*(!doctype\s+html|html)(\s|>)/i.test(source)
    || /<pre[\s>]/i.test(source)
    || /<body[\s>]/i.test(source)
    || /<\/(p|h1|h2|h3|div)>/i.test(source);
}

/**
 * Strip markup and return plain text content.
 * @param {string} html
 */
export function htmlToPlainText(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, form, select, option, noscript').forEach((node) => node.remove());
    const preBlocks = Array.from(doc.querySelectorAll('pre'));
    if (preBlocks.length > 0) {
      return preBlocks.map((pre) => pre.innerText.replace(/\r\n/g, '\n')).join('\n\n').trim();
    }
    doc.querySelectorAll('br').forEach((node) => node.replaceWith(doc.createTextNode('\n')));
    const body = doc.body ? doc.body.innerText : html;
    return body.replace(/\r\n/g, '\n').trim();
  } catch (_error) {
    return html;
  }
}

/**
 * Detect the catalog/provider based on known markers.
 * @param {string} text
 * @returns {'gutenberg'|'libru'|'plain'}
 */
export function detectProvider(text) {
  const head = text.slice(0, 4000);
  if (/PROJECT GUTENBERG/i.test(head) || /\*\*\*\s*START OF (THIS|THE) PROJECT GUTENBERG/i.test(head)) {
    return 'gutenberg';
  }
  if (/Lib\.ru|Библиотека Максима Мошкова|moshkov|ilibrary\.ru/i.test(head)) {
    return 'libru';
  }
  return 'plain';
}
