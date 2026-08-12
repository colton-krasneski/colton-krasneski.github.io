/* ===========================================================================
   Troll Square — screens, drawing, bosses and buttons.
   The rules themselves live in engine.js; this file only shows them.
   =========================================================================== */

import { WORLDS, allStages, bossArena } from './levels.js';
import {
  TILE, PHYS, parseLevel, createState, step, tileAt, laserPhase, moverBox
} from './engine.js';
import * as Audio from './audio.js';

const $ = id => document.getElementById(id);
const cv = $('cv'), g = cv.getContext('2d');
const user = localStorage.getItem('colton_last_user') || 'guest';
const SAVE = 'colton_troll_' + user;

let save = load();
let stage = null, level = null, st = null, world = null;
let deaths = 0, running = false, raf = 0, shake = 0, dust = [];
let boss = null;

/* ------------------------------- progress -------------------------------- */
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE));
    if (raw && raw.done) return raw;
  } catch (e) {}
  return { done: {}, deaths: {}, music: true, sfx: true };
}
function persist() { try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch (e) {} }
const stageKey = (w, i) => w + '-' + i;
const isDone = (w, i) => !!save.done[stageKey(w, i)];
/** A world opens once the one before it has been finished off. */
function worldOpen(wi) {
  if (wi === 0) return true;
  const prev = WORLDS[wi - 1];
  return isDone(wi - 1, prev.levels.length);
}
function stageOpen(wi, si) {
  if (!worldOpen(wi)) return false;
  return si === 0 || isDone(wi, si - 1);
}

/* -------------------------------- screens -------------------------------- */
function show(id) {
  ['map', 'stages', 'play'].forEach(v => $(v).classList.toggle('on', v === id));
}

function drawMap() {
  const board = $('board');
  board.innerHTML = '';
  WORLDS.forEach((w, wi) => {
    const open = worldOpen(wi);
    const b = document.createElement('button');
    b.className = 'wtile' + (open ? '' : ' locked');
    b.style.borderColor = open ? w.colour : '';
    b.style.background = open
      ? 'linear-gradient(160deg, ' + w.sky + ', #10151d)'
      : '';
    const pips = w.levels.map((_, li) =>
      '<span class="pip' + (isDone(wi, li) ? ' done' : '') + '"></span>').join('')
      + '<span class="pip boss' + (isDone(wi, w.levels.length) ? ' done' : '') + '"></span>';
    b.innerHTML = '<span class="no">WORLD ' + (wi + 1) + '</span>'
      + '<span class="nm" style="color:' + (open ? w.colour : 'inherit') + '">' + w.name + '</span>'
      + '<span class="sb">' + w.sub + '</span>'
      + '<span class="pips">' + pips + '</span>'
      + (open ? '' : '<span class="lock">🔒</span>');
    if (open) b.addEventListener('click', () => { Audio.play('click'); openWorld(wi); });
    board.appendChild(b);
  });
  const total = WORLDS.reduce((n, w) => n + w.levels.length + 1, 0);
  const got = Object.keys(save.done).length;
  const allDeaths = Object.values(save.deaths || {}).reduce((a, b) => a + b, 0);
  $('mapSub').textContent = got
    ? got + ' of ' + total + ' cleared · ' + allDeaths + ' deaths so far'
    : 'Every level is possible. That is the only promise made here.';
}

