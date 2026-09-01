// W571: loop-nonzero Hibachi A1 gun 1 and the next exact loop-2 frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { AIM, AimTables, aim256 } from '../src/aim.js';
import { RNG, RNG_242B3C, RNG_242EC2, RNG_2431F4 } from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';
import {
  SCHED, a1Start259A18, installScripts, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import {
  HIBACHI_A1, HIBACHI_A1_COUNTED, HIBACHI_A1_SCRIPTS,
  gun1Init2A7850, gun1Step2A78D0,
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
const FRONTIER = here('../probes/checkpoints/ship0-style4-lf00145131.json');
const PERIODIC = here('../probes/checkpoints/ship0-style4-lf00145631.json');
const required = [TABLES, IMAGE, EXPORTER];
const SKIP = required.every(existsSync) ? false
  : 'exact W571 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [FRONTIER, PERIODIC,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W571 assets or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W572_TABLE = SKIP ? null : tableBeforeW573(TABLE_JSON);
const W571_TABLE = SKIP ? null : tableBeforeW572(TABLE_JSON);
const PRIOR_TABLE = SKIP ? null : tableBeforeW571(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const AIM_TABLES = SKIP ? null : new AimTables(ROM);
const LIVE_TABLE_HASH = 'de89564cd0e61927e5780855f4a3ebc42c13086aedf71114ce345d63e9326ee1';
const ASSET_TABLE_HASH = 'bdf8d655d3ba484166eadbe73ba29ad59bed36507695dd6a79db8a09b4b4def0';
const W572_HASH = '0f5e8c092c2d16abe958ba0edaa5ea681fd5b296a0b110e10f91d2c6aa1a6ba9';
const TABLE_HASH = '5c998537267ec18c9392305350a1dd7b3e4f60bfe5825bb238156864cfacca75';
const PRIOR_HASH = '0ec146c509a74bf3d75e585fdf2cd268fab86948924fd6c331a45ccce5ec12cc';
const STORED_TABLE_HASH = '376e17ddc03d3e56d728cb804ba091ab098b4039b2d51ba7b2d6689ccd07f7c8';
const STORED_PRIOR_HASH = '9c9a021c431dce64e533d2678e955743401453abc3404ee514842fa1bd678221';
const TEMPLATE = Object.freeze([
  0x2080, 0x8b8b, 0x0300, 0x0000, 0xfff9, 0x0013, 0x0002, 0x0004,
  0xfffd, 0x0005, 0xfff5, 0x0006, 0x0000, 0x0000, 0x05fb,
]);
const A5 = 0x810c00;
const A6 = 0x814800;
const PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const ODD_SITES = Object.freeze([
  0x2a7940, 0x2a797e, 0x2a798c, 0x2a799a, 0x2a79b2,
  0x2a79ca, 0x2a79d8, 0x2a79e6, 0x2a79fa,
]);
const EVEN_SITES = Object.freeze([
  0x2a797e, 0x2a798c, 0x2a799a, 0x2a79ca, 0x2a79d8, 0x2a79e6,
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

function rngIndex(negative) {
  return Array.from({ length: 0xfb }, (_, i) => i)
    .find((i) => ((ROM.u8(RNG_242EC2.table + i) & 0x80) !== 0) === negative);
}

function bulletRecord(ram, result) {
  const address = result.addr;
  return {
    kind: ram.u16(address + BREC.typeWord) & 0x3f,
    dir: ram.u8(address + BREC.dir),
    posA: ram.u16(address + BREC.posA),
    posB: ram.u16(address + BREC.posB),
  };
}

function flattenRecords(b) {
  return b.shots.flatMap(([site, results]) =>
    results.map((result) => ({ site, ...bulletRecord(b.ram, result) })));
}

function seedPlayers(b, preferred, p1Status = 0x8000, p2Status = 0x8000) {
  b.ram.setU8(A5 + 0x03, preferred);
  b.ram.setU16(AIM.selP1, p1Status);
  b.ram.setU16(AIM.selP1 + 0x02, 0x6100);
  b.ram.setU16(AIM.selP1 + 0x04, 0x2200);
  b.ram.setU16(AIM.selP2, p2Status);
  b.ram.setU16(AIM.selP2 + 0x02, 0x7100);
  b.ram.setU16(AIM.selP2 + 0x04, 0x4400);
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W571 adds exactly one disjoint template window and reconstructs strict W570',
  { skip: SKIP }, () => {
    assert.equal(ROM_WINDOW_COUNT, 1014);
    assert.equal(TABLE_JSON.rom.windows.length, 1014);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 478681);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.equal(W571_TABLE.rom.windows.length, 845);
    assert.equal(W571_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 452351);
    assert.equal(canonicalHash(W571_TABLE), TABLE_HASH,
      'removing W573 and W572 preserves strict historical W571');
    assert.equal(PRIOR_TABLE.rom.windows.length, 844);
    assert.equal(PRIOR_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 452321);
    assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH,
      'removing only W571 reconstructs W570 byte for byte');

    const added = W571_TABLE.rom.windows.filter((w) => w.base === '$2A7812');
    assert.deepEqual(added, [{
      base: '$2A7812', len: 0x1e,
      why: "W571: loop-nonzero HIBACHI A1 gun 1's fifteen-word slot template, copied by $2A7850 moveq #$E plus dbra and ending before its unused self-pointer block",
      hex: '20808b8b03000000fff9001300020004fffd0005fff500060000000005fb',
    }]);
    assert.equal(added[0].hex, IMG.subarray(0x2a7812, 0x2a7830).toString('hex'));
    assert.equal(0x2a7712 + 0x100, 0x2a7812, 'W570 vectors abut the new template');
    assert.equal(overlappingPairs(TABLE_JSON.rom.windows.map((w) => [
      Number.parseInt(w.base.slice(1), 16), w.len,
    ])), 77);
    assert.equal(ROM_OVERLAP_PAIRS, 77);
    assert.deepEqual(Array.from({ length: 15 }, (_, i) => ROM.u16(0x2a7812 + i * 2)),
      TEMPLATE);
    assert.equal(caught(() => ROM.u8(0x2a782f)), null);
    assert.deepEqual(Array.from({ length: 8 }, (_, i) => IMG.readUInt32BE(0x2a7830 + i * 4)),
      Array(8).fill(0x2a7850));

    const exporter = readFileSync(EXPORTER, 'utf8');
    assert.equal([...exporter.matchAll(/\(0x2A7812, 0x001E,/g)].length, 1);
    assert.doesNotMatch(exporter, /\(0x2A7830,/,
      'the unused self-pointer block remains outside every W571 window');
  });

test('W571 pins pair boundaries, separate registration, lists, and first dispatch',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM.u32(HIBACHI_A1.main + 8), ROM.u32(HIBACHI_A1.main + 12),
    ], [HIBACHI_A1.gun1Init, HIBACHI_A1.gun1Step]);
    assert.deepEqual([HIBACHI_A1.gun1Init, HIBACHI_A1.gun1Step], [0x2a7850, 0x2a78d0]);
    assert.equal(ROM.u32(HIBACHI_A1.main + 16), 0x2a7ab2, 'main gun 2 is next');
    assert.equal(IMG.readUInt16BE(0x2a78ce), 0x4e75, 'gun 1 init has its own rts');
    assert.equal(IMG.readUInt16BE(0x2a7a78), 0x4e75, 'gun 1 step ends separately');
    const registered = new Set(scriptAddresses());
    assert.ok(registered.has(HIBACHI_A1.gun1Init));
    assert.ok(registered.has(HIBACHI_A1.gun1Step));
    assert.ok(HIBACHI_A1_SCRIPTS.includes(1));
    assert.equal(HIBACHI_A1_COUNTED[1], undefined);
    assert.equal(HIBACHI_A1_COUNTED[2], undefined,
      'W572 registers the next gun without changing gun 1');
    assert.equal(HIBACHI_A1_COUNTED[3], undefined,
      'W573 registers the next gun without changing gun 1');
    assert.equal(HIBACHI_A1_COUNTED[4].init, 0x2a805a);

    const b = gunBench();
    const positive = rngIndex(false);
    b.ram.setU8(RNG.counter, (positive - 1) & 0xff);
    installScripts(b.ram, ROM, { a1: HIBACHI_A1.main });
    assert.equal(a1Start259A18(b.ram, 1), SCHED.a1Base);
    runScheduler25962E(b.ram, ROM, { bossRec: A5, bossSubRec: A6, ...b.ctx });
    assert.equal(b.ram.u16(SCHED.a1Base), 0x8101);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0x20,
      'the init rts keeps the separately registered step out of the first dispatch');
    assert.equal(b.shots.length, 0);
  });

test('W571 init preserves both RNG arms, exact draw order, ramps, and six locks',
  { skip: SKIP }, () => {
    const positive = gunBench();
    const pos = rngIndex(false);
    positive.ram.setU8(RNG.counter, (pos - 1) & 0xff);
    positive.ram.setU8(A6 + 0x1cc, 0x14);
    positive.ram.setU16(A6 + 0x1ce, 2);
    positive.ram.setU16(A6 + 0x1d0, 3);
    gun1Init2A7850(positive.ram, ROM, SCHED.a1Base, A6);
    const expected = [...TEMPLATE];
    expected[1] = 0x9f9f;
    expected[4] = u16(expected[4] + 2);
    for (const i of [6, 8, 10]) expected[i] = u16(expected[i] + 3);
    assert.deepEqual(Array.from({ length: 15 }, (_, i) =>
      positive.ram.u16(SCHED.a1Base + 2 + i * 2)), expected);
    assert.deepEqual([
      positive.ram.u8(SCHED.a1Base + 0x1e), positive.ram.u8(SCHED.a1Base + 0x1f),
    ], [5, 0xfb]);
    assert.deepEqual(PARTS.map((part) => positive.ram.u8(A6 + part + 0x1e)),
      Array(6).fill(1));
    assert.equal(positive.ram.u8(RNG.counter), pos, 'nonnegative arm consumes one draw');

    const negative = gunBench();
    const neg = rngIndex(true);
    negative.ram.setU8(RNG.counter, (neg - 1) & 0xff);
    gun1Init2A7850(negative.ram, ROM, SCHED.a1Base, A6);
    const r1 = ROM.u8(RNG_2431F4.table + ((neg + 1) & 0x3f));
    const r2 = ROM.u8(RNG_2431F4.table + ((neg + 2) & 0x3f));
    assert.deepEqual([
      negative.ram.u8(SCHED.a1Base + 0x1e), negative.ram.u8(SCHED.a1Base + 0x1f),
    ], [u16(-5 + r1) & 0xff, u16(5 + r2) & 0xff]);
    assert.equal(negative.ram.u8(RNG.counter), (neg + 2) & 0xff,
      'negative arm consumes sign, left jitter, then right jitter');
  });

test('W571 freeze reinitializes, and initial plus recurring cadence use byte borrow',
  { skip: SKIP }, () => {
    const frozen = gunBench();
    const pos = rngIndex(false);
    frozen.ram.setU8(RNG.counter, (pos - 1) & 0xff);
    gun1Init2A7850(frozen.ram, ROM, SCHED.a1Base, A6);
    frozen.ram.setU16(HIBACHI_A1.freeze, 1);
    frozen.ram.setU16(SCHED.a1Base + 0x02, 0xdead);
    const before = frozen.ram.u8(RNG.counter);
    gun1Step2A78D0(frozen.ram, ROM, frozen.ctx, SCHED.a1Base, A5, A6);
    assert.equal(frozen.ram.u16(SCHED.a1Base + 0x02), 0x2080);
    assert.equal(frozen.ram.u8(RNG.counter), u16(before + 1) & 0xff);
    assert.equal(frozen.shots.length, 0, 'freeze reruns init and returns without spawning');

    const cadence = gunBench();
    cadence.ram.setU8(RNG.counter, (pos - 1) & 0xff);
    gun1Init2A7850(cadence.ram, ROM, SCHED.a1Base, A6);
    const initialLife = cadence.ram.u8(SCHED.a1Base + 0x04);
    for (let i = 0; i < 32; i++) {
      gun1Step2A78D0(cadence.ram, ROM, cadence.ctx, SCHED.a1Base, A5, A6);
    }
    assert.equal(cadence.ram.u8(SCHED.a1Base + 0x04), initialLife);
    assert.equal(cadence.ram.u8(SCHED.a1Base + 0x02), 0,
      'old timer values $20 through 1 consume the first 32 steps');
    gun1Step2A78D0(cadence.ram, ROM, cadence.ctx, SCHED.a1Base, A5, A6);
    assert.equal(cadence.ram.u8(SCHED.a1Base + 0x04), u16(initialLife - 1) & 0xff,
      'the old zero acts on step 33');
    assert.equal(cadence.ram.u8(SCHED.a1Base + 0x02), 3);
    for (let i = 0; i < 3; i++) {
      gun1Step2A78D0(cadence.ram, ROM, cadence.ctx, SCHED.a1Base, A5, A6);
    }
    assert.equal(cadence.ram.u8(SCHED.a1Base + 0x04), u16(initialLife - 1) & 0xff);
    gun1Step2A78D0(cadence.ram, ROM, cadence.ctx, SCHED.a1Base, A5, A6);
    assert.equal(cadence.ram.u8(SCHED.a1Base + 0x04), u16(initialLife - 2) & 0xff,
      'reload 3 acts every fourth recurring step');
  });

test('W571 target preference, fallback, and both-dead branch are exact',
  { skip: SKIP }, () => {
    const cases = [
      { preferred: 0, p1: 0x8000, p2: 0x8000, target: AIM.selP1, toggle: 1 },
      { preferred: 1, p1: 0x8000, p2: 0x8000, target: AIM.selP2, toggle: 0 },
      { preferred: 1, p1: 0x8000, p2: 0x0000, target: AIM.selP1, toggle: 0 },
      { preferred: 0, p1: 0x0000, p2: 0x8000, target: AIM.selP2, toggle: 1 },
    ];
    for (const [index, row] of cases.entries()) {
      const b = gunBench();
      b.ram.setU16(A6 + 0x02, 0x5000);
      b.ram.setU16(A6 + 0x04, 0x3000);
      seedPlayers(b, row.preferred, row.p1, row.p2);
      b.ram.setU8(SCHED.a1Base + 0x02, 0);
      b.ram.setU8(SCHED.a1Base + 0x04, 3);
      b.ram.setU8(SCHED.a1Base + 0x05, 9);
      b.ram.setU8(SCHED.a1Base + 0x06, 3);
      b.ram.setU8(SCHED.a1Base + 0x08, 0x20);
      b.ram.setU8(SCHED.a1Base + 0x09, 0xa0);
      b.ram.setU8(SCHED.a1Base + 0x1e, 5);
      b.ram.setU8(SCHED.a1Base + 0x1f, 0xfb);
      const draw = 0x21 + index;
      b.ram.setU8(RNG.counter, draw - 1);
      const expected = u16(aim256(AIM_TABLES, 0x40c0, 0x3000,
        b.ram.u16(row.target + 2), b.ram.u16(row.target + 4))
        + (i8(ROM.u8(RNG_242B3C.table + draw)) >> 1)) & 0xff;
      gun1Step2A78D0(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
      assert.equal(b.shots[0][0], 0x2a7940);
      assert.equal(bulletRecord(b.ram, b.shots[0][1][0]).dir, expected);
      assert.equal(b.ram.u8(A5 + 3), row.toggle);
      assert.equal(b.ram.u8(RNG.counter), draw);
    }

    const negativeJitter = gunBench();
    negativeJitter.ram.setU16(A6 + 0x02, 0x5000);
    negativeJitter.ram.setU16(A6 + 0x04, 0x3000);
    seedPlayers(negativeJitter, 0, 0x8000, 0);
    negativeJitter.ram.setU8(SCHED.a1Base + 0x02, 0);
    negativeJitter.ram.setU8(SCHED.a1Base + 0x04, 3);
    negativeJitter.ram.setU8(SCHED.a1Base + 0x06, 3);
    const negativeDraw = Array.from({ length: 0x100 }, (_, i) => i)
      .find((i) => i8(ROM.u8(RNG_242B3C.table + i)) < 0);
    const rawJitter = i8(ROM.u8(RNG_242B3C.table + negativeDraw));
    negativeJitter.ram.setU8(RNG.counter, (negativeDraw - 1) & 0xff);
    gun1Step2A78D0(negativeJitter.ram, ROM, negativeJitter.ctx,
      SCHED.a1Base, A5, A6);
    assert.equal(bulletRecord(negativeJitter.ram, negativeJitter.shots[0][1][0]).dir,
      u16(aim256(AIM_TABLES, 0x40c0, 0x3000, 0x6100, 0x2200)
        + (rawJitter >> 1)) & 0xff,
    'ASR.B rounds a negative odd jitter toward minus infinity before byte addition');

    const dead = gunBench();
    seedPlayers(dead, 1, 0, 0);
    dead.ram.setU8(SCHED.a1Base + 0x02, 0);
    dead.ram.setU8(SCHED.a1Base + 0x04, 3);
    dead.ram.setU8(SCHED.a1Base + 0x06, 3);
    dead.ram.setU8(SCHED.a1Base + 0x08, 0x31);
    dead.ram.setU8(SCHED.a1Base + 0x09, 0x72);
    dead.ram.setU8(SCHED.a1Base + 0x1e, 5);
    dead.ram.setU8(SCHED.a1Base + 0x1f, 0xfb);
    dead.ram.setU8(RNG.counter, 0x44);
    gun1Step2A78D0(dead.ram, ROM, dead.ctx, SCHED.a1Base, A5, A6);
    assert.equal(dead.shots.length, 0, 'both dead skips aim and every wing call');
    assert.equal(dead.ram.u8(RNG.counter), 0x44, 'both dead skips jitter');
    assert.deepEqual([
      dead.ram.u8(SCHED.a1Base + 0x08), dead.ram.u8(SCHED.a1Base + 0x09),
    ], [0x31, 0x72], 'both dead skips heading drift');
    assert.equal(dead.ram.u8(SCHED.a1Base + 0x04), 2, 'life still decrements');
    assert.equal(dead.ram.u8(A5 + 3), 1, 'the preference is not toggled');
  });

test('W571 odd and even volleys preserve sites, split calls, registers, headings, and drift',
  { skip: SKIP }, () => {
    const odd = gunBench();
    odd.ram.setU16(HIBACHI_A1.loopWord, 1);
    odd.ram.setU16(A6 + 0x02, 0x5000);
    odd.ram.setU16(A6 + 0x04, 0x3000);
    seedPlayers(odd, 0, 0x8000, 0);
    odd.ram.setU8(SCHED.a1Base + 0x02, 0);
    odd.ram.setU8(SCHED.a1Base + 0x04, 5);
    odd.ram.setU8(SCHED.a1Base + 0x05, 5);
    odd.ram.setU8(SCHED.a1Base + 0x06, 3);
    odd.ram.setU32(SCHED.a1Base + 0x0a, 0xfff90013);
    odd.ram.setU32(SCHED.a1Base + 0x0e, 0x00020004);
    odd.ram.setU32(SCHED.a1Base + 0x12, 0xfffd0005);
    odd.ram.setU32(SCHED.a1Base + 0x16, 0xfff50006);
    odd.ram.setU8(SCHED.a1Base + 0x1e, 5);
    odd.ram.setU8(SCHED.a1Base + 0x1f, 0xfb);
    const draw = 0x31;
    odd.ram.setU8(RNG.counter, draw - 1);
    const q = u16(aim256(AIM_TABLES, 0x40c0, 0x3000, 0x6100, 0x2200)
      + (i8(ROM.u8(RNG_242B3C.table + draw)) >> 1)) & 0xff;
    gun1Step2A78D0(odd.ram, ROM, odd.ctx, SCHED.a1Base, A5, A6);

    assert.deepEqual(odd.shots.map(([site]) => site), ODD_SITES);
    assert.deepEqual(odd.shots.map(([, results]) => results.length), [1, 2, 2, 1, 1, 2, 2, 1, 1],
      '$281764 splits into two shots when the loop word is nonzero');
    const oddRecords = flattenRecords(odd);
    assert.deepEqual(oddRecords.map((r) => r.kind),
      [0x13, 4, 4, 5, 5, 6, 3, 4, 4, 5, 5, 6, 3]);
    const left = u16(q + 0x40) & 0xff;
    const right = u16(0x40 - q) & 0xff;
    assert.deepEqual(oddRecords.map((r) => r.dir), [
      q,
      u16(left - 8) & 0xff, u16(left + 8) & 0xff,
      u16(left + 0x18) & 0xff, u16(left + 0x28) & 0xff,
      u16(left + 0x80) & 0xff, u16(left + 0xa0) & 0xff,
      u16(right - 8) & 0xff, u16(right + 8) & 0xff,
      u16(right + 0x18) & 0xff, u16(right + 0x28) & 0xff,
      u16(right + 0x80) & 0xff, u16(right + 0x80) & 0xff,
    ]);
    assert.deepEqual(oddRecords.map(({ posA, posB }) => [posA, posB]), [
      [0x40c0, 0x3000],
      ...Array(6).fill([0x42c0, 0x2c00]),
      ...Array(6).fill([0x42c0, 0x3400]),
    ], 'D2 is the boss long and D3 is $F0C00000, $F2C0FC00, then $F2C00400');
    assert.deepEqual([
      odd.ram.u8(SCHED.a1Base + 0x08), odd.ram.u8(SCHED.a1Base + 0x09),
    ], [u16(left + 5) & 0xff, u16(right - 5) & 0xff],
    'the first successful odd tick seeds Q+$40 and $40-Q before signed drift');
    assert.equal(odd.ram.u8(A5 + 3), 1);

    const even = gunBench();
    even.ram.setU16(HIBACHI_A1.loopWord, 1);
    even.ram.setU16(A6 + 0x02, 0x5000);
    even.ram.setU16(A6 + 0x04, 0x3000);
    even.ram.setU8(SCHED.a1Base + 0x02, 0);
    even.ram.setU8(SCHED.a1Base + 0x04, 4);
    even.ram.setU8(SCHED.a1Base + 0x06, 3);
    even.ram.setU8(SCHED.a1Base + 0x08, 0x20);
    even.ram.setU8(SCHED.a1Base + 0x09, 0xa0);
    even.ram.setU32(SCHED.a1Base + 0x0e, 0x00020004);
    even.ram.setU32(SCHED.a1Base + 0x12, 0xfffd0005);
    even.ram.setU32(SCHED.a1Base + 0x16, 0xfff50006);
    even.ram.setU8(SCHED.a1Base + 0x1e, 5);
    even.ram.setU8(SCHED.a1Base + 0x1f, 0xfb);
    even.ram.setU8(RNG.counter, 0x55);
    gun1Step2A78D0(even.ram, ROM, even.ctx, SCHED.a1Base, A5, A6);
    assert.deepEqual(even.shots.map(([site]) => site), EVEN_SITES);
    assert.deepEqual(even.shots.map(([, results]) => results.length), [2, 2, 1, 2, 2, 1]);
    assert.equal(flattenRecords(even).length, 10);
    assert.equal(even.ram.u8(RNG.counter), 0x55, 'even ticks skip target jitter');
    assert.deepEqual([
      even.ram.u8(SCHED.a1Base + 0x08), even.ram.u8(SCHED.a1Base + 0x09),
    ], [0x25, 0x9b]);
  });

test('W571 retirement negates drift, applies thresholds, clears locks, and stops every id-1 slot',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU16(SCHED.a1Base, 0x8101);
    b.ram.setU16(SCHED.a1Base + SCHED.a1Stride, 0x8101);
    b.ram.setU16(SCHED.a1Base + SCHED.a1Stride * 2, 0x8102);
    b.ram.setU8(SCHED.a1Base + 0x02, 0);
    b.ram.setU8(SCHED.a1Base + 0x03, 0x80);
    b.ram.setU8(SCHED.a1Base + 0x04, 0);
    b.ram.setU8(SCHED.a1Base + 0x06, 3);
    b.ram.setU8(SCHED.a1Base + 0x08, 0x20);
    b.ram.setU8(SCHED.a1Base + 0x09, 0xa0);
    b.ram.setU32(SCHED.a1Base + 0x0e, 0x00020004);
    b.ram.setU32(SCHED.a1Base + 0x12, 0xfffd0005);
    b.ram.setU32(SCHED.a1Base + 0x16, 0xfff50006);
    b.ram.setU8(SCHED.a1Base + 0x1e, 5);
    b.ram.setU8(SCHED.a1Base + 0x1f, 0xfb);
    b.ram.setU8(A6 + 0x1cc, 0x28);
    b.ram.setU16(A6 + 0x1ce, 3);
    b.ram.setU16(A6 + 0x1d0, 0x19);
    for (const part of PARTS) b.ram.setU8(A6 + part + 0x1e, 1);
    gun1Step2A78D0(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);

    assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0x80);
    assert.deepEqual([
      b.ram.u8(SCHED.a1Base + 0x1e), b.ram.u8(SCHED.a1Base + 0x1f),
    ], [0xfb, 5]);
    assert.deepEqual([
      b.ram.u8(A6 + 0x1cc), b.ram.u16(A6 + 0x1ce), b.ram.u16(A6 + 0x1d0),
    ], [0x3c, 4, 0x1a]);
    assert.deepEqual(PARTS.map((part) => b.ram.u8(A6 + part + 0x1e)), Array(6).fill(0));
    assert.equal(b.ram.u16(SCHED.a1Base), 0);
    assert.equal(b.ram.u16(SCHED.a1Base + SCHED.a1Stride), 0);
    assert.equal(b.ram.u16(SCHED.a1Base + SCHED.a1Stride * 2), 0x8102);

    const retireWith = (byteRamp, aimRamp, wingRamp) => {
      const edge = gunBench();
      edge.ram.setU8(SCHED.a1Base + 0x02, 0);
      edge.ram.setU8(SCHED.a1Base + 0x04, 0);
      edge.ram.setU8(A6 + 0x1cc, byteRamp);
      edge.ram.setU16(A6 + 0x1ce, aimRamp);
      edge.ram.setU16(A6 + 0x1d0, wingRamp);
      gun1Step2A78D0(edge.ram, ROM, edge.ctx, SCHED.a1Base, A5, A6);
      return [edge.ram.u8(A6 + 0x1cc), edge.ram.u16(A6 + 0x1ce),
        edge.ram.u16(A6 + 0x1d0)];
    };
    assert.deepEqual(retireWith(0x3c, 4, 0x1a), [0x3c, 4, 0x1a],
      'values exactly at each cap do not advance');
    assert.deepEqual(retireWith(0xff, 0xffff, 0xffff), [0xff, 0, 0],
      'the byte comparison is unsigned while both word comparisons are signed');
  });

