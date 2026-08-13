// W351 type $55 -- the cartridge assertions behind T55's header warnings.
//
// Every claim in T55's comment block that a port could plausibly get wrong is pinned here against the
// ROM image, in the style W335 established for type $49. The point is not that handler55 passes: it is
// that if someone later "tidies" the cascade into a switch, folds the two bounds adds, or turns the
// equality test into a threshold, a test fails naming the instruction they contradicted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';

test('W351 the cascade is FALL-THROUGH: four tests on the same byte, none of them else-if', { skip: SKIP }, () => {
  // Each test branches FORWARD past its own arm. A switch would make them exclusive, and mode 2 -- which
  // satisfies both $272536 (>= 2) and $272582 (== 2) -- would lose its second arm entirely.
  assert.equal(IMG.readUInt32BE(0x2724e0), 0x0c2d0000, '$2724E0 cmpi.b #$0,($17,A5)');
  assert.equal(IMG.readUInt16BE(0x2724e4), 0x0017, '  ...on ($17,A5)');
  assert.equal(IMG.readUInt32BE(0x272536), 0x0c2d0002, '$272536 cmpi.b #$2,($17,A5)');
  assert.equal(IMG.readUInt16BE(0x27253c), 0x6d00, '  ...blt, so 2 and up fall INTO the sinusoid');
  assert.equal(IMG.readUInt32BE(0x272582), 0x0c2d0002, '$272582 cmpi.b #$2 -- EXACTLY 2, a second arm');
  assert.equal(IMG.readUInt32BE(0x2725b6), 0x0c2d0003, '$2725B6 cmpi.b #$3 -- the fourth test');
});

test('W351 mode 2 PROMOTES ITSELF and the next test reads it the same frame', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x2725aa), 0x3b7c00f0, '$2725AA move.w #$F0,($1E,A5) -- CLAMP');
  assert.equal(IMG.readUInt32BE(0x2725b0), 0x1b7c0003, '$2725B0 move.b #$3,($17,A5) -- promote');
  assert.equal(IMG.readUInt16BE(0x2725b4), 0x0017, '  ...into ($17,A5)');
  // The promotion is at $2725B0 and the test that acts on it is the very next instruction. Nothing
  // branches over it, so the finale runs on the tick the drift table finishes.
  assert.equal(0x2725b0 + 6, 0x2725b6, 'the mode-3 test is the NEXT instruction, not the next frame');
});

test('W351 arm A ends on EQUALITY, the mode-2 arm on a THRESHOLD', { skip: SKIP }, () => {
  // Not interchangeable. $80 is a multiple of the $10 stride so the equality happens to be safe, which
  // is exactly why "tidying" it to >= would look correct while being a different program.
  assert.equal(IMG.readUInt32BE(0x2724fe), 0x0c6d0080, '$2724FE cmpi.w #$80,($1E,A5)');
  assert.equal(IMG.readUInt16BE(0x272504), 0x6600, '  ...bne -- EQUALITY');
  assert.equal(IMG.readUInt32BE(0x2725a0), 0x0c6d00f0, '$2725A0 cmpi.w #$F0,($1E,A5)');
  assert.equal(IMG.readUInt16BE(0x2725a6), 0x6d00, '  ...blt -- THRESHOLD');
});

test('W351 the bounds test is TWO adds and must not be folded into one', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x2724c0), 0x06401400, '$2724C0 addi.w #$1400,D0');
  assert.equal(IMG.readUInt32BE(0x2724c4), 0x06407400, '$2724C4 addi.w #$7400,D0');
  assert.equal(IMG.readUInt16BE(0x2724c8), 0x6400, '$2724C8 bcc -- carry off the SECOND add');
  // The sums agree, the carries do not: with D0 = $F000 the pair carries then clears, so bcc is TAKEN;
  // a single addi.w #$8800 carries, so bcc is NOT taken. Opposite despawn decision.
  const pair = (((0xf000 + 0x1400) & 0xffff) + 0x7400) > 0xffff;
  const single = 0xf000 + 0x8800 > 0xffff;
  assert.equal(pair, false, 'two adds: no carry off the second');
  assert.equal(single, true, 'one add of $8800: carry');
  assert.notEqual(pair, single, 'so folding them inverts the branch');
});

