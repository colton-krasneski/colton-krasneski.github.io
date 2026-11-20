/* ============================================================
   One game, whoever is playing it.

   A game is a small record: who is white and black, the clocks,
   and "log" - the list of everything that has happened on the
   board. A log entry is either a move ("e2e4", "e7e8q") or, when
   the console has been at it, a whole new position ("=<FEN>;what
   did it;who did it"). Replaying the log from the start always
   gives the position, the move list and the repetition count.

   An online game keeps that record in the database and both
   players listen to it. A game against the computer, or two people
   at one screen, keeps the very same record in memory. So there is
   one way to change a game - commit(change) - and one place that
   reacts when it has changed - onDoc(record). Everything below is
   built on those two.
   ============================================================ */

import { Chess, START_FEN, WHITE, colourOf, sqName, PIECE_NAMES } from './engine.js';
import { Board } from './board.js';
import { PIECE_URL } from './pieces.js';
import { LEVELS } from './ai.js';
import * as net from './net.js';
import * as fx from './fx.js';
import * as sound from './sound.js';
import {
  $, h, state, settings, shown, isOwner, isBot, avatar, nameTag, tcLabel, tcKind, tcIcon, fmtClock,
  toast, openModal, closeModal, confirmBox, clean, sleep, store, THEMES, showView,
} from './shared.js';

export const G = {
  mode: null,          // 'online' | 'watch' | 'ai' | 'local'
  id: null,            // the game's id in the database, when it has one
  doc: null,           // the record itself
  chess: new Chess(),  // the position right now
  log: [],             // the entries of doc.log that have been played out here
  tokens: [],          // one per entry: what the move list shows
  fens: [START_FEN],   // the position before and after every entry
  my: null,            // 'w', 'b', or null when you are both sides or neither
  wMs: 0, bMs: 0, ts: 0,
  pending: false,      // a move of mine is on its way to the database
  busy: 0,             // rockets in the air: hands off the board
  view: null,          // looking back at an earlier move (index into tokens)
  userFlip: false,
  ended: false, fresh: true,
};

const REACTIONS = ['👍', '😂', '😮', '😭', '😡', '🔥', '💀', '🤝', '👑', '🫡'];
const REASONS = {
  checkmate: 'by checkmate', resign: 'by resignation', timeout: 'on time', stalemate: 'Stalemate: no legal move, but not in check',
  agreed: 'Draw agreed', repetition: 'The same position came up three times', fifty: 'Fifty moves with no capture and no pawn move',
  material: 'Not enough pieces left to give mate', abort: 'Called off before it began', king: 'The king was blown off the board', console: 'Decided from the console',
};

let board = null, onLeave = () => {}, onPlayAgain = () => {};
let unsubGame = null, unsubFx = null, tickTimer = null, queue = Promise.resolve();
let worker = null, askSeq = 0, askedFen = null, lastFlag = 0, lastSecond = -1;
let tab = 'moves', unread = 0, lastEmit = 0, endTimer = null;
const clockEls = { w: null, b: null };

const turn = () => (G.chess.turn === WHITE ? 'w' : 'b');
const other = c => (c === 'w' ? 'b' : 'w');
const isNet = () => G.mode === 'online' || G.mode === 'watch';
const botOf = name => LEVELS[Math.min(LEVELS.length, Math.max(1, +String(name).slice(4) || 1)) - 1];
const kingSquare = c => (c.kings[c.turn] >= 0 && c.inCheck() ? sqName(c.kings[c.turn]) : null);
const clocked = g => !!(g.tc && g.tc.base > 0) && net.countMoves(g.log) >= 2;

/* the name to put on screen for a player in this game */
export function label(name) {
  if (isBot(name)) return botOf(name).name;
  if (typeof name === 'string' && name.startsWith('local:')) return name.slice(6);
  return shown(name);
}
const nameOf = colour => (G.doc ? (colour === 'w' ? G.doc.white : G.doc.black) : '');

/* ================================================================ setup */

