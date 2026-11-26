# برنامهٔ افزودن قابلیت‌های Quartz — ECC Gate 1

وضعیت: آرشیو تحقیق؛ این برنامه با درخواست جدید کاربر دربارهٔ امکانات نمایشی Astro محدود شده و برنامهٔ فعال اکنون `08-OBSIDIAN-PRESENTATION.md` است. برش‌های گستردهٔ زیر مجوز اجرا ندارند.

## هدف

سایت فعلی امکانات انتشار و مطالعهٔ نوت‌های Obsidian در Quartz را داشته باشد. موتورهای آمادهٔ Quartz و کتابخانه‌های همان پروژه به‌کار گرفته شوند؛ parser، موتور گراف، موتور Bases یا renderer Canvas از ابتدا نوشته نشوند. مدل رسمی/شخصی، Markdown خام و مسیر توسعهٔ FastAPI/PostgreSQL پروژه🚀 Deploy on Sealos حفظ شوند.

این تغییر بزرگ و چندلایه است: parser مشترک، ارتباطات، تجربهٔ مطالعه، منابع vault و سیاست انتشار را دربرمی‌گیرد. برنامه به برش‌های آزمون‌پذیر تقسیم می‌شود.

## سایت و نسخهٔ واقعاً بررسی‌شده

