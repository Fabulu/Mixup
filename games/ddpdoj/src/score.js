// THE HIT AND KILL LEDGER -- `$286096`, `$28615E` and the chain machines.
// WAVE 34.
//
// `19-impl-score-chain-rank-ledger.md` ENUMERATED this subsystem and
// deliberately ported none of it.  This file ports the half a HIT reaches, and
// deliberately leaves the other half alone.  Both halves of that sentence are
// load-bearing, so the reason is here rather than only in the worklog:
//
// ====================== THE OWNER CONSTRAINT AND THE ORDER ==================
//
// `20-OWNER-scoring-must-be-exact.md`: "one wrong rank gain from using super
// and the entire route breaks".  Order WITHIN a frame is semantics, and W19
// §1.5 MEASURED the board's order on 40 frames of a playing run:
//
//     rankclk > rank= > [ CHAIN+ > score+ > meter+ > (meter=cap) > score+ ]*
//             > drain > drain0 > (brkT) > meter-
//
// The bracketed group is one HIT.  Everything in this file is inside that
// group, and its position in the frame is NOT CHOSEN HERE: `$286096` and
// `$28615E` are called from an enemy handler, at the instruction the handler
// reaches, and the handler's position in the frame is the enemy driver's
// dispatch order, which the port has reproduced since W29.  So no write below
// has an order this port invented.
//
// The three events OUTSIDE the group are `drain`, `drain0` and `meter-`, and
// all three live in ONE place, read out of the ROM:
//
//     $240F62[0] = $28D520            top-level object TYPE 0
//        $28D52E jsr $2842B0          the pending -> total DRAIN  (drain/drain0)
//        $28D534 jsr $28444E          ... and inside it, $284636 subq.w #1,
//                                     $81B5C0 -- THE CHAIN METER DECREMENT
//
// Object type 0 is one of the SIXTEEN top-level dispatch entries this port does
// not have, and the path from `$28444E` to `$284614` is gated three ways
// (`$28445C bne $284CF2`, `$2844AE`/`$2844BA bne $2847FE`, and `$2844C4 bmi
// $28465C`, which jumps PAST the decrement).  Reproducing it needs `$285A12`
// (the HYPER), `$285B3C`, `$285C5E`, `$285F8A`, `$285F52` and the TX printer
// `$240DC2`.
//
// **So the per-frame half is NOT ported, and the reason is W19 §1.6's own** --
// it declined to port the rank clock because "porting the arithmetic without
// the slot would bake in an order that later has to be unpicked".  Calling
// `$284636` from a place chosen by this wave would do exactly that.  The
// consequence is stated rather than hidden: with no decrement a chain the port
// starts never expires.  `$28D520` is NOTED, by address, on every frame the
// pass runs, so the gap is counted and not silent.
//
// ============ WAVE 63 (B1): **THE PARAGRAPH ABOVE IS NOW HISTORY** ==========
//
// `src/hud.js` ports object type 0 -- the whole of `$28D520`, `$2842B0` and
// `$28444E`'s frame-level machine -- and the decrement landed in the
// cartridge's own slot for exactly the reason the paragraph above declined to
// choose one.  `$240F62`'s second longword is the DISPATCH PRIORITY and
// `$24111E`'s create queue keeps the object table in descending priority
// order, so the walk order is static: `$260794` (RANK, `$1F`) then `$2491C0`
// (the player, `$1C`) then `$28D520` (this, `$09`).  W19 §1.5 MEASURED
// `... > drain > drain0 > (brkT) > meter-`; the port now reproduces it by
// construction rather than by arrangement.
//
// **WHAT THAT CHANGED HERE, MEASURED** (`tools/w63hudgate.mjs`, 6,200 tapped
// frames from the shipped seed, against the same run on HEAD):
//
//   * `$81B5C0` decrements 3,622 times and reaches ZERO 38 times, where before
//     it was pinned at the cap 56 for the whole run.  `$81B5DA`, the chain,
//     ends 0 instead of 773 and its high-water `$81B632` is 133 instead of 773;
//   * `$81B4C0`, the pending score, is DRAINED every frame instead of only
//     growing: it ends 0, and `$81B440` holds BCD `$00065284`;
//   * **NO RANK WRITE MOVED**: `$81309E` 53, `$81B646` 0, `$81B65C`/`$81B65E` 0,
//     digit-identical to HEAD across three inputs;
//   * **`$81B64A` DID move, 2,112 -> 1,512 on the fire-held run**, and a
//     five-way cut bisection says the mover is THE DECREMENT and nothing else
//     (cutting it alone restores 2,112 exactly).  −600 is exactly 25 × `$18`,
//     i.e. **25 fewer executions of `$28679E add.w D2,$81B64A`** in
//     `bombRankFeed` below: a chain that now BREAKS re-seeds `$81B636` from
//     `$286876`'s power word more often, and the divider borrows less.
//     Both figures are below `$287682`'s `#$95F` = 2,399 threshold, so no
//     hyper stock is granted either way -- but W61 §5 named a −24 offset for
//     the same reason and this is −600, so **wave I3 must not ship `$287682`
//     without re-reading both rows.**
//
// AND ONE CLAIM IN `38-recon-bomb-hyper.md` §4.5 IS STALE, not wrong when
// written: it lists `SCORE.altBomb = $286876` as "note only".  W51 PORTED it
// and measured it running twice.  So the answer to "does the skeleton make the
// second chain machine reachable" is that it was ALREADY reachable and ALREADY
// ported two waves before this one -- what W63 changes is that the meter it
// floors at 10/25 (`$2869D8`) now falls again.
//
// ============================ WHAT IS AND IS NOT HERE =======================
//
//   PORTED   $286096  a HIT lands (85 call sites)
//            $28615E  a KILL (87 call sites, 87 of 87 score immediates
//                     recovered and 87 of 87 valid packed BCD -- W34 §1.1)
//            $2862C6 / $286476   the P1 and P2 chain machines
//            $286626  THE ONE BCD ADDER (28 pc-relative callers, 0 absolute)
//            $28663A / $2866DE   the meter refill, and $286664's cap clamp
//            $28614A / $286154 / $286128 / $286102   the four thin wrappers
//
//   NOTED    $286876  behind `btst #2,D1` -- the BOMB hit bit ($400), which is
//                     set only at $245242/$2452F2, both inside the A2/A3 weapon
//                     loops src/damage.js does not run
//            $286A82 / $286DA8   behind $8130F8 bit 2 AND $811F72's sign AND
//                     its bit 0 -- THE LASER, which has never executed
//                     **$286A82 IS PORTED, W424 (D60)**, with $286AAA, the
//                     shared tail $286AEA and the rank feeder $2867B4.  It HAD
//                     executed -- on the owner's board, not on ours.  $286DA8
//                     stays a note, because $2860C0's `beq $286102` steps over
//                     the only branch that could reach it.
//            $286674  the cap clamp's TAIL: the hyper-stock bonus into $81B64A
//                     and `jmp $287682`, which GRANTS A HYPER ITEM and feeds
//                     $285A62's +16 rank.  That is the owner's own case and it
//                     needs $287682's machine, which is W28's wave 8.
//
// ================= WAVE 45: **WHICH LASER THESE ARMS ARE** ==================
//
// W45 ported THE BEAM -- the weapon a player gets by holding Button 1 -- and
// changed NOTHING about this file's behaviour.  That is not luck and it is
// worth writing down, because the wave brief predicted the opposite.
//
// `37-recon-laser.md` §0 established that "the laser" is TWO weapons.  Every
// laser fork in this file -- `$2860A8`, `$2862DC`, and therefore `$286A82`,
// `$2867B4` and `$286DA8` behind them -- reads **`$811F72`**, and `$811F72` is
// the **BOMB-LASER's** 45 x $30 record (W37 §4.2: `$24560A` walks it as 45
// records of $30; type-5 call #7 `$255DD8` drives it; the only thing that
// selects that weapon is `$24989E bset #$0,($1,A6)`, INSIDE THE BOMB).
//
// **W427: `$24989E` IS THE WRONG INSTRUCTION AND THIS LINE HAS BEEN COPIED INTO
// TWO DOCKET ENTRIES.  THE SELECTOR IS `$249A98`.**  Read the EA bytes:
//
//     $24989E  08 ee 00 00 00 01   bset #$0,($1,A6)   mode 5 reg 6 = A6, the
//                                                     PLAYER record's flags1
//     $249A98  08 e9 00 00 00 01   bset #$0,($1,A1)   mode 5 reg 1 = A1, and A1
//                                                     IS `$811F72`, the bomb record
//
// That is this repo's own EA mode/reg trap, the one the trap lists warn about
// (`08 ae` is `(d16,A6)` where `08 ab` would be A3), walked into by the person
// who wrote the trap list.  `src/bomb.js:1548` already had it right; nothing
// had reconciled the two.
//
// **AND THEY ARE ON DIFFERENT ARMS OF THE SAME BUTTON.**  `$249864 move.w
// (A1),D1 / $249866 beq.b -> $2498E2` forks on the HYPER STOCK:
//   * stock NON-ZERO -> `$249868`, the HYPER, which reaches `$24989E` and sets
//     the PLAYER's flags1 bit 0.  **It never allocates `$811F72` at all**, so
//     block 9 and everything in this file behind it NEVER RUN.
//   * stock ZERO -> `$2498E2`, whose laser arm runs `$249A98`, and that is the
//     only path that reaches `$2456A6`.
//
// So "bomb while lasering" is TWO different weapons depending on hyper stock,
// and W427 measured both: with stock 1 the press activates the hyper for 182
// frames and `$811F72` is never allocated -- 0 guard frames, 0 `$2456A6` frames.
//
// **THE BEAM DOES NOT LIVE THERE.**  It lives in `$811EF2`/`$811F12` (the beam
// records), `$811F32`/`$811F52` (the drawn column) and the two 32 x $30 pools
// at `$8112F2`/`$8118F2` -- `src/laser.js SEG`/`BEAM`.  MEASURED, this wave:
// **600 logic frames with fire held, the beam armed at +17 and laying segments
// from +19 on, and `$811F72` was 0 on every one of them.**  `$8130F8` bit 2 --
// the OTHER gate on `$2860A8`'s arm -- was 0 on all 600 as well, so the arm is
// two independent gates away from reachable.
//
// So a wave that ports the beam and "fixes" these arms would be adding a rank
// feed and a chain break the beam has not got.  The correct change was to name
// the address of the rank feeder `$2867B4` so the wave that ports `$286A82`
// cannot ship one without the other, and to say -- here -- which laser this is.
//
// ============ D60: "TWO GATES AWAY FROM REACHABLE" IS WRONG. BOTH OPEN. =====
//
// **THE OWNER EXECUTED THIS PATH IN THE LIVE BUILD** and got `$286AAA IS NOT
// PORTED YET` -- stage-2 boss, `c` (laser) held, `y` (bomb) pressed on top of
// it, at the instant the fight starts.  So read the paragraph above as what it
// actually is: **a measurement of the BENCH, not of the game.**  Those 600
// frames held the beam with no boss and no bomb, and neither gate could have
// been open in them.  A zero measured over runs that never enter the state
// says nothing about whether the state is reachable.
//
//   * **bit 2 is set BY THIS PORT, at boss arrival.**  A whole-image scan finds
//     `bset #2,$8130F8` at exactly six sites -- `$29279C`, `$2971F0`,
//     `$29BCBC`, `$29ED3A`, `$2A5994`, `$2A63B2` -- each immediately preceded
//     by `bset #0`.  `initbody.js:1161`, `:1226` and `:1256` already write that
//     pair as `| 0x05`.  Hence "just when fight was about to start".
//
//   * **gate 2 is opened by the owner's own input.**  `$811F72` is the
//     bomb-laser's record and `$24989E bset #$0,($1,A6)` inside the bomb is the
//     only thing that selects it.  Bomb-while-lasering IS that instruction.
//
// The conclusion above still holds for the wave that wrote it: porting the BEAM
// alone must not touch these arms.  What does not hold is the reachability
// claim.  **Do not re-derive "the arm is dead" from the numbers above.**
//
// **W424 PORTED IT** -- see the WAVE 424 block further down this file for the
// bytes and the three entrances.  The refusal is gone; nothing here throws any
// more.  Two things this wave MEASURED that the recon did not have:
// `initbody.js:1161`'s `| 0x05` sits literally inside the STAGE-2 BOSS's own
// six palette installs, which is the owner's scenario exactly; and
// `$284A72`/`$284A74` in `hud.js` refuse to latch `$81B62E` on any frame the
// bomb-laser is selected, so `$286A92`'s fork turns on whether the latch went
// up EARLIER in the fight.  Both of its arms are ported and both are tested.
//            $28D520  the per-frame half, above.
//
// ============================== THE BCD, AND THE TRAP ========================
//
// Every score in this game is PACKED BCD and there is exactly ONE adder:
// `$286626`, four `abcd -(A1),-(A0)` with `sub.w D2,D2` clearing X first.  The
// PREDECREMENT is the whole trap (W19 §1.0): A0 is the address ONE PAST the
// accumulator's last byte, so `lea $81B4C4,A0` addresses the four bytes
// `$81B4C0..$81B4C3`, and a reader who takes the `lea` for the accumulator's
// address is off by one slot on every player.

