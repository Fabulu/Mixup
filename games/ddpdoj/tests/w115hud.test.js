// WAVE 115 -- THE SCORE-DIGIT FLUSH `$185DC4`, and the SEEDED must-fail check.
//
// The score digits have their OWN deferred-write flush `$185DC4` (build A, the
// 4th IRQ6-gated routine), discovered by W114 (MAME write-tap).  It drains the
// dirty records at `$81B4C8` (populated by `digits2843A8`, already ported)
// straight into the TX tilemap `$904000`, INDEPENDENTLY of the `$240DC2` /
// `$141258` text path the rest of the HUD still uses.  These tests port the
// flush, the `TxVram` model, and the fixed-dest init, and hold down the
// red/green of the must-fail check.
//
// Every assertion is on a value the CARTRIDGE decides -- the char base
// `$C030+digit` out of `$284438`, the dest layout out of W114's recdump, the
// 18+2 record walk out of the listing.  Nothing writes a constant and reads
// it back through the same constant (`docs/knowledge/03`).

import test from 'node:test';
import assert from 'node:assert/strict';

import { Ram } from '../src/ram.js';
import { TxVram } from '../src/background.js';
import {
  HUD, HUDRAM,
  digits2843A8, flushScoreDigits185DC4, initScoreDigitDests,
} from '../src/hud.js';

function fresh() {
  const ram = new Ram(new Uint8Array(0x20000));
  ram.setU16(HUDRAM.objFlag, 1);   // the HUD object is alive (the flush gate)
  return { ram, tx: new TxVram() };
}

// ===========================================================================
// 1. THE TxVram MODEL -- stores a longword at (dest-$904000)/4, big-endian
// ===========================================================================

test('W115 TxVram stores a tile longword at the right index, big-endian', () => {
  const tx = new TxVram();
  // $9047D8 -> longword index ($7D8)/4 = 502 = row 7 col 54.
  tx.setLong(0x9047d8, 0xC0380000);
  assert.equal(tx.long(0x9047d8), 0xC0380000);
  // The two u16s the renderer reads (buildTxMap): tileno high, attr low.
  const idx = ((0x9047d8 - 0x904000) >>> 2) * 2;
  assert.equal(tx.w[idx], 0xC038, 'high word = tile number');
  assert.equal(tx.w[idx + 1], 0x0000, 'low word = attribute');
  // Default is zero (transparent -- a blank cell).
  assert.equal(tx.long(0x9040d8), 0);
});

test('W115 TxVram rejects an undersized seed', () => {
  assert.throws(() => new TxVram(new Uint16Array(10)), /expected/);
});

// ===========================================================================
// 2. THE FIXED-DEST INIT -- W114's measured table
// ===========================================================================

test('W115 initScoreDigitDests seeds the 20 +$2 dest addrs from the table', () => {
  const { ram } = fresh();
  initScoreDigitDests(ram);
  // P1 col 54 rows 0..8: $9040D8 + i*$100.
  for (let i = 0; i < 9; i++) {
    assert.equal(ram.u32(HUDRAM.digitsP1 + i * 0x0a + 2), 0x9040d8 + i * 0x100,
      `P1 digit ${i} dest`);
  }
  // P2 col 54 rows 17..25: $9051D8 + i*$100.
  for (let i = 0; i < 9; i++) {
    assert.equal(ram.u32(HUDRAM.digitsP2 + i * 0x0a + 2), 0x9051d8 + i * 0x100,
      `P2 digit ${i} dest`);
  }
  // The two standalone records.
  assert.equal(ram.u32(HUDRAM.extraRecA + 2), 0x9049d8);  // row 9 col 54
  assert.equal(ram.u32(HUDRAM.extraRecB + 2), 0x905ad8);  // row 26 col 54
});

// ===========================================================================
// 3. THE SEEDED MUST-FAIL CHECK -- red -> green
//
// SEEDED: P1 total BCD = $00000086.  digits2843A8 marks records 7/8 dirty with
// tiles $C0380000/$C0360000 (digits "8"/"6").  The flush writes those tiles
// into TxVram at $9047D8/$9048D8.  Before the flush, TxVram is unchanged (red);
// break the flush (skip the dirty write), still red; restore, green.
// ===========================================================================

test('W115 SEEDED -- before the flush, TxVram is unchanged (RED)', () => {
  const { ram, tx } = fresh();
  initScoreDigitDests(ram);
  ram.setU32(HUDRAM.totalP1, 0x00000086);                 // P1 score = 86
  digits2843A8(ram, 0);                                   // marks records 7/8 dirty
  // Records 7 and 8 ARE dirty and carry the right tiles...
  const rec7 = HUDRAM.digitsP1 + 7 * 0x0a;
  const rec8 = HUDRAM.digitsP1 + 8 * 0x0a;
  assert.equal(ram.u16(rec7), 1, 'record 7 dirty');
  assert.equal(ram.u16(rec8), 1, 'record 8 dirty');
  assert.equal(ram.u32(rec7 + 6), 0xC0380000, 'record 7 tile = "8"');
  assert.equal(ram.u32(rec8 + 6), 0xC0360000, 'record 8 tile = "6"');
  // ...but the flush has NOT run, so TxVram is still blank.  RED.
  assert.equal(tx.long(0x9047d8), 0, 'no flush -> cell 7 blank (RED)');
  assert.equal(tx.long(0x9048d8), 0, 'no flush -> cell 8 blank (RED)');
});

