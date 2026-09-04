// ===============================================================================================
// W405 -- A1 GUN 7 `$2A8516`, A1 GUN 8 `$2A8800`, AND A4 SCRIPT $D `$2A6970`.
// ===============================================================================================
//
// UNIT. The two guns and the one A4 script that stood between HIBACHI's attack loop and a loop
// with no port stop in it. W404 ran {$A, $B, $C} x {gun 5, gun 6} and stopped on frame 982 at
// gun 7's init.
//
// **WHERE THE BRIEF IS WRONG, from the bytes rather than argued:**
//
//   1. "HIBACHI phase B's attack loop". **PHASE A's.** `$2A5F80 moveq #$A,D0 / jsr $25980C` --
//      the only route into A4 $A -- sits in A4 script 2's tail, and `$2A5F40` in the same
//      script is the `move.b #$1,($10E,A6)` that selects `$2A6F1C`, PHASE A. Phase B's
//      selector value 2 is written by `$2A637A`, in A4 script 4, which only runs AFTER phase A
//      has died. Measured: `($10E,A6)` is 1 on every frame the loop runs. SECTION 3.
//   2. "Gun 8 needs NO new window because it walks `$26BFFC` like gun 5." It walks $26BFFC,
//      but its init is `$2A8800 lea (d16,PC),A0 / moveq #$7 / move.w (A0)+,(A1)+ / dbra` --
//      a slot template at `$2A87D0`, exactly like guns 5, 6 and 7. That is a window, and gun 7
//      needs a SECOND one for the same reason: its template `$2A84E4` is NOT inside W404's
//      `$2A84CC + $18`, which ends one byte before it. THREE new windows, not one. SECTION 7.
//   3. "If porting 7, 8 and A4 $D really closes it, the real path should no longer stop inside
//      this cycle." It does not -- and it does not run for ever either. **A4 $D's own `move.b
//      #$C,($1A,A5)` / `move.b #$4,($1A,A5)` write the HIGH BYTE of the word `$2A7088 subq.w
//      #$1,($1A,A5)` counts down to phase A's DEATH.** Each pass through $D re-arms that
//      timeout at `$04xx`; it expires in the middle of the second lap, `$2A702C`/`$2A7032`
//      wipe every A1 and A4 slot, and the death tail hands to A4 3 -> A4 4 -> A4 $F. SECTION 3.
//
// SECTION 1  the two extents and A4 $D's, each bounded three ways, no bound an absence
// SECTION 2  gun 7's block table: four pointers, four 80-byte blocks, and what sizes them
// SECTION 3  **THE DELIVERABLE**: the loop closed, and where the real path goes instead
// SECTION 4  gun 7 driven, with the bullet RECORDS read back
// SECTION 5  gun 8 driven: the range gate, the converging ring, the signed bounce, the bsr
// SECTION 6  A4 $D, and the two `($1A,A5)` writes
// SECTION 7  the window set: 593, and the bounds on each of the three new ones
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { resetSpriteQueueCounters } from '../src/displaylist.js';
import { BGRAM, BgVram, backgroundFrame, backgroundInit } from '../src/background.js';
import { installScripts, SCHED, scriptAddresses } from '../src/scheduler.js';
import { handler2A4606 } from '../src/boss.js';
import { HIBACHI_A4, HIBACHI_END_COUNTED } from '../src/hibachiend.js';
import {
  HIBACHI_A1, HIBACHI_A1_SCRIPTS, HIBACHI_GUN_A4_SCRIPTS, HIBACHI_A1_COUNTED,
  gun7Init2A8516, gun7Step2A8538, gun8Init2A8800, gun8Step2A883A, a4D2A6970,
} from '../src/hibachiguns.js';
import { aim256, AimTables } from '../src/aim.js';
import { RNG } from '../src/rng.js';
import { poolClear, REC as BREC } from '../src/bullets.js';
import {
  ROM_WINDOW_COUNT,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');

const NEED = [IMAGE, TABLES];
const MISSING = NEED.filter((p) => !existsSync(p));
const SKIP = MISSING.length === 0 ? false
  : `${MISSING.map((p) => path.basename(p)).join(', ')} absent -- run `
    + 'tools/export-tables.py. THIS IS A SKIP, NOT A PASS.';

const IMG = MISSING.length === 0 ? readFileSync(IMAGE) : null;
const tables = MISSING.length === 0 ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);
const sw = (a) => (w(a) >= 0x8000 ? w(a) - 0x10000 : w(a));
const disp16 = sw;
const u8 = (v) => v & 0xff;
const u16 = (v) => v & 0xffff;
const i8 = (v) => (((v & 0xff) ^ 0x80) - 0x80);

// ===============================================================================================
// SECTION 1 -- THE THREE EXTENTS.
// ===============================================================================================

test('W405 SECTION 1: gun 7 is $2EA bytes and gun 8 is $1BA, each bounded THREE ways',
  { skip: SKIP }, () => {
    // ---- GUN 7. $2A8516 init, $2A8538 step, code through $2A867F, data through $2A87CF.
    assert.equal(l(HIBACHI_A1.main + 7 * 8), HIBACHI_A1.gun7Init, '$2A72C8[7].init');
    assert.equal(l(HIBACHI_A1.main + 7 * 8 + 4), HIBACHI_A1.gun7Step, '  ...and .step');
    // (1) `4E75` sits AT $2A867E -- TRAP 5, it is the LAST address and not one past it -- and
    // it is exactly where BOTH of the step's two `bcc.w` exits land.
    assert.equal(w(0x2a867e), 0x4e75, '(1) $2A867E `4E75`, gun 7\'s last instruction');
    for (const site of [0x2a862a, 0x2a865a]) {
      assert.equal(w(site), 0x6400, `  ...$${site.toString(16)} 6400 bcc.w`);
      assert.equal(site + 2 + disp16(site + 2), 0x2a867e, '  ...lands on that rts');
    }
    // (2) $2A8680 is DATA a `lea` NAMES -- TRAP 4: extension-word address plus displacement.
    assert.equal(w(0x2a8590), 0x47fa, '(2) $2A8590 `47FA` lea (d16,PC),A3');
    assert.equal(0x2a8592 + disp16(0x2a8592), HIBACHI_A1.gun7Blocks, '  ...$2A8592 + $EE = $2A8680');
    // (3) and the table's own next entry closes it.
    assert.equal(l(HIBACHI_A1.main + 8 * 8), HIBACHI_A1.gun8Init, '(3) $2A72C8[8].init is $2A8800');
    assert.equal(HIBACHI_A1.gun8Init - HIBACHI_A1.gun7Init, 0x2ea, '  ...so gun 7 is $2EA bytes');

    // ---- GUN 8. $2A8800 init, $2A883A step, code through $2A898B.
    assert.equal(l(HIBACHI_A1.main + 8 * 8 + 4), HIBACHI_A1.gun8Step, '$2A72C8[8].step is $2A883A');
    assert.equal(w(0x2a898a), 0x4e75, '(1) $2A898A `4E75`, gun 8\'s last instruction');
    assert.equal(w(0x2a8966), 0x6400, '  ...$2A8966 6400 bcc.w');
    assert.equal(0x2a8968 + disp16(0x2a8968), 0x2a898a, '  ...lands on it');
    assert.equal(w(0x2a89ba), 0x41fa, '(2) $2A89BA `41FA` lea (d16,PC),A0 -- GUN 9\'s init');
    assert.equal(0x2a89bc + disp16(0x2a89bc), 0x2a898c,
      '  ...and it names $2A898C, so what follows gun 8\'s code is gun 9\'s TEMPLATE, data');
    assert.equal(l(HIBACHI_A1.main + 9 * 8), 0x2a89ba, '(3) $2A72C8[9].init is $2A89BA');
    assert.equal(0x2a89ba - HIBACHI_A1.gun8Init, 0x1ba, '  ...so gun 8 is $1BA bytes');

    // ---- A4 $D. $2A6970 init, $2A698A step, $60 bytes.
    assert.equal(l(HIBACHI_A4.table + 0x0d * 8), 0x2a6970, '$2A5886[$D].init');
    assert.equal(l(HIBACHI_A4.table + 0x0d * 8 + 4), 0x2a698a, '  ...and .step');
    assert.equal(w(0x2a69ce), 0x4e75, '(1) $2A69CE `4E75`, and FOUR branches reach it');
    assert.equal(w(0x2a69cc), 0x4254,
      '  ...(2) $2A69CC `4254` clr.w (A4) -- TRAP 6: clr.w (A4), NOT clr.w D4 -- right before it');
    assert.equal(l(HIBACHI_A4.table + 0x0e * 8), 0x2a69d0,
      '(3) and $2A5886[$E].init is $2A69D0, the next address');
    assert.equal(0x2a69d0 - 0x2a6970, 0x60, '  ...so A4 $D is $60 bytes');
    // The A4 convention, checked on THIS pair rather than assumed from the A1 one next to it:
    // the word before the step is an operand, so the init falls through into the step.
    assert.notEqual(w(0x2a6988), 0x4e75,
      '$2A6988 is `$001A`, the operand of $2A6984 move.b #$C,($1A,A5) -- A4 inits FALL THROUGH');
    assert.equal(w(0x2a6984), 0x1d7c, '  ...and $2A6984 is `1D7C` move.b #imm,(d16,A5)');
  });

test('W405 SECTION 1: both new guns open with the A1 freeze head that branches BACKWARD',
  { skip: SKIP }, () => {
    for (const [ini, step] of [[HIBACHI_A1.gun7Init, HIBACHI_A1.gun7Step],
      [HIBACHI_A1.gun8Init, HIBACHI_A1.gun8Step]]) {
      assert.equal(w(step), 0x4a79, `$${step.toString(16)} 4A79 tst.w <abs.l>`);
      assert.equal(l(step + 2), HIBACHI_A1.freeze, '  ...$8130D4');
      assert.equal(w(step + 6), 0x6600, '  ...6600 bne.w');
      assert.equal(step + 8 + disp16(step + 8), ini,
        '  ...whose target is the gun\'s OWN INIT, backward -- not an rts');
      assert.equal(w(step + 10), 0x532c, '  ...then 532C subq.b #$1,(d16,A4)');
      assert.equal(w(step + 12), 0x0002, '  ...at ($2,A4)');
      assert.equal(w(step + 14), 0x6502, '  ...6502 bcs.s over the rts');
      assert.equal(w(step + 16), 0x4e75, '  ...which is that rts');
    }
    // A4 $D's identically-placed test branches FORWARD, to $2A69CE. Same word, opposite arm.
    assert.equal(w(0x2a6990), 0x4a79, '$2A6990 tst.w');
    assert.equal(l(0x2a6992), HIBACHI_A1.freeze, '  ...$8130D4');
    assert.equal(w(0x2a6996) & 0xff00, 0x6600, '  ...6636 bne.s');
    assert.equal(0x2a6996 + 2 + (w(0x2a6996) & 0xff), 0x2a69ce, '  ...FORWARD, to the rts');
  });

