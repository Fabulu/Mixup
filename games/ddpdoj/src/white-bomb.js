// Capability-gated Build A bomb driver and damage closure.

import { P, RAM } from './machine.js';
import { i16, u16 } from './ram.js';
import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import {
  requireRuntimeCapability, resolveGameRuntime,
} from './runtime-profile.js';
import { drawSignedByteWithResources } from './rng.js';
import {
  BOMBRAM, BEAM_REC,
  drawBombRecordWithSharedRam, drawBombScriptRecordWithSharedRam,
  resetBombChainWithSharedRam, runBombDamageWithSharedRam,
} from './bomb.js';
import { spawnBeamBombSparkWithResources } from './spark.js';
import { WHITE_SPARK_RESOURCES } from './white-shots.js';

const freezeFamily = (family) => Object.freeze(family);

export const WHITE_BOMB_RESOURCES = Object.freeze({
  edition: 'white-label-a',
  entries: Object.freeze({
    driver: 0x155394,
    ordinary: 0x1553fa,
    laser: 0x15559e,
    cooldownExpiry: 0x155a76,
    teardown: 0x155a86,
    damage: 0x144ce8,
  }),
  ordinary: Object.freeze({
    init: 0x155ad2,
    initLength: 0x1e,
    fade: 0x155b52,
    fadeLength: 0x22,
    blink: 0x155bb4,
    blinkLength: 0x1c,
    families: Object.freeze([
      freezeFamily({ phase0: 0x155aee, phase1: 0x155b74, phase2: 0x155bd0 }),
      freezeFamily({ phase0: 0x155b20, phase1: 0x155b94, phase2: 0x155be4 }),
    ]),
    jitter: Object.freeze({ table: 0x14336a, entries: 256 }),
    cues: Object.freeze([0x18b082, 0x18b09c]),
  }),
  beam: Object.freeze({
    install: 0x156240,
    installLength: 0x9e,
    segment: 0x1562de,
    segmentLength: 0x12,
    families: Object.freeze([
      freezeFamily({
        base: 0x155bf8,
        head: 0x155bf8,
        mid: 0x155c04,
        tail: 0x155c10,
        tip: 0x155c1c,
        initialPointers: 0x155c28,
        phase2: 0x155ca8,
        phase2Pointers: 0x155d9c,
      }),
      freezeFamily({
        base: 0x155f1c,
        head: 0x155f1c,
        mid: 0x155f28,
        tail: 0x155f34,
        tip: 0x155f40,
        initialPointers: 0x155f4c,
        phase2: 0x155fcc,
        phase2Pointers: 0x1560c0,
      }),
    ]),
    cues: Object.freeze([0x18b04e, 0x18b068]),
    spark: Object.freeze({
      entry: 0x188b30,
      rng: Object.freeze({ table: 0x1434c4, entries: 128 }),
      pointerTable: 0x188b6c,
      templates: Object.freeze([0x188fa0, 0x188fb6, 0x188fcc]),
      lists: Object.freeze([0x188fe2, 0x189002, 0x189022]),
      sparkResources: WHITE_SPARK_RESOURCES,
    }),
  }),
  ram: Object.freeze({
    record: BOMBRAM.rec,
    stride: BOMBRAM.stride,
    slots: BOMBRAM.slots,
    cooldown: BOMBRAM.cooldown,
    scrollX: BOMBRAM.scrollX,
    phase: BOMBRAM.phase,
    nearestY: BOMBRAM.g12952,
    nearestRecord: BOMBRAM.g12954,
    beamAux: BOMBRAM.g12968,
    soundP1: BOMBRAM.soundQueue,
    soundP2: BOMBRAM.soundQueueP2,
    chainP1: BOMBRAM.chainLatchP1,
    chainP2: BOMBRAM.chainLatchP2,
  }),
  sides: Object.freeze([
    freezeFamily({ ownerIndex: 0, player: RAM.player1, sound: BOMBRAM.soundQueue }),
    freezeFamily({ ownerIndex: 1, player: RAM.player2, sound: BOMBRAM.soundQueueP2 }),
  ]),
  soundRequestMap: Object.freeze({
    0x18b04e: 0x28c528,
    0x18b068: 0x28c542,
    0x18b082: 0x28c55c,
    0x18b09c: 0x28c576,
  }),
});

const B = Object.freeze({
  posY: 0x02,
  posX: 0x04,
  offLong: 0x06,
  offShort: 0x08,
  anim: 0x0a,
  size: 0x0e,
  flipColour: 0x1c,
  script: 0x1e,
  tick: 0x22,
  reload: 0x23,
  animIdx: 0x24,
  phase: 0x28,
  loops: 0x2a,
});

