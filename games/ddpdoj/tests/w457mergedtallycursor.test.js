// WAVE 457 (D69) -- ONE COMPLETE $25D9E6 CURSOR-MAP BODY.
//
// The state-7 posting path and tally phase-0 load path had independent JS
// transcriptions of the same 122-byte cartridge routine. This test pins the
// complete body, all three direct calls and both caller continuations, then
// drives dirty external records through both production caller families.

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
import { savedSelections25D990, SAVEDSEL_25D990 } from '../src/objslot17.js';
import { Ram } from '../src/ram.js';
import {
  bodyPairs, headIndex, headRegister, narrowIndex,
} from './w450widenedscan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const IMAGE = join(ROOT, 'rip', 'sound', 'maincpu.bin');
const SOURCE = join(ROOT, 'src', 'tallyscreen.js');
const HAVE_IMAGE = existsSync(IMAGE);
const IMG = HAVE_IMAGE ? readFileSync(IMAGE) : null;
const SKIP_IMAGE = HAVE_IMAGE ? false : 'maincpu.bin absent; skip, not pass';
const ROM = {
  u16: (at) => (IMG ? IMG.readUInt16BE(at) : 0),
  u32: (at) => (IMG ? IMG.readUInt32BE(at) : 0),
};

const IMAGE_SHA256 = '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c';
const BODY_START = 0x25d9e6;
const BODY_END = 0x25da60;
const BODY_HEX = '2f002f010c4600ff660000204a456600000e3c3c00003e3c0000600000543c3c00013e3c000260000048700141faff723200d24132301000b246660000083c006000000651c8ffe6700241faff583200d24132301000b247660000083e006000000651c8ffe6221f201f027cfffe4e75221f201f007c00014e75';
const POST_CALLER_HEX = '13fc00ff0081300813fc00ff008130093c003e027a006100003e6500000e13c60081300813c70081300913fc00ff0081301813fc00ff008130193c013e037a01610000146500000e13c60081301813c7008130194e75';
const LOAD_CALLER_HEX = '3c39008130843e39008130884a2d00076700000e3c39008130863e390081308a7a001a2d00076100ff5e1b46000e1b47000f4e75';
const POST_PARENT_HEX = '4eb90025d9907e004a7900803926670000120c79000000813092660000063e3c00383c39008130806100fe00';
const LOAD_PARENT_HEX = '6100fde26100fe121b7c0001000c102d00074eb900260a88302c001441f9002259784eb90024150a4eb90023c668';
const SLOT = 0x80e240;
const SAVED = Object.freeze({ x0: 0x813084, x1: 0x813086, y0: 0x813088, y1: 0x81308a });

function bytes(at, count) { return IMG.subarray(at, at + count); }
function pcWordTarget(opcodeAt) { return opcodeAt + 2 + IMG.readInt16BE(opcodeAt + 2); }
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
function scanCallsTo25D9E6() {
  const out = [];
  for (let at = 0x230000; at < 0x2b0000; at += 2) {
    const opcode = IMG.readUInt16BE(at);
    if ((opcode & 0xff00) !== 0x6100) continue;
    const low = opcode & 0xff;
    const displacement = low === 0 ? IMG.readInt16BE(at + 2)
      : ((low & 0x80) !== 0 ? low - 0x100 : low);
    if (at + 2 + displacement === BODY_START) out.push(at);
  }
  return out;
}
function externalBlock(ram) {
  return snapshot(ram, SCREEN11.savedA - 4, 0x1e);
}
function seedExternalBlock(ram, salt) {
  fillBytes(ram, SCREEN11.savedA - 4, 0x1e, salt);
}
function phaseContext() {
  return { unportedLog: { note() {} } };
}
function readyPhase0(ram, side, x, y) {
  fillBytes(ram, SLOT - 4, 0x58, 0x39 + side);
  ram.setU8(SLOT + SCREEN11.phase, 0);
  ram.setU8(SLOT + SCREEN11.side, side);
  ram.setU32(SLOT + SCREEN11.desc, side === 0 ? SCREEN11.descA : SCREEN11.descB);
  ram.setU16(0x813098, 0);
  ram.setU16(0x813092, 3);
  ram.setU16(0x803926, 0);
  ram.setU16(SCREEN11.carryWord, 0);
  ram.setU16(side === 0 ? 0x803972 : 0x803978, 0x8000);
  ram.setU16(side === 0 ? SAVED.x0 : SAVED.x1, x);
  ram.setU16(side === 0 ? SAVED.y0 : SAVED.y1, y);
  ram.setU16(0x81308c, 0); // one live side means the Y picker cannot reject a row
}

