'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { CONTENT_SECURITY_POLICY, isAppNavigation, resolveAppRequest, serveAppRequest } = require('./protocol.cjs');
const root = path.resolve('dist');

test('app protocol resolves the entry point, module worker and local font', () => {
  assert.equal(resolveAppRequest(root, 'app://xiangqi/').filePath, path.join(root, 'index.html'));
  assert.equal(resolveAppRequest(root, 'app://xiangqi/assets/ai.worker-a1.js?v=1').mime, 'text/javascript; charset=utf-8');
  assert.equal(resolveAppRequest(root, 'app://xiangqi/assets/font.woff2', 'HEAD').status, 200);
});

test('app protocol rejects traversal, Windows device paths, invalid encodings and foreign origins', () => {
  const denied = [
    'app://xiangqi/../package.json', 'app://xiangqi/%2e%2e/package.json',
    'app://xiangqi/assets/%2e%2e/secret.js', 'app://xiangqi/%252e%252e/secret.js',
    'app://xiangqi/%2fC:/Windows/system.ini', 'app://xiangqi/assets%5c..%5csecret.js',
    'app://xiangqi//server/share.js', 'app://xiangqi/assets/x.js%00',
    'app://xiangqi/assets/%ZZ.js', 'app://xiangqi/C:/secret.js',
    'app://xiangqi/assets/x.js:stream', 'app://xiangqi/assets/x.js.',
    'app://xiangqi/assets/x.js%20', 'app://xiangqi/./assets/x.js',
    'app://xiangqi.evil/assets/x.js', 'app://evil/assets/x.js',
    'app://user@xiangqi/assets/x.js', 'app://xiangqi:123/assets/x.js',
    'https://xiangqi/assets/x.js', 'file:///C:/secret.js',
  ];
  for (const url of denied) assert.equal(resolveAppRequest(root, url).status, 403, url);
});

test('app protocol limits request methods and executable asset types', () => {
  assert.equal(resolveAppRequest(root, 'app://xiangqi/', 'POST').status, 405);
  assert.equal(resolveAppRequest(root, 'app://xiangqi/main.cjs').status, 404);
  assert.equal(resolveAppRequest(root, 'app://xiangqi/source.ts').status, 404);
  assert.equal(resolveAppRequest(root, 'app://xiangqi/.env').status, 404);
});

test('navigation permits only the app document', () => {
  assert.equal(isAppNavigation('app://xiangqi/'), true);
  assert.equal(isAppNavigation('app://xiangqi/index.html'), true);
  for (const url of ['app://xiangqi/assets/index.js', 'https://example.com', 'file:///secret.html', 'app://xiangqi/../index.html']) {
    assert.equal(isAppNavigation(url), false, url);
  }
});

test('response serves local modules with CSP and never falls back on missing assets', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xiangqi-protocol-'));
  try {
    await fs.writeFile(path.join(temporaryRoot, 'index.html'), '<!doctype html><title>弈境</title>');
    const response = await serveAppRequest(temporaryRoot, { url: 'app://xiangqi/', method: 'GET' });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /弈境/);
    assert.equal(response.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal((await serveAppRequest(temporaryRoot, { url: 'app://xiangqi/', method: 'HEAD' })).status, 200);
    assert.equal(await (await serveAppRequest(temporaryRoot, { url: 'app://xiangqi/', method: 'HEAD' })).text(), '');
    assert.equal((await serveAppRequest(temporaryRoot, { url: 'app://xiangqi/missing.js', method: 'GET' })).status, 404);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('response rejects a directory junction that escapes packaged dist', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xiangqi-containment-'));
  try {
    const inside = path.join(temporaryRoot, 'dist');
    const outside = path.join(temporaryRoot, 'outside');
    await fs.mkdir(inside);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'secret.js'), 'sensitive');
    await fs.symlink(outside, path.join(inside, 'assets'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal((await serveAppRequest(inside, { url: 'app://xiangqi/assets/secret.js', method: 'GET' })).status, 403);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
