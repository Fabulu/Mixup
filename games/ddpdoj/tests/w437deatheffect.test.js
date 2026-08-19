// WAVE 437 -- THE MISSING DRAWS ARE `$281E36 jsr $27F8F8`, THE MOVER'S
// GLOBAL-KILL FREE, AND THE PORT COUNTED IT INSTEAD OF MAKING IT.
//
// ---------------------------------------------------------------------------
// THE UNIT
// ---------------------------------------------------------------------------
// W436 got `out/w69/stage1-laser-hold` lf9500->9600 to 80/80 ONLY with the
// board's own `$803916` written in each frame, and pinned the residual to a
// draw-count deficit on three frames of the hundred:
//
//   [M, W436]  lf9556  port 4  board 28      <- the frame $294DD4 runs
//              lf9562  port 12 board 13
//              lf9592  port 0  board 1
//
// All three are the SAME call.  `mover.js freeSlot` transcribed
// `$281E36..$281E4E` as
//
//     ctx.notes?.note($27F8F8, 'walks the impact pool $8171BE, NOT the bullet
//                               pool -- irrelevant to bullet state')
//
// and then did not make the call.  **Every clause of that note is true and the
// conclusion drawn from it is false.**  `$27F8F8` is `$27F8F0`'s sibling entry
// into the same `$8171BE` scan, the fill it reaches draws FOUR times from the
// shared counter `$803917`, and that counter is not pool-A state -- it is the
// index EVERY subsystem's draws share.  W418's fifth lie-shape for the fourth
// time: a true statement resting on a wrong inference.
//
// ---------------------------------------------------------------------------
// WHY THE THREE FRAMES, AND WHY ONLY THOSE THREE
// ---------------------------------------------------------------------------
// `$281E36` is reached from ONE place: the `$281E20` global-kill gate.  The
// bounds kills (`$281E8C`, `$281E94`), the bit-12 kill (`$281EDA`) and the
// bit-7 bounds kills (`$281F46`, `$281F50`) all branch to **`$281EC4`**, which
// is `clr.w (A6) / move.w #$FFFF,($2,A6)` and NOTHING ELSE.  The port called
// the WITH-EFFECT free on all of them, which is why W436 measured the counted
// note firing on 37 frames the board spends no draw on, and concluded --
// reasonably, from a wrong premise -- that `$27F8F8` was ruled out.
//
// `$294DDC bset #$7,$8130F8` is what arms the gate: it makes that word
// NEGATIVE, and `$281E6A bmi $281E20` then sends EVERY live bullet through the
// kill.  [M] 101 of them on lf9556.  The bit is never cleared in this window,
// so each bullet that spawns afterwards is killed on the next mover pass --
// lf9562 and lf9592 are one such bullet each.
//
// ---------------------------------------------------------------------------
// THE BRIEF SAID 24 DRAWS.  IT IS 280.  THE COUNTER IS A BYTE.
// ---------------------------------------------------------------------------
// `$2433AE addq.b #1,$803917` increments the LOW BYTE of `$803916` with no
// carry, so the `rng` trace column can only ever show a per-frame delta MODULO
// 256 and "short by 24" is "short by 24 mod 256".
//
//   [M] the port now makes 284 draws on lf9556: 4 for the beam impact and
//       280 for SEVENTY pool-A fills at four draws each.  284 & $FF = 28,
//       which is the board's own delta.
//
// The magnitude is settled by a rung, not by arithmetic taste: the BOARD's
// pool A holds 0 records at lf9500 and **68** at lf9600, with `$817F7E` = 68.
// Twenty-four draws buys at most six fills.  Sixty-eight surviving records
// cannot come from six.  [M] the port now reaches 68 and 68 there too, where
// before this wave it reached 0 and 0.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE PROVES, AND IN WHICH ORDER
// ---------------------------------------------------------------------------
//  1. THE ROM.  `$281E36`'s five instructions and `$281EC4`'s four; that all
//     five kill branches computed from their own displacements land on
//     `$281EC4` and NOT on `$281E36`; a full `Bcc`/`bsr`/`jsr`/`jmp` scan of
//     $240000..$2A0000 finding EXACTLY the two `beq`s that reach `$281E36`,
//     WITH A POSITIVE CONTROL (the same scan finds all six reachers of
//     `$281EC4`); `$294DD4`'s two `bset`s; `$27F8F8` as `$27F8F0`'s sibling;
//     and that kind 0's finish makes EXACTLY FOUR calls into the
//     `addq.b #1,$803917` family, decoded rather than assumed.
//  2. THE DELIVERABLE.  lf9500->9600, seeded from the board's lf9500 rung and
//     stepped on the board's own input words: 80/80 BYTE-IDENTICAL with
//     NOTHING FORCED, and the per-frame draw count equal to the board's on all
//     100 frames.
//  3. THE MAGNITUDE.  Pool A's occupancy and `$817F7E` at lf9600.
//  4. THE NEIGHBOURS, before and after.
//  5. THE RED.  `W437_MUTATE = 'no-death-effect'` returns the segment to
//     63/80, to W436's exact eight residual offsets and to W436's exact three
//     draw gaps -- and empties pool A.
//  6. THE DIRTY POOL.  Driven directly over $5A dirt, the global kill allocates
//     into the free slots IN ORDER, and **the number of draws depends on where
//     each bullet is**: on-screen bullets draw four each, off-screen ones draw
//     ZERO because `$280B2A` aborts first.  A cursor advanced by a constant
//     cannot be position-dependent, which is the point.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { BUL, REC } from '../src/bullets.js';
import { runMover, MOVER, W437_MUTATE } from '../src/mover.js';
import { POOL_A } from '../src/bee.js';
import { POOL_B } from '../src/effects.js';
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

