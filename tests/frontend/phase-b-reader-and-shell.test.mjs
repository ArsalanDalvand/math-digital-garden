import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePipesInTableWikilinks,
  buildKnowledgeIndex,
  renderSingleNote,
} from '../../frontend/src/lib/markdown.mjs';
import { renderInlineMathHtml, filterDisplayTags } from '../../frontend/src/lib/inline-katex.mjs';
import { folderTree } from '../../frontend/src/lib/folder-tree.mjs';
import { findNoteNeighbors } from '../../frontend/src/lib/note-pager.mjs';

describe('Phase B Pure Helpers (Strict TDD)', () => {
  describe('1. GFM Table Wikilink Escaping & Rendering', () => {
    it('escapes unescaped pipes inside [[...]] on GFM table rows without touching prose or code', () => {
      const input = [
        'پاراگراف عادی با [[note-a|عنوان عادی]] در متن.',
        '',
        '| ردیف | یادداشت | بخش | توضیح |',
        '| :---: | --- | --- | --- |',
        '| **۱** | [[01-پیش‌نیازها/05-اعداد مختلط|اعداد مختلط از صفر تا صد]] | [[other#بخش یک|متن بخش]] | متن بعد |',
        '| **۲** | [[already-escaped\\|تست]] | `[[inside-code|ignored]]` | پایان |',
        '',
        '```markdown',
        '| col | [[in-fence|ignored]] |',
        '| --- | --- |',
        '```',
      ].join('\n');

      const out = escapePipesInTableWikilinks(input);
      assert.match(out, /پاراگراف عادی با \[\[note-a\|عنوان عادی\]\] در متن\./);
      assert.match(out, /\[\[01-پیش‌نیازها\/05-اعداد مختلط\\\|اعداد مختلط از صفر تا صد\]\]/);
      assert.match(out, /\[\[other#بخش یک\\\|متن بخش\]\]/);
      assert.match(out, /\[\[already-escaped\\\|تست\]\]/);
      assert.match(out, /`\[\[inside-code\|ignored\]\]`/);
      assert.match(out, /\| col \| \[\[in-fence\|ignored\]\] \|/);
    });

    it('escapes [[...|...]] across ALL subsequent table rows even when earlier rows contain inline backticks', () => {
      const input = [
        '| ردیف | درس | نوع |',
        '| :---: | --- | --- |',
        '| **۱** | [[01-foo/01-a|اول]] | `graphing` |',
        '| **۲** | [[01-foo/02-b|دوم]] | `graphing` |',
        '| **۳** | [[01-foo/03-c|سوم]] | `3d` |',
      ].join('\n');

      const out = escapePipesInTableWikilinks(input);
      assert.match(out, /\[\[01-foo\/01-a\\\|اول\]\]/);
      assert.match(out, /\[\[01-foo\/02-b\\\|دوم\]\]/);
      assert.match(out, /\[\[01-foo\/03-c\\\|سوم\]\]/);
    });

    it('renders wikilinks with | aliases inside GFM tables as clickable links inside single cells', async () => {
      const notes = [
        {
          slug: 'roadmap',
          title: 'نقشه راه',
          relative_path: 'axler-linear-algebra-done-right/00-roadmap.md',
          current_content: [
            '# نقشه راه',
            '',
            '| شماره | عنوان درس | منبع دقیق | وضعیت |',
            '| :---: | --- | --- | --- |',
            '| **۱** | [[01-پیش‌نیازها و یادآوری دبیرستان/05-اعداد مختلط از صفر تا صد|اعداد مختلط از صفر تا صد]] | [[other#بخش یک|بخش اول]] | تکمیل‌شده |',
          ].join('\n'),
        },
        {
          slug: 'complex-05',
          title: 'اعداد مختلط از صفر تا صد',
          relative_path: 'axler-linear-algebra-done-right/01-پیش‌نیازها و یادآوری دبیرستان/05-اعداد مختلط از صفر تا صد.md',
          current_content: '# اعداد مختلط\n\nتعریف $\\mathbb{C}$.',
        },
        {
          slug: 'other',
          title: 'یادداشت دیگر',
          relative_path: 'axler-linear-algebra-done-right/other.md',
          current_content: '# یادداشت دیگر\n\n## بخش یک\n\nمحتوا.',
        },
      ];

      const index = await buildKnowledgeIndex(notes);
      const rendered = await renderSingleNote(index.bySlug.get('roadmap'), index);

      assert.doesNotMatch(rendered.html, /\[\[01-/);
      assert.match(rendered.html, /<a href="\/notes\/complex-05" class="wiki-link" data-note-preview="complex-05">اعداد مختلط از صفر تا صد<\/a>/);
      assert.match(rendered.html, /<a href="\/notes\/other#بخش-یک" class="wiki-link" data-note-preview="other">بخش اول<\/a>/);
      // Should keep exact 4 cells inside the data row (not split into 5+ cells)
      const tbodyMatch = rendered.html.match(/<tbody>\s*<tr>([\s\S]*?)<\/tr>\s*<\/tbody>/);
      assert.ok(tbodyMatch, 'table row should exist in tbody');
      const tdCount = (tbodyMatch[1].match(/<td(?:\s|>)/g) || []).length;
      assert.equal(tdCount, 4);
    });
  });

  describe('2. Inline KaTeX Slogans & Tag Filtering', () => {
    it('renders inline $...$ formulas inside slogans with KaTeX and safely escapes HTML', () => {
      const html = renderInlineMathHtml('فضای برداری $V$ روی میدان $\\mathbb{F}$ <script>alert(1)</script> با شرط $a < b$');
      assert.match(html, /<span class="katex">/);
      assert.doesNotMatch(html, /\$V\$/);
      assert.doesNotMatch(html, /\$\\mathbb\{F\}\$/);
      assert.doesNotMatch(html, /<script>/);
      assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.match(html, /فضای برداری /);
    });

    it('preserves escaped dollar signs instead of opening math mode', () => {
      const html = renderInlineMathHtml('هزینه \\$100 و فرمول $x^2$ است.');
      assert.match(html, /\$100/);
      assert.match(html, /<span class="katex">/);
    });

    it('filters out internal status workflow tags while preserving topic tags', () => {
      const filtered = filterDisplayTags([
        'linear-algebra',
        'status/ready',
        'status/draft',
        'status-review',
        'axler',
        'status/canonical',
      ]);
      assert.deepEqual(filtered, ['linear-algebra', 'axler']);
    });
  });

  describe('3. Localized Book Titles & Folder Note Counts', () => {
    it('localizes abstract-algebra-and-matrices and annotates recursive folder counts', () => {
      const tree = folderTree([
        {
          slug: 'n1',
          title: 'گروه‌ها',
          relative_path: 'abstract-algebra-and-matrices/01-groups/01-groups.md',
        },
        {
          slug: 'n2',
          title: 'ماتریس‌ها',
          relative_path: 'abstract-algebra-and-matrices/02-matrices/01-matrices.md',
        },
        {
          slug: 'n3',
          title: 'فضای برداری',
          relative_path: 'axler-linear-algebra-done-right/01-vector-spaces/01-def.md',
        },
      ]);

      const abstractFolder = tree.find((f) => f.label === 'جبر مجرد و ماتریس‌ها');
      const axlerFolder = tree.find((f) => f.label === 'جبر خطی آکسلر');
      assert.ok(abstractFolder, 'abstract-algebra-and-matrices should have Persian label');
      assert.ok(axlerFolder, 'axler should have Persian label');
      assert.equal(abstractFolder.count, 2);
      assert.equal(axlerFolder.count, 1);
      assert.equal(abstractFolder.items[0].count, 1);
    });
  });

  describe('4. Prev/Next Note Pager Traversal', () => {
    it('finds previous and next notes within the current book sequence', () => {
      const tree = folderTree([
        { slug: 'a-1', title: '۱. تعریف گروه', relative_path: 'abstract-algebra-and-matrices/01/01.md' },
        { slug: 'a-2', title: '۲. زیرگروه', relative_path: 'abstract-algebra-and-matrices/01/02.md' },
        { slug: 'a-3', title: '۳. همومورفیسم', relative_path: 'abstract-algebra-and-matrices/02/01.md' },
        { slug: 'x-1', title: 'آکسلر ۱', relative_path: 'axler/01/01.md' },
      ]);

      const first = findNoteNeighbors(tree, 'a-1');
      assert.equal(first.prev, null);
      assert.equal(first.next?.slug, 'a-2');
      assert.equal(first.bookLabel, 'جبر مجرد و ماتریس‌ها');
      assert.equal(first.index, 0);
      assert.equal(first.total, 3);

      const middle = findNoteNeighbors(tree, 'a-2');
      assert.equal(middle.prev?.slug, 'a-1');
      assert.equal(middle.next?.slug, 'a-3');

      const last = findNoteNeighbors(tree, 'a-3');
      assert.equal(last.prev?.slug, 'a-2');
      assert.equal(last.next, null);

      const missing = findNoteNeighbors(tree, 'does-not-exist');
      assert.equal(missing.prev, null);
      assert.equal(missing.next, null);
      assert.equal(missing.total, 0);
    });
  });
});
