// WAVE 460 (D69) -- AUDIT AND CORRECT THE TWO `$24631C` SOURCE CLAIMS.
//
// The cartridge has one 80-byte animation-pool clear. stageend.js carried its
// RAM behavior, while objslot8.js carried only an optional ctx forwarding shim
// that became a production no-op. W460 keeps the verified body, removes every
// invented optional gate, and routes all six source-reachable caller bodies to
// the one exported implementation. This regression pins the complete cartridge
// evidence, dirty write ownership, caller ordering, source reachability, and the
// live widened-register correction.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TxVram } from '../src/background.js';
import { objSlot13, SCREEN13 } from '../src/objslot13.js';
import { objSlot14, SLOT14 } from '../src/objslot14.js';
import {
  objSlot8, SCREEN8, teardown25A9B2,
} from '../src/objslot8.js';
import { ALLOC } from '../src/objalloc.js';
import { Ram } from '../src/ram.js';
import {
  CLEAR24631C, clear24631C, makeStageClear,
} from '../src/stageend.js';
import { TALLY } from '../src/tally.js';
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
const ROM = HAVE_IMAGE ? {
  u8: (at) => IMG.readUInt8(at),
  u16: (at) => IMG.readUInt16BE(at),
  i16: (at) => IMG.readInt16BE(at),
  u32: (at) => IMG.readUInt32BE(at),
  bytes: (at, count) => IMG.subarray(at, at + count),
} : null;

const IMAGE_SHA256 = '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c';
const BODY_START = 0x24631c;
const BODY_END = 0x24636c;
const BODY_HEX = '41f90080fa86303c04af30fc000051c8fffa7e0241f9008103464250317c00000004217c00000000002c41e8003051cfffea3e3c001341f90080fa864250217c00000000002c41e8007051cffff04e75';
const BODY_SHA256 = '137f82cec8408762cfa4d794873d9004e99b3eda0882ea47a4d6afad15b61ad7';
const PRIOR_START = 0x246292;
const PRIOR_HEX = '48e77f003e01320034013601380102427c00024303e00244001f700ae06aea4be142e143e144ea42ea43ea44c5c7c7c7c9c7e042e043e04402427fff02437fff02447fff0c42001f6f000006343c001f0c43001f6f000006363c001f0c44001f6f000006383c001f700ae16aeb4b02427c00024303e00244001f720082428243824430014cdf00fe4e75';
const PRIOR_SHA256 = '7618bcd449ae591a909485d6864e289bc518dc0762e5113d00c0a151f7f8dd9f';
const POOL_START = 0x80fa86;
const POOL_END = 0x8103e6;

const BODY_INSTRUCTIONS = Object.freeze([
  [0x24631c, '41f90080fa86', 'lea.l $80FA86,A0'],
  [0x246322, '303c04af', 'move.w #$04AF,D0'],
  [0x246326, '30fc0000', 'move.w #$0000,(A0)+'],
  [0x24632a, '51c8fffa', 'dbra D0,$246326'],
  [0x24632e, '7e02', 'moveq #$02,D7'],
  [0x246330, '41f900810346', 'lea.l $810346,A0'],
  [0x246336, '4250', 'clr.w (A0)'],
  [0x246338, '317c00000004', 'move.w #$0000,$4(A0)'],
  [0x24633e, '217c00000000002c', 'move.l #$00000000,$2C(A0)'],
  [0x246346, '41e80030', 'lea.l $30(A0),A0'],
  [0x24634a, '51cfffea', 'dbra D7,$246336'],
  [0x24634e, '3e3c0013', 'move.w #$0013,D7'],
  [0x246352, '41f90080fa86', 'lea.l $80FA86,A0'],
  [0x246358, '4250', 'clr.w (A0)'],
  [0x24635a, '217c00000000002c', 'move.l #$00000000,$2C(A0)'],
  [0x246362, '41e80070', 'lea.l $70(A0),A0'],
  [0x246366, '51cffff0', 'dbra D7,$246358'],
  [0x24636a, '4e75', 'rts'],
]);

