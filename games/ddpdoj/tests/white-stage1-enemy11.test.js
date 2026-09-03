import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { Ram, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { enemyHandlerMap, runEnemyFrame } from '../src/enemyframe.js';
import { runHandler } from '../src/handlers.js';
import { REC as BULLET_REC } from '../src/bullets.js';
import { DMG, poolDamage, shotBoundingBox } from '../src/damage.js';
import { B as POOL_B_REC, C as POOL_C_REC } from '../src/effects.js';
import { resetAndInstallStage26331E } from '../src/spawn.js';
import { BgVram } from '../src/background.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { buildDisplayList, DL } from '../src/displaylist.js';
import { UnportedLog } from '../src/unported.js';
import { WHITE_WORLD_RESOURCES } from '../src/world-resources.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

function trackedCartridge() {
  let highestRead = 0;
  const reads = [];
  const source = new RomWindows(tables.rom);
  const rom = new Proxy(source, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (address, ...args) => {
        if (Number.isInteger(address)) {
          const length = property === 'bytes' ? (args[0] ?? 0) : property === 'u32' ? 4
            : property === 'u16' ? 2 : 1;
          highestRead = Math.max(highestRead, address + length - 1);
          reads.push({ method: property, address, end: address + length });
        }
        return Reflect.apply(value, target, [address, ...args]);
      };
    },
  });
  return { rom, reads, highestRead: () => highestRead };
}

function collideP1Shot(ram, sub, power, enemyCount = 1) {
  const shot = DMG.p1shots;
  ram.setU16(shot, 0x8000);
  ram.setU16(shot + 0x02, ram.u16(sub + 0x02));
  ram.setU16(shot + 0x04, ram.u16(sub + 0x04));
  for (const offset of [0x10, 0x12, 0x14, 0x16]) ram.setU16(shot + offset, 0x0100);
  ram.setU16(shot + 0x18, power);
  assert.equal(shotBoundingBox(ram, DMG.p1shots, 0x2800), true);
  assert.equal(poolDamage(ram, DMG.poolA, enemyCount, DMG.p1shots, 0x2800,
    DMG.maskP1, ram.u16(DMG.gate308c), 'A'), 1);
}

test('White type $11 uses cartridge prototypes and emits through the normal list', () => {
  const { rom, highestRead } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  resetAndInstallStage26331E(ram, rom, null, null, null, WHITE_WORLD_RESOURCES);
  ram.setU16(WHITE_WORLD_RESOURCES.spawn.distanceClock, 0x0060);

  const calls = [];
  const handlers = new Map([...enemyHandlerMap(rom, WHITE_WORLD_RESOURCES)]
    .map(([address, handler]) => [address, (...args) => {
      calls.push(address);
      return handler(...args);
    }]));
  const ctx = {
    unportedLog: new UnportedLog(),
    tables: machineCtx.stage1WorldPrivate.tables,
  };
  const frame = runEnemyFrame(ram, rom, ctx, handlers, WHITE_WORLD_RESOURCES);
  assert.deepEqual(frame, { script: 3, deferred: 0, driven: 3 });
  assert.deepEqual(calls, [0x167944, 0x167944, 0x167944]);

  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x11];
  for (let i = 0; i < 3; i++) {
    const rec = ENEMY.bandCommon + i * ENEMY.stride;
    const sub = ram.u32(rec + 0x06);
    const script = 0x130c6c + i * 8;
    const idx = rom.u16(script + 6) & 0x0fff;
    const movement = 0x131852 + rom.u16(0x13170c + idx * 2);
    const heading = ram.u8(sub + 0x1b);
    const speed = ram.u8(sub + 0x1a);
    const spriteOffset = ((ram.u16(sub + 0x1a) & 0x3e) << 2);
    const velocity = machineCtx.stage1WorldPrivate.tables.vector(speed, heading);
    assert.equal(ram.u16(sub + 0x02), u16(rom.u16(movement) + velocity.dy));
    const yBias = (((rom.u16(script + 2) & 0x7f) << 9) - 0x800);
    assert.equal(ram.u16(sub + 0x04),
      u16(rom.u16(movement + 2) + yBias + velocity.dx));
    assert.equal(ram.u8(sub + 0x1d), rom.u8(descriptor.palette));
    assert.equal(ram.u8(rec + 0x18),
      (rom.u8(descriptor.recordPrototype + 2) - 1) & 0xff);
    assert.equal(ram.u32(sub + 0x0a), rom.u32(descriptor.mainSprite + spriteOffset));
    assert.equal(heading < 0x40, true);
  }

  const queued = Array.from({ length: 30 }, (_, i) => ram.u16(0x80afc0 + i * 2))
    .reduce((sum, bytes) => sum + bytes, 0);
  assert.equal(queued >= 3 * 12, true);
  ram.setU32(DL.globalOffset, 0x00400080);
  const display = buildDisplayList(ram, { resources: WHITE_WORLD_RESOURCES });
  assert.equal(display.records >= 3, true);
  assert.equal(ram.u32(DL.list), ram.u32(DL.queue),
    'Build A directly copies the encoded coordinate pair despite nonzero shake RAM');
  assert.equal(highestRead() < 0x200000, true,
    `highest cartridge read was $${highestRead().toString(16)}`);
  assert.equal(u16(ram.u16(DL.list + display.entries * 10 + 8)) & 0x7fff, 0);
  const hash = createHash('sha256')
    .update(ram.b.slice(ENEMY.bandCommon - 0x800000,
      ENEMY.bandCommon - 0x800000 + 3 * ENEMY.stride))
    .update(ram.b.slice(DL.list - 0x800000,
      DL.list - 0x800000 + (display.entries + 1) * 10))
    .digest('hex');
  assert.equal(hash, '97f3043678d2989107309ef90fb4136e6fc1a66ebebc8d0e851edc85e1647283');
});

