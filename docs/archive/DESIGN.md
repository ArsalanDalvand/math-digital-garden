# سیستم طراحی باغ ریاضی — مطالعه‌محور

## تصمیم تأییدشده
مطالعهٔ آرام و ابزارهای اختیاری. خواندن عمومی به حساب نیاز ندارد؛ ذخیرهٔ نسخهٔ شخصی، نشانه‌گذاری و دستیار از قراردادهای فعلی حساب استفاده می‌کنند. این مرحله خانه، پوستهٔ مشترک و نمایش تدریجی ابزارهای مطالعه را پوشش می‌دهد؛ بازطراحی اختصاصی حساب و داشبورد مرحلهٔ بعد است.

## منبع و توکن‌ها
بنیاد modern-minimal از کتابخانهٔ جهت‌های OpenDesign؛ فونت Vazirmatn مطابق معماری مصوب پروژه بر فونت پیش‌فرض بنیاد اولویت دارد. مقادیر اجرایی در `frontend/src/styles/custom.css` منبع حقیقت هستند.

| توکن | روشن | تیره |
|---|---|---|
| bg | oklch(99% 0.002 240) | oklch(19% 0.012 250) |
| surface | oklch(100% 0 0) | oklch(23% 0.012 250) |
| fg | oklch(18% 0.012 250) | oklch(95% 0.005 250) |
| muted | oklch(54% 0.012 250) | oklch(76% 0.012 250) |
| border | oklch(92% 0.005 250) | oklch(37% 0.012 250) |
| accent | oklch(58% 0.18 255) | oklch(76% 0.12 255) |

قلم محتوا و کنترل‌ها: Vazirmatn محلی؛ قلم نمایش پایه: system-ui با Vazirmatn به‌عنوان قلم فارسی. ریاضیات: KaTeX؛ کد: ui-monospace. فاصله‌ها: ۴، ۸، ۱۲، ۱۶، ۲۴، ۳۲ و ۴۸ پیکسل. شعاع کنترل: ۸ پیکسل؛ خطوط مرزی نازک؛ بدون سایهٔ تزئینی. حداقل هدف لمسی ۴۴ پیکسل، متن مطالعه ۱۸ پیکسل با ارتفاع خط ۲، عرض هدف ۷۲ حرف.

## قواعد تجربه
1. خانه یک مسیر اصلی «شروع با نمونهٔ مطالعه» و ورودی ثانویهٔ جست‌وجوی واقعی دارد؛ دوره، پیشرفت یا آمار ساختگی اضافه نمی‌شود.
2. عنوان، وضعیت نسخه و متن در اولویت هستند. ابزارهای شخصی و دستیار به‌صورت details بومی و بسته آغاز می‌شوند. وضعیت ذخیره بیرون بخش تاشو باقی می‌ماند.
3. بستن بخش ابزارها، ذخیرهٔ خودکار یا متن ویرایش‌شده را حذف نمی‌کند؛ داده و اسکریپت‌های موجود حفظ می‌شوند.
4. متن رسمی و شخصی همچنان با کنترل‌های فعلی جابه‌جا می‌شوند؛ حساب، نقش‌ها و امنیت API تغییر نمی‌کنند.
5. قضیه با قاب کامل و عنوان واضح، تعریف با زمینهٔ خنثی، برهان با summary قابل لمس تفکیک می‌شود؛ از نوار رنگی کناری استفاده نمی‌شود.
6. در موبایل ستون‌ها زیر هم می‌آیند؛ فرمول و کد اسکرول مستقل دارند و جهت LTR آن‌ها حفظ می‌شود.
7. حالت‌های focus و hover جفت رنگ مشخص دارند؛ حالت تیره روی توکن‌های متناظر Starlight اعمال می‌شود.

## قرارداد آزمون و محدودیت
آزمون‌های رگرسیون ساختاری قرارداد خانه، disclosureهای بسته و توکن‌های مشترک را بررسی می‌کنند؛ آزمون‌های موجود Markdown و ویرایش حفظ می‌شوند. build و check/tsc باید اجرا شوند. این آزمون‌ها جایگزین بررسی دیداری چنداندازه‌ای، صفحه‌خوان یا آزمون حساب واقعی نیستند. هیچ ادعای WCAG کامل یا آزمون زندهٔ دیتابیس بدون شواهد پذیرفته نیست.

## منابع مقایسه
LibreTexts، MathWorld و Khan Academy به‌عنوان مرجع سازمان‌دهی محتوای آموزشی شناسایی شدند؛ دریافت آنلاین در این اجرا مسدود بود، بنابراین هیچ ویژگی بصری مشاهده‌نشده به آن‌ها نسبت داده نمی‌شود و هیچ توکن از آن‌ها اقتباس نشده است.

## نسخهٔ سیستم مقیاس‌پذیر — تصمیم و منشأ

