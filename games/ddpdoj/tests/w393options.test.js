// ===============================================================================================
// W393 -- OPTION FORMATIONS 4 AND 6, AND THE FRAME THE DEMOS STARTED PLAYING.
// ===============================================================================================
//
// UNIT. `$24C4F8` and `$24C690`, the two arms of `$24C384`'s formation dispatch that wave 4 did
// not port -- plus everything behind them: `$24C7F8` (the orbiting pod), `$24D5DA`/`$24D6D2`
// (formation 4's shot spawn and its writer) and `$24D75C` (formation 6's).
//
// **WHERE THE BRIEF IS WRONG, asserted here from the bytes rather than argued:**
//
//   1. "Port them, then turn arm 5's `$26070C` note into the real call and PROVE THE DEMO
//      PLAYS." The demos play -- SECTION 5 drives a cold boot past +5,996 and all three of them
//      run their formations. But **THE DEMOS NEVER FIRE**, so "the demo plays" does not reach
//      the three pod-shot spawns at all. The replay stream `$812E98` is advanced only by the
//      codec `$25C60C`, whose single caller `$23D116` lives inside `$23D0F8`, which this port
//      does not run. MEASURED over 12,000 frames: the fire edge `($41,A6)` and the burst
//      counter `($35,A4)` are 0 on EVERY frame of all three demos, and not one record ever
//      appears in the shot table `$810572`. SECTION 5. The spawns are driven in SECTION 4
//      instead, and the difference is stated rather than papered over.
//   2. "`$24C4F8`'s and `$24C690`'s verified extents" -- as if they were two routines. They are
//      FIVE: `$24C4F8` is two arms behind one `btst` ($24C500 and $24C5AC) that converge on a
//      THIRD copy of the fire handshake at `$24C60E`, and `$24C690` is a fourth body with a
//      fifth handshake at `$24C776`. SECTION 1 measures all of them.
//   3. "demos 0 and 2 use other ships and may need other formations". They do, and W393 ports
//      them: demo 0 is ship 2, demo 1 ship 4 and demo 2 ship 6, so the three demos are exactly
//      the three arms. But demo 2 still dies -- on `$262B4C`, a THIRTY-BYTE background-element
//      constructor, 532 frames in and nothing to do with options. SECTION 5.
//   4. "formation 4" as one behaviour. Over 754 demo frames the state word is only ever $8000,
//      $8001 or $8003, so bit 2 is ALWAYS clear and only the ROTATING arm runs. `$24C500`'s arm
//      is transcribed and unexercised, exactly like `copyTemplate` was before W231.
//
// SECTION 1  the ROM: the dispatch, the ONE byte between the three handshakes, the two extents
// SECTION 2  formation 4's rotating arm, driven: the detent, the `dbra`, the fold, the ellipse
// SECTION 3  formation 4's static arm and formation 6
// SECTION 4  the three shot spawns, driven -- the paths a cold boot cannot reach
// SECTION 5  **THE DELIVERABLE: a real cold boot, three demos, past +5,996**
// SECTION 6  the ROM window, its ablation and the overlap count
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import { UnportedLog } from '../src/unported.js';
import { ProtLatch } from '../src/protsim.js';
import { MoveTables } from '../src/vectors.js';
import { RomWindows } from '../src/rom.js';
import { NAMED_BUCKETS, snapshotBucket } from '../src/spritequeue.js';
import { Game } from '../src/main.js';
import { SCREEN8 } from '../src/objslot8.js';
import {
  runOptionObject, fireHandshake, OPTION_BLOCKS, OPT_FORMATIONS, POD_SPAWNS,
  OPT_ROTATE, OPT_ROTATE_ENTRIES, OPT_ROT_ANGLE, POD_SPAWN_PTRS, POD_HYPER_COUNTS,
  F6_DEAD_D0,
} from '../src/options.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false : 'no rip';
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);
const s16 = (v) => (v << 16) >> 16;

const TABLES = here('../rip/port/player.tables.json');
const haveTables = existsSync(TABLES);
const SKIP_T = haveTables ? SKIP : 'generated ROM tables absent; skip, not pass';
const tables = haveTables ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;

const B = OPTION_BLOCKS[0];
const OPT1 = RAM.p1Options;
const PL1 = RAM.player1;

/** `$24BFC8`'s two pointer fields, as `copyTemplate` lands them: `($46,A6)` from template+$3C
 *  and `($58,A6)` from template+$4E. Read out of the CARTRIDGE, not typed in. */
const F4_ANIM = 0x24bc3a;      // = l($24BFC8 + $3C)
const F4_SHADOW = 0x24bd7e;    // = l($24BFC8 + $4E)

function bench() {
  const ram = new Ram(null);
  const rom = haveTables ? new RomWindows(tables.rom) : null;
  return {
    ram,
    ctx: {
      rom,
      prot: new ProtLatch(),
      tables: haveTables ? new MoveTables(tables, rom) : null,
      unportedLog: new UnportedLog(),
    },
  };
}

/** The P1 block, live and deployed, with formation 4's own template fields in it. `$8003` is the
 *  state MEASURED on every one of the 754 demo frames formation 4 runs (SECTION 5): live, bit 0
 *  initialised, bit 1 deployed -- and bit 2 CLEAR, which is the rotating arm. */
function seedF4(ram, { state = 0x8003, form = 4, angle0 = 0x0f } = {}) {
  ram.setU16(OPT1 + OPT.state, state);
  // ($1b,A6) -- `$24C346 tst.b ($1b,A6) / beq $24C368` is THE BEAM, not the formations, so a
  // bench that leaves it 0 never reaches `$24C34C` at all. $9 is formation 4's own template
  // byte, at $24BFC8 + $17 (`copyTemplate` lands template+$15 on record +$1B).
  ram.setU8(OPT1 + OPT.angle, 0x09);
  ram.setU8(OPT1 + OPT.pod + OPT.angle, 0x09);
  ram.setU8(OPT1 + OPT_ROT_ANGLE, angle0);
  ram.setU8(OPT1 + OPT.pod + OPT_ROT_ANGLE, (angle0 + 0x20) & 0x3f);
  ram.setU32(OPT1 + OPT.animTable, F4_ANIM);
  ram.setU32(OPT1 + OPT.shadowTable, F4_SHADOW);
  ram.setU16(PL1 + P.optFormation, form);
  ram.setU16(PL1 + P.posY, 0x1179);                 // ($2,A4), the SHIP
  ram.setU16(PL1 + P.posX, 0x14c0);                 // ($4,A4)
}

