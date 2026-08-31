// Stable external state for the Playable Hibachi mod.

import { BUL, REC as BULLET_REC } from './bullets.js';
import { DMG } from './damage.js';
import { loadRecordProto, loadSubProto } from './enemyproto.js';
import {
  gun0Init2A738A, gun0Step2A7400,
  gun1Init2A7850, gun1Step2A78D0,
  gun2Init2A7AB2, gun2Step2A7B20,
  gun3Init2A7E64, gun3Step2A7E96,
  gun5Init2A81BC, gun5Step2A8206,
  gun6Init2A8370, gun6Step2A8396,
  gun7Init2A8516, gun7Step2A8538,
  gun8Init2A8800, gun8Step2A883A,
} from './hibachiguns.js';
import { MACHINE, P, RAM } from './machine.js';
import { deriveProfileContext } from './profiles.js';
import { i16, u16 } from './ram.js';
import { StrictSidecarMemory } from './sidecarmemory.js';
import { encodeRegisterRequest, NAMED_BUCKETS } from './spritequeue.js';

export const PLAYABLE_HIBACHI_CONFLICT = 'Formation cannot be combined with Playable Hibachi';
export const PLAYABLE_HIBACHI_EXTERNAL_KIND = 'ddpdoj.playable-hibachi/v1';
export const PLAYABLE_HIBACHI_SIDECAR_BYTES = 0x276;
export const PLAYABLE_HIBACHI_BULLET_SLOTS = 210;
export const PLAYABLE_HIBACHI_GUN_IDS = Object.freeze([0, 1, 2, 3, 5, 6, 7, 8]);
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
    gun: -1,
    frames: 0,
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
    gunIds: PLAYABLE_HIBACHI_GUN_IDS.join(','),
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
    privatePaletteWords: new Uint16Array(PLAYABLE_HIBACHI_PALETTE_BANKS.length * 32),
    paletteReady: false,
    paletteLeases: [],
    fingerprints: fingerprintObject(),
    virtualRequests: [],
    lifecycle: {
      bound: false,
      pending: true,
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

function resetPlayer(player) {
  player.bytes.fill(0);
  Object.assign(player.runtime, {
    bodyInitialized: false,
    initialized: false,
    retired: false,
    live: false,
    lifeIdentity: 0,
    gun: -1,
    frames: 0,
  });
}

/** Clear one run without replacing any object, array, or typed-array owner. */
export function resetPlayableHibachiStateInPlace(state) {
  assertState(state);
  state.ownedBullets.fill(0);
  state.selectedGuns.fill(-1);
  for (const player of state.players) resetPlayer(player);
  clearRequestArray(state.virtualRequests);
  state.paletteLeases.length = 0;
  state.lifecycle.active = false;
  state.lifecycle.credited = false;
  return state;
}

/** Ignore demo handoffs and activate only a credited ordinary run. */
export function beginPlayableHibachiCreditedRun(state, game, event = {}) {
  assertBoundGame(state, game);
  resetPlayableHibachiStateInPlace(state);
  const credited = event.demo !== true;
  state.lifecycle.pending = !credited;
  state.lifecycle.credited = credited;
  state.lifecycle.active = credited;
  if (credited) state.lifecycle.generation++;
  return credited;
}

export function endPlayableHibachiRun(state, game) {
  assertBoundGame(state, game);
  resetPlayableHibachiStateInPlace(state);
  state.lifecycle.pending = true;
  return state;
}

const GUN_PAIRS = Object.freeze({
  0: Object.freeze([gun0Init2A738A, gun0Step2A7400]),
  1: Object.freeze([gun1Init2A7850, gun1Step2A78D0]),
  2: Object.freeze([gun2Init2A7AB2, gun2Step2A7B20]),
  3: Object.freeze([gun3Init2A7E64, gun3Step2A7E96]),
  5: Object.freeze([gun5Init2A81BC, gun5Step2A8206]),
  6: Object.freeze([gun6Init2A8370, gun6Step2A8396]),
  7: Object.freeze([gun7Init2A8516, gun7Step2A8538]),
  8: Object.freeze([gun8Init2A8800, gun8Step2A883A]),
});

const GUN_SELECTOR = Object.freeze([0, 1, 3, 2]);
const HYPER_ACTIVE = Object.freeze([0x81b63e, 0x81b640]);
const HIBACHI_BODY_RECORD_PROTO = 0x2a443c;
const HIBACHI_BODY_SUB_PROTO = 0x2a4446;
const HIBACHI_BODY_SUB_RECORDS = 16;
const FIRST_FORM_PART_ORDER = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);
const FIRST_FORM_PART_POSITIONS = Object.freeze([
  Object.freeze([0x020, 0x14c0, 0xf180]),
  Object.freeze([0x040, 0xfb00, 0xee40]),
  Object.freeze([0x060, 0xe880, 0xeec0]),
  Object.freeze([0x080, 0x0740, 0x1040]),
  Object.freeze([0x0a0, 0xf780, 0x14c0]),
  Object.freeze([0x0c0, 0xe540, 0x1040]),
]);
const FIRST_FORM_SHARED_ART = 0x2a49f6;
const FIRST_FORM_OBJECT0_ART = 0x2a4774;
const FIRST_FORM_OBJECT1_ART = 0x00116768;
const FIRST_FORM_OBJECT2_ART = 0x00101728;
const FIRST_FORM_OBJECT9_ART = 0x2a4b40;
const FIRST_FORM_BUCKET = NAMED_BUCKETS.player;
const FIRST_FORM_FLIP = 0x6000;

