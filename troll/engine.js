/* ===========================================================================
   Troll Square — the rules of the world.

   Everything here is pure and deterministic: same level + same button
   presses = same outcome, every time, with no clock and no randomness. That
   is what lets a robot play through every level offline and prove the exit
   can actually be reached, which matters a lot in a game whose whole joke is
   that it is trying to cheat you.
   =========================================================================== */

export const TILE = 24;

/* --------------------------------- tiles ---------------------------------
   .  nothing            #  solid brick        =  crumbles when stood on
   ^  spike up           v  spike down         <  spike left      >  spike right
   ~  jump-through platform                    S  start           G  the door
   M  platform sliding sideways                N  platform sliding up and down
   L  laser eye in the ceiling
   ?  looks solid, is not (vanishes on touch)
   !  looks like nothing, is solid once you head-butt it
   T  spike hiding in the floor, springs up when you get close
   x  looks like a spike, completely harmless
   B  where the boss stands
   -------------------------------------------------------------------------- */
export const SOLIDS = '#=?!';
export const SPIKES = '^v<>';

export const PHYS = {
  gravity: 0.86,
  maxFall: 15,
  accel: 1.1,
  friction: 0.78,
  runSpeed: 4.3,
  jump: 12.4,
  cutJump: 0.42,        // let go early and the hop is shorter
  coyote: 6,            // frames of grace after walking off a ledge
  buffer: 7,            // frames a jump press is remembered for
  crumbleFuse: 22,      // frames between standing on a block and it letting go
  crumbleBack: 150,
  moverSpeed: 1.15,
  laserPeriod: 150,
  laserWarn: 40,
  laserBeam: 34,
  playerW: 18,
  playerH: 20
};

/* -------------------------------- parsing --------------------------------- */
export function parseLevel(rows) {
  const h = rows.length, w = rows[0].length;
  const grid = rows.map(r => r.padEnd(w, '.').split(''));
  const level = {
    w, h, grid,
    spawn: { x: TILE * 2, y: TILE * 2 },
    goal: null, bossAt: null,
    movers: [], lasers: [], traps: []
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      if (c === 'S') { level.spawn = { x: x * TILE + 3, y: y * TILE + 4 }; grid[y][x] = '.'; }
      else if (c === 'G') { level.goal = { x: x * TILE, y: y * TILE }; }
      else if (c === 'B') { level.bossAt = { x: x * TILE, y: y * TILE }; grid[y][x] = '.'; }
      else if (c === 'M' || c === 'N') {
        level.movers.push(makeMover(grid, x, y, c === 'M' ? 'h' : 'v', w, h));
        grid[y][x] = '.';
      } else if (c === 'L') {
        level.lasers.push({ x, y, phase: (x * 37 + y * 11) % PHYS.laserPeriod });
      } else if (c === 'T') {
        level.traps.push({ x, y });
      }
    }
  }
  return level;
}

/** A sliding platform runs until it meets a wall, then turns around. */
function makeMover(grid, x, y, axis, w, h) {
  let lo = x, hi = x;
  if (axis === 'h') {
    while (lo > 0 && !SOLIDS.includes(grid[y][lo - 1])) lo--;
    while (hi < w - 1 && !SOLIDS.includes(grid[y][hi + 1])) hi++;
  } else {
    lo = y; hi = y;
    while (lo > 0 && !SOLIDS.includes(grid[lo - 1][x])) lo--;
    while (hi < h - 1 && !SOLIDS.includes(grid[hi + 1][x])) hi++;
  }
  return {
    axis, w: TILE * 2, h: 10,
    x: x * TILE, y: y * TILE,
    min: (axis === 'h' ? lo : lo) * TILE,
    max: (axis === 'h' ? hi * TILE - TILE : hi * TILE),
    dir: 1
  };
}

/* --------------------------------- state ---------------------------------- */
export function createState(level) {
  return {
    frame: 0,
    x: level.spawn.x, y: level.spawn.y,
    vx: 0, vy: 0,
    onGround: false, coyote: 0, buffered: 0, facing: 1,
    dead: false, won: false, deathBy: '',
    crumbling: {},          // "x,y" -> frames left before it drops
    gone: {},               // "x,y" -> frames until it comes back
    sprung: {},             // troll spikes that have popped up
    revealed: {},           // hidden blocks that have been head-butted
    fakeGone: {},           // troll blocks that have crumbled away
    // Platform positions belong to the playthrough, not the level, or two
    // games of the same level would shove each other around.
    movers: level.movers.map(m => ({ x: m.x, y: m.y, dir: m.dir })),
    ridingIx: -1,
    prevFoot: level.spawn.y + PHYS.playerH
  };
}

