// W572: main-table Hibachi A1 gun 2 and the next exact loop-2 frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { AIM, AimTables, aim256 } from '../src/aim.js';
import { RNG, RNG_242B3C } from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';
import {
  SCHED, a1Start259A18, installScripts, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import {
  HIBACHI_A1, HIBACHI_A1_COUNTED, HIBACHI_A1_SCRIPTS,
  gun2Init2A7AB2, gun2Step2A7B20,
} from '../src/hibachiguns.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, overlappingPairs,
  tableBeforeW571, tableBeforeW572, tableBeforeW573, tableBeforeW576,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const EXPORTER = here('../tools/export-tables.py');
const ASSETS = here('../assets');
const PERIODIC = here('../probes/checkpoints/ship0-style4-lf00146131.json');
const required = [TABLES, IMAGE, EXPORTER];
const SKIP = required.every(existsSync) ? false
  : 'exact W572 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [PERIODIC,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W572 assets or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W572_TABLE = SKIP ? null : tableBeforeW573(TABLE_JSON);
const W571_TABLE = SKIP ? null : tableBeforeW572(TABLE_JSON);
const W570_TABLE = SKIP ? null : tableBeforeW571(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const AIM_TABLES = SKIP ? null : new AimTables(ROM);
const LIVE_TABLE_HASH = 'a262d979e0a369afba14cec7858efdf6932ca4ce7b3f6aab13d433c87f0860cc';
const ASSET_TABLE_HASH = 'bdf8d655d3ba484166eadbe73ba29ad59bed36507695dd6a79db8a09b4b4def0';
const TABLE_HASH = '0f5e8c092c2d16abe958ba0edaa5ea681fd5b296a0b110e10f91d2c6aa1a6ba9';
const W571_HASH = '5c998537267ec18c9392305350a1dd7b3e4f60bfe5825bb238156864cfacca75';
const W570_HASH = '0ec146c509a74bf3d75e585fdf2cd268fab86948924fd6c331a45ccce5ec12cc';
const STORED_TABLE_HASH = 'f5bb751cefe855badec1a91c26182b756746857b878a7070a18c1e8d5b254d65';
const TEMPLATE = Object.freeze([
  0x2080, 0x0b0b, 0x1111, 0x0208, 0x0003, 0x0013,
  0xfff8, 0x0016, 0xff00, 0x0000, 0x0000, 0x0000,
]);
const A5 = 0x810c00;
const A6 = 0x814800;
const PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const STANDARD_SITES = Object.freeze([
  0x2a7c1e, 0x2a7c32, 0x2a7c60, 0x2a7c74,
  0x2a7ca2, 0x2a7cb6, 0x2a7ce4, 0x2a7cf8,
  0x2a7d26, 0x2a7d3a, 0x2a7d68, 0x2a7d7c,
]);
const ANGLE_BASES = Object.freeze([
  0x70, 0xc0, 0x7c, 0xb8, 0x98, 0xb0,
  0x90, 0x40, 0x84, 0x48, 0x68, 0x50,
]);
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const i8 = (v) => (((v & 0xff) ^ 0x80) - 0x80);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

function gunBench() {
  const ram = new Ram();
  const shots = [];
  ram.setU32(A5 + 0x06, A6);
  return {
    ram, shots,
    ctx: { bulletSpawn: (site, result) => shots.push([site, result]) },
  };
}

function records(b) {
  return b.shots.flatMap(([site, results]) => results.map((result) => {
    const at = result.addr;
    return {
      site,
      kind: b.ram.u16(at + BREC.typeWord) & 0x3f,
      speed: b.ram.u8(at + BREC.speed),
      dir: b.ram.u8(at + BREC.dir),
      posA: b.ram.u16(at + BREC.posA),
      posB: b.ram.u16(at + BREC.posB),
      d3: b.ram.u32(at + BREC.param28),
      d4: b.ram.u32(at + BREC.param2c),
    };
  }));
}

function seedPlayers(b, preferred, p1Status = 0x8000, p2Status = 0x8000,
  p1Y = 0x4500, p2Y = 0x4400) {
  b.ram.setU8(A5 + 0x03, preferred);
  b.ram.setU16(AIM.selP1, p1Status);
  b.ram.setU16(AIM.selP1 + 0x02, p1Y);
  b.ram.setU16(AIM.selP1 + 0x04, 0x2100);
  b.ram.setU16(AIM.selP2, p2Status);
  b.ram.setU16(AIM.selP2 + 0x02, p2Y);
  b.ram.setU16(AIM.selP2 + 0x04, 0x4300);
}

function seedEvent(b, magazine, targetY = 0x4500) {
  b.ram.setU16(A6 + 0x02, 0x5000);
  b.ram.setU16(A6 + 0x04, 0x3000);
  seedPlayers(b, 0, 0x8000, 0, targetY);
  b.ram.setU8(SCHED.a1Base + 0x02, 0);
  b.ram.setU8(SCHED.a1Base + 0x03, 0x80);
  b.ram.setU8(SCHED.a1Base + 0x04, magazine);
  b.ram.setU8(SCHED.a1Base + 0x05, 0x0b);
  b.ram.setU8(SCHED.a1Base + 0x06, 3);
  b.ram.setU8(SCHED.a1Base + 0x08, 2);
  b.ram.setU8(SCHED.a1Base + 0x09, 8);
  b.ram.setU32(SCHED.a1Base + 0x0a, 0x00030013);
  b.ram.setU32(SCHED.a1Base + 0x0e, 0xfff80016);
  b.ram.setU8(SCHED.a1Base + 0x12, 1);
  for (let i = 0; i < 6; i++) {
    b.ram.setU8(SCHED.a1Base + 0x14 + i, 0xf8 + i);
    b.ram.setU16(A6 + PARTS[i] + 0x1a, i * 4);
  }
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W572 adds one strict template window and reconstructs W571 and W570',
  { skip: SKIP }, () => {
    assert.equal(ROM_WINDOW_COUNT, 1686);
    assert.equal(TABLE_JSON.rom.windows.length, 1686);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 651517);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.equal(W572_TABLE.rom.windows.length, 846);
    assert.equal(W572_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 452375);
    assert.equal(canonicalHash(W572_TABLE), TABLE_HASH,
      'removing only W573 preserves strict historical W572');
    assert.equal(W571_TABLE.rom.windows.length, 845);
    assert.equal(W571_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 452351);
    assert.equal(canonicalHash(W571_TABLE), W571_HASH,
      'removing only W572 reconstructs strict W571 byte for byte');
    assert.equal(W570_TABLE.rom.windows.length, 844);
    assert.equal(canonicalHash(W570_TABLE), W570_HASH,
      'the older reconstruction composes through tableBeforeW572');

    const added = TABLE_JSON.rom.windows.filter((w) => w.base === '$2A7A7A');
    assert.deepEqual(added, [{
      base: '$2A7A7A', len: 0x18,
      why: "W572: loop-nonzero HIBACHI A1 gun 2's twelve-word slot template, copied by $2A7AB2 moveq #$B plus dbra and ending before its unused self-pointer block",
      hex: '20800b0b1111020800030013fff80016ff00000000000000',
    }]);
    assert.equal(added[0].hex, IMG.subarray(0x2a7a7a, 0x2a7a92).toString('hex'));
    assert.deepEqual(Array.from({ length: 12 }, (_, i) => ROM.u16(0x2a7a7a + i * 2)),
      TEMPLATE);
    assert.equal(caught(() => ROM.u8(0x2a7a91)), null);
    assert.equal(caught(() => ROM.u8(0x2a7a92))?.romAddress, 0x2a7a92);
    assert.deepEqual(Array.from({ length: 8 }, (_, i) => IMG.readUInt32BE(0x2a7a92 + i * 4)),
      Array(8).fill(0x2a7ab2));
    assert.equal(overlappingPairs(TABLE_JSON.rom.windows.map((w) => [
      Number.parseInt(w.base.slice(1), 16), w.len,
    ])), 79);
    assert.equal(ROM_OVERLAP_PAIRS, 79);

    const exporter = readFileSync(EXPORTER, 'utf8');
    assert.equal([...exporter.matchAll(/\(0x2A7A7A, 0x0018,/g)].length, 1);
    assert.doesNotMatch(exporter, /\(0x2A7A92,/,
      'the eight unused self-pointers stay outside every W572 window');
  });

test('W572 pins boundaries, separate registration, dispatch, and accounting',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM.u32(HIBACHI_A1.main + 16), ROM.u32(HIBACHI_A1.main + 20),
    ], [HIBACHI_A1.gun2Init, HIBACHI_A1.gun2Step]);
    assert.deepEqual([HIBACHI_A1.gun2Init, HIBACHI_A1.gun2Step],
      [0x2a7ab2, 0x2a7b20]);
    assert.equal(ROM.u32(HIBACHI_A1.main + 24), 0x2a7e64, 'main gun 3 is next');
    assert.equal(IMG.readUInt16BE(0x2a7b1e), 0x4e75, 'gun 2 init has its own rts');
    assert.equal(IMG.readUInt16BE(0x2a7e2e), 0x4e75, 'gun 2 step ends separately');
    assert.equal(0x2a7e30, 0x2a7e64 - 0x34, 'gun 3 template precedes its init');
    const registered = new Set(scriptAddresses());
    assert.ok(registered.has(HIBACHI_A1.gun2Init));
    assert.ok(registered.has(HIBACHI_A1.gun2Step));
    assert.ok(HIBACHI_A1_SCRIPTS.includes(2));
    assert.equal(HIBACHI_A1_COUNTED[2], undefined);
    assert.equal(HIBACHI_A1_COUNTED[3], undefined,
      'W573 registers main gun 3 without changing gun 2');
    assert.equal(HIBACHI_A1_COUNTED[4].init, 0x2a805a);
    assert.equal(HIBACHI_A1_SCRIPTS.length, 13);

    const b = gunBench();
    installScripts(b.ram, ROM, { a1: HIBACHI_A1.main });
    assert.equal(a1Start259A18(b.ram, 2), SCHED.a1Base);
    runScheduler25962E(b.ram, ROM, { bossRec: A5, bossSubRec: A6, ...b.ctx });
    assert.equal(b.ram.u16(SCHED.a1Base), 0x8102);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0x20,
      'the init rts keeps the registered step out of the first dispatch');
    assert.equal(b.shots.length, 0);
  });

