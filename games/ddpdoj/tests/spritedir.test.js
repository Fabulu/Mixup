// WAVE 35 -- THE SPRITE MASK ROM AS ITS OWN DIRECTORY.
//
// `src/render/spritedir.js` claims the mask ROM is a closed chain: stream
// stride = `wide*high + 4`, and each stream's own two-word colour pointer
// closes it, because the drawer consumes one 5-bit colour pixel per CLEAR mask
// bit and three pixels to a colour word.
//
// These tests run on a SYNTHETIC region, never on the cartridge -- `node --test
// games/ddpdoj/tests/` is the stage that must work on a tree with no ROMs
// extracted, and a test that skips when `rip/` is missing is a test that never
// runs (`docs/knowledge/03`).  The cartridge-side evidence is in
// `docs/worklog/ddpdoj/35-recon-sprite-atlas.md` §3: 8,073 streams walked,
// 150/150 capture streams and 329/329 port streams landing on entries with
// exactly the right extents, and it is re-derivable with
// `node tools/w35atlas.mjs rom`.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  streamStride, streamExtent, walkDirectory, colourBase, SpriteDirError,
} from '../src/render/spritedir.js';

const POP = new Uint8Array(256);
for (let i = 0; i < 256; i++) POP[i] = (i & 1) + POP[i >> 1];
const clearOf = (w) => 16 - POP[w & 0xff] - POP[(w >> 8) & 0xff];

/**
 * Build a synthetic mask region holding `specs` = [{words: u16[]}] laid out the
 * way the cartridge lays sprites out: 2 header words, the mask words, 2 trailer
 * words, and a header whose value is the running colour-word total.
 */
function buildRegion(specs, { size = 4096, colBase = 7, corrupt = null,
  trailer = null } = {}) {
  const mask = new Uint16Array(size);
  let o = 0, col = colBase;
  const starts = [];
  for (const spec of specs) {
    starts.push(o);
    const v = col << 2;
    mask[o] = v & 0xffff;
    mask[o + 1] = (v >>> 16) & 0xffff;
    for (let i = 0; i < spec.length; i++) mask[o + 2 + i] = spec[i];
    // the trailer -- never read by the drawer, so it is deliberately NOISY here
    mask[o + 2 + spec.length] = trailer ? trailer[0] : 0x1234;
    mask[o + 3 + spec.length] = trailer ? trailer[1] : 0xabcd;
    const npix = spec.reduce((s, w) => s + clearOf(w), 0);
    col += npix === 0 ? 0 : Math.floor((npix - 1) / 3) + 1;
    o += spec.length + 4;
  }
  // the end-of-chain sentinel: one more header, then zeros
  const v = col << 2;
  mask[o] = v & 0xffff;
  mask[o + 1] = (v >>> 16) & 0xffff;
  if (corrupt) mask[corrupt[0]] = corrupt[1];
  return { mask, starts, end: o };
}

/** three streams of 8, 4 and 20 mask words, with real-looking bit patterns */
const SPECS = [
  Uint16Array.from([0xffff, 0xf00f, 0x0000, 0x8001, 0xaaaa, 0x5555, 0x0ff0, 0xffff]),
  Uint16Array.from([0xffff, 0x0001, 0x8000, 0xffff]),
  Uint16Array.from(Array.from({ length: 20 }, (_, i) => (0x9249 * (i + 1)) & 0xffff)),
];

test('a stream\'s stride is wide*high + 4: two header words, the mask words, '
  + 'and a two-word trailer the drawer never reads', () => {
  const { mask, starts } = buildRegion(SPECS);
  assert.deepEqual([...starts], [0, 12, 20]);
  assert.equal(streamStride(mask, 0), 8 + 4);
  assert.equal(streamStride(mask, 12), 4 + 4);
  assert.equal(streamStride(mask, 20), 20 + 4);
});

