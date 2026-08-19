// WAVE 436 -- THE THREE MISSING LIVE RECORDS ARE SCRIPT 5's SPARK BLOCKS.
//
// ---------------------------------------------------------------------------
// THE UNIT, AND WHAT IT ACTUALLY WAS
// ---------------------------------------------------------------------------
// `out/w69/stage1-laser-hold` lf9500->9600 was the ONLY red 100-frame pool-B
// segment in lf9300..10700 -- 60/80 since W434, with W435 measuring
//
//   [M] board  33 live / 43 non-blank / $81C8EA = $22
//   [M] port   30 live / 35 non-blank / $81C8EA = $1F
//
// and calling it "a spawn-count divergence with everything downstream shifted
// by allocation order". THAT READING IS CORRECT AND THIS WAVE CONFIRMS IT BY
// ADDRESS. The eight non-blank records the port never made are the eight
// firings of the THREE `$3(a4)`-gated spark blocks at `$293BB8..$293C87` --
// A3 script 5's, the boss's SECOND side part -- over lf9558..lf9574.
//
//   [M] block $293BB8 (bit 2, ctr $8/$9, reload 7) fires lf9558, 9566, 9574
//   [M] block $293BFC (bit 0, ctr $4/$5, reload 8) fires lf9558, 9567
//   [M] block $293C42 (bit 1, ctr $6/$7, reload 5) fires lf9558, 9564, 9570
//
// Three of those eight are still LIVE at lf9600 (slots 29, 33 and 34 on the
// board), which is the brief's "three live records", and all eight are the
// "eight non-blank" ones.
//
// WHY THE PORT DID NOT RUN THEM. `partScriptStep` is shared by scripts 4 and
// 5 and began at the state machine, because script 4's step opens
// `$293970 bra.w $293A44` and jumps its own copy of the blocks. Script 5's
// step (`$293BAE`) has NO such branch. W62 wrote "NOTHING sets a bit of
// `$3(a4)`"; the state-0 burst table `$293D32` sets bits 0, 1 and 2 through
// `burst2938AE`'s `loopctl`, which the port has honoured since W107 -- so the
// bits were being set, with nothing to read them.
//
// ---------------------------------------------------------------------------
// THE ONE PLACE THE BRIEF WAS WRONG, MEASURED
// ---------------------------------------------------------------------------
// "its four neighbours are 80/80 *including* live records" -- [M] lf9600->9700
// and lf9700->9800 do carry live records (9 and 26); lf9300->9400 and
// lf9400->9500 carry NONE (0 live, 26 non-blank on both sides). Two of the
// four neighbours could not have distinguished a live-record defect at all.
// Both are asserted below anyway, as the "did not break them" evidence.
//
// ---------------------------------------------------------------------------
// AND WHAT THIS WAVE DOES **NOT** CLOSE, STATED AS A NUMBER
// ---------------------------------------------------------------------------
// With the blocks translated, every one of the 80 slots carries the board's
// own KIND WORD and the board's own DESCRIPTOR, in the board's own SLOT --
// 80/80 on both -- and the counts are the board's exactly. [M] 63 of 80 slots
// are byte-identical; the 17 that are not differ ONLY at +$02..+$05, +$1B and
// +$35..+$37, i.e. THE ANGLE AND WHAT FOLLOWS FROM IT.
//
// THE CAUSE IS UPSTREAM OF POOL B AND IS NOT THIS UNIT. `$242B3C` indexes its
// table with `$803916` ITSELF, so a draw-count deficit shifts every angle.
// [M] over lf9501..9600 the port's per-frame draw count equals the board's on
// 97 of 100 frames and is short on three: **lf9556 by 24**, lf9562 by 1 and
// lf9592 by 1. lf9556 is the frame `$294DD4` runs, and the port's only draw
// there is one beam impact. WITH THE BOARD's OWN `$803916` WRITTEN IN EACH
// FRAME the segment is 80/80 BYTE-IDENTICAL, and that is asserted below.
// Before this wave the same forcing gives 62/80 -- so the poke does not paper
// over the missing blocks, it isolates a second, older defect.
//
// **W437 CLOSED THAT SECOND DEFECT AND THIS FILE NOW MEASURES THE RESULT.**
// The deficit was `$281E36 jsr $27F8F8` -- the mover's global-kill free, which
// `mover.js` counted instead of calling -- so the two arms below that used to
// assert the residual assert its ABSENCE, and lf9500->9600 is 80/80 with
// NOTHING forced.  See `w437deatheffect.test.js` for the attribution.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE PROVES, AND IN WHICH ORDER
// ---------------------------------------------------------------------------
//  1. THE ROM. The `bra.w` that makes script 4's copy dead lands exactly on
//     the state machine; script 5's step reaches `$293BB8` with nothing in
//     between; the three blocks are 13 + 14 + 14 instructions and NOT three
//     copies of one shape -- blocks 2 and 3 carry `d0 00` (`add.b D0,D0`) and
//     block 1 does not, and block 3 is a different KIND, BUCKET and SPEED.
//  2. THE DELIVERABLE, seeded from the board's lf9500 rung and stepped on the
//     board's own input words: the counts, the kind word and the descriptor of
//     all 80 slots, the exact set of differing byte offsets, and 80/80
//     byte-identical under the board's own RNG word.
//  3. THE POSITIVE CONTROL and THE NEIGHBOURS -- lf9600 is not an empty pool
//     on either side (W435's trap), and the four neighbouring segments stay
//     80/80.
//  4. THE RED, twice: `W436_MUTATE = 'no-sparks'` puts the counts back to
//     30/35/$1F and the segment back to 60/80, AND it still fails at 62/80
//     with the board's RNG forced.
//  5. THE DIRTY POOL. Driven directly over $5A dirt, the blocks allocate
//     EIGHT records into EIGHT DISTINCT slots on eight specific steps with
//     three distinct (kind, bucket, speed, nudge) signatures, and leave every
//     field the ROM does not write still reading $5A. A constant written eight
//     times fails all three of those.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { POOL_B, B } from '../src/effects.js';
import { sparkBlocks293BB8, W436_MUTATE } from '../src/boss.js';
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
const SEED_LF = 9500;                  // the rung this run starts from
const CMP_LF = 9600;                   // ...and the rung that carries the proof
const RNG_STATE = 0x803916;            // $242B42 -- the table INDEX, not a seed

