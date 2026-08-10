// W249: Stage-4 boss A1 9 $2A307A/$2A30A8, the type-$42 formation spawner.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { SPAWN } from '../src/spawn.js';
import { SCHED, scriptAddresses } from '../src/scheduler.js';
import { a1_9Init2A307A, a1_9Step2A30A8 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A1_TABLE = 0x2a1608;
const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a1Base;
const F4 = 0x8130f4;

const LISTS = {
  0x2a3152: { speed: 0x0e, angles: [0x00, 0xf0, 0xe0, 0x55, 0x45, 0x35, 0xab, 0x9b, 0x8b] },
  0x2a315d: { speed: 0xf2, angles: [0x00, 0x10, 0x20, 0x55, 0x65, 0x75, 0xab, 0xbb, 0xcb] },
  0x2a3168: { speed: 0x0e, angles: [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0] },
  0x2a3172: { speed: 0xf2, angles: [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0] },
};

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x22, 0x2c001a00);         // the body position children inherit
  ram.setU16(SLOT, 0x8009);                  // the live A1 slot the script sits in
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log };
  return { ram, log, ctx };
}

const init = (f) => a1_9Init2A307A(f.ram, ROM, f.ctx, SLOT);
const step = (f) => a1_9Step2A30A8(f.ram, ROM, f.ctx, SLOT);

/** Every entry the deferred queue currently holds, as the fields A1 9 writes. */
function queued(ram) {
  const n = ram.u16(SPAWN.DEFQ_COUNT) / SPAWN.DEFQ_STRIDE;
  return Array.from({ length: n }, (_, i) => {
    const a = SPAWN.DEFQ_BASE + i * SPAWN.DEFQ_STRIDE;
    return { type: ram.u16(a + 0x02), flags: ram.u16(a + 0x04),
      pos: ram.u32(a + 0x16), speed: ram.u8(a + 0x1a), angle: ram.u8(a + 0x1b),
      parent: ram.u32(a + 0x1c), p20: ram.u8(a + 0x20), p21: ram.u8(a + 0x21) };
  });
}

/** Run until the volley lands, and say which list it drew. */
function volley(f) {
  for (let n = 0; n < 12 && f.ram.u16(SPAWN.DEFQ_COUNT) === 0; n++) step(f);
  const q = queued(f.ram);
  // The two eight-angle lists carry the SAME angles and differ only in the direction
  // byte, so identifying a formation needs both. Matching on angles alone silently
  // collapses $2A3168 and $2A3172 into one.
  const match = Object.entries(LISTS).find(([, l]) =>
    l.angles.length === q.length && l.speed === q[0].speed
    && q.every((e, i) => e.angle === l.angles[i]));
  return { q, list: match ? Number(match[0]) : null };
}

test('W249 A1 9 is registered and its data window is pinned at both ends',
  { skip: SKIP }, () => {
    for (const a of [0x2a307a, 0x2a30a8])
      assert.ok(scriptAddresses().includes(a), `$${a.toString(16)} registered`);
    assert.deepEqual([ROM.u32(A1_TABLE + 9 * 8), ROM.u32(A1_TABLE + 9 * 8 + 4)],
      [0x2a307a, 0x2a30a8]);
    // EIGHT selector longwords resolving to FOUR lists, each twice: that is what
    // `andi.w #$7` plus two `add.w D0,D0` reaches, and the first entry is $2A3132 +
    // $20, so the table's own contents pin where it stops.
    const sel = Array.from({ length: 8 }, (_, i) => ROM.u32(0x2a3132 + i * 4));
    assert.deepEqual(sel, [0x2a3152, 0x2a315d, 0x2a3168, 0x2a3172,
      0x2a3152, 0x2a315d, 0x2a3168, 0x2a3172]);
    assert.equal(sel[0], 0x2a3132 + 0x20, 'the first list begins where the table ends');
    // Each list is self-describing, and the last one ends at A1 ELEVEN's INIT -- the
    // A1 table is not in address order.
    for (const [base, l] of Object.entries(LISTS)) {
      const a = Number(base);
      assert.equal(ROM.u8(a), l.speed, `$${a.toString(16)} speed byte`);
      assert.equal(ROM.u8(a + 1), l.angles.length, 'and its own count');
      for (let i = 0; i < l.angles.length; i++)
        assert.equal(ROM.u8(a + 2 + i), l.angles[i]);
    }
    assert.equal(ROM.u32(A1_TABLE + 11 * 8), 0x2a317c,
      'A1 11 begins at $2A317C, which is where the lists stop');
    assert.throws(() => ROM.u8(0x2a317c), (e) => e.name === 'Unreached',
      'and the window does not run into it');
  });

