import { FullRom } from './rom.js';
import { parseScoreGroups, scoreToJson } from './bgmscore.js';
import { driverParamsToJson } from './driverparams.js';

export const MAINCPU_SIZE = 0x600000;
export const BIOS_SIZE = 0x080000;
export const PROGRAM_SIZE = 0x200000;
export const DECRYPT_LENGTH = 0x400000;
export const MAINCPU_SHA256 = '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c';
export const COLD_BOOT_COINAGE = 0x803957;

export function installColdBootDefaults(ram) {
  if (!ram || typeof ram.setU8 !== 'function') {
    throw new TypeError('installColdBootDefaults needs the game RAM interface');
  }
  ram.setU8(COLD_BOOT_COINAGE, 1);
}

const PY2K2_TAB = new Uint8Array([
  0x74,0xe8,0xa8,0x64,0x26,0x44,0xa6,0x9a,0xa5,0x69,0xa2,0xd3,0x6d,0xba,0xff,0xf3,
  0xeb,0x6e,0xe3,0x70,0x72,0x58,0x27,0xd9,0xe4,0x9f,0x50,0xa2,0xdd,0xce,0x6e,0xf6,
  0x44,0x72,0x0c,0x7e,0x4d,0x41,0x77,0x2d,0x00,0xad,0x1a,0x5f,0x6b,0xc0,0x1d,0x4e,
  0x4c,0x72,0x62,0x3c,0x32,0x28,0x43,0xf8,0x9d,0x52,0x05,0x7e,0xd1,0xee,0x82,0x61,
  0x3b,0x3f,0x77,0xf3,0x8f,0x7e,0x3f,0xf1,0xdf,0x8f,0x68,0x43,0xd7,0x68,0xdf,0x19,
  0x87,0xff,0x74,0xe5,0x3f,0x43,0x8e,0x80,0x0f,0x7e,0xdb,0x32,0xe8,0xd1,0x66,0x8f,
  0xbe,0xe2,0x33,0x94,0xc8,0x32,0x39,0xfa,0xf0,0x43,0xde,0x84,0x18,0xd0,0x6d,0xd5,
  0x74,0x98,0xf8,0x64,0xcf,0x84,0xc6,0xea,0x55,0x32,0xe2,0x38,0xdd,0xea,0xfd,0x6c,
  0xeb,0x6e,0xe3,0x70,0xae,0x38,0xc7,0xd9,0x54,0x84,0x10,0xc1,0xfd,0x1e,0x6e,0x6d,
  0x37,0xe0,0x03,0x9e,0x06,0x36,0x68,0x5b,0xe3,0xf6,0x7f,0x0b,0x56,0x79,0xe0,0xa8,
  0x98,0x77,0xc7,0x2b,0xa5,0x79,0xff,0x2f,0xca,0x15,0x71,0x7e,0x02,0xbf,0x87,0xb7,
  0x7a,0x8e,0xe6,0x64,0x32,0x62,0x2a,0xca,0x23,0x72,0x87,0xb5,0x0c,0x02,0x4b,0xee,
  0x44,0x72,0x9c,0x7e,0x5d,0xc1,0xa7,0x1d,0x30,0x38,0xda,0xc9,0x5b,0xd0,0x11,0xf9,
  0xb1,0x72,0x6c,0x04,0x31,0xc9,0x50,0x60,0x6f,0xc1,0xf2,0xae,0x00,0xf4,0x5d,0x66,
  0x43,0x0e,0x7a,0xc3,0x76,0xae,0x3c,0xc2,0xb7,0xc9,0x52,0xf4,0x74,0x51,0xaf,0x12,
  0x19,0xc6,0x75,0xe8,0x6c,0x54,0x7e,0x63,0xdd,0xae,0x07,0x5a,0xb7,0x00,0xb5,0x5e,
]);

function requireLength(bytes, expected, name) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError(`${name} needs a Uint8Array`);
  if (bytes.length !== expected) {
    throw new RangeError(`${name} needs exactly ${expected} bytes, got ${bytes.length}`);
  }
}

export function load16WordSwap(target, offset, source) {
  if (!(target instanceof Uint8Array) || !(source instanceof Uint8Array)) {
    throw new TypeError('load16WordSwap needs Uint8Array inputs');
  }
  if ((source.length & 1) !== 0 || !Number.isSafeInteger(offset)
      || offset < 0 || offset + source.length > target.length) {
    throw new RangeError('load16WordSwap source must be even and fit in the target');
  }
  for (let i = 0; i < source.length; i += 2) {
    target[offset + i] = source[i + 1];
    target[offset + i + 1] = source[i];
  }
  return target;
}

