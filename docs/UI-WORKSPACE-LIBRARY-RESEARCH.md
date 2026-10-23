# پژوهش اجزای آماده برای فضای کاری باغ ریاضی

## محدوده و روش
در این دور پیاده‌سازی فرانت متوقف شد. 15 مخزن از GitHub با shallow clone دریافت شد؛ README، LICENSE، commit و تاریخ commit ثبت شدند. مستندات RTL، Markdown و نمونه sidebar از خود سورس خوانده شدند. web_search برای کشف گزینه‌ها استفاده شد؛ web_extract به خاطر محدودیت network address شکست خورد و git جایگزین شد. شواهد: `docs/evidence/ui-workspace-research/`. تاریخ سرشاخه مخزن صرفاً نشانه فعالیت است، نه اثبات کیفیت یا امنیت. شمار ستاره‌ها از API مستقلاً بررسی نشده و مبنای رتبه‌بندی نیست. اجرای demo/RTL روی اجزای جدید در این دور انجام نشده است.

## نتیجه تصمیم
پیشنهاد: shadcn/ui و Base UI به عنوان خانواده واحد UI، assistant-ui برای گفتگو، Lucide برای آیکون، Astro SSR با React islands برای کنترل‌های تعاملی. Notion الگوی سازمان‌دهی است؛ سورس اختصاصی یا asset آن کپی نمی‌شود. بلاک sidebar-10 موجود در سورس shadcn مرجع ملموس composition است: sidebar، header h-14، breadcrumb، NavActions و سند max-w-3xl. کل sample مستقل از محصول نیست؛ داده‌ها، account و actionهای واقعی باید جایگزین placeholder شوند.

