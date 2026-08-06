/* ============================================================
   SCORE — procedural WebAudio music + ambience + SFX.
   No external assets: everything is synthesised.
   ============================================================ */
const Score = (() => {
  let ac = null, master, musBus, ambBus, sfxBus, comp;
  let started = false;
  let cur = null;              // current cue name
  let sched = null;            // scheduler interval
  let step = 0, nextTime = 0;
  let ambNodes = {};
  let duck = 1;

  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const hz = n => {
    const m = /^([A-G]#?)(-?\d)$/.exec(n); if (!m) return 0;
    return 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12);
  };

  function ensure() {
    if (ac) return ac;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3.4; comp.attack.value = .004; comp.release.value = .22;
    master = ac.createGain(); master.gain.value = .85;
    musBus = ac.createGain(); musBus.gain.value = .48;
    ambBus = ac.createGain(); ambBus.gain.value = .32;
    sfxBus = ac.createGain(); sfxBus.gain.value = .55;
    // gentle hall
    const rev = ac.createConvolver(); rev.buffer = impulse(2.4, 2.6);
    const revSend = ac.createGain(); revSend.gain.value = .26;
    musBus.connect(comp); ambBus.connect(comp); sfxBus.connect(comp);
    musBus.connect(revSend); sfxBus.connect(revSend);
    revSend.connect(rev); rev.connect(comp);
    comp.connect(master); master.connect(ac.destination);
    return ac;
  }
  function impulse(dur, decay) {
    const n = ac.sampleRate * dur, b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function noiseBuf(dur = 2) {
    const n = ac.sampleRate * dur, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.2; }
    return b;
  }

  /* ---------------- voices ---------------- */
  function tone(f, t, dur, o = {}) {
    const g = ac.createGain(), osc = ac.createOscillator();
    osc.type = o.type || 'sawtooth'; osc.frequency.value = f;
    if (o.detune) osc.detune.value = o.detune;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(o.cut || 2400, t);
    if (o.sweep) lp.frequency.exponentialRampToValueAtTime(Math.max(120, (o.cut || 2400) * o.sweep), t + dur);
    lp.Q.value = o.q || .7;
    const a = o.a ?? .012, d = o.d ?? .12, s = o.s ?? .45, r = o.r ?? .28, v = (o.v ?? .3) * duck;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, v), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, v * s), t + a + d);
    g.gain.setValueAtTime(Math.max(.0002, v * s), t + dur);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur + r);
    osc.connect(lp); lp.connect(g); g.connect(o.bus || musBus);
    osc.start(t); osc.stop(t + dur + r + .05);
  }
  function pluck(f, t, dur, v = .3) {
    tone(f, t, dur, { type: 'triangle', cut: 3200, sweep: .25, a: .003, d: .09, s: .2, r: .3, v });
    tone(f * 2, t, dur * .5, { type: 'sine', cut: 5000, a: .002, d: .05, s: .08, r: .2, v: v * .4 });
  }
  function pad(f, t, dur, v = .12) {
    for (const dt of [-7, 0, 7]) tone(f, t, dur, { type: 'sawtooth', detune: dt, cut: 1200, a: .55, d: .5, s: .8, r: 1.4, v: v / 3 });
  }
  function bass(f, t, dur, v = .34) {
    tone(f, t, dur, { type: 'sawtooth', cut: 520, sweep: .5, a: .006, d: .1, s: .7, r: .18, v });
    tone(f / 2, t, dur, { type: 'sine', cut: 300, a: .01, d: .1, s: .8, r: .2, v: v * .8 });
  }
  function bell(f, t, v = .22) {
    [1, 2.76, 5.4].forEach((m, i) => tone(f * m, t, .6, { type: 'sine', cut: 9000, a: .002, d: .5, s: .001, r: 1.8, v: v / (i + 1.4) }));
  }
  function kick(t, v = .8) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + .13);
    g.gain.setValueAtTime(v * duck, t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
    o.connect(g); g.connect(musBus); o.start(t); o.stop(t + .35);
  }
  function taiko(t, v = .6) {
    kick(t, v * .7);
    const s = ac.createBufferSource(); s.buffer = noiseBuf(.4);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 220; f.Q.value = 1.4;
    const g = ac.createGain(); g.gain.setValueAtTime(v * .5 * duck, t); g.gain.exponentialRampToValueAtTime(.001, t + .22);
    s.connect(f); f.connect(g); g.connect(musBus); s.start(t); s.stop(t + .3);
  }
  function snare(t, v = .5) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf(.3);
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
    const g = ac.createGain(); g.gain.setValueAtTime(v * duck, t); g.gain.exponentialRampToValueAtTime(.001, t + .16);
    s.connect(f); f.connect(g); g.connect(musBus); s.start(t); s.stop(t + .25);
  }
  function hat(t, v = .18, open = false) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf(.2);
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ac.createGain(); g.gain.setValueAtTime(v * duck, t);
    g.gain.exponentialRampToValueAtTime(.001, t + (open ? .22 : .05));
    s.connect(f); f.connect(g); g.connect(musBus); s.start(t); s.stop(t + .3);
  }

  /* ---------------- cues ----------------
     Each cue: bpm, len (steps of a 16th), and a step(i, t) writer. */
  const Dm = ['D', 'E', 'F', 'G', 'A', 'A#', 'C'];
  const oct = (deg, o) => { const d = ((deg % 7) + 7) % 7, oo = o + Math.floor(deg / 7); return hz(Dm[d] + oo); };

  // main motif (scale degrees, -1 = rest, in D minor)
  const MOTIF = [4, -1, 7, -1, 6, -1, 4, -1, 3, -1, 2, -1, 1, -1, -1, -1,
                 4, -1, 7, -1, 9, -1, 8, -1, 7, -1, 6, -1, 4, -1, -1, -1];
  const COUNTER = [0, 2, 4, 2, 0, 2, 4, 5, 4, 2, 0, -2, 0, 2, 4, 2];
  const CHORDS = [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]];  // i VI IV v-ish

  const CUES = {
    op: {
      bpm: 152, bars: 32,
      step(i, t) {
        const b = Math.floor(i / 16) % 32, s = i % 16;
        const ch = CHORDS[Math.floor(i / 16) % 4];
        // drums
        if (b >= 2) {
          if (s % 8 === 0) kick(t, .9);
          if (s === 4 || s === 12) snare(t, .5);
          if (s % 2 === 0) hat(t, .12, s % 8 === 6);
          if (b >= 8 && s === 14) snare(t, .3);
        }
        if (b >= 4 && s === 0) taiko(t, .7);
        // bass
        if (b >= 2 && s % 4 === 0) bass(oct(ch[0] - 7, 2), t, .22, .3);
        // pads
        if (s === 0) ch.forEach(d => pad(oct(d, 3), t, 1.7, .1));
        // melody
        if (b >= 6) {
          const m = MOTIF[i % 32];
          if (m >= 0) pluck(oct(m, 4), t, .34, b >= 16 ? .34 : .24);
          if (b >= 16 && m >= 0) tone(oct(m, 5), t, .3, { type: 'square', cut: 3400, v: .07, a: .01, d: .1, s: .3, r: .2 });
        }
        // counter arp in the drop
        if (b >= 20) { const c = COUNTER[s]; pluck(oct(c, 5), t, .1, .07); }
        if (b === 31 && s === 15) bell(oct(0, 5), t, .3);
      }
    },
    ed: {
      bpm: 74, bars: 24,
      step(i, t) {
        const s = i % 16, ch = CHORDS[Math.floor(i / 16) % 4];
        if (s === 0) ch.forEach(d => pad(oct(d, 3), t, 3.2, .12));
        if (s % 4 === 0) pluck(oct(ch[0], 4), t, .8, .16);
        if (s === 6) pluck(oct(ch[2], 5), t, .6, .1);
        if (s === 10) pluck(oct(ch[1], 4), t, .6, .1);
        if (s === 0 && Math.floor(i / 16) % 2 === 0) kick(t, .3);
      }
    },
    hope: {
      bpm: 88, bars: 16,
      step(i, t) {
        const s = i % 16, ch = CHORDS[Math.floor(i / 16) % 4];
        if (s === 0) ch.forEach(d => pad(oct(d, 3), t, 2.6, .09));
        if (s === 0 || s === 6 || s === 10) pluck(oct(ch[s === 6 ? 2 : 0], 4), t, .7, .12);
        if (s === 8) pluck(oct(ch[1] + 7, 4), t, .5, .08);
      }
    },
    wonder: {
      bpm: 64, bars: 16,
      step(i, t) {
        const s = i % 16;
        if (s === 0) [0, 4, 9, 11].forEach(d => pad(oct(d, 3), t, 4, .07));
        if (s === 2 || s === 9 || s === 13) bell(oct([0, 4, 6, 9][(i / 3 | 0) % 4], 5), t, .1);
      }
    },
    tension: {
      bpm: 96, bars: 16,
      step(i, t) {
        const s = i % 16;
        if (s === 0) { pad(oct(0, 2), t, 2.4, .13); pad(oct(1, 2), t, 2.4, .06); }
        if (s % 4 === 2) tone(oct(0, 3), t, .18, { type: 'square', cut: 700, v: .06, a: .005, d: .06, s: .2, r: .1 });
        if (s === 0 || s === 11) taiko(t, .34);
        if (s === 8) hat(t, .07);
      }
    },
    dread: {
      bpm: 60, bars: 16,
      step(i, t) {
        const s = i % 16;
        if (s === 0) { pad(oct(0, 1), t, 4.2, .18); pad(oct(1, 2), t, 4.2, .05); }
        if (s === 0) taiko(t, .5);
        if (s === 12) tone(oct(-1, 2), t, 1.4, { type: 'sawtooth', cut: 320, v: .07, a: .8, d: .4, s: .5, r: 1 });
      }
    },
    grief: {
      bpm: 56, bars: 16,
      step(i, t) {
        const s = i % 16, ch = [[0, 2, 4], [5, 0, 2], [3, 5, 0], [1, 3, 5]][Math.floor(i / 16) % 4];
        if (s === 0) ch.forEach(d => pad(oct(d, 3), t, 4, .1));
        if (s === 4) pluck(oct(ch[0], 4), t, 1.4, .13);
        if (s === 12) pluck(oct(ch[2], 4), t, 1.2, .09);
      }
    },
    battle: {
      bpm: 168, bars: 16,
      step(i, t) {
        const s = i % 16, b = Math.floor(i / 16);
        if (s % 4 === 0) kick(t, .95);
        if (s === 4 || s === 12) snare(t, .55);
        if (s % 2 === 1) hat(t, .1);
        if (s === 0) taiko(t, .8);
        if (s % 8 === 0) bass(oct([0, 3, 5, 4][b % 4] - 7, 2), t, .4, .33);
        const m = [0, 0, 3, 4, 0, 0, 5, 4, 3, 3, 0, -1, 2, 2, 4, -1][s];
        if (m >= 0 && b % 2 === 1) tone(oct(m, 4), t, .18, { type: 'square', cut: 2600, v: .11, a: .005, d: .06, s: .4, r: .12 });
      }
    },
    resolve: {   // the "raise your colors" swell
      bpm: 132, bars: 24,
      step(i, t) {
        const s = i % 16, b = Math.floor(i / 16);
        const ch = [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]][b % 4];
        if (s === 0) ch.forEach(d => pad(oct(d, 3), t, 2, .13));
        if (s % 8 === 0) kick(t, .85);
        if (s === 4 || s === 12) snare(t, .45);
        if (s === 0) taiko(t, .7);
        if (s % 4 === 0) bass(oct(ch[0] - 7, 2), t, .5, .3);
        const m = MOTIF[i % 32];
        if (m >= 0) { pluck(oct(m, 4), t, .4, .3); tone(oct(m, 5), t, .38, { type: 'triangle', cut: 4200, v: .1, a: .01, d: .12, s: .4, r: .3 }); }
      }
    },
    mystery: {
      bpm: 72, bars: 16,
      step(i, t) {
        const s = i % 16;
        if (s === 0) { pad(oct(0, 3), t, 3.4, .08); pad(oct(4, 3), t, 3.4, .05); }
        if (s === 3 || s === 10) bell(oct([4, 6, 9, 11][(i / 5 | 0) % 4], 5), t, .09);
        if (s === 7) tone(oct(2, 3), t, .9, { type: 'sine', cut: 1400, v: .05, a: .3, d: .3, s: .4, r: .8 });
      }
    },
    warm: {
      bpm: 80, bars: 16,
      step(i, t) {
        const s = i % 16, ch = [[0, 2, 4], [3, 5, 0], [5, 0, 2], [4, 6, 1]][Math.floor(i / 16) % 4];
        if (s === 0) ch.forEach(d => pad(oct(d, 3), t, 2.8, .08));
        if (s === 0 || s === 7) pluck(oct(ch[0] + 7, 4), t, .8, .11);
        if (s === 4 || s === 11) pluck(oct(ch[1] + 7, 4), t, .6, .07);
      }
    }
  };

  /* ---------------- transport ---------------- */
  function play(name, opts = {}) {
    ensure();
    if (name === cur) return;
    stopMusic(opts.fade ?? 1.2);
    cur = name;
    if (!name || !CUES[name]) return;
    const cue = CUES[name];
    step = 0; nextTime = ac.currentTime + .08;
    const gain = musBus.gain;
    gain.cancelScheduledValues(ac.currentTime);
    gain.setValueAtTime(0.0001, ac.currentTime);
    gain.exponentialRampToValueAtTime((opts.vol ?? .48) * duck, ac.currentTime + (opts.rise ?? 1.4));
    clearInterval(sched);
    sched = setInterval(() => {
      if (!ac || ac.state !== 'running') return;
      const spb = 60 / cue.bpm / 4;
      while (nextTime < ac.currentTime + .18) {
        cue.step(step, nextTime);
        step++; nextTime += spb;
        if (cue.bars && step >= cue.bars * 16) step = (cue.loopFrom ?? 0);
      }
    }, 40);
  }
  function stopMusic(fade = 1.2) {
    if (!ac) return;
    clearInterval(sched); sched = null; cur = null;
    musBus.gain.cancelScheduledValues(ac.currentTime);
    musBus.gain.setValueAtTime(Math.max(.0002, musBus.gain.value), ac.currentTime);
    musBus.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + fade);
  }

  /* ---------------- ambience ---------------- */
  const AMB = {
    sea(g) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(4); s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = .6;
      const lfo = ac.createOscillator(); lfo.frequency.value = .13;
      const lg = ac.createGain(); lg.gain.value = 340;
      lfo.connect(lg); lg.connect(f.frequency);
      s.connect(f); f.connect(g); s.start(); lfo.start();
      return [s, lfo];
    },
    surf(g) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(4); s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = .35;
      const lfo = ac.createOscillator(); lfo.frequency.value = .21;
      const lg = ac.createGain(); lg.gain.value = .55;
      const vg = ac.createGain(); vg.gain.value = .45;
      lfo.connect(lg); lg.connect(vg.gain);
      s.connect(f); f.connect(vg); vg.connect(g); s.start(); lfo.start();
      return [s, lfo];
    },
    rain(g) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(4); s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1100;
      const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 6200;
      s.connect(f); f.connect(f2); f2.connect(g); s.start(); return [s];
    },
    wind(g) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(4); s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 480; f.Q.value = 2.2;
      const lfo = ac.createOscillator(); lfo.frequency.value = .09;
      const lg = ac.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(f.frequency);
      s.connect(f); f.connect(g); s.start(); lfo.start(); return [s, lfo];
    },
    fire(g) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(4); s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const lfo = ac.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 3.1;
      const lg = ac.createGain(); lg.gain.value = .35;
      const vg = ac.createGain(); vg.gain.value = .5;
      lfo.connect(lg); lg.connect(vg.gain);
      s.connect(f); f.connect(vg); vg.connect(g); s.start(); lfo.start(); return [s, lfo];
    },
    crowd(g) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(4); s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 620; f.Q.value = .9;
      const lfo = ac.createOscillator(); lfo.frequency.value = 1.7;
      const lg = ac.createGain(); lg.gain.value = .3; const vg = ac.createGain(); vg.gain.value = .3;
      lfo.connect(lg); lg.connect(vg.gain);
      s.connect(f); f.connect(vg); vg.connect(g); s.start(); lfo.start(); return [s, lfo];
    },
    room(g) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(4); s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      s.connect(f); f.connect(g); s.start(); return [s];
    }
  };
  function ambience(list) {
    ensure();
    const want = new Set(list || []);
    for (const k of Object.keys(ambNodes)) {
      if (!want.has(k)) {
        const a = ambNodes[k];
        a.g.gain.cancelScheduledValues(ac.currentTime);
        a.g.gain.setValueAtTime(Math.max(.0002, a.g.gain.value), ac.currentTime);
        a.g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + 1.4);
        const nodes = a.n; setTimeout(() => nodes.forEach(n => { try { n.stop() } catch (e) { } }), 1700);
        delete ambNodes[k];
      }
    }
    for (const k of want) {
      if (ambNodes[k] || !AMB[k]) continue;
      const g = ac.createGain(); g.gain.value = .0001; g.connect(ambBus);
      const n = AMB[k](g);
      g.gain.exponentialRampToValueAtTime(.55, ac.currentTime + 1.6);
      ambNodes[k] = { g, n };
    }
  }

  /* ---------------- one-shot sfx ---------------- */
  const SFX = {
    gull(t) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 6;
      o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(1700, t + .1);
      o.frequency.exponentialRampToValueAtTime(700, t + .34);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.1, t + .04);
      g.gain.exponentialRampToValueAtTime(.0001, t + .4);
      o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + .45);
    },
    bell(t) { bell(hz('A4'), t, .3); bell(hz('D4'), t + .5, .22); },
    cannon(t) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(2);
      const f = ac.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(90, t + .8);
      const g = ac.createGain(); g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.3);
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + .5);
      const og = ac.createGain(); og.gain.setValueAtTime(.85, t); og.gain.exponentialRampToValueAtTime(.001, t + .9);
      s.connect(f); f.connect(g); g.connect(sfxBus); o.connect(og); og.connect(sfxBus);
      s.start(t); s.stop(t + 1.5); o.start(t); o.stop(t + 1);
    },
    musket(t) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(1);
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
      const g = ac.createGain(); g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.001, t + .28);
      s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + .4);
    },
    clash(t) {
      [3100, 4400, 6100].forEach((fr, i) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(fr, t);
        o.frequency.exponentialRampToValueAtTime(fr * .7, t + .3);
        g.gain.setValueAtTime(.18 / (i + 1), t); g.gain.exponentialRampToValueAtTime(.0005, t + .6);
        o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + .7);
      });
    },
    chain(t) {
      for (let i = 0; i < 7; i++) {
        const tt = t + i * .045 + Math.random() * .02;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square'; o.frequency.value = 800 + Math.random() * 1600;
        g.gain.setValueAtTime(.09, tt); g.gain.exponentialRampToValueAtTime(.0005, tt + .12);
        o.connect(g); g.connect(sfxBus); o.start(tt); o.stop(tt + .16);
      }
    },
    splash(t) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(1.2);
      const f = ac.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(420, t + .7); f.Q.value = .8;
      const g = ac.createGain(); g.gain.setValueAtTime(.42, t); g.gain.exponentialRampToValueAtTime(.001, t + .9);
      s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 1.1);
    },
    wood(t) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(70, t + .18);
      g.gain.setValueAtTime(.34, t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + .35);
    },
    thunder(t) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(3);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g = ac.createGain();
      g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.7, t + .12);
      g.gain.exponentialRampToValueAtTime(.15, t + .8); g.gain.exponentialRampToValueAtTime(.001, t + 2.6);
      s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 3);
    },
    whoosh(t) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(1);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3800, t + .3);
      const g = ac.createGain(); g.gain.setValueAtTime(.001, t);
      g.gain.exponentialRampToValueAtTime(.3, t + .16); g.gain.exponentialRampToValueAtTime(.001, t + .5);
      s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + .6);
    },
    heartbeat(t) { kick(t, .5); kick(t + .32, .34); },
    stinger(t) {
      [0, 3, 7, 10].forEach(d => tone(oct(d, 3), t, .5, { type: 'sawtooth', cut: 2200, v: .12, a: .004, d: .2, s: .3, r: .9, bus: sfxBus }));
      taiko(t, .8);
    },
    creak(t) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 340; f.Q.value = 9;
      o.frequency.setValueAtTime(78, t); o.frequency.linearRampToValueAtTime(52, t + .9);
      g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.12, t + .3);
      g.gain.exponentialRampToValueAtTime(.001, t + 1.1);
      o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.2);
    },
    flagsnap(t) {
      for (let i = 0; i < 3; i++) {
        const tt = t + i * .13;
        const s = ac.createBufferSource(); s.buffer = noiseBuf(.6);
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + i * 400; f.Q.value = 1.4;
        const g = ac.createGain(); g.gain.setValueAtTime(.28, tt); g.gain.exponentialRampToValueAtTime(.001, tt + .18);
        s.connect(f); f.connect(g); g.connect(sfxBus); s.start(tt); s.stop(tt + .25);
      }
    }
  };
  function sfx(name, delay = 0) { ensure(); if (SFX[name]) SFX[name](ac.currentTime + delay); }

  /* ---------------- misc ---------------- */
  function duckFor(on) {  // duck music under dialogue
    if (!ac) return;
    const target = on ? .30 : .48;
    musBus.gain.cancelScheduledValues(ac.currentTime);
    musBus.gain.setValueAtTime(Math.max(.0002, musBus.gain.value), ac.currentTime);
    musBus.gain.linearRampToValueAtTime(target, ac.currentTime + .35);
  }
  function resume() { ensure(); if (ac.state === 'suspended') ac.resume(); started = true; }
  function suspend() { if (ac && ac.state === 'running') ac.suspend(); }
  function setVolume(v) { ensure(); master.gain.value = v; }
  function ctxRef() { return ensure(); }
  function busRef() { return { sfxBus, ensure } }

  return { resume, suspend, play, stopMusic, ambience, sfx, duckFor, setVolume, ctxRef, busRef, get cue() { return cur } };
})();
