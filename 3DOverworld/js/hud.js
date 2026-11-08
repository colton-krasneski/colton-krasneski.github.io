/* ============================================================
   The heads-up display: the readouts in the corner, the hint
   line along the bottom, the loading bar, and the two overlays.

   Nothing here knows anything about the world - it is handed
   strings and asked to show them.
   ============================================================ */

const el = (id) => document.getElementById(id);

const dom = {
  place: el("sPlace"), pos: el("sPos"), alt: el("sAlt"),
  face: el("sFace"), sun: el("sSun"), fps: el("sFps"),
  hint: el("hint"),
  gate: el("gate"), pause: el("pause"),
  bar: el("barFill"), load: el("loadText"),
  start: el("start"), resume: el("resume"),
};

/* the controls line along the bottom shows itself for the first half minute */
let hintUntil = 26;

/* The readouts change eight times a second at most. Writing textContent
   every frame is a layout thrash for something nobody can read that fast. */
function readout(r) {
  dom.place.textContent = r.place;
  dom.pos.textContent = r.pos;
  dom.alt.textContent = r.alt;
  dom.face.textContent = r.face;
  dom.sun.textContent = r.sun;
  dom.fps.textContent = r.fps;
}

function loading(text) { dom.load.textContent = text; }
function progress(frac) { dom.bar.style.width = Math.round(frac * 100) + "%"; }
function ready(text) { dom.load.textContent = text; dom.start.disabled = false; }

/* a line along the bottom that fades itself out again */
function hint(html, seconds, now) {
  dom.hint.innerHTML = html;
  dom.hint.style.opacity = "1";
  hintUntil = now + seconds;
}

function fadeHint(now) {
  if (now > hintUntil && dom.hint.style.opacity !== "0") dom.hint.style.opacity = "0";
}

function showGate(on) { dom.gate.classList.toggle("off", !on); }
function showPause(on) { dom.pause.classList.toggle("off", !on); }
function startDisabled() { return dom.start.disabled; }

function onStart(fn) { dom.start.addEventListener("click", fn); }
function onResume(fn) { dom.resume.addEventListener("click", fn); }

function toggleReadouts() { document.body.classList.toggle("hideHud"); }
function setSprinting(on) { document.body.classList.toggle("sprinting", on); }
function setThirdPerson(on) { document.body.classList.toggle("thirdPerson", on); }

export {
  readout, loading, progress, ready, hint, fadeHint,
  showGate, showPause, startDisabled, onStart, onResume,
  toggleReadouts, setSprinting, setThirdPerson,
};
