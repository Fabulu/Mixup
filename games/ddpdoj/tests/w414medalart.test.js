// W414 -- DOCKET D51. The medal's art, and the two things a `--verify` cannot see.
//
// W411 gave pool-A kind index 2 -- the gold disc the owner calls the medal -- a
// body, so it allocates, moves and animates. It still could not be DRAWN: neither
// its own sixteen-frame animation nor the popup it turns into when collected was
// ever exported, so every one of its display-list records was handed a source
// offset the packed sheet has no entry for and was dropped silently at composite
// time. [M] on stage1-laser-hold lf2000 with fire held, 5,400 frames: 18,714
// records skipped as missing art on $1BE2CC..$1BE5D8 and 1,340 more on
// $1E179C..$1E1978, and ZERO drawn. After the two windows: 18,714 DRAWN, 0
// missing, one for one.
//
// WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY DOES NOT DO. The docket's own
// warning is that "a window added without the matching shard produces a sheet
// that passes --verify and still draws nothing". A test that asserted the two
// rows exist in `export-web.mjs` would be that same shape one level up. So every
// assertion below is one of exactly two kinds:
//
//   * the CARTRIDGE's own bound for the extent, read out of `maincpu.bin` -- the
//     wrap `cmpi.l` for the live animation, the sprite table's own entry spacing
//     for the popup. These say what the window MUST cover and are independent of
//     what any exporter did.
//   * the SHIPPED bundle's stream list, asked whether it can answer the exact
//     offsets that bound produces, at the exact width the record asks for.
//
// The `2 + wide * high` test is the load-bearing one and is not decoration:
// `src/web/app.js portSpriteList` skips a record whose stream is in the map but
// TOO SHORT, and counts it as missing all the same. A window that landed the
// right address with a short extent would pass a membership test and still draw
// nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const IMAGE = path.join(ROOT, 'rip', 'sound', 'maincpu.bin');
const MANIFEST = path.join(ROOT, 'assets', 'manifest.json');

const IMG = fs.existsSync(IMAGE) ? fs.readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? false
  : 'the ROM image is absent; THIS IS A SKIP, NOT A PASS.';
const u16 = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32 = (a) => u16(a) * 0x10000 + u16(a + 2);

// The shipped bundle's stream triples: `[romOffs, packedBase, maskWords]`, in
// the planes-and-deltas encoding `src/web/assets.js` materialises. Read here the
// same way rather than through `loadBundle`, so this file needs no HTTP shim and
// no capture -- it is asking one question of one array.
function shippedStreams() {
  if (!fs.existsSync(MANIFEST)) return null;
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  // `streamsFile` already carries the `.gz` the page fetches.
  const file = path.join(ROOT, 'assets', man.spr.streamsFile);
  if (!fs.existsSync(file)) return null;
  const raw = zlib.gunzipSync(fs.readFileSync(file));
  const u32a = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >> 2);
  const n = man.spr.streamCount;
  assert.equal(u32a.length, n * 3, 'streams.u32 is streamCount x 3');
  const out = new Map();
  let rom = 0;
  for (let i = 0; i < n; i++) {
    rom = (rom + u32a[i]) >>> 0;                 // plane 0, delta-coded
    out.set(rom, u32a[2 * n + i]);               // plane 2, maskWords, raw
  }
  return out;
}
const STREAMS = shippedStreams();
const SKIP_SHEET = STREAMS ? false
  : 'assets/ has not been exported (node tools/export-web.mjs); '
    + 'THIS IS A SKIP, NOT A PASS.';

// ============ 1. THE LIVE ANIMATION'S EXTENT IS THE BODY'S OWN WRAP

test('W414 $27FE6E carries the stride and the wrap that size kind 2 animation',
  { skip: SKIP_IMG }, () => {
    // $27FEAC lea ($A,A6),A0 -- A0 is the DESCRIPTOR field, so the two immediates
    // below are sprite addresses and not something else the record holds.
    assert.equal(u16(0x27feac), 0x41ee, '$27FEAC is lea (d16,A6),A0');
    assert.equal(u16(0x27feae), 0x000a, '...and the displacement is +$A, the sprite');
    assert.equal(u16(0x27feb0), 0x0690, '$27FEB0 is addi.l #imm,(A0)');
    assert.equal(u32(0x27feb2), 0x34, '...the stride is $34');
    assert.equal(u16(0x27feb6), 0x0c90, '$27FEB6 is cmpi.l #imm,(A0)');
    assert.equal(u32(0x27feb8), 0x1be60c, '...the wrap is $1BE60C');
    assert.equal(u16(0x27febc) >> 8, 0x66, '$27FEBC is bne -- the wrap is the ONLY exit');
    assert.equal(u16(0x27febe), 0x20bc, '$27FEBE is move.l #imm,(A0)');
    assert.equal(u32(0x27fec0), 0x1be2cc, '...and it reloads the base $1BE2CC');
    // ...so the run is [base, wrap) at that stride, and the count is arithmetic,
    // not an assumption carried over from the star sixteen.
    assert.equal((0x1be60c - 0x1be2cc) % 0x34, 0, 'the wrap is a whole number of strides');
    assert.equal((0x1be60c - 0x1be2cc) / 0x34, 16, 'SIXTEEN frames');
  });

