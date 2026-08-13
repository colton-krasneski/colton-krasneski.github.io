/* ===========================================================================
   Letter of 8-12-26 — a notebook of how this site got here, and a letter at
   the back of it.

   Nobody took screenshots in 2023, so nothing here is a photograph. Every
   page is rebuilt from what the repository actually held on that date: the
   real dates, the real commit messages, and the real list of apps sitting on
   the dock that day. Page one goes furthest — it renders the original 2023
   markup, exactly as written, in a frame.
   =========================================================================== */

const $ = id => document.getElementById(id);

/* The original page, word for word out of the first commits. */
const FIRST_PAGE = `<!DOCTYPE html><html><head><title>Colton's Page</title></head>
<body style="background-color:aqua"><h1 style="color:black">Colton's Page</h1><br/>
<p style="color:green">Most of these games have only been tested on chrome it might work on wave browser.</p><br/>
<strong>A website I made for children of all ages to play or mess around with. P.S no hacks please</strong><br/>
<a href="#">Colton's gameplay school the CRPG-preview</a><br/>
<a href="#">Learn about gameplay school and the development.</a><br/>
<a href="#">mystery game / it might seem easy to start off with</a></body></html>`;

const dock = (...apps) => apps;

const PAGES = [
  {
    when: '24 MARCH 2023', what: 'Day one',
    say: 'It began as <em>Colton\'s Page</em>: an aqua background, a black heading and three links. ' +
         'Built for “children of all ages to play or mess around with. P.S no hacks please.” ' +
         'What you are looking at is not a drawing of it — it is the original file, still running.',
    cap: 'the very first index.html, rendered from the first commit',
    kind: 'first'
  },
  {
    when: '1 APRIL 2023', what: 'Hangman, and then silence',
    say: 'A random generator went up, then a hangman game. Nine commits in eight days, and then nothing. ' +
         'The page sat exactly like this, untouched, for <em>three years and three months</em>.',
    cap: 'the last thing added before the long quiet',
    kind: 'first'
  },
  {
    when: '5 JULY 2026', what: 'The backup',
    say: 'One commit reads <em>“Remove old files (backed up locally)”</em>. The aqua page was carefully put ' +
         'somewhere safe, and in its place came falling green rain. Nothing else. Just the rain.',
    cap: 'everything cleared away, and the Matrix arrives',
    kind: 'mini', apps: dock(), head: 'COLTON\'S SITE', empty: 'only rain'
  },
  {
    when: '5 JULY 2026', what: 'It grows a lock and a voice',
    say: 'An intro, a red 1-and-0 login, a home screen with a dock. Then Messages — real accounts on Firebase, ' +
         'so two people on two different computers could actually talk. One app on the dock, and it worked.',
    cap: 'one app, and the whole idea of the phone',
    kind: 'mini', apps: dock(['💬', 'Messages']), head: 'HOME'
  },
  {
    when: '6 JULY 2026', what: 'Reactions, GIFs, and a 3D stadium',
    say: 'Messages learned to react and to search cats. Air Hockey arrived, was rebuilt the same day in ' +
         '<em>3D WebGL</em> with a tiered stadium, and the profanity filter was overhauled to beat leetspeak.',
    cap: 'two apps, one of them a stadium',
    kind: 'mini', apps: dock(['🏒', 'Air Hockey'], ['💬', 'Messages']), head: 'HOME'
  },
  {
    when: '8 JULY 2026', what: 'It learns to call, and to coach',
    say: 'Online duels over WebRTC. Then voice calls inside Messages, with a ring and a docked call widget. ' +
         'Then Soccer Trainer, which watches real cones through the camera. Then Musicfy. Then the Password Game.',
    cap: 'the day it stopped being one thing',
    kind: 'mini', head: 'HOME',
    apps: dock(['🏒', 'Air Hockey'], ['💬', 'Messages'], ['⚽', 'Soccer'], ['🎵', 'Musicfy'], ['🔑', 'Password'])
  },
  {
    when: '19 JULY 2026', what: 'A proper dock, and a Council',
    say: 'The home screen was reworked into a clean three-column grid — the shape it still has. ' +
         'The Council went up the same day: a Discord-shaped server app, made genuinely shared and multi-user, ' +
         'with its own hardened database rules.',
    cap: 'six apps and a place to argue in',
    kind: 'mini', head: 'HOME',
    apps: dock(['🏒', 'Air Hockey'], ['💬', 'Messages'], ['⚽', 'Soccer'], ['🎵', 'Musicfy'],
               ['🔑', 'Password'], ['😔', 'Drive Sad'], ['🏛️', 'Council'])
  },
  {
    when: '6 AUGUST 2026', what: 'Rooms of their own',
    say: 'index.html had grown past 364 KB, so the big apps moved out into their own folders. ' +
         'BitLife Online and AI Talk were the first two to get rooms instead of shelves.',
    cap: 'nine apps, and a pattern for every one after',
    kind: 'mini', head: 'HOME',
    apps: dock(['🏒', 'Air Hockey'], ['💬', 'Messages'], ['⚽', 'Soccer'], ['🎵', 'Musicfy'],
               ['🔑', 'Password'], ['😔', 'Drive Sad'], ['🏛️', 'Council'], ['🌆', 'BitLife'], ['🤖', 'AI Talk'])
  },
  {
    when: '12 AUGUST 2026', what: 'Today',
    say: 'Group chats and six themes for Messages. A nonogram generator that proves every puzzle it makes. ' +
         'Slides, a presentation app with its own picture search. A troll platformer whose levels are checked ' +
         'by a robot before they ship. And BitLife quietly became a local-only secret.',
    cap: 'twelve apps — and this notebook makes thirteen',
    kind: 'mini', head: 'HOME',
    apps: dock(['🏒', 'Air Hockey'], ['💬', 'Messages'], ['⚽', 'Soccer'], ['🎵', 'Musicfy'],
               ['🔑', 'Password'], ['😔', 'Drive Sad'], ['🏛️', 'Council'], ['🤖', 'AI Talk'],
               ['🧩', 'Nonogram'], ['📊', 'Slides'], ['🟥', 'Troll Sq'], ['✉️', 'Letter'])
  },
  { kind: 'letter', when: '12 AUGUST 2026', what: 'The letter' }
];

