/* ============================================================
   The front door: signing in, the lobby, and every way of
   starting a game. The game itself is game.js.

   Who you are comes from the main site: its dock hands the
   signed-in username over in localStorage before sending you
   here. Arrive without one (say, from a link a friend texted you)
   and you can sign in or make an account on the spot - it is the
   same account the rest of the site uses.

   Links that do something when opened:
     ?join=<invite>      accept a challenge
     ?g=<game>           open a game, to play it or to watch
     ?challenge=<name>   start a challenge to that player
   ============================================================ */

import * as net from './net.js';
import * as game from './game.js';
import * as sound from './sound.js';
import * as fx from './fx.js';
import { initAdmin } from './admin.js';
import { LEVELS } from './ai.js';
import {
  $, h, state, session, settings, loadSettings, saveSettings, shown, isOwner, avatar, nameTag, OWNER_NAME,
  TIME_PRESETS, tcLabel, tcKind, tcIcon, toast, openModal, closeModal, showView, THEMES, store, clamp,
} from './shared.js';

let invitesIn = [], seeks = [], mine = [], live = [];
let unsubs = [], beat = null, waiting = null;
const announced = new Map(), swept = new Set(), handled = new Set();

const FRESH_DIRECT = 30 * 60000, FRESH_SEEK = 15 * 60000;
const me = () => state.players.get(state.me) || { name: state.me, elo: net.START_ELO, games: 0, w: 0, l: 0, d: 0 };
const pageUrl = query => location.origin + location.pathname + (query || '');

/* ================================================================= boot */

async function boot() {
  fx.initFx($('fx'));
  sound.initSound();
  loadSettings();
  game.initGame({ onLeave: showLobby, onPlayAgain: playAgain });
  initAdmin({ onTheme: game.applyTheme });
  wire();
  state.me = session.user;
  if (!state.me) return showAuth();
  enter();
}

async function enter() {
  loadSettings();
  game.applyTheme();
  showView('Lobby');
  renderLobby();
  try {
    await net.init();
    const rec = await net.ensurePlayer(state.me);
    state.players.set(state.me, rec);
    state.online = true;
  } catch (e) {
    state.online = false;
    toast('Could not reach the game server. You can still play the computer or pass-and-play.', { kind: 'bad', ms: 7000 });
  }
  renderLobby();
  if (state.online) startWatching();
  route();
}

function startWatching() {
  stopWatching();
  unsubs = [
    net.watchPlayers(list => { state.players = new Map(list.map(p => [p.name, p])); renderMe(); renderPlayers(); renderLadder(); renderOpen(); game.refresh(); }),
    net.watchInvitesTo(state.me, list => { invitesIn = list.filter(i => net.now() - i.at < FRESH_DIRECT); renderOpen(); announce(); }),
    net.watchSeeks(list => { seeks = list.filter(i => net.now() - i.at < FRESH_SEEK); renderOpen(); }),
    net.watchMine(state.me, list => { mine = list; renderOpen(); }),
    net.watchAccepted(state.me, onAccepted),
    net.watchActiveGames(list => { live = list; renderLive(); sweep(); }),
  ];
  const ping = () => net.heartbeat(state.me, game.inGame() ? 'game' : 'lobby');
  beat = setInterval(ping, 55000);
  ping();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', onHide);
}
function stopWatching() {
  for (const u of unsubs) { try { u(); } catch (e) { /* already gone */ } }
  unsubs = [];
  if (beat) { clearInterval(beat); beat = null; }
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('pagehide', onHide);
}
const onVisible = () => { if (!document.hidden) net.heartbeat(state.me, game.inGame() ? 'game' : 'lobby'); };
function onHide() {
  for (const i of mine) if (i.via === 'seek') net.cancelInvite(i.id);
  net.goodbye(state.me);
}

function route() {
  const q = new URLSearchParams(location.search);
  const g = q.get('g') || q.get('watch'), join = q.get('join'), challenge = q.get('challenge');
  if (!state.online) return;
  if (g) game.openOnline(g);
  else if (join) joinInvite(join);
  else if (challenge) { clearQuery(); openNewGame('challenge', { to: net.canon(challenge) }); }
}
const clearQuery = () => { try { history.replaceState(null, '', location.pathname); } catch (e) { /* file:// */ } };

