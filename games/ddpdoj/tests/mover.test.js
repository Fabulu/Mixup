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
import { velocity } from '../src/bulletmath.js';
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

// ============================================ W27 FAMILY E (finished) + F ====
//
// Kind 24 ($282EBC) shares kind 22's initialiser byte for byte but its
// continuation has NO TRACK ARM -- the `beq` that sends kind 22 to $282DA4
// sends kind 24 straight to the release at $282F46.  Kinds 23 and 24 then share
// a decel block ($282E64 == $282F16) whose +$36 duration word has THREE states.
//
// NOTE +$2C IS A DIFFERENT FIELD IN THE TWO BODIES.  In kind 22 it is the
// TARGET POINTER longword; in kinds 23/24 the same bytes are a countdown (+$2C),
// its reload (+$2D) and the deceleration step (+$2E, the low half of what kind
// 22 reads as a pointer).  Nothing in the record says which; only the body does.

test('kind 23 (the DECELERATOR) subtracts +$2E from velA on the +$2C underflow, '
  + 'and the +$36 duration word has three states ($282E64)',
  { skip: !HAVE_TABLES }, () => {
    for (const [label, dur, expectDecel, expectDur] of [
      ['+$36 = 0: beq skips the WHOLE block', 0x0000, false, 0x0000],
      ['+$36 positive: decelerate and count down', 0x0005, true, 0x0004],
      ['+$36 negative: bmi -> decelerate forever, no count down', 0xffff, true, 0xffff],
    ]) {
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      // dir $20 (not $40): at $40 the velocity is purely horizontal and velA is
      // 0, so a subtraction from it would be invisible. Diagonal makes it visible.
      const base = seedBullet(ram, 0, { type: 0x8100 | 23, speed: 0x14, dir: 0x20 });
      ram.setU16(base + 0x36, dur);
      ram.setU8(base + 0x2c, 0x00);                   // counter 0 -> underflows at once
      ram.setU8(base + 0x2d, 0x07);                   // the reload
      ram.setU16(base + 0x2e, 0x0030);                // the deceleration step
      const ctx = { ram, rom: ROM, notes: new UnportedLog() };
      runMover(ctx);                                  // F1: initialiser $282E00
      const v1 = ram.u16(base + REC.velA);
      assert.notEqual(v1, 0, 'F1: the dispatch path stored a real velocity at +$1E');
      runMover(ctx);                                  // F2: continuation $282E4A
      assert.equal(ram.u16(base + 0x36), expectDur, `${label}: +$36`);
      if (expectDecel) {
        assert.equal(ram.u16(base + REC.velA), u16(v1 - 0x0030),
          `${label}: velA -= the +$2E word`);
        assert.equal(ram.u8(base + 0x2c), 0x07, `${label}: +$2C reloaded from +$2D`);
      } else {
        assert.equal(ram.u16(base + REC.velA), v1, `${label}: velA untouched`);
        assert.equal(ram.u8(base + 0x2c), 0x00,
          `${label}: the beq skips the +$2C tick as well as the subtraction`);
      }
      // the ring animates UNCONDITIONALLY here -- no bit-11 flip-flop gate.
      assert.equal(ram.u32(base + 0x0a), (0x1c0e0c + 0x24) >>> 0,
        `${label}: the descriptor ring stepped on this frame`);
    }
  });

test('kind 24 has NO track arm: it RELEASES on its first continuation frame and '
  + 'never reads a target pointer ($282EF6 beq -> $282F46)',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 24, speed: 0x14, dir: 0x40 });
    // Seed exactly what kind 22 would ride: a live target and a +$28 offset. If
    // kind 24 were ported as kind 22's continuation the position would become
    // target+offset; the ROM never looks at either field here.
    seedTarget(ram, { pos: 0x11112222 });
    ram.setU32(base + 0x2c, TGT);
    ram.setU32(base + 0x28, 0x00010001);
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser $282EBC
    const saved = ram.u32(base + 0x30);
    assert.notEqual(saved, 0, 'F1: velocity parked in +$30');
    assert.equal(ram.u32(base + REC.velA), 0, 'F1: +$1E cleared -> one stationary frame');
    runMover(ctx);                                    // F2: the release
    assert.notEqual(ram.u32(base + REC.posA), (0x11112222 + 0x00010001) >>> 0,
      'F2: kind 24 must NOT ride the target position -- that is kind 22');
    assert.equal(ram.u8(base + 0x34) & 0x08, 0x08, 'F2: +$34 bit 3 latched');
    assert.equal(ram.u32(base + REC.velA), saved, 'F2: velocity restored from +$30');
  });

