// WAVE 459 (D69) -- ONE COMPLETE $25FF38 REQUEST-POST BODY.
//
// The live player helper and a source-uncalled tally helper independently
// transcribed this 26-byte cartridge routine. They disagreed on D0 ownership:
// the cartridge tests D0.W, not the full register. This test pins the complete
// body, every aligned transfer and exact reference, all caller conventions,
// dirty mailbox ownership, real caller witnesses, compatibility identity and
// live duplicate-register reconciliation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { armRequest25FF38 } from '../src/player.js';
import {
  tallyRequest25FF38, tallyPhase0Arm25DC2C, SCREEN11,
} from '../src/tallyscreen.js';
import { stagePair2603FE } from '../src/rank.js';
import { TALLY } from '../src/tally.js';
import { Ram } from '../src/ram.js';
import {
  bodyPairs, headIndex, headRegister, narrowIndex, scanFile, sources,
} from './w450widenedscan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const IMAGE = join(ROOT, 'rip', 'sound', 'maincpu.bin');
const PLAYER_SOURCE = join(ROOT, 'src', 'player.js');
const TALLY_SOURCE = join(ROOT, 'src', 'tallyscreen.js');
const HAVE_IMAGE = existsSync(IMAGE);
const IMG = HAVE_IMAGE ? readFileSync(IMAGE) : null;
const SKIP_IMAGE = HAVE_IMAGE ? false : 'maincpu.bin absent; skip, not pass';
const ROM = {
  u8: (at) => IMG.readUInt8(at),
  u16: (at) => IMG.readUInt16BE(at),
  u32: (at) => IMG.readUInt32BE(at),
};

const IMAGE_SHA256 = '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c';
const BODY_START = 0x25ff38;
const BODY_END = 0x25ff52;
const BODY_HEX = '41f9008130fa4a406700000841f90081311e3081426800024e75';
const BODY_SHA256 = '2c1447e71c1b53f32b005fbf92693968ca790f2dbdafb441e53f1b5544d91405';
const MAIL_BASE = TALLY.side0 - 0x0a;
const MAIL_LENGTH = TALLY.side1 + TALLY.stride + 0x0a - MAIL_BASE;
const SLOT = 0x80e240;

const BODY_INSTRUCTIONS = Object.freeze([
  [0x25ff38, '41f9008130fa'],
  [0x25ff3e, '4a40'],
  [0x25ff40, '67000008'],
  [0x25ff44, '41f90081311e'],
  [0x25ff4a, '3081'],
  [0x25ff4c, '42680002'],
  [0x25ff50, '4e75'],
]);

const CALLER_SPANS = Object.freeze([
  [0x25dcaa, 0x25dcc0, '7000102d0007323c00074eb90025ff384eba042e4e71',
    'tally phase 0: zero-extend side, request 7, then $25E0EA'],
  [0x26042e, 0x260442, '7000323c00044ebafb024a790081309866000020',
    'stage pair side 0: D0=0, D1.W=4, then TST.W'],
  [0x26046c, 0x260480, '7001323c00044ebafac44a790081309866000020',
    'stage pair side 1: D0=1, D1.W=4, then TST.W'],
  [0x26080a, 0x260816, '323c00014ef90025ff384e71',
    'request-1 tail wrapper'],
  [0x260816, 0x260846,
    '4a426600001233c00081308433c1008130886000000e33c00081308633c10081308a3002323c00034ef90025ff384e71',
    'request-3 mailbox helper and tail wrapper'],
  [0x260846, 0x260852, '323c00094ef90025ff384e71',
    'request-9 tail wrapper'],
  [0x288b22, 0x288b3c,
    '7000102d0007323c00084eb90025ff38600000081b7c00000005',
    'slot 13: zero-extend side, request 8, then countdown branch'],
  [0x288c3e, 0x288c6a,
    '536d001c660000267000323c00064eb90025ff384eb90024631c303c000c4eb9002411824ef9002412924e71',
    'slot 14: request 6, clear, create and tail kill'],
  [0x24a20e, 0x24a220, '7000102d00074eb90026080a4ef900241292',
    'request-1 wrapper parent: zero-extend side then tail kill'],
  [0x249388, 0x24939e, '7000102d00074eb9002608464a790080392667000056',
    'request-9 wrapper parent: zero-extend side then TST.W'],
]);

