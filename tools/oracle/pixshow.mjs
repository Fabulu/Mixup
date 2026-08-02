// Side-by-side ASCII of one recorded frame vs the port's, plus the registers.
// Usage: node tools/oracle/pixshow.mjs --scen l9-sky --frame 40 [--rows 0,40,80]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

installFetchShim();
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const R = await imp('src/render/renderer.js');
const RAS = await imp('src/raster.js');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const scen = arg('scen', 'l9-sky');
const frame = parseInt(arg('frame', '40'), 10);
const level = parseInt(arg('level', scen.match(/^l(\d+)/)[1]), 10);
const script = arg('script', '20:,180:R');
const rowsSel = (arg('rows', '0,20,40,60,80,100,120,140')).split(',').map(Number);

const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'rip/oracle/pix', `${scen}.json`), 'utf8'));
const m = ref.frames[String(frame + 1)];
console.log('rom regs', JSON.stringify(m.regs));

const BTN = { A: 1, B: 2, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const timeline = [];
for (const seg of script.split(',')) {
  const [n, keys = ''] = seg.split(':');
  let k = 0; for (const c of keys.trim()) k |= BTN[c.toUpperCase()] || 0;
  for (let i = 0; i < parseInt(n, 10); i++) timeline.push(k);
}
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const state = createState(makeTunables());
await initLevel(state, level);
const fb = R.createFramebuffer();
const warp = arg('warp', ref.warp || null);
for (let f = 1; f <= frame; f++) {
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held; state.input.prev = held;
  tick(state, manifest, playerTiles);
  if (f === 1 && warp) {
    const [c, r] = String(warp).split(',').map((v) => parseInt(v, 10));
    state.player.x = ((c & 0xFF) << 8) | 0x80;
    if (!Number.isNaN(r)) state.player.y = (r & 0xFF) << 8;
  }
}
R.renderFrame(state, fb);
const bands = R.rasterBands(state);
console.log('port frame', state.frame, 'cam', state.camera.x, state.camera.y,
            'raster', JSON.stringify(state.raster),
            'bands', bands.map((b) => `${b.from}:scx=${b.scx},scy=${b.scy}`).join(' | '));

const ch = '.-+#';
for (const y of rowsSel) {
  let a = '', b = '';
  for (let x = 0; x < 160; x++) { a += ch[m.screen[y * 160 + x]]; b += ch[fb.shades[y * 160 + x]]; }
  console.log(`row ${String(y).padStart(3)} rom  ${a}`);
  console.log(`row ${String(y).padStart(3)} port ${b}`);
}
