/* ===========================================================================
   Slides — the data side. Decks, slides, the things you put on a slide,
   the themes and starter templates, and saving it all.

   A slide is measured in a fixed 1600x900 world no matter how big the screen
   is. Everything on screen is that world scaled by one number, so a deck made
   on a phone opens identically on a laptop and nothing has to be recomputed.
   =========================================================================== */

export const W = 1600, H = 900;

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* --------------------------------- themes -------------------------------- */
/* Every theme carries both a flat colour and a gradient built from the same
   family, so flipping the whole deck between the two never clashes. */
export const THEMES = [
  { id: 'sunshine', name: 'Sunshine', bg: '#fffaf0', ink: '#4a3208', accent: '#f7a418', soft: '#ffe9bd', dark: false,
    grad: 'linear-gradient(155deg, #fff8e6 0%, #ffe3ad 55%, #ffc978 100%)' },
  { id: 'blueberry', name: 'Blueberry', bg: '#f3f7ff', ink: '#172c56', accent: '#3f7ef0', soft: '#d9e6ff', dark: false,
    grad: 'linear-gradient(155deg, #f2f7ff 0%, #d3e3ff 55%, #aecbff 100%)' },
  { id: 'bubblegum', name: 'Bubblegum', bg: '#fff4f9', ink: '#5c1338', accent: '#ec4899', soft: '#ffd8ea', dark: false,
    grad: 'linear-gradient(155deg, #fff2f8 0%, #ffd6ea 55%, #ffb3d8 100%)' },
  { id: 'mint', name: 'Mint', bg: '#f2fdf6', ink: '#0f3d28', accent: '#16a34a', soft: '#cdf3dc', dark: false,
    grad: 'linear-gradient(155deg, #f1fdf5 0%, #c8f2da 55%, #9fe6bf 100%)' },
  { id: 'space', name: 'Outer Space', bg: '#141a3a', ink: '#eef2ff', accent: '#a78bfa', soft: '#26305e', dark: true,
    grad: 'linear-gradient(155deg, #2a2160 0%, #171d43 50%, #080a1c 100%)' },
  { id: 'chalk', name: 'Chalkboard', bg: '#1e2b26', ink: '#f2fff7', accent: '#7ee787', soft: '#2c3d36', dark: true,
    grad: 'linear-gradient(155deg, #2b3d34 0%, #1d2a24 55%, #101915 100%)' }
];
export const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];

/* Gradients for one slide on its own, independent of the deck's theme. */
export const GRADIENTS = [
  'linear-gradient(155deg, #ffdde1 0%, #ee9ca7 100%)',
  'linear-gradient(155deg, #fceabb 0%, #f8b500 100%)',
  'linear-gradient(155deg, #d4fc79 0%, #96e6a1 100%)',
  'linear-gradient(155deg, #a1c4fd 0%, #c2e9fb 100%)',
  'linear-gradient(155deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(155deg, #fbc2eb 0%, #a6c1ee 100%)',
  'linear-gradient(155deg, #ff9a9e 0%, #fecfef 100%)',
  'linear-gradient(155deg, #84fab0 0%, #8fd3f4 100%)',
  'linear-gradient(155deg, #ffecd2 0%, #fcb69f 100%)',
  'linear-gradient(155deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(155deg, #2b5876 0%, #4e4376 100%)',
  'linear-gradient(155deg, #232526 0%, #414345 100%)',
  'radial-gradient(circle at 30% 20%, #5b3fa8 0%, #16143a 60%, #05061a 100%)',
  'linear-gradient(155deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(155deg, #ff6a00 0%, #ee0979 100%)'
];

