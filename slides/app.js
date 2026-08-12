/* ===========================================================================
   Slides — the app. Home shelf, the editor, and playing a deck.

   One renderer draws a slide, and everything else reuses it: the big editing
   canvas, the little thumbnails down the side, the cards on the home screen
   and the full-screen show are all the same 1600x900 page with a different
   scale on it. Fix a drawing bug once and it is fixed in all four places.
   =========================================================================== */

import {
  W, H, THEMES, themeById, FONTS, fontById, PALETTE, SHAPES, STICKERS,
  LAYOUTS, TEMPLATES, newDeck, newSlide, textEl, shapeEl, stickerEl, imageEl,
  loadDecks, saveDecks, clone, shrinkImage, USER
} from './store.js';

const $ = id => document.getElementById(id);
const div = cls => { const d = document.createElement('div'); if (cls) d.className = cls; return d; };

let decks = loadDecks();
let deck = null, slideIx = 0, selId = null;
let scale = 1, editing = false;
let undoStack = [], redoStack = [];
let playIx = 0;

/* -------------------------------- helpers -------------------------------- */
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}
function when(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hrs / 24);
  if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
  return new Date(ts).toLocaleDateString();
}
const slide = () => deck.slides[slideIx];
const selected = () => (selId ? slide().els.find(e => e.id === selId) : null);

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const err = saveDecks(decks);
    if (err) toast(err);
  }, 350);
}
function touch() { if (deck) deck.updated = Date.now(); persist(); }

function pushUndo() {
  if (!deck) return;
  undoStack.push(clone(deck));
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
  refreshUndoButtons();
}
function swapDeck(next) {
  const i = decks.findIndex(d => d.id === deck.id);
  deck = next;
  if (i >= 0) decks[i] = next;
  if (slideIx >= deck.slides.length) slideIx = deck.slides.length - 1;
  selId = null;
  $('deckTitle').value = deck.title;      // undo can roll back a rename too
  drawAll();
  touch();
}
function refreshUndoButtons() {
  $('undoBtn').disabled = undoStack.length === 0;
  $('redoBtn').disabled = redoStack.length === 0;
}

/* ============================== DRAWING ================================== */
function starPoints(n, outer, inner) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI / n) * i - Math.PI / 2;
    pts.push((50 + r * Math.cos(a)).toFixed(1) + ',' + (50 + r * Math.sin(a)).toFixed(1));
  }
  return pts.join(' ');
}
const SHAPE_SVG = {
  rect:     '<rect x="1" y="1" width="98" height="98"/>',
  round:    '<rect x="1" y="1" width="98" height="98" rx="14" ry="14"/>',
  ellipse:  '<ellipse cx="50" cy="50" rx="49" ry="49"/>',
  triangle: '<polygon points="50,2 98,97 2,97"/>',
  star:     '<polygon points="' + starPoints(5, 48, 19) + '"/>',
  burst:    '<polygon points="' + starPoints(12, 49, 32) + '"/>',
  heart:    '<path d="M50,90 C20,66 3,48 3,30 C3,15 14,5 27,5 C38,5 46,11 50,19 C54,11 62,5 73,5 C86,5 97,15 97,30 C97,48 80,66 50,90 Z"/>',
  arrow:    '<polygon points="2,34 60,34 60,10 98,50 60,90 60,66 2,66"/>'
};
export function shapeMarkup(shape, fill, stroke, strokeW) {
  return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" fill="' + fill
    + '" stroke="' + (stroke || 'none') + '" stroke-width="' + (strokeW || 0) + '">'
    + (SHAPE_SVG[shape] || SHAPE_SVG.rect) + '</svg>';
}

/** Build the DOM for one thing on a slide. */
function buildEl(el, theme) {
  const node = div('el ' + el.type);
  node.dataset.id = el.id;
  node.style.left = el.x + 'px';
  node.style.top = el.y + 'px';
  node.style.width = el.w + 'px';
  node.style.height = el.h + 'px';
  if (el.rot) node.style.transform = 'rotate(' + el.rot + 'deg)';

  const inner = div('inner');
  if (el.type === 'text') {
    inner.style.flexDirection = 'column';
    inner.style.justifyContent = el.valign === 'top' ? 'flex-start'
      : el.valign === 'bottom' ? 'flex-end' : 'center';
    inner.style.fontSize = el.size + 'px';
    inner.style.fontFamily = fontById(el.font).css;
    inner.style.color = el.color || theme.ink;
    inner.style.fontWeight = el.bold ? '800' : '400';
    inner.style.fontStyle = el.italic ? 'italic' : 'normal';
    inner.style.textDecoration = el.underline ? 'underline' : 'none';
    inner.style.textAlign = el.align;
    inner.style.lineHeight = '1.25';
    if (el.list) {
      el.text.split('\n').forEach(lineText => {
        const row = div('li');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.textContent = '•';
        const body = document.createElement('span');
        body.textContent = lineText;
        row.appendChild(dot);
        row.appendChild(body);
        inner.appendChild(row);
      });
    } else {
      const body = div('');
      body.style.whiteSpace = 'pre-wrap';
      body.style.width = '100%';
      body.textContent = el.text;
      inner.appendChild(body);
    }
  } else if (el.type === 'sticker') {
    inner.style.fontSize = Math.min(el.w, el.h) * 0.84 + 'px';
    inner.textContent = el.char;
  } else if (el.type === 'shape') {
    inner.innerHTML = shapeMarkup(el.shape, el.fill || theme.accent, el.stroke, el.strokeW);
  } else if (el.type === 'image') {
    if (el.src) {
      const img = document.createElement('img');
      img.src = el.src;
      img.style.objectFit = el.fit || 'cover';
      img.draggable = false;
      inner.appendChild(img);
    } else {
      inner.style.background = theme.soft;
      inner.style.alignItems = 'center';
      inner.style.justifyContent = 'center';
      inner.style.fontSize = '64px';
      inner.textContent = '🖼️';
    }
  }
  node.appendChild(inner);
  return node;
}

