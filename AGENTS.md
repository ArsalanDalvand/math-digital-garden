# Math Digital Garden — دستورالعمل‌های اجرایی مهندسی (Agent Guidelines)

> **سند مرجع اصلی بازطراحی و ارتقا:** [REFACTORING-MASTER-PLAN.md](docs/REFACTORING-MASTER-PLAN.md)
> دستیار هوش مصنوعی قدیمی (Dify) تا زمان پیاده‌سازی **فاز ۵ (Native Hybrid Graph-RAG)** عمداً غیرفعال و ایزوله شده است (`ai_enabled = False`). هنگام اجرای فازهای ۱ تا ۴ هرگز به سراغ اصلاح Dify نروید، اما جداول و زیرساخت `pgvector` و تاریخچهٔ پایگاه‌داده را دست‌نخورده نگه دارید.

این پروژه یک **محیط یادگیری و پایگاه دانش ریاضیات** بر پایهٔ یادداشت‌های اتمیک مارک‌داون (Obsidian) همراه با گراف دانش، انشعاب شخصی، پیشنهاد اصلاح (PR/Diff)، و پشتیبانی کامل از فرمول‌ها و نمودارهای تعاملی است.

---

## ۱. معماری و پشتهٔ فناوری فعلی (فاز ۱ و ۲ تکمیل‌شده)

### فرانت‌اند (`frontend/`)
- **فریم‌ورک:** **Astro 5** خالص با آداپتر `@astrojs/node` (SSR + صفحات استاتیک بدون Starlight، بدون `@astrojs/tailwind` v3 و بدون `vite-plugin-node-polyfills`).
- **سیستم طراحی و CSS:** **Tailwind CSS v4** همراه با توکن‌های یکپارچهٔ OKLCH در `frontend/src/styles/` (`tokens.css`, `base.css`, `prose.css`, `workspace-shell.css`, `app.css`) با تم روشن/تیره (`.theme-switching` frame guard) و پشتیبانی بومی RTL/BiDi. از توکن‌های `--sl-*` استفاده نکنید.
- **جزایر تعاملی (React 19 + shadcn/ui + Nano Stores):**
  - وضعیت مشترک بین جزایر در `frontend/src/stores/garden.ts` (`$theme`, `$identity`, `$activeNote`, `$graphUi`).
  - گراف دانش ماژولار: الگوریتم‌ها و موتور Canvas در `frontend/src/lib/graph/` (`types.ts`, `schema.ts`, `dag-layout.ts`, `canvas-engine.ts`) و رابط کاربری React در `frontend/src/components/graph/` (`GraphWidget.tsx`, `GraphFullscreenModal.tsx` با `createPortal`, `GraphTooltip.tsx`, `GraphSettingsPopover.tsx`).
  - تنظیمات حساب: `frontend/src/components/account/AccountSettingsPanel.tsx` و منوی کاربری در `AccountMenu.tsx`.
- **رندر محتوای ریاضی و علمی:** KaTeX (یکپارچه در تک‌چانک `vendor-katex`), CodeMirror 6, MathLive, Mermaid, Excalidraw, Canvas و GeoGebra (بارگذاری تنبل با حفظ ۱۰۰٪ سازگاری مارک‌داون).
- **APIهای On-Demand (سبک‌سازی SSR):** `/api/graph.json`, `/api/notes/[slug].json`, `/api/note-links.json` با کشینگ ETag/304 (بدون تزریق HTML پیش‌رندر حجیم در صفحات یادداشت).

### بک‌اند (`backend/`)
- **فریم‌ورک:** **FastAPI (Python 3.12)** + **PostgreSQL 16 + pgvector**.
- عملیات همزمان/طولانی Git و ZIP از حلقهٔ رویداد Async با `run_in_threadpool` جدا شده است و ایمپورت از مخزن با بررسی دقیق آرگومان‌ها و `-c core.hooksPath=/dev/null` امن‌سازی شده است.

---

## ۲. قوانین الزامی و خطوط قرمز مهندسی

