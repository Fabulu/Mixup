// W82 -- D-SCRIPT 7 (`$2943B0`) AND THE FOUR A2 OBJECT ROUTINES.
//
// The defect these exist for: `stage1-sweep`'s LAST TWO rungs -- lf19,000 and
// lf19,250, the stage ENDING -- had been BLOCKED at their first frame since the
// ladder was built, comparing ZERO logic frames between them.  W78 named
// `$2943B0`; the ladder's own RAM says the same two rungs also need OBJECT
// routines 2, 3, 4 and 5, which nothing had noticed because the A2 walk runs
// AFTER the A3 walk and the first throw hid the rest.
//
// SHAPE, following W62's and W79's.  Every expected value below is derived from
// the LISTING quoted in `src/boss.js`, never from running the port:
//   * D7's cursor cycle is the seven values `blt #$1C` admits, counted by hand;
//   * `$AF(A6)` converging on 2 is the three arms of `$2943BE`'s compare;
//   * the OBJECT routines' constants are the immediates in their `move.w`s;
//   * the table extents are the `lea` plus the index arithmetic, and each far
//     end is a longword the A2 list at `$292932` publishes as a routine.
//
// Nothing here writes a constant and reads it back through the same constant
// (`docs/knowledge/03`).  Throw assertions pin `e.romAddress`, never the text.
//
// The tests SKIP LOUDLY when the export is absent.  A skip is not a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { W82, W82_MUTATE, BOSS } from '../src/boss.js';
import { scriptAddresses, SCHED, installScripts, runScheduler25962E }
  from '../src/scheduler.js';
import { BUCKETS } from '../src/spritequeue.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const A6 = 0x81523c;                    // the boss's sub-record, as W62 uses it
const B2 = BUCKETS[2];                  // $805CC8 / $80AFC4 -- $23E020's pair

function fresh() {
  const ram = new Ram();
  const u = new UnportedLog();
  return { ram, ctx: { rom: ROM, unportedLog: u, bossSubRec: A6 } };
}

/** The twelve bytes `$23E020` wrote, as six words, at record index `n`. */
function record(ram, n) {
  const at = B2.buffer + n * 12;
  return [0, 2, 4, 6, 8, 10].map((o) => ram.u16(at + o));
}

// ===================================================== D-SCRIPT 7, `$2943B0`

test('$2943B0 ticks $AE(A6) and does NOTHING until it borrows', () => {
  const { ram } = fresh();
  ram.setU8(A6 + 0xae, 3);              // three ticks left
  ram.setU8(A6 + 0xaf, 5);              // the period
  ram.setU16(A6 + 0xaa, 0x0c);
  for (const want of [2, 1, 0]) {
    W82.d7Anim2943B0(ram, A6);
    assert.strictEqual(ram.u8(A6 + 0xae), want);
    assert.strictEqual(ram.u16(A6 + 0xaa), 0x0c, 'the cursor must not move');
    assert.strictEqual(ram.u8(A6 + 0xaf), 5, 'the period must not ramp');
  }
  // the fourth call is the one that borrows: $2943B4's `bcc` is NOT taken
  W82.d7Anim2943B0(ram, A6);
  assert.strictEqual(ram.u8(A6 + 0xae), 5, 'reloaded from $AF(A6)');
  assert.strictEqual(ram.u16(A6 + 0xaa), 0x10, 'the cursor stepped by FOUR');
});

test('$2943BE ramps the period toward 2 FROM BOTH SIDES and then stops', () => {
  // The three arms of `$2943BE cmpi.b #$2,$AF(A6)`: beq (nothing), blt (addq),
  // and the fall-through (subq).  Expected values are counted from the listing.
  for (const [start, want] of [[5, [4, 3, 2, 2, 2]], [0, [1, 2, 2, 2, 2]],
    [2, [2, 2, 2, 2, 2]]]) {
    const { ram } = fresh();
    ram.setU8(A6 + 0xaf, start);
    const got = [];
    for (let i = 0; i < want.length; i++) {
      ram.setU8(A6 + 0xae, 0);          // force the borrow every call
      W82.d7Anim2943B0(ram, A6);
      got.push(ram.u8(A6 + 0xaf));
    }
    assert.deepStrictEqual(got, want, `period from ${start}`);
  }
});

