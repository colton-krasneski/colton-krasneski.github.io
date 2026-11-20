/* ============================================================
   The computer player.

   A plain alpha-beta search: look some moves ahead, assume the
   other side always answers with its best, and score what is left
   by counting material and asking whether each piece stands on a
   good square. Where the look-ahead stops in the middle of a trade
   it keeps going until the captures run out, so it never thinks it
   has won a queen that is about to be taken back.

   The eight opponents differ in how far they look and in how often
   they are made to choose badly on purpose. A beginner should be
   able to beat the first two.

   This runs inside ai-worker.js so the page never freezes while it
   thinks; it imports nothing but the rules.
   ============================================================ */

import { Chess, WHITE, P, N, B, R, Q, K, F_CAPTURE, F_EP, mFrom, mTo, mPromo, mFlags } from './engine.js';

export const LEVELS = [
  { name: 'Confused Bishop', emoji: '🤪', elo: 250,  depth: 1, noise: 320, random: 0.5,  time: 400,  quip: 'Diagonals? What\'s that?' },
  { name: 'Pawny',           emoji: '🐣', elo: 450,  depth: 1, noise: 200, random: 0.25, time: 400,  quip: 'I only know how to go forward.' },
  { name: 'Sir Hops-a-Lot',  emoji: '🐴', elo: 650,  depth: 2, noise: 140, random: 0.1,  time: 600,  quip: 'Neigh means L-shape.' },
  { name: 'Rookie',          emoji: '🏰', elo: 850,  depth: 2, noise: 70,  random: 0,    time: 800,  quip: 'Straight lines only, please.' },
  { name: 'Castle Kid',      emoji: '🧒', elo: 1100, depth: 3, noise: 35,  random: 0,    time: 1200, quip: 'I learned a fork yesterday.' },
  { name: 'Queen Bee',       emoji: '🐝', elo: 1350, depth: 4, noise: 12,  random: 0,    time: 1800, quip: 'Buzz off my centre squares.' },
  { name: 'The Matrix',      emoji: '🟩', elo: 1600, depth: 5, noise: 0,   random: 0,    time: 2400, quip: 'I can see the code of your position.' },
  { name: 'Final Boss',      emoji: '💀', elo: 1850, depth: 8, noise: 0,   random: 0,    time: 2600, quip: 'You were never going to win this.' },
];

const VAL = [0, 100, 320, 330, 500, 900, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];
const MATE = 100000, INF = 1000000, MAX_PLY = 48;

/* Where each kind of piece likes to stand, seen from White's side with
   rank 8 on the top row - the widely used "simplified evaluation" tables. */
const TABLES = {
  [P]: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  [N]: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  [B]: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  [R]: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  [Q]: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  [K]: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  end: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
};

/* the same tables laid out on the 0x88 board, once for each colour */
const PST = [[], []], KING_END = [new Int16Array(128), new Int16Array(128)];
for (const kind of [P, N, B, R, Q, K]) { PST[0][kind] = new Int16Array(128); PST[1][kind] = new Int16Array(128); }
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
  const sq = (r << 4) | f, w = (7 - r) * 8 + f, bl = r * 8 + f;
  for (const kind of [P, N, B, R, Q, K]) { PST[0][kind][sq] = TABLES[kind][w]; PST[1][kind][sq] = TABLES[kind][bl]; }
  KING_END[0][sq] = TABLES.end[w]; KING_END[1][sq] = TABLES.end[bl];
}

const edge = sq => { const f = sq & 7, r = sq >> 4; return Math.max(3 - f, f - 4) + Math.max(3 - r, r - 4); };
const apart = (a, b) => Math.abs((a & 7) - (b & 7)) + Math.abs((a >> 4) - (b >> 4));