function caught(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

// ===============================================================================================
// SECTION 1 -- THE ROM. Every extent below is stated by an instruction (trap 8).
// ===============================================================================================

test('W393 SECTION 1: $24C384 is THREE `bra.w`s and trap 4 applies to every one of them',
  { skip: SKIP }, () => {
    // `$24C34C move.w ($5a,A4),D0 / subi.w #$2,D0 / add.w D0,D0 / lea ($24C384,PC),A0 / jsr (A0)`
    assert.equal(w(0x24c34c), 0x302c, '$24C34C move.w (d16,A4),D0');
    assert.equal(w(0x24c34e), 0x005a, '  ...($5a,A4), the ship the player picked');
    assert.equal(w(0x24c350), 0x0440, '$24C350 subi.w #imm,D0');
    assert.equal(w(0x24c352), 2, '  ...#$2');
    assert.equal(w(0x24c354), 0xd040, '$24C354 add.w D0,D0 -- a FOUR-byte stride, so only EVEN');
    assert.equal(w(0x24c356), 0x41fa, '$24C356 lea (d16,PC),A0');
    assert.equal(0x24c358 + s16(w(0x24c358)), 0x24c384, '  ...resolving to $24C384 (trap 4)');
    for (const [form, arm] of Object.entries(OPT_FORMATIONS)) {
      const at = 0x24c384 + (Number(form) - 2) * 2;
      assert.equal(w(at), 0x6000, `$${at.toString(16)} is bra.w`);
      assert.equal(at + 2 + s16(w(at + 2)), arm,
        `  ...and formation ${form} lands on $${arm.toString(16).toUpperCase()}`);
    }
    // The table is three entries and nothing bounds the index, so 8 would run a displacement.
    assert.equal(w(0x24c390), 0x532e, '$24C390 subq.b #1,(d16,A6) -- formation 2 starts here');
  });

test('W393 SECTION 1: the THREE fire handshakes differ in ONE BYTE, and it is the spawn',
  { skip: SKIP }, () => {
    // $24C476 (formation 2), $24C60E (4), $24C776 (6). $82 bytes each: $7C of body, a 4-byte
    // `bra.w`, and the `rts` AT the last address (trap 5).
    const base = IMG.subarray(0x24c476, 0x24c476 + 0x7c);
    for (const [arm, spawn] of [[0x24c476, POD_SPAWNS[2]], [0x24c60e, POD_SPAWNS[4]],
      [0x24c776, POD_SPAWNS[6]]]) {
      assert.deepEqual(IMG.subarray(arm, arm + 0x7c), base,
        `$${arm.toString(16).toUpperCase()}'s first $7C bytes are $24C476's`);
      assert.equal(w(arm + 0x7c), 0x6000, '  ...then a bra.w');
      assert.equal(arm + 0x7e + s16(w(arm + 0x7e)), spawn,
        `  ...onto $${spawn.toString(16).toUpperCase()}`);
      assert.equal(w(arm + 0x80), 0x4e75, '  ...and the rts AT the last address');
    }
    // ONE byte. Not "nearly the same": the count is asserted, because "nearly" is how trap 19
    // gets shipped.
    const diff = [];
    for (let i = 0; i < 0x82; i++) if (IMG[0x24c476 + i] !== IMG[0x24c60e + i]) diff.push(i);
    assert.deepEqual(diff, [0x7f], '$24C476 vs $24C60E: one byte, the bra.w displacement');
    const diff6 = [];
    for (let i = 0; i < 0x82; i++) if (IMG[0x24c476 + i] !== IMG[0x24c776 + i]) diff6.push(i);
    assert.deepEqual(diff6, [0x7f], '$24C476 vs $24C776: the same one byte');
    assert.deepEqual([IMG[0x24c4f5], IMG[0x24c68d], IMG[0x24c7f5]], [0x8c, 0x4e, 0x68],
      'and the three values of it');
  });

test('W393 SECTION 1: formation 4 arm A and formation 6 are formation 2, byte for byte',
  { skip: SKIP }, () => {
    // ARM A: $24C500..$24C5A9 against $24C3CC..$24C475 -- $AA bytes.
    const d4 = [];
    for (let i = 0; i < 0xaa; i++) if (IMG[0x24c3cc + i] !== IMG[0x24c500 + i]) d4.push(i);
    assert.deepEqual(d4, [2, 3, 0xa, 0xb],
      'four bytes, and all four are `bsr` displacement halves');
    for (const at of [0x24c3cc, 0x24c3d4, 0x24c500, 0x24c508]) {
      assert.equal(w(at), 0x6100, `$${at.toString(16)} is bsr.w`);
      assert.equal(at + 2 + s16(w(at + 2)), 0x24d12e, '  ...and they all reach $24D12E');
    }
    // FORMATION 6: $24C690..$24C775 against $24C390..$24C475 -- $E6 bytes, the WHOLE body
    // including the ten-instruction animation step formation 4 skips.
    const d6 = [];
    for (let i = 0; i < 0xe6; i++) if (IMG[0x24c390 + i] !== IMG[0x24c690 + i]) d6.push(i);
    assert.deepEqual(d6, [0x3e, 0x46], 'two `bsr` displacement BYTES and nothing else');
    for (const at of [0x24c6cc, 0x24c6d4]) {
      assert.equal(at + 2 + s16(w(at + 2)), 0x24d12e, 'formation 6 calls $24D12E too');
    }
    // ...so the ONLY thing formation 6 does differently is inside $24D12E, on ($5a,A4).
    assert.equal(w(0x24d158), 0x0c6c, '$24D158 cmpi.w #imm,(d16,A4)');
    assert.equal(w(0x24d15a), 6, '  ...#$6');
    assert.equal(w(0x24d15c), 0x005a, '  ...($5a,A4)');
    assert.equal(w(0x24d166), 0x3003, '$24D166 move.w D3,D0');
    assert.equal(w(0x24d168), 0xe240, '  ...asr.w #1,D0 -- a HALF');
    assert.equal(w(0x24d162), 0xe440, '$24D162 asr.w #2,D0 -- where everything else gets a quarter');
  });

test('W393 SECTION 1: $24BEC6\'s extent is stated by the FOLD, and it needs no window of its own',
  { skip: SKIP }, () => {
    assert.equal(w(0x24c82e), 0x47fa, '$24C82E lea (d16,PC),A3');
    assert.equal(0x24c830 + s16(w(0x24c830)), OPT_ROTATE,
      '  ...= $24C830 + $F696 = $24BEC6. Trap 4: the EXTENSION WORD\'s address, not the lea\'s');
    // THE BOUND. `cmpi.b #$20,D5 / bls` caps the index at $20; `add.w D5,D5` twice makes the
    // stride four; `movem.w ...,D0/D5` makes each entry a WORD PAIR.
    assert.equal(w(0x24c80c), 0x0c05, '$24C80C cmpi.b #imm,D5');
    assert.equal(w(0x24c80e), 0x0020, '  ...#$20 -- the domain is 0..$20 inclusive');
    assert.equal(w(0x24c810), 0x630e, '$24C810 bls $24C820');
    assert.equal(w(0x24c820), 0xda45, '$24C820 add.w D5,D5');
    assert.equal(w(0x24c822), 0xda45, '$24C822 add.w D5,D5 -- so *4');
    assert.equal(w(0x24c832), 0x4cb3, '$24C832 movem.w (d8,A3,Xn),<list>');
    assert.equal(w(0x24c834), 0x0021, '  ...D0/D5, TWO words, and movem.w SIGN-EXTENDS');
    assert.equal(OPT_ROTATE_ENTRIES, 0x21, '$21 entries');
    assert.equal(OPT_ROTATE + OPT_ROTATE_ENTRIES * 4, 0x24bf4a, '$84 bytes, ending at $24BF4A');
    // COVERED BY W12'S WINDOW, with room to spare -- no new window, and no widening.
    const w12 = tables && tables.rom.windows.find((x) => x.base === '$24BBA0');
    if (w12) {
      assert.equal(w12.len, 0x4e0, 'W12 declared $24BBA0 + $4E0');
      assert.ok(OPT_ROTATE >= 0x24bba0 && 0x24bf4a <= 0x24bba0 + 0x4e0,
        '$24BEC6..$24BF4A is inside it');
    }
    // ...and the data is a HALF-ELLIPSE, which is what says the reading is right: index 0 and
    // index $20 both have dX = 0 and dY $600 apart, and dX peaks in the middle.
    assert.equal(s16(w(OPT_ROTATE + 2)), 0, 'entry [0] dX = 0');
    assert.equal(s16(w(OPT_ROTATE + 0x20 * 4 + 2)), 0, 'entry [$20] dX = 0');
    assert.equal(s16(w(OPT_ROTATE)) - s16(w(OPT_ROTATE + 0x20 * 4)), 0x600,
      'and their dY differ by $600 -- the two ends of the orbit');
    const dxs = [];
    for (let i = 0; i <= 0x20; i++) dxs.push(s16(w(OPT_ROTATE + i * 4 + 2)));
    assert.equal(Math.max(...dxs), 1856, 'the widest point is 1856');
    assert.equal(dxs.indexOf(1856), 0x0f, '  ...at index $F, near the half-way point');
    assert.ok(dxs.every((v) => v >= 0), 'every dX is positive: the fold supplies the other half');
  });

test('W393 SECTION 1: the four spawn blocks are a $60-stride family and $24D47C is its far end',
  { skip: SKIP }, () => {
    for (const [at, want] of [[0x24d4e2, 0x24d2fc], [0x24d4e6, 0x24d35c],
      [0x24d654, POD_SPAWN_PTRS[4]], [0x24d7bc, POD_SPAWN_PTRS[6]]]) {
      assert.ok([0x43fa, 0x45fa].includes(w(at)), `$${at.toString(16)} lea (d16,PC),A1/A2`);
      assert.equal(at + 2 + s16(w(at + 2)), want,
        `  ...resolving to $${want.toString(16).toUpperCase()}`);
    }
    const blocks = [0x24d2fc, 0x24d35c, POD_SPAWN_PTRS[4], POD_SPAWN_PTRS[6]];
    for (let i = 1; i < blocks.length; i++) {
      assert.equal(blocks[i] - blocks[i - 1], 0x60, 'a $60 stride, every step');
    }
    // THE FAR BOUND IS NAMED BY AN INSTRUCTION. Three of them, in fact.
    for (const at of [0x24d4c8, 0x24d638, 0x24d7a0]) {
      assert.equal(w(at), 0x43fa, `$${at.toString(16)} lea (d16,PC),A1`);
      assert.equal(at + 2 + s16(w(at + 2)), POD_HYPER_COUNTS, '  ...= $24D47C');
    }
    assert.equal(blocks[3] + 0x60, POD_HYPER_COUNTS,
      '$24D41C + $60 = $24D47C -- the stride and the `lea` agree');
    // Each block is four longs and four five-long per-power tables, all inside its own $60.
    for (const blk of blocks) {
      for (let i = 0; i < 4; i++) {
        const p = l(blk + i * 4);
        assert.ok(p >= blk + 0x10 && p <= blk + 0x60 - 0x14,
          `$${blk.toString(16)}[${i}] -> $${p.toString(16)} is inside its own block`);
      }
    }
    // And the per-power index really is power*2 over powers 0,2,4,6,8 -- 5 longs, $14 bytes.
    assert.equal(w(0x24d65c), 0x302c, '$24D65C move.w (d16,A4),D0');
    assert.equal(w(0x24d65e), 0x0020, '  ...($20,A4), the power word');
    assert.equal(w(0x24d660), 0xd040, '$24D660 add.w D0,D0');
    assert.equal(w(0x24d662), 0x2271, '$24D662 movea.l (d8,A1,Xn),A1');
  });

test('W393 SECTION 1: the two spawn writers, and the template strides they explain',
  { skip: SKIP }, () => {
    // $24D530 and $24D812 are the SAME $42 bytes, which is why one function serves both.
    assert.deepEqual(IMG.subarray(0x24d812, 0x24d812 + 0x42), IMG.subarray(0x24d530, 0x24d530 + 0x42),
      'formation 6 inlines $24D530 verbatim');
    // ...and it inlines it TWICE, byte for byte.
    assert.deepEqual(IMG.subarray(0x24d85e, 0x24d85e + 0x48), IMG.subarray(0x24d810, 0x24d810 + 0x48),
      '$24D810 and $24D85E are the same $48 bytes');
    // $24D6D2 is NOT that writer: it takes a POINTER out of the stream where the others take
    // two offset words, which is why formation 4's templates are $22 apart and 2's and 6's $4C.
    assert.equal(w(0x24d6d8), 0x2459, '$24D6D8 movea.l (A1)+,A2 -- a POINTER, not an offset');
    assert.equal(w(0x24d532), 0x322e, '$24D532 move.w (d16,A6),D1 -- and $24D530 takes offsets');
    const f2t = l(l(0x24d2fc));       // block[0] -> per-power[0] -> template
    const f4t = l(l(POD_SPAWN_PTRS[4]));
    const f6t = l(l(POD_SPAWN_PTRS[6]));
    assert.equal(l(l(0x24d2fc) + 4) - f2t, 0x4c, 'formation 2 templates are $4C apart');
    assert.equal(l(l(POD_SPAWN_PTRS[4]) + 4) - f4t, 0x22, '  ...4\'s are $22');
    assert.equal(l(l(POD_SPAWN_PTRS[6]) + 4) - f6t, 0x4c, '  ...and 6\'s are $4C again');
    assert.equal(0x22, 2 + 4 + 4 + 4 + 16 + 2 + 2,
      '$22 is what $24D6D2 reads: a POINTER where $24D530 takes two offset words');
    assert.equal(0x4c, 2 * (2 + 2 + 2 + 4 + 4 + 16 + 4 + 2 + 2),
      '$4C is TWO of what $24D530 reads -- one per pod, because A1 walks');
    // The dead store, transcribed: $24D77C and $24D786 both load $150 and D0 is overwritten
    // unread at $24D78C. $24D5FA/$24D604's $450 is the same shape doing real work.
    assert.equal(w(0x24d77c), 0x303c, '$24D77C move.w #imm,D0');
    assert.equal(w(0x24d77e), F6_DEAD_D0, '  ...#$150');
    assert.equal(w(0x24d786), 0x303c, '$24D786 move.w #imm,D0 -- the other arm');
    assert.equal(w(0x24d788), F6_DEAD_D0, '  ...#$150 as well');
    assert.equal(w(0x24d78c), 0x302c, '$24D78C move.w (d16,A4),D0 -- and D0 dies here, unread');
    assert.equal(w(0x24d5fa), 0x303c, '$24D5FA move.w #imm,D0');
    assert.equal(w(0x24d5fc), 0x0450, '  ...#$450, and $24D60A `adda.w D0,A3` DOES read it');
    assert.equal(w(0x24d60a), 0xd6c0, '$24D60A adda.w D0,A3');
    assert.equal(0x450 / 0x30, 23, '$450 is slot 23 -- $30 * 23, and NOT a round 24');
    assert.equal(0x150 / 0x30, 7, '  ...and $150 is slot 7, which is what $24D480 uses');
  });

// ===============================================================================================
// SECTION 2 -- FORMATION 4'S ROTATING ARM, DRIVEN.
// ===============================================================================================

test('W393 SECTION 2: the angle steps ONE unit and STOPS DEAD on the $10 and $30 detents',
  { skip: SKIP_T }, () => {
    // D3 = 0 (bit 3 clear): the `dbra` runs ONCE (trap 2), so one step and no more.
    for (const [from, to] of [[0x00, 0x01], [0x0f, 0x10], [0x11, 0x12], [0x3f, 0x00]]) {
      const { ram, ctx } = bench();
      seedF4(ram, { angle0: from });
      runOptionObject(ram, ctx);
      assert.equal(ram.u8(OPT1 + OPT_ROT_ANGLE), to,
        `$${from.toString(16)} -> $${to.toString(16)}, one step, and $24C5BC masks to $3F`);
      assert.equal(ram.u8(OPT1 + OPT.pod + OPT_ROT_ANGLE), (to + 0x20) & 0x3f,
        '  ...and pod 1 is exactly half a turn behind ($24C5D6 addi.b #$20)');
    }
  });

test('W393 SECTION 2: bit 3 makes it FOUR steps, and the detent cuts the walk short',
  { skip: SKIP_T }, () => {
    // $24C5AE btst #$3,(A6) / $24C5B4 moveq #$3,D3. `dbra` runs N+1 = FOUR times.
    const four = (from) => {
      const { ram, ctx } = bench();
      seedF4(ram, { state: 0x8803, angle0: from });   // bit 3 of the HIGH byte
      runOptionObject(ram, ctx);
      return ram.u8(OPT1 + OPT_ROT_ANGLE);
    };
    assert.equal(four(0x11), 0x15, '$11 + 4 = $15 -- four steps, not three (trap 2)');
    assert.equal(four(0x0c), 0x10, '$C stops AT $10 after four');
    assert.equal(four(0x0d), 0x10, '$D stops at $10 after THREE -- $24C5C4 beq exits the loop');
    assert.equal(four(0x0e), 0x10, '$E after two');
    assert.equal(four(0x2e), 0x30, '...and the same at the OTHER detent, $24C5C6');
    assert.equal(four(0x10), 0x14, 'starting ON a detent walks away from it: $24C5BA increments '
      + 'BEFORE the compare, so nothing can get stuck');
  });

test('W393 SECTION 2: the pods land on the ellipse $24BEC6 describes, mirrored by the FOLD',
  { skip: SKIP_T }, () => {
    const { ram, ctx } = bench();
    seedF4(ram, { angle0: 0x0f });         // one step -> $10, and pod 1 -> $30
    runOptionObject(ram, ctx);
    assert.equal(ram.u8(OPT1 + OPT_ROT_ANGLE), 0x10);
    // Index $10 is under $20, so no fold. $24BF06 = (dY $600, dX $740).
    const dy = s16(w(OPT_ROTATE + 0x10 * 4));
    const dx = s16(w(OPT_ROTATE + 0x10 * 4 + 2));
    assert.deepEqual([dy, dx], [0x600, 0x740], 'entry [$10] out of the cartridge');
    assert.equal(ram.u16(OPT1 + OPT.posY), 0x1179 + dy, '$24C84C add.w D0,($2,A6)');
    assert.equal(ram.u16(OPT1 + OPT.posX), 0x14c0 + dx, '$24C850 add.w D5,($4,A6)');
    // Pod 1's angle is $30, which folds: neg.b $30 = $D0, & $3F = $10 -- the SAME entry -- and
    // D2 = 1 negates the X half. So the two pods are exactly mirrored about the ship.
    assert.equal(ram.u16(OPT1 + OPT.pod + OPT.posY), 0x1179 + dy, 'same dY');
    assert.equal(ram.u16(OPT1 + OPT.pod + OPT.posX), (0x14c0 - dx) & 0xffff, 'and the MIRRORED dX');
    // ...and the fold is visible in the flip word: bit 6 of the BYTE at ($1c,A6) is bit 14 of
    // the word, which is the $4000 `podShadow` reads as the X flip.
    assert.equal(ram.u16(OPT1 + OPT.flipColour) & 0x4000, 0, 'pod 0 unflipped ($24C806 bclr)');
    assert.equal(ram.u16(OPT1 + OPT.pod + OPT.flipColour) & 0x4000, 0x4000,
      'pod 1 flipped ($24C812 bset #$6 on the HIGH byte)');
  });

test('W393 SECTION 2: the pod is placed ABSOLUTELY, not integrated -- $24C7F8 is not $24D12E',
  { skip: SKIP_T }, () => {
    // TWENTY CONSECUTIVE FRAMES with the ship held still. If the pod integrated a velocity the
    // way `$24D12E` does, it would walk away; it does not, because every frame puts it back on
    // the ship and adds ONE table entry. The expected value is computed from `$24BEC6` and the
    // fold, not read back out of the port.
    const { ram, ctx } = bench();
    seedF4(ram, { angle0: 0x00 });
    for (let f = 0; f < 20; f++) {
      runOptionObject(ram, ctx);
      for (const [pod, off] of [[OPT1, 0], [OPT1, OPT.pod]]) {
        const ang = ram.u8(pod + off + OPT_ROT_ANGLE);
        const folded = ang > 0x20 ? -ang & 0xff & 0x3f : ang;
        const dy = s16(w(OPT_ROTATE + folded * 4));
        const dx = s16(w(OPT_ROTATE + folded * 4 + 2)) * (ang > 0x20 ? -1 : 1);
        assert.equal(ram.u16(pod + off + OPT.posY), (0x1179 + dy) & 0xffff,
          `frame ${f} pod ${off ? 1 : 0} Y is the ship's plus $24BEC6[${folded}], with no drift`);
        assert.equal(ram.u16(pod + off + OPT.posX), (0x14c0 + dx) & 0xffff,
          `frame ${f} pod ${off ? 1 : 0} X likewise`);
      }
    }
    // AND `$24C7F8`'s OWN `move.l ($2,A4),($2,A6)` IS REDUNDANT. `$24C33A` has already put both
    // pods on the ship, three instructions before the formation dispatch, with the same
    // longword out of the same place -- so ablating $24C7F8's copy changes nothing measurable.
    // Recorded rather than smoothed away (trap 22): it is why this test drives twenty frames
    // instead of trying to catch a stale position that no path can produce.
    assert.equal(w(0x24c7f8), 0x2d6c, '$24C7F8 move.l (d16,A4),(d16,A6)');
    assert.equal(w(0x24c33a), 0x202c, '$24C33A move.l (d16,A4),D0 -- the same longword');
    assert.equal(w(0x24c33e), 0x2d40, '$24C33E move.l D0,(d16,A6)');
    assert.equal(w(0x24c342), 0x2d40, '$24C342 move.l D0,(d16,A6) -- and pod 1\'s');
    // The 5/4 X stretch, `$24C838 btst #$0,($1,A4)`, is the hyper bit and it is OFF above.
    const hy = bench();
    seedF4(hy.ram, { angle0: 0x0f });
    hy.ram.setU8(PL1 + P.flags1, 0x01);              // ($1,A4) bit 0
    runOptionObject(hy.ram, hy.ctx);
    const dx = s16(w(OPT_ROTATE + 0x10 * 4 + 2));
    assert.equal(hy.ram.u16(OPT1 + OPT.posX), 0x14c0 + dx + (dx >> 2),
      '$24C840..$24C844 stretch D5 by a quarter, the same 5/4 $24D152 applies');
  });

test('W393 SECTION 2: one bucket-15 record and one shadow per pod, and the shadow long is D6',
  { skip: SKIP_T }, () => {
    const { ram, ctx } = bench();
    seedF4(ram, { angle0: 0x0f });
    runOptionObject(ram, ctx);
    // `$24C82A move.l (A3,D5.w),D6` then `$24C5F2 move.l D6,($5c,A6)`: the record's shadow
    // field is written by the CALLER, out of the value the callee returned.
    assert.equal(ram.u32(OPT1 + OPT.shadow0), IMG.readUInt32BE(F4_SHADOW + 0x10 * 4),
      '($5c,A6) is $24BD7E[$10]');
    assert.equal(ram.u32(OPT1 + OPT.shadow1), IMG.readUInt32BE(F4_SHADOW + 0x10 * 4),
      '($60,A6) is the same entry -- pod 1\'s angle FOLDS onto pod 0\'s index');
    // ...and the sprite long is the animation table at the same index.
    assert.equal(ram.u32(OPT1 + OPT.anim), IMG.readUInt32BE(F4_ANIM + 0x10 * 4),
      '($a,A6) is $24BC3A[$10]');
    assert.equal(ram.u32(OPT1 + OPT.pod + OPT.anim), IMG.readUInt32BE(F4_ANIM + 0x10 * 4),
      '  ...and $24C5E2\'s A2 is NOT reloaded for pod 1, so it indexes pod 0\'s table');
  });

test('W393 SECTION 2: each of the four gates suppresses the shadow and NOT the enqueue',
  { skip: SKIP_T }, () => {
    // $24C854's $812970 goes to the `rts` -- no shadow AND no bucket-15 record. The other four
    // ($24C85C..$24C87C) go to $24C8B4, which is the enqueue. That asymmetry is the routine.
    const run = (addr, val) => {
      const { ram, ctx } = bench();
      seedF4(ram, { angle0: 0x0f });
      if (addr) ram.setU16(addr, val);
      runOptionObject(ram, ctx);
      return snapshotBucket(ram, NAMED_BUCKETS.options).count
        + snapshotBucket(ram, NAMED_BUCKETS.shadows).count;
    };
    const open = run(null, 0);
    assert.ok(open > 0, 'POSITIVE CONTROL: with every gate open the pods reach a bucket');
    assert.equal(run(0x812970, 1), 0, '$24C854 tst.w $812970 -> the rts: nothing at all');
    for (const [a, v] of [[0x80390c, 1], [0x813098, 1], [0x813092, 2]]) {
      const got = run(a, v);
      assert.ok(got > 0 && got < open,
        `$${a.toString(16)} drops the SHADOW and keeps the $24C8B4 enqueue`);
    }
  });

// ===============================================================================================
// SECTION 3 -- FORMATION 4'S STATIC ARM, AND FORMATION 6.
// ===============================================================================================

test('W393 SECTION 3: bit 2 of the state word picks $24C500, and it is formation 2\'s body',
  { skip: SKIP_T }, () => {
    // The static arm calls $24D12E, so the pod INTEGRATES a velocity from ($1a,A6)/($1b,A6)
    // instead of being placed on the ellipse. Seed the two the way formation 2's own bench does.
    const staticRun = () => {
      const { ram, ctx } = bench();
      seedF4(ram, { state: 0x8403, angle0: 0x0f });   // bit 2 SET
      ram.setU8(OPT1 + OPT.speedIdx, 0xe0);
      ram.setU8(OPT1 + OPT.angle, 0x10);
      ram.setU8(OPT1 + OPT.pod + OPT.speedIdx, 0xe0);
      ram.setU8(OPT1 + OPT.pod + OPT.angle, 0x30);
      ram.setU16(OPT1 + OPT.posY, 0x1179);
      ram.setU16(OPT1 + OPT.posX, 0x14c0);
      ram.setU16(OPT1 + OPT.posY2, 0x1179);
      ram.setU16(OPT1 + OPT.pod + OPT.posX, 0x14c0);
      runOptionObject(ram, ctx);
      return ram;
    };
    const ram = staticRun();
    // THE ROTATION ANGLE IS UNTOUCHED: $24C5AC never ran.
    assert.equal(ram.u8(OPT1 + OPT_ROT_ANGLE), 0x0f, '($15,A6) is not stepped on the static arm');
    // ...and the pod moved by $24D12E's integration, which is a DIFFERENT place from the orbit.
    assert.notEqual(ram.u16(OPT1 + OPT.posX), 0x14c0 + s16(w(OPT_ROTATE + 0x10 * 4 + 2)),
      'the static arm does not land on the ellipse');
    assert.notEqual(ram.u16(OPT1 + OPT.posX), 0x14c0, '  ...but it did move');
    // The animation step is what arm A drops: ($42,A6) is untouched by BOTH arms of $24C4F8.
    assert.equal(ram.u8(OPT1 + OPT.animDelay), 0,
      '$24C4F8 has no `subq.b #1,($42,A6)` on either arm -- formation 2\'s $24C390 does');
  });

test('W393 SECTION 3: formation 6 DOES step the animation, and takes $24D158\'s half-stretch',
  { skip: SKIP_T }, () => {
    const drive = (form) => {
      const { ram, ctx } = bench();
      seedF4(ram, { form });
      ram.setU8(OPT1 + OPT.animDelay, 0);            // ($42,A6) -- `subq.b #1` BORROWS
      ram.setU8(OPT1 + OPT.animReload, 4);           // ($43,A6)
      ram.setU16(OPT1 + OPT.animIdx, 8);             // ($44,A6)
      ram.setU16(OPT1 + OPT.animIdxReload, 0x7c);
      ram.setU8(OPT1 + OPT.speedIdx, 0xe0);
      ram.setU8(OPT1 + OPT.angle, 0x10);
      ram.setU8(OPT1 + OPT.pod + OPT.speedIdx, 0xe0);
      ram.setU8(OPT1 + OPT.pod + OPT.angle, 0x10);
      ram.setU16(OPT1 + OPT.posX, 0x14c0);
      runOptionObject(ram, ctx);
      return ram;
    };
    const r6 = drive(6);
    assert.equal(r6.u8(OPT1 + OPT.animDelay), 4,
      '$24C696 reloads ($42,A6) from ($43,A6) on the borrow -- formation 6 runs $24C390\'s ten');
    assert.equal(r6.u16(OPT1 + OPT.animIdx), 4, '$24C6C0 subq.w #4,($44,A6)');
    // ...and the X step is BIGGER than formation 2's for the same speed and angle, because
    // $24D158 gives formation 6 `asr.w #1` where everything else gets `asr.w #2`.
    const r2 = drive(2);
    const dx6 = s16(r6.u16(OPT1 + OPT.posX) - 0x14c0);
    const dx2 = s16(r2.u16(OPT1 + OPT.posX) - 0x14c0);
    assert.ok(dx6 > dx2 && dx2 > 0,
      `formation 6 moves ${dx6} against formation 2's ${dx2} -- $24D166 asr.w #1 vs $24D162 #2`);
    // ...and both are EXACTLY what the vector table plus one shift gives, so neither number
    // comes from running the port and writing it down.
    const base = s16(bench().ctx.tables.vector(0xe0, 0x10).dx);
    assert.equal(dx2, base + (base >> 2), '$24D162: dx + dx/4');
    assert.equal(dx6, base + (base >> 1), '$24D166: dx + dx/2');
    assert.notEqual(dx6 * 5, dx2 * 6, 'and NOT a clean 6:5 -- `asr` truncates, twice');
  });

test('W393 SECTION 3: an odd or unknown formation still throws BY ADDRESS', { skip: SKIP_T },
  () => {
    const { ram, ctx } = bench();
    seedF4(ram, { form: 8 });
    const e = caught(() => runOptionObject(ram, ctx));
    assert.ok(e, '$24C384 has three entries and $24C34C bounds the index nowhere');
    assert.equal(e.romAddress, 0x24c384, 'the throw names the TABLE, because 8 lands off its end');
    assert.match(e.message, /W393 ported all three/, 'and it says all three arms exist now');
  });

// ===============================================================================================
// SECTION 4 -- THE THREE SHOT SPAWNS. A cold boot cannot reach these; see SECTION 5.
// ===============================================================================================

/** The fire EDGE, which is the only door into `$24C476`'s spawn arm. */
function armFire(ram) {
  // BOTH, because the two drive styles need different ones. `fireHandshake` reads ($41,A6)
  // directly; `runOptionObject` OVERWRITES it at `$24C13A move.b ($19,A4),($41,A6)` before the
  // gate ever sees it, so the player's own edge byte has to carry the bit too. ($18,A4) stays
  // clear: bit 4 of THAT one is `$24C164`, the laser gate, and it is tested first.
  ram.setU8(PL1 + P.btnByte, 0x10);              // $24C13A ($19,A4) -> ($41,A6)
  ram.setU8(PL1 + P.dirByte, 0);                 // $24C134 ($18,A4) -> ($40,A6)
  ram.setU8(OPT1 + OPT.edge, 0x10);              // ($41,A6) bit 4
  ram.setU8(PL1 + 0x21, 0);                      // ($21,A4)
  ram.setU8(PL1 + 0x37, 2);                      // ($37,A4)
  ram.setU16(PL1 + 0x20, 0);                     // ($20,A4), the POWER
  ram.setU16(PL1 + P.shipSel, 0);                // ($58,A4)
  ram.setU8(PL1 + 0x56, 2);                      // ($56,A4)
  // `$24D48A movea.l $8127E8,A1 / move.w (A1),D4` -- a ROM pointer held in RAM, and the word it
  // points at is the scan depth. $24BFDE is a ZERO word inside W12's $24BBA0 window, so D4 is 0
  // and every depth below is the routine's own arithmetic and not the cartridge's cursor value.
  ram.setU32(0x8127e8, 0x24bfde);
}

test('W393 SECTION 4: each formation reaches a DIFFERENT spawn, and the record says which',
  { skip: SKIP_T }, () => {
    // The three templates' first position offsets are different numbers in the cartridge, so
    // the record's Y field names the spawn that wrote it without any instrumentation.
    const f2y = w(l(l(0x24d2fc)) + 2);                       // $24F8EC + 2
    const f6y = w(l(l(POD_SPAWN_PTRS[6])) + 2);              // $24FB12 + 2
    const f4y = w(l(l(l(l(POD_SPAWN_PTRS[4])) + 2)));        // $24FA68 -> A2 -> [0] -> dY
    assert.deepEqual([f2y, f4y, f6y], [0x04c0, 0x0380, 0x0400],
      'three different offsets, out of the cartridge: $24F8EC, $24FA68\'s table, $24FB12');

    const fire = (form, spawn) => {
      const { ram, ctx } = bench();
      seedF4(ram, { form });
      armFire(ram);
      ram.setU16(OPT1 + OPT.posY, 0x1179);
      ram.setU16(OPT1 + OPT.posX, 0x14c0);
      ram.setU16(OPT1 + OPT.posY2, 0x1179);
      ram.setU16(OPT1 + OPT.pod + OPT.posX, 0x14c0);
      ram.setU8(OPT1 + OPT_ROT_ANGLE, 0);        // index 0 of $24FD4C for formation 4
      fireHandshake(ram, ctx, B, spawn);
      return ram;
    };
    assert.equal(fire(2, POD_SPAWNS[2]).u16(0x810572 + 2), 0x1179 + f2y, '$24D480 wrote slot 0');
    assert.equal(fire(4, POD_SPAWNS[4]).u16(0x810572 + 2), 0x1179 + f4y, '$24D5DA wrote it');
    assert.equal(fire(6, POD_SPAWNS[6]).u16(0x810572 + 2), 0x1179 + f6y, '$24D75C wrote it');
    // ...and every one of them stamps ($5a,A4) into +$28, which is how `type5.js` tells the
    // pods' shots from the ship's.
    for (const [form, spawn] of [[2, POD_SPAWNS[2]], [4, POD_SPAWNS[4]], [6, POD_SPAWNS[6]]]) {
      const ram = fire(form, spawn);
      const slots = [...Array(36).keys()].filter((i) => (ram.u16(0x810572 + i * 0x30) & 0x8000));
      assert.ok(slots.length >= 1, `formation ${form} put a record in the shot table`);
      for (const s of slots) {
        assert.equal(ram.u16(0x810572 + s * 0x30 + 0x28), form, `  ...slot ${s} carries ${form}`);
      }
    }

    // ...AND THE WIRING, END TO END. The three assertions above hand `fireHandshake` the spawn
    // address itself, so they would stay green if `$24C4F8` or `$24C690` fell into the WRONG
    // one. This half drives `$24C096` from the top with only `($5a,A4)` different, so the
    // dispatch, the formation body and the tail's `bra.w` all have to agree.
    //
    // The three spawns put the two pods' records in different SLOTS -- $24D480 uses 0 and 7,
    // $24D5DA 0 and 23 either way round, $24D75C 0 and 1 with pod 0 SECOND -- so the check is on
    // the set of `record Y - pod Y` differences, which is slot-order-independent and still
    // discriminates: $4C0, $380 and $400 are three different numbers.
    const whole = (form) => {
      const { ram, ctx } = bench();
      seedF4(ram, { form });
      armFire(ram);
      ram.setU8(OPT1 + OPT.speedIdx, 0);            // formations 2 and 6 integrate; hold them
      ram.setU8(OPT1 + OPT.pod + OPT.speedIdx, 0);  // still so the Y offset is the only term
      runOptionObject(ram, ctx);
      const pods = [ram.u16(OPT1 + OPT.posY), ram.u16(OPT1 + OPT.posY2)];
      const out = new Set();
      for (let i = 0; i < 36; i++) {
        if ((ram.u16(0x810572 + i * 0x30) & 0x8000) === 0) continue;
        for (const p of pods) out.add((ram.u16(0x810572 + i * 0x30 + 2) - p) & 0xffff);
      }
      assert.ok(out.size > 0, `formation ${form} spawned nothing through $24C096`);
      return out;
    };
    assert.ok(whole(2).has(f2y), '$24C4F2 bra.w $24D480');
    assert.ok(whole(4).has(f4y), '$24C68A bra.w $24D5DA');
    assert.ok(whole(6).has(f6y), '$24C7F2 bra.w $24D75C');
    // ...and NOT each other's, which is what makes the three assertions above discriminating.
    assert.equal(whole(4).has(f2y) || whole(4).has(f6y), false, 'formation 4 is not 2 or 6');
    assert.equal(whole(6).has(f2y) || whole(6).has(f4y), false, 'formation 6 is not 2 or 4');
    assert.equal(whole(2).has(f4y) || whole(2).has(f6y), false, 'formation 2 is not 4 or 6');
  });

test('W393 SECTION 4: $24D5DA splits at slot 23, and the rotation angle SWAPS the halves',
  { skip: SKIP_T }, () => {
    const at = (angle) => {
      const { ram, ctx } = bench();
      seedF4(ram, { form: 4 });
      armFire(ram);
      ram.setU8(OPT1 + OPT_ROT_ANGLE, angle);
      ram.setU8(OPT1 + OPT.pod + OPT_ROT_ANGLE, (angle + 0x20) & 0x3f);
      fireHandshake(ram, ctx, B, POD_SPAWNS[4]);
      return [...Array(36).keys()].filter((i) => (ram.u16(0x810572 + i * 0x30) & 0x8000));
    };
    // $24D60C: D0 = (angle + $10) & $3F. `bcc $24D620` skips the exg when D0 >= $20.
    assert.deepEqual(at(0x00), [0, 23], 'angle 0 -> D0 = $10 < $20 -> EXG: pod 0 takes slot 23');
    assert.deepEqual(at(0x20), [0, 23], 'angle $20 -> D0 = $30 >= $20 -> no exg');
    // The two runs use the SAME two slots; what differs is which pod is in which, and that is
    // visible in the Y offsets the two pods' angles select out of $24FD4C.
    const posOf = (angle) => {
      const { ram, ctx } = bench();
      seedF4(ram, { form: 4 });
      armFire(ram);
      ram.setU8(OPT1 + OPT_ROT_ANGLE, angle);
      ram.setU8(OPT1 + OPT.pod + OPT_ROT_ANGLE, (angle + 0x20) & 0x3f);
      ram.setU16(OPT1 + OPT.posY, 0x1000);
      ram.setU16(OPT1 + OPT.posY2, 0x2000);
      fireHandshake(ram, ctx, B, POD_SPAWNS[4]);
      return [ram.u16(0x810572 + 2) & 0xf000, ram.u16(0x810572 + 23 * 0x30 + 2) & 0xf000];
    };
    assert.deepEqual(posOf(0x00), [0x2000, 0x1000], 'exg: slot 0 gets POD 1');
    assert.deepEqual(posOf(0x20), [0x1000, 0x2000], 'no exg: slot 0 gets pod 0');
    assert.equal(23 * 0x30, 0x450, 'and the split is $24D5FA\'s $450');
  });

test('W393 SECTION 4: $24D6D2 takes the muzzle offset from a PER-ANGLE table, and $24D752 is dead',
  { skip: SKIP_T }, () => {
    // The A2 table is the whole reason $24D6D2 exists instead of $24D530: the offsets come out
    // of a table the rotation angle indexes, not out of the template stream.
    const a2 = l(l(l(POD_SPAWN_PTRS[4])) + 2);       // $24FA68 + 2 -> $24FD4C
    assert.equal(a2, 0x24fd4c, 'formation 4\'s template names $24FD4C');
    const entries = [];
    for (let i = 0; i <= 0x10; i++) entries.push(l(a2 + i * 4));
    // **AND THE DATA SAYS THE X HALF IS ALWAYS ZERO.** Seventeen entries, every one of them
    // (dY $380, dX 0) -- so `$24D706..$24D70C`'s negate and `$24D752 add.w D1,($4,A6)` add
    // NOTHING on this cartridge. The instructions are transcribed; their effect is measured.
    for (const [i, e] of entries.entries()) {
      assert.equal(s16(w(e)), 0x380, `entry [${i}] dY = $380`);
      assert.equal(s16(w(e + 2)), 0, `entry [${i}] dX = 0 -- $24D752 adds zero`);
    }
    assert.equal(new Set(entries.map((e) => l(e + 4))).size, 17,
      'what DOES change per angle is the long at +4, and all seventeen are different');
    const { ram, ctx } = bench();
    seedF4(ram, { form: 4 });
    armFire(ram);
    ram.setU8(OPT1 + OPT_ROT_ANGLE, 0);
    ram.setU8(OPT1 + OPT.pod + OPT_ROT_ANGLE, 0x20);
    ram.setU16(OPT1 + OPT.posX, 0x14c0);
    ram.setU16(OPT1 + OPT.pod + OPT.posX, 0x14c0);
    fireHandshake(ram, ctx, B, POD_SPAWNS[4]);
    // $24D70E wrote ($4,A6) RAW; $24D752 added D1 to the RECORD's ($4,A6) after $23D88E, with
    // A6 reloaded by $24D748. A port that read A6 as the POD there would corrupt the block.
    assert.equal(ram.u16(0x810572 + 4), 0x14c0, '$24D70E + $24D752 with a zero D1');
    assert.equal(ram.u16(OPT1 + OPT.posX), 0x14c0,
      'and the OPTION BLOCK\'s ($4,A6) is untouched: $24D748 reloaded A6 from A0 first');
  });

test('W393 SECTION 4: $24D6D2\'s fold NEGATES the offset and mirrors the record\'s +$1B/+$1C',
  { skip: SKIP_T }, () => {
    const run = (angle) => {
      const { ram, ctx } = bench();
      seedF4(ram, { form: 4 });
      armFire(ram);
      ram.setU8(OPT1 + OPT_ROT_ANGLE, angle);
      ram.setU8(OPT1 + OPT.pod + OPT_ROT_ANGLE, (angle + 0x20) & 0x3f);
      ram.setU16(OPT1 + OPT.posX, 0x14c0);
      ram.setU16(OPT1 + OPT.pod + OPT.posX, 0x14c0);
      fireHandshake(ram, ctx, B, POD_SPAWNS[4]);
      const slots = [...Array(36).keys()].filter((i) => (ram.u16(0x810572 + i * 0x30) & 0x8000));
      return slots.map((i) => ({
        x: ram.u16(0x810572 + i * 0x30 + 4),
        flip: ram.u8(0x810572 + i * 0x30 + 0x1c),
        tail: ram.u32(0x810572 + i * 0x30 + 0x1e),
      }));
    };
    // $24D6E2 masks to $3E, so angle $1E and angle $22 fold onto the SAME table entry -- one
    // with D3 = 0 and one with D3 = $FFFF. Both are in [$10,$2F], so $24D61C does not `exg` and
    // pod 0 is slot 0 in both runs; angles that swapped the halves would compare pod 1 against
    // pod 0 and prove nothing. THE OBSERVABLE DIFFERENCE IS THE FLIP BYTE, not the
    // X: see the previous test, every one of the 17 entries has dX = 0, so `$24D70C neg.w D1`
    // negates a zero and `$24D752` adds it. `$24D742 ori.b #$40,(-$10,A0)` does not.
    const a = run(0x1e), bMirror = run(0x22);
    assert.equal(bMirror[0].flip & 0x40, 0x40, '$24D742 ori.b #$40,(-$10,A0) on the fold');
    assert.equal(a[0].flip & 0x40, 0, '  ...and not otherwise');
    assert.equal(a[0].x, bMirror[0].x, 'and the X is the same both ways, because dX is 0');
    // ...and they really are the SAME entry: `$24D72A move.l (A2)+,(A0)+` lands the per-angle
    // long at +$1E, and $3E folds to index 1 exactly as $02 indexes it.
    const a2 = l(l(l(POD_SPAWN_PTRS[4])) + 2);
    assert.equal(a[0].tail, l(l(a2 + 15 * 4) + 4), 'angle $1E -> $24FD4C[15]');
    assert.equal(bMirror[0].tail, l(l(a2 + 15 * 4) + 4),
      'angle $22 -> neg.b $22 = $DE, & $3E = $1E -> the SAME entry');
    assert.notEqual(l(l(a2) + 4), l(l(a2 + 15 * 4) + 4), 'POSITIVE CONTROL: [0] and [15] differ');
  });

test('W393 SECTION 4: $24D5DA aborts BOTH pods when a scan runs out; $24D480 aborts ONE',
  { skip: SKIP_T }, () => {
    // Fill slot 0 and slot 24 but leave everything else free. With a one-deep scan (the cursor
    // word is 0, so D4 = 0 + 2 = 2 for $24D5DA and 0 for $24D480) the behaviour differs.
    const fill = (ram, ...slots) => {
      for (const s of slots) ram.setU16(0x810572 + s * 0x30, 0x8000);
    };
    // $24D480: D4 = 0 -> ONE slot examined per half. Block slot 0 only: pod 0 finds nothing,
    // pod 1 still writes at slot 7.
    {
      const { ram, ctx } = bench();
      seedF4(ram, { form: 2 });
      armFire(ram);
      fill(ram, 0);
      fireHandshake(ram, ctx, B, POD_SPAWNS[2]);
      assert.equal(ram.u16(0x810572 + 7 * 0x30) & 0x8000, 0x8000,
        '$24D480 wrote pod 1 at slot 7 even though pod 0 found nothing');
    }
    // $24D5DA: block slot 0, 1 and 2 so the (0+2)+1 = three-deep first scan fails. Then slot 24
    // must stay EMPTY, because $24D672 branches past both writers.
    {
      const { ram, ctx } = bench();
      seedF4(ram, { form: 4 });
      armFire(ram);
      ram.setU8(OPT1 + OPT_ROT_ANGLE, 0x20);        // no exg: pod 0 scans from slot 0
      fill(ram, 0, 1, 2);
      fireHandshake(ram, ctx, B, POD_SPAWNS[4]);
      assert.equal(ram.u16(0x810572 + 23 * 0x30) & 0x8000, 0,
        '$24D672 bra $24D6CC -- if pod 0 cannot fire, neither does pod 1');
      assert.equal(ram.u16(0x810572 + 3 * 0x30) & 0x8000, 0, '  ...and slot 3 is untouched too');
    }
    // ...and the scan really is TWO deeper than the cursor asks: with slots 0 and 1 blocked it
    // still reaches slot 2.
    {
      const { ram, ctx } = bench();
      seedF4(ram, { form: 4 });
      armFire(ram);
      ram.setU8(OPT1 + OPT_ROT_ANGLE, 0x20);
      fill(ram, 0, 1);
      fireHandshake(ram, ctx, B, POD_SPAWNS[4]);
      assert.equal(ram.u16(0x810572 + 2 * 0x30) & 0x8000, 0x8000,
        '$24D622 addq.w #2,D4 -- three slots deep off a zero cursor word (trap 2 + the addq)');
    }
  });

test('W393 SECTION 4: $24D75C finds TWO slots in ONE scan and walks ONE template stream',
  { skip: SKIP_T }, () => {
    const { ram, ctx } = bench();
    seedF4(ram, { form: 6 });
    armFire(ram);
    ram.setU16(OPT1 + OPT.posY, 0x1000);
    ram.setU16(OPT1 + OPT.posY2, 0x2000);
    fireHandshake(ram, ctx, B, POD_SPAWNS[6]);
    const slots = [...Array(36).keys()].filter((i) => (ram.u16(0x810572 + i * 0x30) & 0x8000));
    assert.deepEqual(slots, [0, 1],
      'one scan, two consecutive slots -- NOT $24D480\'s slot 0 and slot 7');
    // POD 0 GOES SECOND. $24D7FE keeps the first free slot in A3 and $24D85C hands it to the
    // SECOND writer, so slot 1 is pod 0 and slot 0 is pod 1.
    assert.equal(ram.u16(0x810572 + 1 * 0x30 + 2) & 0xf000, 0x1000, 'slot 1 is pod 0');
    assert.equal(ram.u16(0x810572 + 0 * 0x30 + 2) & 0xf000, 0x2000, 'slot 0 is pod 1');
    // ...and the two records come from CONSECUTIVE 38-byte templates, which is what "A1 walks"
    // means. The second template's Y offset is $26 past the first's in the cartridge.
    const t = l(l(POD_SPAWN_PTRS[6]));
    assert.equal(ram.u16(0x810572 + 1 * 0x30 + 2), 0x1000 + w(t + 2), 'pod 0 read template+0');
    assert.equal(ram.u16(0x810572 + 0 * 0x30 + 2), 0x2000 + w(t + 0x26 + 2),
      'pod 1 read template+$26 -- 38 bytes on, with no rewind');
  });

// ===============================================================================================
// SECTION 5 -- **THE DELIVERABLE.** A REAL COLD BOOT, AND WHAT THE DEMOS ACTUALLY DO.
// ===============================================================================================

/** The same helper W390, W391 and W392 use. */
function coldBoot(frames) {
  const g = new Game(new Uint8Array(0x20000), tables, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);
  const arms = []; const formations = new Map();
  let prev = -1; let threw = null;
  const fire = new Set(); const burst = new Set();
  let shotRecords = 0;
  for (let f = 1; f <= frames; f++) {
    try { g.step(0xffff); } catch (e) { threw = { f, e }; break; }
    const a = g.ram.u16(SCREEN8.state);
    if (a !== prev) { arms.push([f, a]); prev = a; }
    for (let i = 0; i < 36; i++) {
      if (g.ram.u16(0x810572 + i * 0x30) & 0x8000) shotRecords++;
    }
    if ((g.ram.u16(RAM.p1Options + OPT.state) & 0x8000) === 0) continue;
    const form = g.ram.u16(RAM.player1 + P.optFormation);
    const st = g.ram.u16(RAM.p1Options + OPT.state);
    const key = `${form}:${(st & 0x0400) ? 'static' : 'rotate'}`;
    const e = formations.get(key);
    if (e) { e.frames++; e.last = f; e.states.add(st); } else {
      formations.set(key, { first: f, last: f, frames: 1, states: new Set([st]) });
    }
    fire.add(g.ram.u8(RAM.p1Options + OPT.edge));
    burst.add(g.ram.u8(RAM.player1 + 0x35));
  }
  return { g, arms, formations, threw, fire, burst, shotRecords };
}

test('W393 SECTION 5: THE DEMOS PLAY. Past +5,996, and all three formations run',
  { skip: SKIP_T }, () => {
    const { arms, formations, threw } = coldBoot(12000);
    // THE LOOP IS UNCHANGED. W392 measured these sixteen transitions with the handoff NOTED;
    // with it CALLED and the formations ported they are identical, so booting a stage three
    // times costs the attract sequencer nothing.
    assert.deepEqual(arms, [
      [1, 13], [302, 2], [574, 12], [878, 9], [1182, 1], [1918, 5],
      [4334, 2], [4606, 12], [4910, 9], [5214, 1], [5950, 5],
      [8366, 2], [8638, 12], [8942, 9], [9246, 1], [9982, 5],
    ], 'the same three laps of 4,032 frames W392 measured');
    // **AND +5,996 IS GONE.** W392's measurement was `THREW at frame 5996: UNPORTED $24C4F8`.
    assert.ok(!threw || threw.f > 5996,
      `the run passed +5,996${threw ? ` and reached +${threw.f}` : ''}`);
    // Each demo's ship is its formation, and each one really ran.
    const keys = [...formations.keys()].sort();
    assert.deepEqual(keys, ['2:rotate', '4:rotate', '6:rotate'],
      'demo 0 -> formation 2, demo 1 -> 4, demo 2 -> 6, and NOT ONE static frame');
    assert.equal(formations.get('2:rotate').first, 1935, 'demo 0\'s options come up at +1,935');
    assert.equal(formations.get('4:rotate').first, 5967, '  ...demo 1\'s at +5,967');
    assert.equal(formations.get('6:rotate').first, 9999, '  ...and demo 2\'s at +9,999');
    assert.equal(formations.get('4:rotate').frames, 754,
      'formation 4 runs for 754 frames -- 31 of which W392 never saw');
    assert.equal(formations.get('2:rotate').frames, 1264, 'formation 2 for 1,264');
    // **W394 CORRECTION.** This read 443, and 443 was not formation 6's length -- it was the
    // distance from demo 2's first option frame (+9,999) to the frame the port DIED on (+10,514,
    // `$262B4C`). With internal stage 2's fourteen background-element constructors ported the
    // demo runs to its own end and formation 6 gets its real 732 frames, which is 289 more than
    // any measurement before this wave could see. A number produced by a crash is not a
    // measurement of the thing that crashed.
    assert.equal(formations.get('6:rotate').frames, 732, 'formation 6 for 732 -- see W394');
    // "2:rotate" and "6:rotate" are bookkeeping (those formations have no bit-2 arm); what the
    // key really says about formation 4 is that bit 2 was CLEAR on all 754 frames.
    assert.deepEqual([...formations.get('4:rotate').states].sort(), [0x8000, 0x8001, 0x8003],
      'the state word is only ever $8000/$8001/$8003, so bit 2 -- and bit 3 -- never rise');
  });

test('W393 SECTION 5: **THE DEMOS NEVER FIRE**, so a cold boot cannot reach any of the spawns',
  { skip: SKIP_T }, () => {
    const { fire, burst, shotRecords } = coldBoot(12000);
    assert.deepEqual([...fire], [0],
      '($41,A6), the fire EDGE $24C476 gates on, is 0 on every option frame of all three demos');
    assert.deepEqual([...burst], [0], '  ...and so is ($35,A4), the burst counter');
    assert.equal(shotRecords, 0,
      'not one record in $810572 across 12,000 frames -- the ship does not shoot either');
    // WHY, and it is not the option subsystem: the replay stream is never advanced.
    assert.equal(w(0x23d116), 0x4eb9, '$23D116 jsr abs.l');
    assert.equal(l(0x23d118), 0x25c60c, '  ...$25C60C, the codec, and it is the ONLY caller');
    assert.equal(w(0x23d0f8), 0x41f9, '$23D0F8 lea abs.l,A0');
    assert.equal(l(0x23d0fa), 0x00c08000, '  ...$C08000, the raw controller port input.js '
      + 'records as never executing in this port');
  });

test('W393 SECTION 5: what WAS left is $262B4C, a BACKGROUND ELEMENT and never an option',
  { skip: SKIP_T }, () => {
    // **W394 CORRECTION.** This test opened `assert.ok(threw, 'demo 2 does still die')` and then
    // pinned +10,514 and `$262B4C`. It cannot survive W394, which ports `$262B4C` and the other
    // thirteen constructors of the same table -- demo 2 does NOT still die. What the test was
    // really for is the SECOND half: that the thing in the way was never the option subsystem.
    // That half is kept, and the first half is inverted rather than deleted.
    const { threw } = coldBoot(12000);
    assert.equal(threw, null,
      'demo 2 no longer dies at all; see tests/w394bgelem.test.js SECTION 5');
    // The routine itself is unchanged in the cartridge, and W393's byte measurements of it were
    // right. They stay, because they are what W394's registry row was built from.
    assert.equal(w(0x262b4c), 0x2d7c, '$262B4C move.l #imm,(d16,A6)');
    assert.equal(l(0x262b4e), 0x00290f10, '  ...#$290F10');
    assert.equal(w(0x262b5a), 0x2d7c, '$262B5A move.l #imm,(d16,A6)');
    assert.equal(l(0x262b5c), 0x00262b6a, '  ...#$262B6A, the per-frame handler it installs');
    assert.equal(w(0x262b68), 0x4e75, '$262B68 is the `rts`, AT the last address');
    assert.equal(0x262b6a - 0x262b4c, 0x1e, 'so the constructor is $1E bytes, five instructions');
  });

// ===============================================================================================
// SECTION 6 -- THE ROM WINDOW.
// ===============================================================================================

test('W393 SECTION 6: the window is $24D3C0 + $BC, both bounds stated by code', { skip: SKIP_T },
  () => {
    const ws = tables.rom.windows.map((x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]);
    const mine = ws.filter(([a]) => a === 0x24d3c0);
    assert.deepEqual(mine, [[0x24d3c0, 0xbc]], 'declared once, at $BC');
    assert.equal(0x24d3c0 + 0xbc, POD_HYPER_COUNTS, 'and it ends AT $24D47C');
    // The near end abuts W12's window; abutting is not overlapping.
    const w12 = ws.find(([a]) => a === 0x24d2e0);
    assert.deepEqual(w12, [0x24d2e0, 0xe0], 'W12 declared $24D2E0 + $E0');
    assert.equal(0x24d2e0 + 0xe0, 0x24d3c0, '  ...which ends exactly where this one begins');
    // OVERLAP COUNT, over the WHOLE set, with and without. The brief says 71; so does this.
    const pairs = (list) => {
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        for (let k = i + 1; k < list.length; k++) {
          const [a, la] = list[i]; const [b2, lb] = list[k];
          if (a < b2 + lb && b2 < a + la) n++;
        }
      }
      return n;
    };
    assert.equal(pairs(ws), 71, '71 overlapping pairs with this window');
    assert.equal(pairs(ws.filter(([a]) => a !== 0x24d3c0)), 71, '...and 71 without it');
  });

