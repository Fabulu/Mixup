// Wave 4 port unit tests.  No emulator, seconds to run.
//
// These are NOT the gate -- `pgm.py flyaround` is, and it compares 31 columns
// against the board for 2,200 logic frames.  What lives here is the arithmetic
// a frame-exact comparison can only tell you is wrong somewhere: the bit
// shuffle, the order traps, the sign of a shift, the budget's refusal to guess.
// Each test names the ROM address it pins and, where the number came off the
// board rather than out of the listing, the run that measured it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram, i16, u16, asr } from '../src/ram.js';
import { RAM, P, CLAMP, BIT } from '../src/machine.js';
import { ror16, mirrorsFromPort, postVblankEdges } from '../src/input.js';
import { WorkBudget, NEVER_TRIGGERS } from '../src/budget.js';
import { runObjectDriver, ObjOrder, OBJ } from '../src/objdriver.js';
import { Unreached } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { Game } from '../src/main.js';
import { WHITE_LABEL_PROFILE } from '../src/profiles.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));

test('the ROM tables are present -- regenerate with tools/export-tables.py', () => {
  // A SKIP IS NOT A PASS (docs/knowledge/03).  The tables are ROM-derived and
  // gitignored; their absence means the tree is not set up, and that is a
  // failure with an instruction, not a quiet pass.
  assert.ok(existsSync(TABLES),
    `${TABLES} missing -- run: python games/ddpdoj/tools/export-tables.py`);
});

const tables = existsSync(TABLES)
  ? new MoveTables(JSON.parse(readFileSync(TABLES, 'utf8'))) : null;

// ---------------------------------------------------------------- 68000 shapes
test('i16/u16 wrap the way move.w does', () => {
  assert.equal(i16(0xffff), -1);
  assert.equal(i16(0x8000), -32768);
  assert.equal(u16(-1), 0xffff);
});

test('asr.l is ARITHMETIC -- it rounds toward -infinity ($24183A)', () => {
  assert.equal(asr(-1, 4), -1);      // NOT 0: a logical shift would give 0
  assert.equal(asr(-16, 4), -1);
  assert.equal(asr(2685, 4), 167);   // speed level 15, 0 degrees
});

test('bclr returns the OLD bit, which is what the beq tests ($249512)', () => {
  const r = new Ram();
  r.setU8(0x800000, 0x20);
  assert.equal(r.bclr8(0x800000, 5), 1);
  assert.equal(r.u8(0x800000), 0x00);
  assert.equal(r.bclr8(0x800000, 5), 0);
});

// ---------------------------------------------------------------- input
test('the mirrors are not(ror.w #1) -- MEASURED against the board ($13D464)', () => {
  assert.equal(ror16(1), 0x8000);
  // portin $FFFE (1P Start alone) -> p1raw $8000. Measured, gate scenario lf1201.
  assert.equal(mirrorsFromPort(0xfffe).p1, 0x8000);
  // portin $FF7F (P1 Button 3 held) -> p1raw $0040. Measured, fly-around lf1968.
  assert.equal(mirrorsFromPort(0xff7f).p1, 0x0040);
  // nothing pressed -> p1raw 0, and p2raw $7F80 because `lsr.w #8` zero-extends
  // before the `not`, so the mirror's high byte is garbage the game never reads.
  assert.equal(mirrorsFromPort(0xffff).p1, 0x0000);
  assert.equal(mirrorsFromPort(0xffff).p2, 0x7f80);
  // Button 1 is mirror bit 4; the port bit is one higher because of the rotate.
  assert.equal(mirrorsFromPort(0xffff & ~(1 << 5)).p1, 1 << BIT.b1);
});

test('the edge is against the PREVIOUS raw, not the stored one ($23D12A)', () => {
  const r = new Ram();
  r.setU16(RAM.p1raw, 0b0001);
  r.setU16(RAM.p1prev, 0b0000);
  postVblankEdges(r);
  assert.equal(r.u16(RAM.p1edge), 0b0001, 'first frame held: an edge');
  assert.equal(r.u16(RAM.p1prev), 0b0001);
  postVblankEdges(r);
  assert.equal(r.u16(RAM.p1edge), 0b0000, 'still held: no edge');
});

