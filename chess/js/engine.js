/* ============================================================
   The rules of chess, and nothing else.

   No DOM, no network, no sound: this file can be run by node, and
   tools/test-engine.mjs does exactly that - it counts every game
   that can be played four and five moves deep from six well-known
   positions and compares the totals against the published ones.
   If you ever touch the move generator, run it again.

   The board is "0x88": sixteen columns wide, only eight of them
   real. A square is rank * 16 + file, so a1 is 0 and h8 is 119, and
   any square with one of the bits in 0x88 set has walked off the
   edge. That one test replaces every "is this still on the board?".

   A piece is a small number: its kind in the low three bits and
   its colour in the fourth. A move is one integer too, so the
   computer player can make millions of them without the garbage
   collector noticing.

   One thing here that a normal chess engine would not bother with:
   positions that are not chess. The owner's console can blow a king
   off the board. So a missing king never crashes anything - it just
   means the game is over, and status() says who lost.
   ============================================================ */

export const WHITE = 0, BLACK = 1;
export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const KINDS = ' pnbrqk';
const FILES = 'abcdefgh';
const KNIGHT_D = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP_D = [-17, -15, 15, 17];
const ROOK_D = [-16, -1, 1, 16];
const KING_D = [-17, -16, -15, -1, 1, 15, 16, 17];

/* what a move is made of: from (7 bits), to (7), promotion kind (3), flags */
export const F_CAPTURE = 1, F_EP = 2, F_DOUBLE = 4, F_KS = 8, F_QS = 16;
const mk = (from, to, promo, flags) => from | (to << 7) | (promo << 14) | (flags << 17);
export const mFrom = m => m & 127;
export const mTo = m => (m >> 7) & 127;
export const mPromo = m => (m >> 14) & 7;
export const mFlags = m => m >> 17;

export const sqName = s => FILES[s & 7] + ((s >> 4) + 1);
export const sqIndex = n => (n.charCodeAt(0) - 97) | ((n.charCodeAt(1) - 49) << 4);
export const isSquare = n => typeof n === 'string' && /^[a-h][1-8]$/.test(n);

/* moving from or onto a corner or a king's square costs castling rights */
const CMASK = new Int8Array(128).fill(15);
CMASK[4] = 12; CMASK[0] = 13; CMASK[7] = 14;
CMASK[116] = 3; CMASK[112] = 7; CMASK[119] = 11;

const WK = K, WR = R, BK = K | 8, BR = R | 8;

export class Chess {
  constructor(fen = START_FEN) {
    this.b = new Int8Array(128);
    this.kings = [-1, -1];
    this.stack = [];          // what unmake() needs, seven numbers a move
    this.keys = [];           // every position so far, for threefold repetition
    this.load(fen);
  }

  /* ---------------------------------------------------------- FEN */

