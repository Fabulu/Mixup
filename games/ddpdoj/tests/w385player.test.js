// W385 -- **THE PLAYER EXISTS.** THE THREE PIECES, AND EVERY PLACE THE BRIEF WAS WRONG.
//
// ===============================================================================================
// THE ANSWER IN ONE LINE
// ===============================================================================================
//
// A cold boot now creates object dispatch type 2. `$8103E6` gets bit 15, `$8130BE` gets two
// lives, `$2428A6 livePlayers2428A6` stops returning 0, and `$294F50`'s permanent re-floor of the
// boss timeout is gone. `tests/w384stall.test.js` measured the stall; this file measures the fix.
//
// THE CHAIN, END TO END, ALL THREE PIECES AT THEIR REAL FRAMES ON A REAL COLD BOOT:
//
//   +1      the rank object's state-0 INIT runs `$260700 bsr.w $25FE42` -- PIECE 2. Both $24-byte
//           dispatcher records are filled from the ROM table at $25FE22: ($14) = 2 and 3, ($8) =
//           $8130BE and $8130C0, ($C,$E) = the two spawn positions. Types 0, 4 and 4 are created.
//   +2,045  the handoff `$26070C` clears `$813082` and `$260580` installs `$81315C`.
//   +2,394  `$25D73E jsr $2603FE` fires behind the `$812F80` latch -- PIECE 3. `$813084` is $0000
//           (P1 joined) so side 0 gets `jsr $25FF38` with D1 = 4; `$813086` is $00FF (P2 did not)
//           so side 1 gets a type-$B object instead. The two arms are EXCLUSIVE.
//   +2,395  the rank object's state-1 `$2607A4 jsr $25FF7A` reaches `tally.js tallyDriver25FF7A`
//           -- PIECE 1 -- which runs bonus line 4: `$260204` seeds the lives counter from
//           `$2600CE[$80380E]` = 2, and `$26022E jsr $241182` STAGES DISPATCH TYPE 2.
//   +2,396  `$24111E` commits the create, `$2491C0` runs, `$2492E4` sets `$8103E6` bit 15.
//
// ===============================================================================================
// FIVE PLACES THE BRIEF THAT SET THIS WAVE IS WRONG. ALL FIVE PINNED BELOW.
// ===============================================================================================
//
// 1. **"`$25FE42..$25FEDE`, 156 bytes".** The `rts` is AT `$25FEDE` and is two bytes, so the
//    routine is `$25FE42..$25FEDF` and 158 bytes. 29 instructions is right (SECTION 1).
//
// 2. **"`$2603FE..$2604A8`, 171 bytes".** Same off-by-one at the other end: `$2604A8` is the
//    `rts`, so the extent is `$2603FE..$2604A9` and 172 bytes -- which is what `rank.js`'s own
//    note has said since W378. 40 instructions is right (SECTION 2).
//
// 3. **"For each side whose `$813084`/`$813086` is not `$FF` it runs `$260434 jsr $25FF38` with
//    D1 = 4 ... and creates a type-`$B` object", and "Creates two type-`$B` objects".** BOTH
//    HALVES ARE WRONG. `$26042C beq.s $26044C` sends the `$FF` case to the type-`$B` create and
//    everything else to the request; the two arms are EXCLUSIVE and the `$FF` polarity is the
//    opposite way round from the brief's reading. On a cold boot with P1 only, EXACTLY ONE
//    type-`$B` object is created and it is created for the side that did NOT join (SECTION 2).
//
// 4. **"`$287A5E` (UNREAD -- decode it or note it)".** It is five instructions and 24 bytes, and
//    both words it writes were already named in `hud.js HUDRAM`. Decoded, ported as
//    `slideArm287A5E`, and its one trap pinned: the `bne.s` skips ONE INSTRUCTION, not the
//    routine (SECTION 5).
//
// 5. **"`sound.js postWrapper` throws on `$28C170` from `boss.js bossClear242922`."** The address
//    is right and the site is not. On a real cold boot the throw arrives from
//    **`objslot13.js`** (`$288A3C`, slot [13] state 4, the GAME-OVER screen) at frame +4,079,
//    because a run with no input loses its last life at +4,075 -- it never gets near the boss.
//    And there are TWO posts at that site: `$288A42 jsr $28C0FC` follows `$28C170`.
//    **W425 closed `$28C170`; W567 proved the preserving `$28C0FC` entry is also
//    address-dispatchable with zeroed fields, and the Game Over fix now posts it.** The resulting
//    type-`$10` word is `$10000000`, the global immediate-SFX release that stops looping voices
//    before the object table is destroyed.
//
// ===============================================================================================
// AND THE HONEST ANSWER TO "DOES STAGE 1 END"
// ===============================================================================================
//
// The MECHANISM that blocked it is gone and SECTION 6 proves it against a real cold-booted RAM:
// with the player this wave created, `$294F44` falls through and `$294F60 jmp $294DD4` runs.
//
// The RUN still does not get there, and the reason is no longer a port defect. A harness that
// holds no buttons cannot survive stage 1: the player dies about every 320 frames, the lives
// counter borrows at +4,075, `$25FFA8` arms bonus-line request 2, `$260056` creates the type-$D
// game-over object, and the run ends on the GAME-OVER SCREEN's own unported animation table at
// `$2252F8` (`animobjects.js:233`), frame +4,081. That is the next thing that stops a cold boot
// and it is a different subsystem from this one (SECTION 7).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { Ram } from '../src/ram.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { portWordFromBits } from '../src/input.js';
import { BIT, RAM } from '../src/machine.js';
import { SCREEN8 } from '../src/objslot8.js';
import { ALLOC } from '../src/objalloc.js';
import { TALLY } from '../src/tally.js';
import { HUDRAM, slideArm287A5E, scoreDrainInit287084 } from '../src/hud.js';
import { BOSS, livePlayers2428A6, bossTimeout294F32 } from '../src/boss.js';
import { RANK, playerRecords25FE42, stagePair2603FE } from '../src/rank.js';
import { RomWindows } from '../src/rom.js';
import { SOUND_WRAPPERS } from '../src/sound.js';
import { Unreached } from '../src/unported.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const tablesJson = JSON.parse(readFileSync(here('../rip/port/player.tables.json'), 'utf8'));
const seed = new Ram(new Uint8Array(readFileSync(here('../rip/web/seed.bin'))));
const IMG = readFileSync(here('../rip/sound/maincpu.bin'));

const NO_PLAYER = 0xffff;
const STATE = SCREEN8.state;          // $812E56
const P1REC = RAM.player1;            // $8103E6
const LIVEBITS = 0x813090;            // $2491CC ori.w #$1,$813090
const LIVES1 = 0x8130BE;              // the P1 lives counter $25FE42 points ($8,A6) at
const LIVES2 = 0x8130C0;              // W445 -- P2's, and on a P1-only run it is the ABSENT side
const TABLE = 0x25fe22;               // $25FE42 lea (-$22,PC),A0

