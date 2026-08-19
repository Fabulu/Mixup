// OBJECT TYPE 10 -- THE RANK OBJECT `$260794`.  W127 (Wave A, Tier 1, CORPUS-SAFE).
//
// ============================================================================
// WHAT THIS IS
// ============================================================================
// `$240F62[10] = $260794`, priority `$001F` (the HIGHEST of all twenty object
// types), so it runs FIRST every frame, before the player (`$1C`) and the
// ledger (`$09`).  It owns the dynamic-difficulty value `$81309E` (RANK) and the
// 24.8-fixed-point rank CLOCK `$8130C6` that feeds it.  Until this wave the
// object had NO handler in `main.js defaultHandlers`, so `$81309E`, `$8130C6`
// and the 15-byte fan-out `$8130A1..$8130BD` were all FROZEN at their seed
// values for the whole run (W120's verdict, reproduced `[M]` this wave: zero
// `setU` writes to any of them).
//
// The recompute `$2608D2` is:
//     rank = base[stage] + (clock >> 8) + (hyper ? 16*max(power1,power2) : 0)
// clamped to `$F0` (no hyper) / `$FF` (hyper), pinned to `$F8`/`$FF` on loop 2+,
// written to `$81309E`, then fanned to 15 bullet-system bytes.  See W120 and the
// W127 worklog for the instruction-by-instruction transcription; the formula and
// the fan-out are VALIDATED AGAINST THE SEED in the worklog (predicted $35,
// actual $35; all 15 fan-out bytes exact).
//
// ============================================================================
// WHY THIS IS CORPUS-SAFE (Tier 1, the brief's CORPUS-SAFE contract)
// ============================================================================
// The corpus is owner-decision-4: no hypers, no fire.  On a no-hyper run the
// hyper flag `$81B63E | $81B640` is 0 on BOTH the port and the board, so the
// `16*max(power)` term is 0 and rank reduces to `base[stage] + (clock>>8)`.  The
// power words `$81B646`/`$81B648` are 0 in the seed and have ZERO port writers
// (grep), so the term stays 0.  The recompute reads NO chain/score state (W120
// sec 5, re-verified `[M]`), so this wave CANNOT perturb the frame-exact chain
// decrement (`$284636`/`$2847D4`, object type 0) or any score machine.  The
// hyper subsystem that would make the power term nonzero is Wave B (3-4 waves,
// MAME-gated, separate).
//
// The two computed-call dispatchers `$25FF7A` and `$288610` (called from the
// state-1 body) walk 2-entry RAM tables and SKIP entries whose index word is 0.
// `[M]` ALL FOUR index words are 0 in the seed (`$8130FA`, `$81311E`, `$81B706`,
// `$81B71C`); their only writers are in the unported hyper-setup `$2885xx` and
// the build-A `$187xxx` ISR region.  So both are CORPUS NO-OPS: the board reads
// 0, skips, returns; the port does the same.  Nonzero indices (a future hyper
// wave) hit `unreached()` rather than calling an unported target.
//
// **W418 -- TWO SENTENCES ABOVE ARE NOW WRONG AND ARE CORRECTED HERE RATHER
// THAN DELETED**, because the corpus claim they support is still true and the
// reasons matter.  (a) `$288610`'s writers are NOT "the unported hyper-setup
// $2885xx": `$288598`/`$2885C6` are `objslot13.js selectSet288598` and
// `selectAdvance2885C6`, ported since W373, and they are the CONTINUE panel's
// selectors, not hyper setup.  (b) "a future hyper wave" is wrong about which
// wave: a full boot now reaches index **3** on three of six playgate holds, and
// the four targets are `src/continuescreen.js` as of this wave.  `$25FF7A`'s
// half of the paragraph stands as W385 left it.

import { RAM } from './machine.js';
import { unreached } from './unported.js';
import { queueKill, stageCreate, ALLOC } from './objalloc.js';
import { tallyDriver25FF7A } from './tally.js';
import { DISP_288610_TARGETS } from './continuescreen.js';
import { armRequest25FF38 } from './player.js';
import {
  txPrint240DC2, txPrint240EBC, scoreDrainInit287084, slideArm287A5E,
} from './hud.js';
import { install2414BE } from './palette.js';
import { writeStage25FD0C, wipeStageBlock25FD24 } from './stageend.js';
import { u16, i16 } from './ram.js';

/** ROM and RAM addresses the rank object speaks in, each cited at the line that
 *  implements it. */
export const RANK = {
  dispatch: 0x240F62,       // object table; entry [10] = $260794, priority $001F
  handler: 0x260794,        // the state machine
  stateOff: 0x02,           // $260794 tst.b ($2,A5) -- the state byte
  initState: 0x2605C8,      // state 0 -> INIT (DEFERRED, cold-boot only)
  teardown2603DA: 0x2603DA, // state 2 -> jsr $2603DA then jmp $241292 (self-kill)
  selfKill: 0x241292,       // lea $4C(A5),A0 / bra $241238 -- deferred kill by ID
  // state-1 per-frame body $2607A8..$260808
  gate813082: 0x813082,     // $2607A8 tst.w -- per-frame gate (set -> skip body)
  freezeD2: 0x8130D2,       // $2607B2 tst.w -- freeze/pause; SHARED with
                            //   stageend.js SE.pauseFlag (bgPause25FD82 sets it)
  d4: 0x8130D4,             // $2607BC tst.w / $2607C6 subq.w #1 -- a countdown
  frameCopy: 0x8130CA,      // $2607D4 move.w D0 -- $80390A & $0E
  clock: 0x8130C6,          // $2607E4 addq.l #1 -- THE RANK CLOCK (24.8 fixed)
  recompute: 0x2608D2,      // $2607EA jsr -- the recompute + clamp + fan-out
  callee288610: 0x288610,   // $2607F0 jsr -- computed-call dispatcher.  A no-op on the SEED
                            //   corpus (both index words are 0 there), NOT in general: W418 ports
                            //   all four of its jump-table targets as src/continuescreen.js.
  loopWord: 0x813098,       // $2607F6 tst.w -- 0 = loop 1, !=0 = loop 2+
  loop2Hud: 0x81B414,       // $260800 move.w #$1 -- set on loop 2+
  // the recompute $2608D2
  basePtr: 0x81315C,        // $2608D2 movea.l -- per-stage base table POINTER
                            //   (seed -> ROM $260874, a 6-byte table; W127 window)
  stageIdx: 0x813092,       // $2608D8 move.w -- stage index (0 = stage 1)
  hyperP1: 0x81B63E,        // $2608F4 move.w -- hyper active P1
  hyperP2: 0x81B640,        // $2608FA or.w -- hyper active P2
  powerP1: 0x81B646,        // $260902 move.w -- power P1 (the 16*max term)
  powerP2: 0x81B648,        // $260908 cmp.w -- power P2
  rankOut: 0x81309E,        // $260944 move.w D1 -- THE RANK OUTPUT word
  // computed-call dispatcher $288610 -- the CONTINUE panel (W418, src/continuescreen.js)
  disp288610Table: 0x81B706,// $288610 lea -- 2-entry table, stride $16
  disp288610Stride: 0x16,
  disp288610Jump: 0x288638, // $28861E lea (PC) -- the jump table
  // computed-call dispatcher $25FF7A (the state-1 FIRST callee; corpus no-op)
  disp25FF7A: 0x25FF7A,
  disp25FF7ATable: 0x8130FA,// $25FF7A lea -- 2-entry table, stride $24
  disp25FF7AStride: 0x24,
  disp25FF7AJump: 0x25FF52, // $25FF92 lea (PC) -- the jump table
};

/** W378 -- what is STILL deferred inside state-0 INIT `$2605C8`.  The INIT's own
 *  RAM writes and its ten `$2414BE` TEXT installs are ported now (`rankInit2605C8`
 *  below); what remains are its calls into subsystems no wave has read, and each of
 *  those is counted at ITS OWN call site rather than as one blanket skip.
 *  The entry left here is the summary, kept because it is the routine's name and
 *  because the deferral is still real.
 *
 *  W385 removed `$25FE42` from the list below -- `$260700 bsr.w $25FE42` is a CALL
 *  now, `playerRecords25FE42`, so ten remain and not eleven. Leaving it in would be
 *  a stale deferral of exactly the kind trap 13 is about. */
export const RANK_DEVIATION = Object.freeze({
  [0x2605c8]: 'PARTIAL -- $2605C8, the state-0 INIT, $2605C8..$26070A. W378 ports '
    + 'its RAM writes (the $2(A5) state byte, the ten $2414BE TEXT installs, '
    + '$813080 = 0, $813082 = 1, the $813098 loop branch and the loop-2+ clears at '
    + '$260680..$2606C9) and $2606CE bsr $25FD0C; W385 adds $260700 bsr.w $25FE42, '
    + 'which fills both $25FF7A dispatcher records and creates the HUD and the two '
    + 'announcement objects. Its nine remaining calls ($259C4A, $2603DA, $28D552, '
    + '$28EBFE, $27F87C, $2884E2, $287024, $24A810, $288574) are counted at their '
    + 'own call sites. $260666 move.w '
    + '#$1,$813082 is the one that matters here: it is the gate $2607A8 tests, and '
    + 'while the whole INIT was deferred the gate stayed 0, so the per-frame body '
    + 'ran before $26089E had installed the rank base pointer $81315C.',
});

const note = (ctx, a, w) => (ctx?.unportedLog ?? ctx?.unported)?.note(a, w);

