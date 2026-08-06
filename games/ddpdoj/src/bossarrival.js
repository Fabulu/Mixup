// THE STAGE-1 BOSS'S ARRIVAL -- the half the owner can see.  W96.
//
// OBJECT 6 (the body sprite), F script 0, MAIN 0, OBJECT 0 and 1 (the two side
// parts' sprites) and D scripts 0..3, plus the two emitters they reach:
// `$23E08C` (bucket 7, register convention) and `$23E3E2` (bucket 2, the
// EXTENT-SCALED one).
//
// ============================================================================
// WHY THIS SET AND NOT "THE FIFTEEN ARRIVAL RUNGS"
// ============================================================================
// W94 §3B and the brief that produced this wave both size the arrival as
// **15 rungs, lf8,250..11,750**.  `[M]` that is the right POPULATION and the
// wrong WAVE.  Out of the unmutated BEFORE sweep, what each of the fifteen is
// actually blocked on, on the FIRST FRAME of its own segment:
//
//     $241D3E  7 rungs   the unexported speed level (W95 §3)
//     $294FA6  1 rung    F script 0's STEP           <- THIS FILE
//     $295304  5 rungs   **F script 2's STEP**
//     $295432  2 rungs   **F script 3's STEP**
//
// **F 2 and F 3 are W95 §7's own list of what the STEADY STATE still needs.**
// They start D 8/9/12..19, MAIN 8 and E 8, and they need `$2599B4`, the fifth
// scheduler accessor W62 did not ship.  Seven of the "arrival" rungs are
// therefore waiting on the steady state's remainder, not on the arrival, and
// the ladder's own blocking census is what draws the line -- not a judgement.
//
// So this wave is the arrival's EIGHT rungs and the whole of the PAGE's path.
// The other seven are the next wave's, with F 2 and F 3.
//
// ============================================================================
// WHAT THE ARRIVAL IS, IN ORDER
// ============================================================================
//   $2926E2's TWO ACTIVATIONS (src/initbody.js) arm OBJECT slot 6 with
//     `$292F4A` and start F script 0.  W30 left them as notes, W95 shipped
//     them, measured them and put them back because the arrival was not there
//     to catch them.  It is now.
//   OBJ 6   draws the boss's body EVERY FRAME from the moment it is armed,
//           indexed by `($11A,A6)` -- which is the only thing that animates
//           during the descent.
//   F 0     counts $C0 = 192 frames, then `MAIN.start 0`, one `$24150A` cue,
//           and retires its own slot.
//   MAIN 0  walks the boss to (`$5400`, `$1C00` - scroll), ramps `($11A,A6)`
//           through $180, and at $180 hands the whole boss over: MAIN 2, F 1,
//           D 0/1/2/3/7, OBJECT 0..5 armed, OBJECT 6 STOPPED, five animation
//           objects loaded.  **That handoff is the arrival ending and the
//           steady state beginning**, and every one of its targets is either
//           in this file or shipped by W94/W95.
//   OBJ 0/1 draw the two side parts, through `$23E3E2` and the SIZE family.
//   D 0/1   wobble each part's own offset with two `$241D34` calls at speed
//           levels 2 and 1.
//   D 2/3   cycle each part's animation cursor `($2A,A6)`/`($6A,A6)` 0,4,8,C.
//
// **AND ALL FOUR D SCRIPTS' INITs END IN `rts`** -- see the registry at the
// foot of this file, and the measurement that found it.  F 0's and MAIN 0's
// fall through; D 0/1/2/3's do not.
//
// ============================================================================
// NINE THINGS THE ADDRESSES DO NOT TELL YOU
// ============================================================================
//  1. **F 0's INIT IS ONE INSTRUCTION AND IT FALLS THROUGH.**  `$294FA0
//     move.w #$C0,$2(a4)` and the very next address is the STEP.  The arming
//     frame therefore decrements to $BF, so the wait is 191 further frames and
//     not 192.  The brief that ordered this wave called `$294FA0` "the
//     blocker"; it is one instruction and the whole of F 0 is ten.
//
//  2. **MAIN 0's INIT IS A WORD AND MEANS SPEED $1E, FACING $20.**  `$293204
//     move.w #$1E20,$1a(a6)` writes BOTH bytes -- `($1A,A6)` is the speed and
//     `($1B,A6)` the facing (`$2417E0`/`$2417E4`).  This is the same trap W95
//     §2.1 found in MAIN 2's init one entry down, where the identical-looking
//     `move.w #$20,$1a(a6)` means speed **0**, facing $20.  The two are three
//     bytes apart and one of them is the arrival's whole descent speed.
//
//  3. **MAIN 0's INIT FALLS THROUGH TOO** -- `$29321C` is the next address
//     after `$293216`, with no `rts`.  Recon 48 §2.2's house style again.
//
//  4. **THE TARGET'S X IS SCROLL-RELATIVE AND ITS Y IS NOT.**  `$293220
//     move.w #$1C00,d3 / $293224 sub.w $813172,d3` -- `$813172` is the scroll
//     cursor (`src/background.js scrollCur`), and only D3 is corrected.
//     `movem.w $2(A6),D0-D1` is what makes D3 the X pair, so a reader who takes
//     the FIRST constant as the one that moves has the axes swapped.  A port
//     that corrected both, or neither, lands the boss where the arena is not,
//     and the ARRIVAL TEST at `$293270 cmpi.w #$1800` then never fires or fires
//     immediately.
//
//  5. **THE TARGET IS COMPUTED TWICE AND -- A CLAIM THIS WAVE WITHDREW -- THE
//     SECOND COMPUTATION IS A NO-OP.**  `$29321C` computes it for `$24203E`
//     (the aim) and `$29325C` computes it AGAIN for `$242494` (the distance).
//     The first draft of this comment said the re-read mattered because
//     `$293244 jsr $2417DE` moves the boss in between.  It does move the boss
//     -- but the TARGET is `($5400, $1C00 - $813172)` and the only input is
//     `$813172`, which `src/background.js` writes once a frame at `$261508`
//     and which nothing between the two computations touches.  `[M]` the
//     mutation `main0-one-target` (reuse the first pair) is **BYTE-IDENTICAL on
//     all 81 MAIN 0 frames of `stage1-sweep` segment lf8,250**, in `($11A,A6)`,
//     the phase byte, the speed byte and the boss's position longword.
//     **What IS load-bearing is that the boss's own position is read at the
//     point of use on both paths**, which it is.  This is W94 §2.1's
//     `main7-stale-target` a second time, in a different script, and it is
//     declared EXPECTED-GREEN with that measurement rather than deleted.
//
//  6. **`($11A,A6)` IS RAMPED BY TWO DIFFERENT RULES AND THE SECOND ONE HAS A
//     GATE THE FIRST DOES NOT.**  In phase 0 (`$2932A2`) it is `+= $10` then
//     `&= $3F` -- a four-frame loop, the boss idling.  In phase 1
//     (`$2932C6`) it is `+= $10` with NO mask and an `== $180` test.  A port
//     that carried the mask into phase 1 would loop the animation forever and
//     the handoff at `$2932D6` would never happen: the boss would arrive and
//     never fight, which is indistinguishable on screen from this wave not
//     existing.
//
//  7. **PHASE 1's TICK GATE IS A `bcc` ON A BYTE.**  `$2932B8 subq.b #$1,$6(a4)
//     / bcc.w $293376` -- so the frame is skipped while the counter is >= 0
//     AFTER the decrement, and the reload `$2932C0 move.b $7(a4),$6(a4)` is the
//     period.  The INIT sets `$6(a4)` and `$7(a4)` together as ONE WORD,
//     `$293216 move.w #$101,$6(a4)`, so both are 1 -- the same word trap as
//     item 2, three instructions later, and `$29320A move.w #$101,$2(a4)` is a
//     third instance in the same INIT.  **Three `move.w`s that a reader looking
//     for `move.b` will misread, in five instructions.**
//
//  8. **THE HANDOFF STOPS OBJECT 6 WITH A DIFFERENT PRIMITIVE THAN IT ARMS THE
//     OTHERS WITH.**  `$293332..$29335C` arms OBJECT 0..5 with `$2598E6`, and
//     `$293362 moveq #$6,d0 / jsr $25994A` STOPS OBJECT 6.  So the body sprite
//     that drew the whole arrival is switched off at the same instant OBJECT 0
//     and 1 (the parts) and 2..5 (W82's four) come on.  A port that read the
//     seventh call as a sixth arm would draw the body twice forever.
//
//  9. **`$293376 bra.w $29314C` IS UNCONDITIONAL AND IT IS WHY THE SPEED
//     EXPORT HAD TO SHIP IN THIS WAVE.**  Every MAIN 0 frame ends in the tail
//     W94 shipped, whose `$29319E jsr $241D34` passes `($4A,A6)` = **$82**, a
//     level `tools/export-tables.py` did not export.  So the page throws on
//     the boss's FIRST arrival frame without it.  W95 §3 met the same throw
//     from the ladder and left it "deliberately"; from the page it is not
//     optional.  The exporter's fix and its derivation are in
//     `boss_part_speed_indices` -- and W95's stated reason for the band it
//     would have exported is measurably false, see the worklog §0.4.
//
// ============================================================================
// THE TWO EMITTERS, AND ONE OF THEM IS NOT IN BUCKET 2
// ============================================================================
// **`$292F4A` -- THE BOSS'S OWN BODY -- ENDS IN `jmp $23E08C`, WHICH IS BUCKET
// SEVEN** (`$807450`, counted at `$80AFC8`), not bucket 2 (`$805CC8`/
// `$80AFC4`).  `src/spritequeue.js` has carried both since W11.  The
// `stage1-sweep` trace has a `sprq2` column and **no bucket-7 column**, so the
// oracle the brief names -- "through the bucket 2 trace" -- is structurally
// blind to the largest sprite this wave produces.  That is stated here rather
// than discovered later; W85 §8 note 3 already listed bucket 7 as one of the
// four that are "the same job and the same three-file change".
//
// OBJECT 0 and 1 DO write bucket 2, through `$23E3E2`, so the parts ARE
// oracled.  `$23E3E2` differs from `$23E020`/`$23E08C` in three ways that
// matter:
//
//   * it takes the sprite longword in **D6** and `or.l d6,d7` at the end,
//     where the other two `ori.l #$80008000` a constant;
//   * it scales the position by the sprite's EXTENT first, through two
//     indirect calls into `$23E78C`, one per axis; and
//   * it stores **`swap d4`'s** word, so the attribute the caller put in D4's
//     low half is written from the half the two `jsr (a0)`s do not touch.
//
// ============================================================================
// `$23E78C` -- 64 ROUTINES, AND ENTRY n MULTIPLIES BY n EXCEPT TWICE
// ============================================================================
// `[M]` each of the 32 distinct routines is a straight-line `add.w`/`lsl.w`
// chain on D7 with D4 as scratch, and simulating all 64 entries gives
// **multiplier == index for 1..24 and 26..31 and 56**, with exactly two
// exceptions and one clamp:
//
//     [0]        -> $23E88C, x1        (index 0 means 1 -- the same shape as
//                                       the IGS023 zoom table's entry $F)
//     [25]       -> $23E972, **x21**   (`3807 de47 de47 de44 de47 de47 de44`
//                                       = x5 then x4 then +x = 21x, NOT 25x)
//     [32..63]   -> $23E88C, x1        except [56] -> $23E9CE, x56
//
// **The port does NOT bake index -> multiplier.**  It reads the routine's
// ADDRESS out of the ROM window at `$23E78C + idx*4` and looks the multiplier
// up by that address, so a table that moves throws by address instead of
// scaling a sprite wrongly.  `[M]` the boss uses indices **12 and 20** (D3 =
// `$1460`: `($1460 & $1FF) >> 1 = $30` and `($1460 & $3E00) >> 6 = $50`, both
// BYTE offsets, i.e. entries 12 and 20), and both are exactly x12 and x20.
//
// ============================================================================
// WHAT IS NOT HERE
// ============================================================================
// F 2 (`$295304`), F 3 (`$295432`), MAIN 4 (`$293506`), MAIN 8 (`$2936BE`),
// D 10/11/14/15/16/17 and E 5/6/14 -- the seven rungs of §0.1 above.  Every one
// is a LOUD NAMED THROW by address.  **Nothing here is clamped or stubbed to
// stop a throw.**

