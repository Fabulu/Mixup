// WAVE 455 (D69) -- MERGE THE BEAM RESET'S SHARED CARTRIDGE TAIL.
//
// The full entries at $25270C/$252754 add one ANDI.W before entering the same
// $252714/$25275C setup and the single $25279A..$2527BC wipe. This regression
// pins every byte, decodes both side conventions, and drives dirty recycled
// segment pools through the full item path and the inner release path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITEM, I, POWER, runItemDriver } from '../src/items.js';
import { BEAM, SEG, wipeSegmentPool } from '../src/laser.js';
import { OPT, P, RAM } from '../src/machine.js';
import { runOptionObject } from '../src/options.js';
import { ProtLatch } from '../src/protsim.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog, Unreached } from '../src/unported.js';
import { MoveTables } from '../src/vectors.js';
import { bodyPairs, headRegister, narrowIndex } from './w450widenedscan.js';

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
const MOVES = HAVE_TABLES ? new MoveTables(TJ, ROM) : null;
const SKIP_IMAGE = HAVE_IMAGE ? false : 'maincpu.bin absent; skip, not pass';
const SKIP_TABLES = HAVE_TABLES ? false : 'player.tables.json absent; skip, not pass';

const IMAGE_SHA256 = '4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c';
const POOL_BYTES = SEG.slots * SEG.stride;

const ENTRIES = Object.freeze([
  Object.freeze({
    name: 'P1', index: 0, full: 0x25270c, inner: 0x252714,
    selector: POWER.p1Weapon, table: 0x2527be, hyper: 0x81b63e,
    sounds: [0x28c43c, 0x28c49c], hyperSound: 0x28c4fc,
    headHex: '0279dffb008104aa48e787e230390081043ed04041fa009c4e71207000004a790081b63e670641f90028c4fc4e904df9008112f241f900811ef243f900811f3245f9008104aa6046',
  }),
  Object.freeze({
    name: 'P2', index: 1, full: 0x252754, inner: 0x25275c,
    selector: POWER.p2Weapon, table: 0x2527c6, hyper: 0x81b640,
    sounds: [0x28c452, 0x28c4b2], hyperSound: 0x28c512,
    headHex: '0279dffb0081050e48e787e23039008104a0d04041fa005c4e71207000004a790081b640670641f90028c5124e904df9008118f241f900811f1243f900811f5245f90081050e',
  }),
]);

const TAIL_HEX = '08aa00070001700030803280334000163e3c001f3c804dee003051cffff84cdf47e14e75';
const TABLE_HEX = '0028c43c0028c49c0028c4520028c4b2';

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
function throwsAt(fn, address) {
  let caught = null;
  try { fn(); } catch (e) { caught = e; }
  assert.ok(caught instanceof Unreached, `expected a named throw at $${address.toString(16)}`);
  assert.equal(caught.romAddress, address);
}

function dirtyBeamRam() {
  const ram = new Ram();
  for (let side = 0; side < 2; side++) {
    const b = BEAM[side];
    fillBytes(ram, b.pool, POOL_BYTES, 0x31 + side * 0x43);
    for (let slot = 0; slot < SEG.slots; slot++) {
      ram.setU16(b.pool + slot * SEG.stride, 0x8000 | side * 0x100 | slot);
    }
    fillBytes(ram, b.rec, 0x20, 0x51 + side * 0x23);
    fillBytes(ram, b.blk, 0x20, 0x71 + side * 0x19);
    fillBytes(ram, b.opt, 0x64, 0x91 + side * 0x17);
    ram.setU16(b.rec, 0x9101 + side);
    ram.setU16(b.blk, 0xa201 + side);
    ram.setU16(b.blk + 0x16, 0xb301 + side);
    ram.setU16(b.opt, 0xffff);
  }
  ram.setU16(BEAM[0].pool - 2, 0xc4d5);
  ram.setU16(BEAM[1].blk + 0x20, 0xd5e6);
  return ram;
}

