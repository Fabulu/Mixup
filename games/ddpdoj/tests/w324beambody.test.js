// W324 -- THE BEAM-BODY EFFECT `$289F96`, the fourth and last head into pool E's
// `$28A506` template, and the one the port had left as a COUNTED NOTE since W34.
//
// Docket D24: the owner reported "hyper when it hits just cuts off, it's missing all the hit
// sprites", and guessed it was "similar to laser". It is the same FAMILY: W53 took `$289F54`,
// W90 took `$289FC0`/`$289FDA`, and this is the remaining member.
//
// TWO THINGS ARE DIFFERENT ABOUT THIS HEAD AND BOTH ARE EASY TO GET WRONG:
//
//   1. `$289F9A moveq #$1,D1` -- it allocates **TWO** records where the other three heads
//      allocate one. D1 is the extra-record counter in the shared tail and it was a hardcoded
//      zero in `poolETail` until this wave, because the only three callers then all set 0.
//   2. It picks its player half from `($1A,A6)` instead of hard-coding one per entry point,
//      and **the sense is the opposite of the obvious reading**: `bne` KEEPS the first pair,
//      so NON-ZERO selects P1. That is the third player convention in this subsystem --
//      `laser.js`'s `BEAM[].d7` is 1 for P1 and `$289FC0`'s D7 is 0 for P1.
//
// The fixture follows w90impact.test.js: a HAND-BUILT ROM window whose reads throw if the
// port strays, and expected values derived from the listing rather than from running the port.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { SPARK, E, spawnBeamBody289F96, spawnBeamImpact289FC0 } from '../src/spark.js';
import {
  RNG_242E24, RNG_242FDE, RNG_242EC2, RNG_28AB86, RNG_24311A,
} from '../src/rng.js';

// ---------------------------------------------------------------- THE FIXTURE

