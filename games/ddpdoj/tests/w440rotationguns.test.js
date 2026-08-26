// WAVE 440 -- THE STAGE-1 BOSS'S THREE ROTATION GUNS WERE FREE-RUNNING.
// `$29690A`, `$29610E`/`$29621A` AND `$296116` ARE ALL `.W` BRANCHES, AND ALL
// FOUR OF THEM WERE READ AS 8-BIT.
//
// ---------------------------------------------------------------------------
// WHAT THE BRIEF SAID, AND WHERE IT WAS WRONG
// ---------------------------------------------------------------------------
// This wave's brief sent it at `lf9300->9400` (111/210) as "the worst" segment,
// and predicted pool A would follow if the bullet pool closed.  Pool A did
// follow -- lf9500->9600 goes 2/70 -> 70/70 with no pool-A code touched -- but
// the brief's table started at lf9300 and the defect did not.  [M] sweeping
// every 100-frame rung from lf8000 to lf10300 BEFORE this wave:
//
//     lf9000->9100 194   lf9100->9200 113   lf9200->9300 108
//     lf9300->9400 111   lf9400->9500 113   lf9500->9600 149
//
// so `lf9200->9300` at **108** was the worst, not lf9300->9400, and
// `lf9100->9200` carried a DRAW GAP -- two frames on which the board draws and
// the port does not -- that no earlier wave had reported.  One cause covers
// five of those six segments.
//
// ---------------------------------------------------------------------------
// THE DEFECT, AND HOW IT WAS FOUND
// ---------------------------------------------------------------------------
// [M] instrumenting every write to a bullet slot's type word over
// `lf9300->9400`: the port SPAWNS 128 bullets and FREES 80 where the board's
// live count goes 63 -> 85, and the spawns come from exactly two producers,
// both in `src/bossf23.js` -- `rotationGunStep` (kind $13, 80 of them) and
// `fire14Fan` (kind $4, 48).  `unportedLog` carries THIRTEEN lines over the
// window and every one of them is a per-frame background note; there is no
// counted note for any of this, so W439's "look for the note" does not apply
// here and this wave found the producers by the write log alone.
//
// [M] the same instrument on `lf9100->9200`, which the board enters with an
// EMPTY bullet pool, is what named it: the board finishes the window with 26
// live bullets, all kind $13 and **not one of kind $4**, while the port fires
// forty-eight kind-$4 bullets in the same 100 frames.  A gun that fires 48
// times where the board fires 0 is not an aiming bug.
//
// The board's own E14 slot says why, and it is the cleanest witness in this
// file.  `$812C18` at lf9100 and at lf9200:
//
//     lf9100   81 0E 00 00 77 50 00 00 00 01 00 0C
//     lf9200   81 0E 00 00 13 50 00 00 00 01 00 0C
//                          ^^                ^^
// ($4,A4) falls by exactly $64 = 100 -- one `subq.b` per frame -- and
// **($A,A4), the FIRE cadence, does not move at all**.  So on all 100 frames
// the board's `$2968FE` returned BEFORE `$296926`.  The port had no such exit.
//
// ---------------------------------------------------------------------------
// THE FOUR BRANCHES
// ---------------------------------------------------------------------------
//   $29690A  64 00 01 0C   bcc.W $296A18   the rts.  E14's outer cadence
//   $29610E  64 00 00 76   bcc.W $296186   the rts.  E5's whole body
//   $29621A  64 00 00 76   bcc.W $296292   the rts.  E6's whole body
//   $296116  64 00 00 16   bcc.W $29612E   NOT a return -- the $2 reload
//
// Read `64 00` as an 8-bit `bcc +0` and each becomes a branch to the NEXT
// instruction, i.e. no branch at all.  That is the trap that bit W437, W438 and
// W439, here four more times in two routines.  Its three consequences:
//
//  1. E14 ($2968FE) fell out of its outer cadence into its fire cadence, so the
//     gun fired every $C frames forever instead of one burst per outer period.
//  2. E5/E6 ($2960F4/$296200) grew a phantom "when not firing" arm that ticked
//     both sub-cadences and advanced the angle EVERY FRAME.
//  3. `subTickFn` returned where the ROM branches PAST TWO INSTRUCTIONS only,
//     losing `move.b ($3,A4),($2,A4)` -- the main cadence's own reload -- and
//     the `($10,A4)` tick, on every frame ($E,A4) did not borrow.
//
// ---------------------------------------------------------------------------
// HOW THIS TEST FAILS IF THE FIX IS FAKED
// ---------------------------------------------------------------------------
// The deliverable is seven 100-frame segments of a 13,440-byte pool, so the
// obvious fake is "write the board's bullets".  Four things make that useless:
//
//  1. **THE SCRIPT SLOTS ARE NOT IN THE POOL.**  `$812BD8`, `$812BF8` and
//     `$812C18` are boss-script slot records in the scheduler's A1 table.  [M]
//     before this wave they differed from the board by 3, 3 and 4 bytes at
//     lf9400 and by 4, 3 and 5 at lf9600; they now differ by ZERO at both.  No
//     write into the bullet pool can move them.
//  2. **MOST OF THE DIVERGENCE WAS NEVER IN THE POOL.**  [M] at lf9400 the
//     whole-RAM divergence was 4,043 bytes of which only 1,793 lay inside the
//     bullet pool.  A perfect pool poke could have reached 2,250.  It is now
//     **637**.
//  3. **THREE RED RUNS, PERFORMED AND NOT ARGUED.**  `W440_MUTATE` restores
//     each branch's 8-bit reading one at a time, and each one alone reddens the
//     ladder in its own pattern.  No single one reproduces the pre-wave numbers,
//     which is how all three are known to be load-bearing.
//  4. **THE ROM IS DECODED AND COUNTED.**  Thirteen instructions for E14's head
//     and thirty-four for E5's body, every byte asserted, every `.W`
//     displacement computed from its EXTENSION WORD, and the 8-bit reading
//     shown to land on the next instruction.
//
// ---------------------------------------------------------------------------
// WHAT THIS WAVE DOES **NOT** FIX, STATED PLAINLY
// ---------------------------------------------------------------------------
// `lf9100->9200` goes 113 -> **176** and stops there.  Two independent things
// are left in it and both are measured below rather than waved at:
//   * the port misses the LASER BEAM IMPACT spark on two of its 2-frame ticks,
//     lf9192 and lf9194, worth 4 RNG draws each.  [M] the producer of every
//     other tick in the window is `spawnBeamImpact289FC0` <- `runBeamDraw`
//     (src/laser.js -> src/spark.js, pool E) and NOT the bullet pool; and [M]
//     handing the port those 8 draws changes the bullet count by ZERO, so it is
//     not the cause of the rest.
//   * with the guns' own slot records byte-identical to the board at lf9200,
//     both guns make the board's number of shots ([M] 9 for E5 and 12 for E6,
//     off the angle field ($A,A4) alone, which steps by exactly +$0F and -$0F),
//     so the port SPAWNS the board's 42 -- and FREES 8 where the board frees
//     16.  That is an under-free, in a different subsystem.
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
import { W440_MUTATE } from '../src/bossf23.js';
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

