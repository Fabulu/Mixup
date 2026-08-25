// W573: main-table Hibachi A1 gun 3 and the next exact loop-2 frontier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RAM, P } from '../src/machine.js';
import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { AIM, AimTables, aim256 } from '../src/aim.js';
import { RNG, RNG_2431F4 } from '../src/rng.js';
import { REC as BREC } from '../src/bullets.js';
import {
  SCHED, a1Start259A18, installScripts, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import {
  HIBACHI_A1, HIBACHI_A1_COUNTED, HIBACHI_A1_SCRIPTS,
  altGun3Init2A9E84, altGun3Step2A9EB6,
  gun3Init2A7E64, gun3Step2A7E96,
} from '../src/hibachiguns.js';
import { loadBundle } from '../src/web/assets.js';
import {
  checkpointDocument, restoreCheckpoint,
} from '../tools/progression-checkpoint.mjs';
import {
  ROM_OVERLAP_PAIRS, ROM_WINDOW_COUNT, overlappingPairs,
  tableBeforeW572, tableBeforeW573, tableBeforeW576,
} from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const EXPORTER = here('../tools/export-tables.py');
const ASSETS = here('../assets');
const HISTORICAL = here('../probes/checkpoints/ship0-style4-lf00146131.json');
const MIGRATED = here('../probes/checkpoints/w573-migrated-lf00146131.json');
const required = [TABLES, IMAGE, EXPORTER];
const SKIP = required.every(existsSync) ? false
  : 'exact W573 image or tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = [HISTORICAL, MIGRATED,
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz')]
  .every(existsSync) && !SKIP ? false
  : 'exact W573 assets or checkpoints absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W575_TABLE = SKIP ? null : tableBeforeW576(TABLE_JSON);
const W572_TABLE = SKIP ? null : tableBeforeW573(TABLE_JSON);
const W571_TABLE = SKIP ? null : tableBeforeW572(TABLE_JSON);
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const AIM_TABLES = SKIP ? null : new AimTables(ROM);
const LIVE_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';
const TABLE_HASH = 'cdce48388d34b89a09ce5d2b8a21ea7dad807bb1fe42468cf8ff3fe44387f30f';
const W572_HASH = 'f5bb751cefe855badec1a91c26182b756746857b878a7070a18c1e8d5b254d65';
const W571_HASH = '376e17ddc03d3e56d728cb804ba091ab098b4039b2d51ba7b2d6689ccd07f7c8';
const TEMPLATE = Object.freeze([
  0x2080, 0x1d1d, 0x0303, 0x001a, 0xfffe,
  0x000b, 0x0030, 0x1d00, 0xfffe, 0x0303,
]);
const PATTERN_HEX = '0dc0ed4000100dc012c0fff00b40f00000080b401000fff8'
  + '0940f300000009400d0000000800f640fff8080009c0000806c0f940fff006c006c00010';
const A5 = 0x810c00;
const A6 = 0x814800;
const PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const ROWS = Object.freeze([0x30, 0x24, 0x18, 0x0c, 0x00]);
const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');
const i8 = (v) => (((v & 0xff) ^ 0x80) - 0x80);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};
const asrByteWord = (word, count) => {
  const shift = count & 0x3f;
  const low = word & 0xff;
  let result = low;
  if (shift >= 8) result = (low & 0x80) !== 0 ? 0xff : 0;
  else if (shift !== 0) result = i8(low) >> shift;
  return (word & 0xff00) | (result & 0xff);
};

function gunBench() {
  const ram = new Ram();
  const calls = [];
  ram.setU32(A5 + 0x06, A6);
  return {
    ram, calls,
    ctx: {
      bulletSpawn: (site, results, regs, entry) =>
        calls.push({ site, results, regs, entry }),
    },
  };
}

function seedPlayers(b, preferred = 0, p1Status = 0x8000, p2Status = 0x8000) {
  b.ram.setU8(A5 + 0x03, preferred);
  b.ram.setU16(AIM.selP1, p1Status);
  b.ram.setU16(AIM.selP1 + 0x02, 0x7000);
  b.ram.setU16(AIM.selP1 + 0x04, 0x6000);
  b.ram.setU16(AIM.selP2, p2Status);
  b.ram.setU16(AIM.selP2 + 0x02, 0x6200);
  b.ram.setU16(AIM.selP2 + 0x04, 0x2800);
}

function seedGun(b, init = gun3Init2A7E64) {
  b.ram.setU16(A6 + 0x02, 0x5000);
  b.ram.setU16(A6 + 0x04, 0x4000);
  seedPlayers(b);
  init(b.ram, ROM, SCHED.a1Base, A6);
}