// ---------------------------------------------------------------- budget
test('the work budget never triggers by default and REFUSES to guess', () => {
  const b = new WorkBudget();
  assert.equal(b.unitsPerFrame, NEVER_TRIGGERS);
  b.charge(1e9);
  assert.equal(b.exhausted, false);
  const c = new WorkBudget(2);
  c.charge(2);
  assert.equal(c.exhausted, true);
  assert.throws(() => c.truncate(0x2410e2, 'object slot 7'), (e) => {
    assert.ok(e instanceof Unreached);
    assert.equal(e.romAddress, 0x2410e2);
    assert.match(e.message, /\(C\) is UNMEASURED/);
    return true;
  });
});

test('the budget is COUNTED, never timed -- no clock is reachable from it', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/budget.js', import.meta.url)), 'utf8');
  for (const forbidden of ['Date.now', 'performance.now', 'hrtime', 'Math.random']) {
    assert.ok(!src.includes(forbidden), `budget.js must not mention ${forbidden}`);
  }
});

test('no game-logic module reaches a host clock or Math.random (NOTES-replay 1/2)', () => {
  for (const f of ['machine', 'ram', 'input', 'isr', 'budget', 'objdriver',
    'vectors', 'player', 'framesync', 'main', 'state']) {
    const src = readFileSync(fileURLToPath(new URL(`../src/${f}.js`, import.meta.url)), 'utf8');
    for (const forbidden of ['Date.now(', 'performance.now(', 'Math.random(',
      'process.hrtime']) {
      assert.ok(!src.includes(forbidden), `src/${f}.js must not call ${forbidden}`);
    }
  }
});

// ---------------------------------------------------------------- object driver
test('the driver walks 20 slots IN ORDER and skips empties ($2410CA/$2410CC)', () => {
  const r = new Ram();
  const live = [0, 3, 7, 19];
  for (const i of live) r.setU16(OBJ.base + i * OBJ.stride, 0x8002);
  const seen = [];
  const ctx = {
    budget: new WorkBudget(), order: new ObjOrder(),
    unportedLog: { note() {} }, queueNotEmpty: () => { throw new Error('queue'); },
  };
  const n = runObjectDriver(r, new Map([[2, (_ram, _slot, i) => seen.push(i)]]), ctx);
  assert.equal(n, live.length);
  assert.deepEqual(seen, live, 'ORDER is semantics, not a set');
  assert.equal(ctx.order.n, live.length);
});

test('missing-handler diagnostics use the active edition dispatch table', () => {
  const ram = new Ram();
  ram.setU16(OBJ.base, 0x8008);
  const notes = [];
  runObjectDriver(ram, new Map(), {
    budget: new WorkBudget(),
    order: new ObjOrder(),
    unportedLog: { note: (...args) => notes.push(args) },
    profile: WHITE_LABEL_PROFILE,
  });
  assert.equal(notes.length, 1);
  assert.equal(notes[0][0],
    WHITE_LABEL_PROFILE.objectDispatchProfile.tableAddress + 8 * 8);
});

test('objord mixes (slot<<16)|type, byte for byte with frame.lua', () => {
  const o = new ObjOrder();
  o.push(0, 0x8002);
  o.push(3, 0x0004);
  // FNV-1a-64 recomputed here from the same primitives frame.lua uses.
  let h = 0xcbf29ce484222325n;
  for (const k of [(0 << 16) | 0x8002, (3 << 16) | 0x0004]) {
    h = BigInt.asUintN(64, (h ^ BigInt(k >>> 0)) * 0x100000001b3n);
  }
  assert.equal(o.value, h & 0x7fffffffffffffffn);
});

test('a non-empty create queue is DRAINED by $24111E, not thrown on', () => {
  // Wave 4 threw here; wave 5 ports the allocator (src/objalloc.js, and
  // tests/objalloc.test.js pins its four failure paths).  What this test keeps
  // is the wiring: the driver must drain the queue BEFORE it walks, so an
  // object staged this frame is dispatched this frame.
  const r = new Ram();
  r.setU16(0x80e240 + 0x4a, 0x10);            // slot 0 live, priority $10
  r.setU16(0x80e240, 0x8005);
  r.setU16(0x80d56c, 0x8007);                 // one staged record, priority $20
  r.setU16(0x80d56c + 0x4a, 0x20);
  r.setU16(0x80dbac, 0x50);
  const events = [];
  const n = runObjectDriver(r, new Map(), {
    budget: new WorkBudget(), order: new ObjOrder(), unportedLog: { note() {} },
    allocEvent: (k, c) => events.push([k, c]),
  });
  assert.equal(r.u16(0x80dbac), 0, 'the queue was drained');
  assert.equal(r.u16(0x80e240), 0x8007, 'the higher priority took slot 0');
  assert.equal(r.u16(0x80e240 + 0x50), 0x8005, 'the old slot 0 moved down');
  assert.equal(n, 2, 'both are dispatched in the SAME frame');
  assert.deepEqual(events, []);
});

