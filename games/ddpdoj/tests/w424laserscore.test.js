// WAVE 424 -- D60: `$286A82`, `$286AAA`, THE SHARED TAIL `$286AEA` AND THE
// LASER'S RANK FEEDER `$2867B4`.
//
// **THE OWNER'S RUN DIED ON THIS.**  `$286AAA IS NOT PORTED YET`, stage-2 boss,
// `c` (laser) held, `y` (bomb) pressed on top of it.  Every expected value below
// is computed by hand from the `aligned.py` sweep quoted beside it, never from
// running the port and writing down what came out.
//
// ================= WHY EVERY FIXTURE HERE IS DIRTIED FIRST ==================
//
// A fresh `Ram()` is all zeroes, and all zeroes takes `$286AAA`'s OTHER arm:
// `$811F72` reads 0, so `$286AB2 bmi` is NOT taken, `$81B60C` reads 0, so
// `$286ABA bne` is NOT taken, and the routine runs `$286ABC`'s start block and
// returns -- **never touching the tail, the rank feeder or the score add.**  A
// bench that forgot to dirty the RAM would therefore be green while testing
// none of the code the owner actually executed.  W416..W419 shipped four tests
// with exactly that hole; `bench()` closes it by writing a distinctive non-zero
// into every word the unit reads, and the last test in this file pins the hole
// itself so it cannot come back unnoticed.
//
// ============================ THE DISCRIMINATORS ============================
//
//   * `$286AE0`/`$286B44` are `addq.w #8,D2` -- `5042`'s data field of 0 means
//     EIGHT.  Every reload fixture uses a non-zero power, so the right answer
//     is $D and the `addq #0` misreading gives $5.  Different numbers.
//   * `$2867B4`'s D2 is 4 (or $30 hypering); `$286774`'s twin sixty-four bytes
//     earlier is ALWAYS $18.  Wiring the wrong feeder is red.
//   * `$286A92`'s `$81B62E` fork is asserted BOTH ways, and the two arms differ
//     in the DIVIDER words while agreeing on the score -- so a test that only
//     watched the score would have passed under either reading.
//   * `$286B02 bcc` is UNSIGNED and means NO BORROW; borrow and no-borrow are
//     asserted separately and they differ in `$81B610`, not in the score.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import {
  SCORE, LEDGER, bombHitChain, scoreHit, laserScoreHit, laserAltHit,
} from '../src/score.js';

const A6 = 0x81a000;          // the enemy sub-record `$286096 btst #1,(A6)` reads
const ctx = () => ({ unportedLog: new UnportedLog() });

/** THE OWNER'S STATE, and nothing in it is zero by accident.  `over` replaces
 *  single fields so each test can name the one word it is varying. */
function bench(over = {}) {
  const ram = new Ram();
  const f = {
    g30f8: 0x05,              // initbody.js:1161 `| 0x05` -- bset #0 + bset #2
    laserRec: 0x8001,         // NEGATIVE, bit 0 set, bit 7 clear -- $2860AE..
    itemTimer: 0x0033, itemDir: 0x00aa, itemCount: 0x0100, itemKind: 0x0009,
    bossHpLatch: 0x0001,      // a boss IS latched -- $284A7A bset.b #$0
    w1e: 0x0002, hyper: 0, hyperLvl: 0x0005,
    laserRankDivider: 0x0002, rankAccum: 0,
    power: 3, formation: 0, stage: 1, loop: 0,
    ...over,
  };
  ram.setU8(A6, 0x00);                            // $286096 btst #1,(A6) clear
  ram.setU8(SCORE.g30f8, f.g30f8);
  ram.setU16(SCORE.laserRec, f.laserRec);
  ram.setU16(SCORE.itemTimer, f.itemTimer);
  ram.setU16(SCORE.itemDir, f.itemDir);
  ram.setU16(SCORE.itemCount, f.itemCount);
  ram.setU16(SCORE.itemKind, f.itemKind);
  ram.setU16(SCORE.bossHpLatch, f.bossHpLatch);
  ram.setU16(LEDGER.p1.w1e, f.w1e);
  ram.setU16(LEDGER.p1.hyper, f.hyper);
  ram.setU16(LEDGER.p1.hyperLvl, f.hyperLvl);
  ram.setU16(SCORE.laserRankDivider, f.laserRankDivider);
  ram.setU16(SCORE.rankAccum, f.rankAccum);
  ram.setU16(LEDGER.p1.power, f.power);
  ram.setU16(LEDGER.p1.formation, f.formation);
  ram.setU16(SCORE.stage, f.stage);
  ram.setU16(SCORE.loop, f.loop);
  return ram;
}