test('White type $11 fires its cartridge kind-$0D bullet at both rank states', () => {
  function fireAtRank(rank) {
    const { rom, highestRead } = trackedCartridge();
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    const machineCtx = {};
    createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);

    const rec = 0x81364c;
    const sub = 0x81459c;
    ram.setU16(rec + 0x00, 0x8000);
    ram.setU32(rec + 0x06, sub);
    ram.setU32(rec + 0x12, 0);
    ram.setU8(rec + 0x16, 1);
    ram.setU8(rec + 0x18, 2);
    ram.setU8(rec + 0x20, 0);
    ram.setU8(rec + 0x28, 1);
    ram.setU32(rec + 0x2a, rom.u32(0x166fe8));
    ram.setU32(rec + 0x2e, rom.u32(0x166fec));
    ram.setU8(rec + 0x33, 0);
    ram.setU32(rec + 0x4c, 0x00167944);

    ram.setU8(sub + 0x00, 0x20);
    ram.setU32(sub + 0x02, 0x40002000);
    ram.setU16(sub + 0x18, 0x0100);

    ram.setU16(0x813172, 0);
    ram.setU16(0x8130d2, 0);
    ram.setU16(0x8130d4, 0);
    ram.setU16(0x811f72, 0);
    ram.setU16(0x813092, 1);
    ram.setU16(0x813096, 0);
    ram.setU16(0x813098, rank);
    ram.setU16(0x8130d8, 0);
    ram.setU16(0x8130aa, 0);
    ram.setU16(0x8130ba, 0);
    ram.setU16(0x813160, 0);
    ram.setU16(0x812950, 0);

    ram.setU16(0x8103e6, 0x8000);
    ram.setU16(0x8103e8, 0x4000);
    ram.setU16(0x8103ea, 0x8000);
    ram.setU16(0x810448, 0);

    const callbacks = [];
    runHandler(0x167944, ram, rom, rec, {
      tables: machineCtx.stage1WorldPrivate.tables,
      unported: new UnportedLog(),
      bulletSpawn: (site, result) => callbacks.push({ site, result }),
    }, WHITE_WORLD_RESOURCES);

    assert.equal(callbacks.length, 1);
    assert.equal(callbacks[0].site, 0x167b8c);
    assert.equal(callbacks[0].result.length, 1);
    const result = callbacks[0].result[0];
    assert.deepEqual(result, {
      carry: false, slot: 0, addr: 0x817f8c, declined: false,
    });
    assert.equal(highestRead() < 0x200000, true,
      `highest cartridge read was $${highestRead().toString(16)}`);

    return { ram, result };
  }

  for (const [rank, speed] of [[0, 0x14], [1, 0x18]]) {
    const { ram, result } = fireAtRank(rank);
    const bullet = result.addr;
    assert.equal(ram.u16(bullet + BULLET_REC.typeWord), 0x810d);
    assert.equal(ram.u32(bullet + BULLET_REC.posA), 0x47802000);
    assert.equal(ram.u32(bullet + BULLET_REC.renderOffs), 0xfc00fd00);
    assert.equal(ram.u32(bullet + BULLET_REC.descriptor), 0);
    assert.equal(ram.u16(bullet + BULLET_REC.graphic), 0x0418);
    assert.equal(ram.u16(bullet + BULLET_REC.attribute), 0x001a);
    assert.equal(ram.u8(bullet + BULLET_REC.speed), speed);
    assert.equal(ram.u8(bullet + BULLET_REC.origSpeed), speed);
    assert.equal(ram.u8(bullet + BULLET_REC.dir), 0);
  }
});

