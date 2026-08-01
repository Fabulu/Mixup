#!/usr/bin/env node
// THE ASSET EXPORTER FOR THE PUBLISHED PAGE  (wave 7).
//
//     node games/ddpdoj/tools/export-web.mjs
//
// WHAT PROBLEM THIS SOLVES.  Wave 6's page fetched `rip/` directly: the whole
// IGS023 tile region plus both sprite regions, 58 MiB, plus a 4.0 MiB board
// capture.  That is not a thing anybody serves to a phone, and wave 6 said so
// (`06-impl-pixel-slice.md` §"What I could not do" item 4: "cannot be trimmed
// to what this capture uses without a second measurement").
//
// THIS IS THAT SECOND MEASUREMENT.  The page draws exactly 161 captured frames
// of the `fly-around` scenario, on a loop, with the ship's three display-list
// records moved to the port's own position.  The SPLICE TOUCHES ONLY THE
// POSITION FIELDS (`src/render/capture.js`: word 0 bits 10..0 and word 1 bits
// 9..0) -- never `offs`, never `width`/`height`, never a tile number.  So the
// set of ROM bytes the page can ever read is FIXED by the capture and is
// enumerable exactly:
//
//   * BG tile numbers  = every `bgram[ti*2]`, ti in 0..1023, over 161 frames
//   * TX tile numbers  = every `txram[ti*2]`, ti in 0..2047, over 161 frames
//     (`buildBgMap`/`buildTxMap` decode EVERY map entry, on-screen or not)
//   * sprite streams   = every record `parseSpriteList` returns, over 161
//     frames, walked to count exactly how many mask words and colour words
//     the drawer consumes
//
// Measured: 415 BG tiles, 159 TX tiles, 150 distinct sprite streams,
// 11,325 mask words and 21,784 colour words -- out of 8,388,608 and 16,777,216
// respectively.  0.13 % and 0.13 %.
//
// AND THE OUTPUT IS NOT A SLICE OF THE CARTRIDGE.
//   * the tiles are DECODED -- 5bpp LSB-first bitstream -> one byte per pixel,
//     and 4bpp packed-lsb -> one byte per pixel.  Same transformation
//     `games/gradius/assets/chr/tiles.u8` is.
//   * the sprite streams are RE-BASED into a compact 16-bit address space:
//     each stream's two-word header is REWRITTEN to point at its colour data's
//     new address, and every display-list record in the capture has its `offs`
//     field rewritten to the new base.  The published `spr/mask.u16` is a
//     different address space from the cartridge's, and `capture.bin` is
//     rewritten to match it.
// Neither file is a contiguous slice of any ROM, and `tools/build-dist.mjs`'s
// leak guard is left exactly as it is.
//
// The gate that says this bundle is CORRECT and not merely small is
// `tools/bundlegate.mjs`: the demo path, run off the BUNDLE, compared to MAME's
// own framebuffers.  It must stay at 15955968/15955968, and its `--break`
// modes must go red.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Capture } from '../src/render/capture.js';
import { parseSpriteList, BUFFER_STRIDE } from '../src/render/spritelist.js';
import {
  IGS023_LAYOUT, IGS023_SIZE, SPRCOL_LAYOUT, SPRCOL_SIZE,
  SPRMASK_LAYOUT, SPRMASK_SIZE, assemble, assertLittleEndianHost,
} from '../src/render/regions.js';
import { bgTile, txTile, BG_W, BG_H, TX_W, TX_H } from '../src/render/tiles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');

const BG_TILE_BYTES = BG_W * BG_H;      // 1024, decoded
const TX_TILE_BYTES = TX_W * TX_H;      // 64, decoded

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const RIP = arg('rip', path.join(GAME, 'rip'));
const OUT = arg('out', path.join(GAME, 'assets'));

// ---------------------------------------------------------------------------
// the cartridge side

function need(p, how) {
  if (!fs.existsSync(p)) {
    throw new Error(`${p} is missing. ${how}`);
  }
  return p;
}

console.log(`reading  ${RIP}`);
const romDir = need(path.join(RIP, 'rom'),
  'Run: python games/ddpdoj/tools/assets.py extract');
