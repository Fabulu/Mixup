// WAVE 438 -- POOL A'S PER-RECORD POSITION IS THE CARRIER'S, AND `$27F95A`
// IS NOT THE DEFECT.  THE BULLET POOL IS.
//
// ---------------------------------------------------------------------------
// WHAT THE BRIEF ASKED FOR, AND WHAT IS ACTUALLY THERE
// ---------------------------------------------------------------------------
// W437 left pool A at `out/w69/stage1-laser-hold` lf9500->9600 with the board's
// occupancy and count (68/68, `$817F7E` = $44) but only **2 of 70 slots
// byte-identical**, differing overwhelmingly at `+$02..+$05`.  The wave that
// wrote this file was told that residual was `$27F95A`'s driver.
//
// **IT IS NOT, AND THIS FILE MEASURES WHY.**  `$27F95A` and kind 0's body step
// the board's own 68 records through 100 frames and 36 frees WITHOUT A SINGLE
// WRONG BYTE (lf9600->9700, below).  The position is wrong because it is
// *copied*: `$280B56 add.l ($2,A6),D1` takes the record's whole position
// longword from the CARRIER, and on this route the carrier is a dying enemy
// bullet.  The port's enemy-bullet pool is where the divergence lives.
//
// ---------------------------------------------------------------------------
// W440 CLOSED THE RESIDUAL, AND THIS FILE WAS REWRITTEN RATHER THAN DELETED
// ---------------------------------------------------------------------------
// W440 decoded four `.W` branches in the stage-1 boss's three rotation guns
// ($29690A, $29610E, $29621A, $296116, all read as 8-bit) and lf9500->9600 went
// **149/210 -> 210/210 bullets and 2/70 -> 70/70 pool A** with no line of
// pool-A code touched.  So W438's prediction -- "pool A is byte-perfect on
// exactly the segments where the BULLET pool is" -- came true in the only way
// that could confirm it: someone fixed the bullet pool and pool A followed.
//
// Four tests in this file asserted the 2/70 residual and went RED when it was
// closed.  They are REWRITTEN, not deleted: every number W438 measured is still
// recorded here, and every claim it made is still checked -- the field
// isolation now runs under `W440_MUTATE`, which recreates a divergence on
// demand, so the experiment can still FAIL.  A test whose subject was fixed and
// which was therefore removed is a claim nobody checks any more.
//
// ---------------------------------------------------------------------------
// THE FIELD ISOLATION, WHICH IS ALSO THE FALSIFICATION
// ---------------------------------------------------------------------------
// The port's own lf9500->9600 run is taken at lf9600 and ONE GROUP OF BYTES per
// arm is overwritten with the board's, then stepped 100 more frames to lf9700.
// [M] W438's numbers, against the port as it then stood:
//
//     patched group                  lf9600      lf9700
//     ------------------------------ ----------- -----------
//     nothing                         2/70        2/70
//     position   +$02..+$05           2 -> 62/70  52/70
//     ALL FORTY OTHER BYTES           2 ->  2/70   2/70
//     speed/angle +$1A/+$1B           2 ->  2/70   2/70
//     cached vel  +$20..+$23          2 ->  2/70   2/70
//     sprite      +$0A..+$0D          2 ->  2/70   2/70
//     status      +$00/+$01           2 ->  2/70   2/70
//
// **THAT IS WHY THIS CANNOT BE FAKED.**  The claim "only the position is wrong"
// is not asserted from the diff -- it is asserted from the fact that handing the
// port the board's value for EVERY OTHER BYTE OF EVERY RECORD moves the number
// by ZERO, while handing it four bytes moves it by sixty.  A port with a second
// defect anywhere in the 44-byte record would improve on the all-but-position
// arm.  A port that "fixed" the position by writing a constant would fail the
// byte comparison outright, and would also have to survive 100 further frames of
// `$27F95A` stepping it -- which the 52/70 arm proves the real values do, and a
// constant could not, because the driver frees a record on the frame its long
// axis goes negative.
//
// ---------------------------------------------------------------------------
// THE ATTRIBUTION, MEASURED THREE WAYS
// ---------------------------------------------------------------------------
//  1. THE ROM.  The record's position at spawn has exactly one source --
//     `$280B56 add.l ($2,A6),D1` + `$280B5A add.w $813176,D1` + `$280B60
//     move.l D1,(A0)+` -- and after that the only writer inside the driver is
//     `$27F97A sub.w D6,($4,A6)`, the scroll on the short axis.  There is no
//     other producer of `+$02..+$05` to blame.
//  2. THE SEGMENTS.  Pool A is byte-perfect on exactly the segments where the
//     BULLET pool is byte-perfect and on no other:
//
//         segment          bullets      pool A     pool B   (W438)  (W440)
//         lf9500->9600     149/210      2/70       80/80    ->  210/210 70/70
//         lf9600->9700     210/210     70/70       80/80    ->  unchanged
//         lf9700->9800     210/210     70/70       80/80    ->  unchanged
//
//     THE CORRELATION IS THE CLAIM, AND IT SURVIVED THE FIX: the one row where
//     the two pools disagreed with the board is the one row W440 moved, and it
//     moved BOTH of them, together, in one edit to src/bossf23.js.
//
//  3. THE FIELD.  Of the 61 bullet slots that differ at lf9600, **61 differ at
//     `+$05` and 56 at `+$04`** -- the low half of the very longword the fill
//     copies, left behind as residue by `$281EC4 move.w #$FFFF,($2,A6)`, which
//     rewrites `+$02/+$03` and leaves `+$04/+$05` holding the position the
//     bullet died at.
//
// ---------------------------------------------------------------------------
// THE BRIEF WAS WRONG ABOUT THE SECOND SEGMENT
// ---------------------------------------------------------------------------
// "At lf9700 the port drains to 27 where the board holds 32" is a **200-frame
// run seeded at lf9500**, not the lf9600->9700 rung.  From lf9600 the port holds
// 32, `$817F7E` = 32, and all seventy slots are byte-identical.  Both readings
// are asserted below so the two can never be confused again.
//
// NO ROM WINDOW IS DECLARED OR WIDENED: every address read here is code, read
// out of the decrypted image, and the pools are RAM.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { POOL_A, B } from '../src/bee.js';
import { POOL_B } from '../src/effects.js';
import { BUL, REC, TYPEBIT } from '../src/bullets.js';
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

