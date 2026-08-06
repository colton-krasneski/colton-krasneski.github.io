/* ============================================================================
   game.js — the 3D layer. Owns the player, the camera, pedestrians, the
   police, input, and every piece of UI. Talks to life.js for anything that
   changes the character sheet.
============================================================================ */

import { createGFX, InstanceList, rgb } from './gfx.js';
import { buildCity, WORLD } from './world.js';
import * as Life from './life.js';

/* -------------------------------- config --------------------------------- */
const YEAR_SECONDS = 80;
const BASE_SPEED = 8.0;
const SPRINT_SPEED = 13.0;
const PLAYER_R = 0.6;
const NPC_COUNT = 26;

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* ------------------------------- game state ------------------------------- */
let gfx, city, dyn;
let state = null;                    // the life.js character sheet
let user = 'guest';
let running = false, paused = true;
let yearLeft = YEAR_SECONDS;
let lastT = 0;

const player = {
  x: 0, z: 0, angle: 0, phase: 0, moving: false,
  stamina: 100, sprinting: false,
  pal: { skin: rgb('#d9a06b'), shirt: rgb('#3aa7e0'), pants: rgb('#2f3b52'), hair: rgb('#2a1d16') },
};

const npcs = [];
const cops = [];
const wanted = { active: false, level: 0, timeLeft: 0 };

let nearVenue = null, nearNpc = null;
let modalOpen = false;
const labels = new Map();

/* --------------------------------- audio ---------------------------------- */
let actx = null;
function blip(freq = 440, dur = 0.08, type = 'square', gain = 0.05) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) { /* audio is a nicety, never a requirement */ }
}
const sfx = {
  ok:     () => blip(660, 0.09, 'square', 0.045),
  level:  () => { blip(523, 0.1); setTimeout(() => blip(659, 0.1), 90); setTimeout(() => blip(784, 0.16), 180); },
  bad:    () => blip(150, 0.22, 'sawtooth', 0.05),
  siren:  () => { blip(880, 0.18, 'sine', 0.05); setTimeout(() => blip(660, 0.18, 'sine', 0.05), 180); },
  cash:   () => { blip(880, 0.06); setTimeout(() => blip(1320, 0.09), 70); },
};

/* --------------------------------- toasts --------------------------------- */
function toast(text, kind = '') {
  const box = $('toasts');
  const t = el('div', 'toast ' + kind, text);
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, 4200);
  while (box.children.length > 5) box.firstChild.remove();
}

/* ================================= INPUT ================================== */
const keys = Object.create(null);
const stick = { active: false, dx: 0, dy: 0, id: null };
const cam = { yaw: 0, pitch: 0.38, dist: 9, drag: null, lastX: 0, lastY: 0 };

