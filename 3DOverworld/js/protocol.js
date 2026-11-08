/* ============================================================
   What goes over the wire, and the clock that smooths it out.

   The world itself never travels. It is generated from fixed
   constants, so every browser already has the identical terrain,
   the identical trees and the identical lake - which leaves only
   the people to send. That is eight numbers and a byte of flags
   each, about thirty bytes, a dozen times a second.

   Everything in here is arithmetic with no Firestore and no
   WebRTC anywhere near it, which is deliberate: it is the half
   with the subtle bugs in it - angles that interpolate the long
   way round, a phase that wraps, packets that arrive out of
   order - and it is the half that can be tested without two
   browsers and a network.
   ============================================================ */

const PROTO = 1;

const MSG = {
  HELLO: 1,      /* who I am, sent once when a channel opens */
  STATE: 2,      /* where I am, sent about twelve times a second */
  BYE: 3,        /* leaving on purpose, rather than by timing out */
};

/* type, proto, eight floats, flags */
const STATE_BYTES = 3 + 8 * 4;

/* what the flags byte carries */
const F = { GROUND: 1, SWIM: 2, CROUCH: 4, SPRINT: 8 };

const T2 = Math.PI * 2;

/* the shortest way round from a to b */
function wrapPi(a) {
  while (a > Math.PI) a -= T2;
  while (a < -Math.PI) a += T2;
  return a;
}
function mixAngle(a, b, t) {
  return a + wrapPi(b - a) * t;
}
/* the same idea for the gait phase, which runs 0..1 and wraps */
function mixPhase(a, b, t) {
  let d = b - a;
  while (d > 0.5) d -= 1;
  while (d < -0.5) d += 1;
  let v = (a + d * t) % 1;
  return v < 0 ? v + 1 : v;
}

/* ------------------------------------------------------------
   State, packed
   ------------------------------------------------------------ */

function encodeState(s) {
  const b = new ArrayBuffer(STATE_BYTES);
  const v = new DataView(b);
  v.setUint8(0, MSG.STATE);
  v.setUint8(1, PROTO);
  let flags = 0;
  if (s.onGround) flags |= F.GROUND;
  if (s.swimming) flags |= F.SWIM;
  if (s.crouch > 0.5) flags |= F.CROUCH;
  if (s.sprinting) flags |= F.SPRINT;
  v.setUint8(2, flags);
  let o = 3;
  for (const n of [s.x, s.y, s.z, s.bodyYaw, s.yaw, s.pitch, s.speed, s.cyc]) {
    v.setFloat32(o, Number.isFinite(n) ? n : 0, true);
    o += 4;
  }
  return b;
}

/* Returns null rather than throwing on anything malformed. A peer is
   someone else's browser: it may be an older build, a newer one, or
   somebody poking at the channel from the console, and none of those
   are a reason to take the frame loop down. */
function decodeState(buf) {
  if (!buf || buf.byteLength < STATE_BYTES) return null;
  const v = new DataView(buf);
  if (v.getUint8(0) !== MSG.STATE || v.getUint8(1) !== PROTO) return null;
  const flags = v.getUint8(2);
  const n = [];
  for (let i = 0; i < 8; i++) {
    const f = v.getFloat32(3 + i * 4, true);
    if (!Number.isFinite(f)) return null;
    n.push(f);
  }
  return {
    x: n[0], y: n[1], z: n[2],
    bodyYaw: n[3], yaw: n[4], pitch: n[5],
    speed: n[6], cyc: n[7],
    onGround: !!(flags & F.GROUND),
    swimming: !!(flags & F.SWIM),
    crouch: (flags & F.CROUCH) ? 1 : 0,
    sprinting: !!(flags & F.SPRINT),
  };
}

/* ---- the two small text messages ---- */