// The nine rungs this wave stands on: the six the guns run under, and the ones
// above and below them that W434..W439 were already green on.
const RUNGS = [9000, 9100, 9200, 9300, 9400, 9500, 9600, 9700, 9800];
const ckOf = (lf) => path.join(CK, `c0${String(lf).padStart(5, '0')}.ram.bin`);
const HAVE_TABLES = fs.existsSync(TABLES);
const HAVE_IMAGE = fs.existsSync(IMAGE);
const HAVE_LADDER = fs.existsSync(MANIFEST) && fs.existsSync(TRACE)
  && RUNGS.every((lf) => fs.existsSync(ckOf(lf)));
const SKIP_LADDER = (HAVE_TABLES && HAVE_LADDER) ? false
  : 'the W69 stage1-laser-hold ladder (rungs lf9000..lf9800) or '
    + 'rip/port/player.tables.json is absent -- rebuild with pgm.py ckpt and '
    + '`python tools/export-tables.py`. THIS IS A SKIP, NOT A PASS.';
const SKIP_IMAGE = HAVE_IMAGE ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';

const RAM_BASE = 0x800000;
const RNG_STATE = 0x803916;

// The three boss-script slot records the guns run out of.  They live in the
// scheduler's A1 table at $812B..$812C, nowhere near the bullet pool.
const SLOT_E5 = 0x812bd8;
const SLOT_E6 = 0x812bf8;
const SLOT_E14 = 0x812c18;
const SLOTS = [['E5', SLOT_E5], ['E6', SLOT_E6], ['E14', SLOT_E14]];
const SLOT_LEN = 0x20;

const hx = (v) => `$${v.toString(16).toUpperCase()}`;
const s8 = (v) => (v >= 0x80 ? v - 0x100 : v);
const s16 = (v) => (v >= 0x8000 ? v - 0x10000 : v);

// ===========================================================================
// 1. THE ROM -- E14's HEAD, THIRTEEN INSTRUCTIONS, COUNTED
// ===========================================================================
test('W440: $2968FE..$296939 decodes to THIRTEEN instructions that consume the '
  + 'span exactly, and $29690A is a bcc.W to $296A18 -- the rts -- computed '
  + 'from its EXTENSION WORD',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];

  const INSNS = [
    [0x2968fe, [0x4a, 0x2c, 0x00, 0x08], 'tst.b ($8,A4) -- the outer-cadence gate'],
    [0x296902, [0x66, 0x00, 0x00, 0x22], 'bne.W $296926 -- straight to the fire cadence'],
    [0x296906, [0x53, 0x2c, 0x00, 0x04], 'subq.b #1,($4,A4) -- A BYTE COUNTER'],
    [0x29690a, [0x64, 0x00, 0x01, 0x0c], 'bcc.W $296A18 -- THE RTS. The whole wave'],
    [0x29690e, [0x0c, 0x2c, 0x00, 0x10, 0x00, 0x05], 'cmpi.b #$10,($5,A4)'],
    [0x296914, [0x63, 0x04], 'bls $29691A -- UNSIGNED, and 8-bit: the byte is $04'],
    [0x296916, [0x59, 0x2c, 0x00, 0x05], 'subq.b #4,($5,A4) -- the period tightens'],
    [0x29691a, [0x19, 0x6c, 0x00, 0x05, 0x00, 0x04], 'move.b ($5,A4),($4,A4)'],
    [0x296920, [0x19, 0x6c, 0x00, 0x09, 0x00, 0x08], 'move.b ($9,A4),($8,A4)'],
    [0x296926, [0x53, 0x2c, 0x00, 0x0a], 'subq.b #1,($A,A4) -- the FIRE cadence'],
    [0x29692a, [0x64, 0x00, 0x00, 0xec], 'bcc.W $296A18 -- the port always had THIS one'],
    [0x29692e, [0x19, 0x6c, 0x00, 0x0b, 0x00, 0x0a], 'move.b ($B,A4),($A,A4)'],
    [0x296934, [0x08, 0x6d, 0x00, 0x00, 0x00, 0x03], 'bchg #0,($3,A5)'],
  ];
  let a = 0x2968fe;
  for (const [addr, bytes, what] of INSNS) {
    assert.equal(a, addr, `the decode must reach ${hx(addr)} (${what}); the `
      + `instruction before it ended at ${hx(a)}`);
    assert.deepEqual(at(addr, bytes.length), bytes, `${hx(addr)} ${what}`);
    a += bytes.length;
  }
  assert.equal(INSNS.length, 13,
    'THIRTEEN instructions, stated as a COUNT -- W434 lost one instruction to a '
    + 'uniform-looking block, so the number is asserted and not eyeballed');
  assert.equal(a, 0x29693a, 'and the decode consumes the span exactly');
  assert.deepEqual(at(0x29693a, 4), [0x4a, 0x2e, 0x00, 0x3f],
    `${hx(0x29693a)} tst.b ($3F,A6) -- part 1's gate, so the head cannot be one `
    + 'instruction longer than this decode says');
  assert.deepEqual(at(0x296a18, 2), [0x4e, 0x75],
    `${hx(0x296a18)} IS an rts, which is what both bcc.W forms branch to`);

  // THE THREE WIDE BRANCHES OF THIS BLOCK, each computed from its own
  // extension word, and each shown to be UNREADABLE as an 8-bit form.
  for (const [addr, target, what] of [
    [0x296902, 0x296926, 'bne.W -> the fire cadence'],
    [0x29690a, 0x296a18, 'bcc.W -> the rts. THE MISSING EXIT'],
    [0x29692a, 0x296a18, 'bcc.W -> the rts'],
  ]) {
    assert.equal(img[addr + 1], 0x00,
      `${hx(addr)}'s displacement byte is $00, which is what makes it the .W `
      + 'form: the displacement lives in the NEXT WORD');
    const ext = (img[addr + 2] << 8) | img[addr + 3];
    assert.equal(addr + 2 + s16(ext), target,
      `${hx(addr)} ${what}: ${hx(addr + 2)} + ${hx(s16(ext))} = ${hx(target)}`);
    assert.equal(addr + 2 + s8(0x00), addr + 2,
      `...and the 8-bit reading of ${hx(addr)} lands on ${hx(addr + 2)}, the `
      + 'NEXT INSTRUCTION -- a branch that does nothing. That reading is what '
      + 'the port carried at $29690A and it deleted an entire arm');
    assert.notEqual(addr + 2, target,
      '...which is a different address from the real target, so the two '
      + 'readings are distinguishable and this assertion can fail');
  }
});

