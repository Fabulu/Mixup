// WAVE 98 -- THE BOSS'S BODY ART.
//
// W96 got the stage-1 boss ARRIVING, descending, handing off and fighting for
// 559 logic frames, and the owner could not see one pixel of it: the port
// emitted the right records at the right coordinates and there was no picture
// at the end of any of them.  [M] 4,071 records lacking art over 75 streams.
//
// THE PREMISE THIS FILE HOLDS DOWN, because it is the one that decides the size
// of the export and W81 §1.1 is what happens when it is taken on trust:
//
//   **THE BOSS'S ART IS 244 STREAMS AND THE CENSUS SAW 58.**  58 is what a
//   559-frame life happens to index; 244 is what the six tables the cartridge
//   itself pins actually hold.  A harvest sized off the run would ship a
//   quarter of the battleship and the hole would open the first time the fight
//   lasted longer.
//
// AND TWO THINGS THAT LOOK LIKE ART AND ARE NOT, both of which the exporter's
// own comments call "sprite tables":
//
//   [M] $292A08's 32 longwords are $40004000, $48004800 .. $C000C000 -- word
//       pairs written to ($46,A6).  Harvesting them would throw at export, and
//       W98/2 is what says so out of the cartridge rather than out of a memory.
//   [M] $292F84's SECOND longword per record is $E600EE00 / $E000E500, two
//       distinct values over 24 records.  Only `(A2)` is a picture.
//
// EVERY TEST BELOW WAS SEEN TO FAIL:
//
//   [M] the whole file against the bundle as it shipped at W96 (`--break
//       no-boss-shard`, which drops sprite shard 17 back out of the sheet):
//       W98/4, /5 and /6 RED, and /6 names all 55 of the boss's streams the
//       BOARD draws.
//   [M] W98/1 with any of the six table extents changed by one entry.
//   [M] W98/3 with $7E8AC removed from `W81_IMMEDIATES`.
//   [M] W98/7 with 17 taken back out of `SPR_ORDER`.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as artGate, MUTATIONS } from '../tools/w98bossartgate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const TOOL = (n) => fs.readFileSync(path.join(GAME, 'tools', n), 'utf8');
const CPU = path.join(GAME, 'tools/oracle/out/maincpu.bin');
const ASSETS = path.join(GAME, 'assets');
const have = fs.existsSync(CPU) && fs.existsSync(path.join(ASSETS, 'manifest.json'));

const cpu = have ? new Uint8Array(fs.readFileSync(CPU)) : null;
const be32 = (a) => (((cpu[a] << 24) | (cpu[a + 1] << 16) | (cpu[a + 2] << 8)
  | cpu[a + 3]) >>> 0);

// The six windows `tools/export-tables.py` pins, with the entry count each
// one's OWN INDEX ARITHMETIC can reach and the address the cartridge puts at
// the far end.  Both halves are re-derived here from the image.
const TABLES = [
  ['$292A88 OBJECT 0', 0x292a88, 32, 4, 0x292b08],
  ['$292B7A OBJECT 1', 0x292b7a, 32, 4, 0x292bfa],
  ['$292C2A OBJECT 3', 0x292c2a, 120, 4, 0x292e0a],
  ['$292E32 OBJECT 4', 0x292e32, 3, 4, 0x292e3e],
  ['$292ECA OBJECT 5', 0x292eca, 32, 4, 0x292f4a],
  ['$292F84 OBJECT 6', 0x292f84, 24, 16, 0x293104],
];