function captureSide(ram, side) {
  const b = BEAM[side];
  const other = BEAM[side ^ 1];
  return {
    pool: snapshot(ram, b.pool, POOL_BYTES),
    rec: snapshot(ram, b.rec, 0x20),
    blk: snapshot(ram, b.blk, 0x20),
    opt: snapshot(ram, b.opt, 0x64),
    otherPool: snapshot(ram, other.pool, POOL_BYTES),
    otherRec: snapshot(ram, other.rec, 0x20),
    otherBlk: snapshot(ram, other.blk, 0x20),
    otherOpt: snapshot(ram, other.opt, 0x64),
    beforeAll: ram.u16(BEAM[0].pool - 2),
    afterAll: ram.u16(BEAM[1].blk + 0x20),
  };
}

function assertWipedCore(ram, side, before, label) {
  const b = BEAM[side];
  const other = BEAM[side ^ 1];
  for (let slot = 0; slot < SEG.slots; slot++) {
    const at = b.pool + slot * SEG.stride;
    assert.equal(ram.u16(at), 0, `${label}: slot ${slot} type word becomes free`);
    assert.deepEqual(snapshot(ram, at + 2, SEG.stride - 2),
      before.pool.subarray(slot * SEG.stride + 2, (slot + 1) * SEG.stride),
      `${label}: slot ${slot} keeps all 46 unowned recycled bytes`);
  }
  assert.equal(ram.u16(b.rec), 0, `${label}: control record word`);
  assert.deepEqual(snapshot(ram, b.rec + 2, 0x1e), before.rec.subarray(2),
    `${label}: control record residue`);
  assert.equal(ram.u16(b.blk), 0, `${label}: beam block word`);
  assert.equal(ram.u16(b.blk + 0x16), 0, `${label}: beam column word`);
  for (let n = 0; n < 0x20; n++) {
    if (n < 2 || n === 0x16 || n === 0x17) continue;
    assert.equal(ram.u8(b.blk + n), before.blk[n], `${label}: block residue +$${n.toString(16)}`);
  }
  assert.deepEqual(snapshot(ram, other.pool, POOL_BYTES), before.otherPool,
    `${label}: opposite pool survives byte for byte`);
  assert.deepEqual(snapshot(ram, other.rec, 0x20), before.otherRec,
    `${label}: opposite control survives`);
  assert.deepEqual(snapshot(ram, other.blk, 0x20), before.otherBlk,
    `${label}: opposite block survives`);
  assert.deepEqual(snapshot(ram, other.opt, 0x64), before.otherOpt,
    `${label}: opposite option state survives`);
  assert.equal(ram.u16(BEAM[0].pool - 2), before.beforeAll, `${label}: lower sentinel survives`);
  assert.equal(ram.u16(BEAM[1].blk + 0x20), before.afterAll, `${label}: upper sentinel survives`);
}

function assertBytesExcept(ram, base, before, changed, label) {
  for (let n = 0; n < before.length; n++) {
    if (changed.has(n)) continue;
    assert.equal(ram.u8(base + n), before[n], `${label}: unowned byte +$${n.toString(16)}`);
  }
}

function seedPower(ram, selectors = [0, 0]) {
  const rows = [];
  for (let side = 0; side < 2; side++) {
    const p = side === 0
      ? { ship: POWER.p1Ship, weapon: POWER.p1Weapon, shot: POWER.p1Cursor,
        pod: POWER.p1PodCursor }
      : { ship: POWER.p2Ship, weapon: POWER.p2Weapon, shot: POWER.p2Cursor,
        pod: POWER.p2PodCursor };
    ram.setU16(p.ship, 2);
    ram.setU16(p.weapon, selectors[side]);
    const row = selectors[side] * 4;
    rows.push(row);
    ram.setU32(p.shot, ROM.u32(POWER.lists + row));
    ram.setU32(p.pod, ROM.u32(POWER.lists + row + 4));
  }
  return rows;
}

