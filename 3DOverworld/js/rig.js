/* ============================================================
   The animation half: the gait, the two-bone solver that puts a
   foot where it is wanted, and the pose that everything else is
   layered onto. No clips - every frame is computed.
   ============================================================ */

import * as THREE from "three";
import { ANKLE, AXIS_X, AXIS_Y, AXIS_Z, B, BONE, FINGERS, HEAD_LAYER, SLACK, T2, buildBody } from "./character.js";
import { AHEAD } from "./gait.js";
import { buildHead } from "./head.js";
import { TEX, bodyMaterial } from "./materials.js";
import { clamp, clamp01, lerp, normalAt } from "./terrain.js";

/* Scratch, so that posing allocates nothing. The solver keeps a set of its
   own: callers hand it vectors out of _p, and one shared pool would have it
   overwrite the very target it was asked to reach. */
const _p = [], _s = [];
for (let i = 0; i < 12; i++) { _p.push(new THREE.Vector3()); _s.push(new THREE.Vector3()); }
const _aimv = new THREE.Vector3();
const _r = [];
for (let i = 0; i < 6; i++) _r.push(new THREE.Vector3());
const _rq = new THREE.Quaternion();
const _rma = new THREE.Matrix4(), _rmb = new THREE.Matrix4();
const _qa = new THREE.Quaternion();
const _sq = new THREE.Quaternion(), _sqb = new THREE.Quaternion();
const _mt = new THREE.Matrix4();
const _sm = new THREE.Matrix4(), _smb = new THREE.Matrix4();

/* the face, the hair and everything hung on them: hidden from your own
   eyes, because you are inside the head they are attached to */
const HEAD_PARTS = ["face", "hair", "brow", "eye"];

/* ------------------------------------------------------------
   The meshes are built once and then shared.

   Every rig gets bones and a skeleton of its own, but the geometry
   and the materials are the same for everybody - and rebuilding the
   face sculpt for each person who walks past would cost a good
   fraction of a second each, which is a stutter every time somebody
   joins. A SkinnedMesh keeps its bind matrix on itself rather than on
   the geometry, so sharing it is safe.
   ------------------------------------------------------------ */
let _parts = null;
function bodyParts() {
  if (!_parts) {
    const head = buildHead();
    const ghostGeo = head.ghostGeo;
    const worn = Object.assign({}, head);
    delete worn.ghostGeo;
    _parts = { parts: Object.assign(buildBody(), worn), ghostGeo };
  }
  return _parts;
}

/* Z then X then Y: abduct away from the body, swing fore and aft, then
   twist along the limb. Taking them in a fixed order of my own keeps the
   angles meaning the same thing whatever the figure is doing. */
function setZXY(q, rz, rx, ry) {
  q.setFromAxisAngle(AXIS_Z, rz);
  _qa.setFromAxisAngle(AXIS_X, rx); q.multiply(_qa);
  _qa.setFromAxisAngle(AXIS_Y, ry); q.multiply(_qa);
}

