// WAVE 12 -- the ship, its options, and the two things that were named wrong.
//
// Every expected value here is DERIVED FROM THE LISTING OR FROM A NAMED
// MEASUREMENT, never from running the port and writing down what came out.
// `11-review.md` F1 is the reason that sentence is at the top of this file: a
// unit test written from the port locked a real defect in for a whole wave and
// "unit-tested against hand-computed values" was true and worthless.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RAM, P, OPT, ROM } from '../src/machine.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { ProtLatch, PROT } from '../src/protsim.js';
import { runOptionObject, OPT_TEMPLATES, POD_SHADOW_SIZE,
  POD_SHADOW_COLOUR } from '../src/options.js';
import { drawShip, drawShipAlt, groundPlane, packD1, SHIP_TABLES,
  SHIP_SIZES, GLOW_FLIP, SHADOW_FLIP, SHIP_MUTATE } from '../src/shipsprite.js';
import { BUCKETS, NAMED_BUCKETS, enqueueRegisters,
  snapshotBucket } from '../src/spritequeue.js';
import { MoveTables } from '../src/vectors.js';
import { RomWindows } from '../src/rom.js';

const TABLES = fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url));
const haveTables = existsSync(TABLES);
const tables = haveTables ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;

/** `assert.throws` does not hand the error back; these tests check the ROM
 *  ADDRESS a throw carries, which is the whole point of a named throw. */
