# Overworld

A first-person walk through a procedurally generated meadow. No assets — every
texture, tree and the sky itself is drawn at load time. three.js comes from a
CDN; everything else is in this folder.

## Running it

    node tools/serve.mjs        # then open http://localhost:8124/

It has to be *served*. Opening `index.html` straight off the disk gives a blank
screen, because browsers refuse to load ES modules from `file://`. (The page
notices and says so rather than leaving you with a dead progress bar.)

## Where things are

    index.html          the markup: readouts, the title card, the pause menu
    css/game.css        all of the styling
    tools/serve.mjs     the local server above

    js/main.js          boot, the frame loop, and playing / paused / title
    js/settings.js      detail presets, and the switch that manages them for you
    js/hud.js           the readouts, the hint line, the overlays
    js/input.js         keyboard, mouse, and a thumbstick for touch
    js/audio.js         every sound, synthesised - footsteps, jump, breathing
    js/gait.js          what a stride is made of, shared by you and by them

    js/net.js           the lobby: Firestore introduces, WebRTC carries
    js/protocol.js      what goes over the wire, and the clock that smooths it
    js/remote.js        everybody else, posed from what arrives

    js/movement.js      what the player does, and where the camera ends up
    js/character.js     the body: the mesh builders, the skeleton, the limbs
    js/head.js          the head: the face sculpt, the eyes, the hair
    js/facemap.js       the skull all of that starts from, and its grid
    js/rig.js           the animation: the gait, the foot IK, the poses

    js/world.js         the clock, the light, the water, and what streams in
    js/chunks.js        one chunk of ground: its heights, splat and props
    js/geometry.js      trees, rocks and grass, plus the instance pool
    js/terrain.js       the noise, the height at any point, and place names

    js/graphics.js      the renderer, the sky, and the final grade
    js/materials.js     the shaders every surface is dressed with
    js/textures.js      every procedural texture

The dependencies only ever point one way, roughly bottom-to-top in that list:
`terrain` knows nothing about anything, and `main` knows about everything.

## Things that will bite you

Collected the hard way; each one cost an afternoon.

- **The renderer must stay on `NoToneMapping`.** The scene is linear HDR from
  end to end and the final pass tone maps once. Setting it on the renderer tone
  maps a second time and flattens the whole picture.
- **Every material goes through `dress()`** (`materials.js`). That is what
  injects the shared sky, haze and wind. A material that skips it has no aerial
  perspective and stands still in a gale.
- **Cut-out textures go through `splitCard()`** — a solid colour map plus a
  separate alpha map. Using a transparent canvas's own alpha makes mipmaps
  average leaf colour with transparent *black*, and the foliage goes sooty.
- **A cut-out's mean alpha must sit well above its `alphaTest`.** Mipmapping
  averages coverage down, so a delicate texture switches off at distance. The
  first pine frond was 8% opaque against a 0.28 test and distant pines rendered
  as bare trunks.
- **The figure is authored facing `+Z` and hangs under a group turned by π.**
  The yaw convention here puts forward at `-Z`. Get it wrong and he walks
  backwards with his rucksack on his chest.
- **An `InstancedMesh` runs its vertex shader for every slot in `count`**,
  filled or not. `InstancePool` keeps a high-water mark and draws only that far.
- **`heightAt()` is the single source of truth** for the ground. Physics, grass,
  water depth, props and the camera all sample it.
- **A foot is never allowed across the midline** (`keepSide`, `rig.js`). It is
  the one thing that makes a change of direction look properly wrong: the legs
  scissor and the hips twist after them. Slamming a sprint into reverse used to
  cross them by two thirds of a metre in half the frames of the turn.
- **The hips only give way for a leg that is holding him up.** Off the ground
  there is nothing to give way to, and leaving it in sank him a quarter of a
  metre through every jump with both legs hanging straight down.
- **The lower body lags the view on purpose and the chest makes up the
  difference.** The three twist shares in `pose()` add up to exactly one, which
  is what leaves the head - and so the eye, and so the hands - aimed along the
  view. Change one share and change the others.
- **The face is a grid over a lathe and neither parameter is uniform**
  (`facemap.js`). The front quarter takes half the columns, brow-to-chin half
  the rows. Spread them evenly and an eye gets four columns across it.
- **The profile is splined, not smoothstepped.** A smoothstep flattens the
  curve at every key it passes through, and the slope stepping at each one is
  plainly visible on a cheek: the head came out banded like a contour map.
- **The face texture is painted in metres, not in texture space.** Every pixel
  is turned back into the point on the head it covers and asked the same
  questions the sculpt asked of it.
- **Hair grows towards the back of the head, never down the grid.** `v` on its
  own runs down the front of the face, so clumps parameterised by it grew
  straight down the forehead and drew a black curtain over the whole face.
- **A canvas is flipped when three.js uploads it.** Paint row nought as the
  top of the head and the whole face texture lands upside down: the mouth
  ends up on the forehead and the lash lines on the cheekbones. `texFace`
  reads its rows from the bottom up for exactly this reason.
- **Noise for the face is sampled uniformly round the head, not on the grid.**
  The grid is deliberately uneven, so sampling on it stretched the pores into
  streaks down both sides of his head where the columns are sparsest.
- **Measure a cut-out card, do not look at it.** `texNeedle` was rebuilt from an old
  copy on 2026-11-08 and came back at 8% mean alpha against its 0.22 `alphaTest`.
  On screen that is one spiky bare pine above the canopy and nothing else wrong; the
  number says it immediately. Read the alpha canvas back and average it.
