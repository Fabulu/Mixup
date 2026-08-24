// W564: HIBACHI LOOP-ZERO GUN 2, A4 ID 9, AND THE D5 RNG TWIN.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import {
  SCHED, installScripts, a4Start25980C, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { AIM, AimTables, aim256 } from '../src/aim.js';
import { RNG, RNG_242B3C, drawWord242B90 } from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';
import {
  HIBACHI_A4, HIBACHI_END_SCRIPTS,
  s9Init2A6858, s9Step2A6864,
} from '../src/hibachiend.js';
import {
  HIBACHI_A1, HIBACHI_A1_ALT_COUNTED, HIBACHI_A1_ALT_SCRIPTS,
  altGun2Init2A9AA0, altGun2Step2A9B0E,
} from '../src/hibachiguns.js';
import { RAM, P } from '../src/machine.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, overlappingPairs, tableBeforeW569,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const EXPORT_TABLES = here('../tools/export-tables.py');
const ASSETS = here('../assets');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00072711.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = existsSync(CHECKPOINT)
  && existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz')) && !SKIP ? false
  : 'exact checkpoint bundle absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));

const WINDOW = SKIP ? null : Object.freeze({
  base: '$2A9A68',
  len: 0x18,
  why: "W564: loop-zero HIBACHI A1 gun 2's twelve-word slot template, copied by $2A9AA0 moveq #$B plus dbra and ending before unused self-pointer padding",
  hex: IMG.subarray(0x2a9a68, 0x2a9a80).toString('hex'),
});
const POST_W564_BASES = new Set([
  '$2A9E50', '$2AA004', '$2AA040',
  '$29139E', '$2902CA', '$2902E2', '$2903E6', '$2903F2', '$29040A', '$29041A',
  '$290442', '$290462', '$29051A', '$29058E', '$2905A2', '$2905CA', '$2906C6',
]);
const W564_TABLE = SKIP ? null : (() => {
  const copy = tableBeforeW569(TABLE_JSON);
  copy.rom.windows = copy.rom.windows.filter((w) => !POST_W564_BASES.has(w.base));
  return copy;
})();
const PRIOR_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(W564_TABLE));
  copy.rom.windows = copy.rom.windows.filter((w) => w.base !== '$2A9A68');
  return copy;
})();
const FUTURE_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(PRIOR_TABLE));
  const after = copy.rom.windows.findIndex((w) => w.base === '$2A97B6');
  assert.notEqual(after, -1, 'the W563 template predecessor exists');
  copy.rom.windows.splice(after + 1, 0, WINDOW);
  return copy;
})();
const ROM = SKIP ? null : new RomWindows(FUTURE_TABLE.rom);
const AIM_TABLES = SKIP ? null : new AimTables(ROM);
const PRIOR_HASH = '80b9cd8d170bb9815e22e379b87587e0c2313d2c76eefa3afc0350606beb1041';
const FUTURE_HASH = 'ec7c6bc2c888fb375d32c1377ca8afd80b04ab9813163599e8784ccc6b35f028';
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const A5 = 0x810c00;
const A6 = 0x814800;
const PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const STANDARD_SITES = Object.freeze([
  0x2a9c02, 0x2a9c16, 0x2a9c44, 0x2a9c58, 0x2a9c86, 0x2a9c9a,
  0x2a9cc8, 0x2a9cdc, 0x2a9d0a, 0x2a9d1e, 0x2a9d4c, 0x2a9d60,
]);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};
const i8 = (v) => (((v & 0xff) ^ 0x80) - 0x80);
const record = (ram, shot) => {
  const address = shot[1][0].addr;
  return {
    kind: ram.u16(address + BREC.typeWord) & 0x3f,
    dir: ram.u8(address + BREC.dir),
    posA: ram.u16(address + BREC.posA),
    posB: ram.u16(address + BREC.posB),
  };
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

function seedLiveTarget(b, y) {
  b.ram.setU16(A6 + 0x02, 0x5000);
  b.ram.setU16(A6 + 0x04, 0x3000);
  b.ram.setU16(AIM.selP1, 0x8000);
  b.ram.setU16(AIM.selP1 + 0x02, y);
  b.ram.setU16(AIM.selP1 + 0x04, 0x2800);
  b.ram.setU16(AIM.selP2, 0);
}

async function bundle() {
  return loadBundle(async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W564 is one strict additive $2A9A68+$18 window with no padding', { skip: SKIP }, () => {
  assert.deepEqual(W564_TABLE, FUTURE_TABLE,
    'removing the later W565-W568 windows reconstructs the strict W564 additive result');
  assert.equal(TABLE_JSON.rom.windows.length, 851);
  assert.equal(PRIOR_TABLE.rom.windows.length, 821);
  assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH);
  assert.equal(W564_TABLE.rom.windows.length, 822);
  assert.equal(canonicalHash(W564_TABLE), FUTURE_HASH);
  assert.equal(W564_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 451589);
  assert.deepEqual(W564_TABLE.rom.windows.filter((w) => w.base === '$2A9A68'), [WINDOW]);
  assert.equal(WINDOW.hex, '208009090f0f040800030013fff70005ff00000000000000');
  assert.equal(overlappingPairs(FUTURE_TABLE.rom.windows.map((w) => [
    Number.parseInt(w.base.slice(1), 16), w.len,
  ])), ROM_OVERLAP_PAIRS);
  assert.equal(ROM_OVERLAP_PAIRS, 77);
  assert.equal(caught(() => ROM.u8(0x2a9a7f)), null);
  assert.equal(caught(() => ROM.u8(0x2a9a80))?.romAddress, 0x2a9a80);
  assert.equal(caught(() => ROM.u8(0x2a9a9f))?.romAddress, 0x2a9a9f);

  const exporter = readFileSync(EXPORT_TABLES, 'utf8');
  assert.equal([...exporter.matchAll(/\(0x2A9A68, 0x0018,/g)].length, 1);
  assert.doesNotMatch(exporter, /\(0x2A9A80,/);
});

test('W564 pins both script pairs, boundaries, scheduler registrations, and counts',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM.u32(HIBACHI_A1.alt + 2 * 8), ROM.u32(HIBACHI_A1.alt + 2 * 8 + 4),
    ], [HIBACHI_A1.altGun2Init, HIBACHI_A1.altGun2Step]);
    assert.deepEqual([
      ROM.u32(HIBACHI_A4.table + 9 * 8), ROM.u32(HIBACHI_A4.table + 9 * 8 + 4),
    ], [HIBACHI_A4.s9Init, HIBACHI_A4.s9Step]);
    assert.deepEqual([
      HIBACHI_A1.altGun2Init, HIBACHI_A1.altGun2Step,
      HIBACHI_A4.s9Init, HIBACHI_A4.s9Step,
    ], [0x2a9aa0, 0x2a9b0e, 0x2a6858, 0x2a6864]);
    assert.equal(IMG.readUInt16BE(0x2a9b0c), 0x4e75, 'gun init has its own rts');
    assert.equal(IMG.readUInt16BE(0x2a9e4e), 0x4e75, 'gun step ends before gun 3 data');
    assert.equal(ROM.u32(HIBACHI_A1.alt + 3 * 8), 0x2a9e84, 'alternate gun 3 is next');
    assert.equal(IMG.readUInt16BE(0x2a689a), 0x4e75);

    const registered = new Set(scriptAddresses());
    for (const address of [
      HIBACHI_A1.altGun2Init, HIBACHI_A1.altGun2Step,
      HIBACHI_A4.s9Init, HIBACHI_A4.s9Step,
    ]) assert.ok(registered.has(address), `$${address.toString(16)} is registered`);
    assert.deepEqual(HIBACHI_A1_ALT_SCRIPTS, [0, 1, 2, 3, 4]);
    assert.deepEqual(Object.keys(HIBACHI_A1_ALT_COUNTED).map(Number), []);
    assert.ok(HIBACHI_END_SCRIPTS.includes(9));
  });

