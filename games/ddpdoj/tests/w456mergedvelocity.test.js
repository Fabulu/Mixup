// WAVE 456 (D69) -- ONE COMPLETE $2417DE BODY, WITH A6 OWNERSHIP PRESERVED.
//
// The item pool had a private copy of the complete velocity body. This test
// pins the cartridge body and every direct transfer, separates the shorter
// option/player overlaps, and drives dirty A5, A6, item, queue and lifecycle
// state through word wrap and longword carry boundaries.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ITEM, I, ANIM_LISTS, spawnItem, runItemDriver,
} from '../src/items.js';
import {
  MOVER, applyVelocity, applyVelocityA6, stickMove242A48,
} from '../src/movement.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BUCKETS } from '../src/spritequeue.js';
import {
  bodyPairs, headIndex, headRegister, narrowIndex, sources,
} from './w450widenedscan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');
const IMAGE = join(ROOT, 'tools', 'oracle', 'out', 'maincpu.bin');
const TABLES = join(ROOT, 'rip', 'port', 'player.tables.json');
const EXPORT_TABLES = join(ROOT, 'tools', 'export-tables.py');
const HAVE_IMAGE = existsSync(IMAGE);
const HAVE_TABLES = existsSync(TABLES);
const IMG = HAVE_IMAGE ? readFileSync(IMAGE) : null;
const TJ = HAVE_TABLES ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE_TABLES ? new RomWindows(TJ.rom) : null;
const SKIP_IMAGE = HAVE_IMAGE ? false : 'maincpu.bin absent; skip, not pass';
const SKIP_TABLES = HAVE_TABLES ? false : 'player.tables.json absent; skip, not pass';

const IMAGE_SHA256 = '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c';
const BODY_HEX = '7000102e001a723fc22e001b4a79008130d2660c611ed56e0002d76e00044e75740076004e75';
const VECTOR_HEAD_HEX = 'd241d241d040d04047f900200920267300003601d6432f0841fa00884e71d6f03000205f241b261be882e883024100c0e24947fa000a4e714ef310004e71';
const ITEM_CALLERS = Object.freeze([
  [0x27ebba, '4eb9002417de4eb900242684650007284e75'],
  [0x27ed6a, '4eb9002417de4eb900242684650005784e75'],
  [0x27eefe, '4eb9002417de4eb900242684650003e44e75'],
  [0x27f62e, '4eb9002417de532e000c6600001a1d6e000d000c422e000e586e000a0c6e0078000a6c00fc9e4e75'],
  [0x27f686, '4eb9002417de532e000c6600001a1d6e000d000c422e000e586e000a0c6e0044000a6c00fc464e75'],
]);

const DIRECT_TRANSFERS = Object.freeze([
  '242A5E:jmp.pc', '2495CA:jsr.l', '24A40A:jmp.l', '263900:jsr.l',
  '2654A4:jsr.l', '26586E:jsr.l', '265E84:jsr.l', '2663E0:jsr.l',
  '269D7E:jsr.l', '26A132:jsr.l', '26A37A:jsr.l', '26A67C:jsr.l',
  '26A8F8:jsr.l', '26AB24:jsr.l', '26ADC0:jsr.l', '26B0D2:jsr.l',
  '26CA82:jsr.l', '26CAB4:jsr.l', '26D28A:jsr.l', '26DE64:jsr.l',
  '26F87E:jmp.l', '270694:jsr.l', '2721A6:jsr.l', '27EBBA:jsr.l',
  '27ED6A:jsr.l', '27EEFE:jsr.l', '27F62E:jsr.l', '27F686:jsr.l',
  '293244:jsr.l', '29345A:jsr.l', '2934EE:jsr.l', '293530:jsr.l',
  '2935D4:jsr.l', '29362A:jsr.l', '29366C:jsr.l', '293700:jsr.l',
  '296B00:jsr.l', '296E28:jsr.l', '29701C:jsr.l', '297B6E:jsr.l',
  '297C4E:jsr.l', '297CB8:jsr.l', '297D2C:jsr.l', '297E08:jsr.l',
  '297E42:jsr.l', '29B848:jsr.l', '29BA18:jsr.l', '29BB80:jsr.l',
  '29C39A:jsr.l', '29C3AC:jsr.l', '29C41A:jsr.l', '29C488:jsr.l',
  '29F510:jsr.l', '2A3884:jsr.l', '2A4FF4:jsr.l', '2A506C:jsr.l',
  '2A50DC:jsr.l', '2A50F2:jsr.l', '2A516E:jsr.l', '2A51EA:jsr.l',
  '2A5262:jsr.l', '2A52D4:jsr.l', '2A5340:jsr.l', '2A53B2:jsr.l',
  '2A542E:jsr.l',
]);

