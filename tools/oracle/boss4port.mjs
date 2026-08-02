// PORT TWIN of tools/oracle/boss4phase2.py.
//
// The cartridge probe forces $C73D = 1 from frame 690 -- "phase 2 running",
// which $72C8 parks there permanently -- and reports which band arm the FAR
// range ($60 and up) takes. This runs the same experiment against src/, so the
// two answers can be put side by side. It exists because the ROM arm counters
// have no port equivalent: what a port twin CAN show is the observable state
// each arm leaves behind, and hop and throw leave very different ones
//
//   HOP   ($7506) sets r[0] bit 1, launches r[$13], leaves r[$14] = 0
//   THROW ($73B1) sets r[0] bit 4 and r[$14] = $1F (or $3F on the crit)
//
//   node tools/oracle/boss4port.mjs
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

const state = createState(makeTunables());
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
await initLevel(state, 0x0E);

const REPORT = new Set([700, 705, 750, 800, 899]);
const u8 = (v) => v & 0xFF;

for (let f = 2; f < 900; f++) {
  if (f >= 690) state.flow.bossRage = 1;            // $C73D, held
  state.input.pressed = 0;
  state.input.held = 0;
  state.input.prev = 0;
  tick(state, manifest, playerTiles);

  if (!REPORT.has(f)) continue;
  const r = state.enemies[0];
  const psx = u8((u8((state.player.x - state.camera.x) >> 4) + 8));
  const ad = Math.abs(psx - r[7]);
  console.log(`f${String(f).padStart(4)} rage=${state.flow.bossRage} ` +
              `flags=${r[0].toString(16).toUpperCase().padStart(2, '0')} ` +
              `sub=${r[1].toString(16).toUpperCase().padStart(2, '0')} ` +
              `esx=${String(r[7]).padStart(3)} psx=${String(psx).padStart(3)} ` +
              `ad=${String(ad).padStart(3)} ` +
              `at=${r[0x14].toString(16).toUpperCase().padStart(2, '0')} ` +
              `vx=${r[0x12].toString(16).toUpperCase().padStart(2, '0')} ` +
              `hp=${r[0x16]}`);
}
