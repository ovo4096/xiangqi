import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoiceScheduler, VOICE_TIMING, type ScheduledReaction } from './voiceScheduler';

function harness(enabled = true) {
  let time = 0, nextId = 0;
  const jobs = new Map<number, { at: number; callback: () => void }>();
  const callbacks: (() => void)[] = [];
  const emitted: (ScheduledReaction & { at: number })[] = [];
  const stops: { at: number; fadeMs: number; clearCaption: boolean }[] = [];
  const clock = {
    now: () => time,
    setTimeout(callback: () => void, delay: number) {
      callbacks.push(callback);
      jobs.set(++nextId, { at: time + delay, callback });
      return nextId;
    },
    clearTimeout(id: unknown) { jobs.delete(id as number); },
  };
  const advance = (milliseconds: number) => {
    const target = time + milliseconds;
    while (jobs.size) {
      const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (next[1].at > target) break;
      time = next[1].at; jobs.delete(next[0]); next[1].callback();
    }
    time = target;
  };
  const scheduler = createVoiceScheduler(clock, {
    publish: event => emitted.push({ ...event, at: time }),
    stop: options => stops.push({ ...options, at: time }),
  }, enabled);
  const move = (input: Parameters<typeof scheduler.onMove>[0]) => scheduler.onMove(input, 'wen-yi');
  return { scheduler, move, advance, emitted, stops, callbacks, pendingTimers: () => jobs.size };
}

test('a loss waits for the real long-thinking NPC reply and settles once as an exchange', () => {
  const h = harness();
  h.move({ side: 'red', captured: 'horse' });
  h.advance(2800);
  assert.equal(h.emitted.length, 0);
  assert.equal(h.pendingTimers(), 0);
  h.move({ side: 'black', captured: 'cannon' });
  h.advance(899); assert.equal(h.emitted.length, 0);
  h.advance(1);
  assert.deepEqual(h.emitted.map(event => event.event), ['exchange']);
  assert.equal(h.emitted[0].at, 3700);
  h.advance(20000); assert.equal(h.emitted.length, 1);
});

test('NPC capture followed by a quick player recapture waits again before speaking', () => {
  const h = harness();
  h.move({ side: 'black', captured: 'pawn' });
  h.advance(600);
  h.move({ side: 'red', captured: 'rook' });
  h.advance(10000);
  assert.equal(h.emitted.length, 0);
  h.move({ side: 'black' });
  h.advance(VOICE_TIMING.settleMs);
  assert.deepEqual(h.emitted.map(event => event.event), ['exchange']);
});

test('a loss without a recapture is spoken only after the NPC quiet reply', () => {
  const h = harness();
  h.move({ side: 'red', captured: 'rook' });
  h.advance(6000);
  h.move({ side: 'black' });
  h.advance(900);
  assert.deepEqual(h.emitted.map(event => event.event), ['strongLost']);
});

test('an opposite event fades the already spoken capture and invalidates its callbacks', () => {
  const h = harness();
  h.move({ side: 'black', captured: 'pawn' }); h.advance(900);
  const old = h.emitted[0].token;
  assert.equal(h.scheduler.started(old), true);
  h.advance(300); h.move({ side: 'red', captured: 'cannon' });
  assert.deepEqual(h.stops.at(-1), { at: 1200, fadeMs: 120, clearCaption: true });
  assert.equal(h.scheduler.started(old), false);
  assert.equal(h.scheduler.finished(old), false);
  h.advance(2800); h.move({ side: 'black' }); h.advance(900);
  assert.deepEqual(h.emitted.map(event => event.event), ['capture', 'exchange']);
  assert.equal(h.scheduler.isCurrent(h.emitted[1].token), true);
  assert.ok(h.emitted[1].at - h.stops[0].at >= VOICE_TIMING.fadeMs + VOICE_TIMING.breathMs);
});

test('already spoken regret followed by an NPC capture changes to measured exchange', () => {
  const h = harness();
  h.move({ side: 'red', captured: 'pawn' }); h.move({ side: 'black' }); h.advance(900);
  h.advance(200); h.move({ side: 'red' }); h.move({ side: 'black', captured: 'rook' }); h.advance(900);
  assert.deepEqual(h.emitted.map(event => event.event), ['lost', 'exchange']);
  assert.equal(h.stops[0].fadeMs, 120);
});

test('continued captures use one batch and suppress repeated sentiment during speech', () => {
  const h = harness();
  h.move({ side: 'black', captured: 'pawn' }); h.advance(900);
  for (let i = 0; i < 4; i++) {
    h.advance(100); h.move({ side: 'red' }); h.move({ side: 'black', captured: 'pawn' }); h.advance(900);
  }
  assert.deepEqual(h.emitted.map(event => event.event), ['capture']);
  assert.equal(h.stops.length, 0);
  h.scheduler.finished(h.emitted[0].token); h.advance(4500);
  h.move({ side: 'black', captured: 'pawn' }); h.advance(900);
  assert.equal(h.emitted.length, 2);
});

