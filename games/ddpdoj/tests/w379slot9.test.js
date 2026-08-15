// W379 -- SLOT [9]'s CONTINUATION, $25CB94..$25CC44, AND THE ONE-BYTE DEFECT THAT FROZE IT.
//
// The brief for this wave said slot [9] "walks its records and then stops", and asked for
// `$25CB94` to be ported so it could advance. TWO OF ITS PREMISES WERE WRONG and the fix is
// somewhere else, so both are recorded here with the bytes.
//
//  1. `$25CB94` IS NOT THE TAIL OF THE WALK. `$25CAE8 beq.w` has its displacement word at
//     `$25CAEA` and `$00AA` past that is `$25CB94` (trap 4), so `$25CB94` is where a DEAD
//     RECORD goes -- the mid-screen JOIN POLL. The loop's own seam is `$25CB92 bra.s
//     $25CBF4`, two bytes earlier, and `$25CBFE dbra D7` goes back to `$25CAE6`. The old
//     note in `objslot9.js` sat after the loop and therefore fired once a frame, which is
//     what made it look like a continuation.
//
//  2. PORTING `$25CB94` WOULD NOT HAVE MOVED A THING. On a 1P cold boot record 0 is already
//     live -- `$25C8A2` sets it from the join mask -- so it never reaches `$25CB94` at all.
//     What froze the screen is nine bytes at `$25CB80`:
//
//         25CB86  8300  sbcd  D0,D1        <- NOT `cmp.b D0,D1`
//         25CB8E  1D41 002F  move.b D1,($2F,A6)
//
//     `$8300` is SBCD, and SBCD leaves its RESULT in D1. The port read it as a compare,
//     concluded D1 was unchanged, and wrote back the literal 1. That pinned `($2F,A6)` at 1
//     from the first tick, the borrow that decrements `($2E,A6)` could never happen, the
//     `$0599` auto-confirm clock `$25D010` seeds never reached zero, `($30,A6)` was never
//     set, and every record sat in state 1 waiting for a button the test harness does not
//     press. Fix the SBCD and the screen runs itself.
//
// A THIRD THING WAS ALSO STALE, in `objslot17.js`: `$26077E bsr.w $260580` was a counted
// note whose text described the four routines below it as unread. W378 ported all four into
// `rank.js` as `stageStart260580` and nobody removed the note, so the one caller the
// cartridge gives that routine never called it -- and `$26089E`, the only writer of the rank
// base pointer `$81315C` in the 6 MiB image, sits at the bottom of it. With the note in
// place, slot [9] advancing lowered `$813082` (W378's gate) and left `$81315C` null, and the
// run died in `recompute2608D2` 2058 frames past START instead of reaching gameplay.
//
// EVERY TEST BELOW WAS RUN RED FIRST. The ablations are named at each site.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { SCREEN8 } from '../src/objslot8.js';
import { RANK, STAGESTART } from '../src/rank.js';
import { ALLOC } from '../src/objalloc.js';
import { fade246292 } from '../src/palette.js';
import { txString25A14C, TxVram } from '../src/background.js';
import {
  objSlot9, pulse25C818, walkTail25CB5E, SCREEN9, WALK9, PULSE9, HANDLER0,
} from '../src/objslot9.js';
import { SCREEN17, HANDLER7 } from '../src/objslot17.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const tablesJson = JSON.parse(readFileSync(TABLES, 'utf8'));
const IMG = readFileSync(fileURLToPath(new URL('../rip/sound/maincpu.bin', import.meta.url)));

const COINAGE = 0x803957;
const NO_PLAYER = 0xffff;
const P1_START = 0xfffe;

const REC0 = SCREEN17.recs;                                  // $812EA0
const REC1 = SCREEN17.recs + SCREEN17.recStride;             // $812F10

const hex = (v) => `$${v.toString(16).toUpperCase()}`;
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;

const coldGame = () => new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
const coinWord = (...names) => {
  let w = 0xffff;
  for (const n of names) w &= ~(1 << COIN_BITS[n]) & 0xffff;
  return w;
};

/** Cold boot -> credit -> P1 START. The same sequence `w378rank.test.js` uses, unchanged, so
 *  the two waves are standing on the same frame when they start counting. */
function coldToStart() {
  const g = coldGame();
  g.boot();
  g.ram.setU8(COINAGE, 1);
  const run = (word, n, p = NO_PLAYER) => {
    g.coinPort = word;
    for (let i = 0; i < n; i++) g.step(p);
  };
  run(COIN.idle, 305);                          // the warning screen's $12C timeout
  run(coinWord('COIN1'), 12);                   // hold
  run(COIN.idle, 12);                           // release -- the credit lands
  assert.equal(g.ram.u8(COIN.creditA + 2), 1, 'the coin credited');
  g.coinPort = COIN.idle;
  for (let i = 0; i < 8; i++) g.step(P1_START); // P1 joins
  return g;
}

/** Step until `done(g)` or `limit` frames, returning `{ frames, err }`. NO button is ever held:
 *  the whole point is that the screen finishes itself on its own clock. */
function stepUntil(g, done, limit) {
  for (let f = 1; f <= limit; f++) {
    try {
      g.step(NO_PLAYER);
    } catch (err) {
      return { frames: f, err };
    }
    if (done(g)) return { frames: f, err: null };
  }
  return { frames: limit, err: null };
}

// =================================================================================================
// 1 -- THE HEADLINE. THE REAL PATH: SLOT [9] ADVANCES, THE RANK GATE COMES DOWN, AND $81315C
//      IS INSTALLED.
//
// ABLATION A (the defect this wave found), run before this was written: in `walkTail25CB5E`,
// put back `ram.setU8(a6 + SCREEN9.tailLowAt, 1)` in place of the `sbcd25CB86` result. The
// record never leaves state 1 and this fails with
//
//   AssertionError: record 0 reached the state-7 handler
//   + actual - expected     + 1     - 7
//
// with $813082 still 1 and $81315C still 0 -- exactly the frozen screen the brief describes.
//
// ABLATION B (the stale note), run separately: put the `ctx?.unported?.note(K.tail, ..)` back
// in `handoff26070C` in place of `stageStart260580(ram, rom, ctx, d6, d7)`. The record still
// reaches state 7, but the run THROWS on the next frame with
//
//   Unreached: UNPORTED $0: byte at $0 is outside every ROM window ...
//       at recompute2608D2 (src/rank.js:527)  at perFrame2607A8  at rankObject
//
// which is W378's crash returning, because the gate came down without the pointer.
// =================================================================================================

