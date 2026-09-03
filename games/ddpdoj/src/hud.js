// TOP-LEVEL OBJECT TYPE 0 -- `$240F62[0] = $28D520`, THE PER-FRAME LEDGER.
// WAVE 63 (B1), recon 38's wave 1 of 3: **THE SKELETON, and nothing else.**
//
// ===========================================================================
// WHAT THIS OBJECT IS, AND WHY IT IS THE PREREQUISITE FOR THE BOMB AND HYPER
// ===========================================================================
//
// `19-impl` and `src/score.js` have said since wave 34 that the three ledger
// events OUTSIDE a hit -- the pending->total DRAIN, its zeroing, and THE CHAIN
// METER DECREMENT -- all live in one place, and that porting `$284636` from a
// slot this project chose would "bake in an order that later has to be
// unpicked".  This file is that slot, read out of the cartridge:
//
//     $240F62[0] = $28D520   priority $0009   (the table's own second longword)
//        $28D52E jsr $2842B0      the pending -> total DRAIN   (drain / drain0)
//        $28D534 jsr $28444E      ...inside which
//                                 $284636 subq.w #1,$81B5C0    P1's decrement
//                                 $2847D4 subq.w #1,$81B5EA    P2's decrement
//
// and the two `bsr`s the NEXT wave fills in:
//
//        $284460 bsr $285A12      THE HYPER, P1
//        $284464 bsr $285B3C      THE HYPER, P2
//
// **THE HYPER ALWAYS RUNS BEFORE THE CHAIN-METER DECREMENT, IN THE SAME FRAME.**
// That is a static property of `$28444E` and it is now a property of the port,
// because the hyper's slot is the instruction the ROM puts it at rather than a
// place a later wave picked.
//
// ===========================================================================
// THE FRAME ORDER, SETTLED -- and recon 38 7.1's "one that matters" is CLOSED
// ===========================================================================
//
// `38-recon-bomb-hyper.md` 3.3 left ONE thing unresolved and said so: "where
// the PLAYER object's slot sits relative to the RANK object's ... the object
// driver walks the 20 slots at $80E240 in address order ... so the order is the
// ALLOCATION order, a runtime fact, not the type-table index."  It tried the
// `$240F62` table, "the table's second longwords ($090000/$1A0000/..., which is
// not an order -- it does not sort)", and the allocator's create queue.
//
// **THE SECOND LONGWORD IS THE PRIORITY, AND IT DOES SORT -- DESCENDING.**
// `$24111E`'s create queue inserts in descending `(+$4A)` priority and MEMMOVES
// THE TAIL DOWN, and `$241238`'s delete memmoves UP (`src/objalloc.js`, ported
// wave 5), so the table is KEPT in descending priority order and the driver's
// address-order walk IS priority order.  Read out of the cartridge this
// session, `$240F62`'s twenty entries:
//
//     [ 0] $28D520  pri $0009   <- THIS OBJECT
//     [ 1] $26127A  pri $001A       the background
//     [ 2] $2491C0  pri $001C       P1
//     [ 3] $249246  pri $001B       P2
//     [10] $260794  pri $001F       THE RANK OBJECT -- the highest of all 20
//
// and the shipped seed's own live table is 31, 28, 26, 24, 10, 9, 9, 9 --
// perfectly descending.  Therefore, on EVERY frame and independent of what else
// is alive:
//
//     $260794 (rank, 31)  >  $2491C0 (the player, 28)  >  $28D520 (this, 9)
//
//   * the RANK RECOMPUTE `$2608D2` runs FIRST, so the bomb's `$249976 subq.w
//     #$3,$81B646` and its `$249970 jsr $285AF2` -- both in the PLAYER object
//     -- land AFTER that frame's rank and are not in `$81309E` until frame N+1.
//     **The bomb's answer is the same as the hyper's, and recon 38 3.3 could
//     not say so.**
//   * this object is LAST of the three, which is why W19 measured the chain
//     timer decrementing LAST (`rankclk > rank= > [hits] > drain > drain0 >
//     (brkT) > meter-`).  That measured order is now reproduced by construction.
//
// `tools/w63hudgate.mjs` asserts the slot ordering on every frame of a full run
// rather than trusting the paragraph above.
//
// ===========================================================================
// WHAT IS PORTED AND WHAT IS A NOTE -- and the rule that decided it
// ===========================================================================
//
// `$28444E`'s reachable closure is **772 instructions over $28444E..$2859DB**
// [M, recursive-descent trace over `out/maincpu.bin`], far more than recon 38
// 2.1's ten-line sketch.  Almost all of it is DRAWING.  Every callee was
// classified by MEASUREMENT -- a census of its absolute writes to
// `$800000..$81FFFF` and of its address-register-indirect writes -- and never
// by its name or its address range:
//
//   ZERO RAM WRITES, stack only  =>  a counted NOTE, by address:
//     $285C5E $285C62 $285DD8 $285DDC   (104/102 instr each, the two HUD panels)
//     $2855B6 (82)  $285FB6 (44)  $286040 (28)  $2857B4 (58)  $285994
//     $285FA6 (3)   $2859DC (11)  $284F72 (115) $284FA2 (115)
//     $286ED6 (23)  $286F3E  $2878CC (37) $28795C $287ABE $287AF0 $287A7A $287A92
//     $23FA96 / $23FAC4  -- the sprite-queue emitters into BUCKET 25
//                           ($80A6E4 / $80AFE6), which is NOT in
//                           `PRODUCED_BUCKETS`, so nothing this file does
//                           enters the display-list gate's substituted set
//     $240DC2 / $240EBC  -- the TX printer, unported since wave 1
//     $23DFEA $24157A $240E1A $24150A
//     $28C678 / $28CA7A  -- SOUND (W53 0 established the $28Cxxx family)
//
//   RAM WRITES  =>  PORTED, here:
//     $2842B0 + $2842FE + $2843A8 + $2843BE   the drain and the digit machine
//     $286FDA                                 the extend threshold advance
//     $285F52 $285F8A                         the two per-frame HUD cursors
//     $2877B8                                 3 writes, 5 instructions
//     $284FD2 $2851D2                         4 absolute writes each; the other
//                                             134 instructions are draws
//     everything in `$28444E` itself
//
// So the HUD's STATE is this port's and the HUD's PICTURE is not.  A player
// sees no score row, no chain meter and no bomb icons -- exactly as before this
// wave -- and every address above is counted in `unportedLog` on the frames it
// would have drawn.
//
// ===========================================================================
// THE HYPER
// ===========================================================================
//
// W163 places `$285A12/$285B3C` in this authentic type-0 frame slot. The
// shared implementation owns activation, duration, chain maintenance, end,
// pending-item flush, and both live/end flash mirrors.
//
// ===========================================================================
// ONE MORE ARM IS A THROW AND IT CANNOT FIRE
// ===========================================================================
//
// `$2853DC..$285568` -- THE STAGE-CLEAR TALLY -- is **UNREACHABLE BY
// CONSTRUCTION** rather than merely unreached.  `$284B5E btst #$3,$8130F8 /
// bne $2853D2` fires from lf19144 (W62's `$242958 bset #$3,$8130F8` inside the
// stage advance) -- but `$2853D2`'s own first instruction is
// `btst #$3,$8130F9 / beq.b $2853D0`, and `$2853D0` is a BARE `rts` sitting two
// bytes before the entry.  [M] the ONE producer of `$8130F9` bit 3 in all of
// $230000..$2B0000 is `$28DB52`, inside `$28D9AA` -- **THE RESULT SCREEN**, 819
// instructions W62 2 declared unported.  So the tally, its `$28C6C6` bonus and
// its `$28614A`/`$286154` SCORE ADDS cannot run; the port reaches the guard,
// takes the same `beq`, and returns.
//
// ===========================================================================
// READ PAST THE APPARENT END -- five places, and three of them are one `rts`
// ===========================================================================
//
//  * **`$2842AE` is a BARE `rts` TWO BYTES BEFORE `$2842B0`**, and the drain
//    branches BACKWARD to it (`$284300 beq.b $2842AE`) as its "nothing pending"
//    exit.  A reader who starts at the `lea` never sees it.
//  * **`$2842FE` IS BOTH A SUBROUTINE AND A FALL-THROUGH.**  `$2842D6 bsr.b
//    $2842FE` runs it for P1; `$2842FC moveq #$1,D7` then FALLS INTO it for P2,
//    so the second pass's `rts` returns to `$2842B0`'s caller.
//  * **`$2843A8`'s loop is ENTERED AT ITS TAIL** (`$284402 bra.b $284440`), so
//    record 0 -- the overflow digit, written above the loop -- is never touched
//    by the loop body.  Starting at `$284404` writes digit 1 over it.
//  * **`$2853D0` and `$287400` are BARE `rts`s** immediately before/inside the
//    routines that branch to them.
//  * **`$2926E2` -- the BOSS's init body -- DOES NOT END WHERE `src/initbody.js`
//    ENDS IT.**  It falls through `$29278E jsr $24150A` into `$292794 bset #$0,
//    $8130F8 / $29279C bset #$2,$8130F8 / $2927A4 bset #$0,$8130F9 / $2927AC
//    move.l #$1A0,$81B626 / $2927BA move.l A0,$81B62A` and on to `$2927F4 rts`.
//    **NOT FIXED HERE** -- see `BOSS_TAIL`.
//
// ===========================================================================
// A CARTRIDGE INSTRUCTION THAT WRITES ROM, TRANSCRIBED AND NOT EMULATED
// ===========================================================================
//
// `$287020 move.l (A7)+,(A5)` (`2A9F`) ends `$286FDA`.  A5 was pushed at
// `$286FDA` and RELOADED to `$28840E` at `$286FDE`, so this pops the stack into
// **the cartridge**, at `$28840E`.  It is one bit away from `movea.l (A7)+,A5`
// (`2A5F`).  The stack stays balanced so the `rts` is fine, but A5 is NOT
// restored -- harmless only because `$2842B0` never uses A5 and the object
// driver saves it across the dispatch (`$2410D6`/`$2410E6`).  The port does the
// pop and NOT the write; writing into `RomWindows` would throw and writing into
// `Ram` would be a fabrication.

import { u16, i16, u32 } from './ram.js';
import { unreached } from './unported.js';
import { queueKill } from './objalloc.js';
import { OBJ } from './objdriver.js';
import { enqueueRegisters } from './spritequeue.js';
import { stepHyper285A12 } from './hyper.js';
import { install24157A } from './palette.js';
import { bcd242AC6 } from './items.js';
import { bcdAdd, scorePending } from './score.js';

/** Every ROM address this file touches, as the operand of a named instruction. */
export const HUD = {
  obj: 0x28d520,            // $240F62[0], priority $0009
  objInit: 0x28d502, objDestroy: 0x28d512,
  kill: 0x241292,           // $28D518 jmp
  drain: 0x2842b0, drainOne: 0x2842fe, drainNull: 0x2842ae,
  digitsP1: 0x2843a8, digitsP2: 0x2843be,
  // W114/W115: the score-digit FLUSH, build A.  It is the 4th routine behind
  // the ISR6 `$803940` gate (`src/machine.js` `isr6Gated[3]`), reached by a
  // direct `jsr $185dc4.l` at `$13C800`.  It drains the 18 dirty records at
  // `HUDRAM.digitsP1`/`digitsP2` plus the two standalone records straight into
  // `$904000`.  Ported in `flushScoreDigits185DC4` below.
  scoreFlush: 0x185dc4,
  scoreMarkP1: 0x185e16, scoreMarkP2: 0x185e3c,  // "mark all 9 dirty" arms
  extendStep: 0x286fda,
  extendTable: 0x28840e,    // $286FDE lea -- FOUR longwords, then $FFFFFFFF
  // W273: the FIRST-threshold table `$286FCC lea $2883FE,A2`, indexed by the
  // same DIP byte and abutting `extendTable` from below ($2883FE + $10). Four
  // longwords, and `check_hud_extents` already asserts that adjacency on every
  // export, so this needs no window of its own.
  firstThresholdTable: 0x2883fe,
  romPoke: 0x287020,
  perFrame: 0x28444e,       // $28D534 jsr
  cursorA: 0x285f8a, cursorB: 0x285f52,          // $28444E / $284452 bsr
  hyperP1: 0x285a12, hyperP2: 0x285b3c,          // $284460 / $284464 bsr
  hyperTailP1: 0x285a96, hyperTailP2: 0x285bc0,  // the `already hypering` arms
  hyperActP1: 0x285a24, hyperActP2: 0x285b4e,    // the ACTIVATION arms
  flashP1: 0x2873ac, flashP2: 0x28748a,          // $285A0A / $285B34 jmp
  flashBodyP1: 0x2873b4, flashBodyP2: 0x287492,
  decrementP1: 0x284636, decrementP2: 0x2847d4,  // THE CHAIN METER DECREMENTS
  slideIn: 0x284cf2,        // the $81B6EE arm
  bannerBoss: 0x2847fe, bannerClear: 0x284b6c,
  extendCounter: 0x284ab6,
  tally: 0x2853d2, tallyBody: 0x2853dc, tallyNull: 0x2853d0,
  panelBoss: 0x284fd2, panelClear: 0x2851d2,
  grantItem: 0x2877b8,      // $284B28 bsr
  bossBar: 0x284a3e,
  cursorTableB: 0x287e8e,   // 15 longwords, $287E8E..$287EC9
  cursorTableA: 0x287eca,   // 64 longwords, $287ECA..$287FC9
  // W113: the HUD SPRITE-FRAME tables (bucket 25), read by the draw bodies.
  chainBarTable: 0x28809e,  // $2859E6 lea -- 2 stage pointers + per-stage meter data
  chainBarTileBase: 0x1cc4a0, // $2859F8 addi.l -- the chain-bar tile base offset
  panelTileTable: 0x2881f2, // $285C86 lea -- 8 longwords, indexed by hyperlevel*4
  rankIconP1: 0x2882a6,     // $285D64/$285DC4 lea -- 8 longwords
  rankIconP2: 0x288326,     // $285EDA/$285F3E lea -- 8 longwords
  iconTileP1: 0x1ca008,     // $285D26 move.l -- the P1 hyper-stock icon tile
  iconTileP2: 0x1ce9b4,     // $285EA0 move.l -- the P2 hyper-stock icon tile
  bannerPanelP1: 0x1cf060,  // $284F86 move.l -- the banner panel tile P1
  bannerPanelP2: 0x1cee58,  // $284FB6 move.l -- the banner panel tile P2
  // W116: the general TEXT defer path ($240DC2 printer + $141258 flush). The
  // flush is build A (the 3rd ISR6-gated routine, machine.js isr6Gated[2]),
  // shared on a VERSION-B run per HANDOVER sec 7. The printer is build B.
  txPrint: 0x240dc2,        // the base grid variant: tile = (D4|$C0000000)+$10000*i
  txPrintStride: 0x240e1a,  // == $240E1E + its prologue; grid + caller inter-col stride
  txPrintSingle: 0x240e84,  // the one-cell variant: dest=$904000+D0+D1, tile=D4|$C0000000
  txPrintBlank: 0x240ebc,   // the fill-with-$C0000000 variant (clears a grid)
  txFlush: 0x141258,        // (A) drains $80B058 -> $904xxx, then re-arms the buffer
  // W116: the text TABLES the bodies read (tiles are 4-byte longwords).
  livesIconP1: 0x2881e2,    // $28792A/$284EAE lea -- P1 lives icon, idx sel*2
  livesIconP2: 0x2881ea,    // $2879B4/$284F26 lea -- P2 lives icon
  hyperStockTab: 0x2883e6,  // $286F1E lea -- hyper-stock icon, idx stock*4
  credDigitTab: 0x287f86,   // $285FC0 lea -- 1-digit credit char, idx digit*4
  credSuffixTab: 0x287f7a,  // $285FDA lea -- the credit suffix, idx D5
  cred2dTens: 0x287fae,    // $286000 lea -- 2-digit tens char, idx digit*4
  cred2dOnes: 0x287fd6,     // $286022 lea -- 2-digit ones char, idx digit*4
  chainHwTab: 0x287ffe,     // $28606E lea -- chain high-water digit, idx digit*4
  // W116: tile IMMEDIATES the bodies move into D4 (no table read).
  panelLabelTile: 0x54f000a,  // $284EE6/$284F5E move.l -- the score-row label
  bombTileP1: 0x404000a,      // $287ACE move.l -- P1 bomb-stock graphic
  bombTileP2: 0x3ee000a,      // $287B00 move.l -- P2 bomb-stock graphic
  hyperStockActiveTile: 0x414000a, // $286F30/$286F98 -- hyper-active stock icon
  chainHwLabelTile: 0x53d000a,     // $286044 move.l -- the chain high-water label
  // W118: the chain-BREAK popup $2855B6 + item row $2857B4 data tables.
  popupLateWords: 0x28567c,  // $285666 move.w (pc,D2.w) -- 10 per-digit offsets
  popupJump: 0x2856d4,       // $285652 lea (pc) -- 4 per-zoom digit-table bases
  popupSuffix: 0x285784,     // $2856AA lea (pc) -- 12 suffix zoom tile longs
  popupPalActive: 0x2250d8,  // $2855DC lea -- D2 != 0 palette source (32 bytes)
  popupPalDefault: 0x225118, // $2855F0 lea -- D2 == 0 primary palette source
  popupPalSecondary: 0x225158, // $285608 lea -- D0 >= $100 palette source
  popupD5Active: 0x1c9778,   // $2855C2 move.l -- D5 tile base when $80390C != 0
  popupD5Default: 0x1c9980,  // $2855D0 move.l -- D5 tile base when $80390C == 0
  popupSuffixTile: 0x1cc34c, // $2856B4/$2856C2 move.l -- default suffix tile
  itemJump: 0x28587c,        // $285808 lea (pc) -- 4 per-zoom digit-table bases
  itemLate: 0x28592c,        // $285830 lea (pc) -- 10 per-digit late-path longs
  itemBase1p2p: 0x285954,    // $285824 lea (pc) -- 4-word 1P/2P base, idx $80390A&6
  itemSuffix: 0x28595c,      // $285868 lea (pc) -- 14 suffix zoom tile longs
  itemSuffixTile: 0x1ce8e8,  // $285854 move.l -- default suffix tile
};

/** RAM, by the instruction that names it.
 *
 *  **`$81B61E` AND `$81B61F` ARE NOT "P1's" AND "P2's".**  `$2847FE btst
 *  #$3,$8130F8` picks between them, and `$8130F8` bit 3 is `$242958`'s -- THE
 *  STAGE ADVANCE.  So `$81B61E` is the BOSS-WARNING banner's eight state bits
 *  and `$81B61F` is the STAGE-CLEAR banner's, and BOTH player blocks read
 *  `$81B61F` at `$2844D6`/`$284674`.  Naming them p1/p2 would have made
 *  `$2844D6` look like a transcription error. */