function showLobby() {
  showView('Lobby');
  renderLobby();
}

/* ================================================================= auth */

function showAuth() {
  showView('Auth');
  const q = new URLSearchParams(location.search);
  $('authNote').textContent = q.get('join') ? 'You have been challenged! Sign in or make an account to play.' : 'Use your account from the site, or make a new one.';
  setTimeout(() => $('authUser').focus(), 50);
}

async function auth(create) {
  const status = $('authStatus'), u = $('authUser').value, p = $('authPass').value;
  status.textContent = create ? 'Creating…' : 'Signing in…';
  try {
    await net.init();
    const r = create ? await net.signUp(u, p) : await net.logIn(u, p);
    if (r.error) { status.textContent = r.error; sound.play('error'); return; }
    status.textContent = '';
    session.user = r.user;
    state.me = r.user;
    $('authPass').value = '';
    enter();
  } catch (e) { status.textContent = 'Could not reach the server. Check your connection and try again.'; }
}

function signOut() {
  stopWatching();
  net.goodbye(state.me);
  session.user = null;
  state.me = null;
  state.players = new Map();
  closeModal();
  showAuth();
}

/* ================================================================ lobby */

function renderLobby() { renderMe(); renderHero(); renderPlayers(); renderOpen(); renderLive(); renderLadder(); }

function rankOf(name) {
  const ranked = [...state.players.values()].filter(p => p.games > 0).sort((a, b) => b.elo - a.elo);
  const i = ranked.findIndex(p => p.name === name);
  return i < 0 ? null : i + 1;
}

function renderMe() {
  const box = $('meBox'), p = me();
  box.innerHTML = '';
  if (!state.me) { box.className = 'me'; box.append(h('div', { class: 'me-info' }, h('span', { class: 'nm' }, 'Guest'), h('div', { class: 'me-sub' }, 'Tap to sign in'))); $('welcome').textContent = 'Pick a way to play.'; return; }
  box.className = 'me' + (isOwner(state.me) ? ' owner' : '');
  const rank = rankOf(state.me);
  box.append(avatar(state.me),
    h('div', { class: 'me-info' }, nameTag(state.me, { title: p.title }),
      h('div', { class: 'me-sub' }, h('b', null, p.elo), ' rating', rank ? ' · #' + rank : '', state.online ? '' : ' · offline')));
  $('welcome').textContent = isOwner(state.me) ? 'Welcome back, creator. The board is yours. 👑' : 'Pick a way to play.';
}

function renderHero() {
  const saved = game.savedLocal(), box = $('resumeBox');
  box.innerHTML = '';
  if (saved) {
    const what = saved.mode === 'ai' ? 'your game against ' + LEVELS[(saved.level || 1) - 1].name : 'your pass-and-play game';
    box.appendChild(h('button', { class: 'resume', onclick: () => game.resumeLocal() }, h('span', null, '▶'), ' Carry on with ' + what));
  }
  for (const id of ['playQuick', 'playFriend', 'playLink']) $(id).classList.toggle('off', !state.online);
}

function row(...kids) { return h('div', { class: 'row' }, ...kids); }
const empty = text => h('div', { class: 'empty' }, text);

function renderPlayers() {
  const box = $('playersList');
  if (!box) return;
  box.innerHTML = '';
  const list = [...state.players.values()].filter(p => p.name !== state.me).sort((a, b) => (net.isOnline(b) - net.isOnline(a)) || b.elo - a.elo);
  $('onlineCount').textContent = list.filter(net.isOnline).length + ' online';
  if (!list.length) { box.appendChild(empty(state.online ? 'Nobody else has shown up yet. Send a friend a link!' : 'Offline.')); return; }
  for (const p of list) {
    const on = net.isOnline(p);
    box.appendChild(h('div', { class: 'row player' + (on ? '' : ' away') + (isOwner(p.name) ? ' owner' : '') },
      h('button', { class: 'row-main', onclick: () => openProfile(p.name) }, avatar(p.name, { small: true }), nameTag(p.name, { title: p.title }), h('span', { class: 'elo' }, p.elo),
        h('span', { class: 'dot' + (on ? ' on' : '') }), on && p.where === 'game' ? h('span', { class: 'where' }, 'in a game') : null),
      h('button', { class: 'btn small', onclick: () => openNewGame('challenge', { to: p.name }) }, 'Challenge')));
  }
}

