// W62 (S1) -- THE STAGE ADVANCE, THE BOSS TIMEOUT AND THE SCHEDULER.
//
// The defect these tests exist for: `$292902` had been a loud named throw since
// W36 and W57 walked the LIVE PAGE into it on logic frame 7,870, which meant
// **stage 1 could not end** -- the owner's binding directive
// (`docs/worklog/ddpdoj/39`) requires it to.
//
// SHAPE, following W57/W61's. Every assertion is on a value the ROM decides:
// the timeout out of `$2927F6`, the priority out of `$240F62`, the wipe extent
// out of `$25FD24`'s `dbra`, the state order out of `$28D63C`'s descending
// compares. Nothing writes a constant and reads it back through the same
// constant (`docs/knowledge/03`).
//
// Throw assertions pin `e.romAddress`, never the message text.
//
// The tests SKIP LOUDLY when the export is absent. A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RAM } from '../src/machine.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { HANDLER_ADDRESSES } from '../src/handlers.js';
import {
  SE, ADVANCE_ENTRIES, PRESENTATION_DEVIATION, runStageAdvance242952,
  writeStage25FD0C, wipeStageBlock25FD24, bgDestroy25FCFA, rebuildWorld25FD38,
  makeStageClear, makeStage5Ending, ENDING13, bannerStep28ECCE, result28D9AA,
  draw1_28DED8, draw2_28E1AC,
} from '../src/stageend.js';
import {
  SCHED, installScripts, runScheduler25962E, registerScript, scriptAddresses,
  a3Start259962, a3Stop2599EC, a4Start25980C, a4Running25983E, a4Clear2598A2,
  a1Start259A18,
  a1Clear259B34, a2Run2598E6, a2Stop25994A, seqStart2598D0, suspend2595E8,
  fadeArm259B7E, fadeDone259B9E, fadeStep259BB4,
} from '../src/scheduler.js';
import { BOSS, BOSS_NOTED, livePlayers2428A6, bossDamage294AD8, bossTimeout294F32,
  handlerBoss292902 } from '../src/boss.js';
import { ALLOC } from '../src/objalloc.js';
import { LEDGER } from '../src/score.js';
import { OBJ } from '../src/objdriver.js';
import { BUCKETS } from '../src/spritequeue.js';
// W435: main-loop call #3. Type 6's state $B now WAITS on the anim chain
// ($28D702 bne), and this is the only thing that drains it, so a fixture that
// drives the handler without it drives half a machine.
import { runAnimObjects24683E } from '../src/animobjects.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const MOVE = HAVE ? new (await import('../src/vectors.js')).MoveTables(TJ) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const A5 = 0x81364c, A6 = 0x81523c;   // the boss's own record and sub-record

function ctxOf(ram) {
  const u = new UnportedLog();
  const ev = [];
  return { ram,
    ctx: { rom: ROM, unportedLog: u, tables: MOVE,
      stageEndEvent: (k, v) => ev.push([k, v]),
      bossEvent: (k, v) => ev.push([k, v]) },
    notes: u, ev };
}

/** The boss's record as `$2926EE`'s prototype load leaves it. */
function bossFixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU32(A5 + BOSS.subRec, A6);
  ram.setU32(A5 + BOSS.hp0, 0x00016c00);
  ram.setU32(A5 + BOSS.hp1, 0x0000a000);
  ram.setU32(A5 + BOSS.hp2, 0x0000a000);
  ram.setU16(A5 + BOSS.timeout, 0x2a30);
  ram.setU16(A6 + BOSS.st0, 0xa001);
  ram.setU16(A6 + BOSS.st1, 0xa001);
  ram.setU16(A6 + BOSS.st2, 0xa001);
  ram.setU16(0x8103e6, 0x8000);        // a live P1 for $2428A6
  return ram;
}

// ===========================================================================
// 1. THE TIMEOUT -- the number the whole wave rests on
// ===========================================================================

test('$2927F6 word 6 IS $2A30 = 10,800, out of the cartridge', { skip: SKIP }, () => {
  // The prototype `$2926EE lea $2927F6(pc),A0 / moveq #$7,D0 / jsr $26377A`
  // copies EIGHT words into $16(a5)..$25(a5); word 6 lands on $22(a5).
  assert.equal(ROM.u16(0x2927f6 + 12), 0x2a30);
  assert.equal(ROM.u32(0x2927f6), 0x00016c00, 'and word 0/1 is part 0\'s HP');
});

test('$294F32 spends ONE per call and dies on the 10,800th', { skip: SKIP }, () => {
  const ram = bossFixture();
  const { ctx } = ctxOf(ram);
  for (let i = 0; i < 10799; i++) bossTimeout294F32(ram, ROM, ctx, A5, A6);
  assert.equal(ram.u16(A5 + BOSS.timeout), 1, '10,799 spent, one left');
  assert.equal(ram.u16(A6 + BOSS.dying), 0, 'and the boss is NOT dead yet');
  bossTimeout294F32(ram, ROM, ctx, A5, A6);
  assert.equal(ram.u16(A5 + BOSS.timeout), 0);
  assert.equal(ram.u16(A6 + BOSS.dying), 1, '$294DD4 ran on the 10,800th');
});

test('$294F32 does NOT spend a frame while $8130D2 is up', { skip: SKIP }, () => {
  const ram = bossFixture();
  const { ctx } = ctxOf(ram);
  ram.setU16(BOSS.deathPause, 1);                 // $294F32 tst.w/bne
  bossTimeout294F32(ram, ROM, ctx, A5, A6);
  assert.equal(ram.u16(A5 + BOSS.timeout), 0x2a30);
});

test('$294F50 RE-FLOORS the counter to $78 with no live player -- a behaviour, '
  + 'not an edge case', { skip: SKIP }, () => {
    const ram = bossFixture();
    const { ctx } = ctxOf(ram);
    ram.setU16(0x8103e6, 0);                      // no P1
    ram.setU16(0x810448, 0);                      // no P2
    ram.setU16(A5 + BOSS.timeout, 1);
    bossTimeout294F32(ram, ROM, ctx, A5, A6);
    assert.equal(ram.u16(A5 + BOSS.timeout), 0x78);
    assert.equal(ram.u16(A6 + BOSS.dying), 0, 'and the boss CANNOT die');
  });

test('$2428A6 is $10 for P1, +$8 for P2, and both tests are two-part',
  { skip: SKIP }, () => {
    const ram = new Ram();
    assert.equal(livePlayers2428A6(ram), 0);
    ram.setU16(0x8103e6, 0x8000); assert.equal(livePlayers2428A6(ram), 0x10);
    ram.setU16(0x810448, 0x8000); assert.equal(livePlayers2428A6(ram), 0x18);
    // $2428B0 `btst #$0,$8103E6` -- bit 0 of the HIGH byte, and it DISQUALIFIES.
    ram.setU8(0x8103e6, 0x81);   assert.equal(livePlayers2428A6(ram), 0x08);
  });

test('$294AD8 returns immediately once $E6(A6) is up ($294ADC beq)',
  { skip: SKIP }, () => {
    const ram = bossFixture();
    const { ctx } = ctxOf(ram);
    ram.setU16(A6 + BOSS.dying, 1);
    bossDamage294AD8(ram, ROM, ctx, A5, A6);
    assert.equal(ram.u16(A5 + BOSS.timeout), 0x2a30,
      'the timeout is BELOW the early return, so a dying boss stops spending');
  });

test('$292902 reaches $294F32 through $294AD8\'s fall-through, and there is no '
  + 'other caller', { skip: SKIP }, () => {
    const ram = bossFixture();
    const { ctx } = ctxOf(ram);
    handlerBoss292902(ram, ROM, A5, ctx);
    assert.equal(ram.u16(A5 + BOSS.timeout), 0x2a2f);
  });

// ===========================================================================
// 2. THE SCHEDULER
// ===========================================================================

test('$259554 installs FIVE pointers and RUNS NOTHING', { skip: SKIP }, () => {
  const ram = new Ram();
  installScripts(ram, ROM, { a0: 0x293104, a1: 0x295856, a2: 0x292932,
    a3: 0x29370a, a4: 0x294f68 });
  assert.equal(ram.u32(SCHED.ptrA0), 0x293104);
  assert.equal(ram.u32(SCHED.ptrA1), 0x295856);
  assert.equal(ram.u32(SCHED.ptrA2), 0x292932);
  assert.equal(ram.u32(SCHED.ptrA3), 0x29370a);
  assert.equal(ram.u32(SCHED.ptrA4), 0x294f68);
  assert.equal(ram.u16(SCHED.seqCursor), 0xffff,
    '$25957A -- the main sequencer is IDLE until $2598D0 arms it');
  // A2 is PRE-FILLED from the ROM list, and every RUN bit stays CLEAR.
  for (let i = 0; i < 7; i++) {
    assert.equal(ram.u16(SCHED.a2Base + i * 8), 0x8000, `slot ${i} present`);
    assert.equal(ram.u32(SCHED.a2Base + i * 8 + 2), ROM.u32(0x292932 + i * 4));
  }
  assert.equal(ram.u16(SCHED.a2Base + 7 * 8), 0,
    '$292932[7] is $FFFFFFFF, the terminator: SEVEN slots, not eight');
  const c = { rom: ROM, unportedLog: new UnportedLog() };
  assert.doesNotThrow(() => runScheduler25962E(ram, ROM, c),
    'a pre-filled but dormant table dispatches NOTHING');
});

