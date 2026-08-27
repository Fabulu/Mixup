// Private P1-owned formation companion actors.
//
// Every companion has an allocator identity and isolated host memory for its
// ship, options, shots, beam, and outgoing damage. Companions are not players:
// they have no incoming collision, items, bombs, lives, tally, score, chain, HUD,
// continue, or Game Over state. Their availability follows native P1.

import { mirrorsFromPort } from './input.js';
import { MACHINE, OPT, P, RAM } from './machine.js';
import {
  ALLOC, resolveHandle241298, stageCreate,
} from './objalloc.js';
import {
  createThreePilotRenderState, renderThreePilotRequests,
} from './formationrender.js';
import {
  assertOptionOwnerInputAllowed, runOptionBlock,
} from './options.js';
import {
  LASER, PRIVATE_BEAM_GEOMETRY, assertPrivateBeamCapabilities,
  runPrivateBeamDraw, runPrivateSegmentDriver,
} from './laser.js';
import { runOrdinaryShotPath2497AA } from './player.js';
import { shotHandlers } from './shots.js';
import { runShotPool } from './weapons.js';
import {
  DMG, PRIVATE_DAMAGE_GEOMETRY, privateOutgoingDamagePass,
} from './damage.js';
import { ENEMY } from './enemies.js';
import { PRIVATE_SCORE_LAYOUT } from './score.js';
import { encodeRecordRequest, encodeZoomedRecordRequest } from './spritequeue.js';

const THREE_PILOT_ID = 'all-three-pilots-each-piloting-a-ship';
const THREE_PILOT_NAME = 'All Three Pilots, Each Piloting a Ship';
const COMPANION_INPUT_MASK = 0x005f; // directions, B1, and B3; never B2 or Start
const TWO_OFFSET_X = 0x0400;
const THREE_OFFSET_X = 0x0800;
const STAGE_CLEAR = 0x812972;
const MOVEMENT_DISABLE = 0x8130d2;
const VIRTUAL_STRIDE = 0x00010000;
const ANCHOR_TWO = Object.freeze({
  xMin: 0x0700,
  xMax: 0x3100,
  yMin: 0x0800,
  yMax: 0x6500,
});
const ANCHOR_THREE = Object.freeze({
  xMin: 0x0b00,
  xMax: 0x2d00,
  yMin: 0x0800,
  yMax: 0x6500,
});

const THREE_PILOT_SELECTION = Object.freeze({ ship: 0, style: 2 });
const THREE_PILOT_COMPANIONS = Object.freeze([
  Object.freeze({ ship: 0, style: 6, marker: 2, position: 'center' }),
  Object.freeze({ ship: 2, style: 4, marker: 3, position: 'right' }),
]);

export const THREE_PILOT_FORMATION_MODE = Object.freeze({
  id: THREE_PILOT_ID,
  name: THREE_PILOT_NAME,
  authenticSelection: THREE_PILOT_SELECTION,
  companions: THREE_PILOT_COMPANIONS,
});

// Host addresses deliberately sit beyond the 24-bit cartridge address space.
// Each companion receives a separate $10000-byte address region.
export const P3_VIRTUAL_BASE = 0x10000000;

function virtualLayout(base) {
  return Object.freeze({
    input: Object.freeze({ raw: base, edge: base + 0x02, previous: base + 0x04 }),
    player: base + 0x0100,
    options: base + 0x0200,
    shots: base + 0x0400,
    beamRecord: base + 0x0b00,
    beamControl: base + 0x0b00,
    beamDraw: base + 0x0b20,
    beamWord: base + 0x0b40,
    beamPool: base + 0x0c00,
    positionHistory: base + 0x1200,
    imageHistory: base + 0x1240,
    hyper: base + 0x1300,
    damageScratch: base + 0x1400,
    damageHyperShadows: base + 0x140e,
    damageReceipts: base + 0x1420,
    score: base + 0x1500,
    bomb: base + 0x1600,
    lives: base + 0x1700,
    tally: base + 0x1800,
  });
}

export const P3_VIRTUAL = virtualLayout(P3_VIRTUAL_BASE);

function scoreLedgerFor(virtual) {
  return Object.freeze({
    base: virtual.score,
    length: PRIVATE_SCORE_LAYOUT.length,
    total: virtual.score + PRIVATE_SCORE_LAYOUT.total,
    overflow: virtual.score + PRIVATE_SCORE_LAYOUT.overflow,
    pending: virtual.score + PRIVATE_SCORE_LAYOUT.pending,
    pendingEnd: virtual.score + PRIVATE_SCORE_LAYOUT.pending + 4,
    meter: virtual.score + PRIVATE_SCORE_LAYOUT.meter,
    chain: virtual.score + PRIVATE_SCORE_LAYOUT.chain,
    hiwater: virtual.score + PRIVATE_SCORE_LAYOUT.hiwater,
    prior: virtual.score + PRIVATE_SCORE_LAYOUT.prior,
    accA: virtual.score + PRIVATE_SCORE_LAYOUT.accA,
    accB: virtual.score + PRIVATE_SCORE_LAYOUT.accB,
    specialCadence: virtual.score + PRIVATE_SCORE_LAYOUT.specialCadence,
    weaponSel: virtual.player + P.shipSel,
    power: virtual.player + 0x22,
    formation: virtual.player + P.optFormation,
  });
}

/** Reserved dormant true-player score bytes. Active companions never use them. */
export const P3_PRIVATE_SCORE_LEDGER = scoreLedgerFor(P3_VIRTUAL);

function virtualRangesFor(virtual, name = 'companion') {
  return Object.freeze([
    Object.freeze({ name: `${name}-input`, start: virtual.input.raw, length: 0x06 }),
    Object.freeze({ name: `${name}-player`, start: virtual.player, length: P.stride }),
    Object.freeze({ name: `${name}-options`, start: virtual.options, length: OPT.stride }),
    Object.freeze({ name: `${name}-shots-reserved`, start: virtual.shots, length: 36 * 0x30 }),
    Object.freeze({ name: `${name}-beam-controls`, start: virtual.beamControl, length: 0x42 }),
    Object.freeze({ name: `${name}-beam-pool`, start: virtual.beamPool, length: 32 * 0x30 }),
    Object.freeze({ name: `${name}-position-history`, start: virtual.positionHistory, length: 0x40 }),
    Object.freeze({ name: `${name}-image-history`, start: virtual.imageHistory, length: 0x40 }),
    Object.freeze({ name: `${name}-hyper-reserved`, start: virtual.hyper, length: 0x0100 }),
    Object.freeze({ name: `${name}-damage-scratch`, start: virtual.damageScratch, length: 0x0e }),
    Object.freeze({ name: `${name}-damage-hyper-shadows`, start: virtual.damageHyperShadows,
      length: 0x04 }),
    Object.freeze({ name: `${name}-damage-receipts`, start: virtual.damageReceipts, length: 150 }),
    Object.freeze({ name: `${name}-score-reserved`, start: virtual.score,
      length: PRIVATE_SCORE_LAYOUT.length }),
    Object.freeze({ name: `${name}-bomb-reserved`, start: virtual.bomb, length: 0x20 }),
    Object.freeze({ name: `${name}-lives-reserved`, start: virtual.lives, length: 0x02 }),
    Object.freeze({ name: `${name}-tally-reserved`, start: virtual.tally, length: 0x24 }),
  ]);
}

export const P3_VIRTUAL_RANGES = virtualRangesFor(P3_VIRTUAL, 'p3');

export const THREE_PILOT_SHARED_RANGES = Object.freeze([
  Object.freeze({ name: 'auto-shot-setting', start: 0x80380f, length: 0x01,
    writable: false }),
  Object.freeze({ name: 'presentation-phase', start: 0x80390c, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'impact-rng', start: 0x803916, length: 0x02, writable: true }),
  Object.freeze({ name: 'p1-motion', start: RAM.player1, length: 0x06, writable: true }),
  Object.freeze({ name: 'p1-speed', start: RAM.player1 + P.speedIdx, length: 0x01,
    writable: false }),
  Object.freeze({ name: 'shot-count-pointers', start: 0x8127e4, length: 0x08,
    writable: false }),
  Object.freeze({ name: 'stage-draw-freeze', start: 0x812970, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'stage-clear', start: STAGE_CLEAR, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'shot-spawn-gate', start: 0x81308c, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'stage-selector', start: 0x813092, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'presentation-gate', start: 0x813098, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'movement-disable', start: MOVEMENT_DISABLE, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'shot-scroll-delta', start: 0x813176, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'p1-impact-sparks', start: 0x81d394, length: 30 * 0x22,
    writable: true }),
  Object.freeze({ name: 'impact-spark-count', start: 0x81db8c, length: 0x02,
    writable: true }),
]);

const P1_BINDING = Object.freeze({
  name: 'P1', logicalIndex: 0, targetIndex: 0, marker: 0, objectType: 2,
  renderVariant: 0, offsetX: -THREE_OFFSET_X, player: RAM.player1,
  options: RAM.p1Options,
  input: Object.freeze({ raw: RAM.p1raw, edge: RAM.p1edge, previous: RAM.p1prev }),
});

