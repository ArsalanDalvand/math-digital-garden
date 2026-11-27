import type { APIRoute } from 'astro';
import { isAllowedRequestOrigin } from '../../lib/proxy-origin.mjs';

export const ALL: APIRoute = async ({ request, params, clientAddress }) => {
  const path = params.path ?? '';
  if (
    !/^(auth|account|library|workspace|proposals|review|ai|notes|graph|books|search)(\/[^?#]*)?$/.test(
      path,
    ) ||
    path.includes('..')
  ) {
    return new Response(null, { status: 404 });
  }
  const incoming = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!isAllowedRequestOrigin(request)) {
    return Response.json({ detail: 'Origin not allowed' }, { status: 403 });
  }
  const origin =
    process.env.API_BASE_URL || import.meta.env.API_BASE_URL || 'http://127.0.0.1:8000';
  const headers = new Headers({ Accept: 'application/json' });
  for (const name of [
    'cookie',
    'content-type',
    'x-requested-with',
    'origin',
    'accept',
    'if-none-match',
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Forward client IP to prevent DoS lockouts in rate limiting
  const incomingXff = request.headers.get('x-forwarded-for');
  const clientIp = incomingXff
    ? `${incomingXff}, ${clientAddress || '127.0.0.1'}`
    : clientAddress || request.headers.get('x-real-ip') || '127.0.0.1';
  headers.set('x-forwarded-for', clientIp);
  headers.set(
    'x-real-ip',
    incomingXff ? incomingXff.split(',')[0].trim() : clientAddress || '127.0.0.1',
  );
  headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''));
  if (host) headers.set('x-forwarded-host', host);

  try {
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
    const limit =
      path === 'library/import/zip'
        ? 72_000_000
        : /^library\/items\/[0-9a-f-]{36}\/attachments$/.test(path)
          ? 7_100_000
          : 4_500_000;
    if (body && body.byteLength > limit)
      return Response.json({ detail: 'Request too large' }, { status: 413 });
    const upstream = await fetch(`${origin}/api/${path}${incoming.search}`, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)]),
    });
    const isPublicGet =
      request.method === 'GET' && /^(graph|books|search|notes|catalogue)(\/|$)/.test(path);
    const outgoing = new Headers({
      'Cache-Control': isPublicGet
        ? upstream.headers.get('cache-control') || 'public, max-age=60'
        : 'no-store',
    });
    const forwardHeaders = [
      'content-type',
      'content-disposition',
      'x-content-type-options',
      'content-security-policy',
      'retry-after',
      'x-accel-buffering',
      ...(isPublicGet ? ['etag'] : []),
    ];
    for (const name of forwardHeaders) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    const setCookies =
      typeof upstream.headers.getSetCookie === 'function'
        ? upstream.headers.getSetCookie()
        : (() => {
            const single = upstream.headers.get('set-cookie');
            return single ? [single] : [];
          })();
    for (const cookie of setCookies) {
      outgoing.append('set-cookie', cookie);
    }
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    return Response.json(
      { detail: 'Service temporarily unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
