// W636: retire the authentic P1 option shadows across the browser list hold.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import { OPTION_BLOCKS, runOptionBlock } from '../src/options.js';
import {
  BUCKETS, NAMED_BUCKETS, RECORD_BYTES, snapshotBucket,
} from '../src/spritequeue.js';
import { buildDisplayList } from '../src/displaylist.js';
import { RAM_STRIDE, parseSpriteList } from '../src/render/spritelist.js';
import { PORT_LIST_WORDS, portSpriteList } from '../src/web/app.js';
import {
  attachFormationCompanions, runThreePilotOptionObject,
} from '../src/formationactors.js';
import { commitCreates } from '../src/objalloc.js';

const TABLES = Object.freeze({
  vector: () => ({ dy: 0, dx: 0 }),
  angleFor: () => 0,
  anim: () => ({ a: [0, 0x7000] }),
});
const ROM = Object.freeze({ u8: () => 0, u16: () => 0, u32: () => 0 });
const CTX = Object.freeze({ rom: ROM, tables: TABLES });
const PACKED = new Map([
  [0x065388, [0x001234, 10, 0]],
  [0x065354, [0x002345, 10, 0]],
]);
const REQUESTS = Uint8Array.from([
  0x80, 0x48, 0x80, 0x6c, 0x00, 0x06, 0x53, 0x88, 0x02, 0x08, 0x00, 0x18,
  0x80, 0x48, 0x80, 0x6c, 0x00, 0x06, 0x53, 0x88, 0x02, 0x08, 0x40, 0x18,
]);
const RAW_SHADOWS = Object.freeze([
  Object.freeze([0x8048, 0x806c, 0x1806, 0x5388, 0x0208]),
  Object.freeze([0x8048, 0x806c, 0x5806, 0x5388, 0x0208]),
]);
const REMAPPED_SHADOWS = Object.freeze([
  Object.freeze([0x8048, 0x806c, 0x1800, 0x1234, 0x0208]),
  Object.freeze([0x8048, 0x806c, 0x5800, 0x1234, 0x0208]),
]);

function seedOrdinaryPods(memory, player, options) {
  memory.setU16(player + P.state, 0x8000);
  memory.setU16(player + P.posY, 0x1400);
  memory.setU16(player + P.posX, 0x1c00);
  memory.setU16(player + P.optFormation, 2);
  memory.setU8(player + P.speedIdx, 0);
  memory.setU8(player + P.baseSpeed, 0);
  memory.setU8(player + P.dirByte, 0);
  memory.setU8(player + P.btnByte, 0);

  memory.setU16(options + OPT.state, 0x8003);
  memory.setU8(options + OPT.animDelay, 1);
  memory.setU32(options + OPT.shadow0, 0x00065388);
  memory.setU32(options + OPT.shadow1, 0x00065388);
  memory.setU32(options + OPT.anim, 0x00065354);
  memory.setU32(options + OPT.pod + OPT.anim, 0x00065354);
  memory.setU16(options + OPT.size, 0x0208);
  memory.setU16(options + OPT.pod + OPT.size, 0x0208);
  memory.setU8(options + OPT.angle, 0x10);
  memory.setU8(options + OPT.pod + OPT.angle, 0x30);
  memory.setU16(options + OPT.flipColour, 0x0000);
  memory.setU16(options + OPT.pod + OPT.flipColour, 0x4000);
}

function listWords(ram) {
  return Uint16Array.from({ length: PORT_LIST_WORDS },
    (_, index) => ram.u16(RAM.spriteList + index * 2));
}

function optionShadows(words) {
  return parseSpriteList(words, RAM_STRIDE).filter((record) =>
    record.width === 1 && record.height === 8
    && record.color === 24 && record.pri === 0
    && (record.flip === 0 || record.flip === 2));
}

function assertShadowIdentity(records, expectedWords, label) {
  assert.deepEqual(records.map((record) => record.raw), expectedWords, `${label} words`);
  assert.deepEqual(records.map((record) => ({
    x: record.x, y: record.y, offs: record.offs,
    width: record.width, height: record.height,
    color: record.color, pri: record.pri, flip: record.flip,
  })), [
    { x: 72, y: 108, offs: expectedWords === RAW_SHADOWS ? 0x065388 : 0x001234,
      width: 1, height: 8, color: 24, pri: 0, flip: 0 },
    { x: 72, y: 108, offs: expectedWords === RAW_SHADOWS ? 0x065388 : 0x001234,
      width: 1, height: 8, color: 24, pri: 0, flip: 2 },
  ], `${label} classification`);
}

function portSnapshot(ram, held) {
  return portSpriteList(ram, PACKED, { out: held }).words.slice();
}