const coinWord = () => (0xffff & ~(1 << COIN_BITS.COIN1)) & 0xffff;

/** `w383coldboot.test.js`'s chain, unchanged, with its milestone asserted so this file cannot
 *  silently measure a run that never started. */
function bootToGameplay() {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);                       // the coinage dip, the one hand-written byte
  const run = (n, coin = COIN.idle, player = NO_PLAYER) => {
    g.coinPort = coin;
    for (let i = 0; i < n; i++) g.step(player);
  };
  run(20);
  run(380);
  run(20, coinWord());
  run(10);
  run(20, COIN.idle, portWordFromBits([BIT.start]));
  assert.equal(g.ram.u16(STATE), 0x000e, 'the harness must reach gameplay before measuring');
  return g;
}

// -------------------------------------------------------------------------------------------
// ONE COLD-BOOT RUN, SHARED, AND IT RUNS UNTIL THE MACHINE STOPS IT. Every section below reads
// a different fact out of the SAME run rather than paying for it again, so the sections cannot
// disagree with each other about what the machine did. The loop CATCHES rather than propagates,
// because the frame the run ends on and the reason it ends are two of the facts being measured.
// -------------------------------------------------------------------------------------------
const RUN = (() => {
  const g = bootToGameplay();

  const typesLive = () => {
    const out = new Set();
    for (let i = 0; i < ALLOC.slots; i++) {
      const t = g.ram.u16(ALLOC.table + i * ALLOC.stride);
      if (t !== 0) out.add(t & 0x7fff);
    }
    return out;
  };

  const everLive = new Set();
  let firstPlayerFrame = 0, firstLivesFrame = 0, firstRequest4Frame = 0;
  let livesLow = 0x7fff, liveHigh = 0, liveBitsHigh = 0;
  let stoppedAt = 0, stopError = null;
  let at3000 = null, lastLive = null;

  for (let f = 1; f <= 14000; f++) {
    try {
      g.step(NO_PLAYER);
    } catch (e) {
      stopError = e; stoppedAt = f; break;
    }
    for (const t of typesLive()) everLive.add(t);
    if (!firstRequest4Frame && g.ram.u16(TALLY.side0) === 4) firstRequest4Frame = f;
    // **W445 CHANGED THIS PROBE FROM `!== 0` TO `> 0`, and the old one was a proxy that only
    // worked because the port was missing a write.** `$8130BE` is UNSEEDED at $FFFF, not at 0:
    // `$2603DA` stamps `move.w #$FFFF,$8130BE` and `rank.js $260678 jsr $2603DA` was counted
    // rather than run until W445. [M] all 644 board RAM dumps read $8130BE = 2 / $8130C0 =
    // $FFFF, so $FFFF is the cartridge's "no count yet". The milestone this variable NAMES is
    // the frame bonus line 4 SEEDED the counter off $2600CE, and only a positive value is that.
    if (!firstLivesFrame && g.ram.i16(LIVES1) > 0) firstLivesFrame = f;
    if (!firstPlayerFrame && (g.ram.u16(P1REC) & 0x8000) !== 0) firstPlayerFrame = f;
    livesLow = Math.min(livesLow, g.ram.i16(LIVES1));
    // The END state of this run is a GAME OVER, so both of these read 0 at the last frame. What
    // is being measured is that they were non-zero AT SOME POINT, which is the claim.
    liveHigh = Math.max(liveHigh, livePlayers2428A6(g.ram));
    liveBitsHigh = Math.max(liveBitsHigh, g.ram.u16(LIVEBITS));
    if (f === 3000) at3000 = Uint8Array.from(g.ram.b);
    lastLive = f;
  }

  let diffBytes = 0;
  const diffBlocks = new Set();
  if (at3000) {
    for (let i = 0; i < at3000.length; i++) {
      if (at3000[i] !== g.ram.b[i]) { diffBytes++; diffBlocks.add((0x800000 + i) & ~0xff); }
    }
  }

  return {
    g, everLive, firstPlayerFrame, firstLivesFrame, firstRequest4Frame, livesLow,
    liveHigh, liveBitsHigh,
    stoppedAt, stopError, lastLive, diffBytes, diffBlocks: diffBlocks.size,
    notes: g.unportedLog.report(),
    // W425 (D58): the `$28BBAC`-tier command, counted where it actually landed. `drainFrame`
    // moves one longword per frame into `doorLog`, so this is what the sound hardware saw --
    // not what a call site intended.
    bgmCommands: g.sound.doorLog.filter((d) => d.word === 0x15000000).length,
    globalReleases: g.sound.doorLog.filter((d) => d.word === 0x10000000).length,
  };
})();

/** The census line for a ROM address, or `null`. `UnportedLog` keys are `$ADDR what`, so a prefix
 *  match on the address plus a space is exact and survives an edit to the note's prose. */
const noteFor = (addr) => {
  const key = `$${addr.toString(16).toUpperCase()} `;
  return RUN.notes.find((l) => l.includes(` x ${key}`)) ?? null;
};
const noteCount = (addr) => {
  const l = noteFor(addr);
  return l === null ? 0 : Number(l.trim().split(' ')[0]);
};

/** A word straight out of the cartridge image, for the disassembly sections. */
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

// =============================================================================================
// 1 -- `$25FE42`, VERIFIED AGAINST THE IMAGE, WITH ITS REAL END ADDRESS.
//
// 29 instructions, $25FE42..$25FEDF, 158 bytes. The brief said 156, which is the span up to but
// not including the two-byte `rts` at $25FEDE (trap 5).
// =============================================================================================

