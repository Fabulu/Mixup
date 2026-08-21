// OBJECT DISPATCH [12], `$28F3AC` -- THE NAME-ENTRY SCREEN'S SPINE, AND THE FRAME THE FRONT END
// CLOSES ON ITSELF.  W387.
//
// ===============================================================================================
// THE ANSWER IN ONE LINE
// ===============================================================================================
//
// `$28F3AC` is a THREE-STATE object and two of its three states are teardown-shaped.  On a real
// cold boot with no buttons held it runs for exactly TWO frames: state 0 initialises the screen,
// finds `$8130CC` empty -- nobody owes a name -- and state 1 falls straight into `$28F368`, which
// stages dispatch type 8, the ATTRACT SEQUENCER.  That is the front-end loop closing:
//
//     attract [8] -> coin -> play -> game over [$D] -> [$E] -> [$C] -> attract [8]
//
// ===============================================================================================
// WHERE THE BRIEF THAT SET THIS WAVE IS WRONG.  FIVE PLACES, ALL PINNED IN THE TEST FILE.
// ===============================================================================================
//
// 1. **"THE UNIT ... 1,522 BYTES IS A LOT."**  `$28F2BA..$28F8AB` is $5F2 bytes and that count is
//    correct, but it is the FIRST of three code blocks, not the unit.  `$28F4F4`, `$28F4F8`,
//    `$28F580`, `$28F572`, `$28F57C`, `$28F4CA`, `$28F4E0` and `$28F4EE` are all `bsr`/`jsr` to
//    code ABOVE `$28F8AB`, and the object's owned span really runs `$28F2BA..$2901DF` --
//    **$F26 = 3,878 bytes**, code and data.  See SECTION 1 of the test file, which walks it.
//
// 2. **"`$28F3AC`: UNCLAIMED."**  True of that one address and badly misleading about the unit.
//    `src/hiscorename.js` is ONE THOUSAND AND TWENTY-NINE LINES of already-ported name-entry
//    body -- W301, W304-W311 and W382 -- and none of it had a caller.  This wave wrote the
//    HEAD, not the screen: `$28F2BA`, `$28F368`, `$28F3AC` and the two per-side entries
//    `$28F3F8`/`$28F450` are $154 bytes of new transcription that make ~700 lines of existing,
//    tested, unreachable code reachable.  `claimed.py <entry>` is not a survey of a subsystem.
//
// 3. **"its four fade targets ... one windowed, three not."**  Right, and the reason matters:
//    `$2254B8` is windowed because the RESULT screen (W125, `$28D9DA`) installs the SAME ROM
//    block as its bank $11.  One block, two screens, two banks.
//
// 4. **"data `$28FAD2` ... the only live use of that family."**  It is not live on the path this
//    wave closes.  `$28F520 lea ($28FAD2,PC),A0 / $28F526 jsr $246704` sits inside
//    `nameCountdown28F4FC`, which is reached only after a name has been COMMITTED, which needs
//    `$8130CC` non-zero.  Measured on a real cold boot: `$8130CC` is `$00`, so `$28FAD2` is read
//    zero times.  Both script extents in the brief ($3A and $22) are CORRECT and re-derived by
//    `check_name_entry_fade_sources` in `tools/export-tables.py`.
//
// 5. **"`rts` AT `$28F8AA`".**  Correct.  `aligned.py sweep` and the raw image agree, and the
//    test asserts the `4E75` as bytes.
//
// ===============================================================================================
// THE STATE MACHINE, AND WHY TWO OF ITS THREE STATES END THE SCREEN
// ===============================================================================================
//
//     28f3ac  tst.b ($2,A5)     / beq.w $28F2BA     state 0 -> INIT
//     28f3b4  cmpi.b #$2,($2,A5)/ beq   $28F368     state 2 -> TEARDOWN
//     28f3bc  move.b ($5,A5),D0                     the WORK LIST, $8130CC's copy
//     28f3c0  cmpi.b #$0,D0     / beq   $28F368     nobody owes a name -> TEARDOWN
//     28f3c6  cmpi.b #$3,D0     / bne   $28F3DC     both sides -> both arms, in order
//     28f3dc  btst #$0,D0                           P1 alone
//     28f3ea  btst #$1,D0                           P2 alone
//
// **`$28F3D2 moveq #$3,D0` IS DEAD.**  It sits between the two `jsr`s of the both-sides arm, and
// `$28F450`'s first act is `lea $81E096,A4` followed by `jsr $23D17E`, which OVERWRITES D0 before
// anything reads it.  Transcribed as a comment rather than as a store, because a port that kept
// it would imply the second arm is parameterised and it is not -- the two arms are hard-coded
// twins, one per side.
//
// **THE TWO EXITS ARE NOT THE SAME EXIT.**  State 2 is reached from `$28F6DA move.b #$2,($2,A5)`,
// which `hiscorename.js` reaches two ways (the work list emptying, and the countdown expiring).
// The `($5,A5) == 0` arm is reached on the FRAME AFTER an init that found nothing to do.  Both
// land on `$28F368`, and that is the whole of the difference: one screen ran, one did not.
//
// ===============================================================================================
// WHAT THIS FILE PORTS AND WHAT IT COUNTS
// ===============================================================================================
//
// PORTED AND CALLED, with byte extents measured off the raw image:
//
//     $28F2BA..$28F367   $AE   state 0, the init
//     $28F368..$28F3AB   $44   the teardown, which stages dispatch type 8
//     $28F3AC..$28F3F7   $4C   the dispatcher
//     $28F3F8..$28F44F   $58   the P1 arm's head
//     $28F450..$28F4C3   $74   the P2 arm's head, and the shared `$28F4A6` grid arm
//                        $154  of new transcription, and it makes ~700 lines of hiscorename.js
//                              reachable for the first time
//
// COUNTED, every extent measured the same way:
//
//     $259C4A..$259CB7   $6E   `$28F36E`'s clear -- and this one is not transcribed ANYWHERE:
//                              `$259CA0 jsr $25A182` is a call out of the middle of it, so
//                              porting the visible half would put the whole routine's name on
//                              two thirds of its behaviour.
//     $28C0FC            --    the stream post every front-end teardown counts (objslot8.js)
//     $28F7F4..$28F8AB   $B8   the panel draw.  Already counted by `hiscorename.js`, from three
//                              of its four call sites; this file adds the fourth ($28F584).
//     $28FAF4..$28FB89   $96   the animated furniture: three draws through $23DFEA/$23E020 off
//                              the six tables at $28F9AC..$28FA23
//     $28FB8A..$28FC35   $AC   the SCORE draw, $8C of code and the $20-byte digit-offset table
//                              at $28FC16 it indexes with the score's nibbles
//     $28FC36..$28FCA9   $74   the header draw, $60 of code and the five art longwords at
//                              $28FC96 it indexes with the row index ($38,A4)
//
// ===============================================================================================
// THE CLEARS: TRANSCRIBED, TESTED, AND -- SINCE W388 -- CALLED. THE PRICE WAS PAID.
// ===============================================================================================
//
// `$24A810..$24A823` ($14) and `$2603DA..$2603FD` ($24) are six and seven instructions with no
// branch and no call, and both are transcribed here as `clearPlayerRam24A810` and
// `clearRankRam2603DA`, with `w387slot12.test.js` SECTION 7 proving both ends of both spans.
//
// Between them they wipe `$8103E6..$812977` (9,618 bytes) and `$81308C..$813157` (204 bytes) --
// which is the whole player subsystem, the rank subsystem's pointers, `$8130FA` (tally.js's
// `TALLY.side0`) and `$8130BE` (the lives counter).
//
// **W387 COUNTED THEM RATHER THAN CALLING THEM, and priced the change at six assertions in three
// files. W388 CALLED THEM AND THE PRICE WAS EXACTLY RIGHT.** Every one of the six was a
// measurement taken at the LAST FRAME of a run that had no teardown in it, and every one has been
// re-based to the frame on which its subject still exists rather than weakened:
//
//     w384stall.test.js  "the odometer stops short of the boss lock"      -> `RUN.odoPeak`
//                        "the two dispatcher entries $25FE42 fills"       -> `RUN.atTeardown`
//                        "the boss is NEVER REACHED ... and it SURVIVES"  -> `RUN.atTeardown`
//                        "DEFERRAL 2 IS GONE: $2603FE is stagePair2603FE" -> `RUN.atTeardown`
//     w385player.test.js "the lives counter is seeded from the DIP"       -> its own +2,500 boot
//     w386gameover.test.js / w387slot12.test.js -- the note census, which LOSES two lines
//
// `w384stall.test.js`'s run now carries an eleven-word snapshot refreshed while the tally block is
// live, so "the last frame" and "the last frame the player subsystem existed" are separate and
// both assertable. The teardown's own effect is asserted positively in
// `w388hiscorechain.test.js` SECTION 6, on the real game-over path, with both spans' ends checked
// and the first word past each end proved untouched.
//
// **`$259C4A` IS STILL COUNTED and is the only one of the three that is not ported**: `$259CA0` is
// a `jsr` out of the middle of it, so it is not a straight-line clear and porting the visible half
// would put the whole routine's name on two thirds of its behaviour.
//
// Total counted below this object: $258 bytes of draw code and $6E of clear.  NONE of it is on
// the cold-boot path except the `$259C4A` note and `$28C0FC` -- SECTION 4 of the test file
// pins the whole set at exactly two notes, one fire each.

