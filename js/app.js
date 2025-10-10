const PAGE_PADDING_PX = 48;

function bookReader(){
    return {
      /* ---------- UI state ---------- */
      ui: {
        fontSizePx: 18,
        theme: 'light',
        currentPageIndex: 0,
        totalPageCount: 1
      },
      themeClass: 'theme-light',
  
      /* ---------- Provider & encoding ---------- */
      provider: 'auto',       // 'auto' | 'libru' | 'gutenberg' | 'plain'
      encoding: 'auto',       // 'auto' | 'utf-8' | 'windows-1251' | 'koi8-r' | 'iso-8859-5'
  
      /* ---------- Loader state ---------- */
      loadUrl: '',
      lastScrollKey: null,
      lastRaw: { buffer: null, url: null, name: null, provider: null },
      usedEncoding: null,
      skipRestoreOnce: false, // show page 1 on fresh loads
      lastFlowHtml: '',
      footnoteScrollHandlerAttached: false,
  
      /* ---------- Book state ---------- */
      bookTitle: '',
      bookAuthor: '',
      toc: [],
  
      /* ---------- Internals ---------- */
      pagesEl: null,
      pageWidthPx: 0,
      pageHeightPx: 0,
  
      init(){
        this.pagesEl = this.$refs.readerPages || document.getElementById('readerPages');
        this.applyTheme();
        this.applyTypography();
        this.attachScrollHandlers();
        window.addEventListener('resize', () => { this.applyTypography(); this.repaginateIfNeeded(); });
        window.addEventListener('keydown', (e)=>{
          if(e.key==='ArrowRight' || e.key==='PageDown' || e.key===' '){ e.preventDefault(); this.nextPage(); }
          if(e.key==='ArrowLeft'  || e.key==='PageUp'){ e.preventDefault(); this.prevPage(); }
        }, { passive:false });
        this.renderPages('<p class="text-muted">Choose provider/encoding, then load a .txt from URL or disk.</p>');
      },
  
      /* ---------- Loaders ---------- */
      async loadFromUrl(){
        if(!this.loadUrl) return;
        try {
          const resp = await fetch(this.loadUrl, { cache: 'no-store' });
          const buf = await resp.arrayBuffer();
          this.lastRaw = { buffer: buf, url: this.loadUrl, name: null, provider: this.provider };
          this.lastScrollKey = `scroll:${this.provider}:${this.loadUrl}`;
          this.skipRestoreOnce = true;
          this.decodeAndConsume(buf);
        } catch(err){
          alert('Fetch failed (maybe CORS). Download the file and use Choose .txt.\n' + err);
        }
      },
  
      loadFromFile(ev){
        const input = ev.target;
        if(!input.files || input.files.length === 0) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          const buf = reader.result;
          this.lastRaw = { buffer: buf, url: null, name: file.name, provider: this.provider };
          this.lastScrollKey = `scroll:${this.provider}:file:${file.name}`;
          this.skipRestoreOnce = true;
          this.decodeAndConsume(buf);
        };
        reader.readAsArrayBuffer(file);
      },
  
      onProviderOrEncodingChange(){
        if (this.lastRaw && this.lastRaw.buffer) {
          this.skipRestoreOnce = false;
          this.decodeAndConsume(this.lastRaw.buffer);
        }
      },
  
      /* ---------- Decoding & autodetect ---------- */
      decodeAndConsume(buf){
        let text, encodingUsed;
  
        if (this.encoding === 'auto') {
          const best = this.decodeBest(buf, this.provider);
          text = best.text; encodingUsed = best.encoding;
        } else {
          text = this.safeDecode(buf, this.encoding);
          encodingUsed = this.encoding;
        }
        this.usedEncoding = encodingUsed;
  
        if (this.looksLikeHtml(text)) text = this.htmlToPlainText(text);
  
        const effectiveProvider = this.provider === 'auto' ? this.detectProvider(text) : this.provider;
  
        const normalized = this.normalizeText(text);
        let stripped = normalized;
        if (effectiveProvider === 'gutenberg') stripped = this.stripGutenberg(normalized);
        else if (effectiveProvider === 'libru') stripped = this.stripLibRu(normalized);
  
        const meta = this.extractMeta(stripped, effectiveProvider);
        this.bookTitle = meta.title || 'Untitled';
        this.bookAuthor = meta.author || '';
  
        const segmented = this.segmentSections(stripped, effectiveProvider);
        const contentHtml = this.buildFlowHtml(segmented);
        this.lastFlowHtml = contentHtml;

        this.renderPages(contentHtml);
  
        queueMicrotask(() => {
          this.applyTheme();
          this.applyTypography();
          this.buildToc();
          this.wireFootnotes();
          this.recomputePages();
          if (this.skipRestoreOnce) {
            this.pagesEl.scrollLeft = 0;
            this.ui.currentPageIndex = 0;
            this.skipRestoreOnce = false;
          } else {
            this.restoreScroll();
          }
        });
      },
  
      safeDecode(buf, enc){
        try { return new TextDecoder(enc).decode(buf); }
        catch { return new TextDecoder('utf-8').decode(buf); }
      },
  
      decodeBest(buf, providerHint){
        const candidates = ['utf-8','windows-1251','koi8-r','iso-8859-5'];
        const expectRU = (providerHint === 'libru' || providerHint === 'auto');
  
        const ruWords = [
          'и','в','не','на','что','я','он','с','как','а','к','по','она','из','у','за','то','это',
          'для','его','ее','мы','вы','они','бы','же','от','так','но','же','что','такой','были'
        ];
        const ruBigrams = ['ст','но','то','ро','ен','на','ов','ко','ра','ли','не','пр','по','ре','че','во','та','ни'];
  
        let best = { text: '', encoding: 'utf-8', score: Infinity, cyr: 0, words: 0 };
  
        for (const enc of candidates){
          let txt;
          try { txt = new TextDecoder(enc).decode(buf); } catch { continue; }
  
          const bad = (txt.match(/\uFFFD/g)||[]).length;
          const ctr = (txt.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g)||[]).length;
          const cyr = this.countCyrillic(txt);
  
          let wHits = 0, biHits = 0;
          if (expectRU || cyr > 50) {
            const lower = txt.toLowerCase();
            for (const w of ruWords){ wHits += (lower.match(new RegExp(`\\b${w}\\b`, 'g'))||[]).length; }
            for (const b of ruBigrams){ biHits += (lower.match(new RegExp(b, 'g'))||[]).length; }
          }
  
          const latinLetters = (txt.match(/[A-Z]/g)||[]).length;
          const latinSoupPenalty = (cyr < 20 && latinLetters > 500) ? 200 : 0;
  
          let score = bad * 120 + ctr * 2 - (cyr * 0.08) - (wHits * 6) - (biHits * 0.8) + latinSoupPenalty;
          if (expectRU && cyr > 50 && (enc === 'windows-1251' || enc === 'koi8-r')) score -= 80;
  
          if (score < best.score) best = { text: txt, encoding: enc, score, cyr, words: wHits };
        }
        return best;
      },
  
      countCyrillic(txt){ const m = txt.match(/[\u0400-\u04FF]/g); return m ? m.length : 0; },
  
      looksLikeHtml(s){
        return /^\s*<\s*(!doctype\s+html|html)(\s|>)/i.test(s) ||
               /<pre[\s>]/i.test(s) || /<body[\s>]/i.test(s) || /<\/(p|h1|h2|h3|div)>/i.test(s);
      },
  
      htmlToPlainText(html){
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          doc.querySelectorAll('script, style, form, select, option, noscript').forEach(el => el.remove());
          const pres = Array.from(doc.querySelectorAll('pre'));
          if (pres.length) return pres.map(pre => pre.innerText.replace(/\r\n/g,'\n')).join('\n\n').trim();
          doc.querySelectorAll('br').forEach(br => br.replaceWith(doc.createTextNode('\n')));
          const body = doc.body ? doc.body.innerText : html;
          return body.replace(/\r\n/g,'\n').trim();
        } catch { return html; }
      },
  
      detectProvider(text){
        const head = text.slice(0, 4000);
        if (/PROJECT GUTENBERG/i.test(head) || /\*\*\*\s*START OF (THIS|THE) PROJECT GUTENBERG/i.test(head)) return 'gutenberg';
        if (/Lib\.ru|Библиотека Максима Мошкова|moshkov|ilibrary\.ru/i.test(head)) return 'libru';
        return 'plain';
      },
  
      /* ---------- Normalization & provider stripping ---------- */
      normalizeText(raw){
        let t = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        t = t.replace(/<https?:\/\/[^>\s]+>/gi, '');
        t = t.replace(/<#[^>]*>/gi, '');
        t = t.replace(/<[^>\n]+>/g, ' ');
        const dropTokens = /\b(Fb2\.zip|Epub|Содержание|Fine HTML|Printed version|Lib\.ru html|txt\(Word,[^)]+\))/gi;
        const lines = t.split('\n').map(line => line.replace(dropTokens, '').replace(/\s+$/,''));
        const filtered = [];
        for (const line of lines){
          const trimmed = line.trim();
          if (!trimmed){ filtered.push(''); continue; }
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
      },
  
      stripGutenberg(text){
        const start = text.match(/^\s*\*{3}\s*START OF (THIS|THE) PROJECT GUTENBERG EBOOK.*$/mi);
        const end   = text.match(/^\s*\*{3}\s*END OF (THIS|THE) PROJECT GUTENBERG EBOOK.*$/mi);
        const startIdx = start ? text.indexOf(start[0]) + start[0].length : 0;
        const endIdx   = end ? text.indexOf(end[0]) : text.length;
        let body = text.slice(startIdx, endIdx).trim();
        if(body.replace(/\s/g,'').length < 200) body = text;
        return body;
      },
  
      stripLibRu(text){
        let lines = text.split('\n');
        let i = 0;
        for(; i < Math.min(lines.length, 200); i++){
          const L = lines[i].trim();
          if (/^(Lib\.ru|Библиотека|ilibrary|http(s?):\/\/|ftp:\/\/|e-?mail:|mailto:)/i.test(L)) continue;
          if (/^={3,}|^-{3,}|\*{3,}$/.test(L)) continue;
          if (/^\s*$/.test(L)) {
            const nextNonEmpty = lines.slice(i+1, i+12).find(s => s.trim().length>0) || '';
            if (!/^(Lib\.ru|http|ftp|e-?mail)/i.test(nextNonEmpty)) { i++; break; }
            continue;
          }
          if (L.length > 0 && !/Lib\.ru|http|ftp|e-?mail/i.test(L)) break;
        }
        lines = lines.slice(i);
        while(lines.length && /^\s*$/.test(lines[lines.length-1])) lines.pop();
        const tail = lines.slice(-40).join('\n');
        if (/^\s*(Каталог|Library|Lib\.ru|ilibrary)/mi.test(tail)) lines = lines.slice(0, -40);
        let t = lines.join('\n')
          .replace(/(^|\s)--(\s|$)/g, '$1—$2')
          .replace(/\s+—\s+/g, ' — ')
          .replace(/[ \t]+\n/g, '\n');
        t = t.replace(/\n{3,}/g, '\n\n');
        return t.trim();
      },
  
      /* ---------- Metadata ---------- */
      extractMeta(text, provider){
        const out = { title: '', author: '' };
        if(provider === 'gutenberg'){
          const tm = text.match(/^\s*Title:\s*(.+)$/mi);
          const am = text.match(/^\s*Author:\s*(.+)$/mi);
          if(tm) out.title  = tm[1].trim();
          if(am) out.author = am[1].trim();
        }
        if(!out.title || !out.author){
          const head = text.split('\n').slice(0, 160).map(s=>s.trim());
          const cleanedHead = head.filter(line => line.length > 0 && !/^https?:\/\//i.test(line));
          if(!out.title){
            const quotedCandidates = [];
            cleanedHead.forEach((line)=>{
              for (const m of line.matchAll(/[«"](.*?)[»"]/g)){
                const cand = (m[1]||'').trim();
                if (cand.length >= 3 && cand.length <= 80) quotedCandidates.push(cand);
              }
            });
            if (quotedCandidates.length){
              quotedCandidates.sort((a,b)=>b.length - a.length);
              out.title = quotedCandidates[0].replace(/^[«"]|["»]$/g,'').trim();
            }
          }
          const nonEmpty = head.filter(s => s.length>0);
          if(!out.title && nonEmpty.length) out.title = nonEmpty[0].replace(/^["«](.*)["»]$/,'$1');
          const by1 = head.join('\n').match(/\bby\s+([A-Z][\w .,'-]+)\b/mi);
          const by2 = head.join('\n').match(/\b(Автор|Сост\.?|Перевод):\s*([A-ЯЁA-Z][\w .,'-]+)\b/mi);
          if(!out.author && by1) out.author = by1[1].trim();
          if(!out.author && by2) out.author = by2[2].trim();
          if(!out.author){
            for(const line of cleanedHead){
              const fullNameMatch = line.match(/([\p{Lu}][\p{L}\p{M}\.-]+ [\p{Lu}][\p{L}\p{M}\.-]+(?: [\p{Lu}][\p{L}\p{M}\.-]+)?)/u);
              if(fullNameMatch){
                const candidate = fullNameMatch[1].trim();
                if (candidate.split(' ').length >= 2 && !/\d/.test(candidate)){
                  out.author = candidate.replace(/\s*\(.*/, '').trim().replace(/\.$/, '');
                  break;
                }
              }
            }
          }
          if ((!out.title || out.title.includes('...')) && out.author){
            const authorLine = cleanedHead.find(line => line.includes(out.author));
            if (authorLine){
              const idx = authorLine.indexOf(out.author) + out.author.length;
              const candidate = authorLine
                .slice(idx)
                .replace(/[.\-:]+/, ' ')
                .replace(/Содержание/gi, '')
                .trim()
                .replace(/\s+/g, ' ');
              if (candidate.length >= 3){
                out.title = candidate;
              }
            }
          }
          if(!out.author){
            for(const line of cleanedHead){
              const nameWithInitials = line.match(/((?:[\p{Lu}]\.\s*){1,2}[\p{Lu}][\p{L}\p{M}-]{2,})/u);
              if(nameWithInitials){
                const candidate = nameWithInitials[1].trim();
                if (!/\d/.test(candidate)){
                  out.author = candidate.replace(/\.$/, '');
                  break;
                }
              }
            }
          }
          if(!out.author){
            for(const line of cleanedHead){
              const byVerb = line.match(/(?:писал|записал|сочинил|создал)\s+([A-ZА-ЯЁ][\w .-]+)/i);
              if(byVerb){
                out.author = byVerb[1].replace(/\s*\(.*/, '').trim();
                break;
              }
            }
          }
          const normalizedTitle = (out.title || '').replace(/\W+/g,'').toLowerCase();
          const normalizedAuthor = (out.author || '').replace(/\W+/g,'').toLowerCase();
          if(!out.title || normalizedTitle === normalizedAuthor){
            const headingCandidate = cleanedHead.find(line=>{
              if (out.author && line.includes(out.author)) return false;
              if (line.length === 0 || line.length > 90) return false;
              if (/\d{4}/.test(line)) return false;
              return /^[\p{Lu}]/u.test(line);
            });
            if (headingCandidate){
              out.title = headingCandidate.replace(/\s+/g,' ').trim();
            }
          }
        }
        return out;
      },
  
      /* ---------- Segmentation ---------- */
      segmentSections(text, provider){
        const lines = text.split('\n');
        let notesStart = -1;
        for(let k = lines.length - 1; k >= 0; k--){
          const L = lines[k].trim();
          if (/^(footnotes?|notes|примечания|сноски)\s*$/i.test(L)){ notesStart = k; break; }
        }
        const bodyLines = notesStart > 0 ? lines.slice(0, notesStart) : lines.slice();
        const footLines = notesStart > 0 ? lines.slice(notesStart) : [];
  
        const sections = [];
        let section = { title:'', headingLevel:'', content:[] };
  
        const reBook    = /^\s*(BOOK|КНИГА)\s+([IVXLCDM]+|\d+)(?:[.:)\-–— ](.*))?$/i;
        const rePart    = /^\s*(PART|ЧАСТЬ)\s+([IVXLCDM]+|\d+)(?:[.:)\-–— ](.*))?$/i;
        const reChapter = /^\s*(CHAPTER|ГЛАВА)\s+([IVXLCDM]+|\d+)(?:[.:)\-–— ](.*))?$/i;
        const reAllCaps = /^[A-ZА-ЯЁ0-9 ,.'"«»\-:;!?]{6,}$/;
  
        for(const raw of bodyLines){
          const L = raw.trim();
  
          if (/^(?:\*\s*\*\s*\*|\*\*\*|—\s*—\s*—|—{3,}|-{3,})$/.test(L)){
            section.content.push('<hr/>');
            continue;
          }
  
          const mBook = L.match(reBook);
          const mPart = L.match(rePart);
          const mChap = L.match(reChapter);
  
          if(mBook || mPart || mChap || (provider==='libru' && reAllCaps.test(L) && L.length < 80)){
            if(section.title || section.content.length) sections.push(section);
            let label='', rest='';
            if(mBook){ label = (mBook[1].toUpperCase()==='BOOK'?'BOOK':'КНИГА') + ' ' + mBook[2]; rest = mBook[3]||''; section={title:(label+(rest?': '+rest:'')), headingLevel:'H1', content:[]}; continue; }
            if(mPart){ label = (mPart[1].toUpperCase()==='PART'?'PART':'ЧАСТЬ') + ' ' + mPart[2]; rest = mPart[3]||''; section={title:(label+(rest?': '+rest:'')), headingLevel:'H1', content:[]}; continue; }
            if(mChap){ label = (mChap[1].toUpperCase()==='CHAPTER'?'CHAPTER':'ГЛАВА') + ' ' + mChap[2]; rest = mChap[3]||''; section={title:(label+(rest?': '+rest:'')), headingLevel:'H2', content:[]}; continue; }
            section = { title: L, headingLevel:'H2', content:[] };
            continue;
          }
          section.content.push(raw);
        }
        if(section.title || section.content.length) sections.push(section);
  
        const footMap = this.parseFootnoteBodies(footLines.join('\n'));
        sections.forEach((sec) => sec.html = this.convertLinesToHtml(sec.content, footMap));
        return { sections, footMap };
      },
  
      /* ---------- Footnotes ---------- */
      parseFootnoteBodies(block){
        const map = {};
        if(!block || block.trim().length===0) return map;
        const lines = block.replace(/\r\n/g,'\n').split('\n');
        let curId = null, acc = [];
        const commit = ()=>{
          if(curId){
            let html = acc.join('\n').trim();
            html = this.escapeHtml(html).replace(/\n\n+/g,'</p><p>').replace(/\n/g,' ');
            map[curId] = '<p>'+html+'</p>';
          }
          curId = null; acc = [];
        };
        for(const line of lines){
          const m = line.match(/^\s*(?:\[(\d+)]|(\d+)[\.\)]?|\((\d+)\))\s*(.*)$/);
          if(m){
            if(curId) commit();
            const num = (m[1]||m[2]||m[3]);
            curId = num ? 'fn'+num : null;
            const rest = m[4]||'';
            if(rest.trim().length) acc.push(rest);
            continue;
          }
          if(curId===null) continue;
          if(line.trim().length===0){ commit(); continue; }
          acc.push(line);
        }
        commit();
        return map;
      },
  
      convertLinesToHtml(lines, footMap){
        let joined = lines.join('\n');
        joined = this.injectFootnoteReferences(joined);
  
        const parts = joined.split(/\n{2,}/);
        const htmlParts = [];
        for(let block of parts){
          const trimmed = block.trim();
          if(!trimmed) continue;
          if(trimmed === '<hr/>' || trimmed === '<hr />'){ htmlParts.push('<hr/>'); continue; }
          let safe = this.escapeHtmlExceptInjected(trimmed);
          safe = safe.replace(/\n+/g,' ');
          htmlParts.push('<p>'+safe+'</p>');
        }
        return htmlParts.join('\n');
      },
  
      /* ---------- Build single flow HTML (pre-pagination) ---------- */
      buildFlowHtml(seg){
        const out = [];
        if(this.bookTitle) out.push(`<h1 id="heading-title">${this.escapeHtml(this.bookTitle)}</h1>`);
        if(this.bookAuthor) out.push(`<p class="text-muted"><em>${this.escapeHtml(this.bookAuthor)}</em></p>`);
        let hCounter = 0;
        for(const s of seg.sections){
          let tag = 'h2';
          if(s.headingLevel==='H1') tag = 'h1';
          if(s.title){
            hCounter++;
            out.push(`<${tag} id="heading-${hCounter}">${this.escapeHtml(s.title)}</${tag}>`);
          }
          out.push(s.html);
        }
        const ids = Object.keys(seg.footMap || {});
        if(ids.length){
          ids.forEach(id => out.push(`<aside data-footnote="${id}">${seg.footMap[id]}</aside>`));
        }
        return out.join('\n');
      },
  
      /* ---------- Pagination renderer (queue-based; no drops) ---------- */
      renderPages(flowHtml, options = {}){
        const { preserveRatio = null } = options;
        this.pagesEl.innerHTML = '';
        this.applyTypography();
        const w = this.pageWidthPx;
        const h = this.pageHeightPx;
        this.lastFlowHtml = flowHtml;
  
        // Hidden staging root with flow content (acts as a queue)
        const stage = document.createElement('div');
        stage.style.position = 'absolute';
        stage.style.visibility = 'hidden';
        stage.style.pointerEvents = 'none';
        stage.style.left = '-99999px';
        stage.style.top = '0';
        stage.style.width = w + 'px';
        stage.innerHTML = flowHtml;
        document.body.appendChild(stage);
  
        let page = this.createPage();
        this.pagesEl.appendChild(page);
  
        const fits = () => page.scrollHeight <= page.clientHeight;
  
        // consume stage.firstChild repeatedly to avoid index bugs
        while (stage.firstChild){
          const node = stage.firstChild;
  
          page.appendChild(node);
          if (fits()){
            continue; // good; consume next node
          }
  
          // overflow -> undo append
          page.removeChild(node);
  
          // keep headings with following content; don't leave them as last line
          const last = page.lastElementChild;
          if (last && /^H[1-3]$/i.test(last.tagName)){
            // move heading back in front of current node so it starts next page
            stage.insertBefore(last, node);
          }
  
          // If the overflowing node can be split, split and queue remainder
          if (this.isSplittableBlock(node)){
            const parts = this.splitBlockForPage(node, page);
            if (parts.first){
              page.appendChild(parts.first); // now fits by construction
            }
            // new page
            page = this.createPage();
            this.pagesEl.appendChild(page);
  
            // Put remainder (if any) at the front of the queue
            if (parts.remainder) stage.insertBefore(parts.remainder, stage.firstChild);
          } else {
            // non-splittable -> start a new page and place it there
            page = this.createPage();
            this.pagesEl.appendChild(page);
            page.appendChild(node);
            // if STILL doesn't fit (e.g., huge image), we just allow slight overflow
          }
        }
  
        document.body.removeChild(stage);
  
        this.recomputePages();
        const maxIndex = Math.max(1, this.ui.totalPageCount - 1);
        if (typeof preserveRatio === 'number' && maxIndex > 0) {
          const clamped = Math.min(1, Math.max(0, preserveRatio));
          const targetIndex = Math.max(0, Math.min(this.ui.totalPageCount - 1, Math.round(clamped * maxIndex)));
          this.pagesEl.scrollLeft = targetIndex * this.pageWidthPx;
          this.ui.currentPageIndex = targetIndex;
          this.recomputePages();
        } else {
          this.pagesEl.scrollLeft = 0;
          this.ui.currentPageIndex = 0;
        }
      },
  
      isSplittableBlock(node){
        if (!(node instanceof HTMLElement)) return false;
        const tag = (node.tagName || '').toUpperCase();
        return tag === 'P' || tag === 'BLOCKQUOTE' || tag === 'PRE';
      },
  
      // Return {first, remainder} nodes that fit current page exactly.
      splitBlockForPage(node, page){
        const text = node.textContent || '';
        if (!text.trim()){ return { first: node, remainder: null }; }
  
        const first = node.cloneNode(false);
        const rem   = node.cloneNode(false);
  
        // try word-based split first
        const tokens = text.split(/(\s+)/); // keep spaces
        let lo = 1, hi = tokens.length, best = 0;
  
        const test = (count) => {
          first.textContent = tokens.slice(0, count).join('');
          page.appendChild(first);
          const ok = page.scrollHeight <= page.clientHeight;
          page.removeChild(first);
          return ok;
        };
  
        while (lo <= hi){
          const mid = Math.floor((lo + hi) / 2);
          if (test(mid)){ best = mid; lo = mid + 1; } else { hi = mid - 1; }
        }
  
        if (best === 0){
          // fall back to char-based split to guarantee progress
          let loC = 1, hiC = Math.min(text.length, 1200), bestC = 0;
          const testC = (c) => {
            first.textContent = text.slice(0, c);
            page.appendChild(first);
            const ok = page.scrollHeight <= page.clientHeight;
            page.removeChild(first);
            return ok;
          };
          while (loC <= hiC){
            const midC = Math.floor((loC + hiC) / 2);
            if (testC(midC)){ bestC = midC; loC = midC + 1; } else { hiC = midC - 1; }
          }
          if (bestC === 0){
            // give up: put whole node on next page
            return { first: null, remainder: node };
          }
          first.textContent = text.slice(0, bestC);
          rem.textContent   = text.slice(bestC);
          return { first, remainder: rem.textContent.trim() ? rem : null };
        }
  
        first.textContent = tokens.slice(0, best).join('');
        rem.textContent   = tokens.slice(best).join('');
        return { first, remainder: rem.textContent.trim() ? rem : null };
      },
  
      createPage(){
        const div = document.createElement('div');
        div.className = 'page';
        div.style.width = this.pageWidthPx + 'px';
        div.style.height = this.pageHeightPx + 'px';
        div.style.boxSizing = 'border-box';
        div.style.padding = getComputedStyle(document.documentElement).getPropertyValue('--page-padding');
        div.style.fontSize = getComputedStyle(document.documentElement).getPropertyValue('--base-font-size');
        div.style.lineHeight = getComputedStyle(document.documentElement).getPropertyValue('--line-height') || '1.62';
        div.style.overflow = 'hidden';
        return div;
      },
  
      repaginateIfNeeded(){
        if (this.lastRaw && this.lastRaw.buffer) {
          const currentIndex = this.ui.currentPageIndex;
          this.decodeAndConsume(this.lastRaw.buffer);
          this.scrollToPage(currentIndex, 0);
        }
      },
  
      /* ---------- TOC & Navigation ---------- */
      buildToc(){
        this.toc = [];
        const nodes = this.pagesEl.querySelectorAll('h1, h2, h3');
        let idx = 0;
        nodes.forEach(n=>{
          if(!n.id){ idx++; n.id = 'heading-auto-'+idx; }
          this.toc.push({ id:n.id, text:n.textContent.trim(), level:n.tagName });
        });
      },
      goto(id){
        const target = document.getElementById(id);
        if(!target) return;
        const page = target.closest('.page');
        if(!page) return;
        const index = Array.prototype.indexOf.call(this.pagesEl.children, page);
        if(index >= 0) this.scrollToPage(index, 300);
      },
  
      /* ---------- Footnote popovers ---------- */
      wireFootnotes(){
        const map = {};
        this.pagesEl.querySelectorAll('aside[data-footnote]').forEach(aside=>{
          map[aside.getAttribute('data-footnote')] = aside.innerHTML.trim();
          aside.style.display = 'none';
        });
  
        this.pagesEl.querySelectorAll('.footnote-ref[data-footnote-id]').forEach(ref=>{
          const id = ref.getAttribute('data-footnote-id');
          const html = map[id] || 'Footnote not found.';
          new bootstrap.Popover(ref, { container:'body', placement:'auto', trigger:'click', html:true, content:html });
        });
  
        if (!this.footnoteScrollHandlerAttached) {
          this.pagesEl.addEventListener('scroll', ()=>{
            document.querySelectorAll('.footnote-ref').forEach(el=>{
              const o = bootstrap.Popover.getInstance(el); if(o) o.hide();
            });
          });
          this.footnoteScrollHandlerAttached = true;
        }
      },
  
      /* ---------- Typography & Theme ---------- */
      handleFontSizeSliderInput(){
        this.applyTypography();
        this.rebuildPagesAfterTypographyChange();
      },
      rebuildPagesAfterTypographyChange(){
        if (!this.lastFlowHtml || !this.pagesEl) return;
        const totalPages = Math.max(1, this.ui.totalPageCount);
        const ratio = totalPages > 1 ? this.ui.currentPageIndex / (totalPages - 1) : 0;
        this.renderPages(this.lastFlowHtml, { preserveRatio: ratio });
        this.applyTheme();
        this.buildToc();
        this.wireFootnotes();
        this.recomputePages();
        this.saveScrollIndex(this.ui.currentPageIndex);
      },
      applyTypography(){
        const root = document.documentElement;
        const rs = root.style;
  
        const containerWidth = this.pagesEl ? this.pagesEl.clientWidth : window.innerWidth;
        this.pageWidthPx = Math.max(1, Math.floor(containerWidth));
        rs.setProperty('--page-width', `${this.pageWidthPx}px`);
  
        const toolbarEl = document.querySelector('.toolbar');
        const footerEl = document.querySelector('.footer');
        const toolbarHeight = toolbarEl ? toolbarEl.getBoundingClientRect().height : 0;
        const footerHeight = footerEl ? footerEl.getBoundingClientRect().height : 0;
        const structuralMargin = 24; // guard so text never sits under the footer/thermometer
  
        const viewportAllowance = window.innerHeight - toolbarHeight - footerHeight - structuralMargin;
        const readingArea = this.pagesEl ? this.pagesEl.closest('.area') : null;
        const areaHeight = readingArea ? readingArea.getBoundingClientRect().height : viewportAllowance;
  
        const targetHeight = Math.max(
          160,
          Math.min(Math.floor(viewportAllowance), Math.floor(areaHeight)),
        );

        this.pageHeightPx = targetHeight;
        rs.setProperty('--page-height', `${targetHeight}px`);

        rs.setProperty('--base-font-size', this.ui.fontSizePx + 'px');
        rs.setProperty('--page-padding', PAGE_PADDING_PX + 'px');
      },
      applyTheme(){
        this.themeClass = this.ui.theme==='dark' ? 'theme-dark' :
                          this.ui.theme==='sepia' ? 'theme-sepia' : 'theme-light';
      },
  
      /* ---------- Paging ---------- */
      recomputePages(){
        this.ui.totalPageCount = Math.max(1, this.pagesEl.children.length);
        const w = this.pageWidthPx;
        this.ui.currentPageIndex = Math.round(this.pagesEl.scrollLeft / w);
      },
      pageDisplay(){
        return `Page ${this.ui.currentPageIndex+1} / ${this.ui.totalPageCount}`;
      },
      progressPercent(){
        const total = Math.max(1, this.ui.totalPageCount);
        const lastIndex = total - 1;

        if (!this.pagesEl) {
          const fallbackRatio = lastIndex > 0 ? this.ui.currentPageIndex / lastIndex : 0;
          return Math.min(100, Math.max(0, fallbackRatio * 100));
        }

        if (lastIndex <= 0) {
          return 0;
        }

        const maxScroll = lastIndex * this.pageWidthPx;
        const ratioFromScroll = maxScroll > 0 ? this.pagesEl.scrollLeft / maxScroll : Number.NaN;
        const ratioFromIndex = this.ui.currentPageIndex / lastIndex;
        const ratio = Number.isFinite(ratioFromScroll) ? Math.max(ratioFromScroll, ratioFromIndex) : ratioFromIndex;
        return Math.min(100, Math.max(0, ratio * 100));
      },
      progressPageSummary(){
        const total = Math.max(1, this.ui.totalPageCount);
        const current = Math.min(total, Math.max(1, this.ui.currentPageIndex + 1));
        return `${total}/${current}`;
      },
      prevPage(){ this.scrollToPage(Math.max(0, this.ui.currentPageIndex - 1), 220); },
      nextPage(){ this.scrollToPage(Math.min(this.ui.totalPageCount - 1, this.ui.currentPageIndex + 1), 220); },
      scrollToPage(index, ms){
        const left = index * this.pageWidthPx;
        this.pagesEl.scrollTo({ left, behavior:'smooth' });
        setTimeout(()=>this.recomputePages(), (ms||0) + 50);
        this.saveScrollIndex(index);
      },
  
      attachScrollHandlers(){
        let snapTimer = null;
        this.pagesEl.addEventListener('scroll', ()=>{
          const idx = Math.round(this.pagesEl.scrollLeft / this.pageWidthPx);
          this.ui.currentPageIndex = idx;
          if(snapTimer) clearTimeout(snapTimer);
          snapTimer = setTimeout(()=>{ this.scrollToPage(idx, 150); }, 90);
        }, { passive:true });
      },
  
      /* ---------- Resume ---------- */
      saveScrollIndex(idx){
        if(!this.lastScrollKey) return;
        try { localStorage.setItem(this.lastScrollKey, String(idx)); } catch(e){}
      },
      restoreScroll(){
        if(!this.lastScrollKey) return;
        try {
          const stored = parseInt(localStorage.getItem(this.lastScrollKey), 10);
          if(!isNaN(stored)){
            this.pagesEl.scrollLeft = stored * this.pageWidthPx;
            this.ui.currentPageIndex = stored;
            this.recomputePages();
          }
        } catch(e){}
      },
  
      /* ---------- Escaping helpers ---------- */
      escapeHtml(s){
        return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      },
      escapeHtmlExceptInjected(s){
        let masked = s.replace(/<hr\/>/g,'[[[HR]]]')
                      .replace(/<sup class="footnote-ref" data-footnote-id="fn\d+">\[\d+\]<\/sup>/g, m=>'[[[SUP:'+btoa(m)+']]]');
        masked = this.escapeHtml(masked);
        masked = masked.replace(/\[\[\[HR]]]/g,'<hr/>')
                       .replace(/\[\[\[SUP:([A-Za-z0-9+/=]+)]]]/g, (_,b64)=>atob(b64));
        return masked;
      },
      injectFootnoteReferences(text){
        const toSup = (num) => `<sup class="footnote-ref" data-footnote-id="fn${num}">[${num}]</sup>`;
        const shouldConvert = (str, offset)=>{
          for(let i = offset - 1; i >= 0; i--){
            const ch = str[i];
            if (ch === '\n' || ch === '\r') return false;
            if (!/\s/.test(ch)) return !/\d/.test(ch);
          }
          return false;
        };
        let out = String(text || '');
        out = out.replace(/\[(\d{1,3})]/g, (_, num)=>toSup(num));
        out = out.replace(/\((\d{1,3})\)/g, (full, num, offset, str)=>{
          return shouldConvert(str, offset) ? toSup(num) : full;
        });
        out = out.replace(/\b(\d{1,3})\)(?!\w)/g, (full, num, offset, str)=>{
          return shouldConvert(str, offset) ? toSup(num) : full;
        });
        out = out.replace(/\b(\d{1,3})\.(?!\d)/g, (full, num, offset, str)=>{
          return shouldConvert(str, offset) ? toSup(num) : full;
        });
        return out;
      }
    };
  }
  
