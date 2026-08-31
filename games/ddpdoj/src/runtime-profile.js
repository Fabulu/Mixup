import { BLACK_LABEL_PROFILE, resolveGameProfile } from './profiles.js';

// Executable capabilities are deliberately separate from trusted profile data.
// Registering measured edition data must never make the existing Black runtime
// execute it. A profile becomes runnable only when this exact-object map gains
// an independently audited binding.
const BLACK_CAPABILITIES = Object.freeze({
  game: 'ddpdoj.runtime.black-label-b.game.v1',
  authenticSelector: 'ddpdoj.runtime.black-label-b.selector.v1',
  localRom: 'ddpdoj.runtime.black-label-b.local-rom.v1',
  legacyReplay: 'ddpdoj.runtime.black-label-b.replay-v1-v2',
  legacyCheckpoint: 'ddpdoj.runtime.black-label-b.checkpoint-v2',
  legacyBundle: 'ddpdoj.runtime.black-label-b.bundle-v1',
});

export const BLACK_RUNTIME_BINDING = Object.freeze({
  id: 'ddpdoj.runtime/black-label/b/v1',
  profile: BLACK_LABEL_PROFILE,
  capabilities: BLACK_CAPABILITIES,
});

const EXECUTABLE_RUNTIMES = new Map([
  [BLACK_LABEL_PROFILE, BLACK_RUNTIME_BINDING],
]);

/** Resolve an executable binding only for the exact trusted profile object. */
export function resolveGameRuntime(profile) {
  const runtime = EXECUTABLE_RUNTIMES.get(profile);
  if (!runtime) {
    throw new RangeError('DaiOuJou edition profile has no executable runtime');
  }
  return runtime;
}

/** Resolve a trusted profile and its independent executable binding together. */
export function resolveRuntimeProfile(request) {
  const profile = resolveGameProfile(request);
  return Object.freeze({ profile, runtime: resolveGameRuntime(profile) });
}

/** Require one exact capability before entering edition-specific code. */
export function requireRuntimeCapability(runtime, capability, operation) {
  const expected = BLACK_RUNTIME_BINDING.capabilities[capability];
  if (runtime !== BLACK_RUNTIME_BINDING || expected == null
      || runtime.capabilities[capability] !== expected) {
    throw new RangeError(`${operation} is unavailable for this DaiOuJou edition runtime`);
  }
  return runtime;
}
