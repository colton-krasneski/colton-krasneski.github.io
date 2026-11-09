/* ============================================================
   Sound.

   Recorded, not synthesised. It used to be built out of filtered
   noise and an oscillator, which is light and clever and sounds
   like a synthesiser pretending to be a boot. Now every footstep,
   thud and breath is a real recording: 47 short clips laid end
   to end in one file (assets/sfx/sfx.wav, with sfx.json saying
   where each one starts), fetched once while the world is being
   built and decoded the moment there is an audio context to
   decode it with.

   Where they come from - all public domain (CC0), see
   assets/sfx/CREDITS.txt:
     footsteps, thuds   Kenney "Impact Sounds"
     dirt steps, cloth  Kenney "RPG Audio"
     breathing          "Breathing Tired", OpenGameArt

   What keeps a handful of clips from sounding like a handful of
   clips: never the same one twice running, never at quite the
   same pitch or level, darker when the step is light and brighter
   when it is heavy, and the breathing driven by how hard he has
   been working lately rather than by whether shift is down.
   ============================================================ */

/* Two helpers rather than an import: this module has nothing to do with
   the terrain, and standing on its own means it can be driven and
   measured without the rest of the game around it. */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

const DIR = "assets/sfx/";

let ctx = null;
let master = null;
let noiseBuf = null;
let ready = false;
let muted = false;
let paused = false;

/* the recordings: the fetched file, where each clip is in it, and the
   decoded sound once there is one */
let raw = null, map = null, sprite = null, decoding = false;
const reversed = {};

/* which clips each surface steps on, and how it is played */
const SURFACE = {
  turf:  { set: "grass", n: 5, gain: 0.34, lp: 1.00 },
  soil:  { set: "dirt",  n: 10, gain: 0.30, lp: 0.80 },
  rock:  { set: "rock",  n: 5, gain: 0.39, lp: 1.00 },
  sand:  { set: "sand",  n: 5, gain: 0.25, lp: 0.70 },
  water: { set: "soft",  n: 5, gain: 0.22, lp: 0.45 },
};
const last = {};

/* ---- fetched at load, decoded when the context exists ---- */
async function loadSounds() {
  try {
    const [a, j] = await Promise.all([
      fetch(DIR + "sfx.wav").then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }),
      fetch(DIR + "sfx.json").then((r) => r.json()),
    ]);
    raw = a; map = j;
    decode();
    return true;
  } catch (err) {
    /* no sound is a shrug, not a reason to stop the world loading */
    console.warn("sounds did not load", err);
    return false;
  }
}

function decode() {
  if (!ctx || !raw || sprite || decoding) return;
  decoding = true;
  const done = (b) => {
    sprite = b;
    /* The breaths are out-breaths. Played backwards a breath out is a
       breath in, near enough, and it doubles what there is to choose
       from, so those are made once here. */
    for (const k in map) {
      if (!k.startsWith("breath")) continue;
      const [s, d] = map[k];
      const a = Math.floor(s * b.sampleRate), n = Math.floor(d * b.sampleRate);
      const r = ctx.createBuffer(1, n, b.sampleRate);
      const src = b.getChannelData(0), dst = r.getChannelData(0);
      for (let i = 0; i < n; i++) dst[i] = src[a + n - 1 - i];
      reversed[k] = r;
    }
  };
  /* the callback form, because older Safari has no promise form */
  try {
    const p = ctx.decodeAudioData(raw.slice(0), done, () => { decoding = false; });
    if (p && p.catch) p.catch(() => { decoding = false; });
  } catch (err) { decoding = false; }
}

/* ---- the one thing the browser dictates ----
   An AudioContext is born suspended and may only be started from a real
   user gesture, so this is called from the Step outside button rather
   than at load. Called again later it just resumes. */
function startAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();

      /* a second of noise, for the one thing there is no recording of:
         the water itself */
      const n = Math.floor(ctx.sampleRate);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

      /* A gentle limiter on the end, because footsteps, breathing and a
         landing can all want the output at once and the sum of three
         reasonable levels is not a reasonable level. */
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.16;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(comp);
      comp.connect(ctx.destination);
      ready = true;
      decode();
    }
    /* A resume that fails is not a reason to throw away a graph that
       is otherwise built and working, so it gets a catch of its own. */
    try {
      if (ctx.state === "suspended") ctx.resume();
    } catch (err) { /* it will resume on the next gesture */ }
    return true;
  } catch (err) {
    ready = false;
    return false;
  }
}

function audioReady() { return ready && !muted && !paused; }

