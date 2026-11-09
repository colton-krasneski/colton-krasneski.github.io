/* ============================================================
   The wire.

   Firestore only does the introductions. Once two browsers have
   found each other, positions go straight between them over a
   WebRTC data channel and Firestore never hears another word -
   which is the whole reason it costs nothing to run. The free
   tier bills per document write, and a dozen position updates a
   second per player would spend a day's allowance in under an
   hour.

   The handshake below is the one already running on this site
   for the Air Hockey duels, generalised from one pair to a mesh.
   It is deliberately not a cleverer handshake: that one works.

   Everything in here fails quietly. No Firebase, no network, a
   blocked STUN server, somebody else's browser refusing the
   connection - none of it is allowed to stop the game, because
   the game is perfectly good on its own and was before any of
   this existed.
   ============================================================ */

import { decodeState, decodeText, encodeBye, encodeHello } from "./protocol.js";

const CFG = {
  apiKey: "AIzaSyCPkwQaND-E_uewYq5NLKpLBP9oUzyVAFs",
  authDomain: "colton-site.firebaseapp.com",
  projectId: "colton-site",
  storageBucket: "colton-site.firebasestorage.app",
  messagingSenderId: "565997166421",
  appId: "1:565997166421:web:63a24af02db08878fed9dc",
};

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

/* How often presence is refreshed, and how long before somebody who
   has stopped refreshing is written off.

   This is the one thing that costs anything, so it is slow on purpose.
   Once a channel is open the channel itself says whether somebody is
   still there, and Firestore is not asked again - the refresh only
   exists so that a browser which crashed rather than closed eventually
   stops appearing in the meadow. */
const BEAT = 60;
const STALE = 160;

/* How long an offer waits to become a connection before it is made
   again. A connection takes a second or two; this is for the answer
   that never came - most often a phone that was asleep. */
const PATIENCE = 25;

const PEERS = "worldPeers";
const LINKS = "worldLinks";

let FS = null;                 /* the firestore module, loaded on demand */
let db = null;
let me = null;
let myName = "someone";
let on = {};                   /* join / state / leave / status */
let unsubs = [];
let beat = null;
let live = false;
const peers = new Map();       /* id -> { pc, dc, name, open } */
const fresh = new Map();       /* id -> name: who the lobby last said is here */
const answered = new Map();    /* id -> the tag of the last offer of theirs we answered */

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
/* both ends work this out and both get the same answer, so there is
   never a question of who offers and never two offers at once */
const linkId = (a, b) => (a < b ? a + "__" + b : b + "__" + a);
const iOffer = (them) => me < them;

function say(status, detail) {
  if (on.status) { try { on.status(status, detail); } catch (err) { /* theirs */ } }
}

/* ------------------------------------------------------------
   Joining
   ------------------------------------------------------------ */

async function connect(opts) {
  if (live) return me;
  on = opts || {};
  myName = String((opts && opts.name) || "someone").slice(0, 24);
  me = rid();
  live = true;
  say("connecting");

  try {
    /* Imported here rather than at the top of the file on purpose: if
       Firebase cannot be reached, the import rejects, and a rejected
       import at the top of a module takes the whole game down with it.
       Down here it is one caught promise and a single-player meadow. */
    const [app, fs] = await Promise.all([
      import(SDK + "firebase-app.js"),
      import(SDK + "firebase-firestore.js"),
    ]);
    FS = fs;
    db = fs.getFirestore(app.initializeApp(CFG));
  } catch (err) {
    live = false;
    say("offline", "could not reach the lobby");
    return null;
  }

  try {
    await FS.setDoc(FS.doc(db, PEERS, me), { name: myName, at: Date.now() });
  } catch (err) {
    live = false;
    say("offline", "could not join the lobby");
    return null;
  }

  beat = setInterval(() => {
    FS.setDoc(FS.doc(db, PEERS, me), { name: myName, at: Date.now() }).catch(() => {});
  }, BEAT * 1000);

  /* who else is out there */
  unsubs.push(FS.onSnapshot(FS.collection(db, PEERS), (snap) => {
    const now = Date.now();
    fresh.clear();
    snap.forEach((d) => {
      const v = d.data() || {};
      if (d.id === me) return;
      if (!v.at || now - v.at > STALE * 1000) return;
      fresh.set(d.id, v.name);
    });
    for (const [id, name] of fresh) {
      const p = peers.get(id);
      try {
        if (!p) link(id, name);
        else if (name && name !== p.name) { p.name = name; announce(p); }
      } catch (err) { /* one bad pairing must not hold up the rest */ }
    }
    /* anyone whose presence has gone, goes */
    for (const id of [...peers.keys()]) if (!fresh.has(id)) drop(id, "left");
  }, () => say("offline", "lost the lobby")));

  addEventListener("beforeunload", leaveNow);
  /* Phones do not send beforeunload - iOS never has - so a phone that
     closed the tab used to stand in the lobby for nearly three minutes
     with every newcomer offering to it. pagehide they do send. */
  addEventListener("pagehide", leaveNow);
  say("online");
  return me;
}

