// WAVE 60 (I1) -- `$2459D0`, THE PLAYER'S OWN BOX, and `$244D62`'s blocks 1-4.
//
// Recon 59 §10 made this the FIRST of the three item waves and said why: block
// 2 IS the item collection, and it cannot run without the box block 1 computes.
// So the tests here are about a routine that flags things, not one that damages
// them, and the two that matter most are the ones nothing in this port can
// reach yet -- block 2 (no item can exist until wave I2) and block 3 (nothing
// fills impact pool A until type-5 call #4 ships).  Both are driven from a
// hand-built RAM, which is the ONLY way a transcribed-and-unexercised branch
// can be checked at all (`docs/knowledge/10`).
//
// THE TWO SHAPES THIS FILE AVOIDS, because the project keeps re-finding them:
//
//  * NO FIXTURE SITS WHERE TWO READINGS AGREE.  `$2459D0` reads FOUR different
//    half-extents (+$10/+$12 for the long axis, +$14/+$16 for the short), so
//    every box fixture gives all four DIFFERENT values -- with equal extents a
//    port that used +$10 for all four would pass.  Block 2 reuses only TWO
//    (+$10 and +$12) and block 3 uses four; the fixtures differ accordingly.
//  * NO ASSERTION SEEDS ITS OWN ANSWER.  The expected corners are written as
//    literals computed by hand from the fixture, never by calling the routine
//    a second time.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { DMG, playerBox, bulletWindowSlots, runType5Tail } from '../src/damage.js';
import { BUL } from '../src/bullets.js';
import { UnportedLog } from '../src/unported.js';

const P1 = DMG.p1rec;                     // $8103E6
function ctx() { return { unportedLog: new UnportedLog() }; }

/** A live player with FOUR DIFFERENT half-extents.  y/x are +$02/+$04. */
function putPlayer(ram, { y = 0x2000, x = 0x1000,
  yP = 0x080, yM = 0x100, xP = 0x040, xM = 0x020 } = {}) {
  ram.setU16(P1, 0x8000);
  ram.setU16(P1 + 0x02, y);
  ram.setU16(P1 + 0x04, x);
  ram.setU16(P1 + 0x10, yP);              // $2459D6 add.w ($10,A4),D0
  ram.setU16(P1 + 0x12, yM);              // $2459DA sub.w ($12,A4),D1
  ram.setU16(P1 + 0x14, xP);              // $2459E4 add.w ($14,A4),D2
  ram.setU16(P1 + 0x16, xM);              // $2459E8 sub.w ($16,A4),D3
  return P1;
}

function putBullet(ram, slot, { y, x, hi = 0x80 }) {
  const r = DMG.bulletPool + slot * DMG.bulletStride;
  ram.setU8(r, hi);                       // the type word's HIGH byte
  ram.setU16(r + 0x02, y);
  ram.setU16(r + 0x04, x);
  return r;
}

// ======================================================= $2459D0, THE BOX ====

test('$2459D0 builds the box from FOUR different half-extents, not two', () => {
  const ram = new Ram();
  putPlayer(ram, { y: 0x2000, x: 0x1000, yP: 0x080, yM: 0x100, xP: 0x040, xM: 0x020 });
  const b = playerBox(ram, P1);
  // Hand-computed from the fixture: nothing here calls playerBox twice.
  assert.equal(b.d0, 0x2080, 'D0 = ($2,A4) + ($10,A4)');
  assert.equal(b.d1, 0x1f00, 'D1 = ($2,A4) - ($12,A4)');
  assert.equal(b.d2, 0x1040, 'D2 = ($4,A4) + ($14,A4)');
  assert.equal(b.d3, 0x0fe0, 'D3 = ($4,A4) - ($16,A4)');
  assert.equal(b.hit, false, 'an empty pool cannot flag');
});

