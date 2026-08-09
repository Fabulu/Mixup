// W173: stage-2 type $84 and its inseparable cue-pool path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE84_ART } from '../src/handlers.js';
import { CUE, runCueDriver28AD70 } from '../src/cues.js';

const evidencePath = new URL('../tools/w173-stage2-type84-evidence.json', import.meta.url);
import { BUCKETS } from '../src/spritequeue.js';
import { B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tablesJson = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tablesJson.rom) : null;
const MT = HAVE ? new MoveTables(tablesJson, ROM) : null;
const SKIP = HAVE ? false : 'ROM export absent; this is a skip, not a pass';
const A5 = 0x81332c, A6 = 0x81459c;

function fixture() {
  const ram = new Ram();
  ram.setU16(A5, 0x8000);
  ram.setU16(A5 + 0x04, 1);
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x12, 0);
  ram.setU8(A5 + 0x0c, 0x84);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x5000);
  ram.setU16(0x8103ea, 0x5000);
  runInitBodyAddr(0x275154, ram, ROM, A5, new UnportedLog(), MT);
  ram.setU32(A6 + 0x02, 0x40002000);
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

test('W173/1 ROM pins type $84, both occurrences, tables, and type $90 frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x275154));
  assert.ok(HANDLER_ADDRESSES.includes(0x2752b0));
  assert.deepEqual(TYPE84_ART, {
    body: 0x17d994, fixedA: 0x17db98, fixedB: 0x17ddcc, fixedC: 0x17de10,
    animationTable: 0x2757ca, animationFrames: 4,
    cue0Table: 0x28b032, cue0Frames: 4,
    cue4Table: 0x28b050, cue4Frames: 4,
    cue8Table: 0x28b06e, cue8Frames: 8,
  });
  assert.deepEqual(Array.from({ length: 4 }, (_, i) => ROM.u32(0x2757ca + i * 4)),
    [0x17de54, 0x17ded8, 0x17df5c, 0x17dfe0]);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => ROM.u32(0x28af6c + i * 4)),
    [0x23d79e, 0x23d762, 0x23d79e, 0x23d7da, 0x23d816, 0x23d852]);
  const rows = [];
  for (let i = 0; i < 332; i++) {
    const rec = 0x2325d0 + i * 8;
    if (ROM.u8(rec + 4) === 0x84) rows.push([rec, ROM.u16(rec), ROM.u16(rec + 6) & 0xfff]);
  }
  assert.deepEqual(rows, [[0x232820, 0x0054, 5], [0x232880, 0x006c, 0x09f]]);
  assert.equal(ROM.u8(0x2328d4), 0x90);
});

test('W173/2 init copies two long prototypes and preserves exact cue cursor/palette',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.equal(ram.u16(A6), 0xa000);
  assert.equal(ram.u16(A6 + 0x20), 0x8000);
  assert.equal(ram.u32(A5 + 0x44), 0x275276);
  assert.equal(ram.u32(A6 + 0x0a), TYPE84_ART.body);
  assert.equal(ram.u8(A6 + 0x1d), 0x10);
  assert.equal(ram.u8(A5 + 0x1c), 0x10);
  assert.equal(ram.u8(A5 + 0x1d), 0x0f);
});

test('W173/3 direct body draw preserves the five-call bucket-0 order', { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  runHandler(0x2752b0, ram, ROM, A5, c.ctx);
  assert.deepEqual(sprites(ram, 0), [
    ram.u32(A6 + 0x2a), TYPE84_ART.body, TYPE84_ART.fixedA,
    TYPE84_ART.fixedC, TYPE84_ART.fixedB,
  ]);
});

test('W173/3a no-carry arms lifetime, later carry frees, and freeze preserves offset',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  runHandler(0x2752b0, ram, ROM, A5, c.ctx);
  assert.equal(ram.u8(A5 + 0x16), 1,
    '$2752F2 bcc takes the no-carry arm and marks the enemy as entered');
  ram.setU32(A6 + 0x02, 0x90002000);
  runHandler(0x2752b0, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0, 'a later carry frees an already-entered enemy');

  const frozen = fixture();
  frozen.setU32(0x8130d2, 1);
  frozen.setU16(A6 + 0x06, 0x1234);
  runHandler(0x2752b0, frozen, ROM, A5, context(frozen).ctx);
  assert.equal(frozen.u16(A6 + 0x06), 0x1234,
    '$275356 branches before the $F000 offset write while frozen');
});