function bulletSlot(address) {
  const delta = address - BUL.pool;
  return delta >= 0 && delta % BUL.stride === 0 ? delta / BUL.stride : -1;
}

export function clearPlayableHibachiBulletOnSpawn(state, event) {
  assertState(state);
  if (Number.isInteger(event?.slot)
      && event.slot >= 0 && event.slot < state.ownedBullets.length) {
    state.ownedBullets[event.slot] = 0;
  }
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

function pointOverlapsEnemy(ram, bullet, enemy) {
  const y = ram.u16(bullet + BULLET_REC.posA);
  const x = ram.u16(bullet + BULLET_REC.posB);
  const enemyY = ram.u16(enemy + 0x02);
  const enemyX = ram.u16(enemy + 0x04);
  const maxY = u16(enemyY + ram.u16(enemy + 0x10));
  const minY = u16(enemyY - ram.u16(enemy + 0x12));
  const maxX = u16(enemyX + ram.u16(enemy + 0x14));
  const minX = u16(enemyX - ram.u16(enemy + 0x16));
  return y >= minY && y <= maxY && x >= minX && x <= maxX && minY < 0x9700;
}

/** Apply one cartridge HP of friendly bullet damage after native damage passes. */
export function runPlayableHibachiDamage(state, game) {
  assertBoundGame(state, game);
  if (!state.lifecycle.active) return 0;
  const ram = game.ram;
  let hits = 0;
  for (let slot = 0; slot < state.ownedBullets.length; slot++) {
    const owner = state.ownedBullets[slot];
    if (owner === 0) continue;
    const bullet = BUL.pool + slot * BUL.stride;
    if ((ram.u16(bullet) & 0x9000) !== TYPEBIT_ALIVE) continue;
    for (let enemySlot = 0; enemySlot < 150; enemySlot++) {
      const enemy = DMG.poolA + enemySlot * DMG.enemyStride;
      const type = ram.u16(enemy);
      if ((type & 0xa000) !== 0xa000 || i16(ram.u16(enemy + 0x18)) < 0
          || !pointOverlapsEnemy(ram, bullet, enemy)) continue;
      ram.setU16(enemy, u16(type | (owner === 1 ? DMG.maskP1 : DMG.maskP2)));
      ram.setU16(enemy + 0x18, u16(ram.u16(enemy + 0x18) - 1));
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
    ram.setU16(entry.addr + BULLET_REC.posA,
      u16(ownerY * 2 - ram.u16(entry.addr + BULLET_REC.posA)));
    ram.setU16(entry.addr + BULLET_REC.posB,
      u16(ownerX * 2 - ram.u16(entry.addr + BULLET_REC.posB)));
  });
}

function selectedGun(ram, rec, playerIdx) {
  const held = ram.u8(rec + P.dirByte);
  const input = ((held & 0x10) !== 0 ? 1 : 0) | ((held & 0x40) !== 0 ? 2 : 0);
  const normal = GUN_SELECTOR[input];
  return ram.u16(HYPER_ACTIVE[playerIdx]) === 0 ? normal : normal + 5;
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
    if (runtime.live) resetPlayer(player);
    return false;
  }
  if (!runtime.live) {
    runtime.live = true;
    runtime.lifeIdentity++;
  }

  updatePrivateBody(player, ram, rec, ctx.rom);
  const target = updateReflectedTarget(player, ram, rec);
  const gun = selectedGun(ram, rec, playerIdx);
  const [init, step] = GUN_PAIRS[gun];
  if (runtime.gun !== gun || runtime.retired) {
    for (let offset = 0; offset < 0x020; offset++) {
      player.memory.setU8(player.layout.gun + offset, 0);
    }
    runtime.gun = gun;
    runtime.initialized = false;
    runtime.retired = false;
  }
  state.selectedGuns[playerIdx] = gun;
  if (!runtime.initialized) {
    init(player.memory, ctx.rom, player.layout.gun, player.layout.parts);
    runtime.initialized = true;
    runtime.frames = 0;
    return true;
  }

  const privateCtx = deriveProfileContext(ctx, {
    privateTargetRecord: target,
    privateA1StopHook: (script) => {
      if (script !== gun) return false;
      runtime.retired = true;
      return true;
    },
    bulletSpawn: (site, result, callRegs, entry) => {
      ctx.bulletSpawn?.(site, result, callRegs, entry);
      claimSpawnedBullets(state, player, ram, rec, result);
    },
  });
  step(player.memory, ctx.rom, privateCtx,
    player.layout.gun, player.layout.body, player.layout.parts);
  runtime.frames++;
  return true;
}

