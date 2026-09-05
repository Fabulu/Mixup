// W562: HIBACHI LOOP-ZERO GUN 0, A3 ID 2, AND A4 ID 7.

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
  SCHED, installScripts, a1Start259A18, a3Start259962, a4Start25980C,
  runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { AIM, AimTables, aim64, slew64 } from '../src/aim.js';
import { RNG, RNG_242B3C } from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';
import {
  HIBACHI_A3, HIBACHI_A4, HIBACHI_END_SCRIPTS,
  a3s2Step2A5534, s7Init2A67E8, s7Step2A67EE,
} from '../src/hibachiend.js';
import {
  HIBACHI_A1, HIBACHI_A1_ALT_COUNTED, HIBACHI_A1_ALT_SCRIPTS,
  altGun0Init2A9366, altGun0Step2A93DC,
} from '../src/hibachiguns.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, overlappingPairs, tableBeforeW569,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const EXPORT_TABLES = here('../tools/export-tables.py');
const EXPORT_WEB = here('../tools/export-web.mjs');
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

const WINDOW_SPECS = Object.freeze([
  Object.freeze([0x2a9318, 0x16,
    "W562: loop-zero HIBACHI A1 gun 0's eleven-word slot template, copied by $2A9366 moveq #$A plus dbra and ending before its unused self-pointer block"]),
  Object.freeze([0x2a934e, 0x18,
    "W562: loop-zero HIBACHI A1 gun 0's six attached-position longwords, walked once by $2A940E through $2A9540 and ending at the gun init $2A9366"]),
  Object.freeze([0x2a967a, 0x3c,
    "W562: loop-zero HIBACHI A1 gun 0's six ten-byte burst rows, bounded by $2A9566 moveq #$5 and the vector table beginning exactly at $2A96B6"]),
  Object.freeze([0x2a96b6, 0x100,
    "W562: loop-zero HIBACHI A1 gun 0's complete 64-longword attached vector table, indexed by a facing byte multiplied by four at all six firing groups"]),
]);
const WINDOW_BASES = new Set(WINDOW_SPECS.map(([base]) => `$${base.toString(16).toUpperCase()}`));
const W562_WINDOWS = SKIP ? null : WINDOW_SPECS.map(([base, len, why]) => Object.freeze({
  base: `$${base.toString(16).toUpperCase()}`,
  len, why, hex: IMG.subarray(base, base + len).toString('hex'),
}));
const W568_BASES = [
  '$29139E', '$2902CA', '$2902E2', '$2903E6', '$2903F2', '$29040A', '$29041A',
  '$290442', '$290462', '$29051A', '$29058E', '$2905A2', '$2905CA', '$2906C6',
];
const POST_W562_BASES = new Set([
  '$2A97B6', '$2A9A68', '$2A9E50', '$2AA004', '$2AA040', ...W568_BASES,
]);
const POST_W563_BASES = new Set([
  '$2A9A68', '$2A9E50', '$2AA004', '$2AA040', ...W568_BASES,
]);
const CHECKPOINT_TABLE = SKIP ? null : (() => {
  const copy = tableBeforeW569(TABLE_JSON, { preserveW623: true });
  copy.rom.windows = copy.rom.windows.filter((w) => !POST_W563_BASES.has(w.base));
  return copy;
})();
const W562_TABLE = SKIP ? null : (() => {
  const copy = tableBeforeW569(TABLE_JSON, { preserveW623: true });
  copy.rom.windows = copy.rom.windows.filter((w) => !POST_W562_BASES.has(w.base));
  return copy;
})();
const PRIOR_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(W562_TABLE));
  copy.rom.windows = copy.rom.windows.filter((w) => !WINDOW_BASES.has(w.base));
  return copy;
})();
const FUTURE_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(PRIOR_TABLE));
  const after = copy.rom.windows.findIndex((w) => w.base === '$2A6788');
  assert.notEqual(after, -1, 'W552 predecessor window exists');
  copy.rom.windows.splice(after + 1, 0, ...W562_WINDOWS);
  return copy;
})();
const ROM = SKIP ? null : new RomWindows(FUTURE_TABLE.rom);
const AIM_TABLES = SKIP ? null : new AimTables(ROM);
const A5 = 0x810c00;
const A6 = 0x814800;
const PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const CALL_SITES = Object.freeze([
  0x2a943a, 0x2a9444, 0x2a944e, 0x2a947c,
  0x2a94aa, 0x2a94d8, 0x2a94e2, 0x2a94ec,
  0x2a951a, 0x2a9548,
]);
const PRIOR_HASH = 'adb6db31702dd828633ae0640a16e5d04ae44751f07120b4b5bacb314f6fea41';
const FUTURE_HASH = '30fc85c4df8009c377c2a2e738746a2523f6ab2907bce752cb58d65e091e9366';
const CHECKPOINT_TABLE_HASH = '6d3d2c3fca7badac4d1e29fda4095563a1e67352a27a1272e21c698df52a394e';
const STORED_PRIOR_HASH = 'd55cfe3af945d92941c3b4b397cf52d11c864513cfb43a2502cc38f348ea6694';
const STORED_FUTURE_HASH = 'cb4da240a356def6672b3ae361a61977569f75fb5e1f63a617e2c0f85ce2f019';
const STORED_CHECKPOINT_TABLE_HASH =
  '80b9cd8d170bb9815e22e379b87587e0c2313d2c76eefa3afc0350606beb1041';
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const beU16 = (address) => IMG.readUInt16BE(address);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};
const record = (ram, entry) => {
  const address = entry[1][0].addr;
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
  const ctx = { bulletSpawn: (site, result) => shots.push([
    site, result, PARTS.map((part) => ram.u8(A6 + part + 0x1e)),
  ]) };
  ram.setU32(A5 + 0x06, A6);
  return { ram, shots, ctx };
}

