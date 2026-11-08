/* ============================================================
   The head - the one part of a person anybody actually looks at.

   A swept tube cannot make a face, so this is built another way:
   a grid laid over a lathe, then pushed about by a list of
   anatomical features, each a smooth bell with compact support
   so the surface stays closed and the normals stay clean.

   The eyes are real geometry behind a real opening. Rather than
   cut a hole, the surface dives in behind the eyeball between
   the lids - which keeps one closed mesh, and gives a lid margin
   that hugs the ball the way a real one does. The upper lid band
   is weighted to a bone of its own, so a blink is a rotation.
   ============================================================ */

import * as THREE from "three";
import { AXIS_Y, B, Mold, ramp } from "./character.js";
import { FACE, hairEdge, skull, uAtX, vOf } from "./facemap.js";
import { TEX, bodyMaterial } from "./materials.js";

const T2 = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/* A bell with compact support: one at the centre, nought at the edge,
   flat at both ends, so nothing it touches ever gets a crease. */
function bell(dx, dy, rx, ry) {
  const t = (dx / rx) * (dx / rx) + (dy / ry) * (dy / ry);
  if (t >= 1) return 0;
  const k = 1 - t;
  return k * k;
}

/* A smooth maximum. The lid is the eyeball's own shell wherever that
   stands in front of the face, and the face everywhere else; taking the
   plain larger of the two would leave a hard crease ring round the eye. */
function smax(a, b, h) {
  const t = clamp01(0.5 + 0.5 * (a - b) / h);
  return mix(b, a, t) + h * t * (1 - t);
}

/* ------------------------------------------------------------
   The sculpt.

   Every feature is written against the bare skull point rather
   than against the running total, so the order they happen to
   be listed in cannot change the face.

   `_ao` collects how far the surface was pushed in and becomes
   the vertex shade: the sculpt already knows where its own
   hollows are, and painting them a second time is one more
   thing to get out of step.
   ------------------------------------------------------------ */

let _ao = 0, _lid = 0;
const E = FACE;

/* The nose, as a profile down the midline: how far it stands out of the
   face, and how wide it is, at each height below the brow. */
const NOSE = ramp([
  [0.0000, 0.0000, 0.0115, 0, 0],
  [0.0040, 0.0030, 0.0115, 0, 0],   /* glabella, between the brows */
  [0.0160, 0.0082, 0.0106, 0, 0],   /* the bridge, at its narrowest */
  [0.0340, 0.0135, 0.0115, 0, 0],
  [0.0480, 0.0180, 0.0146, 0, 0],
  [0.0610, 0.0242, 0.0184, 0, 0],   /* the tip, on E.noseTipY */
  [0.0670, 0.0216, 0.0192, 0, 0],
  [0.0710, 0.0130, 0.0175, 0, 0],   /* the base, where it meets the lip */
  [0.0760, 0.0000, 0.0150, 0, 0],
]);

