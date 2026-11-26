# نمایش GeoGebra و Excalidraw

دامنه طبق درخواست کاربر فقط نمایش محتوای این دو پلاگین است. Runtime دسکتاپ Obsidian اجرا نمی‌شود. امکانات اضافی Plotly، محاسبه با Compute Engine، snippets سفارشی، lint، تنظیم اندازه/عرض مطالعه و خروجی‌های HTML/PNG/Word/EPUB/TeX همراه با dependency، API، worker و آزمون‌های مربوط حذف شدند. دریافت Markdown خام، MathLive و دیگر نیازمندی‌های اصلی پروژه باقی‌اند.

## GeoGebra

- بلوک `geogebra` یا `ggb`، بدون حساسیت به بزرگی حروف؛ دستورهای خطی یا YAML مطابق GeoGebra Lab.
- تنظیمات رسم، توضیح، `materialId`، `ggbBase64` و `filename` برای `.ggb` واردشده در manifest.
- فایل محلی در صفحهٔ اصلی به Base64 تبدیل و همراه پیکربندی با `postMessage` به viewer ارسال می‌شود؛ فایل و متن در URL قرار نمی‌گیرند.
- موتور رسمی `GGBApplet`؛ تبدیل `materialId` به پارامتر رسمی `material_id` و اجرای دستورها با `evalCommand`.
- بارگذاری فقط با دکمهٔ کاربر؛ خطا/قطعی، متن اصلی را حذف نمی‌کند.

SDK رسمی برای iframeهای داخلی به مبدأ واقعی نیاز دارد. قاب `srcdoc` با sandbox ناشناس در آزمون واقعی `SecurityError` می‌داد. مسیر Astro `/drawings/geogebra` اکنون از **hostname متفاوت** با `allow-scripts allow-same-origin` استفاده می‌کند؛ رویداد بازگشتی با مبدأ، پنجرهٔ فرستنده و token بررسی می‌شود. Viewer به کوکی host-only و DOM صفحهٔ اصلی دسترسی ندارد. در محیط محلی 127.0.0.1 و localhost استفاده می‌شوند؛ در تولید `PUBLIC_GEOGEBRA_VIEWER_ORIGIN` هنگام build باید hostname HTTPS جداگانه‌ای باشد که همین مسیر را سرو کند. استفاده از پورت متفاوت روی hostname یکسان رد می‌شود.

شبکهٔ GeoGebra لازم است. کنترل JavaScript تعبیه‌شده و امکانات فایل موتور غیرفعال است. URL و filename دلخواه بیرون manifest پذیرفته نمی‌شوند.

## Excalidraw

- فایل `.excalidraw` و `.excalidraw.md` با frontmatter پلاگین و بلوک `json`/`compressed-json`.
- فشرده‌سازی رسمی LZ String در worker ایزوله با محدودیت زمان/حافظه باز می‌شود؛ ورودی/خروجی و تعداد/مختصات عناصر محدودند.
- کتابخانهٔ رسمی `@excalidraw/excalidraw` با `restoreElements` و `exportToSvg` استفاده می‌شود؛ editor دیگری اضافه نشده است.
- فونت‌های رسمی با hook استاندارد Astro از پکیج به asset محلی کپی می‌شوند؛ رندر Excalidraw به CDN فونت وابسته نیست.
- اسکریپت کامپوننت Astro موتور را با dynamic import فقط برای نقاشی نزدیک viewport دریافت می‌کند.
- SVG نهایی در `img` با Blob URL نمایش داده می‌شود؛ HTML/SVG نقاشی وارد DOM خصوصی صفحه نمی‌شود.
- تصاویر raster داخل scene و `## Embedded Files` برای asset واردشده پشتیبانی می‌شوند. PNG/SVG خروجی هم‌نام همچنان برای embed قابل استفاده است؛ برای فایل اصلی خروجی دستی لازم نیست.
- raw Markdown، پایان‌خط و فایل والت هیچ‌گاه بازنویسی نمی‌شوند. رسم‌های واردشده مثل دیگر یادداشت‌ها در transclusion و پیش‌نمایش قابل نمایش‌اند.

iframe/web embeddable، JavaScript، URL خارجی تصاویر و لینک اجرایی عناصر اجرا نمی‌شوند. تصاویر SVG درون scene، رندر خاص LaTeX/Markdown داخل Excalidraw و ارجاع‌های انتخاب بخشی از scene (`#group`/`#frame`) در این مرحله renderer اختصاصی ندارند؛ برای این موارد خروجی تصویر آمادهٔ Obsidian راهکار است. UI/UX نهایی و بزرگ‌نمایی در backlog است.

## شواهد

آزمون‌های این تغییر در `tests/frontend/drawing-scope.test.mjs`، `tests/frontend/geogebra-origin.test.mjs` و `tests/test_drawing_import.py` ابتدا با شکست واقعی اجرا شدند. گزارش نهایی در `docs/verification/drawings/` ثبت می‌شود. شواهد پوشهٔ `obsidian-plugins` تاریخی‌اند و قابلیت‌های حذف‌شده را به‌عنوان پشتیبانی فعلی تضمین نمی‌کنند.

کامپوننت‌ها اتصال رویداد را با WeakSet روی خود عنصر ثبت می‌کنند؛ بازگرداندن HTML هنگام تعویض حالت رسمی/شخصی، پرچم اتصال قدیمی را به عنصر جدید منتقل نمی‌کند. این رفتار در `tests/frontend/drawing-lifecycle.test.mjs` با بازسازی DOM آزمایش شده است.
