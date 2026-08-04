// WAVE 21 -- the export is a DENOMINATOR, and this file is where it is pinned.
//
// Two classes of bug motivate every assertion below, and both have happened:
//
//   LOUD   wave 15 crashed on $B086/$B088 -- a ported handler indexed a ROM
//          table nobody had exported. romByteReader throws with the address,
//          which is the right shape, but it throws at RUN time and only if a
//          scenario reaches that handler. The census found 28 more ranges in
//          the same state.
//
//   QUIET  metasprite $A2 (18 records, $95FB..$9643, named by explosion
//          scripts 4 and 5) was dropped by export_metasprites.py behind an
//          invented `n > 16` bound. drawMetasprite() returns the cursor
//          unchanged for a missing id: the boss's death explosion would have
//          DRAWN NOTHING and thrown nothing. That is the failure mode this
//          project has agreed not to have, and no test could see it because
//          every test asked "is what we shipped right?" and none asked "is
//          what the ROM names shipped?".
//
// So the assertions here run in the second direction. The exhaustive version
// lives in tools/tablecoverage.py (walks all 42 handlers with a real decoder);
// this file pins the counts the ledger quotes and the ids the shipped JSON
// must contain, so `node --test` alone catches a regression.
//
// EVERY NUMBER BELOW WAS RE-MEASURED OUT OF assets/prg.bin ON 2026-08-02.
// Where it disagrees with a worklog, the disagreement is written down.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS, assetOrThrow, loadEnemyTables, loadMetasprites } from './helpers.js';

const hex = (a) => `$${a.toString(16).toUpperCase().padStart(4, '0')}`;

const rom = () => loadEnemyTables();
const prg = () => new Uint8Array(readFileSync(join(ASSETS, 'prg.bin')));
const at = (p, a) => p[a - 0x8000];

// ---------------------------------------------------------------- the ledger
//
// 20-plan-completeness.md 1a quotes these. A ledger nobody re-derives rots;
// this is the re-derivation, and it runs on every `node --test`.

test('$AE1C is 42 entries / 84 bytes, and $AE70 is the RTS after it', () => {
  const p = prg();
  const blk = rom().blocks.find((b) => b.name === 'dispatch');
  assert.equal(blk.base, 0xAE1C);
  assert.equal(blk.bytes.length, 84, '42 entries x 2 bytes');
  assert.equal(at(p, 0xAE70), 0x60, '$AE70 RTS -- entries 0 and 31 point at it');
  // $83E4 does an 8-bit ASL with no bounds check, so the index is
  // (type AND $7F). Every one of the 42 targets must be inside PRG or the
  // dispatch would jump into RAM.
  for (let e = 0; e < 42; e++) {
    const t = rom().word(0xAE1C + 2 * e);
    assert.ok(t >= 0x8000, `entry ${e} -> ${hex(t)} is outside PRG`);
  }
  assert.equal(rom().word(0xAE1C + 2 * 0), 0xAE70);
  assert.equal(rom().word(0xAE1C + 2 * 31), 0xAE70);
  assert.equal(rom().word(0xAE1C + 2 * 7), 0xB6E1, 'entry 7, stage 1 first wall');
  assert.equal(rom().word(0xAE1C + 2 * 19), 0xB747, 'entry 19, the biggest wall');
  assert.equal(rom().word(0xAE1C + 2 * 24), 0xB914, 'entry 24, the boss core');
  assert.equal(rom().word(0xAE1C + 2 * 25), 0xB913, 'entry 25 is a lone RTS');
});