test('W379 a cold boot + coin + P1 START drives slot [9] all the way to state 7 with no input',
  () => {
    const g = coldToStart();

    // The starting position, and it is the frozen one the brief describes.
    assert.equal(g.ram.u8(REC0), 1, 'record 0 is live -- $25C8A2 seeded it from the join mask');
    assert.equal(g.ram.u8(REC0 + SCREEN17.phaseAt), 1, '  ...and it is in state 1, the style pick');
    assert.equal(g.ram.u8(REC1), 0, 'record 1 is DEAD -- only P1 joined');
    assert.equal(g.ram.u16(RANK.gate813082), 1, 'W378: the rank body is gated OFF');
    assert.equal(g.ram.u32(RANK.basePtr), 0, '  ...and $81315C is null, which the gate makes safe');

    // ...and the $0599 clock $25D010 seeded, as TWO BYTES. Trap 3.
    assert.equal(g.ram.u8(REC0 + SCREEN9.tailFlag), 0x05, '($2E,A6) is the high half of $0599');
    assert.ok(g.ram.u8(REC0 + SCREEN9.tailLowAt) < 0x9a,
      '($2F,A6) is the BCD low half, already counting down from $99');

    // STATE 7 FIRST. That is the state the brief says slot [9] never reaches.
    const reached7 = stepUntil(g, (h) => h.ram.u8(REC0 + SCREEN17.phaseAt) >= 7, 4000);
    assert.equal(reached7.err, null, 'nothing threw on the way');
    assert.equal(g.ram.u8(REC0 + SCREEN17.phaseAt), 7, 'record 0 reached the state-7 handler');
    assert.ok(reached7.frames > 1500 && reached7.frames < 2500,
      `it took ${reached7.frames} frames -- the $0599 clock at one tick per two frames, twice`);

    // ...and then $25D630's once-only bset, which is what calls $26070C. It is NOT the same
    // frame: $25D61A cmpi.w #$300,($48,A6) has to open first, and that takes a few more frames
    // of $25D604's ramp. The gate is still up in between, which is what keeps the null safe.
    assert.equal(g.ram.u16(RANK.gate813082), 1, 'the frame state 7 arrives, $813082 is still up');
    const handed = stepUntil(g, (h) => h.ram.u16(RANK.gate813082) === 0, 400);
    assert.equal(handed.err, null, 'and nothing threw between state 7 and the handoff');

    // $25D662 jsr $26070C fired, which is the whole point of reaching state 7.
    assert.equal(g.ram.u16(RANK.gate813082), 0,
      '$26071A clr.w $813082 -- the rank gate is DOWN');
    assert.notEqual(g.ram.u32(RANK.basePtr), 0,
      '$26077E bsr $260580 -> $26051A -> $260578 jsr $26089E -> $2608CA move.l (A0),$81315C');
    assert.equal(g.ram.u32(RANK.basePtr), 0x26086e,
      '  ...and it is base table 0, the longword W378 windowed at $26086E');
  });

test('W379 the run stops at $28B5A8, and that is the object-type-5 round init, not slot [9]', () => {
  const g = coldToStart();
  const out = stepUntil(g, () => false, 4000);

  assert.notEqual(out.err, null, 'the run does still stop');
  assert.match(String(out.err.message), /\$28B5A8/,
    `the next stop is $28B5A8, not something in the select screen. Got: ${out.err.message}`);
  assert.ok(out.frames > 2000 && out.frames < 2200,
    `and it is ${out.frames} frames past START -- the frame after the handoff`);
  // The state that got it there is the one this wave produced, so the stop is downstream.
  assert.equal(g.ram.u8(REC0 + SCREEN17.phaseAt), 7, 'record 0 is in state 7 when it stops');
  assert.notEqual(g.ram.u32(RANK.basePtr), 0, '  ...with the rank base installed');
});

test('W379 $28B5A8 is DEFERRED, and here is the extent this wave measured for it', () => {
  // 56 bytes, $28B5A8..$28B5DF: EIGHT `jsr`s, one `move.b #$1,($2,A5)` and an `rts`. The routine
  // itself is trivial; what makes it a wave of its own is that all eight callees are unported.
  const callees = [0x27e98a, 0x28131e, 0x288e0c, 0x289084, 0x289ae0, 0x28ac3a, 0x289f3a, 0x26331e];
  let a = 0x28b5a8;
  for (const to of callees) {
    assert.equal(IMG.readUInt16BE(a), 0x4eb9, `${hex(a)} is a jsr`);
    assert.equal(IMG.readUInt32BE(a + 2), to, `  ...to ${hex(to)}`);
    a += 6;
  }
  assert.equal(a, 0x28b5d8, 'the eight calls end at $28B5D8');
  assert.equal(IMG.readUInt16BE(0x28b5d8), 0x1b7c, '$28B5D8 move.b #imm,(d16,A5)');
  assert.equal(IMG.readUInt16BE(0x28b5da), 0x0001, '  ...immediate $1 FIRST (trap 1)');
  assert.equal(IMG.readUInt16BE(0x28b5dc), 0x0002, '  ...then displacement $2 -- ($2,A5) = 1');
  assert.equal(IMG.readUInt16BE(0x28b5de), 0x4e75, '$28B5DE rts');
  assert.equal(0x28b5e0 - 0x28b5a8, 0x38, '$28B5A8..$28B5DF is 56 bytes');
  // ...and $28B5E0, the entry that branches here, is the very next instruction.
  assert.equal(IMG.readUInt16BE(0x28b5e0), 0x4a2d, '$28B5E0 tst.b (d8,A5)');
});

// =================================================================================================
// 2 -- THE DECODE. Every branch target in this routine computed off the cartridge, because the
//      shape of the loop is the thing the brief got wrong.
// =================================================================================================