test('$259554 zeroes $812980..$812E06 first, which includes the SUSPEND',
  { skip: SKIP }, () => {
    const ram = new Ram();
    ram.setU16(SCHED.suspend, 1);
    ram.setU16(SCHED.a3Base, 0x8006);
    installScripts(ram, ROM, { a3: 0x29370a });
    assert.equal(ram.u16(SCHED.suspend), 0, '$812E06 is inside the $244-word wipe');
    assert.equal(ram.u16(SCHED.a3Base), 0, 'and so is every slot table');
  });

test('$25962E returns C=1 the moment $812E06 is set, and runs NOTHING else',
  { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a3: 0x29370a });
    a3Start259962(ram, 6);
    ram.setU16(SCHED.suspend, 1);
    const c = { rom: ROM, unportedLog: new UnportedLog() };
    assert.equal(runScheduler25962E(ram, ROM, c), true);
    assert.equal(ram.u8(SCHED.a3Base), 0x80,
      'the slot\'s RUN bit is untouched -- the walk never ran');
  });

test('$25962E dispatches an UNREGISTERED script as a LOUD NAMED THROW',
  { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a1: 0x295856 });
    // W62 used D script 0, W96 moved it to D script 10, and W103 ported ALL
    // remaining D entries (8..19).  So the test now uses E script 2 ($295CAC),
    // one of the four DEAD scripts W99 proved have no start site anywhere in
    // the image.  A dead script is deliberately NEVER registered, so it is the
    // permanent test case for "the scheduler throws on an unregistered address".
    a1Start259A18(ram, 2);                          // E script 2 = $295CAC (DEAD)
    const c = { rom: ROM, unportedLog: new UnportedLog() };
    assert.throws(() => runScheduler25962E(ram, ROM, c),
      (e) => e instanceof Unreached && e.romAddress === ROM.u32(0x295856 + 2 * 8));
  });

test('the A3 slot protocol: INIT on the first frame, STEP on every one after',
  { skip: SKIP }, () => {
    const seen = [];
    registerScript(0x111111, () => seen.push('init'));
    registerScript(0x222222, () => seen.push('step'));
    const ram = new Ram();
    // A hand-built table, so this test does not depend on the boss's.
    ram.setU32(SCHED.ptrA3, 0x900000);
    const fake = { u32: (a) => (a === 0x900000 + 3 * 8 ? 0x111111 : 0x222222) };
    ram.setU16(SCHED.a3Base, 0x8003);
    const c = { rom: fake, unportedLog: new UnportedLog() };
    runScheduler25962E(ram, fake, c);
    runScheduler25962E(ram, fake, c);
    runScheduler25962E(ram, fake, c);
    assert.deepEqual(seen, ['init', 'step', 'step']);
  });

test('$259962 claims the FIRST EMPTY slot and refuses a duplicate id',
  { skip: SKIP }, () => {
    const ram = new Ram();
    assert.equal(a3Start259962(ram, 4), true);
    assert.equal(a3Start259962(ram, 5), true);
    assert.equal(a3Start259962(ram, 6), true);
    assert.equal(ram.u16(SCHED.a3Base + 0 * 0x20), 0x8004);
    assert.equal(ram.u16(SCHED.a3Base + 1 * 0x20), 0x8005);
    assert.equal(ram.u16(SCHED.a3Base + 2 * 0x20), 0x8006,
      '$294DD4 starts 4, then 5, then 6 -- so D-script 6 is slot TWO');
    assert.equal(a3Start259962(ram, 5), false, '$2599A8: already present');
    a3Stop2599EC(ram, 5);
    assert.equal(ram.u16(SCHED.a3Base + 1 * 0x20), 0);
  });

test('$25980C/$25983E: FIVE A4 slots, and a full table is a SILENT DROP',
  { skip: SKIP }, () => {
    const ram = new Ram();
    for (let i = 0; i < 5; i++) assert.equal(a4Start25980C(ram, i), true);
    assert.equal(a4Start25980C(ram, 9), false);
    assert.equal(a4Running25983E(ram, 3), true);
    assert.equal(a4Running25983E(ram, 9), false);
    a4Clear2598A2(ram);
    assert.equal(a4Running25983E(ram, 3), false);
  });

test('$2598E6 / $25994A move ONLY bit 0 of an A2 slot', { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU16(SCHED.a2Base + 6 * 8, 0x8000);
  a2Run2598E6(ram, 6);
  assert.equal(ram.u16(SCHED.a2Base + 6 * 8), 0x8001);
  a2Stop25994A(ram, 6);
  assert.equal(ram.u16(SCHED.a2Base + 6 * 8), 0x8000, 'bit 15 survives');
});

test('$259BB4: the fade is NINE calls from $259B7E to $812DFC == 0',
  { skip: SKIP }, () => {
    const ram = new Ram();
    fadeArm259B7E(ram, 0x12);
    assert.equal(ram.u16(SCHED.fadeLevel), 0x1c00);
    let n = 0;
    while (fadeDone259B9E(ram) && n < 100) { fadeStep259BB4(ram, null); n++; }
    // $1C00 -> 0 is SEVEN subtractions that stay non-negative (0 is `bpl`), the
    // EIGHTH goes negative and flips to state 2, and state 2's hold counter
    // spends the ninth. Counted as CALLS, not as arithmetic.
    assert.equal(n, 9);
  });

test('$2595E8 is the ONLY thing that sets $812E06 in this port',
  { skip: SKIP }, () => {
    const ram = new Ram();
    suspend2595E8(ram);
    assert.equal(ram.u16(SCHED.suspend), 1);
    const src = fs.readFileSync(new URL('../src/scheduler.js', import.meta.url), 'utf8')
      + fs.readFileSync(new URL('../src/boss.js', import.meta.url), 'utf8')
      + fs.readFileSync(new URL('../src/stageend.js', import.meta.url), 'utf8');
    const writes = src.match(/setU16\(SCHED\.suspend/g) ?? [];
    assert.equal(writes.length, 1,
      '$2595E8 has six callers in build B, one per boss, and ONE writer');
  });

// ===========================================================================
// 3. D-SCRIPT 6 -- and the recon's 32 frames
// ===========================================================================

test('$293DC6 leaves $2(a4) = ZERO, which is why the recon\'s "32 frames" is '
  + 'wrong', { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a3: 0x29370a });
    a3Start259962(ram, 6);
    const c = { rom: ROM, unportedLog: new UnportedLog(), bossSubRec: A6 };
    runScheduler25962E(ram, ROM, c);              // the INIT
    assert.equal(ram.u8(SCHED.a3Base + 0x02), 0, '$293DC6 move.b #$0,$2(a4)');
    assert.equal(ram.u16(SCHED.a3Base + 0x0a), 0x20, '...and $A(a4) = $20');
    runScheduler25962E(ram, ROM, c);              // the first STEP
    assert.equal(ram.u8(SCHED.a3Base + 0x02), 1,
      'state 0 -> 1, NOT the state-6 arm the $20 belongs to');
  });

test('D-script 6 walks 0..6 and fires $2595E8 EXACTLY ONCE, then retires',
  { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a3: 0x29370a });
    a3Start259962(ram, 6);
    const c = { rom: ROM, unportedLog: new UnportedLog(), bossSubRec: A6 };
    const states = [];
    let n = 0;
    while (n < 2000 && ram.u16(SCHED.suspend) === 0) {
      const s = ram.u16(SCHED.a3Base) === 0 ? null : ram.u8(SCHED.a3Base + 0x02);
      if (s !== null && states[states.length - 1] !== s) states.push(s);
      runScheduler25962E(ram, ROM, c);
      n++;
    }
    assert.deepEqual(states, [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(ram.u16(SCHED.suspend), 1);
    assert.equal(ram.u16(SCHED.a3Base), 0, '$293E1C clr.w (a4) retires the slot');
    // 474 is the frame count the gate measures against the shipped bundle; here
    // it is re-derived in isolation, with no boss and no object driver.
    // 475 CALLS here against the gate's 474 FRAMES, and the difference is the
    // init: the gate's `timeout@lf18669` frame is the one on which $294DD4 arms
    // the slot, and $293DC6 runs on the NEXT. Either way it is not 32.
    assert.equal(n, 475, 'the death animation is 474 frames, not 32');
  });

