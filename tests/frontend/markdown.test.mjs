import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderMarkdown } from '../../frontend/src/lib/markdown.mjs';

const raw = await readFile(new URL('../fixtures/cantor.md', import.meta.url), 'utf8');

test('Persian note renders math and collapsed proof without displaying frontmatter', async () => {
  const html = await renderMarkdown(raw);
  assert.match(html, /class="katex"/);
  assert.match(html, /katex-display/);
  assert.match(html, /<details[^>]*data-callout-type="proof"/);
  assert.doesNotMatch(html.match(/<details[^>]*>/)[0], /open/);
  assert.match(html, /<summary/);
  assert.match(html, /ناشمارا/);
  assert.doesNotMatch(html, /tags:|title:/);
  assert.equal(raw, await readFile(new URL('../fixtures/cantor.md', import.meta.url), 'utf8'));
});

test('Raw HTML and unsafe links cannot execute scripts', async () => {
  const html = await renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<script|<img|href="javascript:/i);
});

test('Code fences preserve literal formula delimiters', async () => {
  const html = await renderMarkdown('```latex\n$\\mathbb{R}$\n```');
  assert.match(html, /\$\\mathbb\{R\}\$/);
  assert.doesNotMatch(html, /class="katex"/);
});

test('GFM tables and task lists render without changing code or enabling unsafe links', async () => {
  const source = '| نام | مقدار |\n| --- | ---: |\n| نمونه | $x^2$ |\n\n- [x] انجام شد\n- [ ] باقی مانده\n\n`- [x] literal`\n\n| پیوند |\n| --- |\n| [bad](javascript:alert%281%29) |';
  const html = await renderMarkdown(source);
  assert.match(html, /<table>/);
  assert.match(html, /<th[^>]*>نام<\/th>/);
  assert.match(html, /<td[^>]*align="right"[^>]*><span class="katex"/);
  assert.match(html, /<input[^>]*type="checkbox"[^>]*checked[^>]*disabled/);
  assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled/);
  assert.match(html, /<code>- \[x\] literal<\/code>/);
  assert.doesNotMatch(html, /href="javascript:/i);
});

