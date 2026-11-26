# مرجع UX پروژهٔ Docmost

بررسی در ۲۰۲۶-۱۰-۱۶ برای اصلاح پوستهٔ پروژهٔ قدیمی `math-digital-garden`.

- مخزن: https://github.com/docmost/docmost
- commit بررسی‌شده: `744c82bdf86f454ca44a2e19dc150900e884a11e`
- clone پژوهشی: `/home/a7vat4r/.tmp/docmost-ux`؛ جزو checkout محصول نیست.
- تصاویر README: [خانه](home.png) از `https://docmost.com/screenshots/home.png` و [ویرایشگر](editor.png) از `https://docmost.com/screenshots/editor.png`؛ تصاویر سایت ممکن است با commit کد هم‌زمان نباشند.
- مجوز هستهٔ Docmost: AGPL-3.0؛ کدی از آن وارد محصول نشده است. تصاویر صرفاً مرجع پژوهش محلی‌اند.

## الگوهای بررسی‌شده و کاربردشان

| الگوی Docmost | تصمیم در باغ ریاضی |
| --- | --- |
| پوستهٔ ثابت، سایدبار جمع‌شونده و محتوای مرکزی | پوستهٔ فعلی حفظ شد؛ ارتفاع هدر و offset فهرست موبایل ۵۸ پیکسل است. |
| تفکیک ناوبری عمومی از اعمال صفحه | خواندن/نوشتن کنار عنوان؛ جست‌وجو و حساب در گروه عمومی؛ اعمال فرعی موبایل در «بیشتر». |
| وضعیت فعال واضح در سایدبار | وضعیت موجود یادداشت حفظ شد؛ خانه، جست‌وجو، جزوه‌های من و بازبینی نیز `aria-current` و نشان بصری دارند. |
| سطح آرام با عنوان سند مشخص | عنوان تکراری پوسته در حضور h1 سند پنهان می‌شود؛ Markdown و anchorها حفظ می‌شوند. |
| ابزار جانبی در پنل مستقل | پنل موجود ابزار مطالعه حفظ شد؛ منوهای فهرست و تنظیمات با Escape، فوکوس و وضعیت واقعی هماهنگ شدند. |
| اعمال کم‌کاربرد در overflow | ارتفاع موبایل از سه ردیف به یک ردیف کاهش یافت؛ هزینهٔ دسترسی به تنظیمات یک کلیک اضافه است. |

کدهای مرجع در clone:

- `apps/client/src/components/layouts/global/global-app-shell.tsx`
- `apps/client/src/components/layouts/global/app-header.tsx`
- `apps/client/src/components/layouts/global/global-sidebar.tsx`
- CSSهای `app-shell.module.css`، `app-header.module.css` و `global-sidebar.module.css` در همان بخش.

هدر ۴۵ پیکسلی و resize سایدبار Docmost عیناً کپی نشدند: باغ برای لمس هدف ۴۴ پیکسلی و جهت RTL دارد. قابلیت AI، همکاری هم‌زمان، قالب‌ها، resize سایدبار و backend آن خارج از این اصلاح‌اند.

اصول و قواعد بازبینی از `../better-design/` و شواهد رندرشدهٔ خود باغ استفاده شدند. طبق دستور نهایی کاربر، اتصال و تأیید MCP لازم نیست؛ هیچ امتیاز یا تأیید زندهٔ Better Design ادعا نمی‌شود.

نتیجهٔ آزمون و محدودیت‌ها: `../../../math-digital-garden/docs/17-HEADER-UX-AUDIT.md`.

## مرحلهٔ دوم: ساختار فضای کار — 2026-10-16

بررسی کد `features/page/components/header/page-header-menu.tsx` و
`features/space/components/sidebar/space-sidebar.tsx` به تغییر ساختاری انجامید:
جست‌وجو در ابتدای سایدبار، نوار مستقل سند، کنترل ثابت خواندن/نوشتن، تنظیمات
مطالعه کنار متن و منوی اختصاصی اعمال یادداشت. فهرست سرفصل‌های متن قابل‌مشاهده
و باز/بسته کردن پنل مطالعه نیز در همان نوار قرار دارند.

شرح پذیرش، دامنه و شواهد تازه در
`../../../math-digital-garden/docs/18-DOCMOST-WORKSPACE-UX.md` است.
جدول بخش قبلی شرح checkpoint پیشین است؛ اندازه‌ها و نتایجش به نسخهٔ جدید تعمیم داده نشوند.
