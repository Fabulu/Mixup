// W216: Stage-4 type $A3 and its live Pool-A kinds 18/19.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { PaletteState } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { resetAndInstallStage26331E, runSpawnWalker, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { POOL_A, runPoolADriver } from '../src/bee.js';
import { SOUND, SoundState, postWrapper } from '../src/sound.js';

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

test('W216 exact Type-A3 closure and 49 newly shipped streams', { skip: SKIP }, () => {
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27d404));
  assert.ok(HANDLER_ADDRESSES.includes(0x27d674));
  assert.equal(sha(0x27d3fc, 0x0674),
    '3193172a838901091f9c3d464d11230fe6350d1f3dd21f666e088d63d1aaaec3');
  assert.equal(Buffer.from(ROM.bytes(0x27e52a, 8)).toString('hex'),
    '0027d3fc0027d674');
  assert.equal(Buffer.from(ROM.bytes(0x2370d8, 0x56)).toString('hex').length,
    0xac, 'the fixed movement stream remains exactly $56 bytes');

  const expected = [
    ['$27DA40', 8, 8, 8, 0], ['$186FD8', 1, 1, 1, 0],
    ['$1BD04C', 16, 16, 16, 0], ['$1BD68C', 16, 16, 16, 0],
    ['$1E2F5C', 8, 8, 8, 0], ['$1E3F9C', 8, 8, 0, 8],
  ];
  for (const [at, entries, distinct, added, already] of expected) {
    const h = manifest.spr.harvest.find((x) => x.at === at);
    assert.ok(h, `W216 harvest ${at}`);
    assert.deepEqual([h.entries, h.distinct, h.added, h.already],
      [entries, distinct, added, already]);
  }
  assert.equal(manifest.spr.streamCount, 3822);
});

test('W216 real clock-$234 carrier dies into Pool-A 18/19 and collects visibly',
  { skip: SKIP }, () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const palette = new PaletteState();
  ram.setU16(0x813092, 3);
  ram.setU16(0x813094, 6);
  resetAndInstallStage26331E(ram, ROM, log);
  ram.setU16(SPAWN.DISTANCE_CLOCK, 0x0234);
  ram.setU32(SPAWN.LIVE_CURSOR, 0x2360d0);
  assert.deepEqual(runSpawnWalker(ram, ROM, log, MT, undefined, palette),
    { script: 1, deferred: 0 });
  assert.equal(ram.u32(SPAWN.LIVE_CURSOR), 0x2360d8);

  const a5 = findType(ram, 0xa3);
  assert.ok(a5, 'type $A3 allocated');
  assert.equal(ram.u16(a5 + 4), 1, 'root plus one linked hitbox');
  const root = ram.u32(a5 + 6);
  const sounds = [];
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    soundPost: (addr) => sounds.push(addr) };

  // A frozen live pass still draws both parts without advancing its attack.
  ram.setU16(0x8130d2, 1);
  runHandler(0x27d674, ram, ROM, a5, ctx);

  // A linked fatal hit naturally creates one kind 19 and four kind 18 records:
  // two at each expanding cleanup boundary on the death pass.
  ram.setU16(root + 2, 0x2000);
  ram.setU16(root + 4, 0x2000);
  ram.setU16(a5 + 0x2c, 0);
  ram.setU8(root + 0x20, ram.u8(root + 0x20) | 0x04);
  ram.setU16(root + 0x38, 0xffff);
  runHandler(0x27d674, ram, ROM, a5, ctx);
  assert.equal(ram.u16(POOL_A.liveCount), 5);
  const statuses = [];
  for (let i = 0; i < 5; i++)
    statuses.push(ram.u16(POOL_A.base + i * POOL_A.stride));
  assert.deepEqual(statuses, [0x801c, 0x8018, 0x8018, 0x8018, 0x8018]);

  const first = runPoolADriver(ram, ROM, ctx);
  assert.deepEqual([first.live, first.emitted, first.freed], [5, 5, 0]);

  // P1 touches kind 19. The collision frame converts it to the zoomed arm and
  // awards BCD 1000; the next Pool-A pass draws the collected animation.
  ram.setU16(POOL_A.base, ram.u16(POOL_A.base) | 0x1000);
  const collision = runPoolADriver(ram, ROM, ctx);
  assert.equal(collision.collected, 1);
  assert.equal(ram.u8(POOL_A.base + 1) & 0x80, 0x80);
  const collected = runPoolADriver(ram, ROM, ctx);
  assert.equal(collected.collected, 1);
  assert.equal(collected.emitted, 5);
  assert.ok(sounds.includes(0x28c610), 'kind 19 collection cue posted');
});

test('W216 kind-18 collection cue arms its ROM debounce even on a full ring', () => {
  const ram = new Ram();
  const sound = new SoundState();
  ram.setU16(SOUND.head, 0);
  ram.setU16(SOUND.tail, 0x018c);
  assert.equal(postWrapper(ram, sound, 0x28c5e4), false);
  assert.equal(ram.u8(SOUND.debounceA), 2);
});
