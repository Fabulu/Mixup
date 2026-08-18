// W382 -- SEVEN COUNTED NOTES THAT WERE SITTING ON TOP OF A WORKING PORT.
//
// Every one of these was a `note()` at a site whose routine this tree ALREADY
// translates, so the call was being skipped for no reason but staleness. Two of
// the notes also said things that are false, and one of the seven turned out to
// be a real gap wearing a wrong explanation. The tests below assert the RAM each
// routine writes, never that a function was called, and every ROM fact quoted is
// read out of `rip/sound/maincpu.bin` in the same file that uses it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';

import { bossDeath294DD4, clamp253564, bossClear242922 } from '../src/boss.js';
import { boss2Damage298310 } from '../src/boss2.js';
import { boss3Damage29C912 } from '../src/boss3.js';
import { objSlot13, SCREEN13 } from '../src/objslot13.js';
import { ALLOC } from '../src/objalloc.js';
import { handler1E_296DD6, W103 } from '../src/bossf23.js';
import { POOL_B, B } from '../src/effects.js';
import { nameFrameBands28F542, NAME_REC, CURSOR } from '../src/hiscorename.js';
import { hiscoreDefaults28841E } from '../src/hiscore.js';
import { collect25310E, collect253126, POWER } from '../src/items.js';
import { HUDRAM } from '../src/hud.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const TJ = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(TJ.rom) : null;
const MT = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const world = () => {
  const log = new UnportedLog();
  const cues = [];
  return { log, cues, ctx: { rom: ROM, tables: MT, unported: log, unportedLog: log, notes: log,
    soundPost: (a) => { cues.push(a); return true; }, clear24631C: () => {} } };
};
/** The two player records the way `$2428A6` wants to see them: P1 PLAYABLE. */
function playersAlive(ram) {
  ram.setU16(0x8103e6, 0x8000);        // negative, bit 0 clear
  ram.setU16(0x810448, 0x0000);        // P2 not in the game
}

// ===========================================================================
// 1 + 2. $253564 AND $242922 ON ALL THREE BOSS DEATHS
// ===========================================================================
// [M] the three call sites are byte-identical pairs of `4EB9`s with nothing
// between them, so neither is conditional and there is no gate to port:
//     $294DEA / $294DF0   stage 1  ($294DE4 jsr $23C4D0 immediately before)
//     $298978 / $29897E   stage 2
//     $29CAAC / $29CAB2   stage 3

test('W382 [M] all six `jsr`s are unconditional and back to back',
  { skip: SKIP_IMG }, () => {
    for (const [at, target] of [
      [0x294dea, 0x253564], [0x294df0, 0x242922],
      [0x298978, 0x253564], [0x29897e, 0x242922],
      [0x29caac, 0x253564], [0x29cab2, 0x242922],
    ]) {
      assert.equal(IMG.readUInt16BE(at), 0x4eb9,
        `$${at.toString(16).toUpperCase()} is jsr abs.l`);
      assert.equal(IMG.readUInt32BE(at + 2), target,
        `...to $${target.toString(16).toUpperCase()}`);
    }
    // And nothing sits between the pair: the second jsr starts exactly 6 bytes
    // after the first. A gate would have to live there.
    for (const first of [0x294dea, 0x298978, 0x29caac]) {
      assert.equal(IMG.readUInt16BE(first + 6), 0x4eb9,
        `no gate between the pair at $${first.toString(16).toUpperCase()}`);
    }
  });

test('W382 the stage-1 boss death CLAMPS $811F8C down to $14 and never raises it',
  { skip: SKIP }, () => {
    // `$253564 cmpi.w #$14,$811F8C / $25356C bcs / $25356E move.w #$14`. `bcs` is
    // "below", so a value under $14 is LEFT ALONE. Writing $14 unconditionally
    // would raise it, which is the inverse bug -- so both arms are asserted.
    const high = new Ram();
    playersAlive(high);
    high.setU16(0x811f8c, 0x0100);
    bossDeath294DD4(high, ROM, world().ctx, 0x812000, 0x814000);
    assert.equal(high.u16(0x811f8c), 0x14, 'above $14 is clamped DOWN');

    const low = new Ram();
    playersAlive(low);
    low.setU16(0x811f8c, 0x0003);
    bossDeath294DD4(low, ROM, world().ctx, 0x812000, 0x814000);
    assert.equal(low.u16(0x811f8c), 0x0003, 'and below $14 is untouched');
  });

