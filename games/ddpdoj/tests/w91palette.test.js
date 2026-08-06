// WAVE 91 -- THE SPRITE PALETTE: `$24150A`, `$24133C`, and the object-stream
// catch-up that gives a port resuming mid-stage the eighteen banks the board
// had already installed.
//
// EVERY EXPECTED VALUE HERE IS DERIVED FROM THE LISTING, never from running the
// port and writing down what came out (`docs/knowledge/03`).  The ROM side is a
// HAND-BUILT window, so a test that agrees with the port because both read the
// same wrong table is impossible.
//
// THE TRAPS THIS FILE EXISTS FOR, and each has its own test:
//
//  1. **THE DESTINATION IS A THIRD OF PALETTE RAM AND THEY LOOK ALIKE.**
//     `$24133C` copies `$80E886`->`$A00000` (sprites), `$80F086`->`$A00800`
//     (background) and `$80F886`->`$A01000` (text).  Getting the pairing wrong
//     recolours the wrong layer and every count stays identical -- which is
//     exactly the defect W90 found in `src/web/app.js`, one third out.
//  2. **THE DIRTY FLAG IS THE WHOLE PROTOCOL.**  Nothing writes palette RAM
//     directly.  A flush that does not clear its flag copies every frame; an
//     install that does not set it never reaches the screen at all, and the
//     picture would be right on the frame after some OTHER install.
//  3. **PROVENANCE MUST SURVIVE THE FLUSH.**  The staging area is seeded from
//     the BOARD's RAM, so a flush that marked everything it copied as
//     cartridge-sourced would relabel the recording as the cartridge and the
//     page would silently claim 1,024 sourced entries. Test 5 pins that.
//  4. **`lsl.w #$6` IS NOT MASKED.**  Bank 32 lands in the BACKGROUND staging
//     area on the board too. The port throws by address; a clamp would hide a
//     caller that resolved the wrong table.
//
// NO FIXTURE SITS WHERE TWO READINGS AGREE: every bank's 32 words are distinct
// from every other bank's, the three staging areas are seeded with three
// different fills, and the catch-up's stream entries are in a deliberately
// shuffled bank order.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { Unreached } from '../src/unported.js';
import {
  PaletteState, PALSTAGE, PAL_WORDS, install24150A, flush24133C,
  catchUpObjectStream, mergePalette, agreeWithBoard,
} from '../src/palette.js';

// ---------------------------------------------------------------- THE FIXTURE

/** A ROM window built by hand.  A read of an address nothing put there THROWS,
 *  the same contract `src/rom.js` has. */
class FakeRom {
  constructor() { this.b = new Map(); }
  put(a, ...bytes) { bytes.forEach((v, i) => this.b.set(a + i, v & 0xff)); }
  putW(a, v) { this.put(a, (v >> 8) & 0xff, v & 0xff); }
  putL(a, v) {
    this.put(a, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }
  u8(a) {
    if (!this.b.has(a)) throw new Error(`FakeRom: nothing at $${a.toString(16)}`);
    return this.b.get(a);
  }
  u16(a) { return (this.u8(a) << 8) | this.u8(a + 1); }
  u32(a) {
    return ((this.u8(a) << 24) | (this.u8(a + 1) << 16)
      | (this.u8(a + 2) << 8) | this.u8(a + 3)) >>> 0;
  }
  bytes(a, n) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.u8(a + i);
    return out;
  }
}

/** A 64-byte colour block whose 32 words are unique to `tag` -- so a test that
 *  reads the wrong block or the wrong bank cannot pass by coincidence. */
function block(rom, addr, tag) {
  for (let i = 0; i < 32; i++) rom.putW(addr + i * 2, ((tag << 8) | i) & 0x7fff);
  return addr;
}
function wordOf(tag, i) { return ((tag << 8) | i) & 0x7fff; }