  load(fen) {
    const parts = String(fen).trim().split(/\s+/);
    const rows = (parts[0] || '').split('/');
    if (rows.length !== 8) throw new Error('bad FEN: ' + fen);
    this.b.fill(0);
    this.kings[0] = this.kings[1] = -1;
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const kind = KINDS.indexOf(ch.toLowerCase());
        if (kind < 1 || f > 7) throw new Error('bad FEN: ' + fen);
        const colour = ch === ch.toLowerCase() ? BLACK : WHITE;
        const sq = ((7 - r) << 4) | f;
        this.b[sq] = kind | (colour << 3);
        if (kind === K) this.kings[colour] = sq;
        f++;
      }
      if (f !== 8) throw new Error('bad FEN: ' + fen);
    }
    this.turn = parts[1] === 'b' ? BLACK : WHITE;
    const c = parts[2] || '-';
    this.castle = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
    this.ep = isSquare(parts[3]) ? sqIndex(parts[3]) : -1;
    this.half = Math.max(0, parseInt(parts[4], 10) || 0);
    this.full = Math.max(1, parseInt(parts[5], 10) || 1);
    this.stack.length = 0;
    this.sanitize();
    this.keys = [this.key()];
    return this;
  }

  /* A position that was edited by hand can claim things that are not
     true any more - the right to castle with a rook that has been blown
     up, say. Quietly drop whatever the board no longer backs up. */
  sanitize() {
    const b = this.b;
    if (b[4] !== WK || b[7] !== WR) this.castle &= ~1;
    if (b[4] !== WK || b[0] !== WR) this.castle &= ~2;
    if (b[116] !== BK || b[119] !== BR) this.castle &= ~4;
    if (b[116] !== BK || b[112] !== BR) this.castle &= ~8;
    if (this.ep >= 0) {
      const rank = this.ep >> 4, them = this.turn ^ 1;
      const pawnAt = this.ep + (this.turn === WHITE ? -16 : 16);
      const ok = rank === (this.turn === WHITE ? 5 : 2) && !b[this.ep] && b[pawnAt] === (P | (them << 3));
      if (!ok) this.ep = -1;
    }
  }

  fen() {
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let gap = 0;
      for (let f = 0; f < 8; f++) {
        const pc = this.b[(r << 4) | f];
        if (!pc) { gap++; continue; }
        if (gap) { s += gap; gap = 0; }
        const ch = KINDS[pc & 7];
        s += (pc >> 3) ? ch : ch.toUpperCase();
      }
      if (gap) s += gap;
      if (r) s += '/';
    }
    const c = (this.castle & 1 ? 'K' : '') + (this.castle & 2 ? 'Q' : '') + (this.castle & 4 ? 'k' : '') + (this.castle & 8 ? 'q' : '');
    return s + ' ' + (this.turn ? 'b' : 'w') + ' ' + (c || '-') + ' ' + (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.half + ' ' + this.full;
  }

  /* What "the same position" means for the repetition rule: the same
     pieces, the same side to move, the same castling rights, and the
     same en passant chance - but only if a pawn could really take it. */
  key() {
    const f = this.fen().split(' ');
    let ep = '-';
    if (this.ep >= 0) {
      const row = this.ep + (this.turn === WHITE ? -16 : 16), mine = P | (this.turn << 3);
      if ((!((row - 1) & 0x88) && this.b[row - 1] === mine) || (!((row + 1) & 0x88) && this.b[row + 1] === mine)) ep = f[3];
    }
    return f[0] + ' ' + f[1] + ' ' + f[2] + ' ' + ep;
  }

  clone() {
    const c = new Chess(this.fen());
    c.keys = this.keys.slice();
    return c;
  }

  /* ------------------------------------------------- who attacks what */

  attacked(sq, by) {
    const b = this.b;
    const pawn = P | (by << 3), back = by === WHITE ? -16 : 16;
    let s = sq + back - 1;
    if (!(s & 0x88) && b[s] === pawn) return true;
    s = sq + back + 1;
    if (!(s & 0x88) && b[s] === pawn) return true;
    const knight = N | (by << 3), king = K | (by << 3);
    for (let i = 0; i < 8; i++) {
      s = sq + KNIGHT_D[i];
      if (!(s & 0x88) && b[s] === knight) return true;
      s = sq + KING_D[i];
      if (!(s & 0x88) && b[s] === king) return true;
    }
    const bishop = B | (by << 3), rook = R | (by << 3), queen = Q | (by << 3);
    for (let i = 0; i < 4; i++) {
      let d = BISHOP_D[i];
      for (s = sq + d; !(s & 0x88); s += d) { const pc = b[s]; if (pc) { if (pc === bishop || pc === queen) return true; break; } }
      d = ROOK_D[i];
      for (s = sq + d; !(s & 0x88); s += d) { const pc = b[s]; if (pc) { if (pc === rook || pc === queen) return true; break; } }
    }
    return false;
  }

  inCheck(colour = this.turn) {
    const k = this.kings[colour];
    return k >= 0 && this.attacked(k, colour ^ 1);
  }

  /* --------------------------------------------------- move generation */

  /* Every move the pieces can physically make, including ones that leave
     your own king hanging; legal() filters those. capsOnly is for the
     computer's "keep looking until the captures stop" search. */
  gen(capsOnly = false) {
    const b = this.b, us = this.turn, them = us ^ 1, out = [];
    const up = us === WHITE ? 16 : -16, startR = us === WHITE ? 1 : 6, lastR = us === WHITE ? 6 : 1;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const pc = b[s];
      if (!pc || (pc >> 3) !== us) continue;
      const kind = pc & 7;
      if (kind === P) {
        const r = s >> 4, one = s + up;
        if (one & 0x88) continue;
        if (!b[one]) {
          if (r === lastR) {
            out.push(mk(s, one, Q, 0));
            if (!capsOnly) out.push(mk(s, one, N, 0), mk(s, one, R, 0), mk(s, one, B, 0));
          } else if (!capsOnly) {
            out.push(mk(s, one, 0, 0));
            if (r === startR && !b[one + up]) out.push(mk(s, one + up, 0, F_DOUBLE));
          }
        }
        for (let dx = -1; dx <= 1; dx += 2) {
          const to = one + dx;
          if (to & 0x88) continue;
          const tp = b[to];
          if (tp) {
            if ((tp >> 3) !== them) continue;
            if (r === lastR) {
              out.push(mk(s, to, Q, F_CAPTURE));
              if (!capsOnly) out.push(mk(s, to, N, F_CAPTURE), mk(s, to, R, F_CAPTURE), mk(s, to, B, F_CAPTURE));
            } else out.push(mk(s, to, 0, F_CAPTURE));
          } else if (to === this.ep) out.push(mk(s, to, 0, F_CAPTURE | F_EP));   // en passant
        }
      } else if (kind === N || kind === K) {
        const D = kind === N ? KNIGHT_D : KING_D;
        for (let i = 0; i < 8; i++) {
          const to = s + D[i];
          if (to & 0x88) continue;
          const tp = b[to];
          if (!tp) { if (!capsOnly) out.push(mk(s, to, 0, 0)); }
          else if ((tp >> 3) === them) out.push(mk(s, to, 0, F_CAPTURE));
        }
      } else {
        const D = kind === B ? BISHOP_D : kind === R ? ROOK_D : KING_D;
        for (let i = 0; i < D.length; i++) {
          const d = D[i];
          for (let to = s + d; !(to & 0x88); to += d) {
            const tp = b[to];
            if (!tp) { if (!capsOnly) out.push(mk(s, to, 0, 0)); continue; }
            if ((tp >> 3) === them) out.push(mk(s, to, 0, F_CAPTURE));
            break;
          }
        }
      }
    }
    if (!capsOnly) {
      /* castling: the king may not be in check, nor pass through it; where
         it lands is checked along with every other move in legal() */
      if (us === WHITE) {
        if ((this.castle & 1) && b[4] === WK && b[7] === WR && !b[5] && !b[6] && !this.attacked(4, BLACK) && !this.attacked(5, BLACK)) out.push(mk(4, 6, 0, F_KS));
        if ((this.castle & 2) && b[4] === WK && b[0] === WR && !b[1] && !b[2] && !b[3] && !this.attacked(4, BLACK) && !this.attacked(3, BLACK)) out.push(mk(4, 2, 0, F_QS));
      } else {
        if ((this.castle & 4) && b[116] === BK && b[119] === BR && !b[117] && !b[118] && !this.attacked(116, WHITE) && !this.attacked(117, WHITE)) out.push(mk(116, 118, 0, F_KS));
        if ((this.castle & 8) && b[116] === BK && b[112] === BR && !b[113] && !b[114] && !b[115] && !this.attacked(116, WHITE) && !this.attacked(115, WHITE)) out.push(mk(116, 114, 0, F_QS));
      }
    }
    return out;
  }

  legal() {
    const out = [], us = this.turn, them = us ^ 1;
    const moves = this.gen();
    for (let i = 0; i < moves.length; i++) {
      this.make(moves[i]);
      const k = this.kings[us];
      if (k < 0 || !this.attacked(k, them)) out.push(moves[i]);
      this.unmake();
    }
    return out;
  }

  /* ------------------------------------------------------ make / unmake */

  make(m) {
    const b = this.b, from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
    const us = this.turn, them = us ^ 1;
    const pc = b[from], cap = b[to], kind = pc & 7;
    this.stack.push(m, cap, this.castle, this.ep, this.half, this.kings[0], this.kings[1]);
    b[to] = promo ? (promo | (us << 3)) : pc;
    b[from] = 0;
    if (fl & F_EP) b[to + (us === WHITE ? -16 : 16)] = 0;
    if ((cap & 7) === K) this.kings[them] = -1;          // only possible in a position that was not chess to begin with
    if (kind === K) {
      this.kings[us] = to;
      if (fl & F_KS) { b[to - 1] = b[to + 1]; b[to + 1] = 0; }
      else if (fl & F_QS) { b[to + 1] = b[to - 2]; b[to - 2] = 0; }
    }
    this.castle &= CMASK[from] & CMASK[to];
    this.ep = (fl & F_DOUBLE) ? (from + to) >> 1 : -1;
    this.half = (kind === P || (fl & F_CAPTURE)) ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.turn = them;
  }

  unmake() {
    const st = this.stack;
    this.kings[1] = st.pop(); this.kings[0] = st.pop();
    this.half = st.pop(); this.ep = st.pop(); this.castle = st.pop();
    const cap = st.pop(), m = st.pop();
    const b = this.b, from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
    const them = this.turn, us = them ^ 1;
    this.turn = us;
    if (us === BLACK) this.full--;
    const pc = promo ? (P | (us << 3)) : b[to];
    b[from] = pc;
    b[to] = cap;
    if (fl & F_EP) b[to + (us === WHITE ? -16 : 16)] = P | (them << 3);
    if ((pc & 7) === K) {
      if (fl & F_KS) { b[to + 1] = b[to - 1]; b[to - 1] = 0; }
      else if (fl & F_QS) { b[to - 2] = b[to + 1]; b[to + 1] = 0; }
    }
  }

  /* the game's own version of make: it also remembers the position */
  play(m) { this.make(m); this.keys.push(this.key()); }
  undo() { if (!this.stack.length) return false; this.unmake(); this.keys.pop(); return true; }

  /* ------------------------------------------------- talking to people */

  /* 'e2e4', 'e7e8q' -> a legal move, or 0 */
  fromUci(str) {
    if (typeof str !== 'string' || str.length < 4) return 0;
    const from = str.slice(0, 2), to = str.slice(2, 4);
    if (!isSquare(from) || !isSquare(to)) return 0;
    return this.find(from, to, str[4]);
  }

  find(from, to, promo) {
    const f = sqIndex(from), t = sqIndex(to);
    const want = promo ? KINDS.indexOf(String(promo).toLowerCase()) : 0;
    let fallback = 0;
    for (const m of this.legal()) {
      if (mFrom(m) !== f || mTo(m) !== t) continue;
      if (mPromo(m) === want) return m;
      if (mPromo(m) === Q) fallback = m;        // promotion asked for without saying what: a queen
    }
    return want ? 0 : fallback;
  }

  uci(m) { return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? KINDS[mPromo(m)] : ''); }

  needsPromotion(from, to) {
    const f = sqIndex(from), t = sqIndex(to);
    return this.legal().some(m => mFrom(m) === f && mTo(m) === t && mPromo(m));
  }

  /* everything the board needs to draw the dots for one piece */
  movesFrom(from) {
    const f = sqIndex(from), seen = new Set(), out = [];
    for (const m of this.legal()) {
      if (mFrom(m) !== f || seen.has(mTo(m))) continue;
      seen.add(mTo(m));
      out.push({ to: sqName(mTo(m)), capture: !!(mFlags(m) & F_CAPTURE), promo: !!mPromo(m) });
    }
    return out;
  }

  /* 'P', 'n', ... or null. Capital letters are white, as in FEN. */
  at(square) {
    const pc = this.b[sqIndex(square)];
    if (!pc) return null;
    const ch = KINDS[pc & 7];
    return (pc >> 3) ? ch : ch.toUpperCase();
  }

  /* a list of { sq, ch } for everything on the board */
  pieces() {
    const out = [];
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const pc = this.b[s];
      if (!pc) continue;
      const ch = KINDS[pc & 7];
      out.push({ sq: sqName(s), ch: (pc >> 3) ? ch : ch.toUpperCase() });
    }
    return out;
  }

  /* Standard notation for a move that is about to be played: Nf3, exd5,
     O-O, e8=Q+, Rae1#. Call it before play(), not after. */
  san(m) {
    const from = mFrom(m), to = mTo(m), fl = mFlags(m), promo = mPromo(m);
    const pc = this.b[from], kind = pc & 7;
    let s;
    if (fl & F_KS) s = 'O-O';
    else if (fl & F_QS) s = 'O-O-O';
    else {
      s = '';
      if (kind !== P) {
        s = KINDS[kind].toUpperCase();
        let clash = false, sameFile = false, sameRank = false;
        for (const o of this.legal()) {
          const of = mFrom(o);
          if (of === from || mTo(o) !== to || this.b[of] !== pc) continue;
          clash = true;
          if ((of & 7) === (from & 7)) sameFile = true;
          if ((of >> 4) === (from >> 4)) sameRank = true;
        }
        if (clash) s += !sameFile ? FILES[from & 7] : !sameRank ? String((from >> 4) + 1) : sqName(from);
      }
      if (fl & F_CAPTURE) s += (kind === P ? FILES[from & 7] : '') + 'x';
      s += sqName(to);
      if (promo) s += '=' + KINDS[promo].toUpperCase();
    }
    this.make(m);
    if (this.inCheck()) s += this.legal().length ? '+' : '#';
    this.unmake();
    return s;
  }

  /* ------------------------------------------------------ is it over? */

  repetitions() {
    const last = this.keys[this.keys.length - 1];
    let n = 0;
    for (const k of this.keys) if (k === last) n++;
    return n;
  }

  /* neither side could ever give mate, however badly the other played */
  insufficient() {
    let knights = 0, light = 0, dark = 0;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const kind = this.b[s] & 7;
      if (kind === P || kind === R || kind === Q) return false;
      if (kind === N) knights++;
      else if (kind === B) { if (((s >> 4) + (s & 7)) & 1) light++; else dark++; }
    }
    if (knights === 0) return light === 0 || dark === 0;     // bare kings, or bishops that all live on one colour
    return knights === 1 && light + dark === 0;
  }

  /* Could this colour still win if the other side ran out of time?
     A lone king cannot, and neither can a king with one bishop or knight. */
  canWinOnTime(colour) {
    let minor = 0;
    for (let s = 0; s < 120; s++) {
      if (s & 0x88) { s += 7; continue; }
      const pc = this.b[s];
      if (!pc || (pc >> 3) !== colour) continue;
      const kind = pc & 7;
      if (kind === P || kind === R || kind === Q) return true;
      if (kind === N || kind === B) minor++;
    }
    return minor >= 2;
  }

  /* { over, result, reason, check }  result is '1-0', '0-1' or '1/2-1/2' */
  status() {
    const wk = this.kings[WHITE] >= 0, bk = this.kings[BLACK] >= 0;
    if (!wk || !bk) return { over: true, result: wk ? '1-0' : bk ? '0-1' : '1/2-1/2', reason: 'king', check: false };
    const check = this.inCheck(), any = this.legal().length > 0;
    if (!any) return check
      ? { over: true, result: this.turn === WHITE ? '0-1' : '1-0', reason: 'checkmate', check }
      : { over: true, result: '1/2-1/2', reason: 'stalemate', check };
    if (this.insufficient()) return { over: true, result: '1/2-1/2', reason: 'material', check };
    if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty', check };
    if (this.repetitions() >= 3) return { over: true, result: '1/2-1/2', reason: 'repetition', check };
    return { over: false, result: null, reason: null, check };
  }

  /* how many games are possible from here, n moves deep - the standard
     way to prove a move generator right */
  perft(depth) {
    if (depth === 0) return 1;
    const us = this.turn, them = us ^ 1, moves = this.gen();
    let n = 0;
    for (let i = 0; i < moves.length; i++) {
      this.make(moves[i]);
      const k = this.kings[us];
      if (k < 0 || !this.attacked(k, them)) n += depth === 1 ? 1 : this.perft(depth - 1);
      this.unmake();
    }
    return n;
  }
}