const INIT_STEPS = Object.freeze([
  Object.freeze([0x02, 2]), Object.freeze([0x10, 4]),
  Object.freeze([0x14, 4]), Object.freeze([0x18, 4]),
  Object.freeze([0x1c, 2]), Object.freeze([0x1e, 4]),
  Object.freeze([0x22, 4]), Object.freeze([0x28, 4]),
  Object.freeze([0x2e, 2]),
]);
const FADE_STEPS = Object.freeze([
  Object.freeze([0x06, 4]), Object.freeze([0x0e, 2]),
  Object.freeze([0x10, 4]), Object.freeze([0x14, 4]),
  Object.freeze([0x18, 4]), Object.freeze([0x1c, 2]),
  Object.freeze([0x1e, 4]), Object.freeze([0x22, 4]),
  Object.freeze([0x26, 4]), Object.freeze([0x2a, 2]),
]);
const BLINK_STEPS = Object.freeze([
  Object.freeze([0x06, 4]), Object.freeze([0x0e, 2]),
  Object.freeze([0x10, 4]), Object.freeze([0x14, 4]),
  Object.freeze([0x18, 4]), Object.freeze([0x1c, 2]),
  Object.freeze([0x1e, 4]), Object.freeze([0x22, 2]),
  Object.freeze([0x28, 2]),
]);

const VALIDATED_CARTRIDGES = new WeakSet();

function requireWhiteBomb(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'stage1Players', operation);
  requireRuntimeCapability(runtime, 'stage1Options', operation);
  requireRuntimeCapability(runtime, 'stage1HyperHud', operation);
  return profile;
}

function assertRam(ram) {
  if (!ram || typeof ram.u8 !== 'function' || typeof ram.u16 !== 'function'
      || typeof ram.u32 !== 'function' || typeof ram.setU8 !== 'function'
      || typeof ram.setU16 !== 'function' || typeof ram.setU32 !== 'function') {
    throw new TypeError('White Label bomb needs mutable board RAM');
  }
}

function assertRom(rom) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function' || typeof rom.bytes !== 'function') {
    throw new TypeError('White Label bomb needs the embedded cartridge windows');
  }
}

function assertSoundSink(ctx) {
  if (ctx?.soundPost !== undefined && typeof ctx.soundPost !== 'function') {
    throw new TypeError('White Label bomb sound sink must be a function');
  }
}

function validateResources(resources = WHITE_BOMB_RESOURCES) {
  const nested = [
    resources?.entries, resources?.ordinary, resources?.ordinary?.families,
    resources?.ordinary?.jitter, resources?.ordinary?.cues,
    resources?.beam, resources?.beam?.families, resources?.beam?.cues,
    resources?.beam?.spark, resources?.beam?.spark?.rng,
    resources?.beam?.spark?.templates, resources?.beam?.spark?.lists,
    resources?.ram, resources?.sides, resources?.soundRequestMap,
  ];
  if (!Object.isFrozen(resources) || nested.some((value) => !Object.isFrozen(value))
      || resources.edition !== 'white-label-a'
      || resources.ordinary.families.length !== 2
      || resources.ordinary.families.some((family) => !Object.isFrozen(family))
      || resources.beam.families.length !== 2
      || resources.beam.families.some((family) => !Object.isFrozen(family))
      || resources.sides.length !== 2
      || resources.sides.some((side, ownerIndex) =>
        !Object.isFrozen(side) || side.ownerIndex !== ownerIndex)
      || resources.ram.record !== BOMBRAM.rec
      || resources.ram.stride !== 0x30 || resources.ram.slots !== 45
      || resources.soundRequestMap[resources.ordinary.cues[0]] !== 0x28c55c
      || resources.soundRequestMap[resources.ordinary.cues[1]] !== 0x28c576
      || resources.soundRequestMap[resources.beam.cues[0]] !== 0x28c528
      || resources.soundRequestMap[resources.beam.cues[1]] !== 0x28c542
      || resources.beam.spark.sparkResources !== WHITE_SPARK_RESOURCES) {
    throw new TypeError('White Label bomb resource graph is mixed or mutable');
  }
  return resources;
}

function expectU16(rom, address, expected, label) {
  const actual = rom.u16(address);
  if (actual !== expected) {
    throw new RangeError(`${label} changed at $${address.toString(16)}: $${actual.toString(16)}`);
  }
}

function expectU32(rom, address, expected, label) {
  const actual = rom.u32(address);
  if (actual !== expected) {
    throw new RangeError(`${label} changed at $${address.toString(16)}: $${actual.toString(16)}`);
  }
}

function validateOrdinaryCartridge(rom, resources) {
  const ordinary = resources.ordinary;
  void rom.bytes(ordinary.init, ordinary.initLength);
  void rom.bytes(ordinary.fade, ordinary.fadeLength);
  void rom.bytes(ordinary.blink, ordinary.blinkLength);
  expectU32(rom, ordinary.init + 0x10, ordinary.families[0].phase0,
    'White ordinary bomb initial script');
  expectU32(rom, ordinary.fade + 0x14, ordinary.families[0].phase1,
    'White ordinary bomb fade script');
  expectU32(rom, ordinary.blink + 0x14, ordinary.families[0].phase2,
    'White ordinary bomb blink script');
  for (const family of ordinary.families) {
    for (let index = 0; index < 4; index++) {
      const entry = family.phase0 + index * 12;
      void rom.bytes(entry, 12);
    }
    expectU16(rom, family.phase0 + 48, 0xffff,
      'White ordinary bomb initial terminator');
    for (let index = 0; index < 8; index++) rom.u32(family.phase1 + index * 4);
    for (let index = 0; index < 4; index++) rom.u32(family.phase2 + index * 4);
    expectU32(rom, family.phase2 + 16, 0xffffffff,
      'White ordinary bomb blink terminator');
  }
}