function productionContext() {
  const sounds = [];
  const itemEvents = [];
  const log = new UnportedLog();
  return {
    sounds,
    itemEvents,
    ctx: {
      rom: ROM,
      tables: MOVES,
      prot: new ProtLatch(),
      unportedLog: log,
      unported: log,
      soundPost: (address) => sounds.push(address),
      itemCollect: (...event) => itemEvents.push(event),
    },
  };
}

function seedDirtyCollectedItem(ram, kind, touch) {
  const at = ITEM.base;
  fillBytes(ram, at, ITEM.stride, 0x5d + kind);
  ram.setU16(at + I.status, 0x8000 | 0x2000 | touch | kind);
  ram.setU16(at + I.pos, 0x3200);
  ram.setU16(at + I.posX, 0x2200);
  ram.setU16(ITEM.count, 1);
  return { at, tail: snapshot(ram, at + 0x20, 0x20) };
}

function seedReleaseP1(ram) {
  const opt = RAM.p1Options;
  const player = RAM.player1;
  ram.setU16(opt + OPT.state, 0xe083); // live, release latch, builder bit, low bit 7, init
  ram.setU16(opt + OPT.pod + OPT.state, 0x8000);
  ram.setU8(opt + OPT.speedIdx, 0xe0);
  ram.setU8(opt + OPT.pod + OPT.speedIdx, 0xe0);
  ram.setU8(opt + OPT.angle, 0);
  ram.setU8(opt + OPT.pod + OPT.angle, 0x30);
  ram.setU8(opt + 0x36, 0x10);
  ram.setU8(opt + 0x37, 0x30);
  ram.setU8(opt + 0x3b, 0x40);
  ram.setU8(opt + 0x3e, 2);
  ram.setU8(opt + 0x3f, 0x6a);
  ram.setU8(opt + OPT.reloadCount, 0x7b);
  ram.setU16(opt + 0x10, 2);
  ram.setU32(opt + 0x26, 0x12345678);
  ram.setU32(opt + 0x2a, 0x23456789);
  ram.setU16(opt + 0x2e, 0x3456);
  ram.setU32(opt + 0x30, 0x0024bf4a);
  ram.setU8(opt + 0x4a, 0x9c);
  ram.setU16(opt + OPT.animIdx, 0x0038);
  ram.setU32(opt + OPT.animTable, 0x0024bbba);
  ram.setU16(opt + OPT.animIdxReload, 0x007c);
  ram.setU32(opt + OPT.shadowTable, 0x0024bcfe);
  ram.setU16(player + P.state, 0x8000);
  ram.setU16(player + P.optFormation, 2);
  ram.setU16(player + P.posY, 0x1179);
  ram.setU16(player + P.posX, 0x14c0);
  ram.setU8(player + P.dirByte, 0);
  ram.setU8(player + P.btnByte, 0);
  ram.setU8(player + P.speedIdx, 22);
  ram.setU8(player + P.baseSpeed, 22);
  ram.setU8(player + P.laserFloor, 12);
  ram.setU8(player + 0x5b, 2);
  ram.setU32(POWER.p1PodCursor, 0x255278);
  ram.setU16(RAM.p2Options, 0);
}

test('SECTION 1: exact cartridge heads, common tail and sound table have the known image hash',
  { skip: SKIP_IMAGE }, () => {
    assert.equal(createHash('sha256').update(IMG).digest('hex'), IMAGE_SHA256);
    assert.deepEqual(bytes(ENTRIES[0].full, 0x48), Buffer.from(ENTRIES[0].headHex, 'hex'));
    assert.deepEqual(bytes(ENTRIES[1].full, 0x46), Buffer.from(ENTRIES[1].headHex, 'hex'));
    assert.deepEqual(bytes(0x25279a, 0x24), Buffer.from(TAIL_HEX, 'hex'));
    assert.deepEqual(bytes(0x2527be, 0x10), Buffer.from(TABLE_HEX, 'hex'));
    assert.equal(ENTRIES[0].full + 8, ENTRIES[0].inner, 'P1 full entry adds one 8-byte ANDI');
    assert.equal(ENTRIES[1].full + 8, ENTRIES[1].inner, 'P2 full entry adds one 8-byte ANDI');
  });