/* how good is this for the side to move, in hundredths of a pawn */
function evaluate(pos) {
  const b = pos.b;
  let score = 0, phase = 0, wBish = 0, bBish = 0, wMat = 0, bMat = 0;
  for (let s = 0; s < 120; s++) {
    if (s & 0x88) { s += 7; continue; }
    const pc = b[s];
    if (!pc) continue;
    const kind = pc & 7;
    if (kind === K) continue;
    phase += PHASE[kind];
    if (pc >> 3) { score -= VAL[kind] + PST[1][kind][s]; bMat += VAL[kind]; if (kind === B) bBish++; }
    else { score += VAL[kind] + PST[0][kind][s]; wMat += VAL[kind]; if (kind === B) wBish++; }
  }
  if (wBish >= 2) score += 30;
  if (bBish >= 2) score -= 30;
  if (phase > 24) phase = 24;
  const wk = pos.kings[0], bk = pos.kings[1];
  if (wk >= 0) score += (PST[0][K][wk] * phase + KING_END[0][wk] * (24 - phase)) / 24;
  if (bk >= 0) score -= (PST[1][K][bk] * phase + KING_END[1][bk] * (24 - phase)) / 24;
  /* Winning easily but with few pieces left: nothing above says how to
     finish. Herd the losing king to the edge and bring your own king up. */
  if (wk >= 0 && bk >= 0 && phase <= 10) {
    if (wMat - bMat > 350) score += 12 * edge(bk) + 5 * (14 - apart(wk, bk));
    else if (bMat - wMat > 350) score -= 12 * edge(wk) + 5 * (14 - apart(wk, bk));
  }
  return (pos.turn === WHITE ? score : -score) | 0;
}

/* ---------------------------------------------------------------- search */

let nodes = 0, deadline = 0, stop = false;
const history = new Int32Array(128 * 128);
const killers = new Int32Array(MAX_PLY * 2 + 4);

function scoreMoves(pos, moves, ply, first) {
  const b = pos.b, sc = new Int32Array(moves.length);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i], fl = mFlags(m);
    if (m === first) sc[i] = 3000000;
    else if (fl & F_CAPTURE) sc[i] = 1000000 + VAL[(fl & F_EP) ? P : (b[mTo(m)] & 7)] * 10 - VAL[b[mFrom(m)] & 7];
    else if (mPromo(m) === Q) sc[i] = 900000;
    else if (m === killers[ply * 2]) sc[i] = 800000;
    else if (m === killers[ply * 2 + 1]) sc[i] = 700000;
    else sc[i] = Math.min(history[mFrom(m) * 128 + mTo(m)], 600000);
  }
  return sc;
}

/* bring the best-scored remaining move to position i */
function pick(moves, sc, i) {
  let best = i;
  for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[best]) best = j;
  if (best !== i) {
    const m = moves[i]; moves[i] = moves[best]; moves[best] = m;
    const s = sc[i]; sc[i] = sc[best]; sc[best] = s;
  }
  return moves[i];
}

