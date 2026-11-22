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

export const UMKO_KIND_SUBTYPES = {
  theory: ['foundation', 'domain_theory', 'cs_model'],
  axiom: ['foundational', 'domain_postulate'],
  symbol: ['operator', 'relation', 'constant', 'convention'],
  concept: ['structure', 'type_concept', 'role_concept', 'object_instance'],
  property: ['boolean_trait', 'invariant', 'regularity'],
  assertion: ['theorem', 'proposition', 'lemma', 'corollary', 'criterion', 'identity', 'inequality', 'conjecture', 'refuted_conjecture'],
  proof: ['rigorous', 'sketch', 'computational'],
  example: ['canonical', 'worked', 'boundary'],
  counterexample: ['hypothesis_drop', 'converse_failure', 'pathology'],
  problem: ['olympiad_proof', 'olympiad_short', 'university_proof', 'university_calc', 'exam_mcq'],
  solution: ['rigorous_full', 'exam_shortcut', 'heuristic_walkthrough', 'cas_assisted'],
  hint_ladder: ['socratic_polya', 'exam_cue'],
  technique: ['proof_strategy', 'olympiad_config', 'exam_trick', 'polya_heuristic'],
  problem_archetype: ['olympiad_family', 'exam_type', 'canonical_template'],
  pitfall: ['logical_fallacy', 'domain_edge_trap', 'misconception'],
  visual_lab: ['geogebra_2d', 'geogebra_3d', 'geogebra_cas', 'interactive_canvas'],
  algorithm: ['exact_symbolic', 'numerical_method', 'combinatorial_graph', 'optimization_randomized'],
  code_kernel: ['symbolic_cas', 'numerical_experiment', 'formal_snippet'],
  collection: ['chapter_handout', 'problem_set', 'roadmap', 'index_hub'],
  comparison: ['concept_matrix', 'method_tradeoff'],
  remark: ['intuition', 'historical', 'open_commentary'],
};

