# کارهای باقی‌ماندهٔ غیر UI/UX

درخواست 2026-10-09 ادامهٔ کارهای انجام‌نشده است. اجازهٔ ادامه پس از B در این درخواست داده شد؛ دروازهٔ فنی smoke واقعی و تست امنیت قبل از گسترش AI همچنان لازم است. UI/UX در docs/11 جدا باقی است. تحقیق، نصب و اجرای واقعی معادل هم نیستند.

| شناسه | کار و معیار پایان | وضعیت شروع |
|---|---|---|
| N01 | رفع وابستگی/مسیر jsdom تست auth؛ تمام تست‌های frontend سبز | انجام شد: ۶۶/۶۶، exit 0 |
| N02 | اصلاح انتظار قدیمی SSR برای شمار فارسی، بدون تغییر ظاهر محصول؛ SSR سبز | انجام شد: ۱۴/۱۴، exit 0 |
| N03 | Dify جدا روی loopback و پورت آزاد، نسخهٔ قابل اثبات، اسرار فقط local؛ بدون توقف سرویس‌های موجود | انجام شد: runtime رسمی 1.17.1 روی 8186/8446 loopback |
| N04 | نصب واقعی provider رسمی 0.0.68، ثبت شناسه/checksum نصب، streaming credential validation و اتصال واقعی 9Router | انجام شد: نصب امضاشده 0.0.68 و validation واقعی داخل Dify |
| N05 | import/publish/export واقعی DSL؛ جایگزین dependencies خالی با شناسهٔ نصب تأییدشده در export | انجام شد: import بدون هشدار، publish و export واقعی |
| N06 | migration افزایشی گفتگو روی DB محیط اجرایی پس از backup امن؛ بدون حذف داده یا volume | backup/restore واقعی ۱۳۷ نوت و migration روی scratch موفق؛ DB اصلی هنوز تغییر نکرده |
| N07 | smoke واقعی سایت→Dify→9Router در پنل، دو حساب، رسمی/خصوصی، تغییر نوت/selection، قطع provider و لغو | پنل واقعی و امنیت دو حساب و outage موفق؛ لغو واقعی/تغییر صفحه با مدل واقعی هنوز باقی |
| N08 | پوشش کامل موقعیت انتخاب، متن تکراری و بخش‌های فرمول/Markdown تبدیل‌شده؛ رد context مبهم به‌جای حدس | باقی؛ محدودیت B ثبت شده |
| N09 | برش C: بازیابی منبع مجاز با note_id/hash/block، citation کلیک‌پذیر نسخه‌دار و رد منبع نامعتبر/قدیمی | پس از دروازهٔ N07 |
| N10 | برش C: نگهداری پاسخ نهایی تحت مالکیت؛ ذخیره با تأیید صریح و expected_hash؛ تست تعارض و عدم تغییر رسمی | پس از N09 |
| N11 | تست امنیت دو حساب برای conversation/run/citation/file/cache؛ هر endpoint جدید فقط با مالکیت SQL | همراه N09/N10؛ endpointهای فعلیِ ارائه‌نشده 404 می‌دهند |
| N12 | برش D: Promptfoo از API سایت، فارسی با شاهد/بدون شاهد، فرض پنهان، حریم خصوصی، راهنمایی بدون پاسخ نهایی؛ تست قطعی امنیت جدا از داوری مدل | پس از تثبیت C |
| N13 | برش D: SymPy محدود پشت API با allowlist عملیات، دامنه، timeout و سقف حافظه؛ بدون eval/exec/کد آزاد | بعد از تثبیت قرارداد ابزار و ارزیابی |
| N14 | embedding واقعی/ابعاد و reindex قابل بازگشت فقط اگر retrieval برداری C لازم شود؛ بدون index دوم یا حذف Markdown | مشروط به روش retrieval C؛ ایندکس موجود حفظ شده |
| N15 | دوام job نمایه‌سازی/خروجی در restart؛ retry idempotent، صف/وضعیت ماندگار بدون بازسازی امکانات موجود | بررسی کد موجود و نیاز واقعی |
| N16 | limiter مشترک در چند worker و سیاست trusted proxy؛ کنترل هزینه/همزمانی AI و سقف درخواست | بررسی برای محیط اجرایی |
| N17 | backup/restore واقعی و قابل آزمون DB، recovery سورس untracked، retention دادهٔ خصوصی در Dify و لاگ بدون اسرار | باقی؛ backup سورس B موجود |
| N18 | سخت‌سازی استقرار: تنظیم cookie امن/TLS برای استقرار HTTPS، health/readiness، secrets جدا، version pin و راهنمای بازیابی بدون downtime | وابسته به مقصد واقعی استقرار؛ localhost به‌عنوان HTTPS production گزارش نمی‌شود |
| N19 | رفع یا تعیین تکلیف هشدارهای build، بارگذاری سرد مجموعهٔ بزرگ و budget فنی bundle/latency؛ بدون بازطراحی | بررسی مستقل از UI/UX |
| N20 | smoke واقعی GeoGebra و Excalidraw، خرابی شبکه و حفظ متن خام؛ تعیین تکلیف فایل‌های منبع غایب با شواهد | باقی؛ ساختن تصویر جایگزین/دستکاری والت مجاز نیست |
| N21 | self-host GeoGebra و assets vendor در صورت تأیید نیاز offline و مجوز نسخه؛ ثبت تمام درخواست‌های خارجی | تصمیم قبلی پرسش/پیشنهاد بود، نه پیاده‌سازی قطعی؛ مشروط |
| N22 | پوشش/بازبینی امنیت نهایی، تست round-trip روی نمونهٔ واقعی و به‌روزکردن README/گزارش‌ها براساس اجرا | همراه هر برش |

