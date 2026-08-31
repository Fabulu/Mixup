import { resolveGameRuntime } from './runtime-profile.js';

export const RUNAHEAD_EXTERNAL_STATE = Symbol('ddpdoj.runaheadExternalState');

const ACTIVE = new WeakMap();
const TOKENS = new WeakMap();
const SNAPSHOT_POOL = new WeakMap();

const GAME_SCALARS = [
  'logicFrame',
  'videoFrame',
  'irq6Count',
  'releases',
  'objn',
  'armedVblanks',
  'coinPort',
  'bombHits',
  'beamHitsA',
  'beamHitsB',
  'beamErased',
  'beamDamageFrames',
  'bombDraws',
  'shotTableFull',
  'shotRequests',
];

const GAME_MAPS = [
  'allocEvents',
  'effectSpawns',
  'itemSpawns',
  'itemCollects',
  'hudEvents',
  'bombEvents',
  'shotSpawns',
];

const GAME_ARRAYS = [
  'scrollEvents',
  'wallHits',
  'stageEndEvents',
  'hudMarks',
  'bombMarks',
];

const FRAME_PROPERTIES = [
  'frameRequests',
  'frameRequestsOther',
  'effectFrame',
  'itemFrame',
  'enemyFrame',
  'bulletFrame',
  'damageFrame',
  'trailRecords',
  'beamImpacts',
  'animFrame',
  'bucket2Bytes',
  'staged',
  'displayList',
  'paletteFlush',
  'soundFrame',
  'soundInput',
];

const CUSTOM_SIMULATION_PROPERTIES = [
  'beeRecordHook',
  'bulletSpeedTransform',
  'bulletSpawnHook',
  'bulletRetireHook',
  'playerWeaponHook',
  'playerWeaponActiveHook',
  'playerOptionFilter',
  'playerSpriteFilter',
  'playerGrazeHook',
  'playerDamageTransform',
  'lethalHitHook',
  'deathPositionCapture',
  'respawnPositionTransform',
  'playerPositionTransform',
  'objectDriverHook',
  'enemyDeathHook',
  'friendlyBulletConvertHook',
  'enemyBulletCollisionFilter',
  'scoreAddendTransform',
  'stageScriptInstallHook',
  'backgroundRepeatRestoreHook',
  'stageAdvanceTransform',
  'cabinetRunStartHook',
  'cabinetRunEndHook',
  'virtualSpriteRequestHook',
  'privateShotObjectHook',
  'privateOptionObjectHook',
  'privateSegmentDriverHook',
  'privateBeamDrawHook',
  'privateDamageTailHook',
  'privateDamageReceiptHook',
  'privateScoreEventHook',
  'privateScoreFrameHook',
];

function snapshotMap(map, mutableFields = null) {
  return [...map].map(([key, value]) => ({
    key,
    value,
    fields: mutableFields && value && typeof value === 'object'
      ? Object.fromEntries(mutableFields.map((name) => [name, value[name]]))
      : null,
  }));
}

function restoreMap(map, entries) {
  map.clear();
  for (const entry of entries) {
    if (entry.fields) Object.assign(entry.value, entry.fields);
    map.set(entry.key, entry.value);
  }
}

function snapshotProperties(target, names) {
  return names.map((name) => ({
    name,
    present: Object.hasOwn(target, name),
    value: target[name],
  }));
}

function restoreProperties(target, properties) {
  for (const property of properties) {
    if (property.present) target[property.name] = property.value;
    else delete target[property.name];
  }
}

function handlersAreDefault(game, defaultHandlers) {
  if (!(defaultHandlers instanceof Map) || game.handlers.size !== defaultHandlers.size) return false;
  for (const [type, handler] of defaultHandlers) {
    if (game.handlers.get(type) !== handler) return false;
  }
  return true;
}

function assertEditionIdentity(game, expected = null) {
  if (!game.profile || !game.runtime) {
    throw new TypeError('Runahead requires one coherent edition runtime and RAM layout.');
  }
  const runtime = resolveGameRuntime(game.profile);
  if (game.runtime !== runtime || runtime.profile !== game.profile
      || game.ram?.ramLayout !== game.profile.ramLayout) {
    throw new TypeError('Runahead requires one coherent edition runtime and RAM layout.');
  }
  if (expected && (game.profile !== expected.profile || game.runtime !== expected.runtime
      || game.ram.ramLayout !== expected.ramLayout)) {
    throw new Error('Runahead edition identity changed after the checkpoint was saved.');
  }
}

