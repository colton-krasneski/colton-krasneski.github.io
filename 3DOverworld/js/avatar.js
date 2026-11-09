/* ============================================================
   The figure you see: a scanned and painted person, Rocketbox
   Male_Adult_06 from Microsoft's avatar library (MIT licence -
   see assets/avatar/LICENSE.txt). Loaded once, shared by every
   rig, and moved by the plain skeleton rig.js poses.

   The two skeletons do not agree about how a joint is oriented,
   so a rotation is never copied as it stands. Instead the model
   is first bent into the solver's rest pose - arms straight down
   instead of out at forty-five degrees, legs plumb, index finger
   forward - and what is copied from then on is how far each bone
   has turned away from rest, in the body's own space. Positions
   are not copied at all except for the pelvis, the hip joints and
   the collarbones, because the lengths in between already agree:
   that is why character.js was measured off this model.
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { MAX_ANISO, dress } from "./graphics.js";
import { B, BONE, HEAD_LAYER, MEASURE } from "./character.js";

const DIR = "assets/avatar/";

/* The solver's "L" is the -X side; the model's left is +X (it faces +Z
   too, so its anatomical left is at +X). Pair them by side, not name. */
const SIDE = { L: "R", R: "L" };

/* [ solver bone, model bone, copy the position too ] */
const MAP = [["hips", "Bip01_Pelvis", 1], ["hips", "Bip01_Spine"], ["spine", "Bip01_Spine1"],
  ["chest", "Bip01_Spine2"], ["neck", "Bip01_Neck"], ["head", "Bip01_Head"]];
for (const L of ["L", "R"]) {
  const m = "Bip01_" + SIDE[L] + "_";
  MAP.push(["clav" + L, m + "Clavicle", 1], ["upArm" + L, m + "UpperArm"], ["loArm" + L, m + "Forearm"],
    ["hand" + L, m + "Hand"], ["thigh" + L, m + "Thigh", 1], ["shin" + L, m + "Calf"],
    ["foot" + L, m + "Foot"], ["toe" + L, m + "Toe0"]);
}

/* What each bone is aimed along when the model is bent into the rest
   pose: [ model bone, the model joint it points at, solver bone, the
   solver joint it points at, roll the index knuckle forward too ] */
const AIM = [["Bip01_Pelvis", "Bip01_Spine", "hips", "spine"], ["Bip01_Spine", "Bip01_Spine1", "hips", "spine"],
  ["Bip01_Spine1", "Bip01_Spine2", "spine", "chest"], ["Bip01_Spine2", "Bip01_Neck", "chest", "neck"],
  ["Bip01_Neck", "Bip01_Head", "neck", "head"]];
for (const L of ["L", "R"]) {
  const m = "Bip01_" + SIDE[L] + "_";
  AIM.push([m + "Clavicle", m + "UpperArm", "clav" + L, "upArm" + L],
    [m + "UpperArm", m + "Forearm", "upArm" + L, "loArm" + L],
    [m + "Forearm", m + "Hand", "loArm" + L, "hand" + L, 1],
    [m + "Hand", m + "Finger2", "hand" + L, "fm" + L, 1],
    [m + "Thigh", m + "Calf", "thigh" + L, "shin" + L],
    [m + "Calf", m + "Foot", "shin" + L, "foot" + L],
    [m + "Foot", m + "Toe0", "foot" + L, "toe" + L]);
}

/* the blend shapes the face is moved with (named in the converter) */
const FACE = ["blinkL", "blinkR", "jawOpen", "smileL", "smileR", "browUp", "squintL", "squintR", "funnel"];

let SRC = null;

/* Light that went in, bounced about under the surface and came back out
   past the terminator. Without it skin reads as painted plaster: the
   giveaway is the shadow edge, which on a person is a soft red band. */
function skinHook(wrap) {
  return (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_end>", [
      "#include <lights_fragment_end>",
      "{",
      "  vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );",
      "  float nl = dot( normal, sunV );",
      "  float extra = max( 0.0, ( nl + 0.45 ) / 1.45 ) - max( 0.0, nl );",
      "  reflectedLight.directDiffuse += uSunCol * extra * " + wrap.toFixed(3),
      "    * diffuseColor.rgb * vec3( 1.00, 0.56, 0.44 );",
      "}",
    ].join("\n"));
  };
}

