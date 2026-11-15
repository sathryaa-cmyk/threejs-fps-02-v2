// input.js — keyboard + pointer-lock mouse look. Exposes a plain state object
// the player controller reads each frame; also a tiny synthetic-input hook so
// scripted playtests (and ?shot= modes) can drive the game without a mouse.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = 0; this.pitch = 0;
    this.mouseDX = 0; this.mouseDY = 0;
    this.firing = false; this.locked = false;
    this.synth = { fwd: false, back: false, left: false, right: false, fire: false, jump: false };
    this.onLockChange = null; this.onKey = null;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, true);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (this.onKey) this.onKey(e.code, false); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.firing = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.firing = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    canvas.addEventListener('click', () => { if (!this.locked) this.requestLock(); });
  }
  requestLock() {
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  get down() { return this.keys; }
  isDown(code) { return this.keys.has(code) || this.synth[code] === true; }
  axis() {
    let x = 0, z = 0;
    if (this.isDown('KeyW') || this.synth.fwd) z -= 1;
    if (this.isDown('KeyS') || this.synth.back) z += 1;
    if (this.isDown('KeyA') || this.synth.left) x -= 1;
    if (this.isDown('KeyD') || this.synth.right) x += 1;
    return { x, z };
  }
  consumeMouse() { const dx = this.mouseDX, dy = this.mouseDY; this.mouseDX = 0; this.mouseDY = 0; return { dx, dy }; }
  get firingNow() { return this.firing || this.synth.fire; }
}