function assertSafeConfiguration(game, defaultHandlers, defaultVideo, externalState) {
  assertEditionIdentity(game);
  if (!defaultVideo || game.video !== defaultVideo) {
    throw new Error('Runahead is incompatible with a custom video-register owner.');
  }
  if (game.bgMutate != null) {
    throw new Error('Runahead is incompatible with a custom background mutator.');
  }
  if (!handlersAreDefault(game, defaultHandlers)) {
    throw new Error('Runahead is incompatible with custom object handlers.');
  }
  const allowed = externalState?.callbacks ?? {};
  for (const [name, callback] of Object.entries(allowed)) {
    if (typeof callback !== 'function' || game[name] !== callback) {
      throw new Error(`Runahead callback ${name} no longer matches its state adapter.`);
    }
  }
  const installed = CUSTOM_SIMULATION_PROPERTIES.find((name) => game[name] != null
    && game[name] !== allowed[name]);
  if (installed) {
    throw new Error(`Runahead is incompatible with the installed ${installed}.`);
  }
}

function snapshotArray(source, reusable) {
  if (reusable?.constructor === source.constructor && reusable.length === source.length) {
    reusable.set(source);
    return reusable;
  }
  return source.slice();
}

function snapshot(game, reusable = null) {
  return {
    ram: snapshotArray(game.ram.b, reusable?.ram),
    scalars: Object.fromEntries(GAME_SCALARS.map((name) => [name, game[name]])),
    maps: Object.fromEntries(GAME_MAPS.map((name) => [name, snapshotMap(game[name])])),
    bulletSpawns: snapshotMap(game.bulletSpawns,
      ['fired', 'spawned', 'declined', 'dropped']),
    bulletKinds: snapshotMap(game.bulletKinds, ['addr', 'n']),
    arrays: Object.fromEntries(GAME_ARRAYS.map((name) => [name, game[name].length])),
    frameProperties: snapshotProperties(game, FRAME_PROPERTIES),
    kills: {
      n: game.kills.n,
      score: game.kills.score,
      byValue: snapshotMap(game.kills.byValue),
    },
    budget: {
      spent: game.budget.spent,
      exhaustedFrames: game.budget.exhaustedFrames,
    },
    prot: {
      slot: snapshotArray(game.prot.slot, reusable?.prot?.slot),
      written: snapshotArray(game.prot.written, reusable?.prot?.written),
    },
    unported: snapshotMap(game.unportedLog.calls),
    order: { h: game.order.h, n: game.order.n },
    vram: {
      words: snapshotArray(game.vram.w, reusable?.vram?.words),
      columnsWritten: game.vram.columnsWritten,
      streamPtr: game.vram.streamPtr,
    },
    tx: snapshotArray(game.txvram.w, reusable?.tx),
    slotTable: snapshotArray(game.slotTable.w, reusable?.slotTable),
    video: {
      bg_scale: game.video.bg_scale,
      bg_yscroll: game.video.bg_yscroll,
      bg_xscroll: game.video.bg_xscroll,
      tx_yscroll: game.video.tx_yscroll,
      tx_xscroll: game.video.tx_xscroll,
      ctrl: game.video.ctrl,
    },
    palette: {
      words: snapshotArray(game.palette.words, reusable?.palette?.words),
      sourced: snapshotArray(game.palette.sourced, reusable?.palette?.sourced),
      stageSourced: {
        spr: snapshotArray(game.palette.stageSourced.spr,
          reusable?.palette?.stageSourced?.spr),
        bg: snapshotArray(game.palette.stageSourced.bg,
          reusable?.palette?.stageSourced?.bg),
        tx: snapshotArray(game.palette.stageSourced.tx,
          reusable?.palette?.stageSourced?.tx),
      },
      installs: snapshotMap(game.palette.installs, ['n', 'bank']),
      installCount: game.palette.installCount,
      flushes: game.palette.flushes,
      copies: { ...game.palette.copies },
      lastFade: game.palette.lastFade,
    },
    sound: {
      doorLog: game.sound.doorLog.length,
      shadow: game.sound.shadow.length,
      streamingResolvers: game.sound.streamingResolvers.length,
      frameDoors: game.sound.frameDoors,
      framePosts: game.sound.framePosts,
      frameDrops: game.sound.frameDrops,
      digest: game.sound.digest,
      postCount: game.sound.postCount,
      dropCount: game.sound.dropCount,
      doorCount: game.sound.doorCount,
    },
  };
}

