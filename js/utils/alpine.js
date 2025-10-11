// @ts-check

/**
 * Resolve the Alpine component data object for a given element.
 * Compatible with Alpine v3 data stack internals.
 * @param {HTMLElement | null} element
 * @returns {Record<string, unknown> | null}
 */
export function resolveComponentData(element) {
  if (!element) {
    return null;
  }

  const alpine = window.Alpine || null;
  if (alpine && typeof alpine.$data === 'function') {
    try {
      return alpine.$data(element);
    } catch (error) {
      // fall back to data stack access
    }
  }

  const stack = /** @type {any} */ (element)._x_dataStack;
  if (Array.isArray(stack) && stack.length > 0) {
    return /** @type {Record<string, unknown>} */ (stack[0]);
  }

  return null;
}

