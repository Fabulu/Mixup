// W305: the name-entry screen's arms, and the `$8130CC` work list closing.
//
// Five waves each touched one bit of `$8130CC`. This is the routine that clears them, so the
// thread can be asserted end to end: bonus line 2 sets a side's bit when it makes the table,
// and the name entry clears it when that side has no tagged row left.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import {
  hiscoreDefaults28841E, hiscoreCheck287BD2, hiscoreCheck287C08, HISCORE_SIDES,
  tagForSide, tagLookupForSide,
} from '../src/hiscore.js';
import {
  NAME_REC, NAME_OBJ, NAME_SCREEN, NAME_ARMS,
  nameArm28F428, nameCache28F75A, nameGiveUp28F6C8,
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
const A5 = 0x81f280;
const BIG = 0x803838;

function factory() {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  return ram;
}
/** A machine where `side` has just made the table, so its row carries the tag. */
function owed(side, score = 0x02000000) {
  const ram = factory();
  const spec = HISCORE_SIDES[side];
  ram.setU32(spec.total, score);
  ram.setU16(spec.ovf, 0);
  const made = (side === 0 ? hiscoreCheck287BD2 : hiscoreCheck287C08)(ram).made;
  // `$26007C`/`$260092 ori.b` -- the bit is bonus line 2's to set, not the check's, so the
  // fixture has to do what the caller does.
  if (made) ram.setU8(NAME_SCREEN.flags, ram.u8(NAME_SCREEN.flags) | spec.flagBit);
  // `$28F350 move.b $8130CC,($5,A5)` -- the screen copies the flag byte into its object.
  ram.setU8(A5 + NAME_OBJ.owed, ram.u8(NAME_SCREEN.flags));
  // `$28F420 clr.w ($2C,A4)` is the ARM's job; a test calling `$28F75A` directly must do it.
  ram.setU16(A4 + NAME_REC.side, side);
  return ram;
}

// ==================== 1. THE ARMS ARE TWINS, AND THE TAG IS THE DIFFERENCE

test('W305 the two arms differ only in which tag they search for', { skip: SKIP_IMG }, () => {
  // `$28F428` and `$28F482` are byte-identical apart from the `bsr` displacement. Asserted
  // from the image, because "identical twins" is the sort of claim that stops being true when
  // one of them grows a special case.
  assert.deepEqual(NAME_ARMS.map((a) => a.side), [0, 1]);
  assert.deepEqual(NAME_ARMS.map((a) => a.tag), [tagForSide(0), tagForSide(1)]);
  for (const off of [0, 8, 10, 14]) {   // the movem, the movem back, the bcc, the second bsr
    assert.equal(IMG.readUInt16BE(NAME_SCREEN.p1 + off),
      IMG.readUInt16BE(NAME_SCREEN.p2 + off), `word +${off} matches`);
  }
  // And both `bsr`s land on the two lookup heads.
  assert.equal(0x28f42e + IMG.readInt16BE(0x28f42e), NAME_ARMS[0].lookup);
  assert.equal(0x28f488 + IMG.readInt16BE(0x28f488), NAME_ARMS[1].lookup);
});

test('W305 an arm caches the row it found', { skip: SKIP }, () => {
  const ram = owed(0, 0x00820000);            // lands at index 2 in the factory table
  assert.equal(nameArm28F428(ram, ROM, A4, A5, 0), true);
  assert.equal(ram.u16(A4 + NAME_REC.live), 1, '($12,A4) is set before the lookup');
  assert.equal(ram.u16(A4 + NAME_REC.side), 0);
  assert.equal(ram.u16(A4 + NAME_REC.cursor), 0);
  assert.equal(ram.u16(A4 + NAME_REC.index), 2, 'the row index');
  assert.equal(ram.u32(A4 + NAME_REC.entry), BIG + 2 * 12, 'and the row\'s ADDRESS');
  assert.equal(ram.u32(A4 + NAME_REC.score), 0x00820000, 'the score long itself, not a pointer');
});

test('W305 an arm with no tagged row drops the side instead', { skip: SKIP }, () => {
  // `$28F430 bcc` -- the carry is SET on a miss, so this is the `bra $28F6C8` path.
  const ram = factory();
  ram.setU8(A5 + NAME_OBJ.owed, 0x03);
  assert.equal(nameArm28F428(ram, ROM, A4, A5, 0), false);
  assert.equal(ram.u8(A5 + NAME_OBJ.owed), 0x02, 'P1\'s bit is gone, P2\'s remains');
  assert.equal(ram.u16(A4 + NAME_REC.index), 0, 'and nothing was cached');
});

test('W305 a side above 1 throws, because there is no third tag', { skip: SKIP }, () => {
  const ram = factory();
  assert.throws(() => nameArm28F428(ram, ROM, A4, A5, 2), /only ever stamps/);
});

// ==================== 2. THE `swap` PAIRS

test('W305 the swap pairs put the HIGH half in the SECOND field', { skip: SKIP }, () => {
  // `($A)` takes D2's low (digits) and `($10)` its high (overflow); `($3A)` takes D3's low
  // (ship) and `($3C)` its high (style). The two fields of a pair sit far apart in the record,
  // so one round the wrong way is invisible until something reads it.
  const ram = owed(0);
  ram.setU16(0x8038a6, 0x2222);   // digits, index 0
  ram.setU16(0x8038b0, 0x1111);   // overflow
  ram.setU16(0x803888, 0x4444);   // ship
  ram.setU16(0x803892, 0x3333);   // style
  nameCache28F75A(ram, ROM, A4, tagLookupForSide(ram, 0));
  assert.equal(ram.u16(A4 + NAME_REC.digits), 0x2222, 'D2 low -> ($A)');
  assert.equal(ram.u16(A4 + NAME_REC.overflow), 0x1111, 'D2 high -> ($10)');
  assert.equal(ram.u16(A4 + NAME_REC.ship), 0x4444, 'D3 low -> ($3A)');
  assert.equal(ram.u16(A4 + NAME_REC.style), 0x3333, 'D3 high -> ($3C)');
});

// ==================== 3. THE TWELVE-WORD SETUP BLOCK

test('W305 the setup block is twelve words into twelve scattered fields', { skip: SKIP }, () => {
  // `$28F796..$28F7C2`, and the destination offsets are neither contiguous nor ascending past
  // `($8)`. The order is the DATA's; sorting the fields would pair the wrong word with the
  // wrong one.
  const ram = owed(0);
  nameCache28F75A(ram, ROM, A4, tagLookupForSide(ram, 0));
  const want = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    .map((i) => ROM.u16(NAME_SCREEN.blocks[0] + i * 2));
  const fields = [0x06, 0x08, 0x14, 0x16, 0x18, 0x1e, 0x20, 0x22, 0x24, 0x26, 0x28, 0x2a];
  assert.deepEqual(fields.map((f) => ram.u16(A4 + f)), want);
  assert.equal(want.length, NAME_SCREEN.blockWords);
});

test('W305 the two blocks differ in exactly TWO of their twelve words', { skip: SKIP }, () => {
  // An X ($0A40 vs $1000) and a flag (0 vs 1). Everything else is shared, which is what makes
  // the pair a per-side parameter set rather than two layouts.
  const a = [...Array(12)].map((_, i) => ROM.u16(NAME_SCREEN.blocks[0] + i * 2));
  const b = [...Array(12)].map((_, i) => ROM.u16(NAME_SCREEN.blocks[1] + i * 2));
  const differ = a.map((v, i) => (v === b[i] ? -1 : i)).filter((i) => i >= 0);
  assert.deepEqual(differ, [1, 4], 'words 1 and 4');
  assert.deepEqual([a[1], b[1]], [0x0a40, 0x1000], 'the X');
  assert.deepEqual([a[4], b[4]], [0x0000, 0x0001], 'and the flag');
});

test('W305 the two blocks are ADJACENT, which is what sizes the window', { skip: SKIP }, () => {
  assert.equal(NAME_SCREEN.blocks[0] + NAME_SCREEN.blockWords * 2, NAME_SCREEN.blocks[1]);
  assert.equal(NAME_SCREEN.blocks[1] + NAME_SCREEN.blockWords * 2, 0x28f9ac,
    'and the window\'s $30 covers both exactly');
});

test('W305 the setup flag bits are 1 and 2, NOT 0 and 1', { skip: SKIP }, () => {
  // `$28F77A moveq #$1,D0` and `$28F788 moveq #$2,D0` feed `bset D0,$81E0D9`. The work-list
  // byte in the SAME routine family uses bits 0 and 1, so having two different bit numberings
  // one screen apart is exactly the kind of thing to get wrong by pattern-matching.
  assert.deepEqual(NAME_SCREEN.setupBits, [1, 2]);
  for (const side of [0, 1]) {
    const ram = owed(side);
    ram.setU8(NAME_SCREEN.setupFlag, 0);
    nameCache28F75A(ram, ROM, A4, tagLookupForSide(ram, side));
    assert.equal(ram.u8(NAME_SCREEN.setupFlag), 1 << NAME_SCREEN.setupBits[side],
      `side ${side} sets bit ${NAME_SCREEN.setupBits[side]}`);
  }
});

// ==================== 4. THE `$8130CC` WORK LIST, END TO END

test('W305 the work-list bits are the ones bonus line 2 set', { skip: SKIP }, () => {
  // `$26007C ori.b #$1` / `$260092 ori.b #$2` set bits 0 and 1, and `bclr D0,($5,A5)` with D0
  // straight from `($2C,A4)` clears bit 0 or bit 1. Both ends of a five-wave thread, asserted
  // against each other rather than against a comment.
  assert.equal(HISCORE_SIDES[0].flagBit, 0x01);
  assert.equal(HISCORE_SIDES[1].flagBit, 0x02);
  const ram = owed(1);
  assert.equal(ram.u8(A5 + NAME_OBJ.owed) & 0x02, 0x02, 'P2 owes a name');
  assert.equal(ram.u8(A5 + NAME_OBJ.owed) & 0x01, 0, 'and P1 does not');
});

test('W305 dropping one side leaves the other, and does not end the screen', { skip: SKIP }, () => {
  // `$28F6D4 bne $28F6C6` lands on a bare `rts`, so a side going while the other still owes a
  // name changes nothing else. Only the LAST one writes the state.
  const ram = factory();
  ram.setU8(A5 + NAME_OBJ.owed, 0x03);
  ram.setU8(A5 + NAME_OBJ.state, 0);
  ram.setU16(A4 + NAME_REC.side, 0);
  assert.equal(nameGiveUp28F6C8(ram, A4, A5), false, 'the list is not empty yet');
  assert.equal(ram.u8(A5 + NAME_OBJ.owed), 0x02);
  assert.equal(ram.u8(A5 + NAME_OBJ.state), 0, 'and the screen has NOT advanced');
});

test('W305 dropping the last side ends the screen', { skip: SKIP }, () => {
  const ram = factory();
  ram.setU8(A5 + NAME_OBJ.owed, 0x02);
  ram.setU8(A5 + NAME_OBJ.state, 0);
  ram.setU16(A4 + NAME_REC.side, 1);
  assert.equal(nameGiveUp28F6C8(ram, A4, A5), true);
  assert.equal(ram.u8(A5 + NAME_OBJ.owed), 0);
  assert.equal(ram.u8(A5 + NAME_OBJ.state), NAME_OBJ.doneState, '($2,A5) becomes 2');
});

test('W305 a side with a real tagged row is NOT dropped', { skip: SKIP }, () => {
  // The whole point of the work list: a bit survives exactly as long as its row is tagged.
  const ram = owed(0);
  const before = ram.u8(A5 + NAME_OBJ.owed);
  assert.equal(nameArm28F428(ram, ROM, A4, A5, 0), true);
  assert.equal(ram.u8(A5 + NAME_OBJ.owed), before, 'the bit is untouched');
});

// ==================== 5. THE LOOKUP'S CARRY IS IMPLICIT

test('W305 the miss carry comes from `subq`, and the hit carry from `add.w`', { skip: SKIP_IMG }, () => {
  // `$28F430 bcc` reads a carry `$28F6F4` never sets explicitly. The miss path's
  // `moveq #$0,D0 / subq.w #1,D0` BORROWS, and the hit path's last flag-setter is
  // `add.w D0,D0`, which for the largest index (4 -> 16) cannot carry out of a word. So the
  // hit path's carry-clear is a side effect, correct here and fragile in a bigger table --
  // worth pinning the instructions rather than only the behaviour.
  assert.equal(IMG.readUInt16BE(0x28f708), 0x7000, '$28F708 moveq #$0,D0');
  assert.equal(IMG.readUInt16BE(0x28f70a), 0x5340, '$28F70A subq.w #1,D0 -- the borrow');
  assert.equal(IMG.readUInt16BE(0x28f74e), 0xd040, '$28F74E add.w D0,D0');
  assert.equal(IMG.readUInt16BE(0x28f756), 0xd2c0, '$28F756 adda.w D0,A1 -- no flags');
  assert.equal(IMG.readUInt16BE(0x28f758), 0x4e75, 'and then rts');
  // The largest index the table allows, doubled, still fits a word.
  assert.ok((4 * 2) * 2 < 0x10000);
});

test('W305 the record\'s field names are all stores this wave read', { skip: SKIP }, () => {
  // Guard against the struct drifting into invention: every offset in NAME_REC must be one of
  // the ones the transcription writes, and they must all be distinct.
  const offs = Object.values(NAME_REC);
  assert.equal(new Set(offs).size, offs.length, 'no two fields share an offset');
  for (const o of offs) assert.ok(o >= 0x02 && o <= 0x3c, `$${o.toString(16)} is in the record`);
  assert.equal(NAME_REC.side, 0x2c, 'and ($2C) is W304\'s `not.b` input');
});