import { clearTx23C622 } from './background.js';
import { install24150A, install2414BE } from './palette.js';
import { stageCreate, queueKill } from './objalloc.js';
import { hiscoreCheck287BD2, hiscoreCheck287C08 } from './hiscore.js';
import { readInput23D186 } from './tallyscreen.js';
import { startRaw23D16C } from './objslot8.js';
import {
  NAME_OBJ, NAME_REC, nameArm28F428, nameArmGrid28F4A6, drawGridFrame28F4C4,
  nameCountdown28F4FC, nameFrameBands28F542, nameButtons28F588, cursorFrame28F55E,
} from './hiscorename.js';

export const SLOT12 = Object.freeze({
  entry: 0x28f3ac,
  init: 0x28f2ba,
  teardown: 0x28f368,
  arms: Object.freeze([0x28f3f8, 0x28f450]),
  gridArm: 0x28f4a6,
  end: 0x28f8aa,               // the `4E75` ITSELF, not one past it (trap 5)

  stateAt: NAME_OBJ.state,     // ($2,A5)
  owedAt: NAME_OBJ.owed,       // ($5,A5) -- $8130CC's copy
  doneState: NAME_OBJ.doneState,
  idAt: 0x4c,                  // $241292 does `lea ($4C,A5),A0`

  // $28F2C6 lea $81E056,A0 / move.w #$41,D0 / dbra -- $42 WORDS (trap 2), $84 bytes, which is
  // exactly P1's record, P2's record and the two globals above them: $81E056 + $84 == $81E0DA.
  work: 0x81e056,
  workWords: 0x42,
  records: Object.freeze([0x81e056, 0x81e096]),

  // $28F2D8..$28F317 -- four `lea src,A0 / move.w #bank,D0 / jsr $24150A`, in THIS order.
  fades: Object.freeze([
    Object.freeze({ src: 0x2254b8, bank: 2, site: 0x28f2e2 }),
    Object.freeze({ src: 0x2254f8, bank: 3, site: 0x28f2f2 }),
    Object.freeze({ src: 0x225538, bank: 4, site: 0x28f302 }),
    Object.freeze({ src: 0x225478, bank: 5, site: 0x28f312 }),
  ]),
  fadeBytes: 0x40,             // $241518 moveq #$F / move.l (A0)+,(A1)+ / dbra -- 16 longwords

  players: Object.freeze([0x8103e6, 0x810448]),   // $28F318 / $28F334 tst.w
  flags: 0x8130cc,             // the work list's SOURCE
  flagBits: Object.freeze([0x01, 0x02]),          // $28F32C ori.b #$1 / $28F348 ori.b #$2
  entryCue: 0x28cb74,          // $28F360 jsr -- sound.js STREAMING_LEAVES, id 10

  // The teardown's chain, in the cartridge's order, with the extent and the exact RAM span each
  // one wipes. **ONLY THE MIDDLE ONE IS STILL COUNTED** -- W388 calls the other two; their rows
  // stay here because the extents are the measurement, and `w387slot12.test.js` SECTION 4 reads
  // them. See the CLEARS block in this file's header.
  clears: Object.freeze([
    Object.freeze({ at: 0x24a810, site: 0x28f368,
      why: '$28F368 jsr $24A810 -- $24A810..$24A823, $14 bytes: `move.w #$12C8,D0 / moveq #$0,D1 '
        + '/ lea $8103E6,A0 / move.w D1,(A0)+ / dbra`, so $12C9 WORDS (trap 2) = $8103E6..$812977, '
        + '9,618 bytes of player RAM. `clearPlayerRam24A810` in objslot12.js transcribes it, '
        + 'w387slot12.test.js SECTION 7 proves both ends, and W388 CALLS IT -- this row is the '
        + 'extent, not a deferral, and nothing counts this address any more' }),
    Object.freeze({ at: 0x259c4a, site: 0x28f36e,
      why: '$28F36E jsr $259C4A -- $259C4A..$259CB7, $6E bytes: clears $81E0DA, the eight '
        + 'longwords at $812E08, and $812E28/$812E48/$812E4A. NOT transcribed at all, because '
        + '$259CA0 jsr $25A182 is a call out of the middle of it, so porting the visible half '
        + 'would put the whole routine\'s name on two thirds of its behaviour' }),
    Object.freeze({ at: 0x2603da, site: 0x28f374,
      why: '$28F374 jsr $2603DA -- $2603DA..$2603FD, $24 bytes: $66 words (trap 2) from $81308C '
        + '= $81308C..$813157, then $FFFF into $8130BE and $8130C0, which are INSIDE that span. '
        + 'It also clears $8130CC, this screen\'s own work list, and $8130FA, tally.js TALLY.side0. '
        + '`clearRankRam2603DA` transcribes it and W388 CALLS IT -- this row is the extent, not a '
        + 'deferral, and nothing counts this address any more' }),
  ]),
  kill: 0x241292,
  cueStream: 0x28c0fc,
  txPal: 0x222638,             // $28F38C lea / $28F392 moveq #$0,D0 / $28F394 jsr $2414BE
  childType: 0x08,             // $28F39A move.w #$8,D0 -- THE ATTRACT SEQUENCER
  childState: 0x0002,          // $28F3A4 move.w #$2,($4,A0)
  stateField: 0x04,
  dispatch: 0x240f62,

  frameAt: 0x02,               // ($2,A4) -- the screen's frame counter, $28F412's gate
  rawAt: 0x34,                 // $28F404 / $28F45C move.w D0,($34,A4)
  edgeAt: NAME_REC.input,      // $28F40E / $28F466 move.w D0,($36,A4)  == $36
  active: 0x81e0d6,            // $28F442 / $28F49C tst.w -- the grid's global "already armed"

  // The three draw routines below this object, with the extents this wave measured.
  draws: Object.freeze([
    Object.freeze({ at: 0x28faf4, bytes: 0x96, site: 0x28f580,
      why: 'the animated panel furniture -- three draws through $23DFEA/$23E020 off the six '
        + 'tables at $28F9AC..$28FA23, with two independent phase counters in ($22)/($26)' }),
    Object.freeze({ at: 0x28fb8a, bytes: 0xac, site: 0x28f4f4,
      why: 'the SCORE draw -- $8C of code plus the $20-byte digit-offset table at $28FC16, '
        + 'walked by `lsr.l #4` over ($C,A4) with the overflow half in ($10,A4)' }),
    Object.freeze({ at: 0x28fc36, bytes: 0x74, site: 0x28f4f8,
      why: 'the header draw -- $60 of code plus the five art longwords at $28FC96, indexed by '
        + 'the matched row index ($38,A4)' }),
  ]),
  panelDraw: 0x28f7f4,
  panelDrawBytes: 0xb8,
});

