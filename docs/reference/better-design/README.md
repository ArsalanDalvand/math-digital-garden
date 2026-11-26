# Better Design: مرجع محلی پروژه

این پوشه نسخهٔ خواندنی اطلاعات Better Design برای کارهای رابط باغ ریاضی است. منبع عمومی از `https://github.com/marvkr/better-design` در commit `e146625f3041ef8089a2013587435fc763dc3b15` دریافت شد (۱۶ اکتبر ۲۰۲۶). پاسخ‌های MCP از سرور نسخهٔ `0.44.0` در همان روز، با کلید از پیکربندی محلی و از مسیر `proxychains4` دریافت شدند. کلید و تنظیمات اتصال در این پوشه ذخیره نشده‌اند.

## محتوا

- `source/README.md` و `source/LICENSE`: راهنمای رسمی راه‌اندازی و مجوز MIT.
- `source/components/notion/`: ۱۰۰ فایل توکن CSS و پیاده‌سازی componentهای Notion.
- `source/registry/notion/`: ۱۰۱ تعریف registry؛ `source/registry/index.json` کاتالوگ مادر است.
- `source/skills/better-design/`: راهنمای skill منتشرشده در همان commit.
- `mcp/`: پاسخ کامل و بدون ویرایش `get-design-system-kit` برای Notion، چهار اصل UI، دو اصل UX و همهٔ قواعد review. JSON هر فایل، پاسخ JSON-RPC را حفظ می‌کند؛ متن در `result.content[*].text` و دادهٔ kit در `result.structuredContent` است.
- `NOTES.md`: خلاصهٔ کاربردی و محدودیت‌های انطباق با پروژه.
- `SHA256SUMS`: checksum فایل‌های منبع و پاسخ‌ها.

## شیوهٔ استفاده

برای توکن‌ها `source/components/notion/globals.css` یا `mcp/notion-kit.json` را بخوانید. برای الگوهای button، input، card، sidebar و typography فایل‌های هم‌نام در `source/components/notion/components/ui/` را ببینید. پیش از تغییر صفحه، اصل مربوط در `mcp/ui-*.json` و `mcp/ux-*.json` و سپس `mcp/review-rules.json` را بخوانید. این snapshot جایگزین بازبینی صفحهٔ رندرشده با `check-comprehension` و `inspect-spacing` نیست.

پروژهٔ قدیمی Astro و فونت Vazirmatn دارد و Atomic نیز استک خودش را دارد. دستور نصب kit را خودکار اجرا نکنید؛ componentهای مرجع وابستگی‌ها و فرض‌های React/shadcn خاص خود را دارند. تغییر dependency همچنان به تأیید کاربر نیاز دارد. این فایل‌ها برای پژوهش هستند و نباید مستقیم به خروجی محصول یا Git پروژه وارد شوند.

برای بررسی یکپارچگی، از همین پوشه اجرا کنید: `sha256sum -c SHA256SUMS`.