## خارج از این دامنه

بازطراحی، layout، تم، typography polish، animation، ممیزی ظاهری/موبایل و موارد docs/11 انجام نمی‌شوند. رفتار ضروریِ تأیید/خطا/دسترس‌پذیری پایه بخشی از صحت قابلیت است. نصب Langfuse، parser PDF، crawler، podcast، MCP مستقل و سایر پلاگین‌های پژوهشی فقط در صورت نیاز جداگانه است؛ در این درخواست به‌عنوان کار مصوب فرض نشده‌اند. commit/push، حذف volume/داده و تغییر والت اصلی همچنان ممنوع‌اند.

## ترتیب اجرا و مسیرها

ابتدا `tests/frontend/auth.test.mjs`, `frontend/package.json`, `pnpm-lock.yaml`, `tests/integration/reader.test.mjs`. سپس runtime رسمی Dify در `.local/dify-runtime/` (ignored، credential خارج سورس) با نسخه/pin و پورت مستقل. فقط پس از smoke B، قرارداد C در docs و تست قرمز ثبت و `backend/app/dify.py`, مدل/migration و مصرف‌کنندهٔ فعلی گسترش می‌یابند. هیچ موتور AI جدید ساخته نمی‌شود.

## دروازه‌های تکمیلی بازبینی Gemini

بازبینی کمکی واقعی با Gemini از 9Router در `docs/verification/non-ui/gemini-inventory-review.md` ثبت است. پیش از N06، backup/restore در DB scratch آزموده می‌شود؛ rollback سورس نیازمند حذف جدول یا داده نیست. پیش از N04/N13، مسیر provider ثابت و admin-owned، SSRF/egress سرویس‌های جدید بررسی می‌شود؛ هیچ firewall یا شبکهٔ سرویس قبلی دستکاری نمی‌شود. بین N05 و N07، export و artifacts عمومی برای credential اسکن می‌شوند؛ اسرار لازم runtime در `.local/` با mode محدود باقی می‌مانند و نباید از آن‌جا پاک شوند. پیشنهاد پاک‌سازی تمام unversioned directories به دلیل وجود سورس و دادهٔ قابل بازیابی اجرا نمی‌شود.

## اجرای واقعی تکمیلی — 2026-10-09

