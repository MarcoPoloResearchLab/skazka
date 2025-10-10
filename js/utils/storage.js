// @ts-check

/**
 * @param {string} key
 * @param {string} value
 */
export function setItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // ignore storage errors (e.g., quota exceeded, private mode)
  }
}

/**
 * @param {string} key
 * @returns {string|null}
 */
export function getItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

