/* ============================================================
   The shape the head starts from, and where its vertices go.

   The head is a grid laid over a lathe, and neither parameter
   is uniform: a head is all detail in front and almost none
   behind, so the front quarter takes half the columns and the
   band from brow to chin takes half the rows. Spread them
   evenly instead and an eye gets four columns across it, which
   no amount of sculpting afterwards can rescue.

   All of this lives on its own because three places need it and
   they must not drift apart: the sculpt, to put a vertex on a
   lip; the texture, to paint one at the same lip; and the hair,
   to lie on the skull without sinking into it.
   ============================================================ */

/* u -> the angle round the head: 0 at the face, +-PI at the back of the
   skull, so u = 0.5 is the midline of the face. */
const UMAP = [
  [0.000, -3.1416],
  [0.080, -2.5000],
  [0.150, -1.9000],
  [0.215, -1.3800],
  [0.265, -0.9600],
  [0.305, -0.6900],
  [0.500, 0.0000],
  [0.695, 0.6900],
  [0.735, 0.9600],
  [0.785, 1.3800],
  [0.850, 1.9000],
  [0.920, 2.5000],
  [1.000, 3.1416],
];

/* v -> height in metres: the crown at v=0, the underside of the jaw at
   v=1, and the rows crowded into the brow, eyes, nose and lips. */
const VMAP = [
  [0.000, 1.7560],
  [0.070, 1.7340],
  [0.140, 1.7120],
  [0.210, 1.6900],
  [0.280, 1.6720],
  [0.345, 1.6600],
  [0.400, 1.6500],
  [0.450, 1.6430],
  [0.500, 1.6375],
  [0.550, 1.6310],
  [0.600, 1.6210],
  [0.650, 1.6060],
  [0.700, 1.5930],
  [0.745, 1.5800],
  [0.790, 1.5680],
  [0.830, 1.5580],
  [0.868, 1.5480],
  [0.902, 1.5380],
  [0.935, 1.5260],
  [0.962, 1.5120],
  [0.984, 1.4960],
  [1.000, 1.4780],
];

/* ------------------------------------------------------------
   The skull: a lathe, written as [ y, half-width, half-depth,
   z of the centre, boxiness ]. Boxiness under one squares the
   cross-section off, which is what gives the side of a skull
   its flatness.

   Everything below 1.524 is inside the neck and never seen; it
   is here so that the surface closes.
   ------------------------------------------------------------ */
const PROF = [
  [1.7560, 0.0080, 0.0095, -0.0080, 1.00],
  [1.7480, 0.0330, 0.0390, -0.0090, 0.96],
  [1.7340, 0.0510, 0.0600, -0.0090, 0.93],
  [1.7160, 0.0632, 0.0740, -0.0080, 0.91],
  [1.6960, 0.0706, 0.0836, -0.0060, 0.90],
  [1.6760, 0.0748, 0.0890, -0.0040, 0.89],
  [1.6560, 0.0762, 0.0918, -0.0020, 0.89],
  [1.6375, 0.0758, 0.0930, 0.0000, 0.90],
  [1.6180, 0.0730, 0.0936, 0.0010, 0.91],
  [1.5980, 0.0694, 0.0930, 0.0020, 0.93],
  [1.5800, 0.0652, 0.0912, 0.0030, 0.96],
  [1.5660, 0.0612, 0.0890, 0.0040, 0.99],
  [1.5520, 0.0612, 0.0860, 0.0060, 1.01],
  [1.5400, 0.0618, 0.0826, 0.0080, 1.03],
  /* The sides stay this wide down past the chin, because what is at the
     side of a face at chin height is the angle of the jaw and behind it
     the neck - the chin itself is narrow, and it is the pinch in
     sculpt() that makes it so. A lathe cannot do both at one height.

     It has to be WIDER than the neck, too. At 114 mm against a 120 mm
     neck there was nothing to overhang, no edge and no shadow under
     one, and the head ran into the shoulders like a thumb into a fist. */
  [1.5320, 0.0632, 0.0800, 0.0090, 1.04],
  [1.5240, 0.0628, 0.0742, 0.0080, 1.03],
  /* and then away sharply, which is the jaw line itself: a slow taper
     here reads as a chin that melts into a throat */
  [1.5150, 0.0556, 0.0612, 0.0035, 1.02],
  [1.5060, 0.0432, 0.0468, -0.0010, 1.00],
  [1.4960, 0.0282, 0.0312, -0.0055, 1.00],
  [1.4870, 0.0100, 0.0120, -0.0090, 1.00],
  [1.4800, 0.0020, 0.0025, -0.0095, 1.00],   /* closed, well inside the neck */
];