test('W382 the stage-1 boss death sets $81296E and writes $FF only for a NEGATIVE record',
  { skip: SKIP }, () => {
    // `$242930 tst.w $8103E6 / $242936 bpl` SKIPS the write, and it lands at that
    // record's +$3E, not at a global. P1 negative and P2 not: exactly one byte.
    const ram = new Ram();
    playersAlive(ram);
    assert.equal(ram.u16(0x81296e), 0, 'zero before');
    bossDeath294DD4(ram, ROM, world().ctx, 0x812000, 0x814000);
    assert.equal(ram.u16(0x81296e), 1, '$242928 move.w #$1,$81296E');
    assert.equal(ram.u8(0x810424), 0xff, 'P1 is negative, so $8103E6+$3E := $FF');
    assert.equal(ram.u8(0x810486), 0x00, 'P2 is not, so $810448+$3E is LEFT ALONE');
  });

test('W382 the stage-2 boss death runs both of them too', { skip: SKIP }, () => {
  const a5 = 0x812000, a6 = 0x814000;
  const ram = new Ram();
  playersAlive(ram);
  ram.setU16(0x811f8c, 0x0100);
  ram.setU32(a5 + 0x16, 0xffffffff);   // $298480-ish: the HP pool has gone negative
  boss2Damage298310(ram, ROM, a5, a6, world().ctx);
  assert.equal(ram.u16(0x811f8c), 0x14, '$298978 jsr $253564');
  assert.equal(ram.u16(0x81296e), 1, '$29897E jsr $242922');
  assert.equal(ram.u8(0x810424), 0xff, '...and its P1 byte');
  assert.equal(ram.u8(0x810486), 0x00, '...but not P2\'s');
});

test('W382 the stage-3 boss death runs both of them too', { skip: SKIP }, () => {
  const a5 = 0x812000, a6 = 0x814000;
  const ram = new Ram();
  playersAlive(ram);
  ram.setU16(0x811f8c, 0x0100);
  ram.setU8(a6 + 0x8c, 1);             // the phase-transition block is already done
  ram.setU16(a5 + 0x1a, 1);            // and the TIMEOUT expires on this frame
  boss3Damage29C912(ram, ROM, a5, a6, world().ctx);
  assert.equal(ram.u16(0x811f8c), 0x14, '$29CAAC jsr $253564');
  assert.equal(ram.u16(0x81296e), 1, '$29CAB2 jsr $242922');
  assert.equal(ram.u8(0x810424), 0xff, '...and its P1 byte');
});

test('W382 neither address is counted as unported on any of the three deaths',
  { skip: SKIP }, () => {
    const seen = [];
    const cued = [];
    for (const run of [
      (w) => {
        const ram = new Ram(); playersAlive(ram);
        bossDeath294DD4(ram, ROM, w.ctx, 0x812000, 0x814000);
      },
      (w) => {
        const ram = new Ram(); playersAlive(ram);
        ram.setU32(0x812000 + 0x16, 0xffffffff);
        boss2Damage298310(ram, ROM, 0x812000, 0x814000, w.ctx);
      },
      (w) => {
        const ram = new Ram(); playersAlive(ram);
        ram.setU8(0x814000 + 0x8c, 1); ram.setU16(0x812000 + 0x1a, 1);
        boss3Damage29C912(ram, ROM, 0x812000, 0x814000, w.ctx);
      },
    ]) {
      const w = world();
      run(w);
      seen.push(w.log.report().join('\n'));
      cued.push(w.cues);
    }
    // **W385 TIGHTENED THESE THREE MATCHES FROM THE PROSE TO THE KEY.** `UnportedLog.report()`
    // lines are `N x $ADDR text`, so `/\$242922/` matched the ADDRESS OF A NOTE and also any
    // note whose MESSAGE happened to mention $242922. W385 gave `bossClear242922` a counted note
    // for `$28C170` -- the unmapped BGM cue `sound.js` refuses to give a WRAPPERS row -- and its
    // message names its own call site, `$242922 jsr $28C170`. The old regex read that as
    // "$242922 is deferred", which it is not: the ROUTINE is fully ported and one CALLEE inside
    // it is counted. Anchoring on ` x $ADDR ` is the fix, and it is the same key-match
    // `w384stall.test.js` uses for exactly this reason.
    //
    // **W425 (D58) TURNED THE $28C170 CONTROL INSIDE OUT, WHICH IS WHAT THIS FILE IS FOR.**
    // W385's positive control asserted `$28C170` WAS counted, and it was: `sound.js` had no
    // packer for the `$28BBAC` tier, so the boss-clear cue could only be deferred. W423 built
    // that path and W425 dispatched to it, so the note is now exactly the thing this file is
    // named after -- a note that no longer reflects reality -- and it is asserted ABSENT.
    // The control it provided is not lost, it is stronger: the cue must have been POSTED, on
    // all three deaths, which no census can fake.
    const deferred = (r, addr) => new RegExp(` x \\$${addr} `).test(r);
    for (const [n, r] of seen.entries()) {
      assert.ok(!deferred(r, '253564'), `stage ${n + 1} no longer defers $253564`);
      assert.ok(!deferred(r, '242922'), `stage ${n + 1} no longer defers $242922`);
      assert.ok(deferred(r, '23C4D0'), `stage ${n + 1} still defers $23C4D0, which is real`);
      assert.ok(!deferred(r, '28C170'),
        `stage ${n + 1} no longer defers $28C170 -- W425 posts it (D58)`);
      // POSITIVE CONTROL, and it is the owner's actual report: every one of the three boss
      // deaths reaches `$242922` and that routine's FIRST instruction is the BGM cue. If this
      // list is empty the death is silent, which is the defect D58 was opened for.
      assert.deepEqual(cued[n], [0x28c170],
        `stage ${n + 1}'s death POSTS the boss-clear cue $28C170, exactly once`);
    }
  });

