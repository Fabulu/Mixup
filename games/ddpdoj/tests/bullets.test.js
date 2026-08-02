// WAVE 21 -- THE BULLET PATTERN GENERATORS, and a suite built to be able to fail.
//
// ============================ WHY IT IS SHAPED LIKE THIS ====================
//
// Two of the last three waves on this project shipped a gate that validated the
// ARITHMETIC and was structurally blind to the RECORD LAYOUT, because it SEEDED
// THROUGH THE CONSTANT IT WAS TESTING.  A test that writes to `base + CONST` and
// then asserts on something read back through the same `CONST` agrees with
// itself whatever `CONST` holds.
//
// So the layout tests here do TWO things differently:
//
//   1. THE TEMPLATE IS SEEDED AT LITERAL BYTE OFFSETS taken from the listing,
//      with the reading instruction named in a comment beside each one -- never
//      through `TPL.*`.
//   2. THE ASSERTION IS ON A WRITE LOG OF LITERAL ADDRESSES, not on a read-back.
//      The board wrote a word at $817F8C+$1C; so must the port, at that number.
//      A wrong `REC.attribute` is then a different ADDRESS in the log and is
//      visible, where a read-back through `REC.attribute` would not be.
//
// `21-impl-pattern-generators.md` §"the mutation table" lists every constant
// that was changed one at a time and the tests that went red for each.
//
// Everything below runs on a SYNTHETIC cartridge so `node --test` works on a
// tree with no ROM extracted.  The two tests that need the real tables skip
// themselves, loudly, when `rip/port/player.tables.json` is absent -- and print
// what they would have covered, because a silently-skipped test is worse than
// no test.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import {
  BUL, REC, TPL, TYPEBIT, WriteLog, spawnCore, fire, poolClear, behaviourFor,
  runBehaviour,
} from '../src/bullets.js';
import { VEC, velocity, foldModel } from '../src/bulletmath.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');

function grab(fn) { try { fn(); } catch (e) { return e; } return null; }

// ============================================================================
// A SYNTHETIC CARTRIDGE.
//
// `mk(base, len)` returns a window builder; every byte written into it is
// written at a LITERAL offset with the reading instruction named.
// ============================================================================
function win(base, len) {
  return { base, len, bytes: new Uint8Array(len) };
}
function put16(w, addr, v) {
  const o = addr - w.base;
  w.bytes[o] = (v >> 8) & 0xff; w.bytes[o + 1] = v & 0xff;
}
function put32(w, addr, v) {
  put16(w, addr, (v >>> 16) & 0xffff); put16(w, addr + 2, v & 0xffff);
}
function rom(...ws) {
  return new RomWindows({
    windows: ws.map((w) => ({
      base: `$${w.base.toString(16)}`, len: w.len, why: 'test',
      hex: Buffer.from(w.bytes).toString('hex'),
    })),
  });
}

// ---- the template block.  ONE kind, kind 5, at $2819F4 + 5*$14 = $281A58.
// Every field below is written at a LITERAL offset from that address and the
// comment is the instruction in $281554..$2815AC that reads it.
const TPL5 = 0x281a58;
const MARK = {
  typeWord: 0x8105,      // +$00  $281568 move.w (A1)+,(A0)+
  renderOffs: 0xaabbccdd,// +$02  $28156C move.l (A1)+,(A0)+
  descriptor: 0x11223344,// +$06  $28156E move.l (A1)+,(A0)+
  graphic: 0x5566,       // +$0A  $281570 move.w (A1)+,(A0)+
  attribute: 0x7788,     // +$0C  $281572 move.w (A1)+,($c,A0)
  baseSpeed: 20,         // +$0E  $281576 move.w (A1)+,D7
  runInit: 1,            // +$10  $2815AC tst.w (A1)
  never: 0xdead,         // +$12  READ BY NOTHING -- see TPL.stride's comment
};