const RUNGS = [9500, 9600, 9700, 9800];
// The 25-frame rungs W438 named as the next unit and W439 closed, guarded
// separately so this file's deliverable does not skip when only they are
// missing.
const FINE_RUNGS = [4025, 4050];
const HAVE_TABLES = fs.existsSync(TABLES);
const HAVE_IMAGE = fs.existsSync(IMAGE);
const ckOf = (lf) => path.join(CK, `c0${String(lf).padStart(5, '0')}.ram.bin`);
const HAVE_LADDER = fs.existsSync(MANIFEST) && fs.existsSync(TRACE)
  && RUNGS.every((lf) => fs.existsSync(ckOf(lf)));
const HAVE_FINE = HAVE_LADDER && FINE_RUNGS.every((lf) => fs.existsSync(ckOf(lf)));

const SKIP_LADDER = (HAVE_TABLES && HAVE_LADDER) ? false
  : 'the W69 stage1-laser-hold ladder (rungs lf9500..lf9800) or '
    + 'rip/port/player.tables.json is absent -- rebuild with pgm.py ckpt and '
    + '`python tools/export-tables.py`. THIS IS A SKIP, NOT A PASS.';
const SKIP_IMAGE = HAVE_IMAGE ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';
const SKIP_FINE = HAVE_FINE ? false
  : 'the W69 stage1-laser-hold 25-frame rungs lf4025/lf4050 are absent. '
    + 'THIS IS A SKIP, NOT A PASS.';

const RAM_BASE = 0x800000;
const RNG_STATE = 0x803916;

// The ROM addresses this file stands on.
const DRIVER = 0x27f95a;        // $27F95A, type-5 call #4
const DRIVER_RTS = 0x27f958;    // ...and the rts its opening beq lands on
const DRIVER_ADVANCE = 0x27f972; // lea ($2C,A6),A6 -- the empty-slot advance
const DRIVER_SCAN = 0x27f976;   // the per-slot scan head the bra and dbra reach
const DRIVER_END = 0x27f99c;    // one past the dbra, where the rts sits
const COLLECTED = 0x2810ca;     // the bmi.W arm
const DISPATCH_TABLE = 0x27f99e;
const FILL = 0x280b3e;
const FILL_ABORT = 0x280b2a;

// [M] the board's pool A across this window, read out of the ckpt dumps.
const BOARD_POOLA = { 9500: 0, 9600: 68, 9700: 32, 9800: 0 };
// [M] the board's pool B at lf9600 -- W436/W437's numbers, unchanged.
const BOARD_B_LIVE = 33;
const BOARD_B_NONBLANK = 43;
const BOARD_B_COUNT = 0x22;

const hx = (v) => `$${v.toString(16).toUpperCase()}`;
const hx2 = (v) => `+$${v.toString(16).toUpperCase().padStart(2, '0')}`;
const slotOffA = (s) => POOL_A.base - RAM_BASE + s * POOL_A.stride;
const slotOffB = (s) => POOL_B.base - RAM_BASE + s * POOL_B.stride;
const slotOffBul = (s) => BUL.pool - RAM_BASE + s * BUL.stride;

