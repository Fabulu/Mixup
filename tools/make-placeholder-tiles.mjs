// ORIGINAL placeholder art for the player's animation tile pool.
//
// WHY THIS EXISTS. `games/batman/assets/player.tiles.bin` is 6974 bytes lifted
// byte-for-byte out of bank 2 of the cartridge, and src/assets.js:82 fetches it
// -- so every deploy of this site since the first one has served verbatim
// cartridge graphics. tools/build-dist.mjs used to allowlist it through the
// ROM-leak guard. It no longer does: it calls this file instead and publishes
// what this file draws.
//
// WHAT IS AND IS NOT DERIVED. This generator never opens player.tiles.bin and
// never opens a ROM. Every pixel below comes from the constants in this file.
// What it DOES read out of assets/manifest.json is the INDEX -- how many bytes
// the pool is and which byte offset each animation's 12 tiles live at. That is
// the machine's addressing scheme, not artwork: it is the same kind of fact as
// "a DMG tile is 16 bytes, 2bpp, MSB-left". The art is mine and looks nothing
// like Sunsoft's Batman, which is the point -- a placeholder should be obvious.
//
// THE FORMAT, as measured off assets/manifest.json (not quoted from a doc):
//   pool          6974 B, manifest.player.tilePoolBytes
//   tile          16 B, DMG 2bpp: per row a low-plane byte then a high-plane
//                 byte, bit 7 = leftmost pixel, colour = lo | hi<<1
//   anims         31, each 3 columns x 4 tile offsets  (manifest.player.anims)
//   offsets       all multiples of 16; 275 distinct, contiguous 0..4384.
//                 The remaining 2574 B of the pool are referenced by NOTHING
//                 the port ever reads -- the exporter's end pointer simply
//                 covers more than the animation table uses.
//   on screen     obj[col*4 + t]. metasprite table1[1] places column 0 at
//                 dx -12, column 1 at -4, column 2 at +4, and within a column
//                 t = 0..3 runs top to bottom (dy -16, -8, 0, +8). So the 12
//                 tiles of one animation are a 24x32 image, 3 tiles wide and
//                 4 tall, and that is exactly how this file draws them.
//
// SHARED SLOTS. 31 anims x 12 = 372 tile slots but only 275 distinct offsets:
// the cartridge's poses share tiles. Two consequences, both handled below:
//   - An offset used at three or more DIFFERENT (column, row) positions can
//     only be the blank tile -- nothing else can sit at both a head position
//     and a foot position. Exactly one offset qualifies (4384, used at six).
//     It is emitted empty. This is inferred from the INDEX, not from pixels.
//   - An offset shared by several anims at the SAME position gets the art of
//     the first anim that claims it (`owner` below). An anim that borrows a
//     slot therefore shows the lending anim's variant of that tile. That is a
//     property of the cartridge's own layout, not a bug here; it is why some
//     poses in the contact sheet are identical.
//
// Usage:
//   node tools/make-placeholder-tiles.mjs                 write the .bin
//   node tools/make-placeholder-tiles.mjs --png <file>    contact sheet too
//   node tools/make-placeholder-tiles.mjs --out <file>
// tools/build-dist.mjs imports makePlaceholderPool() directly and writes no
// intermediate at all.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ROOT, gamePath } from './oracle/_env.mjs';

// ---------------------------------------------------------------------------
// The figure. 24 wide, 32 tall, four DMG colours, 0 transparent for OBJ.
// ---------------------------------------------------------------------------

const W = 24, H = 32;
const CLEAR = 0, LIGHT = 1, MID = 2, DARK = 3;

// Six leg poses and six arm poses -> 36 combinations for 31 anims, so every
// anim gets a distinguishable silhouette. legPose = anim % 6, armPose =
// anim / 6, which walks the legs quickly and the arms slowly: on a contact
// sheet that reads as rows of arm positions, and in motion the legs are what
// you notice.
//
// [left foot dx, right foot dx, knee bend] relative to the hips.
const LEGS = [
  [0, 0, 0],    // stand
  [-3, 3, 0],   // stride, wide
  [-1, 2, 1],   // stride, closing
  [-4, 4, 0],   // leap
  [1, -1, 3],   // crouch
  [2, -3, 1],   // cross-step
];

// [left hand dx, dy, right hand dx, dy] relative to the shoulders.
const ARMS = [
  [-4, 6, 4, 6],    // at the sides
  [-5, 1, 5, 1],    // out
  [-4, -5, 4, -5],  // up
  [-2, 6, 7, 0],    // right reach
  [-7, 0, 2, 6],    // left reach
  [-5, -3, 6, 4],   // mixed
];

