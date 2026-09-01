// Capability-gated Build A player-shot producer, lifecycle, and type-5 island.

import { asr, i16 } from './ram.js';
import {
  deriveProfileContext, resolveGameProfile, WHITE_LABEL_PROFILE,
} from './profiles.js';
import { requireRuntimeCapability, resolveGameRuntime } from './runtime-profile.js';
import {
  shotHandlersWithResources, spawnShotTypeBWithResources, spawnShotWithResources,
} from './shots.js';
import { runShotPool } from './weapons.js';
import {
  clearPoolWithResources, runSparkDriverWithResources,
} from './spark.js';
import { runNativeOutgoingShotCollision } from './damage.js';
import { enqueueShotSprite, enqueueZoomedRequest } from './spritequeue.js';
import { unreached } from './unported.js';

const SHOT_SPEEDS = Object.freeze([
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  60, 64, 68, 72, 76, 80, 84, 86, 88, 92, 94, 96,
  102, 104, 108, 110, 112, 116, 128, 134, 216, 232,
]);
const SHOT_SPEED_SET = new Set(SHOT_SPEEDS);

export const WHITE_SHOT = Object.freeze({
  type5: 0x18a0e4,
  recurring: 0x18a11c,
  shotDriverCall: 0x18a14c,
  sparkDriverCall: 0x18a164,
  collisionCall: 0x18a1ac,
  dispatchTable: 0x15309a,
  dispatchEntries: Object.freeze([
    0x1530da, 0x153254, 0x1533f0, 0x153512,
    0x153634, 0x153778, 0x1538bc, 0x1539e6,
    0x153196, 0x15330e, 0x153482, 0x1535a4,
    0x1536f2, 0x153836, 0x153960, 0x153a8a,
  ]),
  p1Pool: 0x810572,
  p2Pool: 0x810c32,
  p1Player: 0x8103e6,
  p2Player: 0x810448,
  slots: 36,
  stride: 0x30,
  liveCount: 0x81295c,
  scrollDelta: 0x813176,
  foldTable: 0x141e2e,
  typeBHitFlags: 0x153014,
  speedPointers: 0x100920,
  speedBase: 0x100d20,
  speedStride: 0x0208,
  speedEntries: 65,
  speedLevels: SHOT_SPEEDS,
  presentation: Object.freeze({ normal: 0x13f6fc, zoom: 0x13f77c }),
});

const WHITE_SOUND_REQUEST_MAP = Object.freeze({
  0x18aee0: 0x28c3ba,
  0x18aefa: 0x28c3d4,
  0x18af14: 0x28c3ee,
});

const freezeProducer = (ownerIndex, pool, countPointer, player) => Object.freeze({
  ownerIndex,
  pool,
  player,
  slots: WHITE_SHOT.slots,
  stride: WHITE_SHOT.stride,
  countPointer,
  gate308c: 0x81308c,
  primaryTable: 0x154aa6,
  secondaryTable: 0x154abe,
  typeBTable: 0x154ad6,
  ship0Sound: 0x18aee0,
  ship2Sound: 0x18aefa,
  hyperSound: 0x18af14,
  ship0Site: 0x1492a0,
  ship2Site: 0x1493d0,
  invalidSite: 0x149294,
  soundPolicy: 'mapped',
  soundRequestMap: WHITE_SOUND_REQUEST_MAP,
});

export const WHITE_SHOT_PRODUCER_RESOURCES = Object.freeze([
  freezeProducer(0, WHITE_SHOT.p1Pool, 0x8127e4, WHITE_SHOT.p1Player),
  freezeProducer(1, WHITE_SHOT.p2Pool, 0x8127ec, WHITE_SHOT.p2Player),
]);

