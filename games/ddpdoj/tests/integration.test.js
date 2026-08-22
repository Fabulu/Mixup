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

// WAVE 51 TURNED THIS TEST INSIDE OUT, and the reason is the whole point of it.
// It asserted that `$281CD6`'s positive arm THROWS at `$27F8F8`, on W29's belief
// that "nothing in the port can make `$81B410` non-zero: the only writer is the
// bomb".  `$243E7C move.w #$1,$81B410` is the second writer and `src/midboss.js`
// has ported it since W31; what was missing was the midboss's DEATH.  W51's beam
// kills it, and [M] this path then ran on the shipped seed at step 1,773 with
// fire held -- and at step 2,203 with fire merely TAPPED, i.e. **it was already
// reachable on the W45 tree by ordinary shots and no test had walked that far.**
//
// `$27F8F8` is now a counted NOTE and the two writes after it are ported.  The
// assertion is therefore the OPPOSITE one and is still a real check: the bullet
// must be cleared exactly as `$281D36`/`$281D38` clear it, and the address must
// still be named in the log rather than vanishing.
// W264 (DOCKET D3): this used to assert $27F8F8 was COUNTED. It is now WIRED, so the
// assertion is that the effect really lands in the impact pool. The mode is $0 and not
// the arbitrary $0001 this test used to pass: $81B412 holds a D0 BYTE OFFSET into
// $280BCE's twenty-entry dispatch, so an odd value was never a reachable kind.
test('$281CD6 with $81B412 POSITIVE clears the bullet and POPS an impact', () => {
  const ram = new Ram();
  const live = liveBullet(ram, 0);
  ram.setU16(BULLET_DRIVER.armWord, 1);
  ram.setU16(BULLET_DRIVER.modeWord, 0x0000);
  const c = ctxOf(ram);
  const before = ram.u16(0x817f7e);         // POOL_A.liveCount, $280B3E addq.w
  assert.equal(runScreenClear(c), 1, 'the live slot is acted on');
  assert.equal(ram.u16(live), 0, '$281D36 clr.w (A6)');
  assert.equal(ram.u16(live + 0x02), 0xffff, '$281D38 move.w #$FFFF,($2,A6)');
  assert.ok(ram.u16(0x817f7e) > before,
    '$281D2E jsr $27F8F8 -- the impact pool count really went up');
  assert.deepEqual(c.unportedLog.report(), [],
    'and nothing about it is counted any more');
  assert.equal(BULLET_DRIVER.clearEffect, 0x27f8f8);
});