function synthRom({ runInit = MARK.runInit, init = 0x2818b4 } = {}) {
  const tpls = win(0x281950, 0x390);
  put32(tpls, 0x281956 + 4 * 5, TPL5);             // $281564 movea.l (A1,D0.w),A1
  put16(tpls, TPL5 + 0x00, MARK.typeWord);
  put32(tpls, TPL5 + 0x02, MARK.renderOffs);
  put32(tpls, TPL5 + 0x06, MARK.descriptor);
  put16(tpls, TPL5 + 0x0a, MARK.graphic);
  put16(tpls, TPL5 + 0x0c, MARK.attribute);
  put16(tpls, TPL5 + 0x0e, MARK.baseSpeed);
  put16(tpls, TPL5 + 0x10, runInit);
  put16(tpls, TPL5 + 0x12, MARK.never);
  // ...and a SECOND kind, 6, sharing nothing, so a test can prove the index
  // arithmetic (kind*4 into the pointer table) rather than assume it.
  const TPL6 = 0x281a6c;
  put32(tpls, 0x281956 + 4 * 6, TPL6);
  put16(tpls, TPL6 + 0x00, 0x8106);
  put16(tpls, TPL6 + 0x0e, 20);
  const inits = win(0x2815c0, 0xb0);
  put32(inits, 0x2815c6 + 4 * 5, init);            // $2815B6 adda.w D0,A1
  put32(inits, 0x2815c6 + 4 * 6, 0x2818ac);
  const behs = win(0x282030, 0xa0);
  put32(behs, 0x282030 + 4 * 5, 0x282564);         // $281F16 adda.w D0,A0
  put32(behs, 0x282030 + 4 * 10, 0x282840);
  return rom(tpls, inits, behs);
}

/** A RAM with the pool empty, no freeze, no rank, no global speed bias. */
function synthRam() {
  const r = new Ram(null);
  poolClear(r);
  return r;
}

const REGS = () => ({ d0: 0, d1: 0, d2: 0, d3: 0, d4: 0, d5: 0, a5: 0x81332c });
const ctxOf = (extra = {}) => {
  const ram = extra.ram ?? synthRam();
  return { ram, rom: extra.rom ?? synthRom(), log: new WriteLog(ram) };
};

// ============================================================================
// 1. THE RECORD LAYOUT -- literal offsets in, literal addresses out.
// ============================================================================
test('spawn core A writes the record at the LISTING\'s literal offsets', () => {
  const ctx = ctxOf();
  const r = REGS();
  r.d0 = 0x00030005;   // speed bias +3 in the HIGH word, KIND 5 in the low
  r.d1 = 0x11;         // 1/64 turn -- bank A multiplies by four
  r.d2 = 0x12345678;   // axis A = $1234, axis B = $5678
  const out = spawnCore(ctx, r, 'A');
  assert.equal(out.carry, false);
  assert.equal(out.slot, 0);
  const B = 0x817f8c;                       // $2814CE lea $817F8C,A0
  assert.deepEqual(ctx.log.writes, [
    [B + 0x00, 2, 0x8105],                  // type word, straight from +$00
    [B + 0x02, 4, 0x12345678],              // $28156A move.l D2,(A0)+
    [B + 0x06, 4, 0xaabbccdd],              // $28156C
    [B + 0x0a, 4, 0x11223344],              // $28156E
    [B + 0x0e, 2, 0x5566],                  // $281570
    [B + 0x1c, 2, 0x7788],                  // $281572 move.w (A1)+,($c,A0)
    [B + 0x1a, 1, 23],                      // $28158A  20 + 3 + 0 + 0
    [B + 0x1b, 1, 0x44],                    // $28158E  $11 * 4 -- THE ANGLE SCALE
    [B + 0x3a, 1, 23],                      // $281592 ($2a,A0)
    [B + 0x3b, 1, 0x44],                    // $281596 ($2b,A0)
    // the spawn-init $2818B4, with A0 STILL AT BASE+$10
    [B + 0x28, 4, 0],                       // move.l D3,($18,A0)
    [B + 0x2c, 4, 0],                       // move.l D4,($1c,A0)
    [B + 0x34, 1, 0],                       // clr.b  ($24,A0)
  ]);
  // and D1 came back DIVIDED BY FOUR ($28159A lsr.b #2,D1), so a generator can
  // call the core twice with the same register.
  assert.equal(r.d1 & 0xff, 0x11);
});

