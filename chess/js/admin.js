/* ============================================================
   The creator's console.          Shift+G, then the password.

   A command line that can do things to a chess game that chess
   does not allow: fire rockets at pieces, hand out queens, swap
   squares, stop the clock. On a phone, tap the ♟ logo (or, during a
   game, the title above the board) five times instead of Shift+G.

   ADDING YOUR OWN COMMAND takes one block, anywhere below the
   others:

       add('boop', '/boop <square>', 'Says boop at a square.', async (args, c) => {
         c.print('boop ' + args[0]);
       });

   args is what was typed after the command, split on spaces. c has
   print(text), view() (the game in front of you), and the helpers
   square(), piece() and who() that turn what was typed into
   something usable or complain in plain words.

   Or do it without touching the code at all, from the console:
       /alias boom /target queen; /say BOOM
   makes /boom, and it is remembered on this device.

   Anything here that changes the board turns the game into "chaos
   mode": both players are told, and it stops counting for rating.
   That is what keeps the ladder fair for everybody else.
   ============================================================ */

import { Chess, START_FEN, editFen, isSquare, colourOf, PIECE_NAMES } from './engine.js';
import * as game from './game.js';
import * as net from './net.js';
import * as fx from './fx.js';
import * as sound from './sound.js';
import { state, h, $, shown, isOwner, THEMES, settings, saveSettings, clean, clamp } from './shared.js';

/* the password is kept as a fingerprint, not as the word itself */
const PASS_SHA = 'c1b54e8ce3e495850160bb877d72d30a513231425ef2f4752114912e20b7a97d';
const PASS_FNV = '60d6d05a';
const ALIAS_KEY = 'colton_chess_aliases';
const FILES = 'abcdefgh';

const commands = new Map();
let panel = null, out = null, input = null, past = [], pastAt = 0, onTheme = () => {};

/* ---------------------------------------------------------- password */

async function matches(word) {
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(word));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('') === PASS_SHA;
    }
  } catch (e) { /* fall through */ }
  let n = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) { n ^= word.charCodeAt(i); n = Math.imul(n, 0x01000193) >>> 0; }
  return n.toString(16) === PASS_FNV;
}

/* ------------------------------------------------------------ the box */

export function initAdmin(opts = {}) {
  onTheme = opts.onTheme || onTheme;
  try { state.admin = sessionStorage.getItem('colton_chess_console') === '1'; } catch (e) { /* private window */ }

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel && panel.classList.contains('on')) { hide(); return; }
    if (!(e.shiftKey && (e.key === 'G' || e.key === 'g')) || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing && !(panel && panel.contains(t))) return;
    if (typing && panel && panel.contains(t) && state.admin) return;      // let a capital G be typed in the console
    e.preventDefault();
    toggle();
  });

  /* no keyboard on a phone: five quick taps on the logo, or on the title
     above the board when a game is on */
  let taps = 0, tapTimer = null;
  for (const logo of document.querySelectorAll('.logo, #gTitle')) {
    logo.addEventListener('click', () => {
      taps++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { taps = 0; }, 1400);
      if (taps >= 5) { taps = 0; show(); }
    });
  }
}

function build() {
  out = h('div', { class: 'con-out', role: 'log' });
  input = h('input', { class: 'con-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Console' });
  panel = h('div', { class: 'console', id: 'console' },
    h('div', { class: 'con-head' }, h('span', null, '👑 CREATOR CONSOLE'), h('span', { class: 'con-hint' }, 'Shift+G · Esc'),
      h('button', { class: 'con-x', 'aria-label': 'Close console', onclick: hide }, '✕')),
    out,
    h('div', { class: 'con-line' }, h('span', { class: 'con-prompt' }, '›'), input));
  document.body.appendChild(panel);
  input.addEventListener('keydown', onKey);
}

function show() {
  if (!panel) build();
  panel.classList.add('on');
  gate();
  setTimeout(() => input.focus(), 30);
}
function hide() { if (panel) panel.classList.remove('on'); }
function toggle() { if (panel && panel.classList.contains('on')) hide(); else show(); }

