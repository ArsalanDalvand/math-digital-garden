# بررسی سورس برای پنل AI کنار جزوه

تاریخ: 2026-10-09. وضعیت: بررسی ایستا و آزمون قرارداد؛ نه استقرار یا ارزیابی مدل.

## دامنه و نتیجه

صفحه مطالعه، حساب‌ها، Markdown رسمی و نسخه خصوصی متعلق به سایت ما هستند. AI یک پنل در همین صفحه است؛ رابط DeepTutor جایگزین سایت نمی‌شود.

نتیجه پیشنهادی: Dify موتور اولیه مناسب‌تر برای این دامنه است. DeepTutor از نظر فنی headless قابل اتصال است و قراردادهای قوی مطالعه دارد، ولی استفاده از آنها نیازمند تطبیق هویت، منابع و وضعیت آموزشی داخلی آن است. انتخاب Dify به معنی امکانات آموزشی آماده بیشتر نیست؛ به معنی مرز اتصال سازگارتر با مالکیت داده و UI فعلی ما است.

## نسخه‌های بررسی‌شده

- DeepTutor: `6cf793bd868ba5ecbe64722936d4be8fab5a01df`
- Dify: `f39832b7bc7eda9cdc5cec65afac3d04d69e0c23`
- سورس‌ها با git clone --depth 1 دریافت شدند.
- صفحه‌های مستندات وب در ابزار استخراج به دلیل خطای شبکه باز نشدند؛ README و مستندات درون مخزن مبنای بررسی بودند.

## شواهد DeepTutor

1. `deeptutor/core/turn_request.py:59-72`: ReadingReference دارای material_id، revision و locators است؛ ReadingViewport دارای locator و selection.
2. همان فایل، خطوط 113-196: TurnRequest مستقل از UI دارای content، session_id، tools، knowledge_bases، reading_material_id/revision، viewport و selection_tutor_context است.
3. `deeptutor/api/routers/unified_ws.py:43-63,179-228`: WebSocket /ws با احراز هویت، نسخه پروتکل و start_turn، اجرای سرویس برنامه را فراخوانی می‌کند. استفاده مستلزم React یا Next.js نیست؛ کلاینت دیگر می‌تواند قرارداد را اجرا کند.
4. `deeptutor/api/contracts/turn_protocol.py:12-173`: پروتکل 2.0 با subscribe/resume/cancel و رویدادهای content، sources، tool_call و tool_result. این قرارداد با OpenAI chat completions یکسان نیست.
5. `deeptutor/services/auth.py:1-62,103-140`: احراز هویت اختیاری، JWT و مخزن هویت داخلی؛ PocketBase مسیر جدا دارد. صرف ارسال user_id سایت برای احراز هویت کاربر کافی نیست.
6. `deeptutor/services/session/turns/executor.py:231-237`: پیش از اجرای نوبت، مجوز reading material دوباره بررسی می‌شود. بنابراین material_id یک برچسب آزاد برای URL سایت ما نیست.
7. `deeptutor/services/session/_turn_runtime_shared.py:1280-1326`: selection_tutor_context می‌تواند متن را نسبت به پیام والد resolve کند و وجود متن انتخاب‌شده را بررسی می‌کند. این مسیر معادل اتصال آماده به سند رسمی نسخه‌دار سایت نیست.
8. `deeptutor/core/response_languages.py:3-28`: fa در فهرست reply_language_override نیست. آزمون اجراشده ردشدن fa در override را تأیید کرد؛ فیلد عمومی language='fa' اعتبارسنجی شد. این به معنی ناتوانی مدل از پاسخ فارسی نیست؛ مسیرهای تنظیم زبان باید تطبیق داده شوند.
9. `docs-for-user/workspace-isolation-implementation.md`: سند upstream مالکیت workspace و account را جدا توصیف می‌کند. آمار تست درج‌شده در این سند، ادعای upstream است؛ در این بررسی تکرار نشده است.

## شواهد Dify

1. `api/controllers/service_api/app/completion.py:100-163`: ورودی رسمی ChatRequestPayload شامل query، inputs، conversation_id، files و response_mode است؛ streaming با SSE تعریف شده است.
2. همان فایل از validate_app_token و EndUser استفاده می‌کند. در این معماری backend سایت کلید برنامه را نگه می‌دارد و هویت کاربر نهایی را از نشست معتبر تعیین می‌کند.
3. `api/services/conversation_service.py:53-57,182-186`: فیلتر app و EndUser بر مکالمه اعمال می‌شود. این کنترل مجوز دسترسی به اسناد خصوصی را به‌تنهایی ثابت نمی‌کند.
4. `api/core/app/entities/task_entities.py` و `queue_entities.py`: metadata منابع بازیابی در retriever_resources وجود دارد؛ نگاشت آن به یادداشت/نسخه/بلاک سایت همچنان بر عهده اتصال ماست.
5. `api/core/app/apps/advanced_chat/app_generator.py:154-215`: inputs درخواست به آماده‌سازی ورودی‌های برنامه می‌رسد. رفتار تغییر صفحه طی مکالمه باید در جریان منتخب آزموده شود؛ متغیر گفتگو را نباید بدون آزمون زمینه زنده هر نوبت فرض کرد.
6. LICENSE: استفاده backend تجاری مجاز توصیف شده؛ چندمستأجری با تعریف workspace و branding شروط اضافی دارند. نظر حقوقی قطعی ارائه نمی‌شود.

