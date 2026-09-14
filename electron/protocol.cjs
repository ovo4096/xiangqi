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

/** A single byte range, with inclusive endpoints (RFC 9110, section 14). */
function parseByteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  // Compare decimal ranges as integers before converting offsets to Numbers:
  // enormous client-provided endpoints must not wrap or lose precision.
  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return null;
    return { start: Number(suffix >= length ? 0n : length - suffix), end: size - 1 };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || end < start) return null;
  return { start: Number(start), end: Number(end >= length ? length - 1n : end) };
}

async function readByteRange(filePath, start, length) {
  const file = await fs.open(filePath, 'r');
  try {
    const body = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const { bytesRead } = await file.read(body, offset, length - offset, start + offset);
      if (!bytesRead) throw new Error('Packaged asset ended before its declared length');
      offset += bytesRead;
    }
    return body;
  } finally {
    await file.close();
  }
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
    headers['Accept-Ranges'] = 'bytes';
    headers['Content-Length'] = String(stat.size);
    // HEAD carries the full representation metadata and ignores Range.
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    const rangeValue = request.headers?.get?.('range') ?? request.headers?.range ?? request.headers?.Range;
    // The HTTP specification permits ignoring Range for an empty resource.
    if (rangeValue != null && stat.size > 0) {
      const range = parseByteRange(rangeValue, stat.size);
      if (!range) {
        headers['Content-Range'] = `bytes */${stat.size}`;
        headers['Content-Length'] = '0';
        return new Response(null, { status: 416, headers });
      }
      const length = range.end - range.start + 1;
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
      headers['Content-Length'] = String(length);
      const body = await readByteRange(realFile, range.start, length);
      return new Response(body, { status: 206, headers });
    }
    const body = await fs.readFile(realFile);
    return new Response(body, { status: 200, headers });
  } catch {
    delete headers['Content-Length'];
    delete headers['Content-Range'];
    return new Response(null, { status: 404, headers });
  }
}

module.exports = { APP_URL, CONTENT_SECURITY_POLICY, isAppNavigation, resolveAppRequest, serveAppRequest };
