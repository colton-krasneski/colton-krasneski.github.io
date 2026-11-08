/* ============================================================
   Input - keyboard and mouse, with a thumbstick for touch.
   ============================================================ */

import { canvas } from "./graphics.js";
import { clamp } from "./terrain.js";

class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.lookX = 0; this.lookY = 0; this.zoom = 0;
    this.stick = { x: 0, y: 0 };
    this.jump = false;
    this.touchSprint = false;
    this.locked = false;
    this.dragging = false;
    this.lookId = -1;
    this.moveId = -1;
    this.enabled = false;

    addEventListener("keydown", (e) => {
      const c = e.code;
      if (c === "Space" || c.startsWith("Arrow")) e.preventDefault();
      if (!this.enabled) return;
      if (c === "Space") this.jump = true;
      this.keys.add(c);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!this.enabled) return;
      if (this.locked || this.dragging) {
        this.lookX += e.movementX || 0;
        this.lookY += e.movementY || 0;
      }
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0 && this.enabled) this.dragging = true;
    });
    addEventListener("mouseup", () => { this.dragging = false; });
    canvas.addEventListener("wheel", (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.zoom += Math.sign(e.deltaY) * 0.5;
    }, { passive: false });

    /* touch: left half walks, right half looks */
    const base = document.getElementById("stickBase");
    const nub = document.getElementById("stickNub");
    const show = (on) => { base.style.opacity = nub.style.opacity = on ? "1" : "0"; };
    const moveNub = (x, y) => { nub.style.left = x + "px"; nub.style.top = y + "px"; };

    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || !this.enabled) return;
      if (e.clientX < innerWidth * 0.5 && this.moveId < 0) {
        this.moveId = e.pointerId;
        this.ox = e.clientX; this.oy = e.clientY;
        base.style.left = this.ox + "px"; base.style.top = this.oy + "px";
        moveNub(this.ox, this.oy);
        show(true);
      } else if (this.lookId < 0) {
        this.lookId = e.pointerId;
        this.lx = e.clientX; this.ly = e.clientY;
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch") return;
      if (e.pointerId === this.moveId) {
        const dx = clamp(e.clientX - this.ox, -56, 56), dy = clamp(e.clientY - this.oy, -56, 56);
        this.stick.x = dx / 56; this.stick.y = -dy / 56;
        this.touchSprint = Math.hypot(dx, dy) > 48;
        moveNub(this.ox + dx, this.oy + dy);
      } else if (e.pointerId === this.lookId) {
        this.lookX += (e.clientX - this.lx) * 1.6;
        this.lookY += (e.clientY - this.ly) * 1.6;
        this.lx = e.clientX; this.ly = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === this.moveId) {
        this.moveId = -1; this.stick.x = this.stick.y = 0; this.touchSprint = false; show(false);
      }
      if (e.pointerId === this.lookId) this.lookId = -1;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    document.getElementById("jump").addEventListener("pointerdown", (e) => {
      e.preventDefault(); this.jump = true;
    });
  }

  get sprint() {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touchSprint;
  }
  get crouch() {
    return this.keys.has("KeyC") || this.keys.has("ControlLeft");
  }
  axisX() {
    let v = this.stick.x;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) v -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) v += 1;
    return clamp(v, -1, 1);
  }
  axisY() {
    let v = this.stick.y;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) v += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) v -= 1;
    return clamp(v, -1, 1);
  }
  takeJump() { const j = this.jump; this.jump = false; return j; }
  endFrame() { this.lookX = 0; this.lookY = 0; this.zoom = 0; }
}
export {
  Input,
};
