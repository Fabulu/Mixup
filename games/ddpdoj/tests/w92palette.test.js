// WAVE 92 -- THE BACKGROUND THIRD (`$2415E8`, `$2611C4`) AND THE FOUR ANIMATED
// ENTRIES (`$241404`, `$246292`), plus the seam that finally lets an ENEMY INIT
// BODY install a colour bank.
//
// EVERY EXPECTED VALUE HERE IS DERIVED FROM THE LISTING, never from running the
// port and writing down what came out (`docs/knowledge/03`).  The ROM side is a
// HAND-BUILT window, so a test that agrees with the port because both read the
// same wrong table is impossible.
//
// THE TRAPS THIS FILE EXISTS FOR, and each has its own test:
//
//  1. **`$2415E8` IS THE COUNTED FORM AND `$24150A` IS NOT.**  Its outer `dbra
//     D1` is the only difference that matters, and `moveq #$1F,D1` at $2611C2
//     means THIRTY-TWO banks -- the entire middle third in one call.  A port
//     that reads D1 as a count rather than a count-minus-one is one bank short
//     and the last 32 words stay the recording's, invisibly.
//  2. **`$241404` WRITES PALETTE RAM DIRECTLY.**  It is the one exception to
//     the staging-area protocol W91's header stated without one.  It READS
//     `$80F086+$540` and WRITES `$A00800+$540`, so the staging keeps the
//     block's colour and only palette RAM shows the fade -- which is why
//     `$227E58` has agreed with the board on 1020 of 1024 since W14 and the
//     other four were never found.
//  3. **WRITE THEN ADVANCE.**  `$241430 move.w $80FA6C,D1` happens before
//     `$24146A subq.b #$1,$80FA70`.  A port that advances first is one frame
//     early on the fade forever, and the picture still looks perfectly right.
//  4. **THE DIVIDER IS NOT THE STEP.**  `$80FA70`/`$80FA71` gate whether the
//     level moves at all this frame; `$80FA6E` is how far.  On the shipped seed
//     the reload is 1 so a port that drops the divider is RIGHT, which is
//     exactly why it needs a test with a reload that is not 1.
//  5. **PROVENANCE MUST SURVIVE THE TRANSFORM.**  A faded word is
//     cartridge-sourced only when the word it was computed FROM is.
//
// NO FIXTURE SITS WHERE TWO READINGS AGREE: the 32 background banks are filled
// with 1,024 distinct words, the fade fixture's four sources are four different
// colours, and the divider fixture's reload is 3 rather than the seed's 1.

import test from 'node:test';
import assert from 'node:assert';
import { Ram } from '../src/ram.js';
import { Unreached } from '../src/unported.js';
import {
  PaletteState, PALSTAGE, install2415E8, flush24133C, fade246292,
  bgFade241404, catchUpBgPalette, mergePalette, BGPAL_TABLE,
  FADE_OFFSET_BYTES, FADE_WORDS,
} from '../src/palette.js';

// ---------------------------------------------------------------- THE FIXTURE

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

/** 1,024 words, every one distinct, so a test cannot pass by reading the wrong
 *  bank or the wrong half of one. */
const bgWord = (i) => (0x0100 + i) & 0x7fff;
function bgBlock(rom, addr) {
  for (let i = 0; i < 1024; i++) rom.putW(addr + i * 2, bgWord(i));
  return addr;
}

function freshRam() {
  const ram = new Ram();
  for (const [key, fill] of [['spr', 0x1111], ['bg', 0x2222], ['tx', 0x3333]]) {
    const r = PALSTAGE[key];
    for (let i = 0; i < r.words; i++) ram.setU16(r.stage + i * 2, fill);
  }
  return ram;
}

// ------------------------------------------------------------ 1. $2415E8