function leaveNow() {
  if (!live) return;
  for (const [, p] of peers) {
    try { if (p.dc && p.dc.readyState === "open") p.dc.send(encodeBye()); } catch (err) { /* going anyway */ }
  }
  try { FS.deleteDoc(FS.doc(db, PEERS, me)); } catch (err) { /* best effort */ }
}

function disconnect() {
  if (!live) return;
  /* Say goodbye first and clear the flag after: leaveNow() guards on
     the same flag, so clearing it first made it return without ever
     deleting the presence or sending the bye - and everybody else
     kept a ghost standing in the meadow until it timed out. */
  leaveNow();
  live = false;
  for (const id of [...peers.keys()]) drop(id, "left");
  fresh.clear();
  answered.clear();
  for (const u of unsubs) { try { u(); } catch (err) { /* already gone */ } }
  unsubs = [];
  if (beat) clearInterval(beat);
  beat = null;
  say("offline");
}

/* ------------------------------------------------------------
   One connection

   The offer/answer and the two candidate piles are the shape the
   duels use, with the pair's own document standing in for the
   duel's. Two things are added, because a duel is two people who
   both just pressed a button, and this is anybody, at any time, on
   a phone that may go to sleep halfway through:

   - Every offer carries a tag, and so does every candidate. When an
     attempt fails - an answer that never came, a connection that
     died - the side that offers simply offers again under a new
     tag, and the side that answers drops what it had and answers
     the new one. Leftovers from an earlier attempt carry its tag
     and are ignored rather than deleted. Deleting them was a race:
     it used to take the other side's fresh offer with it, and the
     pair then sat waiting on each other until somebody reloaded.

   - Candidates that arrive before the description they belong to
     wait for it. See take().
   ------------------------------------------------------------ */

