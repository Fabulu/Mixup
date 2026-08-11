// W300: `$287BD2`/`$287C08`/`$287C3E` -- the high-score ENTRY, and bonus line 2's bit.
//
// Two heads over one body, which is the shape the family check predicts and the reason this
// is a table in the source rather than two transcriptions. What needs asserting is the part
// a table cannot express: the `+4` rebase, the all-clear override, and the carry sense that
// bonus line 2 turns into a flag bit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import {
  hiscoreBody287C3E, hiscoreCheck287BD2, hiscoreCheck287C08, HISCORE_SIDES, HISCORE,
} from '../src/hiscore.js';
import { HUDRAM } from '../src/hud.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.join(HERE, '..', 'rip', 'web', 'seed.bin');
const HAVE = existsSync(SEED);
const SKIP = HAVE ? false : 'the shipped seed is absent; skip, not pass';

const boardRam = () => new Ram(new Uint8Array(readFileSync(SEED)));
const scores = (ram) => [0, 1, 2, 3, 4].map((i) => ram.u32(HISCORE.scoresBase + i * 4));

const P1 = HISCORE_SIDES[0];
const P2 = HISCORE_SIDES[1];

/** Give a side a winning score and a distinct value in each of its six source fields. */
function loadSide(ram, spec, { score = 0x02000000, ovf = 0, loop = 0, stage = 0 } = {}) {
  ram.setU32(spec.total, score);
  ram.setU16(spec.ovf, ovf);
  ram.setU16(spec.ship, 2);
  ram.setU16(spec.style, 0x0111);
  ram.setU16(spec.chain, 0x0773);
  ram.setU16(spec.digits, 7);
  ram.setU16(0x813098, loop);
  ram.setU16(0x813092, stage);
  ram.setU16(0x81309a, 0);
}

// ==================== 1. THE EIGHT FIELDS WERE ALL ALREADY NAMED

test('W300 both heads read fields `hud.js` and `player.js` already named', () => {
  // The point of the family check: this wave identified exactly ONE new address, the
  // override's gate. Everything else was already in the tree, and pinning that here means a
  // future rename of a HUD field breaks loudly instead of silently reading the wrong word.
  assert.equal(P1.total, HUDRAM.totalP1);
  assert.equal(P2.total, HUDRAM.totalP2);
  assert.equal(P1.ovf, HUDRAM.ovfP1);
  assert.equal(P2.ovf, HUDRAM.ovfP2);
  assert.equal(P1.ship, HUDRAM.shipSelectBodyP1);
  assert.equal(P2.ship, HUDRAM.shipSelectBodyP2);
  assert.equal(P1.chain, HUDRAM.chainHiWaterP1);
  assert.equal(P2.chain, HUDRAM.chainHiWaterP2);
  assert.equal(P1.digits, HUDRAM.digitStateP1);
  assert.equal(P2.digits, HUDRAM.digitStateP2);
  assert.equal(P1.bestTotal, HUDRAM.total2P1);
  assert.equal(P2.bestTotal, HUDRAM.total2P2);
  assert.equal(P1.bestOvf, HUDRAM.ovf2P1);
  assert.equal(P2.bestOvf, HUDRAM.ovf2P2);
});

test('W300 the running-best pair `hud.js` INFERRED is confirmed as a running best', { skip: SKIP }, () => {
  // `hud.js` named `$81B4A0`/`$81B4A8` from the pairing alone and said so: "the names are
  // INFERRED from the pairing". `$287C96`/`$287CAA` store the side's own total and overflow
  // into them under a `>=` test, which is what makes them a best rather than a copy.
  const ram = boardRam();
  loadSide(ram, P1, { score: 0x02000000 });
  ram.setU32(P1.bestTotal, 0x00500000);
  ram.setU16(P1.bestOvf, 0);
  assert.equal(hiscoreCheck287BD2(ram).made, true);
  assert.equal(ram.u32(P1.bestTotal), 0x02000000, 'the bigger total replaced the best');
});

