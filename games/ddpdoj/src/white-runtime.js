// Capability-gated object handlers for the embedded Version A frontend.

import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import {
  requireRuntimeCapability, resolveGameRuntime,
} from './runtime-profile.js';
import {
  whiteFrontendTick159BBC, whiteVersionChooserTick13BEEA,
} from './white-frontend.js';
import {
  whitePlayerP1Tick14889E, whitePlayerP2Tick14891E,
} from './white-player.js';
import { whiteRankTick15FAE8 } from './white-rank.js';
import { whiteSelectorTick15BE3E } from './white-selector.js';
import { createWhiteStage1ShotHandlers as createWhiteShotIslandHandlers } from './white-shots.js';
import { createWhiteStage1CombatHandlers as createWhiteCombatIslandHandlers } from './white-options.js';
import {
  createWhiteStage1HyperHudHandlers as createWhiteHyperHudIslandHandlers,
  redrawWhiteHyperStock185A14,
} from './white-hyper-hud.js';
import { installWhiteButton2Callbacks } from './white-button2.js';

function requireWhiteFrontendRuntime(profileRequest, operation) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'frontendBootstrap', operation);
  return profile;
}

function assertRom(rom) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function') {
    throw new TypeError('White Label frontend handlers need the embedded cartridge image');
  }
}

function assertPlayerRom(rom) {
  if (!rom || typeof rom.u8 !== 'function' || typeof rom.u16 !== 'function'
      || typeof rom.u32 !== 'function') {
    throw new TypeError('White Label Stage 1 player handlers need the embedded cartridge image');
  }
}

/** Build the private Version A handler set for types `$14`, 8, 9, and `$0A`. */
export function createWhiteFrontendHandlers(rom, profileRequest) {
  const profile = requireWhiteFrontendRuntime(
    profileRequest, 'White Label frontend handler map',
  );
  assertRom(rom);
  return new Map([
    [0x14, (ram, slot, _slotIndex, ctx) =>
      whiteVersionChooserTick13BEEA(ram, rom, slot, ctx, profile)],
    [0x08, (ram, slot, _slotIndex, ctx) =>
      whiteFrontendTick159BBC(ram, rom, slot, ctx, profile)],
    [0x09, (ram, slot, _slotIndex, ctx) =>
      whiteSelectorTick15BE3E(ram, rom, slot, ctx, profile)],
    [0x0a, (ram, slot, _slotIndex, ctx) =>
      whiteRankTick15FAE8(ram, rom, slot, ctx, profile)],
  ]);
}

/** Build the private Version A Stage 1 owner set for native types 2 and 3. */
export function createWhiteStage1PlayerHandlers(rom, profileRequest) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const runtime = resolveGameRuntime(profile);
  requireRuntimeCapability(runtime, 'stage1Players', 'White Label Stage 1 player handler map');
  assertPlayerRom(rom);
  return new Map([
    [0x02, (ram, slot, _slotIndex, ctx) =>
      whitePlayerP1Tick14889E(ram, rom, slot, ctx, profile)],
    [0x03, (ram, slot, _slotIndex, ctx) =>
      whitePlayerP2Tick14891E(ram, rom, slot, ctx, profile)],
  ]);
}

/** Build the separately gated Version A Stage 1 shot island for native type 5. */
export function createWhiteStage1ShotHandlers(rom, profileRequest) {
  return createWhiteShotIslandHandlers(rom, profileRequest);
}

/** Build the explicit Version A Stage 1 options and ordinary-laser type-5 island. */
export function createWhiteStage1CombatHandlers(rom, profileRequest) {
  return createWhiteCombatIslandHandlers(rom, profileRequest);
}

/** Build the separately gated Version A Stage 1 type-0 hyper HUD island. */
export function createWhiteStage1HyperHudHandlers(rom, profileRequest) {
  return createWhiteHyperHudIslandHandlers(rom, profileRequest);
}

/** Join the independently gated frontend, player, shot, and HUD handler islands. */
export function createWhiteStage1Handlers(rom, profileRequest) {
  const profile = resolveGameProfile(profileRequest === undefined
    ? WHITE_LABEL_PROFILE
    : profileRequest);
  const frontend = createWhiteFrontendHandlers(rom, profile);
  const gameplay = new Map([
    ...createWhiteStage1PlayerHandlers(rom, profile),
    ...createWhiteStage1CombatHandlers(rom, profile),
    ...createWhiteStage1HyperHudHandlers(rom, profile),
  ]);
  const wrappedGameplay = new Map([...gameplay].map(([type, handler]) => [
    type,
    (ram, slot, slotIndex, ctx) => {
      const runtimeContext = installWhiteButton2Callbacks(
        ctx ?? {}, rom, profile, redrawWhiteHyperStock185A14,
      );
      return handler(ram, slot, slotIndex, runtimeContext);
    },
  ]));
  return new Map([...frontend, ...wrappedGameplay]);
}