// ============ WAVE 51: `$286876` IS NOT "THE BOMB ARM" AND IT IS LIVE =======
//
// This file has said since W34, and W45 repeated it, that `$2860F2 bsr $286876`
// is unreachable because the `$400` hit bit "is set only at `$245242`/`$2452F2`,
// both inside the A2/A3 weapon loops `src/damage.js` does not run".
//
// **BOTH HALVES OF THAT SENTENCE ARE NOW FALSE**, and W51 measured it rather
// than reasoned it:
//
//   * `$2454E0` and `$2455F2 ori.w #$400,D4 / or.w D4,(A5)`, inside `$2453AC`
//     -- THE BEAM's own damage pass -- set the same bit, and block 8's
//     `$2452F2 ori.w #$4400,D4` sets `$4000` with it;
//   * `src/damage.js` runs those loops from W51 on, behind `$24519A
//     tst.b ($3f,A4)`, the byte the laser sets while it is firing.
//
// [M] 601 steps from the shipped bundle seed with the fire bit HELD, the beam
// killing 57 enemies: `$286876` executed **2 times** (0 in the fire-suppressed
// control), and `$286674` -- the cap-clamp tail -- went from 2 to 55.
//
// So the arm is ported here.  Leaving it a note would have been the quiet wrong
// answer: `$2860F0 beq $2860F8` means the ordinary BCD add runs INSTEAD of
// `$286876`, never as well, so a note there silently drops the whole ledger
// event -- score, chain, meter and hi-water -- on every laser hit.
//
// **AND IT IS NOT THE BOMB'S ARM.**  `$400` is D1 bit 2 and nothing about it
// says "bomb"; the bomb reaches `$286876` through the same bit from
// `$245242`/`$2452F2`, which are the SAME two weapon loops.  The name in this
// file was a guess from W34's reachability argument and is retired.
//
// WHAT THE BRIEF PREDICTED AND WHAT ACTUALLY HAPPENED.  `37-recon-laser` §4.3
// to §4.6 names three laser score differences -- `$2860C8 bsr $286A82`,
// `$2867B4`'s 8-frame rank divider and `$2862EA`'s chain zero -- and all three
// are behind **`$811F72`**, the BOMB-LASER's record.  [M] `$811F72` was 0 and
// `$8130F8` was 0 on all 601 steps of the run above.  W45's measurement holds
// and its conclusion was right for one more wave than it expected.

import { u16 } from './ram.js';
import { grantHyper287682, HYPER_MUTATE } from './hyper.js';