// ===============================================================================================
// SECTION 2 -- GUN 7'S BLOCK TABLE. Four pointers, four blocks, and where every number is from.
// ===============================================================================================

test('W405 SECTION 2: four pointers over four 80-byte blocks of 8-byte records', { skip: SKIP },
  () => {
    // ---- THE INDEX. `move.b ($6,A4),D4 / add.w D4,D4 / add.w D4,D4` -- a BYTE scaled by 4.
    assert.equal(w(0x2a8598), 0x182c, '$2A8598 `182C` move.b (d16,A4),D4');
    assert.equal(w(0x2a859a), 0x0006, '  ...($6,A4), the BLOCK index');
    assert.equal(w(0x2a859c), 0xd844, '$2A859C `D844` add.w D4,D4');
    assert.equal(w(0x2a859e), 0xd844, '  ...and again: the stride is FOUR, so the entries are '
      + 'longwords and the index is not a byte offset');
    assert.equal(w(0x2a85a2), 0x2653, '$2A85A2 `2653` movea.l (A3),A3 -- the pointer is FOLLOWED');

    // ---- HOW MANY. The table's OWN LOWEST POINTER is $2A8680 + $10, so a fifth entry would
    // sit inside block 3. That is a positive witness, not "the fifth does not look like one".
    const ptrs = [0, 1, 2, 3].map((i) => l(HIBACHI_A1.gun7Blocks + i * 4));
    assert.deepEqual(ptrs, [0x2a8780, 0x2a8730, 0x2a86e0, 0x2a8690],
      'the four pointers, in table order -- DESCENDING, $50 apart');
    assert.equal(Math.min(...ptrs), HIBACHI_A1.gun7Blocks + HIBACHI_A1.gun7BlockCount * 4,
      'the lowest is $2A8690 = base + 4*4, so the pointer table is exactly four entries');

    // ---- HOW BIG each block is: the cursor's own stride and reload, and TRAP 3 -- the
    // subtract has to BORROW, so $40 down to 0 is FIVE positions and not four.
    assert.equal(w(0x2a8618), 0x046c, '$2A8618 `046C` subi.w #imm,(d16,A4)');
    assert.equal(w(0x2a861a), 0x0010, '  ...#$10');
    assert.equal(w(0x2a861c), 0x0012, '  ...on ($12,A4)');
    assert.equal(w(0x2a861e), 0x6406, '$2A861E `6406` bcc.s, so the reload is the BORROW arm');
    assert.equal(w(0x2a8620), 0x397c, '$2A8620 `397C` move.w #imm,(d16,A4)');
    assert.equal(w(0x2a8622), 0x0040, '  ...#$40');
    assert.equal((0x40 / 0x10 + 1) * 0x10, HIBACHI_A1.gun7BlockLen,
      'five cursor values x $10 = $50 bytes a block');
    // ...and the blocks really are contiguous at that stride, in ROM.
    const sorted = [...ptrs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      assert.equal(sorted[i] - sorted[i - 1], HIBACHI_A1.gun7BlockLen, `block ${i} is $50 on`);
    }
    assert.equal(Math.max(...ptrs) + HIBACHI_A1.gun7BlockLen, 0x2a87d0,
      'so the whole thing ends at $2A87D0...');
    assert.equal(HIBACHI_A1.gun7Blocks + 0x150, 0x2a87d0, '  ...which is base + $150');
    assert.equal(0x2a8802 + disp16(0x2a8802), 0x2a87d0,
      '  ...and $2A8800\'s lea names exactly that address as gun 8\'s template. It tiles.');

    // ---- WHAT A RECORD IS. `move.l (A3)+ / add.w (A3)+ / move.w (A3)+`, so 4 + 2 + 2.
    assert.equal(w(0x2a85aa), 0x261b, '$2A85AA `261B` move.l (A3)+,D3 -- the position delta');
    assert.equal(w(0x2a85ae), 0xd05b, '$2A85AE `D05B` add.w (A3)+,D0 -- the SPEED BIAS word');
    assert.equal(w(0x2a85b2), 0x3a1b, '$2A85B2 `3A1B` move.w (A3)+,D5 -- the ANGLE word');
    assert.equal(4 + 2 + 2, HIBACHI_A1.gun7RecordLen, '  ...eight bytes');
    // ...and the two `swap D0` around the add are what make the word a SPEED and not a kind.
    assert.equal(w(0x2a85ac), 0x4840, '$2A85AC `4840` swap D0 -- BEFORE the add');
    assert.equal(w(0x2a85b0), 0x4840, '  ...and $2A85B0 swaps it back AFTER');

    // ---- THE DATA ITSELF, read back so the shape is asserted and not just argued: forty
    // records, every bias word ZERO, and the angle magnitudes widening block by block.
    const angles = [];
    for (const p of ptrs) {
      for (let r = 0; r < 10; r++) {
        assert.equal(w(p + r * 8 + 4), 0, `record ${r} of $${p.toString(16)} has bias 0`);
      }
      angles.push(sw(p + 6));                   // record 0's angle, the widest in each block
    }
    assert.deepEqual(angles, [16, 14, 12, 10],
      'block 0 opens at +16 and each later pointer at two less -- the table is a DIFFICULTY '
      + 'ladder walked by ($6,A4), and the ROM stores it widest-first');
  });

test('W405 SECTION 2: the shipped template never reaches block 3 -- and that is the TEMPLATE, '
  + 'not the code', { skip: SKIP }, () => {
  // ($6,A4) opens at 2 and `subq.b #$1` walks it 2, 1, 0 and then borrows into the retire.
  assert.equal(IMG[HIBACHI_A1.gun7Template + 4], 0x02, 'the template\'s ($6,A4) is 2');
  assert.equal(w(0x2a8656), 0x532c, '$2A8656 `532C` subq.b #$1,(d16,A4)');
  assert.equal(w(0x2a8658), 0x0006, '  ...($6,A4)');
  assert.equal(w(0x2a865a), 0x6400, '$2A865A bcc.w -- the retire is the BORROW');
  // So the pointer the code CAN reach is capped at index 2 with this template. $2A8690, the
  // narrowest block, is unreachable -- but the byte is copied ROM data and the code indexes
  // four entries, so the window covers all four and nothing here is folded away.
  assert.equal(l(HIBACHI_A1.gun7Blocks + 3 * 4), 0x2a8690, 'index 3 IS a real pointer...');
  assert.equal(sw(0x2a8690 + 6), 10, '  ...to the +-10/+-5 block, which the shipped run skips');
});

// ===============================================================================================
// SECTION 3 -- THE DELIVERABLE. The loop closed, and where the real path goes instead.
// ===============================================================================================

const REC = 0x810c00;
const SUB = 0x814800;
const A5BG = 0x80e240;

/** W404's bench, unchanged: the A4 table AND the A1 table, exactly as `$2A4306`/`$2A4318`
 *  install them. Without the A1 install `$812BD4` is zero and `$259782 tst.l / beq` skips the
 *  whole A1 walk -- the bug that made two waves' stop readings unearned. */
function realPath() {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const vram = new BgVram();
  const log = new UnportedLog();
  const ctx = { unportedLog: log, unported: log, soundPost() {} };
  ram.setU16(BGRAM.stageX4, 16);
  ram.setU16(A5BG + 0x06, 0x0344);
  backgroundInit(ram, ROM, vram, ctx, A5BG);
  installScripts(ram, ROM, { a4: HIBACHI_A4.table, a1: HIBACHI_A1.main });
  ram.setU32(REC + 0x06, SUB);
  ram.setU32(REC + 0x16, 0x00000010);
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU8(SUB + 0x00, 0x44);
  ram.setU16(SUB + 0x18, 0x0000);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(HIBACHI_A4.forkLoopWord, 1);
  ram.setU16(HIBACHI_A4.forkFlag, 0);
  return { ROM, ram, vram, ctx, log };
}

function runReal(b, frames) {
  const out = { stopped: null, suspend: null, shots: 0, bySite: new Map(),
    a1: [], a4: [], phase: new Set() };
  b.ctx.bulletSpawn = (site) => {
    out.shots += 1;
    out.bySite.set(site, (out.bySite.get(site) ?? 0) + 1);
  };
  let prev = '';
  let prev4 = '';
  for (let f = 1; f <= frames; f++) {
    if (!out.stopped) {
      try { handler2A4606(b.ram, b.ROM, REC, b.ctx); } catch (e) {
        out.stopped = { frame: f, at: e.romAddress, name: e.name };
      }
    }
    const live = [...Array(SCHED.a1Slots).keys()]
      .map((i) => b.ram.u16(SCHED.a1Base + i * SCHED.a1Stride))
      .filter((v) => v !== 0).map((v) => v & 0xff).join(',');
    if (live !== prev) { out.a1.push([f, live]); prev = live; }
    const live4 = [...Array(SCHED.a4Slots).keys()]
      .map((i) => b.ram.u16(SCHED.a4Base + i * SCHED.a4Stride))
      .filter((v) => v !== 0).map((v) => (v & 0xff).toString(16)).join(',');
    if (live4 !== prev4) { out.a4.push([f, live4]); prev4 = live4; }
    if (!out.stopped) out.phase.add(b.ram.u8(SUB + 0x10e));
    if (out.suspend === null && b.ram.u16(SCHED.suspend) !== 0) out.suspend = f;
    resetSpriteQueueCounters(b.ram);
    backgroundFrame(b.ram, b.ROM, b.vram, b.ctx, A5BG);
  }
  return out;
}

