// W301: `$28841E`, the FACTORY high-score table.
//
// Nine copies out of one contiguous ROM run. Small, but its DATA is evidence: a wrong column
// assignment puts recognisable values in the wrong place, and this file uses that. It also
// closes the question of where W299's ordering measurement came from.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import {
  hiscoreDefaults28841E, HISCORE_DEFAULTS, HISCORE, hiscoreSearch287D96,
} from '../src/hiscore.js';
import { HUDRAM } from '../src/hud.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const SEED = path.join(R, 'rip', 'web', 'seed.bin');
const HAVE_SEED = existsSync(SEED);
const SKIP_SEED = HAVE_SEED ? SKIP : 'the shipped seed is absent; skip, not pass';
const boardRam = () => new Ram(new Uint8Array(readFileSync(SEED)));

/** A cold machine: the table is whatever `new Ram()` gives, i.e. not the factory table. */
function coldRam() {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  return ram;
}

const words = (ram, base) => [0, 1, 2, 3, 4].map((i) => ram.u16(base + i * 2));

// ==================== 1. THE COPY ITSELF

test('W301 the installer fills all FIVE score longs, descending', { skip: SKIP }, () => {
  // `moveq #$4,D0` with `dbra` is FIVE passes. An installer that ran four would leave the
  // fifth entry at whatever RAM held, and the search walks from the fifth entry upward --
  // so a stale fifth is the one that decides every "no room" answer.
  const got = [0, 1, 2, 3, 4].map((i) => coldRam().u32(HISCORE.scoresBase + i * 4));
  assert.deepEqual(got, [0x01182223, 0x00846001, 0x00816579, 0x00775305, 0x00699653]);
  for (let i = 1; i < got.length; i++) assert.ok(got[i] < got[i - 1], `entry ${i} is lower`);
});

test('W301 the factory table IS what the shipped seed holds', { skip: SKIP_SEED }, () => {
  // W299 measured the ordering off `rip/web/seed.bin` and settled the subsystem on it. This
  // is where those numbers come from: the seed carries the FACTORY table, not a played one.
  // Sourced twice now, and the two sources are independent -- one is a RAM snapshot, the
  // other is cartridge data.
  const cold = coldRam();
  const board = boardRam();
  for (let a = HISCORE.scoresBase; a < HISCORE.overflowEnd; a += 2) {
    assert.equal(cold.u16(a), board.u16(a), `$${a.toString(16)} agrees`);
  }
});

test('W301 no boot catch-up is needed here, and that is the reason', { skip: SKIP_SEED }, () => {
  // W92's object stream and W93's text banks are replayed at boot because the seed cannot
  // carry their results. This one it can, exactly, which the test above proves -- so
  // replaying `$28841E` would be redundant rather than restorative. Asserted so that a
  // future wave adding a catch-up call has to justify it against a failing test.
  const board = boardRam();
  const before = Uint8Array.from(board.b.subarray(0, board.b.length));
  hiscoreDefaults28841E(board, ROM);
  for (let a = HISCORE.scoresBase; a < HISCORE.overflowEnd; a += 2) {
    const off = a - 0x800000;
    assert.equal(board.b[off], before[off], `installing over the seed changes nothing at $${
      a.toString(16)}`);
  }
});

test('W301 the HI score is published from entry 0, between the first two copies',
  { skip: SKIP }, () => {
    // `$288432 move.l $803824,$81B448` sits between the score copy and the overflow copy.
    // It is what stops the HUD's HI and the table's top entry disagreeing at boot.
    const ram = coldRam();
    assert.equal(HISCORE_DEFAULTS.hiScore, HUDRAM.hiScore, 'and it is the HUD field');
    assert.equal(ram.u32(HUDRAM.hiScore), 0x01182223);
    assert.equal(ram.u32(HUDRAM.hiScore), ram.u32(HISCORE.scoresBase), 'they agree');
  });

// ==================== 2. THE DATA AS EVIDENCE FOR W300'S COLUMN ASSIGNMENT

test('W301 the LOOP column is all zero and the STAGE column descends', { skip: SKIP }, () => {
  // W300 derived the six columns from the ROM's register order A1, A2, A3, A0, A5, A6 --
  // with A0 FOURTH. These defaults are an independent check, because a wrong assignment puts
  // recognisable data in the wrong column. A factory table has cleared no loop, and its
  // stages must fall in step with its scores.
  const ram = coldRam();
  assert.deepEqual(words(ram, 0x803874), [0, 0, 0, 0, 0], 'the loop column');
  assert.deepEqual(words(ram, 0x80387e), [3, 2, 2, 1, 1], 'the stage column, descending');
});

test('W301 the CHAIN column holds BCD chain counts, which pins it', { skip: SKIP }, () => {
  // `$0719` and `$0720` read as BCD 719 and 720 -- chain counts, and nothing else in the
  // entry can hold a value like that. The digit state is capped at 9 by `$28725C`, so if the
  // two were swapped this column would be impossible and the other would be a wrong chain.
  const ram = coldRam();
  assert.deepEqual(words(ram, 0x80389c), [0x0719, 0x0719, 0x0719, 0x0719, 0x0720]);
  const digits = words(ram, 0x8038a6);
  assert.deepEqual(digits, [4, 4, 2, 0, 6]);
  for (const d of digits) assert.ok(d <= 9, 'and every digit state is within its cap');
});

