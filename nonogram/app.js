/* ===========================================================================
   Nonograms — the playable part. The puzzle building lives in nonogram.js.
   Saves are namespaced by whoever is logged into the phone, the same way the
   other sub-apps do it, so two people on one device keep separate progress.
   =========================================================================== */

import { cluesFor, lineSolve, generator, FILL, BLANK, UNKNOWN } from './nonogram.js';

const $ = id => document.getElementById(id);
const user = localStorage.getItem('colton_last_user') || 'guest';
const SAVE = 'colton_nono_' + user;
const STATS = 'colton_nono_stats_' + user;

/* Sizes ladder. `fill` is roughly how much of the picture is inked and
   `smooth` rounds the noise into blobs — fewer, longer runs read as easier,
   so Expert gets the least help. */
const TIERS = [
  { id: 'basic',  name: 'Basic',  blurb: 'a gentle warm-up',        size: 5,  fill: 0.56, smooth: 0 },
  { id: 'easy',   name: 'Easy',   blurb: 'the classic size',        size: 10, fill: 0.55, smooth: 1 },
  { id: 'medium', name: 'Medium', blurb: 'needs a bit of patience', size: 15, fill: 0.52, smooth: 1 },
  { id: 'hard',   name: 'Hard',   blurb: 'a proper sit-down',       size: 20, fill: 0.50, smooth: 1 },
  { id: 'expert', name: 'Expert', blurb: 'clear your afternoon',    size: 25, fill: 0.48, smooth: 1 }
];
const tierById = id => TIERS.find(t => t.id === id) || TIERS[0];

/* ------------------------------- game state ------------------------------ */
let tier = TIERS[0];
let n = 5, seed = 0;
let solution = null, rowClues = [], colClues = [];
let player = null;                 // 0 blank, 1 filled, 2 crossed off
let cellEls = [], rowClueEls = [], colClueEls = [];
let clueCols = 0, clueRows = 0;
let mode = 'fill', panning = false;
let elapsed = 0, hints = 0, ticker = null, running = false, won = false;
let undoStack = [], stroke = null;
let zoom = 1, fitSize = 22;

/* --------------------------------- utils --------------------------------- */
function fmtTime(s) {
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
function puzzleCode() { return tier.name.toUpperCase() + '-' + seed.toString(36).toUpperCase(); }

/* ------------------------------- persistence ----------------------------- */
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS)) || {}; } catch (e) { return {}; }
}
function saveStats(s) {
  try { localStorage.setItem(STATS, JSON.stringify(s)); } catch (e) {}
}
function recordWin() {
  const s = loadStats();
  const row = s[tier.id] || { solved: 0, best: null };
  row.solved++;
  const clean = hints === 0;
  if (clean && (row.best === null || elapsed < row.best)) row.best = elapsed;
  s[tier.id] = row;
  saveStats(s);
  return { row, clean, record: clean && row.best === elapsed };
}

function save() {
  if (!solution) return;
  try {
    localStorage.setItem(SAVE, JSON.stringify({
      v: 1, tier: tier.id, seed,
      player: Array.from(player).join(''),
      elapsed, hints, won
    }));
  } catch (e) { /* storage full — the game still plays, it just will not resume */ }
}
function clearSave() { try { localStorage.removeItem(SAVE); } catch (e) {} }
function readSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE));
    if (raw && raw.v === 1 && raw.seed != null && !raw.won) return raw;
  } catch (e) {}
  return null;
}