// ---------------------------------------------------------------------------------------------
// The remaining ctx-shaped gap is counted below.

/** `$23C622` -- clear the TX layer. `Game#ctx()` carries the `TxVram` as BOTH `tx` and `txvram`,
 *  so on the driver path this always runs; slots [9], [13], [14] and [17] all call
 *  `clearTx23C622(ctx.tx)` UNGUARDED and throw on a bare ctx. This file guards and COUNTS
 *  instead, so a unit test can drive the two teardown-shaped states without a TxVram and the
 *  gap stays visible in the report rather than becoming a silent no-op. */
function clearTx(ctx, site) {
  if (!ctx?.tx) {
    ctx?.unported?.note(0x23c622, `$${site.toString(16).toUpperCase()} jsr $23C622 -- no TxVram `
      + 'on this chain, so the TX layer was not cleared');
    return;
  }
  clearTx23C622(ctx.tx);
}

// `$28C0FC -> $28BB76` is an ENTRY that posts bare `$10000000`, not an address-only
// WRAPPERS row. Keep this call as the same counted gap as the three slot [8] sites.
const CUE_STREAM_NOTE = ' jsr $28C0FC -- $28C0FC -> $28BB76 posts the bare longword '
  + '$10000000 (type $10), NOT the $28BB04 packer every sound.js WRAPPERS row describes, so '
  + 'posting it throws. Counted with the three slot [8] call sites';