const key = (x, y) => x + ',' + y;

export function tileAt(level, st, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return tx < 0 || tx >= level.w ? '#' : '.';
  const c = level.grid[ty][tx];
  if (c === '=' && st.gone[key(tx, ty)]) return '.';
  if (c === '?' && st.fakeGone[key(tx, ty)]) return '.';
  if (c === '!') return st.revealed[key(tx, ty)] ? '#' : '.';
  return c;
}

/** Is this tile something you would stand on? */
function isSolid(level, st, tx, ty) {
  const c = tileAt(level, st, tx, ty);
  if (c === '!') return false;
  return SOLIDS.includes(c);
}

/* ------------------------------ moving parts ------------------------------- */
function stepMovers(level, st) {
  level.movers.forEach((def, i) => {
    const m = st.movers[i];
    const pos = def.axis === 'h' ? m.x : m.y;
    let next = pos + m.dir * PHYS.moverSpeed;
    if (next <= def.min) { next = def.min; m.dir = 1; }
    if (next >= def.max) { next = def.max; m.dir = -1; }
    if (def.axis === 'h') m.x = next; else m.y = next;
  });
}
/** Where a platform is right now, and how big it is. */
export function moverBox(level, st, i) {
  const def = level.movers[i], m = st.movers[i];
  return { x: m.x, y: m.y, w: def.w, h: def.h, axis: def.axis, dir: m.dir };
}

/** Lasers run off the frame counter, so their timing is reproducible. */
export function laserPhase(st, l) {
  const t = (st.frame + l.phase) % PHYS.laserPeriod;
  if (t < PHYS.laserWarn) return { state: 'warn', t };
  if (t < PHYS.laserWarn + PHYS.laserBeam) return { state: 'fire', t };
  return { state: 'idle', t };
}

/* ------------------------------ the main step ------------------------------ */
/**
 * @param input {left, right, jump, jumpHeld}
 * @returns list of things that happened this frame, for sound and sparkles
 */
export function step(level, st, input) {
  const events = [];
  if (st.dead || st.won) return events;
  st.frame++;

  // timers
  for (const k in st.crumbling) {
    if (--st.crumbling[k] <= 0) { delete st.crumbling[k]; st.gone[k] = PHYS.crumbleBack; events.push('crumble'); }
  }
  for (const k in st.gone) if (--st.gone[k] <= 0) delete st.gone[k];

  stepMovers(level, st);

  // ---- sideways ----
  const want = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (want) {
    st.vx += want * PHYS.accel;
    st.facing = want;
    if (Math.abs(st.vx) > PHYS.runSpeed) st.vx = PHYS.runSpeed * Math.sign(st.vx);
  } else {
    st.vx *= PHYS.friction;
    if (Math.abs(st.vx) < 0.1) st.vx = 0;
  }

  // ---- jumping ----
  if (input.jump) st.buffered = PHYS.buffer;
  else if (st.buffered > 0) st.buffered--;
  if (st.coyote > 0) st.coyote--;

  if (st.buffered > 0 && st.coyote > 0) {
    st.vy = -PHYS.jump;
    st.buffered = 0;
    st.coyote = 0;
    st.onGround = false;
    st.riding = null;
    events.push('jump');
  }
  if (st.vy < 0 && !input.jumpHeld) st.vy *= PHYS.cutJump;

  st.vy += PHYS.gravity;
  if (st.vy > PHYS.maxFall) st.vy = PHYS.maxFall;

  // carried along by whatever you are standing on
  if (st.ridingIx >= 0) {
    const def = level.movers[st.ridingIx], m = st.movers[st.ridingIx];
    if (def) {
      if (def.axis === 'h') st.x += m.dir * PHYS.moverSpeed;
      else st.y += m.dir * PHYS.moverSpeed;
    }
  }

  moveAxis(level, st, st.vx, 0, events);
  st.prevFoot = st.y + PHYS.playerH;      // remembered before falling, for one-ways
  moveAxis(level, st, 0, st.vy, events);

  // ---- riding platforms ----
  st.ridingIx = -1;
  const foot = st.y + PHYS.playerH;
  level.movers.forEach((def, i) => {
    const m = st.movers[i];
    if (st.vy >= 0 && foot >= m.y - 2 && foot <= m.y + def.h &&
        st.x + PHYS.playerW > m.x && st.x < m.x + def.w) {
      st.y = m.y - PHYS.playerH;
      st.vy = 0;
      st.onGround = true;
      st.coyote = PHYS.coyote;
      st.ridingIx = i;
    }
  });

  checkTouches(level, st, events);
  return events;
}