/* --------------------------------- menu ---------------------------------- */
function renderMenu() {
  const stats = loadStats();
  const list = $('tierList');
  list.innerHTML = '';
  TIERS.forEach(t => {
    const st = stats[t.id];
    const b = document.createElement('button');
    b.className = 'tier';
    b.innerHTML = '<span class="sz">' + t.size + '×' + t.size + '</span>'
      + '<span class="nm">' + t.name + '<small>' + t.blurb + '</small></span>'
      + '<span class="bt">' + (st && st.solved ? st.solved + ' done'
          + (st.best != null ? '<br>best ' + fmtTime(st.best) : '') : '') + '</span>';
    b.addEventListener('click', () => startNew(t));
    list.appendChild(b);
  });

  const held = readSave();
  const note = $('resumeNote');
  note.innerHTML = '';
  if (held) {
    const t = tierById(held.tier);
    const a = document.createElement('button');
    a.className = 'btn wide';
    a.textContent = '↩ Carry on with your ' + t.size + '×' + t.size + ' (' + fmtTime(held.elapsed || 0) + ')';
    a.addEventListener('click', () => resume(held));
    note.appendChild(a);
  }
}
function showMenu() {
  stopClock();
  renderMenu();
  $('menu').classList.add('show');
}

/* ------------------------------ new puzzle ------------------------------- */
function startNew(t, forcedSeed) {
  tier = t;
  n = t.size;
  seed = forcedSeed != null ? forcedSeed : (Math.random() * 4294967296) >>> 0;
  $('menu').classList.remove('show');
  $('winVeil').classList.remove('show');
  $('working').classList.add('show');
  $('workingText').textContent = n >= 20
    ? 'Drawing a ' + n + '×' + n + ' grid, then checking the clues pin down one and only one picture. This size takes a few tries.'
    : 'Drawing a grid, then checking the clues pin down one and only one picture.';

  const gen = generator(n, t.fill, t.smooth, seed);
  // Build across frames so the page stays alive on the big boards.
  (function spin() {
    const res = gen.step(24);
    if (!res.done) { requestAnimationFrame(spin); return; }
    solution = res.sol;
    rowClues = res.rows;
    colClues = res.cols;
    player = new Int8Array(n * n);
    elapsed = 0; hints = 0; won = false; undoStack = [];
    $('working').classList.remove('show');
    build();
    startClock();
    save();
  })();
}

function resume(held) {
  tier = tierById(held.tier);
  n = tier.size;
  seed = held.seed;
  $('menu').classList.remove('show');
  $('working').classList.add('show');
  const gen = generator(n, tier.fill, tier.smooth, seed);
  (function spin() {
    const res = gen.step(24);
    if (!res.done) { requestAnimationFrame(spin); return; }
    solution = res.sol;
    rowClues = res.rows;
    colClues = res.cols;
    player = new Int8Array(n * n);
    const saved = String(held.player || '');
    for (let i = 0; i < n * n && i < saved.length; i++) player[i] = Number(saved[i]) || 0;
    elapsed = held.elapsed || 0; hints = held.hints || 0; won = false; undoStack = [];
    $('working').classList.remove('show');
    build();
    startClock();
  })();
}

/* ------------------------------ board build ------------------------------ */
function build() {
  clueCols = Math.max(1, ...rowClues.map(c => c.length || 1));
  clueRows = Math.max(1, ...colClues.map(c => c.length || 1));
  const board = $('board');
  board.className = '';
  board.style.gridTemplateColumns = 'repeat(' + (clueCols + n) + ', var(--cs))';
  board.innerHTML = '';
  cellEls = new Array(n * n);
  rowClueEls = []; colClueEls = [];
  for (let r = 0; r < n; r++) rowClueEls.push([]);
  for (let c = 0; c < n; c++) colClueEls.push([]);

  const frag = document.createDocumentFragment();

  // column clues, bottom-aligned above their column
  for (let cr = 0; cr < clueRows; cr++) {
    for (let i = 0; i < clueCols; i++) frag.appendChild(el('div', 'corner'));
    for (let c = 0; c < n; c++) {
      const clue = colClues[c];
      const idx = clue.length - (clueRows - cr);
      const d = el('div', 'clue' + (c % 5 === 0 ? ' gl' : '') + (cr === 0 ? ' gt' : ''));
      if (idx >= 0) d.textContent = clue[idx];
      else if (clue.length === 0 && cr === clueRows - 1) d.textContent = '0';
      d.dataset.col = c;
      frag.appendChild(d);
      colClueEls[c].push(d);
    }
  }

  // rows: their clues right-aligned, then the cells
  for (let r = 0; r < n; r++) {
    const clue = rowClues[r];
    for (let cc = 0; cc < clueCols; cc++) {
      const idx = clue.length - (clueCols - cc);
      const d = el('div', 'clue' + (r % 5 === 0 ? ' gt' : ''));
      if (idx >= 0) d.textContent = clue[idx];
      else if (clue.length === 0 && cc === clueCols - 1) d.textContent = '0';
      d.dataset.row = r;
      frag.appendChild(d);
      rowClueEls[r].push(d);
    }
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      let cls = 'cell';
      if (c % 5 === 0) cls += ' gl';
      if (r % 5 === 0) cls += ' gt';
      if (c === n - 1) cls += ' ge';
      if (r === n - 1) cls += ' gb';
      const d = el('div', cls);
      d.dataset.i = i;
      frag.appendChild(d);
      cellEls[i] = d;
    }
  }
  board.appendChild(frag);

  // the crosshair points into the old grid, which no longer exists
  litRow = -1; litCol = -1;
  zoom = 1;
  setPan(false);
  sizeBoard();
  paintAll();
  refreshClues();
  updateBar();
}
function el(tag, cls) { const d = document.createElement(tag); d.className = cls; return d; }

