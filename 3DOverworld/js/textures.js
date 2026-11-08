/* ============================================================
   Every surface in the game, drawn into a canvas at load time.
   Each ground texture is tileable: the noise lattice wraps, and
   anything drawn near an edge is drawn again on the far side.
   ============================================================ */

import { clamp01, pfbm, pnoise } from "./terrain.js";
import { FACE, lathe, thetaOf, yOf } from "./facemap.js";

function canvasOf(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

const WRAPS = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

/* run a drawing call once, plus again on any edge it hangs over */
function wrapped(size, x, y, r, fn) {
  for (let i = 0; i < 9; i++) {
    const dx = WRAPS[i][0] * size, dy = WRAPS[i][1] * size;
    if (x + dx < -r || x + dx > size + r || y + dy < -r || y + dy > size + r) continue;
    fn(x + dx, y + dy);
  }
}

/* paint a whole canvas from a per-pixel function returning [r,g,b] */
function fill(ctx, size, fn) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const c = [0, 0, 0];
  for (let y = 0, o = 0; y < size; y++) {
    for (let x = 0; x < size; x++, o += 4) {
      fn(x, y, c);
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function rgb(r, g, b) {
  return "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
}

/* ---- the four ground surfaces: colour canvas + height canvas ---- */

function texTurf(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const P = 8;

  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const m = pfbm(u, v, 4, 31, P);
    const patch = pfbm(u * 0.5, v * 0.5, 2, 77, P * 0.5);
    const dryness = clamp01(patch * 1.5 - 0.3);
    o[0] = 38 + m * 46 + dryness * 70;
    o[1] = 60 + m * 54 + dryness * 54;
    o[2] = 22 + m * 30 + dryness * 20;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const m = pfbm(u * 2, v * 2, 3, 131, P * 2);
    const g = 70 + m * 70;
    o[0] = o[1] = o[2] = g;
  });

  /* blades: thin strokes, a brighter tip, leaning every which way */
  const count = Math.round(S * S / 42);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const len = 5 + Math.random() * 13;
    const ang = (Math.random() - 0.5) * 2.4 - Math.PI / 2;
    const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
    const t = Math.random();
    const g = 72 + t * 96, r = 36 + t * 92, b = 24 + t * 34;
    const w = 0.7 + Math.random() * 1.3;
    const shade = 0.55 + Math.random() * 0.75;
    wrapped(S, x, y, len + 3, (px, py) => {
      ca.lineWidth = w; ca.lineCap = "round";
      ca.strokeStyle = rgb(r * shade, g * shade, b * shade);
      ca.beginPath(); ca.moveTo(px, py); ca.lineTo(px + dx, py + dy); ca.stroke();
      ch.lineWidth = w; ch.lineCap = "round";
      ch.strokeStyle = rgb(118 + t * 90, 118 + t * 90, 118 + t * 90);
      ch.beginPath(); ch.moveTo(px, py); ch.lineTo(px + dx, py + dy); ch.stroke();
    });
  }
  return { albedo: a, height: h, rough: 0.94 };
}

function texSoil(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const P = 8;
  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const m = pfbm(u, v, 4, 211, P);
    const fine = pfbm(u * 6, v * 6, 2, 311, P * 6);
    const k = m * 0.75 + fine * 0.25;
    o[0] = 54 + k * 76; o[1] = 40 + k * 56; o[2] = 28 + k * 36;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const g = 60 + pfbm(u * 3, v * 3, 4, 411, P * 3) * 120;
    o[0] = o[1] = o[2] = g;
  });
  /* grit */
  for (let i = 0; i < S * 2.2; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 0.8 + Math.random() * 2.6;
    const t = Math.random();
    wrapped(S, x, y, r + 2, (px, py) => {
      ca.fillStyle = rgb(78 + t * 70, 64 + t * 56, 50 + t * 40);
      ca.beginPath(); ca.ellipse(px, py, r, r * (0.6 + Math.random() * 0.5), Math.random() * 3, 0, 6.2832); ca.fill();
      ch.fillStyle = rgb(150 + t * 80, 150 + t * 80, 150 + t * 80);
      ch.beginPath(); ch.ellipse(px, py, r, r * 0.8, 0, 0, 6.2832); ch.fill();
    });
  }
  return { albedo: a, height: h, rough: 1.0 };
}