/* Fonts everyone already has, so a deck never waits on a download. */
export const FONTS = [
  { id: 'sans', name: 'Everyday', css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'round', name: 'Bouncy', css: "'Comic Sans MS', 'Chalkboard SE', 'Segoe Print', cursive" },
  { id: 'serif', name: 'Storybook', css: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', name: 'Typewriter', css: "'Courier New', ui-monospace, monospace" },
  { id: 'shout', name: 'Shout', css: "Impact, 'Arial Black', system-ui, sans-serif" }
];
export const fontById = id => FONTS.find(f => f.id === id) || FONTS[0];

export const PALETTE = [
  '#1f2430', '#ffffff', '#ef4444', '#f97316', '#f7a418', '#facc15',
  '#22c55e', '#14b8a6', '#3f7ef0', '#6366f1', '#a855f7', '#ec4899'
];

export const SHAPES = ['rect', 'round', 'ellipse', 'triangle', 'star', 'heart', 'arrow', 'burst'];

export const STICKERS = (
  '😀 😎 🤩 🥳 😴 🤔 👍 👏 🎉 ⭐ 🌟 ✨ ❤️ 🔥 ⚡ 🌈 ☀️ 🌙 ☁️ 🌊 🌸 🌵 🍎 🍕 🍩 🎂 ⚽ 🏀 🎸 🎨 ' +
  '🚀 🚗 ✈️ 🐱 🐶 🦊 🐼 🦄 🐢 🐝 🦋 🌍 🔬 🧪 📚 ✏️ 💡 🏆 🎯 ❓ ❗ ✅'
).split(' ');

/* -------------------------- things on a slide ---------------------------- */
export function textEl(o) {
  return Object.assign({
    id: uid(), type: 'text', x: 160, y: 380, w: 1280, h: 160, rot: 0,
    text: 'Type here', size: 54, font: 'sans', color: null,
    bold: false, italic: false, underline: false,
    align: 'center', valign: 'middle', list: false
  }, o);
}
export function shapeEl(o) {
  return Object.assign({
    id: uid(), type: 'shape', x: 620, y: 320, w: 360, h: 260, rot: 0,
    shape: 'rect', fill: null, stroke: 'none', strokeW: 8
  }, o);
}
export function stickerEl(o) {
  return Object.assign({
    id: uid(), type: 'sticker', x: 680, y: 330, w: 240, h: 240, rot: 0, char: '⭐'
  }, o);
}
export function imageEl(o) {
  return Object.assign({
    id: uid(), type: 'image', x: 500, y: 220, w: 600, h: 460, rot: 0, src: '', fit: 'cover',
    credit: '', link: ''      // who made it, for pictures found on the web
  }, o);
}

/* --------------------------------- slides -------------------------------- */
export const LAYOUTS = [
  { id: 'title',  name: 'Big title' },
  { id: 'header', name: 'Title and words' },
  { id: 'two',    name: 'Two columns' },
  { id: 'photo',  name: 'Title and picture' },
  { id: 'blank',  name: 'Empty' }
];

export function newSlide(layout) {
  const s = { id: uid(), layout: layout || 'header', bg: null, els: [] };
  if (layout === 'title') {
    s.els.push(textEl({ y: 300, h: 200, text: 'My Big Title', size: 108, bold: true }));
    s.els.push(textEl({ y: 520, h: 110, text: 'by me', size: 44 }));
  } else if (layout === 'header' || !layout) {
    s.els.push(textEl({ x: 120, y: 90, w: 1360, h: 130, text: 'Title goes here', size: 72, bold: true, align: 'left' }));
    s.els.push(textEl({ x: 120, y: 270, w: 1360, h: 520, text: 'First thing\nSecond thing\nThird thing',
      size: 44, align: 'left', valign: 'top', list: true }));
  } else if (layout === 'two') {
    s.els.push(textEl({ x: 120, y: 80, w: 1360, h: 120, text: 'Two things', size: 68, bold: true, align: 'left' }));
    s.els.push(textEl({ x: 120, y: 250, w: 620, h: 520, text: 'One side', size: 40, align: 'left', valign: 'top', list: true }));
    s.els.push(textEl({ x: 860, y: 250, w: 620, h: 520, text: 'Other side', size: 40, align: 'left', valign: 'top', list: true }));
  } else if (layout === 'photo') {
    s.els.push(textEl({ x: 120, y: 80, w: 1360, h: 120, text: 'Look at this', size: 68, bold: true, align: 'left' }));
    s.els.push(shapeEl({ x: 500, y: 240, w: 600, h: 520, shape: 'round' }));
  }
  return s;
}

/* -------------------------------- templates ------------------------------- */
export const TEMPLATES = [
  {
    id: 'blank', name: 'Blank', emoji: '📄', theme: 'blueberry',
    blurb: 'Start with nothing and build it yourself',
    build: () => [newSlide('title')]
  },
  {
    id: 'about', name: 'All About Me', emoji: '🙋', theme: 'bubblegum',
    blurb: 'Name, favourites, and a fun fact',
    build: () => {
      const a = newSlide('title');
      a.els[0].text = 'All About Me';
      a.els[1].text = 'by (your name)';
      const b = newSlide('header');
      b.els[0].text = 'My favourite things';
      b.els[1].text = 'Food\nColour\nAnimal\nSomething I love doing';
      const c = newSlide('header');
      c.els[0].text = 'One fun fact about me';
      c.els[1].text = 'Write the fact here!';
      c.els.push(stickerEl({ char: '🌟', x: 1180, y: 560, w: 240, h: 240 }));
      return [a, b, c];
    }
  },
  {
    id: 'project', name: 'School Project', emoji: '🎒', theme: 'sunshine',
    blurb: 'Question, what I found out, and the answer',
    build: () => {
      const a = newSlide('title');
      a.els[0].text = 'My Project';
      a.els[1].text = 'by (your name)';
      const b = newSlide('header');
      b.els[0].text = 'What I wanted to find out';
      b.els[1].text = 'My question was...';
      const c = newSlide('two');
      c.els[0].text = 'What I found out';
      c.els[1].text = 'Thing one\nThing two';
      c.els[2].text = 'Thing three\nThing four';
      const d = newSlide('header');
      d.els[0].text = 'So the answer is';
      d.els[1].text = 'Write your answer here';
      return [a, b, c, d];
    }
  },
  {
    id: 'story', name: 'Story Time', emoji: '📖', theme: 'mint',
    blurb: 'Beginning, middle and end',
    build: () => {
      const a = newSlide('title');
      a.els[0].text = 'My Story';
      a.els[1].text = 'once upon a time...';
      const b = newSlide('photo');
      b.els[0].text = 'The beginning';
      const c = newSlide('photo');
      c.els[0].text = 'The middle';
      const d = newSlide('photo');
      d.els[0].text = 'The end';
      return [a, b, c, d];
    }
  },
  {
    id: 'space', name: 'Space Facts', emoji: '🚀', theme: 'space',
    blurb: 'A dark, starry deck for big facts',
    build: () => {
      const a = newSlide('title');
      a.els[0].text = 'Space!';
      a.els[1].text = 'the coolest facts I know';
      a.els.push(stickerEl({ char: '🚀', x: 1240, y: 120, w: 220, h: 220 }));
      const b = newSlide('header');
      b.els[0].text = 'Fact number one';
      b.els[1].text = 'Write something amazing';
      const c = newSlide('two');
      c.els[0].text = 'Two more facts';
      c.els[1].text = 'Fact two';
      c.els[2].text = 'Fact three';
      return [a, b, c];
    }
  }
];

export function newDeck(templateId, title) {
  const t = TEMPLATES.find(x => x.id === templateId) || TEMPLATES[0];
  const now = Date.now();
  return {
    id: uid(),
    title: title || (t.id === 'blank' ? 'Untitled presentation' : t.name),
    theme: t.theme,
    bgMode: 'solid',            // 'solid' | 'gradient'
    created: now, updated: now,
    slides: t.build()
  };
}

/* ------------------------------- persistence ------------------------------ */
const user = (typeof localStorage !== 'undefined' && localStorage.getItem('colton_last_user')) || 'guest';
export const KEY = 'colton_slides_' + user;
export const USER = user;

export function loadDecks() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && Array.isArray(raw.decks)) return raw.decks;
  } catch (e) { /* unreadable save — better an empty shelf than a crash */ }
  return [];
}