// ===========================================================================
// 1. THE ROM -- WHERE THE POSITION COMES FROM, AND WHAT THE DRIVER DOES TO IT
// ===========================================================================
test('W438: $27F95A decodes to TWENTY-ONE instructions -- including a `nop` at '
  + '$27F98C and a WIDE `bmi.w` at $27F984 -- and the only thing it writes to a '
  + 'record\'s position is $27F97A sub.w D6,($4,A6)',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];
  const s8 = (v) => (v >= 0x80 ? v - 0x100 : v);
  const s16 = (v) => (v >= 0x8000 ? v - 0x10000 : v);

  // W434 and W436's trap, applied to the routine this wave was pointed at: the
  // instructions are COUNTED, and the decode is required to consume the byte
  // span exactly, so a missing one cannot hide.  The port's own header comment
  // lists ELEVEN lines; the routine has twenty-one instructions.
  const INSNS = [
    [0x27f95a, [0x3e, 0x39, 0x00, 0x81, 0x7f, 0x7e], 'move.w $817F7E,D7'],
    [0x27f960, [0x67, 0xf6], 'beq $27F958 (the rts) -- an EMPTY pool returns'],
    [0x27f962, [0x53, 0x47], 'subq.w #1,D7 -- the dbra count'],
    [0x27f964, [0x4d, 0xf9, 0x00, 0x81, 0x71, 0xbe], 'lea $8171BE,A6'],
    [0x27f96a, [0x3c, 0x39, 0x00, 0x81, 0x31, 0x76], 'move.w $813176,D6'],
    [0x27f970, [0x60, 0x04], 'bra $27F976 -- into the scan, past the advance'],
    [0x27f972, [0x4d, 0xee, 0x00, 0x2c], 'lea ($2C,A6),A6 -- the ADVANCE'],
    [0x27f976, [0x32, 0x16], 'move.w (A6),D1 -- the scan head'],
    [0x27f978, [0x67, 0xf8], 'beq $27F972 -- an empty slot advances and retries'],
    [0x27f97a, [0x9d, 0x6e, 0x00, 0x04], 'sub.w D6,($4,A6) -- THE SCROLL'],
    [0x27f97e, [0x70, 0x7c], 'moveq #$7C,D0'],
    [0x27f980, [0xc0, 0x41], 'and.w D1,D0 -- the 5-bit kind, as a BYTE offset'],
    [0x27f982, [0x4a, 0x01], 'tst.b D1'],
    [0x27f984, [0x6b, 0x00, 0x17, 0x44], 'bmi.W $2810CA -- the collected arm'],
    [0x27f988, [0x41, 0xfa, 0x00, 0x14], 'lea ($14,PC),A0'],
    [0x27f98c, [0x4e, 0x71], 'nop -- A REAL INSTRUCTION, and no note listed it'],
    [0x27f98e, [0xd0, 0xc0], 'adda.w D0,A0'],
    [0x27f990, [0x20, 0x50], 'movea.l (A0),A0'],
    [0x27f992, [0x4e, 0x90], 'jsr (A0)'],
    [0x27f994, [0x4d, 0xee, 0x00, 0x2c], 'lea ($2C,A6),A6'],
    [0x27f998, [0x51, 0xcf, 0xff, 0xdc], 'dbra D7,$27F976'],
  ];
  let a = DRIVER;
  for (const [addr, bytes, what] of INSNS) {
    assert.equal(a, addr, `the decode must reach ${hx(addr)} (${what}); the `
      + `instruction before it ended at ${hx(a)}`);
    assert.deepEqual(at(addr, bytes.length), bytes, `${hx(addr)} ${what}`);
    a += bytes.length;
  }
  assert.equal(INSNS.length, 21,
    'twenty-one instructions, stated as a count -- W434 lost one instruction to '
    + 'a uniform-looking block and W436 found three blocks of 13/14/14 that '
    + 'looked identical and were not, so the number is asserted and not eyeballed');
  assert.equal(a, DRIVER_END,
    'and the decode consumes the routine exactly, with no gap and no overrun');
  assert.deepEqual(at(a, 2), [0x4e, 0x75], `${hx(a)} rts`);

  // The three PC-relative targets, each computed from the EXTENSION WORD.
  assert.equal(0x27f962 + s8(0xf6), DRIVER_RTS,
    '$27F960 beq -> $27F958, and $27F958 must BE an rts');
  assert.deepEqual(at(DRIVER_RTS, 2), [0x4e, 0x75], '...which it is');
  assert.equal(0x27f97a + s8(0xf8), DRIVER_ADVANCE,
    '$27F978 beq -> $27F972, the ADVANCE, which then falls through into the '
    + 'scan head again -- the walk skips empty slots with NO slot cap, which is '
    + 'why the port caps at 80 and throws');
  assert.equal(DRIVER_ADVANCE + 4, DRIVER_SCAN,
    '...and the advance is four bytes long, so falling through IS the retry');
  assert.equal(0x27f99a + s16(0xffdc), DRIVER_SCAN,
    '...and so does the dbra, from its own extension word');
  // W437's trap: `bmi` has a 16-bit form and an 8-bit reader resolves it
  // elsewhere.  `6b 00 17 44` is the WIDE one; read as `6b 00` it is a branch to
  // $27F986 -- the very next instruction -- and the collected arm vanishes.
  assert.equal(img[0x27f985], 0x00,
    '$27F984 must be the 16-bit form of bmi -- byte 2 is $00');
  assert.equal(0x27f986 + s16(0x1744), COLLECTED,
    '$27F984 bmi.W -> $2810CA, computed from the EXTENSION WORD $27F986');
  assert.notEqual(0x27f986 + s8(0x00), COLLECTED,
    '...and the 8-bit reading lands somewhere else entirely, which is the whole '
    + 'reason the width is asserted');
  assert.equal(0x27f98a + 0x14, DISPATCH_TABLE,
    '$27F988 lea ($14,PC),A0 -> $27F99E, from the extension word again');

  // AND THE POINT: the only write to a record's position in the whole routine.
  let posWrites = 0;
  for (let p = DRIVER; p < DRIVER_END; p += 2) {
    if (img[p] === 0x9d && img[p + 1] === 0x6e) posWrites++;  // sub.w D6,($4,A6)
  }
  assert.equal(posWrites, 1,
    'exactly ONE instruction in $27F95A touches a record\'s position, and it is '
    + `${hx(0x27f97a)} sub.w D6,($4,A6) -- the scroll. The driver has no other `
    + 'way to put a record anywhere');
  assert.equal(B.posX, 0x04,
    '...and $4(A6) is B.posX, stated against the layout constant so a renamed '
    + 'offset cannot silently move what this test is looking at');
  assert.equal(B.pos, 0x02, '...with the longword at B.pos = +$02');
});

