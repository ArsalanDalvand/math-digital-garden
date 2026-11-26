import fs from 'node:fs';
import path from 'node:path';
import type { APIRoute } from 'astro';

export const prerender = false;

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ggb': 'application/vnd.geogebra.file',
  '.pdf': 'application/pdf',
  '.canvas': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
};

function resolveAssetRoots(): string[] {
  const roots: string[] = [];
  const envDir = (process.env.VAULT_ASSETS_DIR || '').trim();
  if (envDir) roots.push(envDir);
  roots.push(path.resolve(process.cwd(), 'public/vault'));
  roots.push(path.resolve(process.cwd(), 'frontend/public/vault'));
  return [...new Set(roots)];
}

function validateRelativeSegments(rawPath: string): string[] | null {
  if (!rawPath || rawPath.includes('\0') || rawPath.includes('\\')) return null;
  const parts = rawPath.split('/');
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part.startsWith('.')) {
      return null;
    }
  }
  return parts;
}

function findSafeVaultFile(segments: string[]): { fullPath: string; stat: fs.Stats } | null {
  for (const root of resolveAssetRoots()) {
    if (!fs.existsSync(root)) continue;
    let realRoot: string;
    try {
      realRoot = fs.realpathSync(root);
    } catch {
      continue;
    }
    const candidate = path.join(root, ...segments);
    if (!fs.existsSync(candidate)) continue;
    let realFile: string;
    try {
      realFile = fs.realpathSync(candidate);
    } catch {
      continue;
    }
    const rootWithSep = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`;
    if (!realFile.startsWith(rootWithSep)) continue;
    const stat = fs.statSync(realFile);
    if (!stat.isFile()) continue;
    return { fullPath: realFile, stat };
  }
  return null;
}

function serveVaultAsset(request: Request, rawPath: string, headOnly: boolean): Response {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return new Response(null, { status: 400 });
  }
  const segments = validateRelativeSegments(decoded);
  if (!segments) {
    return new Response(null, { status: 404 });
  }
  const found = findSafeVaultFile(segments);
  if (!found) {
    return new Response(null, { status: 404 });
  }

  const ext = path.extname(found.fullPath).toLowerCase();
  const contentType = MIME_TYPES[ext];
  if (!contentType) {
    return new Response(null, { status: 404 });
  }

  const etag = `W/"${found.stat.size}-${Math.trunc(found.stat.mtimeMs)}"`;
  const headers = new Headers({
    'Content-Type': contentType,
    ETag: etag,
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  if (headOnly) {
    headers.set('Content-Length', String(found.stat.size));
    return new Response(null, { status: 200, headers });
  }

  const bytes = fs.readFileSync(found.fullPath);
  return new Response(bytes, { status: 200, headers });
}

export const GET: APIRoute = async ({ request, params }) =>
  serveVaultAsset(request, params.path ?? '', false);

export const HEAD: APIRoute = async ({ request, params }) =>
  serveVaultAsset(request, params.path ?? '', true);