const EXTERNAL_CALLERS = Object.freeze([
  0x23bf3e, 0x256db0, 0x25a7c6, 0x25a956, 0x25a9b8,
  0x288a48, 0x288c52, 0x28d578, 0x28d5fa,
]);

const CALLER_SPANS = Object.freeze([
  [0x23bf38, 0x23bf4a, '4eb9002412fe4eb90024631c4eb90023d1f2',
    'reset prologue: $2412FE, clear, then $23D1F2'],
  [0x256daa, 0x256dc6, '4eb90024107c4eb90024631c4eb90028c0fc303c00104eb900241182',
    'main-loop call 1: object reset, clear, stream cue, type $10 create'],
  [0x25a7c0, 0x25a7d8, '4eb90024107c4eb90024631c4eb90025c57e4a7900803926',
    'slot 8 coin teardown: object reset, clear, screen clear, then TST.W'],
  [0x25a94a, 0x25a968, '4a2d000366181b7c000100034eb90024631c4eb90025bbb44eb90028c170',
    'slot 8 arm 3: init latch, clear, screen init, then BGM'],
  [0x25a9b2, 0x25a9ca, '4eb90024107c4eb90024631c4eb90025c57e4eb90023c622',
    'slot 8 arm 5 teardown: object reset, clear, screen clear, TX clear'],
  [0x288a3c, 0x288a5e, '4eb90028c1704eb90028c0fc4eb90024631c4eb90024107c303c000e4ef900241182',
    'slot 13 state 4: two cues, clear, object reset, then type $E create'],
  [0x288c3e, 0x288c68, '536d001c660000267000323c00064eb90025ff384eb90024631c303c000c4eb9002411824ef900241292',
    'slot 14 state 2: countdown, request 6, clear, type $C create, then kill'],
  [0x28d566, 0x28d586, '1b7c000100021b7c000000061b7c000400074eb90024631c61d24eb900287dc8',
    'type 6 init: phase, state and frame stores, clear, result clear, pool clear'],
  [0x28d5fa, 0x28d60a, '4eb90024631c4eb90024107c4ebaff4a',
    'type 19 internal arm: clear, object reset, then PC-relative result clear'],
]);

const SOURCE_CALLER_SITES = Object.freeze([
  0x25a7c6, 0x25a956, 0x25a9b8, 0x288a48, 0x288c52, 0x28d578,
]);
const SOURCE_GAPS = Object.freeze([0x23bf3e, 0x256db0, 0x28d5fa]);

function bytes(at, count) { return IMG.subarray(at, at + count); }
function signed8(value) { return (value & 0x80) !== 0 ? value - 0x100 : value; }
function signed16(value) { return (value & 0x8000) !== 0 ? value - 0x10000 : value; }
function snapshot(ram, base, length) {
  return Buffer.from(Array.from({ length }, (_, n) => ram.u8(base + n)));
}
function fillBytes(ram, base, length, salt) {
  for (let n = 0; n < length; n++) ram.setU8(base + n, (salt + n * 43) & 0xff);
}
function functionText(fileText, name) {
  const scanned = scanFile(fileText);
  const head = scanned.heads.find((candidate) => candidate.name === name);
  assert.ok(head, `${name} source head exists`);
  return scanned.lines.slice(head.line, head.endLine + 1).join('\n');
}
function assertOrder(text, needles, label) {
  let prior = -1;
  for (const needle of needles) {
    const at = text.indexOf(needle);
    assert.ok(at >= 0, `${label}: ${needle} exists`);
    assert.ok(at > prior, `${label}: ${needle} follows the prior operation`);
    prior = at;
  }
}

// Scan all 3,145,728 aligned words in the complete image. Static byte/word
// branches, DBcc, absolute.W/L and PC-relative JSR/JMP are decoded. Indexed-PC
// candidates are inventoried separately because their index register is dynamic.
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

class RecordingRam extends Ram {
  constructor() {
    super();
    this.writes = [];
  }
  setU16(at, value) {
    super.setU16(at, value);
    this.writes.push(['W', at, value & 0xffff]);
  }
  setU32(at, value) {
    super.setU32(at, value);
    this.writes.push(['L', at, value >>> 0]);
  }
}

