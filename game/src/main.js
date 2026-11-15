// main.js — HELIOSTAT orchestrator: renderer, game state machine, rounds,
// economy, bot shooting resolution, plant/defuse, team plans, shot modes.
// Single-player vs bots. First to 8 rounds. Player is HELIO (attacker).
import * as THREE from 'three';
import { PAL, mulberry32, clamp, rand, pick } from './palette.js';
import { AudioSys } from './audio.js';
import { WEAPONS, ECON, ARMOR_PRICE } from './weapons.js';
import { buildWorld, makeSoldier, SITES, SPAWNS, rayHit, pointBlocked, COLLIDERS } from './world.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Player } from './player.js';
import { buildBots, makePlan } from './bots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const rng = mulberry32(SEED * 7919 + 13);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 500);
const { dust } = buildWorld(scene, rng);

const audio = new AudioSys();
const effects = new Effects(scene);
const input = new Input(canvas);
const hud = new HUD(document.getElementById('hud'));
const player = new Player(camera, input, audio, effects);
const bots = buildBots(scene, rng);
for (const b of bots) { b.attachMesh(makeSoldier(b.team === 'atk' ? PAL.helio : PAL.dust)); scene.add(b.mesh); }

// Bomb prop (visible when planted / carried).
const bombMesh = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.36), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 }));
  bombMesh.add(body);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 2 }));
  light.position.set(0, 0.19, 0); bombMesh.add(light);
  bombMesh.userData.light = light;
  bombMesh.visible = false;
  scene.add(bombMesh);
}
// Carrier marker: small beacon above the bomb carrier.
const carrierBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
carrierBeacon.visible = false; scene.add(carrierBeacon);

const game = {
  time: 0, phase: 'menu', // menu | buy | round | roundEnd
  round: 1, scoreA: 0, scoreB: 0, timeLeft: 100, buyTime: 12,
  money: ECON.start, bombPlanted: false, bombSite: null, bombTime: 40, bombPos: null,
  carrier: null, plan: null, plantT: 0, defuseT: 0, planting: false, defusing: false,
  roundLog: [], killsThisRound: 0, startedAt: 0, audio, hud,
  enemiesOf(bot) {
    // Attackers only ever target defenders; defenders target attackers + the player.
    if (bot.team === 'atk') return bots.filter(b => b.team === 'def');
    return [...bots.filter(b => b.team === 'atk'), player];
  },
  aliveCount(team) {
    const n = bots.filter(b => b.team === team && b.alive).length;
    return team === 'atk' ? n + (player.alive ? 1 : 0) : n;
  },
};
window.__heliostat = { game, player, bots, params: Object.fromEntries(params) };