// ===========================================================================
// W378 -- $81315C, THE RANK BASE POINTER, AND THE CHAIN THAT INSTALLS IT
// ===========================================================================
//
// `$2608D2 movea.l $81315C.l,A0` is the first instruction of the recompute and
// on a cold boot it read ZERO, so `base[stage]` was a read of ROM `$0` and
// `RomWindows` threw four frames after a P1 START. The pointer had no writer in
// the port at all. It has exactly ONE in the cartridge:
//
//   [M] the longword `0081315C` appears FOUR times in the 6 MiB image --
//       $15FC20 and $15FC28 (the build-A twin of this routine) and $2608CC and
//       $2608D4. $2608D4 is the recompute's own `movea.l`. **$2608CC is the only
//       write, and it is `$2608CA move.l (A0),$81315C`, inside $26089E.**
//
// SO WHY WAS IT NOT RUNNING? Two separate reasons, and both are fixed here:
//
//  1. `$26089E` was unported. Its only caller is `$260578 jsr $26089E` at the
//     tail of `$26051A`, whose only caller is `$26059A bsr $26051A` inside
//     `$260580`, whose only caller is `$26077E bsr.w $260580` at the tail of
//     `$26070C` -- the one-shot handoff `objslot17.js` ports as
//     `handoff26070C`.
//
//     **W394: THAT SENTENCE USED TO END "which NOTES `$260580` instead of
//     running it", AND IT HAD BEEN A LIE SINCE W378.** `$26077E` is a CALL:
//     `src/objslot17.js` imports `stageStart260580` from this file and invokes
//     it (`objslot17.js` `stageStart260580(ram, rom, ctx, d6, d7, a5);`), with
//     its own comment eleven lines above reading "**AND THIS IS A CALL NOW, NOT
//     A NOTE.**". Nothing asserted the stale wording -- `grep` over `tests/`
//     finds no test quoting it -- so it survived sixteen waves purely because a
//     comment beside a live call is invisible. Trap 14, in its own words.
//  2. **The cartridge never lets the recompute run before that handoff.**
//     `$260666 move.w #$1,$813082` in the state-0 INIT raises the very gate
//     `$2607A8 tst.w $813082 / bne $260808` tests, and the ONLY thing that
//     lowers it again is `$26071A clr.w $813082` -- the first thing `$26070C`
//     does before it walks down to `$26089E`. So on a board the rank body is
//     switched OFF from the moment slot [9] creates the object (`$25CA78
//     move.w #$A,D0 / jsr $241182`, objslot9.js) until the handoff has installed
//     the pointer. The port deferred the whole INIT, so the gate stayed 0 and
//     the body ran with a null pointer from its second frame.
//
// THE TABLES. `$26089E` picks ONE OF FOUR per-stage base tables by a config
// byte, and both of its `lea (dN,PC)` bases are pinned by code, not by looks:
//
//     $2608B6  41fa ffde   lea (-$22,PC),A0   EA = $2608B8 - $22 = $260896
//     $2608C4  41fa ffc0   lea (-$40,PC),A0   EA = $2608C6 - $40 = $260886
//
// so the WORD table lives at $260896 and the LONGWORD table at $260886. The
// longword table's four entries are $26086E, $260874, $26087A, $260880 -- six
// apart, and the last of them ends at $260886, which is the longword table's own
// base. The longword table then ends at $260896, the word table's base ($10 =
// four longwords), and the word table ends at $26089E, the routine's own first
// instruction ($8 = four words). Three tables, every bound named by an address
// the code itself computes. W127's window comment called `$26086E` "the rank
// object's own code" and `$26087A` "more rank/difficulty data" -- both wrong;
// they are difficulty tables 0 and 2 of the same set of four.

/** `$26089E..$2608D0`, 52 bytes -- **THE ONLY WRITER OF `$81315C`.** */
export const RANKBASE = Object.freeze({
  addr: 0x26089e, rts: 0x2608d0, bytes: 0x34,
  cfg: 0x80380c,             // $2608A0 move.b $80380C.l,D0 -- the config byte
  force: 0x803926,           // $2608A6 tst.w $803926 / $2608AC beq.w $2608B4
  forceIndex: 1,             // $2608B0 move.b #$1,D0 -- non-zero $803926 pins index 1
  wordTable: 0x260896, wordEntries: 4, wordBytes: 0x08,     // $2608B6 lea (-$22,PC)
  wordOut: 0x813160,         // $2608BC move.w (A0),$813160
  ptrTable: 0x260886, ptrEntries: 4, ptrBytes: 0x10,        // $2608C4 lea (-$40,PC)
  ptrOut: 0x81315c,          // $2608CA move.l (A0),$81315C
  // The four tables the longword table points at, and the stride that bounds each.
  baseTables: Object.freeze([0x26086e, 0x260874, 0x26087a, 0x260880]),
  baseStride: 6, baseBytes: 0x18,
});

/**
 * `$26089E` -- install the per-stage rank base table pointer.
 *
 *     26089E  7000            moveq   #$0,D0
 *     2608A0  1039 0080380C   move.b  $80380C.l,D0
 *     2608A6  4a79 00803926   tst.w   $803926.l
 *     2608AC  6700 0006       beq.w   $2608B4
 *     2608B0  103c 0001       move.b  #$1,D0
 *     2608B4  d040            add.w   D0,D0
 *     2608B6  41fa ffde       lea     ($260896,PC),A0
 *     2608BA  d0c0            adda.w  D0,A0
 *     2608BC  33d0 00813160   move.w  (A0),$813160.l
 *     2608C2  d040            add.w   D0,D0
 *     2608C4  41fa ffc0       lea     ($260886,PC),A0
 *     2608C8  d0c0            adda.w  D0,A0
 *     2608CA  23d0 0081315C   move.l  (A0),$81315C.l
 *     2608D0  4e75            rts
 *
 * `moveq #$0,D0` then `move.b` means D0 is 0..$FF, so both `adda.w`s take a
 * POSITIVE word and the two indexes are `cfg*2` and `cfg*4`. THERE IS NO RANGE
 * CHECK ON THE CONFIG BYTE. A byte of 4 or more indexes past the four entries
 * and the ROM window is what says so, loudly, at the address it reached -- which
 * is the honest behaviour, because the cartridge would read whatever is there.
 *
 * On a COLD board `$80380C` is 0 (nothing in this port writes it; the settings
 * block belongs to the `$23BEEA` reset prologue, which is a counted deferral in
 * `frontend.js`), so index 0 is picked and the pointer becomes `$26086E`. The
 * `rip/web/seed.bin` board had been configured and carries `$260874`, index 1 --
 * the same relationship `$803957`, the coinage byte, has in W377.
 */
export function installRankBase26089E(ram, rom) {
  let d0 = ram.u8(RANKBASE.cfg);                            // $26089E / $2608A0
  if (ram.u16(RANKBASE.force) !== 0) d0 = RANKBASE.forceIndex;   // $2608A6..$2608B0
  d0 = u16(d0 * 2);                                         // $2608B4 add.w D0,D0
  ram.setU16(RANKBASE.wordOut, rom.u16(RANKBASE.wordTable + d0));   // $2608B6..$2608BC
  d0 = u16(d0 * 2);                                         // $2608C2 add.w D0,D0
  ram.setU32(RANKBASE.ptrOut, rom.u32(RANKBASE.ptrTable + d0));    // $2608C4..$2608CA
}

/** `$2604AA`, `$2604F4`, `$26051A` and `$260580` -- the stage-start chain that
 *  ends at `$26089E`. Byte extents are `rts` inclusive. */
export const STAGESTART = Object.freeze({
  start: 0x260580, startRts: 0x2605a2, startBytes: 0x24,
  clear: 0x2604f4, clearRts: 0x260518, clearBytes: 0x26,
  clearMore: 0x2604aa, clearMoreRts: 0x2604f2, clearMoreBytes: 0x4a,
  install: 0x26051a, installRts: 0x26057e, installBytes: 0x66,
  wipe: 0x25fd24, dispatch25FF7A: 0x25ff7a,
  twin: 0x2605a4, twinRts: 0x2605c6,         // the byte-identical, uncalled copy of $260580
  zeroWord: 0x81296e,        // $260580 clr.w $81296E
  wordD7: 0x81307e,          // $260586 move.w D7,$81307E
  wordD6: 0x813080,          // $26058C move.w D6,$813080
  id5: 0x813148, id1: 0x813144,          // $260524 / $260534 move.l D0
  type5: 5, type1: 1,                    // $26051A / $26052A move.w #n,D0
  childField: 0x06,          // $26053A move.w $81307E,($6,A0)
  pairSite: 0x2603fe, pairD0: 0x10000e00, pairD1: 0x10002a00,   // $26054C..$260558
  txSrc: 0x222618, txBank: 0,            // $260564 lea $222618,A0 / $26056A moveq #$0
  txSite: 0x26056c,                      // $26056C jsr $2414BE
  palWalk: 0x241654, palWalkSite: 0x260572,
  killIdA: 0x8130fa, killIdB: 0x81311e,  // $2604AA lea A2 / $2604B0 lea A3
  killOffs: Object.freeze([0x18, 0x1c, 0x20]),
});

const hexA = (v) => `$${v.toString(16).toUpperCase()}`;