function texStone(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const P = 6;
  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const m = pfbm(u, v, 5, 509, P);
    const band = pfbm(u * 0.7 + m * 0.6, v * 2.4, 3, 607, P * 2);  // bedding planes
    const k = m * 0.6 + band * 0.4;
    const warm = pfbm(u * 0.5, v * 0.5, 2, 701, P * 0.5);
    o[0] = 72 + k * 104 + warm * 22;
    o[1] = 70 + k * 100 + warm * 14;
    o[2] = 64 + k * 92;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const g = 40 + pfbm(u * 1.4, v * 1.4, 5, 509, P * 1.4) * 170;
    o[0] = o[1] = o[2] = g;
  });
  /* fractures */
  for (let i = 0; i < S / 9; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const len = 12 + Math.random() * S * 0.4;
    const ang = Math.random() * 6.2832;
    wrapped(S, x, y, len + 4, (px, py) => {
      let cx = px, cy = py, an = ang;
      ca.strokeStyle = "rgba(24,22,20,0.55)"; ca.lineWidth = 0.8 + Math.random();
      ch.strokeStyle = "rgba(0,0,0,0.5)"; ch.lineWidth = ca.lineWidth * 1.6;
      ca.beginPath(); ca.moveTo(cx, cy); ch.beginPath(); ch.moveTo(cx, cy);
      for (let s = 0; s < 7; s++) {
        an += (Math.random() - 0.5) * 0.9;
        cx += Math.cos(an) * len / 7; cy += Math.sin(an) * len / 7;
        ca.lineTo(cx, cy); ch.lineTo(cx, cy);
      }
      ca.stroke(); ch.stroke();
    });
  }
  return { albedo: a, height: h, rough: 0.82 };
}

function texSand(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const P = 8;
  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const m = pfbm(u * 2, v * 2, 3, 811, P * 2);
    const ripple = Math.sin((v + pfbm(u, v, 2, 821, P) * 2.5) * 9.0) * 0.5 + 0.5;
    const k = m * 0.7 + ripple * 0.3;
    o[0] = 150 + k * 72; o[1] = 134 + k * 66; o[2] = 100 + k * 54;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const ripple = Math.sin((v + pfbm(u, v, 2, 821, P) * 2.5) * 9.0) * 0.5 + 0.5;
    const g = 70 + ripple * 60 + pfbm(u * 8, v * 8, 2, 833, P * 8) * 60;
    o[0] = o[1] = o[2] = g;
  });
  for (let i = 0; i < S * 1.2; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 0.6 + Math.random() * 1.5;
    wrapped(S, x, y, r + 1, (px, py) => {
      ca.fillStyle = Math.random() < 0.5 ? "rgba(90,80,62,0.5)" : "rgba(246,238,214,0.6)";
      ca.beginPath(); ca.arc(px, py, r, 0, 6.2832); ca.fill();
    });
  }
  return { albedo: a, height: h, rough: 1.0 };
}

function texBark(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const P = 8;
  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const streak = pfbm(u * 3.2, v * 0.35, 4, 907, P * 3) ;
    const grain = pfbm(u * 9, v * 1.4, 2, 911, P * 9);
    const k = streak * 0.72 + grain * 0.28;
    o[0] = 38 + k * 86; o[1] = 29 + k * 64; o[2] = 22 + k * 44;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const g = 40 + pfbm(u * 3.2, v * 0.4, 5, 907, P * 3) * 190;
    o[0] = o[1] = o[2] = g;
  });
  /* deep vertical fissures */
  for (let i = 0; i < S / 7; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const len = S * (0.2 + Math.random() * 0.6);
    wrapped(S, x, y, len, (px, py) => {
      let cx = px, cy = py;
      const w = 0.8 + Math.random() * 2.2;
      ca.strokeStyle = "rgba(18,13,9,0.6)"; ca.lineWidth = w;
      ch.strokeStyle = "rgba(0,0,0,0.65)"; ch.lineWidth = w * 1.3;
      ca.beginPath(); ca.moveTo(cx, cy); ch.beginPath(); ch.moveTo(cx, cy);
      for (let s = 0; s < 8; s++) {
        cx += (Math.random() - 0.5) * 5; cy += len / 8;
        ca.lineTo(cx, cy); ch.lineTo(cx, cy);
      }
      ca.stroke(); ch.stroke();
    });
  }
  return { albedo: a, height: h, rough: 0.95 };
}

/* ---- cut-outs: leaves, needles, grass tufts, blossom, motes ---- */

function leafShape(ctx, x, y, L, W, ang, fillStyle, veins) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(W, L * 0.3, W * 0.75, L * 0.82, 0, L);
  ctx.bezierCurveTo(-W * 0.75, L * 0.82, -W, L * 0.3, 0, 0);
  ctx.fill();
  if (veins) {
    ctx.strokeStyle = veins; ctx.lineWidth = Math.max(0.5, L * 0.025);
    ctx.beginPath(); ctx.moveTo(0, L * 0.04); ctx.lineTo(0, L * 0.96); ctx.stroke();
    ctx.lineWidth = Math.max(0.4, L * 0.016);
    for (let i = 1; i < 5; i++) {
      const t = i / 5, yy = L * t, w = W * (1 - Math.abs(t - 0.45) * 1.5) * 0.7;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy + L * 0.09); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(-w, yy + L * 0.09); ctx.stroke();
    }
  }
  ctx.restore();
}