test('the spawn-engine tables are 21 / 22 / 24 / 121, and they abut', () => {
  // $A592 formation geometry: 21 entries, NOT the 20 in 00-recon-enemies.md.
  // $A592..$A5BB is 42 bytes and $A5BC is where $A42F reads the pattern table,
  // so 21 is forced by the two base addresses the ROM's own instructions cite.
  assert.equal((0xA5BC - 0xA592) / 2, 21, '$A592 formation geometry');
  // index 20 = B3 2C, used by cmd $93 -- the entry 00-recon dropped.
  assert.equal(rom().read(0xA592 + 2 * 20), 0xB3);
  assert.equal(rom().read(0xA592 + 2 * 20 + 1), 0x2C);
  // $A5BC pattern: 22 entries x 3 bytes, ending at the descriptor POINTERS.
  assert.equal((0xA5FE - 0xA5BC) / 3, 22, '$A5BC spawn patterns');
  // the two pointers at $A5FE/$A600, read by $A397 LDA $A5FE,Y
  assert.equal(rom().word(0xA5FE), 0xA662, 'table A pointer');
  assert.equal(rom().word(0xA600), 0xA602, 'table B pointer');
  // table B: 24 entries x 4, $A602..$A661, abutting table A at $A662.
  assert.equal((0xA662 - 0xA602) / 4, 24, '$A602 table B');
  // table A: stride 3, cmds $00-$78 = 121 entries. MEASURED, and it corrects
  // the census's arithmetic: $A662 + 3*$78 = $A7CA is entry $78's first byte,
  // its four-byte read ends at $A7CD, and $A7CE/$A7CF are two slack bytes
  // before the stage pointer table at $A7D0. The census wrote
  // "$A662 + 3*$78 + 3 = $A7D0"; that sum is $A7CD. The COUNT, 121, stands.
  assert.equal(0xA662 + 3 * 0x78, 0xA7CA);
  assert.equal(0xA7D0 - (0xA662 + 3 * 0x78 + 4), 2, 'two slack bytes');
  assert.equal(0x78 + 1, 121, 'cmds $00-$78');
});

test('$ADC1 is nine 4-byte animator groups and $AE71 six explosion scripts', () => {
  const b = rom().blocks;
  assert.equal(b.find((x) => x.name === 'animGroups').bytes.length, 36);
  assert.equal(b.find((x) => x.name === 'explosionScripts').bytes.length, 40);
  for (let s = 0; s < 6; s++) {
    const p = rom().word(0xAE71 + 2 * s);
    assert.ok(p >= 0xAE7D && p < 0xAE99, `script ${s} -> ${hex(p)}`);
  }
});

test('$C439 is SEVEN arms and $C447 FOUR stream pointers', () => {
  // structure.txt calls the first table 11 entries. It is 7: an eighth entry
  // would start at $C447, which $C44F `LDA $C447,X` reads as the POINTER
  // table. Both are inside the lateSpawnerDispatch block wave 21 exported.
  const arms = [0xC486, 0xC546, 0xC686, 0xC5AD, 0xC653, 0xC6DE, 0xC429];
  arms.forEach((a, i) => assert.equal(rom().word(0xC439 + 2 * i), a, `arm ${i}`));
  const streams = [0xC526, 0xC58D, 0xC633, 0xC752];
  streams.forEach((a, i) => assert.equal(rom().word(0xC447 + 2 * i), a));
  // and every stream pointer must itself be readable, which is the whole
  // point of exporting the approach* blocks as data runs bounded by code.
  for (const s of streams) assert.doesNotThrow(() => rom().read(s));
});

// ------------------------------------------- the tables the handlers index
//
// The census enumerated 49 ROM addresses that 24 unported handlers index and
// no exporter shipped. Porting a handler that indexes an unexported table is
// the wave-15 crash by design, so this list is the port's read contract.

