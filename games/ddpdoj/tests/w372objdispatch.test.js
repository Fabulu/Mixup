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
