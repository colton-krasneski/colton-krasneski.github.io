/* ============================================================================
   world.js — builds the city once, as a static instance list plus the
   metadata the game needs: door positions, collision rectangles, road points.

   Layout is a 5 x 4 grid of blocks separated by roads. Every block is either
   a venue you can walk into, an open park/plaza, or filler towers.
============================================================================ */

import { InstanceList, rgb } from './gfx.js';

export const BLOCK = 34;          // block edge length
export const ROAD  = 12;          // road width between blocks
const CELL = BLOCK + ROAD;
const COLS = 5, ROWS = 4;
const OFF_X = -((COLS - 1) * CELL + BLOCK) / 2;
const OFF_Z = -((ROWS - 1) * CELL + BLOCK) / 2;

export const WORLD = {
  minX: OFF_X - ROAD - 2, maxX: OFF_X + (COLS - 1) * CELL + BLOCK + ROAD + 2,
  minZ: OFF_Z - ROAD - 2, maxZ: OFF_Z + (ROWS - 1) * CELL + BLOCK + ROAD + 2,
};

/** Centre of block (col, row) in world space. */
function blockCentre(c, r) {
  return { x: OFF_X + c * CELL + BLOCK / 2, z: OFF_Z + r * CELL + BLOCK / 2 };
}

/* Seeded PRNG so the city looks the same on every visit. */
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* --------------------------------------------------------------------------
   Venue table. `side` is which edge of the block the door faces:
   'S' = south (+z), 'N' = north (-z), 'E' = +x, 'W' = -x.
-------------------------------------------------------------------------- */
export const VENUES = [
  { id: 'police',     name: 'Police Station', emoji: '🚔', c: 0, r: 0, side: 'S', h: 11, colour: '#2f4f7a', accent: '#7fb3ff' },
  { id: 'courthouse', name: 'Courthouse',     emoji: '⚖️', c: 1, r: 0, side: 'S', h: 14, colour: '#d8d3c4', accent: '#b0a88f' },
  { id: 'jail',       name: 'State Prison',   emoji: '🏚️', c: 2, r: 0, side: 'S', h: 9,  colour: '#5c5f63', accent: '#3a3d40', yard: true },
  { id: 'hospital',   name: 'Hospital',       emoji: '🏥', c: 3, r: 0, side: 'S', h: 16, colour: '#eef2f5', accent: '#e2544c' },
  { id: 'university', name: 'University',     emoji: '🎓', c: 4, r: 0, side: 'S', h: 13, colour: '#7a3f3f', accent: '#e8c56a' },

  { id: 'school',     name: 'School',         emoji: '🎒', c: 0, r: 1, side: 'E', h: 10, colour: '#c96f4a', accent: '#f2e3c8' },
  { id: 'park',       name: 'City Park',      emoji: '🌳', c: 1, r: 1, side: 'S', open: 'park' },
  { id: 'store',      name: 'Corner Store',   emoji: '🛒', c: 2, r: 1, side: 'S', h: 7,  colour: '#3f7d54', accent: '#ffd76a' },
  { id: 'gym',        name: 'Gym',            emoji: '💪', c: 3, r: 1, side: 'W', h: 9,  colour: '#2b2f36', accent: '#ff7b3d' },
  { id: 'office',     name: 'Job Centre',     emoji: '🏢', c: 4, r: 1, side: 'W', h: 26, colour: '#4a5b6e', accent: '#9fd0ff' },

  { id: 'home',       name: 'Home',           emoji: '🏠', c: 0, r: 2, side: 'E', h: 8,  colour: '#b8875a', accent: '#6d4b2f' },
  { id: 'petstore',   name: 'Pet Store',      emoji: '🐶', c: 1, r: 2, side: 'S', h: 7,  colour: '#5a8fb8', accent: '#ffc76a' },
  { id: 'plaza',      name: 'Fountain Plaza', emoji: '⛲', c: 2, r: 2, side: 'S', open: 'plaza' },
  { id: 'bank',       name: 'Bank',           emoji: '🏦', c: 3, r: 2, side: 'W', h: 15, colour: '#dfd9c8', accent: '#3f7d54' },
  { id: 'jeweler',    name: 'Jeweller',       emoji: '💎', c: 4, r: 2, side: 'W', h: 8,  colour: '#2c2540', accent: '#8be0ff' },

  { id: 'chapel',     name: 'Chapel',         emoji: '💒', c: 0, r: 3, side: 'N', h: 12, colour: '#f0ebe0', accent: '#c9a86a' },
  { id: 'dealership', name: 'Car Dealership', emoji: '🚗', c: 1, r: 3, side: 'N', h: 8,  colour: '#e8eaec', accent: '#e2544c' },
  { id: 'bar',        name: 'The Rusty Tap',  emoji: '🍺', c: 2, r: 3, side: 'N', h: 8,  colour: '#4a3428', accent: '#ffb03d' },
  { id: 'casino',     name: 'Lucky Sevens',   emoji: '🎰', c: 3, r: 3, side: 'N', h: 18, colour: '#3a1f3f', accent: '#ff4fa3' },
  { id: 'towers',     name: 'Downtown',       emoji: '🌆', c: 4, r: 3, side: 'N', open: 'towers' },
];