function validateBeamFamily(rom, family) {
  for (let index = 0; index < 12; index++) rom.u32(family.base + index * 4);
  for (let index = 0; index < 8; index++) {
    expectU32(
      rom, family.initialPointers + index * 4,
      family.base + 0xa4 - index * 12,
      'White laser-bomb initial pointer',
    );
  }
  for (let index = 0; index < 8 * 3; index++) {
    rom.u32(family.base + 0x50 + index * 4);
  }
  for (let index = 0; index < 12; index++) {
    const entry = family.phase2 + index * 20;
    for (let field = 0; field < 4; field++) rom.u32(entry + field * 4);
    expectU32(
      rom, entry + 16, family.phase2Pointers + index * 0x20,
      'White laser-bomb phase-2 pointer row',
    );
    for (let pointer = 0; pointer < 8; pointer++) {
      rom.u32(family.phase2Pointers + index * 0x20 + pointer * 4);
    }
  }
  expectU32(rom, family.phase2 + 12 * 20, 0xffffffff,
    'White laser-bomb phase-2 terminator');
}

function validateBeamCartridge(rom, resources) {
  const beam = resources.beam;
  void rom.bytes(beam.install, beam.installLength);
  void rom.bytes(beam.segment, beam.segmentLength);
  for (const family of beam.families) validateBeamFamily(rom, family);
  const spark = beam.spark;
  for (let index = 0; index < spark.templates.length; index++) {
    expectU32(rom, spark.pointerTable + index * 4, spark.templates[index],
      'White laser-bomb spark pointer');
    const template = spark.templates[index];
    expectU16(rom, template, 0, 'White laser-bomb spark selector');
    expectU16(rom, template + 0x0e, 0x1c, 'White laser-bomb spark cursor');
    expectU32(rom, template + 0x10, spark.lists[index],
      'White laser-bomb spark animation list');
    void rom.bytes(template, 0x16);
    for (let frame = 0; frame < 8; frame++) rom.u32(spark.lists[index] + frame * 4);
  }
  for (let index = 0; index < spark.rng.entries; index++) {
    const value = rom.u8(spark.rng.table + index);
    if (value > 2) {
      throw new RangeError(`White laser-bomb spark RNG value ${value} escapes {0, 1, 2}`);
    }
  }
}

/** Validate the static Build A bomb graph before any board mutation. */
export function preflightWhiteBombCartridge(rom) {
  assertRom(rom);
  const resources = validateResources();
  if (!VALIDATED_CARTRIDGES.has(rom)) {
    validateOrdinaryCartridge(rom, resources);
    validateBeamCartridge(rom, resources);
    VALIDATED_CARTRIDGES.add(rom);
  }
  return resources;
}

function ordinaryFamilyIndex(type) {
  return (type & 2) !== 0 ? 1 : 0;
}

function preflightOrdinaryPointers(ram, rom, resources, type) {
  const rec = resources.ram.record;
  if (!ram.btst8(rec, 0)) return;
  const family = resources.ordinary.families[ordinaryFamilyIndex(type)];
  const phase = ram.u16(rec + B.phase);
  const script = ram.u32(rec + B.script);
  if (phase === 0) {
    if (script < family.phase0 || script > family.phase0 + 36
        || (script - family.phase0) % 12 !== 0) {
      throw new RangeError(`White ordinary bomb phase 0 has malformed script $${script.toString(16)}`);
    }
    return;
  }
  if (phase === 1) {
    const index = ram.u16(rec + B.animIdx);
    const loops = ram.u16(rec + B.loops);
    if (script !== family.phase1 || index > 0x1c || (index & 3) !== 0
        || loops === 0 || loops > 6) {
      throw new RangeError('White ordinary bomb phase 1 has malformed animation state');
    }
    return;
  }
  if (phase === 2) {
    if (script < family.phase2 || script > family.phase2 + 12
        || (script - family.phase2) % 4 !== 0) {
      throw new RangeError(`White ordinary bomb phase 2 has malformed script $${script.toString(16)}`);
    }
    return;
  }
  throw new RangeError(`White ordinary bomb phase ${phase} escapes {0, 1, 2}`);
}

