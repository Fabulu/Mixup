// Private three-pilot formation actors.
//
// This remains a private foundation. P3 has an allocator identity, independent
// host memory, ordinary shots, option pods, an independently owned laser, and
// outgoing enemy collision and damage. Incoming collision, P3 rewards, death,
// lives, HUD, and public activation remain excluded.

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
import { encodeRecordRequest } from './spritequeue.js';

const THREE_PILOT_ID = 'all-three-pilots-each-piloting-a-ship';
const THREE_PILOT_NAME = 'All Three Pilots, Each Piloting a Ship';
const P3_INPUT_MASK = 0x005f; // directions, B1, and B3; never B2 or Start
const OFFSET_X = 0x0800;
const STAGE_CLEAR = 0x812972;
const MOVEMENT_DISABLE = 0x8130d2;
const ANCHOR = Object.freeze({
  xMin: 0x0b00,
  xMax: 0x2d00,
  yMin: 0x0800,
  yMax: 0x6500,
});

const THREE_PILOT_SELECTION = Object.freeze({
  ship: 0,
  style: 2,
  p2: Object.freeze({ ship: 2, style: 4 }),
  p3: Object.freeze({ ship: 0, style: 6 }),
});

export const THREE_PILOT_FORMATION_MODE = Object.freeze({
  id: THREE_PILOT_ID,
  name: THREE_PILOT_NAME,
  authenticSelection: THREE_PILOT_SELECTION,
});

// Host addresses deliberately sit beyond the 24-bit cartridge address space.
// Gaps are intentional. StrictSidecarMemory refuses to treat them as storage.
export const P3_VIRTUAL_BASE = 0x10000000;
export const P3_VIRTUAL = Object.freeze({
  input: Object.freeze({
    raw: P3_VIRTUAL_BASE,
    edge: P3_VIRTUAL_BASE + 0x02,
    previous: P3_VIRTUAL_BASE + 0x04,
  }),
  player: P3_VIRTUAL_BASE + 0x0100,
  options: P3_VIRTUAL_BASE + 0x0200,
  shots: P3_VIRTUAL_BASE + 0x0400,
  beamRecord: P3_VIRTUAL_BASE + 0x0b00,
  beamControl: P3_VIRTUAL_BASE + 0x0b00,
  beamDraw: P3_VIRTUAL_BASE + 0x0b20,
  beamWord: P3_VIRTUAL_BASE + 0x0b40,
  beamPool: P3_VIRTUAL_BASE + 0x0c00,
  positionHistory: P3_VIRTUAL_BASE + 0x1200,
  imageHistory: P3_VIRTUAL_BASE + 0x1240,
  hyper: P3_VIRTUAL_BASE + 0x1300,
  damageScratch: P3_VIRTUAL_BASE + 0x1400,
  damageHyperShadows: P3_VIRTUAL_BASE + 0x140e,
  damageReceipts: P3_VIRTUAL_BASE + 0x1420,
  score: P3_VIRTUAL_BASE + 0x1500,
  bomb: P3_VIRTUAL_BASE + 0x1600,
  lives: P3_VIRTUAL_BASE + 0x1700,
  tally: P3_VIRTUAL_BASE + 0x1800,
});

export const P3_VIRTUAL_RANGES = Object.freeze([
  Object.freeze({ name: 'p3-input', start: P3_VIRTUAL.input.raw, length: 0x06 }),
  Object.freeze({ name: 'p3-player', start: P3_VIRTUAL.player, length: P.stride }),
  Object.freeze({ name: 'p3-options', start: P3_VIRTUAL.options, length: OPT.stride }),
  Object.freeze({ name: 'p3-shots-reserved', start: P3_VIRTUAL.shots, length: 36 * 0x30 }),
  Object.freeze({ name: 'p3-beam-controls', start: P3_VIRTUAL.beamControl, length: 0x42 }),
  Object.freeze({ name: 'p3-beam-pool', start: P3_VIRTUAL.beamPool, length: 32 * 0x30 }),
  Object.freeze({ name: 'p3-position-history', start: P3_VIRTUAL.positionHistory, length: 0x40 }),
  Object.freeze({ name: 'p3-image-history', start: P3_VIRTUAL.imageHistory, length: 0x40 }),
  Object.freeze({ name: 'p3-hyper-reserved', start: P3_VIRTUAL.hyper, length: 0x0100 }),
  Object.freeze({ name: 'p3-damage-scratch', start: P3_VIRTUAL.damageScratch, length: 0x0e }),
  Object.freeze({ name: 'p3-damage-hyper-shadows', start: P3_VIRTUAL.damageHyperShadows,
    length: 0x04 }),
  Object.freeze({ name: 'p3-damage-receipts', start: P3_VIRTUAL.damageReceipts, length: 150 }),
  Object.freeze({ name: 'p3-score-reserved', start: P3_VIRTUAL.score, length: 0x20 }),
  Object.freeze({ name: 'p3-bomb-reserved', start: P3_VIRTUAL.bomb, length: 0x20 }),
  Object.freeze({ name: 'p3-lives-reserved', start: P3_VIRTUAL.lives, length: 0x02 }),
  Object.freeze({ name: 'p3-tally-reserved', start: P3_VIRTUAL.tally, length: 0x24 }),
]);

