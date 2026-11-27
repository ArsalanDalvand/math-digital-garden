import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluatePasswordPolicy,
  mergeReadingStorage,
  roleLabel,
} from '../../frontend/src/lib/account-helpers.mjs';
import {
  describeVisibility,
  filterAndSortLibraryRows,
  libraryEmptyCopy,
  normalizeLibraryText,
  validateZipImportFile,
} from '../../frontend/src/lib/library-browser-model.mjs';

test('normalizeLibraryText unifies Persian/Arabic letters, digits, diacritics, and case', () => {
  assert.equal(normalizeLibraryText('  جبر خطي و ماتريس‌ها ۱۲۳  '), 'جبر خطی و ماتریسها 123');
  assert.equal(normalizeLibraryText('كَتابِ أَوَّل'), 'کتاب اول');
  assert.equal(normalizeLibraryText(''), '');
  assert.equal(normalizeLibraryText(null), '');
});

test('filterAndSortLibraryRows orders folders first cleanly and filters normalized Persian text', () => {
  const rows = [
    { kind: 'note', title: 'یادداشت اول', source: 'personal' },
    { kind: 'folder', title: 'پوشهٔ جبر', source: 'personal', git_repo_url: 'https://github.com/u/algebra' },
    { kind: 'note', title: 'تمرین ٢', source: 'personal' },
    { kind: 'folder', title: 'آنالیز حقیقی', source: 'public' },
  ];

  const all = filterAndSortLibraryRows(rows, '');
  assert.equal(all.totalCount, 4);
  assert.equal(all.filteredCount, 4);
  assert.deepEqual(
    all.rows.map((r) => `${r.kind}:${r.title}`),
    ['folder:آنالیز حقیقی', 'folder:پوشهٔ جبر', 'note:تمرین ٢', 'note:یادداشت اول'],
  );

  const filteredByRepo = filterAndSortLibraryRows(rows, 'ALGEBRA');
  assert.equal(filteredByRepo.filteredCount, 1);
  assert.equal(filteredByRepo.rows[0].title, 'پوشهٔ جبر');

  const filteredArabicKaf = filterAndSortLibraryRows(rows, 'تمرين 2');
  assert.equal(filteredArabicKaf.filteredCount, 1);
  assert.equal(filteredArabicKaf.rows[0].title, 'تمرین ٢');
});

test('describeVisibility maps private, unlisted, public cleanly', () => {
  assert.deepEqual(describeVisibility('private'), {
    visibility: 'private',
    label: 'خصوصی',
    tone: 'neutral',
  });
  assert.deepEqual(describeVisibility('unlisted'), {
    visibility: 'unlisted',
    label: 'پیوند اختصاصی',
    tone: 'accent',
  });
  assert.deepEqual(describeVisibility('public'), {
    visibility: 'public',
    label: 'عمومی',
    tone: 'success',
  });
  assert.deepEqual(describeVisibility(undefined), {
    visibility: 'private',
    label: 'خصوصی',
    tone: 'neutral',
  });
});

test('validateZipImportFile enforces extension, non-empty size, and 50 MiB cap', () => {
  assert.equal(validateZipImportFile({ name: 'notes.tar.gz', size: 1024 }).ok, false);
  assert.equal(validateZipImportFile({ name: 'empty.zip', size: 0 }).ok, false);
  assert.equal(validateZipImportFile({ name: 'huge.zip', size: 51 * 1024 * 1024 }).ok, false);
  assert.equal(validateZipImportFile({ name: 'Math-Vault.ZIP', size: 2048 }).ok, true);
});

test('libraryEmptyCopy produces tailored guest and empty states without leaks', () => {
  const guestFav = libraryEmptyCopy('favorites', {
    authenticated: false,
    hasQuery: false,
    inFolder: false,
  });
  assert.equal(guestFav.ctaHref, '/account');
  assert.match(guestFav.title, /علاقه‌مندی‌ها/);

  const guestTrash = libraryEmptyCopy('trash', {
    authenticated: false,
    hasQuery: false,
    inFolder: false,
  });
  assert.equal(guestTrash.ctaHref, '/account');

  const searchEmpty = libraryEmptyCopy('items', {
    authenticated: true,
    hasQuery: true,
    inFolder: false,
  });
  assert.equal(searchEmpty.action, 'clear-filter');

  const folderEmpty = libraryEmptyCopy('items', {
    authenticated: true,
    hasQuery: false,
    inFolder: true,
  });
  assert.match(folderEmpty.title, /پوشه/);
});

test('evaluatePasswordPolicy checks 12..256 length, confirmation match, and level', () => {
  assert.deepEqual(evaluatePasswordPolicy(''), {
    valid: false,
    length: 0,
    minLength: 12,
    maxLength: 256,
    remaining: 12,
    matchesConfirmation: true,
    level: 'empty',
  });

  const short = evaluatePasswordPolicy('abc123');
  assert.equal(short.valid, false);
  assert.equal(short.remaining, 6);
  assert.equal(short.level, 'short');

  const good = evaluatePasswordPolicy('twelvechars1', 'twelvechars1');
  assert.equal(good.valid, true);
  assert.equal(good.remaining, 0);
  assert.equal(good.matchesConfirmation, true);
  assert.equal(good.level, 'good');

  const mismatch = evaluatePasswordPolicy('StrongPassphrase#2026', 'other');
  assert.equal(mismatch.valid, true);
  assert.equal(mismatch.matchesConfirmation, false);
  assert.equal(mismatch.level, 'strong');
});

test('roleLabel translates known roles safely', () => {
  assert.equal(roleLabel('student'), 'دانشجو');
  assert.equal(roleLabel('author'), 'نویسنده');
  assert.equal(roleLabel('admin'), 'مدیر');
  assert.equal(roleLabel('guest'), 'عضو');
});

test('mergeReadingStorage preserves local mathScale while syncing server reading prefs', () => {
  const merged = mergeReadingStorage(JSON.stringify({ mathScale: 1.2, size: 17 }), {
    size: 21,
    leading: 2.2,
    width: 960,
    focus: true,
  });
  assert.equal(merged.size, 21);
  assert.equal(merged.leading, 2.2);
  assert.equal(merged.width, 960);
  assert.equal(merged.focus, true);
  assert.equal(merged.mathScale, 1.2);

  const fallback = mergeReadingStorage('{bad-json', {
    size: 19,
    leading: 2,
    width: 760,
    focus: false,
  });
  assert.equal(fallback.mathScale, 1);
});