const B17 = BUCKETS[17];
const u16 = (v) => v & 0xffff;

function bytes(at, count) { return IMG.subarray(at, at + count); }
function shortTarget(at) {
  const d = IMG[at + 1];
  return at + 2 + ((d & 0x80) ? d - 0x100 : d);
}
function wideTarget(extensionAt) {
  return extensionAt + IMG.readInt16BE(extensionAt);
}
function snapshot(ram, base, len) {
  return Buffer.from(Array.from({ length: len }, (_, n) => ram.u8(base + n)));
}
function fillBytes(ram, base, len, salt) {
  for (let n = 0; n < len; n++) ram.setU8(base + n, (salt + n * 37) & 0xff);
}
function assertBytesExcept(ram, base, before, changed, label) {
  for (let n = 0; n < before.length; n++) {
    if (changed.has(n)) continue;
    assert.equal(ram.u8(base + n), before[n], `${label}: residue +$${n.toString(16)}`);
  }
}
function vectorTables(dy, dx, calls = []) {
  return {
    vector(speed, heading) {
      calls.push([speed, heading]);
      return { dy, dx };
    },
  };
}
function seedQueue(ram, salt = 0x59) {
  fillBytes(ram, B17.buffer, 24, salt);
  ram.setU16(B17.counter, 0);
  return snapshot(ram, B17.buffer, 24);
}
function expectedCoords(d1) {
  const packed = (d1 | 0) >> 6;
  const d0 = ((packed & 0x07ff03ff) | 0x80008000) >>> 0;
  return [(d0 >>> 16) & 0xffff, d0 & 0xffff];
}
function seedLiveItem(ram, kind, pos, speed = 0x55, heading = 0xbd) {
  const at = ITEM.base;
  fillBytes(ram, at - 4, ITEM.stride + 8, 0x43 + kind);
  ram.setU16(at + I.status, 0xa000 | kind);
  ram.setU32(at + I.pos, pos);
  ram.setU16(at + I.frame, 0x0507);
  ram.setU16(at + I.anim, 0);
  ram.setU16(at + I.life, 0x4567);
  ram.setU8(at + I.speed, speed);
  ram.setU8(at + I.angle, heading);
  ram.setU16(ITEM.count, 1);
  ram.setU16(ITEM.scroll, 0);
  ram.setU8(ITEM.pause30f8, 0x40);
  return at;
}

function scanVelocityTransfers() {
  const out = [];
  for (let at = 0x230000; at < 0x2b0000; at += 2) {
    const opcode = IMG.readUInt16BE(at);
    let target = null;
    let kind = null;
    if (opcode === 0x4eb9 || opcode === 0x4ef9) {
      target = IMG.readUInt32BE(at + 2);
      kind = opcode === 0x4eb9 ? 'jsr.l' : 'jmp.l';
    } else if (opcode === 0x4eba || opcode === 0x4efa) {
      target = at + 2 + IMG.readInt16BE(at + 2);
      kind = opcode === 0x4eba ? 'jsr.pc' : 'jmp.pc';
    } else if ((opcode & 0xff00) === 0x6100) {
      const low = opcode & 0xff;
      const displacement = low === 0 ? IMG.readInt16BE(at + 2)
        : ((low & 0x80) ? low - 0x100 : low);
      target = at + 2 + displacement;
      kind = 'bsr';
    }
    if (target === 0x2417de) out.push(`${at.toString(16).toUpperCase()}:${kind}`);
  }
  return out;
}

function nameCensus(name) {
  const out = {};
  for (const [file, source] of sources()) {
    const count = [...source.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))].length;
    if (count) out[file] = count;
  }
  return out;
}

// ---------------------------------------------------------------- SECTION 1

test('SECTION 1: exact $2417DE body, vector head and five item callers match the cartridge',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(createHash('sha256').update(IMG).digest('hex'), IMAGE_SHA256);
    assert.deepEqual(bytes(0x2417de, 0x26), Buffer.from(BODY_HEX, 'hex'));
    assert.deepEqual(bytes(0x241812, 0x3e), Buffer.from(VECTOR_HEAD_HEX, 'hex'));
    for (const [at, hex] of ITEM_CALLERS) {
      assert.deepEqual(bytes(at, hex.length / 2), Buffer.from(hex, 'hex'),
        `$${at.toString(16).toUpperCase()} complete caller continuation`);
    }
  });