test('kind 24 returns from the release arm BEFORE the decel block, and decelerates '
  + 'only from the frame after ($282F52 vs $282F3C)',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 24, speed: 0x14, dir: 0x40 });
    ram.setU16(base + 0x36, 0x0005);
    ram.setU8(base + 0x2c, 0x00);
    ram.setU8(base + 0x2d, 0x07);
    ram.setU16(base + 0x2e, 0x0030);
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: initialiser
    const saved = ram.u32(base + 0x30);
    runMover(ctx);                                    // F2: the release arm
    assert.equal(ram.u16(base + 0x36), 0x0005,
      'F2: the release arm advances at $282F52 -- the decel block is not reached');
    assert.equal(ram.u8(base + 0x2c), 0x00, 'F2: +$2C not ticked on the release frame');
    assert.equal(ram.u16(base + REC.velA), (saved >>> 16) & 0xffff,
      'F2: velocity restored intact, not restored-then-decelerated');
    runMover(ctx);                                    // F3: the animate+decel arm
    assert.equal(ram.u16(base + 0x36), 0x0004, 'F3: +$36 counted down');
    assert.equal(ram.u16(base + REC.velA), u16(((saved >>> 16) & 0xffff) - 0x0030),
      'F3: velA -= the +$2E word');
  });

// ==================================== W27 FAMILIES G + L: the WALL BOUNCERS ==
//
// Kinds 25/29/34 share an initialiser and an animation tail and differ ONLY in
// the direction transform per wall and the velocity scaling.  The recon had the
// two variants swapped (it credited kind 29 with the `addi.b #$80` and kind 34
// with `neg+80`); these tests pin what the listing actually does, per wall.

/** Park a bouncer ON a wall with ZERO velocity -- so the plain path cannot move
 *  it between the initialiser frame and the continuation frame -- and run one
 *  continuation.  Zeroing +$1E also proves the velocity seen afterwards was
 *  RECOMPUTED by the bounce and not left over from the spawn frame. */
function bounceOnce(kind, { posA, posB, dir = 0x30, speed = 0x14 }) {
  const ram = new Ram(null);
  ram.setU16(0x81b41a, 1);
  ram.setU16(0x813176, 0);
  const base = seedBullet(ram, 0, { type: 0x8100 | kind, speed, dir });
  const ctx = { ram, rom: ROM, notes: new UnportedLog() };
  runMover(ctx);                                      // F1: the initialiser
  assert.equal(ram.u32(base + 0x0a), 0x1c1b68, 'F1: descriptor = $1C1B68');
  assert.equal(ram.u16(base + 0x2c), 1, 'F1: +$2C seeded with one bounce');
  ram.setU16(base + REC.posA, posA);
  ram.setU16(base + REC.posB, posB);
  ram.setU32(base + REC.velA, 0);                     // both velA and velB
  ram.setU16(base + 0x1c, 0);                         // attribute
  runMover(ctx);                                      // F2: the continuation
  return { ram, base };
}

test('kind 25 REFLECTS off three walls and HAS NO TOP WALL ($282FF0 jumps over '
  + 'the $282FF4 block)', { skip: !HAVE_TABLES }, () => {
    for (const [label, posA, posB, expectDir, expectAttr] of [
      ['left ($200)',    0x1000, 0x0100, (-0x30) & 0xff, 0x40],
      ['right ($3600)',  0x1000, 0x3700, (-0x30) & 0xff, 0x40],
      ['bottom ($6E00)', 0x6f00, 0x1000, (0x80 - 0x30) & 0xff, 0x20],
    ]) {
      const { ram, base } = bounceOnce(25, { posA, posB });
      assert.equal(ram.u8(base + REC.dir), expectDir, `${label}: dir`);
      assert.equal(ram.u8(base + 0x1c), expectAttr, `${label}: the eori.b on +$1C`);
      assert.equal(ram.u16(base + 0x2c), 0, `${label}: the bounce budget was spent`);
      const v = velocity(ROM, 0x14, expectDir);
      assert.equal(ram.u16(base + REC.velA), v.dA & 0xffff,
        `${label}: velA recomputed from the NEW dir at FULL speed (no asr)`);
      assert.equal(ram.u32(base + 0x0a), (0x1c1b68 + 0x2d0 + 0x24) >>> 0,
        `${label}: descriptor += $2D0, then the tail's own $24 step`);
    }
    // The top: posA < $600 falls into `bra.w $283064`, not into a bounce.
    const { ram, base } = bounceOnce(25, { posA: 0x0400, posB: 0x1000 });
    assert.equal(ram.u8(base + REC.dir), 0x30, 'top: dir untouched');
    assert.equal(ram.u16(base + 0x2c), 1, 'top: the bounce budget is NOT spent');
    assert.equal(ram.u8(base + 0x1c), 0x00, 'top: no eori on the attribute');
    assert.equal(ram.u16(base + REC.velA), 0,
      'top: no recompute either -- the velocity we zeroed stays zero');
  });

