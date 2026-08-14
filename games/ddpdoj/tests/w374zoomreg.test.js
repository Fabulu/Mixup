// WAVE 374 -- `$23E2F2`, THE ZOOMING ENQUEUE IN **REGISTER** FORM.
//
// It is `$23D9E2` (`enqueueZoomedRequest`) with D1/D2/D3/D4 in place of the
// object record, plus D6.  Nothing here is new machinery; what IS new is that
// it reads a DIFFERENT scale table, `$23E78C`, which agrees with `$23E54A`
// everywhere except at index 56 -- and index 56 is exactly the index the three
// draws it unblocks ($25E29E, $25E4D0, $25F074) reach, because `$25E29E`'s
// third and fourth calls pass `D3 = $3840` and ($3840 & $3E00) >> 8 = 56.
//
// So the failure this file exists to catch is ALIASING THE TWO TABLES.  That
// mutation is invisible on 63 of 64 indices and wrong by a factor of 56 on the
// one the cartridge actually uses.  Test W374/2 is the one that says so.
//
// THE TABLE IS NOT TRANSCRIBED HERE, IT IS DECODED.  `SCALE_TABLE` and
// `ZOOM_REG_SCALE_TABLE` are both lists of multipliers somebody typed into
// `src/spritequeue.js`; this file executes all 128 cartridge routines
// symbolically out of `maincpu.bin` and compares.  A typo in either constant is
// a failure, not a shared assumption.
//
// [M] MUTATIONS SEEN TO FAIL (run and recorded, not imagined):
//   `ZOOM_REG_SCALE_TABLE = SCALE_TABLE`            -> W374/2 and W374/4 RED
//   `ZOOM_REG_SCALE_TABLE[56] = 1`                  -> W374/2 and W374/4 RED
//   `ZOOM_REG_SCALE_TABLE[25] = 25` ("fixing" it)   -> W374/2 and W374/3 RED
//   `lsr #6` read as `>> 6` on the ENTRY index      -> W374/4 RED
//   `i16(rom.u16(stub + 2)) + stub + 2` in the resolver (the record form's
//        PC base, which is wrong here because the `lea` is not first)
//                                                   -> W374/6 RED
//   `const at = stub + 0x3c` unconditionally        -> W374/6 RED on $23E2F2
//   `ram.setU16(at + 8, ram.u16(rec + 0xe))`-style, i.e. record word 4 from
//        anywhere but D3                            -> W374/4 RED
//   `| flags` dropped from the coord long           -> W374/4 and W374/5 RED
//   counter bumped by 1 instead of $C               -> W374/8 RED

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import {
  BUCKETS, ENQUEUE_MASK, RECORD_BYTES,
  SCALE_TABLE, SCALE_TABLE_ROM,
  ZOOM_REG_SCALE_TABLE, ZOOM_REG_TABLE_ROM,
  enqueueZoomedRegisters, enqueueZoomedRegistersThroughStub,
  resolveZoomRegisterStub,
} from '../src/spritequeue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const HAVE = fs.existsSync(IMAGE);
const SKIP = HAVE ? false : 'rip/sound/maincpu.bin absent; skip, not pass';
// RAW FILE OFFSET == 68000 address for this image (tools/rosetta.py's
// RANGES B = (0x200000, 0x2B0000)); nothing is subtracted.
const IMG = HAVE ? fs.readFileSync(IMAGE) : null;

// ---------------------------------------------------------------------------
// THE ROM THIS FILE READS.  The pointer table $23E78C+$100 is ALREADY a
// declared window (W96, in tools/export-tables.py); the thirteen stub bodies
// and the routine block behind the table are NOT, so this file cuts its own
// windows out of the image rather than widening anybody's.  Every extent is
// stated by the code: $78 is the stride of the five nop-carrying stubs
// ($23E2F2..$23E4D2) and $74 is the length of the nop-less shape, both
// measured to their own `rts`.
const FAMILY = Object.freeze([
  { stub: 0x23e2f2, bucket: 0, len: 0x78, nops: true },
  { stub: 0x23e36a, bucket: 1, len: 0x78, nops: true },
  { stub: 0x23e3e2, bucket: 2, len: 0x78, nops: true },
  { stub: 0x23e45a, bucket: 3, len: 0x78, nops: true },
  { stub: 0x23e4d2, bucket: 7, len: 0x78, nops: true },
  { stub: 0x23f090, bucket: 5, len: 0x74, nops: false },
  { stub: 0x23f9a2, bucket: 21, len: 0x74, nops: false },
  { stub: 0x23fd3e, bucket: 10, len: 0x74, nops: false },
  { stub: 0x23fde8, bucket: 12, len: 0x74, nops: false },
  { stub: 0x23fe92, bucket: 24, len: 0x74, nops: false },
  { stub: 0x24022e, bucket: 26, len: 0x74, nops: false },
  { stub: 0x24072a, bucket: 11, len: 0x74, nops: false },
  { stub: 0x24079e, bucket: 27, len: 0x74, nops: false },
]);

