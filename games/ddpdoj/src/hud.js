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
// THE HYPER: ITS TWO GUARDS ARE PORTED AND EVERYTHING PAST THEM THROWS
// ===========================================================================
//
// A bare throw at `$284460` would stop the game on logic frame 49 and take the
// owner's "load the page, fly, shoot" with it.  A quiet skip is forbidden.  The
// cartridge itself supplies the third answer, and it is two instructions:
//
//     $285A12 tst.w $81B63E / bne.w $285A96   ALREADY HYPERING -> the tail
//     $285A1C tst.w $81B658 / beq.b $285A0A   no REQUEST -> jmp $2873AC
//
// [M] both words are **0** in the shipped seed, and `$81B658`'s only producer
// is `$24989A move.w #$1,(A2)` inside `$249814` -- the button, which
// `src/player.js` has thrown for since wave 4.  So the cartridge's own guards
// send every frame to `$285A0A`, and the port transcribes the guards and
// THROWS BY ADDRESS on both arms past them.  That is a transcription of two
// real instructions, not a stub of a routine.
//
// `$2873AC` (P1) / `$28748A` (P2), the hyper-END flash, gets the same
// treatment: its own first instruction is `tst.w $81B6FA / beq.b $287400`
// (a bare `rts`), and [M] `$81B6FA`'s ONE non-local writer in
// $230000..$2B0000 is `$285AFC move.w #$48`, inside `$285AF2` -- the hyper end,
// behind the throw.  So the flash is a PROVEN two-instruction no-op here, and
// its body is a throw carrying `$2873B4`.
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

import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';
import { queueKill } from './objalloc.js';
import { OBJ } from './objdriver.js';
import { enqueueRegisters } from './spritequeue.js';