// ---------------------------------------------------------------- SECTION 1

test('SECTION 1: pinned Build-B image and complete $25D9E6..$25DA5F body',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(createHash('sha256').update(IMG).digest('hex'), IMAGE_SHA256);
    assert.equal(BODY_END - BODY_START, 122, 'the complete body is 122 bytes');
    assert.deepEqual(bytes(BODY_START, BODY_END - BODY_START), Buffer.from(BODY_HEX, 'hex'));
    assert.deepEqual(bytes(0x25d986, 4), Buffer.from('00000002', 'hex'),
      'X table is exactly two words at $25D986..$25D989');
    assert.deepEqual(bytes(0x25d98a, 6), Buffer.from('000200040006', 'hex'),
      'Y table is exactly three words at $25D98A..$25D98F');
  });

test('SECTION 1b: every branch target, search order, width and carry exit is pinned',
  { skip: SKIP_IMAGE }, () => {
    const branches = [
      [0x25d9ee, 0x6600, 0x25da10], [0x25d9f4, 0x6600, 0x25da04],
      [0x25da00, 0x6000, 0x25da56], [0x25da0c, 0x6000, 0x25da56],
      [0x25da20, 0x6600, 0x25da2a], [0x25da26, 0x6000, 0x25da2e],
      [0x25da2a, 0x51c8, 0x25da12], [0x25da3e, 0x6600, 0x25da48],
      [0x25da44, 0x6000, 0x25da4c], [0x25da48, 0x51c8, 0x25da30],
    ];
    for (const [at, opcode, target] of branches) {
      assert.equal(IMG.readUInt16BE(at), opcode, `$${at.toString(16)} opcode`);
      assert.equal(pcWordTarget(at), target, `$${at.toString(16)} target`);
    }
    assert.equal(pcWordTarget(0x25da12), SCREEN11.xTable, 'X LEA targets $25D986');
    assert.equal(pcWordTarget(0x25da30), SCREEN11.yTable, 'Y LEA targets $25D98A');
    assert.equal(IMG.readUInt16BE(0x25da10), 0x7001, 'X starts at index 1');
    assert.equal(IMG.readUInt16BE(0x25da2e), 0x7002, 'Y starts at index 2');

    assert.deepEqual([...bytes(0x25d9e6, 4)], [0x2f, 0x00, 0x2f, 0x01],
      'only D0 and D1 are saved');
    assert.equal(IMG.readUInt16BE(0x25d9f2), 0x4a45, 'D5 is read as TST.W');
    assert.equal(IMG.readUInt16BE(0x25d9ea), 0x0c46, 'D6 sentinel is compared as a word');
    assert.equal(IMG.readUInt16BE(0x25da1e), 0xb246, 'D6 table compare is a word');
    assert.equal(IMG.readUInt16BE(0x25da3c), 0xb247, 'D7 table compare is a word');
    assert.deepEqual([...bytes(0x25da4c, 10)],
      [0x22, 0x1f, 0x20, 0x1f, 0x02, 0x7c, 0xff, 0xfe, 0x4e, 0x75],
    'searched exit restores D1/D0 and clears carry');
    assert.deepEqual([...bytes(0x25da56, 10)],
      [0x22, 0x1f, 0x20, 0x1f, 0x00, 0x7c, 0x00, 0x01, 0x4e, 0x75],
    'sentinel exit restores D1/D0 and sets carry');
  });

