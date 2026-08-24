// W565: HIBACHI LOOP-ZERO GUN 3 AND LIVE HP-INTERRUPT A4 ID $E.

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
import { RNG, RNG_2431F4 } from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';
import { RAM, P } from '../src/machine.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  HIBACHI_A4, HIBACHI_END_COUNTED, HIBACHI_END_SCRIPTS,
  sEInit2A69D0, sEStep2A6A00,
} from '../src/hibachiend.js';
import {
  HIBACHI_A1, HIBACHI_A1_ALT_COUNTED, HIBACHI_A1_ALT_SCRIPTS,
  HIBACHI_GUN_A4_SCRIPTS, altGun3Init2A9E84, altGun3Step2A9EB6,
} from '../src/hibachiguns.js';
import {
  ROM_OVERLAP_PAIRS, overlappingPairs, tableBeforeW569,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const ASSETS = here('../assets');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00073711.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = existsSync(CHECKPOINT)
  && existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz')) && !SKIP ? false
  : 'exact checkpoint bundle absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));

const WINDOW_SPECS = Object.freeze([
  Object.freeze([0x2a9e50, 0x14,
    "W565: loop-zero HIBACHI A1 gun 3's ten-word slot template, copied by $2A9E84 moveq #$9 plus dbra and ending before its unused self-pointer block"]),
  Object.freeze([0x2aa004, 0x3c,
    "W565: loop-zero HIBACHI A1 gun 3's five twelve-byte paired-shot rows, walked from offset $30 down through $00 and ending exactly at gun 4's template"]),
]);
const WINDOW_BASES = new Set(WINDOW_SPECS.map(([base]) => `$${base.toString(16).toUpperCase()}`));
const WINDOWS = SKIP ? null : WINDOW_SPECS.map(([base, len, why]) => Object.freeze({
  base: `$${base.toString(16).toUpperCase()}`,
  len, why, hex: IMG.subarray(base, base + len).toString('hex'),
}));
const POST_W565_BASES = new Set([
  '$2AA040',
  '$29139E', '$2902CA', '$2902E2', '$2903E6', '$2903F2', '$29040A', '$29041A',
  '$290442', '$290462', '$29051A', '$29058E', '$2905A2', '$2905CA', '$2906C6',
]);
const W565_TABLE = SKIP ? null : (() => {
  const copy = tableBeforeW569(TABLE_JSON);
  copy.rom.windows = copy.rom.windows.filter((w) => !POST_W565_BASES.has(w.base));
  return copy;
})();
const PRIOR_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(W565_TABLE));
  copy.rom.windows = copy.rom.windows.filter((w) => !WINDOW_BASES.has(w.base));
  return copy;
})();
const FUTURE_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(PRIOR_TABLE));
  const after = copy.rom.windows.findIndex((w) => w.base === '$2A9A68');
  assert.notEqual(after, -1, 'the W564 predecessor exists');
  copy.rom.windows.splice(after + 1, 0, ...WINDOWS);
  return copy;
})();
const ROM = SKIP ? null : new RomWindows(FUTURE_TABLE.rom);
const AIM_TABLES = SKIP ? null : new AimTables(ROM);
const PRIOR_HASH = 'ec7c6bc2c888fb375d32c1377ca8afd80b04ab9813163599e8784ccc6b35f028';
const FUTURE_HASH = '9df27f6f7be58294229144676055c51dfae1ecb2f686134c12d0504b43497a2e';
const CURRENT_HASH = '145945830be69de56a76312f0d44aaedd47519083d0da70fce2361ea06dba289';
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const A5 = 0x810c00;
const A6 = 0x814800;
const PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};
const i8 = (v) => (((v & 0xff) ^ 0x80) - 0x80);
const shiftedBias = (word, count) => {
  const value = i8(word);
  const shift = count & 0x3f;
  if (shift === 0) return value;
  return shift >= 8 ? (value < 0 ? -1 : 0) : value >> shift;
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

function seedTarget(b) {
  b.ram.setU16(A6 + 0x02, 0x5000);
  b.ram.setU16(A6 + 0x04, 0x4000);
  b.ram.setU16(AIM.selP1, 0x8000);
  b.ram.setU16(AIM.selP1 + 0x02, 0x7000);
  b.ram.setU16(AIM.selP1 + 0x04, 0x6000);
  b.ram.setU16(AIM.selP2, 0);
}

function record(ram, shot) {
  const address = shot[1][0].addr;
  return {
    kind: ram.u16(address + BREC.typeWord) & 0x3f,
    dir: ram.u8(address + BREC.dir),
    posA: ram.u16(address + BREC.posA),
    posB: ram.u16(address + BREC.posB),
  };
}

async function bundle() {
  return loadBundle(async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W565 is a strict two-window additive superset with no self-pointers or padding',
  { skip: SKIP }, () => {
    assert.deepEqual(W565_TABLE, FUTURE_TABLE,
      'removing the later W566 and W568 windows reconstructs the strict W565 additive result');
    assert.equal(TABLE_JSON.rom.windows.length, 845);
    assert.equal(PRIOR_TABLE.rom.windows.length, 822);
    assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH);
    assert.equal(W565_TABLE.rom.windows.length, 824);
    assert.equal(canonicalHash(W565_TABLE), FUTURE_HASH);
    assert.equal(W565_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 451669);
    assert.deepEqual(W565_TABLE.rom.windows.filter((w) => WINDOW_BASES.has(w.base)), WINDOWS);
    assert.deepEqual(WINDOWS.map(({ base, len, hex }) => [base, len, hex]), [
      ['$2A9E50', 0x14, '20801d1d03030020ffff000b00301d00ffff0303'],
      ['$2AA004', 0x3c,
        '0dc0ed4000100dc012c0fff00b40f00000080b401000fff80940f300000009400d0000000800f640fff8080009c0000806c0f940fff006c006c00010'],
    ]);
    assert.equal(overlappingPairs(TABLE_JSON.rom.windows.map((w) => [
      Number.parseInt(w.base.slice(1), 16), w.len,
    ])), ROM_OVERLAP_PAIRS);
    assert.equal(ROM_OVERLAP_PAIRS, 77);
    for (const address of [0x2a9e64, 0x2a9e83, 0x2aa003, 0x2aa040]) {
      assert.equal(caught(() => ROM.u8(address))?.romAddress, address);
    }
  });

test('W565 pins gun 3, A4 $E, registrations, and complete scheduler accounting',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM.u32(HIBACHI_A1.alt + 3 * 8), ROM.u32(HIBACHI_A1.alt + 3 * 8 + 4),
    ], [HIBACHI_A1.altGun3Init, HIBACHI_A1.altGun3Step]);
    assert.deepEqual([
      ROM.u32(HIBACHI_A4.table + 0x0e * 8), ROM.u32(HIBACHI_A4.table + 0x0e * 8 + 4),
    ], [HIBACHI_A4.sEInit, HIBACHI_A4.sEStep]);
    assert.deepEqual([
      HIBACHI_A1.altGun3Template, HIBACHI_A1.altGun3Init, HIBACHI_A1.altGun3Step,
      HIBACHI_A1.altGun3Pattern, HIBACHI_A4.sEInit, HIBACHI_A4.sEStep,
    ], [0x2a9e50, 0x2a9e84, 0x2a9eb6, 0x2aa004, 0x2a69d0, 0x2a6a00]);
    assert.equal(IMG.readUInt16BE(0x2a9eb4), 0x4e75, 'A1 init ends separately');
    assert.equal(IMG.readUInt16BE(0x2aa002), 0x4e75, 'gun 3 step ends before pattern data');

    const registered = new Set(scriptAddresses());
    for (const address of [
      HIBACHI_A1.altGun3Init, HIBACHI_A1.altGun3Step, HIBACHI_A4.sEInit, HIBACHI_A4.sEStep,
    ]) assert.ok(registered.has(address), `$${address.toString(16)} is registered`);
    assert.deepEqual(HIBACHI_A1_ALT_SCRIPTS, [0, 1, 2, 3, 4]);
    assert.deepEqual(Object.keys(HIBACHI_A1_ALT_COUNTED).map(Number), []);
    const allA4 = [
      ...HIBACHI_END_SCRIPTS, ...HIBACHI_GUN_A4_SCRIPTS,
      ...Object.keys(HIBACHI_END_COUNTED).map(Number),
    ].sort((a, b) => a - b);
    assert.deepEqual(allA4, Array.from({ length: HIBACHI_A4.pairs }, (_, i) => i),
      'implemented plus counted covers all 21 A4 ids exactly once');
  });

