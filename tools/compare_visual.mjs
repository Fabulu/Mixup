// Pixel-accuracy measurement: OUR renderer vs the REAL game's screen.
//
// Pipeline:
//   tools/compare_screen.py  -- PyBoy runs the ROM, dumps the real 160x144
//                               shade buffer + shadow OAM + LCD registers
//   this file                -- renders the same scenario through src/render/*
//                               and diffs, then ATTRIBUTES each mismatched
//                               pixel to a specific unimplemented feature.
//
// Attribution is bucketed in priority order so no pixel is counted twice:
//   1 unmodelled OBJ   pixels inside a real OAM rect whose tile is outside the
//                      player's OBJ range $00-$0B (HUD energy bar, enemies,
//                      per-level overlay sprite) -- we draw none of those
//   2 window layer     rows >= WY while the window is enabled (level 1's water
//                      body lives in the $9C00 window map)
//   3 player sprite    pixels inside a player OAM rect (real or ours)
//   4 per-scanline SCX rows OUTSIDE the window whose remaining background error
//                      is removed by a single horizontal shift -- raster splits
//                      and camera/scroll rounding. Note this cannot see splits
//                      that happen underneath the window, because bucket 2 has
//                      already claimed those rows.
//   5 residual BG      everything else: BG tile animation, tilemap streaming,
//                      metatile sampling
//
// The ROM renders iteration N's shadow OAM during the FOLLOWING frame, so the
// real capture is read at a fixed render lag (see LAG_OF). Each frame's own
// best lag is reported alongside as a diagnostic upper bound only.
//
// Usage:
//   node tools/compare_visual.mjs                 all level-1 scenarios
//   node tools/compare_visual.mjs --only fall-and-walk
//   node tools/compare_visual.mjs --no-emu        reuse rip/real/* dumps
//   node tools/compare_visual.mjs --diff          write side-by-side sheets
//   node tools/compare_visual.mjs --min 95        exit non-zero below 95% match

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, SCENARIOS, SCREEN_W, SCREEN_H, DMG_PALETTE,
  renderScenario, readIndexedPNG, writeRGBAPNG,
} from './golden.mjs';

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const only = arg('only', null);
const noEmu = has('no-emu');
const wantDiff = has('diff');
const scale = parseInt(arg('scale', '2'), 10);
const REAL_DIR = path.join(ROOT, 'rip/real');
const OUT_DIR = path.join(ROOT, 'rip/visual');
const TOTAL = SCREEN_W * SCREEN_H;
const PLAYER_TILE_MAX = 0x0B;        // master reference 7.4: OBJ $00-$0B
const MAX_SHIFT = 20;
// The ROM DMAs shadow OAM at VBlank, so iteration N's draw calls only reach
// the panel during the FOLLOWING emulator frame -- render lag +1. The one
// exception is frame 1: boot_to_gameplay returns mid-way through the first
// gameplay iteration, so the tick that completes iteration 1 was already being
// scanned out when iteration 1 ran, pushing frame 1's picture to +2.
// This is a structural rule, applied uniformly; it is NOT a per-frame search.
const LAGS = [-1, 0, 1, 2];                    // must match compare_screen.py
const LAG_OF = (f) => (f === 1 ? 2 : 1);

// compare_screen.py can only reach level 1 (it taps START through the menus and
// does not drive the round-select), so only level-1 scenarios are measurable.
const list = SCENARIOS.filter((s) => s.level === 1 && (!only || s.name === only));
if (!list.length) { console.error('no level-1 scenario matches --only'); process.exit(2); }

// --- helpers ---------------------------------------------------------------
const rects = (oam, pred) => oam
  .map((e, i) => ({ i, y: e[0], x: e[1], tile: e[2], attr: e[3] }))
  .filter((e) => e.y !== 0 && e.y < 160 && pred(e))
  .map((e) => ({ x0: e.x - 8, y0: e.y - 16, x1: e.x, y1: e.y }));   // 8x16 OBJ