test('White type $11 active-shot lethal stages stay on Build A cartridge roots', () => {
  const { rom, reads, highestRead } = trackedCartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const machineCtx = {};
  createWhiteStage1Machine(rom, null, new BgVram()).step(ram, machineCtx);
  resetAndInstallStage26331E(ram, rom, null, null, null, WHITE_WORLD_RESOURCES);
  ram.setU16(WHITE_WORLD_RESOURCES.spawn.distanceClock, 0x0060);

  const frameCtx = {
    unportedLog: new UnportedLog(),
    tables: machineCtx.stage1WorldPrivate.tables,
  };
  const handlers = enemyHandlerMap(rom, WHITE_WORLD_RESOURCES);
  const frame = runEnemyFrame(ram, rom, frameCtx,
    handlers, WHITE_WORLD_RESOURCES);
  assert.deepEqual(frame, { script: 3, deferred: 0, driven: 3 });

  const rec = ENEMY.bandCommon;
  const sub = ram.u32(rec + 0x06);
  const hp = ram.u16(sub + 0x18);
  const hpReload = ram.u16(rec + 0x26);
  assert.equal(sub, DMG.poolA);
  assert.equal((ram.u16(rec) & 0x8000) !== 0, true);
  assert.equal(hpReload > 0 && hpReload < 0x7fff, true);
  ram.setU16(DMG.gate308c, 1);
  // The formation is born above `$245058`'s ordinary-shot gate. Keep its native
  // records and state, but put this member at the canonical on-screen fixture
  // position so both lethal receipts still come through the real shot pass.
  ram.setU32(sub + 0x02, 0x40002000);

  const effects = [];
  const poolC = [];
  const sounds = [];
  const kills = [];
  const ctx = {
    ...frameCtx,
    effectSpawn: (...args) => effects.push(args),
    poolCSpawn: (...args) => poolC.push(args),
    soundPost: (address) => sounds.push(address),
    killEvent: (...args) => kills.push(args),
  };
  const lethalReadStart = reads.length;

  collideP1Shot(ram, sub, hp + 1, ram.u16(DMG.poolACount));
  assert.equal(ram.u16(sub + 0x18), 0xffff);
  runHandler(0x167944, ram, rom, rec, ctx, WHITE_WORLD_RESOURCES);

  assert.equal((ram.u16(rec) & 0x8000) !== 0, true,
    'the first lethal stage keeps the native enemy record alive');
  assert.equal(ram.u16(sub + 0x18), hpReload);
  assert.equal(ram.u8(rec + 0x20) & 0x80, 0x80);
  assert.deepEqual(kills, [[0x08, 0x10]]);
  assert.deepEqual(effects, [[0x03, 0x1679d0, 0x81b732, 0x187b40]]);
  assert.equal(ram.u16(0x81b732 + POOL_B_REC.status), 0x8003);
  assert.deepEqual(poolC, []);
  assert.deepEqual(sounds, []);

  ram.setU16(0x815ea2, 0);
  ram.setU16(0x815ea4, 0);
  ram.setU16(0x803916, 0);
  collideP1Shot(ram, sub, hpReload + 1, ram.u16(DMG.poolACount));
  assert.equal(ram.u16(sub + 0x18), 0xffff);
  runHandler(0x167944, ram, rom, rec, ctx, WHITE_WORLD_RESOURCES);

  assert.equal(ram.u16(rec), 0, 'the second lethal stage frees the enemy record');
  assert.deepEqual(kills, [[0x08, 0x10], [0x10, 0x10]]);
  assert.deepEqual(effects, [
    [0x03, 0x1679d0, 0x81b732, 0x187b40],
    [0x07, 0x1678ca, 0x81b76a, 0x187b40],
  ]);
  assert.deepEqual(poolC, [[0x81cdee, 0x04, 0]]);
  assert.equal(
    WHITE_WORLD_RESOURCES.enemyTypes[0x11].effects.poolCEntry,
    0x188630,
  );
  assert.deepEqual(sounds, [0x18ad80]);
  assert.equal(ram.u16(0x81b76a + POOL_B_REC.status), 0x8007);
  assert.equal(ram.u16(0x81cdee + POOL_C_REC.status) & 0x8000, 0x8000);
  assert.equal(ram.u32(0x81cdee + POOL_C_REC.descriptor), 0x12a044);

  const lethalReads = reads.slice(lethalReadStart);
  for (const [method, address] of [
    ['u16', 0x18692e], ['u16', 0x186932],
    ['u16', 0x167024], ['u16', 0x167018], ['u16', 0x167030],
    ['u32', 0x18892a], ['u16', 0x188962], ['u32', 0x188964],
    ['u8', 0x14336b], ['u16', 0x188968], ['u16', 0x18896a],
    ['u8', 0x1434c6], ['u16', 0x18896c], ['u16', 0x18896e],
    ['u16', 0x188970], ['u8', 0x1434c7], ['u32', 0x188972],
    ['u32', 0x1889ea],
  ]) {
    assert.equal(lethalReads.some((read) => read.method === method
      && read.address === address), true,
    `missing ${method} Build A cartridge read at $${address.toString(16)}`);
  }
  assert.deepEqual(reads.filter((read) => read.address >= 0x200000), [],
    'the complete private formation and both active-shot lethal stages avoid Build B roots');
  assert.equal(highestRead() < 0x200000, true,
    `highest cartridge read was $${highestRead().toString(16)}`);
});