test('state 5 rewrites $A(a4) to $80, so state 6 waits 128 frames and not 32',
  { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a3: 0x29370a });
    a3Start259962(ram, 6);
    const c = { rom: ROM, unportedLog: new UnportedLog(), bossSubRec: A6 };
    // BOUNDED, and the bound is asserted.  The first version of this test was
    // `while (state !== 6)` with no counter, and mutant M9 -- the A3 slot that
    // runs its INIT for ever -- made it HANG rather than go red.  A check that
    // can hang is a check that cannot fail (docs/knowledge/03); this one now
    // says how many frames it took as well as what it found.
    let n = 0;
    while (ram.u8(SCHED.a3Base + 0x02) !== 6 && n < 1000) {
      runScheduler25962E(ram, ROM, c); n++;
    }
    assert.equal(n, 347, 'state 6 is entered on the 347th frame of the script');
    assert.equal(ram.u16(SCHED.a3Base + 0x0a), 0x80);
  });

test('$294DD4 starts THREE A3 scripts -- 4, 5 and 6', { skip: SKIP }, () => {
  const ram = bossFixture();
  const { ctx } = ctxOf(ram);
  installScripts(ram, ROM, { a3: 0x29370a });
  ram.setU16(A5 + BOSS.timeout, 1);
  bossTimeout294F32(ram, ROM, ctx, A5, A6);
  assert.equal(ram.u16(SCHED.a3Base + 0 * 0x20) & 0xff, 4);
  assert.equal(ram.u16(SCHED.a3Base + 1 * 0x20) & 0xff, 5);
  assert.equal(ram.u16(SCHED.a3Base + 2 * 0x20) & 0xff, 6);
  assert.equal(ram.u8(A6 + BOSS.dead1), 1);
  assert.equal(ram.u8(A6 + BOSS.dead2), 1);
});

test('every registered script address is in an installed boss scheduler table',
  { skip: SKIP }, () => {
    // W82: THREE classes, not two.  This test was written when the only
    // registered scripts were A3's and A0's, and it read TEN A3 pairs because
    // ten is the SLOT count -- the table is indexed by the script ID and holds
    // TWENTY-ONE (see `check_boss_script_table_extents` in export-tables.py,
    // which asserts the `clr.w (a4)/rts` pin out of the image).  W82 registers
    // D-script 7 (id 7, inside the old ten) and four routines from the A2
    // OBJECT list `$292932`, which is a third table this test did not know
    // about.  The CLAIM is unchanged and is the point of the test: a registered
    // address must be one the cartridge itself publishes as an entry point.
    //
    // W95: FOUR classes now.  W82 widened this from two to three; W95 is the
    // first wave to register a TABLE-F script (`$295002`, F id 1's INIT), and
    // A4 `$294F68` was the one pointer table the legal set never carried.
    // SEVEN pairs, which is what `check_boss_a4_extent` asserts out of the
    // image (W64 found W62's window was short at five).  The claim and the
    // negative case at the foot are unchanged, so the widening cannot weaken
    // it: `$2943EC`, D-script 7's `rts`, must still be rejected.
    const legal = [];
    for (let i = 0; i < 7; i++) {                        // A4, $294F68
      legal.push(ROM.u32(0x294f68 + i * 8), ROM.u32(0x294f68 + i * 8 + 4));
    }
    for (let i = 0; i < 21; i++) {                       // A3, $29370A
      legal.push(ROM.u32(0x29370a + i * 8), ROM.u32(0x29370a + i * 8 + 4));
    }
    for (let i = 0; i < 9; i++) {                        // A0, $293104
      legal.push(ROM.u32(0x293104 + i * 8), ROM.u32(0x293104 + i * 8 + 4));
    }
    for (let i = 0; i < 15; i++) {                       // A1, $295856
      legal.push(ROM.u32(0x295856 + i * 8), ROM.u32(0x295856 + i * 8 + 4));
    }
    for (let i = 0; i < 7; i++) legal.push(ROM.u32(0x292932 + i * 4));   // A2
    assert.strictEqual(ROM.u32(0x292932 + 7 * 4) >>> 0, 0xffffffff,
      'the A2 list is SEVEN longwords and a $FFFFFFFF terminator');
    // W183 installs the stage-2 boss tables. Carry their statically closed A0,
    // A3, A4 and A2 domains too, so this remains a cartridge-membership test
    // rather than accidentally asserting that only the stage-1 boss exists.
    for (let i = 0; i < 8; i++) {                        // A0, $297950
      legal.push(ROM.u32(0x297950 + i * 8), ROM.u32(0x297950 + i * 8 + 4));
    }
    for (let i = 0; i < 14; i++) {                       // A3, $297EE0
      legal.push(ROM.u32(0x297ee0 + i * 8), ROM.u32(0x297ee0 + i * 8 + 4));
    }
    for (let i = 0; i < 9; i++) {                        // A4, $298C66
      legal.push(ROM.u32(0x298c66 + i * 8), ROM.u32(0x298c66 + i * 8 + 4));
    }
    for (let i = 0; i < 16; i++) {                       // A1, $2998AC (W189)
      legal.push(ROM.u32(0x2998ac + i * 8), ROM.u32(0x2998ac + i * 8 + 4));
    }
    for (let i = 0; i < 11; i++) legal.push(ROM.u32(0x297432 + i * 4)); // A2
    assert.strictEqual(ROM.u32(0x297432 + 11 * 4) >>> 0, 0xffffffff,
      'the stage-2 A2 list is eleven longwords and a $FFFFFFFF terminator');
    // W204 installs the Stage-3 boss tables and registers its exact arrival
    // bootstrap: F0, MAIN0, D7, and A2 object9. Carry the complete installed
    // A0/A3/A4/A2 pointer domains so every address still has a ROM witness.
    for (let i = 0; i < 4; i++) {                       // A0, $29C2E0
      legal.push(ROM.u32(0x29c2e0 + i * 8), ROM.u32(0x29c2e0 + i * 8 + 4));
    }
    for (let i = 0; i < 8; i++) {                       // A3, $29C4EE
      legal.push(ROM.u32(0x29c4ee + i * 8), ROM.u32(0x29c4ee + i * 8 + 4));
    }
    for (let i = 0; i < 10; i++) {                      // A4, $29CBD0
      legal.push(ROM.u32(0x29cbd0 + i * 8), ROM.u32(0x29cbd0 + i * 8 + 4));
    }
    for (let i = 0; i < 9; i++) {                       // A1, $29D24A (W205)
      legal.push(ROM.u32(0x29d24a + i * 8), ROM.u32(0x29d24a + i * 8 + 4));
    }
    for (let i = 0; i < 10; i++) legal.push(ROM.u32(0x29be46 + i * 4));
    assert.strictEqual(ROM.u32(0x29be46 + 10 * 4) >>> 0, 0xffffffff,
      'the Stage-3 A2 list is ten longwords and a $FFFFFFFF terminator');
    // W229 carries the Stage-4 boss tables, installed by W219's arrival and grown
    // through W224.  The extents are MEASURED off the image the same way: the
    // first entry that is not a $2xxxxx address ends each pointer table.
    for (let i = 0; i < 9; i++) {                       // A0, $29F498
      legal.push(ROM.u32(0x29f498 + i * 8), ROM.u32(0x29f498 + i * 8 + 4));
    }
    for (let i = 0; i < 11; i++) {                      // A3, $2A1370
      legal.push(ROM.u32(0x2a1370 + i * 8), ROM.u32(0x2a1370 + i * 8 + 4));
    }
    for (let i = 0; i < 7; i++) {                       // A4, $2A0088
      legal.push(ROM.u32(0x2a0088 + i * 8), ROM.u32(0x2a0088 + i * 8 + 4));
    }
    for (let i = 0; i < 15; i++) {                      // A1, $2A1608
      legal.push(ROM.u32(0x2a1608 + i * 8), ROM.u32(0x2a1608 + i * 8 + 4));
    }
    for (let i = 0; i < 12; i++) legal.push(ROM.u32(0x29ef54 + i * 4));
    assert.strictEqual(ROM.u32(0x29ef54 + 12 * 4) >>> 0, 0xffffffff,
      'the Stage-4 A2 list is twelve longwords and a $FFFFFFFF terminator');
    // W399 carries HIBACHI's A4 table, which `initbody.js`'s $2A42DC body installs
    // ($2A4318 lea $2A5886,A4 / $2A432E jsr $259554) and which W399 is the first wave to
    // register scripts out of.  TWENTY-ONE pairs, and the extent is the table's OWN entry
    // [0]: $2A5886 + 21*8 = $2A592E, which IS that entry -- the same pin
    // `check_hibachi_a4_windows` asserts out of the image.  The claim and the negative case
    // at the foot are unchanged.
    for (let i = 0; i < 21; i++) {                     // A4, $2A5886
      legal.push(ROM.u32(0x2a5886 + i * 8), ROM.u32(0x2a5886 + i * 8 + 4));
    }
    assert.strictEqual(ROM.u32(0x2a5886) >>> 0, 0x2a5886 + 21 * 8,
      'entry [0] IS $2A5886 + 21*8, so the table ends where its own first script begins');
    // W553 carries HIBACHI's A0 main-sequencer table, installed by the same
    // $2A42DC body through $2A4300 lea $2A4E56,A0. It has twelve pairs and its
    // exact generated window ends at $2A4EB6, the shared positioner body.
    for (let i = 0; i < 12; i++) {                     // A0, $2A4E56
      legal.push(ROM.u32(0x2a4e56 + i * 8), ROM.u32(0x2a4e56 + i * 8 + 4));
    }
    // W554 carries HIBACHI's A3 scheduler table, installed through
    // $2A4312 lea $2A5492,A3. It has eight pairs and ends at $2A54D2.
    for (let i = 0; i < 8; i++) {                      // A3, $2A5492
      legal.push(ROM.u32(0x2a5492 + i * 8), ROM.u32(0x2a5492 + i * 8 + 4));
    }
    // W555 registers HIBACHI A2 object 0. Carry the complete nineteen-entry
    // pointer list installed through $2A432E, plus the cartridge terminator witness.
    for (let i = 0; i < 19; i++) legal.push(ROM.u32(0x2a46b2 + i * 4)); // A2
    assert.strictEqual(ROM.u32(0x2a46b2 + 19 * 4) >>> 0, 0xffffffff,
      'Hibachi A2 is nineteen longwords and a $FFFFFFFF terminator');
    // W404 carries HIBACHI's A1 GUN table, installed by the SAME body four instructions above
    // the A4 lea ($2A4306 lea $2A72C8,A1), and its loop-zero twin ($2A4328 lea $2A92A8,A1,
    // which $2A4324's bne.w skips whenever $813098 is non-zero). FOURTEEN pairs each, not
    // fifteen -- `tests/w404hibachiguns.test.js` SECTION 1 carries the four witnesses for the
    // count, including the `4254 4E75` that stands where entry [14] would begin.
    for (const base of [0x2a72c8, 0x2a92a8]) {
      for (let i = 0; i < 14; i++) {
        legal.push(ROM.u32(base + i * 8), ROM.u32(base + i * 8 + 4));
      }
    }
    for (const s of scriptAddresses()) {
      if (s === 0x111111 || s === 0x222222) continue;   // this file's own fake
      assert.ok(legal.includes(s),
        `$${s.toString(16)} must come out of the cartridge's own table`);
    }
    // ...and the check must be capable of failing: an address that is NOT an
    // entry point must be rejected.  `$2943EC` is D-script 7's `rts`.
    assert.ok(!legal.includes(0x2943ec), 'the rts is not an entry point');
  });

