import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../frontend/src/lib/markdown.mjs';
import { sanitizeRawHtml } from '../../frontend/src/lib/html-sanitize.mjs';
import { escapeHtml, safeExternalUrl } from '../../frontend/src/lib/canvas-sanitize.mjs';
import { formatApiError } from '../../frontend/src/lib/api-errors.mjs';
import { isAllowedWriteOrigin } from '../../frontend/src/lib/proxy-origin.mjs';

test('HAST HTML sanitizer blocks SVG/details event handlers, obfuscated javascript URLs, srcdoc, and same-origin iframe privilege', async () => {
  assert.equal(sanitizeRawHtml('<svg/onload=alert(1)>'), '');
  const sanitizedDetails = sanitizeRawHtml('<details/open/ontoggle=alert(1)>متن</details>');
  assert.doesNotMatch(sanitizedDetails, /ontoggle/i);
  assert.match(sanitizedDetails, /<details open>/);

  const payload = [
    '<svg onload="alert(1)"><circle /></svg>',
    '<details open ontoggle="alert(1)">متن جزئیات</details>',
    '<a href=javascript:alert(1)>لینک بد</a>',
    '<a href="java&#x09;script:alert(1)">لینک مبهم</a>',
    '<iframe src="https://example.org/x" srcdoc="<script>alert(1)</script>" sandbox="allow-same-origin allow-scripts"></iframe>',
    '<iframe src="/api/account"></iframe>',
  ].join('\n\n');

  const html = await renderMarkdown(payload);
  assert.doesNotMatch(html, /<svg/i);
  assert.doesNotMatch(html, /onload|ontoggle|onerror/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /srcdoc/i);
  assert.doesNotMatch(html, /allow-same-origin/i);
  assert.doesNotMatch(html, /\/api\/account/);
  assert.match(html, /<details[^>]*open[^>]*>.*متن جزئیات.*<\/details>/s);
  assert.match(html, /<iframe[^>]*src="https:\/\/example\.org\/x"[^>]*sandbox="allow-scripts allow-popups"/);
});

test('HAST HTML sanitizer preserves safe inline tags, safe iframes, safe links, details, and KaTeX/vault embeds', async () => {
  const md = [
    'کلید <kbd>Ctrl+S</kbd> و متن <u>مهم</u> و <span dir="ltr">L3</span>.',
    '',
    '<a href="https://example.org/path?a=1&b=2">پیوند امن</a>',
    '',
    '<details open><summary>تیتر خلاصه</summary>متن درون خلاصه</details>',
    '',
    '<iframe src="https://example.org/embed" width="500" height="300"></iframe>',
    '',
    'فرمول $x^2 + y^2 = z^2$ و ![[doc.pdf#page=2&height=300]].',
  ].join('\n');

  const html = await renderMarkdown(md);
  assert.match(html, /<kbd>Ctrl\+S<\/kbd>/);
  assert.match(html, /<u>مهم<\/u>/);
  assert.match(html, /<span dir="ltr">L3<\/span>/);
  assert.match(html, /href="https:\/\/example\.org\/path\?a=1(?:&amp;|&#x26;)b=2"/);
  assert.match(html, /<details[^>]*open[^>]*><summary>تیتر خلاصه<\/summary>متن درون خلاصه<\/details>/);
  assert.match(html, /<iframe[^>]*src="https:\/\/example\.org\/embed"[^>]*width="500"[^>]*height="300"[^>]*sandbox="allow-scripts allow-popups"/);
  assert.match(html, /class="katex"/);
  assert.match(html, /src="\/vault\/doc\.pdf#page=2"/);
});

test('Canvas sanitizer escapes untrusted strings and rejects unsafe link URLs', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
  );
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('  data:text/html,<script>alert(1)</script> '), null);
  assert.equal(safeExternalUrl('https://atomathix.ir/?a=1&b=2'), 'https://atomathix.ir/?a=1&b=2');
  assert.equal(safeExternalUrl('mailto:admin@example.org'), 'mailto:admin@example.org');
});

test('formatApiError preserves distinct 409/403/413/429 meanings instead of clobbering all 409 errors', () => {
  const cycleMsg = formatApiError(409, 'Folder cycle');
  const reviewedMsg = formatApiError(409, 'Proposal already reviewed');
  const conflictMsg = formatApiError(409, 'Note changed; reload before saving');

  assert.notEqual(cycleMsg, conflictMsg);
  assert.notEqual(reviewedMsg, conflictMsg);
  assert.equal(reviewedMsg, 'این پیشنهاد پیش‌تر بررسی شده است.');
  assert.match(cycleMsg, /پوشه/);
  assert.match(conflictMsg, /نسخه تغییر کرده است/);
  assert.match(formatApiError(403, 'Author role required'), /نویسنده|مدیر/);
  assert.match(formatApiError(413, 'Request too large'), /حجم/);
  assert.match(formatApiError(429, 'Too many requests'), /تلاش/);
});

test('isAllowedWriteOrigin supports reverse-proxy forwarded host and blocks hostile origins', () => {
  const ok = isAllowedWriteOrigin({
    method: 'POST',
    url: 'http://127.0.0.1:4321/api/preview',
    xRequestedWith: 'MathGarden',
    origin: 'https://test.atomathix.ir',
    host: 'test.atomathix.ir',
    forwardedHost: 'test.atomathix.ir',
  });
  assert.equal(ok, true);

  const evil = isAllowedWriteOrigin({
    method: 'POST',
    url: 'http://127.0.0.1:4321/api/preview',
    xRequestedWith: 'MathGarden',
    origin: 'https://evil.invalid',
    host: 'test.atomathix.ir',
    forwardedHost: 'test.atomathix.ir',
  });
  assert.equal(evil, false);

  const noCsrf = isAllowedWriteOrigin({
    method: 'POST',
    url: 'https://test.atomathix.ir/api/preview',
    xRequestedWith: null,
    origin: 'https://test.atomathix.ir',
    host: 'test.atomathix.ir',
  });
  assert.equal(noCsrf, false);
});