/** Move on one axis and stop dead at anything solid. */
function moveAxis(level, st, dx, dy, events) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    st.x += sx;
    st.y += sy;
    const hit = overlapSolid(level, st);
    if (!hit) {
      if (dy > 0) st.onGround = false;
      continue;
    }
    st.x -= sx;
    st.y -= sy;
    if (dx !== 0) { st.vx = 0; break; }
    if (dy > 0) {                       // landed
      st.vy = 0;
      st.onGround = true;
      st.coyote = PHYS.coyote;
      startCrumble(level, st, events);
      break;
    }
    if (dy < 0) {                       // head-butt
      st.vy = 0;
      bumpHead(level, st, events);
      break;
    }
  }
  if (dy > 0 && !overlapSolid(level, st, 0, 1)) st.onGround = false;
}

function boxTiles(st, ox, oy) {
  const x0 = Math.floor((st.x + (ox || 0)) / TILE);
  const x1 = Math.floor((st.x + (ox || 0) + PHYS.playerW - 1) / TILE);
  const y0 = Math.floor((st.y + (oy || 0)) / TILE);
  const y1 = Math.floor((st.y + (oy || 0) + PHYS.playerH - 1) / TILE);
  return { x0, x1, y0, y1 };
}

function overlapSolid(level, st, ox, oy) {
  const b = boxTiles(st, ox, oy);
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      if (isSolid(level, st, x, y)) return { x, y };
    }
  }
  // One-way platforms only stop you on the way down, and only if your feet
  // started the fall above them — otherwise you would snag jumping up through.
  if (st.vy >= 0) {
    const ty = Math.floor((st.y + (oy || 0) + PHYS.playerH - 1) / TILE);
    for (let x = b.x0; x <= b.x1; x++) {
      if (tileAt(level, st, x, ty) === '~' && st.prevFoot <= ty * TILE + 2) return { x, y: ty };
    }
  }
  return null;
}

/** Standing on something that gives way starts its fuse. */
function startCrumble(level, st, events) {
  const b = boxTiles(st, 0, 1);
  const ty = b.y1;
  for (let x = b.x0; x <= b.x1; x++) {
    const c = tileAt(level, st, x, ty);
    const k = key(x, ty);
    if (c === '=' && !st.crumbling[k] && !st.gone[k]) {
      st.crumbling[k] = PHYS.crumbleFuse;
      events.push('creak');
    }
    if (c === '?' && !st.fakeGone[k]) {          // the block that was never real
      st.fakeGone[k] = 1;
      events.push('trick');
    }
  }
}

/** Head-butting reveals the blocks that were hiding. */
function bumpHead(level, st, events) {
  const b = boxTiles(st, 0, -1);
  for (let x = b.x0; x <= b.x1; x++) {
    if (level.grid[b.y0] && level.grid[b.y0][x] === '!' && !st.revealed[key(x, b.y0)]) {
      st.revealed[key(x, b.y0)] = 1;
      events.push('reveal');
    }
  }
}

/* ------------------------------ what kills you ----------------------------- */
function checkTouches(level, st, events) {
  const b = boxTiles(st, 0, 0);

  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const c = tileAt(level, st, x, y);
      if (SPIKES.includes(c)) { kill(st, 'spike', events); return; }
      if (c === 'G') { st.won = true; events.push('win'); return; }
    }
  }

  // spikes that were hiding in the floor
  level.traps.forEach(t => {
    const k = key(t.x, t.y);
    const near = Math.abs((st.x + PHYS.playerW / 2) - (t.x * TILE + TILE / 2)) < TILE * 2.2
      && Math.abs((st.y + PHYS.playerH) - t.y * TILE) < TILE * 2.5;
    if (near && !st.sprung[k]) { st.sprung[k] = 1; events.push('spring'); }
    if (st.sprung[k]) {
      const sx = t.x * TILE, sy = t.y * TILE - 14;
      if (st.x + PHYS.playerW > sx + 3 && st.x < sx + TILE - 3 &&
          st.y + PHYS.playerH > sy && st.y < sy + 16) { kill(st, 'trap', events); }
    }
  });
  if (st.dead) return;

  // laser beams sweep the whole column below the eye
  for (const l of level.lasers) {
    if (laserPhase(st, l).state !== 'fire') continue;
    const bx = l.x * TILE + 6, bw = TILE - 12;
    if (st.x + PHYS.playerW > bx && st.x < bx + bw && (st.y + PHYS.playerH) > l.y * TILE) {
      let blocked = false;                      // walls stop the beam
      for (let ty = l.y + 1; ty < Math.floor((st.y + PHYS.playerH) / TILE); ty++) {
        if (isSolid(level, st, l.x, ty)) { blocked = true; break; }
      }
      if (!blocked) { kill(st, 'laser', events); return; }
    }
  }

  if (st.y > level.h * TILE + 60) kill(st, 'fall', events);
}