test('W564 D5 RNG twin and gun 2 init preserve exact ordering and byte-word mismatch',
  { skip: SKIP }, () => {
    const wrapper = new Ram();
    wrapper.setU16(RNG.state, 0x1234);
    let address = null;
    const d5 = drawWord242B90(wrapper, { u8: (at) => { address = at; return 0xab; } });
    assert.equal(wrapper.u16(RNG.state), 0x1235);
    assert.equal(address, RNG_242B3C.table + 0x1235);
    assert.equal(d5, 0x12ab, 'move.b replaces only D5 low byte after move.w seeded its word');

    const b = gunBench();
    b.ram.setU8(A6 + 0x13c, 1);
    b.ram.setU16(A6 + 0x1d2, 0x0203);
    b.ram.setU16(A6 + 0x1d4, 3);
    altGun2Init2A9AA0(b.ram, ROM, SCHED.a1Base, A6);
    const expected = Array.from({ length: 12 }, (_, i) =>
      ROM.u16(HIBACHI_A1.altGun2Template + i * 2));
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
    assert.deepEqual(Array.from({ length: 6 }, (_, i) => b.ram.u8(SCHED.a1Base + 0x14 + i)),
      Array.from({ length: 6 }, (_, i) => ROM.u8(RNG_242B3C.table + i + 1)));
    assert.equal(b.ram.u8(RNG.counter), 6, 'init consumes six $242B3C draws');
    assert.equal(b.ram.u8(SCHED.a1Base + 0x06), 0x11,
      'init reads the byte at A6+$1D2, not the word retirement increments');

    const scheduled = gunBench();
    installScripts(scheduled.ram, ROM, { a1: HIBACHI_A1.alt });
    scheduled.ram.setU16(SCHED.a1Base, 0x8002);
    runScheduler25962E(scheduled.ram, ROM,
      { bossRec: A5, bossSubRec: A6, ...scheduled.ctx });
    assert.equal(scheduled.ram.u16(SCHED.a1Base), 0x8102);
    assert.equal(scheduled.ram.u8(SCHED.a1Base + 0x02), 0x20,
      'the init rts keeps the step out of its first dispatch');
  });

