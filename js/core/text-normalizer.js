// @ts-check

/**
 * Normalize raw text and build HTML flow + metadata for rendering.
 * @param {string} text
 * @param {{ provider: 'gutenberg'|'libru'|'plain'|'auto' }} options
 */
export function prepareContent(text, { provider }) {
  const normalized = normalizeText(text);
  const effectiveProvider = provider;
  const stripped = stripByProvider(normalized, effectiveProvider);
  const metadata = extractMeta(stripped, effectiveProvider);
  const segmented = segmentSections(stripped, effectiveProvider);
  const flowHtml = buildFlowHtml({
    bookTitle: metadata.title || '',
    bookAuthor: metadata.author || '',
    sections: segmented.sections,
    footMap: segmented.footMap
  });

  return {
    normalized,
    stripped,
    metadata,
    segmented,
    flowHtml
  };
}

/**
 * Clean markup artifacts, repeated whitespace, catalog noise.
 * @param {string} raw
 */
export function normalizeText(raw) {
  let cleaned = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  cleaned = cleaned.replace(/<https?:\/\/[^>\s]+>/gi, '');
  cleaned = cleaned.replace(/<#[^>]*>/gi, '');
  cleaned = cleaned.replace(/<[^>\n]+>/g, ' ');
  const dropTokens = /\b(Fb2\.zip|Epub|Содержание|Fine HTML|Printed version|Lib\.ru html|txt\(Word,[^)]+\))/gi;
  const lines = cleaned.split('\n').map((line) => line.replace(dropTokens, '').replace(/\s+$/, ''));
  const filtered = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      filtered.push('');
      continue;
    }
    if (/^(https?:\/\/|ftp:\/\/|mailto:)/i.test(trimmed)) continue;
    if (/^(option value|Авторы|Автор:)\s*$/i.test(trimmed)) continue;
    if (/^(lib\.ru html|fine html|printed version|fb2\.zip|epub|txt\(word)/i.test(trimmed)) continue;
    if (/^\*{3,}$/i.test(trimmed)) continue;
    if (/^\s*\[[^\]]+\]\s*$/i.test(trimmed) && trimmed.toLowerCase().includes('lib\.ru')) continue;
    filtered.push(line);
  }
  let joined = filtered.join('\n');
  joined = joined.replace(/\n{3,}/g, '\n\n');
  return joined.trim();
}

/**
 * Strip catalog-specific wrappers.
 * @param {string} text
 * @param {'gutenberg'|'libru'|'plain'} provider
 */
export function stripByProvider(text, provider) {
  if (provider === 'gutenberg') {
    return stripGutenberg(text);
  }
  if (provider === 'libru') {
    return stripLibRu(text);
  }
  return text;
}

/**
 * Strip Project Gutenberg boilerplate.
 * @param {string} text
 */
export function stripGutenberg(text) {
  const start = text.match(/^\s*\*{3}\s*START OF (THIS|THE) PROJECT GUTENBERG EBOOK.*$/mi);
  const end = text.match(/^\s*\*{3}\s*END OF (THIS|THE) PROJECT GUTENBERG EBOOK.*$/mi);
  const startIndex = start ? text.indexOf(start[0]) + start[0].length : 0;
  const endIndex = end ? text.indexOf(end[0]) : text.length;
  let body = text.slice(startIndex, endIndex).trim();
  if (body.replace(/\s/g, '').length < 200) {
    body = text;
  }
  return body;
}

/**
 * Strip Lib.ru headers/footers.
 * @param {string} text
 */