function expectedWrites() {
  const out = [];
  for (let i = 0; i < CLEAR24631C.clearWords; i++) {
    out.push(['W', CLEAR24631C.nodeBase + i * 2, 0]);
  }
  for (let i = 0; i < CLEAR24631C.rootCount; i++) {
    const at = CLEAR24631C.rootBase + i * CLEAR24631C.rootStride;
    out.push(['W', at, 0], ['W', at + 4, 0], ['L', at + 0x2c, 0]);
  }
  for (let i = 0; i < CLEAR24631C.nodeCount; i++) {
    const at = CLEAR24631C.nodeBase + i * CLEAR24631C.nodeStride;
    out.push(['W', at, 0], ['L', at + 0x2c, 0]);
  }
  return out;
}

// Independent register/CCR execution for the decoded loops. This is not the RAM
// transcription and deliberately begins with dirty incoming register halves.
function registerModel({ d0, d7, x }) {
  let a0 = CLEAR24631C.nodeBase;
  d0 = ((d0 & 0xffff0000) | 0x04af) >>> 0;
  do {
    a0 += 2;
    d0 = ((d0 & 0xffff0000) | ((d0 - 1) & 0xffff)) >>> 0;
  } while ((d0 & 0xffff) !== 0xffff);

  d7 = 2; // MOVEQ owns the full register.
  a0 = CLEAR24631C.rootBase;
  do {
    a0 += CLEAR24631C.rootStride;
    d7 = ((d7 & 0xffff0000) | ((d7 - 1) & 0xffff)) >>> 0;
  } while ((d7 & 0xffff) !== 0xffff);

  d7 = ((d7 & 0xffff0000) | 0x0013) >>> 0;
  a0 = CLEAR24631C.nodeBase;
  do {
    a0 += CLEAR24631C.nodeStride;
    d7 = ((d7 & 0xffff0000) | ((d7 - 1) & 0xffff)) >>> 0;
  } while ((d7 & 0xffff) !== 0xffff);
  return { a0, d0, d7, ccr: (x ? 0x10 : 0) | 0x04 };
}

function callerWorld() {
  const ram = new Ram();
  const notes = [];
  const cues = [];
  const ctx = {
    tx: new TxVram(),
    unported: { note: (at, why) => notes.push([at, why]) },
    unportedLog: { note() {} },
    soundPost: (at) => { cues.push(at); return true; },
  };
  return { ram, ctx, notes, cues };
}
function dirtyPoolEdges(ram, value = 0xa55a) {
  ram.setU16(POOL_START, value);
  ram.setU16(POOL_END - 2, value ^ 0xffff);
}
function assertPoolEdgesCleared(ram, label) {
  assert.equal(ram.u16(POOL_START), 0, `${label}: first pool word`);
  assert.equal(ram.u16(POOL_END - 2), 0, `${label}: last pool word`);
}

// ---------------------------------------------------------------- SECTION 1

test('SECTION 1: Build-B image, exact complete body and both adjacent boundaries are pinned',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(IMG.length, 0x600000, 'the complete main CPU image is 6 MiB');
    assert.equal(createHash('sha256').update(IMG).digest('hex'), IMAGE_SHA256);
    assert.equal(BODY_END - BODY_START, 0x50, 'the routine is exactly 80 bytes');
    assert.deepEqual(bytes(BODY_START, BODY_END - BODY_START), Buffer.from(BODY_HEX, 'hex'));
    assert.equal(createHash('sha256').update(bytes(BODY_START, 0x50)).digest('hex'), BODY_SHA256);

    for (const [at, hex, mnemonic] of BODY_INSTRUCTIONS) {
      assert.deepEqual(bytes(at, hex.length / 2), Buffer.from(hex, 'hex'),
        `$${at.toString(16).toUpperCase()} ${mnemonic}`);
    }
    assert.equal(BODY_INSTRUCTIONS.reduce((sum, [, hex]) => sum + hex.length / 2, 0), 0x50,
      'the 18 instructions consume the complete half-open body without gaps');

    const prior = bytes(PRIOR_START, BODY_START - PRIOR_START);
    assert.deepEqual(prior, Buffer.from(PRIOR_HEX, 'hex'),
      '[$246292,$24631C) is the complete preceding brightness routine');
    assert.equal(createHash('sha256').update(prior).digest('hex'), PRIOR_SHA256);
    assert.equal(IMG.readUInt16BE(BODY_START - 2), 0x4e75,
      '$24631A RTS prevents prior fallthrough into the clear');
    assert.deepEqual(bytes(BODY_END, 8), Buffer.from('48e7c08041fa0846', 'hex'),
      '$24636C starts a distinct MOVEM.L/LEA routine');
  });

