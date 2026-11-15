// bots.js — team-tactics bots: waypoint navigation, per-round team plans,
// roles (entry / support / sniper / lurker), radio callouts, economy buys,
// rotation to a planted bomb, burst fire with reaction time and aim error.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { findPath, pointBlocked, rayHit, SITES } from './world.js';
import { clamp, rand, pick } from './palette.js';

const NAMES_ATK = ['Vex', 'Koda', 'Rook', 'Iris'];
const NAMES_DEF = ['Ash', 'Noor', 'Pike', 'Sable', 'Frost'];
const ROLES = ['entry', 'support', 'sniper', 'lurker'];
export const PLANS = ['RUSH A', 'RUSH B', 'SPLIT', 'FAKE A → B'];

export function makePlan(rng) {
  const plan = pick(rng, PLANS);
  const target = plan === 'RUSH A' ? 'A' : plan === 'RUSH B' ? 'B' : plan === 'FAKE A → B' ? 'B' : (rng() < 0.5 ? 'A' : 'B');
  return { plan, target, fakeSite: plan === 'FAKE A → B' ? 'A' : null };
}

export class Bot {
  constructor(scene, team, name, role, rng) {
    this.team = team; this.name = name; this.role = role; this.rng = rng;
    this.hp = 100; this.armor = 0; this.alive = true;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; this.speed = team === 'atk' ? 4.6 : 4.2;
    this.path = []; this.pathI = 0; this.repathT = 0;
    this.weaponId = 'pistol'; this.mag = 12; this.reserve = 48;
    this.fireT = 0; this.reloadT = 0; this.burstLeft = 0; this.aimErr = 0.02;
    this.reactT = 0; this.target = null; this.lastSeen = 0;
    this.holdT = 0; this.dest = null; this.state = 'move';
    this.mesh = null; this.walkPhase = 0;
    this.money = 800;
  }
  attachMesh(mesh) { this.mesh = mesh; this.mesh.visible = false; }
  buy(money) {
    this.money = money;
    const w = this.role === 'sniper' && money >= 4750 ? 'sniper' : money >= 2700 ? 'rifle' : money >= 1500 ? 'smg' : 'pistol';
    this.setWeapon(w);
    if (money - WEAPONS[w].price >= 650 && this.rng() < 0.7) { this.armor = 100; this.money -= WEAPONS[w].price + 650; }
    else this.money -= WEAPONS[w].price;
  }
  setWeapon(id) {
    this.weaponId = id;
    const w = WEAPONS[id]; this.mag = w.mag; this.reserve = w.reserve;
  }
  respawn(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.hp = 100; this.alive = true;
    this.path = []; this.state = 'move'; this.fireT = 0; this.reloadT = 0; this.target = null;
    if (this.mesh) { this.mesh.visible = true; this.mesh.position.copy(this.pos); }
  }
  setDest(x, z) {
    this.dest = { x, z };
    this.path = findPath(this.pos.x, this.pos.z, x, z); this.pathI = 0;
  }
  // Line of sight: no collider between eye and target chest.
  canSee(tx, ty, tz) {
    const dx = tx - this.pos.x, dy = ty - 1.45, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 95) return false;
    const t = rayHit(this.pos.x, 1.45, this.pos.z, dx / d, dy / d, dz / d, d);
    return t >= d - 0.05;
  }
  // Damage this bot; returns true if killed. `fromYaw` is the shooter's yaw for hit direction.
  damage(amount, head, game) {
    if (!this.alive) return false;
    let rem = amount;
    if (this.armor > 0) { const absorbed = Math.min(this.armor, rem * 0.5); this.armor -= absorbed; rem -= absorbed; }
    this.hp -= rem;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; if (this.mesh) this.mesh.visible = false; return true; }
    return false;
  }
  update(dt, game) {
    if (!this.alive) return;
    const w = WEAPONS[this.weaponId];
    // --- pick a target: nearest visible enemy (player or opposing bot)
    this.reactT -= dt;
    let best = null, bd = 1e9;
    for (const e of game.enemiesOf(this)) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d > 55) continue; // bots only engage inside 55 m — no spawn-to-spawn sniping
      if (d < bd && this.canSee(e.pos.x, e.pos.y + 1.2, e.pos.z)) { best = e; bd = d; }
    }
    if (best) {
      if (this.target !== best) { this.target = best; this.reactT = 0.25 + this.rng() * 0.35 + (this.role === 'sniper' ? -0.1 : 0); }
      this.lastSeen = game.time;
    } else if (this.target && game.time - this.lastSeen > 1.2) this.target = null;

    // --- combat: face target, burst fire
    if (this.target && this.reactT <= 0) {
      const t = this.target;
      const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
      this.yaw = Math.atan2(-dx, -dz);
      const dist = Math.hypot(dx, dz);
      this.fireT -= dt;
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.mag = w.mag; this.reserve -= w.mag; } }
      else if (this.mag <= 0) { this.reloadT = w.reload; game.audio.reload(); }
      else if (this.fireT <= 0) {
        if (this.burstLeft <= 0) this.burstLeft = this.role === 'sniper' ? 1 : 2 + Math.floor(this.rng() * 3);
        this.burstLeft--;
        this.fireT = 60 / w.rpm + (this.burstLeft <= 0 ? 0.25 + this.rng() * 0.4 : 0);
        game.botShoot(this, w, dist);
      }
      // Strafe a little while fighting; hold position if sniper.
      if (this.role !== 'sniper' && dist > 6) this.moveToward(t.pos.x, t.pos.z, dt, 0.6);
    } else {
      // --- movement along path
      this.repathT -= dt;
      if (this.dest && this.repathT <= 0) {
        this.repathT = 1.5;
        this.path = findPath(this.pos.x, this.pos.z, this.dest.x, this.dest.z); this.pathI = 0;
      }
      if (this.pathI < this.path.length) {
        const node = this.path[this.pathI];
        const d = Math.hypot(node.x - this.pos.x, node.z - this.pos.z);
        if (d < 0.9) this.pathI++;
        else {
          const sp = this.role === 'lurker' ? this.speed * 0.6 : this.speed;
          this.moveToward(node.x, node.z, dt, 1, sp);
        }
      } else if (this.state === 'hold') {
        // Hold angle: slowly scan.
        this.yaw += Math.sin(game.time * 0.5 + this.name.length) * dt * 0.4;
      }
    }
    // --- mesh sync + walk animation
    if (this.mesh) {
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.yaw;
      const moving = this.pathI < this.path.length || this.target;
      this.walkPhase += dt * (moving ? 9 : 0);
      const u = this.mesh.userData;
      if (u.legL) { u.legL.rotation.x = Math.sin(this.walkPhase) * 0.55; u.legR.rotation.x = -Math.sin(this.walkPhase) * 0.55; }
      if (u.armR) u.armR.rotation.x = -0.9 + Math.sin(this.walkPhase * 0.5) * 0.08;
    }
  }
  moveToward(x, z, dt, f = 1, speed = this.speed) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    const nx = this.pos.x + (dx / d) * speed * f * dt;
    const nz = this.pos.z + (dz / d) * speed * f * dt;
    if (!pointBlocked(nx, this.pos.z, 0.45)) this.pos.x = nx;
    if (!pointBlocked(this.pos.x, nz, 0.45)) this.pos.z = nz;
    this.yaw = Math.atan2(-(dx / d), -(dz / d));
  }
}

export function buildBots(scene, rng) {
  const bots = [];
  NAMES_ATK.forEach((n, i) => bots.push(new Bot(scene, 'atk', n, ROLES[i % 4], rng)));
  NAMES_DEF.forEach((n, i) => bots.push(new Bot(scene, 'def', n, ROLES[(i + 1) % 4], rng)));
  return bots;
}