test('W98/1 the boss\'s art is 244 streams, and each table\'s far end is the '
  + 'next thing the CARTRIDGE names', { skip: !have && 'no maincpu.bin' }, () => {
  const all = new Set();
  for (const [name, base, n, stride, endsAt] of TABLES) {
    assert.equal(base + n * stride, endsAt,
      `${name}: ${n} entries at stride ${stride} must reach $${endsAt.toString(16)}`);
    for (let i = 0; i < n; i++) {
      const v = be32(base + i * stride);
      // a sprite stream start is a 24-bit word offset into the mask ROM, so the
      // top byte is zero and the value is under $800000. This is the property
      // $292A08's $40004000 fails, which is W98/2.
      assert.ok((v >>> 24) === 0 && v > 0 && v < 0x800000,
        `${name}[${i}] = $${v.toString(16)} is not a stream start`);
      all.add(v);
    }
  }
  all.add(0x06539c);                       // $292952 `move.l #$6539C,D2`
  assert.equal(all.size, 244,
    'the six tables plus OBJECT 2\'s immediate hold 244 DISTINCT streams. W96\'s '
    + 'census saw 58 of them and 58 is what a 559-frame life indexes, not what '
    + 'the boss has');
  // and the far ends are the cartridge's own, not this file's arithmetic:
  // $292932 is the A2 OBJECT list and it publishes three of the five.
  assert.equal(be32(0x292932 + 1 * 4), 0x292b08, '$292932[1] pins OBJECT 0\'s end');
  assert.equal(be32(0x292932 + 3 * 4), 0x292bfa, '$292932[3] pins OBJECT 1\'s end');
  assert.equal(be32(0x292932 + 4 * 4), 0x292e0a, '$292932[4] pins OBJECT 3\'s end');
  assert.equal(be32(0x292932 + 5 * 4), 0x292e3e, '$292932[5] pins OBJECT 4\'s end');
  assert.equal(be32(0x292932 + 6 * 4), 0x292f4a, '$292932[6] pins OBJECT 5\'s end');
  assert.equal(be32(0x292710 + 2), 0x293104,
    '$292710 `lea $293104,A0` pins OBJECT 6\'s end -- the MAIN script table');
});