// The ROM addresses this file stands on.
const S4_STEP = 0x293966;              // script 4's step entry
const S4_BRA = 0x293970;               //   ...and the branch that kills its blocks
const S5_STEP = 0x293bae;              // script 5's step entry
const BLOCK1 = 0x293bb8;
const BLOCK2 = 0x293bfc;
const BLOCK3 = 0x293c42;
const STATE_MACHINE = 0x293a44;        // script 4's...
const S5_STATE_MACHINE = 0x293c88;     // ...and script 5's
const S5_STATE0_TABLE = 0x293d32;      // PART[5].tState0, the loopctl source

// [M] the counts, out of the board's own lf9600 dump.
const BOARD_LIVE = 33;
const BOARD_NONBLANK = 43;
const BOARD_COUNT = 0x22;
// [M] the byte offsets that still differed while the `$803916` deficit was
// open -- W436's residual, and now W437's RED arm.
const ANGLE_TAIL = [0x02, 0x03, 0x04, 0x05, 0x1b, 0x35, 0x36, 0x37];
// [M] the three frames W436 measured the port drawing fewer times than the
// board, and by how much.  lf9556 is `$294DD4`'s own frame.
//
// ===================== WAVE 437 CLOSED ALL THREE =============================
// The 24 missing draws on lf9556 are `$281E36 jsr $27F8F8`, the mover's
// GLOBAL-KILL free.  `$294DDC bset #$7,$8130F8` makes that word NEGATIVE, so
// `$281E20`'s gate takes every live bullet -- [M] 101 of them on that frame --
// and six are still on screen, so six get past `$280B2A`'s abort and each makes
// FOUR draws.  lf9562 and lf9592 are the same call: the bit stays set, so every
// bullet that spawns afterwards is killed on the next mover pass.  `mover.js`
// COUNTED that `jsr` instead of making it.  Both constants below are therefore
// the state of the port under `W437_MUTATE = 'no-death-effect'` and NOT its
// live state; with W437 on, both are EMPTY.
const RNG_DEFICIT = [[9556, 4, 28], [9562, 12, 13], [9592, 0, 1]];

const hx = (v) => `$${v.toString(16).toUpperCase()}`;
const hx2 = (v) => `+$${v.toString(16).toUpperCase().padStart(2, '0')}`;
const bx = (v) => `$${v.toString(16).toUpperCase().padStart(2, '0')}`;
const slotOff = (s) => POOL_B.base - RAM_BASE + s * POOL_B.stride;

