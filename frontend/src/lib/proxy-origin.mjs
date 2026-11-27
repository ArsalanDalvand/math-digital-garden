/**
 * Verify reverse-proxy-safe CSRF header + Origin allowlist for state-changing Astro routes.
 * @param {{
 *   method: string;
 *   url: string;
 *   xRequestedWith: string | null;
 *   origin: string | null;
 *   host?: string | null;
 *   forwardedHost?: string | null;
 *   frontendOrigin?: string;
 *   siteUrl?: string;
 * }} info
 * @returns {boolean}
 */
export function isAllowedWriteOrigin(info) {
  if (['GET', 'HEAD'].includes(info.method)) return true;
  if (info.xRequestedWith !== 'MathGarden') return false;
  if (!info.origin) return true;

  const incoming = new URL(info.url);
  const proxyHost = (info.forwardedHost || info.host || '').trim();
  const allowed = new Set([
    incoming.origin,
    'http://localhost',
    'http://localhost:4321',
    'http://127.0.0.1:4321',
    (info.frontendOrigin || '').replace(/\/+$/, ''),
    (info.siteUrl || '').replace(/\/+$/, ''),
    proxyHost ? `http://${proxyHost}` : '',
    proxyHost ? `https://${proxyHost}` : '',
  ]);
  return allowed.has(info.origin.replace(/\/+$/, ''));
}

/**
 * Check an Astro/Fetch Request against the reverse-proxy-safe write origin allowlist.
 * @param {Request} request
 * @returns {boolean}
 */
export function isAllowedRequestOrigin(request) {
  return isAllowedWriteOrigin({
    method: request.method,
    url: request.url,
    xRequestedWith: request.headers.get('x-requested-with'),
    origin: request.headers.get('origin'),
    host: request.headers.get('host'),
    forwardedHost: request.headers.get('x-forwarded-host'),
    frontendOrigin: process.env.FRONTEND_ORIGIN || '',
    siteUrl: process.env.SITE_URL || '',
  });
}