test('W405 SECTION 3: the attack loop CLOSES -- a full lap, and no stop anywhere inside it',
  { skip: SKIP }, () => {
    const r = runReal(realPath(), 8000);

    // ---- THE LAP. $A -> 5 -> $B -> 6 -> $C -> 7 -> $D -> 8 -> $A -> 5 again.
    // W406 CORRECTION: gun 9 is ported now, so the history runs two entries longer. The ten
    // entries this section is about are unchanged, which is the point of the slice.
    assert.deepEqual(r.a1.slice(0, 10), [
      [321, '5'], [627, ''], [691, '6'], [901, ''], [982, '7'], [1441, ''],
      [1537, '8'], [2108, ''], [2173, '5'], [2549, ''],
    ], 'A1 slot history: gun 5 321..626, gun 6 691..900, gun 7 982..1440, gun 8 1537..2107, '
      + 'and then gun 5 AGAIN on 2173 -- the loop really returns to its start');
    // NOTE: this file's `runReal` joins the A1 ids in DECIMAL, so gun $B reads 11 and gun $A
    // reads 10. (W406's and W407's copies use hex; the number is the same slot either way.)
    assert.deepEqual(r.a1.slice(10),
      [[3023, '9'], [3316, ''], [3412, '11'], [3919, ''], [4016, '10'], [4447, '']],
      '  ...and after the loop is torn down, phase B\'s guns -- which are NOT in it. W408 '
      + 'CORRECTION: gun $A ran too, from 4016, and its slot is cleared on 4447 by the '
      + 'phase-B wipe rather than by its own retire');
    assert.deepEqual(r.a4.map(([f, v]) => [f, v]).slice(0, 7), [
      [1, '1'], [192, '2'], [320, 'a'], [628, 'b'], [902, 'c'], [1442, 'd'], [2172, 'a'],
    ], 'A4 slot history: 1 -> 2 -> $A -> $B -> $C -> $D -> $A. Every hand-over is a `moveq / '
      + 'jsr $25980C` and the last one is $2A69BC, in the script this wave ports');
    // ...and the $40 A4 $D holds AFTER gun 8 retires, measured: 2172 - 2108 = $40.
    assert.equal(2172 - 2108, 0x40,
      '$2A6976 move.w #$40,($4,A4) is spent BELOW $2A69B4\'s bcs, so it is a cooldown after '
      + 'the gun and not part of the wait');

    // ---- NOTHING IN THE LOOP IS A STOP. Every frame from 321 to 2548 ran.
    // W409 CORRECTION: there is no stop at all any more -- A4 script 5 is ported and the
    // stage SUSPENDS on 4889, which is 2,341 frames past the end of the loop.
    assert.equal(r.stopped, null, 'the run does not stop inside the loop, or anywhere else');
    assert.equal(r.suspend, 4889,
      `the loop ends on 2548 and the stage suspends on ${r.suspend}, well past it`);
    // ---- AND EVERY FRAME OF IT IS PHASE **A**, where the brief said phase B.
    assert.deepEqual([...r.phase].sort(), [0, 1, 2],
      '($10E,A6) is 0 before A4 script 2, then 1 -- PHASE A -- for the whole loop, and only '
      + 'reaches 2 after it');
    assert.equal(w(0x2a5f80), 0x700a, '$2A5F80 `700A` moveq #$A,D0 -- the ONLY route into A4 $A');
    assert.equal(l(0x2a5f84), 0x0025980c, '  ...jsr $25980C');
    assert.equal(w(0x2a5f40), 0x1d7c, '$2A5F40 `1D7C` move.b #imm,(d16,A6) -- four instructions '
      + 'earlier in the SAME script');
    assert.equal(w(0x2a5f42), 0x0001, '  ...#$1');
    assert.equal(w(0x2a5f44), 0x010e, '  ...into ($10E,A6): PHASE A, $2A6F1C');
  });

test('W405 SECTION 3: what ends the loop is A4 $D\'s own ($1A,A5) byte, and the stop is A4 $F',
  { skip: SKIP }, () => {
    const r = runReal(realPath(), 8000);

    // ---- THE TIMER. `move.b #imm,($1A,A5)` writes the HIGH byte of the word phase A's exit
    // counts down, so the loop's own driver is what schedules the boss's death.
    assert.equal(w(0x2a6984), 0x1d7c, '$2A6984 move.b #$C,($1A,A5) -- A4 $D\'s init');
    assert.equal(w(0x2a6986), 0x000c, '  ...#$C');
    assert.equal(w(0x2a6988), 0x001a, '  ...at ($1A,A5)');
    assert.equal(w(0x2a69a6), 0x1d7c, '$2A69A6 move.b #$4,($1A,A5) -- the frame gun 8 starts');
    assert.equal(w(0x2a69a8), 0x0004, '  ...#$4');
    assert.equal(w(0x2a6990 + 8), 0x536c, '$2A6998 `536C` subq.w #$1,(d16,A4) is the DELAY, a '
      + 'different field -- the ($1A,A5) writes are not a countdown of this script');
    // ...and $2A7088, in phase A's exit, is the WORD subtract that consumes it.
    assert.equal(w(0x2a7088), 0x536d, '$2A7088 `536D` subq.w #$1,(d16,A5)');
    assert.equal(w(0x2a708a), 0x001a, '  ...($1A,A5): a WORD, whose HIGH byte A4 $D writes');
    assert.equal(w(0x2a708c) & 0xff00, 0x6600, '  ...$2A708C bne, so zero is what fires the death');

    // ---- THE ARITHMETIC, checked against the run: gun 8 starts on 1537 and the write puts
    // $04 in the high byte, so the death lands $04xx frames later, inside the SECOND lap.
    assert.equal(2608 - 1537, 0x42f,
      'the death fires 1,071 = $42F frames after $2A69A6 wrote $04 over the high byte');

    // ---- WHERE IT GOES. A4 3 (phase A's death tail), A4 4 (which writes phase B), A4 $F.
    // W406 CORRECTION: $F is no longer last -- it now RUNS, and hands to $11.
    // W407 CORRECTION: $11 and $10 run too, so the history ends one link further round.
    assert.deepEqual(r.a4.slice(-8, -1).map(([, v]) => v),
      ['b', '3', '4', 'f', '11', '10', '5'],
      'A4 $B is torn down mid-run by $2A7032 a4Clear2598A2, and the tail runs 3 -> 4 -> $F. '
      + 'W408 CORRECTION: gun $A is ported, so phase B runs on to its OWN timeout and A4 5 '
      + 'takes over on 4447');
    assert.equal(w(0x2a7074), 0x7003, '$2A7074 `7003` moveq #$3,D0 -- phase A\'s death tail');
    assert.equal(w(0x2a7076), 0x4ef9, '  ...$2A7076 `4EF9` JMP, not jsr: it never comes back');
    assert.equal(l(0x2a7078), 0x0025980c, '  ...$25980C');
    assert.equal(w(0x2a640c), 0x700f, '$2A640C `700F` moveq #$F,D0 -- A4 script 4\'s hand-over');
    assert.equal(l(0x2a6410), 0x0025980c, '  ...jsr $25980C');

    // ---- **WHICH KIND OF STOP.** W408: gun $A is ported too, so phase B's gun loop stops the
    // path nowhere -- it runs on to phase B's OWN timeout and stops one unit further, at A4
    // script 5. The three tests are the same three.
    // W409 CORRECTION: A4 script 5 is ported, so there is no stop. It takes the slot on
    // 4447 and 442 frames later `$2A6466 jsr $2595E8` ends the stage.
    assert.equal(r.stopped, null, 'nothing throws anywhere in 8,000 frames');
    assert.equal(r.a4[r.a4.length - 2][0], 4447, 'A4 script 5 takes the slot on 4447');
    assert.equal(r.suspend, 4889, '  ...and $2595E8 fires 442 frames later');
    //   (a) it is a live table entry the cartridge dispatches through;
    assert.equal(l(HIBACHI_A4.table + 5 * 8), 0x2a6418, '(a) $2A5886[5].init IS $2A6418');
    assert.equal(w(0x2a6418), 0x303c,
      '  ...and `303C move.w #imm,D0` stands there: ordinary code, not an rts, not a park');
    //   (b) something the cartridge wrote is what routed us there -- phase B's death tail;
    assert.equal(w(0x2a728a), 0x7005, '(b) $2A728A `7005` moveq #$5,D0');
    assert.equal(l(0x2a728e), 0x0025980c, '  ...$2A728C jmp $25980C, a TAIL call');
    //   (c) and gun $A, which W405 and W407 both stopped in front of, now runs.
    assert.equal(w(0x2a6a90), 0x700a, '(c) $2A6A90 `700A` moveq #$A,D0 -- A4 $10 starts gun $A');
    assert.equal(l(0x2a6a94), 0x00259a18, '  ...$2A6A92 jsr $259A18');
    assert.equal(HIBACHI_A1_COUNTED[0x0a], undefined,
      '  ...and hibachiguns.js no longer counts it: W408 runs it');
    // W409: and A4 script 5 IS registered now, which is why there is no stop left to name.
    const reg = new Set(scriptAddresses());
    assert.ok(reg.has(0x2a6418) && reg.has(0x2a6458),
      'A4 script 5 -- both halves -- is registered by src/hibachiend.js');
    // ...while everything W405's, W406's, W407's and W408's stops stood on now is.
    assert.ok(reg.has(0x2a6a30) && reg.has(0x2a89ba), 'A4 $F and gun 9 both ARE registered');
    assert.ok(reg.has(0x2a6ab6) && reg.has(0x2a8c9a), '  ...and A4 $11 and gun $B');
    assert.ok(reg.has(0x2a6a76) && reg.has(0x2a8b7c), '  ...and A4 $10 and gun $A');
  });

test('W405 SECTION 3: 3,745 bullets, and every count is somebody\'s volley arithmetic',
  { skip: SKIP }, () => {
    const r = runReal(realPath(), 8000);
    // W406 CORRECTION: 4,865 -- gun 9's 1,120 on top of this wave's 3,745.
    // W407 CORRECTION: 8,105 -- gun $B's 3,240 on top of that.
    // W408 CORRECTION: 8,825 -- gun $A's 720 on top of that. Each later half is checked in its
    // own wave's file; the counts below are unchanged.
    assert.equal(r.shots, 8825, 'the run fires 8,825 where W404\'s fired 1,260');
    // ---- GUN 7. THREE blocks x their own volley counts, four shots each.
    // ($4,A4) = $1D, and `$2A8634 cmpi.b #$3B / bcc.s` lets `$2A863C addi.b #$F` raise the
    // RELOAD twice before it sticks: $1D -> $2C -> $3B. So 30 + 45 + 60 = 135 volleys.
    assert.equal(IMG[HIBACHI_A1.gun7Template + 2], 0x1d, 'gun 7\'s template ($4,A4) is $1D');
    assert.equal(0x1d + 1 + (0x2c + 1) + (0x3b + 1), 135, '  ...30 + 45 + 60 volleys');
    for (const site of [0x2a85b8, 0x2a85d8, 0x2a85f2, 0x2a8612]) {
      assert.equal(r.bySite.get(site), 135,
        `$${site.toString(16)}: one shot a volley x 135 -- four sites, two records, two each`);
    }
    // ---- GUN 8. ($4,A4) = $4F, so eighty volleys of fourteen -- and NONE of the three-shot
    // aimed bursts, because the range gate declines every one of them on this bench.
    assert.equal(IMG[HIBACHI_A1.gun8Template + 2], 0x4f, 'gun 8\'s template ($4,A4) is $4F');
    assert.equal(r.bySite.get(0x2a8900), 80 * 7, '$2A8900: 80 volleys x 7 ring passes');
    assert.equal(r.bySite.get(0x2a891c), 80 * 7, '$2A891C: and its opposite-heading twin');
    for (const site of [0x2a88a8, 0x2a88b6, 0x2a88c4]) {
      assert.equal(r.bySite.get(site), undefined,
        `$${site.toString(16)} never fired: the player sits at Y = 0 and $2A8882 compares it `
        + 'UNSIGNED against bossY + $D800 = $1000, so the burst is declined every volley');
    }
    // ---- and gun 5 ran TWICE, the second time with its own ramp applied, which is the
    // clearest single proof that the loop came back round.
    assert.equal(r.bySite.get(0x2a82ca), 40 * 13 + 50 * 13,
      'gun 5\'s sweep: 40 volleys the first lap and FIFTY the second -- ($1DA,A6) rose by $A '
      + 'at $2A831A and $2A81EC adds it to ($4,A4)');
    assert.equal(135 * 4 + 80 * 14, 540 + 1120, '  ...and 540 + 1,120 is what this wave added');
  });