test('SECTION 1b: metadata and decoded loop/register semantics own the exact cartridge widths',
  { skip: SKIP_IMAGE }, () => {
    assert.deepEqual(CLEAR24631C, {
      entry: BODY_START, end: BODY_END, bytes: 0x50,
      nodeBase: POOL_START, clearWords: 0x4b0,
      rootBase: 0x810346, rootCount: 3, rootStride: 0x30,
      nodeCount: 20, nodeStride: 0x70,
    });
    assert.equal(IMG.readUInt16BE(0x246324), 0x04af, 'D0.W DBRA seed is $04AF');
    assert.equal(CLEAR24631C.clearWords, 0x04af + 1, 'DBRA performs $04B0 stores');
    assert.equal(POOL_START + CLEAR24631C.clearWords * 2, POOL_END,
      '1200 word stores own exactly [$80FA86,$8103E6)');
    assert.equal(IMG.readUInt16BE(0x24632e), 0x7e02, 'MOVEQ #2 owns all of D7');
    assert.equal(IMG.readUInt16BE(0x246350), 0x0013, 'the node loop seeds only D7.W with $13');
    assert.equal(CLEAR24631C.nodeBase + CLEAR24631C.nodeCount * CLEAR24631C.nodeStride,
      CLEAR24631C.rootBase, 'twenty $70 strides finish exactly at the root-table base');

    assert.deepEqual(registerModel({ d0: 0xa5c31234, d7: 0xdeadbeef, x: false }), {
      a0: 0x810346, d0: 0xa5c3ffff, d7: 0x0000ffff, ccr: 0x04,
    }, 'MOVE.W preserves dirty D0 high word, MOVEQ owns D7, final zero MOVE sets Z');
    assert.deepEqual(registerModel({ d0: 0x7e8f0000, d7: 0xffffffff, x: true }), {
      a0: 0x810346, d0: 0x7e8fffff, d7: 0x0000ffff, ccr: 0x14,
    }, 'X survives while final NZVC is N=0 Z=1 V=0 C=0');
  });

// ---------------------------------------------------------------- SECTION 2

test('SECTION 2: complete aligned transfer, indexed-PC and exact-longword census is exact',
  { skip: SKIP_IMAGE }, () => {
    const { hits, indexed, scanned } = transferCensus(BODY_START, BODY_END);
    assert.equal(scanned, IMG.length / 2,
      'every aligned opcode word through $5FFFFE is examined');
    assert.deepEqual(hits, [
      [0x23bf3e, 'JSR.L', BODY_START],
      [0x24632a, 'DBcc', 0x246326],
      [0x24634a, 'DBcc', 0x246336],
      [0x246366, 'DBcc', 0x246358],
      [0x256db0, 'JSR.L', BODY_START],
      [0x25a7c6, 'JSR.L', BODY_START],
      [0x25a956, 'JSR.L', BODY_START],
      [0x25a9b8, 'JSR.L', BODY_START],
      [0x288a48, 'JSR.L', BODY_START],
      [0x288c52, 'JSR.L', BODY_START],
      [0x28d578, 'JSR.L', BODY_START],
      [0x28d5fa, 'JSR.L', BODY_START],
    ], 'nine external entry calls and exactly three internal DBRA edges enter the body');
    assert.deepEqual(hits.filter(([at, , target]) => !EXTERNAL_CALLERS.includes(at)
      && target !== 0x246326 && target !== 0x246336 && target !== 0x246358), [],
    'no unclassified static transfer enters the routine');
    assert.equal(indexed.length, 110,
      'all aligned indexed-PC JSR/JMP opcode candidates are inventoried');
    assert.deepEqual(indexed.filter(([, , base]) => base >= BODY_START && base < BODY_END), [],
      'no indexed-PC zero-index base enters the body');
    assert.deepEqual(exactLongwordReferencesInto(BODY_START, BODY_END), [
      [0x23bf40, BODY_START], [0x256db2, BODY_START], [0x25a7c8, BODY_START],
      [0x25a958, BODY_START], [0x25a9ba, BODY_START], [0x288a4a, BODY_START],
      [0x288c54, BODY_START], [0x28d57a, BODY_START], [0x28d5fc, BODY_START],
    ], 'all nine exact longwords are operands of the nine absolute-long JSRs');
  });

