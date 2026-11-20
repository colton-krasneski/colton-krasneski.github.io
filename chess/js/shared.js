/* ============================================================
   Small things every other file needs: who the creator is, how a
   name is shown, the page helpers, the saved settings.
   ============================================================ */

/* The creator's account(s). Whoever is on this list wears the crown
   everywhere in the game - on the board, in the lobby, on the ladder.
   To crown another of your accounts, add its username here. */
export const OWNERS = ['colton_onpc_real_2'];
export const OWNER_NAME = 'Colton';

/* what the whole app knows at any moment */
export const state = {
  me: null,                 // signed-in username
  players: new Map(),       // username -> their chessPlayers record
  online: false,            // is the database reachable
  admin: false,             // has the console been unlocked this visit
};

export const isOwner = name => OWNERS.includes(name);
export const isBot = name => typeof name === 'string' && name.startsWith('bot:');
/* what to call somebody on screen */
export const shown = name => (isOwner(name) ? OWNER_NAME : name || '?');

export const $ = id => document.getElementById(id);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* h('div', { class: 'x', onclick: fn }, 'text', child, ...) */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/* ------------------------------------------------------------ names */

const AV_COLOURS = ['#3ba55d', '#5865f2', '#faa81a', '#ed4245', '#eb459e', '#9b59b6', '#1abc9c', '#e67e22', '#3498db'];
const hash = s => { let n = 0; for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0; return n; };

export function avatar(name, opts = {}) {
  const el = h('span', { class: 'av' + (isOwner(name) ? ' owner' : '') + (opts.small ? ' small' : '') });
  if (isBot(name)) { el.textContent = opts.emoji || '🤖'; el.classList.add('bot'); }
  else {
    el.textContent = opts.letter || (shown(name).trim()[0] || '?').toUpperCase();
    el.style.background = isOwner(name) ? '' : AV_COLOURS[hash(name || '?') % AV_COLOURS.length];
  }
  if (isOwner(name)) el.appendChild(h('span', { class: 'crown', title: 'The creator' }, '👑'));
  return el;
}

/* a name with whatever it has earned: the crown, the CREATOR tag, a title */
export function nameTag(name, opts = {}) {
  const el = h('span', { class: 'nm' + (isOwner(name) ? ' owner' : '') });
  el.appendChild(h('span', { class: 'nm-text' }, opts.label || shown(name)));
  if (isOwner(name)) el.appendChild(h('span', { class: 'tag gold', title: 'Made this game' }, 'CREATOR'));
  else if (opts.title) el.appendChild(h('span', { class: 'tag' }, opts.title));
  return el;
}

/* -------------------------------------------------------- time controls */

export const TIME_PRESETS = [
  { base: 60, inc: 0 }, { base: 120, inc: 1 }, { base: 180, inc: 0 }, { base: 180, inc: 2 },
  { base: 300, inc: 0 }, { base: 300, inc: 3 }, { base: 600, inc: 0 }, { base: 600, inc: 5 },
  { base: 900, inc: 10 }, { base: 1800, inc: 0 }, { base: 0, inc: 0 },
];
export const tcLabel = tc => (!tc || !tc.base ? '∞' : (tc.base % 60 ? (tc.base / 60).toFixed(1) : tc.base / 60) + '+' + (tc.inc || 0));
export function tcKind(tc) {
  if (!tc || !tc.base) return 'No clock';
  const est = tc.base + 40 * (tc.inc || 0);
  return est < 180 ? 'Bullet' : est < 600 ? 'Blitz' : est < 1800 ? 'Rapid' : 'Classical';
}
export const tcIcon = tc => ({ Bullet: '🚀', Blitz: '⚡', Rapid: '⏱️', Classical: '🐢', 'No clock': '♾️' }[tcKind(tc)]);

export function fmtClock(ms) {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000), m = Math.floor(total / 60), s = total % 60;
  if (ms < 20000) return m + ':' + String(s).padStart(2, '0') + '.' + Math.floor((ms % 1000) / 100);
  if (m >= 60) return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

/* ------------------------------------------------------------- storage */

export const session = {
  get user() { try { return localStorage.getItem('colton_last_user') || localStorage.getItem('colton_user') || null; } catch (e) { return null; } },
  set user(v) { try { if (v) localStorage.setItem('colton_last_user', v); else localStorage.removeItem('colton_last_user'); } catch (e) { /* private window */ } },
};