// ---------------------------------------------------------------- SECTION 2

test('SECTION 2: all three direct callers and both parent continuations are exact',
  { skip: SKIP_IMAGE }, () => {
    assert.deepEqual(scanCallsTo25D9E6(), [0x25d9a6, 0x25d9d0, 0x25da86]);
    assert.deepEqual(bytes(0x25d990, 0x25d9e6 - 0x25d990), Buffer.from(POST_CALLER_HEX, 'hex'),
      '$25D990 posting caller has both complete arms');
    assert.deepEqual(bytes(0x25da60, 0x25da94 - 0x25da60), Buffer.from(LOAD_CALLER_HEX, 'hex'),
      '$25DA60 load caller is complete and remains separate');
    assert.deepEqual(bytes(0x260756, 0x260782 - 0x260756), Buffer.from(POST_PARENT_HEX, 'hex'),
      '$26070C parent calls $25D990 then preserves its rank continuation');
    assert.deepEqual(bytes(0x25dc7c, 0x25dcaa - 0x25dc7c), Buffer.from(LOAD_PARENT_HEX, 'hex'),
      '$25DC2C parent calls $25DA60 then preserves picker, phase, announce, bank and clear');

    assert.equal(IMG.readUInt16BE(0x25d9aa), 0x6500, 'side 0 observes carry with BCS');
    assert.equal(pcWordTarget(0x25d9aa), 0x25d9ba, 'carry set leaves side 0 sentinels');
    assert.equal(IMG.readUInt16BE(0x25d9d4), 0x6500, 'side 1 observes carry with BCS');
    assert.equal(pcWordTarget(0x25d9d4), 0x25d9e4, 'carry set leaves side 1 sentinels');
    assert.equal(IMG.readUInt16BE(0x25da8a), 0x1b46,
      '$25DA60 does not observe carry and immediately stores D6.B');
    assert.equal(IMG.readUInt16BE(0x25da8e), 0x1b47,
      '$25DA60 immediately stores D7.B too');
  });

// ---------------------------------------------------------------- SECTION 3

test('SECTION 3: compatibility name is the canonical word-width body', { skip: SKIP_IMAGE }, () => {
  assert.equal(mapSavedCursor25D9E6, cursorsFromPosted25D9E6,
    'W344 name remains an alias, not a second implementation');
  assert.deepEqual(mapSavedCursor25D9E6(ROM, 0x12340000, 0xabcd00ff, 0xdeadbeef),
    { x: 0, y: 0, defaulted: true }, 'D5 high word is unowned and D6.W is the sentinel');
  assert.deepEqual(mapSavedCursor25D9E6(ROM, 0x12340001, 0xabcd00ff, 0xdeadbeef),
    { x: 1, y: 2, defaulted: true }, 'D5 low word alone selects side 1');
  assert.deepEqual(mapSavedCursor25D9E6(ROM, 0xf00d0000, 0xabcd0002, 0xbeef0006),
    { x: 1, y: 2, defaulted: false }, 'matched D6.W and D7.W replace values with indices');
  assert.deepEqual(mapSavedCursor25D9E6(ROM, 0, 0xabcd0100, 0xbeef01ff),
    { x: 0x0100, y: 0x01ff, defaulted: false },
  'unmatched owned words survive while unowned high words are outside the helper result');
  assert.deepEqual(mapSavedCursor25D9E6(ROM, 0, 0x100fe, 0x20004),
    { x: 0x00fe, y: 1, defaulted: false }, '$00FE adjacent value is searched, not sentinel');
  assert.deepEqual(mapSavedCursor25D9E6(ROM, 0, 0x10100, 0x20004),
    { x: 0x0100, y: 1, defaulted: false }, '$0100 adjacent value is searched, not sentinel');
});