function packD1(y, x) {
  return (((y & 0xffff) << 16) | (x & 0xffff)) >>> 0;
}

function reflectD1(ownerY, ownerX, source) {
  return packD1(
    u16(ownerY * 2 - (source >>> 16)),
    u16(ownerX * 2 - (source & 0xffff)),
  );
}

function privatePaletteIndex(nativeBank) {
  const index = PLAYABLE_HIBACHI_PALETTE_BANKS.indexOf(nativeBank);
  if (index < 0) {
    throw new Error(`Playable Hibachi palette bank $${nativeBank.toString(16)} is not private`);
  }
  return index;
}

function pushFirstFormRequest(requests, ownerY, ownerX,
    source, art, dimensions, nativePalette) {
  requests.push({
    bucket: FIRST_FORM_BUCKET,
    bytes: encodeRegisterRequest(
      reflectD1(ownerY, ownerX, source), art, dimensions,
      u16(nativePalette | FIRST_FORM_FLIP),
    ),
    privatePaletteBank: privatePaletteIndex(nativePalette & 0xff),
  });
}

function collectPlayerFirstForm(state, player, game, rec) {
  const ram = game.ram;
  const memory = player.memory;
  const parts = player.layout.parts;
  const ownerY = ram.u16(rec + P.posY);
  const ownerX = ram.u16(rec + P.posX);
  updatePrivateBody(player, ram, rec, game.rom);

  const rootAngle = memory.u8(parts + 0x13d);
  const rootDy = game.tables.shotVector(0x1a, rootAngle).dy;
  let source = packD1(u16(ownerY + rootDy), ownerX);
  source = (source + 0xe6000000 + 0xea00f200) >>> 0;
  const rootFrame = ((player.runtime.frames >>> 3) % 6) * 4;
  pushFirstFormRequest(state.virtualRequests, ownerY, ownerX, source,
    game.rom.u32(FIRST_FORM_OBJECT0_ART + rootFrame), 0x1670,
    memory.u8(parts + 0xe8));

  const lowerDy = game.tables.shotVector(
    memory.u8(parts + 0x1a), memory.u8(parts + 0x1b),
  ).dy;
  memory.setU16(parts + 0x1fa, u16(lowerDy));
  source = packD1(u16(ownerY + lowerDy), ownerX);
  source = (source + 0xfc000000 + 0xe000dc00) >>> 0;
  pushFirstFormRequest(state.virtualRequests, ownerY, ownerX, source,
    FIRST_FORM_OBJECT1_ART, 0x2120, memory.u8(parts + 0xe7));

  source = packD1(u16(ownerY + rootDy), ownerX);
  source = (source + 0xd0000000 + 0xf400f900) >>> 0;
  pushFirstFormRequest(state.virtualRequests, ownerY, ownerX, source,
    FIRST_FORM_OBJECT2_ART, 0x0c38, memory.u8(parts + 0xe8));

  for (const offset of FIRST_FORM_PART_ORDER) {
    const record = parts + offset;
    const selector = i16(u16(memory.u16(record + 0x1a) * 4));
    source = packD1(
      u16(memory.u16(record + 0x02) + lowerDy),
      memory.u16(record + 0x04),
    );
    source = (source + memory.u32(record + 0x06)) >>> 0;
    const palette = (memory.u16(record + 0x1c) & 0xff00)
      | memory.u8(parts + 0xe9);
    pushFirstFormRequest(state.virtualRequests, ownerY, ownerX, source,
      game.rom.u32(FIRST_FORM_SHARED_ART + selector),
      memory.u16(record + 0x0e), palette);
  }

  const orbitDy = game.tables.shotVector(0x10, memory.u8(parts + 0x131)).dy;
  source = (packD1(u16(ownerY + orbitDy), ownerX) + 0xee00ec00) >>> 0;
  pushFirstFormRequest(state.virtualRequests, ownerY, ownerX, source,
    game.rom.u32(FIRST_FORM_OBJECT9_ART + i16(memory.u16(parts + 0x126))),
    0x12a0, memory.u8(parts + 0xe6));
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
  });
  return token;
}

