import type { APIRoute } from 'astro';
import { LRUCache } from 'lru-cache';
import { fetchNoteMeta } from '../../lib/catalogue.mjs';
import { folderTree } from '../../lib/folder-tree.mjs';

export const prerender = false;

const serializedTreeCache = new LRUCache<string, string>({ max: 4 });

export const GET: APIRoute = async ({ request }) => {
  try {
    const { etag, items } = await fetchNoteMeta();
    const cleanEtag = etag.replace(/^W\/"|"$/g, '');
    const treeEtag = `W/"tree-${cleanEtag}"`;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ETag: treeEtag,
      'Cache-Control': 'no-cache',
    };
    if (request.headers.get('if-none-match') === treeEtag) {
      return new Response(null, { status: 304, headers });
    }
    let body = serializedTreeCache.get(etag);
    if (!body) {
      body = JSON.stringify(folderTree(items));
      serializedTreeCache.set(etag, body);
    }
    return new Response(body, { status: 200, headers });
  } catch {
    return Response.json(
      { detail: 'دریافت کتابخانه انجام نشد؛ دوباره تلاش کنید.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
};
