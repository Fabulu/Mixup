// WAVE 441 -- THE STAGE-1 BOSS'S D14 ROTATION SCRIPT TURNED BOTH GUN MOUNTS
// THROUGHOUT ITS OWN WAIT STATE.  `$294666` IS A `bne.W` TO THE `rts` AND IT
// WAS READ AS AN 8-BIT FORM.  SO IS `$29471E`.
//
// ---------------------------------------------------------------------------
// WHAT THE BRIEF SAID, AND WHERE IT WAS WRONG
// ---------------------------------------------------------------------------
// This wave was sent after "two independent defects" left open by W440 in
// `lf9100->9200`: a missing laser beam-impact spark on lf9192/lf9194, and an
// UNDER-FREE in which "the port spawns the board's 42 records and frees 8 where
// the board frees 16 -- that is `mover.js` / `boundsKill` territory".
//
// **BOTH SENTENCES DESCRIBE ONE DEFECT, AND IT IS IN NEITHER FILE.**  `mover.js`
// is not touched by this wave and neither is `laser.js` or `spark.js`.  The
// under-free was not an under-free: the port freed 8 records because its 42
// bullets were fired from the WRONG PLACE and therefore left the playfield on
// different frames.  `boundsKill` was right the whole time.
//
// W440 was right that handing the port those 8 draws moves the bullet count by
// zero -- the spark and the bullets are both DOWNSTREAM of a boss part position,
// so neither could move the other.  It concluded from that they were two
// causes; they are two symptoms.  [M] the single edit at `$294666` closes both:
// `lf9100->9200` goes 176 -> **210/210** and its draw-gap list goes
// `[[9192,0,4],[9194,0,4]]` -> **`[]`**.
//
// ---------------------------------------------------------------------------
// THE DEFECT
// ---------------------------------------------------------------------------
//   $294666  66 00 00 f4   bne.W $29475C   the rts.  THE WHOLE WAIT STATE
//   $29471E  66 00 00 2c   bne.W $29474C   the exit.  NOT a cadence tick
//
// `$294658` is D14, the script that rotates the boss's two gun mounts.  Its
// state 0 is a wait: `subq.w #1,($8,A4)` and, while the counter has not reached
// zero, **RETURN**.  Read `66 00` as an 8-bit `bne +0` and it becomes a branch
// to $294668 -- the extension word, i.e. no branch at all -- and the wait falls
// straight through into `$294676 move.b ($3,A4),D0 / add.b D0,($4B,A6) /
// add.b D0,($8B,A6)`, the part-facing rotate.  So the port turned both mounts by
// ($3,A4) on every frame of a state that exists to turn nothing.
//
// This is the FIFTH WAVE RUNNING on the same trap: W437 `bcs.W`, W438 `bmi.W`,
// W439 `bra.W`, W440 four `bcc.W`, and here two `bne.W`.
//
// ---------------------------------------------------------------------------
// HOW IT WAS FOUND, AND WHY 440 WAVES MISSED IT
// ---------------------------------------------------------------------------
// [M] pairing the port's live bullets to the board's by (type, speed, dir) at
// lf9200 instead of by slot index: 24 of 26 board bullets have a port twin, the
// port carries TEN extra, and every extra is the `+$80` half of a volley whose
// other half the board also holds.  A pool that holds the right bullets in the
// wrong places is not an allocator bug.
//
// [M] the bullets spawned on lf9200 itself -- unmoved, still carrying the
// spawner's own bytes -- are IDENTICAL between board and port in all 64 bytes
// but their posB: `$556A/$31AC` on the board and `$556A/$1374` in the port.
// posA agrees exactly.  `$2960FC move.l ($22,A6),D2 / addi.l #$F6C00140,D2`
// makes that longword out of the part position, so partX agreed and partY did
// not, and the search moved to `$8152xx` -- the boss BODY struct, which is not
// the E5/E6 script slots W440 had already proved byte-identical.
//
// **AND THE DEFECT LEAVES NO TRACE IN THE STRUCTURE THAT CARRIES IT.**  [M] the
// D14 slot record `$812B14` is byte-identical to the board at lf9200 BEFORE this
// wave and after it: the wait still expires on the right frame and still leaves
// state 1 and a zero counter behind.  Only the two bytes it wrote into somebody
// else's struct were wrong.  Every gate that watches script slots was green.
//
// ---------------------------------------------------------------------------
// HOW THIS TEST FAILS IF THE FIX IS FAKED
// ---------------------------------------------------------------------------
// The deliverable is 100-frame segments of a 13,440-byte pool, so the fake to
// beat is "write the board's bullets".  Four things make it useless here, and
// three of them are outside the bullet pool entirely:
//
//  1. **THE WITNESS IS THE BOARD'S OWN, WITH NO PORT IN IT.**  Two checkpoints
//     say the wait ran: `($8,A4)` is $47 = 71 at lf9100 and 0 at lf9200, and the
//     part facing `$815287` falls by exactly $1E = 30 = 100 - 70.  `($4,A4)`,
//     the state-1 cadence, is $40 at lf9100 and $22 at lf9200 -- also exactly
//     $40 - 30.  Three numbers off the cartridge agreeing on 30.
//  2. **THE SEGMENT THAT PROVES IT HAS AN EMPTY POOL.**  `lf9000->9100` was
//     210/210 bullets before this wave and is 210/210 after: the pool is empty
//     at both ends.  Its boss-body struct went from **14 differing bytes to 0**
//     and its whole-RAM divergence from 1,385 to 1,202.  No write into the
//     bullet pool can produce that, because there is nothing in the pool.
//  3. **MOST OF THE DIVERGENCE WAS NEVER IN THE POOL.**  [M] at lf9200 the
//     whole-RAM divergence was 2,152 bytes of which only 570 lay inside the
//     bullet pool.  A perfect pool poke floors at **1,582**.  It is now **608**.
//  4. **TWO RED RUNS, PERFORMED.**  `W441_MUTATE` restores each branch's 8-bit
//     reading on its own.  `'d14-wait-fallthrough'` reproduces the pre-wave
//     numbers EXACTLY -- 176/210, 2,152 RAM bytes, 570 in pool, 10 boss-body
//     bytes -- and `'d14-home-tick'` moves a different byte in a different
//     segment, so the two are independent and both load-bearing.
//
// ---------------------------------------------------------------------------
// WHAT THIS WAVE DOES NOT CLAIM
// ---------------------------------------------------------------------------
// `lf8800->8900` is 171/210 and `lf8900->9000` is 189/210.  [M] both numbers are
// IDENTICAL before and after this wave and under both its RED arms; they are
// older defects the brief did not mention, and this wave neither fixes nor
// touches them.
//
// NO ROM WINDOW IS DECLARED OR WIDENED.  This wave changes transcribed code
// only; it adds no cartridge read.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { POOL_A } from '../src/bee.js';
import { POOL_B } from '../src/effects.js';
import { BUL } from '../src/bullets.js';
import { W441_MUTATE, d14Step294658 } from '../src/bossf23.js';
import { Ram } from '../src/ram.js';
import { readTrace } from '../tools/portdiff.mjs';
import {
  ROM_WINDOW_COUNT, ROM_OVERLAP_PAIRS, overlappingPairs, OVERLAP_NOTE,
} from './romwindowset.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const LADDER = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold');
const MANIFEST = path.join(LADDER, 'manifest.json');
const TRACE = path.join(LADDER, 'trace.tsv');
const CK = path.join(LADDER, 'ckpt');
const TABLES = path.join(GAME, 'rip', 'port', 'player.tables.json');
const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');