function sizeBoard() {
  const wrap = $('boardWrap');
  const cols = clueCols + n, rows = clueRows + n;
  const w = wrap.clientWidth - 12, h = wrap.clientHeight - 12;
  fitSize = Math.max(9, Math.min(46, Math.floor(Math.min(w / cols, h / rows))));
  const cs = Math.max(9, Math.round(fitSize * zoom));
  $('board').style.setProperty('--cs', cs + 'px');
  const overflows = cs * cols > w || cs * rows > h;
  $('panBtn').style.display = overflows ? '' : 'none';
  if (!overflows && panning) setPan(false);
}
window.addEventListener('resize', () => { if (solution) sizeBoard(); });

/* ------------------------------- painting -------------------------------- */
function paintCell(i) {
  const d = cellEls[i];
  if (!d) return;
  d.classList.toggle('on', player[i] === 1);
  d.classList.toggle('x', player[i] === 2);
}
function paintAll() { for (let i = 0; i < n * n; i++) paintCell(i); }

/** Dim a line's clue once the squares in it match the clue exactly. */
function lineDone(vals, clue) {
  const runs = [];
  let run = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === 1) run++;
    else if (run) { runs.push(run); run = 0; }
  }
  if (run) runs.push(run);
  if (runs.length !== clue.length) return false;
  for (let i = 0; i < runs.length; i++) if (runs[i] !== clue[i]) return false;
  return true;
}
function refreshClues() {
  const line = new Int8Array(n);
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < n; i++) line[i] = player[r * n + i];
    const done = lineDone(line, rowClues[r]);
    rowClueEls[r].forEach(d => d.classList.toggle('done', done));
  }
  for (let c = 0; c < n; c++) {
    for (let i = 0; i < n; i++) line[i] = player[i * n + c];
    const done = lineDone(line, colClues[c]);
    colClueEls[c].forEach(d => d.classList.toggle('done', done));
  }
}
function updateBar() {
  $('tierLabel').textContent = tier.name + ' ' + n + '×' + n;
  $('timeLabel').textContent = fmtTime(elapsed);
  $('codeLabel').textContent = puzzleCode();
  let need = 0, have = 0;
  for (let i = 0; i < n * n; i++) {
    if (solution[i] === FILL) { need++; if (player[i] === 1) have++; }
  }
  $('leftLabel').innerHTML = '<small>filled</small> ' + have + '/' + need;
  $('undoBtn').disabled = undoStack.length === 0;
}

/* --------------------------------- clock --------------------------------- */
function startClock() {
  stopClock();
  running = true;
  ticker = setInterval(() => {
    if (!running || won) return;
    elapsed++;
    $('timeLabel').textContent = fmtTime(elapsed);
    if (elapsed % 10 === 0) save();
  }, 1000);
}
function stopClock() { running = false; if (ticker) { clearInterval(ticker); ticker = null; } }
document.addEventListener('visibilitychange', () => { running = !document.hidden && !won && !!solution; });

