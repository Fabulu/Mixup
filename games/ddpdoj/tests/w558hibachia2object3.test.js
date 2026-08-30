// W558: HIBACHI A2 OBJECT 3, `$2A4816..$2A4865`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import {
  SCHED, installScripts, a2Run2598E6, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import { BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';
import { HIBACHI_A2 } from '../src/hibachiend.js';
import { ROM_WINDOW_COUNT, tableBeforeW569 } from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const MANIFEST = here('../assets/manifest.json');
const STREAMS = here('../assets/spr/streams.u32.gz');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const SKIP_ASSETS = existsSync(MANIFEST) && existsSync(STREAMS) ? false
  : 'generated web assets absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);
const MT = SKIP ? null : new MoveTables(TABLE_JSON, ROM);
const A5 = 0x81332c;
const A6 = 0x81533c;
const PRIOR_TABLE_SHA256 = '4097e2791990bfa94677e254bc133f34c3a0c02cd5304a9c8e35c510ed6b1969';
const W558_TABLE_SHA256 = '194e8a881411bebaa23050afac4b5e41e42857146217f07ef92f9c7b6a0a9990';
const STORED_PRIOR_TABLE_SHA256 = 'd70eab3e9152e70ee51fc4d653b244c58d665b1b8908bb2e75caa05207ec7769';
const STORED_W558_TABLE_SHA256 = '250d097bf5c060d214fe690ef264b71a50225690909174320b3b921a76e33e1d';
const POST_W558_BASES = new Set([
  '$2A4B40', '$2A9318', '$2A934E', '$2A967A', '$2A96B6', '$2A97B6',
  '$2A9A68', '$2A9E50', '$2AA004', '$2AA040',
  '$29139E', '$2902CA', '$2902E2', '$2903E6', '$2903F2', '$29040A', '$29041A',
  '$290442', '$290462', '$29051A', '$29058E', '$2905A2', '$2905CA', '$2906C6',
]);

const beU16 = (address) => IMG.readUInt16BE(address);
const beU32 = (address) => IMG.readUInt32BE(address);
const canonicalHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

function bench() {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { bossRec: A5, bossSubRec: A6, tables: MT,
    unported: log, unportedLog: log };
  ram.setU32(A5 + 0x06, A6);
  installScripts(ram, ROM, { a2: HIBACHI_A2.table });
  ram.setU16(A6 + 0x062, 0xff80);
  ram.setU16(A6 + 0x064, 0xffc0);
  ram.setU32(A6 + 0x066, 0x00010080);
  ram.setU16(A6 + 0x06e, 0x1670);
  ram.setU16(A6 + 0x07a, 0x003f);
  ram.setU16(A6 + 0x07c, 0xabcd);
  ram.setU8(A6 + 0x0e9, 0x12);
  ram.setU16(A6 + 0x1fa, 0x01f0);
  return { ram, ctx };
}

const requestHex = (ram, index = 0) => Buffer.from(Array.from(
  { length: RECORD_BYTES }, (_, i) => ram.u8(BUCKETS[1].buffer + index * RECORD_BYTES + i),
)).toString('hex');

test('W558 pins object 3, its complete table, object 4, and the additive window proof',
  { skip: SKIP }, () => {
    assert.deepEqual(HIBACHI_A2, {
      table: 0x2a46b2,
      objects: 19,
      object0: 0x2a4702,
      object0CodeEnd: 0x2a4772,
      object0Art: 0x2a4774,
      object0ArtFrames: 6,
      object1: 0x2a478c,
      object1CodeEnd: 0x2a47d4,
      object1Art: 0x00116768,
      object2: 0x2a47d6,
      object2CodeEnd: 0x2a4814,
      object2Art: 0x00101728,
      object3: 0x2a4816,
      object3CodeEnd: 0x2a4864,
      object3Art: 0x2a49f6,
      object3ArtFrames: 64,
      object4: 0x2a4866,
      object4CodeEnd: 0x2a48b4,
      object5: 0x2a48b6,
      object5CodeEnd: 0x2a4904,
      object6: 0x2a4906,
      object6CodeEnd: 0x2a4954,
      object7: 0x2a4956,
      object7CodeEnd: 0x2a49a4,
      object8: 0x2a49a6,
      object8CodeEnd: 0x2a49f4,
      object9: 0x2a4af6,
      object9CodeEnd: 0x2a4b3e,
      object9Art: 0x2a4b40,
      object9ArtFrames: 6,
      object10: 0x2a4c42,
      object10CodeEnd: 0x2a4c6a,
      object10Table: 0x2a4c6c,
      object10Rows: 24,
      object10Stride: 6,
      object11: 0x2a4b58,
      object11CodeEnd: 0x2a4b9e,
      object12: 0x2a4bc8,
      object12CodeEnd: 0x2a4c06,
      object13: 0x2a4ba0,
      object13CodeEnd: 0x2a4bc6,
      object14: 0x2a4c08,
      object14CodeEnd: 0x2a4c34,
      object14Art: 0x2a4c36,
      object14ArtFrames: 3,
      object15: 0x2a4af6,
      object16: 0x2a4cfc,
      object16CodeEnd: 0x2a4d3c,
      object16Art: 0x2a4d3e,
      object16ArtFrames: 8,
      object17: 0x2a4d5e,
      object18: 0x2a4de0,
      object18CodeEnd: 0x2a4e14,
      object18Art: 0x2a4e16,
      object18ArtFrames: 16,
    });
    assert.equal(beU16(HIBACHI_A2.object3), 0x303c, '$2A4816 starts move.w #$A00,D0');
    assert.equal(beU16(0x2a482e), 0x41fa, '$2A482E loads the shared art table');
    assert.equal(beU16(0x2a485e), 0x4ef9, '$2A485E is the tail jmp');
    assert.equal(beU32(0x2a4860), 0x23dfea, 'the tail target is the bucket-1 stub');
    assert.equal(beU16(HIBACHI_A2.object3CodeEnd), 0x4e71, '$2A4864 is alignment nop');
    assert.equal(beU16(HIBACHI_A2.object4), 0x303c, '$2A4866 begins object 4');
    assert.equal(ROM.u32(HIBACHI_A2.table + 12), HIBACHI_A2.object3);
    assert.equal(ROM.u32(HIBACHI_A2.table + 16), HIBACHI_A2.object4);
    assert.ok(scriptAddresses().includes(HIBACHI_A2.object3));

    const window = TABLE_JSON.rom.windows.find((w) => w.base === '$2A49F6');
    assert.equal(TABLE_JSON.rom.windows.length, ROM_WINDOW_COUNT);
    assert.equal(window?.len, 0x100);
    assert.equal(window?.hex, IMG.subarray(HIBACHI_A2.object3Art, HIBACHI_A2.object3Art + 0x100)
      .toString('hex'));
    for (let i = 0; i < HIBACHI_A2.object3ArtFrames; i++) {
      assert.equal(ROM.u32(HIBACHI_A2.object3Art + i * 4), beU32(HIBACHI_A2.object3Art + i * 4));
    }
    const w568 = tableBeforeW569(TABLE_JSON, { preserveW623: true });
    const w558 = { ...w568, rom: { ...w568.rom,
      windows: w568.rom.windows.filter((w) => !POST_W558_BASES.has(w.base)) } };
    assert.equal(w558.rom.windows.length, 816);
    assert.equal(canonicalHash(w558), W558_TABLE_SHA256,
      'stripping W560, W562, and W563 reconstructs the adopted W558 identity');
    const storedW558 = { ...w558, rom: { ...w558.rom,
      windows: w558.rom.windows.filter((w) => w.base !== '$259512') } };
    assert.deepEqual([storedW558.rom.windows.length, canonicalHash(storedW558)],
      [815, STORED_W558_TABLE_SHA256],
      'removing only the W623 route window recovers the stored W558 identity');
    const prior = { ...w558, rom: { ...w558.rom,
      windows: w558.rom.windows.filter((w) => w.base !== '$2A49F6') } };
    assert.equal(prior.rom.windows.length, 815);
    assert.equal(canonicalHash(prior), PRIOR_TABLE_SHA256,
      'removing exactly the W558 window reconstructs the adopted prior table identity');
    const storedPrior = { ...prior, rom: { ...prior.rom,
      windows: prior.rom.windows.filter((w) => w.base !== '$259512') } };
    assert.deepEqual([storedPrior.rom.windows.length, canonicalHash(storedPrior)],
      [814, STORED_PRIOR_TABLE_SHA256],
      'removing only the W623 route window recovers the stored prior table identity');
  });

test('W558 object 3 updates offsets, emits exact registers, and persists',
  { skip: SKIP }, () => {
    const b = bench();
    const slot = SCHED.a2Base + SCHED.a2Stride * 3;
    assert.equal(b.ram.u16(slot), 0x8000);
    assert.equal(b.ram.u32(slot + 2), HIBACHI_A2.object3);
    a2Run2598E6(b.ram, 3);
    assert.equal(b.ram.u16(slot), 0x8001);

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u16(A6 + 0x070), 0x0bf0);
    assert.equal(b.ram.u16(A6 + 0x072), 0x0410);
    assert.equal(b.ram.u16(A6 + 0x1fa), 0x01f0, 'object 3 reads but does not change the vector');
    assert.equal(b.ram.u16(A6 + 0x07a), 0x003f, 'object 3 reads but does not change the art index');
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES);
    assert.equal(requestHex(b.ram), '80058001001165341670ab12',
      'the long offset keeps low-word carry and move.b preserves D4 high byte');
    assert.equal(b.ram.u16(slot), 0x8001, 'object 3 does not retire itself');

    assert.equal(runScheduler25962E(b.ram, ROM, b.ctx), false);
    assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * 2);
    assert.equal(requestHex(b.ram, 1), '80058001001165341670ab12');
    assert.equal(b.ram.u16(slot), 0x8001, 'object 3 persists across later dispatches');
  });

