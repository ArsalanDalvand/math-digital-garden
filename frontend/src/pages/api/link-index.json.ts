import type { APIRoute } from 'astro';
import { LRUCache } from 'lru-cache';
import { getKnowledgeIndex } from '../../lib/catalogue.mjs';

export const prerender = false;

const serializedLinkIndexCache = new LRUCache<string, string>({ max: 4 });

export const GET: APIRoute = async ({ request }) => {
  try {
    const index = await getKnowledgeIndex();
    const etag = `W/"links-${index.version}"`;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ETag: etag,
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    };
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }
    let body = serializedLinkIndexCache.get(index.version);
    if (!body) {
      body = JSON.stringify(
        index.notes.map((n) => ({ slug: n.slug, title: n.title, aliases: n.aliases }))
      );
      serializedLinkIndexCache.set(index.version, body);
    }
    return new Response(body, { status: 200, headers });
  } catch {
    return Response.json(
      { detail: 'Link index unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
};