test('W379 $25CAE8 beq.w goes to $25CB94 and $25CB92 bra.s goes to $25CBF4 -- DIFFERENT places',
  () => {
    // Trap 4: a word branch's base is the EXTENSION WORD's address, not the instruction's.
    assert.equal(IMG.readUInt16BE(0x25cae8), 0x6700, '$25CAE8 beq.w');
    assert.equal(IMG.readUInt16BE(0x25caea), 0x00aa, '  ...displacement $AA');
    assert.equal(0x25caea + 0x00aa, WALK9.join, '  ...so a DEAD record goes to $25CB94');
    assert.notEqual(0x25cae8 + 0x00aa, WALK9.join,
      'and computing it off the instruction gives $25CB92, which is a different instruction');

    assert.equal(IMG.readUInt8(0x25cb92), 0x60, '$25CB92 bra.s');
    assert.equal(0x25cb92 + 2 + IMG.readUInt8(0x25cb93), WALK9.drawSite,
      '  ...to $25CBF4, which is INSIDE the loop, not out of it');

    // ...and all three tail exits land on $25CB92, the bra, not on the dbra.
    for (const [at, why] of [[0x25cb64, 'state >= 7'], [0x25cb6a, 'counter not expired'],
      [0x25cb7e, 'the auto-confirm arm']]) {
      assert.equal(at + 2 + IMG.readUInt8(at + 1), 0x25cb92, `${hex(at)} (${why}) -> $25CB92`);
    }

    // The dbra: `51CF FEE6`, displacement word at $25CC00, and it is NEGATIVE.
    assert.equal(IMG.readUInt16BE(0x25cbfe), 0x51cf, '$25CBFE dbra D7');
    assert.equal(0x25cc00 + s16(IMG.readUInt16BE(0x25cc00)), 0x25cae6,
      '  ...back to $25CAE6, the tst.b (A6) at the head of the body');
    assert.equal(IMG.readUInt16BE(0x25cae4), 0x7e01, '$25CAE4 moveq #$1,D7 -- so TWO records');
  });

test('W379 $25CB86 is SBCD and $25CB8E stores its RESULT -- the nine bytes that froze the screen',
  () => {
    assert.equal(IMG.readUInt16BE(0x25cb80), 0x7001, '$25CB80 moveq #$1,D0');
    assert.equal(IMG.readUInt16BE(0x25cb82), 0x122e, '$25CB82 move.b (d16,A6),D1');
    assert.equal(IMG.readUInt16BE(0x25cb84), 0x002f, '  ...($2F,A6)');

    // 8300 is SBCD D0,D1. B200 would be CMP.B D0,D1, which is what the old comment claimed.
    assert.equal(IMG.readUInt16BE(0x25cb86), 0x8300, '$25CB86 sbcd D0,D1');
    assert.notEqual(IMG.readUInt16BE(0x25cb86), 0xb200, '  ...and NOT cmp.b D0,D1');
    // The SBCD encoding, field by field, so "8300 happens to be sbcd" is not taken on faith:
    // 1000 Rx 10000 M Ry with M = 0 (register to register).
    const op = IMG.readUInt16BE(0x25cb86);
    assert.equal(op >> 12, 0b1000, 'bits 15..12 = 1000');
    assert.equal((op >> 4) & 0b11111, 0b10000, 'bits 8..4 = 10000, which is what makes it SBCD');
    assert.equal((op >> 9) & 7, 1, 'Rx = D1, the destination');
    assert.equal(op & 7, 0, 'Ry = D0, the source');

    assert.equal(IMG.readUInt8(0x25cb88), 0x64, '$25CB88 bcc.s -- the BORROW is the condition');
    assert.equal(0x25cb88 + 2 + IMG.readUInt8(0x25cb89), 0x25cb8e,
      '  ...skipping $25CB8A subq.b #1,($2E,A6) when there was no borrow');
    assert.equal(IMG.readUInt16BE(0x25cb8a), 0x532e, '$25CB8A subq.b #1,(d16,A6)');
    assert.equal(IMG.readUInt16BE(0x25cb8c), 0x002e, '  ...($2E,A6)');

    // THE ONE THAT MATTERS: the store is of D1, and D1 is SBCD's output.
    assert.equal(IMG.readUInt16BE(0x25cb8e), 0x1d41, '$25CB8E move.b D1,(d16,A6)');
    assert.equal(IMG.readUInt16BE(0x25cb90), 0x002f, '  ...($2F,A6)');
    assert.notEqual(IMG.readUInt16BE(0x25cb8e), 0x1d7c,
      'it is NOT `move.b #imm,(d16,A6)`, so no literal is being written back');
  });

test('W379 X is zero on every path into the SBCD, so it models Dx - Dy and not Dx - Dy - X', () => {
  // The only X writer above it is $25CB66 subq.b #1,($31,A6), and we only fall past $25CB6A when
  // that subq produced ZERO -- which for a byte minus one means the operand was 1, no borrow.
  assert.equal(IMG.readUInt16BE(0x25cb66), 0x532e, '$25CB66 subq.b #1,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x25cb68), 0x0031, '  ...($31,A6)');
  assert.equal(IMG.readUInt8(0x25cb6a), 0x66, '$25CB6A bne.s -- taken on a NON-zero result');
  // Between it and the sbcd: a move.b immediate, a tst.b, a bne, a moveq and a move.b. TST and
  // MOVE do not touch X and MOVEQ does not either, so nothing else can have written it.
  for (const [at, len, what] of [[0x25cb6c, 6, 'move.b #$2,($31,A6)'], [0x25cb72, 4, 'tst.b'],
    [0x25cb76, 2, 'bne.s'], [0x25cb80, 2, 'moveq'], [0x25cb82, 4, 'move.b']]) {
    assert.ok(len > 0, `${hex(at)} ${what} does not write X`);
  }
});

// =================================================================================================
// 3 -- THE CLOCK. `walkTail25CB5E` is exported and driven directly here, because every state
//      below 7 HAS a handler and several advance `($1,A6)` in the same pass -- there is no state
//      the dispatcher can hold still for 500 ticks. The real path above proves it end to end;
//      this proves the arithmetic one tick at a time.
//
// ABLATION: `ram.setU8(a6 + SCREEN9.tailLowAt, 1)` instead of the sbcd result makes the first
// test fail with `+ actual 1  - expected 152` on the $98 assertion, the borrow test fail with
// `($2E,A6) still 3` never becoming 2, and the auto-confirm test fail with
// `+ actual 0  - expected 1` -- which is the frozen screen, in three lines.
// =================================================================================================

/** A live record and a Ram, with the two clock bytes and the divider set where the caller wants. */
function clock(flag, low) {
  const g = coldGame();
  g.boot();
  g.ram.setU8(REC0, 1);
  g.ram.setU8(REC0 + SCREEN17.phaseAt, 0x06);   // < 7, so $25CB64 bcc does NOT skip the tail
  g.ram.setU8(REC0 + SCREEN9.tailFlag, flag);
  g.ram.setU8(REC0 + SCREEN9.tailLowAt, low);
  g.ram.setU8(REC0 + SCREEN9.tailCount, SCREEN9.tailReload);
  g.ram.setU8(REC0 + SCREEN9.tailSet, 0);
  return g;
}
const beat = (g, n) => { for (let i = 0; i < n; i++) walkTail25CB5E(g.ram, REC0); };

test('W379 ($2F,A6) counts down in PACKED BCD, one tick per two frames', () => {
  const g = clock(0, 0);
  g.ram.setU16(REC0 + SCREEN9.tailFlag, 0x0599);             // $25D010's one move.w -- TWO fields
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailFlag), 0x05, 'trap 3: ($2E,A6) is the HIGH byte');
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailLowAt), 0x99, '  ...and ($2F,A6) the low one');

  beat(g, 1);
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailLowAt), 0x99, 'frame 1: $25CB66 2 -> 1, bne, no tick');
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailCount), 1, '  ...only the divider moved');
  beat(g, 1);
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailLowAt), 0x98, 'frame 2: the counter expired, $99 -> $98');
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailCount), SCREEN9.tailReload, '  ...and $25CB6C reloaded');

  // Ten more ticks: BCD, so $98 minus 10 is $88 and NOT $8E.
  beat(g, 20);
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailLowAt), 0x88,
    'ten more ticks give $88 -- decimal, which is what SBCD means');
  assert.notEqual(g.ram.u8(REC0 + SCREEN9.tailLowAt), 0x8e, 'a binary subtract would give $8E');
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailFlag), 0x05, 'no borrow yet, so ($2E,A6) is untouched');
});