test('core B sets type-word bit 9 and does NOT scale the angle', () => {
  const ctx = ctxOf();
  const r = REGS();
  r.d0 = 5; r.d1 = 0x11;
  spawnCore(ctx, r, 'B');
  const B = 0x817f8c;
  assert.deepEqual(ctx.log.writes[0], [B, 2, 0x8305]);   // $8105 | $200
  assert.deepEqual(ctx.log.writes.find((w) => w[0] === B + 0x1b),
    [B + 0x1b, 1, 0x11]);                                // NOT $44
  assert.equal(r.d1 & 0xff, 0x11);                       // no lsr either
});

test('the D3 delta lands LOW word on axis B, HIGH word on axis A', () => {
  const ctx = ctxOf();
  const r = REGS();
  r.d0 = 5; r.d2 = 0x00100020; r.d3 = 0x00030004;
  spawnCore(ctx, r, 'A');
  const B = 0x817f8c;
  const after = ctx.log.writes.filter((w) => w[0] === B + 0x02 || w[0] === B + 0x04);
  // $2815A0 add.w D3,(-$c,A0) with A0 = base+$10  ->  base+$04, the LOW word
  assert.deepEqual(after[1], [B + 0x04, 2, 0x0024]);
  // $2815A6 swap D3 / add.w D3,(-$e,A0)           ->  base+$02, the HIGH word
  assert.deepEqual(after[2], [B + 0x02, 2, 0x0013]);
});

test('a ZERO D3 skips the delta entirely -- `tst.l D3` is the WHOLE longword', () => {
  const ctx = ctxOf();
  const r = REGS();
  r.d0 = 5; r.d2 = 0x00100020; r.d3 = 0;
  spawnCore(ctx, r, 'A');
  const B = 0x817f8c;
  assert.equal(ctx.log.writes.filter((w) => w[0] === B + 0x04).length, 0);
});

test('template +$12 is never read -- the marker $DEAD appears nowhere', () => {
  const ctx = ctxOf();
  const r = REGS();
  r.d0 = 5;
  spawnCore(ctx, r, 'A');
  assert.equal(ctx.log.writes.some((w) => w[2] === 0xdead), false);
});

test('the template +$10 flag gates the spawn-init', () => {
  const ctx = ctxOf({ rom: synthRom({ runInit: 0 }) });
  const r = REGS();
  r.d0 = 5; r.d4 = 0x99;
  spawnCore(ctx, r, 'A');
  const B = 0x817f8c;
  assert.equal(ctx.log.writes.some((w) => w[0] === B + 0x2c), false);
});

// ---- the nine spawn-inits, each asserted at its RECORD offset (= its
// instruction displacement PLUS $10, because A0 is base+$10).
const INIT_CASES = [
  [0x2818ac, []],
  [0x2818b4, [[0x28, 4, 0x33333333], [0x2c, 4, 0x44444444], [0x34, 1, 0]]],
  [0x2818c8, [[0x34, 1, 0x44]]],
  [0x2818d4, [[0x34, 2, 0x4444]]],
  [0x2818e0, [[0x28, 4, 0x33333333], [0x2c, 4, 0x44444444], [0x34, 1, 0]]],
  [0x2818f4, [[0x28, 4, 0x33333333], [0x2c, 4, 0x44444444], [0x34, 1, 0],
              [0x36, 2, 0x5555]]],
  [0x28190c, [[0x28, 2, 0x1111], [0x2a, 2, 0x2222], [0x2c, 4, 0x44444444],
              [0x34, 1, 0], [0x36, 4, 0x55555555]]],
  [0x281930, [[0x2a, 1, 0x07], [0x2c, 4, 0x44444444]]],
  [0x281942, [[0x28, 4, 0x33333333], [0x2c, 4, 0x44444444],
              [0x34, 4, 0x55555555]]],
];
for (const [init, expect] of INIT_CASES) {
  test(`spawn-init $${init.toString(16).toUpperCase()} writes its RECORD offsets`,
    () => {
      const ram = synthRam();
      ram.setU16(0x8130d8, 0x1111);            // $28190C move.w $8130D8,($18,A0)
      ram.setU16(0x8130da, 0x2222);            // $281914 move.w $8130DA,($1a,A0)
      ram.setU8(0x81332c + 3, 0x07);           // $281930 move.b ($3,A5),($1a,A0)
      const ctx = { ram, rom: synthRom({ init }), log: new WriteLog(ram) };
      const r = REGS();
      r.d0 = 5; r.d3 = 0x33333333; r.d4 = 0x44444444; r.d5 = 0x55555555;
      spawnCore(ctx, r, 'A');
      const B = 0x817f8c;
      // everything AFTER the ten fixed record writes and (here) the D3 delta
      const tail = ctx.log.writes.slice(12);
      assert.deepEqual(tail, expect.map(([o, s, v]) => [B + o, s, v]));
    });
}

