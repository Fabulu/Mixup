// W387 -- SLOT [12], `$28F3AC`. THE FRONT-END LOOP CLOSES.
//
// ===============================================================================================
// THE ANSWER IN ONE LINE
// ===============================================================================================
//
// YES. On a real cold boot -- coin, START, no buttons -- slot [14] stages dispatch type $C at
// +4,414, `$28F3AC`'s state 0 initialises the name-entry screen on that same frame, finds
// `$8130CC` EMPTY (nobody owes a name), and two frames later `$28F368` has staged dispatch type
// 8, the attract sequencer. Measured in SECTION 3, as bare frame numbers.
//
//     attract [8] -> coin -> play -> game over [$D] -> [$E] -> [$C] -> attract [8]
//
// And the machine's resting state after the handover is BYTE-IDENTICAL to the resting state a
// plain cold boot with no coin reaches: `$812E56 = $0002`, `$812E5C = $0002` -- slot [8] arm 2,
// the high-score screen, waiting on its palette chain. SECTION 7 measures both runs and compares
// them, because "the loop closed" is only worth something if it closed onto the same machine.
//
// ===============================================================================================
// WHERE THE BRIEF THAT SET THIS WAVE IS WRONG. FIVE PLACES, ALL PINNED BELOW IN BYTES.
// ===============================================================================================
//
// 1. **"THE UNIT ... `$5F2` = 1,522 bytes ... 1,522 BYTES IS A LOT."** The byte count is right and
//    it is not the unit. `$28F2BA..$28F8AB` is the FIRST of three code blocks; eight `bsr`/`jsr`
//    inside it target code ABOVE `$28F8AB`, and the object's owned span really runs
//    `$28F2BA..$2901DF` -- **$F26 = 3,878 bytes.** SECTION 1 decodes all eight targets out of
//    the raw image and pins the far end on `$2901E0` being code.
//
// 2. **"`$28F3AC`: UNCLAIMED -- no mention in src/ in any form."** True of that one address, and
//    it hid the fact that `src/hiscorename.js` is 1,028 lines of already-ported name-entry body
//    -- W301, W304 through W311 and W382 -- with NO CALLER anywhere in the build. This wave wrote
//    the HEAD, not the screen. SECTION 6 drives that body through the new head and shows it runs.
//
// 3. **"data `$28FAD2` ... the only live use of that family."** Not live on the path this wave
//    closes. `$28F520 lea ($28FAD2,PC),A0 / $28F526 jsr $246704` sits inside
//    `nameCountdown28F4FC`, reachable only after a name has been COMMITTED. Measured: on a real
//    cold boot `$8130CC` is `$00`, so `$28FAD2` is read ZERO times. SECTION 4.
//
// 4. **"its four fade targets ... one windowed, three not."** Right, and the reason is worth
//    having: `$2254B8` is windowed because the RESULT screen installs the SAME ROM block as its
//    bank $11 (W125, `$28D9DA`). One block, two screens, two banks. SECTION 2.
//
// 5. **"`rts` AT `$28F8AA`" and both data extents ($3A and $22).** All three CORRECT, asserted as
//    bytes in SECTION 1 and SECTION 2. The brief was right and it is worth saying so.
//
// ===============================================================================================
// AND ONE DEFECT FOUND ON THE WAY, IN A FILE THIS WAVE DOES NOT OWN
// ===============================================================================================
//
// `src/objslot14.js:63` calls `queueKill(ram, ram.u16(a5 + 0x00))`. `$288C62` is `JMP $241292`,
// and `$241292` is `lea ($4C,A5),A0 / bra $241238`, whose `$241252 move.l (A0),(A1)` pushes the
// LONGWORD AT `($4C,A5)` -- the object's ID. `ram.u16(a5 + 0x00)` is the TYPE WORD. `killById`
// compares 16 bits of the id (`$2411FC cmp.w`), `$800E` never matches `$0001`, and the type-$E
// object therefore NEVER DIES: it is still in slot [0] 36,000 frames after it staged its
// successor. SECTION 8 asserts the defect as a live measurement rather than as prose, so that the
// wave which fixes `objslot14.js` has a test that turns red on the way past.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game, defaultHandlers } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import {
  SLOT12, objSlot12, init28F2BA, teardown28F368, nameArmHead,
  clearPlayerRam24A810, clearRankRam2603DA,
} from '../src/objslot12.js';
import { NAME_REC, NAME_SCREEN } from '../src/hiscorename.js';
import { SLOT14 } from '../src/objslot14.js';
import { Ram } from '../src/ram.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const tablesJson = JSON.parse(readFileSync(here('../rip/port/player.tables.json'), 'utf8'));
const IMG = readFileSync(here('../rip/sound/maincpu.bin'));

/** A word / longword straight out of the cartridge image, for the disassembly sections. */
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const NO_PLAYER = 0xffff;
const STATE = 0x812e56;               // SCREEN8.state
const TYPE_C = 0x0c;                  // the dispatch type slot [14] stages
const TYPE_8 = 0x08;                  // ...and the one slot [12] stages back

/** `COIN_BITS.COIN1` IS A BIT INDEX OF 0, so the held-coin word is `$FFFE` and NOT `$FFFF`.
 *  `$FFFE` is ALSO the P1 START word, by coincidence and not by derivation (`BIT.start` is 15
 *  and `mirrorsFromPort` applies a `ror.w #1`) -- both are bare values here for that reason. */
const coinWord = () => (0xffff & ~(1 << COIN_BITS.COIN1)) & 0xffff;

/** `w383coldboot.test.js` / `w385player.test.js` / `w386gameover.test.js`'s cold-boot chain,
 *  UNCHANGED. `tables` and `handlers` are parameters ONLY so the two ablation sections can run
 *  the identical boot with one window, or one dispatch entry, taken away. */
function bootToGameplay(tables = tablesJson, handlers = undefined) {
  const g = new Game(new Uint8Array(0x20000), tables, { palCatchUp: false, handlers });
  g.boot();
  g.ram.setU8(0x803957, 1);                        // the coinage dip, the one hand-written byte
  const run = (n, coin = COIN.idle, player = NO_PLAYER) => {
    g.coinPort = coin;
    for (let i = 0; i < n; i++) g.step(player);
  };
  run(20);                                         // the warning screen
  run(380);                                        // its $12C timeout
  run(20, coinWord());                             // a coin, HELD
  run(10);                                         // ...and RELEASED -- the credit lands here
  run(20, COIN.idle, portWordFromBits([BIT.start]));   // P1 START. `$FFFE` on the PLAYER port.
  assert.equal(g.ram.u16(STATE), 0x000e, 'the harness must reach gameplay before measuring');
  return g;
}

/** The live dispatch types, as a Set of the low byte -- `$8000` is the freshly-created marker. */
function liveTypes(g) {
  const s = new Set();
  for (let i = 0; i < ALLOC.slots; i++) {
    const t = g.ram.u16(ALLOC.table + i * ALLOC.stride);
    if (t !== 0) s.add(t & 0xff);
  }
  return s;
}

/** The slot ADDRESS holding a given dispatch type, or 0. */
function slotOf(g, type) {
  for (let i = 0; i < ALLOC.slots; i++) {
    const a = ALLOC.table + i * ALLOC.stride;
    if ((g.ram.u16(a) & 0xff) === type && g.ram.u16(a) !== 0) return a;
  }
  return 0;
}