test('W438: the record\'s position at spawn is the CARRIER\'s longword and '
  + 'nothing else -- $280B56 add.l ($2,A6),D1 / $280B5A add.w $813176,D1 / '
  + '$280B60 move.l D1,(A0)+',
{ skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];
  const s8 = (v) => (v >= 0x80 ? v - 0x100 : v);

  assert.deepEqual(at(0x280b54, 0x2c), [
    0x2f, 0x01,                          // move.l D1,-(A7)
    0xd2, 0xae, 0x00, 0x02,              // add.l ($2,A6),D1   <- THE CARRIER
    0xd2, 0x79, 0x00, 0x81, 0x31, 0x76,  // add.w $813176,D1   <- the scroll
    0x20, 0xc1,                          // move.l D1,(A0)+    <- +$02..+$05
    0x06, 0x41, 0x0e, 0x00,              // addi.w #$E00,D1
    0xd2, 0x79, 0x00, 0x81, 0x31, 0x72,  // add.w $813172,D1
    0x06, 0x41, 0xac, 0x00,              // addi.w #$AC00,D1
    0x65, 0xb8,                          // bcs $280B2A
    0x48, 0x41,                          // swap D1
    0x06, 0x41, 0x08, 0x00,              // addi.w #$800,D1
    0x06, 0x41, 0x60, 0x00,              // addi.w #$6000,D1
    0x65, 0xac,                          // bcs $280B2A
    0x22, 0x1f,                          // move.l (A7)+,D1
  ], '$280B54..$280B7E, verbatim -- the position and the off-screen abort');
  assert.equal(0x280b72 + s8(0xb8), FILL_ABORT,
    '$280B70 bcs -> $280B2A, the abort');
  assert.equal(0x280b7e + s8(0xac), FILL_ABORT, '...and so does $280B7C');
  assert.deepEqual(at(FILL_ABORT, 12), [
    0x22, 0x1f,                          // move.l (A7)+,D1
    0x53, 0x79, 0x00, 0x81, 0x7f, 0x7e,  // subq.w #1,$817F7E
    0x42, 0x68, 0xff, 0xfa,              // clr.w (-$6,A0)
  ], `${hx(FILL_ABORT)} undoes the count bump and frees the slot -- an abort `
    + 'costs the record AND its four RNG draws, which is what makes the slot '
    + 'assignment depend on where the carriers are');
  assert.deepEqual(at(FILL, 2), [0x52, 0x79],
    `${hx(FILL)} addq.w #1,$817F7E opens the fill`);

  // `add.l` -- a LONG add, so BOTH halves of the carrier's position come across
  // and the low-to-high carry is the cartridge's own.  The word form would be
  // `d2 6e`; it is `d2 ae`.  W437's rule about size bits, on the instruction
  // that decides this wave's field.
  assert.equal(img[0x280b56], 0xd2, '$280B56 is an `add` into D1');
  assert.equal(img[0x280b57], 0xae,
    '...and mode/size bits $AE make it add.l ($2,A6),D1 -- the LONG form. '
    + '$AE against the word form $6E is the whole difference between inheriting '
    + 'the carrier\'s position and inheriting half of it');

  // No window is declared: everything above is code.
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const list = tables.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]);
  assert.equal(list.length, ROM_WINDOW_COUNT,
    'the whole window set, counted once in tests/romwindowset.js -- this wave '
    + 'declares no window');
  assert.equal(overlappingPairs(list), ROM_OVERLAP_PAIRS, OVERLAP_NOTE);
});

// ===========================================================================
// A shared runner.  Every arm below reads from this cache, so a 100-frame
// segment is stepped ONCE however many assertions stand on it.
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

/** Step `game` from `from` to `to` on the BOARD'S OWN input words, collecting
 *  the frames where the port's `$803916` delta differs from the board's. */
function stepFrames(game, pokes, trace, from, to, drawGap) {
  let portPrev = game.ram.u16(RNG_STATE);
  let boardPrev = Number(trace.byLf.get(from).rng);
  for (let lf = from + 1; lf <= to; lf++) {
    const r = trace.byLf.get(lf);
    assert.ok(r, `the trace must carry lf${lf}`);
    for (const [a, v] of pokes) game.ram.setU8(a, v);
    game.step(Number(r.portin));
    const p = game.ram.u16(RNG_STATE);
    const b = Number(r.rng);
    if (drawGap && ((p - portPrev) & 0xff) !== ((b - boardPrev) & 0xff)) {
      drawGap.push([lf, (p - portPrev) & 0xff, (b - boardPrev) & 0xff]);
    }
    portPrev = p; boardPrev = b;
  }
}

/** Pool A, slot by slot: which offsets differ, and how the slots classify. */
function poolA(board, port) {
  let identical = 0, statusSame = 0;
  const posOnly = [], otherwise = [], identicalSlots = [];
  const offsets = new Map();
  for (let s = 0; s < POOL_A.generalSlots; s++) {
    const o = slotOffA(s);
    const bad = [];
    for (let k = 0; k < POOL_A.stride; k++) {
      if (board[o + k] !== port[o + k]) {
        bad.push(k); offsets.set(k, (offsets.get(k) || 0) + 1);
      }
    }
    if (bad.length === 0) { identical++; identicalSlots.push(s); }
    else if (bad.every((k) => k >= B.pos && k <= B.pos + 3)) posOnly.push(s);
    else otherwise.push(s);
    if (((board[o] << 8) | board[o + 1]) === ((port[o] << 8) | port[o + 1])) {
      statusSame++;
    }
  }
  let occupied = 0;
  const distinctPos = new Set();
  for (let s = 0; s < POOL_A.generalSlots; s++) {
    const o = slotOffA(s);
    if ((port[o] << 8) | port[o + 1]) {
      occupied++;
      distinctPos.add(((port[o + 2] << 24) | (port[o + 3] << 16)
        | (port[o + 4] << 8) | port[o + 5]) >>> 0);
    }
  }
  return {
    identical, statusSame, identicalSlots, posOnly, otherwise, occupied,
    distinctPos: distinctPos.size,
    liveCount: (port[POOL_A.liveCount - RAM_BASE] << 8)
      | port[POOL_A.liveCount - RAM_BASE + 1],
    offsets: [...offsets.entries()].sort((x, y) => x[0] - y[0]),
  };
}

function poolBStat(buf) {
  let live = 0, nonBlank = 0;
  for (let s = 0; s < POOL_B.slots; s++) {
    const o = slotOffB(s);
    if (((buf[o] << 8) | buf[o + 1]) & 0x8000) live++;
    for (let k = 0; k < POOL_B.stride; k++) if (buf[o + k]) { nonBlank++; break; }
  }
  return {
    live,
    nonBlank,
    count: (buf[POOL_B.count - RAM_BASE] << 8)
      | buf[POOL_B.count - RAM_BASE + 1],
  };
}

function poolB(board, port) {
  let identical = 0;
  const offsets = new Set();
  for (let s = 0; s < POOL_B.slots; s++) {
    const o = slotOffB(s);
    let bad = 0;
    for (let k = 0; k < POOL_B.stride; k++) {
      if (board[o + k] !== port[o + k]) { bad++; offsets.add(k); }
    }
    if (bad === 0) identical++;
  }
  return {
    identical,
    offsets: [...offsets].sort((x, y) => x - y),
    board: poolBStat(board),
    port: poolBStat(port),
  };
}

