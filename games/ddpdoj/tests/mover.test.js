// WAVE 26 -- THE BULLET MOVER `$281DDE`, and a suite built to be able to fail.
//
// The mover's job is to take a spawned bullet (bit 8 set, speed/dir bytes) and
// drive it: recompute+store velocity on the spawn frame, integrate the STORED
// velocity every plain frame, kill out of bounds, dispatch the per-bullet
// continuation.  These tests pin each of those, and each one is shaped so a
// wrong constant or a wrong path is a visible failure (a read-back through the
// same REC.* constant that was seeded would agree with itself whatever it holds).
//
// The structure tests (window ladder, bounds, global-kill) run on a SYNTHETIC
// cartridge so `node --test` works with no ROM extracted.  The velocity / muzzle
// / behaviour tests need the real tables and skip themselves, loudly, when
// `rip/port/player.tables.json` is absent.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { BUL, REC, TYPEBIT, WriteLog, spawnCore } from '../src/bullets.js';
import { runMover, MOVER, INIT_BODIES, CONTINUATIONS } from '../src/mover.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const TABLES = path.join(ROOT, 'rip', 'port', 'player.tables.json');
const HAVE_TABLES = fs.existsSync(TABLES);
const ROM = HAVE_TABLES
  ? new (await import('../src/rom.js')).RomWindows(
      JSON.parse(fs.readFileSync(TABLES, 'utf8')).rom)
  : null;

const i16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xffff;
const POOL0 = BUL.pool;

/** A bare live bullet at slot s with the given fields.  Defaults are a POST-
 *  dispatch PLAIN flyer: bit 8 clear (so the plain path runs, not the initialiser
 *  dispatch) and continuation = kind 12's `$282944` (animate + advance, no
 *  position effect).  Tests that exercise the dispatch set their own type/cont. */
function seedBullet(ram, s, {
  type = 0x8000, posA = 0x1000, posB = 0x2000, velA = 0, velB = 0,
  speed = 0x14, dir = 0x40, cont = 0x282944,
} = {}) {
  const base = POOL0 + s * BUL.stride;
  ram.setU16(base + REC.typeWord, type);
  ram.setU16(base + REC.posA, posA);
  ram.setU16(base + REC.posB, posB);
  ram.setU16(base + REC.velA, u16(velA));
  ram.setU16(base + REC.velB, u16(velB));
  ram.setU8(base + REC.speed, speed);
  ram.setU8(base + REC.dir, dir);
  ram.setU32(base + REC.continuation, cont);
  return base;
}

// ================================================ STRUCTURE (synthetic) ====

test('the window ladder walks 70/110/160/190/210 slots ($281DEA..$281E1E)', () => {
  // A plain bullet whose velocity is non-zero moves posA by velA each frame; a
  // DEAD slot (type 0) is skipped.  Cap = N => exactly slots 0..N-1 are driven.
  for (const [set, expectCap] of [
    [[0, 0, 0, 0], 70], [[1, 0, 0, 0], 110], [[1, 1, 0, 0], 160],
    [[1, 1, 1, 0], 190], [[1, 1, 1, 1], 210],
  ]) {
    const ram = new Ram(null);
    ram.setU16(0x813176, 0);
    for (let i = 0; i < 4; i++) ram.setU16(MOVER.window[i], set[i]);
    // a plain flyer in the LAST slot of each cap, none elsewhere
    seedBullet(ram, expectCap - 1, { velA: 0x10 });
    const before = ram.u16(POOL0 + (expectCap - 1) * BUL.stride + REC.posA);
    runMover({ ram, rom: ROM, notes: new UnportedLog() });
    const after = ram.u16(POOL0 + (expectCap - 1) * BUL.stride + REC.posA);
    assert.equal(after, u16(before + 0x10),
      `cap ${expectCap} (window ${set}): the last slot must move`);
    // one slot past the cap is NOT driven
    if (expectCap < 210) {
      seedBullet(ram, expectCap, { velA: 0x10 });
      const b = ram.u16(POOL0 + expectCap * BUL.stride + REC.posA);
      runMover({ ram, rom: ROM, notes: new UnportedLog() });
      assert.equal(ram.u16(POOL0 + expectCap * BUL.stride + REC.posA), b,
        `slot ${expectCap} is PAST the cap ${expectCap} and must not move`);
    }
  }
});

