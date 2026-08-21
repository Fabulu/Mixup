// THE STAGE-1 BOSS'S MOVEMENT LAYER -- `$29314C`, `$2933DE`, `$293400`,
// `$242494` and MAIN scripts 6 and 7.  W94 (recon 48's wave B, second slice).
//
// ============================================================================
// WHY THIS SLICE AND NOT ANOTHER -- the blocked rungs are TWO populations
// ============================================================================
// W82 shipped the boss's stage ENDING and its four OBJECT routines; W85 made
// sprite bucket 2 comparable against the board.  What is still blocked is the
// boss ITSELF: 43 of the checkpoint ladder's 71 segments, every one of them
// throwing on a table-F STEP.
//
// [M] W94 resolved every slot of all 72 rungs through the real tables in
// `$2596C6`'s real walk order, out of the ladder's own RAM dumps.  The union is
// **41 entry points, 34 of them unported** (W82 measured the same 41 and had 39
// unported; W82 and W85 have since landed 7).  And the 43 rungs split cleanly:
//
//   * lf12,000..18,750 -- **28 rungs**, and their whole union is TWELVE:
//       F4 $29556C   F5 $295626   F6 $2956F6   F1 $295120
//       MAIN2 $293432  MAIN5 $29359E  MAIN6 $2935E8  MAIN7 $293642
//       D20 $294AC0  E0 $295948   E1 $295AE0   E11 $296614
//   * lf8,250..11,750 -- **15 rungs**, the ARRIVAL, needing those plus 22 more.
//
// **MAIN 6 and MAIN 7 are two of the twelve, and they are the two the other ten
// all sit on**: every MAIN entry in this boss ends in the same tail (`$29314C`)
// and F6's first state is a rendezvous with `MAIN.get == 7`.  So the movement is
// what the phase machine is written against, and it is transcribed here first.
//
// ============================================================================
// WHAT THE BOSS DOES IN THIS PHASE
// ============================================================================
// MAIN 6 walks it toward the fixed point (`$7400`, `$1C00`) and hands over to
// MAIN 7 when it gets within `$100`.  MAIN 7 wanders between the EIGHT
// waypoints of `$293694`, drawing a new one at random the moment it arrives.
// Both end in `$29314C`, the LIMB PLACEMENT: the two side parts are hung off a
// FIVE-FRAME position history so they trail the body.
//
// ============================================================================
// WHAT IS NOT HERE, AND IS A LOUD NAMED THROW
// ============================================================================
// The other ten of the twelve.  They are reachable from what this file
// registers -- MAIN 6's `$293620 MAIN.start 7` is inside this file, but F4/F5/F6
// and the guns are not -- so a seeded rung still stops by address on them, which
// is the honest state and is what the worklog reports.  **Nothing here is
// clamped or stubbed to stop a throw.**

import { u16, i16 } from './ram.js';
import { registerScript, seqStart2598D0 } from './scheduler.js';
import { aim64, slew64, AimTables } from './aim.js';
import { applyVelocity } from './movement.js';
import { drawByte242E24 } from './rng.js';

/** A byte, the way every `.b` operation in this file truncates. */
const u8 = (v) => v & 0xff;

/**
 * ONE named-wrong-port seam, W79's device.  `portdiff.mjs` and `breakage.mjs`
 * reset it on every run; the shipped value is `null` and every branch below is
 * inert while it is.
 */
export const W94_MUTATE = { value: null };

/** Every ROM address this file transcribes, so a reader can check any line. */
export const W94 = {
  dist242494: 0x242494,
  bodyTail29314C: 0x29314c,
  pickWaypoint2933DE: 0x2933de,
  rampSpeed293400: 0x293400,
  main6Init: 0x2935de, main6Step: 0x2935e8,
  main7Init: 0x293634, main7Step: 0x293642,
  trampoline293554: 0x293554,     // `bra.w $29314C`, ONE instruction
  waypoints293694: 0x293694,      // 8 x (Y,X) words -- MAIN 7's destinations
  main6TargetY: 0x7400, main6TargetX: 0x1c00,
  arriveDist: 0x100,              // $293616 / $293684 cmpi.w #$100
};

