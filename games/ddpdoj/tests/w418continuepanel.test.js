// W418 -- THE CONTINUE PANEL. `$288610`'s jump table `$288638`, all four bodies, and the
// nine-second countdown in `objslot13.js` that feeds the one the boot takes.
//
// WHAT THIS FILE IS FOR. `$28875E` (jump-table entry 3) was the first unported path a full boot
// reached after W417 cleared stage 2's blocker: `rank.js computedDispatch` threw on `hold=shot` at
// lf11672, on `hold=auto` at lf13285 and on `hold=auto+down` at lf13985. Entry 3 is the CONTINUE
// countdown's animation, and its three siblings are the same panel's prompt, wipe and clear.
//
// **THE DEFECT WAS NOT IN THE UNIT THE BRIEF NAMED.** Entry 3's whole job is to draw `($A,A4)`,
// the seconds digit, and to fire `$28C6AC` when it changes. `($A,A4)` is `$81B710`, and the only
// thing that counts it down is `$288B3C`/`$288B4A`, inside `objslot13.js menuArm` -- a function
// whose FIRST LINE read `ctx.menuCarry28D53C`, a ctx field **no file in this tree ever writes**.
// `undefined` made `!undefined` true and the function returned before its second instruction, so
// every one of `$288B0A..$288BAC` had been dead since W373. Section 6 is that repair.
//
// THE MEASUREMENT THAT PROVED IT, and the shape of trap 21: with the arm dead, a full boot ran
// **30,000 frames on all six playgate holds with no throw**. That green was produced by a STALL --
// the panel sat on `mark=9` forever and the game could never leave the continue screen. After the
// repair the same boot counts 9,8,7,...,0 at exactly 61 frames a step, times out, and lands in the
// attract loop. **A green that a stall produces is not evidence of anything.**
//
// THREE ENCODING TRAPS ARE ASSERTED FROM THE OPCODE BYTE HERE, NOT FROM BEHAVIOUR:
//   * `$288846` is `6D` (`blt`), not `6C` (`bge`) -- section 3.
//   * `$2887C2`/`$288832` are `64` (`bcc`) after `subq.b`, the no-borrow SKIP -- section 2/3.
//   * `$288B40`/`$288B4E` are `6C` (`bge`), SIGNED, on bytes -- section 6.
//
// AND ONE WORD LITERAL COVERS TWO BYTE FIELDS in three separate places: `$288778 move.w #$3` fills
// `($E)=0`/`($F)=3`, `$288784 move.w #$1` fills `($12)=0`/`($13)=1`, and `$2889CC`'s `$093C` fills
// `($4,A5)=$09` (seconds) and `($5,A5)=$3C` (frame tick). objslot13.js's own note used to say only
// the high byte of the third was ever read; that was true of the port, not of the cartridge.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { TxVram } from '../src/background.js';
import { flushTextDefer141258 } from '../src/hud.js';
import { coinChanged23C796 } from '../src/tallyscreen.js';
import {
  CONTINUE, DISP_288610_TARGETS,
  continuePrompt28864C, continueWipe28871C, continueCount28875E, continueClear288952,
} from '../src/continuescreen.js';
import { objSlot13, SCREEN13 } from '../src/objslot13.js';
import { PaletteState, PALSTAGE, flush24133C, install2414BE } from '../src/palette.js';
import { buildTxMap } from '../src/render/tiles.js';
import { paletteRgb } from '../src/render/igs023.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');

const TABLES = path.join(R, 'rip', 'port', 'player.tables.json');
const haveTables = fs.existsSync(TABLES);
const tablesJson = haveTables ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const ROM = haveTables ? new RomWindows(tablesJson.rom) : null;
const SKIP = haveTables ? false
  : 'rip/port/player.tables.json missing -- run tools/export-tables.py. THIS IS A SKIP, NOT A PASS.';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = fs.existsSync(IMAGE) ? fs.readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';
const u16img = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32img = (a) => (u16img(a) * 0x10000) + u16img(a + 2);

const HEAD = 0x80b058, CURSOR = 0x80c8d8;
const SEL_A = 0x81b706, SEL_B = 0x81b71c;
const CARRY_WORD = 0x81df20;          // $28D53C's word
const RUN_A = 0x813142, RUN_B = 0x81308e;   // $25FE00's two gates
const P1EDGE = 0x803972;              // machine.js RAM.p1edge -- what readInput23D186 reads

/** Arms the TX defer buffer exactly as `deferReset` does. Without this the printers refuse. */
function arm(ram) {
  ram.setU32(HEAD, 0xffffffff);
  ram.setU32(CURSOR, HEAD);
  ram.setU32(0x80d518, 0);
}

function world() {
  const ram = new Ram(new Uint8Array(0x20000));
  arm(ram);
  const log = new UnportedLog();
  const tx = new TxVram();
  const sounds = [];
  const ctx = { tx, unported: log, unportedLog: log, notes: log,
    soundPost: (a) => { sounds.push(a); return true; } };
  return { ram, tx, ctx, log, sounds };
}
const flush = (w) => flushTextDefer141258(w.ram, w.tx, w.ctx);

// ===========================================================================
// 1. THE JUMP TABLE, THE FOUR EXTENTS, AND WHAT IS DATA
// ===========================================================================

test('W418 $28861E resolves to $288638 and its five longs are the four bodies',
  { skip: SKIP_IMG }, () => {
  assert.equal(u16img(0x28861e), 0x41fa, '$28861E is lea (d16,PC),A0');
  // TRAP 4: the target is the EXTENSION WORD's own address plus the displacement.
  const jt = 0x288620 + ((u16img(0x288620) << 16) >> 16);
  assert.equal(jt, 0x288638);
  assert.equal(jt, CONTINUE.jumpTable);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => u32img(jt + 4 * i)),
    [0, 0x28864c, 0x28871c, 0x28875e, 0x288952]);
  assert.deepEqual([CONTINUE.prompt, CONTINUE.wipe, CONTINUE.count, CONTINUE.clear],
    [0x28864c, 0x28871c, 0x28875e, 0x288952]);
  // and index 0 is the SKIP the dispatcher takes at $28861A, so the map has exactly four keys.
  assert.deepEqual(Object.keys(DISP_288610_TARGETS), ['1', '2', '3', '4']);
  assert.equal(DISP_288610_TARGETS[3], continueCount28875E);
});