test('SECTION 1b: register ownership, branches, vector lookup and every item-tail swap decode',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(IMG.readUInt16BE(0x2417de), 0x7000, 'MOVEQ #0 owns all of D0');
    assert.equal(IMG.readUInt32BE(0x2417e0), 0x102e001a, 'MOVE.B A6+$1A supplies speed');
    assert.equal(IMG.readUInt16BE(0x2417e4), 0x723f, 'MOVEQ #$3F owns all of D1');
    assert.equal(IMG.readUInt32BE(0x2417e6), 0xc22e001b, 'AND.B A6+$1B masks heading');
    assert.equal(IMG.readUInt16BE(0x2417ea), 0x4a79, 'TST.W absolute-long freeze gate');
    assert.equal(IMG.readUInt32BE(0x2417ec), ITEM.freeze, 'exact freeze word owner');
    assert.equal(shortTarget(0x2417f0), 0x2417fe, 'BNE enters zero D2/D3 suffix');
    assert.equal(shortTarget(0x2417f2), 0x241812, 'BSR enters movement vector body');
    assert.equal(IMG.readUInt32BE(0x2417f4), 0xd56e0002, 'ADD.W D2 to A6+$02');
    assert.equal(IMG.readUInt32BE(0x2417f8), 0xd76e0004, 'ADD.W D3 to A6+$04');
    assert.equal(IMG.readUInt16BE(0x2417fc), 0x4e75, 'live continuation returns with D2/D3');
    assert.deepEqual([...bytes(0x2417fe, 6)], [0x74, 0, 0x76, 0, 0x4e, 0x75],
      'frozen continuation clears D2 then D3 and returns');

    assert.deepEqual([0x241812, 0x241814, 0x241816, 0x241818].map((a) => IMG.readUInt16BE(a)),
      [0xd241, 0xd241, 0xd040, 0xd040], 'word doubles form heading*4 and speed*4');
    assert.equal(IMG.readUInt32BE(0x24181c), 0x00200920, 'A3 owns the speed pointer table');
    assert.equal(IMG.readUInt32BE(0x241820), 0x26730000,
      'MOVEA.L (A3,D0.W),A3 uses the signed word index after byte-zero extension');
    assert.deepEqual([0x241828, 0x24182a, 0x241830, 0x241834].map((a) => IMG.readUInt16BE(a)),
      [0x2f08, 0x41fa, 0xd6f0, 0x205f],
      'A0 is saved, owns the fold table, adjusts A3, then is restored');
    assert.deepEqual([0x241836, 0x241838, 0x24183a, 0x24183c].map((a) => IMG.readUInt16BE(a)),
      [0x241b, 0x261b, 0xe882, 0xe883],
      'two MOVE.L table values become arithmetic-shifted D2 and D3');
    assert.deepEqual([IMG.readUInt16BE(0x241870), IMG.readUInt16BE(0x241890),
      IMG.readUInt16BE(0x241892), IMG.readUInt16BE(0x2418b0)],
    [0x4442, 0x4442, 0x4443, 0x4443], 'quadrants negate words only after ASR.L');

    assert.deepEqual(bytes(0x242684, 0x20), Buffer.from(
      '202e000206401c00d0790081317206409000650a484006400800064080004e75', 'hex'));
    assert.equal(IMG.readUInt16BE(0x242684), 0x202e, 'off-screen continuation reads position as MOVE.L');
    assert.equal(IMG.readUInt16BE(0x242698), 0x4840,
      'its sole SWAP moves A6+$02 from the high half into D0.W');
    assert.equal(shortTarget(0x242696), 0x2426a2, 'short-axis carry returns off-screen before SWAP');
  });

// ---------------------------------------------------------------- SECTION 2

test('SECTION 2: all 65 direct cartridge transfers are pinned and separated by convention',
  { skip: SKIP_IMAGE }, () => {
    const got = scanVelocityTransfers();
    assert.deepEqual(got, DIRECT_TRANSFERS);
    assert.equal(got.filter((x) => x.endsWith(':jsr.l')).length, 62);
    assert.equal(got.filter((x) => x.endsWith(':jmp.l')).length, 2);
    assert.equal(got.filter((x) => x.endsWith(':jmp.pc')).length, 1);
    assert.deepEqual(got.filter((x) => /^27(?:EBBA|ED6A|EEFE|F62E|F686):/.test(x)),
      ['27EBBA:jsr.l', '27ED6A:jsr.l', '27EEFE:jsr.l', '27F62E:jsr.l', '27F686:jsr.l']);
  });