// ===========================================================================
// 2. THE ROM -- E5's BODY, THIRTY-FOUR INSTRUCTIONS, AND E6 IS THE SAME 148
//    BYTES WITH SIX DIFFERENCES
// ===========================================================================
test('W440: $2960F4..$296187 decodes to THIRTY-FOUR instructions; $29610E is a '
  + 'bcc.W to the routine\'s OWN rts and $296116 is a bcc.W PAST TWO '
  + 'INSTRUCTIONS, not a return',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];

  const INSNS = [
    [0x2960f4, [0x4a, 0x2e, 0x00, 0x3f], 'tst.b ($3F,A6) -- part 5 dead?'],
    [0x2960f8, [0x66, 0x00, 0x00, 0x8c], 'bne.W $296186 (the rts)'],
    [0x2960fc, [0x24, 0x2e, 0x00, 0x22], 'move.l ($22,A6),D2 -- the part position'],
    [0x296100, [0x06, 0x82, 0xf6, 0xc0, 0x01, 0x40], 'addi.l #$F6C00140,D2'],
    [0x296106, [0x76, 0x00], 'moveq #0,D3'],
    [0x296108, [0x78, 0x00], 'moveq #0,D4'],
    [0x29610a, [0x53, 0x2c, 0x00, 0x02], 'subq.b #1,($2,A4) -- the MAIN cadence'],
    [0x29610e, [0x64, 0x00, 0x00, 0x76], 'bcc.W $296186 -- THE RTS. The whole body'],
    [0x296112, [0x53, 0x2c, 0x00, 0x0e], 'subq.b #1,($E,A4) -- sub-cadence 1'],
    [0x296116, [0x64, 0x00, 0x00, 0x16], 'bcc.W $29612E -- PAST TWO INSTRUCTIONS'],
    [0x29611a, [0x19, 0x6c, 0x00, 0x0f, 0x00, 0x0e], 'move.b ($F,A4),($E,A4)'],
    [0x296120, [0x0c, 0x2c, 0x00, 0x03, 0x00, 0x03], 'cmpi.b #$3,($3,A4)'],
    [0x296126, [0x67, 0x00, 0x00, 0x06], 'beq.W $29612E -- the floor at 3'],
    [0x29612a, [0x53, 0x2c, 0x00, 0x03], 'subq.b #1,($3,A4)'],
    [0x29612e, [0x19, 0x6c, 0x00, 0x03, 0x00, 0x02], 'move.b ($3,A4),($2,A4) -- '
      + 'the main cadence RELOAD, which $296116 branches TO and not over'],
    [0x296134, [0x53, 0x2c, 0x00, 0x10], 'subq.b #1,($10,A4) -- sub-cadence 2'],
    [0x296138, [0x64, 0x00, 0x00, 0x08], 'bcc.W $296142'],
    [0x29613c, [0x19, 0x6c, 0x00, 0x11, 0x00, 0x10], 'move.b ($11,A4),($10,A4)'],
    [0x296142, [0x72, 0x00], 'moveq #0,D1'],
    [0x296144, [0x12, 0x2c, 0x00, 0x0a], 'move.b ($A,A4),D1 -- THE ANGLE'],
    [0x296148, [0x30, 0x2c, 0x00, 0x14], 'move.w ($14,A4),D0'],
    [0x29614c, [0x48, 0x40], 'swap D0'],
    [0x29614e, [0x30, 0x3c, 0x00, 0x13], 'move.w #$13,D0 -- KIND $13'],
    [0x296152, [0x4e, 0xb9, 0x00, 0x28, 0x17, 0x64], 'jsr $281764 -- bank B spread2'],
    [0x296158, [0x06, 0x01, 0x00, 0x80], 'addi.b #$80,D1 -- the opposite side'],
    [0x29615c, [0x4e, 0xb9, 0x00, 0x28, 0x17, 0x64], 'jsr $281764'],
    [0x296162, [0x4a, 0x79, 0x00, 0x81, 0x30, 0x98], 'tst.w $813098 -- RANK'],
    [0x296168, [0x67, 0x00, 0x00, 0x16], 'beq.W $296180 -- rank 0 skips two shots'],
    [0x29616c, [0x06, 0x01, 0x00, 0x40], 'addi.b #$40,D1'],
    [0x296170, [0x4e, 0xb9, 0x00, 0x28, 0x16, 0xf6], 'jsr $2816F6'],
    [0x296176, [0x06, 0x01, 0x00, 0x80], 'addi.b #$80,D1'],
    [0x29617a, [0x4e, 0xb9, 0x00, 0x28, 0x16, 0xf6], 'jsr $2816F6'],
    [0x296180, [0x06, 0x2c, 0x00, 0x0f, 0x00, 0x0a], 'addi.b #$F,($A,A4) -- ADVANCE'],
    [0x296186, [0x4e, 0x75], 'rts'],
  ];
  let a = 0x2960f4;
  for (const [addr, bytes, what] of INSNS) {
    assert.equal(a, addr, `the decode must reach ${hx(addr)} (${what}); the `
      + `instruction before it ended at ${hx(a)}`);
    assert.deepEqual(at(addr, bytes.length), bytes, `${hx(addr)} ${what}`);
    a += bytes.length;
  }
  assert.equal(INSNS.length, 34, 'THIRTY-FOUR instructions, stated as a COUNT');
  assert.equal(a, 0x296188, 'and the decode consumes the span exactly, ending '
    + 'one byte past the rts where E6\'s init begins');
  assert.deepEqual(at(0x296188, 6), [0x19, 0x7c, 0x00, 0x20, 0x00, 0x02],
    '$296188 move.b #$20,($2,A4) -- E6\'s INIT, so E5\'s body cannot be one '
    + 'instruction longer than this decode says');

  // THE SIX WIDE BRANCHES, each from its OWN extension word.  $296116 is the
  // one that matters most: it is NOT a return, and the port had made it one.
  for (const [addr, target, what] of [
    [0x2960f8, 0x296186, 'bne.W -> the rts (the part is dead)'],
    [0x29610e, 0x296186, 'bcc.W -> THE RTS: a non-firing frame does NOTHING'],
    [0x296116, 0x29612e, 'bcc.W -> $29612E, the ($3,A4)->($2,A4) reload. NOT a return'],
    [0x296126, 0x29612e, 'beq.W -> $29612E, the floor at 3'],
    [0x296138, 0x296142, 'bcc.W -> $296142, past the ($10,A4) reload'],
    [0x296168, 0x296180, 'beq.W -> $296180, the rank-0 skip'],
  ]) {
    assert.equal(img[addr + 1], 0x00,
      `${hx(addr)}'s displacement byte is $00 -- the .W form`);
    const ext = (img[addr + 2] << 8) | img[addr + 3];
    assert.equal(addr + 2 + s16(ext), target, `${hx(addr)} ${what}`);
    assert.notEqual(addr + 2, target,
      `...and the 8-bit reading lands on ${hx(addr + 2)} instead, which is a `
      + 'different address -- so this assertion can fail');
  }
  assert.notEqual(0x296118 + s8(0x00), 0x29612e,
    '$296116 read as an 8-bit branch lands on $29611A -- the reload it is '
    + 'supposed to SKIP -- while the return the port implemented skips $29612E '
    + 'as well. Three readings, and only the extension word picks one');

  // E6 IS THE SAME ROUTINE.  Asserting that as a byte diff is what lets ROT5
  // and ROT6 share one body in the port, and it names every field that differs.
  const N = 148;
  const diff = [];
  for (let i = 0; i < N; i++) {
    if (img[0x2960f4 + i] !== img[0x296200 + i]) diff.push(i);
  }
  assert.deepEqual(diff, [0x03, 0x0b, 0x0f, 0x10, 0x11, 0x8c],
    '$2960F4 and $296200 are the same 148 bytes but for SIX: the dead-flag '
    + 'offset (+$3: $3F vs $7F), the position offset (+$B: $22 vs $62), three '
    + 'bytes of the `addi.l` bias, and +$8C -- `06` vs `04`, i.e. addi.b vs '
    + 'subi.b, which is why E5 advances its angle by +$F and E6 by -$F');
  assert.deepEqual([...img.subarray(0x29628c, 0x296292)],
    [0x04, 0x2c, 0x00, 0x0f, 0x00, 0x0a],
    '...and $29628C IS `subi.b #$F,($A,A4)`');
  assert.deepEqual([...img.subarray(0x296292, 0x296294)], [0x4e, 0x75],
    '...and $296292 is E6\'s rts, the address its own bcc.W reaches');
  assert.deepEqual([...img.subarray(0x29621a, 0x29621e)], [0x64, 0x00, 0x00, 0x76],
    '...and $29621A carries the identical `64 00 00 76`, so both guns lost the '
    + 'same arm to the same misreading');
  assert.equal(0x29621c + s16(0x0076), 0x296292,
    '...whose target is E6\'s OWN rts, computed from E6\'s own extension word');
});