const webDir = need(path.join(RIP, 'web'),
  'Run: python games/ddpdoj/tools/oracle/pgm.py pixdemo');
const tablesFile = need(path.join(RIP, 'port', 'player.tables.json'),
  'Run: python games/ddpdoj/tools/export-tables.py');

assertLittleEndianHost();
const readRom = (n) => new Uint8Array(fs.readFileSync(path.join(romDir, n)));
const igs023 = assemble(readRom, IGS023_LAYOUT, IGS023_SIZE);
const sprmaskBytes = assemble(readRom, SPRMASK_LAYOUT, SPRMASK_SIZE);
const sprcolBytes = assemble(readRom, SPRCOL_LAYOUT, SPRCOL_SIZE);
const sprmask = new Uint16Array(sprmaskBytes.buffer, 0, SPRMASK_SIZE / 2);
const sprcol = new Uint16Array(sprcolBytes.buffer, 0, SPRCOL_SIZE / 2);
const MASKW = sprmask.length, COLW = sprcol.length;

const capJson = JSON.parse(fs.readFileSync(path.join(webDir, 'capture.json'), 'utf8'));
const capBin = new Uint8Array(fs.readFileSync(path.join(webDir, 'capture.bin')));
const cap = new Capture(capJson, capBin);
const seed = new Uint8Array(fs.readFileSync(path.join(webDir, 'seed.bin')));
const tables = fs.readFileSync(tablesFile);

// ---------------------------------------------------------------------------
// 1. COVERAGE.  What can this capture possibly make the renderer read?

const bgUsed = new Set(), txUsed = new Set();
/** offs -> {maskWords, colStart, colWords} , the MAXIMUM over every occurrence */
const streams = new Map();
let records = 0;

/**
 * Walk one record's mask stream exactly as `SpriteDrawer` does, counting.
 *
 * Both `_lineBasic` and `_lineZoom` consume `wide` mask words per SOURCE line
 * and `high` source lines are always walked -- a ygrow-doubled line REWINDS
 * (`this.b = tbo`) and replays the same words, and a yzoom-dropped line is
 * consumed without being drawn.  So the mask extent is `2 + wide*high` words
 * and the colour extent is one 5-bit pixel per CLEAR mask bit, three pixels to
 * a colour word, in both paths.  That is an assertion about the transcription
 * in `src/render/sprites.js`, and `tools/bundlegate.mjs` is what tests it:
 * if this walk under-counts by one word the gate stops being 100 %.
 */
function walkStream(offs, wide, high) {
  let b = offs & (MASKW - 1);
  const a0 = (((sprmask[(b + 1) & (MASKW - 1)] << 16)
    | sprmask[b & (MASKW - 1)]) >>> 2);
  b += 2;
  let npix = 0;
  for (let line = 0; line < high; line++) {
    for (let w = 0; w < wide; w++) {
      const m = sprmask[b & (MASKW - 1)];
      b++;
      for (let k = 0; k < 16; k++) if (!((m >> k) & 1)) npix++;
    }
  }
  return {
    maskWords: 2 + wide * high,
    colStart: a0 & (COLW - 1),
    // `_pix` reads BEFORE advancing, and rolls to the next word every 3 pixels.
    colWords: npix === 0 ? 0 : Math.floor((npix - 1) / 3) + 1,
  };
}

for (let i = 0; i < cap.length; i++) {
  const st = cap.state(i);
  for (let t = 0; t < 64 * 16; t++) bgUsed.add(st.bg[t * 2]);
  for (let t = 0; t < 64 * 32; t++) txUsed.add(st.tx[t * 2]);
  for (const s of parseSpriteList(st.spritebuffer, BUFFER_STRIDE)) {
    records++;
    // `draw()` returns before touching a single ROM word when either extent is
    // zero, so such a record needs no data at all -- but it still needs a legal
    // `offs`, because the field is rewritten below.
    const w = walkStream(s.offs, s.width, s.height);
    const prev = streams.get(s.offs);
    if (!prev) streams.set(s.offs, w);
    else {
      prev.maskWords = Math.max(prev.maskWords, w.maskWords);
      prev.colWords = Math.max(prev.colWords, w.colWords);
      if (prev.colStart !== w.colStart) {
        throw new Error(`stream $${s.offs.toString(16)} resolved to two colour `
          + `bases (${prev.colStart} and ${w.colStart}) -- the header is not a `
          + 'function of offs and this exporter\'s model is wrong');
      }
    }
  }
}