function markRects(mask, rs, bit) {
  for (const r of rs) {
    for (let y = Math.max(0, r.y0); y < Math.min(SCREEN_H, r.y1); y++) {
      for (let x = Math.max(0, r.x0); x < Math.min(SCREEN_W, r.x1); x++) {
        if (!mask[y * SCREEN_W + x]) mask[y * SCREEN_W + x] = bit;
      }
    }
  }
}

/** mismatch count between two shade buffers over a predicate */
function countDiff(a, b, keep) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (keep(i) && a[i] !== b[i]) n++;
  return n;
}

// --- one frame -------------------------------------------------------------
function analyseFrame(real, ours, oursNoSpr, meta, ourSprites) {
  const oam = meta.oam;
  // rWY sampled at the tick boundary is unreliable: the STAT program parks the
  // window off-screen ($90) at frame end and the VBlank handler reloads it from
  // the water-surface line $C755 (master reference 2). $C755 is the stable
  // source on the water levels (raster mode 6), so take the lower of the two.
  const wy = (meta.regs.rasterMode === 6 && meta.regs.waterLine < SCREEN_H)
    ? Math.min(meta.regs.WY, meta.regs.waterLine) : meta.regs.WY;
  const windowOn = (meta.regs.LCDC & 0x20) !== 0 && meta.regs.WX <= 166;

  // Bucket ownership map. 0 = plain background.
  const own = new Uint8Array(TOTAL);
  markRects(own, rects(oam, (e) => e.tile > PLAYER_TILE_MAX), 1);   // unmodelled OBJ
  if (windowOn && wy < SCREEN_H) {
    for (let y = Math.max(0, wy); y < SCREEN_H; y++) {
      for (let x = 0; x < SCREEN_W; x++) if (!own[y * SCREEN_W + x]) own[y * SCREEN_W + x] = 2;
    }
  }
  markRects(own, rects(oam, (e) => e.tile <= PLAYER_TILE_MAX), 3);  // real player
  markRects(own, ourSprites.map((s) => ({                           // our player
    x0: s.x, y0: s.y, x1: s.x + 8, y1: s.y + 16,
  })), 3);

  const b = { unmodelledObj: 0, window: 0, player: 0, scanlineScx: 0, residualBg: 0 };
  let total = 0;
  for (let i = 0; i < TOTAL; i++) {
    if (real[i] === ours[i]) continue;
    total++;
    if (own[i] === 1) b.unmodelledObj++;
    else if (own[i] === 2) b.window++;
    else if (own[i] === 3) b.player++;
  }

  // Background rows: how much of the leftover error is a pure horizontal shift?
  // Measured against the SPRITE-FREE render so a sprite cannot pay for a scroll
  // error or vice versa.
  let bgBase = 0, bgBest = 0, bgPixels = 0;
  const shifts = [];
  for (let y = 0; y < SCREEN_H; y++) {
    const cols = [];
    for (let x = 0; x < SCREEN_W; x++) if (own[y * SCREEN_W + x] === 0) cols.push(x);
    if (!cols.length) { shifts.push(0); continue; }
    bgPixels += cols.length;
    const mism = (dx) => {
      let n = 0;
      for (const x of cols) {
        const sx = x - dx;
        if (sx < 0 || sx >= SCREEN_W) { n++; continue; }
        if (real[y * SCREEN_W + x] !== oursNoSpr[y * SCREEN_W + sx]) n++;
      }
      return n;
    };
    const base = mism(0);
    let best = base, bestDx = 0;
    for (let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx++) {
      if (dx === 0) continue;
      const m = mism(dx);
      if (m < best) { best = m; bestDx = dx; }
    }
    bgBase += base; bgBest += best;
    shifts.push(bestDx);
  }
  b.scanlineScx = bgBase - bgBest;
  b.residualBg = bgBest;
  // `total` counts the sprite-inclusive diff; the BG buckets come from the
  // sprite-free render, so re-derive the total from the buckets to keep the
  // percentages internally consistent.
  const bucketTotal = b.unmodelledObj + b.window + b.player + b.scanlineScx + b.residualBg;

  // Diagnostic: would the player box match better if our metasprite were drawn
  // horizontally mirrored? Only the sprite pixels are mirrored -- mirroring the
  // background showing through would manufacture a difference of its own.
  let mirrorPlain = 0, mirrorFlipped = 0;
  if (ourSprites.length) {
    const xs = ourSprites.map((s) => s.x), ys = ourSprites.map((s) => s.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 8;
    const y0 = Math.min(...ys), y1 = Math.max(...ys) + 16;
    for (let y = Math.max(0, y0); y < Math.min(SCREEN_H, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(SCREEN_W, x1); x++) {
        const i = y * SCREEN_W + x, mx = x0 + (x1 - 1 - x), mi = y * SCREEN_W + mx;
        if (real[i] !== ours[i]) mirrorPlain++;
        const onSprite = mx >= 0 && mx < SCREEN_W && ours[mi] !== oursNoSpr[mi];
        if (real[i] !== (onSprite ? ours[mi] : oursNoSpr[i])) mirrorFlipped++;
      }
    }
  }

  const bgOnlyMatch = bgPixels ? (bgPixels - bgBase) / bgPixels : 1;
  return { buckets: b, rawDiff: total, bucketTotal, bgPixels, bgOnlyMatch, shifts,
           mirrorPlain, mirrorFlipped };
}

function sheet(real, ours, s) {
  const pw = SCREEN_W, ph = SCREEN_H, SEP = 4;
  const w0 = pw * 3 + SEP * 2;
  const src = new Uint8ClampedArray(w0 * ph * 4);
  const put = (x, y, r, g, bl) => {
    const o = (y * w0 + x) * 4;
    src[o] = r; src[o + 1] = g; src[o + 2] = bl; src[o + 3] = 255;
  };
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = y * pw + x;
      const a = DMG_PALETTE[real[i]], c = DMG_PALETTE[ours[i]];
      put(x, y, a[0], a[1], a[2]);
      put(pw + SEP + x, y, c[0], c[1], c[2]);
      if (real[i] === ours[i]) { const v = 200 - ours[i] * 30; put(pw * 2 + SEP * 2 + x, y, v, v, v); }
      else put(pw * 2 + SEP * 2 + x, y, 255, 0, 220);
    }
    for (let k = 0; k < SEP; k++) { put(pw + k, y, 60, 60, 60); put(pw * 2 + SEP + k, y, 60, 60, 60); }
  }
  if (s === 1) return { w: w0, h: ph, rgba: src };
  const w = w0 * s, h = ph * s;
  const dst = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = (y / s) | 0;
    for (let x = 0; x < w; x++) {
      const si = (sy * w0 + ((x / s) | 0)) * 4, di = (y * w + x) * 4;
      dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = 255;
    }
  }
  return { w, h, rgba: dst };
}

