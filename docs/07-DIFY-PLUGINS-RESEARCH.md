# مکمل‌های Dify برای پنل مطالعه ریاضی

تاریخ مشاهده: 2026-10-09. تصمیم کاربر: Dify تأیید شده است. این سند پیشنهاد مکمل‌هاست، نه نصب یا تأیید اجرایی آنها.

## روش

مخزن langgenius/dify-official-plugins کلون شد؛ README و کد Maths، Parent Child Chunk و Podcast Generator، راهنمای MinerU و OpenAI API Compatible خوانده شدند. متادیتای ۱۱ مخزن از GitHub API و README/مجوزهای قابل دریافت بررسی شد. جستجوی وب برای کشف اتصال‌ها انجام شد؛ پاسخ ربات‌های discussion مبنای تأیید قابلیت نیست. هیچ مدل یا افزونه‌ای نصب و اجرا نشد.

## پیشنهاد حداقلی

1. Dify + افزونه رسمی OpenAI API Compatible برای اتصال به 9Router. chat، tool calls، embedding، rerank و صوت قابلیت‌های جدا هستند و باید مستقل روی gateway آزموده شوند. وجود provider تضمین پشتیبانی gateway نیست.
2. رابط خود سایت: پنل ساده SSE؛ assistant-ui فقط اگر رابط آماده React واقعاً کار را کمتر کند. در Astro می‌توان island محدود داشت؛ بازنویسی کل سایت به React لازم نیست. adapter Dify آماده در منابع بررسی‌شده تأیید نشد.
3. ابزار Maths رسمی فقط محاسبات عددی؛ کد آن numexpr.evaluate است، نه SymPy یا موتور اثبات. برای جبر نمادین، SymPy پشت API محدود سایت و Custom Tool/OpenAPI. API محدود نیازمند توسعه کوچک است؛ پلاگین آماده معتبر SymPy در بررسی حاضر تأیید نشد.
4. Promptfoo برای رگرسیون از ابتدا، از طریق HTTP/custom provider به API سایت. این پلاگین Dify نیست؛ ورودی تست باید هویت و context واقعی سایت را طی کند. داوری LLM اثبات صحت ریاضی نیست؛ آزمون مالکیت قطعی جدا لازم است.
5. ابتدا لاگ خود Dify؛ Langfuse هنگام نیاز به trace، هزینه و تحلیل جدی. اتصال tracing بومی از مستندات رسمی Langfuse گزارش شده؛ افزونه مدیریت prompt چیز دیگری است. استفاده از هر دو به عنوان منبع اصلی prompt بدون سیاست نسخه ممنوع.

## پلاگین‌های رسمی و نقش آنها

| مسیر در مخزن official-plugins | نقش | تصمیم |
|---|---|---|
| models/openai_api_compatible | LLM، embedding، rerank، STT، TTS | اولویت بالا با آزمون endpoint |
| tools/maths | محاسبه عبارت با numexpr | فقط محاسبه عددی؛ نه انتگرال/اثبات |
| tools/wolframalpha | Full Results API با AppID | اختیاری و خارجی؛ هزینه/خروج داده |
| tools/parent_child_chunk | والد و فرزند بر مبنای جداکننده/طول | آزمون حفظ قضیه و اثبات؛ math-aware نیست |
| tools/general_chunk و qa_chunk | پردازش متن/پرسش‌پاسخ | فقط با نیاز سنجیده؛ نه هم‌زمان همه |
| tools/mineru | PDF و فرمول، رسمی یا self-hosted | مرحله ورود PDF؛ نه Markdown اصلی |
| tools/podcast_generator | ترکیب صدای دو راوی با TTS | مرحله بعد؛ سناریو باید جدا تولید شود |
| tools/searxng، firecrawl | جستجو و استخراج وب | حالت دانش بیرونی اختیاری |
| datasources/github | منبع GitHub | فقط اگر ingest از مخزن انتشار انتخاب شد؛ Sync فعلاً تصمیم جداست |
| models/huggingface_tei | provider سرویس embedding | فقط در صورت استقرار مدل محلی؛ موازی بی‌دلیل نسازیم |

در کد Podcast Generator، خط‌های متن به نوبت به دو صدا داده می‌شوند؛ client.audio.speech.create فراخوانی می‌شود و pydub قطعات را ترکیب می‌کند. این تولید پادکست رایگان یا تضمین تلفظ فارسی نیست. base URL در شاخه OpenAI با /v1 ترکیب می‌شود؛ اشتباه /v1/v1 در اتصال باید آزموده شود. راهنمای OpenAI API Compatible نیز تفاوت base URL انواع مدل را گوشزد می‌کند.

Parent Child Chunk از جداکننده و طول استفاده می‌کند؛ AST قضیه/اثبات ندارد. کد پاکسازی ممکن است متن را تغییر دهد. داده اصلی تغییر نکند؛ نمونه‌های فرمول و callout در متن ایندکس‌شده مقایسه شوند.

## پروژه‌های مکمل و ستاره مشاهده‌شده