function a3Bench() {
  const ram = new Ram();
  ram.setU32(A5 + 0x06, A6);
  installScripts(ram, ROM, { a3: HIBACHI_A3.table });
  return { ram, ctx: { bossRec: A5, bossSubRec: A6 } };
}

async function bundle() {
  return loadBundle(async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W562 is exactly four disjoint additive windows and $16A bytes', { skip: SKIP }, () => {
  assert.deepEqual(W562_TABLE, FUTURE_TABLE,
    'removing the later W563-W568 windows reconstructs the exact W562 additive result');
  assert.equal(TABLE_JSON.rom.windows.length, ROM_WINDOW_COUNT);
  assert.equal(ROM_WINDOW_COUNT, 1706);
  assert.equal(W562_TABLE.rom.windows.length, 821);
  assert.equal(canonicalHash(W562_TABLE), FUTURE_HASH,
    'the adopted reconstruction has the exact W562 identity');
  const storedW562 = JSON.parse(JSON.stringify(W562_TABLE));
  storedW562.rom.windows = storedW562.rom.windows.filter((w) => w.base !== '$259512');
  assert.deepEqual([
    storedW562.rom.windows.length,
    storedW562.rom.windows.reduce((n, w) => n + w.len, 0),
    canonicalHash(storedW562),
  ], [820, 451535, STORED_FUTURE_HASH],
    'W623-W627 live windows do not alter the stored historical reconstructed wave table');
  assert.equal(PRIOR_TABLE.rom.windows.length, 817);
  assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH);
  const storedPrior = JSON.parse(JSON.stringify(PRIOR_TABLE));
  storedPrior.rom.windows = storedPrior.rom.windows.filter((w) => w.base !== '$259512');
  assert.deepEqual([storedPrior.rom.windows.length, canonicalHash(storedPrior)],
    [816, STORED_PRIOR_HASH],
    'removing only the adopted W623 route window recovers the stored prior identity');
  assert.equal(FUTURE_TABLE.rom.windows.length, 821);
  assert.equal(canonicalHash(FUTURE_TABLE), FUTURE_HASH);
  assert.equal(W562_WINDOWS.reduce((n, w) => n + w.len, 0), 0x16a);
  assert.equal(FUTURE_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 451543);
  assert.deepEqual(W562_WINDOWS.map(({ base, len }) => [base, len]), [
    ['$2A9318', 0x16], ['$2A934E', 0x18], ['$2A967A', 0x3c], ['$2A96B6', 0x100],
  ]);

  const stripped = JSON.parse(JSON.stringify(FUTURE_TABLE));
  const removed = stripped.rom.windows.filter((w) => WINDOW_BASES.has(w.base));
  stripped.rom.windows = stripped.rom.windows.filter((w) => !WINDOW_BASES.has(w.base));
  assert.deepEqual(removed, W562_WINDOWS);
  assert.deepEqual(stripped, PRIOR_TABLE,
    'removing only the four W562 windows reconstructs the prior table byte for byte');
  assert.equal(overlappingPairs(FUTURE_TABLE.rom.windows.map((w) => [
    Number.parseInt(w.base.slice(1), 16), w.len,
  ])), 77, 'all four W562 windows are disjoint');
  assert.equal(ROM_OVERLAP_PAIRS, 79, 'the live table includes two later shared overlaps');
  assert.equal(0x2a967a + 0x3c, 0x2a96b6, 'the burst rows abut the vector table');

  const exporter = readFileSync(EXPORT_TABLES, 'utf8');
  for (const [base, len] of WINDOW_SPECS) {
    assert.match(exporter, new RegExp(`\\(0x${base.toString(16).toUpperCase()}, 0x${len.toString(16).toUpperCase().padStart(4, '0')},`));
  }
  const web = readFileSync(EXPORT_WEB, 'utf8');
  assert.match(web, /THE ENEMY BULLETS: the mask ROM/,
    'gun 0 uses the already complete generic enemy-bullet shard');
  assert.match(web, /Hibachi A2 objects 3 through 8, 64 selector frames/,
    'A3 id 2 only turns already harvested Hibachi parts');
});