// ===============================================================================================
// ONE COLD-BOOT RUN, SHARED. Every section below reads a different fact out of the SAME run, so
// no two sections can disagree about what the machine did. 5,000 frames past START.
// ===============================================================================================
const RUN = (() => {
  const g = bootToGameplay();
  let firstC = 0, initFrame = 0, ownedAtInit = -1, firstEightBack = 0, cGone = 0;
  let stopError = null, stoppedAt = 0;
  let stateAtHandover = -1, childStateWord = -1;
  let p1AtInit = -1, p2AtInit = -1;
  // **W390 WIDENED THIS WINDOW FROM 5,000 TO 5,400 FRAMES, AND THAT IS TRAP 16 EXACTLY.** The
  // loop-back reaches arm 12 at +4,688 and arm 9 at +4,992 -- EIGHT frames before the old window
  // closed. Arm 9's screen is ported now (W390) and takes 304 frames of its own, so at +5,000
  // this run read as "rests on arm 9" while a plain cold boot, which gets there at +878, had
  // long since moved to arm 1. That is a SHORT RUN misreading a gate, not a divergence: with
  // 5,400 frames the loop-back hands on to arm 1 at +5,296 and the two runs agree again, which
  // is the whole point of SECTION 8.
  //
  // **W391 WIDENS IT AGAIN, 5,400 -> 6,200, AND IT IS THE SAME TRAP FOR THE SECOND TIME.** Arm
  // 1's screen is ported now and takes 736 frames of its own (a chain, then $1E0 = 480 timer
  // frames, then a second chain), so the loop-back hands on to arm 5 at +6,032 -- 632 frames
  // past where the W390 window closed. At 5,400 this run read as "rests on arm 1" while a plain
  // cold boot, which reaches arm 1 at +1,182, had long since moved to arm 5. Same shape, same
  // fix, and worth stating twice: the number to widen to is the one the PORTED screens' own
  // durations give, not a round number. Every other measurement here is a FIRST-frame
  // measurement and is unmoved by the extra 800 frames.
  for (let f = 1; f <= 6200; f++) {
    try { g.step(NO_PLAYER); } catch (e) { stopError = e; stoppedAt = f; break; }
    const c = slotOf(g, TYPE_C);
    if (c && !firstC) firstC = f;
    // The init runs on the SAME frame the record is created: `commitCreates` drains at the top
    // of `$2410BC`, before the walk, so the new record is dispatched immediately.
    if (c && !initFrame && g.ram.u8(c + SLOT12.stateAt) === 1) {
      initFrame = f;
      ownedAtInit = g.ram.u8(c + SLOT12.owedAt);
      // W393: the two player records, ON THE FRAME $28F2BA READS THEM. Until W393 they were
      // still $0000 at +6,200 as well, because arm 5's `$26070C` was a counted note and no
      // attract demo ever booted a stage. It does now (`objslot8.js handoffCall`), the demo
      // that starts at +6,048 creates a real player, and a read at the END of this run measures
      // that demo instead of the screen this file is about.
      p1AtInit = g.ram.u16(0x8103e6);
      p2AtInit = g.ram.u16(0x810448);
    }
    const e8 = slotOf(g, TYPE_8);
    if (e8 && !firstEightBack) {
      firstEightBack = f;
      childStateWord = g.ram.u16(e8 + SLOT12.stateField);
      stateAtHandover = g.ram.u16(STATE);
    }
    if (firstC && !c && !cGone) cGone = f;
  }
  return { g, firstC, initFrame, ownedAtInit, firstEightBack, cGone,
    stopError, stoppedAt, stateAtHandover, childStateWord, p1AtInit, p2AtInit,
    notes: g.unportedLog.report(), types: liveTypes(g) };
})();

// ===============================================================================================
// SECTION 1 -- THE EXTENT. THE BRIEF'S 1,522 BYTES IS THE FIRST BLOCK, NOT THE UNIT.
// ===============================================================================================

test('W387 SECTION 1: the brief\'s $5F2 block is real, and its bounds are the two it names', () => {
  // The LOW end. `$28F3B0` is `6700 FF08`, a `beq.w`, and trap 4 puts the target at the
  // EXTENSION WORD's address plus the displacement: $28F3B2 + (-$F8) = $28F2BA.
  assert.equal(w(0x28f3b0), 0x6700, '$28F3B0 is a beq.w');
  const disp = w(0x28f3b2) | 0;
  assert.equal(0x28f3b2 + (disp - 0x10000), 0x28f2ba, 'and its target is $28F2BA');
  assert.equal(w(0x28f2b8), 0x4e75, '$28F2B8 is the PREVIOUS routine\'s rts');

  // The HIGH end. TRAP 5: the `4E75` sits AT the last address, not after it.
  assert.equal(w(0x28f8aa), 0x4e75, '$28F8AA IS the rts, not one past it');
  assert.equal(0x28f8ab - 0x28f2ba + 1, 0x5f2, '$28F2BA..$28F8AB is $5F2');
  assert.equal(0x5f2, 1522, '...which is 1,522 bytes, exactly as the brief says');
});

test('W387 SECTION 1: EIGHT calls inside that block target code ABOVE it -- the unit is $F26', () => {
  // Every one decoded from the raw image. `61xx` is `bsr` (trap 6) and `4EBA` is a PC-relative
  // `jsr`; both take their target from the EXTENSION WORD's address plus the displacement.
  const bsr = (a) => a + 2 + w(a + 2);            // `6100 dddd`
  const jsrPc = (a) => a + 2 + w(a + 2);          // `4EBA dddd`
  const calls = [
    [0x28f4ca, jsrPc, 0x28fcaa, 'the cursor and grid furniture'],
    [0x28f4e0, jsrPc, 0x28fd6e, 'the P1-only side furniture'],
    [0x28f4ee, jsrPc, 0x28fd2c, 'the P2-only side furniture'],
    [0x28f4f4, bsr, 0x28fb8a, 'the SCORE draw'],
    [0x28f4f8, bsr, 0x28fc36, 'the header draw'],
    [0x28f572, bsr, 0x28fe7a, 'the cursor move'],
    [0x28f57c, bsr, 0x28fdb0, 'the held-direction accumulator'],
    [0x28f580, bsr, 0x28faf4, 'the animated panel furniture'],
  ];
  for (const [site, decode, want, why] of calls) {
    assert.equal(decode(site), want,
      `$${site.toString(16)} -> $${want.toString(16)} (${why})`);
    assert.ok(want > 0x28f8ab,
      `$${want.toString(16)} is ABOVE the brief's $28F8AB, so the unit is not $5F2 bytes`);
  }

  // THE FAR END. W310 (`hiscorename.js`) pinned the last data table at `$290170 + $70` = $2901E0
  // and said `$2901E0` is code. Asserted here as bytes: `4A79 0081 3098` is `tst.w $813098`.
  assert.equal(w(0x2901e0), 0x4a79, '$2901E0 is `tst.w abs.l` -- the NEXT routine');
  assert.equal(l(0x2901e2) & 0xffffff, 0x813098, '...on $813098');
  assert.equal(0x2901df - 0x28f2ba + 1, 0xf26, 'the object owns $28F2BA..$2901DF');
  assert.equal(0xf26, 3878, '...which is 3,878 bytes, not 1,522 -- two and a half times the brief');
});

