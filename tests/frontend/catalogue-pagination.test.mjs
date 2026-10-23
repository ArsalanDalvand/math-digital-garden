import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateCatalogue, cataloguePageHref } from '../../frontend/src/lib/catalogue-pagination.mjs';

test('catalogue pagination bounds page and preserves input without mutation', () => {
  const notes = Array.from({length: 51}, (_, id) => ({id}));
  const result = paginateCatalogue(notes, '2');
  assert.equal(result.page, 2);
  assert.equal(result.pages, 3);
  assert.equal(result.total, 51);
  assert.equal(result.items.length, 24);
  assert.equal(result.items[0], notes[24]);
  assert.equal(notes.length, 51);
  for (const invalid of ['-1', 'bad', '1.5', '']) assert.equal(paginateCatalogue(notes, invalid).page, 1);
  assert.equal(paginateCatalogue(notes, '999').page, 3);
  assert.equal(paginateCatalogue([], '8').page, 1);
  assert.equal(paginateCatalogue([], '8').pages, 1);
});
test('pagination links retain Persian search and tags safely', () => {
  const url = new URL(cataloguePageHref('حد & تابع', 'قضیه', 2), 'http://localhost');
  assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('q'), 'حد & تابع');
  assert.equal(url.searchParams.get('tag'), 'قضیه');
  assert.equal(url.searchParams.get('page'), '2');
});