test('W382 the two bodies are still the ROM\'s, called directly', { skip: SKIP }, () => {
  // The composed tests above would also pass if the bodies were wrong, so pin
  // them once more at the unit level: clamp253564 raises nothing, and
  // bossClear242922 is per-record.
  const a = new Ram(); a.setU16(0x811f8c, 0x14);
  clamp253564(a);
  assert.equal(a.u16(0x811f8c), 0x14, '$14 exactly is not "below", so it is written back as $14');

  const b = new Ram();
  b.setU16(0x8103e6, 0x0001);          // POSITIVE -- bpl skips
  b.setU16(0x810448, 0xffff);          // negative -- and bit 0 set does NOT matter here
  bossClear242922(b, world().ctx);
  assert.equal(b.u8(0x810424), 0x00, 'a positive P1 record gets nothing');
  assert.equal(b.u8(0x810486), 0xff, 'and the negative P2 record gets its own +$3E');
});

// ===========================================================================
// 3. $24107C -- STATE 4 OF OBJECT SLOT [13]
// ===========================================================================

test('W382 [M] $288A4E jsr $24107C is unconditional, and the type-$E create follows it',
  { skip: SKIP_IMG }, () => {
    assert.equal(IMG.readUInt16BE(0x288a4e), 0x4eb9);
    assert.equal(IMG.readUInt32BE(0x288a50), 0x24107c, '$288A4E jsr $24107C');
    // ORDER IS LOAD-BEARING: $24107C clears the pending-create cursor, so the
    // create has to come after it. [M] it does.
    assert.equal(IMG.readUInt16BE(0x288a54), 0x303c, '$288A54 move.w #imm,D0');
    assert.equal(IMG.readUInt16BE(0x288a56), 0x000e, '...#$E, slot [14]');
    assert.equal(IMG.readUInt16BE(0x288a58), 0x4ef9);
    assert.equal(IMG.readUInt32BE(0x288a5a), 0x241182, '$288A58 JMP $241182');
    // ...and the three calls before it are the same shape, so nothing gates any
    // of them.
    for (const at of [0x288a3c, 0x288a42, 0x288a48]) {
      assert.equal(IMG.readUInt16BE(at), 0x4eb9,
        `$${at.toString(16).toUpperCase()} is also a bare jsr`);
    }
  });

test('W382 state 4 DESTROYS the object table before staging the type-$E create',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const w = world();
    const a5 = 0x812600;
    ram.setU8(a5 + SCREEN13.state, 4);
    // A table with work in it, an ID counter mid-run, and both queue cursors
    // dirty -- the state a real screen hands to $24107C.
    for (let n = 0; n < ALLOC.slots; n++) {
      const at = ALLOC.table + n * ALLOC.stride;
      ram.setU16(at + ALLOC.typeOff, 0x8000 | (n + 1));
      ram.setU16(at + ALLOC.priOff, 0x30 + n);
      ram.setU32(at + ALLOC.idOff, 0xabcd0000 + n);
    }
    ram.setU32(ALLOC.idCounter, 0x00001234);
    ram.setU16(ALLOC.createSp, 0x0140);
    ram.setU16(ALLOC.killSp, 0x0080);
    ram.setU16(0x80e880, 0x5555);

    objSlot13(ram, ROM, a5, w.ctx);

    for (let n = 0; n < ALLOC.slots; n++) {
      const at = ALLOC.table + n * ALLOC.stride;
      assert.equal(ram.u16(at + ALLOC.typeOff), 0, `slot ${n} type cleared`);
      assert.equal(ram.u16(at + ALLOC.priOff), 0, `slot ${n} priority cleared`);
      assert.equal(ram.u32(at + ALLOC.idOff), 0, `slot ${n} id cleared`);
    }
    // $24107C stores 0, and $2411BE increments BEFORE it stores, so a counter of
    // exactly 1 after the frame is the proof that the RESET ran and then the
    // create handed out ID 1 again. $1234 would mean the reset was skipped.
    assert.equal(ram.u32(ALLOC.idCounter), 1,
      '$24107C move.l #0,$80E882, then $2411BE addq.l #1 for the type-$E create');
    assert.equal(ram.u16(0x80e880), 0, '$241086 clr.w $80E880 -- the word PAST the table');
    assert.equal(ram.u16(ALLOC.killSp), 0, '$241092 clr.w $80E23E');

    // And the create landed AFTER the reset: the staging cursor is back off zero
    // by exactly one record, carrying type $E with the DISPATCH table's priority.
    assert.equal(ram.u16(ALLOC.createSp), 0x50,
      'one staged record -- so $24108C cleared the cursor and then the create used it');
    assert.equal(ram.u16(ALLOC.createStage) & 0x3fff, SCREEN13.childType,
      'and the staged type is $E');
  });

