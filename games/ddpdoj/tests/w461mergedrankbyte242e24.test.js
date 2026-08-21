// WAVE 461 (D69) -- MERGE THE PRIVATE `$242E24` RNG BODY.
//
// The cartridge has one 30-byte routine. initbody.js and rng.js transcribed the
// same low-byte counter increment, word mask and table read. rng.js already owns
// the exported implementation and nearly every production caller, while the init
// copy was private. This regression pins the full cartridge body, all direct
// callers, register ownership, both init caller conventions, source reachability
// and the live duplicate-register removal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as initbodyModule from '../src/initbody.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { Ram } from '../src/ram.js';
import {
  RNG, RNG_242E24, drawByte242E24,
} from '../src/rng.js';
import {
  bodyPairs, headIndex, headRegister, narrowIndex, scanFile, sources,
} from './w450widenedscan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');
const IMAGE = join(ROOT, 'rip', 'sound', 'maincpu.bin');
const HAVE_IMAGE = existsSync(IMAGE);
const IMG = HAVE_IMAGE ? readFileSync(IMAGE) : null;
const SKIP_IMAGE = HAVE_IMAGE ? false : 'maincpu.bin absent; skip, not pass';
const IMAGE_SHA256 = '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c';

const BODY_START = 0x242e24;
const BODY_END = 0x242e42;
const BODY_HEX = '523900803917707fc079008039162f0841fa000c4e7110300000205f4e75';
const BODY_SHA256 = '5c280b15e6b2c520824f120b39e9ed5d47144209586b37852d8c8793b53440c3';
const PRIOR_TABLE_START = 0x242d24;
const PRIOR_TABLE_SHA256 = 'f45979b11a2946df59ecc5f027d5603ffc2dd52cd29bac2997d1eb931cdd7157';
const TABLE_END = 0x242ec2;
const TABLE_SHA256 = '81ec92daeca70fd966be91ca9f170a8a5c72724320c1c38f3614e57ca5853cbf';
const NEXT_BODY_HEX = '5239008039173039008039162f0841fa000c4e7110300000205f4e75';
const NEXT_BODY_SHA256 = 'dd09ca2e3cf97f28d6cbe13b9929d6120a61457f0d9f284b4030e2a8c0b0cf58';

const BODY_INSTRUCTIONS = Object.freeze([
  [0x242e24, '523900803917', 'addq.b #1,$803917'],
  [0x242e2a, '707f', 'moveq #$7F,D0'],
  [0x242e2c, 'c07900803916', 'and.w $803916,D0'],
  [0x242e32, '2f08', 'move.l A0,-(A7)'],
  [0x242e34, '41fa000c', 'lea ($242E42,PC),A0'],
  [0x242e38, '4e71', 'nop'],
  [0x242e3a, '10300000', 'move.b (A0,D0.w),D0'],
  [0x242e3e, '205f', 'movea.l (A7)+,A0'],
  [0x242e40, '4e75', 'rts'],
]);

const EXTERNAL_CALLERS = Object.freeze([
  0x265350, 0x265376, 0x26728a, 0x268744, 0x27699c, 0x27e02a,
  0x27ead6, 0x27ec86, 0x280cfa, 0x280d12, 0x288cd4, 0x289756,
  0x28a26c, 0x28a2e8, 0x28a326, 0x28a360, 0x28a3a2, 0x28a3e0,
  0x28a426, 0x2933de, 0x2933ee, 0x297af0, 0x297f94, 0x297f9e,
  0x29924c, 0x299362, 0x29a132, 0x29a13c, 0x29d1ec, 0x2a5062,
  0x2a5164, 0x2a51e0, 0x2a5424, 0x2a81cc, 0x2a83e8, 0x2a8810,
  0x2a8ee0,
]);