test('W418 each body ends on an rts AT its last address, so the extents are bounded',
  { skip: SKIP_IMG }, () => {
  // TRAP: `4E75` SITS AT the last address; measuring to the next table entry overshoots.
  // Entry-to-entry versus real code length, for the record:
  //   1: $28864C..$2886FA  code $B0, then 32 bytes of STRING; entry-to-entry is $D0
  //   2: $28871C..$28875C  code $42, no data;                  entry-to-entry is $42
  //   3: $28875E..$288868  code $10C, then $E8 of TABLES;      entry-to-entry is $1F4
  //   4: $288952..$288988  code $38
  for (const end of [0x2886fa, 0x28875c, 0x288868, 0x288988]) {
    assert.equal(u16img(end), 0x4e75, `$${end.toString(16)} is the rts`);
  }
  assert.equal(0x2886fa + 2 + 0x20, 0x28871c, 'entry 1: rts, then $20 of string, then entry 2');
  assert.equal(0x288868 + 2 + 0xe8, 0x288952, 'entry 3: rts, then $E8 of tables, then entry 4');
  // $28875E's CODE is $10C bytes of the $1F4 the entries are apart -- 46% of the gap is data.
  assert.equal(0x288952 - 0x28875e, 0x1f4);
  assert.equal(0x28886a - 0x28875e, 0x10c);
});

test('W418 both strings are what continuescreen.js says, and stop on the NUL $25A14C tests',
  { skip: SKIP_IMG }, () => {
  assert.equal(IMG.slice(0x2886fc, 0x28870a).toString('latin1'), ' CONTINUE     ');
  assert.equal(IMG[0x28870a], 0, 'the prompt NUL');
  assert.equal(IMG.slice(0x28870c, 0x28871a).toString('latin1'), ' '.repeat(14));
  assert.equal(IMG[0x28871a], 0, 'the blank NUL');
  assert.equal(CONTINUE.strPrompt, 0x2886fc);
  assert.equal(CONTINUE.strBlank, 0x28870c);
  // THREE leas name the blank string and one names the prompt; all four decoded, not assumed.
  for (const [site, want] of [[0x2886b6, 0x2886fc], [0x288792, 0x28870c],
    [0x2887a8, 0x28870c], [0x28874a, 0x28870c]]) {
    assert.equal(u16img(site), 0x41fa, `$${site.toString(16)} lea`);
    assert.equal(site + 2 + ((u16img(site + 2) << 16) >> 16), want);
  }
});

test('W418 the five new ROM windows exist and cover every byte the four bodies read',
  { skip: SKIP }, () => {
  const win = tablesJson.rom.windows.map((w) => [parseInt(w.base.slice(1), 16), w.len]);
  const covered = (a) => win.some(([s, n]) => a >= s && a < s + n);
  for (const [base, len] of [[0x2886fc, 0x10], [0x28870c, 0x10],
    [0x28886a, 0x44], [0x2888b2, 0x28], [0x2888da, 0x78]]) {
    for (let i = 0; i < len; i++) {
      assert.ok(covered(base + i), `$${(base + i).toString(16)} is windowed`);
    }
  }
  // And the reads really go through RomWindows -- a wrong base would throw here, not later.
  assert.equal(ROM.u32(0x28886a), 0x0f8f001a);
  assert.equal(ROM.u32(0x2888b2), 0x2888da);
  assert.equal(ROM.u8(0x2886fc), 0x20);
});

test('W418 all 47 Continue pictures select TEXT palette bank 13',
  { skip: SKIP }, () => {
  const banner = Array.from({ length: 17 }, (_, index) => ROM.u32(0x28886a + index * 4));
  const digits = Array.from({ length: 10 }, (_, digit) => ROM.u32(0x2888b2 + digit * 4))
    .flatMap((group) => Array.from({ length: 3 }, (_, frame) => ROM.u32(group + frame * 4)));
  assert.equal(banner.length, 17);
  assert.equal(digits.length, 30);
  for (const [kind, descriptors] of [['banner', banner], ['digit', digits]]) {
    descriptors.forEach((descriptor, index) => {
      const attr = descriptor & 0xffff;
      assert.equal(attr, 0x001a, `${kind} descriptor ${index} has attribute $001A`);
      assert.equal((attr & 0x003e) >> 1, 13,
        `${kind} descriptor ${index} resolves through buildTxMap to TEXT bank 13`);
    });
  }
});

test('W418 installing $222818 turns the Continue silhouette from black into colour',
  { skip: SKIP }, () => {
  const descriptor = ROM.u32(0x28886a);
  const tile = descriptor >>> 16;
  const attr = descriptor & 0xffff;
  const txram = new Uint16Array(64 * 32 * 2);
  txram[0] = tile;
  txram[1] = attr;
  const transparent = new Uint8Array(64).fill(15);
  const visible = new Uint8Array(transparent);
  visible[0] = 1;
  const cache = { txGet: (tileno) => tileno === tile ? visible : transparent };
  const map = buildTxMap(cache, txram);
  const paletteIndex = 0x800 + 13 * 16 + 1;
  assert.equal(map[0], paletteIndex,
    'a nontransparent Continue pen resolves to the palette entry inside TEXT bank 13');

  const ram = new Ram();
  const palette = new PaletteState();
  install2414BE(ram, palette, 13, ROM.bytes(0x222818, 32), 0x288590,
    'the $288574 Continue initializer');
  assert.deepEqual(flush24133C(ram, palette), { spr: false, bg: false, tx: true });
  const rgb = paletteRgb(palette.words);
  assert.notDeepEqual(Array.from(rgb.subarray(paletteIndex * 3, paletteIndex * 3 + 3)), [0, 0, 0],
    'the cartridge palette makes the representative Continue pixel visible');

  for (let index = 0; index < 16; index++) {
    ram.setU16(PALSTAGE.tx.stage + 13 * 32 + index * 2, 0);
  }
  ram.setU16(PALSTAGE.tx.dirty, 1);
  flush24133C(ram, palette);
  const black = paletteRgb(palette.words);
  assert.deepEqual(Array.from(black.subarray(paletteIndex * 3, paletteIndex * 3 + 3)), [0, 0, 0],
    'the same pixel becomes the reported black silhouette when bank 13 is absent');
});