export function initGame(opts) {
  onLeave = opts.onLeave;
  onPlayAgain = opts.onPlayAgain;
  board = new Board($('board'), {
    canPick: (sq, ch) => canMoveNow() && colourOf(ch) === turn(),
    targets: sq => G.chess.movesFrom(sq),
    onMove: userMove,
  });
  applyTheme();

  $('gBack').addEventListener('click', () => leave());
  $('gSound').addEventListener('click', () => { settings.sound = !settings.sound; store.set('settings', settings); paintSound(); });
  for (const b of document.querySelectorAll('#viewGame .tab')) b.addEventListener('click', () => showTab(b.dataset.tab));
  $('chatSend').addEventListener('click', sendChat);
  $('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $('actFlip').addEventListener('click', () => { G.userFlip = !G.userFlip; board.setFlip(wantFlip()); renderPlates(); tick(); });
  $('actResign').addEventListener('click', resign);
  $('actDraw').addEventListener('click', offerDraw);
  $('actUndo').addEventListener('click', () => takeBack().catch(e => toast(e.message)));
  $('actShare').addEventListener('click', shareGame);
  $('actRematch').addEventListener('click', askRematch);
  $('gStatus').addEventListener('click', () => { if (G.view != null) viewAt(G.tokens.length - 1); });

  const bar = $('reactBar');
  for (const r of REACTIONS) bar.appendChild(h('button', { class: 'react', onclick: () => { if (rateOk(450)) emit('r', r); } }, r));
  paintSound();
}

export function applyTheme() {
  if (board) { board.setTheme(THEMES.find(t => t.id === settings.theme) || THEMES[0]); board.showDots = settings.dots; }
}
const paintSound = () => { $('gSound').textContent = settings.sound ? '🔊' : '🔇'; };
function rateOk(ms) { const t = Date.now(); if (t - lastEmit < ms) return false; lastEmit = t; return true; }

function reset(mode, id) {
  Object.assign(G, {
    mode, id, doc: null, chess: new Chess(), log: [], tokens: [], fens: [START_FEN], my: null,
    wMs: 0, bMs: 0, ts: 0, pending: false, busy: 0, view: null, userFlip: false, ended: false, fresh: true,
    hopped: false, rematchSeen: null,
  });
  queue = Promise.resolve();
  askedFen = null; lastSecond = -1; unread = 0;
  $('chatList').innerHTML = '';
  $('moveList').innerHTML = '';
  $('drawBar').innerHTML = ''; $('drawBar').classList.remove('on');
  buildSoundboard();
  showTab('moves');
  board.sync(G.chess, { animate: false });
}

function close() {
  if (unsubGame) { unsubGame(); unsubGame = null; }
  if (unsubFx) { unsubFx(); unsubFx = null; }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
  askSeq++;
  G.doc = null; G.mode = null; G.id = null;
}

function startTick() { if (!tickTimer) tickTimer = setInterval(tick, 100); tick(); }

/* --------------------------------------------------------- ways in */

export function openOnline(id) {
  close();
  reset('online', id);
  showView('Game');
  try { history.replaceState(null, '', '?g=' + encodeURIComponent(id)); } catch (e) { /* file:// */ }
  let seen = false;
  unsubGame = net.watchGame(id, d => {
    if (G.id !== id) return;
    if (!d) { if (!seen) { toast('That game could not be found.'); leave(true); } return; }
    seen = true;
    onDoc(d);
  });
  unsubFx = net.watchFx(id, (events, first) => { if (G.id === id) for (const e of events) onFx(e, first); });
  net.heartbeat(state.me, 'game');
  startTick();
}

/* mode: 'ai' or 'local'.  color: 'w', 'b' or 'r' for random (ai only) */
export function startLocal({ mode, level = 4, color = 'w', tc = { base: 0, inc: 0 } }) {
  close();
  reset(mode, null);
  const my = mode === 'ai' ? (color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color) : null;
  const me = state.me || 'local:You', bot = 'bot:' + level;
  const white = mode === 'ai' ? (my === 'w' ? me : bot) : 'local:White';
  const black = mode === 'ai' ? (my === 'w' ? bot : me) : 'local:Black';
  const ms = (tc.base || 0) * 1000, t = net.now();
  const d = {
    v: 1, white, black, players: [white, black], wElo: null, bElo: null, tc: { base: tc.base || 0, inc: tc.inc || 0 }, rated: false,
    status: 'active', result: null, reason: null, start: START_FEN, fen: START_FEN, log: [], turn: 'w',
    wMs: ms, bMs: ms, ts: t, draw: null, chaos: false, delta: null, createdAt: t, endedAt: null,
    mode, level, my,
  };
  showView('Game');
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* fine */ }
  onDoc(d);
  saveLocal();
  startTick();
}

/* a game against the computer survives closing the tab */
export const savedLocal = () => { const d = store.get('local', null); return d && d.status === 'active' && d.log && d.log.length ? d : null; };
export function resumeLocal() {
  const d = savedLocal();
  if (!d) return false;
  close();
  reset(d.mode, null);
  d.ts = net.now();                              // the clock did not run while you were away
  showView('Game');
  onDoc(d);
  startTick();
  return true;
}
function saveLocal() { if (G.doc && !isNet()) store.set('local', G.doc); }

export async function leave(force) {
  if (!force && G.mode === 'online' && G.doc && G.doc.status === 'active') {
    const ok = await confirmBox('Leave this game?', 'It keeps going without you and your clock keeps running. You can come back from the lobby.', 'Leave');
    if (!ok) return;
  }
  const wasNet = isNet();
  if (!wasNet && G.doc && G.doc.status !== 'active') store.del('local');
  close();
  closeModal();
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* fine */ }
  if (wasNet) net.heartbeat(state.me, 'lobby');
  onLeave();
}

export const inGame = () => !!G.doc;
/* the lobby tells us when somebody's rating or online dot changed */
export function refresh() { if (G.doc) { renderPlates(); tick(); } }

/* ============================================================== changing */

/* The one way to change the game. change(record, timeNow) returns the
   fields to alter, or null for "never mind". */
async function commit(change) {
  if (!G.doc) return null;
  if (isNet()) return net.commitGame(G.id, change);
  const d = G.doc, t = net.now();
  const patch = change(d, t);
  if (!patch) return null;
  if (d.status === 'active' && patch.status === 'done') patch.endedAt = t;
  Object.assign(d, patch);
  saveLocal();
  onDoc(d);
  return patch;
}

function timeoutPatch(g, loser, t) {
  const winner = other(loser);
  let result = winner === 'w' ? '1-0' : '0-1';
  try { if (!new Chess(g.fen).canWinOnTime(winner === 'w' ? 0 : 1)) result = '1/2-1/2'; } catch (e) { /* keep the win */ }
  return { status: 'done', result, reason: 'timeout', [loser === 'w' ? 'wMs' : 'bMs']: 0, ts: t, draw: null };
}

const moveChange = (uci, prevLen, after) => (g, t) => {
  if (g.status !== 'active' || g.log.length !== prevLen) return null;
  const mover = g.turn, key = mover === 'w' ? 'wMs' : 'bMs';
  const patch = { log: g.log.concat(uci), fen: after.fen, turn: other(mover), ts: t, draw: null };
  if (clocked(g)) {
    const left = g[key] - (t - g.ts);
    if (left <= 0) return timeoutPatch(g, mover, t);       // the flag fell before the move got there
    patch[key] = left + (g.tc.inc || 0) * 1000;
  }
  if (after.over) { patch.status = 'done'; patch.result = after.result; patch.reason = after.reason; }
  return patch;
};

const flagChange = (g, t) => {
  if (g.status !== 'active' || !clocked(g)) return null;
  const key = g.turn === 'w' ? 'wMs' : 'bMs';
  return g[key] - (t - g.ts) > 0 ? null : timeoutPatch(g, g.turn, t);
};

/* a game both players have walked away from: end it the way the clock
   would have, or call it off if it never really began */
