/* ============================================================
   Everybody else.

   A remote player is the same figure you are, posed from numbers
   that arrived over the wire instead of from a keyboard. Nothing
   about the world travels - it is generated from fixed constants,
   so their terrain is already your terrain - and nothing about
   the animation travels either. What comes down the channel is
   where they are, which way they face and how fast they are
   going; everything from there is worked out again at this end,
   by the same code that drives you.

   That is why the stride lives in gait.js. Two copies of the
   arithmetic would agree on the day they were written and drift
   apart on some later afternoon, and the symptom would be that
   other people walk slightly wrong in a way nobody can put their
   finger on.
   ============================================================ */

import * as THREE from "three";
import { sfxFoot } from "./audio.js";
import { strideFor, swingFor } from "./gait.js";
import { Timeline, wrapPi } from "./protocol.js";
import { Rig } from "./rig.js";
import { clamp, clamp01 } from "./terrain.js";

/* how far away somebody else's boots can still be heard */
const EARSHOT = 22;
/* and when to give up on someone who has gone quiet */
const LOST = 6;

const _v = new THREE.Vector3();

/* ------------------------------------------------------------
   The name over their head
   ------------------------------------------------------------ */

function nameplate(text) {
  const pad = 16, size = 46;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = "600 " + size + "px system-ui, sans-serif";
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const c = document.createElement("canvas");
  c.width = Math.max(64, w); c.height = size + pad * 2;
  const x = c.getContext("2d");
  x.font = "600 " + size + "px system-ui, sans-serif";
  x.textAlign = "center"; x.textBaseline = "middle";
  /* drawn dark-on-light-edge rather than in a box, so it reads against
     both a bright meadow and the shade under a tree */
  x.lineWidth = 8; x.strokeStyle = "rgba(6,10,8,.85)";
  x.strokeText(text, c.width / 2, c.height / 2);
  x.fillStyle = "#eaf6dc";
  x.fillText(text, c.width / 2, c.height / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: true, depthWrite: false,
    sizeAttenuation: true,
  }));
  sp.scale.set(c.width / c.height * 0.26, 0.26, 1);
  sp.renderOrder = 5;
  return sp;
}

/* ------------------------------------------------------------
   One of them
   ------------------------------------------------------------ */

class RemotePlayer {
  constructor(scene, world, id, name) {
    this.id = id;
    this.world = world;
    this.rig = new Rig(scene, { remote: true });
    this.line = new Timeline();
    this.heard = -1;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.placed = false;
    this.dir = { x: 0, z: -1 };

    /* the same smoothed values the local player keeps, so the figure
       settles the same way rather than snapping between packets */
    this.amp = 0; this.run = 0; this.air = 0;
    this.crouch = 0; this.swim = 0; this.push = 0;
    this.land = 0; this.landV = 0;
    this.turn = 0; this.pitchRate = 0;
    this.lastYaw = 0; this.lastPitch = 0;
    this.wasGround = true;
    this.vy = 0;
    this.time = Math.random() * 40;   /* so everyone does not breathe in unison */

    this.st = { ground: (x, z) => world.groundAt(x, z) };
    this._s = {};

    this.plate = nameplate(name || "someone");
    scene.add(this.plate);
    this.name = name || "someone";
    this.scene = scene;
  }

  rename(name) {
    if (!name || name === this.name) return;
    this.name = name;
    this.scene.remove(this.plate);
    this.plate.material.map.dispose();
    this.plate.material.dispose();
    this.plate = nameplate(name);
    this.scene.add(this.plate);
  }

  feed(now, state) {
    this.line.push(now, state);
    this.heard = now;
  }

  /* gone quiet for long enough that they are not coming back */
  lost(now) {
    return this.heard >= 0 && now - this.heard > LOST;
  }