export const SCORE = {
  hit: 0x286096,            // A HIT LANDS
  kill: 0x28615e,           // A KILL
  chainP1: 0x2862c6, chainP2: 0x286476,
  adder: 0x286626,
  refillP1: 0x28663a, refillP2: 0x2866de,
  capClamp: 0x286664,
  capTail: 0x286674,        // chain-cap hyper earn tail
  wrapP1: 0x28614a, wrapP2: 0x286154, wrapMask: 0x286128, wrapTail: 0x286102,
  /** `$286876..$286A80`, 523 bytes -- `$286096`'s `$400`-bit arm.  PORTED in
   *  wave 51; see this file's header for why it stopped being unreachable. */
  altBomb: 0x286876,
  /** `$28687E bne $286AAA` -- **PORTED, W424 (D60)**, the arm the owner hit.
   *  `laserAltHit` below; it was an `unreached` throw and it ended their run. */
  altBombShared: 0x286aaa,  // its `$8130F8` bit-2 arm, INSIDE $286A82's body
  laserSharedTail: 0x286aea,   // $286AB2/$286ABA/$286A92 all land here
  laserItemStart: 0x286abc,    // $286A8A beq, and $286AAA's fall-through
  laserItemAdd: 0x286b58,      // $286A9C/$286AA6's target, and $286B52's tail
  bombRankFeed: 0x286774,   // $2868EE bsr -- the twin of $2867B4
  hyperGrant: 0x287682,     // $2867A4 jsr, shared W163 grantor
  rankAccum: 0x81b64a,      // $28679E add.w D2,$81B64A
  bombStock: 0x81b65c,      // $286782 cmpi.w #$5
  altLaserP1: 0x286a82, altLaserP2: 0x286da8,   // NOTED
  /** `$2867B4` -- **THE LASER'S RANK FEEDER**, reached ONLY by
   *  `$286AF8 bsr` from inside `$286A82`, with 0 absolute callers.  Its own
   *  8-frame divider `$81B636`, `+4` (or `+$30` while hypering) into `$81B64A`,
   *  then `$2867CE jsr $287682`, which is one of that routine's six callers.
   *  `37-recon-laser.md` §9.8: "any wave that ports `$286A82` without
   *  `$2867B4` ships a laser that scores and does not raise rank -- which is
   *  the owner's named failure with the sign flipped."  Neither is ported and
   *  the address is here so the next wave cannot port one without the other. */
  laserRankFeed: 0x2867b4,
  laserRankDivider: 0x81b636,
  perFrame: 0x28d520,       // **PORTED, W63** -- src/hud.js, object type 0
  drain: 0x2842b0, decrement: 0x284636,
  scratch: 0x81b5aa,        // $286626 lea $81B5AA,A1
  capWord: 0x81b5b2,        // $28616C move.w (A0,D2.w),$81B5B2
  refillAmt: 0x81b5e0,      // $2862D4 AND $286484 -- ONE word, both players
  loop: 0x813098,
  stage: 0x813092,          // $286B16 cmpi.w #$3 -- src/hud.js HUDRAM.stage
  laserRec: 0x811f72,
  // W424: the HUD's ITEM COUNTER, and all four are `src/hud.js` HUDRAM names
  // already -- `$2857B4` draws `itemCount` as an 8-nibble BCD walk with
  // `itemKind` as its colour/flip word.  `$286ABC`/`$286B8A` arm it; the HUD's
  // `$284AC2` block drains it.
  itemTimer: 0x81b60c,      // $286ABC / $286B8A move.w #$A
  itemDir: 0x81b60e,        // $286AD2 clr.w
  itemCount: 0x81b610,      // $286AEA tst.w / $286B58 add.w D0
  itemKind: 0x81b612,       // $286AC4 / $286B92 move.w #$7
  bossHpLatch: 0x81b62e,    // $286A8C tst.w -- $286A82's SECOND gate
  g30f8: 0x8130f8, g30f9: 0x8130f9,
  /** `$28616C lea $287DF0` -- the chain-meter CAP by loop word, `$813098 * 2`.
   *  MEASURED out of the image: `$0038 $005A` = 56 and 90, and W19 measured 56
   *  on the board for loop 1. */
  capTable: 0x287df0,
  /** `$2862CE lea $287DF4` -- the per-hit REFILL by the player's weapon
   *  selector, which is ALREADY a byte offset (`move.w $81043E,D2` then
   *  `(A0,D2.w)`, no scaling).  `$0014 $0012` = 20 and 18.  The window is FOUR
   *  BYTES on purpose: `$287DF8` onward does not read as refill amounts
   *  ($0118, $2223, ...) and no run has ever had `$81043E` non-zero, so a
   *  third entry would be a guess.  Indexing past it is a LOUD NAMED THROW out
   *  of `src/rom.js`, which is the correct answer to an unproven extent. */
  refillTable: 0x287df4,
};

/** The per-player address block.  P1's is `$2862C6`'s and P2's is `$286476`'s;
 *  the two routines are instruction-for-instruction identical and differ only
 *  in these words, which is why one function serves both.  Every address is
 *  the operand of a named instruction so the pairing can be checked. */
export const LEDGER = {
  p1: {
    who: 1,
    weaponSel: 0x81043e,    // $2862C8
    guard: 0x81b5ae,        // $2862EA tst.w
    w1e: 0x81b5de,          // $2862FC / $28630C
    hyper: 0x81b63e,        // $286304
    meter: 0x81b5c0,        // $286314
    chain: 0x81b5da,        // $286320 clr.w  /  $2863B2 the +1
    pendingEnd: 0x81b4c4,   // $286328 lea    (accumulator $81B4C0..$81B4C3)
    acc1: 0x81b5b8,         // $286332
    acc2: 0x81b5bc,         // $286338
    acc3: 0x81b5d6,         // $28633E / $2863DE
    popup: 0x81b5c2,        // $286346 / $28642C / $286456
    accA: 0x81b5ce,         // $286350 / $286374
    accB: 0x81b5d2,         // $286356 / $28637A / $2863CE
    t4: 0x81b5c4,           // $28635C / $286412 / $28643E
    hiwater: 0x81b632,      // $2863B4 / $2863C2
    t6: 0x81b5c6,           // $28641A
    tcc: 0x81b5cc,          // $286438
    tc8: 0x81b5c8,          // $286444
    tca: 0x81b5ca,          // $28644C
    tdc: 0x81b5dc,          // $28645E
    refill: 0x28663a,       // $28631C / $2863E8 bsr
    hyperLvl: 0x81b654,     // $28618A (in $28615E)
    wrap: 0x28614a,         // $2861E4 bsr  (the four repeats)
    power: 0x810408,        // $2868C4 / $286910 -- ($22,A4), the POWER word
    formation: 0x810440,    // $286922 cmpi.w #$2 -- ($5a,A4), the FORMATION
  },
  p2: {
    who: 2,
    weaponSel: 0x8104a0,    // $286478
    guard: 0x81b5b0,        // $28649A
    w1e: 0x81b608,          // $2864AC / $2864BC
    hyper: 0x81b640,        // $2864B4
    meter: 0x81b5ea,        // $2864C4
    chain: 0x81b604,        // $2864D0 / $286552
    pendingEnd: 0x81b4c8,   // $2864D8 lea   (accumulator $81B4C4..$81B4C7)
    acc1: 0x81b5e2,         // $2864E2
    acc2: 0x81b5e6,         // $2864E8
    acc3: 0x81b600,         // $2864EE / $28658E
    popup: 0x81b5ec,        // $2864F6 / $2865DC / $286606
    accA: 0x81b5f8,         // $286500 / $286524
    accB: 0x81b5fc,         // $286506 / $28652A / $28657E
    t4: 0x81b5ee,           // $28650C / $2865C2 / $2865EE
    hiwater: 0x81b634,      // $286564 / $286572
    t6: 0x81b5f0,           // $2865CA
    tcc: 0x81b5f6,          // $2865E8
    tc8: 0x81b5f2,          // $2865F4
    tca: 0x81b5f4,          // $2865FC
    tdc: 0x81b606,          // $28660E
    refill: 0x2866de,       // $2864CC / $286598 bsr
    hyperLvl: 0x81b656,     // $286232
    wrap: 0x286154,         // $28628C bsr
  },
};

function note(ctx, addr, what) { ctx?.unportedLog?.note(addr, what); }

// ---------------------------------------------------------------------------
// `abcd` -- the 68000's PACKED-BCD add with the X flag.  Not a helper anybody
// should have to re-derive: the DECIMAL carry is not the binary one, and a port
// that writes `(a+b) & 0xff` gets the right answer for every score below 10.
//
//   lo = (dst & $F) + (src & $F) + X ;  if lo > 9 : lo += 6
//   r  = lo + (dst & $F0) + (src & $F0)
//   if r > $99 : r += $60 ; X = C = 1  else X = C = 0
// ---------------------------------------------------------------------------
export function abcd(dst, src, x) {
  let lo = (dst & 0x0f) + (src & 0x0f) + x;
  let carry = 0;
  if (lo > 9) lo += 6;
  let r = lo + (dst & 0xf0) + (src & 0xf0);
  if (r > 0x99) { r += 0x60; carry = 1; }
  return { v: r & 0xff, x: carry };
}

/**
 * `$286626` -- THE ONE ADDER.  `A0` is the byte ONE PAST the accumulator.
 *
 *   $286626 lea $81B5AA,A1
 *   $28662C move.l D0,(A1)+      the addend, packed BCD, into the scratch
 *   $28662E sub.w D2,D2          clear X
 *   $286630 abcd -(A1),-(A0)  x4
 */
