import type { APIRoute } from 'astro';

export const ALL: APIRoute = async ({request, params, clientAddress}) => {
  const path = params.path ?? '';
  if (!/^(auth|account|library|workspace|proposals|review|ai|notes)(\/[^?#]*)?$/.test(path) || path.includes('..')) {
    return new Response(null, {status:404});
  }
  const incoming = new URL(request.url);
  const reqOrigin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const allowed = new Set([
    incoming.origin,
    'http://localhost',
    'http://localhost:4321',
    'http://127.0.0.1:4321',
    (process.env.FRONTEND_ORIGIN || '').replace(/\/+$/, ''),
    (process.env.SITE_URL || '').replace(/\/+$/, ''),
    host ? `http://${host}` : '',
    host ? `https://${host}` : '',
  ]);
  if (!['GET','HEAD'].includes(request.method) &&
      (request.headers.get('x-requested-with') !== 'MathGarden' ||
       (reqOrigin && !allowed.has(reqOrigin.replace(/\/+$/, ''))))) {
    return Response.json({detail:'Origin not allowed'}, {status:403});
  }
  const origin = process.env.API_BASE_URL || import.meta.env.API_BASE_URL || 'http://127.0.0.1:8000';
  const headers = new Headers({'Accept':'application/json'});
  for (const name of ['cookie','content-type','x-requested-with','origin','accept']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Forward client IP to prevent DoS lockouts in rate limiting
  const incomingXff = request.headers.get('x-forwarded-for');
  const clientIp = incomingXff ? `${incomingXff}, ${clientAddress || '127.0.0.1'}` : (clientAddress || request.headers.get('x-real-ip') || '127.0.0.1');
  headers.set('x-forwarded-for', clientIp);
  headers.set('x-real-ip', (incomingXff ? incomingXff.split(',')[0].trim() : (clientAddress || '127.0.0.1')));
  headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''));
  if (host) headers.set('x-forwarded-host', host);

  try {
    const body = ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
    const limit=/^library\/items\/[0-9a-f-]{36}\/attachments$/.test(path)?7_100_000:4_500_000;
    if (body && body.byteLength > limit) return Response.json({detail:'Request too large'}, {status:413});
    const upstream = await fetch(`${origin}/api/${path}${incoming.search}`, {
      method:request.method, headers, body, redirect:'manual', signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)]),
    });
    const outgoing = new Headers({'Cache-Control':'no-store'});
    for (const name of ['content-type','content-disposition','x-content-type-options','content-security-policy','set-cookie','retry-after','x-accel-buffering']) {
      const value = upstream.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(upstream.body, {status:upstream.status, headers:outgoing});
  } catch {
    return Response.json({detail:'Service temporarily unavailable'}, {status:503, headers:{'Cache-Control':'no-store'}});
  }
};