import { u16, i16 } from './ram.js';
import { unreached } from './unported.js';
import {
  registerScript, seqStart2598D0, a2Run2598E6, a2Stop25994A,
  a3Start259962, a4Start25980C,
} from './scheduler.js';
import { aim64, slew64, AimTables } from './aim.js';
import { applyVelocity } from './movement.js';
import { drawWord242EC2 } from './rng.js';
import { BUCKETS, enqueueRegisters } from './spritequeue.js';
import { BS, dist242494, bodyTail29314C } from './bossscripts.js';
import { bossA5, bossA6 } from './boss.js';

/** A byte, the way every `.b` operation in this file truncates. */
const u8 = (v) => v & 0xff;

/** The two deferred subsystems this file reaches, counted the way `boss.js`
 *  counts its nine.  `$24150A` is the resource/banner install and `$246410` the
 *  ANIMATION-OBJECT loader; both are DATA-driven presentation and both were
 *  already counted from `$293EE6`/`$293F18` before this wave. */
const note = (ctx, a, what) => ctx.unportedLog?.note(a, what);

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

/**
 * ONE named-wrong-port seam, W79's device.  `portdiff.mjs` and `breakage.mjs`
 * reset it on every run; the shipped value is `null` and every branch below is
 * inert while it is.
 */