class Rig {
  /* `opts.remote` builds a rig for somebody else rather than for you:
     their head is on the ordinary layer because you are looking at it
     from outside, and they need no colour-less stand-in to cast the
     head shadow you cannot see. */
  constructor(scene, opts) {
    const remote = !!(opts && opts.remote);
    const bones = BONE.map(() => new THREE.Bone());
    BONE.forEach(([name, parent, x, y, z], i) => {
      bones[i].name = name;
      if (parent < 0) bones[i].position.set(x, y, z);
      else {
        bones[i].position.set(x - BONE[parent][2], y - BONE[parent][3], z - BONE[parent][4]);
        bones[parent].add(bones[i]);
      }
    });
    this.bones = bones;
    this.rest = bones.map((b) => b.position.clone());

    this.root = new THREE.Group();
    this.turn = new THREE.Group();
    this.turn.rotation.y = Math.PI;          /* forward is -Z out here */
    this.root.add(this.turn);
    this.turn.add(bones[0]);
    scene.add(this.root);
    this.root.updateMatrixWorld(true);

    this.skeleton = new THREE.Skeleton(bones);
    const { parts, ghostGeo } = bodyParts();
    this.mesh = {};
    for (const key in parts) {
      const m = new THREE.SkinnedMesh(parts[key].geo, parts[key].mat);
      m.castShadow = true;
      m.receiveShadow = true;
      /* a posed limb reaches outside the bounds of the bind pose, and one
         character is not worth a culling bug over */
      m.frustumCulled = false;
      this.turn.add(m);
      m.bind(this.skeleton);
      this.mesh[key] = m;
    }

    /* The head is hidden from your own eyes, and a stand-in that writes no
       colour keeps your shadow from being headless. It is a plain skull at
       a fortieth of the face's density: a shadow needs an outline, and
       this one is drawn from the sun's side every frame as well. */
    if (remote) {
      /* their face is the whole point of looking at them */
      for (const k of HEAD_PARTS) this.mesh[k].castShadow = false;
    } else {
      for (const k of HEAD_PARTS) {
        this.mesh[k].layers.set(HEAD_LAYER);
        this.mesh[k].castShadow = false;
      }
      const ghost = new THREE.SkinnedMesh(ghostGeo,
        bodyMaterial(TEX.skin, "ghost", { hide: true }));
      ghost.castShadow = true;
      ghost.frustumCulled = false;
      this.turn.add(ghost);
      ghost.bind(this.skeleton);
      this.mesh.ghost = ghost;
    }

    /* Limb lengths and reach, read off the bind pose rather than written
       down a second time where they could drift out of step with it. A
       bone's own position IS the length of the bone above it. */
    const len = (n) => this.rest[B[n]].length();
    this.legA = len("shinL"); this.legB = len("footL");
    this.armA = len("loArmL"); this.armB = len("handL");
    this.legR = this.legA + this.legB;
    /* which way each bone points when nothing is rotated */
    this.footDir = this.rest[B.toeL].clone().normalize();
    this.handDir = this.rest[B.fmL].clone().normalize();
    /* arm targets are authored as absolute bind coordinates, so keep those
       around to convert them into the space the solver works in */
    this.abs = BONE.map((b) => new THREE.Vector3(b[2], b[3], b[4]));

    /* per-foot gait bookkeeping */
    this.feet = [-1, 1].map((s) => ({
      s, plant: new THREE.Vector3(), next: new THREE.Vector3(),
      at: new THREE.Vector3(), from: new THREE.Vector3(),
      stance: true, pitch: 0, slope: 0, set: false, sh: 0,
    }));
    this.hipDrop = 0; this.hipY0 = this.rest[B.hips].y;
    this.hLag = 0; this.hLagY = 0; this.headLag = 0;
    this.vm = 1;
    this.gaitY = 0;
    this._hipW = new THREE.Vector3();
    /* Which foot went down this frame, and where. The rig is the only
       thing that knows the moment a boot touches, so it says so rather
       than having movement guess from the phase - a sound half a frame
       off the picture is a sound you notice. */
    this.stepped = 0;
    this.stepAt = new THREE.Vector3();
    /* when the next blink is due, and how far through one he is */
    this.blinkT = 1.4; this.blinkPh = 0;
  }

  /* --- aim a bone so that `bind` (its own rest direction) points along
         `want` (given in the bone's parent space) --- */
  aim(bone, bind, want) {
    _aimv.copy(want);
    if (_aimv.lengthSq() < 1e-10) return;
    bone.quaternion.setFromUnitVectors(bind, _aimv.normalize());
  }

  /* --- Aim a bone by a whole frame instead of one direction: for a hand,
         which way the fingers point AND which way the palm faces.
         Aiming only the finger direction leaves the roll to whatever the
         shortest rotation happens to be, and the shortest rotation put the
         palm edge-on to the eye - four fingers lined up one behind the
         other, which renders as a mitten however well they are modelled. */
  roll(bone, bindF, bindU, wantF, wantU) {
    const f1 = _r[0].copy(bindF).normalize();
    const u1 = _r[1].copy(bindU);
    u1.addScaledVector(f1, -u1.dot(f1)).normalize();
    _rma.makeBasis(u1, _r[2].crossVectors(f1, u1), f1);
    const f2 = _r[3].copy(wantF);
    if (f2.lengthSq() < 1e-10) return;
    f2.normalize();
    const u2 = _r[4].copy(wantU);
    u2.addScaledVector(f2, -u2.dot(f2));
    if (u2.lengthSq() < 1e-8) u2.set(0, 1, 0).addScaledVector(f2, -f2.y);
    u2.normalize();
    _rmb.makeBasis(u2, _r[5].crossVectors(f2, u2), f2);
    _rq.setFromRotationMatrix(_rma).invert();
    bone.quaternion.setFromRotationMatrix(_rmb).multiply(_rq);
  }