/** Draw a whole slide into a .page element at its natural 1600x900 size. */
function paintPage(pageEl, sl, dk) {
  const theme = themeById(dk.theme);
  pageEl.style.width = W + 'px';
  pageEl.style.height = H + 'px';
  pageEl.style.background = sl.bg || theme.bg;
  pageEl.innerHTML = '';
  sl.els.forEach(el => pageEl.appendChild(buildEl(el, theme)));
}

/** Drop a scaled, non-interactive copy of a slide into any sized box. */
function mountThumb(host, sl, dk) {
  host.innerHTML = '';
  const p = div('page');
  p.style.pointerEvents = 'none';
  paintPage(p, sl, dk);
  host.appendChild(p);
  host.dataset.thumb = '1';
  p.style.transform = 'scale(' + (host.clientWidth / W) + ')';
}
/* Rescale every thumbnail on screen. Walking the DOM beats keeping a list:
   thumbnails get thrown away and rebuilt constantly, and a stale list would
   quietly pin the old ones in memory. */
function refitThumbs() {
  document.querySelectorAll('[data-thumb]').forEach(host => {
    const p = host.firstChild;
    if (p) p.style.transform = 'scale(' + (host.clientWidth / W) + ')';
  });
}
window.addEventListener('resize', refitThumbs);

/* ================================ HOME =================================== */
function showHome() {
  $('home').classList.add('on');
  $('editor').classList.remove('on');
  $('present').classList.remove('on');
  deck = null;
  drawHome();
}
function drawHome() {
  $('who').textContent = USER === 'guest' ? '' : USER;
  $('greet').textContent = USER === 'guest' ? 'Make something great' : 'Hi ' + USER + ' — make something great';

  const tpl = $('templates');
  tpl.innerHTML = '';
  TEMPLATES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tcard';
    b.innerHTML = '<span class="em">' + t.emoji + '</span><span class="nm">' + t.name
      + '</span><span class="bl">' + t.blurb + '</span>';
    b.addEventListener('click', () => {
      const d = newDeck(t.id);
      decks.unshift(d);
      saveDecks(decks);
      openDeck(d.id);
    });
    tpl.appendChild(b);
  });

  const area = $('deckArea');
  area.innerHTML = '';
  if (!decks.length) {
    const e = div('empty');
    e.innerHTML = 'Nothing here yet.<br>Pick one of the starting points above and it will show up here.';
    area.appendChild(e);
    return;
  }
  const grid = div('decks');
  decks.slice().sort((a, b) => b.updated - a.updated).forEach(d => {
    const card = div('dcard');
    const thumb = div('thumb');
    card.appendChild(thumb);
    const meta = div('meta');
    const name = div('t');
    name.textContent = d.title;                 // textContent, so a deck called
    const sub = div('d');                       // "<b>hi" is a name and not markup
    sub.textContent = d.slides.length
      + (d.slides.length === 1 ? ' slide · ' : ' slides · ') + when(d.updated);
    meta.appendChild(name);
    meta.appendChild(sub);
    card.appendChild(meta);

    const more = document.createElement('button');
    more.className = 'more';
    more.textContent = '⋯';
    more.addEventListener('click', e => { e.stopPropagation(); deckMenu(more, d); });
    card.appendChild(more);

    card.addEventListener('click', () => openDeck(d.id));
    grid.appendChild(card);
    mountThumb(thumb, d.slides[0], d);
  });
  area.appendChild(grid);
}

function deckMenu(anchor, d) {
  openPop(anchor, pop => {
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (cls || '');
      b.style.width = '100%';
      b.style.marginBottom = '0.35rem';
      b.textContent = label;
      b.addEventListener('click', () => { closePop(); fn(); });
      pop.appendChild(b);
    };
    mk('✏️ Rename', '', () => {
      const name = prompt('What should this be called?', d.title);
      if (name === null) return;
      d.title = name.trim().slice(0, 80) || d.title;
      d.updated = Date.now();
      saveDecks(decks);
      drawHome();
    });
    mk('📄 Make a copy', '', () => {
      const copy = clone(d);
      copy.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      copy.title = d.title + ' (copy)';
      copy.created = copy.updated = Date.now();
      decks.unshift(copy);
      const err = saveDecks(decks);
      if (err) { decks.shift(); toast(err); return; }
      drawHome();
    });
    mk('🗑️ Delete', 'danger', () => {
      if (!confirm('Delete "' + d.title + '"? This cannot be undone.')) return;
      decks = decks.filter(x => x.id !== d.id);
      saveDecks(decks);
      drawHome();
    });
  });
}