test('W565 gun 3 init copies ten words, applies four ramps, and draws no RNG',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU16(A6 + 0x13e, 2);
    b.ram.setU8(A6 + 0x1d6, 1);
    b.ram.setU8(A6 + 0x1d7, 4);
    b.ram.setU8(RNG.counter, 0x44);
    altGun3Init2A9E84(b.ram, ROM, SCHED.a1Base, A6);
    const expected = Array.from({ length: 10 }, (_, i) =>
      ROM.u16(HIBACHI_A1.altGun3Template + i * 2));
    expected[2] = 0x0404;
    expected[3] = 0x001c;
    expected[4] = u16(expected[4] + 2);
    expected[8] = u16(expected[8] + 2);
    assert.deepEqual(Array.from({ length: 10 }, (_, i) =>
      b.ram.u16(SCHED.a1Base + 0x02 + i * 2)), expected);
    assert.equal(b.ram.u8(RNG.counter), 0x44);

    const scheduled = gunBench();
    installScripts(scheduled.ram, ROM, { a1: HIBACHI_A1.alt });
    scheduled.ram.setU16(SCHED.a1Base, 0x8003);
    runScheduler25962E(scheduled.ram, ROM,
      { bossRec: A5, bossSubRec: A6, ...scheduled.ctx });
    assert.equal(scheduled.ram.u16(SCHED.a1Base), 0x8103);
    assert.equal(scheduled.ram.u8(SCHED.a1Base + 0x02), 0x20,
      'the A1 init rts keeps the step out of its first dispatch');
  });