test('W382 state 4 no longer counts $24107C', { skip: SKIP }, () => {
  const ram = new Ram();
  const w = world();
  const a5 = 0x812600;
  ram.setU8(a5 + SCREEN13.state, 4);
  objSlot13(ram, ROM, a5, w.ctx);
  assert.ok(!/\$24107C/i.test(w.log.report().join('\n')));
});

// ===========================================================================
// 4. $289004 -- THE TYPE-$1E CARRIER'S DEATH EXPLOSION
// ===========================================================================

test('W382 [M] both carrier arms are `moveq #$1,D0 / jsr $289004` and the same nine instructions',
  { skip: SKIP_IMG }, () => {
    // The argument is not guesswork: $296DFA and $296E48 are both `70 01`.
    assert.equal(IMG.readUInt16BE(0x296dfa), 0x7001, '$296DFA moveq #$1,D0');
    assert.equal(IMG.readUInt16BE(0x296e48), 0x7001, '$296E48 moveq #$1,D0');
    for (const at of [0x296dfc, 0x296e4a]) {
      assert.equal(IMG.readUInt16BE(at), 0x4eb9);
      assert.equal(IMG.readUInt32BE(at + 2), 0x289004);
    }
    // 38 bytes, byte for byte the same, at a +$4E displacement. That is why one
    // body serves both arms.
    assert.deepEqual(IMG.subarray(0x296dfa, 0x296dfa + 38),
      IMG.subarray(0x296e48, 0x296e48 + 38), 'the two arms are byte-identical');
    // ...and the last of those instructions is the bucket write, so the copy
    // covers every field the caller sets.
    assert.equal(IMG.readUInt16BE(0x296e1a), 0x317c);
    assert.equal(IMG.readUInt16BE(0x296e1c), 0x0010, 'move.w #$10,($1E,A0)');
  });

/** A live type-$1E carrier: record at A5, sub-record at A6. */
function carrier({ lifetime = 1 } = {}) {
  const ram = new Ram();
  const a5 = 0x812200, a6 = 0x814200;
  ram.setU32(a5 + 0x06, a6);
  ram.setU32(a6 + 0x02, 0x12345678);   // the position the explosion inherits
  ram.setU8(a6 + 0x1a, lifetime);
  ram.setU8(a6 + 0x1b, 0x30);          // the angle, which the caller MULTIPLIES BY FOUR
  return { ram, a5, a6 };
}
const liveEffects = (ram) => Array.from({ length: POOL_B.slots }, (_, n) => POOL_B.base
  + n * POOL_B.stride).filter((at) => ram.u16(at + B.status) !== 0);

test('W382 the carrier SPAWNS its explosion when the boss is dying', { skip: SKIP }, () => {
  const { ram, a5 } = carrier();
  ram.setU8(W103.bossFlags, 0x40);     // $296DD6 btst #$6 -- the arm's gate
  assert.equal(liveEffects(ram).length, 0, 'pool B is empty before');
  handler1E_296DD6(ram, ROM, a5, world().ctx);

  const live = liveEffects(ram);
  assert.equal(live.length, 1, 'exactly one pool-B record');
  const e = live[0];
  assert.equal(ram.u16(e + B.status), 0x8001, 'kind $1 with the live bit -- moveq #$1,D0');
  assert.equal(ram.u32(e + B.pos), 0x12345678, 'move.l ($2,A6),($2,A0)');
  assert.equal(ram.u16(e + B.bucket), 0x10, 'move.w #$10,($1E,A0)');
  // Two byte writes into ONE word. $289004 leaves ($1A,A0) zero; the caller sets
  // its HIGH byte from ($1A,A6) and its LOW byte to the angle times four.
  assert.equal(ram.u8(e + B.speed), 1, 'move.b ($1A,A6),($1A,A0) -- the lifetime byte');
  assert.equal(ram.u8(e + B.angle), 0xc0, '$30 doubled TWICE, not once: $C0');
});