/** @returns '' when it saved, or a message explaining why it could not. */
export function saveDecks(decks) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, decks }));
    return '';
  } catch (e) {
    return 'There is no room left to save. Try deleting a presentation, or using smaller pictures.';
  }
}

export const clone = o => JSON.parse(JSON.stringify(o));

/* ========================= pictures from the internet ======================
   Two very different sources, handled differently on purpose.

   Web search results keep their original address. They are somebody else's
   file sitting on a big fast server, and copying a dozen of them into this
   browser's storage would blow the few megabytes we get.

   AI pictures are copied in, because they are generated on demand and the
   address they arrive at is temporary — it stops working within the hour, so
   a deck pointing at one would quietly go blank.
   ========================================================================== */

/* ------------------------------ Google images -----------------------------
   Google has no open image endpoint. google.com/search sends no CORS headers
   at all, so a browser physically cannot read it, and scraping it is against
   their terms anyway. The one sanctioned route is the Custom Search JSON API,
   which does allow browser calls but needs the user's own free credentials.
   They stay in this browser and are never committed anywhere.
   -------------------------------------------------------------------------- */
const GKEY = 'colton_slides_gkey', GCX = 'colton_slides_gcx';

export function googleCreds() {
  try {
    return {
      key: localStorage.getItem(GKEY) || '',
      cx: localStorage.getItem(GCX) || ''
    };
  } catch (e) { return { key: '', cx: '' }; }
}
export function saveGoogleCreds(key, cx) {
  try {
    if (key && cx) { localStorage.setItem(GKEY, key.trim()); localStorage.setItem(GCX, cx.trim()); }
    else { localStorage.removeItem(GKEY); localStorage.removeItem(GCX); }
    return true;
  } catch (e) { return false; }
}
export const hasGoogle = () => { const c = googleCreds(); return !!(c.key && c.cx); };

