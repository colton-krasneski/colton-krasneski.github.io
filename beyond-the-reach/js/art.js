/* ============================================================
   ART — every frame is generated SVG. No image assets.
   Scenes are one <svg viewBox="0 0 1600 900"> with <g data-z>
   groups the camera parallaxes independently.
   ============================================================ */
const Art = (() => {
  const W = 1600, H = 900;

  /* ---- seeded rng so a scene looks identical every time ---- */
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---- gradient helper ---- */
  let gid = 0;
  function lg(stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
    const id = 'g' + (++gid);
    return { id, def: `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>` };
  }
  function rg(stops, cx = .5, cy = .5, r = .5) {
    const id = 'g' + (++gid);
    return { id, def: `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>` };
  }

  /* ============================================================
     SCENE PRIMITIVES
     ============================================================ */
  function skyBand(defs, stops) {
    const g = lg(stops); defs.push(g.def);
    return `<rect x="-400" y="-300" width="2400" height="1500" fill="url(#${g.id})"/>`;
  }
  function sunDisc(defs, x, y, r, c1, c2, glow = 2.6) {
    const g = rg([[0, c1, 1], [.35, c1, .9], [1, c2, 0]]); defs.push(g.def);
    return `<circle cx="${x}" cy="${y}" r="${r * glow}" fill="url(#${g.id})"/>
            <circle cx="${x}" cy="${y}" r="${r}" fill="${c1}"/>`;
  }
  function clouds(defs, seed, y, h, col, op, n = 7, scale = 1) {
    const r = rng(seed); let s = '';
    for (let i = 0; i < n; i++) {
      const cx = r() * 1900 - 150, cy = y + (r() - .5) * h, w = (140 + r() * 300) * scale, hh = (16 + r() * 34) * scale;
      let d = `M${cx - w},${cy} `;
      const bumps = 3 + (r() * 3 | 0);
      for (let b = 0; b < bumps; b++) {
        const bw = (w * 2) / bumps, bx = cx - w + bw * b;
        d += `Q${bx + bw * .5},${cy - hh * (.6 + r() * 1.1)} ${bx + bw},${cy} `;
      }
      d += 'Z';
      s += `<path d="${d}" fill="${col}" opacity="${op * (.5 + r() * .6)}"/>`;
    }
    return s;
  }
  /* horizon sea with layered wave bands */
  function sea(defs, y, top, bot, seed, opt = {}) {
    const g = lg([[0, top], [1, bot]]); defs.push(g.def);
    let s = `<rect x="-400" y="${y}" width="2400" height="${1200 - y}" fill="url(#${g.id})"/>`;
    const r = rng(seed);
    const bands = opt.bands ?? 9;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const by = y + Math.pow(t, 1.7) * (H - y) * 1.15 + 6;
      const amp = 2 + t * 26, step = 60 + t * 150;
      let d = `M-400,${by} `;
      for (let x = -400; x < 2100; x += step) {
        d += `q${step / 2},${(r() - .5) * amp - amp * .5} ${step},0 `;
      }
      d += `L2100,${1200} L-400,1200 Z`;
      const col = opt.crest || '#ffffff';
      s += `<path d="${d}" fill="${col}" opacity="${(opt.foam ?? .07) * (1 - t * .55)}"/>`;
    }
    if (opt.glint) {
      const gr = rng(seed + 77);
      for (let i = 0; i < 60; i++) {
        const t = gr(), by = y + Math.pow(t, 2) * (H - y) * 1.1 + 8;
        const bx = opt.glintX ? opt.glintX + (gr() - .5) * (200 + t * 900) : gr() * 1600;
        s += `<rect x="${bx}" y="${by}" width="${8 + t * 60}" height="${1 + t * 3}" rx="1.5" fill="${opt.glint}" opacity="${.12 + gr() * .5}"/>`;
      }
    }
    return s;
  }
  /* THE REACH — a standing wall of pale light on the horizon.
     Everything lives inside a clipped, wave-topped band so it reads as one
     coherent curtain rather than a scatter of bars. */
  function reachWall(defs, y, h, seed, bright = 1) {
    const g = lg([[0, '#eafff6', 0], [.30, '#a8f0dd', .30 * bright],
                  [.70, '#7fe6cf', .62 * bright], [1, '#f2fffb', .88 * bright]], 0, 0, 0, 1);
    defs.push(g.def);
    const cid = 'rc' + (++gid);
    const r = rng(seed);

    let band = `M-400,${y} L-400,${y - h * .78} `;
    for (let x = -400; x < 2100; x += 100) band += `q50,${(r() - .5) * h * .2} 100,${(r() - .5) * h * .07} `;
    band += `L2100,${y + 6} Z`;

    // striations run the full height of the band and fade out upward, so no
    // hard rectangle tops turn the curtain into a bar chart
    const col = lg([[0, '#eafff8', 0], [.55, '#eafff8', .55], [1, '#ffffff', 1]], 0, 0, 0, 1);
    defs.push(col.def);
    let cols = '';
    for (let i = 0; i < 84; i++) {
      const x = -400 + i * 31 + (r() - .5) * 20, w = 3 + r() * 14;
      cols += `<rect x="${x}" y="${y - h}" width="${w}" height="${h + 8}" fill="url(#${col.id})" opacity="${.04 + r() * .10}"/>`;
    }
    const glow = lg([[0, '#7fe6cf', 0], [1, '#d8fff4', .5 * bright]], 0, 0, 0, 1); defs.push(glow.def);

    return `<clipPath id="${cid}"><path d="${band}"/></clipPath>
      <g clip-path="url(#${cid})">
        <path d="${band}" fill="url(#${g.id})"/>
        ${cols}
        <rect x="-400" y="${y - h * .16}" width="2400" height="${h * .16 + 8}" fill="url(#${glow.id})"/>
      </g>
      <rect x="-400" y="${y - 3}" width="2400" height="6" fill="#f4fffc" opacity="${.72 * bright}"/>`;
  }
  /* ship silhouette: hull + masts + sails */
  function ship(x, y, s, col, opt = {}) {
    const sail = opt.sail || '#f2e7d2', dark = opt.dark || col;
    const masts = opt.masts ?? 3;
    let m = '';
    for (let i = 0; i < masts; i++) {
      const mx = (i - (masts - 1) / 2) * 46;
      const mh = 190 - Math.abs(i - (masts - 1) / 2) * 22;
      m += `<rect x="${mx - 2.5}" y="${-mh}" width="5" height="${mh}" fill="${dark}"/>`;
      if (!opt.bare) {
        for (let k = 0; k < 2; k++) {
          const sy = -mh + 22 + k * (mh * .44), sh = mh * .38, sw = 34 - k * 5;
          m += `<path d="M${mx - sw},${sy} L${mx + sw},${sy} Q${mx + sw * (opt.full ? 1.5 : 1.05)},${sy + sh * .5} ${mx + sw * .8},${sy + sh} L${mx - sw * .8},${sy + sh} Q${mx - sw * (opt.full ? .5 : .9)},${sy + sh * .5} ${mx - sw},${sy} Z"
                fill="${sail}" opacity="${opt.sailOp ?? .92}"/>`;
        }
      }
    }
    const flag = opt.flag ? `<g transform="translate(0,${-206})">
        <path d="M2,0 L64,10 L58,22 L66,34 L2,30 Z" fill="${opt.flag}"/>
        ${opt.skull ? `<g transform="translate(22,9) scale(.5)" fill="#fff"><circle cx="10" cy="8" r="8"/><rect x="4" y="14" width="12" height="7" rx="2"/><rect x="-4" y="20" width="28" height="3" rx="1.5" transform="rotate(12 10 21)"/></g>` : ''}
      </g>` : '';
    return `<g transform="translate(${x},${y}) scale(${s})">
      ${m}${flag}
      <path d="M-108,0 L108,0 L86,40 Q0,58 -86,40 Z" fill="${col}"/>
      <path d="M-108,0 L108,0 L104,10 L-104,10 Z" fill="${dark}" opacity=".55"/>
      <path d="M108,0 L150,-16 L112,-2 Z" fill="${dark}"/>
    </g>`;
  }
  /* rooftop skyline for the port town */
  function town(seed, baseY, col, opt = {}) {
    const r = rng(seed); let s = '', x = -160;
    const n = opt.n ?? 26;
    for (let i = 0; i < n; i++) {
      const w = 60 + r() * 110, h = 70 + r() * 170;
      const y = baseY - h;
      const roof = r() > .5;
      s += `<g>`;
      if (roof) s += `<path d="M${x - 8},${y} L${x + w / 2},${y - 34 - r() * 26} L${x + w + 8},${y} Z" fill="${col}"/>`;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h + 30}" fill="${col}"/>`;
      if (opt.windows) {
        const wr = 1 + (r() * 2 | 0), wc = 1 + (r() * 2 | 0);
        for (let a = 0; a < wr; a++) for (let b = 0; b < wc; b++) {
          if (r() > (opt.lit ?? .5)) continue;
          s += `<rect x="${x + 12 + b * (w / (wc + .4))}" y="${y + 22 + a * 42}" width="${13 + r() * 8}" height="${17}" fill="${opt.windows}" opacity="${.45 + r() * .55}"/>`;
        }
      }
      if (r() > .72) s += `<rect x="${x + w * .6}" y="${y - 40}" width="12" height="42" fill="${col}"/>`;
      s += `</g>`;
      x += w + 6 + r() * 26;
      if (x > 1800) break;
    }
    return s;
  }
  function dock(y, col, seed, opt = {}) {
    const r = rng(seed); let s = `<rect x="-300" y="${y}" width="2200" height="${opt.thick || 26}" fill="${col}"/>`;
    for (let x = -240; x < 1900; x += 96 + r() * 40) {
      s += `<rect x="${x}" y="${y + (opt.thick || 26)}" width="${13 + r() * 6}" height="${300}" fill="${col}" opacity=".92"/>`;
      s += `<rect x="${x - 12}" y="${y + 60 + r() * 60}" width="${40}" height="7" fill="${col}" opacity=".7" transform="rotate(${(r() - .5) * 22} ${x} ${y + 70})"/>`;
    }
    return s;
  }
  function crane(x, y, s, col) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <rect x="-16" y="-300" width="32" height="300" fill="${col}"/>
      <path d="M-16,-300 L-16,-268 L-230,-198 L-230,-228 Z" fill="${col}"/>
      <path d="M16,-300 L16,-268 L150,-232 L150,-262 Z" fill="${col}"/>
      <rect x="-236" y="-232" width="34" height="72" fill="${col}"/>
      <line x1="-214" y1="-160" x2="-214" y2="-52" stroke="${col}" stroke-width="4"/>
      <rect x="-244" y="-52" width="62" height="46" rx="5" fill="${col}"/>
      <path d="M-60,-40 L60,-40 L44,0 L-44,0 Z" fill="${col}"/>
    </g>`;
  }
  function lighthouse(x, y, s, col, lit) {
    return `<g transform="translate(${x},${y}) scale(${s})">
      <path d="M-46,0 L-30,-250 L30,-250 L46,0 Z" fill="${col}"/>
      <rect x="-38" y="-270" width="76" height="24" fill="${col}"/>
      <rect x="-27" y="-318" width="54" height="50" fill="${col}"/>
      <path d="M-34,-318 L0,-352 L34,-318 Z" fill="${col}"/>
      ${lit ? `<circle cx="0" cy="-293" r="96" fill="${lit}" opacity=".07"/>
      <circle cx="0" cy="-293" r="52" fill="${lit}" opacity=".16"/>
      <rect x="-21" y="-312" width="42" height="38" fill="${lit}" opacity=".95"/>
      <path d="M18,-300 L520,-380 L520,-208 Z" fill="${lit}" opacity=".13"/>` : ''}
    </g>`;
  }
  function cliff(defs, seed, side, baseY, col) {
    const r = rng(seed); const dir = side === 'l' ? 1 : -1; const x0 = side === 'l' ? -200 : 1800;
    let d = `M${x0},${1000} L${x0},${baseY - 240 - r() * 120} `;
    let x = x0, y = baseY - 260;
    for (let i = 0; i < 9; i++) { x += dir * (60 + r() * 110); y += (r() - .25) * 90; d += `L${x},${y} `; }
    d += `L${x},1000 Z`;
    return `<path d="${d}" fill="${col}"/>`;
  }
  function rain(op, seed, col = '#cfe6ff') {
    const r = rng(seed); let s = '';
    for (let i = 0; i < 160; i++) {
      const x = r() * 2000 - 200, y = r() * 1100 - 100, l = 26 + r() * 60;
      s += `<line x1="${x}" y1="${y}" x2="${x - l * .22}" y2="${y - l}" stroke="${col}" stroke-width="1.4" opacity="${op * (.2 + r() * .8)}"/>`;
    }
    return s;
  }
  function interiorBeams(col, op = .3) {
    let s = '';
    for (let i = 0; i < 5; i++) s += `<rect x="${-100 + i * 380}" y="-40" width="46" height="1000" fill="${col}" opacity="${op}"/>`;
    return s;
  }

  /* ============================================================
     SCENES
     ============================================================ */
  const SCENES = {

    /* ---------- COLD OPEN ---------- */
    void: () => ({ grade: 'none', amb: [], layers: [[0, `<rect width="1600" height="900" fill="#04060a"/>`]] }),

    reach_dawn: () => { const d = [];
      return { grade: 'cool', amb: ['sea', 'wind'], fx: ['snowfoam'], layers: [
        [.05, skyBand(d, [[0, '#070f1c'], [.44, '#1b3348'], [.74, '#3a5c70'], [1, '#5f8592']]) + clouds(d, 3, 250, 160, '#2c4457', .6, 8)],
        [.22, reachWall(d, 545, 205, 11)],
        [.55, sea(d, 545, '#2b6b74', '#0a2430', 21, { glint: '#bff5e6', foam: .09 })],
        [1, `<g opacity=".9">${ship(1250, 640, .5, '#0a1a22', { sail: '#8fb4bd', sailOp: .5 })}</g>`]
      ], defs: d } },

    reach_night: () => { const d = [];
      return { grade: 'cool', amb: ['sea', 'wind'], fx: ['spray'], layers: [
        [.05, skyBand(d, [[0, '#03060c'], [.5, '#08131f'], [1, '#0d2430']]) + stars(d, 9)],
        [.2, reachWall(d, 560, 250, 5, 1.15)],
        [.6, sea(d, 560, '#0d3a44', '#04121a', 31, { glint: '#9fffe0', foam: .1 })]
      ], defs: d } },

    storm_sea: () => { const d = [];
      return { grade: 'cold', amb: ['sea', 'wind', 'rain'], fx: ['rain', 'spray'], layers: [
        [.05, skyBand(d, [[0, '#05070e'], [.55, '#131c2c'], [1, '#28394b']]) + clouds(d, 12, 190, 240, '#0a1018', .85, 11, 1.5)],
        [.35, `<g opacity=".85">${ship(1180, 520, .62, '#05090e', { sail: '#1b2634', full: 1, flag: '#0a0d12' })}</g>`],
        [.75, sea(d, 520, '#16323f', '#040b12', 41, { foam: .16, bands: 12 })],
        [1, rain(.4, 51)]
      ], defs: d } },

    burning_ship: () => { const d = [];
      const fire = rg([[0, '#fff3c0', .95], [.35, '#ff9a2e', .8], [1, '#8c1c05', 0]]); d.push(fire.def);
      return { grade: 'fire', amb: ['sea', 'fire', 'wind'], fx: ['embers', 'rain', 'ash'], layers: [
        [.05, skyBand(d, [[0, '#0a0a12'], [.6, '#2a1a1c'], [1, '#5e2a16']]) + clouds(d, 22, 200, 200, '#12080a', .8, 9, 1.6)],
        [.3, `<circle cx="860" cy="430" r="420" fill="url(#${fire.id})" opacity=".55"/>`],
        [.5, `<g>${ship(860, 560, 1.15, '#0b0507', { sail: '#3a1a10', flag: '#0b0507', full: 1 })}</g>
              <ellipse cx="860" cy="470" rx="240" ry="150" fill="url(#${fire.id})" opacity=".8"/>`],
        [.9, sea(d, 585, '#3a2016', '#0a0507', 61, { glint: '#ffb45e', foam: .1 })],
        [1, rain(.32, 71, '#ffd9a8')]
      ], defs: d } },

    rocks_night: () => { const d = [];
      return { grade: 'cold', amb: ['surf', 'rain', 'wind'], fx: ['rain', 'spray'], layers: [
        [.05, skyBand(d, [[0, '#04060d'], [.6, '#0c1522'], [1, '#22303f']]) + clouds(d, 32, 200, 180, '#070b12', .8, 8, 1.4)],
        [.15, `<g opacity=".55">${lighthouse(1360, 470, .9, '#070c14', '#ffcf7a')}</g>`],
        [.35, `<ellipse cx="700" cy="470" rx="330" ry="90" fill="#ff8a2e" opacity=".14"/>`],
        [.7, sea(d, 470, '#12303c', '#050d14', 81, { foam: .14 })],
        [.95, `<path d="M-200,900 L-100,660 L180,600 L420,690 L640,640 L900,720 L1150,660 L1500,730 L1900,650 L1900,900 Z" fill="#060a11"/>
               <path d="M-200,900 L-100,672 L180,612 L420,700 L640,652 L900,730 L1150,672 L1500,742 L1900,662 L1900,700 L-200,760 Z" fill="#16222e" opacity=".5"/>`],
        [1, rain(.42, 91)]
      ], defs: d } },

    rocks_lanterns: () => { const d = [];
      let lan = '';
      for (let i = 0; i < 6; i++) {
        const x = 1080 + i * 92, y = 604 - (i % 2) * 12;
        const g = rg([[0, '#ffdf9a', .9], [1, '#ff9a2e', 0]]); d.push(g.def);
        lan += `<circle cx="${x}" cy="${y}" r="58" fill="url(#${g.id})" opacity=".55"/><circle cx="${x}" cy="${y}" r="7" fill="#ffe9b8"/>`;
        lan += `<path d="M${x - 16},${y + 14} q16,-8 32,0 l10,86 q-26,10 -52,0 Z" fill="#060a11" opacity=".9"/>`;
      }
      return { grade: 'cold', amb: ['surf', 'rain', 'wind'], fx: ['rain'], layers: [
        [.05, skyBand(d, [[0, '#04060d'], [.6, '#0c1522'], [1, '#1e2b39']])],
        [.7, sea(d, 470, '#12303c', '#050d14', 82, { foam: .1 })],
        [.95, `<path d="M-200,900 L-100,660 L180,600 L420,690 L640,640 L900,720 L1150,660 L1500,730 L1900,650 L1900,900 Z" fill="#060a11"/>` + lan],
        [1, rain(.4, 92)]
      ], defs: d } },

    /* ---------- SALTMARROW ---------- */
    saltmarrow_dawn: () => { const d = [];
      return { grade: 'warm', amb: ['surf', 'wind'], fx: ['gulls', 'dust'], rays: .9, layers: [
        [.04, skyBand(d, [[0, '#1d2f4d'], [.34, '#7a5b6e'], [.62, '#e08a52'], [.86, '#ffc47a'], [1, '#ffe8bd']])],
        [.08, sunDisc(d, 1180, 470, 62, '#fff3cd', '#ff9a3d', 4)],
        [.12, clouds(d, 101, 250, 130, '#ff9e63', .45, 9, 1.2) + clouds(d, 102, 340, 90, '#ffd7a0', .35, 6)],
        [.24, reachWall(d, 500, 105, 13, .45)],
        [.42, sea(d, 500, '#8a6a55', '#2c2231', 111, { glint: '#ffd9a0', glintX: 1180, foam: .06 })],
        [.6, `<g opacity=".95">${town(121, 620, '#2a1e2b', { windows: '#ffbe6a', lit: .55 })}</g>`],
        [.78, `${lighthouse(210, 620, 1.05, '#1b1220', '#ffd98a')}${crane(1330, 640, 1, '#1b1220')}`],
        [.9, dock(640, '#160e1a', 131) + `<g opacity=".9">${ship(520, 636, .42, '#150d19', { sail: '#3b2a33', sailOp: .8, masts: 2 })}${ship(900, 646, .36, '#150d19', { sail: '#3b2a33', sailOp: .8, masts: 2 })}</g>`],
        [1, `<rect x="-200" y="770" width="2000" height="260" fill="#0d0812"/>`]
      ], defs: d } },

    docks_day: () => { const d = [];
      return { grade: 'bright', amb: ['surf', 'crowd'], fx: ['gulls', 'dust'], rays: .5, layers: [
        [.05, skyBand(d, [[0, '#4b93c4'], [.55, '#9fd0e4'], [1, '#dff0f2']]) + clouds(d, 141, 220, 140, '#ffffff', .5, 8)],
        [.3, sea(d, 470, '#3d8ea0', '#164854', 151, { glint: '#ffffff', foam: .1 })],
        [.5, `<g opacity=".9">${ship(240, 560, .5, '#233442', { sail: '#e8dcc4', masts: 2 })}${ship(1310, 578, .55, '#233442', { sail: '#e8dcc4' })}</g>`],
        [.72, dock(600, '#4a3626', 161, { thick: 34 })],
        [.85, `${crane(1180, 600, 1.05, '#3a2a1e')}
               <g fill="#5c4430">
                 <rect x="120" y="500" width="110" height="100" rx="6"/><rect x="150" y="470" width="70" height="34" rx="5"/>
                 <rect x="640" y="520" width="90" height="80" rx="6"/><rect x="760" y="540" width="70" height="60" rx="6"/>
                 <ellipse cx="420" cy="588" rx="46" ry="14"/><rect x="374" y="524" width="92" height="66" rx="8"/>
               </g>`],
        [1, `<rect x="-200" y="634" width="2000" height="330" fill="#2c1f16"/>` + `<g opacity=".25">${dock(660, '#1a120c', 171, { thick: 10 })}</g>`]
      ], defs: d } },

    market_day: () => { const d = [];
      let awn = '';
      const r = rng(181);
      const cols = ['#c8452f', '#2f7a6a', '#c98a2a', '#5b4b8a'];
      for (let i = 0; i < 7; i++) {
        const x = -60 + i * 260, y = 380 + (r() - .5) * 40, c = cols[i % 4];
        awn += `<path d="M${x},${y} L${x + 230},${y} L${x + 250},${y + 60} L${x - 20},${y + 60} Z" fill="${c}"/>
                <path d="M${x - 20},${y + 60} l30,0 l0,26 l-30,0 Z M${x + 40},${y + 60} l30,0 l0,26 l-30,0 Z M${x + 100},${y + 60} l30,0 l0,26 l-30,0 Z M${x + 160},${y + 60} l30,0 l0,26 l-30,0 Z M${x + 220},${y + 60} l30,0 l0,26 l-30,0 Z" fill="${c}" opacity=".8"/>
                <rect x="${x - 6}" y="${y + 60}" width="9" height="200" fill="#4a3524"/>
                <rect x="${x + 232}" y="${y + 60}" width="9" height="200" fill="#4a3524"/>`;
      }
      return { grade: 'bright', amb: ['crowd'], fx: ['dust'], rays: .7, layers: [
        [.05, skyBand(d, [[0, '#6fb0d0'], [1, '#dfeef0']])],
        [.25, `<g opacity=".9">${town(191, 470, '#8a7359', { windows: '#3a2c1e', lit: .3 })}</g>`],
        [.45, `<g opacity=".95">${town(192, 520, '#6b563f', { windows: '#2a1e14', lit: .35 })}</g>`],
        [.7, awn],
        [.9, `<rect x="-200" y="700" width="2000" height="300" fill="#5b4732"/>
              <g opacity=".18">${Array.from({ length: 40 }, (_, i) => `<rect x="${-100 + i * 48}" y="700" width="42" height="300" fill="#3a2c1e"/>`).join('')}</g>`],
        [1, `<g fill="#3a2c1e" opacity=".85">${Array.from({ length: 9 }, (_, i) => { const x = i * 190 + 40; return `<ellipse cx="${x}" cy="820" rx="46" ry="120"/>` }).join('')}</g>`]
      ], defs: d } },

    square_tithe: () => { const d = [];
      return { grade: 'bleach', amb: ['crowd', 'wind'], fx: ['dust'], rays: 1, layers: [
        [.05, skyBand(d, [[0, '#adc9dd'], [.6, '#d9e6ee'], [1, '#f2f6f8']])],
        [.18, `<g opacity=".5">${town(201, 500, '#9fb0bf', {})}</g>`],
        [.4, `<g transform="translate(1080,0)">${ship(300, 470, 1.35, '#e9eef5', { sail: '#ffffff', dark: '#c3ceda', flag: '#2b3f5c', full: 1 })}</g>`],
        [.7, `<g opacity=".95">${town(202, 600, '#7c8a99', { windows: '#33404f', lit: .25 })}</g>`],
        [.88, `<rect x="-200" y="690" width="2000" height="310" fill="#8b9099"/>
               <rect x="-200" y="690" width="2000" height="12" fill="#a8afb8"/>
               <g fill="#e9eef5">
                 <rect x="700" y="560" width="200" height="130" rx="4"/>
                 <rect x="676" y="546" width="248" height="20" rx="4"/>
               </g>`],
        [1, `<g fill="#2b3341" opacity=".9">${Array.from({ length: 14 }, (_, i) => { const x = i * 128 + 20 + (i % 3) * 18; return `<ellipse cx="${x}" cy="840" rx="42" ry="118"/><circle cx="${x}" cy="716" r="30"/>` }).join('')}</g>`]
      ], defs: d } },

    sanctity_hull: () => { const d = [];
      return { grade: 'bleach', amb: ['sea', 'wind'], fx: ['gulls'], rays: 1.1, layers: [
        [.05, skyBand(d, [[0, '#9dbdd4'], [1, '#eef4f7']])],
        [.3, `<g fill="#f4f7fa">
                <path d="M-100,900 L-100,240 L1100,120 L1400,300 L1400,900 Z"/>
              </g>
              <g fill="#cfd9e4">
                <path d="M-100,900 L-100,300 L1100,190 L1400,350 L1400,900 Z" opacity=".55"/>
                ${Array.from({ length: 12 }, (_, i) => `<rect x="${-60 + i * 110}" y="${430 - i * 8}" width="60" height="44" rx="4" fill="#3d4d61"/>`).join('')}
                ${Array.from({ length: 12 }, (_, i) => `<rect x="${-40 + i * 110}" y="${560 - i * 8}" width="26" height="26" rx="13" fill="#2a3547"/>`).join('')}
              </g>
              <g fill="#2b3f5c" opacity=".9"><path d="M1120,130 L1360,70 L1350,300 L1120,250 Z" opacity=".25"/></g>`],
        [.8, sea(d, 700, '#4d8ea0', '#1b4a58', 211, { glint: '#ffffff', foam: .12 })]
      ], defs: d } },

    seacave: () => { const d = [];
      const glow = rg([[0, '#7ff0d8', .55], [1, '#0a3a3f', 0]]); d.push(glow.def);
      return { grade: 'cool', amb: ['surf', 'room'], fx: ['fireflies', 'dust'], layers: [
        [.05, `<rect width="1600" height="900" fill="#05171c"/>
               <ellipse cx="1150" cy="520" rx="360" ry="260" fill="url(#${glow.id})"/>`],
        [.25, `<path d="M900,900 L960,470 L1120,380 L1330,430 L1420,900 Z" fill="#7fe6cf" opacity=".35"/>
               <path d="M930,900 L980,500 L1120,420 L1300,470 L1380,900 Z" fill="#c6fff0" opacity=".22"/>`],
        [.55, sea(d, 700, '#0e4a4e', '#04171c', 221, { glint: '#8ff5dd', foam: .08 })],
        [.85, `<path d="M-100,-100 L-100,900 L240,900 L300,560 L180,300 L340,80 L120,-100 Z" fill="#031014"/>
               <path d="M1700,-100 L1700,900 L1380,900 L1330,600 L1470,340 L1300,60 L1560,-100 Z" fill="#031014"/>
               <path d="M-200,-100 L1800,-100 L1800,60 Q1200,200 800,120 Q400,40 -200,150 Z" fill="#031014"/>`],
        [1, `<g fill="#02090c">${Array.from({ length: 9 }, (_, i) => { const x = 60 + i * 190; return `<path d="M${x},-60 l26,0 l-13,${120 + (i % 3) * 70} Z"/>` }).join('')}</g>`]
      ], defs: d } },

    harbor_night: () => { const d = [];
      return { grade: 'night', amb: ['surf', 'wind'], fx: ['ash', 'fireflies'], layers: [
        [.04, skyBand(d, [[0, '#040711'], [.5, '#0a1526'], [1, '#1b2c44']]) + stars(d, 231)],
        [.08, `<circle cx="330" cy="180" r="52" fill="#f2ead2" opacity=".9"/><circle cx="330" cy="180" r="120" fill="#c9d8ff" opacity=".08"/>`],
        [.3, sea(d, 520, '#0d2a42', '#040c16', 241, { glint: '#9fc4ff', glintX: 330, foam: .05 })],
        [.5, `<g opacity=".95">${ship(1120, 596, .62, '#050a12', { sail: '#101a26', sailOp: .8, flag: '#05080d', skull: 1, masts: 3 })}</g>`],
        [.72, `<g>${town(251, 650, '#070d18', { windows: '#ffb454', lit: .42 })}</g>`],
        [.86, `${lighthouse(140, 660, 1.1, '#050910', '#ffd98a')}${crane(1400, 690, 1.1, '#050910')}`],
        [1, dock(690, '#04080e', 261, { thick: 30 }) + `<g opacity=".8">${Array.from({ length: 7 }, (_, i) => { const x = 90 + i * 230; const g = rg([[0, '#ffcf7a', .8], [1, '#ff8a2e', 0]]); d.push(g.def); return `<circle cx="${x}" cy="640" r="64" fill="url(#${g.id})"/><rect x="${x - 5}" y="640" width="10" height="52" fill="#04080e"/>` }).join('')}</g>`]
      ], defs: d } },

    tavern: () => { const d = [];
      const warm = rg([[0, '#ffb44e', .55], [1, '#2a1206', 0]]); d.push(warm.def);
      return { grade: 'warm', amb: ['crowd', 'fire', 'room'], fx: ['dust', 'embers'], layers: [
        [.05, `<rect width="1600" height="900" fill="#1a0f0a"/>` + interiorBeams('#3a2314', .5)],
        [.2, `<ellipse cx="220" cy="520" rx="300" ry="260" fill="url(#${warm.id})"/>
              <path d="M60,660 L60,470 L300,470 L300,660 Z" fill="#0d0704"/>
              <path d="M90,660 q60,-140 120,0 Z" fill="#ff8a2e" opacity=".85"/>
              <path d="M115,660 q45,-100 90,0 Z" fill="#ffd77a" opacity=".9"/>`],
        [.42, `<g fill="#2e1b0f">
                 <rect x="520" y="300" width="1000" height="26" rx="6"/>
                 ${Array.from({ length: 7 }, (_, i) => `<rect x="${560 + i * 130}" y="240" width="70" height="60" rx="6" fill="#4a2c17"/>`).join('')}
               </g>
               <g opacity=".8">${Array.from({ length: 5 }, (_, i) => { const x = 420 + i * 260; const g = rg([[0, '#ffcf7a', .7], [1, '#ff7a2e', 0]]); d.push(g.def); return `<circle cx="${x}" cy="190" r="90" fill="url(#${g.id})"/><rect x="${x - 3}" y="0" width="6" height="160" fill="#241309"/><path d="M${x - 26},160 l52,0 l-10,40 l-32,0 Z" fill="#3a2314"/>` }).join('')}</g>`],
        [.75, `<g fill="#25150c">
                 <rect x="-100" y="640" width="620" height="30" rx="6"/><rect x="20" y="670" width="26" height="180"/><rect x="400" y="670" width="26" height="180"/>
                 <rect x="1080" y="620" width="700" height="28" rx="6"/><rect x="1180" y="648" width="24" height="200"/><rect x="1600" y="648" width="24" height="200"/>
               </g>`],
        [1, `<rect x="-200" y="820" width="2000" height="200" fill="#150c07"/>
             <g fill="#0d0704" opacity=".92">${Array.from({ length: 6 }, (_, i) => { const x = 120 + i * 290; return `<ellipse cx="${x}" cy="880" rx="80" ry="150"/><circle cx="${x}" cy="720" r="52"/>` }).join('')}</g>`]
      ], defs: d } },

    tavern_raid: () => { const s = SCENES.tavern(); s.grade = 'cold'; s.fx = ['dust', 'sparks'];
      s.layers.push([1, `<rect width="1600" height="900" fill="#8fbfe0" opacity=".16"/>
        <path d="M1100,0 L1600,0 L1600,900 L980,900 Z" fill="#cfe6ff" opacity=".2"/>`]);
      return s; },

    roofs_night: () => { const d = [];
      return { grade: 'night', amb: ['wind', 'surf'], fx: ['ash'], layers: [
        [.04, skyBand(d, [[0, '#03060f'], [.55, '#0b1728'], [1, '#233a55']]) + stars(d, 271)],
        [.08, `<circle cx="1220" cy="150" r="60" fill="#f4ecd4" opacity=".92"/><circle cx="1220" cy="150" r="150" fill="#cfe0ff" opacity=".07"/>`],
        [.28, `<g opacity=".7">${town(281, 620, '#0a1220', { windows: '#ffb454', lit: .35 })}</g>`],
        [.62, `<g>${town(282, 760, '#060c16', { windows: '#ffc46a', lit: .45 })}</g>`],
        [1, `<path d="M-200,900 L-200,700 L280,560 L760,700 L1180,540 L1700,690 L1700,900 Z" fill="#03070d"/>
             <path d="M-200,706 L280,566 L760,706 L1180,546 L1700,696" stroke="#2b415e" stroke-width="6" fill="none" opacity=".7"/>
             <g stroke="#0a1220" stroke-width="4" fill="none" opacity=".9">
               <path d="M-100,520 Q400,590 900,470 Q1300,380 1700,470"/>
               <path d="M-100,600 Q500,660 1000,560"/>
             </g>`]
      ], defs: d } },

    dock_confront: () => { const d = [];
      return { grade: 'night', amb: ['surf', 'wind', 'crowd'], fx: ['ash', 'embers'], layers: [
        [.04, skyBand(d, [[0, '#04070f'], [.5, '#0c1828'], [1, '#2b3448']]) + stars(d, 291)],
        [.2, `<g opacity=".8">${ship(1280, 470, .95, '#e9eef5', { sail: '#ffffff', dark: '#b9c5d3', flag: '#2b3f5c', full: 1, sailOp: .85 })}</g>`],
        [.42, `<g opacity=".97">${ship(330, 520, .8, '#070d16', { sail: '#16202e', sailOp: .9, flag: '#05080d', skull: 1 })}</g>`],
        [.66, sea(d, 560, '#0c2637', '#04101a', 301, { glint: '#8fb8ff', foam: .07 })],
        [.88, dock(660, '#050a12', 311, { thick: 34 }) +
          `<g opacity=".85">${Array.from({ length: 6 }, (_, i) => { const x = 130 + i * 270; const g = rg([[0, '#ffcf7a', .85], [1, '#ff8a2e', 0]]); d.push(g.def); return `<circle cx="${x}" cy="600" r="70" fill="url(#${g.id})"/>` }).join('')}</g>`],
        [1, `<rect x="-200" y="694" width="2000" height="300" fill="#03070d"/>
             <g stroke="#1a2637" stroke-width="9" fill="none" opacity=".9"><path d="M-100,640 Q800,590 1700,640"/></g>`]
      ], defs: d } },

    crane_top: () => { const d = [];
      return { grade: 'night', amb: ['wind', 'surf'], fx: ['ash', 'sparks'], layers: [
        [.04, skyBand(d, [[0, '#03060e'], [.6, '#0a1626'], [1, '#1c3048']]) + stars(d, 321)],
        [.3, `<g opacity=".7">${ship(1180, 700, .8, '#e9eef5', { sail: '#f4f7fa', dark: '#c3ceda', full: 1, sailOp: .8 })}</g>`],
        [.6, sea(d, 720, '#0b2334', '#040e18', 331, { foam: .06 })],
        [1, `<g transform="translate(700,880) scale(2.4)">${crane(0, 0, 1, '#050a12')}</g>
             <g fill="#0a121e" opacity=".9"><rect x="-200" y="700" width="300" height="400"/></g>`]
      ], defs: d } },

    gull_deck: () => { const d = [];
      return { grade: 'night', amb: ['sea', 'wind'], fx: ['spray', 'embers'], layers: [
        [.04, skyBand(d, [[0, '#04070f'], [.5, '#0c1a2c'], [1, '#2b4258']]) + stars(d, 341)],
        [.1, `<circle cx="1300" cy="228" r="58" fill="#f4ecd4" opacity=".9"/>
              <circle cx="1300" cy="228" r="170" fill="#c9d8ff" opacity=".06"/>`],
        [.4, sea(d, 470, '#0d2a3e', '#04101a', 351, { glint: '#9fc4ff', glintX: 1300, foam: .09 })],
        [.7, `<g fill="#0a1220">
                <path d="M-200,560 L1800,560 L1800,900 L-200,900 Z"/>
              </g>
              <g fill="#141f30">${Array.from({ length: 22 }, (_, i) => `<rect x="${-160 + i * 84}" y="562" width="72" height="340"/>`).join('')}</g>`],
        [.9, `<g stroke="#0a1220" stroke-width="7" fill="none" opacity=".95">
                <path d="M120,-100 L300,600"/><path d="M300,-100 L360,600"/><path d="M1480,-100 L1280,600"/><path d="M1300,-100 L1240,600"/>
              </g>
              <rect x="740" y="-200" width="34" height="800" fill="#0d1626"/>`],
        [1, `<rect x="-200" y="530" width="2000" height="26" fill="#1c2b40"/>
             <rect x="-200" y="530" width="2000" height="7" fill="#54708f" opacity=".55"/>`]
      ], defs: d } },

    gull_deck_flag: () => { const s = SCENES.gull_deck();
      const d = s.defs;
      // a black flag at night needs something behind it or it is just night
      const halo = rg([[0, '#ffcf8a', .40], [.45, '#c88a4a', .16], [1, '#0a1220', 0]]); d.push(halo.def);
      s.layers.push([.95, `<g transform="translate(700,565)">
          <ellipse cx="210" cy="-186" rx="440" ry="300" fill="url(#${halo.id})"/>
          <rect x="-10" y="-560" width="20" height="900" fill="#0d1626"/>
          <path d="M10,-300 L404,-266 L384,-186 L412,-104 L10,-70 Z" fill="#0a1119"/>
          <path d="M10,-300 L404,-266 L384,-186 L412,-104 L10,-70 Z" fill="none" stroke="#41556f" stroke-width="3"/>
          <path d="M10,-300 L404,-266 L400,-242 L10,-274 Z" fill="#26364f"/>
          <g transform="translate(148,-232) scale(2.15)" fill="#f2ead2">
            <circle cx="12" cy="10" r="15"/>
            <rect x="2" y="22" width="20" height="13" rx="4"/>
            <rect x="-17" y="35" width="58" height="5" rx="2.5" transform="rotate(11 12 37)"/>
            <rect x="-17" y="35" width="58" height="5" rx="2.5" transform="rotate(-11 12 37)"/>
            <circle cx="6" cy="8" r="3.9" fill="#05080d"/><circle cx="18" cy="8" r="3.9" fill="#05080d"/>
            <rect x="8" y="15" width="2.4" height="5.5" fill="#05080d"/>
            <rect x="13.6" y="15" width="2.4" height="5.5" fill="#05080d"/>
          </g>
          <path d="M10,-300 L404,-266" stroke="#ffb45e" stroke-width="3.5" opacity=".55" fill="none"/>
          <path d="M10,-70 L412,-104" stroke="#ffb45e" stroke-width="2.5" opacity=".28" fill="none"/>
        </g>`]);
      return s; },

    open_sea_dawn: () => { const d = [];
      return { grade: 'warm', amb: ['sea', 'wind'], fx: ['spray', 'gulls'], rays: 1, layers: [
        [.04, skyBand(d, [[0, '#26385c'], [.4, '#8a6a7c'], [.7, '#e79a5c'], [1, '#ffdca6']])],
        [.08, sunDisc(d, 820, 480, 74, '#fff6d8', '#ff9a3d', 4.2)],
        [.2, reachWall(d, 500, 150, 361, .6)],
        [.5, sea(d, 500, '#7c6a62', '#241f30', 371, { glint: '#ffd9a0', glintX: 820, foam: .09 })],
        [.85, `<g opacity=".98">${ship(560, 700, 1.1, '#120c18', { sail: '#f0dcbc', flag: '#0d0812', skull: 1, full: 1 })}</g>`]
      ], defs: d } },

    ed_sea: () => { const d = [];
      return { grade: 'night', amb: ['sea', 'wind'], fx: ['ash'], layers: [
        [.04, skyBand(d, [[0, '#04060e'], [.55, '#0a1524'], [1, '#16263a']]) + stars(d, 381)],
        [.1, `<circle cx="1180" cy="190" r="66" fill="#f4ecd4" opacity=".85"/><circle cx="1180" cy="190" r="180" fill="#c9d8ff" opacity=".05"/>`],
        [.45, sea(d, 560, '#0a2233', '#030b13', 391, { glint: '#a8c8ff', glintX: 1180, foam: .05 })],
        [.9, `<g opacity=".9">${ship(420, 640, .55, '#04080f', { sail: '#0c1524', sailOp: .7, flag: '#04080f', skull: 1 })}</g>`]
      ], defs: d } },

    rook_room: () => { const d = [];
      return { grade: 'night', amb: ['surf', 'room'], fx: ['dust'], layers: [
        [.05, `<rect width="1600" height="900" fill="#0d1220"/>` + interiorBeams('#1a2336', .6)],
        [.3, `<rect x="880" y="140" width="420" height="360" rx="8" fill="#101a2c"/>
              <rect x="900" y="160" width="380" height="320" fill="#22405e"/>
              <circle cx="1180" cy="240" r="46" fill="#f2ead2" opacity=".85"/>
              <rect x="1084" y="160" width="14" height="320" fill="#101a2c"/><rect x="900" y="308" width="380" height="14" fill="#101a2c"/>`],
        [.6, `<g fill="#1b2438">
                <rect x="-100" y="620" width="700" height="34" rx="6"/><rect x="0" y="654" width="30" height="200"/><rect x="480" y="654" width="30" height="200"/>
              </g>
              <g fill="#243049">
                <rect x="120" y="560" width="300" height="60" rx="8"/>
                <rect x="150" y="500" width="240" height="60" rx="6" opacity=".7"/>
              </g>`],
        [1, `<rect x="-200" y="800" width="2000" height="220" fill="#080d18"/>`]
      ], defs: d } },

    concord_deck: () => { const d = [];
      return { grade: 'bleach', amb: ['sea', 'wind'], fx: [], rays: .8, layers: [
        [.05, skyBand(d, [[0, '#7fa8c6'], [1, '#e6eff4']])],
        [.35, sea(d, 460, '#3f7f94', '#134354', 401, { glint: '#ffffff', foam: .1 })],
        [.7, `<g fill="#f4f7fa"><path d="M-200,540 L1800,540 L1800,900 L-200,900 Z"/></g>
              <g fill="#dbe4ee">${Array.from({ length: 20 }, (_, i) => `<rect x="${-160 + i * 92}" y="542" width="80" height="360"/>`).join('')}</g>
              <g stroke="#c3ceda" stroke-width="8" fill="none"><path d="M200,-100 L340,540"/><path d="M1400,-100 L1260,540"/></g>`],
        [1, `<rect x="-200" y="512" width="2000" height="30" fill="#ffffff"/>`]
      ], defs: d } },

    black: () => ({ grade: 'none', amb: [], layers: [[0, `<rect width="1600" height="900" fill="#000"/>`]] }),
    white: () => ({ grade: 'none', amb: [], layers: [[0, `<rect width="1600" height="900" fill="#fff"/>`]] })
  };

  function stars(defs, seed) {
    const r = rng(seed); let s = '';
    for (let i = 0; i < 190; i++) {
      const x = r() * 1700 - 50, y = r() * 560, rr = r() * 1.7 + .3;
      s += `<circle cx="${x}" cy="${y}" r="${rr}" fill="#eaf2ff" opacity="${.15 + r() * .75}"/>`;
    }
    return s;
  }

  function renderScene(key) {
    const f = SCENES[key] || SCENES.black;
    const s = f();
    const defs = (s.defs || []).join('');
    const groups = s.layers.map(([z, html]) => `<g data-z="${z}">${html}</g>`).join('');
    return {
      svg: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${groups}</svg>`,
      amb: s.amb || [], fx: s.fx || [], grade: s.grade || 'none', rays: s.rays || 0
    };
  }

  /* ============================================================
     CHARACTERS — anime bust portraits, built from parts.
     Rendered in a -200..200 box; engine positions/scales them.
     ============================================================ */
  const CHARS = {
    rook: { skin: '#f2caa2', shade: '#d9a07a', hair: '#8a3d1c', hair2: '#c4702f', eye: '#e8a83a', cloth: '#3f5a63', cloth2: '#26383f', trim: '#c8452f',
      hairFront: `M-78,-42 C-84,-96 -44,-124 2,-124 C52,-124 84,-96 80,-40 C74,-62 62,-74 44,-70 C40,-96 4,-92 -6,-70 C-22,-96 -56,-84 -60,-56 C-66,-72 -74,-60 -78,-42 Z`,
      hairBack: `M-86,-30 C-96,-104 -46,-140 2,-140 C56,-140 96,-104 88,-26 C84,-64 80,-96 56,-112 C24,-132 -30,-128 -58,-104 C-78,-86 -82,-58 -86,-30 Z`,
      spikes: `M-72,-98 l-22,-30 l34,14 Z M-14,-124 l-8,-40 l26,32 Z M40,-116 l22,-34 l4,38 Z M74,-84 l32,-18 l-18,32 Z`,
      name: 'ROOK' },
    nell: { skin: '#e8b287', shade: '#c98d63', hair: '#232839', hair2: '#4a5470', eye: '#5fc98a', cloth: '#6b4a2c', cloth2: '#432c19', trim: '#2f7a6a',
      hairFront: `M-76,-46 C-80,-100 -42,-126 2,-126 C48,-126 82,-100 78,-44 C70,-74 58,-84 40,-78 C26,-104 -8,-100 -18,-74 C-34,-92 -60,-80 -62,-52 Z`,
      hairBack: `M-80,-34 C-92,-104 -44,-142 2,-142 C52,-142 92,-104 82,-30 C80,-70 74,-100 50,-114 C20,-132 -26,-128 -54,-106 C-72,-90 -78,-60 -80,-34 Z`,
      braid: `M62,-70 C104,-40 108,40 86,120 C80,142 58,140 56,118 C64,50 62,-6 44,-46 Z`,
      goggles: 1, freckles: 1, name: 'NELL' },
  };
  /* full definitions (kept out of the literal above for readability) */
  CHARS.thorne = { skin: '#dda87e', shade: '#b8815a', hair: '#141720', hair2: '#3a4152', eye: '#9fe0ee', cloth: '#2a1c2e', cloth2: '#17101a', trim: '#c8452f',
    hairFront: `M-82,-44 C-86,-100 -46,-128 2,-128 C54,-128 86,-100 82,-42 C74,-70 60,-82 42,-76 C30,-102 -6,-98 -16,-74 C-34,-94 -64,-82 -68,-54 Z`,
    hairBack: `M-92,-14 C-104,-102 -48,-146 2,-146 C58,-146 102,-102 92,-10 C90,-60 82,-102 56,-118 C22,-138 -30,-134 -60,-110 C-84,-90 -90,-56 -92,-14 Z`,
    streak: `M-62,-100 C-46,-118 -20,-126 2,-126 L2,-108 C-16,-108 -40,-100 -52,-84 Z`,
    scar: 1, mane: 1, name: 'THORNE' };
  CHARS.ardent = { skin: '#f0dcc4', shade: '#d3b795', hair: '#d8cfb8', hair2: '#f2ecdc', eye: '#a6d8ff', cloth: '#eef3f8', cloth2: '#c9d4e0', trim: '#2b3f5c',
    hairFront: `M-72,-52 C-76,-104 -40,-126 2,-126 C46,-126 80,-104 76,-50 C62,-84 40,-96 6,-90 C-26,-84 -52,-76 -72,-52 Z`,
    hairBack: `M-78,-40 C-88,-106 -42,-140 2,-140 C50,-140 92,-106 82,-36 C78,-80 68,-104 44,-116 C16,-130 -26,-126 -52,-108 C-70,-94 -76,-66 -78,-40 Z`,
    name: 'ARDENT' };
  CHARS.hallow = { skin: '#cd9a74', shade: '#a97553', hair: '#9aa2ab', hair2: '#c4ccd4', eye: '#c7a06a', cloth: '#4a4038', cloth2: '#2e2822', trim: '#8a6a3a',
    hairFront: `M-80,-46 C-84,-98 -44,-122 2,-122 C50,-122 84,-98 80,-44 C64,-80 34,-92 0,-88 C-34,-84 -62,-74 -80,-46 Z`,
    hairBack: `M-86,-34 C-96,-100 -46,-136 2,-136 C54,-136 96,-100 86,-30 C82,-74 72,-100 48,-112 C18,-126 -26,-122 -54,-104 C-76,-90 -84,-60 -86,-34 Z`,
    beard: `M-70,-4 C-70,60 -38,114 0,118 C38,114 70,60 70,-4 C60,48 34,84 0,86 C-34,84 -60,48 -70,-4 Z`,
    stache: 1, old: 1, name: 'HALLOW' };
  CHARS.dol = { skin: '#c9a07c', shade: '#a67c58', hair: '#b9bec6', hair2: '#e0e4ea', eye: '#7a6a5a', cloth: '#5a4a52', cloth2: '#3a2e34', trim: '#8a5a4a',
    hairFront: `M-76,-48 C-80,-98 -42,-120 2,-120 C46,-120 80,-98 76,-46 C60,-82 34,-92 0,-88 C-32,-84 -58,-74 -76,-48 Z`,
    hairBack: `M-88,-20 C-96,-98 -46,-134 2,-134 C54,-134 96,-98 88,-16 C84,-64 72,-98 48,-110 C18,-124 -26,-120 -56,-102 C-80,-86 -86,-52 -88,-20 Z`,
    old: 1, name: 'MAMA DOL' };
  CHARS.grit = { skin: '#a5703f', shade: '#7d5029', hair: '#2a1c14', hair2: '#4a3222', eye: '#d8a05a', cloth: '#4a2c19', cloth2: '#2c1a0e', trim: '#c98a2a',
    hairFront: `M-78,-50 C-82,-102 -42,-124 2,-124 C48,-124 82,-102 78,-48 C66,-78 42,-90 2,-88 C-36,-86 -62,-76 -78,-50 Z`,
    hairBack: `M-84,-36 C-94,-104 -44,-140 2,-140 C52,-140 94,-104 84,-32 C80,-76 70,-102 46,-114 C16,-128 -26,-124 -54,-106 C-74,-92 -82,-62 -84,-36 Z`,
    beard: `M-58,6 C-58,58 -30,102 2,106 C36,102 62,58 62,6 C52,48 32,68 2,70 C-28,68 -48,48 -58,6 Z`,
    big: 1, name: 'GRIT' };
  CHARS.pike = { skin: '#eccfae', shade: '#cba983', hair: '#4a3a28', hair2: '#6b543a', eye: '#8aa8c4', cloth: '#eef3f8', cloth2: '#c9d4e0', trim: '#2b3f5c',
    hairFront: `M-74,-50 C-78,-102 -40,-124 2,-124 C46,-124 78,-102 74,-48 C60,-80 36,-92 2,-88 C-32,-84 -56,-74 -74,-50 Z`,
    hairBack: `M-80,-38 C-90,-104 -42,-138 2,-138 C50,-138 92,-104 82,-34 C78,-78 68,-102 44,-114 C16,-128 -26,-124 -52,-106 C-72,-92 -78,-64 -80,-38 Z`,
    name: 'LT. PIKE' };
  CHARS.crier = CHARS.pike;
  CHARS.vo = CHARS.rook;

  /* expression table: [eyeOpen, browY, browTilt, mouth, extra] */
  const EM = {
    neutral: { o: 1, by: 0, bt: 0, m: 'line' },
    calm: { o: .92, by: 2, bt: -2, m: 'soft' },
    warm: { o: .85, by: 1, bt: -3, m: 'smile' },
    grin: { o: .8, by: 0, bt: -4, m: 'grin' },
    laugh: { o: .28, by: -2, bt: -6, m: 'open' },
    tease: { o: .55, by: 0, bt: -5, m: 'smirk' },
    determined: { o: 1.06, by: -8, bt: 9, m: 'set' },
    shout: { o: 1.1, by: -10, bt: 8, m: 'shout' },
    yell: { o: 1.1, by: -10, bt: 8, m: 'shout' },
    roar: { o: 1.15, by: -12, bt: 10, m: 'shout' },
    angry: { o: 1.02, by: -10, bt: 13, m: 'snarl' },
    bitter: { o: .82, by: -4, bt: 7, m: 'flat' },
    cold: { o: .78, by: 2, bt: 2, m: 'flat' },
    flat: { o: .85, by: 1, bt: 0, m: 'flat' },
    dry: { o: .7, by: 1, bt: 3, m: 'smirk' },
    sneer: { o: .8, by: -2, bt: 8, m: 'smirk' },
    sad: { o: .74, by: 5, bt: -10, m: 'frown', tear: 0 },
    broken: { o: .6, by: 6, bt: -13, m: 'frown', tear: 1 },
    dying: { o: .42, by: 4, bt: -8, m: 'soft', tear: 0 },
    tired: { o: .5, by: 4, bt: -3, m: 'flat' },
    soft: { o: .8, by: 2, bt: -4, m: 'soft' },
    whisper: { o: .72, by: 2, bt: -2, m: 'soft' },
    awe: { o: 1.18, by: 4, bt: -8, m: 'small' },
    fear: { o: 1.24, by: 6, bt: -12, m: 'small', sweat: 1 },
    urgent: { o: 1.08, by: -5, bt: 5, m: 'open', sweat: 1 },
    breathless: { o: .9, by: -3, bt: 3, m: 'open', sweat: 1 },
    shock: { o: 1.3, by: 5, bt: -6, m: 'small', sweat: 1 }
  };

  function eye(cx, cy, w, h, col, open, flip, u = '') {
    const s = flip ? -1 : 1;
    if (open < .18) {  // closed
      return `<path d="M${cx - w},${cy} q${w},${h * .5} ${w * 2},0" stroke="#2a1c18" stroke-width="5.5" fill="none" stroke-linecap="round"/>`;
    }
    const hh = h * open;
    const eid = `e${u}${flip ? 'r' : 'l'}`;
    return `<g>
      <path d="M${cx - w},${cy} q${w * .9},${-hh * 1.25} ${w * 2},${-hh * .25} q${-w * .5},${hh * 1.65} ${-w * 2},${hh * .25} Z" fill="#fdf7f2"/>
      <clipPath id="${eid}"><path d="M${cx - w},${cy} q${w * .9},${-hh * 1.25} ${w * 2},${-hh * .25} q${-w * .5},${hh * 1.65} ${-w * 2},${hh * .25} Z"/></clipPath>
      <g clip-path="url(#${eid})">
        <ellipse cx="${cx + s * 2}" cy="${cy - hh * .18}" rx="${w * .62}" ry="${hh * 1.15}" fill="${col}"/>
        <ellipse cx="${cx + s * 2}" cy="${cy - hh * .05}" rx="${w * .62}" ry="${hh * 1.15}" fill="#000" opacity=".18"/>
        <ellipse cx="${cx + s * 2}" cy="${cy - hh * .1}" rx="${w * .3}" ry="${hh * .62}" fill="#1a0f0c"/>
        <circle cx="${cx + s * (w * .3)}" cy="${cy - hh * .62}" r="${w * .24}" fill="#fff"/>
        <circle cx="${cx - s * (w * .28)}" cy="${cy + hh * .3}" r="${w * .12}" fill="#fff" opacity=".8"/>
      </g>
      <path d="M${cx - w},${cy} q${w * .9},${-hh * 1.35} ${w * 2},${-hh * .3}" stroke="#241511" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M${cx - w * .8},${cy + hh * .55} q${w * .8},${hh * .35} ${w * 1.6},${-hh * .1}" stroke="#8a6250" stroke-width="2.6" fill="none" opacity=".7"/>
    </g>`;
  }
  function mouth(kind, y) {
    switch (kind) {
      case 'smile': return `<path d="M-20,${y} q20,16 40,0" stroke="#8a4438" stroke-width="4.5" fill="none" stroke-linecap="round" transform="translate(-10,0)"/>`;
      case 'grin': return `<path d="M-26,${y - 3} q26,26 52,0 q-26,10 -52,0 Z" fill="#7a2c26" transform="translate(-13,0)"/><path d="M-24,${y - 2} q24,8 48,0" stroke="#fff" stroke-width="6" fill="none" transform="translate(-12,0)"/>`;
      case 'open': return `<ellipse cx="0" cy="${y + 6}" rx="17" ry="21" fill="#6e241f"/><ellipse cx="0" cy="${y + 15}" rx="11" ry="9" fill="#c2564c"/>`;
      case 'shout': return `<path d="M-24,${y - 4} q24,-8 48,0 q-6,44 -24,44 q-18,0 -24,-44 Z" fill="#6e241f"/><path d="M-20,${y - 2} q20,-4 40,0 l-3,8 l-34,0 Z" fill="#fff"/>`;
      case 'snarl': return `<path d="M-24,${y} q24,-10 48,2 q-24,26 -48,-2 Z" fill="#6e241f"/><path d="M-20,${y - 1} l6,9 l6,-9 l6,9 l6,-9 l6,9 l6,-9" stroke="#fff" stroke-width="4" fill="none"/>`;
      case 'smirk': return `<path d="M-18,${y + 2} q18,10 34,-8" stroke="#8a4438" stroke-width="4.5" fill="none" stroke-linecap="round" transform="translate(-8,0)"/>`;
      case 'frown': return `<path d="M-18,${y + 6} q18,-14 36,0" stroke="#8a4438" stroke-width="4.5" fill="none" stroke-linecap="round" transform="translate(-18,0)"/>`;
      case 'set': return `<path d="M-20,${y} l40,0" stroke="#8a4438" stroke-width="5.5" fill="none" stroke-linecap="round" transform="translate(-20,0)"/><path d="M-20,${y + 6} q20,4 40,0" stroke="#8a4438" stroke-width="2" opacity=".5" fill="none" transform="translate(-20,0)"/>`;
      case 'small': return `<ellipse cx="0" cy="${y + 4}" rx="8" ry="10" fill="#6e241f"/>`;
      case 'soft': return `<path d="M-14,${y} q14,9 28,-2" stroke="#8a4438" stroke-width="4" fill="none" stroke-linecap="round" transform="translate(-14,0)"/>`;
      default: return `<path d="M-15,${y} l30,0" stroke="#8a4438" stroke-width="4.5" fill="none" stroke-linecap="round" transform="translate(-15,0)"/>`;
    }
  }

  let uid = 0;
  function portrait(id, emote = 'neutral', o = {}) {
    const c = CHARS[id] || CHARS.rook;
    const e = EM[emote] || EM.neutral;
    const flip = o.flip ? -1 : 1;
    const rim = o.rim || '#ffd9a0';
    const back = o.back || false;
    const u = 'p' + (++uid);

    const head = `M0,-118 C58,-118 92,-78 92,-22 C92,26 68,72 30,102 C18,112 8,118 0,118 C-8,118 -18,112 -30,102 C-68,72 -92,26 -92,-22 C-92,-78 -58,-118 0,-118 Z`;

    const brow = (x, s) => `<path d="M${x - 26 * s},${-52 + e.by + e.bt * .5 * s} q${26 * s},${-9 - e.bt * .4} ${52 * s},${e.bt * .55}" stroke="${c.hair}" stroke-width="8" fill="none" stroke-linecap="round"/>`;

    return `<g transform="scale(${flip},1)">
      <defs>
        <clipPath id="hd${u}"><path d="${head}"/></clipPath>
        <clipPath id="hf${u}"><path d="${c.hairFront}"/></clipPath>
      </defs>
      <!-- back hair -->
      <path d="${c.hairBack}" fill="${c.hair}"/>
      ${c.mane ? `<path d="M-92,-40 C-120,40 -110,120 -84,160 L-40,150 C-70,100 -80,20 -74,-30 Z M92,-40 C120,40 110,120 84,160 L40,150 C70,100 80,20 74,-30 Z" fill="${c.hair}"/>` : ''}
      ${c.braid ? `<path d="${c.braid}" fill="${c.hair}"/><path d="${c.braid}" fill="${c.hair2}" opacity=".35"/>` : ''}

      <!-- shoulders / clothing -->
      <path d="M-150,230 C-150,150 -96,108 -46,96 L46,96 C96,108 150,150 150,230 Z" fill="${c.cloth}"/>
      <path d="M-150,230 C-150,150 -96,108 -46,96 L-20,120 L-56,230 Z" fill="${c.cloth2}"/>
      <path d="M150,230 C150,150 96,108 46,96 L20,120 L56,230 Z" fill="${c.cloth2}"/>
      <path d="M-30,100 L0,150 L30,100 L52,112 L28,230 L-28,230 L-52,112 Z" fill="${c.trim}" opacity=".9"/>
      <path d="M-46,96 L46,96 L34,128 L-34,128 Z" fill="${c.shade}"/>

      <!-- neck + head -->
      <path d="M-30,60 L30,60 L30,110 L-30,110 Z" fill="${c.shade}"/>
      <path d="${head}" fill="${c.skin}"/>
      <g clip-path="url(#hd${u})">
        <path d="M50,-200 L320,-200 L320,320 L4,320 Z" fill="${c.shade}" opacity=".3"/>
        <path d="M-120,-140 L120,-140 L120,-48 Q0,-22 -120,-56 Z" fill="${c.shade}" opacity=".26"/>
        <path d="M-320,-200 L-52,-200 L-76,320 L-320,320 Z" fill="#fff" opacity=".06"/>
      </g>

      ${back ? '' : `
      <!-- face -->
      ${c.beard ? `<path d="${c.beard}" fill="${c.hair}"/><path d="${c.beard}" fill="${c.hair2}" opacity=".3"/>` : ''}
      ${brow(-46, 1)}${brow(46, -1)}
      ${eye(-44, -14, 26, 22, c.eye, e.o, false, u)}
      ${eye(44, -14, 26, 22, c.eye, e.o, true, u)}
      <path d="M4,14 q10,12 -4,16" stroke="${c.shade}" stroke-width="4" fill="none" stroke-linecap="round"/>
      ${mouth(e.m, 56)}
      ${c.freckles ? `<g fill="${c.shade}" opacity=".65"><circle cx="-58" cy="18" r="2.6"/><circle cx="-46" cy="26" r="2.2"/><circle cx="-68" cy="28" r="2.2"/><circle cx="58" cy="18" r="2.6"/><circle cx="46" cy="26" r="2.2"/><circle cx="68" cy="28" r="2.2"/></g>` : ''}
      ${c.scar ? `<path d="M34,44 l26,22" stroke="#a8624c" stroke-width="4" stroke-linecap="round" opacity=".85"/>` : ''}
      ${c.old ? `<g stroke="${c.shade}" stroke-width="3" fill="none" opacity=".6"><path d="M-70,-38 q14,-8 26,-4"/><path d="M70,-38 q-14,-8 -26,-4"/><path d="M-52,16 q-10,14 -6,26"/><path d="M52,16 q10,14 6,26"/></g>` : ''}
      ${e.tear ? `<g fill="#bfe6ff" opacity=".9"><path d="M-56,6 q6,26 0,42 q-8,-16 0,-42 Z"/><path d="M58,6 q6,22 1,36 q-8,-14 -1,-36 Z"/></g>` : ''}
      ${e.sweat ? `<path d="M74,-56 q10,16 0,26 q-11,-10 0,-26 Z" fill="#bfe6ff" opacity=".9"/>` : ''}
      ${c.stache ? `<path d="M-36,38 Q0,28 36,38 Q22,56 0,51 Q-22,56 -36,38 Z" fill="${c.hair}"/>` : ''}
      `}

      <!-- front hair -->
      <path d="${c.hairFront}" fill="${c.hair}"/>
      <g clip-path="url(#hf${u})">
        <path d="M-150,-190 L150,-190 L120,-84 L-120,-70 Z" fill="${c.hair2}" opacity=".42"/>
      </g>
      ${c.spikes ? `<path d="${c.spikes}" fill="${c.hair}"/>` : ''}
      ${c.streak ? `<path d="${c.streak}" fill="#dfe4ec"/>` : ''}
      ${c.goggles ? `<g transform="translate(0,-96)">
          <rect x="-84" y="-16" width="168" height="26" rx="12" fill="#3a2c1e"/>
          <circle cx="-40" cy="-3" r="26" fill="#5a4630"/><circle cx="-40" cy="-3" r="18" fill="#8fd8e8" opacity=".85"/>
          <circle cx="40" cy="-3" r="26" fill="#5a4630"/><circle cx="40" cy="-3" r="18" fill="#8fd8e8" opacity=".85"/>
          <path d="M-30,-14 l14,-6 M50,-14 l14,-6" stroke="#fff" stroke-width="4" opacity=".7"/>
        </g>` : ''}

      <!-- rim light: partial traces with round caps, so it fades instead of
           stopping against a clip edge -->
      <g fill="none" stroke="${rim}" stroke-linecap="round">
        <path d="M18,-116 C66,-110 92,-74 92,-22 C92,24 70,68 34,99" stroke-width="7" opacity=".48"/>
        <path d="M34,-132 C72,-120 88,-88 89,-52" stroke-width="6" opacity=".34"/>
        <path d="M54,99 C100,111 148,152 150,224" stroke-width="6" opacity=".26"/>
      </g>
    </g>`;
  }

  /* silhouette figure for wide shots — backlit, rim-lit down one edge.
     Anchored roughly at the hips so scenes can place it on a deck line. */
  function figure(id, o = {}) {
    const c = CHARS[id] || CHARS.rook;
    const col = o.col || '#05080d', rim = o.rim || '#ffb45e';
    const coat = o.coat ?? ['thorne', 'ardent', 'hallow'].includes(id);
    const big = c.big ? 1.15 : 1;
    const pose = o.pose || 'stand';

    const arms =
      pose === 'point' ? `<path d="M26,-58 L106,-96 L114,-76 L34,-34 Z"/><path d="M-32,-54 q-14,42 -9,80 l16,2 q2,-40 11,-70 Z"/>`
      : pose === 'reach' ? `<path d="M20,-60 L50,-152 L70,-146 L40,-40 Z"/><path d="M-32,-54 q-16,40 -12,76 l16,3 q3,-38 13,-68 Z"/>`
      : pose === 'sword' ? `<path d="M26,-58 L96,-106 L106,-90 L34,-36 Z"/><path d="M-32,-54 q-18,38 -16,74 l16,3 q3,-38 15,-66 Z"/>`
      : `<path d="M-32,-54 q-15,44 -10,82 l16,2 q3,-42 12,-72 Z M32,-54 q15,44 10,82 l-16,2 q-3,-42 -12,-72 Z"/>`;
    const blade = pose === 'sword'
      ? `<path d="M94,-108 L168,-160 L176,-148 L102,-96 Z" fill="${rim}" opacity=".75"/>` : '';

    return `<g transform="scale(${(o.flip ? -1 : 1) * big},${big})">
      <g fill="${col}">
        ${coat ? `<path d="M-44,-48 L44,-48 L80,126 L56,134 L44,56 L44,158 L-44,158 L-44,56 L-56,134 L-80,126 Z"/>` : ''}
        <path d="M-31,-58 q31,-15 62,0 l13,68 -15,9 -4,27 7,112 -23,0 -9,-98 -4,0 -9,98 -23,0 7,-112 -4,-27 -15,-9 Z"/>
        ${arms}
        <rect x="-9" y="-86" width="18" height="24" rx="6"/>
        <circle cx="0" cy="-100" r="27"/>
        <path d="${c.hairBack}" transform="translate(0,-100) scale(.30)"/>
        ${c.spikes ? `<path d="${c.spikes}" transform="translate(0,-100) scale(.30)"/>` : ''}
        ${c.braid ? `<path d="${c.braid}" transform="translate(0,-100) scale(.30)"/>` : ''}
        ${c.beard ? `<path d="${c.beard}" transform="translate(0,-100) scale(.30)"/>` : ''}
      </g>
      ${blade}
      <g fill="none" stroke="${rim}" stroke-linecap="round">
        <path d="M14,-124 C34,-118 27,-104 26,-90" stroke-width="5" opacity=".5"/>
        <path d="M28,-56 C40,-20 44,20 43,54" stroke-width="4" opacity=".34"/>
        ${coat ? `<path d="M46,60 L74,124" stroke-width="4" opacity=".26"/>` : ''}
      </g>
    </g>`;
  }

  const NAMES = {
    rook: 'ROOK', nell: 'NELL', thorne: 'CAPT. THORNE', ardent: 'COMMODORE ARDENT',
    hallow: 'HALLOW', dol: 'MAMA DOL', grit: 'BOSUN GRIT', pike: 'LT. PIKE',
    crier: 'CONCORD CRIER', vo: 'ROOK', crowd: 'CROWD', concord: 'CONCORD SOLDIER'
  };

  return { renderScene, portrait, figure, SCENES, CHARS, NAMES, W, H };
})();