// ---------------------------------------------------------------------------------------------

/**
 * `$24A810` -- `move.w #$12C8,D0 / moveq #$0,D1 / lea $8103E6,A0 / move.w D1,(A0)+ / dbra`.
 * TWENTY BYTES, `$24A810..$24A823`, and the `rts` is at `$24A822`.
 *
 * **THE DBRA RUNS N+1 TIMES** (trap 2), so this is `$12C9` = 4,809 words = 9,618 bytes, clearing
 * `$8103E6..$812977`: both player records and everything the run built between them. Transcribed
 * rather than counted because it is six instructions with no call and no branch, and counting it
 * would leave the attract screen looking at a finished game's RAM.
 *
 * `frontend.js RESET_PROLOGUE` lists this address as one of the twenty-three calls the reset
 * routine makes before `$23BF74`; that list is an inventory of addresses, not a port, so this is
 * the first time the instructions themselves are run anywhere in the build.
 */
export function clearPlayerRam24A810(ram) {
  for (let i = 0; i < 0x12c9; i++) ram.setU16(0x8103e6 + i * 2, 0);
}

/**
 * `$2603DA` -- `lea $81308C,A0 / move.w #$65,D0 / move.w #$0,(A0)+ / dbra`, then TWO `$FFFF`
 * stores. THIRTY-SIX BYTES, `$2603DA..$2603FD`, `rts` at `$2603FC`.
 *
 * `$66` = 102 words = 204 bytes, `$81308C..$813157`. **The order is load-bearing and the two are
 * not independent**: `$8130BE` and `$8130C0` are INSIDE the cleared span, so the two `$FFFF`
 * stores must happen after the loop, which is what the cartridge does. So is `$8130CC` -- this
 * routine is what resets the work list, and it runs in the teardown of the screen that consumed
 * it. `rank.js` already carries the ADDRESS as `RANK.teardown2603DA`; nothing ran the body.
 */
