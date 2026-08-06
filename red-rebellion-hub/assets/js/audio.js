/* ============================================================
   THE RED REBELLION — Score & Foley
   Everything here is synthesised live in the browser with the
   Web Audio API. No audio files, no network, no dependencies.
   ============================================================ */
(function (global) {
  'use strict';

  var ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  var timer = null, step = 0, nextStepTime = 0, current = null;
  var musicOn = true, volume = 0.7;

  var LOOKAHEAD = 25;      // ms between scheduler ticks
  var SCHEDULE_AHEAD = 0.12; // seconds of audio scheduled in advance

  /* ---------- note helpers ---------- */
  var NOTES = { C:0, 'C#':1, D:2, 'D#':3, E:4, F:5, 'F#':6, G:7, 'G#':8, A:9, 'A#':10, B:11 };
  function hz(name) {
    if (name == null || name === '-') return 0;
    var m = /^([A-G]#?)(-?\d)$/.exec(name);
    if (!m) return 0;
    var midi = (parseInt(m[2], 10) + 1) * 12 + NOTES[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /* ---------- graph ---------- */
  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = volume;

    var shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf'; shelf.frequency.value = 5200; shelf.gain.value = -4;

    master.connect(shelf);
    shelf.connect(ctx.destination);

    musicBus = ctx.createGain(); musicBus.gain.value = 0.0;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.95;

    // a touch of room on the music so it doesn't sound like a ringtone
    var conv = ctx.createConvolver();
    conv.buffer = impulse(1.9, 2.6);
    var wet = ctx.createGain(); wet.gain.value = 0.24;
    musicBus.connect(conv); conv.connect(wet); wet.connect(master);
    musicBus.connect(master);
    sfxBus.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    return ctx;
  }

  function impulse(seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var ch = buf.getChannelData(c);
      for (var i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function noiseSource() {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    return s;
  }

  /* ---------- voices ---------- */
  function pluck(freq, t, dur, gain, type) {
    if (!freq) return;
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(7000, freq * 7), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.6), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function bass(freq, t, dur, gain) {
    if (!freq) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function pad(freqs, t, dur, gain) {
    var g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(musicBus);
    freqs.forEach(function (fr, i) {
      if (!fr) return;
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(fr, t);
      o.detune.setValueAtTime((i % 2 ? 7 : -7), t);
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.1);
    });
  }

  function kick(t, gain) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + 0.32);
  }

  function snare(t, gain) {
    var s = noiseSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t); s.stop(t + 0.2);
  }

  function hat(t, gain) {
    var s = noiseSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t); s.stop(t + 0.08);
  }

  /* ---------- cues ----------
     Each cue is a 16-step loop. "-" = rest.
     stepDur is the length of one step in seconds.               */
  var CUES = {
    /* Main title. Big, marching, doomy-heroic. */
    main: {
      stepDur: 0.20, level: 0.34,
      lead: ['D4','-','A4','-','D5','-','C5','A4','F4','-','A4','-','G4','-','F4','E4'],
      bass: ['D2','-','D2','-','A1','-','A1','-','F1','-','F1','-','G1','-','A1','-'],
      pad:  [['D3','F3','A3'],null,null,null,null,null,null,null,['F3','A3','C4'],null,null,null,null,null,null,null],
      drum: ['K','-','h','-','S','-','h','K','K','-','h','-','S','-','h','h']
    },
    /* Open sea. A lilting shanty. */
    sea: {
      stepDur: 0.235, level: 0.26,
      lead: ['D4','F4','A4','-','D5','-','A4','F4','G4','A#4','D5','-','C5','-','A4','G4'],
      bass: ['D2','-','-','A1','-','-','D2','-','G1','-','-','D2','-','-','A1','-'],
      pad:  [['D3','A3'],null,null,null,null,null,null,null,['G3','A#3'],null,null,null,null,null,null,null],
      drum: ['K','-','-','h','-','-','K','-','K','-','-','h','-','-','h','-']
    },
    /* The cat pirates. Menace, low and prowling. */
    menace: {
      stepDur: 0.22, level: 0.30,
      lead: ['A3','-','A#3','-','A3','-','F3','-','E3','-','F3','-','A3','-','-','-'],
      bass: ['A1','A1','-','A1','-','A1','A1','-','F1','F1','-','F1','-','F1','F1','-'],
      pad:  [['A2','C3','E3'],null,null,null,null,null,null,null,['F2','A2','C3'],null,null,null,null,null,null,null],
      drum: ['K','-','h','-','-','h','K','-','K','-','h','-','-','h','h','-']
    },
    /* Under attack. */
    battle: {
      stepDur: 0.135, level: 0.32,
      lead: ['D4','D4','F4','A4','D5','A4','F4','D4','C4','C4','E4','G4','C5','G4','E4','C4'],
      bass: ['D2','D2','D2','D2','D2','D2','D2','D2','C2','C2','C2','C2','C2','C2','C2','C2'],
      pad:  [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
      drum: ['K','h','S','h','K','h','S','h','K','h','S','h','K','K','S','S']
    },
    /* Grief / aftermath. */
    ashes: {
      stepDur: 0.34, level: 0.24,
      lead: ['D4','-','-','-','C4','-','-','-','A#3','-','-','-','A3','-','-','-'],
      bass: ['D2','-','-','-','-','-','-','-','A#1','-','-','-','-','-','-','-'],
      pad:  [['D3','F3','A3'],null,null,null,null,null,null,null,['A#2','D3','F3'],null,null,null,null,null,null,null],
      drum: ['-','-','-','-','-','-','-','-','-','-','-','-','-','-','-','-']
    },
    /* Curiosity / the bounty poster. */
    curious: {
      stepDur: 0.19, level: 0.22,
      lead: ['G4','A4','C5','-','A4','-','G4','-','F4','G4','A#4','-','G4','-','F4','-'],
      bass: ['C2','-','-','G1','-','-','C2','-','F1','-','-','C2','-','-','G1','-'],
      pad:  [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
      drum: ['-','-','h','-','-','-','h','-','-','-','h','-','-','-','h','h']
    },
    /* Marines. Cold, procedural, ticking. */
    justice: {
      stepDur: 0.21, level: 0.28,
      lead: ['E4','-','-','E4','-','-','G4','-','F4','-','-','F4','-','-','A4','-'],
      bass: ['E2','E2','E2','E2','E2','E2','E2','E2','F2','F2','F2','F2','F2','F2','F2','F2'],
      pad:  [['E3','G3','B3'],null,null,null,null,null,null,null,['F3','A3','C4'],null,null,null,null,null,null,null],
      drum: ['K','-','h','-','S','-','h','-','K','-','h','-','S','-','h','h']
    },
    /* Chains, execution order. Dread. */
    dread: {
      stepDur: 0.30, level: 0.30,
      lead: ['-','-','-','-','A#3','-','-','-','-','-','-','-','A3','-','-','-'],
      bass: ['D1','-','-','-','D1','-','-','-','D1','-','-','-','D1','-','-','D1'],
      pad:  [['D2','A2','A#2'],null,null,null,null,null,null,null,['D2','A2','C3'],null,null,null,null,null,null,null],
      drum: ['K','-','-','-','-','-','-','-','K','-','-','-','-','-','-','K']
    },
    /* The rescue. Lift. */
    rescue: {
      stepDur: 0.16, level: 0.34,
      lead: ['D4','F4','A4','D5','F5','D5','A4','F4','G4','A#4','D5','G5','A#5','G5','D5','A#4'],
      bass: ['D2','-','D2','-','D2','-','A1','-','G1','-','G1','-','G1','-','A1','A1'],
      pad:  [['D3','F3','A3'],null,null,null,null,null,null,null,['G3','A#3','D4'],null,null,null,null,null,null,null],
      drum: ['K','h','S','h','K','h','S','h','K','K','S','h','K','h','S','S']
    }
  };

  /* ---------- scheduler ---------- */
  function scheduleStep(cue, s, t) {
    var lead = cue.lead[s], bs = cue.bass[s], pd = cue.pad ? cue.pad[s] : null, dr = cue.drum[s];
    var L = cue.level;
    if (lead && lead !== '-') pluck(hz(lead), t, cue.stepDur * 2.4, 0.10 * L * 3, 'triangle');
    if (bs && bs !== '-') bass(hz(bs), t, cue.stepDur * 2.0, 0.16 * L * 3);
    if (pd) pad(pd.map(hz), t, cue.stepDur * 8, 0.030 * L * 3);
    if (dr === 'K') kick(t, 0.28 * L * 3);
    else if (dr === 'S') snare(t, 0.11 * L * 3);
    else if (dr === 'h') hat(t, 0.035 * L * 3);
  }

  function tick() {
    if (!current) return;
    var cue = CUES[current];
    while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(cue, step % 16, nextStepTime);
      step++;
      nextStepTime += cue.stepDur;
    }
  }

  /* ---------- public ---------- */
  var API = {
    unlock: function () {
      var c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
    },

    cue: function (name, opts) {
      var c = ensure(); if (!c) return;
      if (!CUES[name]) name = 'sea';
      if (current === name) return;
      current = name;
      step = 0;
      nextStepTime = c.currentTime + 0.06;
      var target = musicOn ? ((opts && opts.level) || 1) * 0.55 : 0;
      musicBus.gain.cancelScheduledValues(c.currentTime);
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), c.currentTime);
      musicBus.gain.linearRampToValueAtTime(target, c.currentTime + 0.9);
      if (!timer) timer = setInterval(tick, LOOKAHEAD);
      tick();
    },

    duck: function (on) {
      var c = ensure(); if (!c || !musicOn) return;
      var target = on ? 0.20 : 0.55;
      musicBus.gain.cancelScheduledValues(c.currentTime);
      musicBus.gain.setValueAtTime(musicBus.gain.value, c.currentTime);
      musicBus.gain.linearRampToValueAtTime(target, c.currentTime + 0.35);
    },

    stop: function () {
      if (timer) { clearInterval(timer); timer = null; }
      current = null;
      if (ctx && musicBus) {
        musicBus.gain.cancelScheduledValues(ctx.currentTime);
        musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
        musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      }
    },

    setMusic: function (on) {
      musicOn = !!on;
      if (!ctx) return;
      var target = musicOn && current ? 0.55 : 0.0001;
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), ctx.currentTime);
      musicBus.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.3);
    },

    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    },

    /* ---------- foley: every sound effect written on the pages ---------- */
    sfx: function (name) {
      var c = ensure(); if (!c) return;
      var t = c.currentTime + 0.01;

      switch (name) {
        case 'boom': {           // *BOOM* — cannon hit, page 4
          var s = noiseSource(), f = c.createBiquadFilter(), g = c.createGain();
          f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t);
          f.frequency.exponentialRampToValueAtTime(90, t + 1.1);
          g.gain.setValueAtTime(0.9, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
          s.connect(f); f.connect(g); g.connect(sfxBus);
          s.start(t); s.stop(t + 1.5);
          var o = c.createOscillator(), og = c.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(110, t);
          o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
          og.gain.setValueAtTime(0.85, t);
          og.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
          o.connect(og); og.connect(sfxBus);
          o.start(t); o.stop(t + 1.2);
          break;
        }
        case 'click': {          // *Click* — a hammer drawn back / a lock
          [0, 0.07].forEach(function (off, i) {
            var s = noiseSource(), f = c.createBiquadFilter(), g = c.createGain();
            f.type = 'bandpass'; f.frequency.value = i ? 2600 : 3800; f.Q.value = 6;
            g.gain.setValueAtTime(0.55, t + off);
            g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.05);
            s.connect(f); f.connect(g); g.connect(sfxBus);
            s.start(t + off); s.stop(t + off + 0.07);
          });
          break;
        }
        case 'slam': {           // *Slam* — a cell door
          var s2 = noiseSource(), f2 = c.createBiquadFilter(), g2 = c.createGain();
          f2.type = 'lowpass'; f2.frequency.setValueAtTime(900, t);
          f2.frequency.exponentialRampToValueAtTime(120, t + 0.45);
          g2.gain.setValueAtTime(0.85, t);
          g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
          s2.connect(f2); f2.connect(g2); g2.connect(sfxBus);
          s2.start(t); s2.stop(t + 0.6);
          var o2 = c.createOscillator(), g3 = c.createGain();
          o2.type = 'square';
          o2.frequency.setValueAtTime(80, t);
          o2.frequency.exponentialRampToValueAtTime(38, t + 0.3);
          g3.gain.setValueAtTime(0.4, t);
          g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
          o2.connect(g3); g3.connect(sfxBus);
          o2.start(t); o2.stop(t + 0.45);
          break;
        }
        case 'break': {          // *BREAK!* — chains giving way
          [0, 0.05, 0.11].forEach(function (off, i) {
            var o = c.createOscillator(), g = c.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(1800 - i * 300, t + off);
            o.frequency.exponentialRampToValueAtTime(300, t + off + 0.25);
            g.gain.setValueAtTime(0.35, t + off);
            g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.3);
            o.connect(g); g.connect(sfxBus);
            o.start(t + off); o.stop(t + off + 0.35);
          });
          var s3 = noiseSource(), f3 = c.createBiquadFilter(), g4 = c.createGain();
          f3.type = 'highpass'; f3.frequency.value = 2200;
          g4.gain.setValueAtTime(0.7, t);
          g4.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
          s3.connect(f3); f3.connect(g4); g4.connect(sfxBus);
          s3.start(t); s3.stop(t + 0.55);
          break;
        }
        case 'waves': {          // sea wash under the establishing shots
          var s4 = noiseSource(), f4 = c.createBiquadFilter(), g5 = c.createGain();
          f4.type = 'bandpass'; f4.frequency.setValueAtTime(500, t); f4.Q.value = 0.6;
          f4.frequency.linearRampToValueAtTime(1100, t + 1.0);
          f4.frequency.linearRampToValueAtTime(400, t + 2.2);
          g5.gain.setValueAtTime(0.0001, t);
          g5.gain.linearRampToValueAtTime(0.30, t + 0.7);
          g5.gain.linearRampToValueAtTime(0.0001, t + 2.4);
          s4.connect(f4); f4.connect(g5); g5.connect(sfxBus);
          s4.start(t); s4.stop(t + 2.5);
          break;
        }
        case 'whoosh': {         // scene wipes
          var s5 = noiseSource(), f5 = c.createBiquadFilter(), g6 = c.createGain();
          f5.type = 'bandpass'; f5.Q.value = 1.2;
          f5.frequency.setValueAtTime(300, t);
          f5.frequency.exponentialRampToValueAtTime(4200, t + 0.28);
          g6.gain.setValueAtTime(0.0001, t);
          g6.gain.linearRampToValueAtTime(0.28, t + 0.1);
          g6.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
          s5.connect(f5); f5.connect(g6); g6.connect(sfxBus);
          s5.start(t); s5.stop(t + 0.45);
          break;
        }
        case 'tadum': {          // hub / title sting
          var o3 = c.createOscillator(), g7 = c.createGain();
          o3.type = 'sine';
          o3.frequency.setValueAtTime(146.83, t);           // D3
          g7.gain.setValueAtTime(0.0001, t);
          g7.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
          g7.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
          o3.connect(g7); g7.connect(sfxBus);
          o3.start(t); o3.stop(t + 0.45);

          var o4 = c.createOscillator(), g8 = c.createGain();
          o4.type = 'sine';
          o4.frequency.setValueAtTime(110, t + 0.3);        // A2
          g8.gain.setValueAtTime(0.0001, t + 0.3);
          g8.gain.exponentialRampToValueAtTime(0.7, t + 0.33);
          g8.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
          o4.connect(g8); g8.connect(sfxBus);
          o4.start(t + 0.3); o4.stop(t + 1.35);
          kickToSfx(t, 0.5); kickToSfx(t + 0.3, 0.6);
          break;
        }
        case 'page': {           // paper turn, between acts
          var s6 = noiseSource(), f6 = c.createBiquadFilter(), g9 = c.createGain();
          f6.type = 'highpass'; f6.frequency.value = 1800;
          g9.gain.setValueAtTime(0.0001, t);
          g9.gain.linearRampToValueAtTime(0.22, t + 0.06);
          g9.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
          s6.connect(f6); f6.connect(g9); g9.connect(sfxBus);
          s6.start(t); s6.stop(t + 0.4);
          break;
        }
      }

      function kickToSfx(when, gain) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(180, when);
        o.frequency.exponentialRampToValueAtTime(45, when + 0.18);
        g.gain.setValueAtTime(gain, when);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(g); g.connect(sfxBus);
        o.start(when); o.stop(when + 0.4);
      }
    }
  };

  global.RRAudio = API;
})(window);