test('SECTION 1b: every branch, width, register address, loop bound and pointer step decodes',
  { skip: SKIP_IMAGE }, () => {
    for (const e of ENTRIES) {
      assert.equal(IMG.readUInt16BE(e.full), 0x0279, `${e.name}: ANDI.W absolute-long opcode`);
      assert.equal(IMG.readUInt16BE(e.full + 2), 0xdffb, `${e.name}: exact full-entry mask`);
      assert.equal(IMG.readUInt32BE(e.full + 4), BEAM[e.index].opt, `${e.name}: option owner`);
      assert.equal(IMG.readUInt16BE(e.inner), 0x48e7, `${e.name}: MOVEM.L save opcode`);
      assert.equal(IMG.readUInt16BE(e.inner + 2), 0x87e2, `${e.name}: saved register mask`);
      assert.equal(IMG.readUInt32BE(e.inner + 6), e.selector, `${e.name}: selector WORD address`);
      assert.equal(IMG.readUInt16BE(e.inner + 10), 0xd040, `${e.name}: ADD.W doubles selector`);
      assert.equal(IMG.readUInt16BE(e.inner + 12), 0x41fa, `${e.name}: PC-relative table LEA`);
      assert.equal(wideTarget(e.inner + 14), e.table, `${e.name}: LEA target uses extension address`);
      assert.equal(IMG.readUInt32BE(e.inner + 18), 0x20700000,
        `${e.name}: MOVEA.L uses A0 plus signed D0.W byte offset`);
      assert.equal(IMG.readUInt32BE(e.inner + 24), e.hyper, `${e.name}: hyper WORD address`);
      assert.equal(shortTarget(e.inner + 28), e.inner + 36, `${e.name}: BEQ skips hyper override`);
      assert.equal(IMG.readUInt32BE(e.inner + 32), e.hyperSound, `${e.name}: hyper sound address`);
      assert.equal(IMG.readUInt16BE(e.inner + 36), 0x4e90, `${e.name}: JSR (A0)`);
      assert.equal(IMG.readUInt32BE(e.inner + 40), BEAM[e.index].pool, `${e.name}: A6 pool base`);
      assert.equal(IMG.readUInt32BE(e.inner + 46), BEAM[e.index].rec, `${e.name}: A0 control`);
      assert.equal(IMG.readUInt32BE(e.inner + 52), BEAM[e.index].blk, `${e.name}: A1 block`);
      assert.equal(IMG.readUInt32BE(e.inner + 58), BEAM[e.index].opt, `${e.name}: A2 option`);
    }
    assert.equal(shortTarget(0x252752), 0x25279a, 'P1 branches to the common tail');
    assert.equal(0x252794 + 6, 0x25279a, 'P2 falls through to the same tail');
    assert.equal(IMG.readUInt32BE(0x25279a), 0x08aa0007, 'BCLR.B #7 uses d16,A2');
    assert.equal(IMG.readUInt16BE(0x2527a0), 0x7000, 'MOVEQ #0 supplies every clear');
    assert.deepEqual([0x2527a2, 0x2527a4, 0x2527a6].map((a) => IMG.readUInt16BE(a)),
      [0x3080, 0x3280, 0x3340], 'three WORD clears use A0, A1 and $16(A1)');
    assert.equal(IMG.readUInt16BE(0x2527aa), 0x3e3c, 'MOVE.W immediate loads D7');
    assert.equal(IMG.readUInt16BE(0x2527ac), 0x001f, 'DBRA bound $1F means 32 iterations');
    assert.equal(IMG.readUInt16BE(0x2527ae), 0x3c80, 'pool clear is one WORD at (A6)');
    assert.equal(IMG.readUInt32BE(0x2527b0), 0x4dee0030, 'LEA advances A6 by exact $30 stride');
    assert.equal(wideTarget(0x2527b6), 0x2527ae, 'DBRA returns to the WORD clear');
    assert.equal(BEAM[0].pool + 32 * SEG.stride, BEAM[1].pool, 'P1 progression ends at P2 pool');
    assert.equal(BEAM[1].pool + 32 * SEG.stride, BEAM[0].rec, 'P2 progression ends at P1 control');
    assert.deepEqual(ENTRIES.flatMap((e) => e.sounds),
      [0x28c43c, 0x28c49c, 0x28c452, 0x28c4b2], 'four LONG sound-table entries');
  });