// ===========================================================================
// 1. THE ROM
// ===========================================================================
test('W436: $293970 bra.w lands ON script 4\'s state machine, script 5 reaches '
  + '$293BB8 with nothing in between, and the three blocks are 13 + 14 + 14 '
  + 'instructions -- NOT three copies of one shape',
{ skip: SKIP_IMAGE || SKIP_TABLES }, () => {
  const img = fs.readFileSync(IMAGE);
  const at = (a, n) => [...img.subarray(a, a + n)];
  const u16 = (a) => (img[a] << 8) | img[a + 1];
  const u32 = (a) => (((img[a] << 24) | (img[a + 1] << 16)
    | (img[a + 2] << 8) | img[a + 3]) >>> 0);

  // -- script 4's blocks are DEAD, and it is the branch that says so.
  assert.deepEqual(at(S4_STEP, 6), [0x30, 0x39, 0x00, 0x81, 0x31, 0x76],
    `${hx(S4_STEP)} move.w $813176,D0 -- the scroll preamble`);
  assert.deepEqual(at(S4_BRA, 4), [0x60, 0x00, 0x00, 0xd2],
    `${hx(S4_BRA)} must be bra.w with a $D2 displacement`);
  assert.equal(S4_BRA + 2 + 0xd2, STATE_MACHINE,
    '...and it lands on $293A44 (extension word + displacement)');
  assert.deepEqual(at(STATE_MACHINE, 6), [0x0c, 0x2c, 0x00, 0x02, 0x00, 0x02],
    '$293A44 is cmpi.b #$2,($2,A4) -- the STATE MACHINE\'s own first '
    + 'instruction, so the branch skips the three blocks and nothing else');

  // -- script 5's step has the SAME preamble and NO branch.
  assert.deepEqual(at(S5_STEP, 6), [0x30, 0x39, 0x00, 0x81, 0x31, 0x76],
    `${hx(S5_STEP)} move.w $813176,D0 -- the same two-instruction preamble`);
  assert.deepEqual(at(S5_STEP + 6, 4), [0x91, 0x6e, 0x00, 0x64],
    '$293BB4 sub.w D0,($64,A6) -- script 5\'s scroll field, $64 not $24');
  assert.deepEqual(at(BLOCK1, 6), [0x08, 0x2c, 0x00, 0x02, 0x00, 0x03],
    '$293BB8 btst #$2,($3,A4) comes STRAIGHT AFTER it -- there is no bra.w '
    + 'here, which is the whole reason script 5 runs what script 4 skips');

  // -- the three gates, their counters and where each MISSES to.
  const gate = (addr, bit, ctr, beqDisp, bccDisp, next) => {
    assert.deepEqual(at(addr, 6), [0x08, 0x2c, 0x00, bit, 0x00, 0x03],
      `${hx(addr)} btst #$${bit},($3,A4)`);
    assert.deepEqual(at(addr + 6, 4), [0x67, 0x00, 0x00, beqDisp],
      `${hx(addr + 6)} beq.w`);
    assert.equal(addr + 8 + beqDisp, next, `...misses to ${hx(next)}`);
    assert.deepEqual(at(addr + 10, 4), [0x53, 0x2c, 0x00, ctr],
      `${hx(addr + 10)} subq.b #1,(${bx(ctr)},A4)`);
    assert.deepEqual(at(addr + 14, 4), [0x64, 0x00, 0x00, bccDisp],
      `${hx(addr + 14)} bcc.w -- UNSIGNED, the borrow out of the countdown`);
    assert.equal(addr + 16 + bccDisp, next, `...and misses to ${hx(next)} too`);
    assert.deepEqual(at(addr + 18, 6), [0x19, 0x6c, 0x00, ctr + 1, 0x00, ctr],
      `${hx(addr + 18)} move.b (${bx(ctr + 1)},A4),(${bx(ctr)},A4) -- reload`);
  };
  gate(BLOCK1, 2, 0x08, 0x3c, 0x34, BLOCK2);
  gate(BLOCK2, 0, 0x04, 0x3e, 0x36, BLOCK3);
  gate(BLOCK3, 1, 0x06, 0x3e, 0x36, S5_STATE_MACHINE);
  assert.deepEqual(at(S5_STATE_MACHINE, 6), [0x0c, 0x2c, 0x00, 0x02, 0x00, 0x02],
    'block 3 misses to script 5\'s OWN state machine, which pins the far end '
    + 'of the three blocks by CODE rather than by eye');

  // -- THE KIND, BUCKET, SPEED AND NUDGE of each block, all four different in
  //    block 3.  `moveq` carries its byte immediate in the opcode's low half.
  const shape = (addr, kind, bucket, speed, nudgeAt, nudge) => {
    assert.deepEqual(at(addr + 24, 2), [0x70, kind],
      `${hx(addr + 24)} moveq #${bx(kind)},D0`);
    assert.deepEqual(at(addr + 26, 6), [0x4e, 0xb9, 0x00, 0x28, 0x90, 0x04],
      `${hx(addr + 26)} jsr $289004 -- the pool-B allocator`);
    assert.deepEqual(at(addr + 32, 6), [0x31, 0x7c, 0x00, bucket, 0x00, 0x1e],
      `${hx(addr + 32)} move.w #${bx(bucket)},($1E,A0)`);
    assert.deepEqual(at(addr + 38, 6), [0x11, 0x7c, 0x00, speed, 0x00, 0x1a],
      `${hx(addr + 38)} move.b #${bx(speed)},($1A,A0)`);
    assert.deepEqual(at(addr + 44, 6), [0x4e, 0xb9, 0x00, 0x24, 0x2b, 0x3c],
      `${hx(addr + 44)} jsr $242B3C -- ONE draw per firing block`);
    assert.equal(u32(nudgeAt), nudge,
      `${hx(nudgeAt)} move.l #${hx(nudge)},($26,A0)`);
  };
  shape(BLOCK1, 0x10, 4, 0x10, 0x293bf6, 0xfdfffc00);
  shape(BLOCK2, 0x10, 4, 0x10, 0x293c3c, 0xf2000200);
  shape(BLOCK3, 0x06, 8, 0x0c, 0x293c82, 0xf5fffc00);

  // -- THE ONE INSTRUCTION THAT IS NOT IN ALL THREE.  Reading the blocks as
  //    one repeated body would put the wrong angle on two thirds of the sparks.
  assert.deepEqual(at(BLOCK1 + 50, 4), [0x11, 0x40, 0x00, 0x1b],
    '$293BEA move.b D0,($1B,A0) sits IMMEDIATELY after block 1\'s jsr -- '
    + 'there is no room for a doubling and there is none');
  for (const [addr, name] of [[BLOCK2, 'block 2'], [BLOCK3, 'block 3']]) {
    assert.deepEqual(at(addr + 50, 2), [0xd0, 0x00],
      `${hx(addr + 50)} add.b D0,D0 -- ${name} DOUBLES the drawn byte`);
    assert.deepEqual(at(addr + 52, 4), [0x11, 0x40, 0x00, 0x1b],
      `${hx(addr + 52)} move.b D0,($1B,A0) -- ...and stores the doubled one`);
  }
  // ...so blocks 2 and 3 are two bytes longer than block 1, and the three
  // together land exactly on the state machine.  13 + 14 + 14 = 41
  // instructions, which is what `aligned.py sweep 0x293bae 0x293c90` decodes
  // (2 preamble + 41 + the 2 it reaches in the state machine = 45).
  assert.equal(BLOCK2 - BLOCK1, 0x44, 'block 1 is $44 bytes');
  assert.equal(BLOCK3 - BLOCK2, 0x46, 'block 2 is $46 -- two more');
  assert.equal(S5_STATE_MACHINE - BLOCK3, 0x46, 'block 3 is $46 as well');

  // -- ALL THREE BITS ARE SET, and by the table the port has walked since W107.
  const loopctl = [];
  for (let a = S5_STATE0_TABLE; u16(a) !== 0xffff; a += 12) loopctl.push(u16(a + 10));
  assert.equal(loopctl.length, 8, '$293D32 is EIGHT entries and then $FFFF');
  assert.deepEqual([...new Set(loopctl)].sort(), [0, 1, 2, 3],
    'and its loopctl column carries 1, 2 and 3 -- `bset (loopctl-1)` therefore '
    + 'sets bits 0, 1 AND 2 of $3(A4), arming all three blocks');

  // -- the counters the blocks decrement are seeded by script 5's INIT.
  assert.deepEqual(at(0x293b8e, 6), [0x39, 0x7c, 0x00, 0x08, 0x00, 0x04],
    '$293B8E move.w #$8,($4,A4) -- block 2\'s counter 0, reload $8');
  assert.deepEqual(at(0x293b94, 6), [0x39, 0x7c, 0x00, 0x05, 0x00, 0x06],
    '$293B94 move.w #$5,($6,A4) -- block 3\'s counter 0, reload $5');
  assert.deepEqual(at(0x293b9a, 6), [0x39, 0x7c, 0x00, 0x07, 0x00, 0x08],
    '$293B9A move.w #$7,($8,A4) -- block 1\'s counter 0, reload $7');

  // No window was added or widened for any of this: the three nudges are
  // IMMEDIATES INSIDE CODE and the only ROM table read is `$242B3C`'s, which
  // the port has drawn from since W23.
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const list = tables.rom.windows.map(
    (w) => [parseInt(String(w.base).replace('$', ''), 16), w.len]);
  assert.equal(list.length, ROM_WINDOW_COUNT,
    'the whole window set, counted once in tests/romwindowset.js -- this wave '
    + 'declares no window, so the count is W435\'s unchanged');
  assert.equal(overlappingPairs(list), ROM_OVERLAP_PAIRS, OVERLAP_NOTE);
});

