// Probe-only exact-harness checkpoints. This module is never imported by browser code.
// Checkpoint files contain evolved RAM and are local artifacts, not repository data.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Game } from '../src/main.js';
import { assertProfileTables } from '../src/profiles.js';
import { requireRuntimeCapability, resolveRuntimeProfile } from '../src/runtime-profile.js';

export const CHECKPOINT_SCHEMA = 'ddpdoj.progression-checkpoint.v2';

const RAW = Object.freeze({
  stage: 0x813092,
  stageX2: 0x813094,
  stageX4: 0x813096,
  loop: 0x813098,
});

const RECONSTRUCTED = new Set([
  'ram', 'rom', 'tables', 'gov', 'handlers', 'slotTable',
  'bgMutate', 'coinTick', 'soundSink',
]);
const HOST_SEAMS = new Set(['bgMutate', 'coinTick', 'soundSink']);

function resolveCheckpointIdentity(bundle, profileRequest) {
  const request = profileRequest ?? bundle?.profile ?? bundle?.profileId;
  const identity = resolveRuntimeProfile(request);
  requireRuntimeCapability(identity.runtime, 'legacyCheckpoint', 'Progression checkpoint v2');
  if (bundle?.profile != null && bundle.profile !== identity.profile) {
    throw new Error('checkpoint bundle profile does not match the requested edition');
  }
  if (bundle?.profileId != null && bundle.profileId !== identity.profile.id) {
    throw new Error('checkpoint bundle profile id does not match the requested edition');
  }
  assertProfileTables(identity.profile, bundle?.tables);
  return identity;
}

const b64 = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  .toString('base64');

function bytesFromB64(text) {
  return Uint8Array.from(Buffer.from(text, 'base64'));
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashTables(tables) {
  return hashJson(tables);
}

function encode(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value;
    return { $type: 'number', value: Object.is(value, -0) ? '-0' : String(value) };
  }
  if (typeof value === 'bigint') return { $type: 'bigint', value: value.toString() };
  if (typeof value === 'undefined') return { $type: 'undefined' };
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`checkpoint cannot encode ${typeof value}`);
  }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      return { $type: 'DataView', data: b64(new Uint8Array(
        value.buffer, value.byteOffset, value.byteLength)) };
    }
    return { $type: 'typed', class: value.constructor.name,
      data: b64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  }
  if (value instanceof ArrayBuffer) {
    return { $type: 'ArrayBuffer', data: b64(new Uint8Array(value)) };
  }
  if (Array.isArray(value)) return { $type: 'array', items: value.map(encode) };
  if (value instanceof Map) {
    return { $type: 'map', entries: [...value].map(([k, v]) => [encode(k), encode(v)]) };
  }
  if (value instanceof Set) return { $type: 'set', items: [...value].map(encode) };
  const props = {};
  for (const [key, item] of Object.entries(value)) props[key] = encode(item);
  return { $type: 'object', class: value.constructor?.name ?? 'Object', props };
}

function numberFromTag(value) {
  if (value === '-0') return -0;
  if (value === 'NaN') return NaN;
  if (value === 'Infinity') return Infinity;
  if (value === '-Infinity') return -Infinity;
  throw new TypeError(`bad checkpoint number ${value}`);
}

function typedFromTag(className, data) {
  const bytes = bytesFromB64(data);
  const classes = {
    Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
    Int32Array, Uint32Array, Float32Array, Float64Array,
    BigInt64Array, BigUint64Array,
  };
  const Ctor = classes[className];
  if (!Ctor) throw new TypeError(`unsupported checkpoint typed array ${className}`);
  if (bytes.byteLength % Ctor.BYTES_PER_ELEMENT) {
    throw new TypeError(`misaligned ${className} checkpoint payload`);
  }
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Ctor(copy);
}

