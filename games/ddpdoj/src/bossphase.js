// THE STAGE-1 BOSS'S STEADY STATE -- the CLOSED SET OF TWELVE, minus the two
// W94 shipped.  MAIN 2 and 5, F 1/4/5/6, D 20, E 0/1/11.  W95.
//
// ============================================================================
// WHY THESE TEN AND WHY THEY HAD TO SHIP TOGETHER
// ============================================================================
// W94 resolved every slot of all 72 checkpoint rungs through the real tables in
// `$2596C6`'s real walk order and found the 43 blocked rungs are TWO
// populations.  The larger one -- **28 rungs, lf12,000..18,750** -- has a union
// of exactly TWELVE entry points, and every one of the 28 is a subset of the
// same twelve.  W94 shipped two of them (MAIN 6 and MAIN 7, `src/bossscripts.js`)
// and stopped, because:
//
// > **No proper subset of the twelve can be ORACLED.**  MAIN 6 and 7 run only
// > while the boss is alive, all 43 boss-alive segments were blocked on the
// > other ten, and so no frame in this repo executed W94's code with a traced
// > column beside it.  Unblocking a rung is the only thing that puts a
// > boss-alive frame inside the comparison, and the cheapest rung needs all
// > twelve.
//
// `[M]` this wave re-measured that partition from the ladder's own RAM with the
// ported set DERIVED from `registerScript` rather than typed in
// (`.scratch/w95/census.py`): 41 entry points over all rungs, **32 unported**,
// and the 28 steady-state rungs' union is the twelve.  The premise held.
//
// ============================================================================
// WHAT THE BOSS DOES IN THIS PHASE
// ============================================================================
// **F is the conductor and MAIN is the phase.**  The steady state is a loop:
//
//   F6  waits for MAIN == 7 (the waypoint wander W94 shipped), starts D20,
//       sweeps the body row `$AC(A6)` toward the player, fires E13 in a rising
//       ladder, and hands to F2.
//   F1  runs a four-state gun program over E1/E3/E4 and hands to F3.
//   F4  is the ONE-PART-DESTROYED script: alternating E11 / E12 bursts.
//   F5  is the BOTH-PARTS-DESTROYED script: E0 on a cadence.
//   MAIN 2 wanders eight waypoints of its own (`$293482`), MAIN 5 walks to
//       (`$5C00`,`$1C00`) and hands to MAIN 2.
//   D20 steps the body-animation cursor `$AA(A6)` every frame, which is what
//       OBJECT 3 (`$292BFA`, W82) indexes its sprite table with.
//   E0/E1/E11 are guns: kind 3, kind 12 and kind 19.
//
// ============================================================================
// EIGHT OF THE TEN INITs FALL THROUGH INTO THEIR STEPs
// ============================================================================
// `[M]` MAIN 2, MAIN 5, D 20, F 1, F 4, F 5, F 6 and E 11 have NO `rts` between
// the init pointer and the step pointer -- the arming frame runs both.  **E 0
// (`$295946`) and E 1 (`$295ADE`) are the two that end in `rts`.**  Recon 48
// §2.2 calls the fall-through the table's house style and W94 found it on MAIN
// 6 and 7; it is the rule here and the exception is worth naming, because a
// port that guessed either way would be wrong 20 % or 80 % of the time.
//
// ============================================================================
// WHAT IS NOT HERE
// ============================================================================
// The ARRIVAL population (W94 §3B) and everything the ten can start that is not
// itself one of the ten: E3 (`$295E5E`), E4 (`$295F94`), E12 (`$2966B8`),
// E13 (`$296790` -- bullet kind 11), D15 (`$294878`), F2 (`$295304`),
// F3 (`$295432`).  Every one is a LOUD NAMED THROW by address.  **Nothing here
// is clamped or stubbed to stop a throw.**

import { u16, i16 } from './ram.js';
import {
  registerScript, seqStart2598D0, seqCurrent2598C8, spread2595F2,
  a1Start259A18, a1Running259A4A, a3Start259962, a3Stop2599EC, a4Start25980C,
} from './scheduler.js';
import { aim64, slew64, aim64FromCaller, aim256AtTarget, AimTables } from './aim.js';
import { applyVelocity } from './movement.js';
import { drawSigned242FDE } from './rng.js';
import { drawByte242B3C } from './items.js';
import { fire as fireBulletFan, WriteLog } from './bullets.js';
import {
  BS, dist242494, bodyTail29314C, pickWaypoint2933DE, rampSpeed293400,
} from './bossscripts.js';
import { bossA5, bossA6 } from './boss.js';

/** A byte, the way every `.b` operation in this file truncates. */
const u8 = (v) => v & 0xff;
/** A signed byte, which is what every `bgt`/`bmi`/`asr.b` here reads. */
const i8 = (v) => (v << 24) >> 24;

/**
 * ONE named-wrong-port seam, W79's device.  `portdiff.mjs` and `breakage.mjs`
 * reset it on every run; the shipped value is `null` and every branch below is
 * inert while it is.
 */
export const W95_MUTATE = { value: null };

/** Every ROM address this file transcribes, so a reader can check any line. */
export const W95 = {
  main2Init: 0x293420, main2Step: 0x293432,
  main5Init: 0x293578, main5Step: 0x29359e,
  d20Init: 0x294aba, d20Step: 0x294ac0,
  f1Init: 0x295002, f1Step: 0x295120,
  f4Init: 0x29554a, f4Step: 0x29556c,
  f5Init: 0x295616, f5Step: 0x295626,
  f6Init: 0x295684, f6Step: 0x2956f6,
  e0Init: 0x2958f2, e0Step: 0x295948,
  e1Init: 0x295a7e, e1Step: 0x295ae0,
  e11Init: 0x2965f8, e11Step: 0x296614,
  // the ROM tables, all read at the computed address (W48's work-list item 4)
  main2Waypoints: 0x293482,   // $293432 lea $293482(pc),A0 -- 8 (Y,X) pairs
  f1PeriodTab: 0x294fca,      // $29503A lea, byte
  f1AngleTab: 0x294fd2,       // $29501E lea, byte
  f1CadenceTab: 0x294fda,     // $2950AC lea, byte
  f1CountTab: 0x294fe2,       // $2950BA lea, word
  f1SpreadTab: 0x294ff2,      // $2950EA lea, word
  f1Sequence: 0x2952d2,       // $29529E lea -- 0003 0002 FFFF
  f6Tab: 0x295664,            // $2956BA lea -- 8 (count, ladder) word pairs
  e0TabA: 0x2958d2,           // $295932 lea, word
  e0TabB: 0x2958e2,           // $29593C lea, word
  e0Muzzle: 0x2959c4,         // $295990/$2959A0 move.l (d16,PC),D3
  e1Tab: 0x295a6e,            // $295A90 lea, word
  e1Muzzle: 0x2959d4,         // $295C66..$295C92 -- the FOUR turret offsets
  e11Tab: 0x2965e8,           // $29660A lea, word
  e11Muzzle: 0x29667c,        // $296640..$296664
  // the HP gate both E 0 and E 11 carry
  hpGate: 0x48cc,             // $295948 / $296614 cmpi.l #$48CC,$16(A5)
  freeze8130D4: 0x8130d4,     // $295B68 tst.w -- E 1's own freeze gate
};

const AIM_TABLES = new WeakMap();
function aimTables(rom) {
  let t = AIM_TABLES.get(rom);
  if (!t) { t = new AimTables(rom); AIM_TABLES.set(rom, t); }
  return t;
}

/** The 68000 `subq.b #1,<ea>` + `bcc`: BCC is taken while the OLD value was
 *  non-zero (a borrow out of 0 is what sets C).  Returns TRUE for "bcc taken",
 *  i.e. "not yet".  Same primitive `src/boss.js` calls `decByteBcc`. */
function subqByteBcc(ram, a) {
  const v = ram.u8(a);
  ram.setU8(a, u8(v - 1));
  return v !== 0;
}