test('W562 pins all three exact pairs, boundaries, and registrations', { skip: SKIP }, () => {
  assert.deepEqual([
    ROM.u32(HIBACHI_A1.alt), ROM.u32(HIBACHI_A1.alt + 4),
  ], [HIBACHI_A1.altGun0Init, HIBACHI_A1.altGun0Step]);
  assert.deepEqual([
    ROM.u32(HIBACHI_A3.table + 2 * 8), ROM.u32(HIBACHI_A3.table + 2 * 8 + 4),
  ], [HIBACHI_A3.s2Init, HIBACHI_A3.s2Step]);
  assert.deepEqual([
    ROM.u32(HIBACHI_A4.table + 7 * 8), ROM.u32(HIBACHI_A4.table + 7 * 8 + 4),
  ], [HIBACHI_A4.s7Init, HIBACHI_A4.s7Step]);
  assert.deepEqual([
    HIBACHI_A1.altGun0Init, HIBACHI_A1.altGun0Step,
    HIBACHI_A3.s2Init, HIBACHI_A3.s2Step,
    HIBACHI_A4.s7Init, HIBACHI_A4.s7Step,
  ], [0x2a9366, 0x2a93dc, 0x2a552e, 0x2a5534, 0x2a67e8, 0x2a67ee]);

  assert.equal(beU16(0x2a93da), 0x4e75, 'A1 init has its own rts');
  assert.equal(beU16(0x2a9678), 0x4e75, 'A1 step ends before its burst rows');
  assert.equal(ROM.u32(HIBACHI_A1.alt + 8), 0x2a97f4, 'alt gun 1 is the next pair');
  assert.equal(beU16(0x2a552e), 0x397c);
  assert.equal(beU16(0x2a56a0), 0x4e75);
  assert.equal(ROM.u32(HIBACHI_A3.table + 3 * 8), 0x2a56a2);
  assert.equal(beU16(0x2a67e8), 0x397c);
  assert.equal(beU16(0x2a681e), 0x4e75);
  assert.equal(ROM.u32(HIBACHI_A4.table + 8 * 8), 0x2a6820);

  const registered = new Set(scriptAddresses());
  for (const address of [
    HIBACHI_A1.altGun0Init, HIBACHI_A1.altGun0Step,
    HIBACHI_A3.s2Init, HIBACHI_A3.s2Step,
    HIBACHI_A4.s7Init, HIBACHI_A4.s7Step,
  ]) assert.ok(registered.has(address), `$${address.toString(16)} is registered`);
  assert.deepEqual(HIBACHI_A1_ALT_SCRIPTS, [0, 1, 2, 3, 4]);
  assert.equal(HIBACHI_A1_ALT_COUNTED[0], undefined);
  assert.equal(HIBACHI_A1_ALT_COUNTED[1], undefined);
  assert.equal(HIBACHI_A1_ALT_COUNTED[2], undefined);
  assert.equal(HIBACHI_A1_ALT_COUNTED[3], undefined);
  assert.equal(HIBACHI_A1_ALT_COUNTED[4], undefined);
  assert.equal(HIBACHI_A1_ALT_SCRIPTS.length + Object.keys(HIBACHI_A1_ALT_COUNTED).length, 5,
    'implemented plus counted reconstructs all five alt-only ids');
  assert.ok(HIBACHI_END_SCRIPTS.includes(7));
  assert.ok(HIBACHI_END_SCRIPTS.includes(8));

  assert.equal(W562_WINDOWS[0].hex, IMG.subarray(0x2a9318, 0x2a932e).toString('hex'));
  assert.equal(W562_WINDOWS[1].hex, IMG.subarray(0x2a934e, 0x2a9366).toString('hex'));
  assert.equal(W562_WINDOWS[2].hex, IMG.subarray(0x2a967a, 0x2a96b6).toString('hex'));
  assert.equal(W562_WINDOWS[3].hex, IMG.subarray(0x2a96b6, 0x2a97b6).toString('hex'));
});

