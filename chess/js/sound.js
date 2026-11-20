/* ============================================================
   Sound.

   The recordings live in sfx/ and sfx/sfx.json says which file is
   which: "game" maps a moment (move, capture, check...) to one or
   several takes, and "board" is the soundboard, in the order its
   buttons appear. Everything is decoded once and played through
   Web Audio, so a sound can overlap itself and starts on time.

   If a file is missing, or the list never loads, the game still
   makes noise: every moment has a little synthesised stand-in.
   ============================================================ */

import { settings } from './shared.js';

let ctx = null, master = null;
let manifest = { game: {}, board: [] };
const buffers = new Map();       // file -> AudioBuffer
const pending = new Map();       // file -> Promise
const BASE = new URL('../sfx/', import.meta.url);

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    master.connect(ctx.destination);
  }
  return ctx;
}

export async function initSound() {
  try {
    const r = await fetch(new URL('sfx.json', BASE), { cache: 'no-cache' });
    if (r.ok) manifest = Object.assign({ game: {}, board: [] }, await r.json());
  } catch (e) { /* no list: the stand-ins will do */ }
  /* browsers keep audio locked until the first tap or key */
  const unlock = () => {
    const a = audio();
    if (a && a.state === 'suspended') a.resume();
    warm();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

export function setVolume(v) { settings.volume = v; if (master) master.gain.value = v; }
export const soundboard = () => manifest.board || [];

function load(file) {
  if (buffers.has(file)) return Promise.resolve(buffers.get(file));
  if (pending.has(file)) return pending.get(file);
  const a = audio();
  if (!a) return Promise.resolve(null);
  const p = fetch(new URL(file, BASE))
    .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(buf => new Promise((res, rej) => a.decodeAudioData(buf, res, rej)))
    .then(b => { buffers.set(file, b); return b; })
    .catch(() => { buffers.set(file, null); return null; })
    .finally(() => pending.delete(file));
  pending.set(file, p);
  return p;
}

/* fetch the short game sounds ahead of time so the first move is not silent */
function warm() {
  for (const k in manifest.game) for (const f of [].concat(manifest.game[k])) load(f);
}
export function warmBoard() { for (const s of soundboard()) load(s.file); }

function start(buffer, gain, rate) {
  const a = audio();
  if (!a || !buffer) return;
  const src = a.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
}

/* ------------------------------------------------- synthesised stand-ins */

function tone(freq, dur, type = 'sine', gain = 0.2, when = 0, slideTo = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, gain = 0.3, when = 0, lowpass = 1200) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + when, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = lowpass; g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}
const SYNTH = {
  move: () => { noise(0.05, 0.5, 0, 900); tone(190, 0.06, 'sine', 0.25); },
  capture: () => { noise(0.09, 0.7, 0, 1500); tone(120, 0.1, 'sine', 0.35); },
  castle: () => { SYNTH.move(); setTimeout(SYNTH.move, 110); },
  check: () => { tone(880, 0.12, 'triangle', 0.22); tone(1320, 0.18, 'triangle', 0.18, 0.09); },
  promote: () => { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.14, 'triangle', 0.18, i * 0.07)); },
  start: () => { tone(523, 0.12, 'triangle', 0.2); tone(784, 0.2, 'triangle', 0.2, 0.12); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.13)); },
  lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.12, i * 0.18)); },
  draw: () => { tone(440, 0.2, 'triangle', 0.18); tone(440, 0.3, 'triangle', 0.18, 0.24); },
  tick: () => tone(1000, 0.03, 'square', 0.06),
  lowtime: () => { tone(980, 0.07, 'square', 0.12); tone(980, 0.07, 'square', 0.12, 0.12); },
  notify: () => { tone(660, 0.12, 'sine', 0.22); tone(990, 0.2, 'sine', 0.22, 0.11); },
  error: () => tone(150, 0.16, 'sawtooth', 0.14),
  rocket: () => { noise(0.9, 0.35, 0, 2600); tone(180, 0.9, 'sawtooth', 0.1, 0, 900); },
  explosion: () => { noise(0.9, 1, 0, 700); tone(70, 0.6, 'sine', 0.6, 0, 30); },
  drop: () => { tone(110, 0.16, 'sine', 0.5, 0, 50); noise(0.08, 0.4, 0, 500); },
  magic: () => { [900, 1200, 1500, 1900].forEach((f, i) => tone(f, 0.1, 'sine', 0.12, i * 0.05)); },
  click: () => tone(700, 0.03, 'square', 0.06),
};

/* ---------------------------------------------------------------- play */

/* a game moment: 'move', 'capture', 'explosion' ... */
export function play(name, opts = {}) {
  if (!settings.sound) return;
  const a = audio();
  if (!a) return;
  const entry = manifest.game && manifest.game[name];
  const files = entry ? [].concat(entry) : [];
  const file = files.length ? files[(Math.random() * files.length) | 0] : null;
  const fallback = () => { const f = SYNTH[name]; if (f) f(); };
  if (!file) return fallback();
  const ready = buffers.get(file);
  if (ready) return start(ready, opts.gain || 1, opts.rate || 1);
  if (ready === null) return fallback();
  /* not decoded yet: use the stand-in now rather than play late */
  fallback();
  load(file);
}

/* a soundboard button, by id */
export async function playBoard(id) {
  const item = soundboard().find(s => s.id === id);
  if (!item || !settings.sound) return false;
  const b = await load(item.file);
  if (!b) return false;
  start(b, item.gain || 1, 1);
  return true;
}