/** The STATE TRACE.  A green run that stalls looks identical to a green run
 *  that works unless the numbers are read out, so they are. */
function snap(ram) {
  return {
    count: ram.u16(SCORE.itemCount), timer: ram.u16(SCORE.itemTimer),
    kind: ram.u16(SCORE.itemKind), dir: ram.u16(SCORE.itemDir),
    w1e: ram.u16(LEDGER.p1.w1e), div: ram.u16(SCORE.laserRankDivider),
    rank: ram.u16(SCORE.rankAccum), pending: ram.u32(0x81b4c0),
  };
}

// ===========================================================================
// 1.  THE OWNER'S OWN PATH, END TO END, THROUGH `$286096`.
// ===========================================================================

test('D60: the owner\'s scenario reaches $286AAA through $286096 and does not '
  + 'throw -- bit 2 set, $811F72 negative, the $400 hit bit in D1', () => {
  const ram = bench();
  const c = ctx();
  // D1 = $14: bit 4 (P1 hit) and bit 2 (the $400 bit `$2453AC` ORs in).
  scoreHit(ram, c, A6, 0x14);
  const s = snap(ram);
  // $2860C8 bsr $286A82 with D0 = 1 + $81B63E = 1.  Timer $33 != 0 so no start;
  // $81B62E = 1 so `$286A92 beq` is not taken; D0 := 1 again at $286A94 and
  // $286AA6 bra.w $286B58 adds it to the counter.  $100 + 1.
  // Then $2860CC bra.b $2860DE falls through to $2860F2 bsr $286876, whose
  // `btst #2` is set, so $28687E bne $286AAA: $811F72 negative -> the tail.
  // The tail's divider $81B5DE goes 2 -> 1 with NO borrow, so $286B02 bcc
  // jumps to $286B6A and the counter is NOT added a second time.
  assert.equal(s.count, 0x0101, '$286B58 add.w D0,$81B610 once, from $286A82');
  assert.equal(s.w1e, 1, '$286AFC subq.w #1,$81B5DE -- reached, so not a stall');
  assert.equal(s.div, 1, '$2867B4 subq.w #1,$81B636 -- the rank feeder ran');
  assert.equal(s.rank, 0, '$2867BA bcc: no borrow yet, so no $81B64A feed');
  assert.equal(s.pending, 2, '$286B86 bsr $286626 TWICE, once per entrance');
  assert.equal(s.timer, 0x0a, '$286B8A move.w #$A,$81B60C re-arms the counter');
  assert.equal(s.kind, 0x07, '$286B92 move.w #$7,$81B612');
  assert.equal(s.dir, 0x00aa, '$81B60E is untouched on the tail path');
  assert.deepEqual(c.unportedLog.report(), [],
    'nothing on this path is noted any more -- $2860C8 and $28687E are ported');
});

test('D60: three hits, and the THIRD borrows both dividers -- the state trace '
  + 'this wave claims progress on', () => {
  const ram = bench();
  const trace = [];
  for (let i = 0; i < 3; i++) { scoreHit(ram, ctx(), A6, 0x14); trace.push(snap(ram)); }
  assert.deepEqual(trace.map((s) => s.div), [1, 0, 8],
    '$81B636 2 -> 1 -> 0 -> borrow, then $2867D4/$2867D6 reload it to 8');
  assert.deepEqual(trace.map((s) => s.rank), [0, 0, 4],
    '$2867BC moveq #$4,D2 with no hyper -- NOT $286774\'s $18');
  assert.deepEqual(trace.map((s) => s.w1e), [1, 0, 0x0a],
    '$81B5DE 2 -> 1 -> 0 -> borrow, then $286B3C reloads (8-3)+8-3 = $A');
  assert.deepEqual(trace.map((s) => s.count), [0x0101, 0x0102, 0x0104],
    'the third hit adds twice: once from $286A82, once from the borrow arm');
  assert.deepEqual(trace.map((s) => s.pending), [2, 4, 6],
    'the score add is OUTSIDE the borrow arm -- two per hit, every hit');
});

