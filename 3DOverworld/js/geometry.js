/* ============================================================
   The things that grow out of the ground - trees, bushes, rocks,
   blades of grass - built once as prototypes, and the pool that
   stamps copies of them across the world.
   ============================================================ */

import * as THREE from "three";
import { fbm } from "./terrain.js";

const UPV = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintWhite(geo) {
  if (!geo.attributes.color) {
    const n = geo.attributes.position.count;
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return geo;
}

/* Merge a pile of transformed parts into one buffer - position, normal
   and uv only, which is all any of these ever carry. */
function mergeGeos(parts) {
  let vc = 0, ic = 0;
  for (const g of parts) {
    vc += g.attributes.position.count;
    ic += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = vc > 65000 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of parts) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array.subarray(0, p.count * 3), vo * 3);
    if (n) nor.set(n.array.subarray(0, n.count * 3), vo * 3);
    if (u) uv.set(u.array.subarray(0, u.count * 2), vo * 2);
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo;
    } else {
      for (let i = 0; i < p.count; i++) idx[io++] = i + vo;
    }
    vo += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/* a tapered limb from `at`, pointing `dir`, `len` long */
function limbGeo(at, dir, len, r0, r1, radial) {
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(UPV, dir);
  g.applyMatrix4(new THREE.Matrix4().compose(at, q, ONE));
  return g;
}

/* a flat card, turned to face `dir`, with its normals splayed outward so
   a canopy built from them shades like one soft mass */
function cardGeo(at, dir, size, roll, outward) {
  const g = new THREE.PlaneGeometry(size, size);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
  g.applyMatrix4(new THREE.Matrix4().compose(at, q, ONE));
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i += 3) {
    n[i] = outward.x; n[i + 1] = outward.y; n[i + 2] = outward.z;
  }
  return g;
}

/* ---- broadleaf ---- */

function broadleaf(seed, near) {
  const rnd = mulberry(seed);
  const wood = [], leaves = [];
  const radial = near ? 8 : 5;
  const trunkH = 3.1 + rnd() * 1.5;
  const trunkR = 0.20 + rnd() * 0.07;
  const centre = new THREE.Vector3(0, trunkH + 1.0, 0);

  /* trunk, in two leaning sections so it is never a perfect pole */
  const lean = new THREE.Vector3((rnd() - 0.5) * 0.12, 1, (rnd() - 0.5) * 0.12).normalize();
  wood.push(limbGeo(new THREE.Vector3(0, -0.35, 0), lean, trunkH * 0.6 + 0.35, trunkR * 1.25, trunkR * 0.92, radial));
  const mid = lean.clone().multiplyScalar(trunkH * 0.6);
  const lean2 = new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3).normalize();
  wood.push(limbGeo(mid, lean2, trunkH * 0.45, trunkR * 0.92, trunkR * 0.6, radial));
  const crown = mid.clone().addScaledVector(lean2, trunkH * 0.45);

  function bough(at, dir, len, r, depth) {
    wood.push(limbGeo(at, dir, len, r, r * 0.58, Math.max(4, radial - depth)));
    const tip = at.clone().addScaledVector(dir, len);
    if (depth <= 0 || !near) { leafy(tip, dir, near ? 1.5 : 2.5); return; }
    const n = 3;
    for (let i = 0; i < n; i++) {
      const axis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const d2 = dir.clone().applyAxisAngle(axis, 0.5 + rnd() * 0.55).normalize();
      d2.y = Math.max(d2.y, -0.15);
      bough(tip, d2.normalize(), len * (0.62 + rnd() * 0.14), r * 0.6, depth - 1);
    }
  }

  function leafy(at, dir, spread) {
    const n = near ? 7 : 6;
    for (let i = 0; i < n; i++) {
      const off = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)
        .multiplyScalar(spread * 0.9).addScaledVector(dir, spread * 0.25);
      const p = at.clone().add(off);
      const out = p.clone().sub(centre).normalize().lerp(UPV, 0.45).normalize();
      const face = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      leaves.push(cardGeo(p, face, (near ? 1.35 : 2.4) + rnd() * 0.75, rnd() * 6.28, out));
    }
  }

  const boughs = near ? 5 : 5;
  for (let i = 0; i < boughs; i++) {
    const a = (i / boughs) * 6.2832 + rnd();
    const dir = new THREE.Vector3(Math.cos(a) * 0.72, 0.68 + rnd() * 0.3, Math.sin(a) * 0.72).normalize();
    bough(crown.clone().addScaledVector(UPV, -rnd() * 0.5), dir, 1.25 + rnd() * 0.5, trunkR * 0.66, near ? 1 : 0);
  }
  leafy(crown.clone().addScaledVector(UPV, 0.7), UPV, near ? 1.9 : 3.0);

  return { wood: mergeGeos(wood), leaf: mergeGeos(leaves), height: trunkH + 2.4, radius: 0.42 };
}

