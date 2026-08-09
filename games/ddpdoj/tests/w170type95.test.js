// W170: stage-2 type $95, exact init/handler/data/art closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE95_ART } from '../src/handlers.js';
import { BUCKETS } from '../src/spritequeue.js';
import { B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const evidencePath = new URL('../tools/w170-stage2-type95-evidence.json', import.meta.url);
const HAVE = existsSync(tablesPath) && existsSync(evidencePath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function initFixture(stage = 1, clock = 0x0c) {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 1);             // exact $27782E stub result
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0);             // script-less focused fixture
  ram.setU8(A5 + 0x0c, 0x95);
  ram.setU16(0x813092, stage);           // zero-based: human stage 2 == 1
  ram.setU16(0x813094, stage * 2);       // stage index times two, not loop
  ram.setU16(0x8130ce, clock);
  ram.setU16(0x8130ba, 0);
  runInitBodyAddr(0x277836, ram, ROM, A5, new UnportedLog(), MT);
  return ram;
}

function ctxOf(ram) {
  const sounds = [], bullets = [];
  return {
    sounds, bullets,
    ctx: { ram, rom: ROM, tables: MT, unported: new UnportedLog(),
      soundPost: (a) => sounds.push(a),
      bulletSpawn: (site, result) => bullets.push([site, result]) },
  };
}

function requests(ram, bucket) {
  const b = BUCKETS[bucket];
  const out = [];
  for (let off = 0; off < ram.u16(b.counter); off += 12) {
    const a = b.buffer + off;
    out.push({ spr: ram.u32(a + 4), size: ram.u16(a + 8), pal: ram.u16(a + 10) });
  }
  return out;
}

test('W170/1 ROM pins the exact init/handler/data ends and ten-stream art family',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x277836));
  assert.ok(HANDLER_ADDRESSES.includes(0x2779b6));
  assert.deepEqual(TYPE95_ART,
    { main: 0x1744f8, table: 0x277dc0, frames: 8, fixed: 0x174e7c });
  assert.equal(ROM.u32(0x277984), TYPE95_ART.main,
    'the first sub prototype carries the body stream');
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => ROM.u32(TYPE95_ART.table + i * 4)),
    Array.from({ length: 8 }, (_, i) => 0x17479c + i * 0xdc));
  assert.equal(ROM.u16(0x277d02), 0x243c);
  assert.equal(ROM.u32(0x277d04), TYPE95_ART.fixed);
  assert.deepEqual(Array.from({ length: 4 }, (_, i) => ROM.u16(0x277db8 + i * 2)),
    [0x0600, 0x0400, 0x0200, 0x0000]);
  assert.equal(ROM.u16(0x277dde), 0x4da0, 'the eighth pointer reaches the window end');
});

test('W170/1b controlled MAME evidence pins occurrences, animation order, fire, and death',
  { skip: SKIP }, () => {
  const e = JSON.parse(readFileSync(evidencePath, 'utf8'));
  let cursor = 0x2325d0, staticCount = 0;
  while (ROM.u16(cursor) !== 0xffff) {
    if (ROM.u8(cursor + 4) === 0x95) staticCount++;
    cursor += 8;
  }
  assert.equal(staticCount, 31);
  assert.equal(e.static_occurrence_count, staticCount);
  assert.deepEqual(e.observed_occurrences.map((x) => [x.record, x.trigger, x.type]), [
    [0x232660, 0x000c, 0x95], [0x2326e8, 0x001c, 0x95],
    [0x232768, 0x002c, 0x95], [0x232780, 0x0032, 0x95],
  ]);
  assert.deepEqual(e.first_lifecycle.animation_first_frames.slice(1, 9)
    .map((x) => [x.cursor, x.stream]),
  Array.from({ length: 8 }, (_, i) => [i * 4, ROM.u32(TYPE95_ART.table + i * 4)]));
  assert.deepEqual(e.first_lifecycle.enemy_bullet_count_rises.map((x) => x.to - x.from),
    [4, 4, 4, 4, 4]);
  assert.equal(e.death_intervention.freed_logic_frame,
    e.death_intervention.logic_frame + 1);
  assert.match(e.isolation_intervention.invalid_for, /Pacing/);
});

