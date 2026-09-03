import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DMG, runNativeOutgoingShotCollision } from '../src/damage.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { E } from '../src/spark.js';
import { HYPER } from '../src/hyper.js';
import { SOUND, SoundState, postWrapper } from '../src/sound.js';
import { S } from '../src/shots.js';
import { WHITE_PLAYER } from '../src/white-player.js';
import { WHITE_BULLET_DRIVER_RESOURCES } from '../src/white-bullets.js';
import {
  WHITE_SHOT, WHITE_SHOT_LIFECYCLE_RESOURCES, WHITE_SHOT_PRODUCER_RESOURCES,
  WHITE_SPARK_RESOURCES, createWhiteStage1ShotHandlers, spawnWhitePlayerShot,
} from '../src/white-shots.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
assert.ok(existsSync(TABLES),
  `${TABLES} missing; run: python games/ddpdoj/tools/export-tables.py`);
const tables = JSON.parse(readFileSync(TABLES, 'utf8'));
const rom = new RomWindows(tables.rom);
const P = WHITE_LABEL_PROFILE.ramLayout.playerFields;

function guardedRom() {
  const reads = [];
  const guarded = new Proxy(rom, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (address, ...args) => {
        if (Number.isSafeInteger(address)) reads.push(address);
        return Reflect.apply(value, target, [address, ...args]);
      };
    },
  });
  return { guarded, reads };
}

function manifestRanges() {
  const white = tables.editions.whiteLabel;
  return [
    ...white.playerWindows,
    ...white.shotProducerWindows,
    ...white.shotRuntimeWindows,
    ...white.shotSpeedWindows,
    ...white.bulletRuntimeWindows,
    ...white.bulletSpeedWindows,
  ].map(({ base, len }) => ({ base: parseInt(base.slice(1), 16), len }));
}

function covered(ranges, address, size = 1) {
  return ranges.some((range) =>
    range.base <= address && address + size <= range.base + range.len);
}

function setProducerState(ram, ownerIndex, { ship, style, power, hyper }) {
  const resources = WHITE_SHOT_PRODUCER_RESOURCES[ownerIndex];
  const rec = resources.player;
  const rowOffset = (((style - 2) * 2 + ship) * 4) & 0xffff;
  ram.setU32(resources.countPointer, rom.u32(WHITE_PLAYER.powerRows + rowOffset));
  ram.setU16(resources.gate308c, 1);
  ram.setU16(rec, 0x8000);
  ram.setU16(rec + P.posY, 0x1800);
  ram.setU16(rec + P.posX, ownerIndex === 0 ? 0x1400 : 0x2800);
  ram.setU8(rec + P.flags1, hyper ? 1 : 0);
  ram.setU16(rec + 0x20, power);
  ram.setU16(rec + 0x42, 0);
  ram.setU16(rec + 0x44, 4);
  ram.setU8(rec + 0x56, 0x20 + ownerIndex);
  ram.setU16(rec + 0x58, ship);
  ram.setU16(rec + 0x5a, style);
  return { resources, rec };
}

function activeRecords(ram, resources) {
  const records = [];
  for (let i = 0; i < resources.slots; i++) {
    const rec = resources.pool + i * resources.stride;
    if (ram.u16(rec) !== 0) records.push(rec);
  }
  return records;
}

function putEnemy(ram, { y, x, hp = 0x0100 } = {}) {
  const rec = DMG.poolA;
  ram.setU16(DMG.poolACount, 1);
  ram.setU16(rec, 0xa000);
  ram.setU16(rec + 0x02, y);
  ram.setU16(rec + 0x04, x);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) ram.setU16(rec + offset, 0x0400);
  ram.setU16(rec + 0x18, hp);
  return rec;
}

function putCollisionShot(ram, base, { y = 0x1800, x = 0x2000, power = 0x0400 } = {}) {
  ram.setU16(base, 0x8000);
  ram.setU16(base + S.posY, y);
  ram.setU16(base + S.posX, x);
  for (const offset of [0x10, 0x12, 0x14, 0x16]) ram.setU16(base + offset, 0x0100);
  ram.setU16(base + S.hp, power);
  return base;
}

