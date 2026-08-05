// WAVE 80 -- THE DAMAGE-FIRST FAMILY'S EMISSION, and the FALL-THROUGH that
// makes it two ports instead of one.
//
// W68 §2.3 and W75 §3.2 both record types $05/$07/$27 as ONE job: *"the same
// two [enqueue sites]; its span `$269B3E..$26A4B0` contains them"*, costed at
// "thirty instructions inside `$269D84..$269E1C`".  Read out of the ROM that is
// false.  `$26A2E2` NEVER EXECUTES A BYTE of `$269D84..$269E1C`; it has its own
// machine at `$26A380..$26A4B0`, and the two end in DIFFERENT blocks:
//
//   $269D74 tst.w $8130D2 / bne.w **$269E16**   -- $05 frozen
//   $26A370 tst.w $8130D2 / bne.w **$269E20**   -- $07/$27 frozen
//
// `$269E20` writes the sprite pointer from a heading and then falls into
// `$269E16`; `$269E16` only enqueues.  A port that read the labels and sent
// both to `$269E20` would emit records (so an emission gate would go green) and
// would rewrite `($A,A6)` on a type whose ROM leaves it alone.  These tests
// pin the DIFFERENCE, not just the presence of a record.
//
// EVERY ONE OF THESE WAS SEEN TO FAIL: reverting `src/handlers.js` to HEAD
// turns tests 1, 2 and 4 red (`assert.equal(12, 0)` -- no record at all) and
// test 3 red on the pointer.  Test 5 is the one that would catch the
// label-reading port, and it was watched go red by pointing `$05`'s frozen exit
// at `drawFamily269E20`.

import { test } from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { runHandler } from '../src/handlers.js';
import { UnportedLog } from '../src/unported.js';

const REC = 0x81364c, SUB = 0x81459c;
const B7_COUNT = 0x80afc8, B7_BUF = 0x807450;   // $23D852's own two longwords
const B3_COUNT = 0x80afc6, B3_BUF = 0x80688c;   // $23DF58's ($269B3E arm B)

// ---- the cartridge, answered only where these paths read it --------------
// `$269E48` is the family's 16-heading sprite-pointer table and `$269EC8` the
// matching ($2C,A5) longs; `$269BB6` is arm A's four.  The values below are
// MARKERS, not the cartridge's -- the claim under test is "the port indexes
// THIS table with THIS index and stores it HERE", which a marker proves and a
// transcribed table would only re-assert.
const FAM_SPRITE = 0x269e48, FAM_BUCKET = 0x269ec8;
const EMIT_FAM = 0x23d852, EMIT_A = 0x23df86, EMIT_B = 0x23df58;
const WORDS = new Map([
  [EMIT_FAM, 0x41f9], [EMIT_FAM + 6, 0xd0f9], [EMIT_FAM + 12, 0x43ee],
  [EMIT_A, 0x41f9], [EMIT_A + 6, 0xd0f9], [EMIT_A + 12, 0x2001],
  [EMIT_B, 0x41f9], [EMIT_B + 6, 0xd0f9], [EMIT_B + 12, 0x2001],
]);
const LONGS = new Map([
  [EMIT_FAM + 2, B7_BUF], [EMIT_FAM + 8, B7_COUNT],
  [EMIT_A + 2, B7_BUF], [EMIT_A + 8, B7_COUNT],
  [EMIT_B + 2, B3_BUF], [EMIT_B + 8, B3_COUNT],
]);
const ROM = {
  u8: () => 0,
  u16: (a) => WORDS.get(a) ?? 0,
  u32: (a) => {
    if (LONGS.has(a)) return LONGS.get(a);
    // marker tables: the entry at index i reads back as $AA0000+i / $BB0000+i,
    // so a wrong index is a wrong number rather than a coincidence.
    if (a >= FAM_SPRITE && a < FAM_SPRITE + 0x80) return 0x00aa0000 + (a - FAM_SPRITE);
    if (a >= FAM_BUCKET && a < FAM_BUCKET + 0x80) return 0x00bb0000 + (a - FAM_BUCKET);
    return 0;
  },
};
const TABLES = { vector: () => ({ dy: 0, dx: 0 }) };

