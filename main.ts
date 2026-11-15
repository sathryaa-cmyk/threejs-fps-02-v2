// main.ts — HELIOSTAT entry program (make.fun threejs-fps-02, round 2).
// Copies game/ and screenshots/ from this repository to /output and writes
// /output/dossier.json with buildDossier from vendor/makefun-threejs.ts.
// Node 22 standard library only, no network. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output.
// Usage: MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repo = new URL('.', import.meta.url).pathname;
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Fail fast with a plain message when the entry is incomplete, before
// touching /output: the grader's gate would refuse it anyway.
if (!existsSync(join(repo, 'game', 'index.html'))) throw new Error('main.ts: game/index.html is missing');
if (!existsSync(join(repo, 'screenshots'))) throw new Error('main.ts: screenshots/ is missing');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(repo, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
const shots = readdirSync(join(out, 'screenshots'));
console.log(`HELIOSTAT dossier written: ${dossier.length} bytes -> ${join(out, 'dossier.json')}`);
console.log(`HELIOSTAT output: game/ + ${shots.length} screenshot(s) (${shots.join(', ')})`);
