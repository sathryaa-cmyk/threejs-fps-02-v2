// weapons.js — weapon definitions and the buy economy.
// Prices mirror a CS-style economy: win $3250, loss $1900, kill $300, plant $300.
export const WEAPONS = {
  pistol:  { name: 'P2000 Sidearm', kind: 'pistol',  price: 0,    damage: 26, headMult: 3.0, rpm: 320, mag: 12, reserve: 48, spread: 0.011, moveSpread: 0.03, recoil: 0.011, auto: false, range: 55, reload: 1.5 },
  smg:     { name: 'Vesper SMG',    kind: 'smg',     price: 1500, damage: 22, headMult: 2.6, rpm: 720, mag: 30, reserve: 120, spread: 0.016, moveSpread: 0.035, recoil: 0.009, auto: true, range: 45, reload: 1.9 },
  rifle:   { name: 'HELIX Rifle',   kind: 'rifle',   price: 2700, damage: 33, headMult: 3.2, rpm: 600, mag: 30, reserve: 90, spread: 0.008, moveSpread: 0.028, recoil: 0.014, auto: true, range: 90, reload: 2.2 },
  shotgun: { name: 'Dune-12',       kind: 'shotgun', price: 2100, damage: 14, headMult: 2.2, rpm: 75,  mag: 6,  reserve: 24, spread: 0.055, moveSpread: 0.07, recoil: 0.05, auto: false, range: 22, reload: 2.6, pellets: 8 },
  sniper:  { name: 'Mirage .50',    kind: 'sniper',  price: 4750, damage: 105, headMult: 2.0, rpm: 48, mag: 5,  reserve: 15, spread: 0.001, moveSpread: 0.09, recoil: 0.07, auto: false, range: 140, reload: 3.1 },
};
export const ARMOR_PRICE = 650;
export const ECON = { start: 800, win: 3250, loss: 1900, kill: 300, plant: 300, defuse: 300 };
export const BUY_LIST = ['rifle', 'smg', 'sniper', 'shotgun', 'pistol'];
export function weaponPrice(id) { return WEAPONS[id] ? WEAPONS[id].price : 0; }