## مقایسه
| نام و مخزن | شواهد و مجوز | کاربرد پیشنهادی / دلیل عدم انتخاب |
|---|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | MIT؛ سورس sidebar-10 و مستند RTL خوانده شد | انتخاب اصلی؛ Sidebar/Sheet/Breadcrumb/Dropdown/Command/Tabs/Resizable/Tooltip، نه ساخت کنترل‌ها از صفر؛ RTL=true در registry |
| [Base UI](https://github.com/mui/base-ui) | MIT؛ DirectionProvider سند و تست دارد | primitive پایه shadcn؛ رفتار keyboard/focus/overlay آماده، اما CSS و HTML dir باید جدا اعمال شوند |
| [React Aria](https://github.com/adobe/react-spectrum) | Apache-2.0؛ رفتار accessibility در README | بدیل جدی برای نیازهای پیچیده؛ همزمان با Base UI برای همان کنترل نصب نشود |
| [Radix Themes](https://github.com/radix-ui/themes) | README و MIT از جستجوی GitHub؛ clone مستقل در این دور نشده | بدیل styled و منسجم؛ برای این پروژه shadcn با assistant-ui اشتراک بیشتری دارد؛ کنار آن یک theme موازی نسازیم |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | MIT؛ docs RTL و custom runtime خوانده شد | انتخاب قطعی گفتگو؛ thread/composer/scroll/cancel؛ custom adapter برای SSE سایت، نه اتصال مستقیم browser به Dify |
| [BlockNote](https://github.com/TypeCellOS/BlockNote) | core MPL-2.0، xl GPL-3.0/commercial؛ import/export Markdown رسماً lossy | بهترین نامزد تجربه بلوکی فوری؛ برای source-of-truth Obsidian فعلاً جایگزین CodeMirror نیست؛ نیازمند آزمون round-trip و block سفارشی |
| [Plate](https://github.com/udecode/plate) | مجوز ریشه MIT با استثنای package LICENSE؛ Notion template به pro domain لینک می‌شود | نامزد editor extensible؛ template Pro را بدون بررسی مجوز، رایگان فرض نکنیم؛ هزینه integration بیشتر از shell |
| [Novel](https://github.com/steven-tey/novel) | Apache-2.0؛ آخرین commit مشاهده‌شده 2025-01-18 | ظاهر Notion-like مناسب inspiration؛ نسبت به BlockNote/Plate فعالیت اخیر کمتر؛ انتخاب پایه نیست |
| [Lucide](https://github.com/lucide-icons/lucide) | ISC؛ بخش icons مشتق از Feather اعلان مجوز جدا دارد | انتخاب اصلی؛ هم‌زبان با shadcn، import انتخابی؛ کل خانواده و اندازه ثابت |
| [Phosphor](https://github.com/phosphor-icons/react) | MIT؛ mirrored prop برای RTL | بدیل با وزن‌های متنوع؛ با Lucide مخلوط نشود |
| [Tabler Icons](https://github.com/tabler/tabler-icons) | MIT و 24px/2px از README ایندکس‌شده GitHub؛ clone نشده | بدیل outline خوب؛ تعداد بیشتر لزوماً طراحی بهتر نیست |
| [react-force-graph](https://github.com/vasturiano/react-force-graph) | MIT؛ نمونه canvas labels و interaction | اگر renderer فعلی مانع UX شد، 2D بهترین جایگزین نامزد؛ canvas به همراه فهرست متنی دسترس‌پذیر |
| [React Flow](https://github.com/xyflow/xyflow) | MIT؛ node-based UI | برای editor دیاگرام عالی، برای روابط خودکار یادداشت force graph مستقیم‌تر است؛ الگوریتم layout جدا می‌خواهد |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | MIT با استثناهای backend/native و third parties | مرجع واقعی workspace/AI کنار سند؛ کپی کل app معماری و مجوز را پیچیده می‌کند |
| [Reor](https://github.com/reorproject/reor) | AGPL-3.0؛ commit مشاهده‌شده 2025-05-13 | مرجع رفتار notes+AI، نه dependency یا کپی کد؛ frontmatter محدودیت دارد |
| [Fumadocs](https://github.com/fuma-nama/fumadocs) | MIT | همچنان documentation-first؛ جایگزینی Starlight با آن مسئله workspace را حل نمی‌کند |
| [Material Web](https://github.com/material-components/material-web) | Apache-2.0؛ README صریحاً maintenance mode pending new maintainers می‌گوید | Material3 منبع رفتار/state/touch باشد، نه موتور موازی UI؛ commit تازه maintenance warning را رد نمی‌کند |

## نگاشت UX آماده به نیاز واقعی
- shell: بلاک sidebar-10، نه dashboard analytics یا landing تبلیغاتی. در RTL درخت یادداشت سمت راست، سند مرکز و rail ابزار در چپ فیزیکی طبق خواسته کاربر.
- حساب: Avatar/Dropdown در سربرگ سراسری؛ هنگام anonymous، ورود با label روشن. لینک حساب صرفاً در درخت فایل کافی نیست.
- ویرایش: action کنار عنوان و switch رسمی/شخصی واضح؛ owner endpoint اگر fork برگرداند نمایش personal پیش‌فرض؛ query رسمی explicit، بدون نشت cache خصوصی.
- ابزار: rail sticky؛ گراف خودکار با lazy import پس از mount، نه CTA نمایش اولیه. graph retry تنها در خطا؛ توقف animation در پس‌زمینه/reduced motion.
- دستیار: thread registry واقعی assistant-ui، composer قابل مشاهده و suggestions; انتخاب متن chip قابل حذف و scope badge. نیاز انتخاب یکتای Markdown فعلی محدودیت محصول است و باید صادقانه نشان داده شود، نه silently relaxed.
- موبایل: Sheet/Drawer آماده با focus trap و Escape؛ کنترل ثابت دستیار/ارتباطات؛ محتوای سند نباید پشت overlay گیر کند.
- جستجو: Command palette علاوه بر search page؛ keyboard shortcut با امکان استفاده بدون shortcut، نتایج محدود به مجوز.
- state: save status پایدار کنار editor؛ toast تنها بازخورد ذخیره نیست. empty/error/loading با اجزای آماده، نه سکوت یا داده ساختگی.

## چرا کتابخانه به تنهایی کافی نیست
shadcn مجموعه سورس قابل مالکیت است، نه محصول آماده یا تضمین زیبایی. Base UI unstyled است. assistant-ui runtime و component می‌دهد اما نسخه شخصی و security سایت را حل نمی‌کند. هیچ‌یک وجودشان اثبات WCAG یا کیفیت فارسی نیست. مشکل فعلی topology و visibility است؛ نصب چند library و تزئین همان صفحه رد شده کافی نیست.

## مسیر اجرایی پس از پژوهش
1. استخراج selective shell/components از registry رسمی با RTL؛ حذف shell مستندات برای routeهای کاری، نگهداری renderer فعلی.
2. sidebar/header/document/tool rail؛ یک خانواده آیکون؛ اسکرین‌شات واقعی قبل از ادعای موفقیت.
3. assistant-ui adapter: hash/scope/selection/conversation و cancel-on-context-change حفظ؛ streaming error از completion جدا.
4. personal default و canonical explicit با تست anonymous/owner/conflict؛ داده خصوصی در SSR cache عمومی قرار نگیرد.
5. ماتریس 320/390/1280/1440، light/dark، keyboard، Persian/math؛ بعد از آن تصمیم editor بلوکی با fixtureهای Obsidian. حفظ Markdown پیش‌نیاز است، نه وعده.

## اثرهای موجود پیش از توقف
در نوبت قبل @astrojs/react، React و @assistant-ui/react نصب و integration در astro.config اضافه شد. این‌ها از قبل باقی‌اند؛ این پژوهش ادعای پیاده‌سازی دستیار روی آن‌ها ندارد. در این دور فقط evidence/report نوشته شد، کد UI تغییر نکرد.
