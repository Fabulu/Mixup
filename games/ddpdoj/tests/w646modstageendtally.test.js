// W646: finite-resource mods yield to the cartridge stage-end tally.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ALLOC } from '../src/objalloc.js';
import {
  MOD_RAM, applyPostFrameMods, applyPreFrameMods, createModState, modGameOptions,
  prepareModCabinetBoot, resolveLoadout,
} from '../src/mods.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { ENDING13, SE, makeStage5Ending } from '../src/stageend.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);

function resourceState(ram) {
  const state = createModState(resolveLoadout(['infinite-lives', 'bottomless-bombs']));
  prepareModCabinetBoot(state);
  modGameOptions(state).cabinetRunStartHook(ram, { demo: false });
  return state;
}

test('W646 finite resource policies replenish live play but preserve stage-end spending', () => {
  const ram = new Ram();
  const state = resourceState(ram);

  applyPreFrameMods(state, ram);
  assert.deepEqual([
    ram.u16(MOD_RAM.livesP1), ram.u8(MOD_RAM.bombStockP1),
    ram.u16(MOD_RAM.hyperStockP1),
  ], [3, 3, 0]);

  ram.setU16(MOD_RAM.stageEndPause, 1);
  ram.setU16(MOD_RAM.livesP1, 2);
  ram.setU8(MOD_RAM.bombStockP1, 2);
  ram.setU16(MOD_RAM.hyperStockP1, 4);
  applyPreFrameMods(state, ram);
  applyPostFrameMods(state, ram);
  assert.deepEqual([
    ram.u16(MOD_RAM.livesP1), ram.u8(MOD_RAM.bombStockP1),
    ram.u16(MOD_RAM.hyperStockP1),
  ], [2, 2, 0], '$8130D2 preserves finite tally resources while bomb mode still clears hyper stock');

  ram.setU16(MOD_RAM.stageEndPause, 0);
  applyPostFrameMods(state, ram);
  assert.deepEqual([
    ram.u16(MOD_RAM.livesP1), ram.u8(MOD_RAM.bombStockP1),
    ram.u16(MOD_RAM.hyperStockP1),
  ], [3, 3, 0], 'the same policies resume immediately on live play');
});

test('W646 modded type $13 spends every finite resource and stages type $07', () => {
  const ram = new Ram();
  const state = resourceState(ram);
  const slot = ALLOC.table;
  const events = [];
  const handler = makeStage5Ending(ROM);
  const ctx = {
    soundPost() {},
    stageEndEvent: (...event) => events.push(event),
  };

  ram.setU16(MOD_RAM.stageEndPause, 1);
  ram.setU16(MOD_RAM.loopCounter, 1);
  ram.setU16(SE.p1, 0x8000);
  ram.setU16(SE.p2, 0);
  ram.setU16(MOD_RAM.livesP1, 3);
  ram.setU8(MOD_RAM.bombStockP1, 3);
  ram.setU16(slot, 0x8013);

  handler(ram, slot, 0, ctx);
  ram.setU16(ENDING13.base + ENDING13.timer, 0);

  let finishedAt = null;
  for (let frame = 1; frame <= 1000; frame++) {
    applyPreFrameMods(state, ram);
    handler(ram, slot, 0, ctx);
    applyPostFrameMods(state, ram);
    if (ram.u16(ENDING13.base + ENDING13.active) === 0
        && (ram.u8(ENDING13.base + ENDING13.flagsP1) & 0x80) !== 0) {
      finishedAt = frame;
      break;
    }
  }

  assert.ok(finishedAt !== null && finishedAt < 400,
    `type $13 completed its finite tally on frame ${finishedAt}`);
  assert.deepEqual([
    ram.u16(MOD_RAM.livesP1), ram.u8(MOD_RAM.bombStockP1),
    ram.u16(ENDING13.base + ENDING13.active),
  ], [0, 0, 0], '$8130BE and $81040A both reached the cartridge completion checks');

  ram.setU16(ENDING13.base + ENDING13.delay, 0);
  ram.setU32(ENDING13.base + ENDING13.handle, 0);
  applyPreFrameMods(state, ram);
  handler(ram, slot, 0, ctx);
  applyPostFrameMods(state, ram);

  assert.equal(ram.u16(slot), 0, 'type $13 retired at $28EEF6');
  assert.equal(ram.u16(ALLOC.createSp), ALLOC.stride,
    '$28D630 staged exactly one successor');
  assert.equal(ram.u16(ALLOC.createStage), 0x8007,
    'the authentic dispatch table staged type $07');
  assert.deepEqual(events.map(([kind]) => kind), ['loop-extend', 'ending-handoff'],
    'the tally preserves its loop resource award before the type-$07 handoff');
});
