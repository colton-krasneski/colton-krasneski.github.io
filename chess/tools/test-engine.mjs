/* ============================================================
   Proving the rules right.          node chess/tools/test-engine.mjs

   "Perft" counts every line of play to a fixed depth. The totals
   for these positions are published and every chess programmer
   checks against them: one wrong castling rule or one missed en
   passant and a number is off. If they all match, the generator
   is right.
   ============================================================ */

import { Chess, START_FEN, editFen } from '../js/engine.js';
import { think, LEVELS } from '../js/ai.js';

let failed = 0;
const ok = (name, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) failed++;
  console.log((pass ? '  ok   ' : '  FAIL ') + name + (pass ? '' : '   got ' + JSON.stringify(got) + '   wanted ' + JSON.stringify(want)));
};

console.log('perft');
const PERFT = [
  ['start', START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['endgame', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['promos', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['buggy', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['mirror', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];
for (const [name, fen, want] of PERFT) {
  const c = new Chess(fen);
  want.forEach((n, i) => ok(name + ' depth ' + (i + 1), c.perft(i + 1), n));
  ok(name + ' fen round trip', c.fen(), fen);
}

console.log('notation');
const line = (fen, ucis) => { const c = new Chess(fen); return ucis.map(u => { const m = c.fromUci(u); if (!m) return '??' + u; const s = c.san(m); c.play(m); return s; }); };
ok('scholar\'s mate', line(START_FEN, ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']), ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']);
ok('en passant', line('rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 2', ['d4e3']), ['dxe3']);
ok('castling both ways', line('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1', 'e8c8']), ['O-O', 'O-O-O']);
ok('promotion', line('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8q']), ['a8=Q']);
ok('underpromotion', line('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8n']), ['a8=N']);
ok('two knights, one square', line('4k3/8/8/8/8/8/8/N3K1N1 w - - 0 1', ['a1b3']), ['Nb3']);
ok('file disambiguation', line('4k3/8/8/8/8/2N3N1/8/4K3 w - - 0 1', ['c3e4']), ['Nce4']);
ok('rank disambiguation', line('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', ['a1a3']), ['R1a3']);
ok('illegal move refused', new Chess().fromUci('e2e5'), 0);
ok('cannot leave king in check', new Chess('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1').fromUci('e2d2'), 0);

console.log('endings');
const st = fen => { const s = new Chess(fen).status(); return [s.over, s.result, s.reason]; };
ok('checkmate', st('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'), [true, '0-1', 'checkmate']);
ok('stalemate', st('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), [true, '1/2-1/2', 'stalemate']);
ok('bare kings', st('8/8/4k3/8/8/4K3/8/8 w - - 0 1'), [true, '1/2-1/2', 'material']);
ok('king and knight', st('8/8/4k3/8/8/4KN2/8/8 w - - 0 1'), [true, '1/2-1/2', 'material']);
ok('same-colour bishops', st('8/8/4k3/8/8/4KB2/8/5b2 w - - 0 1'), [true, '1/2-1/2', 'material']);
ok('opposite bishops play on', st('8/8/4k3/8/8/4KB2/8/4b3 w - - 0 1'), [false, null, null]);
ok('fifty moves', st('8/8/4k3/8/8/4K3/8/7R w - - 100 80'), [true, '1/2-1/2', 'fifty']);
ok('game goes on', st(START_FEN), [false, null, null]);
{
  const c = new Chess();
  for (const u of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']) c.play(c.fromUci(u));
  ok('threefold repetition', [c.status().reason, c.repetitions()], ['repetition', 3]);
  c.undo();
  ok('undo takes the repetition back', c.status().over, false);
}
ok('lone king cannot win on time', new Chess('8/8/4k3/8/8/4K2R/8/8 w - - 0 1').canWinOnTime(1), false);
ok('rook can win on time', new Chess('8/8/4k3/8/8/4K2R/8/8 w - - 0 1').canWinOnTime(0), true);

console.log('console edits');
{
  const boom = editFen(START_FEN, e => e.remove('e8'));
  ok('exploded king ends the game', st(boom), [true, '1-0', 'king']);
  const gift = editFen(START_FEN, e => e.put('e4', 'Q'));
  ok('a queen from nowhere', new Chess(gift).at('e4'), 'Q');
  const rook = editFen(START_FEN, e => e.remove('h1'));
  ok('castling right goes with the rook', rook.split(' ')[2], 'Qkq');
  const pawn = editFen(START_FEN, e => { e.remove('a8'); e.put('a8', 'P'); });
  ok('pawn on the back rank becomes a queen', new Chess(pawn).at('a8'), 'Q');
  ok('edited position still generates moves', new Chess(boom).legal().length > 0, true);
}

console.log('computer player');
{
  const t0 = Date.now();
  const mate1 = think({ fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', level: 5 });
  ok('finds mate in one', mate1.uci, 'a1a8');
  const hang = think({ fen: 'rnb1kbnr/pppp1ppp/8/4p1q1/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3', level: 6 });
  ok('takes a free queen', hang.uci, 'c1g5');
  const mate2 = think({ fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p2Q/2B1P3/3P1N2/PPP2PPP/RNB1K2R w KQ - 0 1', level: 7 });
  ok('level 7 returns a legal move', !!new Chess('r1bq1rk1/pppp1ppp/2n2n2/2b1p2Q/2B1P3/3P1N2/PPP2PPP/RNB1K2R w KQ - 0 1').fromUci(mate2.uci), true);
  for (let lv = 1; lv <= LEVELS.length; lv++) {
    const c = new Chess();
    let plies = 0;
    const t = Date.now();
    while (!c.status().over && plies < 16) { const r = think({ fen: c.fen(), level: lv, keys: c.keys, time: 350 }); c.play(c.fromUci(r.uci)); plies++; }
    console.log('  level ' + lv + ' (' + LEVELS[lv - 1].name + '): 16 plies in ' + (Date.now() - t) + ' ms');
  }
  const kq = new Chess('8/8/8/4k3/8/8/8/KQ6 w - - 0 1');
  let n = 0;
  while (!kq.status().over && n < 80) { const r = think({ fen: kq.fen(), level: 8, keys: kq.keys, time: 300 }); kq.play(kq.fromUci(r.uci)); n++; }
  ok('top level mates with king and queen (' + n + ' plies)', kq.status().reason, 'checkmate');
  console.log('  computer tests took ' + (Date.now() - t0) + ' ms');
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall good');
process.exit(failed ? 1 : 0);