function bullets(board, port) {
  let identical = 0;
  const offsets = new Map();
  for (let s = 0; s < BUL.slots; s++) {
    const o = slotOffBul(s);
    let bad = 0;
    for (let k = 0; k < BUL.stride; k++) {
      if (board[o + k] !== port[o + k]) {
        bad++; offsets.set(k, (offsets.get(k) || 0) + 1);
      }
    }
    if (bad === 0) identical++;
  }
  return { identical, differ: BUL.slots - identical, offsets };
}

async function segment(seedLf, cmpLf) {
  const key = `${seedLf}->${cmpLf}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const trace = readTrace(TRACE);
  const { game, pokes } = await makeGame(seedLf);
  const drawGap = [];
  stepFrames(game, pokes, trace, seedLf, cmpLf, drawGap);
  const board = boardRam(cmpLf);
  const port = game.ram.b;
  const out = {
    drawGap,
    a: poolA(board, port),
    boardA: poolA(board, board),
    b: poolB(board, port),
    bul: bullets(board, port),
    port: Uint8Array.from(port),
    board,
  };
  CACHE.set(key, out);
  return out;
}

// ===========================================================================
// 2. THE DELIVERABLE -- lf9600->9700, WHERE `$27F95A` DOES ITS WORK ALONE
// ===========================================================================
test('W438: lf9600->9700 -- SEVENTY OF SEVENTY pool-A slots byte-identical, '
  + 'with 68 records stepped 100 frames and 36 of them FREED inside the window',
{ skip: SKIP_LADDER }, async () => {
  // W435's trap first: this rung is load-bearing on BOTH sides.  The board
  // enters it with 68 occupied general slots and leaves with 32, so a port that
  // froze the pool, wiped it, or stepped it by any constant fails.
  const seed = boardRam(9600);
  let seedOcc = 0;
  for (let s = 0; s < POOL_A.generalSlots; s++) {
    const o = slotOffA(s);
    if ((seed[o] << 8) | seed[o + 1]) seedOcc++;
  }
  assert.equal(seedOcc, BOARD_POOLA[9600],
    'the board holds 68 pool-A records at lf9600 -- the seed is not an empty '
    + 'array, which is what W435 found the last time a rung was chosen badly');

  const r = await segment(9600, 9700);
  assert.equal(r.boardA.occupied, BOARD_POOLA[9700],
    'and 32 at lf9700, so THIRTY-SIX records are freed inside the window: the '
    + 'driver must not only move them, it must free the right ones on the right '
    + 'frames');
  assert.equal(r.a.occupied, BOARD_POOLA[9700],
    'the port must hold the same 32 -- the brief said 27, which is the '
    + 'TWO-HUNDRED-frame run seeded at lf9500 and asserted separately below');
  assert.equal(r.a.liveCount, BOARD_POOLA[9700], '...and the same $817F7E');
  assert.equal(r.a.distinctPos, BOARD_POOLA[9700],
    '...and the 32 survivors carry 32 DISTINCT position longwords, so no '
    + 'constant position satisfies this');
  assert.deepEqual(r.a.offsets, [], 'NO byte of any pool-A slot may differ');
  assert.equal(r.a.identical, POOL_A.generalSlots, '70 of 70, stated as a count');
  assert.equal(r.a.statusSame, POOL_A.generalSlots, '...and every status word');
  assert.deepEqual(r.drawGap, [],
    'and the port draws from $803916 exactly as often as the board on all 100 '
    + 'frames');

  // Pool B on the same segment -- W434..W437's work, not regressed.
  assert.equal(r.b.identical, POOL_B.slots, 'pool B stays 80/80 here');
  assert.deepEqual(r.b.offsets, [], '...with no differing offset');
  assert.deepEqual([r.b.port.live, r.b.port.nonBlank, r.b.port.count],
    [r.b.board.live, r.b.board.nonBlank, r.b.board.count],
    '...and the board\'s live count, non-blank count and $81C8EA');
});

test('W438: lf9700->9800 is 70/70 as well, and the board DRAINS pool A to zero '
  + 'across it -- so the second segment is not a second copy of the first',
{ skip: SKIP_LADDER }, async () => {
  const r = await segment(9700, 9800);
  assert.equal(r.boardA.occupied, BOARD_POOLA[9800],
    'the board holds no pool-A record at lf9800');
  assert.equal(r.a.occupied, BOARD_POOLA[9800], '...and neither does the port');
  assert.equal(r.a.identical, POOL_A.generalSlots,
    '70 of 70 -- every freed slot\'s RESIDUE matches too, which is a stronger '
    + 'statement than "both are empty": the status word is zero on both sides '
    + 'and the other 42 bytes still carry the last tenant');
  assert.equal(r.b.identical, POOL_B.slots, 'pool B is 80/80 here too');
  assert.deepEqual(r.drawGap, [],
    '...and the draw counts agree on all 100 frames');
});

// ===========================================================================
// 3. THE RESIDUAL -- lf9500->9600, AND EXACTLY WHICH FIELD RESISTS
// ===========================================================================
test('W438 (rewritten by W440): lf9500->9600 is now 70/70 pool A and 210/210 '
  + 'bullets, where W438 measured 2/70 with SIXTY slots differing ONLY at '
  + '+$02..+$05 -- the residual this file was written about is gone',
{ skip: SKIP_LADDER }, async () => {
  const r = await segment(9500, 9600);

  // The counts W437 delivered, still exact.
  assert.equal(r.boardA.occupied, BOARD_POOLA[9600],
    'the board holds 68 pool-A records at lf9600');
  assert.equal(r.a.occupied, BOARD_POOLA[9600], '...and so does the port');
  assert.equal(r.a.liveCount, BOARD_POOLA[9600], '...with the same $817F7E');
  assert.deepEqual(r.drawGap, [],
    'and W437\'s draw-count agreement on all 100 frames is not regressed');

  // W438's classification, re-asserted against the state that replaced it.
  assert.equal(r.a.identical, POOL_A.generalSlots,
    'SEVENTY of seventy pool-A slots are byte-identical. [M] W438 measured 2, '
    + 'with slots 1 and 3 the only two, and W439 re-asserted that 2 so it could '
    + 'not be quietly claimed later. W440 closed it from src/bossf23.js and '
    + 'touched no pool-A code at all');
  assert.equal(r.a.statusSame, POOL_A.generalSlots,
    '...the status word matches on all seventy, where it matched on 62');
  assert.deepEqual(r.a.posOnly, [],
    '...NO slot differs only at +$02..+$05, where SIXTY did. That group was the '
    + 'claim this whole file exists to make measurable, and it is empty because '
    + 'the carrier those records copy their position from is now the board\'s');
  assert.deepEqual(r.a.otherwise, [],
    '...and no slot differs any other way either, where eight did -- FOUR '
    + 'PAIRS, each a one-slot allocation shift, which is exactly what a wrongly '
    + 'placed carrier produces in a pool allocated by a first-free scan');
  assert.equal(r.bul.identical, BUL.slots,
    'and the BULLET pool on the same run is 210/210, where it was 149. The two '
    + 'moved together, in one edit, which is this file\'s central claim');

  // Every field of every record, named one by one rather than as "the rest",
  // because "the rest" is what hides a defect.  W438 ran this loop over its
  // sixty position-only slots; it now runs over all seventy.
  const { board, port } = r;
  const FIELDS = [
    ['status', [0x00, 0x01]],
    ['sprite offsets', [0x06, 0x07, 0x08, 0x09]],
    ['sprite descriptor', [0x0a, 0x0b, 0x0c, 0x0d]],
    ['size', [0x0e, 0x0f]],
    ['hitbox', [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]],
    ['blink timer', [0x18, 0x19]],
    ['speed', [0x1a]],
    ['angle', [0x1b]],
    ['template word', [0x1c, 0x1d]],
    ['hit count', [0x1e, 0x1f]],
    ['cached velocity', [0x20, 0x21, 0x22, 0x23]],
    ['layer emitter', [0x28, 0x29, 0x2a, 0x2b]],
  ];
  for (const [name, ks] of FIELDS) {
    for (const s of r.a.identicalSlots) {
      const o = slotOffA(s);
      for (const k of ks) {
        assert.equal(port[o + k], board[o + k],
          `pool-A slot ${s} ${hx2(k)} (${name}) must already be the board's `
          + `-- the port has ${hx(port[o + k])} and the board `
          + `${hx(board[o + k])}`);
      }
    }
  }
  // The speed/angle agreement is what makes the trajectory argument work: kind 0
  // ramps `+$1A` once per unfrozen frame and recomputes the velocity from
  // (speed, angle) every frame, so equal speed at lf9600 means equal AGE and
  // equal angle means the same table row on every one of those frames.  The
  // accumulated displacement is therefore identical, and only the SPAWN position
  // can differ.
  assert.equal(r.a.posOnly.length + r.a.otherwise.length + r.a.identical,
    POOL_A.generalSlots, 'the three classes account for all seventy slots');
  assert.equal(r.a.identicalSlots.length, POOL_A.generalSlots,
    '...and the field loop above therefore ran over every one of them, not '
    + 'over a subset that happened to agree');

  // Pool B, unregressed, on the segment W436 and W437 fought over.
  assert.equal(r.b.identical, POOL_B.slots, 'pool B is 80/80');
  assert.deepEqual(r.b.offsets, [], '...with no differing offset');
  assert.deepEqual([r.b.port.live, r.b.port.nonBlank, r.b.port.count],
    [BOARD_B_LIVE, BOARD_B_NONBLANK, BOARD_B_COUNT],
    '...and the board\'s 33 live / 43 non-blank / $81C8EA = $22');
});

