// W256: type $42's handler $2A3AF6, the Stage-4 boss's children in flight.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { processDeferred, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { HANDLER_ADDRESSES, runHandler } from '../src/handlers.js';
import { BUCKETS } from '../src/spritequeue.js';
import { SCHED } from '../src/scheduler.js';
import { a1_9Init2A307A, a1_9Step2A30A8 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a1Base;
const F4 = 0x8130f4, F0 = 0x8130f0, FREEZE = 0x8130d2;
const HANDLER = 0x2a3af6;

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  const bullets = [];
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x22, 0x2c001a00);
  ram.setU16(SLOT, 0x8009);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log,
    bulletSpawn(site, result) { bullets.push({ site, result }); },
    soundPost() {}, effectSpawn() {} };
  return { ram, log, ctx, bullets };
}

/** A1 9 spawns a formation and the deferred queue builds it; return the children. */
function children(f) {
  a1_9Init2A307A(f.ram, ROM, f.ctx, SLOT);
  for (let n = 0; n < 12 && f.ram.u16(SPAWN.DEFQ_COUNT) === 0; n++) {
    a1_9Step2A30A8(f.ram, ROM, f.ctx, SLOT);
  }
  processDeferred(f.ram, ROM, f.log, MT);
  return Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).filter((a) => f.ram.u8(a + 0x0c) === 0x42);
}
const run = (f, rec) => runHandler(HANDLER, f.ram, ROM, rec, f.ctx);

test('W256 the handler is registered', { skip: SKIP }, () => {
  assert.ok(HANDLER_ADDRESSES.includes(HANDLER));
  assert.equal(ROM.u32(0x267824 + 0x42 * 8 + 4), HANDLER,
    'and the type table agrees it is type $42\'s');
});

test('W256 a whole formation flies without reaching an unported path',
  { skip: SKIP }, () => {
    const f = world();
    const kids = children(f);
    assert.ok(kids.length >= 8);
    for (let frame = 0; frame < 40; frame++) {
      for (const rec of kids) if (f.ram.u16(rec) !== 0) run(f, rec);
    }
    assert.deepEqual(f.log.report(), [],
      'forty frames of every child, and no gap and no throw');
  });

test('W256 the children home: the heading changes and the position moves',
  { skip: SKIP }, () => {
    const f = world();
    const rec = children(f)[0];
    const sub = f.ram.u32(rec + 0x06);
    const start = [f.ram.u16(sub + 0x02), f.ram.u16(sub + 0x04)];
    // $2A3CA6 OVERWRITES the heading with the aim rather than slewing towards it, so
    // planting a wrong one and watching it go is the honest check. Asserting it becomes
    // non-zero would be geometry-dependent: for some formations the answer IS zero.
    f.ram.setU8(sub + 0x1b, 0x77);
    run(f, rec);
    assert.notDeepEqual([f.ram.u16(sub + 0x02), f.ram.u16(sub + 0x04)], start,
      '$241E34 applied the vector');
    assert.notEqual(f.ram.u8(sub + 0x1b), 0x77, '$2422A2 aimed it at its target');
    // $2A3CBC writes $40 first and the ladder only overrides it when close enough.
    assert.ok(f.ram.u8(sub + 0x1a) === 0x40 || f.ram.u8(sub + 0x1a) <= 0x2e,
      `speed $${f.ram.u8(sub + 0x1a).toString(16)} is the default or a ladder rung`);
  });

test('W256 the death pause freezes flight but still draws', { skip: SKIP }, () => {
  const f = world();
  const rec = children(f)[0];
  const sub = f.ram.u32(rec + 0x06);
  f.ram.setU8(sub + 0x1f, 1);                  // arrived, so the draw is enabled
  f.ram.setU16(FREEZE, 1);                     // $2A3C2A tst.w/bne -> $2A41E2
  const pos = [f.ram.u16(sub + 0x02), f.ram.u16(sub + 0x04)];
  const before = f.ram.u16(BUCKETS[2].counter) + f.ram.u16(BUCKETS[22].counter);
  run(f, rec);
  assert.deepEqual([f.ram.u16(sub + 0x02), f.ram.u16(sub + 0x04)], pos,
    'it did not move');
  assert.ok(f.ram.u16(BUCKETS[2].counter) + f.ram.u16(BUCKETS[22].counter) > before,
    'but it did draw -- $2A41E2 is past the freeze gate');
});

