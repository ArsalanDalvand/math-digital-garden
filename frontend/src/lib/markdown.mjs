import { parseExcalidraw } from './excalidraw.mjs';
import { parseFrontmatter, rehypeHeadingIds } from '@astrojs/markdown-remark';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { sanitizeUri } from 'micromark-util-sanitize-uri';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkCallout from '@r4ai/remark-callout';
import remarkWikiLink from 'remark-wiki-link';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { LRUCache } from 'lru-cache';
import { parseGeoGebra, resolveVaultImage } from './obsidian-plugins.mjs';
import { findAndReplace } from 'mdast-util-find-and-replace';
import rehypeParse from 'rehype-parse';
import { getVaultAssets } from './vault-assets.mjs';
import { UMKO_RELATIONS } from './umko.mjs';
import { sanitizeRawHtml } from './html-sanitize.mjs';

export const RENDERER_VERSION = 'v3-table-wikilink-cache';

/**
 * @typedef {{
 *   slug: string;
 *   title: string;
 *   current_content: string;
 *   current_hash?: string;
 *   book_slug?: string;
 *   chapter_slug?: string;
 *   relative_path?: string;
 * }} Note
 */

/**
 * @typedef {Note & {
 *   uid: string;
 *   kind: string;
 *   subtype: string;
 *   status: string;
 *   schema_version: string;
 *   title_fa: string;
 *   title_en: string;
 *   slogan_fa: string;
 *   slogan_en: string;
 *   msc_primary: string;
 *   msc_secondary: string[];
 *   tracks: string[];
 *   theory_scope: string;
 *   level: string;
 *   bloom_cognitive: string;
 *   bloom_knowledge: string;
 *   dok: number | undefined;
 *   sources: string[];
 *   authors: string[];
 *   created: string;
 *   updated: string;
 *   superseded_by: string;
 *   tags: string[];
 *   aliases: string[];
 *   order: number;
 *   relations: Record<string, string[]>;
 *   resolvedRelations: Record<string, string[]>;
 *   reverseRelations: Record<string, string[]>;
 *   outgoing: string[];
 *   backlinks: string[];
 * }} IndexedNote
 */

/**
 * @typedef {IndexedNote & {
 *   html: string;
 *   previewHtml: string;
 *   referencePreviews: Record<string, string>;
 *   blocks: string[];
 *   headings: import('astro').MarkdownHeading[];
 * }} RenderedNote
 */

/**
 * @typedef {{
 *   notes: IndexedNote[];
 *   bySlug: Map<string, IndexedNote>;
 *   names: Map<string, string[]>;
 *   namesFingerprint: string;
 *   version: string;
 *   headings: Map<string, import('astro').MarkdownHeading[]>;
 *   blocks: Map<string, string[]>;
 *   rawLinksBySlug: Map<string, Array<{ cleanTarget: string; anchor: string; isEmbed: boolean }>>;
 * }} KnowledgeIndex
 */

/** @param {string} value */
function fastHash(value) {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** @param {Note} note */
function noteHash(note) {
  return typeof note.current_hash === 'string' && note.current_hash.length > 0
    ? note.current_hash
    : fastHash(note.current_content || '');
}

/** @param {string} content */
function stripObsidianComments(content) {
  const parts = content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part.replace(/%%[\s\S]*?%%/g, '');
  }).join('');
}

const GFM_TABLE_DELIM_RE = /^\s*(?:>\s*)?\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{0,}:?\s*$/;

/**
 * Escape unescaped `|` inside `[[target|alias]]` wikilinks appearing inside GFM table
 * blocks so `remark-gfm` does not split the cell before `remark-wiki-link` parses them.
 * Raw Markdown in storage/editor stays untouched; only render-time text is adapted.
 * @param {string} content
 * @returns {string}
 */
export function escapePipesInTableWikilinks(content) {
  if (!content || !content.includes('[[')) return content;
  const parts = content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1 || !part.includes('[[')) return part;
      return part
        .split(/(\r?\n\s*\r?\n)/)
        .map((block, bIdx) => {
          if (bIdx % 2 === 1 || !block.includes('[[')) return block;
          const lines = block.split('\n');
          if (!lines.some((line) => GFM_TABLE_DELIM_RE.test(line))) return block;
          return lines
            .map((line) => {
              if (!line.includes('[[') || !line.includes('|')) return line;
              return line.replace(/(!?\[\[[^\]\n]+\]\])/g, (wiki) =>
                wiki.replace(/(?<!\\)\|/g, '\\|')
              );
            })
            .join('\n');
        })
        .join('');
    })
    .join('');
}

const wikiParser = unified().use(remarkParse).use(remarkWikiLink, { aliasDivider: '|' });
const htmlParser = unified().use(rehypeParse, { fragment: true });
const htmlStringifier = unified().use(rehypeStringify, { allowDangerousHtml: true });

/** @param {unknown} value */
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
/** @param {string} value */
const normalize = (value) => value.trim().normalize('NFC').toLocaleLowerCase('fa');
/** @param {string} slug */
export const noteHref = (slug) => `/notes/${encodeURIComponent(slug)}`;