// Each span begins at the JSR and ends after the first complete continuation
// instruction. That instruction proves every caller consumes D0 rather than SR.
const CALLER_SPANS = Object.freeze([
  [0x265350, 0x265358, '4eb900242e241200', 'move.b D0,D1'],
  [0x265376, 0x26537e, '4eb900242e241200', 'move.b D0,D1'],
  [0x26728a, 0x267292, '4eb900242e24e208', 'lsr.b #1,D0'],
  [0x268744, 0x26874c, '4eb900242e24e208', 'lsr.b #1,D0'],
  [0x27699c, 0x2769a4, '4eb900242e24e200', 'asr.b #1,D0'],
  [0x27e02a, 0x27e032, '4eb900242e24e208', 'lsr.b #1,D0'],
  [0x27ead6, 0x27eade, '4eb900242e24e208', 'lsr.b #1,D0'],
  [0x27ec86, 0x27ec90, '4eb900242e241d40001b', 'move.b D0,$1B(A6)'],
  [0x280cfa, 0x280d04, '4eb900242e240240001f', 'andi.w #$1F,D0'],
  [0x280d12, 0x280d1c, '4eb900242e240240001f', 'andi.w #$1F,D0'],
  [0x288cd4, 0x288cdc, '4eb900242e24e648', 'lsr.w #3,D0'],
  [0x289756, 0x289760, '4eb900242e240c400015', 'cmpi.w #$15,D0'],
  [0x28a26c, 0x28a274, '4eb900242e245800', 'addq.b #4,D0'],
  [0x28a2e8, 0x28a2f0, '4eb900242e245040', 'addq.w #8,D0'],
  [0x28a326, 0x28a32e, '4eb900242e245040', 'addq.w #8,D0'],
  [0x28a360, 0x28a368, '4eb900242e245040', 'addq.w #8,D0'],
  [0x28a3a2, 0x28a3aa, '4eb900242e245000', 'addq.b #8,D0'],
  [0x28a3e0, 0x28a3e8, '4eb900242e245040', 'addq.w #8,D0'],
  [0x28a426, 0x28a42e, '4eb900242e245040', 'addq.w #8,D0'],
  [0x2933de, 0x2933e8, '4eb900242e2402400007', 'andi.w #7,D0'],
  [0x2933ee, 0x2933f8, '4eb900242e2402000003', 'andi.b #3,D0'],
  [0x297af0, 0x297afa, '4eb900242e2402400007', 'andi.w #7,D0'],
  [0x297f94, 0x297f9e, '4eb900242e2419400003', 'move.b D0,$3(A4)'],
  [0x297f9e, 0x297fa8, '4eb900242e2439400006', 'move.w D0,$6(A4)'],
  [0x29924c, 0x299256, '4eb900242e2402400003', 'andi.w #3,D0'],
  [0x299362, 0x29936c, '4eb900242e2402400003', 'andi.w #3,D0'],
  [0x29a132, 0x29a13c, '4eb900242e2419400008', 'move.b D0,$8(A4)'],
  [0x29a13c, 0x29a146, '4eb900242e2419400009', 'move.b D0,$9(A4)'],
  [0x29d1ec, 0x29d1f6, '4eb900242e2406000060', 'addi.b #$60,D0'],
  [0x2a5062, 0x2a506c, '4eb900242e241d40001b', 'move.b D0,$1B(A6)'],
  [0x2a5164, 0x2a516e, '4eb900242e241d40001b', 'move.b D0,$1B(A6)'],
  [0x2a51e0, 0x2a51ea, '4eb900242e241d40001b', 'move.b D0,$1B(A6)'],
  [0x2a5424, 0x2a542e, '4eb900242e241d40001b', 'move.b D0,$1B(A6)'],
  [0x2a81cc, 0x2a81d6, '4eb900242e2406000060', 'addi.b #$60,D0'],
  [0x2a83e8, 0x2a83f2, '4eb900242e2404000020', 'subi.b #$20,D0'],
  [0x2a8810, 0x2a881a, '4eb900242e2404000020', 'subi.b #$20,D0'],
  [0x2a8ee0, 0x2a8eea, '4eb900242e2406000060', 'addi.b #$60,D0'],
]);

const SOURCE_REPRESENTED_SITES = Object.freeze([
  0x268744, 0x27699c, 0x27e02a, 0x27ead6, 0x27ec86,
  0x280cfa, 0x280d12, 0x289756, 0x28a26c, 0x28a3a2,
  0x2933de, 0x2933ee, 0x29924c, 0x299362, 0x29a132,
  0x29a13c, 0x29d1ec, 0x2a81cc, 0x2a83e8, 0x2a8810,
]);
const SOURCE_GAPS = Object.freeze(EXTERNAL_CALLERS
  .filter((at) => !SOURCE_REPRESENTED_SITES.includes(at)));