function blank() { return new Uint8Array(W * H); }

/** One 24x32 placeholder pose. Nothing here reads any cartridge byte. */
export function drawFigure(anim) {
  const g = blank();
  const px = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = c; };
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c);
  };
  const box = (x0, y0, x1, y1, fill, edge) => {
    rect(x0, y0, x1, y1, fill);
    for (let x = x0; x <= x1; x++) { px(x, y0, edge); px(x, y1, edge); }
    for (let y = y0; y <= y1; y++) { px(x0, y, edge); px(x1, y, edge); }
  };
  // A 2-pixel-thick line, used for every limb.
  const limb = (x0, y0, x1, y1, c) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n);
      const y = Math.round(y0 + (y1 - y0) * i / n);
      px(x, y, c); px(x + 1, y, c);
    }
  };

  const [lfx, rfx, bend] = LEGS[anim % 6];
  const [lhx, lhy, rhx, rhy] = ARMS[Math.floor(anim / 6) % 6];
  const drop = bend;                       // crouch lowers the whole body

  // ---- the anim id, five bits along the very top row ---------------------
  // Purely a debugging aid: whichever pose is on screen, its number is
  // readable off the sprite. Bit 4 first, at x 9..13.
  for (let b = 0; b < 5; b++) px(9 + b, 0, ((anim >> (4 - b)) & 1) ? LIGHT : DARK);

  // ---- head ---------------------------------------------------------------
  box(9, 1 + drop, 14, 7 + drop, MID, DARK);
  rect(11, 4 + drop, 13, 5 + drop, LIGHT);   // visor, offset right = facing right

  // ---- shoulders and torso ------------------------------------------------
  rect(8, 9 + drop, 15, 10 + drop, DARK);
  box(9, 9 + drop, 14, 18, MID, DARK);
  // Chevron on the chest: a second, larger direction cue that survives flipping.
  px(11, 12, LIGHT); px(12, 13, LIGHT); px(11, 14, LIGHT);
  rect(9, 19, 14, 20, LIGHT);                // belt
  box(10, 21, 13, 23, MID, DARK);            // hips

  // ---- arms ---------------------------------------------------------------
  const sy = 11 + drop;
  limb(9, sy, 9 + lhx, sy + lhy, DARK);
  limb(13, sy, 13 + rhx, sy + rhy, DARK);
  rect(9 + lhx, sy + lhy, 10 + lhx, sy + lhy + 1, LIGHT);   // hands
  rect(13 + rhx, sy + rhy, 14 + rhx, sy + rhy + 1, LIGHT);

  // ---- legs ---------------------------------------------------------------
  // Hips at x 10 and x 13: the limb() brush is 2 px wide, so a standing pose
  // still shows a 1 px gap between the legs instead of one solid block.
  const knee = 27 - bend;
  limb(10, 24, 10 + Math.round(lfx / 2), knee, DARK);
  limb(10 + Math.round(lfx / 2), knee, 10 + lfx, 30, DARK);
  limb(13, 24, 13 + Math.round(rfx / 2), knee, DARK);
  limb(13 + Math.round(rfx / 2), knee, 13 + rfx, 30, DARK);
  rect(9 + lfx, 31, 11 + lfx, 31, LIGHT);    // feet
  rect(12 + rfx, 31, 14 + rfx, 31, LIGHT);

  return g;
}

/** Pack the 8x8 at tile coordinates (tx, ty) as 16 B of DMG 2bpp. */
function encodeTile(g, tx, ty) {
  const out = Buffer.alloc(16);
  for (let y = 0; y < 8; y++) {
    let lo = 0, hi = 0;
    for (let x = 0; x < 8; x++) {
      const c = g[(ty * 8 + y) * W + tx * 8 + x];
      if (c & 1) lo |= 1 << (7 - x);
      if (c & 2) hi |= 1 << (7 - x);
    }
    out[y * 2] = lo; out[y * 2 + 1] = hi;
  }
  return out;
}

// The 2574 B the animation table never points at. Filled with an obvious
// placeholder hatch rather than zeroes so that anyone who dumps the shipped
// file sees at a glance that it is not cartridge content.
const FILLER = Buffer.from([0xCC, 0x00, 0xCC, 0x00, 0x33, 0x00, 0x33, 0x00,
                            0xCC, 0x00, 0xCC, 0x00, 0x33, 0x00, 0x33, 0x00]);