const inviteLine = i => tcIcon(i.tc) + ' ' + tcLabel(i.tc) + ' · ' + (i.rated ? 'Rated' : 'Casual');

function renderOpen() {
  const box = $('openList');
  if (!box) return;
  box.innerHTML = '';
  let n = 0;
  for (const i of invitesIn) {
    n++;
    box.appendChild(h('div', { class: 'row invite hot' },
      h('div', { class: 'row-main' }, avatar(i.from, { small: true }), h('div', null, nameTag(i.from), h('div', { class: 'sub' }, 'challenges you · ' + inviteLine(i)))),
      h('button', { class: 'btn small primary', onclick: () => accept(i.id) }, 'Accept'),
      h('button', { class: 'btn small', onclick: () => net.declineInvite(i.id) }, 'No')));
  }
  for (const i of mine) {
    n++;
    const what = i.via === 'seek' ? 'Looking for anyone…' : i.to ? 'Waiting for ' + shown(i.to) + '…' : 'Waiting for someone to open your link…';
    box.appendChild(h('div', { class: 'row invite mine' },
      h('div', { class: 'row-main' }, h('span', { class: 'spinner' }), h('div', null, h('div', null, what), h('div', { class: 'sub' }, inviteLine(i)))),
      !i.to && i.via !== 'seek' ? h('button', { class: 'btn small', onclick: () => openShare(i) }, 'Share') : null,
      h('button', { class: 'btn small', onclick: () => net.cancelInvite(i.id) }, 'Cancel')));
  }
  for (const i of seeks) {
    if (i.from === state.me || !net.isOnline(state.players.get(i.from))) continue;
    n++;
    box.appendChild(h('div', { class: 'row invite' },
      h('div', { class: 'row-main' }, avatar(i.from, { small: true }), h('div', null, h('span', null, nameTag(i.from), h('span', { class: 'elo' }, i.fromElo)), h('div', { class: 'sub' }, 'wants a game · ' + inviteLine(i)))),
      h('button', { class: 'btn small primary', onclick: () => accept(i.id) }, 'Play')));
  }
  if (!n) box.appendChild(empty('No open challenges. Start one with Quick match.'));
}

function renderLive() {
  const box = $('liveList');
  if (!box) return;
  box.innerHTML = '';
  const sorted = live.slice().sort((a, b) => ((b.players || []).includes(state.me) - (a.players || []).includes(state.me)) || b.ts - a.ts);
  for (const g of sorted) {
    const isMine = (g.players || []).includes(state.me);
    const mover = g.turn === 'w' ? g.white : g.black;
    box.appendChild(h('div', { class: 'row gamerow' + (isMine ? ' hot' : '') },
      h('div', { class: 'row-main' }, h('div', null,
        h('div', { class: 'versus' }, nameTag(g.white), h('span', { class: 'vs' }, 'vs'), nameTag(g.black)),
        h('div', { class: 'sub' }, tcIcon(g.tc) + ' ' + tcLabel(g.tc) + ' · ' + (g.rated && !g.chaos ? 'Rated' : 'Casual') + ' · move ' + (Math.floor(net.countMoves(g.log || []) / 2) + 1) + (isMine && mover === state.me ? ' · your move!' : '')))),
      h('button', { class: 'btn small' + (isMine ? ' primary' : ''), onclick: () => game.openOnline(g.id) }, isMine ? 'Resume' : 'Watch')));
  }
  if (!sorted.length) box.appendChild(empty('No games being played right now.'));
}

