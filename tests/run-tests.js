// @ts-check

const fs = require('fs');
const path = require('path');

async function run() {
  const testsDir = __dirname;
  const entries = fs.readdirSync(testsDir);
  const testFiles = entries.filter((entry) => entry.endsWith('.test.js'));

  for (const file of testFiles) {
    const testPath = path.join(testsDir, file);
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const runSuite = require(testPath);
    if (typeof runSuite !== 'function') {
      throw new Error(`Test file ${file} must export a function.`);
    }
    await runSuite();
  }

  process.stdout.write(`✔ ${testFiles.length} test file(s) passed\\n`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

