# Obsidian UX — پژوهش و اجرای این دور

## خواسته‌ها
درخت پوشه واقعی؛ پیش‌نمایش با hover intent بدون چشم بزرگ؛ backlinks بدون بازشدن ناگهانی؛ Live Preview؛ properties قابل ویرایش؛ ذخیره شخصی و ارسال اختیاری برای مدیر.

## گزینه‌های بررسی‌شده
- https://github.com/blueberrycongee/codemirror-live-markdown : سورس و README دریافت و بررسی شد. MIT، نسخه alpha؛ قابل ترکیب با CodeMirror موجود و Markdown منبع حقیقت. انتخاب آزمایشی برای heading/formatting، KaTeX و جدول.
- https://github.com/kenforthewin/atomic-editor : نتیجه جستجو برای Live Preview و tables بررسی شد؛ ممیزی اجرایی نشد.
- https://github.com/lukasbach/headless-tree و https://github.com/jameskerr/react-arborist : برای درخت‌های قابل جابه‌جایی/مجازی مناسب‌اند؛ این دور درخت فقط خواندنی است، بنابراین details/summary بومی با Lucide انتخاب شد؛ drag/drop ساختگی اضافه نشد.
- Popover API موجود حفظ شد؛ 650ms مکث، حذف دکمه چشم، Alt+ArrowDown و Escape.
- YAML آماده موجود برای اعتبارسنجی properties استفاده شد.

## اجرا و شواهد
درخت از relative_path واقعی ساخته می‌شود، fallback به book/chapter؛ شاخه مسیر جاری باز می‌شود.
Backlinks تنها با انتخاب summary باز می‌شوند، نه hover فوری.
Live Markdown افزوده شد: formatting/headings، inline math، block math plugin، editable table plugin. این به معنی سازگاری تمام افزونه‌های Obsidian نیست.
Properties در این دور YAML editable است، نه UI chip/فرم کامل Obsidian. عنوان/tags/aliases و سایر کلیدها در Markdown نسخه شخصی ذخیره می‌شوند؛ عنوان و tags سربرگ عمومی هنوز از metadata رسمی می‌آیند.

pnpm test موفق؛ check و tsc بدون خطا؛ build موفق.
مرورگر: درخت، نبود آیکون چشم، تاخیر hover، Escape موفق (داده عمومی واقعی).
مرورگر: default reading، ویرایش متن fork، اعمال YAML tags، ذخیره و بازگشت به مطالعه، رد ارسال بدون proposal، ارسال صریح یک‌بار موفق. workspace/preview/save/proposal در این آزمون mock بودند؛ این آزمون تایید ذخیره واقعی حساب نیست.
Vite Outdated Optimize Dep پس از نصب وابستگی‌ها رخ داد؛ restart سرور حل کرد.

## باقی‌مانده
آزمون تصویری و رفتاری همه فرمول‌ها، جدول‌های پیچیده، callout و embed در Live Preview؛ فرم راحت‌تر برای properties؛ به‌روزرسانی metadata شخصی در سربرگ؛ حفظ محل اسکرول/کرسر؛ آزمون با حساب واقعی و review backend؛ preview لینک‌های ایجادشده پس از render شخصی؛ سازگاری موبایل/IME فارسی.
