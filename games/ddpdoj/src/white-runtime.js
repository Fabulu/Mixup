// Capability-gated object handlers for the embedded Version A frontend.

import { resolveGameProfile, WHITE_LABEL_PROFILE } from './profiles.js';
import {
  requireRuntimeCapability, resolveGameRuntime,
} from './runtime-profile.js';
import {
  whiteFrontendTick159BBC, whiteVersionChooserTick13BEEA,
} from './white-frontend.js';
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
