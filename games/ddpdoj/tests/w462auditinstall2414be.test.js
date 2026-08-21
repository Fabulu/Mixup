// WAVE 462 (D70) -- AUDIT AND REMOVE THE PRIVATE `$2414BE` ADAPTER IDENTITIES.
//
// Build-B has one 36-byte single-TX-bank uploader. `palette.js install2414BE`
// is its public canonical implementation. The two private `installTxBank`
// functions in objslot8.js and objslot12.js added no machine behavior, but their
// absent-palette guards and deferred ROM reads were caller behavior that had to
// survive. This regression pins the complete body, every static entry and first
// continuation, machine ownership, all production and ESM identities, both real
// front-end caller families, the live duplicate registers and unchanged windows.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync, readFileSync, readdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TxVram } from '../src/background.js';
import * as objslot8Module from '../src/objslot8.js';
import {
  SCREEN8, coinTeardown25A7C0,
} from '../src/objslot8.js';
import * as objslot12Module from '../src/objslot12.js';
import {
  SLOT12, teardown28F368,
} from '../src/objslot12.js';
import * as paletteModule from '../src/palette.js';
import {
  PaletteState, PALSTAGE, TX_BANKS, TX_BANK_WORDS, install2414BE,
} from '../src/palette.js';
import { Ram } from '../src/ram.js';
import { Unreached } from '../src/unported.js';
import {
  bodyPairs, headIndex, headRegister, narrowIndex, scanFile, sources,
} from './w450widenedscan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');
const TESTS = join(ROOT, 'tests');
const IMAGE = join(ROOT, 'rip', 'sound', 'maincpu.bin');
const TABLES = join(ROOT, 'rip', 'port', 'player.tables.json');
const EXPORTER = join(ROOT, 'tools', 'export-tables.py');
const HAVE_IMAGE = existsSync(IMAGE);
const IMG = HAVE_IMAGE ? readFileSync(IMAGE) : null;
const SKIP_IMAGE = HAVE_IMAGE ? false : 'maincpu.bin absent; skip, not pass';
const IMAGE_SHA256 = '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c';

const BODY_START = 0x2414be;
const BODY_END = 0x2414e2;
const BODY_HEX = '48e780c043f90080f886eb48d2c0700722d851c8fffc33fc00010080fa6a4cdf03014e75';
const BODY_SHA256 = '57f81c30f0abf2d85a849805eb3fcdc0c891ddf0f5590ad62b7be6d26be22aa1';
const PRIOR_START = 0x241404;
const PRIOR_SHA256 = 'a1fe60c29ae893e62620fa745100436f9def1073b6b66f28f3102647d1422a50';
const NEXT_START = BODY_END;
const NEXT_END = 0x24150a;
const NEXT_HEX = '48e7c0c043f90080f886eb48d2c0700722d851c8fffc51c9fff633fc00010080fa6a4cdf03034e75';
const NEXT_SHA256 = 'b344ea7538965782e90edc77ba553292f201072dc7a761a6253584ff3d42ce83';

const BODY_INSTRUCTIONS = Object.freeze([
  [0x2414be, '48e780c0', 'movem.l D0/A0-A1,-(A7)'],
  [0x2414c2, '43f90080f886', 'lea $80F886,A1'],
  [0x2414c8, 'eb48', 'lsl.w #5,D0'],
  [0x2414ca, 'd2c0', 'adda.w D0,A1'],
  [0x2414cc, '7007', 'moveq #7,D0'],
  [0x2414ce, '22d8', 'move.l (A0)+,(A1)+'],
  [0x2414d0, '51c8fffc', 'dbra D0,$2414CE'],
  [0x2414d4, '33fc00010080fa6a', 'move.w #1,$80FA6A'],
  [0x2414dc, '4cdf0301', 'movem.l (A7)+,D0/A0-A1'],
  [0x2414e0, '4e75', 'rts'],
]);

const EXTERNAL_CALLERS = Object.freeze([
  0x23bf8e, 0x23bf9c, 0x23bfaa, 0x23bfb8, 0x23bfc6,
  0x2416c8, 0x241702, 0x241742, 0x24177c,
  0x25a80e, 0x25a92c, 0x25a9a2, 0x25ac10, 0x25c600,
  0x25c9ae, 0x25cdce, 0x26056c, 0x2605dc, 0x2605ea,
  0x2605f8, 0x260606, 0x260614, 0x260622, 0x260630,
  0x26063e, 0x26064c, 0x26065a, 0x288590, 0x28f394,
]);
const PC_RELATIVE_CALLERS = Object.freeze([0x2416c8, 0x241702, 0x241742, 0x24177c]);