function companionBinding({ marker, base, offsetX, targetIndex, selection }) {
  const virtual = virtualLayout(base);
  return Object.freeze({
    name: `P1 companion ${targetIndex}`,
    logicalIndex: 2,
    targetIndex,
    marker,
    objectType: 3,
    renderVariant: selection.ship === 2 ? 1 : 0,
    offsetX,
    selection: Object.freeze({ ship: selection.ship, style: selection.style }),
    virtual,
    player: virtual.player,
    options: virtual.options,
    shots: virtual.shots,
    beam: Object.freeze({
      control: virtual.beamControl,
      record: virtual.beamControl,
      draw: virtual.beamDraw,
      word: virtual.beamWord,
      pool: virtual.beamPool,
      positionHistory: virtual.positionHistory,
      imageHistory: virtual.imageHistory,
    }),
    hyper: virtual.hyper,
    score: virtual.score,
    bomb: virtual.bomb,
    lives: virtual.lives,
    tally: virtual.tally,
    input: virtual.input,
  });
}

const P3_BINDING = companionBinding({
  marker: 2,
  base: P3_VIRTUAL_BASE,
  offsetX: 0,
  targetIndex: 2,
  selection: { ship: 0, style: 6 },
});
const P4_BINDING = companionBinding({
  marker: 3,
  base: P3_VIRTUAL_BASE + VIRTUAL_STRIDE,
  offsetX: THREE_OFFSET_X,
  targetIndex: 1,
  selection: { ship: 2, style: 4 },
});

export const FORMATION_ACTOR_BINDINGS = Object.freeze([P1_BINDING, P3_BINDING, P4_BINDING]);
export const P3_FORMATION_ACTOR_BINDING = P3_BINDING;
const BINDING_BY_MARKER = new Map(
  FORMATION_ACTOR_BINDINGS.map((binding) => [binding.marker, binding]));

/** Resolve an exact marker. No truthy side fallback is permitted. */
export function formationActorBindingForMarker(marker) {
  const binding = BINDING_BY_MARKER.get(marker);
  if (binding) return binding;
  throw new RangeError(`unknown formation actor marker ${marker}`);
}

function normalizeRanges(ranges, kind) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new TypeError(`${kind} ranges must be a non-empty array`);
  }
  const normalized = ranges.map((range, index) => {
    const start = range?.start;
    const length = range?.length;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || length <= 0) {
      throw new RangeError(`${kind} range ${index} must have integer start and positive length`);
    }
    return {
      name: String(range.name ?? `${kind}-${index}`),
      start,
      length,
      end: start + length,
      offset: 0,
      writable: range.writable !== false,
    };
  }).sort((a, b) => a.start - b.start);
  let offset = 0;
  for (let i = 0; i < normalized.length; i++) {
    const range = normalized[i];
    if (!Number.isSafeInteger(range.end)) throw new RangeError(`${range.name} range overflows`);
    if (i > 0 && normalized[i - 1].end > range.start) {
      throw new RangeError(`${normalized[i - 1].name} overlaps ${range.name}`);
    }
    range.offset = offset;
    offset += range.length;
  }
  return { ranges: normalized, byteLength: offset };
}

/**
 * Strict mixed memory view for one host actor. Only declared shared cartridge
 * ranges and declared virtual ranges exist in this view. Every multi-byte
 * operation must fit wholly within one declaration.
 */
export class StrictSidecarMemory {
  #realRam;
  #virtualRanges;
  #sharedRanges;
  #bytes;
  #view;

  constructor(realRam, { virtualRanges, sharedRanges }) {
    for (const name of [
      'u8', 'i8', 'u16', 'i16', 'u32', 'setU8', 'setU16', 'setU32',
      'bchg8', 'bclr8', 'bset8', 'btst8',
    ]) {
      if (typeof realRam?.[name] !== 'function') {
        throw new TypeError(`realRam must implement ${name}()`);
      }
    }
    const virtual = normalizeRanges(virtualRanges, 'virtual');
    const shared = normalizeRanges(sharedRanges, 'shared');
    for (const range of virtual.ranges) {
      if (range.start < 0x1000000) {
        throw new RangeError(`${range.name} is not outside the cartridge address space`);
      }
    }
    for (const range of shared.ranges) {
      if (range.start < MACHINE.ramBase || range.end > MACHINE.ramBase + MACHINE.ramSize) {
        throw new RangeError(`${range.name} is outside main RAM`);
      }
    }
    this.#realRam = realRam;
    this.#virtualRanges = virtual.ranges;
    this.#sharedRanges = shared.ranges;
    this.#bytes = new Uint8Array(virtual.byteLength);
    this.#view = new DataView(this.#bytes.buffer);
  }

  #location(address, width) {
    if (!Number.isSafeInteger(address)) throw new RangeError(`${address} is not an integer address`);
    const locate = (ranges, kind) => {
      for (const range of ranges) {
        if (address < range.start || address >= range.end) continue;
        if (address + width > range.end) {
          throw new RangeError(`${kind} access at $${address.toString(16)} crosses ${range.name}`);
        }
        return { kind, range, offset: range.offset + address - range.start };
      }
      return null;
    };
    const virtual = locate(this.#virtualRanges, 'virtual');
    if (virtual) return virtual;
    const shared = locate(this.#sharedRanges, 'shared');
    if (shared) return shared;
    const label = address >= 0x1000000 ? 'undeclared virtual address' : 'undeclared shared address';
    throw new RangeError(`${label} $${address.toString(16)}`);
  }

  #writeLocation(address, width) {
    const loc = this.#location(address, width);
    if (loc.kind === 'shared' && !loc.range.writable) {
      throw new TypeError(`shared range ${loc.range.name} is read-only`);
    }
    return loc;
  }