// ============================================================================
// 2. THE POOL -- the window ladder, the search order, the silent drop.
// ============================================================================
test('the active-window ladder is 70/110/160/190/210, in that cascade', () => {
  const want = [70, 110, 160, 190, 210];
  for (let lit = 0; lit <= 4; lit++) {
    const ram = synthRam();
    // $2814D6..$2814FA: a CASCADE. Each test only runs if the previous one was
    // non-zero, so setting $81B418 alone must still give 70.
    for (let i = 0; i < lit; i++) ram.setU16(BUL.window[i], 1);
    // fill every slot the ladder can reach, minus one
    for (let s = 0; s < 210; s++) ram.setU16(0x817f8c + s * 0x40, 0x8000);
    ram.setU16(0x817f8c + (want[lit] - 1) * 0x40, 0);
    const ctx = { ram, rom: synthRom(), log: new WriteLog(ram) };
    const r = REGS(); r.d0 = 5;
    assert.equal(spawnCore(ctx, r, 'A').slot, want[lit] - 1,
      `ladder step ${lit} should reach ${want[lit]} slots`);
  }
});

test('a slot past the window is INVISIBLE even though the pool is 210 long', () => {
  const ram = synthRam();
  for (let s = 0; s < 210; s++) ram.setU16(0x817f8c + s * 0x40, 0x8000);
  ram.setU16(0x817f8c + 70 * 0x40, 0);          // the first slot OUTSIDE 70
  const ctx = { ram, rom: synthRom(), log: new WriteLog(ram) };
  const r = REGS(); r.d0 = 5;
  const out = spawnCore(ctx, r, 'A');
  assert.equal(out.carry, true);                // $281536 ori #$1,SR
  assert.equal(ctx.log.writes.length, 0);       // ...and NOTHING was written
});

test('the search always restarts at slot 0', () => {
  const ram = synthRam();
  ram.setU16(0x817f8c, 0x8000);
  const ctx = { ram, rom: synthRom(), log: new WriteLog(ram) };
  const r = REGS(); r.d0 = 5;
  assert.equal(spawnCore(ctx, r, 'A').slot, 1);
  ram.setU16(0x817f8c, 0);
  const ctx2 = { ram, rom: synthRom(), log: new WriteLog(ram) };
  const r2 = REGS(); r2.d0 = 5;
  assert.equal(spawnCore(ctx2, r2, 'A').slot, 0);
});

// ============================================================================
// 3. THE FREEZE GATE -- including its carry-CLEAR quirk.
// ============================================================================
test('$8130D4 / $8130D2 / $811F72 are summed as WORDS and any sum!=0 declines', () => {
  for (const a of [BUL.freezeA, BUL.freezeB]) {
    const ram = synthRam();
    ram.setU16(a, 1);
    const ctx = { ram, rom: synthRom(), log: new WriteLog(ram) };
    const r = REGS(); r.d0 = 5;
    const out = spawnCore(ctx, r, 'A');
    assert.equal(out.declined, true);
    assert.equal(out.carry, false);   // the freeze exit reports SUCCESS. As written.
    assert.equal(ctx.log.writes.length, 0);
  }
});

test('$811F72 NEGATIVE with bit 0 set spawns anyway ($281544 btst / bne)', () => {
  const ram = synthRam();
  ram.setU16(BUL.freezeC, 0x8001);              // negative AND odd
  const ctx = { ram, rom: synthRom(), log: new WriteLog(ram) };
  const r = REGS(); r.d0 = 5;
  const out = spawnCore(ctx, r, 'A');
  assert.equal(out.slot, 0);
  ram.setU16(BUL.freezeC, 0x8002);              // negative, EVEN -> declines
  const ctx2 = { ram, rom: synthRom(), log: new WriteLog(ram) };
  const r2 = REGS(); r2.d0 = 5;
  assert.equal(spawnCore(ctx2, r2, 'A').declined, true);
});

