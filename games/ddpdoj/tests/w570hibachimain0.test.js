// W570: loop-nonzero Hibachi A1 gun 0 and the next exact loop-2 frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RAM, P } from '../src/machine.js';
import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { RNG, RNG_242B3C } from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';
import {
  SCHED, a1Start259A18, installScripts, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import {
  HIBACHI_A1, HIBACHI_A1_COUNTED, HIBACHI_A1_SCRIPTS,
  gun0Init2A738A, gun0Step2A7400,
} from '../src/hibachiguns.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, overlappingPairs, tableBeforeW570,
  tableBeforeW571, tableBeforeW576,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const EXPORTER = here('../tools/export-tables.py');
const ASSETS = here('../assets');
const FRONTIER = here('../probes/checkpoints/ship0-style4-lf00144631.json');
const PERIODIC = here('../probes/checkpoints/ship0-style4-lf00145131.json');
const required = [TABLES, IMAGE, EXPORTER, FRONTIER, PERIODIC,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')];
const SKIP = required.every(existsSync) ? false
  : 'exact W570 image, tables, assets, or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W570_TABLE = SKIP ? null : tableBeforeW571(TABLE_JSON);
const PRIOR_TABLE = SKIP ? null : tableBeforeW570(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const CURRENT_HASH = '8854b7ebbc400795e7bcc7cf401e4f4d762220333ccbc6df9e1cf0c4b5ca5f5f';
const ASSET_TABLE_HASH = 'cdce48388d34b89a09ce5d2b8a21ea7dad807bb1fe42468cf8ff3fe44387f30f';
const TABLE_HASH = '9c9a021c431dce64e533d2678e955743401453abc3404ee514842fa1bd678221';
const PRIOR_HASH = '3c480c86d79e63da7149fbf1ada5a454d4217cb2dffa6e0aab63ecebc94e9717';
const A5 = 0x810c00;
const A6 = 0x814800;
const PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const PRIMARY_SITES = Object.freeze([
  0x2a7468, 0x2a7472, 0x2a747c, 0x2a74ae, 0x2a74b8, 0x2a74e6,
  0x2a7514, 0x2a751e, 0x2a7528, 0x2a755a, 0x2a7564, 0x2a7592,
]);
const WINDOW_SPECS = Object.freeze([
  Object.freeze([0x2a733c, 0x16]), Object.freeze([0x2a7372, 0x18]),
  Object.freeze([0x2a76d6, 0x3c]), Object.freeze([0x2a7712, 0x100]),
]);
const WINDOW_BASES = new Set(WINDOW_SPECS.map(([base]) =>
  `$${base.toString(16).toUpperCase()}`));
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

function record(ram, entry) {
  const address = entry[1][0].addr;
  return {
    kind: ram.u16(address + BREC.typeWord) & 0x3f,
    dir: ram.u8(address + BREC.dir),
    posA: ram.u16(address + BREC.posA),
    posB: ram.u16(address + BREC.posB),
  };
}

function gunBench() {
  const ram = new Ram();
  const shots = [];
  const ctx = { bulletSpawn: (site, result) => shots.push([
    site, result, PARTS.map((part) => ram.u8(A6 + part + 0x1e)),
  ]) };
  ram.setU32(A5 + 0x06, A6);
  return { ram, shots, ctx };
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W570 adds exactly four disjoint gun-0 windows and reconstructs W569',
  { skip: SKIP }, () => {
    assert.equal(ROM_WINDOW_COUNT, 908);
    assert.equal(TABLE_JSON.rom.windows.length, 908);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 453851);
    assert.equal(canonicalHash(TABLE_JSON), CURRENT_HASH);
    assert.equal(W570_TABLE.rom.windows.length, 843);
    assert.equal(W570_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 452313);
    assert.equal(canonicalHash(W570_TABLE), TABLE_HASH,
      'removing the W573, W572, and W571 windows reconstructs W570 byte for byte');
    assert.equal(PRIOR_TABLE.rom.windows.length, 839);
    assert.equal(PRIOR_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 451951);
    assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH,
      'removing only the four W570 windows reconstructs W569 byte for byte');

    const windows = W570_TABLE.rom.windows.filter((w) => WINDOW_BASES.has(w.base));
    assert.deepEqual(windows.map(({ base, len }) => [base, len]), [
      ['$2A733C', 0x16], ['$2A7372', 0x18], ['$2A76D6', 0x3c], ['$2A7712', 0x100],
    ]);
    assert.equal(windows.reduce((n, w) => n + w.len, 0), 0x16a);
    for (let i = 0; i < windows.length; i++) {
      const [base, len] = WINDOW_SPECS[i];
      assert.equal(windows[i].hex, IMG.subarray(base, base + len).toString('hex'));
      assert.match(windows[i].why, /^W570:/);
    }
    assert.equal(overlappingPairs(TABLE_JSON.rom.windows.map((w) => [
      Number.parseInt(w.base.slice(1), 16), w.len,
    ])), 77);
    assert.equal(ROM_OVERLAP_PAIRS, 77);
    assert.equal(0x2a76d6 + 0x3c, 0x2a7712,
      'the six curtain rows abut the complete vector table');

    const exporter = readFileSync(EXPORTER, 'utf8');
    for (const [base, len] of WINDOW_SPECS) {
      const row = `\\(0x${base.toString(16).toUpperCase()}, 0x${len.toString(16)
        .toUpperCase().padStart(4, '0')},`;
      assert.match(exporter, new RegExp(row));
    }
  });

test('W570 pins the main pair, separate dispatch, init ramps, and freeze restart',
  { skip: SKIP }, () => {
    assert.deepEqual([ROM.u32(HIBACHI_A1.main), ROM.u32(HIBACHI_A1.main + 4)],
      [HIBACHI_A1.gun0Init, HIBACHI_A1.gun0Step]);
    assert.equal(ROM.u32(HIBACHI_A1.main + 8), 0x2a7850);
    assert.equal(IMG.readUInt16BE(0x2a73fe), 0x4e75, 'gun 0 init ends in its own rts');
    assert.equal(IMG.readUInt16BE(0x2a76d4), 0x4e75, 'gun 0 step ends before its data');
    assert.ok(scriptAddresses().includes(HIBACHI_A1.gun0Init));
    assert.ok(scriptAddresses().includes(HIBACHI_A1.gun0Step));
    assert.ok(HIBACHI_A1_SCRIPTS.includes(0));
    assert.equal(HIBACHI_A1_COUNTED[0], undefined);

    const ramped = gunBench();
    ramped.ram.setU8(A6 + 0x1c6, 2);
    ramped.ram.setU8(A6 + 0x1c8, 1);
    ramped.ram.setU8(A6 + 0x1c9, 8);
    ramped.ram.setU16(A6 + 0x1ca, 3);
    gun0Init2A738A(ramped.ram, ROM, SCHED.a1Base, A6);
    assert.deepEqual(Array.from({ length: 11 }, (_, i) =>
      ramped.ram.u16(SCHED.a1Base + 2 + i * 2)),
    Array.from({ length: 11 }, (_, i) => ROM.u16(HIBACHI_A1.gun0Template + i * 2))
      .map((word, i) => {
        if (i === 2) return 0x0606;
        if (i === 3) return 0x0438;
        if (i === 4 || i === 6) return 0xfffc;
        return word;
      }));
    assert.deepEqual(Array.from({ length: 6 }, (_, i) =>
      ramped.ram.u8(SCHED.a1Base + 0x1a + i)),
    Array.from({ length: 6 }, (_, i) => IMG[RNG_242B3C.table + i + 1]));
    assert.equal(ramped.ram.u8(RNG.counter), 6);

    const scheduled = gunBench();
    installScripts(scheduled.ram, ROM, { a1: HIBACHI_A1.main });
    assert.equal(a1Start259A18(scheduled.ram, 0), SCHED.a1Base);
    runScheduler25962E(scheduled.ram, ROM, {
      bossRec: A5, bossSubRec: A6, ...scheduled.ctx,
    });
    assert.equal(scheduled.ram.u16(SCHED.a1Base), 0x8100);
    assert.equal(scheduled.ram.u8(SCHED.a1Base + 0x02), 0x20,
      'the init rts keeps the step out of the first dispatch');
    runScheduler25962E(scheduled.ram, ROM, {
      bossRec: A5, bossSubRec: A6, ...scheduled.ctx,
    });
    assert.equal(scheduled.ram.u8(SCHED.a1Base + 0x02), 0x1f);
    assert.equal(scheduled.shots.length, 0);

    scheduled.ram.setU16(HIBACHI_A1.freeze, 1);
    scheduled.ram.setU16(SCHED.a1Base + 0x02, 0xdead);
    const rngBefore = scheduled.ram.u8(RNG.counter);
    gun0Step2A7400(scheduled.ram, ROM, scheduled.ctx, SCHED.a1Base, A5, A6);
    assert.equal(scheduled.ram.u16(SCHED.a1Base + 0x02), ROM.u16(HIBACHI_A1.gun0Template));
    assert.equal(scheduled.ram.u8(RNG.counter), rngBefore + 6);
    assert.equal(scheduled.shots.length, 0, 'freeze reinitializes without firing');
  });

test('W570 fires twelve attachments plus the 54-shot curtain and retires faithfully',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU16(SCHED.a1Base, 0x8100);
    b.ram.setU8(A6 + 0x1c6, 2);
    b.ram.setU8(A6 + 0x1c8, 1);
    b.ram.setU8(A6 + 0x1c9, 8);
    b.ram.setU16(A6 + 0x1ca, 3);
    b.ram.setU16(A6 + 0x1d8, 2);
    const facings = [0x00, 0x01, 0x0f, 0x10, 0x1f, 0x3f];
    PARTS.forEach((part, i) => b.ram.setU16(A6 + part + 0x1a, facings[i]));
    gun0Init2A738A(b.ram, ROM, SCHED.a1Base, A6);
    const firstRandom = PARTS.map((_, i) => b.ram.u8(SCHED.a1Base + 0x1a + i));

    b.ram.setU8(SCHED.a1Base + 0x02, 1);
    gun0Step2A7400(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0);
    assert.equal(b.shots.length, 0, 'a nonzero old cadence byte only decrements');
    b.ram.setU8(SCHED.a1Base + 0x04, 0);
    b.ram.setU8(SCHED.a1Base + 0x06, 0);
    gun0Step2A7400(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);

    assert.equal(b.shots.length, 66, 'twelve attached calls plus six rows of nine');
    assert.deepEqual(b.shots.slice(0, 12).map(([site]) => site), PRIMARY_SITES);
    assert.deepEqual(b.shots.slice(12).map(([site]) => site),
      Array.from({ length: 54 }, (_, i) => [0x2a75e6, 0x2a75dc][i % 9 & 1]),
    'curtain parity follows the inner DBRA counter in every nine-shot row');
    assert.ok(b.shots.every(([, , flags]) => flags.every((value) => value === 1)),
      'all six attachment-active bytes stay set through every spawn');

    const records = b.shots.map((entry) => record(b.ram, entry));
    assert.deepEqual(records.slice(0, 12).map((r) => r.kind), Array(12).fill(7));
    const baseDirs = facings.map((facing, i) => (facing * 4 + firstRandom[i]) & 0xff);
    assert.deepEqual(records.slice(0, 12).map((r) => r.dir), [
      baseDirs[0], (baseDirs[0] + 0x18) & 0xff, (baseDirs[0] - 0x18) & 0xff,
      (baseDirs[1] + 0x0c) & 0xff, (baseDirs[1] - 0x0c) & 0xff,
      baseDirs[2], baseDirs[3], (baseDirs[3] + 0x18) & 0xff,
      (baseDirs[3] - 0x18) & 0xff, (baseDirs[4] + 0x0c) & 0xff,
      (baseDirs[4] - 0x0c) & 0xff, baseDirs[5],
    ]);
    const attachedGroups = [0, 0, 0, 1, 1, 2, 3, 3, 3, 4, 4, 5];
    const attachedDeltas = facings.map((facing, i) =>
      (ROM.u32(HIBACHI_A1.gun0Vectors + facing * 4)
        + ROM.u32(HIBACHI_A1.gun0Muzzles + i * 4)) >>> 0);
    assert.deepEqual(records.slice(0, 12).map(({ posA, posB }) => [posA, posB]),
      attachedGroups.map((group) => [
        (attachedDeltas[group] >>> 16) & 0xffff, attachedDeltas[group] & 0xffff,
      ]));

    const curtainKinds = [];
    const curtainDirs = [];
    for (let row = 0; row < 6; row++) {
      const at = HIBACHI_A1.gun0Curtain + row * 10;
      const first = u16(ROM.u16(at + 4) - 0x20);
      for (let k = 0; k < 9; k++) {
        curtainKinds.push(ROM.u16(at + 2));
        curtainDirs.push((first + k * 8) & 0xff);
      }
    }
    assert.deepEqual(records.slice(12).map((r) => r.kind), curtainKinds);
    assert.deepEqual(records.slice(12).map((r) => r.dir), curtainDirs,
      'curtain angles advance as words but spawn directions keep their low byte');

    assert.deepEqual([
      b.ram.u8(SCHED.a1Base + 0x02), b.ram.u8(SCHED.a1Base + 0x04),
      b.ram.u8(SCHED.a1Base + 0x06), b.ram.u16(SCHED.a1Base + 0x0a),
    ], [0x80, 0x03, 0x06, 0xfffd]);
    assert.deepEqual(PARTS.map((part) => b.ram.u8(A6 + part + 0x1e)), Array(6).fill(0));
    assert.equal(b.ram.u8(A5 + 0x03), 1);
    assert.deepEqual([
      b.ram.u8(A6 + 0x1c6), b.ram.u8(A6 + 0x1c8), b.ram.u8(A6 + 0x1c9),
      b.ram.u16(A6 + 0x1ca), b.ram.u16(A6 + 0x1d8),
    ], [4, 2, 0x10, 4, 3]);
    assert.equal(b.ram.u16(SCHED.a1Base), 0, '$259B08 retires main-table id 0');
    assert.equal(b.ram.u8(RNG.counter), 12);
    assert.deepEqual(PARTS.map((_, i) => b.ram.u8(SCHED.a1Base + 0x1a + i)),
      Array.from({ length: 6 }, (_, i) => IMG[RNG_242B3C.table + 7 + i]));
  });