test('W300 a SMALLER total leaves the running best alone', { skip: SKIP }, () => {
  // `bcs` is a borrow, so the store happens only on `>=`.
  const ram = boardRam();
  loadSide(ram, P1, { score: 0x00900000 });
  ram.setU32(P1.bestTotal, 0x01500000);
  ram.setU16(P1.bestOvf, 0);
  assert.equal(hiscoreCheck287BD2(ram).made, true, 'it still made the table');
  assert.equal(ram.u32(P1.bestTotal), 0x01500000, 'but the best is untouched');
});

test('W300 the two best-updates are INDEPENDENT, which is a real board quirk', { skip: SKIP }, () => {
  // `$287C96` stores the overflow BEFORE `$287CA2` compares the long, and `$287CA8 bcs`
  // can then bail. So a higher overflow with a lower long leaves the best as
  // `(new overflow, old long)` -- a pair that never occurred. Reachable in real play,
  // because the overflow counts 100,000,000s. Transcribed as written, asserted so a later
  // "tidy this into one lexicographic max" cannot land quietly.
  const ram = boardRam();
  loadSide(ram, P1, { score: 0x00000100, ovf: 3 });
  ram.setU32(P1.bestTotal, 0x09999999);
  ram.setU16(P1.bestOvf, 1);
  hiscoreCheck287BD2(ram);
  assert.equal(ram.u16(P1.bestOvf), 3, 'the overflow was stored');
  assert.equal(ram.u32(P1.bestTotal), 0x09999999, 'and the long was NOT -- the mixed pair');
});

// ==================== 2. THE SIX WORDS, AND THE `+4`

test('W300 the body posts the six words the insert then distributes', { skip: SKIP }, () => {
  // `(A4)`..`($A,A4)` in order: loop, stage, ship, style, chain, digits. The buffer is what
  // `$287D7A` reads back, so these six ARE the high-score line's contents.
  const ram = boardRam();
  loadSide(ram, P1, { loop: 1, stage: 3 });
  hiscoreCheck287BD2(ram);
  assert.deepEqual([0, 2, 4, 6, 8, 10].map((o) => ram.u16(P1.buf + o)),
    [1, 3, 2, 0x0111, 0x0773, 7]);
});

test('W300 P2 stores its ship index +4, rebased onto P1\'s icon table', { skip: SKIP }, () => {
  // `$287C24 addq.w #4,D0` is the only arithmetic in either head. `hud.js` records the P1
  // icons at `$2881E2[$813084*2]` and P2's at `$2881EA[$813086*2]`, and those bases are 8
  // bytes apart -- FOUR entries of a word-indexed table. So the `+4` makes the stored index
  // side-independent: a high-score line can name the ship without naming the player.
  assert.equal(P1.shipBias, 0);
  assert.equal(P2.shipBias, 4);
  assert.equal(0x2881ea - 0x2881e2, P2.shipBias * 2, 'four word entries, exactly the bias');

  const ram = boardRam();
  loadSide(ram, P2);
  hiscoreCheck287C08(ram);
  assert.equal(ram.u16(P2.buf + 4), 6, 'ship 2 on side 2 is recorded as 6');
});

test('W300 the two heads use SEPARATE buffers', { skip: SKIP }, () => {
  // `$81B420` and `$81B430` are 16 bytes apart: six words, a spare, and the long pointer at
  // `($C,A4)`. One buffer for both sides would have the second head overwrite the first's
  // slot pointer between the insert and the name entry.
  assert.equal(P2.buf - P1.buf, 0x10);
  const ram = boardRam();
  loadSide(ram, P1, { loop: 1 });
  loadSide(ram, P2, { loop: 1 });
  ram.setU16(P2.ship, 0);
  hiscoreCheck287BD2(ram);
  hiscoreCheck287C08(ram);
  assert.equal(ram.u16(P1.buf + 4), 2, 'P1 still holds its own ship');
  assert.equal(ram.u16(P2.buf + 4), 4, 'and P2 holds its own, rebased');
  assert.notEqual(ram.u32(P1.buf + 0x0c), ram.u32(P2.buf + 0x0c), 'two distinct slots');
});