test('$2943DC WRAPS AT $1C, so the cycle is SEVEN values and never $1C', () => {
  // `blt.w $2943EC` keeps values STRICTLY BELOW $1C.  `ble` would give eight and
  // read one longword past every 32-byte row of $292BFA's table.
  const { ram } = fresh();
  ram.setU8(A6 + 0xaf, 2);
  const seen = [];
  for (let i = 0; i < 16; i++) {
    ram.setU8(A6 + 0xae, 0);
    W82.d7Anim2943B0(ram, A6);
    seen.push(ram.u16(A6 + 0xaa));
  }
  assert.deepStrictEqual(seen.slice(0, 7), [4, 8, 0xc, 0x10, 0x14, 0x18, 0]);
  assert.ok(!seen.includes(0x1c), '$1C must never be a cursor value');
  assert.strictEqual(new Set(seen).size, 7, 'seven distinct cursor values');
});

test('$2943B0 is registered ONCE and serves both INIT and STEP', () => {
  // `$29370A[7]` holds `$2943B0` TWICE -- the init and the step are the same
  // longword -- so one registration covers a slot's whole life.
  assert.ok(scriptAddresses().includes(0x2943b0));
  assert.ok(!scriptAddresses().includes(0x2943ec), 'the rts is not an entry');
});

// ============================================ THE A2 OBJECT ROUTINES

test('$292952 (OBJECT 2) emits ONE bucket-2 record with its literals', () => {
  if (SKIP) return assert.fail(SKIP);
  const { ram } = fresh();
  ram.setU32(A6 + 0x02, 0x00100020);
  ram.setU16(A6 + 0x1c, 0xbeef);
  W82.obj2_292952(ram, A6);
  assert.strictEqual(ram.u16(B2.counter), 12, 'exactly one record');
  const r = record(ram, 0);
  // `$23E020`: D0 = D1 `asr.l #6`, `andi.l #$07FF03FF`, `ori.l #$80008000`.
  const d1 = (0x00100020 + 0xe600f400) >>> 0;
  const d0 = ((((d1 | 0) >> 6) & 0x07ff03ff) | 0x80008000) >>> 0;
  assert.strictEqual(r[0], (d0 >>> 16) & 0xffff);
  assert.strictEqual(r[1], d0 & 0xffff);
  assert.strictEqual((r[2] << 16 | r[3]) >>> 0, 0x0006539c, '$292952 move.l');
  assert.strictEqual(r[4], 0x1a60, '$292962 move.w #$1A60,D3');
  assert.strictEqual(r[5], 0xbeef, '$292966 move.w $1C(A6),D4');
});

test('$292BFA indexes its table with SIGNED $AC(A6) biased by SEVEN', () => {
  if (SKIP) return assert.fail(SKIP);
  // $AC = -7 must land on the `lea`'s own address, $292C2A: that is what the
  // `addq.w #$7` is for, and it is why the table's base is its BOTTOM.
  const { ram } = fresh();
  ram.setU16(A6 + 0xac, 0xfff9);        // -7
  ram.setU16(A6 + 0xaa, 0);
  W82.obj3_292BFA(ram, ROM, A6);
  const got = (record(ram, 0)[2] << 16 | record(ram, 0)[3]) >>> 0;
  assert.strictEqual(got, ROM.u32(0x292c2a) >>> 0, '$AC=-7 -> row 0');
  // ...and $AC = 0 with the cursor at its top lands $F8 further on, which is
  // the address the ladder's own lf19,000 rung asked for and was refused.
  const { ram: r2 } = fresh();
  r2.setU16(A6 + 0xac, 0);
  r2.setU16(A6 + 0xaa, 0x18);
  W82.obj3_292BFA(r2, ROM, A6);
  const g2 = (record(r2, 0)[2] << 16 | record(r2, 0)[3]) >>> 0;
  assert.strictEqual(g2, ROM.u32(0x292d22) >>> 0, '$AC=0, cursor $18');
  assert.strictEqual(0x292d22 - 0x292c2a, (0 + 7) * 0x20 + 0x18, 'the arithmetic');
});

