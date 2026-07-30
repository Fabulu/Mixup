// GENERATED from tools/render-frame.mjs by the enemy hunter: identical except
// for a --difficulty flag ($C756) and no PNG output.
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
import { ROOT, imp, installFetchShim } from './_env.mjs';

// --- make the browser-shaped asset loader work on the filesystem -----------
installFetchShim();

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const R = await imp('src/render/renderer.js');
const { resolveLoadout, runHook } = await imp('src/mods.js');

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
// --mods moon-gravity+super-jump  applies a mod loadout, same as the launcher.
const modIds = (arg('mods', '') || '').split('+').filter(Boolean);
const loadout = resolveLoadout(modIds);
const state = createState(makeTunables(loadout.tunables));
state.loadout = loadout;
state.video.invert = loadout.render.invert;
state.video.spriteScale = loadout.render.spriteScale || 1;
state.video.batarangAnim = loadout.render.batarangAnim || null;
state.hitboxScale = loadout.render.hitboxScale || 1;
if (modIds.length) console.log(`mods: ${modIds.join(', ')}`);

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
// HUNTER: $C756 must be set before level init, because $0D73/$0E01 read it there.
const diffArg = arg('difficulty', null);
if (diffArg !== null) state.flow.difficulty = parseInt(diffArg, 10) & 0xFF;
await initLevel(state, level);
if (diffArg !== null) state.flow.difficulty = parseInt(diffArg, 10) & 0xFF;

// Mirrors trace.py --ammo: inject ammo so the batarang throw path can be
// exercised without walking to a pickup.
const ammo = arg('ammo', null);
if (ammo !== null) state.flow.ammo = parseInt(ammo, 10) & 0xFF;

// Mirrors trace.py --warp: drop the player at a metatile column (and optional
// row), because late-level content is unreachable from a scripted input alone.
// Applied AFTER frame 1, because trace.py cannot write it any earlier -- the
// oracle's first sample is taken during boot. Both harnesses therefore see an
// identical un-warped frame 1 and an identical warped frame 2 onward.
const warp = arg('warp', null);
function applyWarp() {
  if (warp === null) return;
  const [c, r] = warp.split(',').map((v) => parseInt(v, 10));
  state.player.x = ((c & 0xFF) << 8) | 0x80;
  if (!Number.isNaN(r)) state.player.y = (r & 0xFF) << 8;
}

const fb = R.createFramebuffer();

const trace = [];
const snapshots = new Set([1, 2, 5, 10, 30, 60, 90, frames]);