function scanDirectResetCalls() {
  const targets = new Set(ENTRIES.flatMap((e) => [e.full, e.inner]));
  const out = [];
  for (let at = 0x230000; at < 0x2b0000; at += 2) {
    const opcode = IMG.readUInt16BE(at);
    let target = null;
    if ((opcode & 0xff00) === 0x6100) {
      const low = opcode & 0xff;
      const displacement = low === 0 ? IMG.readInt16BE(at + 2)
        : ((low & 0x80) ? low - 0x100 : low);
      target = at + 2 + displacement;
    } else if (opcode === 0x4eb9) {
      target = IMG.readUInt32BE(at + 2);
    } else if (opcode === 0x4eba) {
      target = at + 2 + IMG.readInt16BE(at + 2);
    }
    if (targets.has(target)) out.push([at, target]);
  }
  return out;
}

test('SECTION 2: complete cartridge caller census separates 14 live direct sites, one indirect site and two dead sites',
  { skip: SKIP_IMAGE }, () => {
    assert.deepEqual(scanDirectResetCalls(), [
      [0x24972e, 0x25270c], [0x249742, 0x252754],
      [0x249abe, 0x252714], [0x249ad2, 0x25275c],
      [0x249fb2, 0x252714], [0x24a056, 0x25275c],
      [0x24c2de, 0x252714], [0x24c2e4, 0x25275c],
      [0x252cb8, 0x25270c], [0x252d46, 0x252754],
      [0x252dd0, 0x25270c], [0x252e4a, 0x252754],
      [0x2532a2, 0x25270c], [0x2532b0, 0x252754],
      [0x25647a, 0x25270c], [0x256496, 0x252754],
    ]);
    assert.equal(IMG.readUInt32BE(0x24981c), 0x25270c, 'hyper request loads P1 full entry');
    assert.equal(IMG.readUInt32BE(0x249842), 0x252754, 'hyper request loads P2 full entry');
    assert.equal(IMG.readUInt16BE(0x249898), 0x4e90, 'hyper request calls the selected A0 indirectly');
    assert.equal(IMG.readUInt16BE(0x24970e), 0x6000, 'the two earliest direct sites are behind BRA.W');
    assert.equal(wideTarget(0x249710), 0x2497aa, 'the unconditional branch skips $249712..$2497A0');
  });