export const THREE_PILOT_SHARED_RANGES = Object.freeze([
  Object.freeze({ name: 'auto-shot-setting', start: 0x80380f, length: 0x01,
    writable: false }),
  Object.freeze({ name: 'presentation-phase', start: 0x80390c, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'impact-rng', start: 0x803916, length: 0x02, writable: true }),
  Object.freeze({ name: 'p1-motion', start: RAM.player1, length: 0x06, writable: true }),
  Object.freeze({ name: 'p1-speed', start: RAM.player1 + P.speedIdx, length: 0x01,
    writable: false }),
  Object.freeze({ name: 'p2-motion', start: RAM.player2, length: 0x06, writable: true }),
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
  name: 'P1', logicalIndex: 0, marker: 0, objectType: 2, renderVariant: 0,
  offsetX: -OFFSET_X,
  player: RAM.player1,
  options: RAM.p1Options,
  input: Object.freeze({ raw: RAM.p1raw, edge: RAM.p1edge, previous: RAM.p1prev }),
});
const P2_BINDING = Object.freeze({
  name: 'P2', logicalIndex: 1, marker: 1, objectType: 3, renderVariant: 1,
  offsetX: OFFSET_X,
  player: RAM.player2,
  options: RAM.p2Options,
  input: Object.freeze({ raw: RAM.p2raw, edge: RAM.p2edge, previous: RAM.p2prev }),
});
const P3_BINDING = Object.freeze({
  name: 'P3', logicalIndex: 2, marker: 2, objectType: 3, renderVariant: 0,
  offsetX: 0,
  player: P3_VIRTUAL.player,
  options: P3_VIRTUAL.options,
  shots: P3_VIRTUAL.shots,
  beam: Object.freeze({
    control: P3_VIRTUAL.beamControl,
    record: P3_VIRTUAL.beamControl,
    draw: P3_VIRTUAL.beamDraw,
    word: P3_VIRTUAL.beamWord,
    pool: P3_VIRTUAL.beamPool,
    positionHistory: P3_VIRTUAL.positionHistory,
    imageHistory: P3_VIRTUAL.imageHistory,
  }),
  hyper: P3_VIRTUAL.hyper,
  score: P3_VIRTUAL.score,
  bomb: P3_VIRTUAL.bomb,
  lives: P3_VIRTUAL.lives,
  tally: P3_VIRTUAL.tally,
  input: P3_VIRTUAL.input,
});

export const FORMATION_ACTOR_BINDINGS = Object.freeze([
  P1_BINDING, P2_BINDING, P3_BINDING,
]);
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

export const P3_PRIVATE_DAMAGE_RESOURCES = Object.freeze({
  ...PRIVATE_DAMAGE_GEOMETRY,
  incomingPolicy: 'none',
  bombPolicy: 'none',
  bulletErasePolicy: 'none',
  itemPolicy: 'none',
  hyperPolicy: 'zero-shadow',
});

const DAMAGE_NATIVE_READS = Object.freeze([
  Object.freeze({ start: DMG.mirror2, length: 0x02 }),
  Object.freeze({ start: 0x8130f8, length: 0x02 }),
  Object.freeze({ start: DMG.gate308c, length: 0x02 }),
  Object.freeze({ start: DMG.g309c, length: 0x02 }),
  Object.freeze({ start: DMG.poolACount, length: 0x04 }),
  Object.freeze({ start: DMG.b410, length: 0x02 }),
]);