export const settleStale = id => net.commitGame(id, (g, t) => {
  if (g.status !== 'active') return null;
  if (net.countMoves(g.log) < 2) return t - g.createdAt > 20 * 60000 ? { status: 'done', result: '*', reason: 'abort' } : null;
  if (g.tc && g.tc.base > 0) return flagChange(g, t);
  return t - g.ts > 14 * 86400000 ? { status: 'done', result: '*', reason: 'abort' } : null;
});

/* ----------------------------------------------------------- moving */

function canMoveNow() {
  const d = G.doc;
  if (!d || d.status !== 'active' || G.busy || G.pending || G.view != null) return false;
  if (G.mode === 'local') return true;
  if (G.mode === 'watch') return false;
  return G.my === turn();
}

function userMove(from, to) {
  if (!canMoveNow()) return false;
  if (G.chess.needsPromotion(from, to)) {
    if (settings.autoQueen) return playMove(from + to + 'q');
    askPromotion(to, turn()).then(kind => {
      if (kind && canMoveNow()) playMove(from + to + kind);
      else board.sync(G.chess, { last: lastMove(), check: kingSquare(G.chess) });
    });
    return undefined;                                       // decision pending: leave the pawn where it was dropped
  }
  return playMove(from + to);
}

function playMove(uci) {
  if (!G.chess.fromUci(uci)) { sound.play('error'); return false; }
  const prevLen = G.log.length, mover = turn();
  /* show it at once; the database catches up a moment later */
  if (clocked(G.doc)) G[mover === 'w' ? 'wMs' : 'bMs'] += (G.doc.tc.inc || 0) * 1000 - (net.now() - G.ts);
  G.ts = net.now();
  addEntry(uci, true);
  const st = G.chess.status();
  const after = { fen: G.chess.fen(), over: st.over, result: st.result, reason: st.reason };
  G.pending = isNet();
  render();
  commit(moveChange(uci, prevLen, after))
    .then(patch => { G.pending = false; if (!patch) resync(); })
    .catch(() => { G.pending = false; resync(); toast('That move did not go through. Check your connection.', { kind: 'bad' }); });
  return true;
}

function resync() { if (G.doc) { rebuild(G.doc.log); render(); } }

function askPromotion(to, colour) {
  return new Promise(resolve => {
    const box = $('promo'), veil = $('promoVeil'), { col, row } = board.cell(to), top = row === 0;
    box.innerHTML = '';
    box.style.left = col * 12.5 + '%';
    box.style.top = top ? '0' : 'auto';
    box.style.bottom = top ? 'auto' : '0';
    /* The picker opens under the very finger that dropped the pawn, and the
       queen sits exactly where that finger is. So a choice only counts on a
       fresh press - never on the tail end of the tap that opened it. */
    const opened = performance.now();
    let finished = false;
    const done = kind => { if (finished) return; finished = true; veil.classList.remove('on'); box.classList.remove('on'); veil.onpointerdown = veil.onclick = null; resolve(kind); };
    const press = fn => ({ onpointerdown: e => { e.preventDefault(); e.stopPropagation(); fn(); }, onclick: e => { e.stopPropagation(); if (performance.now() - opened > 500) fn(); } });
    const kinds = ['q', 'n', 'r', 'b'];
    for (const k of top ? kinds : kinds.slice().reverse()) {
      const ch = colour === 'w' ? k.toUpperCase() : k;
      box.appendChild(h('button', Object.assign({ class: 'promo-btn', title: PIECE_NAMES[k], 'aria-label': 'Promote to ' + PIECE_NAMES[k], style: { backgroundImage: `url("${PIECE_URL[ch]}")` } }, press(() => done(k)))));
    }
    veil.classList.add('on'); box.classList.add('on');
    veil.onpointerdown = e => { e.preventDefault(); done(null); };
  });
}

/* ------------------------------------------------- playing out the log */

/* apply one entry to the position; null means it made no sense */
function applyEntry(entry) {
  if (entry[0] === '=') {
    const parts = entry.slice(1).split(';');
    let next;
    try { next = new Chess(parts[0]); } catch (e) { return null; }
    G.chess = next;
    G.log.push(entry); G.fens.push(next.fen());
    G.tokens.push({ kind: 'edit', fx: parts[1] || 'set', by: parts[2] || '' });
    return { kind: 'edit' };
  }
  const c = G.chess, m = c.fromUci(entry);
  if (!m) return null;
  const san = c.san(m), colour = turn(), num = c.full, last = { from: entry.slice(0, 2), to: entry.slice(2, 4) };
  c.play(m);
  G.log.push(entry); G.fens.push(c.fen());
  G.tokens.push({ kind: 'move', san, colour, num, last });
  return { kind: 'move', san, last, capture: san.includes('x'), castle: san.startsWith('O-O'), promo: san.includes('='), check: c.inCheck(), checkSq: kingSquare(c) };
}

const lastMove = () => { const t = G.tokens[G.tokens.length - 1]; return t && t.kind === 'move' ? t.last : null; };
const enqueue = fn => { queue = queue.then(fn).catch(e => console.error(e)); };

/* an entry that has just happened: apply it, then show it */
function addEntry(entry, live) {
  const before = G.fens[G.fens.length - 1];
  const info = applyEntry(entry);
  if (!info) return false;
  G.view = null;
  if (!live) return true;
  const after = G.fens[G.fens.length - 1], token = G.tokens[G.tokens.length - 1];
  if (info.kind === 'move') {
    enqueue(() => {
      board.sync(new Chess(after), { last: info.last, check: info.checkSq });
      if (info.check) sound.play('check');
      else if (info.promo) { sound.play('promote'); fx.sparkle(board.center(info.last.to), board.size()); }
      else if (info.capture) sound.play('capture');
      else if (info.castle) { sound.play('move'); setTimeout(() => sound.play('move'), 130); }
      else sound.play('move');
    });
  } else enqueue(() => editVisual(token, before, after));
  return true;
}

