# تحویل اجرای فازهای ۲ تا ۵

نسخهٔ محلی در http://127.0.0.1:4321 اجرا شده و API اختصاصی آن روی 8001 است؛ سرویس موجود روی 8000 تغییر نکرده است. والت اصلی دستکاری نشده؛ خروجی تأییدها در مخزن جداگانهٔ `.local/content-vault` ثبت می‌شود و push خودکار ندارد.

## قابلیت‌های اجرایی

| نیازمندی | پیاده‌سازی و شواهد |
|---|---|
| FR-01 تا FR-04 | KaTeX، RTL/LTR، ساختار فصل، پیوندها، preview، backlinks و callout؛ آزمون‌های frontend/reader |
| FR-05 و فاز ۵ | GeoGebra با بارگذاری صریح و iframe با مبدأ ایزوله، اعتبارسنجی YAML و پیام خطای مستقل؛ graph آمادهٔ Starlight با تنظیمات |
| FR-06 تا FR-10 | ثبت‌نام/ورود، Argon2، نشست HttpOnly، فضای خصوصی، CodeMirror و MathLive، autosave ترتیبی، نسخهٔ رسمی/شخصی، reset/rebase، bookmark و تاریخچه |
| چرخهٔ اصلاح | snapshot منجمد، diff-match-patch و MergeView، نقش مؤلف، بررسی hash مبدأ، تأیید/رد/درخواست اصلاح و Git export قابل retry |
| دستیار مقید | AST source slicing، pgvector، محدودیت مالک در SQL، کنترل استناد قبل از SSE، سؤال روی انتخاب و اعمال صریح به نسخهٔ شخصی |
| سازگاری Obsidian | Markdown خام، پایان‌خط‌های مختلط، تصویر از manifest، heading/block links و transclusion محدود با توقف چرخه |

بازسازی embedding بعد از save/reset/rebase و تأیید رسمی، در صورت تنظیم provider، با BackgroundTasks و نشست مستقل اجرا می‌شود. خرابی provider ذخیره را برنمی‌گرداند؛ نمایه‌سازی دستی و CLI برای retry موجود است. این صف درون‌پردازه‌ای است؛ در قطع پردازه ممکن است job از دست برود و باید دوباره index شود. بردارهای stale در بازیابی قابل استفاده نیستند.

## شواهد آزمون

لاگ‌ها و تصاویر در `docs/verification/phases-2-5/` نگهداری می‌شوند:

- `final-backend.log`: ۳۹ آزمون موفق، PostgreSQL واقعی، بدون skip.
- `final-coverage.log`: پوشش کلی ۸۶٪ با concurrency=greenlet.
- `final-frontend.log`: ۲۶ آزمون موفق.
- `final-ssr.log`: ۱۲ آزمون موفق روی خروجی build.
- `final-ruff.log`، `final-mypy.log`، `final-tsc.log`، `final-astro.log`: بدون خطای lint/type؛ Astro بررسی ۳۰ فایل.
- `final-build.log`: build موفق؛ هشدار collection خالی Starlight و اندازهٔ بعضی bundleها باقی است.
- آزمون قرمز بازسازی نمایه در `auto-index-red.log` و سایر شواهد RED در همین پوشه موجود است.

آزمون مرورگر واقعی شامل ثبت‌نام، ویرایش CodeMirror، درج MathLive، autosave، bookmark، proposal، MergeView، تأیید مؤلف و خروجی Git و اعمال پاسخ دارای citation به نسخهٔ شخصی بوده است. proposal آزمایشی `628fc559-69b2-4d7f-95ea-207ccac65338` به commit `219cb024b96f3c81b1bb7ea8e760ea36186391d3` در مخزن آزمایش صادر شد. تصاویر editor/review/tutor ثبت شده‌اند. provider این سناریوی E2E صریحاً تستی است.

## محدودیت‌های تحویل

کلید مدل واقعی تنظیم نشده؛ مسیر سرویس واقعی با خطای روشن 503 پاسخ می‌دهد و مطالعه/ویرایش فعال می‌ماند. کیفیت مدل و embedding واقعی تأیید نشده است. نقش مؤلف با CLI محلی به حساب ثبت‌شده داده می‌شود؛ رمز مدیر پیش‌فرض ساخته نشده است.

۱۱ تصویر ارجاع‌شده در والت ورودی وجود نداشت. HTML فعال اجرا نمی‌شود؛ transclusion تا دو سطح است. این محدودیت‌ها مانع نگهداری متن خام نیستند.

ممیزی کامل موبایل، WCAG و performance budget و طراحی بصری طبق درخواست کاربر به متخصص واگذار شده‌اند؛ فهرست دقیق در `11-UI-UX-BACKLOG.md` است. بنابراین معیار نهایی «build بدون هیچ هشدار» و پذیرش کامل UI/UX هنوز امضا نشده است. rate limiter فعلی درون‌پردازه‌ای است؛ استقرار چند worker نیازمند سیاست مشترک و تنظیم proxy است. Git remote و انتشار عمومی تنظیم نشده‌اند.

بررسی‌های کمکی Gemini در `gemini-security.md` و `gemini-byte-review.md` موجودند؛ تلاش آخر بررسی بزرگ به علت قطع stream تمام نشد و به‌عنوان تأیید نهایی محسوب نمی‌شود.

بررسی نهایی مرورگر GeoGebra به وضعیت failed رسید؛ متن و KaTeX فعال ماندند (`geogebra-browser.log` و `geogebra-final.png`). بارگذاری موفق اپلت خارجی تأیید نشده است.

امکانات و آزمون‌های تکمیلی سازگاری پلاگین‌های شخصی کاربر در [گزارش پلاگین‌ها](13-OBSIDIAN-PLUGIN-COMPATIBILITY.md) آمده‌اند؛ شمار آزمون‌های جدیدتر در آن گزارش ثبت است.