for (let f = 1; f <= frames; f++) {
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  // Drive input directly; input.js reads the DOM, which does not exist here.
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;

  runHook(loadout, 'onInput', state);
  tick(state, manifest, playerTiles);
  runHook(loadout, 'onRenderFrame', state);

  const p = state.player;
  trace.push({
    f, x: p.x, y: p.y, vx: p.vx, vy: p.vy, air: p.air,
    facing: p.facing, anim: p.anim, animFrame: p.animFrame,
    camX: state.camera.x, camY: state.camera.y,
    throttle: p.airThrottle, halfW: p.halfW, halfH: p.halfH,
    turn: p.turnTimer, cling: p.clingLock, action: p.action,
    // loc_00_1B4A's scratch, mirrored from trace.py so the anim work is
    // diffable: $FF90 squat, $FF89 walk timer, $FF91 last VelX, $FF92 crouch.
    squat: p.squatTimer, animTimer: p.animTimer,
    prevVx: ((p.prevVx ?? 0) << 24) >> 24, crouch: p.crouching ?? 0,
    msIndex: p.msIndex,
    atkTimer: p.attackTimer, atkPose: p.attackPose, ammo: state.flow.ammo,
    bat0: state.batarangs[0].active ? state.batarangs[0].flags : 0,
    bat0x: state.batarangs[0].active ? state.batarangs[0].x : 0,
    bat0y: state.batarangs[0].active ? state.batarangs[0].y : 0,
    // The ROM keeps both as raw bytes; the port lets them go signed, so
    // normalise here rather than comparing two different encodings.
    bat0spd: state.batarangs[0].active ? (state.batarangs[0].speed & 0xFF) : 0,
    bat0arc: state.batarangs[0].active ? ((state.batarangs[0].arc << 24) >> 24) : 0,
    bat1: state.batarangs[1].active ? state.batarangs[1].flags : 0,
    bat2: state.batarangs[2].active ? state.batarangs[2].flags : 0,
    carryY: state.carry.y,
    ropeSeg: p.ropeSegments, ropePh: p.ropeLength,
    ropeFlip: state.rope.flip, ropeDly: state.rope.delay,
    rope0x: state.rope.slots[0].x, rope0y: state.rope.slots[0].y,
    rope5x: state.rope.slots[5].x, rope5y: state.rope.slots[5].y,
    bk0t: state.breakables[0].timer, bk0c: state.breakables[0].col,
    bk0r: state.breakables[0].row,
    bk1t: state.breakables[1].timer, bk2t: state.breakables[2].timer,
    ob0t: state.actors[0][0], ob0y: state.actors[0][3],
    ob0st: state.actors[0][0x0B], ob0w: state.actors[0][0x0C],
    ob1t: state.actors[1][0], ob1st: state.actors[1][0x0B],
    ob1w: state.actors[1][0x0C],
    en0f: state.enemies[0][0], en0s: state.enemies[0][2],
    en0x: (state.enemies[0][0x0E] << 8) | state.enemies[0][0x0F],
    en0hp: state.enemies[0][0x16],
    // Slot 0 in depth, for the boss scenarios (same layout as slot 3).
    en0f1: state.enemies[0][1], en0d: state.enemies[0][5],
    en0ms: state.enemies[0][6],
    en0sx: state.enemies[0][7], en0sy: state.enemies[0][8],
    en0y: (state.enemies[0][0x10] << 8) | state.enemies[0][0x11],
    en0vx: state.enemies[0][0x12], en0vy: state.enemies[0][0x13],
    en0at: state.enemies[0][0x14],
    bossRage: state.flow.bossRage, bossCrit: state.flow.bossCrit,
    bossHop: state.flow.bossHop,
    en1f: state.enemies[1][0], en2f: state.enemies[2][0],
    // Slots 1/2 in depth: the boss-2 parts, and the second/third records on
    // ordinary levels.
    en1f1: state.enemies[1][1], en1s: state.enemies[1][2],
    en1d: state.enemies[1][5], en1ms: state.enemies[1][6],
    en1x: (state.enemies[1][0x0E] << 8) | state.enemies[1][0x0F],
    en1y: (state.enemies[1][0x10] << 8) | state.enemies[1][0x11],
    en1vx: state.enemies[1][0x12], en1vy: state.enemies[1][0x13],
    en1at: state.enemies[1][0x14], en1hp: state.enemies[1][0x16],
    en2s: state.enemies[2][2],
    en2x: (state.enemies[2][0x0E] << 8) | state.enemies[2][0x0F],
    en2y: (state.enemies[2][0x10] << 8) | state.enemies[2][0x11],
    en2hp: state.enemies[2][0x16],
    // Slot 4: the level-12 col-73 shooter, the state-6 record clear of every
    // unported subsystem (see trace.py).
    en4f: state.enemies[4][0], en4f1: state.enemies[4][1],
    en4s: state.enemies[4][2], en4d: state.enemies[4][5],
    en4ms: state.enemies[4][6],
    en4x: (state.enemies[4][0x0E] << 8) | state.enemies[4][0x0F],
    en4y: (state.enemies[4][0x10] << 8) | state.enemies[4][0x11],
    en4vx: state.enemies[4][0x12], en4vy: state.enemies[4][0x13],
    en4at: state.enemies[4][0x14], en4hp: state.enemies[4][0x16],
    // Slot 5: the level-12 col-92 shooter -- carries the projectile coverage.
    en5f: state.enemies[5][0], en5f1: state.enemies[5][1],
    en5s: state.enemies[5][2], en5d: state.enemies[5][5],
    en5ms: state.enemies[5][6],
    en5x: (state.enemies[5][0x0E] << 8) | state.enemies[5][0x0F],
    en5y: (state.enemies[5][0x10] << 8) | state.enemies[5][0x11],
    en5vx: state.enemies[5][0x12], en5vy: state.enemies[5][0x13],
    en5at: state.enemies[5][0x14], en5hp: state.enemies[5][0x16],
    en3f: state.enemies[3][0], en3f1: state.enemies[3][1],
    en3s: state.enemies[3][2], en3d: state.enemies[3][5],
    en3x: (state.enemies[3][0x0E] << 8) | state.enemies[3][0x0F],
    en3y: (state.enemies[3][0x10] << 8) | state.enemies[3][0x11],
    en3vx: state.enemies[3][0x12], en3vy: state.enemies[3][0x13],
    en3at: state.enemies[3][0x14], en3hp: state.enemies[3][0x16], en3ms: state.enemies[3][6],
    // Slots 6/7: the levels-1/2 respawning sewer enemies (water.js,
    // loc_00_2D3D); the projectile slots everywhere else.
    en6f: state.enemies[6][0], en6s: state.enemies[6][2],
    en6d: state.enemies[6][5], en6ms: state.enemies[6][6],
    en6x: (state.enemies[6][0x0E] << 8) | state.enemies[6][0x0F],
    en6y: (state.enemies[6][0x10] << 8) | state.enemies[6][0x11],
    en6at: state.enemies[6][0x14], en6hp: state.enemies[6][0x16],
    en7f: state.enemies[7][0], en7s: state.enemies[7][2],
    en7ms: state.enemies[7][0x06], en7at: state.enemies[7][0x14],
    en7x: (state.enemies[7][0x0E] << 8) | state.enemies[7][0x0F],
    en7y: (state.enemies[7][0x10] << 8) | state.enemies[7][0x11],
    en7hp: state.enemies[7][0x16],
    // The player's iframes are deliberately NOT traced: the ROM decrements
    // $C714 at the head of the player update while the port decrements at
    // tick end, so the sampled value sits one lower here for the same
    // behaviour. Compare `hp` and the knockback launch instead.
    hp: p.hp, slow: p.slowMode,
    watLv: state.water.level, watPh: state.water.phase,
    watSt: state.water.stampStep, watWy: state.water.windowY,
  });
  if (f === 1) applyWarp();

  if (false && snapshots.has(f)) {
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
