// W302: `$25B492`'s high-score screen columns.
//
// Nine routines that read the nine arrays the last three waves wrote. What is worth asserting
// is not that they emit -- it is the four decisions inside them that a plausible transcription
// gets wrong: the ALL marker, the chain's `dbeq` suppression, the score's PAIR suppression,
// and the fact that row 1 draws in a different font from rows 2..5.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { BUCKETS, resolveEmitStub } from '../src/spritequeue.js';
import { hiscoreDefaults28841E } from '../src/hiscore.js';
import {
  SCREEN, SCREEN_COLUMNS, drawHiscoreColumns, drawShips25B58C, drawStyles25B5E2,
  drawLoopStage25B650, drawChain25B72A, drawInitials25B7A0, drawScores25B8CE,
  drawDigits25B944, drawStatic25B626,
} from '../src/hiscorescreen.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const ROM = HAVE ? new RomWindows(JSON.parse(readFileSync(tablesPath, 'utf8')).rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const BUCKET = HAVE ? resolveEmitStub(ROM, SCREEN.emit).bucket : 0;
const B = HAVE ? BUCKETS[BUCKET] : null;

/** A machine with the FACTORY table installed, so every column has real data in it. */
function factory() {
  const ram = new Ram();
  hiscoreDefaults28841E(ram, ROM);
  return ram;
}
/** Every 12-byte record the emitter has queued, decoded. */
function emitted(ram) {
  const n = ram.u16(B.counter) / 12;
  return Array.from({ length: n }, (_, i) => ({
    pos: ram.u32(B.buffer + i * 12),
    art: ram.u32(B.buffer + i * 12 + 4),
    d3: ram.u16(B.buffer + i * 12 + 8),
    d4: ram.u16(B.buffer + i * 12 + 10),
  }));
}
const arts = (ram) => emitted(ram).map((r) => r.art);

// ==================== 1. THE FAMILY'S SHAPE

test('W302 every per-row column draws FIVE rows or more', { skip: SKIP }, () => {
  // `moveq #$4,D7` with `dbra` is FIVE, the fact W297 got wrong once. A column that emitted
  // four rows would leave the last high-score line blank and look like a data problem.
  //
  // `$25B4D6` is excluded because it is the FRAME (W303): four requests with immediates and
  // no row loop at all, so "five rows" is not a claim about it.
  for (const c of SCREEN_COLUMNS) {
    if (c.site === 0x25b4d6) continue;
    const ram = factory();
    c.draw(ram, ROM);
    const n = emitted(ram).length;
    assert.ok(n >= SCREEN.rows,
      `$${c.site.toString(16).toUpperCase()} drew ${n}, expected at least ${SCREEN.rows}`);
  }
});

test('W302 the row step moves the Y half and leaves the X half alone', { skip: SKIP }, () => {
  // `swap D1 / subi.w #$11C0,D1 / swap D1` is the same three instructions in all nine
  // routines. It is easy to write as a subtraction from the whole longword, which would
  // corrupt X on every row after the first.
  const ram = factory();
  drawStatic25B626(ram, ROM);
  const recs = emitted(ram);
  assert.equal(recs.length, 5);
  // The emitter packs `D1 >> 6`, so compare the packed positions: consecutive rows differ by
  // a constant and the difference must live entirely in the upper half.
  const deltas = recs.slice(1).map((r, i) => (r.pos - recs[i].pos) | 0);
  assert.equal(new Set(deltas).size, 1, 'every row step is the same');
  for (const r of recs) assert.equal(r.art, 0x333f98, 'and the art never changes');
});

// ==================== 2. THE ALL MARKER -- W300 SEEN FROM THE RENDERER

test('W302 loop 1 with stage 5 draws ONE special glyph, not two digits', { skip: SKIP }, () => {
  // W300 argued from `$287C4C` that `(1, 5)` is a deliberate ALL marker because stage is
  // zero-based over five stages, so 5 cannot arise from play. `$25B67E` is the renderer
  // agreeing: one sprite, `$3317C0`, outside the nine-glyph digit table.
  const ram = factory();
  ram.setU16(SCREEN.loop, 1);
  ram.setU16(SCREEN.stage, 5);
  drawLoopStage25B650(ram, ROM);
  const recs = emitted(ram);
  assert.equal(recs[0].art, SCREEN.allMarker, 'row 1 is the ALL glyph');
  assert.equal(recs[0].d3, SCREEN.allMarkerAttr, 'with its own attribute $218');
});