function caught(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** A bare Ram plus the context the wave-12 routines need.  No Game: these are
 *  unit tests of routines, and a Game would drag the whole main loop in. */
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

/** The P1 option block in the state MEASURED at fly-around lf2000, so a test
 *  that reaches the laser gate reaches it from a state the board has held. */
function seedOptions(ram) {
  ram.setU16(RAM.p1Options + OPT.state, 0x8003);   // live, initialised, deployed
  ram.setU16(RAM.p1Options + OPT.pod + OPT.state, 0x8000);
  ram.setU8(RAM.p1Options + OPT.angle, 0x10);      // pod 0 aims +X
  ram.setU8(RAM.p1Options + OPT.pod + OPT.angle, 0x30);
  ram.setU8(RAM.p1Options + OPT.speedIdx, 0xe0);
  ram.setU8(RAM.p1Options + OPT.pod + OPT.speedIdx, 0xe0);
  // The control block, verbatim from the fly-around lf2000 RAM dump:
  //   +$42 $0101   +$44 $0038   +$46 $0024BBBA   +$4C $007C   +$58 $0024BCFE
  ram.setU16(RAM.p1Options + 0x42, 0x0101);
  ram.setU16(RAM.p1Options + OPT.animIdx, 0x0038);
  ram.setU32(RAM.p1Options + OPT.animTable, 0x0024bbba);
  ram.setU16(RAM.p1Options + OPT.animIdxReload, 0x007c);
  ram.setU32(RAM.p1Options + OPT.shadowTable, 0x0024bcfe);
  ram.setU16(RAM.player1 + P.state, 0x8000);
  ram.setU16(RAM.player1 + P.optFormation, 2);
  ram.setU16(RAM.player1 + P.posY, 0x1179);
  ram.setU16(RAM.player1 + P.posX, 0x14c0);
  ram.setU8(RAM.player1 + P.speedIdx, 22);
  ram.setU8(RAM.player1 + P.baseSpeed, 22);
  ram.setU8(RAM.player1 + P.laserFloor, 12);
  // WAVE 45.  The five constants the LASER's arm-up counts, all of them from
  // formation 2's template `$24BF6E` through `$24C0E8`'s copy WITH ITS
  // FOUR-BYTE HOLE, and all five re-read out of the shipped seed this wave:
  //   +$1B = $10  pod 0's angle      +$3B = $30  pod 1's angle
  //   +$3E = $02  the swing STEP     +$3F = $0A  the start DELAY
  //   +$4B = $04  the ramp counter
  //   +$30 = $0024BF4A  the ($16,A6) template list, and +$36/$37 the REST
  //                     angles the release swings back to
  ram.setU8(RAM.p1Options + 0x3b, 0x30);
  ram.setU8(RAM.p1Options + 0x3e, 0x02);
  ram.setU8(RAM.p1Options + 0x3f, 0x0a);
  ram.setU8(RAM.p1Options + 0x4b, 0x04);
  ram.setU32(RAM.p1Options + 0x30, 0x0024bf4a);
  ram.setU8(RAM.p1Options + 0x36, 0x10);
  ram.setU8(RAM.p1Options + 0x37, 0x30);
  ram.setU16(RAM.p1Options + 0x10, 2);
  // $24D48A movea.l $8127E8,A1 -- a ROM pointer held in RAM, MEASURED $255278
  // in the shipped seed. The pods' spawn reads its burst count through it.
  ram.setU32(0x8127e8, 0x255278);
}

// =========================================================== 1. THE HITBOX
//
// It has been BLOCKED since wave 2 and misread by three waves: `$2458C0`'s
// identical field layout walks `$811F72`, the 45 x $30 LASER SEGMENT table, not
// the ship.  The player's box is the same four offsets on `$8103E6`, reached
// through `$2459D0` with A4 loaded at `$28B69A` (10-recon-combat §3).

test('P names the hitbox, and $2459D0\'s four offsets are the four fields', () => {
  assert.equal(P.hitYPlus, 0x10);   // $2459D6 add.w ($10,A4),D0
  assert.equal(P.hitYMinus, 0x12);  // $2459DA sub.w ($12,A4),D1
  assert.equal(P.hitXPlus, 0x14);   // $2459E4 add.w ($14,A4),D2
  assert.equal(P.hitXMinus, 0x16);  // $2459E8 sub.w ($16,A4),D3
  assert.equal(P.animB, undefined,
    'the name `animB` must be gone: +$14 is not animation, it is the hitbox');
});

test('the $2553F2 table is the BLACK LABEL 4-px box and it banks', {
  skip: haveTables ? false : 'rip/port/player.tables.json is not built',
}, () => {
  const t = new MoveTables(tables, new RomWindows(tables.rom));
  // MEASURED from the ROM (10-recon-combat §3 and re-read this wave):
  //   tilt -32 -> 0000/0080, tilt 0 -> 0080/0080, tilt +32 -> 0080/0000
  assert.deepEqual(t.anim(0xffe0).hitX, [0x0000, 0x0080]);   // -$20
  assert.deepEqual(t.anim(0).hitX, [0x0080, 0x0080]);
  assert.deepEqual(t.anim(0x0020).hitX, [0x0080, 0x0000]);
  assert.equal(t.hitX.length, 17, '17 tilt entries, step 4 over [-$20,+$20]');
  // ...and it is a HALF-extent, so the box is 2*$80 = $100 = 4 px at tilt 0.
  const [plus, minus] = t.anim(0).hitX;
  assert.equal((plus + minus) / 64, 4,
    'Black Label is 4 px wide; build A\'s $1549AE gives $C0/$C0 = 6 px');
});

test('the ship\'s IMAGE long is a SEPARATE table and it also banks', {
  skip: haveTables ? false : 'no tables',
}, () => {
  const t = new MoveTables(tables, new RomWindows(tables.rom));
  // $25533A[0] = $255362; MEASURED 17 longs $1200..$1840 in steps of $64.
  assert.deepEqual(t.anim(0xffe0).a, [0x0000, 0x1200]);
  assert.deepEqual(t.anim(0).a, [0x0000, 0x1520]);
  assert.deepEqual(t.anim(0x0020).a, [0x0000, 0x1840]);
  const step = t.animA[1][1] - t.animA[0][1];
  assert.equal(step, 0x64, 'the 17 pairs are $64 apart -- this IS the bank');
});

// ================================================ 2. THE PROTECTION LATCH
//
// It is on the ship's own draw path ($24A5B6) and the port cannot skip it.

test('$246EA4 puts the sum where the MEASUREMENT says, not where a paraphrase does', () => {
  const p = new ProtLatch();
  p.setSlot(0, 0xf880);                // $246D04(0, $255A2A's first word)
  p.setSlot(1, 0x1179);                // $246D04(1, posY at fly-around lf2000)
  p.sum(0, 1, 1);                      // $246EA4(0,1,1)
  // MEASURED on the board: bucket 19's third record has long-axis field $27,
  // and $27 = (($1179 + $F880) & $FFFF) >> 6.  A dest of slot 0 would leave
  // slot 1 = posY and give $45.
  assert.equal(p.readSlot(1), 0x109f9);
  assert.equal(((p.readSlot(1) & 0xffff) >> 6) & 0x7ff, 0x27);
});

test('the latch is 24-bit and refuses to invent a power-on value', () => {
  const p = new ProtLatch();
  assert.equal(PROT.slots, 32);
  p.setSlot(3, 0x1234567);
  assert.equal(p.readSlot(3), 0x234567, '$246CFA andi.l #$FFFFFF,D0');
  assert.throws(() => p.readSlot(4), Unreached);
  assert.throws(() => p.sum(4, 5, 6), Unreached);
  assert.throws(() => p.setSlot(32, 0), Unreached);
});

// ==================================================== 3. THE GROUND PLANE
//
// `$249EA0..$249EBC`, and `render/capture.js` verified the same arithmetic
// against the board's own shadow record on 81 of 81 captured frames.

test('the $FE00FE00 bias is ONE 32-bit add, so the low half borrows', () => {
  // Pick a posX whose midpoint is below $200 so the `addi.l` borrows out of the
  // low word: the wrong port (two 16-bit adds) differs by exactly $10000 here.
  // posY and posX AT the midpoint constants, so the midpoints are the constants
  // themselves and the whole result is the bias: $14001C00 + $FE00FE00.
  const d1 = groundPlane(0x1400, 0x1c00) >>> 0;
  assert.equal(d1 & 0xffff, 0x1a00, '$1C00 + $FE00 = $11A00, low word $1A00');
  assert.equal(d1 >>> 16, 0x1201,
    'AND THE CARRY: $1400 + $FE00 + 1 = $11201, so the high word is $1201. '
    + 'Two independent 16-bit adds give $1200 -- one unit of the long axis, '
    + 'every frame, on every shadow in the game.');
  // The mutation the gate declares must produce exactly that difference.
  SHIP_MUTATE.value = 'shadow-no-borrow';
  const wrong = groundPlane(0x1400, 0x1c00) >>> 0;
  SHIP_MUTATE.value = null;
  assert.equal(wrong >>> 16, 0x1200);
  assert.equal((d1 >>> 16) - (wrong >>> 16), 1);
});

test('the pods\' shadow bias is $FE00FF00, NOT the ship\'s $FE00FE00', () => {
  // $249EBC addi.l #$FE00FE00 against $24C422 addi.l #$FE00FF00.  Translated as
  // written: the two differ by $100 on the short axis and nothing says why.
  const ship = groundPlane(0x1179, 0x14c0);
  const pod = groundPlane(0x1179, 0x14c0, 0xfe00ff00);
  assert.equal((pod & 0xffff) - (ship & 0xffff), 0x100);
});

// ===================================================== 4. THE ENQUEUE, D1..D4
//
// $23EFC0 / $23F1FA / $23F34A -- one shape, three buckets.

test('the register enqueue is $23EFC0 verbatim, into the named bucket', () => {
  const ram = new Ram(null);
  // $23EFD6 asr.l #6 across BOTH fields, then $07FF03FF, then $80008000.
  enqueueRegisters(ram, NAMED_BUCKETS.shadows, packD1(0x0f79, 0x10c0),
    0x00061234, 0x0210, 0x0018);
  const b = BUCKETS[5];
  assert.equal(ram.u16(b.counter), 12, '$23EFCC addi.w #$c');
  assert.equal(ram.u16(b.buffer + 0), 0x803d);
  assert.equal(ram.u16(b.buffer + 2), 0x8043);
  assert.equal(ram.u16(b.buffer + 4), 0x0006);
  assert.equal(ram.u16(b.buffer + 6), 0x1234);
  assert.equal(ram.u16(b.buffer + 8), 0x0210);
  assert.equal(ram.u16(b.buffer + 10), 0x0018);
});

test('the three buckets this wave feeds are the ones the ablation named', () => {
  assert.equal(NAMED_BUCKETS.player, 19);
  assert.equal(NAMED_BUCKETS.options, 15);
  assert.equal(NAMED_BUCKETS.shadows, 5);
  assert.equal(BUCKETS[19].buffer, 0x808ee4);   // $23F104 lea $808EE4,A0
  assert.equal(BUCKETS[15].buffer, 0x808eb4);   // $23F2CA lea $808EB4,A0
  assert.equal(BUCKETS[5].buffer, 0x80862c);    // $23EFC0 lea $80862C,A0
});

// ================================================== 5. THE PHASE ALTERNATION
//
// $80390C is the WORD whose low byte $23BE92 `bchg #0,$80390D` toggles, so
// `tst.w $80390C` reads 1 on one logic frame and 0 on the next.  Three tests
// key off it and they are arranged so the aura+glow draw on one phase and the
// shadow on the other -- MEASURED complementary over 2,233 frames.

test('phase 1 draws aura+ship+glow into 19 and nothing into 5', {
  skip: haveTables ? false : 'no tables',
}, () => {
  const g = bench();
  seedOptions(g.ram);
  g.ram.setU8(RAM.player1 + P.invuln, 0xff);      // the fly-around intervention
  g.ram.setU16(RAM.player1 + P.auraPhase, 0x3c);
  g.ram.setU16(RAM.player1 + P.glowPhase, 0x04);
  g.ram.setU16(0x80390c, 1);
  drawShip(g.ram, RAM.player1, g.ctx);
  assert.equal(snapshotBucket(g.ram, 19).count, 36, 'three records');
  assert.equal(snapshotBucket(g.ram, 5).count, 0);
  const b = snapshotBucket(g.ram, 19).bytes;
  // record 0 = the AURA: $24A4BE move.w #$A28,D3
  assert.equal((b[8] << 8) | b[9], SHIP_SIZES.aura);
  // record 2 = the GLOW: $24A54E move.w #$1a,D4 and $255A2A's third word $0220
  assert.equal((b[32] << 8) | b[33], 0x0220);
  assert.equal((b[34] << 8) | b[35], GLOW_FLIP);
});

test('phase 0 draws only the ship into 19, and the shadow into 5', {
  skip: haveTables ? false : 'no tables',
}, () => {
  const g = bench();
  seedOptions(g.ram);
  g.ram.setU8(RAM.player1 + P.invuln, 0xff);
  g.ram.setU16(0x80390c, 0);
  drawShip(g.ram, RAM.player1, g.ctx);
  assert.equal(snapshotBucket(g.ram, 19).count, 12, 'the ship alone');
  // The shadow is in the PLAYER handler's tail, not in $24A482 -- the two
  // halves of the alternation live in different routines, which is exactly how
  // three waves managed to see one and not the other.
  assert.equal(snapshotBucket(g.ram, 5).count, 0);
});

test('the aura does not draw at all when the ship is not invulnerable', {
  skip: haveTables ? false : 'no tables',
}, () => {
  // $24A48E tst.b ($3e,A6) / beq $24A538.  Wave 9's attach report called this
  // 5x40 colour-2 record an "exhaust plume"; it is the INVULNERABILITY BLINK,
  // and every count derived from fly-around carries that scenario's $FF poke.
  const g = bench();
  seedOptions(g.ram);
  g.ram.setU8(RAM.player1 + P.invuln, 0);
  g.ram.setU16(RAM.player1 + P.glowPhase, 0x04);
  g.ram.setU16(0x80390c, 1);
  drawShip(g.ram, RAM.player1, g.ctx);
  // TWO records, not three: the ship and the glow.  The glow's own gate is the
  // phase word and NOT the invulnerability timer, which is why they are two
  // separate records in the first place.
  assert.equal(snapshotBucket(g.ram, 19).count, 24);
});

test('the ship\'s ALT entry throws by address on state bit 8', () => {
  const ram = new Ram(null);
  ram.setU16(RAM.player1 + P.state, 0x8100);
  const e = caught(() => drawShipAlt(ram, RAM.player1));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, ROM.shipBit8);
  ram.setU16(RAM.player1 + P.state, 0x8000);
  assert.doesNotThrow(() => drawShipAlt(ram, RAM.player1));
});