function preflightBeamPointers(ram, rom, ctx, resources, type) {
  const rec = resources.ram.record;
  if (typeof ctx?.whiteBombCallbacks?.resetOptions !== 'function') {
    throw new TypeError('White laser-bomb driver needs the private option-reset callback');
  }
  if (!ram.btst8(rec, 0)) return;
  const family = resources.beam.families[ordinaryFamilyIndex(type)];
  const roots = [
    [rec + B.script, family.head],
    [rec + BEAM_REC.mid + B.script, family.mid],
    [rec + BEAM_REC.tail + B.script, family.tail],
    [rec + BEAM_REC.tip + B.script, family.tip],
  ];
  for (const [address, expected] of roots) {
    if (ram.u32(address) !== expected) {
      throw new RangeError(`White laser-bomb head pointer changed at $${address.toString(16)}`);
    }
  }
  const cursor = ram.u16(rec + 0x24);
  const phase = ram.u16(rec + 0x18);
  if ((cursor & 3) !== 0 || cursor > 0x1c || (phase !== 0 && phase !== 1)) {
    throw new RangeError('White laser-bomb cursor or phase is malformed');
  }
  const list = ram.u32(rec + 0x28);
  const pointerTable = ram.u32(rec + 0x2c);
  if (phase === 0) {
    if (list !== family.phase2 || pointerTable !== family.initialPointers) {
      throw new RangeError('White laser-bomb phase 1 has malformed list roots');
    }
  } else {
    const offset = list - family.phase2;
    if (offset < 0 || offset > 12 * 20 || offset % 20 !== 0) {
      throw new RangeError(`White laser-bomb phase 2 has malformed cursor $${list.toString(16)}`);
    }
    if (offset === 0) {
      if (pointerTable !== family.initialPointers) {
        throw new RangeError('White laser-bomb phase 2 retained the wrong initial pointer row');
      }
    } else {
      const expected = family.phase2Pointers + (offset / 20 - 1) * 0x20;
      if (pointerTable !== expected) {
        throw new RangeError('White laser-bomb phase 2 has malformed pointer row');
      }
    }
  }
  for (let index = 0; index < BEAM_REC.segs; index++) {
    const segment = rec + BEAM_REC.seg0 + index * resources.ram.stride;
    if ((ram.u16(segment) & 0x8000) === 0) continue;
    const pointer = ram.u32(segment + 0x18);
    const nestedOffset = pointer - (family.base + 0x50);
    if (pointer !== 0 && (nestedOffset < 0 || nestedOffset >= 8 * 12
        || nestedOffset % 12 !== 0)) {
      throw new RangeError(`White laser-bomb segment ${index + 1} has malformed animation pointer`);
    }
  }
  if (phase === 1 && list === family.phase2 + 12 * 20) {
    expectU32(rom, list, 0xffffffff, 'White laser-bomb live terminator');
  }
}

/** Validate the current live record before the Build A driver mutates RAM. */
export function preflightWhiteBombPointers(ram, rom, ctx, profileRequest) {
  requireWhiteBomb(profileRequest, 'White Label bomb preflight');
  assertRam(ram);
  const resources = preflightWhiteBombCartridge(rom);
  const type = ram.u16(resources.ram.record);
  if ((type & 0x8000) === 0) return Object.freeze({ resources, type, active: false });
  assertSoundSink(ctx);
  const dispatch = type & 7;
  if (dispatch >= 4) {
    throw new RangeError(`White bomb dispatch ${dispatch} escapes its four-entry table`);
  }
  if ((dispatch & 1) === 0) preflightOrdinaryPointers(ram, rom, resources, type);
  else preflightBeamPointers(ram, rom, ctx, resources, type);
  return Object.freeze({ resources, type, active: true });
}

function installTemplate(ram, rom, source, steps, record) {
  let cursor = source;
  for (const [offset, size] of steps) {
    if (size === 2) {
      ram.setU16(record + offset, rom.u16(cursor));
      cursor += 2;
    } else {
      ram.setU32(record + offset, rom.u32(cursor));
      cursor += 4;
    }
  }
  return cursor - source;
}

function teardown(ram, ctx, resources) {
  let chainsReset = 0;
  if (ram.u16(resources.ram.chainP1) !== 0) {
    resetBombChainWithSharedRam(ram, 0);
    chainsReset |= 1;
  }
  if (ram.u16(resources.ram.chainP2) !== 0) {
    resetBombChainWithSharedRam(ram, 1);
    chainsReset |= 2;
  }
  ram.setU32(resources.ram.soundP1, 0);
  ram.bclr8(RAM.player1 + P.flags1, 6);
  ram.bclr8(RAM.player2 + P.flags1, 6);
  for (let index = 0; index < resources.ram.slots; index++) {
    ram.setU16(resources.ram.record + index * resources.ram.stride, 0);
  }
  ctx?.bombEvent?.('teardown', chainsReset);
  return chainsReset;
}

function cooldownExpiry(ram, resources) {
  ram.setU8(resources.sides[0].player + P.invuln, 0);
  ram.setU8(resources.sides[1].player + P.invuln, 0);
}