// --- run -------------------------------------------------------------------
const grand = { unmodelledObj: 0, window: 0, player: 0, scanlineScx: 0, residualBg: 0 };
let grandTotal = 0, grandFrames = 0, grandMatch = 0, grandBgPx = 0, grandBgOk = 0, grandBest = 0;
let mirrPlain = 0, mirrFlip = 0, mirrExact = 0, mirrFrames = 0;
const rows = [];

for (const sc of list) {
  const dir = path.join(REAL_DIR, sc.name);
  if (!noEmu) {
    process.stderr.write(`emulating ${sc.name} ... `);
    execFileSync('python', ['tools/compare_screen.py',
      '--frames', String(sc.frames), '--script', sc.script,
      '--capture', sc.capture.join(','), '--out', path.relative(ROOT, dir)],
      { cwd: ROOT, stdio: 'pipe' });
    process.stderr.write('done\n');
  }
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    console.error(`missing ${metaPath} - run without --no-emu first`);
    process.exit(2);
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const realShades = new Map();
  for (const i of meta.stored) {
    const f = path.join(dir, `i${String(i).padStart(4, '0')}.png`);
    if (fs.existsSync(f)) realShades.set(i, readIndexedPNG(f).indices);
  }

  const ours = await renderScenario(sc);
  const oursBg = await renderScenario(sc, { noSprites: true });

  // Fixed lag model (see LAG_OF): no per-frame search, so a bad frame cannot
  // hide behind a convenient offset. The per-frame best lag is still computed
  // below, purely as a diagnostic upper bound.

  const per = [];
  const acc = { unmodelledObj: 0, window: 0, player: 0, scanlineScx: 0, residualBg: 0 };
  let scMatch = 0, scFrames = 0, scBgPx = 0, scBgOk = 0, scBest = 0;
  for (const f of sc.capture) {
    const lag = LAG_OF(f);
    const real = realShades.get(f + lag);
    const m = meta.frames[String(f + lag)];
    if (!real || !m) continue;
    const o = ours.get(f), ob = oursBg.get(f);
    const a = analyseFrame(real, o.shades, ob.shades, m, o.sprites);
    for (const k of Object.keys(acc)) acc[k] += a.buckets[k];
    const match = (TOTAL - a.rawDiff) / TOTAL;
    scMatch += match; scFrames++;
    scBgPx += a.bgPixels; scBgOk += a.bgPixels * a.bgOnlyMatch;
    // Diagnostic: the best offset for THIS frame alone, so an alignment
    // artifact on a single frame is visible instead of silently averaged in.
    let fbOff = lag, fbMatch = match;
    for (const off of LAGS) {
      const r = realShades.get(f + off);
      if (!r) continue;
      const m2 = (TOTAL - countDiff(r, o.shades, () => true)) / TOTAL;
      if (m2 > fbMatch) { fbMatch = m2; fbOff = off; }
    }
    if (o.sprites.length) {
      mirrPlain += a.mirrorPlain; mirrFlip += a.mirrorFlipped; mirrFrames++;
      if (a.mirrorFlipped === 0) mirrExact++;
    }
    scBest += fbMatch;
    per.push({ f, match, bg: a.bgOnlyMatch, diff: a.rawDiff, b: a.buckets, fbOff, fbMatch });
    if (wantDiff) {
      const sh = sheet(real, o.shades, scale);
      writeRGBAPNG(path.join(OUT_DIR, `${sc.name}_f${String(f).padStart(4, '0')}.png`),
                   sh.w, sh.h, sh.rgba);
    }
  }
  for (const k of Object.keys(acc)) grand[k] += acc[k];
  const scDiff = per.reduce((s, p) => s + p.diff, 0);
  grandTotal += scDiff; grandFrames += scFrames; grandMatch += scMatch;
  grandBgPx += scBgPx; grandBgOk += scBgOk; grandBest += scBest;
  rows.push({ sc, off: '+1 (f1:+2)', per, acc, match: scFrames ? scMatch / scFrames : 0,
              best: scFrames ? scBest / scFrames : 0,
              bgMatch: scBgPx ? scBgOk / scBgPx : 0 });
}

