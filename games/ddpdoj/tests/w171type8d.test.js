// W171: stage-2 type $8D, exact init/handler/data/art closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE8D_ART } from '../src/handlers.js';
import { BUCKETS } from '../src/spritequeue.js';
import { B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const evidencePath = new URL('../tools/w171-stage2-type8d-evidence.json', import.meta.url);
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
  ram.setU8(A5 + 0x0c, 0x8d);
  ram.setU32(A6 + 0x02, 0x40002000);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  ram.setU16(0x8130b6, 4);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x6000);
  ram.setU16(0x8103ea, 0x5000);
  runInitBodyAddr(0x276946, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function context(ram) {
  const sounds = [], bullets = [], kills = [];
  return { sounds, bullets, kills, ctx: {
    ram, rom: ROM, tables: MT, unported: new UnportedLog(),
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

test('W171/1 ROM pins exact body, tables, 43-stream dependency closure, and next stop',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x276946));
  assert.ok(HANDLER_ADDRESSES.includes(0x276a02));
  assert.deepEqual(TYPE8D_ART, {
    headingTable: 0x276d50, headings: 32, death: 0x193b4c,
    animationTable: 0x276dd0, animations: 6,
  });
  assert.deepEqual(Array.from({ length: 32 }, (_, i) => ROM.u32(0x276d50 + i * 4)),
    Array.from({ length: 32 }, (_, i) => 0x192acc + i * 0x84));
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => ROM.u32(0x276dd0 + i * 4)),
    [0x193d74, 0x193d20, 0x193ccc, 0x193c78, 0x193c24, 0x193bd0]);
  assert.equal(0x277270 - 0x276e68, 516 * 2,
    'the full structural bob table is 516 words');
  assert.equal(ROM.u16(0x277270), 0x3b7c, 'the type $89 stub pins its far end');
  assert.equal(ROM.u16(0x277514), 0x3b7c, 'the next chronological type $8F stub is exported');
  assert.equal(32 + 1 + 6 + 4, 43, 'type-specific art plus four shared overlays');
});

test('W171/2 init copies exact prototypes, aims, draws both RNG bytes, and uses stageX2',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.equal(ram.u16(A6), 0xa200);
  assert.equal(ram.u16(A5 + 0x24), ram.u8(A5 + 0x25),
    'the aimed byte replaces the prototype heading low byte');
  assert.equal(ram.u8(A6 + 0x1d), 0x14, 'stage 2 uses palette pair at byte offset 2');
  assert.equal(ram.u8(A5 + 0x18), 0x14);
  assert.equal(ram.u8(A5 + 0x19), 0x0b);
  assert.ok(ROM.u32(0x276d50) <= ram.u32(A6 + 0x0a));
  assert.ok(ram.u32(A6 + 0x0a) <= ROM.u32(0x276dcc));
  assert.equal(ram.u8(0x803917), 2, 'both RNG-family calls advance the shared byte');
});

test('W171/3 descending animation, 256-value live bob index, and emit order are exact',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU8(A5 + 0x26, 0);
  ram.setU16(A5 + 0x28, 0x14);
  ram.setU8(A5 + 0x2b, 0xff);
  runHandler(0x276a02, ram, ROM, A5, c.ctx);
  assert.equal(ram.u32(A5 + 0x20), ROM.u32(0x276dd0 + 0x14));
  assert.equal(ram.u16(A5 + 0x28), 0x10);
  assert.equal(ram.u8(A5 + 0x2b), 2, 'addq.b wraps without carrying into +$2A');
  assert.equal(ram.u8(A5 + 0x2a), 0,
    'only the 256-word reachable prefix is indexed by the byte phase');
  assert.deepEqual(sprites(ram, 7).slice(0, 2),
    [ram.u32(A6 + 0x0a), ram.u32(A5 + 0x20)]);
});

test('W171/4 fire selects $281420 for salvo byte 2 and advances the ROM cadence',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU8(A5 + 0x16, 1);
  ram.setU8(A5 + 0x1a, 0);
  ram.setU8(A5 + 0x1c, 2);
  ram.setU8(A5 + 0x1d, 2);
  ram.setU16(A6 + 0x02, 0x5000);
  ram.setU16(0x8103e8, 0xe000);
  ram.setU16(0x8103ea, 0xe000);
  runHandler(0x276a02, ram, ROM, A5, c.ctx);
  assert.equal(c.bullets[0]?.[0], 0x276c68);
  assert.equal(ram.u8(A5 + 0x1c), 1);
});

test('W171/5 death is two-stage: score $11 and fixed art, then sound/score $08/free',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x276a02, ram, ROM, A5, c.ctx);
  assert.notEqual(ram.u16(A5), 0, 'first negative HP does not free');
  assert.equal(ram.u32(A6 + 0x0a), TYPE8D_ART.death);
  assert.equal(ram.u16(A6 + 0x18), 0x0140);
  assert.deepEqual(c.kills, [[0x11, 0x10]]);
  assert.equal(ram.u16(0x81b732) & 0xff, 0x0b);
  assert.equal(ram.u16(0x81b732 + B.hook), 2);

  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x276a02, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0);
  assert.deepEqual(c.sounds, [0x28c25a]);
  assert.deepEqual(c.kills, [[0x11, 0x10], [0x08, 0x10]]);
  const second = 0x81b732 + 0x38;
  assert.equal(ram.u16(second) & 0xff, 0x0c);
  assert.equal(ram.u32(second + B.nudge), 0xfc000000);
  assert.equal(ram.u16(second + B.hook), 1);
});

test('W171/6 controlled evidence is record-qualified and pins lifecycle interventions',
  { skip: !existsSync(evidencePath) ? 'controlled MAME evidence pending' : false }, () => {
  const e = JSON.parse(readFileSync(evidencePath, 'utf8'));
  assert.equal(e.static_occurrence_count, 37);
  assert.ok(e.observed_occurrences.length >= 1);
  assert.deepEqual(e.observed_occurrences[0],
    { record: 0x232700, trigger: 0x001e, type: 0x8d });
  assert.match(e.isolation_intervention.invalid_for, /Pacing/);
  assert.equal(e.death_intervention.stages, 2);
});