test('W562 gun 0 init copies eleven words, draws six bytes, and applies five ramps',
  { skip: SKIP }, () => {
    const plain = gunBench();
    altGun0Init2A9366(plain.ram, ROM, SCHED.a1Base, A6);
    assert.deepEqual(Array.from({ length: 11 }, (_, i) => plain.ram.u16(SCHED.a1Base + 2 + i * 2)),
      Array.from({ length: 11 }, (_, i) => ROM.u16(HIBACHI_A1.altGun0Template + i * 2)));
    assert.deepEqual(Array.from({ length: 6 }, (_, i) => plain.ram.u8(SCHED.a1Base + 0x1a + i)),
      Array.from({ length: 6 }, (_, i) => IMG[RNG_242B3C.table + i + 1]));
    assert.equal(plain.ram.u8(RNG.counter), 6, 'six $242B3C draws share the cartridge counter');

    const ramped = gunBench();
    ramped.ram.setU8(A6 + 0x1c6, 2);
    ramped.ram.setU8(A6 + 0x1c8, 1);
    ramped.ram.setU8(A6 + 0x1c9, 8);
    ramped.ram.setU16(A6 + 0x1ca, 3);
    altGun0Init2A9366(ramped.ram, ROM, SCHED.a1Base, A6);
    assert.deepEqual([
      ramped.ram.u8(SCHED.a1Base + 0x06), ramped.ram.u8(SCHED.a1Base + 0x07),
      ramped.ram.u8(SCHED.a1Base + 0x08), ramped.ram.u8(SCHED.a1Base + 0x09),
      ramped.ram.u16(SCHED.a1Base + 0x0a), ramped.ram.u16(SCHED.a1Base + 0x0e),
    ], [8, 8, 3, 0x38, 0xfffe, 0xfffe]);

    const scheduled = gunBench();
    installScripts(scheduled.ram, ROM, { a1: HIBACHI_A1.alt });
    assert.equal(a1Start259A18(scheduled.ram, 0), SCHED.a1Base);
    runScheduler25962E(scheduled.ram, ROM, { bossRec: A5, bossSubRec: A6,
      ...scheduled.ctx });
    assert.equal(scheduled.ram.u16(SCHED.a1Base), 0x8100);
    assert.equal(scheduled.ram.u8(SCHED.a1Base + 0x02), 0x20,
      'the init rts keeps the separately registered step out of the same dispatch');
    runScheduler25962E(scheduled.ram, ROM, { bossRec: A5, bossSubRec: A6,
      ...scheduled.ctx });
    assert.equal(scheduled.ram.u8(SCHED.a1Base + 0x02), 0x1f,
      'the next scheduler dispatch reaches the step');
  });