- Dify رسمی `1.17.1` در پروژه Compose جدا `math-garden-dify` نصب و bootstrap شد؛ API healthy. نسخهٔ daemon `0.6.10-local` و digest تصاویر در `verification/non-ui/dify-runtime-images.json` است. این runtime فقط loopback است و جایگزین سرویس‌های قبلی نیست.
- provider رسمی Marketplace، verified و نصب‌شده: `langgenius/openai_api_compatible:0.0.68@ba61c5eccb814be7364117c0bec3710a51e09b20f31e37243e747a00f9377969`. credential validation واقعی داخل Dify HTTP 201؛ مدل از 9Router با `stream_mode_auth=use` و `api_type=chat_completions`.
- import DSL بدون هشدار HTTP 200، publish HTTP 200، export HTTP 200؛ کلید app HTTP 201 فقط در local خصوصی. خروجی واقعی بدون اسرار: `docs/dify/math-tutor-b.export.yml`، DSL `0.7.0`. فایل ابتدایی B برای مقایسه حفظ شده است.
- استریم واقعی Dify رویداد `message_end` و متن فارسی داشت؛ exit 0، `verification/non-ui/dify-real-stream.json`.
- سایت جدا `http://127.0.0.1:4326` → API جدا `8006` → Dify `8186` → 9Router `20128`. مرورگر agent-browser، پنل واقعی، ۲۹۹ کاراکتر پاسخ و عدم تغییر یادداشت: exit 0، `browser-dify-real.log`.
- دو حساب واقعی: hash قدیمی 409، selection جعلی 422، نسخه شخصی غایب/متعلق به دیگری 404، conversation متعلق به دیگری 404؛ استریم واقعی کامل و متن رسمی بدون تغییر، exit 0، `site-real-security.json`.
- قطع واقعی **فقط API Dify جدید** و راه‌اندازی دوبارهٔ آن: AI=503، مطالعه=200، ذخیرهٔ انشعاب=200، exit 0، `real-dify-outage.json`. هیچ سرویس قبلی متوقف نشد.
- لغو درخواست فعال در مرورگر و جلوگیری از خروجی دیررس: exit 0، `browser-real-cancel.log`. این آزمون توقف task در سمت Dify را مشاهده نمی‌کند؛ آزمون mock توقف task قبلاً مستقل ثبت شده است. تغییر صفحه با مدل واقعی هنوز آزموده نشده است.
- `pg_dump -Fc` و `pg_restore --exit-on-error` روی DB جدا موفق، ۱۳۷ یادداشت بازیابی شد. migration افزایشی روی `garden_restore_20261009` موفق؛ DB اصلی untouched. پشتیبان خصوصی mode600 در `.local/non-ui-recovery/database-before-dify.dump` است و نباید commit شود.
- خطای راه‌اندازی runtime جدید: رمز `CELERY_BROKER_URL` با Redis همخوان نبود؛ فقط تنظیم خصوصی runtime اصلاح و worker/API جدید recreate شدند. تست استریم پس از اصلاح موفق شد. خطای نخست با موفقیت بعدی مخلوط نشده است.
- بررسی artifact عمومی برای اسرار runtime: exit 0، بدون hit، `credential-scan.json`. بازبینی کمکی واقعی Gemini در `gemini-runtime-review.md`؛ پیشنهادهای آن به معنی پیاده‌سازی نیستند. عملیات destructive پیشنهادی آن اجرا نشده است.

### روش اجرا و بازگشت

runtime خصوصی موجود را با این فرمان شروع کنید:

```sh
docker compose -p math-garden-dify --project-directory .local/dify-runtime/docker -f .local/dify-runtime/docker/docker-compose.yaml -f .local/dify-runtime/docker/docker-compose.garden.yaml up -d
.venv/bin/python .local/dify-runtime/site-server.py
API_BASE_URL=http://127.0.0.1:8006 pnpm --dir frontend dev --host 127.0.0.1 --port 4326
```

دو فرمان آخر در دو ترمینال جدا؛ سرورهای آزمون اکنون روشن‌اند، نمونهٔ تکراری روی همین پورت اجرا نکنید. helper اجرایی private کلید را چاپ نمی‌کند و از DB بازیابی‌شده استفاده می‌کند. تست امنیت واقعی: `.venv/bin/python .local/dify-runtime/site-security-smoke.py`؛ آزمون استریم: `.venv/bin/python .local/dify-runtime/stream-smoke.py`. اسکریپت outage را هنگام استفاده فعال دیگران اجرا نکنید؛ فقط سرویس جدید Dify را موقتاً قطع می‌کند.

بازگشت نیازمند حذف جدول/داده نیست: به سایت قبلی 4321/API 8001 برگردید؛ تنظیم Dify خالی، AI را fail-closed می‌کند. runtime جدید را در صورت نیاز با `docker compose ... stop` فقط برای project جدا متوقف کنید؛ از `down -v` استفاده نکنید. سورس checkpoint و backup خصوصی موجودند. تنظیم production، retention Dify و بازیابی خودکار پس از restart سیستم هنوز تحویل نشده‌اند.

### وضعیت صریح باقی‌مانده

N06 برای DB اصلی، N07 برای تغییر صفحه/توقف upstream واقعی، N08، N09–N13، N15–N20 و بخش‌های مشروط N14/N21 هنوز پایان‌یافته نیستند. N17 فقط backup/restore و recovery سورس را گذرانده، retention باقی است. N19 هشدارهای Starlight base directory، directiveهای Radix و bundle size را دارد؛ تغییر limit هشدار به‌تنهایی بهینه‌سازی نیست. N22 همراه این برش پیش رفته ولی ممیزی نهایی تمام محصول انجام نشده. نصب مکمل‌های پژوهشی و UI/UX انجام نشده است.