const RUNGS = [9300, 9400, 9500, 9600, 9700, 9800];
const HAVE_TABLES = fs.existsSync(TABLES);
const HAVE_IMAGE = fs.existsSync(IMAGE);
const HAVE_LADDER = fs.existsSync(MANIFEST) && fs.existsSync(TRACE)
  && RUNGS.every((lf) => fs.existsSync(
    path.join(CK, `c0${String(lf).padStart(5, '0')}.ram.bin`)));

const SKIP_LADDER = (HAVE_TABLES && HAVE_LADDER) ? false
  : 'the W69 stage1-laser-hold ladder (rungs lf9300..lf9800) or '
    + 'rip/port/player.tables.json is absent -- rebuild with pgm.py ckpt and '
    + '`python tools/export-tables.py`. THIS IS A SKIP, NOT A PASS.';
const SKIP_IMAGE = HAVE_IMAGE ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';
const SKIP_TABLES = HAVE_TABLES ? false
  : 'rip/port/player.tables.json is absent -- `python tools/export-tables.py`. '
    + 'THIS IS A SKIP, NOT A PASS.';

const RAM_BASE = 0x800000;
const SEED_LF = 9500;
const CMP_LF = 9600;
const RNG_STATE = 0x803916;
const RNG_COUNTER = 0x803917;

// The ROM addresses this file stands on.
const KILL_EFFECT = 0x281e36;        // the free WITH the $27F8F8 call
const KILL_BARE = 0x281ec4;          // ...and the one without
const GATE = 0x281e20;               // the global-kill gate
const LOOP_HEAD = 0x281e54;          // the per-slot loop head both dbras reach
const RESUME = 0x281e6c;             // $281E34 bpl -- "not killed, carry on"
const ALLOC_D2 = 0x27f8f0;           // the layer-computing entry
const ALLOC_ZERO = 0x27f8f8;         // ...and the D1 = D2 = 0 one
const IMPACT_SCAN = 0x27f8fc;        // where both of them meet
const KIND0_FINISH = 0x280c5e;
const KIND0_FINISH_END = 0x280cbc;   // one past the last insn before $241812's
const BOSS_DEATH = 0x294dd4;
const RNG_BUMP = '523900803917';     // addq.b #1,$803917

// [M] the board's pool A over this window -- 0 before the death frame, 68 at
// lf9600 and drained by lf9800.  Read out of the ckpt dumps, not chosen.
const BOARD_POOLA = { 9500: 0, 9600: 68, 9700: 32, 9800: 0 };
// [M] W436's residual, which the RED arm must reproduce exactly.
const W436_ANGLE_TAIL = [0x02, 0x03, 0x04, 0x05, 0x1b, 0x35, 0x36, 0x37];
const W436_DEFICIT = [[9556, 4, 28], [9562, 12, 13], [9592, 0, 1]];
// [M] the counts at lf9600, W436's own numbers.
const BOARD_LIVE = 33;
const BOARD_NONBLANK = 43;
const BOARD_COUNT = 0x22;

const hx = (v) => `$${v.toString(16).toUpperCase()}`;
const hx2 = (v) => `+$${v.toString(16).toUpperCase().padStart(2, '0')}`;
const slotOffB = (s) => POOL_B.base - RAM_BASE + s * POOL_B.stride;
const slotOffA = (s) => POOL_A.base - RAM_BASE + s * POOL_A.stride;