/** The boss sub-record (A6) fields this file reads, by the ROM's own offsets. */
export const BS = {
  pos: 0x02, posY: 0x02, posX: 0x04,
  speed: 0x1a,          // $2417E0 move.b ($1a,A6),D0 -- and $293400 ramps it
  facing: 0x1b,         // $2417E4 -- $2935FC / $293664 write it
  shadow: 0xa2,         // $29315C move.l D1,($a2,A6)
  shadowSrc: 0xa6,      // $293152 add.l ($a6,A6),D1
  // part 1, at ($22..$4C,A6); part 2 at ($62..$8C,A6)
  p1Pos: 0x22, p1Lo: 0x24, p1Off: 0x26, p1Dead: 0x3f,
  p1Spd: 0x4a, p1Ang: 0x4b, p1Trim: 0x4c,
  p2Pos: 0x62, p2Lo: 0x64, p2Off: 0x66, p2Dead: 0x7f,
  p2Spd: 0x8a, p2Ang: 0x8b, p2Trim: 0x8c,
};

/** `$29316E`'s five-longword POSITION HISTORY, at its real addresses. */
export const LIMB_RING = Object.freeze({
  newest: 0x81585c,     // $293174 move.l d0,(a1) -- A1 after four pre-decrements
  oldest: 0x81586c,     // $29317E / $2931C4 move.l $81586C,d0
  longs: 5,
});

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

// ===========================================================================
// $24248E/$242494 -- THE OCTAGONAL DISTANCE, and the Y axis is PRE-SCALED
// ===========================================================================
//   24248E: movem.w $2(a0),d2-d3            target Y/X on the fall-through path
//   242494: movem.w $2(a6),d0-d1            self Y/X on the direct entry
//   24249A: sub.w d2,d0 / bpl.s $2424A0 / neg.w d0         |dY|
//   2424A0: move.w d0,d4 / lsr.w #$2,d4 / sub.w d4,d0     ...x 3/4
//   2424A6: sub.w d3,d1 / bpl.s $2424AC / neg.w d1         |dX|
//   2424AC: cmp.w d1,d0 / bcc.s $2424B2 / exg.l d1,d0     d0 := max, d1 := min
//   2424B2: lsr.w #$1,d1 / add.w d1,d0 / move.w d0,d0     max + min/2
//   2424B8: rts
//
// Direct `$242494` callers already hold target Y/X in D2/D3. `$242486` callers
// load those words from `($2,A0)` at `$24248E` and fall through. Both `movem.w`
// loads sign-extend into the data registers, but every operation below consumes
// and wraps only the low word; the API therefore accepts and returns words.
//
// TWO THINGS THE ADDRESSES DO NOT TELL YOU:
//
//  1. **THE THREE-QUARTER SCALING IS ON Y ONLY.**  `$2424A2 lsr.w #$2` then
//     `sub.w` is `d0 - d0/4`, and there is no matching pair on the X side.  It
//     is the screen's aspect arriving in the arithmetic.  A port that scaled
//     both axes, or neither, gets a circle where the ROM has a squashed octagon
//     and MAIN 6 hands over at the wrong place.
//  2. **BOTH SHIFTS ARE LOGICAL.**  `lsr.w`, not `asr.w`.  The two operands are
//     already absolute so it makes no difference in practice -- but a port that
//     kept them signed and used `>>` would halve `-1` to `-1`.
/** `$242494` -- returns D0 as an unsigned word. */
export function dist242494(selfY, selfX, tgtY, tgtX) {
  let d0 = u16(selfY - tgtY);                           // $24249A sub.w d2,d0
  if (i16(d0) < 0) d0 = u16(-d0);                       // $24249C bpl / $24249E neg
  const d4 = W94_MUTATE.value === 'dist-no-aspect' ? 0 : d0 >>> 2;  // $2424A2
  d0 = u16(d0 - d4);                                    // $2424A4 sub.w d4,d0
  let d1 = u16(selfX - tgtX);                           // $2424A6 sub.w d3,d1
  if (i16(d1) < 0) d1 = u16(-d1);                       // $2424AA neg.w d1
  if (d0 < d1) { const t = d0; d0 = d1; d1 = t; }       // $2424AC cmp.w / $2424B0 exg
  return u16(d0 + (d1 >>> 1));                          // $2424B2 lsr.w / add.w
}