// $23E88C..$23E9D8 -- the 64 multiply routines $23E78C points at, ending at the
// `rts` of the x56 routine $23E9CE, which is the last of them.
const ROUTINES_78C = { base: 0x23e88c, len: 0x14c };
// $23E64A..$23E78C -- the same block for the RECORD form's table, which ends
// exactly where $23E78C begins.
const ROUTINES_54A = { base: 0x23e64a, len: 0x142 };

function hexOf(base, len) {
  return Buffer.from(IMG.subarray(base, base + len)).toString('hex');
}
const ROM = HAVE ? new RomWindows({
  windows: [
    { base: `$${ZOOM_REG_TABLE_ROM.toString(16)}`, len: 0x100,
      hex: hexOf(ZOOM_REG_TABLE_ROM, 0x100), why: 'W96 declared window' },
    { base: `$${SCALE_TABLE_ROM.toString(16)}`, len: 0x100,
      hex: hexOf(SCALE_TABLE_ROM, 0x100), why: 'the record form, for comparison' },
    { base: `$${ROUTINES_78C.base.toString(16)}`, len: ROUTINES_78C.len,
      hex: hexOf(ROUTINES_78C.base, ROUTINES_78C.len), why: 'decoded, not trusted' },
    { base: `$${ROUTINES_54A.base.toString(16)}`, len: ROUTINES_54A.len,
      hex: hexOf(ROUTINES_54A.base, ROUTINES_54A.len), why: 'decoded, not trusted' },
    ...FAMILY.map((f) => ({ base: `$${f.stub.toString(16)}`, len: f.len,
      hex: hexOf(f.stub, f.len), why: 'W374 zooming register stub' })),
    // $23DFB4 -- the NON-family control.  It is a real emitter (`2F08 2F00 /
    // lea $80397C,A0 / adda.w $80AFC0,A0 / move.l D1,D0`), W31's fourth
    // prologue, and `resolveEmitStub` resolves it happily.  It must NOT pass
    // as a member of this family.
    { base: '$23dfb4', len: 0x20, hex: hexOf(0x23dfb4, 0x20), why: 'control' },
  ],
}) : null;

// ---------------------------------------------------------------------------
// THE SYMBOLIC DECODER.  Each of the 128 routines is a straight-line sequence
// of word ops on two data registers ending in `rts`, so running it with the
// accumulator holding the symbol `1` and the scratch holding `0` yields the
// multiplier exactly.  $23E54A's routines work in D1 with D0 as scratch;
// $23E78C's work in D7 with D4 -- which is WHY the cartridge carries two
// copies, and why aliasing them in the port is not merely a tidy-up.
function decodeMultiplier(rom, entry, acc, scratch) {
  const v = new Map([[acc, 1], [scratch, 0]]);
  const get = (r) => v.get(r) ?? 0;
  let a = entry;
  for (let guard = 0; guard < 64; guard++) {
    const op = rom.u16(a);
    if (op === 0x4e75) return get(acc);                       // rts
    if ((op & 0xf1f8) === 0xd040) {                           // add.w Dy,Dx
      const x = (op >> 9) & 7, y = op & 7;
      v.set(x, get(x) + get(y)); a += 2; continue;
    }
    if ((op & 0xf1f8) === 0x9040) {                           // sub.w Dy,Dx
      const x = (op >> 9) & 7, y = op & 7;
      v.set(x, get(x) - get(y)); a += 2; continue;
    }
    if ((op & 0xf1f8) === 0x3000) {                           // move.w Dy,Dx
      const x = (op >> 9) & 7, y = op & 7;
      v.set(x, get(y)); a += 2; continue;
    }
    if ((op & 0xf1f8) === 0xe148) {                           // lsl.w #n,Dy
      const n = ((op >> 9) & 7) || 8, y = op & 7;
      v.set(y, get(y) * (2 ** n)); a += 2; continue;
    }
    throw new Error(`unknown opcode $${op.toString(16)} at $${a.toString(16)}`);
  }
  throw new Error(`no rts within 64 ops from $${entry.toString(16)}`);
}
const decodeTable = (rom, base, acc, scratch) => Array.from({ length: 64 },
  (unused, i) => decodeMultiplier(rom, rom.u32(base + i * 4), acc, scratch));