// --- shooting resolution: ray vs bots (capsule approx: body + head spheres) and world.
function rayVsBot(origin, dir, bot, maxD) {
  if (!bot.alive) return null;
  const c = bot.pos;
  // Body: vertical segment y 0.3..1.55, radius 0.42; head sphere at 1.72 r 0.26.
  for (const [cy, r, head] of [[0.95, 0.45, false], [1.72, 0.28, true]]) {
    const ox = origin.x - c.x, oy = origin.y - cy, oz = origin.z - c.z;
    const b = ox * dir.x + oy * dir.y + oz * dir.z;
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - cc;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < maxD) return { dist: t, head };
  }
  return null;
}
game.traceShot = function (origin, dir, range, shooter, w) {
  const wallT = rayHit(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
  let best = null, bestBot = null;
  const targets = shooter === player ? bots.filter(b => b.team === 'def') : shooter.team === 'atk' ? bots.filter(b => b.team === 'def') : [...bots.filter(b => b.team === 'atk'), player];
  for (const t of targets) {
    if (t === shooter) continue;
    const hit = rayVsBot(origin, dir, t, Math.min(range, wallT));
    if (hit && (!best || hit.dist < best.dist)) { best = hit; bestBot = t; }
  }
  const endT = best ? best.dist : wallT;
  if (best && bestBot) {
    const dmg = w.damage * (best.head ? w.headMult : 1) * (1 - Math.min(0.35, best.dist / w.range * 0.35));
    const isPlayerTarget = bestBot === player;
    if (isPlayerTarget) {
      player.damage(dmg, shooter.pos || shooter, game);
    } else {
      const wasAlive = bestBot.alive;
      const died = bestBot.damage(dmg, best.head, game);
      if (died && wasAlive) {
        const killerName = shooter === player ? 'YOU' : shooter.name;
        hud.killfeed(killerName, bestBot.name, best.head);
        if (shooter === player) { player.money += ECON.kill; game.money = player.money; player.kills++; audio.kill(); game.killsThisRound++; }
        else if (shooter.team === 'atk') { shooter.money += ECON.kill; }
        game.checkRoundEnd();
      }
    }
    if (shooter === player) hud.hitmarker(best.head);
    const hitPos = origin.clone().addScaledVector(dir, best.dist);
    effects.burst(hitPos, best.head ? 8 : 5, 0xff5a4a, 4);
    return { dist: best.dist, head: best.head };
  }
  if (wallT < range) {
    const hitPos = origin.clone().addScaledVector(dir, wallT);
    const n = new THREE.Vector3(0, 1, 0);
    effects.decal(hitPos, n);
    effects.burst(hitPos, 4, 0xffc266, 3);
  }
  return null;
};
game.botShoot = function (bot, w, dist) {
  if (bot.reloadT > 0) return;
  bot.mag--;
  audio.shot(w.kind);
  const from = bot.pos.clone(); from.y = 1.45;
  const target = bot.target;
  const aim = new THREE.Vector3(target.pos.x - from.x, (target.pos.y + 1.25) - from.y, target.pos.z - from.z).normalize();
  // Aim error grows with distance and target movement; snipers are precise.
  const err = (bot.role === 'sniper' ? 0.008 : 0.022) + dist * 0.00045 + (bot.role === 'entry' ? 0.006 : 0);
  const dir = aim.clone();
  dir.x += (Math.random() - 0.5) * err * 2; dir.y += (Math.random() - 0.5) * err * 2; dir.z += (Math.random() - 0.5) * err * 2;
  dir.normalize();
  const muzzle = from.clone().addScaledVector(aim, 0.7);
  const hit = game.traceShot(from, dir, w.range, bot, w);
  effects.tracer(muzzle, from.clone().addScaledVector(dir, hit ? hit.dist : w.range), 0xffc27a);
  effects.muzzle(muzzle, aim);
};

// --- rounds & economy
function aliveBots(team) { return bots.filter(b => b.team === team && b.alive); }
function startBuyPhase() {
  game.phase = 'buy'; game.buyTime = 12; game.timeLeft = 12;
  game.bombPlanted = false; game.bombSite = null; game.bombPos = null; game.bombTime = 40;
  game.plantT = 0; game.defuseT = 0; game.planting = false; game.defusing = false;
  bombMesh.visible = false; carrierBeacon.visible = false;
  // Respawn everyone.
  player.respawn(SPAWNS.atk[0][0], SPAWNS.atk[0][1], Math.PI * 0.05);
  player.setWeapon(player.weaponId === 'pistol' && game.money >= 2700 ? 'rifle' : player.weaponId);
  bots.forEach((b, i) => {
    const sp = b.team === 'atk' ? SPAWNS.atk[(i % 4) + 1] : SPAWNS.def[i % 5];
    b.respawn(sp[0], sp[1], b.team === 'atk' ? 0 : Math.PI);
    b.buy(b.team === 'atk' ? game.money : 2700 + Math.floor(rng() * 1500));
  });
  // Team plan + callouts.
  game.plan = makePlan(rng);
  hud.radio(`▸ ${game.plan.plan} — ${game.plan.target === 'A' ? 'Inverter Station' : 'Control Room'}`, 'atk');
  hud.radio(`▸ ${pick(rng, ['Vex', 'Koda', 'Rook'])}: "I'll entry, follow my flash."`, 'atk');
  if (game.plan.plan === 'FAKE A → B') hud.radio('▸ Rook: "Fake A, then rotate B on my mark."', 'atk');
  hud.radio('▸ DUST: "Hold sites, watch mid."', 'def');
  // Assign destinations: attackers to target site (fake first), defenders split sites + mid.
  const site = SITES[game.plan.target];
  const fake = game.plan.fakeSite ? SITES[game.plan.fakeSite] : null;
  bots.filter(b => b.team === 'atk').forEach((b, i) => {
    const dest = fake && i < 2 ? fake : site;
    const jx = rand(rng, -4, 4), jz = rand(rng, -4, 4);
    b.setDest(dest.cx + jx, dest.cz + jz);
    b.state = 'move';
  });
  bots.filter(b => b.team === 'def').forEach((b, i) => {
    const spots = [[SITES.A.cx, SITES.A.cz], [SITES.B.cx, SITES.B.cz], [0, 2], [SITES.A.cx - 6, SITES.A.cz + 6], [SITES.B.cx + 6, SITES.B.cz - 6]];
    const s = spots[i % spots.length];
    b.setDest(s[0] + rand(rng, -2, 2), s[1] + rand(rng, -2, 2));
    b.state = 'hold';
  });
  // Bomb carrier: a random attacker bot (or the player every 3rd round).
  game.carrier = game.round % 3 === 0 ? player : pick(rng, bots.filter(b => b.team === 'atk'));
  if (game.carrier === player) hud.radio('▸ YOU carry the charge. Plant at A or B (hold E).', 'atk');
  else hud.radio(`▸ ${game.carrier.name} carries the charge.`, 'atk');
  hud.showBuy(true, game.money);
  hud.banner(`ROUND ${game.round}`, `${game.plan.plan} — buy up, then deploy`, 2400);
  audio.horn();
}
function startRound() {
  game.phase = 'round'; game.timeLeft = 100;
  hud.showBuy(false);
  hud.radio('▸ Go go go!', 'atk');
}
function endRound(winner, reason) {
  if (game.phase === 'roundEnd') return;
  game.phase = 'roundEnd';
  const atkWon = winner === 'atk';
  if (atkWon) { game.scoreA++; game.money += ECON.win; player.money = game.money; }
  else { game.scoreB++; game.money += ECON.loss; player.money = game.money; }
  if (game.bombPlanted && atkWon && game.bombSite) { /* detonation handled by caller */ }
  hud.banner(atkWon ? 'ROUND WON — HELIO' : 'ROUND LOST — DUST TAKES IT', reason + `  ·  ${atkWon ? '+' : ''}$${atkWon ? ECON.win : ECON.loss}  ·  Score ${game.scoreA}–${game.scoreB}`, 3400);
  hud.radio(atkWon ? `▸ Round ${game.round} — HELIO takes it. ${reason}` : `▸ Round ${game.round} — DUST holds. ${reason}`, atkWon ? 'atk' : 'def');
  game.roundLog.push({ round: game.round, winner, reason, score: `${game.scoreA}-${game.scoreB}` });
  game.round++;
  if (game.scoreA >= 8 || game.scoreB >= 8) {
    const champ = game.scoreA >= 8 ? 'HELIO' : 'DUST';
    hud.banner(champ === 'HELIO' ? '🏆 HELIOSTAT CHAMPIONS — HELIO WINS' : 'DUST WINS THE MATCH', `Final score ${game.scoreA}–${game.scoreB}`, 6000);
    setTimeout(() => { game.round = 1; game.scoreA = 0; game.scoreB = 0; game.money = ECON.start; player.money = ECON.start; startBuyPhase(); }, 6000);
  } else {
    setTimeout(() => { if (game.phase === 'roundEnd') startBuyPhase(); }, 3400);
  }
}
game.checkRoundEnd = function () {
  if (game.phase !== 'round') return;
  if (game.bombPlanted) return; // bomb decides it
  const atkAlive = game.aliveCount('atk'), defAlive = game.aliveCount('def');
  if (defAlive === 0) endRound('atk', 'DUST eliminated.');
  else if (atkAlive === 0) endRound('def', 'HELIO eliminated.');
};
game.onPlayerDeath = function () {
  hud.radio('▸ YOU are down. Spectating Vex…', 'atk');
  game.checkRoundEnd();
};
function explodeBomb() {
  const pos = bombMesh.position.clone();
  effects.explode(pos); audio.explode();
  hud.banner('💥 SITE ' + game.bombSite + ' DETONATED', 'The charge blew the inverter yard.', 3200);
  endRound('atk', 'Charge detonated at Site ' + game.bombSite + '.');
}
function plantProgress(dt) {
  const nearSite = siteNearPlayer();
  const eDown = input.isDown('KeyE');
  if (game.phase === 'round' && !game.bombPlanted && player.alive && nearSite && game.carrier === player && eDown) {
    game.plantT += dt; game.planting = true;
    hud.setPlant(true, 'PLANTING CHARGE — SITE ' + nearSite, game.plantT / 3);
    if (game.plantT >= 3) {
      game.bombPlanted = true; game.bombSite = nearSite; game.bombTime = 40;
      game.bombPos = { x: player.pos.x, z: player.pos.z };
      bombMesh.position.set(player.pos.x, 0.18, player.pos.z); bombMesh.visible = true;
      carrierBeacon.visible = false;
      player.money += ECON.plant; game.money = player.money;
      audio.plant(); hud.setPlant(false);
      hud.radio(`▸ Bomb planted ${nearSite}! 40 seconds — hold the site!`, 'atk');
      hud.radio('▸ DUST: "Bomb down ' + nearSite + '! Rotate, rotate!"', 'def');
      // Defenders rotate to the planted site.
      bots.filter(b => b.team === 'def' && b.alive).forEach(b => {
        const s = SITES[nearSite];
        b.setDest(s.cx + rand(rng, -3, 3), s.cz + rand(rng, -3, 3)); b.state = 'move';
      });
      game.plantT = 0; game.planting = false;
    }
  } else if (game.phase === 'round' && game.bombPlanted && player.alive && input.isDown('KeyE') && player.team === 'atk') {
    // Player is attacker: no defuse.
    game.plantT = 0; game.planting = false; hud.setPlant(false);
  } else {
    if (game.planting) { game.plantT = 0; game.planting = false; hud.setPlant(false); }
  }
}
function siteNearPlayer() {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    if (Math.hypot(player.pos.x - s.cx, player.pos.z - s.cz) < s.r) return key;
  }
  return null;
}
// Defenders defuse when they reach the bomb and hold still next to it.
function defenderDefuse(dt) {
  if (!game.bombPlanted) return;
  for (const b of bots.filter(b => b.team === 'def' && b.alive)) {
    if (Math.hypot(b.pos.x - game.bombPos.x, b.pos.z - game.bombPos.z) < 2.2) {
      game.defuseT += dt;
      hud.setPlant(true, b.name.toUpperCase() + ' IS DEFUSING…', game.defuseT / 5);
      if (Math.floor(game.defuseT * 2) !== Math.floor((game.defuseT - dt) * 2)) audio.beep(false);
      if (game.defuseT >= 5) {
        game.bombPlanted = false; bombMesh.visible = false; hud.setPlant(false);
        audio.defuse();
        hud.banner('DEFUSED — DUST SAVES THE SITE', b.name + ' cut the charge with seconds to spare.', 3200);
        endRound('def', 'Charge defused by ' + b.name + '.');
        return;
      }
      return;
    }
  }
  if (game.defuseT > 0 && !game.planting) { game.defuseT = 0; hud.setPlant(false); }
}
// Bots plant if the carrier bot reaches its site and no defender is near.
function botPlant(dt) {
  if (game.phase !== 'round' || game.bombPlanted || !game.carrier || game.carrier === player) return;
  const c = game.carrier;
  if (!c.alive) {
    // Carrier died: charge passes to another living attacker bot.
    const next = bots.find(b => b.team === 'atk' && b.alive);
    if (next) { game.carrier = next; hud.radio(`▸ ${next.name} picks up the charge.`, 'atk'); }
    return;
  }
  const s = SITES[game.plan.target];
  if (Math.hypot(c.pos.x - s.cx, c.pos.z - s.cz) < s.r - 1) {
    const nearDef = bots.some(b => b.team === 'def' && b.alive && Math.hypot(b.pos.x - c.pos.x, b.pos.z - c.pos.z) < 12 && b.canSee(c.pos.x, 1.4, c.pos.z));
    if (!nearDef) {
      game.plantT += dt;
      hud.setPlant(true, c.name.toUpperCase() + ' IS PLANTING — SITE ' + game.plan.target, game.plantT / 3);
      if (game.plantT >= 3) {
        game.bombPlanted = true; game.bombSite = game.plan.target; game.bombTime = 40;
        game.bombPos = { x: c.pos.x, z: c.pos.z };
        bombMesh.position.set(c.pos.x, 0.18, c.pos.z); bombMesh.visible = true;
        c.money += ECON.plant;
        audio.plant(); hud.setPlant(false);
        hud.radio(`▸ ${c.name} planted at SITE ${game.plan.target}! Hold it!`, 'atk');
        hud.radio(`▸ DUST: "Bomb down ${game.plan.target}! Rotate!"`, 'def');
        bots.filter(b => b.team === 'def' && b.alive).forEach(b => { const t = SITES[game.plan.target]; b.setDest(t.cx + rand(rng, -3, 3), t.cz + rand(rng, -3, 3)); b.state = 'move'; });
        game.plantT = 0;
      }
    } else { game.plantT = 0; hud.setPlant(false); }
  }
}

