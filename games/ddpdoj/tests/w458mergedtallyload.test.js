// WAVE 458 (D69) -- ONE COMPLETE $25DA60 TALLY CURSOR LOAD BODY.
//
// The live phase-0 path and a source-uncalled compatibility export transcribed
// the same 52-byte cartridge routine independently. This test pins the complete
// body, every direct static transfer, the full parent gate and continuation,
// dirty external witnesses, source reachability, and duplicate-register removal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cursorsFromPosted25D9E6, mapSavedCursor25D9E6,
  loadSavedCursor25DA60, restoreCursors25DA60,
  tallyPhase0Arm25DC2C, SCREEN11,
} from '../src/tallyscreen.js';
import { TALLY } from '../src/tally.js';
import { Ram } from '../src/ram.js';
import {
  bodyPairs, headIndex, headRegister, narrowIndex, scanFile, sources,
} from './w450widenedscan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const IMAGE = join(ROOT, 'rip', 'sound', 'maincpu.bin');
const SOURCE = join(ROOT, 'src', 'tallyscreen.js');
const HAVE_IMAGE = existsSync(IMAGE);
const IMG = HAVE_IMAGE ? readFileSync(IMAGE) : null;
const SKIP_IMAGE = HAVE_IMAGE ? false : 'maincpu.bin absent; skip, not pass';
const ROM = {
  u16: (at) => IMG.readUInt16BE(at),
  u32: (at) => IMG.readUInt32BE(at),
};

const IMAGE_SHA256 = '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c';
const BODY_START = 0x25da60;
const BODY_END = 0x25da94;
const BODY_HEX = '3c39008130843e39008130884a2d00076700000e3c39008130863e390081308a7a001a2d00076100ff5e1b46000e1b47000f4e75';
const PICKER_START = 0x25da94;
const PICKER_END = 0x25dac2;
const PICKER_HEX = '7e001e2d000f6100004e6400000e52070c0700026ff07e0060ec1b47000f286d0008206c0010116d000f00014e75';
const PARENT_START = 0x25dc2c;
const PARENT_END = 0x25dcc0;
const PARENT_HEX = '286d00080c2d0000000c660000884a79008130986700000e0c79000400813092670000724a790080392666000068206c00044e900800000f6700005a4eb90028d53c65000050206c000c4e90650000466100fde26100fe121b7c0001000c102d00074eb900260a88302c001441f9002259784eb90024150a4eb90023c6687000102d0007323c00074eb90025ff384eba042e4e71';
const SLOT = 0x80e240;
const MAILBOX_BASE = 0x813080;
const MAILBOX_LENGTH = 0x14;
const SAVED_BASE = SCREEN11.savedA - 4;
const SAVED_LENGTH = 0x1e;
const ANNOUNCE_BASE = 0x81315e;
const ANNOUNCE_LENGTH = 0x10;

const BODY_INSTRUCTIONS = Object.freeze([
  [0x25da60, '3c3900813084'], [0x25da66, '3e3900813088'],
  [0x25da6c, '4a2d0007'], [0x25da70, '6700000e'],
  [0x25da74, '3c3900813086'], [0x25da7a, '3e390081308a'],
  [0x25da80, '7a00'], [0x25da82, '1a2d0007'],
  [0x25da86, '6100ff5e'], [0x25da8a, '1b46000e'],
  [0x25da8e, '1b47000f'], [0x25da92, '4e75'],
]);

function bytes(at, count) { return IMG.subarray(at, at + count); }
function pcWordTarget(opcodeAt) { return opcodeAt + 2 + IMG.readInt16BE(opcodeAt + 2); }
function pcByteTarget(opcodeAt) { return opcodeAt + 2 + IMG.readInt8(opcodeAt + 1); }
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
function signed8(value) { return (value & 0x80) !== 0 ? value - 0x100 : value; }
function signed16(value) { return (value & 0x8000) !== 0 ? value - 0x10000 : value; }