// ===========================================================================
// 2. ENTRY 3's INIT AND ITS BANNER RING
// ===========================================================================

test('W418 entry 3 init: the two word literals fill FOUR byte fields, not two', () => {
  const w = world();
  continueCount28875E(w.ram, ROM, w.ctx, SEL_A);
  assert.equal(w.ram.u16(SEL_A + CONTINUE.fState), 1, '$288766 state := 1');
  // $288778 move.w #$3,($E,A4): counter 0, reload 3. If a port wrote 3 into the COUNTER the
  // banner would first step on frame 4 instead of frame 1 -- section below measures that.
  assert.equal(w.ram.u8(SEL_A + CONTINUE.fBannerPeriod), 3, '($F,A4) reload = 3');
  // $288784 move.w #$1,($12,A4): counter 0, reload 1.
  assert.equal(w.ram.u8(SEL_A + CONTINUE.fDigitPeriod), 1, '($13,A4) reload = 1');
  // BOTH counters start at ZERO, so both borrow on the very first frame and both rings have
  // already stepped once by the time the init frame returns. A port that put the reload in the
  // counter would leave these at 0 here and start the animation four frames late.
  assert.equal(w.ram.u16(SEL_A + CONTINUE.fBannerOff), 4, 'the init frame already stepped it');
  assert.equal(w.ram.u16(SEL_A + CONTINUE.fDigitOff), 4, '...and so did the digit ring');
  assert.equal(w.ram.u8(SEL_A + CONTINUE.fBannerCount), 3, 'reloaded from ($F,A4)');
  assert.equal(w.ram.u8(SEL_A + CONTINUE.fDigitCount), 1, 'reloaded from ($13,A4)');
});

test('W418 $28876C clears ($C,A4) to ZERO, so the init frame itself fires the cue', () => {
  // DIRTY BOTH bytes with the SAME non-zero value. On a fresh Ram they are already equal at 0,
  // so "the cue fired" and "the init seeded ($C,A4) from ($A,A4)" are indistinguishable -- the
  // exact shape W416 and W417 both got caught by. Seeded equal and non-zero, they are not.
  const w = world();
  w.ram.setU8(SEL_A + CONTINUE.fMark, 5);
  w.ram.setU8(SEL_A + CONTINUE.fMarkPrev, 5);
  continueCount28875E(w.ram, ROM, w.ctx, SEL_A);
  assert.deepEqual(w.sounds, [0x28c6ac],
    '$28876C move.b #$0,($C,A4) made 5 a CHANGE against 0, so the panel opens with its cue');
  assert.equal(w.ram.u8(SEL_A + CONTINUE.fMarkPrev), 5, 'and ($C,A4) caught up in the same frame');
  // ...and a mark that really is 0 opens SILENTLY, which is the other half of the same fact.
  const z = world();
  z.ram.setU8(SEL_A + CONTINUE.fMark, 0);
  z.ram.setU8(SEL_A + CONTINUE.fMarkPrev, 7);
  continueCount28875E(z.ram, ROM, z.ctx, SEL_A);
  assert.deepEqual(z.sounds, [], 'mark 0 against the cleared ($C,A4) is not a change');
});

test('W418 entry 3 init erases BOTH text rows and clears record B, absolutely', () => {
  const w = world();
  // Dirty both rows first: a fresh TxVram is blank, so "the row is blank" would pass with or
  // without the erase. Trap 21 -- a test that passes under both readings is evidence for neither.
  for (let c = 0; c < 14; c++) {
    w.tx.setLong(0x904000 + (((1 + c) << 6) + 0x33) * 4, 0xdeadbeef);
    w.tx.setLong(0x904000 + (((0xf + c) << 6) + 0x33) * 4, 0xdeadbeef);
  }
  // Dirty record B's index too -- entry 3 is supposed to clear it and a zeroed Ram cannot show that.
  w.ram.setU16(SEL_B, 0x1234);
  continueCount28875E(w.ram, ROM, w.ctx, SEL_A);
  for (let c = 0; c < 14; c++) {
    assert.equal(w.tx.long(0x904000 + (((1 + c) << 6) + 0x33) * 4), 0xc0200002 >>> 0,
      `row 1 col ${c} is the blank glyph`);
    assert.equal(w.tx.long(0x904000 + (((0xf + c) << 6) + 0x33) * 4), 0xc0200002 >>> 0,
      `row $F col ${c} is the blank glyph`);
  }
  assert.equal(w.ram.u16(SEL_B), 0, '$2887B6 move.w #$0,$81B71C');
});

test('W418 $2887B6 is ABSOLUTE: entry 3 run on record B still clears record B', () => {
  const w = world();
  w.ram.setU16(SEL_A, 0x1111);
  w.ram.setU16(SEL_B, 0x2222);
  continueCount28875E(w.ram, ROM, w.ctx, SEL_B);        // A4 = record B this time
  assert.equal(w.ram.u16(SEL_B), 0, 'B was cleared');
  assert.equal(w.ram.u16(SEL_A), 0x1111, 'and A was NOT -- the write is not ($16,A4)');
  // [M] the encoding: `33FC 0000 0081B71C`, a move.w #imm to an ABSOLUTE LONG.
  if (IMG) {
    assert.equal(u16img(0x2887b6), 0x33fc);
    assert.equal(u16img(0x2887b8), 0x0000);
    assert.equal(u32img(0x2887ba), 0x0081b71c);
  }
});