// ===========================================================================
// W385 -- `$2603FE`, THE ROUTINE THAT ARMS BONUS-LINE REQUEST 4
// ===========================================================================
//
// `$2603FE..$2604A9`, 172 bytes / 40 instructions, and TWO call sites: `$260558`
// in `stageInstall26051A` above (gated on `$813080`, which a cold boot leaves 0,
// so it does NOT fire) and `$25D73E` in `objslot17.js phase7_25D560`, behind the
// `$812F80` one-shot latch, which DOES.
//
//     2603FE  48e7 fffe        movem.l D0-D7/A0-A6,-(SP)     REGISTER-TRANSPARENT
//     260402  45f9 008130FA    lea $8130FA,A2
//     260408  47f9 0081311E    lea $81311E,A3
//     26040E  4a80             tst.l D0
//     260410  6b00 0006        bmi.w $260418                 SKIP a negative D0
//     260414  2540 0010        move.l D0,($10,A2)
//     260418  4a81             tst.l D1
//     26041A  6b00 0006        bmi.w $260422
//     26041E  2741 0010        move.l D1,($10,A3)
//     260422  3039 00813084    move.w $813084,D0
//     260428  0c40 00ff        cmpi.w #$FF,D0
//     26042C  671e             beq.s $26044C                 <- $FF TAKES THE OTHER ARM
//     26042E  7000             moveq #$0,D0                  side 0
//     260430  323c 0004        move.w #$4,D1                 REQUEST 4
//     260434  4eba fb02        jsr ($25FF38,PC)
//     260438  4a79 00813098    tst.w $813098                 loop 1 only
//     26043E  6600 0020        bne.w $260460
//     260442  4eb9 00287084    jsr $287084                   hud.js scoreDrainInit287084
//     260448  6000 0016        bra.w $260460
//     26044C  303c 000b        move.w #$B,D0                 <- the $FF arm
//     260450  4eb9 00241182    jsr $241182
//     260456  2540 001c        move.l D0,($1C,A2)
//     26045A  117c 0000 0007   move.b #$0,($7,A0)            A0 IS INHERITED (trap 11)
//     260460  ...the whole block again for side 1: $813086, D0 = 1, $2870E6, ($1C,A3)
//     26049E  4eb9 00287A5E    jsr $287A5E                   hud.js slideArm287A5E
//     2604A4  4cdf 7fff        movem.l (SP)+,D0-D7/A0-A6
//     2604A8  4e75             rts
//
// ===========================================================================
// THE BRIEF THAT SET THIS WAVE GOT THIS ROUTINE'S SHAPE WRONG, TWICE
// ===========================================================================
//
// It said: "For each side whose `$813084`/`$813086` is not `$FF` it runs
// `$260434 jsr $25FF38` with D1 = 4 ... **and** creates a type-`$B` object", and
// "Creates **two** type-`$B` objects".
//
// **THE TWO ARMS ARE EXCLUSIVE AND THE `$FF` POLARITY IS THE OPPOSITE WAY ROUND.**
// `$26042C beq.s $26044C` jumps to the type-`$B` create when the gate word IS
// `$FF`; a side that is NOT `$FF` arms request 4 and never reaches `$26044C`. So a
// side gets EITHER a bonus-line request OR a type-`$B` object, never both.
//
// `[M]` on a real cold boot with P1 only: `$813084` = `$0000` (P1's style word)
// and `$813086` = `$00FF` (P2 never joined -- `$25CCCC` fills all six of
// `($4,A5)..($9,A5)` with `$FF`, which is the same "this side did not join" guard
// `$25F460 bmi` uses). So **exactly ONE** type-`$B` object is created, and it is
// created for the ABSENT side. Both halves of that were checked against the frame,
// not inferred: see `tests/w385player.test.js`.
//
// **AND THE `($10,A2)` STORE IS A LONGWORD OVER TWO WORD FIELDS** (trap 3):
// `move.l D0,($10,A2)` fills `($10)` AND `($12)`, which `tally.js bonusLine42601F4`
// then copies to the new player object's `($8,A0)`/`($A,A0)`. That is why
// `rip/web/seed.bin` has `$8130FA+$10` = `$1179` rather than the `$25FE22` table's
// `$1000`: `$25D71C`'s anchor `$117914C0` has overwritten the pair with the ship's
// live position on the select screen. `$260558`'s call passes the LITERALS
// `$10000E00` / `$10002A00` instead, which are the table's own values.
const PAIR_2603FE = Object.freeze({
  addr: 0x2603fe, end: 0x2604a9, bytes: 172,
  absent: 0x00ff,                  // $260428 / $260466 cmpi.w #$FF,D0
  request: 4,                      // $260430 / $26046E move.w #$4,D1
  type: 0x0b,                      // $26044C / $26048A move.w #$B,D0
  posOff: 0x10,                    // $260414 / $26041E move.l Dn,($10,An)
  handleOff: 0x1c,                 // $260456 / $260494 move.l D0,($1C,An)
  sideOff: 0x07,                   // $26045A / $260498 move.b #$n,($7,A0)
  sides: Object.freeze([
    Object.freeze({ side: 0, gate: 0x813084, handleSite: 0x260456 }),   // A2
    Object.freeze({ side: 1, gate: 0x813086, handleSite: 0x260494 }),   // A3
  ]),
});

/**
 * `$2603FE` -- see `PAIR_2603FE`.
 *
 * `$2603FE`'s `movem.l D0-D7/A0-A6` and `$2604A4`'s restore make it
 * REGISTER-TRANSPARENT (trap 9): it returns nothing and its callers read nothing
 * back out of it. Everything it does, it does through RAM.
 *
 * @param d0 side 0's position LONGWORD, or a negative value to leave `($10,A2)`
 *   alone. `$25D73E` passes record 0's `($56)` anchor; `$260558` passes the
 *   literal `$10000E00`.
 * @param d1 the same for side 1. `$25D73E` passes `$FFFFFFFF` when the other
 *   record never joined, and `$26041A bmi.w` is what makes that a skip.
 */
export function stagePair2603FE(ram, rom, ctx, d0, d1) {
  const recs = [RANK.disp25FF7ATable,                          // $260402 lea $8130FA,A2
    RANK.disp25FF7ATable + RANK.disp25FF7AStride];             // $260408 lea $81311E,A3
  // $26040E/$260418 tst.l + bmi.w -- SIGNED, and the skip is the NEGATIVE arm.
  if ((d0 | 0) >= 0) ram.setU32(recs[0] + PAIR_2603FE.posOff, d0 >>> 0);   // $260414
  if ((d1 | 0) >= 0) ram.setU32(recs[1] + PAIR_2603FE.posOff, d1 >>> 0);   // $26041E

  const pri = (t) => rom.u16(RANK.dispatch + t * 8 + 4);       // $24119C ($4,A0,D1)
  for (const s of PAIR_2603FE.sides) {
    if (ram.u16(s.gate) !== PAIR_2603FE.absent) {              // $260428 cmpi.w / $26042C beq.s
      // THE SIDE IS PLAYING: arm bonus-line request 4 and, on loop 1, init its score row.
      armRequest25FF38(ram, s.side, PAIR_2603FE.request);      // $26042E/$260430/$260434
      if (ram.u16(RANK.loopWord) === 0) {                      // $260438 tst.w $813098 / bne.w
        scoreDrainInit287084(ram, s.side);                     // $260442 jsr $287084
      }
      continue;                                                // $260448 bra.w -- past the create
    }
    // THE SIDE IS ABSENT ($FF): a type-$B object instead, carrying the side byte.
    const rec = stageCreate(ram, PAIR_2603FE.type, pri);       // $26044C/$260450 jsr $241182
    if (rec.ok) {
      ram.setU32(recs[s.side] + PAIR_2603FE.handleOff,         // $260456 move.l D0,($1C,An)
        ram.u32(rec.addr + ALLOC.idOff));                      // $2411C4 move.l $80E882,D0
    } else {
      note(ctx, s.handleSite, `${hexA(s.handleSite)} move.l D0,($1C,${
        s.side === 0 ? 'A2' : 'A3'}) -- $241182's create queue was FULL, so $241190 `
        + 'bge took $2411D4 before $2411A8\'s ori and D0 still holds the bare '
        + 'move.w #$B with the caller\'s high half, which this port does not know. '
        + 'The low word is stored; the high half is not invented');
      ram.setU32(recs[s.side] + PAIR_2603FE.handleOff, PAIR_2603FE.type);
    }
    // $26045A/$260498 -- through the A0 `$241182` LEFT BEHIND (trap 11), not A2/A3.
    ram.setU8(rec.addr + PAIR_2603FE.sideOff, s.side);
  }
  slideArm287A5E(ram);                                         // $26049E jsr $287A5E
}

/**
 * `$2604F4..$260518` plus `$2604AA..$2604F2` -- **THE STAGE-START DELETE.** Every
 * instruction in both is a `$241238` push, so the whole thing is eight deferred
 * kills and one gate:
 *
 *     2604F4  lea $813148,A0 / jsr $241238      the type-5 child from last time
 *     260500  lea $813144,A0 / jsr $241238      the type-1 child from last time
 *     26050C  tst.w $813080 / beq.w $260518     ...and only when D6 was non-zero:
 *     260516  6192            bsr.b $2604AA     six more, off $8130FA and $81311E
 *
 * `$2604AA` walks the SAME three offsets on two bases in the order A2, A3, A2,
 * A3, A2, A3 -- `($18,A2) ($18,A3) ($1C,A2) ($1C,A3) ($20,A2) ($20,A3)` -- and
 * those two bases are `$25FF7A`'s and `$288610`'s per-side tables, at their
 * `$24`/`$16` strides' far end. A zero handle is not a special case: `$2411E6
 * tst.l/beq` in `$2411E2` makes killing ID 0 a no-op, so a first stage start,
 * whose five longwords are all still 0, queues eight nothings.
 *
 * `61 92` at `$260516` is an eight-bit `bsr`, so its target is `$260518 - $6E`
 * and NOT `$260516 - $6E`; the displacement counts from the byte after the
 * opcode word.
 */
export function stageClear2604F4(ram) {
  queueKill(ram, ram.u32(STAGESTART.id5));                  // $2604F4 / $2604FA
  queueKill(ram, ram.u32(STAGESTART.id1));                  // $260500 / $260506
  if (ram.u16(STAGESTART.wordD6) === 0) return;             // $26050C tst.w / $260512 beq
  for (const off of STAGESTART.killOffs) {                  // $2604AA..$2604F2
    queueKill(ram, ram.u32(STAGESTART.killIdA + off));
    queueKill(ram, ram.u32(STAGESTART.killIdB + off));
  }
}

/**
 * `$26051A..$26057E`, 102 bytes -- **THE STAGE-START INSTALL**, and the routine
 * `$26089E` hangs off the end of.
 *
 *     26051A  303c 0005       move.w  #$5,D0
 *     26051E  4eb9 00241182   jsr     $241182            stage dispatch type 5
 *     260524  23c0 00813148   move.l  D0,$813148         ...and keep its ID
 *     26052A  303c 0001       move.w  #$1,D0
 *     26052E  4eb9 00241182   jsr     $241182            stage dispatch type 1
 *     260534  23c0 00813144   move.l  D0,$813144
 *     26053A  3179 0081307E 0006   move.w $81307E.l,($6,A0)
 *     260542  4a79 00813080   tst.w   $813080
 *     260548  6700 001a       beq.w   $260564
 *     26054C  203c 10000E00   move.l  #$10000E00,D0
 *     260552  223c 10002A00   move.l  #$10002A00,D1
 *     260558  6100 fea4       bsr.w   $2603FE
 *     26055C  33fc 0000 00813080   move.w #$0,$813080
 *     260564  41f9 00222618   lea     $222618,A0
 *     26056A  7000            moveq   #$0,D0
 *     26056C  4eb9 002414be   jsr     $2414BE
 *     260572  4eb9 00241654   jsr     $241654
 *     260578  4eb9 0026089e   jsr     $26089E
 *     26057E  4e75            rts
 *
 * **`($6,A0)` AT `$26053A` IS THE TYPE-1 RECORD `$241182` JUST STAGED**, not the
 * caller's A0 and not A5 -- `$241182` returns the staging slot in A0 and does not
 * restore it (`$2411CE movem.l (SP)+,D1-D2` puts back D1 and D2 and nothing
 * else). So `$81307E`, which `$260586` has just filled from D7, lands on the new
 * child, which is how the `$38` `$26070C` computes for the two-player first stage
 * reaches the object that consumes it.
 *
 * **AND `$241182` RETURNS THE ID IN D0**, which is why the two `move.l D0` stores
 * are the handles and not the type: `$2411BE addq.l #1,$80E882 / $2411C4 move.l
 * $80E882,D0`. On the FULL-QUEUE path `$241190 bge $2411D4` jumps out BEFORE the
 * `ori.w #$8000,D0` at `$2411A8`, so D0 is still the bare `move.w #$5,D0` -- a
 * word write over an unknown high half. That is counted rather than invented.
 *
 * `$2603FE` (172 bytes) is the pair site `objslot17.js HANDLER7.pairLatch` already
 * counts from `$25D72E`, so the call graph cycles here; `$241654` is a per-stage
 * PALETTE WALK (`lea ($241610,PC),A2 / movea.l (0,A2,D0.w),A2` indexed by
 * `$813096`, then `$24150A` per `$FFFF`-terminated entry) whose tables no wave has
 * measured. Both are counted at their call sites.
 */
