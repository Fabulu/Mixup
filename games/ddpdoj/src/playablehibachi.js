// Stable external state for the Playable Hibachi mod.

import { BUL, REC as BULLET_REC } from './bullets.js';
import {
  applyOrdinaryShotDamageReceipt, DMG, ordinaryShotPointOverlapsEnemy,
} from './damage.js';
import { loadRecordProto, loadSubProto } from './enemyproto.js';
import { BEAM, SEG } from './laser.js';
import {
  altGun0Init2A9366, altGun0Step2A93DC,
  altGun1Init2A97F4, altGun1Step2A9874,
  altGun2Init2A9AA0, altGun2Step2A9B0E,
  altGun3Init2A9E84, altGun3Step2A9EB6,
  altGun4Init2AA072, altGun4Step2AA084,
  gun0Init2A738A, gun0Step2A7400,
  gun1Init2A7850, gun1Step2A78D0,
  gun2Init2A7AB2, gun2Step2A7B20,
  gun3Init2A7E64, gun3Step2A7E96,
  gun5Init2A81BC, gun5Step2A8206,
  gun6Init2A8370, gun6Step2A8396,
  gun7Init2A8516, gun7Step2A8538,
  gun8Init2A8800, gun8Step2A883A,
  gun9Init2A89BA, gun9Step2A89F4,
  gunAInit2A8B7C, gunAStep2A8BC0,
  gunBInit2A8C9A, gunBStep2A8CB2,
} from './hibachiguns.js';
import { MACHINE, P, RAM } from './machine.js';
import { deriveProfileContext } from './profiles.js';
import { i16, u16 } from './ram.js';
import { StrictSidecarMemory } from './sidecarmemory.js';
import { encodeRegisterRequest, BUCKETS, NAMED_BUCKETS } from './spritequeue.js';
import { SHOT } from './weapons.js';

export const PLAYABLE_HIBACHI_CONFLICT = 'Formation cannot be combined with Playable Hibachi';
export const PLAYABLE_HIBACHI_EXTERNAL_KIND = 'ddpdoj.playable-hibachi/v2';
export const PLAYABLE_HIBACHI_SIDECAR_BYTES = 0x276;
export const PLAYABLE_HIBACHI_BULLET_SLOTS = 210;
/** Over three times the strongest measured stock projectile, but not a boss erase. */
export const PLAYABLE_HIBACHI_BULLET_POWER = 0x0100;
export const PLAYABLE_HIBACHI_GUN_IDS = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0x0a, 0x0b,
]);

function gunDescriptor(id, bank, pattern, family, gun, init, step, finite = true) {
  return Object.freeze({
    id, bank, pattern, family, gun, init, step, finite,
    signature: `${id}:${bank}:${pattern}:${family}:${gun}:${init.name}:${step.name}:${finite ? 'f' : 'p'}`,
  });
}

export const PLAYABLE_HIBACHI_ORDINARY_PATTERNS = Object.freeze([
  gunDescriptor(0, 'ordinary', 5, 'main', 0, gun0Init2A738A, gun0Step2A7400),
  gunDescriptor(1, 'ordinary', 6, 'main', 1, gun1Init2A7850, gun1Step2A78D0),
  gunDescriptor(2, 'ordinary', 7, 'main', 2, gun2Init2A7AB2, gun2Step2A7B20),
  gunDescriptor(3, 'ordinary', 8, 'main', 3, gun3Init2A7E64, gun3Step2A7E96),
  gunDescriptor(4, 'ordinary', 9, 'shared', 5, gun5Init2A81BC, gun5Step2A8206),
  gunDescriptor(5, 'ordinary', 10, 'shared', 6, gun6Init2A8370, gun6Step2A8396),
  gunDescriptor(6, 'ordinary', 11, 'shared', 7, gun7Init2A8516, gun7Step2A8538),
  gunDescriptor(7, 'ordinary', 12, 'shared', 8, gun8Init2A8800, gun8Step2A883A),
  gunDescriptor(8, 'ordinary', 13, 'shared', 9, gun9Init2A89BA, gun9Step2A89F4),
  gunDescriptor(9, 'ordinary', 14, 'shared', 0x0a, gunAInit2A8B7C, gunAStep2A8BC0),
  gunDescriptor(10, 'ordinary', 15, 'shared', 0x0b, gunBInit2A8C9A, gunBStep2A8CB2),
  gunDescriptor(11, 'ordinary', 16, 'alternate', 0, altGun0Init2A9366, altGun0Step2A93DC),
  gunDescriptor(12, 'ordinary', 17, 'alternate', 1, altGun1Init2A97F4, altGun1Step2A9874),
  gunDescriptor(13, 'ordinary', 18, 'alternate', 2, altGun2Init2A9AA0, altGun2Step2A9B0E),
  gunDescriptor(14, 'ordinary', 19, 'alternate', 3, altGun3Init2A9E84, altGun3Step2A9EB6),
  gunDescriptor(15, 'ordinary', 20, 'alternate', 4, altGun4Init2AA072, altGun4Step2AA084,
    false),
]);

export const PLAYABLE_HIBACHI_HYPER_PATTERNS = Object.freeze([
  gunDescriptor(16, 'hyper', 1, 'shared', 5, gun5Init2A81BC, gun5Step2A8206),
  gunDescriptor(17, 'hyper', 2, 'shared', 6, gun6Init2A8370, gun6Step2A8396),
  gunDescriptor(18, 'hyper', 3, 'shared', 7, gun7Init2A8516, gun7Step2A8538),
  gunDescriptor(19, 'hyper', 4, 'shared', 8, gun8Init2A8800, gun8Step2A883A),
]);

const PLAYABLE_HIBACHI_DESCRIPTORS = Object.freeze([
  ...PLAYABLE_HIBACHI_ORDINARY_PATTERNS,
  ...PLAYABLE_HIBACHI_HYPER_PATTERNS,
]);
export const PLAYABLE_HIBACHI_PALETTE_BANKS = Object.freeze([
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x0f,
]);
export const PLAYABLE_HIBACHI_PALETTE_SOURCES = Object.freeze(
  PLAYABLE_HIBACHI_PALETTE_BANKS.map((_, index) => 0x223038 + index * 0x40),
);