// ==================== 3. THE ALL-CLEAR OVERRIDE

test('W300 `$81309A` forces the entry to loop 1, stage 5', { skip: SKIP }, () => {
  // Stage is zero-based and there are five stages, so 5 is one PAST the last index and
  // cannot arise from play: it is a deliberate "ALL" marker. `$81309A` has exactly two
  // references in the build -- this read and `$291F5C move.w #$1,$81309A`, which sits on
  // the loop-nonzero arm of a `$291Fxx` state machine.
  const ram = boardRam();
  loadSide(ram, P1, { loop: 2, stage: 1 });
  ram.setU16(0x81309a, 1);
  hiscoreCheck287BD2(ram);
  assert.equal(ram.u16(P1.buf + 0), 1, 'the loop is forced to 1, OVER a non-zero 2');
  assert.equal(ram.u16(P1.buf + 2), 5, 'and the stage to 5, which no stage index reaches');
});

test('W300 without the flag the real loop and stage go in unchanged', { skip: SKIP }, () => {
  const ram = boardRam();
  loadSide(ram, P1, { loop: 2, stage: 1 });
  hiscoreCheck287BD2(ram);
  assert.deepEqual([ram.u16(P1.buf + 0), ram.u16(P1.buf + 2)], [2, 1]);
});

// ==================== 4. THE TAG, AND WHAT IT SELECTS

test('W300 the tag is stamped into the entry AND re-selects the side', { skip: SKIP }, () => {
  // `move.l D6,(A4)` after `movea.l ($C,A4),A4`, then `cmpi.l #$FF,D6` picks the personal
  // bests. So the side travels in the entry rather than in a register the body remembers,
  // and only the FIRST of the entry's three longs is written.
  assert.equal(P1.tag, 0xff);
  assert.equal(P2.tag, 0xfe);
  const ram = boardRam();
  loadSide(ram, P2);
  const r = hiscoreCheck287C08(ram);
  assert.equal(r.made, true);
  assert.equal(ram.u32(r.slot), 0xfe, 'the P2 tag is in the new 12-byte entry');
  assert.equal(ram.u32(P2.buf + 0x0c), r.slot, 'and the slot pointer agrees');
});

// ==================== 5. THE CARRY, WHICH IS INVERTIBLE AND SO WORTH PINNING

test('W300 a losing score reports `made: false` and inserts nothing', { skip: SKIP }, () => {
  // `$287CE8 ori #$1,SR` sets the carry. Bonus line 2's `bcs` then SKIPS the flag bit, so
  // `made: false` must mean "did not get in" -- the opposite reading flags the losing side.
  const ram = boardRam();
  const before = scores(ram);
  loadSide(ram, P1, { score: 0x00500000 });
  const r = hiscoreCheck287BD2(ram);
  assert.equal(r.made, false);
  assert.equal(r.slot, 0);
  assert.deepEqual(scores(ram), before, 'and the board\'s table is untouched');
});

test('W300 the flag bits are 1 for P1 and 2 for P2', () => {
  // `$26007C ori.b #$1` / `$260092 ori.b #$2` on `$8130CC`, so the two sides are separate
  // bits of one byte and a port that used a boolean would lose one of them.
  assert.equal(P1.flagBit, 0x01);
  assert.equal(P2.flagBit, 0x02);
});

test('W300 the body is one function over two specs, not two transcriptions', () => {
  // The family check, stated as an assertion: both heads are the same call.
  assert.equal(typeof hiscoreBody287C3E, 'function');
  assert.equal(hiscoreCheck287BD2.length, 1);
  assert.equal(hiscoreCheck287C08.length, 1);
  assert.equal(HISCORE_SIDES.length, 2);
  // and the two specs differ in every address, so neither can be reading the other's state
  for (const key of ['buf', 'total', 'ovf', 'ship', 'style', 'chain', 'digits',
    'bestTotal', 'bestOvf', 'tag', 'flagBit', 'site']) {
    assert.notEqual(P1[key], P2[key], `${key} differs between the sides`);
  }
});
