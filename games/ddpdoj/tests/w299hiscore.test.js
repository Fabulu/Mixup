// W299: `$287D96`, the high-score table's insertion search.
//
// Three waves declined to start this subsystem for one stated reason: the direction of the
// comparison depends on which end of the array holds the highest score, and getting it
// backwards produces a table that is populated, ordered, and SILENTLY wrong. So the
// ordering is settled by measurement first, and every case below is driven against the
// SHIPPED SEED -- the board's own main RAM, with the board's own five scores in it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { hiscoreSearch287D96, HISCORE } from '../src/hiscore.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.join(HERE, '..', 'rip', 'web', 'seed.bin');
const HAVE = existsSync(SEED);
const SKIP = HAVE ? false : 'the shipped seed is absent; skip, not pass';

/** The board's own RAM, so the table under test is the cartridge's. */
const boardRam = () => new Ram(new Uint8Array(readFileSync(SEED)));

// ============================== 1. THE ORDERING, WHICH WAS THE BLOCKER

test('W299 the seed holds FIVE real scores in DESCENDING order', { skip: SKIP }, () => {
  // This is the measurement that unblocked the subsystem. `$803824` is the base and
  // `$803838` -- the address the ROM `lea`s -- is one past the end, which is what makes
  // `move.l -(A1),D1` a walk from the LOWEST entry upward.
  const ram = boardRam();
  const got = [0, 1, 2, 3, 4].map((i) => ram.u32(HISCORE.scoresBase + i * 4));
  assert.deepEqual(got, [0x01182223, 0x00846001, 0x00816579, 0x00775305, 0x00699653],
    'the board\'s own table');
  for (let i = 1; i < got.length; i++) {
    assert.ok(got[i] < got[i - 1], `entry ${i} is lower than ${i - 1} -- DESCENDING`);
  }
  assert.equal(HISCORE.scoresBase, 0x803824);
  assert.equal(HISCORE.scoresEnd, 0x803838, 'the address the ROM lea\'s is the END');
});

test('W299 the overflow words are all ZERO, consistent with the scores', { skip: SKIP }, () => {
  // The parallel word array is the per-entry score overflow. Every score is under
  // 100,000,000, so every overflow being zero is the expected state -- and it means the
  // equal-overflow arm is the one real play exercises.
  const ram = boardRam();
  for (let i = 0; i < HISCORE.entries; i++) {
    assert.equal(ram.u16(HISCORE.overflowBase + i * 2), 0, `overflow ${i}`);
  }
});

// ==================== 2. THE SEARCH, AGAINST THE BOARD'S OWN SCORES

test('W299 a score that beats everything lands at index 0', { skip: SKIP }, () => {
  // The `dbcc` runs out, D0 reaches -1, and `addq.w #1,D0` gives 0. The top of the table
  // and "the walk fell off the end" are the same arithmetic.
  const r = hiscoreSearch287D96(boardRam(), 0, 0x02000000);
  assert.equal(r.index, 0);
  assert.equal(r.offset, 0);
  assert.equal(r.count, 4, 'all four entries below it shift down');
  assert.equal(r.noRoom, false);
});

test('W299 a score between two entries lands between them', { skip: SKIP }, () => {
  // Driven against the real values, so these are predictions about the cartridge's table
  // and not about the port agreeing with itself.
  for (const [score, index] of [
    [0x00900000, 1],     // between 1,182,223 and 846,001
    [0x00820000, 2],     // between   846,001 and 816,579
    [0x00800000, 3],     // between   816,579 and 775,305
    [0x00700000, 4],     // between   775,305 and 699,653
  ]) {
    const r = hiscoreSearch287D96(boardRam(), 0, score);
    assert.equal(r.index, index, `$${score.toString(16)} -> index ${index}`);
    assert.equal(r.offset, index * 8, 'and the offset is index * 8');
    assert.equal(r.count, 4 - index, 'and count is what must shift');
    assert.equal(r.noRoom, false);
  }
});

test('W299 a score that beats NONE reports NO ROOM through the borrow', { skip: SKIP }, () => {
  // There is no `ori #$1,SR` in `$287D96`. The carry `$287CF6 bcs $287D90` reads is the
  // BORROW out of `sub.w D2,D1`: the walk stops at the lowest entry with D0 still 4, the
  // `addq` makes it 5, and `4 - 5` borrows.
  const r = hiscoreSearch287D96(boardRam(), 0, 0x00500000);
  assert.equal(r.index, 5, 'past the end');
  assert.equal(r.count, -1, 'and 4 - 5 is negative');
  assert.equal(r.noRoom, true);
});

test('W299 an exact TIE does not displace the entry it ties', { skip: SKIP }, () => {
  // `cmp.l D7,D1` then `dbcc`: the loop exits when carry is CLEAR, i.e. when
  // `D1 >= D7`. So an equal score stops the walk and the incumbent keeps its place --
  // which for the LOWEST entry means the tie does not make the table at all.
  const tie = hiscoreSearch287D96(boardRam(), 0, 0x00699653);
  assert.equal(tie.noRoom, true, 'tying the last entry is not good enough');
  // And a tie higher up stops AT that entry rather than above it.
  const mid = hiscoreSearch287D96(boardRam(), 0, 0x00816579);
  assert.equal(mid.index, 3, 'it lands BELOW the entry it ties, not above');
});

test('W299 the OVERFLOW word outranks the score long', { skip: SKIP }, () => {
  // `cmp.w D5,D2` runs first and `bhi`/`bcs` both leave the loop before the long is even
  // looked at, so the key is lexicographic. A tiny score with a non-zero overflow must
  // beat the board's biggest.
  const r = hiscoreSearch287D96(boardRam(), 1, 0x00000001);
  assert.equal(r.index, 0, 'overflow 1 beats every zero-overflow entry');
  // And an overflow of 0 against entries that all have 0 falls through to the long, which
  // the cases above already cover.
});

test('W299 `dbcc` exits on carry CLEAR, and the source says so', () => {
  // The single easiest thing to get wrong here: DBcc is "decrement and branch if the
  // condition is FALSE", so `dbcc` exits when the carry is CLEAR. Reading it the other way
  // makes the whole search run backwards -- and both readings look plausible from the
  // instructions alone. Only one agrees with the seed's ordering.
  const src = readFileSync(path.join(HERE, '..', 'src', 'hiscore.js'), 'utf8');
  assert.match(src, /exits the loop when the carry is CLEAR/);
  assert.match(src, /makes the whole search run backwards/);
  assert.match(src, /only one agrees\s*\n?\/\/ with the seed's ordering|only one agrees with the seed/);
});