test('SECTION 2b: option and player overlaps have different entries or caller continuations',
  { skip: SKIP_IMAGE }, () => {
    assert.deepEqual(bytes(0x2417d4, 0x30), Buffer.from(
      '4a79008130d2671660207000102e001a723fc22e001b4a79008130d2660c611ed56e0002d76e00044e75740076004e75', 'hex'));
    assert.equal(IMG.readUInt16BE(0x24d216), 0x4cb0, 'option settle loads D0-D1 as words');
    assert.equal(IMG.readUInt16BE(0x24d218), 0x0003, 'MOVEM mask owns exactly D0-D1');
    assert.equal(IMG.readUInt16BE(0x24d21c), 0x4eb9, 'option calls the earlier $2417D4 entry');
    assert.equal(IMG.readUInt32BE(0x24d21e), 0x2417d4,
      'option does not reread A6+$1A/$1B through $2417DE');
    assert.deepEqual([0x24d1d2, 0x24d1de, 0x24d254, 0x24d260].map((a) => IMG.readUInt16BE(a)),
      [0x4841, 0x4841, 0x4841, 0x4841], 'both option arms retain both SWAP D1 operations');
    assert.deepEqual([0x24d1c4, 0x24d1e0, 0x24d246, 0x24d262].map((a) => IMG.readUInt16BE(a)),
      [0x222e, 0x0681, 0x222e, 0x0681],
      'option shadow continuation uses MOVE.L and ADDI.L, not velocity word adds');

    assert.deepEqual(bytes(0x2495ca, 0x16), Buffer.from(
      '4eb9002417de3d4200303d4300323d43005c4cae000c', 'hex'));
    assert.equal(IMG.readUInt16BE(0x2495d0), 0x3d42, 'player stores returned D2 at +$30');
    assert.equal(IMG.readUInt16BE(0x2495d4), 0x3d43, 'player stores returned D3 at +$32');
    assert.equal(IMG.readUInt16BE(0x2495d8), 0x3d43, 'player also stores D3 at +$5C');
    assert.deepEqual(bytes(0x24a404, 12), Buffer.from('3d7c3000001a4ef9002417de', 'hex'),
      'stage-clear writes speed/heading as one word then tail-jumps with A6');

    assert.equal(IMG.readUInt16BE(0x27f602), 0x222e, 'collected path MOVE.L reads packed position');
    assert.equal(IMG.readUInt16BE(0x27f606), 0xd298, 'ADD.L header propagates low-half carry');
    assert.equal(IMG.readUInt16BE(0x27f65a), 0x222e, 'at-max arm repeats the MOVE.L');
    assert.equal(IMG.readUInt16BE(0x27f65e), 0xd298, 'at-max arm repeats the ADD.L');
  });

// ---------------------------------------------------------------- SECTION 3

test('SECTION 3: raw A6 helper preserves dirty residue across word signs, wraps and freeze', () => {
  const cases = [
    { name: 'sign crossing', pos: 0x7ff08005, dy: 0x20, dx: -0x10, want: 0x80107ff5 },
    { name: 'low-half carry cannot reach high half', pos: 0x1234fff0, dy: 1, dx: 0x30,
      want: 0x12350020 },
    { name: 'high-half wrap', pos: 0xfff01234, dy: 0x30, dx: -0x40, want: 0x002011f4 },
  ];
  for (let index = 0; index < cases.length; index++) {
    const c = cases[index];
    const ram = new Ram();
    const a6 = 0x810900;
    fillBytes(ram, a6 - 4, 0x48, 0x31 + index * 0x23);
    ram.setU32(a6 + 2, c.pos);
    ram.setU8(a6 + 0x1a, 0xe1 + index);
    ram.setU8(a6 + 0x1b, 0xfc + index);
    ram.setU16(ITEM.freeze, 0);
    const before = snapshot(ram, a6, 0x40);
    const calls = [];
    const v = applyVelocityA6(ram, vectorTables(c.dy, c.dx, calls), a6);
    assert.deepEqual(v, { dy: c.dy, dx: c.dx }, `${c.name}: D2/D3 result`);
    assert.deepEqual(calls, [[0xe1 + index, (0xfc + index) & 0x3f]],
      `${c.name}: byte speed and masked byte heading`);
    assert.equal(ram.u32(a6 + 2), c.want >>> 0, `${c.name}: two independent ADD.W results`);
    assertBytesExcept(ram, a6, before, new Set([2, 3, 4, 5]), c.name);
  }

  const frozen = new Ram();
  const a6 = 0x810b00;
  fillBytes(frozen, a6 - 4, 0x48, 0xa7);
  frozen.setU32(a6 + 2, 0xfff0fff0);
  frozen.setU16(ITEM.freeze, 1);
  const before = snapshot(frozen, a6 - 4, 0x48);
  const result = applyVelocityA6(frozen, {
    vector() { assert.fail('frozen body must branch before vector lookup'); },
  }, a6);
  assert.deepEqual(result, { dy: 0, dx: 0 });
  assert.deepEqual(snapshot(frozen, a6 - 4, 0x48), before,
    'frozen branch preserves owned and unowned dirty bytes exactly');
});