test('W564 aimed branches emit 13 or 15 bullets and preserve the D5 jitter draw',
  { skip: SKIP }, () => {
    const single = gunBench();
    seedLiveTarget(single, 0x4000);
    altGun2Init2A9AA0(single.ram, ROM, SCHED.a1Base, A6);
    single.ram.setU8(SCHED.a1Base + 0x02, 0);
    single.ram.setU8(SCHED.a1Base + 0x04, 2);
    const beforeSingle = single.ram.u8(RNG.counter);
    altGun2Step2A9B0E(single.ram, ROM, single.ctx, SCHED.a1Base, A5, A6);
    assert.deepEqual(single.shots.map(([site]) => site), [0x2a9bca, ...STANDARD_SITES]);
    assert.deepEqual(single.shots.map((shot) => record(single.ram, shot).kind),
      [5, ...Array(12).fill(0x13)]);
    assert.equal(single.ram.u8(RNG.counter), beforeSingle,
      'the one-shot arm branches around $242B90');

    const triple = gunBench();
    seedLiveTarget(triple, 0x6000);
    altGun2Init2A9AA0(triple.ram, ROM, SCHED.a1Base, A6);
    triple.ram.setU8(SCHED.a1Base + 0x02, 0);
    triple.ram.setU8(SCHED.a1Base + 0x04, 2);
    const index = 0x21;
    triple.ram.setU8(RNG.counter, index - 1);
    const center = u16(aim256(AIM_TABLES, 0x40c0, 0x3000, 0x6000, 0x2800)
      + (i8(ROM.u8(RNG_242B3C.table + index)) >> 1)) & 0xff;
    altGun2Step2A9B0E(triple.ram, ROM, triple.ctx, SCHED.a1Base, A5, A6);
    assert.deepEqual(triple.shots.map(([site]) => site), [
      0x2a9bb2, 0x2a9bbe, 0x2a9bca, ...STANDARD_SITES,
    ]);
    const records = triple.shots.map((shot) => record(triple.ram, shot));
    assert.deepEqual(records.slice(0, 3).map((r) => r.kind), [5, 5, 5]);
    assert.deepEqual(records.slice(0, 3).map((r) => r.dir), [center, center, center]);
    assert.deepEqual(records.slice(3).map((r) => r.kind), Array(12).fill(0x13));
    assert.equal(triple.ram.u8(RNG.counter), index, 'the triple arm consumes one D5 draw');
    assert.equal(triple.ram.u8(A5 + 3), 1, 'the aimed arm toggles the selected player once');
  });