// ---------------------------------------------------------------------------
// A RAM with the thirty counters zeroed, so a bucket's counter IS its length.
// NOTE: `BUCKETS[i].counter` is the counter's ADDRESS.  It is read, never
// written -- writing it would rewrite the bucket descriptors themselves and
// break `resolveEmitStub` for every other test in the suite.
function world() {
  const ram = new Ram(null);
  for (const b of BUCKETS) ram.setU16(b.counter, 0);
  return ram;
}
const rd = (ram, b, off, k) => ram.u16(BUCKETS[b].buffer + off + k);

// ===========================================================================
// 1. THE TABLE IS 64 ENTRIES AND SELF-BOUNDING
// ===========================================================================

test('W374/1 -- $23E78C is 64 longwords and its own first entry is its end',
  { skip: SKIP }, () => {
    assert.equal(ZOOM_REG_TABLE_ROM, 0x23e78c);
    const first = ROM.u32(ZOOM_REG_TABLE_ROM);
    assert.equal(first, 0x23e88c,
      '$23E78C[0] is the x1 routine and the table SELF-BOUNDS: it is also the '
      + 'first byte after the table');
    assert.equal(first, ZOOM_REG_TABLE_ROM + 0x100,
      '$23E88C - $23E78C = $100 = 64 longwords. That is the only statement of '
      + 'the length the cartridge makes, and it is why 64 is not a guess');
    assert.equal(ZOOM_REG_SCALE_TABLE.length, 64);
    // and nothing in the table points back INTO it
    for (let i = 0; i < 64; i++) {
      const e = ROM.u32(ZOOM_REG_TABLE_ROM + i * 4);
      assert.ok(e >= first, `entry ${i} = $${e.toString(16)} points into the `
        + 'table itself, so the table is not $100 bytes long after all');
    }
  });

// ===========================================================================
// 2. THE INDEX-56 DIFFERENCE -- BOTH DIRECTIONS
// ===========================================================================

test('W374/2 -- the two scale tables differ at index 56 AND NOWHERE ELSE',
  { skip: SKIP }, () => {
    const reg = decodeTable(ROM, ZOOM_REG_TABLE_ROM, 7, 4);   // D7, scratch D4
    const rec = decodeTable(ROM, SCALE_TABLE_ROM, 1, 0);      // D1, scratch D0

    assert.deepEqual(reg, [...ZOOM_REG_SCALE_TABLE],
      'ZOOM_REG_SCALE_TABLE in src/spritequeue.js disagrees with the cartridge '
      + 'routines at $23E78C, decoded here from maincpu.bin');
    assert.deepEqual(rec, [...SCALE_TABLE],
      'SCALE_TABLE in src/spritequeue.js disagrees with $23E54A');

    assert.equal(reg[56], 56,
      'IF THIS FAILS, SOMEBODY ALIASED THE TWO SCALE TABLES. $23E78C[56] is '
      + '$23E9CE (lsl.w #3 / move.w D7,D4 / lsl.w #3 / sub.w D4,D7 = 64x - 8x '
      + '= x56), and $23E54A[56] is the x1 GUARD. `ZOOM_REG_SCALE_TABLE` MUST '
      + 'NOT be `SCALE_TABLE`, and `SCALE_TABLE` MUST NOT be "fixed" to match: '
      + 'the record form really does scale by 1 there');
    assert.equal(rec[56], 1,
      'IF THIS FAILS, SOMEBODY ALIASED THE TWO SCALE TABLES -- in the other '
      + 'direction. $23E54A[56] is $23E64A, which is $23E54A[0], the x1 '
      + 'out-of-range guard. $23D9E2 and friends scale by 1 at index 56');
    assert.notEqual(reg[56], rec[56]);

    for (let i = 0; i < 64; i++) {
      if (i === 56) continue;
      assert.equal(reg[i], rec[i],
        `the two tables must agree at every index but 56; they differ at ${i} `
        + `(register form ${reg[i]}, record form ${rec[i]}). The point of `
        + 'W374/2 is that 56 is the ONLY difference, so a second difference is '
        + 'as much a finding as a missing one');
    }
    // and index 56 is REACHABLE: $25E29E's third and fourth calls pass $3840.
    assert.equal((0x3840 & 0x3e00) >> 8, 56,
      '$23E326 andi.w #$3E00 / $23E32A lsr.w #6 is a BYTE offset, so the ENTRY '
      + 'index for D3 = $3840 is 56 -- not 224 and not 14');
  });

