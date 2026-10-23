# 🌿 پایگاه دانش و باغ دیجیتال ریاضیات (Math Digital Garden)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Astro 5](https://img.shields.io/badge/astro-5.x-BC52EE.svg)](https://astro.build/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2Bpgvector-336791.svg)](https://www.postgresql.org/)

**Math Digital Garden** یک سامانه یادگیری و پایگاه دانش متن‌باز، مدرن و تعاملی برای ریاضیات و علوم پایه است. این پلتفرم بر پایهٔ یادداشت‌های اتمیک مارک‌داون (سازگار با Obsidian)، مدیریت نسخه‌های شخصی (Personal Forks)، چرخهٔ پیشنهاد اصلاح و بازبینی (Proposals / Peer Review)، ویرایشگر زنده با پشتیبانی کامل از فرمول‌های ریاضی و BiDi/RTL، و اتصال به هوش مصنوعی مقید به متن (Grounded AI Tutor) طراحی شده است.

---

## 🌟 ویژگی‌های کلیدی (Key Features)

- 📝 **یادداشت‌های اتمیک و سازگاری کامل با Obsidian:**
  - پشتیبانی از پیوندهای دوطرفه (`[[wiki-links]]`)، ارجاع به تیترها و بلوک‌ها (`^block-id`).
  - رندر محلی و امن طراحی‌های تعاملی **Excalidraw** (`.excalidraw` و `.excalidraw.md`) و محیط‌های تعاملی **GeoGebra**.
  - اصل **Zero Round-Trip Loss** در نگهداری بایت‌های فایل‌های مارک‌داون و حفظ قالب‌بندی.

- 📐 **تایپوگرافی ریاضی و پشتیبانی پیشرفته از BiDi / RTL:**
  - رندر بدون تداخل عبارات ریاضی اینلاین و بلوکی با KaTeX و ایزولاسیون با `<bdi>` در متون راست‌به‌چپ (فارسی / عربی).
  - ویرایشگر CodeMirror 6 به همراه نوار ابزار فرمول‌نویسی **MathLive** برای تایپ آسان نمادهای ریاضی.

- 🌿 **شخصی‌سازی و انشعاب جزوات (Personal Forks & Workspace):**
  - مطالعه آزاد متن‌های رسمی بدون نیاز به حساب کاربری.
  - امکان ثبت‌نام و ایجاد نسخهٔ شخصی از هر جزوه، ذخیره خودکار، ثبت تاریخچهٔ ویرایش‌ها و مدیریت نشانه‌گذاری‌ها.
  - درخت کتابخانهٔ یکپارچه (Unified Library Tree) برای سازمان‌دهی یادداشت‌های رسمی و شخصی.

- 🤝 **چرخهٔ بازبینی و پیشنهاد اصلاح (Proposals & Merge View):**
  - ارسال پیشنهاد اصلاح از نسخهٔ شخصی برای مؤلف جزوه.
  - پنل بازبینی سه‌طرفه (Diff / MergeView) با امکان تأیید، رد یا درخواست بازنگری.
  - صدور خودکار کامیت محتوا در مخزن جداگانهٔ Git پس از تأیید نهایی.

- 🧠 **دستیار هوش مصنوعی و حل مسئله (Grounded AI Tutor):**
  - اتصال به خط‌لولهٔ Dify Chatflow و ارائه‌دهندگان سازگار با OpenAI.
  - قابلیت استناد مقید به متن: انتخاب بخشی از متن جزوه و دریافت توضیح مفهومی یا راهنمایی گام‌به‌گام بر اساس متن مرجع.

- 🎨 **رابط کاربری و دیزاین سیستم الهام‌گرفته از Notion:**
  - رابط کاربری مینیمال، تمیز و واکنش‌گرا (Responsive) با پشتیبانی کامل از حالت‌های تیره (Dark) و روشن (Light).
  - گراف ارتباطات یادداشت‌ها (Note Connection Graph).

---

## 🏗️ معماری سیستم (System Architecture)

```
┌────────────────────────────────────────────────────────┐
│               Frontend (Astro 5 + React)               │
│  - SSR & Static Generation (Node Standalone)           │
│  - CodeMirror 6 + MathLive + Excalidraw Engine         │
│  - Starlight Document Shell & Notion UI System         │
└───────────────────────────┬────────────────────────────┘
                            │ /api Proxy
┌───────────────────────────▼────────────────────────────┐
│               Backend (FastAPI + Python 3.12)          │
│  - SQLAlchemy 2.0 Async + Alembic Migrations           │
│  - Session Auth (Argon2id + Secure HttpOnly Cookies)   │
│  - Personal Workspace & Proposal Merge Engine          │
│  - RAG / Dify Chatflow Proxy & Content Sync            │
└───────────────────────────┬────────────────────────────┘
                            │ asyncpg
┌───────────────────────────▼────────────────────────────┐
│          PostgreSQL 16 + pgvector Database             │
│  - Canonical Notes, Personal Forks, Revision History   │
│  - Vector Embeddings for Semantic Retrieval            │
└────────────────────────────────────────────────────────┘
```