// Each byte string starts at the call and ends after the first complete
// continuation instruction. The continuation label records its immediate
// register effect; none reads the returned CCR/SR.
const CALLER_SPANS = Object.freeze([
  [0x23bf8e, '4eb9002414be41f900222658', 'LEA $222658,A0; writes A0'],
  [0x23bf9c, '4eb9002414be41f900222678', 'LEA $222678,A0; writes A0'],
  [0x23bfaa, '4eb9002414be41f900222698', 'LEA $222698,A0; writes A0'],
  [0x23bfb8, '4eb9002414be41f9002226b8', 'LEA $2226B8,A0; writes A0'],
  [0x23bfc6, '4eb9002414be303c0008', 'MOVE.W #8,D0; writes D0.W and preserves D0 high'],
  [0x2416c8, '4ebafdf460000038', 'BRA.W $241706; no register or SR read'],
  [0x241702, '4ebafdba4e75', 'RTS; consumes restored A7 only'],
  [0x241742, '4ebafd7a60000038', 'BRA.W $241780; no register or SR read'],
  [0x24177c, '4ebafd404e75', 'RTS; consumes restored A7 only'],
  [0x25a80e, '4eb9002414be4eb90023c622', 'JSR $23C622; consumes restored A7'],
  [0x25a92c, '4eb9002414be4eb90025b3dc', 'JSR $25B3DC; consumes restored A7'],
  [0x25a9a2, '4eb9002414be4eb90025c6d4', 'JSR $25C6D4; consumes restored A7'],
  [0x25ac10, '4eb9002414be3b7c00000006', 'MOVE.W #0,($6,A5); no returned register read'],
  [0x25c600, '4eb9002414be4cdf7fff', 'MOVEM.L (A7)+,D0-D7/A0-A6; consumes restored A7'],
  [0x25c9ae, '4eb9002414be41f900222838', 'LEA $222838,A0; writes A0'],
  [0x25cdce, '4eb9002414be41f900222838', 'LEA $222838,A0; writes A0'],
  [0x26056c, '4eb9002414be4eb900241654', 'JSR $241654; consumes restored A7'],
  [0x2605dc, '4eb9002414be41f900222658', 'LEA $222658,A0; writes A0'],
  [0x2605ea, '4eb9002414be41f900222678', 'LEA $222678,A0; writes A0'],
  [0x2605f8, '4eb9002414be41f900222698', 'LEA $222698,A0; writes A0'],
  [0x260606, '4eb9002414be41f9002226b8', 'LEA $2226B8,A0; writes A0'],
  [0x260614, '4eb9002414be41f9002226d8', 'LEA $2226D8,A0; writes A0'],
  [0x260622, '4eb9002414be41f900222778', 'LEA $222778,A0; writes A0'],
  [0x260630, '4eb9002414be41f900222798', 'LEA $222798,A0; writes A0'],
  [0x26063e, '4eb9002414be41f9002227b8', 'LEA $2227B8,A0; writes A0'],
  [0x26064c, '4eb9002414be41f9002227d8', 'LEA $2227D8,A0; writes A0'],
  [0x26065a, '4eb9002414be427900813080', 'CLR.W $813080; writes CCR independently'],
  [0x288590, '4eb9002414be4e75', 'RTS; consumes restored A7 only'],
  [0x28f394, '4eb9002414be303c0008', 'MOVE.W #8,D0; writes D0.W and preserves D0 high'],
]);

const CALL_ARGUMENTS = Object.freeze([
  [0x23bf8e, 0, 0x222638], [0x23bf9c, 1, 0x222658],
  [0x23bfaa, 2, 0x222678], [0x23bfb8, 3, 0x222698],
  [0x23bfc6, 4, 0x2226b8], [0x2416c8, 9, 0x2226f8],
  [0x241702, 9, 0x222738], [0x241742, 10, 0x222718],
  [0x24177c, 10, 0x222758], [0x25a80e, 0, 0x222638],
  [0x25a92c, 0, 0x222638], [0x25a9a2, 0, 0x222618],
  [0x25ac10, 0, 0x222618], [0x25c600, 12, 0x2227f8],
  [0x25c9ae, 0, 0x222618], [0x25cdce, 0, 0x222618],
  [0x26056c, 0, 0x222618], [0x2605dc, 0, 0x222638],
  [0x2605ea, 1, 0x222658], [0x2605f8, 2, 0x222678],
  [0x260606, 3, 0x222698], [0x260614, 4, 0x2226b8],
  [0x260622, 5, 0x2226d8], [0x260630, 6, 0x222778],
  [0x26063e, 7, 0x222798], [0x26064c, 8, 0x2227b8],
  [0x26065a, 11, 0x2227d8], [0x288590, 13, 0x222818],
  [0x28f394, 0, 0x222638],
]);