function freshRam() {
  const ram = new Ram();
  // Three DIFFERENT fills, so a flush that read the wrong staging area lands
  // on a value no other region could have produced.
  for (const [key, fill] of [['spr', 0x1111], ['bg', 0x2222], ['tx', 0x3333]]) {
    const r = PALSTAGE[key];
    for (let i = 0; i < r.words; i++) ram.setU16(r.stage + i * 2, fill);
  }
  return ram;
}

// ------------------------------------------------------------------- 1. $24150A

test('W91/1 $24150A puts 64 bytes at $80E886 + D0*64 and sets ONLY $80FA66',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const rom = new FakeRom();
    const src = block(rom, 0x222a78, 0x2a);
    assert.strictEqual(ram.u16(PALSTAGE.spr.dirty), 0);
    install24150A(ram, pal, 6, rom.bytes(src, 64), 0x260866, 'the bomb');
    // `lsl.w #$6` -- bank 6 is $80E886 + $180 and NOT $80E886 + 6.
    for (let i = 0; i < 32; i++) {
      assert.strictEqual(ram.u16(0x80e886 + 0x180 + i * 2), wordOf(0x2a, i),
        `word ${i} of bank 6`);
    }
    // ...and the banks on either side are untouched, which is what says the
    // shift is 6 and not 5 (bank 6 at *32 would overlap bank 3's second half).
    assert.strictEqual(ram.u16(0x80e886 + 0x180 - 2), 0x1111);
    assert.strictEqual(ram.u16(0x80e886 + 0x180 + 64), 0x1111);
    // THE DIRTY FLAG, and only its own.
    assert.strictEqual(ram.u16(PALSTAGE.spr.dirty), 1);
    assert.strictEqual(ram.u16(PALSTAGE.bg.dirty), 0);
    assert.strictEqual(ram.u16(PALSTAGE.tx.dirty), 0);
    assert.strictEqual(pal.installCount, 1);
  });

test('W91/2 $24150A THROWS by address on a bank outside the 32, never clamps',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const rom = new FakeRom();
    const src = block(rom, 0x222a78, 0x2a);
    assert.throws(() => install24150A(ram, pal, 32, rom.bytes(src, 64),
      0x2620f2, 'a caller that resolved the wrong table'), (e) => {
      assert.ok(e instanceof Unreached);
      assert.strictEqual(e.romAddress, 0x24150a);
      // The message must name the CONSEQUENCE, not just the number: bank 32 is
      // $80E886+$800, which IS $80F086, the background staging area.
      assert.match(e.message, /\$80F086/);
      return true;
    });
    // ...and nothing was written on the way to the throw.
    assert.strictEqual(ram.u16(PALSTAGE.spr.dirty), 0);
    assert.strictEqual(ram.u16(0x80e886 + 0x800), 0x2222);
  });

// -------------------------------------------------------------------- 2. $24133C

test('W91/3 $24133C copies each staging area to ITS OWN third of palette RAM',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    ram.setU16(PALSTAGE.spr.dirty, 1);
    ram.setU16(PALSTAGE.bg.dirty, 1);
    ram.setU16(PALSTAGE.tx.dirty, 1);
    const did = flush24133C(ram, pal);
    assert.deepStrictEqual(did, { spr: true, bg: true, tx: true });
    // $A00000 = word 0, $A00800 = word $400, $A01000 = word $800.  The three
    // fills differ, so a swapped pair fails here and nowhere else.
    assert.strictEqual(pal.words[0x000], 0x1111);
    assert.strictEqual(pal.words[0x3ff], 0x1111);
    assert.strictEqual(pal.words[0x400], 0x2222);
    assert.strictEqual(pal.words[0x7ff], 0x2222);
    assert.strictEqual(pal.words[0x800], 0x3333);
    assert.strictEqual(pal.words[0x8ef], 0x3333);
    // The TEXT strip is 240 words, NOT 1,024: $8F0 onwards is never written by
    // any of the three copies and stays 0.
    assert.strictEqual(pal.words[0x8f0], 0);
    assert.strictEqual(pal.words[PAL_WORDS - 1], 0);
  });