test('kind 29 SNAPS to an absolute direction per wall ($40/$C0/$00/$80) and '
  + 'HALVES the recomputed velocity ($2833CC asr.w #1)',
  { skip: !HAVE_TABLES }, () => {
    for (const [label, posA, posB, expectDir, expectAttr] of [
      ['left',   0x1000, 0x0100, 0x40, 0x40],
      ['right',  0x1000, 0x3700, 0xc0, 0x40],
      ['top',    0x0400, 0x1000, 0x00, 0x20],
      ['bottom', 0x6f00, 0x1000, 0x80, 0x20],
    ]) {
      const { ram, base } = bounceOnce(29, { posA, posB });
      assert.equal(ram.u8(base + REC.dir), expectDir,
        `${label}: dir is SET, not reflected -- a reflection of $30 would be $D0/$50`);
      assert.equal(ram.u8(base + 0x1c), expectAttr, `${label}: attribute`);
      const v = velocity(ROM, 0x14, expectDir);
      assert.equal(ram.u16(base + REC.velA), u16(i16(v.dA) >> 1), `${label}: velA halved`);
      assert.equal(ram.u16(base + REC.velB), u16(i16(v.dB) >> 1), `${label}: velB halved`);
      assert.equal(ram.u16(base + 0x2c), 0, `${label}: budget spent`);
    }
  });

test('kind 34 adds $80 on EVERY wall, top included, at full speed ($283766)',
  { skip: !HAVE_TABLES }, () => {
    for (const [label, posA, posB, expectAttr] of [
      ['left',   0x1000, 0x0100, 0x40],
      ['right',  0x1000, 0x3700, 0x40],
      ['top',    0x0400, 0x1000, 0x20],
      ['bottom', 0x6f00, 0x1000, 0x20],
    ]) {
      const { ram, base } = bounceOnce(34, { posA, posB });
      assert.equal(ram.u8(base + REC.dir), (0x30 + 0x80) & 0xff,
        `${label}: dir += $80 (NOT neg, NOT an absolute set)`);
      assert.equal(ram.u8(base + 0x1c), expectAttr, `${label}: attribute`);
      const v = velocity(ROM, 0x14, 0xb0);
      assert.equal(ram.u16(base + REC.velA), v.dA & 0xffff,
        `${label}: velA at FULL speed -- kind 34 has no asr, kind 29 does`);
      assert.equal(ram.u16(base + 0x2c), 0, `${label}: budget spent`);
    }
  });

test('the wall thresholds are EXCLUSIVE on all four sides -- $200/$3600 on posB, '
  + '$600/$6E00 on posA (bcc/bls, not bcs/blt)', { skip: !HAVE_TABLES }, () => {
    // The four tests are `cmpi.w #$200 / bcc` (skip when posB >= $200),
    // `cmpi.w #$3600 / bls` (skip when posB <= $3600), `cmpi.w #$600 / bcc`
    // (skip when posA >= $600) and `cmpi.w #$6E00 / bls` (skip when posA <=
    // $6E00).  Kind 34 is used because all four of its arms are live.
    for (const [label, posA, posB, bounces] of [
      ['posB = $1FF bounces',      0x1000, 0x01ff, true],
      ['posB = $200 does NOT',     0x1000, 0x0200, false],
      ['posB = $3600 does NOT',    0x1000, 0x3600, false],
      ['posB = $3601 bounces',     0x1000, 0x3601, true],
      ['posA = $5FF bounces',      0x05ff, 0x1000, true],
      ['posA = $600 does NOT',     0x0600, 0x1000, false],
      ['posA = $6E00 does NOT',    0x6e00, 0x1000, false],
      ['posA = $6E01 bounces',     0x6e01, 0x1000, true],
    ]) {
      const { ram, base } = bounceOnce(34, { posA, posB });
      assert.equal(ram.u16(base + 0x2c), bounces ? 0 : 1, `${label}: budget`);
      assert.equal(ram.u8(base + REC.dir), bounces ? 0xb0 : 0x30, `${label}: dir`);
    }
  });

test("the bouncers' ring limit/wrap PAIR depends on the bounce budget ($283076), "
  + 'and +$19 gates the whole tail', { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 25, speed: 0x14, dir: 0x30 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                     // F1: initialiser
    const park = () => {                               // mid-field, motionless
      ram.setU16(base + REC.posA, 0x1000);
      ram.setU16(base + REC.posB, 0x1000);
      ram.setU32(base + REC.velA, 0);
    };
    // budget left -> limit $1C1E38 wraps to $1C1BF8
    park();
    ram.setU32(base + 0x0a, 0x1c1e38 - 0x24);
    runMover(ctx);
    assert.equal(ram.u32(base + 0x0a), 0x1c1bf8, 'budget left: the $1C1E38/$1C1BF8 pair');
    // budget spent -> a DIFFERENT pair entirely
    ram.setU16(base + 0x2c, 0);
    park();
    ram.setU32(base + 0x0a, 0x1c2108 - 0x24);
    runMover(ctx);
    assert.equal(ram.u32(base + 0x0a), 0x1c1ec8, 'budget spent: the $1C2108/$1C1EC8 pair');
    // +$19 non-zero: the tail decrements it and does NOT touch the descriptor.
    park();
    ram.setU8(base + 0x19, 0x03);
    ram.setU32(base + 0x0a, 0x1c1d00);
    runMover(ctx);
    assert.equal(ram.u8(base + 0x19), 0x02, '+$19 ticked down');
    assert.equal(ram.u32(base + 0x0a), 0x1c1d00, '+$19 non-zero: the ring is frozen');
  });