/** `$293482`/`$293694`-shaped waypoint read: `lea TAB(pc),A0 / adda.w (A4),A0
 *  / movem.w (A0),D2-D3`.  The index is `(A4)`, whose only writer is
 *  `$2933EC move.w D0,(A4)` with D0 = `($242E24 & 7) * 4`. */
function waypointAt(rom, ram, a4, base) {
  const at = base + u16(ram.u16(a4));                   // $293438 adda.w (a4),a0
  return { y: rom.u16(at), x: rom.u16(at + 2) };        // $29343A movem.w (a0),d2-d3
}

// ===========================================================================
// MAIN 2 -- $293420 / $293432.  THE WANDER, and its INIT is a WORD.
// ===========================================================================
// **`$293424 move.w #$20,$1A(A6)` IS A WORD AND IT IS THE TRAP IN THIS ROUTINE.**
// `$1A(A6)` is the SPEED byte and `$1B(A6)` is the FACING byte (`$2417E0` and
// `$2417E4` read exactly those two).  A word store at `$1A` therefore writes
// **speed := $00 and facing := $20** -- it does NOT set the speed to $20, which
// is what every neighbouring script does with a `move.b`.  MAIN 5 two entries
// down writes `$29357C move.b #$4,$1A(A6)`, so the two are three bytes and one
// suffix apart and mean opposite things.  `main2-speed-20` is the reading that
// takes the immediate for the speed.
//
// The boss is therefore STOPPED and pointing at $20 on the arming frame, and
// what starts it moving again is the `$2(A4)` the fall-through overwrites:
//
//   $29342A move.b $1A(A6),$2(A4)     ramp target := 0  (the speed just zeroed)
//   $293430 bsr.b $2933DE             ...and $2933F4 OVERWRITES it with 2..5
//
// so the speed target is a RANDOM 2..5 and the `$29342A` store is dead the
// instant it is made.  MAIN 7's init has the same pair and W94 transcribed it
// there; here the dead store is louder because the value it saves is a zero the
// same routine wrote two instructions earlier.
export function main2Init293420(ram, rom, a4, a6) {
  ram.setU16(a4, 0);                                    // $293420 move.w #$0,(a4)
  if (W95_MUTATE.value === 'main2-speed-20') {
    ram.setU8(a6 + BS.speed, 0x20);                     // the WRONG port
  } else {
    ram.setU16(a6 + BS.speed, 0x0020);                  // $293424 move.w #$20,$1a(a6)
  }
  ram.setU8(a4 + 2, ram.u8(a6 + BS.speed));             // $29342A -- DEAD, see above
  pickWaypoint2933DE(ram, rom, a4);                     // $293430 bsr.b $2933DE
}

export function main2Step293432(ram, rom, ctx, a4, a5, a6) {
  let t = waypointAt(rom, ram, a4, W95.main2Waypoints); // $293432..$29343A
  const want = aim64(aimTables(rom), ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    t.y, t.x);                                          // $29343E/$293444 jsr $24203E
  // **ONE STEP OF SLEW, exactly like MAIN 7 and unlike MAIN 5/6.**  `$29344A
  // move.b $1B(A6),D0 / $29344E jsr $242190` is the limiter; MAIN 5 and MAIN 6
  // store `$24203E`'s answer RAW.  The difference between a snap turn and a
  // smooth one in this boss is one `jsr`.
  ram.setU8(a6 + BS.facing, slew64(ram.u8(a6 + BS.facing), want) & 0xff);  // $293454
  rampSpeed293400(ram, a4, a6);                         // $293458 bsr.b $293400
  applyVelocity(ram, ctx.tables, a5);                   // $29345A jsr $2417DE
  // $293460..$293468 -- THE WAYPOINT IS RE-READ AFTER THE MOVE, the same
  // instruction pair W94 §2.1 proved is a no-op for MAIN 7 and for the same
  // reason: nothing between the two reads writes `(A4)`.  It is transcribed
  // because the ROM executes it.
  t = waypointAt(rom, ram, a4, W95.main2Waypoints);
  const d0 = dist242494(ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX), t.y, t.x);
  if (i16(d0) <= 0x100) pickWaypoint2933DE(ram, rom, a4);   // $293472/$29347A
  bodyTail29314C(ram, ctx, a6);                         // $29347E bra.w $29314C
}

// ===========================================================================
// MAIN 5 -- $293578 / $29359E.  WALK TO ($5C00,$1C00) AND HAND TO MAIN 2.
// ===========================================================================
// **THERE IS NO SPEED RAMP IN MAIN 5 and the init's `$2(A4)` store is dead.**
// `$293582 move.b $1A(A6),$2(A4)` writes the ramp target, and the STEP never
// calls `$293400` -- `$2935D4 jsr $2417DE` follows the arrival test directly.
// So the speed the init sets is the speed the whole phase runs at, and:
//
// > **`$293598 move.b #$8,$1A(A6)` STICKS.**  Both side parts destroyed
// > (`$3F(A6) + $7F(A6) == 2`) doubles the boss's speed for the whole of MAIN
// > 5, and it doubles it AFTER `$2(A4)` was captured at 4.  A port that added
// > the ramp -- which every neighbouring MAIN script has -- would walk the 8
// > back down to 4 at one step a frame and the wounded boss would move at the
// > healthy speed.  `main5-ramp` is that reading.
export function main5Init293578(ram, a4, a6) {
  ram.setU16(a4, 0);                                    // $293578 move.w #$0,(a4)
  ram.setU8(a6 + BS.speed, 4);                          // $29357C move.b #$4
  ram.setU8(a4 + 2, ram.u8(a6 + BS.speed));             // $293582 -- DEAD, no ramp
  // $293588 move.b $3F(A6),D0 / add.b $7F(A6),D0 / cmpi.b #$2 -- the two
  // "part destroyed" flags `src/boss.js` sets in `$294E3E` and `$294E94`.
  if (u8(ram.u8(a6 + 0x3f) + ram.u8(a6 + 0x7f)) === 2) {   // $293590/$293594 bne
    ram.setU8(a6 + BS.speed, 8);                        // $293598 move.b #$8
  }
}

export function main5Step29359E(ram, rom, ctx, a4, a5, a6) {
  void a4;
  const face = aim64(aimTables(rom), ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    0x5c00, 0x1c00);                                    // $29359E..$2935AC
  ram.setU8(a6 + BS.facing, face & 0xff);               // $2935B2 -- RAW, no slew
  // $2935B6/$2935BA reload the SAME two immediates before `$242494`.  They are
  // reloaded because `$24203E` clobbers D2/D3, not because the target moved.
  const d0 = dist242494(ram.u16(a6 + BS.posY), ram.u16(a6 + BS.posX),
    0x5c00, 0x1c00);                                    // $2935BE jsr $242494
  if (W95_MUTATE.value === 'main5-ramp') rampSpeed293400(ram, a4, a6);
  if (i16(d0) <= 0x100) seqStart2598D0(ram, 2);         // $2935C4/$2935CC MAIN.start 2
  applyVelocity(ram, ctx.tables, a5);                   // $2935D4 jsr $2417DE
  bodyTail29314C(ram, ctx, a6);                         // $2935DA bra.w $29314C
}

// ===========================================================================
// D 20 -- $294ABA / $294AC0.  THE CURSOR STEPPER, and its INIT IS A WORD TOO.
// ===========================================================================
// D 20 is D-script 7 (`$2943B0`, W82) WITHOUT the tick gate and WITHOUT the
// period ramp: it steps `$AA(A6)` by four on EVERY frame, where D 7 steps it
// once every `$AF(A6)` frames.  The two write the same field and the boss runs
// them at different times, which is how the body animation changes rate.
//
// **`$294ABA move.w #$0,$AE(A6)` CLEARS TWO BYTES.**  `$AE` is D 7's TICK and
// `$AF` is D 7's PERIOD (`src/boss.js` `d7Anim2943B0` names both).  A word
// store at `$AE` zeroes the period as well -- so arming D 20 also resets D 7's
// ramp to 0, and when D 7 next runs its `$2943D4 addq.b #$1,$AF(A6)` arm walks
// the period back UP toward 2 from zero rather than continuing where it was.
// `d20-init-byte` is the reading that clears only the tick.
export function d20Init294ABA(ram, a6) {
  if (W95_MUTATE.value === 'd20-init-byte') { ram.setU8(a6 + 0xae, 0); return; }
  ram.setU16(a6 + 0xae, 0);                             // $294ABA move.w #$0,$ae(a6)
}

