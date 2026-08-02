// Port-side twin of tools/oracle/doortrace.py: runs the REAL port modules and
// dumps the door sequencer, the debris pool, the effect pool, the ballistic
// pool and the named $D000 cells, every frame.
//
// Setup mirrors objport.mjs exactly (same asset shim, same warp-after-frame-1
// rule) so the harnesses stay comparable; only the sampled vector differs.
//
// This file used to carry two shims, standing in for call sites in files the
// door change did not own: `armDoor` at $2046 (player.js's punchHitTest was
// latching the raw probe cell, with no graphic-id walk and no spawns) and
// `updateDoors` at $05D2. BOTH ARE GONE -- src/player.js and src/main.js carry
// the real calls now, and the scenarios still pass, which is what proves the
// wiring rather than just the routines.
//
// Usage: node tools/oracle/doorport.mjs --level 13 --frames 45 --warp 4,30 \
//          --script "4:B,200:" --cells "5,29;5,30;6,29;6,30"

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

installFetchShim();

const { createState, cellIndex } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { resolveLoadout } = await imp('src/mods.js');
const { createDoorState } = await imp('src/doors.js');

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const frames = parseInt(arg('frames', '60'), 10);
const level = parseInt(arg('level', '13'), 10);
const outDir = path.join(ROOT, arg('out', 'rip/port'));
const name = arg('name', `L${String(level).padStart(2, '0')}`);
const script = arg('script', `${frames}:`);
const cells = (arg('cells', '') || '').split(';').filter(Boolean)
  .map((p) => p.split(',').map((v) => parseInt(v, 10)));

const timeline = [];
for (const seg of script.split(',')) {
  const [n, keys = ''] = seg.split(':');
  let mask = 0;
  for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
  for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
}

const state = createState(makeTunables(resolveLoadout([]).tunables));
state.loadout = resolveLoadout([]);
// state.js still ships `doors` as three loose bytes; give it the real record.
state.doors = createDoorState();
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
await initLevel(state, level);

const ammo = arg('ammo', null);
if (ammo !== null) state.flow.ammo = parseInt(ammo, 10) & 0xFF;

const warp = arg('warp', null);
function applyWarp() {
  if (warp === null) return;
  const [c, r] = warp.split(',').map((v) => parseInt(v, 10));
  state.player.x = ((c & 0xFF) << 8) | 0x80;
  if (!Number.isNaN(r)) state.player.y = (r & 0xFF) << 8;
}

const flat = (pool) => pool.flatMap((r) => [...r]);

const trace = [];
for (let f = 1; f <= frames; f++) {
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;

  tick(state, manifest, playerTiles);

  const p = state.player;
  const cellBytes = [];
  for (const [c, r] of cells) {
    const i = cellIndex(c, r) * 2;
    cellBytes.push(state.level.cells[i] ?? 0, state.level.cells[i + 1] ?? 0);
  }
  trace.push({
    f, x: p.x, y: p.y, vx: p.vx & 0xFF, vy: p.vy & 0xFF, air: p.air,
    facing: p.facing, hp: p.hp, atk: p.attackTimer,
    camX: state.camera.x, camY: state.camera.y,
    seq: state.doors.active, dcol: state.doors.col, drow: state.doors.row,
    debris: flat(state.doors.debris),
    eff: flat(state.doors.effects),
    bal: flat(state.drops),
    cells: cellBytes,
  });
  if (f === 1) applyWarp();
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `doortrace_${name}.json`),
                 JSON.stringify({ level, script, frames: trace }));
console.log(`level ${level}, ${frames} frames, script "${script}" -> ` +
            path.join(outDir, `doortrace_${name}.json`));