/* ------------------------------ interaction ------------------------------ */
function setMode(m) {
  mode = m;
  $('fillBtn').classList.toggle('on', m === 'fill');
  $('markBtn').classList.toggle('on', m === 'mark');
}
function setPan(v) {
  panning = v;
  $('panBtn').classList.toggle('on', v);
  $('board').classList.toggle('panning', v);
}

function cellAt(x, y) {
  const t = document.elementFromPoint(x, y);
  if (!t || !t.classList.contains('cell')) return -1;
  return Number(t.dataset.i);
}

function apply(i, want) {
  if (i < 0 || won) return;
  const prev = player[i];
  if (prev === want) return;
  player[i] = want;
  paintCell(i);
  if (stroke) stroke.push({ i, prev });
}

$('board').addEventListener('pointerdown', e => {
  if (panning || won || !solution) return;
  const i = cellAt(e.clientX, e.clientY);
  if (i < 0) return;
  e.preventDefault();
  const cur = player[i];
  const wanted = (e.button === 2 || mode === 'mark') ? 2 : 1;
  stroke = [];
  stroke.want = cur === wanted ? 0 : wanted;    // tapping the same thing again rubs it out
  apply(i, stroke.want);
});
$('board').addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('pointermove', e => {
  if (!stroke) {
    if (solution && !panning) lightUp(cellAt(e.clientX, e.clientY));
    return;
  }
  apply(cellAt(e.clientX, e.clientY), stroke.want);
});
function endStroke() {
  if (!stroke) return;
  if (stroke.length) {
    undoStack.push(stroke);
    if (undoStack.length > 200) undoStack.shift();
    refreshClues();
    updateBar();
    save();
    checkWin();
  }
  stroke = null;
}
window.addEventListener('pointerup', endStroke);
window.addEventListener('pointercancel', endStroke);   // finger dragged off the screen

/* crosshair so your eye can follow a row across a 25-wide board */
let litRow = -1, litCol = -1;
function lightUp(i) {
  const r = i < 0 ? -1 : Math.floor(i / n), c = i < 0 ? -1 : i % n;
  if (r === litRow && c === litCol) return;
  if (litRow >= 0) {
    for (let x = 0; x < n; x++) {
      cellEls[litRow * n + x].classList.remove('lit');
      cellEls[x * n + litCol].classList.remove('lit');
    }
    rowClueEls[litRow].forEach(d => d.classList.remove('lit'));
    colClueEls[litCol].forEach(d => d.classList.remove('lit'));
  }
  litRow = r; litCol = c;
  if (r >= 0) {
    for (let x = 0; x < n; x++) {
      cellEls[r * n + x].classList.add('lit');
      cellEls[x * n + c].classList.add('lit');
    }
    rowClueEls[r].forEach(d => d.classList.add('lit'));
    colClueEls[c].forEach(d => d.classList.add('lit'));
  }
}

/* --------------------------------- buttons -------------------------------- */
$('fillBtn').addEventListener('click', () => setMode('fill'));
$('markBtn').addEventListener('click', () => setMode('mark'));
$('panBtn').addEventListener('click', () => setPan(!panning));
$('newBtn').addEventListener('click', showMenu);
$('menuBtn2').addEventListener('click', showMenu);
$('againBtn').addEventListener('click', () => startNew(tier));
$('zoomIn').addEventListener('click', () => { zoom = Math.min(3.5, zoom * 1.3); sizeBoard(); });
$('zoomOut').addEventListener('click', () => { zoom = Math.max(1, zoom / 1.3); sizeBoard(); });

$('undoBtn').addEventListener('click', () => {
  const last = undoStack.pop();
  if (!last) return;
  for (let k = last.length - 1; k >= 0; k--) { player[last[k].i] = last[k].prev; paintCell(last[k].i); }
  refreshClues();
  updateBar();
  save();
});