test('W418 the banner steps every FOURTH frame and walks 17 longs before wrapping', () => {
  const w = world();
  const seen = [];
  for (let f = 0; f < 17 * 4 + 4; f++) {
    arm(w.ram);
    continueCount28875E(w.ram, ROM, w.ctx, SEL_A);
    // The banner is drawn ONLY on the frames it steps: $2887C2 bcc skips read, draw and advance
    // together. Its first cell is $904000 + $400 + $8C.
    const cell = w.ram.u32(HEAD) === (0x904000 + 0x48c) ? w.ram.u32(HEAD + 4) : null;
    if (cell !== null) seen.push(cell >>> 0);
  }
  assert.equal(seen.length, 18, '17 ring entries plus the wrap back to entry 0');
  const want = [];
  for (let i = 0; i < 17; i++) want.push((ROM.u32(0x28886a + i * 4) + 0xc0000000) >>> 0);
  assert.deepEqual(seen.slice(0, 17), want, 'the 17 tiles, in order, off the ROM window');
  assert.equal(seen[17], want[0], 'and then it wraps to entry 0');
  // The 18th long at $2888AE is NEVER read: the wrap fires at $44 and $44/4 = 17.
  assert.equal(w.ram.u16(SEL_A + CONTINUE.fBannerOff) < CONTINUE.bannerWrap, true);
});

test('W418 $2887C2 is bcc ($64) after subq.b -- the no-borrow SKIP', { skip: SKIP_IMG }, () => {
  assert.equal(IMG[0x2887be], 0x53, '$2887BE subq.b #1');
  assert.equal(IMG[0x2887bf], 0x2c, '...on (d16,A4)');
  assert.equal(u16img(0x2887c0), 0x000e, '...($E,A4)');
  assert.equal(IMG[0x2887c2], 0x64, '$2887C2 bcc, NOT $65 bcs and NOT $6C bge');
  assert.equal(u16img(0x2887ee), 0x0c6c, '$2887EE cmpi.w');
  assert.equal(u16img(0x2887f0), 0x0044, '...#$44 -- the ring length, from the cartridge');
});

// ===========================================================================
// 3. ENTRY 3's DIGIT RING AND THE CUE
// ===========================================================================

test('W418 the digit block is drawn EVERY frame and its group is chosen by ($A,A4)', () => {
  for (const mark of [0, 1, 5, 9]) {
    const f = world();
    f.ram.setU8(SEL_A + CONTINUE.fMark, mark);
    f.ram.setU16(SEL_A + CONTINUE.fState, 1);           // past the init
    f.ram.setU8(SEL_A + CONTINUE.fMarkPrev, mark);      // no cue this frame
    f.ram.setU8(SEL_A + CONTINUE.fDigitPeriod, 1);
    f.ram.setU8(SEL_A + CONTINUE.fBannerCount, 3);      // park the banner: it does NOT draw
    continueCount28875E(f.ram, ROM, f.ctx, SEL_A);
    // the digit's first cell: $904000 + $C00 + $74, and it is the FIRST thing in the buffer
    // precisely because the banner skipped -- which is itself the $2887C2 bcc being real.
    assert.equal(f.ram.u32(HEAD), 0x904000 + 0xc74, `mark ${mark}: the digit block was drawn`);
    const group = ROM.u32(0x2888b2 + mark * 4);
    assert.equal(f.ram.u32(HEAD + 4), (ROM.u32(group) + 0xc0000000) >>> 0,
      `mark ${mark}: frame 0 of THAT digit's group`);
    // ...and the ten groups really are ten DIFFERENT pictures, so "chosen by the mark" is a
    // measurement rather than a coincidence of a table full of one value.
    assert.notEqual(ROM.u32(group), ROM.u32(0x2888b2 + ((mark + 1) % 10) * 4));
  }
});

test('W418 the digit ring is three longs and wraps at $C, and $288846 is blt ($6D)', () => {
  const w = world();
  w.ram.setU8(SEL_A + CONTINUE.fMark, 7);
  w.ram.setU16(SEL_A + CONTINUE.fState, 1);
  w.ram.setU8(SEL_A + CONTINUE.fMarkPrev, 7);
  w.ram.setU8(SEL_A + CONTINUE.fDigitPeriod, 1);
  const group = ROM.u32(0x2888b2 + 7 * 4);
  const seen = [];
  for (let f = 0; f < 8; f++) {
    arm(w.ram);
    w.ram.setU8(SEL_A + CONTINUE.fBannerCount, 3);      // park the banner for all eight frames
    continueCount28875E(w.ram, ROM, w.ctx, SEL_A);
    seen.push(w.ram.u32(HEAD + 4) >>> 0);
  }
  const frame = (i) => (ROM.u32(group + i * 4) + 0xc0000000) >>> 0;
  // period 2: the offset advances every OTHER frame, and cycles 0,4,8.
  assert.deepEqual(seen, [frame(0), frame(1), frame(1), frame(2), frame(2),
    frame(0), frame(0), frame(1)]);
  if (IMG) {
    assert.equal(IMG[0x288832], 0x64, '$288832 bcc');
    assert.equal(IMG[0x288846], 0x6d, '$288846 blt -- $6C would be bge and wrap a frame early');
    assert.equal(u16img(0x288840), 0x0c6c);
    assert.equal(u16img(0x288842), 0x000c, 'cmpi.w #$C -- three longs');
  }
});

