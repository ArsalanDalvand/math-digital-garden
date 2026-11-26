import type { APIRoute } from 'astro';
import { LRUCache } from 'lru-cache';
import { getKnowledgeIndex } from '../../lib/catalogue.mjs';
import { graphSitemap } from '../../lib/graph.mjs';

export const prerender = false;

const serializedGraphCache = new LRUCache<string, string>({ max: 4 });

export const GET: APIRoute = async ({ request }) => {
  try {
    const index = await getKnowledgeIndex();
    const etag = `W/"graph-${index.version}"`;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ETag: etag,
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    };
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }
    let body = serializedGraphCache.get(index.version);
    if (!body) {
      body = JSON.stringify(graphSitemap(index.notes));
      serializedGraphCache.set(index.version, body);
    }
    return new Response(body, { status: 200, headers });
  } catch {
    return Response.json(
      { detail: 'Graph data unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
};
