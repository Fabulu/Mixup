import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { ENEMY } from '../src/enemies.js';
import { OBJ } from '../src/objdriver.js';
import { WHITE_PLAYER } from '../src/white-player.js';
import {
  resetAndInstallStage26331E, resolveMovementPtr, runSpawnWalker,
} from '../src/spawn.js';
import { BLACK_WORLD_RESOURCES, WHITE_WORLD_RESOURCES } from '../src/world-resources.js';
import { createWhiteStage1Machine } from '../src/white-machine.js';
import { BgVram } from '../src/background.js';
import { DL } from '../src/displaylist.js';
import { stageStart15F8DA } from '../src/white-rank.js';

const tables = JSON.parse(readFileSync(fileURLToPath(
  new URL('../rip/port/player.tables.json', import.meta.url),
), 'utf8'));

function fixture() {
  let maxRead = 0;
  const source = new RomWindows(tables.rom);
  const rom = new Proxy(source, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (address, ...args) => {
        if (Number.isInteger(address)) {
          const width = property === 'bytes' ? (args[0] ?? 0)
            : property === 'u32' ? 4 : property === 'u16' ? 2 : 1;
          maxRead = Math.max(maxRead, address + width - 1);
        }
        return Reflect.apply(value, target, [address, ...args]);
      };
    },
  });
  return { ram: new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout), rom,
    maxRead: () => maxRead };
}

test('White Stage 1 native installer reaches exactly the three type-$11 records at $0060', () => {
  const { ram, rom, maxRead } = fixture();
  const s = WHITE_WORLD_RESOURCES.spawn;
  ram.setU16(s.distanceClock, 0x55);
  ram.setU32(s.liveCursor, 0xdeadbeef);
  const installed = resetAndInstallStage26331E(
    ram, rom, null, null, null, WHITE_WORLD_RESOURCES,
  );
  assert.deepEqual(installed, { script: 0x130c6c, aux: 0x13170c, res: 0x131852 });
  assert.equal(ram.u16(s.distanceClock), 0x55,
    'reset/install must not manually seed the background-owned clock');
  assert.equal(ram.u32(s.liveCursor), installed.script,
    'the native installer alone owns the spawn cursor');

  ram.setU16(s.distanceClock, 0x005f);
  assert.deepEqual(runSpawnWalker(
    ram, rom, null, null, null, null, null, WHITE_WORLD_RESOURCES,
  ), { script: 0, deferred: 0 });
  assert.equal(ram.u16(ENEMY.bandCommon), 0, 'no enemy exists before distance $0060');

  ram.setU16(s.distanceClock, 0x0060);
  const frame = runSpawnWalker(
    ram, rom, null, null, null, null, null, WHITE_WORLD_RESOURCES,
  );
  assert.deepEqual(frame, { script: 3, deferred: 0 });
  const descriptor = WHITE_WORLD_RESOURCES.enemyTypes[0x11];
  assert.equal(rom.u32(s.low.table + 0x11 * s.typeStride), descriptor.initStub);
  assert.equal(descriptor.initStub + 8, 0x167794);
  assert.equal(rom.u32(s.low.table + 0x11 * s.typeStride + 4), 0x167944);
  for (let i = 0; i < 3; i++) {
    const rec = ENEMY.bandCommon + i * ENEMY.stride;
    const source = installed.script + i * 8;
    assert.equal(ram.u8(rec + 0x0c), 0x11);
    assert.equal(ram.u16(rec + 0x04), rom.u16(descriptor.initStub + 2));
    assert.equal(ram.u32(rec + 0x4c), descriptor.handler);
    assert.equal(ram.u16(rec + 0x0a), rom.u16(source + 2));
    assert.equal(ram.u32(rec + 0x12) >= installed.res, true);
  }
  assert.equal(ram.u16(ENEMY.bandCommon + 3 * ENEMY.stride), 0);
  assert.equal(maxRead() < 0x200000, true, `highest cartridge read was $${maxRead().toString(16)}`);
});