test('SECTION 3b: A5 wrapper follows +$06 while raw stick caller keeps explicit A6', () => {
  const ram = new Ram();
  const a5 = 0x810700;
  const live = 0x810800;
  const decoy = 0x810880;
  fillBytes(ram, a5, 0x50, 0x19);
  fillBytes(ram, live, 0x40, 0x41);
  fillBytes(ram, decoy, 0x40, 0x81);
  ram.setU32(a5 + MOVER.subRec, live);
  ram.setU32(live + 2, 0x0010fff0);
  ram.setU8(live + 0x1a, 0xe3);
  ram.setU8(live + 0x1b, 0xfd);
  ram.setU16(ITEM.freeze, 0);
  const beforeA5 = snapshot(ram, a5, 0x50);
  const beforeLive = snapshot(ram, live, 0x40);
  const beforeDecoy = snapshot(ram, decoy, 0x40);
  const calls = [];
  assert.deepEqual(applyVelocity(ram, vectorTables(-0x20, 0x30, calls), a5),
    { dy: -0x20, dx: 0x30 });
  assert.deepEqual(calls, [[0xe3, 0x3d]]);
  assert.equal(ram.u32(live + 2), 0xfff00020);
  assert.deepEqual(snapshot(ram, a5, 0x50), beforeA5, 'A5 and its pointer are read-only');
  assert.deepEqual(snapshot(ram, decoy, 0x40), beforeDecoy, 'decoy A6 is untouched');
  assertBytesExcept(ram, live, beforeLive, new Set([2, 3, 4, 5]), 'A5 wrapper live A6');

  const stick = new Ram();
  const a6 = 0x810a00;
  fillBytes(stick, a6, 0x40, 0xb3);
  stick.setU32(a6 + 2, 0xfff0fff0);
  stick.setU8(a6 + 0x1a, 0x27);
  stick.setU16(0x803976, 1);
  stick.setU16(ITEM.freeze, 0);
  const stickCalls = [];
  assert.deepEqual(stickMove242A48(stick, vectorTables(0x30, -0x20, stickCalls), a6),
    { dy: 0x30, dx: -0x20 });
  assert.equal(stick.u8(a6 + 0x1b), 0, 'held-up table entry is stored before tail jump');
  assert.equal(stick.u32(a6 + 2), 0x0020ffd0);
  assert.deepEqual(stickCalls, [[0x27, 0]]);

  const refusedBefore = snapshot(stick, a6, 0x40);
  stick.setU16(0x803976, 3);
  const refused = stickMove242A48(stick, {
    vector() { assert.fail('opposite directions must not enter $2417DE'); },
  }, a6);
  assert.deepEqual(refused, { dy: 0, dx: 0 });
  assert.equal(stick.u8(a6 + 0x1b), 0x40, 'refusal arm writes heading $40');
  assertBytesExcept(stick, a6, refusedBefore, new Set([0x1b]), 'stick refusal residue');
});

// ---------------------------------------------------------------- SECTION 4

test('SECTION 4: allocator-reused kind $00 wraps both words, emits, and preserves its dirty tail',
  { skip: SKIP_TABLES }, () => {
    const ram = new Ram();
    const at = ITEM.base;
    const dying = 0x810300;
    fillBytes(ram, at - 4, ITEM.stride + 8, 0x6d);
    ram.setU16(at, 0);
    const dirtyTail = snapshot(ram, at + 0x20, 0x20);
    const lower = snapshot(ram, at - 4, 4);
    const upper = snapshot(ram, at + ITEM.stride, 4);
    fillBytes(ram, dying, 0x30, 0x91);
    ram.setU32(dying + 2, 0xfff0fff0);
    ram.setU16(ITEM.count, 0);
    ram.setU16(ITEM.scroll, 0);
    ram.setU8(ITEM.pause30f8, 0x40);
    ram.setU16(ITEM.freeze, 0);
    const calls = [];
    const queueBefore = seedQueue(ram);
    const ctx = { tables: vectorTables(0x30, 0x30, calls) };

    assert.equal(spawnItem(ram, ROM, ctx, 0, dying), at, 'allocator selects the dirty free slot');
    assert.deepEqual(snapshot(ram, at + 0x20, 0x20), dirtyTail,
      'the 32-byte fill leaves recycled +$20..+$3F intact');
    const trace = runItemDriver(ram, ROM, ctx);
    assert.deepEqual(trace, { live: 1, emitted: 1, freed: 0, collected: 0, walked: 1 });
    assert.equal(ram.u16(at + I.status), 0xa000, 'init bit latches and slot remains live');
    assert.equal(ram.u32(at + I.pos), 0x00200020, 'both independent position words wrap');
    assert.equal(ram.u16(at + I.frame), 0x0102, 'caller resumes into animation countdown');
    assert.equal(ram.u16(ITEM.count), 1);
    assert.deepEqual(calls, [[ram.u8(at + I.speed), ram.u8(at + I.angle) & 0x3f]]);
    assert.deepEqual(snapshot(ram, at + 0x20, 0x20), dirtyTail, 'dirty tail survives the full frame');
    assert.deepEqual(snapshot(ram, at - 4, 4), lower, 'lower allocator sentinel survives');
    assert.deepEqual(snapshot(ram, at + ITEM.stride, 4), upper, 'upper allocator sentinel survives');

    const d1 = ((u16(0x20 - 0x600) << 16) | u16(0x20 - 0x300)) >>> 0;
    assert.deepEqual([ram.u16(B17.buffer), ram.u16(B17.buffer + 2)], expectedCoords(d1),
      'external queue sees the moved and biased packed position');
    assert.equal(ram.u16(B17.counter), 12, 'one 12-byte draw request is externally queued');
    assert.deepEqual(snapshot(ram, B17.buffer + 12, 12), queueBefore.subarray(12),
      'queue residue after the owned record survives');
  });

