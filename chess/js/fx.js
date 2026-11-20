/* ============================================================
   Things that fly, burst and fall.

   One canvas lies over the whole page and ignores the mouse. It
   only runs while something is on it, so an ordinary game costs
   nothing. Coordinates are page pixels, the same ones
   getBoundingClientRect gives, so the board can say "the middle of
   e4 is here" and a rocket will go there.

   Emoji that float up from a player, and the big banner, are plain
   page elements instead: text looks sharper that way.
   ============================================================ */

let cv = null, g = null, W = 0, H = 0, dpr = 1;
let parts = [], rockets = [], rings = [], flashes = [];
let running = false, last = 0;

const rnd = (a, b) => a + Math.random() * (b - a);
const pickOf = arr => arr[(Math.random() * arr.length) | 0];
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initFx(canvas) {
  cv = canvas;
  g = cv.getContext('2d');
  const size = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
  };
  size();
  window.addEventListener('resize', size);
}

function wake() {
  if (running || !g) return;
  running = true; last = performance.now();
  requestAnimationFrame(frame);
}

function frame(t) {
  /* Sparks and smoke are stepped in small slices so they stay stable. A
     rocket has somewhere to be: it runs on real time, so a slow phone
     gets a choppier flight, not a slower one. */
  const real = Math.min(0.4, (t - last) / 1000), dt = Math.min(0.05, real);
  last = t;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  for (const f of flashes) {
    f.life -= dt;
    const k = Math.max(0, f.life / f.max);
    const grad = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (1.4 - k * 0.4));
    grad.addColorStop(0, `rgba(255,255,235,${0.95 * k})`);
    grad.addColorStop(0.35, `rgba(255,200,80,${0.7 * k})`);
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = grad;
    g.beginPath(); g.arc(f.x, f.y, f.r * 1.5, 0, 6.3); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  flashes = flashes.filter(f => f.life > 0);

  for (const r of rings) {
    r.life -= dt;
    const k = 1 - Math.max(0, r.life / r.max);
    g.strokeStyle = `rgba(255,230,180,${(1 - k) * 0.8})`;
    g.lineWidth = r.w * (1 - k) + 1;
    g.beginPath(); g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - k) ** 3), 0, 6.3); g.stroke();
  }
  rings = rings.filter(r => r.life > 0);

  for (const p of parts) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy += (p.g || 0) * dt;
    if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += (p.vr || 0) * dt;
    const k = p.life / p.max;
    if (p.kind === 'fire') {
      g.globalCompositeOperation = 'lighter';
      const size = p.size * (0.4 + k * 0.8);
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
      grad.addColorStop(0, `rgba(255,255,220,${k})`);
      grad.addColorStop(0.4, `rgba(255,${(150 + 80 * k) | 0},40,${k * 0.9})`);
      grad.addColorStop(1, 'rgba(255,60,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(p.x, p.y, size, 0, 6.3); g.fill();
      g.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'smoke') {
      const size = p.size * (1.6 - k * 0.9);
      g.fillStyle = `rgba(${p.shade},${p.shade},${p.shade},${k * 0.42})`;
      g.beginPath(); g.arc(p.x, p.y, size, 0, 6.3); g.fill();
    } else if (p.kind === 'spark') {
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,${(200 + 55 * k) | 0},${(120 * k) | 0},${k})`;
      g.lineWidth = p.size;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
      g.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'text') {
      g.save();
      g.translate(p.x, p.y); g.rotate(p.rot);
      g.globalAlpha = Math.min(1, k * 2.5);
      g.font = p.size + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.text, 0, 0);
      g.restore();
    } else if (p.kind === 'star') {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `hsla(${p.hue},100%,${60 + 30 * k}%,${k})`;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      const s = p.size * (0.5 + k * 0.5);
      g.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.38 : s, a = i * Math.PI / 4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.restore();
      g.globalCompositeOperation = 'source-over';
    } else {                                   // chunk / confetti
      g.save();
      g.translate(p.x, p.y); g.rotate(p.rot);
      g.globalAlpha = Math.min(1, k * 3);
      g.fillStyle = p.colour;
      g.fillRect(-p.size / 2, -p.size * (p.thin || 1) / 2, p.size, p.size * (p.thin || 1));
      g.restore();
    }
  }
  g.globalAlpha = 1;
  parts = parts.filter(p => p.life > 0 && p.y < H + 80);

  for (const r of rockets) stepRocket(r, real);
  rockets = rockets.filter(r => !r.done);

  if (parts.length || rockets.length || rings.length || flashes.length) requestAnimationFrame(frame);
  else { running = false; g.clearRect(0, 0, W, H); }
}

/* ---------------------------------------------------------------- rockets */

function stepRocket(r, dt) {
  r.t += dt / r.dur;
  const t = Math.min(1, r.t), e = t * t * (1.6 - 0.6 * t);           // slow off the pad, then it goes
  const u = 1 - e;
  const x = u * u * r.x0 + 2 * u * e * r.cx + e * e * r.x1;
  const y = u * u * r.y0 + 2 * u * e * r.cy + e * e * r.y1;
  const dx = 2 * u * (r.cx - r.x0) + 2 * e * (r.x1 - r.cx), dy = 2 * u * (r.cy - r.y0) + 2 * e * (r.y1 - r.cy);
  const ang = Math.atan2(dy, dx), L = r.size;

  /* exhaust */
  const bx = x - Math.cos(ang) * L * 0.55, by = y - Math.sin(ang) * L * 0.55;
  for (let i = 0; i < 2; i++) parts.push({ kind: 'smoke', x: bx + rnd(-3, 3), y: by + rnd(-3, 3), vx: -Math.cos(ang) * rnd(20, 60) + rnd(-15, 15), vy: -Math.sin(ang) * rnd(20, 60) + rnd(-15, 15), life: rnd(0.5, 0.9), max: 0.9, size: L * rnd(0.14, 0.24), shade: (rnd(150, 215)) | 0, rot: 0 });
  parts.push({ kind: 'fire', x: bx, y: by, vx: -Math.cos(ang) * rnd(60, 140), vy: -Math.sin(ang) * rnd(60, 140), life: rnd(0.12, 0.25), max: 0.25, size: L * 0.26, rot: 0 });

  g.save();
  g.translate(x, y); g.rotate(ang);
  /* flame */
  const fl = L * rnd(0.5, 0.85);
  const fg = g.createLinearGradient(-L * 0.5, 0, -L * 0.5 - fl, 0);
  fg.addColorStop(0, '#fff7c2'); fg.addColorStop(0.4, '#ffb02e'); fg.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = fg;
  g.beginPath(); g.moveTo(-L * 0.48, -L * 0.13); g.quadraticCurveTo(-L * 0.5 - fl, 0, -L * 0.48, L * 0.13); g.fill();
  /* fins */
  g.fillStyle = '#d7263d';
  g.beginPath(); g.moveTo(-L * 0.5, 0); g.lineTo(-L * 0.62, -L * 0.34); g.lineTo(-L * 0.2, -L * 0.14); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-L * 0.5, 0); g.lineTo(-L * 0.62, L * 0.34); g.lineTo(-L * 0.2, L * 0.14); g.closePath(); g.fill();
  /* body */
  const bg = g.createLinearGradient(0, -L * 0.17, 0, L * 0.17);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.55, '#dfe6ee'); bg.addColorStop(1, '#8e9aa8');
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(-L * 0.5, -L * 0.15); g.lineTo(L * 0.2, -L * 0.15);
  g.quadraticCurveTo(L * 0.5, -L * 0.13, L * 0.62, 0);
  g.quadraticCurveTo(L * 0.5, L * 0.13, L * 0.2, L * 0.15);
  g.lineTo(-L * 0.5, L * 0.15); g.closePath(); g.fill();
  /* nose */
  g.fillStyle = '#d7263d';
  g.beginPath(); g.moveTo(L * 0.3, -L * 0.14); g.quadraticCurveTo(L * 0.52, -L * 0.12, L * 0.62, 0); g.quadraticCurveTo(L * 0.52, L * 0.12, L * 0.3, L * 0.14); g.closePath(); g.fill();
  /* stripe and window */
  g.fillStyle = '#d7263d'; g.fillRect(-L * 0.32, -L * 0.15, L * 0.07, L * 0.3);
  g.fillStyle = '#2b6cb0'; g.beginPath(); g.arc(L * 0.05, 0, L * 0.075, 0, 6.3); g.fill();
  g.fillStyle = '#bfe3ff'; g.beginPath(); g.arc(L * 0.035, -L * 0.02, L * 0.03, 0, 6.3); g.fill();
  g.restore();

  if (r.t >= 1) land(r);
}
function land(r) { if (!r.done) { r.done = true; r.resolve(); } }

/* Fly a rocket from one point to another. Resolves at the moment it hits. */
export function rocket(from, to, opts = {}) {
  if (!g) return Promise.resolve();
  return new Promise(resolve => {
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1;
    const bend = (opts.bend != null ? opts.bend : rnd(-0.35, 0.35)) * dist;
    const r = {
      x0: from.x, y0: from.y, x1: to.x, y1: to.y,
      cx: (from.x + to.x) / 2 - dy / dist * bend, cy: (from.y + to.y) / 2 + dx / dist * bend - dist * 0.12,
      t: 0, dur: opts.dur || Math.min(1.25, 0.6 + dist / 1400), size: opts.size || 46, resolve, done: false,
    };
    rockets.push(r);
    wake();
    /* a tab in the background draws no frames at all; the game must not
       wait for a rocket nobody can see */
    setTimeout(() => land(r), r.dur * 1000 + 900);
  });
}

/* A sensible place off the edge of the screen to launch from. side: 'bottom' | 'top' | 'any' */
export function launchPoint(side = 'any') {
  const s = side === 'any' ? pickOf(['bottom', 'top', 'left', 'right']) : side;
  if (s === 'bottom') return { x: rnd(W * 0.05, W * 0.95), y: H + 60 };
  if (s === 'top') return { x: rnd(W * 0.05, W * 0.95), y: -60 };
  if (s === 'left') return { x: -60, y: rnd(H * 0.2, H * 0.9) };
  return { x: W + 60, y: rnd(H * 0.2, H * 0.9) };
}

/* ------------------------------------------------------------- explosions */

export function explode(at, size = 60) {
  if (!g) return;
  const calm = reduced();
  flashes.push({ x: at.x, y: at.y, r: size * 1.5, life: 0.28, max: 0.28 });
  rings.push({ x: at.x, y: at.y, r0: size * 0.2, r1: size * 2.6, w: size * 0.22, life: 0.5, max: 0.5 });
  const n = calm ? 12 : 46;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.3), v = rnd(40, 520);
    parts.push({ kind: 'fire', x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, drag: 3.2, life: rnd(0.35, 0.95), max: 0.95, size: size * rnd(0.22, 0.6), rot: 0 });
  }
  for (let i = 0; i < (calm ? 4 : 16); i++) {
    const a = rnd(0, 6.3), v = rnd(20, 160);
    parts.push({ kind: 'smoke', x: at.x + rnd(-8, 8), y: at.y + rnd(-8, 8), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, drag: 1.4, g: -40, life: rnd(0.9, 1.9), max: 1.9, size: size * rnd(0.3, 0.6), shade: (rnd(40, 110)) | 0, rot: 0 });
  }
  for (let i = 0; i < (calm ? 0 : 26); i++) {
    const a = rnd(0, 6.3), v = rnd(250, 900);
    parts.push({ kind: 'spark', x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.2, g: 500, life: rnd(0.3, 0.8), max: 0.8, size: rnd(1.2, 2.6), rot: 0 });
  }
  for (let i = 0; i < (calm ? 0 : 14); i++) {
    const a = rnd(-Math.PI, 0), v = rnd(180, 560);
    parts.push({ kind: 'chunk', x: at.x, y: at.y, vx: Math.cos(a) * v * 1.2, vy: Math.sin(a) * v - 120, g: 1500, life: rnd(0.9, 1.6), max: 1.6, size: size * rnd(0.08, 0.2), colour: pickOf(['#1c1c1c', '#3a3a3a', '#f4f4f4', '#8a6b4a', '#d9c7a3']), rot: rnd(0, 6), vr: rnd(-14, 14) });
  }
  wake();
}

/* gold stars: a piece arrives, a pawn promotes */
export function sparkle(at, size = 60, hue = 48) {
  if (!g) return;
  for (let i = 0; i < 26; i++) {
    const a = rnd(0, 6.3), v = rnd(40, 260);
    parts.push({ kind: 'star', x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, drag: 2.4, g: 120, life: rnd(0.5, 1.1), max: 1.1, size: size * rnd(0.08, 0.2), hue: hue + rnd(-14, 14), rot: rnd(0, 6), vr: rnd(-6, 6) });
  }
  rings.push({ x: at.x, y: at.y, r0: size * 0.1, r1: size * 1.3, w: 6, life: 0.4, max: 0.4 });
  wake();
}

export function confetti(amount = 160) {
  if (!g) return;
  const colours = ['#ffd24a', '#3dff7a', '#4aa3ff', '#ff5d8f', '#b57bff', '#ffffff', '#ff9a3d'];
  const n = reduced() ? 30 : amount;
  for (let i = 0; i < n; i++) {
    parts.push({ kind: 'chunk', x: rnd(0, W), y: rnd(-H * 0.5, -10), vx: rnd(-60, 60), vy: rnd(120, 360), g: 160, drag: 0.4, life: rnd(2.6, 4.4), max: 4.4, size: rnd(7, 13), thin: rnd(0.35, 0.7), colour: pickOf(colours), rot: rnd(0, 6), vr: rnd(-9, 9) });
  }
  wake();
}

export function rain(emoji, amount = 46) {
  if (!g) return;
  const n = reduced() ? 12 : amount;
  for (let i = 0; i < n; i++) {
    parts.push({ kind: 'text', text: emoji, x: rnd(0, W), y: rnd(-H * 0.8, -20), vx: rnd(-25, 25), vy: rnd(180, 420), g: 120, life: rnd(2.8, 4.6), max: 4.6, size: rnd(24, 46), rot: rnd(-0.5, 0.5), vr: rnd(-1.5, 1.5) });
  }
  wake();
}

export function fireworks(count = 6) {
  if (!g) return;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const at = { x: rnd(W * 0.15, W * 0.85), y: rnd(H * 0.12, H * 0.5) }, hue = rnd(0, 360);
      flashes.push({ x: at.x, y: at.y, r: 50, life: 0.2, max: 0.2 });
      for (let j = 0; j < 54; j++) {
        const a = j / 54 * 6.283, v = rnd(160, 330);
        parts.push({ kind: 'star', x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 1.7, g: 150, life: rnd(0.9, 1.5), max: 1.5, size: rnd(5, 10), hue: hue + rnd(-20, 20), rot: rnd(0, 6), vr: rnd(-5, 5) });
      }
      wake();
    }, i * 320 + rnd(0, 160));
  }
}

/* --------------------------------------------------------- page elements */

/* one emoji drifting up from a spot, for reactions */
export function floatEmoji(at, emoji, big = false) {
  const el = document.createElement('div');
  el.className = 'float-emoji' + (big ? ' big' : '');
  el.textContent = emoji;
  el.style.left = at.x + 'px';
  el.style.top = at.y + 'px';
  el.style.setProperty('--drift', rnd(-40, 40) + 'px');
  el.style.setProperty('--tilt', rnd(-18, 18) + 'deg');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

export function banner(text, sub = '') {
  const old = document.querySelector('.fx-banner');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'fx-banner';
  const a = document.createElement('div'); a.className = 'fx-banner-main'; a.textContent = text;
  el.appendChild(a);
  if (sub) { const b = document.createElement('div'); b.className = 'fx-banner-sub'; b.textContent = sub; el.appendChild(b); }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function shake(el, strong = false) {
  if (!el || reduced()) return;
  el.classList.remove('shake', 'shake-hard');
  void el.offsetWidth;                         // restart the animation if it is already running
  el.classList.add(strong ? 'shake-hard' : 'shake');
  setTimeout(() => el.classList.remove('shake', 'shake-hard'), 600);
}