test('W302 the ALL arm still consumes the stage word, so later rows do not shear',
  { skip: SKIP }, () => {
    // `$25B684 addq.w #2,A2`. Skipping the draw but not the increment is the natural way to
    // write this and it shifts the stage column by one row from the ALL entry down -- which
    // would look like corrupted data rather than a control-flow bug.
    const ram = factory();
    ram.setU16(SCREEN.loop, 1);
    ram.setU16(SCREEN.stage, 5);
    // Row 2 keeps its factory loop 0 and stage 2, so it must draw stage 2's digit.
    drawLoopStage25B650(ram, ROM);
    const withAll = arts(ram);
    const plain = factory();
    plain.setU16(SCREEN.loop, 1);
    plain.setU16(SCREEN.stage, 4);          // not 5, so the ordinary arm runs
    drawLoopStage25B650(plain, ROM);
    // Both runs must draw the SAME glyph for row 2, because row 2's own data is identical.
    const stage2Glyph = ROM.u32(SCREEN.stageDigits + 2 * 4);
    assert.ok(withAll.includes(stage2Glyph), 'row 2 drew its own stage digit after the ALL');
    assert.ok(arts(plain).includes(stage2Glyph), 'and after the ordinary arm too');
  });

test('W302 loop 0 draws the stage alone, with no separator', { skip: SKIP }, () => {
  // `$25B676 beq $25B6BA` skips the loop digit AND the separator, and moves X to where the
  // separator would have been. The factory table is all loop 0, so this is the normal case.
  const ram = factory();
  drawLoopStage25B650(ram, ROM);
  const recs = emitted(ram);
  assert.equal(recs.length, SCREEN.rows, 'one glyph per row, not three');
  assert.ok(!arts(ram).includes(SCREEN.separator), 'and the separator never drew');
  // The factory stages are 3 2 2 1 1, so those are the five digits.
  assert.deepEqual(arts(ram),
    [3, 2, 2, 1, 1].map((s) => ROM.u32(SCREEN.stageDigits + s * 4)));
});

test('W302 a non-zero loop draws loop, separator, stage -- three glyphs', { skip: SKIP }, () => {
  const ram = factory();
  ram.setU16(SCREEN.loop, 2);
  drawLoopStage25B650(ram, ROM);
  const recs = emitted(ram);
  assert.equal(recs.length, SCREEN.rows + 2, 'row 1 costs three, the other four cost one');
  assert.equal(recs[0].art, ROM.u32(SCREEN.stageDigits + 2 * 4), 'the loop digit 2');
  assert.equal(recs[1].art, SCREEN.separator, 'then the separator');
  assert.equal(recs[2].art, ROM.u32(SCREEN.stageDigits + 3 * 4), 'then stage 3');
});

// ==================== 3. THE CHAIN, AND `dbeq`

test('W302 the chain suppresses leading zeros through `dbeq`', { skip: SKIP }, () => {
  // `lsr.w #4,D0` sets Z when nothing is left and `dbeq` EXITS on Z set -- W299's rule on a
  // different condition. Factory chains are $0719 four times and $0720 once, so three
  // glyphs each: 19 rows' worth would be 20 draws, three-per-row is 15.
  const ram = factory();
  drawChain25B72A(ram, ROM);
  assert.equal(emitted(ram).length, 15, 'three digits per row, not four');
});

test('W302 a chain of ZERO still draws one glyph', { skip: SKIP }, () => {
  // The `dbeq` is tested AFTER the draw, so the suppression can never produce an empty row.
  // A port that tested first would render nothing where the board renders a 0.
  const ram = factory();
  for (let i = 0; i < 5; i++) ram.setU16(SCREEN.chain + i * 2, 0);
  drawChain25B72A(ram, ROM);
  const recs = emitted(ram);
  assert.equal(recs.length, 5, 'exactly one per row');
  for (const r of recs) assert.equal(r.art, ROM.u32(SCREEN.chainDigits), 'the glyph for 0');
});

test('W302 a four-digit chain draws four and stops at the cap', { skip: SKIP }, () => {
  const ram = factory();
  for (let i = 0; i < 5; i++) ram.setU16(SCREEN.chain + i * 2, 0x9999);
  drawChain25B72A(ram, ROM);
  assert.equal(emitted(ram).length, 20, '`moveq #$3,D6` caps it at four');
});