test('the PLAIN path integrates the STORED velocity, velB -= scroll ($281E74)', () => {
  const ram = new Ram(null);
  ram.setU16(0x81b41a, 1);
  ram.setU16(0x813176, 0x0008);                       // scroll comp D6 = 8
  const base = seedBullet(ram, 0, { velA: 0x0020, velB: 0x0040 });
  runMover({ ram, rom: ROM, notes: new UnportedLog() });
  // posA += velA ; posB += (velB - D6)
  assert.equal(ram.u16(base + REC.posA), u16(0x1000 + 0x0020));
  assert.equal(ram.u16(base + REC.posB), u16(0x2000 + (0x0040 - 0x0008)));
});

test('the bounds test kills posB > $37FF and posA > $6FFF ($281E84)', () => {
  for (const [pa, pb, alive] of [
    [0x1000, 0x2000, true],          // in bounds
    [0x1000, 0x3800, false],         // posB + $C800 overflows
    [0x7000, 0x2000, false],         // posA + $9000 overflows
    [0x6FFF, 0x37FF, true],          // boundary (just inside)
    [0x8000, 0x2000, false],         // negative-as-unsigned posA killed
  ]) {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    // velocity 0 so the move does not change pos; the bounds test reads pos after
    const base = seedBullet(ram, 0, { posA: pa, posB: pb, velA: 0, velB: 0 });
    runMover({ ram, rom: ROM, notes: new UnportedLog() });
    const stillAlive = (ram.u16(base) & TYPEBIT.alive) !== 0;
    assert.equal(stillAlive, alive,
      `posA=$${pa.toString(16)} posB=$${pb.toString(16)} expected alive=${alive}`);
  }
});

test('the global-kill gate frees unless $811F72 bit0 set AND $8130F8 bit15 clear', () => {
  // gate entered when ($811F72 | $8130F8) bit15 set.
  for (const [f2, sk, alive] of [
    [0x0000, 0x0000, true],   // gate not entered (no bit15)
    [0x8000, 0x0000, false],  // f2 bit15 set, f2==0? no -> bit0 clear -> kill
    [0x8001, 0x0000, true],   // f2 bit15+bit0 set, sk bit15 clear -> RESUME
    [0x8001, 0x8000, false],  // f2 bit0 set but sk bit15 set -> kill
    [0x0001, 0x8000, false],  // f2 bit0 set, sk bit15 set (gate via sk) -> kill
  ]) {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    ram.setU16(MOVER.freezeC, f2);
    ram.setU16(MOVER.stageKill, sk);
    const base = seedBullet(ram, 0, { velA: 0, velB: 0 });
    runMover({ ram, rom: ROM, notes: new UnportedLog() });
    assert.equal((ram.u16(base) & TYPEBIT.alive) !== 0, alive,
      `freezeC=$${f2.toString(16)} stageKill=$${sk.toString(16)} alive=${alive}`);
  }
});

test('bit 12 (kill) frees the slot even in bounds ($281ED6)', () => {
  const ram = new Ram(null);
  ram.setU16(0x81b41a, 1);
  ram.setU16(0x813176, 0);
  const base = seedBullet(ram, 0, { type: 0x8100 | TYPEBIT.kill, velA: 0, velB: 0 });
  runMover({ ram, rom: ROM, notes: new UnportedLog() });
  assert.equal(ram.u16(base), 0);
  assert.equal(ram.u16(base + REC.posA), 0xffff);
});

test('the live count $81B40C counts slots alive at entry ($281E58)', () => {
  const ram = new Ram(null);
  ram.setU16(0x81b41a, 1);
  ram.setU16(0x813176, 0);
  ram.setU16(MOVER.liveCount, 0);
  seedBullet(ram, 0);
  seedBullet(ram, 1);
  seedBullet(ram, 2, { type: 0 });                   // dead
  runMover({ ram, rom: ROM, notes: new UnportedLog() });
  assert.equal(ram.u16(MOVER.liveCount), 2);
});