test('W570 preserves the migrated frontier, checkpoints at 500, and reaches main gun 1',
  { skip: SKIP }, async () => {
    const live = await bundle();
    assert.equal(canonicalHash(live.tables), CURRENT_HASH);
    assert.deepEqual(live.tables, TABLE_JSON);
    const assets = { ...live, tables: tableBeforeW576(TABLE_JSON) };
    assert.equal(canonicalHash(assets.tables), ASSET_TABLE_HASH);
    assert.deepEqual(assets.tables, tableBeforeW576(TABLE_JSON));
    const exact = live;
    const w570Bundle = { ...assets, tables: W570_TABLE };
    const frontier = JSON.parse(readFileSync(FRONTIER, 'utf8'));
    assert.deepEqual([
      frontier.tablesSha256, frontier.frame.logic, frontier.frame.video,
      frontier.raw.stage, frontier.raw.stageX2, frontier.raw.stageX4, frontier.raw.loop,
      frontier.ramSha256, frontier.gameSha256,
    ], [
      TABLE_HASH, 144631, 155220, 4, 8, 16, 1,
      'cb290e6ee0d50a296233a76a7be1a1fc1dea4a10e1c995770a2d3b7a63ba3b15',
      '9340889f30fe7ceaf774fd1c6c5ca2133ab4c5569929d4456aeb73dc479ac6e1',
    ]);
    restoreCheckpoint(frontier, w570Bundle, frontier.selection);
    const historical = { ...exact, tables: PRIOR_TABLE };
    restoreCheckpoint({ ...frontier, tablesSha256: PRIOR_HASH }, historical, frontier.selection);

    const periodic = JSON.parse(readFileSync(PERIODIC, 'utf8'));
    assert.deepEqual([
      periodic.tablesSha256, periodic.frame.logic, periodic.frame.video,
      periodic.raw.stage, periodic.raw.stageX2, periodic.raw.stageX4, periodic.raw.loop,
      periodic.ramSha256, periodic.gameSha256,
    ], [
      TABLE_HASH, 145131, 155720, 4, 8, 16, 1,
      '96fca098a3ed4ce80618ae0f675d8afd2e18442d19574d070ca016924adbf9d9',
      'a4fac661dfc90179650cce42318fb7b46923044d0ef94c97786fad92f7745e99',
    ]);
    restoreCheckpoint(periodic, w570Bundle, periodic.selection);

    const restored = restoreCheckpoint(frontier, w570Bundle, frontier.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 1000; attempted++) {
      try {
        restored.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        restored.game.step(restored.probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    assert.equal(attempted, 839);
    assert.equal(restored.game.logicFrame, 145469);
    assert.equal(restored.game.videoFrame, 156059);
    assert.equal(restored.game.ram.u16(0x813092), 4);
    assert.equal(restored.game.ram.u16(0x813098), 1);
    assert.equal(error?.romAddress, 0x2a7812);
    assert.match(error?.message ?? '', /word at \$2A7812/);
    assert.equal(caught(() => ROM.u8(HIBACHI_A1.gun0Template)), null);
    assert.equal(ROM.u32(HIBACHI_A1.main + 8), HIBACHI_A1.gun1Init);
  });