function openWorld(wi) {
  world = wi;
  const w = WORLDS[wi];
  $('worldName').textContent = w.name;
  $('worldName').style.color = w.colour;
  const list = $('stageList');
  list.innerHTML = '';
  const rows = w.levels.map((l, li) => ({ li, name: l.name, hint: l.hint, boss: false }));
  rows.push({ li: w.levels.length, name: w.boss.name, hint: 'Boss — land on its head ' + w.boss.hp + ' times.', boss: true });
  rows.forEach(r => {
    const open = stageOpen(wi, r.li);
    const done = isDone(wi, r.li);
    const b = document.createElement('button');
    b.className = 'srow' + (open ? '' : ' locked');
    const d = (save.deaths || {})[stageKey(wi, r.li)];
    b.innerHTML = '<span class="ico">' + (r.boss ? '👑' : done ? '✅' : open ? '▶' : '🔒') + '</span>'
      + '<span class="nm">' + (r.boss ? 'BOSS · ' : (r.li + 1) + '. ') + r.name
      + '<small>' + (open ? r.hint : 'Finish the one before it') + '</small></span>'
      + '<span class="best">' + (d ? d + (d === 1 ? ' death' : ' deaths') : '') + '</span>';
    if (open) b.addEventListener('click', () => { Audio.play('click'); startStage(wi, r.li); });
    list.appendChild(b);
  });
  show('stages');
  Audio.startMusic(w.music);
}

/* ------------------------------- the game -------------------------------- */
function startStage(wi, si) {
  world = wi;
  const w = WORLDS[wi];
  const isBoss = si >= w.levels.length;
  stage = { world: wi, index: si, boss: isBoss, name: isBoss ? w.boss.name : w.levels[si].name };
  const rows = isBoss ? bossArena(wi) : w.levels[si].rows;
  level = parseLevel(rows.slice());
  cv.width = level.w * TILE;
  cv.height = level.h * TILE;
  deaths = 0;
  reset();
  $('stageName').innerHTML = '<b>' + w.name + '</b> · ' + stage.name;
  $('stageHint').textContent = isBoss ? 'Land on its head ' + w.boss.hp + ' times.' : (w.levels[si].hint || '');
  $('deathCount').textContent = '0';
  $('banner').classList.remove('on');
  show('play');
  Audio.startMusic(w.music);
  if (!running) { running = true; raf = requestAnimationFrame(frame); }
}

function reset() {
  st = createState(level);
  shake = 0;
  dust = [];
  boss = null;
  if (stage.boss && level.bossAt) {
    const cfg = WORLDS[world].boss;
    boss = {
      x: level.bossAt.x, y: level.bossAt.y - 20,
      w: 44, h: 44, vx: cfg.speed, vy: 0,
      hp: cfg.hp, maxHp: cfg.hp, cfg,
      hurt: 0, timer: 0, shots: [], onGround: false
    };
  }
}

/* --------------------------------- input --------------------------------- */
const keys = {};
const held = { left: false, right: false, jump: false };
let jumpEdge = false;
addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'ArrowDown'].includes(e.key)) e.preventDefault();
  if (!keys[e.key]) {
    if (['ArrowUp', 'w', 'W', ' '].includes(e.key)) jumpEdge = true;
  }
  keys[e.key] = true;
  if (e.key === 'r' || e.key === 'R') { if ($('play').classList.contains('on')) die(true); }
  if (e.key === 'Escape' && $('play').classList.contains('on')) quit();
});
addEventListener('keyup', e => { keys[e.key] = false; });

function padBind(id, key) {
  const b = $(id);
  const on = e => { e.preventDefault(); held[key] = true; if (key === 'jump') jumpEdge = true; Audio.wake(); };
  const off = e => { e.preventDefault(); held[key] = false; };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('pointerleave', off);
}
padBind('padL', 'left'); padBind('padR', 'right'); padBind('padJ', 'jump');
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

function readInput() {
  const left = keys.ArrowLeft || keys.a || keys.A || held.left;
  const right = keys.ArrowRight || keys.d || keys.D || held.right;
  const jh = keys.ArrowUp || keys.w || keys.W || keys[' '] || held.jump;
  const j = jumpEdge;
  jumpEdge = false;
  return { left: !!left, right: !!right, jump: !!j, jumpHeld: !!jh };
}

