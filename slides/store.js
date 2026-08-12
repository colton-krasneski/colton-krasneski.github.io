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
export const THEMES = [
  { id: 'sunshine', name: 'Sunshine', bg: '#fffaf0', ink: '#4a3208', accent: '#f7a418', soft: '#ffe9bd', dark: false },
  { id: 'blueberry', name: 'Blueberry', bg: '#f3f7ff', ink: '#172c56', accent: '#3f7ef0', soft: '#d9e6ff', dark: false },
  { id: 'bubblegum', name: 'Bubblegum', bg: '#fff4f9', ink: '#5c1338', accent: '#ec4899', soft: '#ffd8ea', dark: false },
  { id: 'mint', name: 'Mint', bg: '#f2fdf6', ink: '#0f3d28', accent: '#16a34a', soft: '#cdf3dc', dark: false },
  { id: 'space', name: 'Outer Space', bg: '#141a3a', ink: '#eef2ff', accent: '#a78bfa', soft: '#26305e', dark: true },
  { id: 'chalk', name: 'Chalkboard', bg: '#1e2b26', ink: '#f2fff7', accent: '#7ee787', soft: '#2c3d36', dark: true }
];
export const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];

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
    id: uid(), type: 'image', x: 500, y: 220, w: 600, h: 460, rot: 0, src: '', fit: 'cover'
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