test('White shot authority rejects Black before RAM or cartridge access', () => {
  let touches = 0;
  const untouched = new Proxy({}, {
    get() {
      touches++;
      throw new Error('protected input was touched');
    },
  });
  assert.throws(
    () => createWhiteStage1ShotHandlers(untouched, BLACK_LABEL_PROFILE),
    /White Label Stage 1 shot handler map is unavailable/,
  );
  assert.throws(
    () => spawnWhitePlayerShot(untouched, untouched, 0, null, 0, BLACK_LABEL_PROFILE),
    /White Label Stage 1 shot producer is unavailable/,
  );
  assert.equal(touches, 0);
});

test('White shot manifest is exact, sparse, Build A-only authority', () => {
  const white = tables.editions.whiteLabel;
  assert.deepEqual(white.shotProducerWindows, [
    { base: '$154AA6', len: 0x0018 },
    { base: '$154ABE', len: 0x0008 },
    { base: '$154ACE', len: 0x0008 },
    { base: '$154AD6', len: 0x0018 },
    { base: '$154AEE', len: 0x0140 },
    { base: '$14CF60', len: 0x0174 },
    { base: '$14D0D4', len: 0x03b6 },
    { base: '$14D69C', len: 0x0174 },
    { base: '$14D810', len: 0x03b6 },
    { base: '$14DDF8', len: 0x000c },
    { base: '$14DE28', len: 0x000c },
    { base: '$14DE58', len: 0x000c },
    { base: '$14DE88', len: 0x0008 },
    { base: '$14DEB0', len: 0x0008 },
    { base: '$14DED8', len: 0x0008 },
    { base: '$14DF00', len: 0x0010 },
    { base: '$14DF30', len: 0x0010 },
    { base: '$14DF60', len: 0x0010 },
    { base: '$14DF70', len: 0x03b6 },
    { base: '$14E558', len: 0x000c },
    { base: '$14E588', len: 0x000c },
    { base: '$14E5B8', len: 0x000c },
    { base: '$14E5E8', len: 0x0008 },
    { base: '$14E610', len: 0x0008 },
    { base: '$14E638', len: 0x0008 },
    { base: '$14E660', len: 0x0010 },
    { base: '$14E690', len: 0x0010 },
    { base: '$14E6C0', len: 0x0010 },
    { base: '$14E6D0', len: 0x03b6 },
  ]);
  assert.deepEqual(white.shotRuntimeWindows.filter(({ base }) => base === '$189042'), [
    { base: '$189042', len: 0x00a6 },
  ]);
  assert.deepEqual(white.shotSpeedLevels, WHITE_SHOT.speedLevels);
  assert.equal(white.shotSpeedWindows.length, WHITE_SHOT.speedLevels.length * 2 - 10,
    'five movement speeds reuse their exact pointer and quadrant windows');
  const ranges = manifestRanges();
  assert.ok(ranges.every(({ base, len }) => base >= 0 && base + len <= 0x200000));
  assert.equal(covered(ranges, 0x154ac6, 8), false,
    'the unused secondary style-4 root cells remain unauthorized');
  assert.equal(covered(ranges, 0x200000), false);

  assert.deepEqual(Array.from({ length: 16 }, (_, index) =>
    rom.u32(WHITE_SHOT.dispatchTable + index * 4)), WHITE_SHOT.dispatchEntries);
});

test('both owners produce every ship, style, power, and hyper variant in isolation', () => {
  const { guarded, reads } = guardedRom();
  const ranges = manifestRanges();
  let scenarios = 0;
  for (const ownerIndex of [0, 1]) {
    for (const ship of [0, 2]) {
      for (const style of [2, 4, 6]) {
        for (const power of [0, 2, 4, 6, 8]) {
          for (const hyper of [false, true]) {
            const ram = new Ram();
            const { resources, rec } = setProducerState(
              ram, ownerIndex, { ship, style, power, hyper },
            );
            const other = WHITE_SHOT_PRODUCER_RESOURCES[ownerIndex ^ 1];
            spawnWhitePlayerShot(ram, guarded, rec, {}, ownerIndex);
            const active = activeRecords(ram, resources);
            assert.equal(active.length, style === 4 ? 1 : 2);
            assert.deepEqual(new Set(active.map((record) => ram.u16(record) & 0x0f)),
              new Set([(ship === 2 ? 1 : 0) | (hyper ? 4 : 0)]));
            assert.deepEqual(activeRecords(ram, other), [],
              `owner ${ownerIndex} wrote owner ${ownerIndex ^ 1}'s pool`);
            scenarios++;
          }
        }
      }
    }
  }
  assert.equal(scenarios, 120);
  assert.ok(reads.length > 1000);
  assert.ok(reads.every((address) => address < 0x200000));
  assert.ok(reads.every((address) => covered(ranges, address)),
    'every producer read belongs to an exact White cartridge window');
});

