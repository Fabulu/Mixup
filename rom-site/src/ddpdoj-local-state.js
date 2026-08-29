export function localReplayTables(tables) {
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
    throw new TypeError('Local replay tables must be an object.');
  }
  const { rom: cartridgeWindows, ...portable } = tables;
  void cartridgeWindows;
  return portable;
}

function sameReplayTableValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameReplayTableValue(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(right, key)
      && sameReplayTableValue(left[key], right[key]));
}

function replayTableObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function localReplayTablesMatch(left, right) {
  const replay = localReplayTables(left);
  const trusted = localReplayTables(right);
  for (const key of ['set', 'build', 'image_sha256']) {
    if (!Object.is(replay[key], trusted[key])) return false;
  }
  if (!sameReplayTableValue(replay.dirTable?.bytes, trusted.dirTable?.bytes)
      || !sameReplayTableValue(replay.foldTable?.words, trusted.foldTable?.words)
      || !Object.is(replay.speed?.levels, trusted.speed?.levels)
      || !Object.is(replay.speed?.quadEntries, trusted.speed?.quadEntries)) {
    return false;
  }

  const exported = replay.speed?.exported;
  const replayQuads = replay.speed?.quads;
  const trustedQuads = trusted.speed?.quads;
  if (!Array.isArray(exported) || !replayTableObject(replayQuads)
      || !replayTableObject(trustedQuads)) {
    return false;
  }
  const levels = new Set();
  for (const level of exported) {
    if (!Number.isSafeInteger(level) || level < 0 || level >= trusted.speed.levels
        || levels.has(level)) {
      return false;
    }
    levels.add(level);
    if (!sameReplayTableValue(replayQuads[String(level)], trustedQuads[String(level)])) {
      return false;
    }
  }
  if (Object.keys(replayQuads).length !== levels.size
      || Object.keys(replayQuads).some((key) => !levels.has(Number(key)))) {
    return false;
  }
  for (let level = 0; level < 32; level++) {
    if (!levels.has(level)) return false;
  }

  const replayAnim = replay.anim;
  const trustedAnim = trusted.anim;
  if (!Object.is(replayAnim?.tiltMin, trustedAnim?.tiltMin)
      || !Object.is(replayAnim?.tiltStep, trustedAnim?.tiltStep)
      || !sameReplayTableValue(replayAnim?.a?.shipSel0, trustedAnim?.a?.shipSel0)) {
    return false;
  }
  if (Object.hasOwn(replayAnim.a, 'shipSel2')
      && !sameReplayTableValue(replayAnim.a.shipSel2, trustedAnim?.a?.shipSel2)) {
    return false;
  }
  const replayHitX = replayAnim?.hitX?.shipSel0 ?? replayAnim?.b?.shipSel0;
  const trustedHitX = trustedAnim?.hitX?.shipSel0 ?? trustedAnim?.b?.shipSel0;
  if (!sameReplayTableValue(replayHitX, trustedHitX)) return false;

  if (!replayTableObject(replay.gov) || !replayTableObject(trusted.gov)) return false;
  return Object.keys(trusted.gov).every((key) =>
    sameReplayTableValue(replay.gov[key]?.words, trusted.gov[key]?.words));
}

export function localReplaySeedArm(seed, ram, semaphoreOffset) {
  const ramArm = ram?.[semaphoreOffset];
  const explicit = Boolean(seed) && Object.hasOwn(seed, 'arm');
  const arm = explicit
    ? seed.arm
    : (Number.isSafeInteger(ramArm) && ramArm > 0 ? ramArm : 1);
  if (!Number.isSafeInteger(arm) || arm < 0 || arm > 0xff) {
    throw new Error('Replay seed arm must be an integer from 0 through 255.');
  }
  if (explicit && ramArm !== arm) {
    throw new Error(`Replay seed arm ${arm} does not match its RAM semaphore ${String(ramArm)}.`);
  }
  return arm;
}

export function authenticP2Joined(playerCountM1, formationState = null) {
  return !formationState && playerCountM1 === 1;
}

export function latchAuthenticP2Joined(joined, playerCountM1,
  formationState = null) {
  return Boolean(joined)
    || authenticP2Joined(playerCountM1, formationState);
}