const RUNGS = [8800, 8900, 9000, 9100, 9200, 9300, 9400, 9500, 9600];
const ckOf = (lf) => path.join(CK, `c0${String(lf).padStart(5, '0')}.ram.bin`);
const HAVE_TABLES = fs.existsSync(TABLES);
const HAVE_IMAGE = fs.existsSync(IMAGE);
const HAVE_LADDER = fs.existsSync(MANIFEST) && fs.existsSync(TRACE)
  && RUNGS.every((lf) => fs.existsSync(ckOf(lf)));
const SKIP_LADDER = (HAVE_TABLES && HAVE_LADDER) ? false
  : 'the W69 stage1-laser-hold ladder (rungs lf8800..lf9600) or '
    + 'rip/port/player.tables.json is absent -- rebuild with pgm.py ckpt and '
    + '`python tools/export-tables.py`. THIS IS A SKIP, NOT A PASS.';
const SKIP_IMAGE = HAVE_IMAGE ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';

const RAM_BASE = 0x800000;
const RNG_STATE = 0x803916;

// The three structures this wave separates.  Only the middle one changed.
const D14_SLOT = 0x812b14;      // the A1 script record D14 runs out of
const BOSS_BODY = 0x81523c;     // A6 -- the boss body, where the parts live
const BOSS_LEN = 0x120;
const P1_FACE = 0x815287;       // ($4B,A6) part 1 facing  -- what $29467A writes
const P2_FACE = 0x8152c7;       // ($8B,A6) part 2 facing  -- what $29467E writes
const P1_POS = 0x81525e;        // ($22,A6) longword: posA high, posB low
const P2_POS = 0x81529e;        // ($62,A6)
const SLOT_LEN = 0x20;

const hx = (v) => `$${v.toString(16).toUpperCase()}`;
const s8 = (v) => (v >= 0x80 ? v - 0x100 : v);
const s16 = (v) => (v >= 0x8000 ? v - 0x10000 : v);