// ===============================================================================================
// SECTION 4 -- GUN 7 DRIVEN, WITH THE RECORDS READ BACK.
// ===============================================================================================

const A4SLOT = SCHED.a1Base;

function gunBench({ freeze = 0, p1 = 0x8000, p2 = 0x0000, py = 0x2000, px = 0x2400 } = {}) {
  const ROM = new RomWindows(tables.rom);
  const ram = new Ram();
  const shots = [];
  const ctx = { bulletSpawn: (site, res) => shots.push([site, res]) };
  ram.setU16(HIBACHI_A1.freeze, freeze);
  ram.setU16(HIBACHI_A1.selP1, p1);
  ram.setU16(HIBACHI_A1.selP1 + 2, py);
  ram.setU16(HIBACHI_A1.selP1 + 4, px);
  ram.setU16(HIBACHI_A1.selP2, p2);
  ram.setU32(SUB + 0x02, 0x38001c00);
  ram.setU16(A4SLOT, 0x8007);
  return { ROM, ram, ctx, shots };
}

/** The bullet RECORD, not the call. Counting shots is what let W404's first ablation pass go
 *  22-green; these are the fields `$281554` actually wrote. */
const rec = (ram, entry) => {
  const a = entry[1][0].addr;
  return {
    site: entry[0],
    kind: ram.u16(a + BREC.typeWord) & 0x3f,
    dir: ram.u8(a + BREC.dir),
    speed: ram.u8(a + BREC.speed),
    posA: ram.u16(a + BREC.posA),
    posB: ram.u16(a + BREC.posB),
    p28: ram.u32(a + BREC.param28),
    p2c: ram.u32(a + BREC.param2c),
    p36: ram.u16(a + BREC.param36),
  };
};
/** kind N's base speed, out of `$281956`'s template, so a speed is checked and not assumed. */
const baseSpeed = (kind) => w(l(0x281956 + 4 * kind) + 0x0e);
/** `$242E24` without calling the port's copy: bump the counter and read the image. */
const peek242E24 = (ram) => IMG[0x242e42 + ((ram.u8(RNG.counter) + 1) & 0x7f)];
/** `$242B90`, the D5-returning twin of `$242B3C`: NO mask, table $242BAC. */
const peek242B90 = (ram) => IMG[0x242bac + ((ram.u8(RNG.counter) + 1) & 0xffff)];

test('W405 SECTION 4: gun 7\'s init is NINE template words, one ADD and one SUB', { skip: SKIP },
  () => {
    const b = gunBench();
    gun7Init2A8516(b.ram, b.ROM, A4SLOT, SUB);
    for (let i = 0; i < 9; i++) {
      const want = w(HIBACHI_A1.gun7Template + i * 2);
      if (i === 4 || i === 6) continue;               // ($A,A4) and ($9,A4) are ramped below
      assert.equal(b.ram.u16(A4SLOT + 2 + i * 2), want, `template word ${i}`);
    }
    // TRAP 3: one word literal covering two byte fields, four times over.
    assert.equal(b.ram.u16(A4SLOT + 0x04), 0x1d1d, '($4,A4)/($5,A4) are ONE word $1D1D');
    assert.equal(b.ram.u8(A4SLOT + 0x06), 0x02, '($6,A4) is the block index 2...');
    assert.equal(b.ram.u8(A4SLOT + 0x08), 0x01, '  ...($8,A4) the in-block gap 1...');
    assert.equal(b.ram.u16(A4SLOT + 0x12), 0x0040, '  ...and ($12,A4) the cursor $40');
    assert.equal(b.ram.u32(A4SLOT + 0x0a), 0x00050003,
      '($A,A4) is the long $00050003 -- {speed bias 5, bullet KIND 3}');

    // THE TWO RAMPS, and they pull OPPOSITE ways. `$2A852A add.w` raises the bias; `$2A8532
    // sub.b` LOWERS the between-block pause. Both A6 fields at their ceilings.
    const c = gunBench();
    c.ram.setU8(SUB + 0x1e7, 0x18);                   // $10 + $8, the cap the retire allows
    c.ram.setU16(SUB + 0x1ec, 0x000c);
    gun7Init2A8516(c.ram, c.ROM, A4SLOT, SUB);
    assert.equal(c.ram.u16(A4SLOT + 0x0a), 0x0005 + 0x000c, '($1EC,A6) ADDS to ($A,A4)');
    assert.equal(c.ram.u8(A4SLOT + 0x09), (0x30 - 0x18) & 0xff,
      '  ...and ($1E7,A6) SUBTRACTS from ($9,A4): $2A8532 is `912C`, sub.b D0,(d16,A4)');
    assert.equal(w(0x2a8532), 0x912c, '  ...which is what `912C` is, and not an add');
    assert.equal(c.ram.u16(A4SLOT + 0x0c), 0x0003, 'and the KIND half is untouched by either');
  });