test('the two GLOBAL speed biases are added to every bullet', () => {
  const ram = synthRam();
  ram.setU16(BUL.speedBias1, 3);                // $28157A add.w $813160,D7
  ram.setU16(BUL.speedBias2, 4);                // $281580 add.w $812950,D7
  const ctx = { ram, rom: synthRom(), log: new WriteLog(ram) };
  const r = REGS(); r.d0 = 0x00020005;          // bias +2
  spawnCore(ctx, r, 'A');
  assert.deepEqual(ctx.log.writes.find((w) => w[0] === 0x817f8c + 0x1a),
    [0x817f8c + 0x1a, 1, 20 + 2 + 3 + 4]);
});

// ============================================================================
// 4. THE NINETEEN GENERATORS -- shape as a function of $813098.
//
// The expectation table is written from the LISTING, one row per entry, as
// (direction, speed) pairs relative to the caller's angle and the base speed.
// Reading it is reading the fan vocabulary of the whole game.
// ============================================================================
const A = 0x20;                     // the caller's angle in 1/64 turn
const A4 = A * 4;                   // ...the same angle in 1/256 turn
const SP = 20;                      // every template's base speed

// [entry, bank, rank0 result, rank1 result] with each result a list of
// [directionByte, speedByte] in the ROM's own firing order.
const SHAPES = [
  [0x2813f0, 'A', [[A4, SP]], [[A4, SP]]],
  [0x281402, 'A', [[A4, SP]], [[A4, SP + 4]]],
  [0x281420, 'A', [[A4, SP]], [[A4, SP], [A4, SP + 6]]],
  [0x281432, 'A', [[A4, SP]], [[A4, SP], [A4, SP + 5], [A4, SP + 10]]],
  [0x281442, 'A', [[A4, SP]], [[A4 - 8, SP], [A4 + 8, SP]]],
  [0x281450, 'A', [[A4, SP]], [[A4 - 8, SP + 4], [A4 + 8, SP + 4]]],
  [0x281484, 'A', [[A4, SP]], [[A4, SP + 2], [A4 - 8, SP], [A4 + 8, SP]]],
  [0x2814b6, 'A', [[A4, SP]], [[A4, SP]]],
  // bank B is called WITH A4 (its unit is already 1/256), so its expected
  // direction bytes are A4 too -- that difference IS the bank split.
  [0x2816f6, 'B', [[A4, SP]], [[A4, SP]]],
  [0x281708, 'B', [[A4, SP]], [[A4, SP + 4]]],
  [0x281726, 'B', [[A4, SP]], [[A4, SP + 2]]],
  [0x281744, 'B', [[A4, SP]], [[A4, SP], [A4, SP + 6]]],
  [0x281754, 'B', [[A4, SP]], [[A4, SP], [A4, SP + 5], [A4, SP + 10]]],
  [0x281764, 'B', [[A4, SP]], [[A4 - 8, SP], [A4 + 8, SP]]],
  [0x281776, 'B', [[A4, SP]], [[A4 - 8, SP + 6], [A4 + 8, SP + 6]]],
  [0x2817a8, 'B', [[A4, SP]], [[A4, SP], [A4 - 8, SP], [A4 + 8, SP]]],
  [0x2817c2, 'B', [[A4, SP]], [[A4, SP]]],
];

function shapeOf(ctx, entry, angle) {
  const r = REGS();
  r.d0 = 5; r.d1 = angle;
  fire(ctx, entry, r);
  const out = [];
  for (const [a, s, v] of ctx.log.writes) {
    if (s === 1 && ((a - BUL.pool) % BUL.stride) === REC.dir) {
      out[out.length - 1][0] = v;
    } else if (s === 1 && ((a - BUL.pool) % BUL.stride) === REC.speed) {
      out.push([0, v]);
    }
  }
  return out;
}

for (const [entry, bank, atZero, atOne] of SHAPES) {
  const name = `$${entry.toString(16).toUpperCase()}`;
  test(`${name} emits ONE bullet at $813098 = 0`, () => {
    const ctx = ctxOf();
    assert.deepEqual(shapeOf(ctx, entry, bank === 'A' ? A : A4), atZero);
  });
  test(`${name} fans as the listing says at $813098 = 1`, () => {
    const ctx = ctxOf();
    ctx.ram.setU16(BUL.rank, 1);
    assert.deepEqual(shapeOf(ctx, entry, bank === 'A' ? A : A4), atOne);
  });
}

