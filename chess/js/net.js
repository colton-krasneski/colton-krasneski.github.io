/* ============================================================
   Everything that goes over the internet.

   The site already keeps its accounts and messages in Firebase
   (Firestore), so chess does too. Four things live there:

     users/{name}          the site's own accounts - chess signs in
                           against these and can add new ones
   and, all under duels/chess/ (see ROOT below for why there):
     players/{name}        one per person: rating, wins, losses, and
                           "seen", refreshed about once a minute,
                           which is how the lobby knows who is around
     invites/{id}          a challenge waiting for an answer: to one
                           person, to whoever opens a link, or to
                           anyone in the lobby
     games/{id}            a game. The whole game is its "log", a list
                           of moves; both players and anyone watching
                           listen to the same document.
       /fx/{id}            the noise around a game: reactions, chat,
                           soundboard, confetti

   Every change to a game goes through commitGame(), which is a
   transaction: read the game as it is right now, decide, write. Two
   people pressing buttons at the same instant cannot both win, and
   the rating change is written in the same breath as the result, so
   it can never be applied twice.

   Clocks need the two players to agree what time it is, and their
   computers do not. syncClock() measures how far this computer is
   from Firebase's and now() corrects for it.
   ============================================================ */

import { Chess, START_FEN } from './engine.js';

const CFG = {
  apiKey: 'AIzaSyCPkwQaND-E_uewYq5NLKpLBP9oUzyVAFs',
  authDomain: 'colton-site.firebaseapp.com',
  projectId: 'colton-site',
  storageBucket: 'colton-site.firebasestorage.app',
  messagingSenderId: '565997166421',
  appId: '1:565997166421:web:63a24af02db08878fed9dc',
};
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export const START_ELO = 1200;
const ONLINE_MS = 130000;            // "seen" newer than this = online

let F = null, db = null, offset = 0;
export const ready = () => !!db;
export const now = () => Date.now() + offset;