// ======================================== W27 FAMILY I: the LAUNCHERS ========

test('kinds 30/31 precompute their acceleration along dir MINUS +$37, at one '
  + 'eighth ($283484 sub.b / $28348C asr.w #3)', { skip: !HAVE_TABLES }, () => {
    for (const kind of [30, 31]) {
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      const base = seedBullet(ram, 0, { type: 0x8100 | kind, speed: 0x14, dir: 0x40 });
      ram.setU8(base + 0x37, 0x18);                   // the direction OFFSET
      runMover({ ram, rom: ROM, notes: new UnportedLog() });   // F1: the initialiser
      const off = velocity(ROM, 0x14, 0x40 - 0x18);   // along the OFFSET heading
      const same = velocity(ROM, 0x14, 0x40);         // along the bullet's own
      assert.notEqual(u16(i16(off.dA) >> 3), u16(i16(same.dA) >> 3),
        `kind ${kind}: the test is only meaningful if the two headings differ`);
      assert.equal(ram.u16(base + 0x30), u16(i16(off.dA) >> 3),
        `kind ${kind}: +$30 = dA(dir - +$37) >> 3`);
      assert.equal(ram.u16(base + 0x32), u16(i16(off.dB) >> 3),
        `kind ${kind}: +$32 = dB(dir - +$37) >> 3`);
    }
  });

test('kinds 30/31 accelerate BOTH axes on the +$2C underflow, gated by the +$34 '
  + 'duration word ($2834B4) -- note +$34, not family F\'s +$36',
  { skip: !HAVE_TABLES }, () => {
    for (const [label, dur, expectAccel, expectDur] of [
      ['+$34 = 0 skips the block', 0x0000, false, 0x0000],
      ['+$34 positive accelerates and counts down', 0x0005, true, 0x0004],
      ['+$34 negative accelerates forever', 0xffff, true, 0xffff],
    ]) {
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      const base = seedBullet(ram, 0, { type: 0x8100 | 30, speed: 0x14, dir: 0x20 });
      ram.setU8(base + 0x37, 0x18);
      ram.setU16(base + 0x34, dur);
      ram.setU8(base + 0x2c, 0x00);
      ram.setU8(base + 0x2d, 0x07);
      // +$36 is family F's duration word and must be IRRELEVANT here: seeding it
      // to 0 would silence a port that read the wrong field.
      ram.setU16(base + 0x36, 0x0000);
      const ctx = { ram, rom: ROM, notes: new UnportedLog() };
      runMover(ctx);                                  // F1: the initialiser
      const a1 = ram.u16(base + REC.velA), b1 = ram.u16(base + REC.velB);
      const dA = ram.u16(base + 0x30), dB = ram.u16(base + 0x32);
      assert.notEqual(dA, 0, 'the acceleration vector must be non-zero to be visible');
      runMover(ctx);                                  // F2: the continuation
      assert.equal(ram.u16(base + 0x34), expectDur, `${label}: +$34`);
      if (expectAccel) {
        assert.equal(ram.u16(base + REC.velA), u16(a1 + dA), `${label}: velA += +$30`);
        assert.equal(ram.u16(base + REC.velB), u16(b1 + dB), `${label}: velB += +$32`);
        assert.equal(ram.u8(base + 0x2c), 0x07, `${label}: +$2C reloaded from +$2D`);
      } else {
        assert.equal(ram.u16(base + REC.velA), a1, `${label}: velA untouched`);
        assert.equal(ram.u16(base + REC.velB), b1, `${label}: velB untouched`);
        assert.equal(ram.u8(base + 0x2c), 0x00, `${label}: +$2C not even ticked`);
      }
    }
  });

// ========================================= W27 FAMILY K: the SLOW CLOCK ======

test('kind 33 steps its $283704 table every OTHER frame, and its indices are a '
  + 'two-entry LEAD-IN ($14/$10) over a four-entry ring ($C/$8/$4/$0)',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 33, speed: 0x14, dir: 0x40 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                     // F1: the initialiser
    assert.equal(ram.u16(base + 0x2c), 0x0014,
      'F1: +$2C is a WORD index of $14 -- not the big-endian $00/$14 half-swap, '
      + 'because $2836DE reads it back with move.w');
    assert.equal(ram.u16(base + 0x2e), 0x0101, 'F1: +$2E counter $01 / +$2F reload $01');
    assert.equal(ram.u32(base + 0x0a), 0x1c01ac, 'F1: descriptor $1C01AC');
    ram.setU32(base + REC.velA, 0);                    // park it: no bounds kill

    const used = [];
    for (let f = 0; f < 24; f++) {
      const before = ram.u16(base + 0x2c);
      runMover(ctx);
      const stepped = ram.u16(base + 0x2c) !== before;
      assert.equal(stepped, f % 2 === 1,
        `frame ${f}: the +$2E byte countdown fires on UNDERFLOW, so the table `
        + 'steps on every other frame, starting with the SECOND');
      if (stepped) {
        used.push(before);
        assert.equal(ram.u32(base + 0x0a), ROM.u32(0x283704 + before),
          `frame ${f}: descriptor = the longword at $283704 + $${before.toString(16)}`);
      }
    }
    // $2836EE `subq.w #$4 / bcc / move.w #$C` resets to $C, NOT to $14, so the
    // two entries at $14 and $10 play exactly once per bullet.
    assert.deepEqual(used,
      [0x14, 0x10, 0x0c, 0x08, 0x04, 0x00, 0x0c, 0x08, 0x04, 0x00, 0x0c, 0x08],
      'the lead-in plays once and the ring is four entries wide');
  });