/* =============================== EDITOR ================================== */
function openDeck(id) {
  deck = decks.find(d => d.id === id);
  if (!deck) { showHome(); return; }
  slideIx = 0; selId = null; undoStack = []; redoStack = [];
  $('home').classList.remove('on');
  $('present').classList.remove('on');
  $('editor').classList.add('on');
  $('deckTitle').value = deck.title;
  refreshUndoButtons();
  drawAll();
}

function drawAll() { drawRail(); drawCanvas(); drawInspector(); }

function drawRail() {
  const rail = $('rail');
  rail.innerHTML = '';
  deck.slides.forEach((sl, i) => {
    const t = div('sthumb' + (i === slideIx ? ' on' : ''));
    const box = div('box');
    t.appendChild(box);
    const num = div('num');
    num.textContent = i + 1;
    t.appendChild(num);
    t.addEventListener('click', () => { slideIx = i; selId = null; drawAll(); });
    rail.appendChild(t);
    mountThumb(box, sl, deck);
  });
}

/* Repaint one thumbnail rather than the whole strip — this runs at the end of
   every drag, and rebuilding 20 slides each time is wasted work. */
function refreshThumb(i) {
  const host = $('rail').children[i];
  if (host) mountThumb(host.querySelector('.box'), deck.slides[i], deck);
}

function fitCanvas() {
  const wrap = $('stageWrap');
  const pad = 32;
  const k = Math.min((wrap.clientWidth - pad) / W, (wrap.clientHeight - pad) / H);
  scale = Math.max(0.05, k);
  $('page').style.transform = 'scale(' + scale + ')';
  $('stage').style.width = W * scale + 'px';
  $('stage').style.height = H * scale + 'px';
}
function drawCanvas() {
  paintPage($('page'), slide(), deck);
  fitCanvas();
  drawSelection();
}
window.addEventListener('resize', () => {
  if ($('editor').classList.contains('on')) { fitCanvas(); drawSelection(); }
  if ($('present').classList.contains('on')) fitPresent();
});

/* ---------------------------- selection frame ---------------------------- */
const HANDLES = [
  ['nw', 0, 0, -1, -1], ['n', 0.5, 0, 0, -1], ['ne', 1, 0, 1, -1],
  ['e', 1, 0.5, 1, 0], ['se', 1, 1, 1, 1], ['s', 0.5, 1, 0, 1],
  ['sw', 0, 1, -1, 1], ['w', 0, 0.5, -1, 0]
];
function drawSelection() {
  const ov = $('overlay');
  ov.innerHTML = '';
  const el = selected();
  if (!el || editing) return;
  const box = div('selbox');
  box.style.left = el.x * scale + 'px';
  box.style.top = el.y * scale + 'px';
  box.style.width = el.w * scale + 'px';
  box.style.height = el.h * scale + 'px';
  if (el.rot) box.style.transform = 'rotate(' + el.rot + 'deg)';
  HANDLES.forEach(([name, fx, fy, dx, dy]) => {
    const h = div('handle');
    h.style.left = fx * 100 + '%';
    h.style.top = fy * 100 + '%';
    h.dataset.dx = dx;
    h.dataset.dy = dy;
    h.addEventListener('pointerdown', e => startResize(e, dx, dy));
    box.appendChild(h);
  });
  const rot = div('handle rot');
  rot.style.left = '50%';
  rot.style.top = '-26px';
  rot.addEventListener('pointerdown', startRotate);
  box.appendChild(rot);
  ov.appendChild(box);
}

/* ------------------------------ interaction ------------------------------ */
function toWorld(e) {
  const r = $('page').getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}
const rotPt = (x, y, deg) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
};

let drag = null;

$('page').addEventListener('pointerdown', e => {
  if (editing) return;
  const hit = e.target.closest('.el');
  if (!hit) { select(null); return; }
  const el = slide().els.find(x => x.id === hit.dataset.id);
  if (!el) return;
  if (selId !== el.id) select(el.id);
  e.preventDefault();
  const start = toWorld(e);
  drag = { kind: 'move', id: el.id, sx: start.x, sy: start.y, ox: el.x, oy: el.y, moved: false };
});

$('page').addEventListener('dblclick', e => {
  const hit = e.target.closest('.el');
  if (!hit) return;
  const el = slide().els.find(x => x.id === hit.dataset.id);
  if (el && el.type === 'text') beginTextEdit(el);
});

function startResize(e, dx, dy) {
  e.preventDefault();
  e.stopPropagation();
  const el = selected();
  if (!el) return;
  const p = toWorld(e);
  drag = {
    kind: 'size', id: el.id, dx, dy, sx: p.x, sy: p.y,
    o: { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot || 0 }
  };
  pushUndo();
}
function startRotate(e) {
  e.preventDefault();
  e.stopPropagation();
  const el = selected();
  if (!el) return;
  const p = toWorld(e);
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  drag = {
    kind: 'rot', id: el.id, cx, cy,
    start: Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI, o: el.rot || 0
  };
  pushUndo();
}

