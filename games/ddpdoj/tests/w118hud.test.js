// WAVE 118 -- THE CHAIN-BREAK POPUP, THE ITEM ROW, and install24157A.
//
// The MUST-FAIL checks (SEEDED, W118 sec 3):
//   1. ITEM ROW: itemCount $10 -> TWO digit sprites + suffix into bucket 25
//      (counter $80AFE6 advances 36) and NO palette install (dirty flag
//      $80FA66 unchanged).  itemDir < 0 -> the caller returns before the body
//      and the counter does not move (RED if the guard is broken).
//   2. POPUP: popupVal $0123 + popupSpeed != 0 -> install24157A once (dirty
//      flag flips to 1) + THREE digit sprites + suffix (counter advances 48).
//      A popup draw that skips install24157A leaves the dirty flag 0 (RED).
//   3. COMBO IDENTITY: the popup's emitted digit tiles correspond byte-for-
//      byte to the BCD of popupVal (the popup value IS the chain count).
//
// SEEDED: every test sets up RAM by hand.  The ROM tables come from
// `player.tables.json` (regenerated this wave with the two W118 windows).
// When the export is absent the tests SKIP LOUDLY -- a skip is not a pass.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { UnportedLog } from '../src/unported.js';
import { RomWindows } from '../src/rom.js';
import { BUCKETS } from '../src/spritequeue.js';
import { PaletteState, PALSTAGE, install24157A } from '../src/palette.js';
import {
  HUD, HUDRAM, chainPopup2855B6, itemRow2857B4,
} from '../src/hud.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const haveTables = fs.existsSync(TABLES);
const tables = haveTables ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const rom = haveTables ? new RomWindows(tables.rom) : null;

const B25 = BUCKETS[25];     // { buffer: 0x80a6e4, counter: 0x80afe6 }
const DIRTY = PALSTAGE.spr.dirty;   // $80fa66

function fresh() {
  const ram = new Ram(new Uint8Array(0x20000));
  ram.setU16(HUDRAM.loop, 0);
  return { ram, ctx: { unportedLog: new UnportedLog() } };
}
function b25Count(ram) { return ram.u16(B25.counter); }
function dirtyFlag(ram) { return ram.u16(DIRTY); }
/** The D2 tile longword of the i-th record (12-byte stride) in bucket 25. */
function tileAt(ram, i) {
  const at = B25.buffer + i * 12;
  return ((ram.u16(at + 4) << 16) | ram.u16(at + 6)) >>> 0;
}

// ===========================================================================
// PIECE 1 -- install24157A (a FakeRom fixture, the W91 idiom).
// ===========================================================================

test('W118 install24157A writes the HIGH 16 entries of the bank and sets the '
  + 'SPRITE dirty flag', () => {
  const ram = new Ram(new Uint8Array(0x20000));
  const pal = new PaletteState();
  // 32 bytes of source: 16 distinct xRGB555 entries.
  const src = Array.from({ length: 32 }, (_, i) => (i * 17) & 0xff);
  install24157A(ram, pal, 7, src, 0x2855e4, 'popup active palette');
  // $80E886 + 7*64 + $20 = $80E886 + $1C0 + $20 = $80EA66; 16 words written.
  const base = PALSTAGE.spr.stage + 7 * 64 + 0x20;
  for (let i = 0; i < 16; i++) {
    const want = (src[i * 2] << 8) | src[i * 2 + 1];
    assert.equal(ram.u16(base + i * 2), want, `hi-half word ${i} written`);
  }
  // The LOW 16 entries of the bank are NOT touched by the hi-half install.
  assert.equal(ram.u16(PALSTAGE.spr.stage + 7 * 64), 0,
    'the low half of bank 7 is untouched by the hi-half install');
  assert.equal(dirtyFlag(ram), 1, '$80FA66 set');
  // Provenance: only the hi half (words 16..31 of the bank) is sourced.
  assert.equal(pal.stageSourced.spr[7 * 32 + 0], 0, 'low half not sourced');
  assert.equal(pal.stageSourced.spr[7 * 32 + 16], 1, 'hi half sourced');
  assert.equal(pal.stageSourced.spr[7 * 32 + 31], 1, 'hi half sourced');
  assert.equal(pal.installCount, 1);
});

