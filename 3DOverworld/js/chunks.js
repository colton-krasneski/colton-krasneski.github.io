/* ============================================================
   One chunk of ground: its heightfield, the four-way splat that
   decides turf from rock, and which props stand on it. Props come
   from the hash alone, so a chunk always comes back the same.
   ============================================================ */

import * as THREE from "three";
import { CHUNK, SEG, STEP, WATER, clamp, clamp01, dampAt, forestAt, groundTint, hash, heightAt, normalAt, smoothstep, splatAt } from "./terrain.js";

const N = SEG + 1;        // vertices across a chunk
const NB = SEG + 3;       // and with a one-vertex skirt, for seamless normals

const CHUNK_INDEX = (() => {
  const idx = new Uint16Array(SEG * SEG * 6);
  let t = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx[t++] = a; idx[t++] = c; idx[t++] = b;
    idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  return idx;
})();

/* Every prop on a chunk is decided by hash alone, so the same chunk always
   comes back exactly as it left - and so the ground can be shaded with the
   shadow of a tree that has not been placed yet. */
const propCache = new Map();

function chunkProps(cx, cz) {
  const key = cx + "," + cz;
  const got = propCache.get(key);
  if (got) return got;

  const ox = cx * CHUNK, oz = cz * CHUNK;
  const trees = [], rocks = [], bushes = [];
  const nv = new THREE.Vector3();

  for (let k = 0; k < 30; k++) {
    const s = k * 13;
    const wx = ox + hash(cx, cz, s + 1) * CHUNK, wz = oz + hash(cx, cz, s + 2) * CHUNK;
    const h = heightAt(wx, wz);
    if (h < WATER + 0.7) continue;
    if (normalAt(wx, wz, nv).y < 0.86) continue;
    if (Math.hypot(wx, wz) < 21) continue;                 // leave the spawn meadow open
    const dens = smoothstep(0.42, 0.74, forestAt(wx, wz));
    if (hash(cx, cz, s + 3) > dens * 0.92 + 0.03) continue;

    const r1 = hash(cx, cz, s + 4), r2 = hash(cx, cz, s + 5), r3 = hash(cx, cz, s + 6);
    const pine = hash(cx, cz, s + 8) < 0.20 + smoothstep(18, 34, h) * 0.6;
    /* broadleaves alternate between the two shapes so neither pool can
       ever be asked for every tree on the chunk */
    const kind = pine ? 2 : (k + cx * 7 + cz * 13) & 1;
    const sc = pine ? 0.72 + r1 * 0.5 : 0.78 + r1 * 0.55;
    trees.push({
      x: wx, z: wz, h: h - 0.16, kind, sc,
      yaw: r2 * 6.2832, tint: 0.80 + r3 * 0.42,
      r: (pine ? 0.42 : 0.46) * sc,
    });
  }

  for (let k = 0; k < 12; k++) {
    const s = 500 + k * 7;
    const wx = ox + hash(cx, cz, s + 1) * CHUNK, wz = oz + hash(cx, cz, s + 2) * CHUNK;
    const h = heightAt(wx, wz);
    if (h < WATER + 0.45) continue;
    if (normalAt(wx, wz, nv).y < 0.8) continue;
    if (Math.hypot(wx, wz) < 11) continue;                 // do not spawn inside a bush
    const dens = smoothstep(0.30, 0.68, forestAt(wx, wz)) * 0.72 + 0.14;
    if (hash(cx, cz, s + 3) > dens) continue;
    const r = hash(cx, cz, s + 4), r2 = hash(cx, cz, s + 5);
    bushes.push({ x: wx, z: wz, h, sc: 0.72 + r * 0.7, yaw: r2 * 6.2832, tint: 0.70 + r2 * 0.42 });
  }

  for (let k = 0; k < 8; k++) {
    const s = 900 + k * 7;
    const wx = ox + hash(cx, cz, s + 1) * CHUNK, wz = oz + hash(cx, cz, s + 2) * CHUNK;
    const h = heightAt(wx, wz);
    if (h < WATER - 1.2) continue;
    const flat = normalAt(wx, wz, nv).y;
    const dens = 0.08 + (1 - flat) * 2.0 + smoothstep(1.8, 0.0, h - WATER) * 0.5;
    if (hash(cx, cz, s + 3) > dens) continue;
    const r = hash(cx, cz, s + 4), r2 = hash(cx, cz, s + 5), r3 = hash(cx, cz, s + 6);
    rocks.push({
      x: wx, z: wz, h, kind: k % 3, tint: 0.80 + r3 * 0.4,
      sc: 0.28 + r * 1.0, sy: 0.55 + r2 * 0.5, yaw: r2 * 6.2832, tilt: (r3 - 0.5) * 0.5,
    });
  }

  const out = { trees, rocks, bushes };
  if (propCache.size > 900) propCache.clear();
  propCache.set(key, out);
  return out;
}

