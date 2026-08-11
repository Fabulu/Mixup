// W304: the `$FF`/`$FE` tag is a SEARCH KEY, and the two routines that use it as one.
//
// W300 called the tag a sentinel, W302 found it could never reach the display's font, and
// W303's worklog named finding its reader as the next job. `$28F6F4` and `$28F7D2` both search
// the 12-byte array for it, which is what makes it a key -- and it is why the slot pointer the
// insert writes has no readers anywhere in the build.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import {
  hiscoreDefaults28841E, hiscoreCheck287BD2, hiscoreCheck287C08, HISCORE, HISCORE_SIDES,
  tagForSide, tagLookup28F6F4, tagLookupForSide, tagWrite28F7C8,
} from '../src/hiscore.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const BIG = 0x803838;
const A4 = 0x81f200;              // a scratch record, clear of every pool
const NAME = 0x81f300;            // a scratch three-long name buffer

function factory() {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  return ram;
}
/** Put a real winning score in for `side` so the insert stamps that side's tag. */
function withTaggedRow(side, score = 0x02000000) {
  const ram = factory();
  const spec = HISCORE_SIDES[side];
  ram.setU32(spec.total, score);
  ram.setU16(spec.ovf, 0);
  (side === 0 ? hiscoreCheck287BD2 : hiscoreCheck287C08)(ram);
  return ram;
}

// ==================== 1. THE TAGS ARE `not.b` OF THE SIDE

test('W304 `$FF` is `~0` and `$FE` is `~1`, so the tags are not magic', () => {
  // `$28F7CE not.b D0` on `($2C,A4)`. Three waves treated `$FF`/`$FE` as opaque constants;
  // they are side 0 and side 1 complemented, and this is checkable arithmetic.
  assert.equal(tagForSide(0), 0xff);
  assert.equal(tagForSide(1), 0xfe);
  assert.equal(tagForSide(0), HISCORE_SIDES[0].tag, 'and P1 stamps exactly that');
  assert.equal(tagForSide(1), HISCORE_SIDES[1].tag, 'and P2 the other');
});

test('W304 no side index can produce a value that looks like a character', { skip: SKIP }, () => {
  // W302 found the display indexes its font with the stored value UNSCALED, so a character is
  // a small multiple of four. `~0` and `~1` are the two largest bytes there are, so the tag
  // being out of band is a property of `not.b` rather than a coincidence.
  for (const side of [0, 1]) {
    const tag = tagForSide(side);
    assert.notEqual(tag % 4, 0, `$${tag.toString(16)} is not a multiple of four`);
    assert.ok(tag >= 0xfe, 'and it is above every glyph offset in a 116-byte table');
  }
});

test('W304 the writer reconstructs the tag the insert stamped', { skip: SKIP }, () => {
  // The round trip that matters: `$287C3E` stamps `not.b(side)` and `$28F7C8` recomputes it
  // from a record field. If either used a literal the two could drift.
  for (const side of [0, 1]) {
    const ram = withTaggedRow(side);
    const r = tagLookupForSide(ram, side);
    assert.ok(r.found, `side ${side}'s row is findable by its own tag`);
    assert.equal(ram.u32(r.entry), tagForSide(side));
  }
});

// ==================== 2. THE LOOKUP GATHERS EIGHT OF THE NINE ARRAYS

test('W304 the lookup returns the row\'s own address in every column', { skip: SKIP }, () => {
  // Six addresses plus two packed longs, covering everything except the 12-byte entry it just
  // matched. The word columns scale by 2 and the score by 4, which is `add.w D0,D0` run once
  // and then a second time -- the same doubling twice, easy to apply once.
  const ram = withTaggedRow(0, 0x00820000);   // lands at index 2 in the factory table
  const r = tagLookup28F6F4(ram, 0xff);
  assert.ok(r.found);
  assert.equal(r.index, 2, 'and it is the row the insert made');
  assert.equal(r.entry, BIG + 2 * 12);
  assert.equal(r.digits, 0x8038a6 + 4);
  assert.equal(r.overflow, 0x8038b0 + 4);
  assert.equal(r.ship, 0x803888 + 4);
  assert.equal(r.style, 0x803892 + 4);
  assert.equal(r.loop, 0x803874 + 4, 'A2 is REUSED for the loop after the digits');
  assert.equal(r.chain, 0x80389c + 4, 'and A3 for the chain after the overflow');
  assert.equal(r.score, HISCORE.scoresBase + 2 * 4, 'and the score scales by FOUR');
});