1. **قانون عدم اتلاف داده در مارک‌داون (Zero Round-Trip Loss):** متن در تمام لایه‌ها **Markdown خام** باقی می‌ماند؛ ساختار فرمول‌ها، کال‌اوت‌ها و بلاک‌های Obsidian/GeoGebra/Excalidraw دستکاری نمی‌شود.
2. **حفظ داده‌های تولید (Zero Data Loss Deployment):**
   - هرگز Volumeهای PostgreSQL، فایل `.env`، `frontend/src/lib/vault-assets.json` یا پوشهٔ `frontend/public/vault/abstract-algebra-and-matrices/` روی سرور `math-garden` حذف یا بازنویسی نشوند.
   - وابستگی‌های توسعه مانند `@biomejs/biome` و `@playwright/test` فقط در `devDependencies` ریشهٔ پروژه نصب شوند تا بیلد آفلاین سرور (`pnpm --filter frontend install --offline`) دچار کمبود بسته نشود.
3. **ایزولاسیون دسترسی کاربری (Zero IDOR):** در هر کوئری انشعاب شخصی، پیشنهاد اصلاح یا بازیابی کاربری، شرط `user_id = current_user_id` در سطح دیتابیس الزامی است.
4. **تایپوگرافی دوزبانه (BiDi / RTL Safety):** متن فارسی `direction: rtl` است و تمامی فرمول‌ها (`.katex`, `.katex-display`, `math-field`, `[data-math-field]`, `.atomic-display-math`, `.atomic-inline-math`) و قطعه کدها (`code, pre`) باید `direction: ltr !important; unicode-bidi: isolate;` بمانند.
5. **توسعهٔ آزمون‌محور و کیفیت کد (Strict TDD + E2E First):**
   - کد جدید با تست مشخص و مشاهدهٔ اجرای واقعی در ترمینال نوشته می‌شود.
   - تست‌های شکنندهٔ regex روی متن سورس ممنوع‌اند؛ تست‌ها به سه لایه تقسیم می‌شوند: تست‌های واحد خالص (`tests/frontend/*.test.mjs`)، تست یکپارچگی SSR (`tests/integration/reader.test.mjs`)، تست‌های مرورگر Playwright (`tests/e2e/*.spec.ts` با حساسیت صفر خطای کنسول/صفحه) و تست‌های FastAPI (`tests/*.py`).

---

## ۳. دستورات کلیدی گردش کار (Workflow Commands)

### بررسی کیفیت، تایپ و تست یکپارچه
- بررسی تایپ‌اسکریپت: `pnpm tsc`
- لینتر فرانت‌اند (Biome v2): `pnpm lint` (یا اصلاح خودکار: `pnpm lint:fix`)
- تست‌های واحد فرانت‌اند: `pnpm test`
- بیلد تولید فرانت‌اند: `pnpm build`
- تست SSR ریدر: `pnpm test:reader`
- تست‌های سرتاسری مرورگر (Playwright): `pnpm test:e2e` (یا علیه سرور زنده: `BASE_URL=https://test.atomathix.ir pnpm test:e2e`)
- تست‌ها و لینتر بک‌اند: `.venv/bin/pytest -q` و `pnpm lint:py`
- اجرای کامل پایپ‌لاین محلی: `pnpm test:all`

---

## ۴. نقشهٔ اسناد فنی تکمیلی (`docs/`)
- `docs/REFACTORING-MASTER-PLAN.md` — نقشهٔ راه جامع و وضعیت فازها
- `docs/00-PRD.md` — اهداف محصول و نیازمندی‌های کارکردی
- `docs/01-ARCHITECTURE-AND-TECH-STACK.md` — معماری دیتابیس، ادیتور و استایل دوزبانه
- `docs/02-CONTENT-AND-MARKDOWN-SPEC.md` — مشخصات محتوای اتمیک و سینتکس آبسیدین
- `docs/04-DEVELOPMENT-PROTOCOLS.md` — پروتکل‌های تست، امنیت و نگهداری داده