function encodeHello(name) {
  return JSON.stringify({ t: MSG.HELLO, p: PROTO, name: String(name || "").slice(0, 24) });
}
function encodeBye() {
  return JSON.stringify({ t: MSG.BYE, p: PROTO });
}
function decodeText(s) {
  let m;
  try { m = JSON.parse(s); } catch (err) { return null; }
  if (!m || m.p !== PROTO) return null;
  if (m.t === MSG.HELLO) return { t: MSG.HELLO, name: String(m.name || "").slice(0, 24) };
  if (m.t === MSG.BYE) return { t: MSG.BYE };
  return null;
}

/* ------------------------------------------------------------
   The timeline

   Packets arrive a dozen times a second, unevenly, sometimes out
   of order and sometimes not at all. Drawing each one as it lands
   would make everyone else twitch, so they go in a buffer and are
   drawn a fixed moment in the past, interpolated between the two
   that bracket that moment. A tenth of a second of delay is not
   noticeable on someone else and is enough to hide the jitter.

   Snapshots are stamped on *arrival*, with the receiver's own
   clock. Senders' clocks are never consulted and never trusted,
   which disposes of clock skew entirely.
   ------------------------------------------------------------ */

const DELAY = 0.12;        /* seconds behind live */
const KEEP = 1.5;          /* how much history to hold on to */

class Timeline {
  constructor(delay) {
    this.delay = delay === undefined ? DELAY : delay;
    this.at = [];          /* arrival times, ascending */
    this.st = [];          /* the states that came with them */
  }

  push(now, state) {
    if (!state) return;
    /* out of order: drop anything already older than what we hold.
       Over a reliable ordered channel this cannot happen, but the
       channel is only ordered if it was asked to be. */
    const n = this.at.length;
    if (n && now < this.at[n - 1]) return;
    this.at.push(now);
    this.st.push(state);
    while (this.at.length > 2 && now - this.at[0] > KEEP) {
      this.at.shift(); this.st.shift();
    }
  }

  /* How far behind live we are drawing. Useful for showing someone a
     connection quality, and for the tests. */
  age(now) {
    const n = this.at.length;
    return n ? now - this.at[n - 1] : Infinity;
  }

  empty() { return this.at.length === 0; }

  /* The state to draw at `now`, interpolated. Writes into `out` and
     returns it, so sampling every peer every frame allocates nothing. */
  sample(now, out) {
    const n = this.at.length;
    if (!n) return null;
    const want = now - this.delay;
    const o = out || {};

    /* before anything we have: hold the oldest */
    if (want <= this.at[0]) return Object.assign(o, this.st[0], { lead: 0 });
    /* past the newest: hold it rather than guess. A guess that is
       wrong has to be taken back, and taking it back looks worse than
       standing still for a frame. */
    if (want >= this.at[n - 1]) {
      return Object.assign(o, this.st[n - 1], { lead: want - this.at[n - 1] });
    }

    let i = n - 1;
    while (i > 0 && this.at[i - 1] > want) i--;
    const t0 = this.at[i - 1], t1 = this.at[i];
    const a = this.st[i - 1], b = this.st[i];
    const span = t1 - t0;
    const k = span > 1e-6 ? (want - t0) / span : 0;

    o.x = a.x + (b.x - a.x) * k;
    o.y = a.y + (b.y - a.y) * k;
    o.z = a.z + (b.z - a.z) * k;
    o.bodyYaw = mixAngle(a.bodyYaw, b.bodyYaw, k);
    o.yaw = mixAngle(a.yaw, b.yaw, k);
    o.pitch = a.pitch + (b.pitch - a.pitch) * k;
    o.speed = a.speed + (b.speed - a.speed) * k;
    o.cyc = mixPhase(a.cyc, b.cyc, k);
    /* flags do not interpolate: take whichever side we are nearer */
    const f = k < 0.5 ? a : b;
    o.onGround = f.onGround;
    o.swimming = f.swimming;
    o.crouch = a.crouch + (b.crouch - a.crouch) * k;
    o.sprinting = f.sprinting;
    o.lead = 0;
    return o;
  }
}
export {
  PROTO, MSG, F, STATE_BYTES, DELAY,
  wrapPi, mixAngle, mixPhase,
  encodeState, decodeState, encodeHello, encodeBye, decodeText,
  Timeline,
};