test('SECTION 2b: every cartridge caller span and immediate continuation is byte-exact',
  { skip: SKIP_IMAGE }, () => {
    for (const [start, end, hex, label] of CALLER_SPANS) {
      assert.deepEqual(bytes(start, end - start), Buffer.from(hex, 'hex'), label);
    }
    assert.deepEqual(EXTERNAL_CALLERS, CALLER_SPANS.map(([start, , hex]) => {
      const bodyOffset = Buffer.from(hex, 'hex').indexOf(Buffer.from('4eb90024631c', 'hex'));
      return start + bodyOffset;
    }), 'the nine pinned spans each contain their one direct clear call');
    assert.deepEqual([
      [0x23bf44, IMG.readUInt16BE(0x23bf44)],
      [0x256db6, IMG.readUInt16BE(0x256db6)],
      [0x25a7cc, IMG.readUInt16BE(0x25a7cc)],
      [0x25a95c, IMG.readUInt16BE(0x25a95c)],
      [0x25a9be, IMG.readUInt16BE(0x25a9be)],
      [0x288a4e, IMG.readUInt16BE(0x288a4e)],
      [0x288c58, IMG.readUInt16BE(0x288c58)],
      [0x28d57e, IMG.readUInt16BE(0x28d57e)],
      [0x28d600, IMG.readUInt16BE(0x28d600)],
    ], [
      [0x23bf44, 0x4eb9], [0x256db6, 0x4eb9], [0x25a7cc, 0x4eb9],
      [0x25a95c, 0x4eb9], [0x25a9be, 0x4eb9], [0x288a4e, 0x4eb9],
      [0x288c58, 0x303c], [0x28d57e, 0x61d2], [0x28d600, 0x4eb9],
    ], 'no immediate continuation conditionally consumes returned SR or reads A0/D0/D7');
  });

// ---------------------------------------------------------------- SECTION 3

test('SECTION 3: dirty contiguous range clears while both adjacent sentinels survive', () => {
  const ram = new Ram();
  fillBytes(ram, POOL_START - 8, POOL_END - POOL_START + 16, 0x39);
  const lower = snapshot(ram, POOL_START - 8, 8);
  const upper = snapshot(ram, POOL_END, 8);
  clear24631C(ram);

  assert.deepEqual(snapshot(ram, POOL_START - 8, 8), lower,
    'bytes below the first owned word remain dirty');
  assert.deepEqual(snapshot(ram, POOL_END, 8), upper,
    '$8103E6 and later bytes remain dirty');
  assert.deepEqual(snapshot(ram, POOL_START, POOL_END - POOL_START),
    Buffer.alloc(POOL_END - POOL_START),
    'all 2400 bytes in the half-open owned range are zero');
  assert.equal(ram.u16(POOL_END - 2), 0, 'the final owned word at $8103E4 is cleared');
  assert.notEqual(ram.u16(POOL_END), 0, 'the adjacent player/root sentinel is not widened into');
});