- سایت مرجع: [quartz.jzhao.xyz](https://quartz.jzhao.xyz/). این سایت خودش با Quartz ساخته شده است؛ footer در مرورگر `Created with Quartz v5.0.0 © 2026` را نشان داد.
- [مخزن](https://github.com/jackyzha0/quartz) در زمان تحقیق default branch برابر `v5` دارد. commit بررسی‌شده: `97a2d05f80c4c50534959b1d0d41cc4b3895625e`؛ package.json نسخهٔ `5.0.0` و مجوز MIT دارد.
- شاخهٔ قدیمی v4 نیز بررسی شد و نسخهٔ آن `4.5.2` بود. برنامهٔ جدید به معماری افزونه‌ای v5 تکیه می‌کند.
- مستندات از Context7 با `proxychains4` دریافت شدند: یک resolve برای Quartz و دو درخواست docs دربارهٔ سینتکس Obsidian و امکانات گراف/مطالعه. فایل‌های رسمی و metadata بسته‌ها نیز از GitHub و npm registry خوانده شدند.
- با agent-browser اختصاصی، گراف سراسری واقعاً باز شد: canvas محلی ۲۵۴×۲۵۰ و canvas سراسری ۱۱۵۲×۸۰۰ بود. جست‌وجو، حالت مطالعه و popover روی لینک داخلی مشاهده شدند. صفحهٔ Obsidian Compatibility در موبایل دارای یک Mermaid رندرشده، چهار checkbox و یک highlight بود. یکی از navigationهای موبایل timeout داد، ولی URL، DOM و screenshot مقصد پس از آن بررسی شدند.
- شواهد: [خانه](verification/quartz/reference-home.png)، [گراف سراسری](verification/quartz/reference-global-graph.png)، [جست‌وجو](verification/quartz/reference-search.png)، [popover](verification/quartz/reference-popover.png)، [سینتکس Obsidian در موبایل](verification/quartz/reference-obsidian-syntax-mobile.png).

## ماتریس قابلیت‌ها

«موجود» یعنی قبلاً پیاده‌سازی و تست شده؛ «افزودن» یعنی هنوز در پروژه پیاده‌سازی نشده و در این برنامه قرار دارد. افزونه‌های اختیاری از امکانات فعالِ پیش‌فرض Quartz جدا شده‌اند.

| قابلیت Quartz | وضعیت فعلی ما | اقدام پیشنهادی |
|---|---|---|
| Markdown و frontmatter | موجود | حفظ متن خام؛ افزودن properties قابل‌نمایش و description/date |
| ویکی‌لینک و aliases و heading links | موجود | جایگزینی parser محدود با parser رسمی Quartz؛ پشتیبانی path، لینک محلی و block ID |
| `![[note]]`، embed بخش و بلوک | ندارد | استفاده از AST/transformer آماده؛ حل مقصد از یادداشت‌های منتشرشده با تشخیص حلقه |
| تصویر، صوت، ویدئو و PDF داخل vault | کامل نیست | manifest منابع عمومی و embed آماده با MIME معتبر و مسیر امن |
| `==highlight==`، `%%comment%%` و `#inline/tag` | ندارد | `remark-obsidian`؛ کامنت در رندر و ایندکس حذف شود، raw باقی بماند |
| جدول، strike-through، footnote، autolink و task list | کامل نیست | `remark-gfm` و renderer مشترک؛ taskهای سفارشی Quartz نیز حفظ شوند |
| callout و اثبات تاشو | موجود | حفظ proof/theoremهای پروژه و سازگاری با calloutهای Quartz |
| KaTeX/LaTeX | موجود | حفظ trust=false و BiDi؛ regression با سینتکس تازه |
| Mermaid | ندارد | renderer آمادهٔ Mermaid/Quartz با تنظیم امن، lazy load و تم سازگار |
| syntax highlighting و copy code | ندارد | Shiki/Expressive Code آمادهٔ Astro؛ زبان‌ها و کد نامعتبر بدون شکست صفحه |
| گراف محلی و سراسری | ندارد | خود افزونهٔ `@quartz-community/graph`؛ zoom/drag، تگ، کلیک مقصد، visited state و میان‌بر |
| backlinks و outgoing links | موجود | تکمیل برای Markdown links و embeds؛ استفادهٔ مشترک با گراف |
| popover روی خود لینک‌های متن | فقط details کنار فهرست روابط | استفاده از Floating UI و منطق Quartz، با hover/focus/touch/Escape و preview بخش مقصد |
| جست‌وجوی سریع و Ctrl/Cmd+K | فرم GET زنده موجود | UI آمادهٔ Quartz/FlexSearch روی ایندکس عمومی زنده؛ snippet، highlight، تگ و پیمایش صفحه‌کلید |
| Explorer و TOC | درخت کتاب/فصل و TOC موجود | حفظ اجزای Starlight؛ درخت vault بر اساس relative_path و صفحه‌های مرور پوشه |
| breadcrumbs، صفحهٔ تگ و nested tags | کامل نیست | اجزای آماده/ناوبری موجود؛ صفحات فهرست پوشه و تگ با ترتیب پایدار |
| recent notes، تاریخ و reading time | ندارد | metadata موجود updated_at، frontmatter و `reading-time`/Quartz ContentMeta |
| حالت مطالعه | ندارد | رفتار آمادهٔ ReaderMode، با حفظ میان‌بر خروج و دسترس‌پذیری |
| dark mode، mobile و i18n | موجود | حفظ فارسی و RTL؛ آزمون اجزای جدید در هر دو تم |
| SPA navigation | ندارد | ClientRouter رسمی Astro؛ ثبت/پاک‌سازی lifecycle اجزای Quartz و fallback لینک عادی |
| alias redirects | نام مستعار در wiki resolution موجود | redirect برای aliasهای مسیرِ معتبر و یکتا، با کنترل collision و reserved routes |
| sitemap، RSS و social metadata/images | meta پایه موجود؛ بقیه ندارد | emitter/کتابخانهٔ آماده، فقط برای صفحات منتشرشده؛ دامنه از تنظیم deployment |
| draft / explicit publish / ignorePatterns | فقط canonical عمومی؛ importer عمومی ندارد | importer محلی غیرتخریبی و فیلتر انتشار در DB/API و manifest منابع |
| Canvas `.canvas` | ندارد؛ افزونهٔ اختیاری Quartz 5 | خود renderer `@quartz-community/canvas-page` در مسیر مطالعهٔ همین سایت |
| Bases `.base`، table/card/gallery | ندارد؛ افزونهٔ اختیاری Quartz 5 | renderer و expression compiler خود `@quartz-community/bases-page` روی catalogue عمومی |
| stacked pages | ندارد؛ افزونهٔ اختیاری | افزونهٔ آمادهٔ Quartz در حالت اختیاری مطالعه؛ تاریخچه، RTL و صفحه‌کلید بررسی شوند |
| Citations / BibTeX | ندارد؛ در Quartz نیز پیش‌فرض فعال نیست | `rehype-citation` با bibliography عمومی و نمونهٔ واقعی، بدون parser BibTeX اختصاصی |
| کامنت عمومی | ندارد؛ به provider وابسته است | Giscus آماده؛ فعال‌سازی نهایی نیازمند repo/category واقعی و تصمیم کاربر است |
| YouTube و X/Twitter embeds | ندارد | transformer آماده؛ URL معتبر، embed خارجی با انتخاب خواننده؛ بدون fetch آزاد سمت سرور |
| encrypted/unlisted pages | ندارد؛ افزونه‌های اختیاری | دادهٔ شخصی همچنان از مسیر احراز هویت فاز بعد؛ رمزگذاری کلاینتی جایگزین Zero IDOR نیست |
| Docker/build/plugins | زیرساخت Docker و Astro موجود | استفاده از گردش کار موجود؛ موتور عمومی plugin loader دیگری ساخته نمی‌شود |
| OxHugo/Roam و افزونه‌های community | مبدأ پروژه Obsidian است | در inventory ثبت شده؛ سازگاری ابزارهای تألیف دیگر و کل اکوسیستم community خارج از هدف این بسته است |

## تصمیم فنی: استفادهٔ مستقیم از بسته‌های آماده

Quartz 5 افزونه‌ها را مستقل کرده است. جایگزینی کل FastAPI/PostgreSQL با یک سایت static با roadmap انشعاب شخصی/PR/RAG هم‌راستا نیست. پیشنهاد، استفاده از renderer/parser/componentهای Quartz در لایهٔ خواندن فعلی و نگه‌داشتن قرارداد دادهٔ پروژه است.

| راهکار | یافتهٔ تحقیق | تصمیم |
|---|---|---|
| استفاده از بسته‌های مستقل Quartz در Astro/Starlight | parserها با unified فعلی سازگارند؛ Graph مؤلفه و resourceهای آماده دارد | انتخاب اصلی؛ adapter محدود برای قرارداد داده، theme و lifecycle |
| جایگزینی کامل سایت با موتور static Quartz | امکانات آمادهٔ فراوان؛ انتشار وابسته به build و filesystem و قالب Quartz | بدون تغییر معماری مصوب، جایگزین سایت اصلی نمی‌شود |
| نوشتن parser/گراف/Bases از ابتدا | قابلیت‌های مربوطه آماده وجود دارند | انتخاب نمی‌شود |

بسته‌های registry بررسی‌شده:

- `@quartz-community/remark-obsidian@1.1.0`: MIT، AST رسمی برای wikilink/embed/highlight/comment/tag، helper آمادهٔ `collectWikilinks` و `collectEmbedPaths`.
- `@quartz-community/rehype-obsidian@1.0.0`: MIT، block references، checkbox، Mermaid و media helpers.
- `@quartz-community/graph@1.0.0`: MIT، component آماده با local/global graph، resourceهای CSS/JS، locale فارسی و runtime خود گراف.
- `@quartz-community/search@1.0.0`: MIT، مؤلفهٔ جست‌وجو؛ ایندکس static پیش‌فرض با نمای زندهٔ عمومی پروژه تطبیق داده می‌شود.
- `@quartz-community/canvas-page@1.0.0` و `bases-page@1.0.0`: MIT؛ renderer و typeهای مستقل دارند، اما peer dependency موتور Quartz 5 و context/allFiles باید در برش مربوطه بررسی شوند.

آزمایش تحقیق در `/tmp` بدون نصب در پروژه:

1. `remark-obsidian` با unified/remark-parse/remark-math موجود، متن فارسیِ حاوی highlight، comment، inline tag، block link و embed را parse کرد؛ `collectWikilinks` فقط دو پیوند واقعی برگرداند. inlineCode و inlineMath پیوند نشدند. گزینهٔ math=false از نصب tokenizer دوم جلوگیری می‌کند.
2. مؤلفهٔ Graph مستقیم import و فراخوانی شد؛ `locale: fa-IR` عنوان «نمای گراف» داد. CSS حدود ۱۳۹۱ و script حدود ۲۱۰۱۴ نویسه است. runtime به promise به نام fetchData متکی است؛ ساخت این داده از index عمومی adapter خواهد بود.
3. Graph پیش‌فرض D3/Pixi را از CDN می‌گیرد؛ در ادغام پروژه، assetهای نسخه‌دار به‌صورت محلی ارائه می‌شوند تا نمایش گراف به اتصال CDN وابسته نباشد.
4. OFM کامل Quartz raw HTML و برخی تبدیل‌های متنی دارد. استفادهٔ کور از زنجیرهٔ کامل آن مناسب قرارداد امنیتی فعلی نیست؛ tokenizer/transformerهای لازم به‌صورت انتخابی مصرف می‌شوند و parser دیگری ساخته نمی‌شود.

سازگاری دقیق Graph/Search در صفحهٔ SSR، منابع محلی، Canvas/Bases و ClientRouter هنوز با بیلد/مرورگر پروژه اثبات نشده است؛ این‌ها معیارهای پذیرش برش‌های توسعه هستند. اگر بسته‌ای فقط در build engine خودش کار کند، نخست integration کوچک با همان renderer بررسی می‌شود؛ engine اختصاصی برای جایگزینی آن ساخته نخواهد شد. تغییر معماری بزرگ خارج از این طرح دوباره ارائه خواهد شد.

## قرارداد داده و انتشار

- Markdown ذخیره‌شده و SHA-256 دقیق UTF-8 بدون بازنویسی باقی می‌مانند. AST فقط برای رندر و نمای مشتق است؛ serialize برگشتی ممنوع است.
- index عمومی فقط دادهٔ یادداشت‌های canonical منتشرشده را دارد: slug/path، title، description/snippet، tags، links/embeds، timestamps و hash. متن index از AST بدون comments و HTML فعال گرفته می‌شود. جدول کاربران/fork/chat وارد آن نمی‌شود.
- وضعیت انتشار در سطح DB قابل فیلتر خواهد بود؛ همهٔ endpointهای public note/catalogue/index/search و سپس RSS/sitemap/graph/Bases یک شرط انتشار مشترک دارند. صفحات موجود با migration سازگار باقی می‌مانند؛ draft خاموش در API نیز ۴۰۴ است.
- importer محلی vault ابتدا preview/manifest می‌سازد؛ نسخهٔ اولیه فقط یادداشت‌های `publish: true` و غیر draft را وارد می‌کند. فایل موجود با hash متفاوت بی‌صدا جایگزین نمی‌شود و حذف خودکار داده انجام نمی‌شود. انتشار تدریجی روی fixtures آزموده می‌شود؛ هیچ vault واقعیِ نامشخصی scan یا publish نمی‌شود.
- مسیرهای relative_path و alias با جلوگیری از traversal، symlink escape، collision و open redirect اعتبارسنجی می‌شوند. نام مبهم هرگز به اولین مقصد دلخواه resolve نمی‌شود.
- فقط attachmentهای عمومیِ مجاز در manifest سرو می‌شوند. فایل‌های `.obsidian`، private، secret یا منابع خارج از ریشه منتشر نمی‌شوند. برخلاف رفتار مستند پیش‌فرض Quartz، همهٔ non-Markdownها به‌صورت خودکار public نمی‌شوند.
- کامنت Obsidian `%%...%%` ابزار حذف از نمایش است؛ Markdown خام رسمی از API قابل‌دریافت می‌ماند. این سینتکس مکان امن نگهداری راز نیست. حریم خصوصی از publication/access policy می‌آید.
- embed یادداشت فقط از دادهٔ منتشرشده و renderer مشترک؛ visited set و سقف عمق برای حلقه‌ها، IDهای مجزا، لینک بازگشت به منبع و پیام واضح برای مقصد غایب/مبهم.
- raw HTML فعال نمی‌شود. URLها و attributes تولیدشدهٔ افزونه‌ها در مرز رندر اعتبارسنجی می‌شوند؛ KaTeX trust=false، Mermaid امن و code/math به‌صورت LTR isolate باقی می‌مانند.
- media خارجی arbitrary server fetch ندارند؛ منابع از hostهای پشتیبانی‌شده و URL معتبر استفاده می‌کنند. شخصی‌سازی و proposal/RAG همچنان مطابق فازهای بعدی پروژه‌اند.

## task_list توسعه و معیار پذیرش — پس از Gate 1

هر برش با تست تازه در `tests/` و اجرای RED شروع می‌شود و با GREEN و بررسی callers تمام می‌شود. ترتیب زیر dependencyها و امنیت انتشار را پیش از مصرف‌کننده‌ها مشخص می‌کند.

1. **قرارداد انتشار و index عمومی:** migration غیرتخریبی وضعیت انتشار، فیلتر مشترک note/catalogue/search و نمای مشتق index. تست مستقیم دسترسی به draft، index و نبود user data، CRLF/SHA، pagination و حذف/به‌روزرسانی روابط. raw API موجود حفظ شود.
2. **Markdown کامل Obsidian:** جایگزینی remark-wiki-link با remark-obsidian و transformerهای انتخابی؛ highlights/comments، GFM/footnote/tasks، block IDs، path و aliases. رندر، links/backlinks/index از یک AST مشترک باشند؛ همهٔ تست‌های قبلی با اختلاف معنایی کنترل‌شده بمانند.
3. **منابع و embeds:** importer محلی/manifest غیرتخریبی، منابع عمومی تصویر/PDF/صوت/ویدئو و transclusion کامل/heading/block. آزمون loop، missing، private target، Unicode/path traversal، alias collision، duplicate IDs و XSS در media/متن.
4. **گراف و popover واقعی:** ادغام خود Graph با index، assetهای محلی و theme/locale؛ popover روی لینک‌های متن و preview heading/image با Floating UI/Quartz. local/global، drag/zoom، کلیک و میان‌بر، fallback فهرست روابط برای صفحه‌کلید و fail-soft بدون WebGL/JS بررسی شوند.
5. **جست‌وجو و کشف دانش:** UI جست‌وجوی فوری و Ctrl/Cmd+K با snippet، highlight، tags و keyboard؛ browse پوشه، nested tags، breadcrumbs، recent notes و content metadata. منبع DB زنده بماند؛ index ناقصِ صفحهٔ اول استفاده نشود.
6. **مطالعه و محتوای علمی:** ReaderMode، Mermaid، Shiki/copy code، citation آماده، navigation سریع Astro و lifecycle. fixtureهای فارسی/ریاضی/کد/نمودار و تنظیم theme/RTL در desktop/mobile؛ تکرار event listener یا برگشت محتوای stale رخ ندهد.
7. **rendererهای پیشرفتهٔ Quartz 5:** Canvas و Bases با بسته‌های اصلی و snapshot metadata عمومی؛ نمونهٔ واقعی `.canvas` و `.base` شامل references، diagram nodes و table/card/gallery. ارزیاب expression مستقل نوشته نشود و هیچ query به دادهٔ private دسترسی نداشته باشد. stacked pages با افزونهٔ آماده و حالت اختیاری در همین مرحله بررسی/ادغام شود.
8. **انتشار و تحویل:** alias redirects، RSS/sitemap/OG با ابزار آماده و publication filter؛ provider comments به‌صورت integration آماده با config واقعی. آزمون‌های واحد، SSR، PostgreSQL، typing/lint/build و agent-browser شامل screenshots، a11y، network failure، keyboard/touch و freshness انجام شوند. README و راهنمای import/منابع/محدودیت‌ها به‌روز شوند.

دامنهٔ تأثیر: backend models/migration، تمام public note queries و seed/import؛ frontend markdown/catalogue/index، Reader و تمام صفحات/مصرف‌کنندگان، اجزای تعامل، public resource routes و build config؛ tests/fixtures، lockfiles، README و راهنماهای docs. Starlight آمادهٔ موجود دوباره ساخته نمی‌شود؛ تغییر وابستگی‌ها فقط در حد بسته‌های لازم برای برش مربوطه است.

## موارد نیازمند اطلاعات بیرونی و مرز تعهد

- Giscus به repo عمومی، Discussions، نصب app و repoId/categoryId واقعی نیاز دارد؛ این تنظیم‌ها هنوز ارائه نشده‌اند. integration قابل‌پیکربندی و آزمون آن در طرح هست؛ فعال‌سازی حساب بیرونی بدون تنظیم واقعی انجام نمی‌شود.
- دامنهٔ عمومی هنوز مشخص نیست؛ demo از origin محلی استفاده می‌کند. RSS/sitemap/OG برای استقرار به SITE_URL معتبر نیاز دارند.
- مسیر vault واقعی هنوز مشخص نیست؛ importer با fixture کامل تحویل می‌شود و دادهٔ واقعی بدون مسیر/سیاست انتشار معلوم وارد نمی‌شود.
- رمزگذاری کلاینتی و unlisted معادل مجوز مالکیت داده‌های شخصی نیستند. اگر کاربر این گزینه‌های اختیاری را بخواهد، آن‌ها فقط برای محتوای عمومی/انتشار جداگانه با محصول auth فاز بعد تطبیق داده می‌شوند.
- تمام قابلیت‌های خود Obsidian و تمام افزونه‌های community جزء امکانات پیش‌فرض Quartz نیستند؛ Dataview/Excalidraw و همگام‌سازی دوطرفه نیازهای جدا هستند و در این بسته جای موتور آماده‌شان پیاده‌سازی اختصاصی نمی‌گیرند.

## Gemini و بررسی مستقل

Gemini با مدل `ag/gemini-3.8-flash-high` در sandbox فقط‌خواندنی برای ممیزی جانبی فراخوانی شد و این بار گزارش نهایی تحویل داد. نکات آن: حفظ MIT notices، تفاوت lifecycle و framework، فرض filesystem در emitters، index عمومی و ایزولاسیون داده و تست RTL. این گزارش مشورتی و حاوی عدم‌قطعیت بود؛ parent با source/registry بررسی کرد که parser مستقل قابل‌استفاده و Graph فارسی است. انتخاب معماری و توسعهٔ اصلی با ایجنت اصلی باقی می‌ماند.

## Gateها

Gate 1 مربوط به همین برنامهٔ تازه است؛ تأیید قبلی سند 06 برای قابلیت‌های قبلی بود. تا تأیید این طرح، production code نوشته و بسته‌ای در پروژه نصب نمی‌شود. پس از تکمیل توسعه و ارائهٔ شواهد، Gate 2 پیش از commit اعمال می‌شود.