// ===========================================================================
// 1. THE ROM -- SIXTY-ONE INSTRUCTIONS, COUNTED, AND FOURTEEN `.W` BRANCHES
// ===========================================================================
test('W441: $294658..$29475D decodes to SIXTY-ONE instructions that consume the '
  + 'span exactly, and $294666 is a bne.W to $29475C -- the rts -- computed from '
  + 'its EXTENSION WORD', { skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];

  const INSNS = [
    [0x294658, [0x0c, 0x2c, 0x00, 0x00, 0x00, 0x06], 'cmpi.b #$0,($6,A4) -- STATE'],
    [0x29465e, [0x66, 0x00, 0x00, 0x16], 'bne.W $294676 -- not state 0: rotate'],
    [0x294662, [0x53, 0x6c, 0x00, 0x08], 'subq.w #1,($8,A4) -- THE WAIT COUNTER'],
    [0x294666, [0x66, 0x00, 0x00, 0xf4], 'bne.W $29475C -- THE RTS. The whole wave'],
    [0x29466a, [0x19, 0x7c, 0x00, 0x01, 0x00, 0x06], 'move.b #1,($6,A4)'],
    [0x294670, [0x3d, 0x7c, 0x00, 0x01, 0x01, 0x14], 'move.w #1,($114,A6)'],
    [0x294676, [0x10, 0x2c, 0x00, 0x03], 'move.b ($3,A4),D0 -- the turn rate'],
    [0x29467a, [0xd1, 0x2e, 0x00, 0x4b], 'add.b D0,($4B,A6) -- PART 1 FACING'],
    [0x29467e, [0xd1, 0x2e, 0x00, 0x8b], 'add.b D0,($8B,A6) -- PART 2 FACING'],
    [0x294682, [0x0c, 0x2c, 0x00, 0x01, 0x00, 0x06], 'cmpi.b #$1,($6,A4)'],
    [0x294688, [0x66, 0x00, 0x00, 0x3c], 'bne.W $2946C6'],
    [0x29468c, [0x53, 0x2c, 0x00, 0x04], 'subq.b #1,($4,A4) -- A BYTE COUNTER'],
    [0x294690, [0x64, 0x00, 0x00, 0x34], 'bcc.W $2946C6 -- UNSIGNED'],
    [0x294694, [0x19, 0x6c, 0x00, 0x05, 0x00, 0x04], 'move.b ($5,A4),($4,A4)'],
    [0x29469a, [0x10, 0x2c, 0x00, 0x02], 'move.b ($2,A4),D0'],
    [0x29469e, [0xd1, 0x2c, 0x00, 0x03], 'add.b D0,($3,A4)'],
    [0x2946a2, [0x10, 0x2c, 0x00, 0x03], 'move.b ($3,A4),D0'],
    [0x2946a6, [0x6a, 0x00, 0x00, 0x04], 'bpl.W $2946AC -- SIGNED'],
    [0x2946aa, [0x44, 0x00], 'neg.b D0'],
    [0x2946ac, [0x0c, 0x00, 0x00, 0x02], 'cmpi.b #$2,D0'],
    [0x2946b0, [0x66, 0x00, 0x00, 0x14], 'bne.W $2946C6'],
    [0x2946b4, [0x19, 0x7c, 0x00, 0x02, 0x00, 0x06], 'move.b #2,($6,A4)'],
    [0x2946ba, [0x39, 0x7c, 0x60, 0x20, 0x00, 0x04], 'move.w #$6020,($4,A4)'],
    [0x2946c0, [0x39, 0x7c, 0x01, 0x00, 0x00, 0x12], 'move.w #$100,($12,A4)'],
    [0x2946c6, [0x0c, 0x2c, 0x00, 0x02, 0x00, 0x06], 'cmpi.b #$2,($6,A4)'],
    [0x2946cc, [0x66, 0x00, 0x00, 0x7e], 'bne.W $29474C'],
    [0x2946d0, [0x4a, 0x6c, 0x00, 0x12], 'tst.w ($12,A4)'],
    [0x2946d4, [0x67, 0x00, 0x00, 0x0a], 'beq.W $2946E0'],
    [0x2946d8, [0x53, 0x6c, 0x00, 0x12], 'subq.w #1,($12,A4)'],
    [0x2946dc, [0x60, 0x00, 0x00, 0x6e], 'bra.W $29474C'],
    [0x2946e0, [0x10, 0x2c, 0x00, 0x02], 'move.b ($2,A4),D0'],
    [0x2946e4, [0xd0, 0x00], 'add.b D0,D0 -- the target is TWICE ($2,A4)'],
    [0x2946e6, [0x12, 0x2c, 0x00, 0x03], 'move.b ($3,A4),D1'],
    [0x2946ea, [0xb2, 0x00], 'cmp.b D0,D1'],
    [0x2946ec, [0x67, 0x00, 0x00, 0x24], 'beq.W $294712 -- target met'],
    [0x2946f0, [0x53, 0x2c, 0x00, 0x04], 'subq.b #1,($4,A4)'],
    [0x2946f4, [0x64, 0x00, 0x00, 0x56], 'bcc.W $29474C -- UNSIGNED'],
    [0x2946f8, [0x19, 0x6c, 0x00, 0x05, 0x00, 0x04], 'move.b ($5,A4),($4,A4)'],
    [0x2946fe, [0x20, 0x6c, 0x00, 0x0a], 'movea.l ($A,A4),A0 -- LOADED, UNUSED'],
    [0x294702, [0x20, 0x6c, 0x00, 0x0e], 'movea.l ($E,A4),A0 -- and overwritten'],
    [0x294706, [0x10, 0x2c, 0x00, 0x02], 'move.b ($2,A4),D0'],
    [0x29470a, [0x91, 0x2c, 0x00, 0x03], 'sub.b D0,($3,A4)'],
    [0x29470e, [0x60, 0x00, 0x00, 0x3c], 'bra.W $29474C'],
    [0x294712, [0x10, 0x2e, 0x00, 0x4b], 'move.b ($4B,A6),D0 -- HOME CHECK'],
    [0x294716, [0x02, 0x00, 0x00, 0xfe], 'andi.b #$FE,D0'],
    [0x29471a, [0x0c, 0x00, 0x00, 0x40], 'cmpi.b #$40,D0'],
    [0x29471e, [0x66, 0x00, 0x00, 0x2c], 'bne.W $29474C -- THE EXIT, not a tick'],
    [0x294722, [0x1d, 0x7c, 0x00, 0x40, 0x00, 0x4b], 'move.b #$40,($4B,A6)'],
    [0x294728, [0x1d, 0x7c, 0x00, 0xc0, 0x00, 0x8b], 'move.b #$C0,($8B,A6)'],
    [0x29472e, [0x19, 0x7c, 0x00, 0x03, 0x00, 0x06], 'move.b #3,($6,A4)'],
    [0x294734, [0x70, 0x05], 'moveq #5,D0'],
    [0x294736, [0x4e, 0xb9, 0x00, 0x25, 0x9b, 0x08], 'jsr $259B08 -- stop E5'],
    [0x29473c, [0x70, 0x06], 'moveq #6,D0'],
    [0x29473e, [0x4e, 0xb9, 0x00, 0x25, 0x9b, 0x08], 'jsr $259B08 -- stop E6'],
    [0x294744, [0x70, 0x0e], 'moveq #$E,D0'],
    [0x294746, [0x4e, 0xb9, 0x00, 0x25, 0x9b, 0x08], 'jsr $259B08 -- stop E14'],
    [0x29474c, [0x0c, 0x2c, 0x00, 0x03, 0x00, 0x06], 'cmpi.b #$3,($6,A4)'],
    [0x294752, [0x66, 0x00, 0x00, 0x08], 'bne.W $29475C'],
    [0x294756, [0x42, 0x54], 'clr.w (A4) -- retire'],
    [0x294758, [0x42, 0x6e, 0x01, 0x14], 'clr.w ($114,A6)'],
    [0x29475c, [0x4e, 0x75], 'rts'],
  ];
  let a = 0x294658;
  for (const [addr, bytes, what] of INSNS) {
    assert.equal(a, addr, `the decode must reach ${hx(addr)} (${what}); the `
      + `instruction before it ended at ${hx(a)}`);
    assert.deepEqual(at(addr, bytes.length), bytes, `${hx(addr)} ${what}`);
    a += bytes.length;
  }
  assert.equal(INSNS.length, 61,
    'SIXTY-ONE instructions, stated as a COUNT -- W434 lost one instruction to a '
    + 'uniform-looking block, so the number is asserted and not eyeballed');
  assert.equal(a, 0x29475e, 'and the decode consumes the span exactly');
  assert.deepEqual(at(0x29475e, 6), [0x39, 0x7c, 0x00, 0x00, 0x00, 0x02],
    `${hx(0x29475e)} move.w #0,($2,A4) -- the NEXT routine, so this one cannot `
    + 'be one instruction longer than this decode says');

  // EVERY `.W` BRANCH IN THE ROUTINE, each computed from its OWN extension word
  // and each shown to be UNREADABLE as an 8-bit form.  Fourteen of them.
  const BRANCHES = [
    [0x29465e, 0x294676, 'bne.W -> the rotate (not state 0)'],
    [0x294666, 0x29475c, 'bne.W -> the rts. THE MISSING EXIT'],
    [0x294688, 0x2946c6, 'bne.W -> the state-2 check'],
    [0x294690, 0x2946c6, 'bcc.W -> the state-2 check'],
    [0x2946a6, 0x2946ac, 'bpl.W -> skip the neg'],
    [0x2946b0, 0x2946c6, 'bne.W -> the state-2 check'],
    [0x2946cc, 0x29474c, 'bne.W -> the state-3 check'],
    [0x2946d4, 0x2946e0, 'beq.W -> the timer has expired'],
    [0x2946dc, 0x29474c, 'bra.W -> the state-3 check'],
    [0x2946ec, 0x294712, 'beq.W -> the HOME check'],
    [0x2946f4, 0x29474c, 'bcc.W -> the state-3 check'],
    [0x29470e, 0x29474c, 'bra.W -> the state-3 check'],
    [0x29471e, 0x29474c, 'bne.W -> the state-3 check. NOT a cadence tick'],
    [0x294752, 0x29475c, 'bne.W -> the rts'],
  ];
  assert.equal(BRANCHES.length, 14, 'FOURTEEN wide branches, stated as a count');
  for (const [addr, target, what] of BRANCHES) {
    assert.equal(img[addr + 1], 0x00,
      `${hx(addr)}'s displacement byte is $00, which is what makes it the .W `
      + 'form: the displacement lives in the NEXT WORD');
    const ext = (img[addr + 2] << 8) | img[addr + 3];
    assert.equal(addr + 2 + s16(ext), target,
      `${hx(addr)} ${what}: ${hx(addr + 2)} + ${hx(s16(ext))} = ${hx(target)}`);
    assert.equal(addr + 2 + s8(0x00), addr + 2,
      `...and the 8-bit reading of ${hx(addr)} lands on ${hx(addr + 2)}, which `
      + 'is a branch that does nothing');
    assert.notEqual(addr + 2, target,
      '...a different address from the real target, so the two readings are '
      + 'distinguishable and this assertion can fail');
  }
  assert.deepEqual(at(0x29475c, 2), [0x4e, 0x75],
    `${hx(0x29475c)} IS an rts -- the address $294666 and $294752 both reach`);
});