  /* --- two-bone IK. `target` and `pole` are in the up bone's parent
         space. Both the thigh and the upper arm go through here. --- */
  solve(up, lo, target, pole, L1, L2) {
    const o = _s[0].copy(up.position);
    const v = _s[1].subVectors(target, o);
    let d = v.length();
    if (d < 1e-5) { v.set(0, -1, 0); d = 1e-5; }
    const aim = _s[2].copy(v).divideScalar(d);
    const dc = clamp(d, Math.abs(L1 - L2) + 0.015, (L1 + L2) * 0.998);

    const a = Math.acos(clamp((L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc), -1, 1));

    /* the plane the limb bends in: anything not parallel to the aim will do */
    const ax = _s[3].crossVectors(pole, aim);
    if (ax.lengthSq() < 1e-7) ax.crossVectors(AXIS_Y, aim);
    if (ax.lengthSq() < 1e-7) ax.copy(AXIS_X);
    ax.normalize();

    /* Swing the first bone off the straight line, to whichever side of it
       the pole is on - so a knee bends forward and an elbow bends back
       without either depending on which way round a cross product came
       out. Cheaper to test than to reason about, and it cannot be wrong. */
    const td = _s[4].copy(aim).applyQuaternion(_sq.setFromAxisAngle(ax, a));
    const perp = _s[5].copy(td).addScaledVector(aim, -td.dot(aim));
    if (perp.dot(pole) < 0) {
      td.copy(aim).applyQuaternion(_sq.setFromAxisAngle(ax, -a));
    }

    /* The first bone, written as a frame: its own -Y along the limb, its X
       on the bend axis. Building the frame rather than composing angles
       means the sign conventions cannot come out wrong. */
    const yA = _s[6].copy(td).negate();
    const xA = _s[7].copy(ax).addScaledVector(yA, -ax.dot(yA)).normalize();
    const zA = _s[8].crossVectors(xA, yA);
    up.quaternion.setFromRotationMatrix(_sm.makeBasis(xA, yA, zA));

    /* The second bone spans from the elbow or knee to wherever the target
       actually is, so a target out of reach simply straightens the limb
       instead of tearing it off. */
    const mid = _s[9].copy(o).addScaledVector(td, L1);
    const kd = _s[10].subVectors(target, mid);
    if (kd.lengthSq() < 1e-10) kd.copy(td);
    kd.normalize();
    const yB = _s[11].copy(kd).negate();
    const xB = _s[0].copy(xA).addScaledVector(yB, -xA.dot(yB));
    if (xB.lengthSq() < 1e-7) xB.copy(AXIS_X).addScaledVector(yB, -AXIS_X.dot(yB));
    xB.normalize();
    _sqb.setFromRotationMatrix(_smb.makeBasis(xB, yB, _s[1].crossVectors(xB, yB)));
    lo.quaternion.copy(up.quaternion).invert().multiply(_sqb);
  }

