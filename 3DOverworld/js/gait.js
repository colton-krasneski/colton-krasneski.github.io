/* ============================================================
   What a stride is made of, worked out from nothing but how fast
   somebody is going.

   This lives on its own and imports nothing for two reasons. The
   figure you are driving and the figures other people are driving
   have to walk the same way, and the surest way to make sure of
   that is to have one copy of the arithmetic rather than two that
   agree today. And being arithmetic, it can be checked without a
   browser, a network or a second player.

   The numbers are a person's, not taste:
     - a walk turns into a run at about two metres a second, which
       is where people change over of their own accord;
     - steps come about two a second at a walk, 2.7 at a jog and
       just over four flat out (120, 165 and 250 a minute);
     - a foot is on the ground for about 0.8 m of travel walking
       and 0.72 m running. Faster means a smaller share of the
       stride spent on the ground, never a longer reach, because
       the leg is only so long: these are what this skeleton can
       actually span without the knee locking out.
   The default pace is 3.6 m/s, which is a jog. It used to be
   animated as a walk stretched over a running stride, which is
   why every step was a lunge.
   ============================================================ */

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

/* 0 is a walk and 1 a run; 0 is a jog and 1 flat out */
function runFor(v) { return smooth(clamp01((v - 1.85) / 0.90)); }
function sprintFor(v) { return smooth(clamp01((v - 4.2) / 3.6)); }

/* steps a second */
function stepRate(v) {
  const walk = 1.35 + 0.47 * v;
  const d = Math.max(0, v - 4.2);
  const run = 2.62 + 0.03 * v + 0.072 * d * d;
  return lerp(walk, run, runFor(v));
}

/* metres of travel with a foot on the ground, and how far in front of
   the hip it comes down */
const STANCE_WALK = 0.80, STANCE_RUN = 0.72;
const AHEAD_WALK = 0.30, AHEAD_RUN = 0.22, AHEAD_SPRINT = 0.20;

/* ------------------------------------------------------------
   The stride, as a distance rather than a rate: the phase advances
   with ground covered, so however fast you go the feet land where
   they are put and never skate. `cycle` is two steps, in metres;
   `duty` the share of it one foot spends down; `ahead` where it
   lands relative to the hip. Below half a metre a second there is
   no stride to speak of, and a cycle of nothing would spin the
   phase, so the arithmetic stops getting shorter there.
   ------------------------------------------------------------ */
function strideFor(speed) {
  const v = Math.max(speed, 0.5);
  const r = runFor(v), q = sprintFor(v);
  const cycle = 2 * v / stepRate(v);
  const want = lerp(STANCE_WALK, STANCE_RUN, r);
  const duty = clamp(want / cycle, 0.16, 0.68);
  const ahead = lerp(lerp(AHEAD_WALK, AHEAD_RUN, r), AHEAD_SPRINT, q) * (duty * cycle / want);
  return { cycle, duty, ahead };
}

/* How much of a stride is showing, how much of it is a run and how
   much a sprint. These are targets: the player smooths towards them
   over a few frames, and so does everybody else's copy of everybody
   else. A stride is all there by 1.3 m/s, an ordinary walk. */
function swingFor(speed, onGround) {
  return {
    amp: clamp01(speed / 1.3) * (onGround ? 1 : 0.15),
    run: runFor(speed),
    sprint: sprintFor(speed),
  };
}

/* steps a minute, which is the number that says whether a gait is a
   person's or a hummingbird's */
function cadenceFor(speed) {
  return stepRate(Math.max(speed, 0.5)) * 60;
}
export {
  runFor, sprintFor, stepRate, strideFor, swingFor, cadenceFor,
};