export function decryptPy2k2(maincpu) {
  requireLength(maincpu, MAINCPU_SIZE, 'DaiOuJou maincpu');
  const base = 0x100000;
  for (let i = 0; i < DECRYPT_LENGTH / 2; i++) {
    const at = base + i * 2;
    let value = (maincpu[at] << 8) | maincpu[at + 1];
    if ((i & 0x040480) !== 0x000080) value ^= 0x0001;
    if ((i & 0x084008) === 0x084008) value ^= 0x0002;
    if ((i & 0x000030) === 0x000010 && (i & 0x180000) !== 0x080000) value ^= 0x0004;
    if ((i & 0x000042) !== 0x000042) value ^= 0x0008;
    if ((i & 0x008100) === 0x008000) value ^= 0x0010;
    if ((i & 0x022004) !== 0x000004) value ^= 0x0020;
    if ((i & 0x011800) !== 0x010000) value ^= 0x0040;
    if ((i & 0x004820) === 0x004820) value ^= 0x0080;
    value ^= PY2K2_TAB[i & 0xff] << 8;
    maincpu[at] = value >>> 8;
    maincpu[at + 1] = value & 0xff;
  }
  return maincpu;
}

export async function sha256Bytes(bytes,
  digest = globalThis.crypto?.subtle?.digest?.bind(globalThis.crypto.subtle)) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('sha256Bytes needs a Uint8Array');
  if (typeof digest !== 'function') throw new Error('Web Crypto SHA-256 is not available.');
  const hash = new Uint8Array(await digest('SHA-256', bytes));
  return Array.from(hash, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function assertMainCpuIdentity(maincpu, options = {}) {
  requireLength(maincpu, MAINCPU_SIZE, 'Decrypted DaiOuJou maincpu');
  const actual = await sha256Bytes(maincpu, options.digest);
  if (actual !== MAINCPU_SHA256) {
    throw new Error(`Decrypted DaiOuJou maincpu SHA-256 mismatch: got ${actual}, expected ${MAINCPU_SHA256}`);
  }
  return maincpu;
}

export async function buildMainCpu({ bios, program, decrypted }, options = {}) {
  let maincpu;
  if (decrypted) {
    requireLength(decrypted, MAINCPU_SIZE, 'Decrypted DaiOuJou maincpu');
    maincpu = decrypted.slice();
  } else {
    requireLength(bios, BIOS_SIZE, 'ddp3_bios.u37');
    requireLength(program, PROGRAM_SIZE, 'ddb10_10_8_434f.u45');
    maincpu = new Uint8Array(MAINCPU_SIZE);
    load16WordSwap(maincpu, 0x000000, bios);
    load16WordSwap(maincpu, 0x100000, program);
    decryptPy2k2(maincpu);
  }
  return assertMainCpuIdentity(maincpu, options);
}

const SOUND_SAMPLE_ROM_SIZE = 0x400000;
const SOUND_DRIVER_BLOCKS = Object.freeze([
  Object.freeze({ source: 0x1a8ec0, length: 828, target: 0x7600 }),
  Object.freeze({ source: 0x1acc24, length: 3520, target: 0x6840 }),
  Object.freeze({ source: 0x1c6309, length: 3530, target: 0x4439 }),
  Object.freeze({ source: 0x1c70d3, length: 1920, target: 0x5203 }),
  Object.freeze({ source: 0x011efb, length: 16, target: 0x5987 }),
  Object.freeze({ source: 0x011f0b, length: 512, target: 0x5997 }),
  Object.freeze({ source: 0x1c6246, length: 140, target: 0x4376 }),
  Object.freeze({ source: 0x005f1c, length: 2, target: 0x6168 }),
]);
const SOUND_SAMPLE_FRAGMENTS = Object.freeze([
  Object.freeze({ romOffset: 0x000000, length: 0x0db837 }),
  Object.freeze({ romOffset: 0x0db935, length: 0x000922 }),
  Object.freeze({ romOffset: 0x0e1853, length: 0x01e78e }),
  Object.freeze({ romOffset: 0x100000, length: 0x0ffff6 }),
  Object.freeze({ romOffset: 0x200000, length: 0x0ffbfa }),
  Object.freeze({ romOffset: 0x300000, length: 0x077bf2 }),
]);

/** Build the proven browser sound assets from exact local cartridge members. */
export function soundAssetsFromLocalRoms(maincpu, sampleRom) {
  requireLength(maincpu, MAINCPU_SIZE, 'Decrypted DaiOuJou maincpu');
  requireLength(sampleRom, SOUND_SAMPLE_ROM_SIZE, 'cave_m04401b032.u17');

  const z80 = new Uint8Array(0x10000);
  for (const block of SOUND_DRIVER_BLOCKS) {
    z80.set(maincpu.subarray(block.source, block.source + block.length), block.target);
  }

  const shardBytes = SOUND_SAMPLE_FRAGMENTS.reduce((total, part) => total + part.length, 0);
  const sampleShard = new Uint8Array(shardBytes);
  let shardOffset = 0;
  const fragments = SOUND_SAMPLE_FRAGMENTS.map((part) => {
    sampleShard.set(sampleRom.subarray(part.romOffset, part.romOffset + part.length), shardOffset);
    const fragment = {
      romOffset: part.romOffset,
      icsBase: 0x400000 + part.romOffset,
      shardOffset,
      len: part.length,
    };
    shardOffset += part.length;
    return fragment;
  });

  const bgmScore = scoreToJson(parseScoreGroups(maincpu));
  bgmScore.note = 'W162 live BGM score groups. `$28B814/$28B884/$28CF36` selects and transforms one of seven 68k score banks into Z80 `$A600`; group 0 is only the boot snapshot and stage 1 uses group 1. Each cue carries its header (rowlen/tracks), row/selector stream, the word-aligned track-major `8 * df` LE pointer grid and the per-track/per-selector note-event bytes (hex). W150 fixed the framing: `$00-$3F` is one byte, `$40-$BF` is two bytes, `$D0-$EF` is three bytes, and `$C0-$CF`/`$F0-$FF` is four bytes. A semantic transformation, not a verbatim ROM slice.';

  return {
    driverParams: driverParamsToJson(z80),
    bgmScore,
    sampleIndex: {
      version: 1,
      layout: 'ics2115-static-fragment-stitch-v1',
      coverage: 'all-live-descriptors',
      descriptorIntervals: 228,
      fragmentCount: fragments.length,
      rom: 'cave_m04401b032.u17',
      icsBase: 0x400000,
      shardBytes,
      note: 'W158 sidecar. Each fragment maps a u17 byte run to its offset in snd/sample.shard.u8. synth un-stitch: find the fragment whose [icsBase, icsBase+len) contains the sample address, then read shard[shardOffset + (address - icsBase)]. 6 disjoint fragments, each extended through OscEnd+1 for exact linear interpolation, non-adjacent in u17; the guard passes because the stitched body is not one contiguous ROM slice. Static source: all 69 driver-valid SFX plus 159 score-reachable BGM descriptors; full-ROM fallback is forbidden.',
      fragments,
    },
    sampleShard,
  };
}

const DIR_TABLE = 0x2552dc;
const FOLD_TABLE = 0x2418b4;
const SPEED_PTRS = 0x200920;
const SPEED_LEVELS = 256;
const QUAD_ENTRIES = 65;
const ANIM_A = 0x25533a;
const ANIM_B = 0x2553ca;
const TILT_MIN = -0x20;
const TILT_MAX = 0x20;
const TILT_STEP = 4;
const GOV_TABLES = Object.freeze({
  t23C3EE: [0x23c3ee, 10],
  t23C402: [0x23c402, 10],
  t23C416: [0x23c416, 5],
  t23C420: [0x23c420, 5],
});

function words(rom, address, count) {
  return Array.from({ length: count }, (_, index) => rom.u16(address + index * 2));
}

function animationRow(rom, table, selector) {
  const pointer = rom.u32(table + selector * 2);
  const row = [];
  for (let tilt = TILT_MIN; tilt <= TILT_MAX; tilt += TILT_STEP) {
    row.push([rom.u16(pointer + tilt), rom.u16(pointer + tilt + 2)]);
  }
  return row;
}

export function tablesFromMainCpu(maincpu) {
  requireLength(maincpu, MAINCPU_SIZE, 'Decrypted DaiOuJou maincpu');
  const rom = new FullRom(maincpu);
  const quads = {};
  const exported = Array.from({ length: SPEED_LEVELS }, (_, index) => index);
  for (const level of exported) {
    const pointer = rom.u32(SPEED_PTRS + level * 4);
    quads[String(level)] = Array.from({ length: QUAD_ENTRIES }, (_, index) => [
      rom.i32(pointer + index * 8),
      rom.i32(pointer + index * 8 + 4),
    ]);
  }
  const hitX = animationRow(rom, ANIM_B, 0);
  return {
    set: 'ddpdojblk',
    build: 'B',
    image_sha256: MAINCPU_SHA256,
    dirTable: { rom: '$2552DC', bytes: Array.from(maincpu.subarray(DIR_TABLE, DIR_TABLE + 16)) },
    foldTable: { rom: '$2418B4', words: words(rom, FOLD_TABLE, 256) },
    speed: {
      rom: '$200920', levels: SPEED_LEVELS, quadEntries: QUAD_ENTRIES,
      exported, quads,
    },
    gov: Object.fromEntries(Object.entries(GOV_TABLES).map(([name, [address, count]]) => [
      name, { rom: `$${address.toString(16).toUpperCase()}`, words: words(rom, address, count) },
    ])),
    anim: {
      tiltMin: TILT_MIN,
      tiltStep: TILT_STEP,
      a: {
        rom: '$25533A',
        shipSel0: animationRow(rom, ANIM_A, 0),
        shipSel2: animationRow(rom, ANIM_A, 2),
      },
      b: { rom: '$2553CA', shipSel0: hitX },
      hitX: {
        rom: '$2553CA',
        reads: '$249E68/$249E72/$2459E4/$2459E8',
        shipSel0: hitX,
      },
    },
  };
}