export const UMKO_SUBTYPES = {
  // theory (3)
  foundation: 'بنیادهای منطقی و مجموعه‌ای',
  domain_theory: 'نظریه ساختاریافته',
  cs_model: 'مدل محاسباتی',
  // axiom (2)
  foundational: 'اصول پایه‌ای',
  domain_postulate: 'اصل متعارف نظریه',
  // symbol (4)
  operator: 'عملگر و تابعک',
  relation: 'رابطه و هم‌ارزی',
  constant: 'ثابت و شیء نمادین',
  convention: 'قرارداد نمادگذاری',
  // concept (4)
  structure: 'ساختار جبری',
  type_concept: 'مفهوم رده/نوع',
  role_concept: 'مفهوم نقشی',
  object_instance: 'شیء شاخص',
  // property (3)
  boolean_trait: 'ویژگی بولی',
  invariant: 'ناوردا',
  regularity: 'همواری تحلیلی',
  // assertion (9)
  theorem: 'قضیه',
  proposition: 'گزاره',
  lemma: 'لم کمکی',
  corollary: 'نتیجه',
  criterion: 'معیار و آزمون',
  identity: 'اتحاد جبری',
  inequality: 'نامساوی',
  conjecture: 'حدس باز',
  refuted_conjecture: 'حدس ابطال‌شده',
  // proof (3)
  rigorous: 'برهان صوری',
  sketch: 'طرح کلی اثبات',
  computational: 'اثبات محاسباتی',
  // example (3)
  canonical: 'مثال مرجع',
  worked: 'مثال حل‌شده',
  boundary: 'مثال مرزی',
  // counterexample (3)
  hypothesis_drop: 'مثال نقض حذف فرض',
  converse_failure: 'مثال نقض عکس قضیه',
  pathology: 'شاهد پاتولوژیک',
  // problem (5)
  olympiad_proof: 'مسئله المپیاد',
  olympiad_short: 'کوتاه‌پاسخ المپیاد',
  university_proof: 'تمرین اثباتی دانشگاه',
  university_calc: 'تمرین محاسباتی دانشگاه',
  exam_mcq: 'تست ارشد و ۷۰۷',
  // solution (4)
  rigorous_full: 'حل تشریحی کامل',
  exam_shortcut: 'شگرد تستی سریع',
  heuristic_walkthrough: 'روایت کشف ایده',
  cas_assisted: 'حل محاسباتی کامپیوتری',
  // hint_ladder (2)
  socratic_polya: 'نردبان سقراطی پولیا',
  exam_cue: 'سرنخ تستی',
  // technique (4)
  proof_strategy: 'راهبرد کلان اثبات',
  olympiad_config: 'پیکربندی المپیادی',
  exam_trick: 'شگرد و نکته تستی',
  polya_heuristic: 'هیوریستیک حل مسئله',
  // problem_archetype (3)
  olympiad_family: 'خانواده مسائل المپیاد',
  exam_type: 'تیپ تست کنکور ارشد/۷۰۷',
  canonical_template: 'الگوی کانونی مدل‌سازی',
  // pitfall (3)
  logical_fallacy: 'مغالطه منطقی',
  domain_edge_trap: 'دام دامنه و مرز',
  misconception: 'کج‌فهمی مفهومی',
  // visual_lab (4)
  geogebra_2d: 'شبیه‌ساز دوبعدی',
  geogebra_3d: 'شبیه‌ساز سه‌بعدی',
  geogebra_cas: 'آزمایشگاه جبر نمادین',
  interactive_canvas: 'بوم تعاملی وب',
  // algorithm (4)
  exact_symbolic: 'الگوریتم دقیق و جبری',
  numerical_method: 'روش محاسبات عددی',
  combinatorial_graph: 'الگوریتم گسسته و گراف',
  optimization_randomized: 'بهینه‌سازی و روش‌های تصادفی',
  // code_kernel (3)
  symbolic_cas: 'کد محاسبات نمادین',
  numerical_experiment: 'اسکریپت آزمایش عددی',
  formal_snippet: 'قطعه کد اثبات صوری',
  // collection (4)
  chapter_handout: 'درسنامه / جزوه',
  problem_set: 'مجموعه تمرین',
  roadmap: 'نقشه راه (MOC)',
  index_hub: 'صفحه کانونی / نمایه',
  // comparison (2)
  concept_matrix: 'ماتریس مقایسه مفاهیم',
  method_tradeoff: 'مقایسه راهبردها و روش‌ها',
  // remark (3)
  intuition: 'جستار شهودی',
  historical: 'یادداشت تاریخی',
  open_commentary: 'حاشیه و یادداشت آزاد',
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
  rel_requires: { forward: 'پیش‌نیازهای آموزشی', reverse: 'پیش‌نیاز برای', reverseKey: 'prerequisite_for', icon: '🎓' },
  rel_proves: { forward: 'برهان برای', reverse: 'اثبات‌شده توسط', reverseKey: 'proved_by', icon: '💡' },
  rel_depends_sig: { forward: 'مفاهیم صورت قضیه', reverse: 'به‌کاررفته در صورت', reverseKey: 'used_in_sig_of', icon: '📐' },
  rel_depends_def: { forward: 'مفاهیم بدنه تعریف', reverse: 'به‌کاررفته در تعریف', reverseKey: 'used_in_def_of', icon: '📘' },
  rel_depends_proof: { forward: 'قضایا و احکام اثبات', reverse: 'به‌کاررفته در برهان', reverseKey: 'used_in_proof_of', icon: '🔎' },
  rel_solves: { forward: 'راه‌حل برای مسئله', reverse: 'حل‌شده توسط', reverseKey: 'solved_by', icon: '🧩' },
  rel_uses_technique: { forward: 'شگرد و تکنیک حل', reverse: 'به‌کاررفته در حل', reverseKey: 'used_in_solution', icon: '⚡' },
  rel_matches_archetype: { forward: 'تیپ مسئله', reverse: 'مسائل هم‌تیپ', reverseKey: 'has_archetype_member', icon: '🎯' },
  rel_isomorphic_variant: { forward: 'مسائل مشابه و هم‌ساختار', reverse: 'مسائل مشابه', reverseKey: 'isomorphic_variant', icon: '🔄' },
  rel_applies_theorem: { forward: 'قضایای کاربردی', reverse: 'کاربرد در حل مسائل', reverseKey: 'applied_in', icon: '📌' },
  rel_triggers_pitfall: { forward: 'دام‌ها و خطاهای مرتبط', reverse: 'دام در این مسئله/مفهوم', reverseKey: 'triggered_by', icon: '⚠️' },
  rel_illustrates: { forward: 'مثال برای', reverse: 'مثال‌های این مفهوم', reverseKey: 'illustrated_by', icon: '🔍' },
  rel_refutes: { forward: 'مثال نقض برای', reverse: 'ابطال‌شده با مثال نقض', reverseKey: 'refuted_by', icon: '💥' },
  rel_visualizes: { forward: 'شبیه‌ساز بصری', reverse: 'شبیه‌ساز برای این موضوع', reverseKey: 'visualized_by', icon: '🎛️' },
  rel_generalizes: { forward: 'تعمیم به حالت کلی‌تر', reverse: 'حالت خاص از', reverseKey: 'specializes', icon: '🌿' },
  rel_specializes: { forward: 'حالت خاص', reverse: 'تعمیم‌یافته به', reverseKey: 'generalizes', icon: '🌱' },
  rel_extends: { forward: 'گسترش ساختار', reverse: 'گسترش‌یافته توسط', reverseKey: 'extended_by', icon: '🧱' },
  rel_has_field: { forward: 'اجزا و عملگرها', reverse: 'جزئی از ساختار', reverseKey: 'field_of', icon: '⚙️' },
  rel_has_trait: { forward: 'ویژگی‌های صادق', reverse: 'صادق روی این اشیاء', reverseKey: 'trait_of', icon: '✨' },
  rel_implies: { forward: 'استلزام منطقی', reverse: 'نتیجه از', reverseKey: 'implied_by', icon: '➡️' },
  rel_contrasts_with: { forward: 'مقایسه و تمایز با', reverse: 'مقایسه با', reverseKey: 'contrasts_with', icon: '⚖️' },
  rel_scaffolds: { forward: 'نردبان سقراطی برای', reverse: 'راهنمایی سقراطی', reverseKey: 'scaffolded_by', icon: '🪜' },
  rel_imports_theory: { forward: 'واردکردن نظریه پایه', reverse: 'واردشده در نظریه', reverseKey: 'imported_by_theory', icon: '🌐' },
  rel_role_in: { forward: 'نقش در ساختار/گزاره', reverse: 'دارای نقش', reverseKey: 'has_role', icon: '🎭' },
  rel_dual_of: { forward: 'دوگان ساختاری با', reverse: 'دوگان ساختاری با', reverseKey: 'dual_of', icon: '🪞' },
  rel_correlates: { forward: 'همبستگی میان‌شاخه‌ای با', reverse: 'همبستگی میان‌شاخه‌ای با', reverseKey: 'correlates', icon: '🔗' },
  rel_is_part_of: { forward: 'بخشی از مجموعه/کتاب', reverse: 'شامل بخش‌های', reverseKey: 'has_part', icon: '📚' },
  rel_witness_for: { forward: 'گواه محاسباتی برای', reverse: 'گواه محاسباتی تأییدشده با', reverseKey: 'verified_by_kernel', icon: '💻' },
  rel_annotates: { forward: 'یادداشت تفسیری/نماد برای', reverse: 'حاشیه‌ها و تفاسیر', reverseKey: 'annotated_by', icon: '📝' },
  rel_derived_from: { forward: 'برگرفته و اقتباس‌شده از', reverse: 'منبع اقتباس برای', reverseKey: 'source_for', icon: '🌱' },
};