/** One page is 10 results — the API's maximum, and one of the daily 100. */
export async function searchGoogle(query, start) {
  const { key, cx } = googleCreds();
  const url = 'https://www.googleapis.com/customsearch/v1'
    + '?key=' + encodeURIComponent(key)
    + '&cx=' + encodeURIComponent(cx)
    + '&searchType=image&safe=active&num=10'
    + '&start=' + (start || 1)
    + '&q=' + encodeURIComponent(query);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const m = data.error.message || 'Google turned the search down.';
    if (/quota|rate limit/i.test(m)) throw new Error('QUOTA');
    if (/API key|not valid|denied/i.test(m)) throw new Error('BADKEY');
    throw new Error(m);
  }
  return (data.items || []).map(it => {
    const im = it.image || {};
    return {
      thumb: im.thumbnailLink || it.link,
      full: it.link,
      title: it.title || 'picture',
      credit: it.displayLink || '',
      link: im.contextLink || '',
      ratio: im.width && im.height ? im.width / im.height : 1.4
    };
  });
}

/**
 * Use Google when it has been set up, otherwise the keyless library.
 * A Google failure still returns results — falling back is better than an
 * empty screen — but it reports the problem so a bad key can be fixed.
 */
export async function searchPictures(query, page) {
  if (hasGoogle()) {
    try {
      const hits = await searchGoogle(query, (page - 1) * 10 + 1);
      return { source: 'google', hits, warn: '' };
    } catch (e) {
      const warn = e.message === 'QUOTA'
        ? 'Google has had its 100 searches for today — showing the free library instead.'
        : e.message === 'BADKEY'
          ? 'Google did not accept that key — check it in Settings. Showing the free library instead.'
          : 'Google could not be reached — showing the free library instead.';
      return { source: 'openverse', hits: await searchWeb(query, page), warn };
    }
  }
  return { source: 'openverse', hits: await searchWeb(query, page), warn: '' };
}

