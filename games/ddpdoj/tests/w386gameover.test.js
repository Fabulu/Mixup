// W386 -- THE GAME-OVER SCREEN. `$2252F8` IS A FADE TARGET, NOT A SCRIPT, AND ITS BOUND IS $40.
//
// ===============================================================================================
// THE ANSWER IN ONE LINE
// ===============================================================================================
//
// A cold boot with no buttons held no longer stops. `$2252F8` is the 64-byte ROM COLOUR BLOCK the
// game-over screen fades sprite staging bank 2 toward; one 64-byte window serves it, and behind it
// the whole screen runs to completion and hands the machine on.
//
// THE CHAIN, ON A REAL COLD BOOT, MEASURED IN THIS FILE:
//
//   +4,075  the life counter borrows to -1 ($25FFC4), `$25FFA8` arms bonus-line request 2
//   +4,077  `$260056` creates dispatch type $D -- objslot13.js, the GAME-OVER object
//   +4,079  its state 4 ($288A3C) posts both sound commands, wipes the object table and
//           stages dispatch type $E
//   +4,080  slot [14] state 0 ($288BCE) runs `$288C14 lea ($18,PC),A0 / $288C1A jsr $246410`
//           on the table at $288C2E, whose ONE entry targets $2252F8. **W385 DIED HERE.**
//   +4,169  the fade has finished: all 32 words of $80E906 equal all 32 words of $2252F8
//   +4,414  slot [14]'s $12C-frame counter runs out, it stages dispatch type $C and kills itself
//   ...     and dispatch [12] ($28F3AC) is a COUNTED note from that frame on, once per frame
//
// ===============================================================================================
// WHERE THE BRIEF THAT SET THIS WAVE IS WRONG. FOUR PLACES, ALL PINNED BELOW.
// ===============================================================================================
//
// 1. **"`$2252F8` is animation-object script/target data" and "find its extent in the CODE that
//    READS it".** It is neither a script nor a node table: it is the fade TARGET, a plain
//    64-byte xRGB555 colour block, and `animobjects.js:233`'s `rom.u16(target)` is the only
//    thing in the port that touches it. The bound is therefore NOT in `$246410`'s reader and NOT
//    in `$246710`'s -- it is the `words-minus-one` FIELD of the one entry that names it, plus
//    `$246B2A`'s `dbra`. SECTION 2.
//
// 2. **"`$246710`/`$246704` read a node-count word then four words per node. Two different
//    families that look alike."** True of the family, and NOT the one here: `$288C1A` is a
//    `4EB9 00246410`, asserted as bytes in SECTION 1. (The $246704 family IS live on this
//    screen's successor -- `$28F520 lea / $28F526 jsr $246704` on the table at `$28FAD2` -- but
//    slot [12] is unported, so nothing reads it. SECTION 6.)
//
// 3. **"NEVER WIDEN AN EXISTING WINDOW."** Obeyed, and it matters more here than the brief knew:
//    W91's window is `[$222A78, $2252F8)` and its EXCLUSIVE far end is this window's BASE. The
//    two abut with a zero-byte gap, which is exactly the shape that invites a widening. W91's
//    own `check_palette_upload_family` DERIVES the sprite-bank bound from that declaration, so
//    widening it would have silently moved a different check's goalposts. SECTION 3.
//
// 4. **"EXPECT MORE BEHIND IT ... expect further gaps."** There are none that STOP anything.
//    60,000 frames past START were measured with no throw at all, and the only note that grows
//    after the game-over screen is `$240FC2`, dispatch slot [12], which was already counted.
//    SECTION 5 and SECTION 6.
//
// AND ONE DEFECT FOUND ON THE WAY, IN THE ROUTINE THAT DOES THE READ: `stepNode`'s two cursor
// strides were TRANSPOSED. SECTION 4.
//
// ===============================================================================================
// W387: FOUR ASSERTIONS IN THIS FILE ARE RE-BASED, AND NOT ONE MEASUREMENT IS RETRACTED
// ===============================================================================================
//
// W387 ported and registered dispatch slot [12] (`src/objslot12.js`), so the machine no longer
// STOPS at +4,414 -- it runs the name-entry screen and hands back to the attract sequencer. Every
// assertion here that was really "and this is the resting state of the machine" had to say WHICH
// FRAME it meant instead. All four are marked at their sites:
//
//   1. "the fade RUNS" now reads the staging bank at `fadeDone` (+4,169) rather than at +5,000.
//      Slot [12]'s state-0 init installs `$2254B8` into sprite bank 2, which IS `$80E906`, so the
//      fade still lands exactly and the next screen then legitimately replaces it.
//   2. "the window OVERLAPS NOTHING" -- the neighbour above `$2252F8` is now W387's `$225478`
//      with $140 clear, not W125's `$2254B8` with $180. Nothing was widened at either end.
//   3. the deferral census -- `$240FC2` is gone entirely and slot [12]'s four one-shot teardown
//      notes take its place. The test is renamed for what it now measures.
//   4. "$2254F8 has no window" and its two siblings are now DECLARED, by W387, at exactly the
//      $40 this file's own `$001F` measurement predicted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { Ram } from '../src/ram.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { ANIM_OBJECT, loadAnimObjects246410, runAnimObjects24683E } from '../src/animobjects.js';
import { RomWindows } from '../src/rom.js';
import { Unreached } from '../src/unported.js';
import { SCREEN13, objSlot13 } from '../src/objslot13.js';
import { SoundState, dequeue, postWrapper } from '../src/sound.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const tablesJson = JSON.parse(readFileSync(here('../rip/port/player.tables.json'), 'utf8'));
const IMG = readFileSync(here('../rip/sound/maincpu.bin'));

/** A word / longword straight out of the cartridge image, for the disassembly sections. */
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const NO_PLAYER = 0xffff;
const STATE = 0x812e56;               // SCREEN8.state
const TABLE = 0x288c2e;               // the animation table $288C14's lea resolves to
const TARGET = 0x2252f8;              // its one entry's target.l -- THE WINDOW
const LENGTH = 0x40;                  // ...and the bound SECTION 2 derives
const CURRENT = 0x80e906;             // $80E886 + the entry's $80 offset -- staging bank 2
const W91 = 0x222a78;                 // the neighbour that must NOT be widened