test('W387 SECTION 1: the DISPATCHER, byte for byte, including the DEAD moveq', () => {
  assert.equal(l(0x28f3ac), 0x4a2d0002, '$28F3AC tst.b ($2,A5)');
  assert.equal(l(0x28f3b4), 0x0c2d0002, '$28F3B4 cmpi.b #$2,...');
  assert.equal(w(0x28f3b8), 0x0002, '...($2,A5)');
  // `67AC` is a SHORT beq: $28F3BC + (-$54) = $28F368.
  assert.equal(w(0x28f3ba), 0x67ac, '$28F3BA beq.s');
  assert.equal(0x28f3bc - 0x54, 0x28f368, '...to $28F368, the teardown');
  assert.equal(l(0x28f3bc), 0x102d0005, '$28F3BC move.b ($5,A5),D0');
  assert.equal(w(0x28f3c4), 0x67a2, '$28F3C4 beq.s');
  assert.equal(0x28f3c6 - 0x5e, 0x28f368, '...to $28F368 AS WELL -- two arms, one exit');

  // THE DEAD INSTRUCTION. `7003` is `moveq #$3,D0`, between the two arms of the both-sides case,
  // and `$28F450`'s first two instructions overwrite D0 before anything can read it.
  assert.equal(w(0x28f3d2), 0x7003, '$28F3D2 moveq #$3,D0');
  assert.equal(w(0x28f450), 0x49f9, '$28F450 lea xxx.l,A4 -- does not read D0');
  assert.equal(l(0x28f456), 0x4eb90023, '$28F456 jsr $23D17E...');
  assert.equal(w(0x28f45a), 0xd17e, '...which RETURNS a value in D0, killing the moveq');
});

// ===============================================================================================
// SECTION 2 -- THE FOUR PALETTE SOURCES, THE ONE BOUND STATED TWICE, AND THE WINDOWS
// ===============================================================================================

const windows = tablesJson.rom.windows.map((x) => ({
  base: parseInt(String(x.base).replace('$', ''), 16), len: x.len, why: x.why,
}));

test('W387 SECTION 2: $28F2BA installs four banks, and $24150A states the $40 bound', () => {
  for (const [i, f] of SLOT12.fades.entries()) {
    const a = 0x28f2d8 + i * 16;
    assert.equal(w(a), 0x41f9, `$${a.toString(16)} lea xxx.l,A0`);
    assert.equal(l(a + 2), f.src, `...loading $${f.src.toString(16)}`);
    assert.equal(w(a + 6), 0x303c, '...then move.w #imm,D0');
    assert.equal(w(a + 8), f.bank, `...the bank number ${f.bank}`);
    assert.equal(w(a + 10), 0x4eb9, '...then jsr xxx.l');
    assert.equal(l(a + 12), 0x24150a, '...$24150A');
    assert.equal(a + 10, f.site, 'and SLOT12.fades records the jsr site');
  }
  // BOUND 1 -- `$241518 moveq #$F,D0 / move.l (A0)+,(A1)+ / dbra D0`. TRAP 2: the dbra runs
  // N+1 = 16 times, so 16 longwords = $40 bytes.
  assert.equal(w(0x241518), 0x700f, '$241518 moveq #$F,D0');
  assert.equal(w(0x24151a), 0x22d8, '$24151A move.l (A0)+,(A1)+');
  assert.equal(w(0x24151c), 0x51c8, '$24151C dbra D0');
  assert.equal((0x0f + 1) * 4, SLOT12.fadeBytes, '16 longwords = $40 bytes');
});

test('W387 SECTION 2: $28FA98 states the SAME bound, from a different instruction', () => {
  // The fade script `$28F4BA jsr $246410` reads. Count word, then fourteen bytes per entry.
  assert.equal(w(0x28fa98), 4, '$28FA98 declares four entries');
  for (const [i, f] of SLOT12.fades.entries()) {
    const e = 0x28fa98 + 2 + i * 14;
    assert.equal(l(e + 6), f.src,
      `entry ${i} fades toward the SAME block $28F2BA installed into bank ${f.bank}`);
    assert.equal(w(e + 10), 0x001f, '...with words-minus-one $001F');
    assert.equal((0x1f + 1) * 2, SLOT12.fadeBytes, '...= 32 words = $40 bytes');
  }
  // THE BRIEF'S TWO DATA EXTENTS, CONFIRMED. 2 + 4*14 = $3A, and $28FA98 + $3A is the OTHER
  // script's count word; 2 + 4*8 = $22, and $28FAD2 + $22 is $28FAF4, which is CODE.
  assert.equal(2 + 4 * 14, 0x3a, '$28FA98 is $3A bytes');
  assert.equal(0x28fa98 + 0x3a, 0x28fad2, '...ending exactly at $28FAD2');
  assert.equal(w(0x28fad2), 4, '$28FAD2 declares four entries too');
  assert.equal(2 + 4 * 8, 0x22, '$28FAD2 is $22 bytes');
  assert.equal(0x28fad2 + 0x22, 0x28faf4, '...ending exactly at $28FAF4');
  assert.equal(l(0x28faf4), 0x532c0022, '...which is `subq.b #1,($22,A4)` -- CODE');
});

test('W387 SECTION 2: the export declares ($225478,$40) and ($2254F8,$80), and nothing else', () => {
  const want = [[0x225478, 0x40], [0x2254f8, 0x80]];
  for (const [base, len] of want) {
    const mine = windows.filter((x) => x.base === base);
    assert.equal(mine.length, 1, `exactly one declaration of $${base.toString(16)}`);
    assert.equal(mine[0].len, len, `...and it is $${len.toString(16)} bytes`);
    assert.match(mine[0].why, /W387/, '...declared by this wave');
  }
  // $2254B8 is W125's and must NOT have been touched: the RESULT screen installs the same block
  // as its bank $11 ($28D9DA), which is why three of the four needed windows and one did not.
  const w125 = windows.filter((x) => x.base === 0x2254b8);
  assert.equal(w125.length, 1, 'W125 declares $2254B8 exactly once');
  assert.equal(w125[0].len, 0x40, '...and it is STILL $40 -- this wave widened nothing');
  assert.match(w125[0].why, /W125/, '...and it is still W125\'s line');

  // Every one of the four sources is SERVED, byte for byte, through RomWindows.
  const rom = new RomWindows(tablesJson.rom);
  for (const f of SLOT12.fades) {
    for (let i = 0; i < 32; i++) {
      assert.equal(rom.u16(f.src + i * 2), w(f.src + i * 2),
        `word ${i} of $${f.src.toString(16)} matches the cartridge image`);
    }
  }
});

