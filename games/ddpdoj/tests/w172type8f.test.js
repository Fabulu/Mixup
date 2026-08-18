// W172: stage-2 type $8F, exact init/handler/data/art closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE8F_ART } from '../src/handlers.js';
import { BUCKETS, EMIT_TABLE, resolveEmitStub } from '../src/spritequeue.js';
import { B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const evidencePath = new URL('../tools/w172-stage2-type8f-evidence.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 0);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0);
  ram.setU8(A5 + 0x0c, 0x8f);
  ram.setU32(A6 + 0x02, 0x40002000);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  ram.setU16(0x8130b6, 4);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x6000);
  ram.setU16(0x8103ea, 0x5000);
  runInitBodyAddr(0x27751c, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function context(ram) {
  const sounds = [], bullets = [], kills = [];
  const unported = new UnportedLog();
  return { sounds, bullets, kills, unported, ctx: {
    ram, rom: ROM, tables: MT, unported,
    soundPost: (a) => sounds.push(a),
    bulletSpawn: (site, result) => bullets.push([site, result]),
    killEvent: (score, hit) => kills.push([score, hit]),
  } };
}

function sprites(ram, bucket) {
  const b = BUCKETS[bucket], out = [];
  for (let off = 0; off < ram.u16(b.counter); off += 12)
    out.push(ram.u32(b.buffer + off + 4));
  return out;
}

test('W172/1 ROM pins exact closure, 33 art streams, occurrences, and both boundaries',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27751c));
  assert.ok(HANDLER_ADDRESSES.includes(0x2775cc));
  assert.deepEqual(TYPE8F_ART,
    { headingTable: 0x272efa, headings: 32, death: 0x155b90 });
  assert.deepEqual(Array.from({ length: 32 }, (_, i) => ROM.u32(0x272efa + i * 4)),
    Array.from({ length: 32 }, (_, i) => 0x154710 + i * 0xa4));
  assert.equal(TYPE8F_ART.death, 0x154710 + 32 * 0xa4,
    'the fixed first-death stream exactly follows the 32 heading streams');
  assert.equal(ROM.u16(0x27782e), 0x3b7c, 'type $95 stub pins the handler far end');
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => [
    ROM.u8(0x27759a + i * 2), ROM.u8(0x27759b + i * 2),
  ]), [[0x11, 0x0e], [0x0e, 0x11], [0x11, 0x0e], [0x0d, 0x12], [0x0d, 0x12]]);
  assert.equal(ROM.u32(0x27829c), 0x23d762);
  assert.deepEqual(resolveEmitStub(ROM, ROM.u32(0x27829c)),
    { bucket: 0, conv: 'record' });
  const occurrences = [];
  for (let i = 0; i < 332; i++) {
    const record = 0x2325d0 + i * 8;
    if (ROM.u8(record + 4) === 0x8f) occurrences.push([record, ROM.u16(record)]);
  }
  assert.deepEqual(occurrences, [
    [0x2327d0, 0x0045], [0x2327d8, 0x0046],
    [0x232978, 0x00ad], [0x232988, 0x00b0],
    [0x2329c8, 0x00c0], [0x2329e0, 0x00cf],
    [0x2329e8, 0x00d1], [0x2329f8, 0x00d5],
    [0x232a08, 0x00d7], [0x232a10, 0x00d7], [0x232ea8, 0x018b],
  ]);
  assert.equal(ROM.u8(0x232824), 0x84,
    'the first chronological unsupported family after type $8F is type $84');
  assert.equal(ROM.u8(0x232ec4), 0x94,
    'type $94 follows the final type-$8F occurrence, but is not the runtime frontier');
});

test('W172/2 init copies exact prototypes, preserves aim, rank cadence, and palette',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.equal(ram.u16(A6), 0xa200);
  assert.equal(ram.u8(A5 + 0x17), 4);
  assert.equal(ram.u8(A6 + 0x1d), 0x0e, 'stage 2 reads pair at byte offset 2');
  assert.equal(ram.u8(A5 + 0x18), 0x0e);
  assert.equal(ram.u8(A5 + 0x19), 0x11);
  assert.equal(ram.u32(A6 + 0x0a),
    ROM.u32(0x272efa + ((ram.u8(A5 + 0x21) & 0x3e) << 1)),
    'the aimed heading byte selects the initial art and is stored for the handler');
  assert.ok(ROM.u32(0x272efa) <= ram.u32(A6 + 0x0a));
  assert.ok(ram.u32(A6 + 0x0a) <= ROM.u32(0x272f76));
});

test('W172/3 natural and special draws resolve index 0 through bucket 0',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU8(A6 + 0x01, ram.u8(A6 + 0x01) | 0x80);
  runHandler(0x2775cc, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A6 + 0x1e), 0);
  assert.deepEqual(sprites(ram, 0), [ram.u32(A6 + 0x0a)]);
  assert.deepEqual(sprites(ram, 7), []);
});