// Far enough from the building face to stand in, close enough to stay on the
// pavement rather than out in the road. Building faces sit at 0.31 * BLOCK.
const DOOR_OFFSET = BLOCK / 2 - 2.5;

function doorPoint(v) {
  const b = blockCentre(v.c, v.r);
  if (v.side === 'S') return { x: b.x, z: b.z + DOOR_OFFSET };
  if (v.side === 'N') return { x: b.x, z: b.z - DOOR_OFFSET };
  if (v.side === 'E') return { x: b.x + DOOR_OFFSET, z: b.z };
  return { x: b.x - DOOR_OFFSET, z: b.z };
}

/* ------------------------------ scenery bits ------------------------------ */
const C = {
  asphalt: rgb('#33373d'),
  line:    rgb('#c8b45a'),
  walk:    rgb('#8e939a'),
  kerb:    rgb('#6f747b'),
  grass:   rgb('#4b7d43'),
  trunk:   rgb('#5b4230'),
  leaf1:   rgb('#3f7a3a'),
  leaf2:   rgb('#4d9147'),
  glass:   rgb('#bfe4ff'),
  window:  rgb('#ffdf9b'),
  water:   rgb('#4aa3d0'),
  stone:   rgb('#b9b4a8'),
};

function tree(L, x, z, rnd) {
  const h = 2.2 + rnd() * 1.6;
  L.box(x, 0.15, z, 0.55, h, 0.55, C.trunk);
  const leaf = rnd() < 0.5 ? C.leaf1 : C.leaf2;
  L.box(x, h, z, 3.4, 2.2, 3.4, leaf);
  L.box(x, h + 1.7, z, 2.4, 1.7, 2.4, leaf);
  L.shadow(x, z, 1.7);
}

function streetLight(L, x, z, rot) {
  L.box(x, 0.15, z, 0.3, 6, 0.3, C.kerb);
  L.box(x, 6, z, 2.4, 0.28, 0.28, C.kerb, rot);
  const dx = Math.cos(rot) * 1.0, dz = -Math.sin(rot) * 1.0;
  L.box(x + dx, 5.6, z + dz, 0.8, 0.35, 0.5, rgb('#fff0b8'), rot, 0.9);
}

function parkedCar(L, x, z, rot, rnd) {
  const paint = rgb(['#c0392b', '#2980b9', '#27ae60', '#e0e0e0', '#f39c12', '#34495e'][Math.floor(rnd() * 6)]);
  L.box(x, 0.35, z, 4.4, 1.0, 2.0, paint, rot);
  L.box(x, 1.35, z, 2.6, 0.85, 1.85, rgb('#2b3138'), rot);
  L.shadow(x, z, 1.4);
}

function bench(L, x, z, rot) {
  L.box(x, 0.4, z, 2.6, 0.2, 0.9, C.trunk, rot);
  L.box(x, 0.15, z, 0.25, 0.3, 0.8, C.kerb, rot);
}

/* ---------------------------- building drawing ---------------------------- */
function drawTower(L, x, z, w, d, h, body, rnd) {
  L.box(x, 0.25, z, w, h, d, body);
  // window bands
  const rows = Math.floor(h / 3.2);
  for (let i = 1; i <= rows; i++) {
    const y = 0.25 + i * 3.0;
    if (y > h - 1) break;
    const lit = rnd() < 0.55 ? 0.75 : 0.05;
    L.box(x, y, z + d / 2, w * 0.82, 1.3, 0.12, C.glass, 0, lit);
    L.box(x, y, z - d / 2, w * 0.82, 1.3, 0.12, C.glass, 0, lit);
    L.box(x + w / 2, y, z, 0.12, 1.3, d * 0.82, C.glass, 0, lit);
    L.box(x - w / 2, y, z, 0.12, 1.3, d * 0.82, C.glass, 0, lit);
  }
  L.box(x, h + 0.25, z, w * 1.04, 0.5, d * 1.04, rgb('#2b3138'));
}