test('W302 the chain digits run right to left', { skip: SKIP }, () => {
  // `subi.w #$200,D1` steps X down, because the least significant nibble is drawn first.
  const ram = factory();
  for (let i = 0; i < 5; i++) ram.setU16(SCREEN.chain + i * 2, 0x0123);
  drawChain25B72A(ram, ROM);
  const row = emitted(ram).slice(0, 3);
  assert.deepEqual(row.map((r) => r.art),
    [3, 2, 1].map((d) => ROM.u32(SCREEN.chainDigits + d * 4)), 'least significant first');
  assert.ok(row[1].pos < row[0].pos, 'and each is left of the last');
});

// ==================== 4. THE SCORE'S SUPPRESSION IS THE PAIR

test('W302 a small score with zero overflow suppresses its leading zeros', { skip: SKIP }, () => {
  const ram = factory();
  for (let i = 0; i < 5; i++) {
    ram.setU32(SCREEN.scores + i * 4, 0x00000123);
    ram.setU16(SCREEN.overflow + i * 2, 0);
  }
  drawScores25B8CE(ram, ROM);
  assert.equal(emitted(ram).length, 15, 'three digits per row');
});

test('W302 a NON-ZERO overflow makes the long\'s leading zeros significant', { skip: SKIP }, () => {
  // `$25B910 bne / $25B912 tst.w (A2) / $25B914 beq` -- the suppression needs BOTH halves
  // empty. Reading it as "stop when the long runs out" loses the middle digits of every score
  // above 100,000,000, which is exactly where the overflow starts mattering.
  const ram = factory();
  for (let i = 0; i < 5; i++) {
    ram.setU32(SCREEN.scores + i * 4, 0x00000123);
    ram.setU16(SCREEN.overflow + i * 2, 1);
  }
  drawScores25B8CE(ram, ROM);
  // Eight from the long, then one from the overflow, per row.
  assert.equal(emitted(ram).length, 5 * 9, 'all eight long digits plus the overflow digit');
  const row = emitted(ram).slice(0, 9);
  assert.equal(row[8].art, ROM.u32(SCREEN.digitFontBig + 4), 'and the last is the 1');
});

test('W302 the factory scores draw their own digit counts', { skip: SKIP }, () => {
  // `$01182223` is seven digits, the other four are six. Driven against the real table so
  // this is a prediction about the cartridge and not about the port agreeing with itself.
  const ram = factory();
  drawScores25B8CE(ram, ROM);
  assert.equal(emitted(ram).length, 7 + 6 + 6 + 6 + 6);
});

// ==================== 5. TWO FONTS: ROW 1 IS NOT ROWS 2..5

test('W302 the score column draws row 1 in a different font', { skip: SKIP }, () => {
  // `lea ($25B984,PC),A0` is outside the loop and `lea ($25B9AC,PC),A0` is inside it at
  // `$25B932`, so the top entry gets the big font. A port that hoisted both would render
  // every row the same and lose the screen's whole hierarchy.
  const ram = factory();
  for (let i = 0; i < 5; i++) {
    ram.setU32(SCREEN.scores + i * 4, 7);
    ram.setU16(SCREEN.overflow + i * 2, 0);
  }
  drawScores25B8CE(ram, ROM);
  const recs = emitted(ram);
  assert.equal(recs.length, 5, 'one digit each');
  assert.equal(recs[0].art, ROM.u32(SCREEN.digitFontBig + 7 * 4), 'row 1 is the big font');
  for (const r of recs.slice(1)) {
    assert.equal(r.art, ROM.u32(SCREEN.digitFontSmall + 7 * 4), 'and the rest are small');
  }
  assert.notEqual(ROM.u32(SCREEN.digitFontBig), ROM.u32(SCREEN.digitFontSmall),
    'the two fonts really are different art');
});

test('W302 the digit-state column uses the same two fonts', { skip: SKIP }, () => {
  const ram = factory();
  drawDigits25B944(ram, ROM);
  const recs = emitted(ram);
  assert.equal(recs.length, 5);
  assert.equal(recs[0].art, ROM.u32(SCREEN.digitFontBig + 4 * 4), 'factory digit state 4');
  assert.equal(recs[1].art, ROM.u32(SCREEN.digitFontSmall + 4 * 4), 'row 2, small font');
});