test('W374/3 -- index 25 is x21 IN BOTH TABLES, and that is the cartridge',
  { skip: SKIP }, () => {
    const reg = decodeTable(ROM, ZOOM_REG_TABLE_ROM, 7, 4);
    const rec = decodeTable(ROM, SCALE_TABLE_ROM, 1, 0);
    assert.equal(rec[25], 21,
      '$23E730 is x21 where every neighbour is x(index). A DEFECT IN THE '
      + 'CARTRIDGE, transcribed and never corrected');
    assert.equal(reg[25], 21,
      '$23E972 is x21 as well -- the same defect, copied into the register '
      + "form's table. If this fails somebody \"fixed\" ZOOM_REG_SCALE_TABLE[25]");
    assert.equal(ZOOM_REG_SCALE_TABLE[25], 21);
    assert.equal(SCALE_TABLE[25], 21);
    // the neighbours are NOT defective, which is what makes 25 a defect and
    // not a different indexing scheme
    assert.equal(reg[24], 24);
    assert.equal(reg[26], 26);
  });

// ===========================================================================
// 4. A REAL EMIT, END TO END, ON $25E29E'S OWN VALUES
// ===========================================================================
//
// `$25E29E` is one of the three blocked select-screen draws.  Read out of the
// image, its four `jsr $23E2F2` calls are set up as:
//
//   1. move.l #$0019E310,D2 / move.w #$14E0,D3 / move.w #$0010,D4
//   2. move.l #$0019EBD4,D2                       (D3, D4 carry over)
//   3. move.l #$0019F498,D2 / move.w #$3840,D3    <-- INDEX 56
//   4. move.l #$0019FB9C,D2
//
// and D6 comes from `lea ($25E47C,PC),A4 / adda.w ($60,A6),A4 / move.l (A4),D6`,
// whose entry 0 (at $25E480) is $80008000 -- the no-zoom encoding -- and whose
// entry 1 is $88008800.
const D2_A = 0x0019e310, D3_A = 0x14e0;
const D2_C = 0x0019f498, D3_C = 0x3840;
const D4_ALL = 0x0010;
const D6_NOZOOM = 0x80008000, D6_ZOOM1 = 0x88008800;
const D1 = 0x01400100;      // long $140 = 5px, short $100 = 4px, in 1/64 px