function assertPhysicalFrameF(ram) {
  assert.equal(ram.u16(0x80390c), 0, 'frame F is the shadow-producing phase');
  const staged = snapshotBucket(ram, NAMED_BUCKETS.shadows);
  assert.equal(staged.count, 2 * RECORD_BYTES);
  assert.deepEqual(staged.bytes, REQUESTS,
    'frame F stages the exact two projected palette-24 option shadows');

  buildDisplayList(ram);
  assert.equal(ram.u16(BUCKETS[NAMED_BUCKETS.shadows].counter), 0,
    'frame F build retires the physical shadow counter');
  assertShadowIdentity(optionShadows(listWords(ram)), RAW_SHADOWS, 'frame F raw list');
}

test('W636 native option death retires both shadows after the legal one-frame hold', () => {
  const ram = new Ram();
  const held = new Uint16Array(PORT_LIST_WORDS);
  seedOrdinaryPods(ram, RAM.player1, RAM.p1Options);
  const block = { ...OPTION_BLOCKS[0], allowLaser: false, allowShots: false };

  runOptionBlock(ram, CTX, block);
  assertPhysicalFrameF(ram);

  const visibleF1 = portSnapshot(ram, held);
  assertShadowIdentity(optionShadows(visibleF1), REMAPPED_SHADOWS,
    'visible F+1 held list');

  ram.setU16(RAM.player1 + P.state, 0x8100);
  runOptionBlock(ram, CTX, block);
  assert.equal(ram.u16(RAM.p1Options + OPT.state), 0,
    'logic F+1 death clears the native option block');
  assert.equal(snapshotBucket(ram, NAMED_BUCKETS.shadows).count, 0,
    'logic F+1 stages no shadow requests');
  buildDisplayList(ram);
  assert.deepEqual(optionShadows(listWords(ram)), [],
    'logic F+1 raw list contains no retired shadows');
  assert.equal(ram.u16(RAM.spriteList + 8) & 0x7fff, 0,
    'logic F+1 writes the list terminator over the first live record');

  const visibleF2 = portSnapshot(ram, held);
  assert.deepEqual(optionShadows(visibleF2), [],
    'visible F+2 overwrites the held browser list and contains no stale shadow');
});

test('W636 detached P1 companion retires both virtual shadows by visible F+2', () => {
  const ram = new Ram();
  const held = new Uint16Array(PORT_LIST_WORDS);
  ram.setU16(RAM.player1 + P.state, 0x8000);
  ram.setU16(RAM.player1 + P.posY, 0x1400);
  ram.setU16(RAM.player1 + P.posX, 0x1c00);
  const game = {
    ram, rom: ROM, tables: TABLES, unportedLog: { note() {} },
  };
  const manager = attachFormationCompanions(game, {
    inputWord: 0xffff,
    companions: [{ ship: 0, style: 2 }],
  });
  const state = manager.companions[0];
  const created = commitCreates(ram);
  manager.objectDriverHook({ phase: 'after-commit', ram, created, killed: 0 });
  assert.equal(state.lifecycle, 'alive');
  assert.equal(state.binding.logicalIndex, 2);
  assert.match(state.binding.name, /^P1 companion/);

  state.weapons.actorId = state.actorId;
  seedOrdinaryPods(state.memory, state.binding.player, state.binding.options);
  ram.setU16(0x80390c, 0);
  runThreePilotOptionObject(game);
  assert.equal(state.weapons.requests.filter((request) =>
    request.bucket === NAMED_BUCKETS.shadows).length, 2,
  'frame F emits both option shadows through private requests');
  const virtualF = game.virtualSpriteRequestHook(game);
  const virtualShadows = virtualF.filter((request) =>
    request.bucket === NAMED_BUCKETS.shadows);
  assert.equal(virtualShadows.length, 2);
  assert.deepEqual(Uint8Array.from(virtualShadows.flatMap((request) => [...request.bytes])),
    REQUESTS, 'frame F virtual shadows match the native cartridge requests');
  assert.equal(ram.u16(BUCKETS[NAMED_BUCKETS.shadows].counter), 0,
    'the private companion never writes the physical shadow bucket');

  buildDisplayList(ram, { virtualRequests: virtualF });
  assertShadowIdentity(optionShadows(listWords(ram)), RAW_SHADOWS,
    'frame F companion raw list');
  const visibleF1 = portSnapshot(ram, held);
  assertShadowIdentity(optionShadows(visibleF1), REMAPPED_SHADOWS,
    'visible F+1 companion held list');

  state.lifecycle = 'detached';
  assert.equal(runThreePilotOptionObject(game), 0);
  assert.equal(state.weapons.requests.length, 0,
    'logic F+1 detachment clears private option requests');
  const virtualF1 = game.virtualSpriteRequestHook(game);
  assert.equal(virtualF1.some((request) => request.bucket === NAMED_BUCKETS.shadows), false,
    'logic F+1 collection contains no detached companion shadows');
  buildDisplayList(ram, { virtualRequests: virtualF1 });
  assert.deepEqual(optionShadows(listWords(ram)), [],
    'logic F+1 raw list contains no detached companion shadows');

  const visibleF2 = portSnapshot(ram, held);
  assert.deepEqual(optionShadows(visibleF2), [],
    'visible F+2 overwrites the held list and contains no stale companion shadow');
});
