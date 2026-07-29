// Direct probe harness: place the port's player at an exact (x, y) on a real
// level and call ONE collision routine, then report what changed.
//
// The frame harnesses can only compare trajectories; this pins a single probe
// so "the ROM breaks cell A and the port breaks cell B" is stated about the
// same input state rather than about two runs that had already drifted.
//
// Usage: node tools/oracle/probeunit.mjs --level 5 --x 0x47C2 --y 0x1D03 --probe floor

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(file);
  return { ok: true, status: 200,
           json: async () => JSON.parse(buf.toString('utf8')),
           arrayBuffer: async () =>
             buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest } = await imp('src/assets.js');
const { resolveLoadout } = await imp('src/mods.js');
const C = await imp('src/collision.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const num = (v) => (String(v).startsWith('0x') ? parseInt(v, 16) : parseInt(v, 10));

const level = num(arg('level', '5'));
const loadout = resolveLoadout([]);
const state = createState(makeTunables(loadout.tunables));
state.loadout = loadout;
await loadManifest();
await initLevel(state, level);

const p = state.player;
p.x = num(arg('x', '0'));
p.y = num(arg('y', '0'));
p.air = num(arg('air', '2'));
p.halfW = num(arg('halfW', String(p.halfW)));
p.halfH = num(arg('halfH', String(p.halfH)));
p.facing = num(arg('facing', '0'));
if (arg('hp', null) !== null) p.hp = num(arg('hp'));

const before = state.level.cells.slice();
const beforeHp = p.hp, beforeAmmo = state.flow.ammo, beforeMax = p.hpMax;
const kind = arg('probe', 'floor');
let res;
if (kind === 'floor') res = C.probeFloor(state);
else if (kind === 'ceiling') res = C.probeCeiling(state);
else res = C.resolveWall(state, kind);            // 'right' | 'left'

const w = state.level.width;
const chg = [];
for (let i = 0; i < before.length; i += 2) {
  if (before[i] !== state.level.cells[i] || before[i + 1] !== state.level.cells[i + 1]) {
    chg.push(`(${(i / 32) | 0},${((i % 32) / 2) | 0}) ${before[i].toString(16)}/${before[i + 1].toString(16)}`
             + ` -> ${state.level.cells[i].toString(16)}/${state.level.cells[i + 1].toString(16)}`);
  }
}
console.log(`level ${level} width ${w}  x=${p.x.toString(16)} y=${p.y.toString(16)} `
            + `col=${num(arg('x', '0')) >> 8} row=${num(arg('y', '0')) >> 8} `
            + `pixelX=${(num(arg('x', '0')) & 0xF0) >> 4}`);
console.log(`probe ${kind} ->`, JSON.stringify(res));
console.log('cells changed:', chg.length ? chg.join('  ') : '(none)');
console.log(`hp ${beforeHp}->${p.hp}  hpMax ${beforeMax}->${p.hpMax} `
            + ` ammo ${beforeAmmo}->${state.flow.ammo}`);
console.log('breakable slot0:', JSON.stringify(state.breakables[0]));
console.log(`player moved to x=${p.x.toString(16)} y=${p.y.toString(16)}`);