  pose(st) {
    const bn = this.bones;
    for (let i = 0; i < bn.length; i++) bn[i].quaternion.identity();

    const amp = st.amp, run = st.run, ph = st.cyc * T2;
    const crouch = st.crouch, air = st.air;

    /* ---- hips: the sway, the drop and the rise of a stride ---- */
    const sway = Math.sin(ph) * 0.020 * amp;
    const rise = (0.5 - 0.5 * Math.cos(ph * 2)) * 0.030 * amp;
    const idle = Math.sin(st.time * 0.62) * 0.008 + Math.sin(st.time * 0.41) * 0.005;
    const hips = bn[B.hips];
    /* The nominal hip height. legs() may lower it further if the stride has
       outrun the legs, which is why it is remembered rather than applied
       twice - subtracting the drop here as well cost half a crouch. */
    this.hipY0 = this.rest[B.hips].y - SLACK + rise - crouch * 0.34 + st.land * 0.9 - air * 0.03;
    /* what of the hip height came from the stride, so the camera can take
       only a share of it: the body should bob, the view much less */
    this.gaitY = rise;
    hips.position.set(
      this.rest[B.hips].x + sway + idle * (1 - amp),
      this.hipY0,
      this.rest[B.hips].z);

    setZXY(hips.quaternion,
      -Math.sin(ph) * 0.070 * amp,
      crouch * 0.16 + air * 0.08,
      -Math.sin(ph) * 0.150 * amp);

    /* ---- spine: lean into the run, fold up in a crouch, and breathe ----

       The lower body goes where the feet are taking him; the chest turns
       to face where he is looking. The difference between the two is the
       twist, and the three joints below share all of it - the shares add
       up to exactly one, which is what leaves the head, and so the eye,
       and so the hands, aimed along the view. Without it a flick of the
       mouse spins the whole body on the spot and the soles skate round
       after it. */
    const tw = clamp(st.twist, -0.95, 0.95);
    const breath = Math.sin(st.time * 1.55) * 0.010 * (1 - amp * 0.5);
    const lean = 0.045 + run * 0.150 + crouch * 0.300 + st.push * 0.055;
    /* and lean into a turn, the way anybody carrying speed does */
    const bank = clamp(st.turn * 0.030, -0.085, 0.085) * clamp01(amp * 1.4);
    setZXY(bn[B.spine].quaternion, bank * 0.45, lean * 0.5 + breath * 0.4, tw * 0.22);
    setZXY(bn[B.chest].quaternion,
      Math.sin(ph) * 0.030 * amp + bank * 0.55,
      lean * 0.5 + breath * 0.6,
      Math.sin(ph) * 0.170 * amp + tw * 0.46);
    setZXY(bn[B.neck].quaternion, 0, -lean * 0.45, tw * 0.32);

    /* ---- head ---- */
    this.headLag += (clamp(st.turn * 0.060, -0.30, 0.30) - this.headLag) * st.k8;
    setZXY(bn[B.head].quaternion, 0,
      -st.pitch * 0.50 - lean * 0.30 + Math.sin(ph * 2) * 0.010 * amp,
      this.headLag);

    this.face(st, run);

    /* ---- arms ---- */
    this.vm += (st.fp - this.vm) * st.k5;
    this.hLag += (clamp(-st.turn * 0.055, -0.13, 0.13) - this.hLag) * st.k6;
    this.hLagY += (clamp(st.pitchRate * 0.014, -0.05, 0.05) - this.hLagY) * st.k6;
    for (const s of [-1, 1]) {
      const L = s < 0 ? "L" : "R";
      const sw = Math.sin(ph + (s < 0 ? Math.PI : 0));
      const fwd = Math.max(0, -sw);

      /* hanging at the side, swinging against the opposite leg */
      const tx = s * (0.196 + 0.016 * amp);
      const ty = 0.902 + amp * 0.022 + fwd * amp * 0.058;
      const tz = 0.020 - sw * 0.200 * amp;

      /* Carried out where you can see them, pumping harder the faster you
         go. Set from the eye rather than from taste: 0.46 out in front and
         0.17 below puts them 25 degrees under the middle of a 70 degree
         view, which is the lower third of the screen. Reaching further out
         also matters for its own sake - held closer, the forearms are a
         quarter of a metre from the lens and fill half the frame.
         Measured from the eye, so when the eye moved up to the pupil
         height this had to move with it or the hands slid off the
         bottom of the screen. */
      const cx = s * (0.150 + 0.018 * run) - this.hLag * s * 0.4 + this.hLag;
      const cy = 1.453 + run * 0.055 - sw * 0.050 * amp - rise * 0.5 + this.hLagY;
      const cz = 0.455 + run * 0.030 + fwd * 0.040 * amp - Math.abs(sw) * 0.030 * amp * run;

      const w = this.vm;
      _p[0].set(tx + (cx - tx) * w, ty + (cy - ty) * w, tz + (cz - tz) * w);
      /* In the air they come up and out. Nobody jumps with their arms
         hanging, and a figure that does reads as a dropped puppet. */
      if (air > 0.001) {
        _p[0].x += s * air * (0.055 + 0.030 * w);
        _p[0].y += air * (0.150 - 0.070 * w) - st.land * 0.30;
        _p[0].z += air * (0.035 - 0.080 * w);
      }
      if (st.swim > 0.01) {
        /* a stroke that sweeps out and round, arms leading */
        const k = Math.sin(st.time * 2.1), j = Math.cos(st.time * 2.1);
        _p[1].set(s * (0.150 + 0.170 * (1 - k)), 1.462 + j * 0.080, 0.300 + k * 0.230);
        _p[0].lerp(_p[1], st.swim);
      }
      /* into the clavicle's space, which is where solve() wants it */
      _p[0].sub(this.abs[B["clav" + L]]);

      /* The elbow hangs down and back in both poses. A pole only says which
         way the joint bulges off the straight line, so one serves for an arm
         held out in front and an arm hanging at the side alike. Mostly down
         rather than out: pointing it sideways wings the elbows out level
         with the shoulders, which from the inside looks like chicken wings. */
      _p[2].set(s * 0.20, -0.92, -0.34).normalize();
      this.solve(bn[B["upArm" + L]], bn[B["loArm" + L]], _p[0], _p[2], this.armA, this.armB);

      /* the wrist, aimed rather than angled, so it holds still while the
         elbow does whatever the solver decided */
      _qa.copy(bn[B["upArm" + L]].quaternion).multiply(bn[B["loArm" + L]].quaternion).invert();
      /* fingers forward and down when carried, straight down at the side
         otherwise; palm turned down in front of you and inward at rest */
      _p[3].set(s * (0.04 - 0.24 * w), -1 + 0.56 * w, 0.06 + 0.82 * w)
        .normalize().applyQuaternion(_qa);
      _p[4].set(-s * (1 - w), -w, 0).normalize().applyQuaternion(_qa);
      this.roll(bn[B["hand" + L]], this.handDir, _p[5].set(-s, 0, 0), _p[3], _p[4]);

      /* fingers: loosely closed, tighter at a sprint */
      const grip = clamp01(st.grip + run * 0.22);
      const digits = FINGERS[s];
      for (let f = 0; f < 4; f++) {
        const c = (0.10 + f * 0.035) + grip * (0.70 + f * 0.08);
        bn[digits[f][0]].rotation.z = -s * c;
        bn[digits[f][1]].rotation.z = -s * (c * 1.38);
        /* a little splay, or four touching cylinders read as a mitten */
        bn[digits[f][0]].rotation.x = (f - 1.5) * 0.15;
      }
      setZXY(bn[digits[4][0]].quaternion, -s * (0.16 + grip * 0.34), -0.22 - grip * 0.18, 0);
      bn[digits[4][1]].rotation.z = -s * (0.22 + grip * 0.40);

      /* shoulders shrug up a little when the arms come up */
      setZXY(bn[B["clav" + L]].quaternion,
        s * (0.04 + w * 0.16), -w * 0.10 - fwd * 0.05 * amp - air * 0.10, 0);
    }

    /* ---- legs ---- */
    if (st.swim > 0.5) {
      const k = Math.sin(st.time * 3.4);
      for (const s of [-1, 1]) {
        const L = s < 0 ? "L" : "R";
        const d = s < 0 ? k : -k;
        bn[B["thigh" + L]].rotation.x = -0.10 + d * 0.30;
        bn[B["shin" + L]].rotation.x = 0.34 - d * 0.30;
        bn[B["foot" + L]].rotation.x = 0.30;
      }
      /* tip the whole body forward about the hips, in the parent's frame
         rather than the hips' own, so the lean does not come out twisted */
      hips.quaternion.premultiply(_qa.setFromAxisAngle(AXIS_X, 1.02 * st.swim));
      hips.position.y = this.hipY0 - 0.40 * st.swim;
      this.root.updateMatrixWorld(true);
      return;
    }
    this.root.updateMatrixWorld(true);
    this.legs(st);
    this.root.updateMatrixWorld(true);
  }

