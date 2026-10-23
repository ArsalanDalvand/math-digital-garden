> **به‌روزرسانی اجرای واقعی:** وضعیت BLOCKED تاریخی بخش‌های زیر برای نصب/import و smoke رسمی اکنون رفع شده است. شواهد و محدودیت‌های جدید در `docs/14-NON-UI-REMAINING-WORK.md` و `docs/verification/non-ui/` آمده‌اند. Dify 1.17.1، افزونه رسمی امضاشده 0.0.68، DSL 0.7.0 واقعاً نصب/import/publish/export شدند. پنل سایت جدا 4326 → API جدا 8006 → Dify 8186 → 9Router استریم موفق داشت. DB استفاده‌شده نسخهٔ بازیابی‌شدهٔ scratch است؛ DB اصلی migration نشده است.

# Dify slice B implementation status

Scope: selected stored Markdown → site session/owner/version validation → Dify Chatflow → existing Astro sidebar. C/D remain deferred. No commit, push, private vault, volume or data deletion.

## Planned paths and contract

Create `backend/app/dify.py`, `backend/migrations/versions/0003_ai_conversations.py`, `tests/test_dify.py`, `frontend/src/scripts/tutor.ts`, `tests/frontend/tutor.test.mjs`, `docs/dify/math-tutor-b.yml`.
Modify `backend/app/config.py`, `models.py`, `main.py`, `rag.py`; `frontend/src/components/Tutor.astro`, `scripts/workspace-note.ts`, `pages/notes/[slug].astro`, `pages/api/[...path].ts`; `tests/test_workspace.py`, browser tutor fixtures; `.env.example`, README.
Remove the old direct-model `/api/ai/chat` implementation and sidebar index/manual insertion controls: old response engine bypasses Dify; response saving belongs to C. Retain index helpers/data and other site features. No source files deleted.

Source-only recovery: `.local/dify-b-recovery/source-before.tar.gz`, with per-file SHA256 in `hashes.json`; excludes secrets, database, dependencies and vault. Extract to a temporary directory, compare, then restore chosen files; never blindly overwrite unrelated newer work.

`POST /api/ai/chat`: question, slug, scope (`canonical`/`personal`), expected_hash (SHA256), selection (nonempty exact raw substring), optional site conversation UUID. No client user/fork/upstream IDs. Backend reads source and checks hash and selection before calling Dify. Ambiguous selections are rejected. Each turn carries current authorized context in JSON `query` (`sys.query` in DSL), not frozen start inputs. Conversation ownership is enforced in SQL. Client-visible IDs are site UUIDs only.
SSE: conversation (site id), context (authorized note/hash/scope, not an AI citation), text (JSON string), done, error (generic safe message). No blind proxy of run/file/citation metadata. Memory and tools disabled in minimal Chatflow. Cancel closes stream and attempts Dify stop with server-owned task ID. No automatic note modifications.

## Baseline

Git: all project source untracked, branch feat/phase-1-foundation. Logs: `docs/verification/dify-b/baseline-*.log` (ignored by log rule).
Backend dedicated PostgreSQL pytest exit 0. Frontend exit 1: missing jsdom in auth test, 53 passed/1 failed. tsc exit 2: pre-existing workspace-model.mjs implicit types. SSR exit 1: pre-existing search count assertion. These are not introduced by B.

## Runtime gates

Dify live service/app credentials not yet found: live site→Dify→9Router smoke and live DSL import/export BLOCKED until verified. Upstream inspected source Dify 1.17.1, commit f39832b7bc7eda9cdc5cec65afac3d04d69e0c23; official plugin source 0.0.68. Source evidence is not an installed runtime claim.

## نتیجهٔ تحویل برش B — 2026-10-09