test('Build A ship fire maps its exact wrapper into the live sound runtime', () => {
  const ram = new Ram();
  const sound = new SoundState();
  const posted = [];
  const { resources, rec } = setProducerState(
    ram, 0, { ship: 0, style: 4, power: 0, hyper: false },
  );
  assert.equal(resources.ship0Sound, 0x18aee0);
  assert.equal(resources.soundPolicy, 'mapped');
  assert.deepEqual(resources.soundRequestMap, {
    0x18aee0: 0x28c3ba,
    0x18aefa: 0x28c3d4,
    0x18af14: 0x28c3ee,
  });
  spawnWhitePlayerShot(ram, rom, rec, {
    soundPost(address) {
      posted.push(address);
      return postWrapper(ram, sound, address);
    },
  }, 0);
  assert.deepEqual(posted, [0x28c3ba],
    '$18AEE0 maps to the exact equivalent runtime wrapper instead of escaping Build A');
  assert.equal(sound.postCount, 1);
  assert.equal(ram.u16(SOUND.tail), 4);
});

test('type 5 first frame resets only spark state and both 36-record shot pools recur', () => {
  const ram = new Ram();
  const slot = 0x812000;
  const handlers = createWhiteStage1ShotHandlers(rom);
  const tick = handlers.get(0x05);
  assert.equal(handlers.size, 1);
  assert.equal(typeof tick, 'function');

  ram.setU16(WHITE_SHOT.p1Pool, 0x8048);
  ram.setU16(WHITE_SPARK_RESOURCES.p1Base + E.status, 0x8014);
  ram.setU16(WHITE_SPARK_RESOURCES.count, 1);
  ram.setU16(WHITE_SPARK_RESOURCES.budget, 0x1234);
  assert.deepEqual(tick(ram, slot, 0, {}), { phase: 'reset', shotsProcessed: 0 });
  assert.equal(ram.u8(slot + 2), 1);
  assert.equal(ram.u16(WHITE_SHOT.p1Pool), 0x8048,
    'the private first-frame reset does not erase an ordinary-shot owner pool');
  assert.equal(ram.u16(WHITE_SPARK_RESOURCES.p1Base + E.status), 0);
  assert.equal(ram.u16(WHITE_SPARK_RESOURCES.count), 0);
  assert.equal(ram.u16(WHITE_SPARK_RESOURCES.budget), 0);
  ram.setU16(WHITE_SHOT.p1Pool, 0);

  for (const ownerIndex of [0, 1]) {
    const { resources, rec } = setProducerState(
      ram, ownerIndex, { ship: 0, style: 4, power: 0, hyper: false },
    );
    spawnWhitePlayerShot(ram, rom, rec, {}, ownerIndex);
    const [shot] = activeRecords(ram, resources);
    assert.ok(shot);
    ram.setU16(shot, 0x8048);
    ram.setU16(shot + S.posY, 0x7fff);
    ram.setU16(shot + S.velY, 1);
  }
  const frame = tick(ram, slot, 0, {});
  assert.equal(frame.phase, 'recurring');
  assert.equal(frame.shotsProcessed, 2);
  assert.equal(ram.u16(WHITE_SHOT.liveCount), 2,
    'the live count observes both native 36-record pools before their cull');
  assert.equal(ram.u16(WHITE_SHOT.p1Pool), 0);
  assert.equal(ram.u16(WHITE_SHOT.p2Pool), 0);
});