test('W385 $25FE42 disassembles exactly as playerRecords25FE42 is written, and ENDS AT $25FEDF',
  () => {
    // The head. `41FA FFDE` is `lea (d16,PC),A0` and the EA is the EXTENSION WORD's address plus
    // the displacement -- $25FE44 + $FFDE -- NOT the opcode's address (trap 4).
    assert.equal(w(0x25fe42), 0x41fa, '$25FE42 lea (d16,PC),A0');
    assert.equal(w(0x25fe44), 0xffde, '  ...displacement $FFDE');
    assert.equal(0x25fe44 + (w(0x25fe44) - 0x10000), TABLE, '  ...so A0 = $25FE22, the table');
    assert.equal(w(0x25fe46), 0x4df9, '$25FE46 lea (xxx).L,A6');
    assert.equal(l(0x25fe48), 0x008130fa, '  ...of $8130FA, tally.js TALLY.side0');
    assert.equal(w(0x25fe4c), 0x7e01, '$25FE4C moveq #$1,D7 -- and dbra runs it TWICE (trap 2)');

    // The six word copies and the longword, src offset then dest offset. `3D68 ssss dddd` is
    // `move.w (d16,A0),(d16,A6)` and the SOURCE displacement comes first.
    assert.equal(w(0x25fe4e), 0x3d50, '$25FE4E move.w (A0),(d16,A6)');
    assert.equal(w(0x25fe50), 0x000c, '  ...-> ($C,A6)');
    for (const [addr, src, dst] of [
      [0x25fe52, 0x0002, 0x000e], [0x25fe58, 0x0004, 0x0010], [0x25fe5e, 0x0006, 0x0012],
      [0x25fe64, 0x0008, 0x0014], [0x25fe6a, 0x000a, 0x0016],
    ]) {
      assert.equal(w(addr), 0x3d68, `$${addr.toString(16).toUpperCase()} move.w (d16,A0),(d16,A6)`);
      assert.equal(w(addr + 2), src, '  ...source displacement');
      assert.equal(w(addr + 4), dst, '  ...destination displacement');
    }
    assert.equal(w(0x25fe70), 0x2d68, '$25FE70 move.l (d16,A0),(d16,A6) -- a LONGWORD');
    assert.equal(w(0x25fe72), 0x000c, '  ...($C,A0), the LIVES POINTER');
    assert.equal(w(0x25fe74), 0x0008, '  ...-> ($8,A6)');

    // The four zero longwords, and ($4) covers ($4) AND ($6) -- one word literal, two fields.
    for (const [addr, dst] of [
      [0x25fe76, 0x0018], [0x25fe7e, 0x001c], [0x25fe86, 0x0004], [0x25fe8e, 0x0020],
    ]) {
      assert.equal(w(addr), 0x2d7c, '$move.l #imm,(d16,A6)');
      assert.equal(l(addr + 2), 0, '  ...the immediate is 0');
      // TRAP 1: the immediate comes BEFORE the displacement, so the offset is at +6 and not +2.
      assert.equal(w(addr + 6), dst, '  ...and THEN the displacement');
    }
    // ...and NOTHING clears (A6) or ($2,A6). $25FE42 does not arm a request.
    assert.equal(RANK.disp25FF7ATable, TALLY.side0, 'rank.js and tally.js name the same record');

    // The two strides, the dbra, and the three creates.
    assert.equal(w(0x25fe96), 0x41e8, '$25FE96 lea (d16,A0),A0');
    assert.equal(w(0x25fe98), 0x0010, '  ...$10 -- the TABLE STRIDE');
    assert.equal(w(0x25fe9a), 0x4dee, '$25FE9A lea (d16,A6),A6');
    assert.equal(w(0x25fe9c), 0x0024, '  ...$24 -- the RECORD STRIDE, tally.js TALLY.stride');
    assert.equal(TALLY.stride, 0x24, '  ...and tally.js agrees');
    assert.equal(w(0x25fe9e), 0x51cf, '$25FE9E dbra D7,d16');
    assert.equal(0x25fea0 + (w(0x25fea0) - 0x10000), 0x25fe4e, '  ...back to $25FE4E');

    for (const [movq, jsr, store, type, handle] of [
      [0x25fea2, 0x25fea6, 0x25feac, 0x0000, 0x0081314c],
      [0x25feb2, 0x25feb6, 0x25febc, 0x0004, 0x00813150],
      [0x25fec8, 0x25fecc, 0x25fed2, 0x0004, 0x00813154],
    ]) {
      assert.equal(w(movq), 0x303c, 'move.w #imm,D0');
      assert.equal(w(movq + 2), type, '  ...the object TYPE');
      assert.equal(w(jsr), 0x4eb9, 'jsr (xxx).L');
      assert.equal(l(jsr + 2), 0x00241182, '  ...$241182, objalloc.js stageCreate');
      assert.equal(w(store), 0x23c0, 'move.l D0,(xxx).L');
      assert.equal(l(store + 2), handle, '  ...the handle longword');
    }

    // THE END. `4E75` is TWO bytes and it is AT $25FEDE, so the routine's last byte is $25FEDF.
    assert.equal(w(0x25fed8), 0x117c, '$25FED8 move.b #imm,(d16,A0) -- the last instruction');
    assert.equal(w(0x25feda), 0x0001, '  ...immediate $1 BEFORE the displacement (trap 1)');
    assert.equal(w(0x25fedc), 0x0007, '  ...and THEN ($7,A0)');
    assert.equal(w(0x25fede), 0x4e75, '$25FEDE rts');
    assert.equal(0x25fedf - 0x25fe42 + 1, 158,
      'so the routine is $25FE42..$25FEDF and 158 bytes -- the brief said 156, which stops at '
      + 'the rts instead of after it');
  });

test('W385 the two `move.b #$x,($7,A0)` write the STAGED records, not the table (TRAP 11)', () => {
  // $241182 is `movem.l D1-D2,-(SP)` / `movem.l (SP)+,D1-D2`: it restores D1 and D2 and NOTHING
  // ELSE, so A0 comes back holding the record it staged at $2411A0/$2411A6.
  assert.equal(w(0x241182), 0x48e7, '$241182 movem.l <list>,-(SP)');
  assert.equal(w(0x241184), 0x6000, '  ...and the list is D1-D2 ONLY -- A0 is NOT saved');
  assert.equal(w(0x2411ce), 0x4cdf, '$2411CE movem.l (SP)+,<list>');
  assert.equal(w(0x2411d0), 0x0006, '  ...D1-D2 back, and nothing else');
  assert.equal(w(0x2411a0), 0x41f9, '$2411A0 lea (xxx).L,A0');
  assert.equal(l(0x2411a2), 0x0080d56c, '  ...$80D56C, the create-stage base');

  // THE ABLATION, and it is the whole point: run the routine on a bare RAM and look at where the
  // two side bytes landed. If A0 were read as the table pointer they would go nowhere in RAM at
  // all; if it were read as the FIRST create's record they would both land on the type-0 object.
  const ram = new Ram(null);
  const rom = new RomWindows(tablesJson.rom);
  const made = playerRecords25FE42(ram, rom, {});
  assert.equal(made.length, 3, 'three creates: type 0, type 4, type 4');
  assert.ok(made.every((m) => m.ok), 'POSITIVE CONTROL: a fresh queue staged all three');
  assert.equal(ram.u8(made[1].addr + 0x07), 0, '$25FEC2 wrote side 0 on the SECOND record');
  assert.equal(ram.u8(made[2].addr + 0x07), 1, '$25FED8 wrote side 1 on the THIRD record');
  assert.notEqual(made[1].addr, made[2].addr, '...and the two records really are different');
  assert.equal(ram.u8(made[0].addr + 0x07), 0,
    'the type-0 record was never given a side byte -- only the two type-4s are');
  // ($7) is the SAME offset the announcement object reads its side from.
  assert.equal(ram.u16(made[1].addr) & 0x7fff, 4, 'and record 2 really is dispatch type 4');
  assert.equal(ram.u16(made[2].addr) & 0x7fff, 4, '...as is record 3');
  assert.equal(ram.u16(made[0].addr) & 0x7fff, 0, '...while record 1 is type 0, the HUD');
});