const SOURCE_CALL_COUNTS = Object.freeze([
  ['bee.js', 1], ['boss2.js', 2], ['boss2attacks.js', 2], ['boss3.js', 1],
  ['bossscripts.js', 2], ['effects.js', 1], ['hibachiguns.js', 3],
  ['initbody.js', 3], ['items.js', 2], ['spark.js', 2],
]);

function bytes(at, count) { return IMG.subarray(at, at + count); }
function sha256(data) { return createHash('sha256').update(data).digest('hex'); }
function signed8(value) { return (value & 0x80) !== 0 ? value - 0x100 : value; }
function signed16(value) { return (value & 0x8000) !== 0 ? value - 0x10000 : value; }

// Scan every aligned word in all 6 MiB. The decoder includes the direct transfer
// forms relevant to this 68000 image and inventories indexed-PC candidates apart
// from statically resolved entries.
function transferCensus(start, end) {
  const hits = [];
  const indexed = [];
  let scanned = 0;
  for (let at = 0; at + 2 <= IMG.length; at += 2) {
    scanned++;
    const opcode = IMG.readUInt16BE(at);
    let target = null;
    let kind = null;
    if (opcode >= 0x6000 && opcode <= 0x6fff) {
      const low = opcode & 0xff;
      if (low === 0 && at + 4 > IMG.length) continue;
      const displacement = low === 0 ? signed16(IMG.readUInt16BE(at + 2)) : signed8(low);
      target = at + 2 + displacement;
      kind = (opcode & 0xff00) === 0x6100 ? 'BSR'
        : ((opcode & 0xff00) === 0x6000 ? 'BRA' : 'Bcc');
    } else if ((opcode & 0xf0f8) === 0x50c8) {
      if (at + 4 > IMG.length) continue;
      target = at + 2 + signed16(IMG.readUInt16BE(at + 2));
      kind = 'DBcc';
    } else if ((opcode & 0xffc0) === 0x4e80 || (opcode & 0xffc0) === 0x4ec0) {
      const prefix = (opcode & 0xffc0) === 0x4e80 ? 'JSR' : 'JMP';
      const mode = (opcode >> 3) & 7;
      const reg = opcode & 7;
      if (mode === 7 && reg === 0) {
        if (at + 4 > IMG.length) continue;
        target = signed16(IMG.readUInt16BE(at + 2));
        kind = `${prefix}.W`;
      } else if (mode === 7 && reg === 1) {
        if (at + 6 > IMG.length) continue;
        target = IMG.readUInt32BE(at + 2);
        kind = `${prefix}.L`;
      } else if (mode === 7 && reg === 2) {
        if (at + 4 > IMG.length) continue;
        target = at + 2 + signed16(IMG.readUInt16BE(at + 2));
        kind = `${prefix}.PC16`;
      } else if (mode === 7 && reg === 3) {
        if (at + 4 > IMG.length) continue;
        const extension = IMG.readUInt16BE(at + 2);
        indexed.push([at, prefix, at + 2 + signed8(extension & 0xff), extension]);
      }
    }
    if (target !== null && target >= start && target < end) hits.push([at, kind, target]);
  }
  return { hits, indexed, scanned };
}

function exactLongwordReferencesInto(start, end) {
  const refs = [];
  for (let at = 0; at + 4 <= IMG.length; at += 2) {
    const target = IMG.readUInt32BE(at);
    if (target >= start && target < end) refs.push([at, target]);
  }
  return refs;
}

function imageRom(overrides = new Map()) {
  return {
    u8: (at) => overrides.has(at) ? overrides.get(at) : IMG.readUInt8(at),
    u16: (at) => IMG.readUInt16BE(at),
    i16: (at) => IMG.readInt16BE(at),
    u32: (at) => IMG.readUInt32BE(at),
    bytes: (at, count) => IMG.subarray(at, at + count),
  };
}

function tableRom(values, reads) {
  return {
    u8(at) {
      assert.ok(at >= RNG_242E24.table && at < RNG_242E24.table + RNG_242E24.entries,
        `read $${at.toString(16)} stays inside the exact table`);
      reads.push(at);
      return values[at - RNG_242E24.table];
    },
  };
}