export function bcdAdd(ram, accEnd, d0) {
  ram.setU32(SCORE.scratch, d0 >>> 0);                // $28662C move.l D0,(A1)+
  let x = 0;                                          // $28662E sub.w D2,D2
  for (let i = 1; i <= 4; i++) {                      // $286630..$286636
    const a = accEnd - i, b = SCORE.scratch + 4 - i;
    const r = abcd(ram.u8(a), ram.u8(b), x);
    ram.setU8(a, r.v);
    x = r.x;
  }
}

/** `$28663A` (P1) / `$2866DE` (P2) -- the meter REFILL, and `$286664`'s clamp.
 *
 *  `$28666E tst.w D1 / bmi $286662` is the only early exit. Otherwise W163
 *  runs the ROM gain tables and the `$287682/$287722` grant tail. */
export function refillMeter(ram, rom, ctx, p, d1) {
  const d0 = ram.u16(SCORE.refillAmt);                // $28663A move.w $81B5E0,D0
  if ((d1 & 0x04) === 0                               // $286640 btst #2,D1 / bne
      && ram.u16(SCORE.loop) !== 0) {                 // $286646 tst.w $813098 / bne
    return capClamp(ram, rom, ctx, p, d1);            // -> $286664
  }
  ram.setU16(p.meter, u16(ram.u16(p.meter) + d0));    // $28664E add.w D0,$81B5C0
  const cap = ram.u16(SCORE.capWord);                 // $286654
  if (cap > ram.u16(p.meter)) return;                 // $28665A cmp / bls -> clamp
  return capClamp(ram, rom, ctx, p, d1);              // $286660 bls $286664
}

function capClamp(ram, rom, ctx, p, d1) {
  ram.setU16(p.meter, ram.u16(SCORE.capWord));        // $286664
  if ((d1 & 0x8000) !== 0) return;                    // $28666E tst.w D1 / bmi -> rts
  const tableIndex = ram.u16(0x813094);
  let gain = rom.u16((ram.u16(p.hyper) !== 0 ? 0x286ecc : 0x286ec2) + tableIndex);
  const stock = ram.u16(p.who === 1 ? 0x81b65c : 0x81b65e);
  if (ram.u16(p.hyper) === 0) gain = u16(gain + rom.u16(0x2866d2 + stock * 2));
  if (stock !== 5 && (d1 & 0x04) === 0) gain = u16(gain + gain);
  if (HYPER_MUTATE.value === 'drop-cap-feed') return;
  const earn = p.who === 1 ? 0x81b64a : 0x81b64c;
  ram.setU16(earn, u16(ram.u16(earn) + gain));
  grantHyper287682(ram, rom, ctx, p.who === 2);
}

/**
 * `$2862C6` (P1) / `$286476` (P2) -- the per-hit CHAIN machine.
 *
 * D0 is the score value, packed BCD; D3 preserves it and the routine returns it
 * (`$286472 move.l D3,D0 / rts`), which is why `$28615E` can call this and then
 * keep using D0.
 *
 * THE FORK IS `$286314 tst.w $81B5C0 / bne $286366`: **the chain continues if
 * and only if the meter is non-zero AT THE MOMENT THE HIT REGISTERS.**  W19
 * §1.5 item 2 is the consequence -- a hit on the frame the meter would have
 * reached 0 SAVES the chain, because the refill happens before the decrement.
 * This port never decrements (see the header), so it can only ever be on the
 * "chain continues" side of that fork once a chain has started.
 */
export function chainHit(ram, rom, ctx, p, d0, d1) {
  const d3 = d0 >>> 0;                                // $2862C6 move.l D0,D3
  const sel = ram.u16(p.weaponSel);                   // $2862C8
  // $2862CE lea $287DF4,A0 / $2862D4 move.w (A0,D2.w),$81B5E0.  D2 is the
  // selector UNSCALED -- it is already a byte offset.
  ram.setU16(SCORE.refillAmt, rom.u16(SCORE.refillTable + sel));
  const laser = ram.u16(SCORE.laserRec);              // $2862DC move.w $811F72,D2
  if ((laser & 0x8000) !== 0 && (laser & 0x80) === 0  // $2862E2 bpl / $2862E4 btst #7
      && ram.u16(p.guard) === 0) {                    // $2862EA tst.w / beq $286320
    ram.setU16(p.chain, 0);                           // $286320 clr.w
    scoreAdd(ram, p, d3);                             // fall through to $286326
    return d3;
  }
  if ((ram.u8(SCORE.g30f9) & 1) !== 0) {              // $2862F2 btst #0 / bne $286326
    scoreAdd(ram, p, d3);
    return d3;
  }
  ram.setU16(p.w1e, 0x1e);                            // $2862FC
  if (ram.u16(p.hyper) !== 0) ram.setU16(p.w1e, 1);   // $286304 / $28630C
  if (ram.u16(p.meter) !== 0) {                       // $286314 tst.w / bne $286366
    return chainContinue(ram, rom, ctx, p, d3, d1);
  }
  refillMeter(ram, rom, ctx, p, d1);                  // $28631C bsr $28663A
  ram.setU16(p.chain, 0);                             // $286320 clr.w
  scoreAdd(ram, p, d3);                               // $286326
  return d3;
}

/** `$286326..$286362` -- the UNCHAINED add, and the popup reset. */
function scoreAdd(ram, p, d3) {
  bcdAdd(ram, p.pendingEnd, d3);                      // $286328/$28632E
  ram.setU32(p.acc1, d3);                             // $286332
  ram.setU32(p.acc2, d3);                             // $286338
  if (ram.u32(p.acc3) === 0) ram.setU16(p.popup, 0x50);  // $28633E / $286346
  ram.setU32(p.accA, 0);                              // $286350
  ram.setU32(p.accB, 0);                              // $286356
  ram.setU16(p.t4, 0);                                // $28635C
}

/** `$286366..$286472` -- the CHAINED path. */
function chainContinue(ram, rom, ctx, p, d3, d1) {
  if (ram.u32(p.acc1) !== 0) {                        // $286366 tst.l / beq $286390
    const d0 = ram.u32(p.acc1);
    ram.setU32(p.accA, d0);                           // $286374
    ram.setU32(p.accB, d0);                           // $28637A
    ram.setU16(p.chain, 1);                           // $286380
    ram.setU32(p.acc1, 0);                            // $28638A
  }
  // ---- $286390..$2863B2: a hand-rolled two-byte packed-BCD `+1`.
  //      D2's HIGH half takes byte 0 and its LOW half byte 1, so the two
  //      `abcd`s run LOW BYTE FIRST with the carry crossing the `swap`.
  const hi = ram.u8(p.chain), lo = ram.u8(p.chain + 1);
  const r0 = abcd(lo, 1, 0);                          // $2863A0/$2863A2 abcd D0,D2
  const r1 = abcd(hi, 0, r0.x);                       // $2863A6/$2863A8 swap / abcd
  ram.setU8(p.chain, r1.v);                           // $2863B2 move.w D2,(A0)
  ram.setU8(p.chain + 1, r0.v);
  if (ram.u16(p.hiwater) < ram.u16(p.chain)) {        // $2863B4/$2863BA cmp / bcc
    ram.setU16(p.hiwater, ram.u16(p.chain));          // $2863C2
  }
  bcdAdd(ram, p.accB, d3);                            // $2863CE/$2863D4
  bcdAdd(ram, p.acc3, ram.u32(p.accA));               // $2863D8/$2863DE/$2863E4
  refillMeter(ram, rom, ctx, p, d1);                  // $2863E8 bsr $28663A
  bcdAdd(ram, p.pendingEnd, ram.u32(p.accA));         // $2863EC/$2863F2/$2863F8
  const chain = ram.u16(p.chain);
  if (chain < 0x10) {                                 // $2863FE cmpi.w #$10 / bcc
    if (chain > 1) ram.setU16(p.t4, 0x78);            // $286408 cmpi.w #$1 / bls
    ram.setU16(p.t6, ram.u16(p.meter));               // $28641A
    if (ram.u32(p.acc3) === 0) ram.setU16(p.popup, 0xb4);  // $286424 / $28642C
    return d3;
  }
  if (chain === 0x10) {                               // $286436 bne $286444
    ram.setU16(p.tcc, 0);                             // $286438
    ram.setU16(p.t4, 0);                              // $28643E
  }
  ram.setU16(p.tc8, 0xf0);                            // $286444
  ram.setU16(p.tca, ram.u16(p.meter));                // $28644C
  ram.setU16(p.popup, 0xf0);                          // $286456
  ram.setU16(p.tdc, ram.u16(p.chain));                // $28645E
  ram.setU32(p.acc3, ram.u32(p.accB));                // $286468
  return d3;
}

