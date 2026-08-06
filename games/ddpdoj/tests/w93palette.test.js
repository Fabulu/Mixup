// WAVE 93 -- THE TEXT STRIP (`$2414BE`, `$23BF86..$23BFCC`, `$2605C8`) and the
// WITNESS that decides whether the second of those two routines is replayed.
//
// EVERY EXPECTED VALUE HERE IS DERIVED FROM THE LISTING, never from running the
// port and writing down what came out (`docs/knowledge/03`).  The ROM side is a
// HAND-BUILT window, so a test that agrees with the port because both read the
// same wrong table is impossible.
//
// THE TRAPS THIS FILE EXISTS FOR, and each has its own test:
//
//  1. **A TEXT BANK IS SIXTEEN ENTRIES, NOT THIRTY-TWO.**  `$2414C8 lsl.w #$5`
//     against `$241514 lsl.w #$6`.  A port that reuses the sprite stride walks
//     twice the region and lands bank 8 on top of bank 15's neighbour.
//  2. **BANK 15 IS THE SPRITE DIRTY FLAG.**  The TX staging is 480 bytes and
//     `$80FA66` is the next word, so an unbounded D0 sets a flag with colour
//     data.  The port throws by address; it does NOT clamp.
//  3. **THE WITNESS, NOT THE BYTE MATCH, IS THE WARRANT FOR `$2605C8`.**  W92
//     refused ten text banks whose bytes matched, because "the bytes match,
//     therefore replay it" is what would have installed its own wrong sprite
//     bank 1, 7 and 8.  W93 replays them because the seed's `$80E240` slot
//     array says type $0A reached state 1 -- so a seed WITHOUT that witness
//     must get nothing, and that is the test that would catch a port which had
//     quietly gone back to trusting the bytes.
//  4. **STATE 0 IS "HAS NOT RUN YET".**  `$2411AE clr.w $2(A0)` starts an
//     object at 0 and `$2605C8`'s own first instruction makes it 1.  A witness
//     that accepted state 0 would fire on an object that has never inited.
//  5. **THE TWO ROUTINES OVERLAP ON BANKS 0..4** and must be idempotent there.
//
// NO FIXTURE SITS WHERE TWO READINGS AGREE: every one of the 15 text banks in
// the fixture holds 16 DISTINCT words and no two banks share a word, the
// witness fixture's slot is not slot 0, and the "no witness" fixture differs
// from the witness one by ONE BYTE.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { Unreached } from '../src/unported.js';
import {
  PaletteState, PALSTAGE, TX_BANKS, TX_BANK_WORDS, install2414BE,
  catchUpTextPalette, obj0AWitness, flush24133C, mergePalette,
  TX_BOOT_INSTALLS, TX_OBJ0A_INSTALLS,
  OBJ_SLOTS, OBJ_SLOT_BYTES, OBJ_SLOT_COUNT, OBJ_TYPE_0A,
} from '../src/palette.js';

// ---------------------------------------------------------------- THE FIXTURE

class FakeRom {
  constructor() { this.b = new Map(); }
  put(a, ...bytes) { bytes.forEach((v, i) => this.b.set(a + i, v & 0xff)); }
  putW(a, v) { this.put(a, (v >> 8) & 0xff, v & 0xff); }
  u8(a) {
    if (!this.b.has(a)) throw new Error(`FakeRom: nothing at $${a.toString(16)}`);
    return this.b.get(a);
  }
  bytes(a, n) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.u8(a + i);
    return out;
  }
}

/** Bank b entry i, and no two (b,i) pairs collide, so a test cannot pass by
 *  reading the wrong bank OR the wrong entry of the right one. */
const txWord = (b, i) => (0x0400 + b * 16 + i) & 0x7fff;

/** The five reset blocks and the ten `$2605C8` blocks, at their REAL addresses,
 *  each filled with the words of the bank its own site names. */
function txRom() {
  const rom = new FakeRom();
  for (const [, bank, block] of [...TX_BOOT_INSTALLS, ...TX_OBJ0A_INSTALLS]) {
    for (let i = 0; i < TX_BANK_WORDS; i++) rom.putW(block + i * 2, txWord(bank, i));
  }
  return rom;
}

function freshRam() {
  const ram = new Ram();
  for (const [key, fill] of [['spr', 0x1111], ['bg', 0x2222], ['tx', 0x3333]]) {
    const r = PALSTAGE[key];
    for (let i = 0; i < r.words; i++) ram.setU16(r.stage + i * 2, fill);
  }
  return ram;
}