  /* ---- the face ----
     A blink every few seconds, quick down and slower up, and the mouth
     open a crack more the harder he is working. A face that never blinks
     is the shortest road to a dead one. */
  face(st, run) {
    const bn = this.bones;
    this.blinkT -= st.dt;
    if (this.blinkT <= 0 && this.blinkPh === 0) {
      this.blinkT = 2.1 + Math.random() * 4.4;
      this.blinkPh = 1e-4;
    }
    let close = 0;
    if (this.blinkPh > 0) {
      this.blinkPh += st.dt / 0.145;
      if (this.blinkPh >= 1) this.blinkPh = 0;
      /* shutting takes a third of the time that opening again does */
      else close = this.blinkPh < 0.34
        ? this.blinkPh / 0.34
        : 1 - (this.blinkPh - 0.34) / 0.66;
    }
    /* 0.88 is what it takes for the upper margin to reach the lower one */
    const lid = close * 0.88 + run * 0.09 + clamp01(st.pitch * 0.5) * 0.07;
    bn[B.lidL].rotation.x = lid;
    bn[B.lidR].rotation.x = lid;
    /* he breathes through his mouth when he is running */
    const pant = Math.max(0, Math.sin(st.time * 5.4)) * run * 0.042;
    bn[B.jaw].rotation.x = 0.008 + pant + st.crouch * 0.006;
  }

