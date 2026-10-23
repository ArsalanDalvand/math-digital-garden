# سند معماری و تچ‌استک فنی (Architecture & Tech Stack)

> **تصمیم جدید تأییدشده AI:** پیش از توسعه، [تصمیم Dify و تحویل Codex](08-DIFY-DECISION-AND-CODEX-HANDOFF.md) را بخوانید. در تعارض بخش AI، آن سند بر دستورهای قدیمی این فایل مقدم است. شروع از بررسی کد موجود و برش B است، نه بازسازی فاز اول. حذف کد اضافه با حفظ قابلیت بازیابی مجاز است؛ حذف داده، والت، volume و اسرار مجاز نیست. پژوهش مکمل‌ها در `docs/07-DIFY-PLUGINS-RESEARCH.md` ثبت شده است.

## پایگاه دانش و محیط یادگیری ریاضیات — Math Digital Garden

وضعیت: مصوب نسخهٔ ۲ (منطبق با PRD بازنگری‌شده، چرخهٔ انشعاب شخصی، پیشنهاد اصلاح و هوش مصنوعی مقید)

---

## ۱. معماری کلان سیستم (High-Level Architecture)

معماری سامانه بر پایهٔ سه لایهٔ متصل و مستقل طراحی شده است که **قالب Markdown را به عنوان زبان مشترک (Single Source of Truth)** در تمام مسیر حفظ می‌کنند:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      لایهٔ نگارش مؤلف (Authoring)                      │
│     Obsidian Local Vault  ◄──────(git pull / push)──────►  مخزن گیت    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ همگام‌سازی یادداشت‌های رسمی
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     لایهٔ هسته و سرویس‌ها (Backend)                    │
│            FastAPI (Python 3.12) + PostgreSQL 16 + pgvector            │
│  ├─ سرویس احراز هویت و نشست‌های کاربری (Auth & Sessions)                │
│  ├─ سرویس یادداشت‌های رسمی و انشعاب‌های شخصی (Notes & Personal Forks)   │
│  ├─ موتور محاسبه و بازبینی تفاوت‌ها (Diff Engine: diff-match-patch)    │
│  ├─ چرخهٔ پیشنهاد اصلاح و ثبت کامیت گیت (Change Proposal & Git Commits) │
│  └─ موتور هوش مصنوعی مقید با ایزولاسیون کاربری (Grounded Math RAG)     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ REST API / WebSocket
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   لایهٔ ارائه و رابط کاربری (Frontend)                 │
│                      Astro / HTMX + Tailwind CSS                       │
│  ├─ موتور رندر ریاضیات دوزبانه: KaTeX + استایل‌های ایزوله BiDi          │
│  ├─ ویرایشگر درجا و لایو پریویو: CodeMirror 6 (موتور اصلی آبسیدین)     │
│  ├─ ورودی و کیبورد لمسی فرمول‌های ریاضی: MathLive                      │
│  ├─ نمایشگر دوتایی تفاوت‌ها: CodeMirror 6 MergeView                    │
│  └─ رندر شبیه‌سازها و توابع هندسی: GeoGebra Web API                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ۲. جدول انتخاب فناوری‌ها و چرایی فنی (Tech Stack & Rationale)