/** @param {Note} note */
function extractNotePaths(note) {
  if (!note.relative_path) return [];
  const base = note.relative_path.split('/').pop() ?? '';
  return [
    note.relative_path.replace(/\.md$/, ''),
    note.relative_path.replace(/^[^/]+\//, '').replace(/\.md$/, ''),
    base.replace(/\.md$/, ''),
  ].filter(Boolean);
}

/** @param {string} cleanTarget @param {Map<string,string[]>} names @param {Map<string, Note> | Note[]} metadata */
function resolveTargetCandidates(cleanTarget, names, metadata) {
  const key = normalize(cleanTarget.replace(/\.excalidraw\.md$/, '.excalidraw'));
  let candidates = names.get(key) ?? [];
  if (!candidates.length && cleanTarget.includes('/')) {
    const stem = cleanTarget.split('/').pop()?.trim() ?? '';
    candidates = names.get(normalize(stem.replace(/\.excalidraw\.md$/, '.excalidraw'))) ?? [];
  }
  if (candidates.length > 1 && cleanTarget.includes('/')) {
    const normalizedTarget = normalize(cleanTarget);
    const exact = candidates.filter((slug) => {
      const n = metadata instanceof Map ? metadata.get(slug) : metadata.find((m) => m.slug === slug);
      return n && normalize(n.relative_path || '').includes(normalizedTarget);
    });
    if (exact.length === 1) candidates = exact;
  }
  return candidates;
}

/** @param {string} cleanTarget */
function isMediaEmbed(cleanTarget) {
  return (
    cleanTarget.endsWith('.pdf') ||
    /\.(mp3|wav|ogg|m4a)$/i.test(cleanTarget) ||
    /\.(mp4|webm|ogv)$/i.test(cleanTarget) ||
    cleanTarget.endsWith('.canvas') ||
    Boolean(resolveVaultImage(cleanTarget, getVaultAssets()))
  );
}

/** @param {string} raw */
function extractRawWikiLinks(raw) {
  const body = stripObsidianComments(parseFrontmatter(raw).content);
  const parts = body.split(
    /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|\$\$[\s\S]*?\$\$|(?<!\\)\$[^\n$]+?(?<!\\)\$)/g
  );
  /** @type {Array<{ cleanTarget: string; anchor: string; isEmbed: boolean }>} */
  const links = [];
  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts[i];
    if (!chunk) continue;
    const regex = /(!?)\[\[([^\]\n]+)\]\]/g;
    /** @type {RegExpExecArray | null} */
    let match;
    while ((match = regex.exec(chunk)) !== null) {
      const isEmbed = match[1] === '!';
      const beforePipe = match[2].split('|')[0] ?? '';
      const hashIdx = beforePipe.indexOf('#');
      const targetPart = hashIdx >= 0 ? beforePipe.slice(0, hashIdx) : beforePipe;
      const rawAnchor = hashIdx >= 0 ? beforePipe.slice(hashIdx + 1) : '';
      const anchor = rawAnchor ? rawAnchor.replace(/[\s\\]+$/, '').trim() : '';
      const cleanTarget = targetPart.replace(/[\s\\\/]+$/, '').trim().replace(/\.md$/, '');
      if (!cleanTarget) continue;
      if (isEmbed && isMediaEmbed(cleanTarget)) continue;
      links.push({ cleanTarget, anchor, isEmbed });
    }
  }
  return links;
}

/** @param {Note} note @returns {IndexedNote} */
function parseIndexedMeta(note) {
  const { frontmatter } = parseFrontmatter(note.current_content);
  /** @type {Record<string, string[]>} */
  const relations = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (k.startsWith('rel_') && Array.isArray(v)) {
      relations[k] = v.map(String).map((s) => s.replace(/^\[\[(.*)\]\]$/, '$1').split('|')[0].trim()).filter(Boolean);
    }
  }
  return {
    ...note,
    uid: typeof frontmatter.uid === 'string' ? frontmatter.uid : '',
    kind: typeof frontmatter.kind === 'string' ? frontmatter.kind : '',
    subtype: typeof frontmatter.subtype === 'string' ? frontmatter.subtype : '',
    status: typeof frontmatter.status === 'string' ? frontmatter.status : 'canonical',
    schema_version: typeof frontmatter.schema_version === 'string' ? frontmatter.schema_version : '',
    title_fa: typeof frontmatter.title_fa === 'string' ? frontmatter.title_fa : note.title,
    title_en: typeof frontmatter.title_en === 'string' ? frontmatter.title_en : '',
    slogan_fa: typeof frontmatter.slogan_fa === 'string' ? frontmatter.slogan_fa : '',
    slogan_en: typeof frontmatter.slogan_en === 'string' ? frontmatter.slogan_en : '',
    msc_primary: typeof frontmatter.msc_primary === 'string' ? frontmatter.msc_primary : '',
    msc_secondary: strings(frontmatter.msc_secondary),
    tracks: strings(frontmatter.tracks),
    theory_scope: typeof frontmatter.theory_scope === 'string' ? frontmatter.theory_scope : '',
    level: typeof frontmatter.level === 'string' ? frontmatter.level : '',
    bloom_cognitive: typeof frontmatter.bloom_cognitive === 'string' ? frontmatter.bloom_cognitive : '',
    bloom_knowledge: typeof frontmatter.bloom_knowledge === 'string' ? frontmatter.bloom_knowledge : '',
    dok: typeof frontmatter.dok === 'number' ? frontmatter.dok : undefined,
    sources: strings(frontmatter.sources),
    authors: strings(frontmatter.authors),
    created: typeof frontmatter.created === 'string' ? frontmatter.created : '',
    updated: typeof frontmatter.updated === 'string' ? frontmatter.updated : '',
    superseded_by: typeof frontmatter.superseded_by === 'string' ? frontmatter.superseded_by.replace(/^\[\[(.*)\]\]$/, '$1').trim() : '',
    tags: strings(frontmatter.tags),
    aliases: strings(frontmatter.aliases),
    order: Number(frontmatter.sidebar?.order) || 0,
    relations,
    resolvedRelations: {},
    reverseRelations: {},
    outgoing: [],
    backlinks: [],
  };
}