function active(b, step = gun3Step2A7E96) {
  b.ram.setU8(SCHED.a1Base + 0x02, 0);
  step(b.ram, ROM, b.ctx, SCHED.a1Base, A5, A6);
}

function flattened(b) {
  return b.calls.flatMap((call) => call.results.map((result) => ({ call, result })));
}

function bullet(ram, result) {
  return {
    kind: ram.u16(result.addr + BREC.typeWord) & 0x3f,
    speed: ram.u8(result.addr + BREC.speed),
    dir: ram.u8(result.addr + BREC.dir),
    posA: ram.u16(result.addr + BREC.posA),
    posB: ram.u16(result.addr + BREC.posB),
  };
}

function expectedAims(b, target, row, count) {
  const sy = u16(b.ram.u16(A6 + 0x02) + 0x0940);
  const sx = b.ram.u16(A6 + 0x04);
  const ty = b.ram.u16(target + 0x02);
  const tx = b.ram.u16(target + 0x04);
  const positive = aim256(AIM_TABLES, sy, u16(sx + 0x0d00), ty, tx);
  const negative = aim256(AIM_TABLES, sy, u16(sx + 0xf300), ty, tx);
  const at = HIBACHI_A1.gun3Pattern + row;
  return {
    positive, negative,
    negativeBias: asrByteWord(ROM.u16(at + 0x04), count),
    positiveBias: asrByteWord(ROM.u16(at + 0x0a), count),
  };
}