test('W382 the carrier spawns the SAME explosion when its lifetime runs out',
  { skip: SKIP }, () => {
    // The second arm, $296E48. Reached with the boss alive, the tick byte at 0
    // so the `bcc` falls through, and the lifetime byte at 1 so it decrements
    // to zero.
    const { ram, a5, a6 } = carrier({ lifetime: 1 });
    ram.setU8(a5 + 0x26, 0);           // $296E2E subq.b: 0 - 1 borrows, so the arm runs
    ram.setU8(a5 + 0x27, 4);
    ram.setU8(a6 + 0x1b, 0x41);        // $41 * 4 = $104, truncated to a BYTE = $04
    handler1E_296DD6(ram, ROM, a5, world().ctx);

    const live = liveEffects(ram);
    assert.equal(live.length, 1, 'the lifetime arm spawns too');
    assert.equal(ram.u16(live[0] + B.status), 0x8001);
    assert.equal(ram.u8(live[0] + B.angle), 0x04,
      'add.b twice TRUNCATES -- a 16-bit shift would leave $104');
  });

test('W382 a carrier that is neither dying nor expiring spawns NOTHING',
  { skip: SKIP }, () => {
    // The negative arm. Boss alive, tick byte high so the lifetime is not even
    // read: no explosion, which is what says the two arms are the condition.
    const { ram, a5 } = carrier({ lifetime: 8 });
    ram.setU8(a5 + 0x26, 0x20);
    handler1E_296DD6(ram, ROM, a5, world().ctx);
    assert.equal(liveEffects(ram).length, 0, 'no pool-B record on a normal frame');
  });

test('W382 the carrier no longer counts $289004', { skip: SKIP }, () => {
  const { ram, a5 } = carrier();
  ram.setU8(W103.bossFlags, 0x40);
  const w = world();
  handler1E_296DD6(ram, ROM, a5, w.ctx);
  assert.ok(!/\$289004/i.test(w.log.report().join('\n')));
});

// ===========================================================================
// 5. $28F606 -- THE NAME-ENTRY TIMEOUT
// ===========================================================================

test('W382 [M] $28F55A is a `bcc.w` whose target is $28F606, the finish body',
  { skip: SKIP_IMG }, () => {
    assert.equal(IMG.readUInt16BE(0x28f556), 0x0c47, '$28F556 cmpi.w #imm,D7');
    assert.equal(IMG.readUInt16BE(0x28f558), 0x0738, '...#$738 frames');
    assert.equal(IMG.readUInt16BE(0x28f55a), 0x6400, '$28F55A bcc.w');
    // TRAP 4: the target is the EXTENSION WORD's address plus the displacement.
    const disp = IMG.readUInt16BE(0x28f55c);
    assert.equal(0x28f55c + disp, 0x28f606,
      'so the time limit lands on $28F606 -- not on some unported body');
    // And it lands PAST $28F598's empty-name test, which is why a timeout with
    // nothing typed still runs the finish body.
    assert.equal(IMG.readUInt16BE(0x28f606), 0x302c, '$28F606 move.w ($18,A4),D0');
  });

const A4 = 0x81f200;
const ROWBASE = 0x803838;
// `hiscorename.js` keeps these two blocks module-private, so they are restated
// here from the same instructions their own comments cite.
const TIMEOUT = { frame: 0x02, counter: 0x1e, armed: 0x70 };  // ($2,A4) / ($1E,A4) / #$70
const INPUT = { count: 0x16, endCell: CURSOR.endCell };       // ($16,A4) / cmpi.w #$1B
function nameFixture(count, cell) {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  ram.setU32(A4 + NAME_REC.entry, ROWBASE);
  ram.setU16(A4 + INPUT.count, count);
  ram.setU16(A4 + CURSOR.cellField, cell);
  for (let k = 0; k < 3; k++) ram.setU32(ROWBASE + k * 4, 0xdead0000 + k);
  return ram;
}

test('W382 the name-entry TIME LIMIT commits the name and arms the countdown',
  { skip: SKIP }, () => {
    // Two characters typed, the cursor on a third, and the frame counter one
    // short of $738. The band function used to note this and return; now it
    // writes the third character and runs $28F6A8's tail.
    const ram = nameFixture(2, 5);
    const w = world();
    ram.setU16(A4 + TIMEOUT.frame, 0x737);
    assert.equal(ram.u16(A4 + TIMEOUT.counter), 0, 'the countdown is not armed yet');

    assert.equal(nameFrameBands28F542(ram, ROM, A4, w.ctx), 'over');

    assert.equal(ram.u16(A4 + INPUT.count), 3, 'the third character went in');
    assert.equal(ram.u32(ROWBASE + 2 * 4), 5 * 4,
      '$28F628 move.l D0,(A0,D1.w) -- the cell UNDER THE CURSOR, times four');
    assert.equal(ram.u16(A4 + TIMEOUT.counter), TIMEOUT.armed,
      '$28F6B6 move.w #$70,($1E,A4) -- and that is what makes the commit final');
    assert.equal(ram.u32(A4 + 0x1a), 0, '$28F6BC/$28F6BE clear ($1A,A4)');
  });

