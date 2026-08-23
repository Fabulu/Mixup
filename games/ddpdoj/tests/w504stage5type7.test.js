// W504-W517: drive the loop-2 type-$13 handoff through variant 0 and all nine sequence-list A scripts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog, Unreached, unreached } from '../src/unported.js';
import { WorkBudget } from '../src/budget.js';
import { ObjOrder, runObjectDriver, OBJ } from '../src/objdriver.js';
import { stageCreate, ALLOC } from '../src/objalloc.js';
import { SE, ENDING13, makeStage5Ending } from '../src/stageend.js';
import { objSlot7, POOL7, SCRIPT7, SLOT7 } from '../src/objslot7pool.js';
import { ANIM_OBJECT, runAnimObjects24683E } from '../src/animobjects.js';
import { BUCKETS } from '../src/spritequeue.js';
import { BgVram, TxVram, VideoRegs, SlotTable907000 } from '../src/background.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(TJ.rom) : null;
const MOVE = HAVE ? new MoveTables(TJ, ROM) : null;
const SKIP = HAVE ? false : 'rip/port/player.tables.json missing; run export-tables.py';

const FIRST_SCRIPT = 0x290f66;
const SECOND_SCRIPT = 0x290f8e;
const THIRD_SCRIPT = 0x290fe2;
const FOURTH_SCRIPT = 0x2910f6;
const FIFTH_SCRIPT = 0x291172;
const SEQUENCE_A_FIRST = 0x2914f0;
const SEQUENCE_A_SECOND = 0x29154a;
const SEQUENCE_A_THIRD = 0x2915a0;
const SEQUENCE_A_FOURTH = 0x291604;
const SEQUENCE_A_FIFTH = 0x29166c;
const SEQUENCE_A_SIXTH = 0x291692;
const SEQUENCE_A_SEVENTH = 0x2916da;
const SEQUENCE_A_EIGHTH = 0x291700;
const SEQUENCE_A_NINTH = 0x29177c;
const NEXT_BOUNDARY = 0x2917be;
const FIRST_INDICES = Object.freeze([0xe0, 0x4a, 0x65, 0xcc, 0x73, 0x5b, 0x59, 0x05]);
const FIRST_ART = Object.freeze([
  0x1ec778, 0x1eb260, 0x1eb62c, 0x1ec4a8,
  0x1eb824, 0x1eb4c4, 0x1eb47c, 0x1ea8ac,
]);
const SECOND_INDICES = Object.freeze([
  0xc1, 0xcc, 0xff, 0xaf, 0x64,
  0x9b, 0xf0, 0xed, 0x61, 0xa5, 0x10f, 0x64, 0xe1, 0x62,
  0x10f, 0xda, 0x4f, 0x6e, 0x4b, 0x5f, 0x54, 0x59, 0xc8, 0x05, 0x05, 0x05,
]);
const SECOND_ART = Object.freeze([
  0x1ec31c, 0x1ec4a8, 0x1ecbd4, 0x1ec094, 0x1eb608,
  0x1ebdc4, 0x1ec9b8, 0x1ec94c, 0x1eb59c, 0x1ebf2c, 0x1ece14, 0x1eb608,
  0x1ec79c, 0x1eb5c0, 0x1ece14, 0x1ec6a0, 0x1eb314, 0x1eb770, 0x1eb284,
  0x1eb554, 0x1eb3c8, 0x1eb47c, 0x1ec418, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const SECOND_POSITIONS = Object.freeze([
  ...Array.from({ length: 5 }, (_, i) => 0x48000200 + i * 0x400),
  ...Array.from({ length: 9 }, (_, i) => 0x40000200 + i * 0x400),
  ...Array.from({ length: 12 }, (_, i) => 0x38000200 + i * 0x400),
]);
const THIRD_INDICES = Object.freeze([
  0x7f, 0x93, 0x07, 0x84, 0x77, 0x76, 0x65, 0x106, 0x102, 0x62, 0x6c,
  0xec, 0x64, 0x8e, 0x7e, 0x07, 0x7d, 0x98, 0x8a, 0x92, 0x07, 0x81, 0x62,
  0x82, 0x78, 0x8b, 0x54, 0x59, 0x05, 0x05, 0x05,
]);
const THIRD_ART = Object.freeze([
  0x1eb9d4, 0x1ebca4, 0x1ea8f4, 0x1eba88, 0x1eb8b4, 0x1eb890, 0x1eb62c,
  0x1eccd0, 0x1ecc40, 0x1eb5c0, 0x1eb728, 0x1ec928, 0x1eb608, 0x1ebbf0,
  0x1eb9b0, 0x1ea8f4, 0x1eb98c, 0x1ebd58, 0x1ebb60, 0x1ebc80, 0x1ea8f4,
  0x1eba1c, 0x1eb5c0, 0x1eba40, 0x1eb8d8, 0x1ebb84, 0x1eb3c8, 0x1eb47c,
  0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const THIRD_POSITIONS = Object.freeze([
  ...Array.from({ length: 11 }, (_, i) => 0x48000200 + i * 0x400),
  ...Array.from({ length: 12 }, (_, i) => 0x40000200 + i * 0x400),
  ...Array.from({ length: 8 }, (_, i) => 0x38000200 + i * 0x400),
]);
const FOURTH_INDICES = Object.freeze([
  0x58, 0x54, 0x5d, 0x7d, 0x98, 0x8a, 0x92, 0x07, 0x81, 0x62, 0xfe, 0xa6, 0x74,
  0x4d, 0x51, 0x71, 0xc7, 0x5e, 0xa0, 0xc3, 0xf6, 0x10f, 0x74, 0x10b, 0x5f, 0x54,
  0xa7, 0x0a, 0x65, 0xd3, 0x10c, 0x74, 0x5c, 0x4d, 0x6a, 0xc7, 0x4e,
  0xce, 0x10a, 0x59, 0x05, 0x05, 0x05,
]);
const FOURTH_ART = Object.freeze([
  0x1eb458, 0x1eb3c8, 0x1eb50c, 0x1eb98c, 0x1ebd58, 0x1ebb60, 0x1ebc80,
  0x1ea8f4, 0x1eba1c, 0x1eb5c0, 0x1ecbb0, 0x1ebf50, 0x1eb848,
  0x1eb2cc, 0x1eb35c, 0x1eb7dc, 0x1ec3f4, 0x1eb530, 0x1ebe78, 0x1ec364,
  0x1eca90, 0x1ece14, 0x1eb848, 0x1ecd84, 0x1eb554, 0x1eb3c8,
  0x1ebf74, 0x1ea960, 0x1eb62c, 0x1ec5a4, 0x1ecda8, 0x1eb848, 0x1eb4e8,
  0x1eb2cc, 0x1eb6e0, 0x1ec3f4, 0x1eb2f0,
  0x1ec4f0, 0x1ecd60, 0x1eb47c, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const FOURTH_POSITIONS = Object.freeze([
  ...Array.from({ length: 13 }, (_, i) => 0x48000200 + i * 0x400),
  ...Array.from({ length: 13 }, (_, i) => 0x40000200 + i * 0x400),
  ...Array.from({ length: 11 }, (_, i) => 0x38000200 + i * 0x400),
  ...Array.from({ length: 6 }, (_, i) => 0x30000200 + i * 0x400),
]);
const FIFTH_INDICES = Object.freeze([
  0x54, 0x4d, 0x54, 0x58, 0x64, 0xe5, 0xd2, 0x65,
  0xe6, 0x4f, 0x4d, 0x5b, 0x59, 0x05, 0x05, 0x05,
]);
const FIFTH_ART = Object.freeze([
  0x1eb3c8, 0x1eb2cc, 0x1eb3c8, 0x1eb458, 0x1eb608, 0x1ec82c, 0x1ec580, 0x1eb62c,
  0x1ec850, 0x1eb314, 0x1eb2cc, 0x1eb4c4, 0x1eb47c, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const FIFTH_POSITIONS = Object.freeze([
  ...Array.from({ length: 8 }, (_, i) => 0x48000200 + i * 0x400),
  ...Array.from({ length: 8 }, (_, i) => 0x40000200 + i * 0x400),
]);
const SEQUENCE_A_INDICES = Object.freeze([
  0x8e, 0x7e, 0x07, 0x7d, 0x98, 0x8a, 0x92, 0x07, 0x81, 0x64,
  0x103, 0x9f, 0x8c, 0x97, 0x7c, 0x94, 0x8f, 0x4e,
  0x79, 0x77, 0x95, 0x80, 0x5f, 0xa3, 0x54, 0x5d,
]);
const SEQUENCE_A_ART = Object.freeze([
  0x1ebbf0, 0x1eb9b0, 0x1ea8f4, 0x1eb98c, 0x1ebd58, 0x1ebb60, 0x1ebc80,
  0x1ea8f4, 0x1eba1c, 0x1eb608,
  0x1ecc64, 0x1ebe54, 0x1ebba8, 0x1ebd34, 0x1eb968, 0x1ebcc8, 0x1ebc14, 0x1eb2f0,
  0x1eb8fc, 0x1eb8b4, 0x1ebcec, 0x1eb9f8, 0x1eb554, 0x1ebee4, 0x1eb3c8, 0x1eb50c,
]);
const SEQUENCE_A_POSITIONS = Object.freeze([
  ...Array.from({ length: 10 }, (_, i) => 0x30000200 + i * 0x400),
  ...Array.from({ length: 8 }, (_, i) => 0x28000200 + i * 0x400),
  ...Array.from({ length: 8 }, (_, i) => 0x20000200 + i * 0x400),
]);
const SEQUENCE_A_SECOND_INDICES = Object.freeze([
  0x7f, 0x93, 0x07, 0x84, 0x77, 0x76, 0x64, 0xe4, 0x62, 0xd8, 0xf4, 0x54,
  0xb1, 0xa2, 0x74, 0xd4, 0x54, 0xc5, 0x6b, 0x59,
  0x64, 0x5a, 0x5b, 0x59, 0x05, 0x05, 0x05,
]);
const SEQUENCE_A_SECOND_ART = Object.freeze([
  0x1eb9d4, 0x1ebca4, 0x1ea8f4, 0x1eba88, 0x1eb8b4, 0x1eb890, 0x1eb608,
  0x1ec808, 0x1eb5c0, 0x1ec658, 0x1eca48, 0x1eb3c8,
  0x1ec0dc, 0x1ebec0, 0x1eb848, 0x1ec5c8, 0x1eb3c8, 0x1ec3ac, 0x1eb704, 0x1eb47c,
  0x1eb608, 0x1eb4a0, 0x1eb4c4, 0x1eb47c, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const SEQUENCE_A_SECOND_POSITIONS = Object.freeze([
  ...Array.from({ length: 12 }, (_, i) => 0x30000200 + i * 0x400),
  ...Array.from({ length: 8 }, (_, i) => 0x28000200 + i * 0x400),
  ...Array.from({ length: 7 }, (_, i) => 0x20000200 + i * 0x400),
]);
const SEQUENCE_A_THIRD_INDICES = Object.freeze([
  0x97, 0x8d, 0x83, 0x86, 0x5f, 0x54, 0x5d, 0x64, 0xb1, 0xa2, 0x05, 0x05, 0x05,
  0xe0, 0xf2, 0xff, 0xaf, 0x5f, 0x54, 0x5d, 0x64, 0xb1, 0xa2, 0x05, 0x05, 0x05,
  0xf5, 0x105, 0x64, 0xb1, 0xa2, 0x05, 0x05, 0x05,
]);
const SEQUENCE_A_THIRD_ART = Object.freeze([
  0x1ebd34, 0x1ebbcc, 0x1eba64, 0x1ebad0, 0x1eb554, 0x1eb3c8, 0x1eb50c,
  0x1eb608, 0x1ec0dc, 0x1ebec0, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
  0x1ec778, 0x1eca00, 0x1ecbd4, 0x1ec094, 0x1eb554, 0x1eb3c8, 0x1eb50c,
  0x1eb608, 0x1ec0dc, 0x1ebec0, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
  0x1eca6c, 0x1eccac, 0x1eb608, 0x1ec0dc, 0x1ebec0, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const SEQUENCE_A_THIRD_POSITIONS = Object.freeze([
  ...Array.from({ length: 13 }, (_, i) => 0x30000200 + i * 0x400),
  ...Array.from({ length: 13 }, (_, i) => 0x28000200 + i * 0x400),
  ...Array.from({ length: 8 }, (_, i) => 0x20000200 + i * 0x400),
]);
const SEQUENCE_A_FOURTH_INDICES = Object.freeze([
  0x79, 0x77, 0x95, 0x80, 0x65, 0x106, 0xd7, 0x62, 0x6c,
  0x7f, 0x93, 0x07, 0x84, 0x77, 0x76, 0x64, 0x85, 0x07, 0x81, 0x74,
  0xc9, 0x0a, 0x5f, 0xd4, 0x54, 0xb6, 0x5b, 0x5d, 0x4a, 0x50, 0x05, 0x05, 0x05,
]);
const SEQUENCE_A_FOURTH_ART = Object.freeze([
  0x1eb8fc, 0x1eb8b4, 0x1ebcec, 0x1eb9f8, 0x1eb62c, 0x1eccd0, 0x1ec634,
  0x1eb5c0, 0x1eb728,
  0x1eb9d4, 0x1ebca4, 0x1ea8f4, 0x1eba88, 0x1eb8b4, 0x1eb890, 0x1eb608,
  0x1ebaac, 0x1ea8f4, 0x1eba1c, 0x1eb848,
  0x1ec43c, 0x1ea960, 0x1eb554, 0x1ec5c8, 0x1eb3c8, 0x1ec190, 0x1eb4c4,
  0x1eb50c, 0x1eb260, 0x1eb338, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const SEQUENCE_A_FOURTH_POSITIONS = Object.freeze([
  ...Array.from({ length: 9 }, (_, i) => 0x30000200 + i * 0x400),
  ...Array.from({ length: 11 }, (_, i) => 0x28000200 + i * 0x400),
  ...Array.from({ length: 13 }, (_, i) => 0x20000200 + i * 0x400),
]);
const SEQUENCE_A_FIFTH_INDICES = Object.freeze([
  0x58, 0x54, 0x5d, 0xc1, 0xc0, 0x62, 0x05, 0x05, 0x05,
]);
const SEQUENCE_A_FIFTH_ART = Object.freeze([
  0x1eb458, 0x1eb3c8, 0x1eb50c, 0x1ec31c, 0x1ec2f8, 0x1eb5c0,
  0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const SEQUENCE_A_FIFTH_POSITIONS = Object.freeze(
  Array.from({ length: 9 }, (_, i) => 0x30000200 + i * 0x400));
const SEQUENCE_A_SIXTH_INDICES = Object.freeze([
  0xd9, 0xad, 0x5f, 0x54, 0x5d, 0x64, 0xb1, 0xa2, 0x64, 0x69, 0x4e,
  0xc4, 0x53, 0x72, 0x59, 0x67, 0x75, 0x64, 0x9c, 0xcf, 0x05, 0x05, 0x05,
]);
const SEQUENCE_A_SIXTH_ART = Object.freeze([
  0x1ec67c, 0x1ec04c, 0x1eb554, 0x1eb3c8, 0x1eb50c, 0x1eb608,
  0x1ec0dc, 0x1ebec0, 0x1eb608, 0x1eb6bc, 0x1eb2f0,
  0x1ec388, 0x1eb3a4, 0x1eb800, 0x1eb47c, 0x1eb674, 0x1eb86c,
  0x1eb608, 0x1ebde8, 0x1ec514, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const SEQUENCE_A_SIXTH_POSITIONS = Object.freeze([
  ...Array.from({ length: 11 }, (_, i) => 0x30000200 + i * 0x400),
  ...Array.from({ length: 12 }, (_, i) => 0x28000200 + i * 0x400),
]);
const SEQUENCE_A_SEVENTH_INDICES = Object.freeze([
  0xf8, 0xd1, 0x65, 0xd5, 0xae, 0x74, 0xbb, 0x57, 0x59,
]);
const SEQUENCE_A_SEVENTH_ART = Object.freeze([
  0x1ecad8, 0x1ec55c, 0x1eb62c, 0x1ec5ec, 0x1ec070,
  0x1eb848, 0x1ec244, 0x1eb434, 0x1eb47c,
]);
const SEQUENCE_A_SEVENTH_POSITIONS = Object.freeze(
  Array.from({ length: 9 }, (_, i) => 0x30000200 + i * 0x400));
const SEQUENCE_A_EIGHTH_INDICES = Object.freeze([
  0xff, 0xaf, 0x5f, 0x54, 0x5d, 0xde, 0x4f, 0x71, 0xc7, 0x54, 0x4d,
  0xce, 0x10a, 0x61, 0x4d, 0x5b, 0x59, 0xf8, 0xd1, 0x4e,
  0xc1, 0xc0, 0x62, 0xbb, 0x57, 0x59,
  0xd9, 0xad, 0x5f, 0x54, 0x5d, 0x64, 0xd5, 0xae, 0x65, 0x05, 0x05, 0x05,
]);
const SEQUENCE_A_EIGHTH_ART = Object.freeze([
  0x1ecbd4, 0x1ec094, 0x1eb554, 0x1eb3c8, 0x1eb50c, 0x1ec730, 0x1eb314,
  0x1eb7dc, 0x1ec3f4, 0x1eb3c8, 0x1eb2cc,
  0x1ec4f0, 0x1ecd60, 0x1eb59c, 0x1eb2cc, 0x1eb4c4, 0x1eb47c, 0x1ecad8,
  0x1ec55c, 0x1eb2f0,
  0x1ec31c, 0x1ec2f8, 0x1eb5c0, 0x1ec244, 0x1eb434, 0x1eb47c,
  0x1ec67c, 0x1ec04c, 0x1eb554, 0x1eb3c8, 0x1eb50c, 0x1eb608, 0x1ec5ec,
  0x1ec070, 0x1eb62c, 0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const SEQUENCE_A_EIGHTH_POSITIONS = Object.freeze([
  ...Array.from({ length: 11 }, (_, i) => 0x30000200 + i * 0x400),
  ...Array.from({ length: 9 }, (_, i) => 0x28000200 + i * 0x400),
  ...Array.from({ length: 6 }, (_, i) => 0x20000200 + i * 0x400),
  ...Array.from({ length: 12 }, (_, i) => 0x18000200 + i * 0x400),
]);
const SEQUENCE_A_NINTH_INDICES = Object.freeze([
  0x9e, 0xa1, 0x62, 0x50, 0x6c, 0x71, 0xc7, 0x65,
  0x61, 0x4d, 0x5b, 0x59, 0x5f, 0x4a, 0x4b, 0x05, 0x05, 0x05,
]);
const SEQUENCE_A_NINTH_ART = Object.freeze([
  0x1ebe30, 0x1ebe9c, 0x1eb5c0, 0x1eb338, 0x1eb728, 0x1eb7dc, 0x1ec3f4, 0x1eb62c,
  0x1eb59c, 0x1eb2cc, 0x1eb4c4, 0x1eb47c, 0x1eb554, 0x1eb260, 0x1eb284,
  0x1ea8ac, 0x1ea8ac, 0x1ea8ac,
]);
const SEQUENCE_A_NINTH_POSITIONS = Object.freeze([
  ...Array.from({ length: 8 }, (_, i) => 0x40000800 + i * 0x400),
  ...Array.from({ length: 10 }, (_, i) => 0x38000800 + i * 0x400),
]);

function clearSpriteCounters(ram) {
  for (const bucket of BUCKETS) ram.setU16(bucket.counter, 0);
}

function livePoolRecords(ram) {
  const out = [];
  for (let i = 0; i < POOL7.entries; i++) {
    const at = POOL7.base + i * POOL7.stride;
    const art = ram.u32(at) >>> 0;
    if (art !== 0) out.push({ art, position: ram.u32(at + 4) >>> 0 });
  }
  return out;
}

function chainNodes(ram, root) {
  const out = [];
  let at = ram.u32(root + 0x2c);
  while (at !== 0 && out.length < ANIM_OBJECT.nodeSlots) {
    out.push(at);
    at = ram.u32(at + 0x2c);
  }
  return out;
}

test('W504-W517: natural type $13 handoff runs variant 0 and all nine sequence-list-A scripts',
  { skip: SKIP }, () => {
    assert.equal(ROM.u32(0x290f12), 0x290f1e,
      '$290F12 variant 0 points at its five-step list');
    assert.equal(ROM.u32(0x290f1e), FIRST_SCRIPT,
      'the first list entry is the common $290F66 script');
    assert.deepEqual([0x290f22, 0x290f3a, 0x290f52].map((at) => ROM.u32(at)),
      [SECOND_SCRIPT, SECOND_SCRIPT, SECOND_SCRIPT],
      'all three variant lists use $290F8E as entry 1');
    assert.equal(ROM.u32(0x290f26), THIRD_SCRIPT,
      'variant 0 entry 2 selects $290FE2 after the common script');
    assert.equal(ROM.u32(0x290f2a), FOURTH_SCRIPT,
      'variant 0 entry 3 selects the common $2910F6 script');
    assert.equal(ROM.u32(0x290f2e), FIFTH_SCRIPT,
      'variant 0 entry 4 selects its final listed $291172 script');
    assert.equal(ROM.u32(0x290f32), 0xffffffff,
      'variant 0 terminates immediately after its fifth script');
    assert.equal(ROM.u32(SLOT7.seqLists[0]), SEQUENCE_A_FIRST,
      'inner state 1 begins sequence list A at $2914F0');
    assert.equal(ROM.u32(SLOT7.seqLists[0] + 4), SEQUENCE_A_SECOND,
      'sequence list A entry 1 is $29154A');
    assert.equal(ROM.u32(SLOT7.seqLists[0] + 8), SEQUENCE_A_THIRD,
      'sequence list A entry 2 is $2915A0');
    assert.equal(ROM.u32(SLOT7.seqLists[0] + 12), SEQUENCE_A_FOURTH,
      'sequence list A entry 3 is the concrete $291604 script');
    assert.equal(ROM.u32(SLOT7.seqLists[0] + 16), SEQUENCE_A_FIFTH,
      'sequence list A entry 4 is the concrete $29166C script');
    assert.equal(ROM.u32(SLOT7.seqLists[0] + 20), SEQUENCE_A_SIXTH,
      'sequence list A entry 5 is the concrete $291692 script');
    assert.equal(ROM.u32(SLOT7.seqLists[0] + 24), SEQUENCE_A_SEVENTH,
      'sequence list A entry 6 is the concrete $2916DA script');
    assert.equal(ROM.u32(SLOT7.seqLists[0] + 28), SEQUENCE_A_EIGHTH,
      'sequence list A entry 7 is the concrete $291700 script');
    assert.equal(ROM.u32(SLOT7.seqLists[0] + 32), SEQUENCE_A_NINTH,
      'sequence list A entry 8 is the concrete $29177C script');
    assert.equal(ROM.u32(SLOT7.seqLists[0] + 36), 0xffffffff,
      'sequence list A terminates immediately after its ninth script');
    assert.deepEqual(Array.from({ length: 20 }, (_, i) => ROM.u16(FIRST_SCRIPT + i * 2)), [
      0x8000, 0x3000, 0x8001, 0x3c00, 0x0800,
      0x00e0, 0x004a, 0x0065, 0x00cc, 0x0073,
      0x005b, 0x0059, 0x0005, 0x0005, 0x0005,
      0x8002, 0x0060, 0x8003, 0x0000, 0xffff,
    ], '$290F66..$290F8D is the exact first script');
    assert.deepEqual(FIRST_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      FIRST_ART, 'the first script resolves its eight concrete data words through $2902C2');
    assert.deepEqual(Array.from({ length: 42 }, (_, i) => ROM.u16(SECOND_SCRIPT + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x4800, 0x0200, 0x00c1, 0x00cc, 0x00ff, 0x00af, 0x0064,
      0x8001, 0x4000, 0x0200, 0x009b, 0x00f0, 0x00ed, 0x0061, 0x00a5,
      0x010f, 0x0064, 0x00e1, 0x0062,
      0x8001, 0x3800, 0x0200, 0x010f, 0x00da, 0x004f, 0x006e, 0x004b,
      0x005f, 0x0054, 0x0059, 0x00c8, 0x0005, 0x0005, 0x0005,
      0x8002, 0x00c0, 0x8003, 0x0000, 0xffff,
    ], '$290F8E..$290FE1 is the exact second script');
    assert.deepEqual(SECOND_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      SECOND_ART, 'the second script resolves all 26 data words through $2902C2');
    assert.deepEqual(Array.from({ length: 47 }, (_, i) => ROM.u16(THIRD_SCRIPT + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x4800, 0x0200, 0x007f, 0x0093, 0x0007, 0x0084, 0x0077,
      0x0076, 0x0065, 0x0106, 0x0102, 0x0062, 0x006c,
      0x8001, 0x4000, 0x0200, 0x00ec, 0x0064, 0x008e, 0x007e, 0x0007,
      0x007d, 0x0098, 0x008a, 0x0092, 0x0007, 0x0081, 0x0062,
      0x8001, 0x3800, 0x0200, 0x0082, 0x0078, 0x008b, 0x0054, 0x0059,
      0x0005, 0x0005, 0x0005, 0x8002, 0x00c0, 0x8003, 0x0000, 0xffff,
    ], '$290FE2..$29103F is the exact variant-0 third script');
    assert.deepEqual(THIRD_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      THIRD_ART, 'the third script resolves all 31 data words through $2902C2');
    assert.deepEqual(Array.from({ length: 62 }, (_, i) => ROM.u16(FOURTH_SCRIPT + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x4800, 0x0200, 0x0058, 0x0054, 0x005d, 0x007d, 0x0098,
      0x008a, 0x0092, 0x0007, 0x0081, 0x0062, 0x00fe, 0x00a6, 0x0074,
      0x8001, 0x4000, 0x0200, 0x004d, 0x0051, 0x0071, 0x00c7, 0x005e,
      0x00a0, 0x00c3, 0x00f6, 0x010f, 0x0074, 0x010b, 0x005f, 0x0054,
      0x8001, 0x3800, 0x0200, 0x00a7, 0x000a, 0x0065, 0x00d3, 0x010c,
      0x0074, 0x005c, 0x004d, 0x006a, 0x00c7, 0x004e,
      0x8001, 0x3000, 0x0200, 0x00ce, 0x010a, 0x0059, 0x0005, 0x0005,
      0x0005, 0x8002, 0x0100, 0x8003, 0x0000, 0xffff,
    ], '$2910F6..$291171 is the exact common fourth script');
    assert.deepEqual(FOURTH_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      FOURTH_ART, 'the fourth script resolves all 43 data words through $2902C2');
    assert.equal(ROM.u32(SCRIPT7.resTable), 0x290e58,
      'the fourth script reuses operand 0 and W372\'s existing $290E58 resource window');
    assert.deepEqual(Array.from({ length: 31 }, (_, i) => ROM.u16(FIFTH_SCRIPT + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x4800, 0x0200, 0x0054, 0x004d, 0x0054, 0x0058, 0x0064,
      0x00e5, 0x00d2, 0x0065,
      0x8001, 0x4000, 0x0200, 0x00e6, 0x004f, 0x004d, 0x005b, 0x0059,
      0x8000, 0x0808, 0x0005, 0x0005, 0x0005,
      0x8002, 0x0080, 0x8003, 0x0004, 0xffff,
    ], '$291172..$2911AF is the exact variant-0 fifth script');
    assert.deepEqual(FIFTH_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      FIFTH_ART, 'the fifth script resolves all 16 data words through $2902C2');
    assert.equal(ROM.u32(SCRIPT7.resTable + 4 * 4), 0x290e80,
      'resource operand 4 selects W372\'s existing $290E80 record');
    assert.equal(ROM.u16(0x290e80), 1,
      'the fifth script resource is one node, like operand 0');
    assert.deepEqual(Array.from({ length: 45 }, (_, i) => ROM.u16(SEQUENCE_A_FIRST + i * 2)), [
      0x8005, 0x0001, 0x0003,
      0x8000, 0x2000,
      0x8001, 0x3000, 0x0200,
      0x008e, 0x007e, 0x0007, 0x007d, 0x0098, 0x008a, 0x0092, 0x0007, 0x0081, 0x0064,
      0x8001, 0x2800, 0x0200,
      0x0103, 0x009f, 0x008c, 0x0097, 0x007c, 0x0094, 0x008f, 0x004e,
      0x8001, 0x2000, 0x0200,
      0x0079, 0x0077, 0x0095, 0x0080, 0x005f, 0x00a3, 0x0054, 0x005d,
      0x8002, 0x00c0, 0x8003, 0x0000, 0xffff,
    ], '$2914F0..$291549 is sequence list A\'s exact first script');
    assert.deepEqual(SEQUENCE_A_INDICES.map((i) => ROM.u32(SCRIPT7.spawnTable + i * 4)),
      SEQUENCE_A_ART, 'sequence list A entry 0 resolves all 26 ordered picture words');
    assert.equal(ROM.u32(0x290dae + 3 * 4), 0x290e1c,
      '$8005 operand 3 selects W372\'s existing $290E1C resource descriptor');
    assert.deepEqual(Array.from({ length: 15 }, (_, i) => ROM.u16(0x290e1c + i * 2)), [
      0x0002,
      0x0000, 0x0000, 0x0040, 0x0022, 0x5ab8, 0x001f, 0x0003,
      0x0000, 0x0000, 0x0080, 0x0022, 0x5b38, 0x001f, 0x0003,
    ], '$290E1C is the exact two-node mode-0 palette resource selected by $8005');
    assert.deepEqual(Array.from({ length: 43 }, (_, i) => ROM.u16(SEQUENCE_A_SECOND + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x3000, 0x0200,
      0x007f, 0x0093, 0x0007, 0x0084, 0x0077, 0x0076, 0x0064, 0x00e4,
      0x0062, 0x00d8, 0x00f4, 0x0054,
      0x8001, 0x2800, 0x0200,
      0x00b1, 0x00a2, 0x0074, 0x00d4, 0x0054, 0x00c5, 0x006b, 0x0059,
      0x8001, 0x2000, 0x0200,
      0x0064, 0x005a, 0x005b, 0x0059, 0x0005, 0x0005, 0x0005,
      0x8002, 0x00c0, 0x8003, 0x0000, 0xffff,
    ], '$29154A..$29159F is sequence list A\'s exact second script');
    assert.deepEqual(SEQUENCE_A_SECOND_INDICES.map((i) =>
      ROM.u32(SCRIPT7.spawnTable + i * 4)), SEQUENCE_A_SECOND_ART,
      'sequence list A entry 1 resolves all 27 ordered picture words');
    assert.deepEqual(Array.from({ length: 50 }, (_, i) => ROM.u16(SEQUENCE_A_THIRD + i * 2)), [
      0x8000, 0x0404,
      0x8001, 0x3000, 0x0200,
      0x0097, 0x008d, 0x0083, 0x0086, 0x005f, 0x0054, 0x005d, 0x0064,
      0x00b1, 0x00a2, 0x0005, 0x0005, 0x0005,
      0x8001, 0x2800, 0x0200,
      0x00e0, 0x00f2, 0x00ff, 0x00af, 0x005f, 0x0054, 0x005d, 0x0064,
      0x00b1, 0x00a2, 0x0005, 0x0005, 0x0005,
      0x8001, 0x2000, 0x0200,
      0x00f5, 0x0105, 0x0064, 0x00b1, 0x00a2, 0x0005, 0x0005, 0x0005,
      0x8002, 0x0060, 0x8003, 0x0000, 0xffff,
    ], '$2915A0..$291603 is sequence list A\'s exact third script');
    assert.deepEqual(SEQUENCE_A_THIRD_INDICES.map((i) =>
      ROM.u32(SCRIPT7.spawnTable + i * 4)), SEQUENCE_A_THIRD_ART,
      'sequence list A entry 2 resolves all 34 ordered picture words');
    assert.deepEqual(Array.from({ length: 52 }, (_, i) => ROM.u16(SEQUENCE_A_FOURTH + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x3000, 0x0200,
      0x0079, 0x0077, 0x0095, 0x0080, 0x0065, 0x0106, 0x00d7, 0x0062, 0x006c,
      0x8001, 0x2800, 0x0200,
      0x007f, 0x0093, 0x0007, 0x0084, 0x0077, 0x0076, 0x0064, 0x0085,
      0x0007, 0x0081, 0x0074,
      0x8001, 0x2000, 0x0200,
      0x00c9, 0x000a, 0x005f, 0x00d4, 0x0054, 0x00b6, 0x005b, 0x005d,
      0x004a, 0x0050, 0x0005, 0x0005, 0x0005,
      0x8002, 0x00c0, 0x8005, 0x0002, 0x0004, 0x8003, 0x0000, 0xffff,
    ], '$291604..$29166B is sequence list A\'s exact fourth script');
    assert.deepEqual(SEQUENCE_A_FOURTH_INDICES.map((i) =>
      ROM.u32(SCRIPT7.spawnTable + i * 4)), SEQUENCE_A_FOURTH_ART,
      'sequence list A entry 3 resolves all 33 ordered picture words');
    assert.equal(ROM.u32(0x290ce8 + 4 * 4), 0x290d54,
      '$8005 operand 4 selects W372\'s existing first-phase descriptor at $290D54');
    assert.deepEqual(Array.from({ length: 9 }, (_, i) => ROM.u16(0x290d54 + i * 2)), [
      0x0002,
      0x0000, 0x0040, 0x001f, 0x0004,
      0x0000, 0x0080, 0x001f, 0x0004,
    ], '$290D54 is the exact two-node timing-index-4 fade-to-black resource');
    assert.equal(ROM.u32(0x290dae + 4 * 4), 0x290e3a,
      '$8005 operand 4 selects W372\'s existing second-phase descriptor at $290E3A');
    assert.deepEqual(Array.from({ length: 15 }, (_, i) => ROM.u16(0x290e3a + i * 2)), [
      0x0002,
      0x0000, 0x0000, 0x0040, 0x0022, 0x5ab8, 0x001f, 0x0004,
      0x0000, 0x0000, 0x0080, 0x0022, 0x5b38, 0x001f, 0x0004,
    ], '$290E3A reuses W509\'s two palette targets with timing index 4');
    assert.deepEqual(Array.from({ length: 19 }, (_, i) => ROM.u16(SEQUENCE_A_FIFTH + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x3000, 0x0200,
      0x0058, 0x0054, 0x005d, 0x00c1, 0x00c0, 0x0062, 0x0005, 0x0005, 0x0005,
      0x8002, 0x0060, 0x8003, 0x0000, 0xffff,
    ], '$29166C..$291691 is sequence list A\'s exact fifth script');
    assert.deepEqual(SEQUENCE_A_FIFTH_INDICES.map((i) =>
      ROM.u32(SCRIPT7.spawnTable + i * 4)), SEQUENCE_A_FIFTH_ART,
      'sequence list A entry 4 resolves all nine ordered picture words');
    assert.deepEqual(Array.from({ length: 36 }, (_, i) => ROM.u16(SEQUENCE_A_SIXTH + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x3000, 0x0200,
      0x00d9, 0x00ad, 0x005f, 0x0054, 0x005d, 0x0064, 0x00b1, 0x00a2,
      0x0064, 0x0069, 0x004e,
      0x8001, 0x2800, 0x0200,
      0x00c4, 0x0053, 0x0072, 0x0059, 0x0067, 0x0075, 0x0064, 0x009c,
      0x00cf, 0x0005, 0x0005, 0x0005,
      0x8002, 0x0060, 0x8003, 0x0000, 0xffff,
    ], '$291692..$2916D9 is sequence list A\'s exact sixth script');
    assert.deepEqual(SEQUENCE_A_SIXTH_INDICES.map((i) =>
      ROM.u32(SCRIPT7.spawnTable + i * 4)), SEQUENCE_A_SIXTH_ART,
      'sequence list A entry 5 resolves all 23 ordered picture words');
    assert.deepEqual(Array.from({ length: 19 }, (_, i) => ROM.u16(SEQUENCE_A_SEVENTH + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x3000, 0x0200,
      0x00f8, 0x00d1, 0x0065, 0x00d5, 0x00ae, 0x0074, 0x00bb, 0x0057, 0x0059,
      0x8002, 0x0060, 0x8003, 0x0000, 0xffff,
    ], '$2916DA..$2916FF is sequence list A\'s exact seventh script');
    assert.deepEqual(SEQUENCE_A_SEVENTH_INDICES.map((i) =>
      ROM.u32(SCRIPT7.spawnTable + i * 4)), SEQUENCE_A_SEVENTH_ART,
      'sequence list A entry 6 resolves all nine ordered picture words');
    assert.deepEqual(Array.from({ length: 62 }, (_, i) => ROM.u16(SEQUENCE_A_EIGHTH + i * 2)), [
      0x8000, 0x0000,
      0x8001, 0x3000, 0x0200,
      0x00ff, 0x00af, 0x005f, 0x0054, 0x005d, 0x00de, 0x004f, 0x0071,
      0x00c7, 0x0054, 0x004d,
      0x8001, 0x2800, 0x0200,
      0x00ce, 0x010a, 0x0061, 0x004d, 0x005b, 0x0059, 0x00f8, 0x00d1, 0x004e,
      0x8001, 0x2000, 0x0200,
      0x00c1, 0x00c0, 0x0062, 0x00bb, 0x0057, 0x0059,
      0x8001, 0x1800, 0x0200,
      0x8000, 0x0202,
      0x00d9, 0x00ad, 0x005f, 0x0054, 0x005d, 0x0064, 0x00d5, 0x00ae,
      0x0065, 0x0005, 0x0005, 0x0005,
      0x8002, 0x00c0, 0x8005, 0x0000, 0x0003, 0x8003, 0x0003, 0xffff,
    ], '$291700..$29177B is sequence list A\'s exact eighth script');
    assert.deepEqual(SEQUENCE_A_EIGHTH_INDICES.map((i) =>
      ROM.u32(SCRIPT7.spawnTable + i * 4)), SEQUENCE_A_EIGHTH_ART,
      'sequence list A entry 7 resolves all 38 ordered picture words');
    assert.equal(ROM.u32(0x290ce8 + 3 * 4), 0x290d42,
      '$8005 operand 3 reuses W372\'s existing two-node first-phase descriptor');
    assert.equal(ROM.u32(0x290dae + 3 * 4), 0x290e1c,
      'the same-banner path leaves operand 3\'s existing second-phase descriptor unused');
    assert.equal(ROM.u32(SCRIPT7.resTable + 3 * 4), 0x290e76,
      '$8003 operand 3 selects W372\'s existing one-node primary resource');
    assert.deepEqual(Array.from({ length: 33 }, (_, i) => ROM.u16(SEQUENCE_A_NINTH + i * 2)), [
      0x8000, 0x0404,
      0x8001, 0x4000, 0x0800,
      0x009e, 0x00a1, 0x0062, 0x0050, 0x006c, 0x0071, 0x00c7, 0x0065,
      0x8001, 0x3800, 0x0800,
      0x0061, 0x004d, 0x005b, 0x0059, 0x005f, 0x004a, 0x004b,
      0x8000, 0x1010, 0x0005, 0x0005, 0x0005,
      0x8002, 0x0060, 0x8003, 0x0004, 0xffff,
    ], '$29177C..$2917BD is sequence list A\'s exact ninth and final script');
    assert.deepEqual(SEQUENCE_A_NINTH_INDICES.map((i) =>
      ROM.u32(SCRIPT7.spawnTable + i * 4)), SEQUENCE_A_NINTH_ART,
    'sequence list A entry 8 resolves all 18 ordered picture words');
    assert.equal(ROM.u32(SCRIPT7.resTable + 4 * 4), 0x290e80,
      '$8003 operand 4 reuses W372\'s existing one-node primary resource');
    assert.throws(() => ROM.u16(NEXT_BOUNDARY),
      (error) => error instanceof Unreached && error.romAddress === NEXT_BOUNDARY,
      '$2917BE remains the exact unexported adjacent sequence-driver boundary');

    const ram = new Ram();
    const log = new UnportedLog();
    const events = [];
    const ctx = {
      rom: ROM,
      tables: MOVE,
      budget: new WorkBudget(),
      order: new ObjOrder(),
      unportedLog: log,
      unported: log,
      videoRegs: new VideoRegs(),
      tx: new TxVram(),
      bgVram: new BgVram(),
      slotTable: new SlotTable907000(),
      soundPost: () => true,
      stageEndEvent: (...event) => events.push(event),
    };
    const handlers = new Map([
      [0x13, makeStage5Ending(ROM)],
      [0x07, (r, slot, _index, c) => objSlot7(r, ROM, slot, c)],
      [0x0f, () => unreached(ROM.u32(SE.dispatch + 0x0f * 8),
        'W517 stops before following slot [15] beyond sequence list A')],
    ]);

    ram.setU16(SE.p1, 0x8000);
    ram.setU16(0x813098, 1);
    ram.setU16(SLOT7.postD1[0], 2);
    const created = stageCreate(ram, 0x13,
      (type) => ROM.u16(SE.dispatch + type * 8 + 4));
    assert.equal(created.result, 'ok');

    let sawType7 = false;
    let sawFirstResource = false;
    let sawSecondResource = false;
    let sawThirdResource = false;
    let sawFourthResource = false;
    let sawFifthResource = false;
    let maxFirstLive = 0;
    let maxSecondLive = 0;
    let maxThirdLive = 0;
    let maxFourthLive = 0;
    let maxFourthWait = 0;
    let maxFifthLive = 0;
    let maxFifthWait = 0;
    let secondPeak = [];
    let thirdPeak = [];
    let fourthPeak = [];
    let fifthPeak = [];
    let lastFifthLive = 0;
    const fifthSpawnFrames = [];
    let sawFinalCursor20 = false;
    let sawFifthPoolClear = false;
    let sawFinalListTransition = false;
    let sequenceStartFrame = null;
    let maxSequenceLive = 0;
    let maxSequenceWait = 0;
    let sequencePeak = [];
    let lastSequenceLive = 0;
    const sequenceSpawnFrames = [];
    let sawSequenceResource = false;
    let auxHandle = 0;
    let auxLoadedFrame = null;
    let auxReleasedFrame = null;
    let auxPeakNodes = 0;
    let auxMode = null;
    let auxPaletteA = [];
    let auxPaletteB = [];
    let sawSequenceCursor4 = false;
    let sawSequencePoolClear = false;
    let sequenceSecondStartFrame = null;
    let maxSequenceSecondLive = 0;
    let maxSequenceSecondWait = 0;
    let sequenceSecondPeak = [];
    let lastSequenceSecondLive = 0;
    const sequenceSecondSpawnFrames = [];
    let sawSequenceSecondResource = false;
    let sequenceSecondAuxActive = false;
    let auxHandleAtSecondStart = null;
    let sawSequenceCursor8 = false;
    let sawSequenceSecondPoolClear = false;
    let sequenceThirdStartFrame = null;
    let maxSequenceThirdLive = 0;
    let maxSequenceThirdWait = 0;
    let sequenceThirdPeak = [];
    let lastSequenceThirdLive = 0;
    const sequenceThirdSpawnFrames = [];
    let sawSequenceThirdResource = false;
    let sequenceThirdAuxActive = false;
    let auxHandleAtThirdStart = null;
    let primaryHandleAtThirdStart = null;
    let sawSequenceCursor12 = false;
    let sawSequenceThirdPoolClear = false;
    let sequenceFourthStartFrame = null;
    let maxSequenceFourthLive = 0;
    let maxSequenceFourthWait = 0;
    let sequenceFourthPeak = [];
    let lastSequenceFourthLive = 0;
    const sequenceFourthSpawnFrames = [];
    let sawSequenceFourthResource = false;
    let auxStateAtFourthStart = null;
    let auxHandleAtFourthStart = null;
    let primaryHandleAtFourthStart = null;
    let bannerAtFourthStart = null;
    let nextBannerAtFourthStart = null;
    let auxIndexAtFourthStart = null;
    let auxFirstLoadedFrame = null;
    let auxFirstHandle = 0;
    let auxFirstPeakNodes = 0;
    let sawSequenceCursor16 = false;
    let sawSequenceFourthPoolClear = false;
    let sequenceFourthBoundaryFrame = null;
    let primaryHandleAtFourthBoundary = null;
    let auxStateAtBoundary = null;
    let auxFirstProgressAtBoundary = [];
    let bannerAtBoundary = null;
    let nextBannerAtBoundary = null;
    let auxIndexAtBoundary = null;
    let maxSequenceFifthLive = 0;
    let maxSequenceFifthWait = 0;
    let sequenceFifthPeak = [];
    let lastSequenceFifthLive = 0;
    const sequenceFifthSpawnFrames = [];
    let sawSequenceFifthResource = false;
    let auxSecondLoadedFrame = null;
    let auxSecondHandle = 0;
    let auxSecondPeakNodes = 0;
    let bannerAtSecondLoad = null;
    let sawSequenceCursor20 = false;
    let sawSequenceFifthPoolClear = false;
    let sequenceFifthBoundaryFrame = null;
    let auxStateAtFifthBoundary = null;
    let auxHandleAtFifthBoundary = null;
    let primaryHandleAtFifthBoundary = null;
    let auxSecondProgressAtBoundary = [];
    let bannerAtFifthBoundary = null;
    let nextBannerAtFifthBoundary = null;
    let auxIndexAtFifthBoundary = null;
    let maxSequenceSixthLive = 0;
    let maxSequenceSixthWait = 0;
    let sequenceSixthPeak = [];
    let lastSequenceSixthLive = 0;
    const sequenceSixthSpawnFrames = [];
    let sawSequenceSixthResource = false;
    let sawSequenceCursor24 = false;
    let sawSequenceSixthPoolClear = false;
    let sequenceSixthBoundaryFrame = null;
    let maxSequenceSeventhLive = 0;
    let maxSequenceSeventhWait = 0;
    let sequenceSeventhPeak = [];
    let lastSequenceSeventhLive = 0;
    const sequenceSeventhSpawnFrames = [];
    let sawSequenceSeventhResource = false;
    let auxStateAtSeventhStart = null;
    let auxHandleAtSeventhStart = null;
    let primaryHandleAtSeventhStart = null;
    let sawSequenceCursor28 = false;
    let sawSequenceSeventhPoolClear = false;
    let sequenceSeventhBoundaryFrame = null;
    let auxStateAtSeventhBoundary = null;
    let auxHandleAtSeventhBoundary = null;
    let primaryHandleAtSeventhBoundary = null;
    let maxSequenceEighthLive = 0;
    let maxSequenceEighthWait = 0;
    let sequenceEighthPeak = [];
    let lastSequenceEighthLive = 0;
    const sequenceEighthSpawnFrames = [];
    let sawSequenceEighthResource = false;
    let sequenceEighthStartFrame = null;
    let auxStateAtEighthStart = null;
    let auxHandleAtEighthStart = null;
    let primaryHandleAtEighthStart = null;
    let eighthAuxLoadedFrame = null;
    let eighthAuxReleasedFrame = null;
    let eighthAuxHandle = 0;
    let eighthAuxMode = null;
    let eighthAuxPeakNodes = 0;
    let eighthAuxLastState = null;
    const eighthAuxTransitions = [];
    let eighthPrimaryLoadedFrame = null;
    let eighthPrimaryHandle = 0;
    let eighthPrimaryMode = null;
    let eighthPrimaryPeakNodes = 0;
    let sawSequenceCursor32 = false;
    let sawSequenceEighthPoolClear = false;
    let sequenceEighthBoundaryFrame = null;
    let auxStateAtEighthBoundary = null;
    let auxHandleAtEighthBoundary = null;
    let primaryHandleAtEighthBoundary = null;
    let bannerAtEighthBoundary = null;
    let nextBannerAtEighthBoundary = null;
    let auxIndexAtEighthBoundary = null;
    let sequenceNinthStartFrame = null;
    let maxSequenceNinthLive = 0;
    let maxSequenceNinthWait = 0;
    let sequenceNinthPeak = [];
    let lastSequenceNinthLive = 0;
    const sequenceNinthSpawnFrames = [];
    let sawSequenceNinthResource = false;
    let ninthPrimaryLoadedFrame = null;
    let ninthPrimaryHandle = 0;
    let ninthPrimaryMode = null;
    let ninthPrimaryPeakNodes = 0;
    let auxStateAtNinthStart = null;
    let auxHandleAtNinthStart = null;
    let primaryHandleAtNinthStart = null;
    let sawSequenceCursor36 = false;
    let sawSequenceNinthPoolClear = false;
    let sequenceNinthBoundaryFrame = null;
    let auxStateAtNinthBoundary = null;
    let auxHandleAtNinthBoundary = null;
    let primaryHandleAtNinthBoundary = null;
    let sawListATerminator = false;
    let sawNormalHandoffQueued = false;
    let nextError = null;
    const firstSeenArt = new Set();
    for (let frame = 0; frame < 3200 && nextError == null; frame++) {
      clearSpriteCounters(ram);
      ctx.budget.beginFrame();
      try {
        runObjectDriver(ram, handlers, ctx);
      } catch (error) {
        nextError = error;
        break;
      }
      if (frame === 0) ram.setU16(ENDING13.base + ENDING13.timer, 0);
      runAnimObjects24683E(ram, ROM);

      for (let i = 0; i < OBJ.slots; i++) {
        const slot = OBJ.base + i * OBJ.stride;
        if ((ram.u16(slot) & 0xff) === 7) {
          sawType7 = true;
          if (ram.u8(slot + SLOT7.stateAt) === 2) sawListATerminator = true;
        }
      }
      if (sawListATerminator && ram.u16(ALLOC.createSp) !== 0) {
        sawNormalHandoffQueued = true;
      }
      const innerState = ram.u16(SLOT7.work + SLOT7.innerAt);
      const sequenceCursor = ram.u16(SLOT7.work + 0x0c);
      if (ram.u32(SCRIPT7.resource) !== 0) {
        if (sequenceCursor === 0) sawFirstResource = true;
        if (sequenceCursor === 4) sawSecondResource = true;
        if (sequenceCursor === 8) sawThirdResource = true;
        if (sequenceCursor === 12) sawFourthResource = true;
        if (sequenceCursor === 16) sawFifthResource = true;
      }
      if (sequenceCursor === 12 && ram.u16(SCRIPT7.cursor) === 0x72) {
        maxFourthWait = Math.max(maxFourthWait, ram.u16(SCRIPT7.loopCount));
      }
      if (sequenceCursor === 16 && ram.u16(SCRIPT7.cursor) === 0x34) {
        maxFifthWait = Math.max(maxFifthWait, ram.u16(SCRIPT7.loopCount));
      }
      const live = livePoolRecords(ram);
      if (innerState === 0 && sequenceCursor === 0) {
        maxFirstLive = Math.max(maxFirstLive, live.length);
        for (const { art } of live) firstSeenArt.add(art);
      }
      if (innerState === 0 && sequenceCursor === 4 && live.length > maxSecondLive) {
        maxSecondLive = live.length;
        secondPeak = live;
      }
      if (innerState === 0 && sequenceCursor === 8 && live.length > maxThirdLive) {
        maxThirdLive = live.length;
        thirdPeak = live;
      }
      if (sequenceCursor === 12 && live.length > maxFourthLive) {
        maxFourthLive = live.length;
        fourthPeak = live;
      }
      if (innerState === 0 && sequenceCursor === 16) {
        if (live.length > lastFifthLive) fifthSpawnFrames.push(frame);
        lastFifthLive = Math.max(lastFifthLive, live.length);
        if (live.length > maxFifthLive) {
          maxFifthLive = live.length;
          fifthPeak = live;
        }
      }
      if (innerState === 0 && sequenceCursor === 20) {
        sawFinalCursor20 = true;
        if (live.length === 0) sawFifthPoolClear = true;
      }
      if (innerState === 1 && ram.u16(SLOT7.work + 0x06) === 0) {
        sawFinalListTransition = true;
      }
      if (innerState === 1 && ram.u16(SLOT7.work + 0x06) === 1 && sequenceCursor === 0) {
        if (sequenceStartFrame === null && ram.u16(SCRIPT7.cursor) === 0x10) {
          sequenceStartFrame = frame;
        }
        const auxState = ram.u16(0x81e108);
        if (auxState === 4) {
          if (auxLoadedFrame === null) {
            auxLoadedFrame = frame;
            auxHandle = ram.u32(0x81e10e);
            auxMode = ram.u16(auxHandle + 0x04);
          }
          auxPeakNodes = Math.max(auxPeakNodes, chainNodes(ram, auxHandle).length);
        }
        if (auxLoadedFrame !== null && auxReleasedFrame === null && auxState === 0) {
          auxReleasedFrame = frame;
          auxPaletteA = Array.from({ length: 32 }, (_, i) => ram.u16(0x80e8c6 + i * 2));
          auxPaletteB = Array.from({ length: 32 }, (_, i) => ram.u16(0x80e906 + i * 2));
        }
        if (ram.u16(SCRIPT7.cursor) === 0x50) {
          maxSequenceWait = Math.max(maxSequenceWait, ram.u16(SCRIPT7.loopCount));
        }
        if (ram.u32(SCRIPT7.resource) !== 0) sawSequenceResource = true;
        if (live.length > lastSequenceLive) sequenceSpawnFrames.push(frame);
        lastSequenceLive = Math.max(lastSequenceLive, live.length);
        if (live.length > maxSequenceLive) {
          maxSequenceLive = live.length;
          sequencePeak = live;
        }
      }
      if (innerState === 1 && ram.u16(SLOT7.work + 0x06) === 1 && sequenceCursor === 4) {
        sawSequenceCursor4 = true;
        if (sequenceSecondStartFrame === null) {
          sequenceSecondStartFrame = frame;
          auxHandleAtSecondStart = ram.u32(0x81e10e);
        }
        if (live.length === 0) sawSequencePoolClear = true;
        if (ram.u16(0x81e108) !== 0) sequenceSecondAuxActive = true;
        if (ram.u16(SCRIPT7.cursor) === 0x4c) {
          maxSequenceSecondWait = Math.max(maxSequenceSecondWait, ram.u16(SCRIPT7.loopCount));
        }
        if (ram.u32(SCRIPT7.resource) !== 0) sawSequenceSecondResource = true;
        if (live.length > lastSequenceSecondLive) sequenceSecondSpawnFrames.push(frame);
        lastSequenceSecondLive = Math.max(lastSequenceSecondLive, live.length);
        if (live.length > maxSequenceSecondLive) {
          maxSequenceSecondLive = live.length;
          sequenceSecondPeak = live;
        }
      }
      if (innerState === 1 && ram.u16(SLOT7.work + 0x06) === 1 && sequenceCursor === 8) {
        sawSequenceCursor8 = true;
        if (sequenceThirdStartFrame === null) {
          sequenceThirdStartFrame = frame;
          auxHandleAtThirdStart = ram.u32(0x81e10e);
          primaryHandleAtThirdStart = ram.u32(SCRIPT7.resource);
        }
        if (live.length === 0) sawSequenceSecondPoolClear = true;
        if (ram.u16(0x81e108) !== 0) sequenceThirdAuxActive = true;
        if (ram.u16(SCRIPT7.cursor) === 0x5a) {
          maxSequenceThirdWait = Math.max(maxSequenceThirdWait, ram.u16(SCRIPT7.loopCount));
        }
        if (ram.u32(SCRIPT7.resource) !== 0) sawSequenceThirdResource = true;
        if (live.length > lastSequenceThirdLive) sequenceThirdSpawnFrames.push(frame);
        lastSequenceThirdLive = Math.max(lastSequenceThirdLive, live.length);
        if (live.length > maxSequenceThirdLive) {
          maxSequenceThirdLive = live.length;
          sequenceThirdPeak = live;
        }
      }
      if (innerState === 1 && sequenceCursor === 12) {
        sawSequenceCursor12 = true;
        if (sequenceFourthStartFrame === null) {
          sequenceFourthStartFrame = frame;
          auxStateAtFourthStart = ram.u16(0x81e108);
          auxHandleAtFourthStart = ram.u32(0x81e10e);
          primaryHandleAtFourthStart = ram.u32(SCRIPT7.resource);
          bannerAtFourthStart = ram.u16(0x81e106);
          nextBannerAtFourthStart = ram.u16(0x81e10a);
          auxIndexAtFourthStart = ram.u16(0x81e10c);
        }
        if (live.length === 0) sawSequenceThirdPoolClear = true;
        if (ram.u16(SCRIPT7.cursor) === 0x58) {
          maxSequenceFourthWait = Math.max(maxSequenceFourthWait, ram.u16(SCRIPT7.loopCount));
        }
        if (ram.u32(SCRIPT7.resource) !== 0) sawSequenceFourthResource = true;
        if (live.length > lastSequenceFourthLive) sequenceFourthSpawnFrames.push(frame);
        lastSequenceFourthLive = Math.max(lastSequenceFourthLive, live.length);
        if (live.length > maxSequenceFourthLive) {
          maxSequenceFourthLive = live.length;
          sequenceFourthPeak = live;
        }
        const auxState = ram.u16(0x81e108);
        const currentAuxHandle = ram.u32(0x81e10e);
        if (auxState === 2 && currentAuxHandle !== auxHandleAtFourthStart) {
          if (auxFirstLoadedFrame === null) {
            auxFirstLoadedFrame = frame;
            auxFirstHandle = currentAuxHandle;
          }
          auxFirstPeakNodes = Math.max(auxFirstPeakNodes,
            chainNodes(ram, currentAuxHandle).length);
        }
      }
      if (innerState === 1 && sequenceCursor === 16) {
        sawSequenceCursor16 = true;
        if (live.length === 0 && sequenceFourthBoundaryFrame === null) {
          sawSequenceFourthPoolClear = true;
          sequenceFourthBoundaryFrame = frame;
          primaryHandleAtFourthBoundary = ram.u32(SCRIPT7.resource);
          auxStateAtBoundary = ram.u16(0x81e108);
          const nodes = chainNodes(ram, ram.u32(0x81e10e));
          auxFirstProgressAtBoundary = nodes.map((node) => ram.u16(node + 0x20));
          bannerAtBoundary = ram.u16(0x81e106);
          nextBannerAtBoundary = ram.u16(0x81e10a);
          auxIndexAtBoundary = ram.u16(0x81e10c);
        }
        if (ram.u16(SCRIPT7.cursor) === 0x1c) {
          maxSequenceFifthWait = Math.max(maxSequenceFifthWait, ram.u16(SCRIPT7.loopCount));
        }
        if (ram.u32(SCRIPT7.resource) !== 0) sawSequenceFifthResource = true;
        if (live.length > lastSequenceFifthLive) sequenceFifthSpawnFrames.push(frame);
        lastSequenceFifthLive = Math.max(lastSequenceFifthLive, live.length);
        if (live.length > maxSequenceFifthLive) {
          maxSequenceFifthLive = live.length;
          sequenceFifthPeak = live;
        }
        const auxState = ram.u16(0x81e108);
        const currentAuxHandle = ram.u32(0x81e10e);
        if (auxState === 4 && currentAuxHandle !== 0) {
          if (auxSecondLoadedFrame === null) {
            auxSecondLoadedFrame = frame;
            auxSecondHandle = currentAuxHandle;
            bannerAtSecondLoad = ram.u16(0x81e106);
          }
          auxSecondPeakNodes = Math.max(auxSecondPeakNodes,
            chainNodes(ram, currentAuxHandle).length);
        }
      }
      if (innerState === 1 && ram.u16(SLOT7.work + 0x06) === 1 && sequenceCursor === 20) {
        sawSequenceCursor20 = true;
        if (live.length === 0 && sequenceFifthBoundaryFrame === null) {
          sawSequenceFifthPoolClear = true;
          sequenceFifthBoundaryFrame = frame;
          auxStateAtFifthBoundary = ram.u16(0x81e108);
          auxHandleAtFifthBoundary = ram.u32(0x81e10e);
          primaryHandleAtFifthBoundary = ram.u32(SCRIPT7.resource);
          const nodes = auxHandleAtFifthBoundary === 0
            ? [] : chainNodes(ram, auxHandleAtFifthBoundary);
          auxSecondProgressAtBoundary = nodes.map((node) => ram.u16(node + 0x20));
          bannerAtFifthBoundary = ram.u16(0x81e106);
          nextBannerAtFifthBoundary = ram.u16(0x81e10a);
          auxIndexAtFifthBoundary = ram.u16(0x81e10c);
        }
        if (ram.u16(SCRIPT7.cursor) === 0x3e) {
          maxSequenceSixthWait = Math.max(maxSequenceSixthWait, ram.u16(SCRIPT7.loopCount));
        }
        if (ram.u32(SCRIPT7.resource) !== 0) sawSequenceSixthResource = true;
        if (live.length > lastSequenceSixthLive) sequenceSixthSpawnFrames.push(frame);
        lastSequenceSixthLive = Math.max(lastSequenceSixthLive, live.length);
        if (live.length > maxSequenceSixthLive) {
          maxSequenceSixthLive = live.length;
          sequenceSixthPeak = live;
        }
      }
      if (innerState === 1 && ram.u16(SLOT7.work + 0x06) === 1 && sequenceCursor === 24) {
        sawSequenceCursor24 = true;
        if (live.length === 0 && sequenceSixthBoundaryFrame === null) {
          sawSequenceSixthPoolClear = true;
          sequenceSixthBoundaryFrame = frame;
          auxStateAtSeventhStart = ram.u16(0x81e108);
          auxHandleAtSeventhStart = ram.u32(0x81e10e);
          primaryHandleAtSeventhStart = ram.u32(SCRIPT7.resource);
        }
        if (ram.u16(SCRIPT7.cursor) === 0x1c) {
          maxSequenceSeventhWait = Math.max(maxSequenceSeventhWait, ram.u16(SCRIPT7.loopCount));
        }
        if (ram.u32(SCRIPT7.resource) !== 0) sawSequenceSeventhResource = true;
        if (live.length > lastSequenceSeventhLive) sequenceSeventhSpawnFrames.push(frame);
        lastSequenceSeventhLive = Math.max(lastSequenceSeventhLive, live.length);
        if (live.length > maxSequenceSeventhLive) {
          maxSequenceSeventhLive = live.length;
          sequenceSeventhPeak = live;
        }
      }
      if (innerState === 1 && ram.u16(SLOT7.work + 0x06) === 1 && sequenceCursor === 28) {
        sawSequenceCursor28 = true;
        if (live.length === 0 && sequenceSeventhBoundaryFrame === null) {
          sawSequenceSeventhPoolClear = true;
          sequenceSeventhBoundaryFrame = frame;
          auxStateAtSeventhBoundary = ram.u16(0x81e108);
          auxHandleAtSeventhBoundary = ram.u32(0x81e10e);
          primaryHandleAtSeventhBoundary = ram.u32(SCRIPT7.resource);
        }
        if (sequenceEighthStartFrame === null) {
          sequenceEighthStartFrame = frame;
          auxStateAtEighthStart = ram.u16(0x81e108);
          auxHandleAtEighthStart = ram.u32(0x81e10e);
          primaryHandleAtEighthStart = ram.u32(SCRIPT7.resource);
        }
        if (ram.u16(SCRIPT7.cursor) === 0x6c) {
          maxSequenceEighthWait = Math.max(maxSequenceEighthWait, ram.u16(SCRIPT7.loopCount));
        }
        const primaryHandle = ram.u32(SCRIPT7.resource);
        if (primaryHandle !== 0) {
          sawSequenceEighthResource = true;
          if (eighthPrimaryLoadedFrame === null) {
            eighthPrimaryLoadedFrame = frame;
            eighthPrimaryHandle = primaryHandle;
            eighthPrimaryMode = ram.u16(primaryHandle + 0x04);
          }
          eighthPrimaryPeakNodes = Math.max(eighthPrimaryPeakNodes,
            chainNodes(ram, primaryHandle).length);
        }
        const auxState = ram.u16(0x81e108);
        const currentAuxHandle = ram.u32(0x81e10e);
        if (auxState !== eighthAuxLastState) {
          eighthAuxTransitions.push({ frame, auxState, currentAuxHandle });
          eighthAuxLastState = auxState;
        }
        if (auxState === 2 && currentAuxHandle !== 0) {
          if (eighthAuxLoadedFrame === null) {
            eighthAuxLoadedFrame = frame;
            eighthAuxHandle = currentAuxHandle;
            eighthAuxMode = ram.u16(currentAuxHandle + 0x04);
          }
          eighthAuxPeakNodes = Math.max(eighthAuxPeakNodes,
            chainNodes(ram, currentAuxHandle).length);
        }
        if (eighthAuxLoadedFrame !== null && eighthAuxReleasedFrame === null && auxState === 0) {
          eighthAuxReleasedFrame = frame;
        }
        if (live.length > lastSequenceEighthLive) sequenceEighthSpawnFrames.push(frame);
        lastSequenceEighthLive = Math.max(lastSequenceEighthLive, live.length);
        if (live.length > maxSequenceEighthLive) {
          maxSequenceEighthLive = live.length;
          sequenceEighthPeak = live;
        }
      }
      if (innerState === 1 && ram.u16(SLOT7.work + 0x06) === 1 && sequenceCursor === 32) {
        sawSequenceCursor32 = true;
        if (live.length === 0 && sequenceEighthBoundaryFrame === null) {
          sawSequenceEighthPoolClear = true;
          sequenceEighthBoundaryFrame = frame;
          auxStateAtEighthBoundary = ram.u16(0x81e108);
          auxHandleAtEighthBoundary = ram.u32(0x81e10e);
          primaryHandleAtEighthBoundary = ram.u32(SCRIPT7.resource);
          if (auxStateAtEighthBoundary !== eighthAuxLastState) {
            eighthAuxTransitions.push({
              frame, auxState: auxStateAtEighthBoundary,
              currentAuxHandle: auxHandleAtEighthBoundary,
            });
            eighthAuxLastState = auxStateAtEighthBoundary;
          }
          if (eighthAuxLoadedFrame !== null && eighthAuxReleasedFrame === null
              && auxStateAtEighthBoundary === 0) {
            eighthAuxReleasedFrame = frame;
          }
          bannerAtEighthBoundary = ram.u16(0x81e106);
          nextBannerAtEighthBoundary = ram.u16(0x81e10a);
          auxIndexAtEighthBoundary = ram.u16(0x81e10c);
        }
        if (sequenceNinthStartFrame === null) {
          sequenceNinthStartFrame = frame;
          auxStateAtNinthStart = ram.u16(0x81e108);
          auxHandleAtNinthStart = ram.u32(0x81e10e);
          primaryHandleAtNinthStart = ram.u32(SCRIPT7.resource);
        }
        if (ram.u16(SCRIPT7.cursor) === 0x38) {
          maxSequenceNinthWait = Math.max(maxSequenceNinthWait, ram.u16(SCRIPT7.loopCount));
        }
        const ninthPrimaryHandleNow = ram.u32(SCRIPT7.resource);
        if (ninthPrimaryHandleNow !== 0) {
          sawSequenceNinthResource = true;
          if (ninthPrimaryLoadedFrame === null) {
            ninthPrimaryLoadedFrame = frame;
            ninthPrimaryHandle = ninthPrimaryHandleNow;
            ninthPrimaryMode = ram.u16(ninthPrimaryHandle + 0x04);
          }
          ninthPrimaryPeakNodes = Math.max(ninthPrimaryPeakNodes,
            chainNodes(ram, ninthPrimaryHandleNow).length);
        }
        if (live.length > lastSequenceNinthLive) sequenceNinthSpawnFrames.push(frame);
        lastSequenceNinthLive = Math.max(lastSequenceNinthLive, live.length);
        if (live.length > maxSequenceNinthLive) {
          maxSequenceNinthLive = live.length;
          sequenceNinthPeak = live;
        }
      }
      if (innerState === 1 && ram.u16(SLOT7.work + 0x06) === 1 && sequenceCursor === 36) {
        sawSequenceCursor36 = true;
        if (live.length === 0 && sequenceNinthBoundaryFrame === null) {
          sawSequenceNinthPoolClear = true;
          sequenceNinthBoundaryFrame = frame;
          auxStateAtNinthBoundary = ram.u16(0x81e108);
          auxHandleAtNinthBoundary = ram.u32(0x81e10e);
          primaryHandleAtNinthBoundary = ram.u32(SCRIPT7.resource);
        }
      }
    }

    assert.ok(sawType7, '$28D5FA staged type 7 and the object driver committed it');
    assert.ok(events.some(([kind]) => kind === 'ending-handoff'),
      'the exact type-$13 handoff fired');
    assert.equal(maxFirstLive, 10, 'the first script allocated all ten pool records');
    assert.deepEqual([...firstSeenArt], FIRST_ART,
      'the first script exposed all eight distinct cartridge-selected art pointers in order');
    assert.ok(sawFirstResource, 'the first $8003 loaded its one-node $290E58 resource');
    assert.equal(maxSecondLive, 26, 'the second script allocated all 26 pool records');
    assert.deepEqual(secondPeak.map(({ art }) => art), SECOND_ART,
      'the second script preserved all cartridge-selected art pointers and repetitions');
    assert.deepEqual(secondPeak.map(({ position }) => position), SECOND_POSITIONS,
      'the second script preserved all three $8001 bases and each $400 low-word bump');
    assert.ok(sawSecondResource, 'the second $8003 loaded its one-node $290E58 resource');
    assert.equal(maxThirdLive, 31, 'the third script allocated all 31 pool records');
    assert.deepEqual(thirdPeak.map(({ art }) => art), THIRD_ART,
      'the third script preserved all cartridge-selected art pointers and repetitions');
    assert.deepEqual(thirdPeak.map(({ position }) => position), THIRD_POSITIONS,
      'the third script preserved all three $8001 bases and each $400 low-word bump');
    assert.ok(sawThirdResource, 'the third $8003 loaded its one-node $290E58 resource');
    assert.equal(maxFourthLive, 43, 'the fourth script allocated all 43 pool records');
    assert.deepEqual(fourthPeak.map(({ art }) => art), FOURTH_ART,
      'the fourth script preserved all cartridge-selected art pointers and repetitions');
    assert.deepEqual(fourthPeak.map(({ position }) => position), FOURTH_POSITIONS,
      'the fourth script preserved all four $8001 bases and each $400 low-word bump');
    assert.equal(maxFourthWait, 0x100,
      'the fourth $8002 held at its exact $100 count before advancing');
    assert.ok(sawFourthResource, 'the fourth $8003 loaded its one-node $290E58 resource');
    assert.equal(maxFifthLive, 16, 'the fifth script allocated all 16 pool records');
    assert.deepEqual(fifthPeak.map(({ art }) => art), FIFTH_ART,
      'the fifth script preserved all cartridge-selected art pointers and repetitions');
    assert.deepEqual(fifthPeak.map(({ position }) => position), FIFTH_POSITIONS,
      'the fifth script preserved both $8001 bases and each $400 low-word bump');
    assert.deepEqual(fifthSpawnFrames.slice(1).map((at, i) => at - fifthSpawnFrames[i]), [
      ...Array(12).fill(1), 9, 9, 9,
    ], '$8000 $0000 spawns every frame before $0808 spaces the final three by nine frames');
    assert.equal(maxFifthWait, 0x80,
      'the fifth $8002 held at its exact $80 count before advancing');
    assert.ok(sawFifthResource, 'the fifth $8003 loaded operand 4\'s one-node $290E80 resource');
    assert.equal(ram.u32(SCRIPT7.resource), 0,
      'the fifth resource completed the shared load, wait, free, clear, and advance path');
    assert.ok(sawFinalCursor20,
      'the fifth $FFFF advanced variant 0 from list cursor 16 to cursor 20');
    assert.ok(sawFifthPoolClear,
      'the inter-script clear removed every fifth-script pool record at cursor 20');
    assert.ok(sawFinalListTransition,
      'the existing $FFFFFFFF arm authentically advanced variant 0 into inner state 1');
    assert.equal(nextBannerAtFourthStart, 1,
      '$8005 preserved operand 1 as the next banner selector through entry 2');
    assert.equal(auxIndexAtFourthStart, 3,
      '$8005 preserved operand 3 as the auxiliary resource index through entry 2');
    assert.notEqual(auxLoadedFrame, null,
      '$8005 reached $2907E2 state 3 and loaded its mode-0 resource');
    assert.equal(auxMode, 0, '$24641A created the auxiliary root in mode 0');
    assert.equal(auxPeakNodes, 2, '$290E1C created its exact two-node resource chain');
    assert.equal(auxReleasedFrame - auxLoadedFrame, 32,
      'timing index 3 drained both auxiliary nodes in exactly 32 animation steps');
    assert.deepEqual(auxPaletteA,
      Array.from({ length: 32 }, (_, i) => {
        const target = ROM.u16(0x225ab8 + i * 2) & 0x7fff;
        return target === 0x4210 ? 0x4631 : target;
      }),
      'the first auxiliary node reaches its 32-word palette, including the channel-16 skip');
    assert.deepEqual(auxPaletteB,
      Array.from({ length: 32 }, (_, i) => {
        const target = ROM.u16(0x225b38 + i * 2) & 0x7fff;
        return target === 0x4210 ? 0x4631 : target;
      }),
      'the second auxiliary node reaches its 32-word palette, including the channel-16 skip');
    assert.equal(auxStateAtFourthStart, 0,
      'W509 auxiliary resource returned to idle before entry 3 began');
    assert.equal(auxHandleAtFourthStart, auxHandle,
      'the cartridge kept W509\'s freed auxiliary handle cached through entry 2');
    assert.equal(bannerAtFourthStart, 1,
      'the no-prior-banner arm published $8005 operand 1 before entry 3');
    assert.equal(maxSequenceLive, 26,
      'sequence list A entry 0 allocated all 26 pool records');
    assert.deepEqual(sequencePeak.map(({ art }) => art), SEQUENCE_A_ART,
      'sequence list A entry 0 preserved every ordered art pointer and repetition');
    assert.deepEqual(sequencePeak.map(({ position }) => position), SEQUENCE_A_POSITIONS,
      'sequence list A entry 0 preserved all three position groups and $400 bumps');
    assert.equal(sequenceSpawnFrames[0] - sequenceStartFrame, 32,
      '$8000 $2000 delayed the first spawn by exactly 32 driver frames');
    assert.deepEqual(sequenceSpawnFrames.slice(1).map((at, i) => at - sequenceSpawnFrames[i]),
      Array(25).fill(1), 'the zero reload emitted the remaining 25 records one per frame');
    assert.equal(maxSequenceWait, 0xc0,
      'sequence list A entry 0 held at its exact $C0 wait count');
    assert.ok(sawSequenceResource,
      'entry 0 $8003 operand 0 completed the existing one-node $290E58 lifecycle');
    assert.ok(sawSequenceCursor4,
      '$FFFF advanced sequence list A from cursor 0 to cursor 4');
    assert.ok(sawSequencePoolClear,
      'the sequence driver cleared all 26 entry-0 pool records at cursor 4');
    assert.equal(maxSequenceSecondLive, 27,
      'sequence list A entry 1 allocated all 27 pool records');
    assert.deepEqual(sequenceSecondPeak.map(({ art }) => art), SEQUENCE_A_SECOND_ART,
      'sequence list A entry 1 preserved every ordered art pointer and repetition');
    assert.deepEqual(sequenceSecondPeak.map(({ position }) => position), SEQUENCE_A_SECOND_POSITIONS,
      'sequence list A entry 1 preserved its 12, 8, and 7-record position groups and $400 bumps');
    assert.equal(sequenceSecondSpawnFrames[0] - sequenceSecondStartFrame, 1,
      '$8000 $0000 made the first record eligible on the next script-driver frame');
    assert.deepEqual(sequenceSecondSpawnFrames.slice(1).map((at, i) =>
      at - sequenceSecondSpawnFrames[i]), Array(26).fill(1),
      'reload zero emitted all remaining entry-1 records on consecutive driver frames');
    assert.equal(maxSequenceSecondWait, 0xc0,
      'sequence list A entry 1 held at its exact $C0 wait count');
    assert.ok(sawSequenceSecondResource,
      'entry 1 $8003 operand 0 completed the existing one-node $290E58 lifecycle');
    assert.equal(sequenceSecondAuxActive, false,
      'entry 1 contains no $8005 and never rearmed the auxiliary loader');
    assert.equal(auxHandleAtSecondStart, auxHandle,
      'entry 1 began with W509\'s freed auxiliary handle still cached');
    assert.equal(auxHandleAtThirdStart, auxHandleAtSecondStart,
      'entry 1 left the stale auxiliary handle unchanged');
    assert.equal(primaryHandleAtThirdStart, 0,
      'entry 1 freed and cleared its primary resource handle before entry 2 began');
    assert.ok(sawSequenceCursor8,
      '$FFFF advanced sequence list A from cursor 4 to cursor 8');
    assert.ok(sawSequenceSecondPoolClear,
      'the sequence driver cleared all 27 entry-1 pool records at cursor 8');
    assert.equal(maxSequenceThirdLive, 34,
      'sequence list A entry 2 allocated all 34 pool records');
    assert.deepEqual(sequenceThirdPeak.map(({ art }) => art), SEQUENCE_A_THIRD_ART,
      'sequence list A entry 2 preserved every ordered art pointer and repetition');
    assert.deepEqual(sequenceThirdPeak.map(({ position }) => position), SEQUENCE_A_THIRD_POSITIONS,
      'sequence list A entry 2 preserved its 13, 13, and 8-record position groups and $400 bumps');
    assert.equal(sequenceThirdSpawnFrames[0] - sequenceThirdStartFrame, 5,
      '$8000 $0404 delayed the first entry-2 record by exactly five driver calls');
    assert.deepEqual(sequenceThirdSpawnFrames.slice(1).map((at, i) =>
      at - sequenceThirdSpawnFrames[i]), Array(33).fill(5),
      '$0404 reloaded after each borrow and spaced every later entry-2 record by five frames');
    assert.equal(maxSequenceThirdWait, 0x60,
      'sequence list A entry 2 held at its exact $60 wait count');
    assert.ok(sawSequenceThirdResource,
      'entry 2 $8003 operand 0 completed the existing one-node $290E58 lifecycle');
    assert.equal(sequenceThirdAuxActive, false,
      'entry 2 contains no $8005 and never rearmed the auxiliary loader');
    assert.equal(auxHandleAtThirdStart, auxHandle,
      'entry 2 began with W509\'s freed auxiliary handle still cached');
    assert.equal(auxHandleAtFourthStart, auxHandleAtThirdStart,
      'entry 2 left the stale auxiliary handle unchanged');
    assert.equal(primaryHandleAtFourthStart, 0,
      'entry 2 freed and cleared its primary resource handle before entry 3 began');
    assert.ok(sawSequenceCursor12,
      '$FFFF advanced sequence list A from cursor 8 to cursor 12');
    assert.ok(sawSequenceThirdPoolClear,
      'the sequence driver cleared all 34 entry-2 pool records at cursor 12');
    assert.equal(maxSequenceFourthLive, 33,
      'sequence list A entry 3 allocated all 33 pool records');
    assert.deepEqual(sequenceFourthPeak.map(({ art }) => art), SEQUENCE_A_FOURTH_ART,
      'sequence list A entry 3 preserved every ordered art pointer and repetition');
    assert.deepEqual(sequenceFourthPeak.map(({ position }) => position),
      SEQUENCE_A_FOURTH_POSITIONS,
      'sequence list A entry 3 preserved its 9, 11, and 13-record position groups and $400 bumps');
    assert.equal(sequenceFourthSpawnFrames[0] - sequenceFourthStartFrame, 1,
      '$8000 $0000 made the first entry-3 record eligible on the next driver call');
    assert.deepEqual(sequenceFourthSpawnFrames.slice(1).map((at, i) =>
      at - sequenceFourthSpawnFrames[i]), Array(32).fill(1),
      'reload zero emitted all remaining entry-3 records on consecutive driver frames');
    assert.equal(maxSequenceFourthWait, 0xc0,
      'sequence list A entry 3 held at its exact $C0 wait count');
    assert.ok(sawSequenceFourthResource,
      'entry 3 $8003 operand 0 completed the existing one-node $290E58 lifecycle');
    assert.notEqual(auxFirstLoadedFrame, null,
      '$8005 $0002 $0004 loaded its first-phase $290D54 resource');
    assert.notEqual(auxFirstHandle, auxHandleAtFourthStart,
      '$8005 replaced W509\'s stale freed handle with the live first-phase handle');
    assert.equal(ram.u16(auxFirstHandle + 0x04), 0,
      '$246710 created the first-phase root in mode 0');
    assert.equal(auxFirstPeakNodes, 2,
      '$290D54 created its exact two-node fade-to-black chain');
    assert.equal(sequenceFourthBoundaryFrame - auxFirstLoadedFrame, 8,
      'operand 0 completes eight driver frames after the auxiliary first phase loads');
    assert.equal(auxStateAtBoundary, 2,
      'the next script boundary authentically leaves $2907E2 waiting in first-phase state 2');
    assert.deepEqual(auxFirstProgressAtBoundary, [4, 4],
      'timing index 4 advances both first-phase nodes four steps before the boundary');
    assert.equal(bannerAtBoundary, 1,
      'the first auxiliary phase has not yet published next banner 2');
    assert.equal(nextBannerAtBoundary, 2,
      '$8005 preserved operand 2 as the pending banner selector');
    assert.equal(auxIndexAtBoundary, 4,
      '$8005 preserved operand 4 for both descriptor tables');
    assert.equal(primaryHandleAtFourthBoundary, 0,
      'entry 3 freed and cleared its primary resource handle before $FFFF');
    assert.ok(sawSequenceCursor16,
      '$FFFF advanced sequence list A from cursor 12 to cursor 16');
    assert.ok(sawSequenceFourthPoolClear,
      'the sequence driver cleared all 33 entry-3 pool records at cursor 16');
    assert.equal(maxSequenceFifthLive, 9,
      'sequence list A entry 4 allocated all nine pool records');
    assert.deepEqual(sequenceFifthPeak.map(({ art }) => art), SEQUENCE_A_FIFTH_ART,
      'sequence list A entry 4 preserved every ordered art pointer and repetition');
    assert.deepEqual(sequenceFifthPeak.map(({ position }) => position),
      SEQUENCE_A_FIFTH_POSITIONS,
      'sequence list A entry 4 preserved its nine-record position group and $400 bumps');
    assert.equal(sequenceFifthSpawnFrames[0] - sequenceFourthBoundaryFrame, 1,
      '$8000 $0000 made the first entry-4 record eligible on the next driver call');
    assert.deepEqual(sequenceFifthSpawnFrames.slice(1).map((at, i) =>
      at - sequenceFifthSpawnFrames[i]), Array(8).fill(1),
      'reload zero emitted all remaining entry-4 records on consecutive driver frames');
    assert.equal(maxSequenceFifthWait, 0x60,
      'sequence list A entry 4 held at its exact $60 wait count');
    assert.ok(sawSequenceFifthResource,
      'entry 4 $8003 operand 0 completed the existing one-node $290E58 lifecycle');
    assert.notEqual(auxSecondLoadedFrame, null,
      'W512\'s first phase completed and loaded the $290E3A second phase');
    assert.equal(auxSecondLoadedFrame - sequenceFourthBoundaryFrame, 56,
      'the auxiliary second phase loaded at entry-4 relative driver offset 56');
    assert.equal(bannerAtSecondLoad, 2,
      'the completed first phase published banner 2 before loading the second phase');
    assert.equal(ram.u16(auxSecondHandle + 0x04), 0,
      '$24641A created the auxiliary second-phase root in mode 0');
    assert.equal(auxSecondPeakNodes, 2,
      '$290E3A created its exact two-node palette chain');
    assert.equal(sequenceFifthBoundaryFrame - sequenceFourthBoundaryFrame, 114,
      'entry 4 reached its next-script boundary at relative driver offset 114');
    assert.equal(auxStateAtFifthBoundary, 4,
      'the next script boundary leaves $2907E2 waiting in second-phase state 4');
    assert.deepEqual(auxSecondProgressAtBoundary, [29, 29],
      'both timing-index-4 second-phase nodes reach progress 29 at the boundary');
    assert.equal(bannerAtFifthBoundary, 2,
      'banner 2 remains live at the next script boundary');
    assert.equal(nextBannerAtFifthBoundary, 2,
      'the auxiliary loader retains the cartridge banner selector');
    assert.equal(auxIndexAtFifthBoundary, 4,
      'the auxiliary loader retains descriptor index 4');
    assert.equal(primaryHandleAtFifthBoundary, 0,
      'entry 4 freed and cleared its primary resource handle before $FFFF');
    assert.ok(sawSequenceCursor20,
      '$FFFF advanced sequence list A from cursor 16 to cursor 20');
    assert.ok(sawSequenceFifthPoolClear,
      'the sequence driver cleared all nine entry-4 pool records at cursor 20');
    assert.equal(maxSequenceSixthLive, 23,
      'sequence list A entry 5 allocated all 23 pool records');
    assert.deepEqual(sequenceSixthPeak.map(({ art }) => art), SEQUENCE_A_SIXTH_ART,
      'sequence list A entry 5 preserved every ordered art pointer and repetition');
    assert.deepEqual(sequenceSixthPeak.map(({ position }) => position),
      SEQUENCE_A_SIXTH_POSITIONS,
      'sequence list A entry 5 preserved its 11 and 12-record position groups and $400 bumps');
    assert.equal(sequenceSixthSpawnFrames[0] - sequenceFifthBoundaryFrame, 1,
      '$8000 $0000 made the first entry-5 record eligible on the next driver call');
    assert.deepEqual(sequenceSixthSpawnFrames.slice(1).map((at, i) =>
      at - sequenceSixthSpawnFrames[i]), Array(22).fill(1),
      'reload zero emitted all remaining entry-5 records on consecutive driver frames');
    assert.equal(maxSequenceSixthWait, 0x60,
      'sequence list A entry 5 held at its exact $60 wait count');
    assert.ok(sawSequenceSixthResource,
      'entry 5 $8003 operand 0 completed the existing one-node $290E58 lifecycle');
    assert.equal(ram.u32(SCRIPT7.resource), 0,
      'entry 5 freed and cleared its primary resource handle before $FFFF');
    assert.ok(sawSequenceCursor24,
      '$FFFF advanced sequence list A from cursor 20 to cursor 24');
    assert.ok(sawSequenceSixthPoolClear,
      'the sequence driver cleared all 23 entry-5 pool records at cursor 24');
    assert.ok(sequenceSixthBoundaryFrame > sequenceFifthBoundaryFrame,
      'entry 5 reached entry 6 after running');
    assert.equal(maxSequenceSeventhLive, 9,
      'sequence list A entry 6 allocated all nine pool records');
    assert.deepEqual(sequenceSeventhPeak.map(({ art }) => art), SEQUENCE_A_SEVENTH_ART,
      'sequence list A entry 6 preserved every ordered art pointer');
    assert.deepEqual(sequenceSeventhPeak.map(({ position }) => position),
      SEQUENCE_A_SEVENTH_POSITIONS,
      'sequence list A entry 6 preserved its nine-record position group and $400 bumps');
    assert.equal(sequenceSeventhSpawnFrames[0] - sequenceSixthBoundaryFrame, 1,
      '$8000 $0000 made the first entry-6 record eligible on the next driver call');
    assert.deepEqual(sequenceSeventhSpawnFrames.slice(1).map((at, i) =>
      at - sequenceSeventhSpawnFrames[i]), Array(8).fill(1),
      'reload zero emitted all remaining entry-6 records on consecutive driver frames');
    assert.equal(maxSequenceSeventhWait, 0x60,
      'sequence list A entry 6 held at its exact $60 wait count');
    assert.ok(sawSequenceSeventhResource,
      'entry 6 $8003 operand 0 completed the existing one-node $290E58 lifecycle');
    assert.equal(auxStateAtSeventhStart, 0,
      'the earlier two-phase auxiliary resource was idle before entry 6 began');
    assert.equal(auxStateAtSeventhBoundary, 0,
      'entry 6 left the completed auxiliary resource idle');
    assert.equal(auxHandleAtSeventhBoundary, auxHandleAtSeventhStart,
      'entry 6 left the cached freed auxiliary handle unchanged');
    assert.equal(primaryHandleAtSeventhStart, 0,
      'entry 5 cleared its primary resource handle before entry 6 began');
    assert.equal(primaryHandleAtSeventhBoundary, 0,
      'entry 6 freed and cleared its primary resource handle before $FFFF');
    assert.ok(sawSequenceCursor28,
      '$FFFF advanced sequence list A from cursor 24 to cursor 28');
    assert.ok(sawSequenceSeventhPoolClear,
      'the sequence driver cleared all nine entry-6 pool records at cursor 28');
    assert.ok(sequenceSeventhBoundaryFrame > sequenceSixthBoundaryFrame,
      'entry 6 reached its next concrete script boundary after running');
    assert.equal(maxSequenceEighthLive, 38,
      'sequence list A entry 7 allocated all 38 pool records');
    assert.deepEqual(sequenceEighthPeak.map(({ art }) => art), SEQUENCE_A_EIGHTH_ART,
      'sequence list A entry 7 preserved every ordered art pointer and repetition');
    assert.deepEqual(sequenceEighthPeak.map(({ position }) => position),
      SEQUENCE_A_EIGHTH_POSITIONS,
      'sequence list A entry 7 preserved its 11, 9, 6, and 12-record position groups');
    assert.equal(sequenceEighthSpawnFrames[0] - sequenceEighthStartFrame, 1,
      '$8000 $0000 made the first entry-7 record eligible on the next driver call');
    assert.deepEqual(sequenceEighthSpawnFrames.slice(1).map((at, i) =>
      at - sequenceEighthSpawnFrames[i]), [
      ...Array(25).fill(1), ...Array(12).fill(3),
    ], 'the first 26 records used zero cadence before $0202 spaced the final 12 by three frames');
    assert.equal(maxSequenceEighthWait, 0xc0,
      'sequence list A entry 7 held at its exact $C0 wait count');
    assert.ok(sawSequenceEighthResource,
      'entry 7 $8003 operand 3 completed W372\'s existing one-node primary lifecycle');
    assert.equal(eighthPrimaryLoadedFrame - sequenceEighthSpawnFrames.at(-1), 0xc1,
      '$8002 consumed 193 calls after the final spawn before both resources loaded');
    assert.equal(eighthPrimaryMode, 0,
      '$246710 created operand 3\'s primary root in mode 0');
    assert.equal(eighthPrimaryPeakNodes, 1,
      '$290E76 created its exact one-node primary resource chain');
    assert.equal(auxStateAtEighthStart, 0,
      'the auxiliary loader was idle when entry 7 began');
    assert.equal(auxHandleAtEighthStart, auxHandleAtSeventhBoundary,
      'entry 7 began with entry 6\'s cached freed auxiliary handle');
    assert.equal(primaryHandleAtEighthStart, 0,
      'entry 6 cleared its primary resource handle before entry 7 began');
    assert.equal(eighthPrimaryHandle, auxHandleAtEighthStart,
      'operand 3 authentically reused the first free cached allocation slot');
    assert.equal(eighthAuxLoadedFrame, eighthPrimaryLoadedFrame,
      '$8005 armed its first phase on the same call that $8003 loaded the primary resource');
    assert.notEqual(eighthAuxHandle, eighthPrimaryHandle,
      'the auxiliary first phase occupied a distinct animation-object root');
    assert.equal(eighthAuxMode, 0,
      '$246710 created $290D42\'s auxiliary first-phase root in mode 0');
    assert.equal(eighthAuxPeakNodes, 2,
      '$290D42 created its exact two-node first-phase chain');
    assert.deepEqual(eighthAuxTransitions.map(({ auxState }) => auxState), [0, 2, 0],
      'operand $0000 kept banner 0, so state 2 completed without loading a second phase');
    assert.equal(eighthAuxReleasedFrame - eighthAuxLoadedFrame, 32,
      'timing index 3 drained both auxiliary first-phase nodes in exactly 32 animation steps');
    assert.equal(sequenceEighthBoundaryFrame, eighthAuxReleasedFrame,
      'the auxiliary first phase and primary resource both completed at the next-script boundary');
    assert.equal(auxStateAtEighthBoundary, 0,
      'the same-banner auxiliary request returned to idle at the boundary');
    assert.equal(auxHandleAtEighthBoundary, eighthAuxHandle,
      'the loader cached the freed first-phase handle at the boundary');
    assert.equal(primaryHandleAtEighthBoundary, 0,
      'entry 7 freed and cleared its primary resource handle before $FFFF');
    assert.equal(bannerAtEighthBoundary, 0,
      'the same-banner auxiliary request kept banner 0 live');
    assert.equal(nextBannerAtEighthBoundary, 0,
      '$8005 preserved operand 0 as the next banner selector');
    assert.equal(auxIndexAtEighthBoundary, 3,
      '$8005 preserved operand 3 as the auxiliary resource index');
    assert.ok(sawSequenceCursor32,
      '$FFFF advanced sequence list A from cursor 28 to cursor 32');
    assert.ok(sawSequenceEighthPoolClear,
      'the sequence driver cleared all 38 entry-7 pool records at cursor 32');
    assert.ok(sequenceEighthBoundaryFrame > sequenceSeventhBoundaryFrame,
      'entry 7 reached its next concrete script boundary after running');
    assert.equal(maxSequenceNinthLive, 18,
      'sequence list A entry 8 allocated all 18 pool records');
    assert.deepEqual(sequenceNinthPeak.map(({ art }) => art), SEQUENCE_A_NINTH_ART,
      'sequence list A entry 8 preserved every ordered art pointer and repetition');
    assert.deepEqual(sequenceNinthPeak.map(({ position }) => position),
      SEQUENCE_A_NINTH_POSITIONS,
      'sequence list A entry 8 preserved its 8 and 10-record position groups and $400 bumps');
    assert.equal(sequenceNinthSpawnFrames[0] - sequenceNinthStartFrame, 5,
      '$8000 $0404 delayed the first entry-8 record by exactly five driver calls');
    assert.deepEqual(sequenceNinthSpawnFrames.slice(1).map((at, i) =>
      at - sequenceNinthSpawnFrames[i]), [
      ...Array(14).fill(5), ...Array(3).fill(17),
    ], '$0404 spaced the first 15 records by five calls before $1010 spaced the final three by 17');
    assert.equal(maxSequenceNinthWait, 0x60,
      'sequence list A entry 8 held at its exact $60 wait count');
    assert.ok(sawSequenceNinthResource,
      'entry 8 $8003 operand 4 completed W372\'s existing one-node primary lifecycle');
    assert.equal(ninthPrimaryLoadedFrame - sequenceNinthSpawnFrames.at(-1), 0x61,
      '$8002 consumed 97 calls after the final spawn before operand 4 loaded');
    assert.equal(ninthPrimaryMode, 0,
      '$246710 created operand 4\'s primary root in mode 0');
    assert.equal(ninthPrimaryPeakNodes, 1,
      '$290E80 created its exact one-node primary resource chain');
    assert.equal(auxStateAtNinthStart, 0,
      'the auxiliary loader was idle when entry 8 began');
    assert.equal(auxHandleAtNinthStart, auxHandleAtEighthBoundary,
      'entry 8 began with entry 7\'s cached freed auxiliary handle');
    assert.equal(primaryHandleAtNinthStart, 0,
      'entry 7 cleared its primary resource handle before entry 8 began');
    assert.notEqual(ninthPrimaryHandle, 0,
      'operand 4 loaded a concrete animation-object root');
    assert.ok(sawSequenceCursor36,
      '$FFFF advanced sequence list A from cursor 32 to cursor 36');
    assert.ok(sawSequenceNinthPoolClear,
      'the sequence driver cleared all 18 entry-8 pool records at cursor 36');
    assert.ok(sequenceNinthBoundaryFrame > sequenceEighthBoundaryFrame,
      'entry 8 reached list A\'s exact terminator boundary after running');
    assert.equal(auxStateAtNinthBoundary, 0,
      'entry 8 left the auxiliary loader idle');
    assert.equal(auxHandleAtNinthBoundary, auxHandleAtNinthStart,
      'entry 8 left the cached auxiliary handle unchanged');
    assert.equal(primaryHandleAtNinthBoundary, 0,
      'entry 8 freed and cleared its primary resource handle before $FFFF');
    assert.ok(sawListATerminator,
      'list A\'s $FFFFFFFF terminator advanced the type-7 object to outer state 2');
    assert.ok(sawNormalHandoffQueued,
      'outer state 2 queued the existing normal type-$0F handoff before retiring type 7');
    assert.equal(ram.u16(SLOT7.work + SLOT7.innerAt), 1,
      'the complete sequence list leaves the shared work block in inner state 1');
    assert.equal(ram.u16(SLOT7.work + 0x06), 1,
      'the complete sequence list leaves its active sequence sub-state intact');
    assert.equal(ram.u16(SLOT7.work + 0x0c), 36,
      'sequence list A now selects its $FFFFFFFF terminator');
    assert.equal(ram.u16(SCRIPT7.cursor), 0,
      'the final inter-script pool clear reset the shared script cursor');
    assert.deepEqual(livePoolRecords(ram), [],
      'the presentation pool remains clear through the normal handoff boundary');
    assert.ok(nextError instanceof Unreached,
      `the bounded run should stop before slot [15], got ${nextError}`);
    assert.equal(nextError.romAddress, ROM.u32(SE.dispatch + 0x0f * 8),
      'the next executable edge is the already ported slot [15] entry at $291F66');
    const finalTypes = Array.from({ length: OBJ.slots }, (_, i) =>
      ram.u16(OBJ.base + i * OBJ.stride) & 0xff);
    assert.ok(finalTypes.includes(0x0f), 'the normal type-$0F handoff committed');
    assert.ok(!finalTypes.includes(0x07), 'the completed type-7 object retired');
    assert.equal(ram.u16(ALLOC.createSp), 0, 'the type-$0F create queue drained');
    assert.equal(ram.u16(ALLOC.killSp), 0, 'the type-7 kill queue drained');
  });
