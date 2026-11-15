// world.js — the HELIOSTAT solar farm: map, colliders, waypoint graph, sites,
// and the low-poly soldier factory. Map is 96 x 72 m, golden hour, low sun.
import * as THREE from 'three';
import { PAL, mulberry32, rand } from './palette.js';

export const MAP = { w: 96, h: 72, halfW: 48, halfH: 36 };
// Bomb sites: A = Inverter Station (north-east), B = Control Room (south-west).
export const SITES = {
  A: { name: 'SITE A — INVERTER STATION', cx: 34, cz: -22, r: 7.5, color: PAL.siteA },
  B: { name: 'SITE B — CONTROL ROOM', cx: -34, cz: 22, r: 7.5, color: PAL.siteB },
};
export const SPAWNS = {
  atk: [[-40, -28], [-42, -24], [-38, -30], [-44, -26], [-40, -22]],
  def: [[36, 26], [38, 22], [32, 28], [40, 28], [34, 18]],
};

// AABB colliders {x0,z0,x1,z1,h} — movement + bullet blocking.
export const COLLIDERS = [];
function solid(x0, z0, x1, z1, h = 3) { COLLIDERS.push({ x0, z0, x1, z1, h }); return COLLIDERS[COLLIDERS.length - 1]; }
export function pointBlocked(x, z, r = 0.45) {
  if (Math.abs(x) > MAP.halfW - 1 || Math.abs(z) > MAP.halfH - 1) return true;
  for (const c of COLLIDERS) if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
  return false;
}
// Ray vs colliders (slab test on XZ, height check) — returns t in [0, maxT] or Infinity.
export function rayHit(x, y, z, dx, dy, dz, maxT) {
  let best = Infinity;
  for (const c of COLLIDERS) {
    if (y + dy * best < 0) { /* fall through */ }
    let t0 = 0, t1 = maxT;
    if (Math.abs(dx) < 1e-9) { if (x < c.x0 || x > c.x1) continue; }
    else { let a = (c.x0 - x) / dx, b = (c.x1 - x) / dx; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
    if (Math.abs(dz) < 1e-9) { if (z < c.z0 || z > c.z1) continue; }
    else { let a = (c.z0 - z) / dz, b = (c.z1 - z) / dz; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
    if (t0 < 0) t0 = 0;
    const hy = y + dy * t0;
    if (hy > c.h || hy < 0) continue;
    if (t0 < best) best = t0;
  }
  // Ground plane.
  if (dy < -1e-9) { const tg = -y / dy; if (tg >= 0 && tg < best && tg <= maxT) best = tg; }
  return best;
}

// Waypoint graph: nodes on roads and site approaches, edges where the straight
// line is walkable (sampled). Bots path with BFS.
export const WAYPOINTS = [];
export const WP_EDGES = new Map();
function wp(x, z) { WAYPOINTS.push({ x, z }); return WAYPOINTS.length - 1; }
function walkableLine(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.8);
  for (let i = 1; i < n; i++) { const t = i / n; if (pointBlocked(ax + (bx - ax) * t, az + (bz - az) * t, 0.5)) return false; }
  return true;
}
export function buildWaypoints() {
  // Rows of the grid: spawn lanes, mid roads, site approaches.
  const pts = [
    [-42, -26], [-30, -28], [-18, -26], [-6, -24], [6, -24], [18, -26], [30, -26], [40, -24],
    [-42, -12], [-28, -12], [-14, -12], [0, -12], [14, -12], [28, -12], [40, -12],
    [-42, 2], [-28, 2], [-14, 2], [0, 2], [14, 2], [28, 2], [42, 2],
    [-40, 14], [-28, 14], [-14, 14], [0, 14], [14, 14], [28, 14], [40, 14],
    [-40, 26], [-28, 26], [-14, 26], [0, 26], [14, 26], [28, 26], [40, 26],
    [34, -22], [26, -22], [34, -14], [42, -22], // site A approach
    [-34, 22], [-26, 22], [-34, 14], [-42, 22], // site B approach
    [0, -32], [0, 32], [-20, -32], [20, 32],
  ];
  for (const [x, z] of pts) if (!pointBlocked(x, z, 0.6)) wp(x, z);
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const edges = [];
    for (let j = 0; j < WAYPOINTS.length; j++) {
      if (i === j) continue;
      const a = WAYPOINTS[i], b = WAYPOINTS[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 17 && walkableLine(a.x, a.z, b.x, b.z)) edges.push(j);
    }
    WP_EDGES.set(i, edges);
  }
}
export function nearestWp(x, z) {
  let best = 0, bd = Infinity;
  WAYPOINTS.forEach((w, i) => { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = i; } });
  return best;
}
export function findPath(sx, sz, tx, tz) {
  const s = nearestWp(sx, sz), t = nearestWp(tx, tz);
  const prev = new Map([[s, -1]]); const q = [s];
  while (q.length) {
    const cur = q.shift();
    if (cur === t) break;
    for (const n of WP_EDGES.get(cur) || []) if (!prev.has(n)) { prev.set(n, cur); q.push(n); }
  }
  if (!prev.has(t)) return [{ x: tx, z: tz }];
  const path = []; let cur = t;
  while (cur !== -1) { path.unshift(WAYPOINTS[cur]); cur = prev.get(cur); }
  path.push({ x: tx, z: tz });
  return path;
}