// Independent execution of the nine decoded instructions. This keeps machine
// register and CCR ownership separate from the JavaScript transcription.
function registerModel({ d0, a0, a7, state, tableByte, x }) {
  const highState = state & 0xff00;
  state = highState | ((state + 1) & 0xff);
  d0 = 0x0000007f;
  d0 = (d0 & 0xffff0000) | ((d0 & state) & 0xffff);
  a7 = (a7 - 4) >>> 0;
  const savedA0 = a0 >>> 0;
  a0 = RNG_242E24.table;
  d0 = ((d0 & 0xffffff00) | (tableByte & 0xff)) >>> 0;
  a0 = savedA0;
  a7 = (a7 + 4) >>> 0;
  const n = (tableByte & 0x80) !== 0 ? 0x08 : 0;
  const z = (tableByte & 0xff) === 0 ? 0x04 : 0;
  return { d0, a0, a7, state, ccr: (x ? 0x10 : 0) | n | z };
}

function freshEnemy(type) {
  const ram = new Ram();
  const a5 = 0x81332c;
  const a6 = 0x81459c;
  ram.setU16(a5, 0x8000 | type);
  ram.setU16(a5 + 0x04, 0);
  ram.setU32(a5 + 0x06, a6);
  ram.setU32(a5 + 0x12, 0);
  ram.setU8(a5 + 0x0c, type);
  ram.setU16(0x813092, 0);
  ram.setU16(0x813094, 0);
  ram.setU16(0x8130b2, 0);
  ram.setU16(0x8130b4, 0);
  ram.setU16(0x8130b6, 4);
  ram.setU16(0x8130ba, 0);
  ram.setU16(0x8130bc, 0);
  ram.setU16(0x8130ce, 0);
  ram.setU16(0x8103e6, 0x8000);
  ram.setU16(0x8103e8, 0x6000);
  ram.setU16(0x8103ea, 0x5000);
  return { ram, a5, a6 };
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// ---------------------------------------------------------------- SECTION 1

test('SECTION 1: exact complete cartridge body, all instructions and adjacent boundaries are pinned',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(IMG.length, 0x600000, 'the complete main CPU image is 6 MiB');
    assert.equal(sha256(IMG), IMAGE_SHA256);
    assert.equal(BODY_END - BODY_START, 0x1e, 'the body is exactly 30 bytes');
    assert.deepEqual(bytes(BODY_START, BODY_END - BODY_START), Buffer.from(BODY_HEX, 'hex'));
    assert.equal(sha256(bytes(BODY_START, BODY_END - BODY_START)), BODY_SHA256);

    for (const [at, hex, mnemonic] of BODY_INSTRUCTIONS) {
      assert.deepEqual(bytes(at, hex.length / 2), Buffer.from(hex, 'hex'),
        `$${at.toString(16).toUpperCase()} ${mnemonic}`);
    }
    assert.equal(BODY_INSTRUCTIONS.reduce((sum, [, hex]) => sum + hex.length / 2, 0),
      BODY_END - BODY_START, 'all nine instructions consume the half-open body without gaps');

    const priorTable = bytes(PRIOR_TABLE_START, BODY_START - PRIOR_TABLE_START);
    assert.equal(priorTable.length, 256, 'the preceding `$242D24` table is exactly 256 bytes');
    assert.equal(sha256(priorTable), PRIOR_TABLE_SHA256);
    assert.deepEqual(bytes(BODY_START - 8, 8), Buffer.from('02030704fef900ff0207fafdfb'.slice(-16), 'hex'),
      'the preceding data ends exactly at the body, with no executable fallthrough');

    const table = bytes(BODY_END, TABLE_END - BODY_END);
    assert.equal(table.length, RNG_242E24.entries);
    assert.equal(sha256(table), TABLE_SHA256);
    assert.deepEqual(bytes(BODY_END, 8), Buffer.from('05223516022e0e25', 'hex'),
      '$242E42 begins the indexed table immediately after RTS');
    assert.deepEqual(bytes(TABLE_END, NEXT_BODY_HEX.length / 2), Buffer.from(NEXT_BODY_HEX, 'hex'));
    assert.equal(sha256(bytes(TABLE_END, NEXT_BODY_HEX.length / 2)), NEXT_BODY_SHA256,
      '$242EC2 begins the next routine exactly after the 128-byte table');
  });

// ---------------------------------------------------------------- SECTION 2