test('$2459D0 walks (D6+1)*10 slots -- the body is TEN-WAY UNROLLED', () => {
  // `$2459F2 move.w #$6,D6` ... `$245A22 move.w #$14,D6`, ten copies of the
  // body, ONE `$245C2E dbra D6,$245A26`.  A reader who took the routine for its
  // first 52 bytes would walk ONE bullet.
  const ram = new Ram();
  assert.equal(bulletWindowSlots(ram), 70, 'all four rungs zero -> #$6 -> 70');
  const want = [110, 160, 190, 210];
  for (let i = 0; i < 4; i++) {
    ram.setU16(DMG.bulletWindow[i], 1);
    assert.equal(bulletWindowSlots(ram), want[i], `rung ${i} -> ${want[i]}`);
  }
  // AND THE CASCADE STOPS AT THE FIRST ZERO.  Every rung is `tst.w / beq
  // $245A26`, i.e. a jump straight to the body -- NOT a skip to the next rung.
  // With the rungs raised in order the two readings agree, which is exactly the
  // fixture `docs/knowledge/03` warns about, so these two cases leave a GAP.
  const gap = new Ram();
  gap.setU16(DMG.bulletWindow[1], 1);
  gap.setU16(DMG.bulletWindow[2], 1);
  gap.setU16(DMG.bulletWindow[3], 1);
  assert.equal(bulletWindowSlots(gap), 70,
    '$2459FC beq $245A26 -- rung 0 is zero, so the other three never run');
  const gap2 = new Ram();
  gap2.setU16(DMG.bulletWindow[0], 1);
  gap2.setU16(DMG.bulletWindow[2], 1);
  assert.equal(bulletWindowSlots(gap2), 110, '...and again one rung further on');
});

test('$2459D0 and $281506 are the SAME ladder, unrolled by DIFFERENT factors', () => {
  // THE CROSS-CHECK, and it is the only thing that can catch either of the two
  // transcriptions drifting.  **The developers unrolled this ladder TWICE, by
  // different factors.**  `src/bullets.js` took its counts from the SPAWNER's
  // free-slot search at `$281506`, which examines FIVE slots per `dbra D7`
  // with D7 = `$D/$15/$1F/$25/$29`, i.e. `5*(D7+1)`.  This file took them from
  // `$2459D0`, which is TEN copies of the body per `dbra D6` with
  // D6 = `#$6/#$A/#$F/#$12/#$14`, i.e. `10*(D6+1)`.  Two instruction streams,
  // two unroll factors, one answer -- and the answer is written down nowhere
  // in the cartridge.
  assert.deepEqual(BUL.window, DMG.bulletWindow, 'the same four rung words');
  assert.equal(DMG.bulletPool + 2, 0x817f8e, '$2459EC lea $817F8E = pool + 2');
  assert.equal(BUL.pool, DMG.bulletPool, 'and it is the same pool');
  const fromTen = DMG.bulletD6.map((d6) => (d6 + 1) * DMG.bulletUnroll);
  const fromFive = BUL.windowIters.map((n) => 5 * (n + 1));
  assert.deepEqual(fromTen, fromFive, '70/110/160/190/210 both ways');
  assert.deepEqual(fromTen, [70, 110, 160, 190, 210], 'and those are they');
  assert.equal(BUL.slots, fromTen[4], 'the top rung IS the pool capacity');
});

test('$245A3A rejects on $51 -- bits 0, 4 and 6 -- and NOT on the live bit', () => {
  const mk = (hi) => {
    const ram = new Ram();
    putPlayer(ram);
    putBullet(ram, 3, { y: 0x2000, x: 0x1000, hi });
    return playerBox(ram, P1).hit;
  };
  assert.equal(mk(0x80), true, 'bit 7 (live) is not in the mask -> a HIT');
  assert.equal(mk(0x00), true, 'and a FREE slot inside the box is a hit too');
  assert.equal(mk(0x01), false, 'bit 0 is in $51');
  assert.equal(mk(0x10), false, 'bit 4 is in $51 -- an ALREADY-HIT bullet');
  assert.equal(mk(0x40), false, 'bit 6 is in $51');
  assert.equal(mk(0x20), true, 'bit 5 is NOT in $51');
  assert.equal(mk(0x08), true, 'bit 3 is NOT in $51');
});