// ================================================ 6. THE OPTION OBJECT, HELD
//
// The two tests wave 9 shipped asserted the SPEED RAMP's shape and both were
// true of the port and false of the board.  These are the board's gate.

/** Hold Button 1 for `n` logic frames through `$24C096` and return the option
 *  block's state after each one.  WAVE 45: this used to be `assert.throws`. */
function holdFire(g, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    g.ram.setU8(RAM.player1 + P.dirByte, 0x10);    // $24C134 copies THIS
    runOptionObject(g.ram, g.ctx);
    out.push({
      state: g.ram.u16(RAM.p1Options + OPT.state),
      flags1: g.ram.u8(RAM.p1Options + OPT.flags1),
      angle: g.ram.u8(RAM.p1Options + OPT.angle),
      pod1: g.ram.u8(RAM.p1Options + 0x3b),
      delay: g.ram.u8(RAM.p1Options + 0x3f),
      seed: g.ram.u16(0x811832),                   // POOL SLOT 28
    });
  }
  return out;
}

test('a hold AT THE SPEED FLOOR reaches the laser -- the wave-9 gate could not', {
  skip: haveTables ? false : 'no tables',
}, () => {
  const g = bench();
  seedOptions(g.ram);
  // The floor: ($1a,A4) == ($38,A4) == 12, exactly the state the old guard's
  // `speedIdx !== laserFloor` declared uninteresting and skipped.  W45: the
  // arm-up must still complete from there, because `$24C8BE`'s `cmp.b ($38,A4)`
  // only stops the SPEED RAMP and nothing else.
  g.ram.setU8(RAM.player1 + P.speedIdx, 12);
  g.ram.setU8(RAM.player1 + P.laserFloor, 12);
  const f = holdFire(g, 18);
  assert.equal(f[17].flags1 & 0x04, 0x04, '$24C1A8 latched at +17 even at the floor');
  assert.equal(g.ram.u8(RAM.player1 + P.speedIdx), 12, 'the ramp did not move');
});

