/* ============================================================
   Movement: what the player does, where that puts them, and where
   the camera ends up as a result.
   ============================================================ */

import * as THREE from "three";
import { sfxBreath, sfxFoot, sfxJump, sfxLand, sfxSplash } from "./audio.js";
import { HEAD_LAYER, T2 } from "./character.js";
import { strideFor, swingFor } from "./gait.js";
import { setSprinting, setThirdPerson } from "./hud.js";
import { Rig } from "./rig.js";
import { WATER, clamp, clamp01, heightAt, lerp } from "./terrain.js";

const SPAWN = new THREE.Vector3(0, 0, 0);
/* how much of the body's own stride bob the first-person camera takes */
const FP_BOB = 0.42;
const EYE = 1.645;

/* the shortest way round to an angle */
function wrapPi(a) {
  while (a > Math.PI) a -= T2;
  while (a < -Math.PI) a += T2;
  return a;
}

class Player {
  constructor(scene, world) {
    this.world = world;
    this.rig = new Rig(scene);
    this.root = this.rig.root;

    this.pos = new THREE.Vector3(0, heightAt(0, 0), 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.lastPitch = 0;
    this.pitchRate = 0;
    this.bodyYaw = 0;
    this.yawRate = 0;
    /* which way he is actually travelling, smoothed */
    this.dir = { x: 0, z: -1 };
    this.mode = 0;
    this.camDist = 4.6;
    this.onGround = true;
    this.swimming = false;
    this.sprinting = false;
    this.wasSwimming = false;
    this.swim = 0;
    this.crouch = 0;
    this.cyc = 0;
    this.cycle = 1.8;
    this.duty = 0.57;
    this.amp = 0;
    this.run = 0;
    this.push = 0;
    this.air = 0;
    this.land = 0;
    this.landV = 0;
    this.fov = 70;
    this.lean = 0;
    this.time = 0;
    this.camEye = new THREE.Vector3();
    this.hasEye = false;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._e = new THREE.Euler(0, 0, 0, "YXZ");
    this._st = {
      ground: (x, z) => this.world.groundAt(x, z),
    };
    this.animate(0.016, 0);
  }

  respawn() {
    this.pos.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z) + 0.6, SPAWN.z);
    this.vel.set(0, 0, 0);
    this.land = this.landV = 0;
    this.onGround = false;
    this.hasEye = false;
  }

  eyeHeight() {
    return EYE - this.crouch * 0.34 + this.land;
  }

  update(dt, input) {
    /* look */
    const y0 = this.yaw;
    this.yaw -= input.lookX * 0.0024;
    const p0 = this.pitch;
    this.pitch = clamp(this.pitch - input.lookY * 0.0024, -1.44, 1.42);
    if (dt > 1e-4) {
      this.yawRate += ((this.yaw - y0) / dt - this.yawRate) * Math.min(1, 9 * dt);
      this.pitchRate += ((this.pitch - p0) / dt - this.pitchRate) * Math.min(1, 9 * dt);
    }
    if (this.mode === 1) this.camDist = clamp(this.camDist + input.zoom, 1.8, 12);

    const w = this.world;
    const ground = w.groundAt(this.pos.x, this.pos.z);
    const deep = WATER - ground;
    this.swimming = deep > 0.9 && this.pos.y < WATER - 0.15;
    this.swim += ((this.swimming ? 1 : 0) - this.swim) * Math.min(1, 6 * dt);

    const wantCrouch = input.crouch && !this.swimming && this.onGround ? 1 : 0;
    this.crouch += (wantCrouch - this.crouch) * Math.min(1, 12 * dt);

    /* where you want to go, relative to where you are looking */
    const fwd = this._a.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = this._b.set(-fwd.z, 0, fwd.x);
    const ax = input.axisX(), az = input.axisY();
    const mag = Math.min(1, Math.hypot(ax, az));
    const sprint = input.sprint && !wantCrouch && az > 0.1;
    const speed = this.swimming ? 3.4 : (sprint ? 8.4 : 5.0) * (1 - this.crouch * 0.52);
    const want = this._c.set(0, 0, 0).addScaledVector(fwd, az).addScaledVector(right, ax);
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed * mag);

    const accel = this.swimming ? 7 : (this.onGround ? 22 : 7);
    const blend = Math.min(1, accel * dt);
    this.vel.x += (want.x - this.vel.x) * blend;
    this.vel.z += (want.z - this.vel.z) * blend;

    /* up and down */
    const wasAir = !this.onGround;
    if (this.swimming) {
      const floatY = WATER - 0.48;
      const targetY = input.sprint ? ground + 0.5 : floatY;
      this.vel.y = (targetY - this.pos.y) * 4.0;
      if (input.takeJump() && this.pos.y > WATER - 0.7) {
        this.vel.y = 6.2;
        sfxSplash(0.7);
      }
    } else {
      this.vel.y -= 26 * dt;
      if (this.onGround && input.takeJump()) {
        this.vel.y = 9.2;
        this.onGround = false;
        sfxJump();
      }
    }

    const fallV = this.vel.y;
    this.pos.addScaledVector(this.vel, dt);
    w.pushOut(this.pos, 0.42);

    const g = w.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y <= g) {
      this.pos.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      if (wasAir && fallV < -5) this.landV -= Math.min(0.3, (-fallV - 5) * 0.028);
      /* Loud in proportion to the drop. The floor keeps a step off a
         kerb from sounding like a fall off a roof, and the threshold
         keeps walking over a lip from triggering one at all. */
      if (wasAir && fallV < -1.6 && !this.swimming) {
        sfxLand(w.surfaceAt(this.pos.x, this.pos.z), clamp01((-fallV - 2.0) / 11));
      }
      this.onGround = true;
    } else if (this.pos.y - g > 0.04) {
      this.onGround = false;
    }

    /* the knees give, then push back */
    this.landV += (-this.land * 85 - this.landV * 13) * dt;
    this.land += this.landV * dt;
    this.land = clamp(this.land, -0.42, 0.08);

    const planar = Math.hypot(this.vel.x, this.vel.z);
    const want2 = sprint ? 80 : (this.crouch > 0.5 ? 62 : 70);
    this.fov += (want2 - this.fov) * Math.min(1, 5 * dt);
    this.lean += ((this.onGround ? -ax * 0.022 : 0) - this.lean) * Math.min(1, 6 * dt);
    /* how hard you are driving forward, which is what decides the lean */
    this.push += (clamp01(az) * clamp01(planar / 4) - this.push) * Math.min(1, 5 * dt);

    /* Into the water, and out of it again. */
    if (this.swimming !== this.wasSwimming) {
      sfxSplash(this.swimming ? 0.9 : 0.5);
      this.wasSwimming = this.swimming;
    }

    /* How hard he is working, which is all the breathing needs to know.
       Swimming is harder than it looks, and a walk is not nothing. */
    sfxBreath(dt, this.swimming
      ? 0.5 + clamp01(planar / 3.4) * 0.35
      : clamp01(planar / 8.4) * (sprint ? 1 : 0.40));

    this.sprinting = sprint && planar > 4;
    this.animate(dt, planar);
    setSprinting(this.sprinting);
  }

  animate(dt, planar) {
    const r = this.rig;
    this.time += dt;

    /* Which way he is actually travelling. The raw velocity direction
       whips round in two or three frames when you let go of one key and
       press another, and a foot aimed at a direction that snapped lands
       somewhere that makes no sense. */
    if (planar > 0.25) {
      const k = Math.min(1, 9 * dt);
      this.dir.x += (this.vel.x / planar - this.dir.x) * k;
      this.dir.z += (this.vel.z / planar - this.dir.z) * k;
      const m = Math.hypot(this.dir.x, this.dir.z);
      if (m > 1e-4) { this.dir.x /= m; this.dir.z /= m; }
    }

    /* ---- which way the lower body faces ----
       It follows where he is looking, turned towards where he is going by
       up to about forty-five degrees - which is what a person does, since
       the hips lead into a side-step rather than staying square. The turn
       is then rate-limited: a flick of the mouse twists the torso and the
       feet step round after it, instead of the whole body snapping while
       the soles slide along the ground to catch up. */
    const moving = planar > 0.5 && this.amp > 0.12;
    const travel = Math.atan2(-this.dir.x, -this.dir.z);
    let goal = this.yaw;
    if (moving && !this.swimming) {
      goal = this.yaw + clamp(wrapPi(travel - this.yaw), -0.80, 0.80);
    }
    const off = wrapPi(goal - this.bodyYaw);
    /* the further out of line he is, the harder he turns to catch up */
    const rate = (moving ? 7.5 : 5.5) * (1 + Math.min(2.2, Math.abs(off) * 1.9));
    this.bodyYaw = wrapPi(this.bodyYaw
      + clamp(off * Math.min(1, 10 * dt), -rate * dt, rate * dt));

    /* up at seven a second, down at fourteen: a landing should be over
       with before the next step, a launch should not look twitchy */
    const wantAir = this.onGround || this.swimming ? 0 : 1;
    this.air += (wantAir - this.air) * Math.min(1, (wantAir ? 7 : 14) * dt);
    const swing = swingFor(planar, this.onGround);
    this.amp += (swing.amp - this.amp) * Math.min(1, 7 * dt);
    this.run += (swing.run - this.run) * Math.min(1, 5 * dt);

    /* The stride, and how much of one is showing. Both come out of
       gait.js so that the figure you are driving and the figures other
       people are driving cannot walk differently - see the note there
       for why the numbers are what they are. */
    const stride = strideFor(planar);
    this.cycle = stride.cycle;
    this.duty = stride.duty;
    if (this.onGround && !this.swimming) {
      /* Keep the phase turning a little while the stride amplitude decays,
         so that stopping lets the swinging foot finish its step instead of
         freezing it in mid-air. */
      this.cyc += Math.max(planar, this.amp * 1.4) * dt / this.cycle;
    } else this.cyc += dt * 0.35;
    this.cyc %= 1;

    const st = this._st;
    st.dt = dt;
    st.vy = this.vel.y;
    /* what the chest has to make up for the hips lagging the view, and
       how far the toes turn towards where he is going */
    st.twist = wrapPi(this.yaw - this.bodyYaw);
    st.footYaw = moving
      ? clamp(wrapPi(travel - this.bodyYaw), -0.70, 0.70) * 0.55
      : 0;
    st.time = this.time;
    st.cyc = this.cyc;
    st.cycle = this.cycle;
    st.duty = this.duty;
    st.amp = this.amp;
    st.run = this.run;
    st.air = this.air;
    st.land = this.land;
    st.crouch = this.crouch;
    st.swim = this.swim;
    st.push = this.push;
    st.pitch = this.pitch;
    st.turn = this.yawRate;
    st.pitchRate = this.pitchRate;
    st.fp = this.mode === 0 ? 1 : 0;
    st.grip = 0.07;
    st.px = this.pos.x;
    st.pz = this.pos.z;
    st.fwdX = -Math.sin(this.bodyYaw);
    st.fwdZ = -Math.cos(this.bodyYaw);
    st.rightX = -st.fwdZ;
    st.rightZ = st.fwdX;
    st.dirX = this.amp > 0.05 ? this.dir.x : st.fwdX;
    st.dirZ = this.amp > 0.05 ? this.dir.z : st.fwdZ;
    st.k5 = Math.min(1, 5 * dt);
    st.k6 = Math.min(1, 6 * dt);
    st.k8 = Math.min(1, 8 * dt);
    st.k9 = Math.min(1, 10 * dt);

    r.root.position.copy(this.pos);
    r.root.rotation.y = this.bodyYaw;
    r.pose(st);

    /* Whatever the rig says went down this frame. Swimming has its own
       noise and no boots in it. */
    if (r.stepped) {
      r.stepped = 0;
      if (!this.swimming && this.onGround) {
        const x = r.stepAt.x, z = r.stepAt.z;
        const force = clamp01(0.14 + planar / 7.2) * (1 - this.crouch * 0.55);
        sfxFoot(this.world.surfaceAt(x, z), force, this.world.wetAt(x, z));
      }
    }
  }

  updateCamera(cam, dt, snap) {
    if (this.mode === 0) {
      this.rig.eye(this._a);
      /* The eye comes off the head bone, so it already carries the sway, the
         breathing and the knee give for free. The hips also rise and fall a
         few centimetres a step, which is right for the body and far too much
         for a view, so the camera keeps only a share of that part. */
      this._a.y -= this.rig.gaitY * (1 - FP_BOB);
      if (this.swimming) this._a.y = Math.min(this._a.y, WATER + 0.34);
      /* a short spring on the eye only: it cannot be felt, and it absorbs
         any single-frame jolt the rig might hand over */
      const k = snap || !this.hasEye ? 1 : 1 - Math.exp(-dt / 0.018);
      this.camEye.lerp(this._a, k);
      this.hasEye = true;
      cam.position.copy(this.camEye);
      this._e.set(this.pitch, this.yaw, this.lean);
      cam.quaternion.setFromEuler(this._e);
    } else {
      const eye = this.pos.y + this.eyeHeight();
      const cp = Math.cos(-this.pitch);
      const off = this._a.set(
        Math.sin(this.yaw) * cp, Math.sin(-this.pitch) + 0.12, Math.cos(this.yaw) * cp
      ).multiplyScalar(this.camDist);
      const focus = this._c.set(this.pos.x, eye - 0.22, this.pos.z);
      const want = this._b.copy(focus).add(off);
      const floor = this.world.groundAt(want.x, want.z) + 0.6;
      if (want.y < floor) want.y = floor;
      if (snap) cam.position.copy(want);
      else cam.position.lerp(want, 1 - Math.pow(0.0009, dt));
      cam.lookAt(focus);
      this.hasEye = false;
    }

    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov += (this.fov - cam.fov) * 0.5;
      cam.updateProjectionMatrix();
    }
  }

  setMode(m, cam) {
    this.mode = m;
    if (m === 0) cam.layers.disable(HEAD_LAYER);
    else cam.layers.enable(HEAD_LAYER);
    this.hasEye = false;
    setThirdPerson(m === 1);
  }

  /* Everything anybody else needs to draw this figure. The world is
     not in here because the world never travels - it comes out of the
     same constants in their browser as in yours - and neither is the
     animation, which is worked out again at their end from these. */
  describe(out) {
    out.x = this.pos.x; out.y = this.pos.y; out.z = this.pos.z;
    out.bodyYaw = this.bodyYaw;
    out.yaw = this.yaw;
    out.pitch = this.pitch;
    out.speed = Math.hypot(this.vel.x, this.vel.z);
    out.cyc = this.cyc;
    out.onGround = this.onGround;
    out.swimming = this.swimming;
    out.crouch = this.crouch;
    out.sprinting = this.sprinting;
    return out;
  }

  heading() {
    const deg = ((-this.yaw * 180 / Math.PI) % 360 + 360) % 360;
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
  }
}
export {
  SPAWN, FP_BOB, EYE, Player,
};