/* ---- conifer ---- */

function conifer(seed, near) {
  const rnd = mulberry(seed);
  const wood = [], leaves = [];
  const radial = near ? 7 : 5;
  const h = 6.2 + rnd() * 3.0;
  /* the trunk stops under the top whorl: a conifer that pokes a bare
     spike out of its own crown reads as a telegraph pole at distance */
  wood.push(limbGeo(new THREE.Vector3(0, -0.4, 0), UPV, h - 0.8, 0.26, 0.085, radial));

  const whorls = near ? 9 : 6;
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = 0.75 + t * (h - 1.45);
    const reach = (1.75 - t * 1.25) * (0.85 + rnd() * 0.3);
    const arms = near ? 5 : 4;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * 6.2832 + w * 1.17 + rnd() * 0.3;
      const dir = new THREE.Vector3(Math.cos(a), -0.26 - rnd() * 0.16, Math.sin(a)).normalize();
      const at = new THREE.Vector3(0, y, 0);
      if (near) wood.push(limbGeo(at, dir, reach * 0.55, 0.045, 0.02, 4));
      const n = 2;
      for (let k = 0; k < n; k++) {
        const p = at.clone().addScaledVector(dir, reach * (0.35 + k * 0.42));
        const out = new THREE.Vector3(dir.x, 0.42, dir.z).normalize();
        const size = reach * (near ? 1.25 : 2.3);
        leaves.push(cardGeo(p, new THREE.Vector3(-dir.z, rnd() * 0.5, dir.x).normalize(),
          size, Math.PI * 0.5 + (rnd() - 0.5) * 0.5, out));
        if (near) {
          leaves.push(cardGeo(p, dir.clone(), size * 0.9, (rnd() - 0.5) * 0.8, out));
        }
      }
    }
  }
  /* a spire on top, so the trunk never pokes out as a bare spike */
  for (let s = 0; s < 3; s++) {
    const y = h - 1.25 + s * 0.5;
    const size = 2.0 - s * 0.45;
    leaves.push(cardGeo(new THREE.Vector3(0, y, 0), new THREE.Vector3(1, 0, 0), size, 0, UPV));
    leaves.push(cardGeo(new THREE.Vector3(0, y, 0), new THREE.Vector3(0, 0, 1), size, 0, UPV));
  }

  return { wood: mergeGeos(wood), leaf: mergeGeos(leaves), height: h, radius: 0.5 };
}

/* ---- bush ---- */

function bushGeo(seed) {
  const rnd = mulberry(seed);
  const cards = [];
  const centre = new THREE.Vector3(0, 0.42, 0);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.2832, r = 0.2 + rnd() * 0.42;
    const p = new THREE.Vector3(Math.cos(a) * r, 0.22 + rnd() * 0.55, Math.sin(a) * r);
    const out = p.clone().sub(centre).normalize().lerp(UPV, 0.6).normalize();
    cards.push(cardGeo(p, new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
      0.85 + rnd() * 0.5, rnd() * 6.28, out));
  }
  return mergeGeos(cards);
}

/* ---- stones ---- */

function stoneGeo(seed) {
  const rnd = mulberry(seed);
  const g = new THREE.SphereGeometry(1, 16, 11);
  const p = g.attributes.position;
  const o1 = rnd() * 40, o2 = rnd() * 40;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm(x * 1.5 + o1, z * 1.5 + o2, 3, 61) + fbm(y * 2.2 + o2, x * 2.2, 2, 97) * 0.5;
    const k = 0.72 + n * 0.5;
    p.setXYZ(i, x * k * (0.8 + rnd() * 0.05), y * k * 0.78, z * k * (0.8 + rnd() * 0.05));
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* ---- grass ---- */

/* One blade: a tapered strip that curls forward, dark at the root where
   no light reaches and pale at the tip. */
function bladeGeo() {
  const ys = [0, 0.36, 0.66, 0.88, 1.0];
  const ws = [0.019, 0.017, 0.013, 0.007];
  const bz = [0, 0.014, 0.048, 0.105, 0.165];
  const ao = [0.30, 0.52, 0.74, 0.92, 1.0];
  const pos = [], nor = [], col = [];
  for (let i = 0; i < 4; i++) {
    pos.push(-ws[i], ys[i], bz[i], ws[i], ys[i], bz[i]);
    nor.push(0, 1, 0, 0, 1, 0);
    col.push(ao[i], ao[i], ao[i], ao[i], ao[i], ao[i]);
  }
  pos.push(0, ys[4], bz[4]); nor.push(0, 1, 0); col.push(ao[4], ao[4], ao[4]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6, 6, 5, 7, 6, 7, 8]);
  return g;
}