// ===========================================================================
// 2.  `$286ABC` -- START THE COUNTER, AND THE `addq.w #8` TRAP.
// ===========================================================================

test('$286ABC starts the counter and its reload is 16 - power, because '
  + '$286AE0 `5042` is addq.w #8 and a data field of 0 means EIGHT', () => {
  // $811F72 NON-negative and $81B60C zero: the only way into the start block
  // from $286AAA.  Both words are dirty in every other test here.
  const ram = bench({ laserRec: 0x0001, itemTimer: 0 });
  bombHitChain(ram, ctx(), 0x25, 0x14);
  const s = snap(ram);
  assert.equal(s.w1e, 0x0d, '(8 - 3) + 8 = $D.  The addq #0 misreading gives $5');
  assert.equal(s.timer, 0x0a, '$286ABC move.w #$A,$81B60C');
  assert.equal(s.kind, 0x07, '$286AC4 move.w #$7,$81B612');
  assert.equal(s.count, 0, '$286ACC clr.w $81B610 -- it was $100 going in');
  assert.equal(s.dir, 0, '$286AD2 clr.w $81B60E -- it was $AA going in');
  assert.equal(s.div, 0x0002, '$2867B4 is NOT reached: $286AE8 rts comes first');
  assert.equal(s.pending, 0, 'and neither is $286626 -- the start block scores 0');
});

test('$286A8A beq $286ABC: a zero $81B60C starts the counter from $286A82 too, '
  + 'whatever $81B62E says', () => {
  const ram = bench({ itemTimer: 0, bossHpLatch: 0x1234, power: 5 });
  laserScoreHit(ram, ctx(), 0x25, 0x14);
  assert.equal(ram.u16(LEDGER.p1.w1e), 0x0b, '(8 - 5) + 8 = $B');
  assert.equal(ram.u16(SCORE.itemCount), 0, '$286ACC clr.w');
  assert.equal(ram.u32(0x81b4c0), 0, '$286AE8 rts -- no score on the start');
});

// ===========================================================================
// 3.  `$286A92` -- THE BOSS-HP LATCH FORK, ASSERTED BOTH WAYS.
// ===========================================================================

test('$286A8C tst.w $81B62E picks the whole tail or just the item add, and the '
  + 'two arms differ in the DIVIDERS while agreeing on the score', () => {
  const noBoss = bench({ bossHpLatch: 0 });
  laserScoreHit(noBoss, ctx(), 0x25, 0x14);          // -> $286AEA, the whole tail
  const boss = bench({ bossHpLatch: 1 });
  laserScoreHit(boss, ctx(), 0x25, 0x14);            // -> $286B58, the short path
  assert.equal(snap(noBoss).div, 1, '$286AF8 bsr $2867B4 ran');
  assert.equal(snap(boss).div, 2, '$286AA6 bra.w $286B58 SKIPS the rank feeder');
  assert.equal(snap(noBoss).w1e, 1, '$286AFC subq.w #1,$81B5DE ran');
  assert.equal(snap(boss).w1e, 2, '... and is skipped on the short path');
  assert.equal(snap(noBoss).count, 0x0100,
    '$286B02 bcc: no borrow, so $286B58 is jumped OVER on the long path');
  assert.equal(snap(boss).count, 0x0101, '$286B58 add.w D0,$81B610, D0 = 1');
  assert.equal(snap(noBoss).pending, 0x25, 'both end at $286B86 bsr $286626');
  assert.equal(snap(boss).pending, 0x25, 'with D0 restored from D3 at $286B7E');
});

test('$286A94 moveq #$1,D0 OVERWRITES the caller\'s D0, so the counter gains 1 '
  + 'while the SCORE still gains the caller\'s value out of D3', () => {
  const ram = bench({ bossHpLatch: 1 });
  laserScoreHit(ram, ctx(), 0x25, 0x14);
  assert.equal(ram.u16(SCORE.itemCount), 0x0101, 'D0 := 1 at $286A94');
  assert.equal(ram.u32(0x81b4c0), 0x25, 'D3 was taken at $286A82 and survives');
});