/**
 * `$286774..$2867B2` -- the `$400` arm's RANK FEEDER, and the exact twin of
 * `$2867B4`, the LASER's, sixty-four bytes later.  Same divider word
 * `$81B636`, same `add.w D2,$81B64A`, same `jsr $287682`, same `#$8` reload;
 * only D2 differs.
 *
 * **AND ITS D2 IS ALWAYS `$18`.**  Read out of the listing:
 *
 *     28677c  moveq #$0,D2 / addi.w #$18,D2
 *     286782  cmpi.w #$5,$81B65C / beq $28679E
 *     28678c  bra $28679E                  <<-- and the fall-through goes there too
 *     28678e  addi.w #-$4,D2 ...           <<-- NINETEEN BYTES NOTHING REACHES
 *     28679e  add.w D2,$81B64A
 *
 * The `beq` and the `bra` have the SAME target, so `$28678E..$28679C` -- the
 * bomb-stock test's other arm and the hyper `+4` -- is unreachable in build B.
 * Transcribed as this comment and not as code, for the reason
 * `$2860CE`'s unreachable P2 mirror is: writing it would give the port a path
 * the cartridge has not got.  Whether it is a compiler artifact or a disabled
 * feature I do not know and do not claim.
 */
function bombRankFeed(ram, ctx) {
  const d = u16(ram.u16(SCORE.laserRankDivider) - 1);   // $286774 subq.w #1
  ram.setU16(SCORE.laserRankDivider, d);
  if (d !== 0xffff) return;                             // $28677A bcc -> rts
  ram.setU16(SCORE.rankAccum, u16(ram.u16(SCORE.rankAccum) + 0x18));  // $28679E
  grantHyper287682(ram, ctx.rom, ctx, false);           // $2867A4 jsr $287682
  ram.setU16(SCORE.laserRankDivider, 8);                // $2867AA/$2867AC
}

// ===========================================================================
// WAVE 424 (D60) -- `$286A82`, `$286AAA`, THE SHARED TAIL AND `$2867B4`.
//
// **THE OWNER EXECUTED THIS AND THE PORT REFUSED.**  `$286AAA IS NOT PORTED
// YET`, stage-2 boss, `c` held, `y` on top of it.  Everything below is
// transcribed from an `aligned.py` sweep of the image this wave, resumed from
// each of `$286B2E`, `$286B3C`, `$286B52` and `$286B6A` because the tool
// refuses at a flow break rather than guessing past one.
//
// **THE THREE ROUTINES ARE ONE BODY WITH THREE ENTRANCES**, and which entrance
// you came in by decides what is skipped:
//
//     $286A82  ($2860C8 bsr, the LASER arm of $286096)
//     $286AAA  ($28687E bne, the $400 arm's other entry -- the owner's throw)
//        \___ $286ABC  START: arm the item counter from nothing
//        \___ $286AEA  TAIL: rank feed, divider, item add, BCD add
//
// **WHAT $81B60C/$81B60E/$81B610/$81B612 ARE, and this is not a guess:**
// `src/hud.js` HUDRAM already names all four -- `itemTimer`, `itemDir`,
// `itemCount`, `itemKind`, the on-screen ITEM COUNTER `$2857B4` draws as an
// 8-nibble BCD walk.  `$284B3E` writes kind 7 and `$284AFE` kind 8 from the
// HUD side; this body writes kind 7 and timer $A.  So the laser's score arm is
// what PUTS THE COUNTER ON SCREEN and keeps re-arming its timer, and the HUD's
// own `$284AC2` block is what drains it.  A wave that ported this as "some
// chain words" would have missed that the four addresses are already named.
//
// **THE DIVIDER IS `$81B5DE`, THE SAME WORD `$2862FC` USES** (LEDGER.p1.w1e),
// not a private one -- so this arm and the ordinary chain machine share a
// countdown.  `$2867B4`'s divider is the OTHER one, `$81B636`.
//
// **`$286AE0` IS `addq.w #8,D2`, NOT `addq #0`.**  `5042`'s data field of 0
// means 8, so the reload is `16 - power`, not `8 - power`.  Getting this wrong
// halves the counter's rate and nothing would have gone red.
// ===========================================================================

/**
 * `$2867B4..$2867DC` -- **THE LASER'S RANK FEEDER**, the twin of `$286774`
 * sixty-four bytes earlier and its `rts` at `$2867B2` is literally the twin's
 * (`$2867BA bcc.s` displacement `$F6` branches BACKWARDS, to `$2867B2`, which
 * is `$286774`'s own `4E75`).
 *
 * The difference from the twin is D2 and only D2: `$18` unconditionally there,
 * **`4` here, or `$30` while a hyper is active** (`$2867BE tst.w $81B63E /
 * $2867C4 beq` steps over `$2867C6 moveq #$30,D2`).  Same `$81B636` divider,
 * same `add.w D2,$81B64A`, same `jsr $287682`, same `#8` reload.
 *
 * `37-recon-laser.md` §9.8: porting `$286A82` without this ships a laser that
 * scores and does not raise rank.  It is not shipped without it.
 */
function laserRankFeed(ram, ctx) {
  const d = u16(ram.u16(SCORE.laserRankDivider) - 1);   // $2867B4 subq.w #1
  ram.setU16(SCORE.laserRankDivider, d);
  if (d !== 0xffff) return;                             // $2867BA bcc -> $2867B2
  const d2 = ram.u16(LEDGER.p1.hyper) !== 0 ? 0x30 : 4; // $2867BC/$2867C4/$2867C6
  ram.setU16(SCORE.rankAccum, u16(ram.u16(SCORE.rankAccum) + d2));  // $2867C8
  grantHyper287682(ram, ctx?.rom, ctx, false);          // $2867CE jsr $287682
  ram.setU16(SCORE.laserRankDivider, 8);                // $2867D4/$2867D6
}

/** `$286ABC..$286AE8` -- START THE COUNTER FROM NOTHING.  Reached from
 *  `$286A8A beq` (timer already 0) and by falling out of `$286AAA`'s two
 *  tests.  Note the reload is `16 - power` and NOT the `(8-power)*1.5+$12`
 *  `$2868C2` uses: this is a different formula in the same file. */
function laserItemStart(ram) {
  ram.setU16(SCORE.itemTimer, 0x0a);                    // $286ABC move.w #$A
  ram.setU16(SCORE.itemKind, 0x07);                     // $286AC4 move.w #$7
  ram.setU16(SCORE.itemCount, 0);                       // $286ACC clr.w
  ram.setU16(SCORE.itemDir, 0);                         // $286AD2 clr.w
  const d2 = u16(u16(8 - ram.u16(LEDGER.p1.power)) + 8);  // $286AD8/$286ADA/$286AE0
  ram.setU16(LEDGER.p1.w1e, d2);                        // $286AE2 move.w D2,$81B5DE
}                                                       // $286AE8 rts

/** `$286B6A..$286B9A` -- the counter's CLAMP and the score's BCD add.  Both
 *  the divider-borrow path and the no-borrow path end here, so **the pending
 *  score gains D3 on every hit that reaches the tail**, while the counter only
 *  moves on a borrow. */
function laserClamp(ram, d3) {
  if (ram.u16(SCORE.itemCount) > 0x7fff) {              // $286B6A cmpi.w/$286B72 bls
    ram.setU16(SCORE.itemCount, 0x7fff);                // $286B76
  }
  bcdAdd(ram, LEDGER.p1.pendingEnd, d3);                // $286B7E/$286B80/$286B86
  ram.setU16(SCORE.itemTimer, 0x0a);                    // $286B8A move.w #$A
  ram.setU16(SCORE.itemKind, 0x07);                     // $286B92 move.w #$7
}                                                       // $286B9A rts

/** `$286B58..$286B68` -- add D0 to the counter, TWICE if D1 bit 6 is set.
 *  Same `btst #$6,D1` `$286966` uses for the chain's double increment, i.e.
 *  block 8's `$2452F2 ori.w #$4400,D4`. */
function laserItemAdd(ram, d0, d1, d3) {
  ram.setU16(SCORE.itemCount, u16(ram.u16(SCORE.itemCount) + d0));  // $286B58
  if ((d1 & 0x40) !== 0) {                              // $286B5E btst #$6,D1
    ram.setU16(SCORE.itemCount, u16(ram.u16(SCORE.itemCount) + d0));  // $286B64
  }
  return laserClamp(ram, d3);                           // falls into $286B6A
}