const CENSUS_TABLES = [
  0xAF0A, 0xB01D, 0xB33B, 0xB3C2, 0xB42F, 0xB45C, 0xB4E4, 0xB4EB, 0xB650,
  0xB606, 0xB612, 0xB6D2, 0xB6D9, 0xB6DD, 0xB787, 0xB78F, 0xB797, 0xB799,
  0xB852, 0xB8E6, 0xB8E9, 0xB8EC, 0xB8EF, 0xB8F8, 0xB901, 0xB90A, 0xBAF7,
  0xBAFB, 0xBAFF, 0xBB07, 0xBB82, 0xC439, 0xC447, 0xC4F4, 0xC56D, 0xC601,
  0xC67A, 0xC684, 0xC87B, 0xC893, 0xC6CA, 0xC6CC, 0xC6CE, 0xC750, 0xC936,
  0xCA29, 0xCA49, 0xCA50, 0xCA57,
];

test('every table 20-recon-enemy-census.md 4 lists is readable', () => {
  const r = rom();
  const gaps = CENSUS_TABLES.filter((a) => {
    try { r.read(a); return false; } catch { return true; }
  });
  assert.deepEqual(gaps.map(hex), [],
    'these are indexed by unported handlers and would throw at port time');
});

test('the six routines wave 22 needs can read everything they index', () => {
  // handlerflow.py, re-run 2026-08-02. These are the ONLY PRG bases the six
  // routines index besides the sound driver's ($ECB2/$EFCD-$EFCF, which live
  // in assets/sound/tables.json).
  const need = {
    '$AF2E entry 15 floor hatch': [0xB01D],
    '$AF88 entry 16 ceiling hatch': [0xB01D],
    '$B311 entry 9 floor-hatch child': [0xB33B],
    '$B3CB entry 12 ceiling-hatch child': [0xB33B],
    '$B6E1 entry 7 floor walker': [0xB6D2, 0xB6D9, 0xB6DD],
    '$B747 entry 19 ceiling walker': [0xB6D2, 0xB6D9, 0xB6DD],
  };
  for (const [who, addrs] of Object.entries(need)) {
    for (const a of addrs) {
      assert.doesNotThrow(() => rom().read(a), `${who} indexes ${hex(a)}`);
    }
  }
  // and the CONTENT, so a block cited one byte out is caught too
  assert.deepEqual([...Array(9)].map((_, i) => rom().read(0xB01D + i)),
    [0x64, 0x46, 0x3C, 0x37, 0x32, 0x2D, 0x28, 0x23, 0x1E], '$B01D 9 ranks');
  assert.deepEqual([...Array(8)].map((_, i) => rom().read(0xB33B + i)),
    [0x5E, 0x5F, 0x60, 0x61, 0x62, 0x61, 0x60, 0x5F], '$B33B 8 flip frames');
  assert.deepEqual([...Array(7)].map((_, i) => rom().read(0xB6D2 + i)),
    [0x3C, 0x37, 0x32, 0x2D, 0x28, 0x28, 0x23], '$B6D2 7 ranks');
  assert.deepEqual([...Array(4)].map((_, i) => rom().read(0xB6D9 + i)),
    [0x1C, 0x1C, 0x1F, 0x1F], '$B6D9');
  assert.deepEqual([...Array(4)].map((_, i) => rom().read(0xB6DD + i)),
    [0x01, 0x03, 0x02, 0x04], '$B6DD');
});

test('every exported enemy block is pinned on the instruction after it', () => {
  const p = prg();
  const json = JSON.parse(readFileSync(assetOrThrow('enemies/tables.json'), 'utf8'));
  let anchored = 0;
  for (const b of json.blocks) {
    const end = parseInt(b.end.replace('$', ''), 16);
    const base = parseInt(b.rom.replace('$', ''), 16);
    assert.equal(end - base, b.bytes.length, `${b.name} len`);
    if (!b.anchor) continue;                       // the 9 pre-wave-21 blocks
    anchored++;
    const a = parseInt(b.anchor.rom.replace('$', ''), 16);
    assert.equal(a, end, `${b.name} anchor must be the first byte past it`);
    b.anchor.bytes.forEach((v, i) => assert.equal(at(p, a + i), v,
      `${b.name}: ${b.anchor.is} -- byte ${i} at ${hex(a + i)}`));
  }
  // 25 from wave 21 + 5 from wave 32b (the $0600 arm pool's tables, plus
  // $BEEA, which W32c's reader indexes and W32b exported so that rooting
  // $BEF3 in tablecoverage.py does not just relocate the gap).
  assert.equal(anchored, 30, 'the 25 wave-21 ranges plus W32b 5');
  assert.equal(json.blocks.length, 39);
});