window.addEventListener('pointermove', e => {
  if (!drag) return;
  const el = slide().els.find(x => x.id === drag.id);
  if (!el) return;
  const p = toWorld(e);

  if (drag.kind === 'move') {
    if (!drag.moved) {
      if (Math.abs(p.x - drag.sx) < 3 && Math.abs(p.y - drag.sy) < 3) return;
      drag.moved = true;
      pushUndo();
    }
    const snapped = snap(el, drag.ox + (p.x - drag.sx), drag.oy + (p.y - drag.sy));
    el.x = snapped.x;
    el.y = snapped.y;
    pendingGuides = snapped.guides;
  } else if (drag.kind === 'size') {
    const o = drag.o;
    const d = rotPt(p.x - drag.sx, p.y - drag.sy, -o.rot);
    let nw = Math.max(40, o.w + d.x * drag.dx);
    let nh = Math.max(40, o.h + d.y * drag.dy);
    if (drag.dx === 0) nw = o.w;
    if (drag.dy === 0) nh = o.h;
    const c0 = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    // keep the corner opposite the handle pinned in place
    const anchorLocal = { x: -drag.dx * o.w / 2, y: -drag.dy * o.h / 2 };
    const aw = rotPt(anchorLocal.x, anchorLocal.y, o.rot);
    const anchor = { x: c0.x + aw.x, y: c0.y + aw.y };
    const backLocal = { x: drag.dx * nw / 2, y: drag.dy * nh / 2 };
    const bw = rotPt(backLocal.x, backLocal.y, o.rot);
    el.w = nw; el.h = nh;
    el.x = anchor.x + bw.x - nw / 2;
    el.y = anchor.y + bw.y - nh / 2;
    if (el.type === 'sticker') el.h = el.w = Math.min(nw, nh);
  } else if (drag.kind === 'rot') {
    const now = Math.atan2(p.y - drag.cy, p.x - drag.cx) * 180 / Math.PI;
    let deg = drag.o + (now - drag.start);
    deg = Math.round(deg / 5) * 5;
    for (const q of [0, 90, 180, 270, 360, -90, -180, -270]) {
      if (Math.abs(deg - q) <= 7) { deg = q; break; }
    }
    el.rot = ((deg % 360) + 360) % 360;
  }
  liveRedraw();
});

window.addEventListener('pointerup', () => {
  if (!drag) return;
  const acted = drag.kind !== 'move' || drag.moved;
  drag = null;
  clearGuides();
  if (acted) { refreshThumb(slideIx); touch(); drawInspector(); }
});
window.addEventListener('pointercancel', () => { drag = null; clearGuides(); });

/* A drag only ever changes one thing's box, so nudge that one node instead of
   redrawing the whole slide on every pointer move. */
function liveRedraw() {
  const el = slide().els.find(x => x.id === drag.id);
  const node = $('page').querySelector('.el[data-id="' + drag.id + '"]');
  if (el && node) {
    node.style.left = el.x + 'px';
    node.style.top = el.y + 'px';
    node.style.width = el.w + 'px';
    node.style.height = el.h + 'px';
    node.style.transform = el.rot ? 'rotate(' + el.rot + 'deg)' : '';
    if (el.type === 'sticker') {
      node.querySelector('.inner').style.fontSize = Math.min(el.w, el.h) * 0.84 + 'px';
    }
  } else {
    paintPage($('page'), slide(), deck);
  }
  drawSelection();
  drawGuides();
}

/* --------------------------------- snapping ------------------------------- */
const SNAP = 9;
let pendingGuides = [];
function clearGuides() {
  pendingGuides = [];
  $('overlay').querySelectorAll('.guide').forEach(g => g.remove());
}
/* Drawn after the selection frame, because that frame rebuilds the overlay. */
function drawGuides() {
  pendingGuides.forEach(([axis, at]) => {
    const g = div('guide');
    if (axis === 'x') {
      g.style.left = at * scale + 'px'; g.style.top = '0'; g.style.width = '1.5px'; g.style.height = '100%';
    } else {
      g.style.top = at * scale + 'px'; g.style.left = '0'; g.style.height = '1.5px'; g.style.width = '100%';
    }
    $('overlay').appendChild(g);
  });
}
function snap(el, nx, ny) {
  const lines = [];
  const targetsX = [0, W / 2, W], targetsY = [0, H / 2, H];
  slide().els.forEach(o => {
    if (o.id === el.id) return;
    targetsX.push(o.x, o.x + o.w / 2, o.x + o.w);
    targetsY.push(o.y, o.y + o.h / 2, o.y + o.h);
  });
  const mine = x => [x, x + el.w / 2, x + el.w];
  let bestX = null;
  mine(nx).forEach((v, i) => {
    targetsX.forEach(t => {
      const d = Math.abs(v - t);
      if (d < SNAP && (!bestX || d < bestX.d)) bestX = { d, shift: t - v, at: t };
    });
  });
  let bestY = null;
  [ny, ny + el.h / 2, ny + el.h].forEach(v => {
    targetsY.forEach(t => {
      const d = Math.abs(v - t);
      if (d < SNAP && (!bestY || d < bestY.d)) bestY = { d, shift: t - v, at: t };
    });
  });
  if (bestX) { nx += bestX.shift; lines.push(['x', bestX.at]); }
  if (bestY) { ny += bestY.shift; lines.push(['y', bestY.at]); }
  return { x: nx, y: ny, guides: lines };
}

