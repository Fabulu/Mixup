// W566: HIBACHI LOOP-ZERO GUN 4, THE PERMANENT EIGHT-SHOT SPIRAL.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import {
  SCHED, installScripts, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { RNG } from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';
import { RAM, P } from '../src/machine.js';
import { loadBundle } from '../src/web/assets.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import {
  HIBACHI_A1, HIBACHI_A1_ALT_COUNTED, HIBACHI_A1_ALT_END, HIBACHI_A1_ALT_SCRIPTS,
  altGun4Init2AA072, altGun4Step2AA084,
} from '../src/hibachiguns.js';
import { ROM_OVERLAP_PAIRS, overlappingPairs } from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const EXPORT_TABLES = here('../tools/export-tables.py');
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

const WINDOW = SKIP ? null : Object.freeze({
  base: '$2AA040',
  len: 0x12,
  why: "W566: loop-zero HIBACHI A1 gun 4's nine-word slot template, copied by $2AA072 moveq #$8 plus dbra and ending before its unused self-pointer block",
  hex: IMG.subarray(0x2aa040, 0x2aa052).toString('hex'),
});
const PRIOR_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(TABLE_JSON));
  copy.rom.windows = copy.rom.windows.filter((w) => w.base !== WINDOW.base);
  return copy;
})();
const FUTURE_TABLE = SKIP ? null : (() => {
  const copy = JSON.parse(JSON.stringify(PRIOR_TABLE));
  const after = copy.rom.windows.findIndex((w) => w.base === '$2AA004');
  assert.notEqual(after, -1, 'the W565 pattern predecessor exists');
  copy.rom.windows.splice(after + 1, 0, WINDOW);
  return copy;
})();
const ROM = SKIP ? null : new RomWindows(FUTURE_TABLE.rom);
const PRIOR_HASH = '9df27f6f7be58294229144676055c51dfae1ecb2f686134c12d0504b43497a2e';
const FUTURE_HASH = '145945830be69de56a76312f0d44aaedd47519083d0da70fce2361ea06dba289';
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const A5 = 0x810c00;
const A6 = 0x814800;
const HEADINGS = Object.freeze([0x40, 0x50, 0x80, 0x90, 0xc0, 0xd0, 0x00, 0x10]);
const SITES = Object.freeze([
  0x2aa0e4, 0x2aa0e4, 0x2aa12c, 0x2aa12c,
  0x2aa174, 0x2aa174, 0x2aa1bc, 0x2aa1bc,
]);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

function gunBench(hp = 0x0000eb33) {
  const ram = new Ram();
  const shots = [];
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A5 + 0x16, hp);
  ram.setU32(A6 + 0x02, 0x50004000);
  return {
    ram, shots,
    ctx: { bulletSpawn: (site, result) => shots.push([site, result]) },
  };
}

function record(ram, shot) {
  const address = shot[1][0].addr;
  return {
    kind: ram.u16(address + BREC.typeWord) & 0x3f,
    dir: ram.u8(address + BREC.dir),
    speed: ram.u8(address + BREC.speed),
    posA: ram.u16(address + BREC.posA),
    posB: ram.u16(address + BREC.posB),
  };
}

function expectedVector(direction) {
  const index = u16(direction + 2) & 0x00fc;
  return (ROM.u32(HIBACHI_A1.vectors + index) + 0xf0c00000) >>> 0;
}