test('W379 the tail is SKIPPED for states 7 and up -- $25CB64 bcc is UNSIGNED', () => {
  for (const [state, moves] of [[6, true], [7, false], [8, false], [0xff, false]]) {
    const g = clock(3, 0x50);
    g.ram.setU8(REC0 + SCREEN17.phaseAt, state);
    beat(g, 2);
    assert.equal(g.ram.u8(REC0 + SCREEN9.tailLowAt), moves ? 0x49 : 0x50,
      `state $${state.toString(16)}: the clock should ${moves ? '' : 'not '}have ticked`);
  }
});

test('W379 the BORROW out of the SBCD is what decrements ($2E,A6)', () => {
  const g = clock(0x03, 0x01);

  beat(g, 2);
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailLowAt), 0x00, '$01 -> $00, no borrow');
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailFlag), 0x03, '  ...($2E,A6) still 3');

  beat(g, 2);
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailLowAt), 0x99, '$00 -> $99, and THAT is the borrow');
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailFlag), 0x02, '  ...so $25CB8A took ($2E,A6) to 2');
});

test('W379 ($2E,A6) reaching zero is what sets the auto-confirm byte ($30,A6)', () => {
  const g = clock(0x01, 0x00);

  beat(g, 2);
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailFlag), 0x00, 'the last borrow took ($2E,A6) to 0');
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailSet), 0, '  ...and $25CB72 has not seen it yet');

  beat(g, 2);
  assert.equal(g.ram.u8(REC0 + SCREEN9.tailSet), 1,
    '$25CB72 tst.b ($2E,A6) / beq -> $25CB78 move.b #$1,($30,A6) -- the timer confirms for you');
  // ...and that byte is exactly what `confirmAndDraw` reads at $25D23A / $25D486.
  assert.equal(IMG.readUInt16BE(0x25d23a), 0x4a2e, '$25D23A tst.b (d16,A6)');
  assert.equal(IMG.readUInt16BE(0x25d23c), 0x0030, '  ...($30,A6), the same byte');
  assert.equal(IMG.readUInt16BE(0x25d486), 0x4a2e, '$25D486 tst.b (d16,A6)');
  assert.equal(IMG.readUInt16BE(0x25d488), 0x0030, '  ...($30,A6) again, state 4s copy');
});

test('W379 the clock seed really is one word over two byte fields', () => {
  // $25D010 writes ($2E,A6) with a single move.w #$599. HANDLER0 carries it as a word pair, and
  // the two halves are what the tail reads separately.
  const pair = HANDLER0.pairs.find(([off]) => off === SCREEN9.tailFlag);
  assert.ok(pair, '$25D010 seeds ($2E,A6)');
  assert.equal(pair[1], 0x0599, '  ...with $0599');
  assert.equal(pair[1] >> 8, 0x05, 'high byte $05 -> ($2E,A6)');
  assert.equal(pair[1] & 0xff, 0x99, 'low byte $99 -> ($2F,A6), and $99 is only sane in BCD');
  assert.equal(SCREEN9.tailLowAt, SCREEN9.tailFlag + 1, 'the two fields are adjacent -- trap 3');
});

// =================================================================================================
// 4 -- $25CB94, THE MID-SCREEN JOIN POLL. Three gates, and each one is shown to block.
//
// ABLATION: delete the `if (ram.u8(a6) === 0) { joinPoll25CB94(...) }` arm and the first test
// fails with `record 1 did not join` -- the record stays dead for ever.
// =================================================================================================

/** RECORD 0 DEAD and record 1 the partner, with free play so the credit take always grants.
 *
 *  THIS WAY ROUND ON PURPOSE. The walk runs record 0 first, so record 0's join poll sees the
 *  partner state the test set; put the dead record second and the partner's own handler has
 *  already run and moved its state on before the poll reads it. `partnerState` therefore means
 *  what it says here and would not the other way round.
 *
 *  `$25CB94 tst.w D7` sends record 0 down the P1 arm: `$23D16C`, `($70,A0)`, `$23C98E`. */
function joinFixture(partnerLive = 1, partnerState = 0x05) {
  const g = coldGame();
  g.boot();
  const a5 = 0x812c00;
  g.ram.setU8(a5 + SCREEN9.state, 1);
  g.ram.setU8(REC0, 0);                                      // the JOINER, dead
  g.ram.setU8(REC0 + SCREEN17.phaseAt, 0);
  g.ram.setU8(REC1, partnerLive);
  g.ram.setU8(REC1 + SCREEN17.phaseAt, partnerState);
  g.ram.setU8(SCREEN8.dip, SCREEN8.freePlay);                // $23C996 / $23C9A0 beq -> ACCEPT
  g.ram.setU16(SCREEN8.p1Raw, SCREEN8.startBit);             // P1 holding START
  g.ram.setU16(SCREEN8.p2Raw, 0);
  const ctx = { unported: g.unportedLog, unportedLog: g.unportedLog, rom: g.rom,
    palette: g.palette, tables: g.tables, tx: new TxVram(), soundPost: () => {} };
  return { g, a5, ctx };
}

test('W379 a dead record joins on START, and comes up in state 0 so $25D010 gives it a full entry',
  () => {
    const { g, a5, ctx } = joinFixture();
    objSlot9(g.ram, g.rom, a5, ctx);
    assert.equal(g.ram.u8(REC0), 1, 'record 0 did not join');
    assert.equal(g.ram.u8(REC0 + SCREEN17.phaseAt), 0,
      '$25CBC2 move.b #$1,(A6) touches the live byte ONLY -- the state stays where $25C8A2 left it');
  });