export function d20Step294AC0(ram, a6) {
  const c = u16(ram.u16(a6 + 0xaa) + 4);                // $294AC0 addq.w #$4,$aa(a6)
  ram.setU16(a6 + 0xaa, c);
  // `$294ACA blt.w` keeps values STRICTLY below $1C, exactly as `$2943DC` does,
  // so the cycle is the SEVEN values 0,4,8,$C,$10,$14,$18 and never $1C -- the
  // eighth longword of every 32-byte row of `$292C2A` is unreachable from
  // either stepper.  `d20-wrap-ble` is the off-by-one that admits it.
  const past = W95_MUTATE.value === 'd20-wrap-ble' ? i16(c) > 0x1c : i16(c) >= 0x1c;
  if (past) ram.setU16(a6 + 0xaa, 0);                   // $294AC4/$294ACE
}

// ===========================================================================
// F 1 -- $295002 / $295120.  THE FOUR-STATE GUN PROGRAM.
// ===========================================================================
// F 1's INIT is 165 instructions and almost all of it is PARAMETER SETUP read
// out of five tables through `$2595F2`, which **always returns 4** (recon 48
// §1.7, W94 §1.3, `spread2595F2`).  So of the eight entries in each table only
// index 4 (and 8 for the two word tables) is ever reached -- and the port reads
// the cartridge at the computed address rather than baking the value in, so a
// table that moves throws by address instead of firing the wrong gun.
//
// **THREE RUNNING COUNTERS LIVE IN THE BOSS'S SUB-RECORD, NOT IN THE SLOT**, at
// `$10B`, `$10C`, `$10E` and `$110(A6)`, and each is clamped and then STEPPED
// by the init.  They persist across every restart of F 1, which is how the
// boss's guns get harder each time the phase comes round.  A port that put them
// in the slot would reset the difficulty on every arm.
export function f1Init295002(ram, rom, a4, a6) {
  seqStart2598D0(ram, 5);                               // $295002 MAIN.start 5
  ram.setU8(a4 + 0x02, 0);                              // $29500A clr.b $2(a4)
  ram.setU16(a4 + 0x04, 0x1000);                        // $29500E -- $4=$10, $5=$00
  const d0 = spread2595F2();                            // $295014/$295018 -> 4
  // $29501E lea $294FD2(pc),A0 / move.b (A0,D0.w),D1 / add.b $10C(A6),D1,
  // clamped BELOW $80 by an UNSIGNED `bcs`.
  let d1 = u8(rom.u8(W95.f1AngleTab + d0) + ram.u8(a6 + 0x10c));   // $295022/$295026
  if (d1 >= 0x80) d1 = 0x80;                            // $29502A cmpi.b/bcs/$295032
  ram.setU8(a4 + 0x08, d1);                             // $295036
  // $29503A lea $294FCA(pc),A0 -- the same index, a different table, and this
  // one SUBTRACTS its running counter and is floored at 3 by a SIGNED `bge`.
  d1 = u8(rom.u8(W95.f1PeriodTab + d0) - ram.u8(a6 + 0x10b));      // $29503E/$295042
  if (i8(d1) < 3) d1 = 3;                               // $295046 cmpi.b/bge/$29504E
  ram.setU8(a4 + 0x06, 0);                              // $295052 move.b #$0,$6(a4)
  // $295058 tst.w $813098 -- RANK.  One more frame of period at rank != 0, and
  // it is the ONLY place rank reaches this boss's guns.
  if (ram.u16(0x813098) !== 0) d1 = u8(d1 + 1);         // $29505E beq/$295062 addq.b
  ram.setU8(a4 + 0x07, d1);                             // $295064
  // $295068..$29508E -- the two byte counters STEP and CLAMP, in that order.
  ram.setU8(a6 + 0x10c, u8(ram.u8(a6 + 0x10c) + 2));    // $295068 addq.b #$2
  if (ram.u8(a6 + 0x10c) >= 0x80) ram.setU8(a6 + 0x10c, 0x80);     // $29506C bcs
  ram.setU8(a6 + 0x10b, u8(ram.u8(a6 + 0x10b) - 1));    // $29507C subq.b #$1
  if (i8(ram.u8(a6 + 0x10b)) < 3) ram.setU8(a6 + 0x10b, 3);        // $295080 bge
  ram.setU16(a4 + 0x0a, 0x6000);                        // $295090 -- $a=$60, $b=$00
  ram.setU8(a4 + 0x0c, 1);                              // $295096
  ram.setU8(a4 + 0x0d, 4);                              // $29509C
  const d0b = spread2595F2();                           // $2950A2/$2950A6 -> 4 again
  ram.setU8(a4 + 0x0b, rom.u8(W95.f1CadenceTab + d0b)); // $2950AC/$2950B4
  const w = d0b * 2;                                    // $2950B8 add.w d0,d0 -> 8
  // $2950BA lea $294FE2(pc),A0 -- WORD tables from here on, both ceilinged by a
  // SIGNED `ble` rather than floored, and both stepped afterwards.
  let d1w = u16(rom.u16(W95.f1CountTab + w) + ram.u16(a6 + 0x10e));  // $2950BE/$2950C2
  if (i16(d1w) > 4) d1w = 4;                            // $2950C6 cmpi.w/ble
  ram.setU16(a4 + 0x0e, d1w);                           // $2950D2
  ram.setU16(a6 + 0x10e, u16(ram.u16(a6 + 0x10e) + 1)); // $2950D6 addq.w #$1
  if (i16(ram.u16(a6 + 0x10e)) > 4) ram.setU16(a6 + 0x10e, 4);      // $2950DA
  d1w = u16(rom.u16(W95.f1SpreadTab + w) + ram.u16(a6 + 0x110));    // $2950EA/$2950F2
  if (i16(d1w) > 0x20) d1w = 0x20;                      // $2950F6
  ram.setU16(a4 + 0x10, d1w);                           // $295102
  ram.setU16(a6 + 0x110, u16(ram.u16(a6 + 0x110) + 2)); // $295106 addq.w #$2
  if (i16(ram.u16(a6 + 0x110)) > 0x20) ram.setU16(a6 + 0x110, 0x20);  // $29510A
  ram.setU16(a4 + 0x12, 0x2020);                        // $29511A
}

/**
 * `$295120` -- and **THE LAST THING IT DOES IS ALWAYS `F.start 3`.**
 *
 * `$29529E..$2952C8` walks a three-word sequence at `$2952D2` (`0003 0002
 * $FFFF`) with the cursor `$106(A6)`, and on the `$FFFF` terminator draws a
 * random 3-or-2 into D7 and moves it to D0 (`$2952BC move.w D7,D0`).  **D0 is
 * then overwritten by `$2952C6 moveq #$3,D0`, which BOTH arms fall into**, so
 * the value never reaches `$25980C`.  This is `$2595F2`'s trap wearing a third
 * hat: an elaborately computed answer discarded by the two bytes after it.
 *
 * What the sequence DOES still decide is whether `$106(A6)` advances -- the
 * `bpl` arm steps it by two and the terminator arm does not -- so the cursor
 * runs 0, 2, 4 and then sticks, and the RNG draw at `$2952B0` is a real draw
 * that steps `$803917` for the whole game.  `f1-start-d7` is the port that
 * believed the computation.
 */
