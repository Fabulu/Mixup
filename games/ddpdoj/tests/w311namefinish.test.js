// W311: the finish button commits the character under the cursor.
//
// `$28F606` writes the pointed-at character, filters the completed row, and then returns to the
// shared `$28F6A8` commit tail. This file checks the helper directly and the live button path that
// reaches the helper and the tail in one frame.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { hiscoreDefaults28841E } from '../src/hiscore.js';
import {
  NAME_REC, NAME_ALPHA, CURSOR, charName, bannedNames,
  nameFinish28F606, nameCommit, nameButtons28F588,
} from '../src/hiscorename.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const A4 = 0x81f200;
const BIG = 0x803838;
const COUNT = 0x16;
const SELECT = 0x10;
const FINISH = 0x8000;

/** A machine mid-entry: `chars` already typed and the cursor on `cell`. */
function midEntry(chars, cell) {
  assert.ok(chars.length < NAME_ALPHA.chars, 'live setup cannot remain in input with three chars');
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  ram.setU32(A4 + NAME_REC.entry, BIG);
  ram.setU16(A4 + COUNT, 0);
  for (let k = 0; k < 3; k++) ram.setU32(BIG + k * 4, 0xdead0000 + k);
  for (const c of chars) {
    ram.setU16(A4 + NAME_REC.input, SELECT);
    ram.setU16(A4 + CURSOR.cellField, c);
    nameButtons28F588(ram, ROM, A4, null);
  }
  ram.setU16(A4 + CURSOR.cellField, cell);
  return ram;
}
/** A deliberately synthetic completed row for proving guards below the live three-char branch. */
function completedEntry(chars, cell) {
  assert.equal(chars.length, NAME_ALPHA.chars);
  const ram = midEntry([], cell);
  chars.forEach((char, index) => ram.setU32(BIG + index * 4, char * NAME_ALPHA.scale));
  ram.setU16(A4 + COUNT, NAME_ALPHA.chars);
  return ram;
}
const row = (ram) => [0, 1, 2].map((k) => ram.u32(BIG + k * 4));
const name = (ram) => row(ram).map(charName).join('');
const cellOf = (ch) => ch.charCodeAt(0) - 65;

// ==================== 1. FINISH ADDS THE CHARACTER UNDER THE CURSOR

test('W311 `SE` finished on `X` becomes `SEX`', { skip: SKIP }, () => {
  // The whole point. `$28F606` writes `($18,A4) * 4` into the next slot BEFORE testing the count,
  // so the character the player is pointing at is part of the name.
  const ram = midEntry([cellOf('S'), cellOf('E')], cellOf('X'));
  assert.equal(nameFinish28F606(ram, ROM, A4), 'filtered');
  assert.equal(ram.u16(A4 + COUNT), 3);
  // ...and then the filter replaces it, because SEX is banned. Both halves in one call.
  assert.equal(name(ram), 'DDP', 'and the filter caught it');
});

test('W311 `ZQ` finished on `T` becomes `ZQT` and survives the filter', { skip: SKIP }, () => {
  const ram = midEntry([cellOf('Z'), cellOf('Q')], cellOf('T'));
  assert.equal(nameFinish28F606(ram, ROM, A4), 'filtered');
  assert.equal(name(ram), 'ZQT', 'not on the list');
  assert.deepEqual(row(ram), ['Z', 'Q', 'T'].map((c) => cellOf(c) * NAME_ALPHA.scale));
});

test('W311 one character finished short pads the REST with the END glyph', { skip: SKIP }, () => {
  // `$28F630 cmpi.w #$3 / bne $28F5E8` -- the padding loop W309 found, reached from here as its
  // second caller. So `S` finished on `E` is `S E <28>`, not `S E` and a stale third slot.
  const ram = midEntry([cellOf('S')], cellOf('E'));
  assert.equal(nameFinish28F606(ram, ROM, A4), 'filtered');
  assert.equal(ram.u16(A4 + COUNT), 3, 'padded to three');
  assert.deepEqual(row(ram),
    [cellOf('S') * 4, cellOf('E') * 4, NAME_ALPHA.last * 4]);
  assert.equal(name(ram), 'SE<28>');
});