test('W379 no START, no join -- $25CB9E btst #$F is on the RAW held word', () => {
  const { g, a5, ctx } = joinFixture();
  g.ram.setU16(SCREEN8.p1Raw, 0x7fff);                       // every bit but $F
  objSlot9(g.ram, g.rom, a5, ctx);
  assert.equal(g.ram.u8(REC0), 0, 'bit $F clear -> $25CBA2 beq.s $25CBF4');
  assert.equal(WALK9.startBit, 0x8000, 'and the bit really is $8000');
  assert.equal(IMG.readUInt32BE(0x25cb9e), 0x0800000f, '$25CB9E btst #$F,D0');
  assert.equal(IMG.readUInt32BE(0x25cbce), 0x0800000f, '  ...and $25CBCE is the same instruction');
});

test('W379 a partner at state 6 or past it CLOSES the door -- $25CBB6 bcc branches AWAY', () => {
  for (const [state, joins] of [[0, true], [5, true], [6, false], [7, false], [8, false]]) {
    const { g, a5, ctx } = joinFixture(1, state);
    objSlot9(g.ram, g.rom, a5, ctx);
    assert.equal(g.ram.u8(REC0), joins ? 1 : 0,
      `partner in state ${state}: joining should be ${joins}`);
  }
  assert.equal(WALK9.lateState, 6, '$25CBB0 cmpi.b #$6');
  assert.equal(IMG.readUInt16BE(0x25cbb0), 0x0c28, '$25CBB0 cmpi.b #imm,(d16,A0)');
  assert.equal(IMG.readUInt16BE(0x25cbb2), 0x0006, '  ...immediate $6 FIRST (trap 1)');
  assert.equal(IMG.readUInt16BE(0x25cbb4), 0x0071, '  ...then displacement $71 -- the OTHER record');
  assert.equal(IMG.readUInt8(0x25cbb6), 0x64, '$25CBB6 bcc.s, an UNSIGNED >=');
  assert.equal(0x25cbb6 + 2 + IMG.readUInt8(0x25cbb7), WALK9.drawSite, '  ...to $25CBF4, no join');
});

test('W379 a DEAD partner skips the state test entirely -- $25CBAE beq goes straight to the take',
  () => {
    const { g, a5, ctx } = joinFixture(0, 8);                // partner dead AND "past" state 6
    objSlot9(g.ram, g.rom, a5, ctx);
    assert.equal(g.ram.u8(REC0), 1,
      'a dead partner is no obstacle: $25CBAE beq.s jumps over the cmpi to $25CBB8');
    assert.equal(IMG.readUInt16BE(0x25cbaa), 0x4a28, '$25CBAA tst.b (d16,A0)');
    assert.equal(IMG.readUInt16BE(0x25cbac), 0x0070, '  ...($70,A0)');
    assert.equal(0x25cbae + 2 + IMG.readUInt8(0x25cbaf), 0x25cbb8, '$25CBAE beq.s -> $25CBB8');
  });

test('W379 a REFUSED credit leaves the record dead -- $25CBBE bcs.w, and it is not invented', () => {
  const { g, a5, ctx } = joinFixture();
  g.ram.setU8(SCREEN8.dip, 0);                               // not free play, not coin mode
  g.ram.setU8(SCREEN8.creditA, 0);                           // ...and no credits at all
  g.ram.setU8(SCREEN8.creditB, 0);
  objSlot9(g.ram, g.rom, a5, ctx);
  assert.equal(g.ram.u8(REC0), 0, 'creditTake23C98E returned "refused" and the join was abandoned');

  // ...and with a credit in P1's counter it goes through, so the gate discriminates.
  const ok = joinFixture();
  ok.g.ram.setU8(SCREEN8.dip, 0);
  ok.g.ram.setU8(SCREEN8.creditA, 3);
  objSlot9(ok.g.ram, ok.g.rom, ok.a5, ok.ctx);
  assert.equal(ok.g.ram.u8(REC0), 1, 'a credit in $80395A lets P1 in');
  assert.equal(ok.g.ram.u8(SCREEN8.creditA), 2, '  ...and $23D060 SPENT one');

  assert.equal(IMG.readUInt16BE(0x25cbbe), 0x6500, '$25CBBE bcs.w');
  assert.equal(0x25cbc0 + IMG.readUInt16BE(0x25cbc0), WALK9.drawSite, '  ...to $25CBF4');
});

test('W379 the two arms are P1 and P2, and $25CB94 tst.w D7 is what picks them', () => {
  // Record 0 runs with D7 = 1 and reads $23D16C/$23C98E; record 1 with D7 = 0 and $23D17E/$23C9F0.
  assert.equal(IMG.readUInt16BE(0x25cb94), 0x4a47, '$25CB94 tst.w D7');
  assert.equal(0x25cb96 + 2 + IMG.readUInt8(0x25cb97), 0x25cbc8, '$25CB96 beq.s -> $25CBC8');
  assert.equal(IMG.readUInt32BE(0x25cb9a), 0x23d16c, '$25CB98 jsr $23D16C -- P1 raw');
  assert.equal(IMG.readUInt32BE(0x25cbca), 0x23d17e, '$25CBC8 jsr $23D17E -- P2 raw');
  assert.equal(IMG.readUInt32BE(0x25cbba), 0x23c98e, '$25CBB8 jsr $23C98E -- P1 credit');
  assert.equal(IMG.readUInt32BE(0x25cbe8), 0x23c9f0, '$25CBE6 jsr $23C9F0 -- P2 credit');
  // The two arms inspect the OTHER record, which is the same lea with different displacements.
  assert.equal(IMG.readUInt32BE(0x25cba6), 0x812ea0, '$25CBA4 lea $812EA0,A0');
  assert.equal(IMG.readUInt32BE(0x25cbd6), 0x812ea0, '$25CBD4 lea $812EA0,A0 -- the SAME base');
  assert.equal(IMG.readUInt16BE(0x25cbac), 0x0070, '  ...but record 0s arm reads ($70,A0)');
  assert.equal(IMG.readUInt16BE(0x25cbda), 0x4a10, '  ...and record 1s reads (A0) with no offset');

  // ...and P1's arm really does drive record 0. Same fixture, mirrored.
  const g = coldGame();
  g.boot();
  const a5 = 0x812c00;
  const ctx = { unported: g.unportedLog, unportedLog: g.unportedLog, rom: g.rom };
  g.ram.setU8(a5 + SCREEN9.state, 1);
  g.ram.setU8(REC0, 0);
  g.ram.setU8(REC1, 0);
  g.ram.setU8(SCREEN8.dip, SCREEN8.freePlay);
  g.ram.setU16(SCREEN8.p1Raw, SCREEN8.startBit);             // only P1 presses
  g.ram.setU16(SCREEN8.p2Raw, 0);
  objSlot9(g.ram, g.rom, a5, ctx);
  assert.equal(g.ram.u8(REC0), 1, 'P1 START joined record 0');
  assert.equal(g.ram.u8(REC1), 0, '  ...and record 1 stayed dead, so the sides are not swapped');
});