// ===========================================================================
// A shared runner: seed from a rung, step on the board's own input words.
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
  // The ladder's own intervention, out of the manifest rather than reinvented.
  const pokes = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));

  W436_MUTATE.value = mutate;
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
      // THE BOARD's OWN `$803916`, written before the frame runs.  Used only by
      // the arm that isolates the draw-count deficit; every other arm runs on
      // the port's own counter.
      if (forceRng) game.ram.setU16(RNG_STATE, Number(trace.byLf.get(lf - 1).rng));
      game.step(Number(r.portin));     // THE BOARD'S OWN INPUT WORD, not a bench
      const p = game.ram.u16(RNG_STATE);
      const b = Number(r.rng);
      if (!forceRng && ((p - portPrev) & 0xff) !== ((b - boardPrev) & 0xff)) {
        drawGap.push([lf, (p - portPrev) & 0xff, (b - boardPrev) & 0xff]);
      }
      portPrev = p; boardPrev = b;
    }
  } finally {
    W436_MUTATE.value = null;          // a module switch, reset on EVERY run
  }

  const board = new Uint8Array(fs.readFileSync(path.join(CK, cmpRung.ram)));
  const port = game.ram.b;

  const stat = (buf) => {
    let live = 0, nonBlank = 0;
    for (let s = 0; s < POOL_B.slots; s++) {
      const o = slotOff(s);
      if (((buf[o] << 8) | buf[o + 1]) & 0x8000) live++;
      for (let k = 0; k < POOL_B.stride; k++) if (buf[o + k]) { nonBlank++; break; }
    }
    return {
      live,
      nonBlank,
      count: (buf[POOL_B.count - RAM_BASE] << 8) | buf[POOL_B.count - RAM_BASE + 1],
    };
  };
  const differ = [];
  const offsets = new Set();
  let identical = 0, kindSame = 0, descSame = 0, movedFromSeed = 0;
  for (let s = 0; s < POOL_B.slots; s++) {
    const o = slotOff(s);
    const bytes = [];
    let moved = false;
    for (let k = 0; k < POOL_B.stride; k++) {
      if (board[o + k] !== port[o + k]) {
        bytes.push(`${hx2(k)} board ${bx(board[o + k])} port ${bx(port[o + k])}`);
        offsets.add(k);
      }
      if (seed[o + k] !== port[o + k]) moved = true;
    }
    if (moved) movedFromSeed++;
    if (bytes.length === 0) identical++;
    else {
      differ.push(`slot ${s} @ ${hx(POOL_B.base + s * POOL_B.stride)}: `
        + bytes.join(', '));
    }
    if (((board[o] << 8) | board[o + 1]) === ((port[o] << 8) | port[o + 1])) kindSame++;
    let sameDesc = true;
    for (let k = 0x0a; k < 0x0e; k++) if (board[o + k] !== port[o + k]) sameDesc = false;
    if (sameDesc) descSame++;
  }
  return {
    differ, identical, kindSame, descSame, movedFromSeed, drawGap,
    offsets: [...offsets].sort((a, b) => a - b),
    boardStat: stat(board),
    portStat: stat(port),
  };
}