export const store = {
  key: k => 'colton_chess_' + (session.user || 'guest') + '_' + k,
  get(k, fallback) { try { const v = localStorage.getItem(this.key(k)); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch (e) { /* full or private */ } },
  del(k) { try { localStorage.removeItem(this.key(k)); } catch (e) { /* fine */ } },
};

export const DEFAULTS = { theme: 'emerald', volume: 0.8, sound: true, board: true, dots: true, autoQueen: false };
export const settings = Object.assign({}, DEFAULTS);
export function loadSettings() { Object.assign(settings, DEFAULTS, store.get('settings', {})); }
export function saveSettings() { store.set('settings', settings); }

export const THEMES = [
  { id: 'emerald', name: 'Emerald', light: '#ebf3d6', dark: '#6e9e59' },
  { id: 'walnut', name: 'Walnut', light: '#f0d9b5', dark: '#b58863' },
  { id: 'ice', name: 'Ice', light: '#e3ecf2', dark: '#7d9db5' },
  { id: 'candy', name: 'Candy', light: '#fde6f2', dark: '#e58fbb' },
  { id: 'matrix', name: 'Matrix', light: '#9be3a9', dark: '#2d7a4c' },
  { id: 'royal', name: 'Royal', light: '#efe6c8', dark: '#8a6fb0' },
];

/* --------------------------------------------------------------- toast */

export function toast(text, opts = {}) {
  const wrap = $('toasts');
  if (!wrap) return null;
  const t = h('div', { class: 'toast ' + (opts.kind || '') });
  t.appendChild(h('div', { class: 'toast-text' }, text));
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 250); };
  for (const a of opts.actions || []) t.appendChild(h('button', { class: 'btn small ' + (a.kind || ''), onclick: () => { close(); a.run(); } }, a.label));
  wrap.appendChild(t);
  if (!opts.sticky) setTimeout(close, opts.ms || 3600);
  return close;
}

/* --------------------------------------------------------------- modal */

let modalClose = null;
export function openModal(content, opts = {}) {
  closeModal();
  const back = $('modal');
  const card = h('div', { class: 'modal-card ' + (opts.class || '') });
  if (opts.title) card.appendChild(h('div', { class: 'modal-head' }, h('h2', null, opts.title), opts.locked ? null : h('button', { class: 'x', 'aria-label': 'Close', onclick: () => closeModal() }, '✕')));
  card.appendChild(h('div', { class: 'modal-body' }, content));
  back.innerHTML = '';
  back.appendChild(card);
  back.classList.add('show');
  back.onclick = e => { if (e.target === back && !opts.locked) closeModal(); };
  modalClose = opts.onClose || null;
  return card;
}
export function closeModal() {
  const back = $('modal');
  if (!back || !back.classList.contains('show')) return;
  back.classList.remove('show');
  back.innerHTML = '';
  const fn = modalClose; modalClose = null;
  if (fn) fn();
}
export const modalOpen = () => $('modal').classList.contains('show');

/* "are you sure?" - resolves true or false */
export function confirmBox(title, text, yes = 'OK', no = 'Cancel') {
  return new Promise(resolve => {
    let answered = false;
    const done = v => { if (answered) return; answered = true; resolve(v); closeModal(); };
    openModal(h('div', { class: 'confirm' }, h('p', null, text),
      h('div', { class: 'row-btns' }, h('button', { class: 'btn', onclick: () => done(false) }, no), h('button', { class: 'btn primary', onclick: () => done(true) }, yes))),
    { title, onClose: () => done(false) });
  });
}

/* one screen at a time: Auth, Lobby or Game */
export function showView(name) {
  for (const v of document.querySelectorAll('.view')) v.classList.toggle('on', v.id === 'view' + name);
  document.body.dataset.view = name;
}

/* ------------------------------------------------------ keeping it clean */

/* The same idea as the filter in the site's Messages: spot a rude word
   even when it is spaced out, l33t-spelled or stretched, and star it. */
const LEET = { a: 'a@4^', b: 'b8', c: 'c(<{[', e: 'e3', g: 'g69', i: 'i1!|', o: 'o0', s: 's5$', t: 't7+', u: 'uv', z: 'z2' };
const RUDE = ['motherfucker', 'bullshit', 'asshole', 'dickhead', 'dumbass', 'jackass', 'fuck', 'fuk', 'fuc', 'fux', 'shit', 'shiet', 'shyt', 'sht', 'bitch', 'biatch',
  'ass', 'azz', 'dick', 'dik', 'piss', 'cunt', 'kunt', 'slut', 'whore', 'cock', 'kock', 'pussy', 'pusy', 'nigger', 'nigga', 'niger', 'faggot', 'fagot', 'fag', 'retard',
  'bastard', 'wanker', 'twat', 'prick', 'jerkoff', 'damn'];
function rudeRe(lookbehind) {
  const one = w => {
    let pat = lookbehind ? '(?<![a-z])' : '';
    for (let i = 0; i < w.length; i++) {
      pat += '[' + (LEET[w[i]] || w[i]).replace(/[\]\\^-]/g, '\\$&') + ']+';
      if (i < w.length - 1) pat += '[\\s\\W_]*';
    }
    return pat + '(?![a-z])';
  };
  return new RegExp('(' + RUDE.map(one).join('|') + ')', 'gi');
}
let RUDE_RE;
try { RUDE_RE = rudeRe(true); } catch (e) { RUDE_RE = rudeRe(false); }
export const clean = t => { RUDE_RE.lastIndex = 0; return String(t).replace(RUDE_RE, m => '*'.repeat(m.length)); };

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