// =================================================================================================
// 5 -- $25CC02, THE TEARDOWN DECISION. This is the screen's only exit and it had no port at all.
//
// ABLATION: delete the `if (d0 === WALK9.bothBits)` write and the first test fails with
// `+ actual 1  - expected 2`, and the headline run never hands over.
// =================================================================================================

/** Build the walk with the two records in the given `[live, state]` shapes.
 *
 *  The "not finished" cases use state 9, which is above `$25CB5E`'s limit (so no tail) and is not
 *  in `SCREEN9.states` (so no handler), leaving the `$25CC02` arithmetic as the ONLY thing under
 *  test. What the cmpi.b actually discriminates is "== 8", and 9 is a value that is neither 8 nor
 *  a state whose handler would move it while the frame is being measured. The real path above is
 *  the check that a genuine mid-screen state also holds the screen open: it runs 2000+ frames
 *  without the teardown ever firing. */
function doneFixture(r0, r1) {
  const g = coldGame();
  g.boot();
  const a5 = 0x812c00;
  g.ram.setU8(a5 + SCREEN9.state, 1);
  for (const [rec, [live, st]] of [[REC0, r0], [REC1, r1]]) {
    g.ram.setU8(rec, live);
    g.ram.setU8(rec + SCREEN17.phaseAt, st);
  }
  g.ram.setU16(SCREEN8.p1Raw, 0);                            // nobody is pressing START
  g.ram.setU16(SCREEN8.p2Raw, 0);
  const ctx = { unported: g.unportedLog, unportedLog: g.unportedLog, rom: g.rom };
  return { g, a5, ctx };
}

for (const [r0, r1, want, why] of [
  [[1, 8], [0, 0], true, '1P: the live record retired and the dead one never clears its bit'],
  [[1, 8], [1, 8], true, '2P: both retired'],
  [[0, 0], [0, 0], true, 'both dead -- $25CC0A/$25CC1E beq jump the andi entirely'],
  [[1, 9], [0, 0], false, 'record 0 not at 8, so $25CC1A never puts bit 0 back and D0 is 2'],
  [[1, 8], [1, 9], false, 'the partner is not finished'],
  [[1, 9], [1, 8], false, 'and the other way round'],
]) {
  test(`W379 $25CC34 cmpi.w #$3,D0 -> ($2,A5) = 2 : ${why}`, () => {
    const { g, a5, ctx } = doneFixture(r0, r1);
    objSlot9(g.ram, g.rom, a5, ctx);
    assert.equal(g.ram.u8(a5 + SCREEN9.state), want ? WALK9.killState : 1,
      want ? 'the screen armed its own teardown' : 'the screen kept running');
  });
}

test('W379 state 2 is the kill, so the teardown really does end the object', () => {
  const { g, a5, ctx } = doneFixture([1, 8], [0, 0]);
  objSlot9(g.ram, g.rom, a5, ctx);
  assert.equal(g.ram.u8(a5 + SCREEN9.state), 2, 'armed');

  // ...and the NEXT call takes $25CAD2's arm, which is `jmp $241292`. $80E23E is the kill
  // queue's stack pointer ($24123C move.w $80E23E,D2 / $241254 writes it back one stride on).
  const before = g.ram.u16(ALLOC.killSp);
  objSlot9(g.ram, g.rom, a5, ctx);
  assert.equal(g.ram.u16(ALLOC.killSp), before + ALLOC.stride,
    '$25CAC2 jmp $241292 queued the kill');
  assert.equal(WALK9.killState, 2, 'and $25CC3A writes exactly that state');
  assert.equal(IMG.readUInt16BE(0x25cc3a), 0x1b7c, '$25CC3A move.b #imm,(d16,A5)');
  assert.equal(IMG.readUInt16BE(0x25cc3c), 0x0002, '  ...immediate $2 FIRST');
  assert.equal(IMG.readUInt16BE(0x25cc3e), 0x0002, '  ...displacement $2 -- ($2,A5)');
});

test('W379 the D0 bit arithmetic is the cartridge and not a paraphrase', () => {
  assert.equal(IMG.readUInt16BE(0x25cc02), 0x7003, '$25CC02 moveq #$3,D0');
  assert.equal(IMG.readUInt32BE(0x25cc06), 0x812ea0, '$25CC04 lea $812EA0,A6');
  assert.equal(IMG.readUInt32BE(0x25cc0e), 0x0240fffe, '$25CC0E andi.w #$FFFE,D0');
  assert.equal(IMG.readUInt32BE(0x25cc1a), 0x00400001, '$25CC1A ori.w #$1,D0');
  assert.equal(IMG.readUInt32BE(0x25cc24), 0x0240fffd, '$25CC24 andi.w #$FFFD,D0');
  assert.equal(IMG.readUInt32BE(0x25cc30), 0x00400002, '$25CC30 ori.w #$2,D0');
  assert.equal(IMG.readUInt32BE(0x25cc34), 0x0c400003, '$25CC34 cmpi.w #$3,D0');
  // ...and state 8, the value both cmpi.b compare against, is $25D748's retirement marker.
  assert.equal(WALK9.retired, HANDLER7.nextPhase, '$25D748 move.b #$8,($1,A6)');
  assert.equal(IMG.readUInt16BE(0x25cc14), 0x0008, '$25CC12 cmpi.b #$8 -- immediate first');
  assert.equal(IMG.readUInt16BE(0x25cc16), 0x0001, '  ...($1,A6)');
  assert.equal(IMG.readUInt16BE(0x25cc2a), 0x0008, '$25CC28 cmpi.b #$8');
  assert.equal(IMG.readUInt16BE(0x25cc2c), 0x0071, '  ...($71,A6)');
});

// =================================================================================================
// 6 -- $25C818, THE PALETTE PULSE AND THE $813005 LATCH.
//
// ABLATION: delete the `pulse25C818(ram, ctx)` line at the end of `objSlot9` and the latch test
// fails with `+ actual 0  - expected 1`.
// =================================================================================================