test('$2459D0 writes THREE things and RETURNS -- one bullet per pass', () => {
  const ram = new Ram();
  putPlayer(ram);
  const b0 = putBullet(ram, 0, { y: 0x2000, x: 0x1000 });
  const b1 = putBullet(ram, 1, { y: 0x2000, x: 0x1000 });
  const r = playerBox(ram, P1);
  assert.equal(r.hit, true);
  assert.equal(ram.u8(b0) & 0x10, 0x10, '$245A44 or.b #$10,(-$4,A6)');
  assert.equal(ram.u8(b1) & 0x10, 0, '$245A52 bra $245C32 -- the SECOND bullet '
    + 'in the same box is NOT flagged; the routine returns on the first');
  assert.equal(ram.u8(P1) & 0x10, 0x10, '$245A48 or.b #$10,(A4) -- THE PLAYER');
  assert.equal(ram.u16(DMG.fa7e), 1, '$245A4A move.w #$1,$80FA7E');
});

test('the four box comparisons are UNSIGNED and each rejects its own side', () => {
  // y = $2000, box [$1F00, $2080];  x = $1000, box [$0FE0, $1040].
  const at = (y, x) => {
    const ram = new Ram();
    putPlayer(ram);
    putBullet(ram, 5, { y, x });
    return playerBox(ram, P1).hit;
  };
  assert.equal(at(0x2080, 0x1000), true, 'D0 == y is inside ($245A2A bcs)');
  assert.equal(at(0x2081, 0x1000), false, '...and one past is not');
  assert.equal(at(0x1f00, 0x1000), true, 'D1 == y is inside ($245A2E bcs)');
  assert.equal(at(0x1eff, 0x1000), false, '...and one before is not');
  assert.equal(at(0x2000, 0x0fe0), true, 'D3 == x is inside ($245A34 bcs)');
  assert.equal(at(0x2000, 0x0fdf), false, '...and one before is not');
  assert.equal(at(0x2000, 0x1040), true, 'D2 == x is inside ($245A38 bcs)');
  assert.equal(at(0x2000, 0x1041), false, '...and one past is not');
});

// ======================================== $244D62 BLOCKS 1-4, THROUGH THE TAIL

/** The tail, with `$81308C` = 1 and `$80390C` = 0, i.e. `$28B6B8 jmp $244D62`
 *  -- the arm that runs blocks 1..4 AND the shot loops. */
function runPass(ram) {
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.mirror2, 0);
  return runType5Tail(ram, ctx());
}

/** One allocated item, `$40` stride, position at +$02/+$04, ONE pair of
 *  half-extents at +$10 (long) and +$12 (short) -- block 2 reads each twice. */
function putItem(ram, slot, { y, x, status = 0x8000, ex = 0x600, exX = 0x300 }) {
  const r = DMG.itemPool + slot * DMG.itemStride;
  ram.setU16(r, status);
  ram.setU16(r + 0x02, y);
  ram.setU16(r + 0x04, x);
  ram.setU16(r + 0x10, ex);
  ram.setU16(r + 0x12, exX);
  return r;
}

test('BLOCK 2 flags an item with the caller\'s own $80FA72 mask', () => {
  const ram = new Ram();
  // The box is built BEFORE the $2800 bias, and blocks 2-4 see box + $2800.
  // Put the item where the biased box lands: player y $2000 -> [$4700, $4880].
  putPlayer(ram);
  const it = putItem(ram, 0, { y: 0x2000, x: 0x1000 });
  ram.setU16(DMG.itemCount, 1);
  runPass(ram);
  assert.equal(ram.u16(it) & DMG.maskP1, DMG.maskP1,
    '$244DF2 or.w $80FA72,(-$4,A6) -- and $80FA72 is P1\'s $1000');
  assert.equal(ram.u16(it) & 0x8000, 0x8000, 'the allocated bit is untouched');
});

test('BLOCK 2 keeps walking after a flag -- block 4 is the one that exits', () => {
  const ram = new Ram();
  putPlayer(ram);
  const a = putItem(ram, 0, { y: 0x2000, x: 0x1000 });
  const b = putItem(ram, 1, { y: 0x2010, x: 0x1010 });
  const c = putItem(ram, 2, { y: 0x1ff0, x: 0x0ff0 });
  ram.setU16(DMG.itemCount, 3);
  runPass(ram);
  for (const [n, r] of [['0', a], ['1', b], ['2', c]]) {
    assert.equal(ram.u16(r) & DMG.maskP1, DMG.maskP1,
      `slot ${n}: $244DF6/$244DFA fall into the dbra, they do not bra out`);
  }
});