async function bundle() {
  return loadBundle(async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

test('W566 is the strict one-window additive template with no self-pointers or padding',
  { skip: SKIP }, () => {
    assert.deepEqual(TABLE_JSON, FUTURE_TABLE);
    assert.equal(PRIOR_TABLE.rom.windows.length, 824);
    assert.equal(canonicalHash(PRIOR_TABLE), PRIOR_HASH);
    assert.equal(TABLE_JSON.rom.windows.length, 825);
    assert.equal(canonicalHash(TABLE_JSON), FUTURE_HASH);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 451687);
    assert.deepEqual(TABLE_JSON.rom.windows.filter((w) => w.base === WINDOW.base), [WINDOW]);
    assert.equal(WINDOW.hex, '2080454500000b40fffa0019000100070140');
    assert.equal(overlappingPairs(TABLE_JSON.rom.windows.map((w) => [
      Number.parseInt(w.base.slice(1), 16), w.len,
    ])), ROM_OVERLAP_PAIRS);
    assert.equal(ROM_OVERLAP_PAIRS, 77);
    assert.equal(caught(() => ROM.u8(0x2aa051)), null);
    for (const address of [0x2aa052, 0x2aa071]) {
      assert.equal(caught(() => ROM.u8(address))?.romAddress, address);
    }
    assert.deepEqual(Array.from({ length: 8 }, (_, i) => IMG.readUInt32BE(0x2aa052 + i * 4)),
      Array(8).fill(HIBACHI_A1.altGun4Init));
    const exporter = readFileSync(EXPORT_TABLES, 'utf8');
    assert.equal([...exporter.matchAll(/\(0x2AA040, 0x0012,/g)].length, 1);
    assert.doesNotMatch(exporter, /\(0x2AA052,/);
  });

test('W566 pins the final alternate pair, separate registration, and complete accounting',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM.u32(HIBACHI_A1.alt + 4 * 8), ROM.u32(HIBACHI_A1.alt + 4 * 8 + 4),
    ], [HIBACHI_A1.altGun4Init, HIBACHI_A1.altGun4Step]);
    assert.deepEqual([
      HIBACHI_A1.altGun4Template, HIBACHI_A1.altGun4Init, HIBACHI_A1.altGun4Step,
    ], [0x2aa040, 0x2aa072, 0x2aa084]);
    assert.equal(IMG.readUInt16BE(0x2aa082), 0x4e75, 'the init has its own rts');
    assert.equal(IMG.readUInt16BE(0x2aa23c), 0x4e75, 'the step ends at the final rts');
    assert.equal(HIBACHI_A1_ALT_END, 0x2aa23e);
    assert.equal(IMG.readUInt16BE(HIBACHI_A1_ALT_END), 0x2210,
      'shared arithmetic code starts immediately after the alternate set');
    const registered = new Set(scriptAddresses());
    assert.ok(registered.has(HIBACHI_A1.altGun4Init));
    assert.ok(registered.has(HIBACHI_A1.altGun4Step));
    assert.deepEqual(HIBACHI_A1_ALT_SCRIPTS, [0, 1, 2, 3, 4]);
    assert.deepEqual(Object.keys(HIBACHI_A1_ALT_COUNTED), []);

    const scheduled = gunBench();
    installScripts(scheduled.ram, ROM, { a1: HIBACHI_A1.alt });
    scheduled.ram.setU16(SCHED.a1Base, 0x8004);
    runScheduler25962E(scheduled.ram, ROM,
      { bossRec: A5, bossSubRec: A6, ...scheduled.ctx });
    assert.equal(scheduled.ram.u16(SCHED.a1Base), 0x8104);
    assert.equal(scheduled.ram.u8(SCHED.a1Base + 0x02), 0x20);
    assert.equal(scheduled.shots.length, 0, 'the init rts keeps the step out of dispatch one');
  });

test('W566 init copies nine words exactly and the initial timer fires on dispatch 33',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU8(RNG.counter, 0x55);
    b.ram.setU16(0x803934, 6);
    b.ram.setU16(0x803936, 7);
    altGun4Init2AA072(b.ram, ROM, SCHED.a1Base);
    assert.deepEqual(Array.from({ length: 9 }, (_, i) =>
      b.ram.u16(SCHED.a1Base + 0x02 + i * 2)),
    [0x2080, 0x4545, 0x0000, 0x0b40, 0xfffa, 0x0019, 0x0001, 0x0007, 0x0140]);
    assert.equal(b.ram.u8(RNG.counter), 0x55);
    assert.deepEqual([b.ram.u16(0x803934), b.ram.u16(0x803936)], [6, 7]);
    for (let dispatch = 1; dispatch <= 32; dispatch++) {
      altGun4Step2AA084(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
      assert.equal(b.shots.length, 0, `dispatch ${dispatch} stays before the byte borrow`);
    }
    assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0);
    altGun4Step2AA084(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
    assert.equal(b.shots.length, 8);
  });

test('W566 fires all eight kind-$19 headings at dead players and preserves cartridge vectors',
  { skip: SKIP }, () => {
    const b = gunBench();
    altGun4Init2AA072(b.ram, ROM, SCHED.a1Base);
    b.ram.setU8(SCHED.a1Base + 0x02, 0);
    b.ram.setU8(RNG.counter, 0x77);
    altGun4Step2AA084(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
    assert.deepEqual(b.shots.map(([site]) => site), SITES);
    const records = b.shots.map((shot) => record(b.ram, shot));
    assert.deepEqual(records.map((r) => r.kind), Array(8).fill(0x19));
    assert.deepEqual(records.map((r) => r.dir), HEADINGS);
    assert.deepEqual(records.map((r) => [r.posA, r.posB]), HEADINGS.map((direction) => {
      const d3 = expectedVector(direction);
      return [u16(0x5000 + (d3 >>> 16)), u16(0x4000 + u16(d3))];
    }));
    assert.ok(records.every((r) => r.speed === records[0].speed));
    assert.equal(b.ram.u32(SCHED.a1Base + 0x0a), 0xfffa0019);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0x0b);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x04), 0x44);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x13), 0x41);
    assert.equal(b.ram.u8(RNG.counter), 0x77);
    assert.equal(b.ram.u8(A5 + 0x03), 0, 'gun 4 has no target toggle');
  });

