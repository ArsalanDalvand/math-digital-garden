import type { APIRoute } from 'astro';
import { getKnowledgeIndex } from '../../lib/catalogue.mjs';
import { renderNoteWithIndex } from '../../lib/markdown.mjs';
import { previewBlocks } from '../../lib/preview-blocks.mjs';

export const POST: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  if (
    request.headers.get('x-requested-with') !== 'MathGarden' ||
    (request.headers.has('origin') && request.headers.get('origin') !== url.origin)
  ) {
    return new Response(null, { status: 403 });
  }
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const origin = process.env.API_BASE_URL || import.meta.env.API_BASE_URL || 'http://127.0.0.1:8000';
    const auth = await fetch(`${origin}/api/auth/me`, {
      headers: { Cookie: request.headers.get('cookie') ?? '' },
      signal: AbortSignal.timeout(5000),
    });
    if (!auth.ok) return new Response(null, { status: auth.status, headers });
    const body = await request.text();
    if (body.length > 2_000_000) return new Response(null, { status: 413, headers });
    const index = await getKnowledgeIndex();
    const blocks =
      request.headers.get('x-preview-blocks') === '1'
        ? await Promise.all(
            previewBlocks(body)
              .slice(0, 128)
              .map(async ({ raw }) => ({ raw, html: await renderNoteWithIndex(raw, index) }))
          )
        : undefined;
    return Response.json({ html: await renderNoteWithIndex(body, index), blocks }, { headers });
  } catch {
    return Response.json({ detail: 'Preview unavailable' }, { status: 503, headers });
  }
};