/* throw everything away and play the whole log again, without animation */
function rebuild(log) {
  const d = G.doc;
  G.chess = new Chess(d.start || START_FEN);
  G.log = []; G.tokens = []; G.fens = [G.chess.fen()]; G.view = null;
  for (let i = 0; i < log.length; i++) {
    if (applyEntry(log[i])) continue;
    /* a log that does not replay: trust the stored position instead */
    try { G.chess = new Chess(d.fen); } catch (e) { /* keep what we have */ }
    for (let j = i; j < log.length; j++) { G.log.push(log[j]); G.fens.push(G.chess.fen()); G.tokens.push({ kind: 'edit', fx: 'set', by: '' }); }
    break;
  }
  enqueue(() => board.sync(G.chess, { animate: false, last: lastMove(), check: kingSquare(G.chess) }));
}

function syncLog(d, fresh) {
  const mine = G.log, theirs = d.log || [];
  let same = 0;
  while (same < mine.length && same < theirs.length && mine[same] === theirs[same]) same++;
  if (fresh || same < mine.length) {
    /* my own move, still on its way: the server just has not heard yet */
    if (!fresh && G.pending && same === theirs.length && mine.length === theirs.length + 1) return;
    return rebuild(theirs);
  }
  for (let i = same; i < theirs.length; i++) if (!addEntry(theirs[i], true)) return rebuild(theirs);
}

/* ============================================================ reacting */

function onDoc(d) {
  const fresh = G.fresh;
  G.fresh = false;
  G.doc = d;
  if (isNet()) {
    G.my = d.white === state.me ? 'w' : d.black === state.me ? 'b' : null;
    G.mode = G.my ? 'online' : 'watch';
  } else G.my = d.mode === 'ai' ? d.my : null;

  syncLog(d, fresh);
  /* while my own move is still in flight the record is one move behind:
     keep the clock I worked out myself until the record catches up */
  if (fresh || !(G.pending && (d.log || []).length < G.log.length)) { G.wMs = d.wMs; G.bMs = d.bMs; G.ts = d.ts; }
  if (fresh) {
    board.setFlip(wantFlip());
    if (d.status === 'active') sound.play('start');
  }

  if (d.status === 'done' && !G.ended) {
    G.ended = true;
    if (fresh) { /* arrived after it was all over: just show the board */ }
    else enqueue(() => { endTimer = setTimeout(() => showEnd(d), 650); });
  }
  if (G.mode === 'online' && d.status === 'done') {
    if (d.rematch && !G.hopped) { G.hopped = true; closeModal(); const next = d.rematch; setTimeout(() => openOnline(next), 50); return; }
    if (d.rematchBy && d.rematchBy !== G.my && !d.rematch && G.rematchSeen !== d.rematchBy) {
      G.rematchSeen = d.rematchBy;
      sound.play('notify');
      toast(label(nameOf(d.rematchBy)) + ' wants a rematch!', { ms: 15000, actions: [{ label: 'Accept', kind: 'primary', run: acceptRematch }] });
    }
  }
  render();
  if (G.mode === 'ai') askBot();
}

const wantFlip = () => (G.my === 'b') !== G.userFlip;

/* ------------------------------------------------------------ the clock */

function tick() {
  const d = G.doc;
  if (!d) return;
  const run = d.status === 'active' && d.tc.base > 0 && net.countMoves(G.log) >= 2;
  const t = turn();
  let w = G.wMs, b = G.bMs;
  if (run) { const gone = net.now() - G.ts; if (t === 'w') w -= gone; else b -= gone; }
  paintClock('w', w, run && t === 'w');
  paintClock('b', b, run && t === 'b');
  if (!run) return;
  const left = t === 'w' ? w : b;
  if (G.my === t && left > 0 && left < 10500) {
    const s = Math.ceil(left / 1000);
    if (s !== lastSecond) { lastSecond = s; sound.play(s <= 5 ? 'lowtime' : 'tick'); }
  }
  if (left <= 0 && !G.pending && Date.now() - lastFlag > 1500) {
    lastFlag = Date.now();
    commit(flagChange).catch(() => {});
  }
}

function paintClock(colour, ms, running) {
  const el = clockEls[colour];
  if (!el || !G.doc.tc.base) return;
  const text = fmtClock(ms);
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('run', running);
  el.classList.toggle('low', ms < 20000 && G.doc.status === 'active');
}

/* -------------------------------------------------------- the computer */

function think(payload) {
  return new Promise(resolve => {
    const onMain = () => import('./ai.js').then(m => resolve(m.think(payload))).catch(() => resolve(null));
    try {
      if (!worker) worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
      const id = ++askSeq;
      const heard = e => { if (e.data.id !== id) return; worker.removeEventListener('message', heard); resolve(e.data.result); };
      worker.addEventListener('message', heard);
      worker.onerror = () => { worker = null; onMain(); };
      worker.postMessage({ id, payload });
    } catch (e) { worker = null; onMain(); }
  });
}

function askBot() {
  const d = G.doc;
  if (!d || d.status !== 'active' || G.mode !== 'ai' || turn() === G.my) return;
  const fen = G.chess.fen();
  if (askedFen === fen) return;
  askedFen = fen;
  const started = performance.now();
  /* with a clock running, never spend more than a slice of what is left */
  const left = d.tc.base > 0 ? (turn() === 'w' ? G.wMs : G.bMs) : 0;
  const time = left ? Math.max(120, Math.min(botOf('bot:' + d.level).time, left / 25)) : null;
  think({ fen, level: d.level, keys: G.chess.keys.slice(), time }).then(async r => {
    /* a human-ish pause, so the reply does not land before your piece has */
    await sleep(Math.max(0, 500 + Math.random() * 500 - (performance.now() - started)));
    await queue;
    while (G.busy) await sleep(120);
    if (!r || !G.doc || G.mode !== 'ai' || G.doc.status !== 'active' || G.chess.fen() !== fen) { if (askedFen === fen) askedFen = null; return; }
    askedFen = null;
    playMove(r.uci);
  });
}

