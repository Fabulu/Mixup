// W211: Stage-4 install/census, clock-0 terrain, and type-$A6 opening pulse.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN,
  stageTableEntry } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { backgroundInit, backgroundFrame, BGO, BGRAM, BgVram, ESLOT } from
  '../src/background.js';
import { BUCKETS } from '../src/spritequeue.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const manifestPath = new URL('../assets/manifest.json', import.meta.url);
const HAVE = existsSync(tablesPath) && existsSync(manifestPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const manifest = HAVE ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables/assets absent; skip, not pass';

function sha(at, len) {
  return createHash('sha256').update(Buffer.from(ROM.bytes(at, len))).digest('hex');
}

function findType(ram, type) {
  for (let i = 0; i < ENEMY.slots; i++) {
    const a5 = ENEMY.table + i * ENEMY.stride;
    if (ram.u16(a5) !== 0 && ram.u8(a5 + 0x0c) === type) return a5;
  }
  return 0;
}

test('W211 static Stage-4 census, resource, terrain, and opening closure',
  { skip: SKIP }, () => {
  assert.deepEqual(stageTableEntry(ROM, 3),
    { script: 0x2358b0, aux: 0x2364a8, res: 0x2365e2 });
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27896a));
  assert.ok(HANDLER_ADDRESSES.includes(0x278994));

  const counts = new Map();
  let cursor = 0x2358b0;
  while (ROM.u16(cursor) !== 0xffff) {
    const type = ROM.u8(cursor + 4);
    counts.set(type, (counts.get(type) ?? 0) + 1);
    cursor += 8;
  }
  assert.equal((cursor - 0x2358b0) / 8, 382);
  assert.equal(cursor, 0x2364a0);
  assert.equal(counts.size, 29);
  assert.deepEqual([counts.get(0xa6), counts.get(0x9b), counts.get(0xa2),
    counts.get(0x9c), counts.get(0xa3)], [1, 5, 8, 11, 8]);
  assert.equal(sha(0x2358b0, 0x20c8),
    '2fa38d0abdb5c2b24cfc9bcc856ca18a9ec8c2eca355e034f52f8ae7e3bfad61');
  assert.equal(sha(0x22b1e8, 0x1d88),
    '96450a8f3f94309e5b9831ae185646673947d8d30d77197473340dfa54f043c2');
  assert.equal(sha(0x22cf70, 0x0800),
    'fe176c2c7feb4bee4104255442e3a354999f236a943d7b71547cc4f6d0720ee6');
  assert.equal(sha(0x278962, 0x008c),
    '8ee685c36b89af9ad462215c97bb781cc8ba3b71df6ea7fb5677339896372760');
  assert.equal(sha(0x263180, 0x0054),
    'e33cb72a320794991d086a491baaaffce20d2afffd31944971fe58fb8b9431cb');

  const bg = manifest.gfx.bg.shards.find((s) => s.kind === 'stage4');
  assert.ok(bg, 'Stage-4 deferred background shard');
  assert.equal(bg.tiles, 1890);
  const art = manifest.spr.harvest.find((h) => h.at === '$2622EA');
  assert.ok(art, 'clock-0 Stage-4 BGELEM id-5 art harvest');
  assert.deepEqual([art.entries, art.distinct], [1, 1]);
  assert.equal(manifest.spr.streamCount, 3788);
});

test('W211 real Stage-4 opening installs terrain, draws id 5, and pulses A6',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const bgA5 = 0x80e240;
  const vram = new BgVram();
  const scrollEvents = [];
  const ctx = { unportedLog: log, soundPost() {},
    scrollEvent: (e) => scrollEvents.push(e) };

  ram.setU16(BGRAM.stageX4, 12);
  ram.setU16(bgA5 + BGO.entryClock, 0);
  backgroundInit(ram, ROM, vram, ctx, bgA5);
  assert.equal(ram.u32(BGRAM.elemTable), 0x2622d6);
  backgroundFrame(ram, ROM, vram, ctx, bgA5);
  const elem = BGRAM.elemSlots;
  assert.deepEqual([ram.u8(elem + ESLOT.active), ram.u32(elem + ESLOT.update),
    ram.u32(elem + ESLOT.data), ram.u16(elem + ESLOT.yPos)],
  [0x80, 0x26319e, 0x2ccc74, 0x2f20]);
  assert.ok(scrollEvents.some((e) => e.kind === 'bgelem' && e.id === 5));
  assert.equal(ram.u16(BUCKETS[2].counter), 12);
  assert.equal(ram.u32(BUCKETS[2].buffer + 4), 0x2ccc74);

  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 1);
  resetAndInstallStage26331E(ram, ROM, log);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT), { script: 1, deferred: 0 });
  const a5 = findType(ram, 0xa6);
  assert.ok(a5, 'clock-1 type $A6 allocation');
  const a6 = ram.u32(a5 + 0x06);
  assert.equal(ram.u16(a6 + 0x06), 7);
  assert.equal(ram.u32(a5 + 0x4c), 0x278994);

  for (let i = 0; i < 8; i++) runHandler(0x278994, ram, ROM, a5, {});
  assert.equal(ram.u16(0x8130da), 1);
  runHandler(0x278994, ram, ROM, a5, {});
  assert.equal(ram.u16(0x8130da), 0);
  for (let i = 0; i < 7; i++) runHandler(0x278994, ram, ROM, a5, {});
  assert.equal(ram.u16(0x8130da), 0xffff);

  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x02e0);
  runHandler(0x278994, ram, ROM, a5, {});
  assert.equal(ram.u16(a5), 0);
});
