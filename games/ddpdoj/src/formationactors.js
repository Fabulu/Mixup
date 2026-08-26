// Private three-pilot formation actors.
//
// This is a foundation, not a public game mode. P3 has an allocator identity and
// independent host memory for position, input, and private option pods. It does
// not implement ordinary shots, laser, collisions, score, death, lives, or HUD.

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
  beamPool: P3_VIRTUAL_BASE + 0x0c00,
  hyper: P3_VIRTUAL_BASE + 0x1300,
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
  Object.freeze({ name: 'p3-beam-record-reserved', start: P3_VIRTUAL.beamRecord, length: 0x40 }),
  Object.freeze({ name: 'p3-beam-pool-reserved', start: P3_VIRTUAL.beamPool, length: 32 * 0x30 }),
  Object.freeze({ name: 'p3-hyper-reserved', start: P3_VIRTUAL.hyper, length: 0x0100 }),
  Object.freeze({ name: 'p3-score-reserved', start: P3_VIRTUAL.score, length: 0x20 }),
  Object.freeze({ name: 'p3-bomb-reserved', start: P3_VIRTUAL.bomb, length: 0x20 }),
  Object.freeze({ name: 'p3-lives-reserved', start: P3_VIRTUAL.lives, length: 0x02 }),
  Object.freeze({ name: 'p3-tally-reserved', start: P3_VIRTUAL.tally, length: 0x24 }),
]);

export const THREE_PILOT_SHARED_RANGES = Object.freeze([
  Object.freeze({ name: 'presentation-phase', start: 0x80390c, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'p1-motion', start: RAM.player1, length: 0x06, writable: true }),
  Object.freeze({ name: 'p1-speed', start: RAM.player1 + P.speedIdx, length: 0x01,
    writable: false }),
  Object.freeze({ name: 'p2-motion', start: RAM.player2, length: 0x06, writable: true }),
  Object.freeze({ name: 'stage-draw-freeze', start: 0x812970, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'stage-clear', start: STAGE_CLEAR, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'stage-selector', start: 0x813092, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'presentation-gate', start: 0x813098, length: 0x02,
    writable: false }),
  Object.freeze({ name: 'movement-disable', start: MOVEMENT_DISABLE, length: 0x02,
    writable: false }),
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
  beam: Object.freeze({ record: P3_VIRTUAL.beamRecord, pool: P3_VIRTUAL.beamPool }),
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

const ATTACHED = new WeakMap();

function clearP3OptionState(state) {
  if (!state?.weapons) return;
  state.weapons.requests.length = 0;
  state.weapons.actorId = 0;
  for (let offset = 0; offset < OPT.stride; offset++) {
    state.memory.setU8(P3_BINDING.options + offset, 0);
  }
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
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3OptionState(state);
    return renderThreePilotRequests(state, game);
  }
  const optionRequests = state.weapons.requests.splice(0);
  const shipRequests = renderThreePilotRequests(state, game);
  return optionRequests.concat(shipRequests);
}

function p3OptionBlock(state) {
  return {
    ownerIndex: P3_BINDING.logicalIndex,
    opt: P3_BINDING.options,
    player: P3_BINDING.player,
    laser: null,
    beam: null,
    rampGuard: P3_BINDING.bomb,
    allowLaser: false,
    allowShots: false,
    virtualRequests: state.weapons.requests,
  };
}

/** Run the attached private option owner after the native P1/P2 pass. */
export function runThreePilotOptionObject(game) {
  const state = ATTACHED.get(game);
  if (!state) return 0;
  if (state.lifecycle !== 'alive' || state.actorId === 0
      || game.ram.u16(STAGE_CLEAR) !== 0) {
    clearP3OptionState(state);
    return 0;
  }

  const block = p3OptionBlock(state);
  assertOptionOwnerInputAllowed(state.memory, block);
  state.weapons.requests.length = 0;
  if (state.weapons.actorId !== state.actorId
      || (state.memory.u16(P3_BINDING.options + OPT.state) & 0x8000) === 0) {
    initializeP3OptionState(state);
  }

  runOptionBlock(state.memory, game, block);
  state.weapons.calls++;
  return state.weapons.requests.length;
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
  clearP3OptionState(state);
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
  clearP3OptionState(state);
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
        clearP3OptionState(state);
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
    render: createThreePilotRenderState(),
    weapons: { requests: [], actorId: 0, calls: 0 },
    runtime: {
      anchorX: clamp(game.ram.u16(RAM.player1 + P.posX) + OFFSET_X,
        ANCHOR.xMin, ANCHOR.xMax),
      anchorY: clamp(game.ram.u16(RAM.player1 + P.posY), ANCHOR.yMin, ANCHOR.yMax),
      lastP1Speed: null,
      rebasePending: game.ram.u16(STAGE_CLEAR) !== 0,
      targets: [{ y: 0, x: 0 }, { y: 0, x: 0 }, { y: 0, x: 0 }],
    },
  };
  cacheTargets(state);
  if (liveNonDeath(memory, P1_BINDING)) {
    state.runtime.lastP1Speed = memory.u8(P1_BINDING.player + P.speedIdx);
  }
  if (Object.hasOwn(options, 'inputWord')) {
    seedP3Input(state, mirrorsFromPort(options.inputWord).p1);
  }

  if (!stageP3Actor(state)) {
    clearP3OptionState(state);
    state.lifecycle = 'dropped';
    state.memory.setU16(P3_BINDING.player + P.state, 0);
  }

  const hook = (event) => controllerHook(state, event);
  const positionTransform = (ram, playerIdx) =>
    cachedPositionTransform(state, ram, playerIdx);
  const renderHook = (hookGame) => collectThreePilotSpriteRequests(state, hookGame);
  const optionHook = (hookGame) => {
    if (hookGame !== state.game || ATTACHED.get(hookGame) !== state) {
      throw new Error('private P3 option hook invoked for a different Game');
    }
    return runThreePilotOptionObject(hookGame);
  };
  state.objectDriverHook = hook;
  state.playerPositionTransform = positionTransform;
  state.virtualSpriteRequestHook = renderHook;
  state.privateOptionObjectHook = optionHook;
  game.objectDriverHook = hook;
  game.playerPositionTransform = positionTransform;
  game.virtualSpriteRequestHook = renderHook;
  game.privateOptionObjectHook = optionHook;
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
    clearP3OptionState(state);
    runtime.rebasePending = true;
    return input;
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