/* A clump of leaves on a transparent card. Trees are built from these. */
function texLeafCard(S, hue) {
  const c = canvasOf(S);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  const n = 26;
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(Math.random()) * S * 0.42;
    const a = Math.random() * 6.2832;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.85;
    const L = S * (0.16 + Math.random() * 0.17);
    const t = Math.random();
    const dark = 1 - r / (S * 0.5) * 0.35;
    const col = rgb(
      (hue[0] + t * 46) * dark,
      (hue[1] + t * 54) * dark,
      (hue[2] + t * 26) * dark
    );
    leafShape(ctx, x, y, L, L * 0.33, Math.random() * 6.2832, col,
      "rgba(255,255,255,0.13)");
  }
  return c;
}

/* A conifer frond: a stem with needles down both sides. */
function texNeedle(S, hue) {
  const c = canvasOf(S);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  /* Dense enough to survive being mipmapped.

     Coverage is what matters, not shape: the filter averages it down
     with distance, and a frond that is only 8% opaque against a 0.22
     alphaTest simply switches off part-way out and leaves a bare spiky
     trunk standing over the canopy. Measured, not guessed - read the
     alpha canvas back and average it. */
  const stems = 7;
  for (let s = 0; s < stems; s++) {
    /* spread across the card, not off the side of it: the spacing has
       to follow the count */
    const x0 = S * (0.10 + 0.78 * s / (stems - 1)), y0 = S * 0.04;
    const len = S * (0.6 + Math.random() * 0.33);
    const lean = (Math.random() - 0.5) * 0.5;
    /* A soft body down the stem first. It is what the mip levels have
       to average, so the frond keeps its coverage as it recedes; the
       needles go on top, so close up it still reads as needles rather
       than as a green smear. */
    ctx.strokeStyle = "rgba(" + ((hue[0] * 0.78) | 0) + "," + ((hue[1] * 0.80) | 0)
      + "," + ((hue[2] * 0.78) | 0) + ",0.40)";
    ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const t0 = i / 9, t1 = (i + 1) / 9;
      ctx.lineWidth = S * 0.098 * (1 - t0 * 0.42);
      ctx.beginPath();
      ctx.moveTo(x0 + lean * len * t0, y0 + len * t0);
      ctx.lineTo(x0 + lean * len * t1, y0 + len * t1);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(58,44,30,0.90)"; ctx.lineWidth = Math.max(1, S / 120);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + lean * len, y0 + len); ctx.stroke();
    const needles = 58;
    for (let i = 0; i < needles; i++) {
      const t = i / needles;
      const px = x0 + lean * len * t, py = y0 + len * t;
      const nl = S * 0.125 * (1 - t * 0.40) * (0.7 + Math.random() * 0.6);
      const side = i % 2 ? 1 : -1;
      const ang = side * (0.75 + Math.random() * 0.4);
      const k = Math.random();
      ctx.strokeStyle = rgb(hue[0] + k * 36, hue[1] + k * 48, hue[2] + k * 30);
      ctx.lineWidth = Math.max(1, S / 135);
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(px + Math.sin(ang) * nl, py + Math.cos(ang) * nl * 0.75);
      ctx.stroke();
    }
  }
  return c;
}

/* A tuft of grass on a card - what the middle distance is carpeted with. */
function texTuft(S) {
  const c = canvasOf(S);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  const n = 46;
  for (let i = 0; i < n; i++) {
    const x0 = S * (0.1 + Math.random() * 0.8);
    const h = S * (0.42 + Math.random() * 0.52);
    const lean = (Math.random() - 0.5) * S * 0.42;
    const t = Math.random();
    ctx.strokeStyle = rgb(44 + t * 72, 72 + t * 96, 26 + t * 40);
    ctx.lineWidth = Math.max(1.1, S / 150) * (0.7 + Math.random() * 0.8);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, S);
    ctx.quadraticCurveTo(x0 + lean * 0.35, S - h * 0.55, x0 + lean, S - h);
    ctx.stroke();
  }
  return c;
}

function texBlossom(S) {
  const c = canvasOf(S);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * 6.2832;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, -S * 0.26, S * 0.14, S * 0.24, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.15);
  g.addColorStop(0, "#ffd34a"); g.addColorStop(1, "#e0a32a");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.14, 0, 6.2832); ctx.fill();
  return c;
}

function texMote(S) {
  const c = canvasOf(S);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,250,228,0.55)");
  g.addColorStop(1, "rgba(255,250,228,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return c;
}

/* Tiling grey noise - the clouds are built out of this in the sky shader. */
function texNoise(S) {
  const c = canvasOf(S);
  const ctx = c.getContext("2d");
  const P = 8;
  fill(ctx, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    o[0] = pfbm(u, v, 5, 1301, P) * 255;
    o[1] = pfbm(u, v, 3, 1409, P) * 255;
    o[2] = pnoise(u * 2, v * 2, 1511, P * 2) * 255;
  });
  return c;
}

/* ---- height canvas -> tangent-space normal map ---- */

