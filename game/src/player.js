// player.js — first-person controller: WASD + jump/crouch, pointer-lock look,
// recoil + spread (still + crouch = accurate), shooting with ray vs bots and
// world colliders, reload, hitmarkers, damage direction. The game object owns
// rounds/economy; the player only reports events through game callbacks.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { pointBlocked, rayHit } from './world.js';
import { clamp } from './palette.js';

export class Player {
  constructor(camera, input, audio, effects) {
    this.camera = camera; this.input = input; this.audio = audio; this.effects = effects;
    this.pos = new THREE.Vector3(-40, 0, -26);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.armor = 0; this.alive = true;
    this.weaponId = 'pistol'; this.mag = 12; this.reserve = 48;
    this.fireT = 0; this.reloadT = 0; this.recoil = 0; this.spreadBloom = 0;
    this.crouch = false; this.onGround = true;
    this.money = 800; this.kills = 0;
    this.eyeH = 1.62; this.stepT = 0;
    this.isPlayer = true; this.team = 'atk'; this.name = 'YOU';
  }
  get y() { return this.eyeH + (this.crouch ? -0.45 : 0); }
  setWeapon(id) {
    this.weaponId = id;
    const w = WEAPONS[id]; this.mag = w.mag; this.reserve = w.reserve;
    this.reloadT = 0; this.fireT = 0;
  }
  respawn(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.pitch = 0;
    this.hp = 100; this.alive = true; this.vel.set(0, 0, 0);
  }
  lookDir() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }
  update(dt, game) {
    if (!this.alive) return;
    const { dx, dy } = this.input.consumeMouse();
    this.yaw -= dx * 0.0022;
    this.pitch = clamp(this.pitch - dy * 0.0022, -1.45, 1.45);
    this.recoil = Math.max(0, this.recoil - dt * 0.09);
    this.spreadBloom = Math.max(0, this.spreadBloom - dt * 0.05);
    const ax = this.input.axis();
    const moving = ax.x !== 0 || ax.z !== 0;
    const walking = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    this.crouch = this.input.isDown('ControlLeft') || this.input.isDown('ControlRight');
    const speed = this.crouch ? 2.2 : walking ? 3.1 : 5.4;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = 0, mz = 0;
    if (moving) {
      const len = Math.hypot(ax.x, ax.z);
      const fx = -sin * (ax.z / len) + cos * (ax.x / len);
      const fz = -cos * (ax.z / len) - sin * (ax.x / len);
      mx = fx * speed; mz = fz * speed;
      this.stepT -= dt * (walking ? 1.6 : 2.4);
      if (this.stepT <= 0) { this.stepT = 0.42; this.audio.step(walking); }
    }
    // Jump / gravity (simple: eye height is fixed, jump is a vertical bob on vel.y).
    if (this.input.isDown('Space') && this.onGround) { this.vel.y = 5.2; this.onGround = false; }
    this.vel.y -= 14 * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }
    const nx = this.pos.x + mx * dt, nz = this.pos.z + mz * dt;
    if (!pointBlocked(nx, this.pos.z, 0.45)) this.pos.x = nx;
    if (!pointBlocked(this.pos.x, nz, 0.45)) this.pos.z = nz;
    // Camera.
    const bob = moving && this.onGround ? Math.sin(performance.now() * 0.011) * 0.03 : 0;
    this.camera.position.set(this.pos.x, this.pos.y + this.y + bob, this.pos.z);
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0, 'YXZ');
    // Fire / reload.
    this.fireT -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = WEAPONS[this.weaponId];
        const need = w.mag - this.mag, take = Math.min(need, this.reserve);
        this.mag += take; this.reserve -= take;
      }
    } else if (this.input.isDown('KeyR') && this.mag < WEAPONS[this.weaponId].mag && this.reserve > 0) {
      this.reloadT = WEAPONS[this.weaponId].reload; this.audio.reload();
    } else if (this.input.firingNow && this.fireT <= 0) {
      const w = WEAPONS[this.weaponId];
      if (this.mag <= 0) { this.audio.dryFire(); this.fireT = 0.3; }
      else { this.shoot(game); this.fireT = 60 / w.rpm; }
    }
  }
  currentSpread() {
    const w = WEAPONS[this.weaponId];
    const ax = this.input.axis();
    const moving = ax.x !== 0 || ax.z !== 0;
    let s = w.spread + this.spreadBloom;
    if (moving) s += w.moveSpread;
    if (this.crouch) s *= 0.55;
    if (!this.onGround) s += 0.05;
    return s;
  }
  shoot(game) {
    const w = WEAPONS[this.weaponId];
    this.mag--;
    this.audio.shot(w.kind);
    this.recoil += w.recoil;
    this.spreadBloom += w.recoil * 0.35;
    const dir = this.lookDir();
    const spread = this.currentSpread();
    const muzzle = this.camera.position.clone().addScaledVector(dir, 0.7);
    muzzle.y -= 0.18;
    const pellets = w.pellets || 1;
    let anyHit = false, anyHead = false;
    for (let p = 0; p < pellets; p++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * spread * 2;
      d.y += (Math.random() - 0.5) * spread * 2;
      d.z += (Math.random() - 0.5) * spread * 2;
      d.normalize();
      const hit = game.traceShot(this.camera.position, d, w.range, this, w);
      if (hit) { anyHit = true; if (hit.head) anyHead = true; }
      this.effects.tracer(muzzle.clone(), this.camera.position.clone().addScaledVector(d, hit ? hit.dist : w.range));
    }
    this.effects.muzzle(muzzle, dir);
    if (anyHit) { this.audio.hit(); if (anyHead) this.audio.headshot(); }
  }
  damage(amount, fromPos, game) {
    if (!this.alive) return;
    let rem = amount;
    if (this.armor > 0) { const ab = Math.min(this.armor, rem * 0.5); this.armor -= ab; rem -= ab; }
    this.hp -= rem;
    this.audio.hurt();
    game.hud.flashDamage();
    if (fromPos) {
      const ang = Math.atan2(fromPos.x - this.pos.x, fromPos.z - this.pos.z);
      const rel = ((ang + this.yaw) * 180 / Math.PI + 360) % 360;
      game.hud.damageFrom(rel);
    }
    if (this.hp <= 0) { this.hp = 0; this.alive = false; game.onPlayerDeath(); }
  }
}