test('W256 IT CANNOT BE KILLED BY DAMAGE', { skip: SKIP }, () => {
  const f = world();
  const rec = children(f)[0];
  const sub = f.ram.u32(rec + 0x06);
  // Set every hit flag in the $5C mask and drain the HP to nothing.
  f.ram.setU8(sub + 0x00, f.ram.u8(sub + 0x00) | 0x5c);
  f.ram.setU16(sub + 0x18, 0);
  run(f, rec);
  // $2A3B82 restores $7FFF unconditionally BEFORE $2A3B96 tests it, so the kill arm
  // is unreachable and the enemy survives with full HP.
  assert.equal(f.ram.u16(sub + 0x18), 0x7fff, '$2A3B82 -- full HP back');
  assert.notEqual(f.ram.u16(rec), 0, 'and the record is still live');
  assert.equal(f.ram.u8(sub + 0x00) & 0x5c, 0, '$2A3B5C consumed the hit flags');
  // The hit was still scored, and the largest single hit recorded.
  assert.equal(f.ram.u16(0x8130e8), 0x7fff, '$2A3B76 -- $7FFF - 0');
  assert.ok(f.log.report().some((l) => l.includes('$2A3B7C')),
    'and the D1 the port cannot model is COUNTED, not silent');
});

test('W256 arriving is what retires it, and it counts itself back to the parent',
  { skip: SKIP }, () => {
    const f = world();
    const rec = children(f)[0];
    const sub = f.ram.u32(rec + 0x06);
    assert.equal(f.ram.u16(A6 + 0x19e), 0, 'A1 9 cleared the counter at INIT');
    // Force the heading to the arrival extreme $2A3D2E tests: the top byte of
    // $28(a6) at $FF or below 1.
    f.ram.setU16(sub + 0x28, 0x0ff0);
    f.ram.setU8(sub + 0x1f, 0);
    run(f, rec);
    assert.equal(f.ram.u8(sub + 0x1f), 1, '$2A3D46 -- the arrival latch, once');
    assert.equal(f.ram.u16(sub + 0x00), 0xa001, '$2A3D52');
    assert.equal(f.ram.u16(A6 + 0x19e), 1,
      '$2A3D5A addq.w #$1,$19e(a0) -- THE word A1 9 waits on');
    // And it is a one-shot: a second frame at the same heading must not double-count.
    f.ram.setU16(sub + 0x28, 0x0ff0);
    run(f, rec);
    assert.equal(f.ram.u16(A6 + 0x19e), 1, '$2A3D42 bne -- counted once, not twice');
  });

test('W256 a whole formation arriving retires A1 9', { skip: SKIP }, () => {
  const f = world();
  const kids = children(f);
  for (const rec of kids) {
    const sub = f.ram.u32(rec + 0x06);
    f.ram.setU16(sub + 0x28, 0x0ff0);
    run(f, rec);
  }
  assert.equal(f.ram.u16(A6 + 0x19e), kids.length, 'every child counted itself back');
  // Now A1 9's rendezvous holds and its $50 hold runs out.
  let n = 0;
  while (f.ram.u16(SLOT) !== 0 && n < 200) { a1_9Step2A30A8(f.ram, ROM, f.ctx, SLOT); n++; }
  assert.equal(f.ram.u16(SLOT), 0, 'A1 9 RETIRED -- the loop F5 arm 7 waits on closes');
  assert.equal(f.ram.u16(F4), 1, '$2A3126 raised the flag on its way out');
});

test('W256 and A1 9 retiring is what flips every survivor into mode 1',
  { skip: SKIP }, () => {
    const f = world();
    const rec = children(f)[0];
    const sub = f.ram.u32(rec + 0x06);
    assert.equal(f.ram.u8(rec + 0x3a), 0, 'the body left mode 0');
    const turn = f.ram.u16(sub + 0x26);        // the body's sign-extended direction
    f.ram.setU16(F4, 1);                       // exactly what A1 9's retire writes
    run(f, rec);
    assert.equal(f.ram.u8(rec + 0x3a), 1, '$2A3DF2 -- mode 1');
    assert.equal(f.ram.u16(sub + 0x56), 0x0060, '$2A3E06 -- and its hold');
    assert.equal(f.ram.u16(sub + 0x26), 0, '$2A3DFE stopped the turn');
    assert.equal(f.ram.u16(sub + 0x48), turn,
      '$2A3DF8 remembered the direction so $2A3D78 can turn it back on');
    assert.notEqual(turn, 0, 'and it was a real direction, not an empty save');
  });

