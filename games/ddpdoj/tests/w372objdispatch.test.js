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

test('W372 slot [18] waits for INPUT through the tally screen s own descriptor read', { skip: SKIP }, () => {
  // $249052 jsr $23D186 -- which tallyscreen.js line 199 names "THE DESCRIPTOR'S INPUT READ" for side
  // 0 -- then `andi.w #$80F0,D0 / tst.w D0`, a button mask. So slot [18] is a screen that WAITS FOR A
  // PRESS, built from the same machinery the stage-clear screen uses.
  //
  // With the boss-clear flag $81296E and both player records, that is three independent signals
  // pointing the same way: [18] is the post-clear sequence, which is D37.
  assert.equal(IMG.readUInt32BE(0x249054), 0x0023d186, '$249052 jsr $23D186 -- the descriptor input read');
  assert.equal(IMG.readUInt16BE(0x249058), 0x0240, '$249058 andi.w #imm,D0');
  assert.equal(IMG.readUInt16BE(0x24905a), 0x80f0, '  ...#$80F0, a BUTTON mask');
  assert.equal(IMG.readUInt16BE(0x24905c), 0x4a40, '$24905C tst.w D0 -- and it branches on the press');
  // The setup before it is a descriptor call in the tally screen's shape: D0/D1/D2 then a PC-relative
  // lea, which is how that family passes a descriptor.
  assert.equal(IMG.readUInt16BE(0x24903e), 0x323c, '$24903E move.w #imm,D1');
  assert.equal(IMG.readUInt16BE(0x249040), 0x001e, '  ...#$1E');
  assert.equal(IMG.readUInt16BE(0x249046), 0x41fa, '$249046 lea (d16,PC),A0 -- the descriptor');
});

test('W372 D37 s call chain bottoms out in a TILEMAP writer, and it is short', { skip: SKIP }, () => {
  // slot [18] -> $25A14C -> $240CF0, and that is the whole depth.
  //
  // $25A14C (42 bytes) is a NUL-TERMINATED STRING DRAW: save D0-D5/A0, then read bytes from (A0)+
  // until zero, packing each into D4's high word via `swap` and calling $240CF0 per glyph with the
  // column in D0. The `swap D4 / move.w D5,D4` pair is the trap -- the glyph goes in the HIGH word and
  // a caller-supplied attribute in the LOW, so a port passing a bare byte draws nothing.
  assert.equal(IMG.readUInt16BE(0x25a14c), 0x48e7, '$25A14C movem.l <list>,-(A7)');
  assert.equal(IMG.readUInt16BE(0x25a14e), 0xfc80, '  ...D0-D5/A0 saved');
  assert.equal(IMG.readUInt16BE(0x25a158), 0x1818, '$25A158 move.b (A0)+,D4 -- the string walk');
  assert.equal(IMG.readUInt16BE(0x25a15a), 0x4a04, '$25A15A tst.b D4');
  assert.equal(IMG[0x25a15c], 0x67, '  ...beq -- NUL ends it');
  assert.equal(IMG.readUInt16BE(0x25a162), 0x4844, '$25A162 swap D4 -- glyph to the HIGH word');
  assert.equal(IMG.readUInt16BE(0x25a164), 0x3805, '$25A164 move.w D5,D4 -- attribute in the LOW');
  assert.equal(IMG.readUInt32BE(0x25a168), 0x00240cf0, '$25A166 jsr $240CF0 -- per glyph');
  // $240CF0 (60 bytes) writes LONGS into a table indexed by D5 and steps the tile index by $10000,
  // which is a tilemap blit rather than a sprite emit -- so the ending screen is TEXT, not sprites.
  assert.equal(IMG.readUInt16BE(0x240d10), 0x2184, '$240D10 move.l D4,(A0,D5.w)');
  assert.equal(IMG.readUInt16BE(0x240d14), 0x0684, '$240D14 addi.l #imm,D4');
  assert.equal(IMG.readUInt32BE(0x240d16), 0x00010000, '  ...#$10000 -- the tile index steps by ONE');
  assert.equal(IMG.readUInt16BE(0x240d1c), 0x51cf, '$240D1C dbra D7 -- a fixed row count');
});