test('W418 the $28C6AC cue fires on the frame the digit CHANGES and on no other', () => {
  const w = world();
  w.ram.setU16(SEL_A + CONTINUE.fState, 1);
  w.ram.setU8(SEL_A + CONTINUE.fDigitPeriod, 1);
  // DIRTY the previous-mark byte with a DIFFERENT value: a fresh Ram leaves it 0, and 0 is a
  // legal digit, so "the cue fired" would pass under both readings on a zeroed slot.
  w.ram.setU8(SEL_A + CONTINUE.fMarkPrev, 4);
  w.ram.setU8(SEL_A + CONTINUE.fMark, 9);
  continueCount28875E(w.ram, ROM, w.ctx, SEL_A);
  assert.deepEqual(w.sounds, [0x28c6ac], 'changed 4 -> 9: one cue');
  assert.equal(w.ram.u8(SEL_A + CONTINUE.fMarkPrev), 9, 'and ($C,A4) took the new value');
  for (let f = 0; f < 5; f++) {
    arm(w.ram);
    continueCount28875E(w.ram, ROM, w.ctx, SEL_A);
  }
  assert.deepEqual(w.sounds, [0x28c6ac], 'five more frames at the same digit: still ONE cue');
  w.ram.setU8(SEL_A + CONTINUE.fMark, 8);
  arm(w.ram);
  continueCount28875E(w.ram, ROM, w.ctx, SEL_A);
  assert.deepEqual(w.sounds, [0x28c6ac, 0x28c6ac], '9 -> 8: a second cue');
});

// ===========================================================================
// 4. THE OTHER THREE BODIES
// ===========================================================================

test('W418 entry 1 prints " CONTINUE     " at row 1, or row $F when ($4,A4) is set', () => {
  for (const [side, row] of [[0, 1], [1, 0xf]]) {
    const w = world();
    w.ram.setU16(SEL_A + CONTINUE.fSide, side);
    continuePrompt28864C(w.ram, ROM, w.ctx, SEL_A);
    assert.equal(w.ram.u16(SEL_A + CONTINUE.fRow), row, `side ${side}: latched row`);
    assert.equal(w.ram.u16(SEL_A + CONTINUE.fCol), 0x33, `side ${side}: latched column`);
    const at = (c) => w.tx.long(0x904000 + (((row + c) << 6) + 0x33) * 4);
    assert.equal(at(1), (0xc0000000 + 0x430002) >>> 0, "the 'C' of CONTINUE");
    assert.equal(at(8), (0xc0000000 + 0x450002) >>> 0, "...and the 'E'");
    // both TX blocks were cleared once, into the defer buffer
    assert.equal(w.ram.u32(HEAD), 0x904000 + 0x48c, 'the banner block cleared first');
  }
});

test('W418 entry 1 with the menu BUSY blanks its line and RETIRES -- $288652 bcs $28872A', () => {
  const w = world();
  w.ram.setU16(SEL_A, 3);
  w.ram.setU16(CARRY_WORD, 1);                          // $28D53C: carry SET = busy
  continuePrompt28864C(w.ram, ROM, w.ctx, SEL_A);
  assert.equal(w.ram.u16(SEL_A), 0, 'it fell through entry 2 tail $288758 and cleared its index');
  assert.equal(w.tx.long(0x904000 + ((1 << 6) + 0x33) * 4), 0xc0200002 >>> 0, 'blank, not CONTINUE');
  assert.equal(w.ram.u16(SEL_A + CONTINUE.fState), 0, 'and the state was never advanced');
});

test('W418 entry 2 blanks once then retires; entry 4 clears both blocks then retires', () => {
  // BOTH sides, because `$288732 tst.w ($4,A4) / beq` is the only thing choosing the row and a
  // side-0-only test cannot see it get that backwards.
  for (const [side, row, other] of [[0, 1, 0xf], [1, 0xf, 1]]) {
    const w2 = world();
    w2.ram.setU16(SEL_A, 2);
    w2.ram.setU16(SEL_A + CONTINUE.fSide, side);
    w2.tx.setLong(0x904000 + ((row << 6) + 0x33) * 4, 0xdeadbeef);
    w2.tx.setLong(0x904000 + ((other << 6) + 0x33) * 4, 0xdeadbeef);
    continueWipe28871C(w2.ram, ROM, w2.ctx, SEL_A);
    assert.equal(w2.tx.long(0x904000 + ((row << 6) + 0x33) * 4), 0xc0200002 >>> 0,
      `side ${side}: row ${row} was blanked`);
    assert.equal(w2.tx.long(0x904000 + ((other << 6) + 0x33) * 4), 0xdeadbeef,
      `side ${side}: row ${other} was NOT -- entry 2 blanks ONE line, unlike entry 3`);
    assert.equal(w2.ram.u16(SEL_A + CONTINUE.fRow), row, `side ${side}: latched row`);
    assert.equal(w2.ram.u16(SEL_A), 0, '$288758 move.w #$0,(A4)');
    assert.equal(w2.ram.u16(SEL_A + CONTINUE.fState), 1);
  }

  const w4 = world();
  w4.ram.setU16(SEL_A, 4);
  continueClear288952(w4.ram, ROM, w4.ctx, SEL_A);
  flush(w4);
  assert.equal(w4.tx.long(0x904000 + 0x48c), 0xc0000000 >>> 0, 'the banner block is blank tiles');
  assert.equal(w4.tx.long(0x904000 + 0xc74), 0xc0000000 >>> 0, 'and so is the digit block');
  assert.equal(w4.ram.u16(SEL_A), 0, '$288984 move.w #$0,(A4)');
});