test('W441: this wave declares NO ROM window -- it changes transcribed code and '
  + 'adds no cartridge read, so the window set must RECONCILE unchanged',
{ skip: SKIP_LADDER }, () => {
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const list = tables.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]);
  assert.equal(list.length, ROM_WINDOW_COUNT,
    'the whole window set, counted once in tests/romwindowset.js');
  assert.equal(overlappingPairs(list), ROM_OVERLAP_PAIRS, OVERLAP_NOTE);
});

// ===========================================================================
// 2. THE UNIT -- THE WAIT TURNS NOTHING, AND THE FRAME IT EXPIRES TURNS ONCE
// ===========================================================================
test('W441: d14Step294658 in state 0 leaves both part facings ALONE while its '
  + 'counter is above zero, and turns them exactly once on the frame the '
  + 'counter reaches zero', () => {
  const A4 = D14_SLOT;
  const A6 = BOSS_BODY;
  const build = (counter) => {
    const ram = new Ram();
    ram.setU16(A4 + 0x00, 0x810e);          // live, script $0E
    ram.setU8(A4 + 0x02, 0xff);             // ($2,A4) = -1
    ram.setU8(A4 + 0x03, 0xff);             // ($3,A4) = -1, the turn rate
    ram.setU16(A4 + 0x04, 0x4040);          // ($4,A4)/($5,A4) cadence
    ram.setU8(A4 + 0x06, 0x00);             // STATE 0
    ram.setU16(A4 + 0x08, counter);
    ram.setU8(A6 + 0x4b, 0x40);
    ram.setU8(A6 + 0x8b, 0xc0);
    return ram;
  };
  const waiting = build(0x47);
  d14Step294658(waiting, A4, A6);
  assert.equal(waiting.u16(A4 + 0x08), 0x46, 'the counter ticks $47 -> $46');
  assert.equal(waiting.u8(A6 + 0x4b), 0x40,
    'part 1 facing is UNTOUCHED. $294666 returned before $29467A');
  assert.equal(waiting.u8(A6 + 0x8b), 0xc0, '...and so is part 2');
  assert.equal(waiting.u8(A4 + 0x06), 0x00, '...and the state is still 0');
  assert.equal(waiting.u8(A4 + 0x04), 0x40,
    '...and the state-1 cadence has not ticked either, because $294666 returns '
    + 'past $29468C as well as past the rotate');

  const expiring = build(0x01);
  d14Step294658(expiring, A4, A6);
  assert.equal(expiring.u16(A4 + 0x08), 0x00, 'the counter reaches zero');
  assert.equal(expiring.u8(A4 + 0x06), 0x01, '...so $29466A sets state 1');
  assert.equal(expiring.u8(A6 + 0x4b), 0x3f,
    '...and the rotate DOES run on that frame -- $294666 falls through when the '
    + 'branch is not taken, so the fix is a branch and not a deletion. W437: '
    + 'half a fix is a removal');
  assert.equal(expiring.u8(A6 + 0x8b), 0xbf, '...on both parts');
  assert.equal(expiring.u8(A4 + 0x04), 0x3f,
    '...and the state-1 cadence ticks on that frame too');
  assert.equal(expiring.u16(A6 + 0x114), 1, '...and $294670 arms ($114,A6)');
  assert.equal(W441_MUTATE.value, null,
    'and the seam is null for this arm -- it is the ported board that is being '
    + 'measured here, not a mutation');
});