// =============================================================================================
// 2 -- `$2603FE`, VERIFIED AGAINST THE IMAGE, AND THE BRIEF'S TWO ERRORS ABOUT IT.
// =============================================================================================

test('W385 $2603FE disassembles as stagePair2603FE is written, and ENDS AT $2604A9', () => {
  assert.equal(w(0x2603fe), 0x48e7, '$2603FE movem.l <list>,-(SP)');
  assert.equal(w(0x260400), 0xfffe, '  ...D0-D7/A0-A6 -- REGISTER-TRANSPARENT (trap 9)');
  assert.equal(w(0x2604a4), 0x4cdf, '$2604A4 movem.l (SP)+,<list>');
  assert.equal(w(0x2604a6), 0x7fff, '  ...the matching restore');
  assert.equal(w(0x2604a8), 0x4e75, '$2604A8 rts');
  assert.equal(0x2604a9 - 0x2603fe + 1, 172,
    'so the routine is $2603FE..$2604A9 and 172 bytes -- the brief said 171');

  assert.equal(l(0x260404), 0x008130fa, '$260402 lea $8130FA,A2 -- side 0');
  assert.equal(l(0x26040a), 0x0081311e, '$260408 lea $81311E,A3 -- side 1');
  assert.equal(TALLY.side1 - TALLY.side0, 0x24, '...and the two are $24 apart');

  // The two position stores, and BOTH are LONGWORDS over the ($10)/($12) word pair (trap 3).
  assert.equal(w(0x26040e), 0x4a80, '$26040E tst.l D0');
  assert.equal(w(0x260410), 0x6b00, '$260410 bmi.w -- the SKIP is the NEGATIVE arm');
  assert.equal(0x260412 + w(0x260412), 0x260418, '  ...over $260414');
  assert.equal(w(0x260414), 0x2540, '$260414 move.l D0,(d16,A2)');
  assert.equal(w(0x260416), 0x0010, '  ...($10,A2), which is TALLY.argA AND TALLY.argB');
  assert.equal(TALLY.argA, 0x10, '  ...tally.js names ($10) argA');
  assert.equal(TALLY.argB, 0x12, '  ...and ($12) argB -- one move.l covers both');
  assert.equal(w(0x260418), 0x4a81, '$260418 tst.l D1');
  assert.equal(w(0x26041e), 0x2741, '$26041E move.l D1,(d16,A3)');

  // The $25FF38 calls: D1 = 4, i.e. BONUS-LINE REQUEST 4.
  for (const [movq, side, moveD1, jsr] of [
    [0x26042e, 0x7000, 0x260430, 0x260434], [0x26046c, 0x7001, 0x26046e, 0x260472],
  ]) {
    assert.equal(w(movq), side, 'moveq #side,D0');
    assert.equal(w(moveD1), 0x323c, 'move.w #imm,D1');
    assert.equal(w(moveD1 + 2), 0x0004, '  ...FOUR -- bonus-line request 4');
    assert.equal(w(jsr), 0x4eba, 'jsr (d16,PC)');
    assert.equal(0x260436 + (w(0x260436) - 0x10000), 0x25ff38, '$260434 -> $25FF38');
  }
  assert.equal(0x260474 + (w(0x260474) - 0x10000), 0x25ff38, '$260472 -> $25FF38 as well');

  // The two hud.js callees and the tail.
  assert.equal(l(0x260444), 0x00287084, '$260442 jsr $287084 -- hud.js scoreDrainInit287084');
  assert.equal(l(0x260482), 0x002870e6, '$260480 jsr $2870E6 -- the side-1 twin');
  assert.equal(l(0x2604a0), 0x00287a5e, '$26049E jsr $287A5E -- hud.js slideArm287A5E');
});

test('W385 $2603FE\'s TWO ARMS ARE EXCLUSIVE and $FF means the side did NOT join', () => {
  // THE BYTES. `cmpi.w #$FF,D0 / beq.s $26044C` -- and $26044C is the TYPE-$B CREATE.
  assert.equal(w(0x260422), 0x3039, '$260422 move.w (xxx).L,D0');
  assert.equal(l(0x260424), 0x00813084, '  ...$813084, objslot17.js SCREEN17.p1Gate');
  assert.equal(w(0x260428), 0x0c40, '$260428 cmpi.w #imm,D0');
  assert.equal(w(0x26042a), 0x00ff, '  ...#$FF');
  assert.equal(w(0x26042c) >>> 8, 0x67, '$26042C beq.s -- taken when the gate IS $FF');
  assert.equal(0x26042e + (w(0x26042c) & 0xff), 0x26044c, '  ...to $26044C');
  assert.equal(w(0x26044c), 0x303c, '$26044C move.w #imm,D0');
  assert.equal(w(0x26044e), 0x000b, '  ...#$B -- THE TYPE-$B CREATE IS THE $FF ARM');
  // ...and the NOT-$FF arm falls through to the request and then BRANCHES PAST the create.
  assert.equal(w(0x260448), 0x6000, '$260448 bra.w -- unconditional');
  assert.equal(0x26044a + w(0x26044a), 0x260460,
    '  ...to $260460, which is SIDE 1\'s block: the request arm never reaches $26044C');

  // THE MEASUREMENT, on the real cold boot. P1 joined, P2 did not.
  assert.equal(RUN.g.ram.u16(0x813084), 0x0000, 'MEASURED: $813084 = 0, P1 joined');
  assert.equal(RUN.g.ram.u16(0x813086), 0x00ff, 'MEASURED: $813086 = $FF, P2 never joined');

  // THE ABLATION, both polarities, on a bare RAM so nothing else can explain the difference.
  const rom = new RomWindows(tablesJson.rom);
  const runOne = (gate0, gate1) => {
    const ram = new Ram(null);
    ram.setU16(0x813084, gate0);
    ram.setU16(0x813086, gate1);
    stagePair2603FE(ram, rom, {}, 0x11223344, 0x55667788);
    const types = [];
    for (let i = 0; i < ALLOC.slots; i++) {
      const t = ram.u16(ALLOC.createStage + i * ALLOC.stride);
      if (t !== 0) types.push(t & 0x7fff);
    }
    return { ram, types };
  };

  const oneP = runOne(0x0000, 0x00ff);              // the cold board's own pair
  assert.equal(oneP.ram.u16(TALLY.side0), 4, 'gate 0 -> side 0 gets BONUS-LINE REQUEST 4');
  assert.equal(oneP.ram.u16(TALLY.side1), 0, 'gate $FF -> side 1 gets NO request');
  assert.deepEqual(oneP.types, [0x0b], 'and EXACTLY ONE type-$B object, not two');

  const twoP = runOne(0x0000, 0x0000);              // both sides joined
  assert.equal(twoP.ram.u16(TALLY.side0), 4, 'both joined -> BOTH sides get request 4');
  assert.equal(twoP.ram.u16(TALLY.side1), 4, '  ...including side 1');
  assert.deepEqual(twoP.types, [], 'and NO type-$B object at all -- the arms are EXCLUSIVE');

  const noneP = runOne(0x00ff, 0x00ff);             // neither joined
  assert.equal(noneP.ram.u16(TALLY.side0), 0, 'neither joined -> no requests');
  assert.deepEqual(noneP.types, [0x0b, 0x0b], '  ...and TWO type-$B objects. THAT is the only '
    + 'state the brief\'s "creates two type-$B objects" describes, and it is not a cold boot');

  // AND THE POSITION STORE'S SIGN GATE, which is what makes $FFFFFFFF a skip.
  assert.equal(oneP.ram.u32(TALLY.side0 + TALLY.argA), 0x11223344, 'a POSITIVE D0 is stored');
  const neg = new Ram(null);
  neg.setU16(0x813084, 0x00ff);
  neg.setU16(0x813086, 0x00ff);
  stagePair2603FE(neg, rom, {}, 0xffffffff, 0xffffffff);
  assert.equal(neg.u32(TALLY.side0 + TALLY.argA), 0,
    '$26040E tst.l / $260410 bmi.w SKIPS the store for a negative D0 -- the absent side\'s '
    + '$FFFFFFFF sentinel never reaches the record');
});