## هزینه اتصال به سایت

| موضوع | DeepTutor | Dify |
|---|---|---|
| UI اختصاصی کنار جزوه | کلاینت پروتکل و رویدادهای محصول | کلاینت API/SSE |
| هویت سایت | تطبیق هویت با کاربران و scope داخلی | نگاشت سروری نشست سایت به EndUser |
| صفحه جاری | قرارداد بومی material/revision/viewport؛ نیاز به اتصال منابع | inputs/context یا ابزار محدود سایت |
| حالت آموزشی | قابلیت‌های آماده بیشتر | طراحی و تنظیم جریان آموزشی |
| منابع و نسخه‌ها | نگاشت به منابع داخلی یا ابزار سفارشی | Knowledge یا retrieval سایت؛ یک مالک اصلی |
| استناد به بلاک سایت | نیاز به نگاشت | نیاز به نگاشت |
| فورک/بازبینی مؤلف | آماده تأیید نشد | متعلق به سایت |
| فارسی | نقص مشخص در enum override؛ بقیه آزموده نشده | کیفیت مدل و رابط آزموده نشده |
| مجوز | Apache-2.0 | شرط‌دار |

## آزمون‌های واقعی این بررسی

- یک درخواست فارسی دارای selection با مدل Pydantic اصلی DeepTutor اعتبارسنجی شد.
- پنج مورد قرارداد: start با material/revision، subscribe و cancel پذیرفته شدند؛ revision صفر و protocol_version=1.0 رد شدند. همه مطابق انتظار.
- reply_language_override='fa' رد شد؛ language='fa' پذیرفته شد.
- اجرای pytest روی tests/multi_user/test_resource_isolation.py متوقف شد: No module named pytest. هیچ نتیجه قبولی تست امنیت ادعا نمی‌شود.
- سرور، مدل، ذخیره‌سازی، اتصال 9Router، citation واقعی و دو حساب اجرایی آزمایش نشدند. پذیرفته‌شدن شناسه ساختگی در schema به معنی موجودبودن یا دسترسی به منبع نیست.

## تکمیل بازبینی مستقل

بازبینی موازی نیز قابلیت اتصال headless DeepTutor و تناسب معماری Dify را تأیید کرد؛ این تأیید بررسی سورس است، نه آزمون محصول.

نکته امنیتیِ مستقلاً بازخوانی‌شده: `api/controllers/service_api/app/workflow.py:258-284` در Dify، جزئیات workflow run را با app token و tenant/app/run ID دریافت می‌کند؛ در این مرز controller فیلتر EndUser ندارد. بنابراین بک‌اند سایت نباید تمام endpointها را کورکورانه proxy کند. نگاشت مالکیت user→run باید قبل از نمایش نتیجه اعمال شود. این رفتار API برنامه است، نه به‌تنهایی ادعای آسیب‌پذیری Dify.

## توصیه اجرایی

یک Dify Chatflow پشت بک‌اند سایت، با ابزارهای محدود و پنل خود سایت. شروع با توضیح متن، راهنمایی مرحله‌ای، استناد و ذخیره پاسخ با تأیید. ساخت PydanticAI یا LangGraph موازی لازم نیست.

در هر نوبت سایت هویت، note_id، revision، block_id، متن انتخاب‌شده و محدوده مجاز را اعتبارسنجی کند. مجوز را از داده مرورگر یا مدل استخراج نکند. نتیجه citation به شناسه‌های مجاز نگاشت شود. تغییر صفحه و تغییر نسخه طی گفتگو آزمون ضروری است.

DeepTutor زمانی دوباره اولویت می‌گیرد که بخواهیم Mastery/Practice/Book و مدل داده آموزشی خودش را نیز استفاده کنیم و حاضر باشیم هویت/منابع آن را به‌عنوان زیرسیستم محصول بپذیریم. صرف شمارش feature برای این تصمیم کافی نیست.

## منابع ثابت

پایه لینک DeepTutor: https://github.com/HKUDS/DeepTutor/blob/6cf793bd868ba5ecbe64722936d4be8fab5a01df/
پایه لینک Dify: https://github.com/langgenius/dify/blob/f39832b7bc7eda9cdc5cec65afac3d04d69e0c23/
مسیرها و خطوط فوق به این commitها مربوط‌اند. این سند نتیجه اولویت‌بندی گزارش 05 را برای سناریوی sidebar محدود می‌کند؛ PRD یا معماری مصوب را تغییر نمی‌دهد.