test('W374/4 -- $23E2F2 emits $25E29E\'s own two records, word for word',
  { skip: SKIP }, () => {
    const ram = world();

    // --- CALL 1: D3 = $14E0, D6 = $80008000 (grow=1, zoom=0 on both axes).
    // $80 - $80 = 0 on BOTH axes, so the recentring is exactly zero and the
    // coords are D1 shifted -- which is the invariant that makes the no-zoom
    // encoding equivalent to the plain stub.
    const off1 = enqueueZoomedRegisters(ram, 0, D1, D2_A, D3_A, D4_ALL, D6_NOZOOM);
    assert.equal(off1, 0);
    // $0140 >> 6 = 5, $0100 >> 6 = 4, then `or.l #$80008000`.
    assert.equal(rd(ram, 0, off1, 0), 0x8005, 'long axis: $140/64 = 5, grow bit');
    assert.equal(rd(ram, 0, off1, 2), 0x8004, 'short axis: $100/64 = 4, grow bit');
    assert.equal(rd(ram, 0, off1, 4), 0x0019, '$23E354 move.l D2 -- high word');
    assert.equal(rd(ram, 0, off1, 6), 0xe310, '$23E354 move.l D2 -- low word');
    assert.equal(rd(ram, 0, off1, 8), D3_A,
      '$23E356 move.w D3 -- RECORD WORD 4 IS D3 VERBATIM. D3 is used THREE '
      + 'times: two scale indices and this. A port that recomputes it, or that '
      + 'reads it back out of a record, gets a different number');
    assert.equal(rd(ram, 0, off1, 10), D4_ALL,
      '$23E358 swap D4 / $23E35A move.w D4 -- the parked palette word, back '
      + 'from the high half it spent the routine in');

    // --- CALL 3: D3 = $3840, D6 = $88008800.  THE INDEX-56 CALL.
    //   height   = $3840 & $1FF  = $40 = 64 -> entry (64/2)/4 = 8   -> x8
    //   width    = ($3840 & $3E00) >> 8     = 56                    -> x56
    //   shortAdj = ($80 - $88) * 8  = -64
    //   longAdj  = ($80 - $88) * 56 = -448        <-- x1 would give -8
    //   long  = $0140 - 448 = -128 -> $FF80
    //   short = $0100 -  64 =  192 -> $00C0
    //   $FF8000C0 asr 6 = $FFFE0003, & $07FF03FF = $07FE0003,
    //   or $88008800    = $8FFE8803
    const off3 = enqueueZoomedRegisters(ram, 0, D1, D2_C, D3_C, D4_ALL, D6_ZOOM1);
    assert.equal(off3, RECORD_BYTES, 'the second record follows the first');
    assert.equal(rd(ram, 0, off3, 0), 0x8ffe,
      'the LONG axis carries the x56 recentring. Aliasing the scale tables '
      + 'makes this $8804 -- a 56-fold error in the only place it shows');
    assert.equal(rd(ram, 0, off3, 2), 0x8803, 'the SHORT axis, x8 recentring');
    assert.equal(rd(ram, 0, off3, 4), 0x0019);
    assert.equal(rd(ram, 0, off3, 6), 0xf498);
    assert.equal(rd(ram, 0, off3, 8), D3_C, 'record word 4 is D3 verbatim');
    assert.equal(rd(ram, 0, off3, 10), D4_ALL);
  });

test('W374/4b -- D4\'s HIGH half is don\'t-care: $23E306 parks it, $23E358 pops it',
  { skip: SKIP }, () => {
    // The routine writes D4's LOW word and nothing else, so garbage above it
    // must not reach the record.  This is the only visible consequence of the
    // two `swap`s and it is why they are transcribed rather than dropped.
    const a = world(), b = world();
    enqueueZoomedRegisters(a, 0, D1, D2_A, D3_A, 0x0000_0010, D6_NOZOOM);
    enqueueZoomedRegisters(b, 0, D1, D2_A, D3_A, 0xdead_0010, D6_NOZOOM);
    for (let k = 0; k < RECORD_BYTES; k += 2) {
      assert.equal(rd(b, 0, 0, k), rd(a, 0, 0, k),
        `word ${k / 2} changed when only D4's HIGH half did`);
    }
    assert.equal(rd(b, 0, 0, 10), 0x0010);
  });

// ===========================================================================
// 5. D6 REACHES THE COORDS
// ===========================================================================