test('W387 SECTION 2: the two new windows OVERLAP NOTHING, and ABUT rather than widen', () => {
  for (const [base, len] of [[0x225478, 0x40], [0x2254f8, 0x80]]) {
    for (const x of windows) {
      if (x.base === base && x.len === len) continue;
      assert.ok(x.base >= base + len || base >= x.base + x.len,
        `[$${base.toString(16)}, $${(base + len).toString(16)}) overlaps `
        + `[$${x.base.toString(16)}, $${(x.base + x.len).toString(16)}) -- ${x.why.slice(0, 60)}`);
    }
  }
  // The abutments, as values. Both new windows touch W125's $2254B8 block, one on each side.
  assert.equal(0x225478 + 0x40, 0x2254b8, '$225478 ends AT W125\'s base');
  assert.equal(0x2254b8 + 0x40, 0x2254f8, 'and W125\'s block ends AT $2254F8');
  assert.equal(0x2254f8 + 0x80, 0x225578, '$2254F8+$80 ends at $225578');

  // Below: W386's $2252F8+$40 ends at $225338, so $140 bytes of nothing lie under $225478.
  const below = windows.filter((x) => x.base < 0x225478).sort((a, b) => b.base - a.base)[0];
  assert.equal(below.base, 0x2252f8, 'the nearest window below is W386\'s $2252F8');
  assert.equal(0x225478 - (below.base + below.len), 0x140, '...and $140 bytes lie between');
  // Above: W125's $2255B8, $40 clear.
  const above = windows.filter((x) => x.base > 0x2254f8).sort((a, b) => a.base - b.base)[0];
  assert.equal(above.base, 0x2255b8, 'the nearest window above is W125\'s $2255B8');
  assert.equal(above.base - 0x225578, 0x40, '...and $40 bytes lie between');
});

test('W387 SECTION 2 ABLATION: remove ONLY $2254F8 and the same cold boot dies at $2254F8', () => {
  const ablated = {
    ...tablesJson,
    rom: { ...tablesJson.rom, windows: tablesJson.rom.windows.filter((x) => x.base !== '$2254F8') },
  };
  assert.equal(ablated.rom.windows.length, tablesJson.rom.windows.length - 1,
    'exactly ONE window was removed');

  const g = bootToGameplay(ablated);
  let err = null, at = 0;
  for (let f = 1; f <= 4500; f++) {
    try { g.step(NO_PLAYER); } catch (e) { err = e; at = f; break; }
  }
  assert.ok(err instanceof Unreached, `a NAMED Unreached, not a bare crash; got ${err}`);
  assert.equal(err.romAddress, 0x2254f8, 'THE ABLATION ADDRESS: $2254F8');
  assert.match(err.stack, /objslot12\.js/, 'read by objslot12.js init28F2BA');
  assert.equal(at, RUN.initFrame, 'and it dies on the EXACT frame state 0 runs');

  // THE POSITIVE CONTROL. The identical boot with the full export does not throw at all, and
  // reaches the handover -- so the throw above is the missing window and nothing else.
  assert.equal(RUN.stopError, null,
    `the same boot with every window survives 5,000 frames; it stopped at +${RUN.stoppedAt} `
    + `with ${RUN.stopError}`);
  assert.ok(RUN.firstEightBack > 0, '...and it got dispatch type 8 back');
});

test('W387 SECTION 2 ABLATION: remove ONLY $225478 and it dies there instead', () => {
  const ablated = {
    ...tablesJson,
    rom: { ...tablesJson.rom, windows: tablesJson.rom.windows.filter((x) => x.base !== '$225478') },
  };
  const g = bootToGameplay(ablated);
  let err = null;
  for (let f = 1; f <= 4500; f++) {
    try { g.step(NO_PLAYER); } catch (e) { err = e; break; }
  }
  assert.ok(err instanceof Unreached, `a NAMED Unreached; got ${err}`);
  assert.equal(err.romAddress, 0x225478, 'THE ABLATION ADDRESS: $225478');
});

// ===============================================================================================
// SECTION 3 -- THE REAL COLD BOOT. THE LOOP CLOSES.
// ===============================================================================================

test('W387 SECTION 3: dispatch type $C arrives at +4,414 and INITIALISES on that same frame', () => {
  assert.equal(RUN.firstC, 4414, 'slot [14] stages type $C at +4,414, as W386 measured');
  assert.equal(RUN.initFrame, 4414,
    'and $28F3AC state 0 runs on the SAME frame: commitCreates drains before the walk');
  assert.equal(RUN.ownedAtInit, 0,
    '$8130CC is $00 on this boot -- NOBODY OWES A NAME, so the screen is a pass-through');
  assert.equal(RUN.g.ram.u8(SLOT12.flags), 0, '...and the work list is still empty at the end');
});

test('W387 SECTION 3: THE FRONT-END LOOP CLOSES -- type 8 is back, staged at state 2', () => {
  assert.equal(RUN.firstEightBack, 4416,
    'dispatch type 8, the ATTRACT SEQUENCER, is live again two frames after type $C arrived');
  assert.equal(RUN.cGone, 4416, 'and type $C is gone on the same frame -- $28F37A killed it');
  assert.equal(RUN.childStateWord, SLOT12.childState,
    '$28F3A4 move.w #$2,($4,A0) put arm 2 in the new record, through A0 and not A5');
  assert.equal(RUN.stateAtHandover, 0x0002,
    'and slot [8] arm 0 has copied it into $812E56 -- the high-score screen');
  assert.ok(RUN.types.has(TYPE_8), 'type 8 is still live 5,000 frames in');
  assert.ok(!RUN.types.has(TYPE_C), '...and type $C is not');
});

test('W387 SECTION 3: nothing throws for 5,000 frames, and the run really ran', () => {
  assert.equal(RUN.stopError, null, `no throw; stopped at +${RUN.stoppedAt}`);
  assert.equal(RUN.stoppedAt, 0, 'the loop ran to completion');
});

// ===============================================================================================
// SECTION 4 -- THE COUNTED SET ON THE COLD-BOOT PATH IS EXACTLY TWO, AND $240FC2 IS GONE
// ===============================================================================================

test('W387 SECTION 4: $240FC2 -- "slot [12] has no handler" -- is no longer counted at all', () => {
  const orphan = RUN.notes.filter((s) => /\$240FC2/.test(s));
  assert.deepEqual(orphan, [],
    'before this wave $240FC2 was counted once per frame from +4,414 to the end of time');
});

test('W387 SECTION 4: this object counts exactly FOUR things on a real cold boot', () => {
  // KEY ON THE CALL SITE IN THE MESSAGE, not on the note's address. Both $259C4A and $28C0FC
  // ALREADY had notes before this wave -- `rank.js` counts $259C4A from $2605CE and
  // `objslot13.js` counts $28C0FC from $288A42 -- so an address filter reports four and an
  // address-and-count filter reports the wrong two. `frontend.js`'s RESET_PROLOGUE message also
  // LISTS $259C4A and $24A810 inside its text, under $23BEEA, which a substring filter picks up.
  const parsed = RUN.notes.map((s) => {
    const m = s.trim().match(/^(\d+) x \$([0-9A-F]{6}) (.*)$/);
    return m ? { n: Number(m[1]), at: parseInt(m[2], 16), msg: m[3] } : null;
  }).filter(Boolean);

  // **W388: FOUR BECAME TWO, and that is the deliverable of Unit C.** `$28F368 jsr $24A810` and
  // `$28F374 jsr $2603DA` are CALLS now -- `clearPlayerRam24A810` and `clearRankRam2603DA`, both
  // already transcribed and both proven end-to-end by SECTION 7 below -- so they have left the
  // census entirely. `$28F36E jsr $259C4A` stays counted because it is $6E bytes with its own
  // control flow ($259CA0 is a `jsr`), not a straight-line clear, and `$28F380 jsr $28C0FC` stays
  // counted because `sound.js` has no posting path for it.
  const mine = parsed.filter((k) => /^\$28F[0-9A-F]{3} /.test(k.msg));
  assert.deepEqual(mine.map((k) => [k.msg.slice(0, 20), k.n]), [
    ['$28F36E jsr $259C4A ', 1],
    ['$28F380 jsr $28C0FC ', 1],
  ], 'exactly TWO counted calls left, each fired once -- the teardown is ONE frame');
  assert.equal(parsed.filter((k) => /^\$28F368 |^\$28F374 /.test(k.msg)).length, 0,
    'the two transcribed clears are CALLED now, so neither is counted from anywhere');

  // And NOTHING is counted at the three draw routines, the panel draw or either script loader,
  // from any call site at all: the cold-boot path does not reach the name-entry body.
  for (const a of [0x28faf4, 0x28fb8a, 0x28fc36, 0x28f7f4, 0x246410, 0x246704]) {
    assert.equal(parsed.filter((k) => k.at === a).length, 0,
      `$${a.toString(16).toUpperCase()} is never counted -- $8130CC is empty, so nothing below `
      + `$28F4C4 runs`);
  }
});