  u8(address) {
    const loc = this.#location(address, 1);
    return loc.kind === 'shared' ? this.#realRam.u8(address) : this.#bytes[loc.offset];
  }
  i8(address) {
    const loc = this.#location(address, 1);
    return loc.kind === 'shared' ? this.#realRam.i8(address) : this.#view.getInt8(loc.offset);
  }
  u16(address) {
    const loc = this.#location(address, 2);
    return loc.kind === 'shared' ? this.#realRam.u16(address)
      : this.#view.getUint16(loc.offset, false);
  }
  i16(address) {
    const loc = this.#location(address, 2);
    return loc.kind === 'shared' ? this.#realRam.i16(address)
      : this.#view.getInt16(loc.offset, false);
  }
  u32(address) {
    const loc = this.#location(address, 4);
    return loc.kind === 'shared' ? this.#realRam.u32(address)
      : this.#view.getUint32(loc.offset, false);
  }
  setU8(address, value) {
    const loc = this.#writeLocation(address, 1);
    if (loc.kind === 'shared') this.#realRam.setU8(address, value);
    else this.#bytes[loc.offset] = value & 0xff;
  }
  setU16(address, value) {
    const loc = this.#writeLocation(address, 2);
    if (loc.kind === 'shared') this.#realRam.setU16(address, value);
    else this.#view.setUint16(loc.offset, value & 0xffff, false);
  }
  setU32(address, value) {
    const loc = this.#writeLocation(address, 4);
    if (loc.kind === 'shared') this.#realRam.setU32(address, value);
    else this.#view.setUint32(loc.offset, value >>> 0, false);
  }
  bchg8(address, bit) {
    const loc = this.#writeLocation(address, 1);
    if (loc.kind === 'shared') return this.#realRam.bchg8(address, bit);
    const old = (this.#bytes[loc.offset] >> bit) & 1;
    this.#bytes[loc.offset] ^= 1 << bit;
    return old;
  }
  bclr8(address, bit) {
    const loc = this.#writeLocation(address, 1);
    if (loc.kind === 'shared') return this.#realRam.bclr8(address, bit);
    const old = (this.#bytes[loc.offset] >> bit) & 1;
    this.#bytes[loc.offset] &= ~(1 << bit) & 0xff;
    return old;
  }
  bset8(address, bit) {
    const loc = this.#writeLocation(address, 1);
    if (loc.kind === 'shared') return this.#realRam.bset8(address, bit);
    const old = (this.#bytes[loc.offset] >> bit) & 1;
    this.#bytes[loc.offset] |= 1 << bit;
    return old;
  }
  btst8(address, bit) {
    const loc = this.#location(address, 1);
    return loc.kind === 'shared' ? this.#realRam.btst8(address, bit)
      : (this.#bytes[loc.offset] >> bit) & 1;
  }
}

function damageResourcesFor(binding) {
  const v = binding.virtual;
  return Object.freeze({
    ...PRIVATE_DAMAGE_GEOMETRY,
    player: binding.player,
    shots: binding.shots,
    beamControl: binding.beam.control,
    slot27: binding.beam.pool + 0x510,
    slot30: binding.beam.pool + 0x5a0,
    scratch: v.damageScratch,
    hyperShadows: v.damageHyperShadows,
    receipts: v.damageReceipts,
    incomingPolicy: 'none',
    bombPolicy: 'none',
    bulletErasePolicy: 'none',
    itemPolicy: 'none',
    hyperPolicy: 'zero-shadow',
  });
}

export const P3_PRIVATE_DAMAGE_RESOURCES = damageResourcesFor(P3_BINDING);

const DAMAGE_NATIVE_READS = Object.freeze([
  Object.freeze({ start: DMG.mirror2, length: 0x02 }),
  Object.freeze({ start: 0x8130f8, length: 0x02 }),
  Object.freeze({ start: DMG.gate308c, length: 0x02 }),
  Object.freeze({ start: DMG.g309c, length: 0x02 }),
  Object.freeze({ start: DMG.poolACount, length: 0x04 }),
  Object.freeze({ start: DMG.b410, length: 0x02 }),
]);

function damageSidecarRanges(state) {
  const b = state.binding;
  return [
    { start: b.player, length: P.stride, writable: false },
    { start: b.shots, length: 36 * 0x30, writable: true },
    { start: b.beam.control, length: 0x20, writable: true },
    { start: state.damage.resources.slot27, length: 0x30, writable: true },
    { start: state.damage.resources.slot30, length: 0x30, writable: true },
  ];
}

function rangeContains(range, address, width) {
  return address >= range.start && address + width <= range.start + range.length;
}

function enemyIndexForAddress(address) {
  const delta = address - PRIVATE_DAMAGE_GEOMETRY.enemyBase;
  if (delta < 0 || delta >= PRIVATE_DAMAGE_GEOMETRY.enemySlots
      * PRIVATE_DAMAGE_GEOMETRY.enemyStride) return -1;
  return Math.floor(delta / PRIVATE_DAMAGE_GEOMETRY.enemyStride);
}

function mainIdentity(ram, main, subBase, span) {
  return {
    main,
    mainWord: ram.u16(main),
    subBase,
    span,
    handler: ram.u32(main + ENEMY.handlerOff),
    classByte: ram.u8(main + ENEMY.classOff),
  };
}

function sameMainIdentity(a, b) {
  return a != null && b != null
    && a.main === b.main && a.mainWord === b.mainWord
    && a.subBase === b.subBase && a.span === b.span
    && a.handler === b.handler && a.classByte === b.classByte;
}

function buildEnemyOwnerMap(state) {
  const { ram } = state.game;
  const owners = new Array(PRIVATE_DAMAGE_GEOMETRY.enemySlots).fill(null);
  const enemyStart = PRIVATE_DAMAGE_GEOMETRY.enemyBase;
  const enemyEnd = enemyStart + PRIVATE_DAMAGE_GEOMETRY.enemySlots
    * PRIVATE_DAMAGE_GEOMETRY.enemyStride;
  for (let slot = 0; slot < ENEMY.slots; slot++) {
    const main = ENEMY.table + slot * ENEMY.stride;
    if (ram.u16(main) === 0) continue;
    const subBase = ram.u32(main + ENEMY.subRecOff);
    const span = ram.u16(main + ENEMY.seqOff) + 1;
    const subEnd = subBase + span * PRIVATE_DAMAGE_GEOMETRY.enemyStride;
    if (subEnd <= enemyStart || subBase >= enemyEnd) continue;
    if (subBase < enemyStart || subEnd > enemyEnd
        || (subBase - enemyStart) % PRIVATE_DAMAGE_GEOMETRY.enemyStride !== 0) {
      throw new RangeError('enemy main/subrecord span crosses private damage geometry');
    }
    const identity = mainIdentity(ram, main, subBase, span);
    for (let part = 0; part < span; part++) {
      const index = (subBase - enemyStart) / PRIVATE_DAMAGE_GEOMETRY.enemyStride + part;
      if (owners[index] != null) {
        throw new RangeError(`enemy subrecord ${index} has overlapping main owners`);
      }
      owners[index] = { ...identity, part };
    }
  }
  return owners;
}

function clearDamageReceipt(state, index) {
  state.memory.setU8(state.binding.virtual.damageReceipts + index, 0);
  state.damage.receiptMeta[index] = null;
}

function clearAllDamageReceipts(state) {
  for (let index = 0; index < PRIVATE_DAMAGE_GEOMETRY.receiptCount; index++) {
    clearDamageReceipt(state, index);
  }
  state.damage.deferredEvents.clear();
  state.damage.enemyContext = null;
}

function reconcileDamageReceipts(state, suppliedOwners = null) {
  const owners = suppliedOwners ?? buildEnemyOwnerMap(state);
  const { ram } = state.game;
  for (let index = 0; index < PRIVATE_DAMAGE_GEOMETRY.receiptCount; index++) {
    const meta = state.damage.receiptMeta[index];
    const receipt = state.memory.u8(state.binding.virtual.damageReceipts + index);
    if (meta == null && receipt === 0) continue;
    const owner = owners[index];
    const rec = PRIVATE_DAMAGE_GEOMETRY.enemyBase
      + index * PRIVATE_DAMAGE_GEOMETRY.enemyStride;
    if (meta == null || receipt !== (0x80 | meta.preMask)
        || !sameMainIdentity(meta.owner, owner)
        || (ram.u16(rec) & ~0x5c00) !== meta.baseWord) {
      clearDamageReceipt(state, index);
    }
  }
  return owners;
}

function clearP3DamageScratch(state) {
  if (!state?.damage) return;
  for (let offset = 0; offset < PRIVATE_DAMAGE_GEOMETRY.scratchLength; offset++) {
    state.memory.setU8(state.binding.virtual.damageScratch + offset, 0);
  }
  for (let offset = 0; offset < PRIVATE_DAMAGE_GEOMETRY.hyperShadowLength; offset++) {
    state.memory.setU8(state.binding.virtual.damageHyperShadows + offset, 0);
  }
  state.damage.last = null;
  state.damage.source = null;
  state.damage.ownerMap = null;
  state.damage.actorId = 0;
}

function managerOwnsState(state) {
  const manager = ATTACHED.get(state.game);
  return manager != null && manager.companions.includes(state);
}

class PrivateDamageMemory {
  #state;

  constructor(state) {
    this.#state = state;
  }

  #mappedSidecar(address, width, writable) {
    const scratchStart = DMG.fa72;
    const scratchEnd = scratchStart + PRIVATE_DAMAGE_GEOMETRY.scratchLength;
    if (address >= scratchStart && address + width <= scratchEnd) {
      return this.#state.binding.virtual.damageScratch + address - scratchStart;
    }
    const hyperStart = DMG.b6e6;
    const hyperEnd = hyperStart + PRIVATE_DAMAGE_GEOMETRY.hyperShadowLength;
    if (address >= hyperStart && address + width <= hyperEnd) {
      return this.#state.binding.virtual.damageHyperShadows + address - hyperStart;
    }
    const range = damageSidecarRanges(this.#state).find((candidate) =>
      rangeContains(candidate, address, width));
    if (range) {
      if (writable && !range.writable) {
        throw new TypeError(`private damage sidecar range at $${address.toString(16)} is read-only`);
      }
      return address;
    }
    return null;
  }

  #nativeReadAllowed(address, width) {
    const index = enemyIndexForAddress(address);
    if (index >= 0) {
      const record = PRIVATE_DAMAGE_GEOMETRY.enemyBase
        + index * PRIVATE_DAMAGE_GEOMETRY.enemyStride;
      return address + width <= record + PRIVATE_DAMAGE_GEOMETRY.enemyStride;
    }
    return DAMAGE_NATIVE_READS.some((range) => rangeContains(range, address, width));
  }

  #read(kind, address, width) {
    const sidecar = this.#mappedSidecar(address, width, false);
    if (sidecar != null) return this.#state.memory[kind](sidecar);
    if (!this.#nativeReadAllowed(address, width)) {
      throw new RangeError(`private damage rejected native read at $${address.toString(16)}`);
    }
    return this.#state.game.ram[kind](address);
  }

  #receiptForEnemyWrite(address, value) {
    const index = enemyIndexForAddress(address);
    const record = PRIVATE_DAMAGE_GEOMETRY.enemyBase
      + index * PRIVATE_DAMAGE_GEOMETRY.enemyStride;
    const offset = address - record;
    if (index < 0 || (offset !== 0 && offset !== 0x18)) {
      throw new TypeError(`private damage rejected native write at $${address.toString(16)}`);
    }
    if (this.#state.damage.source == null) {
      throw new Error('private damage enemy write has no owner-scoped source');
    }
    const owner = this.#state.damage.ownerMap?.[index] ?? null;
    if (owner == null) {
      throw new RangeError(`enemy subrecord ${index} has no current main-record owner`);
    }
    let meta = this.#state.damage.receiptMeta[index];
    if (meta != null && !sameMainIdentity(meta.owner, owner)) {
      clearDamageReceipt(this.#state, index);
      meta = null;
    }
    if (offset === 0) {
      const newMask = (value >>> 8) & 0x5c;
      const required = this.#state.damage.source.rawMask >>> 8;
      if ((newMask & required) !== required) {
        throw new TypeError('private damage type write omitted its transient wake mask');
      }
      if (meta == null) {
        const oldWord = this.#state.game.ram.u16(record);
        const preMask = this.#state.game.ram.u8(record) & 0x5c;
        meta = {
          index,
          rec: record,
          owner,
          actorId: this.#state.actorId,
          epoch: this.#state.damage.epoch,
          preMask,
          baseWord: oldWord & ~0x5c00,
          postMask: newMask,
          privateMask: required,
          privateScoreMask: this.#state.damage.source.scoreMask,
          sources: new Set(),
          committed: false,
        };
        this.#state.memory.setU8(this.#state.binding.virtual.damageReceipts + index,
          0x80 | preMask);
        this.#state.damage.receiptMeta[index] = meta;
      }
      meta.postMask = newMask;
      meta.privateMask |= required;
      meta.privateScoreMask |= this.#state.damage.source.scoreMask;
      meta.sources.add(this.#state.damage.source.name);
      return { index, meta, record, offset };
    }
    if (meta == null || !meta.committed) {
      throw new Error('private damage HP write has no committed type-word receipt');
    }
    return { index, meta, record, offset };
  }

  #write(kind, address, width, value) {
    const sidecar = this.#mappedSidecar(address, width, true);
    if (sidecar != null) {
      this.#state.memory[kind](sidecar, value);
      return;
    }
    if (kind !== 'setU16' || width !== 2) {
      throw new TypeError(`private damage rejected native write at $${address.toString(16)}`);
    }
    const receipt = this.#receiptForEnemyWrite(address, value);
    this.#state.game.ram.setU16(address, value);
    if (receipt.offset === 0) receipt.meta.committed = true;
  }

