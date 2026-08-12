/* ===========================================================================
   Sound. All of it made on the spot with oscillators — no files to download,
   nothing to wait for, and every world gets its own tune for free by handing
   the same little sequencer a different scale, tempo and waveform.
   =========================================================================== */

let ctx = null, master = null, musicGain = null, sfxGain = null;
let loop = null, step = 0, current = null;
export let musicOn = true, sfxOn = true;

function boot() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return null; }
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.22;
  musicGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.5;
  sfxGain.connect(master);
  return ctx;
}
/** Browsers keep audio asleep until a real button press wakes it. */
export function wake() {
  boot();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function blip(freq, dur, type, gain, when, target) {
  if (!ctx) return;
  const t = when || ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(target || sfxGain);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, gain) {
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(sfxGain);
  src.start();
}

/* --------------------------------- effects -------------------------------- */
const semitone = n => Math.pow(2, n / 12);

export const SFX = {
  jump:   () => sfxOn && blip(420, 0.09, 'square', 0.18),
  land:   () => sfxOn && blip(180, 0.05, 'triangle', 0.1),
  death:  () => { if (!sfxOn) return; blip(200, 0.3, 'sawtooth', 0.2); blip(96, 0.42, 'square', 0.16); noise(0.22, 0.12); },
  win:    () => { if (!sfxOn) return; [0, 4, 7, 12].forEach((n, i) => blip(440 * semitone(n), 0.16, 'square', 0.18, ctx && ctx.currentTime + i * 0.09)); },
  creak:  () => sfxOn && blip(140, 0.12, 'sawtooth', 0.1),
  crumble:() => { if (sfxOn) noise(0.16, 0.1); },
  trick:  () => sfxOn && blip(300, 0.14, 'sawtooth', 0.15),
  reveal: () => sfxOn && blip(660, 0.1, 'square', 0.16),
  spring: () => sfxOn && blip(880, 0.07, 'square', 0.14),
  laser:  () => sfxOn && blip(1200, 0.06, 'sawtooth', 0.1),
  hit:    () => { if (!sfxOn) return; blip(520, 0.12, 'square', 0.2); noise(0.1, 0.1); },
  boss:   () => { if (!sfxOn) return; blip(80, 0.5, 'sawtooth', 0.22); noise(0.3, 0.1); },
  click:  () => sfxOn && blip(600, 0.05, 'square', 0.12)
};
export function play(name) { const f = SFX[name]; if (f) { wake(); f(); } }

/* --------------------------------- music ---------------------------------
   One bar of eight steps: a bass note, an arpeggio wandering the world's own
   scale, and a kick and hat to push it along. Change the scale and the tempo
   and the whole mood changes with it.
   -------------------------------------------------------------------------- */
export function startMusic(cfg) {
  wake();
  if (!ctx) return;
  stopMusic();
  current = cfg;
  step = 0;
  const beat = cfg.tempo || 260;
  loop = setInterval(() => {
    if (!musicOn || !ctx) return;
    const t = ctx.currentTime;
    const sc = cfg.scale, root = cfg.root;
    const bar = Math.floor(step / 8) % 4;

    // bass on the half-beats
    if (step % 2 === 0) {
      const deg = [0, 0, 3, 4][bar];
      blip(root * semitone(sc[deg % sc.length]) / 2, 0.18, 'triangle', 0.3, t, musicGain);
    }
    // arpeggio climbing the scale, doubling back on itself
    const pattern = [0, 2, 4, 2, 3, 4, 2, 1];
    const deg = sc[(pattern[step % 8] + bar) % sc.length];
    const oct = step % 8 === 4 ? 2 : 1;
    blip(root * semitone(deg) * oct, 0.12, cfg.wave || 'square', 0.16, t, musicGain);
    // drums
    if (step % 4 === 0) blip(60, 0.12, 'sine', 0.34, t, musicGain);
    if (step % 2 === 1 && sfxOn) noise(0.03, 0.035);

    step++;
  }, beat);
}
export function stopMusic() {
  if (loop) { clearInterval(loop); loop = null; }
}
export function setMusic(on) {
  musicOn = on;
  if (!on) stopMusic();
  else if (current) startMusic(current);
}
export function setSfx(on) { sfxOn = on; }
export function isPlaying() { return !!loop; }