/* ------------------------------------------------------------------
   Editing a position by hand, for the console. These work on a FEN
   and give a FEN back, so the same code serves a game against the
   computer and a live one stored in the database.
   ------------------------------------------------------------------ */

export function editFen(fen, fn) {
  const c = new Chess(fen);
  const api = {
    chess: c,
    at: sq => c.at(sq),
    put(sq, ch) {
      const kind = KINDS.indexOf(ch.toLowerCase());
      if (kind < 1) throw new Error('no such piece: ' + ch);
      const colour = ch === ch.toLowerCase() ? BLACK : WHITE, s = sqIndex(sq);
      const rank = s >> 4;
      let k = kind;
      if (k === P && (rank === 0 || rank === 7)) k = Q;         // a pawn cannot stand on the back rank
      if ((c.b[s] & 7) === K) c.kings[c.b[s] >> 3] = -1;
      c.b[s] = k | (colour << 3);
      if (k === K) c.kings[colour] = s;
    },
    remove(sq) {
      const s = sqIndex(sq), pc = c.b[s];
      if ((pc & 7) === K) c.kings[pc >> 3] = -1;
      c.b[s] = 0;
    },
    setTurn(colour) { c.turn = colour === 'b' || colour === BLACK ? BLACK : WHITE; },
  };
  fn(api);
  c.ep = -1;
  c.half = 0;
  c.sanitize();
  return c.fen();
}

export const colourOf = ch => (ch === ch.toLowerCase() ? 'b' : 'w');
export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