export function stageInstall26051A(ram, rom, ctx) {
  const pri = (t) => rom.u16(RANK.dispatch + t * 8 + 4);    // $24119C ($4,A0,D1)
  const idOf = (made, type, site) => {
    if (made.ok) return ram.u32(made.addr + ALLOC.idOff);   // $2411C4 move.l $80E882,D0
    note(ctx, site, `${hexA(site)} move.l D0,${hexA(site === 0x260524
      ? STAGESTART.id5 : STAGESTART.id1)} -- $241182's create queue was FULL, so `
      + `$241190 bge took $2411D4 before $2411A8's ori and D0 still holds the bare `
      + `move.w #$${type} with the caller's high half, which this port does not `
      + `know. The low word is stored; the high half is not invented`);
    return type;
  };
  const five = stageCreate(ram, STAGESTART.type5, pri);     // $26051A / $26051E
  ram.setU32(STAGESTART.id5, idOf(five, STAGESTART.type5, 0x260524));   // $260524
  const one = stageCreate(ram, STAGESTART.type1, pri);      // $26052A / $26052E
  ram.setU32(STAGESTART.id1, idOf(one, STAGESTART.type1, 0x260534));    // $260534
  // $26053A -- through A0, the record the SECOND $241182 staged. On a full queue
  // that is the $80D51C dummy and the cartridge writes through it just the same.
  ram.setU16(one.addr + STAGESTART.childField, ram.u16(STAGESTART.wordD7));
  if (ram.u16(STAGESTART.wordD6) !== 0) {                   // $260542 tst.w / $260548 beq
    // W385: A CALL NOW, NOT A NOTE. `$26054C move.l #$10000E00,D0 / $260552 move.l
    // #$10002A00,D1 / $260558 bsr.w $2603FE` -- and the two literals are exactly the
    // `($C,$E)` pairs the `$25FE22` table holds, which is the corroboration that
    // `($10,A2)` really is the spawn position field. **THIS ARM DOES NOT FIRE ON A COLD
    // BOOT**: `$813080` is cleared by `$260660` in the state-0 INIT and only a two-player
    // handoff (`$26070C`'s D4) raises it, so `$25D73E` is the site that runs -- see the
    // note W384 pinned. It is wired anyway, because a gate that never opens is not a
    // reason to leave a routine unreachable from one of its two callers.
    stagePair2603FE(ram, rom, ctx, STAGESTART.pairD0, STAGESTART.pairD1);
    ram.setU16(STAGESTART.wordD6, 0);                       // $26055C move.w #$0
  }
  // $260564 lea $222618,A0 / $26056A moveq #$0,D0 / $26056C jsr $2414BE -- 32 bytes.
  if (ctx?.palette) {
    install2414BE(ram, ctx.palette, STAGESTART.txBank,
      rom.bytes(STAGESTART.txSrc, 32), STAGESTART.txSite, 'the $26051A stage install');
  } else {
    note(ctx, STAGESTART.txSite, `${hexA(STAGESTART.txSite)} jsr $2414BE -- TEXT bank `
      + `0 <- ${hexA(STAGESTART.txSrc)} with no PaletteState on this chain`);
  }
  note(ctx, STAGESTART.palWalk, `${hexA(STAGESTART.palWalk)} -- the per-stage PALETTE `
    + 'WALK, reached from $260572. `$241654 lea ($241610,PC),A2 / move.w $813096,D0 / '
    + 'movea.l (0,A2,D0.w),A2` picks the stage`s list and then loops `move.l (A2)+,D0 / '
    + 'cmpi.l #$FFFFFFFF / movea.l D0,A1` over $FFFF-terminated (bank word, source '
    + 'longword) pairs, calling $24150A for each. Neither $241610 nor any list it '
    + 'points at has been measured, so no window exists for them. Unread');
  installRankBase26089E(ram, rom);                          // $260578 jsr $26089E
}

/**
 * `$260580..$2605A3`, 36 bytes -- **THE STAGE START.** `$26077E bsr.w $260580` is
 * the last thing the one-shot handoff `$26070C` does, and everything that gives
 * stage 1 its rank base pointer is below it.
 *
 *     260580  4279 0081296E   clr.w   $81296E
 *     260586  33c7 0081307E   move.w  D7,$81307E
 *     26058C  33c6 00813080   move.w  D6,$813080
 *     260592  6100 ff60       bsr.w   $2604F4
 *     260596  6100 f78c       bsr.w   $25FD24
 *     26059A  6100 ff7e       bsr.w   $26051A
 *     26059E  6100 f9da       bsr.w   $25FF7A
 *     2605A2  4e75            rts
 *
 * **`$2605A4..$2605C6` IS A SECOND COPY**, instruction for instruction, resolving
 * to the SAME four targets -- not byte for byte, because all four branches are
 * PC-relative and their displacements have to differ ($FF60/$F78C/$FF7E/$F9DA here,
 * $FF3C/$F768/$FF5A/$F9B6 there). [M] nothing in the 6 MiB image branches to the
 * twin or names it; only `$260580` has a caller. Checked rather than assumed,
 * because `$259FF8`/`$25A14C` two waves ago were the same instructions in a
 * different order with OPPOSITE contracts.
 *
 * All three of the head writes are consumed downstream now: `$813080` by
 * `$260542`'s gate and `$26055C`'s clear, `$81307E` by `$26053A`'s store onto the
 * new type-1 record. That is what `objslot17.js` was holding this routine back
 * for -- half of it would have set two words with nothing to read them.
 *
 * `$25FF7A` is the computed-call dispatcher this file already ports for the rank
 * object's own state 1, taken here through the same `computedDispatch`.
 *
 * @param d6 `$260778 move.w $813080,D6` -- re-read from RAM by the caller
 * @param d7 `$260774 move.w #$38,D7`, or 0
 * @param a5 the OBJECT RECORD the chain entered on. `$25FF7A` does not set A5 and
 *   bonus line 6 (`$260348 move.b #$2,($2,A5)`) writes through it, so it is
 *   threaded from `$25D630`'s A5 -- the select-screen object -- rather than
 *   guessed. See `tally.js bonusLine6260348`.
 */
export function stageStart260580(ram, rom, ctx, d6, d7, a5) {
  ram.setU16(STAGESTART.zeroWord, 0);                       // $260580 clr.w $81296E
  ram.setU16(STAGESTART.wordD7, u16(d7));                   // $260586 move.w D7
  ram.setU16(STAGESTART.wordD6, u16(d6));                   // $26058C move.w D6
  stageClear2604F4(ram);                                    // $260592 bsr.w $2604F4
  wipeStageBlock25FD24(ram);                                // $260596 bsr.w $25FD24
  stageInstall26051A(ram, rom, ctx);                        // $26059A bsr.w $26051A
  tallyDriver25FF7A(ram, rom, ctx, a5);                     // $26059E bsr.w $25FF7A
}

/** `$2605C8..$26070A` -- the state-0 INIT's ten `$2414BE` TEXT installs, at their
 *  real call sites. The same ten `palette.js TX_OBJ0A_INSTALLS` replays for a
 *  SEEDED run (W93); this is the cartridge doing them itself on a cold one. */
const INIT_TX_INSTALLS = Object.freeze([
  Object.freeze([0x2605dc, 0x0, 0x222638]), Object.freeze([0x2605ea, 0x1, 0x222658]),
  Object.freeze([0x2605f8, 0x2, 0x222678]), Object.freeze([0x260606, 0x3, 0x222698]),
  Object.freeze([0x260614, 0x4, 0x2226b8]), Object.freeze([0x260622, 0x5, 0x2226d8]),
  Object.freeze([0x260630, 0x6, 0x222778]), Object.freeze([0x26063e, 0x7, 0x222798]),
  Object.freeze([0x26064c, 0x8, 0x2227b8]), Object.freeze([0x26065a, 0xb, 0x2227d8]),
]);

/** `$260680..$2606C9` -- the loop-2+ arm, taken when `$813098` is non-zero. Two
 *  words of `$FFFF`, one of `$0`, and five zero LONGWORDS -- and the last five are
 *  the same `$813144`/`$813148` handles `$2604F4` deletes through, plus three more
 *  at `$81314C`/`$813150`/`$813154`. */
const INIT_LOOP2_WORDS = Object.freeze([
  Object.freeze([0x8130be, 0xffff]), Object.freeze([0x8130c0, 0xffff]),
  Object.freeze([0x813142, 0x0000]),
]);
const INIT_LOOP2_LONGS = Object.freeze([0x813144, 0x813148, 0x81314c, 0x813150, 0x813154]);

/** The calls `$2605C8` makes that no wave has read, in ROM order: call site ->
 *  target. Each is counted at its OWN site so the report says which one.
 *
 *  **W444 (D66): THREE OF THESE `why` STRINGS ARE STALE AND THE TARGETS ARE
 *  PORTED.** Exported this wave so `tests/w444deferrals.test.js` can READ this
 *  table back -- nothing did, which is why the rot went unseen. See that file's
 *  STALE REGISTER for `$2603DA`, `$24A810` and `$27F87C`; the deferral at THIS
 *  call site is still real (nobody has wired `$2605C8`'s teardown), but the
 *  stated reason "not implemented / unread" is false for those three. */