// ===========================================================================
// 4. $242952 AND THE $25FDxx FAMILY
// ===========================================================================

test('$240F62[6] is ($28D63C, priority $000A) in the cartridge',
  { skip: SKIP }, () => {
    assert.equal(ROM.u32(SE.dispatch + 6 * 8), 0x28d63c);
    assert.equal(ROM.u16(SE.dispatch + 6 * 8 + 4), 0x000a);
    assert.equal(ROM.u32(SE.dispatch + 1 * 8), 0x26127a, 'and [1] is the background');
    assert.equal(ROM.u16(SE.dispatch + 1 * 8 + 4), 0x001a);
  });

test('$242952 increments the stage and hands it to the new type-6 record',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    ram.setU16(SE.stage, 3);
    ram.setU8(SE.bossFlags, 0x10);                // bit 4 SET, so the bclr shows
    const r = runStageAdvance242952(ram, ROM, ctx);
    assert.equal(r.d7, 4, '$2429BE addq.w #$1,D7');
    assert.equal(ram.u16(SE.clearing), 1, '$242968');
    assert.equal(ram.u8(SE.bossFlags) & 0x08, 0x08, '$242958 bset #3');
    assert.equal(ram.u8(SE.bossFlags) & 0x10, 0,
      '$242960 bclr #4 -- which DISARMS $25962E\'s double pass');
    // the staged record: type 6 with the priority the cartridge holds.
    const st = ALLOC.createStage;
    assert.equal(ram.u16(st) & 0xff, 6);
    assert.equal(ram.u16(st + ALLOC.priOff), 0x000a);
    assert.equal(ram.u16(st + 0x04), 4, '$242A3A move.w D7,$4(A0)');
  });

test('$242976 bmi -- A LIVE PLAYER ALWAYS GETS `bset #$5`, and the two btsts '
  + 'only decide a record whose bit 15 is CLEAR', { skip: SKIP }, () => {
    // LIVE (bit 15 set): straight to the bset, whatever the two btsts say.
    for (const low of [0x00, 0xff]) {
      const ram = new Ram();
      const { ctx } = ctxOf(ram);
      ram.setU16(SE.p1, 0x8000 | low);
      runStageAdvance242952(ram, ROM, ctx);
      assert.equal(ram.u8(SE.p1) & 0x20, 0x20,
        `a live player with low byte $${low.toString(16)} must be bset`);
    }
    // NOT live, bit 0 CLEAR -> $242980 beq SKIPS the bset.
    {
      const ram = new Ram();
      const { ctx } = ctxOf(ram);
      ram.setU16(SE.p1, 0x0000);
      runStageAdvance242952(ram, ROM, ctx);
      assert.equal(ram.u8(SE.p1) & 0x20, 0, '$242980 beq');
    }
    // NOT live, bit 0 SET, LOW byte's bit 7 SET -> $24298A bne SKIPS it too.
    {
      const ram = new Ram();
      const { ctx } = ctxOf(ram);
      ram.setU16(SE.p1, 0x0180);
      runStageAdvance242952(ram, ROM, ctx);
      assert.equal(ram.u8(SE.p1) & 0x20, 0, '$24298A bne');
    }
    // NOT live, bit 0 SET, LOW byte's bit 7 CLEAR -> the bset RUNS.
    {
      const ram = new Ram();
      const { ctx } = ctxOf(ram);
      ram.setU16(SE.p1, 0x0100);
      runStageAdvance242952(ram, ROM, ctx);
      assert.equal(ram.u8(SE.p1) & 0x20, 0x20, 'the fall-through to $24298C');
    }
  });

test('$2429C4 -- the SECOND entry -- is named and NOT ported', { skip: SKIP }, () => {
  assert.ok(ADVANCE_ENTRIES[0x242952].includes('PORTED'));
  assert.ok(/NOT ported/.test(ADVANCE_ENTRIES[0x2429c4]));
  // The listing's own difference: $2429C4's copy has no `addq.w #$1,D7`.
  // $2429BE itself is CODE and no wave has a window over it; the difference
  // between the two entries is recorded in ADVANCE_ENTRIES' prose, above, and
  // in src/stageend.js's header where it was read out of the listing.
});

test('$25FD0C writes stage, stage*2 and stage*4', { skip: SKIP }, () => {
  const ram = new Ram();
  writeStage25FD0C(ram, 3);
  assert.equal(ram.u16(SE.stage), 3);
  assert.equal(ram.u16(SE.stageX2), 6);
  assert.equal(ram.u16(SE.stageX4), 12);
});

test('$25FD24 wipes TWENTY-TWO words, $8130CE..$8130F9 inclusive',
  { skip: SKIP }, () => {
    const ram = new Ram();
    for (let a = 0x8130cc; a <= 0x8130fc; a += 2) ram.setU16(a, 0xffff);
    wipeStageBlock25FD24(ram);
    assert.equal(ram.u16(0x8130cc), 0xffff, 'one word BELOW is untouched');
    for (let a = 0x8130ce; a <= 0x8130f8; a += 2) {
      assert.equal(ram.u16(a), 0, `$${a.toString(16)} is inside the dbra`);
    }
    assert.equal(ram.u16(0x8130fa), 0xffff, 'and one word ABOVE is untouched');
  });

test('$25FCFA is a DEFERRED kill of the HANDLE, not of the address',
  { skip: SKIP }, () => {
    const ram = new Ram();
    ram.setU32(SE.bgHandle, 0x1234);
    bgDestroy25FCFA(ram);
    assert.equal(ram.u16(SE.pauseFlag), 1, '$25FD82 first');
    assert.equal(ram.u32(ALLOC.killQueue), 0x1234,
      '$241238 reads the LONGWORD AT (A0), i.e. the ID');
    assert.equal(ram.u16(ALLOC.killSp), ALLOC.stride);
  });

test('$25FD38 builds a NEW background object with ENTRY CLOCK ZERO',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const { ctx } = ctxOf(ram);
    ram.setU16(SE.pauseFlag, 1);
    ram.setU16(0x8130ce, 0x0344);
    ram.setU32(SE.bgHandle, 7);
    ram.setU16(ALLOC.createStage + 0x06, 0x38);   // a stale entry clock
    ram.setU16(0x81b732, 0x8007);                 // stale pool-B effect
    ram.setU16(0x81c8ec, 0x8000);                 // stale pool-D debris
    ram.setU16(0x81cdec, 1);
    rebuildWorld25FD38(ram, ctx);
    assert.equal(ram.u16(SE.pauseFlag), 0, '$25FD24 lifts the pause $25FCFA set');
    assert.equal(ram.u16(0x8130ce), 0, '...and zeroes the distance clock');
    assert.equal(ram.u16(ALLOC.createStage) & 0xff, 1, 'a type-1 object');
    assert.equal(ram.u16(ALLOC.createStage + ALLOC.priOff), 0x001a);
    assert.equal(ram.u16(ALLOC.createStage + 0x06), 0, '$25FD7A -- ENTRY CLOCK 0');
    assert.notEqual(ram.u32(SE.bgHandle), 7, '$25FD74 -- a DIFFERENT handle');
    assert.equal(ram.u16(0x81b732), 0, '$25FD40 clears pool B');
    assert.equal(ram.u16(0x81c8ec), 0, '$25FD46 clears pool D');
    assert.equal(ram.u16(0x81cdec), 0, 'pool-D live count is cleared with it');
  });