function ordinaryScript(ram, rom, ctx, resources, type) {
  const rec = resources.ram.record;
  const family = resources.ordinary.families[ordinaryFamilyIndex(type)];
  ram.setU16(rec + B.posX,
    u16(ram.u16(rec + B.posX) - ram.u16(resources.ram.scrollX)));
  if (!ram.btst8(rec, 0)) {
    ram.bset8(rec, 0);
    installTemplate(ram, rom, resources.ordinary.init, INIT_STEPS, rec);
    if (ordinaryFamilyIndex(type) !== 0) ram.setU32(rec + B.script, family.phase0);
    const cue = resources.ordinary.cues[ordinaryFamilyIndex(type)];
    ctx?.soundPost?.(resources.soundRequestMap[cue]);
  }

  if (ram.u16(rec + B.phase) === 0) {
    let script = ram.u32(rec + B.script);
    const position = ((((u16(ram.u16(rec + B.posY) + rom.u16(script))) << 16) >>> 0)
      + u16(ram.u16(rec + B.posX) + rom.u16(script + 2))) >>> 0;
    drawBombScriptRecordWithSharedRam(
      ram, ctx, position, rom.u32(script + 4), rom.u16(script + 8), rom.u16(script + 10),
    );
    script += 12;
    const borrow = ram.u8(rec + B.tick) === 0;
    ram.setU8(rec + B.tick, (ram.u8(rec + B.tick) - 1) & 0xff);
    if (!borrow) return;
    ram.setU8(rec + B.tick, ram.u8(rec + B.reload));
    if (rom.u16(script) !== 0xffff) {
      ram.setU32(rec + B.script, script);
      return;
    }
    installTemplate(ram, rom, resources.ordinary.fade, FADE_STEPS, rec);
    if (ordinaryFamilyIndex(type) !== 0) ram.setU32(rec + B.script, family.phase1);
    ctx?.bombEvent?.('phase', 1);
  }

  if (ram.u16(rec + B.phase) === 1) {
    let delta = 0x40;
    if (drawSignedByteWithResources(ram, rom, resources.ordinary.jitter) === 0) {
      delta = u16(-delta);
    }
    ram.setU16(rec + B.posX, u16(ram.u16(rec + B.posX) + delta));
    if (ram.u16(resources.ram.phase) !== 0) return;
    const index = ram.u16(rec + B.animIdx);
    ram.setU32(rec + B.anim, rom.u32(ram.u32(rec + B.script) + i16(index)));
    ram.setU16(rec + B.animIdx, u16(index - 4));
    if (index >= 4) {
      drawBombRecordWithSharedRam(ram, ctx, rec);
      return;
    }
    const loops = u16(ram.u16(rec + B.loops) - 1);
    ram.setU16(rec + B.loops, loops);
    if (loops !== 0) {
      ram.setU16(rec + B.animIdx, 0x1c);
      drawBombRecordWithSharedRam(ram, ctx, rec);
      return;
    }
    installTemplate(ram, rom, resources.ordinary.blink, BLINK_STEPS, rec);
    if (ordinaryFamilyIndex(type) !== 0) ram.setU32(rec + B.script, family.phase2);
    ctx?.bombEvent?.('phase', 2);
  }

  const wasSet = ram.btst8(rec, 1);
  if (wasSet) ram.bclr8(rec, 1);
  else ram.bset8(rec, 1);
  if (!wasSet) return;
  let script = ram.u32(rec + B.script);
  ram.setU32(rec + B.anim, rom.u32(script));
  script += 4;
  drawBombRecordWithSharedRam(ram, ctx, rec);
  if (rom.u32(script) !== 0xffffffff) {
    ram.setU32(rec + B.script, script);
    return;
  }
  const ownerIndex = (ram.u8(rec + 1) & 0x80) !== 0 ? 1 : 0;
  const player = resources.sides[ownerIndex].player;
  const baseSpeed = ram.u8(player + P.baseSpeed);
  if (baseSpeed < ram.u8(player + P.speedIdx)) ram.setU8(player + P.speedIdx, baseSpeed);
  ram.setU16(resources.ram.cooldown, 0x28);
  teardown(ram, ctx, resources);
}

function installBeamTemplate(ram, rom, resources) {
  const rec = resources.ram.record;
  let source = resources.beam.install;
  let recordOffset = 0x06;
  const word = () => {
    ram.setU16(rec + recordOffset, rom.u16(source));
    source += 2;
    recordOffset += 2;
  };
  const long = () => {
    ram.setU32(rec + recordOffset, rom.u32(source));
    source += 4;
    recordOffset += 4;
  };
  const skip = (count) => { recordOffset += count; };
  long(); skip(4); word(); long(); long(); long(); word(); long(); long(); word(); long(); long();
  skip(0x7b0);
  word(); skip(4); long(); skip(4); word(); long(); long(); long(); word(); long(); long(); long(); long(); word();
  word(); skip(4); long(); skip(4); word(); long(); long(); long(); word(); long(); long(); word(); long(); long();
  word(); skip(4); long(); skip(4); word(); long(); long(); long(); word(); long(); long(); long(); long(); word();
  if (source - resources.beam.install !== resources.beam.installLength) {
    throw new TypeError('White laser-bomb install did not consume its exact template');
  }
}