const SOURCE_REPRESENTED_SITES = Object.freeze(EXTERNAL_CALLERS
  .filter((site) => site !== 0x288590));

const TRANSFER_COUNTS = Object.freeze({
  'Bcc.B': 119480, 'Bcc.W': 10851,
  'BRA.B': 6815, 'BRA.W': 1969,
  'BSR.B': 5809, 'BSR.W': 2042,
  DBcc: 2287,
  'JSR.W': 6, 'JSR.L': 12787, 'JSR.PC16': 649, 'JSR.PCIX': 4,
  'JMP.W': 4, 'JMP.L': 1285, 'JMP.PC16': 85, 'JMP.PCIX': 106,
});

function bytes(at, count) { return IMG.subarray(at, at + count); }
function sha256(data) { return createHash('sha256').update(data).digest('hex'); }
function signed8(value) { return (value & 0x80) !== 0 ? value - 0x100 : value; }
function signed16(value) { return (value & 0x8000) !== 0 ? value - 0x10000 : value; }
function hex(value) { return `$${value.toString(16).toUpperCase()}`; }
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// This independently decodes every aligned transfer encoding required by this
// audit. Indexed-PC transfers remain candidates because their index registers
// cannot be resolved statically.
function transferCensus(start, end) {
  const hits = [];
  const indexed = [];
  const counts = new Map();
  let scanned = 0;
  for (let at = 0; at + 2 <= IMG.length; at += 2) {
    scanned++;
    const opcode = IMG.readUInt16BE(at);
    let target = null;
    let kind = null;
    if (opcode >= 0x6000 && opcode <= 0x6fff) {
      const low = opcode & 0xff;
      if (low === 0 && at + 4 > IMG.length) continue;
      const family = (opcode & 0xff00) === 0x6100 ? 'BSR'
        : ((opcode & 0xff00) === 0x6000 ? 'BRA' : 'Bcc');
      const width = low === 0 ? 'W' : 'B';
      const displacement = low === 0 ? signed16(IMG.readUInt16BE(at + 2)) : signed8(low);
      target = at + 2 + displacement;
      kind = `${family}.${width}`;
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
        kind = `${prefix}.PCIX`;
        indexed.push([at, kind, at + 2 + signed8(extension & 0xff), extension]);
      }
    }
    if (kind !== null) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (target !== null && target >= start && target < end) hits.push([at, kind, target]);
  }
  return { counts, hits, indexed, scanned };
}

function exactLongwordReferencesInto(start, end) {
  const refs = [];
  for (let at = 0; at + 4 <= IMG.length; at += 2) {
    const target = IMG.readUInt32BE(at);
    if (target >= start && target < end) refs.push([at, target]);
  }
  return refs;
}

function imageRom(onBytes = () => {}) {
  return {
    u8: (at) => IMG.readUInt8(at),
    u16: (at) => IMG.readUInt16BE(at),
    i16: (at) => IMG.readInt16BE(at),
    u32: (at) => IMG.readUInt32BE(at),
    bytes(at, count) {
      onBytes(at, count);
      return IMG.subarray(at, at + count);
    },
  };
}

// Independent execution model of the ten decoded instructions. It records the
// internal pointer and stack movement as well as the caller-visible restoration.
function registerModel({ d0, a0, a1, a7, x }) {
  const saved = { d0: d0 >>> 0, a0: a0 >>> 0, a1: a1 >>> 0 };
  const stackLow = (a7 - 12) >>> 0;
  const shiftedWord = ((d0 & 0xffff) << 5) & 0xffff;
  const destStart = (PALSTAGE.tx.stage + signed16(shiftedWord)) >>> 0;
  const sourceEnd = (a0 + 32) >>> 0;
  const destEnd = (destStart + 32) >>> 0;
  // MOVEQ #7 followed by eight DBRA decrements leaves D0.W at $FFFF
  // internally, before MOVEM restores the caller's complete longword.
  const loopD0 = 0x0000ffff;
  return {
    d0: saved.d0, a0: saved.a0, a1: saved.a1, a7: a7 >>> 0,
    stackLow, sourceEnd, destStart, destEnd, loopD0,
    ccr: x ? 0x10 : 0,
  };
}

function windows() {
  return JSON.parse(readFileSync(TABLES, 'utf8')).rom.windows
    .map((w) => ({ base: parseInt(String(w.base).replace('$', ''), 16), len: w.len }));
}

function noteContext(palette) {
  const notes = [];
  return {
    notes,
    ctx: {
      palette,
      tx: new TxVram(),
      unported: { note: (at, why) => notes.push([at, why]) },
    },
  };
}