/* Three crossed cards of grass - what the ground wears just beyond the
   reach of real blades. */
function tuftGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    g.rotateY(a);
    const n = g.attributes.normal.array;
    for (let k = 0; k < n.length; k += 3) { n[k] = 0; n[k + 1] = 1; n[k + 2] = 0; }
    parts.push(g);
  }
  return mergeGeos(parts);
}

function blossomGeo() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI * 0.38);
  g.translate(0, 0.42, 0);
  const n = g.attributes.normal.array;
  for (let k = 0; k < n.length; k += 3) { n[k] = 0; n[k + 1] = 1; n[k + 2] = 0; }
  return g;
}

/* ============================================================
   Instance pools - one draw call per kind of thing in the world.
   Chunks borrow slots and give them back when they unload.
   ============================================================ */

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/* Whether this build of three can be told which slice of an instance
   buffer actually changed. Without it every touch re-uploads megabytes. */
const RANGED = typeof THREE.BufferAttribute.prototype.addUpdateRange === "function";

class InstancePool {
  constructor(scene, geometry, material, capacity, opts) {
    const o = opts || {};
    this.mesh = new THREE.InstancedMesh(paintWhite(geometry), material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;        // instances are spread all around you
    this.mesh.castShadow = !!o.cast;
    this.mesh.receiveShadow = o.receive !== false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.array.fill(1);  // unused slots must not read as black
    /* A pool is sized for the worst forest the noise can produce, but it
       draws only as far as it has ever been filled. An InstancedMesh runs
       its vertex shader for every slot in `count`, empty or not - leave
       that at capacity and the GPU chews through thousands of invisible
       trees every frame. Slots are handed out lowest-first, so the live
       ones stay packed against the bottom and this stays tight. */
    this.mesh.count = 0;
    this.top = 0;
    this.cap = capacity;
    this.peak = 0;
    this.used = 0;
    this.lo = Infinity;
    this.hi = -1;
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    scene.add(this.mesh);
  }
  touch(i) {
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    if (i >= this.top) { this.top = i + 1; this.mesh.count = this.top; }
    this.dirty = true;
  }
  place(obj, color) {
    if (!this.free.length) return -1;
    const i = this.free.pop();
    obj.updateMatrix();
    this.mesh.setMatrixAt(i, obj.matrix);
    if (color) this.mesh.setColorAt(i, color);
    this.touch(i);
    if (++this.used > this.peak) this.peak = this.used;
    return i;
  }
  /* The same thing for the hundreds of thousands of blades and tufts that
     only ever stand upright: writing the matrix straight into the buffer
     skips a Euler, a quaternion, a compose and a copy, each. */
  placeUpright(x, y, z, yaw, sx, sy, sz, col) {
    if (!this.free.length) return -1;
    const i = this.free.pop();
    const m = this.mesh.instanceMatrix.array, o = i * 16;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    m[o] = c * sx;  m[o + 1] = 0;  m[o + 2] = -s * sx; m[o + 3] = 0;
    m[o + 4] = 0;   m[o + 5] = sy; m[o + 6] = 0;       m[o + 7] = 0;
    m[o + 8] = s * sz; m[o + 9] = 0; m[o + 10] = c * sz; m[o + 11] = 0;
    m[o + 12] = x;  m[o + 13] = y; m[o + 14] = z;     m[o + 15] = 1;
    const a = this.mesh.instanceColor.array, p = i * 3;
    a[p] = col.r; a[p + 1] = col.g; a[p + 2] = col.b;
    this.touch(i);
    if (++this.used > this.peak) this.peak = this.used;
    return i;
  }
  release(i) {
    this.mesh.setMatrixAt(i, HIDDEN);
    this.free.push(i);
    this.used--;
    this.touch(i);
  }
  flush() {
    if (!this.dirty) return;
    const im = this.mesh.instanceMatrix, ic = this.mesh.instanceColor;
    if (RANGED && this.hi >= this.lo) {
      const n = this.hi - this.lo + 1;
      im.clearUpdateRanges();
      im.addUpdateRange(this.lo * 16, n * 16);
      if (ic) { ic.clearUpdateRanges(); ic.addUpdateRange(this.lo * 3, n * 3); }
    }
    im.needsUpdate = true;
    if (ic) ic.needsUpdate = true;
    this.lo = Infinity; this.hi = -1;
    this.dirty = false;
  }
}
export {
  UPV, ONE, mulberry, paintWhite, mergeGeos, limbGeo, cardGeo, broadleaf, conifer, bushGeo, stoneGeo, bladeGeo, tuftGeo, blossomGeo, HIDDEN, RANGED, InstancePool,
};