// =============================================================================================
// 3 -- THE ROM WINDOW FOR `$25FE22`, WITH ITS ABLATION.
//
// The window is $25FE22 + $20, declared in tools/export-tables.py with base, stride, count and
// far end each taken from an instruction. The ablation is the byte one past it.
// =============================================================================================

test('W385 the $25FE22 window covers exactly the two entries, and NOTHING past them', () => {
  const rom = new RomWindows(tablesJson.rom);

  // POSITIVE CONTROL: every field the routine reads resolves, and to the image's own bytes.
  for (let off = 0; off < 0x20; off += 2) {
    assert.equal(rom.u16(TABLE + off), w(TABLE + off),
      `$${(TABLE + off).toString(16).toUpperCase()} matches the cartridge`);
  }
  assert.equal(rom.u32(TABLE + 0x0c), 0x008130be, 'entry 0\'s ($C) longword is $8130BE');
  assert.equal(rom.u32(TABLE + 0x1c), 0x008130c0, 'entry 1\'s is $8130C0');

  // THE ABLATION. $25FE42 is the routine's own first opcode and it is NOT in the window; a third
  // entry -- which the `moveq #$1,D7` says cannot exist -- would read it as data.
  assert.throws(() => rom.u16(0x25fe42), Unreached,
    'the window STOPS at $25FE41: $25FE42 is code and reading it is a loud throw');
  assert.throws(() => rom.u16(TABLE - 2), Unreached, '...and it does not reach below $25FE22');
});

test('W385 $25FE42 reproduces the SEED\'s dispatcher fields from ZEROED RAM', () => {
  const ram = new Ram(null);
  const rom = new RomWindows(tablesJson.rom);

  // POSITIVE CONTROL: nothing is there before the routine runs.
  for (const rec of [TALLY.side0, TALLY.side1]) {
    assert.equal(ram.u32(rec + TALLY.ptr), 0, 'the lives pointer starts null');
    assert.equal(ram.u16(rec + TALLY.type), 0, 'and the object type starts 0');
  }

  playerRecords25FE42(ram, rom, {});

  // `rip/web/seed.bin` was ripped mid-stage-1 from a real board, so it carries what the
  // cartridge's own $25FE42 wrote. Every field the routine touches is compared against it.
  assert.equal(ram.u32(TALLY.side0 + TALLY.ptr), seed.u32(TALLY.side0 + TALLY.ptr),
    'SEED: ($8,$8130FA) -- the P1 LIVES POINTER');
  assert.equal(ram.u32(TALLY.side0 + TALLY.ptr), LIVES1, '  ...and it is $8130BE');
  assert.equal(ram.u32(TALLY.side1 + TALLY.ptr), seed.u32(TALLY.side1 + TALLY.ptr),
    'SEED: ($8,$81311E) = $8130C0');
  assert.equal(ram.u16(TALLY.side0 + TALLY.type), seed.u16(TALLY.side0 + TALLY.type),
    'SEED: ($14,$8130FA) -- THE OBJECT TYPE');
  assert.equal(ram.u16(TALLY.side0 + TALLY.type), 2, '  ...and it is 2, the P1 player object');
  assert.equal(ram.u16(TALLY.side1 + TALLY.type), seed.u16(TALLY.side1 + TALLY.type),
    'SEED: ($14,$81311E) = 3');
  assert.equal(ram.u16(TALLY.side0 + 0x0c), seed.u16(TALLY.side0 + 0x0c), 'SEED: ($C) = $1000');
  assert.equal(ram.u16(TALLY.side0 + 0x0e), seed.u16(TALLY.side0 + 0x0e), 'SEED: ($E) = $0E00');
  assert.equal(ram.u16(TALLY.side1 + 0x0e), seed.u16(TALLY.side1 + 0x0e), 'SEED: P2\'s ($E) = $2A00');
  assert.equal(ram.u16(TALLY.side0 + 0x16), seed.u16(TALLY.side0 + 0x16), 'SEED: ($16) = side 0');
  assert.equal(ram.u16(TALLY.side1 + 0x16), seed.u16(TALLY.side1 + 0x16), 'SEED: and 1 for P2');

  // ...and ($10,$12) do NOT match the seed, for a reason the code states: `$260414 move.l D0`
  // in $2603FE has since overwritten the pair with the ship's LIVE position. Asserting equality
  // there would be asserting a value the board has moved on from.
  assert.equal(ram.u16(TALLY.side0 + TALLY.argA), 0x1000, 'the TABLE\'s ($10) is $1000...');
  assert.equal(seed.u16(TALLY.side0 + TALLY.argA), 0x1179,
    '...and the SEED\'s is $1179, the high word of $25D71C\'s anchor $117914C0');
  assert.notEqual(ram.u16(TALLY.side0 + TALLY.argA), seed.u16(TALLY.side0 + TALLY.argA),
    'so the two differ ON PURPOSE, and $2603FE is what makes them differ');

  // $25FE42 does NOT arm a request. Filling the records is only half the unit.
  assert.equal(ram.u16(TALLY.side0), 0, '(A6) is untouched -- no request');
  assert.equal(ram.u16(TALLY.side1), 0, '...on either record');
});