test('W304 `D2` is overflow over digits and `D3` is style over ship', { skip: SKIP }, () => {
  // Two `swap` pairs, each loading the HIGH half first. Getting a pair the wrong way round
  // gives two plausible-looking longs, so it is worth pinning with distinguishable values.
  const ram = withTaggedRow(0, 0x02000000);   // index 0
  ram.setU16(0x8038b0, 0x1111);               // overflow
  ram.setU16(0x8038a6, 0x2222);               // digits
  ram.setU16(0x803892, 0x3333);               // style
  ram.setU16(0x803888, 0x4444);               // ship
  const r = tagLookup28F6F4(ram, 0xff);
  assert.equal(r.d2, 0x11112222, 'overflow in the HIGH word');
  assert.equal(r.d3, 0x33334444, 'style in the HIGH word');
});

test('W304 a miss finds nothing and reports it', { skip: SKIP }, () => {
  // `moveq #$0,D0 / subq.w #1,D0` -- the ROM's miss value. The factory table has no tagged
  // row, so this is the normal state between one insert and the next.
  const ram = factory();
  assert.equal(tagLookup28F6F4(ram, 0xff).found, false);
  assert.equal(tagLookup28F6F4(ram, 0xfe).found, false);
});

test('W304 the scan is FIVE entries at stride twelve', { skip: SKIP }, () => {
  // `moveq #$4,D4` with `dbra`, and `adda.w #$C,A0` per miss -- so the walk is by ENTRY, not
  // by long. Planting the tag in the LAST row is what catches a four-iteration scan.
  const ram = factory();
  ram.setU32(BIG + 4 * 12, 0xff);
  const r = tagLookup28F6F4(ram, 0xff);
  assert.ok(r.found, 'the fifth row is reachable');
  assert.equal(r.index, 4);
  // And a value 12 bytes past the last entry must NOT be found.
  const past = factory();
  past.setU32(BIG + 5 * 12, 0xff);
  assert.equal(tagLookup28F6F4(past, 0xff).found, false, 'the scan stops at five');
});

// ==================== 3. THE WRITER IS WHAT FINALLY FILLS THE ENTRY

test('W304 the writer puts THREE longs into the tagged row', { skip: SKIP }, () => {
  // `move.w #$2,D7` with `dbra` is THREE, the n+1 this port has been bitten by twice. Two
  // characters would leave the third holding whatever the insert's shift dragged down.
  const ram = withTaggedRow(0, 0x00820000);
  ram.setU16(A4 + 0x2c, 0);
  for (let k = 0; k < 3; k++) ram.setU32(NAME + k * 4, 0x20 + k * 4);
  assert.equal(tagWrite28F7C8(ram, A4, NAME), true);
  assert.deepEqual([0, 1, 2].map((k) => ram.u32(BIG + 2 * 12 + k * 4)), [0x20, 0x24, 0x28]);
});

test('W304 the writer touches ONLY the tagged row', { skip: SKIP }, () => {
  // `adda.w #$C,A1` on a miss, so the walk cannot land mid-entry. A stride bug here overwrites
  // a neighbour's name with the new one and both rows end up wrong.
  const ram = withTaggedRow(1, 0x00820000);
  const before = [0, 1, 3, 4].map((i) => [0, 1, 2].map((k) => ram.u32(BIG + i * 12 + k * 4)));
  ram.setU16(A4 + 0x2c, 1);
  for (let k = 0; k < 3; k++) ram.setU32(NAME + k * 4, 0x4c);
  tagWrite28F7C8(ram, A4, NAME);
  const after = [0, 1, 3, 4].map((i) => [0, 1, 2].map((k) => ram.u32(BIG + i * 12 + k * 4)));
  assert.deepEqual(after, before, 'the other four rows are untouched');
  assert.deepEqual([0, 1, 2].map((k) => ram.u32(BIG + 2 * 12 + k * 4)), [0x4c, 0x4c, 0x4c]);
});

test('W304 the writer clears the tag by overwriting it', { skip: SKIP }, () => {
  // The first of the three longs IS the tag's slot, so writing the name removes the marker.
  // That is what makes the tag a one-shot key and why the display can never meet it: by the
  // time a row is drawn, either it was never tagged or the name has replaced the tag.
  const ram = withTaggedRow(0);
  assert.equal(ram.u32(BIG), 0xff, 'the row is tagged before');
  ram.setU16(A4 + 0x2c, 0);
  for (let k = 0; k < 3; k++) ram.setU32(NAME + k * 4, 0x30);
  tagWrite28F7C8(ram, A4, NAME);
  assert.equal(ram.u32(BIG), 0x30, 'and the tag is gone after');
  assert.equal(tagLookup28F6F4(ram, 0xff).found, false, 'so a second lookup misses');
});

