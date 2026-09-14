/**
 * Quiet Pavilion / 松风入弦
 * Original composition and offline synthesis for 弈境 · 中国象棋.
 * No samples, recordings, external packages or network access are used.
 * Rebuild from the repository root: node scripts/render-music.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const SECONDS = 80;
const FRAMES = SAMPLE_RATE * SECONDS;
const TAU = 2 * Math.PI;
const left = new Float64Array(FRAMES);
const right = new Float64Array(FRAMES);
let seed = 0x5849414e;
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

// Twenty 4/4 bars at 60 BPM, in a D-major pentatonic collection (D E F# A B).
// Four related five-bar phrases leave breathing space around each cadence.
const phrases = [
  [[0.35, 62], [2.05, 64], [3.10, 66], [5.05, 69], [7.45, 66], [9.10, 64], [11.15, 62], [13.30, 59], [15.10, 62], [17.10, 64], [18.25, 62]],
  [[0.65, 69], [3.10, 66], [5.10, 64], [6.35, 62], [8.20, 64], [10.10, 66], [12.60, 64], [14.10, 59], [16.15, 57], [18.20, 62]],
  [[0.40, 66], [2.15, 69], [4.65, 71], [6.15, 74], [8.65, 71], [10.20, 69], [12.15, 66], [13.45, 69], [15.65, 64], [18.15, 66]],
  [[0.55, 69], [3.15, 66], [5.15, 64], [8.10, 62], [11.30, 59], [13.20, 62], [15.35, 64], [17.20, 62]],
];
const events = [];
phrases.forEach((phrase, phraseIndex) => {
  phrase.forEach(([beat, note], index) => {
    events.push({
      at: phraseIndex * 20 + beat,
      note,
      amp: 0.34 * (0.90 + random() * 0.18) * (note >= 72 ? 0.80 : 1),
      decay: index === phrase.length - 1 ? 3.0 : 2.2 + random() * 0.3,
      pan: -0.12 + random() * 0.08,
    });
  });
});

// Open fifths and sparse, lower-register answering figures beneath the melody.
const roots = [38, 38, 47, 45, 38, 38, 47, 45, 45, 38, 38, 47, 45, 47, 38, 38, 45, 47, 45, 38];
const accompaniment = [
  [50, 57, 62], [50, 59, 64], [47, 54, 59], [45, 52, 57], [50, 57, 62],
];
for (let bar = 0; bar < 20; bar++) {
  events.push({ at: bar * 4 + 0.07, note: roots[bar], amp: 0.19, decay: 3.4, pan: 0.12 });
  const notes = accompaniment[bar % 5];
  notes.forEach((note, index) => {
    if (bar % 5 === 4 && index === 2) return;
    events.push({
      at: bar * 4 + [0.15, 1.62, 3.06][index] + (random() - 0.5) * 0.055,
      note,
      amp: 0.135 * (0.85 + random() * 0.25),
      decay: 2.7,
      pan: 0.26 + random() * 0.12,
    });
  });
}
events.sort((a, b) => a.at - b.at);
for (const event of events) pluck(event);

for (const [at, note, duration] of [
  [11.4, 69, 4.8], [26.5, 66, 5.5], [34.2, 64, 4.5],
  [46.4, 69, 5.8], [54.4, 66, 4.8], [65.0, 64, 5.2], [73.4, 62, 5.6],
]) flute({ at, note, duration, amp: 0.035, pan: -0.38 });

// Barely audible, slowly changing open-fifth bed. Oscillators and all amplitude
// modulators make an integer number of cycles in 80 seconds, so they loop.
for (const [note, amp, pan, cycles] of [[50, 0.010, -0.4, 2], [57, 0.009, 0.4, 3], [64, 0.005, -0.2, 1]]) {
  const frequency = Math.round(hz(note) * SECONDS) / SECONDS;
  const [l, r] = panGains(pan);
  const phase = random() * TAU;
  for (let i = 0; i < FRAMES; i++) {
    const t = i / SAMPLE_RATE;
    const value = Math.sin(TAU * frequency * t + phase) * amp
      * (0.70 + 0.30 * Math.sin(TAU * cycles * t / SECONDS + phase));
    left[i] += value * l;
    right[i] += value * r;
  }
}

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
  title: '松风入弦 · Quiet Pavilion',
  file: 'public/music/quiet-pavilion.wav',
  format: 'WAVE PCM signed 16-bit little-endian',
  sampleRate: SAMPLE_RATE,
  channels: 2,
  frames: FRAMES,
  seconds: SECONDS,
  bpm: 60,
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
writeFileSync(new URL('quiet-pavilion.wav', outputDirectory), wav);
console.log(JSON.stringify(stats, null, 2));
console.log(`Rendered ${fileURLToPath(new URL('quiet-pavilion.wav', outputDirectory))}`);