test('W571 historical identity composes through W576 and its checkpoint migrates exactly',
  { skip: SKIP_CHECKPOINT }, async () => {
    const live = await bundle();
    assert.equal(canonicalHash(live.tables), LIVE_TABLE_HASH);
    assert.deepEqual(live.tables, TABLE_JSON);
    const assets = { ...live, tables: tableBeforeW576(TABLE_JSON) };
    assert.equal(canonicalHash(assets.tables), ASSET_TABLE_HASH);
    assert.deepEqual(assets.tables, tableBeforeW576(TABLE_JSON));
    const exact = live;
    assert.deepEqual(tableBeforeW572(exact.tables), W571_TABLE,
      'removing W572 reconstructs strict historical W571');
    assert.deepEqual(tableBeforeW571(exact.tables), PRIOR_TABLE,
      'the older reconstruction composes through W572 before removing W571');

    const frontier = JSON.parse(readFileSync(FRONTIER, 'utf8'));
    assert.deepEqual([
      frontier.tablesSha256, frontier.frame.logic, frontier.frame.video,
      frontier.raw.stage, frontier.raw.stageX2, frontier.raw.stageX4, frontier.raw.loop,
      frontier.ramSha256, frontier.gameSha256,
    ], [
      STORED_PRIOR_HASH, 145131, 155720, 4, 8, 16, 1,
      '96fca098a3ed4ce80618ae0f675d8afd2e18442d19574d070ca016924adbf9d9',
      'a4fac661dfc90179650cce42318fb7b46923044d0ef94c97786fad92f7745e99',
    ]);
    const adoptedPrior = { ...frontier, tablesSha256: PRIOR_HASH };
    assert.deepEqual({ ...adoptedPrior, tablesSha256: frontier.tablesSha256 }, frontier,
      'W623 adoption changes only the stored W570 checkpoint table identity');
    restoreCheckpoint(adoptedPrior, { ...exact, tables: PRIOR_TABLE }, adoptedPrior.selection);
    const migratedW571 = { ...adoptedPrior, tablesSha256: TABLE_HASH };
    restoreCheckpoint(migratedW571, { ...exact, tables: W571_TABLE }, frontier.selection);

    const periodic = JSON.parse(readFileSync(PERIODIC, 'utf8'));
    assert.deepEqual([
      periodic.tablesSha256, periodic.frame.logic, periodic.frame.video,
      periodic.raw.stage, periodic.raw.stageX2, periodic.raw.stageX4, periodic.raw.loop,
      periodic.ramSha256, periodic.gameSha256,
    ], [
      STORED_TABLE_HASH, 145631, 156220, 4, 8, 16, 1,
      '26400c3c024c4bda3a1578210a599ba49b6ea9c154a86c2530e7294de053332b',
      'd25395bda9a3c25f53a2a9c06ce747f9924a4bc418268cd7d937414765c8cb1c',
    ]);
    const adoptedW571 = { ...periodic, tablesSha256: TABLE_HASH };
    assert.deepEqual({ ...adoptedW571, tablesSha256: periodic.tablesSha256 }, periodic,
      'W623 adoption changes only the stored W571 checkpoint table identity');
    restoreCheckpoint(adoptedW571, { ...exact, tables: W571_TABLE }, adoptedW571.selection);
    const migratedW572 = { ...adoptedW571, tablesSha256: W572_HASH };
    restoreCheckpoint(migratedW572, { ...exact, tables: W572_TABLE }, periodic.selection);
    assert.deepEqual([migratedW572.ramSha256, migratedW572.gameSha256],
      [periodic.ramSha256, periodic.gameSha256],
      'W572 migration changes only the table identity');
    assert.ok(scriptAddresses().includes(HIBACHI_A1.gun2Init));
    assert.equal(HIBACHI_A1_COUNTED[2], undefined);
  });