test('ONE held frame is enough: the board gate is not a counter', {
  skip: haveTables ? false : 'no tables',
}, () => {
  // `$24C164` has no counter and no speed term.  The witness that the gate was
  // ENTERED on the very first held frame is `($3f,A6)`, which `$24C174`
  // decrements and which the no-laser arm `$24C2B6` would have RESET to $0A.
  const g = bench();
  seedOptions(g.ram);
  const f = holdFire(g, 1);
  assert.equal(f[0].delay, 9, '$24C174 subq.b #1 ran on the FIRST held frame');
});

test('THE ARM-UP IS 9 + 8 = 17 FRAMES and the latch needs $24C906\'s CARRY', {
  skip: haveTables ? false : 'no tables',
}, () => {
  // Every number here is from the ROM, not from running the port:
  //   +0..+8    ($3f,A6) $0A -> 0, nine frames, everything else skipped
  //   +9..+16   ($3b,A6) $30 -> $40 in steps of ($3e,A6) = 2, and ($1b,A6)
  //             $10 -> 0 by the same step -- EIGHT frames
  //   +16       $24C250 bset #4,(A6) -- the arm COMPLETES
  //   +17       $24C1A8 bset #2,($1,A6) -- THE LATCH, and it seeds pool slot 28
  //
  // 37-recon-laser §3.3 derives the same +17 and SKIPS `$24C1A4 bcc $24C33A`:
  // the latch also needs `$24C906` to return CARRY SET, which it does on its
  // first call because `($30,A6)` = $24BF4A and that record's `($12,A6)` word
  // is $FFFF.  If it did not, +17 would be an ordinary frame.
  const g = bench();
  seedOptions(g.ram);
  const f = holdFire(g, 18);
  for (let i = 0; i < 9; i++) {
    assert.equal(f[i].delay, 9 - i, `+${i}: the delay counts down`);
    assert.equal(f[i].angle, 0x10, `+${i}: the pods have not moved yet`);
  }
  assert.equal(f[8].state & 0x4000, 0, '+8: still in the delay');
  assert.equal(f[9].state & 0x4000, 0x4000,
    '+9: the delay hits 0, $24C17C bset #6,(A6), and the SAME frame swings');
  for (let i = 9; i <= 16; i++) {
    assert.equal(f[i].angle, 0x10 - 2 * (i - 8), `+${i}: ($1b,A6) -= 2`);
  }
  assert.equal(f[15].angle, 2, '+15: one step left');
  assert.equal(f[16].angle, 0, '+16: the pods are stowed');
  assert.equal(f[16].state & 0x1000, 0x1000, '+16: $24C250 bset #4,(A6)');
  assert.equal(f[16].flags1 & 0x04, 0, '+16: NOT latched yet');
  assert.equal(f[16].seed, 0, '+16: no segment seeded yet');
  assert.equal(f[17].flags1 & 0x04, 0x04, '+17: $24C1A8 bset #2,($1,A6)');
  assert.equal(f[17].seed, 0x8002,
    '+17: $24CAAE seeded POOL SLOT 28 from family 1 entry 0 ($24A932)');
  assert.equal(g.ram.u8(RAM.player1 + P.dead), 1,
    '$24C282 move.b #$1,($3f,A4) -- the ship stops spawning ordinary shots');
});