export const INIT_UNREAD = Object.freeze([
  Object.freeze([0x2605ce, 0x259c4a, 'a reset-prologue routine ($23BEEA\'s 20th call, '
    + 'frontend.js RESET_PROLOGUE)']),
  Object.freeze([0x260678, 0x2603da, 'the presentation/teardown body this file already '
    + 'counts from the state-2 arm at $260788']),
  Object.freeze([0x2606d2, 0x28d552, 'stageend.js has it as the module-private '
    + 'clear28D552 and does not export it']),
  Object.freeze([0x2606d8, 0x28ebfe, 'unread anywhere in this port']),
  Object.freeze([0x2606e8, 0x27f87c, 'bee.js names it as the big $6E7-word clear and '
    + 'does not implement it']),
  Object.freeze([0x2606ee, 0x2884e2, 'a reset-prologue routine (frontend.js '
    + 'RESET_PROLOGUE)']),
  Object.freeze([0x2606f4, 0x287024, 'unread anywhere in this port']),
  Object.freeze([0x2606fa, 0x24a810, 'a reset-prologue routine (frontend.js '
    + 'RESET_PROLOGUE)']),
  Object.freeze([0x260704, 0x288574, 'unread anywhere in this port']),
]);

// ===========================================================================
// W385 -- `$25FE42`, THE ROUTINE THAT GIVES BOTH SIDES A PLAYER TO BE
// ===========================================================================
//
// `$25FE42..$25FEDF`, 158 bytes / 29 instructions, ONE caller (`$260700 bsr.w`,
// inside the `$2605C8` state-0 INIT above). Until W385 it was the first of the
// three counted notes that between them meant `$8103E6` stayed zero for the whole
// of a cold-boot run -- see `tests/w384stall.test.js`.
//
//     25FE42  41fa ffde         lea (-$22,PC),A0        A0 = $25FE22, the table
//     25FE46  4df9 008130FA     lea $8130FA,A6          A6 = the side-0 record
//     25FE4C  7e01              moveq #$1,D7            TWO passes (trap 2)
//     25FE4E  3d50 000c         move.w (A0),($C,A6)
//     25FE52  3d68 0002 000e    move.w ($2,A0),($E,A6)
//     25FE58  3d68 0004 0010    move.w ($4,A0),($10,A6)
//     25FE5E  3d68 0006 0012    move.w ($6,A0),($12,A6)
//     25FE64  3d68 0008 0014    move.w ($8,A0),($14,A6)   <- THE OBJECT TYPE
//     25FE6A  3d68 000a 0016    move.w ($A,A0),($16,A6)   <- the side
//     25FE70  2d68 000c 0008    move.l ($C,A0),($8,A6)    <- THE LIVES POINTER
//     25FE76  2d7c 0 0018       move.l #$0,($18,A6)
//     25FE7E  2d7c 0 001c       move.l #$0,($1C,A6)
//     25FE86  2d7c 0 0004       move.l #$0,($4,A6)
//     25FE8E  2d7c 0 0020       move.l #$0,($20,A6)
//     25FE96  41e8 0010         lea ($10,A0),A0
//     25FE9A  4dee 0024         lea ($24,A6),A6
//     25FE9E  51cf ffae         dbra D7,$25FE4E
//     25FEA2  303c 0000         move.w #$0,D0
//     25FEA6  4eb9 00241182     jsr $241182               type 0, the HUD
//     25FEAC  23c0 0081314c     move.l D0,$81314C
//     25FEB2  303c 0004         move.w #$4,D0
//     25FEB6  4eb9 00241182     jsr $241182               type 4, announcement A
//     25FEBC  23c0 00813150     move.l D0,$813150
//     25FEC2  117c 0000 0007    move.b #$0,($7,A0)        <- A0 IS INHERITED
//     25FEC8  303c 0004         move.w #$4,D0
//     25FECC  4eb9 00241182     jsr $241182               type 4, announcement B
//     25FED2  23c0 00813154     move.l D0,$813154
//     25FED8  117c 0001 0007    move.b #$1,($7,A0)        <- ...and again
//     25FEDE  4e75              rts
//
// **THE TWO `move.b #$x,($7,A0)` ARE TRAP 11 AND THEY ARE THE POINT OF THE TAIL.**
// `$241182` is `movem.l D1-D2,-(SP)` / `movem.l (SP)+,D1-D2` -- it restores D1 and
// D2 and NOTHING ELSE, so A0 comes back holding the record it just staged
// ($2411A0 lea $80D56C,A0 / $2411A6 adda.w D2,A0). The A0 those two byte writes
// see is therefore the type-4 object created two instructions earlier, not the
// table pointer the dbra loop left at $25FE42. `($7)` is the SIDE BYTE: it is the
// same offset `announce260B30` reads (`$260A20`, which picks $813162 for side 0
// and $813166 for side 1) and the same one `player.js:525` hands
// `armRequest25FF38`. Reading A0 as the table would put the two bytes into ROM,
// and BOTH announcement objects would then run as side 0.
//
// **AND $25FE42 DOES NOT ARM A REQUEST.** It clears ($4,A6) -- a longword, so
// ($4) and ($6) -- and ($18)/($1C)/($20), but never (A6) or ($2,A6). Filling the
// two records is only half the unit; `$2603FE` is what writes the request word.
//
// The table's window is declared in `tools/export-tables.py` as W385, with its
// base, stride, count and far end each taken from an instruction in the listing
// above rather than from adjacency.
const SPAWN_25FE22 = Object.freeze({
  table: 0x25fe22,             // $25FE42 lea (-$22,PC),A0 -- EA = $25FE44 + $FFDE
  stride: 0x10,                // $25FE96 lea ($10,A0),A0
  entries: 2,                  // $25FE4C moveq #$1,D7 + $25FE9E dbra (trap 2)
  // src offset -> dest offset, in the ROM's own write order. Words except the last.
  words: Object.freeze([
    Object.freeze([0x00, 0x0c]), Object.freeze([0x02, 0x0e]),   // $25FE4E / $25FE52
    Object.freeze([0x04, 0x10]), Object.freeze([0x06, 0x12]),   // $25FE58 / $25FE5E
    Object.freeze([0x08, 0x14]), Object.freeze([0x0a, 0x16]),   // $25FE64 / $25FE6A
  ]),
  ptrSrc: 0x0c, ptrDst: 0x08,                                   // $25FE70 move.l
  zeroLongs: Object.freeze([0x18, 0x1c, 0x04, 0x20]),           // $25FE76..$25FE8E
  // the three creates, in ROM order: (type, handle longword, site of the move.l)
  creates: Object.freeze([
    Object.freeze([0x0, 0x81314c, 0x25feac]),                   // $25FEA2/$25FEA6/$25FEAC
    Object.freeze([0x4, 0x813150, 0x25febc]),                   // $25FEB2/$25FEB6/$25FEBC
    Object.freeze([0x4, 0x813154, 0x25fed2]),                   // $25FEC8/$25FECC/$25FED2
  ]),
  sideOff: 0x07,                                                // ($7,A0)
});

/**
 * `$25FE42` -- fill both `$25FF7A` dispatcher records from the inline table, then
 * create the HUD and the two announcement objects.
 *
 * @returns the three staged records, in ROM order, for a test to look at.
 */
export function playerRecords25FE42(ram, rom, ctx) {
  const K = SPAWN_25FE22;
  for (let e = 0; e < K.entries; e++) {                     // $25FE4C / $25FE9E dbra
    const a0 = K.table + e * K.stride;                      // $25FE42 / $25FE96
    const a6 = RANK.disp25FF7ATable + e * RANK.disp25FF7AStride;   // $25FE46 / $25FE9A
    for (const [src, dst] of K.words) ram.setU16(a6 + dst, rom.u16(a0 + src));
    ram.setU32(a6 + K.ptrDst, rom.u32(a0 + K.ptrSrc));      // $25FE70 move.l ($C,A0)
    for (const off of K.zeroLongs) ram.setU32(a6 + off, 0); // $25FE76..$25FE8E
  }

  const pri = (t) => rom.u16(RANK.dispatch + t * 8 + 4);    // $24119C ($4,A0,D1)
  const made = [];
  for (const [type, handle, site] of K.creates) {
    const rec = stageCreate(ram, type, pri);                // $241182
    if (rec.ok) {
      ram.setU32(handle, ram.u32(rec.addr + ALLOC.idOff));  // $2411C4 move.l $80E882,D0
    } else {
      // The same full-queue deviation `stageInstall26051A` declares, at this site.
      note(ctx, site, `${hexA(site)} move.l D0,${hexA(handle)} -- $241182's create `
        + `queue was FULL, so $241190 bge took $2411D4 before $2411A8's ori and D0 `
        + `still holds the bare move.w #$${type} with the caller's high half, which `
        + 'this port does not know. The low word is stored; the high half is not '
        + 'invented');
      ram.setU32(handle, type);
    }
    made.push(rec);
  }
  // $25FEC2 / $25FED8 -- through the A0 the PRECEDING $241182 left, not the table
  // pointer. On a full queue that is `$80D51C`, the dummy, and the cartridge writes
  // through it just the same.
  ram.setU8(made[1].addr + K.sideOff, 0);                   // $25FEC2 move.b #$0,($7,A0)
  ram.setU8(made[2].addr + K.sideOff, 1);                   // $25FED8 move.b #$1,($7,A0)
  return made;
}

/**
 * `$2605C8..$26070A` -- **THE STATE-0 INIT**, and `$260666 move.w #$1,$813082` is
 * why a board never reads a null `$81315C`.
 *
 *     2605C8  1b7c 0001 0002  move.b  #$1,($2,A5)      <- immediate BEFORE displacement
 *     2605CE  jsr $259C4A
 *     2605D4  ten x (lea src,A0 / moveq #bank,D0 / jsr $2414BE)
 *     260660  4279 00813080   clr.w   $813080
 *     260666  33fc 0001 00813082   move.w #$1,$813082   <- THE GATE $2607A8 TESTS
 *     26066E  4a79 00813098   tst.w   $813098
 *     260674  6600 000a       bne.w   $260680           <- loop 2+ arm
 *     260678  4eba fd60       jsr     ($2603DA,PC)
 *     26067C  6000 004c       bra.w   $2606CA
 *     260680  ...loop-2+ clears...      (falls through to $2606CA)
 *     2606CA  302d 0004       move.w  ($4,A5),D0
 *     2606CE  6100 f63c       bsr.w   $25FD0C           <- THE STAGE COUNTER
 *     2606D2  jsr $28D552 / jsr $28EBFE
 *     2606DE  4a79 00813098 / 6600 001a  tst.w / bne.w $260700
 *     2606E8  jsr $27F87C / $2884E2 / $287024 / $24A810
 *     260700  6100 f740       bsr.w   $25FE42
 *     260704  4eb9 00288574   jsr     $288574
 *     26070A  4e75            rts
 *
 * Both arms of the `$813098` test reach `$2606CA` -- one by `bra.w`, the other by
 * falling out of the clears -- so the tail is unconditional. `$2606DE`'s second
 * read of the same word is a separate `tst.w`, not an else, and it skips FOUR
 * calls on loop 2+.
 *
 * `$25FD0C` is `stageend.js writeStage25FD0C` and it writes `$813092`, the very
 * stage index the recompute indexes the base table with, from `($4,A5)`. So the
 * two halves of `base[stage]` are installed by two different routines: the stage
 * by this INIT, the pointer by `$26089E` at the far end of the handoff.
 */