// --- report ----------------------------------------------------------------
const pc = (v) => (v * 100).toFixed(2).padStart(6) + '%';
console.log('\n=== our renderer vs the real ROM screen (level 1) ===\n');
console.log('scenario'.padEnd(19) + 'frames        lag   whole-frame   per-frame-lag   background-only');
for (const r of rows) {
  console.log(r.sc.name.padEnd(19) + String(r.per.length).padStart(6) +
              String(r.off).padStart(11) + '   ' + pc(r.match) + '        ' +
              pc(r.best) + '        ' + pc(r.bgMatch));
}
console.log('\n  whole-frame   = fixed lag model (+1, frame 1 at +2) -- the headline number');
console.log('  per-frame-lag = each frame allowed its own lag; upper bound, hides timing skew');
console.log('  background-only = BG layer alone vs the real screen, sprite and window');
console.log('                    areas excluded');
console.log('\nper frame:');
for (const r of rows) {
  console.log('  ' + r.sc.name);
  for (const p of r.per) {
    console.log(`    f${String(p.f).padStart(4, '0')}  match ${pc(p.match)}  ` +
      `(${String(p.diff).padStart(5)} px)  bg-only ${pc(p.bg)}  ` +
      `obj ${String(p.b.unmodelledObj).padStart(4)}  win ${String(p.b.window).padStart(4)}  ` +
      `ply ${String(p.b.player).padStart(4)}  scx ${String(p.b.scanlineScx).padStart(4)}  ` +
      `bg' ${String(p.b.residualBg).padStart(4)}` +
      (p.fbOff !== LAG_OF(p.f) ? `   [best lag ${p.fbOff}: ${pc(p.fbMatch)}]` : ''));
  }
}

