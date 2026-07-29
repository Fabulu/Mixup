// Port side of tools/oracle/l6clear.py: does clearing LEVEL 6 hand over to
// level 7, and on which frame?
//
// This is the softlock. loc_00_35E8's default arm is `LD C,$01 / JP
// loc_00_2820` -- column 1 of the 0:$286D pair, i.e. the TOP exit -- and level
// 6 is the only level that reaches it (right = $FF, top = $07). main.js used
// to guard the handoff on exitRight, found $FF, wrote no next level, and left
// the cleared vehicle stage running forever.
//
// Drives the real enemy driver, the real $C740 countdown, the real level-6
// fanfare and the real clearLevel, then replays the two lines of main.js's
// step() that consume the request (the same shape flowdiff.mjs uses -- the
// frame loop itself needs a canvas).
//
//   node tools/oracle/l6clear.mjs [--kill 20] [--frames 1400]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(file);
  return {
    ok: true, status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel, clearLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { resolveLoadout } = await imp('src/mods.js');
const { effects } = await imp('src/effects.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const killAt = parseInt(arg('kill', '20'), 10);
const frames = parseInt(arg('frames', '1400'), 10);

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
state.loadout = resolveLoadout([]);
await initLevel(state, 6);

console.log(`level ${state.level.number}  bossId=${state.level.bossId}`
  + `  exitRight=$${state.level.exitRight.toString(16).toUpperCase()}`
  + `  exitTop=$${state.level.exitTop.toString(16).toUpperCase()}`
  + `  vehicle HP=$${state.enemies[0][0x16].toString(16).toUpperCase()}`);

let clearedAt = null;
let handoff = null;
for (let f = 1; f <= frames; f++) {
  if (f === killAt) state.enemies[0][0x16] = 0;     // 1:$4E82's own trigger
  tick(state, manifest, playerTiles);
  if (state.flow.levelCleared === 1 && clearedAt === null) {
    clearedAt = f;
    // --- main.js step()'s clear arm, verbatim -----------------------------
    state.flow.levelCleared = 2;
    const next = clearLevel(state);
    console.log(`f${String(f).padStart(4)}  levelCleared raised;`
      + ` clearLevel -> ${JSON.stringify(next)}`);
    if (next.to === 'transition' && next.exit !== undefined
        && next.exit !== 0xFF && next.exit !== 0xFE) {
      state.flow.nextLevel = next.exit;
    }
    handoff = state.flow.nextLevel;
    break;
  }
  if (effects(state).countdown !== 0xFF && f % 100 === 0) {
    console.log(`f${String(f).padStart(4)}  $C740=$`
      + effects(state).countdown.toString(16).toUpperCase().padStart(2, '0')
      + `  phase=${effects(state).phase} stage=${effects(state).stage}`);
  }
}

if (clearedAt === null) {
  console.log(`\nFAIL: the port never raised flow.levelCleared in ${frames} frames`);
  process.exit(1);
}
if (!handoff) {
  console.log('\nFAIL: SOFTLOCK -- the clear was raised but no next level was '
    + 'written, so the empty level 6 keeps running');
  process.exit(1);
}
// The frame loop then loads it: enterLevel(next, null, { transition: true }).
await initLevel(state, handoff, { transition: true });
console.log(`\nflow.nextLevel = ${handoff}; after the transition load,`
  + ` level = ${state.level.number}`);
console.log(handoff === 7 && state.level.number === 7
  ? 'PASS - clearing level 6 hands over to level 7 through the TOP exit'
  : 'FAIL - wrong destination');
process.exit(handoff === 7 ? 0 : 1);