function setupInput() {
  addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'Escape' && modalOpen) closeModal();
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (e.key.toLowerCase() === 'e' && !modalOpen) tryInteract();
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // camera drag on the canvas
  const view = $('view');
  view.addEventListener('pointerdown', e => {
    if (cam.drag !== null) return;
    cam.drag = e.pointerId; cam.lastX = e.clientX; cam.lastY = e.clientY;
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', e => {
    if (cam.drag !== e.pointerId) return;
    cam.yaw -= (e.clientX - cam.lastX) * 0.006;
    cam.pitch = Math.max(-0.15, Math.min(1.15, cam.pitch + (e.clientY - cam.lastY) * 0.004));
    cam.lastX = e.clientX; cam.lastY = e.clientY;
  });
  const endDrag = e => { if (cam.drag === e.pointerId) cam.drag = null; };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  view.addEventListener('wheel', e => {
    cam.dist = Math.max(4, Math.min(22, cam.dist + Math.sign(e.deltaY) * 1.2));
    e.preventDefault();
  }, { passive: false });

  // virtual joystick
  const pad = $('stick'), nub = $('stickNub');
  const setNub = (dx, dy) => { nub.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`; };
  pad.addEventListener('pointerdown', e => {
    stick.active = true; stick.id = e.pointerId;
    pad.setPointerCapture(e.pointerId); movePad(e);
    e.preventDefault();
  });
  pad.addEventListener('pointermove', e => { if (stick.active && stick.id === e.pointerId) movePad(e); });
  const dropPad = e => {
    if (stick.id !== e.pointerId) return;
    stick.active = false; stick.dx = 0; stick.dy = 0; stick.id = null; setNub(0, 0);
  };
  pad.addEventListener('pointerup', dropPad);
  pad.addEventListener('pointercancel', dropPad);
  function movePad(e) {
    const r = pad.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    stick.dx = dx; stick.dy = dy; setNub(dx, dy);
  }

  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  $('actionBtn').addEventListener('click', tryInteract);
  $('ageBtn').addEventListener('click', () => endYear(true));
  $('sheetBtn').addEventListener('click', openSheet);
  $('sprintBtn').addEventListener('pointerdown', () => { player.sprinting = true; });
  addEventListener('pointerup', () => { player.sprinting = false; });
  $('modalBack').addEventListener('click', e => { if (e.target === $('modalBack')) closeModal(); });
}

/* ================================= MODALS ================================= */
function openModal(title, buildBody, opts = {}) {
  modalOpen = true;
  $('modalTitle').textContent = title;
  const body = $('modalBody');
  body.innerHTML = '';
  buildBody(body);
  $('modalBack').classList.add('show');
  $('modalClose').style.display = opts.noClose ? 'none' : '';
}
function closeModal() {
  modalOpen = false;
  $('modalBack').classList.remove('show');
}

/** A row button used all over the menus. */
function rowButton(icon, label, sub, onClick, disabled, danger) {
  const b = el('button', 'row' + (disabled ? ' off' : '') + (danger ? ' danger' : ''));
  b.appendChild(el('span', 'rowIcon', icon));
  const mid = el('div', 'rowMid');
  mid.appendChild(el('div', 'rowLabel', label));
  if (sub) mid.appendChild(el('div', 'rowSub', sub));
  b.appendChild(mid);
  if (disabled) b.disabled = true;
  else b.addEventListener('click', onClick);
  return b;
}

/* ============================== VENUE MENUS =============================== */
function openVenue(loc) {
  if (state.inJail && loc.id !== 'jail') { toast('You are in prison. You are not going anywhere.'); return; }
  const acts = Life.actionsFor(state, loc.id);
  if (!acts.length) { toast('Nothing to do here.'); return; }
  sfx.ok();
  openModal(`${loc.emoji}  ${loc.name}`, body => {
    for (const a of acts) {
      body.appendChild(rowButton(
        a.emoji, a.label, a.blocked || '',
        () => {
          if (a.jobList) return openJobList();
          if (a.carList) return openCarList();
          doAction(loc.id, a.id);
        },
        !!a.blocked, a.danger));
    }
  });
}

function doAction(venueId, actionId) {
  const before = state.money;
  const res = Life.runAction(state, venueId, actionId);
  closeModal();
  if (res.blocked) { toast(res.text); sfx.bad(); return; }
  if (res.text) toast(res.text, res.crime ? 'warn' : '');
  if (state.money > before) sfx.cash(); else sfx.ok();
  if (res.levelUp) { toast(`⭐ Level ${state.level}!`, 'good'); sfx.level(); }
  if (res.crime) startWanted(res.crime);
  if (res.arrest) beginArrest(res.lenient);
  if (res.escaped) { placeAt(city.jail.gate.x, city.jail.gate.z + 6); toast('You are outside the walls. Run.', 'warn'); }
  refreshHUD();
  Life.save(state, user);
}

function openJobList() {
  const jobs = Life.availableJobs(state);
  openModal('🔎  Job Listings', body => {
    if (state.job) body.appendChild(el('p', 'note', `Currently: ${state.job.emoji} ${state.job.title} — ${Life.money(state.job.pay)}/yr`));
    for (const j of jobs) {
      body.appendChild(rowButton(j.emoji, j.title, j.blocked || `${Life.money(j.pay)} a year`, () => {
        const r = Life.takeJob(state, j.title);
        state.happiness = Math.min(100, state.happiness + 12);
        closeModal(); toast(r.text, 'good'); sfx.cash(); refreshHUD(); Life.save(state, user);
      }, !!j.blocked));
    }
  });
}

function openCarList() {
  openModal('🚗  Showroom', body => {
    if (state.car) body.appendChild(el('p', 'note', `You drive: ${state.car.emoji} ${state.car.name}`));
    for (const c of Life.CARS) {
      const cant = state.money < c.cost ? `You need ${Life.money(c.cost)}` : null;
      body.appendChild(rowButton(c.emoji, c.name, cant || Life.money(c.cost), () => {
        const r = Life.buyCar(state, c.name);
        closeModal(); toast(r.text, r.blocked ? '' : 'good');
        if (!r.blocked) sfx.cash();
        refreshHUD(); Life.save(state, user);
      }, !!cant));
    }
  });
}

function openNpcMenu(npc) {
  sfx.ok();
  openModal(`🧍  ${npc.name}`, body => {
    const rel = state.relations.find(r => r.name === npc.name);
    if (rel) body.appendChild(el('p', 'note', `${rel.type === 'spouse' ? 'Your spouse' : rel.type === 'partner' ? 'Your partner' : 'A friend'} — ${Math.round(rel.level)}%`));
    const go = kind => {
      const r = Life.socialise(state, npc.name, kind);
      closeModal();
      if (r.blocked) { toast(r.text); sfx.bad(); return; }
      toast(r.text, r.crime ? 'warn' : 'good');
      if (r.crime) startWanted(r.crime); else sfx.ok();
      refreshHUD(); Life.save(state, user);
    };
    body.appendChild(rowButton('💬', 'Have a chat', 'Make a friend', () => go('chat')));
    body.appendChild(rowButton('😍', 'Flirt', state.age < 14 ? 'You are too young.' : 'Shoot your shot', () => go('flirt'), state.age < 14));
    body.appendChild(rowButton('🫳', 'Mug them', 'This is a crime', () => go('rob'), false, true));
  });
}

/* ============================== CHARACTER SHEET =========================== */
function openSheet() {
  const s = state;
  openModal(`${s.gender === 'm' ? '🧑' : '👩'}  ${Life.fullName(s)}`, body => {
    const grid = el('div', 'sheet');
    const add = (k, v) => { grid.appendChild(el('div', 'k', k)); grid.appendChild(el('div', 'v', v)); };
    add('Age', `${s.age}`);
    add('Level', `${s.level}  (${s.xp}/${Life.xpForLevel(s.level)} XP)`);
    add('Cash', Life.money(s.money));
    if (s.debt > 0) add('Debt', Life.money(s.debt));
    add('Job', s.job ? `${s.job.emoji} ${s.job.title} — ${Life.money(s.job.pay)}/yr` : 'Unemployed');
    add('Education', s.edu === 'degree' ? '🎓 University degree' : s.edu === 'high' ? '📘 High school' : s.enrolled ? `📚 At university (year ${s.uniYears})` : s.age <= 17 ? `🎒 In school (grades ${Math.round(s.grades)}%)` : 'None');
    add('Home', s.house ? `🔑 ${s.house}` : '🏠 With parents');
    add('Car', s.car ? `${s.car.emoji} ${s.car.name}` : 'None');
    add('Pets', s.pets.length ? s.pets.map(p => `${p.emoji} ${p.name}`).join(', ') : 'None');
    add('Children', String(s.children));
    add('Record', s.arrests ? `🚔 ${s.arrests} arrest${s.arrests > 1 ? 's' : ''}, ${s.crimes} crimes` : 'Clean');
    body.appendChild(grid);

    if (s.relations.length) {
      body.appendChild(el('h4', null, 'People'));
      for (const r of s.relations) {
        const icon = r.type === 'spouse' ? '💍' : r.type === 'partner' ? '❤️' : '🙂';
        const line = el('div', 'relRow');
        line.appendChild(el('span', null, `${icon} ${r.name}`));
        const bar = el('div', 'mini'); const fill = el('i'); fill.style.width = r.level + '%';
        bar.appendChild(fill); line.appendChild(bar);
        body.appendChild(line);
      }
    }

    body.appendChild(el('h4', null, 'Life so far'));
    const log = el('div', 'history');
    for (const line of s.history.slice(-60)) log.appendChild(el('div', line.startsWith('—') ? 'hy' : null, line));
    body.appendChild(log);
    log.scrollTop = log.scrollHeight;

    const danger = el('button', 'wide ghost', 'Abandon this life');
    danger.addEventListener('click', () => {
      if (!confirm('Throw this life away and start over?')) return;
      Life.clearSave(user); closeModal(); showStart();
    });
    body.appendChild(danger);
  });
}

/* ================================= CRIME ================================== */
function startWanted(level) {
  wanted.active = true;
  wanted.level = Math.max(wanted.level, level);
  wanted.timeLeft = 16 + level * 0.22;
  const want = Math.min(5, Math.ceil(level / 22));
  while (cops.length < want) spawnCop();
  sfx.siren();
  $('wanted').classList.add('show');
}

function spawnCop() {
  // appear on a road well away from the player so it feels like a response
  let best = null, bestD = -1;
  for (let i = 0; i < 14; i++) {
    const p = city.roadPoints[Math.floor(Math.random() * city.roadPoints.length)];
    const d = Math.hypot(p.x - player.x, p.z - player.z);
    if (d > bestD && d > 26) { bestD = d; best = p; }
  }
  const p = best || city.roadPoints[0];
  cops.push({
    x: p.x, z: p.z, angle: 0, phase: 0,
    pal: { skin: rgb('#c99a70'), shirt: rgb('#1f3f7a'), pants: rgb('#141d2e'), hair: rgb('#20242a') },
    flash: 0,
  });
}

function clearWanted(lost) {
  wanted.active = false; wanted.level = 0; wanted.timeLeft = 0;
  cops.length = 0;
  state.heat = Math.max(0, state.heat - 60);
  $('wanted').classList.remove('show');
  if (lost) { toast('🏃 You lost them.', 'good'); sfx.ok(); }
}

function beginArrest(lenient) {
  clearWanted(false);
  const ch = Life.buildCharges(state, lenient);
  sfx.bad();
  openModal('⚖️  The People vs ' + Life.fullName(state), body => {
    body.appendChild(el('p', 'note', `Charge: ${ch.charge}. The prosecution is asking for ${ch.base} years.`));
    const finish = years => {
      const text = Life.sentenceTo(state, years);
      closeModal();
      toast(text, 'warn');
      placeAt(city.jail.inside.x, city.jail.inside.z);
      refreshHUD(); Life.save(state, user);
    };
    body.appendChild(rowButton('🙇', 'Plead guilty', 'Show remorse, serve less', () => finish(Math.max(1, ch.base * 0.6))));
    body.appendChild(rowButton('😤', 'Plead not guilty', 'Risky — it could go either way', () => {
      if (Math.random() < 0.22 + state.smarts / 320) {
        closeModal(); state.heat = 0;
        toast('🎉 Not guilty. You walked out of that courtroom free.', 'good'); sfx.level();
        placeAt(city.locations.find(l => l.id === 'courthouse').x, city.locations.find(l => l.id === 'courthouse').z + 3);
        refreshHUD(); Life.save(state, user);
      } else finish(ch.base * 1.4);
    }));
    const canLawyer = state.money >= 10000;
    body.appendChild(rowButton('👔', 'Hire a real lawyer', canLawyer ? 'Costs $10,000' : 'You need $10,000', () => {
      state.money -= 10000;
      finish(Math.random() < 0.75 ? Math.max(1, ch.base * 0.35) : ch.base);
    }, !canLawyer));
  }, { noClose: true });
}

/* ================================== YEAR ================================== */
function endYear(manual) {
  if (state.dead) return;
  const res = Life.ageUp(state);
  yearLeft = YEAR_SECONDS;
  for (const line of res.lines) toast(line);
  if (res.levelUp) { toast(`⭐ Level ${state.level}!`, 'good'); sfx.level(); }
  if (res.freed) placeAt(city.jail.gate.x, city.jail.gate.z + 5);
  if (state.inJail) placeAt(city.jail.inside.x, city.jail.inside.z);
  Life.save(state, user);
  refreshHUD();
  if (state.dead) return showDeath();
  if (!manual) toast(`🎂 You are now ${state.age}.`, 'good');
  sfx.ok();
}

function showDeath() {
  running = false;
  const sum = Life.lifeSummary(state);
  Life.clearSave(user);
  $('deathTitle').textContent = `${Life.fullName(state)}, ${state.born}–${state.born + state.age}`;
  $('deathCause').textContent = `Died at ${state.age}. Cause: ${state.cause}.`;
  const st = $('deathStats');
  st.innerHTML = '';
  const rows = [
    ['Final level', state.level],
    ['Money', Life.money(state.money)],
    ['Job', state.job ? state.job.title : 'Unemployed'],
    ['Education', state.edu === 'degree' ? 'Degree' : state.edu === 'high' ? 'High school' : 'None'],
    ['Children', state.children],
    ['Arrests', state.arrests],
    ['Crimes committed', state.crimes],
    ['Life score', `${sum.score} — ${sum.rank}`],
  ];
  for (const [k, v] of rows) {
    const r = el('div', 'dRow');
    r.appendChild(el('span', null, k));
    r.appendChild(el('b', null, String(v)));
    st.appendChild(r);
  }
  $('death').classList.add('show');
}

/* ================================ MOVEMENT ================================ */
function placeAt(x, z) { player.x = x; player.z = z; }

/** Push a circle out of every axis-aligned box it overlaps. */
function collide(p, radius) {
  for (const c of city.colliders) {
    const nx = Math.max(c.x0, Math.min(p.x, c.x1));
    const nz = Math.max(c.z0, Math.min(p.z, c.z1));
    let dx = p.x - nx, dz = p.z - nz;
    let d = Math.hypot(dx, dz);
    if (d >= radius) continue;
    if (d < 0.0001) {                       // dead centre: eject on the shallow axis
      const toL = Math.abs(p.x - c.x0), toR = Math.abs(c.x1 - p.x);
      const toN = Math.abs(p.z - c.z0), toF = Math.abs(c.z1 - p.z);
      const m = Math.min(toL, toR, toN, toF);
      if (m === toL) p.x = c.x0 - radius; else if (m === toR) p.x = c.x1 + radius;
      else if (m === toN) p.z = c.z0 - radius; else p.z = c.z1 + radius;
      continue;
    }
    dx /= d; dz /= d;
    p.x = nx + dx * radius;
    p.z = nz + dz * radius;
  }
  p.x = Math.max(WORLD.minX + 1, Math.min(WORLD.maxX - 1, p.x));
  p.z = Math.max(WORLD.minZ + 1, Math.min(WORLD.maxZ - 1, p.z));
}

function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (keys['w'] || keys['arrowup']) iz += 1;
  if (keys['s'] || keys['arrowdown']) iz -= 1;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  if (stick.active) { ix += stick.dx; iz -= stick.dy; }
  const mag = Math.hypot(ix, iz);
  player.moving = mag > 0.08;

  const wantSprint = player.sprinting || keys['shift'];
  const canSprint = wantSprint && player.stamina > 1 && player.moving;
  player.stamina = Math.max(0, Math.min(100, player.stamina + (canSprint ? -32 : 22) * dt));

  if (player.moving) {
    const nx = ix / mag, nz = iz / mag;
    // move relative to where the camera is looking
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const wx = nx * cy + nz * sy;
    const wz = -nx * sy + nz * cy;
    const speed = (canSprint ? SPRINT_SPEED : BASE_SPEED) * (1 + state.level * 0.012) *
                  (0.75 + Math.max(20, state.health) / 260) * Math.min(1, mag * 1.6);
    player.x += wx * speed * dt;
    player.z += wz * speed * dt;
    player.angle = Math.atan2(wx, wz);
    player.phase += dt * (canSprint ? 15 : 10);
  } else {
    player.phase += dt * 1.5;
  }
  collide(player, PLAYER_R);
}

function updateCamera(dt) {
  const tx = player.x, ty = 1.7, tz = player.z;
  const cp = Math.cos(cam.pitch);
  let dist = cam.dist;
  // pull the camera in if a building is between it and the player
  const ex0 = tx + Math.sin(cam.yaw) * cp * dist;
  const ez0 = tz + Math.cos(cam.yaw) * cp * dist;
  for (let s = 0.25; s <= 1; s += 0.15) {
    const px = tx + (ex0 - tx) * s, pz = tz + (ez0 - tz) * s;
    if (city.colliders.some(c => px > c.x0 - 0.4 && px < c.x1 + 0.4 && pz > c.z0 - 0.4 && pz < c.z1 + 0.4)) {
      dist = Math.min(dist, cam.dist * s * 0.9);
      break;
    }
  }
  dist = Math.max(2.4, dist);
  const eye = [
    tx + Math.sin(cam.yaw) * cp * dist,
    ty + Math.sin(cam.pitch) * dist + 1.2,
    tz + Math.cos(cam.yaw) * cp * dist,
  ];
  gfx.setCamera(eye, [tx, ty, tz], 58, 0.3, 340);
  void dt;
}

/* ================================== NPCs ================================== */
const SHIRTS = ['#e0533f', '#3aa7e0', '#4caf50', '#f2b134', '#9b59b6', '#e91e8c', '#26c6da', '#ff8a3d', '#8d6e63'];
const SKINS = ['#f3cfa5', '#d9a06b', '#a9713f', '#7a4c26', '#5a3418', '#e8b98c'];
const HAIRS = ['#2a1d16', '#5b3a1e', '#c9a227', '#e8e2d8', '#7a2f2f', '#1b1b1f'];

function spawnNpcs() {
  for (let i = 0; i < NPC_COUNT; i++) {
    const p = city.roadPoints[Math.floor(Math.random() * city.roadPoints.length)];
    npcs.push({
      x: p.x + (Math.random() - 0.5) * 6, z: p.z + (Math.random() - 0.5) * 6,
      angle: Math.random() * 6.28, phase: Math.random() * 6.28,
      speed: 1.6 + Math.random() * 1.8,
      target: null, pause: 0,
      name: Life.randomNpcName(),
      pal: {
        skin: rgb(SKINS[i % SKINS.length]),
        shirt: rgb(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]),
        pants: rgb(['#2f3b52', '#3a3a3a', '#5b4a3a', '#22303f'][Math.floor(Math.random() * 4)]),
        hair: rgb(HAIRS[Math.floor(Math.random() * HAIRS.length)]),
      },
    });
  }
}

function steer(a, tx, tz, speed, dt) {
  const dx = tx - a.x, dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.001) return 0;
  a.x += (dx / d) * speed * dt;
  a.z += (dz / d) * speed * dt;
  a.angle = Math.atan2(dx / d, dz / d);
  a.phase += dt * (speed * 1.6);
  collide(a, 0.5);
  return d;
}

function updateNpcs(dt) {
  for (const n of npcs) {
    if (n.pause > 0) { n.pause -= dt; n.phase += dt; continue; }
    if (!n.target) {
      const p = city.roadPoints[Math.floor(Math.random() * city.roadPoints.length)];
      n.target = { x: p.x + (Math.random() - 0.5) * 8, z: p.z + (Math.random() - 0.5) * 8 };
    }
    const d = steer(n, n.target.x, n.target.z, n.speed, dt);
    if (d < 1.6) { n.target = null; n.pause = Math.random() * 2.5; }
  }
}

function updateCops(dt) {
  if (!wanted.active) return;
  let caught = false;
  const speed = 6.4 + wanted.level * 0.024;
  for (const c of cops) {
    const d = steer(c, player.x, player.z, speed, dt);
    c.flash += dt * 8;
    if (d < 1.5) caught = true;
  }
  wanted.timeLeft -= dt;
  $('wantedFill').style.width = Math.max(0, wanted.timeLeft / (16 + wanted.level * 0.22) * 100) + '%';
  $('wantedStars').textContent = '★'.repeat(Math.min(5, Math.ceil(wanted.level / 22)));
  if (caught) { toast('🚔 You have been arrested.', 'warn'); beginArrest(false); return; }
  if (wanted.timeLeft <= 0) clearWanted(true);
}

/* ================================ DRAWING ================================= */
function drawPerson(L, a, opts = {}) {
  const fx = Math.sin(a.angle), fz = Math.cos(a.angle);
  const rx = Math.cos(a.angle), rz = -Math.sin(a.angle);
  const sw = Math.sin(a.phase) * 0.22;
  const bob = Math.abs(Math.sin(a.phase)) * 0.045;
  const p = a.pal;
  const at = (side, fwd, y, sx, sy, sz, col, em) =>
    L.box(a.x + rx * side + fx * fwd, y + bob, a.z + rz * side + fz * fwd, sx, sy, sz, col, a.angle, em || 0);

  L.shadow(a.x, a.z, 0.55);
  at(0.17, sw, 0, 0.26, 0.8, 0.26, p.pants);          // legs
  at(-0.17, -sw, 0, 0.26, 0.8, 0.26, p.pants);
  at(0, 0, 0.78, 0.66, 0.62, 0.36, p.shirt);          // torso
  at(0.4, -sw * 0.8, 0.8, 0.2, 0.56, 0.2, p.shirt);   // arms
  at(-0.4, sw * 0.8, 0.8, 0.2, 0.56, 0.2, p.shirt);
  at(0.4, -sw * 0.8, 0.68, 0.19, 0.16, 0.19, p.skin); // hands
  at(-0.4, sw * 0.8, 0.68, 0.19, 0.16, 0.19, p.skin);
  at(0, 0, 1.4, 0.42, 0.42, 0.4, p.skin);             // head
  at(0, -0.02, 1.72, 0.46, 0.12, 0.44, p.hair);       // hair
  at(0, 0.19, 1.5, 0.1, 0.08, 0.06, rgb('#1a1a1a'));  // eyes
  if (opts.cop) {                                      // flashing cap
    const on = Math.sin(a.flash) > 0;
    at(0, 0, 1.84, 0.5, 0.14, 0.48, on ? rgb('#5aa8ff') : rgb('#ff5a5a'), 1);
  }
  if (opts.crown) at(0, 0, 1.86, 0.42, 0.16, 0.4, rgb('#ffd76a'), 0.7);
}

function drawPets(L) {
  for (let i = 0; i < state.pets.length; i++) {
    const ang = player.angle + Math.PI + i * 0.7;
    const px = player.x + Math.sin(ang) * (1.4 + i * 0.5);
    const pz = player.z + Math.cos(ang) * (1.4 + i * 0.5);
    const bob = Math.abs(Math.sin(player.phase * 1.3 + i)) * 0.06;
    L.shadow(px, pz, 0.3);
    L.box(px, 0.2 + bob, pz, 0.6, 0.34, 0.32, rgb('#8d6e4a'), player.angle);
    L.box(px + Math.sin(player.angle) * 0.34, 0.42 + bob, pz + Math.cos(player.angle) * 0.34, 0.3, 0.3, 0.28, rgb('#a5825c'), player.angle);
  }
}

function drawDoorMarkers(L, t) {
  for (const loc of city.locations) {
    if (loc.id === 'jail' && !state.inJail) continue;
    const d = Math.hypot(loc.x - player.x, loc.z - player.z);
    if (d > 40) continue;
    const near = loc === nearVenue;
    const pulse = 0.55 + 0.45 * Math.sin(t * 3 + loc.cx);
    const col = near ? rgb('#7dffa8') : rgb('#66ccff');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.6;
      L.box(loc.x + Math.cos(a) * 1.9, 0.05, loc.z + Math.sin(a) * 1.9,
            0.42, 0.06, 0.42, col, a, near ? 1 : pulse * 0.6);
    }
  }
}

/* --------------------------- floating HTML labels -------------------------- */
function setupLabels() {
  const layer = $('labels');
  layer.innerHTML = '';
  labels.clear();
  for (const loc of city.locations) {
    const d = el('div', 'lbl');
    d.innerHTML = `<span class="e">${loc.emoji}</span><span class="n">${loc.name}</span>`;
    layer.appendChild(d);
    labels.set(loc.id, d);
  }
  const you = el('div', 'lbl you');
  you.innerHTML = '<span class="n">YOU</span>';
  layer.appendChild(you);
  labels.set('__you', you);
}

function updateLabels() {
  for (const loc of city.locations) {
    const d = labels.get(loc.id);
    const dist = Math.hypot(loc.x - player.x, loc.z - player.z);
    if (dist > 85) { d.style.display = 'none'; continue; }
    const p = gfx.project(loc.cx, loc.signY, loc.cz);
    if (!p.visible) { d.style.display = 'none'; continue; }
    d.style.display = '';
    const scale = Math.max(0.55, Math.min(1.15, 26 / dist));
    d.style.transform = `translate(-50%,-50%) translate(${p.x}px, ${p.y}px) scale(${scale})`;
    d.style.opacity = String(Math.max(0.25, Math.min(1, (85 - dist) / 45)));
    d.classList.toggle('active', loc === nearVenue);
  }
  const you = labels.get('__you');
  const yp = gfx.project(player.x, 2.5, player.z);
  if (yp.visible) {
    you.style.display = '';
    you.style.transform = `translate(-50%,-50%) translate(${yp.x}px, ${yp.y}px)`;
  } else you.style.display = 'none';
}

/* ================================== HUD =================================== */
function bar(id, v) { $(id).style.width = Math.max(0, Math.min(100, v)) + '%'; }

function refreshHUD() {
  const s = state;
  $('hName').textContent = Life.fullName(s);
  $('hAge').textContent = `Age ${s.age}`;
  $('hLevel').textContent = `LVL ${s.level}`;
  $('hMoney').textContent = Life.money(s.money);
  $('hMoney').className = s.money < 0 ? 'neg' : '';
  bar('sHealth', s.health); bar('sHappy', s.happiness);
  bar('sSmart', s.smarts);  bar('sLooks', s.looks);
  bar('xpFill', s.xp / Life.xpForLevel(s.level) * 100);
  $('jailTag').style.display = s.inJail ? '' : 'none';
  if (s.inJail) $('jailTag').textContent = `⛓️ ${Math.floor(s.served)}/${s.sentence} yrs`;
}

function updatePrompt() {
  nearVenue = null; nearNpc = null;
  let bestD = 1e9;
  for (const loc of city.locations) {
    if (loc.id === 'jail' && !state.inJail) continue;
    if (state.inJail && loc.id !== 'jail') continue;
    const d = Math.hypot(loc.x - player.x, loc.z - player.z);
    if (d < loc.radius && d < bestD) { bestD = d; nearVenue = loc; }
  }
  if (!nearVenue && !state.inJail) {
    for (const n of npcs) {
      const d = Math.hypot(n.x - player.x, n.z - player.z);
      if (d < 3.2 && d < bestD) { bestD = d; nearNpc = n; }
    }
  }
  const btn = $('actionBtn');
  if (nearVenue) {
    btn.style.display = '';
    btn.innerHTML = `<b>${nearVenue.emoji}</b> Enter ${nearVenue.name}`;
  } else if (nearNpc) {
    btn.style.display = '';
    btn.innerHTML = `<b>🧍</b> Talk to ${nearNpc.name}`;
  } else {
    btn.style.display = 'none';
  }
}

function tryInteract() {
  if (modalOpen || !running) return;
  if (nearVenue) openVenue(nearVenue);
  else if (nearNpc) openNpcMenu(nearNpc);
}

/* ============================ time of day ================================= */
function updateSky() {
  const t = 1 - yearLeft / YEAR_SECONDS;            // 0 = dawn, 1 = midnight
  const ang = -0.12 * Math.PI + t * 1.24 * Math.PI;
  const elev = Math.sin(ang);
  const lightness = Math.max(0, elev);
  gfx.sun = [Math.cos(ang) * 0.6, Math.max(0.06, elev), 0.45, 0.35 + lightness * 0.75];
  const day = [0.62, 0.78, 0.94], dusk = [0.85, 0.55, 0.38], night = [0.05, 0.07, 0.13];
  let c;
  if (elev > 0.35) c = day;
  else if (elev > 0) { const k = elev / 0.35; c = day.map((v, i) => dusk[i] + (v - dusk[i]) * k); }
  else { const k = Math.min(1, -elev / 0.25); c = dusk.map((v, i) => v + (night[i] - v) * k); }
  gfx.fog = [c[0], c[1], c[2], 0.0105];
  gfx.sky = [c[0] * 0.9, c[1] * 0.95, c[2], 1];
}

/* ================================= LOOP =================================== */
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
  lastT = now;
  if (!running) return;

  gfx.resize();

  if (!modalOpen && !paused) {
    updatePlayer(dt);
    updateNpcs(dt);
    updateCops(dt);
    yearLeft -= dt;
    if (yearLeft <= 0) endYear(false);
  }
  updateCamera(dt);
  updateSky();
  updatePrompt();

  // dynamic geometry
  dyn.reset();
  const t = now / 1000;
  drawDoorMarkers(dyn, t);
  for (const n of npcs) {
    if (Math.abs(n.x - player.x) + Math.abs(n.z - player.z) > 130) continue;
    drawPerson(dyn, n);
  }
  for (const c of cops) drawPerson(dyn, c, { cop: true });
  drawPets(dyn);
  drawPerson(dyn, player, { crown: state.level >= 10 });
  gfx.setDynamic(dyn.data, dyn.count);
  gfx.render();

  updateLabels();

  // year bar + stamina
  $('yearFill').style.width = (100 - yearLeft / YEAR_SECONDS * 100) + '%';
  $('yearText').textContent = `Age ${state.age} · ${Math.ceil(yearLeft)}s`;
  $('stamFill').style.width = player.stamina + '%';
}

/* ================================== BOOT ================================== */
function showStart() {
  running = false; paused = true;
  $('start').classList.add('show');
  $('death').classList.remove('show');
  const saved = Life.load(user);
  $('continueBtn').style.display = saved ? '' : 'none';
  if (saved) $('continueBtn').textContent = `Continue as ${saved.name} ${saved.surname}, age ${saved.age}`;
}

function beginLife(s) {
  state = s;
  npcs.length = 0; cops.length = 0;
  wanted.active = false;
  $('wanted').classList.remove('show');
  spawnNpcs();
  if (state.inJail) placeAt(city.jail.inside.x, city.jail.inside.z);
  else placeAt(city.spawn.x, city.spawn.z);
  cam.yaw = Math.PI; cam.pitch = 0.38; cam.dist = 9;
  yearLeft = YEAR_SECONDS;
  player.pal.shirt = rgb(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]);
  $('start').classList.remove('show');
  $('death').classList.remove('show');
  running = true; paused = false;
  refreshHUD();
  Life.save(state, user);
  for (const line of state.history.slice(-3)) toast(line);
  toast('Walk to a glowing doorway and press ENTER to go inside.', 'good');
}

export async function boot() {
  user = localStorage.getItem('colton_last_user') || localStorage.getItem('colton_user') || 'guest';

  const canvas = $('view');
  try {
    gfx = await createGFX(canvas);
  } catch (e) {
    $('start').innerHTML = `<div class="card"><h1>Can't start</h1><p>${e.message}</p></div>`;
    return;
  }
  $('apiTag').textContent = gfx.api === 'webgpu' ? 'WebGPU' : 'WebGL2 fallback';

  city = buildCity();
  gfx.setStatic(city.statics.data, city.statics.count);
  dyn = new InstanceList(2048);
  setupLabels();
  setupInput();

  $('modalClose').addEventListener('click', closeModal);
  $('newLifeBtn').addEventListener('click', () => {
    const name = $('nameInput').value.trim().slice(0, 14);
    beginLife(Life.newLife(name || null));
  });
  $('continueBtn').addEventListener('click', () => {
    const saved = Life.load(user);
    if (saved) beginLife(saved); else beginLife(Life.newLife(null));
  });
  $('againBtn').addEventListener('click', showStart);
  $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('newLifeBtn').click(); });

  addEventListener('resize', () => gfx.resize());
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (document.hidden && state) Life.save(state, user);
  });

  showStart();
  lastT = performance.now();
  requestAnimationFrame(frame);
}