test('W562 gun 0 fires ten attachments plus the 42-shot burst and retires faithfully',
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
    altGun0Init2A9366(b.ram, ROM, SCHED.a1Base, A6);
    const firstRandom = PARTS.map((_, i) => b.ram.u8(SCHED.a1Base + 0x1a + i));

    altGun0Step2A93DC(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0x1f);
    assert.equal(b.shots.length, 0, 'a nonzero old cadence byte only decrements');
    b.ram.setU8(SCHED.a1Base + 0x02, 0);
    b.ram.setU8(SCHED.a1Base + 0x04, 0);
    b.ram.setU8(SCHED.a1Base + 0x06, 0);
    altGun0Step2A93DC(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);

    assert.equal(b.shots.length, 52, 'ten attached calls plus six rows of seven');
    assert.deepEqual(b.shots.slice(0, 8).map(([site]) => site), [
      0x2a943a, 0x2a9444, 0x2a944e, 0x2a947c,
      0x2a94aa, 0x2a94d8, 0x2a94e2, 0x2a94ec,
    ]);
    assert.deepEqual(b.shots.slice(8, 10).map(([site]) => site), CALL_SITES.slice(8));
    assert.ok(b.shots.slice(10).every(([site]) => site === 0x2a958a));
    assert.ok(b.shots.every(([, , flags]) => flags.every((value) => value === 1)),
      'all six attachment-active bytes are set before every spawn call');

    const records = b.shots.map((entry) => record(b.ram, entry));
    assert.deepEqual(records.slice(0, 10).map((r) => r.kind), Array(10).fill(7));
    const baseDirs = facings.map((facing, i) => (facing * 4 + firstRandom[i]) & 0xff);
    assert.deepEqual(records.slice(0, 10).map((r) => r.dir), [
      baseDirs[0], (baseDirs[0] + 0x18) & 0xff, (baseDirs[0] - 0x18) & 0xff,
      baseDirs[1], baseDirs[2],
      baseDirs[3], (baseDirs[3] + 0x18) & 0xff, (baseDirs[3] - 0x18) & 0xff,
      baseDirs[4], baseDirs[5],
    ]);
    const attachedGroups = [0, 0, 0, 1, 2, 3, 3, 3, 4, 5];
    const attachedDeltas = facings.map((facing, i) =>
      (ROM.u32(HIBACHI_A1.altGun0Vectors + facing * 4)
        + ROM.u32(HIBACHI_A1.altGun0Muzzles + i * 4)) >>> 0);
    assert.deepEqual(records.slice(0, 10).map(({ posA, posB }) => [posA, posB]),
      attachedGroups.map((group) => [
        (attachedDeltas[group] >>> 16) & 0xffff, attachedDeltas[group] & 0xffff,
      ]), 'facing times four selects the new vector table before adding each muzzle longword');

    const burstKinds = [];
    const burstDirs = [];
    for (let row = 0; row < 6; row++) {
      const at = HIBACHI_A1.altGun0Burst + row * 10;
      const first = u16(ROM.u16(at + 4) - 0x18);
      for (let k = 0; k < 7; k++) {
        burstKinds.push(ROM.u16(at + 2));
        burstDirs.push((first + k * 8) & 0xff);
      }
    }
    assert.deepEqual(records.slice(10).map((r) => r.kind), burstKinds);
    assert.deepEqual(records.slice(10).map((r) => r.dir), burstDirs);
    assert.ok(records.some((r) => r.posA !== b.ram.u16(A6 + 0x02)
      || r.posB !== b.ram.u16(A6 + 0x04)),
    'the new attached-vector and muzzle windows affect spawn positions');

    assert.deepEqual([
      b.ram.u8(SCHED.a1Base + 0x02), b.ram.u8(SCHED.a1Base + 0x04),
      b.ram.u8(SCHED.a1Base + 0x06), b.ram.u16(SCHED.a1Base + 0x0a),
    ], [0x80, 0x02, 0x08, 0xffff], 'both reloads and the signed speed-bias step land');
    assert.deepEqual(PARTS.map((part) => b.ram.u8(A6 + part + 0x1e)), Array(6).fill(0));
    assert.equal(b.ram.u8(A5 + 0x03), 1, 'the magazine rollover toggles the target once');
    assert.deepEqual([
      b.ram.u8(A6 + 0x1c6), b.ram.u8(A6 + 0x1c8), b.ram.u8(A6 + 0x1c9),
      b.ram.u16(A6 + 0x1ca), b.ram.u16(A6 + 0x1d8),
    ], [4, 2, 0x10, 4, 4]);
    assert.equal(b.ram.u16(SCHED.a1Base), 0, '$259B08 retires alternate-table id 0');
    assert.equal(b.ram.u8(RNG.counter), 12, 'six fresh random bytes follow the magazine reload');
    assert.deepEqual(PARTS.map((_, i) => b.ram.u8(SCHED.a1Base + 0x1a + i)),
      Array.from({ length: 6 }, (_, i) => IMG[RNG_242B3C.table + 7 + i]));
  });