کد مستقلِ برش B پیاده و آزموده شد؛ پذیرش end-to-end واقعی **BLOCKED** است: سرویس Dify، Chatflow منتشرشده و کلید app در این محیط وجود ندارند (`DIFY_API_KEY` خالی). هیچ Dify اجرایی نصب یا import/export واقعی ادعا نمی‌شود. C/D شروع نشدند. سرویس‌های قبلی، دادهٔ اصلی، volume، والت و تاریخچهٔ Git تغییر نکردند؛ commit/push انجام نشد.

مسیر پاسخ مستقیم قبلی حذف و با adapter Dify جایگزین شد. ایندکس برداری و داده‌هایش باقی‌اند، ولی در B فراخوانی نمی‌شوند. پاسخ پنل فقط از `/api/ai/chat` جدید می‌آید؛ fallback پنهان وجود ندارد. UI همان Astro است و React/assistant-ui یا مکمل‌های پژوهش نصب نشده‌اند. AnyIO از قبل وابستگی FastAPI/HTTPX بود؛ فقط استفاده و وابستگی مستقیم آن برای cleanup محافظت‌شده اعلام شد، نسخهٔ lock تغییر نکرد.

### پرونده‌های نهایی

| عملیات | مسیر دقیق | علت |
|---|---|---|
| ایجاد | `backend/app/dify.py` | قرارداد selection/context، اتصال واقعی HTTP/SSE، مالکیت گفتگو و cleanup لغو |
| تغییر | `backend/app/rag.py` | حذف کلاس/route تولید پاسخ مستقیم؛ حفظ index و retrieval |
| تغییر | `backend/app/main.py` | ثبت router Dify |
| تغییر | `backend/app/config.py` | تنظیمات اختیاری و کلید backend-only Dify، حذف AI_CHAT_MODEL |
| تغییر | `backend/app/models.py` | نگاشت UUID محلی گفتگو به مالک و شناسهٔ خصوصی upstream |
| ایجاد | `backend/migrations/versions/0003_ai_conversations.py` | جدول افزایشی مستقل؛ هیچ تغییر روی نوت یا بردار |
| تغییر | `frontend/src/components/Tutor.astro` | حفظ پنل، توضیح/راهنمایی و لغو؛ حذف کنترل‌های قدیمی index/درج پاسخ از پنل |
| ایجاد | `frontend/src/scripts/tutor.ts` | انتخاب محدود به جزوه، نسخهٔ ذخیره‌شده، استریم و AbortController |
| ایجاد | `frontend/src/lib/tutor.mjs` | parser قرارداد SSE و تطابق یکتای متن؛ خاتمه در done |
| تغییر | `frontend/src/scripts/workspace-note.ts` | به‌روزرسانی context در تغییر حالت/ویرایش/ذخیره |
| تغییر | `frontend/src/pages/notes/[slug].astro` | hash نسخهٔ واقعاً نمایش‌داده‌شده؛ بدون تکرار Markdown خام در HTML |
| تغییر | `frontend/src/pages/api/[...path].ts` | انتقال Accept و لغو/timeout به درخواست backend |
| ایجاد | `tests/test_dify.py` | مجوز، نسخه، private selection، گفتگو، provider failure و لغو تحت cancel scope |
| ایجاد | `tests/integration/dify-provider-smoke.py` | probe قابل تکرارِ کد provider رسمی با config محلی 9Router؛ بدون credential در سورس |
| ایجاد | `tests/test_dify_dsl.py` | فقط ساختار/round-trip YAML؛ شاهد import واقعی نیست |
| تغییر | `tests/test_workspace.py` | تفکیک تضمین vector isolation از route پاسخ حذف‌شده |
| ایجاد | `tests/frontend/tutor.test.mjs` | UTF8 تکه‌شده، خطا/استریم ناقص، متن یکتا، done روی اتصال باز |
| تغییر | `tests/browser/workspace_server.py` | fixture آشکار Dify mock فقط برای DB/پورت تست |
| تغییر | `tests/browser/tutor-check.js` | پنل استریم/LaTeX بدون ذخیرهٔ پاسخ |
| ایجاد | `tests/browser/tutor-lifecycle.js` | لغو در تغییر context و رد hash نمایش قدیمی |
| ایجاد | `tests/browser/tutor-personal.js` | context نسخهٔ شخصی و عدم تغییر نوت توسط AI |
| ایجاد | `docs/dify/math-tutor-b.yml` | Chatflow سه‌گرهی بدون credential، memory، ابزار یا index دوم |
| ایجاد | `docs/dify/README.md` | نسخه‌ها، تنظیم provider و دروازهٔ import/export واقعی |
| تغییر | `.env.example` | فقط نام/placeholder تنظیمات Dify |
| تغییر | `pyproject.toml`, `requirements.lock` | اعلام AnyIO موجود به‌عنوان dependency مستقیم؛ بدون ارتقای بسته |
| تغییر | `README.md` | راهنمای فعلی اجرا و تفکیک B از ایندکس قدیمی |
| ایجاد | `docs/09-DIFY-IMPLEMENTATION-STATUS.md`, `docs/verification/dify-b/*` | برنامه، گزارش و شواهد |

