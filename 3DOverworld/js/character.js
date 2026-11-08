/* ============================================================
   The body you are inside of - the model half: the mesh builder,
   the skeleton, and the six skinned surfaces hung on it.

   Authored facing +Z, because that is the direction a person
   reads as forward. The yaw convention here puts forward at -Z,
   so the whole figure hangs under one group turned half a turn.
   ============================================================ */

import * as THREE from "three";
import { TEX, bodyMaterial } from "./materials.js";

const HEAD_LAYER = 1;
const T2 = Math.PI * 2;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/* ------------------------------------------------------------
   A radius profile, keyed on distance along the limb in metres.
   Each key is [ s, radius, widthScale, depthScale, boxiness ].
   Boxiness below 1 squares the cross-section off, which is how
   a boot sole gets to be flat.
   ------------------------------------------------------------ */
function ramp(keys) {
  return (s) => {
    const n = keys.length;
    if (s <= keys[0][0]) return keys[0];
    if (s >= keys[n - 1][0]) return keys[n - 1];
    for (let i = 1; i < n; i++) {
      if (s > keys[i][0]) continue;
      const a = keys[i - 1], b = keys[i];
      const t = (s - a[0]) / (b[0] - a[0]);
      const u = t * t * (3 - 2 * t);
      return [s,
        a[1] + (b[1] - a[1]) * u,
        a[2] + (b[2] - a[2]) * u,
        a[3] + (b[3] - a[3]) * u,
        a[4] + (b[4] - a[4]) * u];
    }
    return keys[n - 1];
  };
}

/* ------------------------------------------------------------
   The mesh builder.

   A limb is a chain of joints with a radius profile swept along
   it. Rings of vertices are laid down the chain, and because a
   ring knows which two joints it lies between, the skin weights
   come straight out of the geometry - no weights are painted,
   guessed, or searched for by distance. A ring sitting exactly
   on a joint is shared half and half between the bone above and
   the bone below it, which is what makes a clean bend.
   ------------------------------------------------------------ */