test('$292BFA reaches BOTH ends of its declared window and no further', () => {
  if (SKIP) return assert.fail(SKIP);
  const { ram } = fresh();
  // the extreme rows the arithmetic admits: $AC = -7 and $AC = +7 at cursor $18
  for (const [ac, aa] of [[0xfff9, 0], [7, 0x18]]) {
    ram.setU16(A6 + 0xac, ac);
    ram.setU16(A6 + 0xaa, aa);
    assert.doesNotThrow(() => W82.obj3_292BFA(ram, ROM, A6), `$AC=${ac}`);
  }
  // one row past the top is OUTSIDE, and `src/rom.js` must say so by ADDRESS
  ram.setU16(A6 + 0xac, 8);
  ram.setU16(A6 + 0xaa, 0x18);
  assert.throws(() => W82.obj3_292BFA(ram, ROM, A6), (e) => {
    assert.ok(e instanceof Unreached);
    assert.strictEqual(e.romAddress, 0x292c2a + 15 * 0x20 + 0x18);
    return true;
  }, 'a row past the pin must throw by address, not read code as art');
});

test('$292E0A reads table entry [0] ONLY -- there is no index register', () => {
  if (SKIP) return assert.fail(SKIP);
  const { ram } = fresh();
  ram.setU32(A6 + 0x02, 0x00000000);
  W82.obj4_292E0A(ram, ROM, A6);
  const r = record(ram, 0);
  assert.strictEqual((r[2] << 16 | r[3]) >>> 0, ROM.u32(0x292e32) >>> 0);
  assert.notStrictEqual(ROM.u32(0x292e32), ROM.u32(0x292e36),
    'the other two longwords differ, so "always [0]" is a real claim');
  assert.strictEqual(r[4], 0x0420, '$292E22 move.w #$420,D3');
  assert.strictEqual(r[5], 0x0015, '$292E26 move.w #$15,D4');
});

test('$292E0A adds BOTH $FC00FC00 and $F2000000, in that order', () => {
  if (SKIP) return assert.fail(SKIP);
  const { ram } = fresh();
  ram.setU32(A6 + 0x02, 0x12345678);
  W82.obj4_292E0A(ram, ROM, A6);
  const d1 = (((0x12345678 + 0xfc00fc00) >>> 0) + 0xf2000000) >>> 0;
  const d0 = ((((d1 | 0) >> 6) & 0x07ff03ff) | 0x80008000) >>> 0;
  const r = record(ram, 0);
  assert.strictEqual(r[0], (d0 >>> 16) & 0xffff);
  assert.strictEqual(r[1], d0 & 0xffff);
});

test('$292E3E emits FOUR records off ONE base -- $23E020 preserves D0', () => {
  if (SKIP) return assert.fail(SKIP);
  // `$23E050 move.l (A7)+,D0` is why the four offsets are independent.  A port
  // that let the emitter clobber D0 puts all four sprites in the same place.
  const { ram } = fresh();
  ram.setU32(A6 + 0x02, 0x00200030);
  for (const [i, f] of [0xc6, 0xc7, 0xc8, 0xc9].entries()) ram.setU8(A6 + f, i * 2);
  W82.obj5_292E3E(ram, ROM, A6);
  assert.strictEqual(ram.u16(B2.counter), 48, 'FOUR records of twelve bytes');
  const d0 = (0x00200030 + 0xfc00fd00) >>> 0;
  const pos = W82.OBJ5_LIMBS.map(([, off]) => {
    const d1 = (d0 + off) >>> 0;
    return ((((d1 | 0) >> 6) & 0x07ff03ff) | 0x80008000) >>> 0;
  });
  assert.strictEqual(new Set(pos).size, 4, 'four DISTINCT positions');
  for (let i = 0; i < 4; i++) {
    const r = record(ram, i);
    assert.strictEqual(r[0], (pos[i] >>> 16) & 0xffff, `limb ${i} hi`);
    assert.strictEqual(r[1], pos[i] & 0xffff, `limb ${i} lo`);
    assert.strictEqual(r[4], 0x0418, `limb ${i} D3 is set ONCE at $292E4E`);
    assert.strictEqual(r[5], 0x0017, `limb ${i} D4 is set ONCE at $292E52`);
  }
});

