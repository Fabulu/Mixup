// The ORIGINAL placeholder player tiles that tools/build-dist.mjs publishes in
// place of the cartridge's own tile pool.
//
// WHAT THIS PROTECTS. `games/batman/assets/player.tiles.bin` is 6974 bytes of
// bank 2, verbatim. Until now build-dist allowlisted it through the ROM-leak
// guard and the public build served it. tools/make-placeholder-tiles.mjs draws
// a replacement of the same length with the same tile indexing, and build-dist
// substitutes it at the copy. Two things have to hold or that swap is worse
// than what it replaced:
//
//   1. the bytes must fit the manifest's own offsets exactly -- a pool that is
//      the wrong length, or a slot left unwritten, does not throw anywhere. It
//      draws a wrong picture in a browser and nothing else notices;
//   2. every published pixel must come from drawFigure()'s constants. The test
//      re-encodes the figure independently, from the exported drawing function,
//      and demands the pool match byte for byte. If someone ever "improves" the
//      placeholder by reading the cartridge's tiles and perturbing them, this
//      goes red -- which is the entire point of the exercise.
//
// Deliberately ROM-FREE, like the rest of tests/ (see helpers.js): the whole
// suite runs without assets/. The manifests below are synthetic, and the shape
// they describe -- 31 anims x 3 columns x 4 tiles, 16 B per tile, offsets into
// one flat pool -- is the format measured off the real manifest.

import test from 'node:test';
import assert from 'node:assert/strict';

import { makePlaceholderPool, drawFigure } from '../../../tools/make-placeholder-tiles.mjs';

const ANIMS = 31, COLS = 3, ROWS = 4, TILE = 16;

/**
 * A manifest shaped like the real one. `share` optionally makes anim 5 borrow
 * anim 1's whole first column, and puts one offset at three different
 * (column, row) positions -- both of which the cartridge's own table does.
 */
function fakeManifest({ share = false, poolBytes = ANIMS * COLS * ROWS * TILE } = {}) {
  const anims = [];
  let next = 0;
  for (let a = 0; a < ANIMS; a++) {
    const cols = [];
    for (let c = 0; c < COLS; c++) {
      const tiles = [];
      for (let r = 0; r < ROWS; r++) { tiles.push(next); next += TILE; }
      cols.push(tiles);
    }
    anims.push(cols);
  }
  if (share) {
    anims[5][0] = anims[1][0].slice();          // same column, same positions
    // THE SLOT PICKED HERE MATTERS. It was anim 0's (col 0, row 0) -- the
    // top-left corner, which the figure never covers, so "is it blank?" was
    // true whatever the rule did and loosening the rule to >= 4 kept the test
    // green. Anim 0's HEAD is unambiguously drawn, so blanking it is visible.
    const blank = anims[0][1][0];               // used at (1,0), (1,1) and (2,3)
    anims[7][1][1] = blank;
    anims[7][2][3] = blank;
  }
  return { player: { tilePoolBytes: poolBytes, anims } };
}

/** DMG 2bpp, independent of the generator's own encoder. */
function encode(fig, col, row) {
  const out = Buffer.alloc(TILE);
  for (let y = 0; y < 8; y++) {
    let lo = 0, hi = 0;
    for (let x = 0; x < 8; x++) {
      const c = fig[(row * 8 + y) * 24 + col * 8 + x];
      if (c & 1) lo |= 1 << (7 - x);
      if (c & 2) hi |= 1 << (7 - x);
    }
    out[y * 2] = lo; out[y * 2 + 1] = hi;
  }
  return out;
}

function decode(pool, off) {
  const t = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    const lo = pool[off + y * 2], hi = pool[off + y * 2 + 1];
    for (let x = 0; x < 8; x++) t[y * 8 + x] = ((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1);
  }
  return t;
}

test('pool is exactly the length the manifest declares', () => {
  for (const poolBytes of [ANIMS * COLS * ROWS * TILE, 6974]) {
    const pool = makePlaceholderPool(fakeManifest({ poolBytes }));
    assert.equal(pool.length, poolBytes);
  }
});

test('a manifest offset that does not fit the pool is refused, not truncated', () => {
  const m = fakeManifest({ poolBytes: 64 });
  assert.throws(() => makePlaceholderPool(m), /does not fit/);
});

test('every published byte comes from drawFigure(), not from any file', () => {
  const m = fakeManifest();
  const pool = makePlaceholderPool(m);
  let checked = 0;
  m.player.anims.forEach((a, ai) => {
    const fig = drawFigure(ai);
    a.forEach((col, ci) => col.forEach((off, ti) => {
      assert.deepEqual(pool.subarray(off, off + TILE), encode(fig, ci, ti),
        `anim ${ai} col ${ci} row ${ti} @${off} is not what drawFigure(${ai}) draws`);
      checked++;
    }));
  });
  assert.equal(checked, ANIMS * COLS * ROWS);
});

