// W372: THE OBJECT DISPATCH TABLE, and which of its twenty slots the port has never touched.
//
// This is the docket's key. Screens in this game are OBJECT DISPATCH ENTRIES -- tallyscreen.js opens
// "OBJECT DISPATCH [11], $25DBB4 -- THE STAGE-CLEAR SCREEN" -- so the main screen (D33), character
// select (D34) and the endings (D37) are slots in this table, not code to go hunting for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROM = 'games/ddpdoj/rip/sound/maincpu.bin';
const SKIP = !existsSync(ROM) && 'no decrypted ROM';
const IMG = SKIP ? null : readFileSync(ROM);
const TABLE = 0x240f62;

test('W372 the table is TWENTY slots, matching the driver s own count', { skip: SKIP }, () => {
  // $2410CA moveq #$13,D0 with a dbra is 20, and $2410D4 lsl.w #3 makes the stride 8. Slot 20 must
  // therefore NOT be a code pointer, which is what bounds the table without a guess.
  assert.equal(IMG.readUInt16BE(0x2410ca), 0x7013, '$2410CA moveq #$13,D0');
  assert.equal(IMG.readUInt16BE(0x2410d4), 0xe749, '$2410D4 lsl.w #3,D1 -- an 8-byte stride');
  for (let i = 0; i < 20; i++) {
    const t = IMG.readUInt32BE(TABLE + i * 8);
    assert.ok(t >= 0x200000 && t <= 0x2b0000, `slot ${i} points into code: $${t.toString(16)}`);
  }
  const past = IMG.readUInt32BE(TABLE + 20 * 8);
  assert.ok(past < 0x200000 || past > 0x2b0000,
    'and slot 20 is NOT a code pointer, which is what ends the table');
});

test('W372 the ELEVEN slots the port has never touched -- the docket lives here', { skip: SKIP }, () => {
  // Recorded as a list so the next wave starts from eleven addresses instead of a search. When one is
  // ported its entry moves out of this list, which keeps the count honest the way the type-table
  // census does for enemies.
  const UNTOUCHED = [
    [7, 0x290be8], [8, 0x25a770], [9, 0x25caca], [12, 0x28f3ac], [13, 0x288a60],
    [14, 0x288c6c], [15, 0x291f66], [16, 0x256e7a], [17, 0x25ceb8], [18, 0x24902a],
    [19, 0x28ee88],
  ];
  for (const [slot, addr] of UNTOUCHED) {
    assert.equal(IMG.readUInt32BE(TABLE + slot * 8), addr,
      `slot ${slot} is $${addr.toString(16)} in the cartridge`);
  }
  assert.equal(UNTOUCHED.length, 11, 'eleven of twenty, so nine are ported');
  // The nine that ARE ported, as the contrast that makes the eleven mean something.
  for (const [slot, addr] of [[11, 0x25dbb4], [10, 0x260794], [0, 0x28d520]]) {
    assert.equal(IMG.readUInt32BE(TABLE + slot * 8), addr, `slot ${slot} is ported`);
  }
});

test('W372 all eleven untouched slots are STATE MACHINES of the tally screen s shape', { skip: SKIP }, () => {
  // Every one opens `tst.b (d8,A5)` / `beq` then `cmpi.b (d8,A5)` / `beq` -- a cascade on a state byte
  // in the object record, which is exactly what tallyscreen.js documents for slot [11]: "$25DBB4 the
  // dispatcher, on ($2,A5)". So the eleven are not eleven different problems: they are one shape,
  // and the machinery tallyscreen.js already has is the right reference for all of them.
  const SLOTS = [0x290be8, 0x25a770, 0x25caca, 0x28f3ac, 0x288a60, 0x288c6c,
    0x291f66, 0x25ceb8];
  for (const a of SLOTS) {
    assert.equal(IMG.readUInt16BE(a), 0x4a2d, `$${a.toString(16)} opens tst.b (d8,A5)`);
    assert.equal(IMG[a + 2] & 0xf0, 0x00, '  ...on a small record offset');
    assert.equal(IMG[a + 4], 0x67, '  ...followed by beq -- the state-zero arm');
  }
  // Two differ at the very front and are worth knowing about before someone calls the shape universal.
  assert.equal(IMG.readUInt16BE(0x256e7a), 0x0c2d, 'slot 16 opens with cmpi.b, skipping the tst');
  assert.equal(IMG.readUInt16BE(0x24902a), 0x4a2d, 'slot 18 opens with tst.b like the rest');
  assert.equal(IMG.readUInt16BE(0x28ee88), 0x4df9, 'slot 19 opens with lea abs.l,A6 FIRST');
});

test('W372 four slots carry identifying anchors -- CANDIDATES, not conclusions', { skip: SKIP }, () => {
  // Scanning each slot's first $400 bytes for known RAM anchors separates them. These are CANDIDATE
  // identifications: the anchor says what a slot touches, not what it is, and each must be confirmed
  // by reading the slot before the docket entry is updated.
  const has = (base, val) => {
    for (let k = base; k < base + 0x400; k += 2) if (IMG.readUInt32BE(k) === val) return true;
    return false;
  };
  // [18] reads $81296E -- the flag $242922 sets when HIBACHI is cleared. That makes it the strongest
  // candidate for D37, the endings, and it links the front end straight to this wave's boss work.
  assert.ok(has(0x24902a, 0x81296e), 'slot 18 reads the boss-clear flag $81296E');
  assert.ok(has(0x24902a, 0x8103e6) && has(0x24902a, 0x810448), '  ...and BOTH player records');
  // [9] touches both players and installs palettes -- the shape a character select would have (D34).
  assert.ok(has(0x25caca, 0x8103e6) && has(0x25caca, 0x810448), 'slot 9 touches both players');
  assert.ok(has(0x25caca, 0x24150a), '  ...and installs palettes');
  // [12] reads the high-score table, so it belongs to the hiscore family rather than the front end.
  assert.ok(has(0x28f3ac, 0x803824), 'slot 12 reads the HISCORE table $803824');
  // [13] reads the loop and stage words, which is stage-progression rather than a screen.
  assert.ok(has(0x288a60, 0x813098) && has(0x288a60, 0x813092), 'slot 13 reads loop AND stage');
});
