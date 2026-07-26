// Headless harness: runs the REAL port modules for N frames with scripted
// input and writes PNGs, so rendering and physics can be verified without a
// browser.  This is also the seed of the regression corpus.
//
// Usage:
//   node tools/render-frame.mjs                       120 frames, walk right
//   node tools/render-frame.mjs --frames 300 --script "60:R,30:RA,60:R"
//   node tools/render-frame.mjs --level 3 --out rip/port
//
// Script syntax: comma-separated `frames:BUTTONS`, buttons from R L U D A B.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// --- make the browser-shaped asset loader work on the filesystem -----------
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const buf = fs.readFileSync(file);
  return {
    ok: true,
    status: 200,
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
const R = await imp('src/render/renderer.js');

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };

// --- args ------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const frames = parseInt(arg('frames', '120'), 10);
const level = parseInt(arg('level', '1'), 10);
const outDir = path.join(ROOT, arg('out', 'rip/port'));
const script = arg('script', `${frames}:R`);

// Expand "60:R,30:RA" into a per-frame button array.
const timeline = [];
for (const seg of script.split(',')) {
  const [n, keys = ''] = seg.split(':');
  let mask = 0;
  for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
  for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
}

const SCALE = parseInt(arg('scale', '1'), 10);

// --- minimal PNG writer (stdlib only) --------------------------------------
function writePNG(file, w0, h0, rgba0) {
  // Nearest-neighbour upscale, purely so frames are inspectable by eye.
  const s = SCALE;
  const w = w0 * s, h = h0 * s;
  const rgba = s === 1 ? rgba0 : (() => {
    const o = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const sy = (y / s) | 0;
      for (let x = 0; x < w; x++) {
        const si = (sy * w0 + ((x / s) | 0)) * 4, di = (y * w + x) * 4;
        o[di] = rgba0[si]; o[di + 1] = rgba0[si + 1];
        o[di + 2] = rgba0[si + 2]; o[di + 3] = 255;
      }
    }
    return o;
  })();

  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const chunk = (tag, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;                      // 8-bit RGBA
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// --- run -------------------------------------------------------------------
const state = createState(makeTunables());
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
await initLevel(state, level);

// Mirrors trace.py --ammo: inject ammo so the batarang throw path can be
// exercised without walking to a pickup.
const ammo = arg('ammo', null);
if (ammo !== null) state.flow.ammo = parseInt(ammo, 10) & 0xFF;

const fb = R.createFramebuffer();

const trace = [];
const snapshots = new Set([1, 2, 5, 10, 30, 60, 90, frames]);

for (let f = 1; f <= frames; f++) {
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  // Drive input directly; input.js reads the DOM, which does not exist here.
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;

  tick(state, manifest, playerTiles);

  const p = state.player;
  trace.push({
    f, x: p.x, y: p.y, vx: p.vx, vy: p.vy, air: p.air,
    facing: p.facing, anim: p.anim, camX: state.camera.x, camY: state.camera.y,
    throttle: p.airThrottle, halfW: p.halfW, halfH: p.halfH,
    turn: p.turnTimer, cling: p.clingLock, action: p.action,
    atkTimer: p.attackTimer, atkPose: p.attackPose, ammo: state.flow.ammo,
    bat0: state.batarangs[0].active ? state.batarangs[0].flags : 0,
    bat0x: state.batarangs[0].active ? state.batarangs[0].x : 0,
    bat0spd: state.batarangs[0].active ? state.batarangs[0].speed : 0,
    bat1: state.batarangs[1].active ? state.batarangs[1].flags : 0,
    bat2: state.batarangs[2].active ? state.batarangs[2].flags : 0,
    bk0t: state.breakables[0].timer, bk0c: state.breakables[0].col,
    bk0r: state.breakables[0].row,
    bk1t: state.breakables[1].timer, bk2t: state.breakables[2].timer,
    en0f: state.enemies[0][0], en0s: state.enemies[0][2],
    en0x: (state.enemies[0][0x0E] << 8) | state.enemies[0][0x0F],
    en0hp: state.enemies[0][0x16],
    en1f: state.enemies[1][0], en2f: state.enemies[2][0],
  });

  if (snapshots.has(f)) {
    R.renderFrame(state, fb);
    writePNG(path.join(outDir, `L${String(level).padStart(2, '0')}_f${String(f).padStart(4, '0')}.png`),
             R.SCREEN_W, R.SCREEN_H, fb.rgba);
  }
}

fs.writeFileSync(path.join(outDir, 'trace.json'), JSON.stringify(trace, null, 1));

const px = (v) => (v >> 4);
console.log(`level ${level}, ${frames} frames, script "${script}"`);
console.log('  frame     x(px)   y(px)   vx   vy  air  anim   camX(px)');
for (const t of trace.filter((t) => snapshots.has(t.f))) {
  console.log(`  ${String(t.f).padStart(5)}  ${String(px(t.x)).padStart(8)}` +
    `${String(px(t.y) - 256).padStart(8)}${String(t.vx).padStart(5)}` +
    `${String(t.vy).padStart(5)}${String(t.air).padStart(5)}` +
    `${String(t.anim).padStart(6)}   ${String(px(t.camX)).padStart(8)}`);
}
console.log(`\nwrote ${outDir}`);