/** `COIN_BITS.COIN1` IS A BIT INDEX OF 0, so the held-coin word is `$FFFE` and NOT `$FFFF`
 *  (`w383coldboot.test.js` SECTION 1 pins both halves of that trap as bare values). */
const coinWord = () => (0xffff & ~(1 << COIN_BITS.COIN1)) & 0xffff;

/** `w383coldboot.test.js` / `w385player.test.js`'s cold-boot chain, unchanged, with its final
 *  milestone checked so nothing below can measure a run that never started. `tables` is a
 *  parameter ONLY so SECTION 3 can run the identical boot with one window removed. */
function bootToGameplay(tables = tablesJson) {
  const g = new Game(new Uint8Array(0x20000), tables, { palCatchUp: false });
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

/** The 32 words of the ROM block, masked the way `stepNode` compares them. */
const romWords = () => [...Array(32)].map((_, i) => w(TARGET + i * 2) & 0x7fff);

// ===============================================================================================
// ONE COLD-BOOT RUN, SHARED. Every section below reads a different fact out of the SAME run, so
// the sections cannot disagree with each other about what the machine did. 5,000 frames past
// START -- far enough past the +4,414 handover to prove the screen finished, not merely started.
// ===============================================================================================
const RUN = (() => {
  const g = bootToGameplay();
  const rom = romWords();
  const cur = () => [...Array(32)].map((_, i) => g.ram.u16(CURRENT + i * 2) & 0x7fff);
  const matched = () => cur().filter((v, i) => v === rom[i]).length;
  const types = () => {
    const s = new Set();
    for (let i = 0; i < ALLOC.slots; i++) {
      const t = g.ram.u16(ALLOC.table + i * ALLOC.stride);
      if (t !== 0) s.add(t & 0x7fff);
    }
    return s;
  };

  let firstD = 0, firstE = 0, firstC = 0, fadeDone = 0, matchedAtFirstE = 0;
  let stoppedAt = 0, stopError = null, lastFrame = 0;
  let notesAt4079 = null, currentAtFadeDone = null;

  for (let f = 1; f <= 5000; f++) {
    try {
      g.step(NO_PLAYER);
    } catch (e) { stopError = e; stoppedAt = f; break; }
    const t = types();
    if (!firstD && t.has(0x0d)) firstD = f;
    if (!firstE && t.has(0x0e)) { firstE = f; matchedAtFirstE = matched(); }
    if (!firstC && t.has(0x0c)) firstC = f;
    if (!fadeDone && matched() === 32) { fadeDone = f; currentAtFadeDone = cur(); }
    if (f === 4079) notesAt4079 = new Set(g.unportedLog.report().map((s) => s.split(' x ')[1]));
    lastFrame = f;
  }

  return {
    g, firstD, firstE, firstC, fadeDone, matchedAtFirstE, stoppedAt, stopError, lastFrame,
    notesAt4079, current: cur(), currentAtFadeDone, rom, notes: g.unportedLog.report(),
    // W425 (D58): the `$28BBAC`-tier command as the DRAIN saw it, not as a call site meant it.
    bgmCommands: g.sound.doorLog.filter((d) => d.word === 0x15000000).length,
    globalReleases: g.sound.doorLog.filter((d) => d.word === 0x10000000).length,
  };
})();

const noteFor = (addr) => {
  const key = `$${addr.toString(16).toUpperCase()} `;
  return RUN.notes.find((s) => s.includes(` x ${key}`)) ?? null;
};
const noteCount = (addr) => {
  const line = noteFor(addr);
  return line === null ? 0 : Number(line.trim().split(' ')[0]);
};

// ===============================================================================================
// 1 -- WHO READS `$2252F8`, AND WHICH FORMAT FAMILY IT IS. FROM THE IMAGE, NOT FROM ADJACENCY.
//
// The brief listed two loader families that "look alike". This settles which one by asserting
// the four bytes of the `jsr`, and it pins the SECOND, independent bound on the table: the byte
// after its one entry is CODE that `src/objslot14.js` already names.
// ===============================================================================================

test('W386 $288C14 names $288C2E and hands it to $246410 -- the FOURTEEN-byte family', () => {
  // `41FA` is `lea (d16,PC),A0` and the EA is the EXTENSION WORD's address plus the
  // displacement -- $288C16 + $18 -- NOT the opcode's address (trap 4). Reading it from the
  // opcode gives $288C2C, which is the `rts`.
  assert.equal(w(0x288c14), 0x41fa, '$288C14 lea (d16,PC),A0');
  assert.equal(w(0x288c16), 0x0018, '  ...displacement $0018');
  assert.equal(0x288c16 + w(0x288c16), TABLE, '  ...so A0 = $288C2E, the table');
  assert.notEqual(0x288c14 + w(0x288c16), TABLE,
    'and measuring from the OPCODE gives $288C2C, the rts -- trap 4, stated as a value');

  assert.equal(w(0x288c18), 0x4e71, '$288C18 nop');
  assert.equal(w(0x288c1a), 0x4eb9, '$288C1A jsr (xxx).L');
  assert.equal(l(0x288c1c), 0x00246410, '  ...of $246410 -- the FILL loader, 14 bytes per entry');
  // The brief's other family, ruled out as a value rather than by prose.
  assert.notEqual(l(0x288c1c), 0x00246704, 'and NOT $246704, the four-words-per-node family');
  assert.notEqual(l(0x288c1c), 0x00246710, 'and NOT $246710 either');

  // $246410's own head, so "14 bytes per entry" is not taken on trust. TWO entry points that
  // differ only in D6, exactly as animobjects.js's header describes.
  assert.equal(w(0x246410), 0x48e7, '$246410 movem.l ...,-(A7)');
  assert.equal(w(0x246414), 0x3c3c, '$246414 move.w #imm,D6');
  assert.equal(w(0x246416), 0x0001, '  ...#$1 -- the mode-1 entry');
  assert.equal(w(0x246418), 0x6008, '$246418 bra.s $246422 -- past $24641A\'s `moveq #$0`');
  assert.equal(w(0x24643c), 0x3018, '$24643C move.w (A0)+,D0 -- THE COUNT WORD');
});

test('W386 the $288C2E table is ONE 14-byte entry, and the byte after it is CODE', () => {
  assert.equal(w(TABLE), 0x0001, '$288C2E count.w = 1');
  assert.equal(w(TABLE + 0x02), 0x0000, '  fill.w      $0000   ($246472 move.w (A0)+,($12,A2))');
  assert.equal(w(TABLE + 0x04), 0x0000, '  family.w    $0000   ($246476 move.w (A0)+,D2)');
  assert.equal(w(TABLE + 0x06), 0x0080, '  offset.w    $0080   ($246486 adda.w (A0)+,A3)');
  assert.equal(l(TABLE + 0x08), TARGET, '  target.l    $2252F8 ($24648C move.l (A0)+,($A,A2))');
  assert.equal(w(TABLE + 0x0c), 0x001f, '  words-1.w   $001F   ($246490 move.w (A0)+,($4,A2))');
  assert.equal(w(TABLE + 0x0e), 0x0005, '  timing.w    $0005   ($246494 move.w (A0)+,D3)');

  // 2 + 14 = 16, so the entry's last byte is $288C3D. THE OTHER BOUND: $288C3E is the first
  // instruction of slot [14] STATE 2, which src/objslot14.js has named since W372. A second
  // entry would run the loader straight into executable code.
  assert.equal(w(0x288c3e), 0x536d, '$288C3E subq.w #1,(d16,A5)');
  assert.equal(w(0x288c40), 0x001c, '  ...($1C,A5) -- objslot14.js state2\'s first instruction');
  assert.equal(TABLE + 2 + 14, 0x288c3e, 'so the table ends exactly where the code begins');

  // And $246486 is `adda.w`, not `adda.l`: the offset is ONE word, which is what makes the
  // entry 14 bytes and not 16. Asserted as the opcode, because the field order is the trap.
  assert.equal(w(0x246486), 0xd6d8, '$246486 adda.w (A0)+,A3 -- a WORD offset, sign-extended');
  assert.equal(w(0x24648c), 0x2558, '$24648C move.l (A0)+,($A,A2) -- the target is a LONG');
});

// ===============================================================================================
// 2 -- THE BOUND, STATED BY THE CODE THAT READS THE BLOCK. NEVER BY AN ABSENCE.
//
// `$246878` is the per-node executor. It puts the entry's `words-minus-one` in D5 and the
// entry's `target` in A2, reads `(A2)` once per iteration, and the loop is a `dbra` -- N+1 times
// (trap 2). $001F + 1 = 32 words = $40 bytes. Nothing here appeals to what the bytes look like.
// ===============================================================================================

test('W386 $24688C puts words-minus-one in D5 and $246B2A dbra\'s it -- 32 words, $40 bytes', () => {
  assert.equal(w(0x246884), 0x246c, '$246884 movea.l (d16,A4),A2');
  assert.equal(w(0x246886), 0x000a, '  ...($A,A4) -- N.target, so A2 IS the ROM cursor');
  assert.equal(w(0x246888), 0x266c, '$246888 movea.l (d16,A4),A3');
  assert.equal(w(0x24688a), 0x000e, '  ...($E,A4) -- N.current, the RAM cursor');
  assert.equal(w(0x24688c), 0x3a2c, '$24688C move.w (d16,A4),D5');
  assert.equal(w(0x24688e), 0x0004, '  ...($4,A4) -- the field $246490 filled from words-minus-one');

  assert.equal(w(0x2468da), 0x3212, '$2468DA move.w (A2),D1 -- THE READ, and it is a WORD');
  assert.equal(w(0x246b28), 0xd4c6, '$246B28 adda.w D6,A2 -- the ROM cursor steps');
  assert.equal(w(0x246b2a), 0x51cd, '$246B2A dbra D5,...');
  assert.equal(0x246b2c + (w(0x246b2c) - 0x10000), 0x2468da,
    '  ...back to $2468DA, THE READ ITSELF -- the displacement is measured from the EXTENSION '
    + 'word $246B2C, and $2468D6\'s `lea ($30,A4),A5` sits OUTSIDE the loop');

  // THE ARITHMETIC, spelled out, because "dbra runs N+1 times" is trap 2 and an off-by-one
  // here is a 62-byte window that reads fine for 31 words and throws on the last one.
  const wordsMinusOne = w(TABLE + 0x0c);
  assert.equal(wordsMinusOne, 0x001f, 'the entry says $001F');
  assert.equal((wordsMinusOne + 1) * 2, LENGTH, 'and $1F + 1 = 32 words = $40 bytes, not $3E');

  // The far end named as an address: the last word read is at $225336 and the last BYTE at
  // $225337. A window of $3E would stop at $225335 and the final `move.w (A2),D1` would throw.
  assert.equal(TARGET + LENGTH - 2, 0x225336, 'the last WORD read is $225336');
  assert.equal(TARGET + LENGTH - 1, 0x225337, 'the last BYTE read is $225337');
});

test('W386 timing index 5 is 1 step every 2 frames, so the fade is 32 steps and 64 frames', () => {
  // $246494 move.w (A0)+,D3 / $246496 andi.w #$1F,D3 / add.w D3,D3 twice / lea ($698,PC),A3.
  assert.equal(w(0x246496), 0x0243, '$246496 andi.w #imm,D3');
  assert.equal(w(0x246498), 0x001f, '  ...#$1F -- the index is masked to 32 entries');
  assert.equal(w(0x24649a), 0xd643, '$24649A add.w D3,D3');
  assert.equal(w(0x24649c), 0xd643, '$24649C add.w D3,D3 -- so the stride is FOUR bytes');
  assert.equal(w(0x24649e), 0x47fa, '$24649E lea (d16,PC),A3');
  assert.equal(0x2464a0 + w(0x2464a0), 0x246b38, '  ...= $246B38, the timing table (trap 4 again)');
  // Entry 5 is two longwords in: (reload, step) = ($2, $1).
  assert.equal(w(0x246b38 + 5 * 4), 0x0002, 'entry 5 reload = 2 frames per step');
  assert.equal(w(0x246b38 + 5 * 4 + 2), 0x0001, 'entry 5 step = 1 -- one channel unit per step');
});

// ===============================================================================================
// 3 -- THE WINDOW: DECLARED, DISJOINT, AND PROVED BY ABLATION WITH A POSITIVE CONTROL.
// ===============================================================================================

const windows = tablesJson.rom.windows.map((x) => ({
  base: parseInt(String(x.base).replace('$', ''), 16), len: x.len, why: x.why,
}));

test('W386 the export declares exactly ($2252F8, $40), and its bytes are the cartridge\'s', () => {
  const mine = windows.filter((x) => x.base === TARGET);
  assert.equal(mine.length, 1, 'exactly one declaration of $2252F8');
  assert.equal(mine[0].len, LENGTH, '...and it is $40 bytes, the length SECTION 2 derived');
  assert.match(mine[0].why, /W386/, '...declared by this wave');

  // The window SERVES the right bytes, read through RomWindows the way the port reads them.
  const rom = new RomWindows(tablesJson.rom);
  for (let i = 0; i < 32; i++) {
    assert.equal(rom.u16(TARGET + i * 2), w(TARGET + i * 2),
      `word ${i} of the block matches the cartridge image`);
  }
});

test('W386 the window OVERLAPS NOTHING, and ABUTS W91 rather than widening it', () => {
  for (const x of windows) {
    if (x.base === TARGET && x.len === LENGTH) continue;
    assert.ok(x.base >= TARGET + LENGTH || TARGET >= x.base + x.len,
      `[$${TARGET.toString(16)}, $${(TARGET + LENGTH).toString(16)}) overlaps `
      + `[$${x.base.toString(16)}, $${(x.base + x.len).toString(16)}) -- ${x.why.slice(0, 60)}`);
  }

  // THE NEIGHBOUR CHECK, as a value. W91's window is still $2880 bytes and its EXCLUSIVE far
  // end is this window's base: a zero-byte gap, which is the shape that invites a widening.
  const w91 = windows.filter((x) => x.base === W91);
  assert.equal(w91.length, 1, 'W91 declares $222A78 exactly once');
  assert.equal(w91[0].len, 0x2880, 'and it is STILL $2880 -- this wave widened nothing');
  assert.equal(W91 + w91[0].len, TARGET, 'W91 ends AT $2252F8, so the two abut exactly');

  // The other side. W386 measured "the next declared window above is W125's $2254B8, $180 bytes
  // clear". W387 declared ($225478, $40) in that gap -- one of slot [12]'s four palette sources --
  // so the nearest neighbour above is now $225478 with $140 bytes clear. Nothing was widened at
  // either end: W386's own line is still ($2252F8, $40), asserted above, and W125's $2254B8 is
  // still $40. The gap shrank because a NEW window was declared in it, which is the shape this
  // whole test is here to enforce.
  const above = windows.filter((x) => x.base > TARGET).sort((a, b) => a.base - b.base)[0];
  assert.equal(above.base, 0x225478, 'the next window above is W387\'s $225478');
  assert.match(above.why, /W387/, '...and it is W387\'s declaration, not a widened W386');
  assert.equal(above.base - (TARGET + LENGTH), 0x140, '...with $140 bytes of nothing between');
  const w125 = windows.filter((x) => x.base === 0x2254b8);
  assert.deepEqual(w125.map((x) => x.len), [0x40], 'and W125\'s $2254B8 is STILL $40');
});

test('W386 ABLATION: remove ONLY this window and the same cold boot dies at $2252F8', () => {
  // The identical boot, the identical frames, one window filtered out of the export. Nothing
  // else differs -- this is the same `bootToGameplay` the shared RUN uses.
  const ablated = {
    ...tablesJson,
    rom: { ...tablesJson.rom, windows: tablesJson.rom.windows.filter((x) => x.base !== '$2252F8') },
  };
  assert.equal(ablated.rom.windows.length, tablesJson.rom.windows.length - 1,
    'exactly ONE window was removed');

  const g = bootToGameplay(ablated);
  let err = null, at = 0;
  for (let f = 1; f <= 4300; f++) {
    try { g.step(NO_PLAYER); } catch (e) { err = e; at = f; break; }
  }
  assert.ok(err instanceof Unreached, `a NAMED Unreached, not a bare crash; got ${err}`);
  assert.equal(err.romAddress, TARGET, 'THE ABLATION ADDRESS: $2252F8');
  assert.match(err.stack, /animobjects\.js/, 'read by animobjects.js stepNode');
  assert.match(err.stack, /runAnimObjects24683E/, '...from runAnimObjects24683E');

  // **THE FRONTIER FRAME IS +4,082, NOT THE +4,081 THE BRIEF AND `w385player.test.js`'s PROSE
  // BOTH GIVE.** The load is on +4,080 (SECTION 5 measures it) and the read is the THIRD
  // `$24683E` after it, because `$2468A2 subq.w #1,($14,A4)` must BORROW before the loop is
  // entered and timing index 5 seeds that countdown at 2: +4,080 takes it 2 -> 1, +4,081 takes
  // it 1 -> 0, and only +4,082 borrows. W385's own assertion was a RANGE (3,900..4,300), so
  // the prose was never checked. This asserts the frame as a bare number instead.
  // **W418 MOVED IT ONE FRAME EARLIER, TO +4,081, AND THE REASON IS ONE `bra`.** `$288B5E bcc
  // $288B6C` / `$288B62 move.b #$4,($2,A5)` / **`$288B68 bra $288A3C`** -- the exit arm sets the
  // state AND RUNS state 4's body in the SAME frame. `objslot13.js exitArm` used to set the byte
  // and return, deferring `$24107C` and the type-$E create to the next frame. Everything
  // downstream of slot [13] therefore shifted by exactly one frame and by nothing else: firstE,
  // firstC, the type-8 return and this frontier all moved -1, and `firstD` (slot [13]'s own
  // arrival, which is upstream) did not move at all. The relative claims below are untouched.
  assert.equal(at, 4081, 'at frame +4,081 past START, three $24683E calls after the +4,079 load');
  assert.equal(at - RUN.firstE, 2, '...i.e. two frames after the chain appeared');
  assert.equal(w(0x246b38 + 5 * 4), 2, 'and 2 is exactly the reload timing index 5 selects');

  // POSITIVE CONTROL, the same claim from the other side: WITH the window, the shared RUN
  // walked straight through that frame and kept going.
  assert.equal(RUN.stopError, null, 'and with the window present the run does not stop at all');
  assert.ok(RUN.lastFrame > at, `it reached +${RUN.lastFrame}, past the ablated +${at}`);
});

// ===============================================================================================
// 4 -- A DEFECT IN THE ROUTINE THAT DOES THE READ: THE TWO CURSOR STRIDES WERE TRANSPOSED.
//
// `$246890..$246898` builds D6 as 2-or-0 from `($1E,A4)`, and D6 is added to **A2, the ROM
// cursor**. The RAM cursor A3 is unconditionally `addq.w #2`. This port had it the other way
// round. Every ported caller leaves `($1E)` at zero, so both strides are 2 on every live path
// and nothing measured moves -- which is exactly why it survived: it is only distinguishable
// with the field set directly, and no fixture had ever set it.
// ===============================================================================================

test('W386 $246B28 adds the CONDITIONAL stride to A2 (ROM) and $246B24 adds 2 to A3 (RAM)', () => {
  assert.equal(w(0x246890), 0x7c00, '$246890 moveq #$0,D6');
  assert.equal(w(0x246892), 0x4a6c, '$246892 tst.w (d16,A4)');
  assert.equal(w(0x246894), 0x001e, '  ...($1E,A4) -- N.shared');
  assert.equal(w(0x246896), 0x6602, '$246896 bne.s $24689A -- skips ONE instruction (trap 7)');
  assert.equal(w(0x246898), 0x7c02, '$246898 moveq #$2,D6 -- so D6 is 2 only when ($1E) is ZERO');

  assert.equal(w(0x246b24), 0x544b, '$246B24 addq.w #2,A3 -- the RAM cursor, UNCONDITIONALLY 2');
  assert.equal(w(0x246b28), 0xd4c6, '$246B28 adda.w D6,A2 -- the ROM cursor takes the 2-or-0');
  // A3 is ($E,A4) = N.current and A2 is ($A,A4) = N.target; SECTION 2 asserted both loads.
});

test('W386 a `shared` node re-reads ONE ROM word across the whole range', () => {
  // A directly-seeded node, because NO PORTED SITE SETS ($1E): both loaders clear it
  // ($246466 `move.w #0,($1E,A2)`), so this arm cannot be driven from a cold boot and a test
  // that waited for one would never run. The OTHER arm is driven from a cold boot, by SECTION 5.
  const ram = new Ram(null);
  const rom = new RomWindows(tablesJson.rom);
  const node = ANIM_OBJECT.nodes;
  const seed = (shared) => {
    ram.setU16(node + 0x00, 0x8000);              // status
    ram.setU32(node + 0x06, 0x80fa66);            // writer -- the dirty word
    ram.setU32(node + 0x0a, TARGET);              // target: the W386 block
    ram.setU32(node + 0x0e, CURRENT);             // current: staging bank 2
    ram.setU16(node + 0x04, 3);                   // words-minus-one: FOUR words
    ram.setU16(node + 0x14, 0);                   // countdown -- fire this frame
    ram.setU16(node + 0x16, 0);                   // reload
    ram.setU16(node + 0x1c, 0x1f);                // step $1F -- one frame is enough to arrive
    ram.setU16(node + 0x18, 0xffff);              // active
    ram.setU16(node + 0x20, 0);                   // progress
    ram.setU16(node + 0x1e, shared);              // THE FIELD UNDER TEST
    for (let i = 0; i < 4; i++) ram.setU16(CURRENT + i * 2, 0x7fff);
    ram.setU32(ANIM_OBJECT.roots + 0x2c, node);
    ram.setU16(ANIM_OBJECT.roots, 0x8000);
    ram.setU16(ANIM_OBJECT.roots + 0x04, 0);      // mode 0 -- never auto-freed
    ram.setU32(node + 0x2c, 0);
  };

  seed(0);
  runAnimObjects24683E(ram, rom);
  const walking = [...Array(4)].map((_, i) => ram.u16(CURRENT + i * 2));
  assert.deepEqual(walking, [...Array(4)].map((_, i) => w(TARGET + i * 2) & 0x7fff),
    'shared = 0: the ROM cursor WALKS, so word i arrives at ROM word i');

  seed(1);
  runAnimObjects24683E(ram, rom);
  const held = [...Array(4)].map((_, i) => ram.u16(CURRENT + i * 2));
  assert.deepEqual(held, [w(TARGET) & 0x7fff, w(TARGET) & 0x7fff,
    w(TARGET) & 0x7fff, w(TARGET) & 0x7fff],
  'shared = 1: D6 is 0, A2 never moves, and ALL FOUR words arrive at ROM word 0');
  assert.notDeepEqual(held, walking, 'the two arms really are distinguishable');
});

// ===============================================================================================
// 5 -- THE REAL COLD BOOT. NOT A FIXTURE: `bootToGameplay` then `g.step(NO_PLAYER)` to +5,000.
// ===============================================================================================

test('W386 the cold boot reaches the game-over screen and DOES NOT STOP', () => {
  assert.equal(RUN.stopError, null,
    `no throw in 5,000 frames past START; got ${RUN.stopError}`);
  assert.equal(RUN.lastFrame, 5000, 'and every one of those frames completed');

  // The chain, by frame. Each of these is a DIFFERENT object dispatch type entering the table.
  // W418: firstD is UPSTREAM of the change and did not move; the two below are downstream of
  // `$288B68 bra $288A3C` and each moved by exactly one frame. See SECTION 4's note.
  assert.equal(RUN.firstD, 4077, 'type $D -- objslot13.js, the GAME-OVER object, at +4,077');
  assert.equal(RUN.firstE, 4079, 'type $E -- objslot14.js, which loads the $288C2E table, at +4,079');
  assert.equal(RUN.firstC, 4413, 'type $C -- the handover, at +4,413');
  assert.equal(RUN.firstE - RUN.firstD, 2,
    'slot [13] hands over TWO frames after it appears, not three: its exit arm no longer '
    + 'defers state 4 by a frame');

  // AND THE FRAME W385 DIED ON IS INSIDE THAT. The first `$24683E` after the chain was loaded is
  // what the ablation above lands on, and it is still strictly between the load and the handover.
  assert.ok(RUN.firstE < 4081 && 4081 < RUN.firstC,
    'the ablated frontier +4,081 sits between the load and the handover');
});

test('W386 the fade RUNS: 32 staging words converge on the 32 ROM words, exactly', () => {
  // BEFORE. `$246410` fills the range with the entry's `fill` word ($0000) at load time, so on
  // the frame the chain appears only the ROM block's own trailing $0000 agrees.
  assert.equal(RUN.matchedAtFirstE, 1,
    'on the load frame exactly ONE of the 32 words already matches -- the block\'s $0000 tail');

  // AFTER. Not "close to": every word, and the values come out of the image, not this file.
  //
  // **W387 RE-BASES THIS FROM THE LAST FRAME TO `fadeDone`, AND THAT IS A REAL CHANGE.** This
  // assertion used to read `RUN.current`, the bank at +5,000, because when W386 wrote it the
  // machine STOPPED at +4,414 and +5,000 was simply "after the fade". It does not stop any more:
  // W387 registered dispatch slot [12], whose state-0 init runs FOUR `$24150A` installs at
  // `$28F2D8..$28F317`, and the FIRST of them is `lea $2254B8,A0 / move.w #$2,D0` -- **sprite
  // staging bank 2, which is $80E886 + 2*64 = $80E906, this very address.** So the game-over
  // fade still lands exactly, and the next screen then legitimately overwrites the bank.
  //
  // The measurement W386 made is unchanged and is asserted here at the frame it was about.
  assert.deepEqual(RUN.currentAtFadeDone, RUN.rom,
    'all 32 words of $80E906 equal all 32 words of $2252F8, on the frame the fade completes');
  assert.equal(RUN.rom[0], w(TARGET) & 0x7fff, 'and the expectation is the cartridge, not a literal');
  assert.equal(RUN.rom.length, 32, '32 words -- the bound SECTION 2 derived, exercised end to end');

  // ...and the hand-over, as a value, so the re-base above is a measurement and not an excuse.
  assert.equal(w(0x28f2d8), 0x41f9, '$28F2D8 lea xxx.l,A0');
  assert.equal(l(0x28f2da), 0x2254b8, '  ...$2254B8, slot [12]\'s first palette source');
  assert.equal(w(0x28f2e0), 0x0003 - 1, '  ...into bank 2 ($28F2DE move.w #$2,D0)');
  assert.equal(0x80e886 + 2 * 64, CURRENT, 'and bank 2 IS $80E906 -- the same 64 bytes');
  assert.notDeepEqual(RUN.current, RUN.rom,
    'so by +5,000 the name-entry screen has replaced it, which is what the front end closing means');

  // WHEN. Step 1 every 2 frames over 32 progress units is 64 frames of stepping; the channel
  // walk needs a few more because `$246950`'s per-channel move SKIPS index $10 in both
  // directions, so the widest channel takes more units than the narrowest.
  assert.ok(RUN.fadeDone > RUN.firstE && RUN.fadeDone <= RUN.firstE + 120,
    `the fade finished at +${RUN.fadeDone}, ${RUN.fadeDone - RUN.firstE} frames after the load`);
});

// ===============================================================================================
// 6 -- WHAT IS BEHIND IT. COUNTED, WITH THE EXTENTS MEASURED.
// ===============================================================================================

// `$288A3C` and `$288A42` are back-to-back cartridge posts with different packers:
//
//   $288A3C  jsr $28C170  -> $28BBAC -> $15000000, stop BGM.
//   $288A42  jsr $28C0FC  -> $28BB76 -> $10000000, release every immediate SFX voice.
//
// The second command must run before `$24107C` destroys the objects that otherwise own
// selector-specific stop calls.
test('Game Over posts BGM stop then global SFX release before clearing objects', () => {
  assert.equal(noteCount(0x28c170), 0, '$288A3C is posted, not counted');
  assert.equal(noteCount(0x28c0fc), 1,
    'only slot [12]\'s separate $28F380 -> $28C0FC deferral remains counted');
  assert.match(noteFor(0x28c0fc), /^\s*1 x \$28C0FC \$28F380\b/,
    '$288A42 posts while the sole counted $28C0FC call belongs to $28F380');
  assert.ok(RUN.bgmCommands >= 1, '$15000000 drained from the live run');
  assert.ok(RUN.globalReleases >= 1, '$10000000 drained from the live run');
  assert.equal(l(0x288a3c), 0x4eb90028, '$288A3C is a 4EB9...');
  assert.equal(l(0x288a3e), 0x0028c170, '  ...jsr $28C170');
  assert.equal(l(0x288a42), 0x4eb90028, '$288A42 is the next 4EB9...');
  assert.equal(l(0x288a44), 0x0028c0fc, '  ...jsr $28C0FC');

  const ram = new Ram();
  const sound = new SoundState();
  const a5 = ALLOC.table;
  const posts = [];
  const objectWordsAtPost = [];
  const notes = [];
  ram.setU16(a5, 0x800d);
  ram.setU8(a5 + SCREEN13.state, 4);
  ram.setU32(a5 + SCREEN13.idAt, 0x12345678);
  const rom = {
    u16(address) {
      assert.equal(address, SCREEN13.dispatch + SCREEN13.childType * 8 + 4);
      return 9;
    },
  };
  objSlot13(ram, rom, a5, {
    soundPost(address) {
      posts.push(address);
      objectWordsAtPost.push(ram.u16(a5));
      return postWrapper(ram, sound, address);
    },
    unported: { note: (...args) => notes.push(args) },
  });

  assert.deepEqual(posts, [0x28c170, 0x28c0fc]);
  assert.deepEqual(objectWordsAtPost, [0x800d, 0x800d],
    'both commands post before $24107C clears the object table');
  assert.deepEqual(notes, [], '$28C0FC no longer creates an unported note');
  assert.equal(ram.u16(a5), 0, '$24107C clears the former Game Over object');
  assert.equal(dequeue(ram), 0x15000000);
  assert.equal(dequeue(ram), 0x10000000);
  assert.equal(dequeue(ram), null);
});

test('W386 the deferrals behind the screen are slot [12]\'s, and they stop nothing', () => {
  // The census at +4,079 -- the last frame W385 ever saw -- against the census at +5,000.
  //
  // **W387 REPLACES THE ONE NOTE THIS TEST WAS NAMED FOR.** W386 measured exactly one new note,
  // `$240FC2 object dispatch entry [12] -- handler not ported`, counted once per frame from
  // +4,414 to the end of time, because the machine reached a screen with no handler and STAYED
  // THERE. W387 ported and registered that handler (`src/objslot12.js`), so `$240FC2` is gone
  // entirely and what is new behind the game-over screen is the FOUR counted calls inside slot
  // [12]'s own teardown, each fired ONCE. "One note forever" became "four notes once", which is
  // the shape of a screen that ran and handed on rather than a screen that never started.
  const after = new Set(RUN.notes.map((s) => s.split(' x ')[1]));
  const grown = [...after].filter((k) => !RUN.notesAt4079.has(k));
  assert.equal(noteCount(0x240fc2), 0,
    '$240FC2 is NOT counted at all any more -- W387 registered the handler');
  // **W388: the list drops to TWO.** Unit C calls `$24A810` and `$2603DA` for real
  // (`clearPlayerRam24A810` / `clearRankRam2603DA` in `objslot12.js`), so `$28F368` and `$28F374`
  // are no longer counted. `$28F36E` ($259C4A) and slot [12]'s still-deferred
  // `$28F380` call are the two that remain. The Game Over call at `$288A42` is
  // no longer in this census.
  const sites = grown
    .map((k) => (k.match(/^\$[0-9A-F]{6} (\$28F[0-9A-F]{3}) /) ?? [])[1]).filter(Boolean);
  assert.deepEqual(sites.sort(), ['$28F36E', '$28F380'],
    'the new notes are slot [12]\'s unported clear and its own deferred stream post');
  for (const line of RUN.notes.filter((s) => sites.some((x) => s.includes(x)))) {
    assert.match(line, /^\s+1 x /, 'each fires EXACTLY ONCE -- the teardown is a single frame');
  }
  // **W388.** `$24676A` used to appear here too -- `$246710`'s per-node content seeding, reached
  // because the attract screen slot [12] stages runs `hiscoreInit25B3DC`. It is PORTED now
  // (`animobjects.js seedChainContent24676A`), so it has left the census, the high-score screen
  // finishes instead of holding, and the sequencer reaches arm 12. The lines that replaced it
  // were `$28C170` (the screen-end cue at `$25B4C8`) and arm 12's `$25C2AE` / `$25C2EA`.
  // **W425 (D58) TOOK `$28C170` BACK OUT AGAIN**, this time by porting it rather than by moving
  // it: the `$28BBAC` tier has a posting path now, so the screen-end cue is posted and only arm
  // 12's two remain. None of them is slot [12]'s, which is what the `sites` assertion pins.
  assert.ok(grown.length <= 7, `seven new census lines at most; got ${grown.length}`);
  assert.ok(!grown.some((k) => k.includes('$24676A')),
    '$24676A is GONE from the census -- the seeding it counted is ported');

  // ITS MEASURED EXTENT, so the deferral is precise rather than a shrug.
  // $240FC2 is the DISPATCH TABLE ROW (8 bytes per row, $240F62 + 12 * 8); the handler is the
  // longword in it.
  assert.equal(0x240f62 + 12 * 8, 0x240fc2, '$240FC2 is dispatch row 12');
  assert.equal(l(0x240fc2), 0x0028f3ac, 'and its handler is $28F3AC');
  assert.equal(w(0x240fc6), 0x0009, '...at priority $9');

  // The handler's LOW end: like slots [13] and [14], the dispatch address is the MIDDLE of the
  // routine. $28F3B0's `beq` reaches back to $28F2BA, and $28F2B8 is the previous routine's rts.
  assert.equal(w(0x28f3ac), 0x4a2d, '$28F3AC tst.b (d16,A5)');
  assert.equal(w(0x28f3ae), 0x0002, '  ...($2,A5) -- the state byte, the same shape as [13]/[14]');
  assert.equal(w(0x28f3b0), 0x6700, '$28F3B0 beq.w');
  assert.equal(0x28f3b2 + (w(0x28f3b2) - 0x10000), 0x28f2ba, '  ...back to $28F2BA, state 0');
  assert.equal(w(0x28f2b8), 0x4e75, 'and $28F2B8 is an rts -- the routine above ends there');

  // The handler's HIGH end. TRAP 5, and it caught this file once while it was being written:
  // the last instruction is the `dbra` at $28F8A6, the `rts` is at $28F8AA, and the routine's
  // LAST BYTE is $28F8AB -- not $28F8A7, which is where a count taken from the dbra lands.
  assert.equal(w(0x28f8a6), 0x51cf, '$28F8A6 dbra D7,... -- NOT the rts');
  assert.equal(w(0x28f8aa), 0x4e75, '$28F8AA rts, and 4E75 SITS AT the last address (trap 5)');
  assert.equal(l(0x28f8ac), 0x00000000, '$28F8AC opens the data island');
  assert.equal(l(0x28f978), 0xffffffff, '...whose first table ends on the $FFFFFFFF at $28F978');
  assert.equal(0x28f8ac - 0x28f2ba, 0x5f2, 'so slot [12]\'s CODE is $28F2BA..$28F8AB, $5F2 bytes');

  // And its own data, unwindowed because nothing reads it: TWO animation tables, one per
  // family, which is where the brief's "$246704 reads four words per node" is actually live.
  assert.equal(w(0x28f4b4), 0x41fa, '$28F4B4 lea (d16,PC),A0');
  assert.equal(0x28f4b6 + w(0x28f4b6), 0x28fa98, '  ...= $28FA98');
  assert.equal(l(0x28f4ba), 0x4eb90024, '$28F4BA jsr...');
  assert.equal(l(0x28f4bc), 0x00246410, '  ...$246410 -- FOUR 14-byte entries, $28FA98..$28FAD1');
  assert.equal(w(0x28fa98), 0x0004, 'and its count word says four');
  assert.equal(w(0x28f520), 0x41fa, '$28F520 lea (d16,PC),A0');
  assert.equal(0x28f522 + w(0x28f522), 0x28fad2, '  ...= $28FAD2');
  assert.equal(l(0x28f526), 0x4eb90024, '$28F526 jsr...');
  assert.equal(l(0x28f528), 0x00246704, '  ...$246704 -- FOUR 8-byte nodes, $28FAD2..$28FAF3');
  assert.equal(w(0x28fad2), 0x0004, 'and its count word says four too');
  assert.equal(w(0x28faf4), 0x532c, 'with $28FAF4 back to code (subq.b #1,(d16,A4))');
  assert.equal(0x28fad2 - 0x28fa98, 0x3a, '$28FA98 is $3A bytes: 2 + 4 * 14');
  assert.equal(0x28faf4 - 0x28fad2, 0x22, '$28FAD2 is $22 bytes: 2 + 4 * 8');

  // WHY THOSE WERE NOT WINDOWED HERE, AND ARE NOW: the $28FA98 table names FOUR more colour
  // blocks and when W386 ran only ONE of them had a declared window. Declaring the other three
  // would then have been declaring windows for a subsystem no line of this port executed.
  // **W387 PORTED THAT SUBSYSTEM**, so `$28F2D8..$28F317` really does install all four through
  // `$24150A` on a cold boot, and W387 declared ($225478, $40) and ($2254F8, $80) for the three
  // that lacked one -- with the SAME $40 bound this table's `$001F` field gives, arrived at from
  // `$241518 moveq #$F,D0` as well. The measurement below is W386's and is unchanged; only the
  // declared/undeclared verdict moves, and it moves in the direction this test predicted.
  // The four targets sit at entry+8, NOT entry+6: fill.w, family.w, offset.w THEN target.l.
  // The count word is at $28FA98, so entry 0 opens at $28FA9A and its target is at $28FAA0.
  const targets = [0, 1, 2, 3].map((i) => l(0x28fa9a + i * 14 + 6));
  assert.deepEqual(targets, [0x2254b8, 0x2254f8, 0x225538, 0x225478],
    'four 64-byte colour blocks, and the fourth is BELOW the third -- not a run');
  const banks = [0, 1, 2, 3].map((i) => w(0x28fa9a + i * 14 + 4));
  assert.deepEqual(banks, [0x0080, 0x00c0, 0x0100, 0x0140],
    'into staging banks 2, 3, 4 and 5 -- W386\'s own entry fades bank 2 as well');

  const declared = (a) => windows.some((x) => x.base <= a && a + 0x40 <= x.base + x.len);
  assert.equal(declared(targets[0]), true, '$2254B8 is inside W125\'s window already');
  assert.equal(declared(targets[1]), true, '$2254F8 is inside W387\'s ($2254F8, $80)');
  assert.equal(declared(targets[2]), true, '$225538 is the second half of that same window');
  assert.equal(declared(targets[3]), true, '...and $225478 is W387\'s ($225478, $40)');
  // AND W125'S LINE IS UNTOUCHED, which is the rule this whole section is about.
  assert.deepEqual(windows.filter((x) => x.base === 0x2254b8).map((x) => x.len), [0x40],
    'W387 declared new windows on both sides of W125\'s block and widened neither');
});

test('W386 slot [12] ends the front-end loop by staging dispatch type 8, the attract screen', () => {
  // Both of the entry's other arms ($28F3BA and $28F3C4, 8-bit displacements) go to the SAME
  // place, and that place hands the machine back to slot [8]. So the screen after game over is
  // not a dead end in the cartridge -- it is the loop closing, and slot [12] is all that is
  // between this port and a front end that runs forever.
  assert.equal(w(0x28f3ba), 0x67ac, '$28F3BA beq.s -- displacement $AC is NEGATIVE, -84');
  assert.equal(0x28f3bc + (w(0x28f3ba) & 0xff) - 0x100, 0x28f368, '  ...to $28F368');
  assert.equal(w(0x28f3c4), 0x67a2, '$28F3C4 beq.s -94');
  assert.equal(0x28f3c6 + (w(0x28f3c4) & 0xff) - 0x100, 0x28f368, '  ...to the SAME $28F368');
  assert.equal(w(0x28f39a), 0x303c, '$28F39A move.w #imm,D0');
  assert.equal(w(0x28f39c), 0x0008, '  ...#$8 -- dispatch type 8');
  assert.equal(l(0x28f39e), 0x4eb90024, '$28F39E jsr...');
  assert.equal(l(0x28f3a0), 0x00241182, '  ...$241182, the stage-a-create the whole front end uses');
  assert.equal(l(0x240fa2), 0x0025a770, 'and dispatch row 8 is $25A770 -- objslot8.js, the '
    + 'warning/credit/attract screen the cold boot started on');
});

test('W386 nothing else on the game-over path needs a window: no note names a ROM address', () => {
  // A negative that is NOT an absence proof: every `Unreached` this port raises for a window
  // miss comes out of `rom.js`, and a run that raised one would have STOPPED. The shared RUN
  // did not stop (SECTION 5), so this is a restatement of a positive measurement. What is
  // asserted here is only that the census behind the screen is the ONE entry above.
  //
  // **W387 RE-BASES THE COUNT AND KEEPS THE CLAIM.** W386 asserted "exactly one census line is
  // new, and it is dispatch [12]" -- true when the machine stopped at +4,414. With slot [12]
  // registered the screen runs and hands on, so the new lines are its four one-shot teardown
  // notes plus `$24676A` from the attract screen that follows. The CLAIM this test exists for is
  // unchanged and is asserted directly: NOT ONE of them names a ROM address that needs a window,
  // which is why the run never stopped.
  //
  // **W388 RE-BASES IT AGAIN: 5 -> 7, and `$24676A` IS NO LONGER ONE OF THEM.** That note said
  // `$246710`'s per-node content seeding was unported; W388 ports it, the high-score screen's
  // chain drains, `$25B4D2` reports finished, and the sequencer moves to arm 12. So one line
  // LEAVES the census and three arrive: `$28C170` (`$25B4C8`, the screen-end cue, reachable for
  // the first time), and `$25C2AE` / `$25C2EA`, arm 12's init and body -- the NEXT screen's
  // deferral, which is progress rather than regression. **W425 (D58) DROPS `$28C170` FROM THAT
  // LIST -- it is posted now, not deferred -- so the arrivals are two, not three.** The bound
  // below is an upper bound and is deliberately not re-tightened: the claim this test exists for
  // is that NONE of them is a window miss, and that is asserted by the loop, not by the count.
  const behind = RUN.notes.filter((s) => !RUN.notesAt4079.has(s.split(' x ')[1]));
  assert.ok(behind.length <= 7, `at most seven census lines are new; got ${behind.length}`);
  assert.ok(!behind.some((s) => s.includes('$24676A')),
    '$24676A has LEFT the census -- W388 ported the seeding it was counting');
  assert.equal(RUN.stopError, null, 'and the run did not stop, which is the actual proof');
  for (const line of behind) {
    assert.doesNotMatch(line, /no ROM window|outside .* window/i,
      `no note behind the screen is a window miss: ${line.slice(0, 70)}`);
  }
});