test('W564 both-dead aimed events skip every shot while headings and no-freeze cadence advance',
  { skip: SKIP }, () => {
    const dead = gunBench();
    altGun2Init2A9AA0(dead.ram, ROM, SCHED.a1Base, A6);
    dead.ram.setU8(SCHED.a1Base + 0x02, 0);
    dead.ram.setU8(SCHED.a1Base + 0x04, 2);
    dead.ram.setU8(SCHED.a1Base + 0x12, 1);
    PARTS.forEach((part, i) => dead.ram.setU8(A6 + part + 0x1b, i));
    const beforeRng = dead.ram.u8(RNG.counter);
    altGun2Step2A9B0E(dead.ram, ROM, dead.ctx, SCHED.a1Base, A5, A6);
    assert.equal(dead.shots.length, 0);
    assert.equal(dead.ram.u8(RNG.counter), beforeRng);
    assert.deepEqual(PARTS.map((part) => dead.ram.u8(A6 + part + 0x1b)),
      [1, 0, 3, 2, 5, 4]);
    assert.deepEqual(PARTS.map((part) => dead.ram.u8(A6 + part + 0x1e)), Array(6).fill(1));

    const frozen = gunBench();
    altGun2Init2A9AA0(frozen.ram, ROM, SCHED.a1Base, A6);
    frozen.ram.setU8(SCHED.a1Base + 0x02, 0);
    frozen.ram.setU8(SCHED.a1Base + 0x04, 1);
    frozen.ram.setU16(HIBACHI_A1.freeze, 1);
    altGun2Step2A9B0E(frozen.ram, ROM, frozen.ctx, SCHED.a1Base, A5, A6);
    assert.equal(frozen.shots.length, 12, 'gun-level cadence has no freeze guard');
    assert.ok(frozen.shots.every(([, results]) => results.every((r) => r.declined)));
  });

test('W564 magazine transition consumes seven draws and final retirement is exact',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU16(SCHED.a1Base, 0x8102);
    b.ram.setU16(SCHED.a1Base + SCHED.a1Stride, 0x8102);
    b.ram.setU16(SCHED.a1Base + SCHED.a1Stride * 2, 0x8103);
    altGun2Init2A9AA0(b.ram, ROM, SCHED.a1Base, A6);
    b.ram.setU16(SCHED.a1Base, 0x8102);
    b.ram.setU8(SCHED.a1Base + 0x02, 0);
    b.ram.setU8(SCHED.a1Base + 0x04, 0);
    b.ram.setU8(SCHED.a1Base + 0x06, 0);
    b.ram.setU8(A6 + 0x13c, 0x0f);
    b.ram.setU16(A6 + 0x1d2, 3);
    b.ram.setU16(A6 + 0x1d4, 4);
    b.ram.setU8(RNG.counter, 0);
    altGun2Step2A9B0E(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);

    assert.equal(b.ram.u8(RNG.counter), 7);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x04),
      u16(9 + (i8(ROM.u8(RNG_242B3C.table + 1)) >> 1)) & 0xff);
    assert.deepEqual(Array.from({ length: 6 }, (_, i) => b.ram.u8(SCHED.a1Base + 0x14 + i)),
      Array.from({ length: 6 }, (_, i) => ROM.u8(RNG_242B3C.table + i + 2)));
    assert.equal(b.ram.u8(A6 + 0x13c), 0xf0);
    assert.deepEqual([b.ram.u16(A6 + 0x1d2), b.ram.u16(A6 + 0x1d4)], [4, 4]);
    assert.deepEqual(PARTS.map((part) => b.ram.u8(A6 + part + 0x1e)), Array(6).fill(0));
    assert.equal(b.ram.u16(SCHED.a1Base), 0);
    assert.equal(b.ram.u16(SCHED.a1Base + SCHED.a1Stride), 0);
    assert.equal(b.ram.u16(SCHED.a1Base + SCHED.a1Stride * 2), 0x8103);
    assert.equal(ROM.u8(HIBACHI_A1.altGun2Template + 4), 0x0f,
      'initial outer count 15 reaches retirement on the sixteenth magazine transition');
  });

