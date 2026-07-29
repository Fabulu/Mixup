// Port-side twin of tools/oracle/mapdelta.py: the same scenario against the
// real src/ modules, recording every map-cell change per frame.
//
// Usage: node tools/oracle/mapdeltaport.mjs --level 7 --warp 13,26 \
//          --frames 120 --script "1:,119:R" --out rip/terrain/port-l7.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, json: async () => ({}),
             arrayBuffer: async () => new ArrayBuffer(0) };
  }
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
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { resolveLoadout } = await imp('src/mods.js');

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const frames = parseInt(arg('frames', '120'), 10);
const level = parseInt(arg('level', '1'), 10);
const script = arg('script', `${frames}:R`);
const out = path.join(ROOT, arg('out', 'rip/terrain/port.json'));
const warp = arg('warp', null);

const timeline = [];
for (const seg of script.split(',')) {
  const [n, keys = ''] = seg.split(':');
  let mask = 0;
  for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
  for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
}

const loadout = resolveLoadout([]);
const state = createState(makeTunables(loadout.tunables));
state.loadout = loadout;
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
await initLevel(state, level);

let prev = null;
const rows = [];
for (let f = 1; f <= frames; f++) {
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  tick(state, manifest, playerTiles);

  const cells = state.level.cells;
  const chg = [];
  if (prev) {
    for (let i = 0; i < cells.length; i += 2) {
      if (cells[i] !== prev[i] || cells[i + 1] !== prev[i + 1]) {
        chg.push([(i / 32) | 0, ((i % 32) / 2) | 0, cells[i], cells[i + 1]]);
      }
    }
  }
  prev = cells.slice();
  const p = state.player;
  rows.push({ f, x: p.x, y: p.y, air: p.air, hp: p.hp, hpMax: p.hpMax,
              ammo: state.flow.ammo, cling: p.clingLock, chg });
  if (f === 1 && warp !== null) {
    const [c, r] = warp.split(',').map((v) => parseInt(v, 10));
    p.x = ((c & 0xFF) << 8) | 0x80;
    if (!Number.isNaN(r)) p.y = (r & 0xFF) << 8;
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ level, script, warp, frames: rows }));
console.log(`level ${level}, ${frames} frames -> ${out}`);
