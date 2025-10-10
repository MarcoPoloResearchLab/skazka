# Skazka Reader — Read plain-text books like real pages

Skazka Reader turns plain `.txt` files into a comfortable, book-style reading experience in your browser. No accounts, no uploads, no conversions — just point it at a text file (local or online) and start reading with swipes or arrow keys.

---

## Why it’s useful

* **Any TXT becomes a book**
  Works great with plain text from Project Gutenberg, Lib.ru, and similar archives — even when the files contain boilerplate headers or ASCII quirks.

* **Automatic cleanup**
  The reader recognizes common provider formats (Gutenberg, Lib.ru) and removes catalog banners, download menus, and trailing boilerplate so you see just the book.

* **Reads like paper**
  Text is laid out in **page-like columns** with smooth horizontal paging. Headings stick with their paragraphs (no widowed single lines).

* **No setup, no signup**
  Open `index.html` and read. Everything runs locally in your browser.

* **Great on touch and desktop**
  Swipe left/right on touchscreens or use ← / → keys and PageUp/PageDown. Big “Prev / Next” buttons are included.

* **Your place is remembered**
  The app stores the current page per book in your browser (local only) and restores it next time.

* **Footnotes that don’t distract**
  Footnote marks open as small popovers — dip in and out without losing your line.

* **Easy on the eyes**
  Light, Sepia, and Dark themes, plus quick sliders for font size and page padding.

* **Handles messy encodings**
  Smart **auto-detection** for Cyrillic and Western European texts; manual override (UTF-8, Windows-1251, KOI8-R, ISO-8859-5) if needed.

---

## Quick start (2 ways)

### 1) Read a local `.txt`

1. Open `index.html` in your browser.
2. Click **“Choose .txt”** and pick a file from your computer.
3. If the text looks garbled, switch **Encoding** from “Auto” to the correct one (try **Windows-1251** or **KOI8-R** for older Russian texts).

### 2) Read from a URL

1. Paste a direct link to a `.txt` file (e.g., a raw text on GitHub or a file hosted with permissive CORS).
2. Click **Load URL**.
3. Some sites block cross-origin access. If loading fails, download the file and use **“Choose .txt”** instead.

> Tip: For Lib.ru pages that show HTML on first load, pick the **TXT** link on the site (often labelled “Ascii” or “txt”). The reader can also extract text from simple HTML pages if needed.

---

## Controls you’ll use most

* **Navigation**:

  * **→ / PageDown / Space** – Next page
  * **← / PageUp** – Previous page
  * **Click TOC** – Jump to chapter

* **Appearance**:

  * **Font** slider – Adjust text size
  * **Padding** slider – Adjust margins
  * **Theme** – Light / Sepia / Dark
  * **Fit height** – Use full screen height for the page

* **Provider & Encoding**:

  * **Provider** – Auto (default), Lib.ru, Gutenberg, Plain
  * **Encoding** – Auto (default) or pick a specific encoding

---

## What it cleans up for you

* **Project Gutenberg**: strips the legal boilerplate before/after the book.
* **Lib.ru**: removes menus, download selectors, catalog links, and trailing directory text.
* **Plain**: preserves your content with light spacing normalization.

You’ll see a clean title page, detected author (when available), a **Table of Contents**, chapters, separators, and inline **footnotes**.

---

## Privacy & offline

* **Your files never leave your device.**
  Everything runs in your browser — no uploads.

* **Your progress is stored locally** (per file/URL/provider) so you can continue where you left off.

* **Works offline** once opened (for local files). For URLs, you’ll need connectivity and a source that allows access.

---

## When things don’t look right

* **Garbled characters** → Try **Encoding**: Windows-1251 or KOI8-R (common for older Russian texts).
* **URL won’t load** → Site likely blocks cross-origin requests. Download the file and use **“Choose .txt”**.
* **Weird headings/TOC** → Switch **Provider** from Auto to the matching source (Lib.ru/Gutenberg) so cleanup rules apply.
* **Footnotes missing** → Some texts embed notes differently; you can still read the book — footnote popovers appear when references like `[12]` are detected.

---

## What makes it different

* Designed for **raw text** — no EPUB/MOBI needed.
* Sensible defaults: looks like a book without tinkering.
* Handles **mixed encodings** and **provider junk** so you don’t have to.

---

## FAQ

**Does it support EPUB/PDF?**
No — this tool focuses on plain `.txt` (and simple HTML that contains `<pre>` blocks). That’s why it’s fast and simple.

## Developer Notes

* **ES module architecture** – `js/app.js` composes Alpine factories from `js/ui/reader.js`, `js/ui/toolbar.js`, `js/ui/notifications.js`, and `js/ui/toc.js`. Domain services live under `js/core/` (`text-source`, `text-normalizer`, `pagination`) with shared adapters in `js/utils/` (`dom`, `storage`, `pagination-dom`). Shared copy and event tokens live in `js/constants.js`.
* **Event-driven components** – Toolbar controls dispatch DOM-scoped events (`reader:load-requested`, `reader:file-selected`, `reader:provider-encoding-changed`, `reader:font-size-set`, `reader:theme-set`). The reader emits `reader:tocUpdated`, navigation requests listen for `reader:goto-heading`, and notifications surface through `app:notify`.
* **Testing harness** – `npm test` runs the Puppeteer suite plus core service unit checks (`tests/core-modules.test.js`). Harness utilities in `tests/helpers/harness.js` generate temporary HTML files inside `tests/.tmp/` (git-ignored) so integration tests can import the ES modules without a bundler.
* **Legacy compatibility** – `window.bookReader` still exposes the reader factory for automation and regression tests, but new integrations should prefer the event contracts above.

**Will it work with very large books?**
Yes. The layout engine relies on browser columns, so it stays smooth without heavy JS pagination.

**Can I save or export?**
Your reading position is saved automatically in your browser. To share, send the original `.txt` file or link.

**What about accessibility?**
The UI is keyboard-friendly, and you can adjust font size, themes, and margins. Screen reader behavior depends on your browser; text remains standard HTML.

---

## Sources that work well

* **Project Gutenberg** (public domain classics)
* **Lib.ru** (large Russian collection; use the **TXT** option or let the reader clean simple HTML)

---

## License & credits

Skazka Reader is a lightweight, client-side project built with **Alpine.js** and **Bootstrap 5**.
It’s intended for personal reading of public-domain or otherwise authorized texts.

Enjoy your books!