/* ------------------------------- text editing ----------------------------- */
function beginTextEdit(el) {
  const node = $('page').querySelector('.el[data-id="' + el.id + '"]');
  if (!node) return;
  editing = true;
  drawSelection();
  const inner = node.querySelector('.inner');
  inner.innerHTML = '';
  const body = div('');
  body.style.whiteSpace = 'pre-wrap';
  body.style.width = '100%';
  body.style.outline = 'none';
  body.textContent = el.text;
  body.contentEditable = 'true';
  inner.appendChild(body);
  body.focus();
  const sel = window.getSelection && window.getSelection();
  if (sel) {                          // start with the placeholder text selected
    const range = document.createRange();
    range.selectNodeContents(body);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const finish = () => {
    if (!editing) return;
    editing = false;
    const next = body.innerText.replace(/\n$/, '');
    if (next !== el.text) { pushUndo(); el.text = next; touch(); }
    drawCanvas();
    drawRail();
  };
  body.addEventListener('blur', finish);
  body.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); body.blur(); }
  });
}

/* -------------------------------- selection ------------------------------- */
function select(id) {
  selId = id;
  drawSelection();
  drawInspector();
}

/* ================================ INSPECTOR ============================== */
function group(label) {
  const g = div('group');
  if (label) {
    const l = document.createElement('label');
    l.textContent = label;
    g.appendChild(l);
  }
  return g;
}
function chip(text, on, fn, title) {
  const b = document.createElement('button');
  b.className = 'btn' + (on ? ' on' : '');
  b.textContent = text;
  if (title) b.title = title;
  b.addEventListener('click', fn);
  return b;
}
function colorRow(current, fn, extra) {
  const wrapEl = div('swatches');
  (extra || []).concat(PALETTE).forEach(c => {
    const b = document.createElement('button');
    b.className = 'sw' + (current === c ? ' on' : '');
    b.style.background = c === 'auto' ? 'linear-gradient(135deg,#fff 45%,#bbb 55%)' : c;
    b.title = c === 'auto' ? 'Match the theme' : c;
    b.addEventListener('click', () => fn(c === 'auto' ? null : c));
    wrapEl.appendChild(b);
  });
  return wrapEl;
}