test('W311 two characters finished need no padding', { skip: SKIP }, () => {
  const ram = midEntry([cellOf('Q'), cellOf('Q')], cellOf('Q'));
  assert.equal(nameFinish28F606(ram, ROM, A4), 'filtered');
  assert.deepEqual(row(ram), [cellOf('Q') * 4, cellOf('Q') * 4, cellOf('Q') * 4]);
  assert.ok(!row(ram).includes(NAME_ALPHA.last * 4), 'nothing was padded');
});

// ==================== 2. FINISHING ON `END` IS THE THIRD DDP CALLER

test('W311 finishing with the cursor ON `END` gives `DDP`', { skip: SKIP }, () => {
  // `$28F61A cmpi.w #$1B,($18,A4) / bcs` then `bra $28F59E`. W306 found the banned-name caller and
  // W309 the empty-name one; this is the third, and the three are the three ways to decline to
  // enter a name.
  for (const already of [1, 2]) {
    const ram = midEntry(Array.from({ length: already }, (_, i) => i + 3), CURSOR.endCell);
    assert.equal(nameFinish28F606(ram, ROM, A4), 'default');
    assert.equal(name(ram), 'DDP', `with ${already} already entered`);
    assert.equal(ram.u16(A4 + COUNT), 3);
  }
});

test('W311 `$28F59E` really has three callers', { skip: SKIP_IMG }, () => {
  // Two branches and one fall-through, read out of the image so "three callers" is not a claim.
  assert.equal(IMG.readUInt16BE(0x28f59c), 0x6668, '$28F59C bne -- the empty-name fall-through');
  assert.equal(0x28f69e + 2 + IMG.readInt16BE(0x28f6a0), 0x28f59e, '$28F69E beq -- the filter');
  assert.equal(IMG.readUInt16BE(0x28f624), 0x6000, '$28F624 bra.w');
  assert.equal(0x28f626 + IMG.readInt16BE(0x28f626), 0x28f59e, '-- the END-cell finish');
});

// ==================== 3. EVERY COMPLETING PATH REACHES THE FILTER

test('W311 the padding loop leaves through `bra $28F674`', { skip: SKIP_IMG }, () => {
  // `$28F600 bne $28F5EA` falls out into `$28F602 bra $28F674`, so both of the padding loop's
  // callers land on the filter and the filter's own three-character gate can only see three.
  assert.equal(IMG.readUInt16BE(0x28f602), 0x6000);
  assert.equal(0x28f604 + IMG.readInt16BE(0x28f604), 0x28f674, 'the filter');
  assert.equal(IMG.readUInt16BE(0x28f638), 0x6000, 'and the three-character path too');
  assert.equal(0x28f63a + IMG.readInt16BE(0x28f63a), 0x28f674);
});

test('W311 a completed name that IS banned comes out as `DDP` either way', { skip: SKIP }, () => {
  // Two routes to the same place: finish on the third character of a banned name, or select the
  // third and then finish on END. Both must end as DDP, by different mechanisms.
  const viaFilter = midEntry([cellOf('K'), cellOf('K')], cellOf('K'));
  assert.equal(nameFinish28F606(viaFilter, ROM, A4), 'filtered');
  assert.equal(name(viaFilter), 'DDP', 'KKK caught by the filter');

  // The second route is NOT "three entered then finish on END". `$28F61A` tests the END cell
  // BEFORE it looks at the count, so finishing on END discards the name and writes DDP outright --
  // the filter never sees `KKK` at all. Same outcome, different reason, and my first draft of this
  // test expected `filtered`.
  const viaEnd = completedEntry([cellOf('K'), cellOf('K'), cellOf('K')], CURSOR.endCell);
  assert.equal(nameCommit(viaEnd, ROM, A4), 'default', 'END short-circuits the count test');
  assert.equal(name(viaEnd), 'DDP');
});

test('W311 the END-cell test comes BEFORE the count test', { skip: SKIP }, () => {
  // Which means finishing on END always discards whatever was typed, however much of it there is.
  // A port that checked the count first would try to write a fourth character.
  for (const already of [0, 1, 2, 3]) {
    const chars = Array.from({ length: already }, () => cellOf('Q'));
    const ram = already === 3
      ? completedEntry(chars, CURSOR.endCell) : midEntry(chars, CURSOR.endCell);
    const how = nameCommit(ram, ROM, A4);
    assert.equal(name(ram), 'DDP', `${already} entered, finished on END`);
    assert.equal(how, 'default');
  }
});