test('W91/4 $24133C clears the flag it copied, and copies nothing on a clean '
  + 'frame', () => {
  const ram = freshRam();
  const pal = new PaletteState();
  ram.setU16(PALSTAGE.spr.dirty, 1);
  assert.deepStrictEqual(flush24133C(ram, pal),
    { spr: true, bg: false, tx: false });
  assert.strictEqual(ram.u16(PALSTAGE.spr.dirty), 0);
  // The background staging is FULL of $2222 and its flag is clear, so a flush
  // that ignored the flag would have written it anyway.
  assert.strictEqual(pal.words[0x400], 0);
  // Second flush: nothing is dirty, nothing is copied.
  assert.deepStrictEqual(flush24133C(ram, pal),
    { spr: false, bg: false, tx: false });
  assert.strictEqual(pal.copies.spr, 1);
  assert.strictEqual(pal.flushes, 2);
});

// -------------------------------------------------------------- 3. PROVENANCE

test('W91/5 the flush carries PROVENANCE, so the seed\'s own staging is never '
  + 'relabelled as the cartridge', () => {
  const ram = freshRam();
  const pal = new PaletteState();
  const rom = new FakeRom();
  install24150A(ram, pal, 6, rom.bytes(block(rom, 0x222a78, 0x2a), 64),
    0x260866, 'the bomb');
  flush24133C(ram, pal);
  // The WHOLE region was copied -- 1,024 words, every one of them $1111 except
  // bank 6...
  assert.strictEqual(pal.words[0x000], 0x1111);
  assert.strictEqual(pal.words[6 * 32], wordOf(0x2a, 0));
  // ...but only bank 6's 32 words are SOURCED.  This is the assertion that
  // stops the page claiming the board's RAM as the cartridge's data.
  assert.strictEqual(pal.sourcedCount(), 32);
  assert.deepStrictEqual(pal.sourcedBanks(), [6]);
  assert.strictEqual(pal.sourced[0x000], 0);
  assert.strictEqual(pal.sourced[6 * 32 + 31], 1);
});

test('W91/6 mergePalette overwrites ONLY sourced words and counts them', () => {
  const ram = freshRam();
  const pal = new PaletteState();
  const rom = new FakeRom();
  install24150A(ram, pal, 6, rom.bytes(block(rom, 0x222a78, 0x2a), 64),
    0x260866, 'the bomb');
  flush24133C(ram, pal);
  const cap = new Uint16Array(PAL_WORDS).fill(0x5ef3);   // the capture's khaki
  const out = mergePalette(pal, cap, new Uint16Array(PAL_WORDS));
  assert.strictEqual(out.fromCartridge, 32);
  assert.strictEqual(out[6 * 32], wordOf(0x2a, 0));
  // Every other word is still the recording's -- INCLUDING the rest of the
  // sprite third, which the flush overwrote in `pal.words` with $1111.
  assert.strictEqual(out[0], 0x5ef3);
  assert.strictEqual(out[5 * 32], 0x5ef3);
  assert.strictEqual(out[7 * 32], 0x5ef3);
  // ...and the board-agreement figure counts only what was claimed.
  const a = agreeWithBoard(pal, cap);
  assert.strictEqual(a.sourced, 32);
  assert.strictEqual(a.agree, 0);          // the fixture's bomb IS different
});

// ------------------------------------------------------------- 4. THE CATCH-UP

/** A stage-1-shaped scroll script: the per-stage pair table, script 0's header
 *  and a five-entry object stream in a SHUFFLED bank order. */
