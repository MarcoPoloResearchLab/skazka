// @ts-check

export const NUMBERS = Object.freeze({
  PAGE_PADDING_PX: 48,
  PAGE_TURN_ANIMATION_MS: 450,
  STRUCTURAL_MARGIN_PX: 24,
});

export const EVENTS = Object.freeze({
  NOTIFY: 'app:notify',
  TOC_UPDATED: 'reader:tocUpdated',
  GOTO_HEADING: 'reader:goto-heading',
  REGISTER_READER: 'app:register-reader',
  LOAD_FROM_URL: 'reader:load-requested',
  FILE_SELECTED: 'reader:file-selected',
  FONT_SIZE_SET: 'reader:font-size-set',
  THEME_SET: 'reader:theme-set',
  PROVIDER_ENCODING_CHANGED: 'reader:provider-encoding-changed',
});

export const STRINGS = Object.freeze({
  tocButton: 'TOC',
  tocDrawerTitle: 'Contents',
  loadButton: 'Load',
  chooseFileButton: 'Choose .txt',
  urlLabel: 'URL',
  urlPlaceholder: 'https://.../book.txt',
  providerLabel: 'Provider',
  encodingLabel: 'Encoding',
  providerOptions: [
    { value: 'auto', label: 'Auto' },
    { value: 'libru', label: 'Lib.ru' },
    { value: 'gutenberg', label: 'Gutenberg' },
    { value: 'plain', label: 'Plain' },
  ],
  encodingOptions: [
    { value: 'auto', label: 'auto' },
    { value: 'utf-8', label: 'utf-8' },
    { value: 'windows-1251', label: 'windows-1251' },
    { value: 'koi8-r', label: 'koi8-r' },
    { value: 'iso-8859-5', label: 'iso-8859-5' },
  ],
  fontIconLabel: 'Font size',
  themeIconLabel: 'Theme',
  prevButtonTitle: 'Previous page',
  nextButtonTitle: 'Next page',
  fetchError: 'Fetch failed (maybe CORS). Download the file and use Choose .txt.',
  unexpectedError: 'Unexpected error while loading the book.',
  loadInstructions: 'Choose provider/encoding, then load a .txt from URL or disk.',
  tocEmptyMessage: 'Load a text file to see the table of contents.',
});