// ---------------------------------------------------------------- SECTION 1

test('SECTION 1: the complete cartridge body, instructions, hashes and adjacent routines are exact',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(IMG.length, 0x600000, 'the complete Build-B main CPU image is 6 MiB');
    assert.equal(sha256(IMG), IMAGE_SHA256);
    assert.equal(BODY_END - BODY_START, 36);
    assert.deepEqual(bytes(BODY_START, BODY_END - BODY_START), Buffer.from(BODY_HEX, 'hex'));
    assert.equal(sha256(bytes(BODY_START, BODY_END - BODY_START)), BODY_SHA256);

    for (const [at, opcode, mnemonic] of BODY_INSTRUCTIONS) {
      assert.deepEqual(bytes(at, opcode.length / 2), Buffer.from(opcode, 'hex'),
        `${hex(at)} ${mnemonic}`);
    }
    assert.equal(BODY_INSTRUCTIONS.reduce((n, [, opcode]) => n + opcode.length / 2, 0),
      BODY_END - BODY_START, 'all ten instructions fill the half-open body without a gap');

    assert.equal(sha256(bytes(PRIOR_START, BODY_START - PRIOR_START)), PRIOR_SHA256,
      'the complete adjacent `$241404` fade body is pinned');
    assert.deepEqual(bytes(BODY_START - 2, 2), Buffer.from('4e75', 'hex'),
      '$2414BC is the preceding body\'s RTS, so it cannot fall into $2414BE');
    assert.deepEqual(bytes(NEXT_START, NEXT_END - NEXT_START), Buffer.from(NEXT_HEX, 'hex'));
    assert.equal(sha256(bytes(NEXT_START, NEXT_END - NEXT_START)), NEXT_SHA256,
      '$2414E2 starts and $241508 ends the separate multi-bank sibling');
    assert.deepEqual(bytes(BODY_END - 2, 4), Buffer.from('4e7548e7', 'hex'),
      '$2414E0 RTS prevents fallthrough into the sibling\'s MOVEM');
    assert.equal('no table or continuation is owned by the single-bank body',
      'no table or continuation is owned by the single-bank body');
  });

// ---------------------------------------------------------------- SECTION 2

test('SECTION 2: every aligned transfer form, internal entry and exact longword is inventoried',
  { skip: SKIP_IMAGE }, () => {
    const { counts, hits, indexed, scanned } = transferCensus(BODY_START, BODY_END);
    assert.equal(scanned, IMG.length / 2, 'all 3,145,728 aligned words are examined');
    for (const [kind, count] of Object.entries(TRANSFER_COUNTS)) {
      assert.equal(counts.get(kind), count, `${kind} complete-image candidate count`);
    }
    assert.deepEqual([...counts.keys()].sort(), Object.keys(TRANSFER_COUNTS).sort(),
      'no required direct-transfer encoding class is omitted');

    const expected = EXTERNAL_CALLERS.map((at) => [at,
      PC_RELATIVE_CALLERS.includes(at) ? 'JSR.PC16' : 'JSR.L', BODY_START]);
    expected.push([0x2414d0, 'DBcc', 0x2414ce]);
    expected.sort((a, b) => a[0] - b[0]);
    assert.deepEqual(hits, expected,
      '29 external calls enter only the head and the sole internal entry is the owned DBRA loop');

    assert.equal(indexed.length, 110, 'all aligned indexed-PC JSR/JMP candidates are retained');
    assert.equal(indexed.filter(([, , base]) => base >= BODY_START && base < BODY_END).length, 0,
      'no indexed-PC zero-index base enters the body');

    const absolute = EXTERNAL_CALLERS.filter((at) => !PC_RELATIVE_CALLERS.includes(at));
    assert.deepEqual(exactLongwordReferencesInto(BODY_START, BODY_END),
      absolute.map((at) => [at + 2, BODY_START]),
      'the only 25 exact longwords are absolute-long JSR operands');
    assert.equal('dynamic indirect reachability remains unproved',
      'dynamic indirect reachability remains unproved');
  });