function setMuted(on) {
  muted = !!on;
  if (master) master.gain.setTargetAtTime(muted || paused ? 0 : 1, ctx.currentTime, 0.02);
}

/* Esc should not leave him panting into the pause menu. */
function setAudioPaused(on) {
  paused = !!on;
  if (master) master.gain.setTargetAtTime(muted || paused ? 0 : 1, ctx.currentTime, 0.05);
}

/* ------------------------------------------------------------
   Playing one clip
   ------------------------------------------------------------ */

/* o.gain is the level, o.rate the pitch (and the speed with it), o.lp a
   low-pass cut-off in hertz, o.rev the backwards copy. The clips were
   cut with a fade at each end, so they can start and stop dead without
   a click. */
function play(name, t, o) {
  if (!sprite || !map[name]) return;
  const src = ctx.createBufferSource();
  let off = 0, dur;
  if (o.rev && reversed[name]) { src.buffer = reversed[name]; dur = src.buffer.duration; }
  else { src.buffer = sprite; off = map[name][0]; dur = map[name][1]; }
  src.playbackRate.value = o.rate || 1;
  const g = ctx.createGain();
  g.gain.value = Math.max(0, o.gain);
  let f = null;
  if (o.lp) {
    f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = Math.min(o.lp, ctx.sampleRate * 0.45);
    f.Q.value = 0.5;
    src.connect(f); f.connect(g);
  } else src.connect(g);
  g.connect(master);
  src.start(t, off, dur);
  src.onended = () => {
    try { src.disconnect(); if (f) f.disconnect(); g.disconnect(); } catch (err) { /* gone already */ }
  };
}

/* one of a numbered set, and never the one played last time */
function pick(set, n, base) {
  let i = Math.floor(Math.random() * n);
  if (n > 1 && i === last[set]) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
  last[set] = i;
  return set + (i + (base || 0));
}

const jit = (a) => 1 - a + Math.random() * a * 2;

/* ------------------------------------------------------------
   Footsteps

   force is 0 for a crouching creep and 1 for a sprint; wet is how
   much water he is dragging his boots through; vol scales the lot,
   which is how somebody else's footsteps get quieter the further off
   they are without changing what they sound like.
   ------------------------------------------------------------ */
function sfxFoot(surf, force, wet, vol) {
  if (!audioReady() || !sprite) return;
  const g = vol === undefined ? 1 : clamp01(vol);
  if (g < 0.02) return;
  const S = SURFACE[surf] || SURFACE.turf;
  const v = clamp01(force);
  const t = ctx.currentTime + 0.004;
  /* a heavy step is louder, a shade lower, and much brighter: soft
     steps lose their top end before they lose their level */
  play(pick(S.set, S.n), t, {
    rate: jit(0.06) * (1.04 - v * 0.08),
    gain: S.gain * (0.30 + 0.75 * v) * jit(0.10) * g,
    lp: 600 + (1400 + 9000 * v * v) * S.lp,
  });
  /* the weight coming down through the sole, once he is running */
  if (v > 0.55) {
    play(pick("bump", 5), t + 0.002, {
      rate: 0.78 + Math.random() * 0.10,
      gain: 0.24 * (v - 0.55) * g,
      lp: 900,
    });
  }
  if (wet > 0.04) splashAt(t + 0.006, clamp01(wet) * (0.35 + v * 0.65) * g);
}

/* ------------------------------------------------------------
   Water - the one thing there is no recording of, so it is still
   made: noise opening upwards, which is what a splash is, over a
   muffled step.
   ------------------------------------------------------------ */
function splashAt(t, size) {
  if (!noiseBuf) return;
  const s = clamp01(size);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 0.6;
  const dur = 0.20 + s * 0.24;
  f.frequency.setValueAtTime(380, t);
  f.frequency.exponentialRampToValueAtTime(2200, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07 * (0.3 + s), t + 0.014);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
  src.onended = () => {
    try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (err) { /* gone */ }
  };
  play(pick("soft", 5), t, { rate: 0.8, gain: 0.12 * (0.4 + s), lp: 700 });
}

function sfxSplash(size) {
  if (!audioReady()) return;
  splashAt(ctx.currentTime + 0.004, size);
}

/* ------------------------------------------------------------
   Jumping and landing
   ------------------------------------------------------------ */

/* the push off the ground, the clothes taking up the slack, and a
   short breath out with it */