// ===========================================================================
// 3. THE BOARD'S OWN WITNESS -- NO PORT IN IT AT ALL
// ===========================================================================
test('W441: two board checkpoints settle it without the port: $812B14 says the '
  + 'wait ran 71 frames, and BOTH part facings fall by exactly 30 = 100 - 70',
{ skip: SKIP_LADDER }, () => {
  const a = boardRam(9100);
  const b = boardRam(9200);
  const u8 = (buf, ad) => buf[ad - RAM_BASE];
  const u16 = (buf, ad) => (buf[ad - RAM_BASE] << 8) | buf[ad - RAM_BASE + 1];

  assert.equal(u16(a, D14_SLOT + 0x00), 0x810e,
    'the D14 slot is live and its bit 0 is SET, so the A1 walk runs its STEP '
    + '($294658) and not its INIT on every one of these frames');
  assert.equal(u8(a, D14_SLOT + 0x06), 0x00, 'STATE 0 at lf9100 -- the wait');
  assert.equal(u16(a, D14_SLOT + 0x08), 0x47, '...with 71 frames left on it');
  assert.equal(u8(b, D14_SLOT + 0x06), 0x01, 'STATE 1 at lf9200');
  assert.equal(u16(b, D14_SLOT + 0x08), 0x00, '...and the counter is spent');
  assert.equal(u8(a, D14_SLOT + 0x03), 0xff,
    'the turn rate ($3,A4) is $FF = -1 at lf9100');
  assert.equal(u8(b, D14_SLOT + 0x03), 0xff, '...and still -1 at lf9200, so it '
    + 'is a constant over this window and every turn costs exactly one step');

  // The three numbers that all say THIRTY.
  assert.equal(u8(a, P1_FACE), 0x40, 'part 1 facing is $40 at lf9100');
  assert.equal(u8(b, P1_FACE), 0x22, '...and $22 at lf9200');
  assert.equal(0x40 - 0x22, 30,
    '...a fall of exactly THIRTY over ONE HUNDRED frames. 100 - 71 = 29 frames '
    + 'after the counter runs out, plus the frame it runs out ON, is 30');
  assert.equal(u8(a, P2_FACE), 0xc0, 'part 2 facing is $C0 at lf9100');
  assert.equal(u8(b, P2_FACE), 0xa2, '...and $A2 at lf9200 -- the same 30');
  assert.equal(0xc0 - 0xa2, 30, '...arithmetic stated, not eyeballed');
  assert.equal(u8(a, D14_SLOT + 0x04), 0x40,
    'and ($4,A4), the state-1 cadence, is $40 at lf9100');
  assert.equal(u8(b, D14_SLOT + 0x04), 0x22,
    '...and $22 at lf9200 -- $40 - 30, a THIRD independent count of the same 30 '
    + 'frames, because state 1 is the only state that ticks it');

  // And what the 8-bit reading predicts instead, off the same two bytes.
  assert.equal((0x40 - 100) & 0xff, 0xdc,
    'a script that turned on all 100 frames would leave part 1 at $DC. [M] '
    + 'before this wave the port left exactly $DC, and part 2 at $5C');
  assert.equal((0xc0 - 100) & 0xff, 0x5c, '...which is what it left');
  assert.notEqual(0xdc, 0x22,
    '...and $DC is not $22, so the two readings are distinguishable off the '
    + 'cartridge alone');
});

// ===========================================================================
// A shared runner.  The cache key carries the MUTATION, so a red run cannot be
// served a green run's numbers.
// ===========================================================================
const CACHE = new Map();

function boardRam(lf) {
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === lf);
  assert.ok(rung, `lf${lf} must be a rung`);
  return new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
}