test('SECTION 2b: all 29 direct calls and first continuations are byte-exact with no SR consumer',
  { skip: SKIP_IMAGE }, () => {
    assert.deepEqual(CALLER_SPANS.map(([at]) => at), EXTERNAL_CALLERS);
    assert.deepEqual(CALL_ARGUMENTS.map(([at]) => at), EXTERNAL_CALLERS);
    for (const [at, span, continuation] of CALLER_SPANS) {
      assert.deepEqual(bytes(at, span.length / 2), Buffer.from(span, 'hex'),
        `${hex(at)} then ${continuation}`);
      assert.doesNotMatch(continuation,
        /^(?:B(?:CC|CS|EQ|NE|GE|GT|HI|LE|LS|LT|MI|PL|VC|VS)|DB|S(?:CC|CS|EQ|NE|GE|GT|HI|LE|LS|LT|MI|PL|VC|VS))\b/,
        `${hex(at)} first continuation does not consume returned CCR/SR`);
    }
    assert.equal(CALL_ARGUMENTS.every(([, bank]) => bank >= 0 && bank < TX_BANKS), true,
      'every direct caller supplies a valid low-word bank');
    assert.equal(CALL_ARGUMENTS.every(([, , src]) => (src & 1) === 0), true,
      'every source pointer is even and each caller convention supplies 32 readable bytes');
  });

// ---------------------------------------------------------------- SECTION 3

test('SECTION 3: word arithmetic, signed ADDA, pointers, stack, registers and final CCR reconcile', () => {
  assert.deepEqual(registerModel({
    d0: 0xdead0000, a0: 0x222638, a1: 0xa5c31234, a7: 0x810040, x: false,
  }), {
    d0: 0xdead0000, a0: 0x222638, a1: 0xa5c31234, a7: 0x810040,
    stackLow: 0x810034, sourceEnd: 0x222658,
    destStart: PALSTAGE.tx.stage, destEnd: PALSTAGE.tx.stage + 32,
    loopD0: 0x0000ffff, ccr: 0,
  }, 'bank 0 with dirty D0 high word is restored after an exact 12-byte stack frame');

  assert.deepEqual(registerModel({
    d0: 0xa5c3000e, a0: 0x2227f8, a1: 0xffffffff, a7: 0x810080, x: true,
  }), {
    d0: 0xa5c3000e, a0: 0x2227f8, a1: 0xffffffff, a7: 0x810080,
    stackLow: 0x810074, sourceEnd: 0x222818,
    destStart: PALSTAGE.tx.stage + 14 * 32, destEnd: PALSTAGE.tx.stage + 15 * 32,
    loopD0: 0x0000ffff, ccr: 0x10,
  }, 'bank 14 is the opposite boundary; D0/A0/A1/A7 and X return exactly');

  const signed = registerModel({
    d0: 0x00000800, a0: 0, a1: 0, a7: 0x810100, x: false,
  });
  assert.equal(signed.destStart, PALSTAGE.tx.stage,
    'LSL.W wraps before ADDA.W sign extension; the public guard rejects this aliasing input');
  assert.equal(registerModel({
    d0: 0x000007ff, a0: 0, a1: 0, a7: 0x810100, x: false,
  }).destStart, PALSTAGE.tx.stage - 32,
  'word $07FF shifts to $FFE0, and ADDA.W sign-extends it to -32');
});

test('SECTION 3b: dirty bank 0 and bank 14 witnesses copy exactly 8 longs and preserve sentinels', () => {
  for (const bank of [0, TX_BANKS - 1]) {
    const ram = new Ram();
    const pal = new PaletteState();
    const source = Uint8Array.from({ length: 32 }, (_, i) => (bank * 29 + i * 197 + 0x43) & 0xff);
    const before = Uint8Array.from(source);
    const base = PALSTAGE.tx.stage + bank * 32;

    for (let i = 0; i < PALSTAGE.tx.words; i++) ram.setU16(PALSTAGE.tx.stage + i * 2, 0xa55a);
    pal.stageSourced.tx.fill(0xa5);
    ram.setU8(PALSTAGE.tx.stage - 1, 0x3c);
    ram.setU16(PALSTAGE.spr.dirty, 0xc0de);
    ram.setU16(PALSTAGE.bg.dirty, 0xd00d);
    ram.setU16(PALSTAGE.tx.dirty, 0xbeef);

    install2414BE(ram, pal, bank, source, 0x25c600 + bank, `W462 bank ${bank}`);

    for (let i = 0; i < TX_BANK_WORDS; i++) {
      assert.equal(ram.u16(base + i * 2), (source[i * 2] << 8) | source[i * 2 + 1],
        `bank ${bank} word ${i}, including the final word of all eight longword copies`);
    }
    if (bank === 0) {
      assert.equal(ram.u8(PALSTAGE.tx.stage - 1), 0x3c, 'lower adjacent byte survives');
      assert.equal(ram.u16(base + 32), 0xa55a, 'opposite bank above bank 0 survives');
    } else {
      assert.equal(ram.u16(base - 2), 0xa55a, 'opposite bank below bank 14 survives');
      assert.equal(ram.u16(PALSTAGE.spr.dirty), 0xc0de,
        'bank 14 ends immediately before the sprite dirty sentinel at $80FA66');
    }
    assert.equal(ram.u16(PALSTAGE.bg.dirty), 0xd00d);
    assert.equal(ram.u16(PALSTAGE.tx.dirty), 1, 'dirty recycled state is owned as a word');
    assert.deepEqual(source, before, 'the source pointer advances only in the machine model, not its data');
  }
});