function bytes(at, count) { return IMG.subarray(at, at + count); }
function signed8(value) { return (value & 0x80) !== 0 ? value - 0x100 : value; }
function signed16(value) { return (value & 0x8000) !== 0 ? value - 0x10000 : value; }
function snapshot(ram, base, length) {
  return Buffer.from(Array.from({ length }, (_, n) => ram.u8(base + n)));
}
function fillBytes(ram, base, length, salt) {
  for (let n = 0; n < length; n++) ram.setU8(base + n, (salt + n * 43) & 0xff);
}
function assertBytesExcept(ram, base, before, changed, label) {
  for (let n = 0; n < before.length; n++) {
    if (changed.has(n)) continue;
    assert.equal(ram.u8(base + n), before[n], `${label}: dirty byte +$${n.toString(16)}`);
  }
}
function functionText(fileText, name) {
  const scanned = scanFile(fileText);
  const head = scanned.heads.find((candidate) => candidate.name === name);
  assert.ok(head, `${name} source head exists`);
  return scanned.lines.slice(head.line, head.endLine + 1).join('\n');
}

// Scan the complete image at every aligned word. This covers all 68000 byte and
// word branch forms, DBcc, absolute.W/L and PC-relative JSR/JMP. Indexed-PC
// opcodes are inventoried separately because their register term is dynamic.
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

// ---------------------------------------------------------------- SECTION 1

test('SECTION 1: Build-B image and every instruction in complete [$25FF38,$25FF52)',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(IMG.length, 0x600000, 'the complete main CPU image is 6 MiB');
    assert.equal(createHash('sha256').update(IMG).digest('hex'), IMAGE_SHA256);
    assert.equal(BODY_END - BODY_START, 26, 'the complete routine is 26 bytes');
    assert.deepEqual(bytes(BODY_START, BODY_END - BODY_START), Buffer.from(BODY_HEX, 'hex'));
    assert.equal(createHash('sha256').update(bytes(BODY_START, 26)).digest('hex'), BODY_SHA256);
    for (const [at, hex] of BODY_INSTRUCTIONS) {
      assert.deepEqual(bytes(at, hex.length / 2), Buffer.from(hex, 'hex'), `$${at.toString(16)}`);
    }
    assert.equal(BODY_INSTRUCTIONS.reduce((sum, [, hex]) => sum + hex.length / 2, 0), 26,
      'instruction census consumes the complete span without gaps');
    assert.equal(IMG.readUInt16BE(BODY_START - 2), 0x4e75,
      '$25FF36 is the prior routine RTS, not fallthrough');
    assert.equal(IMG.readUInt32BE(BODY_END), 0,
      '$25FF52 starts the nine-longword request dispatch table');
  });

