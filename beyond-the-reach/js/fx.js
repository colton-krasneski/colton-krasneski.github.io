/* ============================================================
   FX — canvas particle + overlay system
   Rain, sea spray, embers, gulls, snowfall-of-ash, speed lines,
   impact frames, god rays, water caustics.
   ============================================================ */
const FX = (() => {
  let cv, ctx, W = 0, H = 0, dpr = 1;
  let sets = new Map();      // name -> emitter state
  let last = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    resize(); addEventListener('resize', resize);
    // the player starts hidden, so the first measure is 0x0 — watch for the real one
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  }
  function resize() {
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;          // not laid out yet
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------------- emitter definitions ---------------- */
  const KIND = {
    rain: {
      n: 260, make: () => ({ x: rnd(-.2, 1.3), y: rnd(-.2, 1.2), l: rnd(.05, .16), v: rnd(1.5, 2.6), a: rnd(.18, .55) }),
      step(p, dt) { p.y += p.v * dt; p.x += p.v * .22 * dt; if (p.y > 1.2) { p.y = -.15; p.x = rnd(-.2, 1.3); } },
      draw(p) {
        ctx.strokeStyle = `rgba(190,225,255,${p.a})`; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(p.x * W, p.y * H);
        ctx.lineTo((p.x - p.l * .22) * W, (p.y - p.l) * H); ctx.stroke();
      }
    },
    embers: {
      n: 90, make: () => ({ x: rnd(0, 1), y: rnd(.2, 1.25), v: rnd(.05, .17), w: rnd(-.03, .03), s: rnd(.7, 2.4), a: rnd(.3, .95), ph: rnd(0, 6.28) }),
      step(p, dt, t) { p.y -= p.v * dt; p.x += Math.sin(t * 1.4 + p.ph) * .012 * dt + p.w * dt * .3; if (p.y < -.1) { p.y = 1.15; p.x = rnd(0, 1); } },
      draw(p, t) {
        const f = .55 + .45 * Math.sin(t * 5 + p.ph);
        const g = ctx.createRadialGradient(p.x * W, p.y * H, 0, p.x * W, p.y * H, p.s * 5);
        g.addColorStop(0, `rgba(255,220,150,${p.a * f})`);
        g.addColorStop(.4, `rgba(255,130,45,${p.a * f * .7})`);
        g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.s * 5, 0, 6.284); ctx.fill();
      }
    },
    ash: {
      n: 130, make: () => ({ x: rnd(0, 1), y: rnd(-.2, 1.2), v: rnd(.02, .07), s: rnd(.6, 1.9), a: rnd(.12, .45), ph: rnd(0, 6.28) }),
      step(p, dt, t) { p.y += p.v * dt; p.x += Math.sin(t * .7 + p.ph) * .02 * dt; if (p.y > 1.2) { p.y = -.15; p.x = rnd(0, 1); } },
      draw(p) { ctx.fillStyle = `rgba(228,232,240,${p.a})`; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.s, 0, 6.284); ctx.fill(); }
    },
    spray: {
      n: 120, make: () => ({ x: rnd(0, 1), y: rnd(.65, 1.1), v: rnd(.18, .5), u: rnd(-.35, -.05), s: rnd(.8, 2.6), a: rnd(.15, .6), life: rnd(0, 1) }),
      step(p, dt) {
        p.life += dt * .5; p.y += p.u * dt * .35; p.x += p.v * dt * .12; p.u += dt * .38;
        if (p.life > 1.6) { p.life = 0; p.x = rnd(-.05, 1); p.y = rnd(.72, 1.05); p.u = rnd(-.4, -.1); }
      },
      draw(p) { ctx.fillStyle = `rgba(226,244,255,${p.a * Math.max(0, 1 - p.life / 1.6)})`; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.s, 0, 6.284); ctx.fill(); }
    },
    dust: {
      n: 70, make: () => ({ x: rnd(0, 1), y: rnd(0, 1), v: rnd(-.02, .02), u: rnd(-.015, .015), s: rnd(.5, 1.6), a: rnd(.08, .3), ph: rnd(0, 6.28) }),
      step(p, dt, t) { p.x += (p.v + Math.sin(t * .5 + p.ph) * .01) * dt; p.y += p.u * dt; if (p.x > 1.05) p.x = -.05; if (p.x < -.05) p.x = 1.05; if (p.y > 1.05) p.y = -.05; if (p.y < -.05) p.y = 1.05; },
      draw(p, t) { ctx.fillStyle = `rgba(255,235,190,${p.a * (.6 + .4 * Math.sin(t * 2 + p.ph))})`; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.s, 0, 6.284); ctx.fill(); }
    },
    snowfoam: {
      n: 60, make: () => ({ x: rnd(0, 1), y: rnd(.78, 1.05), s: rnd(6, 34), a: rnd(.05, .18), ph: rnd(0, 6.28), v: rnd(.01, .05) }),
      step(p, dt, t) { p.x += p.v * dt * .2; if (p.x > 1.1) p.x = -.15; },
      draw(p, t) {
        ctx.fillStyle = `rgba(255,255,255,${p.a * (.7 + .3 * Math.sin(t + p.ph))})`;
        ctx.beginPath(); ctx.ellipse(p.x * W, p.y * H, p.s, p.s * .28, 0, 0, 6.284); ctx.fill();
      }
    },
    fireflies: {
      n: 34, make: () => ({ x: rnd(0, 1), y: rnd(.2, .95), ph: rnd(0, 6.28), sp: rnd(.3, .9), r: rnd(.02, .09), cx: rnd(0, 1), cy: rnd(.2, .95) }),
      step(p, dt, t) { p.x = p.cx + Math.cos(t * p.sp + p.ph) * p.r; p.y = p.cy + Math.sin(t * p.sp * 1.4 + p.ph) * p.r * .6; },
      draw(p, t) {
        const f = Math.max(0, Math.sin(t * 2.2 + p.ph));
        const g = ctx.createRadialGradient(p.x * W, p.y * H, 0, p.x * W, p.y * H, 9);
        g.addColorStop(0, `rgba(190,255,225,${.9 * f})`); g.addColorStop(1, 'rgba(80,255,190,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 9, 0, 6.284); ctx.fill();
      }
    },
    gulls: {
      n: 7, make: () => ({ x: rnd(-.2, 1.2), y: rnd(.08, .4), v: rnd(.02, .06), s: rnd(6, 15), ph: rnd(0, 6.28), a: rnd(.25, .6) }),
      step(p, dt) { p.x += p.v * dt * .3; if (p.x > 1.25) { p.x = -.2; p.y = rnd(.06, .42); } },
      draw(p, t) {
        const f = Math.sin(t * 3.4 + p.ph) * .55;
        ctx.strokeStyle = `rgba(20,28,40,${p.a})`; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        const x = p.x * W, y = p.y * H, s = p.s;
        ctx.beginPath();
        ctx.moveTo(x - s, y + f * s * .5); ctx.quadraticCurveTo(x - s * .4, y - s * .35, x, y);
        ctx.quadraticCurveTo(x + s * .4, y - s * .35, x + s, y + f * s * .5); ctx.stroke();
      }
    },
    sparks: {
      n: 80, make: () => ({ x: .5, y: .5, vx: rnd(-.6, .6), vy: rnd(-.7, .2), l: rnd(0, 1), s: rnd(.6, 2) }),
      step(p, dt) { p.l += dt * 1.1; p.x += p.vx * dt * .25; p.y += p.vy * dt * .25; p.vy += dt * .7; if (p.l > 1) { p.l = 0; p.x = rnd(.3, .7); p.y = rnd(.4, .7); p.vx = rnd(-.6, .6); p.vy = rnd(-.8, .1); } },
      draw(p) { const a = Math.max(0, 1 - p.l); ctx.fillStyle = `rgba(255,${180 + a * 60 | 0},110,${a})`; ctx.fillRect(p.x * W, p.y * H, p.s, p.s * 2.4); }
    }
  };

  function enable(names) {
    const want = new Set(names || []);
    for (const k of sets.keys()) if (!want.has(k)) { const s = sets.get(k); s.fade = 'out'; }
    for (const k of want) {
      if (!KIND[k]) continue;
      if (sets.has(k)) { sets.get(k).fade = 'in'; continue; }
      const def = KIND[k];
      sets.set(k, { def, fade: 'in', o: 0, ps: Array.from({ length: def.n }, def.make) });
    }
  }

  /* ---------------- one-shot overlays ---------------- */
  let speed = 0, speedDir = 0, impact = 0, rays = 0, shockR = -1;
  function speedlines(v = 1, dir = 0) { speed = v; speedDir = dir; }
  function godrays(v = 1) { rays = v; }
  function shock() { shockR = 0; }

  function drawSpeed(t) {
    if (speed <= .01) return;
    const n = 90; ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(speedDir);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.284 + t * .35;
      const r0 = W * (.16 + .1 * ((i * 37) % 10) / 10);
      const len = W * (.22 + .4 * (((i * 91) % 13) / 13)) * speed;
      const w = 1 + ((i * 7) % 3);
      ctx.strokeStyle = `rgba(255,255,255,${.10 + .3 * speed * (((i * 53) % 7) / 7)})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * .62);
      ctx.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len) * .62);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawRays(t) {
    if (rays <= .01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cx = W * .72, cy = -H * .12;
    for (let i = 0; i < 9; i++) {
      const a = -1.15 + i * .085 + Math.sin(t * .25 + i) * .01;
      const w = W * (.035 + .02 * Math.sin(i * 2.1));
      const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * H * 2, cy + Math.sin(a) * H * 2);
      g.addColorStop(0, `rgba(255,232,180,${.16 * rays})`);
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - .008) * H * 2.4 - w, cy + Math.sin(a - .008) * H * 2.4);
      ctx.lineTo(cx + Math.cos(a + .008) * H * 2.4 + w, cy + Math.sin(a + .008) * H * 2.4);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function drawShock() {
    if (shockR < 0) return;
    shockR += .022; if (shockR > 1) { shockR = -1; return; }
    const a = Math.max(0, 1 - shockR) ** 2;
    ctx.strokeStyle = `rgba(255,255,255,${a * .8})`; ctx.lineWidth = 2 + 10 * (1 - shockR);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, shockR * W * .8, 0, 6.284); ctx.stroke();
  }

  /* ---------------- loop ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    if (!ctx || W < 8) return;
    const dt = Math.min(.05, (now - last) / 1000) * 60 / 60; last = now;
    const t = now / 1000;
    ctx.clearRect(0, 0, W, H);

    for (const [k, s] of sets) {
      s.o += (s.fade === 'in' ? 1 : -1) * dt * 1.4;
      s.o = Math.max(0, Math.min(1, s.o));
      if (s.o <= 0 && s.fade === 'out') { sets.delete(k); continue; }
      ctx.globalAlpha = s.o;
      for (const p of s.ps) { s.def.step(p, dt * 60 / 60 * 1, t); s.def.draw(p, t); }
      ctx.globalAlpha = 1;
    }

    if (speed > 0) speed = Math.max(0, speed - dt * .9);
    rays += (rayTarget - rays) * Math.min(1, dt * 2.2);
    drawRays(t);
    drawSpeed(t);
    drawShock();
  }
  let rayTarget = 0;
  requestAnimationFrame(frame);

  function setRays(v) { rayTarget = v; }

  return { init, enable, speedlines, godrays: setRays, shock, resize };
})();