test('W393 SECTION 6: ABLATED FROM THE EXPORTED TABLES, the spawn throws BY ADDRESS',
  { skip: SKIP_T }, () => {
    // The technique W392 used: take the window OUT of the exported table set and show the game
    // reaching for it and throwing at the exact address. A cold boot cannot do it here (SECTION
    // 5: the demos never fire), so the drive is the spawn itself.
    const without = {
      ...tables,
      rom: {
        ...tables.rom,
        windows: tables.rom.windows.filter(
          (x) => parseInt(String(x.base).replace('$', ''), 16) !== 0x24d3c0),
      },
    };
    const romless = new RomWindows(without.rom);
    // Formation 4 throws at $24D3CC and formation 6 at $24D41C, and the difference is exactly
    // where W12's window stops: $24D3BC's four block pointers are its LAST four bytes, so the
    // block pointer still reads and the per-power table it names does not. $24D41C is wholly
    // outside, so formation 6 fails one read earlier.
    for (const [form, spawn, first] of
      [[4, POD_SPAWNS[4], 0x24d3cc], [6, POD_SPAWNS[6], POD_SPAWN_PTRS[6]]]) {
      const ram = new Ram(null);
      const ctx = {
        rom: romless,
        prot: new ProtLatch(),
        tables: new MoveTables(without, romless),
        unportedLog: new UnportedLog(),
      };
      seedF4(ram, { form });
      armFire(ram);
      const e = caught(() => fireHandshake(ram, ctx, B, spawn));
      assert.ok(e, `formation ${form}'s spawn needs the window`);
      assert.equal(e.romAddress, first,
        `formation ${form} throws at $${first.toString(16).toUpperCase()}`);
      assert.match(e.message, /outside every\s+ROM window/, 'a window throw, named');
    }
    // POSITIVE CONTROL: with the window present the same drive does not throw.
    const { ram, ctx } = bench();
    seedF4(ram, { form: 4 });
    armFire(ram);
    assert.doesNotThrow(() => fireHandshake(ram, ctx, B, POD_SPAWNS[4]));
  });