async function bundle() {
  return loadBundle(async (name) =>
    new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

const migrateW576 = (document) => ({ ...document, tablesSha256: LIVE_TABLE_HASH });

test('W573 adds only the exact template and five-row pattern windows',
  { skip: SKIP }, () => {
    assert.equal(ROM_WINDOW_COUNT, 851);
    assert.equal(TABLE_JSON.rom.windows.length, 851);
    assert.equal(TABLE_JSON.rom.windows.reduce((n, w) => n + w.len, 0), 452689);
    assert.equal(canonicalHash(TABLE_JSON), LIVE_TABLE_HASH);
    assert.equal(W575_TABLE.rom.windows.length, 847);
    assert.equal(W575_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 452447);
    assert.equal(canonicalHash(W575_TABLE), TABLE_HASH,
      'removing only W576 reconstructs strict W575 byte for byte');
    assert.equal(W572_TABLE.rom.windows.length, 845);
    assert.equal(W572_TABLE.rom.windows.reduce((n, w) => n + w.len, 0), 452367);
    assert.equal(canonicalHash(W572_TABLE), W572_HASH,
      'removing only W573 reconstructs strict W572 byte for byte');
    assert.equal(W571_TABLE.rom.windows.length, 844);
    assert.equal(canonicalHash(W571_TABLE), W571_HASH,
      'tableBeforeW572 composes every older reconstruction through W573');

    const added = TABLE_JSON.rom.windows.filter((w) => w.why.startsWith('W573:'));
    assert.deepEqual(added, [
      {
        base: '$2A7E30', len: 0x14,
        why: "W573: loop-nonzero HIBACHI A1 gun 3's ten-word slot template, copied by $2A7E64 moveq #$9 plus dbra and ending before its unused self-pointer block",
        hex: '20801d1d0303001afffe000b00301d00fffe0303',
      },
      {
        base: '$2A7FEC', len: 0x3c,
        why: "W573: loop-nonzero HIBACHI A1 gun 3's five twelve-byte paired-shot rows, walked from offset $30 down through $00 and ending exactly at gun 4's template",
        hex: PATTERN_HEX,
      },
    ]);
    for (const window of added) {
      const base = Number.parseInt(window.base.slice(1), 16);
      assert.equal(window.hex, IMG.subarray(base, base + window.len).toString('hex'));
    }
    assert.equal(overlappingPairs(TABLE_JSON.rom.windows.map((w) => [
      Number.parseInt(w.base.slice(1), 16), w.len,
    ])), 77);
    assert.equal(ROM_OVERLAP_PAIRS, 77);
    assert.deepEqual(Array.from({ length: 10 }, (_, i) => ROM.u16(0x2a7e30 + i * 2)),
      TEMPLATE);
    assert.equal(ROM.u8(0x2a7e43), 3);
    assert.equal(caught(() => ROM.u8(0x2a7e44))?.romAddress, 0x2a7e44);
    assert.equal(caught(() => ROM.u8(0x2a7e63))?.romAddress, 0x2a7e63);
    assert.equal(caught(() => ROM.u8(0x2a7e64))?.romAddress, 0x2a7e64);
    assert.equal(ROM.u8(0x2a7fec), IMG[0x2a7fec]);
    assert.equal(ROM.u8(0x2a8027), IMG[0x2a8027]);
    assert.equal(caught(() => ROM.u8(0x2a8028))?.romAddress, 0x2a8028);
    assert.deepEqual(Array.from({ length: 8 }, (_, i) => IMG.readUInt32BE(0x2a7e44 + i * 4)),
      Array(8).fill(0x2a7e64));

    const exporter = readFileSync(EXPORTER, 'utf8');
    assert.equal([...exporter.matchAll(/\(0x2A7E30, 0x0014,/g)].length, 1);
    assert.equal([...exporter.matchAll(/\(0x2A7FEC, 0x003C,/g)].length, 1);
    assert.doesNotMatch(exporter, /\(0x2A7E44,/);
  });

test('W573 pins code/data boundaries, separate dispatch, and ID-3 accounting',
  { skip: SKIP }, () => {
    assert.deepEqual([
      ROM.u32(HIBACHI_A1.main + 24), ROM.u32(HIBACHI_A1.main + 28),
    ], [HIBACHI_A1.gun3Init, HIBACHI_A1.gun3Step]);
    assert.deepEqual([
      HIBACHI_A1.gun3Template, HIBACHI_A1.gun3Init, HIBACHI_A1.gun3Step,
      HIBACHI_A1.gun3Pattern,
    ], [0x2a7e30, 0x2a7e64, 0x2a7e96, 0x2a7fec]);
    assert.equal(ROM.u32(HIBACHI_A1.main + 32), 0x2a805a, 'main gun 4 is next');
    assert.equal(IMG.readUInt16BE(0x2a7e94), 0x4e75, 'init has its own RTS');
    assert.equal(IMG.readUInt16BE(0x2a7fea), 0x4e75, 'step has its own RTS');
    assert.equal(0x2a7fec + 5 * 12, 0x2a8028, 'pattern ends at the gun-4 template');
    assert.equal(IMG.readUInt32BE(0x2a8028), 0x20806363);
    assert.deepEqual([IMG.readUInt32BE(0x2a805a), IMG.readUInt32BE(0x2a806c)],
      [0x41faffcc, 0x4a790081], 'gun 4 init and step remain separate code');

    const registered = new Set(scriptAddresses());
    assert.ok(registered.has(HIBACHI_A1.gun3Init));
    assert.ok(registered.has(HIBACHI_A1.gun3Step));
    assert.deepEqual(HIBACHI_A1_SCRIPTS, [0, 1, 2, 3, 5, 6, 7, 8, 9, 0x0a, 0x0b]);
    assert.equal(HIBACHI_A1_COUNTED[3], undefined);
    assert.deepEqual(Object.keys(HIBACHI_A1_COUNTED).map(Number), [4, 0x0c, 0x0d]);
    assert.equal(HIBACHI_A1_COUNTED[4].init, 0x2a805a);
    assert.equal(Object.keys(HIBACHI_A1_COUNTED).length + HIBACHI_A1_SCRIPTS.length,
      HIBACHI_A1.pairs);

    const b = gunBench();
    installScripts(b.ram, ROM, { a1: HIBACHI_A1.main });
    assert.equal(a1Start259A18(b.ram, 3), SCHED.a1Base);
    runScheduler25962E(b.ram, ROM, { bossRec: A5, bossSubRec: A6, ...b.ctx });
    assert.equal(b.ram.u16(SCHED.a1Base), 0x8103);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x02), 0x20,
      'the init RTS keeps the step out of first dispatch');
    assert.equal(b.calls.length, 0);
  });

test('W573 init shares only its body, wraps exact fields, and consumes no RNG',
  { skip: SKIP }, () => {
    const b = gunBench();
    b.ram.setU16(A6 + 0x13e, 5);
    b.ram.setU8(A6 + 0x1d6, 0xfe);
    b.ram.setU8(A6 + 0x1d7, 0x1b);
    b.ram.setU8(RNG.counter, 0x44);
    gun3Init2A7E64(b.ram, ROM, SCHED.a1Base, A6);
    assert.deepEqual(Array.from({ length: 10 }, (_, i) =>
      b.ram.u16(SCHED.a1Base + 0x02 + i * 2)), [
      0x2080, 0x1d1d, 0x0101, 0x00ff, 0x0003,
      0x000b, 0x0030, 0x1d00, 0x0003, 0x0303,
    ]);
    assert.equal(b.ram.u8(RNG.counter), 0x44);
    assert.deepEqual(
      IMG.subarray(HIBACHI_A1.gun3Init + 4, HIBACHI_A1.gun3Step),
      IMG.subarray(HIBACHI_A1.altGun3Init + 4, HIBACHI_A1.altGun3Step),
      'main and alternate init instruction streams differ only in template LEA');
  });

test('W573 freeze reinitializes and timer body begins only on byte borrow',
  { skip: SKIP }, () => {
    const frozen = gunBench();
    seedGun(frozen);
    frozen.ram.setU16(HIBACHI_A1.freeze, 1);
    frozen.ram.setU16(SCHED.a1Base + 0x02, 0xdead);
    frozen.ram.setU8(RNG.counter, 0x30);
    gun3Step2A7E96(frozen.ram, ROM, frozen.ctx, SCHED.a1Base, A5, A6);
    assert.equal(frozen.ram.u16(SCHED.a1Base + 0x02), 0x2080);
    assert.equal(frozen.ram.u8(RNG.counter), 0x30);
    assert.equal(frozen.calls.length, 0);

    const edge = gunBench();
    seedGun(edge);
    edge.ram.setU8(SCHED.a1Base + 0x04, 1);
    edge.ram.setU8(SCHED.a1Base + 0x05, 2);
    edge.ram.setU8(SCHED.a1Base + 0x02, 1);
    gun3Step2A7E96(edge.ram, ROM, edge.ctx, SCHED.a1Base, A5, A6);
    assert.equal(edge.ram.u8(SCHED.a1Base + 0x02), 0);
    assert.equal(edge.calls.length, 0);
    gun3Step2A7E96(edge.ram, ROM, edge.ctx, SCHED.a1Base, A5, A6);
    assert.equal(edge.calls.length, 2);
    assert.equal(edge.ram.u8(SCHED.a1Base + 0x02), 0,
      'the borrowed event reloads timer +2 from cadence +8');
  });

test('W573 draws once at magazine start before target selection, even when both are dead',
  { skip: SKIP }, () => {
    const b = gunBench();
    seedGun(b);
    seedPlayers(b, 1, 0, 0);
    b.ram.setU8(RNG.counter, 0x10);
    active(b);
    const expected = ROM.u8(RNG_2431F4.table + 0x11);
    assert.equal(b.ram.u8(RNG.counter), 0x11);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x14), expected);
    assert.equal(b.calls.length, 0);
    assert.equal(b.ram.u16(SCHED.a1Base + 0x0e), 0x30);
    assert.equal(b.ram.u16(SCHED.a1Base + 0x0a), 0xffff);
    assert.equal(b.ram.u8(SCHED.a1Base + 0x04), 0x1c);
    assert.equal(b.ram.u8(A5 + 0x03), 1);

    const live = gunBench();
    seedGun(live);
    live.ram.setU8(RNG.counter, 0x30);
    const observed = [];
    live.ctx.bulletSpawn = () => observed.push([
      live.ram.u8(RNG.counter), live.ram.u8(SCHED.a1Base + 0x14),
    ]);
    active(live);
    const liveDraw = ROM.u8(RNG_2431F4.table + 0x31);
    assert.deepEqual(observed, [[0x31, liveDraw], [0x31, liveDraw]],
      'both aim-side calls observe the one magazine draw already completed');
  });

test('W573 target preference, fallback, dead skip, and dual-source aims are exact',
  { skip: SKIP }, () => {
    const choices = [
      [0, 0x8000, 0x8000, AIM.selP1],
      [1, 0x8000, 0x8000, AIM.selP2],
      [1, 0x8000, 0x0000, AIM.selP1],
      [0, 0x0000, 0x8000, AIM.selP2],
    ];
    for (const [preferred, p1, p2, target] of choices) {
      const b = gunBench();
      seedGun(b);
      seedPlayers(b, preferred, p1, p2);
      b.ram.setU8(SCHED.a1Base + 0x04, 1);
      b.ram.setU8(SCHED.a1Base + 0x05, 2);
      b.ram.setU8(SCHED.a1Base + 0x14, 3);
      active(b);
      const aims = expectedAims(b, target, 0x30, 3);
      assert.deepEqual(b.calls.map((call) => call.regs.d1), [
        u16(aims.negative + aims.negativeBias) & 0xff,
        u16(aims.positive + aims.positiveBias) & 0xff,
      ]);
      assert.equal(b.ram.u8(A5 + 0x03), preferred,
        'target selection alone does not toggle the selector');
    }

    const dead = gunBench();
    seedGun(dead);
    seedPlayers(dead, 0, 0, 0);
    dead.ram.setU8(SCHED.a1Base + 0x04, 1);
    dead.ram.setU8(SCHED.a1Base + 0x05, 2);
    active(dead);
    assert.equal(dead.calls.length, 0);
    assert.equal(dead.ram.u16(SCHED.a1Base + 0x0e), 0x30);
    assert.equal(dead.ram.u16(SCHED.a1Base + 0x0a), 0xffff);
    assert.equal(dead.ram.u8(SCHED.a1Base + 0x04), 0);

    assert.equal(IMG.readUInt16BE(0x2a7f08), 0x0641);
    assert.equal(IMG.readUInt16BE(0x2a7f0a), 0x0d00,
      'the positive-X source is aimed first');
    assert.equal(IMG.readUInt16BE(0x2a7f22), 0x0641);
    assert.equal(IMG.readUInt16BE(0x2a7f24), 0xf300,
      'the negative-X source is recomputed second');
    assert.equal(IMG.readUInt16BE(0x2a7f12), 0x3f01,
      'the positive heading is saved before negative aim');
  });

test('W573 row order, call order, semantic inputs, and helper flattening are exact',
  { skip: SKIP }, () => {
    const rows = gunBench();
    seedGun(rows);
    rows.ram.setU8(SCHED.a1Base + 0x04, 10);
    rows.ram.setU8(SCHED.a1Base + 0x05, 20);
    rows.ram.setU8(SCHED.a1Base + 0x14, 0);
    rows.ram.setU16(HIBACHI_A1.loopWord, 0);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      seen.push(rows.ram.u16(SCHED.a1Base + 0x0e));
      active(rows);
    }
    assert.deepEqual(seen, ROWS);
    assert.equal(rows.ram.u16(SCHED.a1Base + 0x0e), 0x30);
    assert.deepEqual(rows.calls.map((call) => call.site), ROWS.flatMap(() => [0x2a7f46, 0x2a7f60]));
    for (let i = 0; i < ROWS.length; i++) {
      const at = HIBACHI_A1.gun3Pattern + ROWS[i];
      assert.deepEqual(rows.calls.slice(i * 2, i * 2 + 2).map((call) => call.regs.d3),
        [ROM.u32(at), ROM.u32(at + 6)]);
    }

    for (const loop of [0, 1]) {
      const b = gunBench();
      seedGun(b);
      b.ram.setU8(SCHED.a1Base + 0x04, 1);
      b.ram.setU8(SCHED.a1Base + 0x05, 2);
      b.ram.setU8(SCHED.a1Base + 0x14, 0);
      b.ram.setU16(HIBACHI_A1.loopWord, loop);
      active(b);
      const at = HIBACHI_A1.gun3Pattern + 0x30;
      const aims = expectedAims(b, AIM.selP1, 0x30, 0);
      assert.deepEqual(b.calls.map(({ site, entry, regs }) => ({ site, entry, regs })), [
        {
          site: 0x2a7f46, entry: 0x281744,
          regs: {
            d0: 0xfffe000b, d1: u16(aims.negative + aims.negativeBias) & 0xff,
            d2: 0x50004000, d3: ROM.u32(at), d4: 0, d5: 0, d6: 3, a5: A5,
          },
        },
        {
          site: 0x2a7f60, entry: 0x281744,
          regs: {
            d0: 0xfffe000b, d1: u16(aims.positive + aims.positiveBias) & 0xff,
            d2: 0x50004000, d3: ROM.u32(at + 6), d4: aims.positiveBias,
            d5: 0, d6: 0xfc, a5: A5,
          },
        },
      ]);
      assert.deepEqual(b.calls.map((call) => call.results.length), [loop ? 2 : 1, loop ? 2 : 1]);
      assert.equal(flattened(b).length, loop ? 4 : 2);
      const bullets = flattened(b).map(({ result }) => bullet(b.ram, result));
      assert.deepEqual(bullets.map((record) => record.kind), Array(loop ? 4 : 2).fill(11));
      if (loop) {
        assert.deepEqual([
          (bullets[1].speed - bullets[0].speed) & 0xff,
          (bullets[3].speed - bullets[2].speed) & 0xff,
        ], [6, 6], 'each nonzero-loop helper call emits speed +0 then +6');
      }
    }
  });