export const HUDRAM = {
  // ---- global
  slideFlag: 0x81b6ee,      // $284456 tst.w  -- the HUD is still flying in
  objFlag: 0x81b6f0,        // $28D508 move.w #$1 / $28D512 clr.w; read $287286
  itemPending: 0x81b5b4,    // $284468 -- what $2440AE's arm banks
  itemCount: 0x81b610,      // $284470 addq.w #$1 -- drained at most 4 per frame
  itemTimer: 0x81b60c,      // $284AEC
  itemDir: 0x81b60e,        // $284AD2 addq / $284ACA subq
  itemKind: 0x81b612,       // $284AFE / $284B3E
  // W124: the STAGE-CLEAR TALLY fields (`$2853D2`/`$285400`).  `$81B614` is the
  // per-tier hold countdown, `$81B616` the bonus accumulator (BCD longword;
  // `bcdAdd` accEnd `$81B61A` addresses `$81B616..$81B619`), `$81B61A` the
  // read-only medal accumulator the stage populated.
  tallyHold: 0x81b614, tallyBonus: 0x81b616, tallyMedalAcc: 0x81b61a,
  flags8: 0x8130f8, flags9: 0x8130f9, dfFlags: 0x81df1e,
  aliveP1: 0x8130be, aliveP2: 0x8130c0,   // the two players' LIVES words
  frameCounter: 0x80390a,   // $285F8C and.w
  altPhase: 0x80390b,       // $284546 btst #$6
  attract: 0x81308c,        // $284B0E tst.w
  attract2: 0x81308e,       // $284AE2 tst.w
  bannerTimer: 0x81b620,    // shared by BOTH banner arms and the slide-in
  bannerSubA: 0x81b622,     // $284846 / $284FF2 / $2853C0
  bannerSubB: 0x81b624,     // $28483E / $2851C2 / $2851F8
  bannerFlagsBoss: 0x81b61e,  // $28480A -- eight state bits
  bannerFlagsClear: 0x81b61f, // $284B6C, AND $2844D6/$284674 in both blocks
  cursorValA: 0x81b5a4,     // $285F9C
  cursorValB: 0x81b59c,     // $285F70
  cursorTickB: 0x81b598,    // $285F52 subq.b
  cursorReloadB: 0x81b599,  // $285F5A
  cursorIdxB: 0x81b59a,     // $285F64
  // the drain's own words
  totalP1: 0x81b440, totalP2: 0x81b444, hiScore: 0x81b448,
  ovfP1: 0x81b44c, ovfP2: 0x81b44e, ovfHi: 0x81b450,
  pendingP1: 0x81b4c0, pendingP2: 0x81b4c4,
  extendNextP1: 0x81b4ac, extendNextP2: 0x81b4b0,
  extendIdxP1: 0x81b4b4, extendIdxP2: 0x81b4b6,
  // W273: the SECOND total/overflow pair, `$287148`/`$287198`'s other two
  // clears. The names are INFERRED from the pairing -- `$81B4A0` is a long and
  // `$81B4A8` a word, exactly the shape of `totalP1`/`ovfP1` four words below,
  // and the reset zeroes both pairs together. No routine that READS them is
  // ported yet, so the inference is unconfirmed and labelled as such.
  total2P1: 0x81b4a0, total2P2: 0x81b4a4,
  ovf2P1: 0x81b4a8, ovf2P2: 0x81b4aa,
  savedTotal: 0x81b590,     // $284312 move.l -$4(A0),$81B590
  savedOvf: 0x81b594,       // $284318 move.w (A6),$81B594
  digitsP1: 0x81b4c8, digitsP2: 0x81b522,   // 9 records of stride $A
  digitStateP1: 0x81b49a, digitStateP2: 0x81b49e, digitStateHi: 0x81b49c,
  // W114/W115: the two STANDALONE score records, $A bytes each, right after
  // P2's nine ($81B522 + 9*$A == $81B57C).  The flush $185DC4 walks them after
  // the 18 player records; each carries the same (dirty, dest, tile) shape.
  extraRecA: 0x81b57c,   // -> $9049D8 (row 9 col 54); hi-score / extend digit
  extraRecB: 0x81b586,   // -> $905AD8 (row 26 col 54); P2 mirror
  // the two words $284C82/$284C88/$284C8E clear, and the asymmetry is the ROM's
  popupTimerP1: 0x81b5c2, popupTimerP2: 0x81b5ec,
  // the boss HP bar, whose two words $2926E2's UNPORTED TAIL would write
  bossHpScale: 0x81b626,    // $2927AC move.l #$1A0
  bossHpPtr: 0x81b62a,      // $2927BA move.l A0
  bossHpLatch: 0x81b62e,    // $284A7A bset.b #$0
  laserRec: 0x811f72,       // $284A6C -- the BOMB-LASER's record (W45)
  loop: 0x813098, stage: 0x813092,
  // the hyper's own two guards, read here and written nowhere in this port
  hyperActiveP1: 0x81b63e, hyperActiveP2: 0x81b640,
  hyperReqP1: 0x81b658, hyperReqP2: 0x81b65a,
  flashTimerP1: 0x81b6fa, flashTimerP2: 0x81b6fc,
  // W113: the hyper GAUGE (distinct from $81B654 the hyper LEVEL), the
  // hyper-stock counts, the stock display flag, and P1/P2 rank accumulators.
  // All written by the unported hyper/tally tails; read here by the draws.
  hyperGaugeP1: 0x81b642,  // $285C6E move.w -- picks one of 8 panel tiles
  hyperGaugeP2: 0x81b644,  // $285DE8 move.w
  hyperStockP1: 0x81b6e0,  // $285D34/$285D92 -- the hyper-stock icon loop count
  hyperStockP2: 0x81b6e2,  // $285EAE/$285F0C -- P2
  hyperStockFlag: 0x81b6e4, // $285D8A/$285F04 -- shared guard (non-hyper arm only)
  rankAccumP1: 0x81b64a,   // $285D4E/$285DB2 -- picks one of 8 rank-icon tiles
  rankAccumP2: 0x81b64c,   // $285EC8/$285F2C -- P2
  // W116: the OTHER-TEXT bodies' RAM sources (each read by a $240DC2 caller).
  // Written by the unported hyper/tally tails; read here by the text bodies.
  shipSelectBodyP1: 0x813084,  // $287922 move.w -- idx into $2881E2 (lives icon)
  shipSelectBodyP2: 0x813086,  // $2879AC move.w -- idx into $2881EA
  // The slide-in's INLINE lives draw indexes the SAME table off the PLAYER
  // record's shipSel ($81043E/$8104A0 == RAM.player1/P2 + P.shipSel), not this
  // word; see shipSelectSlideP1/P2 below.
  shipSelectSlideP1: 0x81043e, // $284EA6 move.w -- player1 +$58 (P.shipSel)
  shipSelectSlideP2: 0x8104a0, // $284F1E move.w -- player2 +$58
  hyperStockIdxP1: 0x81b65c,   // $286F14 move.w -- idx into $2883E6 (stock icon)
  hyperStockIdxP2: 0x81b65e,   // $286F7C move.w -- P2
  chainHiWaterP1: 0x81b632,    // $2845BA move.w -- the chain HIGH-WATER BCD (P1)
  chainHiWaterP2: 0x81b634,    // $284758 move.w -- P2
  creditSuffixP1: 0x812910,    // $2845A6 move.w -> D5 -- the credit suffix idx (P1)
  creditSuffixP2: 0x812912,    // $284744 move.w -> D5 -- P2
  // creditCountP1/P2 are HUDRAM.p1/p2.creditRow ($812900/$81290E) -- the BCD
  // credit count D6 the credits body `$285FB6` decodes.
  // ---- per player: everything `$2844C8`/`$284666`'s two blocks differ in
  p1: {
    who: 0,
    alive: 0x8130be,
    hyper: 0x81b63e,        // $2844E0 tst.w
    hyperShown: 0x81b596,   // $2844E8 bset.b #$0 / $28453E bclr.b
    meter: 0x81b5c0,        // $284614 / **$284636 THE DECREMENT**
    subTick: 0x81b64e,      // $284624 subq.b
    subReload: 0x81b64f,    // $28462C -- and see SUBTICK_IS_A_NO_OP
    popup: 0x81b5c8,        // $2845C4 the chain-BREAK popup countdown
    popupSpeed: 0x81b5ca,   // $2845FE
    popupIdx: 0x81b5cc,     // $2845DA / $2845E0 addq.w #$1
    popupVal: 0x81b5dc,     // $2845D2
    accA: 0x81b5b8,         // $284640 move.l D0 -- zeroed with the meter
    accB: 0x81b5ce,         // $284646
    chain: 0x81b5da,
    creditRow: 0x812900,    // $28455A move.w -- the CONTINUE prompt (BCD credit count)
    creditSuffix: 0x812910, // $2845A6 move.w -> D5 -- the credit suffix idx (W116)
    chainHiWater: 0x81b632, // $2845BA move.w -> D6 -- the chain high-water BCD (W116)
    playerState: 0x8103e6,  // $284550 btst #$6
    panel: 0x285c5e,        // $2844C8 bsr
    creditDuty: 0x14,       // $28456A cmpi.w #$14
  },
  p2: {
    who: 1,
    alive: 0x8130c0,
    hyper: 0x81b640,        // $28467E
    hyperShown: 0x81b597,   // $284686 / $2846DC
    meter: 0x81b5ea,        // $2847B2 / **$2847D4 THE DECREMENT**
    subTick: 0x81b650,      // $2847C2
    subReload: 0x81b651,    // $2847CA
    popup: 0x81b5f2,        // $284762
    popupSpeed: 0x81b5f4,   // $28479C
    popupIdx: 0x81b5f6,     // $284778 / $28477E
    popupVal: 0x81b606,     // $284770
    accA: 0x81b5e2,         // $2847DE
    accB: 0x81b5f8,         // $2847E4
    chain: 0x81b604,
    creditRow: 0x81290e,    // $2846F8 -- the CONTINUE prompt (BCD credit count)
    creditSuffix: 0x812912, // $284744 move.w -> D5 -- P2 credit suffix idx (W116)
    chainHiWater: 0x81b634, // $284758 move.w -> D6 -- P2 chain high-water BCD (W116)
    playerState: 0x810448,  // $2846EE
    panel: 0x285dd8,        // $284666 bsr
    creditDuty: 0x2c,       // $284708 cmpi.w #$2C -- NOT $14; the ROM's own
  },
};

export const HUDRESET = Object.freeze({
  site: 0x2884e2,
  base: 0x81b440,
  wordsMinusOne: 0x0162,
});

/** `$2884E2` clears 355 HUD words from `$81B440`, repeats the cartridge's
 * score-state stores, then initializes the two cursor records. */
export function resetHud2884E2(ram) {
  for (let d0 = HUDRESET.wordsMinusOne, a0 = HUDRESET.base; d0 >= 0; d0--, a0 += 2) {
    ram.setU16(a0, 0);
  }
  ram.setU32(HUDRAM.totalP1, 0);
  ram.setU32(HUDRAM.totalP2, 0);
  ram.setU32(HUDRAM.total2P1, 0);
  ram.setU32(HUDRAM.total2P2, 0);
  ram.setU16(HUDRAM.ovfP1, 0);
  ram.setU16(HUDRAM.ovfP2, 0);
  ram.setU16(HUDRAM.ovf2P1, 0);
  ram.setU16(HUDRAM.ovf2P2, 0);
  ram.setU16(HUDRAM.digitStateP1, 0);
  ram.setU16(HUDRAM.digitStateP2, 0);
  ram.setU8(0x81b596, 0);
  ram.setU8(0x81b597, 0);
  ram.setU16(HUDRAM.cursorTickB, 0x0001);
  ram.setU16(HUDRAM.cursorIdxB, 0x0038);
  ram.setU16(0x81b5a0, 0x0000);
  ram.setU16(0x81b5a2, 0x0054);
}

/** `$2926E2`'s UNPORTED TAIL, and what it costs THIS file.  Stated here rather
 *  than only in the worklog, because a reader has to know why one of the two
 *  banner gates can never fire.
 *
 *  `src/initbody.js`'s `$2926E2` body stops after `$29272E jsr $259554` and
 *  five notes.  The cartridge does not: five `$24150A` resource installs, then
 *  `$292794..$2927F4`, whose first three instructions are `bset #$0,$8130F8`,
 *  `bset #$2,$8130F8` and **`bset #$0,$8130F9`**, followed by
 *  `$81B626 := $1A0` and `$81B62A := ($16,A5)`.
 *
 *  Consequently, in THIS port:
 *    * `$2844A6 btst #$0,$8130F9 / bne $2847FE` can NEVER be taken;
 *    * `$2844CC` / `$28466A`'s `btst #$0,$8130F9` -- "a boss is up, show his bar
 *      instead of the chain popup" -- always takes its other arm;
 *    * `$284AB6 btst #$2,$8130F8` -- the ITEM/EXTEND counter -- is dead;
 *    * `$81B626`/`$81B62A`, the boss HP bar's scale and record pointer, stay 0,
 *      so `$284A3E movea.l $81B62A,A0 / move.l (A0),D7` would read address 0.
 *
 *  NOT FIXED HERE: the tail also runs `$294AD6`/`$294EEA`/`$294F0A`, three
 *  unported boss routines, and this wave's brief is the skeleton.  The BOSS
 *  banner arm is therefore dead; the STAGE-CLEAR arm is not, because
 *  `$2844B2 btst #$3,$81DF1E`'s producer `$28D58E` W62 ported inside object
 *  type 6's init.  `bossBar284A12` refuses the null pointer BY ADDRESS rather
 *  than reading main RAM at 0, which would draw a bar out of the RAM image. */
export const BOSS_TAIL = 0x292794;

/** `$28462C move.b $81B64F,$81B64E` -- W19 1.3 read this as "a sub-tick
 *  throttles the chain drain while a hyper is up".  Recon 38 4.4 censused
 *  `$81B64F` over $230000..$2B0000 and found TWO absolute sites, `$28462E`
 *  (this read) and `$285A86 move.b #$0` -- **every absolute write to it writes
 *  ZERO** -- so the reload is 0, `subq.b #$1` always borrows, `bcc` is never
 *  taken, and `$284636` runs every frame anyway.  Recon 38 stated its own limit:
 *  a BASED write would defeat an absolute census, and "the cheap check is a
 *  write tap on `$81B64F` in a run that hypers".
 *
 *  The port transcribes the INSTRUCTIONS and not the conclusion, and adds the
 *  tap: `playerBlock` notes this address the first frame a non-zero reload is
 *  ever seen.  If that note appears, the hyper really does throttle the drain
 *  and recon 38 4.4 is wrong. */
export const SUBTICK_IS_A_NO_OP = 0x81b64f;

function note(ctx, addr, what) { ctx?.unportedLog?.note(addr, what); }

// ===========================================================================
// $2842B0 -- THE PENDING -> TOTAL DRAIN
// ===========================================================================

/** The 68000 `abcd` chain, four bytes, X starting clear (`sub.w D6,D6` at
 *  `$28431C`).  Returns `[sum, carryOut]`.  The DECIMAL carry is not the binary
 *  one and `(a+b) & 0xff` is right for every score below ten and wrong after. */
function bcdAdd32(a, b) {
  let x = 0;
  let out = 0;
  for (let i = 0; i < 4; i++) {          // $28431E abcd -(A1),-(A0)  x4
    const sh = i * 8;
    const da = (a >>> sh) & 0xff;
    const db = (b >>> sh) & 0xff;
    let lo = (da & 0xf) + (db & 0xf) + x;
    let hi = (da >> 4) + (db >> 4);
    if (lo > 9) { lo -= 10; hi += 1; }
    if (hi > 9) { hi -= 10; x = 1; } else x = 0;
    out = (out | (((hi << 4) | lo) << sh)) >>> 0;
  }
  return [out >>> 0, x];
}

/** `$286FDA` -- advance the extend threshold.  `$28840E` holds FOUR longwords
 *  and entry [3] is `$FFFFFFFF`; `$2883FE + $10 == $28840E` (the FIRST-threshold
 *  table `$286FCC` indexes by the same DIP), which is what pins the extent --
 *  entry [4] disassembles as `lea $803824,A0`, i.e. CODE.
 *
 *  `$286FA6`, the INIT that seeds `$81B4AC`/`$81B4B4` from DIP `$80380D`, is
 *  NOT in this closure and is not ported.  [M] the shipped seed's own state
 *  (`$81B4AC = $02000000`, `$81B4B4 = 0`) is DIP option 0, and `$28840E[0]` is
 *  `$03000000` -- so extends at BCD 2,000,000 and 5,000,000, then the cursor
 *  goes to `$C` (entry [3]) and there are no more. */
function extendStep286FDA(ram, rom, idxAddr, thrAddr, ctx) {
  const d0 = ram.u16(idxAddr);                          // $286FDC move.w (A4),D0
  const d1 = rom.u32(HUD.extendTable + d0);             // $286FE4 move.l (A5,D0.w),D1
  if (d1 === 0xffffffff) {                              // $286FE8 cmpi.l
    ram.setU32(thrAddr, 0xffffffff);                    // $286FF0 move.l #$FFFFFFFF,(A2)
  } else {
    const bit31 = (d1 >>> 31) & 1;                      // $286FF8 bclr #$1F,D1
    const val = (d1 & 0x7fffffff) >>> 0;
    if (bit31 === 0) ram.setU16(idxAddr, 0x0c);         // $286FFE move.w #$C,(A4)
    const [sum] = bcdAdd32(ram.u32(thrAddr), val);      // $287006..$28701C, 4 abcd
    ram.setU32(thrAddr, sum);                           // $28701E move.l D2,(A2)
  }
  note(ctx, HUD.romPoke, '$287020 move.l (A7)+,(A5) with A5 = $28840E -- the '
    + 'cartridge pops the stack INTO THE CARTRIDGE (one bit from movea.l (A7)+,'
    + 'A5). The pop is done here; the write is not, and A5 is not restored '
    + 'either -- harmless only because $2842B0 uses no A5 and $2410D6/$2410E6 '
    + 'save it across the dispatch');
}

/** `$2843A8` (P1) / `$2843BE` (P2) -- THE SCORE DIGIT MACHINE.  Nine records of
 *  stride `$A` at `$81B4C8`/`$81B522`: `(A0)` is a DIRTY flag and `($6,A0)` the
 *  character.  Record 0 is the OVERFLOW digit and the `dbra` walks the eight
 *  BCD digits of the longword.
 *
 *  **THE LOOP IS ENTERED AT ITS TAIL** (`$284402 bra.b $284440`), so the first
 *  thing that happens is `lea $A(A0),A0` and record 0 is never touched by the
 *  body.  A port that started at `$284404` would write digit 1 over it.
 *
 *  D7 is swapped in and out (`$2843D4` / `$284448`): its LOW word is the
 *  leading-zero "a non-zero digit has been seen" flag and its HIGH word carries
 *  the player index the drain put there.  Returns D4, which `$28437C`'s
 *  high-score compare reads back OUT of this routine -- a cross-routine
 *  register dependency, transcribed as a return value rather than re-derived. */
export function digits2843A8(ram, who) {
  const p = who === 0
    ? { base: HUDRAM.digitsP1, total: HUDRAM.totalP1, state: HUDRAM.digitStateP1,
      ovf: HUDRAM.ovfP1 }
    : { base: HUDRAM.digitsP2, total: HUDRAM.totalP2, state: HUDRAM.digitStateP2,
      ovf: HUDRAM.ovfP2 };
  let a0 = p.base;                                      // $2843A8 / $2843BE lea
  let d0 = ram.u32(p.total);                            // $2843AE / $2843C4
  const d4 = d0;                                        // $2843B4 / $2843CA move.l D0,D4
  const d6 = ram.u16(p.state);                          // $2843B6 / $2843CC -> D6
  let d5 = 8;                                           // $2843D2 moveq #$8,D5
  let d7 = 0;                                           // $2843D4 swap D7 / clr.w D7
  const d1w = ram.u16(p.ovf);                           // $2843D8 move.w (A6),D1
  if (d1w !== ram.u16(HUDRAM.savedOvf)) {               // $2843DA cmp.w $81B594,D1
    d7 = 1;                                             // $2843E2 move.w #$1,D7
    ram.setU16(a0, 1);                                  // $2843E6 move.w #$1,(A0)
    ram.setU16(a0 + 6, u16(d1w + 0xc030));              // $2843EA / $2843EE
  }
  if (d1w !== 0) d7 = 1;                                // $2843F2 tst.w / $2843F8
  let d1 = ram.u32(HUDRAM.savedTotal);                  // $2843FC move.l $81B590,D1
  a0 += 0x0a;                                           // $284402 -> $284440 lea $A(A0)
  while (d5-- > 0) {                                    // $284444 dbra D5,$284404
    d0 = ((d0 << 4) | (d0 >>> 28)) >>> 0;               // $284404 rol.l #$4,D0
    d1 = ((d1 << 4) | (d1 >>> 28)) >>> 0;               // $284406 rol.l #$4,D1
    const d2 = d0 & 0xf;                                // $284408 moveq #$F,D2 / and.l
    if (d2 === 0 && d7 === 0) {                         // $28440C bne / $28440E tst.w D7
      if (ram.u16(a0 + 6) !== 0) {                      // $284412 tst.w $6(A0) / beq
        ram.setU16(a0, 1);                              // $284418 move.w #$1,(A0)
        ram.setU16(a0 + 6, 0);                          // $28441C clr.w $6(A0)
      }
    } else {
      d7 = 1;                                           // $284422 move.w #$1,D7
      const d3 = d1 & 0xf;                              // $28442C moveq #$F,D3 / and.l
      if (ram.u16(a0 + 6) === 0 || d3 !== d2) {         // $284426 beq / $284430 cmp/beq
        ram.setU16(a0, 1);                              // $284434 move.w #$1,(A0)
        ram.setU16(a0 + 6, u16(d2 + 0xc030));           // $284438 / $28443C
      }
    }
    a0 += 0x0a;                                         // $284440 lea $A(A0),A0
  }
  return { d4, d6 };                                    // D4 and D6 survive into $28437C
}

/** `$2842FE` -- ONE PLAYER's drain.  Called as a subroutine for P1 (`$2842D6
 *  bsr.b`) and FALLEN INTO for P2 (`$2842FC moveq #$1,D7`). */
function drainOne2842FE(ram, rom, who, ctx) {
  const P = who === 0
    ? { total: HUDRAM.totalP1, pending: HUDRAM.pendingP1, thr: HUDRAM.extendNextP1,
      alive: HUDRAM.aliveP1, idx: HUDRAM.extendIdxP1, ovf: HUDRAM.ovfP1 }
    : { total: HUDRAM.totalP2, pending: HUDRAM.pendingP2, thr: HUDRAM.extendNextP2,
      alive: HUDRAM.aliveP2, idx: HUDRAM.extendIdxP2, ovf: HUDRAM.ovfP2 };
  const pending = ram.u32(P.pending);                   // $2842FE tst.l (A1)+
  if (pending === 0) return;                            // $284300 beq.b $2842AE (a bare rts)
  if (i16(ram.u16(P.alive)) < 0) {                      // $284302 tst.w (A3) / bpl
    ram.setU32(P.pending, 0);                           // $284308 move.l D6,-$4(A1)
    return;                                             // $28430C rts
  }
  ram.setU32(HUDRAM.savedTotal, ram.u32(P.total));      // $28430E move.l -$4(A0),$81B590
  ram.setU16(HUDRAM.savedOvf, ram.u16(P.ovf));          // $284316 move.w (A6),$81B594
  const [sum, carry] = bcdAdd32(ram.u32(P.total), pending);   // $28431C / $28431E x4
  ram.setU32(P.total, sum);
  if (carry) {                                          // $284326 bcc.b $28433C
    const o = u16(ram.u16(P.ovf) + 1);                  // $284328 addq.w #$1,(A6)
    ram.setU16(P.ovf, o);
    if (o === 0x0a) {                                   // $28432A cmpi.w #$A / bne
      ram.setU32(P.total, 0x99999999);                  // $284330 -- PINNED AT MAX
      ram.setU16(P.ovf, 9);                             // $284336
    }
  } else {
    const d0 = ram.u32(P.thr);                          // $28433C move.l (A2),D0
    // `$284346 cmp.l (A0),D0 / bhi` is UNSIGNED and both operands are packed
    // BCD, so a 32-bit unsigned compare of the packed words IS the decimal one.
    if (d0 !== 0xffffffff                               // $28433E cmpi.l / beq
      && d0 <= ram.u32(P.total)                         // $284346 cmp.l (A0),D0 / bhi
      && ram.u16(P.alive) !== 0x14) {                   // $28434A cmpi.w #$14,(A3) / beq
      ram.setU16(P.alive, u16(ram.u16(P.alive) + 1));   // $284350 addq.w #$1 -- **AN EXTEND**
      extendStep286FDA(ram, rom, P.idx, P.thr, ctx);    // $284352 bsr $286FDA
      ctx?.hudEvent?.('extend', who, ram.u16(P.alive));
      ctx.soundPost?.(0x28c678);  // WAVE A: BGM id=$22, EXTEND jingle ($284356)
      draw(ctx, who === 0 ? 0x2878cc : 0x28795c);       // $284360 / $284368
    }
  }
  ram.setU32(P.pending, 0);                             // $28436E / $284370 move.l D6,(A1)+
  const { d4, d6 } = digits2843A8(ram, who);            // $284376 / $28437A bsr
  // ---- $28437C: THE HIGH SCORE.  A6 is still this player's overflow word, and
  // D4/D6 come OUT of the digit routine above -- see its own comment.
  const hiOvf = ram.u16(HUDRAM.ovfHi);                  // $28437C move.w $81B450,D0
  const myOvf = ram.u16(P.ovf);                         // $284382 cmp.w (A6),D0
  if (hiOvf > myOvf) return;                            // $284384 bhi.b $2843A6 (rts)
  if (hiOvf === myOvf) {                                // $284386 beq.b $284390
    if (ram.u32(HUDRAM.hiScore) >= d4) return;          // $284396 cmp.l D4,D0 / bcc
  } else {
    ram.setU16(HUDRAM.ovfHi, myOvf);                    // $284388 move.w (A6),$81B450
  }
  ram.setU32(HUDRAM.hiScore, d4);                       // $28439A move.l D4,$81B448
  ram.setU16(HUDRAM.digitStateHi, d6);                  // $2843A0 move.w D6,$81B49C
}

/** `$2842B0` -- the whole drain, both players, in ROM order. */
export function drain2842B0(ram, rom, ctx) {
  drainOne2842FE(ram, rom, 0, ctx);                     // $2842D6 bsr.b  (D7 = 0)
  drainOne2842FE(ram, rom, 1, ctx);                     // $2842FC FALLS THROUGH (D7 = 1)
}

// ===========================================================================
// W114/W115 -- $185DC4, THE SCORE-DIGIT FLUSH (build A, IRQ6-gated)
//
// The score digits do NOT use `$240DC2`. They have their own deferred-write
// flush `$185DC4` (the 4th routine behind the ISR6 `$803940` gate), which
// drains the dirty records at `$81B4C8` (populated by `digits2843A8` above)
// directly into the text tilemap `$904000`. So the score ships INDEPENDENTLY
// of the general text defer buffer (`$80B058` / `$240DC2` / flush `$141258`)
// which is what lives / bombs / credits / chain-high-water use (Wave C').
//
// Verbatim logic in `docs/worklog/ddpdoj/114-recon-score-digit-mame.md`
// section 1.  Each record is `$A` bytes: `+$0` dirty word, `+$2` dest-address
// longword, `+$6` tile longword.  The flush walks 18 (P1's 9 + P2's 9) plus
// two standalone records, and for each DIRTY one writes the `+$6` tile longword
// to the `+$2` dest address (in `$904000`) and clears `+$0`.
// ===========================================================================

/** The FIXED `+$2` dest addresses, measured by W114 (recdump.lua, lf=2020).
 *  Set ONCE at HUD init by an un-ID'd routine and never changing, so a port
 *  can hardcode them.  P1 col 54 rows 0..8; P2 col 54 rows 17..25; the two
 *  extras at rows 9 and 26.  (Row = destIndex / 64, col = destIndex % 64,
 *  destIndex = (dest - $904000) / 4.) */
function scoreDigitDest(who, i) {
  // $9040D8 + i*$100 for P1, $9051D8 + i*$100 for P2.  One column, nine rows.
  return who === 0 ? 0x9040d8 + i * 0x100 : 0x9051d8 + i * 0x100;
}