export const PLAYABLE_HIBACHI_BASES = Object.freeze([0x11000000, 0x11010000]);

function layoutFor(base) {
  return Object.freeze({
    base,
    gun: base,
    body: base + 0x0100,
    parts: base + 0x0200,
    target: base + 0x0400,
  });
}

export const PLAYABLE_HIBACHI_LAYOUTS = Object.freeze(
  PLAYABLE_HIBACHI_BASES.map(layoutFor),
);

function virtualRanges(layout, player) {
  return Object.freeze([
    Object.freeze({ name: `hibachi-p${player}-gun`, start: layout.gun, length: 0x020 }),
    Object.freeze({ name: `hibachi-p${player}-body`, start: layout.body, length: 0x050 }),
    Object.freeze({ name: `hibachi-p${player}-parts`, start: layout.parts, length: 0x200 }),
    Object.freeze({ name: `hibachi-p${player}-target`, start: layout.target, length: 0x006 }),
  ]);
}

const SHARED_RANGES = Object.freeze([
  Object.freeze({
    name: 'hibachi-native-main-ram',
    start: MACHINE.ramBase,
    length: MACHINE.ramSize,
    writable: true,
  }),
]);

const RAM_METHODS = Object.freeze([
  'u8', 'i8', 'u16', 'i16', 'u32', 'setU8', 'setU16', 'setU32',
  'bchg8', 'bclr8', 'bset8', 'btst8',
]);

function createRamBinding() {
  const binding = { current: null };
  for (const name of RAM_METHODS) {
    binding[name] = (...args) => {
      if (!binding.current) throw new Error('Playable Hibachi state is not bound to a Game');
      return binding.current[name](...args);
    };
  }
  return binding;
}

function createPlayer(state, index) {
  const bytes = new Uint8Array(PLAYABLE_HIBACHI_SIDECAR_BYTES);
  const layout = PLAYABLE_HIBACHI_LAYOUTS[index];
  const memory = new StrictSidecarMemory(state.ramBinding, {
    virtualRanges: virtualRanges(layout, index + 1),
    sharedRanges: SHARED_RANGES,
    bytes,
  });
  const runtime = {
    bodyInitialized: false,
    initialized: false,
    retired: false,
    live: false,
    lifeIdentity: 0,
    descriptorId: -1,
    gun: -1,
    frames: 0,
    presentationFrames: 0,
    presentationStarted: false,
    launchActive: false,
    launchY: 0,
    launchX: 0,
  };
  return {
    index,
    owner: index + 1,
    layout,
    bytes,
    memory,
    runtime,
  };
}

function fingerprintObject() {
  return Object.freeze({
    schema: PLAYABLE_HIBACHI_EXTERNAL_KIND,
    sidecarBytes: PLAYABLE_HIBACHI_SIDECAR_BYTES,
    bulletSlots: PLAYABLE_HIBACHI_BULLET_SLOTS,
    bulletPower: PLAYABLE_HIBACHI_BULLET_POWER,
    gunIds: PLAYABLE_HIBACHI_GUN_IDS.join(','),
    descriptors: PLAYABLE_HIBACHI_DESCRIPTORS
      .map((descriptor) => descriptor.signature).join('|'),
    paletteBanks: PLAYABLE_HIBACHI_PALETTE_BANKS.join(','),
    paletteSources: PLAYABLE_HIBACHI_PALETTE_SOURCES
      .map((address) => address.toString(16)).join(','),
    bases: PLAYABLE_HIBACHI_BASES.map((address) => address.toString(16)).join(','),
  });
}

const ATTACHED = new WeakMap();
const RUNAHEAD_TOKENS = new WeakMap();

/** Create every external owner before a Game exists so callback identities stay stable. */
export function createPlayableHibachiState() {
  const state = {
    kind: PLAYABLE_HIBACHI_EXTERNAL_KIND,
    game: null,
    ramBinding: createRamBinding(),
    players: null,
    sidecars: null,
    sidecarBytes: null,
    ownedBullets: new Uint8Array(PLAYABLE_HIBACHI_BULLET_SLOTS),
    selectedGuns: new Int8Array([-1, -1]),
    ordinaryPatternCursors: Uint8Array.of(5, 5),
    hyperPatternCursors: Uint8Array.of(1, 1),
    privatePaletteWords: new Uint16Array(PLAYABLE_HIBACHI_PALETTE_BANKS.length * 32),
    paletteReady: false,
    paletteLeases: [],
    fingerprints: fingerprintObject(),
    virtualRequests: [],
    lifecycle: {
      bound: false,
      pending: true,
      launchEligible: false,
      active: false,
      credited: false,
      generation: 0,
    },
  };
  state.players = [createPlayer(state, 0), createPlayer(state, 1)];
  state.sidecars = state.players.map((player) => player.memory);
  state.sidecarBytes = state.players.map((player) => player.bytes);
  return state;
}

function assertState(state) {
  if (!state || state.kind !== PLAYABLE_HIBACHI_EXTERNAL_KIND
      || !Array.isArray(state.players) || state.players.length !== 2) {
    throw new TypeError('Playable Hibachi state is invalid');
  }
  return state;
}

function assertBoundGame(state, game) {
  assertState(state);
  if (state.game !== game || state.ramBinding.current !== game?.ram
      || ATTACHED.get(game) !== state) {
    throw new Error('Playable Hibachi state is bound to a different Game');
  }
}

function loadPrivatePalettes(state, game) {
  const out = state.privatePaletteWords;
  for (let bank = 0; bank < PLAYABLE_HIBACHI_PALETTE_SOURCES.length; bank++) {
    const bytes = game.rom.bytes(PLAYABLE_HIBACHI_PALETTE_SOURCES[bank], 0x40);
    if (!bytes || bytes.length !== 0x40) {
      throw new Error(`Playable Hibachi palette source ${bank} is not 64 bytes`);
    }
    for (let word = 0; word < 32; word++) {
      out[bank * 32 + word] = (bytes[word * 2] << 8) | bytes[word * 2 + 1];
    }
  }
  state.paletteReady = true;
}