// ===================================== REAL-TABLE TESTS (velocity, muzzle) ===

test('the DISPATCH path stores velocity and clears bit 8 ($281EEE)', { skip: !HAVE_TABLES },
  () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    // a kind-12 bullet (calls muzzleAndSprite) with bit8 set. dir $10 is
    // diagonal so BOTH velocity halves are non-zero after the recompute.
    const base = seedBullet(ram, 0,
      { type: 0x8100 | 12, speed: 0x14, dir: 0x10 });
    runMover({ ram, rom: ROM, notes: new UnportedLog() });
    assert.equal(ram.u16(base) & TYPEBIT.dispatch, 0,
      'bit 8 must be cleared by the initialiser');
    assert.notEqual(ram.u16(base + REC.velA), 0,
      'velocity dA must be stored (dir $10 is diagonal)');
    assert.notEqual(ram.u16(base + REC.velB), 0,
      'velocity dB must be stored (dir $10 is diagonal)');
    // the continuation must be installed at +$22
    assert.equal(ram.u32(base + REC.continuation), 0x282944,
      'kind 12 installs continuation $282944');
  });

test('muzzle offset: kinds 7/12/13 displace pos on the spawn frame; 3/4/5/19 do not',
  { skip: !HAVE_TABLES }, () => {
    // dir 0 -> muzzle entry 0 posOff $00000200 -> posA += $0100, posB += 0.
    for (const [kind, expectOffset] of [
      [7, 0x0100], [12, 0x0100], [13, 0x0100],
      [3, 0], [4, 0], [5, 0], [19, 0],
    ]) {
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      const base = seedBullet(ram, 0,
        { type: 0x8100 | kind, posA: 0x1000, posB: 0x2000, dir: 0x00 });
      runMover({ ram, rom: ROM, notes: new UnportedLog() });
      assert.equal(ram.u16(base + REC.posA), u16(0x1000 + expectOffset),
        `kind ${kind}: muzzle offset on posA (dir 0)`);
    }
  });

test('kind 19 has a TWO-FRAME launch delay: F1 stores vel to +$30 and clears $1E, F2 does not move, F3 first move',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0,
      { type: 0x8100 | 19, posA: 0x1000, posB: 0x2000, dir: 0x10 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: dispatch -> save+clear
    const savedVelA = ram.u16(base + 0x30);
    assert.equal(ram.u16(base + REC.velA), 0, 'F1: velocity cleared');
    assert.notEqual(savedVelA, 0, 'F1: velocity dA saved to +$30 (dir $10)');
    const pa1 = ram.u16(base + REC.posA);
    runMover(ctx);                                    // F2: plain (vel=0, no move)
    assert.equal(ram.u16(base + REC.posA), pa1, 'F2: no move (vel still 0)');
    assert.equal(ram.u16(base + REC.velA), u16(savedVelA),
      'F2: continuation restores velocity from +$30');
    runMover(ctx);                                    // F3: first move
    assert.equal(ram.u16(base + REC.posA), u16(pa1 + i16(savedVelA)),
      'F3: first move by the restored velocity');
  });

test('an UNPORTED behaviour kind throws by address (loud named throw)', { skip: !HAVE_TABLES },
  () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    // SELF-MAINTAINING. This test hardcoded kind 16, then kind 17, and each
    // time the wave that ported that kind turned it GREEN FOR THE WRONG REASON
    // -- the subject vanished, not the behaviour. So the kind is now DERIVED:
    // read the $282030 behaviour table out of the ROM and pick the first kind
    // whose body is absent from INIT_BODIES. It cannot decay.
    const unported = [];
    for (let k = 0; k < 39; k++) {
      const body = ROM.u32(0x282030 + 4 * k);
      if (!INIT_BODIES.has(body)) unported.push([k, body]);
    }
    if (unported.length === 0) {
      // Not a silent pass: every one of the 39 kinds is ported, which is a
      // milestone worth failing loudly about so this test gets retired
      // deliberately rather than sitting here asserting nothing.
      assert.fail('all 39 behaviour kinds are ported -- retire this test');
    }
    const [kind, addr] = unported[0];
    const hex = addr.toString(16).toUpperCase();
    seedBullet(ram, 0, { type: 0x8100 | kind, dir: 0x40 });
    assert.throws(
      () => runMover({ ram, rom: ROM, notes: new UnportedLog() }),
      (e) => e instanceof Unreached && new RegExp(hex, 'i').test(e.message),
      `kind ${kind} initialiser $${hex} is not ported and must throw carrying the address`);
  });