test('W572 init copies, flips, exposes the byte-word ramp mismatch, and draws six',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU8(A6 + 0x13c, 1);
    b.ram.setU16(A6 + 0x1d2, 0x0203);
    b.ram.setU16(A6 + 0x1d4, 3);
    gun2Init2A7AB2(b.ram, ROM, SCHED.a1Base, A6);

    const expected = [...TEMPLATE];
    expected[2] = u16(expected[2] + 0x0202);
    expected[6] = u16(expected[6] + 3);
    expected[8] = 0x0100;
    for (let i = 0; i < 6; i++) {
      const word = 9 + (i >>> 1);
      const random = ROM.u8(RNG_242B3C.table + i + 1);
      expected[word] = i % 2 === 0
        ? ((random << 8) | (expected[word] & 0xff))
        : ((expected[word] & 0xff00) | random);
    }
    assert.deepEqual(Array.from({ length: 12 }, (_, i) =>
      b.ram.u16(SCHED.a1Base + 2 + i * 2)), expected);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x06), 0x13,
      'init reads only the $02 byte at A6+$1D2');
    assert.deepEqual(Array.from({ length: 6 }, (_, i) =>
      b.ram.u8(SCHED.a1Base + 0x14 + i)),
    Array.from({ length: 6 }, (_, i) => ROM.u8(RNG_242B3C.table + i + 1)));
    assert.equal(b.ram.u8(RNG.counter), 6);
  });

