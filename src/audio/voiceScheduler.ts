import type { PieceType, Side } from '../game/engine';
import type { VoiceCharacterId, VoiceEvent } from './voiceLines';

export interface MoveReaction { side: Side; captured?: PieceType; outcome?: 'win' | 'lose' }
export interface VoiceClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(timer: unknown): void;
}
export interface ScheduledReaction {
  event: VoiceEvent;
  characterId: VoiceCharacterId;
  token: number;
  audible: boolean;
  replay: boolean;
}
export interface VoiceSchedulerCallbacks {
  publish(reaction: ScheduledReaction): void;
  stop(options: { fadeMs: number; clearCaption: boolean }): void;
}

export const VOICE_TIMING = {
  settleMs: 900,
  fadeMs: 120,
  breathMs: 300,
  combatCooldownMs: 4500,
  thinkingCooldownMs: 22000,
} as const;

interface Exchange {
  lost: boolean;
  gained: boolean;
  strongLost: boolean;
  strongGained: boolean;
  waitingForNpc: boolean;
  characterId: VoiceCharacterId;
}
interface Published {
  reaction: ScheduledReaction;
  playing: boolean;
  at: number;
  exchange: Exchange | null;
}
const combatEvents = new Set<VoiceEvent>(['capture', 'lost', 'strongCapture', 'strongLost', 'exchange']);
const strong = (piece?: PieceType) => piece === 'rook' || piece === 'horse' || piece === 'cannon';
const exchangeEvent = (batch: Exchange): VoiceEvent => batch.lost && batch.gained ? 'exchange'
  : batch.gained ? batch.strongGained ? 'strongCapture' : 'capture'
    : batch.strongLost ? 'strongLost' : 'lost';
const emptyExchange = (characterId: VoiceCharacterId): Exchange => ({
  lost: false, gained: false, strongLost: false, strongGained: false, waitingForNpc: false, characterId,
});