function fillSegment(ram, rom, resources, slot, position, animation, pointer) {
  const template = resources.beam.segment;
  ram.setU16(slot, rom.u16(template));
  ram.setU32(slot + 0x02, position >>> 0);
  ram.setU32(slot + 0x06, rom.u32(template + 2));
  ram.setU32(slot + 0x0a, animation >>> 0);
  ram.setU16(slot + 0x0e, rom.u16(template + 6));
  ram.setU32(slot + 0x10, rom.u32(template + 8));
  ram.setU32(slot + 0x14, rom.u32(template + 12));
  if (pointer !== null) ram.setU32(slot + 0x18, pointer >>> 0);
  ram.setU16(slot + 0x1c, rom.u16(template + 16));
}

function segmentAlive(ram, resources, nextY, phase2) {
  const rec = resources.ram.record;
  if (ram.u16(resources.ram.nearestRecord) !== 0) {
    return nextY <= ram.u16(resources.ram.nearestY) && nextY < 0x7800;
  }
  if (!phase2) return nextY < 0x7800;
  if (ram.u16(rec + BEAM_REC.tip + 0x28) !== 0 && !ram.btst8(rec, 6)
      && nextY > ram.u16(rec + BEAM_REC.tip + 0x02)) return false;
  return nextY < 0x7800;
}

function beamSegments(ram, rom, ctx, resources, player) {
  const rec = resources.ram.record;
  const nextCursor = u16(ram.u16(rec + 0x80a) - 4);
  ram.setU16(rec + 0x80a, (nextCursor & 0x8000) !== 0 ? 0x1c : nextCursor);
  const cursor = ram.u16(rec + 0x80a);
  const phase2 = ram.u16(rec + 0x18) !== 0;
  const pointerTable = ram.u32(rec + 0x2c);
  const animationIndex = ram.u16(rec + 0x24);
  let pointer = 0;
  let animationSource;
  if (!phase2) {
    pointer = rom.u32(pointerTable + i16(cursor));
    animationSource = pointer + i16(animationIndex);
  } else {
    animationSource = pointerTable + i16(cursor);
  }
  let seeded = false;
  let drawn = 0;
  let killed = 0;
  for (let index = 0; index < BEAM_REC.segs; index++) {
    const slot = rec + BEAM_REC.seg0 + index * resources.ram.stride;
    if ((ram.u16(slot) & 0x8000) === 0) {
      if (seeded) continue;
      const position = ((((u16(ram.u16(player + P.posY) + 0x600)) << 16) >>> 0)
        + ram.u16(player + P.posX)) >>> 0;
      fillSegment(
        ram, rom, resources, slot, position, rom.u32(animationSource),
        phase2 ? null : pointer,
      );
      seeded = true;
      drawBombRecordWithSharedRam(ram, ctx, slot);
      drawn++;
      continue;
    }
    if (!phase2) {
      ram.setU32(slot + 0x0a, rom.u32(ram.u32(slot + 0x18) + i16(animationIndex)));
    }
    let nextY = u16(u16(ram.u16(slot + 0x02) + 0x200) + ram.u16(player + P.velY));
    if (!segmentAlive(ram, resources, nextY, phase2)) {
      ram.setU16(slot, 0);
      killed++;
      continue;
    }
    nextY = u16(nextY + 0x200);
    ram.setU32(slot + 0x02,
      ((((nextY << 16) >>> 0) + ram.u16(player + P.posX))) >>> 0);
    drawBombRecordWithSharedRam(ram, ctx, slot);
    drawn++;
  }
  ctx?.bombEvent?.('beam-seg', `${drawn}/${killed}`);
  return Object.freeze({ drawn, killed, seeded });
}

function beamTailHead(ram, resources, player) {
  const rec = resources.ram.record;
  const head = rec + BEAM_REC.tail;
  if (ram.u16(head + 0x28) !== 0) return;
  if (ram.u16(resources.ram.nearestRecord) !== 0
      || (ram.u16(rec + BEAM_REC.tip + 0x28) !== 0 && !ram.btst8(rec, 6))) {
    ram.bset8(head, 1);
    return;
  }
  ram.bclr8(head, 1);
  const nextY = u16(u16(ram.u16(head + 0x02) + 0x400) + ram.u16(player + P.velY));
  ram.setU16(head + 0x02, nextY);
  if (nextY >= 0x7e00) {
    ram.setU16(head + 0x28, 1);
    ram.bset8(head, 1);
  }
}

function beamTip(ram, resources) {
  const rec = resources.ram.record;
  const tip = rec + BEAM_REC.tip;
  if (ram.bset8(tip, 1)) return;
  ram.bclr8(rec + BEAM_REC.tail, 1);
  let nextY = u16(ram.u16(tip + 0x02) + 0x400);
  if (ram.u16(rec + 0x18) !== 0) nextY = u16(nextY - 0x800);
  ram.setU16(rec + BEAM_REC.tail + 0x02, nextY);
  ram.setU16(rec + BEAM_REC.tail + 0x28, 0);
  ram.bset8(rec, 6);
}

