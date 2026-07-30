// Port side of tools/oracle/walkoff.py: what survives loc_00_2820?
//
// Loads a level with a distinctive value in every byte the FULL init ($04BE-
// $053F) clears and the walk-off does not, then runs the transition load and
// prints which ones came back. Also runs the same fields through a FULL init
// as a control, so "everything survived" cannot pass by accident.
//
//   node tools/oracle/walkoff.mjs --from 1 --to 2

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';

installFetchShim();

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { resolveLoadout } = await imp('src/mods.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const from = parseInt(arg('from', '1'), 10);
const to = parseInt(arg('to', '2'), 10);

/** Everything $04BE-$053F clears and loc_00_2820 does not. */
const MARK = {
  vx: 6, vy: -39, air: 2, facing: 1, halfW: 14, halfH: 15, iframes: 53,
  anim: 10, animFrame: 3, clingLock: 0x1F, attackTimer: 5, action: 2,
  springArmed: 1, airThrottle: 1, jumpReleased: 1,
};
const MARK_FLOW = { ammo: 7 };
const MARK_WATER = { level: 0x1A00, packed: 0x40, phase: 1 };

async function run(transition) {
  const s = createState(makeTunables());
  s.loadout = resolveLoadout([]);
  await initLevel(s, from);
  Object.assign(s.player, MARK);
  Object.assign(s.flow, MARK_FLOW);
  Object.assign(s.water, MARK_WATER);
  s.frame = 0x7A; s.parity = 0;
  await initLevel(s, to, { transition });
  return s;
}

const t = await run(true);
const f = await run(false);

console.log(`level ${from} -> ${to}   0:$1015 bit 7 `
  + `${(t.level.subtype & 0x80) ? 'SET (sub_00_0D50 clears the motion bytes)'
                                : 'clear'}\n`);
console.log('  field           marked   transition   full init');
const rows = [];
for (const [k, v] of Object.entries(MARK)) rows.push([k, v, t.player[k], f.player[k]]);
for (const [k, v] of Object.entries(MARK_FLOW)) rows.push([k, v, t.flow[k], f.flow[k]]);
for (const [k, v] of Object.entries(MARK_WATER)) {
  rows.push(['water.' + k, v, t.water[k], f.water[k]]);
}
rows.push(['$FFB1', 0x7A, t.frame, f.frame]);
rows.push(['$FFA7', 0, t.parity, f.parity]);
for (const [k, v, a, b] of rows) {
  const kept = a === v ? 'kept' : 'RESET';
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(6)} `
    + `${String(a).padStart(8)} ${kept.padStart(7)}   ${String(b).padStart(8)}`);
}
console.log(`\n  player x/y  transition ${t.player.x},${t.player.y}`
  + `   full ${f.player.x},${f.player.y}`);