---

## ⚙️ پیکربندی و ماژولار بودن (Configuration & Customization)

پروژه به گونه‌ای طراحی شده که تمام متغیرها، عنوان برند، زبان رابط و آدرس‌های سرویس‌ها بدون نیاز به تغییر کد و از طریق فایل محیطی `.env` قابل شخصی‌سازی باشند:

| متغیر | مقدار پیش‌فرض | توضیحات |
| :--- | :--- | :--- |
| `SITE_URL` | `http://127.0.0.1:4321` | نشانی پایه سایت فرانت‌اند |
| `PUBLIC_BRAND_NAME` | `باغ ریاضی` | عنوان برند در هدر، فوتر و عنوان صفحات |
| `PUBLIC_SITE_LANG` | `fa` | زبان اصلی سایت (`fa`, `en`, `ar`, ...) |
| `PUBLIC_SITE_DIR` | `rtl` | جهت چیدمان متن (`rtl` یا `ltr`) |
| `FRONTEND_ORIGIN` | `http://127.0.0.1:4321` | دامنه مجاز مرورگر جهت اعتبارسنجی CSRF/Origin |
| `API_BASE_URL` | `http://127.0.0.1:8000` | نشانی سرویس بک‌اند برای پروکسی فرانت‌اند |
| `DATABASE_URL` | `postgresql+asyncpg://...` | رشته اتصال به پایگاه داده PostgreSQL |
| `COOKIE_SECURE` | `false` | در محیط پروداکشن با HTTPS مقدار `true` قرار دهید |
| `DIFY_BASE_URL` | `http://127.0.0.1:5001/v1` | نشانی سرور Dify Chatflow برای دستیار آموزشی |
| `DIFY_API_KEY` | `""` | کلید دسترسی به Chatflow (در صورت خالی بودن فقط AI غیرفعال است) |

---

## 🚀 راهنمای راه‌اندازی سریع (Quick Start)

### پیش‌نیازها:
* **Docker & Docker Compose**
* **Node.js** (نسخهٔ 22 به بالا) و **pnpm**
* **Python** (نسخهٔ 3.12) و **uv**

### ۱. کلون کردن مخزن و تنظیم متغیرها:
```bash
git clone https://github.com/ArsalanDalvand/math-digital-garden.git
cd math-digital-garden
cp .env.example .env
```

### ۲. اجرای دیتابیس (PostgreSQL + pgvector):
```bash
docker compose up -d
```

### ۳. راه‌اندازی بک‌اند (FastAPI):
```bash
uv venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.lock

# اعمال آخرین میگریشن‌ها و وارد کردن داده‌های اولیه
alembic -c backend/alembic.ini upgrade head
python -m backend.app.seed

# اجرای سرور بک‌اند
uvicorn backend.app.main:app --reload --port 8000
```

### ۴. راه‌اندازی فرانت‌اند (Astro):
در ترمینال دوم:
```bash
pnpm install --frozen-lockfile
pnpm dev
```
اکنون سایت در نشانی **`http://127.0.0.1:4321`** در دسترس است!

---

## 🧪 اجرای آزمون‌ها (Testing & Verification)

- **آزمون‌های فرانت‌اند (۱۲۹ تست مستقل):**
  ```bash
  pnpm --filter frontend test
  pnpm --filter frontend tsc
  pnpm --filter frontend check
  ```

- **بیلد پروداکشن فرانت‌اند:**
  ```bash
  pnpm --filter frontend build
  ```

- **آزمون‌های واحد بک‌اند:**
  ```bash
  pytest -v -m "not integration"
  ```

---

## 📜 پروانه و مجوز (License)

این پروژه تحت پروانهٔ نرم‌افزار آزاد **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)** منتشر شده است. 

طبق این پروانه، هرگونه استفاده، تغییر و توسعه این نرم‌افزار حتی در بستر وب و شبکه‌های ابری مجاز است، مشروط بر اینکه کد منبع نسخهٔ تغییریافته نیز به صورت متن‌باز تحت همین پروانه در اختیار عموم قرار گیرد.