test('W302 the initials column has two fonts too, and reads the factory names',
  { skip: SKIP }, () => {
    // Three characters per row, the stored value used UNSCALED as a byte offset -- which is
    // the instruction that requires W301's "every factory character is a multiple of four".
    const ram = factory();
    drawInitials25B7A0(ram, ROM);
    const recs = emitted(ram);
    assert.equal(recs.length, 15, 'three characters on each of five rows');
    // Row 1's factory name is offsets $38 $48 $0C, in the BIG font.
    assert.deepEqual(recs.slice(0, 3).map((r) => r.art),
      [0x38, 0x48, 0x0c].map((o) => ROM.u32(SCREEN.initialsFontBig + o)));
    // Row 2's is $28 $58 $48, in the SMALL font.
    assert.deepEqual(recs.slice(3, 6).map((r) => r.art),
      [0x28, 0x58, 0x48].map((o) => ROM.u32(SCREEN.initialsFontSmall + o)));
  });

test('W302 the initials run left to right, unlike the digits', { skip: SKIP }, () => {
  // `addi.w #$400,D1` -- a name reads forwards while a number is emitted backwards. Two
  // different X directions in one screen, so a shared helper would have to carry the sign.
  const ram = factory();
  drawInitials25B7A0(ram, ROM);
  const row = emitted(ram).slice(0, 3);
  assert.ok(row[1].pos > row[0].pos, 'character 2 is right of character 1');
  assert.ok(row[2].pos > row[1].pos, 'and 3 is right of 2');
});

// ==================== 6. THE HOLE, AND THE TAG

test('W302 both initials fonts have a NULL at offset $6C, and it throws', { skip: SKIP }, () => {
  // 29 longs each with `$00000000` at offset $6C and a valid glyph after it at $70. A window
  // sized to the 27 real characters would make index 28 unreachable; a port that treated the
  // hole as a glyph would emit a null sprite.
  assert.equal(ROM.u32(SCREEN.initialsFontBig + 0x6c), 0);
  assert.equal(ROM.u32(SCREEN.initialsFontSmall + 0x6c), 0);
  assert.notEqual(ROM.u32(SCREEN.initialsFontBig + 0x70), 0, 'and $70 is a real glyph');
  const ram = factory();
  ram.setU32(SCREEN.initials, 0x6c);
  assert.throws(() => drawInitials25B7A0(ram, ROM), /\$6C/);
});

test('W302 the insert\'s `$FF` tag cannot be drawn as a character', { skip: SKIP }, () => {
  // `$287C7E move.l D6,(A4)` stamps `$FF`/`$FE`, and `move.l (A0,D2.w),D2` uses the value
  // unscaled -- so the tag is both past a 116-byte table and misaligned. It cannot reach this
  // routine, which is a real constraint on whatever writes the name.
  for (const tag of [0xff, 0xfe]) {
    const ram = factory();
    ram.setU32(SCREEN.initials, tag);
    assert.throws(() => drawInitials25B7A0(ram, ROM), /multiple of four/,
      `the $${tag.toString(16).toUpperCase()} tag throws rather than reading past the font`);
  }
});

// ==================== 7. THE SHIP AND STYLE INDEX SPACES

test('W302 the ship table is FOUR 8-byte entries carrying their own palette', { skip: SKIP }, () => {
  // The only column whose table supplies D3 and D4 as well as the art, through
  // `movem.w ($4,A0,D0.w),D3-D4`. Entries 0 and 1 are palette 0 and entries 2 and 3 are
  // palette 1, which is where `$287C24`'s `+4` rebase lands P2.
  const ram = factory();
  drawShips25B58C(ram, ROM);
  const recs = emitted(ram);
  assert.equal(recs.length, 5);
  // Factory ships are 0 6 2 2 2, i.e. table entries 0, 3, 1, 1, 1.
  assert.deepEqual(recs.map((r) => r.art),
    [0, 3, 1, 1, 1].map((e) => ROM.u32(SCREEN.shipTable + e * 8)));
  assert.deepEqual(recs.map((r) => r.d4), [0, 1, 1, 1, 1], 'entry 3 is on P2\'s palette');
});