/* A hint fills in one square you could have worked out, and says which rule
   would have got you there. It never lies and never guesses. */
$('hintBtn').addEventListener('click', () => {
  if (!solution || won) return;
  const known = new Int8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    if (player[i] === 1 && solution[i] === FILL) known[i] = FILL;
    else if (player[i] === 2 && solution[i] === BLANK) known[i] = BLANK;
  }
  const res = lineSolve(n, rowClues, colClues, known);
  const picks = [];
  for (let i = 0; i < n * n; i++) {
    const truth = solution[i] === FILL ? 1 : 2;
    if (player[i] !== truth && res.ok && res.grid[i] !== UNKNOWN) picks.push(i);
  }
  const provable = picks.length > 0;
  if (!provable) {
    for (let i = 0; i < n * n; i++) if (player[i] !== (solution[i] === FILL ? 1 : 2)) picks.push(i);
  }
  if (!picks.length) { toast('Nothing left to give away.'); return; }
  const i = picks[Math.floor(Math.random() * picks.length)];
  const stk = [{ i, prev: player[i] }];
  player[i] = solution[i] === FILL ? 1 : 2;
  paintCell(i);
  cellEls[i].classList.remove('hint');
  void cellEls[i].offsetWidth;
  cellEls[i].classList.add('hint');
  undoStack.push(stk);
  hints++;
  refreshClues();
  updateBar();
  save();
  checkWin();
  toast('Row ' + (Math.floor(i / n) + 1) + ', column ' + (i % n + 1)
    + (provable ? ' — you had enough to work that one out.' : ' — filled in for you.'));
});

/* Check only ever points at squares you filled that should be empty. Missing
   squares are not mistakes, they are just squares you have not done yet. */
$('checkBtn').addEventListener('click', () => {
  if (!solution || won) return;
  let wrong = 0;
  for (let i = 0; i < n * n; i++) {
    if (player[i] === 1 && solution[i] !== FILL) {
      wrong++;
      cellEls[i].classList.remove('bad');
      void cellEls[i].offsetWidth;
      cellEls[i].classList.add('bad');
    }
  }
  toast(wrong ? wrong + (wrong === 1 ? ' square is' : ' squares are') + ' filled in wrong' : 'No mistakes so far.');
});

$('codeGo').addEventListener('click', () => {
  const raw = ($('codeInput').value || '').trim().toUpperCase();
  const m = raw.match(/^([A-Z]+)[-\s]?([0-9A-Z]+)$/);
  const t = m && TIERS.find(x => x.name.toUpperCase() === m[1]);
  const s = m ? parseInt(m[2], 36) : NaN;
  if (!t || !isFinite(s)) { toast('That code did not look right.'); return; }
  startNew(t, s >>> 0);
});
$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('codeGo').click(); });

/* ---------------------------------- win ---------------------------------- */
function checkWin() {
  for (let i = 0; i < n * n; i++) {
    const should = solution[i] === FILL;
    if (should !== (player[i] === 1)) return;
  }
  won = true;
  stopClock();
  lightUp(-1);
  for (let i = 0; i < n * n; i++) if (player[i] === 2) { player[i] = 0; paintCell(i); }
  $('board').classList.add('solved');
  const { row, clean, record } = recordWin();
  clearSave();
  $('winTitle').textContent = record ? 'NEW BEST' : 'SOLVED';
  $('winText').textContent = tier.name + ' ' + n + '×' + n + ' in ' + fmtTime(elapsed)
    + (hints ? ' with ' + hints + (hints === 1 ? ' hint' : ' hints') : ' with no hints')
    + '. That is ' + row.solved + ' at this size'
    + (row.best != null ? ', best ' + fmtTime(row.best) : '') + '.'
    + (clean ? '' : ' Hinted runs do not set a best time.');
  $('winCode').textContent = puzzleCode();
  setTimeout(() => $('winVeil').classList.add('show'), 900);
}

/* --------------------------------- boot ---------------------------------- */
$('who').textContent = user === 'guest' ? '' : user;
setMode('fill');
renderMenu();