test('SECTION 2: complete aligned transfer, indexed-PC and exact-longword census is exact',
  { skip: SKIP_IMAGE }, () => {
    const { hits, indexed, scanned } = transferCensus(BODY_START, BODY_END);
    assert.equal(scanned, IMG.length / 2, 'all 3,145,728 aligned opcode words are examined');
    assert.deepEqual(hits, EXTERNAL_CALLERS.map((at) => [at, 'JSR.L', BODY_START]),
      'all 37 static entries are absolute-long calls to the head');
    assert.equal(hits.some(([, , target]) => target !== BODY_START), false,
      'there is no internal static entry');
    assert.equal(indexed.length, 110, 'all aligned indexed-PC JSR/JMP candidates are inventoried');
    assert.deepEqual(indexed.filter(([, , base]) => base >= BODY_START && base < BODY_END), [],
      'no indexed-PC zero-index base enters the body');
    assert.deepEqual(exactLongwordReferencesInto(BODY_START, BODY_END),
      EXTERNAL_CALLERS.map((at) => [at + 2, BODY_START]),
      'the only exact longwords are the 37 JSR operands');
  });

test('SECTION 2b: every direct caller and its first continuation instruction is byte-exact',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(CALLER_SPANS.length, EXTERNAL_CALLERS.length);
    assert.deepEqual(CALLER_SPANS.map(([start]) => start), EXTERNAL_CALLERS);
    for (const [start, end, hex, continuation] of CALLER_SPANS) {
      assert.equal(end - start, hex.length / 2, `$${start.toString(16)} ${continuation} span`);
      assert.deepEqual(bytes(start, end - start), Buffer.from(hex, 'hex'),
        `$${start.toString(16).toUpperCase()} then ${continuation}`);
    }
    assert.equal(CALLER_SPANS.some(([, , , continuation]) => /^b/i.test(continuation)), false,
      'no immediate continuation consumes the returned SR');
    assert.equal(CALLER_SPANS.every(([, , , continuation]) => /D0/i.test(continuation)), true,
      'every direct caller immediately consumes returned D0');
  });

// ---------------------------------------------------------------- SECTION 3

test('SECTION 3: byte counter, word mask, table boundaries and dirty ownership are exact', () => {
  const values = Uint8Array.from({ length: 128 }, (_, i) => (i * 197 + 0x43) & 0xff);
  values[0] = 0;
  values[0x7f] = 0xff;
  for (const [initial, expectedIndex] of [
    [0xa57e, 0x7f], [0xa57f, 0x00], [0xa5fe, 0x7f], [0xa5ff, 0x00],
  ]) {
    const reads = [];
    const ram = new Ram();
    ram.setU8(RNG.state - 1, 0x3c);
    ram.setU16(RNG.state, initial);
    ram.setU8(RNG.counter + 1, 0xc3);
    const out = drawByte242E24(ram, tableRom(values, reads));
    assert.equal(out, values[expectedIndex]);
    assert.deepEqual(reads, [RNG_242E24.table + expectedIndex]);
    assert.equal(ram.u16(RNG.state), (initial & 0xff00) | ((initial + 1) & 0xff),
      'ADDQ.B wraps without carrying into the dirty high state byte');
    assert.equal(ram.u8(RNG.state - 1), 0x3c, 'lower adjacent sentinel survives');
    assert.equal(ram.u8(RNG.counter + 1), 0xc3, 'upper adjacent sentinel survives');
  }
});

test('SECTION 3b: all 256 recycled draws repeat the exact 128-entry real table',
  { skip: SKIP_IMAGE }, () => {
    const ram = new Ram();
    const rom = imageRom();
    ram.setU16(RNG.state, 0);
    const got = Array.from({ length: 256 }, () => drawByte242E24(ram, rom));
    const expected = Array.from({ length: 256 }, (_, n) =>
      IMG.readUInt8(RNG_242E24.table + ((n + 1) & 0x7f)));
    assert.deepEqual(got, expected);
    assert.deepEqual(got.slice(0, 128), got.slice(128), 'masking repeats after 128 draws');
    assert.equal(ram.u16(RNG.state), 0, 'the low counter wraps after 256 byte increments');
    assert.equal(Math.min(...got), 0);
    assert.equal(Math.max(...got), 0x3f, 'the real table values occupy the measured 0..$3F range');
  });

