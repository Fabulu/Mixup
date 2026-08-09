// W174: stage-2 type $90, exact init/handler/data/art closure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runInitBodyAddr, INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { runHandler, HANDLER_ADDRESSES, TYPE90_ART } from '../src/handlers.js';
import { BUCKETS } from '../src/spritequeue.js';
import { B } from '../src/effects.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const evidencePath = new URL('../tools/w174-stage2-type90-evidence.json', import.meta.url);
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
  ram.setU8(A5 + 0x0c, 0x90);
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x5000);
  ram.setU16(0x8103ea, 0x5000);
  runInitBodyAddr(0x27980a, ram, ROM, A5, new UnportedLog(), MT);
  ram.setU32(A6 + 0x02, 0x20004000);
  return ram;
}

function context(ram) {
  const sounds = [], kills = [];
  const unported = new UnportedLog();
  return { sounds, kills, unported, ctx: {
    ram, rom: ROM, tables: MT, unported,
    soundPost: (a) => sounds.push(a),
    killEvent: (score, hit) => kills.push([score, hit]),
  } };
}

function sprites(ram, bucket) {
  const b = BUCKETS[bucket], out = [];
  for (let off = 0; off < ram.u16(b.counter); off += 12)
    out.push(ram.u32(b.buffer + off + 4));
  return out;
}

test('W174/1 ROM pins the one occurrence, exact movement, closure, and type $96 frontier',
  { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27980a));
  assert.ok(HANDLER_ADDRESSES.includes(0x279898));
  assert.deepEqual(TYPE90_ART, { main: 0x2351ac });
  assert.equal(ROM.u32(0x279872), TYPE90_ART.main,
    'the one long-form prototype directly owns the one sprite stream');
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => [
    ROM.u8(0x279856 + i * 2), ROM.u8(0x279857 + i * 2),
  ]), [[0x10, 0x0f], [0x11, 0x0e], [0x10, 0x0f], [0x10, 0x0f], [0x10, 0x0f]]);
  assert.deepEqual(Array.from({ length: 4 }, (_, i) => ROM.u16(0x279a92 + i * 2)),
    [0x0480, 0x0600, 0x0740, 0x08c0]);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => ROM.u8(0x233670 + i)),
    [0x7c, 0x00, 0x3d, 0x00, 0x40, 0x00],
    'idx $037 is not type $8F\'s unrelated $2340CC stream');
  const rows = [];
  for (let i = 0; i < 332; i++) {
    const rec = 0x2325d0 + i * 8;
    if (ROM.u8(rec + 4) === 0x90) rows.push([rec, ROM.u16(rec), ROM.u16(rec + 6) & 0xfff]);
  }
  assert.deepEqual(rows, [[0x2328d0, 0x0085, 0x037]]);
  assert.deepEqual([ROM.u16(0x2329c0), ROM.u8(0x2329c4), ROM.u16(0x2329c6) & 0xfff],
    [0x00b8, 0x96, 0x03c]);
});

test('W174/2 init copies exact prototypes and uses adjacent big-endian palette bytes',
  { skip: SKIP }, () => {
  const ram = fixture();
  assert.equal(ram.u16(A6), 0xa000);
  assert.equal(ram.u32(A6 + 0x0a), TYPE90_ART.main);
  assert.equal(ram.u16(A6 + 0x18), 0x7fff);
  assert.equal(ram.u8(A6 + 0x1d), 0x11);
  assert.equal(ram.u8(A5 + 0x1a), 0x11);
  assert.equal(ram.u8(A5 + 0x1b), 0x0e);
  assert.equal(ram.u16(A5 + 0x1c), 1);
  assert.equal(ram.u16(A5 + 0x1e), 1);

  const ranked = fixture();
  ranked.setU16(0x813098, 1);
  runInitBodyAddr(0x27980a, ranked, ROM, A5, new UnportedLog(), MT);
  assert.equal(ranked.u16(A5 + 0x1e), 0,
    '$27984E clears the whole particle-count word when rank is nonzero');
});