/** A live record whose handler will reach the FROZEN exit: `$8130D2` non-zero
 *  short-circuits both machines straight to their draw block, so no aim runs
 *  and the synthetic ROM is never asked for `AimTables`. */
function makeRam(over = {}) {
  const ram = new Ram(null);
  for (let i = 0; i < 0x50; i++) ram.setU8(REC + i, 0);
  for (let i = 0; i < 0x20; i++) ram.setU8(SUB + i, 0);
  ram.setU16(REC, 0x8000);                 // live
  ram.setU32(REC + 0x06, SUB);             // sub-record pointer
  ram.setU16(SUB + 0x18, 0x0100);          // HP positive -> no death arm
  ram.setU16(0x8130d2, 1);                 // $8130D2 FREEZE -- the short circuit
  // $269B3E picks its arm on $80390C.  Zero takes ARM B, and arm B returns
  // immediately when $813098 (rank) is non-zero -- so exactly ONE record is
  // produced, by `$269E16 jsr $23D852`, and the bucket-7 counter is
  // unambiguous.  Arm A is exercised separately below.
  ram.setU16(0x80390c, 0);
  ram.setU16(0x813098, 1);
  for (const [k, v] of Object.entries(over)) ram.setU16(parseInt(k), v);
  return ram;
}
const run = (h, ram) => runHandler(h, ram, ROM, REC,
  { tables: TABLES, unported: new UnportedLog() });

// A slot's own five words, as `$23D762` would build them -- so the assertion is
// "the record the port queued is THIS record", not "twelve bytes moved".
function expectRecord(ram, at) {
  const long = (ram.i16(SUB + 0x02) + ram.i16(SUB + 0x06)) & 0xffff;
  const short = (ram.i16(SUB + 0x04) + ram.i16(SUB + 0x08)) & 0xffff;
  const d0 = (((((long << 16) | short) | 0) >> 6) & 0x07ff03ff | 0x80008000) >>> 0;
  assert.equal(ram.u16(at + 0), (d0 >>> 16) & 0xffff, 'word 0');
  assert.equal(ram.u16(at + 2), d0 & 0xffff, 'word 1');
  assert.equal(ram.u16(at + 4), ram.u16(SUB + 0x0a), 'descriptor high');
  assert.equal(ram.u16(at + 6), ram.u16(SUB + 0x0c), 'descriptor low');
  assert.equal(ram.u16(at + 8), ram.u16(SUB + 0x0e), 'size');
}

test('W80/1 -- type $05 ENQUEUES INTO BUCKET 7 ($269E16 jsr $23D852)', () => {
  const ram = makeRam();
  ram.setU32(SUB + 0x0a, 0x0017_1734);     // a real-shaped descriptor
  ram.setU16(SUB + 0x0e, (3 << 9) | 40);   // 3 cols x 40 rows -- the helicopter
  assert.equal(ram.u16(B7_COUNT), 0, 'bucket 7 starts empty');
  run(0x269cea, ram);
  assert.equal(ram.u16(B7_COUNT), 12,
    'ONE 12-byte request. Before W80 this was 0: the only enqueue sites type '
    + '$05 has are inside the block the port replaced with a counted note.');
  expectRecord(ram, B7_BUF);
});

test('W80/2 -- types $07 and $27 enqueue too ($26A2E2 -> $269E20 -> $269E16)', () => {
  for (const label of ['$07', '$27']) {
    const ram = makeRam();
    ram.setU32(SUB + 0x0a, 0x0017_18f4);
    ram.setU16(SUB + 0x0e, (3 << 9) | 40);
    run(0x26a2e2, ram);
    assert.equal(ram.u16(B7_COUNT), 12, `${label}: one bucket-7 request`);
  }
});

