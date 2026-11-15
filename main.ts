// main.ts — HELIOSTAT entry program (make.fun threejs-fps-02, round 2).
// Copies game/ and screenshots/ from this repository to /output and writes
// /output/dossier.json with buildDossier from vendor/makefun-threejs.ts.
// Node 22 standard library only, no network. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output.
// Usage: MAKEFUN_OUTPUT_DIR=out node main.ts
//
// ROUND 2 FIX — root cause of the dev-grade run_completes failure:
// /output is a MOUNTED directory in the grader sandbox, so the old code's
// rmSync(out, { recursive: true }) tried to remove the mount point itself
// and died with EBUSY ("Device or resource busy '/output'"), exit 1, before
// writing anything. Round 1's main.ts never removed /output and passed the
// same grader. This version clears only the CONTENTS of /output (each entry
// inside it is an ordinary file/directory and removes cleanly), then copies
// into it — so both grader runs still start from an empty output.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Fail fast with a plain message when the entry is incomplete, before
// touching /output: the grader's gate would refuse it anyway.
if (!existsSync(join(repo, 'game', 'index.html'))) throw new Error('main.ts: game/index.html is missing');
const shotDir = join(repo, 'screenshots');
const shotCount = existsSync(shotDir)
  ? readdirSync(shotDir).filter((name) => !name.startsWith('.')).length
  : 0;
if (shotCount < 3 || shotCount > 4) throw new Error(`main.ts: screenshots/ must hold 3 or 4 images, found ${shotCount}`);

// Clear the CONTENTS of /output, never /output itself: it is a mount point
// in the grader sandbox and removing it fails EBUSY. Each entry inside it
// removes cleanly, so both grader runs still start from an empty output.
mkdirSync(out, { recursive: true });
for (const name of readdirSync(out)) rmSync(join(out, name), { recursive: true, force: true });
cpSync(join(repo, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
if (!dossier.length) throw new Error('main.ts: buildDossier returned an empty dossier');
const shots = readdirSync(join(out, 'screenshots'));
const gameFiles = readdirSync(join(out, 'game'), { recursive: true }).length;
console.log(`HELIOSTAT dossier written: ${dossier.length} bytes -> ${join(out, 'dossier.json')}`);
console.log(`HELIOSTAT output: game/ (${gameFiles} entries) + ${shots.length} screenshot(s) (${shots.join(', ')})`);
