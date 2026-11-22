export const UMKO_KINDS = {
  concept: { label: 'مفهوم و ساختار', en: 'Concept', color: '#0d9488' },
  property: { label: 'ویژگی و ناوردا', en: 'Property', color: '#6366f1' },
  assertion: { label: 'گزاره و قضیه', en: 'Assertion', color: '#1d4ed8' },
  proof: { label: 'برهان و اثبات', en: 'Proof', color: '#64748b' },
  example: { label: 'مثال و مصداق', en: 'Example', color: '#9333ea' },
  counterexample: { label: 'مثال نقض', en: 'Counterexample', color: '#dc2626' },
  problem: { label: 'مسئله و آزمون', en: 'Problem', color: '#ea580c' },
  solution: { label: 'راه‌حل و شگرد', en: 'Solution', color: '#059669' },
  hint_ladder: { label: 'نردبان سقراطی', en: 'Hint Ladder', color: '#d97706' },
  technique: { label: 'تکنیک و شگرد', en: 'Technique', color: '#d97706' },
  problem_archetype: { label: 'تیپ مسئله', en: 'Archetype', color: '#c026d3' },
  pitfall: { label: 'دام و کج‌فهمی', en: 'Pitfall', color: '#b45309' },
  visual_lab: { label: 'آزمایشگاه تعاملی', en: 'Visual Lab', color: '#0284c7' },
  algorithm: { label: 'الگوریتم', en: 'Algorithm', color: '#0284c7' },
  code_kernel: { label: 'هسته محاسباتی', en: 'Code Kernel', color: '#475569' },
  collection: { label: 'مجموعه و نقشه راه', en: 'Collection', color: '#7c3aed' },
  comparison: { label: 'تحلیل مقایسه‌ای', en: 'Comparison', color: '#4f46e5' },
  remark: { label: 'یادداشت تفسیری', en: 'Remark', color: '#64748b' },
  axiom: { label: 'اصل موضوعه', en: 'Axiom', color: '#0e7490' },
  theory: { label: 'چارچوب نظری', en: 'Theory', color: '#4338ca' },
  symbol: { label: 'نماد و قرارداد', en: 'Symbol', color: '#334155' },
};

export const UMKO_SUBTYPES = {
  // assertion
  theorem: 'قضیه',
  proposition: 'گزاره',
  lemma: 'لم کمکی',
  corollary: 'نتیجه',
  criterion: 'معیار و آزمون',
  identity: 'اتحاد جبری',
  inequality: 'نامساوی',
  conjecture: 'حدس باز',
  refuted_conjecture: 'حدس ابطال‌شده',
  // concept
  structure: 'ساختار جبری',
  type_concept: 'مفهوم رده/نوع',
  role_concept: 'مفهوم نقشی',
  object_instance: 'شیء شاخص',
  // property
  boolean_trait: 'ویژگی بولی',
  invariant: 'ناوردا',
  regularity: 'همواری تحلیلی',
  // proof
  rigorous: 'برهان صوری',
  sketch: 'طرح کلی اثبات',
  computational: 'اثبات محاسباتی',
  // problem
  olympiad_proof: 'مسئله المپیاد',
  olympiad_short: 'کوتاه‌پاسخ المپیاد',
  university_proof: 'تمرین اثباتی دانشگاه',
  university_calc: 'تمرین محاسباتی دانشگاه',
  exam_mcq: 'تست ارشد و ۷۰۷',
  // solution
  rigorous_full: 'حل تشریحی کامل',
  exam_shortcut: 'شگرد تستی سریع',
  heuristic_walkthrough: 'روایت کشف ایده',
  cas_assisted: 'حل محاسباتی کامپیوتری',
  // collection
  roadmap: 'نقشه راه (MOC)',
  chapter_handout: 'درسنامه / جزوه',
  problem_set: 'مجموعه تمرین',
  index_hub: 'صفحه کانونی / نمایه',
  // visual_lab
  geogebra_2d: 'شبیه‌ساز دوبعدی',
  geogebra_3d: 'شبیه‌ساز سه‌بعدی',
  geogebra_cas: 'آزمایشگاه جبر نمادین',
  interactive_canvas: 'بوم تعاملی وب',
};