- **Nothing is loaded, including the sound.** Footsteps, the jump, the landing and
  the breathing are all built out of filtered noise and an oscillator or two at the
  moment they are wanted. That is how a footstep gets to know what it is standing
  on: `world.surfaceAt()` picks the filter, from the same four weights the ground
  shader blends the surface from, so what you hear is what you are looking at.
- **An AudioContext may only be started from a real user gesture.** `startAudio()`
  is called from `play()`, which is only ever reached from the button or the key
  that dismisses the pause menu. Called at load it would be born suspended and
  stay that way, silently.
- **Every envelope needs an attack.** A gain that starts at full level clicks, and
  an attack longer than the sound itself puts the two ramps out of order, which is
  a thrown exception rather than a quiet bug. `burst()` and `tone()` both clamp it.
- **The breathing is driven by how hard he has been working lately, not by whether
  shift is down.** It rises over two and a half seconds and falls over nine, and
  that asymmetry is the whole effect - breathing that stopped the instant you let
  go would read as a sound effect rather than as a person.
- **Time on the ground is a fixed distance, so a longer stride means less of the
  cycle touching, not a longer contact.** When the stride was lengthened to fix the
  cadence, the floor on `duty` had to come down with it: pinned where it was, the
  foot would have stayed down for 0.996 m instead of `STANCE`, which puts it half a
  metre behind the hip at push-off, out of the leg's reach, and drags the hips down
  16 cm every step. Contact is 0.740 m at every speed and the hip drop is 81 mm;
  if either of those moves, something upstream is wrong.

## Multiplayer

The world never travels. It is generated from fixed constants, so every browser
already has the identical terrain, trees and lake - which leaves only the people
to send: eight numbers and a byte of flags each, about thirty bytes, a dozen
times a second.

Firestore does the introductions and nothing else. Once two browsers have found
each other, positions go straight between them over a WebRTC data channel - the
whole reason this costs nothing to run. The free tier bills per document write,
and a dozen position updates a second per player would spend a day's allowance
in under an hour. Presence is refreshed once a minute and that is the only
recurring write. Figure on a handful of players, not a server full.

**It needs rules.** `worldPeers` and `worldLinks` have to be in `firestore.rules`
*and deployed*, or every write is rejected and the lobby silently never forms.

Things that will bite you here too:

- **The animation does not travel either.** What arrives is where somebody is and
  how fast they are going; the stride, the arm swing, the knee give on landing and
  the breathing are all worked out again at this end by the same code that drives
  you. That is why `gait.js` exists: two copies of the arithmetic would agree the
  day they were written and drift apart on some later afternoon, and the symptom
  would be other people walking subtly wrong in a way nobody can place.
- **Remote figures are drawn a tenth of a second in the past**, interpolated
  between the two packets that bracket that moment. Snapshots are stamped on
  *arrival*, with the receiver's own clock; senders' clocks are never consulted,
  which disposes of clock skew entirely.
- **Angles and the gait phase interpolate the short way round.** Miss that and
  somebody occasionally spins on the spot, or their legs stutter every stride.
- **The channel is unreliable and unordered on purpose.** A position that arrives
  late is no use to anybody, and waiting for it to be re-sent holds up the three
  behind it. The timeline expects exactly that and drops anything out of order.
- **Say goodbye before clearing the flag.** `leaveNow()` guards on `live`, so
  `disconnect()` clearing it first made leaving a no-op: presence was never
  deleted and everybody else kept a ghost of you until it timed out.
- **Either side tidies the paperwork, not just the offerer.** If the browser that
  made the offer is the one that closed, nobody would, and the lobby fills with
  dead offers and the candidate documents underneath them.
- **Geometry is built once and shared between every rig** (`bodyParts()` in
  `rig.js`). Rebuilding the face sculpt for each person who walks past is a
  quarter of a second of stutter each.
- **A proportion check cannot see an absence.** Every measurement passed while the
  figure had no jaw, no eyelid and no deltoid. The checks were confirming that what
  existed was the right size and saying nothing about what had never been built.
- **A test written by whoever made the assumption will protect it.** One of those
  checks was `eye opening never wider than the ball`, written because that was how
  the lid margin had been built. It was not guarding the face, it was guarding the
  construction, and it passed happily while the eyes were a fifth too small.
- **The jaw has to be wider than the neck.** At 114 mm across the mandible on a
  120 mm neck there is nothing to overhang, no edge and no shadow under one, and the
  head runs into the throat like a thumb into a fist.
- **The eye opening is wider than the eyeball** - past the ball the lids run back
  onto the orbital rim. And it is an almond, not an ellipse: the superellipse
  exponent below two is what draws the corners to a point. A round opening stares.
- **Hair volume belongs to the clumps, not the cap.** The cap only stops daylight
  showing between them; thickening it builds a smooth shell that swallows them whole
  and reads as a crash helmet. The standoff is also smaller than it feels - the
  inflate pushes along the cross-section, which on the sides of the head points
  sideways, so a generous one does not make generous hair, it makes a brim.
- **5 m/s is a run.** The move key was set there, so the stride was three metres
  with the feet off the ground three quarters of the time and every other frame
  caught him in a mid-air split. The gait was not wrong; it was being asked to
  carry a sprinter's speed and called walking.