test('W387 SECTION 4: the counted extents are the ones this wave MEASURED', () => {
  // $259C4A..$259CB7, and it is NOT straight-line: $259CA0 is `jsr $25A182`, which is why it is
  // counted rather than transcribed alongside $24A810 and $2603DA.
  assert.equal(w(0x259cb6), 0x4e75, '$259CB6 is $259C4A\'s rts');
  assert.equal(0x259cb7 - 0x259c4a + 1, 0x6e, '$259C4A..$259CB7 is $6E bytes');
  assert.equal(w(0x259ca0), 0x4eb9, '$259CA0 is a jsr...');
  assert.equal(l(0x259ca2), 0x25a182, '...to $25A182 -- a call out of the middle of it');

  // The three draws, each pinned by the FIRST INSTRUCTION of the next one.
  for (const d of SLOT12.draws) {
    const next = d.at + d.bytes;
    assert.ok(next === 0x28fb8a || next === 0x28fc36 || next === 0x28fcaa,
      `$${d.at.toString(16)}+$${d.bytes.toString(16)} lands on the next routine`);
  }
  assert.equal(0x28faf4 + 0x96, 0x28fb8a, '$28FAF4 is $96 bytes');
  assert.equal(0x28fb8a + 0xac, 0x28fc36, '$28FB8A is $AC bytes');
  assert.equal(0x28fc36 + 0x74, 0x28fcaa, '$28FC36 is $74 bytes -- and $28FCAA IS ported');
  assert.equal(l(0x28fcaa), 0x223c2a00, '$28FCAA move.l #$2A001C00,D1 -- drawGrid28FCAA');

  // The panel draw, $28F7F4..$28F8AB, ending on the `4E75` AT $28F8AA.
  assert.equal(0x28f8ab - 0x28f7f4 + 1, SLOT12.panelDrawBytes, '$28F7F4 is $B8 bytes');
});

// ===============================================================================================
// SECTION 5 -- THE REGISTRATION ABLATION. THIS IS THE WAVE'S DELIVERABLE.
// ===============================================================================================

test('W387 SECTION 5 ABLATION: drop entry [12] and the machine STOPS at type $C forever', () => {
  // The identical boot, the identical frames, `defaultHandlers` minus ONE entry. Nothing else
  // differs -- the source file, the windows and the harness are all the same.
  const g0 = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  const full = defaultHandlers(g0.rom, g0.vram, {});
  assert.ok(full.has(12), 'entry [12] IS registered -- that is what this wave did');
  const without = new Map([...full].filter(([k]) => k !== 12));
  assert.equal(without.size, full.size - 1, 'exactly one entry removed');

  const g = bootToGameplay(tablesJson, without);
  for (let f = 1; f <= 5000; f++) g.step(NO_PLAYER);

  const types = liveTypes(g);
  assert.ok(types.has(TYPE_C), 'WITHOUT the entry: type $C is still sitting there at +5,000');
  assert.ok(!types.has(TYPE_8), '...and dispatch type 8 NEVER COMES BACK. The loop is open.');
  assert.equal(g.ram.u16(STATE), 0x000e, '...and $812E56 is still the gameplay state');

  const orphan = g.unportedLog.report().filter((s) => /\$240FC2/.test(s));
  assert.equal(orphan.length, 1, '...and $240FC2 is counted');
  const n = Number(orphan[0].trim().split(' ')[0]);
  assert.ok(n > 500,
    `...once per frame from +4,414 on: ${n} times in 5,000 frames. WITH the entry it is 0.`);

  // AND THE SAME RUN WITH THE ENTRY, side by side, so the delta is one line and not a memory.
  assert.ok(RUN.types.has(TYPE_8), 'WITH the entry: type 8 is back');
  assert.ok(!RUN.types.has(TYPE_C), '...type $C is gone');
  // W388: was `0x0002`. Arm 2 no longer holds -- its palette chain drains and it hands on to
  // arm 12. **W389: was `0x000C`.** Arm 12 no longer holds either: `$25C2AE`/`$25C2EA` are ported
  // and it hands on to arm 9. **W390: was `0x0009`.** Arm 9's `$25C3E8`/`$25C424` are ported too
  // and it hands on to arm 1. **W391: was `0x0001`.** Arm 1's `$25BBB4`/`$25BD7C` are ported
  // too and it hands on to arm 5. The ablation's claim is the CONTRAST with `$E` above, which is
  // unchanged; only the incidental resting arm could not survive, for the fourth wave running.
  assert.equal(RUN.g.ram.u16(STATE), 0x0005,
    '...and $812E56 has moved on 2 -> 12 -> 9 -> 1 -> 5');
});

// ===============================================================================================
// SECTION 6 -- THE HEADS, DRIVEN DIRECTLY. THE COLD BOOT NEVER GETS HERE.
// ===============================================================================================
//
// `$8130CC` is `$00` on every no-buttons boot, so `$28F3F8`/`$28F450` and the ~700 lines of
// `hiscorename.js` behind them are unreachable from the driver TODAY. They are driven here with
// a seeded work list -- which is not a substitute for the real path and is not claimed to be.
// What it proves is that the head this wave wrote wires the existing body up correctly.

/** A bare RAM with the high-score table's factory defaults and one side's row TAGGED, which is
 *  the state `$287C7E move.l D6,(A4)` leaves behind when a side makes the table. */
function seededRam(side) {
  const ram = new Ram(new Uint8Array(0x20000));
  // `$803838` is the five 12-byte name rows; `tagForSide` is $FF for P1 and $FE for P2.
  ram.setU32(0x803838 + 2 * 12, side === 0 ? 0xff : 0xfe);
  return ram;
}

test('W387 SECTION 6: the two heads read their OWN record and their OWN input words', () => {
  const rom = new RomWindows(tablesJson.rom);
  for (const side of [0, 1]) {
    const ram = seededRam(side);
    const a5 = ALLOC.table;
    ram.setU16(a5, 0x000c);
    ram.setU8(a5 + SLOT12.owedAt, side === 0 ? 1 : 2);
    // The RAW and EDGE words the two `jsr`s read: $803970/$803976 raw, $803974/$80397A edge.
    ram.setU16(side === 0 ? 0x803970 : 0x803976, 0x1234);
    const arm = nameArmHead(ram, rom, a5, {}, side);
    const a4 = SLOT12.records[side];
    assert.notEqual(arm, 'gaveup', `side ${side} found its tagged row`);
    assert.equal(ram.u16(a4 + SLOT12.rawAt), 0x1234,
      `side ${side}'s RAW word landed in ITS OWN record at ($34,A4)`);
    assert.equal(ram.u16(a4 + NAME_REC.setupBit), NAME_SCREEN.setupBits[side],
      `...and the setup bit is ${NAME_SCREEN.setupBits[side]}, from $28F41A / $28F472`);
    assert.equal(ram.u16(a4 + NAME_REC.side), side, '...and ($2C,A4) is the side');
    // The OTHER record is untouched: the two heads are twins, not one parameterised routine.
    assert.equal(ram.u16(SLOT12.records[1 - side] + SLOT12.rawAt), 0,
      'the other side\'s record was not written');
  }
});