export const W96_MUTATE = { value: null };

/** Every ROM address this file transcribes, so a reader can check any line. */
export const W96 = {
  obj0: 0x292972, obj1: 0x292b08, obj6: 0x292f4a,
  f0Init: 0x294fa0, f0Step: 0x294fa6,
  main0Init: 0x293204, main0Step: 0x29321c,
  clearE8: 0x294ef2, orStatus: 0x294efa,
  d0Init: 0x2937b6, d0Step: 0x2937cc,
  d1Init: 0x293800, d1Step: 0x293816,
  d2Init: 0x29384a, d2Step: 0x293852,
  d3Init: 0x29387c, d3Step: 0x293884,
  // the emitters
  emitB7: 0x23e08c,           // $292F80 jmp -- BUCKET 7
  emitScaled: 0x23e3e2,       // $2929E0 / $292B72 jmp -- BUCKET 2
  sizeTable: 0x23e78c,        // $23E3E6 / $23E406 lea, 64 longwords
  // the ROM tables, all read at the computed address (W48's work-list item 4)
  obj6Frames: 0x292f84,       // $292F4A lea $292F84(pc),A2 -- ($11A,A6) indexes it
  obj0Frames: 0x292a88,       // $292972 lea, indexed by ($2A,A6)
  obj1Frames: 0x292b7a,       // $292B08 lea, indexed by ($6A,A6)
  partSprites: 0x292a08,      // $2929AA / $292B40 lea -- ($4B,A6)>>3 selects
  partEmitters: 0x2929e8,     // $2929D2 / $292B66 lea -- ($4B,A6)>>5 selects
  main0Cues: 0x29337a,        // $29336A lea $29337A(pc),A0 / jsr $246410
};

/**
 * The sub-record fields this file reads.  **The ones `BS` also names are
 * REPEATED here as literals ON PURPOSE and asserted equal in the tests**: this
 * module is imported at the FOOT of `src/boss.js`, after `bossscripts.js` and
 * `bossphase.js`, and `bossscripts.js` imports `bossA5`/`bossA6` back out of
 * `boss.js` -- so the cycle means `BS` is still in its temporal dead zone while
 * THIS file's top-level `const`s are being evaluated.  Reading `BS.p1Pos` in a
 * module-scope initialiser throws `Cannot access 'BS' before initialization`,
 * which is what the first run of this file did.  Inside a function body `BS` is
 * fine, and that is where every other use of it is.
 */
const AR = {
  p1Pos: 0x22, p1Dead: 0x3f, p1Ang: 0x4b,     // = BS.p1Pos / p1Dead / p1Ang
  p2Pos: 0x62, p2Dead: 0x7f, p2Ang: 0x8b,     // = BS.p2Pos / p2Dead / p2Ang
  bodyFrame: 0x11a,      // $292F50 adda.w $11A(A6),A2 -- and MAIN 0 ramps it
  p1Anim: 0x2a,          // $292978 move.w $2A(A6),D2 -- D 2 cycles it
  p2Anim: 0x6a,          // $292B0E move.w $6A(A6),D2 -- D 3 cycles it
  p1Attr: 0x3c,          // $29298E move.w $3C(A6),D4
  p2Attr: 0x7c,          // $292B24 move.w $7C(A6),D4
  p1Spr: 0x46,           // $2929B0 move.l (A0,D0.w),$46(A6)
  p2Spr: 0x86,           // $292B44
  wobY: 0x26,            // $2937E0 add.w D2,$26(A6)  -- part 1's own offset
  wobX: 0x28,            // $2937F2 add.w D3,$28(A6)
  wobY2: 0x66, wobX2: 0x68,
  status: 0x00,          // $294EFE or.w D0,(A6)
  status1: 0x20, status2: 0x60,
  e8: 0xe8,              // $294EF2 move.w #$0,$E8(A6)
};

/** RAM the arrival writes that is not in the sub-record. */
const AR_RAM = {
  scroll: 0x813172,      // $293224 sub.w $813172,D3 -- the X pair only
  flags: 0x8130f8,       // $2932D6 bset #$4 / $2932DE bset #$1
  hpShown: 0x81b6e4,     // $2932E6 move.w #$1,$81B6E4
};

// ===========================================================================
// $23E08C -- THE BUCKET-7 REGISTER-CONVENTION ENQUEUE
// ===========================================================================
//   23E08C: move.l A0,-(A7) / move.l D0,-(A7)
//   23E090: lea $807450,A0 / adda.w $80AFC8,A0        <- SPRITE BUCKET 7
//   23E09C: move.l D1,D0 / asr.l #$6,D0
//   23E0A0: andi.l #$07FF03FF,D0 / ori.l #$80008000,D0
//   23E0AC: move.l D0,(A0)+ / move.l D2,(A0)+
//   23E0B0: move.w D3,(A0)+ / move.w D4,(A0)+
//   23E0B4: addi.w #$C,$80AFC8
//
// **Instruction for instruction `$23E020` with two different addresses**, so it
// is `spritequeue.js enqueueRegisters` on bucket 7 and nothing new is modelled.
// The bucket index is asserted against `BUCKETS` rather than passed as a
// literal, so a wave that renumbers the table cannot silently redirect the
// boss's body into another layer.
const BUCKET7 = (() => {
  const b = BUCKETS.find((x) => x.buffer === 0x807450 && x.counter === 0x80afc8);
  if (!b) {
    unreached(0x23e08c, '$23E08C stages at $807450 counted at $80AFC8 and no '
      + 'entry of spritequeue.js BUCKETS has that pair -- the bucket table has '
      + 'moved and the boss body would be drawn into the wrong depth layer');
  }
  return b.i;
})();

/** `$23E08C`.  See above. */
function emit23E08C(ram, d1, d2, d3, d4) {
  return enqueueRegisters(ram, BUCKET7, d1 >>> 0, d2 >>> 0, d3, d4);
}

// ===========================================================================
// $23E78C -- THE SIZE MULTIPLIERS
// ===========================================================================
/** Routine address -> what it multiplies D7's low word by.  [M] simulated over
 *  all 64 table entries; see the header for the two that are not their index. */