test('White Stage 1 source record reaches native type $27 exactly at $0076', () => {
  const { ram, rom, maxRead } = fixture();
  const resources = WHITE_WORLD_RESOURCES;
  const s = resources.spawn;
  const source = 0x130d2c;
  const descriptor = resources.enemyTypes[0x27];

  resetAndInstallStage26331E(ram, rom, null, null, null, resources);
  ram.setU32(s.liveCursor, source);
  ram.setU16(s.distanceClock, 0x0075);
  assert.deepEqual(runSpawnWalker(
    ram, rom, null, null, null, null, null, resources,
  ), { script: 0, deferred: 0 });
  assert.equal(ram.u32(s.liveCursor), source);
  assert.equal(ram.u16(ENEMY.bandCommon), 0);

  assert.equal(rom.u16(source), 0x0076);
  assert.equal(rom.u16(source + 2), 0x0005);
  assert.equal(rom.u8(source + 4), 0x27);
  assert.equal(rom.u16(source + 6) & 0x0fff, 0x0023);
  assert.equal(resolveMovementPtr(ram, rom, source, null, resources), 0x131a16);
  assert.equal(rom.u32(s.low.table + 0x27 * s.typeStride), descriptor.initStub);
  assert.equal(rom.u32(s.low.table + 0x27 * s.typeStride + 4), descriptor.handler);
  assert.deepEqual([
    descriptor.initStub, descriptor.initBody, descriptor.handler,
  ], [0x16925a, 0x169262, 0x16935a]);

  ram.setU16(s.distanceClock, 0x0076);
  assert.deepEqual(runSpawnWalker(
    ram, rom, null, null, null, null, null, resources,
  ), { script: 1, deferred: 0 });
  const rec = ENEMY.bandCommon;
  assert.equal(ram.u8(rec + 0x0c), 0x27);
  assert.equal(ram.u16(rec + 0x0a), 0x0005);
  assert.equal(ram.u16(rec + 0x04), rom.u16(descriptor.initStub + 2));
  assert.equal(ram.u32(rec + 0x4c), descriptor.handler);
  assert.equal(ram.u32(rec + 0x12), 0x131a1c,
    'the native init consumes the first six movement-script bytes');
  assert.equal(ram.u16(0x813098), 0,
    'the private Stage 1 spawn does not force the second-loop word');
  assert.equal(ram.u32(s.liveCursor), source + 8);
  assert.equal(maxRead() < 0x200000, true,
    `highest cartridge read was $${maxRead().toString(16)}`);
});

test('White Stage 1 reaches Type $05 and resolves the native Type $07 alias', () => {
  const { ram, rom, maxRead } = fixture();
  const resources = WHITE_WORLD_RESOURCES;
  const s = resources.spawn;
  const source = 0x130dd4;
  const descriptor = resources.enemyTypes[0x05];
  const alias = resources.enemyTypes[0x07];

  resetAndInstallStage26331E(ram, rom, null, null, null, resources);
  ram.setU32(s.liveCursor, source);
  ram.setU16(s.distanceClock, 0x009c);
  assert.deepEqual(runSpawnWalker(
    ram, rom, null, null, null, null, null, resources,
  ), { script: 0, deferred: 0 });
  assert.equal(ram.u32(s.liveCursor), source);

  assert.deepEqual(Array.from(rom.bytes(source, 8)), [
    0x00, 0x9d, 0x00, 0x19, 0x05, 0x00, 0x00, 0x97,
  ]);
  assert.equal(resolveMovementPtr(ram, rom, source, null, resources), 0x1324aa);
  assert.deepEqual([
    rom.u32(s.low.table + 0x05 * s.typeStride),
    rom.u32(s.low.table + 0x05 * s.typeStride + 4),
  ], [descriptor.initStub, descriptor.handler]);
  assert.equal(alias, resources.enemyTypes[0x27]);
  assert.deepEqual([
    rom.u32(s.low.table + 0x07 * s.typeStride),
    rom.u32(s.low.table + 0x07 * s.typeStride + 4),
  ], [alias.initStub, alias.handler]);

  ram.setU16(s.distanceClock, 0x009d);
  assert.deepEqual(runSpawnWalker(
    ram, rom, null, null, null, null, null, resources,
  ), { script: 1, deferred: 0 });
  assert.equal(ram.u8(ENEMY.bandCommon + 0x0c), 0x05);
  assert.equal(ram.u16(ENEMY.bandCommon + 0x0a), 0x0019);
  assert.equal(ram.u32(ENEMY.bandCommon + 0x12), 0x1324b2,
    'the initializer consumes the first eight native movement bytes');
  assert.equal(ram.u32(s.liveCursor), source + 8);
  assert.equal(maxRead() < 0x200000, true,
    `highest cartridge read was $${maxRead().toString(16)}`);
});

test('world resources are recursive constants and the private machine keeps Black rejected', () => {
  const visit = (value) => {
    if (value === null || typeof value !== 'object') return;
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) visit(child);
  };
  visit(BLACK_WORLD_RESOURCES);
  visit(WHITE_WORLD_RESOURCES);
  let reads = 0;
  const protectedRom = new Proxy({}, { get() { reads++; throw new Error('ROM read'); } });
  assert.throws(() => createWhiteStage1Machine(
    protectedRom, null, new BgVram(), BLACK_LABEL_PROFILE,
  ), /private White Label Stage 1 world machine is unavailable/);
  assert.equal(reads, 0);
});