/** Bind once. A replay candidate creates a fresh state for its fresh Game. */
export function bindPlayableHibachiGame(state, game) {
  assertState(state);
  if (!game?.ram || !game?.rom || !game?.tables) {
    throw new TypeError('Playable Hibachi requires a Game');
  }
  if (state.game && state.game !== game) {
    throw new Error('Playable Hibachi state cannot be rebound to another Game');
  }
  const prior = ATTACHED.get(game);
  if (prior && prior !== state) throw new Error('Game already has Playable Hibachi state');
  state.game = game;
  state.ramBinding.current = game.ram;
  state.lifecycle.bound = true;
  ATTACHED.set(game, state);
  if (!state.paletteReady) loadPrivatePalettes(state, game);
  return state;
}

export function playableHibachiStateForGame(game) {
  return ATTACHED.get(game) ?? null;
}

function clearRequestArray(requests) {
  requests.length = 0;
}

function resetPlayer(player, lifeIdentity = 0) {
  player.bytes.fill(0);
  Object.assign(player.runtime, {
    bodyInitialized: false,
    initialized: false,
    retired: false,
    live: false,
    lifeIdentity,
    descriptorId: -1,
    gun: -1,
    frames: 0,
    presentationFrames: 0,
    presentationStarted: false,
    launchActive: false,
    launchY: 0,
    launchX: 0,
  });
}

/** Clear one run without replacing any object, array, or typed-array owner. */
export function resetPlayableHibachiStateInPlace(state) {
  assertState(state);
  state.ownedBullets.fill(0);
  state.selectedGuns.fill(-1);
  state.ordinaryPatternCursors.set([5, 5]);
  state.hyperPatternCursors.set([1, 1]);
  for (const player of state.players) resetPlayer(player);
  clearRequestArray(state.virtualRequests);
  state.paletteLeases.length = 0;
  state.lifecycle.launchEligible = false;
  state.lifecycle.active = false;
  state.lifecycle.credited = false;
  return state;
}

export function armPlayableHibachiLaunchPresentation(state) {
  assertState(state);
  if (state.lifecycle.active) return false;
  state.lifecycle.pending = true;
  state.lifecycle.launchEligible = true;
  return true;
}

function clearNativePlayerOrdnance(ram) {
  for (const pool of [SHOT.p1Table, SHOT.p2Table]) {
    for (let slot = 0; slot < SHOT.slots; slot++) {
      ram.setU16(pool + slot * SHOT.stride, 0);
    }
  }
  ram.setU16(SHOT.liveCount, 0);
  for (const beam of BEAM) {
    ram.setU16(beam.rec, 0);
    ram.setU16(beam.blk, 0);
    ram.setU16(beam.blk + 0x16, 0);
    for (let slot = 0; slot < SEG.slots; slot++) {
      ram.setU16(beam.pool + slot * SEG.stride, 0);
    }
  }
  ram.setU16(RAM.p1Options, 0);
  ram.setU16(RAM.p2Options, 0);
  for (const bucket of NATIVE_PLAYER_PRESENTATION_BUCKETS) {
    ram.setU16(BUCKETS[bucket].counter, 0);
  }
}

function restoreLaunchPresentation(player, saved) {
  Object.assign(player.runtime, saved);
}

function saveLaunchPresentation(player) {
  const runtime = player.runtime;
  return {
    presentationFrames: runtime.presentationFrames,
    presentationStarted: runtime.presentationStarted,
    launchActive: runtime.launchActive,
    launchY: runtime.launchY,
    launchX: runtime.launchX,
  };
}

/** Ignore demo handoffs and activate only a credited ordinary run. */
export function beginPlayableHibachiCreditedRun(state, game, event = {}) {
  assertBoundGame(state, game);
  const credited = event.demo !== true;
  const presentation = credited
    ? state.players.map(saveLaunchPresentation)
    : null;
  resetPlayableHibachiStateInPlace(state);
  if (presentation) {
    for (let i = 0; i < state.players.length; i++) {
      restoreLaunchPresentation(state.players[i], presentation[i]);
    }
  }
  state.lifecycle.pending = !credited;
  state.lifecycle.launchEligible = !credited;
  state.lifecycle.credited = credited;
  state.lifecycle.active = credited;
  if (credited) {
    clearNativePlayerOrdnance(game.ram);
    state.lifecycle.generation++;
  }
  return credited;
}

export function endPlayableHibachiRun(state, game) {
  assertBoundGame(state, game);
  resetPlayableHibachiStateInPlace(state);
  armPlayableHibachiLaunchPresentation(state);
  return state;
}

const HYPER_ACTIVE = Object.freeze([0x81b63e, 0x81b640]);
const HIBACHI_BODY_RECORD_PROTO = 0x2a443c;
const HIBACHI_BODY_SUB_PROTO = 0x2a4446;
const HIBACHI_BODY_SUB_RECORDS = 16;
const FIRST_FORM_PART_POSITIONS = Object.freeze([
  Object.freeze([0x020, 0x14c0, 0xf180]),
  Object.freeze([0x040, 0xfb00, 0xee40]),
  Object.freeze([0x060, 0xe880, 0xeec0]),
  Object.freeze([0x080, 0x0740, 0x1040]),
  Object.freeze([0x0a0, 0xf780, 0x14c0]),
  Object.freeze([0x0c0, 0xe540, 0x1040]),
]);
const SMALL_FORM_BUCKET = NAMED_BUCKETS.player;
const SMALL_FORM_FLIP = 0x6000;

export const PLAYABLE_HIBACHI_SMALL_FORM = Object.freeze({
  artTable: 0x2a4d3e,
  frames: 8,
  framePeriod: 2,
  dimensions: 0x0c38,
  paletteBank: 0x17,
  bucket: SMALL_FORM_BUCKET,
  flip: SMALL_FORM_FLIP,
  yBias: -0x0c00,
  xBias: -0x0700,
});

const NATIVE_PLAYER_PRESENTATION_BUCKETS = Object.freeze([
  NAMED_BUCKETS.shadows,
  NAMED_BUCKETS.trail,
  NAMED_BUCKETS.shots,
  NAMED_BUCKETS.options,
  NAMED_BUCKETS.beam,
  NAMED_BUCKETS.player,
]);

function bulletSlot(address) {
  const delta = address - BUL.pool;
  return delta >= 0 && delta % BUL.stride === 0 ? delta / BUL.stride : -1;
}