// ===========================================================================
// 5. OBJECT TYPE 6
// ===========================================================================

function type6Fixture() {
  const ram = new Ram();
  const slot = OBJ.base;
  ram.setU16(slot, 0x8006);
  ram.setU16(slot + 0x04, 1);                    // ($4,A5) = the new stage
  ram.setU32(slot + ALLOC.idOff, 0x55);
  ram.setU32(SE.bgHandle, 7);
  ram.setU16(0x8103e6, 0x8000);
  return { ram, slot };
}

test('type 6\'s INIT destroys the background object and sets $812970',
  { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx } = ctxOf(ram);
    makeStageClear(ROM)(ram, slot, 0, ctx);
    assert.equal(ram.u8(slot + 0x02), 1, '$28D566 move.b #$1,$2(a5)');
    assert.equal(ram.u8(slot + 0x06), 0, '...state 0');
    assert.equal(ram.u8(slot + 0x07), 4, '...four frames for state $A');
    assert.equal(ram.u32(ALLOC.killQueue), 7, '$25FCFA queued $813144');
    assert.equal(ram.u16(SE.pauseFlag), 1);
    assert.equal(ram.u16(SE.advanceFlag), 1, '$28D5DC');
  });

test('type 6 HOLDS IN STATE 1 while the result screen waits for the tally '
  + '(W124: state 1 no longer short-circuits to $B)', { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx } = ctxOf(ram);
    const h = makeStageClear(ROM);
    const seen = [];
    for (let i = 0; i < 120; i++) {
      h(ram, slot, 0, ctx);
      const s = ram.u8(slot + 0x06);
      if (seen[seen.length - 1] !== s) seen.push(s);
    }
    assert.deepEqual(seen, [0, 0x0a, 1], 'reaches state 1 and HOLDS there');
    assert.equal(ram.u8(slot + 0x06), 1, 'still in state 1 after 120 frames');
    assert.equal((ram.u8(SE.bossFlags9) & 0x02), 0,
      'bit 1 is NOT set -- the ported tally is not running in this isolation, '
      + 'so F8 waits. DEV-1 is gone: nothing sets bit 1 stand-in here');
  });

test('once $8130F9 bit 1 is set, type 6 walks 1 -> $B -> 2 -> 3 -> 4 (W435: and '
  + 'state $B now costs THIRTY-TWO frames, not one)',
  { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx } = ctxOf(ram);
    const h = makeStageClear(ROM);
    const seen = [];
    let bit1Set = false;
    let framesInB = 0;
    for (let i = 0; i < 400; i++) {
      // simulate the tally completing once the result screen has run a while
      if (!bit1Set && ram.u8(slot + 0x06) === 1 && i > 20) {
        ram.setU8(SE.bossFlags9, ram.u8(SE.bossFlags9) | 0x02);
        bit1Set = true;
      }
      h(ram, slot, 0, ctx);
      // W435 -- main-loop call #3, which the machine runs AFTER the object
      // driver. Without it the chain $28DE66 builds never drains and state $B
      // never ends, which is the whole point of the wait.
      runAnimObjects24683E(ram, ROM);
      const s = ram.u8(slot + 0x06);
      if (s === 0x0b) framesInB++;
      if (seen[seen.length - 1] !== s) seen.push(s);
      if (s === 4) break;
    }
    assert.deepEqual(seen, [0, 0x0a, 1, 0x0b, 2, 3, 4]);
    // [M] The $28D862 script's eight nodes all carry timing index 3, and
    // $246B38[3] is reload 0 / step 1, so ($20,node) walks 1..$20 one per frame
    // and ($18,node) clears on the 32nd. THIRTY-TWO is read off the ROM, not
    // chosen -- tests/w435resultchain.test.js derives it from the image.
    assert.equal(framesInB, 32,
      "state $B holds for exactly the anim chain's drain, 32 frames");
    assert.equal(ram.u16(SE.stage), 1, '$25FD0C ran in state 2');
    assert.equal(ram.u16(SE.stageX4), 4);
    assert.equal(ram.u16(SE.clearing), 0, '$28D682 clr.w $812972 in state 3');
    assert.notEqual(ram.u32(SE.bgHandle), 7, '$25FD38 rebuilt in state 3');
  });

test('the state tests are DESCENDING, so 2 -> 3 -> 4 cannot happen in one frame',
  { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx } = ctxOf(ram);
    const h = makeStageClear(ROM);
    ram.setU8(slot + 0x02, 1);
    ram.setU8(slot + 0x06, 2);
    h(ram, slot, 0, ctx);
    assert.equal(ram.u8(slot + 0x06), 3, 'state 2 set 3 and the frame ENDED');
  });

test('W124: the banner `$28E7F8` frees the slot -- type 6 LEAVES state 4 '
  + '(`$28EAD4 clr.w $81DFF6`)', { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx } = ctxOf(ram);
    const h = makeStageClear(ROM);
    // reach state 4: drive, and set bit 1 so F8 advances past state 1
    let bit1Set = false;
    for (let i = 0; i < 600 && ram.u8(slot + 0x06) !== 4; i++) {
      if (!bit1Set && ram.u8(slot + 0x06) === 1 && i > 10) {
        ram.setU8(SE.bossFlags9, ram.u8(SE.bossFlags9) | 0x02);
        bit1Set = true;
      }
      h(ram, slot, 0, ctx);
      runAnimObjects24683E(ram, ROM);       // W435: state $B waits on this
    }
    assert.equal(ram.u8(slot + 0x06), 4, 'reached state 4');
    assert.equal(ram.u16(SE.dff6), 1, '$28E7DC set $81DFF6 in state 2');
    // drive the banner slide-out to completion -- `$81DFEC` drains, `$28EAD4`
    // fires, and the NEXT frame's state-4 check sees DFF6 clear and self-destroys
    let n = 0;
    while (ram.u8(slot + 0x02) === 1 && n < 2000) { h(ram, slot, 0, ctx); n++; }
    assert.equal(ram.u16(SE.dff6), 0, '$28EAD4 clr.w $81DFF6 -- the SOLE clearer');
    assert.equal(ram.u8(slot + 0x02), 2, 'type 6 set ($2,A5):=2 to self-destroy');
    assert.ok(n < 2000, `the banner drained in ${n} frames (bounded)`);
  });

test('$28D5E6 destroys type 6 by ID through $241292 -> $241238',
  { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx } = ctxOf(ram);
    ram.setU8(slot + 0x02, 2);
    makeStageClear(ROM)(ram, slot, 0, ctx);
    assert.equal(ram.u32(ALLOC.killQueue), 0x55, 'the record\'s own ($4C,A5)');
    assert.equal(ram.u16(SE.df1e), 0);
    assert.equal(ram.u16(SE.df20), 0);
  });

test('$28ECCE returns C=1 for 63 calls and C=0 on the 64th, off $28EC86 seeds',
  { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx } = ctxOf(ram);
    makeStageClear(ROM)(ram, slot, 0, ctx);       // the init seeds $81E024..
    assert.equal(ram.u16(SE.e026), 0x0707);
    assert.equal(ram.u16(SE.e028), 0x0007);
    assert.equal(ram.u16(SE.e02a), 0x0004);
    let n = 0;
    while (bannerStep28ECCE(ram, ctx) && n < 500) n++;
    assert.equal(n, 63, 'recon 49 9 could not determine this; $28EC86 is the '
      + 'other half of the answer and $28D566 calls it');
  });

// ===========================================================================
// W125 (R2b): THE RESULT-SCREEN PRESENTATION DRAWS EMIT SPRITE RECORDS
// ===========================================================================
//
// Before W125 the draws (`$28DED8`/`$28E1AC`) were `note()` placeholders, so
// zero sprite records reached buckets 0 (`$23DECE`) and 2 (`$23DF2A`).  After
// W125 the draws are REAL register-convention enqueues.  This test drives the
// result FSM `$28D9AA` from its F0 entry through F5 (the hold+draw phase) on a
// fixture and asserts both bucket counters grew -- then breaks draw1 in
// isolation and watches them go red.

