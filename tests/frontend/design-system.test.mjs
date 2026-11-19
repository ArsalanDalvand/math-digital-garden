import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
test('shared component system is bound to reader CSS with paired semantic themes and reduced motion', () => {
  const css = readFileSync(new URL('frontend/src/styles/custom.css', root), 'utf8');
  assert.match(css, /@import ['"]\.\/garden-system\.css['"]/);
  const system = readFileSync(new URL('frontend/src/styles/garden-system.css', root), 'utf8');
  for (const token of ['control-border', 'success', 'success-surface', 'danger', 'danger-surface', 'warning', 'warning-surface', 'space-4', 'radius-control', 'reading-width']) {
    assert.match(system, new RegExp('--' + token + ':'));
  }
  assert.match(system, /data-theme='dark'/);
  assert.match(system, /prefers-reduced-motion/);
  assert.match(system, /\.garden-button-primary:hover/);
  assert.match(system, /:focus-visible/);
  assert.match(system, /aria-invalid='true'/);
});

test('Persian tables keep table layout, RTL column order and direction-aware alignment', () => {
  const css = readFileSync(new URL('frontend/src/styles/custom.css', root), 'utf8');
  const table = css.slice(css.indexOf('Tables: RTL-correct'));
  assert.ok(table.length > 0, 'table styling section must exist');
  // Regression: `display:block` on a table collapses column assignment and
  // transposes columns in RTL, which is what broke the live site.
  assert.doesNotMatch(table, /\.note table[^{}]*\{[^}]*display:\s*block/);
  assert.match(table, /\.note table\s*\{[^}]*display:\s*table/);
  assert.match(table, /\.note table\s*\{[^}]*direction:\s*rtl/);
  // Alignment attributes must map to logical edges, never physical left in RTL.
  assert.match(table, /\[align='right'\][^{}]*\{[^}]*text-align:\s*end/);
  assert.match(table, /\[align='left'\][^{}]*\{[^}]*text-align:\s*start/);
  assert.match(table, /\[align='center'\][^{}]*\{[^}]*text-align:\s*center/);
  // The scroll wrapper is the only thing allowed to scroll wide tables.
  assert.match(table, /\.note \.table-scroll\s*\{[^}]*overflow-x:\s*auto/);
  // Persian-first typography.
  assert.match(table, /\.note th, \.note td\s*\{[^}]*padding:/);
  assert.match(table, /var\(--font-reading\)/);
});