/* --------------------------- the letter's markup ---------------------------
   <b> bold, <I> italic, <u> underline, <link> a link, and /b to break a line.
   Written out by hand rather than dropped into innerHTML, so a stray angle
   bracket in the letter shows up as an angle bracket instead of breaking the
   page or smuggling in markup.
   -------------------------------------------------------------------------- */
const TAGS = { b: 'b', i: 'i', u: 'u', link: 'a' };

export function renderLetter(text, host) {
  host.innerHTML = '';
  // Tags and line breaks are found in ONE pass. They have to be: the break
  // marker /b also lives inside the closing tag </b>, so anything that hunts
  // for breaks separately saws every bold tag in half.
  //
  // A plain newline breaks the line too, because that is how anyone actually
  // writes a letter in a text file. /b swallows the newline after it, so
  // ending a line with /b and pressing return does not leave a double gap.
  // Closing tags are read loosely: </b>, <b/> and <b /> all close a bold.
  const re = /<\/\s*(b|i|u|link)\s*>|<\s*(b|i|u|link)\s*\/\s*>|<\s*(b|i|u|link)\s*>|\/b\r?\n?|\r?\n/gi;
  const src = String(text);

  let para = document.createElement('p');
  let stack = [para];
  const put = t => { if (t) stack[stack.length - 1].appendChild(document.createTextNode(t)); };
  const closeAll = () => {
    while (stack.length > 1) {
      const done = stack.pop();
      if (done.tagName === 'A') finishLink(done);
    }
  };
  const flush = () => {
    if (!para.textContent.trim()) para.innerHTML = '&nbsp;';
    host.appendChild(para);
  };

  let last = 0, m;
  while ((m = re.exec(src)) !== null) {
    put(src.slice(last, m.index));
    last = re.lastIndex;

    const closeName = m[1] || m[2];   // </b> or <b/>
    const openName = m[3];

    if (!closeName && !openName) {    // a line break
      // Formatting does NOT carry to the next line. One tag left open by
      // accident then spoils a single line, instead of the whole letter.
      closeAll();
      flush();
      para = document.createElement('p');
      stack = [para];
      continue;
    }

    if (closeName) {
      if (stack.length > 1) {
        const done = stack.pop();
        if (done.tagName === 'A') finishLink(done);
      }
    } else {
      const el = document.createElement(TAGS[openName.toLowerCase()]);
      stack[stack.length - 1].appendChild(el);
      stack.push(el);
    }
  }
  put(src.slice(last));
  closeAll();
  flush();
}

