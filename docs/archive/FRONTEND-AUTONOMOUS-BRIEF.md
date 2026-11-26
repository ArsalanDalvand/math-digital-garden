# مأموریت مستقل بهبود فرانت باغ ریاضی

کاربر بازطراحی و اصلاح فرانت را بدون انتظار تأیید مرحله‌ای درخواست کرده است. منظور تجربه علمی فارسی خواندن/ویرایش جزوه با ابزار اختیاری است، نه landing تبلیغاتی. از محصول و رفتار واقعی حفاظت شود؛ داده ساختگی، ادعای کیفیت اثبات‌نشده، حذف volume یا تغییر اسرار ممنوع.

## هدف و مرز

تمام مسیرهای اصلی موجود بررسی و بهبود یابند: خانه، search، reader/sample، account، workspace، review و assistant. موتور Dify تصمیم مصوب است اما این مأموریت فرانت است؛ اتصال واقعی AI اگر غایب است جعل نشود. امکانات موجود حفظ شوند؛ هیچ تغییر DB مخرب یا commit/push انجام نشود. سورس فعلاً untracked است؛ قبل از تغییر backup فقط سورس/docs/tests/config غیرمحرمانه به /tmp گرفته شود؛ .env، credential، DB، node_modules و cache excluded.

## منابع لازم

AGENTS.md، docs/00-PRD.md، docs/DESIGN.md، docs/08-DIFY-DECISION-AND-CODEX-HANDOFF.md، کد و tests واقعی. اسکیل‌ها:
- /home/a7vat4r/.hermes/skills/ui-ux-pro-max/SKILL.md و scripts/search.py
- /home/a7vat4r/.hermes/skills/impeccable/SKILL.md و reference/craft-floor.md، new-work.md و operate.md
- /home/a7vat4r/.hermes/skills/pen-design/SKILL.md نسخه درخواستی 0.3.11؛ CLI نصب و حساب Active. ابزار pen در صورت امکان برای طراحی مشاهده‌پذیر، بدون signup و بدون خروج داده خصوصی. تمام مدل‌های خارجی فقط مسیر 9Router موجود؛ اگر مسیر pen قابل تنظیم نیست blocker و fallback مستند.
- upstreamهای /tmp/math-ui-pro-max-source و /tmp/math-impeccable-source جهت بررسی نصب جدید؛ executable ناشناس اجرا نکن.
- /tmp/math-ui-resources/nosubscription.txt محتوای سایت فهرست ابزارهاست، نه skill. فقط منابع مرتبط را ارزیابی کن.

## جهت طراحی

حالت Read برای جزوه و Operate برای workspace/review. Vazirmatn محلی و KaTeX، حفظ پالت علمى آرام با رنگ معنایی، متن 18px/line-height 2، فضای منطقی RTL، بدون letter-spacing منفی فارسی، no template marketing hero/testimonials. Material 3 برای surface roles، state layers، hierarchy و اندازه اهداف؛ shadcn برای semantic tokens و رفتار forms/dialog/sidebar. واقعی بودن نصب با اقتباس مستند فرق دارد؛ dependency React اضافه فقط با دلیل. Material3/shadcn/Context7 تحقیق و استفاده شوند و URL/نوع استفاده در docs ثبت شود. MCPهای context7 و shadcn در Codex config اضافه شده‌اند؛ Context7 HTTP درخواست OAuth داد، در صورت نبود auth از stdio رسمی @upstash/context7-mcp یا docs رسمی استفاده کن و گزارش شفاف بده. icons MCP تا اتصال امن آماده نیست؛ SVGهای Lucide/Material licensed محلی fallback‌اند، emoji به عنوان UI icon ممنوع.

## برنامه

1. Baseline تست و تصویر agent-browser؛ docs/FRONTEND-IMPLEMENTATION-PLAN.md با مسیرهای واقعی و مراحل تست‌پذیر؛ PRODUCT.md و DESIGN تکمیل با شواهد کد نه فرض.
2. tokens و shared primitives؛ خانه بدون تکرار H1 و TOC بی‌فایده، CTA در viewport، ناوبری خواندن/حساب جدا، search/theme واضح.
3. reader و controls با مطالعه در اولویت؛ نسخه رسمی/خصوصی، selection ask، AI sidebar responsive نه زیرساخت چت جدید. حفظ edit/merge/math widgets.
4. account/workspace/review/search با label، حالات empty/error/loading، feedback saving و conflict، keyboard/dialog.
5. regression tests + check/tsc/build + browser QA؛ دستی keyboard و screenshot دسکتاپ/موبایل/تیره. axe خودکار اگر ممکن؛ ادعای WCAG کامل نکن.

## اجرا و پایان

TDD برای رفتار؛ fake فقط تست، نه ادعای اتصال واقعی. هر مشکل baseline را از regression جدا کن. pnpm scripts را زنده بخوان. backend tests در صورت تغییر رفتاری اجرا شوند. frontend روی 127.0.0.1:4321 و backend :8000 در شروع listening بودند؛ ابتدا health کن. سرویس موجود را kill نکن. agent-browser نصب است؛ با session مجزا math-ux-build و env LD_PRELOAD= اجرا کن (proxychains باعث crash Chromium می‌شود). درباره executable/session حدس نزن؛ agent-browser skills get core را بخوان.

دو دور بررسی جامع desktop/mobile/light/dark، fixes دسته‌ای؛ polishing بی‌پایان ممنوع. بهبود واقعی تا اتمام تمام مراحل انجام شود؛ فقط سند یا scaffolding تحویل نیست. اگر network/auth ابزار طراحی blocker شد از alternative رسمی استفاده و ادامه بده. API token کاربر در این brief وجود ندارد و نباید در گزارش/سورس قرار گیرد.

شواهد در docs/verification/frontend-redesign/ و گزارش نهایی در docs/FRONTEND-VERIFICATION.md. گزارش واقعی فایل‌ها، commands exit codes، مسیر screenshotها، محدودیت‌ها و هر blocker. پایان بدون پرسش از کاربر و بدون درخواست اجازه مرحله بعد؛ کار کامل در scope انجام بده.