/** Put an ACTIVE type-$0A object in `slot` with state byte `state`.  Slot 3
 *  rather than slot 0 on purpose: a walker that only ever looked at the first
 *  slot would pass every test written against slot 0. */
function putObj0A(ram, slot = 3, state = 1, type = OBJ_TYPE_0A) {
  const a = OBJ_SLOTS + slot * OBJ_SLOT_BYTES;
  ram.setU16(a, 0x8000 | type);
  ram.setU16(a + 2, state << 8);                // $260794 tst.b $2(A5): the HIGH byte
  ram.setU16(a + 0x4a, 0x001f);
  return a;
}

// -------------------------------------------------------------- 1. $2414BE

test('W93/1 $2414BE writes 16 words at $80F886 + bank*32 and sets ONLY $80FA6A',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const rom = txRom();
    // Bank 4, so that a `lsl #$6` port would land at +$100 instead of +$80 and
    // the assertion below would see the untouched fill.
    install2414BE(ram, pal, 4, rom.bytes(0x2226b8, 32), 0x23bfc6, 'the reset path');
    for (let i = 0; i < TX_BANK_WORDS; i++) {
      assert.strictEqual(ram.u16(PALSTAGE.tx.stage + 4 * 32 + i * 2), txWord(4, i),
        `TX bank 4 entry ${i}`);
    }
    // ...and bank 3 below and bank 5 above are untouched, which is what says
    // the stride is 32 BYTES and not 64.
    assert.strictEqual(ram.u16(PALSTAGE.tx.stage + 3 * 32), 0x3333);
    assert.strictEqual(ram.u16(PALSTAGE.tx.stage + 5 * 32), 0x3333);
    // ...and the SPRITE and BACKGROUND staging are untouched, which is what
    // says $80F886 and not $80E886 or $80F086.
    assert.strictEqual(ram.u16(PALSTAGE.spr.stage), 0x1111);
    assert.strictEqual(ram.u16(PALSTAGE.bg.stage), 0x2222);
    assert.strictEqual(ram.u16(PALSTAGE.tx.dirty), 1);
    assert.strictEqual(ram.u16(PALSTAGE.spr.dirty), 0);
    assert.strictEqual(ram.u16(PALSTAGE.bg.dirty), 0);
  });

test('W93/2 $2414BE THROWS on bank 15, which is the SPRITE DIRTY FLAG', () => {
  const ram = freshRam();
  const pal = new PaletteState();
  const rom = txRom();
  assert.throws(
    () => install2414BE(ram, pal, TX_BANKS, rom.bytes(0x222638, 32), 0x2605c8, 'x'),
    (e) => e instanceof Unreached && /\$80FA66/.test(e.message)
      && /SPRITE DIRTY FLAG/.test(e.message));
  // and the flag it would have scribbled on is untouched -- a clamp would have
  // written bank 14 instead and left this test passing.
  assert.strictEqual(ram.u16(PALSTAGE.spr.dirty), 0);
});

test('W93/3 $2414BE THROWS on a short read rather than copying garbage', () => {
  const ram = freshRam();
  const pal = new PaletteState();
  const rom = txRom();
  assert.throws(
    () => install2414BE(ram, pal, 0, rom.bytes(0x222638, 16), 0x23bf8e, 'x'),
    (e) => e instanceof Unreached && /8 longwords = 32/.test(e.message));
});

// ------------------------------------------------------------- 2. THE WITNESS

test('W93/4 obj0AWitness finds an ACTIVE type $0A past state 0', () => {
  const ram = freshRam();
  putObj0A(ram, 3, 1);
  const w = obj0AWitness(ram);
  assert.ok(w, 'the witness should be found');
  assert.strictEqual(w.slot, 3);
  assert.strictEqual(w.state, 1);
  assert.strictEqual(w.prio, 0x1f);
});

test('W93/5 obj0AWitness REFUSES state 0 -- "allocated" is not "has run"', () => {
  const ram = freshRam();
  putObj0A(ram, 3, 0);                 // $2411AE clr.w $2(A0) leaves it here
  assert.strictEqual(obj0AWitness(ram), null);
});

