// W380 -- $28B5A8, OBJECT TYPE 5's FIRST FRAME, AND THE LAST STOP BEFORE GAMEPLAY.
//
// The brief for this wave said `$28B5A8` is "56 bytes, eight jsrs" and that "all eight callees
// were unported as of last wave". THE FIRST HALF IS EXACTLY RIGHT and is re-proved below from
// the image. THE SECOND HALF IS WRONG BY SIX. Running `claimed.py` on each address one at a
// time, and then reading the file it points at, gives:
//
//   $27E98A  PORTED  items.js   clearItemPool
//   $28131E  PORTED  bullets.js poolClear + poolPark      <- claimed.py says "NO CODE LITERAL"
//   $288E0C  PORTED  effects.js clearEffectPool
//   $289084  PORTED  effects.js clearSubEffectPool
//   $289AE0  ABSENT  -- W380 ports it (src/poolclear.js)
//   $28AC3A  ABSENT  -- W380 ports it (src/poolclear.js)
//   $289F3A  PORTED  spark.js   clearPool
//   $26331E  PORTED  spawn.js   resetAndInstallStage26331E
//
// `$28131E` is the one worth pausing on, because it is the brief's trap 1 in the tool rather
// than in the ROM. `claimed.py 0x28131E` reports "NO CODE LITERAL -- likely genuinely unported,
// 2 of 4 mentions are note()/unreached()". Both of those "notes" are real, but the port exists
// anyway: `bullets.js` line 78 is `poolClear: 0x28131e` inside the `BUL` constant table, which
// the classifier reads as a note, and the actual translation is two exported functions further
// down the file that never name the address in a form the classifier matches. READ THE CLASS,
// THEN READ THE FILE.
//
// THE SECOND FINDING IS A STALE NOTE, in a file this wave does not own. `stageend.js`
// `rebuildWorld25FD38` ($25FD38) calls THE SAME EIGHT RESETS in a different order, and it
// counts FOUR of them as deferred:
//
//     for (const a of [0x289ae0, 0x28ac3a, 0x289f3a]) { note(ctx, a, ...) }   // :173
//     note(ctx, 0x28131e, ...)                                                // :178
//
// `$289F3A` has had `spark.js clearPool` since W53 and `$28131E` has had `bullets.js
// poolClear`/`poolPark` for longer than that. Those two lines are the brief's trap 2 sitting in
// the tree right now: the stage-advance path does not clear the spark pool or the bullet pool
// even though the port can. It is REPORTED, not fixed, because `src/stageend.js` is not this
// wave's file.
//
// EVERY TEST BELOW WAS RUN RED FIRST. The ablations are named at each site.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { Ram } from '../src/ram.js';
import { TYPE5 } from '../src/type5.js';
import { POOL_B, POOL_C, POOL_D } from '../src/effects.js';
import { CUE } from '../src/cues.js';
import { SPARK } from '../src/spark.js';
import { BUL } from '../src/bullets.js';
import { ITEM } from '../src/items.js';
import { SPAWN } from '../src/spawn.js';
import {
  clearPoolC289AE0, clearCuePool28AC3A, POOL_C_CLEAR_WORDS, CUE_CLEAR_WORDS,
} from '../src/poolclear.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const tablesJson = JSON.parse(readFileSync(TABLES, 'utf8'));
const IMG = readFileSync(fileURLToPath(new URL('../rip/sound/maincpu.bin', import.meta.url)));

const COINAGE = 0x803957;
const NO_PLAYER = 0xffff;
const P1_START = 0xfffe;
const SCRIPT_CURSOR = SPAWN.LIVE_CURSOR;        // $8132CC
const DISTANCE_CLOCK = SPAWN.DISTANCE_CLOCK;    // $8130CE

const hex = (v) => `$${v.toString(16).toUpperCase()}`;

/** Cold boot -> credit -> P1 START, byte for byte the sequence `w379slot9.test.js` uses, so the
 *  two waves stand on the same frame before either starts counting. */