test('W438 (rewritten by W440): the TWO-HUNDRED-frame run lf9500->lf9700 now '
  + 'reaches the board\'s 32 records and 70/70, where W438 measured 27 -- its '
  + 'diagnosis of that 27 confirmed by the number moving when the CARRIER was '
  + 'fixed and nothing else was',
{ skip: SKIP_LADDER }, async () => {
  const long = await segment(9500, 9700);
  assert.equal(long.boardA.occupied, BOARD_POOLA[9700],
    'the board holds 32 pool-A records at lf9700 either way');
  assert.equal(long.a.occupied, BOARD_POOLA[9700],
    'seeded at lf9500 the port now reaches 32. [M] W438 measured 27 here and '
    + 'named it correctly -- 200 frames of accumulated CARRIER error, not a '
    + 'statement about $27F95A -- and W440 removed the carrier error without '
    + 'touching this driver at all');
  assert.equal(long.a.identical, POOL_A.generalSlots,
    '...with all seventy slots byte-identical over the 200 frames');
  const short = await segment(9600, 9700);
  assert.equal(short.a.occupied, BOARD_POOLA[9700],
    '...while seeded at lf9600 it reaches the board\'s 32 exactly');
  assert.equal(short.a.identical, POOL_A.generalSlots,
    '...byte-identically, on all seventy slots');
});