export function f1Step295120(ram, rom, ctx, a4) {
  // ---- state 0 ($295120): wait for E 1 to be idle, then start it.
  if (ram.u8(a4 + 0x02) === 0) {                        // $295120 cmpi.b #$0
    if (!a1Running259A4A(ram, 1)                        // $29512A/$295132 bcs
      && !subqByteBcc(ram, a4 + 0x04)) {                // $295136 subq.b/bcc
      ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));          // $29513E
      ram.setU8(a4 + 0x02, 1);                          // $295144
      const a0 = a1Start259A18(ram, 1);                 // $29514A/$29514C E.start 1
      // **THE RETURN VALUE IS THE WHOLE POINT** (W94 §1.2): three parameters
      // are written into the slot `$259A18` just claimed.  A boolean primitive
      // cannot express this and the gun would fire with the residue.
      ram.setU16(a0 + 0x02, ram.u16(a4 + 0x06));        // $295152
      ram.setU8(a0 + 0x04, ram.u8(a4 + 0x08));          // $295158
      ram.setU16(a0 + 0x0c, ram.u16(a6From(ctx) + 0x108));            // $29515E
      ram.setU16(a6From(ctx) + 0x108,
        u16(ram.u16(a6From(ctx) + 0x108) + 2));         // $295164 addq.w #$2
      if (i16(ram.u16(a6From(ctx) + 0x108)) > 0x0c) {   // $295168 cmpi.w/ble
        ram.setU16(a6From(ctx) + 0x108, 0x0c);          // $295172
      }
    }
  }
  // ---- state 1 ($295178): while E 1 IS running, alternate E 3 and E 4.
  if (ram.u8(a4 + 0x02) === 1) {                        // $295178
    if (!a1Running259A4A(ram, 3) && !a1Running259A4A(ram, 4)) {      // $295182/$29518E
      if (!a1Running259A4A(ram, 1)) {                   // $29519A/$2951A2 bcs
        // E 1 has finished -- arm the volley timer and go to state 2.
        ram.setU8(a4 + 0x02, 2);                        // $2951A6
        ram.setU8(a4 + 0x14, u8(drawByte242B3C(ram, rom) + 0x20));   // $2951AC/$2951B2
      } else if (!subqByteBcc(ram, a4 + 0x0a)) {        // $2951BE subq.b/bcc
        ram.setU8(a4 + 0x0a, ram.u8(a4 + 0x0b));        // $2951C6
        // $2951CC moveq #$3,D0 / tst.b $C(A4) / bpl -> keep 3; NEGATIVE -> 4.
        const id = i8(ram.u8(a4 + 0x0c)) < 0 ? 4 : 3;   // $2951CE/$2951D6
        const a0 = a1Start259A18(ram, id);              // $2951D8
        ram.setU8(a0 + 0x02, 4);                        // $2951DE
        ram.setU8(a0 + 0x03, 0);                        // $2951E4
        // `$2951EA neg.b $C(A4)` then `bmi` -- the flag alternates 1,-1,1,... and
        // the `$E(A4)` step only happens on the frames it comes back POSITIVE,
        // i.e. every other shot.
        const neg = u8(-ram.u8(a4 + 0x0c));             // $2951EA
        ram.setU8(a4 + 0x0c, neg);
        if (i8(neg) >= 0) {                             // $2951EE bmi
          ram.setU16(a4 + 0x0e, u16(ram.u16(a4 + 0x0e) + 1));        // $2951F2
          if (i16(ram.u16(a4 + 0x0e)) > 4) ram.setU16(a4 + 0x0e, 4); // $2951F6
        }
      }
    }
  }
  // ---- state 2 ($295206): one paired E3+E4 volley, `bne` not `bcc`.
  if (ram.u8(a4 + 0x02) === 2) {                        // $295206
    // **`$295210 subq.b #$1,$14(A4) / bne` IS NOT THE `bcc` THE REST OF THIS
    // FILE USES.**  It fires on the frame the counter reaches ZERO, not on the
    // frame after it wraps, so the delay is exactly the drawn value and not one
    // more.  `f1-volley-bcc` is the reading that copies the neighbours.
    const t = ram.u8(a4 + 0x14);
    ram.setU8(a4 + 0x14, u8(t - 1));
    const fire = W95_MUTATE.value === 'f1-volley-bcc' ? t === 0 : u8(t - 1) === 0;
    if (fire && !a1Running259A4A(ram, 3) && !a1Running259A4A(ram, 4)) {
      const d7 = u16(drawSigned242FDE(ram, rom) + 1);   // $295230/$295236/$295238
      for (const id of [3, 4]) {                        // $29523A / $295252
        const a0 = a1Start259A18(ram, id);
        ram.setU8(a0 + 0x02, 8);                        // $295242 / $29525A
        ram.setU8(a0 + 0x03, u8(d7));                   // $295248 / $295260
        ram.setU16(a0 + 0x10, ram.u16(a4 + 0x10));      // $29524C / $295264
      }
      ram.setU8(a4 + 0x02, 3);                          // $29526A
    }
  }
  // ---- state 3 ($295270): wait for all three guns, then hand over and retire.
  if (ram.u8(a4 + 0x02) === 3) {                        // $295270
    if (!a1Running259A4A(ram, 1) && !a1Running259A4A(ram, 3)
      && !a1Running259A4A(ram, 4)) {                    // $29527A/$295286/$295292
      const cur = ram.u16(a6From(ctx) + 0x106);         // $2952A4 adda.w $106(a6),a0
      const seq = rom.u16(W95.f1Sequence + cur);        // $2952A8 move.w (a0),d0
      let d7 = 3;                                       // $2952AE moveq #$3,d7
      if (i16(seq) < 0) {                               // $2952AA bpl
        if (drawSigned242FDE(ram, rom) === 0) d7 = 2;   // $2952B0/$2952BA moveq #$2
      } else {
        ram.setU16(a6From(ctx) + 0x106, u16(cur + 2));  // $2952C2 addq.w #$2
      }
      // **$2952C6 moveq #$3,D0 -- D7 NEVER REACHES D0.**  See the header.
      a4Start25980C(ram, W95_MUTATE.value === 'f1-start-d7' ? d7 : 3);  // $2952C8
      ram.setU16(a4, 0);                                // $2952CE clr.w (a4)
    }
  }
}

/** F 1's three running counters live in the boss's SUB-RECORD, so the script
 *  needs A6 as well as its slot.  Published by `$292902`; a throw here means
 *  the scheduler ran outside the boss's frame. */
function a6From(ctx) { return bossA6(ctx, 0x295120); }

// ===========================================================================
// F 4 -- $29554A / $29556C.  ONE PART DESTROYED: E 11 and E 12, alternating.
// ===========================================================================
// `$294D9E`/`$294DBA` (W82's damage pass) start F 4 the moment either side part
// dies, so this is the FIRST script in the closed twelve whose arming is a
// consequence of play rather than of a phase timer.
//
// **EVERY `move.w` IN THE INIT LOADS TWO SEPARATE BYTE FIELDS.**  `$29555A
// move.w #$404,$8(A4)` is `$8 := 4` (the burst COUNT) and `$9 := 4` (its
// RELOAD); `$295554 move.w #$40,$6(A4)` is `$6 := 0` and `$7 := $40`, so the
// cadence counter starts at ZERO and the very first `subq.b` borrows and fires
// on frame one.  A port that read `$6(A4)` as a word counter of $40 would wait
// 64 frames for a shot the board takes immediately.
export function f4Init29554A(ram, a4) {
  ram.setU8(a4 + 0x02, 0);                              // $29554A clr.b $2(a4)
  ram.setU16(a4 + 0x04, 0x0080);                        // $29554E -- $4=0, $5=$80
  ram.setU16(a4 + 0x06, 0x0040);                        // $295554 -- $6=0, $7=$40
  ram.setU16(a4 + 0x08, 0x0404);                        // $29555A -- $8=4, $9=4
  ram.setU16(a4 + 0x0a, 0x6060);                        // $295560 -- $a=$60, $b=$60
  ram.setU16(a4 + 0x0c, 0x0404);                        // $295566 -- $c=4, $d=4
}

