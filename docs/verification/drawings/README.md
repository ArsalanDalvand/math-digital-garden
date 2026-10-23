# شواهد پشتیبانی نمایشی دو پلاگین

آزمون‌ها از درخواست نمایش محتوای GeoGebra/Excalidraw و حذف پشتیبانی اضافه مشتق شدند؛ برنامهٔ جدیدی به دامنه افزوده نشد.

| رفتار | RED واقعی | GREEN |
|---|---|---|
| حذف rendererهای اضافه، scene اصلی و فشرده، binding GeoGebra و material_id | `red.log` | `frontend-tests.log` |
| فایل `.ggb` در manifest و `.excalidraw` بدون تغییر bytes | تست importer ابتدا ۰ فایل به‌جای ۱ می‌دید؛ ثبت در اجرای ترمینال | `backend-tests.log` |
| embed با filename کامل `.excalidraw.md` | `full-filename-red.log` | `frontend-tests.log` |
| تصویر پیوست Excalidraw و filename امن GeoGebra | `assets-red.log` | `frontend-tests.log` |
| فونت رسمی در خروجی Astro | `fonts-red.log` | `ssr-tests.log` |
| بازسازی DOM و اتصال دکمه‌ها بعد از تعویض حالت | `lifecycle-red.log` و اجرای ترمینال | `frontend-tests.log` |

- backend: `python3 /tmp/math-garden-test-environment.py -m coverage run -m pytest -q`، PostgreSQL اختصاصی واقعی؛ ۴۱ آزمون.
- frontend: `pnpm --dir frontend test`؛ ۴۰ آزمون.
- SSR: `pnpm --dir frontend test:reader`؛ ۱۴ آزمون، شامل route فایل فشرده و asset فونت.
- `coverage.log`: پوشش کل بک‌اند ۸۶٪. این عدد پوشش renderer مرورگر نیست.
- Ruff، mypy، TypeScript و Astro check در فایل‌های هم‌نام؛ `build.log` اجرای بیلد.
- نتیجهٔ نهایی: ۹۵ آزمون پاس؛ بیلد موفق و بدون خطای type/lint.
- `browser.log`: نمایش واقعی source فشردهٔ یک نقاشی از والت کاربر و رسم cosh/sinh یادداشت هایپربولیک واردشده با موتور رسمی GeoGebra؛ تصویر نقاشی `native-excalidraw.png`.
- `source-byte-check.log`: ۱۳۴ یادداشت واردشده با فایل مبدأ دقیقاً یکسان‌اند.

بررسی مرورگر با skill نصب‌شدهٔ agent-browser انجام شد. نقاشی نمونه فقط داخل DOM جلسهٔ آزمون قرار گرفت؛ یادداشت‌های نامرتبط والت والد در دیتابیس عمومی منتشر نشدند. سامانهٔ اصلی روی پورت ۴۳۲۱ و API روی ۸۰۰۱ باقی است.

Git پروژه در شروع این کار همهٔ فایل‌ها را untracked داشت؛ checkpoint شامل baseline نامرتبط ساخته نشد. شواهد RED/GREEN به‌جای ادعای کامیت موجود، در همین پوشه و ترمینال ثبت شدند.

موارد بررسی‌نشده: همهٔ امکانات خاص Excalidraw Obsidian (رندر LaTeX/Markdown داخل نقاشی، iframe و انتخاب group/frame)، همهٔ دستگاه‌ها و UI/UX نهایی. سرویس خارجی GeoGebra به شبکه نیاز دارد؛ استقرار عمومی viewer به hostname HTTPS جدا نیاز دارد. نسخه‌های رسمی dependency دارای هشدار bundle بزرگ و directiveهای React هنگام build هستند؛ موتور Excalidraw با dynamic import فقط در حضور نقاشی نزدیک viewport دریافت می‌شود.