/* ------------------------------- main loop -------------------------------- */
function frame() {
  if (!$('play').classList.contains('on')) { running = false; return; }
  const input = readInput();
  const events = step(level, st, input);
  events.forEach(e => {
    if (e === 'jump') Audio.play('jump');
    else if (e === 'crumble') Audio.play('crumble');
    else if (e === 'creak') Audio.play('creak');
    else if (e === 'trick') { Audio.play('trick'); shake = 6; }
    else if (e === 'reveal') Audio.play('reveal');
    else if (e === 'spring') Audio.play('spring');
    else if (e === 'death') die(false);
    else if (e === 'win') winStage();
  });
  if (boss && !st.dead && !st.won) stepBoss();
  if (shake > 0) shake--;
  dust = dust.filter(p => (p.life--) > 0);
  dust.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.3; });
  draw();
  raf = requestAnimationFrame(frame);
}

function die(manual) {
  if (st.dead && !manual) { /* already counted */ }
  if (!manual) Audio.play('death');
  deaths++;
  save.deaths = save.deaths || {};
  const k = stageKey(stage.world, stage.index);
  save.deaths[k] = (save.deaths[k] || 0) + 1;
  persist();
  $('deathCount').textContent = deaths;
  for (let i = 0; i < 14; i++) {
    dust.push({ x: st.x + 9, y: st.y + 10, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 5, life: 26, c: '#ef4444' });
  }
  shake = 10;
  setTimeout(reset, 260);
}

function winStage() {
  Audio.play('win');
  save.done[stageKey(stage.world, stage.index)] = 1;
  persist();
  const w = WORLDS[stage.world];
  const last = stage.index >= w.levels.length;
  const nextWorld = last && stage.world + 1 < WORLDS.length;
  $('bTitle').textContent = last ? '👑 ' + stage.name + ' down!' : 'Cleared!';
  $('bText').textContent = last
    ? (nextWorld ? 'World ' + (stage.world + 2) + ' — ' + WORLDS[stage.world + 1].name + ' — is open.'
                 : 'That is all eight worlds. You beat the troll at its own game.')
    : deaths === 0 ? 'First try. Suspicious.' : 'Only ' + deaths + (deaths === 1 ? ' death.' : ' deaths.');
  const row = $('bRow');
  row.innerHTML = '';
  const add = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', () => { Audio.play('click'); fn(); });
    row.appendChild(b);
  };
  const hasNext = stage.index + 1 <= w.levels.length;
  if (hasNext) add('Next ▶', 'go', () => startStage(stage.world, stage.index + 1));
  else if (nextWorld) add('World ' + (stage.world + 2) + ' ▶', 'go', () => openWorld(stage.world + 1));
  add('Stages', '', () => openWorld(stage.world));
  add('Map', '', () => { show('map'); drawMap(); });
  $('banner').classList.add('on');
}

function quit() { show('stages'); openWorld(stage.world); }
$('quitBtn').addEventListener('click', quit);
$('retryBtn').addEventListener('click', () => die(true));
$('backMap').addEventListener('click', () => { Audio.play('click'); show('map'); drawMap(); });