const SIZE_MULTIPLIER = new Map([
  [0x23e88c, 1], [0x23e88e, 2], [0x23e892, 3], [0x23e89a, 4], [0x23e8a0, 5],
  [0x23e8aa, 6], [0x23e8b4, 7], [0x23e8bc, 8], [0x23e8c0, 9], [0x23e8c8, 10],
  [0x23e8d4, 11], [0x23e8e2, 12], [0x23e8ee, 13], [0x23e8fc, 14], [0x23e906, 15],
  [0x23e90e, 16], [0x23e912, 17], [0x23e91a, 18], [0x23e924, 19], [0x23e930, 20],
  [0x23e93e, 21], [0x23e94c, 22], [0x23e95c, 23], [0x23e968, 24],
  [0x23e972, 21],                                  // entry 25, and it IS 21
  [0x23e982, 26], [0x23e992, 27], [0x23e9a0, 28], [0x23e9b0, 29], [0x23e9bc, 30],
  [0x23e9c6, 31], [0x23e9ce, 56],                  // entry 56, the only one > 31
]);

/**
 * `$23E3E8`/`$23E408` -- resolve one axis's scaling routine and apply it.
 * The ROUTINE ADDRESS comes out of the cartridge at the offset the instruction
 * computes; only the multiplier is a constant here, and an address the table
 * does not name is a LOUD NAMED THROW rather than a silently unscaled sprite.
 * @param byteOff the BYTE offset `adda.w D4,A0` forms -- not an entry index.
 */
function sizeScale23E78C(rom, byteOff, d7lo) {
  const at = W96.sizeTable + (byteOff & 0xffff);
  const routine = rom.u32(at) & 0xffffff;
  const m = SIZE_MULTIPLIER.get(routine);
  if (m === undefined) {
    unreached(0x23e78c, `$23E78C+$${byteOff.toString(16)} holds $${
      routine.toString(16).toUpperCase()}, which is not one of the 32 size `
      + 'routines W96 simulated. The table has moved or an entry this port has '
      + 'never seen was reached; scaling it by anything would put the sprite at '
      + 'a size no instruction asked for');
  }
  return u16(d7lo * m);
}

// ===========================================================================
// $23E3E2 -- THE EXTENT-SCALED BUCKET-2 EMIT
// ===========================================================================
//   23E3E2: movem.l D4/D7/A0,-(A7)
//   23E3E6: lea $23E78C(pc),A0
//   23E3EC: move.l D6,D7 / lsr.l #$8,D7        <- a LONG shift of the whole D6
//   23E3F0: neg.w D7 / addi.w #$80,D7
//   23E3F6: swap D4                            <- the ATTRIBUTE goes UPSTAIRS
//   23E3F8: move.w D3,D4 / andi.w #$1FF,D4 / lsr.w #$1,D4
//   23E400: adda.w D4,A0 / movea.l (A0),A0 / jsr (A0)
//   23E406: lea $23E78C(pc),A0
//   23E40C: swap D7 / neg.w D7 / addi.w #$80,D7
//   23E414: move.w D3,D4 / andi.w #$3E00,D4 / lsr.w #$6,D4
//   23E41C: adda.w D4,A0 / movea.l (A0),A0 / jsr (A0)
//   23E422: lea $805CC8,A0 / adda.w $80AFC4,A0        <- SPRITE BUCKET 2
//   23E42E: swap D1 / add.w D1,D7 / swap D1
//   23E434: swap D7 / add.w D1,D7
//   23E438: asr.l #$6,D7 / andi.l #$07FF03FF,D7 / or.l D6,D7
//   23E442: move.l D7,(A0)+ / move.l D2,(A0)+
//   23E446: move.w D3,(A0)+ / swap D4 / move.w D4,(A0)+
//   23E44C: addi.w #$C,$80AFC4
//
// **THE TWO `swap D7`s ARE THE WHOLE ROUTINE.**  Each axis is scaled in D7's
// LOW word and then swapped upstairs so the other axis can use the same three
// instructions; the position in D1 is added to each half AFTER both scalings,
// halves crossed the same way.  A transcription that scaled one axis and
// copied it to the other -- which is what reading `$23E3EC..$23E404` and
// assuming symmetry produces -- draws every sprite square.
//
// **AND `swap D4` AT `$23E3F6` IS WHY THE ATTRIBUTE SURVIVES.**  Both `jsr
// (a0)`s use D4's LOW word as scratch (`move.w D7,D4`); the caller's attribute
// word is parked in the HIGH half across both of them and swapped back down at
// `$23E448`, one instruction before it is stored.
function emit23E3E2(ram, rom, d1, d2, d3, d4, d6) {
  let d7 = (d6 >>> 8) >>> 0;                            // $23E3EC/$23E3EE lsr.l #8
  const axis = (v) => u16(u16(-v) + 0x80);              // $23E3F0/$23E3F2 neg/addi
  // ---- axis A: D3's bits 8..0, halved -> a BYTE offset into $23E78C
  d7 = (d7 & 0xffff0000) | axis(d7 & 0xffff);
  const offA = (d3 & 0x1ff) >>> 1;                      // $23E3FA/$23E3FE
  d7 = (d7 & 0xffff0000) | sizeScale23E78C(rom, offA, d7 & 0xffff);
  // ---- $23E40C swap D7: the scaled half goes up, the untouched half comes down
  d7 = (((d7 << 16) | (d7 >>> 16)) >>> 0);
  d7 = (d7 & 0xffff0000) | axis(d7 & 0xffff);
  const offB = W96_MUTATE.value === 'emit-one-axis'
    ? offA : (d3 & 0x3e00) >>> 6;                       // $23E416/$23E41A
  d7 = (d7 & 0xffff0000) | sizeScale23E78C(rom, offB, d7 & 0xffff);
  // ---- $23E42E..$23E436: D1's halves added, one to each of D7's
  d7 = (d7 & 0xffff0000) | u16((d7 & 0xffff) + (d1 >>> 16));   // swap D1/add/swap
  d7 = (((d7 << 16) | (d7 >>> 16)) >>> 0);              // $23E434 swap D7
  d7 = (d7 & 0xffff0000) | u16((d7 & 0xffff) + (d1 & 0xffff)); // $23E436 add.w
  // ---- $23E438: the same pack every bucket emitter does, but OR'd with D6
  const packed = (((d7 | 0) >> 6) & 0x07ff03ff) >>> 0;  // asr.l #6 / andi.l
  const word = ((packed | d6) >>> 0);                   // $23E440 or.l D6,D7
  const b = BUCKETS[2];
  const off = u16(ram.u16(b.counter));
  const at = b.buffer + off;
  ram.setU16(b.counter, u16(off + 12));                 // $23E44C addi.w #$C
  ram.setU16(at + 0, (word >>> 16) & 0xffff);
  ram.setU16(at + 2, word & 0xffff);
  ram.setU16(at + 4, (d2 >>> 16) & 0xffff);             // $23E444 move.l D2
  ram.setU16(at + 6, d2 & 0xffff);
  ram.setU16(at + 8, d3 & 0xffff);                      // $23E446 move.w D3
  ram.setU16(at + 10, d4 & 0xffff);                     // $23E448/$23E44A swap/move
  return off;
}