function normalFrom(heightCanvas, strength) {
  const S = heightCanvas.width;
  const src = heightCanvas.getContext("2d").getImageData(0, 0, S, S).data;
  const out = canvasOf(S);
  const ctx = out.getContext("2d");
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const at = (x, y) => src[((((y % S) + S) % S) * S + (((x % S) + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y * S + x) * 4;
      d[o] = (nx / l * 0.5 + 0.5) * 255;
      d[o + 1] = (ny / l * 0.5 + 0.5) * 255;
      d[o + 2] = (nz / l * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/* The same pine, far enough off that the fronds have merged into one
   another. Coverage matters more than shape here: mipmapping averages
   it down, so a card whose mean alpha sits near its alphaTest switches
   off at distance and leaves a bare trunk standing in the field. */
function texNeedleMass(S, hue) {
  const c = canvasOf(S);
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, S, S);

  /* a soft body first, so the middle of the card is solidly covered */
  for (let i = 0; i < 110; i++) {
    const x = S * (0.5 + (Math.random() - 0.5) * 0.76);
    const y = S * (0.06 + Math.random() * 0.88);
    const r = S * (0.09 + Math.random() * 0.13) * (1 - Math.abs(y / S - 0.5) * 0.55);
    const k = Math.random();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(" + ((hue[0] + k * 30) | 0) + "," + ((hue[1] + k * 42) | 0)
      + "," + ((hue[2] + k * 26) | 0) + ",0.96)");
    g.addColorStop(0.65, "rgba(" + ((hue[0] * 0.8) | 0) + "," + ((hue[1] * 0.8) | 0)
      + "," + ((hue[2] * 0.8) | 0) + ",0.60)");
    g.addColorStop(1, "rgba(" + ((hue[0] * 0.6) | 0) + "," + ((hue[1] * 0.6) | 0)
      + "," + ((hue[2] * 0.6) | 0) + ",0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }

  /* and needles over the top of it, to break up the outline */
  for (let i = 0; i < 1100; i++) {
    const x = S * Math.random(), y = S * Math.random();
    const len = S * (0.03 + Math.random() * 0.065);
    const ang = (Math.random() - 0.5) * 2.0 + (x < S * 0.5 ? 2.5 : 0.65);
    const k = Math.random();
    ctx.strokeStyle = rgb(hue[0] + k * 40, hue[1] + k * 52, hue[2] + k * 32);
    ctx.lineWidth = Math.max(1, S / 190);
    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* Feather the border, or the card renders as the rectangle it is.
     A near frond is drawn as a frond and tapers off by itself; a mass
     of them has to be faded out by hand. */
  ctx.globalCompositeOperation = "destination-in";
  const fade = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.17, S * 0.5, S * 0.5, S * 0.54);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.72, "rgba(0,0,0,0.94)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = "source-over";
  return c;
}

/* ---- cut-out cards ----
   A card is drawn with transparency; this separates what colour it is
   from how much of it there is.

   Handing a transparent canvas straight to three.js looks right at full
   size and goes wrong at every mip level below it: the filter averages
   leaf colour with transparent *black*, so foliage goes sooty up close
   and vanishes at distance. Bleeding the colour outwards into the clear
   part first, and carrying coverage in a map of its own, means neither
   average has anything black to find. */
function splitCard(src) {
  const S = src.width;
  const d = src.getContext("2d").getImageData(0, 0, S, S).data;
  const color = canvasOf(S), alpha = canvasOf(S);
  const cc = color.getContext("2d"), ac = alpha.getContext("2d");
  const ci = cc.createImageData(S, S), ai = ac.createImageData(S, S);

  /* the average of everything solid, for any pixel the bleed never reaches */
  let ar = 0, ag = 0, ab = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    ar += d[i]; ag += d[i + 1]; ab += d[i + 2]; n++;
  }
  if (n) { ar /= n; ag /= n; ab /= n; } else { ar = ag = ab = 128; }

  const R = new Float32Array(S * S), G = new Float32Array(S * S), Bl = new Float32Array(S * S);
  const solid = new Uint8Array(S * S);
  for (let p = 0, i = 0; p < S * S; p++, i += 4) {
    ai.data[i] = ai.data[i + 1] = ai.data[i + 2] = d[i + 3];
    ai.data[i + 3] = 255;
    if (d[i + 3] >= 8) { R[p] = d[i]; G[p] = d[i + 1]; Bl[p] = d[i + 2]; solid[p] = 1; }
    else { R[p] = ar; G[p] = ag; Bl[p] = ab; }
  }

  /* Push the colour out a pixel at a time, so that the edge of a leaf
     fades into more leaf. Wrapped, because these cards tile - but with
     the wrap worked out once per row and column rather than per
     neighbour: this is seven cards times six passes times a quarter of
     a million pixels times nine, and a modulo in there is felt on the
     loading bar. */
  const lo = new Int32Array(S), hi = new Int32Array(S);
  for (let i = 0; i < S; i++) { lo[i] = i === 0 ? S - 1 : i - 1; hi[i] = i === S - 1 ? 0 : i + 1; }
  const next = new Uint8Array(solid);
  for (let pass = 0; pass < 6; pass++) {
    let grew = 0;
    for (let y = 0; y < S; y++) {
      const rows = [lo[y] * S, y * S, hi[y] * S];
      for (let x = 0; x < S; x++) {
        const p = y * S + x;
        if (solid[p]) continue;
        const cols = [lo[x], x, hi[x]];
        let r = 0, g = 0, bb = 0, k = 0;
        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 3; i++) {
            const q = rows[j] + cols[i];
            if (!solid[q]) continue;
            r += R[q]; g += G[q]; bb += Bl[q]; k++;
          }
        }
        if (!k) continue;
        R[p] = r / k; G[p] = g / k; Bl[p] = bb / k; next[p] = 1; grew++;
      }
    }
    if (!grew) break;
    solid.set(next);
  }

  for (let p = 0, i = 0; p < S * S; p++, i += 4) {
    ci.data[i] = R[p]; ci.data[i + 1] = G[p]; ci.data[i + 2] = Bl[p]; ci.data[i + 3] = 255;
  }
  cc.putImageData(ci, 0, 0);
  ac.putImageData(ai, 0, 0);
  return { color, alpha };
}

/* ============================================================
   The five small surfaces the figure is dressed in. They are
   only ever a metre or two from the camera, so they are drawn
   at a finer scale than the ground is.
   ============================================================ */

function texSkin(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const P = 6;
  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    /* Skin is not one colour. Blood sits nearer the surface in
       patches, and over that there is a fine grain of pores. */
    const blood = pfbm(u * 1.35, v * 1.35, 3, 1301, P * 1.35);
    const grain = pfbm(u * 19, v * 19, 2, 1307, P * 19);
    const pore = pnoise(u * 54, v * 54, 1311, P * 54);
    const t = grain * 0.62 + pore * 0.38;
    o[0] = 192 + blood * 30 + t * 16;
    o[1] = 143 + blood * 11 + t * 16;
    o[2] = 121 - blood * 9 + t * 15;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const g = 104 + pfbm(u * 26, v * 26, 3, 1311, P * 26) * 100
      + pnoise(u * 62, v * 62, 1317, P * 62) * 44;
    o[0] = o[1] = o[2] = g;
  });
  /* a few fine creases, the sort that cross the back of a hand */
  ch.lineCap = "round";
  for (let i = 0; i < S / 12; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const len = S * (0.04 + Math.random() * 0.14);
    const ang = Math.random() * 6.2832;
    wrapped(S, x, y, len, (px, py) => {
      ch.strokeStyle = "rgba(0,0,0,0.30)";
      ch.lineWidth = 0.8 + Math.random() * 0.7;
      ch.beginPath();
      ch.moveTo(px, py);
      ch.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      ch.stroke();
    });
  }
  return { albedo: a, height: h, rough: 0.60 };
}

/* A plain weave: warp and weft take turns being the thread on top,
   which is what gives cloth its fine checkerboard sheen. */
function texCloth(S, base) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const P = 8, TH = 6;
  /* which thread is uppermost here, and how round it looks across its
     own width - the roundness is where the sheen comes from */
  const weave = (u, v) => {
    const over = ((Math.floor(u * TH) + Math.floor(v * TH)) & 1) === 0;
    const across = over ? (v * TH) % 1 : (u * TH) % 1;
    const c = 2 * across - 1;
    return 1 - c * c;
  };
  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const round = weave(u, v);
    const lint = pfbm(u * 24, v * 24, 2, 1401, P * 24);
    const fade = pfbm(u * 1.4, v * 1.4, 2, 1407, P * 1.4);
    const k = (0.68 + round * 0.30 + lint * 0.14) * (0.92 + fade * 0.16);
    o[0] = base[0] * k; o[1] = base[1] * k; o[2] = base[2] * k;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const g = 66 + weave(u, v) * 124 + pfbm(u * 30, v * 30, 2, 1401, P * 30) * 42;
    o[0] = o[1] = o[2] = g;
  });
  return { albedo: a, height: h, rough: 0.82 };
}