test('W125 MUST-FAIL: the result-screen draws `$28DED8`/`$28E1AC` emit sprite '
  + 'records into buckets 0 and 2 (was zero when they were notes)', { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx } = ctxOf(ram);
    const a6 = SE.result;
    // the bucket counters the two draw stubs feed ($23DECE -> 0, $23DF2A -> 2)
    const ctr0 = BUCKETS[0].counter;     // $80AFC0
    const ctr2 = BUCKETS[2].counter;     // $80AFC4
    // Drive the result FSM F0 -> F5.  F2 seeds the panel pointers ($40/$44/$48)
    // and F3 walks the slide-in table; F5 then calls draw1 + draw2 every frame.
    // P1 is live ($8103E6 = $8000 from the fixture), so draw1's P1 arm + draw2's
    // P1 block both run.
    for (let i = 0; i < 80; i++) result28D9AA(ram, ROM, ctx, slot);
    const b0 = ram.u16(ctr0);
    const b2 = ram.u16(ctr2);
    assert.ok(b0 > 0, `draw1/draw2 enqueued to bucket 0 ($23DECE): ${b0} bytes`);
    assert.ok(b2 > 0, `draw1 enqueued to bucket 2 ($23DF2A): ${b2} bytes`);
  });

test('W125 MUST-FAIL (red half): with the P1/P2 live arms gated off, draw1 still '
  + 'emits the base panels + medal counters (bucket 0 and 2 both non-zero)',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const a6 = SE.result;
    // seed the panel pointers the way F2 does (the prototype at $28E646 is four
    // longs + a word; the port's f2SpriteInit28DA70 seeds $40/$44/$48 directly)
    ram.setU32(a6 + 0x40, 0x4d001c00);
    ram.setU32(a6 + 0x44, 0x2d001c00);
    ram.setU32(a6 + 0x48, 0x0e001c00);
    ram.setU32(a6 + 0x54, 0x001bcd0c);
    ram.setU32(a6 + 0x58, 0x001be60c);
    // NO live player -> the P1/P2 arms are skipped, but the base panels + medal
    // counters still draw
    const ctr0 = BUCKETS[0].counter, ctr2 = BUCKETS[2].counter;
    draw1_28DED8(ram, ROM);
    assert.ok(ram.u16(ctr0) > 0, 'base panels went to bucket 0');
    assert.ok(ram.u16(ctr2) > 0, 'medal counters went to bucket 2');
  });

// ===========================================================================
// W649: THE NATIVE F6 BUTTON ACCELERATOR
// ===========================================================================

const F6 = {
  phase: 0x02, slide: 0x06,
  p1bee: 0x1a, p1item: 0x1e,
  p2bee: 0x24, p2item: 0x28,
  hold: 0x2c,
};

function resultF6Fixture(pools = {}) {
  const ram = new Ram();
  ram.setU8(SE.result + F6.phase, 0x07);        // F0, F1 and F4 complete
  ram.setU16(SE.result + F6.slide, 0xffff);    // F3 complete
  ram.setU16(SE.result + F6.p1bee, pools.p1bee ?? 0);
  ram.setU16(SE.result + F6.p1item, pools.p1item ?? 0);
  ram.setU16(SE.result + F6.p2bee, pools.p2bee ?? 0);
  ram.setU16(SE.result + F6.p2item, pools.p2item ?? 0);
  ram.setU16(SE.result + F6.hold, 0);
  return { ram, ctx: ctxOf(ram).ctx };
}

function resultF6Step(f) {
  result28D9AA(f.ram, ROM, f.ctx, A5);
}

function pendingScore(ram, side) {
  return ram.u32(LEDGER[side].pendingEnd - 4) >>> 0;
}

test('W649 $28DC44: a fresh P1 action edge converts both F6 pools at once',
  { skip: SKIP }, () => {
    const f = resultF6Fixture({ p1bee: 15, p1item: 40 });
    f.ram.setU16(RAM.p1edge, 0x10);

    resultF6Step(f);

    assert.equal(f.ram.u16(SE.result + F6.p1bee), 0, '$28DC5C clears the bee pool');
    assert.equal(f.ram.u16(SE.result + F6.p1item), 0, '$28DC60 clears the item pool');
    assert.equal(pendingScore(f.ram, 'p1'), 0x550,
      '$28DC50..$28DC5A converts the remaining 55 ticks into packed-BCD 550');
    assert.equal(f.ram.u8(SE.result + F6.phase) & 0x08, 0,
      '$28DD90 returns after credit; completion belongs to a later call');
  });

test('W649 $28DC44 reads the P1 EDGE mirror, so a held raw button stays slow',
  { skip: SKIP }, () => {
    const f = resultF6Fixture({ p1bee: 10, p1item: 20 });
    f.ram.setU16(RAM.p1raw, 0x70);
    f.ram.setU16(RAM.p1edge, 0);

    resultF6Step(f);

    assert.equal(f.ram.u16(SE.result + F6.p1bee), 5);
    assert.equal(f.ram.u16(SE.result + F6.p1item), 15);
    assert.equal(pendingScore(f.ram, 'p1'), 0x100,
      'the ordinary path still credits two packed-BCD $50 steps');
  });

test('W649 F6 advances each player cue throttle only once per scoring frame',
  { skip: SKIP }, () => {
    for (const side of ['p1', 'p2']) {
      const bee = `${side}bee`, item = `${side}item`;
      const timer = side === 'p1' ? 0x81df24 : 0x81df26;
      const sounds = [];
      const f = resultF6Fixture({ [bee]: 10, [item]: 10 });
      f.ctx.soundPost = value => sounds.push(value);

      resultF6Step(f);
      assert.equal(f.ram.u16(timer), 3,
        `${side} reloads its shared cue timer only once after both pools score`);
      assert.deepEqual(sounds, [0x28c6c6]);

      resultF6Step(f);
      assert.equal(f.ram.u16(timer), 2,
        `${side} spends its shared cue timer only once on the following frame`);
      assert.deepEqual(sounds, [0x28c6c6],
        `${side} does not post a second cue while the timer is live`);
    }

    const fast = resultF6Fixture({ p1bee: 10, p1item: 10 });
    const sounds = [];
    fast.ctx.soundPost = value => sounds.push(value);
    fast.ram.setU16(RAM.p1edge, 0x10);
    resultF6Step(fast);
    assert.equal(fast.ram.u16(0x81df24), 0,
      'the native accelerated award bypasses the ordinary cue throttle');
    assert.deepEqual(sounds, []);
  });

test('W649 $28DCF0 gives P2 its own edge mirror and score ledger',
  { skip: SKIP }, () => {
    const f = resultF6Fixture({ p2bee: 5, p2item: 10 });
    f.ram.setU16(RAM.p1edge, 0);
    f.ram.setU16(RAM.p2edge, 0x20);

    resultF6Step(f);

    assert.equal(f.ram.u16(SE.result + F6.p2bee), 0);
    assert.equal(f.ram.u16(SE.result + F6.p2item), 0);
    assert.equal(pendingScore(f.ram, 'p1'), 0, 'P1 remains untouched');
    assert.equal(pendingScore(f.ram, 'p2'), 0x150, 'P2 receives packed-BCD 150');
  });

test('W649 $28DC4A/$28DCF6 use exactly the native $70 action mask',
  { skip: SKIP }, () => {
    for (const edge of [0x10, 0x20, 0x40, 0x70]) {
      const f = resultF6Fixture({ p1bee: 10 });
      f.ram.setU16(RAM.p1edge, edge);
      resultF6Step(f);
      assert.equal(f.ram.u16(SE.result + F6.p1bee), 0,
        `action edge $${edge.toString(16)} accelerates`);
    }
    for (const edge of [0, 0x01, 0x02, 0x04, 0x08, 0x8000]) {
      const f = resultF6Fixture({ p1bee: 10 });
      f.ram.setU16(RAM.p1edge, edge);
      resultF6Step(f);
      assert.equal(f.ram.u16(SE.result + F6.p1bee), 5,
        `non-action edge $${edge.toString(16)} stays on the slow path`);
    }
  });

test('W649 F6 fast and slow paths conserve the same packed-BCD score',
  { skip: SKIP }, () => {
    const fast = resultF6Fixture({ p1bee: 15, p1item: 20 });
    fast.ram.setU16(RAM.p1edge, 0x40);
    resultF6Step(fast);

    const slow = resultF6Fixture({ p1bee: 15, p1item: 20 });
    for (let i = 0; i < 4; i++) resultF6Step(slow);

    assert.equal(pendingScore(fast.ram, 'p1'), 0x350);
    assert.equal(pendingScore(slow.ram, 'p1'), pendingScore(fast.ram, 'p1'));
  });