test('no two exported enemy blocks overlap', () => {
  // romByteReader takes the FIRST block containing an address, so an overlap
  // silently picks a winner. With 34 blocks that is past eyeballing.
  const bs = rom().blocks
    .map((b) => [b.base, b.base + b.bytes.length, b.name])
    .sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < bs.length; i++) {
    assert.ok(bs[i][0] >= bs[i - 1][1],
      `${bs[i - 1][2]} and ${bs[i][2]} overlap`);
  }
});

test('a read outside every block still throws, with the address', () => {
  // The loudness is the feature. $CF2D (the ending chain) is deliberately
  // unexported -- see tools/tablecoverage.py KNOWN_GAPS -- and must stay loud.
  assert.throws(() => rom().read(0xCF2D), /\$CF2D is not in any exported range/);
  assert.throws(() => rom().read(0x8000), /\$8000 is not in any exported range/);
});

// ------------------------------------------------------------- metasprites
//
// The $A2 class of bug. These ask the ROM what it names, then demand it.

test('metasprite $A2 exists, 18 records, ending exactly where $A3 begins', () => {
  const ms = loadMetasprites();
  assert.ok(ms[0xA2], 'id $A2 -- dropped for 20 waves by an invented n > 16');
  assert.equal(ms[0xA2].length, 18);
  const p = prg();
  const w = (a) => at(p, a) | (at(p, a + 1) << 8);
  const a2 = w(0x8E9E + ((0xA2 * 2) & 0xFF));     // $8ABA LDX $8E9E,Y
  const a3 = w(0x8E9E + ((0xA3 * 2) & 0xFF));
  assert.equal(a2, 0x95FB);
  assert.equal(a3, 0x9644);
  assert.equal(a2 + 1 + 18 * 4, a3, '$95FB + 1 + 72 = $9644');
  assert.equal(at(p, a2), 18, 'the count byte $8AC6 reads');
});

test('the high metasprite table ends at id $A3, proven by $8EE0', () => {
  // $8EE0 (id $A1's slot) holds $8EE6, which is the byte after id $A3's slot
  // at $8EE4/$8EE5 -- i.e. $A1's own RECORD occupies what would be slots
  // $A4-$A8. Reading those five slots as pointers reproduces $A1's nine bytes
  // exactly, which is why the export stops at $A3 instead of at a made-up
  // record-count bound.
  const p = prg();
  const w = (a) => at(p, a) | (at(p, a + 1) << 8);
  assert.equal(w(0x8EE0), 0x8EE6, "id $A1's pointer is the end of the table");
  assert.equal(0x8E9E + ((0xA3 * 2) & 0xFF) + 2, 0x8EE6, "$A3's slot is last");
  assert.equal(at(p, 0x8EE6), 2, "$A1's record is 2 entries, 9 bytes");
  assert.deepEqual([w(0x8EE6), w(0x8EE8), w(0x8EEA), w(0x8EEC), w(0x8EEE)],
    [0x0402, 0x01DB, 0x0400, 0x01DD, 0x0108],
    'slots $A4-$A8 read back as $A1\'s payload, not as pointers');
  const ms = loadMetasprites();
  assert.equal(Object.keys(ms).length, 157,
    'ids $00-$A3 minus the 7 that point at the null record $8D9D');
  for (const k of Object.keys(ms)) assert.ok(Number(k) <= 0xA3, `id ${k} > $A3`);
});