function beamTipHead(ram, resources) {
  const rec = resources.ram.record;
  const tip = rec + BEAM_REC.tip;
  let targetY = ram.u16(resources.ram.nearestY);
  if (ram.u16(resources.ram.nearestRecord) === 0) {
    if (ram.u16(tip + 0x28) === 0) return beamTip(ram, resources);
    targetY = ram.u16(tip + 0x02);
    if (ram.bset8(rec, 5)) return beamTip(ram, resources);
  } else {
    ram.bclr8(rec, 5);
  }
  ram.bclr8(rec, 6);
  ram.bclr8(tip, 1);
  ram.setU16(tip + 0x02, targetY);
  ram.setU16(tip + 0x28, 1);
  return undefined;
}

function rebuildBeam(ram, rom, resources, player) {
  const rec = resources.ram.record;
  let y = u16(u16(ram.u16(player + P.posY) + 0x600) - ram.u16(player + P.velY));
  const x = ram.u16(player + P.posX);
  let stopped = false;
  let built = 0;
  let cleared = 0;
  const table = ram.u32(rec + 0x2c);
  for (let index = 0; index < BEAM_REC.segs; index++) {
    const slot = rec + BEAM_REC.seg0 + index * resources.ram.stride;
    if (stopped) {
      ram.setU16(slot, 0);
      cleared++;
      continue;
    }
    const animation = rom.u32(table + i16(ram.u16(rec + 0x80a)));
    const position = ((((y << 16) >>> 0) + x)) >>> 0;
    y = u16(y + 0x400);
    if (ram.u16(resources.ram.nearestRecord) !== 0) {
      if (y >= 0x7800) stopped = true;
    } else if (!ram.btst8(rec + BEAM_REC.tip, 1)) {
      if (y >= ram.u16(rec + BEAM_REC.tip + 0x02)) {
        ram.setU16(rec + BEAM_REC.tip + 0x02, y);
        stopped = true;
      }
    } else if (ram.btst8(rec + BEAM_REC.tail, 1)) {
      if (y >= 0x7800) stopped = true;
    } else if (y >= u16(ram.u16(rec + BEAM_REC.tail + 0x02) + 0x800)) {
      stopped = true;
    }
    fillSegment(ram, rom, resources, slot, position, animation, null);
    built++;
    const cursor = u16(ram.u16(rec + 0x80a) + 4);
    ram.setU16(rec + 0x80a, cursor === 0x20 ? 0 : cursor);
  }
  ram.setU16(rec + 0x80a, 0x1c);
  return Object.freeze({ built, cleared });
}

function beamFrame(ram, rom, ctx, resources, player) {
  const rec = resources.ram.record;
  const segments = beamSegments(ram, rom, ctx, resources, player);
  beamTailHead(ram, resources, player);
  beamTipHead(ram, resources);
  drawBombRecordWithSharedRam(ram, ctx, rec);
  if (!ram.btst8(rec + BEAM_REC.tail, 1)) {
    drawBombRecordWithSharedRam(ram, ctx, rec + BEAM_REC.tail);
  }
  drawBombRecordWithSharedRam(ram, ctx, rec + BEAM_REC.mid);
  let spark = false;
  if (!ram.btst8(rec + BEAM_REC.tip, 1)) {
    drawBombRecordWithSharedRam(ram, ctx, rec + BEAM_REC.tip);
    spark = spawnBeamBombSparkWithResources(
      ram, rom, ctx, rec + BEAM_REC.tip, resources.beam.spark,
    );
  }
  return Object.freeze({ segments, spark });
}

function resetBeam(ram, rom, ctx, resources, ownerIndex) {
  const callback = ctx?.whiteBombCallbacks?.resetOptions;
  if (typeof callback !== 'function') {
    throw new TypeError('White laser-bomb teardown needs the private option-reset callback');
  }
  callback(ownerIndex, ram, rom, ctx);
  const player = resources.sides[ownerIndex].player;
  ram.bclr8(player + P.flags1, 6);
  ram.setU16(resources.sides[ownerIndex].sound, 0);
  ram.bclr8(player + P.flags1, 7);
  ram.setU32(resources.ram.nearestRecord, 0);
}

function beamListStep(ram, rom, ctx, resources, player, ownerIndex) {
  const rec = resources.ram.record;
  let list = ram.u32(rec + 0x28);
  if (rom.u32(list) === 0xffffffff) {
    ram.setU16(resources.ram.cooldown, 0x28);
    resetBeam(ram, rom, ctx, resources, ownerIndex);
    teardown(ram, ctx, resources);
    return Object.freeze({ phase: 'teardown' });
  }
  ram.setU32(rec + 0x0a, rom.u32(list));
  ram.setU32(rec + BEAM_REC.tail + 0x0a, rom.u32(list + 4));
  ram.setU32(rec + BEAM_REC.mid + 0x0a, rom.u32(list + 8));
  ram.setU32(rec + BEAM_REC.tip + 0x0a, rom.u32(list + 12));
  ram.setU32(rec + 0x2c, rom.u32(list + 16));
  list += 20;
  ram.setU32(rec + 0x28, list);
  const rebuilt = rebuildBeam(ram, rom, resources, player);
  const frame = beamFrame(ram, rom, ctx, resources, player);
  return Object.freeze({ phase: 'beam-phase-2', rebuilt, frame });
}