test('generation is deterministic', () => {
  const a = makePlaceholderPool(fakeManifest());
  const b = makePlaceholderPool(fakeManifest());
  assert.deepEqual(a, b);
});

test('a slot shared at three or more positions is emitted blank', () => {
  // Nothing can sit at a head position and a foot position at once, so such an
  // offset can only be the empty tile. The cartridge has exactly one.
  const m = fakeManifest({ share: true });
  const off = m.player.anims[0][1][0];
  // Guard against the check going vacuous: a slot the figure never covers is
  // blank whatever the rule does, and that is how this test first passed a
  // deliberately loosened rule.
  assert.notDeepEqual(encode(drawFigure(0), 1, 0), Buffer.alloc(TILE),
    'the slot under test is empty art -- this test would prove nothing');
  assert.deepEqual(makePlaceholderPool(m).subarray(off, off + TILE), Buffer.alloc(TILE));
});

test('a slot shared by two anims takes the first anim that claims it', () => {
  const m = fakeManifest({ share: true });
  const pool = makePlaceholderPool(m);
  const fig1 = drawFigure(1);
  let drawn = 0;
  m.player.anims[5][0].forEach((off, ti) => {
    const want = encode(fig1, 0, ti);
    assert.deepEqual(pool.subarray(off, off + TILE), want);
    if (!want.equals(Buffer.alloc(TILE))) drawn++;
  });
  assert.ok(drawn > 0, 'the borrowed column is all empty tiles -- proves nothing');
});

test('every pose is actually drawn: legible pixel count and full palette', () => {
  const m = fakeManifest();
  const pool = makePlaceholderPool(m);
  m.player.anims.forEach((a, ai) => {
    const seen = new Set();
    let lit = 0;
    a.forEach((col) => col.forEach((off) => {
      const t = decode(pool, off);
      for (const c of t) { seen.add(c); if (c) lit++; }
    }));
    // A blank pool, an all-one-colour blob or a 12-pixel speck all pass "it
    // rendered". 24x32 = 768 px; the figure covers roughly a third of it.
    assert.ok(lit >= 150 && lit <= 600, `anim ${ai} has ${lit} lit pixels`);
    for (const c of [0, 1, 2, 3]) assert.ok(seen.has(c), `anim ${ai} never uses colour ${c}`);
  });
});

test('poses differ from one another, ignoring the anim-id badge', () => {
  const m = fakeManifest();
  const pool = makePlaceholderPool(m);
  // THE BADGE HAS TO COME OUT OF THE SIGNATURE. With it in, this test stayed
  // green while drawFigure() was pinned to one leg pose AND one arm pose for
  // every anim -- 31 identical figures wearing 31 different numbers. The badge
  // is pixel row 0 of the head tile, i.e. bytes 0-1 of (col 1, row 0).
  const sigs = m.player.anims.map((a) => a.map((col, ci) => col.map((off, ti) => {
    const t = Buffer.from(pool.subarray(off, off + TILE));
    if (ci === 1 && ti === 0) { t[0] = 0; t[1] = 0; }
    return t.toString('hex');
  }).join('')).join(''));
  // 6 leg poses x 6 arm poses, so all 31 must be distinct on the art alone.
  assert.equal(new Set(sigs).size, ANIMS);
});

test('the anim id reads back off the top row of the sprite', () => {
  // Not decoration: it is the only way to tell which pose the game is showing
  // once the cartridge art is gone, and it exercises the 2bpp bit packing
  // end to end -- bit 7 leftmost, colour = low plane | high plane << 1.
  const m = fakeManifest();
  const pool = makePlaceholderPool(m);
  m.player.anims.forEach((a, ai) => {
    const top = decode(pool, a[1][0]);          // column 1, row 0 = the head
    let read = 0;
    for (let b = 0; b < 5; b++) read = (read << 1) | (top[1 + b] === 1 ? 1 : 0);
    assert.equal(read, ai);
  });
});

test('unreferenced pool bytes are placeholder filler, not zeroes or ROM', () => {
  // The cartridge's pool is 6974 B but the animation table only reaches 4400.
  // Whatever fills the rest is published too, so it has to be ours.
  const m = fakeManifest({ poolBytes: ANIMS * COLS * ROWS * TILE + 256 });
  const pool = makePlaceholderPool(m);
  const tail = pool.subarray(ANIMS * COLS * ROWS * TILE);
  assert.equal(tail.length, 256);
  assert.ok(tail.some((b) => b !== 0), 'tail is all zeroes');
  assert.deepEqual(tail.subarray(0, 16), tail.subarray(16, 32), 'tail is not a repeating pattern');
});