| لایه / مؤلفه | فناوری انتخاب‌شده | چرایی فنی و مزیت نسبت به رقبا |
| :--- | :--- | :--- |
| **هستهٔ بک‌اند** | **FastAPI (Python 3.12)** | عملکرد بالا، Asyncio نیتیو، اعتبارسنجی دقیق با Pydantic V2، و قرار داشتن در اکوسیستم غنی پردازش متن و مدل‌های زبانی پایتون. |
| **پایگاه داده اصلی و برداری** | **PostgreSQL 16 + pgvector** | دیتابیس رابطه‌ای اثبات‌شده برای داده‌های تراکنشی؛ افزونهٔ `pgvector` نیاز به دیتابیس برداری جداگانه را حذف می‌کند و اجازه می‌دهد فیلتر امنیت دسترسی مستقیماً در کوئری SQL اجرا شود. |
| **لایه ORM و میگریشن** | **SQLAlchemy 2.0 + Alembic** | ORM استاندارد و Type-Safe پایتون با پشتیبانی از Async Sessions و کنترل دقیق ساختار پایگاه داده. |
| **موتور محاسبهٔ تفاوت‌ها (Diff)** | **Google diff-match-patch** | سریع‌ترین و پایدارترین کتابخانهٔ محاسبهٔ تفاوت و اعمال پچ روی متون مارک‌داون بدون برهم‌زدن فرمول‌ها و کاراکترهای یونیکد. |
| **فریم‌ورک رابط کاربری** | **Astro 5 (حالت Hybrid/SSR)** | سرعت لود اولیه در سطح HTML استاتیک، بدون ارسال جاوااسکریپت اضافی به کلاینت (Zero JS by default) برای بخش مطالعه، با امکان افزودن جزیره‌های تعاملی برای ویرایشگر. |
| **ویرایشگر متن (Editor Engine)** | **CodeMirror 6** | **دقیقاً همان موتوری که ادیتور Live Preview نرم‌افزار Obsidian روی آن ساخته شده است.** پشتیبانی نیتیو و بی‌نقص از متن دوزبانه (BiDi/RTL)، معماری مبتنی بر اکستنشن، و حفظ ۱۰۰٪ فرمت خام Markdown بدون تبدیل مخرب به JSON. |
| **ورودی و کیبورد فرمول ریاضی** | **MathLive (`<math-field>`)** | وب‌کامپوننت آماده برای تایپ بصری فرمول‌های ریاضی و کیبورد لمسی روی موبایل/تبلت با خروجی مستقیم لایتک استاندارد. |
| **نمایشگر مقایسه تفاوت‌ها (Diff Viewer)** | **CodeMirror MergeView** | کامپوننت رسمی CodeMirror برای نمایش دوطرفه و سایدبای‌ساید خطوط تغییریافته شبیه به نمای Pull Request در گیت‌هاب. |
| **موتور رندر فرمول‌ها** | **KaTeX** | رندر سریع ریاضیات در زمان بیلد/سرور بدون پرش چیدمان (No Layout Shift) و سبک‌تر از MathJax. |
| **رسم‌های تعاملی ریاضی** | **GeoGebra Web API (`deployggb.js`)** | استاندارد جهانی رسم توابع و هندسه با بارگذاری تنبل (`client:visible`) روی کدبلاک‌های `geogebra`. |
| **تایپوگرافی فارسی** | **@fontsource/vazirmatn** | خواناترین و استانداردترین فونت وب فارسی با پشتیبانی کامل از اعراب و هماهنگی بصری با قلم‌های ریاضی. |

---

## ۳. مدل پایگاه داده (Data Models & Schemas)

مدل داده‌ها در پایگاه داده PostgreSQL به‌گونه‌ای طراحی شده که تفکیک نسخهٔ رسمی، انشعاب‌های شخصی و پیشنهادهای اصلاح را با بالاترین یکپارچگی ارجاعی حفظ کند:

```sql
-- ۱. جدول کاربران
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'student', -- 'student' | 'author' | 'admin'
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ۲. جدول یادداشت‌های رسمی (Canonical Notes)
CREATE TABLE canonical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,       -- e.g. "qaziyeh-12-uncountable"
    title VARCHAR(500) NOT NULL,
    book_slug VARCHAR(100) NOT NULL,         -- e.g. "foundations-math"
    chapter_slug VARCHAR(100) NOT NULL,      -- e.g. "chapter-5-cardinality"
    relative_path VARCHAR(500) NOT NULL,     -- مسیر متناظر در والت آبسیدین
    current_content TEXT NOT NULL,           -- متن خام Markdown
    current_hash VARCHAR(64) NOT NULL,       -- SHA-256 هش نسخهٔ جاری
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ۳. جدول انشعاب‌های شخصی دانشجویان (Personal Forks)
CREATE TABLE user_note_forks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id UUID NOT NULL REFERENCES canonical_notes(id) ON DELETE CASCADE,
    base_hash VARCHAR(64) NOT NULL,          -- هش نسخه‌ای از یادداشت رسمی که این تغییر روی آن آغاز شده
    custom_content TEXT NOT NULL,            -- متن ویرایش‌شدهٔ اختصاصی دانشجو
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_user_note UNIQUE (user_id, note_id)
);

-- ۴. جدول پیشنهادهای اصلاح (Change Proposals / PRs)
CREATE TABLE change_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id UUID NOT NULL REFERENCES canonical_notes(id) ON DELETE CASCADE,
    base_hash VARCHAR(64) NOT NULL,          -- نسخهٔ مبدأ در لحظهٔ ارسال پیشنهاد
    proposed_content TEXT NOT NULL,          -- کپی منجمد از متن پیشنهادی
    diff_patch TEXT NOT NULL,                -- متن پچ تولیدشده توسط diff-match-patch
    student_comment TEXT,                    -- یادداشت و دلیل اصلاح توسط دانشجو
    status VARCHAR(50) DEFAULT 'pending',    -- 'pending' | 'approved' | 'rejected' | 'changes_requested'
    author_review_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- ۵. جدول بردارهای هوش مصنوعی (RAG Embeddings)
CREATE TABLE note_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES canonical_notes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL برای یادداشت رسمی؛ پر شده برای نسخهٔ شخصی
    is_canonical BOOLEAN NOT NULL DEFAULT true,
    chunk_index INT NOT NULL,
    chunk_header VARCHAR(500),               -- e.g. "قضیه ۱۲: اثبات به روش قطری"
    chunk_content TEXT NOT NULL,
    embedding vector(1536),                  -- ابعاد بردار با توجه به مدل انتخابی
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embeddings_scope ON note_embeddings(is_canonical, user_id);
```

