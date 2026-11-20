/* ============================================================
   The board you see and touch.

   It knows nothing about the rules. It is told what is on which
   square (sync), asks which piece may be picked up and where it
   could go (the handlers), and reports "they moved this from here
   to there". Pieces can be dragged, or tapped and then tapped to a
   square - both always work, on a mouse and on a phone.

   sync() works out for itself which piece slid where by comparing
   the old picture with the new one, so the same call animates an
   ordinary move, castling, a take-back, or a console command that
   swaps two pieces.
   ============================================================ */

import { PIECE_URL } from './pieces.js';
import { h } from './shared.js';

const FILES = 'abcdefgh';

export class Board {
  /* handlers: canPick(square, piece) -> bool, targets(square) -> [{to, capture}], onMove(from, to) */
  constructor(root, handlers) {
    this.root = root;
    this.on = handlers;
    this.flip = false;
    this.els = new Map();          // square -> piece element
    this.sel = null;
    this.targets = [];
    this.last = null;
    this.check = null;
    this.locked = false;
    this.showDots = true;
    this.drag = null;

    root.classList.add('board');
    this.squares = h('div', { class: 'b-squares' });
    this.marks = h('div', { class: 'b-marks' });
    this.pieces = h('div', { class: 'b-pieces' });
    root.append(this.squares, this.marks, this.pieces);
    this.drawSquares();

    root.addEventListener('pointerdown', e => this.down(e));
    root.addEventListener('pointermove', e => this.move(e));
    root.addEventListener('pointerup', e => this.up(e));
    root.addEventListener('pointercancel', () => this.cancel());
    root.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* ------------------------------------------------------- geometry */

  cell(sq) {
    const file = sq.charCodeAt(0) - 97, rank = sq.charCodeAt(1) - 49;
    return this.flip ? { col: 7 - file, row: rank } : { col: file, row: 7 - rank };
  }
  place(el, sq) {
    const { col, row } = this.cell(sq);
    el.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
  }
  squareAt(x, y) {
    const r = this.root.getBoundingClientRect();
    if (x < r.left || y < r.top || x >= r.right || y >= r.bottom) return null;
    let col = Math.floor((x - r.left) / (r.width / 8)), row = Math.floor((y - r.top) / (r.height / 8));
    col = Math.min(7, Math.max(0, col)); row = Math.min(7, Math.max(0, row));
    const file = this.flip ? 7 - col : col, rank = this.flip ? row : 7 - row;
    return FILES[file] + (rank + 1);
  }
  /* the middle of a square, in page pixels - where a rocket should land */
  center(sq) {
    const r = this.root.getBoundingClientRect(), { col, row } = this.cell(sq), s = r.width / 8;
    return { x: r.left + (col + 0.5) * s, y: r.top + (row + 0.5) * s };
  }
  size() { return this.root.getBoundingClientRect().width / 8; }

  drawSquares() {
    this.squares.innerHTML = '';
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const file = this.flip ? 7 - col : col, rank = this.flip ? row : 7 - row;
      const sq = h('div', { class: 'b-sq ' + ((file + rank) % 2 ? 'light' : 'dark') });
      if (col === 0) sq.appendChild(h('span', { class: 'b-rank' }, rank + 1));
      if (row === 7) sq.appendChild(h('span', { class: 'b-file' }, FILES[file]));
      this.squares.appendChild(sq);
    }
  }

  setFlip(flip) {
    if (this.flip === !!flip) return;
    this.flip = !!flip;
    this.drawSquares();
    this.pieces.classList.add('instant');
    for (const [sq, el] of this.els) this.place(el, sq);
    void this.pieces.offsetWidth;
    this.pieces.classList.remove('instant');
    this.drawMarks();
  }

  setTheme(theme) {
    this.root.style.setProperty('--light', theme.light);
    this.root.style.setProperty('--dark', theme.dark);
  }

  /* --------------------------------------------------------- pieces */

  make(ch, sq) {
    const el = h('div', { class: 'b-pc' });
    el.dataset.ch = ch;
    el.style.backgroundImage = `url("${PIECE_URL[ch]}")`;
    this.place(el, sq);
    this.pieces.appendChild(el);
    return el;
  }