/**
 * @param {string} raw
 * @param {Map<string,string[]>} [names]
 * @param {Map<string,import('astro').MarkdownHeading[]>} [headings]
 * @param {boolean} [math]
 * @param {Map<string,string[]>} [blocks]
 * @param {Map<string, Note> | Note[]} [metadata]
 * @param {{ linkResolver?: ((target: string) => string | null) | null }} [options]
 */
async function render(
  raw,
  names = new Map(),
  headings = new Map(),
  math = true,
  blocks = new Map(),
  metadata = [],
  options = {}
) {
  const vaultAssets = getVaultAssets();
  if (parseFrontmatter(raw).frontmatter['excalidraw-plugin'] || raw.trimStart().startsWith('{')) {
    try {
      const scene = await parseExcalidraw(raw, vaultAssets);
      if (scene) {
        /** @type {import('hast').Root} */
        const tree = {
          type: 'root',
          children: [{
            type: 'element',
            tagName: 'figure',
            properties: { 'data-excalidraw': JSON.stringify(scene) },
            children: [{ type: 'text', value: 'در حال نمایش نقاشی…' }],
          }],
        };
        const html = htmlStringifier.stringify(tree);
        return {
          html,
          previewHtml: html,
          referencePreviews: /** @type {Record<string,string>} */ ({}),
          blocks: /** @type {string[]} */ ([]),
          headings: /** @type {import('astro').MarkdownHeading[]} */ ([]),
          outgoing: /** @type {string[]} */ ([]),
        };
      }
    } catch { /* Invalid scenes remain readable Markdown; raw source is never changed. */ }
  }
  /** @type {string[]} */
  const outgoing = [];
  /** @type {Record<string,string>} */
  const referencePreviews = Object.create(null);
  /** @type {string[]} */
  const blockIds = [];
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkCallout)
    .use(() => (/** @type {any} */ tree, /** @type {any} */ file) => {
      const source = String(file);
      visit(tree, 'paragraph', (node, index, parent) => {
        if (!parent || index === undefined) return;
        const parts = [];
        let children = [];
        for (const child of node.children) {
          const spelling = source.slice(child.position?.start.offset, child.position?.end.offset);
          if (child.type === 'inlineMath' && spelling.startsWith('$$') && spelling.endsWith('$$')) {
            if (children.length) { parts.push({ type: 'paragraph', children }); children = []; }
            parts.push({
              type: 'math',
              value: child.value,
              data: { hName: 'div', hProperties: { className: ['math', 'math-display'] }, hChildren: [{ type: 'text', value: child.value }] },
            });
          } else children.push(child);
        }
        if (parts.length) {
          if (children.length) parts.push({ type: 'paragraph', children });
          parent.children.splice(index, 1, ...parts);
          return index + parts.length;
        }
      });
    })
    .use(remarkWikiLink, { aliasDivider: '|' })
    .use(() => (/** @type {import('mdast').Root} */ tree) => {
      findAndReplace(tree, [
        [/!\[\[([^\]\n]+)\]\]/g, (_match, value) => {
          const parsed = wikiParser.parse('[[' + value + ']]');
          const paragraph = parsed.children[0];
          const node = paragraph && 'children' in paragraph ? paragraph.children[0] : undefined;
          if (node?.type !== 'wikiLink') return false;
          node.data.embed = true;
          return node;
        }],
        [/==([^=\n]+)==/g, (_match, value) => /** @type {any} */ ({
          type: 'element',
          data: { hName: 'mark' },
          children: [{ type: 'text', value }],
        })],
        [/(?:^|(?<=\s))#(?=[\p{L}\p{N}_\/-]*\p{L})([\p{L}\p{N}_\/-]+)/gu, (_match, tag) => /** @type {any} */ ({
          type: 'element',
          data: {
            hName: 'a',
            hProperties: { className: ['tag'], href: '/search?tag=' + encodeURIComponent(tag) },
          },
          children: [{ type: 'text', value: '#' + tag }],
        })],
      ]);
      visit(tree, 'paragraph', (node, index, parent) => {
        const last = node.children.at(-1);
        if (last?.type !== 'text') return;
        const found = last.value.match(/(?:^|\s)\^([a-zA-Z0-9-]+)\s*$/);
        if (!found) return;
        last.value = last.value.slice(0, found.index);
        const target = node.children.every((child) => child.type === 'text' && !child.value.trim()) && index && parent ? parent.children[index - 1] : node;
        target.data ??= {};
        target.data.hProperties ??= {};
        target.data.hProperties.id = 'block-' + found[1];
        blockIds.push(found[1]);
      });
      visit(tree, (/** @type {any} */ node) => {
        if (node.type === 'link') {
          if (options?.linkResolver && node.url && !/^(https?|mailto|ftp):/i.test(node.url)) {
            const resolved = options.linkResolver(node.url);
            if (resolved) {
              node.url = resolved;
            }
          }
          node.url = sanitizeUri(node.url, /^(https?|mailto)$/i) ? node.url : '';
        } else if (node.type === 'image' || node.type === 'definition') {
          node.url = sanitizeUri(node.url, /^(https?|mailto)$/i) ? node.url : '';
        }
        if (node.type === 'code' && ['mermaid', 'flowchart'].includes(node.lang?.toLowerCase() ?? '')) {
          node.data = {
            hName: 'figure',
            hProperties: { className: ['mermaid-diagram'], 'data-mermaid': '' },
            hChildren: [
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['mermaid-chart'], 'data-mermaid-source': encodeURIComponent(node.value) },
                children: [{ type: 'text', value: 'در حال ترسیم نمودار…' }],
              },
              {
                type: 'element',
                tagName: 'details',
                properties: { className: ['mermaid-details'] },
                children: [
                  { type: 'element', tagName: 'summary', properties: {}, children: [{ type: 'text', value: 'کد منبع Mermaid' }] },
                  { type: 'element', tagName: 'pre', properties: { tabIndex: 0 }, children: [{ type: 'text', value: node.value }] },
                ],
              },
            ],
          };
        }
        if (node.type === 'code' && ['geogebra', 'ggb'].includes(node.lang?.toLowerCase() ?? '')) {
          try {
            const config = parseGeoGebra(node.value, vaultAssets);
            const { caption } = config;
            node.data = {
              hName: 'figure',
              hProperties: { 'data-geogebra': JSON.stringify(config) },
              hChildren: [
                { type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: caption }] },
                { type: 'element', tagName: 'button', properties: { type: 'button' }, children: [{ type: 'text', value: 'بارگذاری رسم تعاملی' }] },
                { type: 'element', tagName: 'div', properties: { 'data-geogebra-host': '' }, children: [] },
                { type: 'element', tagName: 'ul', properties: {}, children: config.explain.map((/** @type {string} */ value) => ({ type: 'element', tagName: 'li', properties: {}, children: [{ type: 'text', value }] })) },
                { type: 'element', tagName: 'details', properties: {}, children: [{ type: 'element', tagName: 'summary', properties: {}, children: [{ type: 'text', value: 'کد اصلی رسم' }] }, { type: 'element', tagName: 'pre', properties: { tabIndex: 0 }, children: [{ type: 'text', value: node.value }] }] },
              ],
            };
          } catch { /* Invalid diagrams remain readable code. */ }
        }
        if (node.type === 'wikiLink') {
          const rawValue = node.value || '';
          const [targetPart, rawAnchor] = rawValue.split('#');
          const anchor = rawAnchor ? rawAnchor.replace(/[\s\\]+$/, '').trim() : '';
          const cleanTarget = targetPart.replace(/[\s\\\/]+$/, '').trim().replace(/\.md$/, '');
          const firstChild = node.data.hChildren?.[0];
          if (options?.linkResolver) {
            const resolvedUrl = options.linkResolver(rawValue) || options.linkResolver(cleanTarget);
            if (resolvedUrl) {
              node.data.hName = 'a';
              node.data.hProperties = { href: resolvedUrl, className: ['wiki-link'] };
              if (firstChild && 'value' in firstChild && typeof firstChild.value === 'string') {
                firstChild.value = firstChild.value.replace(/^[\s\\\|]+|[\s\\\|]+$/g, '').trim();
              }
              return;
            }
          }
          if (node.data.embed) {
            if (cleanTarget.endsWith('.pdf')) {
              const pdfAsset = resolveVaultImage(cleanTarget, vaultAssets) || cleanTarget;
              const srcUrl = pdfAsset.startsWith('/') ? pdfAsset : '/vault/' + pdfAsset;
              let page = '';
              let height = '500px';
              if (anchor) {
                const pageMatch = anchor.match(/page=(\d+)/);
                if (pageMatch) page = `#page=${pageMatch[1]}`;
                const heightMatch = anchor.match(/height=(\d+)/);
                if (heightMatch) height = `${heightMatch[1]}px`;
              } else if (node.data.alias && node.data.alias !== cleanTarget) {
                const hMatch = String(node.data.alias).match(/(\d+)/);
                if (hMatch) height = `${hMatch[1]}px`;
              }
              node.data.hName = 'figure';
              node.data.hProperties = { className: ['pdf-embed-wrapper'] };
              node.data.hChildren = [
                {
                  type: 'element',
                  tagName: 'iframe',
                  properties: {
                    src: srcUrl + page,
                    className: ['pdf-embed'],
                    style: `width:100%;height:${height};border:1px solid var(--border);border-radius:0.5rem;`,
                    title: cleanTarget,
                    loading: 'lazy',
                  },
                  children: [],
                },
              ];
              return;
            }
            if (/\.(mp3|wav|ogg|m4a)$/i.test(cleanTarget)) {
              const audioAsset = resolveVaultImage(cleanTarget, vaultAssets) || cleanTarget;
              const srcUrl = audioAsset.startsWith('/') ? audioAsset : '/vault/' + audioAsset;
              node.data.hName = 'figure';
              node.data.hProperties = { className: ['audio-embed-wrapper'] };
              node.data.hChildren = [
                {
                  type: 'element',
                  tagName: 'audio',
                  properties: { controls: true, src: srcUrl, className: ['audio-embed'], preload: 'metadata' },
                  children: [],
                },
              ];
              return;
            }
            if (/\.(mp4|webm|ogv)$/i.test(cleanTarget)) {
              const videoAsset = resolveVaultImage(cleanTarget, vaultAssets) || cleanTarget;
              const srcUrl = videoAsset.startsWith('/') ? videoAsset : '/vault/' + videoAsset;
              node.data.hName = 'figure';
              node.data.hProperties = { className: ['video-embed-wrapper'] };
              node.data.hChildren = [
                {
                  type: 'element',
                  tagName: 'video',
                  properties: { controls: true, src: srcUrl, className: ['video-embed'], style: 'max-width:100%;border-radius:0.5rem;', preload: 'metadata' },
                  children: [],
                },
              ];
              return;
            }
            if (cleanTarget.endsWith('.canvas')) {
              const canvasAsset = resolveVaultImage(cleanTarget, vaultAssets) || cleanTarget;
              const srcUrl = canvasAsset.startsWith('/') ? canvasAsset : '/vault/' + canvasAsset;
              node.data.hName = 'figure';
              node.data.hProperties = {
                className: ['canvas-diagram'],
                'data-canvas-url': srcUrl,
                'data-canvas-title': cleanTarget,
              };
              node.data.hChildren = [
                {
                  type: 'element',
                  tagName: 'div',
                  properties: { className: ['canvas-placeholder'] },
                  children: [{ type: 'text', value: `در حال بارگذاری بوم: ${cleanTarget}` }],
                },
              ];
              return;
            }
            const image = resolveVaultImage(cleanTarget, vaultAssets);
            if (image) {
              const dimensions = String(node.data.alias ?? '').match(/^(\d+)(?:x(\d+))?$/);
              node.data.hName = 'img';
              node.data.hProperties = {
                src: '/' + image.split('/').map(encodeURIComponent).join('/'),
                alt: cleanTarget,
                loading: 'lazy',
                ...(dimensions && Number(dimensions[1]) <= 1600 ? { width: Number(dimensions[1]) } : {}),
                ...(dimensions?.[2] && Number(dimensions[2]) <= 1600 ? { height: Number(dimensions[2]) } : {}),
              };
              node.data.hChildren = [];
              return;
            }
          }
          const candidates = resolveTargetCandidates(cleanTarget, names, metadata);
          const heading = anchor ? headings.get(candidates[0])?.find((item) => normalize(item.text) === normalize(anchor) || item.slug === anchor) : undefined;
          const block = anchor?.startsWith('^') && blocks.get(candidates[0])?.includes(anchor.slice(1)) ? 'block-' + anchor.slice(1) : '';
          const resolved = candidates.length === 1 && (!anchor || !!heading || !!block);
          node.data.hName = resolved ? 'a' : 'span';
          node.data.hProperties = resolved
            ? { href: noteHref(candidates[0]) + (heading ? `#${heading.slug}` : block ? `#${block}` : ''), className: ['wiki-link'], 'data-note-preview': candidates[0] }
            : { className: [candidates.length > 1 ? 'wiki-ambiguous' : 'wiki-missing'], title: candidates.length > 1 ? 'نام مبهم است' : 'یادداشت یا بخش موجود نیست' };
          if (firstChild && 'value' in firstChild && typeof firstChild.value === 'string') {
            firstChild.value = firstChild.value.replace(/^[\s\\\|]+|[\s\\\|]+$/g, '').trim();
          }
          if (resolved) {
            outgoing.push(candidates[0]);
            if (node.data.embed) {
              node.data.hName = 'span';
              node.data.hProperties = { 'data-embed-slug': candidates[0], 'data-embed-anchor': heading?.slug ?? block };
              node.data.hChildren = [{ type: 'element', tagName: 'a', properties: { href: noteHref(candidates[0]) }, children: [{ type: 'text', value: cleanTarget }] }];
            }
          }
        }
      });
    }).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeHeadingIds);
  if (math) processor.use(rehypeKatex, { trust: false, strict: 'ignore' });
  processor.use(() => (/** @type {import('hast').Root} */ tree, file) => {
    visit(tree, 'raw', (/** @type {any} */ node, index, parent) => {
      const sanitized = sanitizeRawHtml(node.value);
      if (!sanitized) {
        if (parent && index !== undefined) {
          parent.children.splice(index, 1);
          return index;
        }
        node.value = '';
        return;
      }
      node.value = sanitized;
    });
    visit(tree, 'element', (node, index, parent) => {
      const figure = node.children[0];
      if (node.tagName === 'pre' && figure?.type === 'element' && figure.tagName === 'figure' && (figure.properties['data-geogebra'] || figure.properties['data-mermaid'] !== undefined || figure.properties['data-canvas-url'] !== undefined) && parent && index !== undefined) {
        parent.children[index] = figure;
        return index;
      }
      if (node.tagName === 'table' && parent && index !== undefined && !(parent.type === 'element' && Array.isArray(parent.properties?.className) && parent.properties.className.includes('table-scroll'))) {
        /** @type {import('hast').Element} */
        const wrapper = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-scroll'], role: 'region', tabIndex: 0 },
          children: [node],
        };
        parent.children[index] = wrapper;
        return index + 1;
      }
    });
    let codeIndex = 0;
    visit(tree, 'element', (node) => {
      if (node.tagName === 'pre') {
        codeIndex += 1;
        Object.assign(node.properties, { tabIndex: 0, role: 'region', 'aria-label': codeIndex === 1 ? 'بلوک کد' : `بلوک کد ${codeIndex.toLocaleString('fa-IR')}` });
      }
    });
    // Capture source paragraphs before transclusions add other notes' links.
    for (const tags of [['p'], ['li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']]) {
      visit(tree, 'element', (paragraph) => {
        if (!tags.includes(paragraph.tagName)) return;
        /** @type {Set<string>} */
        const targets = new Set();
        visit(paragraph, 'element', (node) => {
          const slug = node.properties['data-note-preview'] ?? node.properties['data-embed-slug'];
          if (typeof slug === 'string') targets.add(slug);
        });
        if (!targets.size) return;
        const snippet = structuredClone(paragraph);
        if (['li', 'td', 'th'].includes(snippet.tagName)) snippet.tagName = 'div';
        visit(snippet, 'element', (node) => { delete node.properties.id; });
        const html = htmlStringifier.stringify({ type: 'root', children: [snippet] });
        for (const slug of targets) referencePreviews[slug] ??= html;
      });
    }
    const preview = structuredClone({ ...tree, children: tree.children.filter((node) => node.type !== 'text' || node.value.trim()).slice(0, 3) });
    visit(preview, 'element', (node) => { delete node.properties.id; });
    file.data.previewHtml = htmlStringifier.stringify(preview);
  }).use(rehypeStringify, { allowDangerousHtml: true });
  const file = await processor.process(
    escapePipesInTableWikilinks(stripObsidianComments(parseFrontmatter(raw).content))
  );
  return {
    html: String(file),
    referencePreviews,
    previewHtml: String(file.data.previewHtml),
    blocks: blockIds,
    headings: /** @type {import('astro').MarkdownHeading[]} */ (file.data.astro?.headings ?? []),
    outgoing: [...new Set(outgoing)],
  };
}