/** Seed the 20 records' `+$2` dest addresses from the measured table.  The
 *  board's HUD init does this once at boot via an un-ID'd routine; the values
 *  are FIXED (W114 section 3 / section 6 OPEN DETAILS), so they are hardcoded
 *  here and installed at HUD-object creation.  On a seeded run the HUD object
 *  is already in state 1 (running) and the seed already carries the correct
 *  `+$2` values, so this is only the cold-boot / fresh-RAM path; on either
 *  path the flush finds populated dests before it first runs. */
export function initScoreDigitDests(ram) {
  for (let i = 0; i < 9; i++) {
    ram.setU32(HUDRAM.digitsP1 + i * 0x0a + 2, scoreDigitDest(0, i));
    ram.setU32(HUDRAM.digitsP2 + i * 0x0a + 2, scoreDigitDest(1, i));
  }
  ram.setU32(HUDRAM.extraRecA + 2, 0x9049d8);            // row 9 col 54
  ram.setU32(HUDRAM.extraRecB + 2, 0x905ad8);            // row 26 col 54
}

/** `$185DC4` -- the score-digit flush, transcribed from the listing (W114
 *  section 1).  Walks the 18 player dirty records (P1 then P2) plus the two
 *  standalone records; for each DIRTY one writes the `+$6` tile longword into
 *  `txvram` at the `+$2` dest address and clears `+$0`.
 *
 *  Gated on `HUDRAM.objFlag` (`$81B6F0`): the flush only runs while the HUD
 *  object is alive.  (W114 section 6 speculated this was a dedicated
 *  dirty-pending flag; it is the HUD-alive word, already named `objFlag` --
 *  the existing "$81B6F0 has ONE reader" comment was simply incomplete.)
 *
 *  @param txvram  the `TxVram` for `$904000` (src/background.js). */
export function flushScoreDigits185DC4(ram, txvram) {
  if (ram.u16(HUDRAM.objFlag) === 0) return;             // $185DC4 tst.w $81B6F0 / beq rts
  // 18 records: P1's 9 then P2's 9, stride $A.  ($185DD4 tst.w (a0) / beq skip
  // / clr.w (a0)+ / movea.l (a0)+,a1 / move.l (a0)+,(a1) / dbra $11).
  for (const base of [HUDRAM.digitsP1, HUDRAM.digitsP2]) {
    for (let i = 0; i < 9; i++) {
      const rec = base + i * 0x0a;
      if (ram.u16(rec) === 0) continue;                  // $185DD6 beq.b SKIP
      ram.setU16(rec, 0);                                // $185DD8 clr.w (a0)+
      const dest = ram.u32(rec + 2);                     // $185DDA movea.l (a0)+,a1
      const tile = ram.u32(rec + 6);                     // $185DDC move.l (a0)+,(a1)
      txvram.setLong(dest, tile);
    }
  }
  // Two standalone records after the 18 ($185DEC..$185E14).
  for (const rec of [HUDRAM.extraRecA, HUDRAM.extraRecB]) {
    if (ram.u16(rec) === 0) continue;                    // $185DEC/$185E00 tst.w / beq
    ram.setU16(rec, 0);                                  // $185DFA/$185E0E clr.w (a0)+
    const dest = ram.u32(rec + 2);                       // $185DFC/$185E10 movea.l (a0)+,a1
    const tile = ram.u32(rec + 6);                       // $185DFE/$185E12 move.l (a0)+,(a1)
    txvram.setLong(dest, tile);
  }
}

// ===========================================================================
// W116 -- $240DC2 + variants (the TX deferred-write printer) and $141258
// (its IRQ6-gated flush). This is the path the OTHER HUD text rides: lives,
// bombs, credits, chain high-water, hyper-stock icons, the labels. The score
// digits do NOT come this way (they have their own $185DC4 flush, above).
//
// The printer appends `(destination, tile-longword)` pairs to the defer buffer
// at $80B058 (cursor $80C8D8, terminator $FFFFFFFF) -- the SAME buffer W112
// sec 2 mapped and `deferReset` (background.js) arms each init. The flush
// $141258 (build A, the 3rd ISR6-gated routine, isr.js) drains that buffer into
// TxVram each IRQ6 and re-arms it (its tail $14123A IS deferReset).
//
// Every variant is transcribed cell-for-cell off maincpu.bin this wave; see the
// worklog's PREMISE CHECK for the verbatim listings.
// ===========================================================================

/** The defer buffer's RAM addresses (the same three `CAM` owns in
 *  `src/background.js`: deferHead=$80B058, deferCursor=$80C8D8, and the stride
 *  scratch $80D518 that `$240E1A` sets and `deferReset` clears). Named here so
 *  the printer/flush read as the ROM's `lea $80B058,A0` does. */
const TXDEFER = {
  head: 0x80b058,      // $240DC6/$141258 the buffer head (and reset target)
  cursor: 0x80c8d8,    // $240DC6 movea.l $80C8D8,A0  (also the NULL value)
  stride: 0x80d518,    // $240E34 move.l D5,$80D518  (inter-column tile stride)
  tag: 0x904000,       // $240DE0 move.l #$904000,(A0) -- the dest-base tag
};
const TX_CELLS = 64 * 32;   // the longword capacity of the $904000 tilemap

/** Append a (D2+1)-column by (D3+1)-row grid of `(dest,tile)` pairs to the
 *  defer buffer. `d4` is the STARTING tile longword (palette already applied).
 *  `d4CellInc` is added to d4 each cell (`$240DEE addi.l #$10000,D4`);
 *  `d4ColInc` is added between columns (`$240E62 add.l $80D518,D4`, E1A only).
 *  Mirrors the loop nest `$240DDC..$240E02` exactly: D6 resets to D1 each outer
 *  pass and steps `$100` (one row) each inner pass; D0 steps `-4` (one column)
 *  each outer pass; each cell's dest is `$904000 + (D6 + D0)`. */
function txDeferGrid(ram, d0, d1, d2, d3, d4, d4CellInc, d4ColInc) {
  let a0 = ram.u32(TXDEFER.cursor);                        // $240DC6 movea.l $80C8D8,A0
  const end = TXDEFER.cursor;                              // $80C8D8 -- buffer end / null sentinel
  // $240DCC cmpa.l #$80C8D8 / beq -- the ROM refuses the NULL sentinel. The
  // port also refuses any cursor BELOW the head: in production camReset arms
  // the cursor to $80B058 before any body runs, but a test that drops the HUD
  // straight into state 1 on fresh RAM has an unarmed cursor (0). An unarmed
  // buffer draws nothing -- same as the ROM's null case.
  if (a0 < TXDEFER.head || a0 >= end) return;
  // The ROM trusts the per-IRQ6 flush to drain the buffer every frame, so it
  // never bounds the write. The port bounds it: each cell needs 8 bytes plus a
  // 4-byte terminator, and once there is no room for both, the printer stops.
  // Without this, a long no-flush run (a test that never sets the $803940
  // semaphore, or many overrun frames in a row) walks the cursor past $80C8D8
  // into the rest of main RAM. A stopped printer drops the rest of THIS body's
  // cells; the flush drains what landed and re-arms.
  const outer = d2 & 0xffff, inner = d3 & 0xffff;
  let d6 = d1 & 0xffff;                                    // $240DDC move.w D1,D6
  let full = false;
  for (let o = 0; o <= outer; o++) {                       // $240DFE dbra D2
    d6 = d1 & 0xffff;                                      // $240DDC (reset each pass)
    for (let i = 0; i <= inner; i++) {                     // $240DF8 dbra D7 (D7=D3)
      if (a0 + 12 > end) { full = true; break; }           // room for cell (8) + terminator (4)
      const d5 = (d6 + d0) & 0xffff;                       // $240DE6/$240DE8 D5 = D6 + D0
      ram.setU32(a0, u32(TXDEFER.tag + d5));               // $240DE0 write $904000 + $240DEA add D5
      ram.setU32(a0 + 4, d4 >>> 0);                        // $240DEC move.l D4,(A0)+
      a0 += 8;
      d4 = u32(d4 + d4CellInc);                            // $240DEE addi.l #$10000,D4 (or 0)
      d6 = (d6 + 0x100) & 0xffff;                          // $240DF4 addi.w #$100,D6
    }
    if (full) break;
    d4 = u32(d4 + d4ColInc);                               // $240E62 add.l $80D518,D4 (or 0)
    d0 = (d0 - 4) & 0xffff;                                // $240DFC subq.w #$4,D0
  }
  ram.setU32(a0, 0xffffffff);                              // $240E02 terminator (a0+4 <= end, proven)
  ram.setU32(TXDEFER.cursor, a0);                          // $240E08 store advanced cursor
}

/** `$240DC2` -- the base grid variant. D4 |= $C0000000, then tile advances
 *  `$10000` per cell. Entry regs: D0 outer step, D1 base col, D2 outer count,
 *  D3 inner count, D4 start tile code. */
export function txPrint240DC2(ram, d0, d1, d2, d3, d4) {
  txDeferGrid(ram, d0, d1, d2, d3, u32(d4 + 0xc0000000), 0x10000, 0);
}

/** `$240E1A` (== `$240E1E` + prologue) -- grid + caller inter-column tile
 *  stride. Computes `$80D518 := ((D5 - D3 - 1) & $FFFF) << 16`
 *  (`$240E2C..$240E34`) and adds it to D4 between columns. The credits and
 *  chain-high-water bodies call THIS variant for their multi-digit walks. */
export function txPrint240E1A(ram, d0, d1, d2, d3, d4, d5) {
  const stride = (((d5 - d3 - 1) & 0xffff) << 16) >>> 0;  // $240E2C..$240E34
  ram.setU32(TXDEFER.stride, stride);                      // $240E34
  txDeferGrid(ram, d0, d1, d2, d3, u32(d4 + 0xc0000000), 0x10000, stride);
}

// `$2532B6` and `$2532D0` are direct users of the two text-grid leaves above.
// W503 moved this body from player.js so stageend.js can reuse it without the
// stageend -> player -> bomb -> boss -> stageend initialization cycle.
const PANEL_SIDES = Object.freeze([
  Object.freeze({ d1: 0x0000, top: 0x02d8000a, step: 0x0100 }),
  Object.freeze({ d1: 0x1b00, top: 0x02d8008a, step: 0xfe00 }),
]);
const PANEL_TILES = Object.freeze({
  runA: 0x02cc000a, runB: 0x02c0000a, runC: 0x02c6000a, closer: 0x02d2000a,
});

function setPanelBody(ram, who, rec) {
  const s = PANEL_SIDES[who === 0 ? 0 : 1];
  let d1 = s.d1;
  txPrint240E1A(ram, 8, d1, 2, 0, s.top, 2);
  d1 = u16(d1 + s.step);
  const step = (s.step & 0x8000) !== 0 ? s.step : u16(s.step + s.step);
  const hi = ram.u8(rec + 0x25);
  const lo = ram.u8(rec + 0x24);
  const d6 = (5 - hi) & 0xff;

  let runA = 0;
  for (let n = lo; n !== 0; n = (n - 1) & 0xffff) {
    txPrint240DC2(ram, 8, d1, 2, 1, PANEL_TILES.runA);
    d1 = u16(d1 + step);
    runA++;
  }
  const left = u16(hi - runA);
  let runB = 0;
  if ((left & 0x8000) === 0 && left !== 0) {
    for (let n = 0; n < left; n++) {
      txPrint240DC2(ram, 8, d1, 2, 1, PANEL_TILES.runB);
      d1 = u16(d1 + step);
      runB++;
    }
  }
  let runC = 0;
  if ((d6 & 0x80) === 0) {
    for (let n = 0; n <= d6; n++) {
      txPrint240DC2(ram, 8, d1, 2, 1, PANEL_TILES.runC);
      d1 = u16(d1 + step);
      runC++;
    }
  }
  txPrint240DC2(ram, 8, d1, 2, 1, PANEL_TILES.closer);
  return { runA, runB, runC };
}

/** `$2532B6` (P1) / `$2532D0` (P2), Build B's SET/bonus segmented bar. */
export function setPanelBody2532B6(ram, who, rec) {
  return setPanelBody(ram, who, rec);
}

/** `$1528C4` (P1) / `$1528DE` (P2), Build A's SET/bonus segmented bar. */
export function setPanelBody1528C4(ram, who, rec) {
  return setPanelBody(ram, who, rec);
}

/** `$240E84` -- the SINGLE-cell variant. dest = `$904000 + D0 + D1`, tile =
 *  `D4 | $C0000000`. No grid. */
export function txPrint240E84(ram, d0, d1, d4) {
  let a0 = ram.u32(TXDEFER.cursor);                        // $240E84 (prologue $240E80)
  const end = TXDEFER.cursor;
  if (a0 < TXDEFER.head || a0 + 12 > end) return;          // $240E90 beq -- NULL/unarmed/full refused
  const dest = u32(TXDEFER.tag + ((d0 + d1) & 0xffff));    // $240E98 + $240E9E/$240EA0
  ram.setU32(a0, dest);                                    // $240E98 move.l #$904000,(A0) + add D1
  ram.setU32(a0 + 4, u32(d4 + 0xc0000000));                // $240EA2 move.l D4,(A0)+
  ram.setU32(a0 + 8, 0xffffffff);                          // $240EA4 terminator
  ram.setU32(TXDEFER.cursor, a0 + 8);                      // $240EAA
}

/** `$240EBC` -- fill a grid with the ONE blank tile `$C0000000`. The caller's
 *  D4 is DISCARDED (`$240ECE move.l #$C0000000,D4`) and there is NO per-cell
 *  increment; every cell in the (D2+1)x(D3+1) grid gets the same blank tile.
 *  Used to clear the lives slots that have no icon. */
export function txPrint240EBC(ram, d0, d1, d2, d3) {
  txDeferGrid(ram, d0, d1, d2, d3, 0xc0000000, 0, 0);
}

/** `$141258` (build A, the 3rd ISR6-gated routine) -- drain the `$80B058`
 *  defer buffer into TxVram, then re-arm it. Walks `(dest, value)` longword
 *  pairs until the `$FFFFFFFF` terminator; for each, writes the value to its
 *  dest (`$14126C move.l (a0)+,(a1)`). Dest addresses are `$904xxx` (TX); the
 *  port writes `BgVram` directly so NO `$900xxx` (BG) entries ever appear --
 *  the BG arm is defensive and notes rather than silences.
 *
 *  The tail `$14123A` IS `deferReset`: clear `$80D518`, re-arm the terminator
 *  at the head, reset the cursor. So one flush drains a frame's worth and
 *  leaves the buffer empty for the next frame's bodies. Has NO inner gate (the
 *  outer `$803940` ISR6 semaphore, already enforced by `irq6`, governs it). */
export function flushTextDefer141258(ram, txvram, ctx) {
  let a0 = TXDEFER.head;                                   // $141258 lea $80B058,A0
  const end = TXDEFER.cursor;                              // $80C8D8 -- the buffer's hard end
  for (;;) {
    // The ROM trusts the $FFFFFFFF terminator to always be present (the per-
    // frame flush + deferReset guarantee it). The port also stops at the buffer
    // end: a seed captured mid-frame or a long no-flush run can leave the
    // terminator past where the flush starts, and walking past $80C8D8 would
    // run off the top of main RAM. Stopping at `end` is the buffer's own bound.
    if (a0 >= end) break;
    const dest = ram.u32(a0); a0 += 4;                     // $141262 movea.l (A0)+,A1
    if (dest === 0xffffffff) break;                        // $141264/$14126A beq
    if (a0 >= end) break;                                  // no value half-entry hanging
    const value = ram.u32(a0); a0 += 4;                    // $14126C move.l (A0)+,(A1) [the src]
    const cell = (dest - TXDEFER.tag) >>> 2;
    if (cell < TX_CELLS) {
      txvram.setLong(dest, value);                         // -> $904000 tilemap
    } else if (ctx) {
      // A defer write outside the TX tilemap window. The port never queues BG
      // writes here (background.js writes BgVram directly), so this is
      // unexpected; name it rather than swallow it.
      ctx.unportedLog.note(dest, `$141258 defer write to $${dest.toString(16)
        .toUpperCase()} is outside the $904000 TX tilemap -- dropped`);
    }
  }
  // $14123A tail (= deferReset): clear the stride, re-arm, reset the cursor.
  ram.setU32(TXDEFER.stride, 0);                           // $14123C
  ram.setU32(TXDEFER.head, 0xffffffff);                    // $141242
  ram.setU32(TXDEFER.cursor, TXDEFER.head);                // $14124C
}


// ===========================================================================
// $285F8A / $285F52 -- the two per-frame HUD animation cursors
// ===========================================================================

/** `$285F8A` -- `$81B5A4 := $287ECA[($80390A & $3F) * 4]`.  Unconditional, the
 *  first instruction of `$28444E`, every frame. */
function cursorA285F8A(ram, rom) {
  const d0 = (ram.u16(HUDRAM.frameCounter) & 0x3f) * 4;          // $285F8A..$285F94
  ram.setU32(HUDRAM.cursorValA, rom.u32(HUD.cursorTableA + d0)); // $285F9C
}

/** `$285F52` -- a countdown-driven cursor over `$287E8E`'s fifteen longwords.
 *  `$81B598` is the tick byte and `$81B599` its reload (ONE word `$0101` in the
 *  seed).  `$81B59A` steps DOWN by 4 and wraps to `$38` on borrow -- `$38` is
 *  byte offset 56 = index 14, the LAST of the fifteen, so the extent is pinned
 *  by the instruction and not by the harvest.  `$287E8E + $3C == $287ECA`, the
 *  next table, confirms it from the other side. */
function cursorB285F52(ram, rom) {
  const t = (ram.u8(HUDRAM.cursorTickB) - 1) & 0xff;     // $285F52 subq.b #$1
  ram.setU8(HUDRAM.cursorTickB, t);
  if (t !== 0xff) return;                                // $285F58 bcc.b $285F88 (rts)
  ram.setU8(HUDRAM.cursorTickB, ram.u8(HUDRAM.cursorReloadB));   // $285F5A
  const d0 = ram.u16(HUDRAM.cursorIdxB);                 // $285F64
  ram.setU32(HUDRAM.cursorValB, rom.u32(HUD.cursorTableB + d0)); // $285F70
  const n = u16(d0 - 4);                                 // $285F78 subq.w #$4
  ram.setU16(HUDRAM.cursorIdxB, d0 < 4 ? 0x38 : n);      // $285F7E bcc / $285F80
}

// ===========================================================================
// $28444E -- THE PER-FRAME LEDGER
// ===========================================================================

/** Every DRAW `$28444E` reaches, by address, with what it would have drawn.
 *  A note, never a silence. */
const DRAWS = {
  0x240dc2: 'the TX printer $240DC2 -- a text/sprite subsystem no wave has touched',
  0x240ebc: 'the TX printer variant $240EBC',
  0x23fa96: 'the sprite emitter $23FA96 -- 12 bytes into BUCKET 25 ($80A6E4/$80AFE6)',
  0x23fac4: 'the register-saving sprite emitter $23FAC4 -- BUCKET 25',
  0x23dfea: 'the high-score digit emitter $23DFEA',
  0x285c5e: 'P1\'s HUD panel $285C5E (104 instructions, ZERO RAM writes)',
  0x285dd8: 'P2\'s HUD panel $285DD8 (104 instructions, ZERO RAM writes)',
  0x285c62: 'P1\'s score row $285C62 (102 instructions, ZERO RAM writes)',
  0x285ddc: 'P2\'s score row $285DDC (102 instructions, ZERO RAM writes)',
  0x2855b6: 'the chain-BREAK popup $2855B6 (82 instructions, ZERO RAM writes)',
  0x2859dc: 'the chain-meter BAR $2859DC -- $28809E[stage] then $23FA96',
  0x285fa6: 'the hyper label flash $285FA6 -- three instructions and a jmp $23FA96',
  0x285fb6: 'the CREDIT row $285FB6 (44 instructions, ZERO RAM writes)',
  0x286040: 'the chain HIGH-WATER row $286040 (28 instructions, ZERO RAM writes)',
  0x2857b4: 'the item row $2857B4 (58 instructions, ZERO RAM writes)',
  0x284f72: 'the banner\'s P1 panel $284F72 -> $285C62 (ZERO RAM writes)',
  0x284fa2: 'the banner\'s P2 panel $284FA2 -> $285DDC (ZERO RAM writes)',
  0x286ed6: 'the HYPER STOCK icons $286ED6 (23 instructions, ZERO RAM writes)',
  0x286f3e: 'the P2 hyper stock icons $286F3E',
  0x2878cc: 'P1\'s LIVES row $2878CC (37 instructions, ZERO RAM writes)',
  0x28795c: 'P2\'s LIVES row $28795C',
  0x287abe: 'P1\'s bomb-stock row $287ABE (6 instructions)',
  0x287af0: 'P2\'s bomb-stock row $287AF0 (6 instructions)',
  0x287a7a: 'the banner\'s P1 label $287A7A -> $240EBC',
  0x287a92: 'the banner\'s P2 label $287A92 -> $240EBC',
  0x285994: 'the high-score digit walk $285994 -> $23DFEA',
  0x24150a: 'the banner\'s resource install $24150A (data)',
  0x28ca7a: 'the boss-warning cue $28CA7A (the $28Cxxx sound family)',
};

function draw(ctx, addr) {
  note(ctx, addr, DRAWS[addr] ?? `a DRAW at $${addr.toString(16).toUpperCase()}`);
}

// ===========================================================================
// W113 -- THE HUD SPRITE DRAWS (bucket 25), transcribed from the ROM.
// Each replaces a former `draw(ctx, addr)` NOTE with the real body, read out
// of `maincpu.bin`. The eight routines here are the ones W112 section 1.1
// classified as SPRITE draws (they call ONLY `$23FA96`/`$23FAC4`). The chain
// popup `$2855B6` and the item row `$2857B4` are DEFERRED (W113 section 2).
// ===========================================================================

/** DIVU.W puts the QUOTIENT in the LOW word and the REMAINDER in the HIGH
 *  word. `add.w Dn,Dn / add.w Dn,Dn` then doubles the LOW word (quotient)
 *  twice, giving `quotient*4` -- the byte offset into a longword table. */
function divuQuotient4(dividend, divisor) {
  return (Math.floor(dividend / divisor) * 4) & 0xffff;
}

/** `$2859DC` -- THE CHAIN-METER BAR.  A single sprite whose tile is
 *  `$28809E[loop][meter] + $1CC4A0`.  Entry registers from the caller:
 *  D1 (position), D4 (flip/colour), D6 (the meter word, pre-decrement). */
export function chainBar2859DC(ram, rom, ctx, d1, d4, d6) {
  if (!rom) { note(ctx, 0x2859dc, DRAWS[0x2859dc]); return; }
  const loop = ram.u16(HUDRAM.loop);                        // $2859DC move.w
  const ptr = rom.u32(HUD.chainBarTable + u16(loop * 4));   // $2859E6/$2859EC
  const meterWord = rom.u16(ptr + u16(d6 * 2));             // $2859F2/$2859F4
  const d2 = (meterWord + HUD.chainBarTileBase) >>> 0;      // $2859F8 addi.l
  enqueueRegisters(ram, 25, d1, d2, 0x0810, d4);            // $2859FE/$285A02
}

/** `$285FA6` -- THE HYPER-LABEL FLASH (sprite half).  Three instructions: the
 *  caller supplies D1 (position) and D2 (tile from the cursor table), the body
 *  sets D3=$430, D4=$9 and jumps to `$23FA96`. */
export function hyperFlash285FA6(ram, rom, ctx, d1, d2) {
  if (!rom) { note(ctx, 0x285fa6, DRAWS[0x285fa6]); return; }
  enqueueRegisters(ram, 25, d1, d2, 0x0430, 0x09);          // $285FA6..$285FAE
}