function drawInspector() {
  const box = $('insp');
  box.innerHTML = '';
  const el = selected();

  if (!el) {
    const g = group('This slide');
    const r = div('rowx');
    r.appendChild(chip('▦ Layout', false, e => layoutPop(e.currentTarget)));
    r.appendChild(chip('🎨 Colour', false, e => bgPop(e.currentTarget)));
    g.appendChild(r);
    const r2 = div('rowx');
    r2.appendChild(chip('📄 Duplicate', false, duplicateSlide));
    r2.appendChild(chip('🗑️ Delete', false, deleteSlide));
    g.appendChild(r2);
    box.appendChild(g);

    const g2 = group('Move slide');
    const r3 = div('rowx');
    r3.appendChild(chip('↑ Earlier', false, () => moveSlide(-1)));
    r3.appendChild(chip('↓ Later', false, () => moveSlide(1)));
    g2.appendChild(r3);
    box.appendChild(g2);

    const tip = div('hint');
    tip.textContent = 'Click anything on the slide to change it. Drag it to move it, or drag a corner to make it bigger.';
    box.appendChild(tip);
    return;
  }

  const set = fn => { pushUndo(); fn(); drawCanvas(); drawRail(); drawInspector(); touch(); };

  if (el.type === 'text') {
    const g = group('Words');
    const sel = document.createElement('select');
    sel.className = 'pick';
    FONTS.forEach(f => {
      const o = document.createElement('option');
      o.value = f.id; o.textContent = f.name;
      o.selected = f.id === el.font;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => set(() => { el.font = sel.value; }));
    g.appendChild(sel);

    const r = div('rowx');
    r.appendChild(chip('A−', false, () => set(() => { el.size = Math.max(12, Math.round(el.size * 0.85)); })));
    r.appendChild(chip('A+', false, () => set(() => { el.size = Math.min(320, Math.round(el.size * 1.18)); })));
    r.appendChild(chip('B', el.bold, () => set(() => { el.bold = !el.bold; }), 'Bold'));
    r.appendChild(chip('I', el.italic, () => set(() => { el.italic = !el.italic; }), 'Italic'));
    r.appendChild(chip('U', el.underline, () => set(() => { el.underline = !el.underline; }), 'Underline'));
    g.appendChild(r);

    const r2 = div('rowx');
    ['left', 'center', 'right'].forEach(a => {
      r2.appendChild(chip({ left: '⟸', center: '↔', right: '⟹' }[a], el.align === a,
        () => set(() => { el.align = a; }), a));
    });
    r2.appendChild(chip('• List', el.list, () => set(() => { el.list = !el.list; })));
    g.appendChild(r2);
    box.appendChild(g);

    const gc = group('Colour');
    gc.appendChild(colorRow(el.color, c => set(() => { el.color = c; }), ['auto']));
    box.appendChild(gc);

    const gt = group('Text');
    const edit = chip('✏️ Edit the words', false, () => beginTextEdit(el));
    edit.style.width = '100%';
    gt.appendChild(edit);
    box.appendChild(gt);
  }

  if (el.type === 'shape') {
    const g = group('Shape');
    const grid = div('grid6');
    SHAPES.forEach(s => {
      const b = document.createElement('button');
      b.className = 'tile';
      b.innerHTML = shapeMarkup(s, el.shape === s ? '#6c5ce7' : '#9aa3b8', 'none', 0);
      b.addEventListener('click', () => set(() => { el.shape = s; }));
      grid.appendChild(b);
    });
    g.appendChild(grid);
    box.appendChild(g);

    const gc = group('Fill');
    gc.appendChild(colorRow(el.fill, c => set(() => { el.fill = c; }), ['auto']));
    box.appendChild(gc);

    const go = group('Outline');
    go.appendChild(colorRow(el.stroke === 'none' ? null : el.stroke,
      c => set(() => { el.stroke = c || 'none'; }), ['auto']));
    const note = div('hint');
    note.textContent = 'The first swatch turns the outline off.';
    go.appendChild(note);
    box.appendChild(go);
  }

  if (el.type === 'sticker') {
    const g = group('Sticker');
    const b = chip('😀 Pick a different one', false, e => stickerPop(e.currentTarget, el));
    b.style.width = '100%';
    g.appendChild(b);
    box.appendChild(g);
  }

  if (el.type === 'image') {
    const g = group('Picture');
    const r = div('rowx');
    r.appendChild(chip('Fill the box', (el.fit || 'cover') === 'cover', () => set(() => { el.fit = 'cover'; })));
    r.appendChild(chip('Show it all', el.fit === 'contain', () => set(() => { el.fit = 'contain'; })));
    g.appendChild(r);
    const rep = chip('🖼️ Change picture', false, () => pickImage(el));
    rep.style.width = '100%';
    g.appendChild(rep);
    box.appendChild(g);
  }

  const ga = group('This thing');
  const r = div('rowx');
  r.appendChild(chip('⬆ Front', false, () => set(() => {
    const i = slide().els.indexOf(el);
    slide().els.splice(i, 1); slide().els.push(el);
  })));
  r.appendChild(chip('⬇ Back', false, () => set(() => {
    const i = slide().els.indexOf(el);
    slide().els.splice(i, 1); slide().els.unshift(el);
  })));
  ga.appendChild(r);
  const r2 = div('rowx');
  r2.appendChild(chip('📄 Copy', false, duplicateEl));
  r2.appendChild(chip('🗑️ Delete', false, deleteEl));
  ga.appendChild(r2);
  if (el.rot) {
    const straight = chip('↺ Straighten', false, () => set(() => { el.rot = 0; }));
    straight.style.width = '100%';
    ga.appendChild(straight);
  }
  box.appendChild(ga);
}

/* ------------------------------ slide actions ----------------------------- */
function addSlideAfter(layout) {
  pushUndo();
  deck.slides.splice(slideIx + 1, 0, newSlide(layout));
  slideIx++;
  selId = null;
  drawAll();
  touch();
}
function duplicateSlide() {
  pushUndo();
  const copy = clone(slide());
  copy.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  copy.els.forEach(e => { e.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); });
  deck.slides.splice(slideIx + 1, 0, copy);
  slideIx++;
  drawAll();
  touch();
}
function deleteSlide() {
  if (deck.slides.length === 1) { toast('A presentation needs at least one slide.'); return; }
  pushUndo();
  deck.slides.splice(slideIx, 1);
  if (slideIx >= deck.slides.length) slideIx = deck.slides.length - 1;
  selId = null;
  drawAll();
  touch();
}
function moveSlide(dir) {
  const to = slideIx + dir;
  if (to < 0 || to >= deck.slides.length) return;
  pushUndo();
  const [s] = deck.slides.splice(slideIx, 1);
  deck.slides.splice(to, 0, s);
  slideIx = to;
  drawAll();
  touch();
}
function addEl(el) {
  pushUndo();
  slide().els.push(el);
  selId = el.id;
  drawAll();
  touch();
}
function duplicateEl() {
  const el = selected();
  if (!el) return;
  pushUndo();
  const copy = clone(el);
  copy.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  copy.x += 30; copy.y += 30;
  slide().els.push(copy);
  selId = copy.id;
  drawAll();
  touch();
}
function deleteEl() {
  const el = selected();
  if (!el) return;
  pushUndo();
  slide().els = slide().els.filter(x => x.id !== el.id);
  selId = null;
  drawAll();
  touch();
}