test('the gate is on the RAW byte $24C134 copies, never on the EDGE', {
  skip: haveTables ? false : 'no tables',
}, () => {
  // The cadence machine reads the EDGE ($249B48 btst #4,($19,A6)) and fires
  // once per press; the laser reads the RAW byte and fires on every held frame.
  // A port that wired the laser to the edge is silent from frame two of a hold.
  //
  // WAVE 45.  The distinction used to be told by WHICH THROW appeared; both
  // arms are ported now, so it is told by which STATE moves.  The edge alone
  // runs the pods' cadence machine and `$24C2B6` RESETS `($3f,A6)` to $0A; the
  // raw byte alone opens `$24C164` and `$24C174` decrements it.
  const g = bench();
  seedOptions(g.ram);
  g.ram.setU8(RAM.player1 + P.btnByte, 0x10);      // the EDGE alone
  runOptionObject(g.ram, g.ctx);
  assert.equal(g.ram.u8(RAM.p1Options + 0x3f), 0x0a,
    'the EDGE alone must reach $24C29E, whose $24C2B6 reloads the delay');
  assert.equal(g.ram.u16(0x810572), 0x8002,
    'and the pods\' spawn ($24D480) wrote a record into $810572 -- type $8002, '
    + 'i.e. shot dispatch entry [2] = $253E34, ported since wave 8');
  assert.equal(g.ram.u16(0x810572 + 0x2a), 0,
    '$24D566 move.w ($20,A4),(A0)+ -- the power word, 44 bytes in');
  g.ram.setU8(RAM.player1 + P.btnByte, 0);
  g.ram.setU8(RAM.player1 + P.dirByte, 0x10);      // ...now the RAW byte
  runOptionObject(g.ram, g.ctx);
  assert.equal(g.ram.u8(RAM.p1Options + 0x3f), 9,
    'the RAW byte, and only the raw byte, opens the laser gate at $24C164');
});