test('W304 a write with no tagged row is a silent no-op', { skip: SKIP }, () => {
  // The ROM has no return value: it falls out of the `dbra` either way. So this is faithful
  // rather than lenient, and the whole table must be unchanged.
  const ram = factory();
  ram.setU16(A4 + 0x2c, 0);
  ram.setU32(NAME, 0x30);
  const snapshot = Uint8Array.from(ram.b);   // AFTER the setup, or the setup is the diff
  assert.equal(tagWrite28F7C8(ram, A4, NAME), false);
  assert.deepEqual(ram.b, snapshot, 'main RAM is byte-identical');
});

test('W304 a side index above 1 throws, because no row could ever match', { skip: SKIP }, () => {
  // `not.b` of 2 is `$FD`, which `$287C3E` never stamps. The board would scan five rows and
  // silently do nothing; the port says why instead.
  const ram = withTaggedRow(0);
  ram.setU16(A4 + 0x2c, 2);
  assert.throws(() => tagWrite28F7C8(ram, A4, NAME), /no row can ever match/);
});

// ==================== 4. THE PART THAT EXPLAINS FOUR WAVES OF SEARCHING

test('W304 the slot pointer really has no readers, and the tag is why', { skip: SKIP_IMG }, () => {
  // `$81B42C` and `$81B43C` are the absolute forms of `($C,A4)` for the two buffers. Scanned
  // the build: zero references. The pointer is internal to `$287C3E`, which reads it back at
  // `$287C7A` only to stamp the tag through it -- everything downstream finds the row by the
  // tag instead. W302 spent a search on the assumption that a pointer written is a pointer
  // read, so this is asserted rather than left as a claim.
  for (const addr of [0x81b42c, 0x81b43c]) {
    const pat = Buffer.alloc(4);
    pat.writeUInt32BE(addr >>> 0);
    let at = IMG.indexOf(pat);
    let refs = 0;
    while (at !== -1) {
      if (at >= 0x200000 && at < 0x2b0000) refs++;
      at = IMG.indexOf(pat, at + 1);
    }
    assert.equal(refs, 0, `$${addr.toString(16).toUpperCase()} has no absolute reference`);
  }
  // And the tag, by contrast, is compared against the table in two places.
  assert.equal(IMG.readUInt16BE(0x28f6fa), 0xb090, '$28F6FA cmp.l (A0),D0');
  assert.equal(IMG.readUInt16BE(0x28f7d8), 0xb091, '$28F7D8 cmp.l (A1),D0');
});

test('W304 the two lookup heads are the two tags, one body', { skip: SKIP_IMG }, () => {
  // The same two-head-one-body shape as `$287BD2`/`$287C08`, and the parameter is again the
  // tag. `$28F6F0 moveq #$0,D1 / moveq #$4,D4` is the shared setup both heads fall into.
  assert.equal(IMG.readUInt32BE(0x28f6e4), 0x000000ff, '$28F6E2 loads $FF');
  assert.equal(IMG.readUInt32BE(0x28f6ec), 0x000000fe, '$28F6EA loads $FE');
  assert.equal(IMG.readUInt16BE(0x28f6e8), 0x6006, 'and the first head bra\'s over the second');
  assert.equal(IMG.readUInt16BE(0x28f6f0), 0x7200, '$28F6F0 moveq #$0,D1');
  assert.equal(IMG.readUInt16BE(0x28f6f2), 0x7804, 'and moveq #$4,D4 -- FIVE entries');
});

test('W304 the insert and the writer agree on the whole round trip', { skip: SKIP }, () => {
  // End to end across four waves: search, insert, stamp, find by tag, write the name, and the
  // table comes out ordered with the new name in the right row.
  const ram = factory();
  const before = [0, 1, 2, 3, 4].map((i) => ram.u32(HISCORE.scoresBase + i * 4));
  ram.setU32(HISCORE_SIDES[1].total, 0x00900000);
  ram.setU16(HISCORE_SIDES[1].ovf, 0);
  assert.equal(hiscoreCheck287C08(ram).made, true);
  const found = tagLookupForSide(ram, 1);
  assert.equal(found.index, 1, 'the score landed at index 1');
  ram.setU16(A4 + 0x2c, 1);
  for (const [k, c] of [0x0c, 0x20, 0x38].entries()) ram.setU32(NAME + k * 4, c);
  assert.equal(tagWrite28F7C8(ram, A4, NAME), true);
  assert.deepEqual([0, 1, 2].map((k) => ram.u32(BIG + 1 * 12 + k * 4)), [0x0c, 0x20, 0x38]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => ram.u32(HISCORE.scoresBase + i * 4)),
    [before[0], 0x00900000, before[1], before[2], before[3]], 'and the order still holds');
});