test('SECTION 3c: dirty D0 is fully owned, A0 and A7 return, and final CCR follows the byte', () => {
  assert.deepEqual(registerModel({
    d0: 0xdeadbeef, a0: 0xa5c31234, a7: 0x810040, state: 0x7e, tableByte: 0, x: false,
  }), {
    d0: 0, a0: 0xa5c31234, a7: 0x810040, state: 0x7f, ccr: 0x04,
  }, 'MOVEQ owns all D0 bits, zero result sets only Z, and stack/A0 restore exactly');
  assert.deepEqual(registerModel({
    d0: 0xffffffff, a0: 0x12345678, a7: 0x810044, state: 0xabff, tableByte: 0x80, x: true,
  }), {
    d0: 0x80, a0: 0x12345678, a7: 0x810044, state: 0xab00, ccr: 0x18,
  }, 'dirty state high byte survives, D0 is zero-extended, N follows bit 7 and X survives');
  assert.deepEqual(registerModel({
    d0: 0x80000000, a0: 0xffffffff, a7: 0x810048, state: 0xff7e, tableByte: 0x7f, x: true,
  }), {
    d0: 0x7f, a0: 0xffffffff, a7: 0x810048, state: 0xff7f, ccr: 0x10,
  }, 'positive nonzero return clears N/Z/V/C and preserves X');
});

// ---------------------------------------------------------------- SECTION 4

test('SECTION 4: real type $11 caller uses the canonical unsigned byte and dirty state safely',
  { skip: SKIP_IMAGE }, () => {
    const { ram, a5 } = freshEnemy(0x11);
    const overrides = new Map([[RNG_242E24.table + 0x7f, 0xff]]);
    ram.setU16(RNG.state, 0xa57e);
    runInitBodyAddr(0x26871c, ram, imageRom(overrides), a5, { note() {} });
    const prototype = IMG.readUInt8(0x268808 + (0x28 - 0x16));
    assert.equal(ram.u8(a5 + 0x28), (prototype + 0x7f) & 0xff,
      '$268744 LSR.B treats $FF as unsigned 127 after the draw');
    assert.equal(ram.u16(RNG.state), 0xa57f,
      'the real caller advances only the low byte and preserves dirty high state');
  });

test('SECTION 4b: real type $8D caller exercises positive and negative signed-byte halves',
  { skip: SKIP_IMAGE }, () => {
    const prototype = IMG.readUInt8(0x2769ce + (0x1a - 0x16));
    for (const [tableByte, signedHalf] of [[0x7e, 0x3f], [0x80, -0x40]]) {
      const { ram, a5 } = freshEnemy(0x8d);
      const overrides = new Map([[RNG_242E24.table + 0x7f, tableByte]]);
      ram.setU16(RNG.state, 0x007d);
      runInitBodyAddr(0x276946, ram, imageRom(overrides), a5, { note() {} });
      assert.equal(ram.u8(a5 + 0x1a), (prototype + signedHalf) & 0xff,
        `$27699C ASR.B caller observes $${tableByte.toString(16)} with signed byte ownership`);
      assert.equal(ram.u16(RNG.state), 0x007f,
        '$242EC2 and then $242E24 take exactly two shared-counter draws');
    }
  });

// ---------------------------------------------------------------- SECTION 5