test('SECTION 1b: complete aligned transfer, indexed-PC and exact-longword census is exact',
  { skip: SKIP_IMAGE }, () => {
    const { hits, indexed, scanned } = transferCensus(BODY_START, BODY_END);
    assert.equal(scanned, IMG.length / 2,
      'every aligned opcode word through $5FFFFE is examined');
    assert.deepEqual(hits, [
      [0x25dcb4, 'JSR.L', BODY_START],
      [0x25ff40, 'Bcc', 0x25ff4a],
      [0x260434, 'JSR.PC16', BODY_START],
      [0x260472, 'JSR.PC16', BODY_START],
      [0x26080e, 'JMP.L', BODY_START],
      [0x26083e, 'JMP.L', BODY_START],
      [0x26084a, 'JMP.L', BODY_START],
      [0x288b2c, 'JSR.L', BODY_START],
      [0x288c4c, 'JSR.L', BODY_START],
    ], 'one internal branch and exactly eight external direct transfers enter the body');
    assert.equal(indexed.length, 110,
      'all aligned indexed-PC JSR/JMP opcode candidates in the pinned image are inventoried');
    assert.deepEqual(indexed.filter(([, , base]) => base >= BODY_START && base < BODY_END), [],
      'no indexed-PC zero-index base enters any instruction in the body');
    assert.deepEqual(exactLongwordReferencesInto(BODY_START, BODY_END), [
      [0x25dcb6, BODY_START],
      [0x260810, BODY_START],
      [0x260840, BODY_START],
      [0x26084c, BODY_START],
      [0x288b2e, BODY_START],
      [0x288c4e, BODY_START],
    ], 'all six exact longwords are absolute transfer operands and none enters the body internally');
  });

// ---------------------------------------------------------------- SECTION 2

test('SECTION 2: every direct caller, tail wrapper, parent and immediate continuation is byte-pinned',
  { skip: SKIP_IMAGE }, () => {
    for (const [start, end, hex, label] of CALLER_SPANS) {
      assert.deepEqual(bytes(start, end - start), Buffer.from(hex, 'hex'), label);
    }
    assert.equal(0x25ff42 + signed16(IMG.readUInt16BE(0x25ff42)), 0x25ff4a,
      'BEQ.W zero arm lands on the common MOVE.W');
    assert.equal(IMG.readUInt16BE(0x25ff4c), 0x4268,
      'CLR.W is last status-setting instruction before RTS');

    const wrapperCensus = transferCensus(0x26080a, 0x260852).hits
      .filter(([, , target]) => target === 0x26080a || target === 0x260816 || target === 0x260846);
    assert.deepEqual(wrapperCensus, [
      [0x24938e, 'JSR.L', 0x260846],
      [0x24a214, 'JSR.L', 0x26080a],
    ], '$260816 has no aligned static caller while request-1 and request-9 each have one');
    assert.deepEqual(exactLongwordReferencesInto(0x26080a, 0x260852)
      .filter(([, target]) => target === 0x26080a || target === 0x260816 || target === 0x260846), [
      [0x249390, 0x260846],
      [0x24a216, 0x26080a],
    ], '$260816 also has no exact longword reference');
  });

test('SECTION 2b: caller conventions prove D0.W polarity, D1.W truncation and unobserved results',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(IMG.readUInt16BE(0x25ff3e), 0x4a40, 'TST.W owns only D0 low word');
    assert.equal(IMG.readUInt16BE(0x25ff4a), 0x3081, 'MOVE.W owns only D1 low word');
    assert.deepEqual([...bytes(0x25ff4c, 6)], [0x42, 0x68, 0x00, 0x02, 0x4e, 0x75],
      'CLR.W state then RTS is the sole exit');

    assert.deepEqual([...bytes(0x260838, 6)], [0x30, 0x02, 0x32, 0x3c, 0x00, 0x03],
      '$260816 copies only D2.W into dirty D0 then writes only D1.W before its tail jump');
    assert.deepEqual([...bytes(0x25dcaa, 10)], [0x70, 0x00, 0x10, 0x2d, 0x00, 0x07,
      0x32, 0x3c, 0x00, 0x07], 'tally caller zero-extends its side byte and sets request 7');
    assert.deepEqual([...bytes(0x288b22, 10)], [0x70, 0x00, 0x10, 0x2d, 0x00, 0x07,
      0x32, 0x3c, 0x00, 0x08], 'slot 13 zero-extends its side byte and sets request 8');

    // No JSR continuation branches on the returned status or reads a register
    // result. TST.W overwrites NZVC at both stage-pair sites; slot 13 branches
    // unconditionally; slot 14 calls another routine; tally calls $25E0EA.
    assert.deepEqual([
      IMG.readUInt16BE(0x25dcba), IMG.readUInt16BE(0x260438),
      IMG.readUInt16BE(0x260476), IMG.readUInt16BE(0x288b32),
      IMG.readUInt16BE(0x288c52),
    ], [0x4eba, 0x4a79, 0x4a79, 0x6000, 0x4eb9]);
    // The two tail-wrapper parents also ignore the CLR status: one tail-jumps to
    // kill and the other immediately executes TST.W.
    assert.deepEqual([IMG.readUInt16BE(0x24a21a), IMG.readUInt16BE(0x249394)],
      [0x4ef9, 0x4a79]);
  });

