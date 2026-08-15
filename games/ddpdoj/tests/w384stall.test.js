// W384 -- WHY STAGE 1 REACHED A FIXED POINT AND NEVER PROGRESSED. THE MEASUREMENT.
//
// ===============================================================================================
// **W385 FIXED WHAT THIS FILE MEASURED, AND EDITED THIS FILE ACCORDINGLY. READ THIS FIRST.**
// ===============================================================================================
//
// Everything below the line was written to PIN A BUG. W385 landed the three pieces -- `$25FE42`,
// `$2603FE` and the `$25FF7A` wiring -- and the bug is gone, so the assertions that described it
// are now false. They have been INVERTED rather than deleted: each one still runs, and each one
// still fails if the fix is backed out. The sections that were about something else are
// untouched.
//
// WHAT CHANGED, SECTION BY SECTION:
//
//   1  WAS "the odometer stops at 836 at +9,364". The odometer's stall was real and was the
//      cartridge's own boss lock, but the run NO LONGER LIVES THAT LONG -- see 5. Rewritten to
//      assert the odometer is still ADVANCING when the run ends, which is the fact that remains
//      measurable, and to record 836/+9,364 as the no-player figure it was.
//   2  unchanged in kind; the two snapshot frames moved from +10,000/+14,000 to +3,000/the last
//      surviving frame, for the same reason.
//   3  WAS "THE PLAYER OBJECT IS NEVER CREATED". Inverted.
//   4  WAS "the two dispatcher entries $25FE42 fills are still blank". Inverted.
//   5  WAS "the stage-1 boss is alive and stays alive with $2428A6 reading zero". The boss is
//      never reached now: with no input the player loses its last life at +4,075 and the run ends
//      on the GAME-OVER screen at +4,081. Rewritten to say so and to name the frame.
//      **The unit test underneath it -- `$294F50` re-floors without a player and does not with one
//      -- is UNCHANGED and still green.** It was always a bare-RAM test and it is the mechanism
//      W385 unblocked.
//   6  WAS the two counted deferrals. Inverted: the census must NOT carry them.
//   7  WAS "rank.js THROWS on request 4". Inverted, and its own header already said this would
//      have to happen.
//
// The positive, fix-side measurements live in `tests/w385player.test.js`. This file is kept
// because the DIAGNOSIS in the header below is still the best account of what was wrong.
//
// ===============================================================================================
//
// ===============================================================================================
// THE ANSWER IN ONE LINE
// ===============================================================================================
//
// **THERE IS NO PLAYER.** A cold boot reaches gameplay, draws a background, spawns enemies, runs
// the midboss and arrives at the stage-1 boss -- with object dispatch types **2 and 3 never once
// created**. `$8103E6` (`RAM.player1`) stays `$0000` for the whole run, so `$2428A6`
// (`livePlayers2428A6`) returns 0 forever, so `$294F44/$294F4A` re-floors the boss's 10,800-frame
// timeout to `$78` every 120 frames at `$294F50` and the stage can never end.
//
// The odometer stopping at 836 is NOT the bug. It is the cartridge's own stage-1 BOSS LOCK and it
// is exactly on time (SECTION 1).
//
// ===============================================================================================
// THREE PLACES THE BRIEF THAT SET THIS WAVE IS WRONG, ALL PINNED BELOW
// ===============================================================================================
//
// 1. **"RAM is byte-identical at +10,000 and +120,000."** IT IS NOT. 3,481 bytes across 57
//    256-byte blocks differ between +10,000 and +14,000 alone (SECTION 2); at +120,000 the figure
//    is 3,728 bytes across the same 57 blocks. `w383coldboot.test.js` compares FOUR WORDS and
//    calls the result a fixed point. The machine is still running -- enemies spawn, the boss
//    fires, the RNG turns. What is frozen is the SCROLL, on purpose.
//
// 2. **"Something upstream of the odometer stalls."** Nothing upstream stalls. `$26214C` (op $0C
//    FREEZE) latches `($8,A5)` at scroll-record time `t = $0344` = 836, and its op-$04 partner
//    armed `loops = $FFFF`, so `$261FA8` always takes the rewind branch and the VM can never
//    release its own freeze. `$261324` is the ONLY reader of that flag and it guards exactly one
//    instruction, `$26132C addq.w #$1,$8130CE`. The odometer is the only thing that stops
//    (SECTION 1). `background.js:61-70` already says so; this file measures the frame.
//
// 3. **"It will most likely be a counted `note()` on the path."** It is -- but not the one the
//    brief's own leading candidate (`$261142`, the external unfreeze) points at, and the note text
//    for that one is a red herring for stage 1: its two callers `$26C7F4`/`$26D254` are the
//    STAGE-3 carrier (`src/stage3carrier.js`, ROM closure `$26C266..$26D6EE`), which cannot run in
//    stage 1. Stage 1 does not need the scroll released at all -- it needs the BOSS TO DIE, and
//    `boss.js`'s own header says "STAGE 1 ENDS EVEN IF THE BOSS IS NEVER SHOT" via the
//    `$294F3C subq.w #$1,$22(a5)` timeout. The timeout is what is blocked, and the blocker is the
//    missing player (SECTIONS 3-5).
//
// ===============================================================================================
// THE CALL GRAPH THAT IS BROKEN, EVERY LINK BY ADDRESS
// ===============================================================================================
//
//   $2605C8   the rank object's state-0 INIT (object type $A)
//     $260700   bsr.w $25FE42                                   <-- **DEFERRAL 1, counted 1x**
//       $25FE42..$25FEDE, 156 bytes / 29 instructions, table at $25FE22..$25FE41 (32 bytes).
//       Fills BOTH $24-byte dispatcher entries $8130FA (P1) and $81311E (P2) with
//         ($C,$E)/($10,$12) = the spawn position ($1000,$0E00 / $1000,$2A00)
//         ($14)            = THE OBJECT TYPE, 2 for P1 and 3 for P2
//         ($16)            = the side, 0 / 1
//         ($8)             = the LIVES POINTER, $8130BE / $8130C0
//       then $25FEA6/$25FEB6/$25FECC create dispatch types 0, 4 and 4 (the HUD and the two
//       announcement objects). Its ONLY callee is $241182, which this port has as
//       `objalloc.js stageCreate`.
//
//   $25D560   the select screen's state-7 handler (`objslot17.js phase7_25D560`)
//     $25D73E   jsr $2603FE, behind the `$812F80` one-shot latch     <-- **DEFERRAL 2, counted 1x**
//       (`$260558 bsr.w $2603FE` from `$26051A` is a SECOND call site and it does NOT fire on a
//       cold boot: it is gated on `$813080`, which the handoff leaves 0. The census carries
//       objslot17.js's text -- "D0 = record 0's ($56) anchor $117914C0" -- and not rank.js's.)
//       $2603FE..$2604A8, 171 bytes / 40 instructions. For each side whose $813084/$813086 is
//       not $FF it runs `$260434 jsr $25FF38` with D1 = **4** -- i.e. it ARMS BONUS-LINE REQUEST 4
//       -- and creates a type-$B object. Its callees: $25FF38 (ported, `player.js
//       armRequest25FF38`), $241182 (ported), $287084 and $2870E6 (25 instructions each, pure RAM
//       writes to $81B4xx), $287A5E (unread).
//
//   $25FF7A   the bonus-line dispatcher, walking $8130FA and $81311E at stride $24
//     request 4 -> $2601F4 (`tally.js bonusLine42601F4`, PORTED since W292)
//       $260204   move.w (A1,D0.w),(A0)     seeds the LIVES COUNTER from the $80380E dip
//       $26022A   move.w ($14,A6),D0 / jsr $241182   **CREATES THE PLAYER OBJECT**
//     -> $2491C0 (`player.js playerObject2491C0`, PORTED)
//       $2492E4   or.w (the $24915E template word),(A6)  sets $8103E6 bit 15
//     -> $2428A6 `livePlayers2428A6` finally non-zero
//     -> $294F32's re-floor is skipped, $294F60 jmp $294DD4, D-script 6, $242952, stage advance.
//
// **AND THE DISPATCHER ITSELF IS BROKEN INDEPENDENTLY OF THE TWO DEFERRALS.** `tally.js` ports all
// nine bonus lines and exports `tallyDriver25FF7A`, and NOTHING IN `src/` CALLS IT. `rank.js` runs
// `$25FF7A` at two sites ($2607A4 and $26059E) through its own `computedDispatch`, whose
// `DISP_25FF7A_TARGETS` maps only requests 1 and 9 and `unreached()`s the rest with the text
// "a per-player hyper/palette/sound servicer ... the unported hyper subsystem (Wave B)".
// **THAT TEXT IS STALE AND FALSE**: `$25FF52` is the bonus-line table and every line 1..9 has been
// ported (W289..W296). SECTION 6 pins both halves. It is also a LIVE CRASH, not a latent one:
// `$25FFA8` (request 1, the respawn) arms request **2** at `$260004` when a side runs out of
// lives, so any real death sequence walks straight into the throw.
//
// ===============================================================================================
// WHAT IS **NOT** CLAIMED HERE
// ===============================================================================================
//
// Nothing in `src/` is changed by this wave. Porting `$25FE42` + `$2603FE` + wiring `$25FF7A`
// touches `rank.js`, needs `$287084`/`$2870E6`/`$287A5E`, turns object type $B ($240F62[11],
// $25DBB4) on for the first time, and immediately runs into a FOURTH gap that is nothing to do
// with the stall: `sound.js postWrapper` THROWS (it does not `note()`) on `$28C170`, reached from
// `boss.js bossClear242922` inside `$294DD4`. Measured by driving the whole chain from a harness
// (see the wave report). That is a wave, not a bounded fix, so this file measures and does not
// patch.

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
import { ENEMY } from '../src/enemies.js';
import { BGRAM } from '../src/background.js';
import { BOSS, livePlayers2428A6, bossTimeout294F32 } from '../src/boss.js';
import { TALLY, tallyDriver25FF7A } from '../src/tally.js';
import { RANK } from '../src/rank.js';
// W386: the `Unreached` import is gone with the assertion that used it -- this run no longer
// throws one. `tests/w386gameover.test.js` SECTION 3 holds the ablation that still does.

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const tablesJson = JSON.parse(readFileSync(here('../rip/port/player.tables.json'), 'utf8'));
const seed = new Uint8Array(readFileSync(here('../rip/web/seed.bin')));