/** The panel-frame position for the score row's HYPER arm.  Five branches,
 *  all on banner flags that are never set in this port (`$8130F9` bit 0's one
 *  producer is `BOSS_TAIL`, unported).  Ported faithfully anyway. */
function panelPosition(ram, who) {
  const p1 = who === 0;
  let long = 0x5ec0, short = p1 ? 0x0400 : 0x2800;          // $285C90/$285E0A
  if (!(ram.u8(HUDRAM.flags9) & 0x01)) return ((long << 16) | short) >>> 0; // beq default
  if (ram.u8(HUDRAM.bannerFlagsClear) & 0x80) return ((long << 16) | short) >>> 0; // bmi
  const subA = ram.u16(HUDRAM.bannerSubA), subB = ram.u16(HUDRAM.bannerSubB);
  if (!(ram.u8(HUDRAM.bannerFlagsBoss) & 0x10)) {           // boss NOT done
    long = u16(0x60c0 - (subA << 6));                       // $285CB6/$285E30
    short = p1 ? u16(subB << 7) : u16(0x2c00 - (subB << 7));// $285CC6/$285E40
  } else if (!(ram.u8(HUDRAM.flags8) & 0x08)) {             // boss done, no clear
    long = 0x60c0; short = p1 ? 0x0000 : 0x2c00;            // $285CE0/$285E5A
  } else {                                                  // stage-clear active
    long = u16(0x5ec0 + (subA << 6));                       // $285CEC/$285E66
    short = p1 ? u16(0x0400 - (subB << 6)) : u16(0x2800 + (subB << 6)); // $285D00/$285E80
  }
  return ((u16(long) << 16) | u16(short)) >>> 0;
}

/** P1/P2 score-row parameters. The two rows are instruction-for-instruction
 *  mirrors, differing only in addresses, base positions and icon direction. */
function scoreRowCfg(who) {
  return who === 0 ? {
    hyper: HUDRAM.hyperActiveP1, gauge: HUDRAM.hyperGaugeP1,
    stock: HUDRAM.hyperStockP1, rank: HUDRAM.rankAccumP1,
    iconTile: HUD.iconTileP1, rankTable: HUD.rankIconP1,
    iconShort: 0x1000, iconShortSign: 1, iconStep: 0x0200,
    addr: 0x285c62,
  } : {
    hyper: HUDRAM.hyperActiveP2, gauge: HUDRAM.hyperGaugeP2,
    stock: HUDRAM.hyperStockP2, rank: HUDRAM.rankAccumP2,
    iconTile: HUD.iconTileP2, rankTable: HUD.rankIconP2,
    iconShort: 0x2600, iconShortSign: -1, iconStep: 0xfe00,  // subi.w #$200 = -$200
    addr: 0x285ddc,
  };
}

/** `$285C62` (P1) / `$285DDC` (P2) -- THE SCORE ROW.  Two arms: HYPER draws the
 *  panel frame + icons + rank; NON-HYPER draws icons (if the stock flag is set)
 *  + rank.  In normal play (no hyper, stock flag 0) only the rank icon draws.
 *
 *  D6/D7 are slide offsets from the caller (0 in normal play via `$285C5E`;
 *  the banner wrappers pass a slide value). */
export function scoreRow285C62(ram, rom, ctx, who, d6, d7) {
  const C = scoreRowCfg(who);
  if (!rom) { note(ctx, C.addr, DRAWS[C.addr]); return; }
  const p1 = who === 0;

  if (ram.u16(C.hyper) !== 0) {                              // $285C62 tst.w / beq
    // ---- HYPER ARM: panel frame + icons + rank ($285C6C..$285D72) ----
    const gauge = ram.u16(C.gauge);                          // $285C6E
    const prod = u16(gauge * 0x16);                          // $285C74 mulu / swap/clr/swap
    const d2panel = rom.u32(HUD.panelTileTable               // $285C86 lea $2881F2
      + divuQuotient4(prod, 0x4b0));                         // $285C7E/$285C82
    const d1panel = panelPosition(ram, who);                 // $285C90..$285D08
    enqueueRegisters(ram, 25, d1panel, d2panel, 0x0430, 0x09); // $285D0A jsr $23fa96
    // icons (hyper arm: no stock-flag guard, just count)
    drawIconsAndRank(ram, rom, ctx, C, p1, d6, d7, false);
  } else {
    // ---- NON-HYPER ARM: icons (guarded) + rank ($285D74..$285DD6) ----
    drawIconsAndRank(ram, rom, ctx, C, p1, d6, d7, true);
  }
}

/** The shared icon loop + rank icon, used by both arms of the score row.
 *  `guardStockFlag` selects the non-hyper arm's extra `$81B6E4` test. */
function drawIconsAndRank(ram, rom, ctx, C, p1, d6, d7, guardStockFlag) {
  // Icon base position: long = $5FC0 - D7, short = $1000+D6 (P1) or $2600-D6 (P2)
  let long = u16(0x5fc0 - d7);                               // $285D74/$285E92
  let short = u16(C.iconShort + C.iconShortSign * d6);       // $285D80/$285E9E
  let d1 = ((long << 16) | short) >>> 0;

  if (!guardStockFlag ||                                     // hyper arm: always
      (ram.u16(HUDRAM.hyperStockFlag) !== 0                  // $285D8A tst.w $81B6E4
        && ram.u16(C.stock) !== 0)) {                        // $285D92/$285D98
    let count = ram.u16(C.stock);                            // $285D34/$285D92
    if (count !== 0) {                                       // beq skip
      count = u16(count - 1);                                // $285D3A/$285D9A subq.w
      const d2icon = C.iconTile;                             // $285D26/$285EA0
      do {
        enqueueRegisters(ram, 25, d1, d2icon, 0x0608, 0x09); // $285D2C/$285FA6 jsr $23fac4
        short = u16(short + C.iconStep);                     // $285D44/$285EBE
        d1 = ((long << 16) | short) >>> 0;
      } while (count-- !== 0);                               // $285D48/$285EC2 dbra
    }
  }
  // Rank icon (uses D1 from the icon loop -- its position follows the last icon)
  const rank = ram.u16(C.rank);                              // $285D4E/$285DB2
  if (rank === 0) return;                                    // $285D54/$285DB8 beq
  const rankScaled = u16(rank << 4);                         // $285D56/$285DBA lsl.w
  const d2rank = rom.u32(C.rankTable + divuQuotient4(rankScaled, 0x4b0)); // divu/add/add
  enqueueRegisters(ram, 25, d1, d2rank, 0x0608, 0x09);      // $285D6A/$285DCE jmp $23fa96
}

/** `$285C5E` (P1) / `$285DD8` (P2) -- the panel ENTRY.  Clears D6/D7 and falls
 *  into the score row.  Called from `playerBlock` (`$2844C8`/`$284666`). */
export function panel285C5E(ram, rom, ctx, who) {
  if (!rom) {
    const addr = who === 0 ? 0x285c5e : 0x285dd8;          // the panel ENTRY note
    note(ctx, addr, DRAWS[addr]);
    return;
  }
  scoreRow285C62(ram, rom, ctx, who, 0, 0);                  // $285C5E moveq
}

/** `$284F72` -- the banner's P1 panel wrapper.  Draws a banner-panel sprite
 *  (slide-offset by D6) then falls into the P1 score row with D7=0. */
export function bannerPanel284F72(ram, rom, ctx, d6) {
  if (!rom) { note(ctx, 0x284f72, DRAWS[0x284f72]); return; }
  if (i16(ram.u16(HUDRAM.aliveP1)) < 0) return;              // $284F72 bmi -> rts
  const d1 = ((0x5bc0 << 16) | u16(d6)) >>> 0;               // $284F7A/$284F84
  enqueueRegisters(ram, 25, d1, HUD.bannerPanelP1, 0x0840, 0x09); // $284F86 jsr
  scoreRow285C62(ram, rom, ctx, 0, d6, 0);                   // $284F9C bra $285C62
}

/** `$284FA2` -- the banner's P2 panel wrapper (mirror). */
export function bannerPanel284FA2(ram, rom, ctx, d6) {
  if (!rom) { note(ctx, 0x284fa2, DRAWS[0x284fa2]); return; }
  if (i16(ram.u16(HUDRAM.aliveP2)) < 0) return;              // $284FA2 bmi -> rts
  const d1 = ((0x5bc0 << 16) | u16(0x2800 - d6)) >>> 0;      // $284FAA/$284FB4
  enqueueRegisters(ram, 25, d1, HUD.bannerPanelP2, 0x0840, 0x09); // $284FB6 jsr
  scoreRow285C62(ram, rom, ctx, 1, d6, 0);                   // $284FCC bra $285DDC
}

// ===========================================================================
// W118 -- THE CHAIN-BREAK POPUP + ITEM ROW (bucket 25), transcribed from ROM.
// W113 deferred these two on claims W117 measured FALSE: `$24157A` is a palette
// hi-half installer (not an object-record installer), and `$242AC6` is the
// already-ported BCD converter. Both bodies are BCD digit walks that emit into
// bucket 25; the popup adds a per-frame palette install. The "combo" the owner
// asked for IS this popup: its D0 is `popupVal`, snapshot from the live chain
// count (W117 sec 5).
// ===========================================================================

/** `rol.l #n,Dn` -- the 32-bit rotate-left the item row's 8-nibble walk uses. */
function rol32(v, n) { return ((v << n) | (v >>> (32 - n))) >>> 0; }

/** The shared early-path zoom-level: how many times D6 (low word) can be
 *  decremented by 3 before borrowing, times 4.  Both bodies run this as
 *  `moveq #$0,D5 / move.l D6,-(A7) / subi.w #$3,D6 / bcs / addq.w #$4,D5`.
 *  Capped at 3 by the caller's `cmpi.w #$C,D6 / bcc late` gate (D6lo < $C
 *  here), so the result is a valid index into the 4-entry jump table. */
function zoomLevel4(d6lo) {
  let d5 = 0, t = d6lo & 0xffff;
  for (;;) {
    if (t < 3) break;                  // $285646/$2857FC subi.w #$3,D6 / bcs
    t = u16(t - 3);
    d5 += 4;                           // $28564C/$285802 addq.w #$4,D5
  }
  return d5;
}

/**
 * `$2855B6` -- THE CHAIN-BREAK POPUP (the "combo").  Three phases: a per-frame
 * palette install (1-2x), a 4-nibble BCD digit walk, and a suffix sprite.  All
 * emits go to bucket 25.
 *
 * Entry registers (the caller `playerBlock` computes them; the countdown side
 * effects stay there):
 *  - D0 = popupVal (the BCD word to display, 4 nibbles)
 *  - D1 = position (caller sets the low word; this body sets the hi word $4FC0)
 *  - D2 = popupSpeed (the palette-scheme gate: != 0 -> active source)
 *  - D4 = 7 (the SPRITE palette bank to install)
 *  - D6 = popupIdx (the zoom/animation counter)
 *
 * A caller with no `PaletteState` on its ctx keeps the counted note the draw
 * always had -- a silent skip here would be indistinguishable from a popup that
 * rendered right, which is the failure `src/unported.js` exists to stop.
 */
export function chainPopup2855B6(ram, rom, ctx, d0, d1, d2, d4, d6) {
  if (!rom) { draw(ctx, 0x2855b6); return; }
  let d0w = d0 & 0xffff;                                     // D0 = popupVal (word)
  // $2855B6 swap / move.w #$4FC0,D1 / swap: hi word $4FC0, low word preserved.
  let d1cur = ((0x4fc0 << 16) | (d1 & 0xffff)) >>> 0;
  const d3digit = 0x0610;                                    // $2855BE move.w #$610,D3
  // $2855C2/$2855D0: D5 = the late-path tile base ($1C9778 unless $80390C == 0).
  const d5base = (ram.u16(0x80390c) !== 0) ? HUD.popupD5Active : HUD.popupD5Default;
  let d6lo = d6 & 0xffff;                                    // popupIdx (low word)
  let drawn = false;                                         // the $80000000 bit of D6

  // ---- Phase A: the palette install (1-2x). -----------------------------
  // $2855D6 tst D2 / beq -> D2==0 arm.  Both arms install at least once; the
  // popup body has NO path that reaches the digit walk without installing.
  if (ctx?.palette) {
    const pal = ctx.palette;
    if (d2 !== 0) {                                          // $2855D8 bne (active)
      install24157A(ram, pal, d4, rom.bytes(HUD.popupPalActive, 32),
        0x2855e4, 'popup active palette');                   // $2855E4 jsr
    } else {
      install24157A(ram, pal, d4, rom.bytes(HUD.popupPalDefault, 32),
        0x2855f8, 'popup default palette');                  // $2855F8 jsr
      if (d0w >= 0x100) {                                    // $285600 cmpi.w #$100 / bcs
        install24157A(ram, pal, d4, rom.bytes(HUD.popupPalSecondary, 32),
          0x285610, 'popup secondary palette (popupVal >= $100)'); // $285610 jsr
      }
      // $285618 cmpi.w #$1000 / bcs -> skip; $28561E is a `nop` in build B
      // (W117 sec 3.2: a fourth install that is a deliberate no-op).
    }
  } else {
    note(ctx, 0x24157a, `$24157A hi-half install for popup $2855B6 -- no `
      + `PaletteState on this ctx, so bank ${d4}'s hi half stays whatever it `
      + `was (W118)`);
  }

  // ---- Phase B: the 4-nibble BCD walk. ----------------------------------
  for (let it = 0; it < 4; it++) {                           // $285620 moveq #$3,D7
    d0w = rol16(d0w, 4);                                     // $285622 rol.w #$4,D0
    const nibble = d0w & 0x0f;                               // $285624/$285626
    if (nibble === 0 && !drawn) {                            // $285628 tst.l D6 / bmi
      // leading-zero suppress.  $28562E cmpi.w #$1C00,D1 / bgt -> off-screen
      // right: advance the position anyway; else collapse (no advance).
      if (i16(d1cur & 0xffff) > 0x1c00) {
        d1cur = ((d1cur & 0xffff0000) | u16((d1cur & 0xffff) + 0x480)) >>> 0; // $285672
      }
      continue;                                              // $285676 dbra
    }
    drawn = true;                                            // $285636 ori.l #$80000000
    let d2tile;
    if (d6lo < 0x000c) {                                     // $28563C cmpi.w #$C / bcc
      // early path: per-zoom digit table.  $285642..$28565E.
      const d5 = zoomLevel4(d6lo);                           // the zoom index * 4
      const base = rom.u32(HUD.popupJump + d5);              // $285652/$285656 jump table
      d2tile = rom.u32(base + nibble * 4);                   // $28565A/$28565E
    } else {
      // late path: word offset + the D5 tile base.  $285664..$28566A.
      d2tile = (rom.u16(HUD.popupLateWords + nibble * 2) + d5base) >>> 0; // $285666/$28566A
    }
    enqueueRegisters(ram, 25, d1cur, d2tile, d3digit, d4);   // $28566C jsr $23FAC4
    d1cur = ((d1cur & 0xffff0000) | u16((d1cur & 0xffff) + 0x480)) >>> 0; // $285672 addi.w #$480
  }

  // ---- Phase C: the suffix sprite. -------------------------------------
  // $285690 addi.w #$FE00,D1; $285694..$28569A swap/move.w #$4EC0/swap (hi=$4EC0).
  let d1suf = ((0x4ec0 << 16) | u16((d1cur & 0xffff) + 0xfe00)) >>> 0;
  let d2suf;
  const d6after = u16(d6lo - 0x17);                          // $28569C subi.w #$17,D6
  if (d6lo >= 0x17) {                                        // $2856A0 bcc -> default
    d2suf = HUD.popupSuffixTile;                             // $2856B4 (both arms $1CC34C)
  } else {
    // $2856A2 neg.w D6 / andi.w #$FFFE / add.w D6,D6 -> index into $285784.
    const idx = (u16(-d6after & 0xffff) & 0xfffe) << 1;
    d2suf = rom.u32(HUD.popupSuffix + idx);                  // $2856AA/$2856AE
  }
  enqueueRegisters(ram, 25, d1suf, d2suf, 0x0420, d4);       // $2856C8 move.w #$420 / jmp $23FA96
}

/**
 * `$2857B4` -- THE ITEM ROW.  An 8-nibble BCD walk over `itemCount $81B610`
 * (converted by `bcd242AC6`), then a suffix sprite.  NO palette install:
 * `itemKind $81B612` is the sprite colour/flip word (D4), not a palette bank.
 * The body reads its own RAM, so it takes no entry registers.
 *
 * Leading zeros are suppressed but STILL ADVANCE the position (the row is a
 * fixed-width field), unlike the popup which collapses them.  Transcribed
 * faithfully from $2857B4..$285874.
 */
export function itemRow2857B4(ram, rom, ctx) {
  if (!rom) { draw(ctx, 0x2857b4); return; }
  // $2857B4 move.w $81B610,D0 / bpl / moveq #$0,D0 (clamp negative to 0).
  let itemCount = ram.u16(HUDRAM.itemCount);                 // $2857B4
  if (i16(itemCount) < 0) itemCount = 0;                     // $2857BA bpl
  let d0 = bcd242AC6(itemCount) >>> 0;                       // $2857BE jsr / $2857C4 move.l D2,D0
  // $2857C6 move.l #$5BBFFE00,D1 / addi.w #$440,D1 -> $5BBF0240.
  let d1cur = ((0x5bbf << 16) | u16(0xfe00 + 0x440)) >>> 0;
  const d4 = ram.u16(HUDRAM.itemKind);                       // $2857D0 move.w $81B612,D4
  let d6lo = ram.u16(HUDRAM.itemDir) & 0xffff;               // $2857D8 move.w $81B60E,D6
  let drawn = false;                                         // the $80000000 bit of D6

  for (let it = 0; it < 8; it++) {                           // $2857DE moveq #$7,D7
    d0 = rol32(d0, 4);                                       // $2857E0 rol.l #$4,D0
    const nibble = d0 & 0x0f;                                // $2857E2/$2857E4
    if (nibble === 0 && !drawn) {                            // $2857E8 tst.l D6 / bpl $285842
      d1cur = ((d1cur & 0xffff0000) | u16((d1cur & 0xffff) + 0x440)) >>> 0; // $285842 advance
      continue;                                              // $285846 dbra
    }
    drawn = true;                                            // $2857EC ori.l #$80000000
    let d2tile;
    if (d6lo < 0x000c) {                                     // $2857F2 cmpi.w #$C / bcc
      // early path: per-zoom digit table.  $2857F8..$285814.
      const d5 = zoomLevel4(d6lo);
      const base = rom.u32(HUD.itemJump + d5);               // $285808/$28580C jump table
      d2tile = rom.u32(base + nibble * 4);                   // $285810/$285814
    } else {
      // late path: 1P/2P base + per-digit long offset.  $28581A..$285834.
      const modeIdx = ram.u16(0x80390a) & 0x06;              // $28581C/$28581E
      const base1p2p = rom.u16(HUD.itemBase1p2p + modeIdx);  // $285824/$285828
      d2tile = (base1p2p + rom.u32(HUD.itemLate + nibble * 4)) >>> 0; // $28582C/$285834
    }
    enqueueRegisters(ram, 25, d1cur, d2tile, 0x0610, d4);    // $285838/$28583C jsr $23FAC4
    d1cur = ((d1cur & 0xffff0000) | u16((d1cur & 0xffff) + 0x440)) >>> 0; // $285842 addi.w #$440
  }

  // ---- suffix. ---------------------------------------------------------
  // $28584A addi.w #$FE00,D1 (low word only) / $28584E subi.l #$2000000,D1.
  let d1suf = ((d1cur & 0xffff0000) | u16((d1cur & 0xffff) + 0xfe00)) >>> 0;
  d1suf = u32(d1suf - 0x02000000);                           // $28584E subi.l #$2000000
  let d2suf = HUD.itemSuffixTile;                            // $285854 move.l #$1CE8E8
  const d6after = u16(d6lo - 0x1b);                          // $28585A subi.w #$1B,D6
  if (d6lo < 0x1b) {                                         // $28585E bcc -> default
    const idx = (u16(-d6after & 0xffff) & 0xfffe) << 1;      // $285860..$285866
    d2suf = rom.u32(HUD.itemSuffix + idx);                   // $285868/$28586C
  }
  enqueueRegisters(ram, 25, d1suf, d2suf, 0x0420, d4);       // $285870/$285874 jmp $23FA96
}

// ===========================================================================
// W116 -- THE HUD TEXT BODIES (the $240DC2 callers). Each replaces a former
// `draw(ctx, addr)` NOTE with the real body, transcribed off maincpu.bin. The
// chain popup `$2855B6` and item row `$2857B4` stay NOTES (they are SPRITE
// draws deferred in W113 -- they need `$24157A`/`$242AC6`, not this path).
// ===========================================================================

/** `rol.w #n,Dn` -- the 16-bit rotate-left the BCD digit walks use. Bits that
 *  leave the top re-enter at the bottom. (`rol.w #$4,D6` brings the top nibble
 *  to the bottom; `rol.w #$C,D6` == ror4 brings nibble 1 to the bottom.) */
function rol16(v, n) { return ((v << n) | (v >>> (16 - n))) & 0xffff; }

/** P1/P2 parameter set for the bodies that mirror (lives, hyper-stock). The
 *  two are instruction-for-instruction identical apart from these addresses. */
function textBodyCfg(who) {
  return who === 0 ? {
    alive: HUDRAM.aliveP1, shipSel: HUDRAM.shipSelectBodyP1,
    iconTab: HUD.livesIconP1, d1Base: 0x200, d1Step: +0x100,
    hyper: HUDRAM.hyperActiveP1, stockIdx: HUDRAM.hyperStockIdxP1,
    addr: 0x2878cc,
  } : {
    alive: HUDRAM.aliveP2, shipSel: HUDRAM.shipSelectBodyP2,
    iconTab: HUD.livesIconP2, d1Base: 0x1900, d1Step: -0x100,
    hyper: HUDRAM.hyperActiveP2, stockIdx: HUDRAM.hyperStockIdxP2,
    addr: 0x28795c,
  };
}

/** `$2878CC` (P1) / `$28795C` (P2) -- THE LIVES ROW. Six vertical slots (D7=5,
 *  dbra -> 6 iterations split between icons and blanks), each slot a 2-cell-
 *  wide icon (D2=1, D3=0). Icons come from `$2881E2[$813084*2]` (P1) /
 *  `$2881EA[$813086*2]` (P2); the unfilled slots are cleared by `$240EBC`.
 *
 *  The banner-active arm (`$8130F9 bit0` + `$81B61F bmi` + `$81B61E bit4`)
 *  shifts D0/D1; in this port `$8130F9 bit0`'s only writer is the unported
 *  BOSS_TAIL, so the arm never fires -- but it is ported faithfully. */