export function clearRankRam2603DA(ram) {
  for (let i = 0; i < 0x66; i++) ram.setU16(0x81308c + i * 2, 0);   // $2603E4 / $2603E8 dbra
  ram.setU16(0x8130be, 0xffff);                                    // $2603EC
  ram.setU16(0x8130c0, 0xffff);                                    // $2603F4
}

/**
 * `$28F2BA` -- STATE 0. Clear the screen, install four palettes, and ask BOTH sides whether they
 * made the table.
 *
 * @returns {number} the work list it left in `($5,A5)`, which is what state 1 branches on.
 *
 * **THE TWO HIGH-SCORE CHECKS ARE GATED ON THE PLAYER RECORD'S SIGN BIT, NOT ON WHETHER THE SIDE
 * PLAYED.** `$28F318 tst.w $8103E6 / bpl $28F334` skips the whole arm when bit 15 is clear, and
 * on the cold-boot path measured in `w387slot12.test.js` BOTH records read `$0000` -- the game
 * over screen's own teardown got there first. So the checks do not run, `$8130CC` stays `$00`,
 * and the screen is a two-frame pass-through. The bits that DO reach `$8130CC` on a real ranking
 * come from bonus line 2 (`$26007C`/`$260092`, W300), a different caller entirely.
 *
 * **`bcs` MEANS NOT MADE.** `hiscoreBody287C3E` ends `andi #$FFFE,SR` on the insert path and
 * `ori #$1,SR` on the miss, and `hiscore.js` already exposes that as `{ made }` -- so the port
 * reads the flag rather than re-deriving the carry.
 *
 * **`ori.b` IS READ-MODIFY-WRITE ON RAM**, not a store: a side that made the table ORs its bit
 * into whatever the other arm just left there, which is how the byte reaches `$3`.
 */