test('W98/2 the TWO tables in the boss\'s windows that are NOT art',
  { skip: !have && 'no maincpu.bin' }, () => {
  // $292A08 -- the exporter's own comment calls it "the PART SPRITE table".
  // $2929AA/$292B40 `move.l (A0,D0.w),$46(A6)`: word pairs, not streams.
  const a08 = new Set();
  for (let i = 0; i < 32; i++) a08.add(be32(0x292a08 + i * 4));
  for (const v of a08) {
    assert.ok((v >>> 24) !== 0,
      `$292A08 holds $${v.toString(16)}, which would pass as a stream start`);
    assert.equal(v >>> 16, v & 0xffff,
      '$292A08\'s entries are the SAME WORD TWICE ($40004000 .. $C000C000)');
  }
  assert.equal(a08.size, 17, '17 distinct values over 32 entries');
  // $292F84 record: (A2) is the picture, $4(A2) is not.
  const second = new Set();
  for (let i = 0; i < 24; i++) second.add(be32(0x292f84 + i * 16 + 4));
  assert.deepEqual([...second].sort((x, y) => x - y), [0xe000e500, 0xe600ee00],
    '$4(A2) takes exactly two values over the 24 records, and neither is a stream');
  // and the harvest reads $292F84 at stride 16, i.e. `(A2)` only
  assert.ok(/\[17, 0x292f84, 24, 16,/.test(TOOL('export-web.mjs')),
    'the harvest row must read the FIRST longword of each 12-byte record only');
  assert.ok(!/0x292a08, \d+, 4/.test(TOOL('export-web.mjs')),
    '$292A08 must NOT be harvested');
});

test('W98/3 $7E8AC belongs to shard 4 and is an IMMEDIATE, not a table entry',
  { skip: !have && 'no maincpu.bin' }, () => {
  const s = TOOL('export-web.mjs');
  // $29709E `move.l #$7E8AC,D2` -- the operand is at $29709E+2.
  assert.equal(be32(0x29709e + 2), 0x0007e8ac,
    '$29709E\'s immediate is the claim; if the listing moved, this moves');
  assert.ok(/\[4, 0x07e8ac,/.test(s),
    'type $24\'s FIRST record goes in shard 4 beside its own table $2970D8, '
    + 'not in the boss shard');
  assert.ok(/\[4, 0x2970d8, 16, 4,/.test(s),
    'and the table it shipped WITH since W47 is still there -- the type had '
    + 'half its art, which is why nothing ever reported it');
});

test('W98/4 the shipped bundle holds all 244', { skip: !have && 'no bundle' }, () => {
  const r = artGate(['--quiet']);
  assert.equal(r.bossStreams, 244);
  assert.equal(r.bossShipped, 244,
    'every stream the boss\'s six tables and its immediate name has a picture');
});

test('W98/5 the BOARD\'s own display list draws the boss, and every stream it '
  + 'draws is in the sheet', { skip: !have && 'no bundle' }, () => {
  const r = artGate(['--quiet']);
  assert.ok(r.bossSeen >= 50,
    `the board draws ${r.bossSeen} of the boss's streams over stage1-sweep's 72 `
    + 'rungs; if this ever reads 0 the ladder or the attribution has moved and '
    + 'the check below is vacuous');
  assert.equal(r.bossMissing, 0);
  assert.ok(r.ok);
});

test('W98/6 and the comparison FAILS when the shard is taken away',
  { skip: !have && 'no bundle' }, () => {
  const before = artGate(['--quiet']);
  const red = artGate(['--quiet', '--break', 'no-boss-shard']);
  assert.equal(red.ok, false, 'dropping shard 17 must make this gate RED');
  assert.equal(red.bossMissing, before.bossSeen,
    'and EVERY one of the boss\'s streams the board draws must go missing -- '
    + 'that is the bundle exactly as it shipped at W96');
  assert.equal(red.bossShipped, 0);
  // the control: if the check cannot go red with only the boot shard, it is
  // not measuring the sheet at all. This is what caught the first draft of
  // `shardOf`, which keyed off colFrom and returned -1 for every stream.
  const control = artGate(['--quiet', '--break', 'boot-shard-only']);
  assert.equal(control.ok, false);
  // and a mutation that must NOT move the boss's verdict, but must move the
  // board-wide figure -- otherwise the two are the same number wearing two names
  const t24 = artGate(['--quiet', '--break', 'no-type24-immediate']);
  assert.equal(t24.ok, true, '$7E8AC is not the boss\'s');
  assert.ok(t24.missing > before.missing,
    'but the BOARD does draw it, so the board-wide report must notice');
  assert.deepEqual(Object.keys(MUTATIONS).sort(),
    ['boot-shard-only', 'no-boss-shard', 'no-type24-immediate']);
});

test('W98/7 the boss shard is DEFERRED and fetched LAST', () => {
  const s = TOOL('export-web.mjs');
  assert.ok(/\[17, 'boss'/.test(s), 'shard 17 exists and is named');
  assert.ok(/SPR_BOOT = \[0\]/.test(s),
    'shard 0 stays the ONLY boot shard: 367 KiB of battleship must not be a '
    + 'boot byte, and capture.bin and bundlegate must not move');
  const order = JSON.parse(s.match(/SPR_ORDER = Object\.freeze\((\[[\s\S]*?\])\)/)[1]);
  assert.equal(order[order.length - 1], 17,
    '[M] the boss\'s first record lands at lf8,144 = 137.6 s from the seed, '
    + 'where the LATEST deadline anything else in this bundle has is shard '
    + '11\'s +5.3 s. It is also the largest body here, so it goes last');
  for (const early of [7, 6, 10, 9, 13, 12, 8, 14, 16, 15, 3, 1, 2, 4, 5, 11]) {
    assert.ok(order.indexOf(early) < order.indexOf(17),
      `shard ${early}'s first need is earlier than the boss's 137.6 s`);
  }
});
