import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../../frontend/src/pages/search.astro', import.meta.url), 'utf8');
test('catalogue offers accessible result regions, recoverable errors and reset', () => {
  assert.match(page, /data-od-id="catalogue-search"/);
  assert.match(page, /data-od-id="search-results"/);
  assert.match(page, /data-od-id="search-retry"/);
  assert.match(page, /data-od-id="search-reset"/);
  assert.match(page, /aria-describedby="search-help"/);
  assert.match(page, /note-summary/);
});
test('selected tag is retained even when query yields no matching tag', () => {
  assert.match(page, /new Set\(\[.*tag/s);
});
test('mobile header uses a single compact discovery link with a full touch target', () => {
  const search = readFileSync(new URL('../../frontend/src/components/Search.astro', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../frontend/src/styles/custom.css', import.meta.url), 'utf8');
  assert.match(search, /class="garden-search-mobile"/);
  assert.match(css, /starlight-menu-button button[\s\S]*min-inline-size: 44px/);
});