// Scan the entire 6 MiB image at every aligned word. This includes BSR, all
// static branch forms, absolute.W/L and PC-relative JSR/JMP. Indexed PC forms
// are reported separately because their register contribution is dynamic.
function staticTransfersInto(start, end) {
  const hits = [];
  for (let at = 0; at + 6 <= IMG.length; at += 2) {
    const opcode = IMG.readUInt16BE(at);
    let target = null;
    let kind = null;
    if (opcode >= 0x6000 && opcode <= 0x6fff) {
      const low = opcode & 0xff;
      target = at + 2 + (low === 0
        ? signed16(IMG.readUInt16BE(at + 2)) : signed8(low));
      kind = (opcode & 0xff00) === 0x6100 ? 'BSR'
        : ((opcode & 0xff00) === 0x6000 ? 'BRA' : 'Bcc');
    } else if ((opcode & 0xf0f8) === 0x50c8) {
      target = at + 2 + signed16(IMG.readUInt16BE(at + 2));
      kind = 'DBcc';
    } else if ((opcode & 0xffc0) === 0x4e80 || (opcode & 0xffc0) === 0x4ec0) {
      const prefix = (opcode & 0xffc0) === 0x4e80 ? 'JSR' : 'JMP';
      const mode = (opcode >> 3) & 7;
      const reg = opcode & 7;
      if (mode === 7 && reg === 0) {
        target = signed16(IMG.readUInt16BE(at + 2));
        kind = `${prefix}.W`;
      } else if (mode === 7 && reg === 1) {
        target = IMG.readUInt32BE(at + 2);
        kind = `${prefix}.L`;
      } else if (mode === 7 && reg === 2) {
        target = at + 2 + signed16(IMG.readUInt16BE(at + 2));
        kind = `${prefix}.PC16`;
      }
    }
    if (target !== null && target >= start && target < end) hits.push([at, kind, target]);
  }
  return hits;
}
function indexedPcBasesInto(start, end) {
  const hits = [];
  for (let at = 0; at + 4 <= IMG.length; at += 2) {
    const opcode = IMG.readUInt16BE(at);
    if ((opcode & 0xffc0) !== 0x4e80 && (opcode & 0xffc0) !== 0x4ec0) continue;
    if (((opcode >> 3) & 7) !== 7 || (opcode & 7) !== 3) continue;
    const base = at + 2 + signed8(IMG.readUInt8(at + 3));
    if (base >= start && base < end) hits.push([at, base, IMG.readUInt16BE(at + 2)]);
  }
  return hits;
}
function functionText(fileText, name) {
  const scanned = scanFile(fileText);
  const head = scanned.heads.find((candidate) => candidate.name === name);
  assert.ok(head, `${name} source head exists`);
  return scanned.lines.slice(head.line, head.endLine + 1).join('\n');
}
function phaseContext() { return { unportedLog: { note() {} } }; }

// ---------------------------------------------------------------- SECTION 1

test('SECTION 1: Build-B image and every instruction in complete [$25DA60,$25DA94)',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(IMG.length, 0x600000, 'the complete main CPU image is 6 MiB');
    assert.equal(createHash('sha256').update(IMG).digest('hex'), IMAGE_SHA256);
    assert.equal(BODY_END - BODY_START, 52, 'the complete load body is 52 bytes');
    assert.deepEqual(bytes(BODY_START, BODY_END - BODY_START), Buffer.from(BODY_HEX, 'hex'));
    for (const [at, hex] of BODY_INSTRUCTIONS) {
      assert.deepEqual(bytes(at, hex.length / 2), Buffer.from(hex, 'hex'), `$${at.toString(16)}`);
    }
    assert.equal(BODY_INSTRUCTIONS.reduce((sum, [, hex]) => sum + hex.length / 2, 0), 52,
      'instruction census consumes the entire span with no gap');
    assert.equal(IMG.readUInt16BE(BODY_START - 2), 0x4e75, '$25DA5E is RTS, not fallthrough');
    assert.equal(IMG.readUInt16BE(BODY_END), 0x7e00, '$25DA94 starts the distinct row picker');
  });