test('W387 SECTION 6: the input reads happen BEFORE the one-shot gate, every frame', () => {
  const rom = new RomWindows(tablesJson.rom);
  const ram = seededRam(0);
  const a5 = ALLOC.table;
  ram.setU8(a5 + SLOT12.owedAt, 1);
  const a4 = SLOT12.records[0];

  ram.setU16(0x803970, 0x1111);
  nameArmHead(ram, rom, a5, {}, 0);                       // first frame: the gate is OPEN
  assert.equal(ram.u16(a4 + SLOT12.rawAt), 0x1111);

  // Close the gate the way the screen's own frame counter does, then change the input.
  ram.setU16(a4 + SLOT12.frameAt, 7);
  ram.setU16(0x803970, 0x2222);
  nameArmHead(ram, rom, a5, {}, 0);
  assert.equal(ram.u16(a4 + SLOT12.rawAt), 0x2222,
    '$28F3FE runs ahead of $28F412\'s `bne`, so the buttons are never frozen');
});

test('W387 SECTION 6: a side with NO tagged row is dropped, and the last one out ends the screen',
  () => {
    const rom = new RomWindows(tablesJson.rom);
    const ram = new Ram(new Uint8Array(0x20000));          // no tags anywhere
    const a5 = ALLOC.table;
    ram.setU8(a5 + SLOT12.owedAt, 0x03);                   // BOTH sides owe

    assert.equal(nameArmHead(ram, rom, a5, {}, 0), 'gaveup', 'P1 finds nothing');
    assert.equal(ram.u8(a5 + SLOT12.owedAt), 0x02, '...and $28F6CC clears ONLY bit 0');
    assert.equal(ram.u8(a5 + SLOT12.stateAt), 0, '...the screen does NOT end yet');

    assert.equal(nameArmHead(ram, rom, a5, {}, 1), 'gaveup', 'P2 finds nothing either');
    assert.equal(ram.u8(a5 + SLOT12.owedAt), 0x00, '...the work list is empty');
    assert.equal(ram.u8(a5 + SLOT12.stateAt), SLOT12.doneState,
      '...and NOW $28F6DA writes state 2 -- only the last side out does');
  });

// ===============================================================================================
// SECTION 7 -- THE THREE STATES, AND THE TEARDOWN'S TWO TRANSCRIBED CLEARS
// ===============================================================================================

test('W387 SECTION 7: the dispatcher takes the arm the state and the work list select', () => {
  const rom = new RomWindows(tablesJson.rom);
  const mk = (state, owed) => {
    const ram = new Ram(new Uint8Array(0x20000));
    const a5 = ALLOC.table;
    ram.setU16(a5, 0x000c);
    ram.setU8(a5 + SLOT12.stateAt, state);
    ram.setU8(a5 + SLOT12.owedAt, owed);
    return { ram, a5 };
  };
  const ctx = { tx: null, palette: null, unported: { note() {} } };
  assert.equal(objSlot12(mk(0, 0).ram, rom, ALLOC.table, ctx), 'init', 'state 0 -> $28F2BA');
  assert.equal(objSlot12(mk(2, 3).ram, rom, ALLOC.table, ctx), 'teardown',
    'state 2 -> $28F368, EVEN WITH A FULL WORK LIST -- the state wins');
  assert.equal(objSlot12(mk(1, 0).ram, rom, ALLOC.table, ctx), 'nobody',
    'state 1 with an empty list -> $28F368 as well');
  const p1 = mk(1, 1); assert.equal(objSlot12(p1.ram, rom, p1.a5, ctx), 'p1');
  const p2 = mk(1, 2); assert.equal(objSlot12(p2.ram, rom, p2.a5, ctx), 'p2');
  const both = mk(1, 3); assert.equal(objSlot12(both.ram, rom, both.a5, ctx), 'both');
});

test('W387 SECTION 7: $28F2BA clears $42 WORDS -- $81E056..$81E0D9 and not one byte more', () => {
  const rom = new RomWindows(tablesJson.rom);
  const ram = new Ram(new Uint8Array(0x20000));
  for (let a = 0x81e050; a < 0x81e0e0; a += 2) ram.setU16(a, 0xa5a5);
  const a5 = ALLOC.table;
  init28F2BA(ram, rom, a5, { unported: { note() {} } });

  // TRAP 2: `move.w #$41,D0` then `dbra` is $42 = 66 iterations, not $41.
  assert.equal(w(0x28f2cc), 0x303c, '$28F2CC move.w #imm,D0');
  assert.equal(w(0x28f2ce), 0x0041, '...and the immediate is $41');
  assert.equal(SLOT12.workWords, 0x42, '...so the dbra runs $42 times');
  assert.equal(SLOT12.work + SLOT12.workWords * 2, 0x81e0da,
    '$81E056 + $84 == $81E0DA: P1\'s record, P2\'s record, $81E0D6 and $81E0D8');

  assert.equal(ram.u16(0x81e054), 0xa5a5, 'the word BELOW the block is untouched');
  assert.equal(ram.u16(0x81e056), 0, 'the first word is cleared');
  assert.equal(ram.u16(0x81e0d8), 0, 'the LAST word is cleared');
  assert.equal(ram.u16(0x81e0da), 0xa5a5, 'and the word ABOVE it is untouched');
  assert.equal(ram.u8(a5 + SLOT12.stateAt), 1, 'and the state advanced to 1');
});

test('W387 SECTION 7: the two high-score checks are gated on the record SIGN BIT', () => {
  const rom = new RomWindows(tablesJson.rom);
  assert.equal(w(0x28f318), 0x4a79, '$28F318 tst.w abs.l');
  assert.equal(l(0x28f31a) & 0xffffff, 0x8103e6, '...on $8103E6, P1\'s record');
  assert.equal(w(0x28f31e), 0x6a00, '$28F31E bpl.w -- POSITIVE skips the whole arm');

  // Bit 15 clear -> the check never runs, whatever the score is.
  const quiet = new Ram(new Uint8Array(0x20000));
  quiet.setU16(0x8103e6, 0x7fff);
  const a5 = ALLOC.table;
  assert.equal(init28F2BA(quiet, rom, a5, { unported: { note() {} } }), 0,
    '$8103E6 positive -> $8130CC untouched, which is exactly the cold-boot case');

  // ...and on the real boot BOTH records read $0000 ON THE FRAME $28F2BA RUNS, which is why
  // the screen passes through. W393 RE-BASE: read them at `initFrame` and not at the end of
  // the 6,200-frame window -- the attract demo that starts at +6,048 now boots a stage and
  // creates a live player, so the final frame measures that demo and not this screen.
  assert.ok(RUN.initFrame > 0, 'POSITIVE CONTROL: the init frame was found');
  assert.equal(RUN.p1AtInit & 0x8000, 0, 'P1 record positive when $28F318 tests it');
  assert.equal(RUN.p2AtInit & 0x8000, 0, '...and so is P2 record');
});