/* ============================================================ drawing it */

function render() {
  const d = G.doc;
  if (!d) return;
  const t = $('gTitle');
  if (G.mode === 'ai') t.textContent = 'vs ' + botOf(d.my === 'w' ? d.black : d.white).name;
  else if (G.mode === 'local') t.textContent = 'Pass & play';
  else t.textContent = (G.mode === 'watch' ? '👀 Watching · ' : '') + tcIcon(d.tc) + ' ' + tcLabel(d.tc) + ' ' + tcKind(d.tc) + ' · ' + (d.rated && !d.chaos ? 'Rated' : 'Casual');
  $('gChaos').classList.toggle('on', !!d.chaos);
  renderPlates();
  renderMoves();
  renderStatus();
  renderActions();
  tick();
}

function material(c) {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const { ch } of c.pieces()) { const k = ch.toLowerCase(); if (k !== 'k') count[colourOf(ch)][k]++; }
  const START = { p: 8, n: 2, b: 2, r: 2, q: 1 }, VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const lost = col => ['q', 'r', 'b', 'n', 'p'].flatMap(k => Array(Math.max(0, START[k] - count[col][k])).fill(k));
  const score = col => Object.keys(VAL).reduce((s, k) => s + VAL[k] * count[col][k], 0);
  return { w: { took: lost('b'), lead: score('w') - score('b') }, b: { took: lost('w'), lead: score('b') - score('w') } };
}

function renderPlates() {
  const top = board.flip ? 'w' : 'b';
  const mat = material(G.view != null ? new Chess(G.fens[G.view + 1]) : G.chess);
  fillPlate($('plateTop'), top, mat[top]);
  fillPlate($('plateBot'), other(top), mat[other(top)]);
}

function fillPlate(el, colour, mat) {
  const d = G.doc, name = nameOf(colour), p = state.players.get(name), bot = isBot(name) ? botOf(name) : null;
  el.innerHTML = '';
  el.className = 'plate' + (d.status === 'active' && turn() === colour ? ' turn' : '') + (isOwner(name) ? ' owner' : '') + (G.my === colour ? ' mine' : '');
  el.dataset.colour = colour;
  const elo = bot ? bot.elo : isNet() ? (colour === 'w' ? d.wElo : d.bElo) : null;
  const took = h('div', { class: 'took' });
  for (const k of mat.took) took.appendChild(h('i', { style: { backgroundImage: `url("${PIECE_URL[colour === 'w' ? k : k.toUpperCase()]}")` } }));
  if (mat.lead > 0) took.appendChild(h('span', { class: 'lead' }, '+' + mat.lead));
  if (bot && !mat.took.length) took.appendChild(h('span', { class: 'quip' }, '“' + bot.quip + '”'));
  const clock = h('div', { class: 'clock' + (d.tc.base ? '' : ' none') }, d.tc.base ? '' : '∞');
  clockEls[colour] = clock;
  el.append(
    avatar(name, { emoji: bot && bot.emoji, letter: String(name).startsWith('local:') ? (colour === 'w' ? '♔' : '♚') : null }),
    h('div', { class: 'plate-info' },
      h('div', { class: 'plate-name' },
        nameTag(name, { label: label(name), title: p && p.title }),
        elo != null ? h('span', { class: 'elo' }, elo) : null,
        isNet() ? h('span', { class: 'dot' + (net.isOnline(p) ? ' on' : ''), title: net.isOnline(p) ? 'Here' : 'Away' }) : null,
        h('span', { class: 'side ' + colour, title: colour === 'w' ? 'White' : 'Black' })),
      took),
    clock);
}

function editText(t) {
  const [kind, args = ''] = t.fx.split(':'), list = args.split(',').filter(Boolean).join(', ');
  return ({
    rocket: '🚀 rocket → ' + list, give: '🎁 new piece on ' + list, swap: '🔀 swapped ' + list, tp: '✨ teleport ' + list, morph: '🪄 transformed ' + list,
    army: '🪖 army upgrade', undo: '↩️ take-back', skip: '⏭️ turn skipped', reset: '🧹 board reset', set: '🧩 board changed',
  })[kind] || '🧩 board changed';
}

function renderMoves() {
  const box = $('moveList'), shownAt = G.view != null ? G.view : G.tokens.length - 1;
  box.innerHTML = '';
  if (!G.tokens.length) { box.appendChild(h('div', { class: 'empty' }, 'No moves yet. White goes first.')); return; }
  let row = null;
  G.tokens.forEach((t, i) => {
    if (t.kind === 'edit') {
      box.appendChild(h('div', { class: 'mv-edit' + (i === shownAt ? ' on' : ''), onclick: () => viewAt(i) }, editText(t)));
      row = null;
      return;
    }
    if (t.colour === 'w' || !row) {
      row = h('div', { class: 'mv-row' }, h('span', { class: 'mv-num' }, t.num + '.'));
      if (t.colour === 'b') row.appendChild(h('span', { class: 'mv gap' }, '…'));
      box.appendChild(row);
    }
    row.appendChild(h('span', { class: 'mv' + (i === shownAt ? ' on' : ''), onclick: () => viewAt(i) }, t.san));
    if (t.colour === 'b') row = null;
  });
  const on = box.querySelector('.on');
  if (G.view != null && on) on.scrollIntoView({ block: 'nearest' });
  else box.scrollTop = box.scrollHeight;
}

/* look back at the position after entry i (the latest one = back to live) */
function viewAt(i) {
  G.view = i >= G.tokens.length - 1 ? null : i;
  const c = G.view == null ? G.chess : new Chess(G.fens[G.view + 1]);
  const t = G.tokens[G.view == null ? G.tokens.length - 1 : G.view];
  board.sync(c, { animate: false, last: t && t.kind === 'move' ? t.last : null, check: kingSquare(c) });
  renderMoves(); renderStatus(); renderPlates(); tick();
}