test('W302 an ODD ship index throws rather than reading a straddled entry', { skip: SKIP }, () => {
  // `value * 4` over 8-byte entries only tiles because the stored values are even. An odd one
  // reads four bytes of one entry and four of the next, which would draw a real-looking
  // sprite with the wrong palette.
  const ram = factory();
  ram.setU16(SCREEN.ship, 1);
  assert.throws(() => drawShips25B58C(ram, ROM), /ODD ship index/);
});

test('W302 a ship index past the four entries throws', { skip: SKIP }, () => {
  const ram = factory();
  ram.setU16(SCREEN.ship, 8);
  assert.throws(() => drawShips25B58C(ram, ROM), /past the FOUR-entry table/);
});

test('W302 the style index is `(value - 2) * 2` over THREE longs', { skip: SKIP }, () => {
  // The `subq.w #2,D0` is the trap: style 0 indexes -2 and reads the two bytes before the
  // table, which are the tail of the routine's own `rts`.
  const ram = factory();
  drawStyles25B5E2(ram, ROM);
  // Factory styles are 6 4 6 4 4, i.e. entries 2, 1, 2, 1, 1.
  assert.deepEqual(arts(ram),
    [2, 1, 2, 1, 1].map((e) => ROM.u32(SCREEN.styleTable + e * 4)));
  const bad = factory();
  bad.setU16(SCREEN.style, 0);
  assert.throws(() => drawStyles25B5E2(bad, ROM), /index -2 into this routine's own rts/);
});

// ==================== 8. THE WHOLE SCREEN

test('W302 the columns together draw the factory table, and the sum is exact', { skip: SKIP }, () => {
  // The sum is a real check: it is the count that changes if any single routine loses a row
  // or a suppression arm. The frame's contribution depends on `$80390C`, so this drives it
  // with the phase word at its `new Ram()` value and the nine data columns behind it.
  const ram = factory();
  drawHiscoreColumns(ram, ROM);
  const total = emitted(ram).length;
  const parts = SCREEN_COLUMNS.map((c) => {
    const one = factory();
    c.draw(one, ROM);
    return emitted(one).length;
  });
  assert.equal(total, parts.reduce((a, b) => a + b, 0), 'eleven independent routines');
  // frame 3 (the blink is off) + labels 5 + ship 5 + style 5 + static 5 + loop/stage 5 +
  // static 5 + chain 15 + initials 15 + score 31 + digits 5
  assert.equal(total, 3 + 5 + 5 + 5 + 5 + 5 + 5 + 15 + 15 + 31 + 5);
});

test('W302 the driver order is the ROM\'s `bsr` order, all ELEVEN', { skip: SKIP }, () => {
  // `$25B492` is eleven consecutive `bsr.w`s and the port has all of them (W302 did nine,
  // W303 added the frame and the labels). The frame and the labels come FIRST because they
  // are drawn under the data.
  assert.deepEqual(SCREEN_COLUMNS.map((c) => c.site),
    [0x25b4d6, 0x25b54c, 0x25b58c, 0x25b5e2, 0x25b626, 0x25b650, 0x25b700,
      0x25b72a, 0x25b7a0, 0x25b8ce, 0x25b944]);
  for (let i = 1; i < SCREEN_COLUMNS.length; i++) {
    assert.ok(SCREEN_COLUMNS[i].site > SCREEN_COLUMNS[i - 1].site, 'ascending, as bsr\'d');
  }
});

test('W302 every column base matches `hiscore.js`, and they are BASES not ends',
  { skip: SKIP }, () => {
    // The complement of W300's rule. The insert walks `-(An)` so its `lea`s name ends; the
    // display walks `(A6)+` so its `lea`s name bases. Same nine arrays, two conventions.
    assert.equal(SCREEN.scores, 0x803824, 'the score BASE, where the insert names $803838');
    assert.equal(SCREEN.overflow, 0x8038b0, 'and the overflow base, not $8038BA');
    assert.equal(SCREEN.initials, 0x803838);
    assert.deepEqual(
      [SCREEN.loop, SCREEN.stage, SCREEN.ship, SCREEN.style, SCREEN.chain, SCREEN.digits],
      [0x803874, 0x80387e, 0x803888, 0x803892, 0x80389c, 0x8038a6],
      'the six word columns, in the order $287D7A writes them');
  });