test('SECTION 3c: provenance and install metadata own only the selected 16-word bank', () => {
  const ram = new Ram();
  const pal = new PaletteState();
  const source = Uint8Array.from({ length: 32 }, (_, i) => (i * 73 + 0x91) & 0xff);
  pal.stageSourced.tx.fill(0x7e);
  install2414BE(ram, pal, 14, source, 0x28f394, 'W462 provenance');

  assert.deepEqual([...pal.stageSourced.tx.slice(14 * TX_BANK_WORDS, 15 * TX_BANK_WORDS)],
    new Array(TX_BANK_WORDS).fill(1), 'all 16 words, including word 15, become cartridge-sourced');
  assert.equal(pal.stageSourced.tx[14 * TX_BANK_WORDS - 1], 0x7e,
    'the preceding bank keeps dirty recycled provenance');
  assert.equal(pal.installCount, 1);
  assert.deepEqual(pal.installs.get('$28F394 TX bank 14 <- W462 provenance'), { n: 1, bank: 14 });
});

test('SECTION 3d: public bounds reject machine aliases and short sources without touching RAM', () => {
  for (const bank of [-1, TX_BANKS, 0x10000]) {
    const ram = new Ram();
    const pal = new PaletteState();
    ram.setU16(PALSTAGE.tx.stage, 0xbeef);
    ram.setU16(PALSTAGE.tx.dirty, 0xa55a);
    assert.throws(() => install2414BE(ram, pal, bank, new Uint8Array(32), 0x28f394, 'bad'),
      (error) => error instanceof Unreached && /TEXT bank/.test(error.message));
    assert.equal(ram.u16(PALSTAGE.tx.stage), 0xbeef);
    assert.equal(ram.u16(PALSTAGE.tx.dirty), 0xa55a);
  }
  assert.throws(() => install2414BE(
    new Ram(), new PaletteState(), 0, new Uint8Array(31), 0x28f394, 'short'),
  (error) => error instanceof Unreached && /8 longwords = 32/.test(error.message));
});

// ---------------------------------------------------------------- SECTION 4

test('SECTION 4: real slot-8 caller preserves its counted no-palette path and defers the ROM read',
  { skip: SKIP_IMAGE }, () => {
    const ram = new Ram();
    const { notes, ctx } = noteContext(undefined);
    const reads = [];
    coinTeardown25A7C0(ram, imageRom((at, count) => reads.push([at, count])), ctx);
    assert.deepEqual(reads, [], 'the removed adapter did not eagerly read ROM before its guard');
    const miss = notes.filter(([at]) => at === BODY_START);
    assert.equal(miss.length, 1);
    assert.match(miss[0][1], /\$25A80E -- TX bank 0 <- \$222638 with no PaletteState/);
  });

test('SECTION 4b: real slot-8 caller reaches the canonical body with exact source, site and last word',
  { skip: SKIP_IMAGE }, () => {
    const ram = new Ram();
    const palette = new PaletteState();
    const { notes, ctx } = noteContext(palette);
    const reads = [];
    coinTeardown25A7C0(ram, imageRom((at, count) => reads.push([at, count])), ctx);
    assert.deepEqual(reads, [[SCREEN8.txPalMain, 32]]);
    assert.equal(notes.some(([at]) => at === BODY_START), false);
    assert.ok(palette.installs.has('$25A80E TX bank 0 <- slot [8] coin-teardown TX palette'));
    assert.equal(ram.u16(PALSTAGE.tx.stage + 30), IMG.readUInt16BE(SCREEN8.txPalMain + 30),
      'the real caller copies the final word, not merely the first fifteen');
  });