// ===========================================================================
// 2 + 3. THE DELIVERABLE AND ITS POSITIVE CONTROL
// ===========================================================================
test('W436: lf9500->9600 -- the port now allocates the board\'s 43 records into '
  + 'the board\'s own 43 slots (kind word 80/80, descriptor 80/80) and is 80/80 '
  + 'byte-identical under the board\'s own $803916',
{ skip: SKIP_LADDER }, async () => {
  const r = await runSegment(SEED_LF, CMP_LF);

  // THE POSITIVE CONTROL FIRST, because W435's rung had an EMPTY pool on both
  // sides and 80/80 there was satisfied by anything that wipes it.  This rung
  // is not that: the board holds 43 records, 33 of them LIVE.
  assert.equal(r.boardStat.nonBlank, BOARD_NONBLANK,
    `the board's pool B at lf${CMP_LF} must hold ${BOARD_NONBLANK} non-blank `
    + 'slots -- this rung is load-bearing, unlike W435\'s lf10400');
  assert.equal(r.boardStat.live, BOARD_LIVE, '...and 33 of them LIVE');
  assert.equal(r.boardStat.count, BOARD_COUNT, '...with $81C8EA = $22');
  assert.ok(r.movedFromSeed >= 35,
    `the port's pool B must have MOVED off the lf${SEED_LF} seed; only `
    + `${r.movedFromSeed} of ${POOL_B.slots} slots differ from it`);

  // THE SPAWN COUNT -- the brief's "three live and eight non-blank missing".
  assert.deepEqual(
    [r.portStat.live, r.portStat.nonBlank, r.portStat.count],
    [BOARD_LIVE, BOARD_NONBLANK, BOARD_COUNT],
    'the port must now produce the board\'s own live count, non-blank count '
    + 'and $81C8EA -- 33 / 43 / $22, where W435 measured 30 / 35 / $1F');

  // ...AND THE RECORDS ARE THE BOARD's, IN THE BOARD's SLOTS.  This is the
  // claim that says allocation order carried the other five, not merely that a
  // count matched: a port that spawned eight of ANYTHING would pass the counts
  // above and fail both of these.
  assert.equal(r.kindSame, POOL_B.slots,
    'every slot must carry the board\'s own status/kind word');
  assert.equal(r.descSame, POOL_B.slots,
    '...and the board\'s own descriptor longword at +$0A');

  // THE RESIDUAL IS GONE.  W436 left eight offsets differing and three frames
  // short; W437 closed the draw-count deficit behind them, so this arm now
  // asserts the ABSENCE of both -- and W437's own RED arm re-creates them,
  // which is what keeps this measurement load-bearing rather than satisfied.
  assert.deepEqual(r.offsets, [],
    'no byte of any pool-B slot may differ from the board -- W436 left '
    + `[${ANGLE_TAIL.map(hx2).join(' ')}], the angle and what follows from it. `
    + `Got ${r.differ.length} slots over [${r.offsets.map(hx2).join(' ')}]`);
  assert.deepEqual(r.drawGap, [],
    'and the port must draw from $803916 exactly as often as the board on ALL '
    + '100 frames, with NOTHING forced. W436 measured a deficit on three: '
    + `${JSON.stringify(RNG_DEFICIT)} -- lf9556 (the frame $294DD4 runs) by 24, `
    + 'lf9562 by 1 and lf9592 by 1. W437 attributed all three to $281E36 '
    + 'jsr $27F8F8, the mover GLOBAL-KILL free, and they are closed');
  assert.equal(r.identical, POOL_B.slots,
    '...so lf9500->9600 is 80/80 byte-identical UNCONDITIONALLY');

  // AND IT IS STILL 80/80 WITH THE BOARD'S OWN INDEX WRITTEN IN.  W436's
  // deliverable was this line alone; it is kept because a fix that closed the
  // deficit by drawing the WRONG number of times somewhere else could pass the
  // unforced arm above and would still fail here.
  const forced = await runSegment(SEED_LF, CMP_LF, { forceRng: true });
  assert.deepEqual(forced.differ, [],
    `every pool-B slot must be byte-identical to the board at lf${CMP_LF} once `
    + '$803916 is the board\'s');
  assert.equal(forced.identical, POOL_B.slots, '80 of 80, stated as a count too');
  assert.equal(forced.portStat.live, BOARD_LIVE, '...33 live on both sides');
});

