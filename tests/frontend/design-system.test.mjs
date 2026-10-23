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