// ===========================================================================
// 1. THE ROM
// ===========================================================================
test('W437: $281E36 carries the jsr $27F8F8 and $281EC4 does not, and ALL five '
  + 'kill branches land on $281EC4 -- computed from their own displacements',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];
  const s8 = (v) => (v >= 0x80 ? v - 0x100 : v);

  // -- the free WITH the effect, all five instructions.
  assert.deepEqual(at(KILL_EFFECT, 20), [
    0x70, 0x00,                          // moveq #$0,D0  -- the KIND, and it is 0
    0x3f, 0x07,                          // move.w D7,-(A7)
    0x4e, 0xb9, 0x00, 0x27, 0xf8, 0xf8,  // jsr $27F8F8
    0x3e, 0x1f,                          // move.w (A7)+,D7
    0x42, 0x56,                          // clr.w (A6)
    0x3d, 0x7c, 0xff, 0xff, 0x00, 0x02,  // move.w #$FFFF,($2,A6)
  ], `${hx(KILL_EFFECT)} is moveq/move.w/jsr $27F8F8/move.w/clr.w/move.w`);

  // -- and the one without it.  This is the whole defect in eighteen bytes.
  assert.deepEqual(at(KILL_BARE, 18), [
    0x42, 0x56,                          // clr.w (A6)
    0x3d, 0x7c, 0xff, 0xff, 0x00, 0x02,  // move.w #$FFFF,($2,A6)
    0x4d, 0xee, 0x00, 0x40,              // lea ($40,A6),A6
    0x51, 0xcf, 0xff, 0x82,              // dbra D7,$281E54
    0x4e, 0x75,                          // rts
  ], `${hx(KILL_BARE)} frees the slot and loops -- there is NO jsr in it`);
  assert.equal(0x281ed2 - 0x7e, LOOP_HEAD,
    `${hx(KILL_BARE)}'s dbra goes back to the per-slot loop head ${hx(LOOP_HEAD)}`);
  // ...and so does the OTHER path's dbra, four bytes forward rather than back.
  assert.deepEqual(at(0x281e4e, 4), [0x51, 0xcf, 0x00, 0x04],
    '$281E4E dbra D7 -- the effect path\'s own loop tail');
  assert.equal(0x281e50 + 0x04, LOOP_HEAD,
    '...and its displacement is measured from the EXTENSION WORD, so it lands '
    + `on ${hx(LOOP_HEAD)} as well -- the two paths differ ONLY in the jsr`);

  // -- the five kill branches, each decoded and each resolved.  TWO OF THEM ARE
  // THE 16-BIT FORM (`65 00 FF 7C`), which an 8-bit-only reader resolves to the
  // wrong address or skips entirely -- W433's trap, met here for real.
  const s16b = (v) => (v >= 0x8000 ? v - 0x10000 : v);
  const branchTarget = (a) => (img[a + 1] === 0x00
    ? a + 2 + s16b((img[a + 2] << 8) | img[a + 3])       // Bcc.W
    : a + 2 + s8(img[a + 1]));                           // Bcc.B
  for (const [a, opc, wide, name] of [
    [0x281e8c, 0x65, false, 'the posB bounds kill (bcs, UNSIGNED)'],
    [0x281e94, 0x65, false, 'the posA bounds kill (bcs, UNSIGNED)'],
    [0x281eda, 0x66, false, 'the bit-12 kill (bne)'],
    [0x281f46, 0x65, true, 'the bit-7 path\'s posB bounds kill (bcs.W)'],
    [0x281f50, 0x65, true, 'the bit-7 path\'s posA bounds kill (bcs.W)'],
  ]) {
    assert.equal(img[a], opc, `${hx(a)} must be ${name}`);
    assert.equal(img[a + 1] === 0x00, wide,
      `${hx(a)} ${name} -- the 16-bit form iff the table says so, because the`
      + ' two readings resolve to DIFFERENT addresses');
    assert.equal(branchTarget(a), KILL_BARE,
      `${hx(a)} ${name} lands on ${hx(KILL_BARE)}, the free WITHOUT the effect `
      + '-- the port sent it to $281E36 and drew four times per dying bullet');
  }

  // -- the gate, and the fall-through that is the ONLY way into $281E36.
  assert.deepEqual(at(GATE, 24), [
    0x32, 0x39, 0x00, 0x81, 0x1f, 0x72,  // move.w $811F72,D1
    0x67, 0x0e,                          // beq $281E36
    0x08, 0x01, 0x00, 0x00,              // btst #$0,D1
    0x67, 0x08,                          // beq $281E36
    0x4a, 0x79, 0x00, 0x81, 0x30, 0xf8,  // tst.w $8130F8
    0x6a, 0x36,                          // bpl $281E6C
    0x70, 0x00,                          // ...falls through to $281E36
  ], `${hx(GATE)} is the global-kill gate, verbatim`);
  assert.equal(0x281e26 + 2 + s8(0x0e), KILL_EFFECT, '$281E26 beq -> $281E36');
  assert.equal(0x281e2c + 2 + s8(0x08), KILL_EFFECT, '$281E2C beq -> $281E36');
  assert.equal(0x281e34 + 2 + s8(0x36), RESUME,
    '$281E34 bpl -> $281E6C, the RESUME -- so a live boss (bit 15 clear) leaves '
    + 'the bullet alone and the effect never fires');
});

test('W437: a full Bcc/bsr/jsr/jmp scan of $240000..$2A0000 finds EXACTLY two '
  + 'reachers of $281E36 -- with the six reachers of $281EC4 as its POSITIVE '
  + 'CONTROL',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const s8 = (v) => (v >= 0x80 ? v - 0x100 : v);
  const s16 = (v) => (v >= 0x8000 ? v - 0x10000 : v);
  const found = new Map([[KILL_EFFECT, []], [KILL_BARE, []], [GATE, []]]);
  // W433's rule: a longword scan alone finds nothing PC-relative, so this
  // decodes the 8-bit and 16-bit displacement forms of every Bcc and bsr at
  // every even address as well as the absolute jsr/jmp.
  for (let a = 0x240000; a < 0x2a0000; a += 2) {
    const hi = img[a];
    const lo = img[a + 1];
    let t = null;
    if (hi >= 0x60 && hi <= 0x6f) {                    // Bcc / bsr / bra
      if (lo === 0x00) t = a + 2 + s16((img[a + 2] << 8) | img[a + 3]);
      else if (lo !== 0xff) t = a + 2 + s8(lo);        // $FF is the 68020 long form
    } else if (((hi << 8) | lo) === 0x4eb9 || ((hi << 8) | lo) === 0x4ef9) {
      t = (((img[a + 2] << 24) | (img[a + 3] << 16)
        | (img[a + 4] << 8) | img[a + 5]) >>> 0);
    }
    if (t !== null && found.has(t)) found.get(t).push(a);
  }
  assert.deepEqual(found.get(KILL_EFFECT), [0x281e26, 0x281e2c],
    `${hx(KILL_EFFECT)} -- the free that makes the $27F8F8 call -- is reached `
    + 'from the gate\'s two beq sites and NOTHING ELSE in $240000..$2A0000');
  // THE POSITIVE CONTROL.  A scan that finds two of something is worthless
  // unless the same scan finds a set that is known to be bigger.
  assert.deepEqual(found.get(KILL_BARE),
    [0x281e8c, 0x281e94, 0x281eda, 0x281f46, 0x281f50, 0x282b22],
    `...and the SAME scan finds all six reachers of ${hx(KILL_BARE)}, which is `
    + 'what makes the two above a measurement rather than a scan that missed');
  assert.deepEqual(found.get(GATE), [0x281e6a],
    `...and one reacher of the gate itself: $281E6A bmi ${hx(GATE)}`);
});