function renderLadder() {
  const box = $('ladderList');
  if (!box) return;
  box.innerHTML = '';
  const ranked = [...state.players.values()].filter(p => p.games > 0 || isOwner(p.name)).sort((a, b) => b.elo - a.elo);
  if (!ranked.length) { box.appendChild(empty('Play a rated game to get on the ladder.')); return; }
  ranked.forEach((p, i) => {
    box.appendChild(h('button', { class: 'row ladder' + (isOwner(p.name) ? ' owner' : '') + (p.name === state.me ? ' self' : ''), onclick: () => openProfile(p.name) },
      h('span', { class: 'rank' }, i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)),
      avatar(p.name, { small: true }), nameTag(p.name, { title: p.title }),
      h('span', { class: 'wld' }, (p.w || 0) + 'W ' + (p.l || 0) + 'L ' + (p.d || 0) + 'D'),
      h('span', { class: 'elo big' }, p.elo)));
  });
}

function openProfile(name) {
  const p = state.players.get(name);
  if (!p) return;
  const games = p.games || 0, pct = games ? Math.round(100 * (p.w || 0) / games) : 0, rank = rankOf(name);
  const body = h('div', { class: 'profile' + (isOwner(name) ? ' owner' : '') },
    h('div', { class: 'profile-top' }, avatar(name), h('div', null, nameTag(name, { title: p.title }),
      h('div', { class: 'sub' }, isOwner(name) ? 'Made this game' : '@' + name, net.isOnline(p) ? ' · online now' : ''))),
    h('div', { class: 'stats' },
      h('div', null, h('b', null, p.elo), h('span', null, 'Rating')),
      h('div', null, h('b', null, p.peak || p.elo), h('span', null, 'Best')),
      h('div', null, h('b', null, rank ? '#' + rank : '–'), h('span', null, 'Rank')),
      h('div', null, h('b', null, games), h('span', null, 'Games')),
      h('div', null, h('b', null, (p.w || 0) + ' / ' + (p.l || 0) + ' / ' + (p.d || 0)), h('span', null, 'Won / lost / drawn')),
      h('div', null, h('b', null, games ? pct + '%' : '–'), h('span', null, 'Win rate'))),
    name !== state.me ? h('button', { class: 'btn primary wide', onclick: () => openNewGame('challenge', { to: name }) }, '⚔️ Challenge ' + shown(name)) : null);
  openModal(body, { title: 'Player' });
}

/* ========================================================= starting games */

const KINDS = {
  seek: { title: '⚡ Quick match', go: 'Find an opponent', online: true },
  challenge: { title: '🤝 Challenge a friend', go: 'Send challenge', online: true },
  link: { title: '🔗 Invite with a link', go: 'Make the link', online: true },
  ai: { title: '🤖 Play the computer', go: 'Play' },
  local: { title: '👥 Pass & play', go: 'Start' },
};