test('SECTION 1b: body control targets and complete full-image caller census are exact',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(pcWordTarget(0x25da70), 0x25da80, 'zero side skips the side-1 mailbox reload');
    assert.equal(pcWordTarget(0x25da86), 0x25d9e6, 'the one inner BSR targets W457 canonical body');
    assert.deepEqual(staticTransfersInto(BODY_START, BODY_END), [
      [0x25da70, 'Bcc', 0x25da80],
      [0x25dc7c, 'BSR', 0x25da60],
    ], 'one internal branch and one external direct caller across every static transfer form');
    assert.deepEqual(indexedPcBasesInto(BODY_START, BODY_END), [],
      'no indexed-PC JSR/JMP has a zero-index base inside the body');
  });

// ---------------------------------------------------------------- SECTION 2

test('SECTION 2: complete $25DC2C parent gate, continuation and $25DA94 picker are pinned',
  { skip: SKIP_IMAGE }, () => {
    assert.deepEqual(bytes(PARENT_START, PARENT_END - PARENT_START), Buffer.from(PARENT_HEX, 'hex'),
      '[$25DC2C,$25DCC0) includes every gate and the post-load continuation');
    assert.deepEqual(bytes(PICKER_START, PICKER_END - PICKER_START), Buffer.from(PICKER_HEX, 'hex'),
      '[$25DA94,$25DAC2) includes collision search, descriptor store and RTS');

    for (const [at, target] of [
      [0x25dc36, 0x25dcc0], [0x25dc40, 0x25dc50], [0x25dc4c, 0x25dcc0],
      [0x25dc56, 0x25dcc0], [0x25dc64, 0x25dcc0], [0x25dc6e, 0x25dcc0],
      [0x25dc78, 0x25dcc0], [0x25dc7c, 0x25da60], [0x25dc80, 0x25da94],
      [0x25dcba, 0x25e0ea], [0x25da9a, 0x25daea], [0x25da9e, 0x25daae],
    ]) assert.equal(pcWordTarget(at), target, `$${at.toString(16)} target`);
    assert.equal(pcByteTarget(0x25daa8), 0x25da9a, '$25DAA8 BLE retries the collision test');
    assert.equal(pcByteTarget(0x25daac), 0x25da9a, '$25DAAC BRA retries after wrap');
    assert.deepEqual([...bytes(0x25daba, 8)], [0x11, 0x6d, 0x00, 0x0f, 0x00, 0x01, 0x4e, 0x75],
      '$25DABA stores the resolved row through A0+$1 and returns');
  });

// ---------------------------------------------------------------- SECTION 3

test('SECTION 3: mailbox ownership, polarity, zero extension and return convention are exact',
  { skip: SKIP_IMAGE }, () => {
    assert.deepEqual(TALLY.postD0, [0x813084, 0x813086]);
    assert.deepEqual(TALLY.postD1, [0x813088, 0x81308a]);
    assert.equal(ROM.u32(SCREEN11.descA + 0x10), SCREEN11.savedA,
      'side-0 descriptor publishes to $813008');
    assert.equal(ROM.u32(SCREEN11.descB + 0x10), SCREEN11.savedB,
      'side-1 descriptor publishes to $813018');
    assert.equal(IMG.readUInt16BE(0x25da80), 0x7a00, 'MOVEQ #0,D5 performs the zero extension');
    assert.equal(IMG.readUInt32BE(0x25da82), 0x1a2d0007, 'MOVE.B side,D5 keeps the raw byte');
    assert.equal(IMG.readUInt16BE(0x25da8a), 0x1b46, 'carry is ignored and D6.B stores immediately');
    assert.equal(IMG.readUInt16BE(0x25da8e), 0x1b47, 'D7.B is the only other object store');
    assert.equal(IMG.readUInt16BE(0x25da92), 0x4e75, 'plain RTS has no separate status conversion');
  });