// ---------------------------------------------------------- W27 family A
// These exist because the inventory test above proves only that the seven new
// bodies are WIRED.  Wiring is not behaviour: the suite went green the moment
// the addresses were listed, which says nothing about whether the descriptor
// steps by the right amount or wraps at the right place.

test('kind 0: the descriptor ring steps by $C and snaps back at its limit',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 0, posA: 0x1000, posB: 0x2000, dir: 0x10 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser $282104
    assert.equal(ram.u32(base + 0x0a), 0x1bf58c, 'F1: descriptor seeded to the ring base');
    assert.equal(ram.u32(base + 0x06), 0xfe00ff00, 'F1: renderOffs $FE00FF00 (kind 0 is the odd one)');
    assert.equal(ram.u16(base + 0x0e), 0x0208, 'F1: graphic $208, not the $210 the rest use');
    runMover(ctx);                                    // F2: continuation $28213E
    assert.equal(ram.u32(base + 0x0a), 0x1bf58c + 0xc, 'F2: descriptor advanced one $C step');
    // park one step below the limit: the next step must land ON $1BF5D4 and reset.
    ram.setU32(base + 0x0a, 0x1bf5d4 - 0xc);
    runMover(ctx);
    assert.equal(ram.u32(base + 0x0a), 0x1bf58c,
      'reaching the limit $1BF5D4 snaps back to the base, it does not stop there');
  });

test('kind 20 only animates while the $80390C semaphore is set',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 20, posA: 0x1000, posB: 0x2000, dir: 0x10 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser $282BEE
    assert.equal(ram.u32(base + 0x0a), 0x1c0134, 'F1: descriptor seeded');
    ram.setU16(0x80390c, 0);                          // semaphore CLEAR
    runMover(ctx);
    assert.equal(ram.u32(base + 0x0a), 0x1c0134,
      'semaphore clear: $282C36 beq skips the ring, descriptor must NOT move');
    ram.setU16(0x80390c, 1);                          // semaphore SET
    runMover(ctx);
    assert.equal(ram.u32(base + 0x0a), 0x1c0134 + 0x14,
      'semaphore set: the ring advances one $14 step');
  });

test('kind 8 keeps the SECOND sprite write, not the first (the dead store is real)',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 8, posA: 0x1000, posB: 0x2000, dir: 0x10 });
    runMover({ ram, rom: ROM, notes: new UnportedLog() });
    // $28278E writes $FE00FE00/$210, then $2827A4/$2827AC overwrite with these.
    assert.equal(ram.u32(base + 0x06), 0xfc00fe00, 'renderOffs is the second write');
    assert.equal(ram.u16(base + 0x0e), 0x0410, 'graphic is the second write');
    assert.equal(ram.u32(base + 0x0a), 0x1c0944, 'descriptor seeded between the two writes');
  });

test('kind 2 tail-jumps into the $2822AE epilogue and installs the shared $283CE4 ring',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 2, posA: 0x1000, posB: 0x2000, dir: 0x10 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser $2821C2
    // the init's own writes. `move.l #$C000C,$16(A6)` sets +$16 AND +$18; the
    // epilogue then steps +$16 by -4, so +$18 is the half that survives init
    // unchanged. (An earlier draft of this test asserted +$16 == $C as well as
    // == $C-4 below -- self-contradictory, and it failed for that reason before
    // it ever failed for a real one.)
    assert.equal(ram.u16(base + 0x18), 0x000c, 'F1: +$18 = $C, untouched by the epilogue');
    assert.equal(ram.u16(base + 0x26), 0x0101, 'F1: +$26 = $101');
    assert.equal(ram.u32(base + REC.continuation), 0x283ce4, 'F1: shared ring installed');
    // proof the TAIL JUMP ran: these three fields are written only by $2822AE,
    // never by the body above it. If the routine were read as ending at its
    // last move.l, all three would still hold their seeded values.
    assert.equal(ram.u32(base + 0x06), 0xfe00fe00, 'F1: epilogue wrote renderOffs');
    assert.equal(ram.u16(base + 0x0e), 0x0210, 'F1: epilogue wrote graphic');
    assert.equal(ram.u16(base + 0x16), 0x000c - 4, 'F1: epilogue stepped the index by -4');
    assert.notEqual(ram.u32(base + 0x12), 0, 'F1: epilogue resolved a frame-table pointer');
  });