export function init28F2BA(ram, rom, a5, ctx) {
  clearTx(ctx, 0x28f2ba);                                    // $28F2BA jsr $23C622
  ram.setU8(a5 + SLOT12.stateAt, 1);                         // $28F2C0 move.b #$1,($2,A5)
  for (let i = 0; i < SLOT12.workWords; i++) {               // $28F2D0 / $28F2D4 dbra -- $42 WORDS
    ram.setU16(SLOT12.work + i * 2, 0);
  }
  for (const f of SLOT12.fades) {                            // $28F2D8..$28F317, four of them
    if (!ctx?.palette) {
      ctx?.unported?.note(0x24150a, `$${f.site.toString(16).toUpperCase()} -- sprite bank `
        + `${f.bank} <- $${f.src.toString(16).toUpperCase()} with no PaletteState on this chain`);
      continue;
    }
    install24150A(ram, ctx.palette, f.bank, rom.bytes(f.src, SLOT12.fadeBytes), f.site,
      'slot [12] name-entry palette');
  }

  // $28F318 and $28F334 -- one per side, and they are INDEPENDENT arms, not an else-if pair.
  const checks = [hiscoreCheck287BD2, hiscoreCheck287C08];
  for (const [side, addr] of SLOT12.players.entries()) {
    if ((ram.u16(addr) & 0x8000) === 0) continue;            // $28F31E / $28F33A bpl
    if (!checks[side](ram).made) continue;                   // $28F328 / $28F344 bcs
    ram.setU8(SLOT12.flags,                                  // $28F32C / $28F348 ori.b
      (ram.u8(SLOT12.flags) | SLOT12.flagBits[side]) & 0xff);
  }

  const owed = ram.u8(SLOT12.flags);                         // $28F350 move.b $8130CC,($5,A5)
  ram.setU8(a5 + SLOT12.owedAt, owed);
  if (owed !== 0) ctx?.soundPost?.(SLOT12.entryCue);         // $28F358 tst.b / $28F360 jsr $28CB74
  return owed;
}

/**
 * `$28F368` -- THE TEARDOWN, and the instruction that closes the front-end loop.
 *
 * @returns the `stageCreate` result, so a caller can see the record it staged.
 *
 * `$28F39A move.w #$8,D0 / $28F39E jsr $241182 / $28F3A4 move.w #$2,($4,A0)`: dispatch type 8 is
 * `$25A770`, the ATTRACT SEQUENCER (`objslot8.js`), and `($4,A0)` is the initial-state word its
 * arm 0 reads. The exact shape `teardown25A9B2` and `coinTeardown25A7C0` already have -- a screen
 * ends by staging its successor and killing itself, never by writing a state somewhere.
 *
 * **A0 IS THE STAGED RECORD, NOT THIS ONE** (trap 11): `$241182` saves only D1-D2 and leaves the
 * new record in A0, so `$28F3A4` writes the CHILD's `($4)`. Writing `a5 + 4` here would set this
 * dying object's state word and leave the attract screen at state 0.
 *
 * **THE KILL COMES BEFORE THE CREATE, AND THAT ORDER IS SAFE.** `$28F37A jsr $241292` only
 * QUEUES; `$2410BC` drains kills and then creates at the top of the next frame, so this object
 * dies and slot [8] arrives in the same drain. `$241292` is `lea ($4C,A5),A0`, so the id is the
 * LONGWORD at `($4C,A5)` -- `queueKill` takes that VALUE, and handing it the type word instead
 * makes the kill silently miss (`killById` compares 16 bits of the id and never matches).
 */
export function teardown28F368(ram, rom, a5, ctx) {
  // $28F368 / $28F36E / $28F374 -- THE THREE CLEARS.
  //
  // **W388 TURNS THE TWO TRANSCRIBED ONES ON, and pays the price the CLEARS block priced.** They
  // are six and seven instructions with no branch and no call, both proven end-to-end by
  // `w387slot12.test.js` SECTION 7, and the only thing that ever kept them from being called was
  // that six assertions in three other files measured the resting RAM of runs that had no
  // teardown in them. Those six are re-based in `w388hiscorechain.test.js`'s companion edits,
  // named one by one, and none of them was weakened: each now measures what the cartridge
  // actually leaves behind once the game-over screen tears the player subsystem down.
  //
  // `$259C4A` STAYS COUNTED and is the only one of the three that is not ported: it is $6E bytes
  // with its own control flow, not a straight-line clear, and inventing it is not this wave's.
  clearPlayerRam24A810(ram);                                 // $28F368 jsr $24A810
  ctx?.unported?.note(SLOT12.clears[1].at, SLOT12.clears[1].why);  // $28F36E jsr $259C4A
  clearRankRam2603DA(ram);                                   // $28F374 jsr $2603DA
  queueKill(ram, ram.u32(a5 + SLOT12.idAt));                 // $28F37A jsr $241292
  ctx?.unported?.note(SLOT12.cueStream, '$28F380' + CUE_STREAM_NOTE); // jsr $28C0FC
  clearTx(ctx, 0x28f386);                                    // $28F386 jsr $23C622
  // $28F38C lea $222638,A0 / $28F392 moveq #0,D0 / $28F394 jsr $2414BE.
  if (!ctx?.palette) {
    ctx?.unported?.note(0x2414be, '$28F394 -- TX bank 0 <- $222638 with no PaletteState '
      + 'on this chain');
  } else {
    install2414BE(ram, ctx.palette, 0, rom.bytes(SLOT12.txPal, 32), 0x28f394,
      'slot [12] name-entry TX palette');
  }
  const made = stageCreate(ram, SLOT12.childType,            // $28F39A / $28F39E
    (t) => rom.u16(SLOT12.dispatch + t * 8 + 4));
  ram.setU16(made.addr + SLOT12.stateField, SLOT12.childState);   // $28F3A4 -- through A0
  return made;
}