function streamFixture(rom, { head = 0x26157a, entries } = {}) {
  const PAIR_TABLE = 0x26153e, PAIR = 0x261552, SCRIPT0 = 0x261610;
  rom.putL(PAIR_TABLE, PAIR);          // $26152C lea ($26153E,PC),A0, stage 0
  rom.putL(PAIR, SCRIPT0);             // $261FFA movea.l (A0)+,A2 -- script 0
  rom.putL(PAIR + 4, 0x261790);        // ...script 1, never walked here
  rom.putL(SCRIPT0, head);             // $261FFC move.l (A2)+,$4(A1)
  entries.forEach(([tag, bank], i) => {
    const src = block(rom, 0x223000 + i * 0x40, tag);
    rom.putL(head + i * 6, src);
    rom.putW(head + i * 6 + 4, bank);
  });
  rom.putL(head + entries.length * 6, 0xffffffff);
  return head;
}

test('W91/7 the catch-up replays exactly [head, cursor) out of the CARTRIDGE',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const rom = new FakeRom();
    // A shuffled bank order, so "entry i landed in bank i" cannot pass.
    const entries = [[0xa1, 10], [0xa2, 25], [0xa3, 3], [0xa4, 19], [0xa5, 31]];
    const head = streamFixture(rom, { entries });
    ram.setU16(0x813096, 0);                 // stage index * 4
    ram.setU32(0x813192 + 4, head + 3 * 6);  // THREE entries consumed
    const r = catchUpObjectStream(ram, rom, pal);
    assert.strictEqual(r.entries, 3);
    assert.deepStrictEqual(r.banks, [3, 10, 25]);
    assert.strictEqual(r.skipped, 0);
    // The FOURTH entry's bank must be untouched: the cursor is the boundary.
    assert.strictEqual(ram.u16(0x80e886 + 19 * 64), 0x1111);
    assert.strictEqual(ram.u16(0x80e886 + 31 * 64), 0x1111);
    // ...and the three that ran carry their OWN block, not the previous one's.
    assert.strictEqual(ram.u16(0x80e886 + 10 * 64), wordOf(0xa1, 0));
    assert.strictEqual(ram.u16(0x80e886 + 25 * 64), wordOf(0xa2, 0));
    assert.strictEqual(ram.u16(0x80e886 + 3 * 64), wordOf(0xa3, 0));
  });

test('W91/8 the catch-up MEASURES itself against the staging it found and does '
  + 'not gate on it', () => {
  const ram = freshRam();
  const pal = new PaletteState();
  const rom = new FakeRom();
  const entries = [[0xa1, 10], [0xa2, 25]];
  const head = streamFixture(rom, { entries });
  ram.setU16(0x813096, 0);
  ram.setU32(0x813192 + 4, head + 2 * 6);
  // Pre-load bank 10's staging with the block the cartridge is about to write,
  // and leave bank 25's as the fill.  `same` must be 32 of 64 -- a MEASUREMENT.
  for (let i = 0; i < 32; i++) {
    ram.setU16(0x80e886 + 10 * 64 + i * 2, wordOf(0xa1, i));
  }
  const r = catchUpObjectStream(ram, rom, pal);
  assert.strictEqual(r.total, 64);
  assert.strictEqual(r.same, 32);
  // ...and BOTH banks were written regardless.  A catch-up that skipped the
  // ones that already agreed would source fewer words for no reason.
  assert.strictEqual(pal.sourcedCount(), 0);   // nothing flushed yet
  assert.strictEqual(ram.u16(0x80e886 + 25 * 64), wordOf(0xa2, 0));
});

test('W91/9 a cursor that is not head + 6n THROWS instead of replaying garbage',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const rom = new FakeRom();
    const head = streamFixture(rom, { entries: [[0xa1, 10], [0xa2, 25]] });
    ram.setU16(0x813096, 0);
    ram.setU32(0x813192 + 4, head + 7);     // 7 is not a multiple of 6
    assert.throws(() => catchUpObjectStream(ram, rom, pal), (e) => {
      assert.ok(e instanceof Unreached);
      assert.match(e.message, /head \+ 6n/);
      return true;
    });
    // ...and a cursor PAST the terminator is the other half of the same claim.
    ram.setU32(0x813192 + 4, head + 4 * 6);
    assert.throws(() => catchUpObjectStream(ram, rom, pal), (e) => {
      assert.ok(e instanceof Unreached);
      assert.strictEqual(e.romAddress, 0x2620e6);
      return true;
    });
  });