test('W573 implements ASR.B counts 0,1,7,8,63 and effective 64 for both signs',
  { skip: SKIP }, () => {
    for (const count of [0, 1, 7, 8, 63, 64]) {
      const b = gunBench();
      seedGun(b);
      b.ram.setU16(SCHED.a1Base + 0x0e, 0);
      b.ram.setU8(SCHED.a1Base + 0x04, 1);
      b.ram.setU8(SCHED.a1Base + 0x05, 2);
      b.ram.setU8(SCHED.a1Base + 0x14, count);
      active(b);
      const aims = expectedAims(b, AIM.selP1, 0, count);
      assert.deepEqual(b.calls.map((call) => call.regs.d1), [
        u16(aims.negative + aims.negativeBias) & 0xff,
        u16(aims.positive + aims.positiveBias) & 0xff,
      ], `count ${count} shifts positive $10 and negative $F0 low bytes exactly`);
      assert.equal(b.calls[1].regs.d4, aims.positiveBias,
        'main second call preserves D4 high byte and shifted low byte');
    }
  });

test('W573 dead rows stay put while 30 and 45-volley magazines advance all counters',
  { skip: SKIP }, () => {
    const b = gunBench();
    seedGun(b);
    seedPlayers(b, 0, 0, 0);
    b.ram.setU8(RNG.counter, 0x20);
    for (let i = 0; i < 30; i++) active(b);
    assert.equal(b.calls.length, 0);
    assert.equal(b.ram.u16(SCHED.a1Base + 0x0e), 0x30,
      'dead-target volleys never advance the row');
    assert.deepEqual([
      b.ram.u8(SCHED.a1Base + 0x05), b.ram.u8(SCHED.a1Base + 0x04),
      b.ram.u8(SCHED.a1Base + 0x02), b.ram.u8(SCHED.a1Base + 0x06),
      b.ram.u16(SCHED.a1Base + 0x12), b.ram.u16(SCHED.a1Base + 0x0a),
      b.ram.u8(A5 + 0x03), b.ram.u8(RNG.counter),
    ], [0x2c, 0x2c, 0x1a, 2, 0xffff, 0xffff, 1, 0x21]);

    for (let i = 0; i < 45; i++) active(b);
    assert.deepEqual([
      b.ram.u8(SCHED.a1Base + 0x05), b.ram.u8(SCHED.a1Base + 0x04),
      b.ram.u8(SCHED.a1Base + 0x06), b.ram.u16(SCHED.a1Base + 0x12),
      b.ram.u16(SCHED.a1Base + 0x0a), b.ram.u8(A5 + 0x03),
      b.ram.u8(RNG.counter),
    ], [0x2c, 0x2c, 1, 0x0000, 0x0000, 0, 0x22]);
  });