test('W387 SECTION 7: the two transcribed clears do EXACTLY what their dbras say', () => {
  // These two ARE ported (`clearPlayerRam24A810` / `clearRankRam2603DA`) and the teardown
  // deliberately COUNTS the calls instead of making them -- see the CLEARS block in
  // objslot12.js for the six assertions in two other files that turning them on re-bases.
  // Tested here so that switching them on is a one-line change and not a rewrite.
  const ram = new Ram(new Uint8Array(0x20000));
  // TRAP 2 twice over: `move.w #$12C8,D0` is $12C9 words and `move.w #$65,D0` is $66.
  assert.equal(w(0x24a812), 0x12c8, "$24A810's count immediate is $12C8");
  assert.equal(w(0x24a822), 0x4e75, '...and its rts is at $24A822, so it is $14 bytes');
  assert.equal(w(0x2603e2), 0x0065, "$2603DA's count immediate is $65");
  assert.equal(w(0x2603fc), 0x4e75, '...and its rts is at $2603FC, so it is $24 bytes');
  for (let a = 0x8103e4; a <= 0x812978; a += 2) ram.setU16(a, 0x5a5a);
  for (let a = 0x81308a; a <= 0x813158; a += 2) ram.setU16(a, 0x5a5a);

  clearPlayerRam24A810(ram);
  assert.equal(ram.u16(0x8103e4), 0x5a5a, '$24A810 leaves the word below $8103E6 alone');
  assert.equal(ram.u16(0x8103e6), 0, '...clears from $8103E6');
  // TRAP 2 SPELLED OUT: $12C9 words, so the LAST one is at $8103E6 + ($12C8 * 2) = $812976 and
  // the span is $8103E6..$812977. Taking the count as $12C8 stops one word short.
  assert.equal(0x8103e6 + 0x12c8 * 2, 0x812976, 'the ($12C9)th word is at $812976');
  assert.equal(ram.u16(0x812976), 0, '...and it is cleared');
  assert.equal(ram.u16(0x812978), 0x5a5a, '...and $812978 is not');

  clearRankRam2603DA(ram);
  assert.equal(ram.u16(0x81308a), 0x5a5a, '$2603DA leaves the word below $81308C alone');
  assert.equal(ram.u16(0x813156), 0, '...clears through $813156, the ($66)th word');
  assert.equal(ram.u16(0x813158), 0x5a5a, '...and stops there');
  // ORDER: both $FFFF stores are INSIDE the cleared span, so they must come after the loop.
  assert.equal(ram.u16(0x8130be), 0xffff, '$2603EC writes $FFFF AFTER the clear');
  assert.equal(ram.u16(0x8130c0), 0xffff, '...and so does $2603F4');
  assert.ok(0x8130be > 0x81308c && 0x8130be < 0x813158, '...and $8130BE really is inside it');
  // AND THE PRICE, as an address rather than as prose: $8130FA is tally.js's TALLY.side0, which
  // is what makes w385player.test.js's dispatcher-record assertions go red if this runs.
  assert.ok(0x8130fa > 0x81308c && 0x8130fa < 0x813158,
    "$8130FA -- TALLY.side0 -- is inside $2603DA's span");
});

test('W387 SECTION 7: $28F368 kills THIS object and stages type 8 at state 2', () => {
  const rom = new RomWindows(tablesJson.rom);
  const ram = new Ram(new Uint8Array(0x20000));
  for (let a = 0x8103e6; a <= 0x812978; a += 2) ram.setU16(a, 0x5a5a);
  for (let a = 0x81308c; a <= 0x813158; a += 2) ram.setU16(a, 0x5a5a);
  const a5 = ALLOC.table;
  ram.setU32(a5 + SLOT12.idAt, 0x00000007);              // the id $241292 pushes
  const made = teardown28F368(ram, rom, a5, { unported: { note() {} } });

  // **W388 RE-BASE: THE TWO TRANSCRIBED CLEARS ARE CALLED NOW.** This assertion used to read
  // `'the counted $24A810 wrote nothing'` and prove the deliberate omission. Unit C turns them
  // on, so what is proven here instead is that each wipes EXACTLY its own span -- both ends, and
  // the first word past the end still holding the $5A5A fill, which is the check that a `dbra`
  // off by one would fail (trap 2).
  //
  // $24A810: `move.w #$12C8,D0 ... dbra` = $12C9 words from $8103E6, so $8103E6..$812977.
  assert.equal(ram.u16(0x8103e6), 0, '$24A810 cleared the FIRST word of the player span');
  assert.equal(ram.u16(0x812976), 0, '...and the LAST, $8103E6 + $12C8*2');
  assert.equal(ram.u16(0x812978), 0x5a5a, '...and NOT the word past it -- $12C9 words, not $12CA');
  // $2603DA: `move.w #$65,D0 ... dbra` = $66 words from $81308C, so $81308C..$813157, and THEN
  // two $FFFF stores at $8130BE/$8130C0 which are INSIDE the span and must land after the loop.
  assert.equal(ram.u16(0x81308c), 0, '$2603DA cleared the FIRST word of the rank span');
  assert.equal(ram.u16(0x813156), 0, '...and the LAST, $81308C + $65*2');
  assert.equal(ram.u16(0x813158), 0x5a5a, '...and NOT the word past it');
  assert.equal(ram.u16(0x8130be), 0xffff, '...and $8130BE is $FFFF: the store runs AFTER the loop');
  assert.equal(ram.u16(0x8130c0), 0xffff, '...as does $8130C0, its P2 twin');

  // THE KILL, and it takes the ID and not the type word.
  assert.equal(ram.u32(ALLOC.killQueue), 0x00000007, '$241292 queued ($4C,A5), the id');
  // THE CREATE. Type 8, priority from the DISPATCH TABLE, state 2 through A0 (trap 11, 12).
  assert.equal(ram.u16(made.addr) & 0xff, TYPE_8, 'a create of dispatch type 8 is staged');
  assert.equal(ram.u16(made.addr + ALLOC.priOff), rom.u16(SLOT12.dispatch + TYPE_8 * 8 + 4),
    'and its priority came from $240F62 + type*8 + 4, never from a literal');
  assert.equal(ram.u16(made.addr + SLOT12.stateField), 2,
    '$28F3A4 wrote ($4,A0) -- the NEW record, not this dying one');
  assert.equal(ram.u16(a5 + SLOT12.stateField), 0, "...and this record's ($4) is untouched");
});

// ===============================================================================================
// SECTION 8 -- WHERE IT LANDS, AND THE ONE DEFECT IN A FILE THIS WAVE DOES NOT OWN
// ===============================================================================================

