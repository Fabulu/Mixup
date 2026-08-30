// W309: the name entry's button handling, and the routine that MAKES a character value.
//
// Three waves inferred that a stored character is an index times four. This is the code that
// creates them -- `add.w D0,D0` twice on the cursor's grid position -- so the alphabet stops
// being an inference here. Two other things close at the same time: `$70 $70 $70` in W306's
// banned list is the all-END name, and `DDP` is the default rather than only the punishment.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { hiscoreDefaults28841E } from '../src/hiscore.js';
import {
  NAME_REC, NAME_ALPHA, charName, bannedNames, nameButtons28F588, nameFilter28F674,
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
const SETUP_FLAGS = 0x81e0d9;
const INPUT_W = 0x36;
const COUNT = 0x16;
const GRIDPOS = 0x18;

const FINISH = 0x8000;
const BACKSPACE = 0x20;
const SELECT = 0x10;

/** A machine with the row pointer set, as `$28F75A` leaves it. */
function entering() {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  ram.setU32(A4 + NAME_REC.entry, BIG);
  ram.setU16(A4 + COUNT, 0);
  for (let k = 0; k < 3; k++) ram.setU32(BIG + k * 4, 0xdead0000 + k);
  return ram;
}
const world = () => {
  const posts = [];
  return { posts, ctx: { rom: ROM, soundPost: (address) => posts.push(address) } };
};
const row = (ram) => [0, 1, 2].map((k) => ram.u32(BIG + k * 4));
/** Press `bits` with the cursor on `pos`. */
function press(ram, bits, pos = 0) {
  ram.setU16(A4 + INPUT_W, bits);
  ram.setU16(A4 + GRIDPOS, pos);
  return nameButtons28F588(ram, ROM, A4, world().ctx);
}

// ==================== 1. THE CHARACTER VALUE IS MADE HERE

test('W309 a selected character is the grid position TIMES FOUR', { skip: SKIP }, () => {
  // `add.w D0,D0` twice on `($18,A4)`. This is the fourth confirmation of the alphabet and the
  // first that is causal: W301 inferred the scale from data, W302 found the instruction that
  // requires it, W306 decoded words -- and this routine creates the values.
  for (const pos of [0, 1, 4, 18, 23, 25, 26]) {
    const ram = entering();
    assert.equal(press(ram, SELECT, pos), 'char');
    assert.equal(ram.u32(BIG), pos * NAME_ALPHA.scale, `position ${pos}`);
  }
  // 0..25 are A..Z. The grid has 27 cells, so cell 26 is a TWENTY-SEVENTH character that is not
  // a letter -- which is why `charName` names it by index and why the font needs 27 glyphs plus
  // END rather than 26.
  for (const pos of [0, 1, 4, 18, 23, 25]) {
    const ram = entering();
    press(ram, SELECT, pos);
    assert.equal(charName(ram.u32(BIG)), String.fromCharCode(65 + pos), `position ${pos}`);
  }
  const extra = entering();
  press(extra, SELECT, 26);
  assert.equal(charName(extra.u32(BIG)), '<26>', 'and cell 26 is not a letter');
  assert.equal(NAME_ALPHA.letters, 26, 'A..Z is 26 of the 27 selectable cells');
});

test('W309 the third character commits in the same call', { skip: SKIP }, () => {
  // The slot is the count BEFORE the increment (`move.w ($16,A4),D1` then `addq`), so the first
  // character goes to slot 0. When the increment reaches three, `$28F664` continues through the
  // filter and commit tail before another input frame can occur.
  const ram = entering();
  ram.setU16(A4 + NAME_REC.setupBit, 1);
  ram.setU8(SETUP_FLAGS, 1 << 1);
  for (const [i, pos] of [2, 0, 19].entries()) {
    assert.equal(press(ram, SELECT, pos), 'char');
    assert.equal(ram.u16(A4 + COUNT), i + 1);
  }
  assert.deepEqual(row(ram), [2, 0, 19].map((p) => p * 4), 'C, A, T in slot order');
  assert.equal(ram.u16(A4 + 0x1e), 0x70, 'the commit tail armed the countdown immediately');
  assert.equal(ram.u8(SETUP_FLAGS), 0, 'and released the side setup bit');
  assert.equal(ram.u32(A4 + 0x1a), 0, 'and cleared the panel animation state');
});

test('W309 a fourth live select is unreachable after the third commits', { skip: SKIP }, () => {
  const ram = entering();
  for (const pos of [2, 0, 19]) press(ram, SELECT, pos);
  assert.equal(ram.u16(A4 + 0x1e), 0x70,
    'the next name-entry frame takes the countdown arm instead of button input');
});

test('W309 either bit of the `$50` mask selects', { skip: SKIP }, () => {
  // `andi.w #$50,D0 / beq` -- bits 4 and 6, and either one on its own is enough.
  for (const bits of [0x10, 0x40, 0x50]) {
    const ram = entering();
    assert.equal(press(ram, bits, 5), 'char', `$${bits.toString(16)}`);
    assert.equal(ram.u32(BIG), 5 * 4);
  }
  const none = entering();
  assert.equal(press(none, 0x0e, 5), 'idle', 'and the direction bits do not select');
});

// ==================== 2. THE END CELL, WHICH EXPLAINS W306'S LAST ENTRY

test('W309 the grid is 27 cells and `$1B` up is END', { skip: SKIP }, () => {
  // `cmpi.w #$1B,D0 / bcs $28F652` -- unsigned, so 0..26 are characters. 27 selectable
  // characters, the font's hole at 27 that nothing can reach, and END's glyph at 28. The
  // 29-entry font W302 had to size a window around is exactly that shape.
  assert.equal(NAME_ALPHA.hole, 27);
  assert.equal(NAME_ALPHA.last, 28);
  const last = entering();
  assert.equal(press(last, SELECT, 26), 'char', 'cell 26 is still a character');
  const end = entering();
  assert.equal(press(end, SELECT, 27), 'end', 'and cell 27 is END');
});

test('W309 END pads EVERY remaining slot, not just the next one', { skip: SKIP }, () => {
  // `$28F5EA..$28F600` loops until the count reaches three. Padding one slot would leave the
  // others holding whatever the insert's shift dragged down.
  //
  // W311 CORRECTION: the arm does not stop at the padding. `$28F602 bra $28F674` runs the filter
  // and the commit in the same frame, so the padded name is only visible when it SURVIVES the
  // filter -- which `D <28> <28>` does and the all-END name does not.
  for (const already of [1, 2]) {
    const ram = entering();
    for (let i = 0; i < already; i++) press(ram, SELECT, 3 + i);
    assert.equal(press(ram, SELECT, 0x1b), 'end');
    assert.equal(ram.u16(A4 + COUNT), 3, `from ${already} entered`);
    for (let k = already; k < 3; k++) {
      assert.equal(ram.u32(BIG + k * 4), NAME_ALPHA.last * 4, `slot ${k} is index 28`);
    }
  }
});

test('W309 the all-END name is W306\'s seventeenth entry, so END alone gives DDP',
  { skip: SKIP }, () => {
    // The finding this test exists for, in two halves. The DATA half: `$70 $70 $70` is not an
    // arbitrary triple of the last glyph, it is what padding three empty slots produces. The
    // BEHAVIOUR half: because the arm falls into the filter, selecting END with nothing entered
    // comes straight out as `DDP` -- the all-END name never survives a frame.
    assert.deepEqual(bannedNames(ROM)[16],
      [0, 1, 2].map(() => NAME_ALPHA.last * NAME_ALPHA.scale), 'index 28 three times');
    const ram = entering();
    assert.equal(press(ram, SELECT, 0x1b), 'end');
    assert.deepEqual(row(ram), NAME_ALPHA.replacement, 'and it comes out as DDP');
    // The filter has already run, so running it again finds nothing to do.
    assert.equal(nameFilter28F674(ram, ROM, A4), 'allowed', 'DDP itself is not banned');
  });

// ==================== 3. BACKSPACE, AND WHY `AAA` IS ON THE LIST

test('W309 backspace un-counts and blanks the slot it frees', { skip: SKIP }, () => {
  // `subq.w #1,($16,A4)` then `moveq #$0,D0` and the shared write at `$28F65E`. The slot written
  // is the NEW count, i.e. the one just freed.
  const ram = entering();
  for (const pos of [18, 4]) press(ram, SELECT, pos);
  assert.equal(press(ram, BACKSPACE), 'backspace');
  assert.equal(ram.u16(A4 + COUNT), 1);
  assert.deepEqual(row(ram), [18 * 4, 0, 0xdead0002], 'slot 1 is blanked, not slot 0');
});

test('W309 backspacing everything leaves `AAA`, which is banned entry 0', { skip: SKIP }, () => {
  // Character 0 is 'A'. The untouched third slot is already the panel's blank A, so typing two
  // characters and deleting both restores the complete AAA row without ever reaching the
  // three-character commit arm.
  const ram = entering();
  ram.setU32(BIG + 2 * 4, 0);
  for (const pos of [1, 2]) press(ram, SELECT, pos);
  for (let i = 0; i < 2; i++) assert.equal(press(ram, BACKSPACE), 'backspace');
  assert.equal(ram.u16(A4 + COUNT), 0);
  assert.deepEqual(row(ram), [0, 0, 0]);
  assert.deepEqual(row(ram), bannedNames(ROM)[0], 'which is entry 0');
  assert.equal(bannedNames(ROM)[0].map(charName).join(''), 'AAA');
});

test('W309 backspace with nothing entered is a bare `rts`', { skip: SKIP }, () => {
  // `$28F642 beq $28F6C6`. Nothing must be written, or slot -1 would be the entry before this one.
  const ram = entering();
  const before = row(ram);
  assert.equal(press(ram, BACKSPACE), 'idle');
  assert.equal(ram.u16(A4 + COUNT), 0);
  assert.deepEqual(row(ram), before, 'the row is untouched');
});

// ==================== 4. `DDP` IS THE DEFAULT, NOT ONLY THE PUNISHMENT

test('W309 finishing with an EMPTY name writes and commits `DDP` directly', { skip: SKIP }, () => {
  // `$28F598 tst.w ($16,A4) / $28F59C bne $28F606` falls THROUGH into the write W306 ported as
  // the banned-name replacement, then branches to the common commit tail in this same call.
  const ram = entering();
  assert.equal(press(ram, FINISH), 'finish-empty');
  assert.deepEqual(row(ram), NAME_ALPHA.replacement);
  assert.equal(row(ram).map(charName).join(''), 'DDP');
  assert.equal(ram.u16(A4 + COUNT), 3, 'and it is marked complete');
  assert.equal(ram.u16(A4 + 0x1e), 0x70, 'the countdown is already armed');
});

test('W309 finishing with anything entered runs `$28F606` and commits', { skip: SKIP }, () => {
  const ram = entering();
  press(ram, SELECT, 18);
  assert.equal(press(ram, FINISH), 'finish');
  assert.deepEqual(row(ram), [18 * 4, 0, NAME_ALPHA.last * 4],
    'the cursor character and END padding were written in the same call');
  assert.equal(ram.u16(A4 + COUNT), 3);
  assert.equal(ram.u16(A4 + 0x1e), 0x70, 'and the common commit tail ran');
});

test('W309 the two callers of `$28F59E` write the same three longs', { skip: SKIP_IMG }, () => {
  // One reached by falling through `$28F59C`, one by `$28F69E beq`. Asserted from the image so
  // the shared-target claim is not just a reading.
  assert.equal(IMG.readUInt16BE(0x28f59c), 0x6668, '$28F59C bne, 8-bit displacement $68');
  assert.equal(0x28f59e + 0x68, 0x28f606, 'which lands on $28F606');
  assert.equal(IMG.readUInt16BE(0x28f69e), 0x6700, '$28F69E beq.w');
  assert.equal(0x28f6a0 + IMG.readInt16BE(0x28f6a0), 0x28f59e, 'and it lands on $28F59E');
  assert.equal(IMG.readUInt32BE(0x28f5a6), 0x0000000c, 'the first D');
  assert.equal(IMG.readUInt32BE(0x28f5ac), 0x0000000c, 'the second');
  assert.equal(IMG.readUInt32BE(0x28f5b2), 0x0000003c, 'and the P');
});

// ==================== 5. THE ORDER OF THE ARMS

test('W309 finish is tested BEFORE select, so a combined press finishes', { skip: SKIP }, () => {
  // The finish arm still commits the character under the cursor, but unlike the select arm it pads
  // the remaining slot and commits immediately. That makes the branch order observable.
  const ram = entering();
  press(ram, SELECT, 18);
  assert.equal(press(ram, FINISH | SELECT, 4), 'finish', 'finish wins');
  assert.deepEqual(row(ram), [18 * 4, 4 * 4, NAME_ALPHA.last * 4], 'SE<28>, not two entered');
  assert.equal(ram.u16(A4 + 0x1e), 0x70, 'the finish path committed');
});

test('W309 backspace is tested before select', { skip: SKIP }, () => {
  // `$28F5C4 moveq #$20,D3 / and.w D0,D3 / bne $28F63C` comes before the `$50` mask.
  const ram = entering();
  press(ram, SELECT, 18);
  assert.equal(press(ram, BACKSPACE | SELECT, 4), 'backspace', 'backspace wins');
  assert.equal(ram.u16(A4 + COUNT), 0);
});

test('W309 finish and select post the live `$28C6E0` sound exactly once', { skip: SKIP }, () => {
  for (const bits of [FINISH, SELECT]) {
    const ram = entering();
    const w = world();
    ram.setU16(A4 + INPUT_W, bits);
    ram.setU16(A4 + GRIDPOS, 5);
    nameButtons28F588(ram, ROM, A4, w.ctx);
    assert.deepEqual(w.posts, [0x28c6e0], `$${bits.toString(16)} posts SFX id $1A once`);
  }
});
