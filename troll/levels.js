/* ===========================================================================
   The worlds.

   Every stage is 40 wide by 16 tall. Legend, so this file reads on its own:

     .  air        #  brick        =  crumbles under you     ~  jump-through
     ^v<>  spikes (up / down / left / right)
     S  start      G  the door     B  where the boss stands
     M  platform slides sideways   N  platform slides up and down
     L  laser eye in the ceiling
     ?  looks solid, is NOT        !  looks like air, IS solid once bumped
     T  spike hiding in the floor  x  looks like a spike, harmless

   Measured from the real physics, a running jump clears 5 tiles across and
   3.4 tiles up. So every gap here is 4 tiles or less and every climb is 3 or
   less — mean, but never impossible. A robot re-checks that claim on every
   single stage before any of this ships.

   Rows 13-15 are the ground. A hole in them goes nowhere: you fall out of the
   world. That is the whole game.
   =========================================================================== */

/* Ground with 4-wide holes. Solid 0-7, 12-19, 24-31, 36-39. */
const F4 = '########....########....########....####';
/* Ground with 3-wide holes. Solid 0-4, 8-12, 16-20, 24-28, 32-39. */
const F3 = '#####...#####...#####...#####...########';
/* Two ledges and a long drop between them. */
const CHASM = '#######...........................######';
const ENDS  = '######............................######';
const FAR   = '#####..............................#####';
const SPLIT = '######..........######............######';
const AIR   = '........................................';

const floor = row => [row, row, row];