  legs(st) {
    const bn = this.bones;
    const reach = this.legR * 0.985;
    this._hipW.setFromMatrixPosition(bn[B.hips].matrixWorld);

    /* pass one: where each foot wants to be, and whether the hips have to
       give way for the leg to get there */
    let need = 0;
    for (const f of this.feet) {
      this.footTarget(f, st);
      const hip = _p[0].setFromMatrixPosition(bn[B[f.s < 0 ? "thighL" : "thighR"]].matrixWorld);
      need = Math.max(need, hip.distanceTo(f.at) - reach);
    }
    /* In the air the legs are holding nothing up, so there is nothing for
       the hips to give way to. Left in, it sank him a quarter of a metre
       through every jump with both legs hanging straight down. */
    const fall = (1 - st.air) * (1 - st.air);
    const want = clamp(need, 0, 0.26) * fall;
    this.hipDrop += (want - this.hipDrop) * st.k9;
    this.gaitY -= this.hipDrop;
    if (this.hipDrop > 1e-4) {
      bn[B.hips].position.y = this.hipY0 - this.hipDrop;
      this.root.updateMatrixWorld(true);
    }

    /* pass two: solve, then plant the sole on the slope it is standing on */
    _mt.copy(bn[B.hips].matrixWorld).invert();
    for (const f of this.feet) {
      const L = f.s < 0 ? "L" : "R";
      const thigh = bn[B["thigh" + L]], shin = bn[B["shin" + L]], foot = bn[B["foot" + L]];
      _p[1].copy(f.at).applyMatrix4(_mt);
      _p[2].set(f.s * 0.14, 0.10, 1).normalize();
      this.solve(thigh, shin, _p[1], _p[2], this.legA, this.legB);

      /* The foot's heading, in the hips' space: turned towards where he is
         actually travelling, pitched by the slope under it and by where it
         is in the step. The toe-out is a yaw like the rest, not a sideways
         nudge of the direction vector. */
      const pit = f.pitch + f.slope;
      const yw = st.footYaw + f.s * 0.085;
      const cp = Math.cos(pit);
      _p[3].set(Math.sin(yw) * cp, Math.sin(pit), Math.cos(yw) * cp).normalize();
      _qa.copy(thigh.quaternion).multiply(shin.quaternion).invert();
      this.aim(foot, this.footDir, _p[3].applyQuaternion(_qa));
      /* the toes bend back over as the heel comes up to push off */
      bn[B["toe" + L]].rotation.x = -Math.max(0, -f.pitch) * 0.55;
    }
  }