/**
 * `$286AEA..$286B9A` -- THE SHARED TAIL, and the piece both entrances need.
 *
 * `$286AF8 bsr.w` displaces `-$346` from the EXTENSION WORD `$286AFA`, so its
 * target is `$2867B4` and not `$2867B8`.  That is the trap the brief names and
 * it is the difference between the rank feeder and two bytes into it.
 *
 * `$286B02 bcc.s $286B6A` is UNSIGNED and it means NO BORROW: the divider was
 * non-zero, so the whole reload block AND the item add are skipped and only
 * the clamp plus the BCD add run.
 *
 * On a borrow the reload splits three ways, and the hyper arm is the odd one:
 *   * no hyper -> D0 = 1, divider = `16 - power`, minus 3 unless the option
 *     FORMATION `$810440` is exactly 2 (`$286B4E beq` steps over `$286B50
 *     subq.w #3,D2`);
 *   * hyper, stage 3 -> D0 = `1 + $81B654`, divider = 0, or 2 in a later loop;
 *   * hyper, any other stage -> D0 doubled, and doubled AGAIN in a later loop,
 *     divider 0.  So outside stage 3 a hyper adds 2 or 4 per tick and inside
 *     it adds `1 + level`.  Transcribed, not rationalised.
 */
function laserSharedTail(ram, ctx, d1, d3) {
  if ((ram.u16(SCORE.itemCount) & 0x8000) !== 0) {      // $286AEA tst.w/$286AF0 bpl
    ram.setU16(SCORE.itemCount, 0);                     // $286AF2 clr.w
  }
  laserRankFeed(ram, ctx);                              // $286AF8 bsr.w $2867B4
  const w = u16(ram.u16(LEDGER.p1.w1e) - 1);            // $286AFC subq.w #1
  ram.setU16(LEDGER.p1.w1e, w);
  if (w !== 0xffff) return laserClamp(ram, d3);         // $286B02 bcc -> $286B6A
  let d2 = 0;                                           // $286B04 moveq #0,D2
  let d0 = 1;                                           // $286B06 moveq #1,D0
  if (ram.u16(LEDGER.p1.hyper) === 0) {                 // $286B08 tst.w/$286B0E beq
    // ---- $286B3C: the ORDINARY reload.  16 - power, less 3 off formation 2.
    d2 = u16(u16(8 - ram.u16(LEDGER.p1.power)) + 8);    // $286B3C/$286B3E/$286B44
    if (ram.u16(LEDGER.p1.formation) !== 2) d2 = u16(d2 - 3);  // $286B46/$286B4E/$286B50
  } else {
    d0 = u16(d0 + ram.u16(LEDGER.p1.hyperLvl));         // $286B10 add.w $81B654,D0
    if (ram.u16(SCORE.stage) === 3) {                   // $286B16 cmpi.w #$3
      if (ram.u16(SCORE.loop) !== 0) d2 = 2;            // $286B22 tst.w/$286B2A addq
    } else {
      d0 = u16(d0 + d0);                                // $286B2E add.w D0,D0
      if (ram.u16(SCORE.loop) !== 0) d0 = u16(d0 + d0); // $286B30 tst.w/$286B38
    }
  }
  ram.setU16(LEDGER.p1.w1e, d2);                        // $286B52 move.w D2,$81B5DE
  return laserItemAdd(ram, d0, d1, d3);                 // -> $286B58
}

/**
 * `$286A82..$286AA8` -- **`$286096`'s LASER arm**, the `$2860C8 bsr`.  D0 is
 * `1 + $81B63E`, computed at `$2860C2`, exactly as `$2860E4` computes it for
 * the arm below.  `$2860CC bra.b $2860DE` means the plain P1 add STILL RUNS
 * after this, so both happen on one hit.
 *
 * The two tests are NOT `$286AAA`'s two:
 *   * `$286A84 tst.w $81B60C / beq $286ABC` -- no counter on screen, so start;
 *   * `$286A8C tst.w $81B62E / beq $286AEA` -- `bossHpLatch` (`src/hud.js`,
 *     `$284A7A bset.b #$0`).  **With no boss latched the tail runs whole; with
 *     a boss latched it jumps to `$286B58` and skips the rank feed, the
 *     divider and the reload entirely.**  That is why the owner's report is a
 *     BOSS report: the boss is what selects the short path here.
 *
 * **D1 IS LIVE ACROSS THIS CALL AND ITS BIT 6 MATTERS.**  `$286096` builds it
 * as `moveq #$5C,D1 / and.b (A6),D1` and `$5C` INCLUDES bit 6, so `$286B5E
 * btst #$6,D1` can double the item add on this entrance too.  Passing a zero
 * here would have been a silent halving that nothing measures.
 */
export function laserScoreHit(ram, ctx, d0, d1) {
  const d3 = d0 >>> 0;                                  // $286A82 move.l D0,D3
  if (ram.u16(SCORE.itemTimer) === 0) {                 // $286A84 tst.w/$286A8A beq
    return laserItemStart(ram);                         // -> $286ABC
  }
  if (ram.u16(SCORE.bossHpLatch) === 0) {               // $286A8C tst.w/$286A92 beq
    return laserSharedTail(ram, ctx, d1, d3);           // -> $286AEA
  }
  let d0out = 1;                                        // $286A94 moveq #1,D0
  if (ram.u16(LEDGER.p1.hyper) !== 0) {                 // $286A96 tst.w/$286A9C beq
    d0out = u16(d0out + ram.u16(LEDGER.p1.hyperLvl));   // $286AA0 add.w $81B654,D0
  }
  return laserItemAdd(ram, d0out, d1, d3);              // $286AA6 bra.w $286B58
}

/**
 * `$286AAA..$286AE8` -- **THE ARM THE OWNER HIT.**  `$28687E bne $286AAA`,
 * i.e. `$286876`'s `$8130F8` bit-2 fork, landing INSIDE `$286A82`'s body.
 *
 * `$286AB2 bmi.s $286AEA` -- **the BOMB-LASER's record NEGATIVE sends this
 * straight to the tail**, so in the owner's own scenario (the bomb selected
 * that weapon, which is what makes `$811F72` negative) the start block is
 * never reached and the tail runs from a divider whose value the previous
 * hits left behind.  A bench built on a fresh `Ram()` would run the start
 * block instead and never exercise the tail at all -- the W416 shape.
 */
export function laserAltHit(ram, ctx, d0, d1) {
  const d3 = d0 >>> 0;                                  // $286AAA move.l D0,D3
  if ((ram.u16(SCORE.laserRec) & 0x8000) !== 0) {       // $286AAC tst.w/$286AB2 bmi
    return laserSharedTail(ram, ctx, d1, d3);           // -> $286AEA
  }
  if (ram.u16(SCORE.itemTimer) !== 0) {                 // $286AB4 tst.w/$286ABA bne
    return laserSharedTail(ram, ctx, d1, d3);           // -> $286AEA
  }
  return laserItemStart(ram);                           // -> $286ABC
}

/**
 * `$286876..$286A80` -- `$286096`'s `$400`-bit arm, 523 bytes.  P1 only:
 * `$286118 bra.w $286B9C` is P2's and stays a note.
 *
 * It is a THIRD chain machine, beside `$2862C6`'s and `$28615E`'s, and it is
 * not a copy of either.  What it does that `$2862C6` does not:
 *   * it re-seeds the meter to a CONSTANT (`#$A`, or `#$19` while hypering)
 *     instead of refilling from `$287DF4`;
 *   * it seeds `$81B636`, the rank divider, from the player's POWER word;
 *   * it increments the chain ONE OR TWO times, chosen by `$286966 btst #$6,D1`
 *     -- D1 bit 6 is `$4000`, which only block 8's `$2452F2 ori.w #$4400,D4`
 *     sets.  So the beam's slot-30 object chains twice per hit and slot 27's
 *     `$400` chains once;
 *   * it runs `$286626` THREE times (accB, acc3, the pending score) where the
 *     ordinary chained path runs it three times in a different order with a
 *     `refillMeter` between.
 *
 * D0 is the score value (packed BCD) the caller computed at `$2860E4`
 * (`moveq #1 / add.w $81B63E`), D1 the hit mask.
 */