test('W562 A3 id 2 falls through, aims six parts, and keeps its two-dispatch cadence',
  { skip: SKIP }, () => {
    const b = a3Bench();
    b.ram.setU8(A5 + 0x03, 1, 'nominate dead P2 so the alive fallback is exercised');
    b.ram.setU16(AIM.selP1, 0x8000);
    b.ram.setU16(AIM.selP1 + 0x02, 0x4200);
    b.ram.setU16(AIM.selP1 + 0x04, 0x2800);
    b.ram.setU16(AIM.selP2, 0);
    const before = [];
    PARTS.forEach((part, i) => {
      b.ram.setU16(A6 + part + 0x02, 0x1000 + i * 0x180);
      b.ram.setU16(A6 + part + 0x04, 0x1800 + i * 0x100);
      b.ram.setU16(A6 + part + 0x1a, 0x20 + i);
      before.push(b.ram.u16(A6 + part + 0x1a));
    });
    assert.equal(a3Start259962(b.ram, 2), true);
    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u16(SCHED.a3Base + 0x02), 0x0101,
      'init seeds $0001 and its same-dispatch step immediately reloads the high byte');
    assert.deepEqual([b.ram.u16(A6 + 0x134), b.ram.u16(A6 + 0x136)], [0x4200, 0x2800]);
    assert.deepEqual(PARTS.map((part, i) => b.ram.u16(A6 + part + 0x1a)),
      PARTS.map((part, i) => slew64(before[i], aim64(AIM_TABLES,
        b.ram.u16(A6 + part + 0x02), b.ram.u16(A6 + part + 0x04), 0x4200, 0x2800))));
    assert.equal(b.ram.u8(A5 + 0x03), 1, 'six processed parts toggle the selector six times');

    const afterAim = PARTS.map((part) => b.ram.u16(A6 + part + 0x1a));
    runScheduler25962E(b.ram, ROM, b.ctx);
    assert.equal(b.ram.u16(SCHED.a3Base + 0x02), 0x0001);
    assert.deepEqual(PARTS.map((part) => b.ram.u16(A6 + part + 0x1a)), afterAim,
      'old cadence byte 1 only decrements; old byte 0 runs the body next dispatch');
  });

test('W562 A3 id 2 honors every part guard and returns when both players are dead',
  { skip: SKIP }, () => {
    for (const blockedPart of PARTS) {
      for (const flag of [0x1e, 0x1f]) {
        const b = a3Bench();
        b.ram.setU16(AIM.selP1, 0x8000);
        b.ram.setU16(AIM.selP1 + 2, 0x5000);
        b.ram.setU16(AIM.selP1 + 4, 0x3000);
        const expected = new Map();
        for (const [i, part] of PARTS.entries()) {
          const y = 0x1000 + i * 0x100, x = 0x1800 + i * 0x80;
          const target = aim64(AIM_TABLES, y, x, 0x5000, 0x3000);
          const current = (target + 9) & 0x3f;
          b.ram.setU16(A6 + part + 2, y);
          b.ram.setU16(A6 + part + 4, x);
          b.ram.setU16(A6 + part + 0x1a, current);
          expected.set(part, part === blockedPart ? current : slew64(current, target));
        }
        b.ram.setU8(A6 + blockedPart + flag, 1);
        b.ram.setU16(SCHED.a3Base + 0x02, 0x0001);
        a3s2Step2A5534(b.ram, ROM, b.ctx, SCHED.a3Base);
        assert.deepEqual(PARTS.map((part) => b.ram.u16(A6 + part + 0x1a)),
          PARTS.map((part) => expected.get(part)),
          `part $${blockedPart.toString(16)} guard +$${flag.toString(16)}`);
        assert.equal(b.ram.u8(A5 + 3), 1, 'five processed parts toggle an odd number of times');
      }
    }

    const dead = a3Bench();
    dead.ram.setU16(SCHED.a3Base + 0x02, 0x0007);
    dead.ram.setU16(A6 + 0x134, 0xaaaa);
    dead.ram.setU16(A6 + 0x136, 0x5555);
    PARTS.forEach((part) => dead.ram.setU16(A6 + part + 0x1a, 0x12));
    a3s2Step2A5534(dead.ram, ROM, dead.ctx, SCHED.a3Base);
    assert.equal(dead.ram.u8(SCHED.a3Base + 0x02), 7, 'cadence reload happens before target selection');
    assert.deepEqual([dead.ram.u16(A6 + 0x134), dead.ram.u16(A6 + 0x136)], [0xaaaa, 0x5555]);
    assert.deepEqual(PARTS.map((part) => dead.ram.u16(A6 + part + 0x1a)), Array(6).fill(0x12));
    assert.equal(dead.ram.u8(A5 + 3), 0);
  });