test('BLOCK 2\'s guard is $C0 and MUST NOT be tidied to $81', () => {
  // Recon 59 §4.2: `$27F54C` sets bit 0 (collected normally) and `$27F582` bit
  // 7 (collected at max); `$244DE6 andi.w #$C0,D4` catches bit 7 and NOT bit 0,
  // and no writer of bit 6 exists.  A port that "corrected" this to $81 would
  // change behaviour on the frame a normally-collected item is still inside the
  // player's box.  So: bit 0 set MUST still be flagged.
  const flag = (status) => {
    const ram = new Ram();
    putPlayer(ram);
    const it = putItem(ram, 0, { y: 0x2000, x: 0x1000, status });
    ram.setU16(DMG.itemCount, 1);
    runPass(ram);
    return (ram.u16(it) & DMG.maskP1) !== 0;
  };
  assert.equal(flag(0x8000), true, 'clean');
  assert.equal(flag(0x8001), true, 'bit 0 (collected NORMALLY) is NOT in $C0');
  assert.equal(flag(0x8080), false, 'bit 7 (collected AT MAX) is');
  assert.equal(flag(0x8040), false, 'bit 6 is, though nothing writes it');
});

test('BLOCK 2 walks the LIVE COUNT, at a LITERAL $40, testing +$02', () => {
  // THREE separate readings, and the fixture must not seed any of them:
  //   * the stride is `$40` -- `$244DF6 lea ($3e,A6),A6` with A6 at base+4.
  //     **The records here are placed at LITERAL $40 offsets, not at
  //     `slot * DMG.itemStride`** -- a fixture built from the constant under
  //     test agrees with itself whatever the constant holds, which is the
  //     seeded check `docs/knowledge/03` names and which this project has
  //     already shipped twice.
  //   * the EMPTY test is `$244DB6 beq` on the word at **+$02**, not on +$00
  //     the way the driver `$27E99E` tests it.
  //   * `$244D9C move.w $8171BA,D6` is the LIVE COUNT, and the empty-slot scan
  //     does NOT consume it, so N live records are processed however many slots
  //     they are spread over -- and the N+1th is NOT.
  const put = (ram, byteOffset, y) => {
    const r = DMG.itemPool + byteOffset;
    ram.setU16(r, 0x8000);
    ram.setU16(r + 0x02, y);
    ram.setU16(r + 0x04, 0x1000);
    ram.setU16(r + 0x10, 0x600);
    ram.setU16(r + 0x12, 0x300);
    return r;
  };
  const flagged = (ram, r) => (ram.u16(r) & DMG.maskP1) !== 0;

  // (a) slot 0 has a ZERO +$02 -- an empty slot by THIS block's test, even
  //     though its +$00 says allocated.  Slot 1 is $40 further on.
  const ram = new Ram();
  putPlayer(ram);
  const dead = put(ram, 0x00, 0);
  const good = put(ram, 0x40, 0x2000);
  ram.setU16(DMG.itemCount, 1);
  runPass(ram);
  assert.equal(flagged(ram, dead), false, 'a zero +$02 is an empty slot');
  assert.equal(flagged(ram, good), true, 'and the next record is $40 on');

  // (b) THREE records in the box, but the count says ONE.  Only the first.
  const ram2 = new Ram();
  putPlayer(ram2);
  const a = put(ram2, 0x00, 0x2000);
  const b = put(ram2, 0x40, 0x2000);
  const c = put(ram2, 0x80, 0x2000);
  ram2.setU16(DMG.itemCount, 1);
  runPass(ram2);
  assert.equal(flagged(ram2, a), true, '$8171BA = 1 -> the dbra runs once');
  assert.equal(flagged(ram2, b), false, '...and slot 1 is NOT walked');
  assert.equal(flagged(ram2, c), false, '...nor slot 2');

  // (c) the same three with the count at THREE -- all of them, which is what
  //     makes (b) a statement about the counter and not about the box.
  const ram3 = new Ram();
  putPlayer(ram3);
  const d = put(ram3, 0x00, 0x2000);
  const e = put(ram3, 0x40, 0x2000);
  const f = put(ram3, 0x80, 0x2000);
  ram3.setU16(DMG.itemCount, 3);
  runPass(ram3);
  for (const [n, r] of [['0', d], ['1', e], ['2', f]]) {
    assert.equal(flagged(ram3, r), true, `count 3 -> slot ${n} is walked`);
  }
});