/** One mutable turn exchange, never a queue of sentences. Audio/React are adapters. */
export function createVoiceScheduler(clock: VoiceClock, callbacks: VoiceSchedulerCallbacks, initiallyEnabled = true) {
  let enabled = initiallyEnabled;
  let pending: Exchange | null = null;
  let active: Published | null = null;
  let recentCombat: Published | null = null;
  let timer: unknown = null;
  let epoch = 0;
  let token = 0;
  let lastPublishedAt = -Infinity;
  let quietAfter = -Infinity;
  let terminal = false;
  let disposed = false;
  let context: VoiceCharacterId | null = null;

  const clearTimer = () => {
    epoch++;
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  };
  const stop = (fadeMs: number, clearCaption: boolean) => {
    token++;
    active = null;
    quietAfter = clock.now() + fadeMs + VOICE_TIMING.breathMs;
    callbacks.stop({ fadeMs, clearCaption });
  };
  const clear = (clearCaption: boolean) => {
    clearTimer(); pending = null; recentCombat = null;
    stop(0, clearCaption);
  };
  const publish = (event: VoiceEvent, characterId: VoiceCharacterId, exchange: Exchange | null = null, replay = false) => {
    const reaction = { event, characterId, token: ++token, audible: enabled, replay };
    context = characterId;
    active = { reaction, at: clock.now(), playing: enabled, exchange };
    lastPublishedAt = clock.now();
    if (exchange) recentCombat = active;
    callbacks.publish(reaction);
  };
  const setContext = (characterId: VoiceCharacterId) => {
    if (context !== null && context !== characterId) { clear(true); terminal = false; }
    context = characterId;
  };
  const freshCombat = () => recentCombat && (clock.now() - recentCombat.at < VOICE_TIMING.combatCooldownMs
    || (active === recentCombat && recentCombat.playing)) ? recentCombat : null;
  const settle = () => {
    clearTimer();
    if (!pending || pending.waitingForNpc) return;
    const ticket = epoch;
    const delay = Math.max(VOICE_TIMING.settleMs, quietAfter - clock.now());
    timer = clock.setTimeout(() => {
      if (disposed || ticket !== epoch || !pending || pending.waitingForNpc) return;
      timer = null;
      const batch = pending;
      pending = null;
      const event = exchangeEvent(batch), recent = freshCombat();
      // A continued run of captures does not need another rendition of the same sentiment.
      // Keep the already synchronized face/caption, and never append another sentence.
      if (recent && recent.reaction.event === event && recent.reaction.characterId === batch.characterId) return;
      if (active?.playing) stop(0, true);
      publish(event, batch.characterId, { ...batch });
    }, delay);
  };

  const onMove = (move: MoveReaction, characterId: VoiceCharacterId) => {
    if (disposed || terminal) return;
    setContext(characterId);
    if (move.outcome) {
      clear(true); terminal = true;
      publish(move.outcome, characterId);
      return;
    }
    if (move.captured) {
      if (!pending) {
        const recent = freshCombat();
        pending = recent?.exchange && recent.reaction.characterId === characterId
          ? { ...recent.exchange } : emptyExchange(characterId);
      }
      if (move.side === 'red') { pending.lost = true; pending.strongLost ||= strong(move.captured); }
      else { pending.gained = true; pending.strongGained ||= strong(move.captured); }
      const event = exchangeEvent(pending);
      if (active && (!combatEvents.has(active.reaction.event) || active.reaction.event !== event)) {
        // Opposite emotions invalidate the old performance, including its asynchronous play promise.
        stop(VOICE_TIMING.fadeMs, true);
      }
    }
    if (!pending) return;
    // A red capture is unresolved until the NPC actually replies, however long it thinks.
    // Any quick red continuation also extends the same unsettled exchange.
    pending.waitingForNpc = move.side === 'red';
    settle();
  };

  const react = (event: VoiceEvent, characterId: VoiceCharacterId) => {
    if (disposed) return;
    setContext(characterId);
    if (event === 'win' || event === 'lose' || event === 'undo') {
      clear(true); terminal = event !== 'undo';
      publish(event, characterId);
      return;
    }
    if (terminal) return;
    if (combatEvents.has(event)) {
      // Compatibility for explicit reaction previews; live play uses onMove with turn context.
      pending = emptyExchange(characterId);
      pending.lost = event === 'lost' || event === 'strongLost' || event === 'exchange';
      pending.gained = event === 'capture' || event === 'strongCapture' || event === 'exchange';
      pending.strongLost = event === 'strongLost'; pending.strongGained = event === 'strongCapture';
      if (active) stop(VOICE_TIMING.fadeMs, true);
      settle();
      return;
    }
    // Intro/thinking are optional atmosphere, never deferred behind a meaningful event.
    if (pending || active?.playing) return;
    if (event === 'thinking' && clock.now() - lastPublishedAt < VOICE_TIMING.thinkingCooldownMs) return;
    publish(event, characterId);
  };

  return {
    onMove, react, setContext,
    setEnabled(next: boolean) {
      if (next === enabled || disposed) return;
      enabled = next;
      // Muting/unmuting cannot leave a hidden sentence scheduled for later playback.
      clear(false);
    },
    reset() { if (!disposed) { clear(true); terminal = false; lastPublishedAt = -Infinity; } },
    replay(event: VoiceEvent, characterId: VoiceCharacterId) {
      if (disposed) return;
      clear(false); enabled = true; context = characterId;
      publish(event, characterId, null, true);
    },
    isCurrent(ticket: number) { return !disposed && active?.reaction.token === ticket; },
    started(ticket: number) {
      if (disposed || active?.reaction.token !== ticket || !active.reaction.audible) return false;
      active.playing = true;
      return true;
    },
    finished(ticket: number) {
      if (disposed || active?.reaction.token !== ticket) return false;
      active.playing = false;
      return true;
    },
    dispose() {
      if (disposed) return;
      clear(false); disposed = true;
    },
  };
}

export type VoiceScheduler = ReturnType<typeof createVoiceScheduler>;