test('W562 A4 id 7 pauses its delay, starts gun 1, waits, and hands to id 8',
  { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a1: HIBACHI_A1.alt, a4: HIBACHI_A4.table });
    const current = SCHED.a4Base;
    const next = current + SCHED.a4Stride;
    ram.setU16(current, 0x8107);
    s7Init2A67E8(ram, current);
    ram.setU16(HIBACHI_A4.freeze, 1);
    s7Step2A67EE(ram, current);
    assert.equal(ram.u16(current + 2), 0x60);
    assert.equal(ram.u16(SCHED.a1Base), 0);

    ram.setU16(HIBACHI_A4.freeze, 0);
    s7Step2A67EE(ram, current);
    assert.equal(ram.u16(current + 2), 0x5f);
    ram.setU16(current + 2, 1);
    s7Step2A67EE(ram, current);
    assert.equal(ram.u16(current + 2), 0);
    assert.equal(ram.u16(SCHED.a1Base), 0x8001, 'the zero transition starts gun 1');
    assert.equal(ram.u16(current), 0x8107, 'the current A4 slot waits while gun 1 exists');
    assert.equal(ram.u16(next), 0);

    ram.setU16(SCHED.a1Base, 0);
    s7Step2A67EE(ram, current);
    assert.equal(ram.u16(current), 0);
    assert.equal(ram.u16(next), 0x8008, 'id 8 claims the next empty A4 slot before id 7 clears');
  });

test('W562 A4 id 7 init falls through into its step in one scheduler dispatch',
  { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a4: HIBACHI_A4.table });
    a4Start25980C(ram, 7);
    assert.equal(runScheduler25962E(ram, ROM, {}), false);
    assert.equal(ram.u16(SCHED.a4Base), 0x8107);
    assert.equal(ram.u16(SCHED.a4Base + 2), 0x005f,
      'the init writes 96 and its fallthrough step decrements to 95');
  });

test('W562 future-window checkpoint reaches gun 1 template as the W563 window seam',
  { skip: SKIP_CHECKPOINT }, async () => {
    const exact = await bundle();
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    const checkpointExact = { ...exact, tables: CHECKPOINT_TABLE };
    assert.equal(canonicalHash(CHECKPOINT_TABLE), CHECKPOINT_TABLE_HASH);
    const storedCheckpointTable = JSON.parse(JSON.stringify(CHECKPOINT_TABLE));
    storedCheckpointTable.rom.windows = storedCheckpointTable.rom.windows
      .filter((w) => w.base !== '$259512');
    assert.deepEqual([
      storedCheckpointTable.rom.windows.length, canonicalHash(storedCheckpointTable),
      checkpoint.tablesSha256,
    ], [821, STORED_CHECKPOINT_TABLE_HASH, STORED_CHECKPOINT_TABLE_HASH]);
    const adoptedCheckpoint = { ...checkpoint, tablesSha256: CHECKPOINT_TABLE_HASH };
    assert.deepEqual({ ...adoptedCheckpoint, tablesSha256: checkpoint.tablesSha256 }, checkpoint,
      'W623 adoption changes only the stored checkpoint table identity');
    const { game, probe } = restoreCheckpoint(
      adoptedCheckpoint, checkpointExact, adoptedCheckpoint.selection);
    assert.deepEqual(probe, {
      ship: 0, style: 4, inputWord: checkpoint.inputWord, invulnerable: true,
    });

    game.rom = ROM;
    game.tables = new MoveTables(FUTURE_TABLE, ROM);
    game.handlers = defaultHandlers(ROM, game.vram, { mutate: game.bgMutate });
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 1000; attempted++) {
      try {
        game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        game.step(checkpoint.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    assert.equal(attempted, 697);
    assert.equal(game.logicFrame, 71807);
    assert.equal(error?.romAddress, 0x2a97b6);
    assert.equal(ROM.u32(HIBACHI_A1.alt + 8), 0x2a97f4);
    assert.equal(scriptAddresses().includes(0x2a97f4), true);
    assert.equal(caught(() => ROM.u8(0x2a9318)), null,
      'the future table supplies gun 0 before the replay reaches gun 1');
    assert.equal(caught(() => ROM.u8(0x2a97b6))?.romAddress, 0x2a97b6,
      'the strict W562 table stops exactly at the W563 template seam');
  });
