// WAVE 29 -- THE INTEGRATION: type-5's call list, and the two subsystem entry
// points it now runs.
//
// W28 measured that nothing under `src/` imported `spawn.js`, `handlers.js`,
// `mover.js` or `turret.js`: the whole W21-W27 enemy/bullet stack was verified
// against the listing and against nothing else, because it never executed.
// This file tests the WIRE -- `$2634F4`, `$281D9A`, `$281CD6`, `$25354C` -- and
// it is deliberately shaped so that "the maps have the right keys" is NOT what
// is being asserted.  W27's own worklog names that trap ("wiring is not
// behaviour", 381/381 green over seven uncalled helpers), and this wave is the
// one most exposed to it: everything it adds is a call site.
//
// Every throw assertion pins `e.romAddress`.  `27-review.md` 1A found FOUR
// assertions in this suite that matched an `Unreached` by MESSAGE TEXT, and the
// message quotes other ROM addresses in its own prose -- so a regex over it can
// pass for a throw carrying entirely the wrong address.  Not repeated here.
//
// The tests that need the real cartridge SKIP LOUDLY when the export is absent.
// A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { BUL, REC, TYPEBIT } from '../src/bullets.js';
import { MOVER } from '../src/mover.js';
import { ENEMY } from '../src/enemies.js';
import { SPAWN, installStage } from '../src/spawn.js';
import { MoveTables } from '../src/vectors.js';
import { HANDLER_ADDRESSES } from '../src/handlers.js';
import { TYPE5, TYPE5_PORTED, makeType5 } from '../src/type5.js';
import { ENEMY_FRAME, runEnemyFrame, enemyHandlerMap } from '../src/enemyframe.js';
import {
  BULLET_DRIVER, runScreenClear, runBulletDriver, runClearTimer,
} from '../src/bulletdriver.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const HAVE_TABLES = fs.existsSync(TABLES);
const TJ = HAVE_TABLES ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE_TABLES
  ? new (await import('../src/rom.js')).RomWindows(TJ.rom)
  : null;
const MOVETABLES = HAVE_TABLES ? new MoveTables(TJ, ROM) : null;
/** a W26 continuation the mover can actually dispatch (kind 4's, $2824DC). */
const CONT = 0x2824dc;
const SKIP = HAVE_TABLES ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const u16 = (v) => v & 0xffff;

function ctxOf(ram, extra = {}) {
  const log = new UnportedLog();
  return {
    ram, rom: ROM, tables: MOVETABLES, unportedLog: log, notes: log, unported: log,
    ...extra,
  };
}

/** one live bullet, PLAIN path (no bits 7/8/12/14), at slot `s`. */
function liveBullet(ram, s, f = {}) {
  const base = BUL.pool + s * BUL.stride;
  ram.setU16(base, u16(TYPEBIT.alive | (f.kind ?? 3)));
  ram.setU16(base + REC.posA, f.posA ?? 0x2000);
  ram.setU16(base + REC.posB, f.posB ?? 0x2000);
  ram.setU16(base + REC.velA, f.velA ?? 0x0010);
  ram.setU16(base + REC.velB, f.velB ?? 0x0010);
  ram.setU32(base + 0x22, f.cont ?? CONT);
  return base;
}

// ===========================================================================
// $25354C -- type-5 call #21, the screen clear's arming timer.
// ===========================================================================
//
// Six instructions, and the discriminating one is `subq.w #$1 / bne`, NOT the
// `subq / bcc` (fire-on-UNDERFLOW) shape that six of W27's seven countdowns
// use.  Applying that heuristic here would clear $81B412 one frame late and
// then again every 65,536 frames, because the word would wrap through $FFFF.
test('$25354C fires when $81B410 REACHES zero, not when it underflows', () => {
  const ram = new Ram();
  // arm = 2: decrements to 1 and must NOT clear the mode word.
  ram.setU16(BULLET_DRIVER.armWord, 2);
  ram.setU16(BULLET_DRIVER.modeWord, 0xbeef);
  assert.equal(runClearTimer(ram), false);
  assert.equal(ram.u16(BULLET_DRIVER.armWord), 1, '$81B410 2 -> 1');
  assert.equal(ram.u16(BULLET_DRIVER.modeWord), 0xbeef,
    '$81B412 survives while the timer is still running');
  // arm = 1: decrements to 0 and MUST clear it ($25355C, reached through `bne`).
  assert.equal(runClearTimer(ram), true);
  assert.equal(ram.u16(BULLET_DRIVER.armWord), 0);
  assert.equal(ram.u16(BULLET_DRIVER.modeWord), 0, '$81B412 cleared at zero');
});

