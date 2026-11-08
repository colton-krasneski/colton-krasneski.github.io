/* ============================================================
   The shape of the land: the noise it is made of, the height at
   any point, and what to call where you are standing.
   ============================================================ */

import * as THREE from "three";
const CHUNK = 32;            // world units across one chunk
const SEG = 32;              // grid cells per chunk edge - 1 unit per cell
const STEP = CHUNK / SEG;
const WATER = 0;             // lake / sea level
function ringCount(r) {
  let n = 0;
  const lim = (r + 0.5) * (r + 0.5);
  for (let z = -r - 1; z <= r + 1; z++) {
    for (let x = -r - 1; x <= r + 1; x++) if (x * x + z * z <= lim) n++;
  }
  return n;
}

/* ---------------- noise ---------------- */

function hash(ix, iz, k) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(k | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function lerp(a, b, t) { return a + (b - a) * t; }

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function vnoise(x, z, k) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0, k), b = hash(x0 + 1, z0, k);
  const c = hash(x0, z0 + 1, k), d = hash(x0 + 1, z0 + 1, k);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

function fbm(x, z, oct, k) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, z * f, k + i);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return s / norm;
}

/* The same noise with a wrapping lattice, for textures that have to tile. */
function pnoise(x, z, k, P) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const w = (i) => ((i % P) + P) % P;
  const xa = w(x0), xb = w(x0 + 1), za = w(z0), zb = w(z0 + 1);
  const a = hash(xa, za, k), b = hash(xb, za, k);
  const c = hash(xa, zb, k), d = hash(xb, zb, k);
  return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz;
}

function pfbm(x, z, oct, k, P) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * pnoise(x * f, z * f, k + i, P * f);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

/* ---------------- the land ---------------- */

/* Where the origin sits in the noise. Picked by searching for a spot with
   dry rolling grass all around it and a lake a short walk away. */
const OX = 18900, OZ = 20700;

function rawHeight(x, z) {
  const px = x + OX, pz = z + OZ;
  const land  = (fbm(px * 0.0032, pz * 0.0032, 5, 11) - 0.30) * 46;   // broad rolling country
  const pond  = smoothstep(0.62, 0.88, fbm(px * 0.0019 + 57.3, pz * 0.0019 - 23.7, 3, 73)) * 14;
  const hills = (fbm(px * 0.016, pz * 0.016, 3, 131) - 0.5) * 4.0;    // knolls
  return land - pond + hills;
}

/* tussocks - kept separate so the spawn plateau still has texture */
function detail(x, z) {
  return (fbm((x + OX) * 0.085, (z + OZ) * 0.085, 2, 211) - 0.5) * 0.75;
}

const SPAWN_H = rawHeight(0, 0);

function heightAt(x, z) {
  const m = smoothstep(16, 62, Math.hypot(x, z));    // a calm meadow at the origin
  return rawHeight(x, z) * m + SPAWN_H * (1 - m) + detail(x, z);
}

const _n = new THREE.Vector3();
function normalAt(x, z, out) {
  const e = 0.8;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return (out || _n).set(-hx, 2 * e, -hz).normalize();
}

function forestAt(x, z) { return fbm((x + OX) * 0.0045, (z + OZ) * 0.0045, 3, 909); }
function dampAt(x, z) { return fbm((x + OX) * 0.0055, (z + OZ) * 0.0055, 3, 401); }

function placeName(x, z, h) {
  if (h < WATER - 0.5) return "Underwater";
  if (h < WATER + 1.6) return "Lakeshore";
  if (Math.hypot(x, z) < 34) return "Spawn Meadow";
  const f = forestAt(x, z);
  if (f > 0.66) return "Deep Woodland";
  if (f > 0.50) return "Open Woodland";
  if (h > 24) return "Highlands";
  if (dampAt(x, z) > 0.62) return "Dry Grassland";
  if (h < 3) return "Lowland Hollow";
  return "Rolling Meadow";
}

/* ---------------- how the ground is surfaced ----------------

   Four materials - turf, bare soil, stone and sand - are blended per
   vertex from slope, height over the water and moisture. The weights
   ride along in an attribute; the shader does the mixing. The vertex
   colour on top is only a gentle tint, because the colour now comes
   from the textures. */

const _tint = new THREE.Color();

function splatAt(h, flat, damp, out) {
  const rock = smoothstep(0.93, 0.62, flat);
  const sand = smoothstep(1.7, 0.1, h - WATER) * (1 - rock * 0.6);
  const soil = smoothstep(0.58, 0.86, damp) * 0.72 * (1 - rock) * (1 - sand);
  out[0] = rock; out[1] = sand; out[2] = soil;
}

function groundTint(x, z, h, damp, out) {
  const lush = smoothstep(0.46, 0.16, damp);          // damp hollows go deep green
  const dry  = smoothstep(0.56, 0.88, damp);
  out.setRGB(1, 1, 1);
  out.r *= 1 - lush * 0.22 + dry * 0.16;
  out.g *= 1 - lush * 0.04 + dry * 0.07;
  out.b *= 1 - lush * 0.26 - dry * 0.18;
  const mottle = fbm(x * 0.021, z * 0.021, 3, 307);   // broad patchiness
  const s = 0.86 + mottle * 0.30;
  out.r *= s; out.g *= s; out.b *= s;
  const silt = smoothstep(-0.2, -2.2, h - WATER);     // lake bed darkens
  out.r *= 1 - silt * 0.42; out.g *= 1 - silt * 0.34; out.b *= 1 - silt * 0.30;
  return out;
}
export {
  CHUNK, SEG, STEP, WATER, ringCount, hash, clamp01, clamp, lerp, smoothstep, vnoise, fbm, pnoise, pfbm, OX, OZ, rawHeight, detail, SPAWN_H, heightAt, normalAt, forestAt, dampAt, placeName, splatAt, groundTint,
};