test('$286B5E btst #$6,D1 doubles the item add, and D1 bit 6 is INSIDE '
  + '$286096\'s `moveq #$5C,D1` mask', () => {
  const one = bench({ bossHpLatch: 1 });
  laserScoreHit(one, ctx(), 1, 0x14);
  const two = bench({ bossHpLatch: 1 });
  laserScoreHit(two, ctx(), 1, 0x54);           // $54 = $14 with bit 6
  assert.equal(one.u16(SCORE.itemCount), 0x0101,
    'bit 6 clear: $286B62 beq $286B6A');
  assert.equal(two.u16(SCORE.itemCount), 0x0102,
    'bit 6 set: $286B64 adds D0 a second time');
});

// ===========================================================================
// 4.  `$286B04..$286B52` -- THE RELOAD, ALL FOUR SHAPES.
// ===========================================================================

test('$286B3C, no hyper: D0 = 1 and the divider reloads (16 - power), less 3 '
  + 'unless the FORMATION word $810440 is exactly 2', () => {
  const plain = bench({ w1e: 0, laserRankDivider: 5, itemCount: 0, formation: 0 });
  laserAltHit(plain, ctx(), 1, 0x14);
  const form2 = bench({ w1e: 0, laserRankDivider: 5, itemCount: 0, formation: 2 });
  laserAltHit(form2, ctx(), 1, 0x14);
  assert.equal(snap(plain).w1e, 0x0a, '$286B50 subq.w #3,D2 -- $D - 3');
  assert.equal(snap(form2).w1e, 0x0d, '$286B4E beq $286B52 steps over it');
  assert.equal(snap(plain).count, 1, '$286B06 moveq #$1,D0, undoubled');
  assert.equal(snap(plain).div, 4, '$2867B4 ran first: 5 -> 4, no borrow');
});

test('$286B10, hyper OUTSIDE stage 3: D0 doubles once, and AGAIN in a later '
  + 'loop, while the divider reloads to ZERO', () => {
  const l0 = bench({ hyper: 1, hyperLvl: 2, stage: 1, loop: 0, w1e: 0, itemCount: 0 });
  laserAltHit(l0, ctx(), 1, 0x14);
  const l1 = bench({ hyper: 1, hyperLvl: 2, stage: 1, loop: 1, w1e: 0, itemCount: 0 });
  laserAltHit(l1, ctx(), 1, 0x14);
  assert.equal(snap(l0).count, 6, '(1 + 2) doubled once at $286B2E');
  assert.equal(snap(l1).count, 12, '$286B36 bne -> $286B38 doubles it again');
  assert.equal(snap(l0).w1e, 0, '$286B04 moveq #$0,D2 survives to $286B52');
  assert.equal(snap(l1).w1e, 0, 'the loop word does not touch D2 on this arm');
});

test('$286B16, hyper INSIDE stage 3: no doubling at all, and the divider '
  + 'reloads to 2 in a later loop instead of 0', () => {
  const s3l0 = bench({ hyper: 1, hyperLvl: 2, stage: 3, loop: 0, w1e: 0, itemCount: 0 });
  laserAltHit(s3l0, ctx(), 1, 0x14);
  const s3l1 = bench({ hyper: 1, hyperLvl: 2, stage: 3, loop: 1, w1e: 0, itemCount: 0 });
  laserAltHit(s3l1, ctx(), 1, 0x14);
  assert.equal(snap(s3l0).count, 3, '$286B10 add.w $81B654,D0 and nothing else');
  assert.equal(snap(s3l1).count, 3, 'still 3 -- $286B28 beq skips the doubling');
  assert.equal(snap(s3l0).w1e, 0, '$813098 == 0 takes $286B28 beq $286B52');
  assert.equal(snap(s3l1).w1e, 2, '$286B2A addq.w #$2,D2');
});

// ===========================================================================
// 5.  `$2867B4` -- THE RANK FEEDER, AND WHY IT IS NOT `$286774`.
// ===========================================================================

