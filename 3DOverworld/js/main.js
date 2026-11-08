/* ============================================================
   Boot, the frame loop, and the three states the game can be
   in: waiting on the title card, playing, or paused.

   This file wires the pieces together and does nothing else -
   if you are looking for how something works, it is in the
   module named after it.
   ============================================================ */

import * as THREE from "three";

import { scene, camera, canvas, composer, gradePass, GradeShader, SH,
  makeComposer, resize } from "./graphics.js";
import { setAudioPaused, setMuted, startAudio } from "./audio.js";
import { TEX, buildTextures, nextFrame } from "./materials.js";
import { WATER, heightAt, placeName } from "./terrain.js";
import { World } from "./world.js";
import { Player } from "./movement.js";
import { Input } from "./input.js";
import { QUALITY, PARAMS, autoDetail, soundOn, startingQuality, rememberQuality,
  initSettings, showQuality } from "./settings.js";
import * as hud from "./hud.js";

window.__owBooted = true;

const coarse = matchMedia("(pointer: coarse)").matches;
if (coarse) document.body.classList.add("touch");

/* loop state, declared up here because applyQuality reaches for it */
let last = performance.now();
let elapsed = 0;          /* game seconds: clamped dt, drives animation */
let wall = 0;             /* real seconds: drives anything judging the machine */
let fps = 60, frame = 0;
let steppedDown = 0;
let nextCheck = 12;

let qualName = startingQuality(coarse);
let world = null, player = null, input = null;

/* ---- detail level ----
   `chosen` separates a level the player picked from one the game stepped
   down to on its own: only the first is worth remembering. */
function applyQuality(name, chosen) {
  if (!QUALITY[name]) return;
  qualName = name;
  if (world) world.setQuality(name);
  makeComposer(QUALITY[name]);
  showQuality(name);
  if (chosen) {
    rememberQuality(name);
    nextCheck = wall + 20;         /* leave their choice alone for a while */
  }
}

initSettings(applyQuality, (on) => setMuted(!on));

/* ---- playing, paused, or still on the title card ---- */

let state = "gate";
let wasLocked = false;

function lockMouse() {
  if (coarse) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (err) { /* pointer lock is a nicety, not a requirement */ }
}

function play() {
  if (hud.startDisabled()) return;
  state = "play";
  /* An AudioContext may only be started from a real gesture, and this
     function is only ever reached from one - the button, or the key
     that dismisses the pause menu. */
  startAudio();
  setMuted(!soundOn());
  setAudioPaused(false);
  hud.showGate(false);
  hud.showPause(false);
  if (input) input.enabled = true;
  lockMouse();
}

function pause() {
  if (state !== "play") return;
  state = "pause";
  setAudioPaused(true);
  if (input) { input.enabled = false; input.keys.clear(); }
  hud.showPause(true);
  if (document.pointerLockElement) document.exitPointerLock();
}

hud.onStart(play);
hud.onResume(play);

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas) { wasLocked = true; return; }
  if (state === "play" && wasLocked) { wasLocked = false; pause(); }
});

addEventListener("keydown", (e) => {
  if (e.code === "Escape") { pause(); return; }
  if (state !== "play" || !world) return;
  if (e.code === "BracketLeft") world.setDay(world.dayT - 0.022);
  else if (e.code === "BracketRight") world.setDay(world.dayT + 0.022);
  else if (e.code === "KeyR") player.respawn();
  else if (e.code === "KeyV") player.setMode(player.mode ? 0 : 1, camera);
  else if (e.code === "KeyH") hud.toggleReadouts();
});

canvas.addEventListener("click", () => {
  if (state === "play" && !input.locked) lockMouse();
});

/* ---- grow the world before letting anyone into it ---- */

async function step(text) {
  hud.loading(text + "...");
  await nextFrame();
}