class FakeRom {
  constructor() { this.b = new Map(); }
  put(a, ...bytes) { bytes.forEach((v, i) => this.b.set(a + i, v & 0xff)); }
  putW(a, v) { this.put(a, (v >> 8) & 0xff, v & 0xff); }
  putL(a, v) {
    this.put(a, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }
  u8(a) {
    if (!this.b.has(a)) throw new Error(`FakeRom: nothing at $${a.toString(16)}`);
    return this.b.get(a);
  }
  u16(a) { return (this.u8(a) << 8) | this.u8(a + 1); }
  u32(a) { return ((this.u16(a) * 0x10000) + this.u16(a + 2)) >>> 0; }
}

const TPL = 0x28a506;
const LIST = 0x28a51c;
const SPEEDS = [0x0020, 0x0040, 0x0060, 0x0080, 0x00b0];

function fullRom() {
  const rom = new FakeRom();
  // The 22 bytes at $28A506, quoted from the image exactly as W90's test quotes them.
  rom.putW(TPL + 0x00, 0x0004);
  rom.putW(TPL + 0x02, 0xfe00);
  rom.putW(TPL + 0x04, 0xff00);
  rom.putW(TPL + 0x06, 0x0208);
  rom.putW(TPL + 0x08, 0xffff);          // NEGATIVE -> the attribute comes from ($1D,A6)
  rom.putW(TPL + 0x0a, 0x0000);
  rom.putL(TPL + 0x0c, 0x0000008c);
  rom.putL(TPL + 0x10, LIST);
  rom.putW(TPL + 0x14, 0x0e06);
  SPEEDS.forEach((v, i) => rom.putW(SPARK.speedByPower + i * 2, v));
  for (let k = 0; k < 36; k++) rom.putL(LIST + k * 4, 0x220000 + k);
  for (let i = 0; i < RNG_242FDE.entries; i++) rom.put(RNG_242FDE.table + i, 1);
  for (let i = 0; i < RNG_242EC2.entries; i++) rom.put(RNG_242EC2.table + i, 0x11);
  for (let i = 0; i < RNG_28AB86.entries; i++) rom.put(RNG_28AB86.table + i, 0x02);
  for (let i = 0; i < RNG_242E24.entries; i++) rom.put(RNG_242E24.table + i, 0x10);
  for (let i = 0; i < RNG_24311A.entries; i++) rom.put(RNG_24311A.table + i, 0);
  // A DECOY where $289F54 would look: this head names its template as a PC-relative
  // immediate and must never index that table.
  for (let i = 0; i < 256; i++) rom.putL(SPARK.ptrTable + i * 4, 0x28a5ac);
  return rom;
}

const tables = (seen = []) => ({
  vector: (speed, angle) => {
    seen.push([speed, angle]);
    return { dy: 0x0100 + seen.length, dx: 0x0010 + seen.length };
  },
  shotVector: (speed, angle) => { seen.push([speed, angle]); return { dy: 3, dx: 5 }; },
});
const ctx = (seen = []) => ({ unportedLog: new UnportedLog(), tables: tables(seen) });

function fresh() {
  const ram = new Ram();
  ram.setU16(SPARK.gateWidth, 1);        // $81308C -- 30 slots per half
  ram.setU16(SPARK.gateAlloc, 0);
  ram.setU16(0x803916, 0);
  ram.setU16(SPARK.p1Power, 4);          // $810408
  ram.setU16(SPARK.p2Power, 8);          // $81046A -- deliberately DIFFERENT
  return ram;
}

/** A SEGMENT record: the A6 at `$25485E`. It is BOTH the spawner (its +$2/+$4 are the
 *  position and its +$1D the colour) AND the source of the `($1A,A6)` that picks the half --
 *  which is exactly why the port takes one argument here and not two. */
function putSegment(ram, at, { pick = 1, long = 0x4000, short = 0x2000, b1d = 0x55 } = {}) {
  ram.setU16(at + 2, long);
  ram.setU16(at + 4, short);
  ram.setU16(at + 0x1a, pick);
  ram.setU8(at + 0x1d, b1d);
  return at;
}

const SEG = 0x811f32;

/** How many slots in a half carry a live record. `$28A06C tst.w (A0)` is the liveness test
 *  and `$28A070 lea ($22,A0),A0` the stride. */
function liveIn(ram, base) {
  let n = 0;
  for (let i = 0; i < SPARK.perPlayer; i++) {
    if (ram.u16(base + i * SPARK.stride + E.status) !== 0) n++;
  }
  return n;
}

// ===========================================================================
// 1. TWO RECORDS, NOT ONE -- WHICH IS THE WHOLE POINT OF D1
// ===========================================================================

test('W324/1 $289F96 allocates TWO records where the impact heads allocate ONE', () => {
  // `$289F9A moveq #$1,D1` against `$289FC4 moveq #$0,D1`, and the shared tail's
  // `$28A086 subq.b #1,D1 / bcs` is what turns that 1 into a second pass. If `poolETail`
  // had kept D1 hardcoded at zero this head would look identical to the impact and the
  // owner's missing sprites would still be half missing.
  const ram = fresh();
  const rom = fullRom();
  putSegment(ram, SEG, { pick: 1 });
  assert.equal(spawnBeamBody289F96(ram, rom, ctx(), SEG), true);
  assert.equal(liveIn(ram, SPARK.p1Base), 2, '$289F96 fills TWO of P1\'s slots');

  // The control, on the SAME template and the same fixture: one record.
  const ram2 = fresh();
  putSegment(ram2, SEG, { pick: 1 });
  assert.equal(spawnBeamImpact289FC0(ram2, fullRom(), ctx(), SEG, 0x289fc0), true);
  assert.equal(liveIn(ram2, SPARK.p1Base), 1, '$289FC0 fills exactly one');
});

// ===========================================================================
// 2. THE PLAYER HALF COMES FROM ($1A,A6), AND THE SENSE IS INVERTED
// ===========================================================================

test('W324/2 NON-ZERO ($1A,A6) selects P1 and zero selects P2', () => {
  // `$289FAC tst.w ($1A,A6) / $289FB0 bne $28A060` -- the branch KEEPS the pair already
  // loaded, which is P1's `$81D394`/D7 = 0. So non-zero means P1. A port that read this as
  // "non-zero means the second player" would put every body spark in the wrong thirty slots
  // and give it the wrong power word, and no record COUNT would show it.
  for (const [pick, wantBase, otherBase] of [
    [1, SPARK.p1Base, SPARK.p2Base],
    [0x8000, SPARK.p1Base, SPARK.p2Base],
    [0, SPARK.p2Base, SPARK.p1Base],
  ]) {
    const ram = fresh();
    const rom = fullRom();
    putSegment(ram, SEG, { pick });
    assert.equal(spawnBeamBody289F96(ram, rom, ctx(), SEG), true);
    assert.equal(liveIn(ram, wantBase), 2,
      `($1A,A6) = $${pick.toString(16)} must fill $${wantBase.toString(16)}`);
    assert.equal(liveIn(ram, otherBase), 0,
      `($1A,A6) = $${pick.toString(16)} must not touch $${otherBase.toString(16)}`);
  }
});

test('W324/3 D7 follows the same choice, so the POWER WORD follows the half', () => {
  // D7 is used twice in this family: once for the pool half at the head and once for the
  // power word at `$28A28C`. W90's test exists for that trap on the other two heads; this
  // asserts the fourth head keeps them consistent. P1's power is 4 -> SPEEDS[2], P2's is
  // 8 -> SPEEDS[4], and the SECOND `$241812` call carries it.
  for (const [pick, wantPower] of [[1, 4], [0, 8]]) {
    const ram = fresh();
    const rom = fullRom();
    const seen = [];
    putSegment(ram, SEG, { pick });
    assert.equal(spawnBeamBody289F96(ram, rom, ctx(seen), SEG), true);
    // TWO records, so the fill tail runs twice and calls $241812 twice each time.
    assert.equal(seen.length, 4, 'two records x two $241812 calls');
    assert.equal(seen[1][0], SPEEDS[wantPower / 2],
      `($1A,A6) = ${pick} must take the power word worth ${wantPower}`);
    assert.equal(seen[3][0], SPEEDS[wantPower / 2],
      'and the SECOND record takes the same one');
  }
});

// ===========================================================================
// 3. IT IS THE SAME TEMPLATE, AND THE DECOY TABLE IS NOT READ
// ===========================================================================

test('W324/4 it uses $28A506 by immediate and never indexes $289F54\'s table', () => {
  // `$289F9C lea ($28A506,PC),A2` is an IMMEDIATE. The fixture puts a decoy at
  // `SPARK.ptrTable` whose template would give a different descriptor list, so a port that
  // indexed the table would fill a readably different record.
  const ram = fresh();
  const rom = fullRom();
  putSegment(ram, SEG, { pick: 1 });
  assert.equal(spawnBeamBody289F96(ram, rom, ctx(), SEG), true);
  // rec+$16 is the descriptor list, taken from TPL+$10 = $28A51C.
  assert.equal(ram.u32(SPARK.p1Base + 0x16), LIST,
    'the list is $28A51C, the immediate template\'s, not the decoy\'s');
  // and BOTH records got it, since this head places two.
  assert.equal(ram.u32(SPARK.p1Base + SPARK.stride + 0x16), LIST,
    'the second record too');
});

test('W324/5 the attribute comes from the SEGMENT\'s ($1D,A6), not the template', () => {
  // TPL+$08 is $FFFF, i.e. NEGATIVE, so `$28A1FC bpl` fails and `$28A1FE` takes the colour
  // from the spawner. Here the spawner is the SEGMENT record rather than the beam block,
  // which is the substitution this head makes -- so this asserts the right A6 was passed.
  const ram = fresh();
  const rom = fullRom();
  putSegment(ram, SEG, { pick: 1, b1d: 0x37 });
  assert.equal(spawnBeamBody289F96(ram, rom, ctx(), SEG), true);
  assert.equal(ram.u16(SPARK.p1Base + E.attr) & 0xff, 0x37,
    'the segment\'s own ($1D,A6) reached the record');
});

// ===========================================================================
// 4. THE FAILURE RETURN IS STILL COUNTED, WITH TWO RECORDS TO PLACE
// ===========================================================================

test('W324/6 a FULL half returns failure and counts it rather than throwing', () => {
  // `$28A078 ori #1,SR` -- the no-free-slot return. With TWO records to place this head can
  // also half-succeed, so the counted note matters more here than for the other three.
  const ram = fresh();
  const rom = fullRom();
  for (let i = 0; i < SPARK.perPlayer; i++) {
    ram.setU16(SPARK.p1Base + i * SPARK.stride + E.status, 0x8001);
  }
  putSegment(ram, SEG, { pick: 1 });
  const c = ctx();
  assert.equal(spawnBeamBody289F96(ram, rom, c, SEG), false, 'it reports FAILURE');
  assert.ok(c.unportedLog.report().length > 0, 'and the discard is COUNTED, not silent');
});