export const WHITE_SPARK_RESOURCES = Object.freeze({
  p1Base: 0x81d394,
  p2Base: 0x81d790,
  stride: 0x22,
  perPlayer: 30,
  perPlayerNarrow: 15,
  slots: 60,
  count: 0x81db8c,
  budget: 0x81db8e,
  budgetReload: 0xd0,
  clearWords: 0x3fe,
  gateAlloc: 0x813098,
  gateWidth: 0x81308c,
  bucket: 20,
  emitTable: 0x188c7c,
  ptrTable: 0x1892c2,
  fillTable: 0x188d6e,
  kindSpark: 0x14,
  cullY: 0x7000,
  posShift: 6,
  p1PlayerRec: WHITE_SHOT.p1Player,
  signedRng: Object.freeze({ table: 0x14336a, entries: 256 }),
  speedRng: Object.freeze({ table: 0x143192, entries: 128 }),
  angleRng: Object.freeze({ table: 0x189736, entries: 64 }),
  allocatorSite: 0x188a90,
  allocatorFailureSite: 0x188a8a,
  poolFullSite: 0x188bb4,
  slotFillerSite: 0x188d16,
  shotFillTailSite: 0x188eda,
  driverSite: 0x188bd4,
  driverWalkSite: 0x188c36,
});

export const WHITE_SHOT_LIFECYCLE_RESOURCES = Object.freeze({
  gate308c: 0x81308c,
  hitRng: Object.freeze({ table: 0x143720, entries: 64 }),
  impactSound: 0x18b23a,
  impactSoundRequest: 0x28c714,
  sparkResources: WHITE_SPARK_RESOURCES,
  families: Object.freeze({
    0: Object.freeze({ normal: 0x14d48a, hit: 0x14d566 }),
    1: Object.freeze({ normal: 0x14dbc6, hit: 0x14dca2 }),
    4: Object.freeze({ normal: 0x14e326, hit: 0x14e402 }),
    5: Object.freeze({ normal: 0x14ea86, hit: 0x14eb62 }),
  }),
});

function whitePresentationSink(ram, rec, options) {
  if (options?.zoomFlags !== undefined) {
    return enqueueZoomedRequest(ram, rec, options.zoomFlags, 14);
  }
  return enqueueShotSprite(ram, rec);
}

const freezeDriver = (ownerIndex, pool, player) => Object.freeze({
  ownerIndex,
  pool,
  player,
  slots: WHITE_SHOT.slots,
  stride: WHITE_SHOT.stride,
  scrollDelta: WHITE_SHOT.scrollDelta,
  liveCounter: WHITE_SHOT.liveCount,
  presentationSink: whitePresentationSink,
  requestTelemetry: true,
  dispatchEntries: WHITE_SHOT.dispatchEntries,
  dispatchTable: WHITE_SHOT.dispatchTable,
});

export const WHITE_SHOT_DRIVER_RESOURCES = Object.freeze([
  freezeDriver(0, WHITE_SHOT.p1Pool, WHITE_SHOT.p1Player),
  freezeDriver(1, WHITE_SHOT.p2Pool, WHITE_SHOT.p2Player),
]);

function assertRom(rom) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function') {
    throw new TypeError('White Label Stage 1 shots need the embedded cartridge image');
  }
}

function requireWhiteShots(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'stage1Shots', operation);
  return profile;
}

export function createWhiteShotTables(rom) {
  assertRom(rom);
  return Object.freeze({
    shotVector(speedIndex, angleByte) {
      if (!SHOT_SPEED_SET.has(speedIndex)) {
        unreached(0x141d48,
          `Version A shot speed ${speedIndex} is outside the exact producer closure`);
      }
      const pointerAddress = WHITE_SHOT.speedPointers + speedIndex * 4;
      const pointer = rom.u32(pointerAddress);
      const expected = WHITE_SHOT.speedBase + speedIndex * WHITE_SHOT.speedStride;
      if (pointer !== expected) {
        unreached(0x141d3e,
          `Version A shot speed ${speedIndex} points to $${pointer.toString(16).toUpperCase()}`);
      }
      const angle = angleByte & 0xff;
      const folded = rom.u16(WHITE_SHOT.foldTable + angle * 2);
      if ((folded & 7) !== 0 || folded > (WHITE_SHOT.speedEntries - 1) * 8) {
        unreached(0x141d4a,
          `Version A shot fold offset $${folded.toString(16).toUpperCase()} escaped its quadrant`);
      }
      let dy = asr(rom.u32(pointer + folded), 4);
      let dx = asr(rom.u32(pointer + folded + 4), 4);
      const quadrant = angle & 0xc0;
      if (quadrant === 0x40) dy = -dy;
      else if (quadrant === 0x80) { dy = -dy; dx = -dx; }
      else if (quadrant === 0xc0) dx = -dx;
      return { dy: i16(dy), dx: i16(dx) };
    },
    typeBHitFlags(power) {
      if ((power & 1) !== 0 || power > 0x0a) {
        unreached(0x153044,
          `Version A Type-B shot power ${power} cannot index the six hit flags`);
      }
      return rom.u32(WHITE_SHOT.typeBHitFlags + power * 2);
    },
  });
}