test('SECTION 4b: kind $04 off-screen free and frozen kind $08 take opposite lifecycle arms',
  { skip: SKIP_TABLES }, () => {
    const freed = new Ram();
    const at4 = seedLiveItem(freed, 0x04, 0x220053f0);
    freed.setU16(ITEM.freeze, 0);
    const before4 = snapshot(freed, at4, ITEM.stride);
    const queue4 = seedQueue(freed, 0x71);
    const trace4 = runItemDriver(freed, ROM,
      { tables: vectorTables(-0x30, 0x20) });
    assert.deepEqual(trace4, { live: 1, emitted: 0, freed: 1, collected: 0, walked: 1 });
    assert.equal(freed.u32(at4), 0, 'free clears status and moved long-axis word as one LONG');
    assert.equal(freed.u16(at4 + I.posX), 0x5410,
      'short-axis ADD.W remains externally visible beyond the LONG clear');
    assert.equal(freed.u16(ITEM.count), 0, 'lifecycle continuation decrements live count');
    assert.equal(freed.u16(B17.counter), 0, 'off-screen record emits nothing');
    assert.deepEqual(snapshot(freed, B17.buffer, 24), queue4, 'dirty queue remains untouched');
    assertBytesExcept(freed, at4, before4, new Set([0, 1, 2, 3, 4, 5]),
      'kind $04 free ownership');

    const frozen = new Ram();
    const at8 = seedLiveItem(frozen, 0x08, 0x33002000);
    frozen.setU16(ITEM.freeze, 1);
    const before8 = snapshot(frozen, at8, ITEM.stride);
    seedQueue(frozen, 0x83);
    const trace8 = runItemDriver(frozen, ROM, { tables: {
      vector() { assert.fail('frozen kind $08 must not look up a vector'); },
    } });
    assert.deepEqual(trace8, { live: 1, emitted: 1, freed: 0, collected: 0, walked: 1 });
    assert.equal(frozen.u32(at8 + I.pos), 0x33002000, 'frozen position is byte-exact');
    assert.equal(frozen.u16(at8 + I.status), 0xa008, 'opposite lifecycle remains allocated');
    assert.equal(frozen.u8(at8 + I.frame), 4, 'caller continuation still advances animation');
    assert.equal(frozen.u16(B17.counter), 12, 'frozen live item still draws');
    assertBytesExcept(frozen, at8, before8, new Set([I.frame]), 'frozen kind $08 residue');
  });

// ---------------------------------------------------------------- SECTION 5