test('BLOCK 2 reads +$10 for BOTH long bounds and +$12 for BOTH short', () => {
  // Block 2 is the one block that reuses two extents where blocks 3 and 4 read
  // four.  Driven at each of the four boundaries, one extent at a time, with
  // the two extents DIFFERENT so any mix-up moves at least one boundary.
  //   item +$02 = $2000, +$04 = $1000 -> biased IY = $4800, IX = $3800;
  //   +$10 = $600 (long), +$12 = $300 (short).
  const flag = (box) => {
    const ram = new Ram();
    putPlayer(ram, box);
    const r = DMG.itemPool;
    ram.setU16(r, 0x8000);
    ram.setU16(r + 0x02, 0x2000);
    ram.setU16(r + 0x04, 0x1000);
    ram.setU16(r + 0x10, 0x600);
    ram.setU16(r + 0x12, 0x300);
    ram.setU16(DMG.itemCount, 1);
    runPass(ram);
    return (ram.u16(r) & DMG.maskP1) !== 0;
  };
  const base = { y: 0x2000, x: 0x1000, yP: 0x100, yM: 0x100, xP: 0x100, xM: 0x100 };
  // $244DC0 cmp.w D5,D0 / bcs : accept iff D0 >= IY - $600 == $4200
  assert.equal(flag({ ...base, y: 0x1a00, yP: 0 }), true, 'D0 == $4200');
  assert.equal(flag({ ...base, y: 0x19ff, yP: 0 }), false, 'D0 == $41FF');
  // $244DC8 cmp.w D1,D4 / bcs : accept iff D1 <= IY + $600 == $4E00
  assert.equal(flag({ ...base, y: 0x2600, yM: 0 }), true, 'D1 == $4E00');
  assert.equal(flag({ ...base, y: 0x2601, yM: 0 }), false, 'D1 == $4E01');
  // $244DD6 cmp.w D3,D4 / bcs : accept iff D3 <= IX + $300 == $3B00
  assert.equal(flag({ ...base, x: 0x1300, xM: 0 }), true, 'D3 == $3B00');
  assert.equal(flag({ ...base, x: 0x1301, xM: 0 }), false, 'D3 == $3B01');
  // $244DDE cmp.w D5,D2 / bcs : accept iff D2 >= IX - $300 == $3500
  assert.equal(flag({ ...base, x: 0x0d00, xP: 0 }), true, 'D2 == $3500');
  assert.equal(flag({ ...base, x: 0x0cff, xP: 0 }), false, 'D2 == $34FF');
});