/** `$29556C`.  Two identical blocks over (E 11, `$6/$7`, `$8/$9`) and
 *  (E 12, `$a/$b`, `$c/$d`), and the states ping-pong 1 -> 2 -> 1 forever. */
export function f4Step29556C(ram, a4) {
  if (ram.u8(a4 + 0x02) === 0) {                        // $29556C
    // `$295576 subq.w #$1,$4(A4) / bne` -- a WORD countdown here, where the two
    // gun blocks below use BYTES.  $80 frames of silence before the first burst.
    const n = u16(ram.u16(a4 + 0x04) - 1);              // $295576
    ram.setU16(a4 + 0x04, n);
    if (n === 0) ram.setU8(a4 + 0x02, 1);               // $29557E
  }
  const block = (state, gun, cadAt, cntAt, next) => {
    if (ram.u8(a4 + 0x02) !== state) return;
    if (a1Running259A4A(ram, gun)) return;              // bcs -- one at a time
    if (ram.u8(a4 + cntAt) === 0) {                     // tst.b/bne
      ram.setU8(a4 + cntAt, ram.u8(a4 + cntAt + 1));    // reload the COUNT
      ram.setU8(a4 + 0x02, next);
      return;
    }
    if (!subqByteBcc(ram, a4 + cadAt)) {                // subq.b/bcc
      ram.setU8(a4 + cadAt, ram.u8(a4 + cadAt + 1));    // reload the CADENCE
      a1Start259A18(ram, gun);                          // E.start -- NO parameters
      ram.setU8(a4 + cntAt, u8(ram.u8(a4 + cntAt) - 1));
    }
  };
  block(1, 0x0b, 0x06, 0x08, 2);                        // $295584..$2955CA
  block(2, 0x0c, 0x0a, 0x0c, 1);                        // $2955CC..$295612
}

// ===========================================================================
// F 5 -- $295616 / $295626.  BOTH PARTS DESTROYED: E 0, forever.
// ===========================================================================
// The smallest of the twelve, and `$294D8E` (both `$3F(A6)` and `$7F(A6)` set)
// is its only starter.  **`$295620 move.w #$404,$6(A4)` IS DEAD**: the STEP
// never touches `$6` or `$7`, and F 4's identically-shaped init writes the same
// constant into fields its own step really uses.  Transcribed rather than
// dropped, because the write is observable in the slot and the ladder compares
// RAM.
export function f5Init295616(ram, a4) {
  ram.setU8(a4 + 0x02, 0);                              // $295616 clr.b $2(a4)
  ram.setU16(a4 + 0x04, 0x0040);                        // $29561A -- $4=0, $5=$40
  ram.setU16(a4 + 0x06, 0x0404);                        // $295620 -- DEAD
}

export function f5Step295626(ram, a4) {
  if (ram.u8(a4 + 0x02) === 0) ram.setU8(a4 + 0x02, 1); // $295626/$295630
  if (ram.u8(a4 + 0x02) !== 1) return;                  // $295636
  if (a1Running259A4A(ram, 0)) return;                  // $295640/$295648 bcs
  if (subqByteBcc(ram, a4 + 0x04)) return;              // $29564C subq.b/bcc
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));              // $295654
  a1Start259A18(ram, 0);                                // $29565A/$29565C E.start 0
}

// ===========================================================================
// F 6 -- $295684 / $2956F6.  THE RENDEZVOUS, THE BODY SWEEP AND THE LADDER.
// ===========================================================================
// F 6 is the only one of the twelve that reads the MAIN sequencer
// (`$295700 jsr $2598C8`, `MAIN.get`), and it is why W94 had to ship MAIN 6 and
// 7 first: **state 0 does nothing at all until `MAIN.get == 7`**, i.e. until
// the boss is wandering its waypoints.  That is the rendezvous the whole steady
// state is built on.
//
// THREE THINGS THE ADDRESSES DO NOT TELL YOU:
//
//  1. **`$2956AC`'s table index is a CONSTANT.**  `$2595F2` always returns 4
//     and the init multiplies by four, so `$295664 + 16` is the only pair of
//     the eight ever read: `($0006, $0003)`.  The other seven exist and are
//     unreachable in build B.
//  2. **STATE 0 GOES TO STATE 2.**  `$295744 move.b #$2,$2(A4)` -- there is no
//     state 1 in this script and the cascade below tests 2 and then 3.
//  3. **`$295740 move.b D1,$3(A4)` IS A DEAD STORE**, and it costs two RNG
//     draws to compute: `$242FDE` at `$295726` and `$242B3C` at `$295736`.
//     Nothing in F 6 or in any script it starts reads `$3(A4)`.  The draws are
//     NOT dead -- both step `$803917`, which the whole game shares -- so a port
//     that skipped the computation because its result is unused would
//     desynchronise every later consumer of the RNG.  `f6-one-draw` is that
//     port.
export function f6Init295684(ram, rom, a4, a6) {
  ram.setU8(a4 + 0x02, 0);                              // $295684 clr.b $2(a4)
  ram.setU16(a4 + 0x04, 0x0202);                        // $295688 -- $4=2, $5=2
  ram.setU8(a4 + 0x08, 0x0d);                           // $29568E
  ram.setU16(a4 + 0x0a, 0x7050);                        // $295694 -- $a=$70, $b=$50
  ram.setU16(a4 + 0x14, 0x2040);                        // $29569A
  ram.setU8(a4 + 0x10, 1);                              // $2956A0
  ram.setU8(a4 + 0x11, 1);                              // $2956A6
  const at = W95.f6Tab + spread2595F2() * 4;            // $2956AC..$2956BE -> +$10
  ram.setU16(a4 + 0x0e, rom.u16(at));                   // $2956C0 move.w (a0)+,$e(a4)
  let d1 = u16(rom.u16(at + 2) + ram.u16(a6 + 0x118));  // $2956C4/$2956C6
  if (i16(d1) > 5) d1 = 5;                              // $2956CA cmpi.w/ble
  ram.setU16(a4 + 0x0c, d1);                            // $2956D6
  ram.setU16(a6 + 0x118, u16(ram.u16(a6 + 0x118) + 1)); // $2956DA addq.w #$1
  if (i16(ram.u16(a6 + 0x118)) > 5) ram.setU16(a6 + 0x118, 5);      // $2956DE
  seqStart2598D0(ram, 6);                               // $2956EE MAIN.start 6
}