/** <link>url</link> or <link>label|url</link>. Anything odd stays plain text. */
function finishLink(a) {
  const raw = a.textContent.trim();
  const bar = raw.indexOf('|');
  let label = raw, href = raw;
  if (bar > -1) { label = raw.slice(0, bar).trim(); href = raw.slice(bar + 1).trim(); }

  // If it names a scheme, it had better be one worth following. javascript:
  // and friends are shown as plain words instead.
  const scheme = /^([a-z][a-z0-9+.\-]*):/i.exec(href);
  if (scheme && !/^(https?|mailto)$/i.test(scheme[1])) {
    a.replaceWith(document.createTextNode(raw));
    return;
  }
  if (!scheme && !/^[/.]/.test(href)) href = 'https://' + href;
  if (!href || /\s/.test(href)) {
    a.replaceWith(document.createTextNode(raw));  // not a link after all
    return;
  }
  a.textContent = label;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
}

/* --------------------------------- drawing -------------------------------- */
let at = 0;

function build() {
  const book = $('book');
  book.innerHTML = '';
  PAGES.forEach((p, i) => {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset.i = i;

    const stamp = document.createElement('div');
    stamp.className = 'stamp';
    stamp.innerHTML = '<span class="when">' + p.when + '</span>'
      + '<span class="what"></span><span class="no">' + (i + 1) + ' / ' + PAGES.length + '</span>';
    stamp.querySelector('.what').textContent = p.what;
    page.appendChild(stamp);

    const body = document.createElement('div');
    body.className = 'body';
    page.appendChild(body);

    if (p.kind === 'letter') {
      const box = document.createElement('div');
      box.className = 'letter';
      box.id = 'letterBox';
      box.textContent = 'Fetching letter.txt…';
      body.appendChild(box);
      body.appendChild(signature());
    } else {
      const say = document.createElement('div');
      say.className = 'say';
      say.innerHTML = p.say;                     // fixed text written above, not user input
      body.appendChild(say);

      const shot = document.createElement('div');
      shot.className = 'shot' + (i % 2 ? ' tilt' : '');
      shot.innerHTML = '<span class="tape a"></span><span class="tape b"></span>';
      if (p.kind === 'first') {
        const f = document.createElement('iframe');
        f.setAttribute('sandbox', '');            // the old page renders, but cannot act
        f.setAttribute('title', 'the original site');
        f.srcdoc = FIRST_PAGE;
        shot.appendChild(f);
      } else {
        shot.appendChild(miniPhone(p));
      }
      body.appendChild(shot);

      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = p.cap;
      body.appendChild(cap);
    }
    book.appendChild(page);
  });

  const dots = $('dots');
  dots.innerHTML = '';
  PAGES.forEach((p, i) => {
    const d = document.createElement('button');
    d.className = 'dot' + (p.kind === 'letter' ? ' last' : '');
    d.title = p.what;
    d.addEventListener('click', () => go(i));
    dots.appendChild(d);
  });
}