test('W649 F6 latches completion only on the later no-credit call and reloads hold',
  { skip: SKIP }, () => {
    const active = resultF6Fixture({ p1bee: 10 });
    active.ram.setU16(RAM.p1edge, 0x10);
    active.ram.setU16(0x81b610, 1);
    resultF6Step(active);
    assert.equal(active.ram.u8(SE.result + F6.phase), 0x07);
    resultF6Step(active);
    assert.equal(active.ram.u8(SE.result + F6.phase), 0x0f,
      '$28DD94 sets F6 complete after all pools were already empty');
    assert.equal(active.ram.u16(SE.result + F6.hold), 8,
      '$28DD9A uses the native nonzero-tally hold');

    const empty = resultF6Fixture();
    resultF6Step(empty);
    assert.equal(empty.ram.u8(SE.result + F6.phase), 0x0f);
    assert.equal(empty.ram.u16(SE.result + F6.hold), 1,
      '$28DDA6 uses the native empty-tally hold');
  });

// ===========================================================================
// 6. THE DEVIATION -- pinned so a later wave cannot ship past it silently
// ===========================================================================

test('W124 DEV-1 CLEARED: $8130F9 bit 1 has ONE producer, the REAL $285496 '
  + 'inside the ported tally (hud.js), and no DEV-1 stand-in remains',
  { skip: SKIP }, () => {
    const src = ['stageend.js', 'hud.js', 'boss.js', 'scheduler.js', 'handlers.js',
      'score.js', 'main.js', 'player.js', 'items.js', 'laser.js']
      .map((f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'))
      .join('\n');
    const setters = src.match(/flags9[^\n]*\|\s*0x02|0x8130f9[^\n]*\|\s*0x02/gi) ?? [];
    assert.equal(setters.length, 1,
      'exactly ONE producer of $8130F9 bit 1: the real $285496 in the tally. '
      + 'W62\'s DEV-1 stand-in ($28DE5C, which set bit 1 itself) is GONE.');
    assert.ok(!PRESENTATION_DEVIATION[0x28de5c],
      'DEV-1 key removed from PRESENTATION_DEVIATION');
    assert.ok(src.includes('tallyBody285400'),
      'the tally body $285400 is ported in hud.js');
  });

test('W435 DEV-2 CLEARED: PRESENTATION_DEVIATION is EMPTY -- this file invents '
  + 'no transition at all now', { skip: SKIP }, () => {
    assert.deepEqual(Object.keys(PRESENTATION_DEVIATION), [],
      'W124 removed DEV-1 ($28DE5C); W435 removed DEV-2 ($28D6FC) by seeding '
      + "$24652A's per-node content and honouring $28D702's bne");
  });

// W435 REPLACES 'DEV-2 IS COUNTED'. The old test asserted the port NOTED the
// wait it was skipping. It no longer skips it, so the claim to pin is the
// opposite one: with a real chain on ($8,A5), state $B HOLDS -- it does not
// free, it does not clear $8130F8, and it does not advance. That is
// `$28D702 bne.s $28D736`, whose target is the SAME $28D736 that `$28D6EA`
// sends every non-$B state to.
test('W435: state $B HOLDS while the anim chain is live, and every store past '
  + 'the bne stays UNRUN', { skip: SKIP }, () => {
  const { ram, slot } = type6Fixture();
  const { ctx, notes } = ctxOf(ram);
  const h = makeStageClear(ROM);
  let bit1Set = false;
  let reachedB = -1;
  for (let i = 0; i < 400; i++) {
    if (!bit1Set && ram.u8(slot + 0x06) === 1 && i > 10) {
      ram.setU8(SE.bossFlags9, ram.u8(SE.bossFlags9) | 0x02);
      bit1Set = true;
    }
    h(ram, slot, 0, ctx);
    // STOP the moment F8 hands over -- see the queue-cursor note below.
    if (ram.u8(slot + 0x06) === 0x0b) { reachedB = i; break; }
  }
  assert.ok(reachedB >= 0, 'F8 must have advanced state 1 -> $B');
  const handle = ram.u32(slot + 0x08) >>> 0;
  assert.ok(handle !== 0 && handle !== 0xffffffff,
    '$28DE66 jsr $24652A must have returned a real player-slot handle');
  // The chain is live and this loop deliberately does NOT run main-loop call
  // #3, so nothing steps it and state $B can never leave. 60 more calls: the
  // bound is small on purpose, because this bare-`Ram` fixture has no frame
  // reset for the sprite queue and past ~250 frames in one state the queue
  // cursor walks into the object table itself.
  ram.setU16(SE.bossFlags, 0x1234);                 // $28D722 would clear this
  for (let i = 0; i < 60; i++) h(ram, slot, 0, ctx);
  assert.equal(ram.u8(slot + 0x06), 0x0b,
    'state $B holds on a live chain -- $28D702 bne.s $28D736');
  assert.equal(ram.u16(SE.bossFlags), 0x1234,
    '$28D722 clr.w $8130F8 is PAST the bne and must not have run');
  assert.equal(ram.u16(handle) & 0x8000, 0x8000,
    '...and $28D708 jsr $246800 did not free the chain');
  assert.ok(!notes.report().join('\n').includes('$28D6FC'),
    'and the DEV-2 note is gone, because the wait is real');

  // ...and it is a WAIT, not a deadlock: run the drain and it ends. Exactly 32
  // steps, because that is what the script's timing index buys.
  let steps = 0;
  while (ram.u8(slot + 0x06) === 0x0b && steps < 200) {
    runAnimObjects24683E(ram, ROM);
    h(ram, slot, 0, ctx);
    steps++;
  }
  assert.equal(steps, 32, 'the chain drains in 32 frames and state $B ends');
  assert.equal(ram.u8(slot + 0x06), 2, '$28D72E move.b #$2,$6(A5) runs then');
  assert.equal(ram.u16(SE.bossFlags), 0, '$28D722 clr.w $8130F8 runs then too');
});

test('every emitter D-script 6 counts is keyed by the address it stands at',
  { skip: SKIP }, () => {
    for (const [k, v] of Object.entries(BOSS_NOTED)) {
      assert.ok(/^\$[0-9A-F]{6}/.test(v.trim()),
        `$${Number(k).toString(16)} must name its own call site`);
    }
    // W107 dropped this from 14 to 11: the death emitters ($289004, $2938AE,
    // $28B4BE, $242EC2) became real spawnEffect calls, not notes.
    // W382 dropped it from 11 to 9: $253564 and $242922 were already ported
    // (clamp253564 / bossClear242922) and the three boss deaths now CALL them.
    //
    // **W425 (D58) DROPS IT FROM 9 TO 5, AND ONLY ONE OF THE FOUR IS A PORT.**
    // $294134 -- the timer-D dispatch, the boss death animation's EXPLOSION
    // rattle -- is ported this wave as `d6TimerDSound`, walking the eight
    // cue-wrapper addresses the cartridge holds at $294134.
    // The other three, $28C392 / $28C2C2 / $28C2A8, were listed as deferred
    // SOUND and were never deferred at all: they have been real
    // `ctx.soundPost` calls since Wave A and NO `note()` in boss.js has passed
    // those addresses since. The table described three gaps that did not exist,
    // and nothing read it, so no census was ever wrong -- which is exactly why
    // it survived. A documentation lie with no assertion over it.
    //
    // **W433 (D64) DROPS IT FROM 5 TO 4, AND THIS ONE WAS A REAL GAP.**
    // $2440E0 -- the final boss blast, whose tail `$244ABA jsr $260E36` arms
    // the screen shake -- has been PORTED since W189 for the stage-2 and
    // stage-3 deaths, and `$293EEC` was the one call site never wired to it.
    // Unlike W425's three, this note DID fire on the real route (lf9902 of
    // out/w69/stage1-laser-hold) and 42 frames of $80B054 were missing behind
    // it, on a column state.js CLAIMS.
    //
    // **W444 (D66) DROPS IT FROM 4 TO 3, AND IT IS W425's THREE ALL OVER AGAIN.**
    // $2599EC -- the A3 stops -- was listed as one of the four things "genuinely
    // deferred", and `part1Death294E3E`/`part2Death294E94` had ALREADY RUN the
    // stops on the line above the `note()` since W62:
    //     for (const id of [0, 2, 8, 0xa, 0xc]) a3Stop2599EC(ram, id);
    //     note(ctx, 0x2599ec);            <- counting work that was just DONE
    // [M] $294E60..$294E87 and $294EB6..$294EDD are five `moveq #id / jsr $2599EC`
    // pairs and nothing else, so the port was whole and the census was reporting a
    // gap that had been closed for 382 waves.
    //
    // THIS ASSERTION WAS PINNING THAT. It is rewritten, not deleted -- and so is
    // the `raised.size` control below, which counted the dead note as evidence the
    // scan worked. The guard beneath could never have caught this one: it asks
    // "does a note() exist for this key", and one DID. `w444deferrals.test.js`
    // SECTION 2 asks the question that catches it -- "is this address ALSO an
    // exported port?" -- and $2599EC is `scheduler.js a3Stop2599EC`.
    assert.equal(Object.keys(BOSS_NOTED).length, 3);

    // THE GUARD THAT WOULD HAVE CAUGHT IT, added W425: every key must be an
    // address this file's own `note()` actually raises. Read straight out of
    // src/boss.js so the next dead entry reds here instead of accumulating.
    const src = fs.readFileSync(new URL('../src/boss.js', import.meta.url), 'utf8');
    const raised = new Set([...src.matchAll(/note\(ctx, (0x[0-9a-f]+)\)/g)]
      .map((m) => Number(m[1])));
    // W433: four, not five -- $2440E0's note() is gone because $293EEC calls it now.
    // W444: THREE, not four -- $2599EC's two note() calls are gone because both
    // sites already called `a3Stop2599EC`. Kept as a positive control on the regex,
    // and pinned to the exact set so a silently-vanishing note() reds here.
    assert.ok(raised.size >= 3, 'POSITIVE CONTROL: the scan found note() calls at all');
    assert.deepEqual([...raised].sort((x, y) => x - y).map((a) => a.toString(16)),
      ['23c4d0', '243dd0', '246410'],
      'the set of addresses boss.js note()s changed -- reconcile it with BOSS_NOTED');
    for (const k of Object.keys(BOSS_NOTED).map(Number)) {
      assert.ok(raised.has(k),
        `$${k.toString(16).toUpperCase()} is in BOSS_NOTED but nothing note()s it`);
    }
  });

test('$292902 is in the handler registry -- 19 of 19 stage-1 script handlers',
  { skip: SKIP }, () => {
    assert.ok(HANDLER_ADDRESSES.includes(0x292902));
  });

// ===========================================================================
// W503: STAGE-5 RESULT EXIT AND OBJECT TYPE $13
// ===========================================================================

test('W503: stage-5 F8 parks type 6 in state $15 and stages cartridge type $13',
  { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx, notes } = ctxOf(ram);
    const posts = [];
    ctx.soundPostD1 = (addr, d1) => posts.push([addr, d1]);
    ram.setU16(slot + 0x04, 5);
    ram.setU8(slot + 0x06, 1);
    ram.setU8(SE.result + 0x02, 0x0f);       // F0, F1, F4 and F6 already complete
    ram.setU16(SE.result + 0x06, 0xffff);    // slide-in complete
    ram.setU16(SE.result + 0x3e, 0xffff);    // medal walk complete
    ram.setU8(SE.bossFlags9, 0x02);          // the F8 handshake

    result28D9AA(ram, ROM, ctx, slot);

    assert.equal(ram.u8(slot + 0x06), 0x15, '$28DE48 move.b #$15,$6(A5)');
    assert.equal(ram.u16(ALLOC.createStage) & 0xff, 0x13,
      '$28DE4E stages dispatch index $13');
    assert.equal(ram.u16(ALLOC.createStage + ALLOC.priOff), 0x001e,
      '$240F62[$13] publishes priority $001E');
    assert.deepEqual(posts, [[0x28c186, 0]], '$28DE70/$28DE72 still posts D1=0');
    assert.ok(!notes.report().join('\n').includes('$28DE44'),
      'the former stage-5 ending note is gone');
  });

test('W503: type $13 init clears exactly 20 words and seeds $60/$10',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const slot = OBJ.base;
    const { ctx } = ctxOf(ram);
    ram.setU16(slot, 0x8013);
    ram.setU16(ENDING13.base - 2, 0x1357);
    for (let i = 0; i < ENDING13.words; i++) {
      ram.setU16(ENDING13.base + i * 2, 0xffff);
    }
    ram.setU16(ENDING13.base + ENDING13.words * 2, 0x2468);

    makeStage5Ending(ROM)(ram, slot, 0, ctx);

    assert.equal(ram.u16(ENDING13.base - 2), 0x1357, 'word below is untouched');
    for (let i = 0; i < ENDING13.words; i++) {
      const expected = i === ENDING13.timer / 2 ? 0x60
        : i === ENDING13.delay / 2 ? 0x10 : 0;
      assert.equal(ram.u16(ENDING13.base + i * 2), expected,
        `ending word ${i} matches $28EE66..$28EE86`);
    }
    assert.equal(ram.u16(ENDING13.base + ENDING13.words * 2), 0x2468,
      'word above is untouched');
    assert.equal(ram.u8(slot + 0x02), 1, '$28EE74 enters phase 1');
  });

