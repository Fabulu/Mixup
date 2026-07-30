// What is the port's background sampler actually finding in the sky band?
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imp, installFetchShim } from './_env.mjs';
installFetchShim();
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel, metatileTile } = await imp('src/level.js');
const { mapTile } = await imp('src/state.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const level = parseInt(arg('level', '9'), 10);
const frames = parseInt(arg('frames', '40'), 10);

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
await initLevel(state, level);
for (let f = 1; f <= frames; f++) {
  const held = f > 20 ? 0x10 : 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held; state.input.prev = held;
  tick(state, manifest, playerTiles);
}
const t = state.level.tiles;
console.log('level', level, 'width', state.level.width, 'cam', state.camera.x, state.camera.y);
console.log('bg tile cache: length', t.bg.length, 'defined',
  t.bg.reduce((a, v) => a + (v ? 1 : 0), 0));
const missing = [];
for (let i = 0; i < 256; i++) if (!t.bg[i]) missing.push(i);
console.log('bg entries MISSING:', missing.length, missing.slice(0, 64).map((v) => '$' + v.toString(16)).join(' '));

// Walk the visible rows and log metatile -> tile ids.
for (const wy of [0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240]) {
  const worldY = wy + 0;
  const row = (worldY >> 4) & 0x0F;
  let s = '';
  for (let c = 0; c < 12; c++) {
    const mid = mapTile(state, c, row);
    const tl = metatileTile(state, mid, 0, 0) & 0xFF;
    s += `${String(mid).padStart(3)}/${String(tl).padStart(3)}${t.bg[tl] ? ' ' : '!'}`;
  }
  console.log(`row ${String(row).padStart(2)}  ${s}`);
}