// --- buy
function buy(id) {
  if (game.phase !== 'buy') return;
  if (id === 'armor') {
    if (player.money >= ARMOR_PRICE && player.armor < 100) { player.money -= ARMOR_PRICE; player.armor = 100; game.money = player.money; audio.buy(); hud.setBuyAfford(player.money); }
    return;
  }
  const w = WEAPONS[id];
  if (!w || player.money < w.price) return;
  player.money -= w.price; game.money = player.money;
  player.setWeapon(id); audio.buy(); hud.setBuyAfford(player.money);
}
hud.onBuy = buy;
hud.onPlay = () => { audio.ensure(); hud.showStart(false); input.requestLock(); startBuyPhase(); };
input.onKey = (code, down) => {
  if (!down) return;
  if (code === 'KeyB' && game.phase === 'buy') hud.showBuy(!hud.el.buymenu.classList.contains('hidden'), game.money);
  if (code === 'Escape') hud.showBuy(false);
  if (game.phase === 'buy') {
    const map = { Digit1: 'rifle', Digit2: 'smg', Digit3: 'sniper', Digit4: 'shotgun', Digit5: 'pistol', Digit6: 'armor' };
    if (map[code]) buy(map[code]);
    if (code === 'Enter' || code === 'Space') startRound();
  }
};
input.onLockChange = (locked) => { if (!locked && game.phase === 'round' && !SHOT) hud.showStart(false); };