test('W301 the SHIP column contains a value in P2\'s rebased range', { skip: SKIP }, () => {
  // W300's finding was that `$287C24 addq.w #4,D0` rebases P2's selection onto P1's icon
  // table, so a stored ship index of 4..7 means "P2's ship 0..3". Entry 1 holds 6. That is
  // the rebase showing up in shipped data rather than in an instruction.
  const ram = coldRam();
  const ships = words(ram, 0x803888);
  assert.deepEqual(ships, [0, 6, 2, 2, 2]);
  assert.ok(ships.some((s) => s >= 4), 'at least one factory entry was set on side 2');
});

// ==================== 3. THE 12-BYTE ENTRY IS THREE INITIALS

test('W301 each 12-byte entry is THREE longs, every one a small multiple of four',
  { skip: SKIP }, () => {
    // W300 could only infer "the initials slot" from how `$287C3E` stamps a tag into it.
    // Fifteen longs, all small and all multiples of four, is three character indices per
    // name. That is also why the insert leaves the other eight bytes alone: it allocates
    // the name, it does not write it.
    const ram = coldRam();
    const rows = [0, 1, 2, 3, 4].map((i) =>
      [0, 1, 2].map((k) => ram.u32(0x803838 + i * 12 + k * 4)));
    assert.deepEqual(rows, [
      [0x38, 0x48, 0x0c], [0x28, 0x58, 0x48], [0x20, 0x48, 0x38],
      [0x20, 0x30, 0x28], [0x28, 0x30, 0x4c],
    ]);
    for (const row of rows) {
      for (const c of row) {
        assert.equal(c % 4, 0, `$${c.toString(16)} is a multiple of four`);
        assert.ok(c > 0 && c < 0x100, 'and small enough to be a character index');
      }
    }
  });

test('W301 the tag the insert stamps is OUT of the factory character range', { skip: SKIP }, () => {
  // `$FF`/`$FE` are not multiples of four and are above every default, so the tag cannot be
  // mistaken for a character. That is what makes it a usable "not entered yet" marker, and
  // it is the reason the insert can leave the rest of the entry dirty.
  const ram = coldRam();
  let max = 0;
  for (let i = 0; i < 15; i++) max = Math.max(max, ram.u32(0x803838 + i * 4));
  assert.ok(max < 0xfe, `every factory character ($${max.toString(16)}) is below the tag`);
  for (const tag of [0xff, 0xfe]) assert.notEqual(tag % 4, 0, 'and no tag is a valid index');
});

// ==================== 4. THE INSTALLED TABLE IS SEARCHABLE

test('W301 the search agrees with the factory table it was measured against', { skip: SKIP }, () => {
  // Closing the loop: the installer's output must give W299's answers. If either the copy or
  // the search drifted, these seven diverge.
  const ram = coldRam();
  for (const [score, index] of [[0x02000000, 0], [0x00900000, 1], [0x00820000, 2],
    [0x00800000, 3], [0x00700000, 4]]) {
    assert.equal(hiscoreSearch287D96(ram, 0, score).index, index, `$${score.toString(16)}`);
  }
  assert.equal(hiscoreSearch287D96(ram, 0, 0x00500000).noRoom, true, 'beats none');
  assert.equal(hiscoreSearch287D96(ram, 0, 0x00699653).noRoom, true, 'an exact tie');
});

test('W301 the nine source blocks are contiguous and cover $287DF8..$287E8D', { skip: SKIP }, () => {
  // The ROM stores the nine blocks as one run even though their destinations are not in
  // address order. That is what lets one window cover them, so it is worth an assertion:
  // each block starts where the previous ended.
  let at = 0x287df8;
  for (const b of HISCORE_DEFAULTS.blocks) {
    assert.equal(b.src, at, `block for $${b.dst.toString(16)} starts at $${at.toString(16)}`);
    at += HISCORE.entries * b.longs * b.size;
  }
  assert.equal(at, 0x287e8e, 'and the run ends one past $287E8D');
  assert.equal(at - 0x287df8, 0x96, 'which is the window length');
});

test('W301 the nine destinations are the nine arrays, with no repeat', { skip: SKIP }, () => {
  // Nine blocks, nine distinct arrays. A duplicated destination would silently leave one
  // column stale, and a stale column is exactly the failure this whole subsystem hides well.
  const dsts = HISCORE_DEFAULTS.blocks.map((b) => b.dst);
  assert.equal(new Set(dsts).size, 9);
  assert.deepEqual([...dsts].sort((a, b) => a - b),
    [0x803824, 0x803838, 0x803874, 0x80387e, 0x803888,
      0x803892, 0x80389c, 0x8038a6, 0x8038b0]);
});