test('W249 INIT falls through and spends a tick without spawning', { skip: SKIP }, () => {
  const f = fixture();
  f.ram.setU16(F4, 1);                        // something else owns the flag
  init(f);
  assert.equal(f.ram.u16(F4), 0, '$2A3098 clears it regardless');
  assert.equal(f.ram.u8(SLOT + 0x02), 7, '$2A307A left 8, and the frame spent one');
  assert.equal(f.ram.u8(SLOT + 0x03), 0x20);
  assert.equal(f.ram.u16(SLOT + 0x06), 0x000c,
    'and F5\'s side selector is gone -- $2A3086 overwrites it');
  assert.equal(f.ram.u16(A6 + 0x19e), 0, '$2A30A4');
  assert.equal(f.ram.u16(SPAWN.DEFQ_COUNT), 0, 'nothing queued yet');
  // The retire arm DID run: $19E and $4(a4) are both zero, so they matched.
  assert.equal(f.ram.u16(SLOT + 0x10), 0x4f, '$2A311E ticked on the INIT frame');
  assert.deepEqual(f.log.report(), []);
});

test('W249 the volley lands on the eighth frame, all at once', { skip: SKIP }, () => {
  const f = fixture();
  init(f);
  for (let n = 0; n < 6; n++) {
    step(f);
    assert.equal(f.ram.u16(SPAWN.DEFQ_COUNT), 0, 'still counting down');
  }
  step(f);                                    // the eighth decrement reaches zero
  const q = queued(f.ram);
  assert.ok(q.length === 8 || q.length === 9, `one full formation, got ${q.length}`);
  assert.equal(f.ram.u16(SLOT + 0x04), q.length, '$2A30D6 records the count');
  assert.equal(f.ram.u8(SLOT + 0x02), 0, 'and the counter stays at zero afterwards');
  step(f);
  assert.equal(queued(f.ram).length, q.length, '$2A30A8 beq -- it never fires twice');
});

test('W249 every child carries the parent pointer that lets it count itself back',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    const { q, list } = volley(f);
    assert.ok(list !== null, 'the angles match one of the four lists exactly');
    for (const e of q) {
      assert.equal(e.type, 0x42, '$2A30DC moveq #$42');
      assert.equal(e.flags, 0, '$263684 is the D1 = 0 entry');
      assert.equal(e.pos, 0x2c001a00, '$2A30E4 -- the body position');
      assert.equal(e.speed, LISTS[list].speed, 'one shared speed byte for the ring');
      assert.equal(e.parent, A6, '$2A30F4 move.l a6,$1c(a0) -- THE parent pointer');
      assert.equal(e.p20, 0x48, '$2A30F8 from $9(a4)');
      assert.equal(e.p21, 0xff, '$2A30FE');
    }
    assert.deepEqual(q.map((e) => e.angle), LISTS[list].angles, 'and in list order');
  });

test('W249 all four formations are reachable and only those four', { skip: SKIP }, () => {
  const seen = new Set();
  for (let trial = 0; trial < 60; trial++) {
    const f = fixture();
    // Vary the RNG cursor the way the ROM does: `addq.b #1,$803917` bumps only the
    // LOW byte, and $242EC2 indexes its 256-entry table with the whole unmasked word,
    // so the high byte must stay zero or the read leaves the table.
    f.ram.setU8(0x803917, (trial * 7) & 0xff);
    init(f);
    const { list } = volley(f);
    assert.ok(list !== null, `trial ${trial} drew a known list`);
    seen.add(list);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b),
    [0x2a3152, 0x2a315d, 0x2a3168, 0x2a3172], 'four, and never a fifth');
});

test('W249 it cannot retire until its children count themselves back',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    const { q } = volley(f);
    // $19E is 0 and $4(a4) is the count, so $2A310C's `bne` exits every frame. The
    // hold counter does not even tick. Type $42 is unported, so on the real board
    // today this is where A1 9 stops -- and F5's arms 6 and 7 both wait on it.
    const held = f.ram.u16(SLOT + 0x10);
    for (let n = 0; n < 5; n++) step(f);
    assert.equal(f.ram.u16(SLOT + 0x10), held, 'the hold is frozen, not counting');
    assert.notEqual(f.ram.u16(SLOT), 0, 'and the slot stays live');

    // Count them all back, the way $2A3D5A does, and the hold runs to zero.
    f.ram.setU16(A6 + 0x19e, q.length);
    let n = 0;
    while (f.ram.u16(SLOT) !== 0 && n < 200) { step(f); n++; }
    assert.equal(n, held, 'one tick per frame once the rendezvous holds');
    assert.equal(f.ram.u16(F4), 1, '$2A3126 raises the flag as it goes');
  });

test('W249 a raised $8130F4 freezes the hold even with every child home',
  { skip: SKIP }, () => {
    const f = fixture();
    init(f);
    const { q } = volley(f);
    f.ram.setU16(A6 + 0x19e, q.length);
    f.ram.setU16(F4, 1);                      // $2A3114 tst.w / bne
    const held = f.ram.u16(SLOT + 0x10);
    for (let n = 0; n < 5; n++) step(f);
    assert.equal(f.ram.u16(SLOT + 0x10), held, 'all three gates, not two');
  });