export const WORLDS = [
  {
    name: 'Green Hills',
    sub: 'it looks friendly',
    colour: '#4ade80', sky: '#0f2418', ink: '#0b1a11',
    music: { root: 220.0, scale: [0, 2, 4, 7, 9], tempo: 300, wave: 'square' },
    boss: { name: 'Big Green', hp: 3, speed: 1.5, jump: 11, attack: 'stomp' },
    levels: [
      {
        name: 'Hello', hint: 'Arrows or A/D to walk. Up, W or Space to jump.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '.............####........####...........',
          AIR,
          '..S..........xxx.....................G..',
          ...floor(F4)
        ]
      },
      {
        name: 'Trust Issues', hint: 'Not everything holds your weight.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '.................!!.....................',
          AIR, AIR,
          '........????............................',
          AIR,
          '..S..................................G..',
          ...floor(F4)
        ]
      }
    ]
  },

  {
    name: 'Spike Gardens',
    sub: 'mind the flowers',
    colour: '#f472b6', sky: '#2a0f22', ink: '#1a0714',
    music: { root: 233.1, scale: [0, 3, 5, 7, 10], tempo: 280, wave: 'square' },
    boss: { name: 'Thorn', hp: 3, speed: 2.0, jump: 12, attack: 'spikes' },
    levels: [
      {
        name: 'Tiptoe', hint: 'Spikes only hurt from the pointy side. All of them.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '..............====......................',
          AIR,
          // spikes kept clear of the pit edges: you need a run-up to clear a
          // four-tile hole, and there is no run-up if you land on a spike
          '..S.^^..' + '....' + '..^^^...' + '....' + '..^^^...' + '....' + '.G..',
          ...floor(F4)
        ]
      },
      {
        name: 'Liar Liar', hint: 'Some spikes are painted on.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '....................!!!.................',
          AIR, AIR,
          '........????........????................',
          AIR,
          '..S..xx.......^^^^........xxxx.......G..',
          ...floor(F4)
        ]
      }
    ]
  },

  {
    name: 'Laser Labs',
    sub: 'do not look up',
    colour: '#38bdf8', sky: '#08192b', ink: '#04101d',
    music: { root: 196.0, scale: [0, 2, 3, 7, 8], tempo: 250, wave: 'sawtooth' },
    boss: { name: 'The Eye', hp: 4, speed: 1.8, jump: 10, attack: 'lasers' },
    levels: [
      {
        name: 'Blink', hint: 'The eye blinks red before it fires.',
        rows: [
          '....L..........L..........L.............',
          AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '..S..................................G..',
          ...floor(F4)
        ]
      },
      {
        name: 'Crossfire', hint: 'Do not stop to think about it.',
        rows: [
          '......L.......L.......L.......L.........',
          AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '.............====........====...........',
          AIR,
          '..S...........^^.....................G..',
          ...floor(F4)
        ]
      }
    ]
  },

  {
    name: 'Crumble Caves',
    sub: 'nothing holds',
    colour: '#fbbf24', sky: '#241703', ink: '#170e02',
    music: { root: 174.6, scale: [0, 2, 5, 7, 10], tempo: 320, wave: 'triangle' },
    boss: { name: 'Rumble', hp: 4, speed: 2.2, jump: 13, attack: 'stomp' },
    levels: [
      {
        name: 'Give Way', hint: 'Keep moving. Seriously.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '........===...===...===...===..===......',
          '..S..................................G..',
          ...floor(CHASM)
        ]
      },
      {
        name: 'Hold Nothing', hint: 'The shortcut is a lie.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '............???...........???...........',
          AIR,
          '.......===..===..===..===..===..........',
          '..S..................................G..',
          ...floor(ENDS)
        ]
      }
    ]
  },

  {
    name: 'Moving Day',
    sub: 'stand still and lose',
    colour: '#a78bfa', sky: '#170f2e', ink: '#0e0920',
    music: { root: 246.9, scale: [0, 2, 4, 6, 9], tempo: 240, wave: 'square' },
    boss: { name: 'Shifty', hp: 4, speed: 2.6, jump: 12, attack: 'sweep' },
    levels: [
      {
        name: 'All Aboard', hint: 'Wait for your ride.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '......#.M...........#.M..........#......',
          '..S..................................G..',
          ...floor(ENDS)
        ]
      },
      {
        name: 'Up and Over', hint: 'Lifts go both ways.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR,
          '..................#.....................',
          AIR,
          '..................N.....................',
          AIR, AIR,
          '......#.M......#......#.M........#......',
          '..S..............^^..................G..',
          ...floor(SPLIT)
        ]
      }
    ]
  },

  {
    name: 'Fake Town',
    sub: 'believe nothing',
    colour: '#f97316', sky: '#25130a', ink: '#180c05',
    music: { root: 185.0, scale: [0, 1, 5, 7, 8], tempo: 260, wave: 'sawtooth' },
    boss: { name: 'Mirage', hp: 5, speed: 2.4, jump: 12, attack: 'fake' },
    levels: [
      {
        name: 'Nothing Is Real', hint: 'Every bridge here is painted on.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '..........!!................!!..........',
          AIR, AIR,
          '.....???.....???.....???.....???........',
          AIR,
          '..S.......xx.......^^......xx.......G...',
          ...floor(F3)
        ]
      },
      {
        name: 'The Long Con', hint: 'The floor has opinions too.',
        rows: [
          '........L.............L.................',
          AIR, AIR, AIR, AIR, AIR, AIR,
          '............!!!.........................',
          AIR, AIR,
          '.....???.............???................',
          AIR,
          '..S.......T........^^......T........G...',
          ...floor(F3)
        ]
      }
    ]
  },

  {
    name: 'Sky Panic',
    sub: 'a long way down',
    colour: '#22d3ee', sky: '#062230', ink: '#031721',
    music: { root: 261.6, scale: [0, 2, 4, 7, 11], tempo: 220, wave: 'triangle' },
    boss: { name: 'Gust', hp: 5, speed: 3.0, jump: 14, attack: 'sweep' },
    levels: [
      {
        name: 'Thin Air', hint: 'There is no floor. There is only nerve.',
        rows: [
          '..........L.........L.........L.........',
          AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '......===..===..===..===..===..===......',
          '..S..................................G..',
          ...floor(FAR)
        ]
      },
      {
        name: 'Leap of Faith', hint: 'Trust the platform. Not the block.',
        rows: [
          AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
          '..................???...................',
          AIR,
          '......#.M........#..===..===..===.......',
          '..S..................................G..',
          ...floor(FAR)
        ]
      }
    ]
  },

  {
    name: 'The Vault',
    sub: 'everything at once',
    colour: '#ef4444', sky: '#1a0505', ink: '#100303',
    music: { root: 155.6, scale: [0, 1, 4, 6, 7], tempo: 200, wave: 'sawtooth' },
    boss: { name: 'The Troll', hp: 6, speed: 3.2, jump: 13, attack: 'all' },
    levels: [
      {
        name: 'Gauntlet', hint: 'You have met all of this before.',
        rows: [
          '....L.......L.......L.......L...........',
          AIR, AIR, AIR, AIR, AIR, AIR,
          '.........!!..................!!.........',
          AIR, AIR,
          '.....???.............???................',
          AIR,
          '..S...^T^........xx.......^^T.......G...',
          ...floor(F3)
        ]
      },
      {
        name: 'Goodbye', hint: 'Good luck. You will need less than you think.',
        rows: [
          '...L.....L.....L.....L.....L............',
          AIR, AIR, AIR, AIR, AIR, AIR,
          '.......!!.......!!.......!!.............',
          AIR, AIR,
          '.....???.....???.....???.....???........',
          AIR,
          '..S...T^T........^T^.......T^T....xx.G..',
          ...floor(F3)
        ]
      }
    ]
  }
];

/** A flat list of every stage, boss rounds included, in playing order. */
export function allStages() {
  const out = [];
  WORLDS.forEach((w, wi) => {
    w.levels.forEach((l, li) =>
      out.push({ world: wi, index: li, kind: 'level', name: l.name, hint: l.hint, rows: l.rows }));
    out.push({
      world: wi, index: w.levels.length, kind: 'boss', name: w.boss.name,
      hint: 'Land on its head ' + w.boss.hp + ' times.', rows: bossArena(wi)
    });
  });
  return out;
}

/** Boss rounds share one arena, which gains nastier furniture as you go. */
export function bossArena(wi) {
  const rows = [
    AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR, AIR,
    '..S....................B................',
    '########################################',
    '########################################',
    '########################################',
    '########################################',
    '########################################',
    '########################################'
  ];
  if (wi >= 2) rows[10] = '########^^^###################^^^#######';
  if (wi >= 4) rows[5]  = '.......~~~~~..............~~~~~.........';
  if (wi >= 6) rows[0]  = '#####L##############L###################';
  return rows;
}