test('W573 outer borrow ramps at unsigned thresholds and stops every ID-3 slot',
  { skip: SKIP }, () => {
    const done = gunBench();
    seedGun(done);
    seedPlayers(done, 0, 0, 0);
    done.ram.setU16(SCHED.a1Base, 0x8103);
    done.ram.setU16(SCHED.a1Base + SCHED.a1Stride, 0x8103);
    done.ram.setU16(SCHED.a1Base + SCHED.a1Stride * 2, 0x8104);
    done.ram.setU8(SCHED.a1Base + 0x04, 0);
    done.ram.setU8(SCHED.a1Base + 0x05, 0x1e);
    done.ram.setU8(SCHED.a1Base + 0x06, 0);
    done.ram.setU8(SCHED.a1Base + 0x07, 4);
    done.ram.setU8(A6 + 0x1d6, 1);
    done.ram.setU16(A6 + 0x13e, 5);
    done.ram.setU8(A6 + 0x1d7, 0x17);
    active(done);
    assert.deepEqual([
      done.ram.u8(A6 + 0x1d6), done.ram.u16(A6 + 0x13e), done.ram.u8(A6 + 0x1d7),
    ], [2, 6, 0x19]);
    assert.deepEqual([
      done.ram.u8(SCHED.a1Base + 0x06), done.ram.u8(SCHED.a1Base + 0x02),
    ], [4, 0x80]);
    assert.deepEqual([
      done.ram.u16(SCHED.a1Base),
      done.ram.u16(SCHED.a1Base + SCHED.a1Stride),
      done.ram.u16(SCHED.a1Base + SCHED.a1Stride * 2),
    ], [0, 0, 0x8104]);

    const capped = gunBench();
    seedGun(capped);
    seedPlayers(capped, 0, 0, 0);
    capped.ram.setU16(SCHED.a1Base, 0x8103);
    capped.ram.setU8(SCHED.a1Base + 0x04, 0);
    capped.ram.setU8(SCHED.a1Base + 0x05, 0x1e);
    capped.ram.setU8(SCHED.a1Base + 0x06, 0);
    capped.ram.setU8(A6 + 0x1d6, 2);
    capped.ram.setU16(A6 + 0x13e, 6);
    capped.ram.setU8(A6 + 0x1d7, 0x18);
    active(capped);
    assert.deepEqual([
      capped.ram.u8(A6 + 0x1d6), capped.ram.u16(A6 + 0x13e), capped.ram.u8(A6 + 0x1d7),
    ], [2, 6, 0x18]);
  });