test('$292E3E masks the LOW BIT off its animation byte ($3E, not $3F)', () => {
  if (SKIP) return assert.fail(SKIP);
  // `andi.w #$3E` -- an ODD byte selects the same row as the EVEN below it.
  const cell = (b) => {
    const { ram } = fresh();
    for (const f of [0xc6, 0xc7, 0xc8, 0xc9]) ram.setU8(A6 + f, b);
    W82.obj5_292E3E(ram, ROM, A6);
    const r = record(ram, 0);
    return (r[2] << 16 | r[3]) >>> 0;
  };
  assert.strictEqual(cell(4), cell(5), '$3E makes 4 and 5 the same row');
  assert.notStrictEqual(cell(4), cell(6), '...and 6 a different one');
  assert.strictEqual(cell(4), ROM.u32(0x292eca + 8) >>> 0, '(4 & $3E)*2 = 8');
  // $40 wraps back to row 0: the mask is SIX bits wide, not seven.
  assert.strictEqual(cell(0x40), cell(0));
});

test('the five new bodies throw by ADDRESS when no A6 has been published', () => {
  if (SKIP) return assert.fail(SKIP);
  // `$259682`'s walk does not touch A6; what the object routines read is what
  // `$292902` left there.  `bossA6` must say so by address rather than let the
  // routine read sub-record offsets out of address 0.
  const { ram } = fresh();
  installScripts(ram, ROM, { a2: 0x292932 });
  const slot = SCHED.a2Base + 2 * SCHED.a2Stride;
  ram.setU16(slot, ram.u16(slot) | 1);                 // arm OBJECT 2
  ram.setU16(SCHED.mirror2, 0);
  const bare = { rom: ROM, unportedLog: new UnportedLog() };   // NO bossSubRec
  assert.throws(() => runScheduler25962E(ram, ROM, bare), (e) => {
    assert.ok(e instanceof Unreached);
    assert.strictEqual(e.romAddress, 0x292952);
    return true;
  });
  for (const a of [0x292952, 0x292bfa, 0x292e0a, 0x292e3e, 0x2943b0]) {
    assert.ok(scriptAddresses().includes(a),
      `$${a.toString(16).toUpperCase()} registered`);
  }
});

test('OBJECT 0, 1 and 6 stay UNPORTED and named -- this wave did four of seven',
  () => {
    for (const a of [0x292972, 0x292b08, 0x292f4a]) {
      assert.ok(!scriptAddresses().includes(a),
        `$${a.toString(16).toUpperCase()} must remain a loud named throw`);
    }
  });

// ========================= THE ROM WINDOWS, ASSERTED AGAINST THE CARTRIDGE ===

test('the A3 and A1 script tables are TWENTY-ONE and FIFTEEN pairs', () => {
  if (SKIP) return assert.fail(SKIP);
  // W62 sized $29370A at TEN because there are ten A3 SLOTS; the table is
  // indexed by the script ID.  Both far ends are `clr.w (a4) / rts` -- code.
  for (const [base, pairs] of [[0x29370a, 21], [0x295856, 15]]) {
    for (let i = 0; i < pairs; i++) {
      for (const off of [0, 4]) {
        const v = ROM.u32(base + i * 8 + off);
        assert.ok(v >= 0x292000 && v < 0x297000,
          `$${base.toString(16)}[${i}]+${off} = $${v.toString(16)}`);
      }
    }
    // The pin itself is CODE and must therefore sit OUTSIDE the window: the
    // window is exactly `pairs * 8` and one longword further must throw.  That
    // it cannot be READ here is the assertion -- `tools/export-tables.py`'s
    // `check_boss_script_table_extents` is what reads the image and asserts the
    // `clr.w (a4) / rts` bytes, because only the exporter has the image.
    assert.doesNotThrow(() => ROM.u32(base + (pairs - 1) * 8 + 4), 'last pair');
    assert.throws(() => ROM.u32(base + pairs * 8), (e) => e instanceof Unreached,
      'the `clr.w (a4)/rts` pin is code and must be outside the window');
  }
  assert.strictEqual(ROM.u32(0x29370a + 7 * 8), ROM.u32(0x29370a + 7 * 8 + 4),
    'D-script 7 holds $2943B0 twice');
  assert.strictEqual(ROM.u32(0x29370a + 7 * 8) >>> 0, 0x2943b0);
});