export async function init() {
  if (db) return true;
  const [app, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')]);
  F = fs;
  db = fs.getFirestore(app.initializeApp(CFG, 'chess'));
  return true;
}

/* Where chess keeps its things: under duels/chess/. The site's database
   rules already leave everything beneath a duel open - that is where air
   hockey trades its connection details - so chess fits in without anyone
   having to change or redeploy the rules. Group chats do the same inside
   `messages`. The document duels/chess itself is never created, so air
   hockey's own list of duels never sees any of this. */
const ROOT = ['duels', 'chess'];
const players = () => F.collection(db, ...ROOT, 'players');
const invites = () => F.collection(db, ...ROOT, 'invites');
const games = () => F.collection(db, ...ROOT, 'games');
const pRef = name => F.doc(players(), name);
const iRef = id => F.doc(invites(), id);
const gRef = id => F.doc(games(), id);

/* -------------------------------------------------------------- accounts */

export const canon = s => String(s || '').trim().toLowerCase();
export const validName = n => /^[a-z0-9][a-z0-9 _.\-]{1,19}$/.test(n) && !n.startsWith('bot:');

export async function logIn(name, password) {
  const u = canon(name);
  if (!u || !password) return { error: 'Enter a username and password.' };
  if (u.includes('/')) return { error: 'No account with that name.' };
  const snap = await F.getDoc(F.doc(db, 'users', u));
  if (!snap.exists()) return { error: 'No account with that name. Make one below!' };
  if (snap.data().password !== password) return { error: 'Wrong password.' };
  return { user: u };
}

export async function signUp(name, password) {
  const u = canon(name);
  if (!validName(u)) return { error: 'Usernames are 2-20 letters, numbers, spaces, dots, dashes or underscores.' };
  if (!password || password.length < 3) return { error: 'Pick a password of at least 3 characters.' };
  const ref = F.doc(db, 'users', u);
  if ((await F.getDoc(ref)).exists()) return { error: 'That username is taken. Pick another.' };
  await F.setDoc(ref, { username: u, password, createdAt: F.serverTimestamp() });
  return { user: u };
}

export async function accountExists(name) {
  const u = canon(name);
  if (!u || u.includes('/')) return false;
  return (await F.getDoc(F.doc(db, 'users', u))).exists();
}

/* --------------------------------------------------------------- players */

export async function ensurePlayer(name) {
  const ref = pRef(name), snap = await F.getDoc(ref);
  if (!snap.exists()) {
    await F.setDoc(ref, { name, elo: START_ELO, peak: START_ELO, games: 0, w: 0, l: 0, d: 0, seen: Date.now(), joined: Date.now() });
  }
  await syncClock(name);
  return (await F.getDoc(ref)).data();
}

/* How far is this computer's clock from the server's? Stamp a document
   with the server's time, read it back, and compare with the middle of
   the round trip. Good to a few hundredths of a second. */
async function syncClock(name) {
  try {
    const ref = pRef(name), t0 = Date.now();
    await F.setDoc(ref, { ping: F.serverTimestamp() }, { merge: true });
    const t1 = Date.now();
    const ping = (await F.getDocFromServer(ref)).data().ping;
    if (ping && ping.toMillis) offset = ping.toMillis() - (t0 + t1) / 2;
  } catch (e) { offset = 0; }
}

export function heartbeat(name, where = 'lobby') {
  if (!db || !name) return;
  F.setDoc(pRef(name), { seen: now(), where }, { merge: true }).catch(() => {});
}
export function goodbye(name) {
  if (!db || !name) return;
  F.setDoc(pRef(name), { seen: 0 }, { merge: true }).catch(() => {});
}
export const isOnline = p => !!p && now() - (p.seen || 0) < ONLINE_MS;

export function watchPlayers(cb) {
  return F.onSnapshot(players(), snap => cb(snap.docs.map(d => d.data()).filter(p => p && p.name)), () => {});
}

/* console powers */
export const setElo = (name, elo) => F.setDoc(pRef(name), { name, elo, peak: elo }, { merge: true });
export const setTitle = (name, title) => F.setDoc(pRef(name), { name, title: title || null }, { merge: true });

/* ---------------------------------------------------------------- rating */

export function eloChange(mine, theirs, score, gamesPlayed) {
  const k = gamesPlayed < 20 ? 40 : 24;                 // new players move fast, then settle
  const expected = 1 / (1 + 10 ** ((theirs - mine) / 400));
  return Math.round(k * (score - expected));
}

/* --------------------------------------------------------------- invites */

/* to: a username, or null for "whoever" (via 'seek' = shown in the lobby,
   via 'link' or 'msg' = only people who were given the link) */
export async function createInvite({ from, to = null, tc, rated = true, color = 'r', via = 'direct', fromElo = START_ELO }) {
  const ref = F.doc(invites());
  await F.setDoc(ref, { from, to, tc, rated: !!rated, color, via, fromElo, status: 'open', game: null, at: now() });
  return ref.id;
}
export const getInvite = async id => { const s = await F.getDoc(iRef(id)); return s.exists() ? Object.assign({ id: s.id }, s.data()) : null; };
export const watchInvite = (id, cb) => F.onSnapshot(iRef(id), s => cb(s.exists() ? Object.assign({ id: s.id }, s.data()) : null), () => {});
export const cancelInvite = id => F.deleteDoc(iRef(id)).catch(() => {});
export const declineInvite = id => F.updateDoc(iRef(id), { status: 'declined' }).catch(() => {});
/* the challenger has reached the game: nobody needs telling any more */
export const settleInvite = id => F.updateDoc(iRef(id), { status: 'started' }).catch(() => {});

const list = snap => snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
export const watchInvitesTo = (me, cb) => F.onSnapshot(F.query(invites(), F.where('to', '==', me), F.where('status', '==', 'open')), s => cb(list(s)), () => {});
export const watchSeeks = cb => F.onSnapshot(F.query(invites(), F.where('via', '==', 'seek'), F.where('status', '==', 'open')), s => cb(list(s)), () => {});
export const watchMine = (me, cb) => F.onSnapshot(F.query(invites(), F.where('from', '==', me), F.where('status', '==', 'open')), s => cb(list(s)), () => {});
export const watchAccepted = (me, cb) => F.onSnapshot(F.query(invites(), F.where('from', '==', me), F.where('status', '==', 'accepted')), s => cb(list(s)), () => {});

function freshGame({ white, black, wElo, bElo, tc, rated }) {
  const ms = (tc.base || 0) * 1000, t = now();
  return {
    v: 1, white, black, players: [white, black], wElo, bElo, tc: { base: tc.base || 0, inc: tc.inc || 0 }, rated: !!rated,
    status: 'active', result: null, reason: null,
    start: START_FEN, fen: START_FEN, log: [], turn: 'w',
    wMs: ms, bMs: ms, ts: t, draw: null, chaos: false, delta: null,
    createdAt: t, endedAt: null, rematch: null, rematchBy: null,
  };
}

/* Say yes. Creates the game in the same transaction that closes the
   invite, so two people accepting one open challenge cannot both get in. */
export async function acceptInvite(id, me) {
  const iref = iRef(id), gref = F.doc(games());
  return F.runTransaction(db, async tx => {
    const is = await tx.get(iref);
    if (!is.exists()) throw new Error('That challenge has been withdrawn.');
    const inv = is.data();
    if (inv.status !== 'open') {
      if (inv.game) return { game: inv.game, already: true };
      throw new Error('That challenge is not open any more.');
    }
    if (inv.from === me) throw new Error('That is your own challenge. Send the link to a friend!');
    if (inv.to && inv.to !== me) throw new Error('That challenge is for ' + inv.to + '.');
    const [a, b] = await Promise.all([tx.get(pRef(inv.from)), tx.get(pRef(me))]);
    const eloA = a.exists() ? a.data().elo : START_ELO, eloB = b.exists() ? b.data().elo : START_ELO;
    const fromWhite = inv.color === 'w' ? true : inv.color === 'b' ? false : Math.random() < 0.5;
    tx.set(gref, freshGame({
      white: fromWhite ? inv.from : me, black: fromWhite ? me : inv.from,
      wElo: fromWhite ? eloA : eloB, bElo: fromWhite ? eloB : eloA, tc: inv.tc, rated: inv.rated,
    }));
    tx.update(iref, { status: 'accepted', game: gref.id, by: me, acceptedAt: now() });
    return { game: gref.id };
  });
}

/* ------------------------------------------------------------------ games */

export const watchGame = (id, cb) => F.onSnapshot(gRef(id), s => cb(s.exists() ? s.data() : null), () => cb(null));
export const getGame = async id => { const s = await F.getDoc(gRef(id)); return s.exists() ? s.data() : null; };
export const watchActiveGames = cb => F.onSnapshot(F.query(games(), F.where('status', '==', 'active')), s => cb(list(s)), () => {});

export const countMoves = log => { let n = 0; for (const e of log) if (e[0] !== '=') n++; return n; };

/* Change a game. mutate(game, timeNow) returns the fields to change, or
   null to change nothing. It may be called more than once, so it must not
   remember anything between calls. If the change ends the game, the two
   ratings are worked out and written here too. */
export async function commitGame(id, mutate) {
  const gref = gRef(id);
  return F.runTransaction(db, async tx => {
    const snap = await tx.get(gref);
    if (!snap.exists()) throw new Error('That game no longer exists.');
    const game = snap.data(), t = now();
    const patch = mutate(game, t);
    if (!patch) return null;
    if (game.status === 'active' && patch.status === 'done') {
      patch.endedAt = t;
      const log = patch.log || game.log, chaos = game.chaos || patch.chaos;
      const counts = game.rated && !chaos && patch.result !== '*' && countMoves(log) >= 2;
      if (counts) {
        const [ws, bs] = await Promise.all([tx.get(pRef(game.white)), tx.get(pRef(game.black))]);
        const blank = name => ({ name, elo: START_ELO, peak: START_ELO, games: 0, w: 0, l: 0, d: 0 });
        const w = Object.assign(blank(game.white), ws.exists() ? ws.data() : null), b = Object.assign(blank(game.black), bs.exists() ? bs.data() : null);
        const score = patch.result === '1-0' ? 1 : patch.result === '0-1' ? 0 : 0.5;
        const dw = eloChange(w.elo, b.elo, score, w.games), db_ = eloChange(b.elo, w.elo, 1 - score, b.games);
        const after = (p, d, s) => {
          const elo = Math.max(100, p.elo + d);
          return { name: p.name, elo, peak: Math.max(p.peak || elo, elo), games: (p.games || 0) + 1, w: (p.w || 0) + (s === 1 ? 1 : 0), l: (p.l || 0) + (s === 0 ? 1 : 0), d: (p.d || 0) + (s === 0.5 ? 1 : 0) };
        };
        tx.set(pRef(game.white), after(w, dw, score), { merge: true });
        tx.set(pRef(game.black), after(b, db_, 1 - score), { merge: true });
        patch.delta = { w: dw, b: db_, wElo: Math.max(100, w.elo + dw), bElo: Math.max(100, b.elo + db_) };
      }
    }
    tx.update(gref, patch);
    return patch;
  });
}

/* Start another game between the same two people with the colours swapped.
   Whoever calls this second simply gets the game the first call made. */
export async function rematch(oldId) {
  const oref = gRef(oldId), gref = F.doc(games());
  return F.runTransaction(db, async tx => {
    const os = await tx.get(oref);
    if (!os.exists()) throw new Error('That game no longer exists.');
    const old = os.data();
    if (old.rematch) return old.rematch;
    const [a, b] = await Promise.all([tx.get(pRef(old.black)), tx.get(pRef(old.white))]);
    tx.set(gref, freshGame({
      white: old.black, black: old.white,
      wElo: a.exists() ? a.data().elo : START_ELO, bElo: b.exists() ? b.data().elo : START_ELO, tc: old.tc, rated: old.rated,
    }));
    tx.update(oref, { rematch: gref.id });
    return gref.id;
  });
}

/* ------------------------------------------------- reactions, chat, noise */

export function sendFx(gameId, data) {
  return F.addDoc(F.collection(games(), gameId, 'fx'), Object.assign({ at: now() }, data)).catch(() => {});
}
/* cb(newEvents, isFirstBatch) - the first batch is everything that
   happened before you arrived */
export function watchFx(gameId, cb) {
  let first = true;
  return F.onSnapshot(F.collection(games(), gameId, 'fx'), snap => {
    const added = snap.docChanges().filter(c => c.type === 'added').map(c => Object.assign({ id: c.doc.id }, c.doc.data())).sort((a, b) => a.at - b.at);
    cb(added, first);
    first = false;
  }, () => {});
}

/* -------------------------------------------------- the site's Messages */

/* Drop a challenge card into the two players' chat in the main site's
   Messages app. The fields match what Messages itself writes. */
export function sendChessMessage({ from, to, invite, tc, rated, label }) {
  return F.addDoc(F.collection(db, 'messages'), {
    from, to, participants: [from, to], pair: [from, to].sort().join('__'),
    type: 'chess', text: '♟️ Chess challenge · ' + label,
    chess: { invite, tc, rated: !!rated },
    clientTime: Date.now(), createdAt: F.serverTimestamp(),
  }).catch(() => {});
}

export { Chess };