/**
 * Build the whole pool.
 *
 * @param {object} manifest  assets/manifest.json -- only .player.tilePoolBytes
 *   and .player.anims are read. No pixel data from anywhere is consulted.
 * @returns {Buffer} exactly manifest.player.tilePoolBytes bytes.
 */
export function makePlaceholderPool(manifest) {
  const size = manifest.player.tilePoolBytes;
  const anims = manifest.player.anims;
  const pool = Buffer.alloc(size);
  for (let i = 0; i < size; i++) pool[i] = FILLER[i % FILLER.length];

  // Pass 1: who owns each offset, and how many distinct positions use it.
  const owner = new Map();          // offset -> [anim, col, row]
  const places = new Map();         // offset -> Set("col:row")
  anims.forEach((a, ai) => a.forEach((col, ci) => col.forEach((off, ti) => {
    if (!owner.has(off)) owner.set(off, [ai, ci, ti]);
    if (!places.has(off)) places.set(off, new Set());
    places.get(off).add(ci + ':' + ti);
  })));

  // Pass 2: draw each anim once, write only the slots it owns.
  const figures = new Map();
  let blanks = 0;
  for (const [off, [ai, ci, ti]] of owner) {
    if (off < 0 || off + 16 > size) {
      throw new Error(`manifest tile offset ${off} does not fit a ${size} B pool`);
    }
    if (places.get(off).size >= 3) {        // can only be the empty tile
      Buffer.alloc(16).copy(pool, off);
      blanks++;
      continue;
    }
    if (!figures.has(ai)) figures.set(ai, drawFigure(ai));
    encodeTile(figures.get(ai), ci, ti).copy(pool, off);
  }
  return pool;
}

// ---------------------------------------------------------------------------
// CLI: write the pool, and optionally a contact sheet decoded back OUT of the
// pool through the manifest's own offsets -- so what you look at is what the
// game would index, not what drawFigure() returned.
// ---------------------------------------------------------------------------

function decodeTile(buf, off) {
  const t = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    const lo = buf[off + y * 2], hi = buf[off + y * 2 + 1];
    for (let x = 0; x < 8; x++) t[y * 8 + x] = ((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1);
  }
  return t;
}

function png(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const chunk = (tag, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const body = Buffer.concat([Buffer.from(tag), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([l, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

function contactSheet(pool, manifest, file) {
  const SHADES = [[0xE0, 0xF8, 0xD0], [0x88, 0xC0, 0x70], [0x34, 0x68, 0x56], [0x08, 0x18, 0x20]];
  const BG = [0xC0, 0x40, 0x90];                 // magenta = transparent
  const S = 3, COLS = 8, GAP = 4;
  const cw = W * S + GAP, ch = H * S + GAP + 6;
  const rows = Math.ceil(manifest.player.anims.length / COLS);
  const IW = COLS * cw + GAP, IH = rows * ch + GAP;
  const rgb = Buffer.alloc(IW * IH * 3);
  for (let i = 0; i < IW * IH; i++) {
    rgb[i * 3] = BG[0]; rgb[i * 3 + 1] = BG[1]; rgb[i * 3 + 2] = BG[2];
  }
  manifest.player.anims.forEach((a, ai) => {
    const ox = GAP + (ai % COLS) * cw, oy = GAP + Math.floor(ai / COLS) * ch;
    for (let ci = 0; ci < 3; ci++) for (let ti = 0; ti < 4; ti++) {
      const t = decodeTile(pool, a[ci][ti]);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const c = t[y * 8 + x];
        if (c === 0) continue;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
          const X = ox + (ci * 8 + x) * S + sx, Y = oy + (ti * 8 + y) * S + sy;
          const o = (Y * IW + X) * 3;
          rgb[o] = SHADES[c][0]; rgb[o + 1] = SHADES[c][1]; rgb[o + 2] = SHADES[c][2];
        }
      }
    }
  });
  png(file, IW, IH, rgb);
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
  const manifest = JSON.parse(fs.readFileSync(gamePath('assets/manifest.json'), 'utf8'));
  const pool = makePlaceholderPool(manifest);
  const out = arg('out', path.join(ROOT, 'rip/placeholder/player.tiles.bin'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pool);
  console.log(`wrote ${out}  ${pool.length} B`);
  const p = arg('png', null);
  if (p) { contactSheet(pool, manifest, p); console.log(`wrote ${p}`); }
}
