// Port-side twin of tools/oracle/objtrace.py: runs the REAL port modules for N
// frames with scripted input and dumps the whole $C1E8 map-object array, all 8
// records, all 16 bytes, every frame.
//
// It exists for the same reason objtrace.py does -- render-frame.mjs traces
// four bytes of two slots, and the map-object handlers need the +9/+$0A screen
// cache and the per-slot state/position bytes of every slot. Setup mirrors
// render-frame.mjs exactly (same asset shim, same warp-after-frame-1 rule) so
// the two harnesses stay comparable; only the sampled vector differs.
//
// Usage: node tools/oracle/objport.mjs --level 3 --frames 200 --script "200:"

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

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const frames = parseInt(arg('frames', '200'), 10);
const level = parseInt(arg('level', '3'), 10);
const outDir = path.join(ROOT, arg('out', 'rip/port'));
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

// --inject '[[track,dir],...]' stubs a subsystem the port does not own yet, so
// the code under test is the only variable. Today the only user is the level-6
// track ($FFCA/$FFCB) and its direction byte ($FFC9), which loc_00_2EF4 -- the
// unported level-6 branch of sub_00_2CBE -- is the sole writer of. Values come
// from the oracle run of the SAME scenario, never from a checked-in table.
const inject = arg('inject', null) === null ? null : JSON.parse(arg('inject'));

const trace = [];
for (let f = 1; f <= frames; f++) {
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  if (inject) {
    const [track, dir] = inject[Math.min(f - 1, inject.length - 1)];
    state.flow.parallaxTrack = track;
    state.flow.conveyorDir = dir;
  }
  tick(state, manifest, playerTiles);

  const p = state.player;
  const obj = [];
  for (let s = 0; s < 8; s++) for (let i = 0; i < 16; i++) obj.push(state.actors[s][i]);
  const cellBytes = [];
  for (const [c, r] of cells) {
    const i = cellIndex(c, r) * 2;
    cellBytes.push(state.level.cells[i] ?? 0, state.level.cells[i + 1] ?? 0);
  }
  trace.push({
    f, x: p.x, y: p.y, vx: p.vx & 0xFF, vy: p.vy & 0xFF, air: p.air,
    camX: state.camera.x, camY: state.camera.y, hp: p.hp,
    carryX: state.carry.x & 0xFF, carryY: state.carry.y & 0xFF,
    track: state.flow.parallaxTrack, dir: state.flow.conveyorDir ?? 0,
    obj, cells: cellBytes,
  });
  if (f === 1) applyWarp();
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'objtrace.json'),
                 JSON.stringify({ level, script, frames: trace }));
console.log(`level ${level}, ${frames} frames, script "${script}" -> ` +
            path.join(outDir, 'objtrace.json'));