test('W565 live first tick draws once and fires the negative-X then positive-X pair',
  { skip: SKIP }, () => {
    const b = gunBench();
    seedTarget(b);
    altGun3Init2A9E84(b.ram, ROM, SCHED.a1Base, A6);
    b.ram.setU8(SCHED.a1Base + 0x02, 0);
    b.ram.setU8(RNG.counter, 0);
    altGun3Step2A9EB6(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);

    const random = ROM.u8(RNG_2431F4.table + 1);
    const row = HIBACHI_A1.altGun3Pattern + 0x30;
    const negativeAim = aim256(AIM_TABLES, 0x5940, 0x3300, 0x7000, 0x6000);
    const positiveAim = aim256(AIM_TABLES, 0x5940, 0x4d00, 0x7000, 0x6000);
    assert.equal(b.ram.u8(RNG.counter), 1);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x14), random);
    assert.deepEqual(b.shots.map(([site]) => site), [0x2a9f5c, 0x2a9f78]);
    const records = b.shots.map((entry) => record(b.ram, entry));
    assert.deepEqual(records.map((r) => r.kind), [11, 11]);
    assert.deepEqual(records.map((r) => r.dir), [
      u16(negativeAim + shiftedBias(ROM.u16(row + 4), random)) & 0xff,
      u16(positiveAim + shiftedBias(ROM.u16(row + 10), random)) & 0xff,
    ]);
    assert.deepEqual(records.map((r) => [r.posA, r.posB]), [
      [u16(0x5000 + ROM.u16(row)), u16(0x4000 + ROM.u16(row + 2))],
      [u16(0x5000 + ROM.u16(row + 6)), u16(0x4000 + ROM.u16(row + 8))],
    ]);
    assert.equal(b.ram.u16(SCHED.a1Base + 0x0e), 0x24);
    assert.equal(b.ram.u16(SCHED.a1Base + 0x0a), 0);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x04), 0x1c);
  });

test('W565 both-dead preserves the row but advances draws, counters, ramps, and retirement',
  { skip: SKIP }, () => {
    const dead = gunBench();
    altGun3Init2A9E84(dead.ram, ROM, SCHED.a1Base, A6);
    dead.ram.setU8(SCHED.a1Base + 0x02, 0);
    dead.ram.setU8(RNG.counter, 0x10);
    altGun3Step2A9EB6(dead.ram, ROM, dead.ctx, SCHED.a1Base, A5, A6);
    assert.equal(dead.ram.u8(RNG.counter), 0x11, 'first active tick still consumes $2431F4');
    assert.equal(dead.shots.length, 0);
    assert.equal(dead.ram.u16(SCHED.a1Base + 0x0e), 0x30);
    assert.equal(dead.ram.u16(SCHED.a1Base + 0x0a), 0);
    assert.equal(dead.ram.u8(SCHED.a1Base + 0x04), 0x1c);

    const done = gunBench();
    done.ram.setU16(SCHED.a1Base, 0x8103);
    done.ram.setU16(SCHED.a1Base + SCHED.a1Stride, 0x8103);
    done.ram.setU16(SCHED.a1Base + SCHED.a1Stride * 2, 0x8104);
    altGun3Init2A9E84(done.ram, ROM, SCHED.a1Base, A6);
    done.ram.setU16(SCHED.a1Base, 0x8103);
    done.ram.setU8(SCHED.a1Base + 0x02, 0);
    done.ram.setU8(SCHED.a1Base + 0x04, 0);
    done.ram.setU8(SCHED.a1Base + 0x05, 0x1e);
    done.ram.setU8(SCHED.a1Base + 0x06, 0);
    done.ram.setU8(A6 + 0x1d6, 1);
    done.ram.setU16(A6 + 0x13e, 5);
    done.ram.setU8(A6 + 0x1d7, 0x0c);
    altGun3Step2A9EB6(done.ram, ROM, done.ctx, SCHED.a1Base, A5, A6);
    assert.deepEqual([
      done.ram.u8(A6 + 0x1d6), done.ram.u16(A6 + 0x13e), done.ram.u8(A6 + 0x1d7),
    ], [2, 6, 0x10]);
    assert.equal(done.ram.u8(A5 + 0x03), 1);
    assert.equal(done.ram.u16(SCHED.a1Base), 0);
    assert.equal(done.ram.u16(SCHED.a1Base + SCHED.a1Stride), 0);
    assert.equal(done.ram.u16(SCHED.a1Base + SCHED.a1Stride * 2), 0x8104);
  });