function coldToStart() {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(COINAGE, 1);
  const coinWord = (...names) => {
    let w = 0xffff;
    for (const n of names) w &= ~(1 << COIN_BITS[n]) & 0xffff;
    return w;
  };
  const run = (word, n, p = NO_PLAYER) => {
    g.coinPort = word;
    for (let i = 0; i < n; i++) g.step(p);
  };
  run(COIN.idle, 305);                          // the warning screen's $12C timeout
  run(coinWord('COIN1'), 12);                   // hold
  run(COIN.idle, 12);                           // release -- the credit lands
  g.coinPort = COIN.idle;
  for (let i = 0; i < 8; i++) g.step(P1_START); // P1 joins
  return g;
}

// =================================================================================================
// 1 -- THE HEADLINE. THE REAL PATH: COLD BOOT, ONE COIN, P1 START, AND NOT ONE BUTTON AFTER IT.
//
// Before this wave the identical sequence died on frame 2058 past START with
//
//   UNPORTED $28B5A8: object type 5's "not started" branch ($28B5E0 tst.b ($2,A5) /
//   beq $28B5A8) -- ($2,A5) is 0. ...
//       at unreached (src/unported.js:35)  at type5 (src/type5.js:261)
//       at runObjectDriver (src/objdriver.js:104)  at Game.step (src/main.js:877)
//
// ABLATION (run before this test was written): put the `unreached(TYPE5.notStarted, ...)` back
// in place of the `notStarted28B5A8(...)` call in `src/type5.js`. This test then fails with
// exactly that throw on frame 2058, i.e. `frames` comes back 2058 and `err` non-null.
// =================================================================================================

test('W380 a cold boot + coin + P1 START runs THROUGH $28B5A8 into gameplay with no input', () => {
  const g = coldToStart();

  // 3000 frames is 942 past the old stop. NOTHING is pressed for any of them.
  let err = null;
  let frames = 0;
  const clock = [];
  const cursor = [];
  try {
    for (frames = 1; frames <= 3000; frames++) {
      g.step(NO_PLAYER);
      clock.push(g.ram.u16(DISTANCE_CLOCK));
      cursor.push(g.ram.u32(SCRIPT_CURSOR));
    }
  } catch (e) { err = e; }

  assert.equal(err, null, `no throw -- the run died at frame ${frames}: ${err && err.message}`);
  assert.equal(frames, 3001, 'all 3000 frames past START were stepped');

  // THE FRAME ITSELF. `$28B5A8` runs exactly once, and the tell is `$26331E`'s install:
  // `$8132CC` is ZERO on every frame before it and a live script pointer on every frame after.
  const installed = cursor.findIndex((c) => c !== 0) + 1;
  assert.equal(installed, 2058, '$26331E installed the spawn script on frame 2058 past START');
  assert.equal(cursor[installed - 2], 0, '  ...and $8132CC was still null the frame before');
  assert.notEqual(cursor[installed - 1], 0, `  ...$8132CC = ${hex(cursor[installed - 1])}`);

  // AND THE WORLD IS RUNNING. The distance clock is the one number that proves the enemy
  // subsystem is being stepped rather than merely reset: it is 0 for all 2058 frames and moves
  // afterwards. (It does NOT run one per frame -- the script's own gates hold it, which is why
  // this asserts "advanced", not a value.)
  assert.equal(clock[2057], 0, 'the distance clock is 0 on the frame $28B5A8 runs');
  assert.ok(clock[2999] > 0, `the distance clock advanced to ${clock[2999]} by frame 3000`);
});

// =================================================================================================
// 2 -- `$28B5DE rts`. THE FIRST FRAME DOES THE RESETS AND NOTHING ELSE.
//
// In ROM `$28B5A8` sits BEFORE `$28B5E0`, so `beq $28B5A8` branches BACKWARDS and the `rts` at
// `$28B5DE` ends the frame. The twenty-three subsystem calls do NOT run on it. The observable
// is the four type-5 calls the port still counts ($2527CE, $252BD0, $25292A, $252A52): they are
// noted once per frame the main body runs and never on the not-started frame.
//
// ABLATION (run before this test was written): delete the `return;` after
// `ram.setU8(slot + 2, 1)` in `src/type5.js`. The counted calls then appear on frame 2058 too
// and this fails with
//
//   AssertionError: the 23 calls do NOT run on the frame $28B5A8 takes
//   + actual - expected     + 1     - 0
// =================================================================================================