function box(w, h, d, color, x, y, z, ry = 0, rough = 0.9) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.08 }));
  m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildWorld(scene, rng) {
  scene.fog = new THREE.Fog(PAL.fog, 55, 190);
  // Sky: big gradient dome (shader-free: vertex-colored sphere).
  const skyGeo = new THREE.SphereGeometry(220, 24, 16);
  const colors = []; const pos = skyGeo.attributes.position;
  const top = new THREE.Color(PAL.skyTop), mid = new THREE.Color(PAL.skyMid), low = new THREE.Color(PAL.skyLow);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 220;
    const c = y > 0.25 ? top.clone().lerp(mid, 1 - (y - 0.25) / 0.75) : mid.clone().lerp(low, 1 - (y + 0.2) / 0.45);
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  // Low golden sun + warm ambient + hemisphere.
  const sun = new THREE.DirectionalLight(PAL.sun, 2.6);
  sun.position.set(-60, 26, -40); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60; sun.shadow.camera.far = 220;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffd9a0, 0x8a5a30, 0.85));
  const fill = new THREE.DirectionalLight(0x88aaff, 0.25); fill.position.set(40, 30, 50); scene.add(fill);

  // Ground: sand with subtle noise via vertex jitter on a plane.
  const gGeo = new THREE.PlaneGeometry(MAP.w + 40, MAP.h + 40, 48, 36);
  const gp = gGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setZ(i, (rng() - 0.5) * 0.12);
  gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({ color: PAL.sand, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // Service roads (dark strips) + centre line dashes.
  const roadMat = new THREE.MeshStandardMaterial({ color: PAL.road, roughness: 1 });
  for (const [w, d, x, z] of [[96, 7, 0, 2], [7, 72, 0, 0], [60, 6, 0, -26], [60, 6, 0, 26]]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.02, z); r.receiveShadow = true; scene.add(r);
  }
  // Perimeter walls.
  const wallMat = new THREE.MeshStandardMaterial({ color: PAL.concrete, roughness: 0.95 });
  for (const [w, d, x, z] of [[100, 2, 0, -37], [100, 2, 0, 37], [2, 76, -49, 0], [2, 76, 49, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), wallMat);
    m.position.set(x, 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
  solid(-50, -38, 50, -36, 4); solid(-50, 36, 50, 38, 4); solid(-50, -38, -48, 38, 4); solid(48, -38, 50, 38, 4);

  // Solar panel fields: tilted dark-blue arrays on steel legs, in two blocks.
  const panelMat = new THREE.MeshStandardMaterial({ color: PAL.panel, roughness: 0.25, metalness: 0.65 });
  const legMat = new THREE.MeshStandardMaterial({ color: PAL.metalDark, roughness: 0.6, metalness: 0.5 });
  const glintMat = new THREE.MeshStandardMaterial({ color: PAL.panelGlint, roughness: 0.1, metalness: 0.9, emissive: 0x1a3a55, emissiveIntensity: 0.4 });
  function panelRow(cx, cz, n, gap, ry) {
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * gap, z = cz;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const p = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.12, 3.2), panelMat);
      p.position.y = 2.1; p.rotation.x = -0.42; p.castShadow = true; p.receiveShadow = true; g.add(p);
      const glint = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.02, 0.5), glintMat);
      glint.position.set(0, 2.28, -0.9); glint.rotation.x = -0.42; g.add(glint);
      for (const dx of [-2.2, 2.2]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.1, 0.18), legMat); leg.position.set(dx, 1.05, 0.6); g.add(leg); }
      scene.add(g);
      // Collision: the panel block (players walk around, not through).
      const c = Math.cos(ry), s = Math.sin(ry);
      const hx = 2.9, hz = 1.9;
      const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [x + a * c - b * s, z + a * s + b * c]);
      const xs = corners.map(c2 => c2[0]), zs = corners.map(c2 => c2[1]);
      solid(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), 2.4);
    }
  }
  panelRow(-20, -16, 4, 7, 0); panelRow(-20, 8, 4, 7, 0);
  panelRow(20, -8, 4, 7, 0); panelRow(20, 16, 4, 7, 0);
  panelRow(-8, 30, 3, 7, 0.3); panelRow(8, -30, 3, 7, -0.3);

  // Crates / cover blocks scattered on lanes.
  const crateCols = [PAL.crate, PAL.crateDark, PAL.metal];
  const crateSpots = [[-8, -6, 2.4, 1.6], [-2, -12, 2, 2], [10, -4, 2.4, 1.6], [24, 2, 2, 2], [-24, 8, 2.4, 1.6], [4, 8, 2, 2], [-14, 20, 2.4, 1.6], [16, 26, 2, 2], [-30, -6, 2, 2], [30, -16, 2.4, 1.6], [0, -18, 2, 2], [-36, 6, 2, 2], [36, 8, 2, 2]];
  for (const [x, z, w, d] of crateSpots) {
    const h = 1.4 + rng() * 0.9;
    scene.add(box(w, h, d, crateCols[Math.floor(rng() * 3)], x, h / 2, z, rng() * 0.4));
    solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h);
  }
  // Stacked double crates near mid.
  scene.add(box(2.2, 1.3, 2.2, PAL.crateDark, -6, 0.65, 2, 0.2)); solid(-7.1, 0.9, -4.9, 3.1, 1.3);
  scene.add(box(1.8, 1.1, 1.8, PAL.crate, -6, 1.85, 2, 0.5));

  // SITE A — Inverter Station: fenced yard, inverter cabinets, tall pylons.
  const siteA = new THREE.Group(); siteA.position.set(SITES.A.cx, 0, SITES.A.cz);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 13), new THREE.MeshStandardMaterial({ color: 0x7d7468, roughness: 1 }));
  pad.position.y = 0.15; pad.receiveShadow = true; siteA.add(pad);
  for (let i = 0; i < 3; i++) {
    const cab = box(2.2, 2.6, 1.4, i === 1 ? PAL.metal : PAL.white, -4 + i * 4, 1.3, -3.5, 0);
    siteA.add(cab);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    vent.position.set(-4 + i * 4, 2.2, -2.78); siteA.add(vent);
  }
  for (const [x, z] of [[-6.5, 4], [6.5, 4], [-6.5, -5.5], [6.5, -5.5]]) {
    const py = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 7, 6), legMat);
    py.position.set(x, 3.5, z); py.castShadow = true; siteA.add(py);
  }
  const beam = box(14, 0.35, 0.35, PAL.accent, 0, 6.8, 4, 0); siteA.add(beam);
  const beam2 = box(14, 0.35, 0.35, PAL.accent, 0, 6.8, -5.5, 0); siteA.add(beam2);
  scene.add(siteA);
  solid(SITES.A.cx - 6, SITES.A.cz - 5, SITES.A.cx - 2, SITES.A.cz - 2.4, 2.6);
  solid(SITES.A.cx + 2, SITES.A.cz - 5, SITES.A.cx + 6, SITES.A.cz - 2.4, 2.6);
  // Site markers: glowing ring + floating sign.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.35, s.r, 48),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.cx, 0.06, s.cz); scene.add(ring);
    const sign = makeTextSprite(key, s.color);
    sign.position.set(s.cx, 7.5, s.cz); scene.add(sign);
  }
  // SITE B — Control Room: small building with door, windows, antenna, AC unit.
  const siteB = new THREE.Group(); siteB.position.set(SITES.B.cx, 0, SITES.B.cz);
  const hut = box(11, 4.2, 8, PAL.white, 0, 2.1, 0, 0); siteB.add(hut);
  const roof = box(11.8, 0.35, 8.8, PAL.metalDark, 0, 4.35, 0, 0); siteB.add(roof);
  const door = box(1.8, 2.6, 0.15, PAL.metalDark, -2, 1.3, 4.05, 0); siteB.add(door);
  for (const wx of [2.5, 4.2]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshStandardMaterial({ color: 0x1a2f45, roughness: 0.15, metalness: 0.7 }));
    win.position.set(wx, 2.4, 4.06); siteB.add(win);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5, 6), legMat);
  ant.position.set(4.5, 7, -2); siteB.add(ant);
  const ac = box(1.6, 1, 1.2, PAL.metal, -4, 5, -2, 0); siteB.add(ac);
  scene.add(siteB);
  solid(SITES.B.cx - 5.5, SITES.B.cz - 4, SITES.B.cx + 5.5, SITES.B.cz + 4, 4.2);

  // Distant dunes + a few dead trees / pylons for silhouette.
  const duneMat = new THREE.MeshStandardMaterial({ color: 0xb57a3c, roughness: 1 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng() * 0.4;
    const d = 95 + rng() * 40;
    const dune = new THREE.Mesh(new THREE.SphereGeometry(22 + rng() * 18, 12, 8), duneMat);
    dune.scale.y = 0.22; dune.position.set(Math.cos(a) * d, -1, Math.sin(a) * d); scene.add(dune);
  }
  // Floating dust motes.
  const dustGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) { dp[i * 3] = rand(rng, -48, 48); dp[i * 3 + 1] = rand(rng, 0.3, 12); dp[i * 3 + 2] = rand(rng, -36, 36); }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.14, transparent: true, opacity: 0.55 }));
  scene.add(dust);
  buildWaypoints();
  return { dust, sun };
}

function makeTextSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,12,4,0.55)'; g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#' + color.toString(16).padStart(6, '0'); g.lineWidth = 10;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 134);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(4.5, 4.5, 1);
  return sp;
}

// Low-poly soldier: torso, head + helmet, limbs, gun. Team colour on torso/helmet.
export function makeSoldier(teamColor) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), cloth);
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.4), dark);
  vest.position.y = 1.2; g.add(vest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth);
  helm.position.y = 1.78; g.add(helm);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 }));
  visor.position.set(0, 1.72, 0.19); g.add(visor);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), dark);
  legL.position.set(-0.17, 0.36, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.17; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), cloth);
  armL.position.set(-0.42, 1.15, 0.12); armL.rotation.x = -0.9; g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  // Rifle held forward.
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.85), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.4, metalness: 0.6 }));
  gun.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.12), dark);
  mag.position.set(0, -0.14, 0.05); gun.add(mag);
  gun.position.set(0.18, 1.28, 0.45); g.add(gun);
  g.userData = { legL, legR, armL, armR, gun, head };
  return g;
}