export function stripLibRu(text) {
  let lines = text.split('\n');
  let index = 0;
  for (; index < Math.min(lines.length, 200); index += 1) {
    const trimmed = lines[index].trim();
    if (/^(Lib\.ru|Библиотека|ilibrary|http(s?):\/\/|ftp:\/\/|e-?mail:|mailto:)/i.test(trimmed)) continue;
    if (/^={3,}|^-{3,}|\*{3,}$/.test(trimmed)) continue;
    if (/^\s*$/.test(trimmed)) {
      const nextNonEmpty = lines.slice(index + 1, index + 12).find((s) => s.trim().length > 0) || '';
      if (!/^(Lib\.ru|http|ftp|e-?mail)/i.test(nextNonEmpty)) {
        index += 1;
        break;
      }
      continue;
    }
    if (trimmed.length > 0 && !/Lib\.ru|http|ftp|e-?mail/i.test(trimmed)) {
      break;
    }
  }
  lines = lines.slice(index);
  while (lines.length && /^\s*$/.test(lines[lines.length - 1])) {
    lines.pop();
  }
  const footerIndex = findLibRuFooterIndex(lines);
  if (footerIndex >= 0) {
    lines = lines.slice(0, footerIndex);
  }
  let cleaned = lines.join('\n')
    .replace(/(^|\s)--(\s|$)/g, '$1—$2')
    .replace(/\s+—\s+/g, ' — ')
    .replace(/[ \t]+\n/g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

/**
 * Locate the footer block inside Lib.ru exports.
 * @param {string[]} lines
 * @returns {number}
 */
export function findLibRuFooterIndex(lines) {
  const footerMatchers = [
    /^\s*О произведении\b/i,
    /^\s*О библиотеке\b/i,
    /^\s*Реклама на сайте\b/i,
    /^\s*Email:/i,
    /^\s*©\s*\d{4}/,
    /liveinternet\.ru/i,
    /metrika\.yandex\.ru/i,
    /^\s*Каталог/i,
    /^\s*Lib\.ru/i,
    /^\s*ilibrary/i
  ];
  for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
    const trimmed = lines[idx].trim();
    if (!trimmed) {
      continue;
    }
    if (footerMatchers.some((regex) => regex.test(trimmed))) {
      return idx;
    }
  }
  return -1;
}

/**
 * Extract metadata from the text using provider specific heuristics.
 * @param {string} text
 * @param {'gutenberg'|'libru'|'plain'} provider
 */
export function extractMeta(text, provider) {
  /** @type {{ title: string, author: string }} */
  const metadata = { title: '', author: '' };

  if (provider === 'gutenberg') {
    const titleMatch = text.match(/^\s*Title:\s*(.+)$/mi);
    const authorMatch = text.match(/^\s*Author:\s*(.+)$/mi);
    if (titleMatch) metadata.title = titleMatch[1].trim();
    if (authorMatch) metadata.author = authorMatch[1].trim();
  }

  if (!metadata.title || !metadata.author) {
    const head = text.split('\n').slice(0, 160).map((line) => line.trim());
    const cleanedHead = head.filter((line) => line.length > 0 && !/^https?:\/\//i.test(line));

    if (!metadata.title) {
      const quotedCandidates = [];
      cleanedHead.forEach((line) => {
        for (const match of line.matchAll(/[«"](.*?)[»"]/g)) {
          const candidate = (match[1] || '').trim();
          if (candidate.length >= 3 && candidate.length <= 80) {
            quotedCandidates.push(candidate);
          }
        }
      });
      if (quotedCandidates.length) {
        quotedCandidates.sort((a, b) => b.length - a.length);
        metadata.title = quotedCandidates[0];
      }
    }

    if (!metadata.title) {
      const nonEmpty = cleanedHead.filter((line) => line.length > 0);
      if (nonEmpty.length) {
        metadata.title = nonEmpty[0].replace(/^["«](.*)["»]$/, '$1').trim();
      }
    }

    if (!metadata.author) {
      const candidates = cleanedHead.filter((line) => /^[A-ZА-ЯЁ][^:]{2,60}$/.test(line));
      if (candidates.length) {
        metadata.author = candidates[0];
      }
    }

    const joinedHead = head.join('\n');
    const byEnglish = joinedHead.match(/\bby\s+([A-Z][\w .,'-]+)\b/mi);
    if (!metadata.author && byEnglish) {
      metadata.author = byEnglish[1].trim();
    }

    const byRussian = joinedHead.match(/\b(Автор|Сост\.?|Перевод):\s*([A-ЯЁA-Z][\w .,'-]+)\b/mi);
    if (!metadata.author && byRussian) {
      metadata.author = byRussian[2].trim();
    }

    if (!metadata.author) {
      for (const line of cleanedHead) {
        const fullNameMatch = line.match(/([\p{Lu}][\p{L}\p{M}\.-]+ [\p{Lu}][\p{L}\p{M}\.-]+(?: [\p{Lu}][\p{L}\p{M}\.-]+)?)/u);
        if (fullNameMatch) {
          const candidate = fullNameMatch[1].trim();
          if (candidate.split(' ').length >= 2 && !/\d/.test(candidate)) {
            metadata.author = candidate.replace(/\s*\(.*/, '').trim().replace(/\.$/, '');
            break;
          }
        }
      }
    }

    if ((!metadata.title || metadata.title.includes('...')) && metadata.author) {
      const authorLine = cleanedHead.find((line) => line.includes(metadata.author));
      if (authorLine) {
        const idx = authorLine.indexOf(metadata.author) + metadata.author.length;
        const candidate = authorLine
          .slice(idx)
          .replace(/[.\-:]+/, ' ')
          .replace(/Содержание/gi, '')
          .trim()
          .replace(/\s+/g, ' ');
        if (candidate.length >= 3) {
          metadata.title = candidate;
        }
      }
    }

    if (!metadata.author) {
      for (const line of cleanedHead) {
        const nameWithInitials = line.match(/((?:[\p{Lu}]\.\s*){1,2}[\p{Lu}][\p{L}\p{M}-]{2,})/u);
        if (nameWithInitials) {
          const candidate = nameWithInitials[1].trim();
          if (!/\d/.test(candidate)) {
            metadata.author = candidate.replace(/\.$/, '');
            break;
          }
        }
      }
    }

    if (!metadata.author) {
      for (const line of cleanedHead) {
        const byVerb = line.match(/(?:писал|записал|сочинил|создал)\s+([A-ZА-ЯЁ][\w .-]+)/i);
        if (byVerb) {
          metadata.author = byVerb[1].replace(/\s*\(.*/, '').trim();
          break;
        }
      }
    }

    const normalizedTitle = (metadata.title || '').replace(/\W+/g, '').toLowerCase();
    const normalizedAuthor = (metadata.author || '').replace(/\W+/g, '').toLowerCase();
    if (!metadata.title || normalizedTitle === normalizedAuthor) {
      const headingCandidate = cleanedHead.find((line) => {
        if (metadata.author && line.includes(metadata.author)) return false;
        if (line.length === 0 || line.length > 90) return false;
        if (/\d{4}/.test(line)) return false;
        return /^[\p{Lu}]/u.test(line);
      });
      if (headingCandidate) {
        metadata.title = headingCandidate.replace(/\s+/g, ' ').trim();
      }
    }
  }

  return metadata;
}

/**
 * Break the text into logical sections and build HTML fragments.
 * @param {string} text
 * @param {'gutenberg'|'libru'|'plain'} provider
 */
export function segmentSections(text, provider) {
  const lines = text.split('\n');
  let notesStart = -1;
  for (let k = lines.length - 1; k >= 0; k -= 1) {
    const trimmed = lines[k].trim();
    if (/^(footnotes?|notes|примечания|сноски)\s*$/i.test(trimmed)) {
      notesStart = k;
      break;
    }
  }

  const bodyLines = notesStart > 0 ? lines.slice(0, notesStart) : lines.slice();
  const footLines = notesStart > 0 ? lines.slice(notesStart) : [];

  const sections = [];
  /** @type {{ title: string, headingLevel: string, content: string[], html?: string }} */
  let section = { title: '', headingLevel: '', content: [] };

  const BOOK_REGEX = /^\s*(BOOK|КНИГА)\s+([IVXLCDM]+|\d+)(?:[.:)\-–— ](.*))?$/i;
  const PART_REGEX = /^\s*(PART|ЧАСТЬ)\s+([IVXLCDM]+|\d+)(?:[.:)\-–— ](.*))?$/i;
  const CHAPTER_REGEX = /^\s*(CHAPTER|ГЛАВА)\s+([IVXLCDM]+|\d+)(?:[.:)\-–— ](.*))?$/i;
  const ALL_CAPS_REGEX = /^[A-ZА-ЯЁ0-9 ,.'"«»\-:;!?]{6,}$/;

  for (const raw of bodyLines) {
    const trimmed = raw.trim();

    if (/^(?:\*\s*\*\s*\*|\*\*\*|—\s*—\s*—|—{3,}|-{3,})$/.test(trimmed)) {
      section.content.push('<hr/>');
      continue;
    }

    const bookMatch = trimmed.match(BOOK_REGEX);
    const partMatch = trimmed.match(PART_REGEX);
    const chapterMatch = trimmed.match(CHAPTER_REGEX);

    if (bookMatch || partMatch || chapterMatch || (provider === 'libru' && ALL_CAPS_REGEX.test(trimmed) && trimmed.length < 80)) {
      if (section.title || section.content.length) {
        sections.push(section);
      }
      let label = '';
      let rest = '';
      if (bookMatch) {
        label = (bookMatch[1].toUpperCase() === 'BOOK' ? 'BOOK' : 'КНИГА') + ' ' + bookMatch[2];
        rest = bookMatch[3] || '';
        section = { title: formatHeading(label, rest), headingLevel: 'H1', content: [] };
        continue;
      }
      if (partMatch) {
        label = (partMatch[1].toUpperCase() === 'PART' ? 'PART' : 'ЧАСТЬ') + ' ' + partMatch[2];
        rest = partMatch[3] || '';
        section = { title: formatHeading(label, rest), headingLevel: 'H1', content: [] };
        continue;
      }
      if (chapterMatch) {
        label = (chapterMatch[1].toUpperCase() === 'CHAPTER' ? 'CHAPTER' : 'ГЛАВА') + ' ' + chapterMatch[2];
        rest = chapterMatch[3] || '';
        section = { title: formatHeading(label, rest), headingLevel: 'H2', content: [] };
        continue;
      }
      section = { title: trimmed, headingLevel: 'H2', content: [] };
      continue;
    }

    section.content.push(raw);
  }

  if (section.title || section.content.length) {
    sections.push(section);
  }

  const footnoteMap = parseFootnoteBodies(footLines.join('\n'));
  sections.forEach((sec) => {
    sec.html = convertLinesToHtml(sec.content, footnoteMap);
  });

  return { sections, footMap: footnoteMap };
}

/**
 * Convert section lines to HTML paragraphs.
 * @param {string[]} lines
 * @param {Record<string, string>} footMap
 */
export function convertLinesToHtml(lines, footMap) {
  let joined = lines.join('\n');
  joined = injectFootnoteReferences(joined);

  const blocks = joined.split(/\n{2,}/);
  const normalizedBlocks = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('<hr/>') || trimmed.startsWith('<hr />')) {
      normalizedBlocks.push('<hr/>');
      const remainder = trimmed.replace(/^<hr\/?>([\s\S]*)$/i, '$1').trim();
      if (remainder) {
        const safeRemainder = escapeHtmlExceptInjected(remainder).replace(/\n+/g, ' ');
        normalizedBlocks.push(safeRemainder);
      }
      continue;
    }
    let safe = escapeHtmlExceptInjected(trimmed);
    safe = safe.replace(/\n+/g, ' ');
    if (normalizedBlocks.length && shouldMergeParagraphBlocks(normalizedBlocks[normalizedBlocks.length - 1], safe)) {
      normalizedBlocks[normalizedBlocks.length - 1] = `${normalizedBlocks[normalizedBlocks.length - 1]} ${safe}`;
    } else {
      normalizedBlocks.push(safe);
    }
  }

  const htmlParts = normalizedBlocks.map((content) => {
    if (content === '<hr/>') {
      return content;
    }
    return `<p>${content}</p>`;
  });

  return htmlParts.join('\n');
}

/**
 * Parse footnote content following the body.
 * @param {string} block
 */
export function parseFootnoteBodies(block) {
  const map = {};
  if (!block || block.trim().length === 0) {
    return map;
  }

  const lines = block.replace(/\r\n/g, '\n').split('\n');
  let currentId = null;
  let accumulator = [];

  const commit = () => {
    if (currentId) {
      let html = accumulator.join('\n').trim();
      html = escapeHtml(html).replace(/\n\n+/g, '</p><p>').replace(/\n/g, ' ');
      map[currentId] = `<p>${html}</p>`;
    }
    currentId = null;
    accumulator = [];
  };

  for (const line of lines) {
    const match = line.match(/^\s*(?:\[(\d+)]|(\d+)[\.\)]?|\((\d+)\))\s*(.*)$/);
    if (match) {
      if (currentId) {
        commit();
      }
      const num = match[1] || match[2] || match[3];
      currentId = num ? `fn${num}` : null;
      const rest = match[4] || '';
      if (rest.trim().length) {
        accumulator.push(rest);
      }
      continue;
    }
    if (currentId === null) {
      continue;
    }
    if (line.trim().length === 0) {
      commit();
      continue;
    }
    accumulator.push(line);
  }

  commit();
  return map;
}

/**
 * Generate the final HTML flow string consumed by pagination.
 * @param {{ bookTitle: string, bookAuthor: string, sections: Array<{ title: string, headingLevel: string, html?: string }>, footMap: Record<string, string> }} params
 */
export function buildFlowHtml({ bookTitle, bookAuthor, sections, footMap }) {
  const chunks = [];
  if (bookTitle) {
    chunks.push(`<h1 id="heading-title">${escapeHtml(bookTitle)}</h1>`);
  }
  if (bookAuthor) {
    chunks.push(`<p class="text-muted"><em>${escapeHtml(bookAuthor)}</em></p>`);
  }
  let headingCounter = 0;
  for (const section of sections) {
    let tag = 'h2';
    if (section.headingLevel === 'H1') {
      tag = 'h1';
    }
    if (section.title) {
      headingCounter += 1;
      chunks.push(`<${tag} id="heading-${headingCounter}">${escapeHtml(section.title)}</${tag}>`);
    }
    if (section.html) {
      chunks.push(section.html);
    }
  }

  const ids = Object.keys(footMap || {});
  if (ids.length) {
    ids.forEach((id) => {
      chunks.push(`<aside data-footnote="${id}">${footMap[id]}</aside>`);
    });
  }
  return chunks.join('\n');
}

/**
 * Inject inline footnote references markup.
 * @param {string} text
 */
export function injectFootnoteReferences(text) {
  const shouldConvert = (input, offset) => {
    for (let index = offset - 1; index >= 0; index -= 1) {
      const char = input[index];
      if (char === '\n' || char === '\r') {
        return false;
      }
      if (!/\s/.test(char)) {
        return !/\d/.test(char);
      }
    }
    return false;
  };

  const convertStandaloneNumber = (full, num, offset, str) => {
    if (!shouldConvert(str, offset)) {
      return full;
    }
    return `@@FN:${num}::@@`;
  };

  let output = String(text || '');
  output = output.replace(/\[(\d{1,3})\](\s*)([.,;:!?]+)?(\s*)/g, (full, num, _wsBefore, punct = '', wsAfter) => {
    return `@@FN:${num}::${punct || ''}@@${wsAfter}`;
  });
  output = output.replace(/\((\d{1,3})\)/g, convertStandaloneNumber);
  output = output.replace(/\b(\d{1,3})\)(?!\w)/g, convertStandaloneNumber);
  output = output.replace(/\b(\d{1,3})\.(?!\d)/g, convertStandaloneNumber);
  return output;
}

/**
 * HTML escape helper.
 * @param {string} value
 */
export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[char] || char));
}

/**
 * Escape HTML but preserve injected footnote placeholders.
 * @param {string} value
 */
export function escapeHtmlExceptInjected(value) {
  const escaped = escapeHtml(value);
  let html = escaped.replace(/@@FN:(\d+)::(.*?)@@(\s*)/g, (_full, num, punct, ws) => {
    let trailing = punct || '';
    let remainder = ws || '';
    if (!trailing && remainder) {
      const match = remainder.match(/^\s*([.,;:!?]+)/);
      if (match) {
        trailing = match[1];
        remainder = remainder.slice(match[0].length);
      }
    }
    if (remainder.startsWith(' ')) {
      remainder = remainder.slice(1);
    }
    const markup = renderFootnoteInlineMarkup(num, trailing);
    return `${markup}${remainder}`;
  });
  html = html.replace(/(<span class="footnote-inline"[^>]*>[\s\S]*?<sup[^>]*>\[\d+]<\/sup>)([^<]*?)&nbsp;<\/span>(\s*)([.,;:!?]+)/g, (full, prefix, trailingText = '', ws, punct) => {
    const trimmedTrailing = trailingText.trimEnd();
    const preservedSpacing = trailingText.slice(0, trailingText.length - trimmedTrailing.length);
    const existingPunct = trimmedTrailing && /[.,;:!?]+$/.test(trimmedTrailing) ? '' : punct;
    const finalTrailing = `${trimmedTrailing}${existingPunct}`;
    const remainderWhitespace = ws;
    return `${prefix}${preservedSpacing}${finalTrailing}&nbsp;</span>${remainderWhitespace}`;
  });
  return html;
}

/**
 * Render inline markup for a footnote reference.
 * @param {string|number} number
 * @param {string} trailing
 */
export function renderFootnoteInlineMarkup(number, trailing) {
  const trailingText = typeof trailing === 'string' ? trailing : '';
  const footnoteId = `fn${number}`;
  const escapedTrailing = escapeHtml(trailingText);
  const trailingAttr = escapedTrailing.replace(/"/g, '&quot;');
  return `<span class="footnote-inline" x-data="footnoteInline('${footnoteId}', '${trailingAttr}')" data-footnote-id="${footnoteId}"><sup class="footnote-ref" data-footnote-id="${footnoteId}">[${number}]</sup>${escapedTrailing}&nbsp;</span>`;
}

/**
 * Decide whether two paragraph blocks should merge.
 * @param {string} previous
 * @param {string} next
 */
export function shouldMergeParagraphBlocks(previous, next) {
  if (!previous || !next) {
    return false;
  }
  if (previous === '<hr/>' || next === '<hr/>') {
    return false;
  }
  const prevTrim = previous.trim();
  const nextTrim = next.trim();
  if (!prevTrim || !nextTrim) {
    return false;
  }
  if (!/(<\/sup>|\[[0-9]+\])\s*$/.test(prevTrim)) {
    return false;
  }
  const strippedNext = nextTrim.replace(/^["'«»„“”‚‛(\[]+/, '');
  if (!strippedNext) {
    return false;
  }
  const firstChar = strippedNext.charAt(0);
  if (!firstChar) {
    return false;
  }
  const isLetter = /\p{L}/u.test(firstChar);
  if (!isLetter) {
    return false;
  }
  const isLower = firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase();
  return isLower;
}

function formatHeading(label, rest) {
  return `${label}${rest ? `: ${rest}` : ''}`;
}