// ===========================================================================
// $292F4A -- OBJECT 6, THE BOSS'S BODY
// ===========================================================================
//   292F4A: lea $292F84(pc),A2 / adda.w $11A(A6),A2
//   292F54: move.l (A2),D2
//   292F56: move.l $2(A6),D1 / addi.l #$F8000080,D1
//   292F60: cmpi.w #$B0,$11A(A6) / bgt.w $292F70
//   292F6A: addi.l #$FE000100,D1
//   292F70: add.l $4(A2),D1
//   292F74: move.w $8(A2),D3 / move.w #$13,D4
//   292F7C: jmp $23E08C
//
// **THE `bgt` IS A SIGNED WORD TEST ON A CURSOR MAIN 0 DRIVES TO $180.**  While
// `($11A,A6) <= $B0` the body gets a SECOND position bias of `$FE000100`; past
// $B0 it does not.  That is the boss dropping into frame -- the bias is what
// holds it off the top of the screen during the first eleven animation steps
// -- and it is one `bgt` away from the boss entering at the wrong height.
//
// **AND THE FRAME RECORD IS TWELVE BYTES READ AT THREE DIFFERENT WIDTHS**:
// `(A2)` a long (the sprite), `$4(A2)` a long ADDED to the position, `$8(A2)` a
// word (the size D3 the emitter scales by).  A port that read three longs, or
// three words, gets a plausible picture for the first entry and nothing after.
function obj6_292F4A(ram, rom, a6) {
  const cur = ram.u16(a6 + AR.bodyFrame);                // $292F50 adda.w
  const at = W96.obj6Frames + cur;
  const d2 = rom.u32(at);                                // $292F54 move.l (A2),D2
  let d1 = (ram.u32(a6 + BS.pos) + 0xf8000080) >>> 0;    // $292F56/$292F5A
  if (W96_MUTATE.value !== 'obj6-no-bias' && i16(cur) <= 0xb0) {   // $292F60
    d1 = (d1 + 0xfe000100) >>> 0;                        // $292F6A addi.l
  }
  d1 = (d1 + rom.u32(at + 4)) >>> 0;                     // $292F70 add.l $4(A2)
  emit23E08C(ram, d1, d2, rom.u16(at + 8), 0x13);        // $292F74/$292F78/$292F7C
}

// ===========================================================================
// $292972 / $292B08 -- OBJECT 0 AND 1, THE TWO SIDE PARTS
// ===========================================================================
// The two are the SAME ROUTINE with part 1's offsets and part 2's, except that
// OBJECT 1 has no `nop` before its second `lea` and reaches OBJECT 0's OWN
// literal pools -- `$292B40 lea $292A08(pc),A0` and `$292B66 lea $2929E8(pc),A0`
// are OBJECT 0's tables, so the two parts share the sprite list and the emitter
// list and differ only in which sub-record bytes select from them.
//
// **THE `tst.b $3F(A6)` GUARDS THE REFRESH, NOT THE DRAW.**  A destroyed part
// still emits -- it emits the LAST sprite longword `$46(A6)` was left holding.
// So the wreck stays on screen, which is what the cartridge does and what a
// port that skipped the whole routine would delete.
//
// **AND `($4B,A6)` IS READ TWICE AT TWO DIFFERENT SHIFTS**: `>> 3` picks the
// sprite out of `$292A08` and `>> 5` picks the EMITTER out of `$2929E8`, with
// an exact-`$C0` short circuit before it.  One byte, two tables, three
// readings.  `[M]` at the arrival `($4B,A6)` is $40 and `($8B,A6)` is $C0, so
// part 1 takes the table's entry 2 and part 2 takes the short circuit -- and
// **both land on `$23E3E2`**, which is why this wave needs one emitter and not
// eight.
function objPart(ram, rom, a6, o) {
  const cur = ram.u16(a6 + o.anim);                      // $292978 move.w $2A(A6)
  const d2 = rom.u32(o.frames + cur);                    // $29297C move.l (A2,D2.w)
  const d1 = (ram.u32(a6 + o.pos) + 0xec00f400) >>> 0;   // $292980/$292984
  const d3 = 0x1460;                                     // $29298A move.w #$1460
  const d4 = ram.u16(a6 + o.attr);                       // $29298E move.w $3C(A6)
  if (ram.u8(a6 + o.dead) === 0) {                       // $292992 tst.b/bne
    const sel = (ram.u8(a6 + o.ang) >>> 3) & 0xff;       // $29299C/$2929A0/$2929A2
    ram.setU32(a6 + o.spr, rom.u32(W96.partSprites + sel * 4));  // $2929A6/$2929B0
  }
  const d6 = ram.u32(a6 + o.spr);                        // $2929B6 move.l $46(A6),D6
  const ang = ram.u8(a6 + o.ang);                        // $2929BC move.b $4B(A6)
  if (ang === 0xc0) {                                    // $2929C0 cmpi.b #$C0/beq
    emit23E3E2(ram, rom, d1, d2, d3, d4, d6);            // $2929E0 jmp $23E3E2
    return;
  }
  const which = (ang >>> 5) & 0xff;                      // $2929C8 lsr.b #$5
  const target = rom.u32(W96.partEmitters + which * 4) & 0xffffff;  // $2929D8
  if (target !== W96.emitScaled) {
    unreached(target, `$2929E8[${which}] is $${target.toString(16).toUpperCase()
      } and W96 ports only $23E3E2. The boss's parts reached a sprite emitter `
      + 'this wave never transcribed -- the facing byte left the range the '
      + 'arrival produces');
  }
  emit23E3E2(ram, rom, d1, d2, d3, d4, d6);              // $2929DC jmp (A0)
}

const OBJ0 = { anim: AR.p1Anim, frames: W96.obj0Frames, pos: AR.p1Pos,
  attr: AR.p1Attr, dead: AR.p1Dead, ang: AR.p1Ang, spr: AR.p1Spr };
