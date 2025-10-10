// @ts-check

import { NUMBERS, EVENTS, STRINGS } from '../constants.js';
import { dispatchEvent } from '../utils/dom.js';
import { setItem, getItem } from '../utils/storage.js';
import { formatPageDisplay, formatProgressSummary } from '../utils/format.js';
import { decodeBuffer, looksLikeHtml, htmlToPlainText, detectProvider } from '../core/text-source.js';
import { prepareContent, convertLinesToHtml as normalizeLinesToHtml } from '../core/text-normalizer.js';
import { paginateFlowHtml } from '../core/pagination.js';

const PAGE_TURN_CLASS = 'page--corner-flip';

export function createReader(){
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
      lastTocSignature: '',
  
      /* ---------- Internals ---------- */
      pagesEl: null,
      pageWidthPx: 0,
      pageHeightPx: 0,
      pageTurnTimers: new Map(),
  
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
        this.renderPages(`<p class="text-muted">${STRINGS.loadInstructions}</p>`);
      },

      handleLoadRequest(detail){
        if (!detail || typeof detail.url !== 'string') return;
        if (detail.provider) this.provider = detail.provider;
        if (detail.encoding) this.encoding = detail.encoding;
        this.loadUrl = detail.url.trim();
        if (!this.loadUrl){
          return;
        }
        this.loadFromUrl();
      },

      handleFileSelected(detail){
        if (!detail || !(detail.file instanceof File)) return;
        if (detail.provider) this.provider = detail.provider;
        if (detail.encoding) this.encoding = detail.encoding;
        this.loadFromFile(detail.file);
      },

      handleFontSizeSet(detail){
        if (!detail) return;
        const value = Number(detail.value);
        if (!Number.isFinite(value)) return;
        this.ui.fontSizePx = Math.max(14, Math.min(26, Math.round(value)));
        this.handleFontSizeSliderInput();
      },

      handleThemeSet(detail){
        if (!detail || typeof detail.value !== 'string') return;
        this.ui.theme = detail.value;
        this.applyTheme();
      },

      handleProviderEncodingChange(detail){
        if (detail){
          if (detail.provider) this.provider = detail.provider;
          if (detail.encoding) this.encoding = detail.encoding;
        }
        this.onProviderOrEncodingChange();
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
          this.emitNotification({
            level: 'error',
            message: `${STRINGS.fetchError} ${err instanceof Error ? err.message : err}`,
          });
        }
      },
  
      loadFromFile(file){
        if(!(file instanceof File)) return;
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
      decodeAndConsume(buffer){
        const { text, encoding } = decodeBuffer(buffer, {
          encoding: this.encoding,
          providerHint: this.provider
        });
        this.usedEncoding = encoding;

        let plainText = text;
        if (looksLikeHtml(plainText)) {
          plainText = htmlToPlainText(plainText);
        }

        const effectiveProvider = this.provider === 'auto' ? detectProvider(plainText) : this.provider;
        const processed = prepareContent(plainText, { provider: effectiveProvider });

        this.bookTitle = processed.metadata.title || 'Untitled';
        this.bookAuthor = processed.metadata.author || '';
        this.lastFlowHtml = processed.flowHtml;

        this.renderPages(processed.flowHtml);

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

      convertLinesToHtml(lines, footMap = {}){
        return normalizeLinesToHtml(Array.isArray(lines) ? lines : [], footMap || {});
      },
  
  
      /* ---------- Normalization & provider stripping ---------- */
      /* ---------- Pagination renderer (queue-based; no drops) ---------- */
      renderPages(flowHtml, options = {}){
        const { preserveRatio = null } = options;
        this.clearPageTurnEffects();
        if (!this.pagesEl) {
          return;
        }
        this.pagesEl.innerHTML = '';
        this.applyTypography();
        this.lastFlowHtml = flowHtml;

        const { targetIndex, totalPages } = paginateFlowHtml(flowHtml, {
          container: this.pagesEl,
          pageWidthPx: this.pageWidthPx,
          pageHeightPx: this.pageHeightPx,
          preserveRatio
        });

        if (typeof preserveRatio === 'number' && totalPages > 1) {
          this.pagesEl.scrollLeft = targetIndex * this.pageWidthPx;
          this.ui.currentPageIndex = targetIndex;
        } else {
          this.pagesEl.scrollLeft = 0;
          this.ui.currentPageIndex = 0;
        }
        this.recomputePages();
      },
      extractTrailingHeading(pageElement){
        if (!pageElement) return null;
        const last = pageElement.lastElementChild;
        if (!last) return null;
        const tagName = (last.tagName || '').toUpperCase();
        if (!/^H[1-3]$/.test(tagName)){
          return null;
        }
        pageElement.removeChild(last);
        return last;
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
        this.emitTocUpdated();
      },
      goto(id){
        const target = document.getElementById(id);
        if(!target) return;
        const page = target.closest('.page');
        if(!page) return;
        const index = Array.prototype.indexOf.call(this.pagesEl.children, page);
        if(index >= 0) this.scrollToPage(index, 300);
      },
      emitTocUpdated(){
        const headings = Array.isArray(this.toc) ? this.toc.map((entry)=>entry.text) : [];
        const signature = `${this.bookTitle || ''}::${headings.join('|')}`;
        if (signature === this.lastTocSignature){
          return;
        }
        this.lastTocSignature = signature;
        const detail = {
          bookTitle: this.bookTitle || '',
          headings,
          entries: Array.isArray(this.toc) ? this.toc.map((entry) => ({ ...entry })) : []
        };
        const tocElement = document.getElementById('tocDrawer');
        const target = tocElement || this.$el || this.pagesEl || document;
        dispatchEvent(target, EVENTS.TOC_UPDATED, detail);
      },
      emitNotification(detail){
        const target = this.$el || document;
        dispatchEvent(target, EVENTS.NOTIFY, detail);
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
        const viewportAllowance = window.innerHeight - toolbarHeight - footerHeight - NUMBERS.STRUCTURAL_MARGIN_PX;
        const readingArea = this.pagesEl ? this.pagesEl.closest('.area') : null;
        const areaHeight = readingArea ? readingArea.getBoundingClientRect().height : viewportAllowance;
  
        const targetHeight = Math.max(
          160,
          Math.min(Math.floor(viewportAllowance), Math.floor(areaHeight)),
        );

        this.pageHeightPx = targetHeight;
        rs.setProperty('--page-height', `${targetHeight}px`);

        rs.setProperty('--base-font-size', this.ui.fontSizePx + 'px');
        rs.setProperty('--page-padding', `${NUMBERS.PAGE_PADDING_PX}px`);
      },
      applyTheme(){
        this.themeClass = this.ui.theme==='dark' ? 'theme-dark' :
                          this.ui.theme==='sepia' ? 'theme-sepia' : 'theme-light';
        const html = document.documentElement;
        if (html) {
          html.setAttribute('data-bs-theme', this.ui.theme === 'dark' ? 'dark' : 'light');
        }
      },
  
      /* ---------- Paging ---------- */
      recomputePages(){
        this.ui.totalPageCount = Math.max(1, this.pagesEl.children.length);
        const w = this.pageWidthPx;
        this.ui.currentPageIndex = Math.round(this.pagesEl.scrollLeft / w);
      },
      pageDisplay(){
        return formatPageDisplay(this.ui.currentPageIndex, this.ui.totalPageCount);
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
        return formatProgressSummary(this.ui.currentPageIndex, this.ui.totalPageCount);
      },
      triggerPageTurnEffect(index){
        if (!this.pagesEl) return;
        const target = this.pagesEl.children[index];
        if (!target) return;

        const existingTimeout = this.pageTurnTimers.get(target);
        if (existingTimeout){
          clearTimeout(existingTimeout);
        }

        target.classList.remove(PAGE_TURN_CLASS);
        // force reflow so re-adding the class restarts the animation
        void target.offsetWidth;
        target.classList.add(PAGE_TURN_CLASS);

        const timeoutId = window.setTimeout(()=>{
          target.classList.remove(PAGE_TURN_CLASS);
          this.pageTurnTimers.delete(target);
        }, NUMBERS.PAGE_TURN_ANIMATION_MS);
        this.pageTurnTimers.set(target, timeoutId);
      },
      clearPageTurnEffects(){
        for (const timeoutId of this.pageTurnTimers.values()){
          clearTimeout(timeoutId);
        }
        this.pageTurnTimers.clear();
        if (!this.pagesEl) return;
        const pages = Array.from(this.pagesEl.children);
        pages.forEach((pageEl)=>pageEl.classList.remove(PAGE_TURN_CLASS));
      },
      prevPage(){ this.scrollToPage(Math.max(0, this.ui.currentPageIndex - 1), 220); },
      nextPage(){ this.scrollToPage(Math.min(this.ui.totalPageCount - 1, this.ui.currentPageIndex + 1), 220); },
      scrollToPage(index, ms){
        this.triggerPageTurnEffect(index);
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
        setItem(this.lastScrollKey, String(idx));
      },
      restoreScroll(){
        if(!this.lastScrollKey) return;
        const raw = getItem(this.lastScrollKey);
        if (typeof raw !== 'string') {
          return;
        }
        const stored = parseInt(raw, 10);
        if(!Number.isNaN(stored)){
          this.pagesEl.scrollLeft = stored * this.pageWidthPx;
          this.ui.currentPageIndex = stored;
          this.recomputePages();
        }
      },
  
      /* ---------- Escaping helpers ---------- */
    };
  }

if (typeof window !== 'undefined') {
  window.footnoteInline = (footnoteId, trailing) => ({
    footnoteId,
    trailing,
    init(){}
  });
}
  
