// WAVE 23/W170/W171 -- the stage-1 bodies plus the first two stage-2 bodies
// (src/initbody.js).  These tests run the
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
import { REMAP, remapBucket } from '../src/effects.js';

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

test('the stage-1, Stage-2, and W200 Stage-3 bodies are dispatched', () => {
  // the addresses the spawn walker resolves for the 21 stage-1 types (census).
  const want = new Set([
    0x269bce, 0x26a1ea, 0x26a4bc, 0x26a794, 0x26aba0, 0x26871c, 0x2680b8,
    0x2766ae, 0x276824, 0x272a4a, 0x296fb0, 0x269754, 0x273802, 0x27462a,
    0x27581a, 0x275da0, 0x277278, 0x26b484, 0x2926e2,
  ]);
  for (const a of want) assert.ok(INIT_BODY_ADDRESSES.includes(a),
    `init+8 body $${a.toString(16)} is not in the dispatch table`);
  // W57: $26C1CA is the TWENTIETH, and it is NOT one of the 21 stage-1 SCRIPT
  // types -- `want` above is unchanged and still all present. Type $1C is
  // spawned only by the midboss's DEATH ($26B7E0/$26B7E2), so it was outside
  // every denominator this project has counted, which is exactly why the live
  // page stopped on it (W56). Asserted separately so the script's 19 and the
  // deferred one stay two different numbers.
  assert.ok(INIT_BODY_ADDRESSES.includes(0x26c1ca),
    'W57: type $1C\'s body $26C1CA -- what the midboss\'s death spawns');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x296d8a),
    'W103: type $1E\'s body $296D8A -- the boss\'s carrier enemy (E 8 spawns)');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x277836),
    'W170: stage-2 type $95 body $277836');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x276946),
    'W171: stage-2 type $8D body $276946');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27751c),
    'W172: stage-2 type $8F body $27751C');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x275154),
    'W173: stage-2 type $84 body $275154');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27980a),
    'W174: stage-2 type $90 body $27980A');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27a454),
    'W175: stage-2 type $96 body $27A454');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x2789f6),
    'W176: stage-2 type $8C body $2789F6');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x279aa2),
    'W177: stage-2 type $91 body $279AA2');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x279cd0),
    'W178: stage-2 type $92 body $279CD0');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x277de8),
    'W179: stage-2 type $97 body $277DE8');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x27a0e8),
    'W180: stage-2 type $94 body $27A0E8');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x279ec2),
    'W181: stage-2 type $93 body $279EC2');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x275bb6),
    'W182: stage-2 type $86 body $275BB6');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x297120),
    'W183: stage-2 boss type $30 entry body $297120');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x29bb26),
    'W185: stage-2 boss satellite type $4D body $29BB26');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x2653ee),
    'W192: stage-3 opening type $3E body $2653EE');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x263a58),
    'W193: stage-3 type $36 body $263A58');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x264740),
    'W194: stage-3 type $37 body $264740');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x266968),
    'W195: stage-3 type $3C body $266968');
  assert.ok(INIT_BODY_ADDRESSES.includes(0x264d5a),
    'W196: stage-3 type $3B body $264D5A');
  for (const body of [0x264c1c, 0x264c84, 0x264cec])
    assert.ok(INIT_BODY_ADDRESSES.includes(body),
      `W197: shared-handler variant body $${body.toString(16)}`);
  for (const body of [0x26c26e, 0x26d446, 0x265a5c])
    assert.ok(INIT_BODY_ADDRESSES.includes(body),
      `W198: carrier/child body $${body.toString(16)}`);
  assert.ok(INIT_BODY_ADDRESSES.includes(0x2657a0),
    'W199: Stage-3 type $3F body $2657A0');
  for (const body of [0x265bf4, 0x265df0, 0x266324])
    assert.ok(INIT_BODY_ADDRESSES.includes(body),
      `W200: carrier/child body $${body.toString(16)}`);
  assert.equal(INIT_BODY_ADDRESSES.length, 51,
    `19 script-spawned body addresses ($07/$27 share $26A1EA, $20/$21 share `
    + `$272A4A) plus W57's deferred $26C1CA, W103's boss-spawned $296D8A, `
    + `W170's $277836, W171's $276946, W172's $27751C, W173's $275154, `
    + `W174's $27980A, W175's $27A454, W176's $2789F6, W177's $279AA2, `
    + `W178's $279CD0, W179's $277DE8, W180's $27A0E8, W181's $279EC2, and `
    + `W182's $275BB6, W183's $297120, W185's $29BB26, W192's $2653EE, and `
    + `W193's $263A58, W194's $264740, W195's $266968, W196's $264D5A, and `
    + `W197's $264C1C/$264C84/$264CEC, and W198's `
    + `$26C26E/$26D446/$265A5C, W199's $2657A0, and W200's `
    + `$265BF4/$265DF0/$266324`);
});

test('runInitBodyAddr throws on an unknown body address', () => {
  const ram = new Ram();
  const { rec } = freshEnemy(ram, 0x11);
  assert.throws(() => runInitBodyAddr(0x281000, ram, realRomMaybe(), rec, { note() {} }),
    /UNPORTED.*not in the live init-body registry/);
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

test('type $10/$11 movement layer selects the visible front death bucket',
  { skip: !HAVE && 'rip absent' }, () => {
  const rom = realRom();
  for (const [type, body, movement, site] of [
    [0x11, 0x26871c, 0x231d58, 0x268852],
    [0x10, 0x2680b8, 0x231e80, 0x2681dc],
  ]) {
    const ram = new Ram();
    const { rec, sub } = freshEnemy(ram, type);
    ram.setU32(rec + 0x12, movement);
    ram.setU16(0x813092, 1); ram.setU16(0x813094, 0); ram.setU16(0x813098, 0);
    ram.setU16(0x8130b2, 0); ram.setU16(0x8130b4, 0);
    ram.setU16(0x8130ba, 0); ram.setU16(0x8130bc, 0);
    ram.setU16(0x8130ce, 0x60); ram.setU16(0x803916, 0);
    runInitBodyAddr(body, ram, rom, rec, { note() {} });
    assert.equal(ram.u8(sub + 0x1f), 4, `type $${type.toString(16)} movement layer`);
    assert.equal(ram.u8(sub + 0x1e), 8, `type $${type.toString(16)} doubled layer`);
    assert.equal(remapBucket(rom, REMAP.death267FA0, 0, site), 0,
      'the old mistranslation selected the hidden bucket 0');
    assert.equal(remapBucket(rom, REMAP.death267FA0, ram.u8(sub + 0x1e), site), 0x0c,
      'the ROM layer selects bucket 3 in front of the building');
  }
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
