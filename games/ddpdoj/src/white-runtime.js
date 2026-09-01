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

/** Join the independently gated frontend and Stage 1 player handler islands. */
export function createWhiteStage1Handlers(rom, profileRequest) {
  return new Map([
    ...createWhiteFrontendHandlers(rom, profileRequest),
    ...createWhiteStage1PlayerHandlers(rom, profileRequest),
  ]);
}
