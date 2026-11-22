import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
import { noteMetadata, buildKnowledge, noteHref } from '../../frontend/src/lib/markdown.mjs';
import {
  UMKO_KINDS,
  UMKO_KIND_SUBTYPES,
  UMKO_SUBTYPES,
  UMKO_LEVELS,
  UMKO_TRACKS,
  UMKO_STATUSES,
  UMKO_RELATIONS
} from '../../frontend/src/lib/umko.mjs';

const notePropertiesSource = readFileSync(
  new URL('../../frontend/src/components/NoteProperties.astro', import.meta.url),
  'utf8'
);
const semanticConnectionsSource = readFileSync(
  new URL('../../frontend/src/components/SemanticConnections.astro', import.meta.url),
  'utf8'
);
const notePageSource = readFileSync(
  new URL('../../frontend/src/pages/notes/[slug].astro', import.meta.url),
  'utf8'
);

function renderNoteProperties(note) {
  if (!note) return '';
  const kindInfo = UMKO_KINDS[note.kind] || { label: note.kind, color: 'var(--sl-color-accent)' };
  const subtypeLabel = UMKO_SUBTYPES[note.subtype] || note.subtype;
  const levelInfo = UMKO_LEVELS[note.level] || (note.level ? { label: note.level } : null);
  const statusInfo = UMKO_STATUSES[note.status] || { label: note.status || 'نسخهٔ رسمی', color: 'var(--muted)' };
  const tracks = Array.isArray(note.tracks) ? note.tracks : [];
  const tags = Array.isArray(note.tags) ? note.tags : [];

  return `
<div class="note-properties" data-uid="${note.uid || ''}">
  ${note.status === 'deprecated' ? `
    <div class="note-deprecated-alert" role="alert">
      <strong>⚠️ هشدار منسوخ‌شدن:</strong> این یادداشت طبق استاندارد پایگاه دانش منسوخ (Deprecated) شده است.
      ${note.superseded_by ? `
        <span> لطفاً به نسخهٔ جدید مراجعه کنید: <a href="/notes/${encodeURIComponent(note.superseded_by)}">${note.superseded_by}</a></span>
      ` : ''}
    </div>
  ` : ''}

  ${note.slogan_fa ? `
    <p class="note-slogan">
      <span class="slogan-quote-mark" aria-hidden="true">«</span>
      ${note.slogan_fa}
      <span class="slogan-quote-mark" aria-hidden="true">»</span>
    </p>
  ` : ''}

  <div class="note-meta-strip">
    ${note.kind ? `
      <span class="meta-badge meta-badge-kind" style="--badge-color: ${kindInfo.color}">
        ${subtypeLabel ? `${kindInfo.label} (${subtypeLabel})` : kindInfo.label}
      </span>
    ` : ''}

    ${levelInfo ? `
      <span class="meta-badge meta-badge-level" title="سطح آموزشی">
        🎓 ${levelInfo.label}
      </span>
    ` : ''}

    ${tracks.map((t) => `
      <a class="meta-badge meta-badge-track" href="/search?track=${encodeURIComponent(t)}" title="مسیر مطالعه">
        🎯 ${UMKO_TRACKS[t] || t}
      </a>
    `).join('')}

    ${note.msc_primary ? `
      <span class="meta-badge meta-badge-msc" title="کد رده‌بندی جهانی ریاضیات MSC2020">
        📐 MSC ${note.msc_primary}
      </span>
    ` : ''}

    ${note.status ? `
      <span class="meta-badge meta-badge-status" style="--status-color: ${statusInfo.color}">
        ● ${statusInfo.label}
      </span>
    ` : ''}

    ${note.uid ? `
      <span class="meta-badge meta-badge-uid" title="شناسه پایدار یکتا">
        #${note.uid}
      </span>
    ` : ''}

    ${note.title_en ? `
      <span class="meta-badge meta-badge-en" dir="ltr" title="International Mathematical Title">
        ${note.title_en}
      </span>
    ` : ''}

    ${tags.map((tag) => `
      <a class="tag" href="/search?tag=${encodeURIComponent(tag)}">#${tag}</a>
    `).join('')}
  </div>
</div>
  `.trim();
}

function renderSemanticConnections(note, garden) {
  if (!note) return '';
  const forward = Object.entries(note.resolvedRelations || {}).filter(([_, slugs]) => slugs.length > 0);
  const reverse = Object.entries(note.reverseRelations || {}).filter(([_, slugs]) => slugs.length > 0);
  const hasRelations = forward.length > 0 || reverse.length > 0;
  if (!hasRelations) return '';

  return `
<div class="semantic-connections-panel">
  <h3 class="semantic-header">شبکهٔ مفهومی و روابط ساختاری (UMKO v1.1)</h3>
  <div class="semantic-groups">
    ${forward.map(([relKey, slugs]) => {
      const info = UMKO_RELATIONS[relKey] || { forward: relKey, icon: '🔗' };
      const relNotes = slugs.map(s => garden.find(n => n.slug === s)).filter(Boolean);
      return `
        <div class="semantic-group">
          <h4 class="semantic-group-title">
            <span class="rel-icon" aria-hidden="true">${info.icon}</span>
            ${info.forward}
            <span class="rel-count">(${relNotes.length.toLocaleString('fa-IR')})</span>
          </h4>
          <ul class="semantic-link-list">
            ${relNotes.map(rn => rn ? `
              <li>
                <a class="semantic-link" href="${noteHref(rn.slug)}">
                  ${rn.title}
                  ${rn.kind ? `<span class="semantic-link-kind">[${rn.kind}]</span>` : ''}
                </a>
              </li>
            ` : '').join('')}
          </ul>
        </div>
      `;
    }).join('')}

    ${reverse.map(([relKey, slugs]) => {
      const info = UMKO_RELATIONS[relKey] || { reverse: relKey, icon: '🔗' };
      const relNotes = slugs.map(s => garden.find(n => n.slug === s)).filter(Boolean);
      return `
        <div class="semantic-group semantic-group-reverse">
          <h4 class="semantic-group-title">
            <span class="rel-icon" aria-hidden="true">${info.icon}</span>
            ${info.reverse}
            <span class="rel-count">(${relNotes.length.toLocaleString('fa-IR')})</span>
          </h4>
          <ul class="semantic-link-list">
            ${relNotes.map(rn => rn ? `
              <li>
                <a class="semantic-link" href="${noteHref(rn.slug)}">
                  ${rn.title}
                  ${rn.kind ? `<span class="semantic-link-kind">[${rn.kind}]</span>` : ''}
                </a>
              </li>
            ` : '').join('')}
          </ul>
        </div>
      `;
    }).join('')}
  </div>
</div>
  `.trim();
}

