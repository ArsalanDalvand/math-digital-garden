# اجرای فازهای باقی‌مانده — قرارداد و دامنه

درخواست کاربر ادامهٔ نقشهٔ راه مصوب است؛ طراحی ظاهری به متخصص UI/UX واگذار می‌شود. برنامهٔ اجرایی: فاز ۲ (احراز هویت و فضای خصوصی)، فاز ۳ (پیشنهاد منجمد و بازبینی)، فاز ۴ (بازیابی مقید با استناد)، فاز ۵ (GeoGebra، سازگاری والت و آزمون رفت‌وبرگشت). گراف آمادهٔ Starlight موجود حفظ می‌شود.

## قراردادها

- نشست opaque تصادفی در cookie HttpOnly/SameSite=Lax؛ فقط SHA256 توکن در DB، انقضا و logout. رمز Argon2 از pwdlib. ثبت‌نام تنها student؛ ارتقای نقش صرفاً CLI محلی مدیر. عملیات نوشتن مرورگر Origin و X-Requested-With را بررسی می‌کنند؛ proxy هم‌مبدأ Astro کوکی را منتقل می‌کند. پاسخ خصوصی no-store. limiter ثبت‌نام/ورود.
- POST /api/auth/register، /login، /logout و GET /me؛ هرگونه خرابی provider مستقل از مطالعه است.
- GET /api/workspace/notes/{slug}: نسخهٔ رسمی به همراه fork خود کاربر. POST /api/notes/{slug}/fork: raw content و expected_hash؛ تعارض save ->409. base_content/base_hash ثبت و ثابت تا reset. تاریخچهٔ immutable، bookmark و dashboard فقط مالک. reset با expected_hash و بدون دستکاری رسمی.
- POST /api/proposals: slug/comment، freeze متن fork و base؛ diff-match-patch. GET /api/proposals فقط پیشنهادهای مالک. author/admin از مسیر مجزای /api/review دسترسی بازبینی دارد (استثنای مستند RBAC). تصمیم approve/reject/changes_requested؛ compare-and-swap hash رسمی، پچ دقیق، 409 در تعارض یا تصمیم دوباره.
- گیت خروجی در مخزن جدا و صریح CONTENT_GIT_REPO، نه مخزن پروژه یا والت اصلی. export idempotent از پیشنهاد approved با مسیر امن، عدم overwrite فایل متفاوت، outbox/pending قابل retry؛ Git و DB تراکنش مشترک ندارند، وضعیت خطا آشکار. هیچ push خودکار.
- pgvector با 1536 بعد، AST از markdown-it-py بدون بازنویسی raw؛ block کامل فرمول/کال‌اوت. index فقط snapshot hash جاری، حذف بردار stale در write، جست‌وجو WHERE is_canonical OR user_id=current. provider OpenAI-compatible از env، عدم وجود provider ->503 بدون تاثیر بر ادیت. citations از شناسهٔ نتایج واقعی؛ خروجی غیرمستند رد می‌شود و سپس متن تاییدشده به صورت SSE منتقل می‌شود (توکن تاییدنشده منتشر نمی‌شود).
- UI کاربردی: account، workspace، editor CodeMirror+MathLive با preview، autosave serial/optimistic، MergeView، پنل review، chat با selection و اعمال صریح. private preview خارج graph عمومی. فرانت‌اند هیچ Markdown را normalize نمی‌کند.
- GeoGebra: YAML محدود/اعتبارسنجی شده، بارگذاری با اقدام کاربر/دیدپذیری، خطا مستقل، raw محفوظ. تصاویر فقط assetهای واردشده؛ transclusion bounded و چرخه‌ها متوقف. هیچ فایل خارج والت منتشر نمی‌شود.

## UI/UX برای متخصص

صفحات ورود/ثبت‌نام، نحوهٔ ورود به edit و رسمی/شخصی، چیدمان preview/ویرایشگر/کیبورد ریاضی، وضعیت save و conflict/retry، dashboard و history، diff و review، chat و citations، graph/settings، خطاهای منابع ناقص، ظاهر callout/فرمول فارسی و موبایل، کنتراست/فوکوس/ترتیب heading. در این مرحله فقط رفتار و دسترس‌پذیری پایه لازم است؛ بازطراحی، انیمیشن و پولیش بصری انجام نمی‌شود.
