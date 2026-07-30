// Port twin of the cartridge conveyor-death probe: stand on a conveyor, zero
// HP, and print x / carry / dead per frame.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';
installFetchShim();
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
await initLevel(state, 3);
state.player.x = (7 << 8) | 0x80;
state.player.y = 28 << 8;
console.log(' f  dead   x      y     vx  vy air carryX');
for (let f = 0; f < 50; f++) {
  state.input.pressed = 0; state.input.held = 0; state.input.prev = 0;
  if (f === 10) state.player.hp = 0;
  tick(state, manifest, playerTiles);
  const p = state.player;
  console.log(`${String(f).padStart(4)} ${String(p.dead).padStart(3)} $${p.x.toString(16).toUpperCase().padStart(4,'0')} `
    + `$${p.y.toString(16).toUpperCase().padStart(4,'0')} ${String(p.vx).padStart(4)} ${String(p.vy).padStart(4)} ${String(p.air).padStart(2)} ${String(state.carry.x).padStart(5)}`);
}