function link(them, name) {
  if (!live || peers.has(them) || them === me) return;
  const p = {
    id: them, name: name || "someone", told: null, pc: null, dc: null, open: false,
    subs: [], early: [], n: null, answered: false, timer: null,
  };
  peers.set(them, p);

  let pc;
  try { pc = new RTCPeerConnection(ICE); } catch (err) { peers.delete(them); return; }
  p.pc = pc;
  const current = () => peers.get(them) === p;

  const id = linkId(me, them);
  const offering = iOffer(them);
  const dref = FS.doc(db, LINKS, id);
  const mine = offering ? "aCand" : "bCand";
  const theirs = offering ? "bCand" : "aCand";

  pc.onicecandidate = (e) => {
    if (!e.candidate || p.n === null || !current()) return;
    const c = e.candidate.toJSON();
    c.n = p.n;
    FS.addDoc(FS.collection(db, LINKS, id, mine), c).catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") retry(them, p);
  };

  p.subs.push(FS.onSnapshot(FS.collection(db, LINKS, id, theirs), (s) => {
    s.docChanges().forEach((c) => {
      if (c.type !== "added" || !p.pc) return;
      const cand = c.doc.data();
      if (p.pc.remoteDescription) take(p, cand);
      else p.early.push(cand);
    });
  }, () => {}));

  if (offering) {
    p.n = rid();
    p.dc = pc.createDataChannel("world", { ordered: false, maxRetransmits: 0 });
    wire(p);
    /* no answer in time, or no connection from it: offer again */
    p.timer = setTimeout(() => { if (!p.open) retry(them, p, 0); }, PATIENCE * 1000);
    (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await FS.setDoc(dref, { offer: { type: offer.type, sdp: offer.sdp }, n: p.n, at: Date.now() });
      } catch (err) { retry(them, p); return; }
      if (!current()) return;
      p.subs.push(FS.onSnapshot(dref, (d) => {
        const v = d.data();
        if (!v || !v.answer || p.answered || !p.pc) return;
        /* a late answer to an earlier offer of ours */
        if (v.answer.n !== undefined && v.answer.n !== p.n) return;
        p.answered = true;
        p.pc.setRemoteDescription(new RTCSessionDescription({ type: v.answer.type, sdp: v.answer.sdp }))
          .then(() => flush(p), () => { p.answered = false; });
      }, () => {}));
    })();
  } else {
    pc.ondatachannel = (e) => { p.dc = e.channel; wire(p); };
    p.subs.push(FS.onSnapshot(dref, async (d) => {
      const v = d.data();
      if (!v || !v.offer || !p.pc || !current()) return;
      /* an untagged offer comes from a page older than the tags */
      const n = v.n === undefined ? "" : String(v.n);
      if (p.n !== null) {
        /* already on one: a different tag means they have started again */
        if (n !== p.n) retry(them, p, 0);
        return;
      }
      /* the one a dropped link of ours already answered: wait for the next */
      if (n && answered.get(them) === n) return;
      p.n = n;
      answered.set(them, n);
      try {
        await p.pc.setRemoteDescription(new RTCSessionDescription(v.offer));
        flush(p);
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        const a = { type: answer.type, sdp: answer.sdp };
        if (n) a.n = n;
        await FS.updateDoc(dref, { answer: a });
      } catch (err) { /* they will offer again */ }
    }, () => {}));
  }
}

/* A candidate added before the description it belongs to is refused,
   and it is never sent again. The candidates and the description come
   down separate listeners, in whatever order Firestore delivers them,
   so a refused one was simply lost: two of four, the first time two
   real browsers were watched doing this. On one machine that does not
   matter. Between a phone and a computer the one lost is usually the
   route across the router, which is the only one that works. So any
   that arrive early wait in p.early until flush(). (The duels never
   had this: they only start listening once the description is in.) */
function take(p, cand) {
  if (!p.pc) return;
  /* left over from another attempt */
  if (cand.n !== undefined && p.n && cand.n !== p.n) return;
  const c = Object.assign({}, cand);
  delete c.n;
  p.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
}
function flush(p) {
  for (const c of p.early.splice(0)) take(p, c);
}

/* This attempt is over. Forget it and, if they are still in the lobby,
   start again - which, for the side that answers, means waiting for the
   next offer. Nothing is tidied: see "One connection" above. */
function retry(them, p, delay) {
  if (peers.get(them) !== p) return;
  drop(them, "lost", true);
  setTimeout(() => {
    if (live && fresh.has(them) && !peers.has(them)) link(them, fresh.get(them));
  }, delay === undefined ? 1500 : delay);
}

/* What a channel does once it is open. Position updates are sent
   unreliably and unordered - a packet that arrives late is of no use
   to anybody, and waiting for it to be re-sent would hold up the three
   that came after it. The timeline at the far end expects exactly
   that and drops anything out of order. */