test('every id the explosion scripts name exists in metasprites.json', () => {
  // Scripts 4 ($AE8B: A2 6B 6A 69 68 6A 00) and 5 ($AE92: A0 68 A2 69 6A 6B
  // 00) are the two that name $A2. Script 4 is set by $B988 (the boss core's
  // death) and script 5 by $BB75. Read out of the EXPORTED block, so this
  // fails if either the scripts or the metasprites regress.
  const ms = loadMetasprites();
  const r = rom();
  let named = 0;
  for (let s = 0; s < 6; s++) {
    let a = r.word(0xAE71 + 2 * s);
    for (let n = 0; r.read(a) !== 0; a++, n++) {
      assert.ok(n < 64, `script ${s} has no 0 terminator`);
      const id = r.read(a);
      named++;
      assert.ok(ms[id] && ms[id].length > 0,
        `explosion script ${s} at ${hex(a)} names metasprite `
        + `$${id.toString(16).toUpperCase()} and the export has no record for `
        + 'it -- drawMetasprite() would draw NOTHING and throw nothing');
    }
  }
  // 28 non-zero id bytes over the six walks, and that number is bigger than
  // the distinct bytes because SCRIPT 4 OVERLAPS SCRIPT 2: script 4 starts at
  // $AE8B and script 2 at $AE8C, so script 4 is `$A2` prepended to script 2
  // and they share the same terminator at $AE91. That is exactly why $A2 was
  // invisible -- it is one byte, in front of a script that already worked.
  //   0 $AE7D 26 27 28      3 $AE86 33 34 35 36
  //   1 $AE81 29 2A 2B 2C   4 $AE8B A2 6B 6A 69 68 6A
  //   2 $AE8C 6B 6A 69 68 6A  5 $AE92 A0 68 A2 69 6A 6B
  assert.equal(named, 28, 'the six walks total 28 id bytes (2 and 4 overlap)');
  assert.ok(ms[0xA2], '$A2 specifically');
});

test('every id in an exported metasprite-valued table exists', () => {
  // Table-sourced ids, the ones an immediate-scan misses. Each row below is
  // `LDA <base>,Y` followed (past its branches) by `STA $012C,X`, which is the
  // anim field $8B4D reads. Extents are the table's own, from the census.
  const ms = loadMetasprites();
  const r = rom();
  const rows = [
    ['$AF21 LDA $AF0A,Y  the six blinking pickups', 0xAF0A, 6],
    ['$B334 LDA $B33B,Y  the hatch children flip', 0xB33B, 8],
    // $B6C5 stores into $012C,X, so this is a METASPRITE row and not the
    // second speed table the census's grouping suggests. W22 needs that.
    ['$B6C5 LDA $B6D9,Y  the terrain walkers', 0xB6D9, 4],
    ['$B392 LDA $B3C2,Y  entry 11 spin', 0xB3C2, 9],
    ['$B06D LDA $B086,Y  the aiming turret', 0xB086, 6],
    ['$B7B5 LDA $B797,Y  entry 23 mid-boss', 0xB797, 2],
    ['$B936 LDA $B8EF,Y  the boss core damage frames', 0xB8EF, 6],
    ['$C6B3 LDA $C6CA,Y  the $3A-gated approach', 0xC6CA, 2],
  ];
  for (const [why, base, n] of rows) {
    for (let i = 0; i < n; i++) {
      const id = r.read(base + i);
      if (id === 0) continue;               // 0 = invisible ($8B50 BEQ $8B89)
      assert.ok(ms[id] && ms[id].length > 0,
        `${why}: byte ${hex(base + i)} = $${id.toString(16).toUpperCase()} `
        + 'is not in metasprites.json');
    }
  }
  // $B8EF's row is 6C 6D 6E 6F 70 71 then a 0 terminator -- pinned, because
  // the boss's damage ladder is what makes $A2's sibling ids live.
  assert.deepEqual([...Array(7)].map((_, i) => r.read(0xB8EF + i)),
    [0x6C, 0x6D, 0x6E, 0x6F, 0x70, 0x71, 0x00]);
});