test('W414 template 2 names $1BE2CC and template 3 is two families away',
  { skip: SKIP_IMG }, () => {
    // $280E4A is the twenty impact templates; entry 2 is kind index 2's.
    const tpl = u32(0x280e4a + 2 * 4);
    assert.equal(u32(tpl + 4), 0x1be2cc, 'template 2 sprite is the medal base');
    // The size word is what the display-list record carries at ($E,A6), and it is
    // the number `portSpriteList` checks the stream's length against. Note the
    // decode: wide is bits 14..9, so $0418 is 2 x 24 and NOT the "4 x 24" a
    // nibble-reading of the same word gives.
    assert.equal(u16(tpl + 8), 0x0418, 'kind 2 size word');
    assert.equal((0x0418 & 0x7e00) >> 9, 2, 'wide 2');
    assert.equal(0x0418 & 0x1ff, 24, 'high 24');
    // Template 3's sprite is $1BE94C, and $1BE2CC..$1BE94C is $680 = TWO runs of
    // $340. The wrap above splits it; the second half was already shipped by W266.
    assert.equal(u32(u32(0x280e4a + 3 * 4) + 4), 0x1be94c);
    assert.equal(0x1be94c - 0x1be2cc, 2 * 0x340);
  });

// ============ 2. THE COLLECTED POPUP'S EXTENT IS THE SPRITE TABLE'S OWN SPACING

test('W414 $280F64 entries are 8 x $44 apart, which sizes the collected popup',
  { skip: SKIP_IMG }, () => {
    // $280FDC reads ($10,A6) as a selector: its LOW word picks one of $280F34's
    // three descriptors, its HIGH word indexes that descriptor's sprite table.
    const rec = u32(0x280f34);
    const base = u32(rec);
    assert.equal(base, 0x280f64, 'descriptor 0 sprite table');
    assert.equal(u16(rec + 10), 0x44, 'and its step, the word $281010 reads');
    // Ten longs, every consecutive pair exactly 8 x $44 apart -- so an entry IS an
    // eight-frame animation and its end is the next entry.
    for (let i = 0; i < 9; i++) {
      assert.equal(u32(base + (i + 1) * 4) - u32(base + i * 4), 8 * 0x44,
        `$280F64[${i}] to [${i + 1}]`);
    }
    // Both collect arms that reach this table write selector $00050000, so the
    // entry is FIVE. $27F9EE is the star's (kinds 0/4) and $27FE0E is the medal's.
    assert.equal(u16(0x27fa0e), 0x2d7c, '$27FA0E move.l #imm,($10,A6) -- the star');
    assert.equal(u32(0x27fa10), 0x00050000);
    assert.equal(u16(0x27fe3c), 0x2d7c, '$27FE3C move.l #imm,($10,A6) -- the medal');
    assert.equal(u32(0x27fe3e), 0x00050000);
    assert.equal(u32(base + 5 * 4), 0x1e179c, 'entry 5 is the popup both of them get');
    assert.equal(u32(base + 6 * 4), 0x1e19bc, 'and entry 6 is where it ends');
  });

// ============ 3. THE SHIPPED SHEET CAN ANSWER EVERY ONE OF THEM

test('W414 all sixteen medal frames are in the shipped sheet, long enough to draw',
  { skip: SKIP_SHEET }, () => {
    const need = 2 + 2 * 24;                     // the size word $0418, decoded
    const absent = [], short = [];
    for (let n = 0; n < 16; n++) {
      const offs = 0x1be2cc + n * 0x34;
      const words = STREAMS.get(offs);
      if (words === undefined) absent.push(offs);
      else if (words < need) short.push([offs, words]);
    }
    assert.deepEqual(absent, [], 'every frame is a key in manifest.spr.streams');
    assert.deepEqual(short, [],
      `every frame holds at least ${need} mask words -- portSpriteList counts a `
      + 'stream that is present but too short as MISSING, and it draws nothing');
  });

test('W414 all eight collected-popup frames are in the shipped sheet',
  { skip: SKIP_SHEET }, () => {
    // Descriptor 0's own size word is what the record carries after $281002, so
    // the popup's width test is that one and not the live medal's.
    const size = u16(u32(0x280f34) + 8);
    const need = 2 + ((size & 0x7e00) >> 9) * (size & 0x1ff);
    const absent = [], short = [];
    for (let n = 0; n < 8; n++) {
      const offs = 0x1e179c + n * 0x44;
      const words = STREAMS.get(offs);
      if (words === undefined) absent.push(offs);
      else if (words < need) short.push([offs, words]);
    }
    assert.deepEqual(absent, []);
    assert.deepEqual(short, []);
  });

// ============ 4. THE GAP THIS WAVE FOUND AND DID NOT CLOSE

test('W414 pool-A kind 3 has neither a body nor a picture, and both are named',
  { skip: SKIP_IMG }, () => {
    // Reported rather than fixed, and asserted so it cannot quietly become half
    // true. Kind index 3 IS allocatable today -- `handlers.js` passes D0 = $C at
    // $279D64 and $279F3C, wired by W374 -- but `bee.js runBody` dispatches five
    // bodies and $27FED2 is not one of them, so such a record throws `unreached`
    // BEFORE anything asks for its art. Shipping the picture first would be art
    // no measurement in this repo can show drawing.
    assert.equal(u32(0x27f99e + 3 * 4), 0x27fed2, 'kind 3 body');
    assert.equal(u32(u32(0x280e4a + 3 * 4) + 4), 0x1be94c, 'kind 3 sprite');
    if (STREAMS) {
      assert.equal(STREAMS.has(0x1be94c), false,
        'kind 3 art is still absent -- when $27FED2 is ported, this is the '
        + 'window that has to land with it: $1BE94C, 16 frames of stride $C4, '
        + 'closed by $1BF58C');
    }
  });
