/* ============================================================
   ENGINE — browse shell + episode playback
   ============================================================ */
(() => {
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const fmt = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` };

/* ══════════════════ TIMELINE ══════════════════ */
const SHOT_CAM = { wide:{z:1.0}, mid:{z:1.24}, cu:{z:1.0}, ecu:{z:1.0}, two:{z:1.05}, insert:{z:1.6}, ots:{z:1.2} };
const CHAR_BASE = { portrait: 1.72, figure: 2.0 };
const PORTRAIT_LIFT = 74;   // portraits are anchored at the chin-ish, not the head centre

let TL = [], CHAPS = [], LINES = [], total = 0;

function buildTimeline() {
  TL = []; CHAPS = []; LINES = [];
  let chapter = '';
  for (const b of EPISODE.beats) {
    if (b.chap && !b.sc) { chapter = b.chap; CHAPS.push({ name: chapter, at: TL.length }); continue; }
    if (b.chap) { chapter = b.chap; CHAPS.push({ name: chapter, at: TL.length }); }
    const beat = Object.assign({}, b, { chapter });
    if (beat.who && beat.line) {
      beat.id = 'ep1_' + LINES.length;
      beat.text = beat.line;              // Voice.* reads .text
      LINES.push({ id: beat.id, who: beat.who, em: beat.em || 'neutral', text: beat.line });
    }
    TL.push(beat);
  }
  retime();
}

/* Dialogue beats are never cut short — they take however long the take runs.
   Everything else (held shots, action beats, credits) flexes so the episode
   still lands on its stated 23:00. */
function retime() {
  for (const b of TL) {
    let d = b.d || 3.2;
    if (b.id) d = Math.max(d, (Voice.has(b) ? Voice.durationOf(b) : Voice.estimate(b.line)) + .45);
    b.dur = d;
  }
  const floorOf = b => b.chapter === 'Ending' ? 5 : (b.line ? b.dur : Math.min(b.dur, b.act || b.title ? 2.4 : 1.6));
  const flex = TL.filter(b => !b.line);

  let sum = TL.reduce((a, b) => a + b.dur, 0);
  let diff = EPISODE.runtime - sum;

  if (flex.length && Math.abs(diff) > .4) {
    if (diff < 0) {                                   // too long — squeeze the holds
      const capacity = flex.reduce((a, b) => a + (b.dur - floorOf(b)), 0);
      const k = capacity > 0 ? Math.min(1, -diff / capacity) : 0;
      for (const b of flex) b.dur -= (b.dur - floorOf(b)) * k;
    } else {                                          // too short — let them breathe
      const weight = flex.reduce((a, b) => a + b.dur, 0);
      for (const b of flex) b.dur += diff * (b.dur / weight);
    }
  }
  let t = 0;
  for (const b of TL) { b.t = t; t += b.dur; }
  total = t;
}

/* ══════════════════ PLAYER STATE ══════════════════ */
const P = {
  playing: false, t: 0, idx: -1, raf: 0, lastNow: 0,
  slot: 0, curScene: null, camA: { z:1,x:0,y:0,rot:0 }, camB: { z:1,x:0,y:0,rot:0 },
  beatStart: 0, shake: 0, subsOn: true, idle: 0
};

const frame = $('#frame'), world = $('#world'), worldwrap = $('#worldwrap');
const slots = [$('#sceneA'), $('#sceneB')];
const charLayer = $('#chars'), subs = $('#subs'), subName = $('#subname'), subLine = $('#subline');
const locCard = $('#loccard'), titleCard = $('#titlecard'), flashEl = $('#flash');

FX.init($('#fx'));

/* ---------- scene + staging ---------- */
function showScene(key) {
  if (key === P.curScene) return;
  P.curScene = key;
  const r = Art.renderScene(key);
  const next = 1 - P.slot;
  slots[next].innerHTML = r.svg;
  slots[next].classList.add('on');
  slots[P.slot].classList.remove('on');
  P.slot = next;
  P.sceneMeta = r;
  return r;
}

function stage(beat) {
  let list = beat.chars;
  if (!list) {
    if (beat.who && beat.who !== 'vo' && ['cu','ecu','mid','ots'].includes(beat.shot || 'wide'))
      list = [{ id: beat.who, x: .5, y: .6, s: 1 }];
    else list = [];
  }
  if (!list.length) { charLayer.classList.remove('on'); charLayer.innerHTML = ''; return; }
  const twoScale = beat.shot === 'two' ? .82 : 1;
  const body = list.map(c => {
    const em = c.em || (c.id === beat.who ? (beat.em || 'neutral') : 'neutral');
    const x = c.x * Art.W;
    if (c.fig) {
      const s = (c.s ?? .5) * CHAR_BASE.figure;
      return `<g transform="translate(${x},${c.y * Art.H}) scale(${s})">${Art.figure(c.id, { flip: c.flip, pose: c.pose })}</g>`;
    }
    const s = (c.s ?? 1) * CHAR_BASE.portrait * twoScale;
    const y = c.y * Art.H - PORTRAIT_LIFT * s;
    return `<g transform="translate(${x},${y}) scale(${s})">${Art.portrait(c.id, em, { flip: c.flip, back: c.back })}</g>`;
  }).join('');
  charLayer.innerHTML = `<svg viewBox="0 0 ${Art.W} ${Art.H}" preserveAspectRatio="xMidYMid slice">${body}</svg>`;
  charLayer.classList.add('on');
}

/* ---------- beat application ---------- */
function applyBeat(i, opts = {}) {
  const b = TL[i]; if (!b) return;
  P.idx = i;
  const meta = showScene(b.sc) || P.sceneMeta || { amb: [], fx: [], rays: 0 };

  // camera
  const base = SHOT_CAM[b.shot] || SHOT_CAM.wide;
  P.camA = Object.assign({ z:1, x:0, y:0, rot:0 }, base, b.cam || {});
  P.camB = Object.assign({}, P.camA, b.to || {});
  if (!b.to && !b.cam) { P.camB = Object.assign({}, P.camA, { z: P.camA.z * 1.045 }); }

  // staging + text
  stage(b);
  if (b.line) {
    subName.textContent = Art.NAMES[b.who] || '';
    subLine.textContent = b.line;
    subLine.classList.remove('act');
    subs.classList.toggle('on', P.subsOn);
  } else if (b.act) {
    subName.textContent = '';
    subLine.textContent = b.act;
    subLine.classList.add('act');
    subs.classList.toggle('on', P.subsOn);
  } else {
    subs.classList.remove('on');
  }

  // cards
  if (b.card) { locCard.firstElementChild.textContent = b.card; locCard.classList.add('on');
    setTimeout(() => locCard.classList.remove('on'), Math.min(4200, b.dur * 900)); }
  else locCard.classList.remove('on');

  if (b.title) {
    const { l1 = '', l2 = '', sub = '' } = b.title;
    titleCard.innerHTML = (l1 || l2 || sub)
      ? `<div class="logo">${l1 ? `<span class="l1">${l1}</span>` : ''}${l2 ? `<span class="l2">${l2}</span>` : ''}${sub ? `<span class="sub">${sub}</span>` : ''}</div>` : '';
    titleCard.classList.toggle('on', !!(l1 || l2 || sub));
  } else titleCard.classList.remove('on');

  // fx / audio
  FX.enable([...(meta.fx || []), ...(b.fx || [])]);
  FX.godrays(b.rays ?? meta.rays ?? 0);
  if (b.speed) FX.speedlines(b.speed, (Math.random() - .5) * .5);
  if (b.flash) doFlash(b.flash);
  if (b.shake) P.shake = b.shake;

  if (!opts.silent) {
    Score.ambience(b.amb || meta.amb || []);
    if (b.mus !== undefined) Score.play(b.mus);
    for (const s of (b.sfx || [])) Array.isArray(s) ? Score.sfx(s[0], s[1]) : Score.sfx(s);
    Score.duckFor(!!b.line);
    if (b.line && P.playing) Voice.speak(b);
  }
  P.beatStart = b.t;
}

function doFlash(v) {
  flashEl.style.transition = 'none'; flashEl.style.opacity = String(clamp(v, 0, 1));
  requestAnimationFrame(() => { flashEl.style.transition = 'opacity .5s ease-out'; flashEl.style.opacity = '0'; });
}

/* ---------- per-frame ---------- */
function tick(now) {
  P.raf = requestAnimationFrame(tick);
  const dt = P.lastNow ? Math.min(.06, (now - P.lastNow) / 1000) : 0;
  P.lastNow = now;

  if (P.playing) {
    P.t += dt;
    if (P.t >= total) { P.t = total; pause(); onEnd(); }
    const b = TL[P.idx];
    if (!b || P.t < b.t || P.t >= b.t + b.dur) {
      let i = P.idx;
      while (i + 1 < TL.length && P.t >= TL[i + 1].t) i++;
      while (i > 0 && P.t < TL[i].t) i--;
      if (i !== P.idx) applyBeat(i);
    }
  }

  // camera interpolation
  const b = TL[P.idx];
  if (b) {
    const k = ease(clamp((P.t - b.t) / b.dur, 0, 1));
    const c = {
      z: P.camA.z + (P.camB.z - P.camA.z) * k,
      x: P.camA.x + (P.camB.x - P.camA.x) * k,
      y: P.camA.y + (P.camB.y - P.camA.y) * k,
      rot: (P.camA.rot || 0) + ((P.camB.rot || 0) - (P.camA.rot || 0)) * k
    };
    world.style.transform = `translate(${c.x * 9}%, ${c.y * 9}%) scale(${c.z}) rotate(${c.rot}deg)`;
    const gs = slots[P.slot].querySelectorAll('g[data-z]');
    for (const g of gs) {
      const z = parseFloat(g.dataset.z) || 0;
      g.setAttribute('transform', `translate(${-c.x * 210 * (z - .45)},${-c.y * 130 * (z - .45)})`);
    }
  }

  // shake
  if (P.shake > 0.001) {
    P.shake *= Math.pow(.02, dt);
    const a = P.shake * 22;
    worldwrap.style.transform = `translate(${(Math.random() - .5) * a}px,${(Math.random() - .5) * a}px)`;
  } else if (worldwrap.style.transform) worldwrap.style.transform = '';

  // transport ui
  if (P.playing || P.dirty) { updateHUD(); P.dirty = false; }

  // idle chrome
  if (P.playing) { P.idle += dt; if (P.idle > 3) $('#player').classList.add('idle'); }
}
requestAnimationFrame(tick);

/* ---------- transport ---------- */
function play() {
  Score.resume();
  P.playing = true; P.lastNow = 0; P.idle = 0;
  $('#player').classList.remove('idle');
  $('#btnplay').textContent = '❚❚';
  $('#bigplay').classList.remove('on');
  frame.classList.add('scope');
  if (P.idx < 0) applyBeat(0);
  else { const b = TL[P.idx]; if (b && b.line) Voice.speak(b); }
}
function pause() {
  P.playing = false; $('#btnplay').textContent = '▶';
  $('#bigplay').classList.add('on');
  $('#player').classList.remove('idle');
  Voice.stop(); Score.suspend();
}
function toggle() { P.playing ? pause() : play(); }
function seek(t) {
  Voice.stop();
  P.t = clamp(t, 0, total - .1);
  let i = 0; while (i + 1 < TL.length && P.t >= TL[i + 1].t) i++;
  P.idx = -1;
  applyBeat(i, { silent: false });
  P.dirty = true; P.idle = 0; $('#player').classList.remove('idle');
}
function onEnd() {
  frame.classList.remove('scope');
  titleCard.innerHTML = `<div class="logo"><span class="l1">NEXT EPISODE</span><span class="l2">THE&nbsp;SEA</span><span class="sub">THAT SAYS YOUR NAME</span></div>`;
  titleCard.classList.add('on');
}

function updateHUD() {
  const p = total ? P.t / total : 0;
  $('#played').style.width = (p * 100) + '%';
  $('#knob').style.left = (p * 100) + '%';
  $('#time').textContent = `${fmt(P.t)} / ${fmt(total)}`;
  const b = TL[P.idx];
  $('#btnskipop').classList.toggle('hidden', !(b && b.chapter === 'Opening'));
}

/* ══════════════════ BROWSE UI ══════════════════ */
const EPS = [
  { n:1, t:'Raise Your Colors', sc:'harbor_night', d:'23m', on:1,
    s:'A dying pirate, a compass that will not point north, and the night Rook Vantier finally says it out loud.' },
  { n:2, t:'The Sea That Says Your Name', sc:'reach_night', d:'23m',
    s:'The wall has a door. The door has a price. Nell finds out what Rook traded.' },
  { n:3, t:'Salt Debt', sc:'storm_sea', d:'23m',
    s:'Everyone on the Ember Gull has paid for their place. Grit finally explains his.' },
  { n:4, t:'What the Concord Buried', sc:'concord_deck', d:'23m',
    s:'Commodore Ardent opens a nineteen-year-old file and requests a ship he swore never to sail again.' },
  { n:5, t:'The Undercut', sc:'seacave', d:'23m',
    s:'Saltmarrow answers for the night the chain went down. Mama Dol does not go quietly.' },
  { n:6, t:'Ninety Fathoms of Rope', sc:'gull_deck', d:'23m',
    s:'A crew vote, a mutiny, and the last honest use of Hallow\'s compass.' }
];
const MORE = [
  { t:'THE WHITE ARITHMETIC', sc:'sanctity_hull', s:'The Concord navy, from the inside. 6 episodes.' },
  { t:'LANTERN ROAD', sc:'rocks_lanterns', s:'A coastal town keeps a secret for nineteen years.' },
  { t:'DROWNED DOG', sc:'tavern', s:'One tavern. Forty years. Everyone who ever left.' },
  { t:'GULLSONG', sc:'saltmarrow_dawn', s:'Quiet, warm, and about fish. Critically adored.' }
];

function thumb(sc) { return Art.renderScene(sc).svg; }

function buildBrowse() {
  $('#heroart').innerHTML = Art.renderScene('open_sea_dawn').svg;

  $('#eplist').innerHTML = EPS.map(e => `
    <div class="card ${e.on ? '' : 'soon'}" data-ep="${e.n}">
      <div class="thumb">${thumb(e.sc)}
        <div class="num">EPISODE ${e.n}</div>
        <div class="dur">${e.on ? e.d : 'COMING SOON'}</div>
        ${e.on ? `<div class="pin"><i>▶</i></div>` : ''}
      </div>
      <div class="meta"><h3><span>${e.n}. ${e.t}</span></h3><p>${e.s}</p></div>
      ${e.on ? '<div class="bar"><i></i></div>' : ''}
    </div>`).join('');

  $('#morelist').innerHTML = MORE.map(m => `
    <div class="card soon">
      <div class="thumb">${thumb(m.sc)}<div class="dur">COMING SOON</div></div>
      <div class="meta"><h3><span>${m.t}</span></h3><p>${m.s}</p></div>
    </div>`).join('');

  $$('#eplist .card').forEach(c => c.addEventListener('click', () => {
    if (c.classList.contains('soon')) return;
    openPlayer();
  }));

  $('#chapters').innerHTML = CHAPS.filter(c => TL[c.at]).map(c =>
    `<i style="left:${(TL[c.at].t / total) * 100}%" title="${c.name}"></i>`).join('');
}

function openPlayer() {
  $('#player').classList.add('on');
  document.body.style.overflow = 'hidden';
  FX.resize();
  play();
}
function closePlayer() {
  pause();
  $('#player').classList.remove('on');
  frame.classList.remove('scope');
  document.body.style.overflow = '';
  const card = $('#eplist .card .bar i'); if (card) card.style.width = (P.t / total * 100) + '%';
}

/* ══════════════════ WIRING ══════════════════ */
$('#heroplay').addEventListener('click', openPlayer);
$('#heroinfo').addEventListener('click', () => openPanel('#scriptpanel'));
$('#navvoice').addEventListener('click', () => openPanel('#voicepanel'));
$('#btnback').addEventListener('click', closePlayer);
$('#btnplay').addEventListener('click', toggle);
$('#bigplay').addEventListener('click', toggle);
$('#stage').addEventListener('click', () => toggle());
$('#btnrw').addEventListener('click', () => seek(P.t - 10));
$('#btnff').addEventListener('click', () => seek(P.t + 10));
$('#btnskipop').addEventListener('click', () => {
  const c = CHAPS.find(c => c.name === 'Part A'); if (c && TL[c.at]) seek(TL[c.at].t);
});
$('#btnsub').addEventListener('click', () => {
  P.subsOn = !P.subsOn; $('#btnsub').classList.toggle('act', P.subsOn);
  subs.classList.toggle('off', !P.subsOn);
});
$('#btnvoice').addEventListener('click', () => openPanel('#voicepanel'));
$('#btnscript').addEventListener('click', () => openPanel('#scriptpanel'));
$('#btnfull').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('#player').requestFullscreen?.();
});
const scrubWrap = $('#scrubwrap');
let scrubbing = false;
const scrubTo = e => {
  const r = $('#scrub').getBoundingClientRect();
  seek(((e.clientX - r.left) / r.width) * total);
};
scrubWrap.addEventListener('pointerdown', e => { scrubbing = true; scrubTo(e); scrubWrap.setPointerCapture(e.pointerId); });
scrubWrap.addEventListener('pointermove', e => { if (scrubbing) scrubTo(e); });
scrubWrap.addEventListener('pointerup', () => { scrubbing = false; });

$('#player').addEventListener('mousemove', () => { P.idle = 0; $('#player').classList.remove('idle'); });
addEventListener('scroll', () => $('#topnav').classList.toggle('solid', scrollY > 40));
addEventListener('resize', () => FX.resize());
addEventListener('keydown', e => {
  if (!$('#player').classList.contains('on')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  if (e.code === 'ArrowLeft') seek(P.t - 10);
  if (e.code === 'ArrowRight') seek(P.t + 10);
  if (e.code === 'Escape') closePlayer();
});

/* ---------- panels ---------- */
function openPanel(sel) { $(sel).classList.add('on'); $('#scrim').classList.add('on'); }
function closePanels() { $$('.panel').forEach(p => p.classList.remove('on')); $('#scrim').classList.remove('on'); }
$('#scrim').addEventListener('click', closePanels);
$$('[data-close]').forEach(b => b.addEventListener('click', closePanels));

/* ══════════════════ VOICE STUDIO ══════════════════ */
const ROLES = ['rook','nell','thorne','ardent','hallow','dol','grit','pike','crier','vo'];
const ROLE_NOTE = {
  rook:'17, dockhand', nell:'18, mechanic', thorne:'captain, Ember Gull', ardent:'Concord commodore',
  hallow:'the dying pirate', dol:'fishmonger', grit:'bosun', pike:'Concord lieutenant',
  crier:'proclamation', vo:'Rook, narrating'
};
let voiceList = [];

function fillModels() {
  const p = Voice.cfg.provider;
  $('#model').innerHTML = (Voice.MODELS[p] || []).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  $('#model').value = p === 'openai' ? Voice.cfg.openaiModel : Voice.cfg.model;
  $('#keyrow').style.display = p === 'browser' ? 'none' : 'flex';
  $('#modelrow').style.display = p === 'browser' ? 'none' : 'flex';
  $('#provhint').textContent = p === 'elevenlabs'
    ? 'Key from elevenlabs.io → Profile → API Key. Lines are stitched to the previous takes of the same character, so delivery carries across cuts.'
    : p === 'openai' ? 'Key from platform.openai.com. gpt-4o-mini-tts takes written acting direction per line.'
    : 'No key needed, and it will sound like a satnav. Fine for checking timing.';
}
function fillCast() {
  $('#cast').innerHTML = ROLES.map(r => {
    const cur = Voice.cfg.cast[r] || (Voice.SUGGESTED[Voice.cfg.provider] || {})[r] || '';
    const opts = voiceList.length
      ? voiceList.map(v => `<option value="${v.id}" ${v.id === cur ? 'selected' : ''}>${v.name}</option>`).join('')
      : `<option value="${cur}">${cur || '— load voices —'}</option>`;
    return `<div class="castrow">
      <div class="nm">${r === 'vo' ? 'ROOK (V.O.)' : Art.NAMES[r]}<small>${ROLE_NOTE[r]}</small></div>
      <select data-role="${r}">${opts}</select>
      <button class="prev" data-prev="${r}" title="Render and play one line — costs a few credits">▶</button>
    </div>`;
  }).join('');
  $$('#cast select').forEach(s => s.addEventListener('change', () => Voice.setCast(s.dataset.role, s.value)));
  $$('#cast .prev').forEach(b => b.addEventListener('click', () => audition(b.dataset.prev, b)));
}

/* Audition one line before committing to a full render. */
async function audition(role, btn) {
  const line = LINES.find(l => l.who === role);
  if (!line) return;
  const was = btn.textContent;
  btn.textContent = '…'; btn.disabled = true;
  try {
    Score.resume();
    const i = LINES.indexOf(line);
    await Voice.renderLine(line, { prev: '', next: LINES[i + 1]?.text || '' });
    Voice.speak(line);
    log(`audition ${role}: "${line.text.slice(0, 46)}"`, 'ok');
  } catch (e) {
    log(`audition ${role} FAILED: ${e.message}`, 'err');
    if (/404/.test(e.message)) log(`  → that voice id isn't on your account. Hit "Load voices from my account" and re-cast.`, 'err');
  }
  btn.textContent = was; btn.disabled = false;
}
$('#provider').addEventListener('change', e => { Voice.set('provider', e.target.value); fillModels(); fillCast(); });
$('#model').addEventListener('change', e => {
  Voice.set(Voice.cfg.provider === 'openai' ? 'openaiModel' : 'model', e.target.value);
});
$('#savekey').addEventListener('click', () => { Voice.set('key', $('#apikey').value.trim()); log('key saved', 'ok'); });
$('#loadvoices').addEventListener('click', async () => {
  try {
    $('#vcount').textContent = 'loading…';
    voiceList = await Voice.listVoices();
    $('#vcount').textContent = voiceList.length + ' voices';
    fillCast();
  } catch (e) { $('#vcount').textContent = 'failed: ' + e.message; }
});

