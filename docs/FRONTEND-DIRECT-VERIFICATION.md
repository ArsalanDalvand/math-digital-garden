# بررسی مستقیم فرانت توسط Hermes

## مالک اجرا
بعد از اصلاح کاربر، فرآیند Codex متوقف شد. تغییرات زیر و اجرای این بررسی توسط Hermes انجام شده‌اند؛ نتایج قبلی Codex به عنوان تأیید این بررسی تلقی نمی‌شوند.

## اصلاحات مستقیم
- چرخه ویرایش → رسمی → ویرایش: مخفی کردن مقاله هنگام بازگشت به ویرایشگر، هماهنگی نشانگر نسخه و context؛ حفظ نمونه EditorView و متن.
- تابع کوچک reading-mode.mjs و دو تست RED سپس GREEN.
- حفظ hidden واقعی برای فیلد ثبت‌نام و فرم‌ها باوجود display:grid؛ آزمون واقعی تعویض login/register.
- کاهش فاصله عنوان و معرفی خانه بدون JavaScript و layout shift؛ اهداف ناوبری حداقل 44px.
- فرم حساب محدود به 32rem، فاصله کمتر در موبایل و حذف فضای وضعیت خالی.
- favicon SVG محلی بدون وابستگی.

## نتایج ابزار
- pnpm test: 71 موفق، صفر شکست؛ exit 0.
- pnpm check: صفر خطا/هشدار تشخیصی؛ exit 0.
- pnpm tsc: exit 0.
- pnpm build نهایی: exit 0؛ خروجی /tmp/math-final-build.log. هشدارهای chunks بزرگ و نبود collection Starlight باقی‌اند.
- تست مرورگر tests/browser/workspace-page.test.mjs: 6 موفق، صفر شکست با Playwright و API mock؛ این تست حساب واقعی نیست.
- tests/browser/editor-mode.mjs: چرخه ویرایش واقعی CodeMirror و مخفی شدن فیلد ثبت‌نام پاس شدند؛ workspace API mock، renderer واقعی.
- ماتریس 28 مشاهده مرورگر روی 7 مسیر در desktop/mobile 320px و light/dark: HTTP 200، یک H1، بدون overflow افقی سند و بدون pageerror. theme به صورت صریح اعمال شد؛ این آزمون به تنهایی persistence کنترل پوسته را ثابت نمی‌کند.
- agent-browser مستقلاً برای خانه، حساب، جستجو و reader اجرا شد؛ تصاویر نهایی /tmp/math-home-final.png و /tmp/math-account-final.png.

## سرویس‌ها و مشکلات کشف‌شده
پورت 8000 متعلق به یک FastAPI دیگر (OCR) است، نه این پروژه. API باغ ریاضی روی 8001 از /openapi.json و /api/notes تأیید شد. preview مستقل روی 4338 با API_BASE_URL=http://127.0.0.1:8001 اجرا شد. سرویس‌های دیگر دست‌کاری نشدند. نسخه قدیمی روی 4321 بعد از build به hashهای حذف‌شده اشاره می‌کرد و 404 دارایی داشت؛ تست اولیه روی آن رد شد، سپس روی سرور مستقل فعلی پاس شد.

## محدودیت‌ها
Dify live، کیفیت پاسخ مدل، ورود/ثبت‌نام واقعی، امنیت چندکاربری و بررسی دستی صفحه‌خوان در این دور تأیید نشده‌اند. بنابراین ادعای محصول کامل یا WCAG کامل نمی‌شود. فایل ماتریس و تصاویر: docs/verification/frontend-redesign/direct/. تغییرات خام Markdown، DB و credentialها انجام نشده‌اند. commit/push انجام نشده است.