test('SECTION 3b: exact write trace preserves every redundant root and node rewrite in order', () => {
  const ram = new RecordingRam();
  fillBytes(ram, POOL_START, POOL_END - POOL_START, 0xa7);
  clear24631C(ram);
  const expected = expectedWrites();
  assert.equal(expected.length, 1249,
    '1200 contiguous WORDs, 6 root WORDs, 3 root LONGs and 40 node writes');
  assert.deepEqual(ram.writes, expected, 'production emits every cartridge-real redundant write');

  const rootWrites = ram.writes.slice(1200, 1209);
  assert.deepEqual(rootWrites.map(([, at]) => at), [
    0x810346, 0x81034a, 0x810372,
    0x810376, 0x81037a, 0x8103a2,
    0x8103a6, 0x8103aa, 0x8103d2,
  ], 'three roots use $30 stride and +0.W, +4.W, +$2C.L ownership');
  const nodeWrites = ram.writes.slice(1209);
  assert.equal(nodeWrites.length, 40, 'twenty node records each retain +0.W then +$2C.L');
  for (let i = 0; i < 20; i++) {
    const base = POOL_START + i * 0x70;
    assert.deepEqual(nodeWrites.slice(i * 2, i * 2 + 2), [
      ['W', base, 0], ['L', base + 0x2c, 0],
    ], `node ${i} exact fields and order`);
  }
});

// ---------------------------------------------------------------- SECTION 4

test('SECTION 4: all six source-reachable callers clear dirty edges and reach their continuations',
  { skip: SKIP_IMAGE }, () => {
    const a5 = 0x812600;

    const coin = callerWorld();
    dirtyPoolEdges(coin.ram, 0xa501);
    coin.ram.setU8(a5 + SCREEN8.constructed, 1);
    coin.ram.setU16(SCREEN8.state, 4);
    coin.ram.setU8(SCREEN8.coinA, 1);
    objSlot8(coin.ram, ROM, a5, coin.ctx);
    assertPoolEdgesCleared(coin.ram, '$25A7C6 coin teardown');
    assert.equal(coin.ram.u16(ALLOC.createStage + ALLOC.typeOff) & 0x7fff, 8,
      '$25A824 continuation restages slot 8');
    assert.equal(coin.ram.u16(ALLOC.createStage + 4), 3,
      'the staged slot 8 parameter is state 3');

    const arm3 = callerWorld();
    dirtyPoolEdges(arm3.ram, 0xa502);
    arm3.ram.setU8(a5 + SCREEN8.constructed, 1);
    arm3.ram.setU16(SCREEN8.state, 3);
    arm3.ram.setU16(SCREEN8.p1Raw, 0x8000);
    arm3.ram.setU8(SCREEN8.creditA, 1);
    objSlot8(arm3.ram, ROM, a5, arm3.ctx);
    assertPoolEdgesCleared(arm3.ram, '$25A956 arm 3');
    assert.equal(arm3.ram.u16(SCREEN8.state), 0x000e,
      'arm 3 continuation reaches the joined coin-play state');
    assert.equal(arm3.ram.u8(SCREEN8.creditA), 0, 'the join continuation spends the credit');
    assert.deepEqual(arm3.cues, [0x28c170], 'arm 3 reached its post-clear BGM continuation');

    const arm5 = callerWorld();
    dirtyPoolEdges(arm5.ram, 0xa503);
    const made = teardown25A9B2(arm5.ram, ROM, arm5.ctx);
    assertPoolEdgesCleared(arm5.ram, '$25A9B8 arm 5 teardown');
    assert.equal(arm5.ram.u16(made.addr) & 0x7fff, 8, 'arm 5 restaged slot 8');
    assert.equal(arm5.ram.u16(made.addr + 4), 2, 'arm 5 continuation selected state 2');

    const slot13 = callerWorld();
    dirtyPoolEdges(slot13.ram, 0xa504);
    slot13.ram.setU8(a5 + SCREEN13.state, 4);
    objSlot13(slot13.ram, ROM, a5, slot13.ctx);
    assertPoolEdgesCleared(slot13.ram, '$288A48 slot 13 state 4');
    assert.equal(slot13.ram.u16(ALLOC.createStage + ALLOC.typeOff),
      SCREEN13.childType | 0x8000, 'slot 13 staged type $E after both clears');

    const slot14 = callerWorld();
    const a14 = 0x812400;
    dirtyPoolEdges(slot14.ram, 0xa505);
    slot14.ram.setU8(a14 + SLOT14.stateAt, 2);
    slot14.ram.setU16(a14 + 0x1c, 2);
    objSlot14(slot14.ram, ROM, a14, slot14.ctx);
    assert.equal(slot14.ram.u16(POOL_END - 2), 0x5afa,
      'opposite countdown arm returns before the mandatory clear');
    objSlot14(slot14.ram, ROM, a14, slot14.ctx);
    assertPoolEdgesCleared(slot14.ram, '$288C52 slot 14 state 2');
    assert.deepEqual([slot14.ram.u16(TALLY.side0), slot14.ram.u16(TALLY.side0 + 2)], [6, 0],
      'request 6 is externally visible before the clear/create/kill continuation');
    assert.equal(slot14.ram.u16(ALLOC.createStage + ALLOC.typeOff),
      SLOT14.childType | 0x8000, 'slot 14 staged type $C');

    const stage = callerWorld();
    const stageSlot = 0x81364c;
    dirtyPoolEdges(stage.ram, 0xa506);
    makeStageClear(ROM)(stage.ram, stageSlot, 0, stage.ctx);
    assertPoolEdgesCleared(stage.ram, '$28D578 type 6 init');
    assert.equal(stage.ram.u8(stageSlot + 2), 1, 'type 6 continuation owns phase 1');
    assert.equal(stage.ram.u8(stageSlot + 7), 4, 'type 6 continuation owns the four-frame count');
  });