test('$25354C with $81B410 already 0 writes NOTHING ($25354C beq $253562)', () => {
  const ram = new Ram();
  ram.setU16(BULLET_DRIVER.armWord, 0);
  ram.setU16(BULLET_DRIVER.modeWord, 0x1234);
  assert.equal(runClearTimer(ram), false);
  assert.equal(ram.u16(BULLET_DRIVER.armWord), 0,
    'the early-out must not decrement through zero');
  assert.equal(ram.u16(BULLET_DRIVER.modeWord), 0x1234);
});

// ===========================================================================
// $281CD6 -- the screen clear.
// ===========================================================================
test('$281CD6 does nothing at all while $81B410 is 0', () => {
  const ram = new Ram();
  const base = liveBullet(ram, 0);
  ram.setU16(BULLET_DRIVER.armWord, 0);
  ram.setU16(BULLET_DRIVER.modeWord, 0x8000);
  assert.equal(runScreenClear(ctxOf(ram)), 0);
  assert.equal(ram.u16(base), u16(TYPEBIT.alive | 3), 'the type word is untouched');
  assert.equal(ram.u16(base + 0x3c), 0, '+$3C is untouched');
});

test('$281CD6 with $81B412 NEGATIVE takes the TRANSFORM arm ($281D48)', () => {
  const ram = new Ram();
  const live = liveBullet(ram, 0);
  const dead = BUL.pool + 1 * BUL.stride;          // type word 0 -> `bpl` skips it
  ram.setU16(BULLET_DRIVER.armWord, 1);
  ram.setU16(BULLET_DRIVER.modeWord, 0x8000);
  assert.equal(runScreenClear(ctxOf(ram)), 1, 'one live slot acted on');
  assert.equal(ram.u16(live) & 0x4000, 0x4000,
    '`or.b #$40,(A6)` sets type-word bit 14 -- the mover\'s TRANSFORM path');
  assert.equal(ram.u16(live) & TYPEBIT.alive, TYPEBIT.alive, 'still alive');
  assert.equal(ram.u16(live + 0x3c), 0xffff, '$281D8A move.w #$FFFF,$3C(A6)');
  assert.equal(ram.u16(dead), 0, 'a dead slot is skipped, not stamped');
  assert.equal(ram.u16(dead + 0x3c), 0);
});

test('$281CD6 with $81B412 POSITIVE is a LOUD NAMED THROW at $27F8F8', () => {
  const ram = new Ram();
  liveBullet(ram, 0);
  ram.setU16(BULLET_DRIVER.armWord, 1);
  ram.setU16(BULLET_DRIVER.modeWord, 0x0001);
  assert.throws(() => runScreenClear(ctxOf(ram)),
    (e) => e instanceof Unreached && e.romAddress === BULLET_DRIVER.clearEffect);
  assert.equal(BULLET_DRIVER.clearEffect, 0x27f8f8);
});