test('W372 the TX blit and string draw RUN, and the string trap is real', { skip: SKIP }, async () => {
  // Driving them, because a text routine that draws tile 0 everywhere looks like a missing font rather
  // than a bug, and no static check would tell them apart.
  const { TxVram, txBlock240CF0, txString25A14C } = await import('../src/background.js');
  const tx = new TxVram();
  // One cell, tile $41, attribute $0007. The high word must be the TILE and the low the ATTRIBUTE.
  txBlock240CF0(tx, 2, 3, 0, 0, (0x41 << 16) | 0x0007);
  const idx = (((2 << 6) + 3) << 2);
  assert.equal(tx.w[((idx) >>> 2) * 2], 0xc041, 'the tile number, with $C000 s attribute bits ORed in');
  assert.equal(tx.w[((idx) >>> 2) * 2 + 1], 0x0007, 'and the attribute in the LOW word');

  // The string draw must step CONSECUTIVE tile numbers across consecutive cells.
  const tx2 = new TxVram();
  const rom = { u8: (a) => [0x41, 0x42, 0x43, 0x00][a] ?? 0 };
  txString25A14C(tx2, rom, 5, 6, 0x0002, 0);
  for (let i = 0; i < 3; i++) {
    const k = ((((5 + i) << 6) + 6) << 2) >>> 2;
    assert.equal(tx2.w[k * 2], 0xc041 + i, `cell ${i} takes glyph $${(0x41 + i).toString(16)}`);
    assert.equal(tx2.w[k * 2 + 1], 0x0002, '  ...and the caller s attribute');
  }
  // And the NUL really terminates: the fourth cell is untouched.
  const k4 = (((8 << 6) + 6) << 2) >>> 2;
  assert.equal(tx2.w[k4 * 2], 0, 'the NUL stopped it -- no fourth glyph');
});

test('W372 the front-end screens are COMPILED C, the gameplay code is not', { skip: SKIP }, () => {
  // The most consequential thing found about the docket. Slot [18]'s state routines use `link` stack
  // frames, `pea` to push arguments, and `lea d(A7),A7` for CALLER cleanup -- the C calling convention.
  // Type $4C's 666-byte enemy body has ZERO of all three.
  //
  // So the front end and the gameplay are different KINDS of code. Every technique this project has
  // built -- register-by-register transcription, "read the callee's signature", the aligned sweep --
  // was developed against hand-written assembly. Screens will need arguments read off the STACK, and a
  // port that assumes registers will find them empty.
  const count = (base, len, pred) => {
    let n = 0;
    for (let a = base; a < base + len; a += 2) if (pred(IMG.readUInt16BE(a))) n++;
    return n;
  };
  const isLink = (w) => (w & 0xfff8) === 0x4e50;
  const isPea = (w) => (w & 0xffc0) === 0x4840 && (w & 0x3f) >= 0x38;
  const isPop = (w) => w === 0x4fef;                       // lea d(A7),A7 -- caller cleanup
  // The screens.
  assert.ok(count(0x248492, 0x400, isLink) >= 1, '$248492 builds a link frame');
  assert.ok(count(0x248492, 0x400, isPea) >= 10, '  ...and pushes many stack arguments');
  assert.ok(count(0x248492, 0x400, isPop) >= 3, '  ...with caller cleanup');
  assert.ok(count(0x2475ca, 0x400, isLink) >= 1, '$2475CA builds one too');
  // The gameplay, for contrast: none of it.
  assert.equal(count(0x26f5f2, 0x400, isLink), 0, 'type $4C has NO link frames');
  assert.equal(count(0x26f5f2, 0x400, isPea), 0, '  ...no stack arguments');
  assert.equal(count(0x26f5f2, 0x400, isPop), 0, '  ...and no caller cleanup');
});