test('BLOCK 3 reads FOUR DISTINCT extents, one per boundary', () => {
  // Record +$02 = $2000, +$04 = $1000 -> biased RY = $4800, RX = $3800.
  //   ($c,A6) = +$10 = $400   long PLUS      $244E26 add.w ($c,A6),D4
  //   ($e,A6) = +$12 = $800   long MINUS     $244E1E sub.w ($e,A6),D5
  //   ($10,A6)= +$14 = $200   short PLUS     $244E34 add.w ($10,A6),D4
  //   ($12,A6)= +$16 = $100   short MINUS    $244E3C sub.w ($12,A6),D5
  // All four differ, so ANY offset mix-up moves at least one boundary.  Block
  // 2's fixture cannot do this: block 2 really does read two words twice.
  const flag = (box) => {
    const ram = new Ram();
    putPlayer(ram, box);
    const r = DMG.impactPool;
    ram.setU16(r, 0x8000);
    ram.setU16(r + 0x02, 0x2000);
    ram.setU16(r + 0x04, 0x1000);
    ram.setU16(r + 0x10, 0x400);
    ram.setU16(r + 0x12, 0x800);
    ram.setU16(r + 0x14, 0x200);
    ram.setU16(r + 0x16, 0x100);
    ram.setU16(DMG.impactCount, 1);
    runPass(ram);
    return (ram.u16(r) & DMG.maskP1) !== 0;
  };
  const base = { y: 0x2000, x: 0x1000, yP: 0x100, yM: 0x100, xP: 0x100, xM: 0x100 };
  // $244E22 cmp.w D5,D0 / bcs : accept iff D0 >= RY - $800 == $4000
  assert.equal(flag({ ...base, y: 0x1800, yP: 0 }), true, 'D0 == $4000');
  assert.equal(flag({ ...base, y: 0x17ff, yP: 0 }), false, 'D0 == $3FFF');
  // $244E2A cmp.w D1,D4 / bcs : accept iff D1 <= RY + $400 == $4C00
  assert.equal(flag({ ...base, y: 0x2400, yM: 0 }), true, 'D1 == $4C00');
  assert.equal(flag({ ...base, y: 0x2401, yM: 0 }), false, 'D1 == $4C01');
  // $244E38 cmp.w D3,D4 / bcs : accept iff D3 <= RX + $200 == $3A00
  assert.equal(flag({ ...base, x: 0x1200, xM: 0 }), true, 'D3 == $3A00');
  assert.equal(flag({ ...base, x: 0x1201, xM: 0 }), false, 'D3 == $3A01');
  // $244E40 cmp.w D5,D2 / bcs : accept iff D2 >= RX - $100 == $3700
  assert.equal(flag({ ...base, x: 0x0f00, xP: 0 }), true, 'D2 == $3700');
  assert.equal(flag({ ...base, x: 0x0eff, xP: 0 }), false, 'D2 == $36FF');
});

test('BLOCK 3 guards on +$01 bit 7, NOT on block 2 $C0 over +$00', () => {
  // `$244E44 tst.b (-$3,A6) / bmi` is a BYTE test of record +$01.  A port that
  // reused block 2's `andi.w #$C0` over +$00 AGREES with it on bit 7 -- which
  // is why a fixture that only sets bit 7 cannot tell the two apart -- and
  // DISAGREES on bit 6, which nothing else in this port sets.
  const flag = (word, flags1) => {
    const ram = new Ram();
    putPlayer(ram);
    const r = DMG.impactPool;
    ram.setU16(r, word);
    ram.setU8(r + 0x01, flags1);
    ram.setU16(r + 0x02, 0x2000);
    ram.setU16(r + 0x04, 0x1000);
    ram.setU16(r + 0x10, 0x400);
    ram.setU16(r + 0x12, 0x400);
    ram.setU16(r + 0x14, 0x400);
    ram.setU16(r + 0x16, 0x400);
    ram.setU16(DMG.impactCount, 1);
    runPass(ram);
    return (ram.u16(r) & DMG.maskP1) !== 0;
  };
  assert.equal(flag(0x8000, 0x00), true, 'clean');
  assert.equal(flag(0x8080, 0x80), false, '+$01 bit 7 -> $244E48 bmi');
  assert.equal(flag(0x8040, 0x40), true,
    'bit 6 is NOT tested here, though $244DE6 catches it in block 2');
  assert.equal(flag(0x80c0, 0xc0), false, 'bit 7 still rejects with bit 6 set');
});

test('BLOCK 3 stride is $2C, from a LITERAL offset', () => {
  const ram = new Ram();
  putPlayer(ram);
  const put = (byteOffset) => {
    const r = DMG.impactPool + byteOffset;
    ram.setU16(r, 0x8000);
    ram.setU16(r + 0x02, 0x2000);
    ram.setU16(r + 0x04, 0x1000);
    ram.setU16(r + 0x10, 0x400);
    ram.setU16(r + 0x12, 0x400);
    ram.setU16(r + 0x14, 0x400);
    ram.setU16(r + 0x16, 0x400);
    return r;
  };
  const a = put(0x00);
  const b = put(0x2c);
  ram.setU16(DMG.impactCount, 2);
  runPass(ram);
  assert.equal(ram.u16(a) & DMG.maskP1, DMG.maskP1, 'slot 0');
  assert.equal(ram.u16(b) & DMG.maskP1, DMG.maskP1,
    'slot 1 is $2C on -- $244E54 lea ($28,A6),A6 with A6 at base+4');
});

