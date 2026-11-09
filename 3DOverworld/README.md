# Overworld

A first-person walk through a procedurally generated meadow. Every texture,
tree and the sky itself is drawn at load time. Only two things are loaded
rather than made: the person you are (a scanned Microsoft Rocketbox avatar,
MIT licence, in `assets/avatar/`) and the sounds (public-domain recordings, in
`assets/sfx/`). three.js comes from a CDN; everything else is in this folder.

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
    js/audio.js         every sound: recorded clips out of one file
    js/gait.js          what a stride is made of, shared by you and by them

    js/net.js           the lobby: Firestore introduces, WebRTC carries
    js/protocol.js      what goes over the wire, and the clock that smooths it
    js/remote.js        everybody else, posed from what arrives

    js/movement.js      what the player does, and where the camera ends up
    js/character.js     the skeleton the animation is worked out on
    js/rig.js           the animation: the gait, the foot roll, the IK, the poses
    js/avatar.js        the person you see, and every pose copied onto it

    js/world.js         the clock, the light, the water, and what streams in
    js/chunks.js        one chunk of ground: its heights, splat and props
    js/geometry.js      trees, rocks and grass, plus the instance pool
    js/terrain.js       the noise, the height at any point, and place names

    js/graphics.js      the renderer, the sky, and the final grade
    js/materials.js     the shaders every surface is dressed with
    js/textures.js      every procedural texture

    assets/avatar/      the scanned person (glTF and textures) and its licence
    assets/sfx/         every sound in one wav, where each clip is, the credits

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
- **The skeleton that is posed is not the one you see.** `rig.js` poses the plain
  skeleton in `character.js`, and `avatar.js` copies the result onto the scanned
  model every frame. Rotations are never copied as they stand, because the two
  skeletons disagree about how a joint is oriented: the model is bent once into
  the solver's rest pose - arms straight down, index knuckle forward - and what
  is copied is how far each bone has turned from there. The joints in
  `character.js` were measured off the model, so a foot the solver plants is
  planted in the picture too. Swap the model and they have to be measured again;
  `loadAvatar()` warns when the legs disagree.
- **The figure's -X side is the side `st.right` points to.** It faces +Z under a
  group turned by π, so its +X is the world's left. For a long time every foot
  was put down on the side opposite its own hip and the shins crossed on every
  step - it read as "the walk looks funky" and nobody could say why. A foot's
  spot is `-st.right * s`, everywhere: `keepSide()`, `swingSpot()`, standing.
- **A planted foot rocks; it is never simply moved.** While a foot is down, the
  ankle is worked out from the point it is rocking over - the back of the heel
  just after it lands, the ball as it pushes off (`pivot()`, `rig.js`). Pitching
  the foot about the ankle instead buries the toes at push-off and floats the
  heel at touchdown, and the sole visibly slides.
- **Measure a cut-out card, do not look at it.** `texNeedle` was rebuilt from an old
  copy on 2026-11-08 and came back at 8% mean alpha against its 0.22 `alphaTest`.
  On screen that is one spiky bare pine above the canopy and nothing else wrong; the
  number says it immediately. Read the alpha canvas back and average it.
- **Every sound is a recording, and they are all in one file.** `sfx.wav` holds 47
  short clips end to end and `sfx.json` says where each starts. It is fetched while
  the world is built and decoded once `startAudio()` has made a context. A surface
  still picks its own sound - `world.surfaceAt()` chooses the set of clips - and
  no clip plays twice running or at quite the same pitch or level, which is what
  keeps a handful of recordings from sounding like a handful of recordings.
- **An AudioContext may only be started from a real user gesture.** `startAudio()`
  is called from `play()`, which is only ever reached from the button or the key
  that dismisses the pause menu. Called at load it would be born suspended and
  stay that way, silently.
- **Every clip needs a fade.** A sound that starts or stops anywhere but silence
  clicks. The clips were cut with a short fade at each end so they can be started
  and stopped dead; the one sound still made, the splash, clamps its attack.
- **The breathing is driven by how hard he has been working lately, not by whether
  shift is down.** It rises over two and a half seconds and falls over nine, and
  that asymmetry is the whole effect - breathing that stopped the instant you let
  go would read as a sound effect rather than as a person.
- **Contact is what the leg can span.** A foot is down for 0.80 m of travel at a
  walk and 0.72 m at a run (`gait.js`); going faster means a smaller share of the
  stride on the ground, never a longer reach. With those the hips never have to
  give way at a steady pace - 11 mm at a jog, 5 mm flat out. If `hipDrop` grows,
  something upstream has changed.
- **Setting off from a standstill resets the gait phase.** Wherever it happened
  to be, one foot was about to be told it had been down for most of a step and
  must stay there while he walked off: a lunge, and the hips dropping 18 cm, on
  every first stride. `animate()` starts the phase where a foot that is right
  under the hips belongs.

## Multiplayer## Multiplayer

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
- **The avatar is loaded once and cloned for every rig** (`avatar.js`). Clones
  share geometry, textures and materials and get skeletons of their own, so
  somebody walking past costs a skeleton, not a download.
- **A proportion check cannot see an absence.** Every measurement passed while the
  figure had no jaw, no eyelid and no deltoid. The checks were confirming that what
  existed was the right size and saying nothing about what had never been built.
- **A test written by whoever made the assumption will protect it.** One of those
  checks was `eye opening never wider than the ball`, written because that was how
  the lid margin had been built. It was not guarding the face, it was guarding the
  construction, and it passed happily while the eyes were a fifth too small.
- **The default pace, 3.6 m/s, is a jog, so it is animated as one.** For a while
  it was animated as a walk stretched over a running stride - a lunge on every
  step with the arms hanging dead. The walk is what you see below about 2 m/s:
  crouching, a half-pushed thumbstick, speeding up and slowing down. The two
  blend across 1.85-2.75 m/s, which is where people change over by themselves.
