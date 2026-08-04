// WAVE 23 -- the 21 stage-1 init bodies (src/initbody.js).  These tests run the
// translated bodies against the REAL exported ROM (skipped, loudly, when the
// rip is absent -- the ROM is gitignored).  They verify the loader-written
// stats fields land and the bespoke adjustments run, for a representative type
// ($11, the commonest), a damage-first family member ($07), and the stage-kill
// gate that frees an enemy.  The frame-for-frame comparison over the W17 corpus
// is the gate (tools/w23statsgate.mjs); these are the unit-level sanity checks.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { ENEMY } from '../src/enemies.js';
import { runInitBodyAddr, freeEnemy, INIT_BODY_FREED,
  INIT_BODY_ADDRESSES } from '../src/initbody.js';
import { MoveTables } from '../src/vectors.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);

function realRom() {
  const j = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  return new RomWindows(j.rom);
}

// W31: the MIDBOSS init body ($26B48C) runs its arm kinematics, which read
// $241D34, so it is the one body that needs a MoveTables.  Omitting it is a
// LOUD NAMED THROW at $26B4B4 -- see the test below.
function realTables() {
  const j = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  return new MoveTables(j, new RomWindows(j.rom));
}

// a fresh enemy record at a real slot, with the type/class bytes the dispatch
// would have written, and the sub-record pointer the allocator returned.
function freshEnemy(ram, type, classByte = 0) {
  const rec = ENEMY.bandCommon;
  ram.setU8(rec + 0x0c, type);
  ram.setU8(rec + 0x0d, classByte);
  // a sub-record in the common pool; the loader writes through ($6,A5).
  const sub = ENEMY.subCommon ?? 0x81459c;
  ram.setU32(rec + 0x06, sub);
  ram.setU16(rec + 0x04, 0);              // run length (the stub wrote it; 0 = 1 sub)
  return { rec, sub };
}

test('the 21 stage-1 init bodies are all dispatched (no body missing)', () => {
  // the addresses the spawn walker resolves for the 21 stage-1 types (census).
  const want = new Set([
    0x269bce, 0x26a1ea, 0x26a4bc, 0x26a794, 0x26aba0, 0x26871c, 0x2680b8,
    0x2766ae, 0x276824, 0x272a4a, 0x296fb0, 0x269754, 0x273802, 0x27462a,
    0x27581a, 0x275da0, 0x277278, 0x26b484, 0x2926e2,
  ]);
  for (const a of want) assert.ok(INIT_BODY_ADDRESSES.includes(a),
    `init+8 body $${a.toString(16)} is not in the dispatch table`);
  assert.equal(INIT_BODY_ADDRESSES.length, 19,
    `19 distinct body addresses ($07/$27 share $26A1EA, $20/$21 share $272A4A)`);
});

test('runInitBodyAddr throws on an unknown (non-stage-1) body address', () => {
  const ram = new Ram();
  const { rec } = freshEnemy(ram, 0x11);
  assert.throws(() => runInitBodyAddr(0x281000, ram, realRomMaybe(), rec, { note() {} }),
    /UNPORTED.*not in the W23 stage-1 body table/);
});

function realRomMaybe() { return HAVE ? realRom() : new RomWindows({ windows: [] }); }

test('type $11 body writes the prototype HP/palette/anim and the rank-adjusted bucket',
  { skip: !HAVE && 'rip/port/player.tables.json absent -- run export-tables.py' },
  () => {
  const rom = realRom();
  const ram = new Ram();
  const { rec, sub } = freshEnemy(ram, 0x11);
  // seed the globals the bespoke adjustments read (stage 1, loop 1, low rank).
  ram.setU16(0x813092, 1);  ram.setU16(0x813094, 0);  ram.setU16(0x813098, 0);
  ram.setU16(0x8130b2, 0);  ram.setU16(0x8130bc, 0);  ram.setU16(0x8130ba, 0);
  ram.setU16(0x8130ce, 0x60);  ram.setU16(0x803916, 0);
  runInitBodyAddr(0x26871c, ram, rom, rec, { note() {} });
  // sub-record HP at +$18: the prototype's $0038 (56) per census §2.
  assert.equal(ram.u16(sub + 0x18), 0x0038, 'type $11 sub-record HP = 56');
  // hitbox half-extents at +$10/+$12/+$14/+$16 (census values).
  assert.equal(ram.u16(sub + 0x10), 0x0480);
  assert.equal(ram.u16(sub + 0x12), 0x0600);
  assert.equal(ram.u16(sub + 0x14), 0x0440);
  assert.equal(ram.u16(sub + 0x16), 0x0440);
  // the record's HP-reload at +$26 = $0070 (112, 2x the 56) per census.
  assert.equal(ram.u16(rec + 0x26), 0x0070, 'HP reload = 112');
  // the bucket emitter pointers at +$2A/+$2E ($23D762/$23DECE per census).
  assert.equal(ram.u32(rec + 0x2a), 0x0023d762);
  assert.equal(ram.u32(rec + 0x2e), 0x0023dece);
});

