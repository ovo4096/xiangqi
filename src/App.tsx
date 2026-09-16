import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Flag, Focus, Layers3, RotateCcw, RotateCw, Settings2, X } from 'lucide-react';
import { BoardScene } from './scene/BoardScene';
import { applyMove, getGameResult, initialBoard, legalMoves, pieceLabel, type Difficulty, type Piece, type Side } from './game/engine';
import { characters, characterForDifficulty } from './game/characters';
import { musicPreferences, saveMusicPreferences } from './audio/preferences';
import { useCharacterVoice } from './audio/useCharacterVoice';
import { reactionMood, type Mood } from './audio/reactions';
import { playEffect, type SoundEffect } from './audio/effects';
import { CharacterPortrait } from './scene/CharacterPortrait';

type Mode = 'npc' | 'local';
type Screen = 'mode' | 'characters' | 'game';
type Coord = { x: number; y: number };
type RecordEntry = { before: Piece[]; side: Side; from: Coord; to: Coord };
type Game = { board: Piece[]; turn: Side; history: RecordEntry[] };
type Result = { winner: Side | null; reason: string };
const freshGame = (): Game => ({ board: initialBoard(), turn: 'red', history: [] });
const sideName = (side: Side) => side === 'red' ? '红方' : '黑方';

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog className="modal" aria-label={title} ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button></div>{children}
  </dialog>;
}