test('SECTION 3: selector 0/2 and both hyper arms wipe dirty pools without clearing residue', () => {
  const cases = [
    [0, 0, false, 0x28c43c], [0, 2, false, 0x28c49c],
    [1, 0, false, 0x28c452], [1, 2, false, 0x28c4b2],
    [0, 2, true, 0x28c4fc], [1, 2, true, 0x28c512],
  ];
  for (const [side, selector, hyper, sound] of cases) {
    const ram = dirtyBeamRam();
    const e = ENTRIES[side];
    ram.setU16(e.selector, selector);
    ram.setU16(e.hyper, hyper ? 1 : 0);
    ram.setU16(ENTRIES[side ^ 1].hyper, hyper ? 0 : 1);
    const before = captureSide(ram, side);
    const sounds = [];
    wipeSegmentPool(ram, { soundPost: (address) => sounds.push(address) }, BEAM[side]);
    const label = `${e.name} selector ${selector} hyper ${hyper}`;
    assertWipedCore(ram, side, before, label);
    assert.deepEqual(sounds, [sound], `${label}: externally posted sound`);
    assert.equal(ram.u16(BEAM[side].opt), 0xff7f,
      `${label}: inner entry clears only low-byte bit 7, not #DFFB bits`);
    assertBytesExcept(ram, BEAM[side].opt, before.opt, new Set([0, 1]), label);
  }
});

test('SECTION 3b: invalid selectors and mixed ownership fail loudly instead of wrapping', () => {
  for (const [side, selector] of [[0, 1], [0, 4], [1, 1], [1, 4]]) {
    const ram = dirtyBeamRam();
    ram.setU16(ENTRIES[side].selector, selector);
    throwsAt(() => wipeSegmentPool(ram, {}, BEAM[side]), ENTRIES[side].table);
  }
  const ram = dirtyBeamRam();
  throwsAt(() => wipeSegmentPool(ram, {}, { ...BEAM[0], blk: BEAM[1].blk }), 0x252714);
});

test('SECTION 4: dirty P1 power item takes the full entry, continues collection, and keeps its slot live',
  { skip: SKIP_TABLES }, () => {
    const ram = dirtyBeamRam();
    const rows = seedPower(ram, [2, 0]);
    ram.setU16(POWER.p1Shot, 0);
    ram.setU16(POWER.p1Laser, 0);
    ram.setU16(POWER.p1Clear, 0x6d7e);
    ram.setU16(0x81b63e, 0);
    ram.setU16(0x81b640, 1);
    const item = seedDirtyCollectedItem(ram, 0, 0x1000);
    const before = captureSide(ram, 0);
    const oldShotCursor = ram.u32(POWER.p1Cursor);
    const oldPodCursor = ram.u32(POWER.p1PodCursor);
    const shotLast = ROM.u16(ROM.u32(POWER.lists + rows[0]) + 8);
    const podLast = ROM.u16(ROM.u32(POWER.lists + rows[0] + 4) + 8);
    const expectedShotCursor = ROM.u16(oldShotCursor) === shotLast ? oldShotCursor : oldShotCursor + 2;
    const expectedPodCursor = ROM.u16(oldPodCursor) === podLast ? oldPodCursor : oldPodCursor + 2;
    const { ctx, sounds, itemEvents } = productionContext();

    const trace = runItemDriver(ram, ROM, ctx);
    assert.deepEqual(trace, { live: 1, emitted: 0, freed: 0, collected: 0, walked: 1 },
      'driver telemetry counts records already in collected animation, not same-frame collection');
    assertWipedCore(ram, 0, before, 'P1 power item full entry');
    assert.equal(ram.u16(BEAM[0].opt), 0xdf7b,
      'full #DFFB and common low-byte bit 7 clear are both externally visible');
    assertBytesExcept(ram, BEAM[0].opt, before.opt, new Set([0, 1, 0x50, 0x51]),
      'P1 power item option ownership');
    assert.equal(ram.u16(POWER.p1Clear), 0, '$252CBC caller continuation clears +$50');
    assert.equal(ram.u16(POWER.p1Laser), 2, 'laser power increments before reset');
    assert.equal(ram.u16(POWER.p1Shot), 2, 'shot power continuation increments afterward');
    assert.equal(ram.u32(POWER.p1Cursor), expectedShotCursor, 'shot cursor continuation');
    assert.equal(ram.u32(POWER.p1PodCursor), expectedPodCursor, 'pod cursor continuation');
    assert.deepEqual(sounds, [0x28c49c, 0x28c5ca, 0x28c9f8],
      'selector-2 reset cue precedes pickup and power-up cues');
    assert.equal(ram.u16(item.at + I.status), 0x8001,
      'collected item remains allocated in its animation lifecycle');
    assert.equal(ram.u16(ITEM.count), 1, 'collection does not free the item slot yet');
    assert.deepEqual(snapshot(ram, item.at + 0x20, 0x20), item.tail,
      'dirty unowned item tail survives collection');
    assert.equal(itemEvents.length, 1, 'the caller reaches its external item event');
  });

