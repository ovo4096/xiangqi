import assert from 'node:assert/strict';
import test from 'node:test';
import { statSync } from 'node:fs';
import path from 'node:path';
import { createLinePicker } from './reactions';
import { voiceLines, type VoiceCharacterId, type VoiceEvent } from './voiceLines';
import { characters as opponents } from '../game/characters';

const characters = Object.keys(voiceLines) as VoiceCharacterId[];
test('every selectable opponent has an independent voice bank and three packaged expressions', () => {
  assert.equal(opponents.length, 4);
  assert.equal(new Set(opponents.map(character => character.difficulty)).size, 4);
  assert.equal(opponents.find(character => character.difficulty === 'master')?.id, 'wen-yi');
  assert.deepEqual(opponents.map(character => character.id).sort(), [...characters].sort());
  for (const character of opponents) for (const suffix of ['', '-joy', '-regret']) {
    assert.ok(statSync(`public/characters/${character.id}${suffix}.png`).size > 1000);
  }
});
test('reaction bags exhaust each category before repeating and never repeat across cycle boundaries', () => {
  const pick = createLinePicker(() => 0.5);
  for (const character of characters) for (const event of Object.keys(voiceLines[character]) as VoiceEvent[]) {
    const size = voiceLines[character][event].length;
    const selected = Array.from({ length: size * 4 }, () => pick(character, event));
    for (let i = 0; i < selected.length; i += size) assert.equal(new Set(selected.slice(i, i + size).map(line => line.src)).size, size);
    for (let i = 1; i < selected.length; i++) assert.notEqual(selected[i].src, selected[i - 1].src);
  }
});

test('switching between opponents or events preserves each independent dialogue bag', () => {
  const pick = createLinePicker(() => 0);
  const first = pick('a-tang', 'lost');
  for (let i = 0; i < 9; i++) { pick('shen-yan', 'intro'); pick('lu-yin', 'win'); pick('a-tang', 'capture'); }
  const rest = Array.from({ length: voiceLines['a-tang'].lost.length - 1 }, () => pick('a-tang', 'lost'));
  assert.equal(new Set([first, ...rest].map(line => line.src)).size, voiceLines['a-tang'].lost.length);
  assert.ok(rest.every(line => line.characterId === 'a-tang' && line.event === 'lost'));
});

test('the complete reaction catalogue ships local audio and contains no check announcements', () => {
  const sources = new Set<string>();
  let count = 0;
  for (const character of characters) for (const [event, lines] of Object.entries(voiceLines[character])) {
    assert.ok(lines.length >= 4, `${character}/${event} needs varied dialogue`);
    for (const line of lines) {
      assert.equal(line.characterId, character);
      assert.equal(line.event, event);
      assert.doesNotMatch(line.text, /将军|应将|将死|困毙/);
      assert.match(line.src, /^\.\/voices\/[a-z-]+\/[A-Za-z]+-[0-9]+\.mp3$/);
      assert.ok(statSync(path.join('public', line.src)).size > 1000, `${line.src} must contain packaged audio`);
      assert.equal(sources.has(line.src), false);
      sources.add(line.src); count++;
    }
  }
  assert.equal(count, 144);
});