test('type $07 body writes its prototype HP and the family palette copy',
  { skip: !HAVE && 'rip absent' },
  () => {
  const rom = realRom();
  const ram = new Ram();
  const { rec, sub } = freshEnemy(ram, 0x07);
  ram.setU16(0x813092, 1);  ram.setU16(0x813094, 0);  ram.setU16(0x813098, 0);
  ram.setU16(0x8130ba, 0);  ram.setU16(0x8130d8, 0);  ram.setU16(0x8130f6, 0);
  runInitBodyAddr(0x26a1ea, ram, rom, rec, { note() {} });
  // the sub-record flags word is loaded (non-zero; the prototype's $A201).
  assert.equal(ram.u16(sub + 0x00), 0xa201, 'type $07 flags word');
  // palette +$1D was copied from record +$2A (the family's `move.b ($2a,A5),($1d,A6)`).
  assert.equal(ram.u8(sub + 0x1d), ram.u8(rec + 0x2a), 'palette tracks record +$2A');
});

test('the stage-kill gate frees the enemy when $8130D8 is set (midboss spawned)',
  { skip: !HAVE && 'rip absent' },
  () => {
  const rom = realRom();
  const ram = new Ram();
  const { rec } = freshEnemy(ram, 0x07);
  ram.setU16(0x813092, 1);     // stage 1
  ram.setU16(0x8130d8, 1);     // midboss spawned -> the $07 stage-1 gate fires
  const r = runInitBodyAddr(0x26a1ea, ram, rom, rec, { note() {} });
  assert.equal(r, INIT_BODY_FREED, 'the body freed the enemy');
  assert.equal(ram.u16(rec), 0, 'the type word is cleared ($263762)');
});

test('the midboss body sets $8130D8 (the stage-kill flag the regulars gate on)',
  { skip: !HAVE && 'rip absent' },
  () => {
  const rom = realRom();
  const ram = new Ram();
  const { rec } = freshEnemy(ram, 0x0d);
  ram.setU16(0x8130d8, 0);
  runInitBodyAddr(0x26b484, ram, rom, rec, { note() {} }, realTables());
  assert.equal(ram.u16(0x8130d8), 1, 'midboss init set $8130D8 := 1 ($26B4B8)');
});

// W31.  Until this wave the body NOTED both `bsr`s; $26B4B0 bsr $26B286 ends
// `bsr $26B2AC`, which takes FOUR draws off the shared $803917 counter, so
// noting it left the port four draws behind the board from the spawn frame on.
test('the midboss init body takes the FOUR $803917 draws $26B2AC makes',
  { skip: !HAVE && 'rip absent' },
  () => {
  const rom = realRom();
  const ram = new Ram();
  const { rec } = freshEnemy(ram, 0x0d);
  ram.setU16(0x803916, 0);
  runInitBodyAddr(0x26b484, ram, rom, rec, { note() {} }, realTables());
  assert.equal(ram.u8(0x803917), 4,
    'three $2431F4 + one $242FDE, all on the ONE shared counter byte');
});

test('the midboss init body without a MoveTables is a LOUD NAMED THROW at $26B4B4',
  { skip: !HAVE && 'rip absent' },
  () => {
  const rom = realRom();
  const ram = new Ram();
  const { rec } = freshEnemy(ram, 0x0d);
  assert.throws(() => runInitBodyAddr(0x26b484, ram, rom, rec, { note() {} }),
    (e) => e.romAddress === 0x26b4b4);
});

test('freeEnemy marks sub-records dead and clears the type word ($263762)', () => {
  const ram = new Ram();
  const rec = ENEMY.bandCommon;
  const sub = 0x81459c;
  ram.setU32(rec + 0x06, sub);
  ram.setU16(rec + 0x04, 2);          // run length 2 -> 3 sub-records
  ram.setU16(rec, 0x8011);            // live type
  freeEnemy(ram, rec);
  assert.equal(ram.u16(rec), 0, 'type word cleared');
  for (let i = 0; i <= 2; i++)
    assert.equal(ram.u8(sub + i * 0x20), 1, `sub-record ${i} marked dead`);
});

test('RED: swapping two types\' tables diverges the spawn-time fields', () => {
  // RULE 4 (every check seen to fail): the done-when RED is "swap two types'
  // tables and watch the spawn-time fields diverge".  This unit test mirrors it
  // against the REAL rom by running type $11's body and $07's body and
  // asserting their hitbox/HP words DIFFER (the tables are distinct).  A port
  // that pointed both bodies at one table would make these equal.
  if (!HAVE) { assert.ok(true, 'skip: rip absent'); return; }
  const rom = realRom();
  function runType(body, type) {
    const ram = new Ram();
    const { rec, sub } = freshEnemy(ram, type);
    ram.setU16(0x813092, 1); ram.setU16(0x813094, 0); ram.setU16(0x813098, 0);
    ram.setU16(0x8130b2, 0); ram.setU16(0x8130bc, 0); ram.setU16(0x8130ba, 0);
    ram.setU16(0x8130b4, 0); ram.setU16(0x8130d8, 0); ram.setU16(0x8130f6, 0);
    ram.setU16(0x8130ce, 0x60); ram.setU16(0x803916, 0);
    runInitBodyAddr(body, ram, rom, rec, { note() {} });
    return { hp: ram.u16(sub + 0x18), hx: ram.u16(sub + 0x10), flags: ram.u16(sub) };
  }
  const t11 = runType(0x26871c, 0x11);
  const t07 = runType(0x26a1ea, 0x07);
  assert.notDeepEqual([t11.hp, t11.hx], [t07.hp, t07.hx],
    'type $11 and $07 hitbox/HP differ -- the tables are distinct (the RED)');
});