export function livesRow2878CC(ram, rom, ctx, who) {
  const C = textBodyCfg(who);
  if (!rom) { note(ctx, C.addr, DRAWS[C.addr]); return; }
  let d0 = 0xbc, d1 = C.d1Base;                             // $2878D0/$2878D4
  if ((ram.u8(HUDRAM.flags9) & 0x01)                       // $2878D8 btst #0,$8130F9
    && (ram.u8(HUDRAM.bannerFlagsClear) & 0x80) === 0      // $2878E4 tst.b $81B61F / bmi
    && (ram.u8(HUDRAM.bannerFlagsBoss) & 0x10)) {          // $2878EE btst #4,$81B61E
    d0 = 0xc0; d1 = who === 0 ? 0x0000 : 0x1b00;           // $2878FA/$2878FE (P1) / $287984/$287988
  }
  const lives = ram.u16(C.alive);                          // $28790C
  let d7 = 5;                                              // $287902 moveq #5,D7 (total slots-1)
  const d2 = 1, d3 = 0;                                    // $287904/$287908 (2-wide, 1-tall)
  if (lives !== 0) {
    let d6 = (lives - 1) & 0xffff;                         // $287914 subq.w #1,D6
    d7 = (d7 - 1) & 0xffff;                                // $287916 subq.w #1,D7
    if (d6 > 5) d6 = 5;                                    // $287918 cmpi / $28791E moveq #5
    d7 = (d7 - d6) & 0xffff;                               // $287920 sub.w D6,D7
    const sel = ram.u16(C.shipSel);                        // $287922
    const tile = rom.u32(C.iconTab + ((sel * 2) & 0xffff));// $287928/$28792A/$287930
    do {
      txPrint240DC2(ram, d0, d1, d2, d3, tile);            // $287936 jsr $240DC2
      d1 = (d1 + C.d1Step) & 0xffff;                       // $28793C addi / $2879C6 subi
    } while (d6-- !== 0);                                  // $287940 dbra D6
  }
  if ((d7 & 0x8000) === 0) {                               // $287944 tst.w D7 / $287946 bmi SKIP
    do {
      txPrint240EBC(ram, d0, d1, d2, d3);                  // $287948 jsr $240EBC
      d1 = (d1 + C.d1Step) & 0xffff;                       // $28794E addi / $2879D8 subi
    } while (d7-- !== 0);                                  // $287952 dbra D7
  }
}

/** `$284E7A..$284EC8` (P1) / `$284EF2..$284F42` (P2) -- the slide-in's INLINE
 *  lives draw, the path that ACTUALLY shows lives in normal stage-1 play (the
 *  body `$2878CC` is only reached from the dead `$8130F9 bit0` arm). Same shape
 *  as the body but indexes the table off the PLAYER record's shipSel
 *  (`$81043E`/`$8104A0`), draws no blanks, and runs D7 through the same clamp.
 *  Called from `slideIn284CF2` on the slide's last frame. */
function slideInLivesDraw(ram, rom, ctx, who) {
  const C = textBodyCfg(who);
  const aliveAddr = who === 0 ? HUDRAM.aliveP1 : HUDRAM.aliveP2;
  const slideSel = who === 0 ? HUDRAM.shipSelectSlideP1 : HUDRAM.shipSelectSlideP2;
  const lives = ram.u16(aliveAddr);                        // $284E7A / $284EF2
  if ((lives & 0x8000) !== 0) return;                      // $284E80 / $284EF8 bmi -> skip P1
  if (lives === 0) return;                                 // $284E86 bcs (subq#1 borrows) -> skip icons
  let d7 = lives - 1;                                      // $284E84 subq.w #1,D7
  if (d7 > 5) d7 = 5;                                      // $284E8A cmpi #5 / $284E90 moveq #5
  const d0 = 0xbc, d2 = 1, d3 = 0;                         // $284E92 / $284E9E / $284EA2
  let d1 = C.d1Base;                                       // $284E96 / $284F0E
  // $284E9A tst.w D7 / bmi -> skip: d7 is 0..5 here (>=1 lives), so never taken.
  const sel = ram.u16(slideSel);                           // $284EA6 / $284F1E
  const tile = rom.u32(C.iconTab + ((sel * 2) & 0xffff));  // $284EAC/$284EAE/$284EB4
  do {
    txPrint240DC2(ram, d0, d1, d2, d3, tile);              // $284EBA jsr $240DC2
    d1 = (d1 + C.d1Step) & 0xffff;                         // $284EC0 addi / $284F38 subi
  } while (d7-- !== 0);                                    // $284EC4 dbra D7
}

/** `$287ABE` (P1) / `$287AF0` (P2) -- THE BOMB-STOCK ROW. Trivial: five moves
 *  and a `jmp $240DC2`. A fixed 8-wide-by-2-tall graphic (D2=7, D3=1) with the
 *  per-cell tile advancing $10000; no RAM read. */
export function bombStock287ABE(ram, rom, ctx, who) {
  const addr = who === 0 ? 0x287abe : 0x287af0;
  if (!rom) { note(ctx, addr, DRAWS[addr]); return; }
  const d0 = 0xd4, d2 = 7, d3 = 1;                         // $287ABE/$287AC6/$287ACA
  const d1 = who === 0 ? 0x0000 : 0x1a00;                  // $287AC2 / $287AF4
  const d4 = who === 0 ? HUD.bombTileP1 : HUD.bombTileP2;  // $287ACE / $287B00
  txPrint240DC2(ram, d0, d1, d2, d3, d4);                  // $287AD4 / $287B06 jmp $240DC2
}

/** `$286ED6` (P1) / `$286F3E` (P2) -- THE HYPER-STOCK ICONS. A 3wide-by-6tall
 *  grid (D2=2, D3=5). When the player is hypering (`$81B63E`/`$81B640`) the
 *  active tile `$414000A` is used; otherwise the icon is
 *  `$2883E6[$81B65C*4]`/`[$81B65E*4]`. */
export function hyperStock286ED6(ram, rom, ctx, who) {
  const addr = who === 0 ? 0x286ed6 : 0x286f3e;
  if (!rom) { note(ctx, addr, DRAWS[addr]); return; }
  const hyper = who === 0 ? HUDRAM.hyperActiveP1 : HUDRAM.hyperActiveP2;
  const stockIdx = who === 0 ? HUDRAM.hyperStockIdxP1 : HUDRAM.hyperStockIdxP2;
  let d0 = 0xc8, d1 = who === 0 ? 0x200 : 0x1400;          // $286ED6/$286EDA / $286F3E/$286F42
  // The banner-active arm: only when flags9 bit0 is set, the stage-clear flag
  // is clear, AND bannerFlagsBoss bit4 is set; bit4 clear returns WITHOUT
  // drawing. In this port flags9 bit0's writer is unported, so the arm never
  // fires -- ported faithfully.
  if ((ram.u8(HUDRAM.flags9) & 0x01)                       // $286EDE/$286F46 btst #0,$8130F9
    && (ram.u8(HUDRAM.bannerFlagsClear) & 0x80) === 0) {   // $286EE8/$286F50 tst.b / bmi -> skip arm
    if ((ram.u8(HUDRAM.bannerFlagsBoss) & 0x10) === 0) return; // $286EF8 beq -> rts (bit4 clear)
    d0 = 0xcc; d1 = who === 0 ? 0x0000 : 0x1600;           // $286EFC/$286F00 / $286F64/$286F68
  }
  const d2 = 2, d3 = 5;                                    // $286F04/$286F08
  let d4;
  if (ram.u16(hyper) !== 0) {                              // $286F0C/$286F74 tst.w / bne
    d4 = HUD.hyperStockActiveTile;                         // $286F30/$286F98
  } else {
    const idx = ram.u16(stockIdx);                         // $286F14/$286F7C
    d4 = rom.u32(HUD.hyperStockTab + ((idx * 4) & 0xffff));// $286F1A..$286F24
  }
  txPrint240DC2(ram, d0, d1, d2, d3, d4);                  // $286F28/$286F90 jmp $240DC2
}

/** `$285FB6` -- THE CREDIT ROW. Draws the credit count (D6, BCD) as big 3x3
 *  tile digits. The 1-digit arm (D6 < $10) draws the digit from `$287F86[D6*4]`
 *  then a suffix from `$287F7A[D5]` via the stride variant; the 2-digit arm
 *  extracts tens/ones via `rol.w #4 / and #$F` and draws each from `$287FAE`/
 *  `$287FD6`. The caller (playerBlock `$2845AC`/`$28474A`) supplies D0, D1 and
 *  loads D5 from `$812910`/`$812912` and D6 from `$812900`/`$81290E`. */
export function creditRow285FB6(ram, rom, ctx, d0, d1, d5, d6) {
  if (!rom) { note(ctx, 0x285fb6, DRAWS[0x285fb6]); return; }
  const d2 = 2, d3 = 2;                                    // $285FCA/$285FCC (3x3 grid)
  if ((d6 & 0xffff) < 0x10) {                              // $285FB6 cmpi #$10,D6 / bcc 2-digit
    const dim = (d6 & 0xffff) * 4;                         // $285FBC/$285FBE add.w D6,D6 twice
    const tileD = rom.u32(HUD.credDigitTab + dim);         // $285FC0/$285FC6/$285FCC -> D4
    txPrint240DC2(ram, d0, d1, d2, d3, tileD);             // $285FCE jsr $240DC2
    d1 = (d1 + 0x300) & 0xffff;                            // $285FD4 addi.w #$300,D1
    const tileS = rom.u32(HUD.credSuffixTab + (d5 & 0xffff)); // $285FD8/$285FDA/$285FE0
    txPrint240E1A(ram, d0, d1, d2, d3, tileS, 9);          // $285FE8/$285FEA jmp $240E1A (stride 9)
    return;
  }
  // 2-digit arm ($285FF2..). The count is BCD in the low byte (nibble1=tens,
  // nibble0=ones). `$285FF6 rol.w D5,D6` with D5=$C rotates left 12 (== ror4),
  // bringing nibble1 to the low nibble; `$286018 rol.w #$4,D6` then brings
  // nibble0 to the low nibble. D5 is saved/restored (the suffix draw uses it).
  let d6w = d6 & 0xffff;
  const tens = rol16(d6w, 12) & 0xf;                       // $285FF4 moveq #$C,D5 / $285FF6 rol.w D5,D6
  const tileT = rom.u32(HUD.cred2dTens + tens * 4);        // $285FFC..$286006
  txPrint240DC2(ram, d0, d1, 2, 1, tileT);                 // $28600E jsr $240DC2 (D2=2,D3=1, 3x2)
  d1 = (d1 + 0x200) & 0xffff;                              // $286014 addi.w #$200,D1
  const ones = rol16(rol16(d6w, 12), 4) & 0xf;             // $286018 rol.w #$4,D6
  const tileO = rom.u32(HUD.cred2dOnes + ones * 4);        // $28601E..$286028
  txPrint240E1A(ram, d0, d1, 2, 0, tileO, 3);              // $286032 jsr $240E1A (D2=2,D3=0,D5=3)
  d1 = (d1 + 0x100) & 0xffff;                              // $286038 addi.w #$100,D1
  // $28603C move.w (A7)+,D5 ; $28603E bra $285FD8 -- the suffix draw (same as
  // the 1-digit arm's tail).
  const tileS = rom.u32(HUD.credSuffixTab + (d5 & 0xffff));
  txPrint240E1A(ram, d0, d1, d2, d3, tileS, 9);
}

/** `$286040` -- THE CHAIN HIGH-WATER. Draws the label (imm `$53D000A`, 3x6
 *  grid) then four BCD digits of the chain high-water count (D6, from
 *  `$81B632`/`$81B634`) via `$240E1A`, each a 3x1 strip off a per-digit
 *  sub-table (`$287FFE + n*$28`; `$28608C lea $28(A1),A1` steps A1 $28 bytes
 *  per digit). Leading zeros are suppressed (digit 0 -> tile `$00000000`, and
 *  once a nonzero digit has printed, zeros DO print). The caller supplies
 *  D0/D1. */
export function chainHiWater286040(ram, rom, ctx, d0, d1, d6) {
  if (!rom) { note(ctx, 0x286040, DRAWS[0x286040]); return; }
  txPrint240DC2(ram, d0, d1, 2, 5, HUD.chainHwLabelTile);  // $286044 jsr $240DC2 (the label)
  d1 = (d1 + 0x200) & 0xffff;                              // $286050 addi.w #$200,D1
  let any = 0;                                             // $28605A moveq #0,D5 (saw-nonzero)
  let d6w = d6 & 0xffff;
  for (let n = 0; n < 4; n++) {                            // $28605C moveq #3,D7 / dbra
    const nib = (d6w >> 12) & 0xf;                         // $28605E rol.w #$4,D6 / $286062 and #$F
    d6w = (d6w << 4) & 0xffff;                             //  (rol feeds the next iter)
    if (nib !== 0 || any !== 0) {                          // $286064 bne PRINT / $286066 tst D5 / beq SKIP
      const tile = rom.u32(HUD.chainHwTab + n * 0x28 + nib * 4); // $28606A..$28606E (A1 += $28/digit)
      txPrint240E1A(ram, d0, d1, 2, 0, tile, 0xa);         // $286076..$28607C jsr $240E1A (stride $A)
      any = 1;                                             // $286086 moveq #1,D5
    }
    d1 = (d1 + 0x100) & 0xffff;                            // $286088 addi.w #$100,D1
  }
}

/** `$284EEC` (P1) / `$284F64` (P2) -- the slide-in's PANEL-LABEL inline draw.
 *  A 3wide-by-6tall grid of the fixed label tile `$54F000A` (the "1UP"/"2UP"
 *  row label). Three moves and a `jsr $240DC2`. */
export function panelLabelInline(ram, rom, ctx, who) {
  const addr = who === 0 ? 0x284ee6 : 0x284f4e;
  if (!rom) { note(ctx, addr, DRAWS[0x240dc2]); return; }
  const d0 = 0xd4, d2 = 2, d3 = 5;                         // $284ED6/$284EDE/$284EE2
  const d1 = who === 0 ? 0x200 : 0x1400;                   // $284EDA / $284F52
  txPrint240DC2(ram, d0, d1, d2, d3, HUD.panelLabelTile);  // $284EE6/$284F64 jsr $240DC2
}

/** `$284FD2` -- the BOSS banner's panels.  138 instructions and **exactly four
 *  absolute RAM writes**; the other 134 are `$23FA96`/`$23FAC4`/`$240DC2`/
 *  `$286ED6`/`$286F3E`.  Its mirror `$2851D2` has the two sub-counters SWAPPED
 *  -- `$284FD2` gates on `$81B61E` and decrements `$81B622` then `$81B624`,
 *  `$2851D2` gates on `$81B61F` and decrements `$81B624` then `$81B622`.  Read
 *  as one routine with a parameter they would be wrong. */
// The two 68000 register idioms the panel needs: `swap D1` and an `addi.w` that must
// not carry into the high word. THIRD copy in this port (`stageend.js` and `bee.js`
// have the same pair); a FOURTH should move them into `ram.js` instead.
const d1Swap = (d) => (((d & 0xffff) << 16) | ((d >>> 16) & 0xffff)) >>> 0;
const d1AddLo = (d, v) => (((d & 0xffff0000) | ((d + v) & 0xffff)) >>> 0);

/** `$23FA96` and `$23FAC4` -- BUCKET 25, and both are `enqueueRegisters`. The only
 *  difference between them is register discipline: `$23FAC4` pushes A0 and D0 and
 *  pops them, `$23FA96` does not, which is why the caller uses `$23FAC4` inside a
 *  `dbra D0` loop and `$23FA96` outside one. In this port that distinction has no
 *  effect -- JS has no caller-clobbered registers -- so both are one call, and the
 *  ROM addresses stay on the two wrappers so a reader can still find them. */
function emit23FA96(ram, d1, d2, d3, d4) {
  return enqueueRegisters(ram, 25, d1, d2, d3, d4);      // $23FA96..$23FAC2
}
function emit23FAC4(ram, d1, d2, d3, d4) {
  return enqueueRegisters(ram, 25, d1, d2, d3, d4);      // $23FAC4..$23FAEE
}

/** The four 8-byte tables at `$2881D2`, read as LONGWORDS at a stride of TWO
 *  (`move.w <weapon>,D2 / add.w D2,D2 / move.l (A0,D2.w),D2`), so entries overlap.
 *  Their far end is `$2881F2`, which is a window this port already had. */
const PANEL_ART = {
  livesP1: 0x2881d2, livesP2: 0x2881da,
  bombP1: 0x2881e2, bombP2: 0x2881ea,
  stock: 0x2883ce,          // stock*4, six longwords, ending at $2883E6's window
};

/**
 * One player's half of `$2851D2`: the LIVES icons, the hyper STOCK icon, and the
 * bomb row's text. `$285206..$2852EA` is P1 and `$2852EA..$2853C0` is P2, and they
 * are mirror images -- the icon loop steps the column the other way, the hyper bias
 * differs, and each reads its own weapon word and its own art table.
 */
function panelBlock(ram, rom, ctx, s, d6, hi) {
  // $28520E / $2852EA -- the LIVES word, and a negative one skips the whole block.
  const alive = ram.u16(s.alive);
  if (i16(alive) < 0) return;
  // $285218..$285224 -- `subq.w #1` then clamp to five: `bcs` takes a zero straight
  // past the loop with D0 = $FFFF, and `bls` leaves anything above five at five.
  let d0 = u16(alive - 1);
  if (i16(d0) >= 0 && d0 > 5) d0 = 5;                    // $28521E/$285224
  const d7 = d0;                                         // $285226 move.w D0,D7

  // D1 is a LONG and only its LOW word belongs to this block: `hi` is what the
  // panel's own prologue swapped upstairs ($2851DE/$2851E0 and $285008/$28500A),
  // and `move.w #$500,D1` here touches the low half alone. W239 fixes W238, which
  // built D1 as a word and lost the panel's vertical position -- and its test only
  // compared low words, so nothing said so.
  let d1 = (((hi & 0xffff) << 16)
    | u16(s.iconBase + (s.iconMinus ? u16(-d6) : d6))) >>> 0;  // $285228/$28522C
  const d5 = d1;                                         // $285238 move.l D1,D5
  if (i16(d0) >= 0) {                                    // $285234 tst.w/bmi
    // $28523A..$285244 -- the icon's own two-axis bias, applied across the swap.
    d1 = d1AddLo(d1, s.iconLoBias);
    d1 = d1Swap(d1);
    d1 = d1AddLo(d1, s.iconHiBias);
    d1 = d1Swap(d1);
    const w = ram.u16(s.weapon);                         // $285246 move.w
    const d2 = rom.u32(s.livesArt + u16(w * 2));         // $28524C/$285254
    for (let n = 0; n <= d0; n++) {                      // $285266 dbra D0
      emit23FAC4(ram, d1, d2, 0x0208, s.iconAttr);       // $28525C jsr $23FAC4
      d1 = d1AddLo(d1, s.iconStep);                      // $285262 addi.w #$200
    }
    d1 = d5;                                             // $28526A move.l D5,D1
  }

  // $28526C / $285344 -- the hyper STOCK icon, only while the hyper is NOT up.
  if (ram.u16(s.hyper) === 0) {
    let h = d1AddLo(d1, s.stockLoBias);                  // $285274 / $28534C
    h = d1Swap(h);
    h = d1AddLo(h, 0x0100);                              // $28527A / $285352
    h = d1Swap(h);
    const idx = u16(u16(ram.u16(s.stockIdx) * 2) * 2);   // $28528E/$285290
    emit23FA96(ram, h, rom.u32(PANEL_ART.stock + idx), 0x0430, 0x0009);  // $28529C
  }

  // $2852A4 / $28537A -- bit 7 of the clear flags gates the REST of the block, and
  // the `bpl` jumps past the stock-icon call too, not just the text.
  if ((ram.u8(s.gateAddr) & s.gateMask) === 0) return;
  // $2852B4 tst.w D7 / bmi -- a negative count skips only the text LOOP; the
  // `bmi` target is the stock call below.
  if (i16(d7) >= 0) {
    // $2852B0 / $285386 `move.w #$200,D1` -- again the LOW half only, over the
    // high word the prologue put there.
    let t = (((hi & 0xffff) << 16) | s.textBase) >>> 0;
    const w = ram.u16(s.weapon);                         // $2852C0 / $285396
    const d4 = rom.u32(s.bombArt + u16(w * 2));          // $2852C6/$2852CE
    for (let n = 0; n <= d7; n++) {                      // $2852DE / $2853B4 dbra D7
      txPrint240DC2(ram, s.textD0, t, 0x0001, 0x0000, d4);  // $2852D4 / $2853AA
      t = (((t & 0xffff0000) | u16(t + s.textStep)) >>> 0);  // $2852DA / $2853B0
    }
  }
  // $2852E4 jsr $286ED6 and $2853BA jsr $286F3E -- each block calls ITS OWN, and
  // `hyperStock286ED6` has covered both since W118.
  hyperStock286ED6(ram, rom, ctx, s.who);
}

/** Exported for `w239boss-panel.test.js`, for the reason `panel2851D2` is. */
export function panel284FD2(ram, rom, ctx) {
  if ((ram.u8(HUDRAM.bannerFlagsBoss) & 0x08)           // $284FDE btst #$3,$81B61E
    && ram.u16(HUDRAM.bannerTimer) <= 0x0c) {           // $284FE8 cmpi.w #$C / bhi
    subqFloor(ram, HUDRAM.bannerSubA);                  // $284FF2 subq.w / $284FFA clr.w
  }
  // W239 runs the body, and it is `panelBlock` again. The BOSS banner differs from
  // the stage-clear one in six constants and nothing structural, which is why
  // `hud.js` was right to keep them apart as two routines and right not to make one
  // of them a parameter of the other:
  //
  //   the prologue's base is $5F80 and it SUBTRACTS `$81B622 << 6` ($285008),
  //   D6 is `$81B624 << SEVEN` ($284FDC), not six,
  //   the text gate is bit 4 of $81B61E ($2850A0), not bit 7 of $81B61F,
  //   the text's D0 is $C0 ($2850AA), not $BC,
  //   P1's icon column is $100 PLUS D6 ($285024) and P2's is $3700 MINUS it,
  //   and the text columns are $0 and $1B00.
  const hi = u16(0x5f80 - u16(ram.u16(HUDRAM.bannerSubA) << 6));  // $284FD2..$28500A
  const d6 = u16(ram.u16(HUDRAM.bannerSubB) << 7);      // $284FD6/$284FDC
  panelBlock(ram, rom, ctx, {
    alive: HUDRAM.aliveP1, weapon: 0x81043e,
    hyper: HUDRAM.hyperActiveP1, stockIdx: HUDRAM.hyperStockIdxP1,
    livesArt: PANEL_ART.livesP1, bombArt: PANEL_ART.bombP1,
    iconBase: 0x0100, iconMinus: false,                 // $285024 / $285028 add
    iconLoBias: 0xff00, iconHiBias: 0xfe00,             // $285036 / $28503C
    iconStep: 0x0200, iconAttr: 0x0000,
    stockLoBias: 0xff00, textBase: 0x0000, textStep: 0x0100, who: 0,
    textD0: 0x00c0, gateAddr: HUDRAM.bannerFlagsBoss, gateMask: 0x10,
  }, d6, hi);
  panelBlock(ram, rom, ctx, {
    alive: HUDRAM.aliveP2, weapon: 0x8104a0,
    hyper: HUDRAM.hyperActiveP2, stockIdx: HUDRAM.hyperStockIdxP2,
    livesArt: PANEL_ART.livesP2, bombArt: PANEL_ART.bombP2,
    iconBase: 0x3700, iconMinus: true,                  // $285100 / $285104 sub
    iconLoBias: 0xff00, iconHiBias: 0xfe00,             // $285110 / $285116
    iconStep: 0xfe00, iconAttr: 0x0001,
    stockLoBias: 0xf500, textBase: 0x1b00, textStep: 0xff00, who: 1,
    textD0: 0x00c0, gateAddr: HUDRAM.bannerFlagsBoss, gateMask: 0x10,
  }, d6, hi);
  subqFloor(ram, HUDRAM.bannerSubB);                    // $2851C2 subq.w / $2851CA clr.w
}

/** `$2851D2` -- the STAGE-CLEAR banner's panels.  See `panel284FD2`. */
/** Exported for `w238banner-panel.test.js`: its three callers are deep inside the
 *  banner state machine and a test that drove them would be testing the machine. */