/** One complete name-entry frame after a side's one-shot setup. */
function nameEntryFrame(ram, rom, a4, a5, ctx) {
  /*
   * `$28F4C4..$28F666` -- one frame of the screen, once a side's record is set up.
   *
   * Every piece below `$28F4C4` was already ported, by W305 through W382, in `hiscorename.js`;
   * this is the glue that runs them in the cartridge's order and counts the three draws that are
   * not ported. The order is not a detail -- `$28F4FC tst.w ($1E,A4) / beq $28F542` makes the
   * countdown and the input path EXCLUSIVE, and the two draws at `$28F4F4`/`$28F4F8` happen before
   * either, on every frame.
   */
  drawGridFrame28F4C4(ram, rom, a4, a5);                     // $28F4C4..$28F4F2
  noteDraw(ctx, SLOT12.draws[1]);                            // $28F4F4 bsr $28FB8A
  noteDraw(ctx, SLOT12.draws[2]);                            // $28F4F8 bsr $28FC36

  const tick = nameCountdown28F4FC(ram, rom, a4, a5, ctx);   // $28F4FC tst.w ($1E,A4)
  if (tick !== 'idle') return tick;                          // ...and every non-idle arm rts

  const band = nameFrameBands28F542(ram, rom, a4, ctx);      // $28F542..$28F55C
  if (band !== 'input') return band;                         // 'leadin' rts, 'over' commits

  cursorFrame28F55E(ram, rom, a4, ctx);                      // $28F55E..$28F57E
  noteDraw(ctx, SLOT12.draws[0]);                            // $28F580 bsr $28FAF4
  // $28F584 bsr $28F7F4 -- the FOURTH call site of the panel draw. hiscorename.js counts the
  // other three ($28F502, $28F550, $28F6C2); this one is only reachable from here.
  ctx?.unported?.note(SLOT12.panelDraw, `$28F584 bsr $28F7F4 -- the name-entry panel draw, `
    + `$28F7F4..$28F8AB, $${SLOT12.panelDrawBytes.toString(16).toUpperCase()} bytes ending on `
    + `the 4E75 AT $28F8AA. Reached on the INPUT path; hiscorename.js counts the other three `
    + `call sites`);
  return nameButtons28F588(ram, rom, a4, ctx);               // $28F588..$28F666
}

/** One counted draw, named by its extent so the note can be scoped without re-measuring. */
function noteDraw(ctx, d) {
  ctx?.unported?.note(d.at, `$${d.site.toString(16).toUpperCase()} bsr $${
    d.at.toString(16).toUpperCase()} -- $${d.at.toString(16).toUpperCase()}..$${
    (d.at + d.bytes - 1).toString(16).toUpperCase()}, $${
    d.bytes.toString(16).toUpperCase()} bytes: ${d.why}`);
}

/**
 * `$28F3F8` (P1) and `$28F450` (P2) -- the two per-side heads, and they are HARD-CODED TWINS
 * rather than one routine with a side parameter. Four things differ and nothing else does:
 *
 *     A4         $81E056            $81E096            the side's own record
 *     raw        jsr $23D16C        jsr $23D17E        -> ($34,A4)
 *     edge       jsr $23D186        jsr $23D18E        -> ($36,A4)
 *     setup bit  move.w #$1,($12)   move.w #$2,($12)   and clr.w ($2C) vs move.w #$1,($2C)
 *
 * **THE INPUT READS HAPPEN BEFORE THE SETUP GATE**, so `($34)`/`($36)` are refreshed on EVERY
 * frame including the very first, and `$28F412 move.w ($2,A4),D7 / bne.w $28F4C4` only skips the
 * one-shot arm. A port that put the reads inside the gate would leave the buttons frozen at
 * whatever the first frame saw.
 *
 * **AND `$28F442 tst.w $81E0D6 / bne.w $28F4C4` IS WHY THE SECOND SIDE DOES NOT RE-ARM THE GRID.**
 * `$81E0D6` is global, not per-record, so the first side through sets it in `$28F4A6` and the
 * second falls straight into the frame body. Both records still get their own setup block.
 *
 * @returns a string naming the arm the frame took, for tests.
 */