const NO_PLAYER = 0xffff;
const STATE = SCREEN8.state;          // $812E56
const ODO = BGRAM.clock;              // $8130CE
const P1REC = RAM.player1;            // $8103E6
const P2REC = RAM.player2;            // $810448
const LIVEBITS = 0x813090;            // $2491CC ori.w #$1,$813090
const LIVES1 = 0x8130BE;              // the P1 lives counter $25FE42 points ($8,A6) at
const BOSS1 = 0x292902;               // the stage-1 boss's per-frame handler
const STAGESTART_D6 = 0x813080;       // rank.js STAGESTART.wordD6 -- $260542's gate

const coinWord = () => (0xffff & ~(1 << COIN_BITS.COIN1)) & 0xffff;

/** `w383coldboot.test.js`'s chain, unchanged, and its milestone asserted so this file cannot
 *  silently measure a run that never started. The two traps that file documents are load-bearing
 *  here too: the coin word is `$FFFE` from a BIT INDEX, and START is `portWordFromBits`, not
 *  `~(1 << BIT.start)`. */
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
// ONE 14,000-FRAME RUN, SHARED. It costs about seven seconds, and every section below reads a
// different fact out of the SAME run rather than paying for it again -- so the sections cannot
// disagree with each other about what the machine did.
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
  const bossRec = () => {
    for (let i = 0; i < ENEMY.slots; i++) {
      const rec = ENEMY.table + i * ENEMY.stride;
      if (g.ram.u16(rec) !== 0 && (g.ram.u32(rec + ENEMY.handlerOff) & 0xffffff) === BOSS1) {
        return rec;
      }
    }
    return 0;
  };

  const everLive = new Set();
  let odo = 0, odoLastFrame = 0, bossFirstFrame = 0;
  let at3k = null;
  // W388 -- SLOT [12]'S TEARDOWN NOW RUNS ITS TWO CLEARS, so a dozen words this file used to
  // read at the LAST frame are wiped before the run ends. `$24A810` blanks $8103E6..$812977 and
  // `$2603DA` blanks $81308C..$813157, and the latter contains the odometer ($8130CE), the pause
  // word ($8130D2), the lives counters ($8130BE/$8130C0) and the whole `TALLY.side0` block
  // ($8130FA). None of the measurements below changed -- the FRAME they have to be taken on did.
  // These three fields capture each one at its peak, plus the frame the teardown landed, so the
  // assertions stay measurements of the same thing instead of being relaxed to fit.
  let odoPeak = 0, odoPeakFrame = 0, teardownFrame = 0;

  // A TARGETED snapshot, not a RAM copy: these eleven words are every field this file reads at
  // the last frame, and refreshing them once per frame costs nothing where copying 2MB would.
  // `atTeardown` therefore holds the LAST FRAME ON WHICH THE PLAYER SUBSYSTEM STILL EXISTED.
  const WATCH = [
    [TALLY.side0 + TALLY.ptr, 32], [TALLY.side1 + TALLY.ptr, 32],
    [TALLY.side0 + TALLY.type, 16], [TALLY.side1 + TALLY.type, 16],
    [TALLY.side0 + 0x16, 16], [TALLY.side1 + 0x16, 16],
    [TALLY.side0 + TALLY.argA, 16], [TALLY.side0 + TALLY.argB, 16],
    [BOSS.deathPause, 16], [ODO, 16], [LIVES1, 16],
  ];
  const snapWatch = () => {
    const m = new Map();
    for (const [a, wide] of WATCH) m.set(`${a}:${wide}`, wide === 32 ? g.ram.u32(a) : g.ram.u16(a));
    return { u16: (a) => m.get(`${a}:16`), u32: (a) => m.get(`${a}:32`) };
  };
  let atTeardown = null;
  // W385: the loop CATCHES. Before W385 this run survived all 14,000 frames because nothing
  // happened in it; now it reaches a GAME OVER and stops on the game-over screen's own unported
  // table, and the frame it stops on is one of the facts SECTION 5 measures.
  let stoppedAt = 0, stopError = null, lastLive = 0, playerFrame = 0, livesLow = 0x7fff;

  for (let f = 1; f <= 14000; f++) {
    try {
      g.step(NO_PLAYER);
    } catch (e) {
      stopError = e; stoppedAt = f; break;
    }
    for (const t of typesLive()) everLive.add(t);
    const o = g.ram.u16(ODO);
    if (o !== odo) { odo = o; odoLastFrame = f; }
    if (o > odoPeak) { odoPeak = o; odoPeakFrame = f; }
    // The teardown is the frame `$2603DA` blanks the tally block's pointer word. While that word
    // is still live the snapshot is refreshed; the frame it goes to zero, the snapshot freezes.
    if (g.ram.u32(TALLY.side0 + TALLY.ptr) !== 0) atTeardown = snapWatch();
    else if (!teardownFrame && atTeardown) teardownFrame = f;
    if (!bossFirstFrame && bossRec()) bossFirstFrame = f;
    if (!playerFrame && (g.ram.u16(P1REC) & 0x8000) !== 0) playerFrame = f;
    livesLow = Math.min(livesLow, g.ram.i16(LIVES1));
    if (f === 3000) at3k = Uint8Array.from(g.ram.b);
    lastLive = f;
  }

  let diffBytes = 0;
  const diffBlocks = new Set();
  for (let i = 0; at3k && i < at3k.length; i++) {
    if (at3k[i] !== g.ram.b[i]) { diffBytes++; diffBlocks.add((0x800000 + i) & ~0xff); }
  }

  return {
    g, everLive, odo, odoLastFrame, bossFirstFrame, bossRec: bossRec(),
    stoppedAt, stopError, lastLive, playerFrame, livesLow,
    diffBytes, diffBlocks: diffBlocks.size,
    notes: g.unportedLog.report(),
    // W388: the pre-teardown machine, and the frame it stopped being the live one.
    odoPeak, odoPeakFrame, teardownFrame, atTeardown,
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

// =============================================================================================
// 1 -- WHAT STOPS FIRST: THE ODOMETER, AND IT STOPS BECAUSE THE CARTRIDGE TOLD IT TO.
//
// `$8130CE` is bumped at `$26132C`, one instruction, guarded by `$261324 tst.w ($8,A5)`. Op $0C
// (`$26214C`) sets that flag at scroll-record `t = $0344`, and its op-$04 partner armed
// `loops = $FFFF`, which `background.js:994-1014` already identifies as the stage-1 boss lock.
// The gate the brief warned about looking for IS HERE, and the hold IS intended.
// =============================================================================================

// **W385 REWROTE THIS TEST AND W386 REWROTE ONE LINE OF IT AGAIN.** W385's version asserted
// `RUN.lastLive - RUN.odoLastFrame < 30` -- "the odometer is still moving when the run STOPS" --
// which was true only because the run stopped, at +4,081, three frames after the game-over object
// appeared. W386 declares the `$2252F8` window and the run no longer stops at all, so the
// odometer's last movement is now ~9,900 frames before the end of a 14,000-frame run and that
// assertion cannot survive. What it was measuring is preserved and made sharper: the odometer
// stops SHORT of the boss lock, and it stops WHERE THE GAME OVER PAUSES IT.
test('W386 the odometer stops short of the boss lock, and it is the GAME OVER that parks it',
  () => {
    // **W388 RE-BASE: `RUN.odo` -> `RUN.odoPeak`.** `$8130CE` is inside the $81308C..$813157 span
    // `clearRankRam2603DA` blanks, and slot [12]'s teardown now calls it, so the odometer reads
    // 0 at frame 14,000. The claim is about where the odometer STOPPED CLIMBING, which is
    // `odoPeak`/`odoPeakFrame` -- the same number this test always meant. Nothing is relaxed:
    // the final zero is asserted separately below, and it is the teardown's signature.
    assert.ok(RUN.odoPeak > 100,
      `the odometer is well past zero when it stops; got ${RUN.odoPeak}`);
    assert.ok(RUN.odoPeak < 836,
      `and it has NOT reached the boss-lock record time $0344 = 836 -- the game over comes `
      + `first. Measured ${RUN.odoPeak}`);
    // WHERE it parks: within a few frames of the game-over object, NOT at the boss lock. The
    // type-$D create is at +4,077 (`w386gameover.test.js` SECTION 5 asserts that frame), and
    // `$8130D2` -- asserted below -- is what holds it from then on.
    assert.ok(Math.abs(RUN.odoPeakFrame - 4077) < 30,
      `its last movement is +${RUN.odoPeakFrame}, a handful of frames from the +4,077 game-over `
      + `create -- not the +9,364 the boss lock used to park it at`);
    assert.ok(RUN.lastLive - RUN.odoPeakFrame > 9000,
      `and it then sits still for the remaining ${RUN.lastLive - RUN.odoPeakFrame} frames, which `
      + `is only possible because the run no longer ends three frames later (W386)`);
    // ...and then W388's teardown zeroes it outright. `$2603DA` is `lea $81308C,A0 / move.w
    // #$65,D0 / clr / dbra`, $66 words = $81308C..$813157, and $8130CE is inside that span.
    assert.equal(RUN.g.ram.u16(ODO), 0,
      'and at frame 14,000 it is ZERO -- $28F374 jsr $2603DA wiped it (W388)');
    assert.ok(RUN.teardownFrame > RUN.odoPeakFrame,
      'the wipe happens AFTER the last climb, so it cannot be what parked the odometer');

    // ...and the freeze that parked it at 836 is therefore never latched in this run.
    assert.equal(noteCount(0x261142), 0,
      '$26214C\'s op-$0C freeze is NOT reached -- it fires at record time $0344 and the run '
      + 'does not live that long any more');

    // WHY the last few frames are still: `$8130D2` -- the GLOBAL PAUSE -- is SET at the end, and
    // it is set by the game over, not by the scroll VM. `stageend.js bgPause25FD82` is its
    // writer and `tally.js liveSides25FD94` re-sets it when NO side is live, which is exactly
    // what `$25FDD4 cmpi.w #-$1,$81308E` decides once the last life is gone. So the two ways the
    // odometer can stop are BOTH pinned here and they are told apart by which word did it.
    // W388 RE-BASE: at the LAST FRAME THE WORD EXISTS, for the same reason as the odometer --
    // $8130D2 is inside $81308C..$813157 and `$28F374 jsr $2603DA` blanks it.
    assert.equal(RUN.atTeardown.u16(BGRAM.bgFreeze), 1,
      '$8130D2 = 1 while it lasts -- $25FDE0 bsr $25FD82, the no-live-side pause, NOT the '
      + 'scroll VM\'s own op-$0C freeze');
  });

// =============================================================================================
// 2 -- THE BRIEF'S "FIXED POINT" IS NOT ONE. THE MACHINE IS STILL RUNNING.
//
// `w383coldboot.test.js` SECTION 5 compares four words and calls +120,000 "byte-identical" to
// +10,000. Four words are identical. The RAM is not.
// =============================================================================================

// W385 moved the two snapshot frames from +10,000/+14,000 to +3,000/the last surviving frame,
// because there is no +10,000 any more. The claim is unchanged.
test('W384 RAM is NOT a fixed point -- thousands of bytes move over the run\'s last stretch', () => {
  assert.ok(RUN.diffBytes > 2000,
    `+3,000 vs the last frame must differ in thousands of bytes; got ${RUN.diffBytes}`);
  assert.ok(RUN.diffBlocks > 40,
    `...spread over dozens of 256-byte blocks; got ${RUN.diffBlocks}`);
  // **W387: THIS USED TO ASSERT `$812E56 == $E`, "slot [8] is still on arm $E".** It is $2 now,
  // and the reason is the whole of W387: dispatch slot [12] is ported and registered
  // (`src/objslot12.js`), its teardown `$28F368` stages dispatch type 8 at state 2, and the
  // attract sequencer takes the machine back. The claim this test carries -- that the RAM is not
  // a fixed point -- is made by the two assertions above and is UNCHANGED; the state word was an
  // incidental "and we are still in gameplay", which is exactly what stopped being true.
  // **W388 MOVES IT ONE ARM FURTHER, for the same incidental reason.** Arm 2 used to hold
  // forever: `chainLoader246710` allocated the high-score screen's eight-node palette chain and
  // seeded no content, so `runAnimObjects24683E` skipped every node and `chainCheck24681A` never
  // answered zero. W388 ports `$24676A..$2467C3` (`animobjects.js seedChainContent24676A`), the
  // chain drains in 16 frames, `$25B4D2` reports finished and `$25A940` sets state 12. The claim
  // above is still made by the two byte-count assertions and is UNCHANGED.
  assert.equal(RUN.g.ram.u16(STATE), 0x000c,
    'slot [8] is on arm 12 -- arm 2 RAN OUT and handed on (W388, w376attract.test.js)');
});

// =============================================================================================
// 3 -- THE STALL ITSELF: OBJECT DISPATCH TYPES 2 AND 3 ARE NEVER CREATED.
//
// `$240F62[2] = $2491C0` (P1) and `[3] = $249246` (P2) are the PLAYER OBJECTS, and `main.js`
// wires both to `playerObject2491C0`. Neither is ever staged, so the handler never runs, so the
// record `$8103E6` is never given the `$24915E` template word that sets its bit 15.
// =============================================================================================

// **W385 INVERTED THIS TEST.** It asserted `everLive` was exactly `[1, 5, 9, $A]` and that
// `$8103E6`, `$813090` and `$8130BE` were all zero. All five claims are now false, which is the
// whole point of the wave. The list, the record and the two globals are asserted the other way
// round here; `tests/w385player.test.js` SECTION 4 carries the frame-by-frame version.
test('W385 THE PLAYER OBJECT IS CREATED -- dispatch type 2 goes live on a cold boot', () => {
  assert.ok(RUN.everLive.size > 0, 'POSITIVE CONTROL: some objects did live');
  assert.ok(RUN.everLive.has(2), 'dispatch type 2 -- P1 -- IS staged now');
  assert.ok(RUN.everLive.has(0), '...and type 0, the HUD object $25FE42 creates');
  assert.ok(RUN.everLive.has(4), '...and type 4, the two announcement objects');
  assert.ok(RUN.everLive.has(0xb), '...and type $B, the object $2603FE gives the ABSENT side');
  assert.ok(!RUN.everLive.has(3),
    'and still NOT type 3: P2 never pressed START, so $813086 is $FF and it gets no request');
  // The four the old assertion listed are all still there, so this is a strict superset and not
  // a different run.
  for (const t of [0x1, 0x5, 0x9, 0xa]) {
    assert.ok(RUN.everLive.has(t), `the old list's $${t.toString(16)} is still live`);
  }

  assert.ok(RUN.playerFrame > 2300 && RUN.playerFrame < 2500,
    `$8103E6 got bit 15 at +${RUN.playerFrame}; the measured frame is +2,396`);
  assert.equal(RUN.g.ram.u16(P2REC), 0, '$810448 is still ZERO: P2 really did not join');
});

test('W385 and the two dispatcher entries $25FE42 fills are FILLED', () => {
  // **W388 RE-BASE: `RUN.g.ram` -> `RUN.atTeardown`.** Every field below lives in the
  // `TALLY.side0`/`side1` block at $8130FA, inside the $81308C..$813157 span slot [12]'s teardown
  // now blanks through `clearRankRam2603DA`. The values are unchanged and so is the claim -- the
  // frame moved from "the last one" to "the last one on which the player subsystem still exists",
  // which is what these fields were always about. The wipe itself is asserted at the foot.
  const r = RUN.atTeardown;
  // The values are the $25FE22 table's own, and `w385player.test.js` proves them against
  // `rip/web/seed.bin` field by field. Here they are read off the LIVE machine.
  assert.equal(r.u32(TALLY.side0 + TALLY.ptr), LIVES1, 'P1 ($8,A6) points at $8130BE');
  assert.equal(r.u32(TALLY.side1 + TALLY.ptr), 0x8130c0, 'P2 ($8,A6) points at $8130C0');
  assert.equal(r.u16(TALLY.side0 + TALLY.type), 2, 'P1 ($14,A6) = 2, the P1 object type');
  assert.equal(r.u16(TALLY.side1 + TALLY.type), 3, 'P2 ($14,A6) = 3');
  assert.equal(r.u16(TALLY.side0 + 0x16), 0, 'P1 ($16,A6) = side 0');
  assert.equal(r.u16(TALLY.side1 + 0x16), 1, 'P2 ($16,A6) = side 1');
  // ...and ($10,$12) carry the LIVE position $2603FE wrote through them, not the table literal.
  assert.equal(r.u16(TALLY.side0 + TALLY.argA), 0x1179,
    'P1 ($10,A6) is $1179 -- $260414 move.l D0 overwrote the table\'s $1000 with $25D71C\'s '
    + 'anchor $117914C0, which is exactly what rip/web/seed.bin carries');
  assert.equal(r.u16(TALLY.side0 + TALLY.argB), 0x14c0, '...and ($12,A6) is its low word');

  // THE POSITIVE CONTROL, AND IT IS THE BOARD'S OWN: `rip/web/seed.bin` was ripped mid-stage-1
  // from a real run, so it carries exactly what $25FE42 writes. Every field the port used to
  // leave at zero is non-zero there, with the values the $25FE22 table holds -- and, since W385,
  // the port produces the same ones from a cold boot.
  const s = new Ram(seed);
  assert.equal(s.u32(TALLY.side0 + TALLY.ptr), LIVES1, 'SEED: ($8,A6) = $8130BE, the lives ptr');
  assert.equal(s.u32(TALLY.side1 + TALLY.ptr), 0x8130c0, 'SEED: P2 points at $8130C0');
  assert.equal(s.u16(TALLY.side0 + TALLY.type), 2, 'SEED: ($14,A6) = 2, the P1 object type');
  assert.equal(s.u16(TALLY.side1 + TALLY.type), 3, 'SEED: and 3 for P2');
  // ($C,$E) still hold the table's literals; ($10,$12) do NOT, because `$260414 move.l D0,($10,A2)`
  // in `$2603FE` overwrites the pair with the LIVE position the handoff passes. Asserting the
  // literals at ($10,$12) would be asserting a value the board has already moved on from.
  assert.equal(s.u16(TALLY.side0 + 0x0c), 0x1000, 'SEED: ($C,A6) = $1000, the table spawn X');
  assert.equal(s.u16(TALLY.side0 + 0x0e), 0x0e00, 'SEED: ($E,A6) = $0E00, the table spawn Y');
  assert.notEqual(s.u16(TALLY.side0 + TALLY.argA), 0,
    'SEED: and ($10,A6) is non-zero -- $260414 has since written the live position through it');
  assert.equal(s.u16(P1REC) & 0x8000, 0x8000, 'SEED: $8103E6 bit 15 -- the player EXISTS');
  assert.equal(s.u16(LIVEBITS), 1, 'SEED: $813090 = 1, P1 is live');
  assert.equal(s.i16(LIVES1), 2, 'SEED: and $8130BE = 2, two lives in hand');
});

// =============================================================================================
// 4 -- THE CONSEQUENCE: `$2428A6` RETURNS 0, SO THE BOSS TIMEOUT RE-FLOORS FOREVER.
//
// `boss.js`'s own header: "STAGE 1 ENDS EVEN IF THE BOSS IS NEVER SHOT" -- `$22(a5)` is $2A30 =
// 10,800 and `$294F3C` spends one per frame. `$294F50 move.w #$78,$22(a5)` is the arm that makes
// that untrue with no live player, and `boss.js:214-216` says it is "unexercised in every run
// this wave measured (a player is alive throughout)". ON A COLD BOOT IT IS THE ONLY ARM THERE IS.
// =============================================================================================

// **W385 REWROTE THIS TEST.** It asserted the boss arrives near +8,614 and is still in the enemy
// table at +14,000 with `$2428A6` reading 0. None of that happens now: a harness that holds no
// buttons cannot survive stage 1 with a real ship in it, so the run ENDS -- in a game over --
// before the boss is ever spawned. That is not a regression and the test says which it is: the
// mechanism the missing player blocked is proved unblocked by the unit test directly below, and
// by `tests/w385player.test.js` SECTION 6 against a real cold-booted RAM.
// **W386 REWROTE THE SECOND HALF OF THIS TEST.** W385 asserted the run ends on a NAMED
// `Unreached` at `$2252F8` around +4,081. That was the game-over screen's own fade target and
// W386 declares its window, so there is no throw any more: the same run now completes all
// 14,000 frames. The FIRST half -- no boss, the lives counter borrows, type $D is created -- is
// unchanged and still measures what W385 measured. Only the ending changed.
test('W386 the boss is NEVER REACHED -- there is a GAME OVER first, and the run SURVIVES it', () => {
  assert.equal(RUN.bossFirstFrame, 0,
    'the stage-1 boss $292902 never enters the enemy table: the game over comes first');
  assert.equal(RUN.bossRec, 0, '...and there is no boss record at the last frame either');

  // WHY it is over, in the cartridge's own terms: the lives counter BORROWED. `$25FFC4 subq.w #1
  // / tst.w / bpl` finishes on -1 and not on 0, so -1 is the "last life spent" value.
  assert.equal(RUN.livesLow, -1,
    '$8130BE reached -1 -- $25FFA8\'s borrow, the LAST life. Before W385 there was no life to '
    + 'lose and this word never moved off zero');
  assert.ok(RUN.everLive.has(0xd),
    'and bonus-line request 2 created dispatch type $D, the GAME-OVER object (objslot13.js)');

  // AND IT NO LONGER STOPS. W386 declared `$2252F8`, the game-over screen's fade target, so the
  // frame W385 died on ($24683E's first read of that block) completes and the run goes on.
  // `w386gameover.test.js` SECTION 3 ablates that one window and gets the old death back, to
  // the frame, which is what makes this a MEASUREMENT and not merely a silence.
  assert.equal(RUN.stopError, null,
    `the run no longer stops: W386's $2252F8 window; got ${RUN.stopError}`);
  assert.equal(RUN.stoppedAt, 0, '...so there is no stop frame at all');
  assert.equal(RUN.lastLive, 14000, 'and all 14,000 frames completed');

  // ...and the same word SECTION 1 reads is set here, from the other end: `$294F32 tst.w
  // $8130D2 / bne` is the timeout's own first line, so once the last side is gone the timeout
  // would not run even if a boss existed. `BOSS.deathPause` and `BGRAM.bgFreeze` are one word.
  assert.equal(BOSS.deathPause, BGRAM.bgFreeze, '$8130D2 is one word with two names');
  // **W388 RE-BASE: read it at the teardown frame, not at 14,000.** $8130D2 is inside
  // $81308C..$813157, so `clearRankRam2603DA` blanks it too. It WAS set, for the thousands of
  // frames between the game over and the teardown, which is the fact this assertion carries.
  assert.equal(RUN.atTeardown.u16(BOSS.deathPause), 1,
    'it is SET when the teardown runs -- tally.js liveSides25FD94 pauses when no side is live');
  assert.equal(RUN.g.ram.u16(BOSS.deathPause), 0,
    '...and $28F374 jsr $2603DA then clears it, which is what RELEASES the pause (W388)');
});

test('W384 $294F50 re-floors the timeout to $78 with no player, and does NOT with one', () => {
  // A bare RAM, so the ONLY thing that differs between the two halves is $8103E6's bit 15.
  const a5 = 0x813700, a6 = 0x815200;

  const noPlayer = new Ram(null);
  noPlayer.setU16(a5 + BOSS.timeout, 1);              // one frame from expiry
  assert.equal(livePlayers2428A6(noPlayer), 0, 'POSITIVE CONTROL: no player in this RAM');
  bossTimeout294F32(noPlayer, null, {}, a5, a6);      // $294F3C -> 0 -> $294F44 -> $294F50
  assert.equal(noPlayer.u16(a5 + BOSS.timeout), 0x78,
    '$294F50 RE-FLOORS to 120 -- the boss cannot time out over a dead player, forever');

  // THE ABLATION. Same RAM, same timeout, one bit set: `$2428AE tst.w / bpl` needs bit 15, and
  // `$2428B0 btst #0` needs the HIGH byte's bit 0 clear.
  const withPlayer = new Ram(null);
  withPlayer.setU16(a5 + BOSS.timeout, 1);
  withPlayer.setU16(RAM.player1, 0x8000);            // $2492E4's template word, bit 15
  assert.equal(livePlayers2428A6(withPlayer), 0x10, 'P1 now counts as live -- $2428AE gives $10');
  // `$294F60 jmp $294DD4` needs a rom and a ctx this unit test does not have, so the death is
  // allowed to throw; what is asserted is that the RE-FLOOR did not happen, which is the whole
  // difference the missing player makes.
  try { bossTimeout294F32(withPlayer, null, {}, a5, a6); } catch { /* $294DD4 needs a rom */ }
  assert.notEqual(withPlayer.u16(a5 + BOSS.timeout), 0x78,
    'with a live player the counter is NOT re-floored -- $294F44 falls through to the death');
  assert.equal(withPlayer.u16(a5 + BOSS.timeout), 0,
    '...it is left at 0 and $294F5A/$294F60 take over');
});

// =============================================================================================
// 5 -- THE TWO DEFERRALS ON THE PATH. **W385 INVERTED BOTH.**
//
// They were counted `note()`s that this run HIT exactly once each. They are calls now, so the
// census must NOT carry them -- and the neighbours that ARE still deferred are asserted beside
// them, so a broken `report()` cannot make an empty census look like a fix.
// =============================================================================================

test('W385 DEFERRAL 1 IS GONE: $25FE42 is rank.js playerRecords25FE42', () => {
  assert.equal(noteCount(0x25fe42), 0,
    '$260700 bsr.w $25FE42 is a CALL now -- no note at $25FE42 anywhere in the run');
  // POSITIVE CONTROL: its next-door neighbour in the SAME INIT is still deferred and still
  // counted once, so the census is working and the assertion above means something.
  assert.equal(noteCount(0x288574), 1,
    '$260704 jsr $288574, the very next instruction, is STILL deferred and counted once');
});

test('W385 DEFERRAL 2 IS GONE: $2603FE is rank.js stagePair2603FE, and it ARMED REQUEST 4', () => {
  assert.equal(noteCount(0x2603fe), 0, '$25D73E jsr $2603FE is a CALL now');
  // AND THE SITE STILL MATTERS, because $2603FE has TWO callers and only one fires. The proof
  // that it was `$25D73E` and not `$260558` is now a VALUE rather than a note's prose:
  // `$260558` passes the literal $10000E00, `$25D73E` passes `$25D71C`'s live anchor $117914C0.
  // W388 RE-BASE: `$8130FA` is inside `clearRankRam2603DA`'s span and slot [12]'s teardown now
  // calls it, so this is read at the last frame the block was live. Same value, same claim.
  assert.equal(RUN.atTeardown.u16(TALLY.side0 + TALLY.argA), 0x1179,
    'the position that reached ($10,$8130FA) is $25D71C\'s anchor, so objslot17.js:920 ran');
  assert.notEqual(RUN.atTeardown.u16(TALLY.side0 + TALLY.argA), 0x1000,
    '...and NOT rank.js\'s $10000E00, whose $813080 gate never opens on a cold boot');
  assert.equal(RUN.g.ram.u16(STAGESTART_D6), 0,
    'POSITIVE CONTROL: $813080 really is 0, which is what keeps rank.js:$260558 shut');
});

// =============================================================================================
// 6 -- THE THIRD BLOCKER, AND W385 REMOVED IT. **THIS SECTION WAS REWRITTEN BY W385.**
//
// As written for W384 this test pinned the BUG: `rank.js` ran `$25FF7A` through its own
// `computedDispatch`, whose `DISP_25FF7A_TARGETS` mapped requests 1 and 9 only and
// `unreached()`d the rest claiming "the unported hyper subsystem (Wave B)". Its half (a)
// asserted that a frame carrying request 4 THREW, and its own header said so in as many words:
//
//     "THIS TEST PINS THE BUG, NOT THE FIX. When a later wave routes $2607A4/$26059E at
//      rank.js:717/rank.js:395 to tallyDriver25FF7A, half (a) SHOULD go red -- that is the
//      signal that the wiring landed. Half (b) is the part that must stay green forever."
//
// W385 is that wave. Half (a) went red on the first run after the edit and is replaced below by
// its inverse: the SAME hand-seeded request, driven through the SAME real frame, must now be
// CONSUMED by `rank.js`'s own `$2607A4` and must stage the player. Half (b) -- the direct call
// into `tallyDriver25FF7A` -- is kept unchanged underneath it, because it is the control that
// says the two paths agree.
//
// The three `RANK.disp25FF7A*` constants are still asserted even though `rank.js` no longer
// dispatches through them: they are what proves the table `tally.js` walks is the table the
// cartridge's `$25FF7A` walks, and that claim is the whole reason the re-wiring is legitimate.
// =============================================================================================

test('W385 rank.js RUNS bonus-line request 4 through tally.js and the player is staged', () => {
  assert.equal(RANK.disp25FF7ATable, TALLY.side0,
    'rank.js and tally.js walk the SAME table -- $8130FA, stride $24');
  assert.equal(RANK.disp25FF7AStride, TALLY.stride, '...and the same stride');
  assert.equal(RANK.disp25FF7AJump, 0x25ff52, '...and index the SAME jump table $25FF52');

  const g = bootToGameplay();
  for (let i = 0; i < 2100; i++) g.step(NO_PLAYER);       // past the handoff, rank state 1

  // $25FE42's two entries, from the ROM table at $25FE22 (proved against the seed in SECTION 3).
  g.ram.setU32(TALLY.side0 + TALLY.ptr, LIVES1);          // $25FE70 move.l ($C,A0),($8,A6)
  g.ram.setU16(TALLY.side0 + TALLY.argA, 0x1000);         // $25FE58
  g.ram.setU16(TALLY.side0 + TALLY.argB, 0x0e00);         // $25FE5E
  g.ram.setU16(TALLY.side0 + TALLY.type, 2);              // $25FE64 -- the P1 object type
  g.ram.setU16(TALLY.side0 + 0x16, 0);                    // $25FE6A -- side 0
  // ...and $2603FE's `$260434 jsr $25FF38` with D0 = 0, D1 = 4.
  g.ram.setU16(TALLY.side0 + 0x00, 4);
  assert.equal(g.ram.i16(LIVES1), 0, 'POSITIVE CONTROL: the lives counter is still zero');

  // (a) THE WIRING. One real frame. `$2607A4` reaches `tallyDriver25FF7A`, which runs line 4.
  g.step(NO_PLAYER);
  assert.equal(g.ram.u16(TALLY.side0 + 0x00), 0,
    '$2602A6 CONSUMED the request inside a real frame -- rank.js no longer refuses it');
  assert.equal(g.ram.i16(LIVES1), 2,
    '$260204 seeded the lives counter through ($8,A6) from $2600CE[0] = 2');
  // `$26022E jsr $241182` only STAGES; `$24111E commitCreates` drains the queue at the TOP of
  // the next object-driver pass, so the handler cannot have run yet. One more frame.
  assert.equal(g.ram.u16(P1REC), 0, 'and on THAT frame $8103E6 is still 0 -- the create is staged');
  g.step(NO_PLAYER);
  assert.equal(g.ram.u16(P1REC) & 0x8000, 0x8000,
    '...one frame later $2491C0 has run: $8103E6 bit 15, THE PLAYER EXISTS');
  assert.notEqual(livePlayers2428A6(g.ram), 0, '$2428A6 no longer reports zero live players');

  // (b) THE CONTROL, kept from W384 and unchanged: the driver called DIRECTLY, on a second
  // machine, reaches the same place. If (a) ever regressed to a throw this half would still be
  // green, which is how the two halves distinguish "tally.js broke" from "the wiring broke".
  const h = bootToGameplay();
  for (let i = 0; i < 2100; i++) h.step(NO_PLAYER);
  h.ram.setU32(TALLY.side0 + TALLY.ptr, LIVES1);
  h.ram.setU16(TALLY.side0 + TALLY.argA, 0x1000);
  h.ram.setU16(TALLY.side0 + TALLY.argB, 0x0e00);
  h.ram.setU16(TALLY.side0 + TALLY.type, 2);
  h.ram.setU16(TALLY.side0 + 0x16, 0);
  h.ram.setU16(TALLY.side0 + 0x00, 4);
  assert.equal(h.ram.u16(P1REC), 0, 'POSITIVE CONTROL: still no player record on this one');

  const rankSlot = (() => {
    for (let i = 0; i < ALLOC.slots; i++) {
      const a = ALLOC.table + i * ALLOC.stride;
      if ((h.ram.u16(a) & 0x7fff) === 0x0a) return a;
    }
    return 0;
  })();
  assert.notEqual(rankSlot, 0, 'POSITIVE CONTROL: the rank object is in the table');

  // `Game#ctx()` is private, so the four fields `$2601F4`'s chain actually reads are handed over
  // by name off the Game's OWN objects -- not re-created -- so this is the real ROM, the real
  // palette state and the real census, and only the plumbing is local to the test.
  const ctx = { unportedLog: h.unportedLog, unported: h.unportedLog, rom: h.rom,
    palette: h.palette };
  tallyDriver25FF7A(h.ram, h.rom, ctx, rankSlot);          // $25FF7A, called directly

  assert.equal(h.ram.u16(TALLY.side0 + 0x00), 0, '$2602A6 consumed the request');
  // `$26011C move.b $80380E,D0 / add.w D0,D0 / lea ($2600CE,PC),A1 / $260204 move.w (A1,D0.w),(A0)`.
  // $2600CE is `$0002 $0003 $0004 $0000 $0001`, and a cold board's $80380E is 0, so the counter
  // gets 2 -- which is exactly what `rip/web/seed.bin` carries at $8130BE (SECTION 3).
  assert.equal(h.ram.u8(0x80380e), 0, 'a cold board has the $80380E lives dip at index 0');
  assert.equal(h.ram.i16(LIVES1), 2,
    '$260204 seeded the lives counter through ($8,A6) from $2600CE[0] = 2');
  const staged = (() => {
    for (let i = 0; i < ALLOC.slots; i++) {
      if ((h.ram.u16(ALLOC.createStage + i * ALLOC.stride) & 0x7fff) === 2) return true;
    }
    return false;
  })();
  assert.ok(staged, '$26022E jsr $241182 STAGED DISPATCH TYPE 2 -- the P1 player object');
});