test('SECTION 3b: downward duplicate probe chooses the highest index without altering cartridge data',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(new Set([ROM.u16(0x25d986), ROM.u16(0x25d988)]).size, 2,
      'the production X table itself has no duplicate');
    assert.equal(new Set([ROM.u16(0x25d98a), ROM.u16(0x25d98c), ROM.u16(0x25d98e)]).size, 3,
      'the production Y table itself has no duplicate');
    const duplicateProbe = {
      u16(at) {
        if (at === SCREEN11.xTable || at === SCREEN11.xTable + 2) return 0x7777;
        if (at >= SCREEN11.yTable && at < SCREEN11.yTable + 6) return 0x8888;
        return ROM.u16(at);
      },
    };
    const ram = new Ram();
    savedSelections25D990(ram, duplicateProbe, 0x7777, 0x7777, 0x8888, 0x8888);
    assert.deepEqual([ram.u8(SAVEDSEL_25D990.recs[0]), ram.u8(SAVEDSEL_25D990.recs[0] + 1)],
      [1, 2], 'side 0 external record witnesses index 1 then index 2');
    assert.deepEqual([ram.u8(SAVEDSEL_25D990.recs[1]), ram.u8(SAVEDSEL_25D990.recs[1] + 1)],
      [1, 2], 'side 1 takes the same first downward matches');
  });

// ---------------------------------------------------------------- SECTION 4

test('SECTION 4: posting caller observes carry across both dirty side records',
  { skip: SKIP_IMAGE }, () => {
    const ram = new Ram();
    seedExternalBlock(ram, 0x47);
    const before = externalBlock(ram);
    savedSelections25D990(ram, ROM,
      0xcafe0100, 0xbeef00ff, 0xdead01ff, 0xface0004);

    assert.deepEqual([ram.u8(SCREEN11.savedA), ram.u8(SCREEN11.savedA + 1)], [0x00, 0xff],
      'side 0 searched unmatched words, carry clear let both low bytes overwrite');
    assert.deepEqual([ram.u8(SCREEN11.savedB), ram.u8(SCREEN11.savedB + 1)], [0xff, 0xff],
      'side 1 D6.W sentinel set carry and kept both prewritten sentinels');
    assertBytesExcept(ram, SCREEN11.savedA - 4, before, new Set([4, 5, 20, 21]),
      'posting mixed carry arms');
  });

test('SECTION 4b: posting caller maps both sides, ignores high words and distinguishes adjacent values',
  { skip: SKIP_IMAGE }, () => {
    const matched = new Ram();
    seedExternalBlock(matched, 0x69);
    const matchedBefore = externalBlock(matched);
    savedSelections25D990(matched, ROM,
      0xcafe0002, 0xbeef0000, 0xdead0006, 0xface0002);
    assert.deepEqual([matched.u8(SCREEN11.savedA), matched.u8(SCREEN11.savedA + 1)], [1, 2]);
    assert.deepEqual([matched.u8(SCREEN11.savedB), matched.u8(SCREEN11.savedB + 1)], [0, 0]);
    assertBytesExcept(matched, SCREEN11.savedA - 4, matchedBefore, new Set([4, 5, 20, 21]),
      'posting matched arms');

    const adjacent = new Ram();
    seedExternalBlock(adjacent, 0x83);
    savedSelections25D990(adjacent, ROM,
      0xaaaa00fe, 0xbbbb0100, 0xcccc0004, 0xdddd0006);
    assert.deepEqual([adjacent.u8(SCREEN11.savedA), adjacent.u8(SCREEN11.savedA + 1)], [0xfe, 1],
      '$00FE is searched and then truncated only by MOVE.B continuation');
    assert.deepEqual([adjacent.u8(SCREEN11.savedB), adjacent.u8(SCREEN11.savedB + 1)], [0x00, 2],
      '$0100 is searched and its low-byte boundary truncates to $00');
  });