test('W565 gun 3 ignores gun-level freeze and traverses $30,$24,$18,$0C,$00',
  { skip: SKIP }, () => {
    const b = gunBench();
    seedTarget(b);
    altGun3Init2A9E84(b.ram, ROM, SCHED.a1Base, A6);
    b.ram.setU16(HIBACHI_A1.freeze, 1);
    const rows = [];
    for (let i = 0; i < 5; i++) {
      rows.push(b.ram.u16(SCHED.a1Base + 0x0e));
      b.ram.setU8(SCHED.a1Base + 0x02, 0);
      altGun3Step2A9EB6(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
    }
    assert.deepEqual(rows, [0x30, 0x24, 0x18, 0x0c, 0x00]);
    assert.equal(b.ram.u16(SCHED.a1Base + 0x0e), 0x30);
    assert.equal(b.shots.length, 10);
    assert.ok(b.shots.every(([, results]) => results.every((result) => result.declined)));
  });

test('W565 A4 $E guards only its opening timer and remains allocated after enabling damage',
  { skip: SKIP }, () => {
    const direct = new Ram();
    const slot = SCHED.a4Base;
    direct.setU16(slot, 0x810e);
    for (const part of PARTS) direct.setU8(A6 + part + 0x1e, 1);
    sEInit2A69D0(direct, slot, A6);
    assert.deepEqual([direct.u16(slot + 2), direct.u16(slot + 4)], [0x40, 1]);
    assert.deepEqual(PARTS.map((part) => direct.u8(A6 + part + 0x1e)), Array(6).fill(0));
    direct.setU16(HIBACHI_A4.freeze, 1);
    sEStep2A6A00(direct, slot, A6);
    assert.deepEqual([direct.u16(slot + 2), direct.u16(slot + 4)], [0x40, 1]);

    direct.setU16(HIBACHI_A4.freeze, 0);
    direct.setU16(slot + 2, 1);
    direct.setU16(A6 + 0x108, 1);
    sEStep2A6A00(direct, slot, A6);
    assert.equal(direct.u16(SCHED.a1Base), 0x8004);
    assert.deepEqual([direct.u16(slot + 2), direct.u16(slot + 4)], [0, 0]);
    assert.equal(direct.u16(A6 + 0x108), 0);
    assert.equal(direct.u16(slot), 0x810e, 'the interrupt intentionally never frees itself');
    direct.setU16(HIBACHI_A4.freeze, 1);
    sEStep2A6A00(direct, slot, A6);
    assert.equal(direct.u16(slot), 0x810e, 'zero timers are inert even while frozen');

    const scheduled = new Ram();
    scheduled.setU32(A5 + 0x06, A6);
    for (const part of PARTS) scheduled.setU8(A6 + part + 0x1e, 1);
    scheduled.setU16(HIBACHI_A4.freeze, 1);
    installScripts(scheduled, ROM, { a4: HIBACHI_A4.table });
    a4Start25980C(scheduled, 0x0e);
    runScheduler25962E(scheduled, ROM, { bossRec: A5, bossSubRec: A6 });
    assert.equal(scheduled.u16(SCHED.a4Base), 0x810e);
    assert.deepEqual([
      scheduled.u16(SCHED.a4Base + 2), scheduled.u16(SCHED.a4Base + 4),
    ], [0x40, 1], 'the init falls through and the frozen step returns immediately');
  });

test('W565 exact lf73711 replay reaches alternate gun 4 init at lf74078',
  { skip: SKIP_CHECKPOINT }, async () => {
    const exact = await bundle();
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.equal(checkpoint.tablesSha256, CURRENT_HASH);
    const historicalCheckpoint = { ...checkpoint, tablesSha256: FUTURE_HASH };
    const historicalExact = { ...exact, tables: W565_TABLE };
    const { game, probe } = restoreCheckpoint(
      historicalCheckpoint, historicalExact, checkpoint.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 500; attempted++) {
      try {
        game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        game.step(probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    assert.equal(attempted, 368);
    assert.equal(game.logicFrame, 74078);
    assert.equal(error?.romAddress, HIBACHI_A1.altGun4Template);
    assert.equal(ROM.u32(HIBACHI_A1.alt + 4 * 8), HIBACHI_A1.altGun4Init);
    assert.equal(scriptAddresses().includes(HIBACHI_A1.altGun4Init), true);
    assert.equal(caught(() => ROM.u8(HIBACHI_A1.altGun4Template))?.romAddress,
      HIBACHI_A1.altGun4Template,
      'the strict W565 table stops exactly at the W566 gun-4 template seam');
  });
