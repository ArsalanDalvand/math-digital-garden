import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import {
  bookDisplayLabel,
  stripInlineMarkdown,
  formatSearchSnippetHtml,
  buildSearchFilterHref,
} from '../../frontend/src/lib/search-format.mjs';
import { geogebraFrame } from '../../frontend/src/lib/geogebra.mjs';
import { buildPresentationSlides } from '../../frontend/src/scripts/presentation-slides.mjs';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { JSDOM } = await import(require.resolve('jsdom'));

describe('Phase C Pure Helpers (Strict TDD)', () => {
  describe('1. Search Formatting, Book Labels & Filter Chips', () => {
    it('maps book slugs to localized Persian display labels', () => {
      assert.equal(bookDisplayLabel('axler'), 'جبر خطی آکسلر');
      assert.equal(bookDisplayLabel('axler-linear-algebra-done-right'), 'جبر خطی آکسلر');
      assert.equal(bookDisplayLabel('abstract-algebra'), 'جبر مجرد و ماتریس‌ها');
      assert.equal(bookDisplayLabel('abstract-algebra-and-matrices'), 'جبر مجرد و ماتریس‌ها');
      assert.equal(bookDisplayLabel('custom-book'), 'custom-book');
      assert.equal(bookDisplayLabel(''), '');
    });

    it('strips wikilinks, callout markers, heading hashes, and inline markdown syntax into clean plain prose', () => {
      const input =
        '# تعریف ۲۰.۱ > [!TLDR] چکیده مفهومی > در [[01-basics/05-complex|اعداد مختلط]] و [[VectorSpace]] مقدار **بُعد** یا *پایه* با ==تاکید== و `code` می‌آید.';
      assert.equal(
        stripInlineMarkdown(input),
        'تعریف ۲۰.۱ چکیده مفهومی در اعداد مختلط و VectorSpace مقدار بُعد یا پایه با تاکید و code می‌آید.',
      );
    });

    it('HTML-escapes untrusted snippets and highlights Persian/Arabic query terms cleanly', () => {
      const snippet = 'تعریف **فضاي برداری** <script>alert(1)</script> روی میدان F و فضای دوگان.';
      const html = formatSearchSnippetHtml(snippet, 'فضای برداری');
      assert.doesNotMatch(html, /<script>/);
      assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.match(html, /<mark class="search-hit">فضاي برداری<\/mark>/);
      assert.match(html, /<mark class="search-hit">فضای<\/mark>/);
    });

    it('removes a single active filter param while preserving remaining query parameters', () => {
      const params = {
        q: 'فضای برداری',
        book: 'axler',
        kind: 'theorem',
        track: 'pure_university',
        tag: 'جبر',
      };
      const noKind = new URL(buildSearchFilterHref(params, 'kind'), 'http://test');
      assert.equal(noKind.pathname, '/search');
      assert.equal(noKind.searchParams.get('q'), 'فضای برداری');
      assert.equal(noKind.searchParams.get('book'), 'axler');
      assert.equal(noKind.searchParams.get('kind'), null);
      assert.equal(noKind.searchParams.get('tag'), 'جبر');

      const noQ = new URL(buildSearchFilterHref(params, 'q'), 'http://test');
      assert.equal(noQ.searchParams.get('q'), null);
      assert.equal(noQ.searchParams.get('kind'), 'theorem');
    });
  });

  describe('2. Responsive GeoGebra Frame Mode', () => {
    function bootFrame(innerWidth) {
      const config = {
        appName: 'graphing',
        width: 700,
        height: 450,
        caption: 'رسم نمونه',
        commands: ['f(x)=x^2'],
      };
      const html = geogebraFrame(config, 'tok');
      const scripts = new JSDOM(html).window.document.querySelectorAll('script');
      let options;
      const events = {};
      const sizes = [];
      const status = { textContent: '' };
      const context = {
        innerWidth,
        addEventListener: (type, fn) => {
          events[type] = fn;
        },
        window: {},
        document: { getElementById: () => status },
        parent: { postMessage: () => {} },
        setTimeout: () => {},
        GGBApplet: class {
          constructor(p) {
            options = p;
          }
          inject() {}
        },
      };
      context.window = context;
      vm.runInNewContext(scripts[0].textContent || '', context);
      context.boot();
      options.appletOnLoad({
        evalCommand: () => {},
        setSize: (w, h) => sizes.push([w, h]),
      });
      return { options, context, events, sizes };
    }

    it('uses compact G perspective without algebra bar on mobile widths (< 540px)', () => {
      const { options, context, events, sizes } = bootFrame(390);
      assert.equal(options.perspective, 'G');
      assert.equal(options.showAlgebraInput, false);
      assert.equal(options.showToolBar, false);

      context.innerWidth = 360;
      events.resize();
      assert.deepEqual(sizes, [[360, 450]]);
    });

    it('keeps desktop AG perspective, algebra input, and toolbar on wider screens (>= 540px)', () => {
      const { options } = bootFrame(700);
      assert.equal(options.perspective, 'AG');
      assert.equal(options.showAlgebraInput, true);
      assert.equal(options.showToolBar, true);
    });
  });

  describe('3. Presentation Slide Cover Deduplication', () => {
    it('skips redundant cover slide when content already begins with matching H1', () => {
      const dom = new JSDOM(
        '<div><h1>فضای برداری</h1><p>تعریف اول</p><h2>مثال‌ها</h2><p>مثال ۱</p></div>',
      );
      const slides = buildPresentationSlides(
        Array.from(dom.window.document.querySelector('div').childNodes),
        'فضای برداری',
      );
      assert.equal(slides.length, 2);
      assert.equal(slides[0][0].tagName, 'H1');
      assert.equal(slides[1][0].tagName, 'H2');
    });

    it('creates a cover slide with title and optional slogan when content begins with H2', () => {
      const dom = new JSDOM(
        '<div><h2>بخش اول</h2><p>متن اول</p><h2>بخش دوم</h2><p>متن دوم</p></div>',
      );
      const slides = buildPresentationSlides(
        Array.from(dom.window.document.querySelector('div').childNodes),
        'قضیه بعد',
        'خلاصه کوتاه قضیه',
      );
      assert.equal(slides.length, 3);
      assert.equal(slides[0][0].tagName, 'H1');
      assert.equal(slides[0][0].textContent, 'قضیه بعد');
      assert.equal(slides[0][1].textContent, 'خلاصه کوتاه قضیه');
    });
  });
});