/** @param {string} raw @param {{ linkResolver?: ((target: string) => string | null) | null }} [options] */
export async function renderMarkdown(raw, options = {}) {
  return (await render(raw, undefined, undefined, true, undefined, [], options)).html;
}

/** @param {Note[]} notes @returns {IndexedNote[]} */
export function noteMetadata(notes) {
  return notes.map(parseIndexedMeta);
}

/** @param {import('hast').Root} tree @param {Map<string,import('hast').Root>} trees @param {string[]} chain */
function expandEmbeds(tree, trees, chain) {
  visit(tree, 'element', (node, _index, parent) => {
    const slug = String(node.properties.dataEmbedSlug ?? node.properties['data-embed-slug'] ?? '');
    if (!slug || chain.includes(slug) || chain.length >= 3) return;
    const original = trees.get(slug);
    if (!original) return;
    const anchor = String(node.properties.dataEmbedAnchor ?? node.properties['data-embed-anchor'] ?? '');
    const embedded = structuredClone(original);
    if (anchor) {
      /** @type {import('hast').Element | undefined} */
      let block;
      visit(embedded, 'element', (element) => { if (element.properties.id === anchor) block = element; });
      if (!block) return;
      const start = embedded.children.indexOf(block);
      if (start >= 0 && /^h[1-6]$/.test(block.tagName)) {
        const level = Number(block.tagName[1]);
        let end = start + 1;
        while (end < embedded.children.length) {
          const next = embedded.children[end];
          if (next.type === 'element' && /^h[1-6]$/.test(next.tagName) && Number(next.tagName[1]) <= level) break;
          end++;
        }
        embedded.children = embedded.children.slice(start, end);
      } else embedded.children = [block];
    }
    expandEmbeds(embedded, trees, [...chain, slug]);
    visit(embedded, 'element', (element) => { delete element.properties.id; });
    if (parent?.type === 'element' && parent.tagName === 'p') parent.tagName = 'div';
    node.tagName = 'div';
    node.properties = { 'data-transclusion': slug, className: ['transclusion'] };
    node.children = embedded.children.filter((child) => child.type !== 'doctype');
  });
}