test('W440: this wave declares NO ROM window -- it changes transcribed code and '
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
// A shared runner.  Every arm reads from this cache, so a segment is stepped
// ONCE however many assertions stand on it -- and the cache key carries the
// MUTATION, so a red run cannot be served a green run's numbers.
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
    seed,
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

/** Step `seedLf -> cmpLf` under `mut`, and report everything every arm needs.
 *  The spawn/kill ledger is W439's instrument: every write to a bullet slot's
 *  TYPE WORD that flips it alive or dead, so spawns and kills are COUNTED
 *  rather than inferred from the end state. */
async function segment(seedLf, cmpLf, mut = null) {
  const key = `${seedLf}->${cmpLf}/${mut}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const trace = readTrace(TRACE);
  const { game, pokes } = await makeGame(seedLf);
  const lo = BUL.pool;
  const hi = BUL.pool + BUL.slots * BUL.stride;
  const spawns = [];
  const kills = [];
  const orig = game.ram.setU16.bind(game.ram);
  let cur = seedLf;
  game.ram.setU16 = (a, v) => {
    if (a >= lo && a < hi && ((a - lo) % BUL.stride) === 0) {
      const was = game.ram.u16(a) & 0x8000;
      const now = v & 0x8000;
      if (!was && now) spawns.push([cur, (a - lo) / BUL.stride, v & 0x3f]);
      else if (was && !now) kills.push([cur, (a - lo) / BUL.stride]);
    }
    orig(a, v);
  };

  const before = W440_MUTATE.value;
  W440_MUTATE.value = mut;
  const drawGap = [];
  let portPrev = game.ram.u16(RNG_STATE);
  let boardPrev = Number(trace.byLf.get(seedLf).rng);
  try {
    for (let lf = seedLf + 1; lf <= cmpLf; lf++) {
      cur = lf;
      const r = trace.byLf.get(lf);
      assert.ok(r, `the trace must carry lf${lf}`);
      for (const [a, v] of pokes) game.ram.setU8(a, v);
      game.step(Number(r.portin));
      const p = game.ram.u16(RNG_STATE);
      const b = Number(r.rng);
      if (((p - portPrev) & 0xff) !== ((b - boardPrev) & 0xff)) {
        drawGap.push([lf, (p - portPrev) & 0xff, (b - boardPrev) & 0xff]);
      }
      portPrev = p; boardPrev = b;
    }
  } finally {
    W440_MUTATE.value = before;         // reset discipline, W436's rule
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
  const slotBad = {};
  for (const [name, addr] of SLOTS) {
    let d = 0;
    for (let k = 0; k < SLOT_LEN; k++) {
      if (board[addr - RAM_BASE + k] !== port[addr - RAM_BASE + k]) d++;
    }
    slotBad[name] = d;
  }
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
    board, port, drawGap, ramBytes, inPool, slotBad, spawns, kills,
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
// 3. THE BOARD'S OWN WITNESS -- the rung is load-bearing (W435's trap)
// ===========================================================================
test('W440: the BOARD\'s E14 slot $812C18 proves the missing exit without the '
  + 'port being involved: over lf9100->9200 ($4,A4) falls by exactly 100 and '
  + '($A,A4), the fire cadence, does not move at all',
{ skip: SKIP_LADDER }, () => {
  const a = boardRam(9100);
  const b = boardRam(9200);
  const u8 = (buf, ad) => buf[ad - RAM_BASE];

  assert.equal(u8(a, SLOT_E14 + 0x00), 0x81,
    'the slot is present and its bit 0 is SET, so the A1 walk runs its STEP '
    + '($2968FE) and not its INIT on every one of these frames');
  assert.equal(u8(a, SLOT_E14 + 0x01), 0x0e, '...script id $0E, which is E14');
  assert.equal(u8(a, SLOT_E14 + 0x08), 0x00,
    '($8,A4) = 0 at lf9100, so $2968FE\'s `tst.b` is ZERO and the `bne.W` at '
    + '$296902 is NOT taken -- the outer cadence runs on every frame');
  assert.equal(u8(a, SLOT_E14 + 0x04), 0x77, '($4,A4) = $77 at lf9100');
  assert.equal(u8(b, SLOT_E14 + 0x04), 0x13, '...and $13 at lf9200');
  assert.equal(0x77 - 0x13, 100,
    '...a fall of exactly ONE HUNDRED over one hundred frames, which is one '
    + '`subq.b #1` per frame with no borrow: arithmetic stated, not eyeballed');
  assert.equal(u8(a, SLOT_E14 + 0x0a), 0x00, '($A,A4) = 0 at lf9100');
  assert.equal(u8(b, SLOT_E14 + 0x0a), 0x00,
    '...AND 0 at lf9200. The fire cadence at $296926 was not reached on ANY of '
    + 'the 100 frames, so the board took the `bcc.W` to the rts every time. '
    + 'That is the whole defect, read off the board and not off the port');
  assert.equal(u8(a, SLOT_E14 + 0x0b), 0x0c,
    '...with ($B,A4) = $0C, the reload the gun would use if it ever fired -- so '
    + 'a port that reached $296926 fires every 13 frames, which is exactly what '
    + 'this one did');

  // And the same window on the bullet pool: the board fires NOTHING of kind 4.
  let k4 = 0;
  let live = 0;
  for (let s = 0; s < BUL.slots; s++) {
    const o = BUL.pool - RAM_BASE + s * BUL.stride;
    const t = (b[o] << 8) | b[o + 1];
    if (t & 0x8000) { live++; if ((t & 0x3f) === 4) k4++; }
  }
  let seedLive = 0;
  for (let s = 0; s < BUL.slots; s++) {
    const o = BUL.pool - RAM_BASE + s * BUL.stride;
    if ((a[o] << 8 | a[o + 1]) & 0x8000) seedLive++;
  }
  assert.equal(seedLive, 0,
    'the board enters lf9100 with an EMPTY bullet pool, which is what makes '
    + 'this window a clean statement about what was fired inside it');
  assert.equal(live, 26, '...and leaves lf9200 with 26 live bullets');
  assert.equal(k4, 0,
    '...NOT ONE of them of kind 4. E14 is the only kind-4 producer on this '
    + 'rung, so the board fired it zero times in 100 frames');
});