test('W436: the four neighbouring segments are untouched -- and two of them '
  + 'carry NO live record at all, which the brief said all four did',
{ skip: SKIP_LADDER }, async () => {
  const seen = [];
  for (const [a, b] of [[9300, 9400], [9400, 9500], [9600, 9700], [9700, 9800]]) {
    const r = await runSegment(a, b);
    assert.deepEqual(r.differ, [],
      `lf${a}->${b} must stay byte-identical, all 80 slots`);
    assert.equal(r.identical, POOL_B.slots, `80 of 80 at lf${b}`);
    seen.push([b, r.boardStat.live, r.boardStat.nonBlank]);
  }
  assert.deepEqual(seen,
    [[9400, 0, 26], [9500, 0, 26], [9700, 9, 43], [9800, 26, 43]],
    'MEASURED: lf9400 and lf9500 hold ZERO live records on the board, so those '
    + 'two neighbours could never have distinguished a missing live record. '
    + 'The other two do, and they stay green');
});

// ===========================================================================
// 4. THE RED -- TWICE, AND THE SECOND ONE IS THE POINT
// ===========================================================================
test('W436: with the blocks switched off the segment goes back to 30 live / 35 '
  + 'non-blank / $1F and 60/80 -- AND forcing the board\'s $803916 does NOT '
  + 'rescue it', { skip: SKIP_LADDER }, async () => {
  const off = await runSegment(SEED_LF, CMP_LF, { mutate: 'no-sparks' });
  assert.deepEqual(
    [off.portStat.live, off.portStat.nonBlank, off.portStat.count],
    [30, 35, 0x1f],
    'without $293BB8..$293C87 the port is W435\'s 30 / 35 / $1F again');
  assert.equal(off.identical, 60, '...and W434\'s 60/80');
  assert.equal(off.kindSame, 67, '...with 13 slots carrying the wrong kind word');

  // THE ARM THAT MAKES THE GREEN ABOVE MEAN SOMETHING.  If the RNG forcing were
  // doing the work, this arm would be 80/80 too.
  const offForced = await runSegment(SEED_LF, CMP_LF,
    { mutate: 'no-sparks', forceRng: true });
  assert.equal(offForced.identical, 62,
    'with the board\'s own $803916 AND no spark blocks the segment is 62/80, '
    + 'not 80/80 -- the poke isolates a second defect, it does not stand in '
    + 'for this one');
  assert.equal(offForced.kindSame, 67,
    '...and the 13 wrong kind words are exactly as wrong');
});

