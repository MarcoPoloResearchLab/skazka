// @ts-check

/**
 * Dispatch a bubbling custom event with optional detail payload.
 * @param {EventTarget} target
 * @param {string} name
 * @param {unknown} detail
 * @param {{ bubbles?: boolean }} [options]
 */
export function dispatchEvent(target, name, detail = undefined, options = {}) {
  if (!target || typeof target.dispatchEvent !== 'function') {
    return;
  }
  const { bubbles = true } = options;
  const event = new CustomEvent(name, { bubbles, detail });
  target.dispatchEvent(event);
}