  /* Show this position. opts: animate (default true), last {from,to}, check (square) */
  sync(chess, opts = {}) {
    this.cancel();
    /* a piece that was dropped by hand is still sitting where the finger
       left it; put it back on its square so whatever follows starts clean */
    if (this.loose) { if (this.els.get(this.loose.sq) === this.loose.el) this.place(this.loose.el, this.loose.sq); this.loose = null; }
    const need = new Map(chess.pieces().map(p => [p.sq, p.ch]));
    const next = new Map(), spare = [];
    for (const [sq, el] of this.els) {
      if (need.get(sq) === el.dataset.ch) { next.set(sq, el); need.delete(sq); }
      else spare.push([sq, el]);
    }
    const instant = opts.animate === false;
    this.pieces.classList.toggle('instant', instant);

    const send = (i, sq, ch) => {                    // move a spare piece element to a square that needs one
      const [, el] = spare.splice(i, 1)[0];
      if (el.dataset.ch !== ch) { el.dataset.ch = ch; el.style.backgroundImage = `url("${PIECE_URL[ch]}")`; }
      this.place(el, sq);
      next.set(sq, el); need.delete(sq);
    };
    /* the move we were told about goes first: that also covers a pawn
       turning into a queen as it arrives */
    if (opts.last && need.has(opts.last.to)) {
      const i = spare.findIndex(([sq]) => sq === opts.last.from);
      if (i >= 0) send(i, opts.last.to, need.get(opts.last.to));
    }
    /* then every other piece that went missing from one square and turned
       up on another: the closest one of the right kind is the one that moved */
    for (const [sq, ch] of [...need]) {
      let best = -1, bestD = 99;
      const a = this.cell(sq);
      spare.forEach(([from, el], i) => {
        if (el.dataset.ch !== ch) return;
        const b = this.cell(from), d = Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) send(best, sq, ch);
    }
    for (const [, el] of spare) {                    // taken, exploded or otherwise gone
      if (instant) { el.remove(); continue; }
      el.classList.add('gone');
      setTimeout(() => el.remove(), 320);
    }
    for (const [sq, ch] of need) {                   // new on the board
      const el = this.make(ch, sq);
      if (!instant) el.classList.add('fresh');
      next.set(sq, el);
    }
    this.els = next;
    if (instant) { void this.pieces.offsetWidth; this.pieces.classList.remove('instant'); }

    this.last = opts.last || null;
    this.check = opts.check || null;
    this.sel = null; this.targets = [];
    this.drawMarks();
  }

  /* take one piece off right now, with no fade: an explosion covers it */
  pop(sq) {
    const el = this.els.get(sq);
    if (!el) return false;
    el.remove();
    this.els.delete(sq);
    return true;
  }
  has(sq) { return this.els.has(sq); }
  /* make the piece on a square land with a bounce */
  bounce(sq) {
    const el = this.els.get(sq);
    if (!el) return;
    el.classList.remove('fresh', 'landing');
    void el.offsetWidth;
    el.classList.add('landing');
    setTimeout(() => el.classList.remove('landing'), 700);
  }

  /* ---------------------------------------------------------- marks */

  mark(cls, sq) {
    const el = h('div', { class: 'b-mark ' + cls });
    this.place(el, sq);
    this.marks.appendChild(el);
  }
  drawMarks() {
    this.marks.innerHTML = '';
    if (this.last) { if (this.last.from) this.mark('last', this.last.from); if (this.last.to) this.mark('last', this.last.to); }
    if (this.check) this.mark('check', this.check);
    if (this.sel) {
      this.mark('sel', this.sel);
      if (this.showDots) for (const t of this.targets) this.mark(t.capture ? 'ring' : 'dot', t.to);
    }
  }
  select(sq) {
    this.sel = sq;
    this.targets = sq ? this.on.targets(sq) : [];
    this.drawMarks();
  }
  isTarget(sq) { return this.targets.some(t => t.to === sq); }

  /* -------------------------------------------------------- pointer */

  down(e) {
    if (this.locked || (e.button != null && e.button > 0)) return;
    const sq = this.squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (this.sel && this.sel !== sq && this.isTarget(sq)) {      // second tap: go there
      e.preventDefault();
      return this.attempt(this.sel, sq);
    }
    const el = this.els.get(sq);
    if (el && this.on.canPick(sq, el.dataset.ch)) {
      e.preventDefault();
      const again = this.sel === sq;
      this.select(sq);
      this.drag = { sq, el, x: e.clientX, y: e.clientY, moved: false, again, id: e.pointerId };
      try { this.root.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    } else this.select(null);
  }

  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      d.moved = true;
      d.el.classList.add('drag');
    }
    const r = this.root.getBoundingClientRect(), s = r.width / 8;
    const x = Math.min(r.width, Math.max(0, e.clientX - r.left)) - s / 2;
    const y = Math.min(r.height, Math.max(0, e.clientY - r.top)) - s / 2;
    d.el.style.transform = `translate(${x}px, ${y}px) scale(1.12)`;
  }

  up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    try { this.root.releasePointerCapture(e.pointerId); } catch (err) { /* fine */ }
    d.el.classList.remove('drag');
    if (!d.moved) {                                   // a tap, not a drag
      if (d.again) this.select(null);                 // tapping the chosen piece again lets go of it
      return;
    }
    const to = this.squareAt(e.clientX, e.clientY);
    if (to && to !== d.sq && this.isTarget(to)) return this.attempt(d.sq, to);
    this.place(d.el, d.sq);                           // not somewhere it can go: back it slides
  }

  cancel() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.el.classList.remove('drag');
    if (this.els.get(d.sq) === d.el) this.place(d.el, d.sq);
  }

  attempt(from, to) {
    this.select(null);
    const el = this.els.get(from);
    this.loose = el ? { el, sq: from } : null;
    const ok = this.on.onMove(from, to);
    if (ok === false && this.loose) { this.place(this.loose.el, from); this.loose = null; }
  }
}
