import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNoteLinkResolver } from '../../frontend/src/lib/library-links.mjs';

test('buildNoteLinkResolver resolves full relative paths, filenames and extensions', () => {
  const notes = [
    { id: '111', title: 'overview', path: '01-getting-started/overview' },
    { id: '222', title: 'account-and-login', path: '01-getting-started/account-and-login' },
    { id: '333', title: 'course-structure', path: '02-instructor-guide/course-structure' },
    { id: '444', title: 'README', path: 'README' },
    { id: '555', title: 'تعریف ۱.۱ اعداد مختلط C', path: '02-فصل اول/01-فضاهای عددی/تعریف ۱.۱ اعداد مختلط C' },
  ];

  const resolver = buildNoteLinkResolver(notes, '/shared/TOKEN?note=', 'README');

  // Full relative path with .md
  assert.equal(resolver('01-getting-started/overview.md'), '/shared/TOKEN?note=111');
  // Full relative path without .md
  assert.equal(resolver('01-getting-started/overview'), '/shared/TOKEN?note=111');
  // Leading ./
  assert.equal(resolver('./01-getting-started/account-and-login.md'), '/shared/TOKEN?note=222');
  // Basename with .md
  assert.equal(resolver('account-and-login.md'), '/shared/TOKEN?note=222');
  // Basename without .md
  assert.equal(resolver('course-structure'), '/shared/TOKEN?note=333');
  // With anchor
  assert.equal(resolver('01-getting-started/overview.md#مقدمه'), '/shared/TOKEN?note=111#%D9%85%D9%82%D8%AF%D9%85%D9%87');
  // Persian note title
  assert.equal(resolver('تعریف ۱.۱ اعداد مختلط C'), '/shared/TOKEN?note=555');
  assert.equal(resolver('تعریف ۱.۱ اعداد مختلط C.md'), '/shared/TOKEN?note=555');
  // URL encoded Persian link
  assert.equal(resolver(encodeURIComponent('تعریف ۱.۱ اعداد مختلط C.md')), '/shared/TOKEN?note=555');

  // External URLs are not resolved (returns null)
  assert.equal(resolver('https://github.com/foo/bar'), null);
  assert.equal(resolver('mailto:test@example.com'), null);
  // Pure on-page anchor returns null (leaves anchor intact)
  assert.equal(resolver('#section-1'), null);
});

test('buildNoteLinkResolver resolves relative sibling and parent links', () => {
  const notes = [
    { id: '111', title: 'overview', path: '01-getting-started/overview' },
    { id: '222', title: 'account-and-login', path: '01-getting-started/account-and-login' },
    { id: '333', title: 'course-structure', path: '02-instructor-guide/course-structure' },
  ];

  // Current note is in 01-getting-started/overview
  const resolver = buildNoteLinkResolver(notes, '/shared/TOKEN?note=', '01-getting-started/overview');

  // Sibling note in same folder
  assert.equal(resolver('account-and-login.md'), '/shared/TOKEN?note=222');
  assert.equal(resolver('./account-and-login.md'), '/shared/TOKEN?note=222');

  // Parent relative path to other folder
  assert.equal(resolver('../02-instructor-guide/course-structure.md'), '/shared/TOKEN?note=333');
});