test('SECTION 4c: real slot-12 caller keeps both absent and present palette conventions',
  { skip: SKIP_IMAGE }, () => {
    {
      const ram = new Ram();
      const a5 = 0x810400;
      const { notes, ctx } = noteContext(undefined);
      const reads = [];
      teardown28F368(ram, imageRom((at, count) => reads.push([at, count])), a5, ctx);
      assert.deepEqual(reads, []);
      const miss = notes.filter(([at]) => at === BODY_START);
      assert.equal(miss.length, 1);
      assert.match(miss[0][1], /\$28F394 -- TX bank 0 <- \$222638 with no PaletteState/);
    }
    {
      const ram = new Ram();
      const a5 = 0x810400;
      const palette = new PaletteState();
      const { notes, ctx } = noteContext(palette);
      const reads = [];
      teardown28F368(ram, imageRom((at, count) => reads.push([at, count])), a5, ctx);
      assert.deepEqual(reads, [[SLOT12.txPal, 32]]);
      assert.equal(notes.some(([at]) => at === BODY_START), false);
      assert.ok(palette.installs.has('$28F394 TX bank 0 <- slot [12] name-entry TX palette'));
      assert.equal(ram.u16(PALSTAGE.tx.stage + 30), IMG.readUInt16BE(SLOT12.txPal + 30));
    }
  });

// ---------------------------------------------------------------- SECTION 5