function wire(p) {
  const dc = p.dc;
  if (!dc) return;
  dc.binaryType = "arraybuffer";
  dc.onopen = () => {
    p.open = true;
    if (p.timer) { clearTimeout(p.timer); p.timer = null; }
    try { dc.send(encodeHello(myName)); } catch (err) { /* it will go next time */ }
    announce(p);
  };
  /* closed from the far end without a goodbye: their page died, or the
     connection did. If they are still in the lobby, start again. */
  dc.onclose = () => retry(p.id, p);
  dc.onerror = () => { /* onclose follows */ };
  dc.onmessage = (e) => {
    if (typeof e.data === "string") {
      const m = decodeText(e.data);
      if (!m) return;
      if (m.t === 1 && m.name) { p.name = m.name; announce(p); }
      else if (m.t === 3) drop(p.id, "left");
      return;
    }
    const st = decodeState(e.data);
    if (st && on.state) on.state(p.id, st);
  };
}

/* Somebody is here, once per name. The lobby row and the hello that
   follows it both carry one, and saying it twice reads as two people
   arriving. */
function announce(p) {
  if (!p.open || p.told === p.name) return;
  p.told = p.name;
  if (on.join) on.join(p.id, p.name);
}

/* "keep" leaves the pair's documents alone, for an attempt that is
   about to be made again. */
function drop(id, why, keep) {
  const p = peers.get(id);
  if (!p) return;
  peers.delete(id);
  if (p.timer) { clearTimeout(p.timer); p.timer = null; }
  for (const u of p.subs) { try { u(); } catch (err) { /* gone */ } }
  p.subs = [];
  if (p.dc) p.dc.onopen = p.dc.onclose = p.dc.onmessage = null;
  try { if (p.dc) p.dc.close(); } catch (err) { /* gone */ }
  try { if (p.pc) p.pc.close(); } catch (err) { /* gone */ }
  p.pc = null;
  /* Whichever of the two is still running tidies up - not only the
     one who made the offer, because if that is the browser that closed
     then nobody would, and the lobby fills with dead offers and the
     candidates underneath them. Both trying is harmless. */
  if (!keep) { tidy(id); answered.delete(id); }
  if (on.leave) on.leave(id, why);
}

/* The offer, the answer, and both piles of candidates underneath
   them. A subcollection does not go when its parent does, so they are
   listed and removed by hand. */
function tidy(them) {
  if (!db || !FS) return;
  const id = linkId(me, them);
  FS.deleteDoc(FS.doc(db, LINKS, id)).catch(() => {});
  for (const side of ["aCand", "bCand"]) {
    FS.getDocs(FS.collection(db, LINKS, id, side)).then((snap) => {
      snap.forEach((k) => FS.deleteDoc(FS.doc(db, LINKS, id, side, k.id)).catch(() => {}));
    }).catch(() => {});
  }
}

/* ------------------------------------------------------------
   Talking
   ------------------------------------------------------------ */

function broadcast(buf) {
  if (!live) return 0;
  let sent = 0;
  for (const [, p] of peers) {
    if (!p.open || !p.dc || p.dc.readyState !== "open") continue;
    /* A channel that has backed up is a channel on a bad connection;
       piling more onto it only makes the backlog older. */
    if (p.dc.bufferedAmount > 64 * 1024) continue;
    try { p.dc.send(buf); sent++; } catch (err) { /* it will go next tick */ }
  }
  return sent;
}

/* Whether a channel to them is open right now. Somebody with an open
   channel who has gone quiet is still here - on a menu, in another
   tab - and only standing still. */
function isOpen(id) {
  const p = peers.get(id);
  return !!(p && p.open && p.dc && p.dc.readyState === "open");
}

/* what the readouts and the tests want to know */
function netState() {
  const list = [];
  for (const [id, p] of peers) {
    list.push({
      id, name: p.name, open: p.open,
      state: p.pc ? p.pc.connectionState : "none",
    });
  }
  return { live, me, name: myName, peers: list, open: list.filter((x) => x.open).length };
}
export {
  BEAT, STALE, PATIENCE, PEERS, LINKS,
  linkId, connect, disconnect, broadcast, isOpen, netState, peers,
};
