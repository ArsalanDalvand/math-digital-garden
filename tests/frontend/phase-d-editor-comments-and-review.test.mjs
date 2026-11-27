import assert from 'node:assert/strict';
import test from 'node:test';

test('editor-sync detects stale canonical base, diff summary, and body word/char stats', async () => {
  const { detectRebaseNeeded, summarizeDiffStats, countWordsAndChars } = await import(
    '../../frontend/src/lib/editor-sync.mjs'
  );

  assert.deepEqual(detectRebaseNeeded(null, false), { needed: false });
  assert.deepEqual(
    detectRebaseNeeded(
      { canonical: { current_hash: 'h2' }, fork: { base_hash: 'h1' } },
      true,
    ),
    { needed: false },
  );
  assert.deepEqual(
    detectRebaseNeeded(
      { canonical: { current_hash: 'h1' }, fork: null },
      false,
    ),
    { needed: false },
  );
  assert.deepEqual(
    detectRebaseNeeded(
      { canonical: { current_hash: 'h1' }, fork: { base_hash: 'h1' } },
      false,
    ),
    { needed: false },
  );
  assert.deepEqual(
    detectRebaseNeeded(
      { canonical: { current_hash: 'h2' }, fork: { base_hash: 'h1' } },
      false,
    ),
    { needed: true, canonicalHash: 'h2', baseHash: 'h1' },
  );

  assert.deepEqual(summarizeDiffStats('یک\nدو', 'یک\nدو'), { added: 0, removed: 0, changed: false });
  assert.deepEqual(summarizeDiffStats('یک\nدو', 'یک\nسه\nچهار'), {
    added: 2,
    removed: 1,
    changed: true,
  });

  const md = '---\ntitle: تست\ntags: [math]\n---\nسلام $x^2$ دنیا';
  assert.deepEqual(countWordsAndChars(md), {
    words: 3,
    chars: 'سلام $x^2$ دنیا'.length,
  });
});

test('comment-render supports KaTeX formulas, escapes XSS payloads, handles deleted state, and filters threads', async () => {
  const { renderCommentHtml, filterCommentThreads } = await import(
    '../../frontend/src/lib/comment-render.mjs'
  );

  const deletedHtml = renderCommentHtml('[deleted]');
  assert.match(deletedHtml, /comment-deleted/);
  assert.match(deletedHtml, /حذف شده است/);

  const rich = renderCommentHtml(
    'سلام $x^2 + 1$\nخط دوم\n\n$$\\det(A)=0$$\n\n<script>alert(1)</script><img src=x onerror=alert(2)>',
  );
  assert.match(rich, /class="katex"/);
  assert.match(rich, /class="comment-display-math"/);
  assert.match(rich, /<br\s*\/>/);
  assert.doesNotMatch(rich, /<script/i);
  assert.doesNotMatch(rich, /<img/i);
  assert.match(rich, /&lt;script&gt;/);

  const threads = [
    { id: '1', resolved: false, replies: [] },
    { id: '2', resolved: true, replies: [] },
    { id: '3', resolved: false, replies: [] },
  ];
  const all = filterCommentThreads(threads, 'all');
  const open = filterCommentThreads(threads, 'open');
  const resolved = filterCommentThreads(threads, 'resolved');
  assert.equal(all.items.length, 3);
  assert.equal(open.items.length, 2);
  assert.equal(resolved.items.length, 1);
  assert.deepEqual(all.counts, { all: 3, open: 2, resolved: 1 });
});

test('format-size formats Persian byte units, attachment kind, and Markdown links safely', async () => {
  const { formatFileSize, attachmentMarkdownLink, attachmentKind } = await import(
    '../../frontend/src/lib/format-size.mjs'
  );

  assert.match(formatFileSize(512), /۵۱۲ بایت/);
  assert.match(formatFileSize(2048), /۲/);
  assert.match(formatFileSize(2048), /کیلوبایت/);
  assert.match(formatFileSize(2_500_000), /مگابایت/);

  assert.equal(attachmentKind('diagram.png'), 'image');
  assert.equal(attachmentKind('proof.PDF'), 'pdf');
  assert.equal(attachmentKind('notes.zip'), 'archive');
  assert.equal(attachmentKind('data.csv'), 'file');

  assert.equal(
    attachmentMarkdownLink('graph[1].png', '/api/library/attachments/123'),
    '![graph\\[1\\].png](/api/library/attachments/123)',
  );
  assert.equal(
    attachmentMarkdownLink('handout (1).pdf', '/api/library/attachments/123'),
    '[handout (1).pdf](/api/library/attachments/123)',
  );
});

test('review-filter searches across title, slug, author_name, and student_comment without mutating input', async () => {
  const { filterReviewProposals } = await import('../../frontend/src/lib/review-filter.mjs');

  const source = [
    {
      id: '1',
      slug: 'cantor',
      title: 'لم کانتور',
      author_name: 'سارا رضایی',
      student_comment: 'اصلاح فرمول',
      status: 'pending',
    },
    {
      id: '2',
      slug: 'matrix',
      title: 'ماتریس معکوس',
      author_name: 'علی نادری',
      student_comment: 'افزودن مثال دترمینان',
      status: 'approved',
    },
  ];
  const snapshot = JSON.stringify(source);

  const byAuthor = filterReviewProposals(source, 'سارا', 'all');
  assert.equal(byAuthor.items.length, 1);
  assert.equal(byAuthor.items[0].id, '1');

  const byStatus = filterReviewProposals(source, '', 'approved');
  assert.equal(byStatus.items.length, 1);
  assert.equal(byStatus.items[0].id, '2');
  assert.deepEqual(byStatus.counts, {
    all: 2,
    pending: 1,
    approved: 1,
    changes_requested: 0,
    rejected: 0,
  });
  assert.equal(JSON.stringify(source), snapshot);
});

test('editor-commands callout wraps selection with CRLF preservation and rejects code context', async () => {
  const { commandChanges } = await import('../../frontend/src/lib/editor-commands.mjs');

  const doc = 'قبل\r\nقضیه اول\r\nبعد';
  const from = doc.indexOf('قضیه');
  const to = from + 'قضیه اول'.length;
  const edit = commandChanges(doc, from, to, 'callout');
  assert.ok(edit);
  const result = doc.slice(0, edit.changes.from) + edit.changes.insert + doc.slice(edit.changes.to);
  assert.equal(result, 'قبل\r\n> [!note]\r\n> قضیه اول\r\nبعد');

  assert.equal(commandChanges('x = 1', 0, 5, 'callout', { inCode: true }), null);
});

test('api-errors maps 409 fork/rebase conflict details to Persian guidance', async () => {
  const { formatApiError } = await import('../../frontend/src/lib/api-errors.mjs');

  assert.match(formatApiError(409, 'Content changed; reload before saving'), /تغییر کرده/);
  assert.match(formatApiError(409, 'Personal or canonical version changed'), /تغییر کرده/);
});