function openNewGame(kind, preset = {}) {
  const K = KINDS[kind];
  if (K.online && !state.online) { toast('You are offline. Try the computer or pass-and-play.', { kind: 'bad' }); return; }
  const pick = {
    tc: store.get('lastTc', { base: 300, inc: 0 }), rated: store.get('lastRated', true), color: 'r',
    level: store.get('lastLevel', 3), to: preset.to || '', msg: true,
  };
  if (kind === 'ai' || kind === 'local') pick.tc = store.get('lastLocalTc', { base: 0, inc: 0 });
  const body = h('div', { class: 'newgame' });
  const draw = () => {
    body.innerHTML = '';
    if (kind === 'challenge') {
      const input = h('input', { class: 'field', id: 'ngTo', placeholder: 'Their username', value: pick.to, list: 'ngNames', autocomplete: 'off', autocapitalize: 'off', oninput: e => { pick.to = e.target.value; } });
      const names = h('datalist', { id: 'ngNames' });
      for (const p of state.players.values()) if (p.name !== state.me) names.appendChild(h('option', { value: p.name }));
      body.append(h('label', { class: 'lbl' }, 'Who?'), input, names);
    }
    if (kind === 'ai') {
      body.appendChild(h('label', { class: 'lbl' }, 'Opponent'));
      const grid = h('div', { class: 'levels' });
      LEVELS.forEach((L, i) => grid.appendChild(h('button', { class: 'level' + (pick.level === i + 1 ? ' on' : ''), onclick: () => { pick.level = i + 1; draw(); } },
        h('span', { class: 'level-e' }, L.emoji), h('span', { class: 'level-n' }, L.name), h('span', { class: 'level-r' }, L.elo))));
      body.append(grid, h('div', { class: 'quote' }, '“' + LEVELS[pick.level - 1].quip + '”'));
    }
    body.appendChild(h('label', { class: 'lbl' }, 'Game time'));
    const times = h('div', { class: 'times' });
    for (const t of TIME_PRESETS) {
      const on = t.base === pick.tc.base && t.inc === pick.tc.inc;
      times.appendChild(h('button', { class: 'time' + (on ? ' on' : ''), onclick: () => { pick.tc = { base: t.base, inc: t.inc }; draw(); } },
        h('b', null, tcLabel(t)), h('span', null, tcKind(t))));
    }
    body.appendChild(times);
    const mins = h('input', { type: 'number', class: 'field num', min: '0.5', max: '180', step: '0.5', value: pick.tc.base ? pick.tc.base / 60 : 5, 'aria-label': 'Minutes each' });
    const inc = h('input', { type: 'number', class: 'field num', min: '0', max: '60', step: '1', value: pick.tc.inc || 0, 'aria-label': 'Seconds added per move' });
    const custom = () => { pick.tc = { base: Math.round(clamp(parseFloat(mins.value) || 5, 0.5, 180) * 60), inc: Math.round(clamp(parseFloat(inc.value) || 0, 0, 60)) }; draw(); };
    body.appendChild(h('div', { class: 'custom' }, h('span', null, 'Or your own:'), mins, h('span', null, 'min +'), inc, h('span', null, 'sec a move'), h('button', { class: 'btn small', onclick: custom }, 'Set')));
    body.appendChild(h('div', { class: 'picked' }, pick.tc.base ? 'Each player gets ' + (pick.tc.base / 60) + ' min' + (pick.tc.inc ? ', plus ' + pick.tc.inc + ' s after every move.' : '.') : 'No clock. Take all the time you like.'));

    if (kind !== 'local') {
      body.appendChild(h('label', { class: 'lbl' }, 'You play'));
      const seg = h('div', { class: 'seg' });
      for (const [v, text] of [['r', '🎲 Random'], ['w', '⬜ White'], ['b', '⬛ Black']]) seg.appendChild(h('button', { class: pick.color === v ? 'on' : '', onclick: () => { pick.color = v; draw(); } }, text));
      body.appendChild(seg);
    }
    if (K.online) {
      const canRate = pick.tc.base > 0;
      if (!canRate) pick.rated = false;
      const seg = h('div', { class: 'seg' });
      seg.appendChild(h('button', { class: pick.rated ? 'on' : '', disabled: !canRate, onclick: () => { pick.rated = true; draw(); } }, '🏆 Rated'));
      seg.appendChild(h('button', { class: !pick.rated ? 'on' : '', onclick: () => { pick.rated = false; draw(); } }, '🎈 Casual'));
      body.append(h('label', { class: 'lbl' }, 'Counts for rating?'), seg, canRate ? null : h('div', { class: 'picked' }, 'Games without a clock are always casual.'));
    }
    if (kind === 'challenge') {
      body.appendChild(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: pick.msg, onchange: e => { pick.msg = e.target.checked; } }), ' Also drop the invite in our Messages chat 💬'));
    }
    body.appendChild(h('button', { class: 'btn primary wide go', onclick: () => start(kind, pick) }, K.go));
  };
  draw();
  openModal(body, { title: K.title });
  if (kind === 'challenge' && !pick.to) setTimeout(() => { const el = $('ngTo'); if (el) el.focus(); }, 60);
}