// Per-note bounded LRU caches
/** @type {LRUCache<string, { meta: IndexedNote; rawLinks: Array<{ cleanTarget: string; anchor: string; isEmbed: boolean }> }>} */
const noteIndexEntryCache = new LRUCache({ max: 2000 });
/** @type {LRUCache<string, { headings: import('astro').MarkdownHeading[]; blocks: string[] }>} */
const outlineCache = new LRUCache({ max: 2000 });
/** @type {LRUCache<string, KnowledgeIndex>} */
const indexCache = new LRUCache({ max: 8 });
/**
 * @type {LRUCache<string, {
 *   html: string;
 *   previewHtml: string;
 *   referencePreviews: Record<string, string>;
 *   blocks: string[];
 *   headings: import('astro').MarkdownHeading[];
 *   outgoing: string[];
 *   anchorDeps: Array<[string, string]>;
 * }>}
 */
const baseRenderCache = new LRUCache({ max: 1000 });
/**
 * @type {LRUCache<string, {
 *   html: string;
 *   embedDeps: Array<[string, string]>;
 * }>}
 */
const expandedRenderCache = new LRUCache({ max: 1000 });

export function clearKnowledgeCaches() {
  noteIndexEntryCache.clear();
  outlineCache.clear();
  indexCache.clear();
  baseRenderCache.clear();
  expandedRenderCache.clear();
}