  update(now, dt, listener) {
    const s = this.line.sample(now, this._s);
    if (!s) return;
    const r = this.rig;
    this.time += dt;

    /* ---- where they are, and how they got there ---- */
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    this.pos.set(s.x, s.y, s.z);
    if (!this.placed) {
      /* the first packet is a teleport, not a sprint across the map */
      this.placed = true;
      this.lastYaw = s.yaw; this.lastPitch = s.pitch;
    } else if (dt > 1e-5) {
      this.vy = (s.y - py) / dt;
      const dx = s.x - px, dz = s.z - pz;
      const m = Math.hypot(dx, dz);
      if (m > 1e-4) {
        const k = Math.min(1, 9 * dt);
        this.dir.x += (dx / m - this.dir.x) * k;
        this.dir.z += (dz / m - this.dir.z) * k;
        const n = Math.hypot(this.dir.x, this.dir.z);
        if (n > 1e-4) { this.dir.x /= n; this.dir.z /= n; }
      }
    }

    /* ---- the stride, from the one shared copy of the arithmetic ---- */
    const stride = strideFor(s.speed);
    const swing = swingFor(s.speed, s.onGround);
    this.amp += (swing.amp - this.amp) * Math.min(1, 7 * dt);
    this.run += (swing.run - this.run) * Math.min(1, 5 * dt);
    const wantAir = s.onGround || s.swimming ? 0 : 1;
    this.air += (wantAir - this.air) * Math.min(1, (wantAir ? 7 : 14) * dt);
    this.crouch += (s.crouch - this.crouch) * Math.min(1, 12 * dt);
    this.swim += ((s.swimming ? 1 : 0) - this.swim) * Math.min(1, 6 * dt);
    this.push += (clamp01(s.speed / 4) - this.push) * Math.min(1, 5 * dt);

    /* ---- the knees give when they land ----
       Nobody sends this: the landing is spotted at this end, from the
       moment their feet come back under them, and the same spring that
       runs for you runs for them. */
    if (s.onGround && !this.wasGround && this.vy < -2) {
      this.landV -= Math.min(0.3, (-this.vy - 2) * 0.028);
    }
    this.wasGround = s.onGround;
    this.landV += (-this.land * 85 - this.landV * 13) * dt;
    this.land += this.landV * dt;
    this.land = clamp(this.land, -0.42, 0.08);

    /* ---- how fast they are turning, for the head and the hands ---- */
    if (dt > 1e-5) {
      const k = Math.min(1, 9 * dt);
      this.turn += (wrapPi(s.yaw - this.lastYaw) / dt - this.turn) * k;
      this.pitchRate += ((s.pitch - this.lastPitch) / dt - this.pitchRate) * k;
    }
    this.lastYaw = s.yaw; this.lastPitch = s.pitch;

    /* ---- everything the rig asks for ---- */
    const st = this.st;
    st.dt = dt;
    st.vy = this.vy;
    st.time = this.time;
    st.cyc = s.cyc;
    st.cycle = stride.cycle;
    st.duty = stride.duty;
    st.amp = this.amp;
    st.run = this.run;
    st.air = this.air;
    st.land = this.land;
    st.crouch = this.crouch;
    st.swim = this.swim;
    st.push = this.push;
    st.pitch = s.pitch;
    st.turn = this.turn;
    st.pitchRate = this.pitchRate;
    /* always seen from outside, so never the carried first-person pose */
    st.fp = 0;
    st.grip = 0.07;
    st.px = s.x;
    st.pz = s.z;
    st.fwdX = -Math.sin(s.bodyYaw);
    st.fwdZ = -Math.cos(s.bodyYaw);
    st.rightX = -st.fwdZ;
    st.rightZ = st.fwdX;
    const moving = s.speed > 0.5 && this.amp > 0.12;
    st.dirX = moving ? this.dir.x : st.fwdX;
    st.dirZ = moving ? this.dir.z : st.fwdZ;
    st.twist = wrapPi(s.yaw - s.bodyYaw);
    st.footYaw = moving
      ? clamp(wrapPi(Math.atan2(-this.dir.x, -this.dir.z) - s.bodyYaw), -0.70, 0.70) * 0.55
      : 0;
    st.k5 = Math.min(1, 5 * dt);
    st.k6 = Math.min(1, 6 * dt);
    st.k8 = Math.min(1, 8 * dt);
    st.k9 = Math.min(1, 10 * dt);

    r.root.position.copy(this.pos);
    r.root.rotation.y = s.bodyYaw;
    r.pose(st);

    /* ---- their boots, if they are close enough to hear ---- */
    if (r.stepped) {
      r.stepped = 0;
      if (!s.swimming && s.onGround && listener) {
        const d = listener.distanceTo(this.pos);
        if (d < EARSHOT) {
          const x = r.stepAt.x, z = r.stepAt.z;
          const vol = (1 - d / EARSHOT) * (1 - d / EARSHOT);
          sfxFoot(this.world.surfaceAt(x, z),
            clamp01(0.14 + s.speed / 7.2) * (1 - this.crouch * 0.55),
            this.world.wetAt(x, z), vol);
        }
      }
    }

    /* ---- and their name, over their head ---- */
    r.eye(_v);
    this.plate.position.set(_v.x, this.pos.y + 1.99 - this.crouch * 0.3, _v.z);
  }

  dispose() {
    this.rig.dispose(this.scene);
    this.scene.remove(this.plate);
    this.plate.material.map.dispose();
    this.plate.material.dispose();
  }
}
export {
  EARSHOT, LOST, RemotePlayer, nameplate,
};