---

## ۴. چرخهٔ ویرایش شخصی و پیشنهاد اصلاح (Fork & PR Workflow)

این چرخه به صورت یک ماشین حالت (State Machine) دقیق پیاده‌سازی می‌شود:

```
[۱. مطالعهٔ جزوهٔ رسمی]
        │
        ▼ (کاربر روی دکمهٔ «ویرایش در این جزوه» کلیک می‌کند)
[۲. ایجاد یا بارگذاری انشعاب شخصی (Personal Fork)]
        ├─ اگر رکورد در `user_note_forks` وجود ندارد: ساخته می‌شود با `base_hash = canonical.current_hash`
        └─ ادیتور CodeMirror 6 با متن شخصی باز می‌شود.
        │
        ▼ (ذخیرهٔ پیوسته با Autosave Debounce 1000ms در بک‌اند)
[۳. ذخیره در حساب دانشجو]
        │
        ├─ حالت الف: دانشجو فقط برای خودش نگه می‌دارد (پایان کار).
        │
        └─ حالت ب: دانشجو روی «ارسال پیشنهاد اصلاح به مؤلف» کلیک می‌کند:
                 │
                 ▼
[۴. ایجاد ردیف در `change_proposals`]
        ├─ محاسبهٔ تفاوت‌ها با Google diff-match-patch بین `canonical.current_content` و `fork.custom_content`
        ├─ انجماد متن پیشنهادی در جدول پیشنهادها (ویرایش بعدی دانشجو روی این پروپوزال اثری ندارد)
        └─ وضعیت: `pending`
                 │
                 ▼
[۵. بررسی توسط مؤلف در داشبورد مدیریت]
        ├─ مقایسه در کامپوننت CodeMirror MergeView (سبز برای اضافه، قرمز برای حذف)
        ├─ بررسی هشدار تعارض: آیا `base_hash == canonical.current_hash` است؟
        │    └─ اگر خیر: سیستم به مؤلف هشدار می‌دهد که متن رسمی از زمان ارسال این پیشنهاد تغییر کرده است.
        │
        ├─ اقدام ۱: رد پیشنهاد یا درخواست تغییر با درج پیام بازخورد.
        │
        └─ اقدام ۲: تایید و ادغام (Merge):
                 ├─ پچ در `canonical_notes.current_content` اعمال می‌شود.
                 ├─ هش جدید `canonical_notes.current_hash` محاسبه و ذخیره می‌شود.
                 ├─ وضعیت پیشنهاد به `approved` تغییر می‌کند.
                 ├─ بردار embeddings یادداشت رسمی مجدداً محاسبه و ایندکس می‌شود.
                 └─ اسکریپت گیت محلی در سرور کامیت جدید روی ریپو می‌زند:
                    `git commit -m "Merge student proposal for {slug}: {comment}"`
                 │
                 ▼
[۶. دریافت در مخزن Obsidian مؤلف]
        مؤلف در کامپیوتر محلی خود با زدن یک دستور `git pull` ساده در مخزن والت،
        تغییر تاییدشده را مستقیماً در فایل‌های محلی آبسیدین خود دریافت می‌کند.
```

---

## ۵. معماری هوش مصنوعی مقید (Grounded Math RAG Engine)

برای جلوگیری از هرگونه نشت اطلاعات بین دانشجویان و توهم مدل، خط لولهٔ RAG به شرح زیر اجرا می‌شود:

### ۵.۱. تقطیع هوشمند بر پایهٔ ساختار مارک‌داون (Math-Aware Chunking)
به جای تقطیع متداول کاراکتری که فرمول‌ها و برهان‌ها را تکه‌تکه می‌کند، یک پارسر AST پایتونی یادداشت‌ها را بر اساس سرفصل‌ها و کادرها تقسیم می‌کند:
* هر قضیه به همراه عنوان و برهان آن (`> [!proof]`) به عنوان یک چانک یکپارچه استخراج می‌شود.
* فرانت‌متر، تگ‌ها و نام کتاب به عنوان متاداده به ابتدای چانک افزوده می‌شوند:
  `[کتاب: مبانی ریاضی | فصل ۵ | قضیه ۱۲: ناشمارایی کانتور]`

