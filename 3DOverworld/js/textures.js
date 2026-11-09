/* ============================================================
   Every surface in the game, drawn into a canvas at load time.
   Each ground texture is tileable: the noise lattice wraps, and
   anything drawn near an edge is drawn again on the far side.
   ============================================================ */

import { clamp01, pfbm, pnoise } from "./terrain.js";

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

export {
  canvasOf, wrapped, fill, rgb, texTurf, texSoil, texStone, texSand, texBark, leafShape, texLeafCard, texNeedle, texNeedleMass, texTuft, texBlossom, texMote, texNoise, splitCard, normalFrom,
};
