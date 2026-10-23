# شواهد اصلاح جریان ورود و ثبت‌نام

## محدوده و یافته

صفحهٔ واقعی `frontend/src/pages/account.astro` بررسی شد. کنترل‌های بومی ورود/ثبت‌نام از قبل وجود داشتند، اما تغییر حالت هیچ listener نداشت؛ نام برای ثبت‌نام همچنان مخفی و غیرفعال بود و autocomplete رمز تغییر نمی‌کرد. ارسال فرم نیز به `event.submitter.value` وابسته بود، در حالی که دکمه value نداشت؛ ارسال بدون submitter خطای null ایجاد می‌کرد.

بهبود محدود این اجرا: فعال‌کردن تفکیک واقعی دو حالت در همین صفحه. ثبت‌نام نام اختیاری را نشان می‌دهد، autocomplete را به `new-password` و اقدام اصلی را به «ساخت حساب» تغییر می‌دهد؛ ورود نام را مخفی/غیرفعال می‌کند و autocomplete و اقدام ورود را بازمی‌گرداند. راهنمای فارسی رمز در ثبت‌نام بازهٔ موجود ۱۲ تا ۲۵۶ نویسه را توضیح می‌دهد. ارسال با حالت انتخاب‌شده انجام می‌شود و به submitter وابسته نیست.

هیچ endpoint، قرارداد نشست، سیاست رمز، پایگاه داده، Markdown، فونت، DESIGN.md یا CSS مشترک تغییر نکرد. ورود فقط email/password می‌فرستد و ثبت‌نام full_name اختیاری موجود را حفظ می‌کند. ورودی‌ها در خطای شبکه پاک نمی‌شوند. رادیوهای بومی label و fieldset/legend موجود را حفظ می‌کنند. این کار ممیزی کامل دسترس‌پذیری نیست.

## مطالعهٔ مقدماتی

AGENTS.md، CLAUDE.md، پنج سند اجباری 00 تا 04، docs/DESIGN.md، manifest ریشه و frontend و pyproject.toml خوانده شدند. ابزار read_file سند 04 را binary گزارش کرد؛ فایل با Python 3 و decode UTF-8 خوانده شد، بدون تغییر خود سند. دستور bare python در محیط موجود نبود؛ Python 3 جایگزین شد. ابزار skill ابتدا نام تایپی و سپس نام مبهم داشت؛ مهارت بومی software-development/test-driven-development و frontend-a11y بارگذاری شدند. هیچ نصب یا credential استفاده نشد.

## TDD و خروجی واقعی

قبل از تغییر کد تولیدی، تست موجود تغییر حالت اجرا شد و شکست خورد. سپس تست ارسال implicit و قرارداد payload در همان فایل tests/frontend/auth.test.mjs افزوده شد و دوباره خروجی قرمز مشاهده شد:

```text
node --test --test-isolation=none tests/frontend/auth.test.mjs
✖ account defaults to login and switches registration using native labeled radio controls
  true !== false (name.disabled after selecting register)
✖ implicit submit uses selected auth mode and preserves endpoint payload contracts
  TypeError: Cannot read properties of null (reading 'value')
ℹ tests 2
ℹ pass 0
ℹ fail 2
```

پس از اصلاح، تست قرارداد ابتدا به تفاوت prototype اشیای JSDOM/Node برخورد کرد؛ دادهٔ ثبت‌شده در مرز تست با JSON نرمال شد. کد تولیدی برای این مسئله تغییر نکرد. خروجی نهایی:

```text
node --test --test-isolation=none tests/frontend/auth.test.mjs
✔ account defaults to login and switches registration using native labeled radio controls
✔ implicit submit uses selected auth mode and preserves endpoint payload contracts
ℹ tests 2
ℹ pass 2
ℹ fail 0

pnpm test
ℹ tests 50
ℹ pass 50
ℹ fail 0
ℹ skipped 0
```

## انواع، check و build

هر سه دستور واقعاً اجرا شدند؛ موفقیت build به معنی موفقیت check نیست. shell دستورات را پشت سر هم اجرا کرد و exit نهایی موفق build نباید خطاهای دو دستور قبلی را پنهان کند.

```text
pnpm tsc
src/scripts/workspace-model.mjs: TS7006 / TS7053
8 diagnostics: request, onChange, results indexing, data, item
Command failed with exit code 2 (frontend tsc)

pnpm check
Result (35 files):
- 8 errors
- 0 warnings
- 0 hints
Command failed with exit code 1

pnpm build
[build] Server built in 75.55s
[build] Complete!
```

خطاهای نوع فقط در `frontend/src/scripts/workspace-model.mjs` خارج از محدودهٔ auth گزارش شدند. این فایل تغییر داده نشد؛ tsc و check دوباره اجرا شدند و همان ۸ خطا باقی ماند. هیچ diagnostic برای account.astro گزارش نشد. هشدارهای build: پوشه/collection محتوای Starlight خالی، نادیده‌گرفتن use client در ماژول‌های Radix و chunkهای بزرگ‌تر از ۵۰۰kB. این هشدارها حذف یا پنهان نشدند.