// ===========================================================================
// $29314C -- THE BODY TAIL.  Every MAIN script ends here.
// ===========================================================================
// **THE FIVE-LONGWORD RING IS THE WHOLE POINT AND IT PORTS BACKWARDS EASILY.**
//
//   293160: lea $815870,a0 / lea $81586C,a1
//   29316C: moveq #$3,d1
//   29316E: move.l -(a1),-(a0) / dbra d1,$29316E
//   293174: move.l d0,(a1)
//
// BOTH operands pre-decrement, so the four copies are, in order,
// `[$81586C] := [$815868]`, `[$815868] := [$815864]`,
// `[$815864] := [$815860]`, `[$815860] := [$81585C]` -- the ring shifts UP in
// address -- and the store afterwards lands at `$81585C`, where A1 was left.
//
// > So **`$81585C` is THIS frame's body position and `$81586C` is the position
// > FIVE FRAMES AGO**, and it is `$81586C` that the parts read.  A port that
// > shifted the other way, or that wrote the new value at `$81586C`, makes the
// > arms LEAD the body instead of trailing it -- and no single field says so,
// > because every value in the ring is a position the body really had.
//
// **THE TWO PART BLOCKS ARE NOT SYMMETRIC.**  `$29318C addi.w #$80,$24(a6)` and
// `$2931D2 addi.w #$FF80,$64(a6)` -- one adds $80 to its low word and the other
// subtracts it.  That is the left/right mirror, and copying the first block
// twice is the transcription `tail-both-plus80` stands for.
//
// **AND THE TWO SHIFTS ON THE VECTOR DIFFER**: `$2931A4 asl.w #$1,d2` on Y,
// `$2931AE asl.w #$2,d3` on X, with a constant `#$FD80` added to Y alone.
export function bodyTail29314C(ram, ctx, a6) {
  const pos = ram.u32(a6 + BS.pos);                     // $29314C move.l $2(a6),d0
  // $293150..$29315C -- the SHADOW longword: position + ($a6,A6) + $E0000000.
  // The same shape `$2933C2` (the death drift, W82) computes with `$DE000000`.
  ram.setU32(a6 + BS.shadow,
    (pos + ram.u32(a6 + BS.shadowSrc) + 0xe0000000) >>> 0);   // $293152/$293156/$29315C
  // $293160..$293174 -- the ring, shifted from the OLDEST end down.
  if (W94_MUTATE.value === 'ring-reversed') {
    for (let a = LIMB_RING.newest; a < LIMB_RING.oldest; a += 4) {
      ram.setU32(a, ram.u32(a + 4));
    }
    ram.setU32(LIMB_RING.oldest, pos);
  } else {
    for (let a = LIMB_RING.oldest; a > LIMB_RING.newest; a -= 4) {
      ram.setU32(a, ram.u32(a - 4));                    // $29316E move.l -(a1),-(a0)
    }
    ram.setU32(LIMB_RING.newest, pos);                  // $293174 move.l d0,(a1)
  }

  const lagged = ram.u32(LIMB_RING.oldest);             // $29317E / $2931C4
  const part = (dead, posAt, loAt, offAt, spdAt, angAt, trimAt, bias) => {
    if (ram.u8(a6 + dead) !== 0) return;                // $293176 / $2931BC tst.b
    ram.setU32(a6 + posAt, (lagged + ram.u32(a6 + offAt)) >>> 0);   // $293184/$293188
    ram.setU16(a6 + loAt, u16(ram.u16(a6 + loAt) + bias));          // $29318C/$2931D2
    const v = ctx.tables.shotVector(ram.u8(a6 + spdAt),  // $29319E / $2931E4 jsr $241D34
      ram.u8(a6 + angAt));
    const dy = u16((v.dy << 1) + 0xfd80);               // $2931A4 asl.w #$1 / addi.w
    const dx = u16(W94_MUTATE.value === 'tail-same-shift'
      ? v.dx << 1 : v.dx << 2);                         // $2931AE asl.w #$2,d3
    ram.setU16(a6 + posAt, u16(ram.u16(a6 + posAt) + dy));          // $2931AA add.w
    ram.setU16(a6 + loAt, u16(ram.u16(a6 + loAt) + dx));            // $2931B0 add.w
    ram.setU16(a6 + posAt,                                          // $2931B4/$2931B8
      u16(ram.u16(a6 + posAt) - ram.u16(a6 + trimAt)));
  };
  part(BS.p1Dead, BS.p1Pos, BS.p1Lo, BS.p1Off, BS.p1Spd, BS.p1Ang, BS.p1Trim,
    0x0080);                                            // $293176..$2931BA
  part(BS.p2Dead, BS.p2Pos, BS.p2Lo, BS.p2Off, BS.p2Spd, BS.p2Ang, BS.p2Trim,
    W94_MUTATE.value === 'tail-both-plus80' ? 0x0080 : 0xff80);  // $2931BC..$293202
}