async function start(kind, pick) {
  const tc = pick.tc;
  if (kind === 'ai' || kind === 'local') {
    store.set('lastLocalTc', tc); store.set('lastLevel', pick.level);
    closeModal();
    return game.startLocal({ mode: kind, level: pick.level, color: pick.color, tc });
  }
  store.set('lastTc', tc); store.set('lastRated', pick.rated);
  const base = { from: state.me, tc, rated: pick.rated && tc.base > 0, color: pick.color, fromElo: me().elo };
  try {
    if (kind === 'seek') {
      /* somebody already waiting for exactly this? then just sit down with them */
      const match = seeks.filter(s => s.from !== state.me && s.rated === base.rated && s.tc.base === tc.base && s.tc.inc === tc.inc && net.isOnline(state.players.get(s.from))).sort((a, b) => a.at - b.at)[0];
      if (match) { try { const r = await net.acceptInvite(match.id, state.me); closeModal(); return game.openOnline(r.game); } catch (e) { /* taken: make our own */ } }
      for (const i of mine) if (i.via === 'seek') net.cancelInvite(i.id);
      const id = await net.createInvite(Object.assign({ via: 'seek' }, base));
      return waitFor({ id, via: 'seek', tc, rated: base.rated });
    }
    if (kind === 'challenge') {
      const to = net.canon(pick.to);
      if (!to) return toast('Type the username of who you want to play.');
      if (to === state.me) return toast('You cannot challenge yourself. Try pass-and-play!');
      if (!(await net.accountExists(to))) return toast('There is no account called "' + to + '".', { kind: 'bad' });
      const id = await net.createInvite(Object.assign({ to, via: 'direct' }, base));
      if (pick.msg) net.sendChessMessage({ from: state.me, to, invite: id, tc, rated: base.rated, label: tcLabel(tc) + (base.rated ? ' rated' : ' casual') });
      return waitFor({ id, via: 'direct', to, tc, rated: base.rated });
    }
    const id = await net.createInvite(Object.assign({ via: 'link' }, base));
    openShare({ id, tc, rated: base.rated });
  } catch (e) { toast('That did not work: ' + e.message, { kind: 'bad' }); }
}

function playAgain(d) {
  /* same again, colours swapped */
  game.startLocal({ mode: d.mode, level: d.level, color: d.mode === 'ai' ? (d.my === 'w' ? 'b' : 'w') : 'w', tc: d.tc });
}

/* A box that sits there until the other person answers. Closing it does
   not cancel the challenge - it carries on in the lobby list. */
function waitFor(inv) {
  if (waiting) { waiting(); waiting = null; }
  const what = inv.via === 'seek' ? 'Looking for an opponent…' : 'Waiting for ' + shown(inv.to) + ' to accept…';
  const body = h('div', { class: 'waiting' }, h('div', { class: 'spinner big' }), h('h3', null, what), h('p', { class: 'sub' }, inviteLine(inv)),
    inv.via === 'seek' ? h('p', { class: 'sub' }, 'Anyone in the lobby can take the game. Leave this open, or close it and keep browsing.') : h('p', { class: 'sub' }, 'They get a pop-up if they are on the site, and the invite is in the lobby list.'),
    h('div', { class: 'row-btns' }, h('button', { class: 'btn', onclick: () => { net.cancelInvite(inv.id); closeModal(); } }, 'Cancel challenge'), h('button', { class: 'btn primary', onclick: () => closeModal() }, 'Keep waiting in the lobby')));
  openModal(body, { title: inv.via === 'seek' ? '⚡ Quick match' : '🤝 Challenge sent' });
  waiting = net.watchInvite(inv.id, i => {
    if (!i) { stopWaiting(); return; }
    if (i.status === 'declined') { stopWaiting(); closeModal(); toast(shown(i.to || 'They') + ' said no thanks.'); net.cancelInvite(i.id); }
  });
}
function stopWaiting() { if (waiting) { waiting(); waiting = null; } }

/* somebody said yes to a challenge of mine */
function onAccepted(list) {
  for (const i of list) {
    if (handled.has(i.id) || !i.game) continue;
    handled.add(i.id);
    net.settleInvite(i.id);
    if (net.now() - (i.acceptedAt || 0) > 20 * 60000) continue;         // old news
    stopWaiting();
    if (!game.inGame()) { closeModal(); sound.play('notify'); toast(shown(i.by) + ' accepted. Game on!'); game.openOnline(i.game); }
    else toast(shown(i.by) + ' accepted your challenge.', { ms: 15000, actions: [{ label: 'Go to it', kind: 'primary', run: () => game.openOnline(i.game) }] });
  }
}

async function accept(id) {
  try {
    const r = await net.acceptInvite(id, state.me);
    dismiss(id);
    closeModal();
    game.openOnline(r.game);
  } catch (e) { toast(e.message, { kind: 'bad' }); }
}