test('W174/3 direct draw is exactly one bucket-0 call and lifetime carry polarity is pinned',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.deepEqual(sprites(ram, 0), [TYPE90_ART.main]);
  assert.deepEqual(sprites(ram, 7), []);
  assert.equal(ram.u8(A5 + 0x16), 1, 'no carry marks the enemy as entered');
  ram.setU32(A6 + 0x02, 0x90002000);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0, 'later carry frees an already-entered enemy');
});

test('W174/4 HP gate revives above $3C00, then installs the second threshold below it',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU32(A6 + 0x02, 0x40003c00);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A6 + 0x18), 0x7fff);
  assert.equal(ram.u16(A5 + 0x18), 0x7eff);
  assert.equal(ram.u16(A5 + 0x1e), 2);
  assert.equal(ram.u16(A5 + 0x20), 1);
  ram.setU32(A6 + 0x02, 0x20004000);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5 + 0x1c), 0);
  assert.equal(ram.u16(A6 + 0x18), 0x0400);
  assert.equal(ram.u16(A5 + 0x18), 0x0300);
});

test('W174/5 threshold particles consume ROM RNG indices and subtract threshold once',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU16(A5 + 0x18, 0x0600);
  ram.setU16(A5 + 0x1e, 1);                           // DBRA => two calls
  ram.setU16(A6 + 0x18, 0x0500);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(0x803916, 0);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  const notes = c.unported.report().filter((x) => x.includes('$27F8FA'));
  assert.equal(notes.length, 2);
  const expected = [1, 2].map((state) => {
    const index = ROM.u8(0x24324e + state);
    return `$${(0x08c00000 | ROM.u16(0x279a92 + index * 2)).toString(16).toUpperCase()}`;
  });
  assert.deepEqual(notes.map((x) => expected.find((v) => x.includes(v))).sort(),
    expected.sort(), 'hardcoding one particle vector instead of indexing the ROM table makes this red');
  assert.equal(ram.u8(0x803917), 2, 'each DBRA iteration consumes one shared RNG draw');
  assert.equal(ram.u16(A5 + 0x18), 0x0500, 'threshold subtract happens once after the loop');
});

test('W174/6 death scores $32, posts sound, emits 0D/0D/85, then lingers',
  { skip: SKIP }, () => {
  const ram = fixture();
  const c = context(ram);
  ram.setU16(A5 + 0x1c, 0);
  ram.setU8(A6, ram.u8(A6) | 0x10);
  ram.setU16(A6 + 0x18, 0x8001);
  runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.notEqual(ram.u16(A5), 0, 'death draws once and enters its countdown tail');
  assert.deepEqual(c.sounds, [0x28c2dc]);
  assert.deepEqual(c.kills, [[0x32, 0x10]]);
  assert.deepEqual(Array.from({ length: 3 }, (_, i) =>
    ram.u16(0x81b732 + i * 0x38) & 0xff), [0x0d, 0x0d, 0x85]);
  assert.equal(ram.u32(0x81b732 + B.nudge), 0xfa000600);
  assert.equal(ram.u16(0x81b732 + B.delay), 4);
  assert.equal(ram.u32(0x81b732 + 0x38 + B.nudge), 0xfa00fa00);
  assert.equal(ram.u16(0x81b732 + 0x38 + B.delay), 2);
  assert.equal(ram.u32(0x81b732 + 0x70 + B.nudge), 0xfe000000);
  assert.equal(ram.u16(A6), 0x8080);
  for (let n = 0; n < 5; n++) runHandler(0x279898, ram, ROM, A5, c.ctx);
  assert.equal(ram.u16(A5), 0, 'prototype linger byte 4 frees on the fifth tail pass');
});

test('W174/7 controlled evidence remains explicit about its bounded result',
  { skip: !existsSync(evidencePath) ? 'controlled MAME evidence pending' : false }, () => {
  const e = JSON.parse(readFileSync(evidencePath, 'utf8'));
  assert.equal(e.static_occurrence_count, 1);
  assert.deepEqual(e.static_occurrences,
    [{ record: 0x2328d0, trigger: 0x0085, type: 0x90 }]);
  assert.ok(['OBSERVED_STAGE2_TYPE90', 'NO_STAGE2_TYPE90'].includes(e.controlled_attempt.outcome));
  assert.equal(e.emitter.rom_call, 0x23d762);
  assert.equal(e.emitter.bucket, 0);
});