test('streamExtent returns the same three fields export-web.mjs walkStream '
  + 'returned -- maskWords excludes the trailer', () => {
  const { mask } = buildRegion(SPECS);
  const e = streamExtent(mask, 1 << 24, 0);
  assert.equal(e.maskWords, 2 + 8, 'header + 8 mask words, no trailer');
  assert.equal(e.stride, 12);
  assert.equal(e.colStart, 7, 'the colour base written into the header');
  const npix = SPECS[0].reduce((s, w) => s + clearOf(w), 0);
  assert.equal(e.pixels, npix);
  assert.equal(e.colWords, Math.floor((npix - 1) / 3) + 1);
});

test('colStart is masked into the colour region, as the drawer masks it', () => {
  const { mask } = buildRegion(SPECS, { colBase: 0x1000007 });
  assert.equal(colourBase(mask, 0), 0x1000007);
  assert.equal(streamExtent(mask, 1 << 24, 0).colStart, 7);
});

test('THE CHAIN IS WHAT DECIDES, NOT THE PADDING: a stream whose trailer is '
  + 'noise still solves, and an address in the MIDDLE of one does not', () => {
  const { mask } = buildRegion(SPECS);
  assert.equal(streamStride(mask, 0), 12);
  // $000004 is inside stream 0's mask words. Nothing there closes the chain.
  assert.throws(() => streamStride(mask, 4), SpriteDirError);
});

test('a header that is one colour word out breaks the chain rather than '
  + 'shipping a stream of the wrong length', () => {
  const { mask } = buildRegion(SPECS);
  const before = streamStride(mask, 0);
  // move the SECOND stream's colour base by one word
  const v = (colourBase(mask, 12) + 1) << 2;
  mask[12] = v & 0xffff; mask[13] = (v >>> 16) & 0xffff;
  assert.equal(before, 12);
  // It does not quietly answer 12, and it does not quietly answer something
  // else either: nothing in the region closes the chain any more, so it stops.
  assert.throws(() => streamStride(mask, 0), SpriteDirError);
});

test('walkDirectory enumerates every stream from $000000 and stops at the '
  + 'sentinel', () => {
  const { mask, starts, end } = buildRegion(SPECS);
  const d = walkDirectory(mask);
  assert.deepEqual([...d.starts], [...starts]);
  assert.deepEqual([...d.strides], [12, 8, 24]);
  assert.equal(d.end, end);
});

test('an all-transparent stream consumes NO colour words, and the chain still '
  + 'closes on it', () => {
  const { mask } = buildRegion([
    Uint16Array.from([0xffff, 0xffff, 0xffff, 0xffff]),
    SPECS[0],
  ]);
  const e = streamExtent(mask, 1 << 24, 0);
  assert.equal(e.pixels, 0);
  assert.equal(e.colWords, 0);
  assert.equal(e.stride, 8);
  assert.equal(streamStride(mask, 8), 12, 'the next stream still solves');
});

test('THE SEARCH GRID IS 4 WORDS, AND IT HAS TO BE: a trailer can make a '
  + 'SHORTER length satisfy the equation, and a 2-word grid would take it', () => {
  // stream 0 is 8 mask words. Its first SIX consume 54 clear bits = 18 colour
  // words, so a trailer holding the colour base 7 + 18 = 25 makes L = 10 a
  // false solution -- exactly the ambiguity a 4-word grid steps over. On the
  // cartridge every one of the 8,073 strides is 0 mod 4 (the whole ROM walks
  // closed on a 4-word grid), which is what licenses the grid; this pins that
  // the grid is load-bearing rather than cosmetic.
  const { mask } = buildRegion([SPECS[0], SPECS[1]], { trailer: [25 << 2, 0] });
  assert.equal(colourBase(mask, 10), 25, 'the decoy header is in place');
  assert.equal(streamStride(mask, 0), 12,
    'the true stride, not the 10 a 2-word grid would find');
});

test('the colour pointer is a running TOTAL, so stream N+1 starts exactly '
  + 'where stream N\'s colour data ends', () => {
  const { mask } = buildRegion(SPECS);
  const a = streamExtent(mask, 1 << 24, 0);
  const b = streamExtent(mask, 1 << 24, 12);
  assert.equal(b.colStart, a.colStart + a.colWords);
});