test('W558 objects 3 through 9 emit before the later W576 object 10 completes', { skip: SKIP }, () => {
  const b = bench();
  for (let id = 3; id <= 10; id++) a2Run2598E6(b.ram, id);
  const error = caught(() => runScheduler25962E(b.ram, ROM, b.ctx));
  assert.equal(error, null, 'W576 ports object 10 and its exact selector table');
  for (let id = 3; id <= 10; id++) {
    assert.equal(b.ram.u16(SCHED.a2Base + SCHED.a2Stride * id), 0x8001);
  }
  assert.equal(b.ram.u16(BUCKETS[1].counter), RECORD_BYTES * 8,
    'objects 3 through 10 all emit in ascending scheduler order');
  assert.equal(requestHex(b.ram, 7), '87f88380001032080f000014',
    'object 10 emits the exact first W576 selector row after object 9');
  assert.equal(requestHex(b.ram), '80058001001165341670ab12');
});

test('W558 ships all 64 shared part frames in the boss shard', { skip: SKIP_ASSETS }, () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.deepEqual(manifest.spr.harvest.find((row) => row.at === '$2A49F6'), {
    shard: 17, at: '$2A49F6', entries: 64, stride: 4, distinct: 64,
    runsTo: 64, endsAt: '$2A4AF6', added: 64, already: 0,
    promoted: 0, promotedFrom: [],
  });
  const raw = gunzipSync(readFileSync(STREAMS));
  const flat = new Uint32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const rows = new Map();
  let offs = 0, base = 0;
  for (let i = 0; i < manifest.spr.streamCount; i++) {
    offs = (offs + flat[i]) >>> 0;
    base = (base + flat[manifest.spr.streamCount + i]) >>> 0;
    rows.set(offs, { base, maskWords: flat[manifest.spr.streamCount * 2 + i] });
  }
  const first = beU32(HIBACHI_A2.object3Art);
  const last = beU32(HIBACHI_A2.object3Art + (HIBACHI_A2.object3ArtFrames - 1) * 4);
  // W630 inserts 7,956 mask words in boot shard 0, shifting both bases but not their extents.
  assert.deepEqual(rows.get(first), { base: 2496744, maskWords: 562 });
  assert.deepEqual(rows.get(last), { base: 2532150, maskWords: 562 });
  for (let i = 0; i < HIBACHI_A2.object3ArtFrames; i++) {
    assert.equal(rows.get(beU32(HIBACHI_A2.object3Art + i * 4))?.maskWords, 562);
  }
  const shard = manifest.spr.shards[17];
  assert.equal(manifest.spr.streamCount, 5963,
    'W630 adds exactly 70 boot-shard name-entry streams to the prior 5,893');
  assert.equal(shard.streams, 1579);
  assert.equal(shard.maskLen, 915358);
  assert.equal(shard.colLen, 2297683);
  assert.equal(manifest.spr.maskUsed, 2958942,
    'W630 adds exactly 7,956 mask words to the prior bundle');
  assert.equal(manifest.spr.colUsed, 7378905,
    'W630 adds exactly 10,296 colour words to the prior bundle');
});