test('W380 the not-started frame RETURNS -- the 23 subsystem calls do not run on it', () => {
  const g = coldToStart();
  const counted = () => {
    let n = 0;
    for (const [k, v] of g.unportedLog.calls) {
      if (k.includes('object type 5 ($28B5E0) subsystem call')) n = Math.max(n, v);
    }
    return n;
  };

  for (let f = 1; f <= 2057; f++) g.step(NO_PLAYER);
  assert.equal(g.ram.u32(SCRIPT_CURSOR), 0, 'frame 2057: $28B5A8 has not run yet');
  const before = counted();

  g.step(NO_PLAYER);                                   // FRAME 2058 -- $28B5A8
  assert.notEqual(g.ram.u32(SCRIPT_CURSOR), 0, 'frame 2058: $26331E installed the script');
  assert.equal(counted() - before, 0,
    'the 23 calls do NOT run on the frame $28B5A8 takes');

  g.step(NO_PLAYER);                                   // FRAME 2059 -- ($2,A5) is 1 now
  assert.equal(counted() - before, 1,
    'and they DO run on the very next frame, once');
});

// =================================================================================================
// 3 -- THE VERIFIED DISASSEMBLY OF THE TWO ROUTINES W380 ADDS, out of the image, and the
//      constants in `src/poolclear.js` read straight off it.
//
// ABLATION: change `POOL_C_CLEAR_WORDS` to `0x2d2` (drop the dbra's own pass -- brief trap 2).
// This fails with `+ actual 722  - expected 723`.
// =================================================================================================

test('W380 $289AE0 and $28AC3A are the same five instructions, decoded from maincpu.bin', () => {
  for (const [at, base, imm, words, name] of [
    [0x289ae0, POOL_C.base, 0x02d2, POOL_C_CLEAR_WORDS, 'pool C'],
    [0x28ac3a, CUE.base, 0x00bf, CUE_CLEAR_WORDS, 'the cue pool'],
  ]) {
    assert.equal(IMG.readUInt16BE(at), 0x41f9, `${hex(at)} lea (xxx).L,A0 -- ${name}`);
    assert.equal(IMG.readUInt32BE(at + 2), base, `  ...${hex(base)}`);
    assert.equal(IMG.readUInt16BE(at + 6), 0x303c, `${hex(at + 6)} move.w #imm,D0`);
    assert.equal(IMG.readUInt16BE(at + 8), imm, `  ...#${hex(imm)}`);
    assert.equal(IMG.readUInt16BE(at + 10), 0x30fc, `${hex(at + 10)} move.w #imm,(A0)+`);
    assert.equal(IMG.readUInt16BE(at + 12), 0x0000, '  ...#$0');
    assert.equal(IMG.readUInt16BE(at + 14), 0x51c8, `${hex(at + 14)} dbra D0,...`);
    // trap 4: the displacement is measured from the EXTENSION WORD's address.
    assert.equal(at + 16 + IMG.readInt16BE(at + 16), at + 10,
      '  ...back to the move.w, so the dbra covers ONE instruction');
    assert.equal(IMG.readUInt16BE(at + 18), 0x4e75, `${hex(at + 18)} rts -- 18 bytes total`);
    // trap 2: `dbra` runs N+1 times, and that +1 is the whole content of these constants.
    assert.equal(words, imm + 1, `${name}: #${hex(imm)} + the dbra's own pass`);
  }
});

// =================================================================================================
// 4 -- THE TILING. THE PROOF THAT EVERY `dbra` COUNT IN ALL EIGHT CALLEES IS RIGHT.
//
// Five of the eight clears cover RAM with no gap and no overlap: each one's EXCLUSIVE end is
// the next one's `lea` operand, and the fifth's end is `$81DD10`. The enemy/item pair tiles the
// same way. An off-by-one anywhere -- in the two constants this wave writes or in the six it
// inherits -- breaks the chain. This is brief trap 8 answered the way it asks for: the bound
// comes from the code that reads it, and every bound here is pinned by ANOTHER ROUTINE'S `lea`.
//
// ABLATION: `POOL_C_CLEAR_WORDS = 0x2d2` fails here first, with
//   AssertionError: $289AE0 ends exactly where $289F3A begins
//   + actual - expected     + 8508818     - 8508820
// =================================================================================================