هیچ فایل سورس حذف نشد؛ حذف منطق فقط در مسیرهای ثبت‌شدهٔ بالا است. سورس untracked پیش از جایگزینی adapter در archive بازیابی ثبت شد.

### فرمان‌ها و exit code واقعی

| فرمان | نتیجه | exit code / شاهد |
|---|---|---|
| `python3 /tmp/math-garden-test-environment.py -m pytest tests/test_dify.py -q` در RED | ابتدا ۲ شکست ImportErrorِ adapter نوشته‌نشده | 1، `red-backend.log` |
| `node --test tests/frontend/tutor.test.mjs` در RED | ماژول نوشته‌نشده | 1، `red-frontend.log` |
| pytest `-k disconnect_cleanup` در RED | stop در cancel scope اجرا نمی‌شد | 1، `red-cancel.log` |
| تست done در RED پس از بررسی Gemini | parser منتظر بسته‌شدن HTTP می‌ماند | 1، `red-gemini-sse.log` |
| `python3 /tmp/math-garden-test-environment.py -m alembic -c backend/alembic.ini upgrade head` | migration روی DB اختصاصی تست | 0 |
| `python3 /tmp/math-garden-test-environment.py -m pytest -q` | **۴۷ passed، بدون skip** | 0، `backend-final.log` |
| `node --test tests/frontend/tutor.test.mjs` | **۳ passed** | 0، `tutor-final.log` |
| `.venv/bin/ruff check backend` | موفق | 0، `ruff-final.log` |
| `.venv/bin/mypy backend` | ۱۶ فایل، موفق | 0، `mypy-final.log` |
| `pnpm tsc` | موفق؛ خطای baseline دیگر در اجرای نهایی حاضر نیست؛ فایل workspace-model در این برش ویرایش نشد | 0، `tsc-final.log` |
| `pnpm build` | موفق؛ هشدارهای collection خالی/اندازهٔ bundle باقی‌اند | 0، `build-final.log` |
| `pnpm test` | **۵۹ passed / ۱ failed**: همان نبود jsdom در auth baseline | 1، `frontend-final.log` |
| `pnpm test:reader` | **۱۳ passed / ۱ failed**: همان search-count baseline | 1، `ssr-final.log` |
| `agent-browser --session dify-b-check eval --stdin < tests/browser/tutor-check.js` | استریم فارسی، KaTeX، عدم ذخیره | 0، `browser-tutor.json`, `tutor.png` |
| همان eval برای `tutor-lifecycle.js` | لغو، حذف خروجی قدیمی، رد نسخهٔ stale | 0، `browser-lifecycle.json` |
| همان eval برای `tutor-personal.js` | context خصوصی مجاز، نسخهٔ رسمی دست‌نخورده | 0، `browser-personal.json` |