test('W173/4 cue advances through 0/4/8, holds terminal, then frees with parent',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU16(A6 + 0x18, 0x1f72);
  runHandler(0x2752b0, ram, ROM, A5, c.ctx);
  assert.equal(ram.u32(A5 + 0x44), 0x275284);
  assert.equal(ram.u16(CUE.count), 1);
  ram.setU16(0x80390c, 1);
  let f = runCueDriver28AD70(ram, ROM);
  assert.equal(f.emitted, 1);
  assert.equal(ram.u32(CUE.base + 0x0a), ROM.u32(CUE.art0 + 0x0c));
  assert.deepEqual(sprites(ram, 7).slice(-1), [ROM.u32(CUE.art0 + 0x0c)]);
  ram.setU16(CUE.base + 0x22, 1);
  f = runCueDriver28AD70(ram, ROM);
  assert.equal(f.advanced, 1);
  assert.equal(ram.u16(CUE.base) & 0x7c, 4);
  assert.equal(ram.u32(CUE.base + 0x0a), ROM.u32(CUE.art4));
  ram.setU16(CUE.base + 0x22, 1);
  f = runCueDriver28AD70(ram, ROM);
  assert.equal(f.advanced, 1);
  assert.equal(ram.u16(CUE.base) & 0x7c, 8);
  assert.equal(ram.u32(CUE.base + 0x0a), ROM.u32(CUE.art8 + 0x14));
  f = runCueDriver28AD70(ram, ROM);
  assert.equal(f.freed, 0, 'the final descriptor stays live with low-byte bit 7 set');
  ram.setU16(A6, 0);
  f = runCueDriver28AD70(ram, ROM);
  assert.equal(f.freed, 1);
  assert.equal(ram.u16(CUE.count), 0);
});

test('W173/4b emitter-index mutation resolves the cartridge table instead of hardcoding',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU16(A6 + 0x18, 0x1f72);
  runHandler(0x2752b0, ram, ROM, A5, c.ctx);
  ram.setU16(0x80390c, 1);
  ram.setU16(CUE.base + 0x18, 4);
  runCueDriver28AD70(ram, ROM);
  assert.deepEqual(sprites(ram, 0).slice(-1), [ROM.u32(CUE.art0 + 0x0c)]);
  assert.deepEqual(sprites(ram, 7), [],
    'hardcoding type $84\'s natural offset $14 makes this mutation red');
});

test('W173/5 phase-2 fire runs both generators and advances muzzle cadence',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU16(A5 + 0x18, 2);
  ram.setU8(A5 + 0x1e, 0);
  ram.setU16(A6 + 0x02, 0x5000);
  runHandler(0x2752b0, ram, ROM, A5, c.ctx);
  assert.deepEqual(c.bullets.map((x) => x[0]), [0x2754c0, 0x2754d6]);
  assert.equal(ram.u16(A5 + 0x2c), 2);
});

test('W173/6 death scores 162, posts sound, makes five effects, and frees',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x2752b0, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0);
  assert.deepEqual(c.kills, [[0x162, 0x10]]);
  assert.deepEqual(c.sounds, [0x28c2dc]);
  assert.equal(c.unported.report().filter((x) => x.includes('$289B22')).length, 2);
  assert.equal(c.unported.report().filter((x) => x.includes('$27F8FA')).length, 1);
  const kinds = Array.from({ length: 5 }, (_, i) =>
    ram.u16(0x81b732 + i * 0x38) & 0xff);
  assert.deepEqual(kinds, [0x85, 0x0d, 0x0d, 0x0c, 0x85]);
  assert.equal(ram.u16(0x81b732 + B.bucket), 0x10);
});

test('W173/7 bounded board attempt stays explicitly negative', () => {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.static_occurrence_count, 2);
  assert.deepEqual(evidence.static_occurrences.map((x) => [x.record, x.trigger, x.type]), [
    [0x232820, 0x0054, 0x84], [0x232880, 0x006c, 0x84],
  ]);
  assert.deepEqual(evidence.observed_occurrences, []);
  assert.equal(evidence.controlled_attempt.outcome, 'NO_STAGE2_TYPE84');
  assert.equal(evidence.emitter.observed, false);
});