test('W418 entry 1 and entry 4 clear EXACTLY the two rectangles entry 3 draws into',
  { skip: SKIP_IMG }, () => {
  // The pairing is a measurement: the same four registers at four sites.
  for (const site of [0x28866a, 0x288960]) {            // entry 1's / entry 4's banner clear
    assert.equal(u32img(site), 0x303c008c, 'move.w #$8C,D0');
    assert.equal(u32img(site + 4), 0x323c0400, 'move.w #$400,D1');
    assert.equal(u16img(site + 8), 0x7403, 'moveq #3,D2');
    assert.equal(u16img(site + 10), 0x7613, 'moveq #$13,D3');
  }
  for (const site of [0x28867c, 0x288972]) {            // ...and the digit clear
    assert.equal(u32img(site), 0x303c0074, 'move.w #$74,D0');
    assert.equal(u32img(site + 4), 0x323c0c00, 'move.w #$C00,D1');
    assert.equal(u16img(site + 8), 0x7407, 'moveq #7,D2');
    assert.equal(u16img(site + 10), 0x7603, 'moveq #3,D3');
  }
  // and entry 3's two draws use the same D0/D1/D2/D3 pairs
  assert.equal(u32img(0x2887d8), 0x303c008c);
  assert.equal(u32img(0x288818), 0x303c0074);
});

// ===========================================================================
// 5. `$23C796`, THE COIN EDGE DETECTOR, OVER ITS WHOLE DOMAIN
// ===========================================================================

test('W418 $23C796 is an edge detector WITH side effects, not a pure predicate', () => {
  const ram = new Ram(new Uint8Array(0x20000));
  assert.equal(coinChanged23C796(ram, 0), false, 'all zero: nothing moved');
  ram.setU8(0x803958, 3);                                // a coin arrives
  assert.equal(coinChanged23C796(ram, 0), true);
  assert.equal(ram.u8(0x80395b), 3, 'the snapshot was overwritten as it answered');
  assert.equal(coinChanged23C796(ram, 0), false, 'and the SECOND call answers false');
  ram.setU8(0x80395a, 1);                                // a credit arrives
  assert.equal(coinChanged23C796(ram, 0), true);
  assert.equal(ram.u8(0x80395c), 1);
  assert.equal(coinChanged23C796(ram, 0), false);
});

test('W418 $23C796 side 1 watches P1s counters unless $80380B says SEPARATE', () => {
  const shared = new Ram(new Uint8Array(0x20000));
  shared.setU8(0x80380b, 0);                             // SHARED pool
  shared.setU8(0x80395e, 9);                             // P2's own coin byte moves...
  assert.equal(coinChanged23C796(shared, 1), false, '...and side 1 does not see it');
  shared.setU8(0x803958, 9);                             // P1's does...
  assert.equal(coinChanged23C796(shared, 1), true, '...and side 1 DOES see that');

  // the CREDIT arm has the same shape and its own dip test at $23C808, so it gets its own case:
  // with the coin bytes settled, only the credit half can answer.
  shared.setU8(0x803960, 4);                             // P2's credit byte moves...
  assert.equal(coinChanged23C796(shared, 1), false, '...and side 1 does not see it either');
  shared.setU8(0x80395a, 4);                             // P1's does...
  assert.equal(coinChanged23C796(shared, 1), true, '...and side 1 DOES');
  assert.equal(shared.u8(0x803962), 4, 'into side 1s OWN credit snapshot');

  const sep = new Ram(new Uint8Array(0x20000));
  sep.setU8(0x80380b, 1);                                // SEPARATE pools
  sep.setU8(0x803958, 9);
  assert.equal(coinChanged23C796(sep, 1), false, 'now P1s byte is invisible to side 1');
  sep.setU8(0x80395e, 9);
  assert.equal(coinChanged23C796(sep, 1), true);
  assert.equal(sep.u8(0x803961), 9, 'and side 1 keeps its OWN snapshot byte');
  sep.setU8(0x80395a, 4);
  assert.equal(coinChanged23C796(sep, 1), false, 'P1s credit is invisible too');
  sep.setU8(0x803960, 4);
  assert.equal(coinChanged23C796(sep, 1), true);
});

test('W418 $23C796 answers with the carry the way $28D53C does', { skip: SKIP_IMG }, () => {
  assert.equal(u32img(0x23c82c), 0x007c0001, '$23C82C ori.w #$1,SR -- TRUE');
  assert.equal(u16img(0x23c830), 0x4e75);
  assert.equal(u32img(0x23c832), 0x027cfffe, '$23C832 andi.w #$FFFE,SR -- FALSE');
  assert.equal(u16img(0x23c836), 0x4e75);
  // and $288B82 takes the FALSE arm forward: `64` = bcc = "no change, skip the re-stamp".
  assert.equal(IMG[0x288b82], 0x64);
  assert.equal(u32img(0x288b7c), 0x4eb90023, '$288B7C jsr $23C796');
  assert.equal(u16img(0x288b80), 0xc796);
});

// ===========================================================================
// 6. THE COUNTDOWN -- objslot13.js `$288B00..$288BAC`, WHICH HAD NEVER RUN
// ===========================================================================

/** Slot [13] in state 1, side 0, run gate OPEN, descriptor installed, latch already set so the
 *  body walks straight to `$288B00`. This is the state a real continue screen sits in. */
function slot13(open = true) {
  const w = world();
  const a5 = 0x80e240;
  w.ram.setU8(a5 + SCREEN13.state, 1);
  w.ram.setU8(a5 + SCREEN13.side, 0);
  w.ram.setU32(a5 + SCREEN13.desc, SCREEN13.descA);
  w.ram.setU8(a5 + SCREEN13.latch, 1);                   // past $288AB0's one-shot
  w.ram.setU8(0x803809, 1);                              // the operator DIP: non-zero lets it run
  w.ram.setU16(0x813098, 0);                             // gateA closed -> not the exit arm
  w.ram.setU16(RUN_A, 0);
  w.ram.setU16(RUN_B, open ? 0xffff : 0);                // $25FE00
  w.ram.setU16(CARRY_WORD, 0);                           // $28D53C: not busy
  return { ...w, a5 };
}

test('W418 slot [13] state 1 reaches $288B00 at all -- it did not before this wave', () => {
  const w = slot13();
  // $2889CC's stamp: the seconds AND the frame tick, from one word literal.
  w.ram.setU16(w.a5 + SCREEN13.mark, SCREEN13.markValue);
  assert.equal(w.ram.u8(w.a5 + SCREEN13.mark), 9);
  assert.equal(w.ram.u8(w.a5 + SCREEN13.frameTick), 0x3c);
  objSlot13(w.ram, ROM, w.a5, w.ctx);
  assert.equal(w.ram.u8(w.a5 + SCREEN13.frameTick), 0x3b,
    '$288B3C ran: the frame tick moved. Before W418 this stayed $3C forever.');
});