test('W351 ($2E,A5) is a BURST COUNTER read three ways, not a pattern selector', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x2725e2), 0x102d002e, '$2725E2 move.b ($2E,A5),D0');
  assert.equal(IMG.readUInt32BE(0x2725e6), 0xb02d002f, '$2725E6 cmp.b ($2F,A5),D0 -- first volley only');
  assert.equal(IMG.readUInt32BE(0x272624), 0x4a2d002e, '$272624 tst.b ($2E,A5) -- zero picks the finale');
  assert.equal(IMG.readUInt32BE(0x27270e), 0x532d002e, '$27270E subq.b #1,($2E,A5) -- the countdown');
  assert.equal(IMG.readUInt16BE(0x272712), 0x6400, '$272712 bcc -- underflow reloads');
  assert.equal(IMG.readUInt32BE(0x272716), 0x1b6d002f, '$272716 move.b ($2F,A5),($2E,A5)');
  assert.equal(IMG.readUInt32BE(0x27271c), 0x1b6d0027, '$27271C move.b ($27,A5),($26,A5) -- BOTH timers');
});

test('W351 TWO distinct pause globals at different granularities', { skip: SKIP }, () => {
  // $8130D2 skips the whole alive path to the tail; $8130D4 skips only the volley. Folding them into one
  // frozen check changes behaviour under one of the two.
  assert.equal(IMG.readUInt32BE(0x2724a0), 0x4a790081, '$2724A0 tst.w ...');
  assert.equal(IMG.readUInt16BE(0x2724a4), 0x30d2, '  ...$8130D2 -- the whole-path pause');
  assert.equal(IMG.readUInt32BE(0x2725ce), 0x4a790081, '$2725CE tst.w ...');
  assert.equal(IMG.readUInt16BE(0x2725d2), 0x30d4, '  ...$8130D4 -- the volley-only pause');
  assert.notEqual(0x8130d2, 0x8130d4, 'they are different addresses');
});

test('W351 the sinusoid is CACHED then BACKED OUT, not accumulated', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x272556), 0x3b42002a, '$272556 move.w D2,($2A,A5) -- cache it');
  assert.equal(IMG.readUInt32BE(0x2724ae), 0x926d002a, '$2724AE sub.w ($2A,A5),D1 -- SUBTRACT it back');
  // Accumulating instead walks the record off screen at one offset per frame.
  assert.equal(IMG.readUInt16BE(0x2724b2), 0x3d41, '$2724B2 move.w D1,($2,A6) -- stored back');
});

test('W351 arm A hands off to mode 2, and its #$1 store is DEAD', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x27250c), 0x1b7c0001, '$27250C move.b #$1,($17,A5)');
  assert.equal(IMG.readUInt32BE(0x272512), 0x1b7c0002, '$272512 move.b #$2,($17,A5) -- overwrites it');
  assert.equal(IMG.readUInt16BE(0x272516), 0x0017, '  ...the SAME byte');
  // Six bytes apart with no branch between, so mode 1 is never reached from arm A.
  assert.equal(0x27250c + 6, 0x272512, 'consecutive: the #$1 cannot be observed');
});

test('W351 death TAIL-JUMPS -- $55 neither frees itself nor marks-and-continues', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x272492), 0x4ef9, '$272492 jmp -- not jsr, not a free call');
  assert.equal(IMG.readUInt32BE(0x272494), 0x00263762, '  ...to $263762, the shared MOVE_EXIT');
  assert.equal(IMG.readUInt16BE(0x2724d2), 0x4ef9, '$2724D2 the off-screen exit jmps to the same place');
  assert.equal(IMG.readUInt32BE(0x2724d4), 0x00263762, '  ...$263762');
});