export function bombHitChain(ram, ctx, d0, d1) {
  // `$28687E bne $286AAA`.  **W424 (D60): PORTED.**  This was an `unreached`
  // throw and the owner's run died on it -- `$8130F8` bit 2 is set at boss
  // arrival by our own `initbody.js` (`| 0x05`), so the branch is taken every
  // time a `$400` hit lands at a boss.  It is a `bne`, not a `bsr`: the rest
  // of `$286876` does NOT run after it.
  if ((ram.u8(SCORE.g30f8) & 0x04) !== 0) {             // $286876 btst #$2/bne
    return laserAltHit(ram, ctx, d0, d1);               // $28687E bne $286AAA
  }
  const p = LEDGER.p1;
  const d3 = d0 >>> 0;                                  // $286882 move.l D0,D3
  const laser = ram.u16(SCORE.laserRec);                // $286884 tst.w $811F72
  if ((laser & 0x8000) === 0 && ram.u16(p.meter) === 0) {  // $28688A/$28688C bne
    // ---- $286894..$2868EC: START A CHAIN FROM NOTHING.  Six longs and two
    // words zeroed, the meter forced to 10, and the RANK DIVIDER seeded from
    // the player's power: `$8 - ($22,A4)`, plus half of itself, plus $12.
    ram.setU32(p.acc1, 0);                              // $286896
    ram.setU32(p.acc2, 0);                              // $28689C
    ram.setU32(p.accA, 0);                              // $2868A2
    ram.setU32(p.accB, 0);                              // $2868A8
    ram.setU16(p.chain, 0);                             // $2868AE
    ram.setU16(p.t4, 0);                                // $2868B4
    ram.setU16(p.meter, 0x0a);                          // $2868BA move.w #$A
    let d2 = u16(8 - ram.u16(p.power));                 // $2868C2/$2868C4
    d2 = u16(d2 + ((d2 & 0xffff) >>> 1));               // $2868CA..$2868CE
    d2 = u16(d2 + 0x12);                                // $2868D0 addi.w #$12
    ram.setU16(SCORE.laserRankDivider, d2);             // $2868D4
    if (ram.u16(p.hyper) !== 0) d2 = u16(d2 - 0x0c);    // $2868DA/$2868E2
    ram.setU16(p.w1e, d2);                              // $2868E6
    return;                                             // $2868EC rts
  }
  // ======================= $2868EE: THE CHAIN IS ALREADY UP =================
  bombRankFeed(ram, ctx);                               // $2868EE bsr $286774
  const w = u16(ram.u16(p.w1e) - 1);                    // $2868F2 subq.w #1
  ram.setU16(p.w1e, w);
  if (w !== 0xffff) {                                   // $2868F8 bcc $2869D8
    return bombMeterFloor(ram, p);                      // -> $2869D8
  }
  // ---- $2868FC..$28692E: the counter RELOAD, and it is a different formula
  // under a hyper (`$6 - $81B654`) from the one above (`$8 - ($22,A4)`), with
  // a `subq.w #3` unless the option FORMATION is exactly 2.
  let d2;
  if (ram.u16(p.hyper) !== 0) {
    d2 = u16(6 - ram.u16(p.hyperLvl));                  // $286904/$286906
  } else {
    d2 = u16(8 - ram.u16(p.power));                     // $28690E/$286910
    d2 = u16(d2 + ((d2 & 0xffff) >>> 1));               // $286916..$28691A
    d2 = u16(d2 + 1 + 0x11);                            // $28691C/$28691E
    if (ram.u16(p.formation) !== 2) d2 = u16(d2 - 3);   // $286922/$28692C
  }
  ram.setU16(p.w1e, d2);                                // $28692E
  if (ram.u32(p.acc1) !== 0) {                          // $286934 tst.l/beq
    const v = ram.u32(p.acc1);                          // $28693C
    ram.setU32(p.accA, v);                              // $286942
    ram.setU32(p.accB, v);                              // $286948
    ram.setU16(p.chain, 1);                             // $28694E
    ram.setU32(p.acc1, 0);                              // $286958
  }
  // ---- $28695E..$286990: the packed-BCD `+1`, ONE OR TWO TIMES.
  //      `$286966 btst #$6,D1` -- D1 bit 6 is $4000, block 8's own hit bit --
  //      makes D0 = 1, and `$286990 dbra D0` therefore runs the body TWICE.
  const reps = (d1 & 0x40) !== 0 ? 2 : 1;               // $286966/$28696C
  for (let n = 0; n < reps; n++) {
    const hi = ram.u8(p.chain), lo = ram.u8(p.chain + 1);
    const r0 = abcd(lo, 1, 0);                          // $28697C abcd D0,D2
    const r1 = abcd(hi, 0, r0.x);                       // $286980/$286982
    ram.setU8(p.chain, r1.v);                           // $28698C move.w D2,(A0)
    ram.setU8(p.chain + 1, r0.v);
  }
  if (ram.u16(p.hiwater) < ram.u16(p.chain)) {          // $286994/$28699A bcc
    ram.setU16(p.hiwater, ram.u16(p.chain));            // $2869A2
  }
  bcdAdd(ram, p.accB, d3);                              // $2869AC..$2869B4
  bcdAdd(ram, p.acc3, ram.u32(p.accA));                 // $2869B8..$2869C4
  bcdAdd(ram, p.pendingEnd, ram.u32(p.accA));           // $2869C8..$2869D4
  return bombMeterFloor(ram, p);                        // fall into $2869D8
}

/** `$2869D8..$286A80` -- the meter FLOOR (10, or 25 while hypering) and the
 *  same two popup arms `$2863FE` has, split at chain `$10`. */
function bombMeterFloor(ram, p) {
  if (ram.u16(p.hyper) === 0) {                         // $2869D8 tst.w/bne
    if (ram.u16(p.meter) < 0x0a) ram.setU16(p.meter, 0x0a);   // $2869E0/$2869EA
  } else if (ram.u16(p.meter) < 0x19) {                 // $2869F4
    ram.setU16(p.meter, 0x19);                          // $2869FE
  }
  const chain = ram.u16(p.chain);
  if (chain < 0x10) {                                   // $286A06 cmpi.w/bcc
    if (chain > 1) ram.setU16(p.t4, 0x78);              // $286A10 bls / $286A1A
    ram.setU16(p.t6, ram.u16(p.meter));                 // $286A22
    if (ram.u32(p.acc3) === 0) ram.setU16(p.popup, 0xb4);  // $286A2C/$286A34
    return;                                             // $286A3C rts
  }
  // ---- $286A3E: and note it is `tst.w $81B5CA / bne`, i.e. gated on TCA,
  // where `$286436`'s equivalent is `cmpi.w #$10,chain / bne`.  Not the same
  // condition and not the same two writes.
  if (ram.u16(p.tca) === 0) {                           // $286A3E tst.w/bne
    ram.setU16(p.tcc, 0);                               // $286A46
    ram.setU16(p.t4, 0);                                // $286A4C
  }
  ram.setU16(p.tc8, 0xf0);                              // $286A52
  ram.setU16(p.tca, ram.u16(p.meter));                  // $286A5A
  ram.setU16(p.tdc, ram.u16(p.chain));                  // $286A64
  ram.setU32(p.acc3, ram.u32(p.accB));                  // $286A6E
  ram.setU16(p.popup, 0xf0);                            // $286A78
}

/**
 * `$286096` -- A HIT LANDS.
 *
 * D1 is the HIT MASK the caller built with `moveq #$5C,D1 / and.b (A6),D1`, so
 * bit 4 is "P1 hit this" and bit 3 is "P2 hit this" -- the same `$1000`/`$800`
 * `src/damage.js` ORs into the enemy's type word.  **The routine computes its
 * own value: `moveq #1,D0 / add.w $81B63E,D0` -- ONE POINT PLUS THE HYPER
 * LEVEL** (W19 §1.2), so all 85 call sites score the same thing and none of
 * them carries an amount.
 *
 * **W38 §4.3 CORRECTS THE NAME ABOVE AND IT IS WORTH THE LINE:** `$81B63E` is
 * the hyper's 0/1 ACTIVE FLAG, not its level (the level is `$81B654`), so the
 * value added is 1 or 2 and never level-scaled.  The arithmetic this file
 * shipped was right; the sentence describing it was not.
 *
 * `$286096 btst #1,(A6) / beq` -- an enemy whose sub-record byte 0 has bit 1
 * set scores NOTHING and the routine returns immediately.  A6 is the enemy's
 * sub-record, so this is per-enemy and must be transcribed even though no
 * stage-1 handler is known to set it.
 */