export function clearPlayableHibachiBulletOnSpawn(state, event) {
  assertState(state);
  if (!Number.isInteger(event?.slot)
      || event.slot < 0 || event.slot >= state.ownedBullets.length) return;
  const sourceSlot = bulletSlot(event.sourceBullet);
  const sourceOwner = sourceSlot >= 0 && sourceSlot < state.ownedBullets.length
    ? state.ownedBullets[sourceSlot] : 0;
  state.ownedBullets[event.slot] = sourceOwner === 1 || sourceOwner === 2 ? sourceOwner : 0;
}

export function retirePlayableHibachiBullet(state, event) {
  assertState(state);
  if (event?.all === true) {
    state.ownedBullets.fill(0);
    return;
  }
  const slot = Number.isInteger(event?.slot) ? event.slot : bulletSlot(event?.addr);
  if (slot >= 0 && slot < state.ownedBullets.length) state.ownedBullets[slot] = 0;
}

export function playableHibachiBulletOwner(state, address) {
  assertState(state);
  const slot = bulletSlot(address);
  return slot >= 0 && slot < state.ownedBullets.length ? state.ownedBullets[slot] : 0;
}

/** Reset one native life and retire only the authentic bullets owned by it. */
export function resetPlayableHibachiPlayerLife(state, ram, playerIdx) {
  assertState(state);
  if (state.ramBinding.current !== ram) {
    throw new Error('Playable Hibachi life reset received a different RAM owner');
  }
  if (!Number.isInteger(playerIdx) || playerIdx < 0 || playerIdx > 1) {
    throw new RangeError('Playable Hibachi player index is outside 0 through 1');
  }
  if (!state.lifecycle.active) return 0;

  const player = state.players[playerIdx];
  resetPlayer(player, player.runtime.lifeIdentity);
  state.selectedGuns[playerIdx] = -1;
  let retired = 0;
  for (let slot = 0; slot < state.ownedBullets.length; slot++) {
    if (state.ownedBullets[slot] !== player.owner) continue;
    const bullet = BUL.pool + slot * BUL.stride;
    state.ownedBullets[slot] = 0;
    ram.setU16(bullet, 0);
    ram.setU16(bullet + BULLET_REC.posA, 0xffff);
    retired++;
  }
  return retired;
}

export function filterPlayableHibachiGrazeEvent(state, event) {
  assertState(state);
  return {
    ...event,
    live: event.live.filter((address) => playableHibachiBulletOwner(state, address) === 0),
    near: event.near.filter((address) => playableHibachiBulletOwner(state, address) === 0),
  };
}

export function playableHibachiAllowsBulletCollision(state, event) {
  return playableHibachiBulletOwner(state, event?.bullet) === 0;
}

export function playableHibachiAllowsFriendlyConversion(state, event) {
  return playableHibachiBulletOwner(state, event?.bullet) === 0;
}

/** Apply one shared ordinary-shot receipt to each colliding friendly bullet. */
export function runPlayableHibachiDamage(state, game) {
  assertBoundGame(state, game);
  if (!state.lifecycle.active) return 0;
  const ram = game.ram;
  const gate308c = ram.u16(DMG.gate308c);
  let hits = 0;
  for (let slot = 0; slot < state.ownedBullets.length; slot++) {
    const owner = state.ownedBullets[slot];
    if (owner === 0) continue;
    const bullet = BUL.pool + slot * BUL.stride;
    if ((ram.u16(bullet) & 0x9000) !== TYPEBIT_ALIVE) continue;
    const y = ram.u16(bullet + BULLET_REC.posA);
    const x = ram.u16(bullet + BULLET_REC.posB);
    for (let enemySlot = 0; enemySlot < 150; enemySlot++) {
      const enemy = DMG.poolA + enemySlot * DMG.enemyStride;
      const type = ram.u16(enemy);
      const variant = enemySlot < 100 ? 'A' : 'B';
      if ((type & 0xa000) !== 0xa000 || i16(ram.u16(enemy + 0x18)) < 0
          || !ordinaryShotPointOverlapsEnemy(ram, enemy, y, x, variant)) continue;
      const mask = owner === 1 ? DMG.maskP1 : DMG.maskP2;
      applyOrdinaryShotDamageReceipt(
        ram, enemy, PLAYABLE_HIBACHI_BULLET_POWER, mask, gate308c, game);
      ram.setU16(bullet, u16(ram.u16(bullet) | 0x1000));
      hits++;
      break;
    }
  }
  return hits;
}

const TYPEBIT_ALIVE = 0x8000;

function forEachSpawnResult(result, visit) {
  if (Array.isArray(result)) {
    for (const entry of result) forEachSpawnResult(entry, visit);
  } else if (result) {
    visit(result);
  }
}

function claimSpawnedBullets(state, player, ram, rec, result) {
  const ownerY = ram.u16(rec + P.posY);
  const ownerX = ram.u16(rec + P.posX);
  forEachSpawnResult(result, (entry) => {
    if (entry.carry || entry.declined || !Number.isInteger(entry.slot)
        || !Number.isInteger(entry.addr) || entry.slot < 0
        || entry.slot >= state.ownedBullets.length
        || entry.addr !== BUL.pool + entry.slot * BUL.stride) return;
    state.ownedBullets[entry.slot] = player.owner;
    ram.setU8(entry.addr + BULLET_REC.dir,
      (ram.u8(entry.addr + BULLET_REC.dir) + 0x80) & 0xff);
    ram.setU8(entry.addr + BULLET_REC.origDir,
      (ram.u8(entry.addr + BULLET_REC.origDir) + 0x80) & 0xff);
    ram.setU16(entry.addr + BULLET_REC.posA, ownerY);
    ram.setU16(entry.addr + BULLET_REC.posB, ownerX);
  });
}

