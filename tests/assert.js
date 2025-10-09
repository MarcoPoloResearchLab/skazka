// @ts-check

const assert = require('assert');

/**
 * @template T
 * @param {T} actual
 * @param {T} expected
 * @param {string} message
 */
function assertEqual(actual, expected, message = 'Expected values to be strictly equal') {
  assert.strictEqual(actual, expected, message);
}

/**
 * @param {unknown} actual
 * @param {unknown} expected
 * @param {string} message
 */
function assertDeepEqual(actual, expected, message = 'Expected values to be deeply equal') {
  assert.deepStrictEqual(actual, expected, message);
}

/**
 * @param {() => unknown | Promise<unknown>} fn
 * @param {RegExp | string} expected
 * @param {string} message
 */
async function assertThrows(fn, expected, message = 'Expected function to throw') {
  let caught = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  if (!caught) {
    throw new assert.AssertionError({ message });
  }
  if (expected instanceof RegExp) {
    assert.match(String(caught.message || caught), expected, message);
  } else {
    assert.strictEqual(String(caught.message || caught), expected, message);
  }
}

module.exports = {
  assertEqual,
  assertDeepEqual,
  assertThrows,
};