## محدودیت شواهد و تحویل

تست‌ها اسکریپت واقعی account.astro را با TypeScript transpile در JSDOM اجرا می‌کنند و فقط مرز API را stub می‌کنند؛ این شواهد ورود واقعی یا ایجاد حساب در دیتابیس نیست. حساب زنده، مرورگر واقعی، اندازه‌های موبایل، صفحه‌خوان و WCAG کامل در این اجرا تأیید نشده‌اند. مانع تحویل کاملاً سبز: ۸ خطای نوع خارج از auth.

فقط این سه فایل در این کار تغییر/ایجاد شدند:
- frontend/src/pages/account.astro
- tests/frontend/auth.test.mjs
- docs/UI-AUTH-VERIFICATION.md

ویرایش فایل‌های موجود با patch V4A انجام شد. مخزن از ابتدا untracked بود؛ هیچ پاک‌سازی، stage یا commit انجام نشد.

## تکمیل محدود تجربهٔ حساب — اجرای بعدی

تفکیک حالت قبلی حفظ شد. فقط صفحهٔ حساب و تست اختصاصی آن اصلاح شدند: خطای ورود 401 اکنون نادرستی ایمیل یا رمز را بدون مشخص‌کردن وجود حساب توضیح می‌دهد؛ 409 ثبت‌نام دیگر پیام تعارض نسخهٔ جزوه نیست. 422، 403، 429، خطای سرویس و قطع ارتباط پیام فارسی و راه بازیابی دارند. ورودی‌ها در خطا حفظ می‌شوند. autocomplete ایمیل در ورود `username` و در ثبت‌نام `email` است؛ قرارداد رمز قبلی حفظ می‌شود.

ارسال معلق با نگهبان هم‌زمانی، دکمهٔ غیرفعال، متن بارگذاری و `aria-busy` مشخص می‌شود. رادیوهای حالت در همان بازه غیرفعال می‌شوند؛ پس از خطا کنترل‌ها برای تلاش مجدد فعال می‌شوند. اعتبارسنجی بومی حفظ شده و رویداد invalid متن رفع مشکل مرتبط با ورودی، `aria-invalid` و نقش alert ایجاد می‌کند؛ submit مصنوعی نیز پیش از تماس API اعتبارسنجی می‌شود. ورودی نام همچنان اختیاری است.

صفحه از قبل پس از ورود redirect نمی‌کرد؛ این رفتار حفظ شد، نه افزودن پارامتر next. آزمون موفقیت با مقاصد خارجی، protocol-relative و javascript تأیید می‌کند که پارامتر next نادیده گرفته و فقط پیوند ثابت `/workspace` ارائه می‌شود.

شواهد TDD واقعی، هر بار پیش از تغییر تولیدی:
- خطای auth: `login 401: understandable recovery message` (۲ پاس، ۱ شکست).
- درخواست تکراری: `2 !== 1` (۳ پاس، ۱ شکست).
- autocomplete ورود: `email` به‌جای `username` (۴ پاس، ۱ شکست).
- اعتبارسنجی: تماس API برای ایمیل نامعتبر، `1 !== 0` (۵ پاس، ۱ شکست).
- پس از هر اصلاح، همان فایل سبز شد. آزمون redirect برای رفتار امن موجود از ابتدا سبز بود و تغییر تولیدی برای آن انجام نشد.

خروجی نهایی مشاهده‌شده:
```text
node --test --test-isolation=none tests/frontend/auth.test.mjs
7 tests, 7 pass, 0 fail
pnpm --dir frontend test
60 tests, 60 pass, 0 fail
pnpm --dir frontend tsc
exit 2: 8 diagnostics, all in src/scripts/workspace-model.mjs
pnpm --dir frontend check
36 files: 8 errors, 0 warnings, 0 hints; all errors in workspace-model.mjs
pnpm --dir frontend build
Server built in 85.70s; Complete!; exit 0
.venv/bin/pytest -q tests/test_workspace.py::test_auth_session_csrf_role_and_logout
1 skipped in 0.92s (TEST_DATABASE_URL absent; dedicated DB required)
```

هشدارهای build مربوط به محتوای خالی Starlight، use client کتابخانهٔ Radix و chunkهای بزرگ باقی هستند. تست اختصاصی اسکریپت واقعی حساب و کلاس ApiError/message واقعی را اجرا می‌کند ولی مرز API stub است. JSDOM جایگزین مرورگر واقعی، اعتبارسنجی طول وابسته به ورود کاربر، صفحه‌خوان یا حساب زنده نیست. API/سیاست نشست تغییر نکرد. workspace، styles، reader و graph توسط این کار تغییر نکردند؛ هیچ commit انجام نشد.