// The cascade is the mover's own (`moverIterCount`, exported for exactly this
// reason).  A slot beyond the current window count is NOT swept -- which is
// what makes the shared function load-bearing rather than tidy.
test('$281CD6 sweeps the MOVER\'s slot cascade, not the whole pool', () => {
  const ram = new Ram();
  const late = liveBullet(ram, 100);               // past $45+1 = 70, inside $6D+1 = 110
  ram.setU16(BULLET_DRIVER.armWord, 1);
  ram.setU16(BULLET_DRIVER.modeWord, 0x8000);
  assert.equal(runScreenClear(ctxOf(ram)), 0, 'all four windows 0 -> 70 slots');
  assert.equal(ram.u16(late) & 0x4000, 0, 'slot 100 is out of the sweep');
  ram.setU16(MOVER.window[0], 1);                  // $281CF2 tst.w $81B414 / bne
  assert.equal(runScreenClear(ctxOf(ram)), 1, 'one window open -> 110 slots');
  assert.equal(ram.u16(late) & 0x4000, 0x4000, 'slot 100 is now swept');
});

// ===========================================================================
// $281D9A -- the bullet driver.
// ===========================================================================
test('$281D9A clears $81B40C and lets the MOVER recount it', { skip: SKIP }, () => {
  const ram = new Ram();
  liveBullet(ram, 0);
  liveBullet(ram, 5);
  ram.setU16(MOVER.liveCount, 0x1234);             // a stale count from last frame
  const r = runBulletDriver(ctxOf(ram));
  assert.equal(ram.u16(MOVER.liveCount), 2,
    '$281DA6 clr.w then the mover\'s own addq per live slot');
  assert.equal(r.live, 2);
});

test('$281D9A sets the trail cursor $81B41C = $809274 + $80AFE0',
  { skip: SKIP }, () => {
    const ram = new Ram();
    ram.setU16(BULLET_DRIVER.ctr22, 0x0024);       // bucket 22 already holds records
    runBulletDriver(ctxOf(ram));
    assert.equal(ram.u32(BULLET_DRIVER.trailCursor),
      BULLET_DRIVER.buf22 + 0x24,
      '$281DAC lea $809274,A0 / $281DB2 adda.w $80AFE0,A0 -- it APPENDS');
    assert.equal(ram.u16(BULLET_DRIVER.ctr22), 0x0024,
      '$281DCE writes the cursor difference back; nothing was emitted, so the '
      + 'length is unchanged -- faithful, not fabricated');
  });

// THE ORDER TEST.  `$281D9A bsr.w $281CD6` comes BEFORE `$281DBE bsr.b $281DDE`,
// so a bullet the clear transforms takes the mover's bit-14 path on the SAME
// frame.  Run the other way round it would take the plain path this frame and
// the transform would be a frame late for every bullet on screen.
//
// This is also the first time anything in the repo drives the bit-14 path
// ($281FA2 -> $281FB4) from a caller: W26 transcribed it and W27 recorded that
// no kind in the table reaches it.
test('$281D9A runs the CLEAR before the MOVER (bit-14 lands the same frame)',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const base = liveBullet(ram, 0, { velA: 0x0010, velB: 0x0020 });
    ram.setU32(base + 0x0a, 0x11111111);           // a sentinel the transform must overwrite
    ram.setU16(base + 0x16, 0);
    ram.setU16(BULLET_DRIVER.armWord, 1);
    ram.setU16(BULLET_DRIVER.modeWord, 0x8000);    // the TRANSFORM arm
    runBulletDriver(ctxOf(ram));
    assert.equal(ram.u16(base) & 0x4000, 0x4000, 'the clear stamped bit 14');
    assert.equal(ram.u16(base) & 0x2000, 0x2000,
      '$281FB4 `bset #$5,(A6)` is a BYTE operand -- the high byte, i.e. type-word '
      + 'bit 13.  The mover took the bit-14 path THIS frame');
    // $281FBA writes $1C1658, then $281FD4 `cmpi.w #$1,-$2(A1)` on kind 3's
    // TEMPLATE overrides it with $1C1418 ($281FDC) -- kind 3's template word IS
    // 1, measured off the cartridge here, not asserted from a constant this
    // test also wrote.  Then $282000 `addi.l #$24`.
    assert.equal(ROM.u16(ROM.u32(BUL.templatePtrs + 4 * 3) + 0x10), 1,
      'kind 3\'s template selects the $281FDC descriptor');
    assert.equal(ram.u32(base + 0x0a), (0x1c1418 + 0x24) >>> 0,
      '$281FDC move.l #$1C1418,$a(A6) then $282000 addi.l #$24');
    assert.notEqual(ram.u32(base + 0x0a), 0x11111111);
  });