test('W405 SECTION 4: gun 7 fires FOUR, from TWO records, at aim + a and aim - 0.625a',
  { skip: SKIP }, () => {
    const b = gunBench();
    gun7Init2A8516(b.ram, b.ROM, A4SLOT, SUB);
    const run = () => gun7Step2A8538(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    // ($2,A4) opens at $60 and the body runs on the BORROW, so 97 steps and not 96.
    for (let i = 0; i < 0x60; i++) { run(); assert.equal(b.shots.length, 0, 'nothing yet'); }
    run();
    assert.equal(b.shots.length, 4, 'four shots -- two records, two shots each');

    const all = b.shots.map((e) => rec(b.ram, e));
    assert.deepEqual(all.map((s) => s.site), [0x2a85b8, 0x2a85d8, 0x2a85f2, 0x2a8612],
      'the four call sites, in ROM order');
    // ---- THE AIM, recomputed with src/aim.js. There is NO position bias here: gun 5 adds
    // $F0C0 to its own Y before aiming and gun 7 goes straight from `movem.w ($2,A6)`.
    const t = new AimTables(b.ROM);
    const aim = aim256(t, 0x3800, 0x1c00, 0x2000, 0x2400);
    // ---- THE TWO RECORDS. Block index 2 -> $2A86E0, cursor $40 -> records 8 and 9.
    const block = l(HIBACHI_A1.gun7Blocks + 2 * 4);
    assert.equal(block, 0x2a86e0, '($6,A4) = 2 picks $2A86E0');
    const mirror = (a) => {
      let d4 = a >> 1;                                // asr.w #$1 -- toward MINUS INFINITY
      let d5 = a + d4;
      d4 >>= 2;                                       // asr.w #$2
      d5 += d4;
      return d5;
    };
    for (const [n, off] of [[0, 0x40], [1, 0x48]]) {
      const delta = l(block + off);
      const ang = sw(block + off + 6);
      const first = all[n * 2], second = all[n * 2 + 1];
      assert.equal(first.dir, u8(aim + ang), `record ${n}: the first shot is aim + ${ang}`);
      assert.equal(second.dir, u8(u16(aim + ang) - u16(mirror(ang))),
        `  ...and the second is that MINUS 1.625 x ${ang}, not minus ${ang}`);
      // both shots of a pair share the record's position delta.
      assert.equal(first.posA, u16(0x3800 + (delta >>> 16)), '  ...posA is ($2,A6) + delta high');
      assert.equal(first.posB, u16(0x1c00 + (delta & 0xffff)), '  ...posB its low word');
      assert.equal(second.posA, first.posA, '  ...and the mirror shot spawns at the SAME place');
      assert.equal(second.posB, first.posB, '  ...on both axes');
      assert.equal(first.p28, delta >>> 0, '  ...and $2818B4 stores D3 at ($28) unchanged');
      // ---- THE KINDS AND THE SPEEDS, which is where the two halves of the longword show.
      assert.equal(first.kind, 3, '  ...($C,A4) = kind 3 for the first shot');
      assert.equal(second.kind, 4, '  ...and ($10,A4) = kind 4 for the mirror, a DIFFERENT field');
      assert.equal(first.speed, u8(baseSpeed(3) + 5 + w(block + off + 4)),
        '  ...speed = kind 3 base + ($A,A4) 5 + the record\'s own bias word');
      assert.equal(second.speed, u8(baseSpeed(4) + 5 + w(block + off + 4) + 2),
        '  ...and the mirror adds ($E,A4) = 2 on top');
    }
    // ---- THE CURSOR STEPPED ONCE, by $10, for the TWO records it just spent.
    assert.equal(b.ram.u16(A4SLOT + 0x12), 0x30, '($12,A4) went $40 -> $30');
    assert.equal(b.ram.u8(A4SLOT + 0x02), 0x01, 'and ($2,A4) reloaded from ($8,A4) = 1');
  });

test('W405 SECTION 4: the cursor walks $40,$30,$20,$10,$0 and wraps to $40, and the BLOCK '
  + 'changes only when the volley counter borrows', { skip: SKIP }, () => {
  const b = gunBench();
  gun7Init2A8516(b.ram, b.ROM, A4SLOT, SUB);
  const run = () => gun7Step2A8538(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
  for (let i = 0; i < 0x60; i++) run();
  const seen = [];
  for (let v = 0; v < 7; v++) {
    seen.push(b.ram.u16(A4SLOT + 0x12));
    b.shots.length = 0;
    poolClear(b.ram);
    for (let i = 0; i < 2; i++) run();
  }
  assert.deepEqual(seen, [0x40, 0x30, 0x20, 0x10, 0x00, 0x40, 0x30],
    'FIVE positions, walked down by $10, wrapping through $40 -- a wrap to $50 would read '
    + 'sixteen bytes past the end of the block on every fifth volley');
  assert.equal(b.ram.u8(A4SLOT + 0x06), 0x02, 'and ($6,A4) has not moved: seven volleys in');
});

test('W405 SECTION 4: gun 7 walks THREE blocks, ramps its reload $1D -> $2C -> $3B, and RETIRES',
  { skip: SKIP }, () => {
    const b = gunBench();
    gun7Init2A8516(b.ram, b.ROM, A4SLOT, SUB);
    const blocks = [];
    const reloads = [];
    let n = 0;
    let prev = b.ram.u8(A4SLOT + 0x06);
    blocks.push(prev);
    reloads.push(b.ram.u8(A4SLOT + 0x05));
    while (b.ram.u16(A4SLOT) !== 0 && n < 5000) {
      poolClear(b.ram);
      gun7Step2A8538(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      n += 1;
      const cur = b.ram.u8(A4SLOT + 0x06);
      if (cur !== prev) { blocks.push(cur); reloads.push(b.ram.u8(A4SLOT + 0x05)); prev = cur; }
    }
    assert.equal(b.ram.u16(A4SLOT), 0, '$2A8676 moveq #$7 / jsr $259B08 cleared the slot');
    assert.deepEqual(blocks, [2, 1, 0, 0xff],
      '($6,A4) walks 2, 1, 0 and then BORROWS to $FF, which is the retire');
    assert.deepEqual(reloads, [0x1d, 0x2c, 0x3b, 0x3b],
      '($5,A4) is raised by $F at $2A863C and `cmpi.b #$3B / bcc.s` stops it AT $3B');
    assert.equal(b.shots.filter(([s]) => s === 0x2a85b8).length, 30 + 45 + 60,
      '  ...so the three blocks are 30, 45 and 60 volleys');
    // THE TWO RAMPS IT LEAVES ON A6, which its own next init reads back.
    assert.equal(b.ram.u8(SUB + 0x1e7), 0x08, '($1E7,A6) advanced by 8 at $2A8666');
    assert.equal(b.ram.u16(SUB + 0x1ec), 0x0002, '  ...and ($1EC,A6) by 2 at $2A8672');
  });

// -----------------------------------------------------------------------------------------------
// The four shapes that survived the first ablation pass. Every one of them needed a test that
// drives a DIFFERENT block or reads a field the earlier tests did not, which is the trap-21
// lesson restated: a mutation that comes back green is a hole in the test, not in the ROM.
// -----------------------------------------------------------------------------------------------

test('W405 SECTION 4 (ablation): the mirror rounds toward MINUS INFINITY, seen on block 1\'s '
  + 'ODD angles', { skip: SKIP }, () => {
  // Block index 2 -- the one the shipped template opens on -- holds only EVEN angles, and for
  // even angles `asr.w` and a truncating divide agree. Block 1 has +-7, and `-7 asr 1` is -4
  // where `trunc(-7/2)` is -3. So this is the only place in the whole gun where the rounding
  // rule is observable at all, and it takes driving ($6,A4) = 1 to reach it.
  const b = gunBench();
  gun7Init2A8516(b.ram, b.ROM, A4SLOT, SUB);
  b.ram.setU8(A4SLOT + 0x06, 1);                     // block 1: $2A8730
  b.ram.setU16(A4SLOT + 0x12, 0x10);                 // cursor $10 -> records 2 and 3
  for (let i = 0; i < 0x61; i++) gun7Step2A8538(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
  const all = b.shots.map((e) => rec(b.ram, e));
  assert.equal(all.length, 4, 'four shots');
  const block = l(HIBACHI_A1.gun7Blocks + 1 * 4);
  assert.deepEqual([sw(block + 0x10 + 6), sw(block + 0x18 + 6)], [7, -7],
    'records 2 and 3 of $2A8730 are +7 and -7 -- ODD, which block 2 never is');
  const t = new AimTables(b.ROM);
  const aim = aim256(t, 0x3800, 0x1c00, 0x2000, 0x2400);
  // +7: asr(7,1) = 3, 7 + 3 = 10, asr(3,2) = 0, so 1.625*7 truncates to 10 either way.
  assert.equal(all[1].dir, u8(u16(aim + 7) - 10), 'the +7 mirror lands at aim + 7 - 10');
  // -7: asr(-7,1) = -4 (NOT -3), -7 + -4 = -11, asr(-4,2) = -1, so the total is -12.
  assert.equal(all[3].dir, u8(u16(aim - 7) - u16(-12)),
    'the -7 mirror lands at aim - 7 + 12, which is what the two ARITHMETIC shifts give; a '
    + 'truncating divide would put it one notch away, at +11');
  assert.notEqual(u16(-12), u16(-11), '  ...and the two answers really do differ');
});

test('W405 SECTION 4 (ablation): ($3,A5) toggles once per BLOCK, and ($A,A4) rises by 2 with it',
  { skip: SKIP }, () => {
    const b = gunBench();
    gun7Init2A8516(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU8(REC + 0x03, 0);
    const toggles = [];
    const biases = [];
    let prevBlock = b.ram.u8(A4SLOT + 0x06);
    let n = 0;
    while (b.ram.u16(A4SLOT) !== 0 && n < 5000) {
      poolClear(b.ram);
      gun7Step2A8538(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      n += 1;
      const cur = b.ram.u8(A4SLOT + 0x06);
      if (cur !== prevBlock) {
        toggles.push(b.ram.u8(REC + 0x03));
        biases.push(b.ram.u16(A4SLOT + 0x0a));
        prevBlock = cur;
      }
    }
    assert.deepEqual(toggles, [1, 0, 1],
      '$2A862E bchg #$0,($3,A5) fires on the VOLLEY-COUNTER borrow, so exactly three times in '
      + 'a whole gun run -- not once a volley, which would be 135');
    assert.deepEqual(biases, [7, 9, 11],
      '$2A8648 addq.w #$2,($A,A4) rides the same borrow: 5, then 7, 9, $B');
    // ...and the bias really reaches the bullets, which is the half a slot read cannot see.
    const c = gunBench();
    gun7Init2A8516(c.ram, c.ROM, A4SLOT, SUB);
    let m = 0;
    while (c.ram.u8(A4SLOT + 0x06) === 2 && m < 5000) {
      poolClear(c.ram);
      gun7Step2A8538(c.ram, c.ROM, c.ctx, A4SLOT, REC, SUB); m += 1;
    }
    c.shots.length = 0;
    poolClear(c.ram);
    while (c.shots.length === 0 && m < 5000) {
      gun7Step2A8538(c.ram, c.ROM, c.ctx, A4SLOT, REC, SUB); m += 1;
    }
    const after = c.shots.map((e) => rec(c.ram, e));
    assert.equal(after.length, 4, 'the first volley of the NEXT block');
    assert.equal(after[0].speed, u8(baseSpeed(3) + 5 + 2),
      '  ...and its kind-3 shot is TWO faster than the last block\'s, straight out of ($A,A4)');
    assert.equal(after[0].kind, 3, '  ...and still kind 3, so it is the bias that moved');
  });

test('W405 SECTION 4 (ablation): the record BIAS word is a real field, and every one of the '
  + 'forty is zero -- a labelled equivalence', { skip: SKIP }, () => {
  // `$2A85AE D05B add.w (A3)+,D0` is transcribed, and NOTHING can observe it: all forty of the
  // records the four blocks hold carry $0000 there. Deleting the add from the port is therefore
  // an ablation that no test can turn red, and saying so is the honest answer.
  //
  // What CAN be nailed down is (a) that the instruction is an `add.w` into D0's swapped half,
  // i.e. the speed and not the kind, and (b) that the data really is all zeros -- and
  // `export-tables.py` fails loudly if a future build changes one, which turns an
  // unobservable transcription into a guarded one.
  assert.equal(w(0x2a85ae), 0xd05b, '$2A85AE `D05B` add.w (A3)+,D0');
  assert.equal(w(0x2a85ac), 0x4840, '  ...between two `swap D0`s, so it lands on the BIAS half');
  let zeros = 0;
  for (let bIdx = 0; bIdx < 4; bIdx++) {
    const p = l(HIBACHI_A1.gun7Blocks + bIdx * 4);
    for (let r = 0; r < 10; r++) if (w(p + r * 8 + 4) === 0) zeros += 1;
  }
  assert.equal(zeros, 40, 'all forty bias words are $0000 in this build');
});

test('W405 SECTION 4: gun 7\'s two A6 ramps stop AT their caps, one below and at', { skip: SKIP },
  () => {
    const retire = (e7, ec) => {
      const b = gunBench();
      b.ram.setU8(SUB + 0x1e7, e7);
      b.ram.setU16(SUB + 0x1ec, ec);
      gun7Init2A8516(b.ram, b.ROM, A4SLOT, SUB);
      let n = 0;
      while (b.ram.u16(A4SLOT) !== 0 && n < 5000) {
        poolClear(b.ram);
        gun7Step2A8538(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB); n += 1;
      }
      return b.ram;
    };
    let r = retire(0x08, 0x0009);
    assert.equal(r.u8(SUB + 0x1e7), 0x10, '$8 + $8 = $10, exactly the cap');
    assert.equal(r.u16(SUB + 0x1ec), 0x0b, '$9 + 2 = $B');
    r = retire(0x10, 0x000b);
    assert.equal(r.u8(SUB + 0x1e7), 0x10, '$2A865E cmpi.b #$10 / bcc.s -- AT the cap it stops');
    assert.equal(r.u16(SUB + 0x1ec), 0x0b, '$2A866A cmpi.w #$B / bcc.s');
  });

test('W405 SECTION 4: with both players dead gun 7 fires nothing AND does not step its cursor',
  { skip: SKIP }, () => {
    const b = gunBench({ p1: 0, p2: 0 });
    gun7Init2A8516(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU8(REC + 0x03, 0);
    for (let i = 0; i < 0x61; i++) gun7Step2A8538(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.shots.length, 0, '$2A856E bpl.w declines the volley...');
    assert.equal(b.ram.u16(A4SLOT + 0x12), 0x40,
      '  ...and it lands on $2A8626, PAST $2A8618, so the cursor does not advance');
    assert.equal(b.ram.u8(A4SLOT + 0x04), 0x1c, '  ...but the volley counter still counts down');
    assert.equal(b.ram.u8(REC + 0x03), 0,
      '  ...and ($3,A5) is NOT toggled: gun 7\'s bchg is at $2A862E, behind the volley '
      + 'counter, where gun 6\'s is on the join and gun 5\'s is on the aimed arm');
  });

// ===============================================================================================
// SECTION 5 -- GUN 8.
// ===============================================================================================

test('W405 SECTION 5: gun 8\'s init is EIGHT words, a $20-biased draw, and a DEAD negate',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU16(A4SLOT, 0x8008);
    const draw = peek242E24(b.ram);
    gun8Init2A8800(b.ram, b.ROM, A4SLOT, SUB);
    assert.equal(b.ram.u16(A4SLOT + 0x04), 0x4f4f, '($4,A4)/($5,A4) are ONE word $4F4F');
    assert.equal(b.ram.u32(A4SLOT + 0x0c), 0x000a0017,
      '($C,A4) is the long $000A0017 -- {speed bias $A, bullet KIND $17 = 23}');
    assert.equal(b.ram.u8(A4SLOT + 0x10), u8(draw - 0x20),
      '($10,A4) is $242E24\'s byte MINUS $20 -- gun 5 adds $60 to the same draw');
    assert.equal(w(0x2a8816), 0x0400, '  ...$2A8816 `0400` subi.b, not addi');
    // **W416/D48 REPLACES THE REASON THIS PAIR USED TO GIVE.**  It said "$242EC2 has no ext.w,
    // so $2A8824 bpl.w is always taken".  `bpl` reads N, and $242ED6 `1030` move.b is the last
    // instruction in $242EC2 to write N, so N is bit 7 of the TABLE BYTE.  This bench starts
    // $803916 at 0 and draws $242EDE[1] = $10, whose bit 7 is clear, so the value below is
    // right for THIS bench and is not a property of the routine.
    assert.equal(w(0x242ed6), 0x1030, '$242ED6 `1030` move.b -- the last CCR write in $242EC2');
    assert.equal(IMG[0x242ede + 1] & 0x80, 0, '  ...and $242EDE[1] has bit 7 CLEAR on this bench');
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0x03,
      '($11,A4) stays $03 when the drawn byte is positive; w416rngsignbit sweeps all 256 '
      + 'counter states and gets $03 x128 and $FD x128');
    // ...and the two words the template holds that NOTHING in $2A8800..$2A898B reads.
    assert.equal(b.ram.u16(A4SLOT + 0x08), 0x0000, '($8,A4) is copied...');
    assert.equal(b.ram.u16(A4SLOT + 0x0a), 0x000c, '  ...and ($A,A4), and neither is ever read: '
      + 'the only slot longword the body loads is $2A88CE move.l ($C,A4),D0');

    const c = gunBench();
    c.ram.setU8(SUB + 0x1ee, 0x28);
    gun8Init2A8800(c.ram, c.ROM, A4SLOT, SUB);
    assert.equal(c.ram.u8(A4SLOT + 0x04), u8(0x4f + 0x28), '($1EE,A6) adds to ($4,A4)');
    assert.equal(c.ram.u8(A4SLOT + 0x05), u8(0x4f + 0x28), '  ...and to ($5,A4), which IS read');
  });

test('W405 SECTION 5: the ring is 14 shots at SEVEN vectors, paired at opposite headings',
  { skip: SKIP }, () => {
    const b = gunBench({ py: 0x0000, px: 0x2400 });   // below the line: the burst is declined
    b.ram.setU16(A4SLOT, 0x8008);
    gun8Init2A8800(b.ram, b.ROM, A4SLOT, SUB);
    const start = b.ram.u8(A4SLOT + 0x10);
    const run = () => gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    for (let i = 0; i < 0x60; i++) { run(); assert.equal(b.shots.length, 0, 'nothing yet'); }
    run();
    assert.equal(b.shots.length, 14, 'fourteen -- seven dbra passes, two shots each');

    const all = b.shots.map((e) => rec(b.ram, e));
    assert.deepEqual(all.map((s) => s.site),
      [0x2a8900, 0x2a891c, 0x2a8900, 0x2a891c, 0x2a8900, 0x2a891c, 0x2a8900,
        0x2a891c, 0x2a8900, 0x2a891c, 0x2a8900, 0x2a891c, 0x2a8900, 0x2a891c],
      'the two sites strictly alternate');
    // ---- THE ANGLES. `subi.w #$2D` once, then `addi.w #$F` per pass, and the second shot of
    // each pass is at +$80 -- half a turn -- from the first.
    const dirs = [];
    for (let k = 0; k < 7; k++) dirs.push(u8(start - 0x2d + 0x0f * k));
    assert.deepEqual(all.filter((_, i) => i % 2 === 0).map((s) => s.dir), dirs,
      'the seven outward headings');
    assert.deepEqual(all.filter((_, i) => i % 2 === 1).map((s) => s.dir),
      dirs.map((d) => u8(d + 0x80)),
      '  ...and each inward twin is exactly $80 -- half a turn -- from its own pass');
    // ---- THE POSITION. Both shots of a pass share ONE $26BFFC vector, computed from the
    // OUTWARD angle, because $2A88F0 indexes the table BEFORE $2A8914 adds the $80.
    for (let k = 0; k < 7; k++) {
      const v = (l(HIBACHI_A1.vectors + (u16(dirs[k] + 2) & 0xfc)) + 0xd8000000) >>> 0;
      assert.equal(all[k * 2].posA, u16(0x3800 + (v >>> 16)), `pass ${k}: posA`);
      assert.equal(all[k * 2].posB, u16(0x1c00 + (v & 0xffff)), `  ...posB`);
      assert.equal(all[k * 2 + 1].posA, all[k * 2].posA, '  ...and the twin spawns THERE too');
      assert.equal(all[k * 2 + 1].posB, all[k * 2].posB, '  ...on both axes');
      assert.equal(all[k * 2].p28, v, '  ...and $2818F4 stores the same D3 at ($28)');
    }
    // ---- THE KINDS AND THE SPEED RAMP. Kind 23 outward, 24 inward, and the bias falls by 2
    // a pass without ever being reloaded: the last pair is at $FFFE, i.e. NEGATIVE.
    assert.deepEqual(all.map((s) => s.kind),
      [23, 24, 23, 24, 23, 24, 23, 24, 23, 24, 23, 24, 23, 24], 'kinds 23 and 24 alternate');
    const speeds = [];
    for (let k = 0; k < 7; k++) {
      speeds.push(u8(baseSpeed(23) + u16(0x000a - 2 * k)));
      speeds.push(u8(baseSpeed(24) + u16(0x000a - 2 * k - 2)));
    }
    assert.deepEqual(all.map((s) => s.speed), speeds,
      'bias $A, then two less every pass -- $2A890A subq.w #$2 is never undone, only the '
      + 'KIND is put back by $2A8926');
    // ---- AND THE TWO CONSTANTS kind 23/24\'s spawn-init $2818F4 actually reads.
    assert.deepEqual(all.filter((_, i) => i % 2 === 0).map((s) => [s.p2c, s.p36]),
      Array.from({ length: 7 }, () => [0x02020020, 0x0042]),
      '$2A88F6 move.l #$02020020,D4 and $2A88FC move.w #$42,D5 reach ($2C) and ($36)');
    assert.deepEqual(all.filter((_, i) => i % 2 === 1).map((s) => [s.p2c, s.p36]),
      Array.from({ length: 7 }, () => [0x2c03ffe0, 0x002e]),
      '  ...and the inward shot carries $2C03FFE0 / $2E, which is a different behaviour');
  });

test('W405 SECTION 5: the three-shot burst is gated on an UNSIGNED range test', { skip: SKIP },
  () => {
    // bossY = $3800, so the line is $3800 + $D800 = $1000. A player at $1000 passes; $FFF does
    // not, and both arms have to be driven because `bcs` is unsigned and a signed reading
    // would put every large Y on the other side.
    const drive = (py) => {
      const b = gunBench({ py });
      b.ram.setU16(A4SLOT, 0x8008);
      gun8Init2A8800(b.ram, b.ROM, A4SLOT, SUB);
      for (let i = 0; i < 0x61; i++) gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      return b;
    };
    assert.equal(u16(0x3800 + 0xd800), 0x1000, 'the line is bossY + $D800 = $1000');
    assert.equal(drive(0x1000).shots.length, 17, 'a player AT the line gets 3 + 14');
    assert.equal(drive(0x0fff).shots.length, 14, '  ...one below it gets the ring only');
    assert.equal(drive(0x9000).shots.length, 17,
      '  ...and a player at $9000 -- NEGATIVE as a signed word -- still gets the burst, which '
      + 'is what makes $2A8884 `6544` bcs and not bge');
    assert.equal(w(0x2a8884), 0x6544, '  ...and `6544` is bcs.s, the unsigned arm');

    // THE BURST ITSELF, read back, with the RNG driven to BOTH halves of $242BAC. `asr.b #$1`
    // is an ARITHMETIC shift, so a drawn byte of $F0 has to jitter the aim by -8 and not by
    // +$78 -- and a table byte below $80 cannot tell those two apart, which is exactly how a
    // first-pass ablation of the sign survived.
    const lowIdx = [...Array(0x100).keys()].find((i) => i >= 1 && IMG[0x242bac + i] < 0x80);
    const highIdx = [...Array(0x100).keys()].find((i) => i >= 1 && IMG[0x242bac + i] >= 0x80);
    assert.ok(lowIdx !== undefined && highIdx !== undefined, '$242BAC holds bytes of both signs');
    const t = new AimTables(new RomWindows(tables.rom));
    const aim = aim256(t, u16(0x3800 + 0xd800), 0x1c00, 0x1000, 0x2400);
    for (const [label, idx] of [['positive', lowIdx], ['NEGATIVE', highIdx]]) {
      const b = gunBench({ py: 0x1000, px: 0x2400 });
      b.ram.setU16(A4SLOT, 0x8008);
      gun8Init2A8800(b.ram, b.ROM, A4SLOT, SUB);
      for (let i = 0; i < 0x60; i++) gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      // $2433AE's whole state is the one word at $803916, and $242B90 bumps its low byte and
      // then indexes with the WHOLE word, so seeding the word picks the byte.
      b.ram.setU16(RNG.state, u16(idx - 1));
      const jitter = peek242B90(b.ram);
      assert.equal(jitter, IMG[0x242bac + idx], `the ${label} draw is $${jitter.toString(16)}`);
      b.shots.length = 0;
      poolClear(b.ram);
      gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      const burst = b.shots.map((e) => rec(b.ram, e)).slice(0, 3);
      const d1 = u8(aim + (i8(jitter) >> 1));
      assert.deepEqual(burst.map((s) => s.dir), [d1, u8(d1 - 2), u8(d1 + 2)],
        `the three ${label} headings are a, a-2, a+2 around aim + (signed byte >> 1)`);
      assert.deepEqual(burst.map((s) => s.kind), [19, 19, 19], '  ...all three are kind $13 = 19');
      assert.deepEqual(burst.map((s) => s.speed),
        [8, 0xc, 0x10].map((v) => u8(baseSpeed(19) + v)),
        '  ...at biases 8, $C, $10: $2A888C move.l #$80013 and two addi.l #$40000');
      assert.deepEqual(burst.map((s) => s.posA), Array(3).fill(u16(0x3800 + 0xd800)),
        '  ...spawned at bossY + $D800, from $2A8896 move.l #$D8000000,D3');
      if (label === 'NEGATIVE') {
        assert.notEqual(u8(aim + (i8(jitter) >> 1)), u8(aim + (jitter >> 1)),
          '  ...and an UNSIGNED shift of the same byte would put the fan somewhere else');
      }
    }
  });

test('W405 SECTION 5: gun 8\'s sweep bounces at $30 and $D0, SIGNED, and only there',
  { skip: SKIP }, () => {
    const b = gunBench({ py: 0 });
    b.ram.setU16(A4SLOT, 0x8008);
    gun8Init2A8800(b.ram, b.ROM, A4SLOT, SUB);
    const volley = () => {
      poolClear(b.ram);
      for (let i = 0; i < 6; i++) gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    };
    for (let i = 0; i < 0x61; i++) gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    // Ascending. $30 itself must NOT reverse: `$2A8942 6E00` is bgt, a STRICT greater-than.
    b.ram.setU8(A4SLOT + 0x10, 0x2d);
    b.ram.setU8(A4SLOT + 0x11, 0x03);
    volley();
    assert.equal(b.ram.u8(A4SLOT + 0x10), 0x30, '$2D + 3 = $30');
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0x03, '  ...and bgt keeps $30 inside the band');
    volley();
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0xfd, '  ...$33 is the one that reverses');
    // Descending, and this is the arm a UNSIGNED compare would get wrong: $D0 is -48.
    b.ram.setU8(A4SLOT + 0x10, 0xd3);
    volley();
    assert.equal(b.ram.u8(A4SLOT + 0x10), 0xd0, '$D3 - 3 = $D0');
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0xfd, '  ...and `bge` keeps $D0 inside');
    volley();
    assert.equal(b.ram.u8(A4SLOT + 0x10), 0xcd, '  ...$CD is below it...');
    assert.equal(b.ram.u8(A4SLOT + 0x11), 0x03, '  ...so $2A8958 neg.b flips the step back');
    assert.equal(i8(0xd0), -48, 'and $D0 read as the cmpi.b immediate is -48, not 208');
  });

test('W405 SECTION 5 (ablation): the sweep crosses ZERO in both directions without reversing',
  { skip: SKIP }, () => {
    // The two limits above are checked at $30 and $D0, where a signed and an unsigned compare
    // AGREE. They disagree in the middle of the band: descending through $10, `bge #$D0` read
    // unsigned would reverse ($10 < $D0) where the signed one does not (16 >= -48); ascending
    // through $E0, `bgt #$30` read unsigned would reverse where the signed one does not. So
    // the sweep has to be walked ACROSS ZERO, both ways, for the sign to be observable.
    const walk = (from, step) => {
      const b = gunBench({ py: 0 });
      b.ram.setU16(A4SLOT, 0x8008);
      gun8Init2A8800(b.ram, b.ROM, A4SLOT, SUB);
      for (let i = 0; i < 0x61; i++) gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      b.ram.setU8(A4SLOT + 0x10, from);
      b.ram.setU8(A4SLOT + 0x11, step);
      const seen = [];
      for (let v = 0; v < 40; v++) {
        poolClear(b.ram);
        for (let i = 0; i < 6; i++) gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
        seen.push([b.ram.u8(A4SLOT + 0x10), b.ram.u8(A4SLOT + 0x11)]);
      }
      return seen;
    };
    const down = walk(0x10, 0xfd);
    const flipDown = down.findIndex(([, s]) => s !== 0xfd);
    assert.equal(down[flipDown][0], 0xce,
      'descending from $10 in steps of 3 the step survives $0D, $0A ... $01, $FE ... $D1 and '
      + 'only flips at $CE -- an unsigned `bge #$D0` would have reversed on the FIRST volley');
    assert.ok(down.slice(0, flipDown).some(([v]) => v > 0x00 && v < 0x30),
      '  ...and the walk really did pass through the small positive values');
    const up = walk(0xe0, 0x03);
    const flipUp = up.findIndex(([, s]) => s !== 0x03);
    assert.equal(up[flipUp][0], 0x31,
      'ascending from $E0 it survives $E3 ... $FF, $02 ... $2E and only flips at $31 -- an '
      + 'unsigned `bgt #$30` would have reversed on the first volley');
    assert.ok(up.slice(0, flipUp).some(([v]) => v >= 0x80),
      '  ...and that walk really did pass through the high, signed-negative values');
  });

test('W405 SECTION 5: gun 8 retires after eighty volleys, and the bsr into its OWN init draws '
  + 'TWICE from the shared RNG counter', { skip: SKIP }, () => {
  const b = gunBench({ py: 0 });
  b.ram.setU16(A4SLOT, 0x8008);
  gun8Init2A8800(b.ram, b.ROM, A4SLOT, SUB);
  let n = 0;
  let before = 0;
  let counterBefore = 0;
  while (b.ram.u16(A4SLOT) !== 0 && n < 5000) {
    poolClear(b.ram);
    before = b.ram.u8(A4SLOT + 0x04);
    counterBefore = b.ram.u8(RNG.counter);
    gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    n += 1;
  }
  assert.equal(b.ram.u16(A4SLOT), 0, '$2A8982 moveq #$8 / jsr $259B08 cleared the slot');
  assert.equal(b.shots.filter(([s]) => s === 0x2a8900).length, 80 * 7,
    'eighty volleys of seven passes -- ($4,A4) is $4F and the subtract has to BORROW');
  assert.equal(before, 0, '  ...and the last one is the frame ($4,A4) was already 0');
  // **THE OBSERVABLE HALF OF `$2A896A bsr.w $2A8800`.** Everything it writes to the slot is
  // dead, but $242E24 and $242EC2 both bump $803917, so the retire frame advances the shared
  // counter by TWO more than an ordinary frame would.
  assert.equal(w(0x2a896a), 0x6100, '$2A896A `6100` bsr.w');
  assert.equal(0x2a896c + disp16(0x2a896c), HIBACHI_A1.gun8Init, '  ...to $2A8800, its OWN init');
  assert.equal(u8(b.ram.u8(RNG.counter) - counterBefore), 2,
    '  ...and the retire frame drew twice where a firing frame draws none');
  // ...and the ramp it leaves, which its next init reads back into ($4,A4).
  assert.equal(b.ram.u8(SUB + 0x1ee), 0x14, '($1EE,A6) rose by $14 at $2A897C');
  const c = gunBench({ py: 0 });
  c.ram.setU8(SUB + 0x1ee, 0x28);
  c.ram.setU16(A4SLOT, 0x8008);
  gun8Init2A8800(c.ram, c.ROM, A4SLOT, SUB);
  let m = 0;
  while (c.ram.u16(A4SLOT) !== 0 && m < 8000) {
    poolClear(c.ram);
    gun8Step2A883A(c.ram, c.ROM, c.ctx, A4SLOT, REC, SUB); m += 1;
  }
  assert.equal(c.ram.u8(SUB + 0x1ee), 0x28, '$2A8974 cmpi.b #$28 / bcc.s -- AT the cap it stops');
});

test('W405 SECTION 5: with both players dead gun 8 fires nothing and STILL toggles ($3,A5)',
  { skip: SKIP }, () => {
    const b = gunBench({ p1: 0, p2: 0 });
    b.ram.setU16(A4SLOT, 0x8008);
    gun8Init2A8800(b.ram, b.ROM, A4SLOT, SUB);
    b.ram.setU8(REC + 0x03, 0);
    const angle = b.ram.u8(A4SLOT + 0x10);
    for (let i = 0; i < 0x61; i++) gun8Step2A883A(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
    assert.equal(b.shots.length, 0, '$2A886C bpl.w declines everything...');
    assert.equal(b.ram.u8(A4SLOT + 0x10), angle, '  ...including the sweep step');
    assert.equal(b.ram.u8(REC + 0x03), 1,
      '  ...but it lands ON $2A895C, so the toggle still happens -- gun 6\'s shape, not gun 7\'s');
    assert.equal(0x2a886e + disp16(0x2a886e), 0x2a895c, '  ...$2A886C + $EE is $2A895C exactly');
  });

// ===============================================================================================
// SECTION 6 -- A4 $D.
// ===============================================================================================

test('W405 SECTION 6: A4 $D waits $60, runs gun 8, cools down $40 and hands BACK to $A',
  { skip: SKIP }, () => {
    const ram = new Ram();
    ram.setU16(SCHED.a4Base, 0x800d);
    // The init frame runs the init AND the step: $2A6988 is an operand, not an rts.
    a4D2A6970(ram, SCHED.a4Base, REC, true);
    assert.equal(ram.u16(SCHED.seqPending), 7, '$2A697C moveq #$7 / jsr $2598D0 in the INIT');
    assert.equal(ram.u8(REC + 0x1a), 0x0c, '  ...and $2A6984 wrote $C at ($1A,A5)');
    assert.equal(ram.u16(SCHED.a4Base + 0x02), 0x5f,
      '  ...and the $60 is already $5F, because the step ran on the same dispatch');
    for (let i = 0; i < 0x5e; i++) a4D2A6970(ram, SCHED.a4Base, REC, false);
    assert.equal(ram.u16(SCHED.a1Base), 0, 'gun 8 has not started yet');
    a4D2A6970(ram, SCHED.a4Base, REC, false);
    assert.equal(ram.u16(SCHED.a1Base) & 0xff, 8, 'the $60th frame starts A1 gun 8');
    assert.equal(ram.u8(REC + 0x1a), 0x04, '  ...and $2A69A6 writes $4 over ($1A,A5)');
    assert.equal(ram.u16(SCHED.a4Base + 0x04), 0x40, '  ...and ($4,A4) is untouched: still $40');

    // While the gun runs, the $40 does NOT tick: $2A69B4's bcs returns above $2A69B6.
    for (let i = 0; i < 50; i++) a4D2A6970(ram, SCHED.a4Base, REC, false);
    assert.equal(ram.u16(SCHED.a4Base + 0x04), 0x40, 'fifty frames later it is STILL $40');
    ram.setU16(SCHED.a1Base, 0);                      // retire gun 8 by hand
    for (let i = 0; i < 0x3f; i++) a4D2A6970(ram, SCHED.a4Base, REC, false);
    assert.equal(ram.u16(SCHED.a4Base + 0x04), 1, '  ...and only now does it count down');
    assert.equal(ram.u16(SCHED.a4Base), 0x800d, '  ...with the script still live');
    a4D2A6970(ram, SCHED.a4Base, REC, false);
    assert.equal(ram.u16(SCHED.a4Base), 0, '$2A69CC clr.w (A4) retired A4 $D...');
    assert.equal(ram.u16(SCHED.seqPending), 2, '  ...and $2A69C4 armed main sequencer 2');
    const started = [...Array(SCHED.a4Slots).keys()]
      .map((i) => ram.u16(SCHED.a4Base + i * SCHED.a4Stride)).filter((v) => v !== 0);
    assert.deepEqual(started, [0x800a],
      '  ...and $2A69BC moveq #$A left A4 $A running: THE LOOP IS CLOSED');
  });

test('W405 SECTION 6: A4 $D freezes on $8130D4 by RETURNING, and re-seeds nothing',
  { skip: SKIP }, () => {
    const ram = new Ram();
    ram.setU16(SCHED.a4Base, 0x800d);
    a4D2A6970(ram, SCHED.a4Base, REC, true);
    const at = ram.u16(SCHED.a4Base + 0x02);
    ram.setU16(HIBACHI_A1.freeze, 1);
    for (let i = 0; i < 200; i++) a4D2A6970(ram, SCHED.a4Base, REC, false);
    assert.equal(ram.u16(SCHED.a4Base + 0x02), at,
      'the delay is exactly where it was: an A4 freeze WAITS');
    assert.equal(ram.u8(REC + 0x1a), 0x0c, '  ...and ($1A,A5) is not rewritten');
    ram.setU16(HIBACHI_A1.freeze, 0);
    for (let i = 0; i < at; i++) a4D2A6970(ram, SCHED.a4Base, REC, false);
    assert.equal(ram.u16(SCHED.a1Base) & 0xff, 8, '  ...and it resumes where it stopped');
  });

test('W405 SECTION 6: both new guns FREEZE by re-running their own init, not by waiting',
  { skip: SKIP }, () => {
    for (const [id, init, step] of [[7, gun7Init2A8516, gun7Step2A8538],
      [8, gun8Init2A8800, gun8Step2A883A]]) {
      const b = gunBench();
      b.ram.setU16(A4SLOT, 0x8000 | id);
      init(b.ram, b.ROM, A4SLOT, SUB);
      for (let i = 0; i < 0x20; i++) step(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      const mid = b.ram.u8(A4SLOT + 0x02);
      assert.notEqual(mid, 0x60, `gun ${id} has counted down`);
      b.ram.setU16(HIBACHI_A1.freeze, 1);
      step(b.ram, b.ROM, b.ctx, A4SLOT, REC, SUB);
      assert.equal(b.ram.u8(A4SLOT + 0x02), 0x60,
        `  ...and ONE frozen frame put gun ${id}'s countdown back to the template's $60`);
      b.ram.setU16(HIBACHI_A1.freeze, 0);
    }
  });

// ===============================================================================================
// SECTION 7 -- THE WINDOW SET.
// ===============================================================================================

test('W405 SECTION 7: three new windows, each sized by its own instructions', { skip: SKIP },
  () => {
    const set = new Map(tables.rom.windows.map(
      (x) => [parseInt(String(x.base).replace('$', ''), 16), x.len]));
    assert.equal(tables.rom.windows.length, ROM_WINDOW_COUNT,
      'W409 CORRECTION: 599 windows -- 590 + this wave\'s three + W406\'s gun 9 template '
      + '+ W407\'s gun $B template + W408\'s gun $A template + W409\'s three'
      + ' W411 declares $280F34, the collected-impact transform table, so 600. W418 declares the CONTINUE panel\'s two strings and three tables ($2886FC $28870C $28886A $2888B2 $2888DA), so 605. W419 declares $289EDA ($60), pool C\'s kind-8 and kind-$C descriptor lists -- the art half of opening $289B50\'s kind guard; W194\'s $289B50+$38A window is NOT widened, it abuts, and the overlap count is unchanged. So 606. W425 declares $294134 ($20), the timer-D SOUND dispatch table of D-script 6 -- the eight cue-wrapper addresses the boss DEATH ANIMATION walks with `movea.l (A0),A0 / jsr (A0)`, which is the explosion rattle DOCKET D58 was opened on. The $294154 window from W107 ABUTS it and is NOT widened: the two are read by different routines for different reasons, and the overlap count is unchanged. So 607. W428 declares the FOUR word-threshold cue scripts ($268E32 $273986 $2747A8 $275F04), so 611. Each of the four begins INSIDE its type\'s prototype window and runs on to the handler that follows it, because a cue record\'s longwords straddle that window\'s end and RomWindows.#at cannot stitch a read across a seam -- W428 declared an abutting window and MEASURED that $27399E threw anyway. So for the first time in twelve waves the overlap count moves too, 71 -> 75, four new pairs for four new windows. Both numbers now live in tests/romwindowset.js, which is where to change them and where to read why.');

    // 1 + 3 -- the two slot templates, sized from their own `moveq` (TRAP 2: dbra is n+1).
    for (const [site, base, words] of [[HIBACHI_A1.gun7Init, HIBACHI_A1.gun7Template, 9],
      [HIBACHI_A1.gun8Init, HIBACHI_A1.gun8Template, 8]]) {
      assert.equal(w(site), 0x41fa, `$${site.toString(16)} lea (d16,PC),A0`);
      assert.equal(site + 2 + disp16(site + 2), base, '  ...TRAP 4: extension word + displacement');
      assert.equal(w(site + 4), 0x43ec, '  ...lea ($2,A4),A1');
      assert.equal(w(site + 8) & 0xff00, 0x7000, '  ...moveq #n,D0');
      assert.equal((w(site + 8) & 0xff) + 1, words, `  ...so ${words} WORDS, not ${words - 1}`);
      assert.equal(w(site + 12), 0x51c8, '  ...and 51C8 dbra D0');
      assert.equal(set.get(base), words * 2, `  ...and the window is $${(words * 2).toString(16)}`);
    }
    // 2 -- the block table, whose $150 was bounded three ways in SECTION 2.
    assert.equal(set.get(HIBACHI_A1.gun7Blocks), 0x150, '$2A8680 + $150');

    // ---- AND THE TILING, at both ends of each, which is the second bound on every one.
    assert.equal(0x2a84cc + 0x18, HIBACHI_A1.gun7Template,
      'W404\'s muzzle window ends at $2A84E4, where gun 7\'s template begins -- the brief said '
      + 'gun 7 needed ONE new window and this is the one it missed');
    assert.equal(HIBACHI_A1.gun7Template + 0x12, 0x2a84f6, 'gun 7\'s template ends at $2A84F6...');
    assert.equal(l(0x2a84f6), HIBACHI_A1.gun7Init, '  ...where its eight self-pointers begin');
    assert.equal(HIBACHI_A1.gun7Blocks + 0x150, HIBACHI_A1.gun8Template,
      'the block table ends exactly where gun 8\'s template begins');
    assert.equal(HIBACHI_A1.gun8Template + 0x10, 0x2a87e0, 'gun 8\'s template ends at $2A87E0...');
    assert.equal(l(0x2a87e0), HIBACHI_A1.gun8Init, '  ...where ITS eight self-pointers begin');

    // ---- $26BFFC, which gun 8 walks, is W31/W176's window and was NOT widened.
    const holder = tables.rom.windows.find((x) => {
      const b2 = parseInt(String(x.base).replace('$', ''), 16);
      return HIBACHI_A1.vectors >= b2 && HIBACHI_A1.vectors + 0x100 <= b2 + x.len;
    });
    assert.equal(parseInt(String(holder.base).replace('$', ''), 16), 0x26be70,
      '$26BFFC sits inside $26BE70 + $28C, untouched');
    assert.equal(w(0x2a88e2), 0x43f9, '$2A88E2 `43F9` lea <abs.l>,A1');
    assert.equal(l(0x2a88e4), HIBACHI_A1.vectors, '  ...$26BFFC, the same table gun 5 walks');
  });

test('W405 SECTION 7: guns 7 and 8 are PORTED, and the counted list shrank by exactly two',
  { skip: SKIP }, () => {
    // W406 CORRECTION: gun 9 and A4 $F joined the ported sets.
    // W407 CORRECTION: gun $B, A4 $10 and A4 $11 joined them too.
    // Playable catalogue correction: shared guns $C and $D joined the A1 set.
    assert.deepEqual([...HIBACHI_A1_SCRIPTS],
      [0, 1, 2, 3, 5, 6, 7, 8, 9, 0x0a, 0x0b, 0x0c, 0x0d],
      'Playable catalogue correction: THIRTEEN A1 ids are ported now');
    assert.deepEqual([...HIBACHI_GUN_A4_SCRIPTS],
      [0x0a, 0x0b, 0x0c, 0x0d, 0x0f, 0x10, 0x11], '  ...and seven A4');
    for (const id of [7, 8]) {
      assert.equal(HIBACHI_A1_COUNTED[id], undefined, `A1 ${id} is no longer counted`);
    }
    assert.equal(HIBACHI_END_COUNTED[0x0d], undefined, 'and A4 $D is out of hibachiend.js\'s list');
    assert.equal(Object.keys(HIBACHI_A1_COUNTED).length + HIBACHI_A1_SCRIPTS.length,
      HIBACHI_A1.pairs, 'ported + counted = fourteen, the whole table');
    // ...and all four inits and all four steps really are registered, by address.
    const reg = new Set(scriptAddresses());
    for (const id of HIBACHI_A1_SCRIPTS) {
      assert.ok(reg.has(l(HIBACHI_A1.main + id * 8)), `A1 ${id}'s init is registered`);
      assert.ok(reg.has(l(HIBACHI_A1.main + id * 8 + 4)), `  ...and its step`);
    }
    for (const id of HIBACHI_GUN_A4_SCRIPTS) {
      assert.ok(reg.has(l(HIBACHI_A4.table + id * 8)), `A4 $${id.toString(16)}'s init`);
      assert.ok(reg.has(l(HIBACHI_A4.table + id * 8 + 4)), `  ...and its step`);
    }
  });