test('W382 the frame BEFORE the limit still commits nothing', { skip: SKIP }, () => {
  const ram = nameFixture(2, 5);
  const w = world();
  ram.setU16(A4 + TIMEOUT.frame, 0x736);
  assert.equal(nameFrameBands28F542(ram, ROM, A4, w.ctx), 'input', 'frame $737 is still input');
  assert.equal(ram.u16(A4 + INPUT.count), 2, 'nothing was written');
  assert.equal(ram.u16(A4 + TIMEOUT.counter), 0, 'and the countdown is still unarmed');
  assert.equal(ram.u32(ROWBASE + 2 * 4), 0xdead0002, 'the row is untouched');
});

test('W382 a timeout with the cursor on END writes the DEFAULT name', { skip: SKIP }, () => {
  // `$28F61A cmpi.w #$1B / bcs` -- at or past cell $1B the finish body takes the
  // default arm instead. The timeout inherits that, because it enters at $28F606.
  const ram = nameFixture(1, INPUT.endCell);
  const w = world();
  ram.setU16(A4 + TIMEOUT.frame, 0x737);
  assert.equal(nameFrameBands28F542(ram, ROM, A4, w.ctx), 'over');
  assert.notEqual(ram.u32(ROWBASE), 0xdead0000, 'the row was overwritten');
  assert.equal(ram.u16(A4 + TIMEOUT.counter), TIMEOUT.armed, 'and it still committed');
});

test('W382 the time-limit arm is no longer counted', { skip: SKIP }, () => {
  const ram = nameFixture(2, 5);
  const w = world();
  ram.setU16(A4 + TIMEOUT.frame, 0x737);
  nameFrameBands28F542(ram, ROM, A4, w.ctx);
  assert.ok(!/\$28F606/.test(w.log.report().join('\n')));
});

// ===========================================================================
// 6. $2878CC -- THE LIVES ROW, WHICH THE NOTE CALLED SOMETHING ELSE
// ===========================================================================

test('W382 [M] $8130BE is BOTH the item counter and the lives word the row draws',
  { skip: SKIP_IMG }, () => {
    // The note claimed $2878CC was "the $8130BE icon row" of an unported HUD
    // subsystem. It is P1's LIVES row, ported since W116, and $8130BE is the
    // word it reads -- which is why bumping the counter redraws it.
    assert.equal(POWER.counterP1, HUDRAM.aliveP1, '$8130BE is one address, not two');
    assert.equal(POWER.counterP2, HUDRAM.aliveP2, 'and so is $8130C0');
    assert.equal(IMG.readUInt16BE(0x25311e), 0x4eb9);
    assert.equal(IMG.readUInt32BE(0x253120), 0x2878cc, '$25311E jsr $2878CC');
    assert.equal(IMG.readUInt32BE(0x253138), 0x28795c, '$253136 jsr $28795C');
    // The ONLY gate is the cap, and it skips the increment as well as the draw.
    assert.equal(IMG.readUInt16BE(0x253116), 0x670c, '$253116 beq $253124');
    assert.equal(IMG.readUInt16BE(0x253124), 0x4e75, '...straight to the rts');
  });

/** The text printer needs its deferred-write cursor armed, exactly as camReset
 *  does in production. Returns how many (dest,tile) pairs a body appended. */
function armedText() {
  const ram = new Ram();
  ram.setU32(0x80c8d8, 0x80b058);
  return ram;
}
const textCells = (ram) => (ram.u32(0x80c8d8) - 0x80b058) / 8;

test('W382 collecting an item DRAWS P1\'s lives row, and the cap stops it',
  { skip: SKIP }, () => {
    const ram = armedText();
    const w = world();
    ram.setU16(POWER.counterP1, 3);          // three lives showing
    ram.setU16(HUDRAM.shipSelectBodyP1, 0);

    assert.equal(collect25310E(ram, ROM, w.ctx), false, '$253116 returns CARRY CLEAR');
    assert.equal(ram.u16(POWER.counterP1), 4, '$253118 addq.w #1');
    // Six vertical slots -- four icons and two blanks -- and each slot is a
    // TWO-CELL-wide icon (D2 = 1), so the printer emits twelve (dest,tile) pairs.
    assert.equal(textCells(ram), 12, 'the row drew all six slots, two cells each');

    // The capped arm: `beq $253124` skips the increment AND the draw.
    const capped = armedText();
    capped.setU16(POWER.counterP1, POWER.counterCap);
    assert.equal(collect25310E(capped, ROM, w.ctx), false);
    assert.equal(capped.u16(POWER.counterP1), POWER.counterCap, 'the counter did not move');
    assert.equal(textCells(capped), 0, 'and NOTHING was drawn -- the gate is real');
  });