test('W374/5 -- D6 is OR-ed into the coord long, not merely into the recentring',
  { skip: SKIP }, () => {
    const ram = world();
    enqueueZoomedRegisters(ram, 0, D1, D2_C, D3_C, D4_ALL, D6_ZOOM1);
    const hi = rd(ram, 0, 0, 0), lo = rd(ram, 0, 0, 2);

    // $23E34A masks the coords to $07FF03FF FIRST, so bits 15..11 of the high
    // word and bits 15..10 of the low word are ZERO in the coordinate part.
    // Whatever is there afterwards can only have come from `or.l D6,D7`.
    const hiOnly = (~(ENQUEUE_MASK >>> 16)) & 0xffff;    // $F800
    const loOnly = (~(ENQUEUE_MASK & 0xffff)) & 0xffff;  // $FC00
    assert.equal(hiOnly, 0xf800);
    assert.equal(loOnly, 0xfc00);
    assert.equal(hi & hiOnly, (D6_ZOOM1 >>> 16) & hiOnly,
      '$23E350 or.l D6,D7 -- bit 15 (grow) of the LONG axis came from D6, and '
      + 'the mask cannot have produced it');
    assert.equal(lo & loOnly, D6_ZOOM1 & loOnly,
      'the SHORT axis carries D6 bits 15 (grow) and 11 (zoom $8800), neither '
      + 'of which survives $07FF03FF. If this fails the `or.l` is missing and '
      + 'every zoomed sprite draws at zoom index 0 instead of the requested one');
    assert.equal(lo & 0x0800, 0x0800, 'the ZOOM field bit itself');

    // and the coordinate half is still there underneath -- an `or.l` that
    // REPLACED the coords would also pass the two checks above.
    assert.equal(hi & (ENQUEUE_MASK >>> 16), 0x07fe);
    assert.equal(lo & (ENQUEUE_MASK & 0xffff), 0x0003);
  });

// ===========================================================================
// 6. THE RESOLVER, BOTH SUB-SHAPES
// ===========================================================================

test('W374/6 -- resolveZoomRegisterStub reads the bucket OUT OF THE CARTRIDGE '
  + 'for both sub-shapes', { skip: SKIP }, () => {
  // Sub-shape A: `4E71` after each `lea`, counter bumped LAST, `lea <buf>` at
  // +$40.  Sub-shape B: no nops, counter bumped FIRST, `lea <buf>` at +$3C.
  for (const f of FAMILY) {
    const r = resolveZoomRegisterStub(ROM, f.stub);
    assert.equal(r.bucket, f.bucket,
      `$${f.stub.toString(16).toUpperCase()} feeds bucket ${f.bucket} -- the `
      + `(buffer, counter) pair is read out of the image, never mapped`);
    assert.equal(r.nops, f.nops,
      `$${f.stub.toString(16).toUpperCase()} is sub-shape ${f.nops ? 'A' : 'B'}`);
  }
  // the two the spec names explicitly, restated so a reader sees them
  assert.equal(resolveZoomRegisterStub(ROM, 0x23e2f2).bucket, 0);
  assert.equal(resolveZoomRegisterStub(ROM, 0x23f090).bucket, 5);
  assert.equal(resolveZoomRegisterStub(ROM, 0x23fde8).bucket, 12,
    'bucket 12 is NAMED_BUCKETS.trail, and $23FDE8 is the second stub W67 '
    + 'found on that (buffer, counter) pair and could not name');
  // thirteen distinct buckets, so no two stubs collapsed onto one
  const seen = new Set(FAMILY.map((f) => resolveZoomRegisterStub(ROM, f.stub).bucket));
  assert.equal(seen.size, 13);
});

test('W374/6b -- the through-stub wrapper emits into the bucket the ROM names',
  { skip: SKIP }, () => {
    const ram = world();
    // $23FDE8 -> bucket 12, which is NOT bucket 0. A wrapper that ignored the
    // resolver's answer (the defect W81 shipped for an hour) writes to 0.
    enqueueZoomedRegistersThroughStub(ram, ROM, 0x23fde8,
      D1, D2_A, D3_A, D4_ALL, D6_NOZOOM);
    assert.equal(ram.u16(BUCKETS[12].counter), RECORD_BYTES,
      'the record landed in bucket 12');
    assert.equal(ram.u16(BUCKETS[0].counter), 0,
      'and NOT in bucket 0. A record in the wrong bucket still reaches the '
      + 'screen -- at the wrong DEPTH, which no pixel instrument here compares');
    assert.equal(rd(ram, 12, 0, 8), D3_A);
  });

// ===========================================================================
// 7. IT REJECTS A NON-FAMILY STUB
// ===========================================================================

