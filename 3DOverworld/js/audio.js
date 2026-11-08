/* ============================================================
   Sound.

   Synthesised, like everything else in here: nothing is loaded
   and nothing is streamed. Every noise is built at the moment
   it is wanted, out of filtered noise and an oscillator or
   two. That is a tenth of the weight of a folder of wav files,
   and it is also the only way a footstep gets to know what it
   is standing on - the surface picks the filter rather than
   picking a file.

   Three things make the difference between this and a sound
   board. Nothing plays at quite the same pitch twice, or it
   machine-guns. The breathing is driven by how hard he has
   been working *lately*, not by whether shift is down this
   frame. And every envelope here has an attack: an impact that
   starts at full level clicks.
   ============================================================ */

/* Two helpers rather than an import: this module has nothing to do with
   the terrain, and standing on its own means it can be driven and
   measured without the rest of the game - or a browser - around it. */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

let ctx = null;
let master = null;
let noiseBuf = null;
let ready = false;
let muted = false;
let paused = false;

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

      /* Two seconds of white noise, made once and then read from a
         different place every time. Every impact and every breath in
         here is this buffer through a different filter. */
      const n = Math.floor(ctx.sampleRate * 2);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

      /* A gentle limiter on the end, because footsteps, breathing and a
         landing can all want the output at once and the sum of three
         reasonable levels is not a reasonable level. */
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 14;
      comp.ratio.value = 5;
      comp.attack.value = 0.004;
      comp.release.value = 0.14;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(comp);
      comp.connect(ctx.destination);
      ready = true;
    }
    /* A resume that fails is not a reason to throw away a graph that
       is otherwise built and working, so it gets a catch of its own. */
    try {
      if (ctx.state === "suspended") ctx.resume();
    } catch (err) { /* it will resume on the next gesture */ }
    return true;
  } catch (err) {
    /* No audio is a shrug. Taking the game down over it is not. */
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
   The two shapes everything is built from
   ------------------------------------------------------------ */

/* a shaped burst of noise: the bones of every impact and every breath */
function burst(t, o) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type || "bandpass";
  f.Q.value = o.q === undefined ? 0.8 : o.q;
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1 && o.f1 !== o.f0) {
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
  }
  const g = ctx.createGain();
  const peak = Math.max(0.0002, o.gain);
  /* An attack longer than the sound would put the two ramps out of
     order, which is a thrown exception rather than a quiet bug. */
  const atk = Math.min(o.attack || 0.004, o.dur * 0.5);
  /* exponential ramps cannot reach zero, so they start and end just
     above it rather than at it */
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * (noiseBuf.duration - 0.5));
  src.stop(t + o.dur + 0.02);
  src.onended = () => {
    try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (err) { /* gone already */ }
  };
}

/* and a shaped tone, for the weight of a body rather than the scuff of
   a sole. `o.formant` puts a throat in front of it, which is most of
   what separates a grunt from a beep. */
function tone(t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || "sine";
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 && o.f1 !== o.f0) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(12, o.f1), t + o.dur);
  }
  const g = ctx.createGain();
  const peak = Math.max(0.0002, o.gain);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(o.attack || 0.006, o.dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

  let head = g;
  if (o.formant) {
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = o.formant;
    f.Q.value = o.formantQ || 2.4;
    g.connect(f);
    head = f;
  }
  osc.connect(g);
  head.connect(master);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
  osc.onended = () => {
    try { osc.disconnect(); g.disconnect(); if (head !== g) head.disconnect(); } catch (err) { /* gone */ }
  };
}

/* ------------------------------------------------------------
   What each surface sounds like underfoot.

   f0/f1: where the contact noise starts and where it slides to
   q:     how sharp - a crack or a sigh
   dur:   how long it rings
   hiss:  how much of the step is scuff rather than weight
   thump: how much of the body comes through the sole
   body:  the pitch of that thump, in hertz
   ------------------------------------------------------------ */
const SURFACE = {
  turf:  { f0: 2100, f1: 880,  q: 0.55, dur: 0.145, hiss: 1.00, thump: 0.55, body: 74 },
  soil:  { f0: 900,  f1: 360,  q: 0.80, dur: 0.105, hiss: 0.62, thump: 0.85, body: 60 },
  rock:  { f0: 3400, f1: 1500, q: 1.30, dur: 0.075, hiss: 1.05, thump: 0.60, body: 98 },
  sand:  { f0: 2800, f1: 1400, q: 0.45, dur: 0.200, hiss: 1.20, thump: 0.40, body: 56 },
  water: { f0: 1100, f1: 2600, q: 0.50, dur: 0.280, hiss: 1.45, thump: 0.28, body: 48 },
};

/* ------------------------------------------------------------
   Footsteps
   ------------------------------------------------------------ */

/* `force` is 0 for a crouching creep and 1 for a sprint; `wet` is how
   much water he is dragging his boots through. */
function sfxFoot(surf, force, wet) {
  if (!audioReady()) return;
  const S = SURFACE[surf] || SURFACE.turf;
  const t = ctx.currentTime + 0.004;
  const v = clamp01(force);
  /* no two steps alike */
  const j = 0.86 + Math.random() * 0.28;

  /* the weight going down through the sole */
  tone(t, {
    type: "triangle",
    f0: S.body * j, f1: S.body * j * 0.55,
    dur: 0.095 + v * 0.055,
    gain: 0.085 * S.thump * (0.40 + v * 0.80),
  });
  /* and the sole itself, against whatever is under it */
  burst(t, {
    f0: S.f0 * j, f1: S.f1 * j, q: S.q,
    dur: S.dur * (0.78 + v * 0.44),
    gain: 0.050 * S.hiss * (0.30 + v),
  });
  /* the pack and the belt, a hair behind the foot, on a heavy step */
  if (v > 0.42) {
    burst(t + 0.014, { f0: 3700, q: 0.9, dur: 0.055, gain: 0.013 * v });
  }
  if (wet > 0.04) splashAt(t + 0.006, clamp01(wet) * (0.35 + v * 0.65));
}