/* Denim is a twill: the weft crosses several warps at a time and steps
   over by one on every row, which is what draws the diagonal. Only the
   warp is dyed, so the ribs between the diagonals show the pale thread
   underneath - and that is what the eye reads as denim. */
function texDenim(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  /* P * TH and half of it are both whole, so the diagonal tiles */
  const P = 7, TH = 30;
  const rib = (u, v) => {
    const d = (u * TH + v * TH * 0.5) % 1;
    const c = 2 * ((d + 1) % 1) - 1;
    return 1 - Math.abs(c);
  };
  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const r = rib(u, v);
    const slub = pfbm(u * 18, v * 3, 2, 1501, P * 18);
    /* worn paler where the cloth rubs - knees, seat, thigh fronts */
    const pale = clamp01(pfbm(u * 2.2, v * 2.2, 3, 1507, P * 2.2) * 1.5 - 0.35);
    const k = 0.66 + slub * 0.18;
    o[0] = (34 + pale * 62) * k + r * 30;
    o[1] = (48 + pale * 68) * k + r * 32;
    o[2] = (82 + pale * 70) * k + r * 28;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const g = 58 + rib(u, v) * 114 + pfbm(u * 20, v * 4, 2, 1501, P * 20) * 58;
    o[0] = o[1] = o[2] = g;
  });
  return { albedo: a, height: h, rough: 0.86 };
}