test('$24C160 clears the copy when player state bit 5 is set', {
  skip: haveTables ? false : 'no tables',
}, () => {
  // $24C15A btst #5,(A4) / beq $24C164 ; $24C160 clr.w ($40,A6).  PROBE_EXEC
  // measured $24C160 executing ZERO times over 600 held frames, so this is a
  // LISTING-ONLY branch -- and one no test drives is one nobody has seen work.
  const g = bench();
  seedOptions(g.ram);
  g.ram.setU8(RAM.player1 + P.dirByte, 0x10);
  g.ram.setU8(RAM.player1 + P.state, 0x20);        // bit 5 of the HIGH byte
  assert.doesNotThrow(() => runOptionObject(g.ram, g.ctx));
  assert.equal(g.ram.u16(RAM.p1Options + OPT.raw), 0);
});

// =========================================== 7. THE PODS, AND THE ROUNDING
//
// MEASURED on the board at fly-around lf2000: player posX $14C0, pod 0 at
// $1CE2 (+$822) and pod 1 at $0C9D (-$823).  The ONE-UNIT asymmetry is
// `asr.w #2` rounding toward -infinity, and it is the whole test.

test('the pods land where the board puts them, one unit apart', {
  skip: haveTables ? false : 'no tables',
}, () => {
  const g = bench();
  seedOptions(g.ram);
  runOptionObject(g.ram, g.ctx);
  assert.equal(g.ram.u16(RAM.p1Options + OPT.posX), 0x1ce2, 'pod 0 = posX + $822');
  assert.equal(g.ram.u16(RAM.p1Options + OPT.pod + OPT.posX), 0x0c9d,
    'pod 1 = posX - $823: `asr.w #2` of -1666 is -417, of +1666 is +416');
  assert.equal(g.ram.u16(RAM.p1Options + OPT.posY), 0x1179, 'angle $10 is pure X');
  assert.equal(snapshotBucket(g.ram, 15).count, 24, 'two pod records');
});