// ---------------------------------------------------------------- SECTION 3

const DIRECT_CASES = Object.freeze([
  { name: 'canonical zero', d0: 0x00000000, d1: 0xdeadbeef, rec: TALLY.side0, request: 0xbeef },
  { name: 'dirty high word with zero D0.W', d0: 0x00010000, d1: 0x00010000,
    rec: TALLY.side0, request: 0 },
  { name: 'other dirty high word with zero D0.W', d0: 0xdead0000, d1: 0xffffffff,
    rec: TALLY.side0, request: 0xffff },
  { name: 'canonical one', d0: 0x00000001, d1: 0x00010001, rec: TALLY.side1, request: 1 },
  { name: 'noncanonical D0.W two', d0: 0xbeef0002, d1: 0x12340000,
    rec: TALLY.side1, request: 0 },
  { name: 'noncanonical D0.W sign bit', d0: 0xcafe8000, d1: 0xface7fff,
    rec: TALLY.side1, request: 0x7fff },
  { name: 'noncanonical D0.W all bits', d0: 0xabcdffff, d1: 0x0001ffff,
    rec: TALLY.side1, request: 0xffff },
]);

test('SECTION 3: both import names cover every side-word and request-word arm in dirty records', () => {
  assert.equal(TALLY.side1 - TALLY.side0, 0x24, 'the two recycled records have stride $24');
  for (const [name, fn] of [
    ['armRequest25FF38', armRequest25FF38],
    ['tallyRequest25FF38', tallyRequest25FF38],
  ]) {
    for (let index = 0; index < DIRECT_CASES.length; index++) {
      const c = DIRECT_CASES[index];
      const ram = new Ram();
      fillBytes(ram, MAIL_BASE, MAIL_LENGTH, 0x31 + index * 19);
      const before = snapshot(ram, MAIL_BASE, MAIL_LENGTH);
      const other = c.rec === TALLY.side0 ? TALLY.side1 : TALLY.side0;
      const otherBefore = snapshot(ram, other, TALLY.stride);

      assert.equal(fn(ram, c.d0, c.d1), c.rec, `${name}: ${c.name}: selected record`);
      assert.deepEqual([ram.u16(c.rec), ram.u16(c.rec + 2)], [c.request, 0],
        `${name}: ${c.name}: D1.W request and cleared state`);
      assert.deepEqual(snapshot(ram, other, TALLY.stride), otherBefore,
        `${name}: ${c.name}: opposite record remains dirty and untouched`);
      const off = c.rec - MAIL_BASE;
      assertBytesExcept(ram, MAIL_BASE, before, new Set([off, off + 1, off + 2, off + 3]),
        `${name}: ${c.name}: adjacent and recycled record ownership`);
    }
  }
});

// ---------------------------------------------------------------- SECTION 4