/** @param {Note} note */
async function getOutline(note) {
  const hash = noteHash(note);
  const key = `out|${note.slug}|${hash}`;
  const cached = outlineCache.get(key);
  if (cached) return cached;
  const out = await render(note.current_content, undefined, undefined, false);
  const entry = { headings: out.headings, blocks: out.blocks };
  outlineCache.set(key, entry);
  return entry;
}

/** @param {Iterable<string>} slugs @param {KnowledgeIndex} index */
async function ensureOutlines(slugs, index) {
  /** @type {string[]} */
  const missing = [];
  for (const slug of slugs) {
    if (!index.headings.has(slug) && index.bySlug.has(slug)) {
      missing.push(slug);
    }
  }
  if (!missing.length) return;
  await Promise.all(
    missing.map(async (slug) => {
      const target = index.bySlug.get(slug);
      if (!target) return;
      const out = await getOutline(target);
      index.headings.set(slug, out.headings);
      index.blocks.set(slug, out.blocks);
    })
  );
}

/** @param {string} targetSlug @param {string} anchor @param {KnowledgeIndex} index */
function hasValidAnchor(targetSlug, anchor, index) {
  if (!anchor) return true;
  const heading = index.headings.get(targetSlug)?.find((item) => normalize(item.text) === normalize(anchor) || item.slug === anchor);
  if (heading) return true;
  return Boolean(anchor.startsWith('^') && index.blocks.get(targetSlug)?.includes(anchor.slice(1)));
}