test('W437: $294DD4 sets bit 7 of $8130F8, which is the SIGN bit of the word '
  + '$281E6A tests -- that is what arms the global kill on lf9556',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];
  assert.deepEqual(at(BOSS_DEATH, 16), [
    0x08, 0xf9, 0x00, 0x06, 0x00, 0x81, 0x30, 0xf8,   // bset #$6,$8130F8
    0x08, 0xf9, 0x00, 0x07, 0x00, 0x81, 0x30, 0xf8,   // bset #$7,$8130F8
  ], `${hx(BOSS_DEATH)} opens with bset #$6 and bset #$7 on $8130F8`);
  // `bset #$7` on an ABSOLUTE operand is a BYTE operation -- bit 7 of the byte
  // at $8130F8, i.e. bit 15 of the WORD `$281E2E tst.w $8130F8` reads.  That is
  // the whole mechanism: one instruction in the boss death makes every live
  // bullet take the kill arm on the very next mover pass.
  assert.deepEqual(at(0x281e2e, 6), [0x4a, 0x79, 0x00, 0x81, 0x30, 0xf8],
    '$281E2E tst.w $8130F8 -- a WORD read of the byte $294DDC just set bit 7 of');
});

test('W437: $27F8F8 is $27F8F0\'s sibling entry, both fall into the same 70-slot '
  + '$8171BE scan, and kind 0\'s finish makes EXACTLY FOUR calls into the '
  + '`addq.b #1,$803917` family',
{ skip: SKIP_IMAGE || SKIP_TABLES }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];
  const s8 = (v) => (v >= 0x80 ? v - 0x100 : v);

  assert.deepEqual(at(ALLOC_D2, 8), [
    0x02, 0x42, 0x00, 0xff,              // andi.w #$FF,D2
    0xe5, 0x4a,                          // lsl.w #2,D2
    0x60, 0x04,                          // bra $27F8FC
  ], `${hx(ALLOC_D2)} computes the layer index in D2 and branches over`);
  assert.equal(ALLOC_D2 + 6 + 2 + s8(0x04), IMPACT_SCAN,
    `...to ${hx(IMPACT_SCAN)}, which is where ${hx(ALLOC_ZERO)} arrives too`);
  assert.deepEqual(at(ALLOC_ZERO, 18), [
    0x72, 0x00,                          // moveq #$0,D1  -- the OFFSET
    0x74, 0x00,                          // moveq #$0,D2  -- the LAYER
    0x48, 0xe7, 0x01, 0x80,              // movem.l D7/A0,-(A7)
    0x41, 0xf9, 0x00, 0x81, 0x71, 0xbe,  // lea $8171BE,A0
    0x3e, 0x3c, 0x00, 0x45,              // move.w #$45,D7
  ], `${hx(ALLOC_ZERO)} enters with offset 0 and layer 0 -- exactly what `
    + '`allocPoolA27F8F0(ram, rom, ctx, 0, 0, 0, base)` passes');
  assert.equal(0x45 + 1, POOL_A.generalSlots,
    'move.w #$45,D7 with a dbra is 70 iterations, and dbra is N+1 -- the '
    + 'general pool is 70 slots, which is POOL_A.generalSlots');

  // -- THE FOUR DRAWS, DECODED RATHER THAN ASSUMED.  Every `jsr` between
  // $280C5E and the end of the shared tail is resolved and its target's first
  // six bytes are tested against `addq.b #1,$803917`.  $241812 lives inside
  // that span and is NOT a member, which is the check that makes the count 4
  // and not 5.
  const jsrs = [];
  for (let a = KIND0_FINISH; a < KIND0_FINISH_END + 2; a += 2) {
    if (img[a] === 0x4e && img[a + 1] === 0xb9) {
      const t = (((img[a + 2] << 24) | (img[a + 3] << 16)
        | (img[a + 4] << 8) | img[a + 5]) >>> 0);
      const isRng = [...img.subarray(t, t + 6)]
        .map((b) => b.toString(16).padStart(2, '0')).join('') === RNG_BUMP;
      jsrs.push([a, t, isRng]);
    }
  }
  assert.deepEqual(jsrs.map(([a, t]) => [hx(a), hx(t)]), [
    ['$280C68', '$242EC2'],
    ['$280C84', '$2431F4'],
    ['$280C94', '$242FDE'],
    ['$280C9E', '$2431F4'],
    ['$280CBA', '$241812'],
  ], 'the five jsr sites in kind 0\'s finish, by address and target');
  assert.deepEqual(jsrs.map(([, , r]) => r), [true, true, true, true, false],
    'four of the five targets open with `addq.b #1,$803917` and $241812 does '
    + 'NOT -- so ONE fill of kind 0 costs FOUR draws, not three and not five');
  assert.equal(jsrs.filter(([, , r]) => r).length, 4,
    'stated as a count too, because 24 / 4 = 6 and 280 / 4 = 70 and the whole '
    + 'magnitude argument rests on this number');

  // No window is declared or widened for any of this: the addresses above are
  // code, and the only cartridge tables read are `$280B4A`'s template and the
  // four RNG tables, all of which the port has drawn from for hundreds of waves.
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const list = tables.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]);
  assert.equal(list.length, ROM_WINDOW_COUNT,
    'the whole window set, counted once in tests/romwindowset.js -- this wave '
    + 'declares no window, so the count is W436\'s unchanged');
  assert.equal(overlappingPairs(list), ROM_OVERLAP_PAIRS, OVERLAP_NOTE);
});