test('W503: loop 1 preserves lives, drains the 19-node chain, and stages type 7',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const slot = OBJ.base;
    const { ctx, ev } = ctxOf(ram);
    const h = makeStage5Ending(ROM);
    ram.setU16(slot, 0x8013);
    ram.setU16(SE.p1, 0x8000);
    ram.setU16(0x8130be, 3);
    ram.setU16(0x813098, 0);                 // loop 1
    h(ram, slot, 0, ctx);                    // $28EE66 init
    ram.setU16(ENDING13.base + ENDING13.timer, 0);

    let frames = 0;
    let chainFrames = 0;
    let sawHandle = false;
    while (ram.u16(ALLOC.createStage) === 0 && frames < 300) {
      h(ram, slot, 0, ctx);
      const handle = ram.u32(ENDING13.base + ENDING13.handle) >>> 0;
      if (handle !== 0 && handle !== 0xffffffff) {
        sawHandle = true;
        chainFrames++;
      }
      runAnimObjects24683E(ram, ROM);
      frames++;
    }

    assert.equal(ram.u16(0x8130c2), 3, '$28EF38 preserves P1 lives on loop 1');
    assert.equal(ram.u16(0x8130c4), 0, 'the absent P2 side retires cleanly');
    assert.ok(sawHandle, '$28EEC6 loaded the $28D8C4 chain');
    assert.equal(chainFrames, 33,
      'the handler observes 32 live chain frames, then the zero-sum handoff frame');
    assert.ok(frames < 300, `bounded ending handoff completed in ${frames} frames`);
    assert.equal(ram.u16(ALLOC.createStage) & 0xff, 7, '$28D630 stages type 7');
    assert.equal(ram.u16(ALLOC.createStage + ALLOC.priOff),
      ROM.u16(SE.dispatch + 7 * 8 + 4), 'type 7 receives its cartridge priority');
    assert.equal(ram.u16(slot), 0, '$28EEF6 clears the type-$13 object');
    assert.ok(ev.some(([kind]) => kind === 'ending-handoff'));
  });

test('W503: loop 2 drains life, item and stock bonuses through packed BCD',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const slot = OBJ.base;
    const { ctx } = ctxOf(ram);
    const posts = [];
    ctx.soundPost = (addr) => posts.push(addr);
    const h = makeStage5Ending(ROM);
    ram.setU16(slot, 0x8013);
    ram.setU16(SE.p1, 0x8000);
    ram.setU16(0x813098, 1);                 // loop 2
    ram.setU16(0x8130be, 1);                 // one life at $5,000,000
    ram.setU16(0x8128f4, 1);                 // one item award at $10,000,000
    ram.setU8(0x81040a, 1);                  // one stock award at $500,000
    h(ram, slot, 0, ctx);                    // init
    ram.setU16(ENDING13.base + ENDING13.timer, 0);

    let frames = 0;
    while ((ram.u8(ENDING13.base + ENDING13.flagsP1) & 0x80) === 0
      && frames < 300) {
      h(ram, slot, 0, ctx);
      frames++;
    }

    assert.ok(frames < 300, `loop-2 tally completed in ${frames} frames`);
    assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x15500000,
      '$5m + $10m + $500k is packed BCD $15500000');
    assert.equal(ram.u16(0x8130be), 0, 'remaining life drained');
    assert.equal(ram.u16(0x8128f4), 0, 'item bonus drained');
    assert.equal(ram.u8(0x81040a), 0, 'stock byte drained');
    assert.equal(ram.u16(ENDING13.base + ENDING13.active), 0,
      'the P1 tally side retired');
    assert.equal(ram.u8(ENDING13.base + ENDING13.flagsP1) & 0x80, 0x80,
      'P1 completion bit is latched');
    assert.equal(posts.length, 9, 'three awards each post the three cartridge cues');
  });

test('W503: simultaneous P1/P2 awards share one three-cue post',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const slot = OBJ.base;
    const { ctx } = ctxOf(ram);
    const posts = [];
    ctx.soundPost = (addr) => posts.push(addr);
    const h = makeStage5Ending(ROM);
    ram.setU16(slot, 0x8013);
    ram.setU16(SE.p1, 0x8000);
    ram.setU16(SE.p2, 0x8000);
    ram.setU16(0x813098, 1);
    ram.setU16(0x8130be, 1);
    ram.setU16(0x8130c0, 1);
    h(ram, slot, 0, ctx);
    ram.setU16(ENDING13.base + ENDING13.timer, 0);
    h(ram, slot, 0, ctx);                    // initialize both mirrored sides
    h(ram, slot, 0, ctx);                    // both spend one life in one pass

    assert.equal(ram.u32(LEDGER.p1.pendingEnd - 4), 0x05000000);
    assert.equal(ram.u32(LEDGER.p2.pendingEnd - 4), 0x05000000);
    assert.equal(posts.length, 3, 'P2 suppresses the duplicate cue trio posted by P1');
    assert.equal(ram.u8(ENDING13.base + ENDING13.cue) & 1, 0,
      'the P2 mirror clears the shared suppression bit');
  });