// ===========================================================================
// $2933DE -- DRAW THE NEXT WAYPOINT.  Two draws, and `(a4)` is NOT a slot.
// ===========================================================================
//   2933DE: jsr $242E24 / andi.w #$7,d0 / add.w d0,d0 / add.w d0,d0
//   2933EC: move.w d0,(a4)
//   2933EE: jsr $242E24 / andi.b #$3,d0 / addq.b #$2,d0 / move.b d0,$2(a4)
//
// **`(a4)` HERE IS NOT A CHANNEL STATUS WORD.**  The MAIN sequencer dispatches
// with A4 = `$81298C`, the sixteen-word LOCAL BLOCK (`$25973A lea`), not a
// `$20`-byte channel record -- so `move.w d0,(a4)` is an ordinary variable.  A
// reader carrying the A1/A3/A4 slot protocol across would read it as a sibling
// of `clr.w (a4)`, the "script done" idiom, and conclude MAIN 7 retires itself
// eight frames out of eight.
//
// **TWO DRAWS, NOT ONE**, and each one steps `$803917`.  That counter is shared
// with the whole game (`src/rng.js`), so collapsing them does not merely pick a
// different waypoint -- it desynchronises every later consumer of the same RNG.
export function pickWaypoint2933DE(ram, rom, a4) {
  const d0 = drawByte242E24(ram, rom);                  // $2933DE jsr $242E24
  ram.setU16(a4, (d0 & 7) * 4);                         // $2933E4/$2933E8/$2933EA/$2933EC
  if (W94_MUTATE.value === 'pick-one-draw') {
    ram.setU8(a4 + 2, ((d0 & 3) + 2) & 0xff); return;
  }
  const d1 = drawByte242E24(ram, rom);                  // $2933EE jsr $242E24
  ram.setU8(a4 + 2, ((d1 & 3) + 2) & 0xff);             // $2933F4/$2933F8/$2933FA
}

// ===========================================================================
// $293400 -- RAMP THE SPEED BYTE ONE STEP TOWARD THE SCRIPT'S TARGET
// ===========================================================================
//   293400: move.b $2(a4),d0 / move.b $1a(a6),d1
//   293408: cmp.b d0,d1 / beq.w $29341A
//   29340E: bgt.w $293418 -> subq.b #$1,d1
//           else $293412  -> addq.b #$1,d1
//   29341A: move.b d1,$1a(a6)
//
// `cmp.b d0,d1` computes `d1 - d0` and `bgt` is SIGNED, so a speed byte at or
// above `$80` ramps the WRONG WAY.  `bgt` is what the ROM wrote, and
// `ramp-unsigned` is the reading that is not.
// **One step per frame, never a jump**, which is why the boss's speed changes
// are visible as acceleration rather than as a snap.
//
// [M] AND THE WRONG WAY IS REACHABLE, WHICH IS WHY THIS IS NOT A FOOTNOTE.
// MAIN 6's target is `distance >> 7` (`$29360E`), so a distance of `$4000` or
// more makes the target byte NEGATIVE, and `$293400` then walks the speed DOWN
// from 0 -- to `$FF`, which is not one of the 92 speed levels
// `tools/export-tables.py` exports, so `$241820` stops the run BY ADDRESS.
// That crash is HONEST and is left alone: MAIN 6 is only ever entered from
// F4/F5/F6 with the boss already inside its own arena (the eight waypoints of
// `$293694` are all within `$200` of MAIN 6's target), so `$4000` is not a
// distance the game produces.  A clamp here would hide a real arrival.
export function rampSpeed293400(ram, a4, a6) {
  const target = ram.u8(a4 + 2);                        // $293400 move.b $2(a4),d0
  let cur = ram.u8(a6 + BS.speed);                      // $293404 move.b $1a(a6),d1
  if (cur !== target) {                                 // $293408 cmp.b / $29340A beq
    const gt = W94_MUTATE.value === 'ramp-unsigned'
      ? cur > target                                    // the wrong port
      : ((cur << 24) >> 24) > ((target << 24) >> 24);   // $29340E bgt.w, SIGNED
    cur = u8(gt ? cur - 1 : cur + 1);                   // $293418 subq / $293412 addq
  }
  ram.setU8(a6 + BS.speed, cur);                        // $29341A move.b d1,$1a(a6)
}