function miniPhone(p) {
  const m = document.createElement('div');
  m.className = 'mini';
  const rain = document.createElement('canvas');
  rain.className = 'rain';
  m.appendChild(rain);
  const head = document.createElement('div');
  head.className = 'head';
  head.textContent = p.head || '';
  m.appendChild(head);
  const grid = document.createElement('div');
  grid.className = 'grid';
  if (!p.apps || !p.apps.length) {
    grid.style.gridTemplateColumns = '1fr';
    grid.style.textAlign = 'center';
    grid.style.opacity = '0.55';
    grid.style.fontSize = '10px';
    grid.style.paddingTop = '26px';
    grid.textContent = p.empty || '';
  } else {
    p.apps.forEach(([ic, lb]) => {
      const a = document.createElement('div');
      a.className = 'app';
      a.innerHTML = '<div class="ic"></div><div class="lb"></div>';
      a.querySelector('.ic').textContent = ic;
      a.querySelector('.lb').textContent = lb;
      grid.appendChild(a);
    });
  }
  m.appendChild(grid);
  requestAnimationFrame(() => startRain(rain));
  return m;
}

/* The green rain, small and slow, so nine of them do not cook the laptop. */
function startRain(cv) {
  const box = cv.parentElement;
  if (!box) return;
  const w = cv.width = box.clientWidth || 300;
  const h = cv.height = box.clientHeight || 200;
  const g = cv.getContext('2d');
  const cols = Math.floor(w / 9);
  const drops = new Array(cols).fill(0).map(() => Math.random() * -20);
  let alive = true;
  const tick = () => {
    if (!alive || !document.body.contains(cv)) return;
    g.fillStyle = 'rgba(4,7,10,0.16)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#00ff41';
    g.font = '9px monospace';
    for (let i = 0; i < cols; i++) {
      g.fillText(Math.random() < 0.5 ? '0' : '1', i * 9, drops[i] * 10);
      if (drops[i] * 10 > h && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
    setTimeout(() => requestAnimationFrame(tick), 90);
  };
  tick();
}

/** The two marks at the bottom of the letter. */
function signature() {
  const s = document.createElement('div');
  s.className = 'sign';

  const marks = document.createElement('div');
  marks.className = 'marks';

  const logo = document.createElement('div');
  logo.className = 'logo';
  logo.title = "Colton's Site";
  logo.textContent = '10';
  marks.appendChild(logo);

  // Claude's mark, drawn here rather than fetched, so the page owes nothing
  // to the network.
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('aria-label', 'Claude');
  const gEl = document.createElementNS(ns, 'g');
  gEl.setAttribute('stroke', '#d97757');
  gEl.setAttribute('stroke-width', '4.4');
  gEl.setAttribute('stroke-linecap', 'round');
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 6) * i * 2;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', (20 - Math.cos(a) * 13).toFixed(2));
    line.setAttribute('y1', (20 - Math.sin(a) * 13).toFixed(2));
    line.setAttribute('x2', (20 + Math.cos(a) * 13).toFixed(2));
    line.setAttribute('y2', (20 + Math.sin(a) * 13).toFixed(2));
    gEl.appendChild(line);
  }
  svg.appendChild(gEl);
  marks.appendChild(svg);
  s.appendChild(marks);

  const by = document.createElement('div');
  by.className = 'by';
  by.textContent = 'from the hand(s) of Claude and Colton';
  s.appendChild(by);
  return s;
}