function kill(st, how, events) {
  if (st.dead) return;
  st.dead = true;
  st.deathBy = how;
  events.push('death');
}

/* -------------------------- the robot that checks --------------------------
   Plays a level with a breadth-first search over coarse positions. It proves
   the exit can be walked and jumped to; it deliberately ignores the timed
   hazards, which are dodged rather than routed around.
   -------------------------------------------------------------------------- */
export function proveReachable(rows, budget) {
  // Sliding platforms become solid along their whole run, because you can
  // always stand and wait for one. Lasers and pop-up spikes come out: those
  // are dodged on timing, not routed around, so leaving them in would only
  // make the search claim a good level was impossible.
  const probe = rows.map(r => r.split(''));
  const scan = parseLevel(rows.slice());
  scan.movers.forEach((m, i) => {
    const def = scan.movers[i];
    if (def.axis === 'h') {
      const ty = Math.round(def.y / TILE);
      for (let tx = Math.floor(def.min / TILE); tx <= Math.ceil(def.max / TILE) + 1; tx++) {
        if (probe[ty] && probe[ty][tx] === '.') probe[ty][tx] = '~';
      }
    } else {
      const tx = Math.round(def.x / TILE);
      for (let ty = Math.floor(def.min / TILE); ty <= Math.ceil(def.max / TILE); ty++) {
        if (probe[ty] && probe[ty][tx] === '.') probe[ty][tx] = '~';
      }
    }
  });
  const cleaned = probe.map(r => r.join('').replace(/[LTM N]/g, c => (c === ' ' ? ' ' : '.')));

  const level = parseLevel(cleaned);
  if (!level.goal) return { ok: false, why: 'no door' };

  const seen = new Set();
  const start = createState(level);
  const queue = [{ st: start, depth: 0 }];
  const MOVES = [
    { left: 0, right: 0, jump: 0 }, { left: 1, right: 0, jump: 0 }, { left: 0, right: 1, jump: 0 },
    { left: 0, right: 0, jump: 1 }, { left: 1, right: 0, jump: 1 }, { left: 0, right: 1, jump: 1 }
  ];
  const HOLD = 6;                       // each move is held for a few frames
  let expanded = 0;
  const cap = budget || 90000;

  while (queue.length && expanded < cap) {
    const node = queue.shift();
    expanded++;
    for (const mv of MOVES) {
      const st = cloneState(node.st);
      let won = false;
      for (let f = 0; f < HOLD && !st.dead && !st.won; f++) {
        step(level, st, {
          left: !!mv.left, right: !!mv.right,
          jump: !!mv.jump && f === 0, jumpHeld: !!mv.jump
        });
      }
      if (st.won) return { ok: true, expanded };
      if (st.dead) continue;
      const sig = Math.round(st.x / 8) + ':' + Math.round(st.y / 8)
        + ':' + Math.round(st.vy / 4) + ':' + (st.onGround ? 1 : 0);
      if (seen.has(sig)) continue;
      seen.add(sig);
      queue.push({ st, depth: node.depth + 1 });
    }
  }
  return { ok: false, why: 'no route found', expanded };
}

function cloneState(s) {
  return {
    frame: s.frame, x: s.x, y: s.y, vx: s.vx, vy: s.vy,
    onGround: s.onGround, coyote: s.coyote, buffered: s.buffered, facing: s.facing,
    dead: s.dead, won: s.won, deathBy: s.deathBy,
    crumbling: Object.assign({}, s.crumbling),
    gone: Object.assign({}, s.gone),
    sprung: Object.assign({}, s.sprung),
    revealed: Object.assign({}, s.revealed),
    fakeGone: Object.assign({}, s.fakeGone),
    movers: s.movers.map(m => ({ x: m.x, y: m.y, dir: m.dir })),
    ridingIx: s.ridingIx,
    prevFoot: s.prevFoot
  };
}
