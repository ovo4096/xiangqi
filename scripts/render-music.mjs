/**
 * Ink and Moon / 墨月闲庭
 * Original composition and offline synthesis for 弈境 · 中国象棋.
 * No samples, recordings, external packages or network access are used.
 * Rebuild from the repository root: node scripts/render-music.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const SECONDS = 96;
const FRAMES = SAMPLE_RATE * SECONDS;
const TAU = 2 * Math.PI;
const left = new Float64Array(FRAMES);
const right = new Float64Array(FRAMES);
let seed = 0x4d4f4f4e;
function random() {
  seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  return seed / 0x1_0000_0000;
}
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const panGains = (pan) => [Math.cos((pan + 1) * Math.PI / 4), Math.sin((pan + 1) * Math.PI / 4)];

// Every decaying tail is wrapped into the start of the file. This renders an
// already settled, circular sound field, rather than cutting off the last note.
function mix(event, mono) {
  const start = Math.round(event.at * SAMPLE_RATE);
  const [l, r] = panGains(event.pan);
  for (let i = 0; i < mono.length; i++) {
    const index = (start + i + FRAMES) % FRAMES;
    left[index] += mono[i] * l;
    right[index] += mono[i] * r;
  }
}

function pluck(event) {
  const fundamental = hz(event.note) * (1 + (random() - 0.5) * 0.0008);
  const decay = event.decay ?? 2.8;
  const length = Math.ceil((decay * 4 + 0.04) * SAMPLE_RATE);
  const mono = new Float64Array(length);
  const position = 0.24 + random() * 0.035;
  // A lightly inharmonic, damped string. Upper modes die away much faster;
  // all attacks are rounded to avoid hard digital clicks.
  for (let harmonic = 1; harmonic <= 10; harmonic++) {
    const frequency = fundamental * harmonic * Math.sqrt(1 + 0.000006 * harmonic ** 2);
    const omega = TAU * frequency / SAMPLE_RATE;
    const coefficient = 2 * Math.cos(omega);
    const harmonicAmplitude = event.amp * Math.sin(Math.PI * harmonic * position)
      / harmonic ** 1.65;
    const timeConstant = decay / (1 + 0.20 * (harmonic - 1) ** 1.15);
    const multiplier = Math.exp(-1 / (SAMPLE_RATE * timeConstant));
    let envelope = harmonicAmplitude;
    let previous = 0;
    let current = Math.sin(omega);
    for (let i = 0; i < length; i++) {
      const attack = Math.min(1, i / (SAMPLE_RATE * 0.008));
      const release = Math.min(1, (length - i - 1) / (SAMPLE_RATE * 0.18));
      mono[i] += current * envelope * attack * release;
      const next = coefficient * current - previous;
      previous = current;
      current = next;
      envelope *= multiplier;
    }
  }
  // A brief, very quiet filtered excitation gives the pluck a finger/string
  // texture without introducing a separate percussive instrument.
  let filteredNoise = 0;
  for (let i = 0; i < Math.min(length, SAMPLE_RATE * 0.06); i++) {
    filteredNoise = filteredNoise * 0.88 + (random() * 2 - 1) * 0.12;
    mono[i] += filteredNoise * event.amp * 0.055 * Math.sin(Math.PI * i / (SAMPLE_RATE * 0.06)) ** 2;
  }
  mix(event, mono);
}

function flute(event) {
  const length = Math.round(event.duration * SAMPLE_RATE);
  const mono = new Float64Array(length);
  const fundamental = hz(event.note);
  const phase = random() * TAU;
  let noise = 0;
  let oscillatorPhase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.55);
    const release = Math.min(1, (event.duration - t) / 1.0);
    const envelope = Math.sin(Math.PI / 2 * attack) ** 2 * Math.sin(Math.PI / 2 * release) ** 2;
    const vibrato = Math.sin(TAU * 4.7 * t + phase) * 0.0011 * Math.min(1, t / 1.2);
    oscillatorPhase += TAU * fundamental * (1 + vibrato) / SAMPLE_RATE;
    noise = noise * 0.97 + (random() * 2 - 1) * 0.03;
    const tone = Math.sin(oscillatorPhase) + 0.17 * Math.sin(oscillatorPhase * 2)
      + 0.035 * Math.sin(oscillatorPhase * 3);
    mono[i] = event.amp * envelope * (tone + noise * 0.11)
      * (0.96 + 0.04 * Math.sin(TAU * 0.32 * t + phase));
  }
  mix(event, mono);
}

// Thirty-two 4/4 bars at 80 BPM. Four eight-bar phrases in a D-minor
// pentatonic collection (D F G A C). Sparse guqin-like low plucks and an
// answering bamboo-flute voice leave long rests for the board and characters.
const beatSeconds = .75;
const phrases = [
  [[0,62],[3,65],[5,67],[8,69],[11,67],[14,65],[18,62],[22,60],[25,62]],
  [[1,65],[4,67],[7,69],[11,72],[14,69],[17,67],[21,65],[25,62],[28,60]],
  [[0,67],[3,69],[6,72],[10,74],[13,72],[16,69],[19,67],[23,65],[27,67]],
  [[1,69],[5,67],[9,65],[12,62],[17,60],[21,57],[24,60],[27,62]],
];
const events = [];
phrases.forEach((phrase, phraseIndex) => {
  phrase.forEach(([beat, note], index) => {
    events.push({at: (phraseIndex * 32 + beat) * beatSeconds + .14,
      note, amp: .3 * (.88 + random() * .2), decay: index === phrase.length - 1 ? 3.8 : 2.7,
      pan: -.18 + random() * .09 });
    // An occasional quiet octave harmonic, rather than a constant arpeggio.
    if (index === 2 || index === 6) events.push({at: (phraseIndex * 32 + beat + 1.5) * beatSeconds + .14,
      note: note + 12, amp: .052, decay: 1.7, pan: .33});
  });
});
const chords = [[38,50,57],[41,53,60],[43,55,62],[45,57,64],[38,50,57],[36,48,55],[43,55,62],[38,50,57]];
for (let bar = 0; bar < 32; bar++) {
  const notes = chords[bar % 8];
  events.push({at: bar * 3 + .03, note: notes[0], amp: .19, decay: 3.8, pan: .05});
  if (bar % 8 !== 7) {
    events.push({at: bar * 3 + .11, note: notes[1], amp: .11, decay: 3.0, pan: .2});
    events.push({at: bar * 3 + 1.64, note: notes[2], amp: .075, decay: 2.5, pan: .31});
  }
}
events.sort((a,b) => a.at - b.at);
for (const event of events) pluck(event);
for (const [at,note,duration] of [
  [5.0,69,3.9],[10.1,67,3.0],[17.2,65,4.7],
  [28.7,72,4.2],[34.2,69,3.2],[40.1,67,4.3],
  [52.0,74,4.1],[58.1,72,3.6],[64.2,69,5.1],
  [77.0,67,4.6],[83.2,65,3.2],[88.1,62,5.1],
]) flute({at,note,duration,amp:.050,pan:-.34});

// Dark, diffuse stereo room: circular taps preserve the decay at the seam.
const dryLeft = left.slice();
const dryRight = right.slice();
const taps = [
  [0.071, 0.075], [0.109, 0.067], [0.173, 0.060], [0.241, 0.055],
  [0.337, 0.048], [0.449, 0.041], [0.593, 0.035], [0.761, 0.029],
  [0.941, 0.022], [1.139, 0.016], [1.361, 0.011], [1.627, 0.007],
];
for (let tap = 0; tap < taps.length; tap++) {
  const [seconds, amplitude] = taps[tap];
  const delay = Math.round(seconds * SAMPLE_RATE);
  const otherDelay = delay + Math.round((0.013 + tap * 0.0011) * SAMPLE_RATE);
  const inputLeft = tap % 2 ? dryRight : dryLeft;
  const inputRight = tap % 2 ? dryLeft : dryRight;
  // Start from a previous whole pass so the filter is also settled at frame 0.
  let lowLeft = 0;
  let lowRight = 0;
  for (let i = FRAMES - 1_000; i < FRAMES; i++) {
    lowLeft = 0.77 * lowLeft + 0.23 * inputLeft[(i - delay + FRAMES) % FRAMES];
    lowRight = 0.77 * lowRight + 0.23 * inputRight[(i - otherDelay + FRAMES) % FRAMES];
  }
  for (let i = 0; i < FRAMES; i++) {
    lowLeft = 0.77 * lowLeft + 0.23 * inputLeft[(i - delay + FRAMES) % FRAMES];
    lowRight = 0.77 * lowRight + 0.23 * inputRight[(i - otherDelay + FRAMES) % FRAMES];
    left[i] += lowLeft * amplitude;
    right[i] += lowRight * amplitude;
  }
}

let sumSquares = 0;
let peak = 0;
let leftMean = 0;
let rightMean = 0;
for (let i = 0; i < FRAMES; i++) {
  leftMean += left[i];
  rightMean += right[i];
}
leftMean /= FRAMES;
rightMean /= FRAMES;
for (let i = 0; i < FRAMES; i++) {
  left[i] -= leftMean;
  right[i] -= rightMean;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  sumSquares += left[i] ** 2 + right[i] ** 2;
}
const gain = Math.min(0.10 / Math.sqrt(sumSquares / (FRAMES * 2)), 0.78 / peak);
const wav = Buffer.alloc(44 + FRAMES * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SAMPLE_RATE, 24);
wav.writeUInt32LE(SAMPLE_RATE * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(FRAMES * 4, 40);
for (let i = 0; i < FRAMES; i++) {
  for (let channel = 0; channel < 2; channel++) {
    const value = (channel ? right[i] : left[i]) * gain;
    // Deterministic triangular dither before 16-bit quantization.
    const quantized = Math.round(value * 32767 + (random() - random()) * 0.5);
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, quantized)), 44 + i * 4 + channel * 2);
  }
}

// Verify the actual exported PCM, including clipping and continuity at the seam.
let encodedPeak = 0;
let encodedSquares = 0;
let maximumStep = 0;
for (let i = 0; i < FRAMES; i++) {
  for (let channel = 0; channel < 2; channel++) {
    const value = wav.readInt16LE(44 + i * 4 + channel * 2) / 32768;
    const previous = wav.readInt16LE(44 + ((i + FRAMES - 1) % FRAMES) * 4 + channel * 2) / 32768;
    encodedPeak = Math.max(encodedPeak, Math.abs(value));
    encodedSquares += value * value;
    maximumStep = Math.max(maximumStep, Math.abs(value - previous));
  }
}
const seam = [0, 1].map((channel) => Math.abs(
  wav.readInt16LE(44 + channel * 2) - wav.readInt16LE(44 + (FRAMES - 1) * 4 + channel * 2),
) / 32768);
const stats = {
  title: '墨月闲庭 · Ink and Moon',
  file: 'public/music/ink-and-moon.wav',
  format: 'WAVE PCM signed 16-bit little-endian',
  sampleRate: SAMPLE_RATE,
  channels: 2,
  frames: FRAMES,
  seconds: SECONDS,
  bpm: 80,
  bytes: wav.length,
  peak: Number(encodedPeak.toFixed(8)),
  rms: Number(Math.sqrt(encodedSquares / (FRAMES * 2)).toFixed(8)),
  loopSeamStepLeft: Number(seam[0].toFixed(8)),
  loopSeamStepRight: Number(seam[1].toFixed(8)),
  maximumAdjacentSampleStep: Number(maximumStep.toFixed(8)),
  sha256: createHash('sha256').update(wav).digest('hex'),
};
if (stats.peak > 0.8 || stats.rms < 0.08 || stats.rms > 0.14) throw new Error(`Unexpected audio levels: ${JSON.stringify(stats)}`);
const outputDirectory = new URL('../public/music/', import.meta.url);
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(new URL('ink-and-moon.wav', outputDirectory), wav);
writeFileSync(new URL('ink-and-moon.json', outputDirectory), JSON.stringify(stats, null, 2) + '\n');
console.log(JSON.stringify(stats, null, 2));
console.log(`Rendered ${fileURLToPath(new URL('ink-and-moon.wav', outputDirectory))}`);
