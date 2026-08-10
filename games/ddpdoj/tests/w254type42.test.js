// W254: type $42's init body $2A3952, the Stage-4 boss's children.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { Ram, i16, u16 } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { processDeferred, SPAWN } from '../src/spawn.js';
import { ENEMY } from '../src/enemies.js';
import { INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { SCHED } from '../src/scheduler.js';
import { a1_9Init2A307A, a1_9Step2A30A8 } from '../src/boss4.js';

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const A5 = 0x814000, A6 = 0x81b732;
const SLOT = SCHED.a1Base;
const CLUSTER_ANGLES = [0x10, 0x65, 0xbb, 0xf0, 0x45, 0x9b];

function fixture() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(A5 + 0x06, A6);
  ram.setU32(A6 + 0x22, 0x2c001a00);         // the boss body the children hang off
  ram.setU16(SLOT, 0x8009);
  const ctx = { ram, rom: ROM, tables: MT, bossRec: A5, bossSubRec: A6,
    unported: log, unportedLog: log };
  return { ram, log, ctx };
}

/** Run A1 9 until its volley lands, then let the deferred queue build the children. */
function spawnFormation(f) {
  a1_9Init2A307A(f.ram, ROM, f.ctx, SLOT);
  for (let n = 0; n < 12 && f.ram.u16(SPAWN.DEFQ_COUNT) === 0; n++) {
    a1_9Step2A30A8(f.ram, ROM, f.ctx, SLOT);
  }
  const queued = f.ram.u16(SPAWN.DEFQ_COUNT) / SPAWN.DEFQ_STRIDE;
  const made = processDeferred(f.ram, ROM, f.log, MT);
  const kids = Array.from({ length: ENEMY.slots }, (_, n) =>
    ENEMY.table + n * ENEMY.stride).filter((a) => f.ram.u8(a + 0x0c) === 0x42);
  return { queued, made, kids };
}

test('W254 the body is keyed at init+8 and its prototype ends at the handler',
  { skip: SKIP }, () => {
    // $2A394A is a two-instruction runLen stub, so the body proper is 8 bytes past
    // the type table's init pointer -- the same shape type $41 has.
    assert.equal(ROM.u32(0x267824 + 0x42 * 8), 0x2a394a, 'the table says $2A394A');
    assert.ok(INIT_BODY_ADDRESSES.includes(0x2a3952), '$2A3952 is registered');
    // FIVE long-form prototype entries of 28 bytes, walked the way $2637A2 walks it.
    let a = 0x2a3a6a;
    for (let n = 0; n < 5; n++) {
      assert.equal(ROM.u16(a) & 0x8000, 0x8000, `entry ${n} at $${a.toString(16)}`);
      a += 28;
    }
    assert.equal(a, 0x2a3af6, 'and they end exactly at the handler, with no gap');
    assert.throws(() => ROM.u16(0x2a3af6), (e) => e.name === 'Unreached',
      'so the window stops there rather than reading code');
  });

test('W254 a whole A1 9 formation becomes real children', { skip: SKIP }, () => {
  const f = fixture();
  const { queued, made, kids } = spawnFormation(f);
  assert.ok(queued === 8 || queued === 9, `one formation queued, got ${queued}`);
  assert.equal(made, queued, 'every queued child was built');
  assert.equal(kids.length, queued, 'and each took an enemy slot');
  assert.deepEqual(f.log.report(), [], 'with no unported path and no counted gap');
});

test('W254 every child carries A1 9\'s role and hangs off the parent',
  { skip: SKIP }, () => {
    const f = fixture();
    const { kids } = spawnFormation(f);
    for (const rec of kids) {
      const sub = f.ram.u32(rec + 0x06);
      // A1 9 writes $21(a0) = #$FF as a CONSTANT, so every one of its children is
      // role $FF. Roles 0..7 and $70/$71 come only from A1 11 -- worklog 253.
      assert.equal(f.ram.u8(sub + 0x3c), 0xff, '$2A3974 -- THE ROLE');
      assert.equal(f.ram.u16(sub + 0x00), 0x8000,
        '$2A3A64 -- and $FF is not $70 or $71, so it gets the mark');
      assert.equal(f.ram.u8(sub + 0x1a), 0, '$2A3964');
      assert.equal(f.ram.u32(rec + 0x1c), A6, 'the parent pointer survived the copy');
      // ...and the record's OWN copy of the role is gone by the time the body ends:
      // `$2A3A12 move.w #$2000,$20(a5)` is a WORD, so its low half lands on `$21(a5)`.
      // The role survives only because `$2A3974` read it into `$3C(A6)` first, twelve
      // instructions earlier. Reordering those two would lose it silently.
      assert.equal(f.ram.u8(rec + 0x21), 0x00,
        '$2A3A16\'s word write clobbers the role byte it no longer needs');
      assert.equal(f.ram.u8(rec + 0x20), 0x20, 'and $20(a5) holds the other half');
      assert.equal(f.ram.u8(rec + 0x1a), 0x48,
        '$2A39F6 replaced the list speed with $20(a5), which A1 9 set to $48');
      assert.deepEqual([f.ram.u16(rec + 0x22), f.ram.u8(rec + 0x3b)], [0x0404, 0x18],
        '$2A3A32/$2A3A3E');
    }
  });