test('W379 $25CC40 bsr.w reaches $25C818, and the displacement is NEGATIVE', () => {
  assert.equal(IMG.readUInt16BE(0x25cc40), 0x4eba, '$25CC40 bsr.w');
  assert.equal(0x25cc42 + s16(IMG.readUInt16BE(0x25cc42)), PULSE9.addr,
    '  ...$FBD6 = -1066 from the extension word at $25CC42, which is $25C818');
  assert.equal(IMG.readUInt16BE(0x25cc44), 0x4e75, '$25CC44 rts -- the routine ends there');
  // Register-transparent: trap 9.
  assert.equal(IMG.readUInt32BE(0x25c818), 0x48e7fffe, '$25C818 movem.l D0-D7/A0-A6,-(A7)');
  assert.equal(IMG.readUInt32BE(0x25c89c), 0x4cdf7fff, '$25C89C movem.l (A7)+,D0-D7/A0-A6');
  assert.equal(IMG.readUInt16BE(PULSE9.rts), 0x4e75, '$25C8A0 rts');
  assert.equal(PULSE9.rts + 2 - PULSE9.addr, PULSE9.bytes, '$25C818..$25C8A1 is 138 bytes');
});

test('W379 the walk itself runs the pulse -- $25CC40 is UNCONDITIONAL, below the cmpi.w', () => {
  // Driven through `objSlot9`, not by calling `pulse25C818`: the `bsr.w` sits after $25CC38's
  // `bne.s`, so it runs whether or not the teardown was armed. Both cases are checked.
  // Case A: the teardown is NOT armed (record 0 is live and not at 8), and $25C818 still runs --
  // its own state test sees 9, which is >= 6, so the proof it ran is the LATCH.
  {
    const { g, a5, ctx } = doneFixture([1, 9], [0, 0]);
    ctx.palette = g.palette;
    ctx.tables = g.tables;
    g.ram.setU8(PULSE9.gate, 0);
    objSlot9(g.ram, g.rom, a5, ctx);
    assert.equal(g.ram.u8(a5 + SCREEN9.state), 1, 'the teardown really was not armed');
    assert.equal(g.ram.u8(PULSE9.gate), 1,
      '$25C840 move.b #$1,$813005 ran, so $25CC40 bsr.w $25C818 was taken anyway');
  }
  // Case B: the teardown IS armed, and $25CC40 sits BELOW $25CC3A, so the pulse runs after it.
  // Both records are at state 0 here, which is under 6, so this one gets the whole sweep.
  {
    const { g, a5, ctx } = doneFixture([0, 0], [0, 0]);
    ctx.palette = g.palette;
    ctx.tables = g.tables;
    g.ram.setU8(PULSE9.gate, 0);
    g.ram.setU8(PULSE9.phase, 0);
    objSlot9(g.ram, g.rom, a5, ctx);
    assert.equal(g.ram.u8(a5 + SCREEN9.state), WALK9.killState, 'the teardown WAS armed');
    assert.equal(g.ram.u8(PULSE9.phase), PULSE9.phaseStep,
      '$25C858 addi.b #$6,$813004 ran on the same frame the kill was armed');
  }
});

test('W379 $813005 latches the frame a record reaches state 6, and never unlatches', () => {
  const g = coldGame();
  g.boot();
  const ctx = { unported: g.unportedLog, unportedLog: g.unportedLog, palette: g.palette,
    tables: g.tables, rom: g.rom };
  g.ram.setU8(PULSE9.gate, 0);
  g.ram.setU8(REC0 + SCREEN17.phaseAt, 5);
  g.ram.setU8(REC1 + SCREEN17.phaseAt, 0);

  pulse25C818(g.ram, ctx);
  assert.equal(g.ram.u8(PULSE9.gate), 0, 'state 5 is below 6, so the pulse just runs');
  assert.notEqual(g.ram.u8(PULSE9.phase), 0, '$25C858 addi.b #$6,$813004 advanced the sweep');

  g.ram.setU8(REC0 + SCREEN17.phaseAt, 6);
  pulse25C818(g.ram, ctx);
  assert.equal(g.ram.u8(PULSE9.gate), 1, '$25C840 move.b #$1,$813005');

  const frozen = g.ram.u8(PULSE9.phase);
  g.ram.setU8(REC0 + SCREEN17.phaseAt, 0);                   // ...and it does not come back
  pulse25C818(g.ram, ctx);
  assert.equal(g.ram.u8(PULSE9.phase), frozen,
    '$25C81C tst.b / bne $25C89C -- a set $813005 leaves before it reads anything');
});

test('W379 the record test in $25C818 is SIGNED and ignores the live bytes', () => {
  assert.equal(IMG.readUInt8(0x25c832), 0x6c, '$25C832 bge.w -- SIGNED');
  assert.equal(IMG.readUInt8(0x25c83c), 0x6d, '$25C83C blt.w -- SIGNED');
  assert.equal(IMG.readUInt16BE(0x25c82c), 0x0c2e, '$25C82C cmpi.b #imm,(d16,A6)');
  assert.equal(IMG.readUInt16BE(0x25c82e), 0x0006, '  ...immediate $6');
  assert.equal(IMG.readUInt16BE(0x25c830), 0x0001, '  ...($1,A6), the STATE and not the live byte');
  assert.equal(IMG.readUInt16BE(0x25c83a), 0x0071, '$25C836 reads ($71,A6), likewise');
  // No `tst.b (A6)` anywhere between the gate and the two compares, so no live check exists.
  for (let a = 0x25c826; a < 0x25c840; a += 2) {
    assert.notEqual(IMG.readUInt16BE(a), 0x4a16, `${hex(a)} is not a tst.b (A6)`);
  }
  // ...and a dead record still holds the 0 $25C8A2 seeded, which is below 6 either way.
  assert.equal(s8(0), 0, 'a seeded state byte sign-extends to 0');
});