test('W311 the padded all-END name is caught by the filter, in the SAME frame', { skip: SKIP }, () => {
  // Selecting END with nothing entered pads all three slots with index 28 -- W306's seventeenth
  // banned entry -- and because `$28F602 bra $28F674` continues into the filter, the replacement
  // happens before the frame is over. So the select arm and the finish button reach `DDP` by two
  // different mechanisms, and it is the PADDING path that needs the list entry to exist.
  assert.deepEqual(bannedNames(ROM)[16],
    [0, 1, 2].map(() => NAME_ALPHA.last * NAME_ALPHA.scale), 'the all-END triple');
  const ram = midEntry([], CURSOR.endCell);
  ram.setU16(A4 + NAME_REC.input, SELECT);
  assert.equal(nameButtons28F588(ram, ROM, A4, null), 'end');
  assert.equal(name(ram), 'DDP', 'one call, and it is already replaced');
});

test('W311 a padded name that is NOT banned survives', { skip: SKIP }, () => {
  // The other side of the same arm: `D <28> <28>` is not on the list, so the padding is what the
  // player gets. Without this the test above would pass for a port that simply always wrote DDP.
  const ram = midEntry([cellOf('D')], CURSOR.endCell);
  ram.setU16(A4 + NAME_REC.input, SELECT);
  assert.equal(nameButtons28F588(ram, ROM, A4, null), 'end');
  assert.equal(name(ram), 'D<28><28>');
});

// ==================== 4. `nameCommit` IS THE WHOLE PATH

test('W311 an empty name commits as `DDP` without the filter', { skip: SKIP }, () => {
  // `$28F598 tst.w ($16,A4) / bne` -- zero goes straight to the DDP write, so the banned list is
  // never consulted. The default is not "AAA caught by the filter".
  const ram = midEntry([], cellOf('Q'));
  assert.equal(nameCommit(ram, ROM, A4), 'default');
  assert.equal(name(ram), 'DDP');
});

test('W311 the live button decode executes both complete commit paths', { skip: SKIP }, () => {
  const empty = midEntry([], cellOf('Q'));
  empty.setU16(A4 + NAME_REC.input, FINISH);
  assert.equal(nameButtons28F588(empty, ROM, A4, null), 'finish-empty');
  assert.equal(name(empty), 'DDP');
  assert.equal(empty.u16(A4 + 0x1e), 0x70, 'empty finish ran the common commit tail');

  const some = midEntry([cellOf('Z')], cellOf('Q'));
  some.setU16(A4 + NAME_REC.input, FINISH);
  assert.equal(nameButtons28F588(some, ROM, A4, null), 'finish');
  assert.equal(name(some), 'ZQ<28>', 'the live arm ran `$28F606` before returning');
  assert.equal(some.u16(A4 + 0x1e), 0x70, 'nonempty finish ran the common commit tail');
});

test('W311 a full name reaching `$28F606` throws', { skip: SKIP }, () => {
  // The finish button reaches here only with 1 or 2 entered: empty goes to `$28F59E` and three
  // cannot be added to. Nothing in `$28F606` bounds the slot, so a count of three means an arm
  // above was skipped.
  const ram = completedEntry([1, 2, 3], cellOf('Q'));
  assert.throws(() => nameFinish28F606(ram, ROM, A4), /an arm above was skipped/);
});

test('W311 the character value is the cell times four here too', { skip: SKIP }, () => {
  // The same scale as `$28F652` (W309), from a second site. Worth pinning because this one uses
  // `($18,A4)` directly rather than the D0 the select arm already had.
  for (const cell of [0, 5, 18, 25, 26]) {
    const ram = midEntry([cellOf('Q'), cellOf('Q')], cell);
    nameFinish28F606(ram, ROM, A4);
    assert.equal(ram.u32(BIG + 2 * 4), cell * NAME_ALPHA.scale, `cell ${cell}`);
  }
});
