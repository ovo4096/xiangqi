'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');

const APP_URL = 'app://xiangqi/';
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
]);

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Resolve only packaged web assets, without allowing Windows paths or traversal. */
function resolveAppRequest(root, requestUrl, method = 'GET') {
  if (method !== 'GET' && method !== 'HEAD') return { status: 405 };
  try {
    if (typeof requestUrl !== 'string' || /[\\\u0000-\u0020\u007f]/.test(requestUrl)) return { status: 403 };
    const url = new URL(requestUrl);
    if (url.protocol !== 'app:' || url.hostname !== 'xiangqi' || url.port || url.username || url.password) return { status: 403 };
    // Inspect the original path too: URL parsing normalizes literal ../ segments.
    const rawPath = requestUrl.match(/^app:\/\/xiangqi(\/[^?#]*)?(?:[?#]|$)/i)?.[1] || '/';
    const decoded = decodeURIComponent(rawPath);
    if (/[\\%:\u0000-\u001f\u007f]/.test(decoded)) return { status: 403 };
    const segments = decoded.split('/');
    if (segments.some(segment => segment === '..' || segment === '.' || /[. ]$/.test(segment))) return { status: 403 };
    const asset = decoded === '/' ? 'index.html' : decoded.slice(1);
    if (!asset || asset.startsWith('/') || asset.includes('//')) return { status: 403 };
    const mime = MIME_TYPES.get(path.extname(asset).toLowerCase());
    if (!mime) return { status: 404 };
    const filePath = path.resolve(root, asset);
    if (!isWithin(path.resolve(root), filePath)) return { status: 403 };
    return { status: 200, filePath, mime };
  } catch {
    return { status: 403 };
  }
}

function isAppNavigation(requestUrl) {
  const resolved = resolveAppRequest(path.resolve('.'), requestUrl);
  if (resolved.status !== 200) return false;
  const url = new URL(requestUrl);
  return url.pathname === '/' || url.pathname === '/index.html';
}

async function serveAppRequest(root, request) {
  const headers = {
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-cache',
  };
  const resolved = resolveAppRequest(root, request.url, request.method);
  if (resolved.status !== 200) return new Response(null, { status: resolved.status, headers });
  try {
    const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(resolved.filePath)]);
    if (!isWithin(realRoot, realFile)) return new Response(null, { status: 403, headers });
    const stat = await fs.stat(realFile);
    if (!stat.isFile()) return new Response(null, { status: 404, headers });
    headers['Content-Type'] = resolved.mime;
    const body = request.method === 'HEAD' ? null : await fs.readFile(realFile);
    return new Response(body, { status: 200, headers });
  } catch {
    return new Response(null, { status: 404, headers });
  }
}

module.exports = { APP_URL, CONTENT_SECURITY_POLICY, isAppNavigation, resolveAppRequest, serveAppRequest };