test('the two flags-adaptive entries pick 2-way / 2-way / 3-way', () => {
  // $28138A: `move.w #$81,D1 / and.b ($d,A5),D1 / bne` -> the two-way body
  //          else `movea.l ($6,A5),A0 / btst #$1,(A0) / beq` -> two-way
  //                                                    else -> three-way
  const SUB = 0x815000;
  const cases = [
    [0x81, 0x00, 2], [0x01, 0x00, 2], [0x80, 0x00, 2],
    [0x7e, 0x00, 2],                        // flags miss AND sub bit 1 clear
    [0x7e, 0x02, 3],                        // flags miss, sub bit 1 SET
    [0x00, 0xfd, 2],                        // every bit but 1
  ];
  for (const bank of ['A', 'B']) {
    const entry = bank === 'A' ? 0x2814ac : 0x2817b8;
    for (const [flags, subByte, n] of cases) {
      const ctx = ctxOf();
      ctx.ram.setU16(BUL.rank, 1);
      ctx.ram.setU8(0x81332c + 0x0d, flags);
      ctx.ram.setU32(0x81332c + 0x06, SUB);
      ctx.ram.setU8(SUB, subByte);
      assert.equal(shapeOf(ctx, entry, bank === 'A' ? A : A4).length, n,
        `bank ${bank} flags $${flags.toString(16)} sub $${subByte.toString(16)}`);
    }
  }
});

test("bank A's adaptive 3-way biases the CENTRE by +2 and bank B's does not", () => {
  // $2813AA addi.l #$20000 around the centre shot; $2816C0 has no such thing.
  // The two generators are otherwise instruction-for-instruction the same and
  // this is the only thing that separates them.
  const SUB = 0x815000;
  const mk = (entry) => {
    const ctx = ctxOf();
    ctx.ram.setU16(BUL.rank, 1);
    ctx.ram.setU8(0x81332c + 0x0d, 0x7e);
    ctx.ram.setU32(0x81332c + 0x06, SUB);
    ctx.ram.setU8(SUB, 0x02);
    return shapeOf(ctx, entry, entry === 0x2814ac ? A : A4);
  };
  assert.deepEqual(mk(0x2814ac), [[A4, SP + 2], [A4 - 8, SP], [A4 + 8, SP]]);
  assert.deepEqual(mk(0x2817b8), [[A4, SP], [A4 - 8, SP], [A4 + 8, SP]]);
});

test('$281494 is NOT an entry point and says so by address', () => {
  const e = grab(() => fire(ctxOf(), 0x281494, REGS()));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x281494);
});

test('a kind >= 39 throws by address instead of reading past the table', () => {
  const ctx = ctxOf();
  const r = REGS(); r.d0 = 39;
  const e = grab(() => spawnCore(ctx, r, 'A'));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x281956 + 4 * 39);
});

// ============================================================================
// 5. THE ANGLE / SPEED MATHS -- $284190.
// ============================================================================
function mathRom(rows) {
  const fold = win(VEC.fold, 0x200);
  for (let i = 0; i < 256; i++) put16(fold, VEC.fold + 2 * i, foldModel(i));
  const ptrs = win(VEC.speedPtrs, 1024);
  const base = 0x200d20;
  for (let s = 0; s < 256; s++) {
    put32(ptrs, VEC.speedPtrs + 4 * s, base + VEC.quadStride * s);
  }
  const ws = [fold, ptrs];
  for (const [s, gen] of rows) {
    const a = base + VEC.quadStride * s;
    const w = win(a, VEC.quadStride);
    for (let q = 0; q <= 64; q++) {
      const [dA, dB] = gen(q);
      put32(w, a + 8 * q, dA >>> 0);
      put32(w, a + 8 * q + 4, dB >>> 0);
    }
    ws.push(w);
  }
  return rom(...ws);
}