// ---------------------------------------------------------------- the vectors
test('the speed tables give the MEASURED deltas', { skip: !tables }, () => {
  // Board-measured on VERSION-B (scenario `speedmodes`, worklog 04):
  //   base index 22 -> 246 units/frame vertical, 163 horizontal
  //   Button 2 held -> index 28 -> 313 vertical
  assert.deepEqual(tables.vector(22, 0x00), { dy: 246, dx: 0 });
  assert.deepEqual(tables.vector(22, 0x10), { dy: 0, dx: 163 });
  assert.deepEqual(tables.vector(22, 0x20), { dy: -246, dx: 0 });
  assert.deepEqual(tables.vector(22, 0x30), { dy: 0, dx: -163 });
  assert.equal(tables.vector(28, 0x00).dy, 313);
  // speed level 0 is a real "do not move", not a missing table
  assert.deepEqual(tables.vector(0, 0x00), { dy: 0, dx: 0 });
  // the diagonals are one 45-degree entry, mirrored per quadrant
  const d = tables.vector(22, 0x08);
  assert.deepEqual(tables.vector(22, 0x18), { dy: -d.dy, dx: d.dx });
  assert.deepEqual(tables.vector(22, 0x28), { dy: -d.dy, dx: -d.dx });
  assert.deepEqual(tables.vector(22, 0x38), { dy: d.dy, dx: -d.dx });
});

test('the direction table answers a conflicting stick with $FF', { skip: !tables }, () => {
  assert.equal(tables.angleFor(0x0), 0xff);            // nothing held
  assert.equal(tables.angleFor(0x3), 0xff);            // up AND down
  assert.equal(tables.angleFor(0xc), 0xff);            // left AND right
  assert.equal(tables.angleFor(1 << BIT.up), 0x00);
  assert.equal(tables.angleFor(1 << BIT.right), 0x10);
  assert.equal(tables.angleFor(1 << BIT.down), 0x20);
  assert.equal(tables.angleFor(1 << BIT.left), 0x30);
});

test('a speed index past the exported table throws by NAME', { skip: !tables }, () => {
  assert.throws(() => tables.vector(9999, 0), (e) => e instanceof Unreached
    && e.romAddress === 0x241820);
});

// ---------------------------------------------------------------- the wall
function pinnedGame(pos, dirBit) {
  const seed = new Uint8Array(0x20000);
  const g = new Game(seed, JSON.parse(readFileSync(TABLES, 'utf8')),
    { logicFrame: 0, videoFrame: 0 });
  const r = g.ram;
  r.setU16(RAM.objTable, 0x0002);          // slot 0 = the P1 player type
  r.setU8(RAM.objTable + 7, 0);            // ($7,A5) = player index
  // W231: bit 0 of ($3,A5) is $2491D4's one-time-init latch, and every LIVE
  // player object carries it set (the seed's does). This fixture is about the
  // wall, so it starts from a player that has already initialised -- without the
  // bit, $2491C0's INIT arm runs and takes its position from the object record.
  r.setU8(RAM.objTable + 3, 1);
  r.setU16(RAM.player1 + P.posY, pos.y);
  r.setU16(RAM.player1 + P.posX, pos.x);
  r.setU8(RAM.player1 + P.speedIdx, 22);
  r.setU8(RAM.player1 + P.baseSpeed, 22);
  r.setU8(RAM.player1 + P.invuln, 0xff);
  r.setU16(RAM.mod3Phase, 1);              // stay off the governor's frame
  r.setU16(RAM.divGate3, 1);
  // the port word whose mirror is exactly `dirBit`
  const port = 0xffff & ~(1 << ((dirBit + 1) & 15));
  g.step(port);
  return g;
}