این سیستم اختصاصی باغ ریاضی است، نه فعال‌سازی یک پریست در رابط OpenDesign و نه ادعای تأیید رسمی shadcn یا GitHub. فایل‌های واقعی `design-systems/shadcn/DESIGN.md` و `tokens.css`، `github/DESIGN.md` و `tokens.css` و پریست Notion بررسی شدند. shadcn برای ساختار اجزای خنثی و توکن‌های معنایی انتخاب شد؛ Primer برای قراردادهای ذخیره، تعارض، بازبینی، فرم و نمایش تدریجی ابزارها مرجع است. Notion به علت تراکم تیترهای بازاریابی و فونت لاتین اختصاصی مبنای اجرا نیست. هیچ رابط برند دیگری کپی نمی‌شود.

پالت تأییدشدهٔ بالا و Vazirmatn حفظ می‌شوند؛ این اقتباس ساختاری است، نه اعمال عین‌به‌عین پالت پریست. نصب shadcn/React لازم نیست: Astro، Starlight و کنترل‌های بومی باقی می‌مانند. `custom.css` منبع توکن‌های پایه و `garden-system.css` منبع اجزای مشترک و حالات معنایی است. فایل JSON باید از همین CSS تولید شود، نه دستی و مستقل.

### معماری اطلاعات و رشد محصول
سه فضای اصلی: کشف محتوای عمومی، مطالعه، فضای شخصی. بازبینی فقط برای نقش مجاز ظاهر می‌شود. ویژگی‌های آینده زیر همین فضاها سازمان می‌یابند؛ افزودن هر قابلیت به ناوبری سطح اول ممنوع نیست اما نیازمند تصمیم مستند است. کتاب و فصل مسیر اصلی یادگیری، پیوند مفاهیم مسیر ثانویه است. جست‌وجو وضعیت خالی، بدون نتیجه، خطا و بازیابی مجدد دارد. پیشرفت آموزشی فقط با دادهٔ واقعی و تعریف روشن معیار نمایش می‌یابد.

### قرارداد اجزا
- کنترل: ارتفاع حداقل ۴۴px؛ شعاع ۶px؛ پنل ۸px؛ فاصله‌های ۴/۸/۱۲/۱۶/۲۴/۳۲/۴۸. مرز تزئینی با مرز کنترل یکی نیست؛ `--control-border` برای ورودی‌هاست.
- مطالعه: ۱۸px و ارتفاع خط ۲، حداکثر ۷۲ch؛ متن رابط ۱۶px، فراداده ۱۴px. تک‌خانوادهٔ فارسی برای محیط علمی مجاز است؛ فرمول KaTeX و کد monospace مستقل‌اند. فاصلهٔ حروف منفی روی متن پیوستهٔ فارسی اعمال نشود.
- دکمه: یک اقدام اصلی در هر زمینهٔ تصمیم؛ ثانویه با مرز واضح؛ حالت غیرفعال بدون اجرای عمل. بارگذاری با متن و `aria-busy`، نه فقط spinner. تغییر حالت نباید عرض کنترل را جهش دهد.
- فرم: label همیشگی، راهنما با `aria-describedby`، خطا کنار همان ورودی با `aria-invalid` و متن رفع مشکل؛ جایگزین نکردن label با placeholder.
- وضعیت: ذخیره‌شده، در حال ذخیره، ناموفق، تعارض. رنگ تنها نشانه نیست. حفظ متن محلی هنگام خطای شبکه؛ بازیابی بدون پاک‌کردن ورودی. بازنشانی و حذف نیازمند تأیید روشن هستند.
- نسخه: «متن رسمی» و «نسخهٔ شخصی من» در بالای مطالعه. نسخهٔ شخصی خصوصی است؛ ارسال پیشنهاد با ذخیرهٔ خصوصی دو عمل جدا هستند.
- دستیار: اختیاری، با محدودهٔ محتوا و منابع قابل بازکردن؛ پاسخ بدون شاهد به‌عنوان دانش قطعی نمایش داده نمی‌شود؛ خطا و قطع استریم باید قابل فهم باشند.
- مودال: عنوان قابل‌دسترسی، Escape، محصورشدن فوکوس و بازگشت به کنترل مبدأ؛ از dialog بومی استفاده شود.
- موبایل: ابزارها زیر متن یا در پنل اختیاری، نه سه ستون فشرده؛ فقط فرمول و کد اسکرول داخلی دارند. ویژگی جدید در عرض ۳۲۰px و بزرگ‌نمایی ۲۰۰٪ باید بررسی شود.
- حرکت: کوتاه و عملکردی؛ رعایت reduced-motion و forced-colors. هیچ انیمیشن ورود تزئینی.

### قرارداد توسعه و پذیرش
نام‌گذاری `garden-*`، توکن معنایی به‌جای رنگ محلی، ویژگی‌های منطقی CSS به‌جای left/right، شناسهٔ inspectable برای اجزای نمونه. اجزا حالت روشن/تیره، صفحه‌کلید، خطا، خالی، بارگذاری و متن بلند دارند. افزودن کتابخانه فقط برای نیاز رفتاری اثبات‌شده؛ افزایش وابستگی و اندازهٔ bundle باید مستند شود.