// ===========================================================================
// MAIN 6 -- WALK TO ($7400,$1C00) AND HAND OVER TO MAIN 7
// ===========================================================================
// **THE INIT FALLS THROUGH INTO THE STEP.**  `$2935DE` is two instructions and
// `$2935E8`, the STEP, is the next address -- there is no `rts` between them.
// Recon 48 2.2 makes the same observation about F id 0 and calls it the table's
// house style.  The scheduler dispatches entry `+0` on the arming frame, so on
// that frame the board runs INIT **and then** STEP; a port that ran the INIT
// alone loses one frame of movement every time the phase is entered.
export function main6Init2935DE(ram, a4, a6) {
  ram.setU16(a4, 0);                                    // $2935DE move.w #$0,(a4)
  ram.setU8(a4 + 2, ram.u8(a6 + BS.speed));             // $2935E2 move.b $1a(a6)
}

export function main6Step2935E8(ram, rom, ctx, a4, a5, a6) {
  const selfY = ram.u16(a6 + BS.posY), selfX = ram.u16(a6 + BS.posX);
  // $2935F0 movem.w $2(a6),d0-d1 / $2935F6 jsr $24203E -- the 64-step aim CORE.
  // Its answer is stored RAW into the facing byte with **no slew**, which is
  // what makes MAIN 6 a snap-turn and MAIN 7 (`$29365E jsr $242190`) a smooth
  // one.  The two scripts are otherwise the same shape, so the missing slew is
  // the entire difference and it is one instruction.
  const face = aim64(aimTables(rom), selfY, selfX,
    W94.main6TargetY, W94.main6TargetX);                // $2935E8/$2935EC/$2935F6
  ram.setU8(a6 + BS.facing, face & 0xff);               // $2935FC move.b d1,$1b(a6)
  const d0 = dist242494(selfY, selfX, W94.main6TargetY, W94.main6TargetX);  // $293608
  // $29360E move.w d0,d1 / lsr.w #$7,d1 / move.b d1,$2(a4) -- **the SPEED
  // TARGET is the distance over 128**, so the boss decelerates as it closes and
  // `$293400` ramps it one step a frame.  `lsr.w` is logical and the byte store
  // truncates, so a distance above `$7F80` wraps rather than saturating.
  ram.setU8(a4 + 2, (d0 >>> 7) & 0xff);                 // $29360E/$293610/$293612
  // **`$293616 cmpi.w #$100,d0 / bgt.w` IS SIGNED and D0 IS A DISTANCE.**
  // `$242494` can return up to `$FFFF + $7FFF/2` truncated to a word, so a
  // distance at or above `$8000` reads NEGATIVE and takes the ARRIVED arm.  That
  // is what the ROM does; `main6-unsigned-arrive` is the reading that does not.
  const arrived = W94_MUTATE.value === 'main6-unsigned-arrive'
    ? d0 <= W94.arriveDist : i16(d0) <= W94.arriveDist;
  if (arrived) seqStart2598D0(ram, 7);                  // $29361E/$293620 MAIN.start 7
  rampSpeed293400(ram, a4, a6);                         // $293626 bsr.w $293400
  applyVelocity(ram, ctx.tables, a5);                   // $29362A jsr $2417DE
  bodyTail29314C(ram, ctx, a6);                         // $293630 bra.w $29314C
}

// ===========================================================================
// MAIN 7 -- WANDER BETWEEN THE EIGHT WAYPOINTS OF $293694
// ===========================================================================
// **THE INIT FALLS THROUGH TOO, AND THROUGH A `bsr`.**  `$29363E bsr.w $2933DE`
// pushes `$293642` -- which IS the STEP -- so `$2933DE`'s own `rts` lands on the
// first instruction of the STEP.  The arming frame therefore draws a waypoint
// and immediately moves toward it.
export function main7Init293634(ram, rom, a4, a6) {
  ram.setU16(a4, 0);                                    // $293634 move.w #$0,(a4)
  ram.setU8(a4 + 2, ram.u8(a6 + BS.speed));             // $293638 move.b $1a(a6)
  pickWaypoint2933DE(ram, rom, a4);                     // $29363E bsr.w $2933DE
}

/** `$293642 lea $293694(pc),a0 / adda.w (a4),a0 / movem.w (a0),d2-d3`. */
function waypoint(rom, ram, a4) {
  const at = W94.waypoints293694 + u16(ram.u16(a4));    // $293648 adda.w (a4),a0
  return { y: rom.u16(at), x: rom.u16(at + 2) };        // $29364A movem.w (a0),d2-d3
}

