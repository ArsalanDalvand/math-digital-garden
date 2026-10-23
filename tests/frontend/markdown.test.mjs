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