function sfxJump(surf) {
  if (!audioReady() || !sprite) return;
  const S = SURFACE[surf] || SURFACE.turf;
  const t = ctx.currentTime + 0.004;
  play(pick(S.set, S.n), t, { rate: jit(0.05) * 0.97, gain: S.gain * 0.9, lp: 600 + 8000 * S.lp });
  play(pick("cloth", 4, 1), t + 0.012, { rate: jit(0.06) * 1.15, gain: 0.13, lp: 6500 });
  play(pick("breath", 3), t + 0.03, { rate: jit(0.04) * 1.12, gain: 0.07, lp: 3200 });
}

/* impact is 0 for stepping off a kerb and 1 for a fall that hurts.
   Both feet, not quite together; the body arriving behind them; the
   kit catching up a moment later; and on a real drop, the wind
   knocked out of him. */
function sfxLand(surf, impact) {
  if (!audioReady() || !sprite) return;
  const S = SURFACE[surf] || SURFACE.turf;
  const t = ctx.currentTime + 0.004;
  const v = clamp01(impact);
  const step = { rate: jit(0.05) * (1 - v * 0.06), gain: S.gain * (0.75 + 0.5 * v), lp: 900 + 9000 * S.lp };
  play(pick(S.set, S.n), t, step);
  play(pick(S.set, S.n), t + 0.018 + Math.random() * 0.02, Object.assign(step, { gain: step.gain * 0.8 }));
  if (v < 0.35) play(pick("bump", 5), t + 0.004, { rate: jit(0.05) * 0.9, gain: 0.10 + 0.40 * v, lp: 1200 });
  else play(pick("thud", 5), t + 0.004, { rate: jit(0.04) * (0.98 - v * 0.1), gain: 0.10 + 0.27 * v, lp: 700 + 2600 * v });
  play(pick("cloth", 4, 1), t + 0.03, { rate: jit(0.06) * 1.2, gain: 0.05 + 0.08 * v, lp: 6000 });
  if (v > 0.5) play(pick("breath", 3), t + 0.07, { rate: 0.9, gain: 0.16 * v, lp: 2600 });
}

/* ------------------------------------------------------------
   Breathing

   One number does the work: how hard he has been going lately.
   It rises over a couple of seconds of sprinting and comes down
   over the better part of ten, and that asymmetry is the whole
   effect - breathing that stopped the moment you let go of
   shift would read as a sound effect rather than as a person.
   ------------------------------------------------------------ */

let effort = 0;          /* 0 resting, 1 flat out */
let phase = 0;           /* through the current breath */
let breaths = 0;         /* counted, so a test can check the rate */

function breathIn(t, e) {
  play(pick("breath", 3), t, { rev: true, rate: jit(0.04) * lerp(0.94, 1.06, e), gain: 0.18 * e, lp: lerp(2000, 5200, e) });
}

function breathOut(t, e) {
  play(pick("breath", 3), t, { rate: jit(0.04) * lerp(0.93, 1.04, e), gain: 0.24 * e, lp: lerp(2200, 6400, e) });
}

/* Called every frame with what the body is doing. work is 0 standing,
   about a quarter walking and 1 at a flat sprint. */
function sfxBreath(dt, work) {
  if (!ready) return;
  const want = clamp01(work);
  /* up over two and a half seconds, down over nine */
  const tc = want > effort ? 2.5 : 9.0;
  effort += (want - effort) * (1 - Math.exp(-dt / tc));

  if (!audioReady() || !sprite) return;
  /* You do not hear your own breathing at rest, so neither does he. */
  const loud = clamp01((effort - 0.14) / 0.5);
  const period = lerp(3.6, 1.15, effort);
  const was = phase;
  phase += dt / period;
  /* a while, not an if: one enormous dt - a tab coming back from the
     background - would otherwise leave the phase stuck above one and
     fire a breath on every frame after it */
  if (phase >= 1) {
    while (phase >= 1) phase -= 1;
    if (loud > 0.01) { breathIn(ctx.currentTime + 0.004, loud); breaths++; }
  } else if (was < 0.46 && phase >= 0.46 && loud > 0.01) {
    breathOut(ctx.currentTime + 0.004, loud); breaths++;
  }
}

/* for the readouts, and so a test can see the state without guessing */
function breathState() {
  return {
    ready, muted, paused, breaths, loaded: !!sprite,
    effort: +effort.toFixed(3), phase: +phase.toFixed(3),
  };
}
export {
  startAudio, loadSounds, setMuted, setAudioPaused, audioReady, breathState,
  sfxFoot, sfxJump, sfxLand, sfxSplash, sfxBreath, SURFACE,
};
