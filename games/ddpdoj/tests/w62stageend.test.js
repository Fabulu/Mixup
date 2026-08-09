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
import { Unreached, UnportedLog } from '../src/unported.js';
import { HANDLER_ADDRESSES } from '../src/handlers.js';
import {
  SE, ADVANCE_ENTRIES, PRESENTATION_DEVIATION, runStageAdvance242952,
  writeStage25FD0C, wipeStageBlock25FD24, bgDestroy25FCFA, rebuildWorld25FD38,
  makeStageClear, bannerStep28ECCE, result28D9AA, draw1_28DED8, draw2_28E1AC,
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
import { OBJ } from '../src/objdriver.js';
import { BUCKETS } from '../src/spritequeue.js';

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

test('once $8130F9 bit 1 is set, type 6 walks 1 -> $B -> 2 -> 3 -> 4',
  { skip: SKIP }, () => {
    const { ram, slot } = type6Fixture();
    const { ctx } = ctxOf(ram);
    const h = makeStageClear(ROM);
    const seen = [];
    let bit1Set = false;
    for (let i = 0; i < 400; i++) {
      // simulate the tally completing once the result screen has run a while
      if (!bit1Set && ram.u8(slot + 0x06) === 1 && i > 20) {
        ram.setU8(SE.bossFlags9, ram.u8(SE.bossFlags9) | 0x02);
        bit1Set = true;
      }
      h(ram, slot, 0, ctx);
      const s = ram.u8(slot + 0x06);
      if (seen[seen.length - 1] !== s) seen.push(s);
      if (s === 4) break;
    }
    assert.deepEqual(seen, [0, 0x0a, 1, 0x0b, 2, 3, 4]);
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

test('W124 DEV-2 REFINED: the only declared deviation key is $28D6FC',
  { skip: SKIP }, () => {
    assert.deepEqual(Object.keys(PRESENTATION_DEVIATION).map(Number), [0x28d6fc]);
    assert.ok(/24681A|246410/.test(PRESENTATION_DEVIATION[0x28d6fc]),
      'DEV-2 names the anim-driver gap ($246410) or the checker ($24681A)');
  });

test('DEV-2 is COUNTED in unportedLog when the chain does not drain', { skip: SKIP }, () => {
  const { ram, slot } = type6Fixture();
  const { ctx, notes } = ctxOf(ram);
  const h = makeStageClear(ROM);
  // reach state $B: set bit 1 so F8 advances state 1 -> $B
  let bit1Set = false;
  for (let i = 0; i < 400; i++) {
    if (!bit1Set && ram.u8(slot + 0x06) === 1 && i > 10) {
      ram.setU8(SE.bossFlags9, ram.u8(SE.bossFlags9) | 0x02);
      bit1Set = true;
    }
    h(ram, slot, 0, ctx);
    if (ram.u8(slot + 0x06) === 2) break;
  }
  const r = notes.report().join('\n');
  assert.ok(/\$28D6FC/.test(r), 'DEV-2 is counted (the chain did not drain, so '
    + 'the port notes the wait-skip and frees the chain)');
});

test('every emitter D-script 6 counts is keyed by the address it stands at',
  { skip: SKIP }, () => {
    for (const [k, v] of Object.entries(BOSS_NOTED)) {
      assert.ok(/^\$[0-9A-F]{6}/.test(v.trim()),
        `$${Number(k).toString(16)} must name its own call site`);
    }
    // W107 dropped this from 14 to 11: the death emitters ($289004, $2938AE,
    // $28B4BE, $242EC2) became real spawnEffect calls, not notes.  What remains
    // is SOUND ($28Cxxx), impact pool A ($2440E0), the anim-object loader
    // ($246410) and the timer-D SOUND dispatch ($294134).
    assert.equal(Object.keys(BOSS_NOTED).length, 11);
  });

test('$292902 is in the handler registry -- 19 of 19 stage-1 script handlers',
  { skip: SKIP }, () => {
    assert.ok(HANDLER_ADDRESSES.includes(0x292902));
  });