test('W382 the P2 mirror draws P2\'s row, on P2\'s own word', { skip: SKIP }, () => {
  const ram = armedText();
  const w = world();
  ram.setU16(POWER.counterP2, 2);
  collect253126(ram, ROM, w.ctx);
  assert.equal(ram.u16(POWER.counterP2), 3);
  assert.equal(textCells(ram), 12, '$253136 jsr $28795C');
  assert.equal(ram.u16(POWER.counterP1), 0, 'and P1\'s word was not touched');
});

test('W382 neither collector counts a HUD address any more', { skip: SKIP }, () => {
  const w = world();
  const ram = armedText();
  collect25310E(ram, ROM, w.ctx);
  collect253126(ram, ROM, w.ctx);
  const r = w.log.report().join('\n');
  assert.ok(!/\$2878CC/i.test(r), '$2878CC is not deferred');
  assert.ok(!/\$28795C/i.test(r), 'and neither is $28795C');
});

// ===========================================================================
// 7. $28AC72 -- THREE SITES WIRED, ONE LEFT, AND THE BYTES THAT DECIDED IT
// ===========================================================================

test('W382 [M] all four $28AC72 sites are unconditional `jsr`s', { skip: SKIP_IMG }, () => {
  for (const [at, what] of [[0x274858, 'type $82'], [0x273aa4, 'type $80'],
    [0x275fd6, 'type $88'], [0x26b8f0, 'the midboss']]) {
    assert.equal(IMG.readUInt16BE(at), 0x4eb9, `${what} site is jsr abs.l`);
    assert.equal(IMG.readUInt32BE(at + 2), 0x28ac72, `${what} calls $28AC72`);
    // The instruction that FOLLOWS is the freeze test in every case, which is
    // the same shape the fourteen already-live sites have.
    assert.equal(IMG.readUInt16BE(at + 6) & 0xff00, 0x4a00, `${what}: tst follows`);
  }
  // $26B8EE is a `nop`, so nothing is hiding in front of the midboss's call.
  assert.equal(IMG.readUInt16BE(0x26b8ee), 0x4e71, '$26B8EE nop');
});

test('W382 [M] types $80/$82/$88 open their cue list with a NEGATIVE word, so the '
  + 'faithful call does nothing', { skip: SKIP_IMG }, () => {
  // `$28AC72 movea.l ($44,A5),A1 / move.w (A1)+,D0 / $28AC78 bmi` -- a negative
  // first word exits before any descriptor is touched. Each type's init writes
  // ($44,A5) itself, so these three addresses are the whole story.
  for (const [type, at] of [['$80', 0x27394e + 28], ['$82', 0x274770 + 28],
    ['$88', 0x275ecc + 28]]) {
    const head = IMG.readUInt16BE(at);
    assert.ok((head & 0x8000) !== 0,
      `type ${type}'s list at $${at.toString(16).toUpperCase()} opens $${
        head.toString(16).toUpperCase()} -- negative, so $28AC78 bmi exits`);
  }
  assert.equal(IMG.readUInt16BE(0x28ac78), 0x6b22, '$28AC78 bmi -- the exit');
});

test('W382 [M] the MIDBOSS list is NOT empty, and its descriptor is outside the ported closure',
  { skip: SKIP_IMG }, () => {
    // This is why the midboss site stayed a note. Its list is one record and a
    // terminator, and the record selects a FOURTH descriptor kind.
    const list = 0x26b50e + 28 * 17;
    assert.equal(list, 0x26b6ea, 'type $0D init: $26B50E + 28 * 17');
    assert.equal(IMG.readUInt16BE(list), 0x2e60, 'threshold $2E60 -- POSITIVE, so it runs');
    assert.equal(IMG.readUInt16BE(list + 14), 0xffff, 'and $26B6F8 terminates the list');
    const script = IMG.readUInt32BE(list + 10);
    assert.equal(script, 0x28af98, 'its cue script');
    const index = IMG.readUInt16BE(script);
    assert.equal(index, 0x000c, '$28ACD6 move.w (A1)+,D0 -- dispatch byte offset $C');
    const desc = IMG.readUInt32BE(0x28afd4 + index);
    assert.equal(desc, 0x28b08e, 'dispatch[$C] = $28B08E');
    for (const known of [0x28b024, 0x28b042, 0x28b060]) {
      assert.notEqual(desc, known,
        'and it is none of type $84\'s three, which is all cues.js ports');
    }
  });