test('W418 the countdown is 61 frames a second and nine seconds end to end', () => {
  const w = slot13();
  w.ram.setU16(w.a5 + SCREEN13.mark, SCREEN13.markValue);
  const marks = [];
  let last = 9;
  for (let f = 0; f < 61 * 10; f++) {
    objSlot13(w.ram, ROM, w.a5, w.ctx);
    const m = w.ram.u8(w.a5 + SCREEN13.mark);
    if (m !== last) { marks.push([f, m]); last = m; }
    if (w.ram.u8(w.a5 + SCREEN13.state) !== 1) break;
  }
  assert.deepEqual(marks.map(([, m]) => m), [8, 7, 6, 5, 4, 3, 2, 1, 0, 0xff],
    'nine ticks and then the borrow that ends it');
  const gaps = marks.slice(1).map(([f], i) => f - marks[i][0]);
  assert.deepEqual(gaps, [61, 61, 61, 61, 61, 61, 61, 61, 61],
    '$3C reload plus the borrow frame = 61, on every step');
});

test('W418 the countdown running out takes $288B52 and advances the state THIS frame', () => {
  const w = slot13(true);                                // run gate OPEN -> state 4
  w.ram.setU16(0x80e240, 0x800d);                        // the slot's own type word, so the wipe shows
  w.ram.setU8(w.a5 + SCREEN13.mark, 0);
  w.ram.setU8(w.a5 + SCREEN13.frameTick, 0);
  objSlot13(w.ram, ROM, w.a5, w.ctx);
  // $288B62 sets state 4 and $288B68 bra $288A3C runs state 4's body immediately: $24107C wipes
  // the whole object table, so the slot's own type word is gone in the SAME frame. Before W418
  // exitArm only set the state byte, deferring all of that by one frame.
  assert.equal(w.ram.u16(0x80e240), 0, 'the object table was cleared by $24107C');
});

test('W418 the CLOSED-gate exit ($288B6C) sets 3 then 2 and runs state 2 in the same frame', () => {
  // The countdown cannot reach this arm: `$288AA6` and `$288B58` read the SAME two words with no
  // writer between them, so a frame that got as far as `$288B00` always finds the gate open at
  // `$288B58` too (see the dead-arm test below). The reachable route is `$288A96`'s gate pair.
  const c = slot13(false);
  c.ram.setU16(0x813098, 1);                             // gateA open...
  c.ram.setU16(0x813092, SCREEN13.gateBValue);           // ...and gateB is $4 -> $288A96 beq $288B52
  c.ram.setU32(0x80e240 + SCREEN13.idAt, 0x00000001);
  objSlot13(c.ram, ROM, c.a5, c.ctx);
  assert.equal(c.ram.u8(c.a5 + SCREEN13.state), 2,
    '$288B6C sets 3 and $288B72 bra $288A22 sets 2 in the same frame');
  assert.equal(c.ram.u8(c.a5 + SCREEN13.mark), 9, '...and $288A28 bsr $2889CC re-stamped');
});

test('W418 $288B36 and $288BA2 are UNREACHABLE from state 1, and that is the cartridge', () => {
  // Both are the run-gate-CLOSED arms of `$288B1E` and `$288B90`. To reach either, the frame must
  // already have passed `$288AA6 jsr $25FE00 / $288AAC bcc`, which reads the same `$813142` and
  // `$81308E`. Nothing on the path between writes either word: `readInput23D186` only reads,
  // `armRequest25FF38` writes $8130FA/$81311E, `coinChanged23C796` writes $80395B/$80395C/
  // $803961/$803962, `stampMark2889CC` writes ($4,A5)/($5,A5)/$81B710, and `bgPause25FD82` writes
  // $8130D2. They are transcribed because the cartridge has them, and NAMED here rather than
  // faked with a scenario the state machine cannot produce.
  const w = slot13(true);
  const before = [w.ram.u16(RUN_A), w.ram.u16(RUN_B)];
  w.ram.setU16(P1EDGE, 0x10);
  w.ram.setU8(0x803958, 1);                              // force the coin arm too
  objSlot13(w.ram, ROM, w.a5, w.ctx);
  assert.deepEqual([w.ram.u16(RUN_A), w.ram.u16(RUN_B)], before,
    'a whole frame of the arm left both $25FE00 words untouched');
});

test('W418 a coin inserted mid-countdown RE-STAMPS the nine seconds', () => {
  const w = slot13();
  w.ram.setU8(w.a5 + SCREEN13.mark, 4);
  w.ram.setU8(w.a5 + SCREEN13.frameTick, 0x20);
  objSlot13(w.ram, ROM, w.a5, w.ctx);
  assert.equal(w.ram.u8(w.a5 + SCREEN13.mark), 4, 'no coin: nothing re-stamped');
  w.ram.setU8(0x803958, 1);                              // a coin lands
  objSlot13(w.ram, ROM, w.a5, w.ctx);
  assert.equal(w.ram.u8(w.a5 + SCREEN13.mark), 9, '$288B86 bsr $2889CC put it back to nine');
  assert.equal(w.ram.u8(w.a5 + SCREEN13.frameTick), 0x3c);
});

