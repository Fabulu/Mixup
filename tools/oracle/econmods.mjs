// Does every economy tunable a mod can set actually reach the engine?
//
// `bossHPBonusHard` sat declared-but-unconsumed for months. This walks the
// whole registry and answers the question with a number instead of a reading:
//   1. static: which DEFAULT_TUNABLES keys does no file under src/ ever read?
//   2. dynamic: boot a state under each economy mod and print what the run
//      actually starts with.
//
// Usage: node tools/oracle/econmods.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, gamePath, installFetchShim } from './_env.mjs';

installFetchShim();

const { DEFAULT_TUNABLES, makeTunables } = await imp('src/tunables.js');
const { createState } = await imp('src/state.js');
const { initLevel } = await imp('src/level.js');
const { resolveLoadout, MODS } = await imp('src/mods.js');

// --- 1. static consumption -------------------------------------------------
function srcFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...srcFiles(p));
    else if (e.name.endsWith('.js') && e.name !== 'tunables.js') out.push(p);
  }
  return out;
}
const blob = srcFiles(gamePath('src'))
  .map((f) => fs.readFileSync(f, 'utf8')).join('\n');

console.log('=== tunables no file under src/ ever reads ===');
let dead = 0;
for (const k of Object.keys(DEFAULT_TUNABLES)) {
  const re = new RegExp(`\\b${k}\\b`);
  if (!re.test(blob)) {
    dead++;
    console.log(`  ${k.padEnd(24)} = ${DEFAULT_TUNABLES[k]}   (declared, never consumed)`);
  }
}
console.log(`  -> ${dead} of ${Object.keys(DEFAULT_TUNABLES).length}`);

// Which of those a mod could plausibly want, and does any mod set one?
const modKeys = new Set(Object.values(MODS).flatMap((m) => Object.keys(m.params || {})));
console.log('\n  mods that set an unconsumed key:',
  [...modKeys].filter((k) => !new RegExp(`\\b${k}\\b`).test(blob)).join(', ') || 'none');

// --- 2. what a run actually starts with ------------------------------------
console.log('\n=== boot state per mod (level 1, as boot() builds it) ===');
console.log('  mod                 startingLives  ->  flow.lives   startingMaxHP -> hpMax');
for (const ids of [[], ['one-life'], ['tank-batman'], ['glass-cannon'],
                   ['one-life', 'tank-batman']]) {
  const lo = resolveLoadout(ids);
  const state = createState(makeTunables(lo.tunables));
  state.loadout = lo;
  await initLevel(state, 1);
  const t = state.tunables;
  const ok = state.flow.lives === t.startingLives ? '' : '   <-- MISMATCH';
  console.log(`  ${(ids.join('+') || '(none)').padEnd(20)}`
    + `${String(t.startingLives).padStart(9)}  ->  ${String(state.flow.lives).padStart(8)}`
    + `${String(t.startingMaxHP).padStart(14)} -> ${String(state.player.hpMax).padStart(5)}${ok}`);
}