const OBJ1 = { anim: AR.p2Anim, frames: W96.obj1Frames, pos: AR.p2Pos,
  attr: AR.p2Attr, dead: AR.p2Dead, ang: AR.p2Ang, spr: AR.p2Spr };

// ===========================================================================
// $294FA0 / $294FA6 -- F SCRIPT 0
// ===========================================================================
//   294FA0: move.w #$C0,$2(a4)                   <- the INIT, and it is ONE
//   294FA6: subq.w #$1,$2(a4) / bne.w $294FC8
//   294FAE: moveq #$0,D0 / jsr $2598D0           <- MAIN.start 0
//   294FB6: move.w #$13,D0 / lea $222AF8,A0 / jsr $24150A
//   294FC6: clr.w (a4)
//   294FC8: rts
export function f0Init294FA0(ram, a4) {
  ram.setU16(a4 + 2, 0xc0);                              // $294FA0
}
export function f0Step294FA6(ram, ctx, a4) {
  const t = u16(ram.u16(a4 + 2) - 1);                    // $294FA6 subq.w #$1
  ram.setU16(a4 + 2, t);
  if (t !== 0) return;                                   // $294FAA bne.w
  seqStart2598D0(ram, 0);                                // $294FAE/$294FB0
  note(ctx, 0x24150a, '$294FC0 jsr $24150A -- F 0\'s resource install, entry '
    + '[$13] of $222AF8 (data; $24150A is counted, not run)');
  ram.setU16(a4, 0);                                     // $294FC6 clr.w (a4)
}

// ===========================================================================
// $294EF2 and $294EFA -- MAIN 0's TWO HANDOFF HELPERS
// ===========================================================================
//   294EF2: move.w #$0,$E8(A6) / rts
//   294EFA: move.w #$A001,D0 / or.w D0,(A6) / or.w D0,$20(A6) / or.w D0,$60(A6)
//
// **`$294EFA` IS WHAT MAKES THE BOSS SHOOTABLE.**  Bit 15 is the record's LIVE
// flag and bit 0 its COLLIDABLE flag, and it is OR'd into the BODY and BOTH
// PARTS in three instructions.  Until this runs the boss is a picture.
export function clear294EF2(ram, a6) { ram.setU16(a6 + AR.e8, 0); }
export function orStatus294EFA(ram, a6) {
  for (const o of [AR.status, AR.status1, AR.status2]) {  // $294EFE/$294F00/$294F04
    ram.setU16(a6 + o, ram.u16(a6 + o) | 0xa001);
  }
}

// ===========================================================================
// $293204 / $29321C -- MAIN 0, THE ARRIVAL
// ===========================================================================
export function main0Init293204(ram, a4, a6) {
  ram.setU16(a6 + BS.speed, W96_MUTATE.value === 'main0-speed-byte'
    ? 0x0020 : 0x1e20);                                  // $293204 -- A WORD
  ram.setU16(a4 + 2, 0x0101);                            // $29320A -- ALSO a word
  ram.setU8(a4 + 4, 0);                                  // $293210 move.b #$0
  ram.setU16(a4 + 6, 0x0101);                            // $293216 -- ALSO a word
}

/** The target `$29321C` and `$29325C` each compute, in the ROM's own order.
 *  `movem.w $2(A6),D0-D1` makes D0/D2 the Y pair and D1/D3 the X pair, so the
 *  scroll correction at `$293224` is on **X** and the fixed `$5400` is Y. */
function main0Target(ram) {
  const y = 0x5400;                                      // move.w #$5400,D2
  const x = u16(0x1c00 - ram.u16(AR_RAM.scroll));        // #$1C00 - $813172
  return { y, x };
}

export function main0Step29321C(ram, rom, ctx, a4, a5, a6) {
  const t1 = main0Target(ram);                           // $29321C..$293228
  // $29322A movem.w $2(A6),D0-D1 / $293230 jsr $24203E -- the angle to the target
  const want = aim64(aimTables(rom), ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    t1.y, t1.x);
  // $293236 move.b $1B(A6),D0 / $29323A jsr $242190 -- one step toward it
  ram.setU8(a6 + BS.facing, slew64(ram.u8(a6 + BS.facing), want) & 0xff);  // $293240
  applyVelocity(ram, ctx.tables, a5);                    // $293244 jsr $2417DE
  // $29324A..$293258 -- the SAME five-longword ring the tail keeps, filled with
  // THIS frame's position five times over.  Not a shift: `move.l D1,(A0)+` runs
  // five times from $81585C up, so the whole history is flattened every frame
  // of the arrival and the limbs never lag while the boss is descending.
  for (let i = 0; i < 5; i++) {                          // $293254 moveq #$4 / dbra
    ram.setU32(0x81585c + i * 4, ram.u32(a6 + BS.pos));  // $293256 move.l D1,(A0)+
  }
  const t2 = W96_MUTATE.value === 'main0-one-target'
    ? t1 : main0Target(ram);                             // $29325C..$293268 -- AGAIN
  const d = dist242494(ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    t2.y, t2.x);                                         // $29326A jsr $242494
  if (i16(d) <= 0x1800) {                                // $293270 cmpi.w/bgt
    ram.setU8(a4 + 4, 1);                                // $293278 move.b #$1
    const n = u8(ram.u8(a4 + 2) - 1);                    // $29327E subq.b #$1
    ram.setU8(a4 + 2, n);
    if (n === 0xff) {                                    // $293282 bcc.w -- borrow
      ram.setU8(a4 + 2, ram.u8(a4 + 3));                 // $293286 reload
      if (ram.u8(a6 + BS.speed) !== 0) {                 // $29328C tst.b/beq
        ram.setU8(a6 + BS.speed, u8(ram.u8(a6 + BS.speed) - 1));   // $293294
      }
    }
  }
  const cur = () => ram.u16(a6 + AR.bodyFrame);
  if (ram.u8(a4 + 4) === 0) {                            // $293298 cmpi.b #$0/bne
    // PHASE 0 -- the idle loop.  `+= $10` then `&= $3F`: four frames, forever.
    ram.setU16(a6 + AR.bodyFrame, u16(cur() + 0x10) & 0x3f);       // $2932A2/$2932A8
  }
  if (ram.u8(a4 + 4) !== 1) return void tail(ram, ctx, a6);        // $2932AE/$2932B4
  // PHASE 1 -- the descent's animation, and it has NO mask (header item 6).
  const n = u8(ram.u8(a4 + 6) - 1);                      // $2932B8 subq.b #$1
  ram.setU8(a4 + 6, n);
  if (n !== 0xff) return void tail(ram, ctx, a6);        // $2932BC bcc.w
  ram.setU8(a4 + 6, ram.u8(a4 + 7));                     // $2932C0 reload
  ram.setU16(a6 + AR.bodyFrame, W96_MUTATE.value === 'main0-phase1-mask'
    ? u16(cur() + 0x10) & 0x3f : u16(cur() + 0x10));     // $2932C6 addi.w #$10
  if (ram.u16(a6 + AR.bodyFrame) !== 0x180) {            // $2932CC cmpi.w/bne
    return void tail(ram, ctx, a6);
  }
  // ---- $2932D6 -- THE HANDOFF.  The arrival ends here.
  ram.setU8(AR_RAM.flags, ram.u8(AR_RAM.flags) | 0x10);  // $2932D6 bset #$4
  ram.setU8(AR_RAM.flags, ram.u8(AR_RAM.flags) | 0x02);  // $2932DE bset #$1
  ram.setU16(AR_RAM.hpShown, 1);                         // $2932E6 move.w #$1
  seqStart2598D0(ram, 2);                                // $2932EE/$2932F0 MAIN 2
  a4Start25980C(ram, 1);                                 // $2932F6/$2932F8 F 1
  clear294EF2(ram, a6);                                  // $2932FE jsr $294EF2
  orStatus294EFA(ram, a6);                               // $293304 jsr $294EFA
  for (const d0 of [0, 1, 2, 3, 7]) a3Start259962(ram, d0);   // $29330A..$29332C
  for (const d0 of [0, 1, 2, 3, 4, 5]) a2Run2598E6(ram, d0);  // $293332..$29335C
  if (W96_MUTATE.value === 'main0-arm-obj6') a2Run2598E6(ram, 6);
  else a2Stop25994A(ram, 6);                             // $293362 -- STOP, not arm
  note(ctx, 0x246410, '$293370 jsr $246410 -- MAIN 0\'s five ANIMATION OBJECTS '
    + `($${W96.main0Cues.toString(16).toUpperCase()}, data; the presentation `
    + 'tier, deferred whole since W53)');
  tail(ram, ctx, a6);                                    // $293376 bra.w $29314C
}