// ------------------------------------------------------------------- WAVE 12
// THE SEVENTEEN SHIP IMAGES -- and the reason the ship has never banked.
//
// `render/capture.js` wrote this down and left it for a later wave: the port
// DOES compute the tilt and DOES compute the tilt-indexed animation long
// ($25533A -> $255362, `vectors.js` anim()), those longs ARE display-list words
// 2-3, "and what stops it is that export-web.mjs RE-BASES every sprite stream
// into a packed 16-bit space and does not ship the map".
//
// The map cannot be built from the capture, and that is the whole problem: the
// recorded ship never moved on the short axis (`frameList[].px` is 5312 on all
// 161 frames), so its tilt was 0 throughout and exactly ONE of the seventeen
// streams -- $1520 -- appears in the coverage pass above.  The other sixteen are
// not in the packed sheet, so there is nothing for a rebased map to point at.
//
// So they are HARVESTED HERE, by address, out of the same sprite ROMs every
// other stream comes from.  The addresses are the ROM's own table (exported by
// tools/export-tables.py, read the way $249E5A reads it) and the extents are the
// ship record's ($e,A6), MEASURED $0620 = 3 x 32 on every one of the 2,233 drawn
// frames of fly-around -- not a guess, and it is asserted below against the one
// stream the capture does contain.
const SHIP_SIZE = 0x0620;                   // MEASURED ($e,A6) on $8103E6
const shipWide = (SHIP_SIZE >> 9) & 0x3f;   // spritelist.js: width bits 14..9
const shipHigh = SHIP_SIZE & 0x1ff;         // ...height bits 8..0
const shipTable = JSON.parse(tables.toString('utf8')).anim;
const shipOffs = shipTable.a.shipSel0.map(([hi, lo]) => ((hi & 0x7f) << 16) | lo);
if (shipOffs.length !== 17) {
  throw new Error(`the $25533A ship animation table has ${shipOffs.length} tilt `
    + 'entries, not 17 -- re-run tools/export-tables.py');
}
let shipHarvested = 0;
for (const offs of shipOffs) {
  const w = walkStream(offs, shipWide, shipHigh);
  const prev = streams.get(offs);
  if (!prev) { streams.set(offs, w); shipHarvested++; continue; }
  // The tilt-0 image IS in the capture.  If the harvest disagrees with the
  // capture's own record about the same stream, the extents above are wrong and
  // this must stop rather than ship a sheet that is subtly short.
  if (prev.colStart !== w.colStart) {
    throw new Error(`ship stream $${offs.toString(16)}: the capture says colour `
      + `base ${prev.colStart}, the $0620 extents say ${w.colStart}`);
  }
  prev.maskWords = Math.max(prev.maskWords, w.maskWords);
  prev.colWords = Math.max(prev.colWords, w.colWords);
}

const bgList = [...bgUsed].sort((a, b) => a - b);
const txList = [...txUsed].sort((a, b) => a - b);
console.log(`coverage over ${cap.length} captured frames, ${records} records:`);
console.log(`  BG tiles ${bgList.length}   TX tiles ${txList.length}   `
  + `sprite streams ${streams.size} (${shipHarvested} of them the ship's own `
  + `bank frames, harvested by address because the recorded ship never banked)`);

// ---------------------------------------------------------------------------
// 2. THE TILE SHEETS.  Decoded, one byte per pixel, in ascending tile order.