export function panel2851D2(ram, rom, ctx) {
  if ((ram.u8(HUDRAM.bannerFlagsClear) & 0x08)          // $2851E2 btst #$3,$81B61F
    && ram.u16(HUDRAM.bannerTimer) <= 0x10) {           // $2851EE cmpi.w #$10 / bhi
    subqFloor(ram, HUDRAM.bannerSubB);                  // $2851F8 subq.w / $285200 clr.w
  }
  // W238 runs the body. Its three draws were counted and all three were available:
  // `$240DC2` since W116, `$286ED6`/`$286F3E` as `hyperStock286ED6` since W118, and
  // `$23FAC4`/`$23FA96` are `enqueueRegisters` on bucket 25.
  //
  // $2851D2..$285206 build the SLIDE offset the two blocks share: the panel's own
  // column plus `$81B622 << 6`, and D6 is `$81B624 << 6`.
  // $2851D2..$2851E0 -- D1's HIGH word, which both blocks then keep: $5DC0 plus
  // `$81B622 << 6`, swapped upstairs before either block touches the low half.
  const hi = u16(0x5dc0 + u16(ram.u16(HUDRAM.bannerSubA) << 6));
  const d6 = u16(ram.u16(HUDRAM.bannerSubB) << 6);      // $285206/$28520C
  panelBlock(ram, rom, ctx, {
    alive: HUDRAM.aliveP1, weapon: 0x81043e,
    hyper: HUDRAM.hyperActiveP1, stockIdx: HUDRAM.hyperStockIdxP1,
    livesArt: PANEL_ART.livesP1, bombArt: PANEL_ART.bombP1,
    iconBase: 0x0500, iconMinus: true,                  // $285228 #$500 / $28522C sub
    iconLoBias: 0xff00, iconHiBias: 0xfe00,             // $28523A / $285240
    iconStep: 0x0200, iconAttr: 0x0000,                 // $285262 / $285258
    stockLoBias: 0xff00, textBase: 0x0200, textStep: 0x0100, who: 0,
    textD0: 0x00bc, gateAddr: HUDRAM.bannerFlagsClear, gateMask: 0x80,
  }, d6, hi);
  panelBlock(ram, rom, ctx, {
    alive: HUDRAM.aliveP2, weapon: 0x8104a0,
    hyper: HUDRAM.hyperActiveP2, stockIdx: HUDRAM.hyperStockIdxP2,
    livesArt: PANEL_ART.livesP2, bombArt: PANEL_ART.bombP2,
    iconBase: 0x3300, iconMinus: false,                 // $285302 #$3300 / $285306 add
    iconLoBias: 0xff00, iconHiBias: 0xfe00,             // $285312 / $285318
    iconStep: 0xfe00, iconAttr: 0x0001,                 // $28533A subi #$200 / $285330
    stockLoBias: 0xf500, textBase: 0x1900, textStep: 0xff00, who: 1,
    textD0: 0x00bc, gateAddr: HUDRAM.bannerFlagsClear, gateMask: 0x80,
  }, d6, hi);
  subqFloor(ram, HUDRAM.bannerSubA);                    // $2853C0 subq.w / $2853C8 clr.w
}

/** `subq.w #$1,X / bcc skip / clr.w X` -- the four sites above.  The `subq`
 *  WRITES `$FFFF` and the `clr.w` overwrites it, so the net effect is a floor
 *  at zero; the intermediate is unobservable because nothing runs between. */
function subqFloor(ram, addr) {
  const cur = ram.u16(addr);
  ram.setU16(addr, cur === 0 ? 0 : u16(cur - 1));
}

/** `$284CF2..$284F70` -- **THE HUD SLIDE-IN**, and recon 38 2.1 called this arm
 *  "<- skips BOTH" without saying that it is the DEFAULT.
 *
 *  [M] `$81B6EE` is **1** in the shipped bundle seed, so the port's very first
 *  frame of `$28444E` comes here and NOT to the skeleton.  `$81B620` is `$30`
 *  in the seed and this arm counts it to zero -- **48 frames** -- drawing the
 *  HUD sliding in from off-screen (`D6 = -($81B620 << 6)`), and on the frame it
 *  reaches zero `$284F6A clr.w $81B6EE` and the skeleton runs for ever after.
 *
 *  ITS ENTIRE EFFECT ON RAM IS TWO INSTRUCTIONS: the countdown and the clear.
 *  Returns true only on `$284D24`'s arm, which `$284D2A bra.w $284460` re-enters
 *  the skeleton with, IN THE SAME FRAME. */
function slideIn284CF2(ram, rom, ctx) {
  if (ram.u8(HUDRAM.flags9) & 0x01) {                   // $284CF2 btst #$0,$8130F9
    // W271 (DOCKET D7) -- THE HYPER STOCK ROW WAS ALREADY TRANSCRIBED AND NEVER CALLED.
    // `hyperStock286ED6` has been in this file since W113, complete and with every
    // constant named ($2883E6, $81B65C/$81B65E, the $414000A active tile). This arm --
    // the one `flags9` bit 0 selects, i.e. the stage-clear/banner frames -- still emitted
    // the NOTE that the transcription replaced everywhere else. So the owner's "hyper
    // gauges in UI aren't painted" was not a missing routine and not a missing sprite: it
    // was two call sites left on the note after the body landed.
    //
    // The LIVES rows are the SAME defect: `livesRow2878CC` has been transcribed since
    // W116 and this arm called the note for it too. Both are wired now.
    if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) {
      hyperStock286ED6(ram, rom, ctx, 0);               // $284D0A bsr $286ED6
      livesRow2878CC(ram, rom, ctx, 0);                 // $284D10 bsr $2878CC
    }
    if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) {
      hyperStock286ED6(ram, rom, ctx, 1);               // $284D1A bsr $286F3E
      livesRow2878CC(ram, rom, ctx, 1);                 // $284D20 bsr $28795C
    }
    ram.setU16(HUDRAM.slideFlag, 0);                    // $284D24 clr.w $81B6EE
    return true;                                        // $284D2A bra.w $284460
  }
  if (ram.u16(HUDRAM.bannerTimer) !== 0) {              // $284D2E tst.w $81B620 / beq
    ram.setU16(HUDRAM.bannerTimer,                      // $284D38 subq.w #$1
      u16(ram.u16(HUDRAM.bannerTimer) - 1));
    const d6 = ram.u16(HUDRAM.bannerTimer);             // $284D3E move.w $81B620,D6
    if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) {            // $284D48 / $284D4E bmi
      draw(ctx, 0x23fac4);                              // $284D96, the lives dbra
      if (ram.u16(HUDRAM.hyperActiveP1) === 0) draw(ctx, 0x23fa96);   // $284DA6 / $284DD6
      bannerPanel284F72(ram, rom, ctx, d6);             // $284DDE bsr
    }
    if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) {            // $284DE2 / $284DE8 bmi
      draw(ctx, 0x23fac4);                              // $284E2E
      if (ram.u16(HUDRAM.hyperActiveP2) === 0) draw(ctx, 0x23fa96);   // $284E3E / $284E6E
      bannerPanel284FA2(ram, rom, ctx, d6);             // $284E74 bsr
    }
    return false;                                       // $284E78 rts
  }
  // ---- $284E7A: the LAST frame of the slide-in. W116: the inline lives draw,
  // the hyper-stock + bombs bodies, and the panel-label inline now run for real
  // (they append to the $80B058 defer buffer; the IRQ6 flush $141258 drains it
  // into TxVram). The `$81043E`/`$8104A0` lives path is the one that shows lives
  // in normal stage-1 play.
  if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) {              // $284E7A / $284E80 bmi
    slideInLivesDraw(ram, rom, ctx, 0);                 // $284E7A..$284EC8 (inline lives P1)
    hyperStock286ED6(ram, rom, ctx, 0);                 // $284ECA jsr $286ED6
    bombStock287ABE(ram, rom, ctx, 0);                  // $284ED0 jsr $287ABE
    panelLabelInline(ram, rom, ctx, 0);                 // $284ED6..$284EEC (the 1UP label)
  }
  if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) {              // $284EF2 / $284EF8 bmi
    slideInLivesDraw(ram, rom, ctx, 1);                 // $284EF2..$284F42 (inline lives P2)
    hyperStock286ED6(ram, rom, ctx, 1);                 // $284F42 jsr $286F3E
    bombStock287ABE(ram, rom, ctx, 1);                  // $284F48 jsr $287AF0
    panelLabelInline(ram, rom, ctx, 1);                 // $284F4E..$284F64 (the 2UP label)
  }
  ram.setU16(HUDRAM.slideFlag, 0);                      // $284F6A clr.w $81B6EE
  return false;                                         // $284F70 rts
}

/** `$2844C8..$28465A` (P1) and `$284666..$2847F8` (P2) -- ONE player's HUD
 *  block, ending in **THE CHAIN METER DECREMENT**.  The two are
 *  instruction-for-instruction identical apart from `HUDRAM.p1`/`HUDRAM.p2`.
 *
 *  Note `$2844D6` and `$284674` BOTH read `$81B61F`, the STAGE-CLEAR banner's
 *  flags -- it is not a per-player word.  See `HUDRAM`'s own note. */
function playerBlock(ram, rom, ctx, P) {
  panel285C5E(ram, rom, ctx, P.who);                      // $2844C8 / $284666 bsr
  const bossUp = (ram.u8(HUDRAM.flags9) & 0x01)         // $2844CC / $28466A btst #$0
    && (ram.u8(HUDRAM.bannerFlagsClear) & 0x80) === 0;  // $2844D6 / $284674 tst.b / bpl
  if (bossUp) {
    // $2844DC / $28467A bpl.w -> straight to the popup countdown.
  } else if (ram.u16(P.hyper) !== 0) {                  // $2844E0 / $28467E tst.w
    const had = ram.u8(P.hyperShown) & 0x01;            // $2844E8 / $284686 bset.b #$0
    ram.setU8(P.hyperShown, ram.u8(P.hyperShown) | 0x01);
    if (!had) {
      // W116: the hyper-start transition redraws the panel label ($54F000A)
      // and the active hyper-stock icon ($414000A) as text, then the flash.
      panelLabelInline(ram, rom, ctx, P.who);            // $284508 jsr $240DC2 (tile $54F000A)
      txPrint240DC2(ram, 0xc8, P.who === 0 ? 0x200 : 0x1400, // $28450E..$28451E (D0=$C8)
        2, 5, HUD.hyperStockActiveTile);                 // $284524 jsr $240DC2 (active icon)
    }
    hyperFlash285FA6(ram, rom, ctx, 0x64c00400,           // $28452A move.l / $284530 D2
      ram.u32(HUDRAM.cursorValB));                        // $284536 / $2846D4 bsr
  } else {
    ram.setU8(P.hyperShown, ram.u8(P.hyperShown) & ~0x01);  // $28453E / $2846DC bclr.b
    if ((ram.u8(HUDRAM.altPhase) & 0x40)                // $284546 / $2846E4 btst #$6
      && (ram.u8(P.playerState) & 0x40) === 0           // $284550 / $2846EE btst #$6
      && ram.u16(P.creditRow) !== 0) {                  // $28455A / $2846F8 move.w / beq
      if ((ram.u16(HUDRAM.frameCounter) & 0x3f) < P.creditDuty) {   // $28456A / $284708
        // W116: the panel-label inline ($284586 jsr $240DC2, tile $54F000A)
        panelLabelInline(ram, rom, ctx, P.who);         // $284570..$284586 / $28470E..$284724
        hyperFlash285FA6(ram, rom, ctx, 0x64c00400,       // $28458C move.l / $284592 D2
          ram.u32(HUDRAM.cursorValA));                    // $284598 / $284736 bsr
      } else {
        // W116: the credit row. D0=$D4, D1=$200/$1400, D5=creditSuffix,
        // D6=creditRow (the BCD count).
        creditRow285FB6(ram, rom, ctx, 0xd4,            // $28459E/$28473C
          P.who === 0 ? 0x200 : 0x1400,                   // $2845A2 / $284740
          ram.u16(P.creditSuffix), ram.u16(P.creditRow)); // $2845A6/$2845AC (D5/D6)
      }
    } else {
      // W116: the chain high-water. D0=$D4, D1=$200(P1)/$1400(P2), D6=chainHiWater.
      chainHiWater286040(ram, rom, ctx, 0xd4,           // $2845B2 / $284750
        P.who === 0 ? 0x200 : 0x1400,                     // $2845B6 / $284754
        ram.u16(P.chainHiWater));                         // $2845BA / $284758 -> D6
    }
  }
  // ---- $2845C4 / $284762: THE CHAIN-BREAK POPUP COUNTDOWN.
  if (ram.u16(P.popup) !== 0) {                         // tst.w / beq
    const popup = ram.u16(P.popup);                     // PRE-dec countdown
    ram.setU16(P.popup, u16(popup - 1));                // $2845CC / $28476A subq.w #$1
    const d0 = ram.u16(P.popupVal);                     // $2845D2 / $284770 -> D0
    const d6 = ram.u16(P.popupIdx);                     // $2845DA -> D6 (PRE-inc)
    ram.setU16(P.popupIdx, u16(ram.u16(P.popupIdx) + 1));   // $2845E0 / $28477E addq.w #$1
    let d1lo = 0x40;                                    // $2845E6 move.w #$40,D1
    const d3 = u16(popup - 1);                          // $2845EA countdown POST-dec
    if (d3 < 0x2a) {                                    // $2845F0 cmpi.w #$2a / bcc
      d1lo = u16(0x40 + (u16(d3 - 0x2a) << 7));         // subi / lsl.w #7 / add.w D3,D1
    }
    const d2 = ram.u16(P.popupSpeed);                   // $2845FE -> D2 (PRE-dec)
    if (d2 !== 0) {                                     // $284604 beq
      ram.setU16(P.popupSpeed, u16(d2 - 1));            // $284606 / $2847A4 subq.w #$1
    }
    // $28460C move.w #$7,D4 / $284610 bsr $2855B6.  D6 is PRE-inc and D2 PRE-dec,
    // matching what the ROM body sees; the body sets D1's hi word to $4FC0.
    chainPopup2855B6(ram, rom, ctx, d0, d1lo, d2, 7, d6);
  }
  // ---- $284614 / $2847B2: **THE CHAIN METER**.
  const meter = ram.u16(P.meter);                       // move.w $81B5C0/$81B5EA,D6
  if (meter === 0) return;                              // beq $28465C / $2847FA
  let decrement = true;
  if (ram.u16(P.hyper) !== 0) {                         // $28461C / $2847BA tst.w / beq
    const reload = ram.u8(P.subReload);
    if (reload !== 0) {
      note(ctx, SUBTICK_IS_A_NO_OP, `$${P.subReload.toString(16).toUpperCase()} `
        + `is $${reload.toString(16)}, NOT ZERO -- recon 38 4.4's absolute census `
        + 'said every write to it writes zero and could not rule out a BASED '
        + 'write. It has just been ruled IN, and the hyper really does throttle '
        + 'the chain drain');
    }
    const t = (ram.u8(P.subTick) - 1) & 0xff;           // $284624 / $2847C2 subq.b #$1
    ram.setU8(P.subTick, t);
    if (t !== 0xff) decrement = false;                  // bcc $28464E / $2847EC
    else ram.setU8(P.subTick, reload);                  // $28462C / $2847CA move.b
  }
  if (decrement) {
    const m = u16(meter - 1);                           // **$284636 / $2847D4**
    ram.setU16(P.meter, m);
    ctx?.hudEvent?.('meter-', P.who, m);
    if (m === 0) {                                      // bne $28464E / $2847EC
      ram.setU32(P.accA, 0);                            // $284640 / $2847DE move.l D0
      ram.setU32(P.accB, 0);                            // $284646 / $2847E4
      ctx?.hudEvent?.('meter0', P.who, 0);
      return;                                           // bra $28465C / $2847FA
    }
  }
  // $2859DC: THE CHAIN-METER BAR. D1/D4 from the caller ($28464E/$2847EC),
  // D6 = the pre-decrement meter (the value read at $284614/$2847B2).
  const d1bar = P.who === 0 ? 0x5bc00000 : 0x5bc03400;     // $28464E / $2847EC
  const d4bar = P.who === 0 ? 0x0009 : 0x4009;             // $284654 / $2847F2
  chainBar2859DC(ram, rom, ctx, d1bar, d4bar, meter);      // $284658 / $2847F6 bsr
}

/** `$284A3E` -- **THE BOSS HP BAR**.  `movea.l $81B62A,A0 / move.l (A0),D7`
 *  follows a pointer the cartridge writes at `$2927BA`, inside the boss init
 *  tail `src/initbody.js` does not run (see `BOSS_TAIL`).  So in this port the
 *  pointer is NULL and the port REFUSES BY ADDRESS rather than reading main RAM
 *  at 0 -- which would be a fabrication, and a plausible one: `ram.u32(0)`
 *  returns the top of the RAM image and would draw a bar. */
function bossBar284A3E(ram, ctx) {
  const ptr = ram.u32(HUDRAM.bossHpPtr);                // $284A3E movea.l $81B62A,A0
  if (ptr === 0) {
    unreached(HUD.bossBar, 'THE BOSS HP BAR: $284A3E movea.l $81B62A,A0 / move.l '
      + '(A0),D7 and $81B62A IS ZERO. Its ONE writer is $2927BA, inside the tail '
      + `of the boss init body $2926E2 -- $${BOSS_TAIL.toString(16).toUpperCase()
      }..$2927F4, which src/initbody.js stops short of (it ends after $29272E `
      + 'jsr $259554 and five notes). W63 found the fall-through and did NOT fix '
      + 'it: the tail also runs $294AD6/$294EEA/$294F0A, three unported boss '
      + 'routines. Port the tail with them; do not zero-fill here');
  }
  const d7 = ram.u32(ptr);                              // $284A44 move.l (A0),D7
  if (d7 & 0x80000000) return;                          // $284A46 bmi.w $284AB6
  if (d7 <= 0x6fb8                                      // $284A4E cmpi.l #$6FB8 / bhi
    && (ram.u16(HUDRAM.loop) === 0                      // $284A56 tst.w $813098 / beq
      || ram.u16(HUDRAM.stage) !== 4)) {                // $284A5E cmpi.w #$4 / beq
    const d2 = ram.u16(HUDRAM.laserRec);                // $284A6C move.w $811F72,D2
    if ((d2 & 0x8000) === 0 || (d2 & 1) === 0) {        // $284A72 bpl / $284A74 btst #$0
      const had = ram.u8(HUDRAM.bossHpLatch) & 0x01;    // $284A7A bset.b #$0
      ram.setU8(HUDRAM.bossHpLatch, ram.u8(HUDRAM.bossHpLatch) | 0x01);
      if (!had) ctx.soundPost?.(0x28ca7a);              // WAVE A: BGM id=$40, boss-warning ($284A84)
    }
  }
  draw(ctx, 0x23fa96);                                  // $284A8C..$284AB4, the bar
}

/** The two players' score rows, drawn from six places in the banner. */
function bothScoreRows(ram, rom, ctx) {
  if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) scoreRow285C62(ram, rom, ctx, 0, 0, 0); // $284C02 bsr $285C62
  if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) scoreRow285C62(ram, rom, ctx, 1, 0, 0); // $284C16 bsr $285DDC
}

/** `$2847FE..$284A B4` -- **THE BOSS-WARNING BANNER**, on `$81B61E`'s eight
 *  state bits.  DEAD in this port: its only gate is `$8130F9` bit 0, whose one
 *  producer is inside `BOSS_TAIL`. */
function bannerBoss28480A(ram, rom, ctx) {
  const F = () => ram.u8(HUDRAM.bannerFlagsBoss);
  const setF = (v) => ram.setU8(HUDRAM.bannerFlagsBoss, v);
  if (F() & 0x80) { bothScoreRows(ram, rom, ctx); bossBar284A3E(ram, ctx); return; }  // $28480A bmi
  if (F() & 0x10) {                                     // $284814 btst #$4 / bne $2849A6
    bothScoreRows(ram, rom, ctx);                       // $2849AA / $2849BE
    const t = u16(ram.u16(HUDRAM.bannerTimer) + 1);     // $2849D2 addq.w #$1
    ram.setU16(HUDRAM.bannerTimer, t);
    if (t & 0x8000) return;                             // $2849D8 bmi.w $284AB6
    draw(ctx, 0x23fa96);                                // $2849DC..$2849F8, the dbra
    if (t !== 0x6f) return;                             // $2849FC cmpi.w #$6F / bne
    setF(F() | 0x80);                                   // $284A08 bset #$7
    bossBar284A3E(ram, ctx);                            // $284A10 bra.b $284A3E
    return;
  }
  if (F() & 0x08) {                                     // $284820 btst #$3 / bne $2848E4
    const t = u16(ram.u16(HUDRAM.bannerTimer) - 1);     // $2848F6 subq.w #$1
    ram.setU16(HUDRAM.bannerTimer, t);
    if (t & 0x8000) {                                   // $2848FC bcs.b $28494A
      setF(F() | 0x10);                                 // $28494A bset #$4
      panel284FD2(ram, rom, ctx);                            // $284952 bsr $284FD2
      ram.setU16(HUDRAM.bannerTimer, 0xffe2);           // $284956
      draw(ctx, 0x240dc2);                              // $284970
      bothScoreRows(ram, rom, ctx);                     // $28497A / $28498E
      return;
    }
    draw(ctx, 0x23fa96);                                // $28490E
    bothScoreRows(ram, rom, ctx);                       // $28491A / $28492E
    panel284FD2(ram, rom, ctx);                              // $284942 bsr $284FD2
    return;
  }
  // ---- $28482C: the FIRST frame.
  const had0 = F() & 0x01;
  setF(F() | 0x01);                                     // $28482C bset #$0
  if (!had0) {
    ram.setU16(HUDRAM.bannerTimer, 0x32);               // $284836
    ram.setU16(HUDRAM.bannerSubB, 0x08);                // $28483E
    ram.setU16(HUDRAM.bannerSubA, 0x08);                // $284846
    const had1 = F() & 0x02;
    setF(F() | 0x02);                                   // $28484E bset #$1
    const had2 = had1 ? F() & 0x04 : 0;
    if (had1) setF(F() | 0x04);                         // $284858 bset #$2
    if (had1 && had2) {
      draw(ctx, 0x287a7a); draw(ctx, 0x287a92);         // $284862 / $284868
      draw(ctx, 0x24150a); draw(ctx, 0x24150a);         // $284878 / $284888
    } else {
      setF(F() & ~0x01);                                // $284890 bclr #$0
    }
  }
  { // $2848A6: D6 = (bannerTimer - $32) << 7, the slide offset
    const d6 = u16(i16(ram.u16(HUDRAM.bannerTimer) - 0x32) << 7); // $2848A6/$2848AC
    bannerPanel284F72(ram, rom, ctx, d6);               // $2848B2 bsr
    bannerPanel284FA2(ram, rom, ctx, d6);               // $2848B6 bsr
  }
  panel284FD2(ram, rom, ctx);                                // $2848BA bsr $284FD2
  ram.setU16(HUDRAM.bannerTimer,                        // $2848BE subq.w #$1
    u16(ram.u16(HUDRAM.bannerTimer) - 1));
  if (ram.u16(HUDRAM.bannerTimer) !== 0x11) return;     // $2848C4 cmpi.w #$11 / bne
  setF(F() | 0x08);                                     // $2848D0 bset #$3
  ram.setU16(HUDRAM.bannerTimer, 0x38);                 // $2848D8
}