  assertPrivateDamageCapabilities(resources) {
    const state = this.#state;
    if (resources !== state.damage.resources
        || state.game.ram !== state.damage.realRam
        || !managerOwnsState(state)
        || state.lifecycle !== 'alive' || state.actorId === 0
        || state.damage.actorId !== state.actorId) {
      throw new Error('private damage adapter identity or lifecycle mismatch');
    }
    const resolved = resolveHandle241298(state.game.ram, state.actorId);
    if (!resolved.found
        || (state.game.ram.u16(resolved.rec) & 0xff) !== state.binding.objectType
        || state.game.ram.u8(resolved.rec + 0x07) !== state.binding.marker) {
      throw new Error('private damage allocator identity mismatch');
    }
    for (let offset = 0; offset < PRIVATE_DAMAGE_GEOMETRY.hyperShadowLength; offset++) {
      if (state.memory.u8(state.binding.virtual.damageHyperShadows + offset) !== 0) {
        throw new Error('private damage hyper shadows must remain zero');
      }
    }
    state.damage.ownerMap = reconcileDamageReceipts(state);
  }

  beginPrivateDamageSource(name, rawMask) {
    const expected = name === 'ordinary'
      ? PRIVATE_DAMAGE_GEOMETRY.ordinaryMask : PRIVATE_DAMAGE_GEOMETRY.weaponMask;
    if (!['ordinary', 'slot-27', 'slot-30', 'beam'].includes(name)
        || rawMask !== expected || this.#state.damage.source != null) {
      throw new TypeError('private damage source or transient mask is invalid');
    }
    const scoreMask = name === 'ordinary' ? 0 : name === 'slot-30' ? 0x44 : 0x04;
    this.#state.damage.source = { name, rawMask, scoreMask };
  }

  endPrivateDamageSource() {
    this.#state.damage.source = null;
  }

  u8(address) { return this.#read('u8', address, 1); }
  i8(address) { return this.#read('i8', address, 1); }
  u16(address) { return this.#read('u16', address, 2); }
  i16(address) { return this.#read('i16', address, 2); }
  u32(address) { return this.#read('u32', address, 4); }
  setU8(address, value) { this.#write('setU8', address, 1, value); }
  setU16(address, value) { this.#write('setU16', address, 2, value); }
  setU32(address, value) { this.#write('setU32', address, 4, value); }
  bchg8(address, bit) {
    const old = this.btst8(address, bit);
    this.setU8(address, this.u8(address) ^ (1 << bit));
    return old;
  }
  bclr8(address, bit) {
    const old = this.btst8(address, bit);
    this.setU8(address, this.u8(address) & ~(1 << bit));
    return old;
  }
  bset8(address, bit) {
    const old = this.btst8(address, bit);
    this.setU8(address, this.u8(address) | (1 << bit));
    return old;
  }
  btst8(address, bit) { return (this.u8(address) >> bit) & 1; }
}

const ATTACHED = new WeakMap();

function clearP3ShotState(state) {
  if (!state?.shots) return;
  state.shots.requests.length = 0;
  state.shots.actorId = 0;
  state.shots.calls = 0;
  const player = state.binding.player;
  state.memory.bclr8(player + P.flags1, 3);
  state.memory.bclr8(player + P.flags1, 4);
  state.memory.bclr8(player + P.state, 3);
  state.memory.setU8(player + 0x2a, 0);
  state.memory.setU8(player + 0x2b, 0);
  state.memory.setU8(player + 0x3c, 0);
  for (let offset = 0; offset < 36 * 0x30; offset++) {
    state.memory.setU8(state.binding.shots + offset, 0);
  }
}

function clearP3OptionState(state) {
  if (!state?.weapons) return;
  state.weapons.requests.length = 0;
  state.weapons.actorId = 0;
  state.weapons.calls = 0;
  for (let offset = 0; offset < OPT.stride; offset++) {
    state.memory.setU8(state.binding.options + offset, 0);
  }
}

function clearP3BeamState(state) {
  if (!state?.beam) return;
  state.beam.requests.length = 0;
  state.beam.actorId = 0;
  state.beam.segmentCalls = 0;
  state.beam.drawCalls = 0;
  for (let offset = 0; offset < 0x42; offset++) {
    state.memory.setU8(state.binding.beam.control + offset, 0);
  }
  for (let offset = 0; offset < 32 * 0x30; offset++) {
    state.memory.setU8(state.binding.beam.pool + offset, 0);
  }
  for (const history of [state.binding.beam.positionHistory, state.binding.beam.imageHistory]) {
    for (let offset = 0; offset < 0x40; offset++) state.memory.setU8(history + offset, 0);
  }
}

function clearP3ScoreState(state) {
  for (let offset = 0; offset < state.scoreLedger.length; offset++) {
    state.memory.setU8(state.scoreLedger.base + offset, 0);
  }
}

function clearP3WeaponState(state) {
  clearP3ShotState(state);
  clearP3OptionState(state);
  clearP3BeamState(state);
  clearP3DamageScratch(state);
}

function bindP3ShotResources(state) {
  const requestSink = (bucket) => (memory, rec, presentation = null) => {
    const bytes = presentation?.zoomFlags == null
      ? encodeRecordRequest(memory, rec)
      : encodeZoomedRecordRequest(memory, rec, presentation.zoomFlags);
    state.shots.requests.push({ bucket, bytes });
    return state.shots.requests.length - 1;
  };
  const ship = Object.freeze({
    ownerIndex: state.binding.logicalIndex,
    pool: state.binding.shots,
    slots: 36,
    stride: 0x30,
    countPointer: 0x8127e4,
    gate308c: 0x81308c,
    primaryTable: 0x2554ea,
    secondaryTable: 0x255502,
    typeBTable: 0x25551a,
    soundPolicy: 'silent',
  });
  const options = Object.freeze({
    ownerIndex: state.binding.logicalIndex,
    pool: state.binding.shots,
    slots: 36,
    stride: 0x30,
    countPointer: 0x8127e8,
    gate308c: 0x81308c,
    formation2PrimaryTable: 0x24d2fc,
    formation2SecondaryTable: 0x24d35c,
    formation4Table: 0x24d3bc,
    formation6Table: 0x24d41c,
    hyperCounts: 0x24d47c,
    presentationSink: requestSink(0),
  });
  const driver = Object.freeze({
    ownerIndex: state.binding.logicalIndex,
    pool: state.binding.shots,
    player: state.binding.player,
    slots: 36,
    stride: 0x30,
    scrollDelta: 0x813176,
    liveCounter: null,
    presentationSink: requestSink(14),
    requestTelemetry: false,
  });
  state.shots.resources = Object.freeze({
    ordinary: Object.freeze({
      ownerIndex: state.binding.logicalIndex,
      options: state.binding.options,
      autoShotSetting: 0x80380f,
      shotResources: ship,
    }),
    ship,
    options,
    driver,
  });
}

function bindP3BeamResources(state) {
  const presentationSink = (memory, rec) => {
    state.beam.requests.push({
      bucket: LASER.emitBucket,
      bytes: encodeRecordRequest(memory, rec),
    });
    return state.beam.requests.length - 1;
  };
  state.beam.resources = Object.freeze({
    scope: 'private',
    ownerIndex: state.binding.logicalIndex,
    d7: 1,
    segmentOwnerWord: 1,
    slots: 32,
    stride: 0x30,
    player: state.binding.player,
    opt: state.binding.options,
    rec: state.binding.beam.control,
    blk: state.binding.beam.draw,
    word: state.binding.beam.word,
    pool: state.binding.beam.pool,
    head: state.binding.beam.pool + 0x510,
    muzzle: state.binding.beam.pool + 0x540,
    pair: state.binding.beam.pool + 0x5a0,
    posHistory: state.binding.beam.positionHistory,
    imgHistory: state.binding.beam.imageHistory,
    dispatch: LASER.dispatchP1,
    drawBias: 0x180,
    soundPolicy: 'silent',
    effectPolicy: 'none',
    presentationSink,
    presentationBucket: LASER.emitBucket,
  });
  assertPrivateBeamCapabilities(state.beam.resources);
}

function initializeP3OptionState(state) {
  clearP3OptionState(state);
  state.memory.setU16(state.binding.options + OPT.state, 0x8000);
  state.weapons.actorId = state.actorId;
}

function collectThreePilotSpriteRequests(state, game) {
  if (state.game !== game || !managerOwnsState(state)) {
    throw new Error('private companion sprite hook is attached to a different Game');
  }
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, state.binding)
      || !liveNonDeath(game.ram, P1_BINDING)
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3WeaponState(state);
    return renderThreePilotRequests(state, game);
  }
  const shotRequests = state.shots.requests.splice(0);
  const optionRequests = state.weapons.requests.splice(0);
  const beamRequests = state.beam.requests.splice(0);
  const shipRequests = renderThreePilotRequests(state, game);
  return shotRequests.concat(optionRequests, beamRequests, shipRequests);
}

function p3OptionBlock(state) {
  return {
    ownerIndex: state.binding.logicalIndex,
    opt: state.binding.options,
    player: state.binding.player,
    laser: state.binding.beam.draw,
    beam: state.beam.resources,
    rampGuard: state.binding.bomb,
    allowLaser: true,
    allowShots: true,
    virtualRequests: state.weapons.requests,
    shotResources: state.shots.resources.options,
  };
}

function assertP3ShotInputAllowed(state) {
  const excludedInput = state.memory.u8(state.binding.player + P.dirByte)
    | state.memory.u8(state.binding.player + P.btnByte);
  if ((excludedInput & 0xa0) !== 0) {
    throw new RangeError('private ordinary-shot owner received excluded B2 or Start input');
  }
}

function clearMismatchedWeaponIdentity(state) {
  const ids = [state.shots.actorId, state.weapons.actorId, state.beam.actorId];
  if (ids.some((id) => id !== 0 && id !== state.actorId)) {
    clearP3WeaponState(state);
    return true;
  }
  return false;
}

function runCompanionShotObject(state, invokingCtx = null) {
  const { game } = state;
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, state.binding)
      || !liveNonDeath(game.ram, P1_BINDING)
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3WeaponState(state);
    return 0;
  }
  assertP3ShotInputAllowed(state);
  clearMismatchedWeaponIdentity(state);
  state.shots.actorId = state.actorId;
  state.shots.requests.length = 0;
  const ctx = {
    rom: game.rom,
    tables: game.tables,
    unportedLog: game.unportedLog,
    soundPost: invokingCtx?.soundPost,
    shotSparkAllocatorPlayer: 0x8103e6,
  };
  runOrdinaryShotPath2497AA(state.memory, state.binding.player, ctx,
    state.shots.resources.ordinary);
  const processed = runShotPool(state.memory, game.rom, shotHandlers(), ctx,
    state.shots.resources.driver);
  state.shots.calls++;
  return processed;
}

function runCompanionOptionObject(state) {
  const { game } = state;
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, state.binding)
      || !liveNonDeath(game.ram, P1_BINDING)
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3WeaponState(state);
    return 0;
  }

  const block = p3OptionBlock(state);
  assertOptionOwnerInputAllowed(state.memory, block);
  clearMismatchedWeaponIdentity(state);
  state.weapons.requests.length = 0;
  if (state.weapons.actorId !== state.actorId
      || (state.memory.u16(state.binding.options + OPT.state) & 0x8000) === 0) {
    clearP3BeamState(state);
    initializeP3OptionState(state);
  }

  runOptionBlock(state.memory, game, block);
  state.weapons.calls++;
  return state.weapons.requests.length;
}

function runCompanionSegmentObject(state) {
  const { game } = state;
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, state.binding)
      || !liveNonDeath(game.ram, P1_BINDING)
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3WeaponState(state);
    return 0;
  }
  assertP3ShotInputAllowed(state);
  assertPrivateBeamCapabilities(state.beam.resources);
  clearMismatchedWeaponIdentity(state);
  state.beam.actorId = state.actorId;
  state.beam.requests.length = 0;
  const processed = runPrivateSegmentDriver(state.memory, {
    rom: game.rom,
    tables: game.tables,
    unportedLog: game.unportedLog,
    soundPost: game.soundPost,
  }, state.beam.resources);
  state.beam.segmentCalls++;
  return processed;
}