const names = {
  unmodelledObj: 'unmodelled OBJ (HUD energy bar $0F7B, enemies, overlay sprite)',
  window: 'window layer (level-1 water body, $9C00 map, from the water line down)',
  scanlineScx: 'per-scanline SCX above the window (raster splits / scroll rounding)',
  player: 'player metasprite (mirrored draw / tile-stream phase / flicker)',
  residualBg: 'residual BG (tile animation, tilemap streaming, sampling)',
};
const sum = Object.values(grand).reduce((a, b) => a + b, 0);
console.log('\n=== ranked causes of the pixel delta (all level-1 golden frames) ===\n');
console.log('rank  px of delta   share   avg px/frame  cause');
Object.entries(grand).sort((a, b) => b[1] - a[1]).forEach(([k, v], i) => {
  console.log(`  ${i + 1}   ${String(v).padStart(9)}   ` +
    `${(sum ? v / sum * 100 : 0).toFixed(1).padStart(5)}%   ` +
    `${(v / Math.max(1, grandFrames)).toFixed(0).padStart(9)}     ${names[k]}`);
});
console.log('\nplayer-metasprite diagnostic (box around our 6 player sprites):');
console.log(`  as drawn        ${String(mirrPlain).padStart(6)} px differ over ` +
  `${mirrFrames} frames (${(mirrPlain / Math.max(1, mirrFrames)).toFixed(0)}/frame)`);
console.log(`  drawn mirrored  ${String(mirrFlip).padStart(6)} px differ ` +
  `(${(mirrFlip / Math.max(1, mirrFrames)).toFixed(0)}/frame); ` +
  `${mirrExact}/${mirrFrames} frames become pixel-exact`);

console.log(`\nframes compared: ${grandFrames}`);
console.log(`mean whole-frame pixel match:      ${pc(grandMatch / Math.max(1, grandFrames))}`);
console.log(`mean at each frame's own best lag: ${pc(grandBest / Math.max(1, grandFrames))}`);
console.log(`mean background-only match:        ${pc(grandBgOk / Math.max(1, grandBgPx))}`);
if (wantDiff) console.log(`\nside-by-side sheets in ${path.relative(ROOT, OUT_DIR)}`);

// Optional gate, so this can guard a floor in CI without pretending the
// remaining delta is noise.
const min = arg('min', null);
if (min !== null) {
  const got = grandMatch / Math.max(1, grandFrames) * 100;
  const want = parseFloat(min);
  console.log(got >= want
    ? `\nPASS: ${got.toFixed(2)}% >= --min ${want}%`
    : `\nFAIL: ${got.toFixed(2)}% < --min ${want}%`);
  process.exit(got >= want ? 0 : 1);
}