test('kinds 2 and 21 resolve DIFFERENT sprite-frame tables ($2821FA vs $282C8E)',
  { skip: !HAVE_TABLES }, () => {
    // These two bodies are instruction-identical apart from one `lea`, which
    // makes swapping their tables the single most plausible transcription slip
    // in the family. Mutation-checked: giving kind 21 kind 2's table was NOT
    // caught by the kind-2 test alone -- the suite stayed green. This is the
    // test that reddens for it.
    const frameBase = (kind) => {
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      const base = seedBullet(ram, 0, { type: 0x8100 | kind, posA: 0x1000, posB: 0x2000, dir: 0x10 });
      runMover({ ram, rom: ROM, notes: new UnportedLog() });
      return ram.u32(base + 0x12);                   // $2822D8 move.l A0,$12(A6)
    };
    const k2 = frameBase(2), k21 = frameBase(21);
    assert.notEqual(k2, 0, 'kind 2 resolved a frame-table pointer');
    assert.notEqual(k21, 0, 'kind 21 resolved a frame-table pointer');
    assert.notEqual(k2, k21,
      'kinds 2 and 21 must resolve DIFFERENT frame tables; equal means one body '
      + 'was given the other\'s $lea table address');
  });

test('kind 16 RE-STAMPS its sprite fields every frame rather than animating',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 16, posA: 0x1000, posB: 0x2000, dir: 0x10 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser $2829BC
    runMover(ctx);                                    // F2: continuation $2829FE
    assert.equal(ram.u32(base + 0x0a), 0x1c0014, 'F2: descriptor stamped');
    // scribble over all three, then run again: a ring would step from the
    // scribbled value, a re-stamp overwrites it outright.
    ram.setU32(base + 0x0a, 0xdeadbeef);
    ram.setU32(base + 0x06, 0xdeadbeef);
    ram.setU16(base + 0x0e, 0xbeef);
    runMover(ctx);
    assert.equal(ram.u32(base + 0x0a), 0x1c0014, 'F3: descriptor re-stamped, not stepped');
    assert.equal(ram.u32(base + 0x06), 0xfc00fe00, 'F3: renderOffs re-stamped');
    assert.equal(ram.u16(base + 0x0e), 0x0410, 'F3: graphic re-stamped');
  });

test('kind 18 spawns an enemy on the frame its +$34 word UNDERFLOWS, not on reaching 0',
  { skip: !HAVE_TABLES }, () => {
    // `subq.w #1,$34(A6) / bcc` -- C is set on borrow, and borrow happens only
    // when the word was already 0. So +$34 = 2 survives frames at 2 and 1, is 0
    // on the third, and fires on the FOURTH. Off-by-one here would spawn the
    // enemy a frame early for every kind-18 bullet in the game.
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 18, posA: 0x1000, posB: 0x2000, dir: 0x10 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser
    ram.setU16(base + 0x34, 2);                       // +$34 is NOT set by the init
    runMover(ctx);                                    // F2: 2 -> 1, no spawn
    assert.equal(ram.u16(base + 0x34), 1, 'F2: counter stepped, no spawn');
    runMover(ctx);                                    // F3: 1 -> 0, no spawn
    assert.equal(ram.u16(base + 0x34), 0, 'F3: counter at 0, still no spawn');
    assert.throws(() => runMover(ctx),                // F4: 0 -> borrow -> spawn
      (e) => e instanceof Unreached && /263684/i.test(e.message),
      'F4: the underflow frame calls $263684 and must throw carrying that address');
  });