test('W387 SECTION 8: the loop closes onto the SAME machine a plain cold boot rests on', () => {
  // No coin, no START, nothing: the attract sequencer's own idle. If the handover landed the
  // machine anywhere else, "the loop closed" would be a word rather than a measurement.
  //
  // **W392 RE-BASES HOW THIS IS MEASURED, AND IT IS THE LAST TIME IT WILL NEED TO BE.** Every
  // wave from W388 on re-pinned ONE state word at ONE frame, because the sequencer had a place
  // it rested. It has none: arm 5's `$25C592`/`$25C6D4` is ported, its carry comes out clear
  // after $10 + $960 - 1 = 2,415 frames and `teardown25A9B2` puts the machine back on arm 2.
  // A single `assert.equal(g.ram.u16(STATE), N)` is now an assertion about where a 4,032-frame
  // cycle happened to be when the loop counter ran out -- trap 16, and the third wave running.
  // So the STRUCTURAL claim is measured structurally: the two runs walk the SAME ARM SEQUENCE.
  // `leave2` is the high-score screen's own state word ($812E5C) ON THE FRAME the sequencer
  // first reaches ARM 5 -- a fixed point of the cycle, well past arm 2, that both runs pass
  // through. Reading it at the LAST frame instead compares two runs standing at different
  // points of the same cycle, which is a phase difference reported as a divergence.
  const arms = (game, frames) => {
    const out = [];
    let prev = -1, leave2 = -1;
    for (let f = 1; f <= frames; f++) {
      game.step(NO_PLAYER);
      const a = game.ram.u16(STATE);
      if (a !== prev) {
        if (a === 5 && leave2 < 0) leave2 = game.ram.u16(0x812e5c);
        out.push(a); prev = a;
      }
    }
    return { seq: out, leave2 };
  };
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);
  const coldRun = arms(g, 4400);
  const cold = coldRun.seq;
  const coldLeave2 = coldRun.leave2;
  // The plain cold boot opens on arm 13, the warning screen, which only a RESET reaches.
  assert.deepEqual(cold, [13, 2, 12, 9, 1, 5, 2], 'the plain cold boot walks one whole lap');

  // ...and the looped-back run, from the frame slot [12] handed dispatch type 8 back.
  const gl = bootToGameplay();
  for (let f = 1; f < RUN.firstEightBack; f++) gl.step(NO_PLAYER);
  // The same 4,400 frames catch SEVEN transitions here and six there -- the loop-back enters
  // the cycle one arm in, so its window reaches one arm further. Comparing the sequences means
  // comparing the same NUMBER of them; comparing the raw lists would be reporting the window's
  // offset as a divergence.
  const loopedFull = arms(gl, 4400);
  const looped = loopedFull.seq.slice(0, cold.length - 1);
  assert.deepEqual(looped, cold.slice(1),
    'the loop-back enters at state 2 -- $28F3A4 wrote ($4,A0) = 2 -- and from there it walks '
    + 'the IDENTICAL arm sequence a reset does, arm 13 excepted. That is what "the loop closes '
    + 'onto the same machine" means once the machine no longer stands still');
  assert.equal(loopedFull.leave2, coldLeave2,
    '...with the high-score screen in the same internal state ($812E5C) on the frame each run '
    + 'reaches arm 5');
  assert.equal(coldLeave2, 0x0002,
    "...and that state is 2, left there by the $246800 on arm 2's way out");
  assert.ok(liveTypes(g).has(TYPE_8), 'and dispatch type 8 is live on both');
  assert.ok(RUN.types.has(TYPE_8));

  // **W388 CAME THROUGH HERE, WHICH IS WHAT THIS ASSERTION WAS FOR.** W387 measured both runs
  // resting at `$812E56 = 2` with arm 2 parked in its own state 2, and said the wave that fixed
  // it would have to re-base this test. It did: `$246710`'s per-node content seeding
  // (`$24676A..$2467C3`) is ported in `animobjects.js`, the eight-node chain drains in 16 frames,
  // and `$25A940` moves the sequencer to arm 12.
  //
  // **AND W389 CAME THROUGH THE SAME WAY.** Arm 12's own screen (`$25C2AE`/`$25C2EA`) is ported
  // now, it drains its two chains and `$25AA2C` hands on to arm 9 at +878.
  //
  // **AND SO DID W390.** Arm 9's screen (`$25C3E8`/`$25C424`) is ported too, it drains ITS two
  // chains and `$25AA02` hands on to arm 1 at +1,182.
  //
  // **AND SO DID W391.** Arm 1's screen (`$25BBB4`/`$25BD7C`) is ported, it drains its two
  // chains and its $1E0 timer and `$25A908` hands on to arm 5 at +1,918. **Arm 5 is the new
  // unported end of the chain**, and it really is the last one: `$25C6D4`, arm 5's body, is all
  // that stands between this and an attract loop that closes on itself, because
  // `teardown25A9B2` -- the routine behind its carry, which writes `#$2` back into a fresh
  // record -- has been ported since W375.
  //
  // **AND W392 CAME THROUGH AND ENDED THE SEQUENCE.** Arm 5's screen is ported, the carry comes
  // out CLEAR, `$25A9AE` falls into `teardown25A9B2` and the sequencer goes back to arm 2. There
  // is no "resting place" left to re-base -- there is a CYCLE, and the assertion above compares
  // the two runs' walks through it rather than one word at one frame.
  //
  // The STRUCTURAL claim this test carries is untouched and is the one that matters: the looped
  // run and the plain cold boot land on the SAME machine.
  assert.ok([0x1, 0x2, 0x5, 0x9, 0xc].includes(g.ram.u16(STATE)),
    'both runs are ON the attract cycle 2 -> 12 -> 9 -> 1 -> 5 -> 2, not parked off it');
  // The `$812E5C == 2` that stood here was read at the LAST frame of the window, and at +4,400
  // the cold boot is 66 frames into its SECOND arm 2 -- `$25B3DC`'s five-word clear has already
  // put the word back to 0 and the screen has stepped it to 1. The claim ("arm 2 left its own
  // state at 2") is made ABOVE, at `leave2`, on a frame both runs actually share.
});

test('W388 SECTION 8 RE-BASE: objslot14.js hands queueKill the ID, and type $E really dies', () => {
  // The disassembly is UNCHANGED and re-verified: $288C62 is `JMP $241292`; $241292 is
  // `lea ($4C,A5),A0 / bra $241238`; $241252 is `move.l (A0),(A1)`. So the queued value is the
  // LONGWORD AT ($4C,A5) -- the object's ID -- and never the type word at ($0,A5).
  assert.equal(l(0x28f37a), 0x4eb90024, '$28F37A jsr...');
  assert.equal(w(0x28f37e), 0x1292, '...$241292, the same routine slot [14] tail-jumps to');
  assert.equal(l(0x241292), 0x41ed004c, '$241292 lea ($4C,A5),A0');
  assert.equal(w(0x241296), 0x60a0, '...then bra $241238');
  assert.equal(w(0x241252), 0x2290, '$241252 move.l (A0),(A1) -- the LONG AT ($4C,A5)');
  assert.equal(SLOT14.idAt, 0x4c, 'and objslot14.js names that field rather than a literal');

  // **THE MEASUREMENT, INVERTED BY W388.** W387 asserted the DEFECT as a live fact: type $E was
  // still in the table 586 frames after it staged its successor and asked to die, because
  // `objslot14.js:68` passed `ram.u16(a5 + 0x00)` -- the type word $800E -- where `$241292` takes
  // the ID. `killById` compares 16 bits, $800E never matched the id $0001, and the kill silently
  // did nothing every time. `src/objslot14.js` now passes `ram.u32(a5 + SLOT14.idAt)`.
  assert.ok(!RUN.types.has(0x0e),
    'dispatch type $E is GONE -- its queued kill matched and $2411E2 vacated the slot');
  assert.equal(slotOf(RUN.g, 0x0e), 0, '...and no table slot holds it any more');
  // Slot [12] never had the bug, and still does not: the two now behave identically.
  assert.ok(!RUN.types.has(TYPE_C), 'slot [12] passes the ID too, and its record really died');
});