function selectedDescriptor(state, ram, rec, playerIdx) {
  const hyper = ram.u16(HYPER_ACTIVE[playerIdx]) !== 0;
  const descriptors = hyper
    ? PLAYABLE_HIBACHI_HYPER_PATTERNS
    : PLAYABLE_HIBACHI_ORDINARY_PATTERNS;
  const cursors = hyper ? state.hyperPatternCursors : state.ordinaryPatternCursors;
  const first = descriptors[0].pattern;
  const last = descriptors.at(-1).pattern;
  const edge = ram.u8(rec + P.btnByte);
  const shot = (edge & 0x10) !== 0;
  const auto = (edge & 0x40) !== 0;
  if (shot !== auto) {
    if (auto) cursors[playerIdx] = cursors[playerIdx] === last
      ? first : cursors[playerIdx] + 1;
    else cursors[playerIdx] = cursors[playerIdx] === first
      ? last : cursors[playerIdx] - 1;
  }
  return descriptors[cursors[playerIdx] - first];
}

function initializePrivateBody(player, rom) {
  if (player.runtime.bodyInitialized) return;
  const { body, parts } = player.layout;
  loadSubProto(player.memory, rom, body, parts,
    HIBACHI_BODY_SUB_PROTO, HIBACHI_BODY_SUB_RECORDS - 1);
  loadRecordProto(player.memory, rom, body, HIBACHI_BODY_RECORD_PROTO, 4);
  player.runtime.bodyInitialized = true;
}

function updatePrivateBody(player, ram, rec, rom) {
  initializePrivateBody(player, rom);
  const { body, parts } = player.layout;
  const y = ram.u16(rec + P.posY);
  const x = ram.u16(rec + P.posX);
  player.memory.setU16(body, 0x8000);
  player.memory.setU16(body + 0x02, y);
  player.memory.setU16(body + 0x04, x);
  player.memory.setU32(body + 0x06, parts);
  player.memory.setU16(parts, 0x8000);
  player.memory.setU16(parts + 0x02, y);
  player.memory.setU16(parts + 0x04, x);
  for (const [offset, dy, dx] of FIRST_FORM_PART_POSITIONS) {
    player.memory.setU16(parts + offset, 0x8000);
    player.memory.setU16(parts + offset + 0x02, u16(y + dy));
    player.memory.setU16(parts + offset + 0x04, u16(x + dx));
  }
  for (const offset of [0x140, 0x160, 0x180, 0x1a0]) {
    player.memory.setU16(parts + offset, 0x8000);
    player.memory.setU16(parts + offset + 0x02, y);
    player.memory.setU16(parts + offset + 0x04, x);
  }
  const angle = (player.runtime.frames * 2) & 0xff;
  player.memory.setU8(parts + 0x01b, angle);
  player.memory.setU8(parts + 0x131, (angle + 0x10) & 0xff);
  player.memory.setU8(parts + 0x13d, (angle + 0x40) & 0xff);
}

function updateReflectedTarget(player, ram, rec) {
  const ownerY = ram.u16(rec + P.posY);
  const ownerX = ram.u16(rec + P.posX);
  let best = null;
  for (let slot = 0; slot < 150; slot++) {
    const enemy = DMG.poolA + slot * DMG.enemyStride;
    const type = ram.u16(enemy);
    if ((type & 0xa000) !== 0xa000 || i16(ram.u16(enemy + 0x18)) < 0) continue;
    const dy = i16(ram.u16(enemy + 0x02) - ownerY);
    const dx = i16(ram.u16(enemy + 0x04) - ownerX);
    const distance = dy * dy + dx * dx;
    if (!best || distance < best.distance) best = { enemy, distance };
  }
  if (!best) {
    player.memory.setU16(player.layout.target, 0);
    return null;
  }
  const target = player.layout.target;
  player.memory.setU16(target, 0x8000);
  player.memory.setU16(target + 0x02,
    u16(ownerY * 2 - ram.u16(best.enemy + 0x02)));
  player.memory.setU16(target + 0x04,
    u16(ownerX * 2 - ram.u16(best.enemy + 0x04)));
  return target;
}

/** Run one selected authentic Hibachi gun against one native player owner. */
export function stepPlayableHibachiWeapon(state, ram, rec, playerIdx, ctx) {
  assertState(state);
  if (!state.lifecycle.active || playerIdx < 0 || playerIdx > 1
      || rec !== (playerIdx === 0 ? RAM.player1 : RAM.player2)) return false;
  const player = state.players[playerIdx];
  const runtime = player.runtime;
  const live = (ram.u16(rec) & 0x8000) !== 0;
  if (!live) {
    if (runtime.live) resetPlayableHibachiPlayerLife(state, ram, playerIdx);
    return false;
  }
  if (!runtime.live) {
    runtime.live = true;
    runtime.lifeIdentity++;
  }

  updatePrivateBody(player, ram, rec, ctx.rom);
  const target = updateReflectedTarget(player, ram, rec);
  const descriptor = selectedDescriptor(state, ram, rec, playerIdx);
  if (runtime.descriptorId !== descriptor.id || runtime.retired) {
    for (let offset = 0; offset < 0x020; offset++) {
      player.memory.setU8(player.layout.gun + offset, 0);
    }
    runtime.descriptorId = descriptor.id;
    runtime.gun = descriptor.gun;
    runtime.initialized = false;
    runtime.retired = false;
  }
  state.selectedGuns[playerIdx] = descriptor.gun;
  if (!runtime.initialized) {
    descriptor.init(player.memory, ctx.rom, player.layout.gun, player.layout.parts);
    runtime.initialized = true;
    runtime.frames = 0;
    return true;
  }

  const privateCtx = deriveProfileContext(ctx, {
    privateTargetRecord: target,
    privateA1StopHook: (script) => {
      if (script !== descriptor.gun) return false;
      runtime.retired = true;
      return true;
    },
    bulletSpawn: (site, result, callRegs, entry) => {
      ctx.bulletSpawn?.(site, result, callRegs, entry);
      claimSpawnedBullets(state, player, ram, rec, result);
    },
  });
  descriptor.step(player.memory, ctx.rom, privateCtx,
    player.layout.gun, player.layout.body, player.layout.parts);
  runtime.frames++;
  return true;
}

function packD1(y, x) {
  return (((y & 0xffff) << 16) | (x & 0xffff)) >>> 0;
}

function privatePaletteIndex(nativeBank) {
  const index = PLAYABLE_HIBACHI_PALETTE_BANKS.indexOf(nativeBank);
  if (index < 0) {
    throw new Error(`Playable Hibachi palette bank $${nativeBank.toString(16)} is not private`);
  }
  return index;
}