test('the three OBJECT tables are pinned by the A2 list\'s own pointers', () => {
  if (SKIP) return assert.fail(SKIP);
  const objs = [...Array(7)].map((_, i) => ROM.u32(0x292932 + i * 4) >>> 0);
  assert.strictEqual(ROM.u32(0x292932 + 7 * 4) >>> 0, 0xffffffff, 'terminator');
  for (const [base, pinIdx] of [[0x292c2a, 4], [0x292e32, 5], [0x292eca, 6]]) {
    const pin = objs[pinIdx];
    // the last longword inside must read; the pin itself must NOT
    assert.doesNotThrow(() => ROM.u32(pin - 4), `$${base.toString(16)} top`);
    assert.throws(() => ROM.u32(pin), (e) => e instanceof Unreached,
      `$${pin.toString(16)} is CODE and must be outside the window`);
  }
  assert.strictEqual(objs[6] - 0x292eca, 0x80, 'OBJECT 5: 32 longwords');
  assert.strictEqual(objs[4] - 0x292c2a, 15 * 0x20, 'OBJECT 3: fifteen rows');
});

// ====================================== THE SCHEDULER ACTUALLY DISPATCHES THEM

test('an armed A2 slot reaches the registered body through $259682', () => {
  if (SKIP) return assert.fail(SKIP);
  const { ram, ctx } = fresh();
  installScripts(ram, ROM, { a2: 0x292932 });
  // $2598E6's `ori.w #$1` on slot 2 -- OBJECT 2, `$292952`
  const slot = SCHED.a2Base + 2 * SCHED.a2Stride;
  assert.strictEqual(ram.u32(slot + 2) >>> 0, 0x292952, 'pre-filled by $2595B8');
  ram.setU16(slot, ram.u16(slot) | 1);
  ram.setU16(SCHED.mirror2, 0);                 // keep the double pass shut
  runScheduler25962E(ram, ROM, ctx);
  assert.strictEqual(ram.u16(B2.counter), 12,
    'the A2 walk ran OBJECT 2 and one record landed in bucket 2');
});

// ========================= THE RED HALF -- EVERY CHECK SEEN TO FAIL ==========
//
// `docs/knowledge/03`: a check that has never been seen red is not a check.
// These drive the SHIPPED seam (`W82_MUTATE`, the same device W79 used) rather
// than a copy, so the red half needs no source edit and cannot rot away from the
// green half.  Each probe below is the load-bearing assertion of one of the
// tests above, reduced to a function; the matrix names, for every mutation, the
// probes that MUST reject it.  A mutation no probe catches is a finding and is
// declared rather than deleted.

test.afterEach(() => { W82_MUTATE.value = null; });