function drawVenue(L, v, rnd, colliders) {
  const b = blockCentre(v.c, v.r);
  const body = rgb(v.colour), accent = rgb(v.accent);
  const w = BLOCK * 0.62, d = BLOCK * 0.62, h = v.h;

  L.box(b.x, 0.25, b.z, w, h, d, body);
  colliders.push({ x0: b.x - w / 2, x1: b.x + w / 2, z0: b.z - d / 2, z1: b.z + d / 2 });

  // roof cap + accent band above the entrance
  L.box(b.x, h + 0.25, b.z, w * 1.06, 0.7, d * 1.06, accent);

  // door + awning on the chosen side
  const dir = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[v.side];
  const rot = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }[v.side];
  const ex = b.x + dir[0] * (w / 2), ez = b.z + dir[1] * (d / 2);
  L.box(ex + dir[0] * 0.06, 0.25, ez + dir[1] * 0.06, dir[0] ? 0.3 : 4.0, 4.2, dir[0] ? 4.0 : 0.3, rgb('#2a2620'));
  L.box(ex + dir[0] * 0.9, 4.6, ez + dir[1] * 0.9, dir[0] ? 2.0 : 6.4, 0.35, dir[0] ? 6.4 : 2.0, accent);
  // glowing sign panel
  L.box(ex + dir[0] * 0.2, 5.4, ez + dir[1] * 0.2, dir[0] ? 0.3 : 7.0, 1.6, dir[0] ? 7.0 : 0.3, accent, 0, 0.55);

  // windows across the facade
  const rows = Math.max(1, Math.floor((h - 5) / 3.0));
  for (let i = 0; i < rows; i++) {
    const y = 6.4 + i * 3.0;
    if (y > h - 1) break;
    for (const s of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const lit = rnd() < 0.5 ? 0.7 : 0.06;
      L.box(b.x + s[0] * (w / 2), y, b.z + s[1] * (d / 2),
            s[0] ? 0.14 : w * 0.78, 1.4, s[1] ? 0.14 : d * 0.78, C.glass, 0, lit);
    }
  }
  void rot;
}

function drawJailYard(L, v, colliders) {
  const b = blockCentre(v.c, v.r);
  const half = BLOCK / 2 - 1;
  // yard floor
  L.box(b.x, 0.16, b.z, BLOCK - 2, 0.06, BLOCK - 2, rgb('#6b6f74'));
  // cell block at the back
  L.box(b.x, 0.22, b.z - 8, 22, v.h, 12, rgb(v.colour));
  colliders.push({ x0: b.x - 11, x1: b.x + 11, z0: b.z - 14, z1: b.z - 2 });
  for (let i = -4; i <= 4; i++) {
    L.box(b.x + i * 2.2, 3.0, b.z - 2, 0.25, 2.6, 0.25, rgb('#20242a'));
  }
  // perimeter wall with a gap for the gate on the south side
  const WALL_H = 6.5;
  const seg = (x, z, sx, sz) => {
    L.box(x, 0.2, z, sx, WALL_H, sz, rgb(v.accent));
    colliders.push({ x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2 });
  };
  seg(b.x, b.z - half, BLOCK, 1.2);
  seg(b.x - half, b.z, 1.2, BLOCK);
  seg(b.x + half, b.z, 1.2, BLOCK);
  const gateHalf = 3.5;
  const sideLen = (BLOCK / 2) - gateHalf;
  seg(b.x - gateHalf - sideLen / 2, b.z + half, sideLen, 1.2);
  seg(b.x + gateHalf + sideLen / 2, b.z + half, sideLen, 1.2);
  // the gate itself — barred, and very much shut
  for (let i = -3; i <= 3; i++) L.box(b.x + i * 1.1, 0.2, b.z + half, 0.22, WALL_H - 0.6, 0.3, rgb('#20242a'));
  L.box(b.x, WALL_H - 0.6, b.z + half, gateHalf * 2 + 0.6, 0.5, 0.5, rgb(v.accent));
  colliders.push({ x0: b.x - gateHalf, x1: b.x + gateHalf, z0: b.z + half - 0.6, z1: b.z + half + 0.6 });
  // barbed top + watchtowers
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    L.box(b.x + sx * half, 0.2, b.z + sz * half, 2.4, WALL_H + 3, 2.4, rgb('#4a4d51'));
    L.box(b.x + sx * half, WALL_H + 3.2, b.z + sz * half, 3.2, 0.4, 3.2, rgb('#2b2f34'));
  }
  return { gate: { x: b.x, z: b.z + half }, inside: { x: b.x, z: b.z + 6 } };
}