export function capturePlayableHibachiLaunch(state, event) {
  assertState(state);
  if (event?.phase !== 'launch' || event.demo !== false
      || (!state.lifecycle.launchEligible && !state.lifecycle.active)) return false;
  const playerIdx = event.playerIdx;
  if (!Number.isInteger(playerIdx) || playerIdx < 0 || playerIdx > 1
      || !Number.isInteger(event.anchor)) return false;
  const runtime = state.players[playerIdx].runtime;
  runtime.launchActive = true;
  runtime.launchY = (event.anchor >>> 16) & 0xffff;
  runtime.launchX = event.anchor & 0xffff;
  return true;
}

function collectPlayerSmallForm(state, player, game, ownerY, ownerX) {
  const form = PLAYABLE_HIBACHI_SMALL_FORM;
  const runtime = player.runtime;
  // Presentation owns this clock because a successful native bomb bypasses the
  // custom weapon hook while the sphere still reaches the display list.
  if (runtime.presentationStarted) runtime.presentationFrames++;
  else runtime.presentationStarted = true;
  const frame = Math.floor(runtime.presentationFrames / form.framePeriod)
    % form.frames;
  state.virtualRequests.push({
    bucket: form.bucket,
    bytes: encodeRegisterRequest(
      packD1(u16(ownerY + form.yBias), u16(ownerX + form.xBias)),
      game.rom.u32(form.artTable + frame * 4),
      form.dimensions,
      form.flip | form.paletteBank,
    ),
    privatePaletteBank: privatePaletteIndex(form.paletteBank),
  });
}

function snapshotRequestOwners(requests) {
  return requests.map((request) => ({
    owner: request,
    bytesOwner: request.bytes,
    bytes: new Uint8Array(request.bytes),
    bucket: request.bucket,
    privatePaletteBankPresent: Object.hasOwn(request, 'privatePaletteBank'),
    privatePaletteBank: request.privatePaletteBank,
    paletteOwner: request.paletteWords ?? null,
    paletteWords: request.paletteWords ? new Uint16Array(request.paletteWords) : null,
  }));
}

function restoreRequestOwners(owner, saved) {
  owner.splice(0, owner.length, ...saved.map((entry) => entry.owner));
  for (const entry of saved) {
    entry.owner.bucket = entry.bucket;
    if (entry.privatePaletteBankPresent) {
      entry.owner.privatePaletteBank = entry.privatePaletteBank;
    } else {
      delete entry.owner.privatePaletteBank;
    }
    entry.owner.bytes = entry.bytesOwner;
    entry.bytesOwner.set(entry.bytes);
    if (entry.paletteOwner) {
      entry.owner.paletteWords = entry.paletteOwner;
      entry.paletteOwner.set(entry.paletteWords);
    } else {
      delete entry.owner.paletteWords;
    }
  }
}

export function savePlayableHibachiRunaheadState(state) {
  assertState(state);
  const token = Object.freeze(Object.create(null));
  RUNAHEAD_TOKENS.set(token, {
    state,
    used: false,
    playersOwner: state.players,
    playerOwners: [...state.players],
    playerRuntimeOwners: state.players.map((player) => player.runtime),
    playerRuntime: state.players.map((player) => ({ ...player.runtime })),
    sidecarsOwner: state.sidecars,
    sidecarOwners: [...state.sidecars],
    sidecarBytesOwner: state.sidecarBytes,
    byteOwners: [...state.sidecarBytes],
    sidecarBytes: state.sidecars.map((memory) => memory.snapshotBytes()),
    ownedBulletsOwner: state.ownedBullets,
    ownedBullets: new Uint8Array(state.ownedBullets),
    selectedGunsOwner: state.selectedGuns,
    selectedGuns: new Int8Array(state.selectedGuns),
    ordinaryPatternCursorsOwner: state.ordinaryPatternCursors,
    ordinaryPatternCursors: new Uint8Array(state.ordinaryPatternCursors),
    hyperPatternCursorsOwner: state.hyperPatternCursors,
    hyperPatternCursors: new Uint8Array(state.hyperPatternCursors),
    privatePaletteOwner: state.privatePaletteWords,
    privatePaletteWords: new Uint16Array(state.privatePaletteWords),
    paletteLeasesOwner: state.paletteLeases,
    paletteLeases: [...state.paletteLeases],
    virtualRequestsOwner: state.virtualRequests,
    virtualRequests: snapshotRequestOwners(state.virtualRequests),
    fingerprintsOwner: state.fingerprints,
    lifecycleOwner: state.lifecycle,
    lifecycle: { ...state.lifecycle },
    paletteReady: state.paletteReady,
    game: state.game,
    ramBinding: state.ramBinding,
    ramBindingCurrent: state.ramBinding.current,
  });
  return token;
}