// ===========================================================================
// 4. THE DELIVERABLE
// ===========================================================================
test('W440: SEVEN of the eight 100-frame rungs lf9000..lf9800 are 210/210 '
  + 'bullet slots with pool A 70/70 and pool B 80/80, where five of them were '
  + '194, 108, 111, 113 and 149 before this wave',
{ skip: SKIP_LADDER }, async () => {
  const green = [[9000, 9100], [9200, 9300], [9300, 9400], [9400, 9500],
    [9500, 9600], [9600, 9700], [9700, 9800]];
  for (const [s, c] of green) {
    const r = await segment(s, c);
    assert.deepEqual(r.bul.bad, [],
      `lf${s}->${c}: not one of the 210 bullet slots differs`);
    assert.equal(r.bul.n, BUL.slots, `lf${s}->${c} bullets 210/210, as a count`);
    assert.equal(r.a.n, POOL_A.generalSlots, `lf${s}->${c} pool A 70/70`);
    assert.equal(r.b.n, POOL_B.slots, `lf${s}->${c} pool B 80/80`);
    assert.deepEqual(r.drawGap, [], `lf${s}->${c} has no draw-gap frame`);
  }
});

test('W440: lf9500->9600 carries pool A from 2/70 to 70/70 with NO pool-A code '
  + 'touched -- W438\'s claim that pool A is byte-perfect exactly where the '
  + 'bullet pool is, turned into a measurement',
{ skip: SKIP_LADDER }, async () => {
  const r = await segment(9500, 9600);
  assert.equal(r.a.n, POOL_A.generalSlots,
    'pool A is 70/70 at lf9600. Before this wave it was 2/70 on this exact '
    + 'segment and W439 asserted that number so it could not be quietly '
    + 'claimed later. This wave changed src/bossf23.js and nothing else');
  assert.equal(r.bul.n, BUL.slots, '...and the bullet pool is 210/210');
  const bA = boardRam(9600);
  let liveA = 0;
  for (let s = 0; s < POOL_A.generalSlots; s++) {
    const o = POOL_A.base - RAM_BASE + s * POOL_A.stride;
    if ((bA[o] << 8 | bA[o + 1]) & 0x8000) liveA++;
  }
  assert.equal(liveA, 68,
    '...and the rung is load-bearing: the board holds 68 LIVE pool-A records '
    + 'at lf9600, so 70/70 is a statement about a full pool and not about 70 '
    + 'empty slots agreeing');
});