test('MOVE PAST, THEN CLAMP, and give the overshoot back ($249608/$24966E)',
  { skip: !tables }, () => {
    // One step short of the wall: the full delta lands and nothing is clamped.
    let g = pinnedGame({ y: 0x0800, x: CLAMP.xMax - 163 }, BIT.right);
    assert.equal(g.ram.u16(RAM.player1 + P.posX), CLAMP.xMax);
    assert.equal(i16(g.ram.u16(RAM.player1 + P.velX)), 163);

    // AT the wall: the move still happens, the clamp pulls it back, and the
    // ACCUMULATOR is reduced by exactly the overshoot.  A port that clamped
    // first would leave velX at 163 here, and only here.
    g = pinnedGame({ y: 0x0800, x: CLAMP.xMax - 100 }, BIT.right);
    assert.equal(g.ram.u16(RAM.player1 + P.posX), CLAMP.xMax);
    assert.equal(i16(g.ram.u16(RAM.player1 + P.velX)), 100, 'the APPLIED delta');

    // Already pinned: zero applied movement, still one wall call.
    g = pinnedGame({ y: 0x0800, x: CLAMP.xMax }, BIT.right);
    assert.equal(g.ram.u16(RAM.player1 + P.posX), CLAMP.xMax);
    assert.equal(i16(g.ram.u16(RAM.player1 + P.velX)), 0);
    assert.equal(g.wallHits.length, 1);

    // The other three walls, same shape.
    g = pinnedGame({ y: 0x0800, x: CLAMP.xMin + 100 }, BIT.left);
    assert.equal(g.ram.u16(RAM.player1 + P.posX), CLAMP.xMin);
    assert.equal(i16(g.ram.u16(RAM.player1 + P.velX)), -100);
    g = pinnedGame({ y: CLAMP.yMax - 100, x: 0x1000 }, BIT.up);
    assert.equal(g.ram.u16(RAM.player1 + P.posY), CLAMP.yMax);
    assert.equal(i16(g.ram.u16(RAM.player1 + P.velY)), 100);
    g = pinnedGame({ y: CLAMP.yMin + 100, x: 0x1000 }, BIT.down);
    assert.equal(g.ram.u16(RAM.player1 + P.posY), CLAMP.yMin);
    // -246 moved, +146 given back by the clamp: the applied delta is -100.
    assert.equal(i16(g.ram.u16(RAM.player1 + P.velY)), -100);
  });

test('a conflicting stick skips the clamps entirely ($2495C6 bra $24969C)',
  { skip: !tables }, () => {
    // Nibble 3 is up+down: the table says $FF, but bit 0 is still SET.  The ROM
    // branches PAST the vertical clamp, so a position outside the box is left
    // outside.  A port that ran the clamp here would silently "fix" it.
    const seed = new Uint8Array(0x20000);
    const g = new Game(seed, JSON.parse(readFileSync(TABLES, 'utf8')));
    const r = g.ram;
    r.setU16(RAM.objTable, 0x0002);
    r.setU8(RAM.objTable + 3, 1);                       // already initialised
    r.setU16(RAM.player1 + P.posY, CLAMP.yMax + 500);   // deliberately outside
    r.setU8(RAM.player1 + P.speedIdx, 22);
    r.setU8(RAM.player1 + P.invuln, 0xff);
    r.setU16(RAM.mod3Phase, 1);
    r.setU16(RAM.divGate3, 1);
    g.step(0xffff & ~((1 << 1) | (1 << 2)));            // up + down
    assert.equal(g.ram.u16(RAM.player1 + P.posY), CLAMP.yMax + 500);
    assert.equal(g.ram.u8(RAM.player1 + P.angle), 0xff);
  });

// ---------------------------------------------------------------- counters
test('the counters advance PER LOOP ITERATION ($23BE8C)', { skip: !tables }, () => {
  const seed = new Uint8Array(0x20000);
  const g = new Game(seed, JSON.parse(readFileSync(TABLES, 'utf8')));
  g.ram.setU16(RAM.divGate3, 1);
  const c0 = g.ram.u16(RAM.frameCounter);
  for (let i = 0; i < 7; i++) g.step(0xffff);
  assert.equal(g.ram.u16(RAM.frameCounter), c0 + 7);
  // $23BEB2..$23BEE0: three copies of $80390A, each MASKED. The wave-4 test
  // asserted the unmasked value and cited $23BEB2 -- the instruction whose very
  // next line ($23BEBC andi.w #$3) masks it -- so it would have blocked the
  // fix. 7 & 3 = 3, 7 & 7 = 7, 7 & 15 = 7.
  assert.equal(g.ram.u16(RAM.frameCounterMod4), (c0 + 7) & 0x3);   // $23BEBC
  assert.equal(g.ram.u16(RAM.frameCounterMod8), (c0 + 7) & 0x7);   // $23BECE
  assert.equal(g.ram.u16(RAM.frameCounterMod16), (c0 + 7) & 0xf);  // $23BEE0
  assert.equal(g.ram.u16(RAM.mod3Phase), 7 % 3);
  assert.equal(g.ram.u8(RAM.altPhase), 7 % 2);
  assert.equal(g.logicFrame, 7);
  assert.equal(g.videoFrame, 7);
});
