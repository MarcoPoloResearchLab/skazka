# PLAN

- [x] `index.html`
  - Inline `@click` / `@change` handlers violate the Alpine `x-on:` requirement and couple UI widgets to global functions.
  - Hard-coded user strings (button labels, tooltips, headings) bypass the shared constants source of truth.
  - Direct DOM lookups (`document.getElementById('filePicker')`) are embedded in templates, preventing component re-use and breaking DOM-scoped event expectations.
  - **Refactor:** Convert markup to Alpine `x-data` factories exposed from `js/ui/`, swap to `x-on:` syntax, pull all text from `constants.js`, and rely on `$refs` + dispatched events instead of direct DOM access. Update `<script>` tags to use `type="module"` and import the new composition root.

- [x] `js/app.js`
  - Monolithic global factory mixes domain logic, pagination, storage, notifications, and Alpine registration; no `// @ts-check` or JSDoc.
  - Embedded user strings and magic numbers contravene the constants guidelines; direct `alert()` breaks notification architecture.
  - Known defects: pagination DOMException (SZ-19), text truncation (SZ-15), page count drift (SZ-16), and stale TOC (SZ-17) originate here.
  - **Refactor:** Strip `bookReader` into focused modules, keep `app.js` as the Alpine composition root that imports factories/utils/constants, registers components/stores, and wires DOM-scoped event bridges. Replace alerting and global event listeners with scoped dispatch/listen flows. Ensure pagination emits deterministic page counts and rebuilds TOC from fresh content.

- [x] `js/constants.js` (new)
  - Currently missing; user-facing strings and event names are scattered.
  - **Add:** Centralize UI copy, event channel names (e.g., `EVENTS.notify`, `EVENTS.bookLoaded`), numeric tunables (page padding, animation timings) via frozen objects for reuse across modules and tests.

- [x] `js/core/text-source.js` & `js/core/text-normalizer.js` (new)
  - Domain tasks (decoding, provider detection, normalization, metadata extraction) live inside the Alpine component with duplicated heuristics in tests.
  - **Add:** Pure functions for decoding/autodetect, provider-specific stripping, metadata extraction, and section segmentation. Export typed APIs consumed by the reader factory and unit-tested in isolation.

- [x] `js/core/pagination.js` & `js/utils/pagination-dom.js` (new)
  - Page splitting, node cloning, footnote merging, and progress calculations are interleaved with UI state, causing regressions and DOMExceptions.
  - **Add:** A pagination service that exposes `paginate(flowHtml, viewportMetrics)` returning structured page data plus helpers to maintain scroll position. House DOM helpers (`createPage`, `splitNodeAtOffset`, `mergeContinuations`) in utils with shared unit coverage, ensuring deterministic page totals and eliminating the stage re-insertion bug (SZ-19).

- [x] `js/ui/reader.js` (new)
  - Alpine factory must own only UI state and orchestrate domain services, but is currently missing.
  - **Add:** Reader Alpine component consuming core services, dispatching notifications, emitting `reader:loaded`/`reader:paginationChanged` events, and exposing command handlers used by toolbar buttons. Ensure `$watch` hooks trigger repagination without increasing totals (fix SZ-16) and TOC rebuilds on load (fix SZ-17).

- [x] `js/ui/toolbar.js`, `js/ui/notifications.js`, `js/ui/toc.js` (new)
  - Toolbar buttons directly mutate reader state; notifications rely on `alert`.
  - **Add:** Dedicated Alpine factories per UI panel with DOM-scoped listeners that respond to dispatched events (`notify`, `reader:state`), drive file picker via `$refs`, and publish command events consumed by the reader component. Implement toast-style notifications (Bootstrap alert/offcanvas) triggered by events.

- [x] `js/utils/storage.js`, `js/utils/dom.js`, `js/utils/format.js` (new)
  - LocalStorage access, class toggling, and string helpers are repeated inline.
  - **Add:** Thin utility modules (pure / DOM adapters) with JSDoc annotations to consolidate repeated logic, ease testing, and maintain strict mode compliance.

- [x] `tests/run-tests.js` & Puppeteer suites
  - Suites inline the current `app.js` script; this will break once we convert to ES modules and split files. Missing coverage for current regression backlog (SZ-15/16/17/19) and new event/notification flow.
  - **Refactor:** Update harness to load `index.html` (or a dedicated test harness) via `page.goto` with module scripts, stubbing network requests as needed. Add new Puppeteer specs covering: (1) end-to-end load from fixtures verifying pagination completion (SZ-15), (2) static page counts under navigation (SZ-16), (3) TOC refresh after reloading a different fixture (SZ-17), and (4) absence of DOMException when repaginating (SZ-19). Add unit tests for core text utilities where practical.

- [x] `README.md`
  - Documentation still describes single-component architecture; no mention of event contracts or new module layout.
  - **Update:** Document the Alpine composition, event names, notification flow, and testing instructions (including new Puppeteer scenarios and deterministic RNG hooks if introduced).

- [x] `MIGRATION.md` (new)
  - Required to guide contributors through the breaking changes (event-driven buttons, module layout).
  - **Add:** Detail removed globals, new event contracts (toolbar → reader commands, reader → notifications), and setup steps for tests.

- [x] `NOTES.md`
  - Bug list must remain authoritative; we need to mark fixes and document validation once each SZ ticket is addressed.
  - **Plan:** After implementing and testing each fix, update the checklist with `[X]` and brief verification notes.