export function f6Step2956F6(ram, rom, ctx, a4, a5, a6) {
  // ---- state 0 ($2956F6): THE RENDEZVOUS.
  if (ram.u8(a4 + 0x02) === 0) {                        // $2956F6
    if (seqCurrent2598C8(ram) === 7) {                  // $295700/$295706 cmpi.w #$7
      a3Stop2599EC(ram, 7);                             // $29570E D.stop 7
      a3Start259962(ram, 0x14);                         // $295716 D.start 20
      ram.setU16(a4 + 0x06, 1);                         // $29571E move.w #$1,$6(a4)
      let d1 = 0x25;                                    // $295724 moveq #$25,d1
      if (drawSigned242FDE(ram, rom) !== 0) {           // $295726/$29572C beq
        d1 = 0x1c;                                      // $295730 moveq #$1C,d1
        ram.setU16(a4 + 0x06, u16(-ram.u16(a4 + 0x06)));  // $295732 neg.w $6(a4)
      }
      if (W95_MUTATE.value !== 'f6-one-draw') {
        d1 = u8(d1 + (i8(drawByte242B3C(ram, rom)) >> 2));  // $295736/$29573C/$29573E
      }
      ram.setU8(a4 + 0x03, u8(d1));                     // $295740 -- DEAD, see above
      ram.setU8(a4 + 0x02, 2);                          // $295744 -- 0 -> 2, no 1
    }
  }
  // ---- state 2 ($29574A): the body sweep, then the E 13 ladder.
  if (ram.u8(a4 + 0x02) === 2) {                        // $29574A
    // ---- $295754: sweep the OBJECT-3 ROW `$AC(A6)` toward the player.
    // `$29576A movem.w $A2(A6),D0-D1` -- the aim is taken from the SHADOW
    // longword `$29314C` maintains, not from the body's own `$2(A6)`.  The
    // shadow trails the body, so the arms aim at where the boss WAS.
    if (ram.u8(a4 + 0x10) !== 0 && !subqByteBcc(ram, a4 + 0x04)) {   // $295754/$29575C
      ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));          // $295764
      const r = aim64FromCaller(aimTables(rom), ram, a5,
        ram.u16(a6 + 0xa2), ram.u16(a6 + 0xa4));        // $29576A/$295770 jsr $24200A
      if (!r.carry) {                                   // $295776 bcs
        // `$29577A cmpi.b #$27 / ble` and `$295784 cmpi.b #$19 / bge` clamp the
        // TARGET to [$19,$27]; the `+$20 / -$20` pair around `$242190` is what
        // makes `$AC(A6)` the SIGNED [-7,+7] row index OBJECT 3 needs (W82 §3).
        let d1 = r.dir & 0xff;
        if (i8(d1) > 0x27) d1 = 0x27;                   // $29577A/$295782
        if (i8(d1) < 0x19) d1 = 0x19;                   // $295784/$29578C
        const d0 = u16(ram.u16(a6 + 0xac) + 0x20);      // $295792/$295798 addi.w
        const slewed = slew64(d0 & 0xff, d1 & 0xff);    // $29579C jsr $242190
        ram.setU16(a6 + 0xac, u16((slewed & 0xff) - 0x20));   // $2957A2..$2957AC
      }
    }
    // ---- $2957B0: THE E 13 LADDER, and every field it writes moves.
    if (!a1Running259A4A(ram, 0x0d)                     // $2957B0/$2957B8 bcs
      && !subqByteBcc(ram, a4 + 0x0a)) {                // $2957BC subq.b/bcc
      // **`$2957C4 subi.b #$8,$B(A4)` SHORTENS THE CADENCE BEFORE RELOADING
      // IT**, so the bursts come faster every time -- eight frames faster each,
      // from $50.  That is the whole difficulty ramp of this phase and it is
      // one instruction.
      ram.setU8(a4 + 0x0b, u8(ram.u8(a4 + 0x0b) - 8));  // $2957C4
      ram.setU8(a4 + 0x0a, ram.u8(a4 + 0x0b));          // $2957CA
      const a0 = a1Start259A18(ram, 0x0d);              // $2957D0/$2957D2 E.start 13
      ram.setU8(a0 + 0x04, ram.u8(a4 + 0x08));          // $2957D8
      ram.setU8(a0 + 0x05, ram.u8(a4 + 0x11));          // $2957DE
      ram.setU16(a0 + 0x06, ram.u16(a4 + 0x0e));        // $2957E4
      ram.setU8(a4 + 0x08, u8(ram.u8(a4 + 0x08) + 4));  // $2957EA addq.b #$4
      ram.setU8(a4 + 0x11, u8(ram.u8(a4 + 0x11) + 1));  // $2957EE addq.b #$1
      ram.setU16(a4 + 0x0e, u16(ram.u16(a4 + 0x0e) + 2));   // $2957F2 addq.w #$2
      ram.setU8(a4 + 0x10, 1);                          // $2957F6
      ram.setU16(a4 + 0x06, u16(-ram.u16(a4 + 0x06)));  // $2957FC neg.w $6(a4)
      const n = u16(ram.u16(a4 + 0x0c) - 1);            // $295800 subq.w #$1
      ram.setU16(a4 + 0x0c, n);
      if (n === 0) {                                    // $295804 bne
        ram.setU16(a4 + 0x12, 0x50);                    // $295808
        ram.setU8(a4 + 0x02, 3);                        // $29580E
      }
    }
  }
  // ---- state 3 ($295814): hand the phase on, and RE-CUT THE D SET.
  if (ram.u8(a4 + 0x02) === 3) {                        // $295814
    if (a1Running259A4A(ram, 0x0d)) return;             // $29581E/$295826 bcs
    const n = u16(ram.u16(a4 + 0x12) - 1);              // $29582A subq.w #$1
    ram.setU16(a4 + 0x12, n);
    if (n !== 0) return;                                // $29582E bne
    a3Start259962(ram, 0x0f);                           // $295832 D.start 15
    a3Stop2599EC(ram, 0x14);                            // $29583A D.stop 20
    a3Start259962(ram, 7);                              // $295842 D.start 7
    a4Start25980C(ram, 2);                              // $29584A F.start 2
    ram.setU16(a4, 0);                                  // $295852 clr.w (a4)
  }
  void ctx;
}

// ===========================================================================
// E 0 -- $2958F2 / $295948.  THE HP-GATED PAIR, kind 3.
// ===========================================================================
// **`$2958F2 bchg.b #$0,$3(A5)` IS THE FIRST INSTRUCTION AND IT IS NOT IN THE
// SLOT.**  `($3,A5)` is the enemy record's TARGET INDEX -- the byte `$242716`
// reads to decide which player every later aim of this boss picks (`src/aim.js`
// `targetSelect`).  So arming E 0 SWITCHES THE BOSS'S TARGET, for the whole
// boss and not for this gun, and it is a `bchg`, so it alternates.  A port that
// read `$3(A4)` -- one register away, and the field every other script in this
// file uses for its own state -- would leave the boss aiming at one player
// forever and would corrupt a slot byte at the same time.
export function e0Init2958F2(ram, rom, a4, a5, a6) {
  const at = W95_MUTATE.value === 'e0-bchg-slot' ? a4 + 0x03 : a5 + 0x03;
  ram.setU8(at, ram.u8(at) ^ 1);                        // $2958F2 bchg.b #$0,$3(a5)
  ram.setU16(a4 + 0x02, 0x1001);                        // $2958F8 -- $2=$10, $3=1
  ram.setU16(a4 + 0x04, 0x0000);                        // $2958FE
  ram.setU16(a4 + 0x08, 0x0008);                        // $295904
  ram.setU8(a4 + 0x0a, 0x80);                           // $29590A
  // $295910 jsr $242290 -- aim256 at the selected player from `($2,A6)`.  Only
  // when it succeeds is the base angle replaced; both players dead leaves the
  // literal $80.  The RNG draw is INSIDE that arm, so a dead pair of players
  // costs one fewer step of `$803917`.
  const r = aim256AtTarget(aimTables(rom), ram, a5, a6);
  if (!r.carry) {                                       // $295916 bcs
    ram.setU8(a4 + 0x0a, u8(r.dir + drawByte242B3C(ram, rom)));      // $29591A/$295920
  }
  const w = spread2595F2() * 2;                         // $295926..$29592E -> 8
  ram.setU16(a4 + 0x0c, rom.u16(W95.e0TabA + w));       // $295930/$295936
  ram.setU16(a4 + 0x06, rom.u16(W95.e0TabB + w));       // $29593C/$295940
}

/**
 * `$295948`.  **THE HP GATE IS UNSIGNED AND IT IS THE ROUTINE'S FIRST
 * INSTRUCTION**: `cmpi.l #$48CC,$16(A5) / bcc` returns while HP is at or above
 * `$48CC`, so this gun is silent for the first two thirds of the fight and
 * `$294AD8`'s "critical" animation threshold is the SAME NUMBER.  One constant
 * decides both what the boss looks like and what it shoots.
 *
 * THREE DEAD `move.l (d16,PC),D3` LOADS, and they are transcribed as comments
 * rather than as code: `$295978` and `$295984` both load D3 and are both
 * overwritten by `$295990` before the first `jsr`.  Only `$2959C4` and
 * `$2959C8` reach a generator.  The three `addq.w`/`subq.w` on D1 between them
 * net to ZERO (`+2 -4 +2`), so the angle that reaches the first shot is
 * `$A(A4) + $8(A4)` as a BYTE and the second is `$A(A4) - $8(A4)`.
 */