test('SECTION 5: one canonical source body serves all production calls with no cycle or stale wrapper',
  () => {
    const sourceMap = new Map(sources());
    const allCode = stripComments([...sourceMap.values()].join('\n'));
    const declarations = allCode.match(/\bfunction\s+drawByte242E24\s*\(/g) ?? [];
    const calls = allCode.match(/\bdrawByte242E24\s*\(/g) ?? [];
    assert.equal(declarations.length, 1, 'rng.js owns the sole canonical declaration');
    assert.equal(calls.length, 20, 'nineteen production calls plus one declaration remain');
    assert.doesNotMatch(allCode, /\brankByte242E24\b/, 'the private duplicate cannot regrow');
    assert.equal('rankByte242E24' in initbodyModule, false,
      'the removed private name had no public compatibility identity to preserve');

    for (const [file, count] of SOURCE_CALL_COUNTS) {
      const code = stripComments(sourceMap.get(file));
      assert.equal((code.match(/\bdrawByte242E24\s*\(/g) ?? []).length, count,
        `${file} canonical call count`);
    }
    assert.equal(SOURCE_CALL_COUNTS.reduce((sum, [, count]) => sum + count, 0), 19);

    const init = sourceMap.get('initbody.js');
    assert.match(init, /import \{[\s\S]*drawByte242E24[\s\S]*\} from '\.\/rng\.js';/,
      'initbody imports the existing RNG dependency');
    assert.doesNotMatch(sourceMap.get('rng.js'), /from '\.\/initbody\.js'/,
      'the canonical dependency direction introduces no cycle');
    assert.match(init, /d0 = drawByte242E24\(ram, rom\) >> 1;\s+\/\/ \$26874A lsr\.b/,
      'type $11 retains its unsigned byte continuation');
    assert.match(init, /const rankByte = drawByte242E24\(ram, rom\);[\s\S]*signedHalf = \(\(rankByte << 24\) >> 24\) >> 1;/,
      'type $8D retains its signed byte continuation');

    const scanned = scanFile(sourceMap.get('rng.js'));
    const body = scanned.heads.find((head) => head.name === 'drawByte242E24');
    assert.ok(body, 'canonical function head exists');
    const text = scanned.lines.slice(body.line, body.endLine + 1).join('\n');
    assert.match(text, /setU8\(RNG\.counter, \(ram\.u8\(RNG\.counter\) \+ 1\) & 0xff\)/,
      'source transcribes ADDQ.B ownership');
    assert.match(text, /u16\(ram\.u16\(RNG\.state\)\) & 0x7f/,
      'source transcribes MOVEQ plus AND.W');
    assert.match(text, /rom\.u8\(RNG_242E24\.table \+ i\)/,
      'source transcribes the indexed byte read');
  });

test('SECTION 5b: cartridge static reachability, production source coverage and indirect uncertainty stay separate',
  () => {
    assert.equal(SOURCE_REPRESENTED_SITES.length, 20,
      'nineteen source calls represent twenty cartridge sites because the bee body serves two copies');
    assert.equal(SOURCE_GAPS.length, 17);
    assert.deepEqual([...SOURCE_REPRESENTED_SITES, ...SOURCE_GAPS].sort((a, b) => a - b),
      [...EXTERNAL_CALLERS], 'source-covered sites and explicit gaps partition the static callers');
    assert.ok(SOURCE_GAPS.includes(0x288cd4),
      '$288CD4 remains the optional rankByte context gap, not invented reachability');
    assert.equal('dynamic indirect reachability remains unproved',
      'dynamic indirect reachability remains unproved');
  });

// ---------------------------------------------------------------- SECTION 6

test('SECTION 6: live registers reconcile to 16 narrow, 81 widened, 27 pairs and 22 body-only',
  () => {
    const narrow = [...narrowIndex()].filter(([, claims]) => claims.size > 1);
    const heads = headRegister();
    const pairs = bodyPairs();
    const visibleHeads = new Set();
    for (const [, claims] of headIndex().idx) {
      if (claims.size < 2) continue;
      for (const key of claims.keys()) visibleHeads.add(key.replace(/:\d+ /, ' '));
    }
    const bodyOnly = pairs.filter(([pair]) => pair.split(' <> ')
      .some((body) => !visibleHeads.has(body)));

    assert.equal(narrow.length, 16, 'the private init helper never formed a narrow export row');
    assert.equal(heads.length, 81, 'W463 removes $28C0FC to leave 83; W464 removes $28E7A2 to leave 82; W465 removes $28C6C6 to leave 81');
    assert.equal(heads.includes(BODY_START), false, '$242E24 leaves the widened head register');
    assert.equal(heads.includes(0x2414be), false, '$2414BE leaves the widened head register in W462');
    assert.equal(pairs.length, 27, 'W461 removes the two-marker duplicate body edge');
    assert.equal(pairs.some(([pair]) => /rankByte242E24/.test(pair)), false,
      'the private duplicate body pair cannot regrow');
    assert.equal(bodyOnly.length, 22,
      'body-only findings are derived live from headIndex(), never copied arithmetic');
  });

test('SECTION 6b: the existing exact ROM window is retained without exporting code bytes', () => {
  const exporter = readFileSync(join(ROOT, 'tools', 'export-tables.py'), 'utf8');
  assert.equal((exporter.match(/\(0x242E42, 0x0080,/g) ?? []).length, 1,
    'the pre-existing exact 128-byte table window remains singular');
  assert.doesNotMatch(exporter, /\(0x242E24,\s*0x/,
    'the raw-image body proof adds no production code window');
  assert.equal(RNG_242E24.table, BODY_END);
  assert.equal(RNG_242E24.table + RNG_242E24.entries, TABLE_END);
});