test('W93/6 obj0AWitness REFUSES an INACTIVE slot and a WRONG TYPE', () => {
  const ram = freshRam();
  const a = putObj0A(ram, 3, 1);
  ram.setU16(a, 0x000a);               // bit 15 clear: the slot is free
  assert.strictEqual(obj0AWitness(ram), null);
  ram.setU16(a, 0x8000 | 0x0b);        // active, but type $0B
  assert.strictEqual(obj0AWitness(ram), null);
});

test('W93/7 obj0AWitness walks all 20 slots at a $50 stride', () => {
  for (const slot of [0, 1, OBJ_SLOT_COUNT - 1]) {
    const ram = freshRam();
    putObj0A(ram, slot, 2);
    const w = obj0AWitness(ram);
    assert.ok(w, `slot ${slot} should be found`);
    assert.strictEqual(w.slot, slot);
    assert.strictEqual(w.addr, OBJ_SLOTS + slot * OBJ_SLOT_BYTES);
  }
  // ...and NOT one past the end, which a `<=` would reach.
  const ram = freshRam();
  putObj0A(ram, OBJ_SLOT_COUNT, 1);
  assert.strictEqual(obj0AWitness(ram), null);
});

// ------------------------------------------------------- 3. THE CATCH-UP

test('W93/8 with NO witness the catch-up installs the RESET FIVE and no more',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const notes = [];
    catchUpTextPalette(ram, txRom(), pal, { note: (a, w) => notes.push([a, w]) });
    assert.strictEqual(pal.txCatchUp.reset, 5);
    assert.strictEqual(pal.txCatchUp.obj0A, 0);
    assert.strictEqual(pal.txCatchUp.witness, null);
    // banks 0..4 sourced, banks 5..14 NOT -- and 5, 6, 7, 8 and 11 are exactly
    // the ones whose bytes are in the fixture and would have matched.
    for (let b = 0; b < TX_BANKS; b++) {
      assert.strictEqual(pal.stageSourced.tx[b * TX_BANK_WORDS], b < 5 ? 1 : 0,
        `TX bank ${b} sourced?`);
    }
    // ...and the refusal is NAMED rather than silent.
    assert.ok(notes.some(([a, w]) => a === 0x2605c8
      && /banks 5, 6, 7, 8 and 11 stay the recording/.test(w)),
    `the $2605C8 refusal must be noted; got ${JSON.stringify(notes)}`);
  });

test('W93/9 with a witness the catch-up installs TEN more, and bank 11 not 9',
  () => {
    const ram = freshRam();
    putObj0A(ram, 3, 1);
    const pal = new PaletteState();
    catchUpTextPalette(ram, txRom(), pal, {});
    assert.strictEqual(pal.txCatchUp.reset, 5);
    assert.strictEqual(pal.txCatchUp.obj0A, 10);
    // The ten are banks 0..8 and ELEVEN.  Bank 9 and 10 are NOT installed, and
    // that is the off-by-one a port which read the list as 0..9 would make.
    const want = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 11]);
    for (let b = 0; b < TX_BANKS; b++) {
      assert.strictEqual(pal.stageSourced.tx[b * TX_BANK_WORDS], want.has(b) ? 1 : 0,
        `TX bank ${b} sourced?`);
    }
    for (const b of want) {
      for (let i = 0; i < TX_BANK_WORDS; i++) {
        assert.strictEqual(ram.u16(PALSTAGE.tx.stage + b * 32 + i * 2), txWord(b, i),
          `TX bank ${b} entry ${i}`);
      }
    }
    // banks 9, 10, 12, 13, 14 keep the fill: 80 words still the recording's.
    for (const b of [9, 10, 12, 13, 14]) {
      assert.strictEqual(ram.u16(PALSTAGE.tx.stage + b * 32), 0x3333,
        `TX bank ${b} must be untouched`);
    }
  });

test('W93/10 the two routines OVERLAP on banks 0..4 and are idempotent there',
  () => {
    const ram = freshRam();
    putObj0A(ram, 3, 1);
    const pal = new PaletteState();
    catchUpTextPalette(ram, txRom(), pal, {});
    // 80 words were written twice, and `sameAsReset` counts exactly them.
    assert.strictEqual(pal.txCatchUp.sameAsReset, 5 * TX_BANK_WORDS);
    assert.strictEqual(pal.txCatchUp.banks, 15);   // 5 + 10 INSTALLS, 10 banks
    // ...and the second pass left the same values, which is the property that
    // makes running both in board order safe.
    for (let i = 0; i < TX_BANK_WORDS; i++) {
      assert.strictEqual(ram.u16(PALSTAGE.tx.stage + i * 2), txWord(0, i));
    }
  });