const bgSheet = new Uint8Array(bgList.length * BG_TILE_BYTES);
const bgNo = new Uint16Array(bgList.length);
bgList.forEach((n, i) => {
  if (n > 0xffff) throw new Error(`BG tile number ${n} does not fit a u16`);
  bgNo[i] = n;
  bgTile({ igs023 }, n, bgSheet.subarray(i * BG_TILE_BYTES, (i + 1) * BG_TILE_BYTES));
});
const txSheet = new Uint8Array(txList.length * TX_TILE_BYTES);
const txNo = new Uint16Array(txList.length);
txList.forEach((n, i) => {
  if (n > 0xffff) throw new Error(`TX tile number ${n} does not fit a u16`);
  txNo[i] = n;
  txTile({ igs023 }, n, txSheet.subarray(i * TX_TILE_BYTES, (i + 1) * TX_TILE_BYTES));
});

// ---------------------------------------------------------------------------
// 3. THE SPRITE STREAMS, RE-BASED.
//
// Coalesce the used word ranges first, THEN assign new bases per coalesced
// block, so streams that share colour data keep sharing it.  Each stream's own
// mask block is disjoint from every other's (asserted below), which is what
// makes rewriting its header safe.

function coalesce(ranges) {
  const r = ranges.filter(([, len]) => len > 0)
    .map(([s, len]) => [s, s + len]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of r) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

const maskBlocks = coalesce([...streams.entries()]
  .map(([offs, w]) => [offs & (MASKW - 1), w.maskWords]));
const colBlocks = coalesce([...streams.values()].map((w) => [w.colStart, w.colWords]));

// One mask block per stream, starting exactly at that stream's `offs`. If this
// ever fails the header rewrite below could corrupt another sprite's mask data,
// so it is an ERROR and not a warning.
const nonEmptyStreams = [...streams.entries()].filter(([, w]) => w.maskWords > 2
  || w.colWords > 0);
if (maskBlocks.length !== nonEmptyStreams.length) {
  throw new Error(`${nonEmptyStreams.length} sprite streams coalesced into `
    + `${maskBlocks.length} mask blocks -- two streams overlap, and rewriting `
    + 'one\'s header would corrupt the other\'s mask data. Ship the streams at '
    + 'their cartridge addresses instead of re-basing them.');
}

const words = (blocks) => blocks.reduce((t, [s, e]) => t + (e - s), 0);
const pow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };

function pack(blocks, src) {
  const total = words(blocks);
  const size = Math.max(2, pow2(total));
  const buf = new Uint16Array(size);
  const map = [];        // [oldStart, oldEnd, newStart]
  let at = 0;
  for (const [s, e] of blocks) {
    for (let k = s; k < e; k++) buf[at + (k - s)] = src[k & (src.length - 1)];
    map.push([s, e, at]);
    at += e - s;
  }
  return { buf, map, used: total };
}

const packedMask = pack(maskBlocks, sprmask);
const packedCol = pack(colBlocks, sprcol);

const remapIn = (map, addr) => {
  for (const [s, e, at] of map) if (addr >= s && addr < e) return at + (addr - s);
  return -1;
};

/** old `offs` -> new `offs`, and the header rewritten to the new colour base. */
const offsMap = new Map();
for (const [offs, w] of streams) {
  const old = offs & (MASKW - 1);
  let nb = remapIn(packedMask.map, old);
  if (nb < 0) {
    // A stream that is never read (zero width or height in every occurrence).
    // It still needs an `offs` inside the packed space so a mis-parse cannot
    // wrap into somebody else's data.
    nb = 0;
  } else if (w.colWords > 0) {
    const na = remapIn(packedCol.map, w.colStart);
    if (na < 0) throw new Error(`colour base ${w.colStart} is not in any block`);
    // `a = ((mask[o+1] << 16) | mask[o]) >>> 2`, inverted. The two bits the
    // shift discards are written as zero: the decoder cannot see them, and
    // that is one more way this file is not the cartridge's bytes.
    packedMask.buf[nb] = (na << 2) & 0xffff;
    packedMask.buf[nb + 1] = ((na << 2) >>> 16) & 0xffff;
  }
  if (nb > 0xffff) {
    throw new Error(`packed mask base ${nb} exceeds 16 bits; the capture.bin `
      + 'rewrite below assumes word 2\'s high bits are all zero');
  }
  offsMap.set(offs, nb);
}