/** @param {Note[]} notes @returns {Promise<KnowledgeIndex>} */
export async function buildKnowledgeIndex(notes) {
  const hashes = notes.map((note) => `${note.slug}:${noteHash(note)}`).sort();
  const version = fastHash(hashes.join('\n'));
  const cachedIndex = indexCache.get(version);
  if (cachedIndex && cachedIndex.notes.length === notes.length) {
    return cachedIndex;
  }

  /** @type {IndexedNote[]} */
  const metadata = [];
  /** @type {Map<string, IndexedNote>} */
  const bySlug = new Map();
  /** @type {Map<string, Array<{ cleanTarget: string; anchor: string; isEmbed: boolean }>>} */
  const rawLinksBySlug = new Map();
  /** @type {Map<string, string[]>} */
  const names = new Map();

  for (const note of notes) {
    const hash = noteHash(note);
    const cacheKey = `idx|${note.slug}|${hash}`;
    let cachedEntry = noteIndexEntryCache.get(cacheKey);
    if (!cachedEntry) {
      cachedEntry = {
        meta: parseIndexedMeta(note),
        rawLinks: extractRawWikiLinks(note.current_content),
      };
      noteIndexEntryCache.set(cacheKey, cachedEntry);
    }
    const metaCopy = {
      ...cachedEntry.meta,
      resolvedRelations: /** @type {Record<string, string[]>} */ ({}),
      reverseRelations: /** @type {Record<string, string[]>} */ ({}),
      outgoing: /** @type {string[]} */ ([]),
      backlinks: /** @type {string[]} */ ([]),
    };
    metadata.push(metaCopy);
    bySlug.set(metaCopy.slug, metaCopy);
    rawLinksBySlug.set(metaCopy.slug, cachedEntry.rawLinks);

    for (const name of [metaCopy.slug, metaCopy.title, ...metaCopy.aliases, ...extractNotePaths(metaCopy)]) {
      const key = normalize(name);
      const list = names.get(key);
      if (list) {
        if (!list.includes(metaCopy.slug)) list.push(metaCopy.slug);
      } else {
        names.set(key, [metaCopy.slug]);
      }
    }
  }

  const namesFingerprint = fastHash(
    [...names.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, slugs]) => `${k}=${slugs.join(',')}`)
      .join('\n')
  );

  /** @type {KnowledgeIndex} */
  const index = {
    notes: metadata,
    bySlug,
    names,
    namesFingerprint,
    version,
    headings: new Map(),
    blocks: new Map(),
    rawLinksBySlug,
  };

  /** @type {Set<string>} */
  const anchorTargets = new Set();
  for (const note of metadata) {
    const rawLinks = rawLinksBySlug.get(note.slug) ?? [];
    for (const link of rawLinks) {
      if (!link.anchor) continue;
      const candidates = resolveTargetCandidates(link.cleanTarget, names, bySlug);
      if (candidates.length === 1) {
        anchorTargets.add(candidates[0]);
      }
    }
  }
  await ensureOutlines(anchorTargets, index);

  /** @type {Map<string, Set<string>>} */
  const backlinkSets = new Map();
  const relationRegistry = /** @type {Record<string, { reverseKey?: string }>} */ (UMKO_RELATIONS);

  for (const note of metadata) {
    /** @type {Set<string>} */
    const outgoingSet = new Set();
    const rawLinks = rawLinksBySlug.get(note.slug) ?? [];
    for (const link of rawLinks) {
      const candidates = resolveTargetCandidates(link.cleanTarget, names, bySlug);
      if (candidates.length === 1 && hasValidAnchor(candidates[0], link.anchor, index)) {
        outgoingSet.add(candidates[0]);
      }
    }

    for (const [relKey, targets] of Object.entries(note.relations || {})) {
      /** @type {string[]} */
      const resolvedSlugs = [];
      for (const t of targets) {
        const clean = normalize(t.replace(/\.md$/, ''));
        const candidates = names.get(clean);
        if (candidates?.length === 1) {
          resolvedSlugs.push(candidates[0]);
          outgoingSet.add(candidates[0]);
        }
      }
      if (resolvedSlugs.length) {
        note.resolvedRelations[relKey] = resolvedSlugs;
      }
    }

    note.outgoing = [...outgoingSet];
    for (const targetSlug of note.outgoing) {
      let set = backlinkSets.get(targetSlug);
      if (!set) {
        set = new Set();
        backlinkSets.set(targetSlug, set);
      }
      set.add(note.slug);
    }
  }

  for (const source of metadata) {
    for (const [relKey, targets] of Object.entries(source.resolvedRelations)) {
      for (const targetSlug of targets) {
        const targetNote = bySlug.get(targetSlug);
        if (!targetNote) continue;
        targetNote.reverseRelations[relKey] ??= [];
        if (!targetNote.reverseRelations[relKey].includes(source.slug)) {
          targetNote.reverseRelations[relKey].push(source.slug);
        }
        const revKey = relationRegistry[relKey]?.reverseKey;
        if (revKey && revKey !== relKey) {
          Object.defineProperty(targetNote.reverseRelations, revKey, {
            get() { return targetNote.reverseRelations[relKey]; },
            enumerable: false,
            configurable: true,
          });
        }
      }
    }
  }

  for (const note of metadata) {
    const incoming = backlinkSets.get(note.slug);
    note.backlinks = incoming ? [...incoming] : [];
  }

  indexCache.set(version, index);
  return index;
}

/** @param {IndexedNote} note @param {KnowledgeIndex} index */
async function renderBaseNote(note, index) {
  const hash = noteHash(note);
  const key = `base|${RENDERER_VERSION}|${note.slug}|${hash}|${index.namesFingerprint}`;
  const cached = baseRenderCache.get(key);
  if (
    cached &&
    cached.anchorDeps.every(([depSlug, depHash]) => {
      const target = index.bySlug.get(depSlug);
      return target && noteHash(target) === depHash;
    })
  ) {
    return cached;
  }

  const rawLinks = index.rawLinksBySlug.get(note.slug) ?? extractRawWikiLinks(note.current_content);
  /** @type {Set<string>} */
  const anchorSlugs = new Set();
  for (const link of rawLinks) {
    if (!link.anchor) continue;
    const candidates = resolveTargetCandidates(link.cleanTarget, index.names, index.bySlug);
    if (candidates.length === 1) anchorSlugs.add(candidates[0]);
  }
  await ensureOutlines(anchorSlugs, index);

  /** @type {Array<[string, string]>} */
  const anchorDeps = [];
  for (const depSlug of anchorSlugs) {
    const depNote = index.bySlug.get(depSlug);
    if (depNote) anchorDeps.push([depSlug, noteHash(depNote)]);
  }

  const rendered = await render(
    note.current_content,
    index.names,
    index.headings,
    true,
    index.blocks,
    index.bySlug
  );
  const entry = { ...rendered, anchorDeps };
  baseRenderCache.set(key, entry);
  return entry;
}