// ===========================================================================
// A shared runner -- W436's, extended to report pool A and to run any number
// of frames past the compared rung.
// ===========================================================================
async function runSegment(seedLf, cmpLf, { mutate = null, forceRng = false } = {}) {
  const { Game } = await import('../src/main.js');
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === seedLf);
  assert.ok(rung, `lf${seedLf} must be a rung`);
  const cmpRung = man.rungs.find((r) => r.lf === cmpLf);
  assert.ok(cmpRung, `lf${cmpLf} must be a rung`);
  const trace = readTrace(TRACE);
  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const pokes = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));

  W437_MUTATE.value = mutate;
  let game;
  const drawGap = [];
  try {
    game = new Game(seed, tables, {
      logicFrame: seedLf, videoFrame: rung.vf, bgSeed,
    });
    let portPrev = game.ram.u16(RNG_STATE);
    let boardPrev = Number(trace.byLf.get(seedLf).rng);
    for (let lf = seedLf + 1; lf <= cmpLf; lf++) {
      const r = trace.byLf.get(lf);
      assert.ok(r, `the trace must carry lf${lf}`);
      for (const [a, v] of pokes) game.ram.setU8(a, v);
      if (forceRng) game.ram.setU16(RNG_STATE, Number(trace.byLf.get(lf - 1).rng));
      game.step(Number(r.portin));      // THE BOARD'S OWN INPUT WORD
      const p = game.ram.u16(RNG_STATE);
      const b = Number(r.rng);
      if (!forceRng && ((p - portPrev) & 0xff) !== ((b - boardPrev) & 0xff)) {
        drawGap.push([lf, (p - portPrev) & 0xff, (b - boardPrev) & 0xff]);
      }
      portPrev = p; boardPrev = b;
    }
  } finally {
    W437_MUTATE.value = null;           // a module switch, reset on EVERY run
  }

  const board = new Uint8Array(fs.readFileSync(path.join(CK, cmpRung.ram)));
  const port = game.ram.b;

  const statB = (buf) => {
    let live = 0, nonBlank = 0;
    for (let s = 0; s < POOL_B.slots; s++) {
      const o = slotOffB(s);
      if (((buf[o] << 8) | buf[o + 1]) & 0x8000) live++;
      for (let k = 0; k < POOL_B.stride; k++) if (buf[o + k]) { nonBlank++; break; }
    }
    return {
      live,
      nonBlank,
      count: (buf[POOL_B.count - RAM_BASE] << 8) | buf[POOL_B.count - RAM_BASE + 1],
    };
  };
  const statA = (buf) => {
    let occupied = 0;
    for (let s = 0; s < POOL_A.generalSlots; s++) {
      const o = slotOffA(s);
      if ((buf[o] << 8) | buf[o + 1]) occupied++;
    }
    return {
      occupied,
      liveCount: (buf[POOL_A.liveCount - RAM_BASE] << 8)
        | buf[POOL_A.liveCount - RAM_BASE + 1],
    };
  };
  const offsets = new Set();
  let identical = 0, kindSame = 0, descSame = 0, differ = 0, movedFromSeed = 0;
  for (let s = 0; s < POOL_B.slots; s++) {
    const o = slotOffB(s);
    let bad = 0, moved = false;
    for (let k = 0; k < POOL_B.stride; k++) {
      if (board[o + k] !== port[o + k]) { bad++; offsets.add(k); }
      if (seed[o + k] !== port[o + k]) moved = true;
    }
    if (moved) movedFromSeed++;
    if (bad === 0) identical++; else differ++;
    if (((board[o] << 8) | board[o + 1]) === ((port[o] << 8) | port[o + 1])) kindSame++;
    let sameDesc = true;
    for (let k = 0x0a; k < 0x0e; k++) if (board[o + k] !== port[o + k]) sameDesc = false;
    if (sameDesc) descSame++;
  }
  return {
    identical, differ, kindSame, descSame, movedFromSeed, drawGap,
    offsets: [...offsets].sort((a, b) => a - b),
    boardB: statB(board), portB: statB(port),
    boardA: statA(board), portA: statA(port),
  };
}

// ===========================================================================
// 2 + 3. THE DELIVERABLE AND THE MAGNITUDE
// ===========================================================================
test('W437: lf9500->9600 is 80/80 BYTE-IDENTICAL with NOTHING FORCED, and the '
  + 'port draws from $803916 exactly as often as the board on all 100 frames',
{ skip: SKIP_LADDER }, async () => {
  const r = await runSegment(SEED_LF, CMP_LF);

  // THE POSITIVE CONTROL FIRST -- W435's trap.  This rung is not an empty pool
  // on either side: the board holds 43 records, 33 of them LIVE, and its pool A
  // holds 68.  80/80 here is not satisfiable by wiping anything.
  assert.equal(r.boardB.nonBlank, BOARD_NONBLANK,
    'the board\'s pool B at lf9600 must hold 43 non-blank slots');
  assert.equal(r.boardB.live, BOARD_LIVE, '...33 of them LIVE');
  assert.equal(r.boardB.count, BOARD_COUNT, '...with $81C8EA = $22');
  assert.equal(r.boardA.occupied, BOARD_POOLA[9600],
    '...and the board\'s pool A holds 68 of 70 general slots');
  assert.ok(r.movedFromSeed >= 35,
    `the port's pool B must have MOVED off the lf${SEED_LF} seed; only `
    + `${r.movedFromSeed} of ${POOL_B.slots} slots differ from it`);

  // THE DRAW COUNT -- the deliverable this wave was set.
  assert.deepEqual(r.drawGap, [],
    'the port\'s per-frame $803916 delta must equal the board\'s on EVERY one '
    + 'of lf9501..9600 with nothing poked. W436 measured a deficit on three: '
    + `${JSON.stringify(W436_DEFICIT)}`);

  // ...AND THE SEGMENT, UNCONDITIONALLY.
  assert.deepEqual(
    [r.portB.live, r.portB.nonBlank, r.portB.count],
    [BOARD_LIVE, BOARD_NONBLANK, BOARD_COUNT],
    'the port must hold the board\'s live count, non-blank count and $81C8EA');
  assert.equal(r.kindSame, POOL_B.slots, 'every slot\'s status/kind word');
  assert.equal(r.descSame, POOL_B.slots, '...and every descriptor longword');
  assert.deepEqual(r.offsets, [],
    'NO byte of any pool-B slot may differ. W436 reached this only with the '
    + `board's own $803916 written in; unforced it left ${
      W436_ANGLE_TAIL.map(hx2).join(' ')}`);
  assert.equal(r.identical, POOL_B.slots,
    '80 of 80, stated as a count -- and with NO cursor forcing anywhere');
  assert.equal(r.differ, 0, '...and zero differing slots, stated the other way');

  // AND IT SURVIVES THE FORCING TOO.  A fix that closed the deficit by drawing
  // the wrong number of times somewhere else could pass the unforced arm and
  // would still fail this one.
  const forced = await runSegment(SEED_LF, CMP_LF, { forceRng: true });
  assert.equal(forced.identical, POOL_B.slots,
    'still 80/80 with the board\'s own $803916 written in each frame');
});