test('W418 the tail publishes the digit through the ABSOLUTE $81B710, on EITHER side', () => {
  const open = slot13(true);
  open.ram.setU8(open.a5 + SCREEN13.mark, 6);
  open.ram.setU8(open.a5 + SCREEN13.frameTick, 0x20);
  // Dirty the sink: a fresh Ram leaves it 0, and 0 is a legal digit, so a zeroed slot could not
  // separate "the write happened" from "the write never happened".
  open.ram.setU8(SCREEN13.markSinkA, 0xaa);
  objSlot13(open.ram, ROM, open.a5, open.ctx);
  assert.equal(open.ram.u8(SCREEN13.markSinkA), 6, '$288B98 move.b D0,$81B710');

  // SIDE 1 goes to the SAME absolute address. `$288B98` is `13C0 0081B710`, not `(A0)`, so a
  // side-1 continue screen publishes into side 0's block -- the cross-side shape
  // `selectAdvance2885C6` documents at $2885FA, and a rewrite through ($10,A4) would lose it.
  const one = slot13(true);
  one.ram.setU8(one.a5 + SCREEN13.side, 1);
  one.ram.setU32(one.a5 + SCREEN13.desc, SCREEN13.descB);
  one.ram.setU8(one.a5 + SCREEN13.mark, 6);
  one.ram.setU8(one.a5 + SCREEN13.frameTick, 0x20);
  one.ram.setU8(SCREEN13.markSinkA, 0xaa);
  one.ram.setU8(ROM.u32(SCREEN13.descB + SCREEN13.dRam), 0xbb);
  objSlot13(one.ram, ROM, one.a5, one.ctx);
  assert.equal(one.ram.u8(SCREEN13.markSinkA), 6, 'side 1 wrote SIDE 0s block');
  assert.equal(one.ram.u8(ROM.u32(SCREEN13.descB + SCREEN13.dRam)), 0xbb,
    '...and its own block was left alone');
  if (IMG) {
    assert.equal(u16img(0x288b98), 0x13c0, '$288B98 move.b D0,(xxx).L');
    assert.equal(u32img(0x288b9a), 0x0081b710);
  }
});

test('W418 $288B06 is bcs: a BUSY menu abandons the arm, and the countdown does not move', () => {
  const w = slot13();
  w.ram.setU16(w.a5 + SCREEN13.mark, SCREEN13.markValue);
  w.ram.setU16(CARRY_WORD, 1);                           // $81DF20 non-zero -> carry SET -> rts
  objSlot13(w.ram, ROM, w.a5, w.ctx);
  assert.equal(w.ram.u8(w.a5 + SCREEN13.frameTick), 0x3c, 'the tick did NOT move');
  w.ram.setU16(CARRY_WORD, 0);
  objSlot13(w.ram, ROM, w.a5, w.ctx);
  assert.equal(w.ram.u8(w.a5 + SCREEN13.frameTick), 0x3b, '...and it does when the menu is free');
  if (IMG) assert.equal(IMG[0x288b06], 0x65, '$288B06 bcs, not bcc');
});

test('W418 pressing the button arms request 8 -- and the countdown keeps running anyway', () => {
  const press = slot13(true);
  press.ram.setU8(press.a5 + SCREEN13.frameTick, 0x20);
  press.ram.setU16(P1EDGE, 0x10);                        // one of $70's three bits
  objSlot13(press.ram, ROM, press.a5, press.ctx);
  assert.equal(press.ram.u16(0x8130fa), 8, '$25FF38 armed request 8 for side 0');
  // $288B32 is a `bra`, not an `rts`: the tick still moves on the frame the button is pressed.
  assert.equal(press.ram.u8(press.a5 + SCREEN13.frameTick), 0x1f);

  const idle = slot13(true);
  idle.ram.setU8(idle.a5 + SCREEN13.frameTick, 0x20);
  idle.ram.setU16(P1EDGE, 0x01);                         // outside the $70 mask
  objSlot13(idle.ram, ROM, idle.a5, idle.ctx);
  assert.equal(idle.ram.u16(0x8130fa), 0, 'a bit outside $70 arms nothing');
  assert.equal(idle.ram.u8(idle.a5 + SCREEN13.frameTick), 0x1f, '...and the tick still moves');
});

test('W418 $288B40 and $288B4E are bge ($6C), signed, on BYTES', { skip: SKIP_IMG }, () => {
  assert.equal(u16img(0x288b3c), 0x532d, '$288B3C subq.b #1,(d16,A5)');
  assert.equal(u16img(0x288b3e), 0x0005, '...($5,A5)');
  assert.equal(IMG[0x288b40], 0x6c, '$288B40 bge -- $64 bcc would be a different flag');
  assert.equal(u16img(0x288b44), 0x1b7c);
  // move.b #imm takes a WORD of immediate with the byte in the LOW half, so the $3C is at +3.
  assert.equal(u16img(0x288b46), 0x003c, 'move.b #$3C -- markValue $093C is LOW byte');
  assert.equal(u16img(0x288b48), 0x0005, '...into ($5,A5)');
  assert.equal(u16img(0x288b4a), 0x532d);
  assert.equal(u16img(0x288b4c), 0x0004, '...($4,A5), the seconds');
  assert.equal(IMG[0x288b4e], 0x6c);
  assert.equal(SCREEN13.markValue, 0x093c);
  assert.equal(SCREEN13.tickReload, 0x3c);
});

test('W418 $288B14 and $288B1E are NOT returns -- they branch INTO the countdown',
  { skip: SKIP_IMG }, () => {
  // The reading that cost this port the whole arm: three "return"s where the ROM has three
  // branches, two of which land past the input handling and one of which lands on the rts.
  assert.equal(IMG[0x288b14], 0x67, '$288B14 beq.w');
  assert.equal(0x288b16 + u16img(0x288b16), 0x288b3c, '...to the frame tick');
  assert.equal(IMG[0x288b1e], 0x64, '$288B1E bcc.w');
  assert.equal(0x288b20 + u16img(0x288b20), 0x288b36, '...to the tick RESET');
  assert.equal(0x288b08 + u16img(0x288b08), 0x288bac, '$288B06 bcs to the rts');
  assert.equal(u16img(0x288bac), 0x4e75);
  assert.equal(0x288b34 + u16img(0x288b34), 0x288b3c, '$288B32 bra past the reset');
});