export function nameArmHead(ram, rom, a5, ctx, side) {
  const a4 = SLOT12.records[side];                           // $28F3F8 / $28F450 lea
  ram.setU16(a4 + SLOT12.rawAt, startRaw23D16C(ram, side));  // $28F3FE / $28F456 -> $28F404
  ram.setU16(a4 + SLOT12.edgeAt, readInput23D186(ram, side));// $28F408 / $28F460 -> $28F40E

  if (ram.u16(a4 + SLOT12.frameAt) === 0) {                  // $28F412 / $28F46A bne.w $28F4C4
    // $28F41A..$28F44C / $28F472..$28F49C -- the one-shot setup. `nameArm28F428` (W305/W308) is
    // exactly $28F41A..$28F43E: the setup bit, the side, the cursor, the tag lookup and the
    // cache, with the give-up branch that drops the side from the work list.
    if (!nameArm28F428(ram, rom, a4, a5, side)) return 'gaveup';   // $28F436 / $28F490 bra $28F6C8
    if (ram.u16(SLOT12.active) === 0) {                      // $28F442 / $28F49C tst.w $81E0D6
      nameArmGrid28F4A6(ram, a4, ctx);                       // $28F44C bra.w $28F4A6, and it
    }                                                        // FALLS THROUGH ($28F4C0 bra +2)
  }
  return nameEntryFrame(ram, rom, a4, a5, ctx);
}

/**
 * `$28F3AC` -- OBJECT DISPATCH [12]. Three states, two of which end the screen.
 *
 * @returns a string naming the arm taken, so a test can assert the path rather than infer it.
 *
 * **THE FOUR COMPARES ARE A REAL CHAIN AND NOT SEQUENTIAL TESTS** (trap 7): every one of them
 * branches AWAY -- to `$28F2BA`, to `$28F368`, to `$28F368` again and to `$28F3DC` -- so nothing
 * below a taken compare runs. That is unlike `objSlot8`'s three, which fall through into a tail
 * that re-reads the state.
 *
 * **THE BOTH-SIDES ARM RUNS P1 THEN P2 IN ONE FRAME, ON ONE OBJECT.** They share `($5,A5)`, so
 * P1 giving up can empty the work list before P2's arm even reads it -- and `$28F6C8`'s
 * `tst.b ($5,A5) / bne` is what makes that harmless: only the LAST side out writes state 2.
 */
export function objSlot12(ram, rom, a5, ctx) {
  const st = ram.u8(a5 + SLOT12.stateAt);
  if (st === 0) {                                            // $28F3AC tst.b / $28F3B0 beq.w
    init28F2BA(ram, rom, a5, ctx);
    return 'init';
  }
  if (st === SLOT12.doneState) {                             // $28F3B4 cmpi.b #$2 / $28F3BA beq
    teardown28F368(ram, rom, a5, ctx);
    return 'teardown';
  }
  const d0 = ram.u8(a5 + SLOT12.owedAt);                     // $28F3BC move.b ($5,A5),D0
  if (d0 === 0) {                                            // $28F3C0 cmpi.b #$0 / $28F3C4 beq
    teardown28F368(ram, rom, a5, ctx);
    return 'nobody';
  }
  if (d0 === 3) {                                            // $28F3C6 cmpi.b #$3 / $28F3CA bne
    nameArmHead(ram, rom, a5, ctx, 0);                       // $28F3CC jsr ($28F3F8,PC)
    // $28F3D2 moveq #$3,D0 -- DEAD. $28F450's `jsr $23D17E` overwrites D0 before any read.
    nameArmHead(ram, rom, a5, ctx, 1);                       // $28F3D4 jsr ($28F450,PC)
    return 'both';                                           // $28F3DA bra $28F3F6 (rts)
  }
  if ((d0 & 0x01) !== 0) {                                   // $28F3DC btst #$0 / $28F3E0 beq
    nameArmHead(ram, rom, a5, ctx, 0);                       // $28F3E2 jsr ($28F3F8,PC)
    return 'p1';
  }
  if ((d0 & 0x02) !== 0) {                                   // $28F3EA btst #$1 / $28F3EE beq
    nameArmHead(ram, rom, a5, ctx, 1);                       // $28F3F0 jsr ($28F450,PC)
    return 'p2';
  }
  return 'none';                                             // $28F3F6 rts
}