/* --------------------------------- bosses --------------------------------- */
function stepBoss() {
  const b = boss, cfg = b.cfg;
  b.timer++;
  if (b.hurt > 0) b.hurt--;

  // chase, with a hop every so often
  const dir = Math.sign((st.x + 9) - (b.x + b.w / 2)) || 1;
  b.vx += dir * 0.12;
  const cap = cfg.speed;
  if (Math.abs(b.vx) > cap) b.vx = cap * Math.sign(b.vx);
  b.x += b.vx;
  b.vy += 0.7;
  b.y += b.vy;

  const floorY = (level.h - 6) * TILE - b.h;
  if (b.y >= floorY) { b.y = floorY; b.vy = 0; b.onGround = true; }
  if (b.x < TILE) { b.x = TILE; b.vx = 1; }
  if (b.x > cv.width - TILE - b.w) { b.x = cv.width - TILE - b.w; b.vx = -1; }

  const beat = Math.max(48, 130 - cfg.hp * 8);
  if (b.onGround && b.timer % beat === 0) {
    b.vy = -cfg.jump;
    b.onGround = false;
    if (cfg.attack === 'stomp' || cfg.attack === 'all') shake = 8;
  }
  // landing sends a shockwave along the ground
  if (b.vy > 0 && b.y >= floorY - 2 && b.timer % 3 === 0 &&
      (cfg.attack === 'stomp' || cfg.attack === 'all')) {
    for (let i = 0; i < 3; i++) {
      dust.push({ x: b.x + b.w / 2, y: b.y + b.h, vx: (Math.random() - 0.5) * 6, vy: -2, life: 16, c: '#fff' });
    }
  }
  // spits shots
  const rate = cfg.attack === 'lasers' || cfg.attack === 'all' ? 70 : 110;
  if (b.timer % rate === 0) {
    Audio.play('laser');
    const speed = cfg.attack === 'sweep' ? 4.4 : 3.4;
    b.shots.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: dir * speed, vy: cfg.attack === 'fake' ? -2 : 0, life: 200 });
  }
  b.shots = b.shots.filter(s => {
    s.x += s.vx;
    s.y += s.vy;
    if (cfg.attack === 'fake') s.vy += 0.09;
    return (s.life-- > 0) && s.x > 0 && s.x < cv.width && s.y < cv.height;
  });

  // getting hit
  const px = st.x, py = st.y, pw = PHYS.playerW, ph = PHYS.playerH;
  for (const s of b.shots) {
    if (px + pw > s.x - 6 && px < s.x + 6 && py + ph > s.y - 6 && py < s.y + 6) { die(false); return; }
  }
  const over = px + pw > b.x + 4 && px < b.x + b.w - 4;
  if (over && py + ph > b.y && py < b.y + b.h) {
    if (st.vy > 0 && py + ph < b.y + 22) {          // a clean stomp
      if (b.hurt <= 0) {
        b.hp--;
        b.hurt = 45;
        b.cfg = Object.assign({}, cfg, { speed: cfg.speed + 0.35 });
        Audio.play('hit');
        shake = 12;
        for (let i = 0; i < 12; i++) {
          dust.push({ x: b.x + b.w / 2, y: b.y, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 5, life: 24, c: WORLDS[world].colour });
        }
      }
      st.vy = -PHYS.jump * 0.8;
      if (b.hp <= 0) { boss = null; st.won = true; Audio.play('boss'); winStage(); }
    } else if (b.hurt <= 0) {
      die(false);
    }
  }
}

/* --------------------------------- drawing -------------------------------- */
function draw() {
  const w = WORLDS[world];
  g.save();
  if (shake > 0) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  g.fillStyle = w.sky;
  g.fillRect(-20, -20, cv.width + 40, cv.height + 40);

  // a few flat hills so it is not just a void
  g.fillStyle = w.ink;
  for (let i = 0; i < 6; i++) {
    const bx = i * 190 - 40, by = cv.height - 70 + (i % 2) * 22;
    g.beginPath();
    g.arc(bx, by + 60, 90, Math.PI, 0);
    g.fill();
  }

  // tiles
  for (let ty = 0; ty < level.h; ty++) {
    for (let tx = 0; tx < level.w; tx++) {
      drawTile(tx, ty, w);
    }
  }

  level.movers.forEach((def, i) => {
    const m = moverBox(level, st, i);
    g.fillStyle = w.colour;
    round(m.x, m.y, def.w, def.h, 4);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    round(m.x + 4, m.y + def.h - 3, def.w - 8, 3, 1);
  });

  drawLasers(w);
  drawTraps(w);
  if (boss) drawBoss(w);

  dust.forEach(p => {
    g.globalAlpha = Math.max(0, p.life / 26);
    g.fillStyle = p.c;
    g.fillRect(p.x, p.y, 4, 4);
  });
  g.globalAlpha = 1;

  if (!st.dead) drawPlayer(w);
  g.restore();
}