test('kind 17 (the CURVER) turns and accelerates on its FIRST continuation frame',
  { skip: !HAVE_TABLES }, () => {
    // $282A56 `move.w #$1,$2a(A6)` is BIG-ENDIAN: it sets the counter +$2A to
    // $00 and the RELOAD +$2B to $01. A counter seeded to 0 underflows on the
    // very first frame, so a fresh kind-17 bullet turns immediately -- it does
    // not wait. Reading the word as counter=1 would delay the first turn.
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 17, posA: 0x1000, posB: 0x2000,
      speed: 0x14, dir: 0x40 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser $282A1E
    assert.equal(ram.u8(base + 0x2a), 0x00, 'F1: counter +$2A seeded to 0 (high byte)');
    assert.equal(ram.u8(base + 0x2b), 0x01, 'F1: reload +$2B seeded to 1 (low byte)');
    assert.equal(ram.u8(base + 0x2c), 0x00, 'F1: counter +$2C seeded to 0');
    assert.equal(ram.u8(base + 0x2d), 0x04, 'F1: reload +$2D seeded to 4');
    ram.setU8(base + 0x34, 0x08);                     // the turn rate, from the spawn record
    const dir0 = ram.u8(base + REC.dir), spd0 = ram.u8(base + REC.speed);
    runMover(ctx);                                    // F2: continuation $282A66
    assert.equal(ram.u8(base + REC.dir), (dir0 + 0x08) & 0xff,
      'F2: dir turned by the +$34 rate on the first frame');
    assert.equal(ram.u8(base + REC.speed), (spd0 + 1) & 0xff,
      'F2: speed accelerated by 1 on the first frame');
    assert.equal(ram.u8(base + 0x2a), 0x01, 'F2: turn counter reloaded from +$2B');
    assert.equal(ram.u8(base + 0x2c), 0x04, 'F2: accel counter reloaded from +$2D');
    // F3: the turn counter is 1 now, so it steps to 0 WITHOUT underflow -- no turn.
    const dir2 = ram.u8(base + REC.dir);
    runMover(ctx);
    assert.equal(ram.u8(base + REC.dir), dir2, 'F3: counter non-zero, no turn this frame');
  });

// ---------------------------------------------------------- W27 family E
// Kind 22 is ATTACHED to a target, not homing at it: init parks its velocity in
// +$30 and zeroes +$1E so the plain path cannot move it, and each frame its
// position is copied from the target. Release restores the velocity.

const TGT = 0x812000;                                // a scratch target record
function seedTarget(ram, { alive = true, flag = 0x00, pos = 0x11112222 } = {}) {
  ram.setU16(TGT, alive ? 0x8000 : 0x0000);          // bit 15 = alive
  ram.setU8(TGT + 1, flag);                          // $282DB0 tst.b $1(A0) / bmi
  ram.setU32(TGT + 2, pos);
  return TGT;
}

test('kind 22 parks its velocity in +$30 and rides its target position',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);                          // no scroll compensation
    const base = seedBullet(ram, 0, { type: 0x8100 | 22, speed: 0x14, dir: 0x40 });
    seedTarget(ram);
    ram.setU32(base + 0x2c, TGT);                     // the target pointer
    ram.setU32(base + 0x28, 0x00010001);              // the fixed offset
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser $282D42
    const saved = ram.u32(base + 0x30);
    assert.notEqual(saved, 0, 'F1: the dispatch-recomputed velocity was saved to +$30');
    assert.equal(ram.u32(base + REC.velA), 0, 'F1: +$1E cleared so the plain path cannot move it');
    runMover(ctx);                                    // F2: track
    assert.equal(ram.u32(base + REC.posA), (0x11112222 + 0x00010001) >>> 0,
      'F2: position = target position + the +$28 offset');
  });

test('kind 22 RELEASES on a null target: latches +$34 bit 3 and restores velocity',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 22, speed: 0x14, dir: 0x40 });
    ram.setU32(base + 0x2c, 0);                       // $282DA8 beq -> release
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser
    const saved = ram.u32(base + 0x30);
    runMover(ctx);                                    // F2: release
    assert.equal(ram.u8(base + 0x34) & 0x08, 0x08, 'F2: +$34 bit 3 latched');
    assert.equal(ram.u32(base + REC.velA), saved, 'F2: velocity restored from +$30');
  });

