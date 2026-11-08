/* ============================================================
   What a stride is made of, worked out from nothing but how fast
   somebody is going.

   This lives on its own and imports nothing for two reasons. The
   figure you are driving and the figures other people are driving
   have to walk the same way, and the surest way to make sure of
   that is to have one copy of the arithmetic rather than two that
   agree today. And being arithmetic, it can be checked without a
   browser, a network or a second player.
   ============================================================ */

/* The feet cover the same ground on every step whatever the speed, so
   a stride can never ask the leg to reach further than it has. Going
   faster shortens the time on the ground rather than lengthening the
   step - which is also what a person actually does when they speed
   up. AHEAD is half of STANCE, which is what makes the stride
   symmetric: the foot leaves the ground the same distance behind the
   hip that it landed in front of it. */
const STANCE = 0.74, AHEAD = 0.37;

/* how fast he can possibly be going, which is what the stride is
   measured against */
const TOP = 8.4;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------
   The stride, as a distance rather than a rate: the phase advances
   with ground covered, so however fast you go the feet land where
   they are put and never skate.

   The numbers are what they are because of cadence. A stride of 1.30
   to 3.20 m put him at 247 steps a minute at walking speed and 315 at
   a sprint, where a person does 100-120 and 240-260 - a hummingbird,
   and the first thing you hear once there are footsteps on it.

   The floor on the duty cycle goes with it. Time on the ground is
   STANCE metres of it whatever the speed, so a longer stride means a
   *smaller* share of the cycle spent touching, not a longer contact:
   pinned at the old floor the foot would have had to stay down for
   0.996 m, which puts it half a metre behind the hip at push-off, out
   of the leg's reach, and drags the hips down 16 cm at every step.
   ------------------------------------------------------------ */
function strideFor(speed) {
  const cycle = lerp(1.45, 4.15, clamp01(speed / TOP));
  return { cycle, duty: clamp(STANCE / cycle, 0.16, 0.62) };
}

/* How much of a stride is showing, and how much of it is a run. These
   are targets: the player smooths towards them over a few frames, and
   so does everybody else's copy of everybody else. */
function swingFor(speed, onGround) {
  return {
    amp: clamp01(speed / 4.2) * (onGround ? 1 : 0.15),
    run: clamp01((speed - 4.0) / 4.4),
  };
}

/* steps a minute, which is the number that says whether a gait is a
   person's or a hummingbird's */
function cadenceFor(speed) {
  return (2 * speed / strideFor(speed).cycle) * 60;
}
export {
  STANCE, AHEAD, TOP, strideFor, swingFor, cadenceFor,
};