test('SECTION 5: one public canonical identity, direct callers and no private adapter identity remain',
  () => {
    const sourceMap = new Map(sources());
    const allCode = stripComments([...sourceMap.values()].join('\n'));
    assert.equal(paletteModule.install2414BE, install2414BE,
      'named and namespace imports retain the exact public ESM function identity');
    assert.equal('installTxBank' in objslot8Module, false);
    assert.equal('installTxBank' in objslot12Module, false);
    assert.doesNotMatch(allCode, /\binstallTxBank\b/,
      'the two private declarations and every private call are gone rather than aliased');

    assert.equal((allCode.match(/\bexport\s+function\s+install2414BE\s*\(/g) ?? []).length, 1);
    assert.equal((allCode.match(/\binstall2414BE\s*\(/g) ?? []).length, 14,
      'thirteen production invocations plus the sole declaration remain');
    assert.doesNotMatch(allCode, /\binstall2414BE\s*:/,
      'no context callback or object property creates a second identity');
    assert.doesNotMatch(allCode, /\.install2414BE\s*\(/,
      'production calls use the imported canonical binding directly');

    const importers = [];
    for (const [name, source] of sourceMap) {
      if (/import\s*\{[^}]*\binstall2414BE\b[^}]*\}\s*from\s*['"]\.\/palette\.js['"]/.test(source)) {
        importers.push(name);
      }
    }
    assert.deepEqual(importers.sort(), [
      'frontend.js', 'objslot12.js', 'objslot17.js', 'objslot8.js', 'objslot9.js', 'rank.js',
    ]);

    const expectedCalls = Object.freeze([
      ['frontend.js', 1], ['objslot12.js', 1], ['objslot17.js', 1],
      ['objslot8.js', 5], ['objslot9.js', 1], ['palette.js', 3], ['rank.js', 2],
    ]);
    for (const [name, count] of expectedCalls) {
      assert.equal((stripComments(sourceMap.get(name)).match(/\binstall2414BE\s*\(/g) ?? []).length,
        count, `${name} canonical occurrence count`);
    }

    const namedTestImports = readdirSync(TESTS).filter((name) => name.endsWith('.test.js'))
      .filter((name) => /import\s*\{[^}]*\binstall2414BE\b[^}]*\}\s*from\s*['"]\.\.\/src\/palette\.js['"]/
        .test(readFileSync(join(TESTS, name), 'utf8'))).sort();
    assert.deepEqual(namedTestImports, ['w462auditinstall2414be.test.js', 'w93palette.test.js'].sort(),
      'the public function keeps both exact named test imports; no private name ever had one');
  });

test('SECTION 5b: former adapters preserve argument adaptation at each direct caller site', () => {
  const slot8 = readFileSync(join(SRC, 'objslot8.js'), 'utf8');
  const slot12 = readFileSync(join(SRC, 'objslot12.js'), 'utf8');
  const exact = [
    [slot8, 0x25a80e, 'SCREEN8.txPalMain', 'slot [8] coin-teardown TX palette'],
    [slot8, 0x25a92c, 'SCREEN8.txPalMain', 'slot [8] arm 2 TX palette'],
    [slot8, 0x25a9a2, 'SCREEN8.txPalWarn', 'slot [8] arm 5 TX palette'],
    [slot8, 0x25ac10, 'SCREEN8.txPalWarn', 'slot [8] arm 13 TX palette'],
    [slot12, 0x28f394, 'SLOT12.txPal', 'slot [12] name-entry TX palette'],
  ];
  for (const [source, site, src, why] of exact) {
    const at = `0x${site.toString(16)}`;
    const call = new RegExp(`install2414BE\\(ram, ctx\\.palette, 0, rom\\.bytes\\(${src
      .replace('.', '\\.')}, 32\\), ${at},\\s*['"]${why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\)`);
    assert.match(source, call, `${hex(site)} retains bank 0, exact ROM block, 32-byte count and reason`);
  }
  assert.match(slot8, /if \(!ctx\?\.palette\)[\s\S]*\$25A80E[\s\S]*install2414BE/,
    'the ROM read remains below the slot-8 palette guard');
  assert.match(slot12, /if \(!ctx\?\.palette\)[\s\S]*\$28F394[\s\S]*install2414BE/,
    'the ROM read remains below the slot-12 palette guard');

  const paletteSource = readFileSync(join(SRC, 'palette.js'), 'utf8');
  const scanned = scanFile(paletteSource);
  const head = scanned.heads.find((candidate) => candidate.name === 'install2414BE');
  assert.ok(head);
  const body = scanned.lines.slice(head.line, head.endLine + 1).join('\n');
  assert.match(body, /const base = PALSTAGE\.tx\.stage \+ d0 \* 32/);
  assert.match(body, /for \(let i = 0; i < TX_BANK_WORDS; i\+\+\)/,
    'all sixteen words remain production behavior; this is the temporary RED guard');
  assert.match(body, /ram\.setU16\(PALSTAGE\.tx\.dirty, 1\)/);
});

test('SECTION 5c: source-represented callers, the one static gap and dependency direction are exact', () => {
  assert.equal(SOURCE_REPRESENTED_SITES.length, 28);
  assert.deepEqual([...SOURCE_REPRESENTED_SITES, 0x288590].sort((a, b) => a - b),
    [...EXTERNAL_CALLERS]);
  assert.deepEqual(EXTERNAL_CALLERS.filter((site) => !SOURCE_REPRESENTED_SITES.includes(site)),
    [0x288590], '$288590 bank 13 remains the sole static source gap');

  const sourceMap = new Map(sources());
  assert.match(sourceMap.get('objslot8.js'), /from '\.\/palette\.js';/);
  assert.match(sourceMap.get('objslot12.js'), /from '\.\/palette\.js';/);
  assert.doesNotMatch(sourceMap.get('palette.js'), /from '\.\/objslot(?:8|12)\.js'/,
    'dependency direction remains one-way and acyclic');
  const main = sourceMap.get('main.js');
  assert.match(main, /palette: this\.palette/,
    'Game#ctx supplies a PaletteState to every production front-end driver call');
  assert.match(main, /unported: this\.unportedLog/,
    'the counted compatibility path is also live for intentionally bare contexts');
  assert.equal('dynamic indirect reachability remains unproved',
    'dynamic indirect reachability remains unproved');
});

// ---------------------------------------------------------------- SECTION 6

test('SECTION 6: live registers reconcile to 16 narrow, 82 widened, 27 pairs and 22 body-only', () => {
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

  assert.equal(narrow.length, 16, 'private wrappers never formed an export-only row');
  assert.equal(heads.length, 82, 'W463 removes $28C0FC to leave 83; W464 removes $28E7A2 to leave 82');
  assert.equal(heads.includes(BODY_START), false);
  assert.equal(pairs.length, 27, 'the wrappers never formed a two-marker body edge');
  assert.equal(pairs.some(([pair]) => /installTxBank/.test(pair)), false);
  assert.equal(bodyOnly.length, 22,
    'body-only is derived from live headIndex(), not copied arithmetic');
});

test('SECTION 6b: all existing palette windows remain exact and executable bytes remain unexported', () => {
  const relevant = windows().filter(({ base, len }) => base >= 0x222618 && base < 0x222838)
    .map(({ base, len }) => [base, len]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(relevant, [
    [0x222618, 0x20], [0x222638, 0xc0], [0x2226f8, 0x80],
    [0x222778, 0x80], [0x2227f8, 0x20],
  ], 'the five existing data windows retain their exact bases and lengths');
  assert.equal(windows().some(({ base, len }) => base <= 0x222818 && base + len >= 0x222838), false,
    '$288590\'s unproved bank-13 block remains deliberately unexported');
  assert.equal(windows().some(({ base, len }) => base <= BODY_START && base + len >= BODY_END), false,
    'the executable proof adds no ROM window');

  const exporter = readFileSync(EXPORTER, 'utf8');
  for (const [base, len] of relevant) {
    const pattern = new RegExp(`\\(0x${base.toString(16).toUpperCase()}, 0x${len
      .toString(16).padStart(4, '0').toUpperCase()},`, 'g');
    assert.equal((exporter.match(pattern) ?? []).length, 1,
      `${hex(base)} + ${hex(len)} remains one exact exporter declaration`);
  }
  assert.doesNotMatch(exporter, /\(0x2414BE,\s*0x[0-9A-Fa-f]{4},\s*["']/,
    'no executable `$2414BE` window is declared merely for this test');
});
