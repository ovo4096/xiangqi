'use strict';

// This harness is loaded only by the explicit --smoke-test main-process flag.
// Production renderer bundles contain no test hooks, preload, or IPC bridge.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

function initialBoardFixture() {
  const board = [];
  const backRank = ['rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook'];
  for (const side of ['black', 'red']) {
    backRank.forEach((type, x) => board.push({ id: `${side}-${type}-${x}`, side, type, x, y: side === 'black' ? 0 : 9 }));
    for (const x of [1, 7]) board.push({ id: `${side}-cannon-${x}`, side, type: 'cannon', x, y: side === 'black' ? 2 : 7 });
    for (const x of [0, 2, 4, 6, 8]) board.push({ id: `${side}-pawn-${x}`, side, type: 'pawn', x, y: side === 'black' ? 3 : 6 });
  }
  return board;
}

async function runSmokeTest({ app, window, distPath, url }) {
  const directory = path.resolve(process.env.YIJING_SMOKE_DIR || path.join(process.cwd(), '.local-artifacts'));
  await fs.mkdir(directory, { recursive: true });
  const report = { success: false, version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, startedAt: new Date().toISOString(), checks: {}, consoleErrors: [] };
  const page = window.webContents;
  let deadline;
  page.on('console-message', event => {
    if (event.level === 'error') report.consoleErrors.push(event.message);
  });
  page.on('render-process-gone', (_event, details) => { report.rendererExit = details; });
  const execute = expression => page.executeJavaScript(expression, true);
  const waitFor = (expression, timeout = 20000) => execute(`new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      let value;
      try { value = (${expression}); } catch (error) { reject(error); return; }
      if (value) resolve(true);
      else if (Date.now() - started > ${timeout}) reject(new Error('Condition timed out: ' + ${JSON.stringify(expression)}));
      else setTimeout(check, 50);
    };
    check();
  })`);
  const key = async keyName => {
    await execute(`(() => {
      const scene = document.querySelector('.scene');
      scene.focus();
      scene.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(keyName)}, bubbles: true }));
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
  };
  const clickText = text => execute(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) throw new Error('Missing enabled button: ' + ${JSON.stringify(text)});
    button.click();
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);

  try {
    await Promise.race([
      (async () => {
        await window.loadURL(url);
        await waitFor("document.querySelector('.scene canvas') || document.querySelector('.scene-error')");
        await execute('document.fonts.ready.then(() => true)');
        report.checks.initialView = await execute(`(() => {
          const canvas = document.querySelector('.scene canvas');
          const gl = canvas?.getContext('webgl2');
          const sceneError = document.querySelector('.scene-error')?.textContent || '';
          return {
            title: document.title, url: location.href, canvas: !!canvas,
            width: canvas?.width, height: canvas?.height,
            webgl: !!gl && !gl.isContextLost(), webglVersion: gl?.getParameter(gl.VERSION),
            sceneError, nodeAvailable: typeof window.require !== 'undefined' || typeof window.process !== 'undefined',
            fontsLoaded: document.fonts.status === 'loaded',
          };
        })()`);
        assert.equal(report.checks.initialView.canvas, true, '3D canvas did not load');
        assert.equal(report.checks.initialView.webgl, true, 'WebGL2 context did not initialize');
        assert.equal(report.checks.initialView.sceneError, '', '3D error screen shown');
        assert.equal(report.checks.initialView.nodeAvailable, false, 'Renderer unexpectedly exposes Node.js');
        assert.ok(report.checks.initialView.width > 300 && report.checks.initialView.height > 300);
        assert.equal(window.isVisible(), false, 'Smoke window must remain hidden');

        const screenshot = await page.capturePage({ x: 0, y: 0, width: window.getContentSize()[0], height: window.getContentSize()[1] }, { stayHidden: true, stayAwake: true });
        await fs.writeFile(path.join(directory, 'electron-smoke.png'), screenshot.toPNG());
        const sceneRect = await execute(`(() => { const r = document.querySelector('.scene').getBoundingClientRect(); return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.floor(r.width), height: Math.floor(r.height) }; })()`);
        const boardScreenshot = await page.capturePage(sceneRect, { stayHidden: true, stayAwake: true });
        const pixels = boardScreenshot.toBitmap();
        let woodPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          // NativeImage bitmap pixels are BGRA. Wood is visibly warm brown.
          const blue = pixels[i], green = pixels[i + 1], red = pixels[i + 2];
          if (red > 80 && red > green * 1.13 && green > blue * 1.1) woodPixels++;
        }
        report.checks.renderedWoodPixels = woodPixels;
        assert.ok(woodPixels > 2000, 'The composed board image does not contain visible wood geometry');

        const assets = await fs.readdir(path.join(distPath, 'assets'));
        const workerAsset = assets.find(name => /^ai\.worker-[\w-]+\.js$/.test(name));
        assert.ok(workerAsset, 'Built NPC module worker asset missing');
        const board = initialBoardFixture();
        report.checks.moduleWorker = await execute(`new Promise((resolve, reject) => {
          const worker = new Worker(${JSON.stringify(`${url}assets/${workerAsset}`)}, { type: 'module' });
          const timeout = setTimeout(() => { worker.terminate(); reject(new Error('NPC worker timed out')); }, 15000);
          worker.onmessage = event => { clearTimeout(timeout); worker.terminate(); resolve(event.data); };
          worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message || 'NPC worker failed')); };
          worker.postMessage(${JSON.stringify({ board, difficulty: 'easy' })});
        })`);
        const move = report.checks.moduleWorker.move;
        assert.ok(move && board.some(piece => piece.id === move.pieceId && piece.side === 'black'), 'NPC did not return a black move');
        assert.ok(Number.isInteger(move.to.x) && move.to.x >= 0 && move.to.x <= 8 && Number.isInteger(move.to.y) && move.to.y >= 0 && move.to.y <= 9);
        assert.ok(!board.some(piece => piece.side === 'black' && piece.x === move.to.x && piece.y === move.to.y), 'NPC moved onto its own piece');

        // Exercise the real game state through its public keyboard controls.
        for (const keyName of ['Escape', 'Enter', 'ArrowUp', 'Enter']) await key(keyName);
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '02 步' && document.querySelector('.status-top strong')?.textContent === '红方行棋'");
        report.checks.npcGame = await execute("({ moves: document.querySelector('.move-count').textContent, history: document.querySelector('.move-history').textContent })");
        await clickText('悔棋');
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '00 步'");
        report.checks.undo = true;
        await clickText('双人对战');
        for (const keyName of ['Escape', 'Enter', 'ArrowUp', 'Enter']) await key(keyName);
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '01 步' && document.querySelector('.status-top strong')?.textContent === '黑方行棋'");
        for (const keyName of ['ArrowUp', 'ArrowUp', 'Enter', 'ArrowDown', 'Enter']) await key(keyName);
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '02 步' && document.querySelector('.status-top strong')?.textContent === '红方行棋'");
        report.checks.localGame = await execute("({ moves: document.querySelector('.move-count').textContent, history: document.querySelector('.move-history').textContent })");

        report.checks.audio = await execute(`(async () => {
          const context = new AudioContext();
          await context.resume();
          const state = context.state;
          await context.close();
          return state;
        })()`);
        assert.equal(report.checks.audio, 'running');

        // Verify CSP behavior itself, without making an actual outbound request.
        report.checks.csp = await execute(`new Promise(async (resolve, reject) => {
          const violations = [];
          const listener = event => violations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
          document.addEventListener('securitypolicyviolation', listener);
          const script = document.createElement('script');
          script.textContent = 'document.documentElement.dataset.inlineScriptRan = "yes"';
          document.head.appendChild(script);
          let networkBlocked = false;
          try { await fetch('https://example.invalid/xiangqi-smoke'); } catch { networkBlocked = true; }
          setTimeout(() => {
            script.remove();
            document.removeEventListener('securitypolicyviolation', listener);
            resolve({ inlineScriptBlocked: !document.documentElement.dataset.inlineScriptRan, networkBlocked, violations });
          }, 100);
        })`);
        assert.equal(report.checks.csp.inlineScriptBlocked, true);
        assert.equal(report.checks.csp.networkBlocked, true);
        assert.ok(report.checks.csp.violations.some(item => item.directive === 'script-src-elem'));
        assert.ok(report.checks.csp.violations.some(item => item.directive === 'connect-src'));
        assert.equal(window.isVisible(), false, 'Smoke test displayed a native window');
        report.success = true;
      })(),
      new Promise((_resolve, reject) => { deadline = setTimeout(() => reject(new Error('Electron smoke test exceeded 55 seconds')), 55000); }),
    ]);
  } catch (error) {
    report.error = error.stack || String(error);
  } finally {
    clearTimeout(deadline);
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(directory, 'electron-smoke.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`Electron smoke test ${report.success ? 'passed' : 'failed'}: ${path.join(directory, 'electron-smoke.json')}`);
    if (!report.success) console.error(report.error);
    app.exit(report.success ? 0 : 1);
  }
}

module.exports = { runSmokeTest };