test('BLOCK 4: the $1 type gate, the -1 HP, and it leaves the LOOP', () => {
  const mk = (typeWord) => {
    const ram = new Ram();
    putPlayer(ram);
    const put = (slot, y) => {
      const r = DMG.poolA + slot * DMG.enemyStride;
      ram.setU16(r, 0x8000 | typeWord);
      ram.setU16(r + 0x02, y);
      ram.setU16(r + 0x04, 0x1000);
      ram.setU16(r + 0x10, 0x0400);   // ($e,A6) long PLUS
      ram.setU16(r + 0x12, 0x0400);   // ($10,A6) long MINUS
      ram.setU16(r + 0x14, 0x0400);   // ($12,A6) short PLUS
      ram.setU16(r + 0x16, 0x0400);   // ($14,A6) short MINUS
      ram.setU16(r + 0x18, 0x0300);   // the HP
      return r;
    };
    const a = put(0, 0x2000);
    const b = put(1, 0x2010);
    ram.setU16(DMG.poolACount, 2);
    runPass(ram);
    return { ram, a, b };
  };
  const off = mk(0x0000);
  assert.equal(off.ram.u16(off.a + 0x18), 0x300,
    '$244EB0 andi.w #$1,D4 / beq -- bit 0 clear means NOT rammable');
  const on = mk(0x0001);
  assert.equal(on.ram.u16(on.a + 0x18), 0x2ff, '$244ED2 subq.w #1,($16,A6)');
  assert.equal(on.ram.u16(on.b + 0x18), 0x300,
    '$244ED6 bra $244EE0 -- ONE enemy per pass, the second is untouched');
  assert.equal(on.ram.u16(on.a) & DMG.maskP1, DMG.maskP1, '$244ECE or.w D4');
  assert.equal(on.ram.u8(P1) & 0x10, 0x10,
    '$244EC4 bset #$4,(A4) -- on the PLAYER, the same bit $2459D0 sets');
});

test('BLOCK 4 rejects a Y at or above $F800 after the bias and the extent', () => {
  // `$244EBE cmpi.w #-$800,D4 / bcc` RE-READS the Y (`$244EB6 move.w (A6),D4`),
  // re-adds D7 and subtracts `($10,A6)` -- record +$12 -- a THIRD time, and it
  // is the only guard between "inside the box" and the damage.  Driven at both
  // sides of the boundary, so `bcc` and `bcs` disagree on the fixture.
  //   enemy Y $D000 + $2800 == $F800 exactly, so the extent IS the boundary.
  const at = (ext) => {
    const ram = new Ram();
    putPlayer(ram, { y: 0xd000, x: 0x1000, yP: 0x400, yM: 0x400,
      xP: 0x040, xM: 0x020 });
    const r = DMG.poolA;
    ram.setU16(r, 0x8001);
    ram.setU16(r + 0x02, 0xd000);
    ram.setU16(r + 0x04, 0x1000);
    ram.setU16(r + 0x10, 0x0400);
    ram.setU16(r + 0x12, ext);
    ram.setU16(r + 0x14, 0x0400);
    ram.setU16(r + 0x16, 0x0400);
    ram.setU16(r + 0x18, 0x0300);
    ram.setU16(DMG.poolACount, 1);
    runPass(ram);
    return ram.u16(r + 0x18);
  };
  assert.equal(at(0x0001), 0x2ff, '$F800 - 1 == $F7FF is below -> RAMMED');
  assert.equal(at(0x0000), 0x300, '$F800 itself is not -> rejected');
});