function phaseContext() { return { unportedLog: { note() {} } }; }
function readyPhaseParent(ram, side) {
  fillBytes(ram, SLOT - 4, 0x58, 0x51 + side);
  fillBytes(ram, 0x813080, 0x14, 0x91 + side);
  fillBytes(ram, SCREEN11.savedA - 4, 0x1e, 0x67 + side);
  fillBytes(ram, 0x81315e, 0x10, 0xc1 + side);
  fillBytes(ram, MAIL_BASE, MAIL_LENGTH, 0x39 + side);
  ram.setU8(SLOT + SCREEN11.phase, 0);
  ram.setU8(SLOT + SCREEN11.side, side);
  ram.setU32(SLOT + SCREEN11.desc, side === 0 ? SCREEN11.descA : SCREEN11.descB);
  ram.setU16(0x813098, 0);
  ram.setU16(0x813092, 3);
  ram.setU16(0x803926, 0);
  ram.setU16(SCREEN11.carryWord, 0);
  ram.setU16(0x803972, 0);
  ram.setU16(0x803978, 0);
  ram.setU16(side === 0 ? 0x803972 : 0x803978, 0x8000);
  const picked = side === 0 ? 0 : 1;
  ram.setU16(TALLY.postD0[picked], 0x0002);
  ram.setU16(TALLY.postD1[picked], 0x0004);
  ram.setU16(0x81308c, 0);
}

test('SECTION 4: real $25DCB4 parent posts request 7 for both dirty side records',
  { skip: SKIP_IMAGE }, () => {
    for (const side of [0, 0x80]) {
      const ram = new Ram();
      readyPhaseParent(ram, side);
      const before = snapshot(ram, MAIL_BASE, MAIL_LENGTH);
      const rec = side === 0 ? TALLY.side0 : TALLY.side1;
      const other = side === 0 ? TALLY.side1 : TALLY.side0;
      const otherBefore = snapshot(ram, other, TALLY.stride);

      assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, phaseContext()), true,
        `side $${side.toString(16)} reaches the cartridge caller`);
      assert.deepEqual([ram.u16(rec), ram.u16(rec + 2)], [7, 0],
        'external mailbox witnesses request 7 and cleared state');
      assert.deepEqual(snapshot(ram, other, TALLY.stride), otherBefore,
        'opposite tally record stays dirty');
      const off = rec - MAIL_BASE;
      assertBytesExcept(ram, MAIL_BASE, before, new Set([off, off + 1, off + 2, off + 3]),
        'phase parent tally-record ownership');
    }
  });

test('SECTION 4b: real $2603FE parent posts request 4 to both dirty records',
  { skip: SKIP_IMAGE }, () => {
    const ram = new Ram();
    fillBytes(ram, MAIL_BASE, MAIL_LENGTH, 0x73);
    const before = snapshot(ram, MAIL_BASE, MAIL_LENGTH);
    ram.setU16(TALLY.postD0[0], 0);
    ram.setU16(TALLY.postD0[1], 1);
    ram.setU16(0x813098, 1);

    stagePair2603FE(ram, ROM, phaseContext(), 0xffffffff, 0xffffffff);
    for (const rec of [TALLY.side0, TALLY.side1]) {
      assert.deepEqual([ram.u16(rec), ram.u16(rec + 2)], [4, 0],
        `stage pair external witness at $${rec.toString(16)}`);
    }
    const changed = new Set();
    for (const rec of [TALLY.side0, TALLY.side1]) {
      const off = rec - MAIL_BASE;
      for (let n = 0; n < 4; n++) changed.add(off + n);
    }
    assertBytesExcept(ram, MAIL_BASE, before, changed,
      'stage pair preserves both records outside request/state heads');
  });

// ---------------------------------------------------------------- SECTION 5