function resultText(d) {
  if (d.result === '*') return 'Game called off';
  if (d.result === '1/2-1/2') return 'Draw';
  return label(d.result === '1-0' ? d.white : d.black) + ' wins';
}

function renderStatus() {
  const d = G.doc, el = $('gStatus');
  el.className = 'gstatus';
  if (G.view != null) { el.textContent = '⏪ Looking back · tap here to return to the game'; el.classList.add('link'); return; }
  if (d.status === 'done') {
    const why = REASONS[d.reason] || '';
    el.textContent = resultText(d) + (why ? (/^[a-z]/.test(why) ? ' ' : ' · ') + why : '');
    el.classList.add('over');
    return;
  }
  const t = turn(), check = G.chess.inCheck() ? ' · Check!' : '';
  let text;
  if (G.mode === 'local') text = (t === 'w' ? 'White' : 'Black') + ' to move';
  else if (G.mode === 'watch') text = label(nameOf(t)) + ' to move';
  else if (G.my === t) text = 'Your move';
  else text = G.mode === 'ai' ? label(nameOf(t)) + ' is thinking…' : 'Waiting for ' + label(nameOf(t)) + '…';
  if (d.tc.base > 0 && net.countMoves(G.log) < 2 && isNet()) text += ' · clocks start once both of you have moved';
  el.textContent = text + check;
  if (G.my === t) el.classList.add('mine');
}

function renderActions() {
  const d = G.doc, active = d.status === 'active', playing = G.mode === 'online' || G.mode === 'ai' || G.mode === 'local';
  const show = (id, on) => $(id).classList.toggle('hide', !on);
  show('actDraw', G.mode === 'online' && active);
  show('actResign', playing && active);
  show('actUndo', (G.mode === 'ai' || G.mode === 'local') && active && G.log.length > 0);
  show('actShare', isNet());
  show('actRematch', !active && (G.mode !== 'watch') && d.result !== '*');
  $('actResign').textContent = isNet() && net.countMoves(G.log) < 2 ? '✖ Abort' : '🏳️ Resign';
  $('actDraw').textContent = d.draw && d.draw === G.my ? '🤝 Offered…' : '🤝 Draw';
  $('actDraw').disabled = !!(d.draw && d.draw === G.my);
  $('actRematch').textContent = G.mode === 'online' ? (d.rematchBy === G.my ? '⏳ Rematch asked…' : '🔁 Rematch') : '🔁 Play again';
  $('actRematch').disabled = G.mode === 'online' && d.rematchBy === G.my;

  const bar = $('drawBar'), offered = G.mode === 'online' && active && d.draw && d.draw !== G.my;
  bar.classList.toggle('on', !!offered);
  bar.innerHTML = '';
  if (offered) {
    bar.append(h('span', null, '🤝 ' + label(nameOf(d.draw)) + ' offers a draw'),
      h('button', { class: 'btn small primary', onclick: () => commit(g => (g.status === 'active' && g.draw && g.draw !== G.my ? { status: 'done', result: '1/2-1/2', reason: 'agreed' } : null)).catch(() => {}) }, 'Accept'),
      h('button', { class: 'btn small', onclick: () => commit(g => (g.status === 'active' && g.draw ? { draw: null } : null)).catch(() => {}) }, 'Decline'));
  }
}

function showTab(name) {
  tab = name;
  for (const b of document.querySelectorAll('#viewGame .tab')) b.classList.toggle('on', b.dataset.tab === name);
  for (const p of document.querySelectorAll('#viewGame .pane')) p.classList.toggle('on', p.dataset.pane === name);
  if (name === 'chat') { unread = 0; paintUnread(); $('chatList').scrollTop = $('chatList').scrollHeight; }
  if (name === 'sounds') sound.warmBoard();
}
function paintUnread() { const b = $('chatBadge'); b.textContent = unread || ''; b.classList.toggle('on', unread > 0); }

/* ============================================================== buttons */

async function resign() {
  const d = G.doc;
  if (!d || d.status !== 'active') return;
  const early = isNet() && net.countMoves(G.log) < 2;
  const ok = await confirmBox(early ? 'Abort this game?' : 'Resign?', early ? 'Nobody has really started yet, so no rating is lost.' : (d.rated && !d.chaos ? 'You will lose the game and some rating.' : 'You will lose the game.'), early ? 'Abort' : 'Resign');
  if (!ok) return;
  const loser = G.my || turn();
  commit(g => {
    if (g.status !== 'active') return null;
    if (isNet() && net.countMoves(g.log) < 2) return { status: 'done', result: '*', reason: 'abort' };
    return { status: 'done', result: loser === 'w' ? '0-1' : '1-0', reason: 'resign' };
  }).catch(e => toast(e.message));
}

function offerDraw() {
  if (G.mode !== 'online') return;
  commit(g => {
    if (g.status !== 'active') return null;
    if (g.draw && g.draw !== G.my) return { status: 'done', result: '1/2-1/2', reason: 'agreed' };   // they had already asked
    return { draw: G.my };
  }).catch(e => toast(e.message));
}

/* Undo, for games that are not rated: against the computer you get your
   own move back as well as its reply. */
export function takeBack(n) {
  const count = n || (G.mode === 'ai' && turn() === G.my ? 2 : 1);
  return consoleEdit(g => {
    const k = Math.min(count, g.log.length);
    if (!k) throw new Error('Nothing to take back.');
    return { fen: fensOf(g)[g.log.length - k], fx: 'undo', gentle: !isNet() };
  });
}

function shareGame() {
  const url = location.origin + location.pathname + '?g=' + encodeURIComponent(G.id);
  const done = () => toast('Link copied. Anyone who opens it can watch.');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url));
  else prompt('Copy this link:', url);
}