function rankInit2605C8(ram, rom, a5, ctx) {
  ram.setU8(a5 + RANK.stateOff, 1);                         // $2605C8 move.b #$1,($2,A5)
  const unread = new Map(INIT_UNREAD.map(([site, tgt, why]) => [site, [tgt, why]]));
  const defer = (site) => {
    const [tgt, why] = unread.get(site);
    note(ctx, tgt, `${hexA(tgt)} -- reached from ${hexA(site)}, inside the $2605C8 `
      + `state-0 INIT of object type $A. ${why}. Not run`);
  };
  defer(0x2605ce);                                          // $2605CE jsr $259C4A
  for (const [site, bank, src] of INIT_TX_INSTALLS) {        // $2605D4..$260660
    if (!ctx?.palette) {
      note(ctx, site, `${hexA(site)} jsr $2414BE -- TEXT bank ${bank} <- ${hexA(src)}, `
        + 'from the $2605C8 state-0 INIT, with no PaletteState on this chain');
      continue;
    }
    install2414BE(ram, ctx.palette, bank, rom.bytes(src, 32), site,
      'the $2605C8 state-0 INIT');
  }
  ram.setU16(STAGESTART.wordD6, 0);                         // $260660 clr.w $813080
  ram.setU16(RANK.gate813082, 1);                           // $260666 -- THE GATE
  if (ram.u16(RANK.loopWord) === 0) {                       // $26066E tst.w / $260674 bne
    defer(0x260678);                                        // $260678 jsr $2603DA
  } else {
    for (const [a, v] of INIT_LOOP2_WORDS) ram.setU16(a, v);     // $260680..$260697
    for (const a of INIT_LOOP2_LONGS) ram.setU32(a, 0);          // $260698..$2606C9
  }
  writeStage25FD0C(ram, ram.u16(a5 + 0x04));                // $2606CA / $2606CE
  defer(0x2606d2);                                          // $2606D2 jsr $28D552
  defer(0x2606d8);                                          // $2606D8 jsr $28EBFE
  if (ram.u16(RANK.loopWord) === 0) {                       // $2606DE tst.w / $2606E4 bne
    defer(0x2606e8); defer(0x2606ee); defer(0x2606f4); defer(0x2606fa);
  }
  playerRecords25FE42(ram, rom, ctx);                       // $260700 bsr.w $25FE42
  defer(0x260704);                                          // $260704 jsr $288574
}

// ---------------------------------------------------------- the recompute $2608D2

/**
 * `$2608D2..$260A1E` -- THE RANK RECOMPUTE.  Reads base[stage] + (clock>>8) +
 *  (hyper ? 16*max(power) : 0), pins loop 2+, clamps loop 1, writes `$81309E`,
 *  fans the low byte to 15 bullet-system bytes.  Reads NO chain/score state
 *  (W120 sec 5, re-verified).  `[M]` validated against the seed: predicted
 *  $35 = actual $35; all 15 fan-out bytes exact.
 *
 *  Exposed (not closed over) so the test can drive it from a fixture and so a
 *  future Wave B can re-use the formula once the power term has writers.
 */
export function recompute2608D2(ram, rom) {
  // $2608D2 movea.l $81315C.l,A0 ; $2608D8 move.w $813092.l,D2 ;
  // $2608DE moveq #$0,D1 ; $2608E0 move.b (A0,D2.w),D1 -- D1 = base[stage]
  const basePtr = ram.u32(RANK.basePtr);
  const stage = ram.u16(RANK.stageIdx);
  let d1 = rom.u8(basePtr + stage) & 0xff;             // base[stage], byte
  // $2608E4 move.l $8130C6.l,D2 ; $2608EA moveq #$8,D3 ; $2608EC lsr.l D3,D2
  // $2608EE add.w D2,D1 -- D1 += (clock>>8) low word
  const clk = (ram.u32(RANK.clock) >>> 8) & 0xffff;
  d1 = (d1 + clk) & 0xffff;
  // $2608F4 move.w $81B63E.l,D0 ; $2608FA or.w $81B640.l,D0 ; $260900 beq ->
  const hyper = ram.u16(RANK.hyperP1) | ram.u16(RANK.hyperP2);
  if (hyper !== 0) {
    // $260902..$260918: D0 = max($81B646,$81B648) << 4 ; D1 += D0
    let d0 = ram.u16(RANK.powerP1);
    if (ram.u16(RANK.powerP2) > d0) d0 = ram.u16(RANK.powerP2); // bcc keeps D0 if >=
    d1 = (d1 + ((d0 << 4) & 0xffff)) & 0xffff;
  }
  // $26091A tst.w $813098.l ; $260920 beq $260944 (loop 1, computed + clamp)
  const loop = ram.u16(RANK.loopWord);
  let rank;
  if (loop !== 0) {
    // loop 2+: PIN, then bra $260984 (NO clamp). $260924 $FF (hyper) /
    // $26093A $F8 (no hyper), selected by a SECOND hyper read at $26092C.
    rank = (ram.u16(RANK.hyperP1) | ram.u16(RANK.hyperP2)) !== 0 ? 0xFF : 0xF8;
  } else {
    // loop 1: $260944 move.w D1,$81309E, then clamp.  The clamp re-reads hyper
    // ($26094A): no hyper -> cap $F0 ($260958 bls / $260964); hyper -> $FF.
    rank = d1;
    const cap = (ram.u16(RANK.hyperP1) | ram.u16(RANK.hyperP2)) !== 0 ? 0xFF : 0xF0;
    if (rank > cap) rank = cap;
  }
  ram.setU16(RANK.rankOut, rank);                       // $260944 / $260924 / $26093A
  fanOut260984(ram, rank & 0xff);                       // $260984..$260A18
}

/**
 * `$260984..$260A18` -- fan the rank low byte into 15 bullet-system bytes.
 *  A pure function of r: with s1=r>>1, s2=r>>2, s3=r>>3, d7=r>>4, the writes
 *  (transcribed in write-order from the listing) are each a small sum/difference
 *  of those four shifts.  `[M]` all 15 predicted values match the seed for
 *  r = $35.  Byte arithmetic throughout (`add.b`/`sub.b`), so mask with & 0xff.
 */
function fanOut260984(ram, r) {
  const d7 = (r >> 4) & 0xff;
  let s1 = (r >> 1) & 0xff;            // $260990 lsr.w #1,D0 (rank>>1)
  ram.setU8(0x8130AF, s1);             // $260996
  ram.setU8(0x8130AD, (s1 + d7) & 0xff); // $26099C/$26099E
  const s2 = (r >> 2) & 0xff;          // $2609A4 lsr.w #1,D0 (rank>>2)
  ram.setU8(0x8130B7, s2);             // $2609AA
  ram.setU8(0x8130B5, (s2 + d7) & 0xff); // $2609B0/$2609B2
  let d1 = (s1 + s2) & 0xff;           // $2609B8 add.b D0,D1 (D1 was s1, += s2)
  ram.setU8(0x8130A7, d1);             // $2609BC
  ram.setU8(0x8130A5, (d1 + d7) & 0xff); // $2609C2/$2609C4
  const s3 = (r >> 3) & 0xff;          // $2609CA lsr.w #1,D0 (rank>>3)
  // $2609CE add.b D0,D1 (D1 = s1+s2, += s3) ; D3 was D1 before this add (s1+s2)
  const d1BeforeS3 = d1;
  d1 = (d1 + s3) & 0xff;
  ram.setU8(0x8130A3, d1);             // $2609D2
  ram.setU8(0x8130A1, (d1 + d7) & 0xff); // $2609D8/$2609DA
  const d3 = (d1BeforeS3 - s3) & 0xff; // $2609E0 sub.b D0,D3 (D3=s1+s2, -= s3)
  ram.setU8(0x8130AB, d3);             // $2609E4
  ram.setU8(0x8130A9, (d3 + d7) & 0xff); // $2609EA/$2609EC
  // $2609F2 move.w D2,D3 (D3 = s2) ; $2609F4 add.b D0,D2 (D2 = s2+s3)
  const d2 = (s2 + s3) & 0xff;
  ram.setU8(0x8130B3, d2);             // $2609F8
  ram.setU8(0x8130B1, (d2 + d7) & 0xff); // $2609FE/$260A00
  const d3b = (s2 - s3) & 0xff;        // $260A06 sub.b D0,D3 (D3=s2, -= s3)
  ram.setU8(0x8130BB, d3b);            // $260A0A
  ram.setU8(0x8130B9, (d3b + d7) & 0xff); // $260A10/$260A12
  ram.setU8(0x8130BD, d7);             // $260A18
}

// --------------------------------------------- the computed-call dispatchers

/**
 * `$288610` -- the SECOND computed-call dispatcher, and after W385 the only one
 *  this file still drives itself: walk a 2-entry RAM table, read each entry's
 *  index word, SKIP on 0, otherwise index a ROM jump table (idx*4) and
 *  `jsr (target)`.
 *
 * **`$25FF7A` NO LONGER COMES THROUGH HERE.** W384 measured the reason and W385
 *  acted on it. This function used to serve BOTH dispatchers with a
 *  `DISP_25FF7A_TARGETS` map of exactly two entries (1 and 9), and it threw
 *  `unreached()` on the rest with the text "a per-player hyper/palette/sound
 *  servicer ... the unported hyper subsystem (Wave B)". **That text was false and
 *  the throw was live, not latent.** `$25FF52` is the BONUS-LINE table, all nine
 *  of whose lines `tally.js` has ported since W296 and exports as
 *  `tallyDriver25FF7A` -- which nothing in `src/` called. `$2603FE` arms request
 *  **4** on a cold boot and `$25FFA8` arms request **2** whenever a side runs out
 *  of lives, so both of those walked straight into the `unreached()`.
 *
 *  `$288610`'s own table (`$81B706`/`$81B71C`, jump table `$288638` -- W417 [M]: `$28861E 41FA 0018` from PC `$288620`
 *  gives `$288638`, which is what `RANK.disp288610Jump` has always held; this
 *  line used to say `$288568` and was prose-only wrong) is a
 *  different table with different targets, and **W418 read all four of them**:
 *  `$288638`'s five longs are `0 / $28864C / $28871C / $28875E / $288952` and the
 *  four non-zero ones are the CONTINUE panel's prompt, wipe, count and clear, now
 *  `src/continuescreen.js DISP_288610_TARGETS`.  The `unreached()` below is
 *  therefore latent for BOTH dispatchers and live for neither; it stays because
 *  an index outside `1..4` is a real gap and must stay loud.
 */