test('W115 SEEDED -- the flush writes the score tiles (GREEN)', () => {
  const { ram, tx } = fresh();
  initScoreDigitDests(ram);
  ram.setU32(HUDRAM.totalP1, 0x00000086);
  digits2843A8(ram, 0);
  flushScoreDigits185DC4(ram, tx);                        // the flush
  // GREEN: the "8" and "6" land at the measured cells.
  assert.equal(tx.long(0x9047d8), 0xC0380000,
    'flush -> cell 7 = $C0380000 (digit "8") at $9047D8');
  assert.equal(tx.long(0x9048d8), 0xC0360000,
    'flush -> cell 8 = $C0360000 (digit "6") at $9048D8');
  // And the dirty flags are CLEARED by the flush.
  assert.equal(ram.u16(HUDRAM.digitsP1 + 7 * 0x0a), 0, 'record 7 dirty cleared');
  assert.equal(ram.u16(HUDRAM.digitsP1 + 8 * 0x0a), 0, 'record 8 dirty cleared');
  // No other P1 cell was written (leading-zero-suppressed digits stay blank).
  assert.equal(tx.long(0x9040d8), 0, 'P1 digit 0 (MSB) still blank');
  assert.equal(tx.long(0x9046d8), 0, 'P1 digit 6 still blank');
});

test('W115 SEEDED -- break the flush (no txvram write), watch RED', () => {
  // The flush with its `txvram.setLong` call removed is the RED twin: the
  // dirty flags clear but no tile lands, so the picture cannot change.  This
  // is the switch the owner's live verification relies on.
  const { ram, tx } = fresh();
  initScoreDigitDests(ram);
  ram.setU32(HUDRAM.totalP1, 0x00000086);
  digits2843A8(ram, 0);
  // Hand-roll a BROKEN flush: clear dirty flags but SKIP the tile write.
  for (let i = 0; i < 9; i++) {
    const rec = HUDRAM.digitsP1 + i * 0x0a;
    if (ram.u16(rec) === 0) continue;
    ram.setU16(rec, 0);                  // clear dirty ONLY (no tx.setLong)
  }
  assert.equal(tx.long(0x9047d8), 0, 'broken flush -> cell 7 still blank (RED)');
  assert.equal(tx.long(0x9048d8), 0, 'broken flush -> cell 8 still blank (RED)');
  // Restore: the real flush on a fresh seed turns it GREEN.
  const { ram: r2, tx: tx2 } = fresh();
  initScoreDigitDests(r2);
  r2.setU32(HUDRAM.totalP1, 0x00000086);
  digits2843A8(r2, 0);
  flushScoreDigits185DC4(r2, tx2);
  assert.equal(tx2.long(0x9047d8), 0xC0380000, 'restored -> GREEN');
});

// ===========================================================================
// 4. THE GATE -- flush is a no-op when the HUD object is not alive
// ===========================================================================

test('W115 flush gates on $81B6F0 (HUDRAM.objFlag) -- no flush when HUD dead', () => {
  const { ram, tx } = fresh();
  initScoreDigitDests(ram);
  ram.setU32(HUDRAM.totalP1, 0x00000086);
  digits2843A8(ram, 0);
  ram.setU16(HUDRAM.objFlag, 0);                          // HUD object NOT alive
  flushScoreDigits185DC4(ram, tx);
  assert.equal(tx.long(0x9047d8), 0, 'HUD dead -> no flush, cell blank');
  // Dirty records UNTOUCHED (the gate returns before the walk).
  assert.equal(ram.u16(HUDRAM.digitsP1 + 7 * 0x0a), 1, 'dirty flag survives');
});

// ===========================================================================
// 5. P2 + EXTRAS -- the full 20-record walk
// ===========================================================================

test('W115 flush walks P2 and the two standalone records too', () => {
  const { ram, tx } = fresh();
  initScoreDigitDests(ram);
  // Seed a P2 score and mark an extra dirty by hand (its producer is the
  // hi-score plumbing, not driven here).
  ram.setU32(HUDRAM.totalP2, 0x00000042);
  digits2843A8(ram, 1);                                   // P2 records 7/8 dirty
  // Hand-mark extra A ($81B57C) dirty with a "9".
  ram.setU16(HUDRAM.extraRecA, 1);
  ram.setU16(HUDRAM.extraRecA + 6, 0xC039);
  flushScoreDigits185DC4(ram, tx);
  // P2 digit 7 ("4") and 8 ("2") at $9058D8 / $9059D8.
  assert.equal(tx.long(0x9058d8), 0xC0340000, 'P2 digit 7 = "4" at $9058D8');
  assert.equal(tx.long(0x9059d8), 0xC0320000, 'P2 digit 8 = "2" at $9059D8');
  // Extra A ("9") at $9049D8.
  assert.equal(tx.long(0x9049d8), 0xC0390000, 'extra A = "9" at $9049D8');
  assert.equal(ram.u16(HUDRAM.extraRecA), 0, 'extra A dirty cleared');
});

test('W115 the ROM address constant is the measured $185DC4', () => {
  assert.equal(HUD.scoreFlush, 0x185dc4);
  assert.equal(HUDRAM.extraRecA, 0x81b57c);
  assert.equal(HUDRAM.extraRecB, 0x81b586);
});