test('W440: the three boss-script slot records -- which are NOT in the bullet '
  + 'pool -- now match the board byte for byte, where they differed by 3, 3 '
  + 'and 4 bytes before',
{ skip: SKIP_LADDER }, async () => {
  for (const [s, c] of [[9100, 9200], [9300, 9400], [9500, 9600]]) {
    const r = await segment(s, c);
    assert.deepEqual(r.slotBad, { E5: 0, E6: 0, E14: 0 },
      `lf${s}->${c}: all 32 bytes of $812BD8, $812BF8 and $812C18 agree with `
      + 'the board. These live in the scheduler\'s A1 slot table; no write into '
      + 'the bullet pool can reach them, which is what makes the pool numbers '
      + 'above unfakeable');
  }
  // The fields the fix is ABOUT, named and checked against the board.
  const r = await segment(9300, 9400);
  const b = boardRam(9400);
  const at = (buf, ad) => buf[ad - RAM_BASE];
  assert.equal(at(b, SLOT_E14 + 0x04), 0x3e, 'the board\'s ($4,A4) is $3E');
  assert.equal(at(r.port, SLOT_E14 + 0x04), 0x3e,
    '...and the port\'s is $3E. [M] before this wave it was $3B, because the '
    + 'outer cadence kept reloading a period it had no right to reach');
  assert.equal(at(b, SLOT_E14 + 0x08), 0x00, 'the board\'s ($8,A4) is $00');
  assert.equal(at(r.port, SLOT_E14 + 0x08), 0x00,
    '...and the port\'s is $00, where it was $F9 -- a counter that had wrapped '
    + 'through zero because nothing ever stopped it being decremented');
  assert.equal(at(b, SLOT_E5 + 0x0a), 0x3a,
    'and E5\'s ANGLE ($A,A4) is $3A on the board');
  assert.equal(at(r.port, SLOT_E5 + 0x0a), 0x3a,
    '...and $3A in the port, where it was $9F. The angle steps by exactly $F '
    + 'per volley, so this single byte COUNTS THE VOLLEYS: the phantom arm had '
    + 'been advancing it on every frame instead');
});

test('W440: the port makes the board\'s number of RNG draws on every frame of '
  + 'the five segments the guns run under',
{ skip: SKIP_LADDER }, async () => {
  for (const [s, c] of [[9000, 9100], [9200, 9300], [9300, 9400],
    [9400, 9500], [9500, 9600]]) {
    const r = await segment(s, c);
    assert.deepEqual(r.drawGap, [],
      `lf${s}->${c}: zero draw-gap frames. The guns' fan generators draw no RNG `
      + 'at rank 0, which is why every draw-count gate in the project stayed '
      + 'green while three guns free-ran for five hundred frames');
  }
});

test('W440: whole-RAM divergence at lf9400 falls to 637 bytes, and most of what '
  + 'it replaced was never in the bullet pool at all',
{ skip: SKIP_LADDER }, async () => {
  const r = await segment(9300, 9400);
  assert.equal(r.ramBytes, 637,
    '637 bytes of the work RAM differ at lf9400, down from 4,043 before this '
    + 'wave');
  assert.equal(r.inPool, 0,
    '...and NONE of them is in the bullet pool. [M] of the 4,043, only 1,793 '
    + 'were: a fake that wrote the board\'s whole 13,440-byte pool could have '
    + 'reached 2,250 and not one byte lower');
  const r2 = await segment(9500, 9600);
  assert.equal(r2.ramBytes, 606,
    'lf9600 is 606 bytes, down from 3,235. **W441 REWROTE THIS NUMBER FROM 607**'
    + ' -- not because W440\'s measurement was wrong, but because W441 corrected'
    + ' a SECOND wide branch, `$29471E`, whose only effect on this segment is'
    + ' one byte: $812B18, the D14 cadence. W440\'s 607 is still exactly what'
    + ' this segment measures with that branch read as 8-bit, and W441\'s'
    + ' `d14-home-tick` RED arm asserts it there');
  assert.equal(r2.inPool, 0, '...also with nothing left in the pool');
});

// ===========================================================================
// 5. THE RED RUNS -- PERFORMED, ONE BRANCH AT A TIME
// ===========================================================================
test('W440: RED -- restoring $29690A\'s 8-bit reading alone (E14 falls through '
  + 'into its fire cadence) reddens FIVE segments and drops pool A to 60/70',
{ skip: SKIP_LADDER }, async () => {
  const red = [[9000, 9100, 198], [9200, 9300, 128], [9300, 9400, 140],
    [9400, 9500, 134], [9500, 9600, 175]];
  for (const [s, c, n] of red) {
    const r = await segment(s, c, 'e14-fallthrough');
    assert.equal(r.bul.n, n,
      `lf${s}->${c} goes to ${n}/210 with the E14 exit refused -- the branch is `
      + 'shown to be load-bearing by removing it, not by asserting it');
  }
  const r = await segment(9500, 9600, 'e14-fallthrough');
  assert.equal(r.a.n, 60,
    '...and pool A falls to 60/70 on lf9500->9600. One over-firing gun in '
    + 'src/bossf23.js moves a pool in src/bee.js, which is the shape W438 '
    + 'measured and could not attribute');
  const g = await segment(9500, 9600);
  assert.equal(g.a.n, POOL_A.generalSlots,
    '...while the same segment with the branch decoded is 70/70, so the two '
    + 'runs differ in exactly this branch and nothing else');
});