test('W80/3 -- $07 rewrites the sprite pointer on its frozen exit and $05 does NOT', () => {
  // THE FALL-THROUGH, PINNED.  $26A36C loads D1 = ($23,A5) and $26A370 branches
  // to **$269E20**, which does `move.l (A0,D1.w),($A,A6)`; $269D74 branches to
  // **$269E16**, which does not.  Same family, same freeze word, different
  // block -- and reading the labels instead of the branch targets would make
  // these two lines identical.
  const KEEP = 0x00123456;

  const r5 = makeRam();
  r5.setU32(SUB + 0x0a, KEEP);
  r5.setU16(SUB + 0x0e, (3 << 9) | 40);
  run(0x269cea, r5);
  assert.equal(r5.u32(SUB + 0x0a), KEEP,
    '$05 frozen -> $269E16: the sprite pointer is whatever it already was');

  const r7 = makeRam();
  r7.setU32(SUB + 0x0a, KEEP);
  r7.setU16(SUB + 0x0e, (3 << 9) | 40);
  r7.setU8(REC + 0x23, 0x06);              // ($23,A5), the facing byte -> D1
  run(0x26a2e2, r7);
  // $269E26 andi.w #$3E / $269E2A add.w D1,D1 -> byte offset (6 & $3E) * 2 = 12
  assert.equal(r7.u32(SUB + 0x0a), 0x00aa0000 + 12,
    '$07 frozen -> $269E20: ($A,A6) = $269E48[(D1 & $3E) * 2]');
  assert.equal(r7.u32(REC + 0x2c), 0x00bb0000 + 12,
    'and ($2C,A5) = $269EC8 at the same index');
});

test('W80/4 -- $269B3E arm A adds a SECOND bucket-7 record; arm B goes to bucket 3', () => {
  // $269B3E `tst.w $80390C / beq` -- the per-frame alternation.  Arm A emits
  // through $23DF86 (bucket 7), arm B through $23DF58 (**bucket 3**).  The
  // family therefore lands in two different buckets on alternate frames, which
  // is why "bucket 7 on all 490 slot-frames" (W75, on the BOARD's own list) is
  // evidence about arm A and not about the routine.
  const a = makeRam({ '0x80390c': 1 });
  a.setU16(SUB + 0x0e, (3 << 9) | 40);
  run(0x269cea, a);
  assert.equal(a.u16(B7_COUNT), 24, 'arm A: $23D852 + $23DF86, both bucket 7');
  assert.equal(a.u16(B3_COUNT), 0, 'nothing in bucket 3');

  const b = makeRam({ '0x80390c': 0, '0x813098': 0 });   // rank 0 -> arm B runs
  b.setU16(SUB + 0x0e, (3 << 9) | 40);
  run(0x269cea, b);
  assert.equal(b.u16(B7_COUNT), 12, 'arm B: only $23D852 is bucket 7');
  assert.equal(b.u16(B3_COUNT), 12, 'and the draw itself is bucket 3');
});

test('W80/5 -- ($16,A5) is a BYTE for this family, and a WORD for type $11', () => {
  // `$269D62` is `4A2D 0016` (tst.b) and `$269D6E` is `1B7C 0001 0016`
  // (move.b #$1); `$2688F2`/`$268900` really are `tst.w`/`move.w`.  The port
  // had the family on the word form, so it wrote ($16,A5)=0, ($17,A5)=1 -- two
  // wrong bytes against the board on every live record, invisible to every
  // gate because the port also READ it as a word.
  const ram = makeRam();
  ram.setU16(SUB + 0x0e, (3 << 9) | 40);
  // position 0 with $242684 never-on-screen: the handler takes the
  // `move.b #$1,($16,A5)` arm and must not be freed.
  run(0x269cea, ram);
  assert.equal(ram.u16(REC), 0x8000, 'still live (never-on-screen is not freed)');
  assert.equal(ram.u8(REC + 0x16), 1, '($16,A5) -- the byte the ROM writes');
  assert.equal(ram.u8(REC + 0x17), 0, '($17,A5) -- untouched, and it was not');
});
