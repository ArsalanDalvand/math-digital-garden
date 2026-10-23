import { noteHref } from './markdown.mjs';

/** The graph plugin normalizes node IDs to paths without a leading slash. @param {string} slug */
const graphPath = slug => noteHref(slug).slice(1);

/** @param {Awaited<ReturnType<typeof import('./markdown.mjs').buildKnowledge>>} garden */
export function graphSitemap(garden) {
  return Object.fromEntries(garden.map(note => [graphPath(note.slug), {
    title: note.title, exists: true, external: false,
    links: note.outgoing.map(graphPath), backlinks: note.backlinks.map(graphPath), tags: note.tags,
  }]));
}