function drawPark(L, v, rnd, colliders) {
  const b = blockCentre(v.c, v.r);
  L.box(b.x, 0.16, b.z, BLOCK - 2, 0.08, BLOCK - 2, C.grass);
  // pond
  L.box(b.x - 7, 0.2, b.z - 6, 12, 0.1, 9, C.water, 0, 0.12);
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2, rr = 8 + rnd() * 7;
    const tx = b.x + Math.cos(a) * rr, tz = b.z + Math.sin(a) * rr;
    if (tx > b.x - 14 && tx < b.x - 1 && tz > b.z - 11 && tz < b.z - 1) continue; // keep the pond clear
    tree(L, tx, tz, rnd);
    colliders.push({ x0: tx - 0.6, x1: tx + 0.6, z0: tz - 0.6, z1: tz + 0.6 });
  }
  bench(L, b.x + 5, b.z + 7, 0);
  bench(L, b.x - 5, b.z + 7, 0);
  // jungle gym
  L.box(b.x + 8, 0.2, b.z + 2, 0.4, 3.2, 0.4, rgb('#e2544c'));
  L.box(b.x + 12, 0.2, b.z + 2, 0.4, 3.2, 0.4, rgb('#e2544c'));
  L.box(b.x + 10, 3.2, b.z + 2, 4.6, 0.4, 0.4, rgb('#f2c14e'));
}

function drawPlaza(L, v, rnd, colliders) {
  const b = blockCentre(v.c, v.r);
  L.box(b.x, 0.16, b.z, BLOCK - 2, 0.08, BLOCK - 2, C.stone);
  // fountain
  L.box(b.x, 0.2, b.z, 10, 1.0, 10, rgb('#9c968a'));
  L.box(b.x, 1.1, b.z, 8.6, 0.3, 8.6, C.water, 0, 0.15);
  L.box(b.x, 1.2, b.z, 1.6, 4.5, 1.6, C.stone);
  L.box(b.x, 5.6, b.z, 3.2, 0.5, 3.2, C.water, 0, 0.2);
  colliders.push({ x0: b.x - 5, x1: b.x + 5, z0: b.z - 5, z1: b.z + 5 });
  for (const [dx, dz] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    tree(L, b.x + dx, b.z + dz, rnd);
  }
  bench(L, b.x, b.z + 12, 0);
  bench(L, b.x, b.z - 12, 0);
}

function drawTowers(L, v, rnd, colliders) {
  const b = blockCentre(v.c, v.r);
  const spots = [[-8, -8, 14, 12], [9, -7, 12, 14], [-7, 9, 13, 12], [9, 9, 12, 13]];
  for (const [dx, dz, w, d] of spots) {
    const h = 16 + rnd() * 22;
    const shade = ['#4a5568', '#5a6472', '#3f4a58', '#65707e'][Math.floor(rnd() * 4)];
    drawTower(L, b.x + dx, b.z + dz, w * 0.8, d * 0.8, h, rgb(shade), rnd);
    colliders.push({ x0: b.x + dx - w * 0.4, x1: b.x + dx + w * 0.4,
                     z0: b.z + dz - d * 0.4, z1: b.z + dz + d * 0.4 });
  }
}

