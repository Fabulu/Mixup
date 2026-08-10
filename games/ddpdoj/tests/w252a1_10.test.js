// W252: Stage-4 boss A1 10, the barrage with the indirect fan dispatch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { REC } from '../src/bullets.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { RAM, P } from '../src/machine.js';
import { a1_10Init2A320E, a1_10Step2A323E } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A1_TABLE = 0x2a1608;
const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a1Base;
const BIASES = 0x2a33b2, DISPATCH = 0x2a33c2;
/** entry -> how many shots its fan makes */
const FAN_SIZE = { 0x2a33e2: 1, 0x2a33ea: 2, 0x2a3400: 3, 0x2a341c: 4 };

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  const bullets = [];
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x22, 0x2c001a00);
  ram.setU16(SLOT, 0x800a);
  ram.setU16(RAM.player1, 0x8000);
  ram.setU16(RAM.player1 + P.posY, 0x2000);
  ram.setU16(RAM.player1 + P.posX, 0x1800);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log,
    bulletSpawn(site, result) { bullets.push({ site, result }); } };
  return { ram, log, ctx, bullets };
}

const step = (f) => a1_10Step2A323E(f.ram, ROM, f.ctx, SLOT);
const flat = (f) => f.bullets
  .flatMap((b) => (Array.isArray(b.result) ? b.result : [b.result]))
  .filter((r) => r && r.addr !== null);

/** Drive state 0 until the next volley, and return how many shots it made. */
function nextVolley(f) {
  const before = f.bullets.length;
  for (let n = 0; n < 200 && f.bullets.length === before; n++) step(f);
  return f.bullets.length - before;
}

test('W252 A1 10 is registered and both its tables are pinned by each other',
  { skip: SKIP }, () => {
    for (const a of [0x2a320e, 0x2a323e])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    assert.deepEqual([ROM.u32(A1_TABLE + 10 * 8), ROM.u32(A1_TABLE + 10 * 8 + 4)],
      [0x2a320e, 0x2a323e]);
    // FOUR muzzle biases, and $2A32E4's `andi.w #$F` is what bounds them at four.
    assert.deepEqual(Array.from({ length: 4 }, (_, i) => ROM.u32(BIASES + i * 4)),
      [0xf640f980, 0xf6400680, 0xfe00f980, 0xfe000680]);
    assert.equal(BIASES + 0x10, DISPATCH, 'and they end where the dispatch begins');
    // EIGHT dispatch longwords resolving to FOUR fans, and the first entry is
    // $2A33C2 + $20, so the table's own contents say where it stops.
    const sel = Array.from({ length: 8 }, (_, i) => ROM.u32(DISPATCH + i * 4));
    assert.deepEqual(sel, [0x2a33e2, 0x2a33e2, 0x2a33ea, 0x2a33ea,
      0x2a3400, 0x2a3400, 0x2a341c, 0x2a341c]);
    assert.equal(sel[0], DISPATCH + 0x20);
    assert.throws(() => ROM.u32(DISPATCH + 0x20), (e) => e.name === 'Unreached',
      'and the window stops at the first fan\'s code');
  });

test('W252 the reachable index set is exactly the eight entries', { skip: SKIP }, () => {
  // `$C(a4)` takes 0, 4, 8, $C and `$19C(a6)` takes 0, 8, $10 -- nothing else, because
  // $2A32E4 masks the first and $2A33A2 caps the second. The largest sum is $1C.
  const reach = new Set();
  for (const c of [0, 4, 8, 0x0c]) for (const r of [0, 8, 0x10]) reach.add(c + r);
  assert.deepEqual([...reach].sort((a, b) => a - b),
    [0, 4, 8, 0x0c, 0x10, 0x14, 0x18, 0x1c], 'every entry, and never a ninth');
  // ...and the fan sizes that index set produces, grouped by the ratchet.
  const sizes = (r) => [0, 4, 8, 0x0c].map((c) => FAN_SIZE[ROM.u32(DISPATCH + c + r)]);
  assert.deepEqual(sizes(0), [1, 1, 2, 2], 'first time through: thin');
  assert.deepEqual(sizes(8), [2, 2, 3, 3]);
  assert.deepEqual(sizes(0x10), [3, 3, 4, 4], 'and by the third it is four abreast');
});

test('W252 INIT lays down its eight literals and fires nothing', { skip: SKIP }, () => {
  const f = fixture();
  a1_10Init2A320E(f.ram, ROM, f.ctx, SLOT);
  // $8(a4) arrives as the WORD $000A: the low byte is the zero state 0 tests and the
  // high byte is the $A it arms the burst from. The arm does NOT happen yet, though --
  // $2A3250's `bcc` borrows only out of an old zero and $4(a4) arrives at $40, so the
  // first volley is $41 frames away and the burst counter is still zero here.
  assert.deepEqual([f.ram.u8(SLOT + 0x08), f.ram.u8(SLOT + 0x09)], [0x00, 0x0a],
    'armed from $9(a4) only once the outer cadence borrows');
  assert.equal(f.ram.u8(SLOT + 0x04), 0x3f, '$40 less the arming frame\'s own tick');
  assert.equal(f.ram.u8(SLOT + 0x02), 0, 'still state 0');
  assert.equal(f.ram.u16(SLOT + 0x0c), 0, 'cursor at zero');
  assert.deepEqual(f.bullets, [], '$2A3292\'s bcc held the inner cadence');
  assert.deepEqual(f.log.report(), []);
});