function askRematch() {
  const d = G.doc;
  if (!d) return;
  if (G.mode !== 'online') { closeModal(); return onPlayAgain(d); }
  if (d.rematchBy && d.rematchBy !== G.my) return acceptRematch();
  commit(g => (g.rematch || g.rematchBy ? null : { rematchBy: G.my })).catch(e => toast(e.message));
  toast('Rematch offered.');
}
function acceptRematch() {
  if (!G.id) return;
  net.rematch(G.id).catch(e => toast(e.message));         // both of us hop when the old game learns the new one's id
}

/* ====================================================== around the board */

function sendChat() {
  const input = $('chatInput'), text = clean(input.value.trim()).slice(0, 200);
  if (!text) return;
  if (!isNet()) { toast('Chat works in online games.'); return; }
  input.value = '';
  emit('c', text);
}

/* k: 'c' chat, 'r' reaction, 's' soundboard, 'x' effect, 'n' note */
export function emit(k, v) {
  if (!G.doc) return;
  if (isNet() && G.id) net.sendFx(G.id, { k, v, by: state.me || '' });
  else onFx({ k, v, by: state.me || 'local:You', at: net.now() }, false);
}

function addChat(kind, who, text) {
  const box = $('chatList');
  const line = kind === 'sys'
    ? h('div', { class: 'chat-line sys' }, text)
    : h('div', { class: 'chat-line' }, h('b', { class: isOwner(who) ? 'gold' : '' }, (isOwner(who) ? '👑 ' : '') + label(who) + ': '), text);
  box.appendChild(line);
  while (box.children.length > 200) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  if (tab !== 'chat') { unread++; paintUnread(); }
}

function platePoint(name) {
  const colour = G.doc && G.doc.white === name ? 'w' : G.doc && G.doc.black === name ? 'b' : null;
  const el = colour ? document.querySelector('.plate[data-colour="' + colour + '"]') : null;
  const r = (el || $('boardWrap')).getBoundingClientRect();
  return el ? { x: r.left + 26, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.top + 20 };
}

function onFx(e, history) {
  const old = history || net.now() - (e.at || 0) > 12000;
  const v = String(e.v == null ? '' : e.v);
  if (e.k === 'c') { addChat('msg', e.by, clean(v.slice(0, 300))); if (!old && e.by !== state.me) sound.play('click'); return; }
  if (e.k === 'n') { addChat('sys', null, v.slice(0, 200)); return; }
  if (old) return;
  if (e.k === 'r') fx.floatEmoji(platePoint(e.by), v.slice(0, 8), true);
  else if (e.k === 's') {
    if (e.by !== state.me && !settings.board) return;
    const item = sound.soundboard().find(s => s.id === v);
    if (!item) return;
    sound.playBoard(v);
    fx.floatEmoji(platePoint(e.by), item.emoji || '🔊', false);
  } else if (e.k === 'x') cosmetic(v, e.by);
}

function cosmetic(v, by) {
  if (v === 'confetti') fx.confetti();
  else if (v === 'fireworks') { fx.fireworks(); sound.play('explosion', { gain: 0.5 }); }
  else if (v === 'shake') { fx.shake($('boardWrap'), true); sound.play('drop'); }
  else if (v.startsWith('rain:')) fx.rain(v.slice(5, 13) || '🐸');
  else if (v.startsWith('say:')) { fx.banner(clean(v.slice(4, 84)), by ? '— ' + label(by) : ''); sound.play('notify'); }
}

function buildSoundboard() {
  const grid = $('soundGrid'), list = sound.soundboard();
  grid.innerHTML = '';
  if (!list.length) { grid.appendChild(h('div', { class: 'empty' }, 'The soundboard is still loading its sounds.')); return; }
  for (const s of list) {
    grid.appendChild(h('button', { class: 'sb', title: s.label, onclick: () => { if (rateOk(900)) emit('s', s.id); else toast('Easy on the buttons 😄', { ms: 1200 }); } },
      h('span', { class: 'sb-e' }, s.emoji || '🔊'), h('span', { class: 'sb-l' }, s.label)));
  }
}

/* ------------------------------------------------------------- the end */

function showEnd(d) {
  if (G.doc !== d && (!G.doc || G.doc.status !== 'done')) return;
  d = G.doc;
  const my = G.my, draw = d.result === '1/2-1/2', off = d.result === '*';
  const won = !draw && !off && my && (d.result === '1-0') === (my === 'w');
  const lost = !draw && !off && my && !won;
  sound.play(off ? 'click' : draw ? 'draw' : lost ? 'lose' : 'win');
  if (won || (!my && !draw && !off)) fx.confetti();
  if (G.mode === 'ai' && !off) fx.floatEmoji(platePoint(my === 'w' ? d.black : d.white), won ? '😭' : draw ? '🤝' : '😎', true);

  const head = off ? ['✖', 'Game called off'] : draw ? ['🤝', 'Draw'] : won ? ['🏆', 'You win!'] : lost ? ['💀', 'You lost'] : ['🏁', resultText(d)];
  const body = h('div', { class: 'end' }, h('div', { class: 'end-emoji' }, head[0]), h('h2', null, head[1]));
  const why = REASONS[d.reason];
  if (why && !off) body.appendChild(h('p', { class: 'end-why' }, /^[a-z]/.test(why) ? resultText(d) + ' ' + why : why));

  if (isNet() && !off) {
    if (d.delta) {
      const line = (colour, name) => {
        const delta = d.delta[colour], now = d.delta[colour + 'Elo'];
        return h('div', { class: 'end-elo' + (isOwner(name) ? ' owner' : '') }, h('span', null, (isOwner(name) ? '👑 ' : '') + label(name)),
          h('b', null, now), h('em', { class: delta > 0 ? 'up' : delta < 0 ? 'down' : '' }, (delta > 0 ? '+' : '') + delta));
      };
      body.appendChild(h('div', { class: 'end-ratings' }, line('w', d.white), line('b', d.black)));
    } else body.appendChild(h('p', { class: 'end-note' }, d.chaos ? '😈 Chaos mode: the console was used, so ratings stay as they were.' : d.rated ? 'Too short to count: ratings stay as they were.' : 'Casual game: ratings stay as they were.'));
  }
  const again = G.mode !== 'watch' && !off;
  body.appendChild(h('div', { class: 'end-btns' },
    again ? h('button', { class: 'btn primary', onclick: () => { closeModal(); askRematch(); } }, G.mode === 'online' ? '🔁 Rematch' : '🔁 Play again') : null,
    h('button', { class: 'btn', onclick: () => closeModal() }, 'Look at the board'),
    h('button', { class: 'btn', onclick: () => leave(true) }, 'Lobby')));
  openModal(body, { class: 'end-card' + (won ? ' won' : '') });
}