// =============================================================================================
// 4 -- **THE PLAYER EXISTS ON A REAL COLD BOOT.** The headline, from the shared run.
// =============================================================================================

test('W385 A COLD BOOT CREATES DISPATCH TYPE 2 -- THE SHIP EXISTS', () => {
  assert.ok(RUN.everLive.has(2), 'dispatch type 2 -- P1 -- IS staged and IS live');
  assert.ok(RUN.everLive.has(0), '...and type 0, the HUD object $25FE42 creates');
  assert.ok(RUN.everLive.has(4), '...and type 4, the announcement objects $25FE42 creates');
  assert.ok(RUN.everLive.has(0x0b), '...and type $B, the object $2603FE creates for the '
    + 'ABSENT side');
  assert.ok(!RUN.everLive.has(3), 'and NOT type 3 -- P2 never joined, so it never gets one');

  // The three milestones, in the order the chain produces them.
  assert.ok(RUN.firstRequest4Frame > 2300 && RUN.firstRequest4Frame < 2500,
    `$2603FE armed request 4 at +${RUN.firstRequest4Frame}; the measured frame is +2,394`);
  assert.equal(RUN.firstLivesFrame, RUN.firstRequest4Frame + 1,
    'bonus line 4 ran on the VERY NEXT frame -- the rank object is priority $1F and runs first');
  assert.equal(RUN.firstPlayerFrame, RUN.firstLivesFrame + 1,
    'and $8103E6 got bit 15 one frame after that, because $24111E commits creates at the TOP '
    + 'of the next object-driver pass');

  // Both of these are HIGH-WATER MARKS over the run, not end-state reads: this run ends in a
  // GAME OVER (SECTION 7), so at the last frame there is once again no player. The claim is
  // that there WAS one, which is exactly what the whole wave is about.
  assert.equal(RUN.liveBitsHigh, 1, '$813090 reached 1 -- $2491CC ran for P1');
  assert.equal(RUN.liveHigh, 0x10,
    '$2428A6 returned $10 -- ONE live player, the value $2428AE produces for P1 alone');
  assert.equal(livePlayers2428A6(RUN.g.ram), 0,
    '...and it is back to 0 at the last frame, because the run ended on a GAME OVER');

  // ------------------------------------------------------------------ W445, AND IT IS [M]
  // THE ABSENT SIDE'S LIVES WORD IS $FFFF, NOT 0 -- AND THE BOARD IS THE WITNESS.
  // [M] every one of the 644 board RAM dumps under tools/oracle/out/w69/*/ckpt/*.ram.bin
  // reads $8130BE = 2 (644/644) and $8130C0 = $FFFF (644/644): P1 playing with two lives,
  // P2 never joined and holding the sentinel. Until W445 this port produced 2/0, because
  // the ONLY writer of that sentinel on the loop-1 arm is `$260678 jsr $2603DA` and rank.js
  // COUNTED it instead of running it. `$260680`'s inline `move.w #$FFFF` covers loop 2+
  // only, so on loop 1 nothing wrote it at all.
  //
  // This assertion is deliberately a RAM COMPARISON AGAINST THE CARTRIDGE and not another
  // reading of the port's own arithmetic -- P2 never joins this run, so nothing in the port
  // has any reason to touch $8130C0 except the routine under test.
  assert.equal(RUN.g.ram.u16(LIVES2), 0xffff,
    'the absent side holds $FFFF, which is what 644/644 board dumps hold. A 0 here means '
    + '$2603DA stopped running -- and 0 is what this port produced for 445 waves');
});

test('W385 the lives counter is seeded from the DIP, through the pointer $25FE42 installed', () => {
  // `$26011C move.b $80380E,D0 / add.w D0,D0 / lea ($2600CE,PC),A1 / $260204 move.w (A1,D0.w),(A0)`
  // -- and (A0) is `movea.l ($8,A6),A0`, the pointer, not a field.
  assert.equal(RUN.g.ram.u8(0x80380e), 0, 'a cold board has the $80380E lives dip at index 0');
  assert.equal(RUN.livesLow >= -1, true, 'the counter is a real signed count, not garbage');

  // THE ABLATION: a second cold boot with the dip at index 2 must seed FOUR, not two. Same code,
  // same frame, one byte different -- which is what proves the value came from the table.
  const g = bootToGameplay();
  g.ram.setU8(0x80380e, 2);                    // $2600CE is $0002 $0003 $0004 $0000 $0001
  for (let i = 0; i < 2500; i++) g.step(NO_PLAYER);
  // **W388 RE-BASE: the pointer is read HERE, mid-gameplay, instead of off `RUN` at its last
  // frame.** `TALLY.side0` is $8130FA, inside the $81308C..$813157 span `clearRankRam2603DA`
  // blanks, and slot [12]'s teardown calls it now -- so at the end of `RUN` the pointer is 0
  // because the player subsystem has been torn down, which is correct and is asserted in
  // `w384stall.test.js`. Frame 2,500 is squarely inside the same run's gameplay, so this is the
  // identical measurement of the identical write, taken while the subject still exists.
  assert.equal(g.ram.u32(TALLY.side0 + TALLY.ptr), LIVES1,
    '$25FE70 installed the pointer, and it points at $8130BE');
  assert.equal(g.ram.i16(LIVES1), 4,
    'dip index 2 seeds FOUR lives -- $2600CE[2]. A hard-coded 2 would still read 2 here');
});

// =============================================================================================
// 5 -- `$287084` / `$2870E6` / `$287A5E`, THE THREE CALLEES THE BRIEF LEFT OPEN.
// =============================================================================================

