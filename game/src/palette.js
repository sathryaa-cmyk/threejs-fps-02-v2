// palette.js — HELIOSTAT golden-hour palette + seeded RNG + small helpers.
// Desert solar farm at golden hour: low amber sun, dusty orange haze, dark blue
// panel glass against warm sand. Two teams: HELIO (amber/orange) vs DUST (teal).
export const PAL = {
  skyTop: 0x2e4a6b, skyMid: 0xd97b2f, skyLow: 0xf2a54a,
  sun: 0xffb347, fog: 0xd98a3d, sand: 0xc98f4e, sandDark: 0xa9743a,
  road: 0x6b5a44, panel: 0x14263e, panelEdge: 0x9aa8b8, panelGlint: 0x7fd4ff,
  crate: 0x8a6b3f, crateDark: 0x5f4a2c, metal: 0x4a4f55, metalDark: 0x2c2f33,
  concrete: 0x9c968c, white: 0xe8e2d4, accent: 0xff8c1a, accent2: 0x19c2b8,
  helio: 0xff8c1a, dust: 0x19c2b8, enemy: 0x19c2b8, ally: 0xff8c1a,
  siteA: 0xffb347, siteB: 0x19c2b8, bomb: 0xff3b30,
  ink: '#f5efe2', muted: '#cbb98f', dark: '#14100a',
};
// mulberry32 — deterministic so ?shot= modes render the same frame every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(rng, a, b) { return a + rng() * (b - a); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
// Distance on the XZ plane.
export function dist2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