const tail = (ram, ctx, a6) => bodyTail29314C(ram, ctx, a6);

// ===========================================================================
// $2937B6.. -- D SCRIPTS 0 AND 1, THE PARTS' WOBBLE
// ===========================================================================
//   2937B6: jsr $242EC2 / move.b D0,$4(a4)
//   2937C0: jsr $242EC2 / move.b D0,$5(a4)      <- the INIT, and it falls through
//   2937CC: tst.b $3F(A6) / bne.b $2937B2       <- $2937B2 is `clr.w (a4) / rts`
//   2937D2: moveq #$2,D0 / moveq #$0,D1 / move.b $4(a4),D1 / jsr $241D34
//   2937E0: add.w D2,$26(A6)
//   2937E4: moveq #$1,D0 / moveq #$0,D1 / move.b $5(a4),D1 / jsr $241D34
//   2937F2: add.w D3,$28(A6)
//   2937F6: addq.b #$2,$4(a4) / addq.b #$1,$5(a4)
//
// **TWO CALLS, TWO SPEEDS, TWO DIFFERENT COMPONENTS OF THE ANSWER.**  The first
// takes D2 (the long axis) at speed level **2**, the second takes D3 (the short
// axis) at speed level **1**, and the two angles advance at different rates --
// `+2` and `+1` per frame.  So the offset traces a LISSAJOUS, not a circle, and
// a port that made one call and used both halves of it would produce a circle
// that is also the wrong size on one axis.
//
// **AND THE TWO SEEDS ARE TWO SEPARATE RNG DRAWS**, each stepping `$803917`,
// which the whole game shares -- exactly the shape W94 §2 item 5 recorded for
// `$2933DE`.  Collapsing them desynchronises every later consumer.
function dWobbleInit(ram, rom, a4) {
  ram.setU8(a4 + 4, u8(drawWord242EC2(ram, rom)));       // $2937B6/$2937BC
  if (W96_MUTATE.value === 'd0-one-draw') { ram.setU8(a4 + 5, ram.u8(a4 + 4)); return; }
  ram.setU8(a4 + 5, u8(drawWord242EC2(ram, rom)));       // $2937C0/$2937C6
}
function dWobbleStep(ram, ctx, a4, a6, o) {
  if (ram.u8(a6 + o.dead) !== 0) { ram.setU16(a4, 0); return; }   // $2937CC/$2937B2
  const v1 = ctx.tables.shotVector(2, ram.u8(a4 + 4));   // $2937D2..$2937DA
  ram.setU16(a6 + o.y, u16(ram.u16(a6 + o.y) + v1.dy));  // $2937E0 add.w D2
  const v2 = ctx.tables.shotVector(W96_MUTATE.value === 'd0-same-speed' ? 2 : 1,
    ram.u8(a4 + 5));                                     // $2937E4..$2937EC
  ram.setU16(a6 + o.x, u16(ram.u16(a6 + o.x) + v2.dx));  // $2937F2 add.w D3
  ram.setU8(a4 + 4, u8(ram.u8(a4 + 4) + 2));             // $2937F6 addq.b #$2
  ram.setU8(a4 + 5, u8(ram.u8(a4 + 5) + 1));             // $2937FA addq.b #$1
}
const D0F = { dead: AR.p1Dead, y: AR.wobY, x: AR.wobX };
const D1F = { dead: AR.p2Dead, y: AR.wobY2, x: AR.wobX2 };

