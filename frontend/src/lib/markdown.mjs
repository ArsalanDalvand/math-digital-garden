import {parseExcalidraw} from './excalidraw.mjs';
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
import {parseGeoGebra,resolveVaultImage} from './obsidian-plugins.mjs';
import { findAndReplace } from 'mdast-util-find-and-replace';
import rehypeParse from 'rehype-parse';
import vaultAssets from './vault-assets.json' with { type: 'json' };
import { UMKO_RELATIONS } from './umko.mjs';

function stripObsidianComments(content) {
  const parts = content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part.replace(/%%[\s\S]*?%%/g, '');
  }).join('');
}

function sanitizeRawHtml(raw) {
  let s = raw.replace(/<\s*(?:script|style|object|applet|form)[\s\S]*?(?:<\s*\/\s*(?:script|style|object|applet|form)\s*>|$)/gi, '');
  s = s.replace(/\s+on\w+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/\bhref\s*=\s*[\"']\s*javascript:[^\"']*[\"']/gi, 'href=""');
  s = s.replace(/\bsrc\s*=\s*[\"']\s*(?:javascript|data):[^\"']*[\"']/gi, 'src=""');
  s = s.replace(/<\s*img\b[^>]*>/gi, '');
  s = s.replace(/<iframe\b([^>]*)>/gi, (match, attrs) => {
    const srcMatch = attrs.match(/src=[\"']([^\"']*)[\"']/i);
    const src = srcMatch ? srcMatch[1] : '';
    if (!src.startsWith('https://') && !src.startsWith('http://') && !src.startsWith('/')) {
      return '';
    }
    const cleanAttrs = attrs.trim();
    return '<iframe ' + cleanAttrs + ' sandbox="allow-scripts allow-same-origin allow-popups" loading="lazy">';
  });
  return s;
}

const wikiParser=unified().use(remarkParse).use(remarkWikiLink,{aliasDivider:'|'});
const htmlParser=unified().use(rehypeParse,{fragment:true});

/** @typedef {{slug:string,title:string,current_content:string,book_slug?:string,chapter_slug?:string,relative_path?:string}} Note */
/** @param {unknown} value */
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
/** @param {string} value */
const normalize = (value) => value.trim().normalize('NFC').toLocaleLowerCase('fa');
/** @param {string} slug */
export const noteHref = (slug) => `/notes/${encodeURIComponent(slug)}`;

/** @param {string} raw @param {Map<string,string[]>} names @param {Map<string,import("astro").MarkdownHeading[]>} headings @param {boolean} math @param {Map<string,string[]>} blocks */
async function render(raw, names = new Map(), headings = new Map(), math = true, blocks = new Map(), metadata = [], options = {}) {
  if(parseFrontmatter(raw).frontmatter['excalidraw-plugin'] || raw.trimStart().startsWith('{')){
    try{
      const scene=await parseExcalidraw(raw,vaultAssets);
      if(scene){
        /** @type {import('hast').Root} */
        const tree={type:'root',children:[{type:'element',tagName:'figure',properties:{'data-excalidraw':JSON.stringify(scene)},children:[{type:'text',value:'در حال نمایش نقاشی…'}]}]};
        const html=unified().use(rehypeStringify).stringify(tree);
        return {html,previewHtml:html,referencePreviews:/** @type {Record<string,string>} */ ({}),blocks:[],headings:[],outgoing:[]};
      }
    }catch{ /* Invalid scenes remain readable Markdown; raw source is never changed. */ }
  }
  /** @type {string[]} */
  const outgoing = [];
  /** @type {Record<string,string>} */
  const referencePreviews = Object.create(null);
  /** @type {string[]} */
  const blockIds=[];
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkCallout)
     .use(() => (/** @type {any} */ tree,/** @type {any} */ file) => {
      const source=String(file);visit(tree,'paragraph',(node,index,parent)=>{
        if(!parent||index===undefined)return;
        const parts=[];let children=[];
        for(const child of node.children){const spelling=source.slice(child.position?.start.offset,child.position?.end.offset);
          if(child.type==='inlineMath'&&spelling.startsWith('$$')&&spelling.endsWith('$$')){
            if(children.length){parts.push({type:'paragraph',children});children=[];}
            parts.push({type:'math',value:child.value,data:{hName:'div',hProperties:{className:['math','math-display']},hChildren:[{type:'text',value:child.value}]}});
          }else children.push(child);
        }
        if(parts.length){if(children.length)parts.push({type:'paragraph',children});parent.children.splice(index,1,...parts);return index+parts.length;}
      });
    })
    .use(remarkWikiLink, { aliasDivider: '|' })
    .use(() => (/** @type {import('mdast').Root} */ tree) => {
      findAndReplace(tree,[
        [/!\[\[([^\]\n]+)\]\]/g,(_match,value)=>{
          const parsed=wikiParser.parse('[['+value+']]');
          const paragraph=parsed.children[0];
          const node=paragraph && 'children' in paragraph ? paragraph.children[0] : undefined;
          if(node?.type!=='wikiLink')return false;
          node.data.embed=true;
          return node;
        }],
        [/==([^=\n]+)==/g,(_match,value)=>({
          type:'element',
          data:{hName:'mark'},
          children:[{type:'text',value}]
        })],
        [/(?:^|(?<=\s))#(?=[\p{L}\p{N}_\/-]*\p{L})([\p{L}\p{N}_\/-]+)/gu,(_match,tag)=>({
          type:'element',
          data:{
            hName:'a',
            hProperties:{className:['tag'],href:'/search?tag='+encodeURIComponent(tag)}
          },
          children:[{type:'text',value:'#'+tag}]
        })]
      ]);
      visit(tree,'paragraph',(node,index,parent)=>{
        const last=node.children.at(-1);
        if(last?.type!=='text')return;
        const found=last.value.match(/(?:^|\s)\^([a-zA-Z0-9-]+)\s*$/);
        if(!found)return;
        last.value=last.value.slice(0,found.index);
        const target=node.children.every(child=>child.type==='text' && !child.value.trim()) && index && parent ? parent.children[index-1] : node;
        target.data ??= {};target.data.hProperties ??= {};target.data.hProperties.id='block-'+found[1];
        blockIds.push(found[1]);
      });
      visit(tree, (node) => {
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
        if (node.type === 'code' && ['mermaid','flowchart'].includes(node.lang?.toLowerCase() ?? '')) {
          node.data = {
            hName: 'figure',
            hProperties: { className: ['mermaid-diagram'], 'data-mermaid': '' },
            hChildren: [
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['mermaid-chart'], 'data-mermaid-source': encodeURIComponent(node.value) },
                children: [{ type: 'text', value: 'در حال ترسیم نمودار…' }]
              },
              {
                type: 'element',
                tagName: 'details',
                properties: { className: ['mermaid-details'] },
                children: [
                  { type: 'element', tagName: 'summary', properties: {}, children: [{ type: 'text', value: 'کد منبع Mermaid' }] },
                  { type: 'element', tagName: 'pre', properties: { tabIndex: 0 }, children: [{ type: 'text', value: node.value }] }
                ]
              }
            ]
          };
        }
        if (node.type === 'code' && ['geogebra','ggb'].includes(node.lang?.toLowerCase() ?? '')) {
          try {
            const config=parseGeoGebra(node.value,vaultAssets);
            const {caption}=config;
            node.data={hName:'figure',hProperties:{'data-geogebra':JSON.stringify(config)},hChildren:[
              {type:'element',tagName:'figcaption',properties:{},children:[{type:'text',value:caption}]},
              {type:'element',tagName:'button',properties:{type:'button'},children:[{type:'text',value:'بارگذاری رسم تعاملی'}]},
              {type:'element',tagName:'div',properties:{'data-geogebra-host':''},children:[]},
              {type:'element',tagName:'ul',properties:{},children:config.explain.map(/** @param {string} value */ value=>({type:'element',tagName:'li',properties:{},children:[{type:'text',value}]}))},
              {type:'element',tagName:'details',properties:{},children:[{type:'element',tagName:'summary',properties:{},children:[{type:'text',value:'کد اصلی رسم'}]},{type:'element',tagName:'pre',properties:{tabIndex:0},children:[{type:'text',value:node.value}]}]}
            ]};
          } catch { /* Invalid diagrams remain readable code. */ }
        }
        if (node.type === 'wikiLink') {
          let rawValue = node.value || '';
          let [targetPart, anchor] = rawValue.split('#');
          let cleanTarget = targetPart.replace(/[\s\\\/]+$/, '').trim().replace(/\.md$/, '');
          if (options?.linkResolver) {
            const resolvedUrl = options.linkResolver(rawValue) || options.linkResolver(cleanTarget);
            if (resolvedUrl) {
              node.data.hName = 'a';
              node.data.hProperties = { href: resolvedUrl, className: ['wiki-link'] };
              if (node.data.hChildren?.[0]?.value) {
                node.data.hChildren[0].value = node.data.hChildren[0].value.replace(/^[\s\\\|]+|[\s\\\|]+$/g, '').trim();
              }
              return;
            }
          }
          if(node.data.embed){
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
                    loading: 'lazy'
                  },
                  children: []
                }
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
                  children: []
                }
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
                  children: []
                }
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
                'data-canvas-title': cleanTarget
              };
              node.data.hChildren = [
                {
                  type: 'element',
                  tagName: 'div',
                  properties: { className: ['canvas-placeholder'] },
                  children: [{ type: 'text', value: `در حال بارگذاری بوم: ${cleanTarget}` }]
                }
              ];
              return;
            }
            const image=resolveVaultImage(cleanTarget,vaultAssets);
            if(image){
              const dimensions=String(node.data.alias ?? '').match(/^(\d+)(?:x(\d+))?$/);
              node.data.hName='img';node.data.hProperties={src:'/'+image.split('/').map(encodeURIComponent).join('/'),alt:cleanTarget,loading:'lazy',
                ...(dimensions && Number(dimensions[1])<=1600 ? {width:Number(dimensions[1])} : {}),
                ...(dimensions?.[2] && Number(dimensions[2])<=1600 ? {height:Number(dimensions[2])} : {})};
              node.data.hChildren=[];return;
            }
          }
          let candidates = names.get(normalize(cleanTarget.replace(/\.excalidraw\.md$/,'.excalidraw'))) ?? [];
          if (!candidates.length && cleanTarget.includes('/')) {
            const stem = cleanTarget.split('/').pop()?.trim() ?? '';
            candidates = names.get(normalize(stem.replace(/\.excalidraw\.md$/,'.excalidraw'))) ?? [];
          }
          if (candidates.length > 1 && cleanTarget.includes('/')) {
            const exact = candidates.filter(slug => {
              const n = metadata.find(m => m.slug === slug);
              return n && normalize(n.relative_path || '').includes(normalize(cleanTarget));
            });
            if (exact.length === 1) candidates = exact;
          }
          const heading = anchor ? headings.get(candidates[0])?.find((item) => normalize(item.text) === normalize(anchor) || item.slug === anchor) : undefined;
          const block=anchor?.startsWith('^') && blocks.get(candidates[0])?.includes(anchor.slice(1)) ? 'block-'+anchor.slice(1) : '';
          const resolved = candidates.length === 1 && (!anchor || !!heading || !!block);
          node.data.hName = resolved ? 'a' : 'span';
          node.data.hProperties = resolved
            ? { href: noteHref(candidates[0]) + (heading ? `#${heading.slug}` : block ? `#${block}` : ''), className: ['wiki-link'], 'data-note-preview': candidates[0] }
            : { className: [candidates.length > 1 ? 'wiki-ambiguous' : 'wiki-missing'], title: candidates.length > 1 ? 'نام مبهم است' : 'یادداشت یا بخش موجود نیست' };
          if (node.data.hChildren?.[0]?.value) {
            node.data.hChildren[0].value = node.data.hChildren[0].value.replace(/^[\s\\\|]+|[\s\\\|]+$/g, '').trim();
          }
          if (resolved) {
            outgoing.push(candidates[0]);
            if(node.data.embed){
              node.data.hName='span';node.data.hProperties={'data-embed-slug':candidates[0],'data-embed-anchor':heading?.slug ?? block};
              node.data.hChildren=[{type:'element',tagName:'a',properties:{href:noteHref(candidates[0])},children:[{type:'text',value:cleanTarget}]}];
            }
          }
        }
      });
    }).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeHeadingIds);
  if (math) processor.use(rehypeKatex, { trust: false, strict: 'ignore' });
  processor.use(() => (/** @type {import('hast').Root} */ tree, file) => {
      visit(tree, 'raw', (node, index, parent) => {
        const sanitized = sanitizeRawHtml(node.value);
        if (!sanitized) {
          parent.children.splice(index, 1);
          return index;
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
          const wrapper = {
            type: 'element',
            tagName: 'div',
            properties: { className: ['table-scroll'], role: 'region', tabIndex: 0 },
            children: [node]
          };
          parent.children[index] = wrapper;
          return index + 1;
        }
      });
      let codeIndex = 0;
      visit(tree, 'element', node => {
        if (node.tagName === 'pre') {
          codeIndex += 1;
          Object.assign(node.properties, { tabIndex: 0, role: 'region', 'aria-label': codeIndex === 1 ? 'بلوک کد' : `بلوک کد ${codeIndex.toLocaleString('fa-IR')}` });
        }
      });
      // Capture source paragraphs before transclusions add other notes' links.
      for (const tags of [['p'], ['li','td','th','h1','h2','h3','h4','h5','h6']]) visit(tree, 'element', paragraph => {
        if (!tags.includes(paragraph.tagName)) return;
        const targets = new Set();
        visit(paragraph, 'element', node => {
          const slug = node.properties['data-note-preview'] ?? node.properties['data-embed-slug'];
          if (typeof slug === 'string') targets.add(slug);
        });
        if (!targets.size) return;
        const snippet = structuredClone(paragraph);
        if (['li','td','th'].includes(snippet.tagName)) snippet.tagName = 'div';
        visit(snippet, 'element', node => { delete node.properties.id; });
        const html = unified().use(rehypeStringify, { allowDangerousHtml: true }).stringify({type:'root',children:[snippet]});
        for (const slug of targets) referencePreviews[slug] ??= html;
      });
      const preview = structuredClone({ ...tree, children: tree.children.filter(node => node.type !== 'text' || node.value.trim()).slice(0,3) });
      visit(preview, 'element', (node) => { delete node.properties.id; });
      file.data.previewHtml = unified().use(rehypeStringify, { allowDangerousHtml: true }).stringify(preview);
    }).use(rehypeStringify, { allowDangerousHtml: true });
  const file = await processor.process(stripObsidianComments(parseFrontmatter(raw).content));
  return { html: String(file), referencePreviews, previewHtml: String(file.data.previewHtml), blocks:blockIds, headings: file.data.astro?.headings ?? [], outgoing: [...new Set(outgoing)] };
}