test('1. UMKO v1.1 Core Flat Fields Extraction in noteMetadata', async (t) => {
  await t.test('extracts all 24 canonical flat fields from comprehensive YAML frontmatter', () => {
    const rawNote = {
      slug: 'heine-borel-theorem-rn',
      title: 'قضیه هاینه-بورل در فضای اقلیدسی',
      current_content: `---
uid: "MK-04HE1N"
kind: "assertion"
subtype: "theorem"
status: "canonical"
schema_version: "1.1.0"
title_fa: "قضیه هاینه-بورل در فضای اقلیدسی"
title_en: "Heine-Borel Theorem in Euclidean Space"
slogan_fa: "زیرمجموعه‌ای از فضای اقلیدسی n-بعدی فشرده است اگر و تنها اگر بسته و کران‌دار باشد."
slogan_en: "A subset of finite-dimensional Euclidean space R^n is compact if and only if it is closed and bounded."
msc_primary: "54D30"
msc_secondary:
  - "26B05"
  - "46B50"
tracks:
  - "pure_university"
  - "konkur_arshad"
theory_scope: "[[euclidean-topology]]"
level: "L3_undergrad_core"
bloom_cognitive: "evaluate"
bloom_knowledge: "conceptual"
dok: 3
sources:
  - "rudin-pma#Thm2.41"
  - "munkres-top#Sec26"
authors:
  - "human:arsalan-dalvand"
  - "process:ai-agent/1.0"
created: "2026-11-21T10:30:00Z"
updated: "2026-11-21T11:15:00Z"
superseded_by: ""
tags:
  - توپولوژی
  - فشردگی
  - هاینه_بورل
aliases:
  - "قضیه بورل-لبگ"
  - "Borel-Lebesgue Theorem"
sidebar:
  order: 5
rel_requires:
  - "[[compact-space]]"
  - "[[euclidean-metric]]"
---
# قضیه هاینه-بورل
متن قضیه...`
    };

    const [extracted] = noteMetadata([rawNote]);

    assert.equal(extracted.uid, 'MK-04HE1N');
    assert.equal(extracted.kind, 'assertion');
    assert.equal(extracted.subtype, 'theorem');
    assert.equal(extracted.status, 'canonical');
    assert.equal(extracted.schema_version, '1.1.0');
    assert.equal(extracted.title_fa, 'قضیه هاینه-بورل در فضای اقلیدسی');
    assert.equal(extracted.title_en, 'Heine-Borel Theorem in Euclidean Space');
    assert.equal(extracted.slogan_fa, 'زیرمجموعه‌ای از فضای اقلیدسی n-بعدی فشرده است اگر و تنها اگر بسته و کران‌دار باشد.');
    assert.equal(extracted.slogan_en, 'A subset of finite-dimensional Euclidean space R^n is compact if and only if it is closed and bounded.');
    assert.equal(extracted.msc_primary, '54D30');
    assert.deepEqual(extracted.msc_secondary, ['26B05', '46B50']);
    assert.deepEqual(extracted.tracks, ['pure_university', 'konkur_arshad']);
    assert.equal(extracted.theory_scope, '[[euclidean-topology]]');
    assert.equal(extracted.level, 'L3_undergrad_core');
    assert.equal(extracted.bloom_cognitive, 'evaluate');
    assert.equal(extracted.bloom_knowledge, 'conceptual');
    assert.equal(extracted.dok, 3);
    assert.deepEqual(extracted.sources, ['rudin-pma#Thm2.41', 'munkres-top#Sec26']);
    assert.deepEqual(extracted.authors, ['human:arsalan-dalvand', 'process:ai-agent/1.0']);
    assert.equal(extracted.created, '2026-11-21T10:30:00Z');
    assert.equal(extracted.updated, '2026-11-21T11:15:00Z');
    assert.equal(extracted.superseded_by, '');
    assert.deepEqual(extracted.tags, ['توپولوژی', 'فشردگی', 'هاینه_بورل']);
    assert.deepEqual(extracted.aliases, ['قضیه بورل-لبگ', 'Borel-Lebesgue Theorem']);
    assert.equal(extracted.order, 5);
    assert.deepEqual(extracted.relations.rel_requires, ['compact-space', 'euclidean-metric']);
  });

  await t.test('applies robust fallback defaults when optional fields are omitted', () => {
    const minimalNote = {
      slug: 'minimal-note',
      title: 'یادداشت حداقلی',
      current_content: `# فقط متن ساده`
    };

    const [extracted] = noteMetadata([minimalNote]);

    assert.equal(extracted.uid, '');
    assert.equal(extracted.kind, '');
    assert.equal(extracted.subtype, '');
    assert.equal(extracted.status, 'canonical');
    assert.equal(extracted.schema_version, '');
    assert.equal(extracted.title_fa, 'یادداشت حداقلی');
    assert.equal(extracted.title_en, '');
    assert.equal(extracted.slogan_fa, '');
    assert.equal(extracted.slogan_en, '');
    assert.equal(extracted.msc_primary, '');
    assert.deepEqual(extracted.msc_secondary, []);
    assert.deepEqual(extracted.tracks, []);
    assert.equal(extracted.theory_scope, '');
    assert.equal(extracted.level, '');
    assert.equal(extracted.bloom_cognitive, '');
    assert.equal(extracted.bloom_knowledge, '');
    assert.equal(extracted.dok, undefined);
    assert.deepEqual(extracted.sources, []);
    assert.deepEqual(extracted.authors, []);
    assert.equal(extracted.created, '');
    assert.equal(extracted.updated, '');
    assert.equal(extracted.superseded_by, '');
    assert.deepEqual(extracted.tags, []);
    assert.deepEqual(extracted.aliases, []);
    assert.equal(extracted.order, 0);
    assert.deepEqual(extracted.relations, {});
  });

  await t.test('unwraps wikilinks and strips pipes from relation targets', () => {
    const noteWithLinkedRelations = {
      slug: 'sample-note',
      title: 'نمونه پیوند',
      current_content: `---
rel_requires:
  - "[[field-axioms|اصول میدان اسکالر]]"
  - "[[metric-space]]"
  - "topological-space.md"
rel_proves:
  - "[[pythagorean-thm|قضیه فیثاغورس]]"
---
`
    };

    const [extracted] = noteMetadata([noteWithLinkedRelations]);

    assert.deepEqual(extracted.relations.rel_requires, ['field-axioms', 'metric-space', 'topological-space.md']);
    assert.deepEqual(extracted.relations.rel_proves, ['pythagorean-thm']);
  });
});