// ===========================================================================
// 4. THE ATTRIBUTION -- POOL A IS EXACT WHERE THE BULLET POOL IS
// ===========================================================================
test('W438 (rewritten by W440): pool A is byte-perfect on exactly the segments '
  + 'where the BULLET pool is -- and W440 fixing the bullet pool on the one '
  + 'row where they disagreed carried pool A with it, which is this claim '
  + 'confirmed and not restated',
{ skip: SKIP_LADDER }, async () => {
  const a = await segment(9500, 9600);
  const b = await segment(9600, 9700);
  const c = await segment(9700, 9800);

  assert.equal(b.bul.identical, BUL.slots,
    'lf9600->9700: all 210 bullet slots byte-identical');
  assert.equal(b.a.identical, POOL_A.generalSlots, '...and pool A is 70/70');
  assert.equal(c.bul.identical, BUL.slots,
    'lf9700->9800: all 210 bullet slots byte-identical');
  assert.equal(c.a.identical, POOL_A.generalSlots, '...and pool A is 70/70');

  // The row W438 measured as the exception.  [M] then: 61 bullet slots differ
  // (all 61 at +$05, 56 at +$04, NONE at +$02/+$03 because $281EC4 writes
  // #$FFFF over the long axis when it frees a slot) and pool A is 2/70.
  assert.equal(a.bul.differ, 0,
    'lf9500->9600: ZERO bullet slots differ, where W438 measured SIXTY-ONE. '
    + 'That segment was the only row in the table where the port re-diverged '
    + 'inside the window the pool-A deliverable is measured on');
  assert.equal(a.a.identical, POOL_A.generalSlots,
    '...and pool A is 70/70 on that same run, where it was 2/70. ONE edit, in '
    + 'src/bossf23.js, moved both -- so the correlation this test names is not '
    + 'a coincidence of two pools that happen to be hard, it is a dependency');
  assert.equal(a.bul.offsets.get(0x05) ?? 0, 0,
    '...with nothing left at +$05, the low byte of REC.posB, where all 61 of '
    + 'the differing slots used to sit');
  assert.equal(a.bul.offsets.get(0x04) ?? 0, 0,
    '...nor at +$04, its high byte, where 56 of them did');
  assert.equal(a.bul.offsets.get(0x02) ?? 0, 0,
    'and none at +$02/+$03 either -- which was ALREADY true in W438, because '
    + '$281EC4 writes #$FFFF there when it frees a slot: the kill overwrites '
    + 'the long axis and leaves the short one holding the position the bullet '
    + 'died at. That is why the residue pointed at the position and not at the '
    + 'record as a whole');
  assert.equal(a.bul.offsets.get(0x03) ?? 0, 0, '...neither at +$03');
  assert.equal(REC.posB, 0x04,
    'stated against the layout constant so a renamed offset cannot silently '
    + 'move what this test is looking at');
  assert.equal(REC.posA, 0x02, '...and REC.posA is the +$02 half');
});

// ===========================================================================
// 5. THE FIELD ISOLATION, WHICH IS THE FALSIFICATION
// ===========================================================================
test('W438 (rewritten by W440): the field isolation, run UNDER A MUTATION so '
  + 'it can still fail -- with $29690A put back to its 8-bit reading, handing '
  + 'the port the board\'s value for ALL FORTY OTHER BYTES moves NOTHING and '
  + 'the four position bytes move 60/70 to 70/70',
{ skip: SKIP_LADDER }, async () => {
  const trace = readTrace(TRACE);
  const board9600 = boardRam(9600);
  const board9700 = boardRam(9700);
  const POS = [0x02, 0x03, 0x04, 0x05];
  const OTHERS = Array.from({ length: POOL_A.stride }, (_, i) => i)
    .filter((k) => k < 0x02 || k > 0x05);

  // W440 closed the divergence this experiment was run on, so the experiment
  // is run on one it can create: `e14-fallthrough` restores the single 8-bit
  // reading of $29690A and puts a wrongly-placed carrier back in the pool.
  // The mechanism under test is unchanged; only its source of error is.
  async function arm(ks, mut) {
    const prev = W440_MUTATE.value;
    W440_MUTATE.value = mut;
    try {
      const { game, pokes } = await makeGame(9500);
      stepFrames(game, pokes, trace, 9500, 9600, null);
      const before = poolA(board9600, game.ram.b);
      for (let s = 0; s < POOL_A.generalSlots; s++) {
        const o = slotOffA(s);
        for (const k of ks) game.ram.b[o + k] = board9600[o + k];
      }
      const after = poolA(board9600, game.ram.b).identical;
      stepFrames(game, pokes, trace, 9600, 9700, null);
      return { before, after, at9700: poolA(board9700, game.ram.b).identical };
    } finally {
      W440_MUTATE.value = prev;
    }
  }

  // FIRST: the port as shipped needs no patch at all.
  const clean = await arm([], null);
  assert.deepEqual(
    [clean.before.identical, clean.after, clean.at9700],
    [POOL_A.generalSlots, POOL_A.generalSlots, POOL_A.generalSlots],
    'unmutated, the control arm patches nothing and is 70/70 at lf9600 and '
    + 'still 70/70 100 frames later. [M] W438 measured 2, 2 and 2 here');

  const none = await arm([], 'e14-fallthrough');
  assert.equal(none.before.identical, 60,
    'with $29690A restored to its 8-bit reading the control arm falls to '
    + '60/70 -- so this experiment has something to isolate again');
  assert.equal(none.before.posOnly.length, 10,
    '...and the TEN slots that differ, differ ONLY at +$02..+$05. That is '
    + 'W438\'s central classification, reproduced on demand from one branch');
  assert.deepEqual(none.before.otherwise, [],
    '...with not one slot differing any other way');
  assert.equal(none.at9700, 55,
    '...and 100 frames later the unpatched arm holds 55 of 70');

  const others = await arm(OTHERS, 'e14-fallthrough');
  assert.equal(others.after, 60,
    'handing the port the board\'s value for ALL FORTY OTHER BYTES of every '
    + 'record moves the number by ZERO -- 60/70 before and 60/70 after. A port '
    + 'with a second defect anywhere else in the 44-byte record would improve '
    + 'here, and this is the arm that says there is none');
  assert.equal(others.at9700, 55, '...and 55 at lf9700, also unmoved');

  const pos = await arm(POS, 'e14-fallthrough');
  assert.equal(pos.after, POOL_A.generalSlots,
    'patching ONLY +$02..+$05 at lf9600 takes pool A from 60/70 to 70/70 -- '
    + 'four bytes against forty, and only the four move anything');
  assert.equal(pos.at9700, POOL_A.generalSlots,
    '...and after 100 MORE frames of $27F95A stepping them, ALL SEVENTY are '
    + 'still byte-identical, where the unpatched run holds 55. A constant '
    + 'written into the position could not survive that: the driver frees a '
    + 'record on the frame its long axis goes negative, so a wrong position '
    + 'frees on a wrong frame and the survivors are a different set');
  assert.equal(W440_MUTATE.value, null,
    '...and the mutation is back to null, asserted rather than trusted');

  // THE ARM THAT MAKES THIS UNFAKEABLE, stated as a size: every byte of the
  // record EXCEPT the position is replaced with the board's, on all seventy
  // slots -- forty bytes each, 2,800 in total, and the number does not move.
  assert.equal(OTHERS.length, POOL_A.stride - 4,
    'the OTHERS arm patches all 40 non-position bytes of the 44-byte record');
  assert.equal(OTHERS.length * POOL_A.generalSlots, 2800,
    '...which is 2,800 bytes of the board\'s own answer handed to the port for '
    + 'nothing. The position is not the LARGEST defect in pool A, it is the '
    + 'ONLY one');

  // Four single-field controls, so "the position field" is not standing in for
  // "some field that happens to sit near it".
  for (const [name, ks] of [
    ['speed/angle +$1A/+$1B', [0x1a, 0x1b]],
    ['cached velocity +$20..+$23', [0x20, 0x21, 0x22, 0x23]],
    ['sprite descriptor +$0A..+$0D', [0x0a, 0x0b, 0x0c, 0x0d]],
    ['status +$00/+$01', [0x00, 0x01]],
  ]) {
    const one = await arm(ks, 'e14-fallthrough');
    assert.deepEqual([one.after, one.at9700], [60, 55],
      `patching ${name} moves nothing -- it is already the board's, at lf9600 `
      + 'and still at lf9700');
  }
});

