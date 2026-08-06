// W85 -- SPRITE BUCKET 2 ($805CC8), AND MAKING IT VISIBLE TO THE ORACLE.
//
// The defect these exist for: W82 ported the stage-1 boss's four A2 OBJECT
// routines, and every one of its twelve mutations left `seedcmp --segment 19000`
// reporting the identical first divergence.  The routines' only output is
// bucket 2 and nothing in this repo compared it, so the sweep was a gate for
// "does it still throw" and not for "is it right".  W82 said so in its own §6.2
// and made "trace bucket 2 before any further boss wave" its next step.
//
// WHAT IS PINNED HERE, and every value comes from the listing or from the bucket
// table read out of the cartridge -- never from running the port:
//   * the dumped address IS `BUCKETS[2].buffer`, so `src/state.js` cannot drift
//     from `src/spritequeue.js` by someone typing $805CC8 a second time;
//   * the length covers the buffer's MEASURED whole-stage high-water mark;
//   * `$80AFC4` is in the thirty-counter reset, which is what makes "everything
//     the port appended this frame is in [0, $80AFC4)" the port's own behaviour
//     rather than an assumption in the differ;
//   * the containment matcher itself, driven with records this file wrote, and
//     SEEN TO REPORT A MISS -- including the misaligned case that the bucket-14
//     check's `String.includes` would wrongly pass.
//
// Nothing here writes a constant and reads it back through the same constant
// (`docs/knowledge/03`).

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { BUCKETS, RECORD_BYTES, enqueueRegisters } from '../src/spritequeue.js';
import { SUM_ORDER, resetSpriteQueueCounters } from '../src/displaylist.js';
import { RAWDUMP_SPEC, CLAIMED, rawdumps } from '../src/state.js';
import { bucketContainment } from '../tools/portdiff.mjs';
import { W82 } from '../src/boss.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const HAVE = fs.existsSync(TABLES);
const TJ = HAVE ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = HAVE ? new (await import('../src/rom.js')).RomWindows(TJ.rom) : null;
const SKIP = HAVE ? false
  : 'rip/port/player.tables.json missing -- `python tools/export-tables.py`';

const B2 = BUCKETS[2];
const SPEC = RAWDUMP_SPEC.find((r) => r[0] === 'sprq2');

// [M] this session, over all 71 checkpoint rungs of `stage1-sweep`: the last
// non-zero byte in the $BC4-byte buffer at $805CC8 is at 192 -- SIXTEEN records
// -- and the high-water rung is lf12,000.  That is the number the dumped prefix
// has to clear, and it is written here so raising or lowering `sprq2`'s length
// has to argue with a measurement.
const MEASURED_HIGH_WATER_BYTES = 192;

// ---------------------------------------------------------------------------
// 1. THE COLUMN, AND THAT IT NAMES THE BUCKET TABLE RATHER THAN A SECOND COPY

test('src/state.js traces sprite bucket 2 and takes its ADDRESS from the bucket '
  + 'table, so $805CC8 is written down once', () => {
  assert.ok(SPEC, 'RAWDUMP_SPEC must carry `sprq2`');
  assert.strictEqual(SPEC[1], B2.buffer,
    'the dumped address must be BUCKETS[2].buffer, which tools/w10/buckets.py '
    + 'read out of the image at the copy site $23D3F4');
  assert.strictEqual(B2.buffer, 0x805cc8);
  assert.strictEqual(B2.counter, 0x80afc4);
});

test('the sprq2 prefix is whole records, clears the buffer\'s measured '
  + 'whole-stage high-water mark, and does not exceed the bucket', () => {
  const len = SPEC[2];
  assert.strictEqual(len % RECORD_BYTES, 0,
    'a dump that ends mid-record cannot be split on the ROM\'s own boundary');
  assert.ok(len >= MEASURED_HIGH_WATER_BYTES,
    `the dump is ${len} bytes but the board touched ${MEASURED_HIGH_WATER_BYTES}`);
  assert.ok(len <= B2.capBytes,
    'dumping past $805CC8 + $BC4 would dump the NEXT bucket, not this one');
});

test('sprq2 is NOT in CLAIMED: the comparison is containment, not equality', () => {
  // The board's bucket 2 carries records from producers this port does not
  // have.  A column in CLAIMED is compared for EQUALITY by portdiff's `cols`
  // loop, which would be red on every frame for a reason that is not a bug.
  assert.ok(!CLAIMED.includes('sprq2'),
    'putting sprq2 in CLAIMED would compare the whole bucket by equality');
  assert.ok(!CLAIMED.includes('sprq'), 'bucket 14 is handled the same way');
});

test('rawdumps() emits sprq2 as the hex of the dumped prefix', () => {
  const ram = new Ram();
  ram.setU16(B2.buffer, 0xdead);
  ram.setU16(B2.buffer + SPEC[2] - 2, 0xbeef);
  const o = rawdumps({ ram });
  assert.strictEqual(o.sprq2.length, SPEC[2] * 2);
  assert.ok(o.sprq2.startsWith('dead'));
  assert.ok(o.sprq2.endsWith('beef'));
});

// ---------------------------------------------------------------------------
// 2. WHY [0, $80AFC4) IS THE PORT'S OWN RECORD SET AND NOT AN ASSUMPTION

test('$80AFC4 is one of the thirty counters call #4\'s tail zeroes, so at the '
  + 'top of a logic frame bucket 2\'s offset is 0', () => {
  assert.ok(SUM_ORDER.includes(B2.counter),
    '$80AFC4 must be one of the thirty $23D70C clears');
  const ram = new Ram();
  ram.setU16(B2.counter, 0x1234);
  resetSpriteQueueCounters(ram);                  // $23D70C..$23D71C
  assert.strictEqual(ram.u16(B2.counter), 0,
    'if the counter did not start each frame at 0, [0,$80AFC4) would not be '
    + 'the records THIS frame appended');
});