test('W572 freeze reruns init and timer events use byte borrow', { skip: SKIP }, () => {
  const frozen = gunBench();
  gun2Init2A7AB2(frozen.ram, ROM, SCHED.a1Base, A6);
  frozen.ram.setU16(HIBACHI_A1.freeze, 1);
  frozen.ram.setU16(SCHED.a1Base + 0x02, 0xdead);
  const before = frozen.ram.u8(RNG.counter);
  gun2Step2A7B20(frozen.ram, ROM, frozen.ctx, SCHED.a1Base, A5, A6);
  assert.equal(frozen.ram.u16(SCHED.a1Base + 0x02), 0x2080);
  assert.equal(frozen.ram.u8(RNG.counter), u16(before + 6) & 0xff);
  assert.equal(frozen.shots.length, 0);

  const edge = gunBench();
  seedEvent(edge, 2);
  edge.ram.setU8(SCHED.a1Base + 0x02, 1);
  gun2Step2A7B20(edge.ram, ROM, edge.ctx, SCHED.a1Base, A5, A6);
  assert.equal(edge.ram.u8(SCHED.a1Base + 0x02), 0);
  assert.equal(edge.shots.length, 0, 'old timer 1 does not act');
  gun2Step2A7B20(edge.ram, ROM, edge.ctx, SCHED.a1Base, A5, A6);
  assert.equal(edge.ram.u8(SCHED.a1Base + 0x02), 2);
  assert.equal(edge.shots.length, 12, 'old timer zero borrows and acts');
});