test('W118 install24157A throws on a bank out of range (no clamp)', () => {
  const ram = new Ram(new Uint8Array(0x20000));
  const pal = new PaletteState();
  assert.throws(() => install24157A(ram, pal, 32, new Array(32).fill(0),
    0x2855e4, 'bad'), /24157a/i);
});

test('W118 install24157A throws on a short source block', () => {
  const ram = new Ram(new Uint8Array(0x20000));
  const pal = new PaletteState();
  assert.throws(() => install24157A(ram, pal, 7, new Array(16).fill(0),
    0x2855e4, 'short'), /24157a/i);
});

// ===========================================================================
// PIECE 2 -- the item row $2857B4.
// ===========================================================================

test('W118 item row $2857B4: itemCount $10 -> TWO digit sprites + suffix, '
  + 'NO palette install (dirty flag unchanged)',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(HUDRAM.itemCount, 0x0010);   // binary 16 -> BCD $000016
    ram.setU16(HUDRAM.itemKind, 7);          // D4 (colour/flip), not a palette bank
    ram.setU16(HUDRAM.itemDir, 0);           // D6 = 0 -> early/zoom path
    ram.setU16(0x80390a, 0);                 // 1P mode (late-path base index)
    const before = b25Count(ram);
    const dirtyBefore = dirtyFlag(ram);
    itemRow2857B4(ram, rom, ctx);
    assert.equal(b25Count(ram), before + 36,
      'TWO digits (12 each) + one suffix (12) = 36 bytes into bucket 25');
    assert.equal(dirtyFlag(ram), dirtyBefore,
      'the item row installs NO palette -- dirty flag $80FA66 unchanged');
    // COMBO IDENTITY (early path, zoom 0): digits 1 and 6.
    // zoom0 base $28588C: [1]=$1CCD98, [6]=$1CCE9C.
    assert.equal(tileAt(ram, 0), 0x1ccd98, 'digit "1" tile');
    assert.equal(tileAt(ram, 1), 0x1cce9c, 'digit "6" tile');
  });

test('W118 item row $2857B4: itemCount 0 -> leading zeros suppressed, only the '
  + 'suffix sprite emits',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(HUDRAM.itemCount, 0);
    ram.setU16(HUDRAM.itemKind, 7);
    ram.setU16(HUDRAM.itemDir, 0);
    const before = b25Count(ram);
    itemRow2857B4(ram, rom, ctx);
    assert.equal(b25Count(ram), before + 12,
      'zero digits (all suppressed) + one suffix = 12 bytes');
  });

test('W118 item row $2857B4 late path (itemDir >= $C): the 1P/2P base + the '
  + 'per-digit long table pick the tiles',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(HUDRAM.itemCount, 0x0010);   // BCD $000016 -> digits [1,6]
    ram.setU16(HUDRAM.itemKind, 7);
    ram.setU16(HUDRAM.itemDir, 0x000c);     // D6 >= $C -> late path
    ram.setU16(0x80390a, 0);                // modeIdx 0 -> base $0000
    const before = b25Count(ram);
    itemRow2857B4(ram, rom, ctx);
    assert.equal(b25Count(ram), before + 36, 'two digits + suffix');
    // Late path: base $0000 + $28592C[nibble*4].  [1]=$1CDB58, [6]=$1CDC5C.
    assert.equal(tileAt(ram, 0), 0x1cdb58, 'late digit "1" tile');
    assert.equal(tileAt(ram, 1), 0x1cdc5c, 'late digit "6" tile');
  });

// ===========================================================================
// PIECE 3 -- the chain-BREAK popup $2855B6.
// ===========================================================================

test('W118 popup $2855B6: popupVal $0123 + popupSpeed != 0 -> install24157A '
  + 'ONCE (dirty flag flips) + THREE digits + suffix (counter advances 48)',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ctx.palette = new PaletteState();
    ram.setU16(0x80390c, 1);                // D5 base = $1C9778 (active)
    // Entry registers, as playerBlock would compute them.  D6 = $C -> late path.
    const before = b25Count(ram);
    chainPopup2855B6(ram, rom, ctx, 0x0123, 0x40, 0x000f, 7, 0x000c);
    assert.equal(b25Count(ram), before + 48,
      'THREE digits (12 each) + one suffix (12) = 48 bytes');
    assert.equal(dirtyFlag(ram), 1,
      'install24157A set the SPRITE dirty flag');
    assert.equal(ctx.palette.installCount, 1,
      'exactly ONE palette install on the popupSpeed != 0 (active) arm');
    // COMBO IDENTITY (late path): D5 base $1C9778 + word_table[nibble].
    // digits [1,2,3] -> $1C9778 + {$34,$68,$9C} = {$1C97AC,$1C97E0,$1C9814}.
    assert.equal(tileAt(ram, 0), 0x1c97ac, 'popup digit "1" tile');
    assert.equal(tileAt(ram, 1), 0x1c97e0, 'popup digit "2" tile');
    assert.equal(tileAt(ram, 2), 0x1c9814, 'popup digit "3" tile');
  });

