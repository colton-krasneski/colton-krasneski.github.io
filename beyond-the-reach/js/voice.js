/* ============================================================
   VOICE — real performance TTS with caching.

   Why this doesn't sound like an NPC:
   1. Every character has its own tuned delivery profile (stability /
      style / speed), not one global voice setting.
   2. ElevenLabs request-stitching: each line is rendered with
      previous_request_ids from that character's last 3 lines plus the
      surrounding dialogue as previous_text / next_text, so intonation
      carries ACROSS lines instead of resetting to neutral every time.
   3. Per-line acting direction (emotion) is passed through — as v3
      audio tags on ElevenLabs, as `instructions` on OpenAI.
   4. Renders are cached in IndexedDB so a take you like stays fixed.
   ============================================================ */
const Voice = (() => {

  /* ---------------- persisted config ---------------- */
  const LS = 'btr.voice.cfg';
  const DEFAULTS = {
    provider: 'browser',
    key: '',
    model: 'eleven_multilingual_v2',
    openaiModel: 'gpt-4o-mini-tts',
    cast: {}          // charId -> voiceId
  };
  let cfg = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS) || '{}'));
  const save = () => localStorage.setItem(LS, JSON.stringify(cfg));

  const MODELS = {
    elevenlabs: [
      ['eleven_multilingual_v2', 'Multilingual v2 — richest, most stable'],
      ['eleven_v3', 'v3 (alpha) — most expressive, supports [emotion] tags'],
      ['eleven_turbo_v2_5', 'Turbo v2.5 — fast + cheap'],
      ['eleven_flash_v2_5', 'Flash v2.5 — fastest']
    ],
    openai: [
      ['gpt-4o-mini-tts', 'gpt-4o-mini-tts — takes acting direction'],
      ['tts-1-hd', 'tts-1-hd — clean, less directable'],
      ['tts-1', 'tts-1 — fastest']
    ],
    browser: [['default', 'System speech synthesis']]
  };

  /* Sensible starting cast. These are ElevenLabs' long-standing stock
     voice ids; if any 404 on your account just re-cast from the picker,
     which lists the voices you actually have. */
  const SUGGESTED = {
    elevenlabs: {
      rook: 'TX3LPaxmHKxFdv7VOQHJ',             // Liam — young, energetic
      nell: 'Xb7hH8MSUJpSbSDYk0k2',             // Alice — clear, dry
      thorne: 'pFZP5JQG7iQjIQuC4Bku',           // Lily — velvety actress
      ardent: 'JBFqnCBsd6RMkjVDRZzb',           // George — warm storyteller — cold when directed
      hallow: 'pqHfZKP75CvOlQylNhV4',           // Bill — wise, mature
      dol: 'EXAVITQu4vr4xnSDxMaL',              // Sarah — mature, confident
      grit: 'nPczCjzI2devNBz1zQrb',             // Brian — deep, resonant
      pike: 'onwK4e9ZLuTAKqWW03F9',             // Daniel — steady broadcaster
      crier: 'IKne3meq5aSn9XLyUdCD',            // Charlie — deep, confident
      vo: 'TX3LPaxmHKxFdv7VOQHJ'               // Liam — same actor as Rook
    },
    openai: {
      rook: 'echo', nell: 'nova', thorne: 'sage', ardent: 'onyx',
      hallow: 'ash', dol: 'shimmer', grit: 'onyx', pike: 'alloy',
      crier: 'fable', vo: 'echo'
    },
    browser: {}
  };

  /* ---------------- IndexedDB cache ---------------- */
  let db = null;
  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('btr-voices', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('clips'); };
      r.onsuccess = () => { db = r.result; res(db); };
      r.onerror = () => rej(r.error);
    });
  }
  const tx = (mode) => openDB().then(d => d.transaction('clips', mode).objectStore('clips'));
  function idbGet(k) { return tx('readonly').then(s => new Promise(r => { const q = s.get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); })); }
  function idbPut(k, v) { return tx('readwrite').then(s => new Promise(r => { const q = s.put(v, k); q.onsuccess = () => r(true); q.onerror = () => r(false); })); }
  function idbClear() { return tx('readwrite').then(s => new Promise(r => { const q = s.clear(); q.onsuccess = () => r(true); q.onerror = () => r(false); })); }

  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + '_' + str.length.toString(36);
  }

  /* ---------------- delivery profiles ----------------
     Per character, tuned for the role. ElevenLabs numbers first;
     OpenAI gets a written direction because it responds to prose. */
  const PROFILE = {
    rook: { stability: .34, similarity_boost: .78, style: .62, speed: 1.03,
      dir: 'Seventeen, salt-cracked and stubborn. Sounds like he is grinning even when scared. Rushes ahead of his own thoughts, then lands the last few words dead flat and serious.' },
    nell: { stability: .42, similarity_boost: .80, style: .48, speed: 1.07,
      dir: 'Eighteen, deadpan, fast, working-class. Delivers insults like maintenance reports. Warmth only leaks out at the end of sentences.' },
    thorne: { stability: .55, similarity_boost: .82, style: .55, speed: .95,
      dir: 'Mid-thirties pirate captain. Low, unhurried, amused by dangerous things. Never raises her voice — she lets the room come to her.' },
    ardent: { stability: .74, similarity_boost: .85, style: .28, speed: .92,
      dir: 'A naval commodore who has never needed to shout. Precise, quiet, almost gentle. The courtesy is the threat.' },
    hallow: { stability: .48, similarity_boost: .78, style: .58, speed: .88,
      dir: 'An old sailor, badly wounded, running out of breath. Warm and unafraid. Words come in short pushes with air between them.' },
    dol: { stability: .5, similarity_boost: .8, style: .5, speed: .94,
      dir: 'An old fishmonger. Tired, tough, no self-pity.' },
    grit: { stability: .5, similarity_boost: .8, style: .55, speed: .96,
      dir: 'A huge, cheerful bosun. Big chest voice, everything is half a laugh until it is not.' },
    pike: { stability: .58, similarity_boost: .8, style: .35, speed: .98,
      dir: 'A young Concord lieutenant reciting regulations he is starting to doubt.' },
    crier: { stability: .66, similarity_boost: .8, style: .4, speed: .96,
      dir: 'A town crier reading an official proclamation aloud in a public square. Formal, projected, bored.' },
    vo: { stability: .42, similarity_boost: .8, style: .5, speed: .95,
      dir: 'Narration, spoken years later and quietly, remembering. Intimate, close to the microphone, unhurried.' }
  };

  /* v3 audio tags for the per-line emotion column */
  const TAG = {
    calm: '', neutral: '', warm: '[warmly]', grin: '[amused]', laugh: '[laughs]',
    determined: '[determined]', shout: '[shouting]', yell: '[shouting]',
    whisper: '[whispers]', soft: '[softly]', cold: '[coldly]', flat: '[flatly]',
    sad: '[sadly]', broken: '[voice breaking]', awe: '[in awe]', fear: '[afraid]',
    angry: '[angry]', bitter: '[bitterly]', tired: '[tired]', urgent: '[urgently]',
    breathless: '[out of breath]', dry: '[dryly]', sneer: '[contemptuous]',
    dying: '[weak, fading]', roar: '[roaring]', tease: '[teasing]'
  };
  const DIRWORD = {
    calm: 'calmly', neutral: 'plainly', warm: 'warmly', grin: 'with a grin in the voice',
    laugh: 'laughing', determined: 'with hard resolve', shout: 'shouting over noise',
    yell: 'yelling', whisper: 'whispering', soft: 'softly', cold: 'coldly',
    flat: 'flatly', sad: 'sadly', broken: 'with the voice breaking', awe: 'quietly awestruck',
    fear: 'frightened', angry: 'furious', bitter: 'bitterly', tired: 'exhausted',
    urgent: 'urgently, fast', breathless: 'out of breath', dry: 'dryly',
    sneer: 'with contempt', dying: 'weak and fading', roar: 'roaring', tease: 'teasing'
  };

  /* ---------------- playback graph ---------------- */
  let ac = null, dlgBus = null, decoded = new Map(), playing = null;
  function audio() {
    if (!ac) {
      ac = Score.ctxRef();
      dlgBus = ac.createGain(); dlgBus.gain.value = 1.0;
      const eq = ac.createBiquadFilter(); eq.type = 'highpass'; eq.frequency.value = 90;
      dlgBus.connect(eq); eq.connect(ac.destination);
    }
    return ac;
  }

  /* ---------------- providers ---------------- */
  const lastReq = {};   // charId -> [request_id,...]

  async function renderEleven(line, ctxLines) {
    const p = PROFILE[line.who] || PROFILE.vo;
    const vid = cfg.cast[line.who] || SUGGESTED.elevenlabs[line.who];
    if (!vid) throw new Error('no voice cast for ' + line.who);
    const isV3 = cfg.model === 'eleven_v3';
    const tag = isV3 ? (TAG[line.em] || '') : '';
    const text = (tag ? tag + ' ' : '') + line.text;

    const body = {
      text,
      model_id: cfg.model,
      voice_settings: {
        stability: p.stability, similarity_boost: p.similarity_boost,
        style: p.style, use_speaker_boost: true, speed: p.speed
      }
    };
    if (ctxLines.prev) body.previous_text = ctxLines.prev;
    if (ctxLines.next) body.next_text = ctxLines.next;
    const ids = (lastReq[line.who] || []).slice(-3);
    if (ids.length) body.previous_request_ids = ids;

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      let d = ''; try { d = (await r.text()).slice(0, 240) } catch (e) { }
      throw new Error(`ElevenLabs ${r.status} ${d}`);
    }
    const rid = r.headers.get('request-id') || r.headers.get('x-request-id');
    if (rid) { (lastReq[line.who] = lastReq[line.who] || []).push(rid); }
    return await r.arrayBuffer();
  }

  async function renderOpenAI(line) {
    const p = PROFILE[line.who] || PROFILE.vo;
    const vid = cfg.cast[line.who] || SUGGESTED.openai[line.who] || 'alloy';
    const dir = `${p.dir} For this line specifically, deliver it ${DIRWORD[line.em] || 'naturally'}. This is a line from an animated series; perform it, do not read it.`;
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.openaiModel, voice: vid, input: line.text,
        instructions: dir, response_format: 'mp3', speed: p.speed
      })
    });
    if (!r.ok) { let d = ''; try { d = (await r.text()).slice(0, 240) } catch (e) { } throw new Error(`OpenAI ${r.status} ${d}`); }
    return await r.arrayBuffer();
  }

  function cacheKey(line) {
    const p = PROFILE[line.who] || PROFILE.vo;
    const vid = cfg.cast[line.who] || (SUGGESTED[cfg.provider] || {})[line.who] || '';
    const model = cfg.provider === 'openai' ? cfg.openaiModel : cfg.model;
    return hash([cfg.provider, model, vid, line.who, line.em, JSON.stringify(p), line.text].join('|'));
  }

  /* ---------------- public render ---------------- */
  async function renderLine(line, ctxLines, { force = false } = {}) {
    const key = cacheKey(line);
    if (!force) {
      const hit = await idbGet(key);
      if (hit) { await decode(line.id, hit.buf); return { cached: true, dur: decoded.get(line.id)?.duration || hit.dur }; }
    }
    if (cfg.provider === 'browser') return { cached: false, dur: estimate(line.text) };
    if (!cfg.key) throw new Error('no API key');
    const buf = cfg.provider === 'openai' ? await renderOpenAI(line) : await renderEleven(line, ctxLines);
    await decode(line.id, buf);
    const dur = decoded.get(line.id)?.duration || estimate(line.text);
    await idbPut(key, { buf, dur, who: line.who, text: line.text });
    return { cached: false, dur };
  }

  async function decode(id, arrbuf) {
    try {
      const a = audio();
      const b = await a.decodeAudioData(arrbuf.slice(0));
      decoded.set(id, b);
      return b;
    } catch (e) { return null; }
  }

  /* Adopt mp3s produced by tools/render-voices.mjs so a CLI render and the
     player share one set of takes instead of each paying for its own. */
  async function importClips(files, lines) {
    const byId = new Map(lines.map(l => [l.id, l]));
    let ok = 0, miss = 0;
    for (const f of files) {
      const m = /^(ep\d+_\d+)_/.exec(f.name);
      const line = m && byId.get(m[1]);
      if (!line) { miss++; continue; }
      const buf = await f.arrayBuffer();
      await decode(line.id, buf);
      const dur = decoded.get(line.id)?.duration || estimate(line.text);
      await idbPut(cacheKey(line), { buf, dur, who: line.who, text: line.text });
      ok++;
    }
    return { ok, miss };
  }

  /* Load whatever is already cached, without hitting the network. */
  async function warm(lines, onProgress) {
    let n = 0;
    for (const l of lines) {
      const hit = await idbGet(cacheKey(l));
      if (hit) { await decode(l.id, hit.buf); n++; }
      onProgress && onProgress(n, lines.length);
    }
    return n;
  }

  async function renderAll(lines, { force = false, onProgress, onLog, signal } = {}) {
    let done = 0, ok = 0, fail = 0;
    // reset stitching chains so a fresh render is deterministic
    for (const k of Object.keys(lastReq)) delete lastReq[k];
    for (let i = 0; i < lines.length; i++) {
      if (signal && signal.aborted) break;
      const l = lines[i];
      const prevSame = [...lines.slice(0, i)].reverse().find(x => x.who === l.who);
      const nextAny = lines[i + 1];
      const ctxLines = { prev: prevSame ? prevSame.text : '', next: nextAny ? nextAny.text : '' };
      try {
        const r = await renderLine(l, ctxLines, { force });
        ok++;
        onLog && onLog(`${r.cached ? 'cache' : ' new '}  ${l.who.padEnd(7)} ${l.text.slice(0, 54)}`, r.cached ? '' : 'ok');
      } catch (e) {
        fail++;
        onLog && onLog(`FAIL  ${l.who.padEnd(7)} ${e.message}`, 'err');
        if (/401|403|no API key/.test(e.message)) break;
      }
      done++; onProgress && onProgress(done, lines.length);
    }
    return { ok, fail, done };
  }

  /* ---------------- playback ---------------- */
  function estimate(text) {
    const words = text.trim().split(/\s+/).length;
    return Math.max(1.1, words / 2.75 + 0.42 + (text.match(/[,;:—]/g) || []).length * .16
      + (/[?!]/.test(text) ? .2 : 0));
  }
  function durationOf(line) {
    const b = decoded.get(line.id);
    return b ? b.duration : estimate(line.text);
  }
  function has(line) { return decoded.has(line.id); }

  function stop() {
    if (playing) { try { playing.stop() } catch (e) { } playing = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
  }
  function speak(line, { rate = 1, onend } = {}) {
    stop();
    const b = decoded.get(line.id);
    if (b) {
      const a = audio();
      const src = a.createBufferSource(); src.buffer = b;
      src.playbackRate.value = rate;
      src.connect(dlgBus); src.start();
      playing = src;
      src.onended = () => { if (playing === src) playing = null; onend && onend(); };
      return b.duration / rate;
    }
    // browser fallback
    if (cfg.provider === 'browser' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(line.text);
      const p = PROFILE[line.who] || PROFILE.vo;
      u.rate = p.speed * rate; u.pitch = p.pitch || (line.who === 'rook' ? 1.1 : line.who === 'nell' ? 1.15 : line.who === 'ardent' ? .82 : line.who === 'thorne' ? .92 : line.who === 'hallow' ? .72 : 1);
      const vs = speechSynthesis.getVoices();
      const pick = cfg.cast[line.who] && vs.find(v => v.voiceURI === cfg.cast[line.who]);
      if (pick) u.voice = pick;
      u.onend = () => onend && onend();
      speechSynthesis.speak(u);
      return estimate(line.text) / rate;
    }
    setTimeout(() => onend && onend(), estimate(line.text) * 1000 / rate);
    return estimate(line.text) / rate;
  }

  /* ---------------- account voice list ---------------- */
  async function listVoices() {
    if (cfg.provider === 'browser') {
      const vs = speechSynthesis.getVoices();
      return vs.map(v => ({ id: v.voiceURI, name: `${v.name} (${v.lang})` }));
    }
    if (cfg.provider === 'openai') {
      return ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse']
        .map(v => ({ id: v, name: v }));
    }
    const r = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: { 'xi-api-key': cfg.key } });
    if (!r.ok) {
      const r1 = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': cfg.key } });
      if (!r1.ok) throw new Error('voices ' + r1.status);
      const j1 = await r1.json();
      return (j1.voices || []).map(v => ({ id: v.voice_id, name: `${v.name} — ${(v.labels && (v.labels.description || v.labels.gender)) || v.category || ''}` }));
    }
    const j = await r.json();
    return (j.voices || []).map(v => ({ id: v.voice_id, name: `${v.name} — ${(v.labels && (v.labels.description || v.labels.gender)) || v.category || ''}` }));
  }

  return {
    get cfg() { return cfg }, save,
    set(k, v) { cfg[k] = v; save(); },
    setCast(c, v) { cfg.cast[c] = v; save(); },
    MODELS, SUGGESTED, PROFILE,
    renderLine, renderAll, warm, listVoices, importClips,
    speak, stop, durationOf, has, estimate,
    clearCache: () => { decoded.clear(); return idbClear(); },
    cachedCount: () => decoded.size
  };
})();