function quiesce(pos, alpha, beta, ply) {
  nodes++;
  const us = pos.turn, them = us ^ 1;
  if (pos.kings[us] < 0) return -MATE + ply;
  if (pos.kings[them] < 0) return MATE - ply;
  const stand = evaluate(pos);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (ply >= MAX_PLY) return stand;
  const moves = pos.gen(true), sc = scoreMoves(pos, moves, ply, 0);
  for (let i = 0; i < moves.length; i++) {
    const m = pick(moves, sc, i);
    pos.make(m);
    const k = pos.kings[us];
    if (k >= 0 && pos.attacked(k, them)) { pos.unmake(); continue; }
    const v = -quiesce(pos, -beta, -alpha, ply + 1);
    pos.unmake();
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(pos, depth, alpha, beta, ply) {
  if (stop) return 0;
  if ((++nodes & 2047) === 0 && Date.now() > deadline) { stop = true; return 0; }
  const us = pos.turn, them = us ^ 1, k = pos.kings[us];
  if (k < 0) return -MATE + ply;
  if (pos.kings[them] < 0) return MATE - ply;
  if (pos.half >= 100) return 0;
  const inCheck = pos.attacked(k, them);
  if (inCheck && ply < MAX_PLY - 8) depth++;               // never stop looking while in check
  if (depth <= 0 || ply >= MAX_PLY) return quiesce(pos, alpha, beta, ply);
  const moves = pos.gen(false), sc = scoreMoves(pos, moves, ply, 0);
  let legal = 0, best = -INF;
  for (let i = 0; i < moves.length; i++) {
    const m = pick(moves, sc, i);
    pos.make(m);
    const kk = pos.kings[us];
    if (kk >= 0 && pos.attacked(kk, them)) { pos.unmake(); continue; }
    legal++;
    const v = -search(pos, depth - 1, -beta, -alpha, ply + 1);
    pos.unmake();
    if (stop) return 0;
    if (v > best) {
      best = v;
      if (v > alpha) {
        alpha = v;
        if (v >= beta) {
          if (!(mFlags(m) & F_CAPTURE)) {
            if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
            history[mFrom(m) * 128 + mTo(m)] += depth * depth;
          }
          break;
        }
      }
    }
  }
  if (!legal) return inCheck ? -MATE + ply : 0;
  return best;
}

/* { fen, level 1-8, keys: positions already seen this game, time: ms }
   -> { uci, score, depth, nodes }   or null when there is nothing to play */
export function think({ fen, level = 4, keys = null, time = null }) {
  const cfg = LEVELS[Math.min(LEVELS.length, Math.max(1, level | 0)) - 1];
  const pos = new Chess(fen);
  let order = pos.legal();
  if (!order.length) return null;
  const result = (m, score, depth) => ({ uci: pos.uci(m), score, depth, nodes });
  nodes = 0; stop = false;
  if (order.length === 1) return result(order[0], 0, 0);
  if (cfg.random && Math.random() < cfg.random) return result(order[(Math.random() * order.length) | 0], 0, 0);

  history.fill(0); killers.fill(0);
  deadline = Date.now() + (time || cfg.time);
  const seen = new Map();
  if (keys) for (const k of keys) seen.set(k, (seen.get(k) || 0) + 1);

  let scored = order.map(m => [m, 0]), reached = 0;
  for (let depth = 1; depth <= cfg.depth; depth++) {
    const round = [];
    let alpha = -INF;
    for (const m of order) {
      pos.make(m);
      const times = seen.size ? (seen.get(pos.key()) || 0) : 0;
      let v;
      if (times >= 2) v = 0;                                  // playing this would be a draw by repetition
      else {
        v = cfg.noise ? -search(pos, depth - 1, -INF, INF, 1) : -search(pos, depth - 1, -INF, -alpha, 1);
        if (times === 1 && v > 40) v -= 30;                    // winning? then stop going round in circles
      }
      pos.unmake();
      if (stop) break;
      round.push([m, v]);
      if (v > alpha) alpha = v;
    }
    /* a round cut short by the clock still counts if it got as far as
       re-checking the move we already liked */
    if (round.length) {
      if (!stop) { scored = round; reached = depth; }
      else if (round.some(([, v]) => v > round[0][1])) scored = round.concat(scored.filter(([m]) => !round.some(([x]) => x === m)).map(([m]) => [m, -INF]));
    }
    if (stop) break;
    scored.sort((a, b) => b[1] - a[1]);
    order = scored.map(([m]) => m);
    if (scored[0][1] > MATE - 200) break;                      // a forced mate: no need to look further
  }

  scored.sort((a, b) => b[1] - a[1]);
  let choice = scored[0];
  if (cfg.noise) {
    let top = -INF;
    for (const s of scored) { const v = s[1] + (Math.random() * 2 - 1) * cfg.noise; if (v > top) { top = v; choice = s; } }
  }
  return result(choice[0], choice[1], reached);
}