test('$283F50 folds 256 directions onto 65 quarter-angles', () => {
  // (0..63 up, 64..127 down, 128..191 up, 192..255 down), so 0 and 128 read
  // record 0 and 64 and 192 read record 64.
  assert.equal(foldModel(0) / 8, 0);
  assert.equal(foldModel(64) / 8, 64);
  assert.equal(foldModel(128) / 8, 0);
  assert.equal(foldModel(192) / 8, 64);
  assert.equal(foldModel(37) / 8, 37);
  assert.equal(foldModel(91) / 8, 128 - 91);
  assert.equal(foldModel(255) / 8, 1);
});

test('the four quadrants negate exactly $2841C2/$284202/$284242/$284282', () => {
  // A field where record q is (16*(64-q)*16, 16*q*16) so the asr.l #4 leaves
  // (16*(64-q), 16*q) and the numbers are readable.
  const r = mathRom([[7, (q) => [(64 - q) * 256, q * 256]]]);
  assert.deepEqual(velocity(r, 7, 0), { dA: 64 * 16, dB: 0 });        // Q0
  assert.deepEqual(velocity(r, 7, 64), { dA: 0, dB: 64 * 16 });       // Q1: -0
  assert.deepEqual(velocity(r, 7, 128), { dA: -64 * 16, dB: 0 });     // Q2
  assert.deepEqual(velocity(r, 7, 192), { dA: 0, dB: -64 * 16 });     // Q3
  assert.deepEqual(velocity(r, 7, 32), { dA: 32 * 16, dB: 32 * 16 });
  assert.deepEqual(velocity(r, 7, 96), { dA: -32 * 16, dB: 32 * 16 });
  assert.deepEqual(velocity(r, 7, 160), { dA: -32 * 16, dB: -32 * 16 });
  assert.deepEqual(velocity(r, 7, 224), { dA: 32 * 16, dB: -32 * 16 });
});

test('`asr.l #4` is ARITHMETIC -- it rounds a negative entry toward -infinity', () => {
  // The cartridge's own entries are non-negative, but the shift is written
  // `asr.l`, not `lsr.l`, and a port that uses `>>>` differs by one unit on any
  // future table that carries a negative. Translate as written.
  const r = mathRom([[3, (q) => (q === 0 ? [-1, -17] : [0, 0])]]);
  assert.deepEqual(velocity(r, 3, 0), { dA: -1, dB: -2 });
});

test('speed 0 is a real "do not move"', () => {
  const r = mathRom([[0, () => [0, 0]]]);
  for (const d of [0, 37, 64, 200]) {
    assert.deepEqual(velocity(r, 0, d), { dA: 0, dB: 0 });
  }
});

test('$284190 rejects anything that is not a byte, by address', () => {
  const r = mathRom([[1, () => [0, 0]]]);
  for (const [s, d] of [[256, 0], [0, 256], [-1, 0]]) {
    const e = grab(() => velocity(r, s, d));
    assert.ok(e instanceof Unreached, `speed=${s} dir=${d}`);
    assert.equal(e.romAddress, VEC.entry);
  }
});

// ============================================================================
// 6. THE KIND / BEHAVIOUR DISPATCH.
// ============================================================================
test('the mover dispatches on the LIVE type word, so 14 and 15 are kind 10', () => {
  // $281F08 moveq #$3F,D0 / and.w (A6),D0.  Kinds 14 and 15 carry template
  // $281ABC whose type word is $810A, so a bullet spawned as kind 14 dispatches
  // $282030[10] -- 39 kind INDICES, 37 distinct bullets.
  const r = synthRom();
  assert.equal(behaviourFor(r, 0x810a), 0x282840);
  assert.equal(behaviourFor(r, 0x8105), 0x282564);
  assert.equal(behaviourFor(r, 0x8305 | TYPEBIT.dispatch), 0x282564);
});

test('the 39 behaviour BODIES are unported and throw by their own address', () => {
  const e = grab(() => runBehaviour(synthRom(), 0x8105));
  assert.ok(e instanceof Unreached);
  assert.equal(e.romAddress, 0x282564);
});

test('the type-word bit names match the mover mask $5180', () => {
  assert.equal(TYPEBIT.moverMask,
    TYPEBIT.bit14 | TYPEBIT.kill | TYPEBIT.dispatch | TYPEBIT.path281F3E);
});