export function scoreHit(ram, ctx, a6, d1) {
  if ((ram.u8(a6) & 0x02) !== 0) return;              // $286096 btst #1,(A6)
  let skipP1 = false;
  if ((ram.u8(SCORE.g30f8) & 0x04) !== 0) {           // $28609E btst #2,$8130F8
    const d2 = ram.u16(SCORE.laserRec);               // $2860A8 move.w $811F72,D2
    if ((d2 & 0x8000) !== 0 && (d2 & 0x01) !== 0      // $2860AE bpl / $2860B0 btst #0
        && (d2 & 0x0080) === 0) {                     // $2860B8 tst.b D2 / bmi
      if ((d1 & 0x10) !== 0) {                        // $2860BC btst #4,D1
        // **W424 (D60): PORTED**, with `$2867B4` beside it as §9.8 demands.
        // `$2860C2 add.w $81B63E,D0` first -- the same `1 + hyper` value
        // `$2860E4` computes for the arm below -- and `$2860CC bra.b $2860DE`
        // then falls through to it, so BOTH happen on one hit, in this order.
        const d0 = u16(1 + ram.u16(LEDGER.p1.hyper)); // $2860B6/$2860C2
        laserScoreHit(ram, ctx, d0, d1);              // $2860C8 bsr.w $286A82
      } else {
        // ---------------------------------------------------------------
        // $2860C0 `beq.b $286102`, and it goes to **$286102**, not to the P2
        // laser arm eight bytes later.  So `$2860CE..$2860DC` -- `btst #3,D1 /
        // add.w $81B640,D0 / bsr $286DA8`, an entire P2 mirror of the arm
        // above -- IS UNREACHABLE.  Nothing in $286096 branches to $2860CE and
        // $2860CC `bra.b $2860DE` steps over it.
        //
        // It is transcribed as this comment and not as code, because writing
        // it as code would give the port a path the cartridge does not have.
        // `$286DA8` is in SCORE.altLaserP2 for the record.
        // ---------------------------------------------------------------
        skipP1 = true;                                // -> $286102
      }
    }
  }
  if (!skipP1 && (d1 & 0x10) !== 0) {                 // $2860DE btst #4,D1
    const d0 = u16(1 + ram.u16(LEDGER.p1.hyper));     // $2860E4/$2860E6
    if ((d1 & 0x04) !== 0) {                          // $2860EC btst #2,D1
      // $2860F0 `beq $2860F8`, so this runs INSTEAD of the plain add below,
      // never as well -- unlike the laser arm at $2860C8, whose $2860CC `bra`
      // rejoins.  W51: PORTED, because the beam sets the $400 bit.
      bombHitChain(ram, ctx, d0, d1);                 // $2860F2 bsr $286876
    } else {
      bcdAdd(ram, LEDGER.p1.pendingEnd, d0);          // $2860F8/$2860FE
    }
  }
  if ((d1 & 0x08) !== 0) {                            // $286102 btst #3,D1
    const d0 = u16(1 + ram.u16(LEDGER.p2.hyper));     // $28610A/$28610C
    if ((d1 & 0x04) !== 0) {                          // $286112 btst #2,D1
      note(ctx, 0x286b9c, `$286118 bra.w $286B9C -- $286096's P2 BOMB arm`);
    } else {
      bcdAdd(ram, LEDGER.p2.pendingEnd, d0);          // $28611C/$286122
    }
  }
}

/**
 * `$28615E` -- A KILL.  D0 is the enemy's score value, packed BCD, from the
 * CALL SITE; D1 is the same hit mask `$286096` took.
 *
 * `$28615E` FIRST rewrites the meter cap from `$287DF0[$813098 * 2]` -- so the
 * cap is refreshed on every kill and W19 measured `$28616C` writing `$81B5B2`
 * 232 times in a 4,600-frame run.  Then it runs the chain machine, and if a
 * HYPER is up it re-enters that machine `$81B654` more times.
 */
export function scoreKill(ram, rom, ctx, d0, d1) {
  // The one hook this file offers a runner: every `$28615E` with its D0 (the
  // enemy's score value, from the call site) and its D1 (which player).  A
  // KILL is the thing a damage wave has to be able to count, and counting
  // `freeEnemy` would count off-screen exits too.
  ctx?.killEvent?.(d0, d1);
  const loop = ram.u16(SCORE.loop);                   // $28615E
  ram.setU16(SCORE.capWord, rom.u16(SCORE.capTable + u16(loop + loop)));  // $28616C
  if ((d1 & 0x10) !== 0) {                            // $286174 btst #4,D1
    killFor(ram, rom, ctx, LEDGER.p1, d0, d1);
  }
  if ((d1 & 0x08) !== 0) {                            // $28621C btst #3,D1
    killFor(ram, rom, ctx, LEDGER.p2, d0, d1);
  }
}

function killFor(ram, rom, ctx, p, d0, d1) {
  chainHit(ram, rom, ctx, p, d0, d1);                 // $28617C / $286224 bsr
  if (ram.u16(p.hyper) === 0) return;                 // $286180 / $286228 tst.w / beq
  // ---- $28618A..$286218: the HYPER repeat.  D2 = the hyper LEVEL - 1 and the
  // block below runs D2+1 times through a `dbra`.  With a level of 0 the `dbra`
  // runs 65,536 times; that is the board's arithmetic and it is transcribed as
  // such rather than guarded, because a guard would be a rule the ROM has not
  // got.  No run has ever had `$81B63E` non-zero (W19 §1.4), so this whole
  // block is transcribed-and-unexercised and says so.
  let d2 = u16(ram.u16(p.hyperLvl) - 1);              // $28618A/$286190
  if (ram.u32(p.acc1) !== 0) {                        // $286192 tst.l / beq $2861BC
    const v = ram.u32(p.acc1);
    ram.setU32(p.accA, v);                            // $2861A0
    ram.setU32(p.accB, v);                            // $2861A6
    ram.setU16(p.chain, 1);                           // $2861AC
    ram.setU32(p.acc1, 0);                            // $2861B6
  }
  for (;;) {                                          // $2861BC .. $286218 dbra
    const saved = ram.u32(p.accA);                    // $2861BE move.l $81B5CE,D0 / -(A7)
    if (ram.u16(SCORE.loop) !== 0) {                  // $2861C6 tst.w / bne $28620A
      chainHit(ram, rom, ctx, p, 0, d1);              // $28620A moveq #0,D0 / bsr
    } else {
      ram.setU32(p.accA, saved >>> 4);                // $2861D0 lsr.l #4 / $2861D2
      chainHit(ram, rom, ctx, p, 0, d1);              // $2861D8/$2861DA
      for (let k = 0; k < 4; k++) {                   // $2861DE..$286202, four times
        bcdAdd(ram, p.pendingEnd, ram.u32(p.accA));   // the $28614A/$286154 wrapper
      }
    }
    ram.setU32(p.accA, saved);                        // $286210 move.l (A7)+,$81B5CE
    if (d2 === 0) break;                              // $286218 dbra D2
    d2 = u16(d2 - 1);
  }
}

/** `$28614A` (P1) / `$286154` (P2) -- `lea <pendingEnd>,A0 / bra $286626`. */
export function scorePending(ram, who, d0) {
  bcdAdd(ram, who === 2 ? LEDGER.p2.pendingEnd : LEDGER.p1.pendingEnd, d0);
}

/** `$286128` -- the by-D1 wrapper: bit 4 credits P1, bit 3 credits P2, and it
 *  can credit BOTH in one call (`$286134 bsr` then `$286138 btst #3`). */
export function scoreByMask(ram, d0, d1) {
  if ((d1 & 0x10) !== 0) bcdAdd(ram, LEDGER.p1.pendingEnd, d0);   // $28612E/$286134
  if ((d1 & 0x08) !== 0) bcdAdd(ram, LEDGER.p2.pendingEnd, d0);   // $28613E/$286144
}

/** **W63 (B1) RETIRED THIS NOTE, and the function is kept as the record.**
 *
 *  It fired once per collision pass for twenty-nine waves, saying that object
 *  type 0 was not ported and that "a chain this port starts never expires".
 *  `$240F62[0] = $28D520` is now DISPATCHED (`src/hud.js`, W63): `$2842B0`
 *  drains the pending score into the total and `$284636`/`$2847D4` decrement
 *  both chain meters, in the cartridge's own slot -- which is priority `$0009`,
 *  the LAST of the three ledger objects, exactly where W19 §1.5 measured the
 *  meter decrement.
 *
 *  The call site (`src/type5.js:371`) is kept and the note is not, because a
 *  note that has stopped being true is worse than no note: it is the shape of
 *  claim this project has been wrong about most often.  The function is a
 *  no-op with its history attached rather than a deletion, so a reader who
 *  greps `$28D520` in this file finds the answer instead of a hole. */
export function notePerFrameLedger(ctx) {
  void ctx;
}