test('$2867B4 feeds $81B64A with 4, or $30 while a hyper is up -- and never '
  + 'with $286774\'s $18', () => {
  const plain = bench({ laserRankDivider: 0, w1e: 9 });
  laserAltHit(plain, ctx(), 1, 0x14);
  const hyper = bench({ laserRankDivider: 0, w1e: 9, hyper: 1 });
  laserAltHit(hyper, ctx(), 1, 0x14);
  assert.equal(snap(plain).rank, 4, '$2867BC moveq #$4,D2 / $2867C4 beq $2867C8');
  assert.equal(snap(hyper).rank, 0x30, '$2867C6 moveq #$30,D2');
  assert.notEqual(snap(plain).rank, 0x18, 'the twin $286774 would give $18');
  assert.equal(snap(plain).div, 8, '$2867D4 moveq #$8,D2 / $2867D6 move.w');
  assert.equal(snap(hyper).div, 8, 'same reload on both arms');
});

test('$2867BA bcc branches BACKWARDS to $2867B2, which is $286774\'s own rts: '
  + 'no borrow, no feed, no reload', () => {
  const ram = bench({ laserRankDivider: 3, rankAccum: 0x0777, w1e: 9 });
  laserAltHit(ram, ctx(), 1, 0x14);
  assert.equal(snap(ram).div, 2, '3 - 1, and the routine returns');
  assert.equal(snap(ram).rank, 0x0777, '$81B64A untouched');
});

// ===========================================================================
// 6.  `$286AEA` AND `$286B6A` -- THE TWO CLAMPS ON `$81B610`.
// ===========================================================================

test('$286AF0 bpl / $286AF2 clr.w zeroes a NEGATIVE counter on the way in', () => {
  const ram = bench({ itemCount: 0x8000, w1e: 9, laserRankDivider: 9 });
  laserAltHit(ram, ctx(), 1, 0x14);
  assert.equal(snap(ram).count, 0, '$286AF2 clr.w $81B610');
});

test('$286B72 bls is UNSIGNED, so $286B76 pins the counter at $7FFF rather '
  + 'than letting it wrap negative', () => {
  const ram = bench({ itemCount: 0x7ffe, w1e: 0, laserRankDivider: 9 });
  laserAltHit(ram, ctx(), 1, 0x54);        // bit 6 -> two adds of 1
  assert.equal(snap(ram).count, 0x7fff, '$7FFE + 1 + 1 = $8000 -> clamped');
});

test('$286B6A is reached on BOTH sides of $286B02, so the pending score gains '
  + 'D3 whether the divider borrowed or not', () => {
  const borrow = bench({ w1e: 0, laserRankDivider: 9 });
  laserAltHit(borrow, ctx(), 0x25, 0x14);
  const noBorrow = bench({ w1e: 9, laserRankDivider: 9 });
  laserAltHit(noBorrow, ctx(), 0x25, 0x14);
  assert.equal(snap(borrow).pending, 0x25, '$286B86 after the reload');
  assert.equal(snap(noBorrow).pending, 0x25, '$286B86 after the bcc');
  assert.notEqual(snap(borrow).w1e, snap(noBorrow).w1e,
    'and the two paths really were different: $A against 8');
});

// ===========================================================================
// 7.  THE FRESH-`Ram` HOLE, WRITTEN DOWN AS A TEST SO IT CANNOT COME BACK.
// ===========================================================================

test('a fresh Ram() takes NEITHER branch this unit is about: it runs $286ABC '
  + 'and returns, which is why every fixture above is dirtied', () => {
  const zero = new Ram();
  bombHitChain(zero, ctx(), 0x25, 0x14);   // $8130F8 is 0, so this is $286882's
  assert.equal(zero.u16(SCORE.itemTimer), 0, 'bit 2 clear: $286AAA not entered');
  const bit2 = new Ram();
  bit2.setU8(SCORE.g30f8, 0x04);
  bombHitChain(bit2, ctx(), 0x25, 0x14);
  assert.equal(bit2.u16(SCORE.itemTimer), 0x0a, '$286ABC, the start block');
  assert.equal(bit2.u16(LEDGER.p1.w1e), 0x10, '(8 - 0) + 8 with power 0');
  assert.equal(bit2.u16(SCORE.laserRankDivider), 0,
    'the rank feeder is NEVER reached from an all-zero Ram');
  assert.equal(bit2.u32(0x81b4c0), 0,
    'and neither is the score add -- a bench built on this measures nothing');
});