export function e0Step295948(ram, rom, ctx, a4, a5, a6) {
  if ((ram.u32(a5 + 0x16) >>> 0) >= W95.hpGate) return; // $295948/$295950 bcc
  if (subqByteBcc(ram, a4 + 0x02)) return;              // $295954 subq.b/bcc
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));              // $29595C
  const base = ram.u8(a4 + 0x0a);                       // $295962/$295964
  // $295968 move.w $4(A4),D0 / swap D0 / move.w #$3,D0 -- the HIGH word of D0 is
  // the gun's own frame counter and the LOW word is the BULLET KIND, 3.
  const d0 = ((ram.u16(a4 + 0x04) << 16) | 0x0003) >>> 0;          // $29596C/$29596E
  const d6 = ram.u16(a4 + 0x08);                        // $295972 move.w $8(a4),d6
  const d2 = ram.u32(a6 + 0x02);                        // $29597E move.l $2(a6),d2
  const shoot = (d1, d3, site) => {
    const res = fireBulletFan({ ram, rom, log: new WriteLog(ram) }, 0x281764,
      { d0, d1, d2, d3, d4: 0, d5: 0, a5 });
    ctx.bulletSpawn?.(site, res);
  };
  shoot(u8(base + d6), rom.u32(W95.e0Muzzle), 0x295996);          // $295990/$295996
  shoot(u8(base - d6), rom.u32(W95.e0Muzzle + 4), 0x2959a6);      // $2959A0/$2959A6
  ram.setU16(a4 + 0x04, u16(ram.u16(a4 + 0x04) + 2));   // $2959AC addq.w #$2
  ram.setU16(a4 + 0x08, u16(d6 + ram.u16(a4 + 0x0c)));  // $2959B0/$2959B4 add.w
  const n = u16(ram.u16(a4 + 0x06) - 1);                // $2959B8 subq.w #$1
  ram.setU16(a4 + 0x06, n);
  if (n === 0) ram.setU16(a4, 0);                       // $2959BC/$2959C0 clr.w (a4)
}

// ===========================================================================
// E 1 -- $295A7E / $295AE0.  THE FOUR TURRETS, kind 12.
// ===========================================================================
// E 1 owns `$C6..$C9(A6)`, the four turret angles OBJECT 5 (`$292E3E`, W82)
// reads to pick each limb's sprite.  So this gun is also the boss's ARM
// ANIMATION, and a wrong angle here shows up in bucket 2 as a wrong sprite
// before it shows up as a wrong bullet.
//
// **`$295A9A add.w D0,$C(A4)` ADDS INTO A FIELD THE INIT NEVER CLEARS.**  A
// scheduler slot is freed by `clr.w (a4)`, which zeroes the STATUS WORD ONLY --
// `$2..$1F` keep the previous occupant's bytes (recon 48 §1.4).  So `$C(A4)` --
// the high word of the kind-12 parameter -- ACCUMULATES over the boss's life,
// by `$FFFB` (-5) per arm.  That is deliberate and it is why the port must not
// "initialise" the slot: `e1-set-param` is the reading that assigns instead of
// adding.
export function e1Init295A7E(ram, rom, a4) {
  ram.setU8(a4 + 0x05, 0);                              // $295A7E clr.b $5(a4)
  ram.setU8(a4 + 0x06, 0);                              // $295A82 clr.b $6(a4)
  const d0 = rom.u16(W95.e1Tab + spread2595F2() * 2);   // $295A86..$295A96 -> +8
  if (W95_MUTATE.value === 'e1-set-param') ram.setU16(a4 + 0x0c, d0);
  else ram.setU16(a4 + 0x0c, u16(ram.u16(a4 + 0x0c) + d0));        // $295A9A add.w
  for (let i = 0; i < 4; i++) ram.setU8(a4 + 0x08 + i, 0x20);      // $295A9E..$295AB4
  // FOUR SEPARATE `$242B3C` DRAWS, one per turret, each added as a BYTE.  They
  // are four steps of `$803917` and collapsing them to one draw reused four
  // times is `e1-one-draw`.
  for (let i = 0; i < 4; i++) {                         // $295AB6..$295ADC
    const d = W95_MUTATE.value === 'e1-one-draw' && i > 0
      ? ram.u8(a4 + 0x08) - 0x20 : drawByte242B3C(ram, rom);
    ram.setU8(a4 + 0x08 + i, u8(ram.u8(a4 + 0x08 + i) + d));
  }
}

/** `$295AE0`.  Two halves: BEFORE `$6(A4)` is set, slew the four angles to the
 *  drawn targets and check for arrival; after it, sweep them between `$10` and
 *  `$30` and fire on a cadence. */
export function e1Step295AE0(ram, rom, ctx, a4, a5, a6) {
  if (ram.u8(a4 + 0x06) === 0) {                        // $295AE0 tst.b/bne
    // ---- $295AE8: one slew step per turret, then the four-way compare.
    for (let i = 0; i < 4; i++) {                       // $295AE8..$295B2C
      const d1 = ram.u8(a4 + 0x08 + i);
      ram.setU8(a6 + 0xc6 + i, slew64(ram.u8(a6 + 0xc6 + i), d1) & 0xff);
    }
    // `$295B30..$295B5C` -- ALL FOUR must match before `$6(A4)` is set, and the
    // compare is on the SLOT's targets, not on the slewed values' neighbours.
    let all = true;
    for (let i = 0; i < 4; i++) {
      if (ram.u8(a4 + 0x08 + i) !== ram.u8(a6 + 0xc6 + i)) { all = false; break; }
    }
    if (all) ram.setU8(a4 + 0x06, 1);                   // $295B60
    return;                                             // $295B66 rts
  }
  // ---- $295B68: the SWEEP, and it is gated on `$8130D4` -- the same freeze
  // word `$2814BA` adds into the bullet cores' own gate.  Frozen, the turrets
  // neither move nor fire and the cadence does not advance.
  if (ram.u16(W95.freeze8130D4) !== 0) return;          // $295B68/$295B6E bne
  for (let i = 0; i < 4; i++) {                         // $295B72..$295C48
    const bit = 1 << i;
    const at = a6 + 0xc6 + i;
    if ((ram.u8(a4 + 0x05) & bit) === 0) {              // btst #$i,$5(a4)
      ram.setU8(at, u8(ram.u8(at) + 1));                // addq.b #$1
      // `blt` -- SIGNED, and the turn-around is at $30 going up and $10 coming
      // back, so the sweep is $20 wide and asymmetric in its tests (`blt` one
      // way, `bgt` the other).
      if (i8(ram.u8(at)) >= 0x30) ram.setU8(a4 + 0x05, ram.u8(a4 + 0x05) | bit);
    } else {
      ram.setU8(at, u8(ram.u8(at) - 1));                // subq.b #$1
      if (i8(ram.u8(at)) <= 0x10) {
        ram.setU8(a4 + 0x05, ram.u8(a4 + 0x05) & u8(~bit));        // andi.b
      }
    }
  }
  if (subqByteBcc(ram, a4 + 0x02)) return;              // $295C4A subq.b/bcc
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));              // $295C52
  // $295C58 move.w $C(A4),D0 / swap D0 / move.w #$C,D0 -- kind 12, parameter =
  // the accumulated `$C(A4)`.
  const d0 = ((ram.u16(a4 + 0x0c) << 16) | 0x000c) >>> 0;          // $295C5C/$295C5E
  const d2 = ram.u32(a6 + 0x02);                        // $295C62
  const SITES = [0x295c70, 0x295c7e, 0x295c8c, 0x295c9a];
  for (let i = 0; i < 4; i++) {
    const d3 = rom.u32(W95.e1Muzzle + i * 4);           // $295C66/$295C76/$295C84/$295C92
    const d1 = ram.u8(a6 + 0xc6 + i);                   // $295C6C/$295C7A/$295C88/$295C96
    const res = fireBulletFan({ ram, rom, log: new WriteLog(ram) }, 0x281484,
      { d0, d1, d2, d3, d4: 0, d5: 0, a5 });            // $295C70 jsr $281484
    ctx.bulletSpawn?.(SITES[i], res);
  }
  const n = u8(ram.u8(a4 + 0x04) - 1);                  // $295CA0 subq.b #$1
  ram.setU8(a4 + 0x04, n);
  if (n === 0) ram.setU16(a4, 0);                       // $295CA4/$295CA8 clr.w (a4)
}