آزمون ساختاری CSS اثبات تعامل یا WCAG نیست. پذیرش هر صفحه نیازمند آزمون حساب واقعی، عدم اتلاف Markdown، ایزولاسیون کاربر، خوانایی فرمول، صفحه‌کلید، موبایل و صفحه‌خوان است. کیت نمونه با دادهٔ محلی نشان‌داده‌شده از API مستقل است؛ ذخیرهٔ آن ذخیرهٔ حساب نیست.

### منابع مشاهده‌شده و محدودیت تحقیق
`https://ui.shadcn.com/docs/theming`: توکن‌های CSS معنایی و تغییر تم بدون بازنویسی کلاس‌ها. `https://primer.style/product/`: مستندات مستقل برای progressive disclosure، saving، degraded experiences، empty states و forms. محتوای هر دو با دریافت مستقیم خوانده شد؛ این بررسی محتوایی است، نه ممیزی دیداری سایت‌ها. Khan Academy پاسخ چالش جاوااسکریپت داد و شاهد طراحی محسوب نمی‌شود. استخراج وب با 403 ناموفق بود؛ دریافت مستقیم دو منبع فوق موفق بود. زیر‌دستور حدس‌زده‌شدهٔ فهرست پریست‌ها پشتیبانی نشد؛ به‌جای آن فایل‌های واقعی کتابخانه خوانده شدند.

## مرحلهٔ بعد
تفکیک ورود/ثبت‌نام؛ طراحی حالات خالی و فیلترهای فضای شخصی؛ آزمون دیداری روشن/تیره و موبایل؛ کنترل وضعیت رسمی/شخصی هنگام ورود مستقیم به ویرایش؛ کاهش بارگذاری گراف تا زمان درخواست کاربر با آزمون چرخهٔ حیات.

## قرارداد تکمیلی مسیرهای واقعی
- سربرگ موبایل به‌جای فرم فشرده، پیوند «جست‌وجو» به صفحهٔ کشف دارد؛ منو حداقل ۴۴×۴۴ است. فرم کامل دسکتاپ حفظ می‌شود.
- نتایج جست‌وجو در صفحه‌های ۲۴تایی نمایش می‌یابند؛ تعداد کل و فیلترها حفظ می‌شوند. این محدودسازی DOM است، نه ادعای صفحه‌بندی دیتابیس یا حل مقیاس نامحدود.
- هر بلوک کدِ قابل اسکرول نام دسترس‌پذیر متمایز دارد؛ متن خام Markdown تغییر نمی‌کند.
- منبع رفتاری تکمیلی: shadcn Field و `aria-invalid`، Material Web برای تفاوت disabled/focus، Impeccable Operate/Read برای تراکم، افشای تدریجی و حالت‌های واقعی، UI UX Pro Max برای حالت خالی و بازیابی خطا. مستندات shadcn و Material Web از Context7 با پروکسی دریافت شدند. وابستگی UI تازه‌ای نصب نمی‌شود؛ استفاده از راهنما با نصب کتابخانه یکسان نیست.
- بررسی خودکار axe فقط خطاهای قابل تشخیص خودش را پوشش می‌دهد؛ بدون آزمون دستی صفحه‌خوان، ادعای انطباق کامل WCAG ممنوع است.


## Frontend autonomous implementation — 2026-10-09

Preserve the calm blue/neutral scientific palette, local Vazirmatn and raw mathematical content. Home is a compact reading index with one H1 and an immediate example-reading action, rather than a second oversized title. Study and personal-account navigation are distinct sidebar groups. TOC exists only for notes with headings; artificial sequential navigation is disabled for account/workflow pages.

The assistant remains optional native details. At wide widths its open surface sits beside the canonical/personal article; narrow screens stack it without squeezing prose. No new chat infrastructure. Requests expose busy state and explicit cancellation. Private versions and review comments are preserved during failures.

Material 3 guidance is adapted in `garden-system.css`: surface-container and surface-container-high roles, restrained state layers, clear primary action, visible focus and 44px targets. shadcn guidance is adapted as paired primary/primary-foreground tokens and existing labeled native forms with aria-invalid. Neither component package is installed. Sources fetched with the Context7 CLI: https://ui.shadcn.com/docs/theming, https://ui.shadcn.com/docs/components/field, https://github.com/material-components/material-web/tree/main/docs, https://starlight.astro.build/reference/frontmatter/. Raw fetched excerpts are retained under docs/verification/frontend-redesign/*-context7.txt.

Installed UI/UX Pro Max search was checked: its broad design-system result suggested marketing/testimonials and was rejected as unsuitable to this brief. Use the installed skill's verified touch/accessibility guidance and Impeccable Read/Operate references instead. Upstream source directories were inspected only; no unknown executable was run and no global skill was overwritten. nosubscription.txt is an unrelated tool catalogue, not a design skill or dependency source.

Pen 0.3.11 local interactive canvas produced an editable reading/tools layout and PNG without external AI generation, signup or private-data export. Files: docs/verification/frontend-redesign/reading-layout.pen and reading-layout.png. The artifact explains layout intent; browser screenshots remain the implementation evidence. All external model generation would require the approved 9Router route; none was used here.