/* ================================ build =================================== */
export function buildCity() {
  const L = new InstanceList(6000);
  const rnd = makeRandom(0x5EED1);
  const colliders = [];
  const locations = [];
  let jailInfo = null;

  // ground / roads
  const gw = WORLD.maxX - WORLD.minX, gd = WORLD.maxZ - WORLD.minZ;
  const gx = (WORLD.minX + WORLD.maxX) / 2, gz = (WORLD.minZ + WORLD.maxZ) / 2;
  L.box(gx, -0.4, gz, gw + 60, 0.4, gd + 60, C.asphalt);

  // pavement pads per block, with kerbs
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const b = blockCentre(c, r);
      L.box(b.x, 0, b.z, BLOCK + 1.4, 0.16, BLOCK + 1.4, C.kerb);
      L.box(b.x, 0.08, b.z, BLOCK, 0.14, BLOCK, C.walk);
    }
  }

  // dashed centre lines down every road
  for (let c = 0; c <= COLS; c++) {
    const x = OFF_X + c * CELL - ROAD / 2;
    for (let z = WORLD.minZ; z < WORLD.maxZ; z += 6) L.box(x, 0.02, z, 0.35, 0.03, 3, C.line, 0, 0, 1);
  }
  for (let r = 0; r <= ROWS; r++) {
    const z = OFF_Z + r * CELL - ROAD / 2;
    for (let x = WORLD.minX; x < WORLD.maxX; x += 6) L.box(x, 0.02, z, 3, 0.03, 0.35, C.line, 0, 0, 1);
  }

  // venues
  for (const v of VENUES) {
    if (v.open === 'park') drawPark(L, v, rnd, colliders);
    else if (v.open === 'plaza') drawPlaza(L, v, rnd, colliders);
    else if (v.open === 'towers') drawTowers(L, v, rnd, colliders);
    else if (v.yard) jailInfo = drawJailYard(L, v, colliders);
    else drawVenue(L, v, rnd, colliders);

    const dp = doorPoint(v);
    const centre = blockCentre(v.c, v.r);
    // The prison is only ever entered by being put there, so its interaction
    // point sits inside the yard rather than outside the wall.
    const inside = v.yard && jailInfo ? jailInfo.inside : null;
    locations.push({
      ...v,
      x: inside ? inside.x : dp.x,
      z: inside ? inside.z : dp.z,
      cx: centre.x, cz: centre.z,
      signY: v.open ? 7 : (v.h || 8) + 3,
      radius: inside ? 15 : v.open ? 12 : 5.5,
      enterable: !v.open,
    });
  }

  // street furniture along the block edges
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const b = blockCentre(c, r);
      const half = BLOCK / 2 + 0.2;
      streetLight(L, b.x - half + 1, b.z - half + 1, 0);
      streetLight(L, b.x + half - 1, b.z + half - 1, Math.PI);
      if (rnd() < 0.6) parkedCar(L, b.x - 4, b.z + half + 5, 0, rnd);
      if (rnd() < 0.5) parkedCar(L, b.x + 6, b.z - half - 5, Math.PI, rnd);
      if (rnd() < 0.5) parkedCar(L, b.x + half + 5, b.z + 3, Math.PI / 2, rnd);
    }
  }

  // hedge ring so the world has an edge you can see
  for (let x = WORLD.minX; x <= WORLD.maxX; x += 5) {
    L.box(x, 0, WORLD.minZ, 5, 2.2, 2, C.leaf1);
    L.box(x, 0, WORLD.maxZ, 5, 2.2, 2, C.leaf1);
  }
  for (let z = WORLD.minZ; z <= WORLD.maxZ; z += 5) {
    L.box(WORLD.minX, 0, z, 2, 2.2, 5, C.leaf1);
    L.box(WORLD.maxX, 0, z, 2, 2.2, 5, C.leaf1);
  }
  colliders.push({ x0: WORLD.minX - 4, x1: WORLD.maxX + 4, z0: WORLD.minZ - 4, z1: WORLD.minZ + 1 });
  colliders.push({ x0: WORLD.minX - 4, x1: WORLD.maxX + 4, z0: WORLD.maxZ - 1, z1: WORLD.maxZ + 4 });
  colliders.push({ x0: WORLD.minX - 4, x1: WORLD.minX + 1, z0: WORLD.minZ - 4, z1: WORLD.maxZ + 4 });
  colliders.push({ x0: WORLD.maxX - 1, x1: WORLD.maxX + 4, z0: WORLD.minZ - 4, z1: WORLD.maxZ + 4 });

  const home = locations.find(l => l.id === 'home');
  return {
    statics: L,
    locations,
    colliders,
    jail: jailInfo,
    spawn: { x: home.x + 2, z: home.z + 2 },
    roadPoints: roadPoints(),
  };
}

/** Points along road centre-lines — pedestrians and police wander between them. */
function roadPoints() {
  const pts = [];
  for (let c = 0; c <= COLS; c++) {
    const x = OFF_X + c * CELL - ROAD / 2;
    for (let r = 0; r <= ROWS; r++) pts.push({ x, z: OFF_Z + r * CELL - ROAD / 2 });
  }
  for (let c = 0; c <= COLS; c++) {
    const x = OFF_X + c * CELL - ROAD / 2;
    for (let z = WORLD.minZ + 10; z < WORLD.maxZ - 10; z += 16) pts.push({ x, z });
  }
  for (let r = 0; r <= ROWS; r++) {
    const z = OFF_Z + r * CELL - ROAD / 2;
    for (let x = WORLD.minX + 10; x < WORLD.maxX - 10; x += 16) pts.push({ x, z });
  }
  return pts;
}