function runCompanionBeamDrawObject(state) {
  const { game } = state;
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, state.binding)
      || !liveNonDeath(game.ram, P1_BINDING)
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3WeaponState(state);
    return 0;
  }
  assertP3ShotInputAllowed(state);
  assertPrivateBeamCapabilities(state.beam.resources);
  clearMismatchedWeaponIdentity(state);
  state.beam.actorId = state.actorId;
  const emitted = runPrivateBeamDraw(state.memory, {
    rom: game.rom,
    tables: game.tables,
    unportedLog: game.unportedLog,
    soundPost: game.soundPost,
  }, state.beam.resources);
  state.beam.drawCalls++;
  return emitted;
}

function runCompanionDamageObject(state, invokingCtx = null) {
  const { game } = state;
  reconcileDamageReceipts(state);
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, state.binding)
      || !liveNonDeath(game.ram, P1_BINDING)
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3WeaponState(state);
    return null;
  }
  clearMismatchedWeaponIdentity(state);

  let liveShots = false;
  for (let slot = 0; slot < PRIVATE_DAMAGE_GEOMETRY.shotSlots; slot++) {
    if ((state.memory.u16(state.binding.shots + slot * PRIVATE_DAMAGE_GEOMETRY.shotStride)
        & 0x8000) !== 0) {
      liveShots = true;
      break;
    }
  }
  const resources = state.damage.resources;
  const liveBeam = (state.memory.u16(resources.beamControl) & 0x8000) !== 0
    || (state.memory.u16(resources.slot27) & 0x8000) !== 0
    || (state.memory.u16(resources.slot30) & 0x8000) !== 0;
  if ((liveShots && state.shots.actorId !== state.actorId)
      || (liveBeam && state.beam.actorId !== state.actorId)) {
    clearP3WeaponState(state);
    return null;
  }

  clearP3DamageScratch(state);
  state.damage.actorId = state.actorId;
  state.damage.epoch++;
  const result = privateOutgoingDamagePass(state.damage.memory, invokingCtx, resources);
  state.damage.last = result;
  state.damage.calls++;
  return result;
}

function attachedCompanions(game) {
  return ATTACHED.get(game)?.companions ?? [];
}

/** Run every attached companion's private shot path. */
export function runThreePilotShotObject(game, invokingCtx = null) {
  return attachedCompanions(game).reduce((sum, state) =>
    sum + runCompanionShotObject(state, invokingCtx), 0);
}

/** Run every attached companion's private option path. */
export function runThreePilotOptionObject(game) {
  return attachedCompanions(game).reduce((sum, state) =>
    sum + runCompanionOptionObject(state), 0);
}

/** Run every attached companion's private beam segment path. */
export function runThreePilotSegmentObject(game) {
  return attachedCompanions(game).reduce((sum, state) =>
    sum + runCompanionSegmentObject(state), 0);
}

/** Run every attached companion's private beam draw path. */
export function runThreePilotBeamDrawObject(game) {
  return attachedCompanions(game).reduce((sum, state) =>
    sum + runCompanionBeamDrawObject(state), 0);
}

/** Run every attached companion's outgoing-only damage path. */
export function runThreePilotDamageObject(game, invokingCtx = null) {
  const results = attachedCompanions(game)
    .map((state) => runCompanionDamageObject(state, invokingCtx));
  return results[0] ?? null;
}

function availableReceiptIndices(state, current) {
  return current.indices.filter((index) => {
    if (current.used.has(index)) return false;
    return state.damage.receiptMeta[index]?.committed === true;
  });
}

function selectReceiptIndices(state, current, event, rawMask) {
  const available = availableReceiptIndices(state, current);
  if (available.length === 0) return [];

  // Damage handlers clear their consumed $5C bits before scoring. This identifies
  // every receipt that contributed to an aggregate handler without guessing its
  // part layout or treating one receipt's postMask as the aggregate mask.
  const changed = available.filter((index) => {
    const meta = state.damage.receiptMeta[index];
    return (state.game.ram.u8(meta.rec) & 0x5c) !== meta.postMask;
  });
  if (changed.length !== 0) return changed;

  if (event.phase === 'score-hit') {
    const exact = enemyIndexForAddress(event.a6);
    if (available.includes(exact)) return [exact];
  }

  if (rawMask === 0) return [];
  return available.filter((index) => {
    const postMask = state.damage.receiptMeta[index].postMask;
    return (postMask & rawMask) === postMask;
  });
}

function storedReceiptSnapshot(state, index) {
  const meta = state.damage.receiptMeta[index];
  const receipt = state.memory.u8(state.binding.virtual.damageReceipts + index);
  if (meta == null || !meta.committed || receipt !== (0x80 | meta.preMask)) {
    throw new Error('private damage receipt byte and metadata disagree');
  }
  return Object.freeze({
    preMask: meta.preMask,
    postMask: meta.postMask,
    privateMask: meta.privateMask,
    privateScoreMask: meta.privateScoreMask,
    rec: meta.rec,
  });
}

function resolveReceiptSnapshots(snapshots, rawMask) {
  let savedNative = 0;
  let introduced = 0;
  let privateMask = 0;
  let privateScoreMask = 0;
  const subrecords = [];
  for (const snapshot of snapshots) {
    savedNative |= snapshot.preMask;
    introduced |= snapshot.postMask & ~snapshot.preMask;
    privateMask |= snapshot.privateMask;
    privateScoreMask |= snapshot.privateScoreMask;
    subrecords.push(snapshot.rec);
  }
  const nativeRemainder = rawMask & ~introduced & 0x5c;
  const companionP1 = rawMask === 0 ? 0 : 0x10 | (privateScoreMask & 0x44);
  const mask = rawMask === 0 ? 0
    : (savedNative | nativeRemainder | companionP1) & 0x5c;
  return Object.freeze({
    receipt: true,
    mask,
    privateOnly: false,
    rawMask,
    privateMask: privateMask & 0x5c,
    privateScoreMask: privateScoreMask & 0x44,
    subrecord: subrecords[0],
    subrecords: Object.freeze(subrecords),
  });
}