test('W573 main and alternate gun-3 differentials remain explicit', { skip: SKIP }, () => {
  const main = gunBench();
  seedGun(main);
  main.ram.setU8(SCHED.a1Base + 0x04, 1);
  main.ram.setU8(SCHED.a1Base + 0x05, 2);
  main.ram.setU8(SCHED.a1Base + 0x14, 0);
  const flags = [9, 8, 7, 6, 5, 4];
  PARTS.forEach((part, i) => main.ram.setU8(A6 + part + 0x1e, flags[i]));
  active(main);
  assert.deepEqual(PARTS.map((part) => main.ram.u8(A6 + part + 0x1e)), flags,
    'main gun 3 writes no attachment flags');
  assert.deepEqual(main.calls.map((call) => [call.site, call.entry]), [
    [0x2a7f46, 0x281744], [0x2a7f60, 0x281744],
  ]);
  assert.notEqual(main.calls[1].regs.d4, 0, 'main preserves second D4');

  const alt = gunBench();
  seedGun(alt, altGun3Init2A9E84);
  alt.ram.setU8(SCHED.a1Base + 0x04, 1);
  alt.ram.setU8(SCHED.a1Base + 0x05, 2);
  alt.ram.setU8(SCHED.a1Base + 0x14, 0);
  alt.ram.setU16(HIBACHI_A1.freeze, 1);
  active(alt, altGun3Step2A9EB6);
  assert.deepEqual(alt.calls.map((call) => [call.site, call.entry]), [
    [0x2a9f5c, 0x2817b8], [0x2a9f78, 0x2817b8],
  ]);
  assert.equal(alt.calls[1].regs.d4, 0, 'alternate clears second D4');
  assert.equal(alt.ram.u16(SCHED.a1Base + 0x0e), 0x24,
    'alternate ignores the gun freeze');

  const attachmentFan = (alternate) => {
    const b = gunBench();
    seedGun(b, alternate ? altGun3Init2A9E84 : gun3Init2A7E64);
    b.ram.setU8(SCHED.a1Base + 0x04, 1);
    b.ram.setU8(SCHED.a1Base + 0x05, 2);
    b.ram.setU8(SCHED.a1Base + 0x14, 0);
    b.ram.setU16(HIBACHI_A1.loopWord, 1);
    b.ram.setU8(A5 + 0x0d, 0);
    b.ram.setU8(A6, 0x02);
    active(b, alternate ? altGun3Step2A9EB6 : gun3Step2A7E96);
    return b.calls.map((call) => call.results.length);
  };
  assert.deepEqual([attachmentFan(false), attachmentFan(true)], [[2, 2], [3, 3]],
    'main pair06 ignores attachment flags while alternate keeps its adaptive fan');

  const retire = (alternate) => {
    const b = gunBench();
    seedGun(b, alternate ? altGun3Init2A9E84 : gun3Init2A7E64);
    seedPlayers(b, 0, 0, 0);
    b.ram.setU16(SCHED.a1Base, 0x8103);
    b.ram.setU8(SCHED.a1Base + 0x04, 0);
    b.ram.setU8(SCHED.a1Base + 0x05, 0x1e);
    b.ram.setU8(SCHED.a1Base + 0x06, 0);
    b.ram.setU8(A6 + 0x1d6, 2);
    b.ram.setU16(A6 + 0x13e, 6);
    b.ram.setU8(A6 + 0x1d7, 0x0f);
    active(b, alternate ? altGun3Step2A9EB6 : gun3Step2A7E96);
    return b.ram.u8(A6 + 0x1d7);
  };
  assert.deepEqual([retire(false), retire(true)], [0x11, 0x13],
    'main adds 2 below $18 while alternate adds 4 below $10');
  assert.deepEqual([
    IMG.readUInt32BE(0x2a7f46 + 2), IMG.readUInt32BE(0x2a7f60 + 2),
    IMG.readUInt32BE(0x2a9f5c + 2), IMG.readUInt32BE(0x2a9f78 + 2),
  ], [0x281744, 0x281744, 0x2817b8, 0x2817b8]);
  assert.equal(IMG.readUInt16BE(0x2a7f5a), 0x1c2c,
    'main has no second moveq #0,D4');
  assert.equal(IMG.readUInt16BE(0x2a9f70), 0x7800,
    'alternate explicitly clears second D4');
});

