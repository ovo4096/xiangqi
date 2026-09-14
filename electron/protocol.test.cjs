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

function makeWavFixture() {
  const wav = Buffer.alloc(44 + 800);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(44100, 24);
  wav.writeUInt32LE(44100 * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let offset = 44; offset < wav.length; offset += 2) wav.writeInt16LE((offset * 79) % 32000, offset);
  return wav;
}

test('packaged WAV, image and module GET/HEAD responses expose full asset size', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xiangqi-media-'));
  try {
    const fixtures = [
      ['music.wav', makeWavFixture(), 'audio/wav'],
      ['portrait.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'],
      ['index.js', Buffer.from('export const title = "弈境";'), 'text/javascript; charset=utf-8'],
    ];
    for (const [name, body, mime] of fixtures) {
      await fs.writeFile(path.join(temporaryRoot, name), body);
      const url = `app://xiangqi/${name}`;
      const response = await serveAppRequest(temporaryRoot, { url, method: 'GET' });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Type'), mime);
      assert.equal(response.headers.get('Content-Length'), String(body.length));
      assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
      assert.equal(response.headers.get('Content-Range'), null);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), body);

      const head = await serveAppRequest(temporaryRoot, { url, method: 'HEAD', headers: new Headers({ Range: 'bytes=44-99' }) });
      assert.equal(head.status, 200);
      assert.equal(head.headers.get('Content-Type'), mime);
      assert.equal(head.headers.get('Content-Length'), String(body.length));
      assert.equal(head.headers.get('Accept-Ranges'), 'bytes');
      assert.equal(head.headers.get('Content-Range'), null);
      assert.equal(head.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
      assert.equal(head.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal((await head.arrayBuffer()).byteLength, 0);
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('WAV byte ranges return exact header, bounded PCM, open-ended and suffix portions', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xiangqi-range-'));
  try {
    const wav = makeWavFixture();
    await fs.writeFile(path.join(temporaryRoot, 'music.wav'), wav);
    const cases = [
      ['bytes=0-43', 0, 43],
      ['bytes=44-127', 44, 127],
      ['bytes=44-44', 44, 44],
      ['bytes=700-', 700, wav.length - 1],
      ['bytes=-80', wav.length - 80, wav.length - 1],
      ['bytes=800-999', 800, wav.length - 1],
      ['bytes=-999999999999999999999999', 0, wav.length - 1],
      ['bytes=800-999999999999999999999999', 800, wav.length - 1],
      ['bytes=0-', 0, wav.length - 1],
    ];
    for (const [range, start, end] of cases) {
      const response = await serveAppRequest(temporaryRoot, {
        url: 'app://xiangqi/music.wav', method: 'GET', headers: new Headers({ Range: range }),
      });
      assert.equal(response.status, 206, range);
      assert.equal(response.headers.get('Content-Type'), 'audio/wav');
      assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
      assert.equal(response.headers.get('Content-Length'), String(end - start + 1));
      assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/${wav.length}`);
      assert.equal(response.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), wav.subarray(start, end + 1), range);
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('invalid or unsatisfiable byte ranges return 416 with the actual representation size', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xiangqi-invalid-range-'));
  try {
    const wav = makeWavFixture();
    await fs.writeFile(path.join(temporaryRoot, 'music.wav'), wav);
    for (const range of [
      `bytes=${wav.length}-`, 'bytes=999999999999999999999999-', 'bytes=99-44',
      'bytes=-0', 'bytes=-', 'bytes=one-two', 'bytes=0-5,20-30', 'items=0-4', '',
    ]) {
      const response = await serveAppRequest(temporaryRoot, {
        url: 'app://xiangqi/music.wav', method: 'GET', headers: new Headers({ Range: range }),
      });
      assert.equal(response.status, 416, range);
      assert.equal(response.headers.get('Content-Range'), `bytes */${wav.length}`);
      assert.equal(response.headers.get('Content-Length'), '0');
      assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
      assert.equal(response.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
      assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.equal((await response.arrayBuffer()).byteLength, 0);
    }
    const denied = await serveAppRequest(temporaryRoot, {
      url: 'app://xiangqi/../music.wav', method: 'GET', headers: new Headers({ Range: 'bytes=0-43' }),
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('Content-Range'), null);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