// ===========================================================================
// 6. THE UNIT W438 PINNED -- AND **W439 CLOSED IT**
// ===========================================================================
//
// W438 left this rung at 209/210 with slot 3 never written, and named that the
// next unit.  W439 found it: `$274A9C..$274AEE`, type $82's SECOND fire, a
// counted note in `src/handlers.js` since W81.  The assertions below are the
// SAME MEASUREMENTS W438 made, with the two that recorded the DEFECT flipped to
// record the fix, so the rung keeps guarding what W438 proved about it.
//
// **THE FULL FALSIFICATION LIVES IN `tests/w439secondfire82.test.js`** -- the
// frame, the enemy's own record, a RED run that removes the spawn again, and a
// pair of ROM-corruption arms that say the muzzle offset is read and not
// constant.  This file keeps only the rung-level numbers.
test('W438/W439: the bullet divergence at its cleanest -- lf4025->4050, where '
  + 'W438 measured 209 of 210 slots and named slot 3 as ONE spawn the port '
  + 'never made. W439 ports $274A9C and the rung is 210 of 210',
{ skip: SKIP_FINE }, async () => {
  const trace = readTrace(TRACE);
  const seed = boardRam(4025);
  const { game, pokes } = await makeGame(4025);
  const drawGap = [];
  stepFrames(game, pokes, trace, 4025, 4050, drawGap);
  const board = boardRam(4050);
  const port = game.ram.b;

  const w = (buf, o) => (buf[o] << 8) | buf[o + 1];
  const live = (buf) => {
    let n = 0;
    for (let s = 0; s < BUL.slots; s++) if (w(buf, slotOffBul(s)) & 0x8000) n++;
    return n;
  };
  assert.equal(live(seed), 28, 'the board holds 28 live bullets at lf4025');
  assert.equal(live(board), 20, '...and 20 at lf4050');
  assert.equal(live(port), 20,
    '...and the port now holds 20 too. W438 measured NINETEEN here -- one '
    + 'short -- and that single missing bullet was this rung\'s whole defect');

  const differ = [];
  for (let s = 0; s < BUL.slots; s++) {
    const o = slotOffBul(s);
    for (let k = 0; k < BUL.stride; k++) {
      if (board[o + k] !== port[o + k]) { differ.push(s); break; }
    }
  }
  assert.deepEqual(differ, [],
    'and NONE of the 210 slots differs over these 25 frames. W438 measured '
    + '`[3]` here');
  assert.deepEqual(drawGap, [],
    '...with the port making the board\'s number of RNG draws on every one of '
    + 'the 25 frames -- true BEFORE the fix, when the missing spawn cost no '
    + 'draw, and still true after it, because $281484 at rank 0 reads no RNG '
    + 'either. That is why a draw-count gate could never have found this');

  const o = slotOffBul(3);
  assert.equal(w(board, o) & 0x8000, 0x8000,
    'the board\'s slot 3 is ALIVE at lf4050');
  assert.equal(w(board, o) & TYPEBIT.kindMask, 0x07, '...carrying kind 7');
  assert.equal(w(board, o) & TYPEBIT.coreB, 0,
    '...with bit 9 CLEAR, so it was spawned by bank A ($2814B6) and not bank B');
  assert.equal(w(port, o), w(board, o),
    '...and the port\'s slot 3 carries the same type word, where W438 measured '
    + 'a zero');
  let sameAsSeed = 0;
  for (let k = 0; k < BUL.stride; k++) {
    assert.equal(port[o + k], board[o + k],
      `and the port's slot 3 matches the BOARD at +$${
        k.toString(16).padStart(2, '0')}`);
    if (port[o + k] === seed[o + k]) sameAsSeed++;
  }
  assert.notEqual(sameAsSeed, BUL.stride,
    '...and it is no longer byte-identical to the lf4025 SEED, which is exactly '
    + 'the state W438 measured: not spawned-and-killed, not killed early, '
    + 'simply NEVER WRITTEN');
});