test('W573 migrates lf146131 additively and pins every periodic frontier and blocker',
  { skip: SKIP_CHECKPOINT }, async () => {
    const live = await bundle();
    assert.equal(canonicalHash(live.tables), LIVE_TABLE_HASH);
    assert.deepEqual(live.tables, TABLE_JSON);
    const assets = { ...live, tables: W575_TABLE };
    assert.equal(canonicalHash(assets.tables), TABLE_HASH);
    assert.deepEqual(tableBeforeW576(TABLE_JSON), assets.tables,
      'strict additive W576 identity is proven before checkpoint migration');
    const exact = live;
    assert.deepEqual(tableBeforeW573(exact.tables), W572_TABLE,
      'strict additive identity composes through W576 before checkpoint migration');

    const historical = JSON.parse(readFileSync(HISTORICAL, 'utf8'));
    assert.deepEqual([
      historical.tablesSha256, historical.frame.logic, historical.frame.video,
      historical.raw.stage, historical.raw.stageX2, historical.raw.stageX4,
      historical.raw.loop, historical.ramSha256, historical.gameSha256,
      historical.selection.ship, historical.selection.style,
      historical.inputWord, historical.probeOnly.invulnerable,
    ], [
      W572_HASH, 146131, 156720, 4, 8, 16, 1,
      '7aa0a1797578457c05bc7ef4ac04cfcb8bd2091c58d3519552f6dce3bb673ada',
      '887b179b1c99fb62bb44a01fd57e790ac41e80502957f428afc6e64e4eeae5fc',
      0, 4, 65499, true,
    ]);
    restoreCheckpoint(historical, { ...exact, tables: W572_TABLE }, historical.selection);

    const migrated = JSON.parse(readFileSync(MIGRATED, 'utf8'));
    assert.deepEqual({ ...migrated, tablesSha256: historical.tablesSha256 }, historical,
      'migration changes only the additive cartridge-table identity');
    assert.deepEqual([
      migrated.tablesSha256, migrated.frame.logic, migrated.frame.video,
      migrated.ramSha256, migrated.gameSha256,
    ], [
      TABLE_HASH, 146131, 156720,
      historical.ramSha256, historical.gameSha256,
    ]);
    restoreCheckpoint(migrated, assets, migrated.selection);
    const currentMigrated = migrateW576(migrated);
    assert.deepEqual({ ...currentMigrated, tablesSha256: migrated.tablesSha256 }, migrated,
      'W576 migration changes only the proven additive cartridge-table identity');
    restoreCheckpoint(currentMigrated, exact, currentMigrated.selection);

    const periodics = [
      {
        file: '../probes/checkpoints/ship0-style4-lf00146631.json',
        identity: [146631, 157220, 4, 8, 16, 1,
          '559e579bff1c78593bb897633b109a5fff1cb725e5b82502a80b56daea4925b9',
          '47898057262476caccbcd31b841c40699ae059d721a9285ffdaee1e8baadbb0e'],
      },
      {
        file: '../probes/checkpoints/ship0-style4-lf00147131.json',
        identity: [147131, 157720, 4, 8, 16, 1,
          'b782600264cb2d0fa494be76451da1e6b04ff1dcb423c2aa97545fd007696adb',
          '9bac361ead354dd9b7778aacfce6b7409c53d9da166a8f871a1932ca588999db'],
      },
      {
        file: '../probes/checkpoints/ship0-style4-lf00147631.json',
        identity: [147631, 158220, 4, 8, 16, 1,
          'c63fba57effb9490ed814c76f12d791c3862f11ec912368960ca8654e5e7c528',
          '1472ca7c0f85a8ddbe2e7e56bfe43c1096f17cf2ec7065d7edf3915ddf78e0d9'],
      },
    ];
    for (const expected of periodics) {
      const document = JSON.parse(readFileSync(here(expected.file), 'utf8'));
      assert.deepEqual([
        document.tablesSha256, document.frame.logic, document.frame.video,
        document.raw.stage, document.raw.stageX2, document.raw.stageX4, document.raw.loop,
        document.ramSha256, document.gameSha256,
      ], [TABLE_HASH, ...expected.identity]);
      assert.deepEqual([
        document.selection.ship, document.selection.style,
        document.inputWord, document.probeOnly.invulnerable,
      ], [0, 4, 65499, true]);
      restoreCheckpoint(document, assets, { ship: 0, style: 4 });
      const current = migrateW576(document);
      assert.deepEqual({ ...current, tablesSha256: document.tablesSha256 }, document,
        'periodic checkpoint migration changes only table identity');
      restoreCheckpoint(current, exact, { ship: 0, style: 4 });
    }

    const resumed = restoreCheckpoint(currentMigrated, exact, currentMigrated.selection);
    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 7900; attempted++) {
      try {
        resumed.game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        resumed.game.step(resumed.probe.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }
    const attemptState = checkpointDocument(resumed.game, exact, {
      ...migrated.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
    });
    // W586 runs A0 id 8 and reaches the next loud shared frontier.
    assert.deepEqual([
      attempted, resumed.game.logicFrame, resumed.game.videoFrame,
      error?.romAddress, attemptState.ramSha256, attemptState.gameSha256,
    ], [
      7667, 153797, 164459, 0x291040,
      'e37340e127fade24b6bb4b1db8de479c66a8aed883c53a3c5b3bc10d6a45e30b',
      'ad99045f00e36a8a2343880bd4a7e14c3aaac1e7bbecc6f104603f6f7044d85a',
    ]);
    assert.match(error?.message ?? '', /word at \$291040 is outside every ROM window/);
  });