export function restorePlayableHibachiRunaheadState(state, token) {
  const saved = RUNAHEAD_TOKENS.get(token);
  if (!saved) throw new TypeError('Unknown Playable Hibachi runahead checkpoint');
  if (saved.state !== state) throw new Error('Playable Hibachi checkpoint belongs to another state');
  if (saved.used) throw new Error('Playable Hibachi checkpoint was already restored');
  if (state.game !== saved.game || state.ramBinding !== saved.ramBinding
      || state.ramBinding.current !== saved.ramBindingCurrent
      || state.players !== saved.playersOwner || state.sidecars !== saved.sidecarsOwner
      || state.sidecarBytes !== saved.sidecarBytesOwner
      || state.players.length !== saved.playerOwners.length
      || state.sidecars.length !== saved.sidecarOwners.length
      || state.sidecarBytes.length !== saved.byteOwners.length
      || state.ownedBullets !== saved.ownedBulletsOwner
      || state.selectedGuns !== saved.selectedGunsOwner
      || state.ordinaryPatternCursors !== saved.ordinaryPatternCursorsOwner
      || state.hyperPatternCursors !== saved.hyperPatternCursorsOwner
      || state.privatePaletteWords !== saved.privatePaletteOwner
      || state.paletteLeases !== saved.paletteLeasesOwner
      || state.virtualRequests !== saved.virtualRequestsOwner
      || state.fingerprints !== saved.fingerprintsOwner
      || state.lifecycle !== saved.lifecycleOwner) {
    throw new Error('Playable Hibachi external owner identity changed during runahead');
  }
  for (let i = 0; i < saved.playerOwners.length; i++) {
    const player = saved.playerOwners[i];
    if (state.players[i] !== player || state.sidecars[i] !== saved.sidecarOwners[i]
        || state.sidecarBytes[i] !== saved.byteOwners[i]
        || player.runtime !== saved.playerRuntimeOwners[i]
        || player.memory !== saved.sidecarOwners[i]
        || player.bytes !== saved.byteOwners[i]) {
      throw new Error(`Playable Hibachi P${i + 1} owner identity changed during runahead`);
    }
  }
  for (let i = 0; i < saved.virtualRequests.length; i++) {
    const request = saved.virtualRequests[i];
    if (request.owner.bytes !== request.bytesOwner
        || (request.paletteOwner && request.owner.paletteWords !== request.paletteOwner)) {
      throw new Error(`Playable Hibachi request ${i} owner identity changed during runahead`);
    }
  }

  for (let i = 0; i < saved.playerOwners.length; i++) {
    state.sidecars[i].restoreBytes(saved.sidecarBytes[i]);
    Object.assign(state.players[i].runtime, saved.playerRuntime[i]);
  }
  state.ownedBullets.set(saved.ownedBullets);
  state.selectedGuns.set(saved.selectedGuns);
  state.ordinaryPatternCursors.set(saved.ordinaryPatternCursors);
  state.hyperPatternCursors.set(saved.hyperPatternCursors);
  state.privatePaletteWords.set(saved.privatePaletteWords);
  state.paletteLeases.splice(0, state.paletteLeases.length, ...saved.paletteLeases);
  restoreRequestOwners(state.virtualRequests, saved.virtualRequests);
  Object.assign(state.lifecycle, saved.lifecycle);
  state.paletteReady = saved.paletteReady;
  saved.used = true;
}

function encodeB64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function decodeB64(value, label) {
  if (typeof value !== 'string'
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label} is not valid base64`);
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function wordsToBytes(words) {
  const bytes = new Uint8Array(words.length * 2);
  for (let i = 0; i < words.length; i++) {
    bytes[i * 2] = words[i] >>> 8;
    bytes[i * 2 + 1] = words[i] & 0xff;
  }
  return bytes;
}

function bytesToWords(bytes) {
  const words = new Uint16Array(bytes.length / 2);
  for (let i = 0; i < words.length; i++) {
    words[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  }
  return words;
}

function exportedFingerprints(state) {
  return { ...state.fingerprints };
}

function validateFingerprints(state, external) {
  const got = external?.fingerprints;
  if (!got || typeof got !== 'object' || Array.isArray(got)) {
    throw new Error('Playable Hibachi fingerprints are missing');
  }
  for (const [name, value] of Object.entries(state.fingerprints)) {
    if (got[name] !== value) throw new Error(`Playable Hibachi fingerprint ${name} does not match`);
  }
  if (Object.keys(got).length !== Object.keys(state.fingerprints).length) {
    throw new Error('Playable Hibachi fingerprints contain unknown fields');
  }
}

function validateSelectedGuns(values) {
  if (!Array.isArray(values) || values.length !== 2
      || values.some((gun) => gun !== -1 && !PLAYABLE_HIBACHI_GUN_IDS.includes(gun))) {
    throw new Error('Playable Hibachi selected guns are invalid');
  }
  return new Int8Array(values);
}

/** Detached browser/Node-safe replay seed for the private external owner. */
export function exportPlayableHibachiReplayState(state) {
  assertState(state);
  return {
    kind: PLAYABLE_HIBACHI_EXTERNAL_KIND,
    lifecycle: { ...state.lifecycle },
    ownedBulletsB64: encodeB64(state.ownedBullets),
    sidecars: state.sidecars.map((memory, index) => ({
      player: index + 1,
      b64: encodeB64(memory.snapshotBytes()),
    })),
    selectedGuns: [...state.selectedGuns],
    ordinaryPatternCursors: [...state.ordinaryPatternCursors],
    hyperPatternCursors: [...state.hyperPatternCursors],
    playerRuntime: state.players.map((player) => ({ ...player.runtime })),
    privatePaletteB64: encodeB64(wordsToBytes(state.privatePaletteWords)),
    fingerprints: exportedFingerprints(state),
  };
}

function validateLifecycle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Playable Hibachi lifecycle is invalid');
  }
  for (const key of ['bound', 'pending', 'launchEligible', 'active', 'credited']) {
    if (typeof value[key] !== 'boolean') throw new Error(`Playable Hibachi lifecycle ${key} is invalid`);
  }
  if (!Number.isSafeInteger(value.generation) || value.generation < 0) {
    throw new Error('Playable Hibachi lifecycle generation is invalid');
  }
  return {
    bound: value.bound,
    pending: value.pending,
    launchEligible: value.launchEligible,
    active: value.active,
    credited: value.credited,
    generation: value.generation,
  };
}

function validatePatternCursors(values, label, first, last) {
  if (!Array.isArray(values) || values.length !== 2
      || values.some((cursor) => !Number.isInteger(cursor)
        || cursor < first || cursor > last)) {
    throw new Error(`Playable Hibachi ${label} pattern cursors are invalid`);
  }
  return Uint8Array.from(values);
}

function validatePlayerRuntime(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Playable Hibachi P${index + 1} runtime is invalid`);
  }
  const descriptorId = value.descriptorId;
  if (!Number.isInteger(descriptorId)
      || descriptorId < -1 || descriptorId >= PLAYABLE_HIBACHI_DESCRIPTORS.length) {
    throw new Error(`Playable Hibachi P${index + 1} runtime descriptorId is invalid`);
  }
  const gun = value.gun;
  if (gun !== -1 && !PLAYABLE_HIBACHI_GUN_IDS.includes(gun)) {
    throw new Error(`Playable Hibachi P${index + 1} runtime gun is invalid`);
  }
  for (const key of ['bodyInitialized', 'initialized', 'retired', 'live',
    'presentationStarted', 'launchActive']) {
    if (typeof value[key] !== 'boolean') {
      throw new Error(`Playable Hibachi P${index + 1} runtime ${key} is invalid`);
    }
  }
  for (const key of ['launchY', 'launchX']) {
    if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 0xffff) {
      throw new Error(`Playable Hibachi P${index + 1} runtime ${key} is invalid`);
    }
  }
  for (const key of ['lifeIdentity', 'frames', 'presentationFrames']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) {
      throw new Error(`Playable Hibachi P${index + 1} runtime ${key} is invalid`);
    }
  }
  return {
    bodyInitialized: value.bodyInitialized,
    initialized: value.initialized,
    retired: value.retired,
    live: value.live,
    lifeIdentity: value.lifeIdentity,
    descriptorId,
    gun,
    frames: value.frames,
    presentationFrames: value.presentationFrames,
    presentationStarted: value.presentationStarted,
    launchActive: value.launchActive,
    launchY: value.launchY,
    launchX: value.launchX,
  };
}