/** name -> a function that THROWS on a wrong port and returns on the right one. */
const PROBES = {
  'd7-cursor-cycle': () => {
    const { ram } = fresh();
    ram.setU8(A6 + 0xaf, 2);
    const seen = [];
    for (let i = 0; i < 16; i++) {
      ram.setU8(A6 + 0xae, 0);
      W82.d7Anim2943B0(ram, A6);
      seen.push(ram.u16(A6 + 0xaa));
    }
    assert.deepStrictEqual(seen.slice(0, 7), [4, 8, 0xc, 0x10, 0x14, 0x18, 0]);
    assert.ok(!seen.includes(0x1c));
  },
  'd7-period-signed': () => {
    // `$2943C8 blt.w` is SIGNED.  A period of $FF is -1, i.e. BELOW 2, so the
    // ROM INCREMENTS it; an unsigned reading would decrement.
    const { ram } = fresh();
    ram.setU8(A6 + 0xaf, 0xff);
    ram.setU8(A6 + 0xae, 0);
    W82.d7Anim2943B0(ram, A6);
    assert.strictEqual(ram.u8(A6 + 0xaf), 0x00, '$FF is -1: blt -> addq');
  },
  'd7-period-ramp': () => {
    const { ram } = fresh();
    ram.setU8(A6 + 0xaf, 5);
    const got = [];
    for (let i = 0; i < 5; i++) {
      ram.setU8(A6 + 0xae, 0);
      W82.d7Anim2943B0(ram, A6);
      got.push(ram.u8(A6 + 0xaf));
    }
    assert.deepStrictEqual(got, [4, 3, 2, 2, 2]);
  },
  'd7-tick-gate': () => {
    const { ram } = fresh();
    ram.setU8(A6 + 0xae, 3); ram.setU8(A6 + 0xaf, 5); ram.setU16(A6 + 0xaa, 0xc);
    W82.d7Anim2943B0(ram, A6);
    assert.strictEqual(ram.u16(A6 + 0xaa), 0xc, 'no step while $AE is loaded');
    assert.strictEqual(ram.u8(A6 + 0xae), 2);
  },
  'obj2-attr': () => {
    const { ram } = fresh();
    ram.setU16(A6 + 0x1c, 0xbeef);
    W82.obj2_292952(ram, A6);
    assert.strictEqual(record(ram, 0)[5], 0xbeef);
  },
  'obj3-signed-bias': () => {
    const { ram } = fresh();
    ram.setU16(A6 + 0xac, 0xfff9);          // -7 -> row 0, the `lea`'s address
    ram.setU16(A6 + 0xaa, 0);
    W82.obj3_292BFA(ram, ROM, A6);
    const got = (record(ram, 0)[2] << 16 | record(ram, 0)[3]) >>> 0;
    assert.strictEqual(got, ROM.u32(0x292c2a) >>> 0);
    const { ram: r2 } = fresh();
    r2.setU16(A6 + 0xac, 0); r2.setU16(A6 + 0xaa, 0x18);
    W82.obj3_292BFA(r2, ROM, A6);
    assert.strictEqual((record(r2, 0)[2] << 16 | record(r2, 0)[3]) >>> 0,
      ROM.u32(0x292d22) >>> 0);
  },
  'obj4-two-adds': () => {
    const { ram } = fresh();
    ram.setU32(A6 + 0x02, 0x12345678);
    W82.obj4_292E0A(ram, ROM, A6);
    const d1 = (((0x12345678 + 0xfc00fc00) >>> 0) + 0xf2000000) >>> 0;
    const d0 = ((((d1 | 0) >> 6) & 0x07ff03ff) | 0x80008000) >>> 0;
    assert.strictEqual(record(ram, 0)[0], (d0 >>> 16) & 0xffff);
    assert.strictEqual(record(ram, 0)[1], d0 & 0xffff);
  },
  'obj4-entry-zero': () => {
    const { ram } = fresh();
    W82.obj4_292E0A(ram, ROM, A6);
    assert.strictEqual((record(ram, 0)[2] << 16 | record(ram, 0)[3]) >>> 0,
      ROM.u32(0x292e32) >>> 0);
  },
  'obj5-four-positions': () => {
    const { ram } = fresh();
    ram.setU32(A6 + 0x02, 0x00200030);
    W82.obj5_292E3E(ram, ROM, A6);
    const d0 = (0x00200030 + 0xfc00fd00) >>> 0;
    for (const [i, [, off]] of W82.OBJ5_LIMBS.entries()) {
      const d1 = (d0 + off) >>> 0;
      const p = ((((d1 | 0) >> 6) & 0x07ff03ff) | 0x80008000) >>> 0;
      assert.strictEqual(record(ram, i)[0], (p >>> 16) & 0xffff, `limb ${i}`);
      assert.strictEqual(record(ram, i)[1], p & 0xffff, `limb ${i}`);
    }
  },
  'obj5-even-mask': () => {
    const cell = (b) => {
      const { ram } = fresh();
      for (const f of [0xc6, 0xc7, 0xc8, 0xc9]) ram.setU8(A6 + f, b);
      W82.obj5_292E3E(ram, ROM, A6);
      return (record(ram, 0)[2] << 16 | record(ram, 0)[3]) >>> 0;
    };
    assert.strictEqual(cell(4), cell(5), '$3E makes 4 and 5 the same row');
  },
};