/* pop-ups for challenges sent to me */
function announce() {
  const ids = new Set(invitesIn.map(i => i.id));
  for (const [id, close] of announced) if (!ids.has(id)) { if (close) close(); announced.delete(id); }
  for (const i of invitesIn) {
    if (announced.has(i.id)) continue;
    sound.play('notify');
    announced.set(i.id, toast('♟️ ' + shown(i.from) + (isOwner(i.from) ? ' 👑' : '') + ' challenges you · ' + inviteLine(i), {
      sticky: true, kind: 'invite',
      actions: [{ label: 'Accept', kind: 'primary', run: () => accept(i.id) }, { label: 'Decline', run: () => { net.declineInvite(i.id); } }],
    }));
  }
}
function dismiss(id) { const close = announced.get(id); if (close) close(); announced.set(id, null); }

/* arriving from a link or from a Messages card */
async function joinInvite(id) {
  clearQuery();
  let inv;
  try { inv = await net.getInvite(id); } catch (e) { inv = null; }
  if (!inv) return toast('That challenge has been withdrawn.', { kind: 'bad' });
  if (inv.game) return game.openOnline(inv.game);
  if (inv.status !== 'open') return toast('That challenge is not open any more.', { kind: 'bad' });
  if (inv.from === state.me) return inv.to ? waitFor(inv) : openShare(inv);
  if (inv.to && inv.to !== state.me) return toast('That challenge was sent to ' + shown(inv.to) + ', not you.', { kind: 'bad' });
  const body = h('div', { class: 'waiting' }, avatar(inv.from), h('h3', null, nameTag(inv.from), ' wants to play you'), h('p', { class: 'sub' }, inviteLine(inv)),
    h('div', { class: 'row-btns' }, h('button', { class: 'btn', onclick: () => { closeModal(); if (inv.to) net.declineInvite(id); } }, 'Not now'), h('button', { class: 'btn primary', onclick: () => accept(id) }, '♟️ Play')));
  openModal(body, { title: 'Challenge!' });
}

/* -------------------------------------------- sharing a link outside the site */