test('W437: the magnitude -- pool A goes 0 -> 68 across lf9500..9600 on the '
  + 'board AND on the port, which is what settles "24 draws" as "280"',
{ skip: SKIP_LADDER }, async () => {
  // `$2433AE addq.b #1,$803917` is a BYTE add with no carry into $803916's high
  // byte, so the `rng` trace column shows the per-frame delta MODULO 256 and
  // nothing more. W436's "short by 24" on lf9556 is "short by 24 mod 256", and
  // 280 = 24 mod 256. The two readings are indistinguishable in that column, so
  // they are distinguished HERE instead, on a quantity that is not modular:
  //
  //   one pool-A fill of kind 0 = 4 draws            (asserted from the ROM above)
  //   24 draws => at most 6 fills => at most 6 records
  //   280 draws => 70 fills => 70 records, which is the whole general pool
  //
  // [M] the board holds 68 at lf9600. Six cannot become sixty-eight.
  const r = await runSegment(SEED_LF, CMP_LF);
  assert.equal(r.boardA.occupied, BOARD_POOLA[9600],
    'the BOARD\'s pool A at lf9600 -- 68 of 70 general slots occupied');
  assert.equal(r.boardA.liveCount, BOARD_POOLA[9600],
    '...and $817F7E agrees with the walk, so neither is a stale word');
  assert.equal(r.portA.occupied, r.boardA.occupied,
    'the port must reach the same 68. Before this wave it reached 0, because '
    + 'nothing in the port ever allocated a pool-A record on this route');
  assert.equal(r.portA.liveCount, r.boardA.liveCount,
    '...and the same $817F7E');

  // The seed rung is the other half of the claim: pool A is EMPTY at lf9500, so
  // all 68 were built inside the compared window rather than inherited.
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const seedRung = man.rungs.find((x) => x.lf === SEED_LF);
  const seedRam = new Uint8Array(fs.readFileSync(path.join(CK, seedRung.ram)));
  let seedOcc = 0;
  for (let s = 0; s < POOL_A.generalSlots; s++) {
    const o = slotOffA(s);
    if ((seedRam[o] << 8) | seedRam[o + 1]) seedOcc++;
  }
  assert.equal(seedOcc, BOARD_POOLA[9500],
    'the board\'s pool A is EMPTY at lf9500, so the 68 at lf9600 are built '
    + 'inside the window this wave measures and are not seeded in');
});

// ===========================================================================
// 4. THE NEIGHBOURS, BEFORE AND AFTER
// ===========================================================================
test('W437: the four neighbouring segments are 80/80 and draw-exact -- and two '
  + 'of them carry NO live record, so only lf9600->9700 and lf9700->9800 could '
  + 'ever have caught a regression here',
{ skip: SKIP_LADDER }, async () => {
  for (const [a, b, live] of [
    [9300, 9400, 0], [9400, 9500, 0], [9600, 9700, 9], [9700, 9800, 26],
  ]) {
    const r = await runSegment(a, b);
    assert.equal(r.boardB.live, live,
      `the board's live count at lf${b} -- W436's correction, kept: lf9400 and `
      + 'lf9500 hold ZERO live records');
    assert.equal(r.identical, POOL_B.slots,
      `lf${a}->${b} must stay 80/80 -- got ${r.identical}`);
    assert.deepEqual(r.drawGap, [],
      `lf${a}->${b} must also draw exactly as often as the board on every frame`);
  }
});

// ===========================================================================
// 5. THE RED
// ===========================================================================
test('W437 RED: `no-death-effect` puts the segment back to 63/80, to W436\'s '
  + 'exact eight residual offsets, to W436\'s exact three draw gaps AND to an '
  + 'EMPTY pool A',
{ skip: SKIP_LADDER }, async () => {
  const r = await runSegment(SEED_LF, CMP_LF, { mutate: 'no-death-effect' });
  assert.deepEqual(r.drawGap, W436_DEFICIT,
    'with the jsr counted instead of made, the deficit is W436\'s, frame for '
    + 'frame and value for value: lf9556 4 vs 28, lf9562 12 vs 13, lf9592 0 vs 1');
  assert.deepEqual(r.offsets, W436_ANGLE_TAIL,
    '...and the residual is W436\'s eight offsets -- the position, the angle '
    + 'byte +$1B and the velocity it produces');
  assert.equal(r.identical, 63,
    '...and the segment is 63 of 80, which is what W436 measured and refused '
    + 'to call a pass');
  assert.equal(r.portA.occupied, 0,
    '...and pool A is EMPTY where the board holds 68, which is the same defect '
    + 'seen from the other side');
  assert.equal(r.portA.liveCount, 0, '...with $817F7E at 0 against the board\'s 68');
  // The counts and the kind word are W436's work and must NOT move: this
  // mutation is scoped to the mover, and a red arm that also breaks the spark
  // blocks would not be measuring what it says.
  assert.equal(r.kindSame, POOL_B.slots,
    'W436\'s spark blocks are untouched by this mutation -- the kind word is '
    + 'still 80/80, so this RED is the draw count and nothing else');
  assert.deepEqual(
    [r.portB.live, r.portB.nonBlank, r.portB.count],
    [BOARD_LIVE, BOARD_NONBLANK, BOARD_COUNT],
    '...and so are the three counts');
});

