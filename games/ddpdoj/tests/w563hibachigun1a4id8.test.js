// W563: HIBACHI LOOP-ZERO GUN 1 AND A4 ID 8.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { defaultHandlers } from '../src/main.js';
import { RAM, P } from '../src/machine.js';
import {
  SCHED, installScripts, a1Start259A18, a4Start25980C,
  runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { AIM, AimTables, aim256 } from '../src/aim.js';
import {
  RNG, RNG_242B3C, RNG_242EC2, RNG_2431F4,
} from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';
import {
  HIBACHI_A4, HIBACHI_END_SCRIPTS,
  s8Init2A6820, s8Step2A6826,
} from '../src/hibachiend.js';
import {
  HIBACHI_A1, HIBACHI_A1_ALT_COUNTED, HIBACHI_A1_ALT_SCRIPTS,
  altGun1Init2A97F4, altGun1Step2A9874,
} from '../src/hibachiguns.js';
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
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00071111.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = existsSync(CHECKPOINT)
  && existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz')) && !SKIP ? false
  : 'exact checkpoint bundle absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));

const WINDOW = SKIP ? null : Object.freeze({
  base: '$2A97B6',
  len: 0x1e,
  why: "W563: loop-zero HIBACHI A1 gun 1's fifteen-word slot template, copied by $2A97F4 moveq #$E plus dbra and ending before its unused self-pointer block",
  hex: IMG.subarray(0x2a97b6, 0x2a97d4).toString('hex'),
});
const POST_W563_BASES = new Set([
  '$2A9A68', '$2A9E50', '$2AA004', '$2AA040',
  '$29139E', '$2902CA', '$2902E2', '$2903E6', '$2903F2', '$29040A', '$29041A',
  '$290442', '$290462', '$29051A', '$29058E', '$2905A2', '$2905CA', '$2906C6',
]);
const W563_TABLE = SKIP ? null : (() => {
  const copy = tableBeforeW569(TABLE_JSON);
  copy.rom.windows = copy.rom.windows.filter((w) => !POST_W563_BASES.has(w.base));
  return copy;
})();
const PRIOR_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(W563_TABLE));
  copy.rom.windows = copy.rom.windows.filter((w) => w.base !== '$2A97B6');
  return copy;
})();
const FUTURE_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(PRIOR_TABLE));
  const after = copy.rom.windows.findIndex((w) => w.base === '$2A96B6');
  assert.notEqual(after, -1, 'the W562 vector predecessor exists');
  copy.rom.windows.splice(after + 1, 0, WINDOW);
  return copy;
})();
const ROM = SKIP ? null : new RomWindows(FUTURE_TABLE.rom);
const AIM_TABLES = SKIP ? null : new AimTables(ROM);
const PRIOR_HASH = 'cb4da240a356def6672b3ae361a61977569f75fb5e1f63a617e2c0f85ce2f019';
const FUTURE_HASH = '80b9cd8d170bb9815e22e379b87587e0c2313d2c76eefa3afc0350606beb1041';
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const A5 = 0x810c00;
const A6 = 0x814800;
const PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const AIM_SITES = Object.freeze([
  0x2a98ee, 0x2a98f6, 0x2a9904, 0x2a990c, 0x2a9916, 0x2a9926, 0x2a992e,
]);
const WING_SITES = Object.freeze([
  0x2a996c, 0x2a997a, 0x2a9988, 0x2a99a0,
  0x2a99b8, 0x2a99c6, 0x2a99d4, 0x2a99e8,
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

function rngIndex(negative) {
  return Array.from({ length: 0xfb }, (_, i) => i)
    .find((i) => ((ROM.u8(RNG_242EC2.table + i) & 0x80) !== 0) === negative);
}

async function bundle() {
  return loadBundle(async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W563 adds only the strict $2A97B6+$1E template window', { skip: SKIP }, () => {
  assert.deepEqual(W563_TABLE, FUTURE_TABLE,
    'removing the later W564-W568 windows reconstructs the strict W563 additive result');
  assert.equal(TABLE_JSON.rom.windows.length, 839);
  assert.equal(PRIOR_TABLE.rom.windows.length, 820);
  assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH);
  assert.equal(W563_TABLE.rom.windows.length, 821);
  assert.equal(canonicalHash(W563_TABLE), FUTURE_HASH);
  assert.equal(W563_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 451565);
  assert.equal(0x2a96b6 + 0x100, 0x2a97b6, 'the window abuts but does not overlap W562');
  assert.equal(overlappingPairs(FUTURE_TABLE.rom.windows.map((w) => [
    Number.parseInt(w.base.slice(1), 16), w.len,
  ])), ROM_OVERLAP_PAIRS);
  assert.equal(ROM_OVERLAP_PAIRS, 77);
  assert.equal(caught(() => ROM.u8(0x2a97d3)), null);
  assert.equal(caught(() => ROM.u8(0x2a97d4))?.romAddress, 0x2a97d4,
    'the eight self-pointers are deliberately outside the strict window');
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => IMG.readUInt32BE(0x2a97d4 + i * 4)),
    Array(8).fill(0x2a97f4));

  const exporter = readFileSync(EXPORT_TABLES, 'utf8');
  assert.equal([...exporter.matchAll(/\(0x2A97B6, 0x001E,/g)].length, 1);
  assert.doesNotMatch(exporter, /\(0x2A97D4,/, 'self-pointer padding is not exported');
});

test('W563 pins both pairs, boundaries, and scheduler registrations', { skip: SKIP }, () => {
  assert.deepEqual([
    ROM.u32(HIBACHI_A1.alt + 8), ROM.u32(HIBACHI_A1.alt + 12),
  ], [HIBACHI_A1.altGun1Init, HIBACHI_A1.altGun1Step]);
  assert.deepEqual([
    ROM.u32(HIBACHI_A4.table + 8 * 8), ROM.u32(HIBACHI_A4.table + 8 * 8 + 4),
  ], [HIBACHI_A4.s8Init, HIBACHI_A4.s8Step]);
  assert.deepEqual([
    HIBACHI_A1.altGun1Init, HIBACHI_A1.altGun1Step,
    HIBACHI_A4.s8Init, HIBACHI_A4.s8Step,
  ], [0x2a97f4, 0x2a9874, 0x2a6820, 0x2a6826]);
  assert.equal(IMG.readUInt16BE(0x2a9872), 0x4e75, 'A1 init has its own rts');
  assert.equal(IMG.readUInt16BE(0x2a9a66), 0x4e75, 'gun 1 code ends before gun 2 data');
  assert.equal(ROM.u32(HIBACHI_A1.alt + 16), 0x2a9aa0, 'alternate gun 2 is next');
  assert.equal(IMG.readUInt16BE(0x2a6856), 0x4e75);
  assert.equal(ROM.u32(HIBACHI_A4.table + 9 * 8), 0x2a6858, 'A4 id 9 is next');

  const registered = new Set(scriptAddresses());
  for (const address of [
    HIBACHI_A1.altGun1Init, HIBACHI_A1.altGun1Step,
    HIBACHI_A4.s8Init, HIBACHI_A4.s8Step,
  ]) assert.ok(registered.has(address), `$${address.toString(16)} is registered`);
  assert.deepEqual(HIBACHI_A1_ALT_SCRIPTS, [0, 1, 2, 3, 4]);
  assert.equal(HIBACHI_A1_ALT_COUNTED[1], undefined);
  assert.equal(HIBACHI_A1_ALT_COUNTED[2], undefined);
  assert.equal(HIBACHI_A1_ALT_COUNTED[3], undefined);
  assert.equal(HIBACHI_A1_ALT_COUNTED[4], undefined);
  assert.deepEqual(Object.keys(HIBACHI_A1_ALT_COUNTED).map(Number), []);
  assert.ok(HIBACHI_END_SCRIPTS.includes(8));
});

test('W563 gun 1 init preserves both RNG branches, locks, ramps, and separate dispatch',
  { skip: SKIP }, () => {
    const positive = gunBench();
    const pos = rngIndex(false);
    positive.ram.setU8(RNG.counter, (pos - 1) & 0xff);
    positive.ram.setU8(A6 + 0x1cc, 0x14);
    positive.ram.setU16(A6 + 0x1ce, 2);
    positive.ram.setU16(A6 + 0x1d0, 3);
    altGun1Init2A97F4(positive.ram, ROM, SCHED.a1Base, A6);
    assert.deepEqual(Array.from({ length: 15 }, (_, i) => positive.ram.u16(SCHED.a1Base + 2 + i * 2)),
      Array.from({ length: 15 }, (_, i) => {
        const value = ROM.u16(HIBACHI_A1.altGun1Template + i * 2);
        if (i === 1) return 0x9f9f;
        if (i === 4) return u16(value + 2);
        if ([6, 8, 10].includes(i)) return u16(value + 3);
        return value;
      }));
    assert.deepEqual([
      positive.ram.u8(SCHED.a1Base + 0x1e), positive.ram.u8(SCHED.a1Base + 0x1f),
    ], [6, 0xfa]);
    assert.deepEqual(PARTS.map((part) => positive.ram.u8(A6 + part + 0x1e)), Array(6).fill(1));
    assert.equal(positive.ram.u8(RNG.counter), pos, 'positive init arm consumes one draw');

    const negative = gunBench();
    const neg = rngIndex(true);
    negative.ram.setU8(RNG.counter, (neg - 1) & 0xff);
    altGun1Init2A97F4(negative.ram, ROM, SCHED.a1Base, A6);
    const r1 = ROM.u8(RNG_2431F4.table + ((neg + 1) & 0x3f));
    const r2 = ROM.u8(RNG_2431F4.table + ((neg + 2) & 0x3f));
    assert.deepEqual([
      negative.ram.u8(SCHED.a1Base + 0x1e), negative.ram.u8(SCHED.a1Base + 0x1f),
    ], [u16(-6 + r1) & 0xff, u16(6 + r2) & 0xff]);
    assert.equal(negative.ram.u8(RNG.counter), (neg + 2) & 0xff,
      'negative init arm consumes the sign draw and two independent $2431F4 draws');

    const scheduled = gunBench();
    scheduled.ram.setU8(RNG.counter, (pos - 1) & 0xff);
    installScripts(scheduled.ram, ROM, { a1: HIBACHI_A1.alt });
    assert.equal(a1Start259A18(scheduled.ram, 1), SCHED.a1Base);
    runScheduler25962E(scheduled.ram, ROM, { bossRec: A5, bossSubRec: A6, ...scheduled.ctx });
    assert.equal(scheduled.ram.u16(SCHED.a1Base), 0x8101);
    assert.equal(scheduled.ram.u8(SCHED.a1Base + 2), 0x70,
      'the init rts keeps the step out of the first A1 dispatch');
    scheduled.ram.setU16(HIBACHI_A1.freeze, 1);
    runScheduler25962E(scheduled.ram, ROM, { bossRec: A5, bossSubRec: A6, ...scheduled.ctx });
    assert.equal(scheduled.ram.u8(SCHED.a1Base + 2), 0x6f,
      'the next dispatch decrements even while the freeze word is set');
  });

test('W563 gun 1 seeds and advances the intentionally asymmetric mirrored wings',
  { skip: SKIP }, () => {
    const b = gunBench();
    const pos = rngIndex(false);
    b.ram.setU8(RNG.counter, (pos - 1) & 0xff);
    b.ram.setU16(A6 + 0x02, 0x4000);
    b.ram.setU16(A6 + 0x04, 0x5000);
    altGun1Init2A97F4(b.ram, ROM, SCHED.a1Base, A6);
    b.ram.setU8(SCHED.a1Base + 0x02, 0);
    b.ram.setU16(HIBACHI_A1.altCadenceRank, 0x0010);
    altGun1Step2A9874(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);

    assert.deepEqual(b.shots.map(([site]) => site), WING_SITES);
    const records = b.shots.map((shot) => record(b.ram, shot));
    assert.deepEqual(records.map((r) => r.kind), [4, 5, 6, 3, 4, 5, 6, 3]);
    assert.deepEqual(records.map((r) => r.dir), [
      0x44, 0x64, 0xc4, 0xe4,
      0x3c, 0x5c, 0xbc, 0xbc,
    ], 'the second optional shot repeats M+$80 instead of mirroring H+$A0');
    assert.deepEqual(records.map(({ posA, posB }) => [posA, posB]), [
      [0x32c0, 0x4c00], [0x32c0, 0x4c00], [0x32c0, 0x4c00], [0x32c0, 0x4c00],
      [0x32c0, 0x5400], [0x32c0, 0x5400], [0x32c0, 0x5400], [0x32c0, 0x5400],
    ], 'move.w #$0400 preserves D3 high word $F2C0 on the second side');
    assert.deepEqual([
      b.ram.u8(SCHED.a1Base + 0x02), b.ram.u8(SCHED.a1Base + 0x04),
      b.ram.u8(SCHED.a1Base + 0x08), b.ram.u8(SCHED.a1Base + 0x09),
    ], [3, 0x8a, 0x4a, 0x36]);
    assert.deepEqual(PARTS.map((part) => b.ram.u8(A6 + part + 0x1e)), Array(6).fill(1));
  });

test('W563 periodic aim, dead-player skip, no-freeze cadence, and retirement are exact',
  { skip: SKIP }, () => {
    const live = gunBench();
    const pos = rngIndex(false);
    live.ram.setU8(RNG.counter, (pos - 1) & 0xff);
    live.ram.setU16(A6 + 0x02, 0x5000);
    live.ram.setU16(A6 + 0x04, 0x3000);
    altGun1Init2A97F4(live.ram, ROM, SCHED.a1Base, A6);
    live.ram.setU8(SCHED.a1Base + 0x02, 0);
    live.ram.setU8(SCHED.a1Base + 0x04, 0x80);
    live.ram.setU8(SCHED.a1Base + 0x08, 0x20);
    live.ram.setU8(SCHED.a1Base + 0x09, 0xa0);
    live.ram.setU8(A5 + 0x03, 1);
    live.ram.setU16(AIM.selP1, 0x8000);
    live.ram.setU16(AIM.selP1 + 2, 0x4200);
    live.ram.setU16(AIM.selP1 + 4, 0x2800);
    live.ram.setU16(AIM.selP2, 0, 'the selected dead P2 falls back to live P1');
    const jitterIndex = 0x21;
    live.ram.setU8(RNG.counter, (jitterIndex - 1) & 0xff);
    const center = u16(aim256(AIM_TABLES, 0x40c0, 0x3000, 0x4200, 0x2800)
      + (i8(ROM.u8(RNG_242B3C.table + jitterIndex)) >> 1)) & 0xff;
    altGun1Step2A9874(live.ram, ROM, live.ctx, SCHED.a1Base, A5, A6);
    assert.deepEqual(live.shots.map(([site]) => site), [
      ...AIM_SITES, 0x2a996c, 0x2a997a, 0x2a9988, 0x2a99b8, 0x2a99c6, 0x2a99d4,
    ]);
    assert.deepEqual(live.shots.slice(0, 7).map((shot) => record(live.ram, shot).dir),
      [-3, 3, 0, -6, 6, -3, 3].map((off) => u16(center + off) & 0xff));
    assert.equal(live.ram.u8(A5 + 3), 0, 'the aimed accent toggles the selected player once');
    assert.equal(live.ram.u8(RNG.counter), jitterIndex);
    assert.deepEqual([
      live.ram.u8(SCHED.a1Base + 8), live.ram.u8(SCHED.a1Base + 9),
    ], [0x26, 0x9a], 'the ephemeral aim does not replace either locked moving heading');

    const frozen = gunBench();
    frozen.ram.setU8(RNG.counter, (pos - 1) & 0xff);
    altGun1Init2A97F4(frozen.ram, ROM, SCHED.a1Base, A6);
    frozen.ram.setU8(SCHED.a1Base + 2, 0);
    frozen.ram.setU8(SCHED.a1Base + 4, 2);
    frozen.ram.setU8(SCHED.a1Base + 8, 0x10);
    frozen.ram.setU8(SCHED.a1Base + 9, 0x90);
    frozen.ram.setU16(HIBACHI_A1.freeze, 1);
    altGun1Step2A9874(frozen.ram, ROM, frozen.ctx, SCHED.a1Base, A5, A6);
    assert.equal(frozen.shots.length, 6, 'the gun makes all calls while the core declines them');
    assert.ok(frozen.shots.every(([, results]) => results.every((r) => r.declined)));
    assert.deepEqual([
      frozen.ram.u8(SCHED.a1Base + 4), frozen.ram.u8(SCHED.a1Base + 8),
      frozen.ram.u8(SCHED.a1Base + 9),
    ], [1, 0x16, 0x8a]);

    const dead = gunBench();
    dead.ram.setU8(RNG.counter, (pos - 1) & 0xff);
    dead.ram.setU16(SCHED.a1Base, 0x8101);
    dead.ram.setU16(SCHED.a1Base + SCHED.a1Stride, 0x8101);
    dead.ram.setU16(SCHED.a1Base + SCHED.a1Stride * 2, 0x8102);
    dead.ram.setU8(A6 + 0x1cc, 0x28);
    dead.ram.setU16(A6 + 0x1ce, 7);
    dead.ram.setU16(A6 + 0x1d0, 0x19);
    altGun1Init2A97F4(dead.ram, ROM, SCHED.a1Base, A6);
    dead.ram.setU16(SCHED.a1Base, 0x8101);
    dead.ram.setU8(SCHED.a1Base + 2, 0);
    dead.ram.setU8(SCHED.a1Base + 4, 0);
    dead.ram.setU8(SCHED.a1Base + 8, 0x31);
    dead.ram.setU8(SCHED.a1Base + 9, 0x72);
    const beforeRng = dead.ram.u8(RNG.counter);
    altGun1Step2A9874(dead.ram, ROM, dead.ctx, SCHED.a1Base, A5, A6);
    assert.equal(dead.shots.length, 0);
    assert.equal(dead.ram.u8(RNG.counter), beforeRng, 'both-dead periodic arm skips its jitter draw');
    assert.deepEqual(PARTS.map((part) => dead.ram.u8(A6 + part + 0x1e)), Array(6).fill(0));
    assert.deepEqual([
      dead.ram.u8(A6 + 0x1cc), dead.ram.u16(A6 + 0x1ce), dead.ram.u16(A6 + 0x1d0),
    ], [0x3c, 8, 0x1a]);
    assert.equal(dead.ram.u16(SCHED.a1Base), 0);
    assert.equal(dead.ram.u16(SCHED.a1Base + SCHED.a1Stride), 0,
      '$259B08 clears every id-1 A1 slot');
    assert.equal(dead.ram.u16(SCHED.a1Base + SCHED.a1Stride * 2), 0x8102);
  });

test('W563 A4 id 8 pauses, starts gun 2, waits, hands to id 9, and falls through',
  { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a1: HIBACHI_A1.alt, a4: HIBACHI_A4.table });
    const current = SCHED.a4Base;
    const next = current + SCHED.a4Stride;
    ram.setU16(current, 0x8108);
    s8Init2A6820(ram, current);
    ram.setU16(HIBACHI_A4.freeze, 1);
    s8Step2A6826(ram, current);
    assert.equal(ram.u16(current + 2), 0x60);
    ram.setU16(HIBACHI_A4.freeze, 0);
    ram.setU16(current + 2, 1);
    s8Step2A6826(ram, current);
    assert.equal(ram.u16(SCHED.a1Base), 0x8002);
    assert.equal(ram.u16(current), 0x8108);
    ram.setU16(SCHED.a1Base, 0);
    s8Step2A6826(ram, current);
    assert.equal(ram.u16(current), 0);
    assert.equal(ram.u16(next), 0x8009, 'id 9 starts before id 8 clears itself');

    const fallthrough = new Ram();
    installScripts(fallthrough, ROM, { a4: HIBACHI_A4.table });
    a4Start25980C(fallthrough, 8);
    runScheduler25962E(fallthrough, ROM, {});
    assert.equal(fallthrough.u16(SCHED.a4Base), 0x8108);
    assert.equal(fallthrough.u16(SCHED.a4Base + 2), 0x005f,
      'the init and first delay decrement share one A4 dispatch');
  });

test('W563 future-window checkpoint reaches alternate gun 2 next',
  { skip: SKIP_CHECKPOINT }, async () => {
    const exact = await bundle();
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    const checkpointExact = { ...exact, tables: W563_TABLE };
    const { game } = restoreCheckpoint(checkpoint, checkpointExact, checkpoint.selection);
    game.rom = ROM;
    game.tables = new MoveTables(FUTURE_TABLE, ROM);
    game.handlers = defaultHandlers(ROM, game.vram, { mutate: game.bgMutate });
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 5000; attempted++) {
      try {
        game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        game.step(checkpoint.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    assert.equal(attempted, 1601);
    assert.equal(game.logicFrame, 72711);
    assert.equal(error?.romAddress, 0x2a9a68);
    assert.equal(ROM.u32(HIBACHI_A1.alt + 16), HIBACHI_A1.altGun2Init);
    assert.equal(scriptAddresses().includes(HIBACHI_A1.altGun2Init), true);
    assert.equal(caught(() => ROM.u8(HIBACHI_A1.altGun2Template))?.romAddress,
      HIBACHI_A1.altGun2Template,
      'the strict W563 table stops exactly at the W564 gun-2 template seam');
  });