/* -------------------------------- popovers -------------------------------- */
function closePop() { $('pop').classList.remove('on'); $('pop').innerHTML = ''; }
function openPop(anchor, build) {
  const pop = $('pop');
  pop.innerHTML = '';
  build(pop);
  pop.classList.add('on');
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - pw - 10);
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight - 10) top = Math.max(10, r.top - ph - 8);
  pop.style.left = Math.max(10, left) + 'px';
  pop.style.top = top + 'px';
}
document.addEventListener('pointerdown', e => {
  if ($('pop').classList.contains('on') && !e.target.closest('#pop')) closePop();
}, true);

function heading(pop, text) {
  const h = document.createElement('h4');
  h.textContent = text;
  pop.appendChild(h);
}
function layoutPop(anchor) {
  openPop(anchor, pop => {
    heading(pop, 'Slide layout');
    const grid = div('grid3');
    const bits = {
      title: [[20, 34, 60, 12], [30, 52, 40, 8]],
      header: [[8, 10, 84, 12], [8, 32, 84, 8], [8, 46, 70, 8], [8, 60, 76, 8]],
      two: [[8, 10, 84, 12], [8, 32, 38, 34], [54, 32, 38, 34]],
      photo: [[8, 10, 84, 12], [26, 32, 48, 52]],
      blank: []
    };
    LAYOUTS.forEach(l => {
      const b = document.createElement('button');
      b.className = 'lay';
      const pv = div('pv');
      (bits[l.id] || []).forEach(([x, y, w, h]) => {
        const i = document.createElement('i');
        i.style.left = x + '%'; i.style.top = y + '%';
        i.style.width = w + '%'; i.style.height = h + '%';
        pv.appendChild(i);
      });
      b.appendChild(pv);
      b.appendChild(document.createTextNode(l.name));
      b.addEventListener('click', () => {
        closePop();
        pushUndo();
        const fresh = newSlide(l.id);
        slide().layout = l.id;
        slide().els = fresh.els;
        selId = null;
        drawAll();
        touch();
      });
      grid.appendChild(b);
    });
    pop.appendChild(grid);
    const note = div('hint');
    note.style.marginTop = '0.5rem';
    note.textContent = 'Careful — this replaces what is on the slide. Undo brings it back.';
    pop.appendChild(note);
  });
}
function bgPop(anchor) {
  openPop(anchor, pop => {
    heading(pop, 'Slide colour');
    pop.appendChild(colorRow(slide().bg, c => {
      pushUndo();
      slide().bg = c;
      drawAll();
      touch();
    }, ['auto']));
  });
}
function themePop(anchor) {
  openPop(anchor, pop => {
    heading(pop, 'Theme');
    const grid = div('grid3');
    THEMES.forEach(t => {
      const b = document.createElement('button');
      b.className = 'themetile' + (deck.theme === t.id ? ' on' : '');
      b.style.background = t.bg;
      b.style.color = t.ink;
      const bar = div('bar2');
      bar.style.background = t.accent;
      b.appendChild(bar);
      b.appendChild(document.createTextNode(t.name));
      b.addEventListener('click', () => {
        closePop();
        pushUndo();
        deck.theme = t.id;
        drawAll();
        touch();
      });
      grid.appendChild(b);
    });
    pop.appendChild(grid);
  });
}
function shapePop(anchor) {
  openPop(anchor, pop => {
    heading(pop, 'Add a shape');
    const grid = div('grid6');
    SHAPES.forEach(s => {
      const b = document.createElement('button');
      b.className = 'tile';
      b.innerHTML = shapeMarkup(s, '#6c5ce7', 'none', 0);
      b.addEventListener('click', () => { closePop(); addEl(shapeEl({ shape: s })); });
      grid.appendChild(b);
    });
    pop.appendChild(grid);
  });
}
function stickerPop(anchor, replace) {
  openPop(anchor, pop => {
    heading(pop, replace ? 'Pick a sticker' : 'Add a sticker');
    const grid = div('grid6');
    STICKERS.forEach(s => {
      const b = document.createElement('button');
      b.className = 'tile';
      b.textContent = s;
      b.addEventListener('click', () => {
        closePop();
        if (replace) { pushUndo(); replace.char = s; drawAll(); touch(); }
        else addEl(stickerEl({ char: s }));
      });
      grid.appendChild(b);
    });
    pop.appendChild(grid);
  });
}
function slideMenuPop(anchor) {
  openPop(anchor, pop => {
    heading(pop, 'New slide');
    const grid = div('grid3');
    LAYOUTS.forEach(l => {
      const b = document.createElement('button');
      b.className = 'lay';
      b.textContent = l.name;
      b.addEventListener('click', () => { closePop(); addSlideAfter(l.id); });
      grid.appendChild(b);
    });
    pop.appendChild(grid);
  });
}

/* -------------------------------- pictures -------------------------------- */
let imageTarget = null;
function pickImage(el) { imageTarget = el || null; $('fileIn').click(); }
$('fileIn').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  toast('Adding your picture…');
  shrinkImage(file, 1400, 0.82, (url, ratio) => {
    if (!url) { toast('That picture could not be read.'); return; }
    pushUndo();
    if (imageTarget) {
      imageTarget.src = url;
    } else {
      const h = 460, w = Math.round(h * (ratio || 1.4));
      addEl(imageEl({ src: url, w: Math.min(w, 1200), h, x: (W - Math.min(w, 1200)) / 2, y: (H - h) / 2 }));
    }
    imageTarget = null;
    drawAll();
    const err = saveDecks(decks);
    if (err) toast(err);
  });
});