function computedDispatch(ram, rom, ctx, tableAddr, stride, jumpTable, jsrSite,
  targets = null) {
  for (let e = 0; e < 2; e++) {             // $288616 moveq #$1,D7 ; dbra D7
    const entry = tableAddr + e * stride;   // $28862E/$288632 lea ($16,A4),A4
    const idx = ram.u16(entry);             // $288618 move.w (A4),D0
    if (idx === 0) continue;                // $28861A beq (skip this entry)
    // $288624 add.w D0,D0 ; $288626 add.w D0,D0 (idx*4) ; $288628 adda.w D0,A0
    // ; $28862A movea.l (A0),A0 ; $28862C jsr (A0).
    const target = targets?.[idx];
    if (target) { target(ram, rom, ctx, entry); continue; }
    unreached(jsrSite, `$${jsrSite.toString(16).toUpperCase()} computed-call `
      + `dispatcher: entry $${entry.toString(16).toUpperCase()} index `
      + `$${idx.toString(16)} is nonzero, so it would jsr the jump-table `
      + `[$${idx}] target out of $${jumpTable.toString(16).toUpperCase()}, `
      + `which no wave has read. (This is NOT $25FF7A -- that one is the `
      + `bonus-line table and W385 routed it to tally.js tallyDriver25FF7A.) `
      + `Port the target or narrow the scenario`);
  }
}

// ---------------------------------------------------------- the state-1 body $2607A8

/**
 * `$2607A8..$260808` -- the state-1 per-frame body.  The `$813082` gate, the
 *  `$8130D2` freeze gate (shared with the stage-end pause), the `$8130D4`
 *  countdown, the `$8130CA` frameCounter copy, the clock advance, the recompute,
 *  the `$288610` dispatcher, and the loop-2+ HUD flag.
 *
 *  NOTE on the `$813082`-gated alternate arm `$26080A`: when the gate is SET the
 *  board takes `bne $260808` straight to `rts` and runs NONE of the body below.
 *  `$26080A..$260844` (the `move.w #$1,D1 / jmp $25FF38` family) is reached from
 *  ELSEWHERE (it is a register-convention enqueue helper, A4 = `$813162`/`$813166`
 *  via the `$260A20` lea), NOT from the rank object's own per-frame path; it is
 *  out of scope this wave and not reached on the corpus.
 */
function perFrame2607A8(ram, rom, ctx) {
  if (ram.u16(RANK.gate813082) !== 0) return;     // $2607A8 tst.w / bne $260808
  // $2607B2 tst.w $8130D2 / bne $2607CC -- freeze SET skips the D4 countdown
  // (but NOT the clock advance or the recompute).  $8130D2 is the SAME word
  // stageend.js `bgPause25FD82` sets, so a stage-end pause stops the countdown.
  if (ram.u16(RANK.freezeD2) === 0
      && ram.u16(RANK.d4) !== 0) {                // $2607BC tst.w / beq $2607CC
    ram.setU16(RANK.d4, (ram.u16(RANK.d4) - 1) & 0xffff); // $2607C6 subq.w #1
  }
  // $2607CC moveq #$0E,D0 ; $2607CE and.w $80390A.l,D0 ; $2607D4 move.w D0,$8130CA
  ram.setU16(RANK.frameCopy, ram.u16(RAM.frameCounter) & 0x000E);
  // $2607DA tst.w $8130D2 / bne $2607EA -- freeze SET skips the CLOCK +1, BUT
  // the branch lands ON $2607EA, so the recompute STILL runs every frame.
  if (ram.u16(RANK.freezeD2) === 0) {
    ram.setU32(RANK.clock, (ram.u32(RANK.clock) + 1) >>> 0); // $2607E4 addq.l #1
  }
  recompute2608D2(ram, rom);                      // $2607EA jsr $2608D2
  // $2607F0 jsr $288610 -- the computed-call dispatcher.  The state-1 body's FIRST
  // callee is `$2607A4 jsr ($25FF7A,PC)`, run from the state-machine entry below;
  // $288610 is the SECOND.  W418: it is a no-op only while both index words are 0.
  // `objslot13.js` posts 1, 2, 3 and 4 into them and this drives the CONTINUE panel,
  // which is why the rank object dying (state 4's $24107C) also stops the panel drawing.
  computedDispatch(ram, rom, ctx, RANK.disp288610Table, RANK.disp288610Stride,
    RANK.disp288610Jump, RANK.callee288610, DISP_288610_TARGETS);
  // $2607F6 tst.w $813098 / beq $260808 -- loop 1 -> rts; loop 2+ sets $81B414.
  if (ram.u16(RANK.loopWord) !== 0) {
    ram.setU16(RANK.loop2Hud, 1);                 // $260800 move.w #$1,$81B414
  }
}

// ============================================================ OBJECT TYPE 10

/**
 * `$260794` -- THE RANK OBJECT.  `makeRankObject(rom)` returns the handler
 *  `(ram, slot, index, ctx) => {...}` wired into `main.js defaultHandlers[10]`.
 *  State byte at `($2,A5)`; state 0 INIT (DEFERRED), state 1 per-frame body,
 *  state 2 teardown (self-kill).
 */
export function makeRankObject(rom) {
  return function rankObject(ram, slot, index, ctx) {
    void index;
    const a5 = slot;
    const state = ram.u8(a5 + RANK.stateOff);     // $260794 tst.b ($2,A5)
    if (state === 0) {
      // $260798 beq $2605C8 -- state 0 INIT.  W378 ports its writes; what is still
      // deferred is counted at each call site, and the summary stays keyed here.
      // The one that matters is $260666 move.w #$1,$813082: it is the gate $2607A8
      // tests, so from this frame on the per-frame body below is switched OFF until
      // $26071A ($26070C, the one-shot handoff) clears it -- which is the same
      // routine that installs $81315C. While the whole INIT was deferred that gate
      // stayed 0 and the recompute read a null base pointer on the very next frame.
      note(ctx, RANK.initState, RANK_DEVIATION[RANK.initState]);
      rankInit2605C8(ram, rom, a5, ctx);
      return;
    }
    if (state === 2) {
      // $2607A2 beq $260788 -- state 2 teardown: `$260788 jsr $2603DA` (noted,
      // unported presentation/teardown work) then `jmp $241292` (self-kill by
      // ID, the same deferred kill stageend.js `destroy28D5E6` uses).  Never
      // reached on the seeded corpus.
      note(ctx, RANK.teardown2603DA, '$2603DA -- the rank object state-2 '
        + 'teardown body (presentation/sound), counted, not run this wave');
      queueKill(ram, ram.u32(a5 + ALLOC.idOff));  // $26078C jmp $241292
      return;
    }
    // state 1: `$2607A4 jsr ($25FF7A,PC)` -- THE BONUS-LINE DRIVER, then the
    // per-frame body.  A5 here is the rank object's own record, which is what
    // the ROM has in A5 at $2607A4 and what bonus line 6 writes through.
    tallyDriver25FF7A(ram, rom, ctx, a5);         // $2607A4
    perFrame2607A8(ram, rom, ctx);                // $2607A8..$260808
  };
}

// ===========================================================================
// $260B30 -- OBJECT DISPATCH ENTRY [4], THE PER-SIDE ANNOUNCEMENT
// ===========================================================================
//
// W243. The descriptor sweep counted this 1800 times per 900 frames -- twice a
// frame, because it runs once per side -- and it was `handler not ported in wave 4`
// for the whole project's life. It is the announcement text: a four-state machine
// that blanks its own strip and then prints a message one cell at a time.
//
// Its MAILBOX is what makes it look mysterious. `$260A20` picks $813162 for P1 and
// $813166 for P2, and the `$26080A` family (see the `$25FF38` note above) posts a
// (flag, state) pair there. Each frame this object reads the flag, clears it, and
// when the STATE word differs from the one it is running it drops the per-state
// latch and switches.
//
// Every dependency was already in the port: `$240DC2` and `$240EBC` are
// `txPrint240DC2`/`txPrint240EBC` (W116), and the two `$2872xx` calls are nine words
// of RAM each.

/** `$260A20` -- the side's mailbox longword: flag at +0, state at +2. */
const OBJ4_MAILBOX = [0x813162, 0x813166];

/**
 * W270 -- THE PRODUCER SIDE OF THE ANNOUNCEMENT, and it is four one-line routines.
 *
 * `announce260B30` below is the CONSUMER: object dispatch `[4]`, registered in W269, which
 * reads a flag and a state out of `$813162`/`$813166` twice a frame. This is what writes
 * them. Every one of the four does the same three things -- select the side's mailbox, set
 * the flag, set the state -- and they differ only in which state and whether they refuse
 * to overwrite it:
 *
 *     $260A88   state 0                      unconditional
 *     $260A9A   state $4    unless already $4
 *     $260AB6   state $8                     unconditional
 *     $260AF2   state $C    unless already $C
 *
 * and the four states are EXACTLY the four entries `OBJ4_STATES` covers, which is how
 * producer and consumer are known to agree rather than assumed to.
 *
 * `$260A20` is the selector: `$813162` when D0 is zero and `$813166` otherwise, matching
 * `OBJ4_MAILBOX`. It is two `lea`s and a `tst.b`.
 *
 * THE CALLERS ARE ALL STILL UNPORTED -- `$25CD6A`, `$25D52A`, `$25DB64`, `$25DC08`,
 * `$2601DE`, `$288A02` and five more, scanned over the whole image. Object dispatch `[11]`
 * (`$25DBB4`) is the nearest and is recon'd in worklog 270; it needs `$2600D8`, which no
 * wave has read. This lands the protocol those callers share so none of them has to
 * re-derive it, and so the pairing with W269's consumer is pinned by a test now rather
 * than discovered later.
 */
const ANNOUNCE_POST = Object.freeze({
  0x260a88: Object.freeze({ state: 0x00, guard: false }),
  0x260a9a: Object.freeze({ state: 0x04, guard: true }),
  0x260ab6: Object.freeze({ state: 0x08, guard: false }),
  0x260af2: Object.freeze({ state: 0x0c, guard: true }),
});