// --- shot modes (deterministic staged scenes for screenshots)
function stageShot() {
  audio.enabled = false;
  if (SHOT === 'start') {
    game.phase = 'menu';
    camera.position.set(-30, 9, -18); camera.lookAt(10, 1, 0);
    // A few soldiers posed mid-map for the cover.
    bots.slice(0, 5).forEach((b, i) => { b.respawn(-14 + i * 7, -8 + (i % 2) * 6, 0.6); b.weaponId = 'rifle'; });
    bots.slice(5).forEach((b, i) => { b.respawn(14 + i * 5, 6, -2.4); });
    hud.showStart(true);
    return;
  }
  hud.showStart(false);
  game.phase = 'round'; game.round = 4; game.scoreA = 3; game.scoreB = 2; game.timeLeft = 62;
  game.money = 3250; player.money = 3250;
  player.respawn(0, 2, -Math.PI / 2); player.setWeapon('rifle'); player.hp = 100; player.armor = 50;
  player.mag = 24; player.reserve = 90;
  // Mid-fight staging: enemies ahead on the east road, allies on flanks.
  const defs = bots.filter(b => b.team === 'def');
  const atk = bots.filter(b => b.team === 'atk');
  const defSpots = [[16, 2], [22, -2], [12, 6], [26, 4], [18, -6]];
  defs.forEach((b, i) => { b.respawn(defSpots[i][0], defSpots[i][1], Math.PI * 0.9); b.setWeapon(i === 2 ? 'sniper' : 'rifle'); b.armor = 50; });
  const atkSpots = [[-6, -2], [-10, 6], [-4, -6], [4, 6]];
  atk.forEach((b, i) => { b.respawn(atkSpots[i][0], atkSpots[i][1], -Math.PI / 2); b.setWeapon('rifle'); });
  game.carrier = atk[0];
  game.plan = { plan: 'RUSH A', target: 'A', fakeSite: null };
  if (SHOT === 'play') {
    hud.radio('▸ RUSH A — Inverter Station!', 'atk');
    hud.radio('▸ Vex: "Contact mid, two DUST!"', 'atk');
    hud.radio('▸ DUST: "They\'re pushing A!"', 'def');
    hud.killfeed('Vex', 'Noor', false);
    hud.killfeed('YOU', 'Pike', true);
    // A visible tracer + sparks for action.
    effects.tracer(new THREE.Vector3(16, 1.4, 2), new THREE.Vector3(0, 1.5, 2), 0xffe08a);
    effects.burst(new THREE.Vector3(8, 1.2, 2), 8, 0xffc266, 4);
    // Face the enemy cluster at (16,2) so DUST bots are in frame.
    player.yaw = Math.atan2(-(16 - player.pos.x), -(2 - player.pos.z));
    camera.position.set(player.pos.x, player.y, player.pos.z);
    camera.lookAt(16, 1.3, 2);
  } else if (SHOT === 'buy') {
    game.phase = 'buy'; game.buyTime = 12; game.timeLeft = 12;
    hud.showBuy(true, 3250); hud.setBuyAfford(3250);
  } else if (SHOT === 'end') {
    game.bombPlanted = true; game.bombSite = 'A'; game.bombTime = 12; game.bombPos = { x: 34, z: -22 };
    bombMesh.position.set(34, 0.18, -22); bombMesh.visible = true;
    player.respawn(26, -18, -0.5); player.setWeapon('rifle');
    defs.forEach((b, i) => { b.respawn(30 + i * 2, -16 + i, Math.PI); b.setWeapon('rifle'); });
    atk.forEach((b, i) => { b.respawn(24 + i * 3, -26 + i * 2, 0.3); b.setWeapon('rifle'); });
    hud.radio('▸ Bomb planted A! 40 seconds!', 'atk');
    hud.banner('BOMB PLANTED — SITE A', 'Hold the site. DUST is rotating in.', 99999);
    camera.position.set(24, 2.2, -14); camera.lookAt(34, 1, -22);
  }
}