// ---------------------------------------------------------------- SECTION 5

test('SECTION 5: load caller covers both sides, both carry arms and low-byte boundaries',
  { skip: SKIP_IMAGE }, () => {
    const cases = [
      { name: 'side 0 sentinel', side: 0, x: 0x00ff, y: 0xbeef, want: [0, 0], carry: true },
      { name: 'side 1 sentinel', side: 0x80, x: 0x00ff, y: 0xdead, want: [1, 2], carry: true },
      { name: 'side 0 matched', side: 0, x: 0x0002, y: 0x0004, want: [1, 1], carry: false },
      { name: 'side 1 unmatched', side: 0x80, x: 0x0100, y: 0x01ff, want: [0, 0xff], carry: false },
    ];
    for (let index = 0; index < cases.length; index++) {
      const c = cases[index];
      const ram = new Ram();
      fillBytes(ram, SLOT - 4, 0x58, 0x95 + index * 17);
      fillBytes(ram, 0x813080, 0x10, 0xb1 + index * 13);
      ram.setU8(SLOT + SCREEN11.side, c.side);
      const side1 = c.side !== 0;
      ram.setU16(side1 ? SAVED.x1 : SAVED.x0, c.x);
      ram.setU16(side1 ? SAVED.y1 : SAVED.y0, c.y);
      const slotBefore = snapshot(ram, SLOT - 4, 0x58);
      const mailboxBefore = snapshot(ram, 0x813080, 0x10);

      const got = loadSavedCursor25DA60(ram, ROM, SLOT);
      assert.deepEqual([got.x & 0xff, got.y & 0xff], c.want, `${c.name}: returned cursor witness`);
      assert.equal(got.defaulted, c.carry, `${c.name}: helper carry polarity`);
      assert.deepEqual([ram.u8(SLOT + SCREEN11.xCur), ram.u8(SLOT + SCREEN11.yCur)], c.want,
        `${c.name}: exact external cursor bytes`);
      assertBytesExcept(ram, SLOT - 4, slotBefore,
        new Set([4 + SCREEN11.xCur, 4 + SCREEN11.yCur]), `${c.name}: recycled slot ownership`);
      assert.deepEqual(snapshot(ram, 0x813080, 0x10), mailboxBefore,
        `${c.name}: saved mailbox and adjacent sentinels are read-only`);
    }
  });

test('SECTION 5b: phase-0 parent preserves both post-load continuations and dirty slot residue',
  { skip: SKIP_IMAGE }, () => {
    const cases = [
      { side: 0, x: 0x0002, y: 0x0004, want: [1, 1], name: 'side 0 searched' },
      { side: 1, x: 0x00ff, y: 0xabcd, want: [1, 2], name: 'side 1 sentinel' },
    ];
    for (const c of cases) {
      const ram = new Ram();
      readyPhase0(ram, c.side, c.x, c.y);
      const before = snapshot(ram, SLOT - 4, 0x58);
      assert.equal(tallyPhase0Arm25DC2C(ram, ROM, SLOT, phaseContext()), true,
        `${c.name}: START reaches the load caller`);
      assert.deepEqual([ram.u8(SLOT + SCREEN11.xCur), ram.u8(SLOT + SCREEN11.yCur)], c.want,
        `${c.name}: load then free-row continuation keeps exact cursors`);
      assert.equal(ram.u8(SLOT + SCREEN11.phase), 1, `${c.name}: continuation advances phase`);
      const box = c.side === 0 ? 0x813162 : 0x813166;
      assert.deepEqual([ram.u16(box), ram.u16(box + 2)], [1, 0],
        `${c.name}: continuation posts the side's state-0 announcement`);
      assertBytesExcept(ram, SLOT - 4, before,
        new Set([4 + SCREEN11.phase, 4 + SCREEN11.xCur, 4 + SCREEN11.yCur]),
        `${c.name}: phase parent slot ownership`);
    }
  });

