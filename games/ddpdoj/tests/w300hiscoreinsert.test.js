// W300: `$287CEE`, the high-score table INSERT.
//
// W297 asked for one specific test and this file is it: **insert a known sequence and assert
// the WHOLE table order, not one entry.** A shift loop that is off by one entry, or that
// walks a parallel array with the wrong stride, still leaves the inserted score exactly
// where you asked about it -- the damage shows up in the neighbours.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { hiscoreInsert287CEE, hiscoreSearch287D96, HISCORE } from '../src/hiscore.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.join(HERE, '..', 'rip', 'web', 'seed.bin');
const HAVE = existsSync(SEED);
const SKIP = HAVE ? false : 'the shipped seed is absent; skip, not pass';

/** The board's own RAM, so the table under test starts as the cartridge's. */
const boardRam = () => new Ram(new Uint8Array(readFileSync(SEED)));

const BUF = 0x81b420;                  // the P1-side buffer `$287BD2` fills
const BIG_BASE = 0x803838;             // the 12-byte-entry array
const WORD_BASES = [0x803874, 0x80387e, 0x803888, 0x803892, 0x80389c, 0x8038a6];

const scores = (ram) => [0, 1, 2, 3, 4].map((i) => ram.u32(HISCORE.scoresBase + i * 4));
const overflows = (ram) => [0, 1, 2, 3, 4].map((i) => ram.u16(HISCORE.overflowBase + i * 2));
const wordCol = (ram, col) => [0, 1, 2, 3, 4].map((i) => ram.u16(WORD_BASES[col] + i * 2));
/** The five 12-byte entries, as three longs each. */
const bigRows = (ram) => [0, 1, 2, 3, 4].map((i) =>
  [0, 1, 2].map((k) => ram.u32(BIG_BASE + i * 12 + k * 4)));

/** Fill the six word arrays and the 12-byte array with per-entry markers. */
function markTable(ram) {
  for (let i = 0; i < 5; i++) {
    for (let col = 0; col < 6; col++) ram.setU16(WORD_BASES[col] + i * 2, 0x1000 * (col + 1) + i);
    for (let k = 0; k < 3; k++) ram.setU32(BIG_BASE + i * 12 + k * 4, 0xa0000000 + i * 0x10 + k);
  }
}

/** Fill the caller's buffer with the six source words `$287D7A` reads. */
function markBuffer(ram) {
  for (let k = 0; k < 6; k++) ram.setU16(BUF + k * 2, 0xbe00 + k);
  ram.setU32(BUF + 0x0c, 0xdeadbeef);   // so a missing pointer write is visible
}

// ==================== 1. THE WHOLE TABLE ORDER, WHICH IS THE POINT

test('W300 inserting at the TOP shifts every entry down one and drops the last', { skip: SKIP }, () => {
  const ram = boardRam();
  const before = scores(ram);
  const r = hiscoreInsert287CEE(ram, BUF, 0, 0x02000000);
  assert.equal(r.inserted, true);
  assert.equal(r.index, 0);
  // The whole table, not one entry: the new score on top, four survivors below it, and
  // 699,653 -- the board's lowest -- gone.
  assert.deepEqual(scores(ram), [0x02000000, ...before.slice(0, 4)]);
});

test('W300 inserting in the MIDDLE leaves the entries ABOVE it untouched', { skip: SKIP }, () => {
  // `count` is `4 - index`, so an insert at 2 shifts exactly entries 2 and 3 down and
  // entries 0 and 1 are never written. An off-by-one in the shift loop is visible here and
  // nowhere else.
  const ram = boardRam();
  const before = scores(ram);
  const r = hiscoreInsert287CEE(ram, BUF, 0, 0x00820000);
  assert.equal(r.index, 2);
  assert.deepEqual(scores(ram), [before[0], before[1], 0x00820000, before[2], before[3]]);
});

test('W300 inserting at the LAST slot shifts nothing at all', { skip: SKIP }, () => {
  // index 4 gives count 0, so the `dbra` loops run zero times and the only writes are the
  // score, the overflow, the pointer, and the six words.
  const ram = boardRam();
  const before = scores(ram);
  const r = hiscoreInsert287CEE(ram, BUF, 0, 0x00700000);
  assert.equal(r.index, 4);
  assert.deepEqual(scores(ram), [...before.slice(0, 4), 0x00700000]);
});

