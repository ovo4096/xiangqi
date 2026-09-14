import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, Bot, Check, ChevronRight, CircleHelp, Clock3, Flag, Focus, Layers3, Maximize2, Mic, MicOff, Minimize2, Music2, Pause, Play, RotateCcw, RotateCw, UsersRound, Volume2, VolumeX, X } from 'lucide-react';
import { BoardScene } from './scene/BoardScene';
import { applyMove, describeMove, getGameResult, initialBoard, legalMoves, pieceLabel, type Piece, type Side } from './game/engine';
import { characters, characterForDifficulty } from './game/characters';
import { musicPreferences, saveMusicPreferences } from './audio/preferences';
import { useCharacterVoice } from './audio/useCharacterVoice';
import { moodLabels, reactionMood, type Mood } from './audio/reactions';
import type { VoiceCharacterId } from './audio/voiceLines';
import { CharacterPortrait } from './scene/CharacterPortrait';

type Mode = 'npc' | 'local';
type Difficulty = 'easy' | 'medium' | 'hard';
type Coord = { x: number; y: number };
type RecordEntry = { before: Piece[]; side: Side; pieceId: string; from: Coord; to: Coord; label: string; captured?: Piece };
type Game = { board: Piece[]; turn: Side; history: RecordEntry[] };
type Result = { winner: Side | null; reason: string };
const freshGame = (): Game => ({ board: initialBoard(), turn: 'red', history: [] });
const sideName = (side: Side) => side === 'red' ? '红方' : '黑方';
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog className={`modal ${className}`} aria-label={title} ref={dialog} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === dialog.current) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button></div>
    {children}
  </dialog>;
}