test('W440: RED -- restoring $29610E/$29621A\'s 8-bit reading alone (the '
  + 'phantom "when not firing" arm) reddens four segments and collapses pool A '
  + 'to 5/70', { skip: SKIP_LADDER }, async () => {
  const red = [[9200, 9300, 148], [9300, 9400, 128], [9400, 9500, 131],
    [9500, 9600, 156]];
  for (const [s, c, n] of red) {
    const r = await segment(s, c, 'rotgun-fallthrough');
    assert.equal(r.bul.n, n,
      `lf${s}->${c} goes to ${n}/210 with the phantom arm restored`);
  }
  const r = await segment(9500, 9600, 'rotgun-fallthrough');
  assert.equal(r.a.n, 5, '...and pool A collapses to 5/70');
  const clean = await segment(9000, 9100, 'rotgun-fallthrough');
  assert.equal(clean.bul.n, BUL.slots,
    '...while lf9000->9100 stays 210/210 under this arm alone, because E5/E6 '
    + 'and E14 are DIFFERENT guns: an arm that reddened every segment would be '
    + 'evidence of a blunt instrument rather than of a cause');
});

test('W440: RED -- restoring $296116 as a RETURN alone (losing the main '
  + 'cadence\'s own reload) reddens the same four segments to DIFFERENT numbers',
{ skip: SKIP_LADDER }, async () => {
  const red = [[9200, 9300, 150], [9300, 9400, 129], [9400, 9500, 131],
    [9500, 9600, 159]];
  for (const [s, c, n] of red) {
    const r = await segment(s, c, 'subtick-return');
    assert.equal(r.bul.n, n,
      `lf${s}->${c} goes to ${n}/210 with $296116 read as a return`);
  }
  // The two rotation-gun arms are NOT the same edit, and this is how that is
  // known: they redden the same segments to DIFFERENT numbers.
  const a = await segment(9200, 9300, 'rotgun-fallthrough');
  const b = await segment(9200, 9300, 'subtick-return');
  assert.notEqual(a.bul.n, b.bul.n,
    'lf9200->9300 is 148 under one arm and 150 under the other, so the two '
    + 'branches are independent defects and neither is a restatement of the '
    + 'other. Both had to be decoded');
  assert.equal(W440_MUTATE.value, null,
    'and the mutation is back to null after every red run -- W436\'s reset '
    + 'discipline, asserted rather than trusted');
});

test('W440: RED -- no single arm reproduces the pre-wave numbers, so all three '
  + 'are load-bearing', { skip: SKIP_LADDER }, async () => {
  // [M] the pre-wave numbers, measured on a `git archive HEAD` copy of src/ and
  // not asserted from a brief: 194, 108, 111, 113, 149.
  const BEFORE = { 9000: 194, 9200: 108, 9300: 111, 9400: 113, 9500: 149 };
  for (const mut of ['e14-fallthrough', 'rotgun-fallthrough', 'subtick-return']) {
    let matches = 0;
    for (const s of Object.keys(BEFORE).map(Number)) {
      const r = await segment(s, s + 100, mut);
      if (r.bul.n === BEFORE[s]) matches++;
    }
    assert.ok(matches < 5,
      `restoring '${mut}' alone matched the pre-wave count on ${matches} of the `
      + 'five segments, and it must not match all five: if one arm reproduced '
      + 'the whole defect, the other two would be changes this wave made for no '
      + 'reason. W437\'s trap -- half a fix is a removal -- from the other side');
  }
});

// ===========================================================================
// 6. THE SPAWN LEDGER -- W439's INSTRUMENT, AND WHAT IT SAYS NOW
// ===========================================================================
test('W440: over lf9300->9400 the port spawns TWELVE kind-4 bullets where it '
  + 'spawned forty-eight, and its live kind-4 and kind-$13 populations equal '
  + 'the board\'s',
{ skip: SKIP_LADDER }, async () => {
  const r = await segment(9300, 9400);
  const byKind = new Map();
  for (const [, , k] of r.spawns) byKind.set(k, (byKind.get(k) || 0) + 1);
  assert.equal(byKind.get(0x04), 12,
    'TWELVE kind-4 spawns over the window. [M] before this wave there were '
    + 'FORTY-EIGHT -- four bursts where the board fires one');
  assert.equal(byKind.get(0x13), 100,
    '...and ONE HUNDRED of kind $13, where before this wave there were 80. The '
    + 'rotation guns fire MORE now, not less: the phantom arm advanced their '
    + 'angle and ticked their sub-cadences on frames they should have been '
    + 'idle, which drove ($3,A4) down to its floor of 3 and then starved the '
    + 'main cadence of the reloads $296116 was skipping. A wave that only '
    + 'deleted the over-firing would have moved this number the other way, '
    + 'which is W437\'s trap -- half a fix is a removal -- seen from the front');
  assert.equal(r.spawns.length, 112, '112 spawns in total, stated as a count');
  assert.equal(r.kills.length, 90, '...and 90 kills');
  assert.equal(r.boardKinds.get(0x04), 9, 'the board holds 9 live kind-4');
  assert.equal(r.portKinds.get(0x04), 9,
    '...and so does the port. [M] before this wave it held 45');
  assert.equal(r.boardKinds.get(0x13), 76, 'the board holds 76 live kind-$13');
  assert.equal(r.portKinds.get(0x13), 76, '...and so does the port');
});