test('W252 the fan grows with the ratchet, one shot at a time', { skip: SKIP }, () => {
  for (const [ratchet, expect] of [[0, 1], [8, 2], [0x10, 3]]) {
    const f = fixture();
    f.ram.setU16(A6 + 0x19c, ratchet);
    a1_10Init2A320E(f.ram, ROM, f.ctx, SLOT);
    assert.equal(nextVolley(f), expect,
      `$19C = $${ratchet.toString(16)} fires ${expect} from cursor 0`);
  }
});

test('W252 each fan uses RELATIVE byte steps off the aimed base', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU16(A6 + 0x19c, 0x10);              // the ratchet at its cap
  f.ram.setU16(SLOT + 0x0c, 8);                // ...and a cursor that reaches $18
  a1_10Init2A320E(f.ram, ROM, f.ctx, SLOT);
  f.ram.setU16(SLOT + 0x0c, 8);                // INIT reset it, so set it again
  assert.equal(nextVolley(f), 4, 'index $18 is the four-shot fan');
  assert.deepEqual(f.bullets.map((b) => b.site),
    [0x2a3420, 0x2a342a, 0x2a3434, 0x2a343e], '$2A341C\'s four call sites');
  const base = f.ram.u8(SLOT + 0x0b);
  const dirs = flat(f).map((r) => f.ram.u8(r.addr + REC.dir));
  assert.deepEqual(dirs, [-9, -0x1b, 9, 0x1b].map((o) => (base + o) & 0xff),
    '-9, -$1B, +9, +$1B, reached by subi/subi/addi/addi and folded to a byte');
});

test('W252 the aim is jittered by a draw, not taken raw', { skip: SKIP }, () => {
  // $2A3282 adds a $242B3C byte to the aim, so two runs from the same geometry with a
  // different RNG cursor give different bases. A port that skipped the draw would also
  // desynchronise every later draw.
  const seen = new Set();
  for (let t = 0; t < 12; t++) {
    const f = fixture();
    f.ram.setU8(0x803917, (t * 11) & 0xff);
    a1_10Init2A320E(f.ram, ROM, f.ctx, SLOT);
    nextVolley(f);                             // the aim happens with the first volley
    seen.add(f.ram.u8(SLOT + 0x0b));
  }
  assert.ok(seen.size > 1, `the base varies with the draw, saw ${seen.size} values`);
});

test('W252 the cursor walks all four muzzles, then state 1 takes over',
  { skip: SKIP }, () => {
    const f = fixture();
    a1_10Init2A320E(f.ram, ROM, f.ctx, SLOT);
    const cursors = new Set();
    for (let n = 0; n < 4000 && f.ram.u8(SLOT + 0x02) === 0; n++) {
      step(f);
      cursors.add(f.ram.u16(SLOT + 0x0c));
    }
    assert.equal(f.ram.u8(SLOT + 0x02), 1, '$2A3300 -- it reached state 1');
    assert.deepEqual([...cursors].sort((a, b) => a - b), [0, 4, 8, 0x0c],
      'all four muzzles, and the wrap to zero is what ends state 0');
    assert.equal(f.ram.u16(SLOT + 0x08), 0x000a,
      '$2A32F4 -- and $8(a4) changes hands from a byte counter to a WORD one');
    assert.equal(f.ram.u8(SLOT + 0x04), 0x30 - 1, '$2A32EE, less state 1\'s own tick');
  });

test('W252 state 1 fires TWO fans a volley and retires after ten', { skip: SKIP }, () => {
  const f = fixture();
  a1_10Init2A320E(f.ram, ROM, f.ctx, SLOT);
  f.ram.setU8(SLOT + 0x02, 1);                 // straight into state 1
  f.ram.setU16(SLOT + 0x04, 0x0002);
  f.ram.setU16(SLOT + 0x08, 0x000a);
  f.ram.setU16(SLOT + 0x0e, 0);
  const before = f.bullets.length;
  step(f);
  // $19C is 0, so entries 8 and $C -- both the two-shot fan.
  assert.equal(f.bullets.length - before, 4, 'two fans of two');
  assert.deepEqual(f.bullets.slice(before).map((b) => b.site),
    [0x2a33ee, 0x2a33f8, 0x2a33ee, 0x2a33f8], '$2A33EA twice, from two muzzles');
  assert.equal(f.ram.u16(SLOT + 0x0e), 1, '$2A334C -- the one-shot re-aim latch');
  // Nine more volleys and it retires, bumping the ratchet on the way out.
  for (let n = 0; n < 9; n++) {
    f.ram.setU8(SLOT + 0x04, 0);
    step(f);
  }
  assert.equal(f.ram.u16(SLOT), 0, '$2A33A0 clr.w (a4)');
  assert.equal(f.ram.u16(A6 + 0x19c), 8, '$2A33AC -- the ratchet, on retirement');
});

test('W252 the ratchet stops at $10 and never walks off the table', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU16(A6 + 0x19c, 0x10);
  a1_10Init2A320E(f.ram, ROM, f.ctx, SLOT);
  f.ram.setU8(SLOT + 0x02, 1);
  f.ram.setU16(SLOT + 0x08, 0x0001);
  f.ram.setU16(SLOT + 0x04, 0);
  step(f);
  assert.equal(f.ram.u16(SLOT), 0, 'it retired');
  assert.equal(f.ram.u16(A6 + 0x19c), 0x10, '$2A33A2 beq -- capped, not $18');
});