test('W92/1 $2415E8 uploads (D1+1) banks into $80F086 and sets ONLY $80FA68',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const rom = new FakeRom();
    const src = bgBlock(rom, 0x227e58);
    install2415E8(ram, pal, 0, 0x1f, rom.bytes(src, 32 * 64), 0x2611c4, 'the stage');
    // `moveq #$1F,D1` is THIRTY-TWO banks: all 1,024 words, not 31 banks.
    for (const i of [0, 1, 31, 32, 512, 1022, 1023]) {
      assert.strictEqual(ram.u16(PALSTAGE.bg.stage + i * 2), bgWord(i),
        `background staging word ${i}`);
    }
    // ...and the SPRITE staging below it and the TEXT staging above it are
    // untouched, which is what says $80F086 and not $80E886 or $80F886.
    assert.strictEqual(ram.u16(PALSTAGE.spr.stage + 1023 * 2), 0x1111);
    assert.strictEqual(ram.u16(PALSTAGE.tx.stage), 0x3333);
    assert.strictEqual(ram.u16(PALSTAGE.bg.dirty), 1);
    assert.strictEqual(ram.u16(PALSTAGE.spr.dirty), 0);
    assert.strictEqual(ram.u16(PALSTAGE.tx.dirty), 0);
  });

test('W92/2 $2415E8 THROWS by address when D0+D1+1 runs past the 32 banks',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const rom = new FakeRom();
    bgBlock(rom, 0x227e58);
    assert.throws(() => install2415E8(ram, pal, 1, 0x1f,
      rom.bytes(0x227e58, 32 * 64), 0x2611c4, 'a caller off by one bank'),
    (e) => {
      assert.ok(e instanceof Unreached);
      assert.strictEqual(e.romAddress, 0x2415e8);
      // It must name the CONSEQUENCE: past $80F086's 32 banks is $80F886.
      assert.match(e.message, /\$80F886/);
      return true;
    });
    assert.strictEqual(ram.u16(PALSTAGE.bg.dirty), 0);
  });

test('W92/3 $2415E8 THROWS on a short read rather than uploading half a third',
  () => {
    const ram = freshRam();
    const pal = new PaletteState();
    const rom = new FakeRom();
    bgBlock(rom, 0x227e58);
    assert.throws(() => install2415E8(ram, pal, 0, 0x1f,
      rom.bytes(0x227e58, 31 * 64), 0x2611c4, 'a window one bank short'),
    (e) => e instanceof Unreached && /2048/.test(e.message));
  });

// -------------------------------------------------------------- 2. $246292

test('W92/4 $246292: level $20 is the IDENTITY, and that is the whole claim',
  () => {
    // The transform is x8, times the level, /256.  $20 = 32 = 256/8, so it is
    // the identity for every one of the 32,768 xRGB555 words -- checked on all
    // of them rather than on a sample, because it costs nothing and a sample
    // is where a wrong shift hides.
    let bad = 0;
    for (let w = 0; w < 0x8000; w++) if (fade246292(w, 0x20) !== w) bad++;
    assert.strictEqual(bad, 0, 'level $20 must be the identity on all 32,768');
  });

test('W92/5 $246292 clamps each channel at $1F and never wraps into the next',
  () => {
    // White at the fade's UPPER bound: every channel would compute past $1F and
    // `cmpi.w #$1F / ble / move.w #$1F` pins it.  A port that let a channel
    // reach $20 would carry a bit into the channel above it.
    assert.strictEqual(fade246292(0x7fff, 0x3c), 0x7fff);
    // ...and one bright channel does not spill into its dark neighbours.
    assert.strictEqual(fade246292(0x7c00, 0x3c), 0x7c00);
    assert.strictEqual(fade246292(0x001f, 0x3c), 0x001f);
    // The fade's LOWER bound is a real darkening, not a no-op.
    assert.ok(fade246292(0x7fff, 0x18) < 0x7fff);
  });

// --------------------------------------------------- 3. $241404, the fade

/** The fade fixture: four DIFFERENT source colours at $80F086+$540, both gates
 *  open, and a divider whose reload is 3 -- not the seed's 1, so a port that
 *  drops the divider cannot pass. */