function round(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

function drawTile(tx, ty, w) {
  const raw = level.grid[ty][tx];
  const c = tileAt(level, st, tx, ty);
  const x = tx * TILE, y = ty * TILE;

  if (raw === '!' && c !== '#') return;                 // still hiding
  if (c === '.' || c === 'S') return;

  if (c === '#' || c === '!') {
    g.fillStyle = w.ink;
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = w.colour;
    g.fillRect(x, y, TILE, 4);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x + 2, y + 5, TILE - 4, 3);
    return;
  }
  if (c === '=') {
    const k = tx + ',' + ty;
    const fuse = st.crumbling[k];
    g.save();
    if (fuse) g.translate((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    g.fillStyle = fuse ? '#8b5a2b' : '#a8763f';
    round(x + 1, y + 1, TILE - 2, TILE - 2, 4);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x + 5, y + 8, 4, 3);
    g.fillRect(x + 14, y + 14, 5, 3);
    g.restore();
    return;
  }
  if (c === '?') {                                       // indistinguishable on purpose
    g.fillStyle = w.ink;
    g.fillRect(x, y, TILE, TILE);
    g.fillStyle = w.colour;
    g.fillRect(x, y, TILE, 4);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x + 2, y + 5, TILE - 4, 3);
    return;
  }
  if (c === '~') {
    g.fillStyle = w.colour;
    round(x, y + 2, TILE, 7, 3);
    return;
  }
  if ('^v<>x'.includes(c)) {
    g.fillStyle = c === 'x' ? '#c9d3e0' : '#dbe4ef';      // fakes look identical
    spike(x, y, c === 'x' ? '^' : c);
    return;
  }
  if (c === 'G') {
    const t = st.frame * 0.1;
    g.fillStyle = '#111';
    round(x - 2, y - TILE + 2, TILE + 4, TILE * 2 - 2, 5);
    g.fillStyle = '#fbbf24';
    g.globalAlpha = 0.75 + Math.sin(t) * 0.25;
    round(x + 1, y - TILE + 5, TILE - 2, TILE * 2 - 8, 4);
    g.globalAlpha = 1;
    g.fillStyle = '#111';
    g.fillRect(x + TILE - 8, y + 2, 3, 3);
  }
}

function spike(x, y, dir) {
  g.beginPath();
  if (dir === '^') { g.moveTo(x + 1, y + TILE); g.lineTo(x + TILE / 2, y + 3); g.lineTo(x + TILE - 1, y + TILE); }
  else if (dir === 'v') { g.moveTo(x + 1, y); g.lineTo(x + TILE / 2, y + TILE - 3); g.lineTo(x + TILE - 1, y); }
  else if (dir === '<') { g.moveTo(x + TILE, y + 1); g.lineTo(x + 3, y + TILE / 2); g.lineTo(x + TILE, y + TILE - 1); }
  else { g.moveTo(x, y + 1); g.lineTo(x + TILE - 3, y + TILE / 2); g.lineTo(x, y + TILE - 1); }
  g.closePath();
  g.fill();
}

function drawLasers(w) {
  level.lasers.forEach(l => {
    const p = laserPhase(st, l);
    const x = l.x * TILE, y = l.y * TILE;
    g.fillStyle = p.state === 'fire' ? '#ff4d4d' : p.state === 'warn' ? '#ff9a3c' : '#5b6675';
    round(x + 4, y + TILE - 8, TILE - 8, 7, 2);
    if (p.state === 'warn' && Math.floor(st.frame / 4) % 2 === 0) {
      g.fillStyle = 'rgba(255,120,60,0.28)';
      g.fillRect(x + 9, y + TILE, 6, beamLen(l));
    }
    if (p.state === 'fire') {
      g.fillStyle = 'rgba(255,60,60,0.85)';
      g.fillRect(x + 6, y + TILE, TILE - 12, beamLen(l));
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(x + 10, y + TILE, 4, beamLen(l));
    }
  });
}
function beamLen(l) {
  for (let ty = l.y + 1; ty < level.h; ty++) {
    if ('#=?'.includes(tileAt(level, st, l.x, ty))) return (ty - l.y - 1) * TILE;
  }
  return (level.h - l.y - 1) * TILE;
}