/** `$284B6C..$284CEE` -- **THE STAGE-CLEAR BANNER**, on `$81B61F`.  Reached by
 *  `$2847FE btst #$3,$8130F8`, i.e. **the arm W62's `$242958 bset #$3,$8130F8`
 *  opens at the stage end** -- and it is the one a run in this port walks.
 *  Returns 'rejoin' on `$284B72 bmi.w $2844BE`, which goes BACK to the P1
 *  block in the same frame; a port that returned instead would stop both chain
 *  meters for the rest of the stage. */
function bannerClear284B6C(ram, rom, ctx) {
  const F = () => ram.u8(HUDRAM.bannerFlagsClear);
  const setF = (v) => ram.setU8(HUDRAM.bannerFlagsClear, v);
  if (F() & 0x80) return 'rejoin';                      // $284B6C tst.b / bmi.w $2844BE
  if (F() & 0x08) {                                     // $284B76 btst #$3 / bne $284C48
    if (ram.u16(HUDRAM.itemCount) !== 0) {              // $284C48 tst.w $81B610 / beq
      if (ram.u16(HUDRAM.bannerTimer) !== 0) {          // $284C52 / $284C58 beq
        ram.setU16(HUDRAM.bannerTimer,                  // $284C5A subq.w #$1
          u16(ram.u16(HUDRAM.bannerTimer) - 1));
      }
      { // $284C60: D6 = -(bannerTimer << 6), the slide offset
        const d6 = u16(i16(-(ram.u16(HUDRAM.bannerTimer) << 6))); // $284C60/$284C68
        bannerPanel284F72(ram, rom, ctx, d6);           // $284C6A bsr
        bannerPanel284FA2(ram, rom, ctx, d6);           // $284C6E bsr
      }
      panel2851D2(ram, rom, ctx);                            // $284C72 bsr $2851D2
      return null;
    }
    // ---- $284C7A: the banner is FINISHED.
    setF(F() | 0x80);                                   // $284C7A bset #$7
    ram.setU16(HUDRAM.popupTimerP1, 0);                 // $284C82 clr.w $81B5C2
    ram.setU16(HUDRAM.popupTimerP2, 0);                 // $284C88 clr.w $81B5EC
    ram.setU16(HUDRAM.p1.popup, 0);                     // $284C8E clr.w $81B5C8
    panel2851D2(ram, rom, ctx);                              // $284C94 bsr $2851D2
    // W240: both of these were counted and both were available -- `bombStock287ABE`
    // covers $287ABE and $287AF0 (W118) and `txPrint240DC2` covers $240DC2 (W116).
    // The text's registers are the cartridge's own, and the two sides differ only in
    // their column: $284CAA #$200 against $284CD6 #$1400.
    if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) {            // $284C98 / $284C9E bmi
      bombStock287ABE(ram, rom, ctx, 0);                // $284CA0 jsr $287ABE
      txPrint240DC2(ram, 0x00d4, 0x0200, 0x0002, 0x0005, 0x054f000a);  // $284CA6..$284CBC
    }
    if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) {            // $284CC2 / $284CC8 bmi
      bombStock287ABE(ram, rom, ctx, 1);                // $284CCC jsr $287AF0
      txPrint240DC2(ram, 0x00d4, 0x1400, 0x0002, 0x0005, 0x054f000a);  // $284CD2..$284CE8
    }
    return null;
  }
  // ---- $284B82: the FIRST frame.
  const had0 = F() & 0x01;
  setF(F() | 0x01);                                     // $284B82 bset #$0
  if (!had0) {
    ram.setU16(HUDRAM.bannerTimer, 0x38);               // $284B8C
    ram.setU16(HUDRAM.bannerSubB, 0x10);                // $284B94
    ram.setU16(HUDRAM.bannerSubA, 0x08);                // $284B9C
    const had1 = F() & 0x02;
    setF(F() | 0x02);                                   // $284BA4 bset #$1
    const had2 = had1 ? F() & 0x04 : 0;
    if (had1) setF(F() | 0x04);                         // $284BAE bset #$2
    if (had1 && had2) draw(ctx, 0x240ebc);              // $284BC4 jsr
    else setF(F() & ~0x01);                             // $284BCC bclr #$0
  }
  panel2851D2(ram, rom, ctx);                                // $284BD4 bsr $2851D2
  draw(ctx, 0x23fa96);                                  // $284BFA
  bothScoreRows(ram, rom, ctx);                         // $284C12 / $284C26
  const t = u16(ram.u16(HUDRAM.bannerTimer) - 1);       // $284C2A subq.w #$1
  ram.setU16(HUDRAM.bannerTimer, t);
  if (t !== 0) return null;                             // $284C30 bne.w $284AB6
  setF(F() | 0x08);                                     // $284C34 bset #$3
  ram.setU16(HUDRAM.bannerTimer, 0x41);                 // $284C3C
  return null;
}

/** `$2847FE` -- which banner.  `$8130F8` bit 3 is `$242958`'s, THE STAGE
 *  ADVANCE, so bit 3 SET means the stage-clear banner and bit 3 CLEAR the
 *  boss-warning one. */
function banner2847FE(ram, rom, ctx) {
  if (ram.u8(HUDRAM.flags8) & 0x08) return bannerClear284B6C(ram, rom, ctx);   // $2847FE btst #$3
  bannerBoss28480A(ram, rom, ctx);
  return null;
}

/** `$284AB6..$284B6A` -- the ITEM / EXTEND counter tail and `$284B5E`'s exit
 *  into the tally.  Gated on `$8130F8` bit 2, which only `$29279C` sets, so in
 *  this port the counter is dead; `BOSS_TAIL` says exactly why. */
function extendCounter284AB6(ram, rom, ctx) {
  if (ram.u8(HUDRAM.flags8) & 0x04) {                   // $284AB6 btst #$2 / beq.w $284B5E
    if (i16(ram.u16(HUDRAM.itemCount)) < 0) {           // $284AC2 tst.w / bpl
      ram.setU16(HUDRAM.itemDir, u16(ram.u16(HUDRAM.itemDir) - 1));   // $284ACA subq.w
    } else {
      ram.setU16(HUDRAM.itemDir, u16(ram.u16(HUDRAM.itemDir) + 1));   // $284AD2 addq.w
    }
    if (ram.u8(HUDRAM.flags8) & 0x40) {                 // $284AD8 btst #$6 / bne $284B2E
      if (ram.u16(HUDRAM.itemCount) !== 0               // $284B2E tst.w / beq
        && i16(ram.u16(HUDRAM.itemDir)) >= 0) {         // $284B36 tst.w / bmi
        ram.setU16(HUDRAM.itemKind, 7);                 // $284B3E
        ram.setU16(HUDRAM.itemTimer, 0);                // $284B46 clr.w
        itemRow2857B4(ram, rom, ctx);                   // $284B4C bsr
      }
    } else if (i16(ram.u16(HUDRAM.attract2)) < 0) {     // $284AE2 tst.w $81308E / bmi
      ram.setU16(HUDRAM.itemCount, 0);                  // $284B52 clr.w
      ram.setU16(HUDRAM.itemTimer, 0);                  // $284B58 clr.w
    } else if (ram.u16(HUDRAM.itemTimer) !== 0) {       // $284AEC tst.w / beq.w $284B5E
      const t = u16(ram.u16(HUDRAM.itemTimer) - 1);     // $284AF6 subq.w #$1
      ram.setU16(HUDRAM.itemTimer, t);
      if (t !== 0) {                                    // $284AFC bne.b $284B4C
        itemRow2857B4(ram, rom, ctx);
      } else {
        ram.setU16(HUDRAM.itemKind, 8);                 // $284AFE
        ram.setU16(HUDRAM.itemTimer, 0x0a);             // $284B06
        if (ram.u16(HUDRAM.attract) === 0) {            // $284B0E tst.w $81308C / bne
          ram.setU16(HUDRAM.itemTimer, 0x12);           // $284B16
        }
        const n = u16(ram.u16(HUDRAM.itemCount) - 1);   // $284B1E subq.w #$1
        ram.setU16(HUDRAM.itemCount, n);
        if (n & 0x8000) {                               // $284B24 bmi.b $284B52
          ram.setU16(HUDRAM.itemCount, 0);
          ram.setU16(HUDRAM.itemTimer, 0);
        } else if (n === 0) {                           // $284B26 bne.b $284B4C
          grant2877B8(ram);                             // $284B28 bsr $2877B8
        } else {
          itemRow2857B4(ram, rom, ctx);                 // $284B4C bsr
        }
      }
    }
  }
  if (ram.u8(HUDRAM.flags8) & 0x08) tally2853D2(ram, ctx);   // $284B5E btst #$3 / bne
}

/** `$2877B8` -- five instructions, three writes.  `$284B28 bsr`. */
function grant2877B8(ram) {
  ram.setU16(HUDRAM.itemCount, 0xffff);                 // $2877B8 move.w #$FFFF
  ram.setU16(HUDRAM.itemDir, 0x17);                     // $2877C0 moveq #$17,D0 / $2877C2
  ram.setU16(HUDRAM.itemTimer, 0x17);                   // $2877C8
}

/** `$2853D2` -- THE STAGE-CLEAR TALLY's front door and one-shot init.  Reached
 *  once `$8130F9` bit 3 is set (its sole producer is `$28DB52` in the ported
 *  result-screen `result28D9AA`, F3).  Bit 4 is the one-shot: on the first frame
 *  it seeds the hold countdown `$81B614 := 7` and BCD-seeds the bonus
 *  accumulator `$81B616 := $81B61A << 4` (the medal accumulator the stage
 *  populated).  Then it falls into the body `$285400`.
 *
 *  W124 PORTED the body (was `unreached(0x2853dc)` since W62).  The body drains
 *  `$81B610` through the `$32/$64/$96` medal tiers, BCD-compounds `$81B616`, and
 *  when `$81B610` underflows `$FFFF -> $FFFE` the fall-through at `$285496
 *  bset #1,$8130F9` fires -- the SOLE producer of bit 1, which the result
 *  screen's F8 waits on.  Clearing DEV-1. */
function tally2853D2(ram, ctx) {
  if ((ram.u8(HUDRAM.flags9) & 0x08) === 0) return;     // $2853D2 btst #$3 / beq rts
  if ((ram.u8(HUDRAM.flags9) & 0x10) === 0) {           // $2853DC bset #$4 / bne body
    ram.setU8(HUDRAM.flags9, ram.u8(HUDRAM.flags9) | 0x10);
    ram.setU16(HUDRAM.tallyHold, 7);                    // $2853E6
    const seed = (ram.u32(HUDRAM.tallyMedalAcc) << 4) >>> 0; // $2853EE lsl.l #4
    bcdAdd(ram, HUDRAM.tallyMedalAcc, seed);            // $2853F6 -> $81B616 += seed
  }
  tallyBody285400(ram, ctx);
}

/** `$285400..$285568` -- the tally body.  Needs `$8130F9` bit 2 (medal walk
 *  done, from `$28DE16`) and the absence of bit 1 (not yet complete).  Drains
 *  `$81B610` through the medal tiers and produces `$285496 bset #1` when
 *  `$81B610` underflows `$FFFF -> $FFFE`. */
function tallyBody285400(ram, ctx) {
  if ((ram.u8(HUDRAM.flags9) & 0x04) === 0) return;     // $285400 btst #$2 / beq exit
  if ((ram.u8(HUDRAM.flags9) & 0x02) !== 0) return;     // $28540C btst #$1 (done)
  if (tallyButton28556C(ram)) {                          // $285418 bsr $28556C
    tallyFastDrain2854C8(ram); return;                   // $28541C bcs $2854C8
  }
  const hold = u16(ram.u16(HUDRAM.tallyHold) - 1);       // $285420 subq.w #1
  ram.setU16(HUDRAM.tallyHold, hold);
  if (hold !== 0xffff) { tallyAward28551E(ram, ctx); return; } // $285426 bcc -> $28551E
  // ---- recompute arm (hold underflowed, carry set): $28542A.. ----
  if (ram.u32(HUDRAM.tallyBonus) !== 0) note28C6C6(ctx); // $28542A tst.l / $285434 jsr
  // $28543A moveq #$10,D0 ; $28543C sub.w $81B610,D0 ; $285442 bmi.  The sub is
  // a SIGNED 16-bit compare: D0 = $10 - b610, and bmi tests bit 15 of the result.
  // For b610 = $FFFF (signed -1): $10 - (-1) = $11 (positive, hold = 5); for
  // b610 = $20: $10 - $20 = -$10 (negative, hold = 0).  NOT an unsigned compare.
  const sub = u16(0x10 - ram.u16(HUDRAM.itemCount));
  const d0 = (sub & 0x8000) ? 0 : u16((sub >>> 2) + 1);  // $285444 lsr / addq
  ram.setU16(HUDRAM.tallyHold, d0);                      // $28544C
  let d7 = 0;                                            // $285452 moveq #0,d7
  // tier checks are UNSIGNED (cmpi.w then bcs = carry = unsigned-less-than)
  if (ram.u16(HUDRAM.itemCount) >= 0x32) {               // $285454 cmpi/bcs
    ram.setU16(HUDRAM.itemCount, u16(ram.u16(HUDRAM.itemCount) - 1)); d7 = 1;
  }
  if (ram.u16(HUDRAM.itemCount) >= 0x64) {               // $285466
    ram.setU16(HUDRAM.itemCount, u16(ram.u16(HUDRAM.itemCount) - 1)); d7 = 2;
  }
  if (ram.u16(HUDRAM.itemCount) >= 0x96) {               // $285478
    ram.setU16(HUDRAM.itemCount, u16(ram.u16(HUDRAM.itemCount) - 1)); d7 = 3;
  }
  // $28548A subq.w #1, $81B610 (always).  The branch fan-out below is the crux:
  // beq (b610==0) -> fast drain; bpl (result positive) -> medal drain; bcs
  // (borrow, old was 0 -> $FFFF) -> hold=8 arm; FALL-THROUGH (negative result,
  // NO borrow) -> $285496.  The fall-through is what produces bit 1: it fires the
  // first frame b610 (after the tier subqs) is a non-zero negative value, e.g.
  // $FFFF -> tier-drain -> $FFFC -> subq -> $FFFB (negative, no borrow).
  const preSubq = ram.u16(HUDRAM.itemCount);
  const after = u16(preSubq - 1);
  ram.setU16(HUDRAM.itemCount, after);
  const borrow = (preSubq === 0);                        // C flag from the subq
  if (after === 0) { tallyFastDrain2854C8(ram); return; } // $285490 beq $2854C8
  if ((after & 0x8000) === 0) { tallyMedalDrain2854E0(ram, d7); return; } // $285492 bpl
  if (borrow) {                                           // $285494 bcs -> $2854B6
    ram.setU16(HUDRAM.tallyHold, 8);                      // $2854B6
    ram.setU16(HUDRAM.itemDir, 0xffff);                   // $2854BE
    tallyAward28551E(ram, ctx);                           // $2854C6 bra $28551E
    return;
  }
  // ---- $285496 FALL-THROUGH: the SOLE producer of $8130F9 bit 1 ----
  ram.setU8(HUDRAM.flags9, ram.u8(HUDRAM.flags9) | 0x02); // $285496 bset #$1
  ram.setU16(HUDRAM.itemCount, 0);                        // $2854A0
  ram.setU16(HUDRAM.tallyHold, 0);                        // $2854A6
  ram.setU32(HUDRAM.tallyBonus, 0);                       // $2854AC
}

/** `$28551E` -- the award arm.  Reached every frame the hold did NOT underflow.
 *  Awards `$81B616 >> 4` to each live player's score (`$28614A`/`$286154`) ONLY
 *  when `$81B610 == 0` AND `$81B614 == 8`, then zeroes `$81B616`. */
function tallyAward28551E(ram, ctx) {
  const ic = ram.u16(HUDRAM.itemCount);                  // $28551E tst.w
  if (ic !== 0 && (ic & 0x8000) === 0) return;           // $285524 beq / $285526 bpl (ic>0 -> exit)
  if (ram.u16(HUDRAM.tallyHold) !== 8) return;           // $28552A cmpi #$8 / $285532 bne
  const d1 = ram.u32(HUDRAM.tallyBonus);                 // $285536
  if (d1 === 0) return;                                  // $28553C beq
  note28C6C6(ctx);                                       // $28553E jsr $28C6C6
  const d0 = d1 >>> 4;                                   // $285546 lsr.l #4
  if ((ram.u16(0x8103e6) & 0x8000) !== 0) scorePending(ram, 1, d0); // $285550 bsr $28614A
  if ((ram.u16(0x810448) & 0x8000) !== 0) scorePending(ram, 2, d0); // $28555C bsr $286154
  ram.setU32(HUDRAM.tallyBonus, 0);                      // $285562
}

/** `$2854C8` -- the fast-drain / zero-count entry: set `$81B610 := $FFFF` and the
 *  hold/dir so the NEXT frame's `subq` makes `$FFFE` and trips `$285496`. */
function tallyFastDrain2854C8(ram) {
  ram.setU16(HUDRAM.itemCount, 0xffff);                  // $2854C8
  ram.setU16(HUDRAM.itemDir, 0x17);                      // $2854D0 $81B60E
  ram.setU16(HUDRAM.tallyHold, 0x12);                    // $2854D8
  tallyMedalDrain2854E0(ram, 0);
}

/** `$2854E0..$28551A` -- the medal-tier BCD compound: add `$81B61A >> 8` into
 *  the `$81B616` accumulator `5 * (d7+1)` times (the dbra at `$28551A` loops the
 *  five `bcdAdd`s `d7+1` times).  `$286626` is `bcdAdd` (src/score.js). */
function tallyMedalDrain2854E0(ram, d7) {
  const addend = (ram.u32(HUDRAM.tallyMedalAcc) >>> 8) >>> 0; // $2854E0/$2854E6 lsr.l #8
  for (let n = 0; n <= d7; n++) {                        // $28551A dbra d7
    for (let k = 0; k < 5; k++) {                        // $2854E8..$285516 (5x bsr $286626)
      bcdAdd(ram, HUDRAM.tallyMedalAcc, addend);         // -> $81B616
    }
  }
}

/** `$28556C` -- the button read.  Returns true (C set) when a button (mask $70)
 *  is held, which fast-drains the tally.  The port reads the raw input mirror
 *  `$803970` for each live player (the gate holds fire, which is in the $70
 *  mask), matching the `$23D16C`/`$23D17E` reads. */
function tallyButton28556C(ram) {
  const ic = ram.u16(HUDRAM.itemCount);                  // $28556C
  if ((ic & 0x8000) !== 0 || ic === 0) return false;     // $285572 subq/bpl (ic==0 -> C clear)
  let d0 = 0;                                            // $28557A moveq #0
  if ((ram.u16(0x8103e6) & 0x8000) !== 0) d0 |= ram.u16(0x803970); // $28557C/$285584 P1
  if ((ram.u16(0x810448) & 0x8000) !== 0) d0 |= ram.u16(0x803970); // $28558A/$285592 P2
  if ((d0 & 0x70) === 0) return false;                   // $28559C andi #$70 / beq
  ram.setU16(HUDRAM.itemCount, 0);                       // $2855AA clr $81B610
  return true;                                           // $2855B0 ori #$1,sr (C set)
}

/** `$28C6C6` -- the bonus-event sound cue (no arithmetic). WAVE A: now posts. */
export function note28C6C6(ctx) {
  ctx?.soundPost?.(0x28c6c6);  // WAVE A: BGM id=$19, tally bonus-event ($285434/$28553E)
}

/** Adapts one HUD player slot to the shared hyper implementation and stock redraw. */
function stepPlayerHyper(ram, ctx, who) {
  stepHyper285A12(ram, ctx.rom, ctx, who !== 0,
    player => hyperStock286ED6(ram, ctx.rom, ctx, player));
}

/** `$28444E` -- the whole thing, in ROM order. */
export function perFrame28444E(ram, rom, ctx) {
  cursorA285F8A(ram, rom);                              // $28444E bsr.w $285F8A
  cursorB285F52(ram, rom);                              // $284452 bsr.w $285F52
  if (ram.u16(HUDRAM.slideFlag) !== 0) {                // $284456 tst.w $81B6EE / bne
    if (!slideIn284CF2(ram, rom, ctx)) return;           // $28445C bra.w $284CF2
    // $284D2A bra.w $284460 -- the settled arm RE-ENTERS here, same frame.
  }
  stepPlayerHyper(ram, ctx, 0);                           // $284460 bsr.w $285A12
  stepPlayerHyper(ram, ctx, 1);                           // $284464 bsr.w $285B3C
  drainItems284468(ram);                                // $284468..$2844A0
  gates2844A6(ram, ctx, rom);                            // $2844A6..$284B6A
}

/** `$284468..$2844A0` -- `$81B5B4` -> `$81B610`, **at most FOUR per frame**,
 *  written out as four copies of the same two instructions rather than a loop.
 *  That is not a style choice: the fourth copy has NO `beq` after it, so the
 *  fall-through leaves through `$2844A6` whatever `$81B5B4` then holds.  A
 *  `do..while` would drain a fifth. */
export function drainItems284468(ram) {
  if (ram.u16(HUDRAM.itemPending) === 0) return;        // $284468 tst.w / beq $2844A6
  for (let i = 0; i < 4; i++) {
    ram.setU16(HUDRAM.itemCount, u16(ram.u16(HUDRAM.itemCount) + 1));   // addq.w #$1
    const n = u16(ram.u16(HUDRAM.itemPending) - 1);                     // subq.w #$1
    ram.setU16(HUDRAM.itemPending, n);
    if (n === 0 && i < 3) return;    // beq $2844A6 -- the FOURTH copy has none
  }
}

/** `$2844A6..$284B6A` -- the three gates and everything below them. */
export function gates2844A6(ram, ctx, rom = null) {
  if ((ram.u8(HUDRAM.flags9) & 0x01)                    // $2844A6 btst #$0,$8130F9 / bne
    || (ram.u8(HUDRAM.dfFlags) & 0x08)) {               // $2844B2 btst #$3,$81DF1E / bne
    if (banner2847FE(ram, rom, ctx) !== 'rejoin') {       // bne.w $2847FE
      extendCounter284AB6(ram, rom, ctx);                    // every arm ends bra.w $284AB6
      return;
    }
    // $284B72 bmi.w $2844BE -- REJOIN the skeleton at the P1 block.
  }
  ctx?.privateScoreFrameHook?.({ phase: 'meter', ctx });
  if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) {              // $2844BE tst.w $8130BE / bmi
    playerBlock(ram, rom, ctx, HUDRAM.p1);               // $2844C8..$28465A
  }
  if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) {              // $28465C tst.w $8130C0 / bmi
    playerBlock(ram, rom, ctx, HUDRAM.p2);               // $284666..$2847F8
  }
  extendCounter284AB6(ram, rom, ctx);                        // $284AB6
}

// ===========================================================================
// $28D520 -- THE OBJECT
// ===========================================================================

/** `$240F62[0] = $28D520`, priority `$0009`.  THREE states, and recon 38 2.1
 *  described the body as "four instructions and two calls" without naming any:
 *
 *      $28D520 tst.b ($2,A5)      / beq.b $28D502    state 0 -> INIT
 *      $28D526 cmpi.b #$2,($2,A5) / beq.b $28D512    state 2 -> SELF-DESTROY
 *      $28D52E jsr $2842B0                           state 1 -> the drain
 *      $28D534 jsr $28444E                           ...and the per-frame ledger
 *
 *  `$81B6F0` is the object's own "I exist" word: `$28D508` raises it, `$28D512`
 *  drops it, and its readers are `$287286 tst.w $81B6F0` and (W114/W115) the
 *  score-digit flush `$185DC4 tst.w $81B6F0`, which gates on it to mean "only
 *  flush while the HUD is alive".
 *  [M] the shipped seed has object SLOT 7 = type 0 with `($2,A5) = 1`, so the
 *  port lands in state 1 on its first frame -- it simply was not dispatching
 *  it, and `runObjectDriver` counted the miss under `$240F62 + 0` every frame. */
