// W259: Stage-4 boss A1 11, the spawner that creates type $42's aimers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { processDeferred, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { a1_11Init2A317C, a1_11Step2A31A0 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A1_TABLE = 0x2a1608;
const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a1Base;
const LIST = 0x2a31e8;
const PAIRS = [[0x00, 0x00], [0xf0, 0x01], [0xe0, 0x02], [0xd0, 0x03], [0x80, 0x04],
  [0x70, 0x05], [0x60, 0x06], [0x50, 0x07], [0xe8, 0x70], [0x68, 0x71]];

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x22, 0x2c001a00);
  ram.setU16(SLOT, 0x800b);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log };
  return { ram, log, ctx };
}
const init = (f) => a1_11Init2A317C(f.ram, ROM, f.ctx, SLOT);
const step = (f) => a1_11Step2A31A0(f.ram, ROM, f.ctx, SLOT);

const queued = (ram) => Array.from(
  { length: ram.u16(SPAWN.DEFQ_COUNT) / SPAWN.DEFQ_STRIDE },
  (_, i) => SPAWN.DEFQ_BASE + i * SPAWN.DEFQ_STRIDE);

test('W259 A1 11 is registered and its list is pinned at both ends',
  { skip: SKIP }, () => {
    for (const a of [0x2a317c, 0x2a31a0])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    assert.deepEqual([ROM.u32(A1_TABLE + 11 * 8), ROM.u32(A1_TABLE + 11 * 8 + 4)],
      [0x2a317c, 0x2a31a0]);
    // ONE selector entry, and it points at $2A31E8 + 4, so the table says where it ends.
    assert.equal(ROM.u32(LIST), 0x2a31ec);
    assert.equal(ROM.u32(LIST), LIST + 4);
    // Then a shared direction byte, a count, and TEN (angle, role) pairs.
    assert.equal(ROM.u8(0x2a31ec), 0x0e, 'the shared direction, +14');
    assert.equal(ROM.u8(0x2a31ed), 10);
    assert.deepEqual(Array.from({ length: 10 },
      (_, i) => [ROM.u8(0x2a31ee + i * 2), ROM.u8(0x2a31ef + i * 2)]), PAIRS);
    assert.throws(() => ROM.u8(0x2a3202), (e) => e.name === 'Unreached',
      'and the window stops at the next, unreferenced table');
  });

test('W259 THIS is the only producer of roles 0..7 and $70/$71', { skip: SKIP }, () => {
  // Type $42's whole role machinery -- the two invisible aimers that publish a heading
  // and the eight children that fire along it -- exists only because this list does.
  const roles = PAIRS.map(([, r]) => r);
  assert.deepEqual(roles, [0, 1, 2, 3, 4, 5, 6, 7, 0x70, 0x71]);
  assert.equal(new Set(roles).size, 10, 'each child gets its OWN role, all distinct');
  // The four cluster angles type $42's body marks with $8D are NOT in this list, which
  // is A1 9's business: $10 $65 $BB $F0 $45 $9B against these.
  const marks = [0x10, 0x65, 0xbb, 0xf0, 0x45, 0x9b];
  const shared = PAIRS.map(([a]) => a).filter((a) => marks.includes(a));
  assert.deepEqual(shared, [0xf0], 'only $F0 overlaps A1 9\'s cluster angles');
});

test('W259 INIT falls through and the volley lands on the eighth frame',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    assert.equal(f.ram.u8(SLOT + 0x02), 7, '$2A317C left 8 and the frame spent one');
    assert.equal(f.ram.u8(SLOT + 0x08), 0x48, '$2A318E -- into every child');
    assert.equal(f.ram.u16(SPAWN.DEFQ_COUNT), 0, 'nothing queued yet');
    for (let n = 0; n < 6; n++) {
      step(f);
      assert.equal(f.ram.u16(SPAWN.DEFQ_COUNT), 0, 'still counting');
    }
    step(f);
    assert.equal(queued(f.ram).length, 10, 'all ten at once');
    assert.equal(f.ram.u16(SLOT), 0,
      '$2A31E4 -- and it RETIRES itself, unlike A1 9 which waits for its children');
    assert.deepEqual(f.log.report(), []);
  });

test('W259 every child carries its own role and the shared direction',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    for (let n = 0; n < 7; n++) step(f);
    const q = queued(f.ram);
    assert.deepEqual(q.map((a) => f.ram.u8(a + 0x1b)), PAIRS.map(([x]) => x),
      '$2A31CE -- the angles, in list order');
    assert.deepEqual(q.map((a) => f.ram.u8(a + 0x21)), PAIRS.map(([, r]) => r),
      '$2A31DC -- THE ROLES, one per child');
    for (const a of q) {
      assert.equal(f.ram.u16(a + 0x02), 0x42, 'type $42');
      assert.equal(f.ram.u8(a + 0x1a), 0x0e, 'one shared direction for the ring');
      assert.equal(f.ram.u32(a + 0x1c), A6, '$2A31D2 -- the parent pointer');
      assert.equal(f.ram.u32(a + 0x16), 0x2c001a00, '$2A31C2');
      assert.equal(f.ram.u8(a + 0x20), 0x48, '$2A31D6 from $8(a4)');
    }
  });

test('W259 the roles survive into the built children\'s sub-records',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    for (let n = 0; n < 7; n++) step(f);
    assert.equal(processDeferred(f.ram, ROM, f.log, MT), 10, 'all ten were built');
    const kids = Array.from({ length: ENEMY.slots }, (_, n) =>
      ENEMY.table + n * ENEMY.stride).filter((a) => f.ram.u8(a + 0x0c) === 0x42);
    assert.equal(kids.length, 10);
    const roles = kids.map((r) => f.ram.u8(f.ram.u32(r + 0x06) + 0x3c));
    assert.deepEqual(roles.slice().sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5, 6, 7, 0x70, 0x71],
      '$2A3974 copied each one into $3C(A6), which is what the handler branches on');
    // $2A3A50 SKIPS `move.w #$8000,(a6)` for roles $70 and $71 -- and it changes
    // nothing, because the prototype's own first flags word is already $8000 and
    // `loadSubProto` writes it at `(a6)` before the body runs. So every child, aimer or
    // not, ends the frame with the same value. A fifth vestigial construct in this
    // boss, pinned here so it is not "fixed" into a difference later.
    for (const r of kids) {
      const sub = f.ram.u32(r + 0x06);
      assert.equal(f.ram.u16(sub + 0x00), 0x8000,
        `role $${f.ram.u8(sub + 0x3c).toString(16)} -- the skip is unobservable`);
    }
    assert.equal(ROM.u16(0x2a3a6a) & 0x8000, 0x8000,
      'and this is why: the prototype entry that lands at (a6) is already $8000');
    assert.deepEqual(f.log.report(), []);
  });

test('W259 it fires exactly once, because it retires on the same frame',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    for (let n = 0; n < 7; n++) step(f);
    const n0 = queued(f.ram).length;
    // The slot is clear, so a scheduler walk would not call it again -- but calling it
    // by hand proves the counter cannot come round a second time either.
    step(f);
    assert.equal(queued(f.ram).length, n0, 'no second volley');
  });
