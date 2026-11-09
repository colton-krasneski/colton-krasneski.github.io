/* ============================================================
   The animation: the gait, the two-bone solver that puts a foot
   where it is wanted, and the pose everything else is layered
   onto. No clips - every frame is computed, on the plain skeleton
   in character.js, and avatar.js copies the result across onto
   the figure you actually see.

   One foot, through one stride:
     the heel touches with the toes up, and the foot rocks down
     about the heel until it is flat;
     the body passes over it;
     the heel lifts and the foot rocks forward over the ball, the
     toes staying on the ground and bending;
     it leaves, folds up behind - a little at a walk, a lot at a
     run - swings through under the hip, reaches forward, and
     draws back a touch just before it lands.
   While a foot is down the ankle is never simply put somewhere:
   it is worked out from whichever point the foot is rocking over,
   which is what keeps a sole from sliding or sinking.

   Sides: "L" bones are at -X in the figure, and the figure faces
   +Z under a group turned half round, so in the world -X is the
   side st.right points to. Each foot is placed on its own side
   of that. (It used to be the other way round, which put every
   foot under the opposite hip: the shins crossed on every step.)
   ============================================================ */

import * as THREE from "three";
import { Avatar } from "./avatar.js";
import { ANKLE, AXIS_X, AXIS_Y, AXIS_Z, B, BALL, BONE, HEEL, SLACK, T2 } from "./character.js";
import { clamp, clamp01, lerp, normalAt } from "./terrain.js";

/* Scratch, so that posing allocates nothing. The solver keeps a set of its
   own: callers hand it vectors out of _p, and one shared pool would have it
   overwrite the very target it was asked to reach. */
const _p = [], _s = [];
for (let i = 0; i < 12; i++) { _p.push(new THREE.Vector3()); _s.push(new THREE.Vector3()); }
const _r = [];
for (let i = 0; i < 6; i++) _r.push(new THREE.Vector3());
const _rq = new THREE.Quaternion();
const _rma = new THREE.Matrix4(), _rmb = new THREE.Matrix4();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _qh = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const _sq = new THREE.Quaternion(), _sqb = new THREE.Quaternion();
const _mt = new THREE.Matrix4();
const _sm = new THREE.Matrix4(), _smb = new THREE.Matrix4();
const _fk = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function wrapPi(a) {
  while (a > Math.PI) a -= T2;
  while (a < -Math.PI) a += T2;
  return a;
}

/* Z then X then Y: abduct away from the body, swing fore and aft, then
   twist along the limb. Taking them in a fixed order of my own keeps the
   angles meaning the same thing whatever the figure is doing. */
function setZXY(q, rz, rx, ry) {
  q.setFromAxisAngle(AXIS_Z, rz);
  _qa.setFromAxisAngle(AXIS_X, rx); q.multiply(_qa);
  _qa.setFromAxisAngle(AXIS_Y, ry); q.multiply(_qa);
}

/* The line from the ankle to the ball points down this much when the
   foot is flat. A foot is aimed by that line, so a pitch of nothing
   has to aim it this far below level. */