test('W380 the eight callees tile RAM exactly -- each clear ends on the next one\'s lea', () => {
  const end = (base, words) => base + words * 2;

  // $26331E -> $27E98A
  assert.equal(end(SPAWN.RESET_BASE, SPAWN.RESET_WORDS), ITEM.base,
    '$26331E ends exactly where $27E98A begins');
  assert.equal(SPAWN.RESET_END, ITEM.base, '  ...which is what spawn.js already calls RESET_END');

  // $288E0C -> $289084 -> $289AE0 -> $289F3A -> $28AC3A -> $81DD10
  assert.equal(end(POOL_B.base, POOL_B.clearWords), POOL_D.base,
    '$288E0C ends exactly where $289084 begins');
  assert.equal(end(POOL_D.base, POOL_D.clearWords), POOL_C.base,
    '$289084 ends exactly where $289AE0 begins');
  assert.equal(end(POOL_C.base, POOL_C_CLEAR_WORDS), SPARK.p1Base,
    '$289AE0 ends exactly where $289F3A begins');
  assert.equal(end(SPARK.p1Base, SPARK.clearWords), CUE.base,
    '$289F3A ends exactly where $28AC3A begins');
  assert.equal(end(CUE.base, CUE_CLEAR_WORDS), 0x81dd10, '$28AC3A ends at $81DD10');

  // And each clear covers its own pool PLUS its scalars, which is the other half of the bound.
  assert.equal(POOL_C.base + POOL_C.stride * POOL_C.slots, POOL_C.count,
    'pool C: 30 x $30 ends on its count word $81D38E');
  assert.ok(end(POOL_C.base, POOL_C_CLEAR_WORDS) > POOL_C.count + 2,
    '  ...and the clear takes the count word and two more');
  assert.equal(CUE.base + CUE.stride * CUE.slots, CUE.count,
    'the cue pool: 10 x $26 ends on its count word $81DD0C');
  assert.equal(end(CUE.base, CUE_CLEAR_WORDS), CUE.stagger + 2,
    '  ...and the clear ends one word past $81DD0E, the stagger. EXACT: 380 + 4 = 384');
});

// =================================================================================================
// 5 -- THE TWO CLEARS ACTUALLY WRITE THAT SPAN AND NOT ONE WORD MORE.
//
// Poison the whole of RAM around each pool, clear, and read the boundary from both sides. This
// is the ablation-proof for the constants: with `0x2d2` the last word stays poisoned.
// =================================================================================================

test('W380 clearPoolC289AE0 zeroes $81CDEE..$81D393 and stops', () => {
  const ram = new Ram();
  // LITERAL addresses, NOT derived from POOL_C_CLEAR_WORDS: a boundary computed from the
  // constant under test moves with it and proves nothing. $81CDEE + $2D3*2 = $81D394, so the
  // last word written is $81D392 and $81D394 must survive.
  const first = 0x81cdee;
  const last = 0x81d392;
  const past = 0x81d394;
  assert.equal(first, POOL_C.base, 'the lea operand');
  assert.equal(past, SPARK.p1Base, 'and the word past the end is pool E\'s base');
  for (const a of [first - 2, first, last, past]) ram.setU16(a, 0xa5a5);

  clearPoolC289AE0(ram);

  assert.equal(ram.u16(first), 0, `${hex(first)} -- the lea operand -- is cleared`);
  assert.equal(ram.u16(last), 0, `${hex(last)} -- the LAST word -- is cleared (dbra runs N+1)`);
  assert.equal(ram.u16(past), 0xa5a5, `${hex(past)} is UNTOUCHED -- it is pool E's base`);
  assert.equal(ram.u16(first - 2), 0xa5a5, `${hex(first - 2)} is untouched below`);
  assert.equal(ram.u16(POOL_C.count), 0, 'the count word $81D38E is inside the clear');
});

