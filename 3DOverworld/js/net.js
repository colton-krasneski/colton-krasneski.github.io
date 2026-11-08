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
    const seen = new Set();
    snap.forEach((d) => {
      const v = d.data() || {};
      if (d.id === me) return;
      if (!v.at || now - v.at > STALE * 1000) return;
      seen.add(d.id);
      const p = peers.get(d.id);
      if (!p) link(d.id, v.name);
      else if (v.name && v.name !== p.name) { p.name = v.name; announce(p); }
    });
    /* anyone whose presence has gone, goes */
    for (const id of [...peers.keys()]) if (!seen.has(id)) drop(id, "left");
  }, () => say("offline", "lost the lobby")));

  addEventListener("beforeunload", leaveNow);
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
  for (const u of unsubs) { try { u(); } catch (err) { /* already gone */ } }
  unsubs = [];
  if (beat) clearInterval(beat);
  beat = null;
  say("offline");
}

/* ------------------------------------------------------------
   One connection

   The offer/answer and the two candidate piles are exactly the
   shape the duels use, with the pair's own document standing in
   for the duel's.
   ------------------------------------------------------------ */

function link(them, name) {
  if (peers.has(them) || them === me) return;
  const p = { id: them, name: name || "someone", told: null, pc: null, dc: null, open: false, subs: [] };
  peers.set(them, p);

  let pc;
  try { pc = new RTCPeerConnection(ICE); } catch (err) { peers.delete(them); return; }
  p.pc = pc;

  const id = linkId(me, them);
  const mine = iOffer(them) ? "aCand" : "bCand";
  const theirs = iOffer(them) ? "bCand" : "aCand";
  const dref = FS.doc(db, LINKS, id);

  pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    FS.addDoc(FS.collection(db, LINKS, id, mine), e.candidate.toJSON()).catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") drop(them, "failed");
  };

  p.subs.push(FS.onSnapshot(FS.collection(db, LINKS, id, theirs), (s) => {
    s.docChanges().forEach((c) => {
      if (c.type !== "added" || !p.pc) return;
      p.pc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(() => {});
    });
  }, () => {}));

  if (iOffer(them)) {
    p.dc = pc.createDataChannel("world", { ordered: false, maxRetransmits: 0 });
    wire(p);
    (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await FS.setDoc(dref, { offer: { type: offer.type, sdp: offer.sdp }, at: Date.now() });
      } catch (err) { drop(them, "failed"); return; }
      p.subs.push(FS.onSnapshot(dref, (d) => {
        const v = d.data();
        if (v && v.answer && p.pc && !p.pc.currentRemoteDescription) {
          p.pc.setRemoteDescription(new RTCSessionDescription(v.answer)).catch(() => {});
        }
      }, () => {}));
    })();
  } else {
    pc.ondatachannel = (e) => { p.dc = e.channel; wire(p); };
    p.subs.push(FS.onSnapshot(dref, async (d) => {
      const v = d.data();
      if (!v || !v.offer || !p.pc || p.pc.currentRemoteDescription) return;
      try {
        await p.pc.setRemoteDescription(new RTCSessionDescription(v.offer));
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        await FS.updateDoc(dref, { answer: { type: answer.type, sdp: answer.sdp } });
      } catch (err) { /* they may have given up; the sweep will tidy it */ }
    }, () => {}));
  }
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
    try { dc.send(encodeHello(myName)); } catch (err) { /* it will go next time */ }
    announce(p);
  };
  dc.onclose = () => drop(p.id, "left");
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

function drop(id, why) {
  const p = peers.get(id);
  if (!p) return;
  peers.delete(id);
  for (const u of p.subs) { try { u(); } catch (err) { /* gone */ } }
  try { if (p.dc) p.dc.close(); } catch (err) { /* gone */ }
  try { if (p.pc) p.pc.close(); } catch (err) { /* gone */ }
  /* Whichever of the two is still running tidies up - not only the
     one who made the offer, because if that is the browser that closed
     then nobody would, and the lobby fills with dead offers and the
     candidates underneath them. Both trying is harmless. */
  tidy(id);
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
  BEAT, STALE, PEERS, LINKS,
  linkId, connect, disconnect, broadcast, netState, peers,
};