// --- main loop
const clock = new THREE.Clock();
let dustT = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.time += dt;
  dustT += dt;
  if (dust) { dust.rotation.y = dustT * 0.008; dust.position.x = Math.sin(dustT * 0.05) * 2; }
  if (bombMesh.visible) {
    bombMesh.userData.light.material.emissiveIntensity = 1.5 + Math.sin(game.time * (game.bombTime < 10 ? 12 : 4)) * 1.5;
  }
  // Keep the staged firefight alive in the ?shot=play frame: refresh the
  // tracer every half second (tracers otherwise fade in 0.09 s).
  if (SHOT === 'play' && Math.floor(game.time * 2) !== Math.floor((game.time - dt) * 2)) {
    effects.tracer(new THREE.Vector3(16, 1.4, 2), new THREE.Vector3(0, 1.5, 2), 0xffe08a);
  }
  if (game.phase === 'buy') {
    if (!SHOT) { game.buyTime -= dt; game.timeLeft = game.buyTime; }
    if (game.buyTime <= 0 && !SHOT) startRound();
  } else if (game.phase === 'round') {
    game.timeLeft -= dt;
    if (game.bombPlanted) {
      game.bombTime -= dt;
      if (Math.ceil(game.bombTime) !== Math.ceil(game.bombTime + dt)) audio.beep(game.bombTime < 10);
      if (game.bombTime <= 0) { explodeBomb(); }
    } else if (game.timeLeft <= 0 && !SHOT) {
      endRound('def', 'Time expired — DUST holds the sites.');
    }
    if (!SHOT || SHOT === 'play') {
      player.update(dt, game);
      plantProgress(dt);
      botPlant(dt);
      defenderDefuse(dt);
    }
    // Bots are frozen in staged ?shot= modes: the frame must be deterministic.
    if (!SHOT) for (const b of bots) b.update(dt, game);
    // Carrier beacon follows the carrier.
    if (game.carrier && game.carrier !== player && game.carrier.alive && !game.bombPlanted) {
      carrierBeacon.visible = true;
      carrierBeacon.position.set(game.carrier.pos.x, game.carrier.pos.y + 2.3, game.carrier.pos.z);
    } else carrierBeacon.visible = false;
  } else if (game.phase === 'menu') {
    // Slow cinematic orbit for the start screen.
    if (SHOT !== 'start') {
      const a = game.time * 0.05;
      camera.position.set(Math.cos(a) * 34, 10, Math.sin(a) * 26);
      camera.lookAt(0, 1, 0);
    }
  }
  // HUD state.
  hud.update({
    hp: player.hp, armor: player.armor, money: player.money,
    weaponName: WEAPONS[player.weaponId].name,
    mag: player.mag, reserve: player.reserve,
    scoreA: game.scoreA, scoreB: game.scoreB,
    aliveA: game.aliveCount('atk'), aliveB: game.aliveCount('def'),
    timeLeft: game.timeLeft, phase: game.phase,
    spread: player.currentSpread ? player.currentSpread() : 0.01,
    bombPlanted: game.bombPlanted, bombTime: game.bombTime, bombSite: game.bombSite,
    objective: game.phase === 'buy' ? `BUY PHASE — ${game.plan ? game.plan.plan : ''} · press Enter to deploy` :
      game.bombPlanted ? `BOMB PLANTED SITE ${game.bombSite} — defend it!` :
      game.carrier === player ? 'YOU carry the charge — plant at SITE A or B (hold E)' :
      'Plant the charge at SITE A or SITE B — first to 8 rounds',
  });
  hud.drawMinimap(player, bots, game.bombPos);
  effects.update(dt);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (SHOT) stageShot();
else { hud.showStart(true); game.phase = 'menu'; }
animate();