// ---------------------------------------------------------------- SECTION 5

test('SECTION 5: source has one body, six direct caller bodies and no optional ctx gate', () => {
  const sourceMap = new Map(sources());
  const allCode = [...sourceMap.values()].join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const declarations = allCode.match(/\bfunction\s+clear24631C\s*\(/g) ?? [];
  const calls = allCode.match(/\bclear24631C\s*\(/g) ?? [];
  assert.equal(declarations.length, 1, 'one canonical production declaration remains');
  assert.equal(calls.length, 7, 'six calls plus the one declaration are present');
  assert.doesNotMatch(allCode, /ctx(?:\?\.)?\.clear24631C|clear24631C\?\./,
    'the cartridge call cannot degrade to an optional production no-op');

  const heads = [];
  for (const [file, text] of sourceMap) {
    const scanned = scanFile(text);
    for (const head of scanned.heads) {
      if (head.name === 'clear24631C') continue;
      const body = scanned.lines.slice(head.line, head.endLine + 1).join('\n');
      if (/\bclear24631C\s*\(/.test(body)) heads.push(`${file} ${head.name}`);
    }
  }
  assert.deepEqual(heads.sort(), [
    'objslot13.js state4',
    'objslot14.js state2',
    'objslot8.js arm3',
    'objslot8.js coinTeardown25A7C0',
    'objslot8.js teardown25A9B2',
    'stageend.js init28D566',
  ], 'every source-reachable caller body is inventoried');

  assert.equal(scanFile(sourceMap.get('objslot8.js')).heads
    .some((head) => head.name === 'clear24631C'), false,
  'the optional objslot8 forwarding shim cannot regrow');
  assert.equal(scanFile(sourceMap.get('stageend.js')).heads
    .filter((head) => head.name === 'clear24631C').length, 1,
  'stageend.js owns the sole verified implementation');
});

test('SECTION 5b: source caller ordering matches each cartridge context, not one invented order', () => {
  const sourceMap = new Map(sources());
  assertOrder(functionText(sourceMap.get('objslot8.js'), 'coinTeardown25A7C0'), [
    'objTableInit24107C(ram)', 'clear24631C(ram)', 'clear25C57E(ram)',
  ], 'coin teardown');
  assertOrder(functionText(sourceMap.get('objslot8.js'), 'arm3'), [
    'clear24631C(ram)', 'screen1Init25BBB4(ram, rom, ctx)', 'ctx?.soundPost?.(SCREEN8.cueBgm)',
  ], 'arm 3');
  assertOrder(functionText(sourceMap.get('objslot8.js'), 'teardown25A9B2'), [
    'objTableInit24107C(ram)', 'clear24631C(ram)', 'clear25C57E(ram)', 'clearTx23C622(ctx.tx)',
  ], 'arm 5 teardown');
  assertOrder(functionText(sourceMap.get('objslot13.js'), 'state4'), [
    'ctx.soundPost?.(0x28c170)', 'ctx.unported?.note(0x28c0fc', 'clear24631C(ram)',
    'objTableInit24107C(ram)', 'stageCreate(ram, SCREEN13.childType',
  ], 'slot 13 state 4');
  assertOrder(functionText(sourceMap.get('objslot14.js'), 'state2'), [
    'armRequest25FF38(ram, 0, 6)', 'clear24631C(ram)',
    'stageCreate(ram, SLOT14.childType', 'queueKill(ram, ram.u32(a5 + SLOT14.idAt))',
  ], 'slot 14 state 2');
  assertOrder(functionText(sourceMap.get('stageend.js'), 'init28D566'), [
    'ram.setU8(a5 + 0x07, 4)', 'clear24631C(ram)', 'clear28D552(ram)', 'clear287DC8(ram)',
  ], 'type 6 init');
});

test('SECTION 5c: cartridge and source reachability remain separate and dynamic indirects unproved',
  { skip: SKIP_IMAGE }, () => {
    assert.deepEqual(EXTERNAL_CALLERS.filter((at) => SOURCE_CALLER_SITES.includes(at)),
      SOURCE_CALLER_SITES, 'six cartridge sites have direct source caller bodies');
    assert.deepEqual(EXTERNAL_CALLERS.filter((at) => !SOURCE_CALLER_SITES.includes(at)),
      SOURCE_GAPS, 'reset prologue, main-loop call 1 and type 19 remain source gaps');

    const frontend = readFileSync(join(SRC, 'frontend.js'), 'utf8');
    const main = readFileSync(join(SRC, 'main.js'), 'utf8');
    assert.match(frontend, /23BF3E jsr \$24631C[\s\S]*runs NONE of them/,
      'reset prologue documents why the cartridge call is not source-executed');
    assert.match(main, /unportedLog\.note\(ROM\.call1, 'main-loop call #1 \(\$256D5A\)'\)/,
      'main-loop call 1 remains explicitly unported');
    assert.equal(SOURCE_GAPS.includes(0x28d5fa), true,
      'the type 19 cartridge arm has no source caller body');
    assert.equal('dynamic indirect reachability', 'dynamic indirect reachability',
      'reachability beyond the static and indexed-PC inventories remains unproved, not absent');
  });

// ---------------------------------------------------------------- SECTION 6

test('SECTION 6: live scanner APIs reconcile to 16 narrow, 85 widened, 27 pairs and 22 body-only',
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

    assert.equal(narrow.length, 16, 'neither old claimant formed a narrow duplicate row');
    assert.equal(heads.length, 85, 'W461 removes one widened head from W460 baseline 86');
    assert.equal(heads.includes(BODY_START), false, '$24631C leaves the widened head register');
    assert.equal(narrow.some(([at]) => at === BODY_START), false, '$24631C remains absent narrowly');
    assert.equal(pairs.length, 27, 'W461 removes one body pair from W460 baseline 28');
    assert.equal(pairs.some(([pair]) => /24631C/i.test(pair)), false,
      '$24631C has no surviving body-pair edge');
    assert.equal(heads.includes(0x242e24), false, '$242E24 leaves the widened head register in W461');
    assert.equal(pairs.some(([pair]) => pair ===
      'initbody.js rankByte242E24 <> rng.js drawByte242E24'), false,
    '$242E24/$242E3A body pair leaves the register in W461');
    assert.equal(bodyOnly.length, 22,
      'body-only findings are derived live from headIndex() and stay unchanged after a head-visible pair removal');
  });

test('SECTION 6b: executable cartridge proof adds no production ROM window declaration', () => {
  const exporter = readFileSync(join(ROOT, 'tools', 'export-tables.py'), 'utf8');
  assert.doesNotMatch(exporter.toLowerCase(), /0x24631c/,
    '$24631C remains raw-image test evidence, not a generated production window');
});