/** `$260A20` -- the side's mailbox. D0 zero is P1. */
export function announceBox260A20(side) {
  return OBJ4_MAILBOX[side === 0 ? 0 : 1];                 // $260A20/$260A2C
}

/**
 * One of the four posters, named by its own ROM address so a caller reads as the listing
 * does. The GUARDED two refuse to re-post a state that is already set, which matters:
 * re-posting would restart the consumer's scroll from its first cell.
 * @param site one of `$260A88`, `$260A9A`, `$260AB6`, `$260AF2`
 */
export function announcePost(ram, site, side) {
  const p = ANNOUNCE_POST[site];
  if (!p) {
    unreached(site, `$${site.toString(16).toUpperCase()} is not one of the four `
      + `announcement posters. They are $260A88 (state 0), $260A9A ($4), $260AB6 ($8) `
      + `and $260AF2 ($C), and those four states are exactly $260B6A's four entries`);
  }
  const box = announceBox260A20(side);
  if (p.guard && ram.u16(box + 0x02) === p.state) return false;   // $260A9E/$260AF8
  ram.setU16(box, 1);                                     // $260AA8/$260B02
  ram.setU16(box + 0x02, p.state);                        // $260AAC/$260B06
  return true;
}

/**
 * `$260ACA` -- WHICH announcement, and it is the FIFTH loop-specific rule this port has.
 *
 *     cmpi.b #$9,$803808 / bge   -> state 0     the config byte at or past 9
 *     cmpi.b #$1,$80380B / beq   -> state 0
 *     tst.w $813098 / beq        \  LOOP 2 **and** stage 4 -> state $4
 *     cmpi.w #$4,$813092 / beq   /
 *     otherwise                  -> state $C
 *
 * So the second loop's stage-4 clear says something the first loop's does not, and it is
 * the only place in this decision that reads `$813098`.
 */
export function announceChoose260ACA(ram, side) {
  // `cmpi.b #$9,D0 / bge` is a BYTE compare and it is SIGNED, so $80 and up are
  // NEGATIVE and fall through to the loop rule. `i16` of a byte would read $F0 as
  // 240 and send every high config byte to state 0.
  if (((ram.u8(0x803808) << 24) >> 24) >= 9) {            // $260ACA cmpi.b/bge
    return announcePost(ram, 0x260a88, side);
  }
  if (ram.u8(0x80380b) === 1) {                           // $260AD4 cmpi.b/beq
    return announcePost(ram, 0x260a88, side);
  }
  if (ram.u16(0x813098) !== 0                             // $260ADE tst.w/beq
    && ram.u16(0x813092) === 4) {                         // $260AE8 cmpi.w/beq
    return announcePost(ram, 0x260a9a, side);             // $260AF0 -> state $4
  }
  return announcePost(ram, 0x260af2, side);               // $260AF2 -> state $C
}

/** `$260B6A` -- FOUR longwords, and the table's far end is its own first target
 *  `$260B7A`, so four is pinned by code and not by a run length. */
const OBJ4_STATES = [0x260b7a, 0x260b94, 0x260c68, 0x260d62];

/** `$260D22` (P1) and `$260D42` (P2) -- EIGHT longwords each, which is what the
 *  cursor's own `cmpi.w #$20,$c(a5) / blt` bounds, and `$260D62` after them is state
 *  3's code. */
const OBJ4_TEXT = [0x260d22, 0x260d42];

/** `$260A34` -- blank the side's announcement strip: `$240EBC`, the FILL variant, so
 *  every cell of a 2x14 block takes the same tile. */
function obj4Blank260A34(ram, side) {
  txPrint240EBC(ram, 0x00dc, side ? 0x0e00 : 0x0000, 0x0001, 0x000d);
}

/** `$2872D8` (P1) / `$2872FE` (P2) -- nine words of `1` at stride `$A`, then one
 *  more. Pure RAM, no dependency, and state 2 is its only caller here. */
function obj4Arm2872D8(ram, side) {
  const base = side ? 0x81b514 : 0x81b4c8;      // $2872DC / $287302
  for (let n = 0; n <= 8; n++) ram.setU16(base + n * 0x0a, 1);   // $2872E4 dbra
  ram.setU16(side ? 0x81b57e : 0x81b57c, 1);    // $2872F0 / $287316
}

/** The one-time work each state does when `$3(a5)` is still clear. States 1, 2 and 3
 *  all arm the same scroller and differ only in their constants; state 0 blanks and
 *  stops, which is what an idle announcement looks like. */
const OBJ4_ENTER = [
  null,                                                    // $260B7A: blank only
  { timer: 0x0202, pos: [0x00dc0100, 0x00dc0f00],          // $260BAC..$260BCE
    wrap: 0x40, list: 0x260c28, d2: 0x0001, d3: 0x000b },  // $260BEE / $260C08..$260C1C
  { timer: 0x0101, pos: [0x00dc0100, 0x00dc1200],          // $260C98..$260CCA
    wrap: 0x20, fromSlot: true, arm: true,                 // $260CEA / $260D04
    d2: 0x0000, d3: 0x0006 },                              // $260D14/$260D16
  { timer: 0x0202, pos: [0x00dc0200, 0x00dc0200],          // $260D7A..$260D8C
    wrap: 0x40, list: 0x260df6, d2: 0x0001, d3: 0x0009 },  // $260DBC / $260DD6..$260DEA
];

// The three tails are SEPARATE COPIES in the cartridge -- $260BD6, $260CD2 and
// $260DA4 -- and they are not identical, which a single shared implementation would
// have got wrong in two places out of three. The timer, the reload and the "advance"
// flag are the same in all three; what differs is the CURSOR WRAP and where the tile
// comes from:
//
//   state 1: cmpi.w #$40 (SIXTEEN entries), list PC-relative at $260C28, D2/D3 = 1/$B
//   state 2: cmpi.w #$20 (EIGHT),           list from ($10,A5),          D2/D3 = 0/6
//   state 3: cmpi.w #$40 (SIXTEEN),         list PC-relative at $260DF6, D2/D3 = 1/9
//
// Only state 2 uses the `$10(a5)` pointer, which is why only state 2 sets it.

/**
 * `$260B30` -- one frame of the announcement, for the side in `$7(a5)`.
 */
export function announce260B30(ram, slot, slotIndex, ctx) {
  const side = ram.u8(slot + 0x07) !== 0 ? 1 : 0;
  if (ram.u8(slot + 0x02) === 0) {                         // $260B30 tst.b/beq
    // $260B10 -- the INIT, and it clears the mailbox rather than reading it.
    ram.setU8(slot + 0x02, 1);                             // $260B10
    ram.setU8(slot + 0x03, 0);                             // $260B16
    ram.setU16(slot + 0x04, 0);                            // $260B1A
    ram.setU32(OBJ4_MAILBOX[side], 0);                     // $260B28
    return;
  }
  const box = OBJ4_MAILBOX[side];                          // $260B36/$260B3A bsr
  if (ram.u16(box) !== 0) {                                // $260B3E tst.w (A4)
    ram.setU16(box, 0);                                    // $260B44 clr.w (A4)
    const want = ram.u16(box + 0x02);                      // $260B46 move.w $2(A4)
    if (want !== ram.u16(slot + 0x04)) {                   // $260B4A cmp.w $4(A5)
      ram.setU8(slot + 0x03, 0);                           // $260B52 clr.b $3(A5)
      ram.setU16(slot + 0x04, want);                       // $260B56 move.w D0
    }
  }
  // $260B5A..$260B66 -- `lea ($260B6A,PC),A0 / adda.w $4(a5) / movea.l (A0),A0 / jmp`
  const state = ram.u16(slot + 0x04) >> 2;
  if (state >= OBJ4_STATES.length) {
    unreached(0x260b5a, `$260B5A indexed $260B6A with $4(A5) = $${
      ram.u16(slot + 0x04).toString(16)}, which is past the four longwords the `
      + `table holds -- its own first target $260B7A is what bounds it`);
  }

  if (ram.u8(slot + 0x03) === 0) {                         // every state's opener
    ram.setU8(slot + 0x03, 1);
    obj4Blank260A34(ram, side);                            // the shared bsr $260A34
    const e = OBJ4_ENTER[state];
    if (e) {
      if (e.arm) obj4Arm2872D8(ram, side);                 // $260C80 / $260C8A
      ram.setU8(slot + 0x06, 1);                           // $260C98 etc
      ram.setU16(slot + 0x0c, 0);
      ram.setU16(slot + 0x0e, e.timer);
      ram.setU32(slot + 0x08, e.pos[side]);
      // $260CB2 / $260CC2 -- ONLY state 2 writes the pointer, because only state 2's
      // tail reads it; states 1 and 3 carry their lists PC-relative.
      if (e.fromSlot) ram.setU32(slot + 0x10, OBJ4_TEXT[side]);
    }
    if (!e) return;                                        // $260B92 rts
  }

  // $260BD6 / $260CD2 / $260DA4 -- this state's own tail. See the note above the
  // config for what the three copies do and do not share.
  const e = OBJ4_ENTER[state];
  if (!e) return;
  const t = ram.u8(slot + 0x0e);
  ram.setU8(slot + 0x0e, (t - 1) & 0xff);                  // subq.b #$1,$e(a5)
  if (t === 0) {                                           // the `bcc` = no borrow
    ram.setU8(slot + 0x0e, ram.u8(slot + 0x0f));           // reload from $f(a5)
    ram.setU8(slot + 0x06, 1);
    const c = u16(ram.u16(slot + 0x0c) + 4);               // addq.w #$4,$c(a5)
    ram.setU16(slot + 0x0c, i16(c) < e.wrap ? c : 0);      // cmpi.w #wrap / blt / clr
  }
  if (ram.u8(slot + 0x06) === 0) return;                   // tst.b $6(a5) / beq
  ram.setU8(slot + 0x06, 0);
  const list = e.fromSlot ? ram.u32(slot + 0x10) : e.list;
  if (list === 0) return;                                  // no list armed yet
  const d4 = ctx.rom.u32(list + ram.u16(slot + 0x0c));
  const d0 = ram.u16(slot + 0x08);                         // movem.w $8(a5),d0-d1
  const d1 = ram.u16(slot + 0x0a);
  txPrint240DC2(ram, d0, d1, e.d2, e.d3, d4);
  void slotIndex;
}
