import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
test('shared component system is bound to unified token/base/workspace CSS with paired semantic themes and zero --sl-* leakage', () => {
  const app = readFileSync(new URL('frontend/src/styles/app.css', root), 'utf8');
  assert.match(app, /@import ['"]\.\/tokens\.css['"]/);
  assert.match(app, /@import ['"]\.\/base\.css['"]/);
  assert.match(app, /@import ['"]\.\/prose\.css['"]/);
  assert.match(app, /@import ['"]\.\/workspace-shell\.css['"]/);

  const tokens = readFileSync(new URL('frontend/src/styles/tokens.css', root), 'utf8');
  const base = readFileSync(new URL('frontend/src/styles/base.css', root), 'utf8');
  const shell = readFileSync(new URL('frontend/src/styles/workspace-shell.css', root), 'utf8');
  for (const token of ['control-border', 'success', 'success-surface', 'danger', 'danger-surface', 'warning', 'warning-surface', 'space-4', 'radius-control', 'reading-width']) {
    assert.match(tokens, new RegExp('--' + token + ':'));
  }
  assert.doesNotMatch(tokens + base + shell, /--sl-/);
  assert.match(tokens, /data-theme='dark'/);
  assert.match(base, /prefers-reduced-motion/);
  assert.match(shell, /\.garden-button-primary:hover/);
  assert.match(base, /:focus-visible/);
  assert.match(shell, /aria-invalid='true'/);
});

test('Persian tables keep table layout, RTL column order and direction-aware alignment', () => {
  const prose = readFileSync(new URL('frontend/src/styles/prose.css', root), 'utf8');
  const table = prose.slice(prose.indexOf('Tables: RTL-correct'));
  assert.ok(table.length > 0, 'table styling section must exist');
  // Regression: `display:block` on a table collapses column assignment and
  // transposes columns in RTL.
  assert.doesNotMatch(table, /\.note table[^{}]*\{[^}]*display:\s*block/);
  assert.match(table, /\.note table\s*\{[^}]*display:\s*table/);
  assert.match(table, /\.note table\s*\{[^}]*direction:\s*rtl/);
  // Alignment attributes must map to logical edges, never physical left in RTL.
  assert.match(table, /\[align='right'\][^{}]*\{[^}]*text-align:\s*end/);
  assert.match(table, /\[align='left'\][^{}]*\{[^}]*text-align:\s*start/);
  assert.match(table, /\[align='center'\][^{}]*\{[^}]*text-align:\s*center/);
  // The scroll wrapper scrolls wide tables cleanly.
  assert.match(table, /\.note \.table-scroll[\s\S]*overflow-x:\s*auto/);
  // Persian-first typography.
  assert.match(table, /\.note th,\s*\.note td\s*\{[^}]*padding:/);
  assert.match(table, /var\(--font-reading\)/);
});