class Mold {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = [];
    this.si = []; this.sw = []; this.idx = [];
  }

  /* chain: [{ p:[x,y,z], b:boneIndex }] - the bone at joint i drives the
     stretch of skin from joint i to joint i+1. */
  tube(chain, prof, o) {
    o = o || {};
    const radial = o.radial || 14;
    const seg = o.seg || 0.042;
    const blend = o.blend === undefined ? 0.070 : o.blend;
    const uvu = o.uvu === undefined ? 1 : o.uvu;
    const uvv = o.uvv === undefined ? 5 : o.uvv;
    /* where in the texture this tube starts, so a part that is not worth
       its own map - an ear - can be sent to a plain corner of one */
    const uo = o.uo || 0, vo = o.vo || 0;
    const crease = o.crease === undefined ? 0.30 : o.crease;
    const shade = o.shade || null;
    const ref = o.axis || AXIS_X;

    const n = chain.length;
    const J = [], L = [];
    for (let i = 0; i < n; i++) J.push(new THREE.Vector3().fromArray(chain[i].p));
    let total = 0;
    for (let i = 0; i < n - 1; i++) { const d = J[i + 1].distanceTo(J[i]); L.push(d); total += d; }
    if (total < 1e-6) return this;

    /* ring positions along the arc. Each segment is divided whole, so a
       ring always lands exactly on every joint. */
    const S = [0];
    for (let i = 0; i < n - 1; i++) {
      const base = S[S.length - 1];
      const k = Math.max(2, Math.round(L[i] / seg));
      for (let j = 1; j <= k; j++) S.push(base + L[i] * j / k);
    }
    const rings = S.length;

    const P = [], T = [], N1 = [], N2 = [], W = [];
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();

    for (let k = 0; k < rings; k++) {
      /* which segment, and how far into it */
      let i = 0, acc = 0, s = S[k];
      while (i < n - 2 && acc + L[i] < s - 1e-9) { acc += L[i], i++; }
      const into = s - acc, t = L[i] > 1e-9 ? into / L[i] : 0;
      P.push(J[i].clone().lerp(J[i + 1], t));

      /* skin weights: the segment's own bone, blended with whichever
         neighbour joint is close enough to share the bend */
      const dPrev = into, dNext = L[i] - into;
      let b0 = chain[i].b, b1 = b0, w1 = 0;
      if (dNext < blend && i + 1 < n) {
        b1 = chain[i + 1].b; w1 = 0.5 * (1 - dNext / blend);
      } else if (dPrev < blend && i > 0) {
        b1 = chain[i - 1].b; w1 = 0.5 * (1 - dPrev / blend);
      }
      W.push([b0, b1, 1 - w1, w1]);
    }

    for (let k = 0; k < rings; k++) {
      const a = P[Math.max(0, k - 1)], b = P[Math.min(rings - 1, k + 1)];
      const tg = new THREE.Vector3().subVectors(b, a);
      if (tg.lengthSq() < 1e-12) tg.set(0, 1, 0);
      T.push(tg.normalize());
      /* a frame built from a fixed reference axis rather than carried
         along the tube: no accumulated twist, and the width and depth
         scales always mean the same thing */
      t1.copy(ref).addScaledVector(T[k], -ref.dot(T[k]));
      if (t1.lengthSq() < 1e-6) {
        t1.copy(AXIS_Y).addScaledVector(T[k], -AXIS_Y.dot(T[k]));
      }
      t1.normalize();
      t2.crossVectors(T[k], t1).normalize();
      N1.push(t1.clone()); N2.push(t2.clone());
    }

    const start = this.pos.length / 3;
    const cols = radial + 1;                   /* the seam column is doubled for uv */
    const v = new THREE.Vector3(), nv = new THREE.Vector3();

    for (let k = 0; k < rings; k++) {
      const s = S[k], pr = prof(s);
      const r = pr[1], sx = pr[2], sz = pr[3], e = pr[4];
      /* how fast the radius is changing, so the normal can lean with the taper */
      const sa = Math.max(0, s - 0.01), sb = Math.min(total, s + 0.01);
      const drds = sb > sa ? (prof(sb)[1] - prof(sa)[1]) / (sb - sa) : 0;
      const w = W[k], tt = total > 0 ? s / total : 0;

      for (let j = 0; j <= radial; j++) {
        const th = j / radial * T2;
        let c = Math.cos(th), si = Math.sin(th);
        let bc = c, bs = si;
        if (e !== 1) {
          bc = Math.sign(c) * Math.pow(Math.abs(c), e);
          bs = Math.sign(si) * Math.pow(Math.abs(si), e);
        }
        v.copy(P[k]).addScaledVector(N1[k], r * sx * bc).addScaledVector(N2[k], r * sz * bs);
        /* the outward normal of the cross-section, with the scales swapped,
           then leaned back along the tube by however fast it is tapering */
        const ec = Math.pow(Math.max(1e-4, Math.abs(c)), e - 1);
        const es = Math.pow(Math.max(1e-4, Math.abs(si)), e - 1);
        nv.copy(N1[k]).multiplyScalar(sz * es * c)
          .addScaledVector(N2[k], sx * ec * si).normalize()
          .addScaledVector(T[k], -drds).normalize();

        this.pos.push(v.x, v.y, v.z);
        this.nor.push(nv.x, nv.y, nv.z);
        this.uv.push(uo + j / radial * uvu, vo + s * uvv);
        /* darken where two bones share the skin: that is where a crease
           lives on a real person, and it reads as contact shadow */
        let g = 1 - w[3] * crease;
        if (shade) g *= shade(tt, th, s);
        this.col.push(g, g, g);
        this.si.push(w[0], w[1], 0, 0);
        this.sw.push(w[2], w[3], 0, 0);
      }
    }

    for (let k = 0; k < rings - 1; k++) {
      for (let j = 0; j < radial; j++) {
        const a = start + k * cols + j, b = a + 1, c = a + cols, d = c + 1;
        this.idx.push(a, b, c, b, d, c);
      }
    }

    /* close the ends */
    const cap = (k, outward) => {
      const w = W[k], mid = this.pos.length / 3;
      const nd = outward ? 1 : -1;
      this.pos.push(P[k].x, P[k].y, P[k].z);
      this.nor.push(T[k].x * nd, T[k].y * nd, T[k].z * nd);
      this.uv.push(uo + 0.5 * uvu, vo + S[k] * uvv);
      const g = 1 - w[3] * crease;
      this.col.push(g, g, g);
      this.si.push(w[0], w[1], 0, 0);
      this.sw.push(w[2], w[3], 0, 0);
      const row = start + k * cols;
      for (let j = 0; j < radial; j++) {
        if (outward) this.idx.push(mid, row + j, row + j + 1);
        else this.idx.push(mid, row + j + 1, row + j);
      }
    };
    if (o.capA !== false) cap(0, false);
    if (o.capB !== false) cap(rings - 1, true);
    return this;
  }

  /* ------------------------------------------------------------
     A sculpted patch: a grid, not a tube.

     `fn(u, v, out)` writes a point in bind space and may be as
     pushed about as it likes; the normal comes from differences
     of that same field rather than being worked out by hand,
     which is one fewer place for the sculpt to be contradicted.
     `weights(u, v)` hands back [boneA, boneB, wA, wB] so a jaw
     or an eyelid can take its share of the surface.
     ------------------------------------------------------------ */
  surf(nu, nv, fn, o) {
    o = o || {};
    const bone = o.bone || 0;
    const wfn = o.weights || null;
    const uvf = o.uv || null;
    const shade = o.shade || null;
    const e = o.diff === undefined ? 0.0035 : o.diff;
    const start = this.pos.length / 3;
    const cols = nu + 1;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const du = new THREE.Vector3(), dv = new THREE.Vector3(), nn = new THREE.Vector3();

    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        /* Differences first and the real point last, so that anything
           the field stashed about this vertex - how deep it was dented,
           say - belongs to the vertex and not to a probe near it. */
        fn(u + e, v, b); fn(u - e, v, c); du.subVectors(b, c);
        fn(u, Math.min(1, v + e), b); fn(u, Math.max(0, v - e), c); dv.subVectors(b, c);
        fn(u, v, a);
        /* dv runs down the head and du runs round it, so this way round
           is the outward one - checked, not assumed */
        nn.crossVectors(dv, du);
        if (nn.lengthSq() < 1e-16) {
          /* a pole, where the ring has no width: face along the axis */
          nn.set(0, v < 0.5 ? 1 : -1, 0);
        }
        nn.normalize();

        this.pos.push(a.x, a.y, a.z);
        this.nor.push(nn.x, nn.y, nn.z);
        const t = uvf ? uvf(u, v) : [u, v];
        this.uv.push(t[0], t[1]);
        const g = shade ? shade(u, v, a) : 1;
        this.col.push(g, g, g);
        const w = wfn ? wfn(u, v, a) : null;
        if (w) { this.si.push(w[0], w[1], 0, 0); this.sw.push(w[2], w[3], 0, 0); }
        else { this.si.push(bone, bone, 0, 0); this.sw.push(1, 0, 0, 0); }
      }
    }

    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const p = start + j * cols + i, q = p + 1, r = p + cols, s = r + 1;
        /* this way round, not the other: cross( dv, du ) is the outward
           normal here, so the first corner has to walk v before u */
        this.idx.push(p, r, q, q, r, s);
      }
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/* ============================================================
   The skeleton. Positions here are absolute, in the bind pose,
   which is also the space the geometry is authored in - so the
   numbers below and the numbers in buildBody read alike.
   1.76 m tall, eye at 1.62.
   ============================================================ */