// ===========================================================================
// 7. WHAT IS LEFT, MEASURED
// ===========================================================================
// ===== REWRITTEN BY W441.  W440 LEFT THIS SEGMENT AT 176 AND SAID SO; W441 =====
// ===== CLOSED IT, AND EVERY NUMBER W440 MEASURED IS STILL ASSERTED HERE.   =====
//
// The original assertion was `r.bul.n === 176` with a note that "what is left
// here is an UNDER-FREE".  Both halves survive as the RED arm below: with W441's
// `$294666` restored to its 8-bit reading, this segment IS 176/210 and the port
// DOES free 8 where the board frees 16.  What was wrong was the ATTRIBUTION --
// the port freed 8 because its 42 bullets were fired from a gun mount 70 frames
// out of phase, not because `mover.js` declines a free.  The test is rewritten
// to assert the fix and keep the measurement, per W438's rule.
test('W440 (REWRITTEN BY W441): lf9100->9200 is 210/210, and W440\'s 176 with '
  + 'its 42 spawns and 8 frees is still exactly what the segment measures with '
  + 'W441\'s $294666 read as an 8-bit branch',
{ skip: SKIP_LADDER }, async () => {
  const r = await segment(9100, 9200);
  assert.equal(r.bul.n, BUL.slots,
    'lf9100->9200 is 210 of 210. W440 left it at 176 and asserted that number '
    + 'so it could not be quietly claimed later; W441 closed it');
  assert.equal(r.spawns.length, 42,
    'the port spawns 42 bullets in the window -- W440\'s number, unchanged by '
    + 'W441, because the volley counts were never the defect');
  assert.equal(r.kills.length, 16,
    '...and now frees 16, which is the number W440 derived for the board from '
    + '42 - 26');
  assert.equal(r.portKinds.get(0x13), 26, '...leaving 26 live');
  assert.equal(r.boardKinds.get(0x13), 26, '...which is what the board holds');
  assert.equal(r.portKinds.get(0x04), undefined,
    'and neither side has a single kind-4 bullet, so E14 is fully in step here');
  assert.equal(r.boardKinds.get(0x04), undefined, '...on both sides');
  assert.deepEqual(r.slotBad, { E5: 0, E6: 0, E14: 0 },
    'both guns\' slot records are byte-identical to the board at lf9200, which '
    + 'is what says the VOLLEY COUNTS already agree: the angle field ($A,A4) '
    + 'steps by exactly +$F and -$F per volley and it lands on the board\'s '
    + 'byte. W440 read that correctly and concluded the residue was downstream '
    + 'of the spawn. It was UPSTREAM of it -- in the boss part POSITION the '
    + 'spawn reads, which is in none of these three records');

  // W440's own numbers, preserved as a falsifiable RED rather than as prose.
  const { W441_MUTATE } = await import('../src/bossf23.js');
  const was = W441_MUTATE.value;
  W441_MUTATE.value = 'd14-wait-fallthrough';
  let red;
  try {
    red = await segment(9100, 9200, 'w441-red');
  } finally {
    W441_MUTATE.value = was;
  }
  assert.equal(red.bul.n, 176, 'W440\'s 176/210, reproduced');
  assert.equal(red.spawns.length, 42, '...its 42 spawns');
  assert.equal(red.kills.length, 8, '...and its 8 frees');
  assert.equal(red.portKinds.get(0x13), 34, '...leaving W440\'s 34 live');
  assert.equal(W441_MUTATE.value, null, 'and the seam is reset');
});

test('W440: the OTHER thing left in lf9100->9200 is the laser beam impact, and '
  + 'it is not the bullet pool -- handing the port its 8 missing draws moves '
  + 'the bullet count by ZERO', { skip: SKIP_LADDER }, async () => {
  const { W441_MUTATE } = await import('../src/bossf23.js');
  const was0 = W441_MUTATE.value;
  W441_MUTATE.value = 'd14-wait-fallthrough';
  let r;
  try {
    r = await segment(9100, 9200, 'w441-red-draws');
  } finally {
    W441_MUTATE.value = was0;
  }
  assert.deepEqual(r.drawGap, [[9192, 0, 4], [9194, 0, 4]],
    'exactly two draw-gap frames, lf9192 and lf9194, each worth FOUR draws the '
    + 'board makes and the port does not. [M] every other tick of this 2-frame '
    + 'cadence in the window comes from `spawnBeamImpact289FC0` <- '
    + '`runBeamDraw` (src/laser.js -> src/spark.js, pool E) and draws the same '
    + 'four: $242FFC, $242EC2, $28AB86, $242E24. **W441 CLOSED THIS GAP AND SO '
    + 'THE MEASUREMENT NOW RUNS UNDER W441\'s RED ARM**, which is the only way '
    + 'to keep W440\'s number true and falsifiable at once');
  const green = await segment(9100, 9200);
  assert.deepEqual(green.drawGap, [],
    '...and with $294666 decoded the gap is empty. W440\'s attribution below '
    + 'is still exactly right -- the draws cannot move the pool -- but the two '
    + 'were symptoms of ONE cause upstream of both, not two causes');

  // The attribution, performed: give the port the cursor those 8 draws would
  // have left behind and the bullet pool does not move.  Two defects, not one.
  const trace = readTrace(TRACE);
  const { game, pokes } = await makeGame(9100);
  for (let lf = 9101; lf <= 9200; lf++) {
    if (lf === 9193 || lf === 9195) {
      game.ram.setU8(RNG_STATE + 1, (game.ram.u8(RNG_STATE + 1) + 4) & 0xff);
    }
    for (const [a, v] of pokes) game.ram.setU8(a, v);
    game.step(Number(trace.byLf.get(lf).portin));
  }
  const board = boardRam(9200);
  const bul = sameSlots(board, game.ram.b, BUL.pool, BUL.slots, BUL.stride);
  assert.equal(bul.n, 210,
    'with the RNG cursor advanced by 4 after lf9192 and again after lf9194 -- '
    + 'exactly what the missing sparks would have left behind -- the bullet '
    + 'pool is UNMOVED by the draws. **W441 REWROTE THE CONSTANT FROM 176 TO '
    + '210**: the run above is the FIXED port, whose pool is 210/210, and the '
    + 'poked draws still change it by zero. W440\'s claim survives its own fix, '
    + 'which is a stronger statement than the one it made');
});

test('W440: none of the three gun scripts is a counted note, and W602 '
  + 'reduces the remaining unported ledger to eight entries',
{ skip: SKIP_LADDER }, async () => {
  const trace = readTrace(TRACE);
  const { game, pokes } = await makeGame(9300);
  for (let lf = 9301; lf <= 9400; lf++) {
    for (const [a, v] of pokes) game.ram.setU8(a, v);
    game.step(Number(trace.byLf.get(lf).portin));
  }
  const report = game.unportedLog.report();
  const guns = report.filter(
    (l) => /\$2968FE|\$2960F4|\$296200|\$296082|\$296188/.test(l));
  assert.deepEqual(guns, [],
    'no note names any of the gun scripts. This wave changed what they DO, not '
    + 'whether they run -- so a reader cannot mistake it for a wave that ported '
    + 'something new');
  assert.equal(report.length, 8,
    'the ledger has eight lines after W602 ports the P1/P2 player tail; '
    + 'none is one of these gun scripts');
});
