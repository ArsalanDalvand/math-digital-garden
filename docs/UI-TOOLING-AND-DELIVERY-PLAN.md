# ابزارها و برنامهٔ توسعهٔ باغ ریاضی

## نصب و شواهد مشاهده‌شده

- **UI UX Pro Max**: نصب بومی با `hermes skills install nextlevelbuilder/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max --yes`، اسکن SAFE و بارگذاری موفق `skill_view`. اسکریپت‌ها و داده‌های منبع نیز همراه نصب محلی قرار گرفتند. جست‌وجوی واقعی قواعد UX نتیجه داد؛ جست‌وجوی Astro با عبارت عمومی نتیجه نداشت و تکرار محدود با `accessible` قرارداد عدم وابستگی ناوبری پایه به JavaScript را برگرداند. پیشنهادهای داده‌محور مرجع‌اند، نه جایگزین نیازهای واقعی محصول.
- **Impeccable**: نصب بومی و اسکن SAFE، سپس تکمیل reference و scripts از مخزن اصلی. launcher واقعی context با هدف صفحهٔ اصلی اجرا شد و docs/DESIGN.md را یافت. PRODUCT.md وجود ندارد؛ اصلاح محدود رابط با سیستم موجود مجاز است. نصب hook انجام نشده است.
- **Pen**: اسکیل pen-design نصب و متن راهنما خوانده شد. `@pen.dev/cli@0.3.11` نصب؛ `pen version` برابر 0.3.11. `pen status` اعلام Not authenticated می‌کند. تولید طرح تأیید نشده؛ ورود اختصاصی pen.dev لازم است. بدون ساخت حساب یا هزینهٔ خودکار.
- **Context7**: ثبت با CLI بومی Hermes؛ اتصال و کشف دو ابزار موفق. علاوه بر `hermes mcp test context7`، resolve-library-id و query-docs از طریق MCP SDK واقعاً اجرا شدند. مستندات Field، FieldError و aria-invalid در shadcn دریافت شد.
- **Icons0**: ثبت با CLI بومی Hermes، ذخیرهٔ credential توسط خود CLI در محل امن خارج پروژه. `hermes mcp test icons0` اتصال و چهار ابزار را تأیید کرد. tools/call برای search-icons واقعاً `lucide:book-open` و `lucide:book-open-check` برگرداند. credential در این سند و پروژه ذخیره نشده است.
- **nosubscription.org**: دریافت واقعی صفحه؛ فهرست نرم‌افزارهای بدون اشتراک است، نه بستهٔ skill یا MCP. چیزی از آن نصب نشده است.
- **Material 3**: صفحهٔ رسمی guidelines دریافت شد، اما shell سایت اثبات خواندن مستندات پویا نیست. سپس Context7 کتابخانهٔ رسمی `/material-components/material-web` را resolve کرد و مستندات واقعی text-field.md دربارهٔ label، supporting-text، error-text، required و reportValidity دریافت شد. این قراردادها مرجع رفتار فرم بومی هستند، نه الزام نصب web component یا تغییر پالت.
- **shadcn**: مستندات فرم از Context7 واقعاً خوانده شد. قواعد label، توضیح، خطا کنار ورودی و aria-invalid در Astro/HTML بومی اقتباس می‌شوند؛ افزودن React برای این نیاز لازم نیست.

## محدودیت‌ها

ثبت MCP پایدار است، اما ابزارهای جدید در فهرست همین جلسه به‌صورت native تزریق نشده‌اند؛ CLI test و MCP SDK برای آزمون مستقیم استفاده شدند. جلسهٔ تازه برای تزریق خودکار لازم است. این تفاوت مانع آزمون واقعی tools/call نشد.

نصب skill به‌تنهایی تضمین قابلیت نیست: نسخهٔ نخست نصب فقط SKILL.md داشت؛ فایل‌های پشتیبان از checkout واقعی تکمیل شدند. خطای مسیر اولیهٔ Impeccable با مسیر مطلق اصلاح شد. برای UI UX مسیر حدس‌زده‌شده معتبر نبود؛ مسیر واقعی `.claude/skills/ui-ux-pro-max` استفاده شد.

## برنامهٔ اجرایی و دروازه‌ها

هویت قفل‌شده: مطالعهٔ آرام، Vazirmatn محلی، زمینهٔ خنثی، RTL و فرمول LTR مستقل. توکن‌های موجود منبع حقیقت می‌مانند. بازنویسی backend و مهاجرت framework هدف نیستند.

1. **حساب — مرحلهٔ اجرایی فعلی:** تفکیک ورود و ثبت‌نام، validation قابل‌فهم، حفظ ورودی در خطا، password-manager و فوکوس صحیح. TDD: شکست مشاهده‌شده سپس موفقیت؛ tests/types/build.
2. **فضای شخصی:** مدل وضعیت واقعی، empty/error/loading، فیلترهای قابل توضیح؛ بدون آمار ساختگی یا پاک‌کردن کار کاربر.
3. **مطالعه:** کنترل رسمی/شخصی، ابزار اختیاری، فرمول مستقل، برهان تاشو؛ آزمون بدون اتلاف Markdown.
4. **دستیار و بازبینی:** محدودهٔ پاسخ و منابع، قطع stream و retry؛ آزمون isolation و وضعیت تعارض.
5. **عملکرد:** بارگذاری ابزارهای سنگین هنگام نیاز و رعایت چرخهٔ حیات؛ اندازهٔ bundle و رگرسیون قابل اندازه‌گیری.
6. **پذیرش:** مرورگر واقعی desktop/mobile و روشن/تیره، صفحه‌کلید، reflow، حالت offline/error؛ حساب واقعی و صفحه‌خوان فقط با شواهد جداگانه. build یا screenshot به‌تنهایی WCAG PASS نیست.

## معیار توقف

برای هر تغییر محدودهٔ مشخص، تست مرتبط، build و یک دور بررسی مرورگری، اصلاح دسته‌ای و یک تأیید نهایی. «بی‌نقصی تمام سایت» هدف آزمون‌پذیر نیست؛ تحویل بر اساس معیارهای پذیرش و فهرست شکاف‌های واقعی انجام می‌شود. مراحل انجام‌نشده به‌عنوان برنامه باقی می‌مانند، نه ادعای تکمیل.

## منابع

- https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- https://github.com/pbakaus/impeccable
- https://unpkg.com/@pen.dev/cli@0.3.11/SKILL.md
- https://mcp.context7.com/mcp
- https://icons0.dev/mcp
- https://nosubscription.org/
- https://m3.material.io/components/text-fields/guidelines
- https://ui.shadcn.com/docs/components/field

این سند وضعیت نصب و برنامه است؛ شواهد تغییر کد در گزارش مستقل UI-AUTH-VERIFICATION.md ثبت می‌شوند.