test('W170/2 init copies both prototypes and applies stage/palette/reload semantics',
  { skip: SKIP }, () => {
  const ram = initFixture();
  assert.equal(ram.u32(A6 + 0x0a), TYPE95_ART.main);
  assert.equal(ram.u32(A5 + 0x24), ROM.u32(0x277972));
  assert.equal(ram.u16(A6 + 0x18), 0x0900, 'stage 2 keeps prototype HP');
  assert.equal(ram.u8(A5 + 0x2f), 5, 'human stages 1/2 use the long attack reload');
  assert.equal(ram.u8(A6 + 0x1d), ROM.u8(0x27795c));
  assert.equal(ram.u8(A5 + 0x1a), ROM.u8(0x27795c));
  assert.equal(ram.u8(A5 + 0x1b), ROM.u8(0x27795d));
  assert.notEqual(ram.u16(A6 + 0x20), 0,
    'run length 1 copies the second sub record at +$20 too');
  const lateStage2 = initFixture(1, 0x80);
  assert.equal(lateStage2.u16(A6 + 0x18), 0x0680,
    'stage 2 clock >= $80 applies its explicit HP override');
  const stage3 = initFixture(2, 0x0c);
  assert.equal(stage3.u8(A5 + 0x2f), 2,
    'human stage 3 and later use the short attack reload');
});

test('W170/3 emit order is body then indexed frame in bucket 7, fixed in bucket 3',
  { skip: SKIP }, () => {
  const ram = initFixture();
  ram.setU32(A6 + 0x02, 0x40002000);
  ram.setU8(A5 + 0x16, 1);
  ram.setU16(0x80390c, 1);
  runHandler(0x2779b6, ram, ROM, A5, ctxOf(ram).ctx);
  assert.deepEqual(requests(ram, 7).map((x) => x.spr),
    [TYPE95_ART.main, 0x17479c], 'the two bucket-7 streams keep call order');
  assert.deepEqual(requests(ram, 3).map((x) => x.spr), [TYPE95_ART.fixed]);
});

test('W170/4 state 1 walks the complete pointer table by raw four-byte offsets',
  { skip: SKIP }, () => {
  const ram = initFixture();
  ram.setU32(A6 + 0x02, 0x40002000);
  ram.setU8(A5 + 0x16, 1);
  ram.setU16(A5 + 0x18, 1);
  ram.setU8(A5 + 0x22, 0);
  ram.setU8(A5 + 0x23, 0);
  ram.setU16(A5 + 0x20, 0);
  runHandler(0x2779b6, ram, ROM, A5, ctxOf(ram).ctx);
  assert.equal(ram.u16(A5 + 0x20), 4);
  assert.equal(ram.u32(A5 + 0x24), ROM.u32(TYPE95_ART.table + 4));
});

test('W170/5 side-gun cadence emits the ROM-ordered pair and restores toggle reloads',
  { skip: SKIP }, () => {
  const ram = initFixture();
  ram.setU32(A6 + 0x02, 0x40002000);
  ram.setU8(A5 + 0x16, 1);
  ram.setU16(0x813098, 1);               // opens $277A58's rank arm
  ram.setU8(A5 + 0x2a, 0);
  ram.setU8(A5 + 0x2e, 7);
  ram.setU8(A5 + 0x2c, 0);
  ram.setU8(A5 + 0x2d, 9);
  const c = ctxOf(ram);
  runHandler(0x2779b6, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.bullets.slice(0, 2).map(([site]) => site), [0x277aa0, 0x277aac]);
  assert.equal(ram.u8(A5 + 0x2c), 9);
  assert.equal(ram.u8(A6 + 1) & 0x40, 0x40);
});

test('W170/6 a negative hit runs score, sound, both exact effect arms, then frees',
  { skip: SKIP }, () => {
  const ram = initFixture();
  ram.setU32(A6 + 0x02, 0x12345678);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  ram.setU16(A6 + 0x38, 0x8001);
  const c = ctxOf(ram);
  runHandler(0x2779b6, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0, 'freed after the complete death sequence');
  assert.deepEqual(c.sounds, [0x28c2dc]);
  const e0 = 0x81b732, e1 = e0 + 0x38;
  assert.deepEqual([ram.u16(e0) & 0xff, ram.u16(e1) & 0xff], [0x0d, 0x84]);
  assert.equal(ram.u32(e0 + B.pos), 0x12345678);
  assert.equal(ram.u32(e1 + B.pos), 0x12345678);
  assert.equal(ram.u16(e0 + B.sub12), 1);
  assert.equal(ram.u16(e1 + B.sub14), 0x0400);
});