// ---------------------------------------------------------------- SECTION 6

test('SECTION 6: source keeps one $25D9E6 body and W458 leaves one $25DA60 body', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.equal((source.match(/export function cursorsFromPosted25D9E6\s*\(/g) ?? []).length, 1);
  assert.equal((source.match(/export function mapSavedCursor25D9E6\s*\(/g) ?? []).length, 0,
    'the second body cannot regrow');
  assert.match(source, /export \{ cursorsFromPosted25D9E6 as mapSavedCursor25D9E6 \};/,
    'old import name remains a compatibility alias');
  assert.equal((source.match(/const [cr] = cursorsFromPosted25D9E6\(rom,/g) ?? []).length, 1,
    'W458 leaves one canonical load caller using the W457 body');
  assert.equal((source.match(/export function loadSavedCursor25DA60\s*\(/g) ?? []).length, 1);
  assert.equal((source.match(/export function restoreCursors25DA60\s*\(/g) ?? []).length, 0,
    'W458 removed the deferred duplicate body');
  assert.match(source, /export \{ loadSavedCursor25DA60 as restoreCursors25DA60 \};/,
    'W458 preserves the historical import as an alias');
  assert.equal(loadSavedCursor25DA60, restoreCursors25DA60,
    '$25DA60 imports now share one function object');
});

test('SECTION 6b: live registers derive 16 narrow, 71 widened, 28 pairs and 22 body-only', () => {
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
  const removed = 'tallyscreen.js cursorsFromPosted25D9E6 <> tallyscreen.js mapSavedCursor25D9E6';
  const mergedLoad = 'tallyscreen.js loadSavedCursor25DA60 <> tallyscreen.js restoreCursors25DA60';
  const mergedRequest = 'player.js armRequest25FF38 <> tallyscreen.js tallyRequest25FF38';
  const mergedRank = 'initbody.js rankByte242E24 <> rng.js drawByte242E24';

  assert.equal(narrow.length, 16, 'W497 registers the authentic-selection adapter at $2491C0');
  assert.equal(heads.length, 71,
    'W475 left 68; W497 adds $2491C0 and $253D82/$253D90; later Hibachi source consolidation removes the temporary W554 $2A54E2 duplicate');
  assert.equal(pairs.length, 28,
    'W461 left 27; W497 adds the authentic-selection/player-object body pair');
  assert.equal(bodyOnly.length, 22,
    'body-only remains executable headIndex() derivation; W461 removes a head-visible pair');
  assert.equal(heads.includes(BODY_START), false, '$25D9E6 stays off the widened register');
  assert.equal(narrow.some(([at]) => at === BODY_START), false, '$25D9E6 stays off the narrow register');
  assert.equal(pairs.some(([pair]) => pair === removed), false, 'W457 merged body edge stays absent');
  assert.equal(heads.includes(0x25da60), false, '$25DA60 stays off the widened register after W458');
  assert.equal(pairs.some(([pair]) => pair === mergedLoad), false, 'W458 merged body edge stays absent');
  assert.equal(heads.includes(0x25ff38), false, '$25FF38 stays off the widened register after W459');
  assert.equal(pairs.some(([pair]) => pair === mergedRequest), false, 'W459 request edge stays absent');
  assert.equal(heads.includes(0x242e24), false, '$242E24 stays off the widened register after W461');
  assert.equal(pairs.some(([pair]) => pair === mergedRank), false, 'W461 rank-byte edge stays absent');
  assert.deepEqual(pairs.filter(([pair]) => /25D9E6|25DA60|25FF38|242E24/i.test(pair)), [],
    'all three tally-region duplicate pairs and the W461 rank-byte pair remain absent');
});