// ==================================== W27 FAMILY H (core): 26, 27 and 32 =====

test('kinds 27/32 steer by the LOW BYTE of the +$2E and +$38 WORDS ($2831EE '
  + 'add.b), drift by +$28/+$2A, and recompute velocity only when one fired',
  { skip: !HAVE_TABLES }, () => {
    for (const kind of [27, 32]) {
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      ram.setU16(0x80390a, 0);                        // kind 27's phase global
      const base = seedBullet(ram, 0, { type: 0x8100 | kind, speed: 0x14, dir: 0x20 });
      ram.setU16(base + 0x28, 0x0007);                // the drift pair
      ram.setU16(base + 0x2a, 0x0009);
      ram.setU8(base + 0x2c, 0x00);                   // turn counter: underflows at once
      ram.setU8(base + 0x2d, 0x05);
      ram.setU16(base + 0x2e, 0x7f03);                // HIGH byte $7F must be IGNORED
      ram.setU8(base + 0x36, 0x02);                   // accel counter: does NOT fire
      ram.setU8(base + 0x37, 0x04);
      ram.setU16(base + 0x38, 0x7f06);
      const ctx = { ram, rom: ROM, notes: new UnportedLog() };
      runMover(ctx);                                  // F1: the initialiser
      const pA = ram.u16(base + REC.posA), pB = ram.u16(base + REC.posB);
      const vA = ram.u16(base + REC.velA);
      ram.setU32(base + REC.velA, 0);                 // park: the plain path adds 0
      runMover(ctx);                                  // F2: the continuation
      assert.equal(ram.u16(base + REC.posA), u16(pA + 0x0007),
        `kind ${kind}: posA += the +$28 word`);
      assert.equal(ram.u16(base + REC.posB), u16(pB + 0x0009),
        `kind ${kind}: posB += the +$2A word`);
      assert.equal(ram.u8(base + REC.dir), (0x20 + 0x03) & 0xff,
        `kind ${kind}: dir += $03, the LOW byte of $7F03 -- add.b, not add.w`);
      assert.equal(ram.u8(base + REC.speed), 0x14,
        `kind ${kind}: the +$36 counter was 2, so speed must NOT change`);
      assert.equal(ram.u8(base + 0x2c), 0x05, `kind ${kind}: +$2C reloaded from +$2D`);
      assert.equal(ram.u8(base + 0x36), 0x01, `kind ${kind}: +$36 just ticked`);
      const v = velocity(ROM, 0x14, 0x23);
      assert.equal(ram.u16(base + REC.velA), v.dA & 0xffff,
        `kind ${kind}: velocity recomputed from the NEW dir and stored`);
      assert.notEqual(ram.u16(base + REC.velA), vA,
        `kind ${kind}: ...and it is not the spawn-frame value`);
    }
  });

test('kinds 27/32 do NOT recompute velocity on a frame where neither counter '
  + 'fired ($28320C tst.w D1 / beq)', { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 32, speed: 0x14, dir: 0x20 });
    ram.setU8(base + 0x2c, 0x09);                     // neither counter underflows
    ram.setU8(base + 0x36, 0x09);
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1
    // A SMALL sentinel, deliberately.  The first version of this test used
    // $DEADBEEF, which the PLAIN path integrates into the position -- the bullet
    // left the playfield and the mover freed the slot before the continuation
    // ever ran, so the test passed without executing the branch it names.  It
    // was caught by the `recompute-unconditional` mutation surviving.
    const SENTINEL = 0x00110022;
    ram.setU32(base + REC.velA, SENTINEL);
    const v = velocity(ROM, 0x14, 0x20);
    assert.notEqual(SENTINEL, ((v.dA & 0xffff) << 16 | (v.dB & 0xffff)) >>> 0,
      'the sentinel must differ from what a recompute would write');
    runMover(ctx);                                    // F2
    assert.ok((ram.u16(base) & TYPEBIT.alive) !== 0,
      'the bullet must still be ALIVE -- otherwise the continuation never ran');
    assert.equal(ram.u32(base + REC.velA), SENTINEL,
      'the D1 dirty flag stayed 0, so $283250 movem.w never ran');
  });