function validateDescriptorTelemetry(runtime, selectedGuns,
  ordinaryPatternCursors, hyperPatternCursors) {
  for (let i = 0; i < runtime.length; i++) {
    const current = runtime[i];
    if (current.descriptorId === -1) {
      if (current.gun !== -1 || selectedGuns[i] !== -1) {
        throw new Error(`Playable Hibachi P${i + 1} inactive descriptor telemetry does not match`);
      }
      continue;
    }
    const descriptor = PLAYABLE_HIBACHI_DESCRIPTORS[current.descriptorId];
    if (current.gun !== descriptor.gun || selectedGuns[i] !== descriptor.gun) {
      throw new Error(`Playable Hibachi P${i + 1} descriptor gun telemetry does not match`);
    }
    const cursor = descriptor.bank === 'ordinary'
      ? ordinaryPatternCursors[i] : hyperPatternCursors[i];
    if (cursor !== descriptor.pattern) {
      throw new Error(`Playable Hibachi P${i + 1} active pattern cursor does not match`);
    }
  }
}

/** Validate fully before mutating a candidate state's visible Game owner. */
export function importPlayableHibachiReplayState(state, external) {
  assertState(state);
  if (!external || external.kind !== PLAYABLE_HIBACHI_EXTERNAL_KIND) {
    throw new Error(`Playable Hibachi external kind must be ${PLAYABLE_HIBACHI_EXTERNAL_KIND}`);
  }
  validateFingerprints(state, external);
  const lifecycle = validateLifecycle(external.lifecycle);
  if (!Array.isArray(external.sidecars) || external.sidecars.length !== 2) {
    throw new Error('Playable Hibachi replay must contain two sidecars');
  }
  const sidecars = external.sidecars.map((entry, index) => {
    if (entry?.player !== index + 1) {
      throw new Error(`Playable Hibachi sidecar ${index} has the wrong player`);
    }
    const bytes = decodeB64(entry.b64, `Playable Hibachi P${index + 1} sidecar`);
    if (bytes.length !== PLAYABLE_HIBACHI_SIDECAR_BYTES) {
      throw new Error(`Playable Hibachi P${index + 1} sidecar has ${bytes.length} bytes`);
    }
    return bytes;
  });
  const ownedBullets = decodeB64(external.ownedBulletsB64, 'Playable Hibachi bullet owners');
  if (ownedBullets.length !== PLAYABLE_HIBACHI_BULLET_SLOTS) {
    throw new Error(`Playable Hibachi bullet owners have ${ownedBullets.length} bytes`);
  }
  if (ownedBullets.some((owner) => owner > 2)) {
    throw new Error('Playable Hibachi bullet owner is outside 0 through 2');
  }
  const selectedGuns = validateSelectedGuns(external.selectedGuns);
  const ordinaryPatternCursors = validatePatternCursors(
    external.ordinaryPatternCursors, 'ordinary', 5, 20,
  );
  const hyperPatternCursors = validatePatternCursors(
    external.hyperPatternCursors, 'hyper', 1, 4,
  );
  if (!Array.isArray(external.playerRuntime) || external.playerRuntime.length !== 2) {
    throw new Error('Playable Hibachi replay must contain two player runtimes');
  }
  const runtime = external.playerRuntime.map(validatePlayerRuntime);
  validateDescriptorTelemetry(
    runtime, selectedGuns, ordinaryPatternCursors, hyperPatternCursors,
  );
  const paletteBytes = decodeB64(external.privatePaletteB64, 'Playable Hibachi private palette');
  if (paletteBytes.length !== state.privatePaletteWords.length * 2) {
    throw new Error(`Playable Hibachi private palette has ${paletteBytes.length} bytes`);
  }
  const paletteWords = bytesToWords(paletteBytes);

  for (let i = 0; i < 2; i++) {
    state.sidecars[i].restoreBytes(sidecars[i]);
    Object.assign(state.players[i].runtime, runtime[i]);
  }
  state.ownedBullets.set(ownedBullets);
  state.selectedGuns.set(selectedGuns);
  state.ordinaryPatternCursors.set(ordinaryPatternCursors);
  state.hyperPatternCursors.set(hyperPatternCursors);
  state.privatePaletteWords.set(paletteWords);
  state.paletteReady = true;
  state.virtualRequests.length = 0;
  state.paletteLeases.length = 0;
  Object.assign(state.lifecycle, lifecycle);
  return state;
}

export function collectPlayableHibachiSpriteRequests(state, game) {
  assertBoundGame(state, game);
  state.virtualRequests.length = 0;
  if (!state.lifecycle.active
      && !state.players.some((player) => player.runtime.launchActive)) {
    return state.virtualRequests;
  }
  for (let playerIdx = 0; playerIdx < 2; playerIdx++) {
    const rec = playerIdx === 0 ? RAM.player1 : RAM.player2;
    const runtime = state.players[playerIdx].runtime;
    if (state.lifecycle.active && (game.ram.u16(rec) & TYPEBIT_ALIVE) !== 0) {
      runtime.launchActive = false;
      collectPlayerSmallForm(state, state.players[playerIdx], game,
        game.ram.u16(rec + P.posY), game.ram.u16(rec + P.posX));
    } else if (runtime.launchActive) {
      collectPlayerSmallForm(state, state.players[playerIdx], game,
        runtime.launchY, runtime.launchX);
    }
  }
  return state.virtualRequests;
}