test('W93/11 the RESET five and the $2605C8 ten name the SAME block for 0..4',
  () => {
    // Derived from the two tables rather than typed: if a future edit points
    // one of them at a different block, the port's two arms would disagree and
    // the LAST one to run would silently win.
    const reset = new Map(TX_BOOT_INSTALLS.map(([, b, blk]) => [b, blk]));
    for (const [, bank, block] of TX_OBJ0A_INSTALLS) {
      if (!reset.has(bank)) continue;
      assert.strictEqual(block, reset.get(bank),
        `TX bank ${bank}: $2605C8 names $${block.toString(16)} and the reset `
        + `path names $${reset.get(bank).toString(16)}`);
    }
    assert.strictEqual(reset.size, 5);
    assert.strictEqual(TX_OBJ0A_INSTALLS.length, 10);
  });

test('W93/12 a block outside the ROM window is NAMED, not fatal, not silent',
  () => {
    const ram = freshRam();
    putObj0A(ram, 3, 1);
    const pal = new PaletteState();
    const rom = txRom();
    rom.b.delete(0x222778);                       // bank 6's block, one byte gone
    const notes = [];
    catchUpTextPalette(ram, rom, pal, { note: (a, w) => notes.push([a, w]) });
    assert.strictEqual(pal.txCatchUp.skipped, 1);
    assert.strictEqual(pal.stageSourced.tx[6 * TX_BANK_WORDS], 0,
      'bank 6 must stay the recording\'s');
    assert.strictEqual(pal.stageSourced.tx[7 * TX_BANK_WORDS], 1,
      'bank 7 must still be installed -- one bad block is not nine');
    assert.ok(notes.some(([a, w]) => a === 0x260630
      && /outside every ROM window/.test(w)));
  });

// -------------------------------------------------- 4. PROVENANCE, END TO END

test('W93/13 the flush carries TEXT provenance into palette words $800..$8EF',
  () => {
    const ram = freshRam();
    putObj0A(ram, 3, 1);
    const pal = new PaletteState();
    catchUpTextPalette(ram, txRom(), pal, {});
    flush24133C(ram, pal);
    // The TEXT third is palette words $800..$8EF and NOWHERE ELSE.  A port that
    // flushed it to $000 or $400 would redden this and W91/W92's tests too.
    for (const b of [0, 5, 11]) {
      for (let i = 0; i < TX_BANK_WORDS; i++) {
        const w = 0x800 + b * TX_BANK_WORDS + i;
        assert.strictEqual(pal.words[w], txWord(b, i), `palette word ${w}`);
        assert.strictEqual(pal.sourced[w], 1, `provenance of word ${w}`);
      }
    }
    for (const b of [9, 10, 12, 13, 14]) {
      assert.strictEqual(pal.sourced[0x800 + b * TX_BANK_WORDS], 0,
        `TX bank ${b} must NOT be claimed`);
    }
    const led = pal.ledger();
    assert.strictEqual(led.tx, 10 * TX_BANK_WORDS);   // 160 of 240
    assert.strictEqual(led.of.tx, 240);
    assert.strictEqual(led.spr, 0);                   // this wave touched neither
    assert.strictEqual(led.bg, 0);
  });

test('W93/14 mergePalette keeps the recording for the FIVE unsourced TX banks',
  () => {
    const ram = freshRam();
    putObj0A(ram, 3, 1);
    const pal = new PaletteState();
    catchUpTextPalette(ram, txRom(), pal, {});
    flush24133C(ram, pal);
    const cap = new Uint16Array(2560).fill(0x7abc);
    const out = mergePalette(pal, cap, new Uint16Array(2560));
    assert.strictEqual(out[0x800], txWord(0, 0), 'bank 0 comes from the cartridge');
    assert.strictEqual(out[0x800 + 9 * 16], 0x7abc, 'bank 9 stays the recording');
    assert.strictEqual(out[0x800 + 14 * 16], 0x7abc, 'bank 14 stays the recording');
    assert.strictEqual(out[0], 0x7abc, 'the SPRITE third is untouched by W93');
    assert.strictEqual(out.fromCartridge, 10 * TX_BANK_WORDS);
  });