const BONE = [];                 /* [ name, parentIndex, x, y, z ] */
const B = {};                    /* name -> index */
const FINGERS = { "-1": [], "1": [] };

function joint(name, parent, x, y, z) {
  B[name] = BONE.length;
  BONE.push([name, parent, x, y, z]);
  return B[name];
}

(function buildSkeleton() {
  joint("hips", -1, 0, 0.960, 0.000);
  joint("spine", B.hips, 0, 1.088, 0.010);
  joint("chest", B.spine, 0, 1.238, 0.004);
  joint("neck", B.chest, 0, 1.452, -0.010);
  joint("head", B.neck, 0, 1.546, 0.004);

  /* The jaw hinges where a real one does, just in front of the ear, and
     the lower face takes a share of it - see jawWeight in head.js. The
     lids turn about the centre of their own eyeball, so closing one is a
     rotation and nothing else. */
  joint("jaw", B.head, 0, 1.5950, -0.0300);
  joint("lidL", B.head, -0.0315, 1.6375, 0.0690);
  joint("lidR", B.head, 0.0315, 1.6375, 0.0690);

  /* four fingers: [ name, z across the palm, knuckle y, proximal, distal ] */
  const DIG = [
    ["i", 0.034, 0.786, 0.043, 0.047],
    ["m", 0.011, 0.784, 0.047, 0.050],
    ["r", -0.012, 0.780, 0.043, 0.045],
    ["l", -0.034, 0.774, 0.034, 0.036],
  ];

  for (const s of [-1, 1]) {
    const L = s < 0 ? "L" : "R";
    joint("clav" + L, B.chest, s * 0.042, 1.428, 0.012);
    joint("upArm" + L, B["clav" + L], s * 0.178, 1.404, 0.004);
    joint("loArm" + L, B["upArm" + L], s * 0.178, 1.121, 0.016);
    joint("hand" + L, B["loArm" + L], s * 0.178, 0.876, 0.022);

    FINGERS[s] = [];
    for (const [d, z, ky, pl, dl] of DIG) {
      const a = joint("f" + d + L, B["hand" + L], s * 0.178, ky, z);
      const b = joint("f" + d + L + "b", a, s * 0.178, ky - pl, z);
      FINGERS[s].push([a, b, pl, dl, z, ky]);
    }
    /* the thumb comes off the front of the palm, because in a hanging arm
       the palm faces the thigh and the thumb points the way you are going */
    const ta = joint("th" + L, B["hand" + L], s * 0.172, 0.846, 0.040);
    const tb = joint("th" + L + "b", ta, s * 0.160, 0.810, 0.070);
    FINGERS[s].push([ta, tb, 0.050, 0.040, 0.040, 0.846]);

    joint("thigh" + L, B.hips, s * 0.094, 0.928, 0.004);
    joint("shin" + L, B["thigh" + L], s * 0.098, 0.492, -0.004);
    joint("foot" + L, B["shin" + L], s * 0.098, 0.074, 0.012);
    joint("toe" + L, B["foot" + L], s * 0.098, 0.030, 0.150);
  }
})();

