# The Red Rebellion Hub

A Netflix-style viewer for **The Red Rebellion: Enter the Skyline I**, plus the animated
adaptation of it — **Season 1, Episode 1: "Storyline"**.

This folder is completely self-contained and is **not** linked from the main site.
Nothing here touches `index.html` at the project root.

## How to watch

Open `index.html` in a browser (double-click it, or drag it into a window), then hit **Play**.
It works straight off the file system — no server, no build step, no internet.

Turn your sound on. The voices come from your device's own speech engine.

## What's in here

```
red-rebellion-hub/
├── index.html              the hub — billboard, episode row, cast, the eight pages
├── watch.html              the player
├── assets/
│   ├── icon.svg            app icon (cat-pirate jolly roger)
│   ├── favicon.svg         tab icon
│   ├── css/hub.css         browse styling
│   ├── css/player.css      player styling, camera moves, character animation
│   └── js/
│       ├── audio.js        the score and every sound effect, synthesised live
│       ├── cast.js         every character and every set, drawn as pencil-line SVG
│       ├── episode-s1e1.js the script — 22 scenes, 46 beats
│       └── player.js       playback engine: scenes, voices, captions, cues
```

## The episode

**Story order is not sheet order.** The book is told out of sequence: it opens on the
execution and works backwards to the cat pirates, so that the whole thing lands on
*"OR CAN THEY?!"* — the last thing in the book. The episode is cut that way.

| Order | Sheet | What happens |
|---|---|---|
| Title | 1 | The Red Rebellion: Enter the Skyline I |
| 1 | **7** | Voices in the dark. "Capture him for execution immediately!" **Slam.** |
| 2 | **8** | Chains. "How could I let this happen!" — then a click, **BREAK!**, and **HOLD IT.** |
| 3 | **6** | "WHERE IS HE?!" He's gone. "Thanks dude!" — and it goes in the paper: 20,000,000 berry. |
| 4 | **5** | Redrix reads it. "A pirate?!" The crew laugh at him for wanting it. |
| 5 | **4** | The cat pirates attack. **BOOM.** "Our ship! Our Jolly Roger!" |
| 6 | **3** | "Ah, the cat pirates rule these waters!" Virakshan gets Redrix out. |
| 7 | **2** | Ranashakoren Island, and the journey on. "FULL SPEED AHEAD!!!" |
| 8 | **2** | The cat pirates still roam the ocean. Nobody can stop them — **OR CAN THEY?!** |

Every frame from all eight sheets is in there.

**Every line of dialogue in the episode is written on one of the pages.** Nothing was added
to the story. Where a page shows a shout with no speaker drawn (page 7 is nothing but speech
bubbles), the line is staged as an off-screen voice rather than given new words.

### Names the pages don't give

**Redrix** is the lead — the striped-shirt one on the ship reading the bounty.
**Virakshan** is the one who gets him out on sheet 3 and then calls the course for the
island. Neither name is written anywhere in book one, so they're used only where the show
has to label somebody: the caption speaker tag, the cast row, and the credits. Nobody says
either name out loud, because no page does.

Two things the show had to decide, and can be changed in a line of script:

- **Virakshan speaks the sheet-3 bubble** — *"I've got you. You will no longer serve as a
  top hat pirate. Go, your role as a subordinate is over."* It's one bubble on the page, so
  it stays one speech; it's staged as him catching Redrix and dismissing the Top Hat Pirate.
- **Sheet 3 shouts "Declan!"** The line is kept exactly as written, but the episode doesn't
  decide who it's aimed at, because the pages don't either.

## Controls

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` `→` | Previous / next line |
| `R` | Restart |
| `C` | Captions on/off |
| `V` | Voices on/off |
| `M` | Music on/off |
| `F` | Fullscreen |

Click the progress bar to jump anywhere. Your place is remembered, so the hub shows a
**Continue Watching** row when you come back.

You can also link straight to a moment: `watch.html?ep=s1e1&beat=35`.

## How it works

Nothing is downloaded and nothing is sent anywhere.

- **Pictures** — every character and set is generated as SVG line-work in `cast.js`, then
  put through a turbulence filter so the lines wobble like pencil. Characters are posed by
  rotating their arms about the shoulder; the one who is speaking gets a moving mouth.
- **Voices** — the Web Speech API. Each character gets a different system voice plus its own
  pitch and rate, so the Marine Captain sounds nothing like the Lookout. If your device has
  no speech voices, the episode still plays on captions and timing alone.
- **Music** — nine cues (`main`, `sea`, `menace`, `battle`, `ashes`, `curious`, `justice`,
  `dread`, `rescue`), each a 16-step loop of bass, plucked lead, pad and drums scheduled
  through the Web Audio API. The score ducks under dialogue automatically.
- **Sound effects** — `BOOM`, `Click`, `Slam`, `BREAK!`, waves, page turns and the title
  sting are all built from oscillators and filtered noise.

## Adding Episode 2

Copy `assets/js/episode-s1e1.js` to `episode-s1e2.js`, change the `id` at the top, register
it on `window.RREpisodes`, add the `<script>` tag to `watch.html`, and add a card to the
`EPISODES` array in `index.html`. The engine takes it from there.
