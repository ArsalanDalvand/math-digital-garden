import { noteHref } from './markdown.mjs';

/** The graph engine normalizes node IDs to paths without a leading slash. @param {string} slug */
const graphPath = slug => noteHref(slug).slice(1);

/** @param {Awaited<ReturnType<typeof import('./markdown.mjs').buildKnowledge>>} garden */
export function graphSitemap(garden) {
  return Object.fromEntries(garden.map(note => {
    const kindTag = note.kind ? [`#kind:${note.kind}`] : [];
    const subtypeTag = note.subtype ? [`#sub:${note.subtype}`] : [];
    const levelTag = note.level ? [`#level:${note.level}`] : [];
    const trackTags = (note.tracks || []).map(t => `#track:${t}`);
    const normalTags = (note.tags || []).map(t => t.startsWith('#') ? t : `#${t}`);
    const allTags = [...new Set([...normalTags, ...kindTag, ...subtypeTag, ...levelTag, ...trackTags])];

    /** @type {Record<string, string[]>} */
    const rels = {};
    for (const [relKey, targets] of Object.entries(note.resolvedRelations || {})) {
      for (const targetSlug of targets || []) {
        const targetPath = graphPath(targetSlug);
        if (!rels[targetPath]) rels[targetPath] = [];
        if (!rels[targetPath].includes(relKey)) rels[targetPath].push(relKey);
      }
    }

    /** @type {Record<string, any>} */
    const entry = {
      title: note.title,
      exists: true,
      external: false,
      links: note.outgoing.map(graphPath),
      backlinks: note.backlinks.map(graphPath),
      tags: allTags,
      kind: note.kind || '',
      subtype: note.subtype || '',
      level: note.level || '',
      slogan: note.slogan_fa || '',
      uid: note.uid || '',
    };
    if (Object.keys(rels).length > 0) {
      entry.rels = rels;
    }

    return [graphPath(note.slug), entry];
  }));
}