const DAMAGE_SIDECAR_RANGES = Object.freeze([
  Object.freeze({ start: P3_VIRTUAL.player, length: P.stride, writable: false }),
  Object.freeze({ start: P3_VIRTUAL.shots, length: 36 * 0x30, writable: true }),
  Object.freeze({ start: P3_VIRTUAL.beamControl, length: 0x20, writable: true }),
  Object.freeze({ start: PRIVATE_DAMAGE_GEOMETRY.slot27, length: 0x30, writable: true }),
  Object.freeze({ start: PRIVATE_DAMAGE_GEOMETRY.slot30, length: 0x30, writable: true }),
]);

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
  state.memory.setU8(P3_VIRTUAL.damageReceipts + index, 0);
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
    const receipt = state.memory.u8(P3_VIRTUAL.damageReceipts + index);
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
    state.memory.setU8(P3_VIRTUAL.damageScratch + offset, 0);
  }
  for (let offset = 0; offset < PRIVATE_DAMAGE_GEOMETRY.hyperShadowLength; offset++) {
    state.memory.setU8(P3_VIRTUAL.damageHyperShadows + offset, 0);
  }
  state.damage.last = null;
  state.damage.source = null;
  state.damage.ownerMap = null;
  state.damage.actorId = 0;
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
      return P3_VIRTUAL.damageScratch + address - scratchStart;
    }
    const hyperStart = DMG.b6e6;
    const hyperEnd = hyperStart + PRIVATE_DAMAGE_GEOMETRY.hyperShadowLength;
    if (address >= hyperStart && address + width <= hyperEnd) {
      return P3_VIRTUAL.damageHyperShadows + address - hyperStart;
    }
    const range = DAMAGE_SIDECAR_RANGES.find((candidate) =>
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
          sources: new Set(),
          committed: false,
        };
        this.#state.memory.setU8(P3_VIRTUAL.damageReceipts + index, 0x80 | preMask);
        this.#state.damage.receiptMeta[index] = meta;
      }
      meta.postMask = newMask;
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
        || ATTACHED.get(state.game) !== state
        || state.lifecycle !== 'alive' || state.actorId === 0
        || state.damage.actorId !== state.actorId) {
      throw new Error('private damage adapter identity or lifecycle mismatch');
    }
    const resolved = resolveHandle241298(state.game.ram, state.actorId);
    if (!resolved.found
        || (state.game.ram.u16(resolved.rec) & 0xff) !== P3_BINDING.objectType
        || state.game.ram.u8(resolved.rec + 0x07) !== P3_BINDING.marker) {
      throw new Error('private damage allocator identity mismatch');
    }
    for (let offset = 0; offset < PRIVATE_DAMAGE_GEOMETRY.hyperShadowLength; offset++) {
      if (state.memory.u8(P3_VIRTUAL.damageHyperShadows + offset) !== 0) {
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
    this.#state.damage.source = { name, rawMask };
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
  const player = P3_BINDING.player;
  state.memory.bclr8(player + P.flags1, 3);
  state.memory.bclr8(player + P.flags1, 4);
  state.memory.bclr8(player + P.state, 3);
  state.memory.setU8(player + 0x2a, 0);
  state.memory.setU8(player + 0x2b, 0);
  state.memory.setU8(player + 0x3c, 0);
  for (let offset = 0; offset < 36 * 0x30; offset++) {
    state.memory.setU8(P3_BINDING.shots + offset, 0);
  }
}

function clearP3OptionState(state) {
  if (!state?.weapons) return;
  state.weapons.requests.length = 0;
  state.weapons.actorId = 0;
  state.weapons.calls = 0;
  for (let offset = 0; offset < OPT.stride; offset++) {
    state.memory.setU8(P3_BINDING.options + offset, 0);
  }
}

function clearP3BeamState(state) {
  if (!state?.beam) return;
  state.beam.requests.length = 0;
  state.beam.actorId = 0;
  state.beam.segmentCalls = 0;
  state.beam.drawCalls = 0;
  for (let offset = 0; offset < 0x42; offset++) {
    state.memory.setU8(P3_BINDING.beam.control + offset, 0);
  }
  for (let offset = 0; offset < 32 * 0x30; offset++) {
    state.memory.setU8(P3_BINDING.beam.pool + offset, 0);
  }
  for (const history of [P3_BINDING.beam.positionHistory, P3_BINDING.beam.imageHistory]) {
    for (let offset = 0; offset < 0x40; offset++) state.memory.setU8(history + offset, 0);
  }
}

function clearP3WeaponState(state) {
  clearP3ShotState(state);
  clearP3OptionState(state);
  clearP3BeamState(state);
  clearP3DamageScratch(state);
}

function bindP3ShotResources(state) {
  const requestSink = (bucket) => (memory, rec) => {
    state.shots.requests.push({ bucket, bytes: encodeRecordRequest(memory, rec) });
    return state.shots.requests.length - 1;
  };
  const ship = Object.freeze({
    ownerIndex: P3_BINDING.logicalIndex,
    pool: P3_BINDING.shots,
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
    ownerIndex: P3_BINDING.logicalIndex,
    pool: P3_BINDING.shots,
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
    ownerIndex: P3_BINDING.logicalIndex,
    pool: P3_BINDING.shots,
    player: P3_BINDING.player,
    slots: 36,
    stride: 0x30,
    scrollDelta: 0x813176,
    liveCounter: null,
    presentationSink: requestSink(14),
    requestTelemetry: false,
  });
  state.shots.resources = Object.freeze({
    ordinary: Object.freeze({
      ownerIndex: P3_BINDING.logicalIndex,
      options: P3_BINDING.options,
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
    ownerIndex: P3_BINDING.logicalIndex,
    d7: 1,
    segmentOwnerWord: 1,
    slots: 32,
    stride: 0x30,
    player: P3_BINDING.player,
    opt: P3_BINDING.options,
    rec: P3_BINDING.beam.control,
    blk: P3_BINDING.beam.draw,
    word: P3_BINDING.beam.word,
    pool: P3_BINDING.beam.pool,
    head: P3_BINDING.beam.pool + 0x510,
    muzzle: P3_BINDING.beam.pool + 0x540,
    pair: P3_BINDING.beam.pool + 0x5a0,
    posHistory: P3_BINDING.beam.positionHistory,
    imgHistory: P3_BINDING.beam.imageHistory,
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
  state.memory.setU16(P3_BINDING.options + OPT.state, 0x8000);
  state.weapons.actorId = state.actorId;
}

function collectThreePilotSpriteRequests(state, game) {
  if (state.game !== game || ATTACHED.get(game) !== state) {
    throw new Error('private P3 sprite hook is attached to a different Game');
  }
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, P3_BINDING)
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
    ownerIndex: P3_BINDING.logicalIndex,
    opt: P3_BINDING.options,
    player: P3_BINDING.player,
    laser: P3_BINDING.beam.draw,
    beam: state.beam.resources,
    rampGuard: P3_BINDING.bomb,
    allowLaser: true,
    allowShots: true,
    virtualRequests: state.weapons.requests,
    shotResources: state.shots.resources.options,
  };
}

function assertP3ShotInputAllowed(state) {
  const excludedInput = state.memory.u8(P3_BINDING.player + P.dirByte)
    | state.memory.u8(P3_BINDING.player + P.btnByte);
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

/** Run P3 cadence, private spawn, movement, expiry, and virtual shot drawing. */
export function runThreePilotShotObject(game, invokingCtx = null) {
  const state = ATTACHED.get(game);
  if (!state) return 0;
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, P3_BINDING)
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
  runOrdinaryShotPath2497AA(state.memory, P3_BINDING.player, ctx,
    state.shots.resources.ordinary);
  const processed = runShotPool(state.memory, game.rom, shotHandlers(), ctx,
    state.shots.resources.driver);
  state.shots.calls++;
  return processed;
}

/** Run the attached private option owner after the native P1/P2 pass. */
export function runThreePilotOptionObject(game) {
  const state = ATTACHED.get(game);
  if (!state) return 0;
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, P3_BINDING)
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3WeaponState(state);
    return 0;
  }

  const block = p3OptionBlock(state);
  assertOptionOwnerInputAllowed(state.memory, block);
  clearMismatchedWeaponIdentity(state);
  state.weapons.requests.length = 0;
  if (state.weapons.actorId !== state.actorId
      || (state.memory.u16(P3_BINDING.options + OPT.state) & 0x8000) === 0) {
    clearP3BeamState(state);
    initializeP3OptionState(state);
  }

  runOptionBlock(state.memory, game, block);
  state.weapons.calls++;
  return state.weapons.requests.length;
}

/** Run only P3's post-call-10 segment pool. */
export function runThreePilotSegmentObject(game) {
  const state = ATTACHED.get(game);
  if (!state) return 0;
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, P3_BINDING)
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

/** Run only P3's post-call-11 beam draw. */
export function runThreePilotBeamDrawObject(game) {
  const state = ATTACHED.get(game);
  if (!state) return 0;
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, P3_BINDING)
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

/** Run P3's outgoing-only damage after the native type-5 tail. */
export function runThreePilotDamageObject(game, invokingCtx = null) {
  const state = ATTACHED.get(game);
  if (!state) return null;
  reconcileDamageReceipts(state);
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || !liveNonDeath(state.memory, P3_BINDING)
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3WeaponState(state);
    return null;
  }
  clearMismatchedWeaponIdentity(state);

  let liveShots = false;
  for (let slot = 0; slot < PRIVATE_DAMAGE_GEOMETRY.shotSlots; slot++) {
    if ((state.memory.u16(P3_VIRTUAL.shots + slot * PRIVATE_DAMAGE_GEOMETRY.shotStride)
        & 0x8000) !== 0) {
      liveShots = true;
      break;
    }
  }
  const liveBeam = (state.memory.u16(P3_VIRTUAL.beamControl) & 0x8000) !== 0
    || (state.memory.u16(PRIVATE_DAMAGE_GEOMETRY.slot27) & 0x8000) !== 0
    || (state.memory.u16(PRIVATE_DAMAGE_GEOMETRY.slot30) & 0x8000) !== 0;
  if ((liveShots && state.shots.actorId !== state.actorId)
      || (liveBeam && state.beam.actorId !== state.actorId)) {
    clearP3WeaponState(state);
    return null;
  }

  clearP3DamageScratch(state);
  state.damage.actorId = state.actorId;
  state.damage.epoch++;
  const result = privateOutgoingDamagePass(state.damage.memory, invokingCtx,
    state.damage.resources);
  state.damage.last = result;
  state.damage.calls++;
  return result;
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
  const receipt = state.memory.u8(P3_VIRTUAL.damageReceipts + index);
  if (meta == null || !meta.committed || receipt !== (0x80 | meta.preMask)) {
    throw new Error('private damage receipt byte and metadata disagree');
  }
  return Object.freeze({
    preMask: meta.preMask,
    postMask: meta.postMask,
    rec: meta.rec,
  });
}