test('W564 A4 id 9 guards only pre-delay, waits for gun 3, cools down, and restarts id 6',
  { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a1: HIBACHI_A1.alt, a4: HIBACHI_A4.table });
    const current = SCHED.a4Base;
    const next = current + SCHED.a4Stride;
    ram.setU16(current, 0x8109);
    s9Init2A6858(ram, current);
    assert.deepEqual([ram.u16(current + 2), ram.u16(current + 4)], [0x60, 0x40]);
    ram.setU16(HIBACHI_A4.freeze, 1);
    s9Step2A6864(ram, current);
    assert.deepEqual([ram.u16(current + 2), ram.u16(current + 4)], [0x60, 0x40]);

    ram.setU16(HIBACHI_A4.freeze, 0);
    ram.setU16(current + 2, 1);
    s9Step2A6864(ram, current);
    assert.equal(ram.u16(SCHED.a1Base), 0x8003);
    assert.equal(ram.u16(current + 4), 0x40);
    ram.setU16(SCHED.a1Base, 0);
    ram.setU16(HIBACHI_A4.freeze, 1);
    s9Step2A6864(ram, current);
    assert.equal(ram.u16(current + 4), 0x3f,
      'post-gun cooldown decrements while the freeze word is set');
    ram.setU16(current + 4, 1);
    s9Step2A6864(ram, current);
    assert.equal(ram.u16(current), 0);
    assert.equal(ram.u16(next), 0x8006);

    const fallthrough = new Ram();
    installScripts(fallthrough, ROM, { a4: HIBACHI_A4.table });
    a4Start25980C(fallthrough, 9);
    runScheduler25962E(fallthrough, ROM, {});
    assert.deepEqual([
      fallthrough.u16(SCHED.a4Base + 2), fallthrough.u16(SCHED.a4Base + 4),
    ], [0x5f, 0x40]);
  });

test('W564 exact frontier reaches alternate gun 3 at logic frame 73726',
  { skip: SKIP_CHECKPOINT }, async () => {
    const exact = await bundle();
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.equal(checkpoint.tablesSha256, FUTURE_HASH);
    const checkpointExact = { ...exact, tables: W564_TABLE };
    const { game } = restoreCheckpoint(checkpoint, checkpointExact, checkpoint.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 1500; attempted++) {
      try {
        game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        game.step(checkpoint.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    assert.equal(attempted, 1016);
    assert.equal(game.logicFrame, 73726);
    assert.equal(error?.romAddress, 0x2a9e50);
    assert.equal(ROM.u32(HIBACHI_A1.alt + 3 * 8), HIBACHI_A1.altGun3Init);
    assert.equal(scriptAddresses().includes(HIBACHI_A1.altGun3Init), true);
    assert.equal(caught(() => ROM.u8(HIBACHI_A1.altGun3Template))?.romAddress,
      HIBACHI_A1.altGun3Template,
      'the strict W564 table stops exactly at the W565 gun-3 template seam');
  });
