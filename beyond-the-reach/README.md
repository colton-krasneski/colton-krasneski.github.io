# BEYOND THE REACH

An original anime series that plays in a browser, wrapped in a Netflix-style streaming
front-end called **ODYSSEA**.

**Season 1, Episode 1 — “Raise Your Colors”** · 23:00 · 313 shots · 187 spoken lines

> Two hundred miles west, the ocean stands up in a wall of cold light, and no ship has ever
> crossed it. Rook Vantier has a dead pirate's compass that doesn't point north, a half-built
> boat in a sea cave, and one sentence he has been saving for eight years.

## Run it

Open `index.html`. That's the whole install.

```
start index.html          # Windows
```

Serving it over `http://localhost` instead of `file://` is nicer if you plan to use the voice
APIs, since some browsers restrict cross-origin requests from `file://`:

```
npx serve .
```

Press **Play** on the hero, or pick Episode 1 from the row below it.

| Key | |
|---|---|
| `Space` | play / pause |
| `←` `→` | ±10 seconds |
| `Esc` | back to browse |
| `CC` | subtitles on/off |
| `🎙` | Voice Studio |
| `☰` | full screenplay |

## Voices — the part that decides whether it sounds like a show or a satnav

Out of the box the episode uses browser speech synthesis so it plays instantly. It sounds
like a satnav. To get actual performances, open **Voice Studio** (🎙 in the player, or in
the top nav) and add a key.

**ElevenLabs** is the recommended provider. Three things in `js/voice.js` are doing the work:

1. **Per-character delivery profiles.** Every role has its own `stability` / `style` /
   `speed`, not one global setting. Ardent sits at `stability: .74` because he never
   raises his voice; Rook sits at `.34` because he's seventeen and can't hold a line steady.
2. **Request stitching.** Each line is sent with `previous_request_ids` from that
   character's last three takes, plus `previous_text` / `next_text` from the surrounding
   dialogue. Intonation then carries *across cuts* instead of resetting to neutral on every
   line — which is the single biggest reason TTS dialogue normally sounds like an NPC.
3. **Per-line acting direction.** Every beat carries an emotion (`determined`, `dying`,
   `bitter`, `breathless`…). On `eleven_v3` that becomes an audio tag; on OpenAI's
   `gpt-4o-mini-tts` it becomes written direction in the `instructions` field.

Steps:

1. Pick a provider and paste your key (it is stored in this browser's `localStorage` only,
   and is never sent anywhere except that provider).
2. **Load voices from my account** → cast each of the ten roles. Defaults are pre-filled
   with ElevenLabs' stock voice ids; re-cast anything that 404s.
3. **Render all voices.** Takes are cached in IndexedDB, so replays are instant and offline,
   and a take you like stays fixed. Timings automatically re-fit around the real audio.

Dialogue beats are never cut short — they run as long as the take does. Held shots, action
beats and the credits flex to keep the episode landing on 23:00.

### Rendering voices from the command line

```
ELEVENLABS_API_KEY=sk_... node tools/render-voices.mjs
ELEVENLABS_API_KEY=sk_... node tools/render-voices.mjs --model eleven_v3 --only rook,thorne
OPENAI_API_KEY=sk-...    node tools/render-voices.mjs --provider openai
node tools/render-voices.mjs --dry          # show the cast and line counts, call nothing
```

Writes `voices/ep1_<n>_<character>.mp3`. Useful for archiving or for cutting the audio into
a video edit — the player itself reads from IndexedDB, not this folder.

## What's actually in here

No image, audio, video or font assets. Every frame, every note and every wave is generated
at runtime.

| File | |
|---|---|
| `js/episode-01.js` | the episode: 313 beats of scene, shot, staging, camera, dialogue, emotion, score and sfx |
| `js/art.js` | 27 scenes and 10 characters as procedural SVG — cel shading, rim light, expressions, parallax groups |
| `js/engine.js` | timeline, camera interpolation, crossfades, transport, browse shell, Voice Studio |
| `js/audio.js` | the score: a small synth + step sequencer. 11 cues including the OP theme, plus ambience beds and 15 sfx |
| `js/voice.js` | TTS providers, delivery profiles, request stitching, IndexedDB cache |
| `js/fx.js` | canvas particles — rain, embers, sea spray, ash, gulls, speed lines, god rays |

### Episode structure

```
Cold Open      3:25    the night on the rocks, eight years ago
Opening        1:08    OP titles
Part A         7:29    Saltmarrow, Tithe Day, the sea cave, a ship with no colors
Eyecatch       0:09
Part B         9:33    the Drowned Dog, the raid, the chain, the flag
Ending         0:56    ED credits
Next Episode   0:20    preview
                      ─────
                      23:00
```

## Cast

| | |
|---|---|
| **Rook Vantier**, 17 | Dockhand. Reckless, funny, and completely serious underneath it. |
| **Nell Ostrand**, 18 | Keeps the harbour crane running. Deadpan. The only one doing arithmetic. |
| **Capt. Iris Thorne** | Master of the *Ember Gull*. Low, unhurried, amused by dangerous things. |
| **Cdre. Vesk Ardent** | Meridian Concord. Has never once needed to raise his voice. |
| **Elias Hallow** | The man on the rocks. Rude about dying. |
| | *plus Mama Dol, Bosun Grit, Lt. Pike, the Concord Crier* |

## Development

```
node tools/shots.mjs                 # screenshot the browse page + one frame per key beat
                                     # (needs: npm i playwright)
```

The player exposes `window.BTR` — `play()`, `pause()`, `seek(seconds)`, `TL` (the built
timeline), `total` — for poking at it from the console.

To write Episode 2, add `js/episode-02.js` in the same shape and register it in the `EPS`
array in `js/engine.js`. New scenes are functions in `Art.SCENES` returning `{grade, amb, fx,
layers}`, where each layer is `[parallaxDepth, svgString]`.