function resolveReceiptSet(state, indices, rawMask) {
  return resolveReceiptSnapshots(indices.map((index) => storedReceiptSnapshot(state, index)),
    rawMask);
}

function resolvePairedReceipts(state, paired, rawMask) {
  if (paired.snapshots) return resolveReceiptSnapshots(paired.snapshots, rawMask);
  return resolveReceiptSet(state, paired.indices, rawMask);
}

function receiptResolution(state, event) {
  const current = state.damage.enemyContext;
  if (current == null) return null;
  const rawMask = event.d1 & 0x5c;

  if (event.phase === 'score-kill' && current.last != null) {
    return resolvePairedReceipts(state, current.last, rawMask);
  }
  if (event.phase === 'score-hit') {
    current.last = null;
    if (current.deferredEvent != null) {
      const deferred = current.deferredEvent;
      current.deferredEvent = null;
      if (!deferred.receipt) return null;
      current.last = { snapshots: deferred.snapshots };
      return resolveReceiptSnapshots(deferred.snapshots, rawMask);
    }
  }

  const indices = selectReceiptIndices(state, current, event, rawMask);
  if (indices.length === 0) return null;
  for (const index of indices) current.used.add(index);
  if (event.phase === 'score-hit') {
    current.last = { indices: Object.freeze(indices.slice()) };
  }
  return resolveReceiptSet(state, indices, rawMask);
}

function privateDamageReceiptEvent(state, game, event) {
  if (game !== state.game || !managerOwnsState(state)
      || event?.ram !== game.ram) {
    throw new Error('private companion damage receipt hook invoked for a different Game');
  }
  if (event.phase === 'allocator-reset') {
    clearAllDamageReceipts(state);
    clearP3ScoreState(state);
    return null;
  }
  if (event.phase === 'enter-enemy') {
    if (!Number.isSafeInteger(event.main) || !Number.isSafeInteger(event.sub)
        || !Number.isSafeInteger(event.span) || event.span <= 0) {
      throw new TypeError('private damage enemy context is malformed');
    }
    const owners = reconcileDamageReceipts(state);
    const indices = [];
    for (let index = 0; index < owners.length; index++) {
      const owner = owners[index];
      if (owner?.main === event.main && owner.subBase === event.sub
          && owner.span === event.span) indices.push(index);
    }
    state.damage.enemyContext = {
      main: event.main,
      sub: event.sub,
      span: event.span,
      indices,
      used: new Set(),
      last: null,
      deferredEvent: null,
    };
    return null;
  }
  if (event.phase === 'clear-deferred-score') {
    if (state.damage.enemyContext == null || !Number.isSafeInteger(event.key)) {
      throw new Error('private damage deferred clear has no enemy context');
    }
    state.damage.deferredEvents.delete(event.key);
    return null;
  }
  if (event.phase === 'replace-deferred-score') {
    const current = state.damage.enemyContext;
    const index = enemyIndexForAddress(event.a6);
    if (current == null || index < 0 || !current.indices.includes(index)
        || !Number.isSafeInteger(event.key)
        || !Number.isSafeInteger(event.damage) || event.damage < 0 || event.damage > 0xffff
        || !Number.isSafeInteger(event.d1) || event.d1 < 0 || event.d1 > 0xffff) {
      throw new Error('private damage deferred replacement is outside its enemy context');
    }
    const owner = Object.freeze(mainIdentity(game.ram, current.main, current.sub, current.span));
    const meta = state.damage.receiptMeta[index];
    let snapshots = Object.freeze([]);
    if (meta != null) {
      if (meta.rec !== event.a6 || !sameMainIdentity(meta.owner, owner)) {
        throw new Error('private damage deferred receipt is malformed');
      }
      snapshots = Object.freeze([storedReceiptSnapshot(state, index)]);
      clearDamageReceipt(state, index);
    }
    state.damage.deferredEvents.set(event.key, Object.freeze({
      receipt: snapshots.length !== 0,
      snapshots,
      damage: event.damage,
      d1: event.d1,
      owner,
      main: current.main,
      sub: current.sub,
      span: current.span,
    }));
    return null;
  }
  if (event.phase === 'consume-deferred-score') {
    const current = state.damage.enemyContext;
    if (current == null || !Number.isSafeInteger(event.key)) {
      throw new Error('private damage deferred event has no enemy context');
    }
    const deferred = state.damage.deferredEvents.get(event.key) ?? null;
    state.damage.deferredEvents.delete(event.key);
    const matches = deferred != null
      && deferred.damage === game.ram.u16(event.key)
      && deferred.d1 === game.ram.u16(event.key + 2);
    current.deferredEvent = matches ? deferred : Object.freeze({
      receipt: false,
      snapshots: Object.freeze([]),
    });
    return null;
  }
  if (event.phase === 'score-hit' || event.phase === 'score-kill') {
    return receiptResolution(state, event);
  }
  if (event.phase === 'exit-enemy') {
    const current = state.damage.enemyContext;
    if (current == null || current.main !== event.main || current.sub !== event.sub
        || current.span !== event.span) {
      throw new Error('private damage enemy context exit does not match its entry');
    }
    const mainLive = game.ram.u16(event.main) !== 0;
    for (const index of current.indices) {
      const meta = state.damage.receiptMeta[index];
      if (meta == null) continue;
      const mask = game.ram.u8(meta.rec) & 0x5c;
      if (!mainLive || current.used.has(index) || mask !== meta.postMask) {
        clearDamageReceipt(state, index);
      }
    }
    state.damage.enemyContext = null;
    return null;
  }
  throw new RangeError(`unknown private damage receipt phase ${event.phase}`);
}