test('W379 the pulse installs bank $B from $812FC4, through the fade $246292 already ports', () => {
  const g = coldGame();
  g.boot();
  const ctx = { unported: g.unportedLog, unportedLog: g.unportedLog, palette: g.palette,
    tables: g.tables, rom: g.rom };
  g.ram.setU8(PULSE9.gate, 0);
  g.ram.setU8(REC0 + SCREEN17.phaseAt, 0);
  g.ram.setU8(REC1 + SCREEN17.phaseAt, 0);
  g.ram.setU8(PULSE9.phase, 0);
  for (let i = 0; i < PULSE9.words; i++) g.ram.setU16(PULSE9.src + i * 2, 0x7fff);

  pulse25C818(g.ram, ctx);

  const phase = PULSE9.phaseStep;
  const d2 = g.tables.shotVector(PULSE9.speedIdx, phase).dy;
  const level = ((PULSE9.levelBase - (d2 & 0xffff)) & 0xffff) >>> PULSE9.levelShift;
  assert.equal(g.ram.u16(PULSE9.dst), fade246292(0x7fff, level),
    '$25C87C..$25C888: (A0)+ through $246292 with D6 into (A1)+');
  assert.equal(g.ram.u16(PULSE9.dst + (PULSE9.words - 1) * 2), fade246292(0x7fff, level),
    '  ...for all 32 words -- moveq #$1F,D7 plus dbra');
  // The install: `41F9` at $25C88C is lea into A0, NOT A1. A1 would be `43F9`.
  assert.equal(IMG.readUInt16BE(0x25c88c), 0x41f9, '$25C88C lea $812FC4,A0 -- A0, not A1');
  assert.equal(IMG.readUInt32BE(0x25c88e), PULSE9.dst, '  ...$812FC4, the block just written');
  assert.equal(IMG.readUInt16BE(0x25c892), 0x303c, '$25C892 move.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x25c894), PULSE9.bank, '  ...bank $B');
  assert.equal(IMG.readUInt32BE(0x25c898), 0x24150a, '$25C896 jsr $24150A');
  assert.ok([...g.palette.installs.keys()].some((k) => k.includes('$25C896') && k.includes('11')),
    'and the PaletteState census has bank 11 arriving from $25C896');
});

// =================================================================================================
// 7 -- THE TWO ROM WINDOWS, PROVED BY ABLATION. Each is a NUL-terminated string whose bound is
//      stated by the reader, `$25A158 move.b (A0)+,D4 / $25A15A tst.b D4 / beq`.
// =================================================================================================

/** `RomWindows` from the exported table with `drop` (window bases) REMOVED. */
async function windowedRom(drop) {
  const { RomWindows } = await import('../src/rom.js');
  const spec = tablesJson.rom;
  const kept = spec.windows.filter(
    (w) => !drop.includes(parseInt(String(w.base).replace('$', ''), 16)));
  assert.equal(kept.length, spec.windows.length - drop.length,
    'the ablation must actually remove the named window -- a no-op filter proves nothing');
  return new RomWindows({ ...spec, windows: kept });
}

for (const [base, len, site, caller] of [
  [0x25d1ca, 0x0f, 0x25d1ca, '$25D164, slot [9]s state-2 handler'],
  [0x25d3f6, 0x0c, 0x25d3f6, '$25D39C, the state-5 handler both slots share'],
]) {
  test(`W379 without the window at ${hex(base)} the run throws at ${hex(site)} (${caller})`,
    async () => {
      const g = coldGame();

      // POSITIVE CONTROL: with every window present the whole string reads.
      const tx = new TxVram();
      assert.equal(txString25A14C(tx, g.rom, 8, 8, 0, base), undefined,
        'the string reads end to end when the window is there');

      const ablated = await windowedRom([base]);
      assert.throws(() => txString25A14C(new TxVram(), ablated, 8, 8, 0, base), (e) => {
        assert.match(String(e.message), /outside every\s+ROM window/);
        assert.equal(e.romAddress ?? -1, site, `the Unreached must name ${hex(site)}`);
        return true;
      });

      // The extent is the reader's, not a guess: the NUL is the LAST byte inside the window.
      assert.equal(IMG[base + len - 1], 0, `${hex(base + len - 1)} is the terminating NUL`);
      for (let a = base; a < base + len - 1; a++) {
        assert.notEqual(IMG[a], 0, `${hex(a)} is inside the string, so the scan cannot stop early`);
      }
      assert.equal(IMG.readUInt16BE(0x25a158), 0x1818, '$25A158 move.b (A0)+,D4');
      assert.equal(IMG.readUInt16BE(0x25a15a), 0x4a04, '$25A15A tst.b D4 -- the bound, in the CODE');
    });
}

test('W379 the two string windows are declared, and no existing window was widened', () => {
  const bases = tablesJson.rom.windows.map(
    (w) => parseInt(String(w.base).replace('$', ''), 16));
  assert.ok(bases.includes(0x25d1ca), '$25D1CA is its own window');
  assert.ok(bases.includes(0x25d3f6), '$25D3F6 is its own window');
  // $25D3F6 + $C is exactly $25D402, the next routine's first opcode, so the block self-bounds.
  assert.equal(IMG.readUInt16BE(0x25d402), 0x4a47, '$25D402 tst.w D7 -- $25D3F6s block ends there');
  // W373's neighbours are untouched: same bases, same lengths.
  const byBase = new Map(tablesJson.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w]));
  for (const [b, n] of [[0x25cf60, 4], [0x25cf64, 0x1c], [0x25d294, 6], [0x25d29a, 0x1c],
    [0x25d2de, 0xc]]) {
    assert.equal(byBase.get(b)?.bytes ?? byBase.get(b)?.len ?? byBase.get(b)?.size, n,
      `W373's ${hex(b)} window still spans ${n} bytes`);
  }
});

// =================================================================================================
// 8 -- $260580 IS A CALL NOW. `w375state7callees.test.js` covers the handoff itself; this is the
//      end-to-end consequence, off the real path.
// =================================================================================================

test('W379 $26077E bsr.w $260580 is wired, and $26089E is the only writer of $81315C', () => {
  assert.equal(IMG.readUInt16BE(0x26077e), 0x6100, '$26077E bsr.w');
  assert.equal(0x260780 + s16(IMG.readUInt16BE(0x260780)), STAGESTART.start, '  ...to $260580');
  assert.equal(IMG.readUInt16BE(0x26059a), 0x6100, '$26059A bsr.w');
  assert.equal(0x26059c + s16(IMG.readUInt16BE(0x26059c)), STAGESTART.install, '  ...to $26051A');
  assert.equal(IMG.readUInt32BE(0x26057a), 0x26089e, '$260578 jsr $26089E');
  assert.equal(IMG.readUInt16BE(0x2608ca), 0x23d0, '$2608CA move.l (A0),abs.l');
  assert.equal(IMG.readUInt32BE(0x2608cc), RANK.basePtr, '  ...$81315C');

  // [M] the longword $0081315C occurs four times in the 6 MiB image and $2608CA is the only
  // one of them that is a WRITE -- W378 measured this and it is re-run here because this wave
  // depends on it: if there were a second writer, the chain would not have to be connected.
  const hits = [];
  for (let a = 0x200000; a + 4 <= IMG.length; a += 2) {
    if (IMG.readUInt32BE(a) === 0x0081315c) hits.push(a);
  }
  assert.deepEqual(hits, [0x2608cc, 0x2608d4], 'the two in this bank are the store and its reader');
});