// ===========================================================================
// E 11 -- $2965F8 / $296614.  THE FOUR-CORNER BURST, kind 19.
// ===========================================================================
// The simplest of the ten and the one that appears at the most rungs (28).
// Same `$48CC` HP gate as E 0, and the same "the index is always 4" table read.
// Four shots per volley from four fixed muzzle offsets, all at the constant
// angle `$80` -- there is no aim in this gun at all.
export function e11Init2965F8(ram, rom, a4) {
  ram.setU16(a4 + 0x02, 0x0008);                        // $2965F8 -- $2=0, $3=8
  ram.setU16(a4 + 0x04, rom.u16(W95.e11Tab + spread2595F2() * 2));  // $2965FE..$29660E
}

export function e11Step296614(ram, rom, ctx, a4, a5, a6) {
  if ((ram.u32(a5 + 0x16) >>> 0) >= W95.hpGate) return; // $296614/$29661C bcc
  if (subqByteBcc(ram, a4 + 0x02)) return;              // $296620 subq.b/bcc
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));              // $296628
  const d2 = ram.u32(a6 + 0x02);                        // $29662E
  const d0 = 0x00080013;                                // $296632 move.l #$80013,d0
  const d1 = 0x80;                                      // $296638/$29663A
  // **THE FOUR MUZZLES ARE NOT READ IN ADDRESS ORDER.**  `$296640` takes
  // `$296680`, `$29664C` takes `$296688`, `$296658` takes `$29667C` and
  // `$296664` takes `$296684` -- the pattern is [1],[3],[0],[2], and slot order
  // in the bullet pool is observable (draw order, and the bomb's cancel loop).
  const ORDER = [4, 12, 0, 8];                          // offsets from $29667C
  const SITES = [0x296646, 0x296652, 0x29665e, 0x29666a];
  for (let i = 0; i < 4; i++) {
    const off = W95_MUTATE.value === 'e11-muzzle-order' ? i * 4 : ORDER[i];
    const res = fireBulletFan({ ram, rom, log: new WriteLog(ram) }, 0x2816f6,
      { d0, d1, d2, d3: rom.u32(W95.e11Muzzle + off), d4: 0, d5: 0, a5 });
    ctx.bulletSpawn?.(SITES[i], res);
  }
  const n = u16(ram.u16(a4 + 0x04) - 1);                // $296670 subq.w #$1
  ram.setU16(a4 + 0x04, n);
  if (n === 0) ram.setU16(a4, 0);                       // $296674/$296678
}

// ============================================================= REGISTRATION
//
// EIGHT of the ten INITs fall through into their STEPs and TWO do not (E 0's
// `$295946 rts` and E 1's `$295ADE rts`).  The fall-throughs are written out
// one by one rather than driven from a flag, so a reader can check each against
// the listing without trusting a table.

const A6 = (ctx, at) => bossA6(ctx, at);
const A5 = (ctx, at) => bossA5(ctx, at);

registerScript(0x293420, (ram, rom, ctx, a4) => {       // MAIN 2 INIT
  const a6 = A6(ctx, 0x293420);
  main2Init293420(ram, rom, a4, a6);
  main2Step293432(ram, rom, ctx, a4, A5(ctx, 0x293420), a6);   // the bsr's return
});
registerScript(0x293432, (ram, rom, ctx, a4) =>
  main2Step293432(ram, rom, ctx, a4, A5(ctx, 0x293432), A6(ctx, 0x293432)));

registerScript(0x293578, (ram, rom, ctx, a4) => {       // MAIN 5 INIT
  const a6 = A6(ctx, 0x293578);
  main5Init293578(ram, a4, a6);
  main5Step29359E(ram, rom, ctx, a4, A5(ctx, 0x293578), a6);   // FALL-THROUGH
});
registerScript(0x29359e, (ram, rom, ctx, a4) =>
  main5Step29359E(ram, rom, ctx, a4, A5(ctx, 0x29359e), A6(ctx, 0x29359e)));

registerScript(0x294aba, (ram, rom, ctx, a4) => {       // D 20 INIT
  void a4;
  const a6 = A6(ctx, 0x294aba);
  d20Init294ABA(ram, a6);
  d20Step294AC0(ram, a6);                               // FALL-THROUGH
});
registerScript(0x294ac0, (ram, rom, ctx, a4) => {
  void a4; d20Step294AC0(ram, A6(ctx, 0x294ac0));
});

registerScript(0x295002, (ram, rom, ctx, a4) => {       // F 1 INIT
  f1Init295002(ram, rom, a4, A6(ctx, 0x295002));
  f1Step295120(ram, rom, ctx, a4);                      // FALL-THROUGH
});
registerScript(0x295120, (ram, rom, ctx, a4) => f1Step295120(ram, rom, ctx, a4));

registerScript(0x29554a, (ram, rom, ctx, a4) => {       // F 4 INIT
  f4Init29554A(ram, a4);
  f4Step29556C(ram, a4);                                // FALL-THROUGH
});
registerScript(0x29556c, (ram, rom, ctx, a4) => f4Step29556C(ram, a4));

registerScript(0x295616, (ram, rom, ctx, a4) => {       // F 5 INIT
  f5Init295616(ram, a4);
  f5Step295626(ram, a4);                                // FALL-THROUGH
});
registerScript(0x295626, (ram, rom, ctx, a4) => f5Step295626(ram, a4));

registerScript(0x295684, (ram, rom, ctx, a4) => {       // F 6 INIT
  const a6 = A6(ctx, 0x295684);
  f6Init295684(ram, rom, a4, a6);
  f6Step2956F6(ram, rom, ctx, a4, A5(ctx, 0x295684), a6);      // FALL-THROUGH
});
registerScript(0x2956f6, (ram, rom, ctx, a4) =>
  f6Step2956F6(ram, rom, ctx, a4, A5(ctx, 0x2956f6), A6(ctx, 0x2956f6)));

// E 0 and E 1 END IN `rts`.  Their INITs run alone on the arming frame.
registerScript(0x2958f2, (ram, rom, ctx, a4) =>
  e0Init2958F2(ram, rom, a4, A5(ctx, 0x2958f2), A6(ctx, 0x2958f2)));
registerScript(0x295948, (ram, rom, ctx, a4) =>
  e0Step295948(ram, rom, ctx, a4, A5(ctx, 0x295948), A6(ctx, 0x295948)));

registerScript(0x295a7e, (ram, rom, ctx, a4) => e1Init295A7E(ram, rom, a4));
registerScript(0x295ae0, (ram, rom, ctx, a4) =>
  e1Step295AE0(ram, rom, ctx, a4, A5(ctx, 0x295ae0), A6(ctx, 0x295ae0)));

registerScript(0x2965f8, (ram, rom, ctx, a4) => {       // E 11 INIT
  e11Init2965F8(ram, rom, a4);
  e11Step296614(ram, rom, ctx, a4, A5(ctx, 0x2965f8), A6(ctx, 0x2965f8));
});
registerScript(0x296614, (ram, rom, ctx, a4) =>
  e11Step296614(ram, rom, ctx, a4, A5(ctx, 0x296614), A6(ctx, 0x296614)));