const DIRECT_CASES = Object.freeze([
  { name: 'side 0 sentinel', side: 0, x: 0x00ff, y: 0xdead,
    returned: { x: 0, y: 0, defaulted: true }, stored: [0, 0] },
  { name: 'side 1 sentinel', side: 1, x: 0x00ff, y: 0xbeef,
    returned: { x: 1, y: 2, defaulted: true }, stored: [1, 2] },
  { name: 'side $80 matched', side: 0x80, x: 0x0002, y: 0x0004,
    returned: { x: 1, y: 1, defaulted: false }, stored: [1, 1] },
  { name: 'side $FF unmatched', side: 0xff, x: 0x0100, y: 0x01ff,
    returned: { x: 0x0100, y: 0x01ff, defaulted: false }, stored: [0, 0xff] },
  { name: 'side 0 matched', side: 0, x: 0x0000, y: 0x0006,
    returned: { x: 0, y: 2, defaulted: false }, stored: [0, 2] },
  { name: '$00FE and $0100 searched', side: 0, x: 0x00fe, y: 0x0100,
    returned: { x: 0x00fe, y: 0x0100, defaulted: false }, stored: [0xfe, 0] },
]);

test('SECTION 3b: both export names drive dirty records through every width and carry arm',
  { skip: SKIP_IMAGE }, () => {
    for (const [sourceName, fn] of [
      ['loadSavedCursor25DA60', loadSavedCursor25DA60],
      ['restoreCursors25DA60', restoreCursors25DA60],
    ]) {
      for (let index = 0; index < DIRECT_CASES.length; index++) {
        const c = DIRECT_CASES[index];
        const ram = new Ram();
        fillBytes(ram, SLOT - 4, 0x58, 0x39 + index * 17);
        fillBytes(ram, MAILBOX_BASE, MAILBOX_LENGTH, 0x91 + index * 13);
        ram.setU8(SLOT + SCREEN11.side, c.side);
        const side = c.side === 0 ? 0 : 1;
        ram.setU16(TALLY.postD0[side], c.x);
        ram.setU16(TALLY.postD1[side], c.y);
        const slotBefore = snapshot(ram, SLOT - 4, 0x58);
        const mailboxBefore = snapshot(ram, MAILBOX_BASE, MAILBOX_LENGTH);

        const got = fn(ram, ROM, SLOT);
        assert.deepEqual(got, c.returned, `${sourceName}: ${c.name}: full word and carry result`);
        assert.deepEqual(Object.keys(got).sort(), ['defaulted', 'x', 'y'],
          `${sourceName}: ${c.name}: no unowned register or field is exposed`);
        assert.deepEqual([ram.u8(SLOT + SCREEN11.xCur), ram.u8(SLOT + SCREEN11.yCur)], c.stored,
          `${sourceName}: ${c.name}: low-byte stores`);
        assertBytesExcept(ram, SLOT - 4, slotBefore,
          new Set([4 + SCREEN11.xCur, 4 + SCREEN11.yCur]),
          `${sourceName}: ${c.name}: recycled object ownership`);
        assert.deepEqual(snapshot(ram, MAILBOX_BASE, MAILBOX_LENGTH), mailboxBefore,
          `${sourceName}: ${c.name}: chosen, opposite and adjacent mailbox words stay read-only`);
      }
    }
  });

// ---------------------------------------------------------------- SECTION 4

function readyParent(ram, c) {
  fillBytes(ram, SLOT - 4, 0x58, 0x55 + c.side);
  fillBytes(ram, MAILBOX_BASE, MAILBOX_LENGTH, 0xa3 + c.side);
  fillBytes(ram, SAVED_BASE, SAVED_LENGTH, 0x67 + c.side);
  fillBytes(ram, ANNOUNCE_BASE, ANNOUNCE_LENGTH, 0xc1 + c.side);
  ram.setU8(SLOT + SCREEN11.phase, 0);
  ram.setU8(SLOT + SCREEN11.side, c.side);
  ram.setU32(SLOT + SCREEN11.desc, c.side === 0 ? SCREEN11.descA : SCREEN11.descB);
  ram.setU16(0x813098, 0);
  ram.setU16(0x813092, 3);
  ram.setU16(0x803926, 0);
  ram.setU16(SCREEN11.carryWord, 0);
  ram.setU16(0x803972, 0);
  ram.setU16(0x803978, 0);
  ram.setU16(c.side === 0 ? 0x803972 : 0x803978, 0x8000);
  const side = c.side === 0 ? 0 : 1;
  ram.setU16(TALLY.postD0[side], c.x);
  ram.setU16(TALLY.postD1[side], c.y);
  ram.setU16(0x81308c, c.liveWord);
  const other = c.side === 0 ? SCREEN11.savedB : SCREEN11.savedA;
  ram.setU8(other + 1, c.otherRow);
}

