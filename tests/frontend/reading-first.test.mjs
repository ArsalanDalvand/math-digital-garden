import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../frontend/src/' + path, import.meta.url), 'utf8');
test('home offers one study action and a real GET catalogue search', () => {
  const home = read('pages/index.astro');
  assert.match(home, /class="garden-primary"[^>]*href="\/sample"/);
  assert.equal((home.match(/class="garden-primary"/g) || []).length, 1);
  assert.match(home, /<form[^>]*action="\/search"[^>]*role="search"/);
  assert.match(home, /name="q"/);
});
test('personal actions are visible and assistant uses an immediately loaded runtime', () => {
  const workspace=read('components/WorkspaceNote.astro');
  assert.match(workspace,/class="workspace-toolbar"/);
  assert.doesNotMatch(workspace,/<details[^>]*data-od-id="personal-tools"/);
  assert.match(workspace,/role="status"[^>]*data-save-status/);
  assert.match(read('components/Tutor.astro'),/<StudyAssistant[^>]*client:load/);
});
test('shared reader styles bind neutral tokens, touch sizes and dark mode', () => {
  const css = read('styles/custom.css');
  for (const token of ['bg','surface','fg','muted','border','accent']) assert.match(css, new RegExp('--'+token+':\\s*oklch\\('));
  assert.match(css, /\[data-theme='dark'\]/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /--sl-color-bg:\s*var\(--bg\)/);
  assert.match(css, /\.garden-guide/);
  assert.match(css, /:focus-visible/);
});