function beamScript(ram, rom, ctx, resources, type) {
  const rec = resources.ram.record;
  const ownerIndex = (ram.u8(rec + 1) & 0x80) !== 0 ? 1 : 0;
  const player = resources.sides[ownerIndex].player;
  const familyIndex = ordinaryFamilyIndex(type);
  const family = resources.beam.families[familyIndex];
  if (!ram.bset8(rec, 0)) {
    installBeamTemplate(ram, rom, resources);
    ram.setU16(rec + BEAM_REC.tail + 0x02, u16(ram.u16(player + P.posY) - 0x200));
    ram.setU16(resources.ram.beamAux, 0);
    if (familyIndex !== 0) {
      ram.setU32(rec + B.script, family.head);
      ram.setU32(rec + 0x28, family.phase2);
      ram.setU32(rec + 0x2c, family.initialPointers);
      ram.setU32(rec + BEAM_REC.tail + B.script, family.tail);
      ram.setU32(rec + BEAM_REC.mid + B.script, family.mid);
      ram.setU32(rec + BEAM_REC.tip + B.script, family.tip);
    }
    const cue = resources.beam.cues[familyIndex];
    ctx?.soundPost?.(resources.soundRequestMap[cue]);
    ctx?.bombEvent?.('beam-init', 0);
  }
  const position = ram.u32(player + P.posY);
  ram.setU32(rec + 0x02, position);
  ram.setU16(rec + BEAM_REC.tail + 0x04, position & 0xffff);
  ram.setU32(rec + BEAM_REC.mid + 0x02, position);
  ram.setU16(rec + BEAM_REC.tip + 0x04, position & 0xffff);
  const cursor = u16(ram.u16(rec + 0x24) - 4);
  ram.setU16(rec + 0x24,
    (cursor & 0x8000) !== 0 ? ram.u16(rec + 0x26) : cursor);
  if (ram.u16(rec + 0x18) === 0) {
    const index = i16(ram.u16(rec + 0x24));
    ram.setU32(rec + 0x0a, rom.u32(ram.u32(rec + B.script) + index));
    ram.setU32(rec + BEAM_REC.tail + 0x0a,
      rom.u32(ram.u32(rec + BEAM_REC.tail + B.script) + index));
    ram.setU32(rec + BEAM_REC.mid + 0x0a,
      rom.u32(ram.u32(rec + BEAM_REC.mid + B.script) + index));
    ram.setU32(rec + BEAM_REC.tip + 0x0a,
      rom.u32(ram.u32(rec + BEAM_REC.tip + B.script) + index));
    const life = u16(ram.u16(rec + 0x1a) - 1);
    ram.setU16(rec + 0x1a, life);
    if (life === 0) {
      ram.setU16(rec + 0x18, 1);
      ctx?.bombEvent?.('beam-phase', 2);
      return beamListStep(ram, rom, ctx, resources, player, ownerIndex);
    }
    return Object.freeze({ phase: 'beam-phase-1', frame: beamFrame(
      ram, rom, ctx, resources, player,
    ) });
  }
  return beamListStep(ram, rom, ctx, resources, player, ownerIndex);
}

/** `$155394`: run one exact Build A bomb frame. */
export function runWhiteBombDriver155394(
  ram, rom, ctx, profileRequest,
) {
  requireWhiteBomb(profileRequest, 'White Label bomb driver');
  const prepared = preflightWhiteBombPointers(ram, rom, ctx, profileRequest);
  const { resources, type } = prepared;
  if (!prepared.active) {
    const cooldown = ram.u16(resources.ram.cooldown);
    if (cooldown === 0) return Object.freeze({ phase: 'inactive', cooldown: 0 });
    const next = u16(cooldown - 1);
    ram.setU16(resources.ram.cooldown, next);
    if (next === 0) {
      cooldownExpiry(ram, resources);
      ctx?.bombEvent?.('cooldown-expired', 0);
    }
    return Object.freeze({ phase: 'cooldown', cooldown: next });
  }
  const dispatch = type & 7;
  if ((dispatch & 1) !== 0) {
    const frame = beamScript(ram, rom, ctx, resources, type);
    return Object.freeze({ phase: 'laser', dispatch, frame });
  }
  ordinaryScript(ram, rom, ctx, resources, type);
  return Object.freeze({ phase: 'ordinary', dispatch });
}

/** `$144CE8`: run the Build A bomb damage body over the shared board RAM shape. */
export function runWhiteBombDamage144CE8(
  ram, ctx, playerRecord, profileRequest,
) {
  requireWhiteBomb(profileRequest, 'White Label bomb damage');
  assertRam(ram);
  const resources = validateResources();
  if (!resources.sides.some((side) => side.player === playerRecord)) {
    throw new RangeError('White bomb damage needs a native P1 or P2 player record');
  }
  return runBombDamageWithSharedRam(ram, ctx, playerRecord);
}