/** Every ROM address this file touches, as the operand of a named instruction. */
export const HUD = {
  obj: 0x28d520,            // $240F62[0], priority $0009
  objInit: 0x28d502, objDestroy: 0x28d512,
  kill: 0x241292,           // $28D518 jmp
  drain: 0x2842b0, drainOne: 0x2842fe, drainNull: 0x2842ae,
  digitsP1: 0x2843a8, digitsP2: 0x2843be,
  extendStep: 0x286fda,
  extendTable: 0x28840e,    // $286FDE lea -- FOUR longwords, then $FFFFFFFF
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
  savedTotal: 0x81b590,     // $284312 move.l -$4(A0),$81B590
  savedOvf: 0x81b594,       // $284318 move.w (A6),$81B594
  digitsP1: 0x81b4c8, digitsP2: 0x81b522,   // 9 records of stride $A
  digitStateP1: 0x81b49a, digitStateP2: 0x81b49e, digitStateHi: 0x81b49c,
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
    creditRow: 0x812900,    // $28455A move.w -- the CONTINUE prompt
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
    creditRow: 0x81290e,    // $2846F8
    playerState: 0x810448,  // $2846EE
    panel: 0x285dd8,        // $284666 bsr
    creditDuty: 0x2c,       // $284708 cmpi.w #$2C -- NOT $14; the ROM's own
  },
};

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
function digits2843A8(ram, who) {
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
      note(ctx, 0x28c678, '$284356 jsr $28C678 -- the EXTEND jingle (the '
        + '$28Cxxx sound family, deferred whole since W53)');
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

/** `$284FD2` -- the BOSS banner's panels.  138 instructions and **exactly four
 *  absolute RAM writes**; the other 134 are `$23FA96`/`$23FAC4`/`$240DC2`/
 *  `$286ED6`/`$286F3E`.  Its mirror `$2851D2` has the two sub-counters SWAPPED
 *  -- `$284FD2` gates on `$81B61E` and decrements `$81B622` then `$81B624`,
 *  `$2851D2` gates on `$81B61F` and decrements `$81B624` then `$81B622`.  Read
 *  as one routine with a parameter they would be wrong. */
function panel284FD2(ram, ctx) {
  if ((ram.u8(HUDRAM.bannerFlagsBoss) & 0x08)           // $284FDE btst #$3,$81B61E
    && ram.u16(HUDRAM.bannerTimer) <= 0x0c) {           // $284FE8 cmpi.w #$C / bhi
    subqFloor(ram, HUDRAM.bannerSubA);                  // $284FF2 subq.w / $284FFA clr.w
  }
  draw(ctx, 0x23fac4); draw(ctx, 0x240dc2); draw(ctx, 0x286ed6);
  subqFloor(ram, HUDRAM.bannerSubB);                    // $2851C2 subq.w / $2851CA clr.w
}

/** `$2851D2` -- the STAGE-CLEAR banner's panels.  See `panel284FD2`. */
function panel2851D2(ram, ctx) {
  if ((ram.u8(HUDRAM.bannerFlagsClear) & 0x08)          // $2851E2 btst #$3,$81B61F
    && ram.u16(HUDRAM.bannerTimer) <= 0x10) {           // $2851EE cmpi.w #$10 / bhi
    subqFloor(ram, HUDRAM.bannerSubB);                  // $2851F8 subq.w / $285200 clr.w
  }
  draw(ctx, 0x23fac4); draw(ctx, 0x240dc2); draw(ctx, 0x286f3e);
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
    if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) { draw(ctx, 0x286ed6); draw(ctx, 0x2878cc); }
    if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) { draw(ctx, 0x286f3e); draw(ctx, 0x28795c); }
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
  // ---- $284E7A: the LAST frame of the slide-in.
  if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) {              // $284E7A / $284E80 bmi
    draw(ctx, 0x240dc2);                                // $284EBA, the dbra
    draw(ctx, 0x286ed6); draw(ctx, 0x287abe); draw(ctx, 0x240dc2);   // $284ECA..$284EEC
  }
  if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) {              // $284EF2 / $284EF8 bmi
    draw(ctx, 0x240dc2);                                // $284F32
    draw(ctx, 0x286f3e); draw(ctx, 0x287af0); draw(ctx, 0x240dc2);   // $284F42..$284F64
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
    if (!had) { draw(ctx, 0x240dc2); draw(ctx, 0x240dc2); }  // $284508/$284524
    hyperFlash285FA6(ram, rom, ctx, 0x64c00400,           // $28452A move.l / $284530 D2
      ram.u32(HUDRAM.cursorValB));                        // $284536 / $2846D4 bsr
  } else {
    ram.setU8(P.hyperShown, ram.u8(P.hyperShown) & ~0x01);  // $28453E / $2846DC bclr.b
    if ((ram.u8(HUDRAM.altPhase) & 0x40)                // $284546 / $2846E4 btst #$6
      && (ram.u8(P.playerState) & 0x40) === 0           // $284550 / $2846EE btst #$6
      && ram.u16(P.creditRow) !== 0) {                  // $28455A / $2846F8 move.w / beq
      if ((ram.u16(HUDRAM.frameCounter) & 0x3f) < P.creditDuty) {   // $28456A / $284708
        draw(ctx, 0x240dc2);                            // $284586 / $284724
        hyperFlash285FA6(ram, rom, ctx, 0x64c00400,       // $28458C move.l / $284592 D2
          ram.u32(HUDRAM.cursorValA));                    // $284598 / $284736 bsr
      } else {
        draw(ctx, 0x285fb6);                            // $2845AC / $28474A bsr
      }
    } else {
      draw(ctx, 0x286040);                              // $2845C0 / $28475E bsr
    }
  }
  // ---- $2845C4 / $284762: THE CHAIN-BREAK POPUP COUNTDOWN.
  if (ram.u16(P.popup) !== 0) {                         // tst.w / beq
    ram.setU16(P.popup, u16(ram.u16(P.popup) - 1));     // $2845CC / $28476A subq.w #$1
    void ram.u16(P.popupVal);                           // $2845D2 / $284770 -> D0
    ram.setU16(P.popupIdx, u16(ram.u16(P.popupIdx) + 1));   // $2845E0 / $28477E addq.w #$1
    if (ram.u16(P.popupSpeed) !== 0) {                  // $2845FE / $28479C tst.w / beq
      ram.setU16(P.popupSpeed, u16(ram.u16(P.popupSpeed) - 1));   // $284606 / $2847A4
    }
    draw(ctx, 0x2855b6);                                // $284610 / $2847AE bsr
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
      if (!had) draw(ctx, 0x28ca7a);                    // $284A84 jsr -- THE WARNING CUE
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
      panel284FD2(ram, ctx);                            // $284952 bsr $284FD2
      ram.setU16(HUDRAM.bannerTimer, 0xffe2);           // $284956
      draw(ctx, 0x240dc2);                              // $284970
      bothScoreRows(ram, rom, ctx);                     // $28497A / $28498E
      return;
    }
    draw(ctx, 0x23fa96);                                // $28490E
    bothScoreRows(ram, rom, ctx);                       // $28491A / $28492E
    panel284FD2(ram, ctx);                              // $284942 bsr $284FD2
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
  panel284FD2(ram, ctx);                                // $2848BA bsr $284FD2
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
      panel2851D2(ram, ctx);                            // $284C72 bsr $2851D2
      return null;
    }
    // ---- $284C7A: the banner is FINISHED.
    setF(F() | 0x80);                                   // $284C7A bset #$7
    ram.setU16(HUDRAM.popupTimerP1, 0);                 // $284C82 clr.w $81B5C2
    ram.setU16(HUDRAM.popupTimerP2, 0);                 // $284C88 clr.w $81B5EC
    ram.setU16(HUDRAM.p1.popup, 0);                     // $284C8E clr.w $81B5C8
    panel2851D2(ram, ctx);                              // $284C94 bsr $2851D2
    if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) {            // $284C98 / $284C9E bmi
      draw(ctx, 0x287abe); draw(ctx, 0x240dc2);         // $284CA0 / $284CBC
    }
    if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) {            // $284CC2 / $284CC8 bmi
      draw(ctx, 0x287af0); draw(ctx, 0x240dc2);         // $284CCC / $284CE8
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
  panel2851D2(ram, ctx);                                // $284BD4 bsr $2851D2
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
function extendCounter284AB6(ram, ctx) {
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
        draw(ctx, 0x2857b4);                            // $284B4C bsr
      }
    } else if (i16(ram.u16(HUDRAM.attract2)) < 0) {     // $284AE2 tst.w $81308E / bmi
      ram.setU16(HUDRAM.itemCount, 0);                  // $284B52 clr.w
      ram.setU16(HUDRAM.itemTimer, 0);                  // $284B58 clr.w
    } else if (ram.u16(HUDRAM.itemTimer) !== 0) {       // $284AEC tst.w / beq.w $284B5E
      const t = u16(ram.u16(HUDRAM.itemTimer) - 1);     // $284AF6 subq.w #$1
      ram.setU16(HUDRAM.itemTimer, t);
      if (t !== 0) {                                    // $284AFC bne.b $284B4C
        draw(ctx, 0x2857b4);
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
          draw(ctx, 0x2857b4);                          // $284B4C bsr
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

/** `$2853D2` -- THE STAGE-CLEAR TALLY's front door, and its own guard.  See
 *  this file's header: the body is unreachable by construction because the only
 *  producer of `$8130F9` bit 3 is `$28DB52`, inside the unported result screen
 *  `$28D9AA`.  The port takes the same `beq` to the same bare `rts`. */
function tally2853D2(ram, ctx) {
  if ((ram.u8(HUDRAM.flags9) & 0x08) === 0) return;     // $2853D2 btst #$3 / beq.b $2853D0
  void ctx;
  unreached(HUD.tallyBody, 'THE STAGE-CLEAR TALLY $2853DC..$285568 -- the '
    + '$81B610 -> $81B616 bonus walk, its $28C6C6 conversion and its '
    + '$28614A/$286154 SCORE ADDS. Reached because $8130F9 bit 3 is set, whose '
    + 'ONE producer in $230000..$2B0000 is $28DB52 inside $28D9AA, THE RESULT '
    + 'SCREEN (819 instructions, declared unported by W62 2). If this fires the '
    + 'result screen has landed, and the tally must land with it -- it is where '
    + 'the stage-clear score comes from');
}

/** `$285A12` (P1) / `$285B3C` (P2) -- **THE HYPER**, recon 38's wave 2.
 *
 *  The TWO GUARDS are ported; both arms past them are LOUD NAMED THROWS.  See
 *  this file's header for why that is a transcription and not a stub. */
function hyper285A12(ram, ctx, who) {
  const P = who === 0
    ? { active: HUDRAM.hyperActiveP1, req: HUDRAM.hyperReqP1, entry: HUD.hyperP1,
      tail: HUD.hyperTailP1, act: HUD.hyperActP1, flash: HUD.flashP1,
      flashT: HUDRAM.flashTimerP1, flashBody: HUD.flashBodyP1 }
    : { active: HUDRAM.hyperActiveP2, req: HUDRAM.hyperReqP2, entry: HUD.hyperP2,
      tail: HUD.hyperTailP2, act: HUD.hyperActP2, flash: HUD.flashP2,
      flashT: HUDRAM.flashTimerP2, flashBody: HUD.flashBodyP2 };
  if (ram.u16(P.active) !== 0) {                        // $285A12 tst.w $81B63E / bne
    unreached(P.tail, `THE HYPER's PER-FRAME TAIL, P${who + 1} `
      + `($${P.tail.toString(16).toUpperCase()}). $81B63E/$81B640 is non-zero, `
      + 'so a hyper is UP -- which no run in this repo has ever had (W19 1.4). '
      + 'The tail is $287340, $285A9C\'s death exit into $285AF2, $285AA8\'s '
      + 'popup arm and $285AEA subq.w #$2,$81B642, the 1,200-frame gauge. '
      + 'Recon 38 wave 2');
  }
  if (ram.u16(P.req) !== 0) {                           // $285A1C tst.w $81B658 / beq
    unreached(P.act, `THE HYPER's ACTIVATION, P${who + 1} `
      + `($${P.act.toString(16).toUpperCase()}). $81B658/$81B65A is non-zero, so `
      + 'the button asked for one -- and its ONE producer is $24989A inside '
      + '$249814, which src/player.js has thrown for since wave 4. The body is '
      + '$285A30 ($81B63E := 1), **$285A62 add.w $81B65C,$81B646 -- THE RANK '
      + 'GAIN, capped $23**, $285A4C (the chain meter := the cap, ONLY if it '
      + 'was already non-zero) and $285A8A clr.w $81B65C. Do NOT stub it: '
      + '$81B646 ACCUMULATES across hypers and $2608F4 turns it into +16 rank '
      + 'per level, permanently. Recon 38 wave 2');
  }
  // $285A0A / $285B34 jmp $2873AC / $28748A -- THE HYPER-END FLASH.
  if (ram.u16(P.flashT) === 0) return;                  // $2873AC tst.w / beq.b $287400
  unreached(P.flashBody, `THE HYPER-END FLASH, P${who + 1} `
    + `($${P.flashBody.toString(16).toUpperCase()}). $81B6FA/$81B6FC is non-zero, `
    + 'and [M] its ONE non-local writer in $230000..$2B0000 is $285AFC move.w '
    + '#$48, inside $285AF2 -- the hyper END, which is behind the throw above. '
    + 'So this cannot fire until wave 2 lands. It reads $2874E0[$81B6FA] into '
    + '$81B6F2 and draws through $240A5A');
}

/** `$28444E` -- the whole thing, in ROM order. */
export function perFrame28444E(ram, rom, ctx) {
  cursorA285F8A(ram, rom);                              // $28444E bsr.w $285F8A
  cursorB285F52(ram, rom);                              // $284452 bsr.w $285F52
  if (ram.u16(HUDRAM.slideFlag) !== 0) {                // $284456 tst.w $81B6EE / bne
    if (!slideIn284CF2(ram, rom, ctx)) return;           // $28445C bra.w $284CF2
    // $284D2A bra.w $284460 -- the settled arm RE-ENTERS here, same frame.
  }
  hyper285A12(ram, ctx, 0);                             // $284460 bsr.w $285A12
  hyper285A12(ram, ctx, 1);                             // $284464 bsr.w $285B3C
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
      extendCounter284AB6(ram, ctx);                    // every arm ends bra.w $284AB6
      return;
    }
    // $284B72 bmi.w $2844BE -- REJOIN the skeleton at the P1 block.
  }
  if (i16(ram.u16(HUDRAM.aliveP1)) >= 0) {              // $2844BE tst.w $8130BE / bmi
    playerBlock(ram, rom, ctx, HUDRAM.p1);               // $2844C8..$28465A
  }
  if (i16(ram.u16(HUDRAM.aliveP2)) >= 0) {              // $28465C tst.w $8130C0 / bmi
    playerBlock(ram, rom, ctx, HUDRAM.p2);               // $284666..$2847F8
  }
  extendCounter284AB6(ram, ctx);                        // $284AB6
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
 *  drops it, and its ONE reader is `$287286 tst.w $81B6F0`.
 *  [M] the shipped seed has object SLOT 7 = type 0 with `($2,A5) = 1`, so the
 *  port lands in state 1 on its first frame -- it simply was not dispatching
 *  it, and `runObjectDriver` counted the miss under `$240F62 + 0` every frame. */
export function makeHudObject(rom) {
  return function hudObject(ram, a5, slot, ctx) {
    const st = ram.u8(a5 + 0x02);
    if (st === 0) {                                     // $28D520 tst.b / beq.b
      ram.setU8(a5 + 0x02, 1);                          // $28D502 move.b #$1,$2(A5)
      ram.setU16(HUDRAM.objFlag, 1);                    // $28D508 move.w #$1,$81B6F0
      return;                                           // $28D510 rts
    }
    if (st === 2) {                                     // $28D526 cmpi.b #$2 / beq.b
      ram.setU16(HUDRAM.objFlag, 0);                    // $28D512 clr.w $81B6F0
      queueKill(ram, ram.u32(a5 + 0x4c));               // $28D518 jmp $241292
      return;
    }
    drain2842B0(ram, rom, ctx);                         // $28D52E jsr $2842B0
    perFrame28444E(ram, rom, ctx);                      // $28D534 jsr $28444E
    void slot;
  };
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