async function loadAvatar() {
  if (SRC) return SRC;
  const tl = new THREE.TextureLoader();
  const tex = (n, srgb) => tl.loadAsync(DIR + n + ".jpg").then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = Math.min(8, MAX_ANISO);
    return t;
  });
  const [gltf, hc, hn, hr, bc, bn, br, ac, aa] = await Promise.all([
    new GLTFLoader().loadAsync(DIR + "avatar.glb"),
    tex("head_color", true), tex("head_normal"), tex("head_rough"),
    tex("body_color", true), tex("body_normal"), tex("body_rough"),
    tex("hair_color", true), tex("hair_alpha"),
  ]);
  const mats = {
    head: dress(new THREE.MeshStandardMaterial({
      map: hc, normalMap: hn, roughnessMap: hr, roughness: 1, metalness: 0,
    }), "ow-avatar-head", skinHook(0.55)),
    body: dress(new THREE.MeshStandardMaterial({
      map: bc, normalMap: bn, roughnessMap: br, roughness: 1, metalness: 0,
    }), "ow-avatar-body", skinHook(0.22)),
    /* hair is cards: colour and cut-out as two maps, so mipmapping never
       averages a strand with the transparent black between them */
    hair: dress(new THREE.MeshStandardMaterial({
      map: ac, alphaMap: aa, alphaTest: 0.36, side: THREE.DoubleSide, roughness: 0.74, metalness: 0,
    }), "ow-avatar-hair", null),
    ghost: dress(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), "ow-avatar-ghost", null),
  };
  const scene = gltf.scene;
  const named = {};
  scene.traverse((o) => {
    if (o.isBone) named[o.name] = o;
    if (o.isSkinnedMesh) {
      o.material = mats[o.name] || mats.body;
      o.castShadow = true;
      o.receiveShadow = true;
      /* a posed limb reaches outside the bounds of the bind pose */
      o.frustumCulled = false;
    }
  });
  /* the lengths the solver was built with have to be this model's */
  scene.updateMatrixWorld(true);
  const wp = (n) => new THREE.Vector3().setFromMatrixPosition(named[n].matrixWorld);
  const thigh = wp("Bip01_L_Thigh").distanceTo(wp("Bip01_L_Calf"));
  const shin = wp("Bip01_L_Calf").distanceTo(wp("Bip01_L_Foot"));
  if (Math.abs(thigh - MEASURE.thigh) > 0.005 || Math.abs(shin - MEASURE.shin) > 0.005) {
    console.warn("avatar: legs " + thigh.toFixed(4) + " / " + shin.toFixed(4)
      + " do not match character.js - the feet will not land where the solver puts them");
  }
  SRC = { scene, mats };
  return SRC;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

/* the solver's joints at rest, in the body's own space */
const REST = BONE.map((b) => new THREE.Vector3(b[2], b[3], b[4]));

