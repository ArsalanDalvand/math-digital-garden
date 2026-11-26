import type { APIRoute } from 'astro';
import { getKnowledgeIndex } from '../../../lib/catalogue.mjs';
import { noteHref, RENDERER_VERSION, renderSingleNote } from '../../../lib/markdown.mjs';

export const prerender = false;

const SLUG_RE = /^[\p{L}\p{N}_-]{1,255}$/u;

export const GET: APIRoute = async ({ params, request }) => {
  const slug = params.slug ?? '';
  if (!SLUG_RE.test(slug)) {
    return Response.json({ detail: 'Invalid slug' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const url = new URL(request.url);
  const rawRef = url.searchParams.get('ref') ?? '';
  const ref = rawRef && SLUG_RE.test(rawRef) ? rawRef : '';

  try {
    const index = await getKnowledgeIndex();
    const note = index.bySlug.get(slug);
    if (!note) {
      return Response.json({ detail: 'Note not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    const etag = `W/"prev-${RENDERER_VERSION}-${encodeURIComponent(note.slug)}-${note.current_hash || 'nh'}-${encodeURIComponent(ref)}-${index.namesFingerprint}"`;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ETag: etag,
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    };
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }

    const rendered = await renderSingleNote(note, index);
    const html = (ref && rendered.referencePreviews[ref]) || rendered.previewHtml;
    return Response.json(
      {
        slug: note.slug,
        title: note.title,
        href: noteHref(note.slug),
        kind: note.kind,
        slogan: note.slogan_fa,
        html,
      },
      { status: 200, headers }
    );
  } catch {
    return Response.json(
      { detail: 'Preview unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
};