// ---------------------------------------------------------------------------
// 4. THE CAPTURE, with every record's `offs` rewritten to the packed space.
//
// Big-endian u16 on disk (`beWords`). Word 2 bits 6..0 are `offs` bits 22..16
// and word 3 is bits 15..0; every other bit of word 2 (flip, colour, pri, and
// bit 15 which the DMA mask drops) is preserved byte for byte.

const outBin = capBin.slice();
const [sprOff, sprLen] = cap.offsets.spritebuffer;
let rewritten = 0;
for (let i = 0; i < cap.length; i++) {
  const base = i * cap.frameBytes + sprOff;
  const view = outBin.subarray(base, base + sprLen);
  for (let r = 0; r < 256; r++) {
    const b = r * BUFFER_STRIDE * 2;
    if (b + 10 > view.length) break;
    const w4 = (view[b + 8] << 8) | view[b + 9];
    if ((w4 & 0x7fff) === 0) break;                       // the terminator
    const w2 = (view[b + 4] << 8) | view[b + 5];
    const w3 = (view[b + 6] << 8) | view[b + 7];
    const offs = ((w2 & 0x007f) << 16) | w3;
    const nb = offsMap.get(offs);
    if (nb === undefined) throw new Error(`record ${r} of frame ${i} has offs `
      + `$${offs.toString(16)}, which the coverage pass never saw`);
    const nw2 = (w2 & ~0x007f) | ((nb >>> 16) & 0x7f);
    view[b + 4] = (nw2 >> 8) & 0xff; view[b + 5] = nw2 & 0xff;
    view[b + 6] = (nb >> 8) & 0xff; view[b + 7] = nb & 0xff;
    rewritten++;
  }
}
if (rewritten !== records) {
  throw new Error(`rewrote ${rewritten} records but the coverage pass counted `
    + `${records} -- the two walks disagree about where the list ends`);
}

// ---------------------------------------------------------------------------
// 5. WRITE.  Every binary is gzipped; the page inflates with the platform's own
// DecompressionStream. The capture is 161 nearly-identical frames of video
// state and compresses 61:1, which is the difference between a 4.0 MiB fetch
// and a 66 KiB one.

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'gfx'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'spr'), { recursive: true });
// In the same breath as the directory, per the standing rule. The repo root's
// .gitignore already matches an unanchored `assets/`; this is the belt to that
// pair of braces, and it is what games/ddpdoj/rip/ does too.
fs.writeFileSync(path.join(OUT, '.gitignore'), '*\n');