// ===========================================================================
// $2634F4 -- the enemy subsystem's frame.
// ===========================================================================
test('the handler adapter covers every address in handlerMap(), and only those',
  { skip: SKIP }, () => {
    const m = enemyHandlerMap(ROM);
    assert.deepEqual([...m.keys()].sort(), [...HANDLER_ADDRESSES].sort());
    assert.equal(m.size, 18, 'W25 ported six of stage 1\'s nineteen handlers; '
      + 'W30 added $275914, $2739C0 and $276702 -- the three that BLOCKED the '
      + 'fly-around gate -- W31 added $26B6FA, the MIDBOSS, the fourth, W33 '
      + 'added $272AAC, the scripted carrier, and W36 added the seven remaining '
      + 'NON-BOSS handlers ($26A5E4 $26A860 $26AD28 $27733E $275F30 $2697F6 '
      + '$29700C): 18 of 19. The nineteenth is the stage-1 BOSS $292902, ten '
      + 'instructions of dispatch into $294AD8, and it still throws');
  });

test('an enemy whose ($4C,A5) handler is unported throws BY THAT ADDRESS',
  { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU32(SPAWN.LIVE_CURSOR, 0x231704);         // stage 1's $FFFF terminator
  const rec = ENEMY.table;
  ram.setU16(rec, 0x8000);                         // live
  ram.setU32(rec + ENEMY.subRecOff, 0x815000);     // a sub-record inside main RAM
  // W31 ported the MIDBOSS ($26B6FA), which this test used to name.  $2697F6
  // (type $31) is the next unported handler W29's survey actually reaches --
  // at logic frame 8100 -- so the test still names a REAL gap.
  ram.setU32(rec + ENEMY.handlerOff, 0x2697f6);
  const ctx = ctxOf(ram);
  assert.throws(
    () => runEnemyFrame(ram, ROM, ctx, new Map()),
    (e) => e instanceof Unreached && e.romAddress === 0x2697f6);
});

// THE ORDER TEST, and the one that proves the wire rather than the map: the
// walker (`$2634F6`) runs before the driver (`$2634FA`), so a record spawned
// THIS frame is already in the table when the driver walks it and is counted in
// $815E9C on its spawn frame.  Swap the two `bsr`s and the count is 0.
test('$2634F4 walks the SPAWN SCRIPT before the 58-slot driver',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const ctx = ctxOf(ram);
    installStage(ram, ROM, 0, ctx.unportedLog, null);      // $263386
    assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x230c6c, 'stage 1\'s script');
    // The first three stage-1 records all trigger at clock $60 and are type $11
    // -> handler $2688CC, which W25 ported.  Read from the ROM, not asserted
    // from a constant this test also wrote.
    ram.setU16(SPAWN.DISTANCE_CLOCK, ROM.u16(0x230c6c));
    const r = runEnemyFrame(ram, ROM, ctx, enemyHandlerMap(ROM));
    assert.ok(r.script >= 1, `the walker dispatched ${r.script} record(s)`);
    assert.equal(r.driven, r.script,
      'the driver walked exactly the records the walker had just created');
    assert.equal(ram.u16(ENEMY.liveCount), r.script,
      '$263546 addq.w #1,$815E9C -- counted on the SPAWN frame, which can only '
      + 'happen if $2634F6 ran before $2634FA');
  });