test('a bucket-2 producer appends exactly $C bytes and advances the counter by '
  + '$C, which is what makes the board\'s dump splittable on record boundaries',
() => {
  const ram = new Ram();
  const a = enqueueRegisters(ram, 2, 0x00400080, 0x00123456, 0x0a40, 0x0013);
  const b = enqueueRegisters(ram, 2, 0x00800100, 0x00654321, 0x0418, 0x0017);
  assert.strictEqual(a, 0);
  assert.strictEqual(b, RECORD_BYTES);
  assert.strictEqual(ram.u16(B2.counter), 2 * RECORD_BYTES);
});

test('the boss\'s four A2 OBJECT routines really do land in bucket 2 -- SEVEN '
  + 'records, which is the port\'s measured per-frame maximum on this ladder',
{ skip: SKIP }, () => {
  const ram = new Ram();
  const a6 = 0x81523c;                       // the boss's sub-record (W62/W82)
  W82.obj2_292952(ram, a6);
  W82.obj3_292BFA(ram, ROM, a6);
  W82.obj4_292E0A(ram, ROM, a6);
  W82.obj5_292E3E(ram, ROM, a6);             // FOUR limbs, one call
  assert.strictEqual(ram.u16(B2.counter), 7 * RECORD_BYTES,
    'OBJECT 2 + OBJECT 3 + OBJECT 4 + OBJECT 5\'s four limbs = seven records');
  assert.ok(7 * RECORD_BYTES <= SPEC[2],
    'the dumped prefix must be able to hold everything the port can append');
});

// ---------------------------------------------------------------------------
// 3. THE MATCHER, AND EVERY ARM OF IT SEEN TO FIRE

const R = (n) => n.toString(16).padStart(2, '0').repeat(12);   // a 12-byte record
const A = R(0xa1), B = R(0xb2), C = R(0xc3), D = R(0xd4);
const LEN = 6 * RECORD_BYTES;                  // a 6-record dump, for these tests
const pad = (s) => s.padEnd(LEN * 2, '0');

test('containment: every port record present in the board => 0 missing, ordered',
() => {
  const r = bucketContainment(pad(A + B + C), pad(A + B + C), 3 * 12, LEN);
  assert.strictEqual(r.records, 3);
  assert.strictEqual(r.missing.length, 0);
  assert.strictEqual(r.past, 0);
  assert.strictEqual(r.ordered, true);
});

test('containment tolerates records the port cannot produce, before and between '
  + 'its own -- that is the whole reason it is not equality', () => {
  const r = bucketContainment(pad(D + A + D + B), pad(A + B), 2 * 12, LEN);
  assert.strictEqual(r.missing.length, 0);
  assert.strictEqual(r.ordered, true, 'A at 12 then B at 36 is non-decreasing');
});

test('RED: one wrong byte in one port record is reported MISSING, at its own '
  + 'offset', () => {
  const wrong = B.slice(0, 22) + 'ff';
  const r = bucketContainment(pad(A + B + C), pad(A + wrong + C), 3 * 12, LEN);
  assert.strictEqual(r.records, 3);
  assert.strictEqual(r.missing.length, 1);
  assert.strictEqual(r.missing[0].off, 12);
  assert.strictEqual(r.missing[0].rec, wrong);
  assert.strictEqual(r.ordered, false);
});

test('RED: a port record that exists in the board ONLY at a misaligned offset is '
  + 'MISSING -- the case bucket 14\'s String.includes would wrongly pass', () => {
  // Build a board dump in which A appears straddling two record slots and
  // nowhere on a boundary.  `board.includes(A)` is TRUE; no producer can have
  // written it there, because every one appends $C bytes from a counter that
  // starts at 0.
  const straddle = pad(R(0x00).slice(0, 12) + A + R(0x00).slice(0, 12));
  assert.ok(straddle.includes(A), 'the substring really is there');
  const r = bucketContainment(straddle, pad(A), 12, LEN);
  assert.strictEqual(r.missing.length, 1,
    'a record found only across a boundary is not a record the board emitted');
});

test('ORDER is a real report and can be false while containment holds', () => {
  const r = bucketContainment(pad(C + B + A), pad(A + B + C), 3 * 12, LEN);
  assert.strictEqual(r.missing.length, 0, 'all three are present...');
  assert.strictEqual(r.ordered, false, '...but the port emitted them backwards');
});

test('ORDER survives a record the port legitimately emits twice', () => {
  const r = bucketContainment(pad(A + A + B), pad(A + A + B), 3 * 12, LEN);
  assert.strictEqual(r.missing.length, 0);
  assert.strictEqual(r.ordered, true,
    'the second A must match the board\'s SECOND A, not fail on the first');
});

test('records past the dumped prefix are COUNTED, never silently skipped', () => {
  const short = 2 * RECORD_BYTES;
  const r = bucketContainment(pad(A + B), pad(A + B + C), 3 * 12, short);
  assert.strictEqual(r.records, 2, 'only the two inside the prefix were checked');
  assert.strictEqual(r.past, 1);
  assert.strictEqual(r.missing.length, 0);
  assert.strictEqual(r.ordered, false,
    'a frame with an unchecked record is not a frame the order claim covers');
});

test('a port that appended nothing checks nothing and is not a failure', () => {
  const r = bucketContainment(pad(A + B), pad(''), 0, LEN);
  assert.strictEqual(r.records, 0);
  assert.strictEqual(r.missing.length, 0);
  assert.strictEqual(r.ordered, true);
});