export function main7Step293642(ram, rom, ctx, a4, a5, a6) {
  let t = waypoint(rom, ram, a4);                       // $293642..$29364A
  const want = aim64(aimTables(rom), ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    t.y, t.x);                                          // $29364E/$293654 jsr $24203E
  // $29365A move.b $1b(a6),d0 / $29365E jsr $242190 -- ONE STEP of slew.
  ram.setU8(a6 + BS.facing, slew64(ram.u8(a6 + BS.facing), want) & 0xff);  // $293664
  rampSpeed293400(ram, a4, a6);                         // $293668 bsr.w $293400
  applyVelocity(ram, ctx.tables, a5);                   // $29366C jsr $2417DE
  // **THE WAYPOINT IS RE-READ AFTER THE MOVE** (`$293672..$29367A`) -- and
  // A CLAIM THIS WAVE WROTE AND THEN WITHDREW.  The first draft of this comment
  // said a port that reused the pre-move reading would test LAST frame's
  // distance and overshoot by one frame per waypoint.  **It would not**, and the
  // mutation proved it by refusing to go red.
  //
  // [M] `$293642..$293690` touches `(a4)` at exactly TWO instructions, and both
  // are `adda.w (a4),a0` -- READS (`$293648` and `$293678`).  Nothing in the
  // span writes it, and none of the four callees can: `$24203E` and `$242190`
  // are pure, `$293400` writes `($1a,A6)`, `$2417DE` writes `($2,A6)`/`($4,A6)`.
  // So the re-read returns the same two words the first read did.
  //
  // What DOES change across `$29366C jsr $2417DE` is the boss's own position --
  // and the port reads that at the point of use, below, on both paths.  So the
  // re-read is a PROVABLE NO-OP, `main7-stale-target` is declared
  // EXPECTED-GREEN with that measurement rather than deleted, and
  // `tests/w94boss.test.js` asserts its output is BYTE-IDENTICAL rather than
  // merely "did not go red".  The instruction is still transcribed, because the
  // ROM executes it and a later wave reading this file should see the same shape
  // the listing has.
  if (W94_MUTATE.value !== 'main7-stale-target') t = waypoint(rom, ram, a4);
  const d0 = dist242494(ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX), t.y, t.x);
  // `$293688 bgt.w $293554` -- and **`$293554` is ONE INSTRUCTION,
  // `bra.w $29314C`**.  It sits inside MAIN 5's address range but it is a
  // trampoline the assembler needed for reach, NOT a jump into MAIN 5.  Read as
  // a jump into another script it would look like a phase change that does not
  // exist.
  if (i16(d0) <= W94.arriveDist) pickWaypoint2933DE(ram, rom, a4);  // $29368C bsr
  bodyTail29314C(ram, ctx, a6);                         // $293690 bra.w $29314C
}

// ============================================================= REGISTRATION
// The scheduler dispatches through a register, so this map is the port's only
// statement about what may run.  `bossA6`/`bossA5` throw by address if a script
// is dispatched with nothing published, which is the case the scheduler running
// outside `$292902`'s frame would produce.
import { bossA5, bossA6 } from './boss.js';

registerScript(0x2935de, (ram, rom, ctx, a4) => {
  const a6 = bossA6(ctx, 0x2935de);
  main6Init2935DE(ram, a4, a6);
  // THE FALL-THROUGH, and it is not a convenience: `$2935E8` is the very next
  // address and nothing separates them.
  main6Step2935E8(ram, rom, ctx, a4, bossA5(ctx, 0x2935de), a6);
});
registerScript(0x2935e8, (ram, rom, ctx, a4) =>
  main6Step2935E8(ram, rom, ctx, a4, bossA5(ctx, 0x2935e8), bossA6(ctx, 0x2935e8)));

registerScript(0x293634, (ram, rom, ctx, a4) => {
  const a6 = bossA6(ctx, 0x293634);
  main7Init293634(ram, rom, a4, a6);
  main7Step293642(ram, rom, ctx, a4, bossA5(ctx, 0x293634), a6);  // the bsr's return
});
registerScript(0x293642, (ram, rom, ctx, a4) =>
  main7Step293642(ram, rom, ctx, a4, bossA5(ctx, 0x293642), bossA6(ctx, 0x293642)));