test('W300 NO ROOM changes NOTHING -- not even the slot pointer', { skip: SKIP }, () => {
  // `$287CF6 bcs $287D90` jumps straight to the `movem` and `rts`. A port that ran the
  // shift first and bailed after would corrupt the table on every losing score.
  const ram = boardRam();
  markTable(ram);
  markBuffer(ram);
  const snapshot = Uint8Array.from(ram.b);
  const r = hiscoreInsert287CEE(ram, BUF, 0, 0x00500000);
  assert.equal(r.inserted, false);
  assert.equal(r.slot, 0);
  assert.deepEqual(ram.b, snapshot, 'a losing score leaves main RAM byte-identical');
});

test('W300 five inserts in ascending order rebuild a DESCENDING table', { skip: SKIP }, () => {
  // The strongest whole-order check available: feed the scores in exactly the wrong order
  // and the table must still come out sorted, because each insert finds its own place.
  const ram = boardRam();
  for (let i = 0; i < 5; i++) ram.setU32(HISCORE.scoresBase + i * 4, 0);
  for (const s of [0x00100000, 0x00200000, 0x00300000, 0x00400000, 0x00500000]) {
    hiscoreInsert287CEE(ram, BUF, 0, s);
  }
  assert.deepEqual(scores(ram),
    [0x00500000, 0x00400000, 0x00300000, 0x00200000, 0x00100000]);
});

// ==================== 2. THE OVERFLOW WORDS, THE OTHER HALF OF THE KEY

test('W300 the overflow word rides along with its score', { skip: SKIP }, () => {
  // `move.w (-$4,A5),-(A5)` shifts the overflow array in lockstep with the score longs, and
  // `move.w D5,-(A5)` writes the new one. If the two arrays ever fall out of step the table
  // is ordered by a key that no longer matches its entries.
  //
  // The overflows have to be DESCENDING like the scores they parallel, because the key is
  // lexicographic: give them an ascending or arbitrary order and the overflow decides every
  // comparison on its own and the score long is never reached. (My first draft did exactly
  // that and the insert landed at index 0, correctly.)
  const ram = boardRam();
  const set = [9, 7, 5, 3, 1];
  for (let i = 0; i < 5; i++) ram.setU16(HISCORE.overflowBase + i * 2, set[i]);
  const before = scores(ram);
  const r = hiscoreInsert287CEE(ram, BUF, 6, 0x00820000);
  // 1 and 3 and 5 are beaten, so the walk climbs; entry 1's 7 beats 6, so it stops there.
  assert.equal(r.index, 2);
  assert.deepEqual(overflows(ram), [9, 7, 6, 5, 3], 'the overflow array shifted with it');
  assert.deepEqual(scores(ram), [before[0], before[1], 0x00820000, before[2], before[3]],
    'and the score long moved to the same place');
});

test('W300 a non-zero overflow inserts above the board\'s biggest score', { skip: SKIP }, () => {
  // The key is lexicographic, so this is the one case where a tiny score wins.
  const ram = boardRam();
  const before = scores(ram);
  hiscoreInsert287CEE(ram, BUF, 1, 0x00000001);
  assert.deepEqual(scores(ram), [0x00000001, ...before.slice(0, 4)]);
  assert.deepEqual(overflows(ram), [1, 0, 0, 0, 0]);
});

// ==================== 3. THE 12-BYTE ARRAY AND ITS THREE `move.l`

test('W300 the 12-byte entries shift as ENTRIES, not as 16-byte records', { skip: SKIP }, () => {
  // `$287D1C` is THREE consecutive `move.l (-$10,A1),-(A1)`. Each reads 16 bytes back and
  // writes 4 back, so the three together move a 12-byte entry down one place. Reading the
  // `-$10` as a stride would give a 16-byte array, which is the mistake this asserts against.
  const ram = boardRam();
  markTable(ram);
  const before = bigRows(ram);
  const r = hiscoreInsert287CEE(ram, BUF, 0, 0x00900000);
  assert.equal(r.index, 1);
  const after = bigRows(ram);
  assert.deepEqual(after[0], before[0], 'entry 0 is above the gap and untouched');
  assert.deepEqual(after.slice(2), before.slice(1, 4), 'entries 1..3 moved down whole');
  // The gap itself is left holding whatever the shift dragged into it; the insert only makes
  // room. `$287C3E` is what writes the initials through the pointer.
});