function restoreValue(target, encoded) {
  if (encoded === null || typeof encoded !== 'object') return encoded;
  switch (encoded.$type) {
    case 'number': return numberFromTag(encoded.value);
    case 'bigint': return BigInt(encoded.value);
    case 'undefined': return undefined;
    case 'typed': return typedFromTag(encoded.class, encoded.data);
    case 'DataView': {
      const bytes = bytesFromB64(encoded.data);
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return new DataView(copy);
    }
    case 'ArrayBuffer': {
      const bytes = bytesFromB64(encoded.data);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    case 'array': return encoded.items.map((item, i) => restoreValue(target?.[i], item));
    case 'map': return new Map(encoded.entries.map(([k, v]) => [
      restoreValue(undefined, k), restoreValue(undefined, v),
    ]));
    case 'set': return new Set(encoded.items.map((item) => restoreValue(undefined, item)));
    case 'object': {
      const out = target && typeof target === 'object' && !Array.isArray(target)
        && !ArrayBuffer.isView(target) && !(target instanceof Map) && !(target instanceof Set)
        ? target : {};
      for (const key of Object.keys(out)) {
        if (!Object.hasOwn(encoded.props, key)) delete out[key];
      }
      for (const [key, item] of Object.entries(encoded.props)) {
        out[key] = restoreValue(out[key], item);
      }
      return out;
    }
    default: throw new TypeError(`unknown checkpoint value tag ${encoded.$type}`);
  }
}

function assertProbeGame(game) {
  const identity = resolveRuntimeProfile(game?.profile);
  requireRuntimeCapability(identity.runtime, 'legacyCheckpoint', 'Progression checkpoint v2');
  if (game?.runtime !== identity.runtime || game?.ram?.ramLayout !== identity.profile.ramLayout) {
    throw new Error('checkpoint Game edition runtime or RAM layout is inconsistent');
  }
  for (const key of HOST_SEAMS) {
    if (game[key] != null) throw new Error(`checkpoint refuses active host seam Game.${key}`);
  }
  for (const [key, value] of Object.entries(game)) {
    if (typeof value === 'function') {
      throw new Error(`checkpoint refuses function-valued Game.${key}`);
    }
  }
}

export function captureGameState(game) {
  assertProbeGame(game);
  const props = {};
  for (const [key, value] of Object.entries(game)) {
    if (!RECONSTRUCTED.has(key)) props[key] = encode(value);
  }
  return { $type: 'object', class: 'GameState', props };
}

function restoreGameState(game, state) {
  if (state?.$type !== 'object' || state.class !== 'GameState') {
    throw new TypeError('checkpoint Game state is malformed');
  }
  for (const [key, encoded] of Object.entries(state.props)) {
    if (RECONSTRUCTED.has(key)) throw new Error(`checkpoint may not replace Game.${key}`);
    game[key] = restoreValue(game[key], encoded);
  }
}

export function seedIdentity(seed) {
  return { bytes: seed.byteLength, sha256: hashBytes(seed) };
}

export function checkpointDocument(game, bundle, probe) {
  const identity = resolveCheckpointIdentity(bundle, game?.profile);
  if (game?.runtime !== identity.runtime) {
    throw new Error('checkpoint Game runtime does not match its bundle profile');
  }
  const { ship, style, inputWord, invulnerable } = probe;
  if (![0, 2].includes(ship) || ![2, 4, 6].includes(style)) {
    throw new RangeError(`checkpoint ship/style ${ship}/${style} is not authentic`);
  }
  if (!Number.isInteger(inputWord) || inputWord < 0 || inputWord > 0xffff) {
    throw new RangeError(`checkpoint input word ${inputWord} is outside 16 bits`);
  }
  if (typeof invulnerable !== 'boolean') {
    throw new TypeError('checkpoint probe invulnerability must be explicit');
  }
  const gameState = captureGameState(game);
  return {
    schema: CHECKPOINT_SCHEMA,
    seed: seedIdentity(bundle.seed),
    tablesSha256: hashTables(bundle.tables),
    frame: { logic: game.logicFrame, video: game.videoFrame },
    selection: { ship, style },
    inputWord,
    probeOnly: { invulnerable },
    raw: {
      stage: game.ram.u16(RAW.stage),
      stageX2: game.ram.u16(RAW.stageX2),
      stageX4: game.ram.u16(RAW.stageX4),
      loop: game.ram.u16(RAW.loop),
    },
    ramSha256: hashBytes(game.ram.b),
    gameSha256: hashJson(gameState),
    ram: b64(game.ram.b),
    game: gameState,
  };
}

function validateIdentity(doc, bundle, expected, edition) {
  if (doc?.schema !== CHECKPOINT_SCHEMA) throw new Error('unsupported progression checkpoint schema');
  const identity = seedIdentity(bundle.seed);
  if (doc.seed?.bytes !== identity.bytes || doc.seed?.sha256 !== identity.sha256) {
    throw new Error('checkpoint seed identity does not match this exact bundle');
  }
  if (doc.tablesSha256 !== hashTables(bundle.tables)) {
    throw new Error('checkpoint cartridge tables do not match this exact bundle');
  }
  if (![0, 2].includes(doc.selection?.ship) || ![2, 4, 6].includes(doc.selection?.style)) {
    throw new Error('checkpoint ship/style metadata is not authentic');
  }
  if (!Number.isInteger(doc.inputWord) || doc.inputWord < 0 || doc.inputWord > 0xffff) {
    throw new Error('checkpoint input word metadata is outside 16 bits');
  }
  if (typeof doc.probeOnly?.invulnerable !== 'boolean') {
    throw new Error('checkpoint lacks explicit probe-only invulnerability metadata');
  }
  if (expected?.ship != null && doc.selection?.ship !== expected.ship) {
    throw new Error(`checkpoint ship ${doc.selection?.ship} does not match ${expected.ship}`);
  }
  if (expected?.style != null && doc.selection?.style !== expected.style) {
    throw new Error(`checkpoint style ${doc.selection?.style} does not match ${expected.style}`);
  }
  return edition;
}

export function restoreCheckpoint(doc, bundle, expected = {}) {
  const requestedEdition = resolveCheckpointIdentity(bundle, expected?.profile);
  const edition = validateIdentity(doc, bundle, expected, requestedEdition);
  const ram = bytesFromB64(doc.ram);
  if (ram.byteLength !== bundle.seed.byteLength) {
    throw new Error(`checkpoint RAM is ${ram.byteLength} bytes, expected ${bundle.seed.byteLength}`);
  }
  if (doc.ramSha256 !== hashBytes(ram)) {
    throw new Error('checkpoint RAM payload failed its integrity hash');
  }
  if (doc.gameSha256 !== hashJson(doc.game)) {
    throw new Error('checkpoint Game-state payload failed its integrity hash');
  }
  const game = new Game(bundle.seed, bundle.tables, {
    profile: edition.profile,
    logicFrame: doc.frame?.logic,
    videoFrame: doc.frame?.video,
    palCatchUp: false,
  });
  game.ram.b.set(ram);
  restoreGameState(game, doc.game);
  if (game.logicFrame !== doc.frame?.logic || game.videoFrame !== doc.frame?.video) {
    throw new Error('checkpoint frame metadata disagrees with restored Game state');
  }
  const raw = {
    stage: game.ram.u16(RAW.stage),
    stageX2: game.ram.u16(RAW.stageX2),
    stageX4: game.ram.u16(RAW.stageX4),
    loop: game.ram.u16(RAW.loop),
  };
  for (const [key, value] of Object.entries(raw)) {
    if (value !== doc.raw?.[key]) throw new Error(`checkpoint raw ${key} metadata disagrees with RAM`);
  }
  assertProbeGame(game);
  return { game, probe: {
    ship: doc.selection.ship,
    style: doc.selection.style,
    inputWord: doc.inputWord,
    invulnerable: doc.probeOnly?.invulnerable,
  } };
}

export function checkpointFileName(ship, style, logicFrame) {
  return `ship${ship}-style${style}-lf${String(logicFrame).padStart(8, '0')}.json`;
}

export async function writeCheckpoint(file, game, bundle, probe) {
  const doc = checkpointDocument(game, bundle, probe);
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(doc) + '\n', { encoding: 'utf8', mode: 0o600 });
  await rename(temp, file);
  return doc;
}

export async function readCheckpoint(file, bundle, expected = {}) {
  resolveCheckpointIdentity(bundle, expected?.profile);
  const doc = JSON.parse(await readFile(file, 'utf8'));
  return restoreCheckpoint(doc, bundle, expected);
}