یک regression مربوط به تکرار raw drawing داخل attribute HTML در دور اول SSR کشف و رفع شد؛ در SSR نهایی آزمون compressed Excalidraw موفق است و تنها شکست قبلی جست‌وجو باقی است. تست‌های browser روی backend تست 8012 / frontend تست 4339 و PostgreSQL اختصاصی اجرا شدند؛ transport Dify آن‌ها **mock آشکار** است.

### شاهد اتصال واقعی provider و Gemini

- 9Router واقعی `http://127.0.0.1:20128/v1/chat/completions`: blocking و streaming با credential موجود و بدون نمایش آن موفق شدند (`router-authenticated-probes.json`). probe بدون credential: POST برابر 401 و GET models timeout بود؛ آن‌ها شاهد ناسازگاری مدل نبودند.
- **خود کد provider رسمی** `OpenAILargeLanguageModel` نسخهٔ manifest **0.0.68** از commit `d6efe9504fb7477cba4590bde8c9bdd82505d008` در محیط مستقل `/tmp/dify-plugin-research/models/openai_api_compatible/.venv` با lock خودش اجرا شد. SDK `dify_plugin=0.10.2` و `openai=3.17.0`. credential validation، blocking و streaming هر سه واقعاً به `/v1/chat/completions` رفتند و HTTP 200 شدند؛ استریم به LLMResultChunk تبدیل شد. شاهد: `official-provider-live.json`؛ اجرای `/tmp/math-dify-plugin-smoke.py` exit **0**؛ نسخهٔ قابل تکرار سورس در `tests/integration/dify-provider-smoke.py` ثبت است. با `DIFY_PROVIDER_SOURCE=/tmp/dify-plugin-research/models/openai_api_compatible /tmp/dify-plugin-research/models/openai_api_compatible/.venv/bin/python tests/integration/dify-provider-smoke.py` از ریشهٔ پروژه اجرا می‌شود؛ credential از config محلی 9Router خوانده و چاپ نمی‌شود.
- **تنظیم ضروری provider:** `api_type=chat_completions` و `stream_mode_auth=use`. validator پیش‌فرض blocking در probe واقعی `ping` با SSE مواجه شد و JSON decode failed داشت (`official-provider-default-validation.json`)؛ تنظیم رسمی streaming validation مشکل را رفع کرد، بدون fork افزونه یا تغییر 9Router. پایان `[DONE]` در probe خام دیده نشد، ولی parser خود provider رسمی پاسخ streaming را موفق مصرف کرد. endpoint `/responses` برای Chatflow انتخاب‌شده لازم نیست؛ `/models` دروازهٔ اعتبارسنجی این provider نیست.
- Gemini واقعاً از API Chat Completions 9Router برای review کمکی parser فراخوانی شد: requested `ag/gemini-3.8-flash-high`، returned `gemini-3.8-flash-n`، HTTP 200. شاهد `gemini-review.md`. ایراد انتظار پس از done با RED→GREEN رفع شد. پیشنهاد پذیرش frame بدون delimiter اعمال نشد: قرارداد داخلی عمداً frame ناقص را خطا می‌داند؛ event پیش‌فرض SSE هم جزو قرارداد صریح پنل نیست.
- delegation داخلی model موردنظر را نمی‌شناخت. تلاش‌های Codex CLI با `/responses` timeout شدند (exit 124)؛ review نهایی از مسیر مستقیم Chat Completions انجام شد. این تلاش‌های شکست‌خورده تأیید review کامل امنیت نیستند؛ طراحی مجوز و امنیت را ایجنت اصلی انجام داد.
- این‌ها **نصب افزونه در Dify یا اجرای سایت→Dify نیستند**. Dify source بررسی‌شده **1.17.1** / commit `f39832b7bc7eda9cdc5cec65afac3d04d69e0c23` و DSL **0.7.0** است. `dependencies: []` تا نصب دستی provider رسمی؛ checksum marketplace تأییدنشده جعل نشده است. import و export واقعی DSL هنوز **BLOCKED** است.

### اجرا، بازگشت و دروازهٔ بعد