test('W300 the slot pointer names the GAP and lands in `($C,A4)`', { skip: SKIP }, () => {
  // `$287D2C lea (-$C,A1),A1 / $287D30 move.l A1,($C,A4)`. The caller reads it back at
  // `$287C7A movea.l ($C,A4),A4`, so a wrong value here writes a name over another entry.
  const ram = boardRam();
  markBuffer(ram);
  for (const [score, index] of [[0x02000000, 0], [0x00820000, 2], [0x00700000, 4]]) {
    const fresh = boardRam();
    markBuffer(fresh);
    const r = hiscoreInsert287CEE(fresh, BUF, 0, score);
    assert.equal(r.slot, BIG_BASE + index * 12, `index ${index} -> its own 12-byte entry`);
    assert.equal(fresh.u32(BUF + 0x0c), r.slot, 'and it is written to ($C,A4)');
  }
  assert.equal(ram.u32(BUF + 0x0c), 0xdeadbeef, 'the untouched copy still holds the marker');
});

// ==================== 4. THE SIX PARALLEL WORD ARRAYS

test('W300 all SIX word arrays shift, and each takes its own source word', { skip: SKIP }, () => {
  // `$287D36` loads six ends and `$287D5E` shifts all six per entry; `$287D7A` then writes
  // `(A4)`, `($2,A4)` ... `($A,A4)` into them in the ROM's register order A1, A2, A3, A0,
  // A5, A6. **A0 is fourth, not first** -- a port that assumed address order for the
  // registers would pair array 3 with the wrong source word, and only a per-column check
  // catches it.
  const ram = boardRam();
  markTable(ram);
  markBuffer(ram);
  const before = [0, 1, 2, 3, 4, 5].map((c) => wordCol(ram, c));
  const r = hiscoreInsert287CEE(ram, BUF, 0, 0x00820000);
  assert.equal(r.index, 2);
  for (let col = 0; col < 6; col++) {
    assert.deepEqual(wordCol(ram, col),
      [before[col][0], before[col][1], 0xbe00 + col, before[col][2], before[col][3]],
      `word array ${col} shifted, and took source word ${col}`);
  }
});

test('W300 the six word arrays are contiguous and each holds five words', { skip: SKIP }, () => {
  // The six `lea`s are ENDS, ten bytes apart, and they tile `$803874..$8038AF` exactly --
  // which is what proves they are six arrays of five and not one array of thirty.
  const ends = [0x80387e, 0x803888, 0x803892, 0x80389c, 0x8038a6, 0x8038b0];
  for (let i = 0; i < ends.length; i++) {
    assert.equal(ends[i] - WORD_BASES[i], 10, `array ${i} is five words`);
    if (i) assert.equal(WORD_BASES[i], ends[i - 1], `array ${i} starts where ${i - 1} ends`);
  }
  assert.equal(WORD_BASES[0], HISCORE.thirdEnd, 'and the first begins at the 12-byte end');
  assert.equal(ends[5], HISCORE.overflowBase, 'and the last ends where the overflow begins');
});

test('W300 the whole record set tiles $803824..$8038B9 with no gap', { skip: SKIP }, () => {
  // Nine parallel arrays, one per-entry record spread across them. Stated as an assertion
  // because the layout is the finding: every `lea` in this family names an END, and the
  // only way to be sure the ends are right is that they meet.
  assert.equal(HISCORE.scoresBase, 0x803824);
  assert.equal(HISCORE.scoresEnd, BIG_BASE, 'the score array ends where the 12-byte begins');
  assert.equal(BIG_BASE + 5 * 12, HISCORE.thirdEnd, 'five 12-byte entries reach $803874');
  assert.equal(HISCORE.overflowEnd, 0x8038ba, 'and the overflow words close the set');
});

// ==================== 5. THE INSERT AGREES WITH THE SEARCH

test('W300 the insert shifts exactly `count` entries, for every index', { skip: SKIP }, () => {
  // `move.l D1,D2` then two loops driven by it: the search's `count` IS the number of
  // entries that move. Checked against the search directly so the two cannot drift.
  for (const score of [0x02000000, 0x00900000, 0x00820000, 0x00800000, 0x00700000]) {
    const ram = boardRam();
    const before = scores(ram);
    const found = hiscoreSearch287D96(ram, 0, score);
    hiscoreInsert287CEE(ram, BUF, 0, score);
    const after = scores(ram);
    assert.equal(after[found.index], score, 'the new score sits at the search\'s index');
    for (let i = 0; i < found.index; i++) {
      assert.equal(after[i], before[i], `entry ${i} is above the gap`);
    }
    for (let i = 0; i < found.count; i++) {
      assert.equal(after[found.index + 1 + i], before[found.index + i],
        `entry ${found.index + i} moved down one`);
    }
  }
});