/** Enter the exact Build A ship-0 or ship-2 producer for one native owner. */
export function spawnWhitePlayerShot(ram, rom, prec, ctx, ownerIndex, profileRequest) {
  requireWhiteShots(profileRequest, 'White Label Stage 1 shot producer');
  assertRom(rom);
  const resources = WHITE_SHOT_PRODUCER_RESOURCES[ownerIndex];
  if (!resources || resources.player !== prec) {
    throw new RangeError('White Label shot producer owner does not match its native player record');
  }
  const ship = ram.u16(prec + 0x58);
  if (ship === 0) return spawnShotWithResources(ram, rom, prec, ctx, resources);
  if (ship === 2) return spawnShotTypeBWithResources(ram, rom, prec, ctx, resources);
  unreached(resources.invalidSite,
    `the White Label shot ship selector ${ship} is outside {0, 2}`);
}

function tickWhiteShotIsland(ram, rom, slot, ctx, tables, handlers) {
  if (ram.u8(slot + 2) === 0) {
    clearPoolWithResources(ram, WHITE_SPARK_RESOURCES);
    ram.setU8(slot + 2, 1);
    return Object.freeze({ phase: 'reset', shotsProcessed: 0 });
  }

  const shotCtx = deriveProfileContext(ctx ?? {}, { tables });
  ram.setU16(WHITE_SHOT.liveCount, 0);
  let shotsProcessed = 0;
  for (const resources of WHITE_SHOT_DRIVER_RESOURCES) {
    shotsProcessed += runShotPool(ram, rom, handlers, shotCtx, resources);
  }
  const sparkFrame = runSparkDriverWithResources(ram, rom, shotCtx, WHITE_SPARK_RESOURCES);
  const collision = runNativeOutgoingShotCollision(ram, shotCtx);
  if (ctx != null) {
    ctx.shotsProcessed = shotsProcessed;
    ctx.sparkFrame = sparkFrame;
    ctx.whiteShotCollision = collision;
  }
  return Object.freeze({ phase: 'recurring', shotsProcessed, sparkFrame, collision });
}

/** `$18A0E4`: only the audited shot, spark, and outgoing-collision island. */
export function whiteType5ShotTick18A0E4(ram, rom, slot, ctx, profileRequest) {
  requireWhiteShots(profileRequest, 'White Label Stage 1 type-5 shot island');
  assertRom(rom);
  const tables = createWhiteShotTables(rom);
  const handlers = shotHandlersWithResources(
    WHITE_SHOT.dispatchEntries, WHITE_SHOT_LIFECYCLE_RESOURCES,
  );
  return tickWhiteShotIsland(ram, rom, slot, ctx, tables, handlers);
}

/** Build the independently gated White Stage 1 type-5 handler map. */
export function createWhiteStage1ShotHandlers(rom, profileRequest) {
  requireWhiteShots(profileRequest, 'White Label Stage 1 shot handler map');
  assertRom(rom);
  const tables = createWhiteShotTables(rom);
  const handlers = shotHandlersWithResources(
    WHITE_SHOT.dispatchEntries, WHITE_SHOT_LIFECYCLE_RESOURCES,
  );
  return new Map([
    [0x05, (ram, slot, _slotIndex, ctx) =>
      tickWhiteShotIsland(ram, rom, slot, ctx, tables, handlers)],
  ]);
}
