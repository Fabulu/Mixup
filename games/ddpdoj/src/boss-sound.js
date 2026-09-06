// Maps edition-native boss sound wrapper identities onto the runtime sound API.

export function postBossSound(ctx, resources, nativeAddress) {
  const requests = resources?.sound?.requestMap?.[nativeAddress];
  if (!Array.isArray(requests)) {
    throw new TypeError(
      `unmapped boss sound address $${(nativeAddress >>> 0).toString(16).toUpperCase()}`
    );
  }
  for (const request of requests) ctx.soundPost?.(request);
}