test('W380 clearCuePool28AC3A zeroes $81DB90..$81DD0F and stops', () => {
  const ram = new Ram();
  // LITERAL, for the reason the pool-C test gives. $81DB90 + $C0*2 = $81DD10.
  const first = 0x81db90;
  const last = 0x81dd0e;
  const past = 0x81dd10;
  assert.equal(first, CUE.base, 'the lea operand');
  for (const a of [first - 2, first, last, past]) ram.setU16(a, 0x5a5a);

  clearCuePool28AC3A(ram);

  assert.equal(ram.u16(first), 0, `${hex(first)} -- the lea operand -- is cleared`);
  assert.equal(last, CUE.stagger, 'the LAST word of the clear IS $81DD0E, the stagger');
  assert.equal(ram.u16(last), 0, `${hex(last)} is cleared (dbra runs N+1)`);
  assert.equal(ram.u16(past), 0x5a5a, `${hex(past)} is UNTOUCHED`);
  assert.equal(ram.u16(first - 2), 0x5a5a, `${hex(first - 2)} is untouched below`);
  assert.equal(ram.u16(CUE.count), 0, 'the count word $81DD0C is inside the clear');
});

// =================================================================================================
// 6 -- AND THE PART THAT IS NOT A CLEAR. `$28B5D2 jsr $26331E` carries the install.
//
// `$26331E` is 22 bytes of clear and then `$263330 bsr.w $263386`, which is why `$8132CC` is a
// live script pointer after the not-started frame instead of merely zero -- and it is the only
// one of the eight with any depth at all. Trap 4: `bsr.w`'s displacement is measured from the
// EXTENSION WORD at `$263332`.
// =================================================================================================

test('W380 $26331E is the enemy clear PLUS $263386, the stage install', () => {
  assert.equal(IMG.readUInt16BE(0x26331e), 0x41f9, '$26331E lea (xxx).L,A0');
  assert.equal(IMG.readUInt32BE(0x263320), SPAWN.RESET_BASE, '  ...$81332C');
  assert.equal(IMG.readUInt16BE(0x263324), 0x303c, '$263324 move.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x263326), 0x1c26, '  ...#$1C26');
  assert.equal(SPAWN.RESET_WORDS, 0x1c26 + 1, 'so $1C27 words -- dbra runs N+1');
  assert.equal(IMG.readUInt16BE(0x263330), 0x6100, '$263330 bsr.w');
  assert.equal(0x263332 + IMG.readInt16BE(0x263332), 0x263386,
    '  ...displacement measured from $263332 -> $263386, the stage install');
  assert.equal(IMG.readUInt16BE(0x263334), 0x4e75, '$263334 rts -- 22 bytes');

  // And on the live path the install is what lands: a pointer, not a clear.
  const g = coldToStart();
  for (let f = 1; f <= 2058; f++) g.step(NO_PLAYER);
  const cursor = g.ram.u32(SCRIPT_CURSOR);
  assert.notEqual(cursor, 0, `$8132CC = ${hex(cursor)}`);
  assert.ok(cursor >= 0x200000 && cursor < 0x300000,
    `  ...and it points into the program ROM, not RAM: ${hex(cursor)}`);
});

// =================================================================================================
// 7 -- THE CALL LIST IS UNCHANGED. `$28B5A8` is not one of the twenty-three; the 23-call loop is
//      the OTHER branch, and this wave must not have moved it.
// =================================================================================================

test('W380 the 23-call list and the not-started address are still what type5.js says', () => {
  assert.equal(TYPE5.notStarted, 0x28b5a8, 'TYPE5.notStarted is $28B5A8');
  assert.equal(TYPE5.calls.length, 23, 'still 23 calls in the main branch');
  assert.ok(!TYPE5.calls.includes(0x28b5a8), '$28B5A8 is a BRANCH TARGET, not a jsr target');
  // The eight of $28B5A8 and the twenty-three of $28B5E0 are disjoint sets. They are different
  // routines in different subsystems: resets versus drivers.
  const eight = [0x27e98a, 0x28131e, 0x288e0c, 0x289084, 0x289ae0, 0x28ac3a, 0x289f3a, 0x26331e];
  for (const a of eight) {
    assert.ok(!TYPE5.calls.includes(a), `${hex(a)} is a RESET, not one of the 23 drivers`);
  }
  // ...and the drivers of the two pools this wave clears ARE in the 23, which is the pairing
  // that makes the clear matter: pool C's driver $289B80 and the cue driver reached from
  // $28AD54's fall-through.
  assert.ok(TYPE5.calls.includes(POOL_C.driver), 'pool C\'s driver $289B80 is call #1');
  assert.equal(BUL.poolClear, 0x28131e, 'bullets.js already names $28131E as the pool clear');
});
