// Does the port reproduce the $0567 HUD GATE?
//
// $0567 / $05D9 both begin `LD A,[$C740] / CP $FF / JR NZ` -- so sub_00_0F7B
// (the energy bar) is drawn ONLY while $C740 holds its idle $FF. It leaves
// $FF in two places: level 14's entrance ($0DE0 seeds it to 1) and the frame a
// boss dies ($4EB8 -> $FE). This drives the port through both and counts the
// HUD sprites in state.video.sprites (tile $30, attr $10).
//
//   node tools/oracle/hudgate.mjs --level 14 --frames 6
//   node tools/oracle/hudgate.mjs --level 4 --frames 400 --kill 30

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
const { resolveLoadout } = await imp('src/mods.js');
const { effects } = await imp('src/effects.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const level = parseInt(arg('level', '4'), 10);
const frames = parseInt(arg('frames', '400'), 10);
const kill = parseInt(arg('kill', '0'), 10);

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
state.loadout = resolveLoadout([]);
await initLevel(state, level);

let prev = null;
for (let f = 1; f <= frames; f++) {
  if (kill && f === kill) state.enemies[0][0x16] = 0;
  tick(state, manifest, playerTiles);
  const s = state.video.sprites;
  const hud = s.filter((e) => (e.tile & 0xFF) === 0x30 && e.y === 8).length;
  const row = `C740=${effects(state).countdown.toString(16).toUpperCase().padStart(2, '0')}` +
              ` phase=${effects(state).phase} stage=${effects(state).stage}` +
              ` n=${s.length} hudSprites=${hud}`;
  if (row !== prev) { console.log(`f${String(f).padStart(5)} ${row}`); prev = row; }
}