test('W385 $287A5E is FIVE INSTRUCTIONS, and its bne.s skips ONE of them, not the routine', () => {
  assert.equal(w(0x287a5e), 0x0839, '$287A5E btst #imm,(xxx).L');
  assert.equal(w(0x287a60), 0x0000, '  ...bit 0');
  assert.equal(l(0x287a62), 0x008130f9, '  ...of $8130F9, hud.js HUDRAM.flags9');
  assert.equal(HUDRAM.flags9, 0x8130f9, '  ...which hud.js already named');
  assert.equal(w(0x287a66) >>> 8, 0x66, '$287A66 bne.s');
  assert.equal(0x287a68 + (w(0x287a66) & 0xff), 0x287a70,
    '  ...and it lands on $287A70, so it skips ONE instruction and NOT the rts');
  assert.equal(l(0x287a6c), 0x0081b620, '$287A68 move.w #$53,$81B620 -- HUDRAM.bannerTimer');
  assert.equal(w(0x287a6a), 0x0053, '  ...$53');
  assert.equal(l(0x287a74), 0x0081b6ee, '$287A70 move.w #$1,$81B6EE -- HUDRAM.slideFlag');
  assert.equal(w(0x287a78), 0x4e75, '$287A78 rts -- so the routine is $287A5E..$287A79, 24 bytes');

  // BOTH ARMS, and the ablation is the flag bit.
  const clear = new Ram(null);
  slideArm287A5E(clear);
  assert.equal(clear.u16(HUDRAM.bannerTimer), 0x53, 'flags9 bit 0 CLEAR -> the timer is armed');
  assert.equal(clear.u16(HUDRAM.slideFlag), 1, '  ...and the slide flag is set');

  const set = new Ram(null);
  set.setU8(HUDRAM.flags9, 0x01);
  slideArm287A5E(set);
  assert.equal(set.u16(HUDRAM.bannerTimer), 0, 'flags9 bit 0 SET -> the timer is NOT armed');
  assert.equal(set.u16(HUDRAM.slideFlag), 1,
    '  ...but the slide flag IS -- which is the half an early-out reading would lose');
});

test('W385 $287084/$2870E6 seed nine digit records and a TENTH whose column is the loop\'s next',
  () => {
    assert.equal(w(0x287096), 0x7e08, '$287096 moveq #$8,D7 -- NINE passes with the dbra');
    assert.equal(l(0x287088), 0x009040d8, '$287086 move.l #$9040D8,D1 -- the first column');
    assert.equal(w(0x2870a0), 0x0641, '$2870A0 addi.w #imm,D1 -- a WORD add on a LONG register');
    assert.equal(w(0x2870a2), 0x0100, '  ...$100 per record');
    assert.equal(l(0x2870b4), 0x009049d8, '$2870B2 move.l #$9049D8,(A0)+ -- the TENTH record');
    assert.equal(0x9040d8 + 9 * 0x100, 0x9049d8,
      'and $9049D8 IS the ninth column plus $100, so the literal is the loop\'s own next value');
    assert.equal(l(0x287116), 0x00905ad8, '$287114 move.l #$905AD8,(A0)+ -- the side-1 twin');
    assert.equal(0x9051d8 + 9 * 0x100, 0x905ad8, '  ...and the same arithmetic holds there');
    assert.equal(HUDRAM.extraRecB, 0x81b586, 'hud.js already named the record it goes in');

    const ram = new Ram(null);
    scoreDrainInit287084(ram, 0);
    for (let n = 0; n < 9; n++) {
      assert.equal(ram.u32(HUDRAM.digitsP1 + n * 10 + 2), 0x9040d8 + n * 0x100,
        `record ${n}'s destination steps by $100`);
    }
    assert.equal(ram.u16(HUDRAM.extraRecA), 1, 'the tenth record\'s flag word is 1');
    assert.equal(ram.u32(HUDRAM.extraRecA + 2), 0x9049d8, '  ...its destination is $9049D8');
    assert.equal(ram.u16(HUDRAM.extraRecA + 6), 0xc030, '  ...and its MODE word is $C030');

    // WHAT IT ADDS OVER $287148, which is the reason it is a separate routine: digitStateP1.
    assert.equal(ram.u16(HUDRAM.digitStateP1), 0, '$2870D8 clears digitStateP1');
    assert.equal(w(0x2870d8), 0x33c0, '  ...and $287148 has no such instruction');
    assert.equal(l(0x2870da), 0x0081b49a, '  ...$81B49A');
  });

// =============================================================================================
// 6 -- **STAGE 1 CAN END NOW**, PROVED AGAINST THE COLD-BOOTED RAM THIS WAVE PRODUCED.
//
// `$294F50 move.w #$78,$22(a5)` re-floors the 10,800-frame timeout whenever `$2428A6` reads 0.
// With no player that is EVERY time, forever -- `w384stall.test.js` measured exactly that. The
// RAM used here is not hand-built: it is a real cold boot, stopped on a frame where the player
// this wave created is alive, so what is being tested is the machine's own state.
// =============================================================================================

test('W385 with the player this wave creates, $294F32 does NOT re-floor and reaches $294DD4',
  () => {
    const g = bootToGameplay();
    let alive = 0;
    for (let i = 1; i <= 2600; i++) {
      g.step(NO_PLAYER);
      if (livePlayers2428A6(g.ram) !== 0) { alive = i; break; }
    }
    assert.ok(alive > 0, 'MILESTONE: the cold boot produced a live player to test with');
    assert.notEqual(livePlayers2428A6(g.ram), 0, '$2428A6 is non-zero on this REAL cold-boot RAM');

    // Two records in RAM the run is not using, so the timeout can be driven without disturbing
    // anything the machine owns. The RAM around them is the cold boot's, which is the point.
    const a5 = 0x813700, a6 = 0x815200;
    g.ram.setU16(a5 + BOSS.timeout, 1);                 // one frame from expiry
    assert.equal(g.ram.u16(BOSS.deathPause), 0,
      'POSITIVE CONTROL: $8130D2 is clear, so $294F32 is not skipped at its first line');

    const ctx = { unportedLog: g.unportedLog, unported: g.unportedLog, rom: g.rom,
      palette: g.palette };
    bossTimeout294F32(g.ram, g.rom, ctx, a5, a6);       // $294F3C -> 0 -> $294F44 -> $294F5A

    assert.notEqual(g.ram.u16(a5 + BOSS.timeout), 0x78,
      'THE RE-FLOOR DID NOT HAPPEN -- $294F44 fell through');
    assert.equal(g.ram.u16(a5 + BOSS.timeout), 0, '...the counter is left at 0');
    // $294F60 jmp $294DD4 really ran: $294DDC bset #7 on $8130F8 is its first RAM write, and
    // $294E34's `a3Start259962(ram, 6)` is the D-script arm the stage advance hangs off.
    assert.equal(g.ram.u8(BOSS.bossFlags) & 0x80, 0x80,
      '$294DD4 RAN: $294DDC bset #7,$8130F8 -- the boss is dead and the stage can advance');
    assert.equal(g.ram.u32(a5 + BOSS.hp0) >>> 0, 0xffffffff, '  ...and $294E0E emptied the HP');
    assert.equal(g.ram.u16(a6 + BOSS.dying), 1, '  ...and $294F2A set the dying flag');

    // THE ABLATION, on the SAME machine: take the player away and the re-floor comes back.
    g.ram.setU16(P1REC, 0);
    g.ram.setU16(RAM.player2, 0);
    assert.equal(livePlayers2428A6(g.ram), 0, 'with both records cleared $2428A6 reads 0 again');
    const b5 = 0x813800;
    g.ram.setU16(b5 + BOSS.timeout, 1);
    bossTimeout294F32(g.ram, g.rom, ctx, b5, 0x815400);
    assert.equal(g.ram.u16(b5 + BOSS.timeout), 0x78,
      'and $294F50 RE-FLOORS to 120 again -- which is the state the whole run was stuck in');
  });

