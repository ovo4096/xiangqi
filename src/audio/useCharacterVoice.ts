import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { createLinePicker } from './reactions';
import { createVoiceScheduler, type MoveReaction, type ScheduledReaction, type VoiceScheduler } from './voiceScheduler';
import type { VoiceCharacterId, VoiceEvent, VoiceLine } from './voiceLines';

function preferences() {
  try {
    const stored = localStorage.getItem('yijing.voice.volume');
    const volume = stored === null ? 0.8 : Number(stored);
    return { enabled: localStorage.getItem('yijing.voice.enabled') !== 'false', volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.8 };
  } catch { return { enabled: true, volume: 0.8 }; }
}

export function useCharacterVoice(characterId: VoiceCharacterId) {
  const element = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabledState] = useState(() => preferences().enabled);
  const [volume, setVolume] = useState(() => preferences().volume);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(false);
  const [reaction, setReaction] = useState<{ line: VoiceLine; serial: number } | null>(null);
  const [emotion, setEmotion] = useState<{ event: VoiceEvent; serial: number } | null>(null);
  const visibleLine = useRef<VoiceLine | null>(null);
  const pick = useRef(createLinePicker());
  const serial = useRef(0);
  const generation = useRef(0);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaCleanup = useRef<(() => void) | null>(null);
  const scheduler = useRef<VoiceScheduler | null>(null);
  const mounted = useRef(true);
  const state = useRef({ enabled, volume, characterId });
  state.current = { enabled, volume, characterId };

  const clearFade = useCallback(() => {
    if (fadeTimer.current !== null) clearTimeout(fadeTimer.current);
    fadeTimer.current = null;
  }, []);

  const stopAudio = useCallback(({ fadeMs, clearCaption }: { fadeMs: number; clearCaption: boolean }) => {
    const ticket = ++generation.current;
    clearFade();
    mediaCleanup.current?.(); mediaCleanup.current = null;
    if (clearCaption) {
      visibleLine.current = null;
      if (mounted.current) { setReaction(null); setEmotion(null); }
    }
    if (mounted.current) setError(false);
    const player = element.current;
    if (!player || player.paused || !fadeMs) {
      player?.pause();
      if (player) player.volume = state.current.volume;
      if (mounted.current) setSpeaking(false);
      return;
    }
    const started = performance.now(), fromVolume = player.volume;
    const fade = () => {
      if (ticket !== generation.current || player !== element.current) return;
      const progress = Math.min(1, (performance.now() - started) / fadeMs);
      player.volume = fromVolume * (1 - progress);
      if (progress < 1) fadeTimer.current = setTimeout(fade, 20);
      else {
        fadeTimer.current = null;
        player.pause(); player.volume = state.current.volume;
        if (mounted.current) setSpeaking(false);
      }
    };
    fade();
  }, [clearFade]);

  const publish = useCallback((scheduled: ScheduledReaction) => {
    const previous = visibleLine.current;
    const line = scheduled.replay && previous?.characterId === scheduled.characterId && previous.event === scheduled.event
      ? previous : pick.current(scheduled.characterId, scheduled.event);
    const ticket = ++generation.current;
    clearFade();
    mediaCleanup.current?.(); mediaCleanup.current = null;
    visibleLine.current = line;
    const nextSerial = ++serial.current;
    // A settled exchange commits its caption and expression together, also when muted.
    setReaction({ line, serial: nextSerial });
    setEmotion({ event: line.event, serial: nextSerial });
    setError(false);
    const player = element.current;
    player?.pause();
    setSpeaking(false);
    if (!player || !scheduled.audible || !state.current.enabled) return;
    player.src = line.src;
    player.volume = state.current.volume;
    player.load();
    const source = player.src;
    const currentMedia = () => ticket === generation.current && mounted.current
      && scheduler.current?.isCurrent(scheduled.token) && player.currentSrc === source;
    const paused = () => { if (currentMedia() && player.paused) setSpeaking(false); };
    const ended = () => {
      if (currentMedia() && player.ended && scheduler.current?.finished(scheduled.token)) setSpeaking(false);
    };
    const failed = () => {
      if (currentMedia() && player.error && scheduler.current?.finished(scheduled.token)) { setError(true); setSpeaking(false); }
    };
    player.addEventListener('pause', paused);
    player.addEventListener('ended', ended);
    player.addEventListener('error', failed);
    mediaCleanup.current = () => {
      player.removeEventListener('pause', paused);
      player.removeEventListener('ended', ended);
      player.removeEventListener('error', failed);
    };
    void player.play().then(() => {
      if (ticket !== generation.current || !mounted.current) return;
      if (scheduler.current?.started(scheduled.token) && !player.paused) setSpeaking(true);
    }).catch((reason: unknown) => {
      if (ticket !== generation.current || !mounted.current || !scheduler.current?.finished(scheduled.token)) return;
      setSpeaking(false);
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
    });
  }, [clearFade]);

  const getScheduler = useCallback(() => {
    if (!scheduler.current) scheduler.current = createVoiceScheduler({
      now: () => performance.now(),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
    }, { publish, stop: stopAudio }, state.current.enabled);
    return scheduler.current;
  }, [publish, stopAudio]);

  const react = useCallback((event: VoiceEvent, target = state.current.characterId) => {
    getScheduler().react(event, target);
  }, [getScheduler]);
  const onMove = useCallback((move: MoveReaction) => {
    getScheduler().onMove(move, state.current.characterId);
  }, [getScheduler]);
  const reset = useCallback(() => { getScheduler().reset(); }, [getScheduler]);
  const setEnabled = useCallback((next: SetStateAction<boolean>) => {
    const value = typeof next === 'function' ? next(state.current.enabled) : next;
    state.current.enabled = value;
    setEnabledState(value);
    getScheduler().setEnabled(value);
  }, [getScheduler]);
  const replay = useCallback(() => {
    const line = visibleLine.current;
    if (!line || line.characterId !== state.current.characterId) return;
    state.current.enabled = true; setEnabledState(true);
    getScheduler().replay(line.event, line.characterId);
  }, [getScheduler]);

  useEffect(() => {
    if (element.current && fadeTimer.current === null) element.current.volume = volume;
    try {
      localStorage.setItem('yijing.voice.enabled', String(enabled));
      localStorage.setItem('yijing.voice.volume', String(volume));
    } catch { /* Voice playback does not depend on preference storage. */ }
  }, [enabled, volume]);
  useEffect(() => { getScheduler().setContext(characterId); }, [characterId, getScheduler]);
  useEffect(() => {
    mounted.current = true;
    getScheduler();
    return () => {
      mounted.current = false;
      scheduler.current?.dispose(); scheduler.current = null;
      generation.current++; clearFade(); element.current?.pause();
    };
  }, [getScheduler, clearFade]);

  return { element, enabled, setEnabled, volume, setVolume, speaking, error, reaction, emotion, react, onMove, reset, replay,
    // Playback promises and per-source native listeners carry immutable generation tokens.
    // React handlers remain for the existing component interface and cannot adopt old events.
    onPlay: () => {},
    onPause: () => {}, onEnded: () => {}, onError: () => {} };
}