  /* Keep a foot on its own side of the body.

     A foot that has wandered across the midline is the one thing that
     makes a change of direction look properly wrong: the legs scissor,
     the knees collide and the hips twist to follow. Slam a sprint into
     reverse and the old code crossed them over by two thirds of a metre
     in more than half the frames of the turn. */
  keepSide(f, st, p) {
    const ex = p.x - st.px, ez = p.z - st.pz;
    const lat = ex * st.rightX + ez * st.rightZ;
    const lo = f.s > 0 ? 0.072 : -0.430;
    const hi = f.s > 0 ? 0.430 : -0.072;
    const d = clamp(lat, lo, hi) - lat;
    if (d === 0) return;
    p.x += st.rightX * d;
    p.z += st.rightZ * d;
  }

  /* Where this foot is heading for, worked out afresh every frame of the
     swing rather than once at lift-off: a step committed on the way up is
     a step into where he was going a third of a second ago. */
  swingSpot(f, st, t, out) {
    const togo = (1 - t) * (1 - st.duty) * st.cycle;
    const ahead = togo + Math.min(AHEAD, st.duty * st.cycle * 0.5);
    out.set(
      st.px + st.dirX * ahead + st.rightX * f.s * 0.100, 0,
      st.pz + st.dirZ * ahead + st.rightZ * f.s * 0.100);
    this.keepSide(f, st, out);
    out.y = st.ground(out.x, out.z);
    return out;
  }

  /* The feet, when he is off the ground: they come up under him instead
     of reaching for a floor a metre and a half below. */
  airTarget(f, st, out) {
    const up = clamp01(st.vy / 5.5), down = clamp01(-st.vy / 6.5);
    /* one leg leads, so he is not a frog */
    const lead = f.s * 0.055 + Math.sin(st.cyc * T2) * 0.045;
    const fw = 0.055 + up * 0.230 - down * 0.040 + lead;
    const dn = this.legR * (0.620 + down * 0.330 - up * 0.075);
    const lat = f.s * 0.100;
    out.set(
      this._hipW.x + st.fwdX * fw + st.rightX * lat,
      this._hipW.y - dn,
      this._hipW.z + st.fwdZ * fw + st.rightZ * lat);
    /* toes down off the ground, up again to meet it */
    f.pitch += ((down * 0.260 - up * 0.300) - f.pitch) * st.k8 * st.air;
    return out;
  }

  /* the foot that is not this one - posing allocates nothing, so this is
     not a place for a closure */
  other(f) {
    return this.feet[0] === f ? this.feet[1] : this.feet[0];
  }