test('recurring type 5 runs each subsystem once in exact Build A order', () => {
  const calls = [];
  const modes = [];
  const ctx = {
    whiteType5SubsystemHook(call) {
      calls.push([call.call, call.target]);
      modes.push(ram.u16(WHITE_BULLET_DRIVER_RESOURCES.modeWord));
    },
  };
  const ram = new Ram();
  const slot = 0x812000;
  const { guarded, reads } = guardedRom();
  const tick = createWhiteStage1ShotHandlers(guarded).get(0x05);

  tick(ram, slot, 0, ctx);
  assert.deepEqual(calls, [], 'the first-frame guard branches before recurring work');

  const bullet = WHITE_BULLET_DRIVER_RESOURCES.pool;
  ram.setU16(bullet, 0x8003);
  ram.setU16(bullet + 0x02, 0x2000);
  ram.setU16(bullet + 0x04, 0x2000);
  ram.setU16(WHITE_BULLET_DRIVER_RESOURCES.armWord, 1);
  ram.setU16(WHITE_BULLET_DRIVER_RESOURCES.modeWord, 0x8000);

  ram.setU16(HYPER.p1.player, 0x8000);
  ram.setU16(HYPER.p1.bonus, 1);
  ram.setU16(HYPER.p1.stock, 1);
  ram.setU16(HYPER.phase, 1);
  ram.setU16(HYPER.p1.bonusFrame, 0);
  ram.setU32(HYPER.p1.bonusPos, 0x001c4410);
  ram.setU16(HYPER.stockDrawGateP1, 1);
  ram.setU32(HYPER.p1.stockAnimPos, 0x001c3f14);

  const frame = tick(ram, slot, 0, ctx);
  assert.deepEqual(calls, [
    [0x18a134, 0x17e9de],
    [0x18a14c, 0x15302c],
    [0x18a164, 0x188bd4],
    [0x18a194, 0x180d3a],
    [0x18a19a, 0x152b5a],
    [0x18a1a0, 0x151fde],
    [0x18a1a6, 0x152106],
    [0x18a1ac, 0x18a1ac],
  ]);
  assert.deepEqual(modes.slice(0, 4), [0x8000, 0x8000, 0x8000, 0x8000]);
  assert.deepEqual(modes.slice(4), [0, 0, 0, 0],
    'the clear timer expires before both presentation calls and collision');
  assert.equal(frame.bulletFrame.cleared, 1);
  assert.equal(ram.u16(bullet) & 0x4000, 0x4000,
    'the bullet driver sees the armed transform before the timer clears its mode');
  assert.equal(frame.bonusFollowers, 1);
  assert.equal(frame.hyperStockAnimations, 1);
  assert.equal(reads.includes(0x151fd0), true,
    'the authentic White bonus-follower frame table is read');
  assert.ok(reads.every((address) => address < 0x200000));
  assert.ok(reads.every((address) => covered(manifestRanges(), address)),
    'every recurring type-5 read belongs to an exact White cartridge window');
});

