# HELIOSTAT — 5v5 Tactical FPS at a Desert Solar Farm

[![make.fun](https://img.shields.io/badge/make.fun-threejs--fps--02-orange)](https://make.fun/c/threejs-fps-02)

A Counter-Strike-STYLE round-based tactical FPS built on three.js 0.187, set in a
desert solar farm at golden hour: mirror panel fields, service roads, an Inverter
Station (Site A) and a Control Room (Site B), low amber sun, orange dust.

## The game

- **5v5 rounds** — you + 4 HELIO teammate bots vs 5 DUST bots. First to 8 rounds.
- **Bomb objective** — attackers carry the charge; plant at Site A or B (hold E,
  3 s plant, 40 s fuse, 5 s defuse). Detonation or elimination wins the round.
- **Buy economy** — win $3250, loss $1900, kill $300, plant $300. Buy menu (B):
  HELIX rifle, Vesper SMG, Mirage .50 sniper, Dune-12 shotgun, sidearm, Kevlar.
- **Team-tactics bots** — waypoint graph, roles (entry / support / sniper / lurker),
  a team plan each round (Rush A, Rush B, Split, Fake A → B), radio callouts,
  rotation to the planted site, and economy-aware buys.
- **Combat** — WASD, Shift walk (accurate), Space jump, Ctrl crouch, pointer-lock
  aim, recoil + spread, headshots, tracers, muzzle flash, hitmarkers, killfeed,
  damage-direction indicator.
- **HUD** — health, armor, ammo, money, round timer, score, alive pips, minimap,
  bomb timer, buy menu, round banners.
- **Audio** — fully synthesized WebAudio: per-weapon gunshots, reload, footsteps,
  hit ticks, round horn, bomb beeps, desert wind. No audio files, no network.

## How to run

```sh
node serve.ts
# open http://localhost:8080/ — click DEPLOY, then click the canvas for mouse look
```

Screenshots are deterministic staged renders: `?shot=start|play|buy|end&seed=1`.

## How to hand in (make.fun)

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` + `screenshots/` to the output directory and writes
`dossier.json` with the kit's `vendor/makefun-threejs.ts` (Node 22 stdlib only).

## License

MIT — see LICENSE.