// A D0 the port has not read is a loud throw naming the DISPATCH ENTRY to port, which is
// a better diagnosis than the old "unported kind". W312 took `$280BCE` to EIGHTEEN of twenty, so
// this drives $04 -- index 1, whose hook `$280CEE` belongs to `allocBee27F92A` rather than to
// this dispatch and is therefore the last kind it will ever refuse.
test('$281CD6 with an unread $81B412 names $280BCE and not a window', () => {
  const ram = new Ram();
  liveBullet(ram, 0);
  ram.setU16(BULLET_DRIVER.armWord, 1);
  ram.setU16(BULLET_DRIVER.modeWord, 0x0004);
  assert.throws(() => runScreenClear(ctxOf(ram)), (e) => e.name === 'Unreached'
    && e.romAddress === 0x280bce && /\$280C5E/.test(e.message));
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
    assert.equal(m.size, 89, 'W25 ported six of stage 1\'s nineteen SCRIPT '
      + 'handlers; W30 added $275914, $2739C0 and $276702 -- the three that '
      + 'BLOCKED the fly-around gate -- W31 added $26B6FA, the MIDMOSS, the '
      + 'fourth, W33 added $272AAC, the scripted carrier, and W36 added the '
      + 'seven remaining NON-BOSS handlers ($26A5E4 $26A860 $26AD28 $27733E '
      + '$275F30 $2697F6 $29700C): 18 OF THE 19 SCRIPT HANDLERS. The nineteenth '
      + 'is the stage-1 BOSS $292902 -- and W62 ADDED IT, so the script '
      + 'denominator is now 19 OF 19. W57 added $26C20C, which is NOT one of '
      + 'the nineteen: nothing in the script spawns type $1C -- the midboss\'s '
      + 'own death does ($26B7E0/$26B7E2). W103 added $296DD6, which is also '
      + 'NOT one of the nineteen: it is the boss\'s carrier enemy, spawned by '
      + 'E 8. W170 adds stage-2 type $95 handler $2779B6, W171 adds type '
      + '$8D handler $276A02, W172 adds $8F handler $2775CC, and W173 adds '
      + '$84 handler $2752B0, W174 adds $90 handler $279898, W175 adds '
      + '$96 handler $27A548, W176 adds $8C handler $278C0E, and W177 adds $91 '
      + 'handler $279B2E, W178 adds $92 handler $279D72, and W179 adds $97 '
      + 'handler $277F26, W180 adds $94 handler $27A1B4, and W181 adds $93 '
      + 'handler $279F4A, and W183 adds the stage-2 boss entry wrapper '
      + '$297398, W185 adds the type $4D satellite handler $29BB64, and W192 '
      + 'adds the Stage-3 type $3E handler $265486, and W193 adds type $36 '
      + '$263C7C, W194 adds type $37 $2647A6, and W195 adds type $3C '
      + '$2669E2, W196 adds type $3B $264E82, and W198 adds type $12 plus '
      + 'its direct children $13/$14 at $26C3E2/$26D4B4/$265ADC, and W199 adds '
      + 'type $3F at $265850. W200 adds type $15 and its live $17/$18 children '
      + 'at $265CA0/$265E84/$2663E0, so the map has 47 '
      + 'entries, W201 adds type $19 at $267226 for 48 entries, and W202 adds '
      + 'type $83 at $274C90 for 49 entries, and W203 adds type $16 at '
      + '$266E34 and W204 adds the Stage-3 boss $29BE28 for 51 entries; W209 '
      + 'adds its live low-HP child $29E6B0 for 52 entries, and W211 adds '
      + 'Stage-4 pulse handler $278994, W212 adds linked-structure handler '
      + '$27ACE4, W213 adds gun-pod handler $27D072, and W214 adds root/satellite '
      + 'handler $27AEE0, and W215 adds carrier/child handlers '
      + '$27B78A/$27C2FC for 58 entries, W216 adds $27D674 for 59, and W217 '
      + 'adds $27CF0C for 60. W229 catches the count up with the four the '
      + 'Stage-4 waves added after it: W218 adds $27C81A and $27DB30 for '
      + '62, W219 adds the Type-$40 BOSS $29EF0A for 63, and W223 adds the '
      + 'emitted type $41 '
      + '$2A3840 for 64, and W256 adds the type $42 children $2A3AF6 '
      + 'for 65, and W316 opens STAGE 5 with type $45 $270E36 for 66, and '
      + 'W317 adds the type $59 spawner $265A14 for 67, and W319 adds the '
      + 'zoom-drawn type $8E $2764D2 for 68, and W323 adds the four-state '
      + 'ramped aimed-pair turret $1B $269350 for 69, and W325 adds the '
      + 'P2-driven item spawner $01 $267C70 for 70, and W326 adds the REAL '
      + 'type $81, the armoured twin-muzzle $274076, for 71. W335 adds stage-5 '
      + 'type $49, the sweeping fan emplacement $271640, for 72. W337 adds stage-5 '
      + 'type $4A, the seven-way aimed fan turret $271A64, for 73, '
      + 'and W400 adds type $44, $26E02A -- the object type $43 spawns at its ramp step $3C, the '
      + 'owner of the last two unclaimed $261100 pushes, and the first entry in this map that NO '
      + 'stage script names -- for 83, and W481 adds stage-5 type $52 at '
      + '$270694 for 84. W482 through W485 add the live type $4C child chain '
      + '$4E/$4F/$50/$51 at $270222/$2702E6/$270446/$270516 for 88, and '
      + 'W487 adds type $58 at $270C66 for 89, '
      + 'against the stage-1 '
      + 'script denominator of 19/19');
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
test('TYPE5_PORTED covers all twenty-three calls in the ROM list', () => {
  assert.equal(TYPE5.calls.length, 23, '$28B5E6..$28B66A');
  // W33 added call #3, `$28AD54`'s sub-record reaper. W173 adds its inseparable
  // `$28AD70` fall-through for type `$84`'s bounded cue descriptor family.
  // W45 added #10 `$254680` and #11 `$255042`, THE BEAM's segment driver and
  // its draw.  They belong with #9 `$24C096`: the beam is a bootstrap across
  // frame boundaries -- #9 seeds a segment, #10's handler `$2548C4` runs
  // `$254C1E bset #5,(A4)`, which is the ONE instruction in build B that opens
  // #9's builders, and #11 draws what they lay down.  Any two of the three is a
  // machine that arms and never fires.
  // W53 added #12 `$28A098`, THE SHOT'S IMPACT SPARK -- pool E's driver, in the
  // same commit as its allocator `$289F54` (src/spark.js), for the reason W33 §4
  // gives about a pool with a producer and no consumer.
  // W54 added #5 `$288E4E`, THE DEATH EXPLOSION -- pool B's driver, in the
  // same commit as its allocator `$289004` (src/effects.js), which ~25 death
  // arms in src/handlers.js and src/midboss.js now call. W191 added #6
  // `$2890F2`, pool D's complete secondary-debris driver.
  // W61 added #18 `$27E99E`, THE ITEM's driver -- the call recon 59 §7 found
  // LISTED in `calls` since wave 8 and never made.  It ships in the same commit
  // as its allocator `$27E812` (src/items.js spawnItem, called from
  // `handlers.js deathSeq85`), for the same W33 §4 reason as #5 and #12.
  // W64 added #7 `$255DD8`, THE BOMB's driver -- in the same commit as its
  // allocator (`src/bomb.js fireBomb2498E2`'s `$249A4A move.w D2,(A1)`) and
  // its teardown (`$2564F0`, the only thing that frees the record), which
  // here is not just W33 §4's pool hygiene: the record gates `$24560A`'s
  // damage and six other subsystems, so a driver-less allocation would leave
  // all of them on for the rest of the stage.
  // W111 added #4 `$27F95A`, THE BEE/IMPACT pool's driver -- in the same commit
  // as its allocator `$27F92A` (src/bee.js allocBee27F92A, called from
  // handlers.js deathSeq8A) and its clear `$27F87C`, for the same W33 sec 4
  // reason: a pool with a producer and no consumer is a leak.
  // W194 adds #1 `$289B80` with type `$37`'s directly reached pool-C kind-4
  // allocator, so its death satellite is consumed rather than leaked.
  assert.equal(TYPE5_PORTED.size, 23);
  assert.ok(TYPE5_PORTED.has(TYPE5.poolCDriver));
  assert.equal(TYPE5.calls.indexOf(TYPE5.poolCDriver), 0);
  assert.ok(TYPE5_PORTED.has(TYPE5.bombDriver));
  assert.equal(TYPE5.calls.indexOf(TYPE5.bombDriver), 6, '$28B5F8 is call #7');
  assert.ok(TYPE5_PORTED.has(TYPE5.itemDriver));
  assert.ok(TYPE5.calls.includes(TYPE5.itemDriver));
  assert.equal(TYPE5.itemDriver, 0x27e99e);
  assert.equal(TYPE5.calls.indexOf(TYPE5.itemDriver), 17,
    'it is call #18 of 23 -- $28B64C -- and the POSITION is what decides that '
    + 'an item flagged by $244D62 block 2 is collected on the NEXT frame');
  assert.ok(TYPE5_PORTED.has(TYPE5.effectDriver));
  assert.ok(TYPE5.calls.includes(TYPE5.effectDriver));
  assert.equal(TYPE5.effectDriver, 0x288e4e);
  assert.ok(TYPE5_PORTED.has(TYPE5.subEffectDriver));
  assert.ok(TYPE5.calls.includes(TYPE5.subEffectDriver));
  assert.equal(TYPE5.subEffectDriver, 0x2890f2);
  assert.ok(TYPE5_PORTED.has(TYPE5.sparkDriver));
  assert.ok(TYPE5_PORTED.has(TYPE5.hyperStockTrail));
  assert.equal(TYPE5.calls.indexOf(TYPE5.hyperStockTrail), 12, '$28B62E is call #13');
  assert.ok(TYPE5.calls.includes(TYPE5.sparkDriver));
  assert.equal(TYPE5.sparkDriver, 0x28a098);
  assert.ok(TYPE5_PORTED.has(TYPE5.segmentDriver));
  assert.ok(TYPE5_PORTED.has(TYPE5.beamDraw));
  assert.ok(TYPE5.calls.includes(TYPE5.segmentDriver));
  assert.ok(TYPE5.calls.includes(TYPE5.beamDraw));
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
    // ...while the remaining unported calls ARE all counted, by address.
    for (const a of TYPE5.calls) {
      if (TYPE5_PORTED.has(a)) continue;
      const pre = `$${a.toString(16).toUpperCase()} `;
      assert.ok(keys.some((k) => k.startsWith(pre)),
        `$${a.toString(16)} is unported and must be counted by address`);
    }
  });