/* ------------------------------- top buttons ------------------------------ */
$('backHome').addEventListener('click', () => { saveDecks(decks); showHome(); });
$('addSlide').addEventListener('click', e => slideMenuPop(e.currentTarget));
$('addText').addEventListener('click', () => addEl(textEl({ text: 'New words', y: 380 })));
$('addShape').addEventListener('click', e => shapePop(e.currentTarget));
$('addSticker').addEventListener('click', e => stickerPop(e.currentTarget, null));
$('addImage').addEventListener('click', () => pickImage(null));
$('themeBtn').addEventListener('click', e => themePop(e.currentTarget));
$('deckTitle').addEventListener('input', () => {
  deck.title = $('deckTitle').value.slice(0, 80);
  touch();
});
$('helpBtn').addEventListener('click', e => {
  openPop(e.currentTarget, pop => {
    heading(pop, 'How it works');
    const t = div('hint');
    t.innerHTML = '<b>Click</b> anything to pick it up.<br>'
      + '<b>Drag</b> it to move it around. Pink lines show when it lines up.<br>'
      + '<b>Drag a corner</b> to make it bigger or smaller.<br>'
      + '<b>Double-click</b> writing to change the words.<br>'
      + '<b>The round dot</b> on top spins it.<br>'
      + '<b>Delete</b> removes what you picked. <b>Ctrl+Z</b> undoes.<br>'
      + '<b>▶ Play</b> shows it full screen. Arrow keys move along.';
    t.style.maxWidth = '250px';
    pop.appendChild(t);
  });
});
$('undoBtn').addEventListener('click', () => {
  if (!undoStack.length) return;
  redoStack.push(clone(deck));
  swapDeck(undoStack.pop());
  refreshUndoButtons();
});
$('redoBtn').addEventListener('click', () => {
  if (!redoStack.length) return;
  undoStack.push(clone(deck));
  swapDeck(redoStack.pop());
  refreshUndoButtons();
});

/* ================================ PRESENT ================================= */
function fitPresent() {
  const wrap = $('pWrap');
  const k = Math.min(wrap.clientWidth / W, wrap.clientHeight / H);
  $('pPage').style.transform = 'scale(' + k + ')';
  $('pStage').style.width = W * k + 'px';
  $('pStage').style.height = H * k + 'px';
}
function showPlay(i) {
  playIx = Math.max(0, Math.min(deck.slides.length - 1, i));
  paintPage($('pPage'), deck.slides[playIx], deck);
  fitPresent();
  $('pCount').textContent = (playIx + 1) + ' / ' + deck.slides.length;
}
function startPlay() {
  $('editor').classList.remove('on');
  $('present').classList.add('on');
  showPlay(slideIx);
  const bar = $('pbar');
  bar.classList.add('show');
  setTimeout(() => bar.classList.remove('show'), 2200);
}
function endPlay() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('present').classList.remove('on');
  $('editor').classList.add('on');
  slideIx = playIx;
  drawAll();
}
$('playBtn').addEventListener('click', startPlay);
$('pNext').addEventListener('click', e => { e.stopPropagation(); showPlay(playIx + 1); });
$('pPrev').addEventListener('click', e => { e.stopPropagation(); showPlay(playIx - 1); });
$('pExit').addEventListener('click', e => { e.stopPropagation(); endPlay(); });
$('pFull').addEventListener('click', e => {
  e.stopPropagation();
  const node = $('present');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (node.requestFullscreen) node.requestFullscreen().catch(() => toast('Full screen was blocked.'));
});
$('pWrap').addEventListener('click', () => showPlay(playIx + 1));

/* ------------------------------- keyboard --------------------------------- */
document.addEventListener('keydown', e => {
  if ($('present').classList.contains('on')) {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); showPlay(playIx + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); showPlay(playIx - 1); }
    else if (e.key === 'Escape') endPlay();
    else if (e.key === 'Home') showPlay(0);
    else if (e.key === 'End') showPlay(deck.slides.length - 1);
    return;
  }
  if (!$('editor').classList.contains('on') || editing) return;
  const typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'
    || e.target.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) $('redoBtn').click(); else $('undoBtn').click();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); $('redoBtn').click(); return; }
  if (typing) return;
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateEl(); return; }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selected()) { e.preventDefault(); deleteEl(); }
    return;
  }
  if (e.key === 'Escape') { select(null); return; }
  const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (nudge) {
    const el = selected();
    if (!el) return;
    e.preventDefault();
    const step = e.shiftKey ? 1 : 12;
    pushUndo();
    el.x += nudge[0] * step;
    el.y += nudge[1] * step;
    drawCanvas();
    drawRail();
    touch();
  }
});

/* --------------------------------- start ---------------------------------- */
window.addEventListener('beforeunload', () => { if (deck) saveDecks(decks); });
showHome();