/* ------------------------------------------------------------
   Water
   ------------------------------------------------------------ */

function splashAt(t, size) {
  const s = clamp01(size);
  /* the body of it: noise opening upwards, which is what a splash is */
  burst(t, {
    f0: 420, f1: 2400, q: 0.6,
    dur: 0.18 + s * 0.22, attack: 0.012,
    gain: 0.075 * (0.3 + s),
  });
  /* and the droplets coming down after */
  const drops = 2 + Math.round(s * 3);
  for (let i = 0; i < drops; i++) {
    tone(t + 0.05 + Math.random() * (0.12 + s * 0.2), {
      type: "sine",
      f0: 1400 + Math.random() * 1800,
      f1: 900 + Math.random() * 600,
      dur: 0.045, gain: 0.012 * (0.4 + s),
    });
  }
}

function sfxSplash(size) {
  if (!audioReady()) return;
  splashAt(ctx.currentTime + 0.004, size);
}

/* ------------------------------------------------------------
   Jumping and landing
   ------------------------------------------------------------ */

function sfxJump() {
  if (!audioReady()) return;
  const t = ctx.currentTime + 0.004;
  /* cloth and gear taking up the slack */
  burst(t, { f0: 1500, f1: 560, q: 0.7, dur: 0.155, gain: 0.030 });
  /* a short voiced effort - quiet, because it should be felt rather
     than announced, and voiced because an unvoiced one is a hiss */
  tone(t + 0.006, {
    type: "sawtooth",
    f0: 134 + Math.random() * 16, f1: 94,
    dur: 0.125, attack: 0.012, gain: 0.048,
    formant: 680 + Math.random() * 90, formantQ: 2.6,
  });
  burst(t + 0.006, { f0: 950, f1: 520, q: 1.5, dur: 0.11, attack: 0.014, gain: 0.020 });
}

/* `impact` is 0 for stepping off a kerb and 1 for a fall that hurts. */
function sfxLand(surf, impact) {
  if (!audioReady()) return;
  const S = SURFACE[surf] || SURFACE.turf;
  const t = ctx.currentTime + 0.004;
  const v = clamp01(impact);
  const j = 0.9 + Math.random() * 0.2;

  tone(t, {
    type: "sine",
    f0: 58 * j, f1: 34, dur: 0.17 + v * 0.11,
    gain: 0.125 * (0.38 + v * 0.8),
  });
  burst(t, {
    f0: S.f0 * 0.78 * j, f1: S.f1 * 0.7, q: S.q,
    dur: S.dur * 1.5, gain: 0.072 * S.hiss * (0.45 + v),
  });
  /* everything he is carrying catches up a moment later */
  burst(t + 0.022, { f0: 3100, q: 0.8, dur: 0.095, gain: 0.020 * (0.3 + v) });
  /* and on a real drop it knocks the wind out of him */
  if (v > 0.5) {
    tone(t + 0.045, {
      type: "sawtooth", f0: 118 + Math.random() * 12, f1: 84,
      dur: 0.165, attack: 0.018, gain: 0.052 * v,
      formant: 620, formantQ: 2.3,
    });
  }
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
  const g = 0.052 * e;
  burst(t, {
    f0: 480, f1: 1450, q: 0.95,
    dur: 0.24 + (1 - e) * 0.14, attack: 0.085 + (1 - e) * 0.05,
    gain: g,
  });
  /* the catch at the back of the throat, only when he is really going */
  if (e > 0.5) burst(t + 0.02, { f0: 2500, q: 2.4, dur: 0.17, attack: 0.05, gain: g * 0.32 });
}

function breathOut(t, e) {
  const g = 0.070 * e;
  burst(t, {
    f0: 1350, f1: 400, q: 0.85,
    dur: 0.28 + (1 - e) * 0.18, attack: 0.030,
    gain: g,
  });
  /* voice in it, which is the difference between breathing and weather */
  if (e > 0.38) {
    tone(t + 0.012, {
      type: "sawtooth",
      f0: 102 + Math.random() * 16, f1: 84,
      dur: 0.16, attack: 0.025, gain: g * 0.42,
      formant: 600 + Math.random() * 80, formantQ: 3.0,
    });
  }
}

/* Called every frame with what the body is doing. `work` is 0 standing,
   about a quarter walking and 1 at a flat sprint. */
function sfxBreath(dt, work) {
  if (!ready) return;
  const want = clamp01(work);
  /* up over two and a half seconds, down over nine */
  const tc = want > effort ? 2.5 : 9.0;
  effort += (want - effort) * (1 - Math.exp(-dt / tc));

  if (!audioReady()) return;
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
    { breathOut(ctx.currentTime + 0.004, loud); breaths++; }
  }
}

/* for the readouts, and so a test can see the state without guessing */
function breathState() {
  return {
    ready, muted, paused, breaths,
    effort: +effort.toFixed(3), phase: +phase.toFixed(3),
  };
}
export {
  startAudio, setMuted, setAudioPaused, audioReady, breathState,
  sfxFoot, sfxJump, sfxLand, sfxSplash, sfxBreath, SURFACE,
};