function openShare(inv) {
  const url = pageUrl('?join=' + encodeURIComponent(inv.id));
  const text = shown(state.me) + ' challenged you to a game of chess (' + tcLabel(inv.tc) + (inv.rated ? ', rated' : '') + ')! Tap to play:';
  const full = text + ' ' + url, enc = encodeURIComponent;
  const field = h('input', { class: 'field link', readonly: true, value: url, onclick: e => e.target.select() });
  const copy = () => {
    const ok = () => toast('Link copied.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => { field.select(); document.execCommand('copy'); ok(); });
    else { field.select(); document.execCommand('copy'); ok(); }
  };
  const body = h('div', { class: 'share' },
    h('p', { class: 'sub' }, 'Whoever opens this link first gets the game. They can sign in or make an account in a few seconds.'),
    field,
    h('div', { class: 'share-grid' },
      h('button', { class: 'share-btn', onclick: copy }, h('span', null, '📋'), 'Copy link'),
      h('a', { class: 'share-btn', href: 'sms:?&body=' + enc(full) }, h('span', null, '💬'), 'Text message'),
      h('a', { class: 'share-btn', href: 'https://mail.google.com/mail/?view=cm&fs=1&su=' + enc('Chess challenge!') + '&body=' + enc(full), target: '_blank', rel: 'noopener' }, h('span', null, '📧'), 'Gmail'),
      h('a', { class: 'share-btn', href: 'mailto:?subject=' + enc('Chess challenge!') + '&body=' + enc(full) }, h('span', null, '✉️'), 'Email app'),
      navigator.share ? h('button', { class: 'share-btn', onclick: () => navigator.share({ title: 'Chess challenge!', text, url }).catch(() => {}) }, h('span', null, '📤'), 'More…') : null,
      h('button', { class: 'share-btn', onclick: () => { closeModal(); openNewGame('challenge'); } }, h('span', null, '🤝'), 'Someone on the site')),
    h('p', { class: 'sub' }, 'You will be taken to the board the moment they accept. The invite also waits in your lobby list.'),
    h('div', { class: 'row-btns' }, h('button', { class: 'btn', onclick: () => { net.cancelInvite(inv.id); closeModal(); } }, 'Cancel invite'), h('button', { class: 'btn primary', onclick: () => closeModal() }, 'Done')));
  openModal(body, { title: '🔗 Your invite link' });
}

/* -------------------------------------------------------------- upkeep */

/* Games nobody is looking after any more: a flag that fell while both
   players were away, or a game that never got going. Whoever notices
   tidies it up; the database makes sure that only happens once. */
function sweep() {
  const t = net.now();
  for (const g of live) {
    if (swept.has(g.id)) continue;
    const moves = net.countMoves(g.log || []);
    let stale;
    if (moves < 2) stale = t - g.createdAt > 20 * 60000;
    else if (g.tc && g.tc.base > 0) stale = (g.turn === 'w' ? g.wMs : g.bMs) - (t - g.ts) < -8000;
    else stale = t - g.ts > 14 * 86400000;
    if (stale) { swept.add(g.id); game.settleStale(g.id).catch(() => {}); }
  }
}

/* ============================================================== settings */

function openSettings() {
  const body = h('div', { class: 'settings' });
  const draw = () => {
    body.innerHTML = '';
    body.appendChild(h('label', { class: 'lbl' }, 'Board'));
    const themes = h('div', { class: 'themes' });
    for (const t of THEMES) {
      themes.appendChild(h('button', { class: 'theme' + (settings.theme === t.id ? ' on' : ''), title: t.name, onclick: () => { settings.theme = t.id; saveSettings(); game.applyTheme(); draw(); } },
        h('span', { class: 'swatch', style: { background: `conic-gradient(${t.light} 0 25%, ${t.dark} 0 50%, ${t.light} 0 75%, ${t.dark} 0)` } }), t.name));
    }
    body.appendChild(themes);
    const flag = (key, text) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: settings[key], onchange: e => { settings[key] = e.target.checked; saveSettings(); game.applyTheme(); } }), ' ' + text);
    body.append(h('label', { class: 'lbl' }, 'Sound'),
      flag('sound', 'Sound effects'),
      flag('board', 'Let other players\' soundboard play on my device'),
      h('div', { class: 'vol' }, h('span', null, '🔈'), h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: settings.volume, 'aria-label': 'Volume', oninput: e => { sound.setVolume(+e.target.value); saveSettings(); }, onchange: () => sound.play('move') }), h('span', null, '🔊')),
      h('label', { class: 'lbl' }, 'Moves'),
      flag('dots', 'Show where a piece can go'),
      flag('autoQueen', 'Always promote to a queen without asking'),
      h('label', { class: 'lbl' }, 'Account'),
      h('div', { class: 'acct' }, h('span', null, 'Signed in as ', h('b', null, state.me)), h('button', { class: 'btn small', onclick: signOut }, 'Switch account')),
      h('p', { class: 'credits' }, 'Chess, made by 👑 ' + OWNER_NAME + '. ', h('a', { href: 'CREDITS.txt', target: '_blank', rel: 'noopener' }, 'Pieces and sounds: credits')));
  };
  draw();
  openModal(body, { title: '⚙️ Settings' });
}

/* ================================================================ wiring */

function wire() {
  $('authLogin').addEventListener('click', () => auth(false));
  $('authCreate').addEventListener('click', () => auth(true));
  $('authPass').addEventListener('keydown', e => { if (e.key === 'Enter') auth(false); });
  $('authGuest').addEventListener('click', () => { state.me = null; showView('Lobby'); state.online = false; renderLobby(); toast('Playing without an account: computer and pass-and-play only.'); });
  $('playQuick').addEventListener('click', () => openNewGame('seek'));
  $('playFriend').addEventListener('click', () => openNewGame('challenge'));
  $('playLink').addEventListener('click', () => openNewGame('link'));
  $('playAi').addEventListener('click', () => openNewGame('ai'));
  $('playLocal').addEventListener('click', () => openNewGame('local'));
  $('lobbySettings').addEventListener('click', openSettings);
  $('gSettings').addEventListener('click', openSettings);
  $('meBox').addEventListener('click', () => { if (state.me && state.players.has(state.me)) openProfile(state.me); else if (!state.me) showAuth(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

boot();