const written = [];
function put(rel, bytes, { gz = true } = {}) {
  const raw = bytes instanceof Uint8Array ? bytes
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const body = gz ? zlib.gzipSync(raw, { level: 9 }) : raw;
  const p = path.join(OUT, gz ? `${rel}.gz` : rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  written.push([gz ? `${rel}.gz` : rel, body.length, raw.length]);
}

put('gfx/bg.tiles.u8', bgSheet);
put('gfx/bg.tileno.u16', bgNo);
put('gfx/tx.tiles.u8', txSheet);
put('gfx/tx.tileno.u16', txNo);
put('spr/mask.u16', packedMask.buf);
put('spr/col.u16', packedCol.buf);
put('capture.bin', outBin);
put('seed.bin', seed);
put('player.tables.json', tables, { gz: false });

const manifest = {
  note: 'Generated by games/ddpdoj/tools/export-web.mjs. Nothing here is '
    + 'committed: assets/ is gitignored. Regenerate from your own cartridge.',
  game: 'ddpdoj', set: 'ddpdojblk', build: 'B',
  scenario: capJson.scenario,
  frames: cap.length,
  // Every binary above is gzip; `src/webassets.js` inflates with
  // DecompressionStream and REFUSES to run without it rather than serving a
  // zero-filled sheet that renders a plausible empty starfield.
  encoding: 'gzip',
  gfx: {
    bg: { tiles: bgList.length, tileBytes: BG_TILE_BYTES, w: BG_W, h: BG_H, bpp: 5 },
    tx: { tiles: txList.length, tileBytes: TX_TILE_BYTES, w: TX_W, h: TX_H, bpp: 4 },
    note: 'DECODED, one byte per pixel, exactly the transformation '
      + 'src/render/tiles.js bgTile()/txTile() performs. Slot i holds tile '
      + 'number bg.tileno.u16[i]; a tile number that is not in that list is a '
      + 'loud throw, not a blank tile.',
  },
  spr: {
    maskWords: packedMask.buf.length, maskUsed: packedMask.used,
    colWords: packedCol.buf.length, colUsed: packedCol.used,
    // Every stream base that is legal in the packed space, so a record that
    // points outside one is caught at boot instead of drawing noise.
    streams: [...streams.entries()]
      .map(([offs, w]) => [offsMap.get(offs), w.maskWords])
      .filter(([, n]) => n > 2)
      .sort((a, b) => a[0] - b[0]),
    note: 'RE-BASED into a compact 16-bit address space: headers rewritten to '
      + 'the packed colour addresses, and every capture.bin record\'s offs '
      + 'field rewritten to match. Array lengths are powers of two because '
      + 'SpriteDrawer indexes with & (len-1).',
  },
  // WAVE 12 -- THE ONE FIELD THAT MAKES THE SHIP BANK.  `render/capture.js`
  // named this as "a one-field change to the exporter and a later wave's job";
  // this is the field.  `pairs[i]` is the packed-space (word2, word3) the port
  // must write into display-list words 2 and 3 for tilt `tiltMin + i*tiltStep`,
  // i.e. the rebased form of the ROM long `$255362[tilt]` that `$249E62` writes
  // into ($a,A6).  Without it the port's ROM-space longs cannot be translated
  // into the bundle's address space and the ship is drawn with one image
  // forever, which is what the owner reported.
  ship: {
    rom: '$25533A -> $255362', reads: '$249E62 move.l (A0,D0.w),($a,A6)',
    tiltMin: shipTable.tiltMin, tiltStep: shipTable.tiltStep,
    size: SHIP_SIZE, wide: shipWide, high: shipHigh,
    pairs: shipOffs.map((o) => {
      const nb = offsMap.get(o);
      if (nb === undefined) {
        throw new Error(`ship stream $${o.toString(16)} was harvested but not `
          + 'rebased -- the packer and the harvest disagree');
      }
      // The capture stores word 2 bits 6..0 as `offs` bits 22..16 and word 3 as
      // bits 15..0; the packed space is 16 bits wide (asserted above), so word 2
      // keeps its flip/colour/pri bits and its offs bits are all zero.
      return [0, nb & 0xffff];
    }),
    note: 'PACKED-SPACE (word2Low7, word3) per tilt step, 17 entries. The ROM '
      + 'longs these came from are NOT usable directly: export-web.mjs re-bases '
      + 'every stream. 16 of the 17 do not appear in capture.bin at all -- the '
      + 'recorded ship never banked -- and were harvested from the sprite ROMs '
      + 'by address.',
  },
  capture: { layout: capJson.layout, frameBytes: capJson.frameBytes },
  romsUsed: [...IGS023_LAYOUT, ...SPRCOL_LAYOUT, ...SPRMASK_LAYOUT].map(([n]) => n),
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(OUT, 'capture.json'), JSON.stringify({
  ...capJson,
  note: `${capJson.note} -- REBASED for the published bundle by `
    + 'games/ddpdoj/tools/export-web.mjs: every record\'s sprite offs field '
    + 'points into assets/spr/mask.u16, not into the cartridge.',
  rebased: true,
}));

let total = 0;
for (const [name, gz, raw] of written) {
  total += gz;
  console.log(`  ${name.padEnd(24)} ${String(gz).padStart(9)} B`
    + (gz === raw ? '' : `  (from ${raw} B)`));
}
for (const f of ['manifest.json', 'capture.json']) {
  const n = fs.statSync(path.join(OUT, f)).size;
  total += n;
  console.log(`  ${f.padEnd(24)} ${String(n).padStart(9)} B`);
}
console.log(`BUNDLE ${OUT}: ${(total / 1024).toFixed(1)} KiB served`);