test('2. 21 Kinds and 75 Subtypes Mapping and Taxonomy Validation', async (t) => {
  await t.test('UMKO_KINDS defines exactly 21 canonical kinds with complete metadata', () => {
    const expectedKinds = [
      'concept', 'property', 'assertion', 'proof', 'example', 'counterexample',
      'problem', 'solution', 'hint_ladder', 'technique', 'problem_archetype',
      'pitfall', 'visual_lab', 'algorithm', 'code_kernel', 'collection',
      'comparison', 'remark', 'axiom', 'theory', 'symbol'
    ];

    const actualKinds = Object.keys(UMKO_KINDS);
    assert.equal(actualKinds.length, 21, 'Must define exactly 21 UMKO kinds');
    for (const kind of expectedKinds) {
      assert.ok(UMKO_KINDS[kind], `Kind '${kind}' must be present in UMKO_KINDS`);
      assert.ok(typeof UMKO_KINDS[kind].label === 'string' && UMKO_KINDS[kind].label.length > 0);
      assert.ok(typeof UMKO_KINDS[kind].en === 'string' && UMKO_KINDS[kind].en.length > 0);
      assert.match(UMKO_KINDS[kind].color, /^#[0-9a-fA-F]{6}$/, `Kind '${kind}' must have a valid 6-char hex color`);
    }
  });

  await t.test('UMKO_KIND_SUBTYPES partitions exactly 75 distinct subtypes across the 21 kinds', () => {
    assert.equal(Object.keys(UMKO_KIND_SUBTYPES).length, 21, 'UMKO_KIND_SUBTYPES must cover all 21 kinds');

    const expectedKindDistribution = {
      theory: 3,
      axiom: 2,
      symbol: 4,
      concept: 4,
      property: 3,
      assertion: 9,
      proof: 3,
      example: 3,
      counterexample: 3,
      problem: 5,
      solution: 4,
      hint_ladder: 2,
      technique: 4,
      problem_archetype: 3,
      pitfall: 3,
      visual_lab: 4,
      algorithm: 4,
      code_kernel: 3,
      collection: 4,
      comparison: 2,
      remark: 3
    };

    let totalSubtypes = 0;
    const seenSubtypes = new Set();

    for (const [kind, expectedCount] of Object.entries(expectedKindDistribution)) {
      const subtypes = UMKO_KIND_SUBTYPES[kind];
      assert.ok(Array.isArray(subtypes), `Kind '${kind}' must have an array of subtypes`);
      assert.equal(
        subtypes.length,
        expectedCount,
        `Kind '${kind}' must have ${expectedCount} subtypes, found ${subtypes.length}`
      );

      for (const st of subtypes) {
        assert.ok(!seenSubtypes.has(st), `Subtype '${st}' must not appear in multiple kinds`);
        seenSubtypes.add(st);
        totalSubtypes++;
      }
    }

    assert.equal(totalSubtypes, 75, 'Taxonomy must have exactly 75 subtypes in total');
    assert.equal(seenSubtypes.size, 75);
  });

  await t.test('UMKO_SUBTYPES provides Persian display labels for all 75 subtypes', () => {
    const allTaxonomySubtypes = Object.values(UMKO_KIND_SUBTYPES).flat();
    assert.equal(allTaxonomySubtypes.length, 75);

    for (const st of allTaxonomySubtypes) {
      assert.ok(UMKO_SUBTYPES[st], `Subtype '${st}' must have an entry in UMKO_SUBTYPES`);
      assert.ok(typeof UMKO_SUBTYPES[st] === 'string' && UMKO_SUBTYPES[st].trim().length > 0);
    }
  });

  await t.test('taxonomies for levels (5), tracks (6), and statuses (6) are complete', () => {
    const expectedLevels = ['L1_intro', 'L2_calc_basic', 'L3_undergrad_core', 'L4_grad_advanced', 'L5_research'];
    assert.equal(Object.keys(UMKO_LEVELS).length, 5);
    for (const lvl of expectedLevels) {
      assert.ok(UMKO_LEVELS[lvl]?.label);
      assert.ok(UMKO_LEVELS[lvl]?.short);
    }

    const expectedTracks = ['pure_university', 'applied_eng', 'konkur_arshad', 'olympiad', 'cs_theory', 'recreational'];
    assert.equal(Object.keys(UMKO_TRACKS).length, 6);
    for (const trk of expectedTracks) {
      assert.ok(typeof UMKO_TRACKS[trk] === 'string');
    }

    const expectedStatuses = ['canonical', 'verified', 'reviewed', 'draft', 'seed', 'deprecated'];
    assert.equal(Object.keys(UMKO_STATUSES).length, 6);
    for (const st of expectedStatuses) {
      assert.ok(UMKO_STATUSES[st]?.label);
      assert.match(UMKO_STATUSES[st]?.color, /^#[0-9a-fA-F]{6}$/);
    }
  });
});

test('3. 29 Flat Graph Relations (rel_* prefix) Definition and Extraction', async (t) => {
  const all29Relations = [
    'rel_requires',
    'rel_proves',
    'rel_depends_sig',
    'rel_depends_def',
    'rel_depends_proof',
    'rel_solves',
    'rel_uses_technique',
    'rel_matches_archetype',
    'rel_isomorphic_variant',
    'rel_applies_theorem',
    'rel_triggers_pitfall',
    'rel_illustrates',
    'rel_refutes',
    'rel_visualizes',
    'rel_generalizes',
    'rel_specializes',
    'rel_extends',
    'rel_has_field',
    'rel_has_trait',
    'rel_implies',
    'rel_contrasts_with',
    'rel_scaffolds',
    'rel_imports_theory',
    'rel_role_in',
    'rel_dual_of',
    'rel_correlates',
    'rel_is_part_of',
    'rel_witness_for',
    'rel_annotates',
    'rel_derived_from'
  ];

  await t.test('UMKO_RELATIONS defines complete forward/reverse labels, icons, and reverseKeys', () => {
    for (const relKey of all29Relations) {
      const rel = UMKO_RELATIONS[relKey];
      assert.ok(rel, `Relation '${relKey}' must exist in UMKO_RELATIONS`);
      assert.ok(typeof rel.forward === 'string' && rel.forward.length > 0, `${relKey} must have forward label`);
      assert.ok(typeof rel.reverse === 'string' && rel.reverse.length > 0, `${relKey} must have reverse label`);
      assert.ok(typeof rel.reverseKey === 'string' && rel.reverseKey.length > 0, `${relKey} must have reverseKey`);
      assert.ok(typeof rel.icon === 'string' && rel.icon.length > 0, `${relKey} must have icon`);
    }
  });

  await t.test('noteMetadata extracts all 29 relations when present in YAML', () => {
    let yamlFrontmatter = '---\nuid: "MK-TEST29"\nkind: "concept"\n';
    for (const relKey of all29Relations) {
      yamlFrontmatter += `${relKey}:\n  - "[[target-${relKey.replace('rel_', '')}]]"\n`;
    }
    yamlFrontmatter += '---\n# نوت آزمایشی روابط ۲۹گانه\n';

    const [extracted] = noteMetadata([{ slug: 'test-29-relations', title: 'تست روابط', current_content: yamlFrontmatter }]);

    for (const relKey of all29Relations) {
      const targetSlug = `target-${relKey.replace('rel_', '')}`;
      assert.ok(extracted.relations[relKey], `relations must have ${relKey}`);
      assert.deepEqual(extracted.relations[relKey], [targetSlug]);
    }
  });
});

test('4. Bidirectional Knowledge Graph and Reverse Relation Synthesis', async (t) => {
  await t.test('buildKnowledge correctly synthesizes reverse relations and links across heterogeneous notes', async () => {
    const gardenNotes = [
      {
        slug: 'field-axioms',
        title: 'اصول میدان',
        current_content: `---
uid: "MK-01AX01"
kind: "axiom"
subtype: "foundational"
title_fa: "اصول میدان"
---
# اصول میدان`
      },
      {
        slug: 'vector-space',
        title: 'فضای برداری',
        current_content: `---
uid: "MK-04HE1N"
kind: "concept"
subtype: "structure"
title_fa: "فضای برداری"
rel_requires:
  - "[[field-axioms]]"
rel_has_field:
  - "[[vector-addition]]"
---
# فضای برداری`
      },
      {
        slug: 'vector-addition',
        title: 'عمل جمع برداری',
        current_content: `---
uid: "MK-01SY01"
kind: "symbol"
subtype: "operator"
title_fa: "عمل جمع برداری"
---
# جمع برداری`
      },
      {
        slug: 'pythagorean-theorem',
        title: 'قضیه فیثاغورس',
        current_content: `---
uid: "MK-03TH01"
kind: "assertion"
subtype: "theorem"
title_fa: "قضیه فیثاغورس"
---
# قضیه فیثاغورس`
      },
      {
        slug: 'pythagorean-proof',
        title: 'برهان هندسی فیثاغورس',
        current_content: `---
uid: "MK-03PR01"
kind: "proof"
subtype: "rigorous"
title_fa: "برهان هندسی فیثاغورس"
rel_proves:
  - "[[pythagorean-theorem]]"
rel_uses_technique:
  - "[[dissection-technique]]"
---
# برهان هندسی`
      },
      {
        slug: 'dissection-technique',
        title: 'تکنیک برش و بازآرایی',
        current_content: `---
uid: "MK-04TC01"
kind: "technique"
subtype: "proof_strategy"
title_fa: "تکنیک برش و بازآرایی"
---
# تکنیک برش`
      },
      {
        slug: 'imo-2024-p1',
        title: 'مسئله ۱ المپیاد جهانی ۲۰۲۴',
        current_content: `---
uid: "MK-04PB01"
kind: "problem"
subtype: "olympiad_proof"
title_fa: "مسئله ۱ المپیاد جهانی ۲۰۲۴"
rel_matches_archetype:
  - "[[vieta-jumping-archetype]]"
rel_triggers_pitfall:
  - "[[parity-trap]]"
---
# صورت مسئله ۱`
      },
      {
        slug: 'imo-2024-solution',
        title: 'حل تشریحی مسئله ۱ المپیاد ۲۰۲۴',
        current_content: `---
uid: "MK-04SO01"
kind: "solution"
subtype: "rigorous_full"
title_fa: "حل تشریحی مسئله ۱ المپیاد ۲۰۲۴"
rel_solves:
  - "[[imo-2024-p1]]"
rel_applies_theorem:
  - "[[pythagorean-theorem]]"
---
# حل تشریحی`
      },
      {
        slug: 'vieta-jumping-archetype',
        title: 'تیپ مسئله پرش ویتا',
        current_content: `---
uid: "MK-04AR01"
kind: "problem_archetype"
subtype: "olympiad_family"
title_fa: "تیپ مسئله پرش ویتا"
---
# پرش ویتا`
      },
      {
        slug: 'parity-trap',
        title: 'دام زوجیت در ریشه‌ها',
        current_content: `---
uid: "MK-04PF01"
kind: "pitfall"
subtype: "logical_fallacy"
title_fa: "دام زوجیت در ریشه‌ها"
---
# دام زوجیت`
      },
      {
        slug: 'cantor-set',
        title: 'مجموعه کانتور',
        current_content: `---
uid: "MK-02EX01"
kind: "example"
subtype: "canonical"
title_fa: "مجموعه کانتور"
rel_illustrates:
  - "[[uncountable-concept]]"
rel_refutes:
  - "[[naive-measure-conjecture]]"
rel_has_trait:
  - "[[compact-property]]"
---
# مجموعه کانتور`
      },
      {
        slug: 'uncountable-concept',
        title: 'مفهوم ناشمارایی',
        current_content: `---
uid: "MK-02CO01"
kind: "concept"
subtype: "type_concept"
title_fa: "مفهوم ناشمارایی"
---
# ناشمارایی`
      },
      {
        slug: 'naive-measure-conjecture',
        title: 'حدس خام اندازه صفر',
        current_content: `---
uid: "MK-03CJ01"
kind: "assertion"
subtype: "refuted_conjecture"
title_fa: "حدس خام اندازه صفر"
---
# حدس ابطال‌شده`
      },
      {
        slug: 'compact-property',
        title: 'ویژگی فشردگی',
        current_content: `---
uid: "MK-02PR01"
kind: "property"
subtype: "boolean_trait"
title_fa: "ویژگی فشردگی"
---
# ویژگی فشردگی`
      },
      {
        slug: 'stokes-theorem',
        title: 'قضیه کلی استوکس',
        current_content: `---
uid: "MK-03TH02"
kind: "assertion"
subtype: "theorem"
title_fa: "قضیه کلی استوکس"
rel_generalizes:
  - "[[greens-theorem]]"
---
# قضیه استوکس`
      },
      {
        slug: 'greens-theorem',
        title: 'قضیه گرین در صفحه',
        current_content: `---
uid: "MK-03TH03"
kind: "assertion"
subtype: "theorem"
title_fa: "قضیه گرین در صفحه"
---
# قضیه گرین`
      },
      {
        slug: 'geogebra-saddle-lab',
        title: 'آزمایشگاه زین‌اسبی',
        current_content: `---
uid: "MK-05VL01"
kind: "visual_lab"
subtype: "geogebra_3d"
title_fa: "آزمایشگاه زین‌اسبی"
rel_visualizes:
  - "[[saddle-surface]]"
---
# شبیه‌ساز زین‌اسبی`
      },
      {
        slug: 'saddle-surface',
        title: 'رویه هذلولوی زین‌اسبی',
        current_content: `---
uid: "MK-02CO02"
kind: "concept"
subtype: "object_instance"
title_fa: "رویه هذلولوی زین‌اسبی"
---
# رویه زین‌اسبی`
      }
    ];

    const garden = await buildKnowledge(gardenNotes);

    const vs = garden.find(n => n.slug === 'vector-space');
    const fa = garden.find(n => n.slug === 'field-axioms');
    const va = garden.find(n => n.slug === 'vector-addition');
    const pt = garden.find(n => n.slug === 'pythagorean-theorem');
    const pp = garden.find(n => n.slug === 'pythagorean-proof');
    const dt = garden.find(n => n.slug === 'dissection-technique');
    const imoPb = garden.find(n => n.slug === 'imo-2024-p1');
    const imoSo = garden.find(n => n.slug === 'imo-2024-solution');
    const vieta = garden.find(n => n.slug === 'vieta-jumping-archetype');
    const ptrap = garden.find(n => n.slug === 'parity-trap');
    const cantor = garden.find(n => n.slug === 'cantor-set');
    const uncnt = garden.find(n => n.slug === 'uncountable-concept');
    const nmc = garden.find(n => n.slug === 'naive-measure-conjecture');
    const cp = garden.find(n => n.slug === 'compact-property');
    const stokes = garden.find(n => n.slug === 'stokes-theorem');
    const green = garden.find(n => n.slug === 'greens-theorem');
    const geo = garden.find(n => n.slug === 'geogebra-saddle-lab');
    const saddle = garden.find(n => n.slug === 'saddle-surface');

    // Forward resolution
    assert.deepEqual(vs.resolvedRelations.rel_requires, ['field-axioms']);
    assert.deepEqual(vs.resolvedRelations.rel_has_field, ['vector-addition']);
    assert.deepEqual(pp.resolvedRelations.rel_proves, ['pythagorean-theorem']);
    assert.deepEqual(pp.resolvedRelations.rel_uses_technique, ['dissection-technique']);
    assert.deepEqual(imoSo.resolvedRelations.rel_solves, ['imo-2024-p1']);
    assert.deepEqual(imoSo.resolvedRelations.rel_applies_theorem, ['pythagorean-theorem']);
    assert.deepEqual(imoPb.resolvedRelations.rel_matches_archetype, ['vieta-jumping-archetype']);
    assert.deepEqual(imoPb.resolvedRelations.rel_triggers_pitfall, ['parity-trap']);
    assert.deepEqual(cantor.resolvedRelations.rel_illustrates, ['uncountable-concept']);
    assert.deepEqual(cantor.resolvedRelations.rel_refutes, ['naive-measure-conjecture']);
    assert.deepEqual(cantor.resolvedRelations.rel_has_trait, ['compact-property']);
    assert.deepEqual(stokes.resolvedRelations.rel_generalizes, ['greens-theorem']);
    assert.deepEqual(geo.resolvedRelations.rel_visualizes, ['saddle-surface']);

    // Reverse synthesis via relKey
    assert.deepEqual(fa.reverseRelations.rel_requires, ['vector-space']);
    assert.deepEqual(va.reverseRelations.rel_has_field, ['vector-space']);
    assert.deepEqual(pt.reverseRelations.rel_proves, ['pythagorean-proof']);
    assert.deepEqual(pt.reverseRelations.rel_applies_theorem, ['imo-2024-solution']);
    assert.deepEqual(dt.reverseRelations.rel_uses_technique, ['pythagorean-proof']);
    assert.deepEqual(imoPb.reverseRelations.rel_solves, ['imo-2024-solution']);
    assert.deepEqual(vieta.reverseRelations.rel_matches_archetype, ['imo-2024-p1']);
    assert.deepEqual(ptrap.reverseRelations.rel_triggers_pitfall, ['imo-2024-p1']);
    assert.deepEqual(uncnt.reverseRelations.rel_illustrates, ['cantor-set']);
    assert.deepEqual(nmc.reverseRelations.rel_refutes, ['cantor-set']);
    assert.deepEqual(cp.reverseRelations.rel_has_trait, ['cantor-set']);
    assert.deepEqual(green.reverseRelations.rel_generalizes, ['stokes-theorem']);
    assert.deepEqual(saddle.reverseRelations.rel_visualizes, ['geogebra-saddle-lab']);

    // Canonical reverseKey access
    assert.deepEqual(fa.reverseRelations.prerequisite_for, ['vector-space']);
    assert.deepEqual(va.reverseRelations.field_of, ['vector-space']);
    assert.deepEqual(pt.reverseRelations.proved_by, ['pythagorean-proof']);
    assert.deepEqual(pt.reverseRelations.applied_in, ['imo-2024-solution']);
    assert.deepEqual(dt.reverseRelations.used_in_solution, ['pythagorean-proof']);
    assert.deepEqual(imoPb.reverseRelations.solved_by, ['imo-2024-solution']);
    assert.deepEqual(vieta.reverseRelations.has_archetype_member, ['imo-2024-p1']);
    assert.deepEqual(ptrap.reverseRelations.triggered_by, ['imo-2024-p1']);
    assert.deepEqual(uncnt.reverseRelations.illustrated_by, ['cantor-set']);
    assert.deepEqual(nmc.reverseRelations.refuted_by, ['cantor-set']);
    assert.deepEqual(cp.reverseRelations.trait_of, ['cantor-set']);
    assert.deepEqual(green.reverseRelations.specializes, ['stokes-theorem']);
    assert.deepEqual(saddle.reverseRelations.visualized_by, ['geogebra-saddle-lab']);

    // Graph outgoing and backlinks consistency
    assert.ok(vs.outgoing.includes('field-axioms'));
    assert.ok(fa.backlinks.includes('vector-space'));
    assert.ok(pp.outgoing.includes('pythagorean-theorem'));
    assert.ok(pt.backlinks.includes('pythagorean-proof'));
  });

  await t.test('resolves aliased note names and ignores non-existent targets safely', async () => {
    const aliasedNotes = [
      {
        slug: 'cauchy-schwarz',
        title: 'نامساوی کوشی-شوارتز',
        current_content: `---
aliases:
  - "Cauchy-Schwarz Inequality"
  - "نامساوی شوارتز"
---
# کوشی شوارتز`
      },
      {
        slug: 'holder-inequality',
        title: 'نامساوی هلدر',
        current_content: `---
rel_generalizes:
  - "[[Cauchy-Schwarz Inequality]]"
rel_requires:
  - "[[non-existent-prerequisite-xyz]]"
---
# هلدر`
      }
    ];

    const garden = await buildKnowledge(aliasedNotes);
    const holder = garden.find(n => n.slug === 'holder-inequality');
    const cs = garden.find(n => n.slug === 'cauchy-schwarz');

    assert.deepEqual(holder.resolvedRelations.rel_generalizes, ['cauchy-schwarz']);
    assert.equal(holder.resolvedRelations.rel_requires, undefined);
    assert.deepEqual(cs.reverseRelations.rel_generalizes, ['holder-inequality']);
  });
});

test('5. Deprecated Note Lifecycle and Superseded-by Tombstone Link', async (t) => {
  const notes = [
    {
      slug: 'old-matrix-inversion',
      title: 'معکوس‌سازی ماتریس به روش قدیمی',
      current_content: `---
uid: "MK-09DP01"
kind: "technique"
subtype: "exam_trick"
status: "deprecated"
superseded_by: "[[gaussian-elimination-pivot]]"
title_fa: "معکوس‌سازی ماتریس به روش قدیمی"
slogan_fa: "روش قدیمی و غیربهینه با پیچیدگی محاسباتی بالا."
---
# روش قدیمی`
    },
    {
      slug: 'gaussian-elimination-pivot',
      title: 'حذف گاوسی با محورگیری ستونی',
      current_content: `---
uid: "MK-09AL01"
kind: "algorithm"
subtype: "exact_symbolic"
status: "canonical"
title_fa: "حذف گاوسی با محورگیری ستونی"
---
# حذف گاوسی`
    }
  ];

  const garden = await buildKnowledge(notes);
  const oldNote = garden.find(n => n.slug === 'old-matrix-inversion');
  const newNote = garden.find(n => n.slug === 'gaussian-elimination-pivot');

  await t.test('extracts status: deprecated and clean superseded_by slug', () => {
    assert.equal(oldNote.status, 'deprecated');
    assert.equal(oldNote.superseded_by, 'gaussian-elimination-pivot');
    assert.equal(newNote.status, 'canonical');
  });

  await t.test('renders accessible deprecation banner with warning role and tombstone link', () => {
    const markup = renderNoteProperties(oldNote);
    const dom = new JSDOM(markup);
    const doc = dom.window.document;

    const alertBox = doc.querySelector('.note-deprecated-alert');
    assert.ok(alertBox, 'Must render .note-deprecated-alert element');
    assert.equal(alertBox.getAttribute('role'), 'alert');
    assert.match(alertBox.textContent, /⚠️ هشدار منسوخ‌شدن:/);
    assert.match(alertBox.textContent, /منسوخ \(Deprecated\) شده است/);

    const tombstoneLink = alertBox.querySelector('a');
    assert.ok(tombstoneLink, 'Must render tombstone link inside deprecation alert');
    assert.equal(tombstoneLink.getAttribute('href'), '/notes/gaussian-elimination-pivot');
    assert.equal(tombstoneLink.textContent.trim(), 'gaussian-elimination-pivot');

    const statusBadge = doc.querySelector('.meta-badge-status');
    assert.ok(statusBadge, 'Must render status badge');
    assert.match(statusBadge.textContent, /منسوخ‌شده/);
    assert.match(statusBadge.getAttribute('style') || '', /--status-color:\s*#dc2626/);
  });

  await t.test('does not render deprecation alert for canonical notes', () => {
    const markup = renderNoteProperties(newNote);
    const dom = new JSDOM(markup);
    assert.equal(dom.window.document.querySelector('.note-deprecated-alert'), null);
  });
});

test('6. NoteProperties Component Markup Generation', async (t) => {
  const fullNote = {
    slug: 'cauchy-criterion',
    title: 'معیار کوشی برای همگرایی',
    uid: 'MK-03CR01',
    kind: 'assertion',
    subtype: 'criterion',
    status: 'verified',
    title_en: 'Cauchy Convergence Criterion',
    slogan_fa: 'دنباله‌ای از اعداد حقیقی همگراست اگر و تنها اگر دنباله کوشی باشد.',
    msc_primary: '26A03',
    tracks: ['pure_university', 'applied_eng'],
    level: 'L3_undergrad_core',
    tags: ['آنالیز_حقیقی', 'همگرایی', 'کوشی']
  };

  await t.test('renders complete metadata strip, badges, and slogan quotation marks', () => {
    const html = renderNoteProperties(fullNote);
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Slogan with quote marks
    const slogan = doc.querySelector('.note-slogan');
    assert.ok(slogan, 'Must render .note-slogan');
    assert.match(slogan.textContent, /دنباله‌ای از اعداد حقیقی همگراست/);
    const quoteMarks = slogan.querySelectorAll('.slogan-quote-mark');
    assert.equal(quoteMarks.length, 2);
    assert.equal(quoteMarks[0].textContent, '«');
    assert.equal(quoteMarks[1].textContent, '»');
    assert.equal(quoteMarks[0].getAttribute('aria-hidden'), 'true');

    // Kind & Subtype badge
    const kindBadge = doc.querySelector('.meta-badge-kind');
    assert.ok(kindBadge, 'Must render .meta-badge-kind');
    assert.equal(kindBadge.textContent.trim(), 'گزاره و قضیه (معیار و آزمون)');
    assert.match(kindBadge.getAttribute('style'), /--badge-color:\s*#1d4ed8/);

    // Level badge
    const levelBadge = doc.querySelector('.meta-badge-level');
    assert.ok(levelBadge, 'Must render .meta-badge-level');
    assert.match(levelBadge.textContent, /🎓 هسته کارشناسی/);

    // Tracks badges
    const trackBadges = doc.querySelectorAll('.meta-badge-track');
    assert.equal(trackBadges.length, 2);
    assert.equal(trackBadges[0].getAttribute('href'), '/search?track=pure_university');
    assert.match(trackBadges[0].textContent, /🎯 دانشگاهی محض/);
    assert.equal(trackBadges[1].getAttribute('href'), '/search?track=applied_eng');
    assert.match(trackBadges[1].textContent, /🎯 کاربردی و مهندسی/);

    // MSC badge
    const mscBadge = doc.querySelector('.meta-badge-msc');
    assert.ok(mscBadge, 'Must render .meta-badge-msc');
    assert.match(mscBadge.textContent, /📐 MSC 26A03/);

    // Status badge
    const statusBadge = doc.querySelector('.meta-badge-status');
    assert.ok(statusBadge, 'Must render .meta-badge-status');
    assert.match(statusBadge.textContent, /● تأیید علمی/);

    // UID badge
    const uidBadge = doc.querySelector('.meta-badge-uid');
    assert.ok(uidBadge, 'Must render .meta-badge-uid');
    assert.match(uidBadge.textContent, /#MK-03CR01/);

    // English title badge
    const enBadge = doc.querySelector('.meta-badge-en');
    assert.ok(enBadge, 'Must render .meta-badge-en');
    assert.equal(enBadge.getAttribute('dir'), 'ltr');
    assert.equal(enBadge.textContent.trim(), 'Cauchy Convergence Criterion');

    // Tag pills
    const tagLinks = doc.querySelectorAll('.tag');
    assert.equal(tagLinks.length, 3);
    assert.equal(tagLinks[0].textContent.trim(), '#آنالیز_حقیقی');
    assert.equal(tagLinks[0].getAttribute('href'), '/search?tag=%D8%A2%D9%86%D8%A7%D9%84%DB%8C%D8%B2_%D8%AD%D9%82%DB%8C%D9%82%DB%8C');
  });

  await t.test('gracefully omits missing badges without rendering empty elements', () => {
    const [minimal] = noteMetadata([{ slug: 'simple-def', title: 'تعریف ساده', current_content: '' }]);
    const html = renderNoteProperties(minimal);
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    assert.equal(doc.querySelector('.note-slogan'), null);
    assert.equal(doc.querySelector('.meta-badge-kind'), null);
    assert.equal(doc.querySelector('.meta-badge-level'), null);
    assert.equal(doc.querySelector('.meta-badge-track'), null);
    assert.equal(doc.querySelector('.meta-badge-msc'), null);
    assert.equal(doc.querySelector('.meta-badge-uid'), null);
    assert.equal(doc.querySelector('.meta-badge-en'), null);
    assert.equal(doc.querySelectorAll('.tag').length, 0);

    const statusBadge = doc.querySelector('.meta-badge-status');
    assert.ok(statusBadge);
    assert.match(statusBadge.textContent, /نسخهٔ? رسمی/);
  });

  await t.test('verifies NoteProperties.astro template contract and design system tokens', () => {
    assert.match(notePropertiesSource, /data-uid=\{note\.uid\}/);
    assert.match(notePropertiesSource, /class="note-deprecated-alert"[^>]*role="alert"/);
    assert.match(notePropertiesSource, /class="note-slogan"/);
    assert.match(notePropertiesSource, /class="slogan-quote-mark"[^>]*aria-hidden="true"/);
    assert.match(notePropertiesSource, /class="meta-badge meta-badge-kind"/);
    assert.match(notePropertiesSource, /class="meta-badge meta-badge-level"/);
    assert.match(notePropertiesSource, /class="meta-badge meta-badge-track"/);
    assert.match(notePropertiesSource, /class="meta-badge meta-badge-msc"/);
    assert.match(notePropertiesSource, /class="meta-badge meta-badge-status"/);
    assert.match(notePropertiesSource, /class="meta-badge meta-badge-uid"/);
    assert.match(notePropertiesSource, /class="meta-badge meta-badge-en"/);
    assert.match(notePropertiesSource, /UMKO_KINDS/);
    assert.match(notePropertiesSource, /UMKO_SUBTYPES/);
    assert.match(notePropertiesSource, /UMKO_LEVELS/);
    assert.match(notePropertiesSource, /UMKO_TRACKS/);
    assert.match(notePropertiesSource, /UMKO_STATUSES/);
  });
});

test('7. SemanticConnections Component Markup Generation', async (t) => {
  const garden = [
    {
      slug: 'vector-space',
      title: 'فضای برداری',
      kind: 'concept',
      resolvedRelations: {
        rel_requires: ['field-axioms'],
        rel_extends: ['abelian-group']
      },
      reverseRelations: {
        rel_proves: ['dimension-theorem'],
        rel_applies_theorem: ['spectral-decomposition']
      }
    },
    {
      slug: 'field-axioms',
      title: 'اصول میدان',
      kind: 'axiom'
    },
    {
      slug: 'abelian-group',
      title: 'گروه آبلی',
      kind: 'concept'
    },
    {
      slug: 'dimension-theorem',
      title: 'قضیه ابعاد',
      kind: 'assertion'
    },
    {
      slug: 'spectral-decomposition',
      title: 'تجزیه طیفی عملگرها',
      kind: 'technique'
    }
  ];

  const currentNote = garden[0];

  await t.test('renders forward and reverse semantic relationship groups with icons and Persian counters', () => {
    const html = renderSemanticConnections(currentNote, garden);
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const panel = doc.querySelector('.semantic-connections-panel');
    assert.ok(panel, 'Must render .semantic-connections-panel');

    const header = panel.querySelector('.semantic-header');
    assert.equal(header.textContent.trim(), 'شبکهٔ مفهومی و روابط ساختاری (UMKO v1.1)');

    const groups = panel.querySelectorAll('.semantic-group');
    assert.equal(groups.length, 4, 'Must render 2 forward and 2 reverse relation groups');

    // Forward group 1: rel_requires
    const reqGroup = groups[0];
    const reqTitle = reqGroup.querySelector('.semantic-group-title');
    assert.match(reqTitle.textContent, /پیش‌نیازهای آموزشی/);
    assert.match(reqTitle.textContent, /\(۱\)/);
    assert.equal(reqGroup.querySelector('.rel-icon').textContent, '🎓');
    const reqLink = reqGroup.querySelector('.semantic-link');
    assert.equal(reqLink.getAttribute('href'), '/notes/field-axioms');
    assert.match(reqLink.textContent, /اصول میدان/);
    assert.match(reqLink.querySelector('.semantic-link-kind').textContent, /\[axiom\]/);

    // Forward group 2: rel_extends
    const extGroup = groups[1];
    assert.match(extGroup.querySelector('.semantic-group-title').textContent, /گسترش ساختار/);
    assert.equal(extGroup.querySelector('.rel-icon').textContent, '🧱');
    assert.equal(extGroup.querySelector('.semantic-link').getAttribute('href'), '/notes/abelian-group');

    // Reverse groups have class .semantic-group-reverse
    const revGroup1 = groups[2];
    assert.ok(revGroup1.classList.contains('semantic-group-reverse'));
    assert.match(revGroup1.querySelector('.semantic-group-title').textContent, /اثبات‌شده توسط/);
    assert.equal(revGroup1.querySelector('.rel-icon').textContent, '💡');
    assert.equal(revGroup1.querySelector('.semantic-link').getAttribute('href'), '/notes/dimension-theorem');

    const revGroup2 = groups[3];
    assert.ok(revGroup2.classList.contains('semantic-group-reverse'));
    assert.match(revGroup2.querySelector('.semantic-group-title').textContent, /کاربرد در حل مسائل/);
    assert.equal(revGroup2.querySelector('.rel-icon').textContent, '📌');
    assert.equal(revGroup2.querySelector('.semantic-link').getAttribute('href'), '/notes/spectral-decomposition');
  });

  await t.test('returns empty string when note has no relationships', () => {
    const isolatedNote = {
      slug: 'isolated-note',
      title: 'نوت تنها',
      resolvedRelations: {},
      reverseRelations: {}
    };

    const html = renderSemanticConnections(isolatedNote, garden);
    assert.equal(html, '');
  });

  await t.test('verifies SemanticConnections.astro and page template integration', () => {
    assert.match(semanticConnectionsSource, /class="semantic-connections-panel"/);
    assert.match(semanticConnectionsSource, /class="semantic-header"/);
    assert.match(semanticConnectionsSource, /شبکهٔ مفهومی و روابط ساختاری \(UMKO v1\.1\)/);
    assert.match(semanticConnectionsSource, /class="semantic-groups"/);
    assert.match(semanticConnectionsSource, /class="semantic-group"/);
    assert.match(semanticConnectionsSource, /class="semantic-group semantic-group-reverse"/);
    assert.match(semanticConnectionsSource, /class="semantic-group-title"/);
    assert.match(semanticConnectionsSource, /class="rel-icon"/);
    assert.match(semanticConnectionsSource, /class="rel-count"/);
    assert.match(semanticConnectionsSource, /class="semantic-link-list"/);
    assert.match(semanticConnectionsSource, /class="semantic-link"/);
    assert.match(semanticConnectionsSource, /class="semantic-link-kind"/);
    assert.match(semanticConnectionsSource, /UMKO_RELATIONS/);

    // Verify notes/[slug].astro mounts both NoteProperties and SemanticConnections
    assert.match(notePageSource, /import NoteProperties from '\.\.\/\.\.\/components\/NoteProperties\.astro'/);
    assert.match(notePageSource, /import SemanticConnections from '\.\.\/\.\.\/components\/SemanticConnections\.astro'/);
    assert.match(notePageSource, /<NoteProperties note=\{current\} \/>/);
    assert.match(notePageSource, /<SemanticConnections note=\{current\} garden=\{garden\} \/>/);
  });
});
