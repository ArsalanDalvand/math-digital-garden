/**
 * Unified runner for all real-browser E2E test suites.
 * Target: https://test.atomathix.ir (or process.env.BASE_URL)
 * Run: node tests/browser/run-all-e2e.mjs
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const suites = [
  'e2e-auth-account.mjs',
  'e2e-reading-navigation.mjs',
  'e2e-editor-writing.mjs',
  'e2e-diagrams-graph.mjs',
  'e2e-search-catalogue.mjs',
  'e2e-library-git-sharing.mjs',
];

let failed = 0;
for (const suite of suites) {
  console.log(`\n========================================`);
  console.log(`Running E2E suite: ${suite}`);
  console.log(`========================================`);
  try {
    execFileSync(process.execPath, [join(dir, suite)], { stdio: 'inherit', env: process.env });
  } catch {
    failed++;
    console.error(`[FAIL] Suite failed: ${suite}`);
  }
}

console.log(`\n========================================`);
console.log(`E2E Summary: ${suites.length - failed}/${suites.length} suites passed.`);
console.log(`========================================`);
if (failed > 0) process.exit(1);