function fadeRam(opts = {}) {
  const ram = freshRam();
  ram.setU16(0x813092, opts.stage ?? 0);
  ram.setU16(0x8130ce, opts.clock ?? 0x100);
  ram.setU16(0x80fa6c, opts.level ?? 0x20);
  ram.setU16(0x80fa6e, opts.step ?? 0x0002);
  ram.setU8(0x80fa70, opts.ctr ?? 3);
  ram.setU8(0x80fa71, opts.reload ?? 3);
  const src = [0x7c00, 0x03e0, 0x001f, 0x7fff];
  for (let k = 0; k < FADE_WORDS; k++) {
    ram.setU16(PALSTAGE.bg.stage + FADE_OFFSET_BYTES + k * 2, src[k]);
  }
  return { ram, src };
}
const FADE_W0 = PALSTAGE.bg.dst + FADE_OFFSET_BYTES / 2;

test('W92/6 $241404 writes FOUR words at $A00800+$540 -- bank 21 pens 0..3',
  () => {
    const { ram, src } = fadeRam({ level: 0x20 });
    const pal = new PaletteState();
    // Mark the background staging cartridge-sourced, as install2415E8 would.
    pal.stageSourced.bg.fill(1);
    const r = bgFade241404(ram, pal);
    assert.strictEqual(r.ran, true);
    assert.strictEqual(r.wrote, FADE_WORDS);
    // $540/2 = 672 words into the region = bank 21 pen 0.  Named here in the
    // arithmetic of the instruction rather than as the constant 672.
    assert.strictEqual(FADE_OFFSET_BYTES / 2, 21 * 32);
    for (let k = 0; k < FADE_WORDS; k++) {
      assert.strictEqual(pal.words[FADE_W0 + k], src[k], `pen ${k} at level $20`);
      assert.strictEqual(pal.sourced[FADE_W0 + k], 1);
    }
    // ...and NOTHING outside those four, in either direction.
    assert.strictEqual(pal.words[FADE_W0 - 1], 0);
    assert.strictEqual(pal.words[FADE_W0 + FADE_WORDS], 0);
    // **AND THE STAGING IS UNTOUCHED** -- this routine writes palette RAM
    // directly and reads its source back out of staging every frame.
    for (let k = 0; k < FADE_WORDS; k++) {
      assert.strictEqual(
        ram.u16(PALSTAGE.bg.stage + FADE_OFFSET_BYTES + k * 2), src[k]);
    }
  });

test('W92/7 $241404 obeys BOTH its gates and writes nothing when either is shut',
  () => {
    for (const [what, opts] of [
      ['$813092 non-zero (the freeze)', { stage: 1 }],
      ['$8130CE >= $130 (past the fade window)', { clock: 0x130 }],
    ]) {
      const { ram } = fadeRam(opts);
      const pal = new PaletteState();
      pal.stageSourced.bg.fill(1);
      const r = bgFade241404(ram, pal);
      assert.strictEqual(r.ran, false, what);
      assert.strictEqual(pal.words[FADE_W0], 0, what);
      // ...and the level did NOT advance either: both gates branch to $2414BC,
      // past the whole state machine.
      assert.strictEqual(ram.u16(0x80fa6c), 0x20, what);
      assert.strictEqual(ram.u8(0x80fa70), 3, what);
    }
    // $8130CE = $12F is INSIDE (`bge` is >=, not >), and one short of the bound
    // is where an off-by-one lives.
    const { ram } = fadeRam({ clock: 0x12f });
    const pal = new PaletteState();
    assert.strictEqual(bgFade241404(ram, pal).ran, true);
  });