test('an unknown formation throws with the arm it would have taken', () => {
  const g = bench();
  seedOptions(g.ram);
  g.ram.setU16(RAM.player1 + P.optFormation, 4);
  const e = caught(() => runOptionObject(g.ram, g.ctx));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x24c4f8, 'formation 4 -> the $24C384 table\'s [1]');
  assert.match(e.message, /only EVEN formations land on one/);
});

test('the option TEMPLATE table and the deploy ramp are named by address', () => {
  assert.equal(OPT_TEMPLATES, 0x24bbaa);
  assert.equal(POD_SHADOW_SIZE, 0x0208);    // $24C428 move.w #$208,D3
  assert.equal(POD_SHADOW_COLOUR, 0x18);    // $24C430 move.b #$18,D4
  assert.equal(SHADOW_FLIP, 0x0018);        // $249EDE move.w #$18,D4
  assert.equal(SHIP_TABLES.glowGeom, 0x255a22);
  assert.equal(SHIP_TABLES.auraSprite, 0x25567a);
});

// ============================================= 8. THE SEAM IS A SEAM
//
// Every mutation the gate declares must actually change something, or the red
// validation is theatre.  This is the cheap unit-level half of that.

test('each declared mutation changes an output, and none leaks', {
  skip: haveTables ? false : 'no tables',
}, () => {
  const run = (mut) => {
    SHIP_MUTATE.value = mut;
    try {
      const g = bench();
      seedOptions(g.ram);
      g.ram.setU8(RAM.player1 + P.invuln, 0xff);
      g.ram.setU16(RAM.player1 + P.auraPhase, 0x3c);
      g.ram.setU16(RAM.player1 + P.glowPhase, 0x04);
      g.ram.setU16(0x80390c, 1);
      drawShip(g.ram, RAM.player1, g.ctx);
      runOptionObject(g.ram, g.ctx);
      // The three buckets AND the two phase counters.  `aura-phase-flat`
      // changes no byte of THIS frame's records -- it changes the next one --
      // so a digest of the records alone cannot see it, and a mutation the
      // check cannot see is the thing this test exists to catch.
      return [19, 15, 5].map((b) =>
        Buffer.from(snapshotBucket(g.ram, b).bytes).toString('hex')).join('|')
        + `|${g.ram.u16(RAM.player1 + P.auraPhase)}`
        + `|${g.ram.u16(RAM.player1 + P.glowPhase)}`
        // ...and the pods' own positions.  `pod-asr-toward-zero` moves pod 1 by
        // ONE unit of 1/64 px, which the enqueue's `asr.l #6` throws away -- so
        // it is invisible in every sprite record and visible only here, in
        // $8104CE.  That is a MEASURED property of the mutation, not a
        // weakness of it, and it is why `o1x` is a compared column and why the
        // mutation is declared EXPECTED-GREEN on `pgm.py shipgate`.
        + `|${g.ram.u16(RAM.p1Options + OPT.posX)}`
        + `|${g.ram.u16(RAM.p1Options + OPT.pod + OPT.posX)}`;
    } finally {
      SHIP_MUTATE.value = null;
    }
  };
  const base = run(null);
  // `no-option-object` and `no-shadow` are NOT in this list, and saying why is
  // the point: the first is checked in `type5.js` (it stops the CALL, which no
  // direct call to `runOptionObject` can see) and the second only bites on the
  // $80390C == 0 phase, which this bench pins to 1.  Both are exercised where
  // they live -- `pgm.py shipgate --break all` and `pgm.py flyaround --break`.
  for (const m of ['no-aura', 'aura-phase-flat', 'no-glow', 'glow-without-prot',
    'pods-rigid', 'pod-asr-toward-zero', 'ship-order-swapped']) {
    assert.notEqual(run(m), base, `mutation '${m}' changed nothing`);
  }
  assert.equal(SHIP_MUTATE.value, null, 'the seam must not leak between runs');
  assert.equal(run(null), base, 'and the ROM behaviour must come back exactly');
});