test('SECTION 5: cartridge and production-source reachability are proved separately', () => {
  const playerSource = readFileSync(PLAYER_SOURCE, 'utf8');
  const tallySource = readFileSync(TALLY_SOURCE, 'utf8');
  const heads = [];
  const callers = [];
  for (const [file, text] of sources()) {
    const scanned = scanFile(text);
    for (const head of scanned.heads) {
      if (head.name === 'armRequest25FF38' || head.name === 'tallyRequest25FF38') {
        heads.push(`${file} ${head.name}`);
      }
      if (head.name === 'armRequest25FF38') continue;
      const body = scanned.lines.slice(head.line, head.endLine + 1).join('\n');
      if (/\barmRequest25FF38\s*\(/.test(body)) callers.push(`${file} ${head.name}`);
    }
  }
  assert.deepEqual(heads, ['player.js armRequest25FF38'],
    'source has one canonical function body and no tally body');
  assert.deepEqual(callers.sort(), [
    'objslot13.js menuArm',
    'objslot14.js state2',
    'player.js playerDead24A130',
    'player.js playerObject2491C0',
    'rank.js stagePair2603FE',
    'tallyscreen.js tallyPhase0Arm25DC2C',
  ], 'all six production source caller bodies are inventoried');
  assert.equal((sources().map(([, text]) => text).join('\n')
    .match(/\barmRequest25FF38\s*\(/g) ?? []).length, 7,
  'six calls plus the one canonical declaration exist across production source');
  assert.equal((tallySource.match(/function tallyRequest25FF38\s*\(/g) ?? []).length, 0,
    'historical tally body cannot regrow');
  assert.match(tallySource, /export \{ armRequest25FF38 as tallyRequest25FF38 \};/,
    'historical public import remains a compatibility export');
  assert.equal(armRequest25FF38, tallyRequest25FF38,
    'both public imports resolve to the same function object');

  assert.equal((functionText(playerSource, 'playerDead24A130')
    .match(/armRequest25FF38\(ram, idx, 1\)/g) ?? []).length, 1,
  '$26080A request-1 wrapper source delegates to the canonical body');
  assert.equal((functionText(tallySource, 'tallyPhase0Arm25DC2C')
    .match(/armRequest25FF38\(ram, ram\.u8\(a5 \+ SCREEN11\.side\), 7\)/g) ?? []).length, 1,
  '$25DCB4 request-7 cartridge caller is reachable in production source');
});

// ---------------------------------------------------------------- SECTION 6

test('SECTION 6: live scanner APIs reconcile W459 through W472 and derive body-only count', () => {
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
  const removed = 'player.js armRequest25FF38 <> tallyscreen.js tallyRequest25FF38';
  const removedRank = 'initbody.js rankByte242E24 <> rng.js drawByte242E24';

  assert.equal(narrow.length, 16, 'W459 removes one export-only $25FF38 head from W458 baseline 17');
  assert.equal(heads.length, 72, 'W463 removes $28C0FC to leave 83; W464 removes $28E7A2 to leave 82; W465 removes $28C6C6 to leave 81; W466 removes $28F4C4/$28F666 to leave 79; W467 removes $285A12 to leave 78; W468 removes $2A6EDC to leave 77; W469 removes $23C622 to leave 76; W470 removes $23BF74/$23BFDB to leave 74; W471 removes $23E3E2 to leave 73; W472 removes $23FF06 to leave 72');
  assert.equal(pairs.length, 27, 'W461 removes the $242E24/$242E3A body edge from baseline 28');
  assert.equal(bodyOnly.length, 22,
    'body-only is derived live and unchanged because W461 removes a head-visible pair');
  assert.equal(heads.includes(BODY_START), false, '$25FF38 stays off the widened register');
  assert.equal(narrow.some(([at]) => at === BODY_START), false, '$25FF38 stays off the narrow register');
  assert.equal(pairs.some(([pair]) => pair === removed), false, '$25FF38 body edge stays absent');
  assert.equal(heads.includes(0x25d9e6), false, 'W457 merge remains absent');
  assert.equal(heads.includes(0x25da60), false, 'W458 merge remains absent');
  assert.equal(heads.includes(0x242e24), false, 'W461 merge remains absent');
  assert.equal(pairs.some(([pair]) => pair === removedRank), false, '$242E24 body edge stays absent');
});