/* =================================================== the console's side */

/* every position this record has been through, start first */
export function fensOf(g) {
  let c = new Chess(g.start || START_FEN);
  const out = [c.fen()];
  for (const e of g.log) {
    if (e[0] === '=') { try { c = new Chess(e.slice(1).split(';')[0]); } catch (err) { break; } }
    else { const m = c.fromUci(e); if (!m) break; c.play(m); }
    out.push(c.fen());
  }
  return out;
}

/* Replace the position. build(record) returns { fen, fx, gentle } and may
   throw an Error whose message is meant for the person at the console.
   Anything but a gentle change (a take-back) switches the game to chaos
   mode, which means it no longer counts for rating. */
export function consoleEdit(build) {
  if (!G.doc) return Promise.reject(new Error('Open a game first.'));
  return commit((g, t) => {
    if (g.status !== 'active') throw new Error('That game is over.');
    const r = build(g);
    const st = new Chess(r.fen).status();
    const patch = { log: g.log.concat('=' + r.fen + ';' + (r.fx || 'set') + ';' + (state.me || '')), fen: r.fen, turn: r.fen.split(' ')[1], draw: null, ts: t };
    if (!r.gentle) patch.chaos = true;
    if (clocked(g)) { const key = g.turn === 'w' ? 'wMs' : 'bMs'; patch[key] = Math.max(0, g[key] - (t - g.ts)); }
    if (st.over) { patch.status = 'done'; patch.result = st.result; patch.reason = st.reason; }
    return patch;
  });
}

export function consoleEnd(result) {
  if (!G.doc) return Promise.reject(new Error('Open a game first.'));
  return commit(g => { if (g.status !== 'active') throw new Error('That game is over.'); return { status: 'done', result, reason: 'console', chaos: true }; });
}

export function consoleClock(colour, deltaMs) {
  if (!G.doc) return Promise.reject(new Error('Open a game first.'));
  return commit(g => {
    if (g.status !== 'active') throw new Error('That game is over.');
    if (!(g.tc && g.tc.base > 0)) throw new Error('This game has no clock.');
    const key = colour === 'w' ? 'wMs' : 'bMs';
    return { [key]: Math.max(1000, g[key] + deltaMs), chaos: true };
  });
}

/* what the console is allowed to know about the game in front of it */
export const consoleView = () => ({ doc: G.doc, my: G.my, turn: G.doc ? turn() : 'w', chess: G.chess, mode: G.mode });

/* Show a console change happening. The record already holds the new
   position; this is the theatre in front of it. */
async function editVisual(token, before, after) {
  const [kind, argStr = ''] = token.fx.split(':'), args = argStr.split(',').filter(Boolean);
  const who = token.by ? label(token.by) : 'The console', crown = isOwner(token.by) ? '👑 ' : '';
  const pos = new Chess(after), wrap = $('boardWrap'), size = board.size();
  const note = text => { addChat('sys', null, text); toast(text, { ms: 2600 }); };
  G.busy++;
  try {
    if (kind === 'rocket') {
      note('🚀 ' + crown + who + ' launched ' + (args.length > 1 ? args.length + ' rockets' : 'a rocket at ' + args[0]) + '!');
      const side = token.by && token.by === nameOf(board.flip ? 'w' : 'b') ? 'top' : 'bottom';
      await Promise.all(args.map((sq, i) => sleep(i * 170).then(async () => {
        sound.play('rocket');
        await fx.rocket(fx.launchPoint(args.length > 3 ? 'any' : side), board.center(sq), { size: size * 0.95 });
        board.pop(sq);
        fx.explode(board.center(sq), size);
        sound.play('explosion');
        fx.shake(wrap, true);
      })));
      await sleep(420);
      board.sync(pos, { check: kingSquare(pos) });
    } else if (kind === 'give' || kind === 'morph' || kind === 'army') {
      note(kind === 'give' ? '🎁 ' + crown + who + ' dropped a new piece on ' + args.join(', ') + '!' : '🪄 ' + crown + who + ' transformed ' + (args.length > 2 ? args.length + ' pieces' : args.join(', ')) + '!');
      for (const sq of args) board.pop(sq);
      board.sync(pos, { check: kingSquare(pos) });
      args.forEach((sq, i) => setTimeout(() => { fx.sparkle(board.center(sq), size); board.bounce(sq); sound.play(kind === 'give' ? 'drop' : 'magic'); }, i * 90));
      await sleep(500 + args.length * 90);
    } else if (kind === 'swap' || kind === 'tp') {
      note((kind === 'swap' ? '🔀 ' : '✨ ') + crown + who + (kind === 'swap' ? ' swapped ' + args.join(' and ') : ' teleported ' + args.join(' → ')) + '!');
      sound.play('magic');
      for (const sq of args) fx.sparkle(board.center(sq), size * 0.8, 190);
      board.sync(pos, { check: kingSquare(pos) });
      await sleep(350);
    } else {
      if (kind === 'undo') note('↩️ ' + who + ' took a move back.');
      else if (kind === 'skip') note('⏭️ ' + crown + who + ' skipped a turn!');
      else if (kind === 'reset') note('🧹 ' + crown + who + ' reset the board!');
      else note('🧩 ' + crown + who + ' rearranged the board!');
      sound.play(kind === 'undo' ? 'move' : 'magic');
      board.sync(pos, { check: kingSquare(pos) });
      await sleep(200);
    }
  } finally { G.busy--; }
}