function sculpt(u, v, out) {
  skull(u, v, out);
  const bx = out.x, by = out.y, bz = out.z;
  const ax = Math.abs(bx), sx = bx < 0 ? -1 : 1;
  let dx = 0, dy = 0, dz = 0;
  _ao = 0; _lid = 0;

  /* Nothing in front of a face belongs on the back of a head. One mask
     up here is safer than getting a depth radius right twenty times. */
  const fwd = sstep(0.005, 0.045, bz);
  const back = 1 - fwd;

  /* ---- the back of the skull: a flatter occiput, a nape under it ---- */
  dz -= bell(ax, by - 1.6900, 0.0900, 0.0620) * 0.0055 * back;
  dz += bell(ax, by - 1.6250, 0.0700, 0.0400) * 0.0030 * back;

  /* ---- brow ridge, and the dip between the brows ---- */
  const browY = E.browY + (sx < 0 ? 0.0007 : 0);   /* nobody is symmetric */
  dz += bell(ax - 0.0300, by - browY, 0.0330, 0.0120) * 0.0082 * fwd;
  dz += bell(ax, by - (browY - 0.0050), 0.0140, 0.0115) * 0.0030 * fwd;
  /* the temple, behind the end of the brow */
  const temple = bell(ax - 0.0700, by - (E.browY + 0.0150), 0.0220, 0.0260) * fwd;
  dx -= sx * temple * 0.0048;
  _ao += temple * 0.10;

  /* ---- the eye socket, dug out before the lids are put back ---- */
  const sock = bell(ax - E.eyeX, by - (E.eyeY + 0.0015), 0.0345, 0.0205) * fwd;
  dz -= sock * 0.0105;
  _ao += sock * 0.34;
  /* the inner corner, where the socket runs down beside the nose */
  const inner = bell(ax - 0.0145, by - (E.eyeY - 0.0035), 0.0115, 0.0130) * fwd;
  dz -= inner * 0.0055;
  _ao += inner * 0.30;

  /* ---- the cheekbone, and the hollow under it ---- */
  const zyg = bell(ax - 0.0545, by - (E.eyeY - 0.0295), 0.0290, 0.0200) * fwd;
  dz += zyg * 0.0062; dx += sx * zyg * 0.0028;
  const holl = bell(ax - 0.0490, by - (E.eyeY - 0.0550), 0.0250, 0.0190) * fwd;
  dz -= holl * 0.0042;
  _ao += holl * 0.14;
  /* the pad of the cheek, inboard of that and lower */
  dz += bell(ax - 0.0330, by - (E.noseBaseY + 0.0010), 0.0260, 0.0220) * 0.0030 * fwd;

  /* ---- the nose ---- */
  const nz = NOSE((E.browY + 0.0040) - by);
  dz += nz[1] * bell(ax, 0, nz[2] * 1.75, 1) * fwd;
  /* the wings, and the nostril under each of them */
  const ala = bell(ax - 0.0158, by - (E.noseBaseY + 0.0035), 0.0105, 0.0088) * fwd;
  dz += ala * 0.0075; dx += sx * ala * 0.0042;
  const nos = bell(ax - 0.0098, by - (E.noseBaseY - 0.0027), 0.0070, 0.0050) * fwd;
  dz -= nos * 0.0062; dy -= nos * 0.0018;
  _ao += nos * 0.52 + ala * 0.06;
  /* the fold from the wing down past the corner of the mouth */
  const nasL = bell(ax - 0.0255, by - (E.noseBaseY - 0.0080), 0.0105, 0.0160) * fwd;
  dz -= nasL * 0.0040;
  _ao += nasL * 0.26;

  /* ---- the mouth ---- */
  const phil = bell(ax, by - (E.noseBaseY - 0.0110), 0.0070, 0.0075) * fwd;
  dz -= phil * 0.0028;
  _ao += phil * 0.22;
  /* the upper lip is the thinner of the two and sits further back */
  dz += bell(ax, by - (E.mouthY + 0.0058), 0.0255, 0.0072) * 0.0068 * fwd;
  dz += bell(ax, by - (E.mouthY - 0.0073), 0.0225, 0.0082) * 0.0076 * fwd;
  /* the line between them, and the corners at either end */
  const line = bell(ax, by - E.mouthY, 0.0270, 0.0026) * fwd;
  dz -= line * 0.0042;
  _ao += line * 0.62;
  const corner = bell(ax - 0.0245, by - E.mouthY, 0.0075, 0.0070) * fwd;
  dz -= corner * 0.0040;
  _ao += corner * 0.44;
  /* the crease above the chin */
  const ment = bell(ax, by - (E.mouthY - 0.0230), 0.0245, 0.0075) * fwd;
  dz -= ment * 0.0046;
  _ao += ment * 0.22;

  /* ---- chin and jaw ---- */
  dz += bell(ax, by - E.chinY, 0.0215, 0.0115) * 0.0074 * fwd;
  const gon = bell(ax - 0.0560, by - (E.jawY + 0.0120), 0.0220, 0.0210);
  dx += sx * gon * 0.0052; dz -= gon * 0.0010;
  /* Under the jaw, pulled in: without it the jaw line is a soft edge and
     the whole head reads as a potato. */
  const under = bell(ax - 0.0280, by - 1.5230, 0.0430, 0.0160);
  dz -= under * 0.0058; dy += under * 0.0040;
  _ao += under * 0.38;

  /* A narrow chin on a wide jaw is beyond any lathe, so the front of the
     lower rings is pinched in towards the midline by hand. */
  if (by < E.mouthY - 0.0030) {
    const k = sstep(E.mouthY - 0.0030, E.chinY - 0.0035, by);
    const f2 = clamp01((bz - 0.0100) / 0.0620);
    dx -= bx * 0.46 * k * f2 * f2;
  }

  /* ---- the eye: the lids, and the opening between them ----
     The lid is the eyeball's own shell wherever that would stand in
     front of the face; inside the opening the surface dives in behind
     the ball, so what shows through the almond is the eye itself. */
  const ex = ax - E.eyeX, ey = by - E.eyeY;
  if (bell(ex, ey, 0.0380, 0.0280) > 0) {
    const d2 = ex * ex + ey * ey;
    const r2 = (E.eyeR + 0.0016) * (E.eyeR + 0.0016);
    const shell = E.eyeZ + 0.0016 + (d2 < r2 ? Math.sqrt(r2 - d2) : 0);
    let z = smax(bz + dz, shell, 0.0042);

    /* The opening sits a shade below the ball's centre and is wider than
       it is tall - and never wider than the ball itself, or the lid
       margin would have nothing to hug. */
    const qx = ex / E.apW, qy = (ey + 0.0008) / E.apH;
    const q = Math.sqrt(qx * qx + qy * qy);
    const open = 1 - sstep(0.80, 1.00, q);
    if (open > 0) {
      const ball = d2 < E.eyeR * E.eyeR ? Math.sqrt(E.eyeR * E.eyeR - d2) : 0;
      z = mix(z, E.eyeZ + ball * 0.5 - 0.0078, open);
      _ao += open * 0.55;
    }
    /* the lid margin: a dark rim, which is how lashes read at any
       distance where you could not actually make out a lash */
    _ao += bell(q - 1.0, 0, 0.26, 1) * 0.45;
    /* and the fold above the upper lid */
    _ao += bell(ex, ey - 0.0140, 0.0210, 0.0068) * 0.30;

    dz = z - bz;
    /* How much of this vertex the lid bone owns: all of it at the margin
       of the upper lid, none by the time the fold is reached, and none
       at all below the eye - a blink is the top lid coming down. */
    _lid = clamp01(1 - sstep(0.0020, 0.0135, ey)) * sstep(-0.0010, 0.0035, ey)
      * clamp01(1.35 - q * 0.35);
    if (q < 0.90) _lid = 0;          /* the floor behind the ball stays put */
  }

  out.set(bx + dx, by + dy, bz + dz);
  return out;
}