export const UMKO_LEVELS = {
  L1_intro: { label: 'مقدماتی و دبیرستان', short: 'L1' },
  L2_calc_basic: { label: 'پایه دانشگاهی', short: 'L2' },
  L3_undergrad_core: { label: 'هسته کارشناسی', short: 'L3' },
  L4_grad_advanced: { label: 'تحصیلات تکمیلی', short: 'L4' },
  L5_research: { label: 'پژوهشی و مرز دانش', short: 'L5' },
};

export const UMKO_TRACKS = {
  pure_university: 'دانشگاهی محض',
  applied_eng: 'کاربردی و مهندسی',
  konkur_arshad: 'کنکور ارشد و ۷۰۷',
  olympiad: 'المپیاد و مسابقات',
  cs_theory: 'علوم کامپیوتر نظری',
  recreational: 'ریاضیات تفریحی',
};

export const UMKO_STATUSES = {
  canonical: { label: 'نسخه رسمی', color: '#16a34a' },
  verified: { label: 'تأیید علمی', color: '#0d9488' },
  reviewed: { label: 'بازبینی‌شده', color: '#2563eb' },
  draft: { label: 'پیش‌نویس', color: '#d97706' },
  seed: { label: 'بذر اولیه', color: '#7c3aed' },
  deprecated: { label: 'منسوخ‌شده', color: '#dc2626' },
};

export const UMKO_RELATIONS = {
  rel_requires: { forward: 'پیش‌نیازهای آموزشی', reverse: 'پیش‌نیاز برای', icon: '🎓' },
  rel_proves: { forward: 'برهان برای', reverse: 'اثبات‌شده توسط', icon: '💡' },
  rel_depends_sig: { forward: 'مفاهیم صورت قضیه', reverse: 'به‌کاررفته در صورت', icon: '📐' },
  rel_depends_def: { forward: 'مفاهیم بدنه تعریف', reverse: 'به‌کاررفته در تعریف', icon: '📘' },
  rel_depends_proof: { forward: 'قضایا و احکام اثبات', reverse: 'به‌کاررفته در برهان', icon: '🔎' },
  rel_solves: { forward: 'راه‌حل برای مسئله', reverse: 'حل‌شده توسط', icon: '🧩' },
  rel_uses_technique: { forward: 'شگرد و تکنیک حل', reverse: 'به‌کاررفته در حل', icon: '⚡' },
  rel_matches_archetype: { forward: 'تیپ مسئله', reverse: 'مسائل هم‌تیپ', icon: '🎯' },
  rel_isomorphic_variant: { forward: 'مسائل مشابه و هم‌ساختار', reverse: 'مسائل مشابه', icon: '🔄' },
  rel_applies_theorem: { forward: 'قضایای کاربردی', reverse: 'کاربرد در حل مسائل', icon: '📌' },
  rel_triggers_pitfall: { forward: 'دام‌ها و خطاهای مرتبط', reverse: 'دام در این مسئله/مفهوم', icon: '⚠️' },
  rel_illustrates: { forward: 'مثال برای', reverse: 'مثال‌های این مفهوم', icon: '🔍' },
  rel_refutes: { forward: 'مثال نقض برای', reverse: 'ابطال‌شده با مثال نقض', icon: '💥' },
  rel_visualizes: { forward: 'شبیه‌ساز بصری', reverse: 'شبیه‌ساز برای این موضوع', icon: '🎛️' },
  rel_generalizes: { forward: 'تعمیم به حالت کلی‌تر', reverse: 'حالت خاص از', icon: '🌿' },
  rel_specializes: { forward: 'حالت خاص', reverse: 'تعمیم‌یافته به', icon: '🌱' },
  rel_extends: { forward: 'گسترش ساختار', reverse: 'گسترش‌یافته توسط', icon: '🧱' },
  rel_has_field: { forward: 'اجزا و عملگرها', reverse: 'جزئی از ساختار', icon: '⚙️' },
  rel_has_trait: { forward: 'ویژگی‌های صادق', reverse: 'صادق روی این اشیاء', icon: '✨' },
  rel_implies: { forward: 'استلزام منطقی', reverse: 'نتیجه از', icon: '➡️' },
  rel_contrasts_with: { forward: 'مقایسه و تمایز با', reverse: 'مقایسه با', icon: '⚖️' },
  rel_scaffolds: { forward: 'نردبان سقراطی برای', reverse: 'راهنمایی سقراطی', icon: '🪜' },
};