test('$244D8A: a bullet hit SKIPS blocks 2, 3 and 4 in the same pass', () => {
  const ram = new Ram();
  putPlayer(ram);
  putBullet(ram, 0, { y: 0x2000, x: 0x1000 });   // inside the UNBIASED box
  const it = putItem(ram, 0, { y: 0x2000, x: 0x1000 });
  ram.setU16(DMG.itemCount, 1);
  const r = runPass(ram);
  assert.equal(r.player.hitPlayer, true, '$2459D0 flagged');
  assert.equal(ram.u16(DMG.fa7e), 1, 'and left $80FA7E set');
  assert.equal(ram.u16(it) & DMG.maskP1, 0,
    '$244D90 bne.w $244EE0 -- the item is NOT collected on a frame the player '
    + 'is hit, and that is a real semantic, not an optimisation');
  assert.equal(r.player.items, 0, 'block 2 did not run at all');
});

test('$244D7E clears $80FA7E, so a stale flag cannot suppress blocks 2-4', () => {
  const ram = new Ram();
  putPlayer(ram);
  ram.setU16(DMG.fa7e, 1);                       // as if a previous frame had
  const it = putItem(ram, 0, { y: 0x2000, x: 0x1000 });
  ram.setU16(DMG.itemCount, 1);
  runPass(ram);
  assert.equal(ram.u16(it) & DMG.maskP1, DMG.maskP1,
    '$244D7E clr.w $80FA7E runs BEFORE $244D84 jsr $2459D0');
});

test('$244D40 runs $2459D0 and NOTHING else -- the 59 Hz half of the check', () => {
  // `$81308C` = 1 and `$80390C` = 1 takes `$28B6B6 bne $28B706` -> `$28B728 jmp
  // $244D40`.  It writes the three globals, tests the player and jumps to the
  // box; it has no `clr.w $80FA7E`, no blocks 2-4 and no shot loop.
  const ram = new Ram();
  putPlayer(ram);
  putBullet(ram, 0, { y: 0x2000, x: 0x1000 });
  const it = putItem(ram, 0, { y: 0x2000, x: 0x1000 });
  ram.setU16(DMG.itemCount, 1);
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.mirror2, 1);                    // the $244D40 arm
  const r = runType5Tail(ram, ctx());
  assert.equal(r.player.entry, DMG.passNoPlayer, 'via $244D40');
  assert.equal(r.player.hitPlayer, true, '$244D5A jmp ($2459D0,PC) ran');
  assert.equal(r.anyShot, undefined, 'and there is no shot loop on this entry');
  assert.equal(ram.u16(it) & DMG.maskP1, 0, 'and no block 2');
  assert.equal(ram.u16(DMG.fa72), DMG.maskP1, '$244D40 move.w D0,$80FA72');
});

test('$28B6C6 -- both players zero -- is COUNTED, because A4 is stale', () => {
  const ram = new Ram();
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.mirror2, 0);
  ram.setU16(DMG.p1rec, 0);
  ram.setU16(DMG.p2rec, 0);
  const c = ctx();
  assert.equal(runType5Tail(ram, c), null);
  const keys = [...c.unportedLog.calls.keys()];
  assert.ok(keys.some((k) => k.startsWith('$244D40 ')),
    'the one arm that jumps to $244D40 from before $28B6C8\'s lea\'s is a note');
});

test('the $2800 bias CANCELS -- both sides get it, and that is the trap', () => {
  // `$244D94..$244D9A add.w D7,D0/D1/D2/D3` biases the BOX, and then every one
  // of blocks 2, 3 and 4 adds the SAME D7 to the record's own coordinate
  // (`$244DB8`, `$244E1A`, `$244E80`).  So an object at the player's RAW
  // position is a hit and an object at raw + $2800 is not -- the opposite of
  // what "the box is biased" suggests, and the single easiest thing to get
  // backwards here.  The bias exists for the UNSIGNED comparisons' sake, not to
  // move the box.
  const flag = (y, x) => {
    const ram = new Ram();
    putPlayer(ram);
    const it = putItem(ram, 0, { y, x });
    ram.setU16(DMG.itemCount, 1);
    runPass(ram);
    return (ram.u16(it) & DMG.maskP1) !== 0;
  };
  assert.equal(flag(0x2000, 0x1000), true, 'the player RAW position hits');
  assert.equal(flag(0x4800, 0x3800), false, '...and raw + $2800 does not');
});
