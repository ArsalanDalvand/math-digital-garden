import type { APIRoute } from 'astro';
import { LRUCache } from 'lru-cache';
import { getKnowledgeIndex } from '../../lib/catalogue.mjs';
import { graphSitemap } from '../../lib/graph.mjs';

export const prerender = false;

const serializedGraphCache = new LRUCache<string, string>({ max: 4 });

function resolveOrigin(): string {
  return process.env.API_BASE_URL || import.meta.env.API_BASE_URL || 'http://127.0.0.1:8000';
}

function isValidGraphSitemap(data: unknown, etag: string | null): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const record = data as Record<string, unknown>;
  if (typeof record.slug === 'string') return false;
  if (etag?.startsWith('W/"graph-pg-')) return true;
  const values = Object.values(record);
  if (values.length === 0) return false;
  return values.slice(0, 5).every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      Array.isArray((entry as Record<string, unknown>).links) &&
      Array.isArray((entry as Record<string, unknown>).backlinks)
  );
}

export const GET: APIRoute = async ({ request }) => {
  const ifNoneMatch = request.headers.get('if-none-match');
  try {
    const upstream = await fetch(`${resolveOrigin()}/api/graph`, {
      headers: ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : undefined,
      signal: AbortSignal.timeout(3000),
    });
    if (upstream.status === 304) {
      const headers = new Headers({
        'Cache-Control': upstream.headers.get('cache-control') || 'public, max-age=60, stale-while-revalidate=300',
      });
      const etag = upstream.headers.get('etag');
      if (etag) headers.set('ETag', etag);
      return new Response(null, { status: 304, headers });
    }
    if (upstream.ok) {
      const upstreamEtag = upstream.headers.get('etag');
      const data = await upstream.json();
      if (isValidGraphSitemap(data, upstreamEtag)) {
        const headers = new Headers({
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': upstream.headers.get('cache-control') || 'public, max-age=60, stale-while-revalidate=300',
        });
        if (upstreamEtag) headers.set('ETag', upstreamEtag);
        return new Response(JSON.stringify(data), { status: 200, headers });
      }
    }
  } catch {
    // Fall back to cached note index when PostgreSQL discovery endpoint is unavailable.
  }

  try {
    const index = await getKnowledgeIndex();
    const etag = `W/"graph-${index.version}"`;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ETag: etag,
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    };
    if (ifNoneMatch === etag) {
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