test('W172/3b hardcoded-index mutation redirects both draw paths through table entry 5',
  { skip: SKIP }, () => {
  for (const special of [false, true]) {
    const ram = fixture();
    const c = context(ram);
    ram.setU16(A6 + 0x1e, 5);
    if (special) ram.setU8(A6 + 0x01, ram.u8(A6 + 0x01) | 0x80);
    runHandler(0x2775cc, ram, ROM, A5, c.ctx);
    assert.equal(ROM.u32(EMIT_TABLE.dispatch27829C + 5 * 4), 0x23d852);
    assert.deepEqual(sprites(ram, 7), [ram.u32(A6 + 0x0a)]);
    assert.deepEqual(sprites(ram, 0), [],
      'hardcoding the natural index-0 stub makes this mutation fail');
  }
});

test('W172/4 fire uses the exact vector, generator registers, and salvo cadence',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU8(A5 + 0x16, 1);
  ram.setU8(A5 + 0x1a, 0);
  ram.setU8(A5 + 0x1c, 0);
  ram.setU8(A5 + 0x1d, 3);
  ram.setU16(A5 + 0x20, 0);
  ram.setU16(A6 + 0x02, 0x5000);
  ram.setU16(0x8103e8, 0xe000);
  ram.setU16(0x8103ea, 0xe000);
  runHandler(0x2775cc, ram, ROM, A5, c.ctx);
  assert.equal(c.bullets[0]?.[0], 0x27772c);
  assert.equal(ram.u8(A5 + 0x1c), 3, 'borrow reloads the salvo byte');
  assert.equal(ram.u8(A5 + 0x1a), 0x40, '$40 - rank($04) + 4');
});

test('W172/5 death is two-stage with exact effects, fixed art, notes, and free',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x2775cc, ram, ROM, A5, c.ctx);
  assert.notEqual(ram.u16(A5), 0, 'first negative HP does not free');
  assert.equal(ram.u32(A6 + 0x0a), TYPE8F_ART.death);
  assert.equal(ram.u16(A6 + 0x18), 0x0300);
  assert.deepEqual(c.kills, [[0x08, 0x10]]);
  assert.equal(ram.u16(0x81b732) & 0xff, 0x84);
  assert.equal(ram.u16(0x81b732 + B.nudge), 0xfe00);
  assert.equal(ram.u16(0x81b732 + B.nudge + 2), 0xfe00);

  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x2775cc, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0);
  assert.deepEqual(c.sounds, [0x28c25a]);
  assert.deepEqual(c.kills, [[0x08, 0x10], [0x08, 0x10]]);
  assert.equal(c.unported.report().filter((x) => x.includes('$289AF4')).length, 1);
  // W411 (docket D49): `$2777E2 jsr $27F8EE` was a counted note and is now a DROP.
  const drops = poolA(ram);
  assert.equal(drops.length, 1, 'one gold disc, D1 = 0 so it lands on the carrier');
  assert.equal(drops[0].kind, 2, 'kind index 2, from `$2777DC moveq #$8,D0`');
  const second = 0x81b732 + 0x38;
  assert.equal(ram.u16(second) & 0xff, 0x0c);
  assert.equal(ram.u32(second + B.nudge), 0xfc00fe00);
  assert.equal(ram.u16(second + B.hook), 1);
});


/** W411: every live pool-A record, as {kind index, long axis, short axis}. The ten
 *  enemy death arms that used to be `$27F8EE`/`$27F8FA` notes now leave records, so
 *  the assertion that used to count a note reads the pool instead. */
function poolA(ram) {
  const out = [];
  for (let i = 0; i < 80; i++) {
    const a = 0x8171be + i * 0x2c;
    const st = ram.u16(a);
    if (st !== 0) out.push({ kind: (st & 0x7c) >> 2, y: ram.u16(a + 2), x: ram.u16(a + 4) });
  }
  return out;
}

test('W172/6 controlled evidence records the bounded no-stage-2 result without promotion',
  { skip: !existsSync(evidencePath) ? 'controlled MAME evidence pending' : false }, () => {
  const e = JSON.parse(readFileSync(evidencePath, 'utf8'));
  assert.equal(e.static_occurrence_count, 11);
  assert.equal(e.static_occurrences.length, 11);
  assert.deepEqual(e.static_occurrences[0],
    { record: 0x2327d0, trigger: 0x0045, type: 0x8f });
  assert.deepEqual(e.observed_occurrences, [],
    'the bounded board attempt did not reach stage 2 and must not be promoted to evidence');
  assert.equal(e.controlled_attempt.outcome, 'NO_STAGE2_TYPE8F');
  assert.match(e.isolation_intervention.invalid_for, /Pacing/);
  assert.equal(e.death_intervention.stages, 0);
  assert.equal(e.emitter.live_animation_index, 0);
  assert.equal(e.emitter.table_pointer, 0x23d762);
  assert.deepEqual(e.emitter.first_isolated_handler_emissions, []);
  assert.match(e.limitations, /not claimed as controlled-board observations/);
});