test('W91/10 a cursor EQUAL to the head replays nothing and is not an error',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const rom = new FakeRom();
    const head = streamFixture(rom, { entries: [[0xa1, 10]] });
    ram.setU16(0x813096, 0);
    ram.setU32(0x813192 + 4, head);
    const r = catchUpObjectStream(ram, rom, pal);
    assert.strictEqual(r.entries, 0);
    assert.strictEqual(pal.installCount, 0);
    assert.strictEqual(ram.u16(PALSTAGE.spr.dirty), 0);
  });

// -------------------------------------------------- 5. THE EXPORTER'S CLAIMS
//
// `src/palette.js`'s header carries a NINE-ROW TABLE of the upload family and
// says which one this port implements.  Nine comments on this project have now
// been caught outliving what they described, two of them found by W90 in files
// its own brief sent it to read, so the table is checked against the cartridge
// on every export.  These pin that it IS checked, and on every export rather
// than behind a flag.

import fs from 'node:fs';
const TOOLSRC = fs.readFileSync(
  new URL('../tools/export-tables.py', import.meta.url), 'utf8');

test('W91/11 the exporter ASSERTS the palette upload family against the '
  + 'cartridge, on every export', () => {
  assert.ok(/def check_palette_upload_family/.test(TOOLSRC));
  assert.ok(/-> dict:\n(?:\s*check_\w+\(d\)[^\n]*\n)*\s*check_palette_upload_family\(d\)/
    .test(TOOLSRC), 'and it runs on EVERY export, not behind a flag');
  // The nine-row table's own membership: eight absolute-long routines plus the
  // word-count one ($2415A2) whose two sites are `jmp`s and whose shape is
  // different enough that it is documented and NOT checked field by field.
  for (const a of ['0x24150A', '0x24152E', '0x241556', '0x24157A',
    '0x2415C4', '0x2415E8', '0x2414BE', '0x2414E2']) {
    assert.ok(TOOLSRC.includes(a), `${a} must be in PALETTE_UPLOADS`);
  }
  // The three flush destinations, which are the addresses a reader gets wrong.
  assert.ok(/0x80E886, 0xA00000/.test(TOOLSRC), 'sprites -> $A00000');
  assert.ok(/0x80F086, 0xA00800/.test(TOOLSRC), 'background -> $A00800');
  assert.ok(/0x80F886, 0xA01000/.test(TOOLSRC), 'text -> $A01000');
});

test('W91/12 the two W91 ROM windows are declared with the extents the port '
  + 'reads', () => {
  // [$222A78, $2252F8) -- the ordinary bomb's block up to the last object-
  // stream block plus its own 64 bytes.  0x2880 is that span exactly.
  assert.ok(/\(0x222A78, 0x2880,/.test(TOOLSRC),
    'the colour-block window must be $222A78 + $2880; a shorter one throws by '
    + 'address mid-stage and a longer one is not pinned by a block');
  // ...and the two CONSTANT banks, which ABUT: $246BB8 + $80 == $246C38.
  assert.ok(/\(0x246BB8, 0x0080,/.test(TOOLSRC));
  assert.ok(/PALETTE_CONST_BANKS = \{0x246BB8: 0x0000, 0x246BF8: 0x7FFF\}/
    .test(TOOLSRC),
  '$246BB8 is 32 x $0000 (BLACK) and $246BF8 is 32 x $7FFF (WHITE) -- the two '
    + 'endpoints $24636C/$2463A6 fade the whole palette to. src/background.js '
    + 'called the pair "64 zero bytes" until W91 and that was half of it');
});