// ===========================================================================
// $29384A.. -- D SCRIPTS 2 AND 3, THE PARTS' ANIMATION CURSORS
// ===========================================================================
//   29384A: move.w #$0,$2(a4)                   <- the INIT, and it falls through
//   293852: tst.b $3F(A6) / bne.w $2937B2
//   29385A: subq.b #$1,$2(a4) / bcc.w $29387A
//   293862: move.b $3(a4),$2(a4)
//   293868: addq.w #$4,$2A(A6)
//   29386C: cmpi.w #$C,$2A(A6) / ble.w $29387A
//   293876: clr.w $2A(A6)
//
// **THE INIT IS A `move.w` AND IT ZEROES BOTH THE TICK AND THE PERIOD.**
// `397c 0000 0002` is `move.w #$0,($2,A4)`, so `$2(a4)` AND `$3(a4)` go to zero
// -- and `$293862 move.b $3(a4),$2(a4)` then reloads a period of ZERO, which is
// why `($2A,A6)` advances EVERY FRAME.  This is the THIRD word/byte trap in one
// wave (MAIN 0's `$293204` and its two `move.w #$101`s are the others), and the
// first draft of this comment had it as a `$3(a4)` SLOT RESIDUE read, by analogy
// with W95 §2 item 6's E 1 -- `tests/w96boss.test.js` drove the init with a
// residue planted and the word write flattened it. **A port that read this as a
// byte would leave the period at whatever the last occupant left and animate
// both parts at the wrong rate**, which is the same defect as the fall-through
// one and equally invisible in every traced field.
//
// **AND THE CEILING IS `ble`, NOT `blt` OR `beq`.**  `$2A` runs 0, 4, 8, $C and
// then wraps -- FOUR frames, because $C is `ble`-accepted and $10 is not.  One
// branch condition is the difference between a four-frame and a five-frame
// animation on both of the boss's parts.
function dAnimStep(ram, a4, a6, o) {
  if (ram.u8(a6 + o.dead) !== 0) { ram.setU16(a4, 0); return; }   // $293852
  const n = u8(ram.u8(a4 + 2) - 1);                      // $29385A subq.b #$1
  ram.setU8(a4 + 2, n);
  if (n !== 0xff) return;                                // $29385E bcc.w
  ram.setU8(a4 + 2, ram.u8(a4 + 3));                     // $293862 -- reload
  ram.setU16(a6 + o.anim, u16(ram.u16(a6 + o.anim) + 4));          // $293868
  const lim = W96_MUTATE.value === 'd2-wrap-blt' ? 0x0b : 0x0c;
  if (i16(ram.u16(a6 + o.anim)) <= lim) return;          // $29386C cmpi.w/ble
  ram.setU16(a6 + o.anim, 0);                            // $293876 clr.w
}
const D2F = { dead: AR.p1Dead, anim: AR.p1Anim };
const D3F = { dead: AR.p2Dead, anim: AR.p2Anim };

// ===========================================================================
// THE REGISTRY
// ===========================================================================
const A6 = (ctx, at) => bossA6(ctx, at);
const A5 = (ctx, at) => bossA5(ctx, at);

registerScript(0x292972, (ram, rom, ctx, a4) => {
  void a4; objPart(ram, rom, A6(ctx, 0x292972), OBJ0);
});
registerScript(0x292b08, (ram, rom, ctx, a4) => {
  void a4; objPart(ram, rom, A6(ctx, 0x292b08), OBJ1);
});
registerScript(0x292f4a, (ram, rom, ctx, a4) => {
  void a4; obj6_292F4A(ram, rom, A6(ctx, 0x292f4a));
});

registerScript(0x294fa0, (ram, rom, ctx, a4) => {       // F 0 INIT -- ONE insn
  f0Init294FA0(ram, a4);
  f0Step294FA6(ram, ctx, a4);                           // FALL-THROUGH
});
registerScript(0x294fa6, (ram, rom, ctx, a4) => f0Step294FA6(ram, ctx, a4));

registerScript(0x293204, (ram, rom, ctx, a4) => {       // MAIN 0 INIT
  const a6 = A6(ctx, 0x293204);
  main0Init293204(ram, a4, a6);
  main0Step29321C(ram, rom, ctx, a4, A5(ctx, 0x293204), a6);      // FALL-THROUGH
});
registerScript(0x29321c, (ram, rom, ctx, a4) =>
  main0Step29321C(ram, rom, ctx, a4, A5(ctx, 0x29321c), A6(ctx, 0x29321c)));

// **ALL FOUR OF D 0..3's INITs END IN `rts`, AND THE ORACLE IS WHAT SAID SO.**
// The first version of this file made them fall through, because W95 §2.1
// established that eight of the steady state's ten do and recon 48 §2.2 calls
// the fall-through the table's house style.  `[M]` `$2937CA`, `$293814`,
// `$293850` and `$293882` are each a literal `4E75` sitting between the two
// pointers, and D 0..3 are therefore FOUR MORE EXCEPTIONS to a rule that had
// two.  `[M]` the cost of getting it wrong was exactly one extra STEP on the
// arming frame, which left `($2A,A6)` and `($6A,A6)` **one animation step ahead
// of the board for the rest of the boss's life** -- and `stage1-sweep` reported
// it as 88 MISSING bucket-2 records on segment lf8,250, with EVERY ONE of the
// 94 traced columns still green.  Nothing else in this repo could have seen it:
// the cursor is not a traced field and the sprite it picks is real, in range,
// and changes every frame either way.
/** The defect `stage1-sweep` caught in this wave's first version, KEPT as a
 *  named wrong port so the thing that found it can be seen finding it again. */
const dInitFellThrough = () => W96_MUTATE.value === 'd-init-fallthrough';
registerScript(0x2937b6, (ram, rom, ctx, a4) => {       // D 0 INIT -- `rts`
  dWobbleInit(ram, rom, a4);
  if (dInitFellThrough()) dWobbleStep(ram, ctx, a4, A6(ctx, 0x2937b6), D0F);
});
registerScript(0x2937cc, (ram, rom, ctx, a4) =>
  dWobbleStep(ram, ctx, a4, A6(ctx, 0x2937cc), D0F));
registerScript(0x293800, (ram, rom, ctx, a4) => {       // D 1 INIT -- `rts`
  dWobbleInit(ram, rom, a4);
  if (dInitFellThrough()) dWobbleStep(ram, ctx, a4, A6(ctx, 0x293800), D1F);
});
registerScript(0x293816, (ram, rom, ctx, a4) =>
  dWobbleStep(ram, ctx, a4, A6(ctx, 0x293816), D1F));

registerScript(0x29384a, (ram, rom, ctx, a4) => {       // D 2 INIT -- `rts`
  ram.setU16(a4 + 2, 0);                                // $29384A move.w #$0
  if (dInitFellThrough()) dAnimStep(ram, a4, A6(ctx, 0x29384a), D2F);
});
registerScript(0x293852, (ram, rom, ctx, a4) =>
  dAnimStep(ram, a4, A6(ctx, 0x293852), D2F));
registerScript(0x29387c, (ram, rom, ctx, a4) => {       // D 3 INIT -- `rts`
  ram.setU16(a4 + 2, 0);                                // $29387C move.w #$0
  if (dInitFellThrough()) dAnimStep(ram, a4, A6(ctx, 0x29387c), D3F);
});
registerScript(0x293884, (ram, rom, ctx, a4) =>
  dAnimStep(ram, a4, A6(ctx, 0x293884), D3F));

export { emit23E08C, emit23E3E2, sizeScale23E78C, objPart, obj6_292F4A,
  dWobbleInit, dWobbleStep, dAnimStep, OBJ0, OBJ1, D0F, D1F, D2F, D3F, AR };