const PARENT_CASES = Object.freeze([
  { name: 'side 0 inactive mailbox ignores equal row', side: 0, x: 0x0002, y: 0x0004,
    liveWord: 0, otherRow: 1, loaded: [1, 1], final: [1, 1], own: SCREEN11.savedA },
  { name: 'side $80 active mailbox resolves loaded collision', side: 0x80, x: 0x00ff, y: 0xdead,
    liveWord: 0xff80, otherRow: 2, loaded: [1, 2], final: [1, 0], own: SCREEN11.savedB },
]);

test('SECTION 4: live $25DC2C parent runs both sides, mailbox states and ordered row collision',
  { skip: SKIP_IMAGE }, () => {
    for (const c of PARENT_CASES) {
      const ram = new Ram();
      readyParent(ram, c);
      const slotBefore = snapshot(ram, SLOT - 4, 0x58);
      const mailboxBefore = snapshot(ram, MAILBOX_BASE, MAILBOX_LENGTH);
      const savedBefore = snapshot(ram, SAVED_BASE, SAVED_LENGTH);
      const announceBefore = snapshot(ram, ANNOUNCE_BASE, ANNOUNCE_LENGTH);

      assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, phaseContext()), true,
        `${c.name}: phase-0 START reaches the load`);
      assert.deepEqual([ram.u8(SLOT + SCREEN11.xCur), ram.u8(SLOT + SCREEN11.yCur)], c.final,
        `${c.name}: $25DA60 load precedes $25DA94 collision resolution`);
      assert.equal(ram.u8(SLOT + SCREEN11.phase), 1, `${c.name}: continuation advances phase`);
      assert.equal(ram.u8(c.own + 1), c.final[1],
        `${c.name}: complete picker publishes resolved Y through descriptor +$10`);
      assertBytesExcept(ram, SLOT - 4, slotBefore,
        new Set([4 + SCREEN11.phase, 4 + SCREEN11.xCur, 4 + SCREEN11.yCur]),
        `${c.name}: dirty parent object ownership`);
      assert.deepEqual(snapshot(ram, MAILBOX_BASE, MAILBOX_LENGTH), mailboxBefore,
        `${c.name}: cursor mailbox, live word and adjacent $81308E sentinel are read-only`);
      assertBytesExcept(ram, SAVED_BASE, savedBefore,
        new Set([c.own + 1 - SAVED_BASE]), `${c.name}: only own saved Y byte changes`);

      const box = c.side === 0 ? 0x813162 : 0x813166;
      assert.deepEqual([ram.u16(box), ram.u16(box + 2)], [1, 0],
        `${c.name}: continuation posts the correct side announcement`);
      assertBytesExcept(ram, ANNOUNCE_BASE, announceBefore,
        new Set(Array.from({ length: 4 }, (_, n) => box - ANNOUNCE_BASE + n)),
        `${c.name}: opposite announcement mailbox stays dirty`);
    }
  });

test('SECTION 4b: opposite phase gate returns before touching any dirty external state',
  { skip: SKIP_IMAGE }, () => {
    const ram = new Ram();
    readyParent(ram, PARENT_CASES[1]);
    ram.setU8(SLOT + SCREEN11.phase, 1);
    const regions = [
      [SLOT - 4, 0x58], [MAILBOX_BASE, MAILBOX_LENGTH],
      [SAVED_BASE, SAVED_LENGTH], [ANNOUNCE_BASE, ANNOUNCE_LENGTH],
    ];
    const before = regions.map(([base, length]) => snapshot(ram, base, length));
    assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, phaseContext()), false,
      'nonzero phase takes the $25DC30 -> $25DCC0 gate');
    regions.forEach(([base, length], index) => {
      assert.deepEqual(snapshot(ram, base, length), before[index], `$${base.toString(16)} untouched`);
    });
  });