/* How much of the lower face the jaw carries: front and low, so the chin
   and the lower lip swing with it while the hinge in front of the ear
   and the back of the jaw stay with the skull. */
function jawShare(p) {
  return clamp01((E.mouthY - 0.0030 - p.y) / 0.0330) * clamp01((p.z + 0.0180) / 0.0400)
    * clamp01(1 - (Math.abs(p.x) - 0.0500) / 0.0220);
}

/* ============================================================
   The pieces
   ============================================================ */

/* a deterministic sprinkle, so that the same head comes back every time */
let _seed = 20261108;
const rnd = () => {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
};

/* ears and brows are tubes, so they have no business in the layout of
   the face texture: both are sent to a plain part of it instead. */
/* The back of the skull at brow height: plain skin, because every
   feature in the face texture is masked off behind the ears and the
   scalp darkening starts well above this. Sending them to the bottom
   corner instead gave both ears a five o'clock shadow. */
const EAR_UV = { uo: 0.012, vo: 0.400, uvu: 0.090, uvv: 0.60, crease: 0 };

function buildHead() {
  const face = new Mold(), hair = new Mold(), eye = new Mold(), brow = new Mold();
  const ghost = new Mold();

  /* ---- the face ----
     128 columns with half of them in the front quarter, 112 rows with
     half between brow and chin: see facemap.js for why neither is
     spread evenly. */
  face.surf(128, 112, sculpt, {
    bone: B.head,
    shade: () => 1 - Math.min(0.62, _ao),
    weights: (u, v, p) => {
      if (_lid > 0.001) {
        const lb = p.x < 0 ? B.lidL : B.lidR;
        return [lb, B.head, _lid, 1 - _lid];
      }
      const j = jawShare(p);
      return j > 0.001 ? [B.jaw, B.head, j, 1 - j] : [B.head, B.head, 1, 0];
    },
  });

  /* The same shape at a fortieth of the cost, for the shadow. A shadow
     needs an outline and nothing else, and this one is drawn every
     frame from the sun's side as well as from the eye's. */
  ghost.surf(26, 30, (u, v, out) => skull(u, v, out, 0.009), { bone: B.head });

  /* ---- the eyeballs ----
     A polar grid about the forward axis, so the middle of the texture is
     the pupil and nothing has to be laid out by hand.  */
  for (const s of [-1, 1]) {
    const cx = s * E.eyeX, cy = E.eyeY, cz = E.eyeZ;
    eye.surf(26, 20, (u, v, out) => {
      const a = v * Math.PI, th = u * T2;
      const sa = Math.sin(a);
      /* the cornea stands a little proud of the white, which is what
         catches the light along the edge of an iris */
      const r = E.eyeR + 0.00035 * (1 - sstep(0.12, 0.20, v));
      out.set(cx + r * sa * Math.cos(th), cy + r * sa * Math.sin(th), cz + r * Math.cos(a));
    }, {
      bone: B.head,
      uv: (u, v) => [0.5 + 0.5 * v * Math.cos(u * T2), 0.5 + 0.5 * v * Math.sin(u * T2)],
    });
  }

  /* ---- eyebrows ----
     Hair, not skin: a flattened ribbon over the top of the socket,
     heavier at the inner end the way a real one is. */
  for (const s of [-1, 1]) {
    const pts = [];
    const q = new THREE.Vector3();
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x = s * (0.0085 + t * 0.0390);
      /* an arch: up over the middle of the eye, down at the outer end */
      const y = E.browY - 0.0055 + Math.sin(t * 2.3) * 0.0082 - t * t * 0.0105;
      sculpt(uAtX(x, y), vOf(y), q);
      pts.push({ p: [q.x, q.y, q.z + 0.0014], b: B.head });
    }
    brow.tube(pts, ramp([
      [0.0000, 0.0024, 1.00, 0.50, 0.70],
      [0.0090, 0.0034, 1.30, 0.44, 0.70],
      [0.0260, 0.0032, 1.35, 0.42, 0.70],
      [0.0380, 0.0022, 1.20, 0.42, 0.70],
      [0.0460, 0.0008, 1.00, 0.45, 0.70],
    ]), Object.assign({ radial: 7, seg: 0.0050, uvv: 14, axis: AXIS_Y }, EAR_UV));
  }

  /* ---- ears ----
     A flattened rim round an ellipse with a dish inside it. An ear is
     mostly silhouette, and that is what a rim gives you. */
  for (const s of [-1, 1]) {
    const cx = s * 0.0730, cy = E.earY, cz = E.earZ;
    const rim = [];
    for (let i = 0; i <= 9; i++) {
      const a = -1.15 + (i / 9) * 4.05;            /* front-top, round, to the lobe */
      rim.push({
        p: [cx + s * (0.0060 + 0.0045 * Math.sin(i / 9 * Math.PI)),
          cy + Math.cos(a) * 0.0268,
          cz - Math.sin(a) * 0.0172],
        b: B.head,
      });
    }
    face.tube(rim, ramp([
      [0.0000, 0.0026, 0.70, 1.00, 0.85],
      [0.0120, 0.0050, 0.85, 1.25, 0.85],
      [0.0520, 0.0054, 0.85, 1.25, 0.85],
      [0.0780, 0.0046, 0.80, 1.10, 0.85],
      [0.0900, 0.0030, 0.70, 1.00, 0.85],
    ]), Object.assign({ radial: 8, seg: 0.0075 }, EAR_UV));
    /* The dish inside the rim. It is swept up the ear, so its
       cross-section spans x and z: thin across the head, wide from front
       to back. Those two the wrong way round stood the ear 22 mm off. */
    face.tube([
      { p: [cx - s * 0.0016, cy + 0.0170, cz - 0.0020], b: B.head },
      { p: [cx + s * 0.0030, cy + 0.0020, cz + 0.0010], b: B.head },
      { p: [cx + s * 0.0026, cy - 0.0150, cz + 0.0030], b: B.head },
    ], ramp([
      [0.0000, 0.0060, 0.26, 1.00, 0.75],
      [0.0150, 0.0168, 0.22, 1.15, 0.75],
      [0.0320, 0.0098, 0.24, 0.95, 0.80],
    ]), Object.assign({ radial: 10, seg: 0.0070 }, EAR_UV));
  }

  /* ---- hair ----
     A cap so that nothing shows through, and clumps lying over the top
     of it. One shell on its own reads as a helmet however it is shaded;
     what makes hair look like hair is that its edge is broken up.

     Every clump runs from the part towards the back of the head and
     stops at the hairline. Sending them down the grid instead - which
     is what v does on its own - grew them straight down the forehead
     and drew a black curtain over the whole face. */
  hair.surf(52, 26, (u, v, out) => {
    skull(u, hairEdge(u) * v, out, 0.0042 + 0.0060 * Math.sin(v * Math.PI));
  }, { bone: B.head, shade: (u, v) => 0.44 + 0.34 * v });

  const PART = 0.560;
  const q = new THREE.Vector3();
  const clump = (pts, rad, wide) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i].p[0] - pts[i - 1].p[0],
        pts[i].p[1] - pts[i - 1].p[1], pts[i].p[2] - pts[i - 1].p[2]);
    }
    hair.tube(pts, ramp([
      [0.0000, rad * 0.86, wide, 0.52, 0.80],
      [len * 0.26, rad, wide * 1.08, 0.48, 0.80],
      [len * 0.74, rad * 0.80, wide, 0.52, 0.80],
      [len, rad * 0.14, wide * 0.7, 0.62, 0.80],
    ]), { radial: 6, seg: 0.013, uvu: 0.7, uvv: 11, crease: 0, capA: false });
  };

  for (let n = 0; n < 64; n++) {
    const side = n % 2 ? 1 : -1;
    /* where it leaves the part, and where on the scalp it ends up */
    const u0 = PART + side * (0.002 + rnd() * 0.055);
    const v0 = 0.025 + rnd() * 0.120;
    const u1 = clamp01(PART + side * (0.090 + rnd() * 0.400));
    const v1 = Math.min(0.995, hairEdge(u1) * (0.78 + rnd() * 0.24));
    const lift = 0.0045 + rnd() * 0.0215;
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      /* away from the part quickly, down the skull more gently; and
         standing further off it towards the tip, so the ends break the
         outline instead of lying flat on the cap */
      const uu = mix(u0, u1, Math.pow(t, 0.72));
      /* clamped against the hairline at every step, not just at the two
         ends: both ends can sit above it and the middle still dip onto
         the forehead, because the hairline is not a straight line */
      const vv = Math.min(mix(v0, v1, t * t * (3 - 2 * t)), hairEdge(uu) * 0.99);
      skull(uu, vv, q, 0.0080 + lift * Math.sin(t * 2.1));
      pts.push({ p: [q.x, q.y, q.z], b: B.head });
    }
    clump(pts, 0.0082, 2.05);
  }

  /* a fringe, falling across the forehead on the long side of the part */
  for (let n = 0; n < 9; n++) {
    const t0 = n / 8;
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const uu = PART - 0.018 - t0 * 0.115 - t * 0.055;
      pts.push({ p: [0, 0, 0], b: B.head });
      skull(uu, Math.min(hairEdge(uu) * 0.99, 0.055 + t * (0.090 + t0 * 0.045)), q,
        0.0090 + 0.0110 * Math.sin(t * 2.4));
      pts[i].p = [q.x, q.y - t * t * 0.006, q.z + t * 0.003];
    }
    clump(pts, 0.0078, 2.10);
  }

  /* sideburns, in front of each ear */
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      skull(0.5 + s * (0.300 - t * 0.014), vOf(E.hairline - 0.0330 - t * 0.0520), q, 0.0045);
      pts.push({ p: [q.x, q.y, q.z], b: B.head });
    }
    hair.tube(pts, ramp([
      [0.0000, 0.0105, 1.00, 0.42, 0.85],
      [0.0280, 0.0062, 0.90, 0.42, 0.85],
      [0.0540, 0.0018, 0.80, 0.45, 0.85],
    ]), { radial: 6, seg: 0.012, uvu: 0.7, uvv: 11, crease: 0, capA: false });
  }

  return {
    face: { geo: face.build(), mat: bodyMaterial(TEX.face, "face", { normal: 0.62, wrap: 0.46 }) },
    hair: { geo: hair.build(), mat: bodyMaterial(TEX.hair, "hair", { normal: 1.1, rough: 0.58 }) },
    brow: { geo: brow.build(), mat: bodyMaterial(TEX.hair, "brow", { normal: 1.0, rough: 0.62 }) },
    eye: { geo: eye.build(), mat: bodyMaterial(TEX.eye, "eye", { normal: 0.25, rough: 0.085 }) },
    ghostGeo: ghost.build(),
  };
}
export {
  FACE, sculpt, jawShare, buildHead,
};