// ===========================================================================
// type 5 itself: the three calls must RUN, not be counted.
// ===========================================================================
test('TYPE5_PORTED is TEN of the twenty-three, and the list is the ROM\'s', () => {
  assert.equal(TYPE5.calls.length, 23, '$28B5E6..$28B66A');
  // W33 added call #3, `$28AD54` -- and ONLY its first loop, the sub-record
  // reaper.  The rest of that routine ($28AD70 onwards, reached by
  // fall-through) is still counted under its own address.
  assert.equal(TYPE5_PORTED.size, 10);
  assert.ok(TYPE5_PORTED.has(TYPE5.subReaper));
  assert.ok(TYPE5.calls.includes(TYPE5.subReaper));
  for (const a of [TYPE5.enemyFrame, TYPE5.bulletDriver, TYPE5.clearTimer]) {
    assert.ok(TYPE5.calls.includes(a), `$${a.toString(16)} is one of the 23`);
    assert.ok(TYPE5_PORTED.has(a));
  }
  assert.equal(TYPE5.enemyFrame, ENEMY_FRAME.entry);
  assert.equal(TYPE5.bulletDriver, BULLET_DRIVER.entry);
  assert.equal(TYPE5.clearTimer, BULLET_DRIVER.timer);
});

test('one type-5 pass RUNS $2634F4/$281D9A/$25354C instead of counting them',
  { skip: SKIP }, () => {
    const ram = new Ram();
    // one live enemy with a PORTED handler, plus a sub-record it can read
    const rec = ENEMY.table;
    ram.setU16(rec, 0x8000);
    ram.setU32(rec + ENEMY.subRecOff, 0x815000);
    ram.setU32(rec + ENEMY.handlerOff, 0x2688cc);          // type $11, W25
    // W30: ($2A,A5)/($2E,A5) are the sprite-EMITTER pair.  Read out of the
    // ROM's own `$267F70` rather than written as a constant this test also
    // asserts on -- a synthetic record with a zero pointer now throws by
    // address, because the board would `jsr 0`.
    ram.setU32(rec + 0x2a, ROM.u32(0x267f70));
    ram.setU32(rec + 0x2e, ROM.u32(0x267f74));
    ram.setU8(rec + 0x18, 2);                              // the aim cadence
    ram.setU32(SPAWN.LIVE_CURSOR, 0x231704);               // the script terminator
    ram.setU16(MOVER.liveCount, 0x4321);                   // a stale bullet count
    ram.setU16(BULLET_DRIVER.armWord, 3);                  // the timer must tick
    ram.setU8(0x80e240 + 2, 1);                            // ($2,A5) -- the entry test
    const ctx = ctxOf(ram, { shotSpawn: () => {}, shotRequests: () => {},
      budget: { spend: () => {} }, order: { note: () => {} } });
    makeType5(ROM)(ram, 0x80e240, 5, ctx);

    assert.equal(ram.u16(MOVER.liveCount), 0,
      '$281DA6 clr.w $81B40C ran -- the bullet driver is not a note any more');
    assert.equal(ram.u16(BULLET_DRIVER.armWord), 2, '$25354C decremented $81B410');
    assert.ok(ram.u16(ENEMY.liveCount) >= 1, '$263546 counted the live enemy');
    // ...and they are NOT in the counted-deferral ledger.  Anchored on the KEY's
    // address field: `27-review.md` F4 found two checks matching a note by prose,
    // where the prose repeats an address the check did not mean.
    const keys = [...ctx.unportedLog.calls.keys()];
    for (const a of [TYPE5.enemyFrame, TYPE5.bulletDriver, TYPE5.clearTimer]) {
      const pre = `$${a.toString(16).toUpperCase()} `;
      assert.ok(!keys.some((k) => k.startsWith(pre)),
        `$${a.toString(16)} must RUN, not be noted`);
    }
    // ...while the fourteen that are still unported ARE all counted, by address.
    for (const a of TYPE5.calls) {
      if (TYPE5_PORTED.has(a)) continue;
      const pre = `$${a.toString(16).toUpperCase()} `;
      assert.ok(keys.some((k) => k.startsWith(pre)),
        `$${a.toString(16)} is unported and must be counted by address`);
    }
  });