function App() {
  const [game, setGame] = useState<Game>(freshGame);
  const [mode, setMode] = useState<Mode>('npc');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const character = characterForDifficulty(difficulty);
  const [matchStarted, setMatchStarted] = useState(false);
  const [opponentPicker, setOpponentPicker] = useState(false);
  const [pickerDifficulty, setPickerDifficulty] = useState<Difficulty>('medium');
  const [pickerMode, setPickerMode] = useState<Mode>('npc');
  const voice = useCharacterVoice(character.id as VoiceCharacterId);
  const [recentReaction, setRecentReaction] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'perspective' | 'top'>('perspective');
  const [sound, setSound] = useState(true);
  const soundEnabled = useRef(sound);
  soundEnabled.current = sound;
  const [musicEnabled, setMusicEnabled] = useState(() => musicPreferences().enabled);
  const [musicVolume, setMusicVolume] = useState(() => musicPreferences().volume);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicError, setMusicError] = useState(false);
  const music = useRef<HTMLAudioElement>(null);
  const musicEnabledRef = useRef(musicEnabled);
  musicEnabledRef.current = musicEnabled;
  const [help, setHelp] = useState(false);
  const [pending, setPending] = useState<{ mode: Mode; difficulty: Difficulty } | null>(null);
  const [surrender, setSurrender] = useState(false);
  const [resultOverride, setResultOverride] = useState<Result | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [toast, setToast] = useState('');
  const [aiFailed, setAiFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sceneError, setSceneError] = useState('');
  const [fullScreen, setFullScreen] = useState(false);
  const [keyboardCursor, setKeyboardCursor] = useState<Coord | null>(null);
  const sceneEl = useRef<HTMLDivElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const clickRef = useRef<(x: number, y: number) => void>(() => {});
  const audio = useRef<AudioContext | null>(null);
  const historyEl = useRef<HTMLDivElement>(null);
  const result = resultOverride || getGameResult(game.board, game.turn);
  const thinking = mode === 'npc' && game.turn === 'black' && !result;
  const selected = game.board.find((p) => p.id === selectedId);
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
    const player = music.current;
    if (player) player.volume = musicVolume * (voice.speaking ? 0.3 : 1);
    saveMusicPreferences(musicEnabled, musicVolume);
    if (!musicEnabled) player?.pause();
  }, [musicEnabled, musicVolume, voice.speaking]);

  useEffect(() => {
    const unlock = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.music-player')) return;
      startMusic();
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      music.current?.pause();
    };
  }, [startMusic]);

  const toggleMusic = () => {
    const shouldPlay = !musicEnabled || !musicPlaying;
    musicEnabledRef.current = shouldPlay;
    setMusicEnabled(shouldPlay);
    if (shouldPlay) startMusic();
    else music.current?.pause();
  };

  const playSound = useCallback((capture = false) => {
    if (!soundEnabled.current) return;
    try {
      const ctx = audio.current ||= new AudioContext();
      void ctx.resume();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(capture ? 350 : 580, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(95, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      oscillator.start(); oscillator.stop(ctx.currentTime + 0.15);
    } catch { /* Audio is optional on browsers that block playback. */ }
  }, []);

  const move = useCallback((pieceId: string, to: Coord) => {
    const piece = game.board.find((p) => p.id === pieceId);
    if (!piece || piece.side !== game.turn || result || !legalMoves(game.board, piece).some((p) => p.x === to.x && p.y === to.y)) return;
    const captured = game.board.find((p) => p.x === to.x && p.y === to.y);
    const entry: RecordEntry = { before: game.board, side: piece.side, pieceId, from: { x: piece.x, y: piece.y }, to, label: describeMove(game.board, pieceId, to), captured };
    const nextBoard = applyMove(game.board, pieceId, to);
    setGame({ board: nextBoard, turn: game.turn === 'red' ? 'black' : 'red', history: [...game.history, entry] });
    setMatchStarted(true);
    if (mode === 'npc') {
      const outcome = getGameResult(nextBoard, game.turn === 'red' ? 'black' : 'red');
      if (outcome) voice.react(outcome.winner === 'black' ? 'win' : 'lose');
      else if (captured) {
        const important = ['rook', 'horse', 'cannon'].includes(captured.type);
        voice.react(piece.side === 'black' ? important ? 'strongCapture' : 'capture' : important ? 'strongLost' : 'lost');
      } else if (!matchStarted) voice.react('intro');
      else if (piece.side === 'red' && game.history.length >= 4 && game.history.length % 8 === 4) voice.react('thinking');
    }
    setSelectedId(null); setAiFailed(false); playSound(!!captured);
  }, [game, result, playSound, mode, matchStarted, voice.react]);

  clickRef.current = (x, y) => {
    if (result || thinking) return;
    const clicked = game.board.find((p) => p.x === x && p.y === y);
    if (clicked?.side === game.turn) { setSelectedId(clicked.id === selectedId ? null : clicked.id); return; }
    if (selected && destinations.some((p) => p.x === x && p.y === y)) move(selected.id, { x, y });
    else if (selected) setToast('此处不能落子，请选择标记的位置');
  };

  useEffect(() => {
    if (!sceneEl.current) return;
    try { scene.current = new BoardScene(sceneEl.current, (x, y) => clickRef.current(x, y)); }
    catch { setSceneError('当前浏览器无法启动 3D 棋盘，请开启硬件加速后刷新，或使用支持 WebGL 的浏览器。'); }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, []);

  useEffect(() => { scene.current?.setPosition(game.board, selectedId, destinations, last ? { from: last.from, to: last.to } : null); }, [game, selectedId]);
  useEffect(() => { scene.current?.setView(view); }, [view]);
  useEffect(() => { scene.current?.setKeyboardCursor(keyboardCursor); }, [keyboardCursor]);
  useEffect(() => {
    if (!thinking) return;
    const worker = new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' });
    const timer = window.setTimeout(() => worker.postMessage({ board: game.board, difficulty }), 450);
    const watchdog = window.setTimeout(() => { worker.terminate(); setAiFailed(true); }, 20000);
    worker.onmessage = (event) => {
      window.clearTimeout(watchdog);
      if (event.data.error || !event.data.move) { setAiFailed(true); return; }
      move(event.data.move.pieceId, event.data.move.to);
    };
    worker.onerror = () => { window.clearTimeout(watchdog); setAiFailed(true); };
    return () => { window.clearTimeout(timer); window.clearTimeout(watchdog); worker.terminate(); };
  }, [game, mode, difficulty, retry]);

  useEffect(() => { if (result || !game.history.length) return; const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000); return () => window.clearInterval(timer); }, [!!result, game.history.length > 0]);
  useEffect(() => { historyEl.current?.scrollTo({ top: historyEl.current.scrollHeight, behavior: 'smooth' }); }, [game.history.length]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { const update = () => setFullScreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', update); return () => document.removeEventListener('fullscreenchange', update); }, []);
  useEffect(() => {
    if (!voice.emotion) { setRecentReaction(false); return; }
    setRecentReaction(true);
    const timer = window.setTimeout(() => setRecentReaction(false), 6500);
    return () => window.clearTimeout(timer);
  }, [voice.emotion]);

  const restart = (nextMode = mode, nextDifficulty = difficulty) => {
    voice.reset();
    setMode(nextMode); setDifficulty(nextDifficulty); setGame(freshGame()); setSelectedId(null);
    setMatchStarted(true); setOpponentPicker(false);
    setResultOverride(null); setResultDismissed(false); setSeconds(0); setPending(null); setAiFailed(false); setToast('新对局已开始，红方先行');
    if (nextMode === 'npc') voice.react('intro', characterForDifficulty(nextDifficulty).id as VoiceCharacterId);
  };
  const requestRestart = (nextMode = mode, nextDifficulty = difficulty) => {
    if (!game.history.length || result) restart(nextMode, nextDifficulty);
    else setPending({ mode: nextMode, difficulty: nextDifficulty });
  };
  const undo = () => {
    if (!game.history.length) return;
    let index = game.history.length - 1;
    if (mode === 'npc' && game.history[index].side === 'black' && index > 0) index--;
    const entry = game.history[index];
    setGame({ board: entry.before, turn: entry.side, history: game.history.slice(0, index) });
    setSelectedId(null); setResultOverride(null); setResultDismissed(false); setAiFailed(false); setToast('已退回上一步');
    voice.reset();
    if (mode === 'npc') voice.react('undo');
  };
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setToast('此窗口不支持全屏，可在独立浏览器中打开'); }
  };
  const status = result ? `${result.winner ? sideName(result.winner) + '获胜' : '和棋'}` : aiFailed ? `${character.name}暂时停顿` : thinking ? `${character.name}思考中` : `${sideName(game.turn)}行棋`;
  const capturedBy = (side: Side) => game.history.filter((h) => h.side === side && h.captured).map((h) => h.captured!);
  const renderCaptured = (side: Side) => {
    const groups = new Map<string, { piece: Piece; count: number }>();
    for (const piece of capturedBy(side)) {
      const group = groups.get(piece.type);
      if (group) group.count++;
      else groups.set(piece.type, { piece, count: 1 });
    }
    return groups.size ? [...groups.values()].map(({ piece, count }) => <span className="captured-group" key={piece.type} title={`${pieceLabel(piece)} ${count} 枚`}><b className={`captured-piece ${side === 'red' ? 'black-capture' : 'red-capture'}`}>{pieceLabel(piece)}</b>{count > 1 && <small>×{count}</small>}</span>) : <i>—</i>;
  };
  const openOpponentPicker = () => { setPickerDifficulty(difficulty); setPickerMode(mode); setOpponentPicker(true); };
  const renderCharacters = (value: Difficulty, onSelect: (value: Difficulty) => void) => <div className="character-options" role="group" aria-label="NPC 棋友">{characters.map((npc) => <button key={npc.id} className={`character-option ${value === npc.difficulty ? 'active' : ''}`} data-character={npc.id} aria-label={`与${npc.name}对弈`} aria-pressed={value === npc.difficulty} onClick={() => onSelect(npc.difficulty)}><span className="character-portrait"><img src={npc.portrait} alt="" />{value === npc.difficulty && <span className="character-check"><Check size={11} /></span>}</span><strong>{npc.name}</strong><small>{npc.title}</small></button>)}</div>;

  return <div className={`app-shell ${matchStarted ? 'is-playing-game' : 'is-setup'}`}>
    <audio ref={music} className="background-music" src="./music/quiet-pavilion.wav" loop preload="none" onPlay={() => setMusicPlaying(true)} onPause={() => setMusicPlaying(false)} onError={() => { setMusicError(true); setMusicPlaying(false); }} />
    <audio ref={voice.element} className="character-voice" preload="none" onPlay={voice.onPlay} onPause={voice.onPause} onEnded={voice.onEnded} onError={voice.onError} />
    <header className="site-header">
      <a className="brand" href="/" aria-label="弈境首页"><span className="brand-seal">弈</span><span className="brand-name">弈 境<span>CHINESE CHESS</span></span></a>
      <div className="header-center"><span className="nav-active">对弈</span><span className="header-divider" /><span>方寸之间，自有天地</span></div>
      <div className="header-actions"><button className="guide-button" aria-label="对弈指南" onClick={() => setHelp(true)}><CircleHelp size={17} /><span>对弈指南</span></button><span className="header-divider" /><button className="icon-button" aria-label={sound ? '关闭音效' : '打开音效'} title={sound ? '关闭音效' : '打开音效'} onClick={() => setSound(!sound)}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="icon-button fullscreen-button" aria-label={fullScreen ? '退出全屏' : '进入全屏'} title="全屏" onClick={toggleFullscreen}>{fullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button></div>
    </header>

    <main className="workspace">
      <section className="play-area" aria-label="中国象棋对弈区">
        <div className="play-heading"><div><span className="eyebrow">闲 来 一 局</span><h1>中国象棋<span className="tiny-seal">雅弈</span></h1></div><div className="material-label"><span />原木棋盘 <span className="material-dot">·</span> 3D</div></div>
        <div className="board-stage">
          <div className={`player-seat opponent ${game.turn === 'black' && !result ? 'seat-active' : ''}`}>
            {mode === 'npc' ? <img className="npc-avatar" src={character.portrait} alt={`${character.name}，${character.title}`} /> : <span className="piece-avatar black-avatar">将</span>}<div><strong>{mode === 'npc' ? character.name : '黑方棋手'}{mode === 'npc' && <span className="npc-tag">NPC</span>}</strong><span className="seat-caption">{mode === 'npc' ? character.title : '本地双人'}<span className="seat-dot">·</span>执黑</span></div>
            {game.turn === 'black' && !result && <span className="seat-state">{thinking ? '思考中…' : '待落子'}</span>}
          </div>
          <div className="scene" ref={sceneEl} tabIndex={0} role="application" aria-label="3D 象棋盘。鼠标点击棋子及落点，拖动旋转，滚轮缩放。也可用方向键选择位置，回车选棋和落子，Escape 取消。" onBlur={() => setKeyboardCursor(null)} onKeyDown={(e) => {
            if (e.key === 'Escape') { setSelectedId(null); setKeyboardCursor(null); return; }
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) return;
            e.preventDefault(); const cursor = keyboardCursor || { x: 4, y: 6 };
            if (e.key === 'Enter' || e.key === ' ') { setKeyboardCursor(cursor); clickRef.current(cursor.x, cursor.y); }
            else setKeyboardCursor({ x: Math.max(0, Math.min(8, cursor.x + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0))), y: Math.max(0, Math.min(9, cursor.y + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0))) });
          }} />
          {sceneError && <div className="scene-error"><Layers3 size={30} /><p>{sceneError}</p><button className="primary-button" onClick={() => window.location.reload()}>重新加载</button></div>}
          <div className="stage-annotation" aria-hidden="true"><span>楚</span><span>河</span><i /><span>汉</span><span>界</span></div>
          {keyboardCursor && <div className="keyboard-caption" role="status">第 {keyboardCursor.x + 1} 列 · 第 {keyboardCursor.y + 1} 行 · {game.board.find((p) => p.x === keyboardCursor.x && p.y === keyboardCursor.y) ? pieceLabel(game.board.find((p) => p.x === keyboardCursor.x && p.y === keyboardCursor.y)!) : '空位'}<span>回车选棋 / 落子</span></div>}
          <div className={`player-seat player ${game.turn === 'red' && !result ? 'seat-active' : ''}`}><span className="piece-avatar red-avatar">帅</span><div><strong>{mode === 'npc' ? '我方' : '红方棋手'}<span className="you-tag">{mode === 'npc' ? 'YOU' : '先手'}</span></strong><span className="seat-caption">执红<span className="seat-dot">·</span>先行</span></div>{game.turn === 'red' && !result && <span className="seat-state">待落子</span>}</div>
          <div className="view-controls" aria-label="棋盘视角"><button className={view === 'perspective' ? 'selected' : ''} aria-label="立体视角" title="立体视角" aria-pressed={view === 'perspective'} onClick={() => setView('perspective')}><Layers3 size={16} /><span>立体</span></button><button className={view === 'top' ? 'selected' : ''} aria-label="俯视视角" title="俯视视角" aria-pressed={view === 'top'} onClick={() => setView('top')}><Focus size={17} /><span>俯视</span></button><span /><button aria-label="重置视角" title="重置视角" onClick={() => { setView('perspective'); scene.current?.resetView(); }}><RotateCw size={17} /></button></div>
        </div>
        <div className="board-footer"><span><span className="mouse-icon" />拖动旋转<span className="footer-dot">·</span>滚轮缩放<span className="footer-dot">·</span>点击落子</span>
          <div className={`music-player ${musicPlaying ? 'is-playing' : ''}`} role="group" aria-label="背景音乐">
            <button className="music-button" onClick={toggleMusic} aria-label={musicPlaying ? '暂停背景音乐' : '播放背景音乐'} title={musicPlaying ? '暂停背景音乐' : '播放背景音乐'}>{musicPlaying ? <Pause size={15} /> : <Play size={15} />}</button>
            <div className="music-track"><span><Music2 size={12} />松风入弦</span><small>{musicError ? '音乐未能播放，点击重试' : musicPlaying ? '正在播放' : musicEnabled ? '点击棋盘后播放' : '已暂停'}</small></div>
            <span className="music-bars" aria-hidden="true"><i /><i /><i /><i /></span>
            <input type="range" min="0" max="1" step="0.05" value={musicVolume} aria-label="背景音乐音量" onChange={(event) => setMusicVolume(Number(event.target.value))} />
            <output className="music-volume" aria-label="音乐音量百分比">{Math.round(musicVolume * 100)}%</output>
          </div>
        </div>
      </section>

      <aside className="game-panel" aria-label="对局设置和棋谱">
        <section className="settings-section">
          {!matchStarted && <><div className="section-title"><h2>对局设置</h2><span>GAME MODE</span></div><div className="mode-tabs" role="group" aria-label="对战模式"><button className={mode === 'npc' ? 'active' : ''} aria-pressed={mode === 'npc'} onClick={() => setMode('npc')}><Bot size={18} />人机对战</button><button className={mode === 'local' ? 'active' : ''} aria-pressed={mode === 'local'} onClick={() => setMode('local')}><UsersRound size={17} />双人对战</button></div></>}
          {mode === 'npc' ? matchStarted ? <div className="active-opponent">
            <div className="opponent-card-top"><span>本局棋友</span><button className="text-button" onClick={openOpponentPicker}>更换棋友 <ChevronRight size={13} /></button></div>
            <CharacterPortrait id={character.id} name={character.name} mood={mood} speaking={voice.speaking} reactionKey={voice.emotion?.serial || 0} />
            <div className="opponent-identity"><div><h3>{character.name}</h3><small>{character.title}</small></div><span className="mood-label" data-mood={mood}>{moodLabels[mood]}</span></div>
            <div className={`reaction-bubble ${voice.speaking ? 'is-speaking' : ''}`} aria-live="polite" data-event={voice.reaction?.line.event || 'idle'}><p>{voice.error ? '语音暂未能播放，可点击重播。' : voice.reaction?.line.text || character.invitation}</p></div>
            <div className="opponent-controls" role="group" aria-label="角色语音" title="三位角色使用合成语音，全部随游戏离线提供">
              <button className="voice-toggle" aria-label={voice.enabled ? '关闭角色语音' : '打开角色语音'} aria-pressed={voice.enabled} onClick={() => voice.setEnabled(!voice.enabled)}>{voice.enabled ? <Mic size={13} /> : <MicOff size={13} />}<span>语音</span></button>
              <button className="voice-replay" aria-label="重播角色语音" title="重播这一句" onClick={voice.replay} disabled={!voice.reaction}><RotateCcw size={13} /></button>
              <input type="range" min="0" max="1" step="0.05" value={voice.volume} aria-label="角色语音音量" onChange={(event) => voice.setVolume(Number(event.target.value))} />
            </div>
          </div> : <><div className="setting-label"><span>选择棋友</span><span className="character-picker-caption">以棋会友</span></div>{renderCharacters(difficulty, setDifficulty)}<div className="character-intro"><p>{character.invitation}</p><span>{character.style}</span></div></> : <>{matchStarted && <div className="opponent-card-top"><span>本地双人</span><button className="text-button" onClick={openOpponentPicker}>更换棋友 <ChevronRight size={13} /></button></div>}<div className="local-description"><UsersRound size={24} /><p>与身边的朋友切磋<span>同一设备，红黑双方轮流落子</span></p></div></>}
          <button className="primary-button new-game" onClick={() => requestRestart()}><RotateCw size={17} /><span>{matchStarted ? '重新开局' : '开始对弈'}</span><ArrowUpRight size={17} /></button>
        </section>

        <section className="status-section" aria-live="polite"><div className="status-top"><span className={`turn-light ${game.turn} ${thinking ? 'pulsing' : ''}`} /><strong>{status}</strong><span className="round-label">第 {Math.floor(game.history.length / 2) + 1} 回合</span></div><p>{result ? result.reason : aiFailed ? '可重试，或悔棋重新落子' : thinking ? character.thinking : selected ? `已选择「${pieceLabel(selected)}」，点击标记位置落子` : '选择一枚棋子，开启下一步'}</p>{aiFailed && <button className="text-button" onClick={() => { setAiFailed(false); setRetry((n) => n + 1); }}>重新思考 <RotateCw size={14} /></button>}</section>

        <section className="history-section"><div className="section-title"><h2>走棋记录</h2><span className="move-count">{game.history.length.toString().padStart(2, '0')} 步</span></div><div className="history-columns"><span>回合</span><span><i className="red-dot" />红方</span><span><i className="black-dot" />黑方</span></div>
          <div className="move-history" ref={historyEl} tabIndex={0} role="region" aria-label="走棋记录，可滚动">{game.history.length === 0 ? <div className="empty-history"><span className="empty-chess">弈</span><p>棋局初开，静候落子</p><span>每一步，皆有可能</span></div> : Array.from({ length: Math.ceil(game.history.length / 2) }, (_, i) => <div className="history-row" key={i}><span>{(i + 1).toString().padStart(2, '0')}</span><span className={i * 2 === game.history.length - 1 ? 'latest' : ''}>{game.history[i * 2]?.label}</span><span className={i * 2 + 1 === game.history.length - 1 ? 'latest' : ''}>{game.history[i * 2 + 1]?.label || <span className="waiting-move">—</span>}</span></div>)}</div>
        </section>
        <section className="captures-section" aria-label="吃子记录"><div><span>红方吃子</span><div>{renderCaptured('red')}</div></div><div><span>黑方吃子</span><div>{renderCaptured('black')}</div></div></section>
        <div className="match-actions"><button onClick={undo} disabled={!game.history.length}><RotateCcw size={16} />悔棋</button><button onClick={() => setSurrender(true)} disabled={!!result || thinking || !game.history.length}><Flag size={16} />认输</button></div>
        <div className="panel-footer"><span><Clock3 size={13} />对局时长</span><span>{formatTime(seconds)}</span></div>
      </aside>
    </main>
    <footer className="site-footer"><span>弈境 <i>/</i> 一局一世界</span><span>红先黑后 · 以棋会友</span></footer>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}

    {opponentPicker && <Modal title="更换棋友" onClose={() => setOpponentPicker(false)} className="opponent-picker"><p className="modal-intro">选一位棋友，另开一局。当前对局会在确认后结束。</p><div className="mode-tabs" role="group" aria-label="对战模式"><button className={pickerMode === 'npc' ? 'active' : ''} aria-pressed={pickerMode === 'npc'} onClick={() => setPickerMode('npc')}><Bot size={17} />人机对战</button><button className={pickerMode === 'local' ? 'active' : ''} aria-pressed={pickerMode === 'local'} onClick={() => setPickerMode('local')}><UsersRound size={17} />双人对战</button></div>{pickerMode === 'npc' && <>{renderCharacters(pickerDifficulty, setPickerDifficulty)}<div className="character-intro"><p>{characterForDifficulty(pickerDifficulty).invitation}</p><span>{characterForDifficulty(pickerDifficulty).style}</span></div></>}<div className="modal-actions"><button className="secondary-button" onClick={() => setOpponentPicker(false)}>继续当前棋局</button><button className="primary-button" onClick={() => restart(pickerMode, pickerDifficulty)}>开始新对局 <ArrowUpRight size={16} /></button></div></Modal>}

    {help && <Modal title="对弈指南" onClose={() => setHelp(false)} className="help-modal"><p className="modal-intro">一方棋盘，红黑两军。吃掉对方的将或帅，即可获胜。</p><div className="guide-items"><div><span>01</span><div><h3>选择你的对手</h3><p>从阿棠、沈砚、陆隐中选择一位棋友，由你执红先行。双人对战在同一设备上交替操作。</p></div></div><div><span>02</span><div><h3>选棋，再落子</h3><p>点击己方棋子查看合法落点，再点击标记的位置。再次点击所选棋子可取消选择。</p></div></div><div><span>03</span><div><h3>换个角度看棋局</h3><p>拖动棋盘旋转视角，滚轮或双指缩放。「俯视」切换为平直视角，「重置视角」回到初始位置。</p></div></div></div><div className="rules-grid"><p><b>车</b>横直行走，不可越子</p><p><b>马</b>走日字，注意蹩马腿</p><p><b>象</b>走田字，不得过河</p><p><b>士</b>斜行一步，不离九宫</p><p><b>将</b>九宫内行走，照面可飞将</p><p><b>炮</b>走如车，隔一子吃子</p><p><b>兵</b>向前一步，过河后可横行</p></div><p className="keyboard-help">键盘操作：聚焦棋盘后，方向键移动光标，回车或空格选棋 / 落子，Esc 取消。不提示将军，也不强制应将；可以冒险走其他棋，直到将或帅被吃才判胜。背景音乐支持独立暂停和音量调节。</p><button className="primary-button" onClick={() => setHelp(false)}>入局对弈 <ChevronRight size={16} /></button></Modal>}
    {pending && <Modal title="开始新的对局？" onClose={() => setPending(null)}><p className="modal-intro">当前棋局和走棋记录将被清空，新一局由红方先行。</p><div className="modal-actions"><button className="secondary-button" onClick={() => setPending(null)}>继续当前棋局</button><button className="primary-button" onClick={() => restart(pending.mode, pending.difficulty)}>开始新对局 <ArrowUpRight size={16} /></button></div></Modal>}
    {surrender && <Modal title="确认认输？" onClose={() => setSurrender(false)}><p className="modal-intro">{sideName(game.turn)}认输后，本局结束，{sideName(game.turn === 'red' ? 'black' : 'red')}获胜。</p><div className="modal-actions"><button className="secondary-button" onClick={() => setSurrender(false)}>再想一步</button><button className="primary-button" onClick={() => { setResultOverride({ winner: game.turn === 'red' ? 'black' : 'red', reason: `${sideName(game.turn)}认输` }); setSelectedId(null); setSurrender(false); if (mode === 'npc') voice.react(game.turn === 'red' ? 'win' : 'lose'); }}>确认认输</button></div></Modal>}
    {result && !resultDismissed && !surrender && !pending && <Modal title="本局已结束" onClose={() => setResultDismissed(true)} className="result-modal"><span className={`result-piece ${result.winner === 'red' ? 'red-avatar' : 'black-avatar'}`}>{result.winner === 'red' ? '帅' : result.winner === 'black' ? '将' : '和'}</span><h3>{status}</h3><p>{result.reason}</p><span className="result-details">共 {game.history.length} 步 · {formatTime(seconds)}</span><button className="primary-button" onClick={() => restart()}>再弈一局 <RotateCw size={17} /></button><button className="text-button" onClick={() => setResultDismissed(true)}><ArrowLeft size={15} />回看棋局</button></Modal>}
  </div>;
}

export default App;