/* the landmarks the sculpt, the paint and the rig all have to agree on */
const FACE = {
  eyeX: 0.0315,              /* the pupil, out from the midline */
  eyeY: 1.6450,              /* and halfway up the head, as a pupil is */
  eyeZ: 0.0690,              /* the centre of the eyeball */
  eyeR: 0.0122,              /* 24 mm across, like a real one */
  apW: 0.0147,               /* 29 mm across, as an adult's is */
  apH: 0.0062,
  browY: 1.6660,
  noseTipY: 1.6090,
  noseBaseY: 1.6000,
  mouthY: 1.5790,            /* where the lips meet */
  chinY: 1.5335,
  jawY: 1.5320,
  earY: 1.6305,              /* top level with the brow, lobe with the nose */
  earZ: -0.0120,
  crownY: 1.7560,
  hairline: 1.7180,
};

/* piecewise-linear lookup, and its inverse: the tables are monotone in
   both columns, so one routine serves for either direction */
function pick(table, x, from, to) {
  const n = table.length;
  const up = table[n - 1][from] > table[0][from];
  if (up ? x <= table[0][from] : x >= table[0][from]) return table[0][to];
  if (up ? x >= table[n - 1][from] : x <= table[n - 1][from]) return table[n - 1][to];
  for (let i = 1; i < n; i++) {
    if (up ? x > table[i][from] : x < table[i][from]) continue;
    const a = table[i - 1], b = table[i];
    const t = (x - a[from]) / (b[from] - a[from]);
    return a[to] + (b[to] - a[to]) * t;
  }
  return table[n - 1][to];
}

const thetaOf = (u) => pick(UMAP, u, 0, 1);
const uOf = (theta) => pick(UMAP, theta, 1, 0);
const yOf = (v) => pick(VMAP, v, 0, 1);
const vOf = (y) => pick(VMAP, y, 1, 0);

/* A cubic Hermite through the keys, with the slope at each one taken as
   a difference in HEIGHT rather than in the parameter.

   This has had three goes at it. A smoothstep between two keys flattens
   the curve at every key it passes through. A Catmull-Rom looks right
   until the keys are unevenly spaced - which these are, from 8 mm apart
   to 20 - and then the slope still steps at each one. Either way the
   head came out banded like a contour map wherever the light grazed it,
   and no amount of shading hid it. */
function lathe(y) {
  const n = PROF.length;
  let i = 1;
  while (i < n - 1 && y <= PROF[i][0]) i++;
  const a = PROF[i - 1], b = PROF[i];
  const pa = PROF[i - 2] || a, pb = PROF[i + 1] || b;
  const h = a[0] - b[0];
  const t = Math.min(1, Math.max(0, (a[0] - y) / h));
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
  const h01 = 3 * t2 - 2 * t3, h11 = t3 - t2;
  const out = [];
  for (let k = 1; k <= 4; k++) {
    const ma = (b[k] - pa[k]) / (pa[0] - b[0]);
    const mb = (pb[k] - a[k]) / (a[0] - pb[0]);
    out.push(h00 * a[k] + h10 * h * ma + h01 * b[k] + h11 * h * mb);
  }
  return out;
}

/* ------------------------------------------------------------
   The hairline, in terms of the angle round the head rather
   than a curve fitted to it: high right across the forehead,
   turning down at the temple, past the ear and on to the nape.
   A cosine of the angle sounds like the same thing and is not -
   it starts dropping immediately, and put the hairline level
   with his eyebrows at the temples.
   ------------------------------------------------------------ */
const HAIRLINE = [
  [0.00, 1.7180],
  [0.50, 1.7145],
  [0.82, 1.7020],
  [1.06, 1.6860],
  [1.45, 1.6620],
  [2.00, 1.6280],
  [2.60, 1.6040],
  [3.15, 1.5970],
];

function hairEdge(u) {
  return vOf(pick(HAIRLINE, Math.abs(thetaOf(u)), 0, 1));
}

/* a superellipse, so a cross-section can be squarer than an ellipse */
const se = (c, e) => (e === 1 ? c : Math.sign(c) * Math.pow(Math.abs(c), e));

/* The point on the bare skull at (u, v), optionally pushed out along its
   own cross-section - which is how the hair gets to sit on top of it.
   `out` only has to have a set(x, y, z); nothing here needs three.js. */
function skull(u, v, out, inflate) {
  const th = thetaOf(u), y = yOf(v);
  const L = lathe(y);
  const f = inflate || 0;
  return out.set(
    (L[0] + f) * se(Math.sin(th), L[3]),
    y,
    L[2] + (L[1] + f) * se(Math.cos(th), L[3]));
}

/* how far out from the midline a column stands, at a given height */
function xAt(u, y) {
  const L = lathe(y);
  return L[0] * se(Math.sin(thetaOf(u)), L[3]);
}

/* Which column stands a given distance out from the midline. Everything
   else in this project is authored in metres, and a brow placed in grid
   coordinates is a brow that will be placed wrongly. */
function uAtX(x, y) {
  const L = lathe(y);
  const r = Math.min(1, Math.abs(x) / L[0]);
  const th = Math.asin(Math.pow(r, 1 / L[3]));
  const u = uOf(th);
  return x < 0 ? 1 - u : u;
}
export {
  UMAP, VMAP, PROF, FACE, thetaOf, uOf, yOf, vOf, lathe, hairEdge, skull, xAt, uAtX,
};