/** mutation -> the probes that MUST reject it.  Written before the run. */
const MATRIX = {
  'd7-bcc-inverted': ['d7-tick-gate'],
  'd7-no-ramp': ['d7-period-ramp'],
  'd7-unsigned-per': ['d7-period-signed'],
  'd7-step-one': ['d7-cursor-cycle'],
  'd7-wrap-ble': ['d7-cursor-cycle'],
  'obj2-no-attr': ['obj2-attr'],
  'obj3-no-bias': ['obj3-signed-bias'],
  'obj4-one-addi': ['obj4-two-adds'],
  'obj4-index-1': ['obj4-entry-zero'],
  'obj5-d0-clobbered': ['obj5-four-positions'],
  'obj5-mask-3f': ['obj5-even-mask'],
};

test('every probe is GREEN on the shipped port', () => {
  if (SKIP) return assert.fail(SKIP);
  W82_MUTATE.value = null;
  for (const [n, p] of Object.entries(PROBES)) {
    assert.doesNotThrow(p, `probe ${n} must pass clean`);
  }
});

for (const [mutation, probes] of Object.entries(MATRIX)) {
  test(`RED HALF: ${mutation} is caught by ${probes.join(', ')}`, () => {
    if (SKIP) return assert.fail(SKIP);
    W82_MUTATE.value = mutation;
    for (const n of probes) {
      assert.throws(PROBES[n], `probe ${n} must REJECT ${mutation} -- a check `
        + 'that cannot be made to fail is not a check');
    }
  });
}

// DECLARED EXPECTED-GREEN, with the measurement, before the run.
// `obj3-unsigned-ac` reads `$AC(A6)` as UNSIGNED.  It is a PROVABLE no-op:
// `i16(x) == x (mod 65536)`, `$292C06 lsl.w #$5` is a WORD shift, and
// `$292C08 adda.w` sign-extends only the truncated result -- so both readings
// are the same instruction.  Kept rather than deleted because
// `docs/knowledge/03`'s failure mode is the mutation quietly dropped for not
// going red.
test('EXPECTED-GREEN: obj3-unsigned-ac is a no-op, over ALL 65,536 values', () => {
  if (SKIP) return assert.fail(SKIP);
  const clean = [];
  for (const ac of [0xfff9, 0xffff, 0, 1, 7, 0x8000, 0x7fff]) {
    const { ram } = fresh();
    ram.setU16(A6 + 0xac, ac); ram.setU16(A6 + 0xaa, 0);
    let ok = true;
    try { W82.obj3_292BFA(ram, ROM, A6); } catch { ok = false; }
    clean.push([ac, ok, ok ? (record(ram, 0)[2] << 16 | record(ram, 0)[3]) >>> 0 : 0]);
  }
  W82_MUTATE.value = 'obj3-unsigned-ac';
  for (const [ac, wasOk, want] of clean) {
    const { ram } = fresh();
    ram.setU16(A6 + 0xac, ac); ram.setU16(A6 + 0xaa, 0);
    let ok = true;
    try { W82.obj3_292BFA(ram, ROM, A6); } catch { ok = false; }
    assert.strictEqual(ok, wasOk, `$AC=${ac.toString(16)} reachability`);
    if (ok) {
      assert.strictEqual((record(ram, 0)[2] << 16 | record(ram, 0)[3]) >>> 0, want,
        `$AC=${ac.toString(16)} must be BYTE-IDENTICAL under the mutation`);
    }
  }
});

test('the mutation seam is inert unless breakage.mjs sets it', () => {
  assert.strictEqual(W82_MUTATE.value, null,
    'W82_MUTATE must default to null; a leaked mutation would make every '
    + 'later test measure the wrong port');
  assert.strictEqual(Object.keys(MATRIX).length, 11,
    'eleven wrong ports the probes catch, plus one DECLARED '
    + 'expected-green');
});

void BOSS;