/* Leather: a field of pebbles with creases wandering across it. */
function texLeather(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const P = 6;
  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const grain = pfbm(u * 13, v * 13, 3, 1601, P * 13);
    const pebble = pnoise(u * 34, v * 34, 1607, P * 34);
    const patch = pfbm(u * 1.6, v * 1.6, 2, 1611, P * 1.6);
    const k = 0.56 + grain * 0.30 + pebble * 0.22 + patch * 0.20;
    o[0] = 94 * k; o[1] = 63 * k; o[2] = 45 * k;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const g = 86 + pfbm(u * 15, v * 15, 3, 1601, P * 15) * 96
      + pnoise(u * 38, v * 38, 1607, P * 38) * 58;
    o[0] = o[1] = o[2] = g;
  });
  /* the creases a boot gets across the toe */
  ch.lineCap = "round";
  for (let i = 0; i < S / 16; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const len = S * (0.08 + Math.random() * 0.26);
    const ang = Math.random() * 6.2832;
    const bow = (Math.random() - 0.5) * len * 0.4;
    wrapped(S, x, y, len, (px, py) => {
      ch.strokeStyle = "rgba(0,0,0,0.34)";
      ch.lineWidth = 1 + Math.random() * 1.6;
      ch.beginPath();
      ch.moveTo(px, py);
      ch.quadraticCurveTo(
        px + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bow,
        py + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bow,
        px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      ch.stroke();
    });
  }
  return { albedo: a, height: h, rough: 0.64 };
}

function texHair(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const P = 8;
  fill(ca, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const strand = pfbm(u * 34, v * 1.5, 3, 1701, P * 34);
    const clump = pfbm(u * 5.5, v * 1.1, 2, 1707, P * 5.5);
    /* Lighter than it looks it should be. Hair albedo is genuinely dark,
       and dark albedo under ACES with the sun off to one side crushes to
       black - the whole head read as a beret. The strand-to-strand range
       is what stops it reading as one solid mass. */
    const k = 0.34 + strand * 0.62 + clump * 0.40;
    o[0] = 84 * k; o[1] = 61 * k; o[2] = 42 * k;
  });
  fill(ch, S, (x, y, o) => {
    const u = x / S * P, v = y / S * P;
    const g = 60 + pfbm(u * 40, v * 1.8, 3, 1701, P * 40) * 130
      + pfbm(u * 6, v * 1.2, 2, 1707, P * 6) * 55;
    o[0] = o[1] = o[2] = g;
  });
  return { albedo: a, height: h, rough: 0.72 };
}

/* ============================================================
   The face.

   Painted in the head's own grid coordinates but worked out in
   metres: every pixel is turned back into the point on the head
   it covers, and then asked the same questions the sculpt asked
   of it. A lip drawn as an ellipse in texture space would have
   to be placed by eye, and would slide off the moment the head
   changed shape.
   ============================================================ */