// ===========================================================================
// 6. THE DIRTY POOL -- and why this cannot be a constant
// ===========================================================================
//
// W436's standard was "eight firings into eight DISTINCT slots, three distinct
// signatures, five distinct angle bytes, 22 untouched fields still reading $5A;
// a constant written eight times fails all of them."  The analogous claim here
// is stronger, because the quantity at stake is a COUNT and the obvious way to
// fake a count is to add one:
//
//   **THE NUMBER OF DRAWS DEPENDS ON WHERE EACH BULLET IS.**
//
// Eight bullets are freed by the same gate on the same pass.  Four are on
// screen and cost four draws each; four are off screen, reach `$280B2A`'s abort
// BEFORE the first draw, and cost zero.  Advancing `$803917` by any constant --
// per frame, per free, per kill -- gives 8k draws for k in the integers and can
// never give 16 for these eight and 0 for those four.
function dirtyRam() {
  const ram = new Ram(null);
  for (let i = 0; i < POOL_A.generalSlots; i++) {
    for (let k = 0; k < POOL_A.stride; k++) {
      ram.setU8(POOL_A.base + i * POOL_A.stride + k, 0x5a);
    }
  }
  ram.setU16(0x81b41a, 1);              // the iteration window
  ram.setU16(0x813176, 0);              // no scroll
  ram.setU16(0x813172, 0);
  ram.setU16(MOVER.freezeC, 0x8000);    // ARM THE GLOBAL KILL, both ways
  ram.setU16(MOVER.stageKill, 0x8000);
  return ram;
}

// [M] the free slots this arm opens, and they are deliberately NOT consecutive
// so that "the allocator picked them" is distinguishable from "they were first".
const FREE_SLOTS = [2, 9, 17, 30, 44, 61, 63, 66];
// [M] four bullets inside `$280B2A`'s window and four outside it.  The last
// off-screen one fails the OTHER axis, so both halves of the abort are live.
const ON_SCREEN = [[0x1000, 0x1000], [0x2400, 0x2000], [0x3800, 0x3000], [0x0800, 0x4000]];
const OFF_SCREEN = [[0x1000, 0x5000], [0x2000, 0x6000], [0x3000, 0x7000], [0x9900, 0x1000]];

test('W437 FALSIFICATION: over a $5A pool the global kill allocates into the '
  + 'free slots IN ORDER, and the draw count is POSITION-DEPENDENT -- four per '
  + 'on-screen bullet, ZERO per off-screen one',
{ skip: SKIP_TABLES }, () => {
  const tablesJson = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(tablesJson.rom);
  const moveTables = new MoveTables(tablesJson, rom);

  const run = (seeds, { mutate = null } = {}) => {
    const ram = dirtyRam();
    for (const i of FREE_SLOTS) ram.setU16(POOL_A.base + i * POOL_A.stride, 0);
    seeds.forEach(([posA, posB], s) => {
      const b = BUL.pool + s * BUL.stride;
      ram.setU16(b, 0x8000);                       // live
      ram.setU16(b + REC.posA, posA);
      ram.setU16(b + REC.posB, posB);
      ram.setU32(b + 0x22, 0x282944);              // a benign continuation
    });
    let draws = 0;
    const realSet = ram.setU8.bind(ram);
    ram.setU8 = (a, v) => { if (a === RNG_COUNTER) draws++; return realSet(a, v); };
    W437_MUTATE.value = mutate;
    try {
      runMover({ ram, rom, tables: moveTables, notes: new UnportedLog() });
    } finally { W437_MUTATE.value = null; }
    ram.setU8 = realSet;
    return { ram, draws };
  };

  // ---- ON SCREEN ONLY: four frees, four fills, sixteen draws.
  const on = run(ON_SCREEN);
  assert.equal(on.draws, ON_SCREEN.length * 4,
    'four on-screen bullets freed by the global kill cost FOUR draws each');
  const filled = FREE_SLOTS.filter(
    (i) => on.ram.u16(POOL_A.base + i * POOL_A.stride) !== 0x5a5a
      && on.ram.u16(POOL_A.base + i * POOL_A.stride) !== 0);
  assert.deepEqual(filled, FREE_SLOTS.slice(0, 4),
    'and they land in the FIRST FOUR free slots -- 2, 9, 17, 30 -- in the '
    + 'allocator\'s own scan order, skipping the dirt in between');
  const angles = new Set();
  const sprites = new Set();
  for (const i of filled) {
    const o = POOL_A.base + i * POOL_A.stride;
    assert.equal(on.ram.u16(o) & 0x8000, 0x8000, `slot ${i} must be marked live`);
    angles.add(on.ram.u8(o + 0x1b));
    sprites.add(on.ram.u32(o + 0x0a));
  }
  assert.ok(angles.size >= 3,
    `the four records must carry at least three DISTINCT angle bytes -- a `
    + `constant fails here; got ${angles.size} (${[...angles].map(hx).join(' ')})`);
  assert.ok(sprites.size >= 3,
    `...and at least three distinct sprite longwords, because $280C68's draw `
    + `picks the animation phase; got ${sprites.size}`);
  // ...and the fields $280B3E never writes still read the poison byte.
  const untouched = [];
  const o0 = POOL_A.base + FREE_SLOTS[0] * POOL_A.stride;
  for (let k = 0; k < POOL_A.stride; k++) if (on.ram.u8(o0 + k) === 0x5a) untouched.push(k);
  assert.deepEqual(untouched, [0x1e, 0x1f, 0x24, 0x25, 0x26, 0x27],
    'six fields of the filled record are never written by kind 0\'s fill and '
    + 'still read $5A -- a memset of the record would wipe these');
  // ...and the pool's live counter is the fill's own, not the free's.
  assert.equal(on.ram.u16(POOL_A.liveCount), ON_SCREEN.length,
    '$817F7E counts the four fills ($280B3E addq.w #1), not the four frees');

  // ---- OFF SCREEN ONLY: four frees, four aborts, ZERO draws.
  const off = run(OFF_SCREEN);
  assert.equal(off.draws, 0,
    'four OFF-screen bullets freed by the SAME gate on the SAME pass cost ZERO '
    + 'draws, because $280B2A aborts before $280C68. THIS IS THE CLAIM A '
    + 'CONSTANT CANNOT MEET: same code, same number of calls, different count');
  assert.equal(off.ram.u16(POOL_A.liveCount), 0,
    '...and the abort takes the live counter back down with it');
  const first = POOL_A.base + FREE_SLOTS[0] * POOL_A.stride;
  assert.equal(off.ram.u16(first), 0,
    'the first free slot is handed back -- status 0, not $8000 and not $5A5A');
  assert.notEqual(off.ram.u32(first + 0x02), 0x5a5a5a5a,
    '...but its POSITION was written before the abort ($280B60 move.l D1,(A0)+ '
    + 'precedes $280B70 bcs), so the abort really ran rather than the fill '
    + 'never having been entered');
  for (const i of FREE_SLOTS.slice(1)) {
    assert.equal(off.ram.u16(POOL_A.base + i * POOL_A.stride), 0,
      `slot ${i} stays free: an aborted fill releases its slot, so all four `
      + 'off-screen frees reuse the same one');
  }

  // ---- BOTH, AND THE RED.
  const both = run([...ON_SCREEN, ...OFF_SCREEN]);
  assert.equal(both.draws, ON_SCREEN.length * 4,
    'eight frees on one pass, sixteen draws -- the four off-screen ones add '
    + 'nothing, so the total is not a multiple of the number of frees');
  const dead = run([...ON_SCREEN, ...OFF_SCREEN], { mutate: 'no-death-effect' });
  assert.equal(dead.draws, 0,
    'with W437_MUTATE = no-death-effect the same eight frees draw NOTHING');
  for (let i = 0; i < POOL_A.generalSlots; i++) {
    const o = POOL_A.base + i * POOL_A.stride;
    if (FREE_SLOTS.includes(i)) {
      assert.equal(dead.ram.u16(o), 0, `slot ${i} is left as the harness set it`);
    } else {
      assert.equal(dead.ram.u16(o), 0x5a5a,
        `...and slot ${i} still reads the poison word -- the mutation touches `
        + 'no pool-A byte at all');
    }
  }
});