function log(msg, cls = '') {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  el.textContent = msg;
  $('#renderlog').appendChild(el);
  $('#renderlog').scrollTop = 1e9;
}
let abortCtl = null;
$('#renderall').addEventListener('click', async () => {
  if (Voice.cfg.provider !== 'browser' && !Voice.cfg.key) { log('add an API key first', 'err'); return; }
  $('#renderlog').innerHTML = ''; abortCtl = new AbortController();
  $('#renderall').disabled = true;
  const r = await Voice.renderAll(LINES, {
    signal: abortCtl.signal,
    onProgress: (d, n) => { $('#renderbar').firstElementChild.style.width = (d / n * 100) + '%'; },
    onLog: log
  });
  $('#renderall').disabled = false;
  log(`— done: ${r.ok} ok, ${r.fail} failed —`, r.fail ? 'err' : 'ok');
  retime(); rebuildChapters(); P.dirty = true;
});
$('#renderstop').addEventListener('click', () => { abortCtl?.abort(); log('stopped'); });
$('#importbtn').addEventListener('click', () => $('#importinput').click());
$('#importinput').addEventListener('change', async e => {
  const files = [...e.target.files].filter(f => /\.mp3$/i.test(f.name));
  if (!files.length) { log('no .mp3 files in that folder', 'err'); return; }
  log(`importing ${files.length} files…`);
  const r = await Voice.importClips(files, LINES);
  log(`imported ${r.ok} takes${r.miss ? `, ${r.miss} skipped (name didn't match a line)` : ''}`, r.ok ? 'ok' : 'err');
  retime(); rebuildChapters(); P.dirty = true;
  e.target.value = '';
});
$('#clearcache').addEventListener('click', async () => { await Voice.clearCache(); log('cache cleared', 'ok'); retime(); });

function rebuildChapters() {
  $('#chapters').innerHTML = CHAPS.filter(c => TL[c.at]).map(c =>
    `<i style="left:${(TL[c.at].t / total) * 100}%" title="${c.name}"></i>`).join('');
}

/* ══════════════════ SCREENPLAY ══════════════════ */
function buildScript() {
  let html = `<h4>${EPISODE.show} — EPISODE ${EPISODE.num}: “${EPISODE.title}”</h4>
    <p class="act">${EPISODE.synopsis}</p>`;
  let chap = '', lastSc = '';
  for (const b of TL) {
    if (b.chapter !== chap) { chap = b.chapter; html += `<h4>${chap.toUpperCase()}</h4>`; }
    if (b.sc !== lastSc) {
      lastSc = b.sc;
      html += `<div class="slug"><span class="tc">${fmt(b.t)}</span> &nbsp; ${b.sc.replace(/_/g, ' ')} — ${(b.shot || 'wide').toUpperCase()}</div>`;
    }
    if (b.card) html += `<div class="act">CARD: ${b.card}</div>`;
    if (b.act) html += `<div class="act">${b.act}</div>`;
    if (b.line) html += `<div class="cue"><b>${Art.NAMES[b.who] || b.who}</b><i>(${b.em || 'neutral'})</i>${b.line}</div>`;
    if (b.title && (b.title.l2 || b.title.sub)) html += `<div class="act">TITLE: ${b.title.l2 || ''} ${b.title.sub || ''}</div>`;
  }
  $('#scriptbody').innerHTML = html;
}

/* ══════════════════ BOOT ══════════════════ */
buildTimeline();
buildBrowse();
buildScript();
fillModels();
fillCast();
$('#apikey').value = Voice.cfg.key || '';
$('#provider').value = Voice.cfg.provider;
$('#lncount').textContent = LINES.length;
updateHUD();

// pull any previously-rendered voices out of the cache so timings are exact
Voice.warm(LINES).then(n => {
  if (n) { retime(); rebuildChapters(); P.dirty = true; }
  const v = Voice.cfg.provider === 'browser'
    ? 'Browser speech (open Voice Studio for real performances)'
    : `${Voice.cfg.provider} · ${n}/${LINES.length} lines cached`;
  const el = document.querySelector('#foot .dim');
  if (el) el.textContent = el.textContent + '  —  ' + v;
});

if (speechSynthesis?.getVoices) speechSynthesis.onvoiceschanged = () => { if (Voice.cfg.provider === 'browser') fillCast(); };

/* debug / automation hook */
window.BTR = { play, pause, seek, openPlayer, closePlayer, get TL(){return TL}, get P(){return P},
  get total(){return total}, get lines(){return LINES}, applyBeat };
})();