/** @param {import('hast').Root} tree @param {KnowledgeIndex} index @param {string[]} initialChain @param {Map<string, string>} embedDeps */
async function expandTreeEmbeds(tree, index, initialChain, embedDeps) {
  /** @type {Map<string, import('hast').Root>} */
  const trees = new Map();
  /** @type {Set<string>} */
  const visitedTargets = new Set();

  /** @param {import('hast').Root} root @param {string[]} chain */
  async function collectAndPrepare(root, chain) {
    /** @type {string[]} */
    const needed = [];
    visit(root, 'element', (node) => {
      const slug = String(node.properties.dataEmbedSlug ?? node.properties['data-embed-slug'] ?? '');
      if (!slug || chain.includes(slug) || chain.length >= 3) return;
      if (!visitedTargets.has(slug)) {
        visitedTargets.add(slug);
        needed.push(slug);
      }
    });
    if (!needed.length) return;
    await Promise.all(
      needed.map(async (targetSlug) => {
        const targetNote = index.bySlug.get(targetSlug);
        if (!targetNote) return;
        embedDeps.set(targetSlug, noteHash(targetNote));
        const base = await renderBaseNote(targetNote, index);
        const targetTree = htmlParser.parse(base.html);
        trees.set(targetSlug, targetTree);
        if (base.html.includes('data-embed-slug')) {
          await collectAndPrepare(targetTree, [...chain, targetSlug]);
        }
      })
    );
  }

  await collectAndPrepare(tree, initialChain);
  expandEmbeds(tree, trees, initialChain);
}

/**
 * Render a single note using prebuilt KnowledgeIndex, expanding embeds only if present.
 * @param {IndexedNote} note
 * @param {KnowledgeIndex} index
 * @returns {Promise<RenderedNote>}
 */
export async function renderSingleNote(note, index) {
  const base = await renderBaseNote(note, index);
  const outgoing = note.outgoing.length
    ? [...new Set([...base.outgoing, ...note.outgoing])]
    : base.outgoing;
  if (!base.html.includes('data-embed-slug')) {
    return { ...note, ...base, outgoing };
  }

  const hash = noteHash(note);
  const expKey = `exp|${RENDERER_VERSION}|${note.slug}|${hash}|${index.namesFingerprint}`;
  const cachedExp = expandedRenderCache.get(expKey);
  if (
    cachedExp &&
    cachedExp.embedDeps.every(([depSlug, depHash]) => {
      const target = index.bySlug.get(depSlug);
      return target && noteHash(target) === depHash;
    })
  ) {
    return { ...note, ...base, outgoing, html: cachedExp.html };
  }

  const tree = htmlParser.parse(base.html);
  /** @type {Map<string, string>} */
  const embedDeps = new Map();
  await expandTreeEmbeds(tree, index, [note.slug], embedDeps);
  const html = htmlStringifier.stringify(tree);
  expandedRenderCache.set(expKey, { html, embedDeps: [...embedDeps.entries()] });
  return { ...note, ...base, outgoing, html };
}

/**
 * Render arbitrary Markdown content (e.g. live editor preview) against a KnowledgeIndex
 * without building/rendering the entire vault.
 * @param {string} raw
 * @param {KnowledgeIndex} index
 */
export async function renderNoteWithIndex(raw, index) {
  const rawLinks = extractRawWikiLinks(raw);
  /** @type {Set<string>} */
  const anchorSlugs = new Set();
  for (const link of rawLinks) {
    if (!link.anchor) continue;
    const candidates = resolveTargetCandidates(link.cleanTarget, index.names, index.bySlug);
    if (candidates.length === 1) anchorSlugs.add(candidates[0]);
  }
  await ensureOutlines(anchorSlugs, index);

  const result = await render(
    raw,
    index.names,
    index.headings,
    true,
    index.blocks,
    index.bySlug
  );
  if (!result.html.includes('data-embed-slug')) return result.html;

  const tree = htmlParser.parse(result.html);
  await expandTreeEmbeds(tree, index, [], new Map());
  return htmlStringifier.stringify(tree);
}

/** @param {Note[]} notes @returns {Promise<RenderedNote[]>} */
export async function buildKnowledge(notes) {
  const index = await buildKnowledgeIndex(notes);
  return Promise.all(index.notes.map((note) => renderSingleNote(note, index)));
}

/** A private preview resolves public links without publishing private text in the graph.
 * @param {string} raw @param {RenderedNote[]} garden */
export async function renderNote(raw, garden) {
  /** @type {Map<string,string[]>} */
  const names = new Map();
  for (const note of garden) {
    for (const name of [note.slug, note.title, ...note.aliases, ...extractNotePaths(note)]) {
      const key = normalize(name);
      names.set(key, [...new Set([...(names.get(key) ?? []), note.slug])]);
    }
  }
  const result = await render(
    raw,
    names,
    new Map(garden.map((note) => [note.slug, note.headings])),
    true,
    new Map(garden.map((note) => [note.slug, note.blocks])),
    garden
  );
  if (!result.html.includes('data-embed-slug')) return result.html;
  const tree = htmlParser.parse(result.html);
  expandEmbeds(tree, new Map(garden.map((note) => [note.slug, htmlParser.parse(note.html)])), []);
  return htmlStringifier.stringify(tree);
}