test('SECTION 4b: dirty P2 full-power item takes its own hyper sound and leaves P1 opposite state intact',
  { skip: SKIP_TABLES }, () => {
    const ram = dirtyBeamRam();
    const rows = seedPower(ram, [2, 0]);
    ram.setU16(POWER.p2Shot, 0);
    ram.setU16(POWER.p2Laser, 0);
    ram.setU16(POWER.p2Clear, 0x7e8f);
    ram.setU16(0x81b63e, 0);
    ram.setU16(0x81b640, 1);
    const item = seedDirtyCollectedItem(ram, 4, 0x0800);
    const before = captureSide(ram, 1);
    const { ctx, sounds } = productionContext();

    const trace = runItemDriver(ram, ROM, ctx);
    assert.equal(trace.collected, 0,
      'driver telemetry counts only records collected before this frame');
    assert.equal(trace.freed, 0);
    assertWipedCore(ram, 1, before, 'P2 full-power item full entry');
    assert.equal(ram.u16(BEAM[1].opt), 0xdf7b, 'P2 full entry applies its own #DFFB mask');
    assertBytesExcept(ram, BEAM[1].opt, before.opt, new Set([0, 1, 0x50, 0x51]),
      'P2 full-power option ownership');
    assert.equal(ram.u16(POWER.p2Clear), 0, '$252E4E caller continuation clears +$50');
    assert.equal(ram.u16(POWER.p2Laser), 8, 'full-power assigns laser level 8');
    assert.equal(ram.u16(POWER.p2Shot), 8, 'full-power continuation assigns shot level 8');
    assert.equal(ram.u32(POWER.p2Cursor), ROM.u32(POWER.lists + rows[1]) + 8,
      'full-power shot cursor lands on word[4]');
    assert.equal(ram.u32(POWER.p2PodCursor), ROM.u32(POWER.lists + rows[1] + 4) + 8,
      'full-power pod cursor lands on word[4]');
    assert.deepEqual(sounds, [0x28c512, 0x28c5ca, 0x28c9f8],
      'P2 hyper override is $28C512, never P1 $28C4FC');
    assert.equal(ram.u16(item.at + I.status), 0x8005,
      'P2 item enters collected lifecycle while retaining kind-$04 in its low byte');
  });

test('SECTION 5: real release caller enters the inner body, wipes dirty beam state, then resumes at $24C2E8',
  { skip: SKIP_TABLES }, () => {
    const ram = dirtyBeamRam();
    seedReleaseP1(ram);
    ram.setU16(POWER.p1Weapon, 2);
    ram.setU16(0x81b63e, 0);
    const before = captureSide(ram, 0);
    const { ctx, sounds } = productionContext();

    runOptionObject(ram, ctx);
    assertWipedCore(ram, 0, before, 'P1 release inner entry');
    assert.deepEqual(sounds, [0x28c49c], 'release posts selector-2 P1 cue');
    for (const off of [0x2a, 0x2b, 0x34, 0x35, 0x3f]) {
      assert.equal(ram.u8(RAM.player1 + off), 0, `$24C2C4 continuation clears player +$${off.toString(16)}`);
    }
    assert.equal(ram.u8(RAM.p1Options + 0x4a), 8, '$24C2E8 sets option +$4A');
    assert.equal(ram.u8(RAM.p1Options + OPT.reloadCount), 4, '$24C2EE sets reload count');
    assert.equal(ram.u16(RAM.p1Options) & 0x2024, 0,
      '$24C2F4 clears builder bit 13 and low state bits 5 and 2 after the inner call');
    assert.equal(ram.u8(RAM.p1Options + OPT.flags1) & 0x80, 0,
      '$25279A cleared the head-live bit before continuation');
    assert.equal(ram.u8(RAM.p1Options + OPT.angle), 2,
      '$24C310 continuation takes one pod swing-back step');
  });