function activeLifecycle(lifecycle) {
  return lifecycle === 'staged' || lifecycle === 'alive';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function liveNonDeath(memory, binding) {
  const value = memory.u16(binding.player + P.state);
  return (value & 0x8000) !== 0 && (value & 0x0100) === 0;
}

function targetFor(state) {
  return state.runtime.targets[state.binding.targetIndex];
}

function cacheTargets(manager) {
  const { runtime } = manager;
  runtime.targets[0] = {
    y: runtime.anchorY,
    x: runtime.anchorX + manager.p1OffsetX,
  };
  for (const state of manager.companions) {
    runtime.targets[state.binding.targetIndex] = {
      y: runtime.anchorY,
      x: runtime.anchorX + state.binding.offsetX,
    };
  }
}

function rebaseFromP1(manager) {
  const { runtime, anchor } = manager;
  runtime.anchorX = clamp(manager.game.ram.u16(RAM.player1 + P.posX)
    - manager.p1OffsetX, anchor.xMin, anchor.xMax);
  runtime.anchorY = clamp(manager.game.ram.u16(RAM.player1 + P.posY),
    anchor.yMin, anchor.yMax);
  cacheTargets(manager);
}

function cachedPositionTransform(manager, ram, playerIdx) {
  if (ram !== manager.game.ram || playerIdx !== 0 || manager.runtime.rebasePending
      || ram.u16(STAGE_CLEAR) !== 0 || !liveNonDeath(ram, P1_BINDING)) return null;
  const target = manager.runtime.targets[0];
  return { y: target.y, x: target.x };
}

function seedP3Input(state, p1Mirror) {
  const raw = p1Mirror & COMPANION_INPUT_MASK;
  const input = state.binding.input;
  state.memory.setU16(input.raw, raw);
  state.memory.setU16(input.previous, raw);
  state.memory.setU16(input.edge, 0);
  state.inputSeeded = true;
}

function updateP3Input(state, p1Mirror) {
  if (!state.inputSeeded) {
    seedP3Input(state, p1Mirror);
    return;
  }
  const input = state.binding.input;
  const raw = p1Mirror & COMPANION_INPUT_MASK;
  const previous = state.memory.u16(input.previous);
  state.memory.setU16(input.raw, raw);
  state.memory.setU16(input.previous, raw);
  state.memory.setU16(input.edge, raw & ~previous);
}

function romByte(rom, address) {
  if (typeof rom.u8 === 'function') return rom.u8(address);
  const word = rom.u16(address & ~1);
  return (address & 1) === 0 ? word >>> 8 : word & 0xff;
}

function romLong(rom, address) {
  if (typeof rom.u32 === 'function') return rom.u32(address);
  return ((rom.u16(address) << 16) | rom.u16(address + 2)) >>> 0;
}

function initializeP3Record(state, alive) {
  const { memory } = state;
  const { rom } = state.game;
  const player = state.binding.player;
  const { ship, style } = state.binding.selection;

  for (let offset = 0; offset < P.stride; offset++) memory.setU8(player + offset, 0);
  for (let word = 0; word < 48; word++) {
    memory.setU16(player + 0x02 + word * 2, rom.u16(0x249160 + word * 2));
  }

  const open = 0x2551da;
  memory.setU32(player + 0x02, romLong(rom, open));
  memory.setU16(player + 0x1c, rom.u16(open + 4));
  memory.setU8(player + 0x54, romByte(rom, open + 6));
  memory.setU8(player + 0x55, romByte(rom, open + 7));
  memory.setU8(player + 0x56, memory.u8(player + 0x54));

  memory.setU16(player + P.shipSel, ship);
  memory.setU16(player + P.optFormation, style);
  const styleValue = romByte(rom, 0x2551fa + (style - 2));
  memory.setU8(player + 0x24, styleValue);
  memory.setU8(player + 0x25, styleValue);

  const initial = 0x2551ea + ship * 4;
  memory.setU32(player + P.animA, romLong(rom, initial));
  memory.setU32(player + P.hitYPlus, romLong(rom, initial + 4));
  const speedIndex = (style - 2) * 2 + ship;
  const speed = romByte(rom, 0x255200 + speedIndex);
  memory.setU8(player + P.speedIdx, speed);
  memory.setU8(player + P.baseSpeed, speed);
  memory.setU8(player + P.laserFloor, romByte(rom, 0x255201 + speedIndex));
  const rampIndex = (style - 2) * 4 + ship * 2;
  memory.setU16(player + 0x2c, rom.u16(0x2552c4 + rampIndex));
  memory.setU16(player + 0x36, rom.u16(0x2552c6 + rampIndex));

  memory.setU8(player + P.playerIdx, state.binding.logicalIndex);
  memory.setU8(player + P.invuln, 0xd0);
  const target = targetFor(state);
  memory.setU16(player + P.posY, target.y);
  memory.setU16(player + P.posX, target.x);
  memory.setU16(player + P.state, alive ? 0x8000 : 0);
  memory.setU8(player + P.dirByte, memory.u16(state.binding.input.raw) & 0xff);
  memory.setU8(player + P.btnByte, memory.u16(state.binding.input.edge) & 0xff);
}

function stageP3Actor(state) {
  const { game } = state;
  if (game.ram.u32(ALLOC.idCounter) === 0xffffffff) return false;
  const made = stageCreate(game.ram, state.binding.objectType,
    (type) => game.rom.u16(ALLOC.dispatch + type * 8 + 4));
  if (!made.ok) return false;

  state.actorId = game.ram.u32(made.addr + ALLOC.idOff);
  clearP3WeaponState(state);
  state.lifecycle = 'staged';
  state.restagePending = false;
  initializeP3Record(state, false);
  game.ram.setU8(made.addr + 0x06, state.binding.renderVariant);
  game.ram.setU8(made.addr + 0x07, state.binding.marker);
  const target = targetFor(state);
  game.ram.setU16(made.addr + 0x08, target.y);
  game.ram.setU16(made.addr + 0x0a, target.x);
  return true;
}

function detachP3(state) {
  clearP3WeaponState(state);
  clearAllDamageReceipts(state);
  clearP3ScoreState(state);
  state.actorId = 0;
  state.lifecycle = 'detached';
  state.restagePending = true;
  state.memory.setU16(state.binding.player + P.state, 0);
}

function refreshLifecycle(state, committed) {
  if (state.lifecycle === 'detached' || state.actorId === 0) return null;
  const resolved = resolveHandle241298(state.game.ram, state.actorId);
  if (!resolved.found) {
    if (committed) detachP3(state);
    return null;
  }
  const { rec } = resolved;
  const type = state.game.ram.u16(rec) & 0xff;
  const marker = state.game.ram.u8(rec + 0x07);
  if (type !== state.binding.objectType || marker !== state.binding.marker) {
    throw new Error(`companion allocator id ${state.actorId} resolved to type ${type} marker ${marker}`);
  }
  if (state.lifecycle === 'staged') {
    initializeP3Record(state, liveNonDeath(state.game.ram, P1_BINDING));
  }
  state.lifecycle = 'alive';
  return rec;
}

function suspendCompanion(state) {
  clearP3WeaponState(state);
  clearAllDamageReceipts(state);
  clearP3ScoreState(state);
  state.memory.setU16(state.binding.player + P.state, 0);
}

function syncCompanionAvailability(state, p1Live) {
  if ((state.lifecycle === 'detached' || state.actorId === 0)
      && state.restagePending && !stageP3Actor(state)) return;
  refreshLifecycle(state, false);
  if (!p1Live || state.lifecycle !== 'alive') {
    suspendCompanion(state);
    return;
  }
  if (!liveNonDeath(state.memory, state.binding)) initializeP3Record(state, true);
}

function controllerHook(manager, event) {
  if (event.phase === 'after-commit' || event.phase === 'after-driver') {
    for (const state of manager.companions) refreshLifecycle(state, true);
    return false;
  }
  if (event.phase !== 'before-dispatch' || event.type !== 3) return false;
  const state = manager.companions.find((candidate) =>
    candidate.binding.marker === event.marker);
  if (!state) return false;
  const id = event.ram.u32(event.slot + ALLOC.idOff);
  if (state.lifecycle !== 'alive' || id !== state.actorId) {
    throw new Error(`unknown marker-${event.marker} type-3 object with allocator id ${id}`);
  }
  return true;
}

function validateCompanions(companions) {
  if (!Array.isArray(companions) || companions.length < 1 || companions.length > 2) {
    throw new RangeError('formation requires one or two private companions');
  }
  return companions.map((selection, index) => {
    if (!selection || ![0, 2].includes(selection.ship)
        || ![2, 4, 6].includes(selection.style)) {
      throw new RangeError(`formation companion ${index + 1} has an invalid selection`);
    }
    const marker = index + 2;
    if (selection.marker != null && selection.marker !== marker) {
      throw new RangeError(`formation companion ${index + 1} must use marker ${marker}`);
    }
    return Object.freeze({ ship: selection.ship, style: selection.style, marker });
  });
}

function companionBindings(companions) {
  const three = companions.length === 2;
  return companions.map((selection, index) => companionBinding({
    marker: selection.marker,
    base: P3_VIRTUAL_BASE + index * VIRTUAL_STRIDE,
    offsetX: three ? (index === 0 ? 0 : THREE_OFFSET_X) : TWO_OFFSET_X,
    targetIndex: three ? (index === 0 ? 2 : 1) : 1,
    selection,
  }));
}

function createCompanionState(manager, binding) {
  const memory = new StrictSidecarMemory(manager.game.ram, {
    virtualRanges: virtualRangesFor(binding.virtual, `companion-${binding.marker}`),
    sharedRanges: THREE_PILOT_SHARED_RANGES,
  });
  const state = {
    mode: manager.mode,
    manager,
    game: manager.game,
    memory,
    binding,
    scoreLedger: scoreLedgerFor(binding.virtual),
    actorId: 0,
    lifecycle: 'detached',
    restagePending: true,
    inputSeeded: false,
    runtime: manager.runtime,
    render: createThreePilotRenderState(memory, {
      position: binding.beam.positionHistory,
      image: binding.beam.imageHistory,
    }),
    weapons: { requests: [], actorId: 0, calls: 0 },
    shots: { requests: [], actorId: 0, calls: 0, resources: null },
    beam: {
      requests: [], actorId: 0, segmentCalls: 0, drawCalls: 0, resources: null,
    },
    damage: {
      resources: damageResourcesFor(binding),
      realRam: manager.game.ram,
      memory: null,
      actorId: 0,
      epoch: 0,
      calls: 0,
      last: null,
      source: null,
      ownerMap: null,
      enemyContext: null,
      receiptMeta: new Array(PRIVATE_DAMAGE_GEOMETRY.receiptCount).fill(null),
      deferredEvents: new Map(),
    },
  };
  state.damage.memory = new PrivateDamageMemory(state);
  return state;
}

function assertHookAvailable(game, name) {
  if (game[name] != null) throw new Error(`Game already has a ${name}`);
}

function mergeReceiptResolutions(resolutions, event) {
  if (resolutions.length === 0) return null;
  let mask = 0;
  let privateMask = 0;
  let privateScoreMask = 0;
  const subrecords = [];
  for (const resolved of resolutions) {
    mask |= resolved.mask;
    privateMask |= resolved.privateMask;
    privateScoreMask |= resolved.privateScoreMask;
    subrecords.push(...resolved.subrecords);
  }
  const rawMask = event.d1 & 0x5c;
  if (rawMask === 0) mask = 0;
  return Object.freeze({
    receipt: true,
    mask: mask & 0x5c,
    privateOnly: false,
    rawMask,
    privateMask: privateMask & 0x5c,
    privateScoreMask: privateScoreMask & 0x44,
    subrecord: subrecords[0],
    subrecords: Object.freeze([...new Set(subrecords)]),
  });
}

function managerReceiptEvent(manager, game, event) {
  if (game !== manager.game || ATTACHED.get(game) !== manager
      || event?.ram !== game.ram) {
    throw new Error('private companion receipt hook invoked for a different Game');
  }
  if (event.phase === 'replace-deferred-score') {
    const index = enemyIndexForAddress(event.a6);
    for (const state of manager.companions) {
      if (state.damage.enemyContext?.indices.includes(index)) {
        privateDamageReceiptEvent(state, game, event);
      }
    }
    return null;
  }
  if (event.phase === 'score-hit' || event.phase === 'score-kill') {
    const resolutions = manager.companions
      .map((state) => privateDamageReceiptEvent(state, game, event))
      .filter((value) => value != null);
    return mergeReceiptResolutions(resolutions, event);
  }
  for (const state of manager.companions) privateDamageReceiptEvent(state, game, event);
  return null;
}

function collectManagerSpriteRequests(manager, game) {
  if (game !== manager.game || ATTACHED.get(game) !== manager) {
    throw new Error('private companion sprite hook invoked for a different Game');
  }
  return manager.companions.flatMap((state) =>
    collectThreePilotSpriteRequests(state, game));
}

/** Attach one or two outgoing-only P1 companions to a Game. */
export function attachFormationCompanions(game, options = {}) {
  if (!game?.ram || !game?.rom || !game?.tables) {
    throw new TypeError('formation companions require a Game');
  }
  const existing = ATTACHED.get(game);
  if (existing) return existing;
  for (const name of [
    'objectDriverHook', 'playerPositionTransform', 'virtualSpriteRequestHook',
    'privateOptionObjectHook', 'privateShotObjectHook', 'privateSegmentDriverHook',
    'privateBeamDrawHook', 'privateDamageTailHook', 'privateDamageReceiptHook',
    'privateScoreEventHook', 'privateScoreFrameHook',
  ]) assertHookAvailable(game, name);
  if (game.ram.u32(ALLOC.idCounter) === 0xffffffff) {
    throw new RangeError('formation companion allocator ID would wrap to zero');
  }

  const selections = validateCompanions(options.companions);
  const bindings = companionBindings(selections);
  const anchor = selections.length === 2 ? ANCHOR_THREE : ANCHOR_TWO;
  const p1OffsetX = selections.length === 2 ? -THREE_OFFSET_X : -TWO_OFFSET_X;
  const runtime = {
    anchorX: clamp(game.ram.u16(RAM.player1 + P.posX) - p1OffsetX,
      anchor.xMin, anchor.xMax),
    anchorY: clamp(game.ram.u16(RAM.player1 + P.posY), anchor.yMin, anchor.yMax),
    lastP1Speed: null,
    rebasePending: game.ram.u16(STAGE_CLEAR) !== 0,
    targets: new Array(selections.length + 1).fill(null),
  };
  const manager = {
    mode: options.mode ?? null,
    game,
    anchor,
    p1OffsetX,
    runtime,
    companions: [],
  };
  manager.companions = bindings.map((binding) => createCompanionState(manager, binding));
  ATTACHED.set(game, manager);
  try {
    cacheTargets(manager);
    if (liveNonDeath(game.ram, P1_BINDING)) {
      runtime.lastP1Speed = game.ram.u8(RAM.player1 + P.speedIdx);
    }
    const p1Mirror = Object.hasOwn(options, 'inputWord')
      ? mirrorsFromPort(options.inputWord).p1 : 0;
    for (const state of manager.companions) {
      clearP3ScoreState(state);
      bindP3ShotResources(state);
      bindP3BeamResources(state);
      seedP3Input(state, p1Mirror);
      stageP3Actor(state);
    }
  } catch (error) {
    ATTACHED.delete(game);
    throw error;
  }

  const assertManagerGame = (hookGame, label) => {
    if (hookGame !== manager.game || ATTACHED.get(hookGame) !== manager) {
      throw new Error(`private companion ${label} hook invoked for a different Game`);
    }
  };
  manager.objectDriverHook = (event) => controllerHook(manager, event);
  manager.playerPositionTransform = (ram, playerIdx) =>
    cachedPositionTransform(manager, ram, playerIdx);
  manager.virtualSpriteRequestHook = (hookGame) =>
    collectManagerSpriteRequests(manager, hookGame);
  manager.privateShotObjectHook = (hookGame, invokingCtx = null) => {
    assertManagerGame(hookGame, 'shot');
    return runThreePilotShotObject(hookGame, invokingCtx);
  };
  manager.privateOptionObjectHook = (hookGame) => {
    assertManagerGame(hookGame, 'option');
    return runThreePilotOptionObject(hookGame);
  };
  manager.privateSegmentDriverHook = (hookGame) => {
    assertManagerGame(hookGame, 'segment');
    return runThreePilotSegmentObject(hookGame);
  };
  manager.privateBeamDrawHook = (hookGame) => {
    assertManagerGame(hookGame, 'beam-draw');
    return runThreePilotBeamDrawObject(hookGame);
  };
  manager.privateDamageTailHook = (hookGame, invokingCtx = null) => {
    assertManagerGame(hookGame, 'damage');
    return runThreePilotDamageObject(hookGame, invokingCtx);
  };
  manager.privateDamageReceiptHook = (hookGame, event) =>
    managerReceiptEvent(manager, hookGame, event);
  for (const state of manager.companions) {
    state.objectDriverHook = manager.objectDriverHook;
    state.playerPositionTransform = manager.playerPositionTransform;
    state.virtualSpriteRequestHook = manager.virtualSpriteRequestHook;
    state.privateShotObjectHook = manager.privateShotObjectHook;
    state.privateOptionObjectHook = manager.privateOptionObjectHook;
    state.privateSegmentDriverHook = manager.privateSegmentDriverHook;
    state.privateBeamDrawHook = manager.privateBeamDrawHook;
    state.privateDamageTailHook = manager.privateDamageTailHook;
    state.privateDamageReceiptHook = manager.privateDamageReceiptHook;
  }

  game.objectDriverHook = manager.objectDriverHook;
  game.playerPositionTransform = manager.playerPositionTransform;
  game.virtualSpriteRequestHook = manager.virtualSpriteRequestHook;
  game.privateShotObjectHook = manager.privateShotObjectHook;
  game.privateOptionObjectHook = manager.privateOptionObjectHook;
  game.privateSegmentDriverHook = manager.privateSegmentDriverHook;
  game.privateBeamDrawHook = manager.privateBeamDrawHook;
  game.privateDamageTailHook = manager.privateDamageTailHook;
  game.privateDamageReceiptHook = manager.privateDamageReceiptHook;
  return manager;
}

/** Compatibility entry for the private three-ship mode. */
export function attachThreePilotFoundation(game, options = {}) {
  const manager = attachFormationCompanions(game, {
    ...options,
    mode: THREE_PILOT_FORMATION_MODE,
    companions: THREE_PILOT_FORMATION_MODE.companions,
    layout: 'three',
  });
  return manager.companions[0];
}

export function threePilotFoundationForGame(game) {
  return ATTACHED.get(game)?.companions[0] ?? null;
}

/** Resolve one companion by its complete 32-bit allocator ID. */
export function resolveThreePilotActor(state) {
  if (state?.companions) return state.companions.map((child) => refreshLifecycle(child, false));
  return state?.manager ? refreshLifecycle(state, false) : null;
}

/** Formation never writes native P2 input bits. */
export function transformThreePilotInput(state, word) {
  const input = word & 0xffff;
  const manager = state?.companions ? state : state?.manager;
  return manager && ATTACHED.get(manager.game) === manager ? input : input;
}

/** Update all companion inputs and positions from P1 alone. */
export function prepareFormationCompanionFrame(managerValue, game, word) {
  const input = word & 0xffff;
  const manager = managerValue?.companions ? managerValue : managerValue?.manager;
  if (!manager || manager.game !== game || ATTACHED.get(game) !== manager) return input;

  const p1Mirror = mirrorsFromPort(input).p1;
  for (const state of manager.companions) {
    updateP3Input(state, p1Mirror);
    state.memory.setU8(state.binding.player + P.dirByte,
      state.memory.u16(state.binding.input.raw) & 0xff);
    state.memory.setU8(state.binding.player + P.btnByte,
      state.memory.u16(state.binding.input.edge) & 0xff);
  }

  if (game.ram.u16(STAGE_CLEAR) !== 0) {
    for (const state of manager.companions) suspendCompanion(state);
    manager.runtime.rebasePending = true;
    return input;
  }

  const p1Live = liveNonDeath(game.ram, P1_BINDING);
  for (const state of manager.companions) syncCompanionAvailability(state, p1Live);
  if (!p1Live) {
    manager.runtime.rebasePending = true;
    return input;
  }

  const { runtime, anchor } = manager;
  if (runtime.rebasePending) {
    rebaseFromP1(manager);
    runtime.rebasePending = false;
  }
  runtime.lastP1Speed = game.ram.u8(RAM.player1 + P.speedIdx);

  let dy = 0;
  let dx = 0;
  if (game.ram.u16(MOVEMENT_DISABLE) === 0 && runtime.lastP1Speed != null) {
    const angle = game.tables.angleFor(p1Mirror & 0x0f);
    if ((angle & 0x80) === 0) {
      const vector = game.tables.vector(runtime.lastP1Speed, angle);
      dy = vector.dy;
      dx = vector.dx;
    }
  }
  runtime.anchorX = clamp(runtime.anchorX + dx, anchor.xMin, anchor.xMax);
  runtime.anchorY = clamp(runtime.anchorY + dy, anchor.yMin, anchor.yMax);
  cacheTargets(manager);

  const p1Target = runtime.targets[0];
  game.ram.setU16(RAM.player1 + P.posY, p1Target.y);
  game.ram.setU16(RAM.player1 + P.posX, p1Target.x);
  for (const state of manager.companions) {
    if (!liveNonDeath(state.memory, state.binding)) continue;
    const target = targetFor(state);
    state.memory.setU16(state.binding.player + P.posY, target.y);
    state.memory.setU16(state.binding.player + P.posX, target.x);
  }
  return input;
}

export function prepareThreePilotFrame(state, game, word) {
  return prepareFormationCompanionFrame(state, game, word);
}