test('W256 $8130F4 reaching 2 is a loud throw naming A4 id6', { skip: SKIP }, () => {
  const f = world();
  const rec = children(f)[0];
  f.ram.setU16(F4, 2);
  assert.throws(() => run(f, rec), (e) => e.name === 'Unreached'
    && e.romAddress === 0x2a3afe && /A4 id6/.test(e.message));
});

test('W256 the $8130F0 arm frees the child outright', { skip: SKIP }, () => {
  const f = world();
  const rec = children(f)[0];
  const sub = f.ram.u32(rec + 0x06);
  f.ram.setU8(sub + 0x1f, 1);                  // arrived, so it leaves an effect
  f.ram.setU16(F0, 1);
  run(f, rec);
  assert.equal(f.ram.u16(rec), 0, '$2A3B48 jmp $263762');
  assert.deepEqual([f.ram.u16(0x8130e8), f.ram.u16(0x8130ea)], [0, 0],
    '$2A3B16/$2A3B1E cleared both');
});

test('W256 the draw cursor walks eight cells and the mode picks the TAIL',
  { skip: SKIP }, () => {
    const f = world();
    const rec = children(f)[0];
    const sub = f.ram.u32(rec + 0x06);
    f.ram.setU8(sub + 0x1f, 1);
    f.ram.setU16(FREEZE, 1);                   // draw only, so nothing else moves
    const seen = new Set();
    for (let n = 0; n < 60; n++) { f.ram.setU8(rec + 0x3e, 0); run(f, rec); seen.add(f.ram.u16(rec + 0x3c)); }
    assert.deepEqual([...seen].sort((a, b) => a - b), [0, 4, 8, 0x0c, 0x10, 0x14, 0x18, 0x1c],
      '$2A41F4 andi.w #$1F -- eight cells, then round again');

    // $2A4236: $71(a6) picks bucket 22's stub over bucket 2's. Two DIFFERENT buckets,
    // so a port that used one for both would draw the whole second phase wrong.
    const b2 = f.ram.u16(BUCKETS[2].counter), b22 = f.ram.u16(BUCKETS[22].counter);
    f.ram.setU8(sub + 0x71, 1);
    run(f, rec);
    assert.equal(f.ram.u16(BUCKETS[2].counter), b2, 'bucket 2 untouched');
    assert.ok(f.ram.u16(BUCKETS[22].counter) > b22, '$23F7C6 -- bucket 22 instead');
  });

test('W256 roles $70 and $71 draw nothing at all', { skip: SKIP }, () => {
  // $2A4202/$2A420C -- the two roles A1 11 alone can hand out skip the draw entirely.
  for (const role of [0x70, 0x71]) {
    const f = world();
    const rec = children(f)[0];
    const sub = f.ram.u32(rec + 0x06);
    f.ram.setU8(sub + 0x1f, 1);
    f.ram.setU8(sub + 0x3c, role);
    f.ram.setU16(FREEZE, 1);
    const before = f.ram.u16(BUCKETS[2].counter) + f.ram.u16(BUCKETS[22].counter);
    run(f, rec);
    assert.equal(f.ram.u16(BUCKETS[2].counter) + f.ram.u16(BUCKETS[22].counter), before,
      `role $${role.toString(16)} enqueued nothing`);
  }
});

test('W256 an arrived child shoots on the frame counter, not every frame',
  { skip: SKIP }, () => {
    const f = world();
    const rec = children(f)[0];
    const sub = f.ram.u32(rec + 0x06);
    f.ram.setU8(sub + 0x1f, 1);                // arrived
    f.ram.setU8(sub + 0x4e, 0);
    f.ram.setU8(sub + 0x4f, 4);
    f.ram.setU16(0x80390a, 0x20);              // $2A4142 andi.w #$1F -> 0, so it arms
    run(f, rec);
    assert.equal(f.ram.u8(sub + 0x4e), 4, '$2A41A8 armed from $4F(a6)');
    // ...and the shot itself comes off $4C(a6)'s own borrow.
    f.ram.setU8(sub + 0x4c, 0);
    const before = f.bullets.length;
    run(f, rec);
    assert.ok(f.bullets.length > before, '$2A41D8 fired through $281708');
    assert.equal(f.bullets.at(-1).site, 0x2a41d8);
  });