test('a rapid sequence keeps its strongest lost piece and only one pending timer', () => {
  const h = harness();
  h.move({ side: 'red', captured: 'pawn' }); h.move({ side: 'black' }); h.advance(300);
  h.move({ side: 'red', captured: 'rook' }); h.move({ side: 'black' });
  assert.equal(h.pendingTimers(), 1);
  h.advance(900);
  assert.deepEqual(h.emitted.map(event => event.event), ['strongLost']);
});

test('victory overrides an unsettled exchange immediately, including stale timer dispatch', () => {
  const h = harness();
  h.move({ side: 'black', captured: 'cannon' });
  const stale = h.callbacks[0];
  h.advance(100); h.move({ side: 'red', captured: 'general', outcome: 'lose' });
  stale(); h.advance(5000);
  h.move({ side: 'black', captured: 'pawn' }); h.scheduler.react('thinking', 'wen-yi'); h.advance(900);
  assert.deepEqual(h.emitted.map(event => [event.event, event.at]), [['lose', 100]]);
});

test('muting clears old pending speech; new muted exchanges still publish one final caption event', () => {
  const h = harness();
  h.move({ side: 'black', captured: 'rook' });
  const stale = h.callbacks[0];
  h.scheduler.setEnabled(false); stale(); h.advance(5000);
  assert.equal(h.emitted.length, 0);
  h.move({ side: 'red', captured: 'rook' }); h.advance(2800);
  h.move({ side: 'black', captured: 'cannon' }); h.advance(900);
  assert.deepEqual(h.emitted.map(event => [event.event, event.audible]), [['exchange', false]]);
  assert.equal(h.scheduler.started(h.emitted[0].token), false);
  h.scheduler.setEnabled(true); h.advance(5000);
  assert.equal(h.emitted.length, 1);
});

test('reset cancels timers and playing callbacks; a fresh intro remains usable', () => {
  const h = harness();
  h.scheduler.react('intro', 'wen-yi');
  const token = h.emitted[0].token;
  h.move({ side: 'black', captured: 'rook' }); const stale = h.callbacks[0];
  h.scheduler.reset(); stale(); h.advance(900);
  assert.equal(h.scheduler.finished(token), false);
  assert.equal(h.scheduler.started(token), false);
  h.scheduler.react('intro', 'wen-yi');
  assert.deepEqual(h.emitted.map(event => event.event), ['intro', 'intro']);
});

test('changing character and unmounting invalidate every old source and timeout', () => {
  const h = harness();
  h.move({ side: 'black', captured: 'rook' }); const stale = h.callbacks[0];
  h.scheduler.setContext('a-tang'); stale(); h.advance(900);
  assert.equal(h.emitted.length, 0);
  h.scheduler.react('intro', 'a-tang');
  const token = h.emitted[0].token;
  h.scheduler.dispose(); h.scheduler.react('win', 'a-tang');
  h.scheduler.onMove({ side: 'black', captured: 'general', outcome: 'win' }, 'a-tang');
  assert.equal(h.scheduler.started(token), false);
  assert.equal(h.emitted.length, 1);
});

test('replay cancels pending moves instead of restoring a queue and explicitly enables audio', () => {
  const h = harness(false);
  h.scheduler.react('intro', 'wen-yi');
  h.move({ side: 'black', captured: 'rook' }); const stale = h.callbacks[0];
  h.scheduler.replay('intro', 'wen-yi'); stale(); h.advance(10000);
  assert.deepEqual(h.emitted.map(event => [event.event, event.replay, event.audible]), [
    ['intro', false, false], ['intro', true, true],
  ]);
});

test('intro and thinking never accumulate behind captures or existing speech', () => {
  const h = harness();
  h.move({ side: 'red', captured: 'rook' });
  h.scheduler.react('intro', 'wen-yi'); h.scheduler.react('thinking', 'wen-yi');
  h.move({ side: 'black', captured: 'pawn' }); h.advance(900);
  h.scheduler.react('thinking', 'wen-yi');
  h.scheduler.finished(h.emitted[0].token);
  h.advance(20000); h.scheduler.react('thinking', 'wen-yi');
  assert.deepEqual(h.emitted.map(event => event.event), ['exchange']);
  h.advance(2000); h.scheduler.react('thinking', 'wen-yi');
  assert.deepEqual(h.emitted.map(event => event.event), ['exchange', 'thinking']);
});

test('undo discards a long-thinking loss and publishes only its current response', () => {
  const h = harness();
  h.move({ side: 'red', captured: 'rook' }); h.advance(200);
  h.scheduler.react('undo', 'wen-yi'); h.advance(3000); h.move({ side: 'black' }); h.advance(900);
  assert.deepEqual(h.emitted.map(event => event.event), ['undo']);
  assert.equal(h.pendingTimers(), 0);
});