function texFace(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const E = FACE;
  /* u runs right round the head, so a whole number of noise cells
     across it is what keeps the seam at the back invisible */
  const P = 11;
  const bell = (dx, dy, rx, ry) => {
    const t = (dx / rx) * (dx / rx) + (dy / ry) * (dy / ry);
    return t >= 1 ? 0 : (1 - t) * (1 - t);
  };
  const se = (c, e) => (e === 1 ? c : Math.sign(c) * Math.pow(Math.abs(c), e));

  /* Every pixel, as the point on the head it lands on.

     The row is read from the bottom up, because three.js flips a canvas
     when it uploads it: painting row nought as the crown put the mouth
     on his forehead and a pair of dark ellipses on his cheekbones where
     the lash lines should have been. */
  const at = (px, py, S2) => {
    const u = px / S2, v = 1 - py / S2;
    const y = yOf(v), th = thetaOf(u);
    const L = lathe(y);
    /* the last two are where to sample noise: uniform round the head
       and uniform down it, which the grid itself is deliberately not.
       Sampling on the grid instead smeared the pores into streaks all
       down the sides of his head, where the columns are sparsest. */
    return [L[0] * se(Math.sin(th), L[3]), y, Math.cos(th),
      (th / 6.2832 + 0.5) * P, (1.7560 - y) * (P / 0.534)];
  };

  fill(ca, S, (px, py, o) => {
    const q = at(px, py, S);
    const x = q[0], y = q[1], ax = Math.abs(x);
    /* how much of the face this pixel is looking at, as against the
       scalp and the back of the head */
    const fwd = clamp01((q[2] - 0.1) / 0.5);
    const u = q[3], v = q[4];

    /* skin, which is never one colour: blood in patches, a grain of
       pores over the top of it */
    const blood = pfbm(u * 1.9, v * 1.9, 3, 2101, P * 1.9);
    const grain = pfbm(u * 21, v * 21, 2, 2107, P * 21);
    const pore = pnoise(u * 58, v * 58, 2111, P * 58);
    const t = grain * 0.58 + pore * 0.42;
    let r = 196 + blood * 15 + t * 13;
    let g = 152 + blood * 6 + t * 13;
    let b = 134 - blood * 6 + t * 12;

    /* the warm places: the cheeks, the nose, the ears, the point of the
       chin - anywhere the blood runs close to the surface */
    /* Clamped, and gentler than it was. These four overlap, and four
       bells at full strength on one cheek came out as a rash rather
       than as the colour of a face. */
    const warm = clamp01(
      bell(ax - 0.0455, y - (E.noseBaseY + 0.0070), 0.0280, 0.0235) * fwd * 0.75
      + bell(ax, y - (E.noseTipY + 0.0050), 0.0165, 0.0280) * fwd * 0.55
      + bell(ax - 0.0740, y - E.earY, 0.0170, 0.0245) * 0.65
      + bell(ax, y - E.chinY, 0.0185, 0.0105) * fwd * 0.35);
    r += warm * 11; g -= warm * 4; b -= warm * 3;

    /* the lips: redder, a touch darker, and sharply edged */
    const lip = Math.max(
      bell(ax, y - (E.mouthY + 0.0058), 0.0250, 0.0080),
      bell(ax, y - (E.mouthY - 0.0073), 0.0228, 0.0088)) * fwd;
    const lipK = clamp01((lip - 0.12) / 0.45);
    r = r * (1 - lipK) + (168 + blood * 16) * lipK;
    g = g * (1 - lipK) + (98 + blood * 8) * lipK;
    b = b * (1 - lipK) + (95 + blood * 8) * lipK;
    /* the line between them */
    const line = bell(ax, y - E.mouthY, 0.0268, 0.0022) * fwd;
    const lk = clamp01(line * 1.6);
    r *= 1 - lk * 0.52; g *= 1 - lk * 0.58; b *= 1 - lk * 0.54;

    /* the eye: a lash line round the opening, and the socket above it */
    const ex = ax - E.eyeX, ey = y - E.eyeY;
    const qq = Math.sqrt((ex / E.apW) * (ex / E.apW)
      + ((ey + 0.0008) / E.apH) * ((ey + 0.0008) / E.apH));
    const lash = bell(qq - 1.02, 0, 0.30, 1) * clamp01(1.3 - Math.abs(ex) / 0.016);
    const inside = qq < 0.95 ? 1 : 0;
    const dark = clamp01(lash * 1.5) * fwd + inside * fwd;
    r *= 1 - dark * 0.72; g *= 1 - dark * 0.74; b *= 1 - dark * 0.70;
    /* the lid, which is thinner skin and shows more of what is under it */
    const lidv = bell(ex, ey - 0.0090, 0.0190, 0.0120) * fwd;
    r += lidv * 4; g -= lidv * 5; b += lidv * 3;

    /* brows and lashes are geometry, but the skin under a brow is darker
       than the skin beside it */
    const brow = bell(ax - 0.0255, y - (E.browY - 0.0055), 0.0290, 0.0105) * fwd;
    const bk = clamp01(brow * 1.1);
    r *= 1 - bk * 0.34; g *= 1 - bk * 0.36; b *= 1 - bk * 0.33;

    /* the nostrils, and the shadow under the nose */
    const nos = bell(ax - 0.0100, y - (E.noseBaseY - 0.0027), 0.0062, 0.0046) * fwd;
    const base = bell(ax, y - (E.noseBaseY - 0.0045), 0.0160, 0.0040) * fwd;
    const nk = clamp01(nos * 1.8 + base * 0.7);
    r *= 1 - nk * 0.70; g *= 1 - nk * 0.74; b *= 1 - nk * 0.72;

    /* a day or two of stubble over the beard line, which is most of what
       tells you a face belongs to a grown man */
    const beard = clamp01(
      (bell(ax - 0.0300, y - (E.mouthY - 0.0310), 0.0620, 0.0320) * 1.2
        + bell(ax - 0.0130, y - (E.mouthY + 0.0110), 0.0260, 0.0090) * 0.9
        + bell(ax - 0.0520, y - (E.mouthY + 0.0080), 0.0260, 0.0300) * 0.8) * fwd);
    const sk = beard * (0.45 + pnoise(u * 60, v * 60, 2117, P * 60) * 0.9) * (1 - lipK);
    r -= sk * 30; g -= sk * 24; b -= sk * 16;

    /* the hairline, where the scalp is darker than the forehead */
    const scalp = clamp01((y - (E.hairline - 0.010)) / 0.022);
    r -= scalp * 34; g -= scalp * 28; b -= scalp * 24;

    o[0] = clamp01(r / 255) * 255;
    o[1] = clamp01(g / 255) * 255;
    o[2] = clamp01(b / 255) * 255;
  });

  fill(ch, S, (px, py, o) => {
    const q = at(px, py, S);
    const x = q[0], y = q[1], ax = Math.abs(x);
    const fwd = clamp01((q[2] - 0.1) / 0.5);
    const u = q[3], v = q[4];
    /* Fine grain, not lumps. A face is mostly smooth: a strong
       low-frequency bump in the height map turns into blotchy shading
       that reads as a skin complaint rather than as skin. */
    let g = 124 + pfbm(u * 38, v * 38, 3, 2111, P * 38) * 42
      + pnoise(u * 72, v * 72, 2117, P * 72) * 58;
    /* lips are not smooth: fine vertical furrows across both of them */
    const lip = Math.max(
      bell(ax, y - (E.mouthY + 0.0058), 0.0250, 0.0080),
      bell(ax, y - (E.mouthY - 0.0073), 0.0228, 0.0088)) * fwd;
    g += clamp01(lip * 1.4) * (Math.sin(x * 1750) * 26 - 14);
    /* and the pores open up over the nose and the cheeks */
    const open = bell(ax, y - (E.noseTipY + 0.0050), 0.0230, 0.0330) * fwd
      + bell(ax - 0.0420, y - (E.noseBaseY + 0.0080), 0.0300, 0.0260) * fwd;
    g += clamp01(open) * pnoise(u * 96, v * 96, 2131, P * 96) * 54;
    o[0] = o[1] = o[2] = clamp01(g / 255) * 255;
  });
  return { albedo: a, height: h, rough: 0.56 };
}