// ---------------------------------------------------------------- SECTION 5

test('SECTION 5: cartridge and production-source reachability are proved separately', () => {
  const source = readFileSync(SOURCE, 'utf8');
  const sourceHeads = [];
  for (const [file, text] of sources()) {
    for (const head of scanFile(text).heads) {
      if (head.name === 'loadSavedCursor25DA60' || head.name === 'restoreCursors25DA60') {
        sourceHeads.push(`${file} ${head.name}`);
      }
    }
  }
  assert.deepEqual(sourceHeads, ['tallyscreen.js loadSavedCursor25DA60'],
    'source has one canonical body and no restore body');
  assert.match(source, /export \{ loadSavedCursor25DA60 as restoreCursors25DA60 \};/,
    'the source-dead historical name remains a compatibility export');
  assert.equal(loadSavedCursor25DA60, restoreCursors25DA60,
    'both imports now resolve to the same function object');
  assert.equal(mapSavedCursor25D9E6, cursorsFromPosted25D9E6,
    'W457 canonical body and compatibility alias remain untouched');
  assert.equal((source.match(/export function cursorsFromPosted25D9E6\s*\(/g) ?? []).length, 1);
  assert.equal((source.match(/export function mapSavedCursor25D9E6\s*\(/g) ?? []).length, 0);

  const phase = functionText(source, 'tallyPhase0Arm25DC2C');
  const screen = functionText(source, 'tallyScreen25DBB4');
  assert.equal((phase.match(/loadSavedCursor25DA60\(ram, rom, a5\)/g) ?? []).length, 1,
    'canonical source body is live once through the phase-0 parent');
  assert.equal((phase.match(/restoreCursors25DA60\s*\(/g) ?? []).length, 0,
    'compatibility name has no production source caller');
  assert.equal((screen.match(/tallyPhase0Arm25DC2C\(ram, ctx\?\.rom, slot, ctx\)/g) ?? []).length, 1,
    'object [11] state 1 reaches the phase parent');
});

// ---------------------------------------------------------------- SECTION 6

test('SECTION 6: live scanner APIs reconcile through W462 and keep W457/W458 absent', () => {
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
  const removed = 'tallyscreen.js loadSavedCursor25DA60 <> tallyscreen.js restoreCursors25DA60';
  const removedRequest = 'player.js armRequest25FF38 <> tallyscreen.js tallyRequest25FF38';
  const removedRank = 'initbody.js rankByte242E24 <> rng.js drawByte242E24';

  assert.equal(narrow.length, 16, 'W459 removes one exported $25FF38 head from W458 baseline 17');
  assert.equal(heads.length, 84, 'W462 removes the widened $2414BE row after W461 left 85');
  assert.equal(pairs.length, 27, 'W461 removes the complete rank-byte edge from baseline 28');
  assert.equal(bodyOnly.length, 22,
    'body-only remains derived live and unchanged because W461 removes a head-visible pair');
  assert.equal(heads.includes(BODY_START), false, '$25DA60 stays off the widened register');
  assert.equal(narrow.some(([at]) => at === BODY_START), false, '$25DA60 stays off the narrow register');
  assert.equal(pairs.some(([pair]) => pair === removed), false, '$25DA60 body edge stays absent');
  assert.equal(heads.includes(0x25d9e6), false, 'W457 $25D9E6 stays off the head register');
  assert.equal(pairs.some(([pair]) => /25D9E6/.test(pair)), false, 'W457 body edge stays absent');
  assert.equal(heads.includes(0x25ff38), false, '$25FF38 stays off the widened register after W459');
  assert.equal(pairs.some(([pair]) => pair === removedRequest), false, 'W459 body edge stays absent');
  assert.equal(heads.includes(0x242e24), false, '$242E24 stays off the widened register after W461');
  assert.equal(pairs.some(([pair]) => pair === removedRank), false, 'W461 body edge stays absent');
});