test('private machine carries a native White player through option deployment to $0060', () => {
  const { ram, rom, maxRead } = fixture();
  const machine = createWhiteStage1Machine(rom, null, new BgVram());
  const ctx = {};
  const playerSlot = OBJ.base;
  const playerFields = WHITE_LABEL_PROFILE.ramLayout.playerFields;
  const optionFields = WHITE_LABEL_PROFILE.ramLayout.optionFields;

  ram.setU16(WHITE_PLAYER.p1.ship, 0);
  ram.setU16(WHITE_PLAYER.p1.style, 2);
  ram.setU16(playerSlot, 0x8002);
  ram.setU8(playerSlot + 0x07, 0);
  ram.setU16(playerSlot + 0x08, 0x3000);
  ram.setU16(playerSlot + 0x0a, 0x1800);
  machine.step(ram, ctx);
  assert.equal(ram.u16(WHITE_PLAYER.p1.rec) & 0x8000, 0x8000);
  assert.equal(ram.u16(WHITE_PLAYER.p1.option), 0x8000,
    'the native player initializer creates its stowed option block');
  assert.equal(ram.u16(WHITE_PLAYER.p1.rec + playerFields.optFormation), 2);

  const s = WHITE_WORLD_RESOURCES.spawn;
  stageStart15F8DA(ram, rom, ctx, 0, 0);
  let frames = 0;
  while (ram.u16(s.distanceClock) < 0x0060) {
    assert.equal(ram.u8(ENEMY.bandCommon + 0x0c), 0,
      'the live player does not advance the cartridge formation early');
    machine.step(ram, ctx);
    frames++;
    assert.equal(frames <= 500, true, 'the live-player clock reaches $0060');
  }

  assert.equal(frames, 346);
  assert.equal(ram.u16(s.distanceClock), 0x0060);
  assert.equal(ram.u8(WHITE_PLAYER.p1.option + optionFields.flags1), 3,
    'both option pods finish the native deployment ramp');
  assert.equal(ram.u8(WHITE_PLAYER.p1.option + optionFields.speedIdx), 0xe0);
  assert.deepEqual(ctx.enemyFrame, { script: 3, deferred: 0, driven: 3 });
  assert.equal(maxRead() < 0x200000, true,
    `highest cartridge read was $${maxRead().toString(16)}`);
});

test('private machine advances the native background clock into the first formation', () => {
  function run() {
    const { ram, rom, maxRead } = fixture();
    const machine = createWhiteStage1Machine(rom, null, new BgVram());
    const calls = [];
    const ctx = {
      whiteType5SubsystemHook(call) { calls.push(call.call); },
    };
    machine.step(ram, ctx);

    const s = WHITE_WORLD_RESOURCES.spawn;
    ram.setU16(s.distanceClock, 0x55);
    ram.setU32(s.liveCursor, 0xdeadbeef);
    stageStart15F8DA(ram, rom, ctx, 0, 0);
    assert.equal(ram.u16(s.distanceClock), 0,
      'the native stage-block wipe clears the background-owned clock');
    assert.equal(ram.u32(s.liveCursor), 0x130c6c);
    assert.equal(machine.handlers.has(1), true);
    assert.equal(machine.handlers.has(5), true);

    let frame;
    let frames = 0;
    while (ram.u16(s.distanceClock) < 0x0060) {
      assert.equal(ram.u8(ENEMY.bandCommon + 0x0c), 0x00,
        'no type-$11 enemy exists before distance $0060');
      frame = machine.step(ram, ctx);
      frames++;
      assert.equal(frames <= 500, true, 'the background clock reaches $0060');
    }

    assert.equal(frames, 346, 'type 1 includes the native three-frame warm-up');
    assert.equal(ram.u16(s.distanceClock), 0x0060);
    assert.deepEqual(ctx.enemyFrame, { script: 3, deferred: 0, driven: 3 });
    assert.equal(calls.indexOf(0x18a128) < calls.indexOf(0x18a134), true);
    assert.equal(frame.displayList.records >= 3, true);
    assert.equal(maxRead() < 0x200000, true);

    const hash = createHash('sha256')
      .update(ram.b.slice(ENEMY.bandCommon - 0x800000,
        ENEMY.bandCommon - 0x800000 + 3 * ENEMY.stride))
      .update(ram.b.slice(DL.list - 0x800000,
        DL.list - 0x800000 + frame.displayList.entries * 10))
      .digest('hex');
    return { frames, hash };
  }

  assert.deepEqual(run(), run(), 'fixed cartridge input produces identical records and list');
});