function resolveReceiptSnapshots(snapshots, rawMask) {
  let savedNative = 0;
  let introduced = 0;
  const subrecords = [];
  for (const snapshot of snapshots) {
    savedNative |= snapshot.preMask;
    introduced |= snapshot.postMask & ~snapshot.preMask;
    subrecords.push(snapshot.rec);
  }
  const nativeRemainder = rawMask & ~introduced & 0x5c;
  const mask = (savedNative | nativeRemainder) & 0x5c;
  return Object.freeze({
    receipt: true,
    mask,
    privateOnly: mask === 0,
    rawMask,
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
  if (game !== state.game || ATTACHED.get(game) !== state
      || event?.ram !== game.ram) {
    throw new Error('private P3 damage receipt hook invoked for a different Game');
  }
  if (event.phase === 'allocator-reset') {
    clearAllDamageReceipts(state);
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

function cacheTargets(state) {
  const { runtime } = state;
  for (const binding of FORMATION_ACTOR_BINDINGS) {
    const target = runtime.targets[binding.logicalIndex];
    target.y = runtime.anchorY;
    target.x = runtime.anchorX + binding.offsetX;
  }
}

function bindingLive(state, binding) {
  if (binding === P3_BINDING && state.lifecycle !== 'alive') return false;
  return liveNonDeath(state.memory, binding);
}

function rebaseFromBinding(state, binding) {
  const { memory, runtime } = state;
  runtime.anchorX = clamp(memory.u16(binding.player + P.posX) - binding.offsetX,
    ANCHOR.xMin, ANCHOR.xMax);
  runtime.anchorY = clamp(memory.u16(binding.player + P.posY), ANCHOR.yMin, ANCHOR.yMax);
  cacheTargets(state);
}

function cachedPositionTransform(state, ram, playerIdx) {
  const { runtime } = state;
  if (ram !== state.game.ram || state.lifecycle === 'dropped'
      || state.lifecycle === 'detached' || runtime.rebasePending) return null;
  if (ram.u16(STAGE_CLEAR) !== 0) {
    runtime.rebasePending = true;
    return null;
  }
  const binding = FORMATION_ACTOR_BINDINGS[playerIdx];
  if (!binding || binding === P3_BINDING || !bindingLive(state, binding)) return null;
  const target = runtime.targets[playerIdx];
  return { y: target.y, x: target.x };
}

function seedP3Input(state, p1Mirror) {
  const raw = p1Mirror & P3_INPUT_MASK;
  const input = P3_BINDING.input;
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
  const input = P3_BINDING.input;
  const raw = p1Mirror & P3_INPUT_MASK;
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
  const player = P3_BINDING.player;
  const { ship, style } = THREE_PILOT_FORMATION_MODE.authenticSelection.p3;

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

  memory.setU8(player + P.playerIdx, P3_BINDING.logicalIndex);
  memory.setU8(player + P.invuln, 0xd0);
  memory.setU16(player + P.posY, state.runtime.targets[2].y);
  memory.setU16(player + P.posX, state.runtime.targets[2].x);
  memory.setU16(player + P.state, alive ? 0x8000 : 0);
  memory.setU8(player + P.dirByte, memory.u16(P3_BINDING.input.raw) & 0xff);
  memory.setU8(player + P.btnByte, memory.u16(P3_BINDING.input.edge) & 0xff);
}

function stageP3Actor(state) {
  const { game } = state;
  if (game.ram.u32(ALLOC.idCounter) === 0xffffffff) return false;
  const made = stageCreate(game.ram, P3_BINDING.objectType,
    (type) => game.rom.u16(ALLOC.dispatch + type * 8 + 4));
  if (!made.ok) return false;

  state.actorId = game.ram.u32(made.addr + ALLOC.idOff);
  clearP3WeaponState(state);
  state.lifecycle = 'staged';
  state.restagePending = false;
  initializeP3Record(state, false);
  game.ram.setU8(made.addr + 0x06, P3_BINDING.renderVariant);
  game.ram.setU8(made.addr + 0x07, P3_BINDING.marker);
  game.ram.setU16(made.addr + 0x08, state.runtime.targets[2].y);
  game.ram.setU16(made.addr + 0x0a, state.runtime.targets[2].x);
  return true;
}

function detachP3(state) {
  clearP3WeaponState(state);
  state.actorId = 0;
  state.lifecycle = 'detached';
  state.restagePending = true;
  state.memory.setU16(P3_BINDING.player + P.state, 0);
}

function refreshLifecycle(state, committed) {
  if (state.lifecycle === 'dropped' || state.lifecycle === 'detached') return null;
  const resolved = resolveHandle241298(state.game.ram, state.actorId);
  if (!resolved.found) {
    if (committed) {
      if (state.lifecycle === 'staged') {
        clearP3WeaponState(state);
        state.actorId = 0;
        state.lifecycle = 'dropped';
        state.memory.setU16(P3_BINDING.player + P.state, 0);
      } else {
        detachP3(state);
      }
    }
    return null;
  }
  const { rec } = resolved;
  const type = state.game.ram.u16(rec) & 0xff;
  const marker = state.game.ram.u8(rec + 0x07);
  if (type !== P3_BINDING.objectType || marker !== P3_BINDING.marker) {
    throw new Error(`P3 allocator id ${state.actorId} resolved to type ${type} marker ${marker}`);
  }
  if (state.lifecycle === 'staged') initializeP3Record(state, true);
  state.lifecycle = 'alive';
  return rec;
}

function controllerHook(state, event) {
  if (event.phase === 'after-commit' || event.phase === 'after-driver') {
    refreshLifecycle(state, true);
    return false;
  }
  if (event.phase !== 'before-dispatch') return false;
  if (event.type !== P3_BINDING.objectType || event.marker !== P3_BINDING.marker) return false;
  const id = event.ram.u32(event.slot + ALLOC.idOff);
  if (state.lifecycle !== 'alive' || id !== state.actorId) {
    throw new Error(`unknown marker-2 type-3 object with allocator id ${id}`);
  }
  return true;
}

/**
 * Attach one private P3 actor to a Game and stage its allocator record. The
 * returned state owns its sidecar and full allocator ID. It never stores a slot
 * address because allocator commit and kill operations move records.
 */
export function attachThreePilotFoundation(game, options = {}) {
  if (!game?.ram || !game?.rom || !game?.tables) {
    throw new TypeError('three-pilot foundation requires a Game');
  }
  const existing = ATTACHED.get(game);
  if (existing) return existing;
  if (game.objectDriverHook != null) {
    throw new Error('Game already has an objectDriverHook');
  }
  if (game.playerPositionTransform != null) {
    throw new Error('Game already has an incompatible playerPositionTransform');
  }
  if (game.virtualSpriteRequestHook != null) {
    throw new Error('Game already has a virtualSpriteRequestHook');
  }
  if (game.privateOptionObjectHook != null) {
    throw new Error('Game already has a privateOptionObjectHook');
  }
  if (game.privateShotObjectHook != null) {
    throw new Error('Game already has a privateShotObjectHook');
  }
  if (game.privateSegmentDriverHook != null) {
    throw new Error('Game already has a privateSegmentDriverHook');
  }
  if (game.privateBeamDrawHook != null) {
    throw new Error('Game already has a privateBeamDrawHook');
  }
  if (game.privateDamageTailHook != null) {
    throw new Error('Game already has a privateDamageTailHook');
  }
  if (game.privateDamageReceiptHook != null) {
    throw new Error('Game already has a privateDamageReceiptHook');
  }
  if (game.ram.u32(ALLOC.idCounter) === 0xffffffff) {
    throw new RangeError('P3 allocator ID would wrap to zero');
  }

  const memory = new StrictSidecarMemory(game.ram, {
    virtualRanges: P3_VIRTUAL_RANGES,
    sharedRanges: THREE_PILOT_SHARED_RANGES,
  });
  const state = {
    mode: THREE_PILOT_FORMATION_MODE,
    game,
    memory,
    binding: P3_BINDING,
    actorId: 0,
    lifecycle: 'staged',
    restagePending: false,
    inputSeeded: false,
    render: createThreePilotRenderState(memory, {
      position: P3_BINDING.beam.positionHistory,
      image: P3_BINDING.beam.imageHistory,
    }),
    weapons: { requests: [], actorId: 0, calls: 0 },
    shots: { requests: [], actorId: 0, calls: 0, resources: null },
    beam: {
      requests: [], actorId: 0, segmentCalls: 0, drawCalls: 0, resources: null,
    },
    damage: {
      resources: P3_PRIVATE_DAMAGE_RESOURCES,
      realRam: game.ram,
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
    runtime: {
      anchorX: clamp(game.ram.u16(RAM.player1 + P.posX) + OFFSET_X,
        ANCHOR.xMin, ANCHOR.xMax),
      anchorY: clamp(game.ram.u16(RAM.player1 + P.posY), ANCHOR.yMin, ANCHOR.yMax),
      lastP1Speed: null,
      rebasePending: game.ram.u16(STAGE_CLEAR) !== 0,
      targets: [{ y: 0, x: 0 }, { y: 0, x: 0 }, { y: 0, x: 0 }],
    },
  };
  state.damage.memory = new PrivateDamageMemory(state);
  bindP3ShotResources(state);
  bindP3BeamResources(state);
  cacheTargets(state);
  if (liveNonDeath(memory, P1_BINDING)) {
    state.runtime.lastP1Speed = memory.u8(P1_BINDING.player + P.speedIdx);
  }
  if (Object.hasOwn(options, 'inputWord')) {
    seedP3Input(state, mirrorsFromPort(options.inputWord).p1);
  }

  if (!stageP3Actor(state)) {
    clearP3WeaponState(state);
    state.lifecycle = 'dropped';
    state.memory.setU16(P3_BINDING.player + P.state, 0);
  }

  const hook = (event) => controllerHook(state, event);
  const positionTransform = (ram, playerIdx) =>
    cachedPositionTransform(state, ram, playerIdx);
  const renderHook = (hookGame) => collectThreePilotSpriteRequests(state, hookGame);
  const shotHook = (hookGame, invokingCtx = null) => {
    if (hookGame !== state.game || ATTACHED.get(hookGame) !== state) {
      throw new Error('private P3 shot hook invoked for a different Game');
    }
    return runThreePilotShotObject(hookGame, invokingCtx);
  };
  const optionHook = (hookGame) => {
    if (hookGame !== state.game || ATTACHED.get(hookGame) !== state) {
      throw new Error('private P3 option hook invoked for a different Game');
    }
    return runThreePilotOptionObject(hookGame);
  };
  const segmentHook = (hookGame) => {
    if (hookGame !== state.game || ATTACHED.get(hookGame) !== state) {
      throw new Error('private P3 segment hook invoked for a different Game');
    }
    return runThreePilotSegmentObject(hookGame);
  };
  const beamDrawHook = (hookGame) => {
    if (hookGame !== state.game || ATTACHED.get(hookGame) !== state) {
      throw new Error('private P3 beam-draw hook invoked for a different Game');
    }
    return runThreePilotBeamDrawObject(hookGame);
  };
  const damageHook = (hookGame, invokingCtx = null) => {
    if (hookGame !== state.game || ATTACHED.get(hookGame) !== state) {
      throw new Error('private P3 damage hook invoked for a different Game');
    }
    return runThreePilotDamageObject(hookGame, invokingCtx);
  };
  const receiptHook = (hookGame, event) =>
    privateDamageReceiptEvent(state, hookGame, event);
  state.objectDriverHook = hook;
  state.playerPositionTransform = positionTransform;
  state.virtualSpriteRequestHook = renderHook;
  state.privateShotObjectHook = shotHook;
  state.privateOptionObjectHook = optionHook;
  state.privateSegmentDriverHook = segmentHook;
  state.privateBeamDrawHook = beamDrawHook;
  state.privateDamageTailHook = damageHook;
  state.privateDamageReceiptHook = receiptHook;
  game.objectDriverHook = hook;
  game.playerPositionTransform = positionTransform;
  game.virtualSpriteRequestHook = renderHook;
  game.privateShotObjectHook = shotHook;
  game.privateOptionObjectHook = optionHook;
  game.privateSegmentDriverHook = segmentHook;
  game.privateBeamDrawHook = beamDrawHook;
  game.privateDamageTailHook = damageHook;
  game.privateDamageReceiptHook = receiptHook;
  ATTACHED.set(game, state);
  return state;
}

export function threePilotFoundationForGame(game) {
  return ATTACHED.get(game) ?? null;
}

/** Resolve P3 by its complete 32-bit allocator ID on every call. */
export function resolveThreePilotActor(state) {
  return refreshLifecycle(state, false);
}

/** Physical P2 receives the same safe subset as virtual P3. */
export function transformThreePilotInput(state, word) {
  const input = word & 0xffff;
  if (state?.mode !== THREE_PILOT_FORMATION_MODE
      || ATTACHED.get(state.game) !== state
      || !activeLifecycle(state.lifecycle)) return input;
  const p1 = input & 0x00ff;
  const p2Start = input & 0x0100;
  const copied = p1 & 0x00be;
  return (p1 | p2Start | 0x4000 | (copied << 8)) & 0xffff;
}

/**
 * Update virtual P3 input and the three formation positions. P1 alone owns the
 * direction and speed lookup. This function does not run any P3 gameplay path.
 */
export function prepareThreePilotFrame(state, game, word) {
  const original = word & 0xffff;
  if (state?.mode !== THREE_PILOT_FORMATION_MODE
      || state.game !== game || ATTACHED.get(game) !== state) return original;
  if (state.lifecycle === 'detached' && state.restagePending
      && !stageP3Actor(state)) return original;
  if (!activeLifecycle(state.lifecycle)) return original;

  const input = transformThreePilotInput(state, original);
  const p1Mirror = mirrorsFromPort(input).p1;
  updateP3Input(state, p1Mirror);
  const { memory, runtime } = state;
  memory.setU8(P3_BINDING.player + P.dirByte,
    memory.u16(P3_BINDING.input.raw) & 0xff);
  memory.setU8(P3_BINDING.player + P.btnByte,
    memory.u16(P3_BINDING.input.edge) & 0xff);
  if (memory.u16(STAGE_CLEAR) !== 0) {
    clearP3WeaponState(state);
    runtime.rebasePending = true;
    return input;
  }
  if (state.lifecycle === 'alive' && !liveNonDeath(memory, P3_BINDING)) {
    clearP3WeaponState(state);
  }

  const live = FORMATION_ACTOR_BINDINGS.map((binding) => bindingLive(state, binding));
  const liveP1 = live[P1_BINDING.logicalIndex];
  if (!live.some(Boolean)) return input;

  if (runtime.rebasePending) {
    const binding = FORMATION_ACTOR_BINDINGS.find((candidate) =>
      live[candidate.logicalIndex]);
    rebaseFromBinding(state, binding);
    runtime.rebasePending = false;
  }
  if (liveP1) {
    runtime.lastP1Speed = memory.u8(P1_BINDING.player + P.speedIdx);
  }

  let dy = 0;
  let dx = 0;
  if (memory.u16(MOVEMENT_DISABLE) === 0 && runtime.lastP1Speed != null) {
    const angle = game.tables.angleFor(p1Mirror & 0x0f);
    if ((angle & 0x80) === 0) {
      const vector = game.tables.vector(runtime.lastP1Speed, angle);
      dy = vector.dy;
      dx = vector.dx;
    }
  }

  runtime.anchorX = clamp(runtime.anchorX + dx, ANCHOR.xMin, ANCHOR.xMax);
  runtime.anchorY = clamp(runtime.anchorY + dy, ANCHOR.yMin, ANCHOR.yMax);
  cacheTargets(state);

  for (const binding of FORMATION_ACTOR_BINDINGS) {
    if (!live[binding.logicalIndex]) continue;
    const target = runtime.targets[binding.logicalIndex];
    memory.setU16(binding.player + P.posY, target.y);
    memory.setU16(binding.player + P.posX, target.x);
  }
  return input;
}