### ۵.۲. کوئری بازیابی با ایزولاسیون کامل حریم خصوصی (Strict Tenant Filtering)
هنگامی که دانشجو سؤالی مطرح می‌کند، جستجوی شباهت برداری با این فیلتر صریح در سطح دیتابیس اجرا می‌شود:

```python
# منطق کوئری بازیابی در FastAPI
query = """
SELECT chunk_content, chunk_header, is_canonical
FROM note_embeddings
WHERE (is_canonical = TRUE) OR (user_id = :current_user_id)
ORDER BY embedding <=> :query_embedding
LIMIT 5;
"""
```
**تضمین ریاضی:** محال است داده‌های دانشجوی A در نتیجهٔ بازیابی دانشجوی B ظاهر شوند؛ زیرا شناسهٔ `user_id` مستقیماً از نشست احراز هویت شده خوانده می‌شود.

### ۵.۳. ساخت پرامپت با استناد قطعی (Prompt & Citation Injection)
پاسخ مدل به این دستور مقید می‌شود:
> «تو دستیار آموزشی ریاضیات هستی. پاسخ خود را تنها بر اساس منابع زیر ارائه بده. نمادگذاری‌ها را تغییر نده. در انتهای هر بخش از استدلال، به صراحت ذکر کن که بر اساس کدام قضیه یا یادداشت استخراج شده است. اگر پاسخ در منابع نیست، بگو در جزوه ذکر نشده است.»

---

## ۶. استراتژی تایپوگرافی دوجهته (BiDi & RTL/LTR Strategy)

در فایل استایل‌های اصلی (`custom.css`) قوانین ایزولاسیون به شکل زیر تعریف می‌شوند تا متن فارسی و فرمول‌های LaTeX هیچ‌گونه تداخلی نداشته باشند:

```css
:root {
  --font-content: 'Vazirmatn', system-ui, -apple-system, sans-serif;
  --font-math: 'KaTeX_Main', 'KaTeX_Math', serif;
  --font-mono: 'JetBrains Mono', monospace;
}

/* ۱. بدنه و پاراگراف‌های فارسی */
[dir="rtl"] {
  direction: rtl;
  text-align: right;
  font-family: var(--font-content);
  line-height: 1.85;
}

/* ۲. ایزوله‌سازی قطعی فرمول‌های ریاضی و کدهای برنامه */
.katex,
.katex-display,
.math-inline,
.math-display,
code,
pre,
math-field {
  direction: ltr !important;
  text-align: left !important;
  display: inline-block;
  unicode-bidi: isolate;
}

/* ۳. فرمول‌های بلوکی عریض با اسکرول افقی مستقل */
.katex-display {
  display: block;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.75rem 0.5rem;
  margin: 1.25rem 0;
  -webkit-overflow-scrolling: touch;
}

/* ۴. استایل کال‌اوت‌های قضیه، برهان و تعریف */
.callout-theorem {
  border-right: 4px solid #10b981; /* زمردی */
  background: rgba(16, 185, 129, 0.05);
  border-radius: 0.375rem;
  padding: 1rem;
  margin: 1.25rem 0;
}

.callout-proof {
  border-right: 4px solid #f59e0b; /* کهربایی */
  background: rgba(245, 158, 11, 0.05);
  border-radius: 0.375rem;
  padding: 1rem;
  margin: 1.25rem 0;
}
```

---

## ۷. استراتژی استقرار و توسعه محلی (Deployment & Ops)

* **محیط توسعهٔ محلی (Development):**
  * بک‌اند: اجرای مستقیم با `uvicorn app.main:app --reload` روی پورت `8000`.
  * پایگاه داده: داکر کامپوز سبک شامل `postgres:16` با اکستنشن `pgvector`.
  * فرانت‌اند: اجرای سرور توسعهٔ Astro روی پورت `4321`.
* **محیط عملیاتی (Production):**
  * بک‌اند در یک کانتینر سبک Docker در کنار پایگاه دادهٔ اصلی.
  * پروکسی معکوس (Caddy یا Nginx) با کش خودکار برای فایل‌های استاتیک و روت‌های عمومی.
  * همگام‌سازی مخزن گیت یادداشت‌ها از طریق یک Deploy Key امن برای دسترسی خودکار به سرور گیت.