test('W374/7 -- $23DFB4 is a real emitter and MUST NOT pass as a member',
  { skip: SKIP }, () => {
    // $23DFB4: `2F08 2F00 / lea $80397C,A0 / adda.w $80AFC0,A0 / move.l D1,D0`.
    // It feeds bucket 0 too, so a resolver that only checked the (buffer,
    // counter) pair would "succeed" and then run the WRONG ARITHMETIC on it --
    // no zoom, no D6, a different record. It must throw instead.
    assert.equal(ROM.u16(0x23dfb4), 0x2f08, 'the control really is $23DFB4');
    assert.throws(() => resolveZoomRegisterStub(ROM, 0x23dfb4), (e) => {
      assert.ok(e instanceof Unreached, `expected Unreached, got ${e}`);
      assert.match(String(e.message ?? e), /23DFB4/,
        'the throw must carry the stub address');
      return true;
    });
    // and the record form's ZOOMING family must not pass either: $23DBCA opens
    // `41FA` at +$0, not `48E7`, and reads $23E54A.
    assert.throws(() => resolveZoomRegisterStub(ROM, 0x23e2f2 + 2), Unreached,
      'a stub address off by one instruction must throw, not mis-resolve');
  });

// ===========================================================================
// 8. THE COUNTER IS A BYTE OFFSET
// ===========================================================================

test('W374/8 -- one emit advances the counter by exactly 12 BYTES',
  { skip: SKIP }, () => {
    const ram = world();
    // READ the counter word; never write BUCKETS[i].counter, which is the
    // counter's ADDRESS and part of the bucket descriptor.
    const before = ram.u16(BUCKETS[0].counter);
    enqueueZoomedRegisters(ram, 0, D1, D2_A, D3_A, D4_ALL, D6_NOZOOM);
    const after = ram.u16(BUCKETS[0].counter);
    assert.equal(after - before, RECORD_BYTES,
      '$23E35C addi.w #$C,$80AFC0 -- the counter is the bucket\'s LENGTH IN '
      + 'BYTES, which is what call #4 drains. A tally of sprites would be 1');
    assert.equal(RECORD_BYTES, 12);
    // three more, and the offsets returned are the running total
    const offs = [1, 2, 3].map(() =>
      enqueueZoomedRegisters(ram, 0, D1, D2_A, D3_A, D4_ALL, D6_NOZOOM));
    assert.deepEqual(offs, [12, 24, 36]);
    assert.equal(ram.u16(BUCKETS[0].counter), 48);
    // and the counter is a WORD -- $23E35C is `addi.w`, so it wraps at $10000
    ram.setU16(BUCKETS[0].counter, 0xfffc);
    enqueueZoomedRegisters(ram, 0, D1, D2_A, D3_A, D4_ALL, D6_NOZOOM);
    assert.equal(ram.u16(BUCKETS[0].counter), 0x0008,
      '`addi.w`, not `addi.l`: it wraps in 16 bits');
  });

// ===========================================================================
// 9. THE HEIGHT DEFECT IS A THROW, NOT AN ANSWER
// ===========================================================================

test('W374/9 -- an unaligned height throws naming $23E30E, not $23D9FA',
  { skip: SKIP }, () => {
    const ram = world();
    // $23E30E `lsr.w #1,D4` used as a byte offset into a FOUR-byte table: only
    // a height that is a multiple of 8 lands on an entry.
    for (const h of [1, 2, 3, 4, 5, 6, 7, 12, 0x1ff]) {
      assert.throws(() => enqueueZoomedRegisters(ram, 0, D1, D2_A,
        (4 << 9) | h, D4_ALL, D6_NOZOOM), (e) => {
        assert.ok(e instanceof Unreached);
        assert.equal(e.romAddress, 0x23e30e,
          'the throw must name $23E30E -- THIS routine\'s dispatch. $23D9FA is '
          + "the record form's, and citing it sends the next reader to the "
          + 'wrong listing');
        return true;
      }, `height ${h} is not a multiple of 8`);
    }
    // and every multiple of 8 up to the field's width is fine
    for (let h = 0; h <= 0x1f8; h += 8) {
      assert.doesNotThrow(() =>
        enqueueZoomedRegisters(world(), 0, D1, D2_A, (4 << 9) | h, D4_ALL,
          D6_NOZOOM), `height ${h}`);
    }
    // the counter did not move on the throws
    assert.equal(ram.u16(BUCKETS[0].counter), 0,
      'the throw happens BEFORE the counter is bumped, so a caught Unreached '
      + 'does not leave a hole in the bucket');
  });
