// @ts-check

import { EVENTS, STRINGS } from '../constants.js';
import { dispatchEvent } from '../utils/dom.js';

const THEME_OPTIONS = Object.freeze([
  { value: 'light', label: 'Light' },
  { value: 'sepia', label: 'Sepia' },
  { value: 'dark', label: 'Dark' },
]);

export function createToolbar(){
  return {
    provider: 'auto',
    encoding: 'auto',
    loadUrl: '',
    fontSize: 18,
    theme: 'light',
    providerOptions: STRINGS.providerOptions,
    encodingOptions: STRINGS.encodingOptions,
    themeOptions: THEME_OPTIONS,
    init(){},
    handleProviderChange(event){
      this.provider = event.target.value;
      this.emitProviderEncodingChange();
    },
    handleEncodingChange(event){
      this.encoding = event.target.value;
      this.emitProviderEncodingChange();
    },
    emitProviderEncodingChange(){
      dispatchEvent(this.$el, EVENTS.PROVIDER_ENCODING_CHANGED, {
        provider: this.provider,
        encoding: this.encoding,
      });
    },
    handleUrlInput(event){
      this.loadUrl = event.target.value || '';
    },
    handleLoadButtonClick(){
      const trimmed = this.loadUrl.trim();
      if (!trimmed) {
        return;
      }
      dispatchEvent(this.$el, EVENTS.LOAD_FROM_URL, {
        url: trimmed,
        provider: this.provider,
        encoding: this.encoding,
      });
    },
    triggerFileDialog(){
      if (this.$refs && this.$refs.fileInput){
        this.$refs.fileInput.click();
      }
    },
    handleFileChange(event){
      const input = event.target;
      if (!input.files || input.files.length === 0){
        return;
      }
      const file = input.files[0];
      dispatchEvent(this.$el, EVENTS.FILE_SELECTED, {
        file,
        provider: this.provider,
        encoding: this.encoding,
      });
      input.value = '';
    },
    handleFontSizeInput(event){
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) {
        return;
      }
      this.fontSize = value;
      dispatchEvent(this.$el, EVENTS.FONT_SIZE_SET, { value });
    },
    handleThemeChange(event){
      const value = event.target.value;
      this.theme = value;
      dispatchEvent(this.$el, EVENTS.THEME_SET, { value });
    }
  };
}