test('Every table is wrapped in a scroll region exactly once so RTL columns are not transposed', async () => {
  const source = '| ستون یک | ستون دو |\n| --- | --- |\n| الف | ب |\n\nمتن میانی\n\n| تنها |\n| --- |\n| ج |';
  const html = await renderMarkdown(source);
  const tables = html.match(/<table>/g) ?? [];
  const wrappers = html.match(/<div class="table-scroll"[^>]*>/g) ?? [];
  assert.equal(tables.length, 2);
  assert.equal(wrappers.length, tables.length);
  // The wrapper must be the table's direct parent and must not nest inside itself.
  assert.equal((html.match(/class="table-scroll"/g) ?? []).length, tables.length);
  assert.match(html, /<div class="table-scroll"[^>]*><table>/);
  assert.doesNotMatch(html, /table-scroll"[^>]*>\s*<div class="table-scroll"/);
  // Scroll containers must remain keyboard reachable for horizontal scrolling.
  assert.match(html, /<div class="table-scroll"[^>]*role="region"[^>]*tabindex="0"/);
});

test('RTL and LTR alignment attributes survive so Persian tables keep their reading edge', async () => {
  const html = await renderMarkdown('| پیش‌فرض | وسط | پایان |\n| --- | :---: | ---: |\n| الف | ب | ج |');
  assert.match(html, /<th>پیش‌فرض<\/th>/);
  assert.match(html, /<th align="center">وسط<\/th>/);
  assert.match(html, /<th align="right">پایان<\/th>/);
  assert.match(html, /<td align="center">ب<\/td>/);
  assert.match(html, /<td align="right">ج<\/td>/);
});

test('Persian table notes keep wiki links and math inside wrapped cells', async () => {
  const html = await renderMarkdown('---\ntitle: نمونه\n---\n\n| مرجع | مقدار |\n| --- | --- |\n| [[cantor]] | $x^2$ |');
  assert.match(html, /<div class="table-scroll"[^>]*><table>/);
  // Without a link index the wiki link resolves to the missing-state span; it must
  // still sit inside the table cell rather than escaping the wrapper.
  assert.match(html, /<td><span class="wiki-(?:link|missing)"/);
  assert.match(html, /class="katex"/);
});

test('Safe links retain query parameters without double HTML escaping', async () => {
  const html = await renderMarkdown('[source](https://example.org/?x=1&y=2)');
  assert.match(html, /href="https:\/\/example.org\/\?x=1(?:&amp;|&#x26;)y=2"/);
  assert.doesNotMatch(html, /(?:&amp;|&#x26;)amp;/);
});

test('Reference links, images, callout titles and KaTeX commands cannot inject active HTML', async () => {
  const html = await renderMarkdown(String.raw`
[bad][payload]

[payload]: javascript:alert(1)

![bad](data:image/svg+xml;base64,PHN2Zz4=)

> [!PROOF]- <img src=x onerror=alert(1)>
> $\href{javascript:alert(1)}{x}$
`);
  assert.doesNotMatch(html, /href="javascript:|src="data:|onerror=/i);
});

test('renderMarkdown resolves relative markdown links and wiki links via options.linkResolver', async () => {
  const linkResolver = (target) => {
    if (target.includes('overview')) return '/shared/TOKEN?note=111';
    if (target.includes('account')) return '/shared/TOKEN?note=222';
    return null;
  };

  const md = `
[معرفی](01-getting-started/overview.md)
[ورود](./01-getting-started/account.md)
[بیرونی](https://example.com)
[[overview|مرور سریع]]
[[overview#مقدمه]]
`;

  const html = await renderMarkdown(md, { linkResolver });
  assert.match(html, /href="\/shared\/TOKEN\?note=111"/);
  assert.match(html, /href="\/shared\/TOKEN\?note=222"/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /<a href="\/shared\/TOKEN\?note=111" class="wiki-link">مرور سریع<\/a>/);
  assert.match(html, /<a href="\/shared\/TOKEN\?note=111" class="wiki-link">overview#مقدمه<\/a>/);
});

test('Obsidian flavored markdown: comments, highlights, tags, mermaid, embeds, and safe HTML', async () => {
  const md = `
این متن دارای ==نکته بسیار مهم== و هایلایت است.

این قبل از کامنت %%این کامنت مخفی است و نباید چاپ شود%% بعد از کامنت است.

%%
کامنت چندخطی
که باید کاملاً
حذف شود
%%

این نوت حاوی برچسب #جبر_خطی و تگ #math/basis در متن است.

\`\`\`mermaid
flowchart TD
    A["شروع"] --> B["پایان"]
\`\`\`

![[axler.pdf#page=12&height=480]]
![[podcast.mp3]]
![[lecture.mp4]]
![[concept-map.canvas]]

<iframe src="https://example.org/embed" width="500" height="300"></iframe>
کلید <kbd>Ctrl+S</kbd> برای ذخیره و متن با <u>زیرخط</u>.
`;

  const html = await renderMarkdown(md);
  assert.match(html, /<mark>نکته بسیار مهم<\/mark>/);
  assert.doesNotMatch(html, /این کامنت مخفی است/);
  assert.doesNotMatch(html, /کامنت چندخطی/);
  assert.match(html, /<a class="tag" href="\/search\?tag=%D8%AC%D8%A8%D8%B1_%D8%AE%D8%B7%DB%8C">#جبر_خطی<\/a>/);
  assert.match(html, /<a class="tag" href="\/search\?tag=math%2Fbasis">#math\/basis<\/a>/);
  assert.match(html, /<figure class="mermaid-diagram" data-mermaid=""/);
  assert.match(html, /<div class="mermaid-chart"/);
  assert.match(html, /<iframe src="\/vault\/axler\.pdf#page=12" class="pdf-embed" style="width:100%;height:480px;/);
  assert.match(html, /<audio controls src="\/vault\/podcast\.mp3" class="audio-embed"/);
  assert.match(html, /<video controls src="\/vault\/lecture\.mp4" class="video-embed"/);
  assert.match(html, /<figure class="canvas-diagram" data-canvas-url="\/vault\/concept-map\.canvas"/);
  assert.match(html, /<iframe src="https:\/\/example\.org\/embed"/);
  assert.match(html, /<kbd>Ctrl\+S<\/kbd>/);
  assert.match(html, /<u>زیرخط<\/u>/);
});