برای محیط واقعی، ابتدا با تنظیم DB صحیح `alembic -c backend/alembic.ini upgrade head` اجرا شود؛ در این نوبت migration روی DB اصلی اعمال نشد. Dify سازگار و provider رسمی نصب، credential validation در حالت streaming و مدل انتخاب‌شده بررسی، DSL import/publish و سپس export واقعی ثبت شود. کلید app فقط در بک‌اند `DIFY_API_KEY` و `/v1` سرویس در `DIFY_BASE_URL` قرار گیرد. API و Astro با فرمان‌های موجود README در پورت آزاد اجرا شوند؛ سرویس قبلی را بدون هماهنگی جایگزین نکنید. کلید خالی fail-closed فقط AI را 503 می‌کند؛ مطالعه و ویرایش مستقل‌اند.

بازگشت بدون اطلاعات محرمانه: `mkdir -p /tmp/math-dify-b-restore` و `tar -xzf .local/dify-b-recovery/source-before.tar.gz -C /tmp/math-dify-b-restore`؛ compare و restore انتخابی پرونده‌ها با hash ثبت‌شده. فایل‌های ایجادشده در جدول بالا را پس از compare کنار بگذارید. تغییر متادیتا صرفاً خط dependency مستقیم AnyIO و comment via آن است. **migration افزایشی و دادهٔ گفتگو را باقی بگذارید؛ downgrade جدول/حذف volume/DB برای rollback سورس لازم نیست.** تنظیم `.env` در archive نیست و باید جداگانه حفظ شود.

محدودیت B: فقط selection یکتای منطبق با Markdown ذخیره‌شده؛ فرمول KaTeX، متن شامل تبدیل قالب‌بندی، transclusion یا متن تکراری ممکن است رد شود. نوت بیش از ۱۲۰هزار کاراکتر رد می‌شود؛ هر selection حداکثر ۸هزار کاراکتر است. منابع نمایش‌داده‌شده context مجاز‌اند، نه citation تأییدشدهٔ پاسخ. استناد نسخه‌دار/ذخیرهٔ پاسخ، کیفیت علمی مدل و C/D هنوز تحویل نشده‌اند.

گام بعدی نخست رفع مانع Dify و smoke واقعی شامل تغییر صفحه/selection، دو حساب، قطع provider و لغو است؛ **تنها پس از بازبینی B** سراغ C بروید. خطاهای قبلی jsdom و search-count باید جداگانه رسیدگی شوند.

### تکمیل محافظ خروجی و cleanup

`tests/browser/tutor-safe-preview.js` نیز ایجاد شد: خروجی preview دارای img/iframe در RED رد شد (`red-safe-preview.log`، exit 1)، سپس با template غیرفعال و حذف تگ‌های resource پیش از درج DOM، GREEN شد (`browser-safe-preview.json`، exit 0). LaTeX حفظ می‌شود؛ تصویر/رسانهٔ خروجی AI خودکار بارگذاری نمی‌شود تا prompt injection نتواند context خصوصی را در URL تصویر ارسال کند. این محدودیت فقط خروجی پنل AI است و رندر جزوه‌های موجود را تغییر نمی‌دهد.

لغو upstream best-effort است: پس از دریافت task_id معتبر، درخواست stop با user سروری و timeout ارسال می‌شود؛ اگر قطع اتصال پیش از دریافت task_id رخ دهد، اتصال بسته می‌شود اما stop با شناسهٔ هنوز نامعلوم ممکن نیست. Dify این شناسه را تولید می‌کند. cleanup تحت cancel scope سایت محافظت شده و آزمون واقعی منطق لغو دارد.

محیط آزمایش جدید با پورت‌های 8012/4339 و session مرورگر `dify-b-check` پس از پایان بررسی بسته می‌شود؛ سرویس‌های قبلی 8001/4321 و دیگر پردازه‌ها دست‌نخورده می‌مانند. محیط provider موقت در /tmp فقط برای شواهد سازگاری بوده و جزو dependencies سایت/Dify deployment نیست.
