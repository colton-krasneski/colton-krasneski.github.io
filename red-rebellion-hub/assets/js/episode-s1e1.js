/* ============================================================
   THE RED REBELLION
   Season 1, Episode 1 — "Storyline"

   Cut in STORY order, which is not sheet order. The book opens on
   the execution and works backwards to the cat pirates, closing on
   "OR CAN THEY?!" — the last thing in the whole book.

     the execution ........ sheet 7
     chains, and the break  sheet 8
     the escape, the paper  sheet 6
     Redrix reads it ...... sheet 5
     the cat pirates attack sheet 4
     these waters .........  sheet 3
     Ranashakoren Island ..  sheet 2
     "OR CAN THEY?!" ......  sheet 2, last

   Every frame from all eight sheets is here, and every line of
   dialogue is written on a page. Nothing was added to the story.
   ============================================================ */
window.RREpisodes = window.RREpisodes || {};

window.RREpisodes.s1e1 = {
  id: 's1e1',
  season: 1,
  episode: 1,
  title: 'Storyline',
  showTitle: 'The Red Rebellion',
  arc: 'Enter the Skyline I',
  year: 2026,
  rating: 'TV-Y7',
  synopsis: 'A man is dragged off for execution and broken out of his chains. It goes in the paper, Redrix reads it, and his crewmates laugh at him for wanting to be a pirate — right up until the cat pirates come over the side. Virakshan gets Redrix out, the ship makes Ranashakoren Island, and the ocean still belongs to the cat pirates. Or does it?',
  tags: ['Adventure', 'Pirates', 'Hand-Drawn'],

  scenes: [

    /* ── SHEET 1 — the cover ──────────────────────────────── */
    {
      id: 'sc00', page: 1, set: 'cover', cue: 'main', camera: 'push',
      actors: [
        { id: 'redrix', x: 530, y: 306, scale: 1.9, pose: 'idle' },
        { id: 'crew1', x: 1080, y: 323, scale: 1.8, pose: 'cheer', flip: true }
      ],
      beats: [
        { t: 'title', text: 'THE RED REBELLION', sub: 'Enter the Skyline I', hold: 4600, sfx: 'tadum' },
        { t: 'card', text: 'SEASON 1 · EPISODE 1', sub: '"Storyline"', hold: 2800, sfx: 'page' }
      ]
    },

    /* ── SHEET 7 — a man is taken for execution ───────────── */
    {
      id: 'sc01', page: 7, set: 'dark', cue: 'dread', camera: 'static', dark: true,
      actors: [],
      beats: [
        { t: 'line', who: 'marinecap', text: 'Do you have him?',
          bubble: { x: 110, y: 96, w: 520, h: 210, tail: 'bl', size: 40, lines: ['Do you', 'have him?'] } },
        { t: 'line', who: 'hunter', text: 'Yes, everything is going to plan.',
          bubble: { x: 900, y: 150, w: 600, h: 230, tail: 'br', size: 38, lines: ['Yes, everything', 'is going to plan.'] } },
        { t: 'line', who: 'marinecap', text: 'Capture him for execution immediately!',
          bubble: { x: 90, y: 425, w: 600, h: 245, tail: 'tl', size: 36, lines: ['Capture him for', 'execution', 'immediately!'] } },
        { t: 'line', who: 'hunter', shout: true, text: 'YES CAPTAIN!',
          bubble: { x: 910, y: 435, w: 580, h: 230, tail: 'tr', size: 50, lines: ['YES', 'CAPTAIN!'] } },
        { t: 'sfxcard', text: '*Slam*', sfx: 'slam', hold: 1800, small: true },
        { t: 'line', who: 'hunter', shout: true, text: 'OK! MOVE IT!', card: true, hold: 2600 }
      ]
    },

    /* ── SHEET 8 — chains, and something breaking ─────────── */
    {
      id: 'sc02', page: 8, set: 'stocks', cue: 'dread', camera: 'push',
      actors: [
        { id: 'escapee', x: 683, y: 300, scale: 1.95, pose: 'bound' }
      ],
      beats: [
        { t: 'sfxcard', text: '*Click*', sfx: 'click', hold: 1700, small: true },
        { t: 'line', who: 'escapee', pose: 'bound', shout: true, text: 'How could I let this happen!' }
      ]
    },
    {
      id: 'sc03', page: 8, set: 'stocks', cue: 'rescue', camera: 'panL',
      actors: [
        { id: 'escapee', x: 683, y: 300, scale: 1.95, pose: 'bound' },
        { id: 'rescuer', x: 180, y: 448, scale: 2.0, pose: 'point' }
      ],
      beats: [
        { t: 'sfxcard', text: '*click*', sfx: 'click', hold: 1500, small: true },
        { t: 'line', who: 'rescuer', pose: 'point', text: "Don't worry, sir, I got you!" }
      ]
    },
    {
      id: 'sc04', page: 8, set: 'stocks', cue: 'rescue', camera: 'shake',
      actors: [
        { id: 'escapee', x: 683, y: 300, scale: 1.95, pose: 'cheer' },
        { id: 'rescuer', x: 180, y: 448, scale: 2.0, pose: 'cheer' }
      ],
      beats: [
        { t: 'sfxcard', text: '*BREAK!*', sfx: 'break', hold: 2400 },
        { t: 'line', who: 'unknown', shout: true, text: 'HOLD IT.', card: true, cue: 'dread', hold: 3400 }
      ]
    },

    /* ── SHEET 6 — he is gone, and it goes in the paper ───── */
    {
      id: 'sc05', page: 6, set: 'cell', cue: 'justice', camera: 'shake',
      actors: [
        { id: 'hunter', x: 520, y: 375, scale: 2.3, pose: 'aim' }
      ],
      beats: [
        { t: 'sfxcard', text: '*Click*', sfx: 'click', hold: 1700, small: true },
        { t: 'line', who: 'hunter', pose: 'aim', shout: true, text: 'WHERE IS HE?!' }
      ]
    },
    {
      id: 'sc06', page: 6, set: 'cell', cue: 'curious', camera: 'panR',
      actors: [
        { id: 'escapee', x: 980, y: 375, scale: 2.3, pose: 'run' },
        { id: 'cellmate', x: 300, y: 384, scale: 2.25, pose: 'idle' }
      ],
      beats: [
        { t: 'line', who: 'escapee', pose: 'run', text: 'Thanks, dude!' },
        { t: 'line', who: 'cellmate', pose: 'talk', text: "What kind of a cellmate would I be if I didn't help out?" }
      ]
    },
    {
      id: 'sc07', page: 6, set: 'justice', cue: 'justice', camera: 'pull',
      actors: [],
      beats: [
        { t: 'beat', hold: 3400, sfx: 'waves' }
      ]
    },
    {
      id: 'sc08', page: 6, set: 'poster', cue: 'curious', camera: 'push',
      actors: [],
      beats: [
        { t: 'narr', text: 'Escaped Criminal with 20,000,000 berry bounty!', hold: 4200, sfx: 'page' }
      ]
    },

    /* ── SHEET 5 — Redrix reads it ────────────────────────── */
    {
      id: 'sc09', page: 5, set: 'deck', cue: 'curious', camera: 'panR',
      actors: [
        { id: 'crew1', x: 150, y: 320, scale: 2.1, pose: 'point' },
        { id: 'crew2', x: 560, y: 329, scale: 2.05, pose: 'idle' },
        { id: 'redrix', x: 1330, y: 320, scale: 2.1, pose: 'read', flip: true }
      ],
      beats: [
        { t: 'line', who: 'crew1', pose: 'point', text: 'He is reading the bounty of somebody!' },
        { t: 'line', who: 'crew2', pose: 'shock', shout: true, text: 'A pirate?!' },
        { t: 'line', who: 'redrix', pose: 'read', text: 'Where is the hangout?' },
        { t: 'line', who: 'crew1', pose: 'talk', text: 'He really wants to be a pirate!' }
      ]
    },

    /* ── SHEET 4 — the cat pirates attack ─────────────────── */
    {
      id: 'sc10', page: 4, set: 'deck', cue: 'battle', camera: 'shake',
      actors: [
        { id: 'crew2', x: 480, y: 303, scale: 2.2, pose: 'shock' },
        { id: 'crew1', x: 1180, y: 312, scale: 2.15, pose: 'shock', flip: true }
      ],
      beats: [
        { t: 'line', who: 'crew2', pose: 'shock', shout: true, text: "We're being attacked!" }
      ]
    },
    {
      id: 'sc11', page: 4, set: 'attack', cue: 'battle', camera: 'shake',
      actors: [],
      beats: [
        { t: 'sfxcard', text: 'BOOM', sfx: 'boom', hold: 2600 }
      ]
    },
    {
      id: 'sc12', page: 4, set: 'wreck', cue: 'ashes', camera: 'pull',
      actors: [
        { id: 'crew1', x: 1160, y: 288, scale: 2.0, pose: 'shock' }
      ],
      beats: [
        { t: 'beat', hold: 2000 },
        { t: 'line', who: 'crew1', pose: 'shock', shout: true, text: 'Our ship! Our Jolly Roger!' }
      ]
    },
    {
      id: 'sc13', page: 4, set: 'deck', cue: 'ashes', camera: 'push',
      actors: [
        { id: 'crew2', x: 620, y: 303, scale: 2.2, pose: 'point' },
        { id: 'virakshan', x: 1120, y: 303, scale: 2.2, pose: 'idle', flip: true }
      ],
      beats: [
        { t: 'line', who: 'crew2', pose: 'point', shout: true, text: 'Sir!' }
      ]
    },

    /* ── SHEET 3 — these waters, and Virakshan ────────────── */
    {
      id: 'sc14', page: 3, set: 'crowsnest', cue: 'menace', camera: 'pull',
      actors: [
        { id: 'catcap', x: 700, y: 176, scale: 1.4, pose: 'point' }
      ],
      beats: [
        { t: 'line', who: 'catcap', pose: 'point', text: 'Ah, the cat pirates rule these waters!' }
      ]
    },
    {
      id: 'sc15', page: 3, set: 'deck', cue: 'menace', camera: 'push',
      actors: [
        { id: 'virakshan', x: 260, y: 285, scale: 2.3, pose: 'point' },
        { id: 'redrix', x: 900, y: 312, scale: 2.15, pose: 'idle', flip: true },
        { id: 'tophat', x: 1220, y: 303, scale: 2.2, pose: 'idle', flip: true }
      ],
      beats: [
        { t: 'line', who: 'tophat', pose: 'shout', shout: true, text: 'Declan!' },
        { t: 'line', who: 'virakshan', pose: 'point', text: "I've got you.", cue: 'rescue' },
        { t: 'line', who: 'virakshan', pose: 'talk', text: 'You will no longer serve as a top hat pirate.' },
        { t: 'line', who: 'virakshan', pose: 'point', text: 'Go. Your role as a subordinate is over.' },
        { t: 'pose', who: 'tophat', pose: 'slump', hold: 1600 }
      ]
    },
    {
      id: 'sc16', page: 3, set: 'chart', cue: 'curious', camera: 'panL',
      actors: [
        { id: 'redrix', x: 1220, y: 543, scale: 1.8, pose: 'read' }
      ],
      beats: [
        { t: 'line', who: 'redrix', pose: 'read', text: 'Where is it now?' }
      ]
    },

    /* ── SHEET 2 — Ranashakoren Island, and the journey on ── */
    {
      id: 'sc17', page: 2, set: 'island', cue: 'sea', camera: 'panR',
      actors: [
        { id: 'redrix', x: 620, y: 308, scale: 2.0, pose: 'idle' },
        { id: 'virakshan', x: 1080, y: 299, scale: 2.05, pose: 'point', flip: true }
      ],
      beats: [
        { t: 'beat', hold: 2400, sfx: 'waves' },
        { t: 'narr', text: 'Welcome to Ranashakoren Island!', hold: 3200 }
      ]
    },
    {
      id: 'sc18', page: 2, set: 'deck', cue: 'sea', camera: 'pull',
      actors: [
        { id: 'virakshan', x: 380, y: 303, scale: 2.2, pose: 'steer' },
        { id: 'crew1', x: 1000, y: 312, scale: 2.15, pose: 'idle', flip: true },
        { id: 'crew2', x: 1280, y: 320, scale: 2.1, pose: 'idle', flip: true }
      ],
      beats: [
        { t: 'line', who: 'virakshan', pose: 'cheer', shout: true, text: "Alright men! Let's continue our journey!" }
      ]
    },
    {
      id: 'sc19', page: 2, set: 'shipfar', cue: 'sea', camera: 'push',
      actors: [],
      beats: [
        { t: 'line', who: 'virakshan', text: 'FULL SPEED AHEAD!!!', shout: true, card: true, hold: 3200, sfx: 'whoosh' }
      ]
    },

    /* ── SHEET 2 — and the ocean still belongs to them ────── */
    {
      id: 'sc20', page: 2, set: 'island', cue: 'menace', camera: 'panL',
      actors: [
        { id: 'catcap', x: 1000, y: 308, scale: 2.0, pose: 'idle' }
      ],
      beats: [
        { t: 'narr', text: 'Now, the evil cat pirates roam the ocean.' },
        { t: 'narr', text: 'Nobody can stop them.' },
        { t: 'line', who: 'catcap', pose: 'shout', shout: true, text: 'NOTHING WILL STAND IN OUR WAY!' }
      ]
    },

    /* ── the last thing in the book ───────────────────────── */
    {
      id: 'sc21', page: 2, set: 'paper', cue: 'main', camera: 'shake',
      actors: [],
      beats: [
        { t: 'card', text: 'OR CAN THEY?!', hold: 4200, sfx: 'page', big: true }
      ]
    },
    {
      id: 'sc22', page: 2, set: 'paper', cue: 'main', camera: 'static',
      actors: [],
      beats: [
        { t: 'card', text: 'TO BE CONTINUED', hold: 3600, sfx: 'tadum' },
        { t: 'credits', hold: 9000 }
      ]
    }
  ]
  /* the closing credits are built from the cast in cast.js */
};
