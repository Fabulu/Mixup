// W306: `$28F674`'s banned-name filter, and the alphabet it proves.
//
// Three waves inferred that a stored character is an index times four without ever learning
// what index 0 is. This table decodes as words, which is about as independent a check on an
// index convention as this port can get -- so most of what follows is that decode, asserted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { hiscoreDefaults28841E, hiscoreCheck287BD2 } from '../src/hiscore.js';
import {
  NAME_REC, NAME_ALPHA, NAME_SCREEN, charName, bannedNames, nameFilter28F674,
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

/** A machine with P1's row tagged, so `($30,A4)` has a real row to point at. */
function entering(chars) {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  ram.setU32(0x81b440, 0x02000000);          // P1's total -- beats the factory table
  ram.setU16(0x81b44c, 0);
  hiscoreCheck287BD2(ram);
  ram.setU32(A4 + NAME_REC.entry, BIG);      // index 0, the row the insert made
  ram.setU16(A4 + NAME_ALPHA.countField, NAME_ALPHA.chars);
  for (const [k, c] of chars.entries()) ram.setU32(BIG + k * 4, c);
  return ram;
}
const letters = (s) => [...s].map((c) => (c.charCodeAt(0) - 65) * NAME_ALPHA.scale);
const row = (ram) => [0, 1, 2].map((k) => ram.u32(BIG + k * 4));

// ==================== 1. THE DECODE, WHICH IS THE FINDING

test('W306 the table decodes as WORDS, which fixes index 0 as `A`', { skip: SKIP }, () => {
  // Divide each stored value by four and read 0 as 'A'. Fourteen of the seventeen come out as
  // recognisable English or Japanese, and `SEX` = 18,4,23 with `KKK` = 10,10,10 pins the
  // mapping exactly. It is a profanity filter.
  const names = bannedNames(ROM).map((e) => e.map(charName).join(''));
  assert.deepEqual(names, [
    'AAA', 'AHO', 'ASS', 'AUM', 'DIE', 'ETA', 'FUC', 'FUK', 'HIV', 'IRA',
    'KKK', 'OSI', 'PEE', 'PIS', 'PLO', 'SEX', '<28><28><28>',
  ]);
  // The two that fix the mapping on their own, stated as arithmetic rather than as a string.
  assert.deepEqual(bannedNames(ROM)[15], letters('SEX'), 'SEX is 18, 4, 23 times four');
  assert.deepEqual(bannedNames(ROM)[10], letters('KKK'), 'and KKK is 10, 10, 10');
});

test('W306 every stored character is a multiple of four in range', { skip: SKIP }, () => {
  // W301 inferred this from the factory table and W302 found the instruction that requires it.
  // Seventeen more entries, none of which had to agree, and all of which do.
  for (const [i, entry] of bannedNames(ROM).entries()) {
    for (const c of entry) {
      assert.equal(c % NAME_ALPHA.scale, 0, `entry ${i}: $${c.toString(16)}`);
      assert.ok(c / NAME_ALPHA.scale <= NAME_ALPHA.last, `entry ${i} is inside the font`);
    }
  }
});

test('W306 the last entry is index 28, the glyph AFTER the font\'s hole', { skip: SKIP }, () => {
  // W302 found both fonts are 29 longs with `$00000000` at offset $6C -- index 27. So the
  // alphabet is A..Z at 0..25 plus three more slots of which 27 is unused, and this entry
  // using 28 is what shows 28 is real. It also means a window sized to 27 characters would
  // have made this very entry unrenderable.
  assert.deepEqual(bannedNames(ROM)[16], [0x70, 0x70, 0x70]);
  assert.equal(0x70 / NAME_ALPHA.scale, NAME_ALPHA.last);
  assert.equal(NAME_ALPHA.hole, 27);
  assert.equal(ROM.u32(0x25b7e6 + NAME_ALPHA.hole * 4), 0, 'and 27 really is the hole');
  assert.notEqual(ROM.u32(0x25b7e6 + NAME_ALPHA.last * 4), 0, 'while 28 is a glyph');
});

// ==================== 2. THE SENTINEL IS FOUR BYTES, NOT AN ENTRY

test('W306 the sentinel is one LONG and the setup block starts right after', { skip: SKIP_IMG }, () => {
  // `$28F686 beq` fires on the first long, so `$28F978` is a four-byte terminator rather than
  // a twelve-byte entry -- and `$28F97C`, the P1 setup block W305 windowed, begins immediately.
  // Sizing this table to whole entries would overlap that block.
  assert.equal(NAME_ALPHA.table + NAME_ALPHA.entries * NAME_ALPHA.stride, NAME_ALPHA.sentinel);
  assert.equal(IMG.readUInt32BE(NAME_ALPHA.sentinel), 0xffffffff);
  assert.equal(NAME_ALPHA.sentinel + 4, NAME_SCREEN.blocks[0], 'and the block abuts it');
  assert.equal(IMG.readUInt32BE(NAME_SCREEN.blocks[0]), 0x35000a40,
    'the block\'s first two words, which are NOT part of any name');
  assert.equal(ROM.u32(NAME_ALPHA.sentinel), 0xffffffff, 'and the window reaches the sentinel');
});

test('W306 the scan has no counter, so the sentinel is the only bound', { skip: SKIP }, () => {
  // `bra $28F67A` with no `dbra` anywhere. Worth an assertion because it means a table without
  // its terminator walks into the setup blocks and then into code -- the port throws instead.
  const ram = entering(letters('QQQ'));
  assert.equal(nameFilter28F674(ram, ROM, A4), 'allowed', 'a clean name reaches the sentinel');
});

// ==================== 3. ALLOWED, REJECTED, INCOMPLETE

test('W306 a name that is not in the table is allowed through unchanged', { skip: SKIP }, () => {
  const ram = entering(letters('ZXQ'));
  assert.equal(nameFilter28F674(ram, ROM, A4), 'allowed');
  assert.deepEqual(row(ram), letters('ZXQ'), 'and it is untouched');
});

test('W306 a banned name is REPLACED with `DDP`, not rejected', { skip: SKIP }, () => {
  // `$28F5A4 move.l #$C / $28F5AA move.l #$C / $28F5B0 move.l #$3C` -- 3, 3, 15, the game's own
  // initials. The player is never asked again: `$28F5BC bra $28F6A8` commits it.
  assert.deepEqual(NAME_ALPHA.replacement, letters('DDP'), 'and the constants really say DDP');
  for (const bad of ['SEX', 'KKK', 'ASS', 'DIE']) {
    const ram = entering(letters(bad));
    assert.equal(nameFilter28F674(ram, ROM, A4), 'replaced', bad);
    assert.deepEqual(row(ram), letters('DDP'), `${bad} became DDP`);
    assert.equal(ram.u16(A4 + NAME_ALPHA.countField), NAME_ALPHA.chars, 'still complete');
  }
});

test('W306 the FIRST and LAST real entries both match', { skip: SKIP }, () => {
  // The ends of a linear scan: entry 0 needs no `adda.w` at all and entry 16 needs sixteen of
  // them. An off-by-one in either direction shows up only here.
  for (const i of [0, NAME_ALPHA.entries - 1]) {
    const ram = entering(bannedNames(ROM)[i]);
    assert.equal(nameFilter28F674(ram, ROM, A4), 'replaced', `entry ${i} is reachable`);
  }
});

test('W306 all three characters must match, not just the first', { skip: SKIP }, () => {
  // Three separate `cmp.l`s with a `bne` after the first two. A filter that stopped at one
  // would reject every name beginning with a banned name's first letter.
  const ram = entering([...letters('SE'), letters('A')[0]]);   // SEA, not SEX
  assert.equal(nameFilter28F674(ram, ROM, A4), 'allowed');
  assert.deepEqual(row(ram), [...letters('SE'), letters('A')[0]]);
});

test('W306 fewer than three characters does NOTHING at all', { skip: SKIP }, () => {
  // `$28F66A cmpi.w #$3,($16,A4) / $28F670 bcs $28F6C6` -- the bare `rts`. Not "allowed": the
  // routine has not run, so a partial name must not be committed or replaced.
  for (const n of [0, 1, 2]) {
    const ram = entering(letters('SEX'));
    ram.setU16(A4 + NAME_ALPHA.countField, n);
    assert.equal(nameFilter28F674(ram, ROM, A4), 'incomplete', `count ${n}`);
    assert.deepEqual(row(ram), letters('SEX'), 'and even a banned name is left alone');
  }
});

test('W306 the count gate is UNSIGNED, and 3 is enough', { skip: SKIP }, () => {
  // `bcs` is a borrow, so the test is `< 3` unsigned and exactly 3 passes.
  const ram = entering(letters('KKK'));
  ram.setU16(A4 + NAME_ALPHA.countField, 3);
  assert.equal(nameFilter28F674(ram, ROM, A4), 'replaced', 'three is enough');
});

// ==================== 4. THE FILTER READS THE ROW, NOT A BUFFER

test('W306 the name compared is the one in `($30,A4)`', { skip: SKIP }, () => {
  // `movea.l ($30,A4),A0` INSIDE the loop, every iteration. W305 found `($30)` is the matched
  // row's address, so the filter reads the high-score table directly and the replacement writes
  // straight back into it -- there is no separate entry buffer to keep in step.
  const ram = entering(letters('SEX'));
  ram.setU32(A4 + NAME_REC.entry, BIG + 2 * 12);       // point at a DIFFERENT row
  for (const [k, c] of letters('SEX').entries()) ram.setU32(BIG + 2 * 12 + k * 4, c);
  assert.equal(nameFilter28F674(ram, ROM, A4), 'replaced');
  assert.deepEqual([0, 1, 2].map((k) => ram.u32(BIG + 2 * 12 + k * 4)), letters('DDP'),
    'row 2 was replaced');
  assert.deepEqual(row(ram), letters('SEX'), 'and row 0 was not touched');
});

test('W306 `charName` is a helper, not a claim about ROM data', { skip: SKIP }, () => {
  // Guard so the decode helper cannot quietly start accepting values the ROM never stores.
  assert.equal(charName(0), 'A');
  assert.equal(charName(0x64), 'Z');
  assert.equal(charName(0x70), '<28>');
  assert.equal(charName(0x6c), '<27>', 'the hole still names itself');
  assert.equal(charName(0xff), '<$ff>', 'and the tag is not a character');
  assert.equal(charName(0x0a), '<$a>', 'nor is anything unaligned');
});