function App() {
  const [screen, setScreen] = useState<Screen>('mode');
  const [boardMounted, setBoardMounted] = useState(false);
  const [game, setGame] = useState<Game>(freshGame);
  const [mode, setMode] = useState<Mode>('npc');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const character = characterForDifficulty(difficulty);
  const voice = useCharacterVoice(character.id);
  const [recentReaction, setRecentReaction] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'perspective' | 'top'>('perspective');
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('yijing-sound') !== 'off'; } catch { return true; } });
  const soundEnabled = useRef(sound);
  soundEnabled.current = sound;
  const audio = useRef<AudioContext | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(() => musicPreferences().enabled);
  const [musicVolume, setMusicVolume] = useState(() => musicPreferences().volume);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicError, setMusicError] = useState(false);
  const music = useRef<HTMLAudioElement>(null);
  const musicEnabledRef = useRef(musicEnabled);
  musicEnabledRef.current = musicEnabled;
  const [settings, setSettings] = useState(false);
  const [pending, setPending] = useState<'restart' | 'leave' | 'surrender' | null>(null);
  const [resultOverride, setResultOverride] = useState<Result | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [toast, setToast] = useState('');
  const [aiFailed, setAiFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sceneError, setSceneError] = useState('');
  const [keyboardCursor, setKeyboardCursor] = useState<Coord | null>(null);
  const sceneEl = useRef<HTMLDivElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const clickRef = useRef<(x: number, y: number) => void>(() => {});
  const result = resultOverride || getGameResult(game.board, game.turn);
  const thinking = screen === 'game' && mode === 'npc' && game.turn === 'black' && !result;
  const selected = game.board.find(piece => piece.id === selectedId);
  const destinations = selected ? legalMoves(game.board, selected) : [];
  const last = game.history.at(-1);
  const material = game.board.reduce((score, piece) => score + (piece.side === 'black' ? 1 : -1) * ({ general: 0, rook: 9, cannon: 4.5, horse: 4, elephant: 2, advisor: 2, pawn: 1 }[piece.type]), 0);
  const baseMood: Mood = result ? result.winner === 'black' ? 'win' : 'lose' : thinking ? 'thinking' : material >= 4 ? 'confident' : material <= -4 ? 'concerned' : 'calm';
  const mood: Mood = recentReaction && voice.emotion ? reactionMood[voice.emotion.event] : baseMood;

  const startMusic = useCallback(() => {
    const player = music.current;
    if (!player || !musicEnabledRef.current || !player.paused) return;
    if (player.error) player.load();
    void player.play().then(() => setMusicError(false)).catch((error: unknown) => {
      if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name)) return;
      setMusicError(true);
    });
  }, []);
  useEffect(() => {
    if (music.current) music.current.volume = musicVolume * (voice.speaking ? 0.3 : 1);
    saveMusicPreferences(musicEnabled, musicVolume);
    if (!musicEnabled) music.current?.pause();
  }, [musicEnabled, musicVolume, voice.speaking]);
  useEffect(() => {
    const unlock = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.music-settings')) return;
      startMusic();
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    const player = music.current;
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); player?.pause(); };
  }, [startMusic]);
  useEffect(() => { try { localStorage.setItem('yijing-sound', sound ? 'on' : 'off'); } catch { /* Sound also works without stored preferences. */ } }, [sound]);
  useEffect(() => () => { void audio.current?.close(); audio.current = null; }, []);
  const effect = useCallback((kind: SoundEffect) => {
    if (!soundEnabled.current) return;
    try { const context = audio.current ||= new AudioContext(); void context.resume(); playEffect(context, kind); } catch { /* Sound is optional. */ }
  }, []);

  const move = useCallback((pieceId: string, to: Coord) => {
    const piece = game.board.find(item => item.id === pieceId);
    if (screen !== 'game' || !piece || piece.side !== game.turn || result || !legalMoves(game.board, piece).some(point => point.x === to.x && point.y === to.y)) return;
    const captured = game.board.find(item => item.x === to.x && item.y === to.y);
    const nextBoard = applyMove(game.board, pieceId, to);
    const nextTurn = game.turn === 'red' ? 'black' : 'red';
    setGame({ board: nextBoard, turn: nextTurn, history: [...game.history, { before: game.board, side: piece.side, from: { x: piece.x, y: piece.y }, to }] });
    if (mode === 'npc') {
      const outcome = getGameResult(nextBoard, nextTurn);
      voice.onMove({ side: piece.side, captured: captured?.type, outcome: outcome ? outcome.winner === 'black' ? 'win' : 'lose' : undefined });
      if (!outcome && !captured && piece.side === 'red' && game.history.length >= 4 && game.history.length % 8 === 4) voice.react('thinking');
    }
    setSelectedId(null); setAiFailed(false); effect(captured ? 'capture' : 'move');
  }, [screen, game, result, effect, mode, voice.react, voice.onMove]);
  clickRef.current = (x, y) => {
    if (result || thinking) return;
    const clicked = game.board.find(piece => piece.x === x && piece.y === y);
    if (clicked?.side === game.turn) { setSelectedId(clicked.id === selectedId ? null : clicked.id); effect('select'); return; }
    if (selected && destinations.some(point => point.x === x && point.y === y)) move(selected.id, { x, y });
    else if (selected) setToast('此处不能落子，请选择标记的位置');
  };
  useEffect(() => {
    if (!boardMounted || !sceneEl.current) return;
    setSceneError('');
    try { scene.current = new BoardScene(sceneEl.current, (x, y) => clickRef.current(x, y)); }
    catch { setSceneError('无法启动立体棋盘，请开启硬件加速后重新打开游戏。'); }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, [boardMounted]);
  useEffect(() => { scene.current?.setActive(screen === 'game'); }, [screen, boardMounted]);
  useEffect(() => { scene.current?.setPosition(game.board, selectedId, destinations, last ? { from: last.from, to: last.to } : null); }, [screen, game, selectedId]);
  useEffect(() => { scene.current?.setView(view); }, [screen, view]);
  useEffect(() => { scene.current?.setKeyboardCursor(keyboardCursor); }, [screen, keyboardCursor]);
  useEffect(() => {
    if (!thinking) return;
    let active = true;
    const worker = new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' });
    const timer = window.setTimeout(() => worker.postMessage({ board: game.board, difficulty, previousPositions: difficulty === 'master' ? game.history.map(entry => entry.before) : undefined }), 450);
    const watchdog = window.setTimeout(() => { worker.terminate(); setAiFailed(true); }, 20000);
    worker.onmessage = event => { window.clearTimeout(watchdog); if (!active) return; if (event.data.error || !event.data.move) { setAiFailed(true); return; } move(event.data.move.pieceId, event.data.move.to); };
    worker.onerror = () => { window.clearTimeout(watchdog); if (active) setAiFailed(true); };
    return () => { active = false; window.clearTimeout(timer); window.clearTimeout(watchdog); worker.terminate(); };
  }, [screen, game, mode, difficulty, retry, !!result]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2400); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!voice.emotion) { setRecentReaction(false); return; }
    setRecentReaction(true);
    const timer = window.setTimeout(() => setRecentReaction(false), 6500);
    return () => window.clearTimeout(timer);
  }, [voice.emotion]);

  const startGame = (nextMode = mode) => {
    voice.reset(); setMode(nextMode); setGame(freshGame()); setSelectedId(null); setKeyboardCursor(null); setBoardMounted(true);
    scene.current?.setView('perspective');
    setResultOverride(null); setResultDismissed(false); setPending(null); setAiFailed(false); setToast(''); setView('perspective'); setScreen('game');
    if (nextMode === 'npc') voice.react('intro', character.id);
  };
  const leaveGame = () => { voice.reset(); setScreen('mode'); setPending(null); setSelectedId(null); setKeyboardCursor(null); setToast(''); };
  const request = (action: 'restart' | 'leave') => {
    if (game.history.length && !result) setPending(action);
    else if (action === 'leave') leaveGame();
    else startGame();
  };
  const undo = () => {
    if (!game.history.length) return;
    let index = game.history.length - 1;
    if (mode === 'npc' && game.history[index].side === 'black' && index > 0) index--;
    const entry = game.history[index];
    setGame({ board: entry.before, turn: entry.side, history: game.history.slice(0, index) });
    setSelectedId(null); setResultOverride(null); setResultDismissed(false); setAiFailed(false); voice.reset();
    if (mode === 'npc') voice.react('undo');
  };
  const status = result ? result.winner ? sideName(result.winner) + '获胜' : '和棋' : aiFailed ? `${character.name}暂时停顿` : thinking ? `${character.name}思考中` : `${sideName(game.turn)}行棋`;

  return <div className={`app-shell screen-${screen}`} onClickCapture={event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    effect(button.dataset.sound === 'confirm' ? 'confirm' : button.dataset.sound === 'back' ? 'back' : 'select');
  }}>
    <audio ref={music} className="background-music" src="./music/ink-and-moon.wav" loop preload="none" onPlay={() => setMusicPlaying(true)} onPause={() => setMusicPlaying(false)} onError={() => { setMusicError(true); setMusicPlaying(false); }} />
    <audio ref={voice.element} className="character-voice" preload="none" />
    <div className="ink-landscape" aria-hidden="true" />
    <header className="site-header">
      <div className="brand"><span className="brand-seal">弈</span><span>弈境<small>一局一世界</small></span></div>
      {screen === 'game' ? <div className="turn-status" aria-live="polite"><i className={game.turn} /><strong>{status}</strong><span>{mode === 'npc' ? '你执红' : '同机双人'}</span></div> : <span className="header-verse">山水有相逢 · 棋中有知音</span>}
      <button className="icon-button settings-button" aria-label="声音设置" title="声音设置" onClick={() => setSettings(true)}><Settings2 size={21} /></button>
    </header>

    {screen === 'mode' && <main className="mode-screen">
      <div className="mode-heading"><span className="eyebrow">闲 来 一 局</span><h1>落子山水间</h1><p>一方木棋，一纸闲情。今日，与谁对弈？</p></div>
      <div className="mode-options" aria-label="选择对战模式">
        <button className="mode-card" aria-label="单人模式" data-sound="confirm" onClick={() => { setMode('npc'); setScreen('characters'); }}><span className="mode-number">壹</span><div className="ink-piece solo-piece" aria-hidden="true">弈</div><div className="mode-copy"><h2>独弈会友</h2><span>单人模式</span><p>访一位棋友，赴一场棋约</p></div><ArrowRight className="mode-arrow" size={23} /></button>
        <button className="mode-card" aria-label="双人模式" data-sound="confirm" onClick={() => startGame('local')}><span className="mode-number">贰</span><div className="paired-pieces" aria-hidden="true"><span className="ink-piece">将</span><span className="ink-piece red-piece">帅</span></div><div className="mode-copy"><h2>与友手谈</h2><span>双人模式</span><p>同坐一方，红黑轮流落子</p></div><ArrowRight className="mode-arrow" size={23} /></button>
      </div>
      <p className="page-note">楚河汉界，方寸之间。</p>
    </main>}

    {screen === 'characters' && <main className="character-screen">
      <div className="selection-heading"><button className="text-button" data-sound="back" onClick={() => { voice.reset(); setScreen('mode'); }}><ArrowLeft size={17} />返回</button><span className="eyebrow">以 棋 会 友</span></div>
      <section className="character-detail" aria-label={`${character.name}人物简介`}>
        <div className="selection-portrait"><img key={character.id} src={character.portrait} alt={`${character.name}，${character.title}`} /><span className="portrait-inscription">棋逢知己</span><span className="small-seal">棋缘</span></div>
        <div className="character-biography" key={character.id}><span className="eyebrow">{character.title}{character.badge && <em>{character.badge}</em>}</span><h1>{character.name}</h1><blockquote>{character.invitation}</blockquote><p className="biography">{character.bio}</p><p className="playing-style"><span>棋风</span>{character.style}</p><button className="primary-button start-game" data-sound="confirm" onClick={() => startGame('npc')}>与{character.name}对弈 <ArrowRight size={19} /></button></div>
      </section>
      <div className="character-options" role="group" aria-label="选择棋友">{characters.map(npc => <button key={npc.id} className={`character-option ${difficulty === npc.difficulty ? 'active' : ''}`} aria-label={`选择${npc.name}`} aria-pressed={difficulty === npc.difficulty} onClick={() => { voice.reset(); setDifficulty(npc.difficulty); }}><img src={npc.portrait} alt="" /><span><strong>{npc.name}</strong><small>{npc.title}</small></span>{npc.badge && <em>{npc.badge}</em>}{difficulty === npc.difficulty && <Check size={16} />}</button>)}</div>
    </main>}

    {boardMounted && <main className={`game-screen ${mode === 'local' ? 'local-game' : ''}`} hidden={screen !== 'game'}>
      <section className="board-area" aria-label="中国象棋对弈区">
        <div className="board-stage"><div className="scene" ref={sceneEl} tabIndex={0} role="application" aria-label={`象棋盘，第 ${game.history.length} 步。${view === 'top' ? '固定俯视视角。' : '拖动旋转，滚轮缩放。'}点击棋子和落点；方向键移动光标，回车落子，Escape 取消。`} onBlur={() => setKeyboardCursor(null)} onKeyDown={event => {
          if (event.key === 'Escape') { setSelectedId(null); setKeyboardCursor(null); return; }
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) return;
          event.preventDefault(); const cursor = keyboardCursor || { x: 4, y: 6 };
          if (event.key === 'Enter' || event.key === ' ') { setKeyboardCursor(cursor); clickRef.current(cursor.x, cursor.y); }
          else setKeyboardCursor({ x: Math.max(0, Math.min(8, cursor.x + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))), y: Math.max(0, Math.min(9, cursor.y + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0))) });
        }} />
          {sceneError && <div className="scene-error"><Layers3 /><p>{sceneError}</p><button className="primary-button" onClick={() => location.reload()}>重新加载</button></div>}
          <div className="board-tools" aria-label="棋盘视角"><button aria-label="立体视角" aria-pressed={view === 'perspective'} onClick={() => { setView('perspective'); if (view === 'perspective') scene.current?.resetView(); }}><Layers3 size={16} />立体</button><button aria-label="俯视视角" aria-pressed={view === 'top'} onClick={() => setView('top')}><Focus size={16} />俯视</button></div>
          <span className="board-side black-side">黑 方</span><span className="board-side red-side">红 方</span>
        </div>
        <div className="board-caption"><span className="selection-status" aria-live="polite">{aiFailed ? <button className="text-button" onClick={() => { setAiFailed(false); setRetry(value => value + 1); }}>重新思考</button> : selected ? `已选择「${pieceLabel(selected)}」，点击标记位置落子` : view === 'top' ? '固定俯视 · 点击落子' : '拖动旋转 · 滚轮缩放 · 点击落子'}</span><span className="keyboard-caption sr-only">{keyboardCursor ? `第 ${keyboardCursor.x + 1} 列 · 第 ${keyboardCursor.y + 1} 行` : ''}</span></div>
      </section>
      {mode === 'npc' && <aside className="active-opponent" aria-label={`本局棋友${character.name}`}><CharacterPortrait id={character.id} name={character.name} mood={mood} speaking={voice.speaking} reactionKey={voice.emotion?.serial || 0} /><div className="opponent-name"><h2>{character.name}</h2><span>{character.title}</span></div><div className={`reaction-bubble ${voice.speaking ? 'is-speaking' : ''}`} aria-live="polite" data-event={voice.reaction?.line.event || 'idle'}><p>{voice.error ? '语音暂未能播放' : voice.reaction?.line.text || character.invitation}</p></div></aside>}
      <nav className="match-actions" aria-label="对局操作"><button className="text-button return-button" data-sound="back" onClick={() => request('leave')}><ArrowLeft size={16} />返回选局</button><div><button onClick={undo} disabled={!game.history.length}><RotateCcw size={16} />悔棋</button><button onClick={() => request('restart')}><RotateCw size={16} />重开</button><button onClick={() => setPending('surrender')} disabled={!!result || thinking || !game.history.length}><Flag size={16} />认输</button></div></nav>
    </main>}

    {settings && <Modal title="声入棋境" onClose={() => setSettings(false)}><p className="modal-intro">留一曲清音，伴一局好棋。</p><div className="audio-setting music-settings"><div><strong>背景音乐</strong><small>墨月闲庭 · 原创器乐{musicError ? ' · 点击重试' : musicPlaying ? ' · 播放中' : ''}</small></div><button className="toggle" aria-label={musicEnabled && !musicError ? '关闭背景音乐' : '打开背景音乐'} aria-pressed={musicEnabled} onClick={() => { const enabled = !musicEnabled || musicError; musicEnabledRef.current = enabled; setMusicEnabled(enabled); if (enabled) startMusic(); else music.current?.pause(); }}><span /></button><input aria-label="背景音乐音量" type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={event => setMusicVolume(Number(event.target.value))} /></div><div className="audio-setting"><div><strong>角色语音</strong><small>棋友对白与情绪回应</small></div><button className="toggle" aria-label={voice.enabled ? '关闭角色语音' : '打开角色语音'} aria-pressed={voice.enabled} onClick={() => voice.setEnabled(!voice.enabled)}><span /></button><input aria-label="角色语音音量" type="range" min="0" max="1" step="0.05" value={voice.volume} onChange={event => voice.setVolume(Number(event.target.value))} /></div><div className="audio-setting"><div><strong>落子与按钮音效</strong><small>轻叩木声，落子有声</small></div><button className="toggle" aria-label={sound ? '关闭音效' : '打开音效'} aria-pressed={sound} onClick={() => setSound(!sound)}><span /></button></div></Modal>}
    {pending && <Modal title={pending === 'leave' ? '返回选局？' : pending === 'restart' ? '重新开局？' : '确认认输？'} onClose={() => setPending(null)}><p className="modal-intro">{pending === 'surrender' ? `${sideName(game.turn)}认输后，本局结束。` : pending === 'leave' ? '返回后将结束当前对局，可以重新选择模式和棋友。' : '当前棋局将结束，新一局由红方先行。'}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setPending(null)}>继续对弈</button><button className="primary-button" data-sound="confirm" onClick={() => {
      if (pending === 'leave') leaveGame();
      else if (pending === 'restart') startGame();
      else { setResultOverride({ winner: game.turn === 'red' ? 'black' : 'red', reason: `${sideName(game.turn)}认输` }); setSelectedId(null); setPending(null); if (mode === 'npc') voice.react(game.turn === 'red' ? 'win' : 'lose'); }
    }}>{pending === 'leave' ? '结束并返回' : pending === 'restart' ? '开始新对局' : '确认认输'}</button></div></Modal>}
    {screen === 'game' && result && !resultDismissed && !pending && <Modal title="本局已结束" onClose={() => setResultDismissed(true)}><div className="result-content"><span className={`ink-piece ${result.winner === 'red' ? 'red-piece' : ''}`}>{result.winner === 'red' ? '帅' : result.winner === 'black' ? '将' : '和'}</span><h3>{status}</h3><p className="result-reason">{result.reason}</p></div><div className="modal-actions"><button className="secondary-button" data-sound="back" onClick={leaveGame}>返回选局</button><button className="primary-button" data-sound="confirm" onClick={() => startGame()}>再弈一局</button></div><button className="text-button review-game" onClick={() => setResultDismissed(true)}>回看棋局</button></Modal>}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>;
}

export default App;