class Avatar {
  constructor(rig, remote) {
    if (!SRC) throw new Error("loadAvatar() has to finish before a rig is built");
    this.rig = rig;
    const group = cloneSkinned(SRC.scene);
    this.group = group;
    const bones = {}, meshes = {};
    group.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh) meshes[o.name] = o;
    });
    this.bones = bones;
    this.meshes = meshes;

    /* parents before children, always */
    this.order = [];
    bones.Bip01_Pelvis.traverse((o) => { if (o.isBone) this.order.push(o); });

    this.conform();

    this.map = new Map();
    for (const [d, m, pos] of MAP) this.map.set(bones[m], { d: B[d], pos: !!pos });

    /* fingers curl about their own knuckle axis, worked out at rest */
    this.digits = { "-1": [], "1": [] };
    for (const L of ["L", "R"]) {
      const s = L === "L" ? -1 : 1, m = "Bip01_" + SIDE[L] + "_";
      for (let f = 0; f < 5; f++) {
        const chain = [m + "Finger" + f, m + "Finger" + f + "1", m + "Finger" + f + "2"].map((n) => bones[n]);
        this.digits[s].push(chain.map((b) => ({ b, axis: this.knuckleAxis(b, f), rest: b.quaternion.clone() })));
      }
    }

    this.morph = {};
    const dict = meshes.head.morphTargetDictionary || {};
    for (const k of FACE) this.morph[k] = dict[k];

    /* Your own head is hidden from your own eyes, because you are inside
       it; a stand-in that writes no colour keeps your shadow whole. */
    if (!remote) {
      for (const k of ["head", "hair"]) {
        meshes[k].layers.set(HEAD_LAYER);
        meshes[k].castShadow = false;
        const g = new THREE.SkinnedMesh(meshes[k].geometry, SRC.mats.ghost);
        g.castShadow = true;
        g.frustumCulled = false;
        group.add(g);
        g.bind(meshes[k].skeleton, meshes[k].bindMatrix);
        g.morphTargetInfluences = meshes[k].morphTargetInfluences;
        meshes[k + "Ghost"] = g;
      }
    }

    this.Wq = new Map();
    this.Wp = new Map();
    for (const b of this.order) { this.Wq.set(b, new THREE.Quaternion()); this.Wp.set(b, new THREE.Vector3()); }
    this.Qd = rig.bones.map(() => new THREE.Quaternion());
    this.Pd = rig.bones.map(() => new THREE.Vector3());
    rig.turn.add(group);
  }

  /* where a model joint is - the group is unparented while this is used,
     so world space and body space are the same thing */
  at(name) {
    return new THREE.Vector3().setFromMatrixPosition(this.bones[name].matrixWorld);
  }

  /* Bend the model into the solver's rest pose, from the pelvis out, and
     remember the result: every later frame is measured from here. */
  conform() {
    this.group.updateMatrixWorld(true);
    const wq = new THREE.Quaternion(), pq = new THREE.Quaternion();
    for (const [mb, mc, db, dc, roll] of AIM) {
      const bone = this.bones[mb];
      const have = this.at(mc).sub(this.at(mb)).normalize();
      const want = REST[B[dc]].clone().sub(REST[B[db]]).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(have, want);
      if (roll) {
        /* and roll it about its own length until the index knuckle is in
           front of the little finger's, as it is on the solver's hand */
        const side = mb.includes("_L_") ? "L" : "R";
        const across = this.at("Bip01_" + side + "_Finger1").sub(this.at("Bip01_" + side + "_Finger4")).applyQuaternion(q);
        const fwd = new THREE.Vector3(0, 0, 1);
        across.addScaledVector(want, -across.dot(want)).normalize();
        fwd.addScaledVector(want, -fwd.dot(want)).normalize();
        const ang = Math.atan2(_v2.crossVectors(across, fwd).dot(want), across.dot(fwd));
        q.premultiply(_q.setFromAxisAngle(want, ang));
      }
      bone.getWorldQuaternion(wq);
      wq.premultiply(q);
      bone.parent.getWorldQuaternion(pq);
      bone.quaternion.copy(pq.invert().multiply(wq));
      bone.updateMatrixWorld(true);
    }
    this.Ac = new Map();
    this.restLocal = new Map();
    for (const b of this.order) {
      this.Ac.set(b, b.getWorldQuaternion(new THREE.Quaternion()));
      this.restLocal.set(b, b.quaternion.clone());
    }
  }

  /* The axis a finger joint bends about, in the bone's own frame. At rest
     the hand hangs with the palm to the thigh, so closing it carries the
     fingertips in towards the body's midline; the thumb folds across the
     palm instead, which is in and back. */
  knuckleAxis(bone, f) {
    const kid = bone.children.find((c) => c.isBone);
    const p = bone.getWorldPosition(new THREE.Vector3());
    const dir = kid ? kid.getWorldPosition(new THREE.Vector3()).sub(p).normalize() : new THREE.Vector3(0, -1, 0);
    const side = Math.sign(p.x) || 1;
    const inward = f === 0 ? new THREE.Vector3(-side * 0.7, 0, -0.7) : new THREE.Vector3(-side, 0, 0);
    const axis = new THREE.Vector3().crossVectors(dir, inward).normalize();
    return axis.applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
  }

  /* Copy this frame's pose across. Called at the end of every pose(). */
  drive() {
    const rb = this.rig.bones, Qd = this.Qd, Pd = this.Pd;
    for (let i = 0; i < rb.length; i++) {
      const p = BONE[i][1], b = rb[i];
      if (p < 0) { Qd[i].copy(b.quaternion); Pd[i].copy(b.position); }
      else {
        Qd[i].multiplyQuaternions(Qd[p], b.quaternion);
        Pd[i].copy(b.position).applyQuaternion(Qd[p]).add(Pd[p]);
      }
    }
    const Wq = this.Wq, Wp = this.Wp;
    for (const b of this.order) {
      const par = b.parent && b.parent.isBone ? b.parent : null;
      const pq = par ? Wq.get(par) : null, pp = par ? Wp.get(par) : null;
      const wq = Wq.get(b), wp = Wp.get(b);
      const m = this.map.get(b);
      if (m) {
        wq.multiplyQuaternions(Qd[m.d], this.Ac.get(b));
        if (pq) b.quaternion.copy(_q.copy(pq).invert()).multiply(wq);
        else b.quaternion.copy(wq);
      } else {
        b.quaternion.copy(this.restLocal.get(b));
        if (pq) wq.multiplyQuaternions(pq, b.quaternion); else wq.copy(b.quaternion);
      }
      if (m && m.pos) {
        wp.copy(Pd[m.d]);
        if (pq) b.position.copy(_v.subVectors(wp, pp).applyQuaternion(_q.copy(pq).invert()));
        else b.position.copy(wp);
      } else if (pq) wp.copy(b.position).applyQuaternion(pq).add(pp);
      else wp.copy(b.position);
    }
    this.fingers();
    this.face();
  }

  /* fingers, from how far the rig wants each one closed */
  fingers() {
    for (const s of [-1, 1]) {
      const curl = this.rig.curl[s];
      const chains = this.digits[s];
      for (let f = 0; f < 5; f++) {
        const c = curl[f], chain = chains[f];
        for (let k = 0; k < 3; k++) {
          const j = chain[k];
          const amt = f === 0 ? c * (k === 0 ? 0.25 : 0.7) : c * (k === 0 ? 0.85 : k === 1 ? 1.15 : 0.8);
          j.b.quaternion.copy(j.rest).multiply(_q.setFromAxisAngle(j.axis, amt));
        }
      }
    }
  }

  face() {
    const inf = this.meshes.head.morphTargetInfluences, r = this.rig, m = this.morph;
    if (!inf) return;
    const set = (k, v) => { if (m[k] !== undefined) inf[m[k]] = v; };
    set("blinkL", r.blink); set("blinkR", r.blink);
    set("squintL", r.squint); set("squintR", r.squint);
    set("jawOpen", r.mouth);
    set("funnel", r.puff);
    set("smileL", r.smile); set("smileR", r.smile * 0.9);
    set("browUp", r.brow);
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}

export { loadAvatar, Avatar };