test('W572 target preference, fallback, dead skip, and unsigned threshold are exact',
  { skip: SKIP }, () => {
    const choices = [
      { pref: 0, p1: 0x8000, p2: 0x8000, site: AIM.selP1, toggle: 1 },
      { pref: 1, p1: 0x8000, p2: 0x8000, site: AIM.selP2, toggle: 0 },
      { pref: 1, p1: 0x8000, p2: 0x0000, site: AIM.selP1, toggle: 0 },
      { pref: 0, p1: 0x0000, p2: 0x8000, site: AIM.selP2, toggle: 1 },
    ];
    for (const [index, row] of choices.entries()) {
      const b = gunBench();
      seedEvent(b, 3, 0x4500);
      seedPlayers(b, row.pref, row.p1, row.p2, 0x4500, 0x4400);
      const targetY = b.ram.u16(row.site + 2);
      const targetX = b.ram.u16(row.site + 4);
      const expected = aim256(AIM_TABLES, 0x40c0, 0x3000, targetY, targetX);
      b.ram.setU8(RNG.counter, 0x30 + index);
      gun2Step2A7B20(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
      assert.equal(b.shots[0][0], 0x2a7be6);
      assert.equal(records(b)[0].dir, expected);
      assert.equal(b.ram.u8(A5 + 3), row.toggle);
      assert.equal(b.ram.u8(RNG.counter), 0x30 + index,
        'the below-threshold one-shot arm consumes no RNG');
    }

    for (const [bossY, targetY, sites] of [
      [0x5000, 0x45ff, [0x2a7be6]],
      [0x5000, 0x4600, [0x2a7bce, 0x2a7bda, 0x2a7be6]],
      [0x2000, 0x1000, [0x2a7be6]],
      [0x2000, 0xffff, [0x2a7bce, 0x2a7bda, 0x2a7be6]],
    ]) {
      const b = gunBench();
      seedEvent(b, 3, targetY);
      b.ram.setU16(A6 + 2, bossY);
      gun2Step2A7B20(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
      assert.deepEqual(b.shots.slice(0, sites.length).map(([site]) => site), sites,
        'the BCS comparison is unsigned, includes equality, and wraps at 16 bits');
    }

    const dead = gunBench();
    seedEvent(dead, 3);
    seedPlayers(dead, 1, 0, 0);
    dead.ram.setU8(RNG.counter, 0x66);
    PARTS.forEach((part, i) => dead.ram.setU8(A6 + part + 0x1b, [0, 1, 0x3f, 0, 0x20, 0][i]));
    dead.ram.setU8(SCHED.a1Base + 0x12, 0xff);
    gun2Step2A7B20(dead.ram, ROM, dead.ctx, SCHED.a1Base, A5, A6);
    assert.equal(dead.shots.length, 0);
    assert.equal(dead.ram.u8(RNG.counter), 0x66);
    assert.equal(dead.ram.u8(A5 + 3), 1);
    assert.deepEqual(PARTS.map((part) => dead.ram.u8(A6 + part + 0x1b)),
      [0x3f, 2, 0x3e, 1, 0x1f, 1],
      'dead-target skip still rotates, applies signed step, and masks every byte');
    assert.equal(dead.ram.u8(SCHED.a1Base + 0x04), 2);
  });

test('W572 loop zero and nonzero emit exact 12, 13, 15, or 0 direct-core calls',
  { skip: SKIP }, () => {
    for (const loop of [0, 1]) {
      const even = gunBench();
      seedEvent(even, 2);
      even.ram.setU16(HIBACHI_A1.loopWord, loop);
      gun2Step2A7B20(even.ram, ROM, even.ctx, SCHED.a1Base, A5, A6);
      assert.deepEqual(even.shots.map(([site]) => site), STANDARD_SITES);
      assert.deepEqual(even.shots.map(([, result]) => result.length), Array(12).fill(1));
      assert.equal(records(even).length, 12);

      const one = gunBench();
      seedEvent(one, 3, 0x4500);
      one.ram.setU16(HIBACHI_A1.loopWord, loop);
      const before = one.ram.u8(RNG.counter);
      gun2Step2A7B20(one.ram, ROM, one.ctx, SCHED.a1Base, A5, A6);
      assert.deepEqual(one.shots.map(([site]) => site), [0x2a7be6, ...STANDARD_SITES]);
      assert.equal(records(one).length, 13);
      assert.equal(one.ram.u8(RNG.counter), before);

      const triple = gunBench();
      seedEvent(triple, 3, 0x6000);
      triple.ram.setU16(HIBACHI_A1.loopWord, loop);
      const draw = 0x21;
      triple.ram.setU8(RNG.counter, draw - 1);
      const center = u16(aim256(AIM_TABLES, 0x40c0, 0x3000, 0x6000, 0x2100)
        + (i8(ROM.u8(RNG_242B3C.table + draw)) >> 1)) & 0xff;
      gun2Step2A7B20(triple.ram, ROM, triple.ctx, SCHED.a1Base, A5, A6);
      assert.deepEqual(triple.shots.map(([site]) => site), [
        0x2a7bce, 0x2a7bda, 0x2a7be6, ...STANDARD_SITES,
      ]);
      const tripleRecords = records(triple);
      assert.equal(tripleRecords.length, 15);
      assert.deepEqual(tripleRecords.slice(0, 3).map((r) => r.dir),
        [center, center, center]);
      assert.deepEqual(tripleRecords.slice(0, 3).map((r) => r.kind), [0x16, 0x16, 0x16]);
      assert.deepEqual(tripleRecords.slice(0, 3).map((r) => [r.posA, r.posB, r.d3, r.d4]), [
        [0x40c0, 0x3000, 0xf0c00000, 0],
        [0x40c0, 0x3000, 0xf0c00000, 0],
        [0x40c0, 0x3000, 0xf0c00000, 0],
      ]);
      assert.deepEqual(tripleRecords.slice(0, 3).map((r) => r.speed),
        tripleRecords.slice(0, 3).map((r) => r.speed).map((speed, i, all) =>
          i === 0 ? speed : u16(all[0] + i * 4) & 0xff));
      assert.equal(triple.ram.u8(RNG.counter), draw,
        'the triple arm consumes exactly one draw');
      assert.equal(triple.ram.u8(A5 + 3), 1);

      const dead = gunBench();
      seedEvent(dead, 3);
      seedPlayers(dead, 0, 0, 0);
      dead.ram.setU16(HIBACHI_A1.loopWord, loop);
      gun2Step2A7B20(dead.ram, ROM, dead.ctx, SCHED.a1Base, A5, A6);
      assert.equal(dead.shots.length, 0);
    }
  });

test('W572 attached registers preserve packed carry, byte angles, D0, D2, and D4',
  { skip: SKIP }, () => {
    const b = gunBench();
    seedEvent(b, 2);
    let carryCase = null;
    for (let part = 0; part < 6 && !carryCase; part++) {
      const correction = ROM.u32(HIBACHI_A1.gun0Muzzles + part * 4);
      for (let facing = 0; facing < 64; facing++) {
        const vector = ROM.u32(HIBACHI_A1.gun0Vectors + facing * 4);
        if ((correction & 0xffff) + (vector & 0xffff) > 0xffff) {
          carryCase = { part, facing, correction, vector };
          break;
        }
      }
    }
    assert.ok(carryCase, 'the shared tables contain a low-word carry witness');
    b.ram.setU16(A6 + PARTS[carryCase.part] + 0x1a, carryCase.facing);
    b.ram.setU8(SCHED.a1Base + 0x14, 0xf8);
    const firedFacings = PARTS.map((part) => b.ram.u16(A6 + part + 0x1a));
    gun2Step2A7B20(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
    const rs = records(b);
    assert.deepEqual(rs.map((r) => r.kind), Array(12).fill(0x13));
    assert.deepEqual(rs.map((r) => r.dir), ANGLE_BASES.map((base, i) =>
      u16(base + b.ram.u8(SCHED.a1Base + 0x14 + (i >>> 1))) & 0xff));
    for (let i = 0; i < 6; i++) {
      const correction = ROM.u32(HIBACHI_A1.gun0Muzzles + i * 4);
      const facing = firedFacings[i];
      const scaled = ((facing & 0xff00) | (((facing & 0xff) * 4) & 0xff)) & 0xffff;
      const signed = scaled & 0x8000 ? scaled - 0x10000 : scaled;
      const d3 = (correction + ROM.u32(HIBACHI_A1.gun0Vectors + signed)) >>> 0;
      const pair = rs.slice(i * 2, i * 2 + 2);
      assert.deepEqual(pair.map((r) => [r.posA, r.posB, r.d3, r.d4]), [
        [u16(0x5000 + (d3 >>> 16)), u16(0x3000 + d3), d3, 0],
        [u16(0x5000 + (d3 >>> 16)), u16(0x3000 + d3), d3, 0],
      ]);
      assert.equal((pair[1].speed - pair[0].speed) & 0xff, 12,
        'the second D0 adds $000C0000 and leaves kind $13 intact');
    }
    const c = carryCase;
    const packed = (c.correction + c.vector) >>> 0;
    const splitHigh = u16((c.correction >>> 16) + (c.vector >>> 16));
    assert.equal(packed >>> 16, u16(splitHigh + 1),
      'ADD.L carries the low-word overflow into the high word');
    assert.equal(rs[0].dir, 0x68, '$70 + $F8 wraps as an angle byte');
  });

test('W572 magazine and outer borrow transitions consume one draw and retire exactly',
  { skip: SKIP }, () => {
    const noBorrow = gunBench();
    seedEvent(noBorrow, 1);
    noBorrow.ram.setU8(RNG.counter, 0x40);
    gun2Step2A7B20(noBorrow.ram, ROM, noBorrow.ctx, SCHED.a1Base, A5, A6);
    assert.equal(noBorrow.ram.u8(SCHED.a1Base + 0x04), 0);
    assert.equal(noBorrow.ram.u8(SCHED.a1Base + 0x06), 3);
    assert.equal(noBorrow.ram.u8(RNG.counter), 0x40,
      'old magazine one reaches zero without borrowing');

    const transition = gunBench();
    seedEvent(transition, 0);
    transition.ram.setU8(SCHED.a1Base + 0x06, 1);
    const headings = [9, 8, 7, 6, 5, 4];
    headings.forEach((value, i) => transition.ram.setU8(SCHED.a1Base + 0x14 + i, value));
    transition.ram.setU8(RNG.counter, 0x20);
    const draw = ROM.u8(RNG_242B3C.table + 0x21);
    gun2Step2A7B20(transition.ram, ROM, transition.ctx, SCHED.a1Base, A5, A6);
    assert.equal(transition.ram.u8(RNG.counter), 0x21);
    assert.equal(transition.ram.u8(SCHED.a1Base + 0x04),
      u16(0x0b + (i8(draw) >> 1)) & 0xff);
    assert.equal(transition.ram.u8(SCHED.a1Base + 0x02), 8);
    assert.equal(transition.ram.u8(SCHED.a1Base + 0x06), 0,
      'old outer one reaches zero without retirement');
    assert.deepEqual(Array.from({ length: 6 }, (_, i) =>
      transition.ram.u8(SCHED.a1Base + 0x14 + i)), headings,
    'the magazine transition does not redraw six headings');

    const retire = gunBench();
    seedEvent(retire, 0);
    retire.ram.setU16(SCHED.a1Base, 0x8102);
    retire.ram.setU16(SCHED.a1Base + SCHED.a1Stride, 0x8102);
    retire.ram.setU16(SCHED.a1Base + SCHED.a1Stride * 2, 0x8103);
    retire.ram.setU8(SCHED.a1Base + 0x06, 0);
    retire.ram.setU8(A6 + 0x13c, 0x0f);
    retire.ram.setU16(A6 + 0x1d2, 3);
    retire.ram.setU16(A6 + 0x1d4, 4);
    PARTS.forEach((part) => retire.ram.setU8(A6 + part + 0x1e, 1));
    gun2Step2A7B20(retire.ram, ROM, retire.ctx, SCHED.a1Base, A5, A6);
    assert.equal(retire.ram.u8(SCHED.a1Base + 0x02), 0x80);
    assert.equal(retire.ram.u8(A6 + 0x13c), 0xf0);
    assert.deepEqual([retire.ram.u16(A6 + 0x1d2), retire.ram.u16(A6 + 0x1d4)], [4, 4]);
    assert.deepEqual(PARTS.map((part) => retire.ram.u8(A6 + part + 0x1e)),
      Array(6).fill(0));
    assert.deepEqual([
      retire.ram.u16(SCHED.a1Base),
      retire.ram.u16(SCHED.a1Base + SCHED.a1Stride),
      retire.ram.u16(SCHED.a1Base + SCHED.a1Stride * 2),
    ], [0, 0, 0x8103], 'all and only ID-2 slots stop');

    const capped = gunBench();
    seedEvent(capped, 0);
    capped.ram.setU8(SCHED.a1Base + 0x06, 0);
    capped.ram.setU16(A6 + 0x1d2, 4);
    capped.ram.setU16(A6 + 0x1d4, 0xffff);
    gun2Step2A7B20(capped.ram, ROM, capped.ctx, SCHED.a1Base, A5, A6);
    assert.deepEqual([capped.ram.u16(A6 + 0x1d2), capped.ram.u16(A6 + 0x1d4)],
      [4, 0xffff], 'unsigned words exactly at or above four do not increment');
  });

test('W572 checkpoint remains strict through the W576 additive migration',
  { skip: SKIP_CHECKPOINT }, async () => {
    const live = await bundle();
    assert.equal(canonicalHash(live.tables), LIVE_TABLE_HASH);
    assert.deepEqual(live.tables, TABLE_JSON);
    const assets = { ...live, tables: tableBeforeW576(TABLE_JSON) };
    assert.equal(canonicalHash(assets.tables), ASSET_TABLE_HASH);
    assert.deepEqual(assets.tables, tableBeforeW576(TABLE_JSON));
    const exact = live;
    assert.deepEqual(tableBeforeW573(exact.tables), W572_TABLE,
      'removing W573 reconstructs strict historical W572');
    assert.deepEqual(tableBeforeW572(exact.tables), W571_TABLE,
      'the older reconstruction composes through W573');

    const historical = JSON.parse(readFileSync(PERIODIC, 'utf8'));
    assert.deepEqual([
      historical.tablesSha256, historical.frame.logic, historical.frame.video,
      historical.raw.stage, historical.raw.stageX2, historical.raw.stageX4,
      historical.raw.loop, historical.ramSha256, historical.gameSha256,
    ], [
      STORED_TABLE_HASH, 146131, 156720, 4, 8, 16, 1,
      '7aa0a1797578457c05bc7ef4ac04cfcb8bd2091c58d3519552f6dce3bb673ada',
      '887b179b1c99fb62bb44a01fd57e790ac41e80502957f428afc6e64e4eeae5fc',
    ]);
    const adopted = { ...historical, tablesSha256: TABLE_HASH };
    assert.deepEqual({ ...adopted, tablesSha256: historical.tablesSha256 }, historical,
      'W623 adoption changes only the stored W572 checkpoint table identity');
    restoreCheckpoint(adopted, { ...exact, tables: W572_TABLE }, adopted.selection);
    const migrated = { ...adopted, tablesSha256: LIVE_TABLE_HASH };
    restoreCheckpoint(migrated, exact, historical.selection);
    assert.deepEqual([migrated.ramSha256, migrated.gameSha256],
      [historical.ramSha256, historical.gameSha256],
      'live migration changes only the table identity');
    assert.ok(scriptAddresses().includes(HIBACHI_A1.gun3Init));
    assert.equal(HIBACHI_A1_COUNTED[3], undefined);
  });
