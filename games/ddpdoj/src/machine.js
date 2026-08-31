// The machine and measured Black Label compatibility addresses.
//
// The authoritative edition data lives in profiles.js. Existing runtime modules
// import these mutable plain-object views, so this facade deliberately projects
// fresh compatibility objects instead of exposing the frozen profile internals.
// Their keys, order, values, descriptors, and Build B meaning stay unchanged.
//
// Build B = 2002.10.07 BLACK VER. Build A = 2002.04.05 MASTER. The two
// embedded games share the main-RAM layout but no program address. A Version B
// run intentionally executes the measured Build A interrupt chain, represented
// by the isr6 fields in the Black profile.

import { BLACK_LABEL_PROFILE } from './profiles.js';

function compatibilityView(source) {
  if (Array.isArray(source)) return source.map(compatibilityView);
  if (source && typeof source === 'object') {
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => [key, compatibilityView(value)]),
    );
  }
  return source;
}

export const MACHINE = compatibilityView({
  set: BLACK_LABEL_PROFILE.revisionIdentity.set,
  build: BLACK_LABEL_PROFILE.revisionIdentity.build,
  ...BLACK_LABEL_PROFILE.ramLayout.machine,
});
export const RAM = compatibilityView(BLACK_LABEL_PROFILE.ramLayout.addresses);
export const P = compatibilityView(BLACK_LABEL_PROFILE.ramLayout.playerFields);
export const OPT = compatibilityView(BLACK_LABEL_PROFILE.ramLayout.optionFields);
export const ROM = compatibilityView(BLACK_LABEL_PROFILE.codeLandmarks);
export const CLAMP = compatibilityView(BLACK_LABEL_PROFILE.selectorProfile.clamp);
export const BIT = compatibilityView(BLACK_LABEL_PROFILE.bootProfile.inputBits);