// ===========================================================================
// 5. THE DIRTY POOL -- EIGHT RECORDS, EIGHT SLOTS, THREE SIGNATURES
// ===========================================================================
test('W436: driven over $5A dirt, the three blocks allocate EIGHT records into '
  + 'EIGHT DISTINCT slots on eight specific steps, in the ROM\'s block order, '
  + 'and leave every field the ROM does not write still reading $5A',
{ skip: SKIP_TABLES }, () => {
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(tables.rom);
  const ram = new Ram();
  const ctx = { unportedLog: new UnportedLog() };

  // DIRTY EVERY FIELD.  A fresh `Ram` reads 0 everywhere, so a port that wrote
  // nothing at all would agree with a zeroed pool over most of the record.
  // With $5A underneath, a field reading 0 has been through `$289004`, a field
  // reading a block constant has been through the block, and a field still
  // reading $5A was never touched -- three outcomes instead of two.
  for (let s = 0; s < POOL_B.slots; s++) {
    const a = POOL_B.base + s * POOL_B.stride;
    for (let k = 0; k < POOL_B.stride; k++) ram.setU8(a + k, 0x5a);
    ram.setU16(a + B.status, 0);       // ...but FREE, or nothing can allocate
  }
  const a4 = 0x812a74;                 // an A3 slot; only $3..$9 are read
  const a6 = 0x812000;                 // the boss sub-record; only ($62,A6)
  for (let k = 0; k < 0x20; k++) ram.setU8(a4 + k, 0x5a);
  ram.setU16(a4 + 0x04, 0x0008);       // $293B8E -- block 2, counter 0 reload $8
  ram.setU16(a4 + 0x06, 0x0005);       // $293B94 -- block 3, counter 0 reload $5
  ram.setU16(a4 + 0x08, 0x0007);       // $293B9A -- block 1, counter 0 reload $7
  ram.setU32(a6 + 0x62, 0x11112222);   // the part's own position
  ram.setU8(a4 + 0x03, 0x07);          // $293D32's loopctl: bits 0, 1 and 2

  const fired = [];
  for (let step = 1; step <= 17; step++) {
    const before = [];
    for (let s = 0; s < POOL_B.slots; s++) {
      before.push(ram.u16(POOL_B.base + s * POOL_B.stride));
    }
    sparkBlocks293BB8(ram, rom, ctx, a4, a6);
    for (let s = 0; s < POOL_B.slots; s++) {
      const a = POOL_B.base + s * POOL_B.stride;
      if ((before[s] & 0x8000) || !(ram.u16(a) & 0x8000)) continue;
      fired.push([step, s, ram.u16(a) & 0x7fff, ram.u16(a + B.bucket),
        ram.u8(a + B.speed), ram.u32(a + B.nudge) >>> 0, ram.u8(a + B.angle)]);
    }
  }

  // [M] EIGHT firings, EIGHT distinct slots.  The periods are reload+1 because
  // `subq.b #1` on a zero BORROWS, which is also why all three fire together on
  // step 1.  A constant written eight times cannot produce three different
  // (kind, bucket, speed, nudge, angle) signatures in this order on these steps.
  //
  // THE LAST COLUMN IS +$1B, AND IT IS WHERE READING THE THREE BLOCKS AS ONE
  // SHAPE LANDS.  `$242B3C` indexes its table with `$803916` ITSELF and every
  // draw advances it, so these are eight table entries and not a constant --
  // and blocks 2 and 3 store the DOUBLED byte (`d0 00`) while block 1 stores
  // the raw one.
  assert.deepEqual(fired, [
    [1, 0, 0x10, 4, 0x10, 0xfdfffc00, 0x04],  // $293BB8, bit 2, ctr $8, reload 7
    [1, 1, 0x10, 4, 0x10, 0xf2000200, 0x00],  // $293BFC, bit 0, ctr $4, reload 8
    [1, 2, 0x06, 8, 0x0c, 0xf5fffc00, 0x06],  // $293C42, bit 1, ctr $6, reload 5
    [7, 3, 0x06, 8, 0x0c, 0xf5fffc00, 0x0a],
    [9, 4, 0x10, 4, 0x10, 0xfdfffc00, 0xfd],
    [10, 5, 0x10, 4, 0x10, 0xf2000200, 0x00],
    [13, 6, 0x06, 8, 0x0c, 0xf5fffc00, 0xf2],
    [17, 7, 0x10, 4, 0x10, 0xfdfffc00, 0x06],
  ], 'eight firings, eight distinct slots, in the ROM\'s block order');
  assert.equal(new Set(fired.map((f) => f[1])).size, 8,
    'and the eight slots are DISTINCT -- stated as its own claim');
  assert.ok(new Set(fired.map((f) => f[6])).size >= 5,
    '...over at least five DISTINCT angle bytes, so a constant written eight '
    + 'times fails here as well as on the signatures');

  // THE POSITION IS THE PART's, NOT A CONSTANT SOMEBODY CHOSE.
  for (const [, s] of fired) {
    assert.equal(ram.u32(POOL_B.base + s * POOL_B.stride + B.pos) >>> 0, 0x11112222,
      `slot ${s} must carry ($62,A6), the part's own position`);
  }

  // AND THE DIRT IS STILL THERE WHERE THE ROM WRITES NOTHING.  `$289004` and
  // the block between them touch 20 of the $38 bytes; these 22 are not among
  // them, and a blanket write would have flattened every one.
  const UNTOUCHED = [0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    0x14, 0x15, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33];
  for (const [, s] of fired) {
    const a = POOL_B.base + s * POOL_B.stride;
    assert.deepEqual(UNTOUCHED.map((k) => ram.u8(a + k)),
      UNTOUCHED.map(() => 0x5a),
      `slot ${s}: every field neither $289004 nor the block writes must still `
      + 'read $5A');
  }
  // ...and the 72 slots nobody allocated are untouched in FULL.
  for (let s = 8; s < POOL_B.slots; s++) {
    const a = POOL_B.base + s * POOL_B.stride;
    assert.equal(ram.u16(a + B.status), 0, `slot ${s} was never allocated`);
    assert.equal(ram.u8(a + B.bucket + 1), 0x5a,
      `...and slot ${s}'s +$1F still reads $5A`);
  }
});
