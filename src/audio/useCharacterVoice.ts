import { useCallback, useEffect, useRef, useState } from 'react';
import { createLinePicker, voicePriority } from './reactions';
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
  const [enabled, setEnabled] = useState(() => preferences().enabled);
  const [volume, setVolume] = useState(() => preferences().volume);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(false);
  const [reaction, setReaction] = useState<{ line: VoiceLine; serial: number } | null>(null);
  const [emotion, setEmotion] = useState<{ event: VoiceEvent; serial: number } | null>(null);
  const current = useRef<VoiceLine | null>(null);
  const pending = useRef<VoiceLine | null>(null);
  const pick = useRef(createLinePicker());
  const lastSpoke = useRef(0);
  const serial = useRef(0);
  const emotionSerial = useRef(0);
  const generation = useRef(0);
  const state = useRef({ enabled, volume, characterId });
  state.current = { enabled, volume, characterId };

  const stop = useCallback(() => {
    generation.current++;
    pending.current = null;
    current.current = null;
    element.current?.pause();
    setSpeaking(false);
  }, []);

  const play = useCallback((line: VoiceLine) => {
    const player = element.current;
    const ticket = ++generation.current;
    current.current = line;
    lastSpoke.current = Date.now();
    setReaction({ line, serial: ++serial.current });
    setError(false);
    if (!player || !state.current.enabled) { current.current = null; return; }
    player.pause();
    player.src = line.src;
    player.volume = state.current.volume;
    player.load();
    void player.play().catch((reason: unknown) => {
      if (ticket !== generation.current) return;
      current.current = null;
      setSpeaking(false);
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
    });
  }, []);

  const react = useCallback((event: VoiceEvent, target = state.current.characterId) => {
    if (event === 'thinking' && (current.current || Date.now() - lastSpoke.current < 22000)) return;
    const line = pick.current(target, event);
    // The face reacts immediately, even if a previous spoken sentence is finishing.
    setEmotion({ event, serial: ++emotionSerial.current });
    const playing = current.current;
    if (state.current.enabled && playing && voicePriority[event] < 4) {
      // Keep just the most important next reaction; voices never overlap or build a backlog.
      if (!pending.current || voicePriority[event] >= voicePriority[pending.current.event]) pending.current = line;
      return;
    }
    pending.current = null;
    play(line);
  }, [play]);

  const finish = useCallback(() => {
    current.current = null;
    setSpeaking(false);
    const next = pending.current;
    pending.current = null;
    if (next && state.current.enabled && next.characterId === state.current.characterId) play(next);
  }, [play]);

  const reset = useCallback(() => { stop(); setReaction(null); setEmotion(null); setError(false); }, [stop]);
  const replay = useCallback(() => {
    if (!reaction || reaction.line.characterId !== state.current.characterId) return;
    stop();
    state.current.enabled = true;
    setEnabled(true);
    setEmotion({ event: reaction.line.event, serial: ++emotionSerial.current });
    play(reaction.line);
  }, [reaction, stop, play]);

  useEffect(() => {
    if (element.current) element.current.volume = volume;
    try {
      localStorage.setItem('yijing.voice.enabled', String(enabled));
      localStorage.setItem('yijing.voice.volume', String(volume));
    } catch { /* Voice playback does not depend on preference storage. */ }
    if (!enabled) stop();
  }, [enabled, volume, stop]);
  useEffect(() => () => { generation.current++; element.current?.pause(); }, []);

  return { element, enabled, setEnabled, volume, setVolume, speaking, error, reaction, emotion, react, reset, replay,
    onPlay: () => setSpeaking(true), onPause: () => setSpeaking(false), onEnded: finish,
    onError: () => { setError(true); finish(); } };
}