  footTarget(f, st) {
    const duty = st.duty;
    const u = (st.cyc + (f.s < 0 ? 0 : 0.5)) % 1;
    const uu = u < 0 ? u + 1 : u;
    const stance = uu < duty;

    /* where a foot would rest if you were just standing there */
    const rx = st.px + st.rightX * f.s * 0.105, rz = st.pz + st.rightZ * f.s * 0.105;
    const ry = st.ground(rx, rz);
    const ank = ANKLE;

    if (st.amp < 0.02) {
      /* ---- standing ----
         Turning on the spot, a planted foot stays planted until it is too
         far from where it ought to be, and then it takes one short step
         rather than sliding there. One foot at a time, or he skates. */
      const want = _p[0].set(rx, ry + ank, rz);
      if (!f.set) {
        /* the very first pose has nowhere to ease from, and easing out of
           the world origin would crouch him through the loading screen */
        f.at.copy(want); f.plant.set(rx, ry, rz); f.next.copy(f.plant); f.set = true;
      }
      if (f.sh > 0) {
        f.sh -= st.dt / 0.26;
        if (f.sh <= 0) {
          f.sh = 0; f.at.copy(want); f.plant.set(rx, ry, rz); f.pitch = 0;
          this.stepped = f.s;
          this.stepAt.copy(f.plant);
        } else {
          const t = 1 - f.sh;
          const e = t * t * (3 - 2 * t);
          f.at.lerpVectors(f.from, want, e);
          f.at.y += Math.sin(Math.PI * t) * 0.032;
          f.pitch = Math.sin(Math.PI * t) * 0.20;
        }
      } else if (f.at.distanceTo(want) > 0.085 && this.other(f).sh <= 0) {
        f.sh = 1; f.from.copy(f.at);
      } else {
        /* the weight shifts about a little, but the sole does not slide */
        f.at.lerp(want, st.k5 * 0.30);
        f.pitch += (0 - f.pitch) * st.k8;
        f.plant.set(rx, ry, rz);
      }
      f.next.copy(f.plant);
      f.stance = true;
      normalAt(f.at.x, f.at.z, _p[1]);
      f.slope += (Math.atan2(-(_p[1].x * st.fwdX + _p[1].z * st.fwdZ), _p[1].y) - f.slope) * st.k9;
      if (st.air > 0.002) { this.airTarget(f, st, _p[7]); f.at.lerp(_p[7], st.air); }
      return;
    }
    f.sh = 0;

    const t = stance ? 0 : clamp01((uu - duty) / (1 - duty));
    if (stance !== f.stance) {
      /* landing: the swing target becomes the thing it stands on */
      if (stance) {
        f.plant.copy(f.next);
        this.stepped = f.s;
        this.stepAt.copy(f.plant);
      } else this.swingSpot(f, st, 0, f.next);
      f.stance = stance;
    }

    if (stance) {
      const ts = clamp01(uu / duty);
      /* heel first, flat through the middle, up on the toe to push off */
      f.pitch = ts < 0.16 ? lerp(0.26, 0, ts / 0.16)
        : ts < 0.62 ? 0
          : lerp(0, -0.52 - st.run * 0.16, (ts - 0.62) / 0.38);
      const toe = Math.max(0, -f.pitch);
      f.at.set(f.plant.x, f.plant.y + ank + toe * 0.060, f.plant.z);
      normalAt(f.plant.x, f.plant.z, _p[1]);
    } else {
      /* the landing spot is re-aimed all the way through the swing, so a
         change of direction is absorbed by the step it happens during */
      this.swingSpot(f, st, t, _p[6]);
      f.next.lerp(_p[6], Math.min(1, 15 * st.dt));
      const e = t * t * (3 - 2 * t);
      f.pitch = t < 0.55 ? lerp(-0.52, 0.08, t / 0.55) : lerp(0.08, 0.26, (t - 0.55) / 0.45);
      const lift = Math.sin(Math.PI * Math.pow(t, 0.8)) * (0.085 + st.run * 0.115);
      f.at.set(
        lerp(f.plant.x, f.next.x, e),
        lerp(f.plant.y, f.next.y, e) + ank + lift,
        lerp(f.plant.z, f.next.z, e));
      normalAt(f.at.x, f.at.z, _p[1]);
    }
    /* pitch the sole to the hill it is on, in the direction the body faces */
    const wantS = Math.atan2(-(_p[1].x * st.fwdX + _p[1].z * st.fwdZ), _p[1].y);
    f.slope += (wantS - f.slope) * st.k8;

    /* the guarantee, applied last and to wherever the foot actually ended
       up: whatever the gait decided, it is not allowed to cross over */
    this.keepSide(f, st, f.at);

    if (st.air > 0.002) {
      this.airTarget(f, st, _p[7]);
      f.at.lerp(_p[7], st.air);
      /* and when he lands, the gait restarts from under him */
      f.plant.set(rx, ry, rz); f.next.copy(f.plant);
    }
  }

  /* Somebody left. Geometry and materials are shared between every rig
     built from the same build, so neither is disposed here - only the
     scene graph entry and this rig s own skeleton go. */
  dispose(scene) {
    scene.remove(this.root);
    this.skeleton.dispose();
    for (const k in this.mesh) this.mesh[k].skeleton = null;
    this.mesh = {};
  }

  eye(out) {
    return out.set(0, 0.099, 0.090).applyMatrix4(this.bones[B.head].matrixWorld);
  }
}
export {
  setZXY, Rig,
};
