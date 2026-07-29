// Port-side companion to tools/oracle/oamorder.py: dump state.video.sprites
// (our shadow OAM, in call order) for N frames.
//
//   node tools/oracle/oamport.mjs --level 9 --frames 4

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(file);
  return {
    ok: true, status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { resolveLoadout } = await imp('src/mods.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const level = parseInt(arg('level', '9'), 10);
const frames = parseInt(arg('frames', '4'), 10);
const warp = arg('warp', null);

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
state.loadout = resolveLoadout([]);
await initLevel(state, level);
if (warp) {
  const [c, r] = warp.split(',').map(Number);
  state.player.x = (c << 8) | 0x80;
  if (r !== undefined) state.player.y = r << 8;
}

for (let f = 1; f <= frames; f++) {
  tick(state, manifest, playerTiles);
  const s = state.video.sprites;
  const head = s.slice(0, Number(arg('entries', 12))).map((e, i) =>
    `${i}:${e.x},${e.y}#${(e.tile & 0xFF).toString(16).toUpperCase().padStart(2, '0')}a${(e.attr & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`).join(' | ');
  console.log(`f${String(f).padStart(3)} par=${state.parity ^ 1} n=${s.length}`);
  console.log('        ' + head);
}