async function boot() {
  resize();
  await buildTextures(step);

  await step("raising the land");
  world = new World(scene, qualName);
  player = new Player(scene, world);
  input = new Input(canvas);
  player.setMode(0, camera);
  applyQuality(qualName, false);
  window.__ow = { THREE, scene, camera, world, player, input, SH, QUALITY, TEX,
    /* what the loop currently thinks, for when something has to be measured
       rather than guessed at from the outside */
    loop: () => ({ state, qualName, elapsed, wall, fps, steppedDown, nextCheck, auto: autoDetail() }),
  };

  world.enqueue(player.pos.x, player.pos.z);
  const total = Math.max(1, world.queue.length);
  hud.loading("growing the hills...");
  while (world.queue.length) {
    world.build(22);
    hud.progress(0.84 * (1 - world.queue.length / total));
    await nextFrame();
  }

  hud.loading("sowing the meadow...");
  for (let i = 0; i < 70; i++) {
    world.tendGrass(0, 0);
    world.lawn.update(0, 0, 4);
    if (i % 6 === 5) { hud.progress(0.84 + i * 0.002); await nextFrame(); }
  }
  world.tendWater(0, 0);
  for (const p in world.pool) world.pool[p].flush();

  player.pos.y = heightAt(0, 0);
  player.updateCamera(camera, 0, true);
  world.follow(camera, player.pos.x, player.pos.z, 0);

  hud.progress(1);
  hud.ready("ready");

  last = performance.now();
  requestAnimationFrame(tick);
  if (PARAMS.get("auto")) play();
}

/* ---- the loop ---- */

function tick(now) {
  requestAnimationFrame(tick);
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, raw);
  elapsed += dt;
  /* Real seconds, which is not the same thing as `elapsed`: that one adds a
     clamped dt, so on a struggling machine game time crawls along at a
     fraction of wall time. Anything measuring how the machine is coping has
     to use this, or the grace period before stepping down stretches longest
     on exactly the machines that needed the help soonest. */
  wall += raw;
  SH.uTime.value = elapsed;
  GradeShader.uniforms.uTime.value = elapsed;

  if (state === "play") {
    player.update(dt, input);
    input.endFrame();
  }

  world.update(player.pos.x, player.pos.z, state === "play" ? 3.5 : 10);
  player.updateCamera(camera, dt, false);
  world.follow(camera, player.pos.x, player.pos.z, elapsed);

  const under = camera.position.y < WATER;
  gradePass.uniforms.uUnder.value += ((under ? 1 : 0) - gradePass.uniforms.uUnder.value) * 0.14;
  gradePass.uniforms.uExposure.value = under ? 1.5 : 1.05;

  composer.render();

  /* Smoothed over a second of real time rather than over a fixed number of
     frames: a per-frame factor has a time constant that gets longer the
     slower things are, so the reading lagged worst when it mattered most. */
  fps += (1 / Math.max(raw, 0.001) - fps) * (1 - Math.exp(-raw / 1.0));
  if ((frame++ & 7) === 0) {
    const p = player.pos;
    hud.readout({
      place: placeName(p.x, p.z, p.y),
      pos: Math.round(p.x) + ", " + Math.round(p.z),
      alt: p.y.toFixed(1),
      face: player.heading(),
      sun: world.clockLabel(),
      fps: Math.round(fps),
    });
    autoStepDown();
  }
  hud.fadeHint(wall);
}

/* Only this machine knows whether it can hold the level it was given.
   Give way twice at most, say so each time, and leave it alone after
   that - the menu is the last word, and so is the switch next to it. */
function autoStepDown() {
  if (!autoDetail() || steppedDown >= 2) return;
  if (state !== "play" || qualName === "low") return;
  if (wall < nextCheck || fps >= 24) return;

  steppedDown++;
  const next = qualName === "high" ? "medium" : "low";
  applyQuality(next, false);
  hud.hint("detail stepped down to <b>" + (next === "medium" ? "Medium" : "Low")
    + "</b> to keep it smooth &mdash; change it from the <kbd>Esc</kbd> menu",
    10, wall);
  nextCheck = wall + 16;           /* let it settle before judging again */
  fps = 60;
}

boot();