test('W92/8 $241404 WRITES THEN ADVANCES, and the divider gates the advance',
  () => {
    const { ram, src } = fadeRam({ level: 0x20, step: 0x0002, ctr: 3, reload: 3 });
    const pal = new PaletteState();
    pal.stageSourced.bg.fill(1);
    // Frames 1..3: the divider counts 3 -> 2 -> 1 -> 0 with no borrow, so the
    // level does not move and the colour is the SAME every time.
    for (const want of [3, 2, 1]) {
      bgFade241404(ram, pal);
      assert.strictEqual(pal.words[FADE_W0 + 3], src[3], 'level $20 held');
      assert.strictEqual(ram.u8(0x80fa70), want - 1);
      assert.strictEqual(ram.u16(0x80fa6c), 0x20);
    }
    // Frame 4: the counter is 0, `subq.b #$1` borrows, the reload lands and the
    // level steps.  **The write on THIS frame still used $20** -- that is the
    // write-then-advance order, and it is the whole test.
    bgFade241404(ram, pal);
    assert.strictEqual(pal.words[FADE_W0 + 3], src[3],
      'the frame that advances still WROTE with the old level');
    assert.strictEqual(ram.u8(0x80fa70), 3, 'reloaded from $80FA71');
    assert.strictEqual(ram.u16(0x80fa6c), 0x22, 'and only now stepped by $80FA6E');
  });

test('W92/9 the fade ping-pongs between $18 and $3C, and the arms are not symmetric',
  () => {
    // UP: `cmpi.w #$3C / blt` -- $3C itself REVERSES, $3A does not.
    for (const [level, step, want] of [
      [0x3a, 2, 0x0002], [0x3c, 2, 0xfffe], [0x3e, 2, 0xfffe],
      // DOWN: `cmpi.w #$18 / bge` -- $18 itself does NOT reverse, $16 does.
      [0x1a, 0xfffe, 0xfffe], [0x18, 0xfffe, 0xfffe], [0x16, 0xfffe, 0x0002],
    ]) {
      // Arrange the level so that ONE advance lands exactly on `level`, and set
      // the divider to 0 so this frame is the one that borrows.
      const { ram } = fadeRam({
        level: (level - ((step << 16) >> 16)) & 0xffff, step, ctr: 0, reload: 0,
      });
      const pal = new PaletteState();
      bgFade241404(ram, pal);
      assert.strictEqual(ram.u16(0x80fa6c), level, `level after the advance`);
      assert.strictEqual(ram.u16(0x80fa6e), want,
        `the step after reaching $${level.toString(16)}`);
    }
  });

test('W92/10 a faded word is SOURCED only when the word it came from is', () => {
  const { ram } = fadeRam({ level: 0x20 });
  const pal = new PaletteState();
  // Nothing has uploaded the background block: stageSourced.bg is all zero.
  bgFade241404(ram, pal);
  for (let k = 0; k < FADE_WORDS; k++) {
    assert.strictEqual(pal.sourced[FADE_W0 + k], 0,
      'an unsourced source must not produce a sourced result');
  }
  // ...and mergePalette therefore leaves the recording's four words alone.
  const cap = new Uint16Array(pal.words.length).fill(0x1234);
  const out = mergePalette(pal, cap);
  for (let k = 0; k < FADE_WORDS; k++) {
    assert.strictEqual(out[FADE_W0 + k], 0x1234);
  }
  assert.strictEqual(out.fromCartridge, 0);
});

// ------------------------------------------------------- 4. $24133C + $2611C4

test('W92/11 $24133C runs the fade whether or not any region was dirty', () => {
  const { ram, src } = fadeRam({ level: 0x20 });
  const pal = new PaletteState();
  pal.stageSourced.bg.fill(1);
  // Every dirty flag clear -- `did` must be all false and the fade must still
  // have run, because $2413CC's `beq` falls INTO $241404.
  const did = flush24133C(ram, pal);
  assert.deepStrictEqual(did, { spr: false, bg: false, tx: false });
  assert.strictEqual(pal.lastFade.ran, true);
  assert.strictEqual(pal.words[FADE_W0 + 3], src[3]);
});