test("kind 27's +$30 is a 32-frame gate that OVERWRITES the saved velA half, and "
  + 'the animation phase comes from the $80390A global ($28316C)',
  { skip: !HAVE_TABLES }, () => {
    for (const [global, phase] of [[0x0000, 0], [0x0004, 1], [0x0008, 2], [0x000c, 3],
                                   [0x0010, 0]]) {
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      ram.setU16(0x80390a, global);
      const base = seedBullet(ram, 0, { type: 0x8100 | 27, speed: 0x14, dir: 0x20 });
      runMover({ ram, rom: ROM, notes: new UnportedLog() });
      assert.equal(ram.u32(base + 0x0a), (0x1bfed0 + 0x24 * (phase + 1)) >>> 0,
        `$80390A = $${global.toString(16)}: descriptor starts one of FOUR phases`);
      assert.equal(ram.u16(base + 0x30), 0x0020,
        '+$30 is $20 -- $28318C overwrote the velA half that $28315A had saved');
      assert.equal(ram.u32(base + REC.velA), 0,
        '+$1E cleared and never restored: kind 27 has no stored velocity at spawn');
    }
  });

test("kind 27's +$30 gate stops the drift after exactly 32 frames ($2831C4)",
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    ram.setU16(0x80390a, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 27, speed: 0x14, dir: 0x20 });
    ram.setU16(base + 0x28, 0x0001);                  // 1 per frame, so pos counts them
    ram.setU16(base + 0x2a, 0x0000);
    ram.setU8(base + 0x2c, 0xff);                     // no steering; drift only
    ram.setU8(base + 0x36, 0xff);
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: the initialiser
    ram.setU32(base + REC.velA, 0);
    const p0 = ram.u16(base + REC.posA);
    for (let f = 0; f < 40; f++) { runMover(ctx); ram.setU32(base + REC.velA, 0); }
    assert.equal(ram.u16(base + 0x30), 0, '+$30 counted down to 0 and stopped');
    assert.equal(ram.u16(base + REC.posA), u16(p0 + 0x20),
      'exactly $20 drift steps in 40 frames -- the gate is a budget, not a delay');
  });

test('kind 26 rings its descriptor inside bounds carried in the RECORD, and '
  + 'reloads +$19 from +$18 every animating frame ($28312E move.b (A0)+,(A0)+)',
  { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 26, speed: 0x14, dir: 0x40 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: init + the $283C8C epilogue
    ram.setU32(base + REC.velA, 0);
    assert.equal(ram.u32(base + 0x14), 0x0000003c, 'F1: +$14 is the ring SPAN $3C');
    assert.equal(ram.u16(base + 0x18), 0x0101, 'F1: +$18 delay $01 / +$19 reload $01');
    const first = ram.u32(base + 0x0a);
    // PIN THE TABLE, not just "a pointer resolved".  Giving the $283C8C epilogue
    // kind 2's table ($2821FA) instead of kind 26's ($2830EA) was mutation-tested
    // and SURVIVED every other assertion here -- the same shape as the kind 2/21
    // swap in family B and the kind 30/31 continuation swap in family I.
    const d1 = ((0x40 + 4) >> 2) & 0x3e;              // $283C28..$283C2C
    const off = ROM.u16(0x283c4c + d1);               // $283C38
    assert.equal(first, ROM.u32(0x2830ea + off),
      'F1: the frame pointer must come from KIND 26\'s table at $2830EA');
    assert.equal(ram.u32(base + 0x10), (first + 0x3c) >>> 0,
      'F1: $283C46 set +$10 = frame + +$14 -- the ring LIMIT, from the epilogue');
    // +$19 is 1 after the initialiser, so F2 only ticks it down.
    runMover(ctx);
    assert.equal(ram.u32(base + 0x0a), first, 'F2: +$19 was 1 -- the delay, no step');
    assert.equal(ram.u8(base + 0x19), 0, 'F2: +$19 ticked to 0');
    // Three steps take the descriptor round the whole ring: $3C / $14 = 3.
    const seen = [];
    for (let f = 0; f < 6; f++) {
      runMover(ctx);
      if (f % 2 === 0) {
        seen.push(ram.u32(base + 0x0a));
        assert.equal(ram.u8(base + 0x19), 0x01,
          'the animating frame copies +$18 into +$19 -- a no-op reading of '
          + '`move.b (A0)+,(A0)+` would animate every frame');
      }
    }
    assert.deepEqual(seen,
      [(first + 0x14) >>> 0, (first + 0x28) >>> 0, first],
      'a THREE-frame ring: +$14 steps until it hits +$10, then -= the +$14 span');
  });