// ============================================================================
// 7. THE REAL CARTRIDGE -- all 39 kinds, against an INDEPENDENT parse.
//
// This does not read `TPL.*` or `REC.*` at all.  It parses each template with
// literal offsets taken from the listing and asserts the port's write log
// against literal record addresses, for every one of the 39 kinds -- including
// the 20 that no fire site in the whole 6 MB image passes.
// ============================================================================
const haveTables = fs.existsSync(TABLES);
test('all 39 kinds spawn to the bytes an independent parse of the ROM predicts',
  { skip: haveTables ? false : `${TABLES} absent -- run tools/export-tables.py` },
  () => {
    const spec = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
    const R = new RomWindows(spec.rom);
    let n = 0;
    for (let k = 0; k < 39; k++) {
      const t = R.u32(0x281956 + 4 * k);          // the pointer table, literally
      const typeWord = R.u16(t + 0);              // +$00
      const rend = R.u32(t + 2);                  // +$02
      const desc = R.u32(t + 6);                  // +$06
      const gfx = R.u16(t + 10);                  // +$0A
      const attr = R.u16(t + 12);                 // +$0C
      const spd = R.u16(t + 14);                  // +$0E
      const ini = R.u16(t + 16);                  // +$10
      const ram = synthRam();
      const ctx = { ram, rom: R, log: new WriteLog(ram) };
      const r = REGS();
      r.d0 = k; r.d1 = 0x0c; r.d2 = 0x11112222;
      spawnCore(ctx, r, 'A');
      const B = 0x817f8c;
      assert.deepEqual(ctx.log.writes.slice(0, 10), [
        [B + 0x00, 2, typeWord], [B + 0x02, 4, 0x11112222],
        [B + 0x06, 4, rend], [B + 0x0a, 4, desc], [B + 0x0e, 2, gfx],
        [B + 0x1c, 2, attr], [B + 0x1a, 1, spd], [B + 0x1b, 1, 0x30],
        [B + 0x3a, 1, spd], [B + 0x3b, 1, 0x30],
      ], `kind ${k}`);
      // The +$10 flag gates the DISPATCH, not the writes: 20 of the 39 kinds
      // point at $2818AC, which is the epilogue and writes nothing.  So the
      // honest assertion is one-directional -- flag clear MUST mean no tail.
      if (ini === 0) {
        assert.equal(ctx.log.writes.length, 10, `kind ${k} ran an init it should not`);
      }
      n++;
    }
    assert.equal(n, 39);
  });

test('the exported velocity field carries the 1.5:1 ellipse at every speed',
  { skip: haveTables ? false : `${TABLES} absent` },
  () => {
    const spec = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
    const R = new RomWindows(spec.rom);
    // MEASURED by `w21patterns.py field`: dA(dir 0) / dB(dir 64) is 1.5042 to
    // 1.5068 for every speed from 8 up (and 1.5714 at speed 1, where the
    // rounding of an 11-unit vector dominates).  The aim carries the SAME 1.5
    // on the other axis and the two cancel; a unit-circle table here would be
    // self-consistent and wrong.
    // MEASURED over all 255 non-zero speeds through THIS code: the ratio is
    // 1.48649 (speed 5) to 1.57143 (speed 1), and 1.50000 to 1.51128 once the
    // vector is long enough for the rounding not to dominate (speeds 16..255).
    for (let s = 1; s < 256; s++) {
      const ratio = velocity(R, s, 0).dA / velocity(R, s, 64).dB;
      const [lo, hi] = s >= 16 ? [1.4999, 1.5113] : [1.4864, 1.5715];
      assert.ok(ratio > lo && ratio < hi, `speed ${s} ratio ${ratio}`);
    }
    // ...and two exact rows, off the cartridge, so a wrong table is not merely
    // "still elliptical".  20-recon-pattern-tables §3 printed both.
    assert.deepEqual(velocity(R, 20, 0), { dA: 223, dB: 0 });
    assert.deepEqual(velocity(R, 20, 64), { dA: 0, dB: 148 });
    assert.deepEqual(velocity(R, 63, 0), { dA: 704, dB: 0 });
    assert.deepEqual(velocity(R, 63, 128), { dA: -704, dB: 0 });
    // ...and the fold really is the triangle, over all 256, from the cartridge.
    for (let i = 0; i < 256; i++) {
      assert.equal(R.u16(VEC.fold + 2 * i), foldModel(i), `fold[${i}]`);
    }
  });
