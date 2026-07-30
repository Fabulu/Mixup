// Drive the PORT headless and print every sound cue it queues, per frame.
// Mirrors tools/oracle/playerhunt.py `sound`, so the two lists can be diffed.
//
//   node tools/oracle/portsound.mjs --level 1 --frames 90 --script "40:,4:A,46:"
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

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const frames = parseInt(arg('frames', '120'), 10);
const level = parseInt(arg('level', '1'), 10);
const script = arg('script', `${frames}:`);
const warp = arg('warp', null);

const timeline = [];
for (const seg of script.split(',')) {
  const [n, keys = ''] = seg.split(':');
  let mask = 0;
  for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
  for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
}

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
await initLevel(state, level);

const out = [];
for (let f = 1; f <= frames; f++) {
  if (warp && f === 1) {
    const parts = warp.split(',');
    state.player.x = ((parseInt(parts[0], 10) & 0xFF) << 8) | 0x80;
    if (parts.length > 1) state.player.y = (parseInt(parts[1], 10) & 0xFF) << 8;
  }
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  tick(state, manifest, playerTiles);
  if (process.env.PS_TRACE) console.log(`f${f} air=${state.player.air} vy=${state.player.vy} y=${state.player.y} cling=${state.player.clingLock}`);
  const q = state.sound?.queue ?? [];
  for (const c of q) out.push([f, c.id, c.mask]);
  if (q.length) q.length = 0;
}
console.log('frame  id  mask');
for (const [f, id, m] of out) {
  console.log(`${String(f).padStart(5)}  $${id.toString(16).toUpperCase().padStart(2, '0')}  $${m.toString(16).toUpperCase().padStart(2, '0')}`);
}
