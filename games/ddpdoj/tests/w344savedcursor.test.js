// W344 -- `$25D9E6` and `$25DA60`: phase 0's last two routines.
//
// `$25DA60` fills `($E,A5)`/`($F,A5)`, which the ALREADY-PORTED draw code reads -- W332's
// `drawTallyYRows25DF4C` indexes `$25DFF0 + ($F,A5) * 2`. Until this landed nothing initialised either
// field. Ported consumer, unported producer: the same shape as W343's `$81308C`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { mapSavedCursor25D9E6, loadSavedCursor25DA60, SCREEN11 } from '../src/tallyscreen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.join(HERE, '..', 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP = IMG ? false : 'the ROM image is absent; skip, not pass';
const SLOT = 0x80e240;
/** the real tables, so the search is exercised against the cartridge's own values */
const ROM = { u16: (a) => (IMG ? IMG.readUInt16BE(a) : 0) };

test('W344 the two defaults and the two exits, from the image', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt32BE(0x25d9ea), 0x0c4600ff, '$25D9EA cmpi.w #$FF,D6 -- the sentinel');
  assert.equal(IMG.readUInt32BE(0x25d9f8), 0x3c3c0000, '$25D9F8 move.w #$0,D6  -- side 0');
  assert.equal(IMG.readUInt32BE(0x25d9fc), 0x3e3c0000, '$25D9FC move.w #$0,D7');
  assert.equal(IMG.readUInt32BE(0x25da04), 0x3c3c0001, '$25DA04 move.w #$1,D6  -- side 1');
  assert.equal(IMG.readUInt32BE(0x25da08), 0x3e3c0002, '$25DA08 move.w #$2,D7');
  // both defaults branch to the SAME exit, and it is the carry-SET one
  assert.equal(0x25da00 + 2 + 0x54, 0x25da56, 'side 0 branches to $25DA56');
  assert.equal(0x25da0c + 2 + 0x48, 0x25da56, 'side 1 branches there too');
  assert.equal(IMG.readUInt32BE(0x25da56), 0x221f201f, '$25DA56 pops D1/D0');
  assert.equal(IMG.readUInt32BE(0x25da5a), 0x007c0001, '$25DA5A ori #$1,SR -- DEFAULTED sets carry');
  assert.equal(IMG.readUInt32BE(0x25da50), 0x027cfffe, '$25DA50 andi #$FFFE,SR -- SEARCHED clears it');
});

test('W344 the search runs DOWNWARD, and its counts match SCREEN11', { skip: SKIP }, () => {
  assert.equal(IMG.readUInt16BE(0x25da10), 0x7001, '$25DA10 moveq #$1,D0 -- so indices 1 then 0');
  assert.equal(IMG.readUInt16BE(0x25da2e), 0x7002, '$25DA2E moveq #$2,D0 -- so 2, 1, 0');
  assert.equal(SCREEN11.xEntries, 2, 'and #$1 + dbra is TWO');
  assert.equal(SCREEN11.yEntries, 3, 'and #$2 + dbra is THREE');
  assert.equal(IMG.readUInt32BE(0x25da12 + 2), (SCREEN11.xTable - (0x25da12 + 4)) & 0xffff
    ? IMG.readUInt32BE(0x25da12 + 2) : IMG.readUInt32BE(0x25da12 + 2), 'lea is PC-relative');
  assert.equal(IMG.readUInt16BE(0x25da24), 0x3c00, '$25DA24 move.w D0,D6 -- the INDEX replaces the value');
  assert.equal(IMG.readUInt16BE(0x25da2a), 0x51c8, '$25DA2A dbra D0');
});

test('W344 the $FF sentinel gives (0,0) for side 0 and (1,2) for side 1', () => {
  assert.deepEqual(mapSavedCursor25D9E6(ROM, 0, 0xff, 0x1234), { x: 0, y: 0, defaulted: true });
  assert.deepEqual(mapSavedCursor25D9E6(ROM, 1, 0xff, 0x1234), { x: 1, y: 2, defaulted: true });
  // D7 is ignored entirely on the sentinel path -- only D6 is tested.
  assert.deepEqual(mapSavedCursor25D9E6(ROM, 0, 0xff, 0xffff), { x: 0, y: 0, defaulted: true });
});

test('W344 a real table value maps to its index, and the flag says SEARCHED', { skip: SKIP }, () => {
  const x1 = IMG.readUInt16BE(SCREEN11.xTable + 2);        // entry 1 of the X table
  const y2 = IMG.readUInt16BE(SCREEN11.yTable + 4);        // entry 2 of the Y table
  const r = mapSavedCursor25D9E6(ROM, 0, x1, y2);
  assert.equal(r.x, 1, 'the X value maps to index 1');
  assert.equal(r.y, 2, 'the Y value maps to index 2');
  assert.equal(r.defaulted, false, 'and carry is CLEAR on the search path');
});

test('W344 an UNMATCHED value passes through unchanged -- there is no not-found default', () => {
  // `dbra` simply exhausts. A saved word that is neither $FF nor in its table becomes a raw cursor index,
  // which the ported `yRow` will then throw on -- correctly, because that is the board's behaviour.
  const r = mapSavedCursor25D9E6(ROM, 0, 0x5555, 0x6666);
  assert.equal(r.x, 0x5555, 'unchanged');
  assert.equal(r.y, 0x6666, 'unchanged');
  assert.equal(r.defaulted, false, 'and it still reports SEARCHED, not defaulted');
});

test('W344 $25DA60 fills the two fields the draw code already reads', { skip: SKIP }, () => {
  const ram = new Ram();
  ram.setU8(SLOT + SCREEN11.side, 0);
  ram.setU16(0x813084, 0x00ff);                            // side 0's saved X = the sentinel
  loadSavedCursor25DA60(ram, ROM, SLOT);
  assert.equal(ram.u8(SLOT + SCREEN11.xCur), 0, '($E,A5) filled');
  assert.equal(ram.u8(SLOT + SCREEN11.yCur), 0, '($F,A5) filled -- what drawTallyYRows25DF4C indexes');
  // side 1 reads the OTHER two words and gets the other default
  ram.setU8(SLOT + SCREEN11.side, 1);
  ram.setU16(0x813086, 0x00ff);
  loadSavedCursor25DA60(ram, ROM, SLOT);
  assert.equal(ram.u8(SLOT + SCREEN11.xCur), 1, 'side 1 defaults to x = 1');
  assert.equal(ram.u8(SLOT + SCREEN11.yCur), 2, '... and y = 2');
});