// **W425 (D58) RENAMED AND REPOINTED THIS TEST, AND THE BYTES IN IT DID NOT MOVE.** It used to
// be called "$28C170 is a COUNTED NOTE on the boss-clear path, not a throwing soundPost", which
// was true when W385 wrote it and stopped being true when `sound.js` grew a second posting path.
// Every disassembly assertion below is unchanged, because the CARTRIDGE has not changed -- what
// changed is the port's ability to pack this shape. The last assertion is the new one and it is
// the point: `$28C170` is not a `$28BB04` wrapper and must never be given a `WRAPPERS` row, AND
// it posts. Those were treated as one claim for eight waves and they are two.
test('W425 the boss-clear path reaches $28C170, and it is the $28BBAC shape, not a WRAPPERS row',
  () => {
    assert.equal(w(0x294df0), 0x4eb9, '$294DF0 jsr (xxx).L');
    assert.equal(l(0x294df2), 0x00242922, '  ...$242922, bossClear242922');
    assert.equal(w(0x242922), 0x4eb9, '$242922 jsr (xxx).L');
    assert.equal(l(0x242924), 0x0028c170, '  ...$28C170');
    // ...and $28C170 really is the $28BBAC shape, which is why it gets its own path.
    assert.equal(w(0x28c174), 0x303c, '$28C174 move.w #imm,D0');
    assert.equal(w(0x28c176), 0x0015, '  ...#$15, a BGM command');
    assert.equal(w(0x28c178), 0x7200, '$28C178 moveq #0,D1 -- and that is ALL it sets');
    assert.equal(l(0x28c17c), 0x0028bbac, '$28C17A jsr $28BBAC -- NOT $28BB04');
    assert.equal(SOUND_WRAPPERS[0x28c170], undefined,
      'so it has no WRAPPERS row, and giving it one would invent an id, a pan and a channel');
  });

// =============================================================================================
// 7 -- WHAT STOPS A COLD BOOT NOW, AND IT IS NOT THIS SUBSYSTEM.
//
// The run reaches GAME OVER, which it never could before, and dies on the game-over screen's own
// unported animation table. Both facts are asserted, because "the run got further" is only worth
// something if the place it stopped is named.
// =============================================================================================

test('W385 the two deferrals W384 counted are GONE from the census', () => {
  assert.equal(noteCount(0x25fe42), 0,
    '$260700 bsr.w $25FE42 is a call now -- rank.js playerRecords25FE42');
  assert.equal(noteCount(0x2603fe), 0,
    '$25D73E jsr $2603FE is a call now -- rank.js stagePair2603FE');
  // POSITIVE CONTROL: the census is not simply empty. `$259C4A` remains the
  // compatibility-chain note once per init, while `$288574` is now a live call.
  assert.equal(noteCount(0x288574), 0, '$260704 jsr $288574 is no longer deferred');
  assert.equal(noteCount(0x259c4a), 3, '$2605CE jsr $259C4A remains counted once per init');
});

// **W386 REWROTE PART (b) OF THIS TEST.** W385 asserted the run ends on a NAMED `Unreached` at
// `$2252F8`, the game-over screen's fade target. W386 declares that 64-byte window, so the run
// does not end there or anywhere else in 14,000 frames. Parts (a) and (c) -- it REACHED the game
// over, and both sound posts on the way now drain through the sound runtime. The historical
// `$2252F8` ablation remains in `tests/w386gameover.test.js` SECTION 3.
test('W386 the cold boot reaches GAME OVER, and no longer stops on the game-over screen\'s $2252F8',
  () => {
    // (a) IT GOT THERE. The lives counter BORROWED, which is $25FFA8's own end-of-game test
    // (`subq.w #1 / tst.w / bpl` -- so -1 and not 0 is the finish) and the state the port could
    // never reach while there was no player to lose.
    assert.equal(RUN.livesLow, -1,
      'the lives counter reached -1: $25FFC4\'s borrow, i.e. the LAST life was spent');
    assert.ok(RUN.everLive.has(0x0d),
      'and bonus-line request 2 created dispatch type $D -- objslot13.js, the GAME-OVER object');

    // (b) AND IT NO LONGER STOPS. W386's `$2252F8` window is 64 bytes, derived from the
    // `words-minus-one` field of the one $288C2E entry that names it and $246B2A's `dbra`.
    assert.equal(RUN.stopError, null,
      `no Unreached anywhere in the run any more; got ${RUN.stopError}`);
    assert.equal(RUN.stoppedAt, 0, '...so there is no stop frame');
    assert.equal(RUN.lastLive, 14000, 'and all 14,000 frames completed');
    assert.ok(RUN.lastLive > RUN.firstPlayerFrame,
      'well past the frame the player was created on, which is what W385 built');

    // (c) THE TWO SOUND CALLS ON THE WAY THERE. Both now post through their
    // cartridge-faithful paths: `$28C170` drains `$15000000`, then `$28C0FC`
    // drains the global immediate-SFX release `$10000000`.
    assert.equal(noteCount(0x28c170), 0,
      '$288A3C jsr $28C170 is posted, not counted');
    assert.ok(RUN.bgmCommands >= 1,
      '$15000000 reached the sound ring and was drained');
    const otherReleaseDeferrals = RUN.notes.filter((line) => line.includes(' x $28C0FC '));
    assert.ok(otherReleaseDeferrals.length >= 1,
      'positive control: the longer run still reaches separate $28C0FC deferrals');
    assert.ok(otherReleaseDeferrals.every((line) => !line.includes('$288A42')),
      '$288A42 posts while every counted $28C0FC call belongs to another cartridge site');
    assert.ok(RUN.globalReleases >= 1,
      '$10000000 reached the sound ring and released immediate SFX');
  });

test('W385 the run is not a fixed point: the machine is doing work right up to the stop', () => {
  assert.ok(RUN.diffBytes > 2000,
    `+3,000 vs the last frame must differ in thousands of bytes; got ${RUN.diffBytes}`);
  assert.ok(RUN.diffBlocks > 40,
    `...spread over dozens of 256-byte blocks; got ${RUN.diffBlocks}`);
  assert.ok(RUN.lastLive > 3000, 'and there really were frames after the +3,000 snapshot');
});