test('W92/12 catchUpBgPalette replays $2611C4 from the CARTRIDGE, stage-indexed',
  () => {
    const ram = freshRam();
    const rom = new FakeRom();
    const pal = new PaletteState();
    // Two stages, two blocks: a catch-up that ignored $813096 would install the
    // wrong stage's colours and every count would look identical.
    bgBlock(rom, 0x227e58);
    for (let i = 0; i < 1024; i++) rom.putW(0x229df8 + i * 2, (0x4000 + i) & 0x7fff);
    rom.putL(BGPAL_TABLE + 0, 0x227e58);
    rom.putL(BGPAL_TABLE + 4, 0x229df8);
    ram.setU16(0x813096, 4);                     // stage 2, x4
    const r = catchUpBgPalette(ram, rom, pal);
    assert.strictEqual(r.block, 0x229df8, 'the STAGE INDEX chose the block');
    assert.strictEqual(r.banks, 32);
    assert.strictEqual(ram.u16(PALSTAGE.bg.stage), 0x4000);
    assert.strictEqual(ram.u16(PALSTAGE.bg.stage + 1023 * 2), (0x4000 + 1023) & 0x7fff);
    // `same` is a MEASUREMENT against the staging the seed carried, never a
    // gate: here the fixture's fill disagrees with the block completely.
    assert.strictEqual(r.total, 1024);
    assert.strictEqual(r.same, 0);
    // ...and after a flush all 1,024 background words are cartridge-sourced
    // and NO sprite or text word is.
    flush24133C(ram, pal);
    const led = pal.ledger();
    assert.deepStrictEqual(
      { spr: led.spr, bg: led.bg, tx: led.tx, total: led.total },
      { spr: 0, bg: 1024, tx: 0, total: 1024 });
  });

test('W92/13 catchUpBgPalette NAMES a block outside the ROM windows and does '
  + 'not take the page down', () => {
  const ram = freshRam();
  const rom = new FakeRom();
  const pal = new PaletteState();
  rom.putL(BGPAL_TABLE, 0x227e58);               // ...and no block behind it
  ram.setU16(0x813096, 0);
  const notes = [];
  const r = catchUpBgPalette(ram, rom, pal, { note: (a, w) => notes.push([a, w]) });
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(pal.sourcedCount(), 0);
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(notes[0][0], 0x2611c4);
  assert.match(notes[0][1], /1,024 background words stay the recording/);
  // AND THE FLAG WAS NOT SET.  A dirty flag with nothing behind it would flush
  // the fixture's fill into palette RAM and count it as nothing at all.
  assert.strictEqual(ram.u16(PALSTAGE.bg.dirty), 0);
});

// -------------------------------------- 5. THE EXPORTER'S OWN CHECK, PINNED

import fs from 'node:fs';
const TOOL = (n) => fs.readFileSync(new URL(`../tools/${n}`, import.meta.url), 'utf8');

test('W92/14 the exporter ASSERTS the background upload and the fade against '
  + 'the cartridge, on every export', () => {
  const s = TOOL('export-tables.py');
  assert.ok(/def check_bg_palette_and_fade/.test(s));
  assert.ok(/check_palette_upload_family\(d\).*\n\s*check_bg_palette_and_fade\(d\)/
    .test(s), 'and it runs on EVERY export, not behind a flag');
  // The window must be DECLARED, because src/rom.js throws by address and a
  // missing one turns catchUpBgPalette into a named skip (W92/13).
  assert.ok(/\(0x227E58, 0x0800,/.test(s),
    'the stage-1 background palette block is 32 banks x 64 bytes = $800');
  // The two numbers a reader would most easily get wrong, pinned by name.
  assert.ok(/FADE_OFFSET = 0x540/.test(s));
  assert.ok(/FADE_LO, FADE_HI = 0x18, 0x3C/.test(s));
  assert.ok(/0x2611C2\) != 0x721F/.test(s),
    '`moveq #$1F,D1` is what makes $2611C4 the WHOLE third');
});