async function makeGame(seedLf) {
  const { Game } = await import('../src/main.js');
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === seedLf);
  assert.ok(rung, `lf${seedLf} must be a rung`);
  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const pokes = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));
  return {
    game: new Game(seed, tables, {
      logicFrame: seedLf, videoFrame: rung.vf, bgSeed,
    }),
    pokes,
  };
}

const sameSlots = (board, port, base, slots, stride) => {
  let n = 0;
  const bad = [];
  for (let s = 0; s < slots; s++) {
    const o = base - RAM_BASE + s * stride;
    let ok = true;
    for (let k = 0; k < stride; k++) {
      if (board[o + k] !== port[o + k]) { ok = false; break; }
    }
    if (ok) n++; else bad.push(s);
  }
  return { n, bad };
};

/** Step `seedLf -> cmpLf` under `mut` and report everything every arm needs. */
async function segment(seedLf, cmpLf, mut = null) {
  const key = `${seedLf}->${cmpLf}/${mut}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const trace = readTrace(TRACE);
  const { game, pokes } = await makeGame(seedLf);
  const lo = BUL.pool;
  const hi = BUL.pool + BUL.slots * BUL.stride;
  let spawns = 0;
  let kills = 0;
  const orig = game.ram.setU16.bind(game.ram);
  game.ram.setU16 = (a, v) => {
    if (a >= lo && a < hi && ((a - lo) % BUL.stride) === 0) {
      const was = game.ram.u16(a) & 0x8000;
      const now = v & 0x8000;
      if (!was && now) spawns++;
      else if (was && !now) kills++;
    }
    orig(a, v);
  };

  const before = W441_MUTATE.value;
  W441_MUTATE.value = mut;
  const drawGap = [];
  let portPrev = game.ram.u16(RNG_STATE);
  let boardPrev = Number(trace.byLf.get(seedLf).rng);
  try {
    for (let lf = seedLf + 1; lf <= cmpLf; lf++) {
      const r = trace.byLf.get(lf);
      assert.ok(r, `the trace must carry lf${lf}`);
      for (const [a, v] of pokes) game.ram.setU8(a, v);
      game.step(Number(r.portin));
      const p = game.ram.u16(RNG_STATE);
      const bd = Number(r.rng);
      if (((p - portPrev) & 0xff) !== ((bd - boardPrev) & 0xff)) {
        drawGap.push([lf, (p - portPrev) & 0xff, (bd - boardPrev) & 0xff]);
      }
      portPrev = p; boardPrev = bd;
    }
  } finally {
    W441_MUTATE.value = before;         // reset discipline, W436's rule
  }

  const board = boardRam(cmpLf);
  const port = game.ram.b;
  let ramBytes = 0;
  let inPool = 0;
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== port[i]) {
      ramBytes++;
      if (i >= lo - RAM_BASE && i < hi - RAM_BASE) inPool++;
    }
  }
  const diffOf = (addr, len) => {
    let d = 0;
    for (let k = 0; k < len; k++) {
      if (board[addr - RAM_BASE + k] !== port[addr - RAM_BASE + k]) d++;
    }
    return d;
  };
  const kindOf = (buf) => {
    const m = new Map();
    for (let s = 0; s < BUL.slots; s++) {
      const o = BUL.pool - RAM_BASE + s * BUL.stride;
      const t = (buf[o] << 8) | buf[o + 1];
      if (t & 0x8000) m.set(t & 0x3f, (m.get(t & 0x3f) || 0) + 1);
    }
    return m;
  };
  const out = {
    board, port, drawGap, ramBytes, inPool, spawns, kills,
    bossBody: diffOf(BOSS_BODY, BOSS_LEN),
    d14Slot: diffOf(D14_SLOT, SLOT_LEN),
    boardKinds: kindOf(board),
    portKinds: kindOf(port),
    bul: sameSlots(board, port, BUL.pool, BUL.slots, BUL.stride),
    a: sameSlots(board, port, POOL_A.base, POOL_A.generalSlots, POOL_A.stride),
    b: sameSlots(board, port, POOL_B.base, POOL_B.slots, POOL_B.stride),
  };
  CACHE.set(key, out);
  return out;
}

// ===========================================================================
// 4. THE DELIVERABLE -- THE WHOLE BAND, INCLUDING THE ONE W440 LEFT OPEN
// ===========================================================================
test('W441: all SIX 100-frame rungs lf9000..lf9600 are 210/210 bullet slots '
  + 'with pool A 70/70 and pool B 80/80, where lf9100->9200 was 176 before this '
  + 'wave', { skip: SKIP_LADDER }, async () => {
  const band = [[9000, 9100], [9100, 9200], [9200, 9300], [9300, 9400],
    [9400, 9500], [9500, 9600]];
  for (const [s, c] of band) {
    const r = await segment(s, c);
    assert.deepEqual(r.bul.bad, [],
      `lf${s}->${c}: not one of the 210 bullet slots differs`);
    assert.equal(r.bul.n, BUL.slots, `lf${s}->${c} bullets 210/210, as a count`);
    assert.equal(r.a.n, POOL_A.generalSlots, `lf${s}->${c} pool A 70/70`);
    assert.equal(r.b.n, POOL_B.slots, `lf${s}->${c} pool B 80/80`);
    assert.deepEqual(r.drawGap, [], `lf${s}->${c} has no draw-gap frame`);
  }
});

test('W441: lf9100->9200 -- the segment W440 left at 176 -- spawns the board\'s '
  + '42 bullets and now FREES SIXTEEN where it freed eight, with no line of '
  + 'mover.js changed', { skip: SKIP_LADDER }, async () => {
  const r = await segment(9100, 9200);
  assert.equal(r.bul.n, BUL.slots, 'lf9100->9200 is 210/210, up from 176');
  assert.equal(r.spawns, 42,
    '42 spawns, the same 42 W440 measured -- the volley counts were never the '
    + 'problem and this wave did not change them');
  assert.equal(r.kills, 16,
    'and SIXTEEN frees, where the port made eight. W440 read that gap as an '
    + 'UNDER-FREE in mover.js/boundsKill. It is not: the eight extra frees are '
    + 'bullets that now leave the playfield because they were fired from the '
    + 'board\'s gun position instead of one 70 frames out of phase. '
    + 'src/mover.js is not touched by this wave');
  assert.equal(r.portKinds.get(0x13), 26, 'the port holds 26 live kind-$13');
  assert.equal(r.boardKinds.get(0x13), 26, '...and so does the board');
  assert.equal(r.portKinds.get(0x04), undefined,
    'and neither side has a kind-4 bullet on this rung');
  assert.equal(r.boardKinds.get(0x04), undefined, '...on both sides');
});

test('W441: the laser beam impact W440 left open closes with the SAME edit -- '
  + 'the lf9192/lf9194 draw gap is gone and no laser or spark code was touched',
{ skip: SKIP_LADDER }, async () => {
  const r = await segment(9100, 9200);
  assert.deepEqual(r.drawGap, [],
    'zero draw-gap frames over lf9101..lf9200. [M] before this wave the list '
    + 'was [[9192,0,4],[9194,0,4]] -- four draws the board made and the port did '
    + 'not, on two ticks of the beam-impact cadence. W440 measured that handing '
    + 'the port those 8 draws moved the bullet count by ZERO and concluded they '
    + 'were independent defects. They are independent SYMPTOMS: the beam impact '
    + 'is position-gated on the same boss part the bullets are fired from, so '
    + 'neither could move the other and one cause moves both');
  const red = await segment(9100, 9200, 'd14-wait-fallthrough');
  assert.deepEqual(red.drawGap, [[9192, 0, 4], [9194, 0, 4]],
    '...and restoring the 8-bit reading of $294666 alone brings BOTH missing '
    + 'sparks back, which is how the attribution is performed rather than '
    + 'argued. src/laser.js and src/spark.js are not touched by this wave');
});

// ===========================================================================
// 5. THE EVIDENCE THAT IS NOT IN THE BULLET POOL
// ===========================================================================
test('W441: the boss BODY struct $81523C -- which is not the bullet pool and '
  + 'not the script slots -- goes from 10 and 14 differing bytes to ZERO, and '
  + 'the segment that proves it has an EMPTY pool',
{ skip: SKIP_LADDER }, async () => {
  const r2 = await segment(9100, 9200);
  assert.equal(r2.bossBody, 0,
    'all $120 bytes of $81523C agree with the board at lf9200. [M] before this '
    + 'wave TEN differed, and the two that matter are the part FACINGS $815287 '
    + 'and $8152C7 -- the exact bytes $29467A and $29467E write');
  assert.equal(r2.port[P1_FACE - RAM_BASE], 0x22,
    '...part 1 facing is $22, the board\'s byte, where the port left $DC');
  assert.equal(r2.port[P2_FACE - RAM_BASE], 0xa2,
    '...and part 2 is $A2, where the port left $5C');
  assert.equal((r2.port[P1_POS - RAM_BASE + 2] << 8) | r2.port[P1_POS - RAM_BASE + 3],
    0x306c, '...and the part-1 position low word, which is what the guns fire '
    + 'from, is $306C where the port had $1234');
  assert.equal((r2.port[P2_POS - RAM_BASE + 2] << 8) | r2.port[P2_POS - RAM_BASE + 3],
    0x1119, '...and part 2 is $1119 where the port had $2F51');

  // The pool-free witness.
  const r1 = await segment(9000, 9100);
  assert.equal(r1.bul.n, BUL.slots,
    'lf9000->9100 was 210/210 BEFORE this wave and is 210/210 after');
  let live = 0;
  for (let s = 0; s < BUL.slots; s++) {
    const o = BUL.pool - RAM_BASE + s * BUL.stride;
    if (((r1.board[o] << 8) | r1.board[o + 1]) & 0x8000) live++;
  }
  assert.equal(live, 0,
    '...because the board\'s bullet pool is EMPTY at lf9100, so the bullet '
    + 'count on this segment cannot move in either direction');
  assert.equal(r1.bossBody, 0,
    '...and yet its boss-body divergence goes from FOURTEEN bytes to zero. A '
    + 'poke into an empty bullet pool cannot do that, which is the point');
  assert.equal(r1.ramBytes, 1202,
    '...and its whole-RAM divergence falls from 1,385 to 1,202 on a segment '
    + 'whose slot counts did not move at all');
});

test('W441: the D14 slot record itself is byte-identical to the board BEFORE '
  + 'and AFTER, which is why 440 waves of slot-record gates never saw this',
{ skip: SKIP_LADDER }, async () => {
  const green = await segment(9100, 9200);
  const red = await segment(9100, 9200, 'd14-wait-fallthrough');
  assert.equal(green.d14Slot, 0,
    'all $20 bytes of $812B14 agree with the board at lf9200');
  assert.equal(red.d14Slot, 0,
    '...and they agreed with it under the DEFECT too. The wait expired on the '
    + 'right frame either way; what was wrong was only the two bytes the '
    + 'fallen-through arm wrote into SOMEBODY ELSE\'S struct. A test that '
    + 'watched this record would have been green through the whole thing, and '
    + 'that is the trap this wave hands forward');
  assert.notEqual(green.bossBody, red.bossBody,
    '...while the boss body separates them, which is why the witness had to be '
    + 'chosen outside the structure that carries the script');
});

test('W441: whole-RAM divergence at lf9200 falls to 608 bytes, and a perfect '
  + 'bullet-pool poke could not have got below 1,582',
{ skip: SKIP_LADDER }, async () => {
  const red = await segment(9100, 9200, 'd14-wait-fallthrough');
  assert.equal(red.ramBytes, 2152,
    'the pre-wave divergence at lf9200 is 2,152 bytes');
  assert.equal(red.inPool, 570, '...of which 570 lie inside the bullet pool');
  assert.equal(red.ramBytes - red.inPool, 1582,
    '...so writing the board\'s entire 13,440-byte pool leaves 1,582 and cannot '
    + 'reach one byte lower. Arithmetic, not assertion');
  const r = await segment(9100, 9200);
  assert.equal(r.ramBytes, 608, 'the result is 608');
  assert.equal(r.inPool, 0, '...with NONE of it in the bullet pool');
  assert.ok(r.ramBytes < 1582,
    '...which is below the floor a perfect pool poke can reach, so the numbers '
    + 'above cannot have been produced by writing bullets');
});

// ===========================================================================
// 6. THE RED RUNS -- ONE BRANCH AT A TIME
// ===========================================================================
test('W441: RED -- restoring $294666\'s 8-bit reading alone reproduces the '
  + 'pre-wave numbers EXACTLY, on four independent measures',
{ skip: SKIP_LADDER }, async () => {
  const red = await segment(9100, 9200, 'd14-wait-fallthrough');
  assert.equal(red.bul.n, 176,
    'lf9100->9200 falls back to 176/210 -- W440\'s number, to the slot');
  assert.equal(red.kills, 8, '...with eight frees, W440\'s number');
  assert.equal(red.spawns, 42, '...and the same 42 spawns, which never moved');
  assert.equal(red.bossBody, 10, '...and ten differing boss-body bytes');
  assert.equal(red.port[P1_FACE - RAM_BASE], 0xdc,
    '...and part 1 facing back at $DC = $40 - 100: the arm turns the mount on '
    + 'every frame of the wait, which is the defect stated as a number');

  const red0 = await segment(9000, 9100, 'd14-wait-fallthrough');
  assert.equal(red0.bossBody, 14,
    'lf9000->9100 goes back to fourteen boss-body bytes...');
  assert.equal(red0.bul.n, BUL.slots,
    '...while its bullet count stays 210/210 under the defect as well. An arm '
    + 'that reddened every measure everywhere would be a blunt instrument '
    + 'rather than a cause');
  assert.equal(W441_MUTATE.value, null,
    'and the mutation is back to null after the red runs -- W436\'s reset '
    + 'discipline, asserted rather than trusted');
});

test('W441: RED -- restoring $29471E\'s 8-bit reading alone is a DIFFERENT '
  + 'defect in DIFFERENT segments, and it moves exactly one byte: $812B18',
{ skip: SKIP_LADDER }, async () => {
  // This arm is not reachable on lf9100->9200 at all -- state 2 is never
  // entered there -- so it cannot be a restatement of the first.
  const same = await segment(9100, 9200, 'd14-home-tick');
  assert.equal(same.ramBytes, 608,
    'lf9100->9200 is untouched by this arm: 608 bytes, the green number');
  assert.equal(same.bul.n, BUL.slots, '...and still 210/210');

  for (const [s, c, greenRam] of [[9400, 9500, 666], [9500, 9600, 606]]) {
    const g = await segment(s, c);
    const rr = await segment(s, c, 'd14-home-tick');
    assert.equal(g.ramBytes, greenRam, `lf${s}->${c} is ${greenRam} bytes green`);
    assert.equal(rr.ramBytes, greenRam + 1,
      `...and ${greenRam + 1} with the phantom cadence tick restored`);
    assert.equal(g.bul.n, BUL.slots, `lf${s}->${c} bullets stay 210/210 green`);
    assert.equal(rr.bul.n, BUL.slots,
      '...and 210/210 red too, so this arm is invisible to every pool count in '
      + 'the project and only a whole-RAM measure catches it');
    let where = -1;
    for (let i = 0; i < g.board.length; i++) {
      if (g.board[i] === g.port[i] && g.board[i] !== rr.port[i]) {
        assert.equal(where, -1,
          'exactly one address, stated as a uniqueness claim rather than a '
          + 'first match');
        where = i;
      }
    }
    assert.equal(where + RAM_BASE, D14_SLOT + 0x04,
      `...and the single byte it moves is ${hx(D14_SLOT + 0x04)}, the D14 `
      + 'cadence ($4,A4) -- exactly the byte $2946F0\'s subq writes, which is '
      + 'the instruction the 8-bit reading of $29471E falls into');
  }
  assert.equal(W441_MUTATE.value, null, 'reset discipline again');
});

test('W441: neither RED arm moves lf8800->8900 or lf8900->9000, which are 171 '
  + 'and 189 and are NOT this wave\'s', { skip: SKIP_LADDER }, async () => {
  for (const [s, c, n] of [[8800, 8900, 171], [8900, 9000, 189]]) {
    for (const mut of [null, 'd14-wait-fallthrough', 'd14-home-tick']) {
      const r = await segment(s, c, mut);
      assert.equal(r.bul.n, n,
        `lf${s}->${c} is ${n}/210 under ${mut === null ? 'the fix' : mut}. `
        + 'These two segments are older defects the brief did not mention; this '
        + 'wave states them so a later reader cannot credit them to it, and '
        + 'shows they do not move under either arm so they are not this cause');
    }
  }
});