function gate() {
  if (state.admin) { input.type = 'text'; input.placeholder = '/help'; if (!out.children.length) print('Console unlocked. Type /help to see what you can do.', 'ok'); }
  else { input.type = 'password'; input.placeholder = 'password'; input.value = ''; if (!out.children.length) print('Password?', 'dim'); }
}

function print(text, cls = '') {
  if (!out) return;
  for (const line of String(text).split('\n')) out.appendChild(h('div', { class: 'con-row ' + cls }, line));
  while (out.children.length > 300) out.firstChild.remove();
  out.scrollTop = out.scrollHeight;
}

async function onKey(e) {
  if (e.key === 'Enter') {
    const text = input.value;
    input.value = '';
    if (!state.admin) {
      if (await matches(text)) {
        state.admin = true;
        try { sessionStorage.setItem('colton_chess_console', '1'); } catch (err) { /* fine */ }
        out.innerHTML = '';
        sound.play('promote');
        print('ACCESS GRANTED' + (isOwner(state.me) ? '. Welcome back, creator 👑' : '.'), 'ok');
        print('Type /help to see what you can do.', 'dim');
        gate();
      } else { sound.play('error'); print('Nope.', 'bad'); }
      return;
    }
    const line = text.trim();
    if (!line) return;
    past.push(line); pastAt = past.length;
    print('› ' + line, 'echo');
    await runLine(line, 0);
    return;
  }
  if (!state.admin) return;
  if (e.key === 'ArrowUp') { if (pastAt > 0) input.value = past[--pastAt]; e.preventDefault(); }
  else if (e.key === 'ArrowDown') { input.value = pastAt < past.length - 1 ? past[++pastAt] : (pastAt = past.length, ''); e.preventDefault(); }
  else if (e.key === 'Tab') {
    e.preventDefault();
    const typed = input.value.replace(/^\//, '').toLowerCase();
    if (typed.includes(' ')) return;
    const names = [...new Set([...commands.keys(), ...Object.keys(aliases())])].filter(n => n.startsWith(typed)).sort();
    if (names.length === 1) input.value = '/' + names[0] + ' ';
    else if (names.length) print(names.map(n => '/' + n).join('  '), 'dim');
  }
}

/* --------------------------------------------------------- running it */

const aliases = () => { try { return JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}') || {}; } catch (e) { return {}; } };
const saveAliases = a => { try { localStorage.setItem(ALIAS_KEY, JSON.stringify(a)); } catch (e) { /* fine */ } };

async function runLine(line, depth) {
  for (const part of line.split(';').map(s => s.trim()).filter(Boolean)) {
    if (part[0] !== '/') { print('Commands start with a slash. Try /help', 'bad'); continue; }
    const words = part.slice(1).split(/\s+/), name = words.shift().toLowerCase();
    const entry = commands.get(name);
    try {
      if (entry) await entry.run(words, ctx);
      else if (aliases()[name]) {
        if (depth > 4) throw new Error('That alias goes round in circles.');
        const body = aliases()[name].replace(/\$\*/g, words.join(' ')).replace(/\$(\d)/g, (m, d) => words[d - 1] || '');
        await runLine(body, depth + 1);
      } else print('No such command: /' + name + '. Try /help', 'bad');
    } catch (e) { sound.play('error'); print(e && e.message ? e.message : String(e), 'bad'); }
  }
}

/* ------------------------------------------------- helpers for commands */

const other = c => (c === 'w' ? 'b' : 'w');
const KIND_WORDS = { p: 'p', pawn: 'p', pawns: 'p', n: 'n', knight: 'n', knights: 'n', horse: 'n', horses: 'n', b: 'b', bishop: 'b', bishops: 'b', r: 'r', rook: 'r', rooks: 'r', castle: 'r', q: 'q', queen: 'q', queens: 'q', k: 'k', king: 'k' };

const ctx = {
  print,
  view() { return game.consoleView(); },
  playing() { const v = game.consoleView(); if (!v.doc || v.doc.status !== 'active') throw new Error('Open a game that is still going first.'); return v; },
  square(word) { const s = String(word || '').toLowerCase(); if (!isSquare(s)) throw new Error('"' + (word || '') + '" is not a square. Squares look like e4.'); return s; },
  piece(word, allowKing) {
    const k = KIND_WORDS[String(word || '').toLowerCase()];
    if (!k) throw new Error('"' + (word || '') + '" is not a piece. Try pawn, knight, bishop, rook or queen.');
    if (k === 'k' && !allowKing) throw new Error('There can only be one king each.');
    return k;
  },
  /* 'me', 'them', 'white', 'black' or a player's name -> 'w' or 'b' */
  who(word, v) {
    const s = String(word || '').toLowerCase(), mine = v.my || v.turn;
    if (['me', 'my', 'mine', 'i', 'self'].includes(s)) return mine;
    if (['them', 'they', 'enemy', 'opp', 'opponent', 'you'].includes(s)) return other(mine);
    if (s === 'white' || s === 'w') return 'w';
    if (s === 'black' || s === 'b') return 'b';
    for (const c of ['w', 'b']) {
      const name = c === 'w' ? v.doc.white : v.doc.black;
      if (name.toLowerCase() === s || game.label(name).toLowerCase() === s) return c;
    }
    throw new Error('Who is "' + (word || '') + '"? Say me, them, white, black, or a player\'s name.');
  },
  enemy(v) { return other(v.my || v.turn); },
};

const letter = (kind, colour) => (colour === 'w' ? kind.toUpperCase() : kind);
const allSquares = () => { const a = []; for (const f of FILES) for (let r = 1; r <= 8; r++) a.push(f + r); return a; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

function add(name, usage, help, run, also = []) {
  const entry = { name, usage, help, run };
  commands.set(name, entry);
  for (const a of also) commands.set(a, Object.assign({ hidden: true }, entry));
}

/* ============================================================ commands */

add('help', '/help [command]', 'This list, or the details of one command.', (args) => {
  const one = args[0] && commands.get(args[0].replace(/^\//, '').toLowerCase());
  if (one) { print(one.usage, 'ok'); print('  ' + one.help, 'dim'); return; }
  print('COMMANDS', 'ok');
  for (const c of commands.values()) if (!c.hidden) print('  ' + c.usage.padEnd(34) + c.help, 'dim');
  const al = aliases();
  if (Object.keys(al).length) { print('YOUR OWN', 'ok'); for (const k in al) print('  /' + k.padEnd(33) + al[k], 'dim'); }
  print('Join commands with ;   Tab finishes a name   ↑ repeats', 'dim');
});

add('give', '/give <who> <piece> [square] [xN]', 'Gives a player a piece. No square = somewhere on their side.', async (args, c) => {
  const v = c.playing(), colour = c.who(args[0], v), kind = c.piece(args[1]);
  let square = null, count = 1;
  for (const a of args.slice(2)) {
    if (/^x?\d+$/i.test(a)) count = clamp(parseInt(a.replace(/x/i, ''), 10), 1, 8);
    else square = c.square(a);
  }
  await game.consoleEdit(g => {
    const placed = [];
    const fen = editFen(g.fen, api => {
      const home = sq => { const r = +sq[1]; return colour === 'w' ? r <= 4 && (kind !== 'p' || r >= 2) : r >= 5 && (kind !== 'p' || r <= 7); };
      const empty = shuffle(allSquares().filter(sq => !api.at(sq) && home(sq)));
      for (let i = 0; i < count; i++) {
        const sq = i === 0 && square ? square : empty.pop();
        if (!sq) break;
        if ((api.at(sq) || '').toLowerCase() === 'k') throw new Error('There is a king on ' + sq + '. Use /target if you want it gone.');
        api.put(sq, letter(kind, colour));
        placed.push(sq);
      }
    });
    if (!placed.length) throw new Error('No room on that side of the board.');
    return { fen, fx: 'give:' + placed.join(',') };
  });
  print('Gave ' + (colour === 'w' ? 'White' : 'Black') + ' ' + (count > 1 ? count + ' ' + PIECE_NAMES[kind] + 's' : 'a ' + PIECE_NAMES[kind]) + '.', 'ok');
});

add('target', '/target <squares | piece | random [n] | all>', 'Fires a rocket at each target and blows it up.', async (args, c) => {
  const v = c.playing(), foe = c.enemy(v);
  if (!args.length) throw new Error('Target what? A square (e4), a piece (queen), random, or all.');
  let hit = [];
  await game.consoleEdit(g => {
    hit = [];
    const fen = editFen(g.fen, api => {
      const theirs = kind => allSquares().filter(sq => { const p = api.at(sq); return p && colourOf(p) === foe && (kind ? p.toLowerCase() === kind : p.toLowerCase() !== 'k'); });
      for (let i = 0; i < args.length; i++) {
        const a = args[i].toLowerCase();
        if (isSquare(a)) { if (!api.at(a)) throw new Error('There is nothing on ' + a + ' to hit.'); hit.push(a); }
        else if (a === 'all') hit.push(...theirs(null));
        else if (a === 'random') { const n = /^\d+$/.test(args[i + 1] || '') ? clamp(+args[++i], 1, 15) : 1; hit.push(...shuffle(theirs(null)).slice(0, n)); }
        else {
          if (!KIND_WORDS[a]) throw new Error('"' + args[i] + '" is not a square or a piece. Try e4, queen, random or all.');
          const found = theirs(KIND_WORDS[a]);
          if (!found.length) throw new Error('They have no ' + PIECE_NAMES[KIND_WORDS[a]] + ' to hit.');
          hit.push(...found);
        }
      }
      hit = [...new Set(hit)].slice(0, 16);
      if (!hit.length) throw new Error('Nothing to hit.');
      for (const sq of hit) api.remove(sq);
    });
    return { fen, fx: 'rocket:' + hit.join(',') };
  });
  print('💥 ' + hit.join(', '), 'ok');
}, ['rocket', 'nuke']);

add('airstrike', '/airstrike <file a-h | rank 1-8>', 'Rockets on every piece in a line (kings take cover).', async (args, c) => {
  c.playing();
  const a = String(args[0] || '').toLowerCase();
  if (!/^[a-h1-8]$/.test(a)) throw new Error('Say which line: a file (a-h) or a rank (1-8).');
  let hit = [];
  await game.consoleEdit(g => {
    const fen = editFen(g.fen, api => {
      hit = allSquares().filter(sq => (sq[0] === a || sq[1] === a) && api.at(sq) && api.at(sq).toLowerCase() !== 'k');
      if (!hit.length) throw new Error('That line is already empty.');
      for (const sq of hit) api.remove(sq);
    });
    return { fen, fx: 'rocket:' + hit.join(',') };
  });
  print('💥 ' + hit.join(', '), 'ok');
});

add('swap', '/swap <square> <square>', 'Swaps what is on two squares.', async (args, c) => {
  c.playing();
  const a = c.square(args[0]), b = c.square(args[1]);
  await game.consoleEdit(g => ({
    fen: editFen(g.fen, api => {
      const pa = api.at(a), pb = api.at(b);
      if (!pa && !pb) throw new Error('Both of those squares are empty.');
      api.remove(a); api.remove(b);
      if (pb) api.put(a, pb);
      if (pa) api.put(b, pa);
    }), fx: 'swap:' + a + ',' + b,
  }));
  print('Swapped ' + a + ' and ' + b + '.', 'ok');
});

add('tp', '/tp <from> <to>', 'Teleports a piece, rules or no rules.', async (args, c) => {
  c.playing();
  const a = c.square(args[0]), b = c.square(args[1]);
  await game.consoleEdit(g => ({
    fen: editFen(g.fen, api => {
      const p = api.at(a);
      if (!p) throw new Error('There is nothing on ' + a + '.');
      api.remove(a); api.remove(b); api.put(b, p);
    }), fx: 'tp:' + a + ',' + b,
  }));
  print('Teleported ' + a + ' to ' + b + '.', 'ok');
}, ['move', 'teleport']);

add('morph', '/morph <square> <piece>', 'Turns the piece on a square into something else.', async (args, c) => {
  c.playing();
  const sq = c.square(args[0]), kind = c.piece(args[1]);
  await game.consoleEdit(g => ({
    fen: editFen(g.fen, api => {
      const p = api.at(sq);
      if (!p) throw new Error('There is nothing on ' + sq + '.');
      if (p.toLowerCase() === 'k') throw new Error('A king stays a king.');
      api.put(sq, letter(kind, colourOf(p)));
    }), fx: 'morph:' + sq,
  }));
  print(sq + ' is now a ' + PIECE_NAMES[kind] + '.', 'ok');
}, ['promote']);

add('army', '/army <who> <piece>', 'Turns every pawn a player has into that piece.', async (args, c) => {
  const v = c.playing(), colour = c.who(args[0], v), kind = c.piece(args[1]);
  let changed = [];
  await game.consoleEdit(g => {
    const fen = editFen(g.fen, api => {
      changed = allSquares().filter(sq => api.at(sq) === letter('p', colour));
      if (!changed.length) throw new Error('They have no pawns left.');
      for (const sq of changed) api.put(sq, letter(kind, colour));
    });
    return { fen, fx: 'army:' + changed.join(',') };
  });
  print(changed.length + ' pawns became ' + PIECE_NAMES[kind] + 's.', 'ok');
});

add('skip', '/skip', 'Skips whoever is to move.', async (args, c) => {
  c.playing();
  await game.consoleEdit(g => ({ fen: editFen(g.fen, api => api.setTurn(g.turn === 'w' ? 'b' : 'w')), fx: 'skip' }));
  print('Turn skipped.', 'ok');
});

add('undo', '/undo [moves]', 'Takes moves back.', async (args) => {
  await game.takeBack(args[0] ? clamp(parseInt(args[0], 10) || 1, 1, 200) : 0);
  print('Taken back.', 'ok');
});

add('reset', '/reset', 'Puts every piece back where it started.', async (args, c) => {
  c.playing();
  await game.consoleEdit(() => ({ fen: START_FEN, fx: 'reset' }));
  print('Board reset.', 'ok');
});

add('fen', '/fen [position]', 'Shows the position as text, or sets one.', async (args, c) => {
  const v = c.view();
  if (!args.length) { print(v.chess.fen(), 'ok'); return; }
  c.playing();
  let fen;
  try { fen = new Chess(args.join(' ')).fen(); } catch (e) { throw new Error('That is not a position I can read.'); }
  await game.consoleEdit(() => ({ fen, fx: 'set' }));
  print('Position set.', 'ok');
});

add('time', '/time <who> <+seconds | -seconds>', 'Adds or removes clock time.', async (args, c) => {
  const v = c.playing(), colour = c.who(args[0], v), secs = parseFloat(args[1]);
  if (!isFinite(secs) || !secs) throw new Error('How many seconds? Like +60 or -10.');
  await game.consoleClock(colour, secs * 1000);
  print((secs > 0 ? 'Added ' : 'Removed ') + Math.abs(secs) + 's for ' + (colour === 'w' ? 'White' : 'Black') + '.', 'ok');
});

add('win', '/win', 'Ends the game. You win.', async (args, c) => { const v = c.playing(); await game.consoleEnd((v.my || v.turn) === 'w' ? '1-0' : '0-1'); print('You win. Obviously.', 'ok'); });
add('lose', '/lose', 'Ends the game. They win.', async (args, c) => { const v = c.playing(); await game.consoleEnd((v.my || v.turn) === 'w' ? '0-1' : '1-0'); print('Very generous.', 'ok'); });
add('draw', '/draw', 'Ends the game as a draw.', async (args, c) => { c.playing(); await game.consoleEnd('1/2-1/2'); print('Draw.', 'ok'); });

add('elo', '/elo <player> <rating>', 'Sets a player\'s rating (100 to 3500).', async (args) => {
  if (!net.ready()) throw new Error('Not connected.');
  const name = ['me', 'my'].includes(String(args[0]).toLowerCase()) ? state.me : net.canon(args[0]), elo = parseInt(args[1], 10);
  if (!name || !state.players.has(name)) throw new Error('Nobody called "' + (args[0] || '') + '" has played chess here yet. Try /players');
  if (!isFinite(elo)) throw new Error('What rating? A number from 100 to 3500.');
  await net.setElo(name, clamp(elo, 100, 3500));
  print(shown(name) + ' is now rated ' + clamp(elo, 100, 3500) + '.', 'ok');
});

add('title', '/title <player> <words | clear>', 'Gives a player a tag beside their name.', async (args) => {
  if (!net.ready()) throw new Error('Not connected.');
  const name = ['me', 'my'].includes(String(args[0]).toLowerCase()) ? state.me : net.canon(args[0]);
  if (!name || !state.players.has(name)) throw new Error('Nobody called "' + (args[0] || '') + '" has played chess here yet. Try /players');
  const words = args.slice(1).join(' ').trim(), title = !words || words.toLowerCase() === 'clear' ? '' : clean(words).slice(0, 18);
  await net.setTitle(name, title);
  print(title ? shown(name) + ' now wears "' + title + '".' : 'Title cleared.', 'ok');
});

add('players', '/players', 'Everyone who has played, best first.', () => {
  const list = [...state.players.values()].sort((a, b) => b.elo - a.elo);
  if (!list.length) { print('Nobody yet.', 'dim'); return; }
  for (const p of list) print('  ' + String(p.elo).padStart(4) + '  ' + (isOwner(p.name) ? '👑 ' : '') + p.name + (net.isOnline(p) ? '  ●' : ''), 'dim');
});

add('say', '/say <words>', 'Puts a big banner on both screens.', (args) => {
  const text = clean(args.join(' ')).slice(0, 80);
  if (!text) throw new Error('Say what?');
  if (game.inGame()) game.emit('x', 'say:' + text); else fx.banner(text);
});
const show1 = (name, usage, help, value, local) => add(name, usage, help, (args) => {
  const v = typeof value === 'function' ? value(args) : value;
  if (game.inGame()) game.emit('x', v); else local(args);
});
show1('confetti', '/confetti', 'Confetti for everybody.', 'confetti', () => fx.confetti());
show1('fireworks', '/fireworks', 'Fireworks over the board.', 'fireworks', () => fx.fireworks());
show1('shake', '/shake', 'Rattles the board.', 'shake', () => fx.shake(document.body, true));
show1('rain', '/rain <emoji>', 'Makes it rain something.', args => 'rain:' + (args[0] || '🐸'), args => fx.rain(args[0] || '🐸'));

add('sound', '/sound <name | list>', 'Plays any soundboard sound.', (args) => {
  const list = sound.soundboard(), want = String(args[0] || 'list').toLowerCase();
  if (want === 'list') { print(list.length ? list.map(s => s.id).join('  ') : 'No sounds loaded.', 'dim'); return; }
  const item = list.find(s => s.id === want) || list.find(s => s.id.startsWith(want));
  if (!item) throw new Error('No sound called "' + want + '". Try /sound list');
  if (game.inGame()) game.emit('s', item.id); else sound.playBoard(item.id);
});

add('theme', '/theme <name>', 'Changes the board colours: ' + THEMES.map(t => t.id).join(', ') + '.', (args) => {
  const t = THEMES.find(x => x.id === String(args[0] || '').toLowerCase());
  if (!t) throw new Error('Themes: ' + THEMES.map(x => x.id).join(', '));
  settings.theme = t.id; saveSettings(); onTheme();
  print('Board is now ' + t.name + '.', 'ok');
});

add('alias', '/alias <name> <commands>', 'Makes your own command. $1 $2 are what you type after it.', (args) => {
  const name = String(args[0] || '').replace(/^\//, '').toLowerCase(), body = args.slice(1).join(' ').trim();
  if (!/^[a-z][a-z0-9_-]{0,19}$/.test(name)) throw new Error('Give it a short name made of letters, like boom.');
  if (commands.has(name)) throw new Error('/' + name + ' already exists.');
  if (!body.startsWith('/')) throw new Error('Then say what it does, e.g.  /alias boom /target queen; /say BOOM');
  const a = aliases(); a[name] = body; saveAliases(a);
  print('Made /' + name + '  →  ' + body, 'ok');
});
add('unalias', '/unalias <name>', 'Deletes one of your own commands.', (args) => {
  const name = String(args[0] || '').replace(/^\//, '').toLowerCase(), a = aliases();
  if (!a[name]) throw new Error('You have no command called /' + name + '.');
  delete a[name]; saveAliases(a);
  print('Deleted /' + name + '.', 'ok');
});

add('clear', '/clear', 'Wipes this window.', () => { out.innerHTML = ''; });
add('lock', '/lock', 'Locks the console again.', () => {
  state.admin = false;
  try { sessionStorage.removeItem('colton_chess_console'); } catch (e) { /* fine */ }
  out.innerHTML = '';
  gate();
});
