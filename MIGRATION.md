# Migration Guide

Skazka Reader now uses an event-driven Alpine.js architecture backed by ES modules. This document highlights the changes you need to know when upgrading custom integrations or automation.

## Module layout

```
js/
  app.js                 # composition root – wires Alpine factories and stores
  constants.js           # shared UI copy, event names, numeric constants
  core/                  # pure domain services (decoding, normalization, pagination)
    pagination.js
    text-normalizer.js
    text-source.js
  ui/
    reader.js            # reader component factory (exports `createReader`)
    toolbar.js           # toolbar component (dispatches reader actions)
    notifications.js     # notification sink listening for `app:notify`
    toc.js               # table-of-contents drawer reacting to reader events
  utils/
    alpine.js            # helper to resolve Alpine component data
    dom.js               # safe event dispatcher
    storage.js           # safe localStorage helpers
    pagination-dom.js    # DOM helpers consumed by pagination service
```

The main document (`index.html`) loads `js/app.js` as an ES module. The module keeps a `window.bookReader = createReader` export to retain compatibility with tests and automation scripts.

## Event contracts

Toolbar and reader components communicate exclusively through DOM-scoped custom events:

| Event name | Payload | Emitted by | Consumed by | Purpose |
|------------|---------|------------|-------------|---------|
| `reader:load-requested` | `{ url, provider, encoding }` | Toolbar | Reader | Start loading from URL |
| `reader:file-selected` | `{ file, provider, encoding }` | Toolbar | Reader | Load from local file |
| `reader:provider-encoding-changed` | `{ provider, encoding }` | Toolbar | Reader | Re-run decoder when provider or encoding switches |
| `reader:font-size-set` | `{ value }` | Toolbar | Reader | Adjust typography slider |
| `reader:theme-set` | `{ value }` | Toolbar | Reader | Apply theme selection |
| `reader:tocUpdated` | `{ bookTitle, headings: string[], entries: Array<{ id, text, level }> }` | Reader | Any listener | TOC snapshot changed |
| `reader:goto-heading` | `{ id }` | TOC component | Reader | Request navigation to a heading |
| `app:notify` | `{ level?: 'info' | 'error', message: string }` | Reader | Notifications | Surface user-facing messages |

Events bubble, so listeners can be attached to the root shell (`body`) when integrating with custom wrappers.

## Removed globals

* Inline handlers (`@click`, `@change`) and DOM lookups (`document.getElementById('filePicker')`) have been replaced with Alpine factories.
* Page padding slider and fit-height toggle were removed – typography settings are now fixed in `constants.js`.

## Testing

`npm test` runs the Puppeteer suite and core service checks. The harness lives in `tests/helpers/harness.js` and now writes temporary HTML fixtures to `tests/.tmp/`. The directory is git-ignored but safe to delete if needed. Pure service assertions reside in `tests/core-modules.test.js`.