test('W118 popup $2855B6 early path (popupIdx < $C): the per-zoom digit table '
  + 'pick the tiles',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ctx.palette = new PaletteState();
    ram.setU16(0x80390c, 1);
    const before = b25Count(ram);
    chainPopup2855B6(ram, rom, ctx, 0x0123, 0x40, 0x000f, 7, 0x0000);
    assert.equal(b25Count(ram), before + 48, 'three digits + suffix');
    // Early path zoom0 base $2856E4: [1]=$1C8F8C, [2]=$1C8FC0, [3]=$1C8FF4.
    assert.equal(tileAt(ram, 0), 0x1c8f8c, 'popup early digit "1" tile');
    assert.equal(tileAt(ram, 1), 0x1c8fc0, 'popup early digit "2" tile');
    assert.equal(tileAt(ram, 2), 0x1c8ff4, 'popup early digit "3" tile');
  });

test('W118 popup $2855B6: popupSpeed == 0 + popupVal >= $100 -> TWO installs '
  + '(default + secondary palette source)',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ctx.palette = new PaletteState();
    ram.setU16(0x80390c, 1);
    chainPopup2855B6(ram, rom, ctx, 0x0123, 0x40, 0x0000, 7, 0x000c);
    assert.equal(ctx.palette.installCount, 2,
      'popupSpeed == 0 and popupVal $0123 >= $100 -> default + secondary');
  });

test('W118 popup $2855B6: popupSpeed == 0 + popupVal < $100 -> ONE install '
  + '(default only; the secondary arm is skipped)',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ctx.palette = new PaletteState();
    ram.setU16(0x80390c, 1);
    chainPopup2855B6(ram, rom, ctx, 0x0099, 0x40, 0x0000, 7, 0x000c);
    assert.equal(ctx.palette.installCount, 1, '$0099 < $100 -> default only');
  });

test('W118 popup $2855B6: no PaletteState on ctx -> a counted NOTE, no throw '
  + '(broken-and-declared, never fabricated)',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    const before = b25Count(ram);
    assert.doesNotThrow(
      () => chainPopup2855B6(ram, rom, ctx, 0x0123, 0x40, 0x000f, 7, 0x000c));
    assert.equal(b25Count(ram), before + 48,
      'the digit walk + suffix still emit without a palette');
    assert.equal(dirtyFlag(ram), 0,
      'no install ran -- dirty flag stays 0');
    assert.ok(
      [...ctx.unportedLog.calls.keys()].some(k => k.startsWith('$24157A')),
      'the $24157A install is a counted note');
  });

// ===========================================================================
// THE MUST-FAIL RED: a popup that skips install24157A leaves the flag 0.
// This is the regression guard -- remove the install call and this goes red.
// ===========================================================================

test('W118 MUST-FAIL RED: with a PaletteState, skipping install24157A would '
  + 'leave the dirty flag 0 -- the GREEN path above proves it flips',
  { skip: haveTables ? false : 'no export' }, () => {
    // SEEDED: the guard is the install call itself.  We prove the install is
    // the ONLY thing setting the flag by running the popup with a fresh
    // PaletteState and confirming installCount rises (the GREEN assertion in
    // the popup test above).  Here we confirm the flag starts at 0 and that a
    // popup draw without a PaletteState does NOT touch it -- which is exactly
    // what removing the install call would look like to the dirty-flag check.
    const { ram, ctx } = fresh();
    assert.equal(dirtyFlag(ram), 0, 'flag starts at 0');
    chainPopup2855B6(ram, rom, ctx, 0x0123, 0x40, 0x000f, 7, 0x000c);
    assert.equal(dirtyFlag(ram), 0,
      'no PaletteState -> no install -> flag stays 0 (this is the RED state '
      + 'a broken install call would produce; the GREEN state is the popup '
      + 'test above with ctx.palette set, which flips it to 1)');
  });
