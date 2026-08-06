/* ============================================================
   THE RED REBELLION — Cast & Scenery
   Every character and set is drawn as pencil-line SVG so the
   show looks like the comic pages it came from.
   Local figure space is 120 x 200 (feet at y=176).
   Stage space is 1600 x 900.
   ============================================================ */
(function (global) {
  'use strict';

  var INK = '#3b3733';
  var INK_SOFT = '#6d6862';

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function attr(o) {
    return Object.keys(o).map(function (k) { return k + '="' + o[k] + '"'; }).join(' ');
  }

  /* ---------------- characters ----------------
     Only people who actually appear or speak on the eight pages. */
  var CHARACTERS = {
    narrator:  { name: 'Narrator',          color: '#d8cfc2', voice: { pitch: 0.85, rate: 0.92 } },

    catcap:    { name: 'Cat Pirate',        color: '#ff5a4d', voice: { pitch: 0.55, rate: 0.88 },
                 look: { ears: 'cat', hair: 'none', shirt: 'stripe', hat: 'none', whiskers: true } },

    /* Gets Redrix out, and calls the course for the island. */
    virakshan: { name: 'Virakshan',         color: '#ffbe4d', voice: { pitch: 0.72, rate: 0.94 },
                 look: { ears: 'none', hair: 'spiky', shirt: 'coat', hat: 'none' } },

    /* The lead. The pages never say his name — that comes from the author. */
    redrix:    { name: 'Redrix',            color: '#7dffb0', voice: { pitch: 1.0, rate: 1.0 },
                 look: { ears: 'none', hair: 'tuft', shirt: 'stripe', hat: 'none' } },

    tophat:    { name: 'Top Hat Pirate',    color: '#c9a0ff', voice: { pitch: 0.7, rate: 0.9 },
                 look: { ears: 'none', hair: 'none', shirt: 'stripe', hat: 'tophat' } },

    crew1:     { name: 'Crewmate',          color: '#ffd98a', voice: { pitch: 1.1, rate: 1.02 },
                 look: { ears: 'none', hair: 'spiky', shirt: 'plain', hat: 'none' } },

    crew2:     { name: 'Crewmate',          color: '#a8e6cf', voice: { pitch: 0.95, rate: 1.08 },
                 look: { ears: 'none', hair: 'tuft', shirt: 'plain', hat: 'none' } },

    hunter:    { name: 'Marine Officer',    color: '#9fb8ff', voice: { pitch: 0.65, rate: 1.0 },
                 look: { ears: 'none', hair: 'none', shirt: 'marine', hat: 'marine' } },

    escapee:   { name: 'The Escaped Criminal', color: '#ff9d6b', voice: { pitch: 1.05, rate: 1.06 },
                 look: { ears: 'none', hair: 'spiky', shirt: 'plain', hat: 'none' } },

    cellmate:  { name: 'The Cellmate',      color: '#ffe066', voice: { pitch: 0.9, rate: 0.98 },
                 look: { ears: 'none', hair: 'spiky', shirt: 'stripe', hat: 'none' } },

    marinecap: { name: 'Marine Captain',    color: '#ff8686', voice: { pitch: 0.5, rate: 0.85 },
                 look: { ears: 'none', hair: 'none', shirt: 'marine', hat: 'marine' } },

    rescuer:   { name: 'Rescuer',           color: '#7bf5e0', voice: { pitch: 1.0, rate: 1.05 },
                 look: { ears: 'none', hair: 'spiky', shirt: 'plain', hat: 'none' } },

    unknown:   { name: '???',               color: '#ff3b30', voice: { pitch: 0.45, rate: 0.8 },
                 look: { ears: 'none', hair: 'none', shirt: 'coat', hat: 'none' } }
  };

  /* ---------------- poses ---------------- */
  var POSES = {
    idle:   { la:  28, ra: -28, mouth: 'neutral', legs: 'stand' },
    talk:   { la:  46, ra: -52, mouth: 'open',    legs: 'stand' },
    shout:  { la: 120, ra: -120, mouth: 'shout',  legs: 'stand' },
    cheer:  { la: 150, ra: -150, mouth: 'shout',  legs: 'stand' },
    shock:  { la: 128, ra: -128, mouth: 'shout',  legs: 'apart' },
    point:  { la:  22, ra: -112, mouth: 'open',   legs: 'stand' },
    aim:    { la:  18, ra:  -95, mouth: 'flat',   legs: 'apart', prop: 'pistol' },
    bound:  { la:  92, ra:  -92, mouth: 'flat',   legs: 'stand' },
    slump:  { la:  12, ra:  -12, mouth: 'frown',  legs: 'stand' },
    read:   { la:  62, ra:  -62, mouth: 'neutral', legs: 'stand', prop: 'paper' },
    steer:  { la:  72, ra:  -72, mouth: 'open',   legs: 'apart' },
    run:    { la: 110, ra:  -40, mouth: 'shout',  legs: 'run' }
  };

  /* ---------------- the figure ---------------- */
  function figure(id, opts) {
    opts = opts || {};
    var ch = CHARACTERS[id] || CHARACTERS.crew1;
    var look = ch.look || {};
    var pose = POSES[opts.pose] || POSES.idle;
    var x = opts.x || 0, y = opts.y || 0, s = opts.scale || 1, flip = opts.flip ? -1 : 1;
    var sw = opts.weight || 3.4;
    var o = [];

    o.push('<g class="rr-fig' + (opts.talking ? ' is-talking' : '') + '" data-fig="' + id + '" ' +
      'transform="translate(' + x + ',' + y + ') scale(' + (s * flip) + ',' + s + ')" ' +
      'stroke="' + INK + '" stroke-width="' + sw + '" fill="none" ' +
      'stroke-linecap="round" stroke-linejoin="round">');

    o.push('<g class="rr-bob">');

    /* ---- legs: outlined tubes with oval shoes, feet landing at y≈174 ---- */
    if (pose.legs === 'run') {
      o.push('<path d="M50 118 L26 154 M60 120 L38 160"/><ellipse cx="26" cy="162" rx="13" ry="7.5"/>');
      o.push('<path d="M70 118 L94 150 M60 120 L84 158"/><ellipse cx="94" cy="158" rx="13" ry="7.5"/>');
    } else if (pose.legs === 'apart') {
      o.push('<path d="M49 118 L34 162 M59 118 L46 164"/><ellipse cx="36" cy="168" rx="13" ry="7.5"/>');
      o.push('<path d="M71 118 L86 162 M61 118 L74 164"/><ellipse cx="84" cy="168" rx="13" ry="7.5"/>');
    } else {
      o.push('<path d="M47 118 L44 162 M57 118 L56 162"/><ellipse cx="48" cy="167" rx="13" ry="7.5"/>');
      o.push('<path d="M73 118 L76 162 M63 118 L64 162"/><ellipse cx="72" cy="167" rx="13" ry="7.5"/>');
    }

    /* ---- body: small, sits under a big head ---- */
    if (look.shirt === 'coat') {
      o.push('<path d="M43 88 L77 88 L80 120 L40 120 Z"/>');
      o.push('<path d="M60 88 L60 120"/><path d="M49 88 L58 102"/><path d="M71 88 L62 102"/>');
    } else if (look.shirt === 'marine') {
      o.push('<rect x="44" y="88" width="32" height="32" rx="2"/>');
      o.push('<path d="M44 100 L76 100"/>');
      o.push('<path d="M48 88 L60 102 L72 88"/>');
    } else {
      o.push('<rect x="44" y="88" width="32" height="32" rx="2"/>');
      if (look.shirt === 'stripe') {
        o.push('<path d="M44 96 L76 96 M44 104 L76 104 M44 112 L76 112" stroke-width="' + (sw * 0.8) + '"/>');
      }
    }
    if (look.label) {
      o.push('<rect x="46" y="98" width="28" height="14" fill="#fdfbf4" stroke="none"/>');
      o.push('<text x="60" y="109" text-anchor="middle" font-family="var(--hand)" font-size="10" ' +
        'fill="' + INK + '" stroke="none" letter-spacing="0.5">' + esc(look.label) + '</text>');
    }

    /* ---- arms: outlined tubes ending in a mitten hand with a thumb ---- */
    o.push('<g class="rr-arm rr-arm-l" transform="rotate(' + pose.la + ' 44 94)">');
    o.push('<path d="M39 94 L39 122 q-8 4 -7 13 q1 9 9 9 q10 0 11 -9 q1 -7 -3 -13 L49 94"/>');
    o.push('<path d="M31 131 q-9 -1 -9 5 q0 6 8 5" stroke-width="' + (sw * 0.85) + '"/>');
    o.push('</g>');

    o.push('<g class="rr-arm rr-arm-r" transform="rotate(' + pose.ra + ' 76 94)">');
    o.push('<path d="M81 94 L81 122 q8 4 7 13 q-1 9 -9 9 q-10 0 -11 -9 q-1 -7 3 -13 L71 94"/>');
    o.push('<path d="M89 131 q9 -1 9 5 q0 6 -8 5" stroke-width="' + (sw * 0.85) + '"/>');
    if (pose.prop === 'pistol') {
      o.push('<path d="M78 140 L78 152 L98 152 L98 144" stroke-width="' + (sw * 0.9) + '"/>');
    }
    if (pose.prop === 'paper') {
      o.push('<rect x="58" y="126" width="44" height="34" rx="2" transform="rotate(9 80 143)"/>');
      o.push('<path d="M65 138 L96 135 M65 147 L94 144" stroke-width="' + (sw * 0.6) + '" stroke="' + INK_SOFT + '"/>');
    }
    o.push('</g>');

    /* ---- head: big, on a stub of a neck ---- */
    o.push('<path d="M60 82 L60 88"/>');
    o.push('<circle cx="60" cy="50" r="33"/>');

    if (look.ears === 'cat') {
      o.push('<path d="M38 27 L31 2 L55 19"/>');
      o.push('<path d="M82 27 L89 2 L65 19"/>');
    }
    /* the hair is a starburst of spikes right around the crown */
    if (look.hair === 'spiky') {
      o.push('<path d="M35 33 L25 20 M43 24 L38 8 M52 19 L49 2 M61 17 L62 0 M70 19 L75 3 M78 25 L86 11 M85 34 L97 23" ' +
        'stroke-width="' + (sw * 0.85) + '"/>');
    } else if (look.hair === 'tuft') {
      o.push('<path d="M45 24 L41 11 M54 19 L52 5 M63 17 Q68 4 76 14" stroke-width="' + (sw * 0.85) + '"/>');
    }
    if (look.whiskers) {
      o.push('<path d="M28 52 L3 46 M28 62 L4 69 M92 52 L117 46 M92 62 L116 69" stroke-width="' + (sw * 0.6) + '"/>');
    }
    if (look.hat === 'tophat') {
      o.push('<path d="M24 24 L96 24"/><rect x="40" y="-16" width="40" height="40"/>');
    } else if (look.hat === 'marine') {
      o.push('<path d="M28 26 Q60 0 92 26 Z"/><path d="M24 26 L98 26"/>');
    }

    /* ---- face: two eyes, a nose dot, and a mouth ---- */
    var eyeY = 44, eyeR = 4.2;
    o.push('<circle cx="48" cy="' + eyeY + '" r="' + eyeR + '" fill="' + INK + '" stroke="none"/>');
    o.push('<circle cx="72" cy="' + eyeY + '" r="' + eyeR + '" fill="' + INK + '" stroke="none"/>');
    if (pose.mouth !== 'frown') {
      o.push('<circle cx="60" cy="56" r="3" fill="' + INK + '" stroke="none"/>');
    }

    if (pose.mouth === 'shout') {
      o.push('<ellipse cx="60" cy="68" rx="11" ry="9" fill="#fdfbf4"/>');
    } else if (pose.mouth === 'open') {
      o.push('<ellipse class="rr-mouth" cx="60" cy="68" rx="7.5" ry="6" fill="#fdfbf4"/>');
    } else if (pose.mouth === 'frown') {
      o.push('<path d="M42 39 L54 44 M78 39 L66 44" stroke-width="' + (sw * 0.85) + '"/>');
      o.push('<path d="M48 72 Q60 62 72 72"/>');
    } else if (pose.mouth === 'flat') {
      o.push('<path d="M49 68 L71 68"/>');
    } else {
      o.push('<path d="M47 64 Q60 76 73 64"/>');
    }

    o.push('</g></g>');
    return o.join('');
  }

  /* ---------------- speech bubble ---------------- */
  function bubble(opts) {
    var x = opts.x, y = opts.y, w = opts.w, h = opts.h;
    var lines = opts.lines || [];
    var tail = opts.tail || 'bl';
    var size = opts.size || 30;
    var cls = opts.cls || '';
    var o = [];
    var rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;

    /* the tail grows out of the ellipse edge, so the two never come apart */
    var DIRS = { bl: 118, br: 62, tl: 242, tr: 298 };
    var dir = DIRS[tail];
    var edge = function (deg, k) {
      var r = deg * Math.PI / 180;
      return [(cx + rx * k * Math.cos(r)).toFixed(1), (cy + ry * k * Math.sin(r)).toFixed(1)];
    };

    o.push('<g class="rr-bubble ' + cls + '">');
    o.push('<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="#fdfbf4" stroke="' + INK + '" stroke-width="3.2"/>');
    if (dir != null) {
      var a = edge(dir - 9, 1.05), b = edge(dir + 9, 1.05);
      var r = dir * Math.PI / 180;
      var apex = [(cx + rx * 1.34 * Math.cos(r)).toFixed(1), (cy + ry * 1.72 * Math.sin(r)).toFixed(1)];
      // paper fill first, hiding the arc of ellipse outline it grows from
      o.push('<path d="M' + a[0] + ' ' + a[1] + ' L' + apex[0] + ' ' + apex[1] + ' L' + b[0] + ' ' + b[1] + ' Z" fill="#fdfbf4" stroke="none"/>');
      // then only the two outer edges
      o.push('<path d="M' + a[0] + ' ' + a[1] + ' L' + apex[0] + ' ' + apex[1] + ' L' + b[0] + ' ' + b[1] + '" fill="none" stroke="' + INK + '" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>');
    }
    var startY = cy - ((lines.length - 1) * size * 0.62);
    lines.forEach(function (ln, i) {
      o.push('<text x="' + cx + '" y="' + (startY + i * size * 1.24) + '" text-anchor="middle" ' +
        'dominant-baseline="middle" font-family="var(--hand)" font-size="' + size + '" ' +
        'fill="' + INK + '" stroke="none">' + esc(ln) + '</text>');
    });
    o.push('</g>');
    return o.join('');
  }

  /* ---------------- reusable props ---------------- */
  function jollyRoger(x, y, w, h, torn) {
    var o = [];
    o.push('<g transform="translate(' + x + ',' + y + ')" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linecap="round">');
    if (torn) {
      o.push('<path d="M0 0 L' + w + ' 0 L' + w + ' ' + (h * 0.55) + ' L' + (w * 0.72) + ' ' + (h * 0.4) +
        ' L' + (w * 0.6) + ' ' + h + ' L' + (w * 0.35) + ' ' + (h * 0.55) + ' L0 ' + (h * 0.8) + ' Z" fill="#fdfbf4"/>');
    } else {
      o.push('<rect width="' + w + '" height="' + h + '" fill="#fdfbf4"/>');
    }
    var cx = w / 2, cy = h * 0.42, r = Math.min(w, h) * 0.19;
    o.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>');
    o.push('<circle cx="' + (cx - r * 0.38) + '" cy="' + (cy - r * 0.15) + '" r="' + (r * 0.17) + '" fill="' + INK + '"/>');
    o.push('<circle cx="' + (cx + r * 0.38) + '" cy="' + (cy - r * 0.15) + '" r="' + (r * 0.17) + '" fill="' + INK + '"/>');
    o.push('<path d="M' + (cx - r * 0.45) + ' ' + (cy + r * 0.45) + ' Q' + cx + ' ' + (cy + r * 0.95) + ' ' + (cx + r * 0.45) + ' ' + (cy + r * 0.45) + '"/>');
    o.push('<path d="M' + (cx - r * 1.9) + ' ' + (cy + r * 1.9) + ' L' + (cx + r * 1.9) + ' ' + (cy + r * 0.6) + '"/>');
    o.push('<path d="M' + (cx - r * 1.9) + ' ' + (cy + r * 0.6) + ' L' + (cx + r * 1.9) + ' ' + (cy + r * 1.9) + '"/>');
    o.push('</g>');
    return o.join('');
  }

  function barrel(x, y, s) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + s + ')" stroke="' + INK + '" stroke-width="3" fill="none">' +
      '<circle cx="0" cy="0" r="26"/><path d="M-26 0 L26 0"/><path d="M0 -26 L0 26"/></g>';
  }

  function waves(yBase, count, amp, opacity) {
    var o = [];
    for (var i = 0; i < count; i++) {
      var yy = yBase + i * 34;
      var d = 'M-40 ' + yy;
      for (var x = -40; x < 1660; x += 90) {
        d += ' q22 ' + (-amp - (i % 2) * 4) + ' 45 0 q22 ' + (amp + 4) + ' 45 0';
      }
      o.push('<path d="' + d + '" stroke="' + INK_SOFT + '" stroke-width="2.6" fill="none" opacity="' + (opacity || 0.85) + '"/>');
    }
    return o.join('');
  }

  function clouds() {
    return '<g stroke="' + INK_SOFT + '" stroke-width="2.4" fill="none" opacity="0.6">' +
      '<path d="M150 120 q30 -34 66 -12 q28 -30 62 4 q34 -6 30 24"/>' +
      '<path d="M1120 96 q34 -38 74 -14 q30 -26 60 8"/>' +
      '</g>';
  }

  function sun(x, y) {
    var o = ['<g stroke="' + INK_SOFT + '" stroke-width="2.6" fill="none" opacity="0.75">'];
    o.push('<circle cx="' + x + '" cy="' + y + '" r="46"/>');
    for (var a = 0; a < 12; a++) {
      var r = a * Math.PI / 6;
      o.push('<path d="M' + (x + Math.cos(r) * 56) + ' ' + (y + Math.sin(r) * 56) +
        ' L' + (x + Math.cos(r) * 78) + ' ' + (y + Math.sin(r) * 78) + '"/>');
    }
    o.push('</g>');
    return o.join('');
  }

  function shipSilhouette(x, y, s, flip) {
    s = s || 1;
    return '<g transform="translate(' + x + ',' + y + ') scale(' + (s * (flip ? -1 : 1)) + ',' + s + ')" ' +
      'stroke="' + INK + '" stroke-width="3.2" fill="none" stroke-linejoin="round">' +
      '<path d="M-130 0 L130 0 L96 54 L-96 54 Z" fill="#fdfbf4"/>' +
      '<path d="M0 0 L0 -170"/>' +
      '<path d="M0 -160 L96 -60 L0 -46 Z" fill="#fdfbf4"/>' +
      '<path d="M0 -150 L-88 -70 L0 -56 Z" fill="#fdfbf4"/>' +
      jollyRoger(-26, -206, 52, 34) +
      '</g>';
  }

  /* ---------------- sets ---------------- */
  var SETS = {

    /* Page 1 — the cover: a doorway, a kid stepping out toward the sea */
    cover: function () {
      return waves(700, 4, 10, 0.5) +
        '<path d="M0 640 L1600 640" stroke="' + INK + '" stroke-width="3"/>' +
        '<rect x="470" y="300" width="300" height="345" stroke="' + INK + '" stroke-width="4" fill="none"/>' +
        '<path d="M470 645 Q900 700 1240 660" stroke="' + INK_SOFT + '" stroke-width="3" fill="none"/>' +
        sun(1300, 190);
    },

    /* Page 2 — Ranashakoren Island */
    island: function () {
      return '<path d="M0 660 L1600 660" stroke="' + INK + '" stroke-width="3.4"/>' +
        waves(720, 3, 9, 0.5) +
        '<g stroke="' + INK + '" stroke-width="3.4" fill="none">' +
        '<rect x="150" y="300" width="430" height="150" fill="#fdfbf4"/>' +
        '<path d="M230 450 L230 660 M500 450 L500 660"/>' +
        '</g>' +
        '<text x="365" y="356" text-anchor="middle" font-family="var(--hand)" font-size="40" fill="' + INK + '">Welcome to</text>' +
        '<text x="365" y="404" text-anchor="middle" font-family="var(--hand)" font-size="40" fill="' + INK + '">Ranashakoren</text>' +
        '<text x="365" y="440" text-anchor="middle" font-family="var(--hand)" font-size="34" fill="' + INK + '">Island!</text>' +
        clouds() + sun(1360, 170);
    },

    /* Page 2 — open water, the crew sails on */
    sea: function () {
      return '<path d="M0 470 L1600 470" stroke="' + INK + '" stroke-width="3"/>' +
        clouds() + sun(230, 170) + waves(560, 6, 12, 0.75);
    },

    /* Page 2/3 — the deck of the ship */
    deck: function () {
      return '<path d="M0 470 L1600 470" stroke="' + INK_SOFT + '" stroke-width="2.6"/>' +
        waves(500, 2, 8, 0.4) +
        '<g stroke="' + INK + '" stroke-width="3.4" fill="none">' +
        '<path d="M0 690 L1600 690"/>' +
        '<path d="M0 760 L1600 760" stroke-width="2.4" stroke="' + INK_SOFT + '"/>' +
        '<path d="M0 830 L1600 830" stroke-width="2.4" stroke="' + INK_SOFT + '"/>' +
        '<path d="M120 690 L120 620 M340 690 L340 620 M560 690 L560 620 M1040 690 L1040 620 M1260 690 L1260 620 M1480 690 L1480 620"/>' +
        '<path d="M60 620 L1540 620"/>' +
        '<path d="M800 690 L800 90"/>' +
        '</g>' +
        jollyRoger(806, 96, 150, 100) +
        '<g stroke="' + INK_SOFT + '" stroke-width="2.2" fill="none">' +
        '<path d="M800 200 L560 690 M800 200 L1040 690"/></g>' +
        barrel(180, 640, 1.1) + barrel(1400, 648, 1.0);
    },

    /* Page 2 — "Full speed ahead!!!" */
    shipfar: function () {
      return '<path d="M0 500 L1600 500" stroke="' + INK_SOFT + '" stroke-width="2.6"/>' +
        clouds() + shipSilhouette(760, 560, 1.35) + waves(600, 5, 14, 0.8);
    },

    /* Page 3 — the lookout in the rigging */
    crowsnest: function () {
      return '<path d="M0 560 L1600 560" stroke="' + INK_SOFT + '" stroke-width="2.4"/>' +
        clouds() + waves(620, 4, 10, 0.5) +
        '<g stroke="' + INK + '" stroke-width="3.6" fill="none">' +
        '<path d="M760 900 L760 300"/>' +
        '<path d="M620 300 L900 300"/>' +
        '<rect x="640" y="300" width="240" height="120" fill="#fdfbf4"/>' +
        '<path d="M640 300 L400 900 M880 300 L1120 900" stroke-width="2.2" stroke="' + INK_SOFT + '"/>' +
        '<path d="M560 480 L960 480 M520 620 L1000 620 M480 760 L1040 760" stroke-width="2" stroke="' + INK_SOFT + '"/>' +
        '</g>';
    },

    /* Page 3 — the chart: three islands, "where is it now?" */
    chart: function () {
      return '<rect x="180" y="120" width="1240" height="700" fill="#fdfbf4" stroke="' + INK + '" stroke-width="4"/>' +
        '<g stroke="' + INK + '" stroke-width="3.4" fill="none">' +
        '<circle cx="480" cy="330" r="72"/><circle cx="480" cy="330" r="8" fill="' + INK + '"/>' +
        '<circle cx="820" cy="560" r="86"/><circle cx="820" cy="560" r="8" fill="' + INK + '"/>' +
        '<circle cx="1150" cy="300" r="64"/><circle cx="1150" cy="300" r="8" fill="' + INK + '"/>' +
        '</g>' +
        '<g stroke="' + INK_SOFT + '" stroke-width="3" fill="none" stroke-dasharray="14 16">' +
        '<path d="M480 330 Q650 400 820 560 Q1010 470 1150 300"/></g>' +
        '<g stroke="' + INK_SOFT + '" stroke-width="2.2" fill="none" opacity="0.7">' +
        '<path d="M240 700 q20 -12 40 0 q20 12 40 0 M300 760 q20 -12 40 0 q20 12 40 0"/></g>';
    },

    /* Page 4 — the ship is hit */
    attack: function () {
      return '<path d="M0 500 L1600 500" stroke="' + INK_SOFT + '" stroke-width="2.4"/>' +
        waves(600, 5, 16, 0.9) +
        '<g stroke="' + INK + '" stroke-width="4" fill="none" stroke-linejoin="round">' +
        '<path d="M980 300 L1120 210 L1090 330 L1250 300 L1150 400 L1300 420 L1130 470 L1230 560 L1060 520 L1080 640 L960 540 L900 650 L880 520 L760 580 L820 460 L680 470 L800 390 L700 300 L860 340 L840 200 Z" fill="#fdfbf4"/>' +
        '</g>' +
        '<text x="1000" y="440" text-anchor="middle" font-family="var(--hand)" font-size="112" font-weight="bold" fill="' + INK + '">BOOM</text>' +
        shipSilhouette(420, 700, 0.9);
    },

    /* Page 4 — the wreck of their ship and their flag */
    wreck: function () {
      return '<path d="M0 520 L1600 520" stroke="' + INK_SOFT + '" stroke-width="2.4"/>' +
        waves(640, 4, 14, 0.8) +
        '<g stroke="' + INK + '" stroke-width="3.6" fill="none" stroke-linejoin="round">' +
        '<path d="M420 640 L1180 640 L1090 780 L520 780 Z" fill="#fdfbf4"/>' +
        '<path d="M700 640 L700 240 L660 300 L700 340"/>' +
        '<path d="M700 460 L1000 520" stroke="' + INK_SOFT + '" stroke-width="2.4"/>' +
        '</g>' +
        jollyRoger(706, 250, 190, 130, true) +
        '<g stroke="' + INK_SOFT + '" stroke-width="3" fill="none">' +
        '<path d="M980 640 q30 -60 -10 -110 q60 -30 20 -100"/>' +
        '<path d="M1080 660 q26 -50 -8 -92"/></g>';
    },

    /* Page 5 — the bounty poster, held up close */
    poster: function () {
      /* everything stays above y≈660 so the caption bar never covers the wording */
      return '<rect x="380" y="46" width="840" height="606" rx="6" fill="#fdfbf4" stroke="' + INK + '" stroke-width="5"/>' +
        '<g stroke="' + INK_SOFT + '" stroke-width="2.6" fill="none">' +
        '<path d="M420 96 L1180 96 M420 130 L1120 130"/></g>' +
        '<rect x="580" y="158" width="440" height="252" fill="none" stroke="' + INK + '" stroke-width="4"/>' +
        '<g transform="translate(800,300) scale(2.2)" stroke="' + INK + '" stroke-width="1.8" fill="none">' +
        '<circle cx="0" cy="-14" r="26"/>' +
        '<circle cx="-9" cy="-18" r="3" fill="' + INK + '"/><circle cx="9" cy="-18" r="3" fill="' + INK + '"/>' +
        '<path d="M-11 -2 Q0 8 11 -2"/>' +
        '<path d="M-18 -32 L-22 -44 M0 -40 L0 -52 M18 -32 L22 -44"/>' +
        '<rect x="-18" y="16" width="36" height="26"/>' +
        '</g>' +
        '<text x="800" y="484" text-anchor="middle" font-family="var(--hand)" font-size="46" fill="' + INK + '">Escaped Criminal</text>' +
        '<text x="800" y="544" text-anchor="middle" font-family="var(--hand)" font-size="46" fill="' + INK + '">with 20,000,000</text>' +
        '<text x="800" y="604" text-anchor="middle" font-family="var(--hand)" font-size="46" fill="' + INK + '">berry bounty!</text>';
    },

    /* Page 6 — the Marine ship, "Justice" on the sail */
    justice: function () {
      return '<path d="M0 520 L1600 520" stroke="' + INK_SOFT + '" stroke-width="2.4"/>' + clouds() +
        '<g transform="translate(800,700)" stroke="' + INK + '" stroke-width="4" fill="none" stroke-linejoin="round">' +
        '<path d="M-320 0 L320 0 L250 120 L-250 120 Z" fill="#fdfbf4"/>' +
        '<path d="M0 0 L0 -420"/>' +
        '<path d="M-230 -360 L230 -360 L200 -60 L-200 -60 Z" fill="#fdfbf4"/>' +
        '<path d="M-230 -360 L230 -60 M230 -360 L-230 -60" stroke="' + INK_SOFT + '" stroke-width="2.2"/>' +
        '</g>' +
        '<text x="800" y="490" text-anchor="middle" font-family="var(--hand)" font-size="86" fill="' + INK + '">Justice</text>' +
        waves(790, 3, 12, 0.7);
    },

    /* Page 6 — the cell block */
    cell: function () {
      return '<rect x="0" y="0" width="1600" height="900" fill="#f2eee4"/>' +
        '<g stroke="' + INK_SOFT + '" stroke-width="2.4" fill="none" opacity="0.7">' +
        '<path d="M0 240 L1600 240 M0 420 L1600 420 M0 600 L1600 600"/>' +
        '<path d="M200 60 L200 240 M520 240 L520 420 M900 60 L900 240 M1240 240 L1240 420 M380 420 L380 600 M760 420 L760 600 M1120 420 L1120 600"/>' +
        '</g>' +
        '<g stroke="' + INK + '" stroke-width="5" fill="none">' +
        '<path d="M180 120 L180 780 M340 120 L340 780 M500 120 L500 780 M660 120 L660 780 M820 120 L820 780 M980 120 L980 780 M1140 120 L1140 780 M1300 120 L1300 780 M1420 120 L1420 780"/>' +
        '<path d="M120 120 L1480 120 M120 780 L1480 780 M120 450 L1480 450" stroke-width="6"/>' +
        '</g>';
    },

    /* Page 7 — nothing but voices in the dark */
    dark: function () {
      return '<rect x="0" y="0" width="1600" height="900" fill="#0d0c0b"/>' +
        '<g stroke="#2a2724" stroke-width="2" fill="none" opacity="0.9">' +
        '<path d="M0 300 L1600 300 M0 620 L1600 620 M540 0 L540 900 M1080 0 L1080 900"/></g>';
    },

    /* Page 8 — clamped to the block */
    stocks: function () {
      return '<rect x="0" y="0" width="1600" height="900" fill="#f2eee4"/>' +
        '<g stroke="' + INK_SOFT + '" stroke-width="2.4" fill="none" opacity="0.6">' +
        '<path d="M0 260 L1600 260 M0 520 L1600 520 M300 0 L300 260 M760 260 L760 520 M1180 0 L1180 260"/></g>' +
        '<g stroke="' + INK + '" stroke-width="4" fill="none">' +
        '<rect x="480" y="470" width="640" height="170" fill="#fdfbf4"/>' +
        '<path d="M560 640 L540 800 M1040 640 L1060 800"/>' +
        '<circle cx="546" cy="502" r="13"/><path d="M537 493 L555 511 M555 493 L537 511" stroke-width="2.6"/>' +
        '<circle cx="546" cy="608" r="13"/><path d="M537 599 L555 617 M555 599 L537 617" stroke-width="2.6"/>' +
        '<circle cx="1054" cy="502" r="13"/><path d="M1045 493 L1063 511 M1063 493 L1045 511" stroke-width="2.6"/>' +
        '<circle cx="1054" cy="608" r="13"/><path d="M1045 599 L1063 617 M1063 599 L1045 617" stroke-width="2.6"/>' +
        '<circle cx="440" cy="474" r="11"/><circle cx="404" cy="452" r="11"/><circle cx="368" cy="432" r="11"/>' +
        '<circle cx="1160" cy="474" r="11"/><circle cx="1196" cy="452" r="11"/><circle cx="1232" cy="432" r="11"/>' +
        '<path d="M320 420 q-26 -22 -4 -44 q22 -22 48 0" />' +
        '<path d="M1280 420 q26 -22 4 -44 q-22 -22 -48 0" />' +
        '</g>';
    },

    /* blank sheet for title / act cards */
    paper: function () { return ''; }
  };

  global.RRCast = {
    INK: INK,
    CHARACTERS: CHARACTERS,
    POSES: POSES,
    figure: figure,
    bubble: bubble,
    set: function (name) { return (SETS[name] || SETS.paper)(); },
    props: { jollyRoger: jollyRoger, barrel: barrel, waves: waves, ship: shipSilhouette, sun: sun }
  };
})(window);