function restore(game, state) {
  game.ram.b.set(state.ram);
  Object.assign(game, state.scalars);
  for (const name of GAME_MAPS) restoreMap(game[name], state.maps[name]);
  restoreMap(game.bulletSpawns, state.bulletSpawns);
  restoreMap(game.bulletKinds, state.bulletKinds);
  for (const name of GAME_ARRAYS) game[name].length = state.arrays[name];
  restoreProperties(game, state.frameProperties);

  game.kills.n = state.kills.n;
  game.kills.score = state.kills.score;
  restoreMap(game.kills.byValue, state.kills.byValue);
  game.budget.spent = state.budget.spent;
  game.budget.exhaustedFrames = state.budget.exhaustedFrames;
  game.prot.slot.set(state.prot.slot);
  game.prot.written.set(state.prot.written);
  restoreMap(game.unportedLog.calls, state.unported);
  game.order.h = state.order.h;
  game.order.n = state.order.n;

  game.vram.w.set(state.vram.words);
  game.vram.columnsWritten = state.vram.columnsWritten;
  game.vram.streamPtr = state.vram.streamPtr;
  game.txvram.w.set(state.tx);
  game.slotTable.w.set(state.slotTable);
  Object.assign(game.video, state.video);

  game.palette.words.set(state.palette.words);
  game.palette.sourced.set(state.palette.sourced);
  game.palette.stageSourced.spr.set(state.palette.stageSourced.spr);
  game.palette.stageSourced.bg.set(state.palette.stageSourced.bg);
  game.palette.stageSourced.tx.set(state.palette.stageSourced.tx);
  restoreMap(game.palette.installs, state.palette.installs);
  game.palette.installCount = state.palette.installCount;
  game.palette.flushes = state.palette.flushes;
  Object.assign(game.palette.copies, state.palette.copies);
  game.palette.lastFade = state.palette.lastFade;

  game.sound.doorLog.length = state.sound.doorLog;
  game.sound.shadow.length = state.sound.shadow;
  game.sound.streamingResolvers.length = state.sound.streamingResolvers;
  game.sound.frameDoors = state.sound.frameDoors;
  game.sound.framePosts = state.sound.framePosts;
  game.sound.frameDrops = state.sound.frameDrops;
  game.sound.digest = state.sound.digest;
  game.sound.postCount = state.sound.postCount;
  game.sound.dropCount = state.sound.dropCount;
  game.sound.doorCount = state.sound.doorCount;
}

export function saveRunaheadState(
  game,
  defaultHandlers,
  defaultVideo,
  externalState,
  depth,
) {
  if (!Number.isInteger(depth) || depth < 1 || depth > 3) {
    throw new RangeError('Runahead depth must be an integer from 1 through 3.');
  }
  if (ACTIVE.has(game)) throw new Error('Runahead checkpoints cannot be nested.');
  assertSafeConfiguration(game, defaultHandlers, defaultVideo, externalState);

  const state = snapshot(game, SNAPSHOT_POOL.get(game));
  SNAPSHOT_POOL.set(game, state);
  const externalToken = externalState?.save();
  const token = Object.freeze(Object.create(null));
  const entry = {
    game,
    profile: game.profile,
    runtime: game.runtime,
    ramLayout: game.ram.ramLayout,
    defaultHandlers,
    defaultVideo,
    externalState,
    externalToken,
    depth,
    steps: 0,
    state,
    used: false,
  };
  ACTIVE.set(game, entry);
  TOKENS.set(token, entry);
  return token;
}

export function beginRunaheadStep(game) {
  const entry = ACTIVE.get(game);
  if (!entry) return false;
  assertEditionIdentity(game, entry);
  assertSafeConfiguration(
    game, entry.defaultHandlers, entry.defaultVideo, entry.externalState,
  );
  if (entry.steps >= entry.depth) {
    throw new Error(`Runahead checkpoint allows only ${entry.depth} speculative step(s).`);
  }
  entry.steps++;
  return true;
}

export function restoreRunaheadState(game, token) {
  const entry = TOKENS.get(token);
  if (!entry) throw new TypeError('Unknown runahead checkpoint.');
  if (entry.game !== game) throw new Error('Runahead checkpoint belongs to another Game.');
  if (entry.used) throw new Error('Runahead checkpoint was already restored.');
  if (ACTIVE.get(game) !== entry) throw new Error('Runahead checkpoint is not active.');

  let failure = null;
  try {
    assertEditionIdentity(game, entry);
    restore(game, entry.state);
  } catch (error) {
    failure = error;
  }
  try {
    entry.externalState?.restore(entry.externalToken);
  } catch (error) {
    failure ??= error;
  } finally {
    entry.used = true;
    ACTIVE.delete(game);
  }
  if (failure) throw failure;
}

export function assertRunaheadInactive(game, operation) {
  if (ACTIVE.has(game)) throw new Error(`${operation} is unavailable during runahead.`);
}