/* How high the ankle rides above the sole. A foot target is a point on the
   ground, and this is what turns it into a point for the ankle. */
const ANKLE = BONE[B.footL][3];

/* Nobody stands with their knees locked, and this figure's leg reaches the
   ground exactly straight - so without a little slack in the hips, every
   stride has to push them down to get the foot anywhere but directly
   underneath. Fifty millimetres buys a soft knee and takes the whole
   standing hip-drop out. */
const SLACK = 0.050;

/* The feet cover the same ground on every step whatever the speed, so a
   stride can never ask the leg to reach further than it has. Going faster
   shortens the time on the ground rather than lengthening the step - which
   is also what a person actually does when they speed up. */
const STANCE = 0.74, AHEAD = 0.37;

/* ============================================================
   The body. Six surfaces, one skeleton.
   ============================================================ */

function buildBody() {
  const skin = new Mold(), shirt = new Mold(), denim = new Mold();
  const hide = new Mold();

  /* ---- torso ---- */
  shirt.tube([
    { p: [0, 0.898, 0.002], b: B.hips },
    { p: [0, 0.960, 0.000], b: B.hips },
    { p: [0, 1.088, 0.010], b: B.spine },
    { p: [0, 1.238, 0.004], b: B.chest },
    { p: [0, 1.452, -0.010], b: B.neck },
  ], ramp([
    [0.000, 0.157, 1.00, 0.76, 1],
    [0.062, 0.162, 1.00, 0.75, 1],
    [0.192, 0.145, 1.00, 0.71, 1],
    /* The chest has to stay broad right up to the shoulder line: it is what
       the top of each sleeve is buried in, and anywhere it narrows early
       the open end of the sleeve comes out through it as a hole. */
    [0.340, 0.178, 1.06, 0.73, 1],
    [0.470, 0.176, 1.09, 0.72, 1],
    [0.516, 0.170, 1.10, 0.74, 1],
    [0.554, 0.112, 1.10, 0.88, 1],
  ]), { radial: 22, seg: 0.038, blend: 0.090, uvu: 6.4, uvv: 6, crease: 0.20 });

  /* ---- neck ---- */
  skin.tube([
    { p: [0, 1.396, -0.004], b: B.chest },
    { p: [0, 1.452, -0.010], b: B.neck },
    { p: [0, 1.524, 0.000], b: B.head },
  ], ramp([
    [0.000, 0.064, 1.00, 0.94, 1],
    [0.056, 0.057, 1.00, 0.95, 1],
    [0.128, 0.055, 1.00, 0.96, 1],
  ]), { radial: 16, seg: 0.028, blend: 0.045, uvu: 2.5, uvv: 7, capB: false });

  for (const s of [-1, 1]) {
    const L = s < 0 ? "L" : "R";
    const sh = [s * 0.120, 1.428, 0.008], up = [s * 0.178, 1.404, 0.004];
    const el = [s * 0.178, 1.121, 0.016], cf = [s * 0.178, 1.045, 0.020];

    /* ---- sleeve: shoulder to just below the elbow ---- */
    shirt.tube([
      { p: sh, b: B["clav" + L] },
      { p: up, b: B["upArm" + L] },
      { p: el, b: B["loArm" + L] },
      { p: cf, b: B["loArm" + L] },
    ], ramp([
      /* Small and tucked inside the chest, because this end is open - it is
         the deltoid one ring down that does the shouldering. */
      [0.000, 0.036, 1.00, 1.00, 1],
      [0.063, 0.068, 1.00, 1.00, 1],
      [0.115, 0.061, 1.00, 1.00, 1],
      [0.230, 0.053, 1.00, 1.00, 1],
      [0.346, 0.047, 1.00, 1.00, 1],
      [0.388, 0.051, 1.00, 1.00, 1],
      [0.423, 0.049, 1.00, 1.00, 1],
    ]), { radial: 16, seg: 0.030, blend: 0.072, uvu: 2.4, uvv: 7, capA: false });

    /* ---- forearm and palm ---- */
    skin.tube([
      { p: [s * 0.178, 1.085, 0.018], b: B["loArm" + L] },
      { p: [s * 0.178, 0.876, 0.022], b: B["hand" + L] },
      { p: [s * 0.178, 0.788, 0.026], b: B["hand" + L] },
    ], ramp([
      [0.000, 0.0425, 1.00, 1.00, 1],
      [0.045, 0.0452, 1.00, 1.00, 1],
      [0.150, 0.0372, 0.94, 1.02, 1],
      [0.209, 0.0310, 0.80, 1.08, 1],
      [0.245, 0.0395, 0.70, 1.14, 0.80],
      [0.297, 0.0400, 0.66, 1.12, 0.78],
    ]), { radial: 14, seg: 0.024, blend: 0.050, uvu: 2.4, uvv: 9, capA: false });

    /* ---- fingers ---- */
    for (let f = 0; f < FINGERS[s].length; f++) {
      const [a, b, pl, dl, z, ky] = FINGERS[s][f];
      const thumb = f === 4;
      const base = thumb ? [s * 0.172, 0.846, 0.040] : [s * 0.178, ky, z];
      const mid = thumb ? [s * 0.160, 0.810, 0.070] : [s * 0.178, ky - pl, z];
      const tip = thumb
        ? [s * 0.150, 0.782, 0.096]
        : [s * 0.178, ky - pl - dl, z + 0.004];
      const rr = thumb ? 0.0128 : 0.0098 - f * 0.0005;
      skin.tube([
        { p: base, b: a }, { p: mid, b: b }, { p: tip, b: b },
      ], ramp([
        [0.000, rr, 0.94, 1.00, 1],
        [pl, rr * 0.90, 0.94, 1.00, 1],
        [pl + dl * 0.72, rr * 0.86, 0.94, 1.00, 1],
        [pl + dl, rr * 0.52, 0.94, 1.00, 1],
      ]), { radial: 9, seg: 0.013, blend: 0.016, uvv: 16, crease: 0.22 });
    }

    /* ---- trousers ---- */
    denim.tube([
      { p: [s * 0.092, 0.995, 0.004], b: B.hips },
      { p: [s * 0.094, 0.928, 0.004], b: B["thigh" + L] },
      { p: [s * 0.098, 0.492, -0.004], b: B["shin" + L] },
      { p: [s * 0.098, 0.078, 0.012], b: B["foot" + L] },
    ], ramp([
      [0.000, 0.108, 1.00, 0.96, 1],
      [0.067, 0.104, 1.00, 0.97, 1],
      [0.180, 0.092, 1.00, 0.98, 1],
      [0.400, 0.074, 1.00, 1.00, 1],
      [0.503, 0.067, 1.00, 1.04, 1],
      [0.600, 0.071, 1.00, 1.02, 1],
      [0.760, 0.055, 1.00, 1.00, 1],
      [0.917, 0.045, 1.00, 1.00, 1],
    ]), { radial: 18, seg: 0.036, blend: 0.080, uvu: 2.8, uvv: 6, capB: false });

    /* ---- boot: a shaft that follows the shin, and a foot that does not ---- */
    hide.tube([
      { p: [s * 0.098, 0.238, 0.002], b: B["shin" + L] },
      { p: [s * 0.098, 0.062, 0.010], b: B["shin" + L] },
    ], ramp([
      [0.000, 0.058, 1.00, 1.04, 1],
      [0.176, 0.055, 1.00, 1.06, 1],
    ]), { radial: 16, seg: 0.034, uvu: 2.5, uvv: 7, capA: false, capB: false });

    hide.tube([
      { p: [s * 0.098, 0.070, -0.060], b: B["foot" + L] },
      { p: [s * 0.098, 0.054, 0.060], b: B["foot" + L] },
      { p: [s * 0.098, 0.046, 0.150], b: B["toe" + L] },
      { p: [s * 0.098, 0.042, 0.206], b: B["toe" + L] },
    ], ramp([
      [0.000, 0.050, 0.90, 0.80, 0.70],
      [0.060, 0.057, 0.96, 0.74, 0.62],
      [0.120, 0.056, 0.94, 0.70, 0.60],
      [0.210, 0.050, 0.88, 0.64, 0.60],
      [0.266, 0.032, 0.78, 0.56, 0.66],
    ]), { radial: 16, seg: 0.030, blend: 0.050, uvu: 2.0, uvv: 6 });

    /* ---- a strap over each shoulder ---- */
    hide.tube([
      { p: [s * 0.082, 1.330, -0.150], b: B.chest },
      { p: [s * 0.112, 1.404, -0.020], b: B.chest },
      { p: [s * 0.102, 1.180, 0.104], b: B.chest },
    ], ramp([
      [0.000, 0.024, 1.00, 0.40, 0.70],
      [0.300, 0.024, 1.00, 0.40, 0.70],
    ]), { radial: 8, seg: 0.040, uvv: 8, crease: 0 });
  }

  /* ---- belt ---- */
  hide.tube([
    { p: [0, 0.882, 0.000], b: B.hips },
    { p: [0, 0.926, 0.002], b: B.hips },
  ], ramp([
    [0.000, 0.166, 1.00, 0.78, 0.86],
    [0.044, 0.166, 1.00, 0.78, 0.86],
  ]), { radial: 20, seg: 0.022, uvu: 8.3, uvv: 8, crease: 0, capA: false, capB: false });

  /* ---- the pack, on the back where a pack goes ---- */
  hide.tube([
    { p: [0, 1.046, -0.196], b: B.chest },
    { p: [0, 1.336, -0.206], b: B.chest },
  ], ramp([
    [0.000, 0.132, 1.00, 0.52, 0.56],
    [0.060, 0.146, 1.00, 0.56, 0.56],
    [0.230, 0.144, 1.00, 0.56, 0.56],
    [0.290, 0.126, 1.00, 0.50, 0.56],
  ]), { radial: 16, seg: 0.034, uvu: 5.3, uvv: 6, crease: 0 });

  return {
    skin: { geo: skin.build(), mat: bodyMaterial(TEX.skin, "skin", { normal: 0.85, wrap: 0.42 }) },
    shirt: { geo: shirt.build(), mat: bodyMaterial(TEX.shirt, "shirt", { normal: 1.0 }) },
    denim: { geo: denim.build(), mat: bodyMaterial(TEX.denim, "denim", { normal: 1.0 }) },
    hide: { geo: hide.build(), mat: bodyMaterial(TEX.hide, "hide", { normal: 1.0 }) },
  };
}
export {
  HEAD_LAYER, T2, AXIS_X, AXIS_Y, AXIS_Z, ramp, Mold, BONE, B, FINGERS, ANKLE, SLACK, STANCE, AHEAD, buildBody,
};