test('W566 low HP shortens only the live cadence, doubles heading delta, and sets shake',
  { skip: SKIP }, () => {
    const threshold = gunBench(0x0000eb33);
    altGun4Init2AA072(threshold.ram, ROM, SCHED.a1Base);
    threshold.ram.setU8(SCHED.a1Base + 0x02, 0);
    threshold.ram.setU16(0x803934, 6);
    threshold.ram.setU16(0x803936, 7);
    altGun4Step2AA084(
      threshold.ram, ROM, threshold.ctx, SCHED.a1Base, A5, A6);
    assert.deepEqual([
      threshold.ram.u8(SCHED.a1Base + 0x02),
      threshold.ram.u8(SCHED.a1Base + 0x08),
      threshold.ram.u8(SCHED.a1Base + 0x13),
      threshold.ram.u16(0x803934), threshold.ram.u16(0x803936),
    ], [0x0b, 0x0b, 0x41, 6, 7], 'the threshold itself takes the unsigned high-HP arm');

    const low = gunBench(0x0000eb32);
    altGun4Init2AA072(low.ram, ROM, SCHED.a1Base);
    low.ram.setU8(SCHED.a1Base + 0x02, 0);
    low.ram.setU16(0x803934, 6);
    low.ram.setU16(0x803936, 7);
    altGun4Step2AA084(low.ram, ROM, low.ctx, SCHED.a1Base, A5, A6);
    assert.deepEqual([
      low.ram.u8(SCHED.a1Base + 0x02),
      low.ram.u8(SCHED.a1Base + 0x08),
      low.ram.u8(SCHED.a1Base + 0x13),
      low.ram.u16(0x803934), low.ram.u16(0x803936),
    ], [0x09, 0x0b, 0x42, 1, 0], 'low HP does not rewrite the stored base cadence');
  });

test('W566 phases saturate cadence, body base, and signed bias without retirement',
  { skip: SKIP }, () => {
    const b = gunBench();
    altGun4Init2AA072(b.ram, ROM, SCHED.a1Base);
    b.ram.setU16(SCHED.a1Base, 0x8104);
    const seen = [];
    for (let phase = 0; phase < 8; phase++) {
      b.ram.setU8(SCHED.a1Base + 0x02, 0);
      b.ram.setU8(SCHED.a1Base + 0x04, 0);
      b.ram.setU8(SCHED.a1Base + 0x06, 0);
      b.ram.setU16(0x803934, 6);
      b.ram.setU16(0x803936, 7);
      altGun4Step2AA084(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
      seen.push([
        b.ram.u8(SCHED.a1Base + 0x08),
        b.ram.u8(SCHED.a1Base + 0x05),
        b.ram.u16(SCHED.a1Base + 0x0a),
        b.ram.u8(SCHED.a1Base + 0x12),
        b.ram.u16(0x803934), b.ram.u16(0x803936),
      ]);
      assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0x40);
      assert.equal(b.ram.u8(SCHED.a1Base + 0x04), b.ram.u8(SCHED.a1Base + 0x05));
      assert.equal(b.ram.u8(SCHED.a1Base + 0x06), 0);
      assert.equal(b.ram.u16(SCHED.a1Base), 0x8104);
    }
    assert.deepEqual(seen, [
      [0x09, 0x59, 0xfffc, 0xff, 6, 7],
      [0x07, 0x6d, 0xfffe, 0x01, 1, 0],
      [0x07, 0x81, 0x0000, 0xff, 6, 7],
      [0x07, 0x95, 0x0002, 0x01, 6, 7],
      [0x07, 0xa9, 0x0004, 0xff, 6, 7],
      [0x07, 0xbd, 0x0006, 0x01, 6, 7],
      [0x07, 0xd1, 0x0006, 0xff, 6, 7],
      [0x07, 0xd1, 0x0006, 0x01, 6, 7],
    ]);
    assert.equal(b.ram.u16(SCHED.a1Base + SCHED.a1Stride), 0,
      'gun 4 has no successor and waits for external boss cleanup');
  });

test('W566 has no gun-level freeze gate while the bullet core may decline every call',
  { skip: SKIP }, () => {
    const b = gunBench();
    altGun4Init2AA072(b.ram, ROM, SCHED.a1Base);
    b.ram.setU8(SCHED.a1Base + 0x02, 0);
    b.ram.setU16(HIBACHI_A1.freeze, 1);
    altGun4Step2AA084(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
    assert.equal(b.shots.length, 8);
    assert.ok(b.shots.every(([, results]) => results.every((result) => result.declined)));
    assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0x0b);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x04), 0x44);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x13), 0x41);
  });

test('W566 exact lf73711 replay reaches external cleanup then sound wrapper $28C0FC',
  { skip: SKIP_CHECKPOINT }, async () => {
    const exact = await bundle();
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.equal(checkpoint.tablesSha256, FUTURE_HASH);
    const { game, probe } = restoreCheckpoint(checkpoint, exact, checkpoint.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 3500; attempted++) {
      try {
        game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        game.step(probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    assert.equal(attempted, 3008);
    assert.equal(game.logicFrame, 76718);
    assert.match(error?.message ?? '', /no wrapper at \$28C0FC/);
    assert.deepEqual(Array.from({ length: SCHED.a1Slots }, (_, i) =>
      game.ram.u16(SCHED.a1Base + i * SCHED.a1Stride)), Array(SCHED.a1Slots).fill(0),
    'external boss cleanup retires the otherwise permanent gun before the new seam');
    assert.equal(game.ram.u16(A5), 0, 'the Hibachi boss record is externally cleared');
  });