/**
 * Openverse: everything it indexes has been shared for reuse, and it filters
 * adult content out by default, which matters for who this is for.
 */
export async function searchWeb(query, page) {
  // 20 is the hard ceiling for requests without an API key — asking for more
  // is rejected outright rather than trimmed.
  const url = 'https://api.openverse.org/v1/images/?q=' + encodeURIComponent(query)
    + '&page_size=20&page=' + (page || 1) + '&mature=false';
  const res = await fetch(url);
  if (!res.ok) throw new Error('search is not answering right now');
  const data = await res.json();
  return (data.results || []).map(r => ({
    thumb: r.thumbnail || r.url,
    full: r.url,
    title: r.title || 'picture',
    credit: [r.creator, r.license ? 'CC ' + String(r.license).toUpperCase() : '']
      .filter(Boolean).join(' · '),
    link: r.foreign_landing_url || '',
    ratio: r.width && r.height ? r.width / r.height : 1.4
  }));
}

const FLUX_SPACE = 'https://black-forest-labs-flux-1-schnell.hf.space';

/**
 * FLUX.1-schnell, running on Black Forest Labs' own public demo. No sign-up
 * and no key. It is a far stronger model than the free text-to-image endpoint
 * everything else defaults to, but it is a shared demo, so when it is busy or
 * out of quota we quietly fall back rather than failing in the user's face.
 * @returns {Promise<{url:string, engine:string}>}
 */
export async function makeAiImage(prompt, seed, onStep) {
  try {
    onStep && onStep('Asking FLUX to draw it…');
    const start = await fetch(FLUX_SPACE + '/gradio_api/call/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [prompt, seed, false, 1024, 768, 4] })
    });
    if (!start.ok) throw new Error('busy');
    const { event_id } = await start.json();
    if (!event_id) throw new Error('busy');

    const ctrl = new AbortController();
    const bail = setTimeout(() => ctrl.abort(), 75000);
    const out = await fetch(FLUX_SPACE + '/gradio_api/call/infer/' + event_id, { signal: ctrl.signal });
    clearTimeout(bail);
    const text = await out.text();
    if (/event:\s*error/.test(text)) throw new Error('busy');
    // the stream ends with a `data:` line holding the finished file
    const lines = text.split('\n').filter(l => l.startsWith('data:'));
    const payload = JSON.parse(lines[lines.length - 1].slice(5).trim());
    const url = payload && payload[0] && payload[0].url;
    if (!url) throw new Error('busy');
    return { url, engine: 'FLUX.1' };
  } catch (e) {
    onStep && onStep('FLUX is busy — using the backup artist…');
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt)
      + '?width=1024&height=768&seed=' + seed + '&nologo=true';
    return { url, engine: 'backup' };
  }
}

/**
 * Copy a picture off the web and shrink it, so it keeps working offline.
 *
 * This ALWAYS calls back exactly once, whatever happens — including when the
 * picture never loads and never errors, which a slow generator can do. An
 * earlier version could leave the caller waiting forever, which jammed the
 * whole panel: the first picture worked and nothing after it responded.
 */
export function shrinkFromUrl(url, max, quality, cb) {
  let settled = false;
  const finish = (data, ratio) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    cb(data, ratio);
  };
  const timer = setTimeout(() => finish(null), 60000);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onerror = () => finish(null);
  img.onload = () => {
    try {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      finish(c.toDataURL('image/jpeg', quality), img.width / img.height);
    } catch (e) {
      finish(null);              // tainted canvas, or an image too big to draw
    }
  };
  img.src = url;
}

/* Photos straight off a phone are several megabytes, which fills the whole
   save on its own. Shrink before storing. */
export function shrinkImage(file, max, quality, cb) {
  const reader = new FileReader();
  reader.onerror = () => cb(null);
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => cb(null);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      try { cb(c.toDataURL('image/jpeg', quality), img.width / img.height); }
      catch (err) { cb(null); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