test('SECTION 5: normal and at-max collected arms expose ADD.L carry and no-carry before word motion',
  { skip: SKIP_TABLES }, () => {
    const cases = [
      {
        name: 'normal carry', status: 0x8001, list: ANIM_LISTS.a27F300,
        pos: 0x12342000, dy: -0x40, dx: 0x30, carry: true,
      },
      {
        name: 'at-max no carry', status: 0x8080, list: ANIM_LISTS.max27F500,
        pos: 0x20000100, dy: 0x30, dx: -0x20, carry: false,
      },
    ];
    for (let index = 0; index < cases.length; index++) {
      const c = cases[index];
      const ram = new Ram();
      const at = ITEM.base;
      fillBytes(ram, at - 4, ITEM.stride + 8, 0x95 + index * 0x17);
      ram.setU16(at + I.status, c.status);
      ram.setU32(at + I.pos, c.pos);
      ram.setU32(at + I.list, c.list);
      ram.setU16(at + I.cursor, 0);
      ram.setU16(at + I.frame, 0x0307);
      ram.setU16(at + I.anim, 0);
      ram.setU8(at + I.speed, 0xa1 + index);
      ram.setU8(at + I.angle, 0xfe - index);
      ram.setU16(ITEM.count, 1);
      ram.setU16(ITEM.scroll, 0);
      ram.setU16(ITEM.freeze, 0);
      const before = snapshot(ram, at, ITEM.stride);
      const tail = snapshot(ram, at + 0x20, 0x20);
      const queueBefore = seedQueue(ram, 0xa3 + index * 0x11);
      const header = ROM.u32(c.list);
      const lowCarry = (c.pos & 0xffff) + (header & 0xffff) > 0xffff;
      assert.equal(lowCarry, c.carry, `${c.name}: fixture reaches intended ADD.L arm`);
      const drawPos = (c.pos + header) >>> 0;
      const calls = [];

      const trace = runItemDriver(ram, ROM,
        { tables: vectorTables(c.dy, c.dx, calls) });
      assert.deepEqual(trace, { live: 1, emitted: 0, freed: 0, collected: 1, walked: 1 });
      const wantY = u16((c.pos >>> 16) + c.dy);
      const wantX = u16((c.pos & 0xffff) + c.dx);
      assert.equal(ram.u32(at + I.pos), (((wantY << 16) >>> 0) | wantX) >>> 0,
        `${c.name}: later velocity uses two word adds, not the header's ADD.L rule`);
      assert.deepEqual(calls, [[0xa1 + index, (0xfe - index) & 0x3f]]);
      assert.equal(ram.u8(at + I.frame), 2, `${c.name}: caller continuation decrements frame`);
      assert.equal(ram.u16(at + I.cursor), 0, `${c.name}: no premature list advance`);
      assert.equal(ram.u16(at + I.status), c.status, `${c.name}: lifecycle arm remains distinct`);
      assert.equal(ram.u16(B17.counter), 12);
      assert.deepEqual([ram.u16(B17.buffer), ram.u16(B17.buffer + 2)], expectedCoords(drawPos),
        `${c.name}: queue witnesses the full 32-bit header sum`);
      assert.equal(ram.u32(B17.buffer + 4), ROM.u32(c.list + 8), `${c.name}: sprite continuation`);
      assert.equal(ram.u16(B17.buffer + 8), ROM.u16(c.list + 4), `${c.name}: size continuation`);
      assert.equal(ram.u16(B17.buffer + 10), 0x001d, `${c.name}: draw flags continuation`);
      assert.deepEqual(snapshot(ram, B17.buffer + 12, 12), queueBefore.subarray(12));
      assert.deepEqual(snapshot(ram, at + 0x20, 0x20), tail, `${c.name}: recycled tail survives`);
      assertBytesExcept(ram, at, before, new Set([2, 3, 4, 5, I.frame]),
        `${c.name}: item ownership`);
    }
  });

// ---------------------------------------------------------------- SECTION 6

