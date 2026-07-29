// Port-side twin of tools/oracle/rastertrace.py: runs the REAL port modules for
// N frames with scripted input and dumps rasterBands() -- expanded to one row
// per scanline, in HARDWARE register units, so it can be diffed line for line
// against the cartridge's own register stream.
//
// Setup mirrors objport.mjs / render-frame.mjs exactly (same asset shim, same
// warp-after-frame-1 rule) so the harnesses stay comparable.
//
// Unit conversion, and it is the only liberty taken here.  The renderer's band
// carries WORLD pixels: `scx` is camera.x >> 4 unmasked and `scy` is
// (camera.y >> 4) - $100, because drawBackground samples the level map rather
// than a 32x32 VRAM tilemap.  The cartridge's rSCX/rSCY are the low 8 bits of
// exactly those quantities ($131C: SRL B / RRA x4, store A).  So masking to 8
// bits is not an approximation, it IS the register.
//
// Usage: node tools/oracle/rasterport.mjs --level 9 --frames 200

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
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { resolveLoadout } = await imp('src/mods.js');
const { rasterBands, SCREEN_H } = await imp('src/render/renderer.js');

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const frames = parseInt(arg('frames', '200'), 10);
const level = parseInt(arg('level', '9'), 10);
const outDir = path.join(ROOT, arg('out', 'rip/port'));
const script = arg('script', `${frames}:`);

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

const warp = arg('warp', null);
function applyWarp() {
  if (warp === null) return;
  const [c, r] = warp.split(',').map((v) => parseInt(v, 10));
  state.player.x = ((c & 0xFF) << 8) | 0x80;
  if (!Number.isNaN(r)) state.player.y = (r & 0xFF) << 8;
}

const trace = [];
for (let f = 1; f <= frames; f++) {
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  tick(state, manifest, playerTiles);

  // rasterBands runs AFTER tick, exactly where main.js:220 calls renderFrame --
  // which matters: $FFB1 is incremented at the end of tick ($0805 does it in
  // the VBlank ISR, i.e. after the iteration), and the STAT arms read the
  // POST-increment value.
  const bands = rasterBands(state);
  const lines = [];
  let b = bands[0];
  let bi = 0;
  for (let y = 0; y < SCREEN_H; y++) {
    while (bi + 1 < bands.length && bands[bi + 1].from <= y) b = bands[++bi];
    lines.push([b.scx & 0xFF, b.scy & 0xFF, b.bgp & 0xFF,
                b.obp0 & 0xFF, b.obp1 & 0xFF]);
  }
  trace.push({
    f, lines, nbands: bands.length,
    mode: state.raster.mode,
    ffb1: state.frame,
    c742: state.raster.far, c743: state.raster.mid,
    c755: state.water ? state.water.windowY : 0,
    ffcc: state.flow.parallaxScx ?? 0,
    camX: state.camera.x, camY: state.camera.y,
    wy: state.video.windowY, wx: state.video.windowX,
  });
  if (f === 1) applyWarp();
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'raster.json'),
                 JSON.stringify({ level, script, frames: trace }));
console.log(`level ${level}, ${frames} frames, script "${script}" -> ` +
            path.join(outDir, 'raster.json'));