export function makeHudObject(rom) {
  return makeHudObjectWithResources(rom, BLACK_HUD_RESOURCES);
}

// ===========================================================================
// W273 -- `$2600D8`'S SEVEN ROWS PER SIDE
//
// `$2600D8` is the stage-clear score tally's poster, and its two arms call SEVEN
// routines each. TWO of the seven were already here and W271 discovered they had
// never been called:
//
//   $286FA6 / $286FB4   the EXTEND THRESHOLD seed          this section
//   $287148 / $287198   the SCORE DRAIN reset              this section
//   $2871E8 / $287210   the CHAIN METER clear              this section
//   $287238 / $28725E   the DIGIT-STATE bump, capped at 9  this section
//   $287AAA / $287ADC   the tally's own TEXT ROW           this section
//   $286ED6 / $286F3E   the hyper stock row                W113, called W271
//   $2878CC / $28795C   the lives row                      W116, called W271
//
// EVERY RAM ADDRESS THE FIVE TOUCH WAS ALREADY NAMED IN `HUDRAM`, which is what
// says they are the same family: `digitsP1` is documented "9 records of stride
// $A" and `$287148` is the loop that SEEDS those nine; `digitStateP1` and
// `$287238`'s counter are the same word; `$2871E8`'s 40-byte sweep is exactly
// the `p1` chain-meter block from `accA` through `chain`; `extendNextP1` and
// `extendIdxP1` are `$286FA6`'s two destinations. The port has been drawing all
// of it and initialising none of it.
//
// All five are two-arm bodies that differ only in their bases, so each is one
// body over a side table -- the shape `hyperStock286ED6` and `livesRow2878CC`
// already use.

/** `$286FA6` (P1) / `$286FB4` (P2) -- SEED THE EXTEND THRESHOLD FROM THE DIP.
 *
 *   286fa6: lea $81B4AC,A0 / lea $81B4B4,A1 / bra $286FC0
 *   286fb4: lea $81B4B0,A0 / lea $81B4B6,A1
 *   286fc0: moveq #0,D0 / move.b $80380D,D0 / add.w D0,D0 / add.w D0,D0
 *   286fcc: lea $2883FE,A2 / move.l (A2,D0.w),(A0) / move.w D0,(A1) / rts
 *
 * `extendStep286FDA` above is the STEP and has been ported since W63; this is
 * the seed it steps from, and W63's own comment says so ("`$286FA6`, the INIT
 * that seeds `$81B4AC`/`$81B4B4` from DIP `$80380D`, is NOT in this closure and
 * is not ported").
 *
 * **THE CURSOR IS THE BYTE OFFSET, NOT THE DIP.** `move.w D0,(A1)` stores D0
 * AFTER both `add.w`, so option 1 leaves `4` in `extendIdx`, not `1` -- which is
 * exactly what `extendStep286FDA` then wants, because it uses the same word as a
 * `(A5,D0.w)` byte index into `extendTable`. A port that stored the DIP would
 * read the wrong interval on every extend after the first.
 */
export function extendInit286FA6(ram, rom, ctx, who) {
  const addr = who === 0 ? 0x286fa6 : 0x286fb4;
  if (!rom) { note(ctx, addr, '$286FA6 the extend-threshold seed'); return; }
  const thr = who === 0 ? HUDRAM.extendNextP1 : HUDRAM.extendNextP2;
  const idx = who === 0 ? HUDRAM.extendIdxP1 : HUDRAM.extendIdxP2;
  // $286FC2 move.b $80380D,D0 -- a BYTE read, zero-extended by the `moveq #0`
  // before it, so no sign extension: this is not W270's trap.
  const d0 = (ram.u8(0x80380d) * 4) & 0xffff;             // $286FC8/$286FCA add.w twice
  ram.setU32(thr, rom.u32(HUD.firstThresholdTable + d0)); // $286FD2 move.l (A2,D0.w),(A0)
  ram.setU16(idx, d0);                                    // $286FD6 move.w D0,(A1)
}

/** `$287148` (P1) / `$287198` (P2) -- RESET THE SCORE DRAIN.
 *
 * Seeds the nine `stride $A` digit records `HUDRAM.digitsP1` already names, then
 * zeroes both total/overflow pairs and the hyper-shown byte:
 *
 *   moveq #0,D0 / move.l #$9040D8,D1 / moveq #0,D2 / moveq #0,D3
 *   lea $81B4C8,A0 / moveq #$8,D7
 *   28715c: move.w D0,(A0)+ / move.l D1,(A0)+ / move.w D2,(A0)+ / move.w D3,(A0)+
 *           addi.w #$100,D1 / dbra D7
 *
 * `moveq #$8,D7` with `dbra` is NINE passes, one per record, and $A bytes each.
 * `addi.w #$100,D1` is a WORD add on a longword register, so the destination
 * column steps and the high half never carries.
 *
 * **W385 CORRECTION TO THIS COMMENT.** It used to say the nine passes "land
 * exactly on `extraRecA` ($81B4C8 + 9*$A == $81B57C)". THE ARITHMETIC IS WRONG:
 * $81B4C8 + 9*$A is $81B522, which is `digitsP2`. The code does not rely on the
 * adjacency at all -- `$28716C lea $81B57C,A0` re-loads A0 outright, and so does
 * its sibling `$2870A8` below -- so the PORT was always right and only the
 * justification was false. Left corrected rather than deleted, because "the walk
 * ends where the next field starts" is exactly the kind of claim this project
 * keeps re-deriving (trap 8: find the bound in the code that reads it).
 */
export function scoreDrainReset287148(ram, who) {
  const p = who === 0
    ? { digits: HUDRAM.digitsP1, dest: 0x9040d8, extra: HUDRAM.extraRecA,
      total: HUDRAM.totalP1, total2: HUDRAM.total2P1,
      ovf: HUDRAM.ovfP1, ovf2: HUDRAM.ovf2P1, shown: HUDRAM.p1.hyperShown }
    : { digits: HUDRAM.digitsP2, dest: 0x9051d8, extra: HUDRAM.extraRecB,
      total: HUDRAM.totalP2, total2: HUDRAM.total2P2,
      ovf: HUDRAM.ovfP2, ovf2: HUDRAM.ovf2P2, shown: HUDRAM.p2.hyperShown };
  let a0 = p.digits;
  let d1 = p.dest >>> 0;
  for (let n = 0; n < 9; n++) {                         // moveq #$8,D7 / dbra
    ram.setU16(a0, 0);                                  // move.w D0,(A0)+  the dirty flag
    ram.setU32(a0 + 2, d1);                             // move.l D1,(A0)+  the destination
    ram.setU16(a0 + 6, 0);                              // move.w D2,(A0)+
    ram.setU16(a0 + 8, 0);                              // move.w D3,(A0)+
    a0 += 10;
    d1 = ((d1 & 0xffff0000) | u16((d1 & 0xffff) + 0x100)) >>> 0;  // addi.w #$100,D1
  }
  ram.setU16(p.extra, 1);                               // $287172 move.w #$1,(A0)+
  ram.setU32(p.total, 0);                               // $287178
  ram.setU32(p.total2, 0);                              // $28717E
  ram.setU16(p.ovf, 0);                                 // $287184
  ram.setU16(p.ovf2, 0);                                // $28718A
  ram.setU8(p.shown, 0);                                // $287190
}

// ===========================================================================
// W385 -- `$287084` (P1) / `$2870E6` (P2), THE SCORE ROW **INIT**
// ===========================================================================
// `$2603FE` calls one of these per side on the way out of the select screen (see
// `rank.js stagePair2603FE`), and they are `$287148`'s LONGER SIBLINGS: 25
// instructions each, pure RAM, and the first eleven are the same nine-record
// loop instruction for instruction. `$2870E4 rts` is immediately followed by
// `$2870E6`, and `$287146 rts` by `$287148`, so the four routines sit in one run.
//
//     287084  7000              moveq #$0,D0
//     287086  223c 009040D8     move.l #$9040D8,D1
//     28708C  7400              moveq #$0,D2
//     28708E  7600              moveq #$0,D3
//     287090  41f9 0081B4C8     lea $81B4C8,A0        digitsP1
//     287096  7e08              moveq #$8,D7          NINE passes (trap 2)
//     287098  30c0              move.w D0,(A0)+
//     28709A  20c1              move.l D1,(A0)+
//     28709C  30c2              move.w D2,(A0)+
//     28709E  30c3              move.w D3,(A0)+
//     2870A0  0641 0100         addi.w #$100,D1       WORD add on a LONG register
//     2870A4  51cf fff2         dbra D7,$287098
//     2870A8  41f9 0081B57C     lea $81B57C,A0        extraRecA -- RE-LOADED
//     2870AE  30fc 0001         move.w #$1,(A0)+
//     2870B2  20fc 009049D8     move.l #$9049D8,(A0)+
//     2870B8  30fc c030         move.w #$C030,(A0)+
//     2870BC  30c3              move.w D3,(A0)+
//     2870BE  7000              moveq #$0,D0
//     2870C0  23c0 0081B440     move.l D0,$81B440     totalP1
//     2870C6  23c0 0081B4A0     move.l D0,$81B4A0     total2P1
//     2870CC  33c0 0081B44C     move.w D0,$81B44C     ovfP1
//     2870D2  33c0 0081B4A8     move.w D0,$81B4A8     ovf2P1
//     2870D8  33c0 0081B49A     move.w D0,$81B49A     digitStateP1
//     2870DE  13c0 0081B596     move.b D0,$81B596     p1.hyperShown
//     2870E4  4e75              rts
//
// **THE TENTH RECORD'S DESTINATION IS THE LOOP'S NEXT COLUMN, AND THAT IS WHAT
// PINS IT.** The loop stores $9040D8, $9041D8 ... $9048D8 and leaves D1 holding
// $9049D8; `$2870B2`'s literal is that same $9049D8. `$2870E6`'s pair is
// $9051D8..$9059D8 with the literal $905AD8. So the two constants are not two
// facts to check separately -- either side's literal is the ninth column plus
// $100, which is why `extraRecB` is $905AD8 and not $9059D8.
//
// **WHAT IT ADDS OVER `$287148`.** Three more fields on the tenth record
// ($9049D8, $C030, 0) and `digitStateP1`. Everything else is identical. So this
// is the FULL init and `$287148` is the mid-game reset that leaves the row's
// destination and mode alone.
const SCOREINIT_287084 = Object.freeze([
  Object.freeze({ site: 0x287084, digits: 0x81b4c8, dest: 0x9040d8, extra: 0x81b57c,
    extraDest: 0x9049d8, total: 0x81b440, total2: 0x81b4a0, ovf: 0x81b44c,
    ovf2: 0x81b4a8, digitState: 0x81b49a, shown: 0x81b596 }),
  Object.freeze({ site: 0x2870e6, digits: 0x81b522, dest: 0x9051d8, extra: 0x81b586,
    extraDest: 0x905ad8, total: 0x81b444, total2: 0x81b4a4, ovf: 0x81b44e,
    ovf2: 0x81b4aa, digitState: 0x81b49e, shown: 0x81b597 }),
]);
/** `$2870B8 move.w #$C030,(A0)+` -- the tenth record's MODE word, the one field
 *  `$287148` does not touch. */
const SCOREINIT_MODE = 0xc030;

/** `$287084` (who = 0) / `$2870E6` (who = 1) -- see `SCOREINIT_287084`. */
export function scoreDrainInit287084(ram, who) {
  const p = SCOREINIT_287084[who === 0 ? 0 : 1];
  let a0 = p.digits;
  let d1 = p.dest >>> 0;
  for (let n = 0; n < 9; n++) {                         // moveq #$8,D7 / dbra -- NINE
    ram.setU16(a0, 0);                                  // move.w D0,(A0)+
    ram.setU32(a0 + 2, d1);                             // move.l D1,(A0)+
    ram.setU16(a0 + 6, 0);                              // move.w D2,(A0)+
    ram.setU16(a0 + 8, 0);                              // move.w D3,(A0)+
    a0 += 10;
    d1 = ((d1 & 0xffff0000) | u16((d1 & 0xffff) + 0x100)) >>> 0;  // addi.w #$100,D1
  }
  ram.setU16(p.extra, 1);                               // $2870AE move.w #$1,(A0)+
  ram.setU32(p.extra + 2, p.extraDest);                 // $2870B2 move.l #$9049D8,(A0)+
  ram.setU16(p.extra + 6, SCOREINIT_MODE);              // $2870B8 move.w #$C030,(A0)+
  ram.setU16(p.extra + 8, 0);                           // $2870BC move.w D3,(A0)+
  ram.setU32(p.total, 0);                               // $2870C0
  ram.setU32(p.total2, 0);                              // $2870C6
  ram.setU16(p.ovf, 0);                                 // $2870CC
  ram.setU16(p.ovf2, 0);                                // $2870D2
  ram.setU16(p.digitState, 0);                          // $2870D8 -- $287148 lacks this
  ram.setU8(p.shown, 0);                                // $2870DE
}

/**
 * `$287A5E` -- **ARM THE HUD SLIDE-IN**, 24 bytes, five instructions, no calls.
 *
 *     287A5E  0839 0000 008130F9   btst #$0,$8130F9
 *     287A66  6608                 bne.s $287A70
 *     287A68  33fc 0053 0081B620   move.w #$53,$81B620
 *     287A70  33fc 0001 0081B6EE   move.w #$1,$81B6EE
 *     287A78  4e75                 rts
 *
 * The brief that set W385 listed this as UNREAD. It is not unreadable; it is
 * five instructions, and both words it writes are already named in `HUDRAM`.
 *
 * **THE `bne.s` SKIPS ONE INSTRUCTION, NOT THE ROUTINE.** `$287A66 + 2 + $8` is
 * `$287A70`, so `$81B6EE` is set on BOTH arms and only the banner timer is
 * conditional. Reading it as an early-out would leave the HUD permanently in its
 * flown-in state whenever `flags9` bit 0 is up.
 *
 * `$8130F9` bit 0 is the stage-clear/banner flag `hud.js` already tests at
 * `$2878D8`, `$286EDE`, `$284CF2` and `$2844CC`; nothing in this port WRITES it,
 * so on every run the port can currently reach, the timer arm is taken.
 * `$81B620` is `bannerTimer`, counted down at `$284D38`; `$81B6EE` is
 * `slideFlag`, the word `$284456 tst.w` reads as "the HUD is still flying in" and
 * `$284D24`/`$284F6A` clear when it has landed.
 */
export function slideArm287A5E(ram) {
  return armHudSlideWithResources(ram, BLACK_HUD_RESOURCES);
}

function destroyHudObject(ram, id) {
  queueKill(ram, id);
}

function blackHudAfterDrain(_ram, _rom, ctx) {
  ctx?.privateScoreFrameHook?.({ phase: 'drain', ctx });
}

const BLACK_HUD_RAM_RESOURCES = Object.freeze({
  slideFlag: HUDRAM.slideFlag,
  flags9: HUDRAM.flags9,
  bannerTimer: HUDRAM.bannerTimer,
  objFlag: HUDRAM.objFlag,
});

export const BLACK_HUD_RESOURCES = Object.freeze({
  edition: 'black-label-b',
  entries: Object.freeze({ object: HUD.obj, init: HUD.objInit, destroy: HUD.objDestroy,
    drain: HUD.drain, frame: HUD.perFrame, slideArm: 0x287a5e }),
  object: Object.freeze({
    stateAt: 0x02, idAt: 0x4c, priority: 0x09,
    killTarget: HUD.kill, aliveFlag: HUDRAM.objFlag,
  }),
  ram: BLACK_HUD_RAM_RESOURCES,
  routines: Object.freeze({
    init: initScoreDigitDests,
    destroy: destroyHudObject,
    drain: drain2842B0,
    afterDrain: blackHudAfterDrain,
    frame: perFrame28444E,
  }),
});

function requireHudResources(resources) {
  if (!resources || !Object.isFrozen(resources)
      || !Object.isFrozen(resources.entries) || !Object.isFrozen(resources.object)
      || !Object.isFrozen(resources.ram) || !Object.isFrozen(resources.routines)
      || !Number.isSafeInteger(resources.object.stateAt)
      || !Number.isSafeInteger(resources.object.idAt)
      || !Number.isSafeInteger(resources.object.priority)
      || !Number.isSafeInteger(resources.object.killTarget)
      || !Number.isSafeInteger(resources.object.aliveFlag)
      || resources.object.aliveFlag !== resources.ram.objFlag
      || !Number.isSafeInteger(resources.ram.slideFlag)
      || !Number.isSafeInteger(resources.ram.flags9)
      || !Number.isSafeInteger(resources.ram.bannerTimer)
      || !Number.isSafeInteger(resources.ram.objFlag)
      || typeof resources.routines.init !== 'function'
      || typeof resources.routines.destroy !== 'function'
      || typeof resources.routines.drain !== 'function'
      || typeof resources.routines.frame !== 'function') {
    throw new TypeError('HUD object needs a complete frozen edition resource graph');
  }
  return resources;
}

export function runHudDrainWithResources(ram, rom, ctx, suppliedResources) {
  const resources = requireHudResources(suppliedResources);
  return resources.routines.drain(ram, rom, ctx, resources);
}

export function runHudFrameWithResources(ram, rom, ctx, suppliedResources) {
  const resources = requireHudResources(suppliedResources);
  return resources.routines.frame(ram, rom, ctx, resources);
}

export function makeHudObjectWithResources(rom, suppliedResources) {
  const resources = requireHudResources(suppliedResources);
  return function hudObject(ram, a5, slot, ctx) {
    const state = ram.u8(a5 + resources.object.stateAt);
    if (state === 0) {
      ram.setU8(a5 + resources.object.stateAt, 1);
      ram.setU16(resources.ram.objFlag, 1);
      resources.routines.init(ram, rom, ctx, resources);
      return;
    }
    if (state === 2) {
      ram.setU16(resources.ram.objFlag, 0);
      resources.routines.destroy(ram, ram.u32(a5 + resources.object.idAt), ctx, resources);
      return;
    }
    runHudDrainWithResources(ram, rom, ctx, resources);
    resources.routines.afterDrain?.(ram, rom, ctx, resources);
    runHudFrameWithResources(ram, rom, ctx, resources);
    void slot;
  };
}

export function armHudSlideWithResources(ram, suppliedResources) {
  const resources = requireHudResources(suppliedResources);
  if ((ram.u8(resources.ram.flags9) & 0x01) === 0) {
    ram.setU16(resources.ram.bannerTimer, 0x53);
  }
  ram.setU16(resources.ram.slideFlag, 1);
}

/** `$2871E8` (P1) / `$287210` (P2) -- CLEAR THE CHAIN METER.
 *
 *   lea $81B5B8,A0 / moveq #0,D0
 *   2871f4: move.w D0,(A0)+ / cmpa.l #$81B5E0,A0 / bne $2871F4
 *           move.w D0,$81B632 / move.l D0,$81B5BC / rts
 *
 * The sweep is `$81B5B8..$81B5DE` as words -- 40 bytes, the whole `HUDRAM.p1`
 * meter block from `accA` through `chain`. `$81B5BC` is INSIDE that range, so the
 * trailing `move.l` is redundant on the board too; it is kept because dropping a
 * write is how a port stops being a translation.
 */
export function chainMeterClear2871E8(ram, who) {
  const p = who === 0
    ? { from: 0x81b5b8, to: 0x81b5e0, hi: HUDRAM.chainHiWaterP1, again: 0x81b5bc }
    : { from: 0x81b5e2, to: 0x81b60a, hi: HUDRAM.chainHiWaterP2, again: 0x81b5e6 };
  for (let a = p.from; a !== p.to; a += 2) ram.setU16(a, 0);  // $2871F4 / cmpa.l / bne
  ram.setU16(p.hi, 0);                                   // $2871FE move.w D0,$81B632
  ram.setU32(p.again, 0);                                // $287204 move.l D0,$81B5BC
}

/** `$287238` (P1) / `$28725E` (P2) -- BUMP THE DIGIT STATE, CAPPED AT 9.
 *
 *   cmpi.w #$9,$81B49A / beq $28725C   -- AT nine, not past it: the cap is a
 *   addq.w #$1,$81B49A                    `beq`, so a state that somehow got
 *   lea $81B57C,A0                        past 9 would keep counting
 *   addi.w #$1,($6,A0) / move.w #$1,(A0)
 *
 * `($6,A0)` is the third word of `extraRecA`'s $A-byte record and `(A0)` is its
 * dirty flag, so this is "advance the standalone record's frame and mark it
 * dirty" -- the same (dirty, dest, tile) shape `HUDRAM` documents for the two
 * standalone records.
 */
export function digitStateBump287238(ram, who) {
  const state = who === 0 ? HUDRAM.digitStateP1 : HUDRAM.digitStateP2;
  const rec = who === 0 ? HUDRAM.extraRecA : HUDRAM.extraRecB;
  if (ram.u16(state) === 9) return;                      // $287238 cmpi.w #$9 / beq
  ram.setU16(state, u16(ram.u16(state) + 1));            // $287242 addq.w #$1
  ram.setU16(rec + 0x06, u16(ram.u16(rec + 0x06) + 1));  // $287250 addi.w #$1,($6,A0)
  ram.setU16(rec, 1);                                    // $287256 move.w #$1,(A0)
}

/** `$287AAA` (P1) / `$287ADC` (P2) -- THE TALLY'S OWN TEXT ROW.
 *
 *   btst #$0,$8130F9 / beq $287ABE      the banner gate, same pair as
 *   tst.b $81B61F / bmi $287ABE         `hyperStock286ED6` and `livesRow2878CC`
 *   rts                                 use, and the same sense
 *   287abe: move.w #$D4,D0 / move.w #$0,D1 / move.w #$7,D2 / move.w #$1,D3
 *           move.l #$404000A,D4 / jmp $240DC2
 *
 * A 8-wide-by-2-tall grid at column 0 (P1) or $1A00 (P2), and the two sides use
 * DIFFERENT tiles -- `$0404000A` against `$03EE000A` -- which is the ROM's own
 * asymmetry and not a mirror. This is one of the `$240DC2` call sites W271's
 * worklog left counted for want of a transcribed register setup; the setup is
 * these six immediates.
 */
export function tallyRow287AAA(ram, rom, ctx, who) {
  const addr = who === 0 ? 0x287aaa : 0x287adc;
  if (!rom) { note(ctx, addr, '$287AAA the stage-clear tally row'); return; }
  // $287AAA btst #$0 / beq -> DRAW; $287AB4 tst.b / bmi -> DRAW; else rts.
  if ((ram.u8(HUDRAM.flags9) & 0x01)
    && (ram.u8(HUDRAM.bannerFlagsClear) & 0x80) === 0) return;   // $287ABC rts
  txPrint240DC2(ram, 0xd4, who === 0 ? 0x0000 : 0x1a00, 7, 1,
    who === 0 ? 0x0404000a : 0x03ee000a);                        // $287AD4 jmp $240DC2
}

/** The slot indices the frame-order claim in this file's header is about, read
 *  out of the LIVE object table.  Exported so a gate can ASSERT the ordering on
 *  every frame instead of trusting the paragraph. */
export function objectOrder(ram) {
  const at = {};
  for (let i = 0; i < OBJ.slots; i++) {
    const t = ram.u16(OBJ.base + i * OBJ.stride);
    if (t === 0) continue;
    const type = t & 0xff;
    if (at[type] === undefined) at[type] = i;
  }
  return { rank: at[10], player: at[2], ledger: at[0], background: at[1] };
}
