'use strict';

// This harness is loaded only by the explicit --smoke-test main-process flag.
// Production renderer bundles contain no test hooks, preload, or IPC bridge.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function runSmokeTest({ app, window, url }) {
  const directory = path.resolve(process.env.YIJING_SMOKE_DIR || path.join(process.cwd(), '.local-artifacts'));
  await fs.mkdir(directory, { recursive: true });
  const report = { success: false, version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, startedAt: new Date().toISOString(), checks: {}, consoleErrors: [] };
  const page = window.webContents;
  window.setMinimumSize(800,540);
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
      const previousMoves = document.querySelector('.scene')?.getAttribute('aria-label');
      const previousStatus = document.querySelector('.selection-status')?.textContent;
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
          const actionReady = key !== 'Enter' || document.querySelector('.scene')?.getAttribute('aria-label') !== previousMoves || document.querySelector('.selection-status')?.textContent !== previousStatus;
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
  const pause = ms => execute(`new Promise(resolve => setTimeout(resolve, ${ms}))`);
  const capture = async rect => {
    for(let attempt=0;attempt<6;attempt++) {
      try { return await page.capturePage(rect,{stayHidden:true,stayAwake:true}); }
      catch(error) { if(attempt===5)throw error;await pause(500); }
    }
  };
  const countExpression = "Number(document.querySelector('.scene')?.getAttribute('aria-label').match(/第 (\\d+) 步/)?.[1])";
  const moves = number => waitFor(`${countExpression} === ${number}`);
  const screenshot = async name => {
    await pause(200);
    const image = await capture();
    await fs.writeFile(path.join(directory, `electron-${name}.png`), image.toPNG());
  };
  const checkViewport = async (phase, sizes = [[960, 650], [1280, 720], [1380, 900]]) => {
    report.checks.viewportFit ||= [];
    for (const [width, height] of sizes) {
      window.setContentSize(width, height);
      if(page.isOffscreen()) page.invalidate();
      await waitFor(`Math.abs(innerWidth - ${width}) <= 2 && Math.abs(innerHeight - ${height}) <= 2`);
      await pause(250);
      const fit = await execute(`(() => {
        const selectors = ['.mode-options','.character-detail','.character-options','.start-game','.scene','.active-opponent','.match-actions','dialog[open]'];
        const bounds = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(element => element.checkVisibility()).map(element => {
          const r = element.getBoundingClientRect();
          return { selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,overflow:element.scrollHeight-element.clientHeight };
        }));
        return { width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,bounds };
      })()`);
      report.checks.viewportFit.push({phase,...fit});
      assert.ok(fit.documentWidth <= fit.width+1 && fit.documentHeight <= fit.height+1, `${phase}: page overflow at ${width}x${height}`);
      for (const box of fit.bounds) assert.ok(box.x>=-1 && box.y>=-1 && box.right<=fit.width+1 && box.bottom<=fit.height+1 && box.width>0 && box.height>0 && box.overflow<=2, `${phase}: clipped ${box.selector} at ${width}x${height}: ${JSON.stringify(box)}`);
      if(width===960) await screenshot(`${phase}-compact`);
    }
  };
  const boardImage = async () => {
    const rect = await execute(`(() => {const r=document.querySelector('.scene').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight};})()`);
    const frame = await capture();
    const size = frame.getSize();
    return frame.crop({x:Math.floor(rect.x*size.width/rect.viewportWidth),y:Math.floor(rect.y*size.height/rect.viewportHeight),width:Math.floor(rect.width*size.width/rect.viewportWidth),height:Math.floor(rect.height*size.height/rect.viewportHeight)});
  };
  const visibleBoard = async () => {
    let pixels=0;
    for(let attempt=0;attempt<16;attempt++) {
      const image=await boardImage();const bitmap=image.toBitmap();pixels=0;
      for(let i=0;i<bitmap.length;i+=4) if(bitmap[i+2]>80 && bitmap[i+2]>bitmap[i+1]*1.13 && bitmap[i+1]>bitmap[i]*1.1) pixels++;
      if(pixels>2000) return image;
      const view=await execute("document.querySelector('.board-tools [aria-pressed=true]').getAttribute('aria-label')");
      // Force a resize repaint without changing the selected camera view.
      const [w,h]=window.getContentSize();window.setContentSize(w+1,h);await pause(100);window.setContentSize(w,h);
      await pause(350);
      await clickLabel(view);
      await pause(350);
      assert.ok(view);
    }
    report.glDebug=await execute("(()=>{const c=document.querySelector('canvas');const gl=c.getContext('webgl2');return {attributes:gl.getContextAttributes(),lost:gl.isContextLost(),width:c.width,height:c.height,framebuffer:gl.getParameter(gl.FRAMEBUFFER_BINDING)!==null,display:getComputedStyle(c).display,rect:c.getBoundingClientRect().toJSON()}})()");
    throw new Error(`Board geometry did not compose: ${pixels} wood pixels`);
  };
  const startOpponent = async(name,id) => {
    await clickLabel('单人模式');
    await waitFor("!!document.querySelector('.character-screen')");
    await clickLabel(`选择${name}`);
    await waitFor(`document.querySelector('.character-biography h1')?.textContent===${JSON.stringify(name)}`);
    const intro=await execute("({bio:document.querySelector('.biography').textContent,quote:document.querySelector('blockquote').textContent,portrait:document.querySelector('.selection-portrait img').src,canvas:!!document.querySelector('.game-screen:not([hidden]) canvas')})");
    assert.ok(intro.bio.length>35 && intro.quote.length>8 && intro.portrait.endsWith(`${id}.png`) && !intro.canvas);
    await clickText(`与${name}对弈`);
    await waitFor("!!document.querySelector('.scene canvas')");
    await waitFor(`(() => {const a=document.querySelector('.character-voice');return a.currentSrc.includes('/${id}/intro-')&&!a.paused&&a.currentTime>.03;})()`);
    assert.equal(await execute("document.querySelector('.opponent-name h2').textContent"),name);
    assert.equal(await execute("document.querySelectorAll('.character-option').length"),0);
    await waitFor("[...document.querySelectorAll('.portrait-layer')].every(image=>image.complete&&image.naturalWidth>0)");
    report.checks.characters ||= [];report.checks.characters.push({name,id,...intro});
  };
  const leave = async () => {
    await clickText('返回选局');
    if(await execute("!!document.querySelector('dialog[open][aria-label=\"返回选局？\"]')")) await clickText('结束并返回');
    await waitFor("!!document.querySelector('.mode-screen') && !document.querySelector('.game-screen:not([hidden])') && document.querySelector('.character-voice').paused");
  };
  try {
    await Promise.race([
      (async () => {
        await window.loadURL(url);
        await waitFor("!!document.querySelector('.mode-screen')");
        await execute('document.fonts.ready.then(()=>true)');
        assert.equal(await execute("!!document.querySelector('canvas')"),false,'Opening must show mode selection, not the board');
        assert.equal(await execute("typeof window.require !== 'undefined' || typeof window.process !== 'undefined'"),false);
        assert.equal(window.isVisible(),false);assert.equal(page.isAudioMuted(),true);
        await checkViewport('mode');await screenshot('mode');

        // Observe actual Web Audio creation. These hooks exist only in this test process.
        await execute("window.effectCount=0;window.originalOscillator=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(...args){window.effectCount++;return window.originalOscillator.apply(this,args)};true");
        await clickLabel('单人模式');
        await waitFor("document.querySelectorAll('.character-option').length===4");
        assert.ok(await execute('window.effectCount>=2'),'Confirm button did not create its two-note sound');
        await waitFor("[...document.querySelectorAll('.character-option img,.selection-portrait img')].every(image=>image.complete&&image.naturalWidth>0)");
        await checkViewport('characters');await screenshot('characters');
        await clickLabel('选择闻弈');await waitFor("document.querySelector('.character-biography h1').textContent==='闻弈'");
        await checkViewport('master-selection',[[960,650]]);
        await clickLabel('声音设置');
        await checkViewport('settings',[[960,650]]);
        await clickLabel('关闭音效');const mutedCount=await execute('window.effectCount');
        await clickLabel('关闭');
        assert.equal(await execute('window.effectCount'),mutedCount,'Disabled effects still played');
        await clickLabel('声音设置');await clickLabel('打开音效');

        // Music must decode, loop, and keep its independent controls across screens.
        if(await execute("document.querySelector('.background-music').paused")) {
          if(await execute("!!document.querySelector('[aria-label=\"关闭背景音乐\"]')")) await clickLabel('关闭背景音乐');
          await clickLabel('打开背景音乐');
        }
        await waitFor("document.querySelector('.background-music').currentTime>.1 && !document.querySelector('.background-music').paused");
        report.checks.music=await execute("(()=>{const a=document.querySelector('.background-music');return {src:a.currentSrc,duration:a.duration,loop:a.loop,error:a.error?.message||''}})()");
        assert.equal(report.checks.music.duration,96);assert.equal(report.checks.music.loop,true);assert.equal(report.checks.music.error,'');assert.ok(report.checks.music.src.endsWith('/ink-and-moon.wav'));
        await execute("document.querySelector('.background-music').currentTime=95.8");
        await waitFor("document.querySelector('.background-music').currentTime<2 && !document.querySelector('.background-music').paused",5000);
        await setRange('背景音乐音量',.6);await waitFor("document.querySelector('.background-music').volume===.6");
        await clickLabel('关闭背景音乐');await clickLabel('关闭');await clickText('返回');
        await waitFor("!!document.querySelector('.mode-screen')");
        assert.equal(await execute("document.querySelector('.background-music').paused"),true);

        for(const [name,id] of [['阿棠','a-tang'],['陆隐','lu-yin'],['闻弈','wen-yi'],['沈砚','shen-yan']]) {
          await startOpponent(name,id);
          await visibleBoard();
          if(id==='wen-yi') {
            await moveBetween({x:0,y:6},{x:0,y:5});await moves(1);await pause(650);
            await clickText('悔棋');await moves(0);await pause(3500);await moves(0);
            await moveBetween({x:0,y:6},{x:0,y:5});await moves(1);
            await clickLabel('俯视视角');await moves(2);
            assert.equal(await execute("document.querySelector('.turn-status strong').textContent"),'红方行棋');
            await clickText('悔棋');await moves(0);
            await moveBetween({x:0,y:6},{x:0,y:5});await moves(1);await pause(650);
            await leave();await pause(3300);
            assert.equal(await execute("!!document.querySelector('.game-screen:not([hidden])') || !document.querySelector('.character-voice').paused"),false);
            report.checks.master={responded:true,undoCancels:true,leavingCancels:true};
          } else if(id!=='shen-yan') await leave();
        }
        await checkViewport('game');
        await visibleBoard();await screenshot('game');
        assert.equal(await execute("document.querySelector('.background-music').paused"),true,'Music unexpectedly resumed');
        assert.equal(await execute("!!document.querySelector('.move-history,.captures-section,.panel-footer')"),false);
        report.checks.webgl=await execute("(()=>{const gl=document.querySelector('canvas').getContext('webgl2');return !!gl&&!gl.isContextLost()})()");assert.equal(report.checks.webgl,true);

        // Locked top view must survive real drag/wheel input; returning to 3D must restore orbit.
        await clickLabel('俯视视角');await pause(800);await visibleBoard();
        const beforeTop=(await boardImage()).toBitmap();
        const point=await execute("(()=>{const r=document.querySelector('.scene').getBoundingClientRect();return {x:Math.round(r.x+r.width*.5),y:Math.round(r.y+r.height*.5)}})()");
        const drag=async()=>{
          page.sendInputEvent({type:'mouseMove',...point});page.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
          for(let step=1;step<=8;step++){page.sendInputEvent({type:'mouseMove',x:point.x+step*12,y:point.y+step*3,button:'left',movementX:12,movementY:3});await pause(15);}
          page.sendInputEvent({type:'mouseUp',x:point.x+96,y:point.y+24,button:'left',clickCount:1});
          page.sendInputEvent({type:'mouseWheel',...point,deltaY:-240,deltaX:0,canScroll:true});await pause(900);
        };
        await drag();const afterTop=(await boardImage()).toBitmap();
        assert.ok(beforeTop.equals(afterTop),'Top camera changed after drag or wheel');
        await screenshot('top');
        await clickLabel('立体视角');await pause(600);const before3D=(await boardImage()).toBitmap();
        await drag();const after3D=(await boardImage()).toBitmap();assert.ok(!before3D.equals(after3D),'3D orbit did not resume');
        await clickLabel('立体视角');await pause(400);report.checks.camera={topLocked:true,orbitRestored:true};

        // A real recapture still produces a single calm exchange, including when muted.
        await clickLabel('声音设置');await setRange('角色语音音量',.45);await clickLabel('关闭角色语音');await clickLabel('关闭');
        await moveBetween({x:1,y:7},{x:1,y:0});await moves(1);
        assert.equal(await execute("['lost','strongLost'].includes(document.querySelector('.reaction-bubble').dataset.event)"),false);
        await moves(2);await waitFor("document.querySelector('.reaction-bubble').dataset.event==='exchange'");
        assert.equal(await execute("document.querySelector('.portrait-stage').dataset.expression"),'neutral');
        assert.equal(await execute("document.querySelector('.character-voice').paused"),true);
        await clickText('悔棋');await moves(0);await clickLabel('声音设置');await clickLabel('打开角色语音');await clickLabel('关闭');
        await execute("window.voicePlays=[];document.querySelector('.character-voice').addEventListener('play',event=>window.voicePlays.push(event.target.currentSrc))");
        await moveBetween({x:1,y:7},{x:1,y:0});await moves(2);
        await waitFor("document.querySelector('.reaction-bubble').dataset.event==='exchange' && !document.querySelector('.character-voice').paused");
        report.checks.exchange=await execute("({played:window.voicePlays,caption:document.querySelector('.reaction-bubble p').textContent,volume:document.querySelector('.character-voice').volume})");
        assert.equal(report.checks.exchange.played.length,1);assert.ok(report.checks.exchange.played[0].includes('/exchange-'));assert.equal(report.checks.exchange.volume,.45);
        // BGM ducks while a character talks, then restores its chosen level.
        await clickLabel('声音设置');await clickLabel('打开背景音乐');
        await waitFor("Math.abs(document.querySelector('.background-music').volume-.18)<.001");
        await clickLabel('关闭角色语音');await waitFor("document.querySelector('.background-music').volume===.6");
        await clickLabel('关闭背景音乐');await clickLabel('关闭');await leave();

        await clickLabel('双人模式');await waitFor("!!document.querySelector('.scene canvas')");
        assert.equal(await execute("!!document.querySelector('.active-opponent') || !document.querySelector('.character-voice').paused"),false);
        await checkViewport('local',[[960,650],[1380,900]]);await visibleBoard();await screenshot('local');
        // Free rules: ignore a king threat, then win only by actually capturing it.
        for(const [index,from,to] of [
          [1,{x:1,y:7},{x:1,y:0}], [2,{x:3,y:0},{x:4,y:1}],
          [3,{x:4,y:6},{x:4,y:5}], [4,{x:0,y:3},{x:0,y:4}],
          [5,{x:1,y:0},{x:4,y:0}],
        ]) { await moveBetween(from,to);await moves(index);if(index<5) assert.equal(await execute("!!document.querySelector('dialog[open]')"),false); }
        await waitFor("!!document.querySelector('dialog[open][aria-label=\"本局已结束\"]')");
        assert.equal(await execute("document.querySelector('.result-reason').textContent"),'黑将被吃，红方获胜');
        report.checks.captureOnlyVictory=true;
        await clickText('回看棋局');await clickText('悔棋');await moves(4);
        await clickText('重开');await clickText('继续对弈');await moves(4);
        await clickText('重开');await clickText('开始新对局');await moves(0);
        await moveBetween({x:0,y:6},{x:0,y:5});await moves(1);await clickText('认输');await clickText('确认认输');
        await waitFor("document.querySelector('.result-reason')?.textContent==='黑方认输'");await screenshot('result');
        await clickText('返回选局');await waitFor("!!document.querySelector('.mode-screen')");

        // Keep the secure, offline renderer boundary covered after the UI rewrite.
        report.checks.csp=await execute(`new Promise(async resolve=>{
          const violations=[];const listener=event=>violations.push(event.effectiveDirective);document.addEventListener('securitypolicyviolation',listener);
          const script=document.createElement('script');script.textContent='document.documentElement.dataset.inlineScriptRan="yes"';document.head.appendChild(script);
          let blocked=false;try{await fetch('https://example.invalid/xiangqi-smoke')}catch{blocked=true}
          setTimeout(()=>{script.remove();document.removeEventListener('securitypolicyviolation',listener);resolve({script:!document.documentElement.dataset.inlineScriptRan,network:blocked,violations})},100);
        })`);
        assert.ok(report.checks.csp.script&&report.checks.csp.network);assert.ok(report.checks.csp.violations.includes('connect-src'));
        const unexpected=report.consoleErrors.filter(message=>!/Content Security Policy|violates.*directive|Refused to|Connecting to|Executing inline/i.test(message));
        assert.deepEqual(unexpected,[],'Unexpected renderer console errors');assert.equal(window.isVisible(),false);
        report.success=true;
      })(),
      new Promise((_resolve,reject)=>{deadline=setTimeout(()=>reject(new Error('Electron smoke test exceeded 220 seconds')),220000)}),
    ]);
  } catch(error) { report.error=error.stack||String(error);report.viewport=await execute('({width:innerWidth,height:innerHeight})').catch(()=>null);await screenshot('failure').catch(()=>{}); }
  finally {
    clearTimeout(deadline);report.finishedAt=new Date().toISOString();
    await fs.writeFile(path.join(directory,'electron-smoke.json'),JSON.stringify(report,null,2)+'\n');
    console.log(`Electron smoke test ${report.success?'passed':'failed'}: ${directory}`);
    if(!report.success)console.error(report.error);
    app.exit(report.success?0:1);
  }
}
module.exports={runSmokeTest};