test('SECTION 6: one common production body serves every full and inner caller', () => {
  const calls = { beamReset25270C: {}, wipeSegmentPool: {} };
  for (const entry of readdirSync(SRC, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const source = readFileSync(join(SRC, entry.name), 'utf8');
    for (const name of Object.keys(calls)) {
      const count = [...source.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))].length;
      if (count) calls[name][entry.name] = count;
    }
  }
  assert.deepEqual(calls.beamReset25270C, { 'bomb.js': 1, 'hyper.js': 2, 'items.js': 5 },
    'four item arms, hyper request/end and bomb cleanup plus the sole wrapper declaration');
  assert.deepEqual(calls.wipeSegmentPool,
    { 'bomb.js': 1, 'items.js': 1, 'laser.js': 1, 'options.js': 1, 'player.js': 1 },
    'bomb arm, full wrapper, release and death all use the sole laser.js implementation');

  const itemsSource = readFileSync(join(SRC, 'items.js'), 'utf8');
  const laserSource = readFileSync(join(SRC, 'laser.js'), 'utf8');
  const bombSource = readFileSync(join(SRC, 'bomb.js'), 'utf8');
  assert.match(itemsSource, /import \{ BEAM, wipeSegmentPool \} from '\.\/laser\.js';/);
  assert.match(itemsSource, /wipeSegmentPool\(ram, ctx, b\);/);
  assert.equal([...laserSource.matchAll(/export function wipeSegmentPool\s*\(/g)].length, 1);
  assert.doesNotMatch(itemsSource, /for \(let n = 0; n < 32; n\+\+\)/,
    'items.js must not regrow its private 32-slot loop');
  assert.match(bombSource, /wipeSegmentPool\(ram, ctx, BEAM\[p2 \? 1 : 0\]\)/,
    'bomb ownership uses the canonical side row, not its inverted local d7');
});

test('SECTION 7: W455 removes one body-only pair and changes no head register', () => {
  const heads = headRegister();
  const pairs = bodyPairs();
  const narrow = [...narrowIndex()].filter(([, claims]) => claims.size > 1);
  assert.equal(narrow.length, 17, 'W458 removed $25DA60 from W457 narrow baseline 18');
  assert.equal(heads.length, 88, 'W458 removed $25DA60 from W457 widened baseline 89');
  assert.equal(pairs.length, 29,
    'W450 39 minus W451, W453, W454, W455, four W456 edges, W457 cursor map and W458 cursor load');
  assert.ok(!pairs.some(([pair]) => pair === 'items.js beamReset25270C <> laser.js wipeSegmentPool'),
    'the six-marker private wipe stays absent');
});

test('SECTION 8: no ROM export window was widened or added for executable proof',
  { skip: SKIP_TABLES }, () => {
    for (const address of [0x25270c, 0x252714, 0x252754, 0x25275c, 0x25279a, 0x2527be]) {
      assert.equal(ROM.windows.some((w) => address >= w.base && address < w.base + w.len), false,
        `$${address.toString(16)} remains outside generated production windows`);
    }
    const exporter = readFileSync(EXPORT_TABLES, 'utf8').toLowerCase();
    assert.doesNotMatch(exporter, /0x2527(?:0c|14|54|5c|9a|be)/,
      'raw-image evidence did not change SHOT_WINDOWS');
  });