test('driver, collision, hit response, impact spark, and finite drains keep native order', () => {
  const ram = new Ram();
  const slot = 0x812000;
  ram.setU8(slot + 2, 1);
  const { guarded, reads } = guardedRom();
  const tick = createWhiteStage1ShotHandlers(guarded).get(0x05);
  const sound = new SoundState();
  const impactRequests = [];
  const ctx = {
    soundPost(address) {
      impactRequests.push(address);
      return postWrapper(ram, sound, address);
    },
  };
  assert.equal(WHITE_SHOT_LIFECYCLE_RESOURCES.impactSound, 0x18b23a);
  assert.equal(WHITE_SHOT_LIFECYCLE_RESOURCES.impactSoundRequest, 0x28c714);
  const { resources, rec: player } = setProducerState(
    ram, 0, { ship: 0, style: 4, power: 0, hyper: false },
  );
  spawnWhitePlayerShot(ram, guarded, player, {}, 0);
  const [shot] = activeRecords(ram, resources);
  assert.ok(shot);
  ram.setU16(DMG.gate308c, 1);
  ram.setU16(DMG.mirror2, 0);
  ram.setU16(DMG.p1rec, 0x8000);
  ram.setU16(DMG.p2rec, 0);
  ram.setU16(DMG.poolACount, 0);
  ram.setU16(DMG.poolBCount, 0);

  tick(ram, slot, 0, ctx);
  tick(ram, slot, 0, ctx);
  assert.equal(ram.u16(shot) & 0x0f, 0,
    'the producer record remains in its carried entry for two frames');

  ram.setU16(shot + S.hp, 0x0400);
  const enemy = putEnemy(ram, { y: ram.u16(shot + S.posY), x: ram.u16(shot + S.posX) });
  const collisionFrame = tick(ram, slot, 0, ctx);
  assert.equal(collisionFrame.collision.ownerIndex, 0);
  assert.equal(collisionFrame.collision.mask, 0x1000);
  assert.equal(collisionFrame.collision.hitsA, 1);
  assert.equal(collisionFrame.sparkFrame.live, 0,
    'collision runs after the shot and spark drivers, so impact allocation waits one frame');
  assert.equal(ram.u8(shot + S.lowByte) & 0x80, 0x80);
  assert.equal(ram.u16(enemy) & 0x1000, 0x1000);

  ram.setU16(DMG.poolACount, 0);
  const hitFrame = tick(ram, slot, 0, ctx);
  assert.deepEqual(impactRequests, [0x28c714],
    '$18B23A maps to the exact live impact wrapper on the first hit');
  assert.equal(sound.postCount, 1);
  assert.equal(hitFrame.sparkFrame.live, 1,
    'the next shot pass consumes the hit bit before the spark driver drains its allocation');
  assert.ok(hitFrame.sparkFrame.records > 0);
  assert.ok(ram.u16(WHITE_SPARK_RESOURCES.count) > 0);

  let frames = 0;
  while ((ram.u16(shot) !== 0 || ram.u16(WHITE_SPARK_RESOURCES.count) !== 0)
      && frames < 128) {
    tick(ram, slot, 0, ctx);
    frames++;
  }
  assert.ok(frames < 128, 'the shot and its impact spark drain in finite time');
  assert.equal(ram.u16(shot), 0);
  assert.equal(ram.u16(WHITE_SPARK_RESOURCES.count), 0);
  assert.ok(reads.length > 0);
  assert.ok(reads.every((address) => address < 0x200000));
  assert.ok(reads.every((address) => covered(manifestRanges(), address)));
});

test('outgoing collision preserves P1/P2 masks and native owner selection', () => {
  const run = ({ mirror, p1Live, p2Live }) => {
    const ram = new Ram();
    ram.setU16(DMG.gate308c, 1);
    ram.setU16(DMG.mirror2, mirror);
    ram.setU16(DMG.p1rec, p1Live ? 0x8000 : 0);
    ram.setU16(DMG.p2rec, p2Live ? 0x8000 : 0);
    putCollisionShot(ram, DMG.p1shots, { x: 0x1400 });
    putCollisionShot(ram, DMG.p2shots, { x: 0x2800 });
    ram.setU16(DMG.poolACount, 0);
    ram.setU16(DMG.poolBCount, 0);
    return { ram, result: runNativeOutgoingShotCollision(ram, {}) };
  };

  const p1 = run({ mirror: 0, p1Live: true, p2Live: true });
  assert.deepEqual([p1.result.ran, p1.result.ownerIndex, p1.result.mask], [true, 0, 0x1000]);
  assert.equal(p1.ram.u16(DMG.fa72), 0x1000);

  const p2 = run({ mirror: 1, p1Live: false, p2Live: true });
  assert.deepEqual([p2.result.ran, p2.result.ownerIndex, p2.result.mask], [true, 1, 0x0800]);
  assert.equal(p2.ram.u16(DMG.fa72), 0x0800);

  const blocked = run({ mirror: 1, p1Live: true, p2Live: true });
  assert.deepEqual(blocked.result, {
    ran: false, ownerIndex: null, mask: 0, anyShot: false, hitsA: 0, hitsB: 0,
  }, 'a live P1 plus the opposite mirror does not fall through to P2');
});