test('W437: the bounds kill and the bit-12 kill spawn NOTHING -- the same eight '
  + 'bullets, freed with the gate DISARMED, cost zero draws and leave the pool '
  + 'entirely $5A',
{ skip: SKIP_TABLES }, () => {
  // This is the half of the fix that is a REMOVAL, and it needs its own arm:
  // routing the bounds kill to $281E36 would have made the deliverable segment
  // over-draw on 37 frames of the hundred instead of under-drawing on three.
  const tablesJson = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(tablesJson.rom);
  const moveTables = new MoveTables(tablesJson, rom);
  const ram = dirtyRam();
  ram.setU16(MOVER.freezeC, 0);          // DISARM the global kill
  ram.setU16(MOVER.stageKill, 0);
  for (const i of FREE_SLOTS) ram.setU16(POOL_A.base + i * POOL_A.stride, 0);
  // four out-of-bounds bullets (the bounds kill) and four with bit 12 set.
  const seeds = [
    [0x8000, 0x9000], [0x9000, 0xa000], [0xa000, 0xb000], [0x7000, 0xc000],
  ];
  seeds.forEach(([posA, posB], s) => {
    const b = BUL.pool + s * BUL.stride;
    ram.setU16(b, 0x8000);
    ram.setU16(b + REC.posA, posA);
    ram.setU16(b + REC.posB, posB);
    ram.setU32(b + 0x22, 0x282944);
  });
  for (let s = 0; s < 4; s++) {          // ...and four bit-12 kills, ON screen
    const b = BUL.pool + (4 + s) * BUL.stride;
    ram.setU16(b, 0x9100);               // alive + bit 12 + bit 8
    ram.setU16(b + REC.posA, 0x1000 + s * 0x400);
    ram.setU16(b + REC.posB, 0x1000 + s * 0x400);
    ram.setU32(b + 0x22, 0x282944);
  }
  let draws = 0;
  const realSet = ram.setU8.bind(ram);
  ram.setU8 = (a, v) => { if (a === RNG_COUNTER) draws++; return realSet(a, v); };
  runMover({ ram, rom, tables: moveTables, notes: new UnportedLog() });
  ram.setU8 = realSet;

  for (let s = 0; s < 8; s++) {
    assert.equal(ram.u16(BUL.pool + s * BUL.stride), 0,
      `bullet ${s} must be freed -- $281EC4 clr.w (A6)`);
    assert.equal(ram.u16(BUL.pool + s * BUL.stride + REC.posA), 0xffff,
      '...with $281EC6 move.w #$FFFF,($2,A6)');
  }
  assert.equal(draws, 0,
    'eight bullets freed through $281EC4 -- four on the bounds carry and four '
    + 'ON SCREEN through the bit-12 kill -- must cost ZERO draws. The four '
    + 'bit-12 ones are the load-bearing half: they are inside $280B2A\'s window, '
    + 'so if the port sent them to $281E36 they would draw sixteen times');
  assert.equal(ram.u16(POOL_A.liveCount), 0, '...and allocate nothing');
  for (const i of FREE_SLOTS) {
    assert.equal(ram.u16(POOL_A.base + i * POOL_A.stride), 0,
      `free slot ${i} is still free`);
  }
});