/* ---- the eyeball ----
   A disc: the middle of it is the pupil, because the ball is built on a
   polar grid about the direction it looks in. */
function texEye(S) {
  const a = canvasOf(S), h = canvasOf(S);
  const ca = a.getContext("2d"), ch = h.getContext("2d");
  const c = S * 0.5;
  /* the iris subtends this much of the disc - the ball is 24 mm across
     and an iris a shade under 12, so a third of the way out */
  const IR = S * 0.082, PR = IR * 0.42;

  fill(ca, S, (x, y, o) => {
    const dx = (x - c) / S * 11, dy = (y - c) / S * 11;
    /* the white, with veins fading in towards the corners */
    const d = Math.hypot(x - c, y - c) / S;
    const vein = pfbm(dx * 7, dy * 7, 3, 2201, 77);
    const k = clamp01((d - 0.085) / 0.13);
    o[0] = 236 - vein * 10 + k * vein * 42;
    o[1] = 228 - vein * 14 + k * vein * 10;
    o[2] = 221 - vein * 14 + k * vein * 6;
  });

  /* the iris: fibres running out from the pupil, a darker ring round the
     outside, and the pupil itself */
  const g = ca.createRadialGradient(c, c, PR * 0.8, c, c, IR);
  g.addColorStop(0, "rgb(86,66,44)");
  g.addColorStop(0.45, "rgb(104,80,52)");
  g.addColorStop(0.82, "rgb(74,58,40)");
  g.addColorStop(1, "rgb(34,26,20)");
  ca.fillStyle = g;
  ca.beginPath(); ca.arc(c, c, IR, 0, 6.2832); ca.fill();

  ca.save();
  ca.beginPath(); ca.arc(c, c, IR * 0.97, 0, 6.2832); ca.clip();
  for (let i = 0; i < 260; i++) {
    const an = Math.random() * 6.2832;
    const r0 = PR * (0.9 + Math.random() * 0.3);
    const r1 = IR * (0.55 + Math.random() * 0.45);
    ca.strokeStyle = Math.random() < 0.5
      ? "rgba(150,118,74," + (0.10 + Math.random() * 0.22) + ")"
      : "rgba(32,24,16," + (0.08 + Math.random() * 0.20) + ")";
    ca.lineWidth = 0.6 + Math.random() * 1.3;
    ca.beginPath();
    ca.moveTo(c + Math.cos(an) * r0, c + Math.sin(an) * r0);
    ca.lineTo(c + Math.cos(an) * r1, c + Math.sin(an) * r1);
    ca.stroke();
  }
  ca.restore();

  /* the limbal ring, which is most of what makes an eye look like an eye */
  ca.strokeStyle = "rgba(22,16,12,0.80)";
  ca.lineWidth = S * 0.006;
  ca.beginPath(); ca.arc(c, c, IR * 0.985, 0, 6.2832); ca.stroke();

  ca.fillStyle = "rgb(10,8,8)";
  ca.beginPath(); ca.arc(c, c, PR, 0, 6.2832); ca.fill();

  fill(ch, S, (x, y, o) => {
    const d = Math.hypot(x - c, y - c);
    /* flat, except that the iris is dished and the pupil deeper still */
    let v = 150;
    if (d < IR) v = 116 + (d / IR) * 30;
    if (d < PR) v = 96;
    o[0] = o[1] = o[2] = v;
  });
  return { albedo: a, height: h, rough: 0.07 };
}
export {
  canvasOf, wrapped, fill, rgb, texTurf, texSoil, texStone, texSand, texBark, leafShape, texLeafCard, texNeedle, texNeedleMass, texTuft, texBlossom, texMote, texNoise, splitCard, normalFrom, texSkin, texCloth, texDenim, texLeather, texHair, texFace, texEye,
};