test('SECTION 6: source census has one implementation and preserves every A5/A6 convention', () => {
  assert.deepEqual(nameCensus('applyVelocityA6'), {
    'handlers.js': 2,
    'items.js': 2,
    'movement.js': 3,
  }, 'raw calls are two handlers, two reusable item paths, wrapper, stick and declaration');
  assert.deepEqual(nameCensus('applyVelocity'), {
    'boss2.js': 3,
    'boss3.js': 4,
    'boss4.js': 1,
    'bossarrival.js': 1,
    'bossf23.js': 4,
    'bossphase.js': 2,
    'bossscripts.js': 2,
    'handlers.js': 7,
    'movement.js': 2,
    'stage3carrier.js': 3,
    'stage3drop.js': 2,
    'stage4type41.js': 1,
  }, 'all 31 A5-wrapper production calls plus its declaration are pinned by file');
  assert.deepEqual(nameCensus('applyItemVelocity'), {}, 'private item body cannot regrow');

  const items = readFileSync(join(SRC, 'items.js'), 'utf8');
  const movement = readFileSync(join(SRC, 'movement.js'), 'utf8');
  const options = readFileSync(join(SRC, 'options.js'), 'utf8');
  const player = readFileSync(join(SRC, 'player.js'), 'utf8');
  assert.match(items, /applyVelocityA6\(ram, ctx\.tables, a6\);\s*\/\/ \$27EBBA/);
  assert.match(items, /applyVelocityA6\(ram, ctx\.tables, a6\);\s*\/\/ \$27F62E/);
  assert.match(movement,
    /applyVelocityA6\(ram, tables, ram\.u32\(a5 \+ MOVER\.subRec\)\)/,
    'A5 wrapper alone follows the +$06 pointer');
  assert.match(options, /const spd = rom\.u16[\s\S]*ctx\.tables\.vector\(spd, ang\)/,
    '$2417D4 option suffix retains explicit word D0/D1 ownership');
  assert.match(player, /function applyPlayerVector2417DE[\s\S]*ctx\.tables\.vector/,
    'player-specific suffix remains independently visible');
  assert.match(player, /\$2495CA jsr \$2417DE[\s\S]*ram\.setU16\(rec \+ P\.lastVelX/,
    'player update retains its caller-specific D2/D3 continuation');
});

test('SECTION 6b: registers reconcile through W469 to 16 narrow, 76 widened, 27 pairs and 22 body-only', () => {
  const narrow = [...narrowIndex()].filter(([, claims]) => claims.size > 1);
  const heads = headRegister();
  const pairs = bodyPairs();
  const headVisibleRemoved = [
    'items.js applyItemVelocity <> movement.js applyVelocityA6',
    'items.js applyItemVelocity <> player.js applyPlayerVector2417DE',
    'tallyscreen.js cursorsFromPosted25D9E6 <> tallyscreen.js mapSavedCursor25D9E6',
    'tallyscreen.js loadSavedCursor25DA60 <> tallyscreen.js restoreCursors25DA60',
    'player.js armRequest25FF38 <> tallyscreen.js tallyRequest25FF38',
    'initbody.js rankByte242E24 <> rng.js drawByte242E24',
  ];
  const bodyOnlyRemoved = [
    'items.js applyItemVelocity <> options.js podKnockback24D188',
    'items.js applyItemVelocity <> player.js updatePlayer',
  ];
  assert.equal(narrow.length, 16, 'W459 removes the exported $25FF38 duplicate');
  assert.equal(heads.length, 76, 'W463 removes $28C0FC to leave 83; W464 removes $28E7A2 to leave 82; W465 removes $28C6C6 to leave 81; W466 removes $28F4C4/$28F666 to leave 79; W467 removes $285A12 to leave 78; W468 removes $2A6EDC to leave 77; W469 removes $23C622 to leave 76');
  assert.equal(pairs.length, 27, 'W461 removes one edge from W460 baseline 28');
  const visibleHeads = new Set();
  for (const [, claims] of headIndex().idx) {
    if (claims.size < 2) continue;
    for (const key of claims.keys()) visibleHeads.add(key.replace(/:\d+ /, ' '));
  }
  const bodyOnly = pairs.filter(([pair]) => pair.split(' <> ')
    .some((body) => !visibleHeads.has(body)));
  assert.equal(bodyOnly.length, 22,
    'headIndex() derives 22 after W456; W457 through W469 remove only head-visible rows or non-pair heads, so it remains 22');
  for (const removed of [...headVisibleRemoved, ...bodyOnlyRemoved]) {
    assert.ok(!pairs.some(([pair]) => pair === removed), `${removed} stays absent`);
  }
  assert.deepEqual(pairs.filter(([pair]) => /(?:applyVelocityA6|podKnockback24D188|applyPlayerVector2417DE|updatePlayer)/.test(pair)), [
    ['movement.js applyVelocityA6 <> options.js podKnockback24D188', [0x2417f2, 0x2417f4, 0x2417f8]],
    ['movement.js applyVelocityA6 <> player.js applyPlayerVector2417DE', [0x2417ea, 0x2417f4, 0x2417f8]],
    ['movement.js applyVelocityA6 <> player.js updatePlayer', [0x2417f4, 0x2417f8]],
    ['options.js podKnockback24D188 <> player.js applyPlayerVector2417DE', [0x2417f4, 0x2417f8]],
    ['options.js podKnockback24D188 <> player.js updatePlayer', [0x2417f4, 0x2417f8]],
    ['player.js applyPlayerVector2417DE <> player.js updatePlayer', [0x2417f4, 0x2417f8]],
  ], 'all six unaudited shorter-tail edges remain registered');
});

// ---------------------------------------------------------------- SECTION 7

test('SECTION 7: executable proof adds no production ROM window', { skip: SKIP_TABLES }, () => {
  for (const address of [0x2417d4, 0x2417de, 0x241812, 0x242684, 0x27ebba,
    0x27ed6a, 0x27eefe, 0x27f5f4, 0x27f656]) {
    assert.equal(ROM.windows.some((w) => address >= w.base && address < w.base + w.len), false,
      `$${address.toString(16).toUpperCase()} remains outside production ROM windows`);
  }
  const exporter = readFileSync(EXPORT_TABLES, 'utf8').toLowerCase();
  assert.doesNotMatch(exporter, /0x2417(?:d4|de)|0x27(?:ebba|ed6a|eefe|f5f4|f656)/,
    'focused raw-image evidence did not widen export-tables.py');
});