const TOE_DROP = Math.atan2(BONE[B.toeL][3] - BONE[B.footL][3], BONE[B.toeL][4] - BONE[B.footL][4]);

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

    /* What the hands and the face are doing. The avatar reads these at
       the end of every pose: how far each finger is closed (thumb
       first), and how far each of the face's shapes is pulled. */
    this.curl = { "-1": [0, 0, 0, 0, 0], "1": [0, 0, 0, 0, 0] };
    this.blink = 0; this.squint = 0; this.mouth = 0;
    this.puff = 0; this.smile = 0; this.brow = 0;

    this.avatar = new Avatar(this, remote);
    this.mesh = this.avatar.meshes;
    this.root.updateMatrixWorld(true);

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
    /* The ankle sits a centimetre and a half behind the knee, so the shin
       is not quite plumb. The solver aims a bone's own axis; this turns
       that into aiming the line to the ankle, or every foot would land
       that far from where it was sent. */
    this.shinDir = this.rest[B.footL].clone().normalize();
    this.shinOff = new THREE.Quaternion().setFromUnitVectors(this.shinDir, new THREE.Vector3(0, -1, 0));
    this.shinLean = Math.atan2(this.shinDir.z, -this.shinDir.y);
    /* arm targets are authored as absolute bind coordinates, so keep those
       around to convert them into the space the solver works in */
    this.abs = BONE.map((b) => new THREE.Vector3(b[2], b[3], b[4]));

    /* per-foot gait bookkeeping: where it is planted and where it is
       going, which way it points (a world yaw), and how far it is
       pitched against the ground (pitch) and against level (pw) */
    this.feet = [-1, 1].map((s) => ({
      s, plant: new THREE.Vector3(), next: new THREE.Vector3(),
      at: new THREE.Vector3(), from: new THREE.Vector3(),
      stance: true, set: false, sh: 0, t: 0,
      pitch: 0, pw: 0, liftP: 0, airP: 0, slope: 0, yaw: 0, yawFrom: 0, toe: 0,
    }));
    this.hipDrop = 0; this.hipY0 = this.rest[B.hips].y;
    this.hLag = 0; this.hLagY = 0; this.headLag = 0;
    this.vm = remote ? 0 : 1;
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

  /* --- Aim a bone by a whole frame instead of one direction: for a hand or a foot,
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

    const amp = st.amp, run = st.run, spr = st.sprint || 0, walk = 1 - run;
    const crouch = st.crouch, air = st.air, held = 1 - air;
    const duty = st.duty, ph = st.cyc * T2;
    /* the step phase: nought at every touchdown, whichever foot */
    const u = (st.cyc * 2) % 1;

    /* ---- the pelvis ----
       A walk vaults over a stiff leg, so the hips are highest with the
       foot under them; a run bounces on a bent one, so there they are
       lowest. Same curve, opposite sign, and the bob passes through
       nothing at the changeover. The hips also shift over whichever
       foot is down, turn the swinging leg's side forward into the step
       (most at the moment it lands), and drop a little on the side
       that is in the air. */
    const bob = Math.cos(T2 * (u - duty)) * amp * held
      * (walk * 0.021 - run * lerp(0.034, 0.024, spr));
    const sink = amp * held * (run * 0.030 + spr * 0.020);
    const sway = -Math.cos(ph - Math.PI * duty) * amp * held * lerp(0.020, 0.010, run);
    const idle = (Math.sin(st.time * 0.62) * 0.008 + Math.sin(st.time * 0.41) * 0.005) * (1 - amp);
    const hips = bn[B.hips];
    /* The nominal hip height. legs() may lower it further if the stride has
       outrun the legs, which is why it is remembered rather than applied
       twice. */
    this.hipY0 = this.rest[B.hips].y - SLACK + bob - sink - crouch * 0.34 + st.land * 0.9 - air * 0.03;
    /* what of the hip height came from the stride, so the camera can take
       only a share of it: the body should bob, the view much less */
    this.gaitY = bob;
    hips.position.set(this.rest[B.hips].x + sway + idle, this.hipY0, this.rest[B.hips].z);

    const yawP = Math.cos(ph) * amp * held * lerp(0.07, 0.11, run);
    const obl = -Math.cos(ph - Math.PI * duty * 0.9) * amp * held * lerp(0.050, 0.070, run);
    const tilt = crouch * 0.16 + air * 0.08 + amp * (run * 0.07 + spr * 0.05);
    setZXY(hips.quaternion, obl, tilt, yawP);

    /* ---- the trunk ----
       The lower body goes where the feet are taking him; the chest turns
       to face where he is looking. The difference between the two is the
       twist, and the three joints below share all of it - the shares add
       up to exactly one, which is what leaves the head, and so the eye,
       and so the hands, aimed along the view.

       On top of that the shoulders turn against the hips, which is what
       swings the arms, and the spine takes the turn back out again
       before it reaches the head: the hips and the shoulders counter-
       rotate and the eyes stay still. In first person the hands hang off
       the chest, so they get less of it. */
    const tw = clamp(st.twist, -0.95, 0.95);
    const breath = Math.sin(st.time * 1.55) * 0.010 * (1 - amp * 0.5);
    /* how far forward the whole trunk leans */
    const lean = 0.035 + amp * (run * 0.080 + spr * 0.110) + crouch * 0.40 + st.push * 0.040;
    const bend = lean - tilt;
    const bounce = Math.cos(T2 * (u - duty)) * amp * held * run * 0.022;
    const chi = Math.cos(ph) * amp * held * lerp(0.05, 0.13, run) * (1 + spr * 0.35) * (1 - 0.7 * this.vm);
    const gy = yawP + chi;
    /* and lean into a turn, the way anybody carrying speed does */
    const bank = clamp(st.turn * 0.030, -0.085, 0.085) * clamp01(amp * 1.4);
    setZXY(bn[B.spine].quaternion, -obl * 0.55 + bank * 0.45, bend * 0.5 + breath * 0.4, -gy * 0.45 + tw * 0.22);
    setZXY(bn[B.chest].quaternion, -obl * 0.30 + bank * 0.55, bend * 0.5 + breath * 0.6 + bounce,
      -gy * 0.55 + tw * 0.46);
    setZXY(bn[B.neck].quaternion, -obl * 0.15 - bank * 0.5, -lean * 0.45, chi + tw * 0.32);

    /* ---- head: level eyes over whatever the trunk is doing ---- */
    this.headLag += (clamp(st.turn * 0.060, -0.30, 0.30) - this.headLag) * st.k8;
    setZXY(bn[B.head].quaternion, 0,
      -st.pitch * 0.50 - lean * 0.40 - bounce * 0.8 + Math.sin(ph * 2) * 0.006 * amp,
      this.headLag);

    this.face(st, run, spr);

    /* ---- arms ----
       Seen from outside they swing from the shoulder; seen from inside
       they are carried where you can see them. The two are worked out
       separately and blended, bone by bone, by how far into first person
       the view is - and swimming is always the carried kind, since that
       is a stroke and not a swing. */
    this.vm += (st.fp - this.vm) * st.k5;
    this.hLag += (clamp(-st.turn * 0.055, -0.13, 0.13) - this.hLag) * st.k6;
    this.hLagY += (clamp(st.pitchRate * 0.014, -0.05, 0.05) - this.hLagY) * st.k6;
    const ik = Math.max(this.vm, clamp01(st.swim * 1.5));
    for (const s of [-1, 1]) this.arm(st, s, ik);

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
      for (const f of this.feet) { f.set = false; f.sh = 0; }
      this.root.updateMatrixWorld(true);
      this.avatar.drive();
      return;
    }
    this.root.updateMatrixWorld(true);
    this.legs(st);
    this.root.updateMatrixWorld(true);
    this.avatar.drive();
  }

  /* ---- one arm ----
     `ik` is how much of the carried, first-person pose to use. */
  arm(st, s, ik) {
    const bn = this.bones;
    const L = s < 0 ? "L" : "R";
    const up = bn[B["upArm" + L]], lo = bn[B["loArm" + L]], hand = bn[B["hand" + L]];
    const air = st.air, amp = st.amp * (1 - air), run = st.run, spr = st.sprint || 0;

    /* Each arm goes forward with the opposite leg, a shade after it. At a
       walk it is a loose pendulum with the elbow nearly straight; at a
       run the elbow is held at a right angle and the swing is mostly
       behind; flat out it is a pump from the hip pocket to the chin. */
    const sw = Math.cos(T2 * (st.cyc - 0.035) + (s < 0 ? Math.PI : 0));
    const swA = lerp(lerp(0.32, 0.46, run), 0.95, spr);
    const swM = lerp(lerp(-0.05, -0.22, run), -0.12, spr);
    const flex = amp * (swM + sw * swA) + air * 0.30 - st.land * 0.6;
    const elW = 0.20 + 0.24 * (0.5 + 0.5 * sw);
    const elR = 1.40 + lerp(0.16, 0.55, spr) * sw;
    const elbow = lerp(0.14, lerp(elW, elR, run), amp) + air * 0.45 - st.land * 0.8;
    /* out from the side enough to clear the hip, and at a run the
       forearms turn in across the body without crossing the middle */
    const abd = lerp(0.10, lerp(0.11, 0.16, run), amp) + air * 0.30;
    const inner = amp * lerp(0.06, lerp(0.30, 0.16, spr), run);
    setZXY(up.quaternion, s * abd, -flex, -s * inner);
    setZXY(lo.quaternion, 0, -elbow, 0);
    hand.quaternion.identity();

    if (ik > 0.001) {
      _fk[0].copy(up.quaternion); _fk[1].copy(lo.quaternion); _fk[2].copy(hand.quaternion);
      const fwd = Math.max(0, sw);
      /* Carried out where you can see them, pumping harder the faster you
         go. Set from the eye rather than from taste: about half a metre
         out in front and a fifth of one below it puts them in the lower
         third of a seventy degree view. Measured from the eye, so when
         the eye moves these have to move with it. */
      const cx = s * (0.150 + 0.018 * run) - this.hLag * s * 0.4 + this.hLag;
      const cy = 1.494 + run * 0.055 + sw * 0.050 * amp - this.gaitY * 0.5 + this.hLagY;
      const cz = 0.455 + run * 0.030 + fwd * 0.040 * amp - Math.abs(sw) * 0.030 * amp * run;
      _p[0].set(cx, cy, cz);
      /* In the air they come up and out. Nobody jumps with their arms
         hanging, and a figure that does reads as a dropped puppet. */
      if (air > 0.001) {
        _p[0].x += s * air * 0.085;
        _p[0].y += air * 0.080 - st.land * 0.30;
        _p[0].z -= air * 0.045;
      }
      if (st.swim > 0.01) {
        /* a stroke that sweeps out and round, arms leading */
        const k = Math.sin(st.time * 2.1), j = Math.cos(st.time * 2.1);
        _p[1].set(s * (0.170 + 0.170 * (1 - k)), 1.500 + j * 0.080, 0.300 + k * 0.230);
        _p[0].lerp(_p[1], st.swim);
      }
      /* into the clavicle's space, which is where solve() wants it */
      _p[0].sub(this.abs[B["clav" + L]]);
      /* The elbow hangs down and back. Mostly down rather than out:
         pointing it sideways wings the elbows out level with the
         shoulders, which from the inside looks like chicken wings. */
      _p[2].set(s * 0.20, -0.92, -0.34).normalize();
      this.solve(up, lo, _p[0], _p[2], this.armA, this.armB);
      /* the wrist, aimed rather than angled, so it holds still while the
         elbow does whatever the solver decided: fingers forward and a
         little in, palm down */
      _qa.copy(up.quaternion).multiply(lo.quaternion).invert();
      _p[3].set(-s * 0.20, -0.44, 0.88).normalize().applyQuaternion(_qa);
      _p[4].set(0, -1, 0).applyQuaternion(_qa);
      this.roll(hand, this.handDir, _p[5].set(-s, 0, 0), _p[3], _p[4]);
      if (ik < 0.999) {
        _qb.copy(up.quaternion); up.quaternion.copy(_fk[0]).slerp(_qb, ik);
        _qb.copy(lo.quaternion); lo.quaternion.copy(_fk[1]).slerp(_qb, ik);
        _qb.copy(hand.quaternion); hand.quaternion.copy(_fk[2]).slerp(_qb, ik);
      }
    }

    /* the shoulder rides forward with its arm, and shrugs up a little
       when the arms come up */
    const prot = amp * sw * lerp(0.05, 0.10, run) * (1 - ik);
    setZXY(bn[B["clav" + L]].quaternion,
      s * (0.03 + ik * 0.13 + air * 0.10), -ik * 0.10 - air * 0.08, -s * prot);

    /* fingers: loose and a little curled, closing towards a soft fist the
       harder he runs */
    const fist = clamp01(lerp(amp * run * (0.85 - spr * 0.25), 0.10 + run * 0.30, this.vm) + air * 0.2);
    const c = this.curl[s];
    c[0] = lerp(0.30, 0.75, fist);
    for (let f = 1; f < 5; f++) c[f] = lerp(0.30 + f * 0.035, 1.05 + f * 0.04, fist);
  }

  /* ---- the face ----
     A blink every few seconds, quick down and slower up; eyes narrowing
     and the mouth working the harder he runs; a little ease about the
     mouth when he is not. A face that never moves is the shortest road
     to a dead one. */
  face(st, run, spr) {
    this.blinkT -= st.dt;
    if (this.blinkT <= 0 && this.blinkPh === 0) {
      this.blinkT = 2.1 + Math.random() * 4.4;
      this.blinkPh = 1e-4;
    }
    let close = 0;
    if (this.blinkPh > 0) {
      this.blinkPh += st.dt / 0.16;
      if (this.blinkPh >= 1) this.blinkPh = 0;
      /* shutting takes half the time that opening again does */
      else close = this.blinkPh < 0.34
        ? this.blinkPh / 0.34
        : 1 - (this.blinkPh - 0.34) / 0.66;
    }
    const effort = clamp01(st.amp * (run * 0.55 + spr * 0.45));
    const pant = Math.max(0, Math.sin(st.time * lerp(4.2, 6.0, spr))) * effort;
    this.blink = Math.min(1, close + effort * 0.06);
    this.squint = clamp01(effort * 0.30 + clamp01(st.pitch * 0.6) * 0.30);
    this.mouth = 0.02 + pant * 0.16 + effort * 0.05 + st.crouch * 0.01;
    this.puff = pant * spr * 0.25;
    this.smile = 0.12 * (1 - effort);
    this.brow = clamp01(st.pitch * 0.5) * 0.45 + effort * 0.05;
  }

  legs(st) {
    const bn = this.bones;
    const reach = this.legR * 0.995;
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
       the hips to give way to. Down quickly, so a foot is never left
       short of the ground; back up gently. */
    const fall = (1 - st.air) * (1 - st.air);
    const want = clamp(need, 0, 0.26) * fall;
    this.hipDrop += (want - this.hipDrop) * (want > this.hipDrop ? Math.min(1, 30 * st.dt) : st.k9);
    this.gaitY -= this.hipDrop;
    if (this.hipDrop > 1e-4) {
      bn[B.hips].position.y = this.hipY0 - this.hipDrop;
      this.root.updateMatrixWorld(true);
    }

    /* pass two: solve, then set each foot on what it is standing on */
    _mt.copy(bn[B.hips].matrixWorld).invert();
    _qh.setFromRotationMatrix(bn[B.hips].matrixWorld);
    const body = Math.atan2(-st.fwdX, -st.fwdZ);
    for (const f of this.feet) {
      const L = f.s < 0 ? "L" : "R";
      const thigh = bn[B["thigh" + L]], shin = bn[B["shin" + L]];
      _p[1].copy(f.at).applyMatrix4(_mt);
      /* the knee points the way its foot does */
      const ry = clamp(wrapPi(f.yaw - body), -0.7, 0.7);
      _p[2].set(Math.sin(ry) + f.s * 0.10, 0.10, Math.cos(ry)).normalize();
      this.solve(thigh, shin, _p[1], _p[2], this.legA, this.legB);
      shin.quaternion.multiply(this.shinOff);
      _qs.copy(_qh).multiply(thigh.quaternion).multiply(shin.quaternion);
      this.footPose(f, st, bn[B["foot" + L]], bn[B["toe" + L]], _qs);
    }
  }

  /* ---- which way the foot points, once the leg is solved ----
     Down, it lies on the ground at whatever pitch the roll has reached.
     In the air it hangs off the shin the way a relaxed foot does - toes
     down after it pushes off, coming up level through the swing - and
     for the last part of the swing it is brought round to the angle it
     is going to land at, so that touching down changes nothing. */
  footPose(f, st, foot, toe, qs) {
    const hx = -Math.sin(f.yaw), hz = -Math.cos(f.yaw);
    if (!f.stance && st.amp >= 0.02) {
      const d = _p[8].copy(this.shinDir).applyQuaternion(qs);
      const beta = Math.atan2(d.x * hx + d.z * hz, -d.y) - this.shinLean;
      const t = f.t, run = st.run, q = st.sprint || 0;
      const ank = lerp(lerp(-0.30, -0.45, run), lerp(0.06, -0.12, run) - 0.08 * q, smooth(t / 0.45));
      let pw = lerp(f.liftP, beta + ank, smooth(t / 0.28));
      pw = lerp(pw, this.rollAt(0, st) + f.slope, smooth((t - 0.72) / 0.28));
      f.pw = pw;
    }
    let pw = f.pw;
    if (st.air > 0.002) pw = lerp(pw, f.airP, st.air);

    /* the line from the ankle to the ball, and the foot's own side */
    const a = TOE_DROP + pw, ca = Math.cos(a);
    _qa.copy(qs).invert();
    _p[9].set(hx * ca, Math.sin(a), hz * ca).applyQuaternion(_qa);
    _p[10].set(hz, 0, -hx).applyQuaternion(_qa);
    this.roll(foot, this.footDir, AXIS_X, _p[9], _p[10]);

    /* The toes stay flat on the ground while the heel comes up over them,
       which is a bend at the ball as big as the foot's own pitch; in the
       air they straighten out. */
    const down = f.stance && st.air < 0.5;
    const tw = down ? Math.min(0, f.pitch) : 0.06;
    f.toe += (tw - f.toe) * Math.min(1, (down ? 30 : 12) * st.dt);
    toe.quaternion.setFromAxisAngle(AXIS_X, f.toe);
  }

  /* ---- how far the foot is pitched against the ground, through the
     time it is down (0 at touchdown, 1 as it leaves) ----
     At a walk the heel comes down with the toes well up and the foot
     slaps flat; at a jog it lands nearer flat; flat out it lands on the
     ball and the heel only just kisses the ground. Every time, the heel
     lifts for the second half and the foot rolls up on to the ball. A
     shuffle hardly rolls at all. */
  rollAt(ts, st) {
    const r = st.run, q = st.sprint || 0;
    const k = 0.35 + 0.65 * clamp01(st.amp);
    const thS = lerp(lerp(0.30, 0.14, r), -0.20, q) * k;
    const tF = lerp(lerp(0.17, 0.15, r), 0.30, q);
    const thM = -0.05 * q * k;
    const tH = lerp(lerp(0.50, 0.45, r), 0.40, q);
    const thO = lerp(lerp(-0.85, -1.00, r), -1.05, q) * k;
    if (ts < tF) return lerp(thS, thM, smooth(ts / tF));
    if (ts < tH) return thM;
    return thM + (thO - thM) * Math.pow((ts - tH) / (1 - tH), 1.6);
  }

  /* ---- where the ankle is, for a foot planted at P ----
     P is the point under the ankle when the foot is flat. Pitched up,
     the foot rocks about the back of the heel; pitched down, about the
     ball. The ground under it slopes by sg along the heading (hx, hz). */
  pivot(P, hx, hz, th, sg, out) {
    const cs = Math.cos(sg), ss = Math.sin(sg);
    const ct = Math.cos(th), st = Math.sin(th);
    let a, c;
    if (th >= 0) { a = HEEL * (ct - 1) - ANKLE * st; c = HEEL * st + ANKLE * ct; }
    else { a = BALL * (1 - ct) - ANKLE * st; c = -BALL * st + ANKLE * ct; }
    /* a is along the ground, c along its normal */
    out.set(P.x + hx * (cs * a - ss * c), P.y + ss * a + cs * c, P.z + hz * (cs * a - ss * c));
    return out;
  }

  /* how steep the ground at the normal n is, going along (hx, hz) */
  static slopeAlong(n, hx, hz) {
    return Math.atan2(-(n.x * hx + n.z * hz), n.y);
  }

  /* Keep a foot on its own side of the body.

     A foot that has wandered across the midline is the one thing that
     makes a change of direction look properly wrong: the legs scissor,
     the knees collide and the hips twist to follow. */
  keepSide(f, st, p) {
    const ex = p.x - st.px, ez = p.z - st.pz;
    const lat = -(ex * st.rightX + ez * st.rightZ);
    const lo = f.s > 0 ? 0.040 : -0.430;
    const hi = f.s > 0 ? 0.430 : -0.040;
    const d = clamp(lat, lo, hi) - lat;
    if (d === 0) return;
    p.x -= st.rightX * d;
    p.z -= st.rightZ * d;
  }

  /* Where this foot is heading for, worked out afresh every frame of the
     swing rather than once at lift-off: a step committed on the way up is
     a step into where he was going a third of a second ago. Feet land
     close to the line he is travelling on - a hand's width apart at a
     walk, nearly in one line at a run - not under the hips. */
  swingSpot(f, st, t, out) {
    const togo = (1 - t) * (1 - st.duty) * st.cycle;
    const ahead = togo + (st.ahead === undefined ? 0.25 : st.ahead);
    const lat = f.s * lerp(0.075, 0.055, st.run);
    out.set(
      st.px + st.dirX * ahead - st.rightX * lat, 0,
      st.pz + st.dirZ * ahead - st.rightZ * lat);
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
      this._hipW.x + st.fwdX * fw - st.rightX * lat,
      this._hipW.y - dn,
      this._hipW.z + st.fwdZ * fw - st.rightZ * lat);
    /* toes down off the ground, up again to meet it */
    f.airP += ((down * 0.260 - up * 0.300) - f.airP) * st.k8;
    return out;
  }

  /* the foot that is not this one - posing allocates nothing, so this is
     not a place for a closure */
  other(f) {
    return this.feet[0] === f ? this.feet[1] : this.feet[0];
  }

  footTarget(f, st) {
    const duty = st.duty;
    let uu = (st.cyc + (f.s < 0 ? 0 : 0.5)) % 1;
    if (uu < 0) uu += 1;
    const stance = uu < duty;
    const body = Math.atan2(-st.fwdX, -st.fwdZ);
    /* toes turned out a little, less at a run, and the whole foot turned
       towards where he is actually going */
    const yawWant = body + st.footYaw + f.s * lerp(0.10, 0.05, st.run);

    /* where a foot would rest if you were just standing there */
    const rx = st.px - st.rightX * f.s * 0.105, rz = st.pz - st.rightZ * f.s * 0.105;
    const ry = st.ground(rx, rz);
    if (!f.set) {
      /* the very first pose has nowhere to ease from, and easing out of
         the world origin would crouch him through the loading screen */
      f.plant.set(rx, ry, rz); f.next.copy(f.plant);
      f.at.set(rx, ry + ANKLE, rz); f.from.copy(f.at);
      f.yaw = yawWant; f.pitch = f.pw = f.toe = 0;
      f.stance = true; f.set = true;
    }

    if (st.amp < 0.02) {
      /* ---- standing ----
         Turning on the spot, a planted foot stays planted until it is too
         far from where it ought to be, or turned too far from the way he
         faces, and then it takes one short step rather than sliding
         there. One foot at a time, or he skates. */
      const want = _p[0].set(rx, ry + ANKLE, rz);
      if (f.sh > 0) {
        f.sh -= st.dt / 0.26;
        if (f.sh <= 0) {
          f.sh = 0; f.at.copy(want); f.plant.set(rx, ry, rz); f.pitch = 0; f.yaw = yawWant;
          this.stepped = f.s;
          this.stepAt.copy(f.plant);
        } else {
          const t = 1 - f.sh;
          const e = smooth(t);
          f.at.lerpVectors(f.from, want, e);
          f.at.y += Math.sin(Math.PI * t) * 0.035;
          f.pitch = Math.sin(Math.PI * t) * 0.16;
          f.yaw = f.yawFrom + wrapPi(yawWant - f.yawFrom) * e;
        }
      } else if ((f.at.distanceTo(want) > 0.085 || Math.abs(wrapPi(yawWant - f.yaw)) > 0.45)
        && this.other(f).sh <= 0) {
        f.sh = 1; f.from.copy(f.at); f.yawFrom = f.yaw;
      } else {
        /* the weight shifts about a little, but the sole does not slide */
        f.at.lerp(want, st.k5 * 0.30);
        f.pitch += (0 - f.pitch) * st.k8;
        f.plant.set(rx, ry, rz);
      }
      f.next.copy(f.plant);
      f.stance = true;
      f.t = 0;
      const hx = -Math.sin(f.yaw), hz = -Math.cos(f.yaw);
      normalAt(f.at.x, f.at.z, _p[1]);
      f.slope += (Rig.slopeAlong(_p[1], hx, hz) - f.slope) * st.k9;
      f.pw = f.pitch + f.slope;
      if (st.air > 0.002) { this.airTarget(f, st, _p[7]); f.at.lerp(_p[7], st.air); }
      return;
    }
    f.sh = 0;

    if (stance !== f.stance) {
      if (stance) {
        /* Touchdown: the swing target becomes the thing it stands on. If
           the stride changed under it and it is coming down early, it
           comes down where it is instead of jumping to where it was
           going. */
        if (f.t > 0.8) f.plant.copy(f.next);
        else f.plant.set(f.at.x, st.ground(f.at.x, f.at.z), f.at.z);
        this.stepped = f.s;
        this.stepAt.copy(f.plant);
      } else {
        f.from.copy(f.at);
        f.liftP = f.pw;
        this.swingSpot(f, st, 0, f.next);
      }
      f.stance = stance;
    }
    /* a foot bearing weight turns only slowly, and one in the air quickly */
    f.yaw += wrapPi(yawWant - f.yaw) * (stance ? Math.min(1, 2.5 * st.dt) : st.k9);
    const hx = -Math.sin(f.yaw), hz = -Math.cos(f.yaw);

    if (stance) {
      f.t = 0;
      f.pitch = this.rollAt(clamp01(uu / duty), st);
      normalAt(f.plant.x, f.plant.z, _p[1]);
      f.slope += (Rig.slopeAlong(_p[1], hx, hz) - f.slope) * st.k8;
      this.pivot(f.plant, hx, hz, f.pitch, f.slope, f.at);
      f.pw = f.pitch + f.slope;
    } else {
      const t = clamp01((uu - duty) / (1 - duty));
      f.t = t;
      /* the landing spot is re-aimed all the way through the swing, so a
         change of direction is absorbed by the step it happens during */
      this.swingSpot(f, st, t, _p[6]);
      f.next.lerp(_p[6], Math.min(1, 15 * st.dt));
      normalAt(f.next.x, f.next.z, _p[1]);
      f.slope += (Rig.slopeAlong(_p[1], hx, hz) - f.slope) * st.k8;
      /* aim for where the ankle will be the moment the heel touches */
      this.pivot(f.next, hx, hz, this.rollAt(0, st), f.slope, _p[7]);
      /* Up and through. The foot leaves slowly and lands slowly, so with
         the body travelling on it first trails out behind and folds up -
         the heel kick - then whips through, reaches, and draws back on to
         the ground. How high it folds is most of the difference between a
         walk and a sprint. */
      const run = st.run, q = st.sprint || 0;
      const e = smooth(t);
      const H = lerp(0.035 + 0.040 * st.amp, lerp(0.24, 0.44, q), run);
      const lift = H * Math.sin(Math.PI * Math.pow(t, lerp(0.58, 0.72, run)));
      f.at.set(
        lerp(f.from.x, _p[7].x, e),
        lerp(f.from.y, _p[7].y, e) + lift,
        lerp(f.from.z, _p[7].z, e));
      /* and never through a bump on the way */
      const floor = st.ground(f.at.x, f.at.z) + ANKLE * 0.8;
      if (f.at.y < floor) f.at.y = floor;
    }

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

  /* Somebody left. Geometry and materials are shared between every rig,
     so neither is disposed here - only the scene graph entry and this
     rig's own skeletons go. */
  dispose(scene) {
    scene.remove(this.root);
    const seen = new Set();
    for (const k in this.mesh) {
      const sk = this.mesh[k].skeleton;
      if (sk && !seen.has(sk)) { seen.add(sk); sk.dispose(); }
    }
    this.avatar.dispose();
    this.mesh = {};
  }

  /* the eye, between the pupils and level with them */
  eye(out) {
    return out.set(0, 0.099, 0.086).applyMatrix4(this.bones[B.head].matrixWorld);
  }
}
export {
  setZXY, Rig,
};