/* Build the ground mesh: heights, normals from a skirted grid so chunks
   meet without a seam, the four-way surface blend, and a baked pass of
   ambient shade under every tree and in every hollow. */
function buildChunk(cx, cz) {
  const ox = cx * CHUNK, oz = cz * CHUNK;

  const hb = new Float32Array(NB * NB);
  for (let j = 0; j < NB; j++) {
    const wz = oz + (j - 1) * STEP;
    for (let i = 0; i < NB; i++) hb[j * NB + i] = heightAt(ox + (i - 1) * STEP, wz);
  }

  const pos = new Float32Array(N * N * 3);
  const nor = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const spl = new Float32Array(N * N * 3);
  const uv = new Float32Array(N * N * 2);
  const heights = new Float32Array(N * N);
  const flats = new Float32Array(N * N);
  const shade = new Float32Array(N * N).fill(1);
  const sp = [0, 0, 0];

  /* shade under the trees, from this chunk and everything leaning in
     from the eight around it */
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const P = chunkProps(cx + dx, cz + dz);
      for (let t = 0; t < P.trees.length; t++) {
        const tr = P.trees[t];
        const rad = 2.6 + tr.sc * 2.2;
        const li = (tr.x - ox) / STEP, lj = (tr.z - oz) / STEP;
        const i0 = Math.max(0, Math.floor(li - rad)), i1 = Math.min(SEG, Math.ceil(li + rad));
        const j0 = Math.max(0, Math.floor(lj - rad)), j1 = Math.min(SEG, Math.ceil(lj + rad));
        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const d = Math.hypot(i - li, j - lj);
            if (d > rad) continue;
            const k = 1 - 0.46 * smoothstep(rad, rad * 0.18, d);
            const o = j * N + i;
            if (k < shade[o]) shade[o] = k;
          }
        }
      }
    }
  }

  let p = 0;
  const c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++, p++) {
      const lx = i * STEP, lz = j * STEP;
      const wx = ox + lx, wz = oz + lz;
      const b = (j + 1) * NB + (i + 1);
      const h = hb[b];
      const nx = hb[b - 1] - hb[b + 1], nz = hb[b - NB] - hb[b + NB];
      const inv = 1 / Math.hypot(nx, 2 * STEP, nz);
      const ny = 2 * STEP * inv;

      heights[p] = h; flats[p] = ny;
      pos[p * 3] = lx; pos[p * 3 + 1] = h; pos[p * 3 + 2] = lz;
      nor[p * 3] = nx * inv; nor[p * 3 + 1] = ny; nor[p * 3 + 2] = nz * inv;
      uv[p * 2] = lx / CHUNK; uv[p * 2 + 1] = lz / CHUNK;

      const damp = dampAt(wx, wz);
      splatAt(h, ny, damp, sp);
      spl[p * 3] = sp[0]; spl[p * 3 + 1] = sp[1]; spl[p * 3 + 2] = sp[2];

      groundTint(wx, wz, h, damp, c);
      /* a hollow holds its own shadow */
      const curve = h - (hb[b - 1] + hb[b + 1] + hb[b - NB] + hb[b + NB]) * 0.25;
      const ao = shade[p] * clamp(0.93 + curve * 0.75, 0.70, 1.06);
      col[p * 3] = c.r * ao; col[p * 3 + 1] = c.g * ao; col[p * 3 + 2] = c.b * ao;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSplat", new THREE.BufferAttribute(spl, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(CHUNK_INDEX, 1));
  g.computeBoundingSphere();
  return { geometry: g, heights, flats };
}

/* lushness samples across one chunk edge */
const LUSH = 6;

function sampleLush(g, lx, lz) {
  const n = LUSH + 1;
  const fx = clamp01(lx / CHUNK) * LUSH, fz = clamp01(lz / CHUNK) * LUSH;
  const i = Math.min(LUSH - 1, fx | 0), j = Math.min(LUSH - 1, fz | 0);
  const tx = fx - i, tz = fz - j;
  const a = g[j * n + i], b = g[j * n + i + 1];
  const c = g[(j + 1) * n + i], d = g[(j + 1) * n + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

/* bilinear lookup inside a built chunk - cheap enough for thousands of blades */
function sampleField(field, lx, lz) {
  const fx = clamp01(lx / CHUNK) * SEG, fz = clamp01(lz / CHUNK) * SEG;
  const i = Math.min(SEG - 1, Math.floor(fx)), j = Math.min(SEG - 1, Math.floor(fz));
  const tx = fx - i, tz = fz - j;
  const a = field[j * N + i], b = field[j * N + i + 1];
  const c = field[(j + 1) * N + i], d = field[(j + 1) * N + i + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}
export {
  CHUNK_INDEX, chunkProps, buildChunk, LUSH, sampleLush, sampleField,
};