export function restorePlayableHibachiRunaheadState(state, token) {
  const saved = RUNAHEAD_TOKENS.get(token);
  if (!saved) throw new TypeError('Unknown Playable Hibachi runahead checkpoint');
  if (saved.state !== state) throw new Error('Playable Hibachi checkpoint belongs to another state');
  if (saved.used) throw new Error('Playable Hibachi checkpoint was already restored');
  if (state.game !== saved.game || state.ramBinding !== saved.ramBinding
      || state.players !== saved.playersOwner || state.sidecars !== saved.sidecarsOwner
      || state.sidecarBytes !== saved.sidecarBytesOwner
      || state.ownedBullets !== saved.ownedBulletsOwner
      || state.selectedGuns !== saved.selectedGunsOwner
      || state.privatePaletteWords !== saved.privatePaletteOwner
      || state.paletteLeases !== saved.paletteLeasesOwner
      || state.virtualRequests !== saved.virtualRequestsOwner
      || state.fingerprints !== saved.fingerprintsOwner
      || state.lifecycle !== saved.lifecycleOwner) {
    throw new Error('Playable Hibachi external owner identity changed during runahead');
  }
  state.players.splice(0, state.players.length, ...saved.playerOwners);
  state.sidecars.splice(0, state.sidecars.length, ...saved.sidecarOwners);
  state.sidecarBytes.splice(0, state.sidecarBytes.length, ...saved.byteOwners);
  for (let i = 0; i < state.players.length; i++) {
    if (state.players[i].runtime !== saved.playerRuntimeOwners[i]
        || state.sidecars[i] !== state.players[i].memory
        || state.sidecarBytes[i] !== state.players[i].bytes) {
      throw new Error(`Playable Hibachi P${i + 1} owner identity changed during runahead`);
    }
    state.sidecars[i].restoreBytes(saved.sidecarBytes[i]);
    Object.assign(state.players[i].runtime, saved.playerRuntime[i]);
  }
  state.ownedBullets.set(saved.ownedBullets);
  state.selectedGuns.set(saved.selectedGuns);
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
    playerRuntime: state.players.map((player) => ({ ...player.runtime })),
    privatePaletteB64: encodeB64(wordsToBytes(state.privatePaletteWords)),
    fingerprints: exportedFingerprints(state),
  };
}

function validateLifecycle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Playable Hibachi lifecycle is invalid');
  }
  for (const key of ['bound', 'pending', 'active', 'credited']) {
    if (typeof value[key] !== 'boolean') throw new Error(`Playable Hibachi lifecycle ${key} is invalid`);
  }
  if (!Number.isSafeInteger(value.generation) || value.generation < 0) {
    throw new Error('Playable Hibachi lifecycle generation is invalid');
  }
  return {
    bound: value.bound,
    pending: value.pending,
    active: value.active,
    credited: value.credited,
    generation: value.generation,
  };
}

function validatePlayerRuntime(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Playable Hibachi P${index + 1} runtime is invalid`);
  }
  const gun = value.gun;
  if (gun !== -1 && !PLAYABLE_HIBACHI_GUN_IDS.includes(gun)) {
    throw new Error(`Playable Hibachi P${index + 1} runtime gun is invalid`);
  }
  for (const key of ['bodyInitialized', 'initialized', 'retired', 'live']) {
    if (typeof value[key] !== 'boolean') {
      throw new Error(`Playable Hibachi P${index + 1} runtime ${key} is invalid`);
    }
  }
  for (const key of ['lifeIdentity', 'frames']) {
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
    gun,
    frames: value.frames,
  };
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
  if (!Array.isArray(external.playerRuntime) || external.playerRuntime.length !== 2) {
    throw new Error('Playable Hibachi replay must contain two player runtimes');
  }
  const runtime = external.playerRuntime.map(validatePlayerRuntime);
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
  if (!state.lifecycle.active) return state.virtualRequests;
  for (let playerIdx = 0; playerIdx < 2; playerIdx++) {
    const rec = playerIdx === 0 ? RAM.player1 : RAM.player2;
    if ((game.ram.u16(rec) & TYPEBIT_ALIVE) === 0) continue;
    collectPlayerFirstForm(state, state.players[playerIdx], game, rec);
  }
  return state.virtualRequests;
}