test('kinds 27/36/37/38 are ONE body with FOUR consecutive $90-byte rings, and '
  + 'each initialiser starts one $24 step below its own ring',
  { skip: !HAVE_TABLES }, () => {
    // From the listings: init base + $24 == wrap, and wrap + $90 == limit.
    for (const [kind, wrap, limit] of [
      [27, 0x1bfef4, 0x1bff84],
      [36, 0x1bff84, 0x1c0014],
      [37, 0x1c0014, 0x1c00a4],
      [38, 0x1c00a4, 0x1c0134],
    ]) {
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      ram.setU16(0x80390a, 0);                        // phase 0
      const base = seedBullet(ram, 0, { type: 0x8100 | kind, speed: 0x14, dir: 0x20 });
      ram.setU8(base + 0x2c, 0xff);                   // no steering
      ram.setU8(base + 0x36, 0xff);
      const ctx = { ram, rom: ROM, notes: new UnportedLog() };
      runMover(ctx);                                  // F1: the initialiser
      ram.setU32(base + REC.velA, 0);
      assert.equal(ram.u32(base + 0x0a), wrap,
        `kind ${kind}: phase 0 lands the descriptor on its ring's FIRST frame `
        + `($${wrap.toString(16)}), i.e. the init base is one $24 step below it`);
      // walk the ring: four frames, then back to the wrap target.
      const seen = [ram.u32(base + 0x0a)];
      for (let f = 0; f < 4; f++) { runMover(ctx); ram.setU32(base + REC.velA, 0);
                                    seen.push(ram.u32(base + 0x0a)); }
      assert.deepEqual(seen, [wrap, wrap + 0x24, wrap + 0x48, wrap + 0x6c, wrap],
        `kind ${kind}: a FOUR-frame ring ending at $${limit.toString(16)}`);
      assert.equal(wrap + 0x90, limit,
        `kind ${kind}: wrap + $90 == limit -- the four rings tile $1BFEF4..$1C0134`);
    }
  });

test('kind 35 starts at SPEED ZERO and winds up one step every fifth animating '
  + 'frame ($283882 / $283890)', { skip: !HAVE_TABLES }, () => {
    const ram = new Ram(null);
    ram.setU16(0x81b41a, 1);
    ram.setU16(0x813176, 0);
    const base = seedBullet(ram, 0, { type: 0x8100 | 35, speed: 0x14, dir: 0x20 });
    const ctx = { ram, rom: ROM, notes: new UnportedLog() };
    runMover(ctx);                                    // F1: the initialiser
    assert.equal(ram.u8(base + REC.speed), 0x00,
      'F1: $283882 zeroes the SPEED -- a bit-7 bullet recomputes from it every '
      + 'frame, so speed 0 means it does not move at all');
    assert.equal(ram.u16(base + 0x28), 0x0404, 'F1: +$28 counter $04 / +$29 reload $04');
    assert.equal(ram.u32(base + 0x0a), 0x1c0014, 'F1: descriptor $1C0014');
    ram.setU32(base + REC.velA, 0);
    // The bit-11 flip-flop halves the rate. bit 11 is CLEAR after the
    // initialiser, and `bchg` reports the OLD bit, so the FIRST continuation
    // frame animates -- animating frames are 1, 3, 5, 7, 9...  The counter is
    // the underflow flavour, so the fifth of those (frame 9) is the first step.
    // Frame 10 was the expectation written before this ran, and it was wrong by
    // exactly the off-by-one the flip-flop's phase introduces.
    const bumps = [];
    let prev = 0;
    for (let f = 1; f <= 24; f++) {
      runMover(ctx);
      ram.setU32(base + REC.velA, 0);
      const sp = ram.u8(base + REC.speed);
      if (sp !== prev) {
        bumps.push(f);
        prev = sp;
        assert.equal(ram.u8(base + 0x28), 0x04,
          `frame ${f}: the underflow reloads +$28 from +$29 on the SAME frame`);
      }
    }
    assert.deepEqual(bumps, [9, 19],
      'speed steps on the 5th and 10th ANIMATING frames, which are frames 9 and 19');
    assert.equal(ram.u8(base + REC.speed), 0x02, 'two steps in 24 frames');
    assert.equal(ram.u8(base + 0x28), 0x02,
      'and it keeps ticking after the reload: animating frames 21 and 23 took '
      + 'the reloaded $04 down to $02 by frame 24');
  });

