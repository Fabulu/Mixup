// WAVE 67 (T1) -- `$253604`, THE SHIP'S AFTERIMAGE TRAIL, AND BUCKET 12.
//
// Every expected value here is DERIVED FROM THE LISTING, never from running the
// port and writing down what came out (`11-review.md` F1, and `66-impl` §6.1 --
// six waves in a row have shipped a fixture that sat where two readings agree).
// The listing, disassembled this wave:
//
//   253604: movem.l D0-D7/A0-A6,-(A7)
//   253608: tst.b ($3f,A6) / beq $253622 -> rts
//   25360e: tst.b ($57,A6) / bne $25361e
//   253614: bsr $253636        P1: lea $8127F4,A0 / lea $812874,A1
//   25361e: bsr $253628        P2: lea $812834,A0 / lea $8128B4,A1
//   253642: movea.l A0,A2 / movea.l A1,A3
//   253646: move.w #$620,D3 / move.w #$1F,D4
//   25364e: move.l ($2,A6),D6 / andi.l #$FF80FF80,D6
//   253658: lea ($40,A1),A1 / lea ($40,A0),A0 / moveq #$5,D7 / bra $253674
//   253664: (three unrolled `move.l -$8(An),-(An)` pairs; the bra enters at the
//   253674:  LAST of them, so pass 1 shifts ONE slot and passes 2..6 shift three)
//   25367c: tst.w D7 / bne $25368a
//   253680: move.l ($a,A6),(A3) / move.l ($2,A6),(A2) / rts
//   25368a: tst.w $80390C / beq $2536b0
//   253692: move.l (A0),D1 / move.l D1,D5 / andi.l #$FF80FF80,D5
//   25369c: cmp.l D6,D5 / beq $2536b0
//   2536a2: addi.l #$FA00FC00,D1 / move.l (A1),D2 / jsr $23FDB2   <- BUCKET 12
//   2536b0: dbra D7,$253664 / rts
//
// THE THREE NUMBERS `55-diag` §4.3 GOT WRONG, each with its own test below:
//   * FIVE records per call, not six -- the sixth pass stores the head and rts;
//   * a SIXTEEN-long ring, not a six-entry one;
//   * the taps are slots 15/12/9/6/3, not 0..5.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { RAM, P } from '../src/machine.js';
import { drawTrail, TRAIL, TRAIL_RINGS, SHIP_MUTATE } from '../src/shipsprite.js';
import { seedPositionHistory } from '../src/laser.js';
import { BUCKETS, NAMED_BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';

const B12 = BUCKETS[NAMED_BUCKETS.trail];

/** The bucket-12 requests staged this frame, decoded the way `$23FDB2` wrote
 *  them: word 0/1 = `(D1 asr.l 6) & $07FF03FF | $80008000`, 2/3 = D2, 4 = D3,
 *  5 = D4. */
function staged(ram) {
  const n = ram.u16(B12.counter) / RECORD_BYTES;
  const out = [];
  for (let k = 0; k < n; k++) {
    const at = B12.buffer + k * RECORD_BYTES;
    out.push({
      w0: ram.u16(at), w1: ram.u16(at + 2),
      d2: (ram.u16(at + 4) << 16 | ram.u16(at + 6)) >>> 0,
      size: ram.u16(at + 8), flip: ram.u16(at + 10),
    });
  }
  return out;
}

/** A player record with the beam UP, the phase word ON, and the two rings
 *  seeded by `$2536B6` from a KNOWN position/image. */
function bench({ player = RAM.player1, idx = 0, pos = 0x20001000,
  img = 0x00001200, phase = 1, armed = 1 } = {}) {
  const ram = new Ram(null);
  ram.setU32(player + P.posY, pos);
  ram.setU32(player + P.animA, img);
  ram.setU8(player + P.playerIdx, idx);
  ram.setU8(player + P.dead, armed);         // $24C282 -- the beam is up
  ram.setU16(0x80390c, phase);
  seedPositionHistory(ram, player === RAM.player1 ? 1 : 0);   // $2536B6/$2536D0
  return ram;
}

// ---------------------------------------------------------------------------

test('W67: $253608 tst.b ($3f,A6) -- with the beam DOWN nothing is emitted', () => {
  const ram = bench({ armed: 0 });
  assert.equal(drawTrail(ram, RAM.player1), 0);
  assert.equal(ram.u16(B12.counter), 0,
    '$253608 beq $253622 -- the routine restores and rts before any ring is '
    + 'even chosen');
  // and the ring must be UNTOUCHED: the shift is behind the gate too.
  assert.equal(ram.u32(TRAIL_RINGS.p1.pos), 0x20001000);
});

test('W67: THE GATE IS THE LASER -- $24C282 sets ($3f,A6) and the trail runs',
  () => {
    const ram = bench({ armed: 1 });
    // Move the ship a coarse step so the $25369C skip cannot mask the result.
    ram.setU32(RAM.player1 + P.posY, 0x20001000 + 0x00800080);
    assert.equal(drawTrail(ram, RAM.player1), 5,
      '$253660 moveq #$5,D7 + dbra runs the body SIX times and the SIXTH takes '
      + '$25367C beq -> $253680 (store the head) -> rts, so FIVE records leave');
    assert.equal(ram.u16(B12.counter), 5 * RECORD_BYTES,
      'and they are in BUCKET 12 -- $2536AA jsr $23FDB2, $80AF24/$80AFEA');
  });

test('W67: FIVE records, not six -- $55-diag $4.3 read moveq #$5 as six', () => {
  // The ROM's own arithmetic: six `dbra` passes, one of which is the head store.
  assert.equal(TRAIL.passes, 6, '$253660 moveq #$5,D7 -- SIX passes');
  const ram = bench();
  ram.setU32(RAM.player1 + P.posY, 0x20001000 + 0x01000100);
  const n = drawTrail(ram, RAM.player1);
  assert.equal(n, TRAIL.passes - 1);
  assert.equal(n, 5);
  assert.ok(n * RECORD_BYTES <= B12.capBytes,
    `five 12-byte records fit bucket 12's ${B12.capBytes} staging bytes; six `
    + 'would still fit, so the cap is not what limits this');
});

test('W67: the ring is SIXTEEN longs and the taps are slots 15/12/9/6/3', () => {
  const ram = bench();
  // Write a DISTINCT marker into each of the 16 position slots and each of the
  // 16 image slots, so which slot each record came from is readable off it.
  for (let k = 0; k < 16; k++) {
    ram.setU32(TRAIL_RINGS.p1.pos + k * 4, 0x00010000 * (k + 1));
    ram.setU32(TRAIL_RINGS.p1.img + k * 4, 0x00A00000 + k);
  }
  // The ship far from every marker, so no coarse skip fires.
  ram.setU32(RAM.player1 + P.posY, 0x7f000000);
  const n = drawTrail(ram, RAM.player1);
  assert.equal(n, 5);
  const recs = staged(ram);
  // The shift runs BEFORE each read, so the record read at slot 15 is the value
  // that was at slot 14, at 12 the one from 11, and so on: OLD slots 14/11/8/5/2.
  assert.deepEqual(recs.map((r) => r.d2 - 0x00A00000), [14, 11, 8, 5, 2],
    'the five taps are the ship as it was 3, 6, 9, 12 and 15 calls ago');
  // ...and the ring is a proper 1-slot shift register afterwards.  Slot 0 comes
  // from the RECORD, not from the ring -- `$253680 move.l ($a,A6),(A3)`.
  assert.equal(ram.u32(TRAIL_RINGS.p1.img), ram.u32(RAM.player1 + P.animA),
    '$253680 move.l ($a,A6),(A3) -- slot 0 is THIS frame\'s ship image');
  assert.equal(ram.u32(TRAIL_RINGS.p1.pos), 0x7f000000,
    '$253684 move.l ($2,A6),(A2)');
  for (let k = 1; k < 16; k++) {
    assert.equal(ram.u32(TRAIL_RINGS.p1.img + k * 4), 0x00A00000 + (k - 1),
      `slot ${k} holds what slot ${k - 1} held`);
  }
  assert.equal(TRAIL.entries, 16);
});

test('W67: $253680/$253684 store the NEW head from ($a,A6) and ($2,A6)', () => {
  const ram = bench({ pos: 0x11112222, img: 0x33334444 });
  ram.setU32(RAM.player1 + P.posY, 0x55556666);
  ram.setU32(RAM.player1 + P.animA, 0x77778888);
  drawTrail(ram, RAM.player1);
  assert.equal(ram.u32(TRAIL_RINGS.p1.pos), 0x55556666, '$253684 move.l (A2)');
  assert.equal(ram.u32(TRAIL_RINGS.p1.img), 0x77778888, '$253680 move.l (A3)');
});

test('W67: $25368A tst.w $80390C -- the trail is on the aura/glow phase', () => {
  const ram = bench({ phase: 0 });
  ram.setU32(RAM.player1 + P.posY, 0x7f000000);
  assert.equal(drawTrail(ram, RAM.player1), 0,
    '$253690 beq $2536B0 -- every pass skips straight to the dbra');
  assert.equal(ram.u16(B12.counter), 0);
  // ...and the ring still SHIFTS on the silent phase, which is what makes the
  // taps three CALLS apart rather than three drawn frames apart.
  assert.equal(ram.u32(TRAIL_RINGS.p1.pos), 0x7f000000,
    'the head store at $253680 is not behind the phase test');
});

test('W67: $25369C cmp.l D6,D5 -- a STATIONARY ship has no trail at all', () => {
  // Every ring slot holds the ship's own position (which is what $2536B6 leaves
  // behind on the frame the beam arms), so all five samples compare EQUAL under
  // the $FF80FF80 mask and all five are skipped.
  const ram = bench({ pos: 0x20001000 });
  assert.equal(drawTrail(ram, RAM.player1), 0);
  assert.equal(ram.u16(B12.counter), 0);
  // A move of less than $80 in 1/64 px -- under two pixels -- is still equal.
  const ram2 = bench({ pos: 0x20001000 });
  ram2.setU32(RAM.player1 + P.posY, 0x20001000 + 0x0000007f);
  assert.equal(drawTrail(ram2, RAM.player1), 0,
    '$FF80 masks off the low seven bits, so a sub-2px move is not a step');
  const ram3 = bench({ pos: 0x20001000 });
  ram3.setU32(RAM.player1 + P.posY, 0x20001000 + 0x00000080);
  assert.equal(drawTrail(ram3, RAM.player1), 5,
    'and $80 exactly IS a step, on the short axis alone');
});

test('W67: $253646/$25364A -- 3x32 in COLOUR 31, the ship\'s own picture', () => {
  const ram = bench();
  ram.setU32(RAM.player1 + P.posY, 0x7f000000);
  for (let k = 0; k < 16; k++) ram.setU32(TRAIL_RINGS.p1.img + k * 4, 0x00001520);
  drawTrail(ram, RAM.player1);
  for (const r of staged(ram)) {
    assert.equal(r.size, 0x0620, '$253646 move.w #$620,D3 -- the ship\'s size');
    assert.equal(r.flip, 0x001f, '$25364A move.w #$1f,D4');
    assert.equal((r.flip >> 8 | r.flip) & 0xff, 0x1f,
      'the emit ORs the two bytes: flip 0, COLOUR 31');
    assert.equal(r.d2, 0x00001520,
      'D2 is the IMAGE RING, i.e. a copy of the ship\'s own ($a,A6) -- NO NEW ART');
  }
  assert.equal(TRAIL.size, 0x0620);
  assert.equal(TRAIL.flip, 0x001f);
});

test('W67: $2536A2 addi.l #$FA00FC00 is ONE LONG add -- and the carry only '
  + 'SHOWS at 1 position in 64', () => {
  // The ship's own record carries $FA00/$FC00 at ($6,A6)/($8,A6) (machine.js,
  // MEASURED constant over fly-around), so the afterimage lands where the ship
  // WAS.  It is a LONG add, so a carry out of the short axis reaches the long
  // one -- the same trap as $249EBC's ground plane and $24A4E6's bit-7 aura.
  //
  // **THIS FIXTURE COULD NOT FAIL AS FIRST WRITTEN** (see the worklog): with
  // `$30001000` the two-16-bit-add port gives a DIFFERENT D1 and the SAME
  // record, because `$23FDB2` does `asr.l #6` and then `andi.l #$07FF03FF`, so
  // the carry's bit 16 lands on bit 10 of the result -- which the short axis's
  // 10-bit mask throws away.  The long axis only moves when the carry crosses
  // bit 22, i.e. when the long half's low SIX bits are all 1.  So the position
  // has to be chosen for that, and `$303F1000` is such a position:
  //
  //   LONG add   $303F1000 + $FA00FC00 = $2A400C00  -> long axis $0A9
  //   TWO adds   $2A3F | $0C00         = $2A3F0C00  -> long axis $0A8
  //
  // 63 of every 64 positions cannot tell the two apart, which is why the first
  // mutant survived and is why this comment exists.
  const POS = 0x303f1000;
  const long1 = (POS + TRAIL.bias) >>> 0;
  const long2 = ((((POS >>> 16) + (TRAIL.bias >>> 16)) & 0xffff) << 16
    | (((POS & 0xffff) + (TRAIL.bias & 0xffff)) & 0xffff)) >>> 0;
  const enc = (d1) => ((((d1 | 0) >> 6) & 0x07ff03ff) | 0x80008000) >>> 0;
  assert.notEqual(enc(long1), enc(long2),
    'the two-16-bit-add port must produce a DIFFERENT RECORD at this position, '
    + 'or this test is a restatement rather than a check');
  assert.equal((enc(long1) >>> 16) & 0x07ff, 0x0a9);
  assert.equal((enc(long2) >>> 16) & 0x07ff, 0x0a8);

  const ram = bench();
  ram.setU32(RAM.player1 + P.posY, 0x7f000000);
  for (let k = 0; k < 16; k++) ram.setU32(TRAIL_RINGS.p1.pos + k * 4, POS);
  drawTrail(ram, RAM.player1);
  const recs = staged(ram);
  assert.equal(recs.length, 5);
  for (const r of recs) {
    assert.equal((r.w0 << 16 | r.w1) >>> 0, enc(long1),
      '$2536A2 addi.l (ONE 32-bit add), then $23FDB2 asr.l #6 / '
      + 'andi.l #$07FF03FF / ori.l #$80008000');
  }
  assert.equal(TRAIL.bias, 0xfa00fc00);
});

test('W67: $25360E tst.b ($57,A6) picks the ring, and P2 uses the OTHER pair',
  () => {
    const ram = bench({ player: RAM.player2, idx: 1, pos: 0x40002000 });
    ram.setU32(RAM.player2 + P.posY, 0x7f000000);
    for (let k = 0; k < 16; k++) {
      ram.setU32(TRAIL_RINGS.p2.img + k * 4, 0x000ABCDE);
      ram.setU32(TRAIL_RINGS.p1.img + k * 4, 0x000FFFFF);
    }
    assert.equal(drawTrail(ram, RAM.player2), 5);
    for (const r of staged(ram)) {
      assert.equal(r.d2, 0x000ABCDE,
        '$25361E bsr $253628 -- $812834 / $8128B4, NOT P1\'s pair');
    }
    assert.equal(ram.u32(TRAIL_RINGS.p1.pos), 0,
      'and P1\'s rings are untouched by P2\'s call -- nothing was seeded there '
      + 'and nothing shifted there either');
    assert.equal(ram.u32(TRAIL_RINGS.p1.img), 0x000FFFFF,
      'P1\'s image ring still holds the marker: no shift ran over it');
  });

test('W67: the port and the LASER agree on the four ring addresses', () => {
  // `laser.js seedPositionHistory` is `$2536B6`/`$2536D0` and has been ported
  // since W45; `shipsprite.js` is `$253628`/`$253636`.  They are two
  // transcriptions of the same four longwords and nothing had ever compared
  // them, because nothing had ever read what the initialiser wrote.
  const ram = new Ram(null);
  ram.setU32(RAM.player1 + P.posY, 0xCAFEBABE);
  ram.setU32(RAM.player1 + P.animA, 0xDEADBEEF);
  seedPositionHistory(ram, 1);
  assert.equal(ram.u32(TRAIL_RINGS.p1.pos), 0xCAFEBABE);
  assert.equal(ram.u32(TRAIL_RINGS.p1.pos + 15 * 4), 0xCAFEBABE);
  assert.equal(ram.u32(TRAIL_RINGS.p1.img), 0xDEADBEEF);
  assert.equal(ram.u32(TRAIL_RINGS.p1.img + 15 * 4), 0xDEADBEEF);
  assert.equal(ram.u32(TRAIL_RINGS.p1.pos + 16 * 4), 0,
    '$2536E6 moveq #$f -- SIXTEEN longs, and the seventeenth is not written');
  const ram2 = new Ram(null);
  ram2.setU32(RAM.player2 + P.posY, 0x12345678);
  ram2.setU32(RAM.player2 + P.animA, 0x9ABCDEF0);
  seedPositionHistory(ram2, 0);
  assert.equal(ram2.u32(TRAIL_RINGS.p2.pos), 0x12345678);
  assert.equal(ram2.u32(TRAIL_RINGS.p2.img), 0x9ABCDEF0);
});

test('W67: the mutation seam -- `no-trail` silences the producer', () => {
  const ram = bench();
  ram.setU32(RAM.player1 + P.posY, 0x7f000000);
  SHIP_MUTATE.value = 'no-trail';
  try {
    assert.equal(drawTrail(ram, RAM.player1), 0);
    assert.equal(ram.u16(B12.counter), 0);
  } finally { SHIP_MUTATE.value = null; }
  assert.equal(drawTrail(ram, RAM.player1), 5, 'and restoring brings it back');
});