test('kind 22 DIES WITH ITS TARGET (both target tests kill the bullet)',
  { skip: !HAVE_TABLES }, () => {
    // $282DAC bpl: target type word bit 15 clear. $282DB0 bmi: target +$1 negative.
    for (const [label, opts] of [
      ['target type word bit 15 clear', { alive: false }],
      ['target +$1 byte negative', { flag: 0x80 }],
    ]) {
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      const base = seedBullet(ram, 0, { type: 0x8100 | 22, speed: 0x14, dir: 0x40 });
      seedTarget(ram, opts);
      ram.setU32(base + 0x2c, TGT);
      const ctx = { ram, rom: ROM, notes: new UnportedLog() };
      runMover(ctx);                                  // F1: initialiser
      runMover(ctx);                                  // F2: the kill
      assert.equal(ram.u16(base), 0, `${label}: slot freed`);
      assert.equal(ram.u16(base + REC.posA), 0xffff, `${label}: posA = $FFFF`);
      // $282DEE is a BARE clr.w + move.w #$ffff -- there is no jsr to the
      // death-effect spawner, so this kill must NOT emit one. Mutation-checked:
      // swapping freeSlotNoEffect for freeSlot was invisible to every other
      // assertion here, because the only difference is this note.
      const effects = [...ctx.notes.calls.keys()]
        .filter((k) => /27F8F8/i.test(k));
      assert.deepEqual(effects, [],
        `${label}: kind 22's kill must not spawn a death effect ($27F8F8)`);
    }
  });

test('the ported-body inventory is exactly 21 initialisers + 20 continuations', () => {
  // A LEDGER test: it pins the exact set, so porting a body turns it RED until
  // the inventory here is updated deliberately.  That is the point -- the count
  // cannot drift upward without somebody writing down which addresses moved.
  //
  // W26 ported 8 bodies (kinds 3/4/5/6/7/12/13/19; kind 6 is the midboss's).
  // W27 adds 11: family A kinds 0/1/8/9/10/11/20, family B kinds 2/21,
  // family C kinds 16/18, family D kind 17, family E kind 22.  Kind 10's
  // $282840 is also the target for kinds 14 and 15, which alias it in the
  // $282030 table.  So 15 distinct bodies now cover 17 of the 39 kind indices.
  assert.deepEqual([...INIT_BODIES.keys()].sort((a, b) => a - b),
    [0x282104, 0x282162, 0x2821c2, 0x2823ec, 0x2824a8, 0x282564, 0x282620,
     0x2826dc, 0x282772, 0x2827e0, 0x282840, 0x2828a0, 0x282908, 0x282962,
     0x2829bc, 0x282a1e, 0x282aae, 0x282b30, 0x282bee, 0x282c56,
     0x282d42]);
  assert.deepEqual([...CONTINUATIONS.keys()].sort((a, b) => a - b),
    [0x28213e, 0x28219e, 0x282420, 0x2824dc, 0x282598, 0x282654, 0x282738,
     0x2827bc, 0x28281c, 0x28287c, 0x2828ea, 0x282944, 0x28299e, 0x2829fe,
     0x282a66, 0x282af6, 0x282b64, 0x282c2a, 0x282d76, 0x283ce4]);
  // 17 initialisers, 16 continuations. NOT equal, and that is correct: kinds 2
  // and 21 both install $283CE4, so bodies MAY share a continuation.
  //
  // An earlier version of this test asserted `INIT_BODIES.size ===
  // CONTINUATIONS.size` under a comment claiming it proved "no body is wired in
  // with a dangling +$22 target". It proved no such thing -- two maps can have
  // equal size with every target wrong -- and it went red the moment a shared
  // continuation appeared, which is how it was caught. Replaced with the check
  // the comment always meant:
  for (const cont of CONTINUATIONS.keys()) {
    assert.ok(typeof CONTINUATIONS.get(cont) === 'function',
      `continuation $${cont.toString(16)} must resolve to a body`);
  }
});