/** A live enemy record for the $80/$82/$88 handlers, with the cue-script pointer
 *  the type's own init writes to `($44,A5)`. */
function enemy(cueList) {
  const ram = new Ram();
  const a5 = 0x812800, a6 = 0x814800;
  ram.setU16(a5, 0x8000);
  ram.setU32(a5 + 0x06, a6);
  ram.setU32(a6 + 0x02, 0x40002000);
  ram.setU16(a6 + 0x18, 0x0100);
  ram.setU16(a6 + 0x38, 0x0100);
  ram.setU8(a5 + 0x16, 1);
  ram.setU16(0x813092, 1);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x7000); ram.setU16(0x8103ea, 0x7000);
  ram.setU32(a5 + 0x44, cueList);
  ram.setU16(a5 + 0x22, 0x40);         // no aim this frame
  ram.setU8(a5 + 0x1e, 0x40);          // and no fire
  return { ram, a5, a6 };
}
const liveCues = (ram) => Array.from({ length: 10 }, (_, n) => 0x81db90 + n * 0x26)
  .filter((at) => ram.u16(at) !== 0);

test('W382 the type-$88 site really runs $28AC72 -- given a list, a cue lands in $81DB90',
  { skip: SKIP }, async () => {
    const { runHandler } = await import('../src/handlers.js');
    // The FAITHFUL case first: type $88's own list at $275EE8 opens $8000, so
    // `$28AC78 bmi` exits and the cartridge installs nothing.
    const own = enemy(0x275ee8);
    runHandler(0x275f30, own.ram, ROM, own.a5, world().ctx);
    assert.equal(liveCues(own.ram).length, 0, 'type $88 spawns no cue, because its list is empty');
    assert.equal(own.ram.u32(own.a5 + 0x44), 0x275ee8, 'and ($44,A5) does not advance');

    // Now the CONTROL: point ($44,A5) at type $84's list, whose first threshold
    // $1F72 is positive and >= this record's HP. If the `jsr` were still a note
    // neither of these could move.
    const seeded = enemy(0x275276);
    runHandler(0x275f30, seeded.ram, ROM, seeded.a5, world().ctx);
    const cues = liveCues(seeded.ram);
    assert.ok(cues.length > 0, '$28AC72 allocated out of the ten-slot pool');
    assert.equal(seeded.ram.u32(cues[0] + 0x10), seeded.a6,
      'the cue\'s parent is this record\'s sub-record');
    assert.notEqual(seeded.ram.u32(seeded.a5 + 0x44), 0x275276,
      '$28ACC0 move.l A1,($44,A5) -- the cursor advanced past what it consumed');
    assert.ok(seeded.ram.u16(0x81dd0c) > 0, '$28AD40 addq.w #1,$81DD0C -- the live count');
  });

test('W382 the three wired sites no longer count $28AC72, and the midboss still does',
  { skip: SKIP }, async () => {
    const { runHandler } = await import('../src/handlers.js');
    for (const [entry, list, what] of [
      [0x2739c0, 0x27396a, 'type $80'],
      [0x2747c6, 0x27478c, 'type $82'],
      [0x275f30, 0x275ee8, 'type $88'],
    ]) {
      const e = enemy(list);
      const w = world();
      runHandler(entry, e.ram, ROM, e.a5, w.ctx);
      assert.ok(!/\$28AC72/i.test(w.log.report().join('\n')),
        `${what} no longer defers $28AC72`);
    }

    const { handlerMidboss } = await import('../src/midboss.js');
    const ram = new Ram();
    const w = world();
    const a5 = 0x81364c, a6 = 0x81459c;
    ram.setU16(a5, 0x800d);
    ram.setU32(a5 + 0x06, a6);
    ram.setU32(a6 + 0x02, 0x40002000);
    ram.setU16(a6 + 0x18, 0x0100);
    ram.setU8(a5 + 0x16, 1);
    for (let n = 0; n < 8; n++) ram.setU16(a6 + 0x40 + n * 0x40, 0x8000);
    ram.setU16(0x8103e6, 0x8000);
    handlerMidboss(ram, ROM, a5, w.ctx);
    const r = w.log.report().join('\n');
    assert.match(r, /\$28AC72/, 'the midboss still defers it');
    assert.match(r, /\$28B08E/, '...and now says WHY: the descriptor, not the pool');
    assert.ok(!/result is unused/.test(r), 'the old, misleading reason is gone');
  });