test('every ported initialiser installs ITS OWN continuation address at +$22',
  { skip: !HAVE_TABLES }, () => {
    // THIS TEST EXISTS BECAUSE A MUTATION SURVIVED.  Kinds 30 and 31 are
    // byte-identical bodies at two addresses, so wiring kind 31's initialiser to
    // kind 30's continuation ($28349A instead of $283568) changes NO observable
    // behaviour and was invisible to every other assertion in this file.  It is
    // still wrong: +$22 is a real longword in the record that the board holds,
    // and any gate that compares it -- or any future body that dispatches on it
    // -- would diverge.  Same shape as the kind 2/21 sprite-table swap in the
    // family B mutation table.
    //
    // The kind -> body mapping is read from the ROM's $282030 table, so the
    // subject set cannot drift; the expected continuation per body is the ledger.
    const EXPECT = new Map([
      [0x282104, 0x28213e], [0x282162, 0x28219e], [0x2821c2, 0x283ce4],
      [0x2823ec, 0x282420], [0x2824a8, 0x2824dc], [0x282564, 0x282598],
      [0x282620, 0x282654], [0x2826dc, 0x282738], [0x282772, 0x2827bc],
      [0x2827e0, 0x28281c], [0x282840, 0x28287c], [0x2828a0, 0x2828ea],
      [0x282908, 0x282944], [0x282962, 0x28299e], [0x2829bc, 0x2829fe],
      [0x282a1e, 0x282a66], [0x282aae, 0x282af6], [0x282b30, 0x282b64],
      [0x282bee, 0x282c2a], [0x282c56, 0x283ce4], [0x282d42, 0x282d76],
      [0x282e00, 0x282e4a], [0x282ebc, 0x282ef0], [0x282f6e, 0x282f9e],
      [0x28330c, 0x28333c], [0x283430, 0x28349a], [0x2834fe, 0x283568],
      [0x2830b2, 0x28310e], [0x283148, 0x283194], [0x2835cc, 0x283616],
      [0x283850, 0x28388a], [0x2838c6, 0x283912], [0x2839de, 0x283a2a],
      [0x283af6, 0x283b42],
      [0x2836a8, 0x2836d0], [0x28371c, 0x28374c],
    ]);
    const seen = new Set();
    for (let k = 0; k < 39; k++) {
      const body = ROM.u32(0x282030 + 4 * k);
      if (!INIT_BODIES.has(body)) continue;            // still a loud named throw
      const ram = new Ram(null);
      ram.setU16(0x81b41a, 1);
      ram.setU16(0x813176, 0);
      const base = seedBullet(ram, 0, { type: 0x8100 | k, speed: 0x14, dir: 0x40 });
      runMover({ ram, rom: ROM, notes: new UnportedLog() });   // the spawn frame only
      const installed = ram.u32(base + REC.continuation);
      assert.ok(CONTINUATIONS.has(installed),
        `kind ${k} ($${body.toString(16)}) installed $${installed.toString(16)} `
        + `at +$22, which is not a ported continuation -- a dangling target`);
      assert.equal(installed, EXPECT.get(body),
        `kind ${k} ($${body.toString(16)}) must install $`
        + `${EXPECT.get(body)?.toString(16)} at +$22, not $${installed.toString(16)}`);
      seen.add(body);
    }
    // kinds 14 and 15 alias kind 10's $282840, so this counts DISTINCT BODIES
    // reached, not kind indices -- an equality on indices would read 30, not 28.
    assert.equal(seen.size, EXPECT.size,
      'every entry of the expected map must have been reached through $282030');
  });

test('the ported-body inventory is exactly 36 initialisers + 35 continuations', () => {
  // A LEDGER test: it pins the exact set, so porting a body turns it RED until
  // the inventory here is updated deliberately.  That is the point -- the count
  // cannot drift upward without somebody writing down which addresses moved.
  //
  // W26 ported 8 bodies (kinds 3/4/5/6/7/12/13/19; kind 6 is the midboss's).
  // W27 adds 28: family A kinds 0/1/8/9/10/11/20, family B kinds 2/21,
  // family C kinds 16/18, family D kind 17, family E kinds 22/24, family F
  // kind 23, families G+L kinds 25/29/34, family H kinds 26/27/32/36/37/38,
  // family I kinds 30/31, family K kind 33, and kind 35.  Kind 10's $282840 is
  // also the target for kinds 14 and 15, which alias it in the $282030 table.
  // So 36 distinct bodies now cover 39 of the 39 kind indices, minus kind 28 --
  // 38 of 39; kind 28 (family J, the splitter) is the last one throwing.
  assert.deepEqual([...INIT_BODIES.keys()].sort((a, b) => a - b),
    [0x282104, 0x282162, 0x2821c2, 0x2823ec, 0x2824a8, 0x282564, 0x282620,
     0x2826dc, 0x282772, 0x2827e0, 0x282840, 0x2828a0, 0x282908, 0x282962,
     0x2829bc, 0x282a1e, 0x282aae, 0x282b30, 0x282bee, 0x282c56,
     0x282d42, 0x282e00, 0x282ebc, 0x282f6e, 0x2830b2, 0x283148, 0x28330c,
     0x283430, 0x2834fe, 0x2835cc, 0x2836a8, 0x28371c, 0x283850, 0x2838c6,
     0x2839de, 0x283af6]);
  assert.deepEqual([...CONTINUATIONS.keys()].sort((a, b) => a - b),
    [0x28213e, 0x28219e, 0x282420, 0x2824dc, 0x282598, 0x282654, 0x282738,
     0x2827bc, 0x28281c, 0x28287c, 0x2828ea, 0x282944, 0x28299e, 0x2829fe,
     0x282a66, 0x282af6, 0x282b64, 0x282c2a, 0x282d76, 0x282e4a, 0x282ef0,
     0x282f9e, 0x28310e, 0x283194, 0x28333c, 0x28349a, 0x283568, 0x283616,
     0x2836d0, 0x28374c, 0x28388a, 0x283912, 0x283a2a, 0x283b42, 0x283ce4]);
  // 36 initialisers, 35 continuations. NOT equal, and that is correct: kinds 2
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