| مخزن | ستاره | نوع/مجوز | تصمیم |
|---|---:|---|---|
| langgenius/dify-official-plugins | 634 | مخزن رسمی؛ Apache-2.0 | اعتبار ناشر مهم‌تر از ستاره |
| assistant-ui/assistant-ui | 12465 | UI React؛ MIT | اختیاری؛ adapter لازم |
| sympy/sympy | 14994 | کتابخانه محاسبات؛ مجوز دقیق نسخه بررسی شود | CAS پیشنهادی، نه اجرای آزاد Python |
| docling-project/docling | 68591 | پردازش سند؛ MIT برای کد | جایگزین MinerU؛ اتصال HTTP/سرویس نیازمند بررسی |
| opendatalab/MinerU | 81333 | پردازش سند؛ مجوز شرط‌دار فعلی | مزیت پلاگین رسمی آماده |
| langfuse/langfuse | 35567 | هسته MIT، مسیرهای ee مجوز جدا | observability اختیاری |
| promptfoo/promptfoo | 25839 | CLI ارزیابی؛ MIT | برای آزمون رگرسیون |
| huggingface/text-embeddings-inference | 5078 | سروینگ؛ Apache-2.0 | فقط اگر self-hosting مدل لازم شد |
| firecrawl/firecrawl | 189787 | استخراج وب؛ AGPL-3.0 | برای جزوه داخلی لازم نیست |
| searxng/searxng | 38138 | جستجو؛ AGPL-3.0 | مرحله بیرونی، نه هسته RAG |
| langgenius/webapp-conversation | 1102 | قالب MIT؛ archived=true | برای پایه جدید پیشنهاد نمی‌شود |

همه جز قالب آخر در API غیرآرشیوی بودند. ستاره و push گواه کیفیت، سازگاری یا امنیت نیستند. داده خام بررسی در /tmp/dify-addons-evidence تهیه شد؛ برای ماندگاری در پوشه evidence پروژه کپی می‌شود.

## PDF: MinerU یا Docling، نه هر دو

MinerU به خاطر پلاگین رسمی و نمونه DSL واردکردنی مسیر اتصال آماده‌تری دارد. Docling گزینه MIT برای کد است و ارزش آزمون مقایسه‌ای دارد. کیفیت OCR فارسی/فرمول و منابع CPU/GPU در این بررسی سنجیده نشده است. کد و وزن مدل‌ها مجوزهای جدا ممکن است داشته باشند.

LICENSE.md فعلی MinerU، Apache با شروط اضافه است: الزام attribution خدمات آنلاین و آستانه‌هایی برای مجوز تجاری. نباید آن را صرفاً Apache یا با مجوز نسخه‌های قدیمی معرفی کرد.

## ابزارهای اختصاصی محدود سایت

آماده‌ها این قراردادهای مختص محصول را حذف نمی‌کنند:
- get_note_context: یادداشت/نسخه/بلاک مجاز؛
- search_allowed_notes: بازیابی از منابع مجاز؛
- propose_note_edit: پیشنهاد تغییر، نه اعمال مستقیم؛
- calculate_symbolic: عمل مجاز و فرض‌های دامنه، محدودیت زمان/حافظه.

این‌ها پیشنهاد طراحی هستند، نه endpointهای ساخته‌شده. می‌توان با OpenAPI/Custom Tool آغاز کرد؛ MCP فقط اگر مصرف‌کنندگان متعدد مزیت ایجاد کنند. دسترسی SQL عمومی یا admin Supabase به مدل داده نشود. اتصال context و هویت از بک‌اند سایت باشد.

## آنچه فعلاً اضافه نکنیم

LangChain/LangGraph/PydanticAI به عنوان موتور موازی، RAGFlow و چند پایگاه برداری هم‌زمان، crawler برای Markdown موجود، sandbox اجرای کد آزاد، افزونه وب برای تمام پاسخ‌ها، چند سیستم ذخیره prompt و ingestion موازی. این موارد فقط پس از نیاز قابل‌اندازه‌گیری توجیه دارند.

## دروازه پذیرش

- نسخه Dify، manifest و نسخه پلاگین قفل شوند؛ فایل DSL هم در کنترل نسخه بدون credentials.
- فقط pluginهای موردنیاز نصب شوند؛ ناشر، dependencyها، مجوز و مقصد شبکه بررسی شود.
- مدل‌ها از 9Router؛ سرویس خارجی غیرمدلی نیازمند مسیر مصوب جداست و خودسرانه فعال نشود.
- دو حساب، citation خصوصی، فایل خروجی، run ID و cache تست شوند.
- prompt/log ممکن است جزوه خصوصی داشته باشد؛ حذف داده، retention و redaction صریح باشند.
- تست math: فرض دامنه، ورودی نامعتبر، محدودیت اجرا؛ CAS اثبات عمومی نیست.
- تست UI: RTL/LaTeX، لغو/اتصال مجدد، تغییر صفحه در یک conversation و تأیید ویرایش.
- اتصال مدل/embedding/reranker/TTS هرکدام جدا تست شود؛ سازگاری OpenAI نام واحد برای قراردادهای یکسان نیست.

## منابع

- https://github.com/langgenius/dify-official-plugins/tree/main/models/openai_api_compatible
- https://github.com/langgenius/dify-official-plugins/tree/main/tools/maths
- https://github.com/langgenius/dify-official-plugins/tree/main/tools/wolframalpha
- https://github.com/langgenius/dify-official-plugins/tree/main/tools/parent_child_chunk
- https://github.com/langgenius/dify-official-plugins/tree/main/tools/mineru
- https://github.com/langgenius/dify-official-plugins/tree/main/tools/podcast_generator
- https://github.com/assistant-ui/assistant-ui
- https://github.com/langgenius/webapp-conversation
- https://github.com/sympy/sympy
- https://github.com/docling-project/docling
- https://github.com/opendatalab/MinerU/blob/master/LICENSE.md
- https://github.com/langfuse/langfuse/blob/main/LICENSE
- https://langfuse.com/integrations/no-code/dify
- https://github.com/promptfoo/promptfoo
- https://github.com/huggingface/text-embeddings-inference
- https://github.com/firecrawl/firecrawl
- https://github.com/searxng/searxng

مستندات PRD و معماری هنوز با تصمیم Dify هماهنگ‌سازی نشده‌اند؛ این سند پژوهشی است و هیچ نصب یا benchmark انجام نشده است.
