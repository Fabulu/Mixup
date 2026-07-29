// Port twin of tools/oracle/deadphys.py -- same columns, same warp, same kill
// frame, so the two tables diff line for line over the whole death sequence.
//
//   node tools/oracle/deadport.mjs --level 3 --warp 7,28 --kill 10 --frames 452
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  const buf = fs.readFileSync(file);
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')),
           arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const level = parseInt(arg('level', '3'), 10);
const frames = parseInt(arg('frames', '60'), 10);
const kill = parseInt(arg('kill', '10'), 10);
const [wc, wr] = arg('warp', '7,28').split(',').map(Number);

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
await initLevel(state, level);
state.player.x = ((wc & 0xFF) << 8) | 0x80;
state.player.y = (wr & 0xFF) << 8;

const hex4 = (v) => `$${v.toString(16).toUpperCase().padStart(4, '0')}`;
console.log('  f dead   x      y     vx  vy air hp carry');
for (let f = 0; f < frames; f++) {
  state.input.pressed = 0; state.input.held = 0; state.input.prev = 0;
  if (f === kill) state.player.hp = 0;
  // The cartridge harness writes $FF8A mid-iteration, so the kill lands on the
  // frame it is asked for on both sides.
  tick(state, manifest, playerTiles);
  const p = state.player;
  console.log(`${String(f).padStart(3)} ${String(p.dead).padStart(4)} ${hex4(p.x)} ${hex4(p.y)} `
    + `${String(p.vx).padStart(4)} ${String(p.vy).padStart(4)} ${String(p.air).padStart(3)} `
    + `${String(p.hp).padStart(2)} ${String(state.carry.x).padStart(5)}`);
}