/** @param {string} raw @param {any} [options] */
export async function renderMarkdown(raw, options = {}) { return (await render(raw, undefined, undefined, true, undefined, [], options)).html; }

/** @param {Note[]} notes */
export function noteMetadata(notes) {
  return notes.map((note) => {
    const { frontmatter } = parseFrontmatter(note.current_content);
    const relations = {};
    for (const [k, v] of Object.entries(frontmatter)) {
      if (k.startsWith('rel_') && Array.isArray(v)) {
        relations[k] = v.map(String).map(s => s.replace(/^\[\[(.*)\]\]$/, '$1').split('|')[0].trim()).filter(Boolean);
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
      resolvedRelations: /** @type {Record<string, string[]>} */ ({}),
      reverseRelations: /** @type {Record<string, string[]>} */ ({})
    };
  });
}

  /** @param {import('hast').Root} tree @param {Map<string,import('hast').Root>} trees @param {string[]} chain */
  function expandEmbeds(tree,trees,chain){
    visit(tree,'element',(node,_index,parent)=>{
      const slug=String(node.properties.dataEmbedSlug ?? node.properties['data-embed-slug'] ?? '');
      if(!slug || chain.includes(slug) || chain.length>=3)return;
      const original=trees.get(slug);if(!original)return;
      const anchor=String(node.properties.dataEmbedAnchor ?? node.properties['data-embed-anchor'] ?? '');
      const embedded=structuredClone(original);
      if(anchor){
        /** @type {import('hast').Element | undefined} */
        let block;
        visit(embedded,'element',element=>{if(element.properties.id===anchor)block=element;});
        if(!block)return;
        const start=embedded.children.indexOf(block);
        if(start>=0 && /^h[1-6]$/.test(block.tagName)){
          const level=Number(block.tagName[1]);let end=start+1;
          while(end<embedded.children.length){const next=embedded.children[end];if(next.type==='element' && /^h[1-6]$/.test(next.tagName) && Number(next.tagName[1])<=level)break;end++;}
          embedded.children=embedded.children.slice(start,end);
        }else embedded.children=[block];
      }
      expandEmbeds(embedded,trees,[...chain,slug]);
      visit(embedded,'element',element=>{delete element.properties.id;});
      if(parent?.type==='element' && parent.tagName==='p')parent.tagName='div';
      node.tagName='div';node.properties={'data-transclusion':slug,className:['transclusion']};
      node.children=embedded.children.filter(child=>child.type!=='doctype');
    });
  }

/** @param {Note[]} notes */
async function deriveKnowledge(notes) {
  const metadata = noteMetadata(notes);
  /** @type {Map<string,string[]>} */
  const names = new Map();
  for (const note of metadata) {
    const paths = note.relative_path ? [
      note.relative_path.replace(/\.md$/,''),
      note.relative_path.replace(/^[^/]+\//,'').replace(/\.md$/,''),
      note.relative_path.split('/').pop().replace(/\.md$/,'')
    ] : [];
    for (const name of [note.slug, note.title, ...note.aliases, ...paths]) {
      const key = normalize(name);
      names.set(key, [...new Set([...(names.get(key) ?? []), note.slug])]);
    }
  }
  const outlines=await Promise.all(metadata.map(async(note)=>({slug:note.slug,...await render(note.current_content,undefined,undefined,false)})));
  const headings=new Map(outlines.map(note=>[note.slug,note.headings]));
  const blocks=new Map(outlines.map(note=>[note.slug,note.blocks]));
  const garden = await Promise.all(metadata.map(async(note) => ({ ...note, ...await render(note.current_content, names, headings, true, blocks, metadata), backlinks: /** @type {string[]} */ ([]) })));
  const trees=new Map(garden.map(note=>[note.slug,htmlParser.parse(note.html)]));
  for(const note of garden){
    const tree=structuredClone(trees.get(note.slug));
    if(tree){expandEmbeds(tree,trees,[note.slug]);note.html=unified().use(rehypeStringify).stringify(tree);}
  }
  for (const note of garden) {
    note.resolvedRelations = {};
    note.reverseRelations = {};
    for (const [relKey, targets] of Object.entries(note.relations || {})) {
      const resolvedSlugs = [];
      for (const t of targets) {
        const clean = normalize(t.replace(/\.md$/, ''));
        const candidates = names.get(clean);
        if (candidates?.length === 1) {
          resolvedSlugs.push(candidates[0]);
          if (!note.outgoing.includes(candidates[0])) {
            note.outgoing.push(candidates[0]);
          }
        }
      }
      if (resolvedSlugs.length) {
        note.resolvedRelations[relKey] = resolvedSlugs;
      }
    }
  }
  for (const source of garden) {
    for (const [relKey, targets] of Object.entries(source.resolvedRelations || {})) {
      for (const targetSlug of targets) {
        const targetNote = garden.find(n => n.slug === targetSlug);
        if (targetNote) {
          targetNote.reverseRelations ??= {};
          targetNote.reverseRelations[relKey] ??= [];
          if (!targetNote.reverseRelations[relKey].includes(source.slug)) {
            targetNote.reverseRelations[relKey].push(source.slug);
          }
          const revKey = UMKO_RELATIONS[relKey]?.reverseKey;
          if (revKey && revKey !== relKey) {
            Object.defineProperty(targetNote.reverseRelations, revKey, {
              get() { return targetNote.reverseRelations[relKey]; },
              enumerable: false,
              configurable: true
            });
          }
        }
      }
    }
  }
  for (const note of garden) note.backlinks = garden.filter((source) => source.outgoing.includes(note.slug)).map((source) => source.slug);
  return garden;
}

// shortcut: one canonical snapshot per process; use a persisted index if cold rendering becomes a deployment bottleneck.
/** @type {LRUCache<string, Awaited<ReturnType<typeof deriveKnowledge>>>} */
const knowledgeCache = new LRUCache({ max: 1, fetchMethod: key => deriveKnowledge(JSON.parse(key)) });
/** @param {Note[]} notes */
export async function buildKnowledge(notes) {
  return knowledgeCache.forceFetch(JSON.stringify(notes), { ignoreFetchAbort: true });
}

/** A private preview resolves public links without publishing private text in the graph.
 * @param {string} raw @param {Awaited<ReturnType<typeof deriveKnowledge>>} garden */
export async function renderNote(raw, garden) {
  const names = new Map();
  for (const note of garden) {
    const paths = note.relative_path ? [
      note.relative_path.replace(/\.md$/,''),
      note.relative_path.replace(/^[^/]+\//,'').replace(/\.md$/,''),
      note.relative_path.split('/').pop().replace(/\.md$/,'')
    ] : [];
    for (const name of [note.slug, note.title, ...note.aliases, ...paths]) {
      const key = normalize(name);
      names.set(key, [...new Set([...(names.get(key) ?? []), note.slug])]);
    }
  }
  const result=await render(raw,names,new Map(garden.map(note=>[note.slug,note.headings])),true,new Map(garden.map(note=>[note.slug,note.blocks])),garden);
  if(!result.html.includes('data-embed-slug'))return result.html;
  const tree=htmlParser.parse(result.html);
  expandEmbeds(tree,new Map(garden.map(note=>[note.slug,htmlParser.parse(note.html)])),[]);
  return unified().use(rehypeStringify).stringify(tree);
}