test('W254 the direction word is SIGN-EXTENDED, which is what $6C(a6) reports',
  { skip: SKIP }, () => {
    const f = fixture();
    const { kids } = spawnFormation(f);
    const sub = f.ram.u32(kids[0] + 0x06);
    // A1 9's lists carry $0E and $F2 -- +14 and -14. `ext.w` is what turns the second
    // into $FFF2 rather than $00F2, and $6C is set from its SIGN.
    const dir = f.ram.u16(sub + 0x26);
    assert.ok(dir === 0x000e || dir === 0xfff2, `$26(a6) is $${dir.toString(16)}`);
    assert.equal(f.ram.u16(sub + 0x6c), i16(dir) < 0 ? 1 : 0, '$2A3992..$2A39A0');
    // The same word lands in all three places, so a port that extended only one
    // would diverge later without diverging here.
    assert.equal(f.ram.u16(sub + 0x38), dir, '$2A3986');
    assert.equal(f.ram.u16(sub + 0x48), dir, '$2A398C');
    // Every child of one formation shares it, because it is the list's single byte.
    for (const rec of kids) assert.equal(f.ram.u16(f.ram.u32(rec + 6) + 0x26), dir);
  });

test('W254 $8D(a6) marks CLUSTER members and no ring member', { skip: SKIP }, () => {
  // The six angles at $2A39B0..$2A39DC are six of the nine in A1 9's two clustered
  // formations and none of the eight in its two rings, so the flag identifies which
  // kind of formation a child belongs to.
  const ringAngles = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0xe0];
  for (const a of ringAngles) {
    assert.ok(!CLUSTER_ANGLES.includes(a), `ring angle $${a.toString(16)} is unmarked`);
  }
  const f = fixture();
  const { kids } = spawnFormation(f);
  for (const rec of kids) {
    const sub = f.ram.u32(rec + 0x06);
    const marked = f.ram.u8(sub + 0x8d) === 1;
    assert.equal(marked, CLUSTER_ANGLES.includes(f.ram.u8(rec + 0x1b)),
      `angle $${f.ram.u8(rec + 0x1b).toString(16)} marked=${marked}`);
    assert.equal(f.ram.u16(sub + 0x28), u16(f.ram.u8(rec + 0x1b) << 4),
      '$2A39EA asl.w #$4 -- the angle in the fixed-point field');
  }
});

test('W254 the position is the LAUNCH VECTOR offset from the parent', { skip: SKIP }, () => {
  const f = fixture();
  const { kids } = spawnFormation(f);
  for (const rec of kids) {
    const sub = f.ram.u32(rec + 0x06);
    // $2A39FC..$2A3A2E: shotVector($48, angle), each half scaled by 8, added to the
    // PARENT's $22/$24 -- and the long axis alone loses $2000.
    const v = MT.shotVector(0x48, f.ram.u16(sub + 0x28) >> 4);
    assert.equal(f.ram.u16(sub + 0x02),
      u16((v.dy << 3) + 0x2c00 - 0x2000), '$2A3A1E/$2A3A22/$2A3A2A');
    assert.equal(f.ram.u16(sub + 0x04),
      u16((v.dx << 3) + 0x1a00), '$2A3A26/$2A3A2E -- no $2000 on this axis');
  }
  // ...and $20(a5) holds the $2000 it was written with, not the list's $48.
  assert.equal(f.ram.u16(kids[0] + 0x20), 0x2000, '$2A3A12/$2A3A16');
});

test('W254 the children spread out, which is the point of the formation',
  { skip: SKIP }, () => {
    const f = fixture();
    const { kids } = spawnFormation(f);
    const seen = new Set(kids.map((r) => {
      const sub = f.ram.u32(r + 0x06);
      return `${f.ram.u16(sub + 0x02)},${f.ram.u16(sub + 0x04)}`;
    }));
    assert.ok(seen.size >= kids.length - 1,
      `${seen.size} distinct launch positions for ${kids.length} children`);
  });
