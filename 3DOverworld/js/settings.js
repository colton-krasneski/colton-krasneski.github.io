/* ============================================================
   Settings: how much detail to draw, and whether the game is
   allowed to decide that for itself.

   Both panels - the one on the title card and the one behind
   Esc - are wired to the same state here, so whichever you
   touch, the other agrees with it.
   ============================================================ */

const PARAMS = new URLSearchParams(location.search);

/* view:   chunks of terrain streamed around you
   grassR: chunks that get real 3-D blades
   tuftR:  chunks beyond that which get grass cards instead
   detail: chunks near enough for high-detail trees that cast shadows */
const QUALITY = {
  low:    { view: 4, grassR: 2, tuftR: 3, detail: 1.5, blades: 700,  lawn: 430, tufts: 420, shadow: 1024, span: 30, pixel: 1.0,  fog: 112, samples: 0, bloom: false },
  medium: { view: 5, grassR: 3, tuftR: 4, detail: 2.0, blades: 1100, lawn: 700, tufts: 560, shadow: 1536, span: 40, pixel: 1.25, fog: 138, samples: 2, bloom: true },
  high:   { view: 5, grassR: 3, tuftR: 5, detail: 2.0, blades: 1400, lawn: 950, tufts: 650, shadow: 2048, span: 52, pixel: 1.5,  fog: 150, samples: 4, bloom: true },
};

const STORE = "overworld.settings.v1";
const DEFAULTS = { auto: true, quality: null, sound: true };

/* Private browsing and blocked site data both make localStorage throw
   rather than return nothing, so every touch of it is wrapped. Losing a
   preference is a shrug; taking the whole game down over one is not. */
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
  } catch (err) { /* no store available - defaults are fine */ }
  return Object.assign({}, DEFAULTS);
}

const prefs = load();

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch (err) { /* ignore */ }
}

/* ---- what the rest of the game asks ---- */

function autoDetail() { return prefs.auto; }

function soundOn() { return prefs.sound; }

function startingQuality(coarse) {
  const asked = PARAMS.get("q");
  if (asked && QUALITY[asked]) return asked;
  if (prefs.quality && QUALITY[prefs.quality]) return prefs.quality;
  return coarse ? "low" : "high";
}

function rememberQuality(name) { prefs.quality = name; save(); }

/* ---- the panels ---- */

const segs = [];
const autos = [];
const sounds = [];

/* `onQuality` fires when someone picks a level themselves, which is not
   the same as the game stepping down on its own - that must not be
   written back as a preference, or one slow afternoon would be
   remembered for ever. */
function initSettings(onQuality, onSound) {
  for (const id of ["qual", "qual2"]) {
    const seg = document.getElementById(id);
    if (!seg) continue;
    segs.push(seg);
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) onQuality(b.dataset.q, true);
    });
  }
  for (const id of ["autoQ", "autoQ2"]) {
    const box = document.getElementById(id);
    if (!box) continue;
    autos.push(box);
    box.checked = prefs.auto;
    box.addEventListener("change", () => {
      prefs.auto = box.checked;
      save();
      for (const o of autos) o.checked = prefs.auto;
    });
  }
  for (const id of ["snd", "snd2"]) {
    const box = document.getElementById(id);
    if (!box) continue;
    sounds.push(box);
    box.checked = prefs.sound;
    box.addEventListener("change", () => {
      prefs.sound = box.checked;
      save();
      for (const o of sounds) o.checked = prefs.sound;
      if (onSound) onSound(prefs.sound);
    });
  }
  showQuality(null);
}

/* reflect the current level in both panels */
function showQuality(name) {
  for (const seg of segs) {
    for (const b of seg.children) b.classList.toggle("on", b.dataset.q === name);
  }
}

export {
  PARAMS, QUALITY,
  autoDetail, soundOn, startingQuality, rememberQuality,
  initSettings, showQuality,
};