/* ------------------------------- navigation ------------------------------- */
function go(i) {
  at = Math.max(0, Math.min(PAGES.length - 1, i));
  [...$('book').children].forEach((p, k) => p.classList.toggle('on', k === at));
  [...$('dots').children].forEach((d, k) => d.classList.toggle('on', k === at));
  $('prev').disabled = at === 0;
  $('next').disabled = at === PAGES.length - 1;
}
$('prev').addEventListener('click', () => go(at - 1));
$('next').addEventListener('click', () => go(at + 1));
addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') go(at - 1);
  if (e.key === 'ArrowRight') go(at + 1);
  if (e.key === 'Home') go(0);
  if (e.key === 'End') go(PAGES.length - 1);
});
let swipeX = null;
$('book').addEventListener('pointerdown', e => { swipeX = e.clientX; });
$('book').addEventListener('pointerup', e => {
  if (swipeX === null) return;
  const d = e.clientX - swipeX;
  swipeX = null;
  if (Math.abs(d) > 60) go(at + (d < 0 ? 1 : -1));
});

/* ---------------------------------- music ---------------------------------
   The same well Musicfy drinks from: Apple's public catalogue, which hands
   out a thirty-second preview of anything. No key, no quota, and it plays
   straight from a URL. Looped quietly under the notebook.

   To put a different song under the letter, change the line below. It is a
   plain search, exactly what you would type into Musicfy.
   -------------------------------------------------------------------------- */
const SONG = "You're the Inspiration Chicago";

let tune = null, wanted = localStorage.getItem('colton_letter_music') !== 'off';

async function findSong() {
  const url = 'https://itunes.apple.com/search?entity=song&limit=5&term=' + encodeURIComponent(SONG);
  const res = await fetch(url);
  const data = await res.json();
  const hit = (data.results || []).find(r => r.previewUrl);
  if (!hit) throw new Error('not found');
  return hit;
}

function paintMusic(label) {
  const b = $('musicBtn');
  if (!b) return;
  b.textContent = wanted ? '♪' : '♪̸';
  b.classList.toggle('off', !wanted);
  b.title = label || (!wanted ? 'Music off — tap to turn on'
    : (tune && !tune.paused) ? 'Music on — tap to turn off' : 'Tap the page to start the music');
}

/* Browsers will not let a page make noise until it has been touched, so the
   first tap anywhere is what actually starts it. */
function tryPlay() {
  if (!tune || !wanted) return;
  tune.play().then(paintMusic).catch(() => paintMusic('Tap the page to start the music'));
}

findSong().then(hit => {
  tune = new Audio(hit.previewUrl);
  tune.loop = true;
  tune.volume = 0.0;
  tune.preload = 'auto';
  $('nowPlaying').textContent = '♫ ' + hit.trackName + ' · ' + hit.artistName;
  $('nowPlaying').title = 'A 30-second preview from Apple, the same source Musicfy uses';
  tryPlay();
  // fade in, so it does not jump out at whoever opens this
  tune.addEventListener('play', () => {
    let v = 0;
    const up = setInterval(() => {
      v = Math.min(0.32, v + 0.02);
      if (tune) tune.volume = v;
      if (v >= 0.32) clearInterval(up);
    }, 120);
    paintMusic();
  });
}).catch(() => {
  $('nowPlaying').textContent = '';
  paintMusic('Could not reach the music');
});

$('musicBtn').addEventListener('click', () => {
  wanted = !wanted;
  localStorage.setItem('colton_letter_music', wanted ? 'on' : 'off');
  if (!wanted && tune) tune.pause();
  else tryPlay();
  paintMusic();
});
addEventListener('pointerdown', tryPlay);
addEventListener('keydown', tryPlay);

/* ---------------------------------- boot ---------------------------------- */
build();
go(0);
paintMusic();

fetch('letter.txt?t=' + Date.now())
  .then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
  .then(t => renderLetter(t, $('letterBox')))
  .catch(() => {
    const box = $('letterBox');
    box.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'oops';
    p.textContent = 'letter.txt could not be read. On the live site it loads by itself; '
      + 'opening this file straight off the disk will not work, because browsers refuse to '
      + 'read neighbouring files that way.';
    box.appendChild(p);
    box.appendChild(document.createElement('p'));
    box.appendChild(signature());
  });