function drawTraps() {
  level.traps.forEach(t => {
    const up = st.sprung[t.x + ',' + t.y];
    g.fillStyle = up ? '#dbe4ef' : 'rgba(219,228,239,0.12)';
    const y = up ? t.y * TILE - 14 : t.y * TILE - 2;
    g.beginPath();
    g.moveTo(t.x * TILE + 3, y + 16);
    g.lineTo(t.x * TILE + TILE / 2, y);
    g.lineTo(t.x * TILE + TILE - 3, y + 16);
    g.closePath();
    g.fill();
  });
}

function drawBoss(w) {
  const b = boss;
  const flash = b.hurt > 0 && Math.floor(b.hurt / 4) % 2 === 0;
  g.fillStyle = flash ? '#fff' : w.colour;
  round(b.x, b.y, b.w, b.h, 8);
  g.fillStyle = '#0b0f16';
  const look = Math.sign(st.x - b.x) || 1;
  g.fillRect(b.x + 10 + look * 2, b.y + 12, 8, 10);
  g.fillRect(b.x + b.w - 18 + look * 2, b.y + 12, 8, 10);
  g.fillRect(b.x + 12, b.y + 30, b.w - 24, 4);          // grumpy mouth
  // health pips above its head
  for (let i = 0; i < b.maxHp; i++) {
    g.fillStyle = i < b.hp ? '#ef4444' : '#39424f';
    g.fillRect(b.x + i * 9, b.y - 12, 7, 5);
  }
  b.shots.forEach(s => {
    g.fillStyle = '#ff5c5c';
    g.beginPath();
    g.arc(s.x, s.y, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
    g.fill();
  });
}

function drawPlayer(w) {
  const x = st.x, y = st.y, W = PHYS.playerW, H = PHYS.playerH;
  const squash = st.onGround ? 1 : (st.vy < 0 ? 0.92 : 1.06);
  const hh = H * squash, ww = W * (2 - squash);
  const px = x - (ww - W) / 2, py = y + (H - hh);

  g.fillStyle = 'rgba(0,0,0,0.3)';
  round(px + 2, py + 3, ww, hh, 5);
  g.fillStyle = '#f8fafc';
  round(px, py, ww, hh, 5);

  // eyes look where you are going, and squeeze shut mid-jump
  g.fillStyle = '#0b0f16';
  const ex = px + (st.facing > 0 ? 5 : 3), ey = py + 5;
  if (st.onGround) {
    g.fillRect(ex, ey, 3.5, 5);
    g.fillRect(ex + 7, ey, 3.5, 5);
  } else {
    g.fillRect(ex, ey + 2, 3.5, 2);
    g.fillRect(ex + 7, ey + 2, 3.5, 2);
  }
  g.fillStyle = w.colour;
  g.fillRect(px + 3, py + hh - 4, ww - 6, 2.5);
}

/* -------------------------------- settings -------------------------------- */
function paintToggles() {
  $('musicBtn').classList.toggle('off', !save.music);
  $('sfxBtn').classList.toggle('off', !save.sfx);
  $('musicBtn').textContent = save.music ? '♪' : '♪̸';
  $('sfxBtn').textContent = save.sfx ? '🔊' : '🔇';
}
$('musicBtn').addEventListener('click', () => {
  save.music = !save.music;
  persist();
  Audio.setMusic(save.music);
  paintToggles();
});
$('sfxBtn').addEventListener('click', () => {
  save.sfx = !save.sfx;
  persist();
  Audio.setSfx(save.sfx);
  paintToggles();
  Audio.play('click');
});
$('wipeBtn').addEventListener('click', () => {
  if (!confirm('Wipe all progress and start again?')) return;
  save = { done: {}, deaths: {}, music: save.music, sfx: save.sfx };
  persist();
  drawMap();
});

/* ---------------------------------- boot ---------------------------------- */
Audio.setMusic(save.music !== false);
Audio.setSfx(save.sfx !== false);
paintToggles();
drawMap();
show('map');
addEventListener('pointerdown', () => Audio.wake(), { once: true });
