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
  // Exercise actual playback without sending test music or move sounds to speakers.
  page.setAudioMuted(true);
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
      const key = ${JSON.stringify(keyName)};
      const caption = () => document.querySelector('.keyboard-caption')?.textContent || '';
      const previous = caption().match(/第 ([0-9]+) 列 · 第 ([0-9]+) 行/);
      let x = previous ? Number(previous[1]) - 1 : 4;
      let y = previous ? Number(previous[2]) - 1 : 6;
      const previousMoves = document.querySelector('.move-count')?.textContent;
      const previousStatus = document.querySelector('.status-section p')?.textContent;
      if (key === 'ArrowLeft') x = Math.max(0, x - 1);
      if (key === 'ArrowRight') x = Math.min(8, x + 1);
      if (key === 'ArrowUp') y = Math.max(0, y - 1);
      if (key === 'ArrowDown') y = Math.min(9, y + 1);
      scene.focus();
      scene.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      // Hidden windows may run animation frames at 1 Hz. Wait for the actual
      // accessible game-state update instead of waiting for WebGL to repaint.
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const check = () => {
          const cursorReady = key === 'Escape' ? !caption() : caption().startsWith('第 ' + (x + 1) + ' 列 · 第 ' + (y + 1) + ' 行');
          const actionReady = key !== 'Enter' || document.querySelector('.move-count')?.textContent !== previousMoves || document.querySelector('.status-section p')?.textContent !== previousStatus;
          if (cursorReady && actionReady) resolve(true);
          else if (Date.now() - started > 5000) reject(new Error('Keyboard state did not settle after ' + key + ': ' + caption()));
          else setTimeout(check, 5);
        };
        setTimeout(check, 0);
      });
    })()`);
  };
  const clickText = text => execute(`(() => {
    const scope = document.querySelector('dialog[open]') || document;
    const button = Array.from(scope.querySelectorAll('button')).find(item => item.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) throw new Error('Missing enabled button: ' + ${JSON.stringify(text)});
    button.click();
    return new Promise(resolve => setTimeout(resolve, 0));
  })()`);
  const clickLabel = label => execute(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find(item => item.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!button || button.disabled) throw new Error('Missing enabled button: ' + ${JSON.stringify(label)});
    button.click();
    return new Promise(resolve => setTimeout(resolve, 0));
  })()`);
  const moveBetween = async (from, to) => {
    await key('Escape');
    const cursor = { x: 4, y: 6 };
    for (const target of [from, to]) {
      while (cursor.x !== target.x) {
        await key(cursor.x < target.x ? 'ArrowRight' : 'ArrowLeft');
        cursor.x += cursor.x < target.x ? 1 : -1;
      }
      while (cursor.y !== target.y) {
        await key(cursor.y < target.y ? 'ArrowDown' : 'ArrowUp');
        cursor.y += cursor.y < target.y ? 1 : -1;
      }
      await key('Enter');
    }
  };
  const setRange = async (label, value) => {
    await execute(`(() => {
      const slider = document.querySelector('input[aria-label="' + ${JSON.stringify(label)} + '"]');
      if (!slider) throw new Error('Missing slider: ' + ${JSON.stringify(label)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, ${JSON.stringify(String(value))});
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      return new Promise(resolve => setTimeout(resolve, 0));
    })()`);
  };
  const checkViewport = async (phase, sizes) => {
    const originalBounds = window.getBounds();
    const originalSize = await execute('[innerWidth, innerHeight]');
    report.checks.viewportFit ||= [];
    try {
      for (const [width, height] of sizes) {
        window.setContentSize(width, height);
        await waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
        const fit = await execute(`new Promise(resolve => setTimeout(() => {
          const selectors = ['.scene', '.new-game', '.status-section', '.move-history', '.captures-section', '.match-actions', '.panel-footer', '.music-player', '.site-footer', '.portrait-stage', '.opponent-controls'];
          const controls = selectors.flatMap(selector => {
            const element = document.querySelector(selector);
            if (!element) return [];
            const r = element.getBoundingClientRect();
            return [{ selector, x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }];
          });
          resolve({ phase: ${JSON.stringify(phase)}, width: innerWidth, height: innerHeight,
            documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
            bodyWidth: document.body.scrollWidth, bodyHeight: document.body.scrollHeight, controls,
            historyKeyboardAccessible: document.querySelector('.move-history')?.tabIndex === 0,
            historyScrollbar: getComputedStyle(document.querySelector('.move-history')).scrollbarWidth,
          });
        }, 100))`);
        report.checks.viewportFit.push(fit);
        assert.ok(fit.documentWidth <= width + 1 && fit.bodyWidth <= width + 1, `${phase} has horizontal page overflow at ${width}x${height}`);
        assert.ok(fit.documentHeight <= height + 1 && fit.bodyHeight <= height + 1, `${phase} has vertical page overflow at ${width}x${height}`);
        for (const control of fit.controls) {
          assert.ok(control.x >= -1 && control.y >= -1 && control.right <= width + 1 && control.bottom <= height + 1 && control.width > 0 && control.height > 0,
            `${phase} control ${control.selector} is outside the viewport at ${width}x${height}: ${JSON.stringify(control)}`);
        }
        assert.ok(fit.controls.find(control => control.selector === '.move-history').height >= 25, `${phase} leaves no usable move history at ${width}x${height}`);
        assert.equal(fit.historyKeyboardAccessible, true, 'Scrollable move history needs keyboard access');
        assert.equal(fit.historyScrollbar, 'none', 'Move history should not show a scrollbar');
      }
    } finally {
      window.setBounds(originalBounds);
      // Native bounds round through the Windows display scale; allow one CSS
      // pixel when restoring the original frame after exact test viewports.
      await waitFor(`Math.abs(innerWidth - ${originalSize[0]}) <= 1 && Math.abs(innerHeight - ${originalSize[1]}) <= 1`);
    }
  };
  const checkVoice = async (name, id) => {
    await waitFor(`(() => {
      const audio = document.querySelector('.character-voice');
      return audio && audio.currentSrc.startsWith(${JSON.stringify(`${url}voices/${id}/intro-`)}) && audio.readyState >= 3 && Number.isFinite(audio.duration) && audio.currentTime > 0.05 && !audio.paused;
    })()`);
    const voice = await execute(`(() => {
      const audio = document.querySelector('.character-voice');
      const portrait = document.querySelector('.portrait-stage');
      const image = portrait?.querySelector('img.is-visible');
      return { name: ${JSON.stringify(name)}, src: audio.currentSrc, duration: audio.duration, time: audio.currentTime,
        volume: audio.volume, error: audio.error?.message || '', caption: document.querySelector('.reaction-bubble p')?.textContent,
        portraitLoaded: !!image?.complete && image.naturalWidth > 0, mood: portrait?.dataset.mood,
        expression: portrait?.dataset.expression, characterCards: document.querySelectorAll('.character-options').length,
        opponent: document.querySelector('.opponent-identity h3')?.textContent,
      };
    })()`);
    report.checks.characterVoices ||= [];
    report.checks.characterVoices.push(voice);
    assert.ok(voice.src.endsWith('.mp3') && voice.duration > 0.5 && voice.duration < 30, 'Local character MP3 did not decode');
    assert.equal(voice.error, '');
    assert.ok(voice.caption && voice.caption.length >= 5, 'Character voice needs a matching visible caption');
    assert.equal(voice.portraitLoaded, true, 'Active opponent portrait did not load');
    assert.ok(voice.mood, 'Active portrait needs a game mood');
    assert.ok(voice.expression, 'Active portrait needs an expression');
    assert.equal(voice.characterCards, 0, 'An active match must not display all three character cards');
    assert.equal(voice.opponent, name);
  };
  const captureRenderedBoard = async label => {
    const started = Date.now();
    let capture, rect, woodPixels = 0, attempts = 0;
    // Chromium's compositor can finish after rAF, especially on headless
    // Windows software rendering following several native window resizes.
    // Verify the composed pixels themselves, retaining the same threshold.
    do {
      rect = await execute(`(() => { const r = document.querySelector('.scene').getBoundingClientRect(); return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.floor(r.width), height: Math.floor(r.height) }; })()`);
      capture = await page.capturePage(rect, { stayHidden: true, stayAwake: true });
      const pixels = capture.toBitmap();
      woodPixels = 0; attempts++;
      for (let i = 0; i < pixels.length; i += 4) {
        const blue = pixels[i], green = pixels[i + 1], red = pixels[i + 2];
        if (red > 80 && red > green * 1.13 && green > blue * 1.1) woodPixels++;
      }
      if (woodPixels > 2000) break;
      // The board renders on demand. Request another real frame through its
      // public view control if the hidden compositor discarded the last one.
      await clickLabel('重置视角');
      await execute('new Promise(resolve => setTimeout(resolve, 250))');
    } while (Date.now() - started < 12000);
    report.checks.boardCaptures ||= {};
    report.checks.boardCaptures[label] = { woodPixels, attempts, elapsedMs: Date.now() - started, rect, bitmapSize: capture.getSize() };
    await fs.writeFile(path.join(directory, `electron-board-${label}.png`), capture.toPNG());
    assert.ok(woodPixels > 2000, `${label} board did not compose visible wood geometry within 12 seconds`);
    return woodPixels;
  };

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
        assert.equal(page.isAudioMuted(), true, 'Smoke test must not play sound to the user');

        await waitFor("document.querySelectorAll('.character-portrait img').length === 3 && [...document.querySelectorAll('.character-portrait img, .npc-avatar')].every(image => image.complete && image.naturalWidth > 0)");
        report.checks.characterPortraits = await execute(`(() => ({
          portraits: [...document.querySelectorAll('.character-portrait img')].map(image => ({ src: image.src, width: image.naturalWidth, height: image.naturalHeight })),
          selected: document.querySelector('.character-option[aria-pressed="true"]')?.getAttribute('aria-label'),
          avatar: document.querySelector('.npc-avatar')?.src,
          opponent: document.querySelector('.player-seat.opponent strong')?.textContent,
        }))()`);
        assert.equal(report.checks.characterPortraits.portraits.length, 3);
        assert.equal(new Set(report.checks.characterPortraits.portraits.map(portrait => portrait.src)).size, 3, 'NPC portraits must be distinct assets');
        assert.ok(report.checks.characterPortraits.portraits.every(portrait => portrait.src.startsWith(`${url}characters/`) && portrait.src.endsWith('.png') && portrait.width > 0 && portrait.height > 0));
        assert.equal(report.checks.characterPortraits.selected, '与沈砚对弈');
        assert.ok(report.checks.characterPortraits.opponent.startsWith('沈砚'));
        assert.equal(report.checks.characterPortraits.avatar, `${url}characters/shen-yan.png`);
        await checkViewport('setup', [[960, 700], [1280, 720], [1380, 900]]);

        const screenshot = await page.capturePage({ x: 0, y: 0, width: window.getContentSize()[0], height: window.getContentSize()[1] }, { stayHidden: true, stayAwake: true });
        await fs.writeFile(path.join(directory, 'electron-smoke.png'), screenshot.toPNG());
        report.checks.renderedWoodPixels = await captureRenderedBoard('initial');

        report.checks.characterSelection = [];
        for (const [name, filename] of [['阿棠', 'a-tang.png'], ['陆隐', 'lu-yin.png'], ['沈砚', 'shen-yan.png']]) {
          await clickLabel(`与${name}对弈`);
          await waitFor(`document.querySelector('.npc-avatar')?.src === ${JSON.stringify(`${url}characters/${filename}`)} && document.querySelector('.npc-avatar')?.naturalWidth > 0`);
          const selected = await execute(`({ selected: document.querySelector('.character-option[aria-pressed="true"]')?.getAttribute('aria-label'), opponent: document.querySelector('.player-seat.opponent strong')?.textContent, count: document.querySelectorAll('.character-portrait img').length, moves: document.querySelector('.move-count')?.textContent.trim() })`);
          assert.equal(selected.selected, `与${name}对弈`);
          assert.ok(selected.opponent.startsWith(name));
          assert.equal(selected.count, 3);
          assert.equal(selected.moves, '00 步');
          report.checks.characterSelection.push(selected);
        }

        // A real board key unlocks local music on the first interaction.
        assert.equal(await execute("document.querySelector('.background-music').paused"), true);
        await key('Escape');
        await waitFor("(() => { const audio = document.querySelector('.background-music'); return audio && audio.readyState >= 3 && !audio.paused && audio.currentTime > 0.1 && !!document.querySelector('[aria-label=\"暂停背景音乐\"]'); })()");
        await waitFor("Number.isFinite(document.querySelector('.background-music').duration)", 5000);
        report.checks.musicPlayback = await execute("(() => { const audio = document.querySelector('.background-music'); return { src: audio.currentSrc, duration: audio.duration, loop: audio.loop, preload: audio.preload, time: audio.currentTime, volume: audio.volume, error: audio.error?.message || '' }; })()");
        assert.equal(report.checks.musicPlayback.src, `${url}music/quiet-pavilion.wav`);
        assert.ok(report.checks.musicPlayback.duration >= 79 && report.checks.musicPlayback.duration <= 81, 'The original 80-second music track did not decode');
        assert.equal(report.checks.musicPlayback.loop, true);
        assert.equal(report.checks.musicPlayback.preload, 'none');
        assert.equal(report.checks.musicPlayback.error, '');
        await waitFor(`document.querySelector('.background-music').currentTime > ${report.checks.musicPlayback.time + 0.2}`);
        const nearEnd = await execute("(() => { const audio = document.querySelector('.background-music'); audio.currentTime = audio.duration - 0.25; return audio.currentTime; })()");
        assert.ok(nearEnd > 78, 'Local music could not seek near its loop boundary');
        await waitFor("(() => { const audio = document.querySelector('.background-music'); return !audio.paused && !audio.ended && audio.currentTime < 2; })()", 5000);
        report.checks.musicPlayback.loopedAtEnd = true;
        await setRange('背景音乐音量', 0.6);
        await waitFor("document.querySelector('.background-music').volume === 0.6 && document.querySelector('.music-volume').textContent === '60%'");
        await clickLabel('关闭音效');
        assert.equal(await execute("!!document.querySelector('[aria-label=\"打开音效\"]') && !document.querySelector('.background-music').paused && document.querySelector('.background-music').volume === 0.6"), true, 'Sound effects toggle must not change music playback or volume');
        await clickLabel('暂停背景音乐');
        await waitFor("document.querySelector('.background-music').paused && !!document.querySelector('[aria-label=\"播放背景音乐\"]')");
        await key('ArrowLeft');
        assert.equal(await execute("document.querySelector('.background-music').paused"), true, 'Board interaction restarted deliberately paused music');
        await clickLabel('打开音效');
        assert.equal(await execute("!!document.querySelector('[aria-label=\"关闭音效\"]') && document.querySelector('.background-music').paused && document.querySelector('.background-music').volume === 0.6"), true, 'Music and move sound controls are not independent');
        await clickLabel('播放背景音乐');
        await waitFor("!document.querySelector('.background-music').paused && !!document.querySelector('[aria-label=\"暂停背景音乐\"]')");
        await clickLabel('暂停背景音乐');
        await waitFor("document.querySelector('.background-music').paused");
        report.checks.musicControls = { volume: 0.6, display: '60%', pausePersistsAcrossBoardInteraction: true, independentSoundEffects: true, manualResume: true };

        // Starting a match presents one opponent and plays their offline greeting.
        await clickText('开始对弈');
        await checkVoice('沈砚', 'shen-yan');
        await checkViewport('active-npc', [[960, 700], [1280, 720], [1380, 900]]);
        for (const [name, id] of [['阿棠', 'a-tang'], ['陆隐', 'lu-yin'], ['沈砚', 'shen-yan']]) {
          await clickText('更换棋友');
          await waitFor("!!document.querySelector('dialog[open][aria-label=\"更换棋友\"]')");
          assert.equal(await execute("document.querySelectorAll('dialog[open] .character-option').length"), 3, 'Opponent picker needs all three characters');
          await clickLabel(`与${name}对弈`);
          await clickText('开始新对局');
          await waitFor("!document.querySelector('dialog[open]')");
          await checkVoice(name, id);
        }
        await setRange('角色语音音量', 0.45);
        await waitFor("document.querySelector('.character-voice').volume === 0.45");
        await clickLabel('关闭角色语音');
        await waitFor("document.querySelector('.character-voice').paused && !!document.querySelector('[aria-label=\"打开角色语音\"]')");
        assert.equal(await execute("document.querySelector('.background-music').paused && document.querySelector('.background-music').volume === 0.6 && !!document.querySelector('[aria-label=\"关闭音效\"]')"), true, 'Voice toggle changed music or move sound controls');
        await clickLabel('重播角色语音');
        await waitFor("!document.querySelector('.character-voice').paused && document.querySelector('.character-voice').currentTime > 0.05 && !!document.querySelector('[aria-label=\"关闭角色语音\"]')");
        assert.equal(await execute("document.querySelector('.character-voice').volume"), 0.45);
        report.checks.voiceControls = { volume: 0.45, togglePauses: true, replayResumes: true, independentMusicAndSoundEffects: true };
        await clickLabel('重置视角');
        await execute('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
        report.checks.activeWoodPixels = await captureRenderedBoard('active');
        const activeScreenshot = await page.capturePage({ x: 0, y: 0, width: window.getContentSize()[0], height: window.getContentSize()[1] }, { stayHidden: true, stayAwake: true });
        await fs.writeFile(path.join(directory, 'electron-smoke-active.png'), activeScreenshot.toPNG());

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

        // A real exchange drives the character's emotions even with voices
        // muted: red takes a horse, then the NPC's rook takes that red cannon.
        // Verify the actual captured piece in the UI before checking its reaction.
        await clickLabel('关闭角色语音');
        await waitFor("document.querySelector('.character-voice').paused && !!document.querySelector('[aria-label=\"打开角色语音\"]')");
        await clickText('重新开局');
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '00 步' && !document.querySelector('dialog[open]')");
        await moveBetween({ x: 1, y: 7 }, { x: 1, y: 0 });
        const regretting = await execute(`({
          moves: document.querySelector('.move-count').textContent.trim(),
          event: document.querySelector('.reaction-bubble').dataset.event,
          mood: document.querySelector('.portrait-stage').dataset.mood,
          expression: document.querySelector('.portrait-stage').dataset.expression,
          captured: [...document.querySelectorAll('.captures-section > div:first-child .captured-piece')].map(piece => piece.textContent),
          caption: document.querySelector('.reaction-bubble p').textContent,
          audioPaused: document.querySelector('.character-voice').paused,
        })`);
        report.checks.captureEmotions = { regretting };
        assert.equal(regretting.moves, '01 步', 'Lost-piece reaction must be observable before the NPC reply');
        assert.deepEqual(regretting.captured, ['马'], 'The exchange did not actually capture the NPC horse');
        assert.equal(regretting.event, 'strongLost');
        assert.equal(regretting.mood, 'regret');
        assert.equal(regretting.expression, 'regret');
        assert.equal(regretting.audioPaused, true, 'Muted reactions must not start speech');
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '02 步' && document.querySelector('.status-top strong')?.textContent === '红方行棋'");
        const celebrating = await execute(`({
          event: document.querySelector('.reaction-bubble').dataset.event,
          mood: document.querySelector('.portrait-stage').dataset.mood,
          expression: document.querySelector('.portrait-stage').dataset.expression,
          captured: [...document.querySelectorAll('.captures-section > div:nth-child(2) .captured-piece')].map(piece => piece.textContent),
          history: document.querySelector('.move-history').textContent,
          caption: document.querySelector('.reaction-bubble p').textContent,
          audioPaused: document.querySelector('.character-voice').paused,
        })`);
        report.checks.captureEmotions.celebrating = celebrating;
        assert.deepEqual(celebrating.captured, ['炮'], 'The NPC reply must actually capture the red cannon in this exchange');
        assert.equal(celebrating.event, 'strongCapture');
        assert.equal(celebrating.mood, 'happy');
        assert.equal(celebrating.expression, 'joy');
        assert.equal(celebrating.audioPaused, true);
        assert.notEqual(celebrating.caption, regretting.caption, 'Capturing and losing a piece need different dialogue');
        await clickText('悔棋');
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '00 步' && document.querySelector('.reaction-bubble')?.dataset.event === 'undo'");
        const afterUndo = await execute(`({
          event: document.querySelector('.reaction-bubble').dataset.event,
          mood: document.querySelector('.portrait-stage').dataset.mood,
          expression: document.querySelector('.portrait-stage').dataset.expression,
          audioPaused: document.querySelector('.character-voice').paused,
          capturedCount: document.querySelectorAll('.captured-piece').length,
          characterCards: document.querySelectorAll('.character-options').length,
        })`);
        report.checks.captureEmotions.afterUndo = afterUndo;
        assert.equal(afterUndo.event, 'undo');
        assert.equal(afterUndo.mood, 'calm');
        assert.equal(afterUndo.expression, 'neutral');
        assert.equal(afterUndo.audioPaused, true);
        assert.equal(afterUndo.capturedCount, 0);
        assert.equal(afterUndo.characterCards, 0, 'Undoing the exchange must keep the single-opponent match view');

        // Exercise the real game state through its public keyboard controls.
        for (const keyName of ['Escape', 'Enter', 'ArrowUp', 'Enter']) await key(keyName);
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '02 步' && document.querySelector('.status-top strong')?.textContent === '红方行棋'");
        report.checks.npcGame = await execute("({ moves: document.querySelector('.move-count').textContent, history: document.querySelector('.move-history').textContent })");
        await clickText('悔棋');
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '00 步'");
        assert.equal(await execute("!!document.querySelector('.active-opponent') && !document.querySelector('.character-options')"), true, 'Undoing the first move must keep the active opponent view');
        report.checks.undo = true;
        await clickText('更换棋友');
        await waitFor("!!document.querySelector('dialog[open][aria-label=\"更换棋友\"]')");
        await clickText('双人对战');
        await clickText('开始新对局');
        await waitFor("!document.querySelector('dialog[open]') && document.querySelector('.player-seat.opponent strong')?.textContent === '黑方棋手'");
        assert.equal(await execute("document.querySelector('.character-voice').paused && !document.querySelector('.active-opponent') && !document.querySelector('.character-options')"), true, 'Local multiplayer must not show NPC cards or continue NPC speech');
        await checkViewport('active-local', [[960, 700]]);
        for (const keyName of ['Escape', 'Enter', 'ArrowUp', 'Enter']) await key(keyName);
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '01 步' && document.querySelector('.status-top strong')?.textContent === '黑方行棋'");
        for (const keyName of ['ArrowUp', 'ArrowUp', 'Enter', 'ArrowDown', 'Enter']) await key(keyName);
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '02 步' && document.querySelector('.status-top strong')?.textContent === '红方行棋'");
        report.checks.localGame = await execute("({ moves: document.querySelector('.move-count').textContent, history: document.querySelector('.move-history').textContent })");

        // Play the relaxed capture rule through the real UI, without changing React state.
        report.checks.captureRuleSteps = [];
        await clickText('重新开局');
        await waitFor("!!document.querySelector('dialog[open]')");
        await clickText('开始新对局');
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '00 步' && !document.querySelector('dialog[open]')");
        report.checks.captureRuleSteps.push({ step: 'new-local-game', at: new Date().toISOString() });
        await moveBetween({ x: 1, y: 7 }, { x: 1, y: 0 });
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '01 步'");
        report.checks.captureRuleSteps.push({ step: 'cannon-captures-horse', at: new Date().toISOString() });
        await moveBetween({ x: 3, y: 0 }, { x: 4, y: 1 });
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '02 步'");
        report.checks.captureRuleSteps.push({ step: 'advisor-exposes-general', at: new Date().toISOString() });
        assert.equal(await execute("document.querySelector('.status-top strong')?.textContent"), '红方行棋', 'Exposing the general must not trigger a check warning');
        assert.equal(await execute("!!document.querySelector('dialog[open]')"), false, 'Exposing the general ended the game before capture');
        await moveBetween({ x: 4, y: 6 }, { x: 4, y: 5 });
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '03 步'");
        report.checks.captureRuleSteps.push({ step: 'red-postpones-general-capture', at: new Date().toISOString() });
        assert.equal(await execute("document.querySelector('.status-top strong')?.textContent"), '黑方行棋', 'Threatened side received a check warning');
        await moveBetween({ x: 0, y: 3 }, { x: 0, y: 4 });
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '04 步'");
        report.checks.captureRuleSteps.push({ step: 'black-ignores-general-threat', at: new Date().toISOString() });
        assert.equal(await execute("!!document.querySelector('dialog[open]') || /将军|应将|将死|困毙/.test(document.querySelector('.status-section').textContent)"), false, 'Ignoring a threat must keep the game running without a warning');
        await moveBetween({ x: 1, y: 0 }, { x: 4, y: 0 });
        await waitFor("document.querySelector('.move-count')?.textContent.trim() === '05 步' && !!document.querySelector('dialog.result-modal[open]')");
        report.checks.captureRuleSteps.push({ step: 'general-captured', at: new Date().toISOString() });
        report.checks.captureOnlyVictory = await execute("({ status: document.querySelector('.status-top strong').textContent, reason: document.querySelector('.result-modal p').textContent, moves: document.querySelector('.move-count').textContent, history: document.querySelector('.move-history').textContent })");
        assert.equal(report.checks.captureOnlyVictory.status, '红方获胜');
        assert.equal(report.checks.captureOnlyVictory.reason, '黑将被吃，红方获胜');
        assert.equal(await execute("document.querySelector('.background-music').paused"), true, 'Music resumed during the match despite being paused');

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
      new Promise((_resolve, reject) => { deadline = setTimeout(() => reject(new Error('Electron smoke test exceeded 155 seconds')), 155000); }),
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
