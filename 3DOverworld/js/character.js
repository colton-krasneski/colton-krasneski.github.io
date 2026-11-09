/* ============================================================
   The skeleton the animation is computed on.

   Nothing in here is drawn. The figure you see is a scanned and
   painted person (avatar.js); this is the simple, square-on
   skeleton that rig.js poses, and avatar.js copies every frame's
   pose across onto the real one.

   Every joint is where the model's own joint is - measured off
   Rocketbox Male_Adult_06 - so a foot the solver puts on the
   ground is on the ground in the picture too. What differs is
   the rest pose: here the limbs hang straight down and the feet
   point straight ahead, which is what lets the solver and the
   pose code write plain angles. If the model is ever swapped,
   these numbers have to be measured again; avatar.js checks the
   leg lengths at load and says so if they disagree.

   Authored facing +Z, because that is the direction a person
   reads as forward. The yaw convention here puts forward at -Z,
   so the whole figure hangs under one group turned half a turn.
   ============================================================ */

import * as THREE from "three";

const HEAD_LAYER = 1;
const T2 = Math.PI * 2;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

const BONE = [];                 /* [ name, parentIndex, x, y, z ] */
const B = {};                    /* name -> index */
const FINGERS = { "-1": [], "1": [] };

function joint(name, parent, x, y, z) {
  B[name] = BONE.length;
  BONE.push([name, parent, x, y, z]);
  return B[name];
}

/* the model's measurements, in metres */
const M = {
  hips: 0.895, spine: 1.168, chest: 1.321, neck: 1.521, head: 1.587,
  clavX: 0.073, clavY: 1.459, shX: 0.210, shY: 1.428,
  upper: 0.2858, fore: 0.2710,
  hipX: 0.088, thigh: 0.3990, shin: 0.3955,
};

(function buildSkeleton() {
  joint("hips", -1, 0, M.hips, 0.000);
  joint("spine", B.hips, 0, M.spine, -0.009);
  joint("chest", B.spine, 0, M.chest, -0.020);
  joint("neck", B.chest, 0, M.neck, -0.012);
  joint("head", B.neck, 0, M.head, 0.008);

  /* The face moves by blend shapes on the model, not by bones; these
     three only carry the amounts (see Rig.face) and mark the places. */
  joint("jaw", B.head, 0, 1.618, 0.025);
  joint("lidL", B.head, -0.032, 1.686, 0.094);
  joint("lidR", B.head, 0.032, 1.686, 0.094);

  /* four fingers: [ name, z across the palm ], hanging straight down */
  const DIG = [["i", 0.022], ["m", 0.003], ["r", -0.016], ["l", -0.032]];
  const handY = M.shY - M.upper - M.fore;

  for (const s of [-1, 1]) {
    const L = s < 0 ? "L" : "R";
    joint("clav" + L, B.chest, s * M.clavX, M.clavY, -0.024);
    joint("upArm" + L, B["clav" + L], s * M.shX, M.shY, -0.025);
    joint("loArm" + L, B["upArm" + L], s * M.shX, M.shY - M.upper, -0.025);
    joint("hand" + L, B["loArm" + L], s * M.shX, handY, -0.025);

    FINGERS[s] = [];
    for (const [d, z] of DIG) {
      const a = joint("f" + d + L, B["hand" + L], s * M.shX, handY - 0.090, z - 0.025);
      const b = joint("f" + d + L + "b", a, s * M.shX, handY - 0.125, z - 0.025);
      FINGERS[s].push([a, b]);
    }
    /* the thumb comes off the front of the palm, pointing the way you go */
    const ta = joint("th" + L, B["hand" + L], s * (M.shX - 0.004), handY - 0.022, 0.012);
    const tb = joint("th" + L + "b", ta, s * (M.shX - 0.004), handY - 0.048, 0.032);
    FINGERS[s].push([ta, tb]);

    joint("thigh" + L, B.hips, s * M.hipX, M.hips, 0.000);
    joint("shin" + L, B["thigh" + L], s * M.hipX, M.hips - M.thigh, 0.000);
    joint("foot" + L, B["shin" + L], s * M.hipX, M.hips - M.thigh - M.shin, -0.015);
    /* the toe joint is the ball of the foot, which is on the ground */
    joint("toe" + L, B["foot" + L], s * M.hipX, 0.002, 0.119);
  }
})();

/* How high the ankle rides above the sole when the foot is flat, and
   where the two points it rocks over are: the back of the heel and the
   ball. Measured off the model's shoe. A planted foot pivots about the
   heel as it comes down and about the ball as it pushes off, and that
   rocking is most of what makes a stride look like a stride. */
const ANKLE = BONE[B.footL][3];
const HEEL = 0.089, BALL = 0.134;

/* Standing with the knees locked looks like a mannequin and standing
   with them bent looks like a crouch. Four millimetres of slack is
   eleven degrees of knee: a relaxed stance. (It was fifty once, which
   on a leg this long is forty degrees - every frame was half a squat.) */
const SLACK = 0.004;

export {
  HEAD_LAYER, T2, AXIS_X, AXIS_Y, AXIS_Z, BONE, B, FINGERS, ANKLE, HEEL, BALL, SLACK, M as MEASURE,
};
