// THE STAGE-1 BOSS'S PER-FRAME HANDLER, ITS DAMAGE PASS, ITS TIMEOUT AND ITS
// DEATH -- `$292902`, `$294AD8`, `$294F32`, `$294DD4` and D-script 6
// (`$293DC6`/`$293E04`).  W62 (S1).
//
// ============================================================================
// WHAT THIS FILE IS AND IS NOT
// ============================================================================
// **IT IS NOT THE BOSS.**  Recon 48 measured the stage-1 boss at 111 script
// entry points, a 257-routine closure and ~31.7 KB, and priced it at three
// waves.  None of that is here and none of it is wanted here.
//
// What IS here is the four routines the STAGE END rides on, and they are four
// because of one number: **`$22(a5) = $2A30` = 10,800**, the eighth word of the
// boss's record prototype at `$2927F6` (`$2926EE lea $2927F6(pc),A0 / moveq
// #$7,D0 / jsr $26377A`, already loaded by `src/initbody.js`'s `$2926E2` body
// since W23).  `$294F3C subq.w #$1,$22(a5)` spends one of those per logic frame
// and `$294F60 jmp $294DD4(pc)` kills the boss when it runs out.
//
// > **STAGE 1 ENDS EVEN IF THE BOSS IS NEVER SHOT.**  That is the finding
// > recon 49 5.1 made and this file is what turns it into frames.
//
// ============================================================================
// THE CHAIN, AND EVERY LINK IS AN INSTRUCTION IN THIS FILE
// ============================================================================
//   $294F3C   $22(a5) hits 0 with a live player      -> $294DD4
//   $294E34   moveq #$6,D0 / jmp $259962             -> A3 SCRIPT 6 STARTS
//   $293DC6   D-script 6's init, then $293E04's seven states
//   $293E16   jsr $2595E8                            -> $812E06 := 1
//   $25962E   tst.w $812E06 / ori.w #$1,sr           -> C = 1
//   $29291E   bcc NOT taken                          -> $292922 jsr $242952
//   $242952   -> src/stageend.js, the stage advance
//   $292928   jmp $263762                            -> the boss record is freed
//
// ============================================================================
// THE RECON SAID 32 FRAMES.  IT IS 128, AND THE WHOLE ANIMATION IS ~482
// ============================================================================
// Recon 49 3.1 read `$293DC6`'s `move.w #$20,$A(a4)` and `$293E0E subq.w
// #$1,$A(a4)` and wrote "32 frames after `$294DD4`".  Read in order, the init
// leaves `$2(a4) = 0` -- **NOT 6** -- so `$293E04`'s state-6 arm is not taken on
// the frame it is armed.  `$A(a4)` is REWRITTEN twice before state 6 is ever
// reached (`$2940FA` -> `$80`, `$293EF2` -> `$80`), so the wait at `$293E0E`
// is 128 frames, not 32, and it is the LAST of seven states.  [M] the sum of
// the seven, measured by this port, is in `docs/worklog/ddpdoj/62`.
//
// ============================================================================
// WHAT IS COUNTED RATHER THAN RUN, AND WHY EACH ONE
// ============================================================================
// D-script 6 is a DEATH ANIMATION: its state machine is arithmetic on the
// slot's own bytes, and everything it calls is an explosion, a spark, a sound
// or a palette.  This wave ports the ARITHMETIC -- which is what decides when
// `$2595E8` fires, i.e. when the stage ends -- and counts the emitters by ROM
// address, the same way `src/type5.js` counts the thirteen subsystem calls it
// does not make.  The list is in `BOSS_NOTED` and every entry says which
// instruction it stands at.
//
// **NOTHING HERE IS CLAMPED OR STUBBED TO STOP A THROW.**  The one thing this
// file could not reach without inventing something is the boss's own attack
// scripts, and it does not try: `src/initbody.js`'s `$2926E2` body still counts
// `$2598E6` and `$25980C` (the two activations) as notes, so A2 slot 6 and A4
// script 0 stay dormant.  W62 changes ONE of that body's five notes into a real
// call -- `$259554`, the table INSTALL -- because without `$812A70` the A3 walk
// is skipped and D-script 6 could never step.  Installing a table runs nothing;
// it is the activations that do, and those are still counted.

import { u16, u32, i16 } from './ram.js';
import { unreached } from './unported.js';
import { freeEnemy } from './initbody.js';
import { scoreHit, scoreKill } from './score.js';
import { spawnItem } from './items.js';
import {
  SCHED, runScheduler25962E, registerScript, a3Start259962, a3Stop2599EC,
  a4Start25980C, a4Running25983E, a4Clear2598A2, a1Clear259B34, seqStart2598D0,
  a2Stop25994A, fadeArm259B7E, fadeDone259B9E, suspend2595E8,
} from './scheduler.js';
import { runStageAdvance242952 } from './stageend.js';
// W372: $243DD0 is a THIRD entry of this, not a routine of its own -- same guard, same
// $81B410/$81B412 pair, differing only in the mode it arms.
import { armScreenClearMode } from './midboss.js';
// W403: HIBACHI's SECOND FORM. This is a CYCLE -- hibachi2.js imports livePlayers2428A6,
// clamp253564 and bossClear242922 back out of this file -- and it is the same shape as the
// `import './hibachiend.js'` below. Nothing on either side runs at module-evaluation time.
import { hibachiSecondForm2A6F12, bossExitShared } from './hibachi2.js';
import { enqueueRegisters } from './spritequeue.js';
import { spawnEffect, B } from './effects.js';
// W433 (D64): the STAGE-1 boss death's own `$293EEC jsr $2440E0`.  The routine
// has been ported since W189 and lives next to the stage-2 death that first
// needed it; boss3.js and hibachiend.js already reach across for it the same
// way.  The edge boss.js -> boss2.js closes a cycle that boss2.js's own
// `import ... from './boss.js'` opens, and that is safe here for the reason
// ESM makes it safe: `finalBlast2440E0` is an exported FUNCTION DECLARATION,
// hoisted and initialised before either module body runs, and it is only ever
// read at call time.  The same cycle already exists through `./hibachiend.js`.
import { finalBlast2440E0 } from './boss2.js';
import { drawByte242B3C, drawWord242EC2 } from './rng.js';

/** The boss's record and sub-record fields, by the offset the ROM uses. */
export const BOSS = {
  hp0: 0x16, hp1: 0x1a, hp2: 0x1e,      // $294B3A / $294BFC / $294CE0 sub.l
  timeout: 0x22,                        // $294F3C subq.w -- $2A30 from $2927F6
  hitStop: 0x24,                        // $292908 / $294C6E move.w #$6E
  subRec: 0x06,                         // $294C64 movea.l $6(a5),A6
  // the sub-record
  st0: 0x00, st1: 0x20, st2: 0x60,      // the three part status words
  snap0: 0x18, snap1: 0x38, snap2: 0x78,
  anim0: 0x1d, anim1: 0x3d, anim2: 0x7d, anim3: 0xbd,
  dead1: 0x3f, dead2: 0x7f,             // $294E4E / $294EA4 move.b #$1
  dying: 0xe6,                          // $294F2A move.w #$1 / $294F24 clr.w
  noDamage: 0xe8,                       // $294EEA / $294EF2
  hitMask: 0xea,                        // $294AF0 move.w D1,$EA(A6)
  itemGate2: 0x114,                     // $294C74 tst.w $114(A6)
  // globals
  pauseFlag: 0x8130ca,                  // $294B64 tst.w -- gates the "hurt" anim
  deathPause: 0x8130d2,                 // $294F32 tst.w
  bossFlags: 0x8130f8,                  // $294DD4 bset #6 / #7
  bombFlash: 0x81b61a,                  // $294B9A move.l #$30000
};

/** Every emitter this file COUNTS instead of running, with the instruction it
 *  stands at.  Exported so a test can assert the list rather than a number.
 *
 *  W107 CORRECTION: the `$289004` allocator, the `$2938AE`/`$2938F2` table
 *  bursts and the `$28B4BE` big burst are NO LONGER NOTES -- they are real
 *  `spawnEffect` calls now (D-script 6's death explosion, ported this wave off
 *  `src/effects.js` which W54 shipped).
 *
 *  **W425 (D58) TOOK FOUR MORE OUT, AND THREE OF THEM WERE ALREADY DEAD.**
 *  `$294134` is ported this wave (`d6TimerDSound`) -- that is the real removal.
 *  The other three, `$28C392`, `$28C2C2` and `$28C2A8`, were listed here as
 *  deferred SOUND and have been real `ctx.soundPost` calls since Wave A: NOT ONE
 *  `note()` in this file has passed those addresses for hundreds of waves, so
 *  the table documented three gaps that did not exist. They never reached a
 *  census -- nothing called them -- so this was a lie in the DOCUMENTATION and
 *  not in the count, which is precisely why it survived so long. Same shape as
 *  W418's fifth lie and W422's `bee.js` bound: a true statement resting on a
 *  false explanation, or in this case a false statement nothing ever read.
 *
 *  **W433 (D64) TOOK A FIFTH OUT, AND THAT ONE WAS A REAL GAP.** `$2440E0` is
 *  gone from this table because `$293EEC` now CALLS it. It was not a
 *  documentation lie like W425's three -- the `note()` fired, on the real
 *  route, at lf9902 of `out/w69/stage1-laser-hold`, and the 42 frames of screen
 *  shake behind it were missing from the port for 381 waves. The label was
 *  wrong too: `$2440E0` opens with `jsr $288E0C`, the POOL-B (effect) whole-pool
 *  clear, not "impact pool A".
 *
 *  W444 (D66) DROPPED `$2599EC` FROM THIS TABLE, and it was W425's defect
 *  exactly: `part1Death294E3E` and `part2Death294E94` have RUN the stops since
 *  W62 -- `for (const id of [...]) a3Stop2599EC(ram, id)`, the five ids the
 *  cartridge passes -- and then counted `$2599EC` as deferred on the very next
 *  line. `[M]` $294E60..$294E87 and $294EB6..$294EDD are five `moveq #id /
 *  jsr $2599EC` pairs and nothing else (ids 0,2,8,$A,$C and 1,3,9,$B,$D), so
 *  the port was already whole and the `note()` was pure census noise: the
 *  census reported a gap that had been closed for 382 waves.
 *
 *  What is left is genuinely deferred: the hit-stop driver `$243DD0` and the
 *  `$8039xx` pause block `$23C4D0`. `$246410` stays too, but read its entry:
 *  THE LOADER IS PORTED (`animobjects.js loadAnimObjects246410`, 19 call sites) --
 *  what is deferred at those three sites is the TABLE each one passes, not the
 *  routine. Every key here has a live `note()` call above, and
 *  `w444deferrals.test.js` fails if one stops having one. */
export const BOSS_NOTED = Object.freeze({
  0x243dd0: '$292912/$294C68/$294D4C jsr $243DD0 -- the hit-stop / screen-shake '
    + 'driver (170 instructions, no reader in the stage-end chain)',
  0x246410: '$293F18 / $29407C / $28D770 jsr $246410 -- the loader ITSELF is '
    + 'ported (animobjects.js loadAnimObjects246410, 19 call sites); what these '
    + 'three sites still defer is the animation TABLE each one passes',
  0x23c4d0: '$294DE4 jsr $23C4D0 -- the $8039xx pause/flag block',
  // W382 dropped $253564 and $242922 from this table: both were ALREADY ported
  // (clamp253564 / bossClear242922, both live from $2A6DD2/$2A6DBC since W372)
  // and the three boss deaths were the only sites still deferring them.  The
  // three `jsr`s at $294DEA/$294DF0, $298978/$29897E and $29CAAC/$29CAB2 are
  // unconditional -- back-to-back `4EB9` with nothing between them.
  // W444 dropped $2599EC the same way: `a3Stop2599EC` was already being
  // called at both sites that counted it.  See the header block.
});

const note = (ctx, a) => ctx.unportedLog?.note(a, BOSS_NOTED[a] ?? 'W62 boss');

// ---------------------------------------------------------------- $2428A6
/** `$2428A6` -- IS ANY PLAYER ALIVE?  `$10` for P1 and `+$8` for P2, and the
 *  test is "record word NEGATIVE and bit 0 CLEAR" for each.  Non-zero iff at
 *  least one is playable, which is what `$294F44` branches on.
 *
 *  **W447 MERGED THE SECOND TRANSCRIPTION OF THIS ROUTINE INTO IT, AND THE
 *  SECOND ONE READ THE WRONG BYTE.**  W403 wrote `$2428A6` down again, lower in
 *  this same file, as `bossDecide2428A6`, for Hibachi's second form.  Both
 *  readings of the routine were true -- `$294F44` asks "is anybody alive" and
 *  `$2A6CFC`/`$2A6EEE` ask "may the boss die" -- but the cartridge has ONE
 *  routine, and the copies had drifted apart on the ONE line that matters:
 *
 *      $2428B0  0839 0000 0081 03e6   btst #$0,$8103E6
 *
 *  `btst` with a MEMORY operand is BYTE-sized, so the bit is bit 0 of the byte
 *  AT `$8103E6` -- the record word's HIGH half, i.e. bit 8 of the word.  This
 *  copy has always read `ram.u8(0x8103e6)`.  `bossDecide2428A6` read
 *  `ram.u8(0x8103e6 + 1)`, the LOW half, which is a different bit of a different
 *  byte.  Nothing compared them, so for 44 waves the two answered differently
 *  for any record holding `$81xx`.
 *
 *  **WHAT THAT COST.** `hyper.js requestHyper249868` does `bset` bit 0 of
 *  `($1,A6)` on the player record when Button 2 is pressed with hyper stock, so
 *  a player in hyper has `$8103E7` bit 0 SET while the record is still NEGATIVE.
 *  Under the wrong byte that player stopped counting, `$2A6CFC`/`$2A6EEE`/
 *  `$2A7090` read zero, and the arm they take on zero is `move.l #$200,($16,A5)`
 *  -- **Hibachi's second form REFILLS its HP pool instead of dying.**  The bug
 *  was invisible to the 644 board dumps (P1's word is `$8000`/`$8020`/`$9000`/
 *  `$A004`/`$8810` there, and those five agree under either byte), which is why
 *  only the image settles it.
 *
 *  It returns a MASK, not a boolean, and the two halves are not symmetric:
 *  `$2428BA moveq #$10,D0` SETS while `$2428CE addq.w #8` ADDS, so both players
 *  live gives `$18`.  Its callers branch on zero, and zero means NEITHER player
 *  is in that state -- reading it as "is the boss dead" inverts the fight, since
 *  a NON-zero return is what lets the boss die. */
export function livePlayers2428A6(ram) {
  let d0 = 0;                                          // $2428A6 moveq #$0
  const p1 = ram.u16(0x8103e6);
  if (i16(p1) < 0 && (ram.u8(0x8103e6) & 1) === 0) d0 = 0x10;   // $2428AE/$2428B0
  const p2 = ram.u16(0x810448);
  if (i16(p2) < 0 && (ram.u8(0x810448) & 1) === 0) d0 += 8;     // $2428C2/$2428C4
  return d0;
}

// ---------------------------------------------------- $294E3E / $294E94
/** `$294E3E` -- PART 1 IS DEAD.  Idempotent by its own first instruction. */
function part1Death294E3E(ram, a5, a6, ctx) {
  if (ram.u8(a6 + BOSS.dead1) !== 0) return;           // $294E3E tst.b/bne
  ram.setU32(a5 + BOSS.hp1, 0xffffffff);               // $294E46
  ram.setU8(a6 + BOSS.dead1, 1);                       // $294E4E
  ram.setU16(a6 + 0x20, 0x8000);                       // $294E54
  ram.setU8(a6 + 0x3d, 0x15);                          // $294E5A
  for (const id of [0, 2, 8, 0xa, 0xc]) a3Stop2599EC(ram, id);  // $294E60..$294E86
  a3Start259962(ram, 4);                               // $294E88 moveq #$4 / jmp $259962
}

/** `$294E94` -- PART 2 IS DEAD.  The same shape with the other offsets. */
function part2Death294E94(ram, a5, a6, ctx) {
  if (ram.u8(a6 + BOSS.dead2) !== 0) return;           // $294E94 tst.b/bne
  ram.setU32(a5 + BOSS.hp2, 0xffffffff);               // $294E9C
  ram.setU8(a6 + BOSS.dead2, 1);                       // $294EA4
  ram.setU16(a6 + 0x60, 0x8000);                       // $294EAA
  ram.setU8(a6 + 0x7d, 0x15);                          // $294EB0
  for (const id of [1, 3, 9, 0xb, 0xd]) a3Stop2599EC(ram, id);  // $294EB6..$294EDC
  a3Start259962(ram, 5);                               // $294EDE moveq #$5 / jmp $259962
}

// -------------------------------------------------------------- $294DD4
/**
 * `$294DD4` -- THE BOSS DIES.  Reached two ways and only two: `$294BA4 bra` (HP
 * 0 with a live player) and `$294F60 jmp` (THE TIMEOUT).
 *
 * `$294DDC bset #$7,$8130F8` is the bit recon 49 4 measured has six setters,
 * one per boss, and NO `btst` or `bclr` of bit 7 anywhere in build B -- the
 * only readers that can see it are the three `tst.b $8130F8` sites, where it is
 * the SIGN bit.  Transcribed as the instruction it is.
 */
export function bossDeath294DD4(ram, rom, ctx, a5, a6) {
  ram.setU8(BOSS.bossFlags, ram.u8(BOSS.bossFlags) | 0x40);   // $294DD4 bset #6
  ram.setU8(BOSS.bossFlags, ram.u8(BOSS.bossFlags) | 0x80);   // $294DDC bset #7
  note(ctx, 0x23c4d0);                                 // $294DE4
  clamp253564(ram);                                    // $294DEA jsr $253564 (UNCONDITIONAL)
  bossClear242922(ram, ctx);                           // $294DF0 jsr $242922 (UNCONDITIONAL)
  ram.setU16(a6 + BOSS.dying, 1);                      // $294DF6 bsr $294F2A
  part1Death294E3E(ram, a5, a6, ctx);                  // $294DFA
  part2Death294E94(ram, a5, a6, ctx);                  // $294DFE
  a1Clear259B34(ram);                                  // $294E02
  a4Clear2598A2(ram);                                  // $294E08
  ram.setU32(a5 + BOSS.hp0, 0xffffffff);               // $294E0E
  ram.setU8(a6 + 0x1f, 1);                             // $294E16
  ram.setU16(a6 + BOSS.st0, 0x8000);                   // $294E1C
  ram.setU8(a6 + BOSS.anim0, 0x13);                    // $294E20
  ram.setU8(a6 + BOSS.anim3, 0x16);                    // $294E26
  seqStart2598D0(ram, 1);                              // $294E2C moveq #$1
  a3Start259962(ram, 6);                               // $294E34 moveq #$6 -- **THE ARM**
  void rom;
}

// -------------------------------------------------------------- $294F32
/**
 * `$294F32` -- THE 10,800-FRAME TIMEOUT.  THIRTEEN INSTRUCTIONS, and it is the
 * whole reason stage 1 can end without a boss port.
 *
 * `$294F50 move.w #$78,$22(a5)` is a BEHAVIOUR and not an edge case: with no
 * live player the counter is RE-FLOORED to 120 every time it reaches zero, so
 * the boss cannot time out over a dead player and the stage waits.  Recon 49
 * 7.6 asked for it explicitly; it is transcribed and it is unexercised in
 * every run this wave measured (a player is alive throughout).
 */
export function bossTimeout294F32(ram, rom, ctx, a5, a6) {
  if (ram.u16(BOSS.deathPause) !== 0) return;          // $294F32 tst.w/bne
  const t = u16(ram.u16(a5 + BOSS.timeout) - 1);       // $294F3C subq.w #$1
  ram.setU16(a5 + BOSS.timeout, t);
  if (t !== 0) return;                                 // $294F40 bne
  if (livePlayers2428A6(ram) === 0) {                  // $294F44/$294F4A
    ram.setU16(a5 + BOSS.timeout, 0x78);               // $294F50 -- the RE-FLOOR
    return;
  }
  ram.setU16(a6 + BOSS.hitMask, 0);                    // $294F5A
  ctx.bossEvent?.('timeout', ram.u16(0x8130ce));
  bossDeath294DD4(ram, rom, ctx, a5, a6);              // $294F60 jmp $294DD4(pc)
}

// -------------------------------------------------------------- $294AD8
/**
 * `$294AD8..$294DCC` -- THE DAMAGE AND PART-DESTRUCTION PASS, and it FALLS
 * THROUGH into `$294F32` (`$294DCC jmp $294F32(pc)`).  That fall-through is why
 * the timeout can only be reached by running this whole routine: there is no
 * other caller of `$294F32` in build B.
 *
 * Three near-identical blocks, one per part, and the differences between them
 * are transcribed rather than folded into a loop because they are not
 * symmetric: part 0's damage arm eors TWO animation bytes (`$1D` and `$BD`),
 * parts 1 and 2 eor one; part 0's death goes straight to `$294DD4` while parts
 * 1 and 2 drop an ITEM and set a `$6E`-frame hit-stop; and part 1's death is
 * gated on part 2's `$7F(a6)` byte and vice versa.
 */
export function bossDamage294AD8(ram, rom, ctx, a5, a6) {
  if (ram.u16(a6 + BOSS.dying) !== 0) return;          // $294AD8 tst.w/beq
  // ---- PART 0
  let d1 = 0x5c & ram.u8(a6 + BOSS.st0);               // $294AE2/$294AE4
  if (d1 !== 0) {                                      // $294AE6 beq
    ram.setU8(a6 + BOSS.st0, ram.u8(a6 + BOSS.st0) & 0xa3);   // $294AEA/$294AEE
    ram.setU16(a6 + BOSS.hitMask, d1);                 // $294AF0
    scoreHit(ram, ctx, a6, d1);                        // $294AF4 jsr $286096
    if (ram.u8(a6 + BOSS.anim0) === 0x19) {            // $294AFA/$294AFE
      ram.setU8(a6 + BOSS.anim0, 0x13);                // $294B06
      ram.setU8(a6 + BOSS.anim3, 0x16);                // $294B0C
    }
    ram.setU8(a6 + BOSS.anim0, ram.u8(a6 + BOSS.anim0) ^ 0x0c);   // $294B16
    ram.setU8(a6 + BOSS.anim3, ram.u8(a6 + BOSS.anim3) ^ 0x09);   // $294B22
    // $294B2A..$294B3A -- D2 = $7FFF - ($18,A6); the enemy's own damage
    // accumulator is the difference, and `tst.w $E8(a6)` is the invulnerable
    // gate that skips the subtraction while leaving the snapshot reset.
    const d2 = (0x7fff - ram.u16(a6 + BOSS.snap0)) | 0;
    if (ram.u16(a6 + BOSS.noDamage) === 0) {           // $294B34 tst.w/bne
      ram.setU32(a5 + BOSS.hp0, (ram.u32(a5 + BOSS.hp0) - d2) >>> 0);   // $294B3A
    }
    ram.setU16(a6 + BOSS.snap0, 0x7fff);               // $294B3E/$294B42
  } else {                                             // $294B4A
    ram.setU8(a6 + BOSS.anim0, 0x13);
    ram.setU8(a6 + BOSS.anim3, 0x16);
    // $294B56 `move.l #$48CC,D2 / cmp.l $16(a5),D2 / bcs` -- UNSIGNED: the
    // "critical" animation only arms once HP has fallen below $48CC.
    if ((ram.u32(a5 + BOSS.hp0) >>> 0) <= 0x48cc       // $294B5C cmp.l / $294B60 bcs
      && ram.u16(BOSS.pauseFlag) === 0) {              // $294B64 tst.w/bne
      ram.setU8(a6 + BOSS.anim0, 0x19);                // $294B6E
      ram.setU8(a6 + BOSS.anim3, 0x19);                // $294B74
    }
  }
  if ((ram.u32(a5 + BOSS.hp0) | 0) < 0) {              // $294B7A tst.l/bpl
    if (livePlayers2428A6(ram) === 0) {                // $294B82/$294B88
      ram.setU32(a5 + BOSS.hp0, 0x200);                // $294B8E -- HP RESTORED
    } else {
      ram.setU32(BOSS.bombFlash, 0x30000);             // $294B9A
      ctx.bossEvent?.('hp0', ram.u16(0x8130ce));
      bossDeath294DD4(ram, rom, ctx, a5, a6);          // $294BA4 bra $294DD4
      return;
    }
  }
  // ---- PART 1 ($294BA8..$294C88)
  if (ram.u16(a6 + BOSS.st1) !== 0x8000) {             // $294BA8 cmpi.w/beq
    d1 = 0x5c & ram.u8(a6 + BOSS.st1);                 // $294BB2/$294BB4
    if (d1 !== 0) {
      ram.setU8(a6 + BOSS.st1, ram.u8(a6 + BOSS.st1) & 0xa3);   // $294BBC/$294BC0
      ram.setU16(a6 + BOSS.hitMask, d1);               // $294BC4
      scoreHit(ram, ctx, a6, d1, a6 + BOSS.st1);        // $294BC8 -- A6 IS STILL
                                                       //   THE BASE, not +$20
      if (ram.u8(a6 + BOSS.anim1) === 0x19) ram.setU8(a6 + BOSS.anim1, 0x15);
      ram.setU8(a6 + BOSS.anim1, ram.u8(a6 + BOSS.anim1) ^ 0x0a);   // $294BE4
      const d2 = (0x7fff - ram.u16(a6 + BOSS.snap1)) | 0;          // $294BEC
      if (ram.u16(a6 + BOSS.noDamage) === 0) {
        ram.setU32(a5 + BOSS.hp1, (ram.u32(a5 + BOSS.hp1) - d2) >>> 0);   // $294BFC
      }
      ram.setU16(a6 + BOSS.snap1, 0x7fff);             // $294C00/$294C04
    } else {                                           // $294C0C
      ram.setU8(a6 + BOSS.anim1, 0x15);
      if ((ram.u32(a5 + BOSS.hp1) >>> 0) <= 0x3000     // $294C12/$294C18 cmp.l/bcs
        && ram.u16(BOSS.pauseFlag) === 0) {            // $294C20
        ram.setU8(a6 + BOSS.anim1, 0x19);              // $294C2A
      }
    }
    // $294C30..$294C88, and THE BRANCH SENSES ARE THE TRAP.  `tst.b $7F(A6) /
    // bne $294C88` means "part 2 is ALREADY dead -> kill this one too"; and
    // `tst.l $1A(a5) / bpl $294C8C` means "HP still POSITIVE -> nothing to do".
    // Only the fall-through -- part 2 alive AND this part's HP negative -- runs
    // the drop, and it then FALLS INTO `$294C88 bsr $294E3E`.
    if (ram.u8(a6 + BOSS.dead2) !== 0) {               // $294C34 bne $294C88
      part1Death294E3E(ram, a5, a6, ctx);
    } else if ((ram.u32(a5 + BOSS.hp1) | 0) < 0) {     // $294C3C bpl $294C8C
      partDeathDrop(ram, rom, ctx, a5, a6, BOSS.st1, BOSS.st2);   // $294C40
      part1Death294E3E(ram, a5, a6, ctx);              // $294C88 -- FALL-THROUGH
    }
  }
  // ---- PART 2 ($294C8C..$294D6C), the mirror
  if (ram.u16(a6 + BOSS.st2) !== 0x8000) {             // $294C8C cmpi.w/beq
    d1 = 0x5c & ram.u8(a6 + BOSS.st2);                 // $294C96/$294C98
    if (d1 !== 0) {
      ram.setU8(a6 + BOSS.st2, ram.u8(a6 + BOSS.st2) & 0xa3);
      ram.setU16(a6 + BOSS.hitMask, d1);
      scoreHit(ram, ctx, a6, d1, a6 + BOSS.st2);        // $294CAC
      if (ram.u8(a6 + BOSS.anim2) === 0x19) ram.setU8(a6 + BOSS.anim2, 0x15);
      ram.setU8(a6 + BOSS.anim2, ram.u8(a6 + BOSS.anim2) ^ 0x0a);
      const d2 = (0x7fff - ram.u16(a6 + BOSS.snap2)) | 0;
      if (ram.u16(a6 + BOSS.noDamage) === 0) {
        ram.setU32(a5 + BOSS.hp2, (ram.u32(a5 + BOSS.hp2) - d2) >>> 0);   // $294CE0
      }
      ram.setU16(a6 + BOSS.snap2, 0x7fff);
    } else {
      ram.setU8(a6 + BOSS.anim2, 0x15);                // $294CF0
      if ((ram.u32(a5 + BOSS.hp2) >>> 0) <= 0x3000
        && ram.u16(BOSS.pauseFlag) === 0) {
        ram.setU8(a6 + BOSS.anim2, 0x19);              // $294D0E
      }
    }
    if (ram.u8(a6 + BOSS.dead1) !== 0) {               // $294D18 bne $294D6C
      part2Death294E94(ram, a5, a6, ctx);
    } else if ((ram.u32(a5 + BOSS.hp2) | 0) < 0) {     // $294D20 bpl $294D70
      partDeathDrop(ram, rom, ctx, a5, a6, BOSS.st2, BOSS.st1);   // $294D24
      part2Death294E94(ram, a5, a6, ctx);              // $294D6C -- FALL-THROUGH
    }
  }
  // ---- $294D70: BOTH parts dead -> A4 script 5, once.
  if (ram.u8(a6 + BOSS.dead1) + ram.u8(a6 + BOSS.dead2) === 2) {   // $294D70..$294D78
    if (!a4Running25983E(ram, 5)) a4Start25980C(ram, 5);           // $294D82/$294D8E
  }
  if (ram.u8(a6 + BOSS.dead1) !== 0                    // $294D94 tst.b/beq
    && !a4Running25983E(ram, 4)) a4Start25980C(ram, 4);            // $294D9E/$294DAA
  if (ram.u8(a6 + BOSS.dead2) !== 0                    // $294DB0
    && !a4Running25983E(ram, 4)) a4Start25980C(ram, 4);            // $294DBA/$294DC6
  bossTimeout294F32(ram, rom, ctx, a5, a6);            // $294DCC jmp $294F32(pc)
}

/** `$294C40..$294C86` and its mirror `$294D24..$294D6A` -- a part's HP has gone
 *  negative: score `$1000`, drop a HYPER ITEM, hit-stop `$6E`, and if the
 *  OTHER part's `$114(A6)` gate is set, drop a second one from that part. */
function partDeathDrop(ram, rom, ctx, a5, a6, mine, other) {
  let d1 = ram.u16(a6 + BOSS.hitMask);                   // $294C40
  const ownership = scoreKill(ram, rom, ctx, 0x1000, d1); // $294C44/$294C4A
  d1 = ownership.mask;
  // $294C50 `moveq #$C,D0 / btst #4,D1 / bne / moveq #$14,D0` -- the item kind
  // is P1's hyper ($C) when the killing hit was P1's, P2's ($14) otherwise.
  //
  // **W283 CORRECTION.** This comment used to say both kinds are REFUSED at the
  // allocator, so `spawnItem` returned null and counted the refusal.  That was
  // true when W61 wrote it and stopped being true at W163, which emptied
  // `REFUSED_KINDS` when the hyper machine landed.  **THIS SITE NOW REALLY DROPS
  // A HYPER ITEM**, and it matters more than a stale sentence usually would,
  // because it is the answer to docket D16:
  //
  //   * stage 1's spawn script has TWO type-$85 records out of 339, and
  //     `deathSeq85` drops kind $0 or $8 -- never $C.  So stage 1's popcorn
  //     cannot put a single unit of hyper on the bar.
  //   * `$294C40` -- HERE -- is where hyper stock comes from.  The bar is empty
  //     until a boss part dies, and that is CORRECT rather than a missing draw.
  //
  // `w283itemsources.test.js` pins both halves.
  const d0 = (d1 & 0x10) !== 0 ? 0x0c : 0x14;          // $294C50..$294C58
  if (!ownership.privateOnly) {
    spawnItem(ram, rom, ctx, d0, a6 + mine, 0x294c5e); // $294C5A lea $20(A6),A6
  }
  note(ctx, 0x243dd0);                                 // $294C68
  ram.setU16(a5 + BOSS.hitStop, 0x6e);                 // $294C6E
  if (!ownership.privateOnly && ram.u16(a6 + BOSS.itemGate2) !== 0) {
    // $294C74 tst.w $114(A6)
    spawnItem(ram, rom, ctx, d0, a6 + other, 0x294c7e);   // $294C7A/$294C7E
  }
}

// ============================================================ D-SCRIPT 6
//
// `$293DC6` (init) and `$293E04` (step), A3 table `$29370A` entry 6.  Seven
// states in `$2(a4)`, walked HIGH to LOW in one pass exactly like object type
// 6's, so a state that advances is not re-entered in the same frame.

const D6 = {   // the slot's own fields, all relative to A4
  state: 0x02, flags: 0x03, tA: 0x04, tAr: 0x05, tB: 0x06, tBr: 0x07,
  wait: 0x0a, tC: 0x0c, tCr: 0x0d, cursorE: 0x0e, toggle: 0x10,
  tD: 0x12, tDr: 0x13, cursor14: 0x14,
};

/**
 * `$294134` -- THE TIMER-D SOUND TABLE. **THE BOSS EXPLOSION'S OWN RATTLE, AND IT
 * IS NOT THE CUE DOCKET D58 WAS OPENED ON.**
 *
 * The owner reported "boss explosion doesn't have a sound on level one". D58 was
 * diagnosed as `$28C170`, and that WAS silent and is ported this wave -- but
 * `$28C170` is the boss-CLEAR cue, one shot at `$242922`. The repeated bangs that
 * run for the whole death animation come from HERE, and this was a counted note
 * for the same 400-odd waves, from `BOSS_NOTED[0x294134]`.
 *
 *     293F5A  41FA 01D8       lea ($1D8,PC),A0     -> $293F5C + $1D8 = $294134
 *     293F60  D0EC 0014       adda.w ($14,A4),A0   the cursor, stepping by 4
 *     293F64  2050            movea.l (A0),A0      the entry IS an address
 *     293F66  4E90            jsr (A0)             ...and it is CALLED
 *     293F68  586C 0014       addq.w #4,($14,A4)
 *     293F6C  026C 001F 0014  andi.w #$1F,($14,A4) -> $20 bytes = EIGHT entries
 *
 * `$29400A` is byte-identical (`lea ($128,PC)` off `$29400C`, the same table), so
 * states 2 and 3 share one cursor and one walk. The eight longwords are all
 * ORDINARY `WRAPPERS` rows, which is why this needs no new packer and nothing is
 * invented:
 *
 *     $28C25A $28C274 $28C25A $28C274 $28C2A8 $28C25A $28C2C2 $28C2A8
 *        id 0    id 1    id 0    id 1    id 3    id 0    id 4    id 3
 *
 * READ THE TABLE, DO NOT INLINE IT. The cursor is 68k state that survives the
 * frame and the wrap is `andi.w #$1F`, so a JS array of eight constants would be
 * a second copy of a cartridge table with no check that it still matches. The
 * ROM window `$294134`/$20 is declared in `tools/export-tables.py` (W425).
 */
const D6_TIMER_D_TABLE = 0x294134;
const D6_TIMER_D_MASK = 0x1f;                          // $293F6C / $294012 andi.w #$1F

/** One timer-D tick: post the cue the cursor points at, THEN advance it. The
 *  order is the ROM's -- `jsr (A0)` at `$293F66` precedes `addq.w #4` at
 *  `$293F68` -- and reversing it would play the whole rattle one bang out of
 *  step, starting on entry 1 and never playing entry 0 on the first lap. */
function d6TimerDSound(ram, rom, ctx, a4) {
  const cursor = ram.u16(a4 + D6.cursor14) & D6_TIMER_D_MASK;
  ctx.soundPost?.(rom.u32(D6_TIMER_D_TABLE + cursor));  // $293F64 movea.l / $293F66 jsr (A0)
  ram.setU16(a4 + D6.cursor14, u16(cursor + 4) & D6_TIMER_D_MASK);   // $293F68 / $293F6C
}

/** `$293DC6` -- D-script 6's INIT.  **`$2(a4) := 0`**, which is what makes the
 *  step's state-6 arm unreachable on the arming frame (see the header). */
function d6Init293DC6(ram, rom, ctx, a4) {
  ram.setU8(a4 + D6.state, 0);                         // $293DC6
  ram.setU8(a4 + D6.flags, 0);                         // $293DCC
  ram.setU16(a4 + D6.tA, 0x0008);                      // $293DD2
  ram.setU16(a4 + D6.tB, 0x1209);                      // $293DD8
  ram.setU16(a4 + D6.wait, 0x0020);                    // $293DDE
  ram.setU16(a4 + D6.tC, 0x000c);                      // $293DE4
  ram.setU16(a4 + D6.cursorE, 0);                      // $293DEA
  ram.setU16(a4 + D6.toggle, 0);                       // $293DF0
  ram.setU16(a4 + D6.tD, 0x1010);                      // $293DF6
  ram.setU16(a4 + D6.cursor14, 0);                     // $293DFC
  void rom; void ctx;
}

/** A byte `subq.b` with the 68000's BCC: "no borrow" is `>= 0` AFTER the
 *  decrement, i.e. the old value was non-zero. */
function decByteBcc(ram, a) {
  const v = ram.u8(a);
  ram.setU8(a, (v - 1) & 0xff);
  return v !== 0;             // true == bcc taken == "not yet"
}

// ============================================================ W107: THE EMITTERS
//
// D-script 6's death animation COUNTED its explosions as notes since W62
// because the allocator (`$289004`) was not yet ported.  W54 ported it as
// `src/effects.js spawnEffect` and shipped it for enemy deaths; the
// `BOSS_NOTED[0x289004]` "deferred whole since W53" line was STALE (recon 106).
// The four routines below transcribe the four emitter shapes the death arm
// reaches, each off the already-shipped allocator + driver + pool B.
//
// The position comes from the CALLER (D2 in the ROM): `$2(a6)` for the boss,
// `$22(a6)`/`$62(a6)` for the two parts.  A0 may be the bit bucket on a full
// pool or an out-of-range kind; `spawnEffect` counts that event, and the field
// writes then land in a slot nothing drives -- faithfully (`src/effects.js`).

/** `$2938AE` -- the table-driven burst, bucket `$0C`.  Walks 12-byte ROM
 *  entries `[delay:2][kind:2][f1c:2][nudge:4][loopctl:2]` until a `$FFFF`
 *  delay.  Per entry: allocate, set `+$1C=f1c(byte)`, `+$18=delay`,
 *  `+$26=nudge(long)`, `+$02=pos`, `+$1E=$0C`, `+$12=0`, `+$14=0`; and if
 *  `loopctl!=0`, `bset (loopctl-1),$3(a4)`.  The state-0 table's last entry
 *  carries `loopctl=$0001`, which is the timer-A gate -- porting the burst
 *  without loopctl would silence every state-1/2 kind-$10 spawn.
 *  Used by D-script 6 (states 0 and 1-end) and the parts (state 0). */
function burst2938AE(ram, rom, ctx, a4, pos, tableAddr, site) {
  let a1 = tableAddr;
  for (let guard = 0; ; guard++) {
    const delay = rom.u16(a1); a1 += 2;                    // $2938AE move.w (A1)+,D1
    if (delay === 0xffff) return;                           // $2938B0/$2938B4 beq -> rts
    if (guard > 32) {
      unreached(0x2938b0, `$2938AE's burst loop consumed 32 entries without a `
        + `$FFFF terminator at table $${tableAddr.toString(16).toUpperCase()}; `
        + `every measured table is at most 8 entries`);
    }
    const kind = rom.u16(a1); a1 += 2;                      // $2938B8 move.w (A1)+,D0
    const a0 = spawnEffect(ram, ctx, kind, site);           // $2938BA jsr $289004
    const f1c = rom.u16(a1); a1 += 2;                       // $2938C0 move.w (A1)+,D0
    ram.setU8(a0 + B.f1c, f1c & 0xff);                      // $2938C2 move.b D0,$1C(A0)
    ram.setU16(a0 + B.delay, delay);                        // $2938C6 move.w D1,$18(A0)
    const nudge = rom.u32(a1); a1 += 4;                     // $2938CA move.l (A1)+,$26(A0)
    ram.setU32(a0 + B.nudge, nudge);
    ram.setU32(a0 + B.pos, pos);                            // $2938CE move.l D2,$2(A0)
    ram.setU16(a0 + B.bucket, 0x000c);                      // $2938D2 move.w #$C,$1E(A0)
    ram.setU16(a0 + B.sub12, 0);                            // $2938D8 move.w #$0,$12(A0)
    ram.setU16(a0 + B.sub14, 0);                            // $2938DE move.w #$0,$14(A0)
    const loopctl = rom.u16(a1); a1 += 2;                   // $2938E4 move.w (A1)+,D0
    if (loopctl !== 0) {                                    // $2938E6 beq -> loop
      const bit = (loopctl - 1) & 7;                        // $2938E8 subq.w #1,D0 ; bset.b is mod 8
      ram.setU8(a4 + 0x03, ram.u8(a4 + 0x03) | (1 << bit)); // $2938EA bset.b D0,$3(A4)
    }
  }
}

/** `$2938F2` -- the OTHER table-driven burst, bucket `$04`.  Same 12-byte
 *  entry shape as `$2938AE` but the last word is a SPEED/ANGLE pair (not
 *  loopctl), it writes `+$14=$0400`, and it jitters the angle via `$242B3C`:
 *  `+$1A=speedangle(word)`, then `add.b (rng>>2 signed),$1B`.  Used by the
 *  two parts' state-2 bursts (tables `$293B50`/`$293D94`). */
function burst2938F2(ram, rom, ctx, pos, tableAddr, site) {
  let a1 = tableAddr;
  for (let guard = 0; ; guard++) {
    const delay = rom.u16(a1); a1 += 2;                    // $2938F2 move.w (A1)+,D1
    if (delay === 0xffff) return;                           // $2938F4/$2938F8 beq -> rts
    if (guard > 32) {
      unreached(0x2938f4, `$2938F2's burst loop consumed 32 entries without a `
        + `$FFFF terminator at table $${tableAddr.toString(16).toUpperCase()}`);
    }
    const kind = rom.u16(a1); a1 += 2;                      // $2938FC move.w (A1)+,D0
    const a0 = spawnEffect(ram, ctx, kind, site);           // $2938FE jsr $289004
    const f1c = rom.u16(a1); a1 += 2;                       // $293904 move.w (A1)+,D0
    ram.setU8(a0 + B.f1c, f1c & 0xff);                      // $293906 move.b D0,$1C(A0)
    ram.setU16(a0 + B.delay, delay);                        // $29390A move.w D1,$18(A0)
    const nudge = rom.u32(a1); a1 += 4;                     // $29390E move.l (A1)+,$26(A0)
    ram.setU32(a0 + B.nudge, nudge);
    ram.setU32(a0 + B.pos, pos);                            // $293912 move.l D2,$2(A0)
    ram.setU16(a0 + B.bucket, 0x0004);                      // $293916 move.w #$4,$1E(A0)
    ram.setU16(a0 + B.sub12, 0);                            // $29391C move.w #$0,$12(A0)
    ram.setU16(a0 + B.sub14, 0x0400);                       // $293922 move.w #$400,$14(A0)
    const sa = rom.u16(a1); a1 += 2;                        // $293928 move.w (A1)+,$1A(A0)
    ram.setU16(a0 + B.speed, sa);
    const r = drawByte242B3C(ram, rom);                     // $29392C jsr $242B3C -> D0
    const signed = r >= 0x80 ? r - 0x100 : r;               // $293932 add.b D0,$1B(A0):
    ram.setU8(a0 + B.angle, (ram.u8(a0 + B.angle) + signed) & 0xff);  // ..(asr in caller;
  }                                                         //  $2938F2 adds the raw byte)
}

/** `$293F8C`/`$29403C` -- the timer-C direct spawn.  Reads a 16-byte entry
 *  from table `$2941E8` at the cursor `+$0E(a4)`: `[kind:2][f1c:2][nudge:4]
 *  [speedangle:2]`.  One record: bucket `$0C`, `+$12=0`, `+$14=$0800`,
 *  position and speed/angle from the table.  The cursor advance and wrap are
 *  the CALLER's (they differ between state 2, wrap $80, and state 3, wrap
 *  $100). */
function timerCSpawn293F8C(ram, rom, ctx, a4, pos, site) {
  const a1 = 0x2941e8 + ram.u16(a4 + D6.cursorE);          // $293F80 lea / $293F86 adda.w $E(A4)
  const kind = rom.u16(a1);                                 // $293F8A move.w (A1)+,D0
  const a0 = spawnEffect(ram, ctx, kind, site);             // $293F8C jsr $289004
  const f1c = rom.u16(a1 + 2);                              // $293F92 move.w (A1)+,D0
  ram.setU8(a0 + B.f1c, f1c & 0xff);                        // $293F94 move.b D0,$1C(A0)
  const nudge = rom.u32(a1 + 4);                            // $293F98 move.l (A1)+,$26(A0)
  ram.setU32(a0 + B.nudge, nudge);
  ram.setU32(a0 + B.pos, pos);                              // $293F9C move.l $2(A6),$2(A0)
  ram.setU16(a0 + B.bucket, 0x000c);                        // $293FA2 move.w #$C,$1E(A0)
  ram.setU16(a0 + B.sub12, 0);                              // $293FA8 move.w #$0,$12(A0)
  ram.setU16(a0 + B.sub14, 0x0800);                         // $293FAE move.w #$800,$14(A0)
  const sa = rom.u16(a1 + 8);                               // $293FB4 move.w (A1)+,$1A(A0)
  ram.setU16(a0 + B.speed, sa);
}

/** `$28B4BE` -- the BIG 5-particle burst, fired every second timer-C tick in
 *  state 2 (`$29409C`).  D0 = a shift count (0 at the boss call site),
 *  D1 = a base angle byte (from `$242EC2`), D2 = position, D3 = bucket `$0C`.
 *  Each particle: speed = `const >> D0`, angle = D1 + (`$242B3C` asr.b #2),
 *  with a per-particle spawn delay 0..6.  Kinds 4,7,4,5,5. */
export function bigBurst28B4BE(ram, rom, ctx, pos, rngByte, shift, bucket, site) {
  const particles = [
    [0x04, 0x05, 0], [0x07, 0x07, 1], [0x04, 0x0a, 2],
    [0x05, 0x0e, 3], [0x05, 0x12, 6],
  ];
  for (const [kind, spdConst, delay] of particles) {
    const a0 = spawnEffect(ram, ctx, kind, site);           // $28B4C2/+ jsr $289004
    ram.setU16(a0 + B.bucket, bucket);                      // $28B4C8 move.w D3,$1E(A0)
    ram.setU32(a0 + B.pos, pos);                            // $28B4CC move.l D2,$2(A0)
    ram.setU8(a0 + B.speed, (spdConst >> shift) & 0xff);    // $28B4D0/+ lsr.w D6,D0 / move.b
    ram.setU8(a0 + B.angle, rngByte & 0xff);                // $28B4D8 move.b D1,$1B(A0)
    const r = drawByte242B3C(ram, rom);                     // $28B4DC jsr $242B3C
    const adj = (r >= 0x80 ? r - 0x100 : r) >> 2;           // $28B4E2 asr.b #2,D0
    ram.setU8(a0 + B.angle, (ram.u8(a0 + B.angle) + adj) & 0xff); // $28B4E4 add.b D0,$1B
    ram.setU16(a0 + B.delay, delay);                        // $28B4E8 move.w #N,$18(A0)
  }
}

/** `$28B34A`, the stage-2 boss death's eight-particle burst. */
export function bigBurst28B34A(ram, rom, ctx, pos, rngByte, bucket, site) {
  const particles = [
    [0x07, 0x05, 0], [0x04, 0x07, 1], [0x07, 0x0a, 2],
    [0x04, 0x0e, 3], [0x05, 0x12, 6], [0x04, 0x16, 8],
    [0x05, 0x1c, 10], [0x05, 0x22, 12],
  ];
  for (const [kind, speed, delay] of particles) {
    const a0 = spawnEffect(ram, ctx, kind, site);
    ram.setU16(a0 + B.bucket, bucket);
    ram.setU32(a0 + B.pos, pos);
    ram.setU8(a0 + B.speed, speed);
    ram.setU8(a0 + B.angle, rngByte);
    const r = (drawByte242B3C(ram, rom) << 24) >> 24;
    ram.setU8(a0 + B.angle, ram.u8(a0 + B.angle) + (r >> 2));
    ram.setU16(a0 + B.delay, delay);
  }
}

/** `$293E04` -- D-script 6's STEP: the boss's death animation, and the last
 *  128 frames of it are the stage's. */
function d6Step293E04(ram, rom, ctx, a4) {
  const st = () => ram.u8(a4 + D6.state);
  // ---- state 6 ($293E04) -- THE ARM.  `$293E1C clr.w (a4)` retires the slot,
  // so `$2595E8` fires EXACTLY ONCE.
  if (st() === 6) {
    const n = u16(ram.u16(a4 + D6.wait) - 1);          // $293E0E subq.w #$1
    ram.setU16(a4 + D6.wait, n);
    if (n === 0) {
      suspend2595E8(ram);                              // $293E16 jsr $2595E8
      ram.setU16(a4, 0);                               // $293E1C clr.w (a4)
      ctx.bossEvent?.('suspend', ram.u16(0x8130ce));
    }
    return;                                            // $293E1E rts
  }
  // D2 in the ROM is the boss sub-record position `$2(A6)`; every emitter
  // below reads it.  `$292902` publishes A6 for the frame (`bossA6`).
  const a6 = bossA6(ctx, 0x293e04);
  const bossPos = ram.u32(a6 + 0x02);                   // $293E56/$293E9A move.l $2(A6)
  // ---- the two emitter timers ($293E20 / $293E64), both gated on $3(a4)'s bits
  if ((ram.u8(a4 + D6.flags) & 2) !== 0) {             // $293E20 btst #$1
    if (!decByteBcc(ram, a4 + D6.tB)) {                // $293E2A subq.b/bcc
      ram.setU8(a4 + D6.tB, ram.u8(a4 + D6.tBr));      // $293E32
      // $293E38 moveq #$5,D0 -- kind $05, bucket $0C, speed $14, rng angle
      const e = spawnEffect(ram, ctx, 0x05, 0x293e3a); // $293E3A jsr $289004
      ram.setU16(e + B.bucket, 0x000c);                // $293E40
      ram.setU8(e + B.speed, 0x14);                    // $293E46 move.b #$14,$1A
      ram.setU8(e + B.angle, drawByte242B3C(ram, rom));// $293E4C/$293E52 jsr $242B3C
      ram.setU32(e + B.pos, bossPos);                  // $293E56
      ram.setU32(e + B.nudge, 0xf8000000);             // $293E5C
    }
  }
  if ((ram.u8(a4 + D6.flags) & 1) !== 0) {             // $293E64 btst #$0
    if (!decByteBcc(ram, a4 + D6.tA)) {                // $293E6E
      ram.setU8(a4 + D6.tA, ram.u8(a4 + D6.tAr));      // $293E76
      // $293E7C/$293EAA: TWO kind-$10 spawns, speeds $18/$14 -- no sub12/14
      const e1 = spawnEffect(ram, ctx, 0x10, 0x293e7e);  // $293E7E
      ram.setU16(e1 + B.bucket, 0x000c);               // $293E84
      ram.setU8(e1 + B.speed, 0x18);                   // $293E8A
      ram.setU8(e1 + B.angle, drawByte242B3C(ram, rom));// $293E90/$293E96
      ram.setU32(e1 + B.pos, bossPos);                 // $293E9A
      ram.setU32(e1 + B.nudge, 0xe8000400);            // $293EA0
      const e2 = spawnEffect(ram, ctx, 0x10, 0x293eaa);  // $293EAA
      ram.setU16(e2 + B.bucket, 0x000c);               // $293EB0
      ram.setU8(e2 + B.speed, 0x14);                   // $293EB6
      ram.setU8(e2 + B.angle, drawByte242B3C(ram, rom));// $293EBC/$293EC2
      ram.setU32(e2 + B.pos, bossPos);                 // $293EC6
      ram.setU32(e2 + B.nudge, 0xf3fff800);            // $293ECC
    }
  }
  // ---- state 5 ($293ED4)
  if (st() === 5) {
    const n = u16(ram.u16(a4 + D6.wait) - 1);          // $293EDE
    ram.setU16(a4 + D6.wait, n);
    if (n === 0) {
      ctx.soundPost?.(0x28c392);                       // WAVE A: BGM id=6, SOUND ($293EE6)
      // $293EEC jsr $2440E0 -- W433 (D64).  RUN, not counted.  This one call
      // is the whole of the stage-1 boss death's SCREEN SHAKE: $2440E0's tail
      // at $244ABA is `jsr $260E36`, which arms $813186 = 1 and zeroes the
      // cursor $813188, and from the next frame on `$260EC8` walks the 42-pair
      // table at $260F4C into $80B054/$80B056.  The board does it on
      // lf9903..9944 of out/w69/stage1-laser-hold and the port left the column
      // at 0 for all 42 frames from W52 until this wave -- a divergence on a
      // CLAIMED column, because the routine was ported for the stage-2 and
      // stage-3 deaths (W189) and this call site was never wired to it.
      finalBlast2440E0(ram, rom, ctx, a6);             // $293EEC
      ram.setU16(a4 + D6.wait, 0x80);                  // $293EF2
      ram.setU8(a4 + D6.state, 6);                     // $293EF8
    }
  }
  // ---- state 4 ($293EFE) -- waits on THE FADE
  if (st() === 4 && !fadeDone259B9E(ram)) {            // $293F08/$293F0E bcs
    note(ctx, 0x246410);                               // $293F18
    a2Stop25994A(ram, 2); a2Stop25994A(ram, 4); a2Stop25994A(ram, 5);  // $293F20..
    ram.setU16(a4 + D6.wait, 8);                       // $293F36
    ram.setU8(a4 + D6.state, 5);                       // $293F3C
  }
  // ---- state 3 ($293F42)
  if (st() === 3) {
    if (!decByteBcc(ram, a4 + D6.tD)) {                // $293F4C
      ram.setU8(a4 + D6.tD, ram.u8(a4 + D6.tDr));      // $293F54
      d6TimerDSound(ram, rom, ctx, a4);                // $293F5A..$293F72 -- THE EXPLOSION RATTLE
    }
    if (!decByteBcc(ram, a4 + D6.tC)) {                // $293F72
      ram.setU8(a4 + D6.tC, ram.u8(a4 + D6.tCr));      // $293F7A
      timerCSpawn293F8C(ram, rom, ctx, a4, bossPos, 0x293f8c);  // $293F8C jsr $289004
      const e = u16(ram.u16(a4 + D6.cursorE) + 0x10);  // $293FB8 addi.w #$10
      ram.setU16(a4 + D6.cursorE, e);
      if (e === 0x100) {                               // $293FBE cmpi.w #$100
        ram.setU16(a4 + D6.cursorE, 0);                // $293FC8
        ram.setU8(a4 + D6.state, 4);                   // $293FCC
        fadeArm259B7E(ram, 0x12);                      // $293FD2/$293FD6
        ctx.soundPost?.(0x28c2c2);                           // $293FDC
      }
    }
  }
  // ---- state 2 ($293FE2)
  if (st() === 2) {
    if (ram.u16(a4 + D6.wait) !== 0) {                 // $293FEC tst.w/beq
      ram.setU16(a4 + D6.wait, u16(ram.u16(a4 + D6.wait) - 1));   // $293FF4
    } else {
      if (!decByteBcc(ram, a4 + D6.tD)) {              // $293FFC
        ram.setU8(a4 + D6.tD, ram.u8(a4 + D6.tDr));    // $294004
        // $29400A..$294016 -- BYTE-IDENTICAL to state 3's walk, same table, same cursor.
        d6TimerDSound(ram, rom, ctx, a4);              // $29400A..$294018
      }
      if (!decByteBcc(ram, a4 + D6.tC)) {              // $294022
        ram.setU8(a4 + D6.tC, ram.u8(a4 + D6.tCr));    // $29402A
        timerCSpawn293F8C(ram, rom, ctx, a4, bossPos, 0x29403c);  // $29403C jsr $289004
        // $294068 -- EVERY SECOND emission also fires the big one.
        const t = u16(ram.u16(a4 + D6.toggle) + 1) & 1;
        ram.setU16(a4 + D6.toggle, t);
        if (t === 0) {
          note(ctx, 0x246410);                         // $29407C -- anim-object loader
          // $294082 jsr $242EC2 -> D0; $294088 move.b D0,D1 -- the base angle
          const rngByte = drawWord242EC2(ram, rom) & 0xff;   // $294082
          bigBurst28B4BE(ram, rom, ctx, bossPos, rngByte, 0, 0x000c, 0x29409c); // $29409C
          ctx.soundPost?.(0x28c2a8);                         // $2940A2 -- SOUND
        }
        const e = u16(ram.u16(a4 + D6.cursorE) + 0x10);   // $2940A8
        ram.setU16(a4 + D6.cursorE, e);
        if (e === 0x80) {                              // $2940AE cmpi.w #$80
          ram.setU16(a4 + D6.cursorE, 0);              // $2940B8
          ram.setU8(a4 + D6.state, 3);                 // $2940BC
          ram.setU16(a4 + D6.tC, 0x0004);              // $2940C2
          ram.setU8(a4 + D6.flags, 0);                 // $2940C8 -- BOTH timers off
          ram.setU16(a4 + D6.tD, 0x0808);              // $2940CE
        }
      }
    }
  }
  // ---- state 1 ($2940D4)
  if (st() === 1) {
    const n = u16(ram.u16(a4 + D6.wait) - 1);          // $2940DE
    ram.setU16(a4 + D6.wait, n);
    if (n === 0) {
      // $2940E6 move.l $2(A6),D2 / lea $2941B6 / bsr $2938AE -- state-1-end burst
      burst2938AE(ram, rom, ctx, a4, bossPos, 0x2941b6, 0x2940f0);  // $2940F0
      ram.setU8(a4 + D6.state, 2);                     // $2940F4
      ram.setU16(a4 + D6.wait, 0x80);                  // $2940FA -- **NOT 32**
      ram.setU8(a4 + D6.flags, ram.u8(a4 + D6.flags) | 2);   // $294100 bset #$1
      a2Stop25994A(ram, 3);                            // $294106/$294108
    }
  }
  // ---- state 0 ($29410E)
  if (st() === 0) {
    ram.setU8(a4 + D6.state, 1);                       // $294118
    ctx.soundPost?.(0x28c2c2);                               // $29411E -- SOUND
    // $294124 move.l $2(A6),D2 / lea $294154 / bsr $2938AE -- THE death burst.
    // Its last entry carries loopctl=$0001, which arms timer A ($3(a4) bit 0).
    burst2938AE(ram, rom, ctx, a4, bossPos, 0x294154, 0x29412e);  // $29412E
  }
}


// ============================================== A3 SCRIPTS 4 AND 5 -- THE PARTS
//
// `$294E88 moveq #$4 / jmp $259962` and `$294EDE moveq #$5` start these, so
// `$294DD4` arms THREE A3 scripts, not one, and a port that registered only
// D-script 6 stops on the very frame the boss dies.  They are the two side
// parts falling off the bottom of the screen.
//
// **BOTH OF THEM CARRY A LARGE BLOCK OF EMITTER CODE THAT THE PORT DOES NOT
// RUN**, for two different reasons on the board, and a third in the port:
//
//   * script 4's step BEGINS `$293970 bra.w $293A44`, jumping OVER
//     `$293974..$293A42` -- three `$3(a4)`-gated spark bursts -- to the state
//     machine.  Nothing branches back.  Forty-one instructions of dead code.
//     [M] `$293970` is `60 00 00 d2`, and `$293972 + $D2 = $293A44`, which
//     `aligned.py` decodes as `cmpi.b #$2,($2,A4)` -- the state machine's own
//     first instruction.  So script 4's blocks are UNREACHABLE and stay
//     untranslated; that is a measurement, not a deferral.
//   * script 5's step has no such jump: `$293BAE..$293BB4` is the same two-
//     instruction scroll preamble and `$293BB8` is `btst #$2,($3,A4)` straight
//     away.  It REACHES the same three blocks, each `btst.b #$n,$3(a4) / beq`.
//     W62 wrote "NOTHING sets a bit of `$3(a4)`" -- that was WRONG: the
//     state-0 burst tables (`burst2938AE`'s `loopctl` field) set bits 0/1/2 of
//     `$3(a4)`, and `$293D32`'s eight entries carry loopctl 1, 2 and 3, so ALL
//     THREE blocks arm on the frame the part detaches.
//
// **WAVE 436 TRANSLATES SCRIPT 5's THREE BLOCKS (`sparkBlocks293BB8`).**  They
// were the only pool-B producer missing from `stage1-laser-hold` lf9500->9600,
// which sat at 60/80 from W434 until this wave.  [M] board 33 live / 43
// non-blank / count $22 against port 30 live / 35 non-blank / count $1F: the
// EIGHT non-blank records the port never made are these blocks' eight firings
// over lf9558..9574, and three of them are still live at lf9600.
//
// **THE BLOCKS ARE NOT THREE COPIES OF ONE SHAPE.**  `aligned.py` decodes
// `$293BAE..$293C87` as 43 instructions: 2 preamble + 13 + 14 + 14.  Blocks 2
// and 3 carry `$293C2E`/`$293C74 d0 00` -- `add.b D0,D0`, DOUBLING the
// `$242B3C` angle byte -- and block 1 does NOT.  Reading them as one loop body
// would put the wrong angle on two thirds of the sparks.  Block 3 is also a
// different KIND ($6, not $10), a different bucket ($8, not $4) and a
// different speed ($C, not $10).
//
// Their state machines are identical up to the field offsets: state 0 arms,
// state 1 walks the part down by `$800` a tick until its Y goes negative, state
// 2 emits once and `clr.w (a4)` RETIRES THE SLOT.

const PART = {   // the two parts' sub-record fields
  4: { pos: 0x22, scrollY: 0x24, fallX: 0x46, fallY: 0x48, stopId: 0,
       tState0: 0x293aee, tState2: 0x293b50 },   // W107: the part's burst tables
  5: { pos: 0x62, scrollY: 0x64, fallX: 0x86, fallY: 0x88, stopId: 1,
       tState0: 0x293d32, tState2: 0x293d94 },
};

function partScriptInit(ram, a4) {                     // $29393A / $293B82
  ram.setU8(a4 + 0x02, 0);                             // $29393A
  ram.setU8(a4 + 0x03, 0);                             // $293940 -- BOTH emitter
  ram.setU16(a4 + 0x04, 0x0008);                       //   gates stay shut
  ram.setU16(a4 + 0x06, 0x0005);                       // $29394C
  ram.setU16(a4 + 0x08, 0x0007);                       // $293952
  ram.setU16(a4 + 0x0a, 0x1008);                       // $293958
  ram.setU16(a4 + 0x0c, 0x0000);                       // $29395E
}

/** WAVE 436's falsification seam, same shape and same reset discipline as
 *  `W96_MUTATE`: `'no-sparks'` puts `partScriptStep` back to where it was
 *  before this wave, so the test can show the ladder goes RED without the
 *  blocks instead of merely asserting it goes green with them. */
export const W436_MUTATE = { value: null };

/** `$293BB8..$293C87` -- SCRIPT 5's three `$3(a4)`-gated spark blocks, the ones
 *  script 4 branches over at `$293970`.  Each is: `btst.b #bit,$3(A4)`, a
 *  byte countdown at `$ctr(A4)` reloaded from `$ctr+1(A4)`, then ONE
 *  `$289004` allocation whose position is the part's own `$62(A6)`.
 *
 *  [M] the three, in the ROM's order, from `aligned.py`:
 *      $293BB8  bit 2  ctr $8/$9  kind $10  bucket $4  speed $10  nudge $FDFFFC00
 *      $293BFC  bit 0  ctr $4/$5  kind $10  bucket $4  speed $10  nudge $F2000200  + add.b D0,D0
 *      $293C42  bit 1  ctr $6/$7  kind $06  bucket $8  speed $0C  nudge $F5FFFC00  + add.b D0,D0
 *  `partScriptInit` seeds all three counters at 0 with reloads $8, $5 and $7 --
 *  script 5's own copy is `$293B8E`/`$293B94`/`$293B9A` (`$293946`/`$29394C`/
 *  `$293952` is script 4's, and the two are word writes so the counter is 0 and
 *  the reload is the low byte).  `subq.b #1` on 0 BORROWS, so every block fires
 *  on the FIRST frame after the bits are set and then every reload+1 frames:
 *  [M] lf9558/9566/9574, lf9558/9567 and lf9558/9564/9570 on the ladder.
 *
 *  ORDER MATTERS AND IS THE ROM's: each firing block consumes exactly one
 *  `$242B3C` draw, so re-ordering them re-orders the RNG stream as well as the
 *  allocations. */
export function sparkBlocks293BB8(ram, rom, ctx, a4, a6) {
  const pos = ram.u32(a6 + PART[5].pos);               // $293BEE/$293C34/$293C7A
  // ---- $293BB8, bit 2
  if ((ram.u8(a4 + 0x03) & 0x04) !== 0) {              // $293BB8 btst #$2,($3,A4)
    if (!decByteBcc(ram, a4 + 0x08)) {                 // $293BC2 subq.b #1 / bcc
      ram.setU8(a4 + 0x08, ram.u8(a4 + 0x09));         // $293BCA move.b ($9,A4),($8,A4)
      const a0 = spawnEffect(ram, ctx, 0x10, 0x293bd2);// $293BD0 moveq #$10 / $293BD2 jsr
      ram.setU16(a0 + B.bucket, 0x0004);               // $293BD8 move.w #$4,($1E,A0)
      ram.setU8(a0 + B.speed, 0x10);                   // $293BDE move.b #$10,($1A,A0)
      ram.setU8(a0 + B.angle, drawByte242B3C(ram, rom));  // $293BE4/$293BEA -- NO add.b
      ram.setU32(a0 + B.pos, pos);                     // $293BEE move.l ($62,A6),($2,A0)
      ram.setU32(a0 + B.nudge, 0xfdfffc00);            // $293BF4
    }
  }
  // ---- $293BFC, bit 0
  if ((ram.u8(a4 + 0x03) & 0x01) !== 0) {              // $293BFC btst #$0,($3,A4)
    if (!decByteBcc(ram, a4 + 0x04)) {                 // $293C06 subq.b #1 / bcc
      ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));         // $293C0E move.b ($5,A4),($4,A4)
      const a0 = spawnEffect(ram, ctx, 0x10, 0x293c16);// $293C14 moveq #$10 / $293C16 jsr
      ram.setU16(a0 + B.bucket, 0x0004);               // $293C1C move.w #$4,($1E,A0)
      ram.setU8(a0 + B.speed, 0x10);                   // $293C22 move.b #$10,($1A,A0)
      // $293C2E add.b D0,D0 -- the DOUBLED angle, byte-wide.
      ram.setU8(a0 + B.angle, (drawByte242B3C(ram, rom) * 2) & 0xff);  // $293C28/$293C2E/$293C30
      ram.setU32(a0 + B.pos, pos);                     // $293C34 move.l ($62,A6),($2,A0)
      ram.setU32(a0 + B.nudge, 0xf2000200);            // $293C3A
    }
  }
  // ---- $293C42, bit 1 -- A DIFFERENT KIND, BUCKET AND SPEED
  if ((ram.u8(a4 + 0x03) & 0x02) !== 0) {              // $293C42 btst #$1,($3,A4)
    if (!decByteBcc(ram, a4 + 0x06)) {                 // $293C4C subq.b #1 / bcc
      ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));         // $293C54 move.b ($7,A4),($6,A4)
      const a0 = spawnEffect(ram, ctx, 0x06, 0x293c5c);// $293C5A moveq #$6 / $293C5C jsr
      ram.setU16(a0 + B.bucket, 0x0008);               // $293C62 move.w #$8,($1E,A0)
      ram.setU8(a0 + B.speed, 0x0c);                   // $293C68 move.b #$C,($1A,A0)
      ram.setU8(a0 + B.angle, (drawByte242B3C(ram, rom) * 2) & 0xff);  // $293C6E/$293C74/$293C76
      ram.setU32(a0 + B.pos, pos);                     // $293C7A move.l ($62,A6),($2,A0)
      ram.setU32(a0 + B.nudge, 0xf5fffc00);            // $293C80
    }
  }
}

function partScriptStep(ram, rom, ctx, a4, a6, id) {
  const f = PART[id];
  ram.setU16(a6 + f.scrollY, u16(ram.u16(a6 + f.scrollY)
    - ram.u16(0x813176)));                             // $293966/$29396C
  // $293970 `bra.w $293A44` skips script 4's copy of the three blocks; script
  // 5 has no such branch and runs them here, BEFORE its state machine.
  if (id === 5 && W436_MUTATE.value !== 'no-sparks') {
    sparkBlocks293BB8(ram, rom, ctx, a4, a6);          // $293BB8..$293C87
  }
  if (ram.u8(a4 + 0x02) === 2) {                       // $293A44 / $293C88
    ctx.soundPost?.(0x28c2a8);                               // $293A4E -- SOUND
    // $293A54 move.l $POS(A6),D2 / lea $tState2 / bsr $2938F2 -- the part's
    // off-screen retire burst (bucket $04, rng angle).  Usually off-screen.
    burst2938F2(ram, rom, ctx, ram.u32(a6 + f.pos), f.tState2, 0x293a5e);  // $293A5E
    ram.setU16(a4, 0);                                 // $293A62 clr.w (a4)
    return;
  }
  if (ram.u8(a4 + 0x02) === 1) {                       // $293A64 / $293CA8
    const t = ram.u8(a4 + 0x0a);                       // $293A6E subq.b #$1
    ram.setU8(a4 + 0x0a, (t - 1) & 0xff);
    if (t === 0) {                                     // bcc while t != 0
      ram.setU8(a4 + 0x0a, ram.u8(a4 + 0x0b));         // $293A76
      if (ram.u8(a4 + 0x0b) !== 0) {                   // $293A7C tst.b/beq
        ram.setU8(a4 + 0x0b, (ram.u8(a4 + 0x0b) - 1) & 0xff);   // $293A84
      }
      ram.setU16(a4 + 0x0c, u16(ram.u16(a4 + 0x0c) + 0x10));    // $293A88
      ram.setU16(a6 + f.fallX, u16(ram.u16(a6 + f.fallX) - 0x800));   // $293A8E
      ram.setU16(a6 + f.fallY, u16(ram.u16(a6 + f.fallY) - 0x800));   // $293A94
      if (i16(ram.u16(a6 + f.fallY)) < 0) {            // $293A9A cmpi/bge
        ram.setU32(a6 + f.fallX, 0);                   // $293AA4 move.l #$0
        ram.setU16(a4 + 0x0c, 0);                      // $293AAC
        ram.setU8(a4 + 0x02, 2);                       // $293AB2
        a2Stop25994A(ram, f.stopId);                   // $293AB8/$293ABA
      }
    }
  }
  if (ram.u8(a4 + 0x02) === 0) {                       // $293AC0 / $293D04
    ram.setU8(a4 + 0x02, 1);                           // $293ACA
    ctx.soundPost?.(0x28c2c2);                               // $293AD0 -- SOUND
    // $293AD6 move.l $POS(A6),D2 / lea $tState0 / bsr $2938AE -- the part's
    // DETACH burst (the visible pop when the side part breaks off).
    burst2938AE(ram, rom, ctx, a4, ram.u32(a6 + f.pos), f.tState0, 0x293ae0);  // $293AE0
  }
  ram.setU16(a6 + f.pos, u16(ram.u16(a6 + f.pos)
    - ram.u16(a4 + 0x0c)));                            // $293AE4/$293AE8
}

export function bossA6(ctx, addr) {
  if (ctx.bossSubRec === undefined || ctx.bossSubRec === null) {
    unreached(addr, 'a boss A3 part script was dispatched with no A6 published '
      + 'by $292902 -- the scheduler ran outside the boss handler\'s frame');
  }
  return ctx.bossSubRec;
}

/** W94: the same for A5, the boss's own enemy RECORD.  `$2417DE` takes A5 (it
 *  re-reads A6 from `($6,A5)`) and `$295948`/`$296614` gate on `($16,A5)`, the
 *  HP longword, so the movement and gun scripts need it exactly as the part
 *  scripts need A6.  A6 alone is not enough and deriving A5 back out of it
 *  would be a guess -- `$292902` has both in registers, so it publishes both. */
export function bossA5(ctx, addr) {
  if (ctx.bossRec === undefined || ctx.bossRec === null) {
    unreached(addr, 'a boss script was dispatched with no A5 published by '
      + '$292902 -- the scheduler ran outside the boss handler\'s frame');
  }
  return ctx.bossRec;
}

registerScript(0x29393a, (ram, rom, ctx, a4) => partScriptInit(ram, a4));
registerScript(0x293966, (ram, rom, ctx, a4) =>
  partScriptStep(ram, rom, ctx, a4, bossA6(ctx, 0x293966), 4));
registerScript(0x293b82, (ram, rom, ctx, a4) => partScriptInit(ram, a4));
registerScript(0x293bae, (ram, rom, ctx, a4) =>
  partScriptStep(ram, rom, ctx, a4, bossA6(ctx, 0x293bae), 5));


// -------------------------------------------- A0 SCRIPT 1 -- THE DEATH DRIFT
// `$294E2C moveq #$1,D0 / jsr $2598D0` arms the MAIN SEQUENCER on entry [1] of
// `$293104`, whose init and step are THE SAME LONGWORD ($2933C2) -- so the
// routine below runs on the death frame and on every frame after it until the
// boss record is freed.  Seven instructions: the hulk drifts left by `$10` a
// frame and its shadow longword `$A2(A6)` is recomputed from `$2(A6)` plus
// `$A6(A6)` plus the literal `$DE000000`.
function a0Script1_2933C2(ram, a6) {
  ram.setU16(a6 + 0x02, u16(ram.u16(a6 + 0x02) - 0x10));    // $2933C2 subi.w
  const d0 = ram.u32(a6 + 0x02);                            // $2933C8
  const d1 = ((d0 + ram.u32(a6 + 0xa6) + 0xde000000) >>> 0);  // $2933CE/$2933D2
  ram.setU32(a6 + 0xa2, d1);                                // $2933D8
}
registerScript(0x2933c2, (ram, rom, ctx, a4) => {
  void a4; a0Script1_2933C2(ram, bossA6(ctx, 0x2933c2));
});

registerScript(0x293dc6, (ram, rom, ctx, a4) => d6Init293DC6(ram, rom, ctx, a4));
registerScript(0x293e04, (ram, rom, ctx, a4) => d6Step293E04(ram, rom, ctx, a4));


// ================================================ A3 SCRIPT 7 -- THE ANIMATOR
//
// `$2943B0`, fourteen instructions, and `$29370A`'s entry 7 holds it TWICE --
// INIT and STEP are the same longword, so it has no separate first frame.  It is
// started at the boss's arrival (`$2932D6`'s `D.start 0,1,2,3,7`) and it runs
// until `$294DD4`'s death chain stops it by name.
//
// **READ BOTH ENDS**, and here is what each end actually is.
//
// ABOVE: `$294360..$2943AF` is a table of 12-byte records
// (`00 1F 00 02 / 7F FF 00 00 05 80 / 00 22 2B 38`), and `$00222B38` is one of
// the five stream ids `$292744`'s `jsr $24150A` loads -- DATA, so nothing falls
// INTO `$2943B0`.  [M] a scan of `$240000..$2A0000` for every control transfer
// landing in `$294370..$2943B0` finds exactly ONE, `$292322 bsr.w $294377`, and
// **`$292322` is inside the ASCII CREDITS**: the surrounding bytes read
// `SPECIAL ASSIST`, `Toshiaki Tomizawa`, `SALE BY AMI`, `2002 DEVELOP`.  The
// `bsr.w` is `61 00 20 53`, i.e. the letters `a`, NUL, space, `S` of
// "...awa" + " SAL".  There is no caller and there is no fall-through.
//
// BELOW: the routine's own end is the `rts` at `$2943EC`; `$2943EE` is D-script
// 8's INIT (`$29370A[8]` = `($2943EE, $2943FC)`), a different routine.
//
// WHAT IT IS: the boss's body-animation clock, and the ONLY writer of the cursor
// `$AA(A6)` that OBJECT routine 3 (`$292BFA`) indexes its sprite table with.
// Port one without the other and the boss animates wrong with nothing to blame.
//
//   $2943B0 subq.b #$1,$AE(A6) / bcc.w $2943EC    <- tick, and NOTE THE BCC
//   $2943B8 move.b $AF(A6),$AE(A6)                   reload from the PERIOD
//   $2943BE cmpi.b #$2,$AF(A6)                       ...and RAMP the period
//   $2943C4 beq $2943D8 / blt $2943D4 / subq.b       >2 -> --   ($2943CC)
//   $2943D4 addq.b #$1,$AF(A6)                       <2 -> ++
//   $2943D8 addq.w #$4,$AA(A6)                       step the cursor by FOUR
//   $2943DC cmpi.w #$1C,$AA(A6) / blt $2943EC        ...and wrap at $1C
//   $2943E6 move.w #$0,$AA(A6)
//
// TWO THINGS THE ADDRESSES DO NOT TELL YOU:
//
//  1. **`$AF(A6)` CONVERGES ON 2 AND STAYS THERE.**  Above 2 it decrements,
//     below 2 it increments, at 2 neither arm runs.  So the animation starts at
//     whatever rate the caller loaded and settles to one frame every two.  A
//     port that treated `$AF` as a constant period would be right forever after
//     the ramp and wrong exactly while the boss is arriving.
//  2. **THE CURSOR WRAPS TO 0 AT $1C, NOT AFTER IT.**  `blt` keeps values
//     strictly below `$1C`, so `$1C` itself is replaced -- the cycle is the
//     SEVEN values 0,4,8,$C,$10,$14,$18 and never $1C.  `ble` would give eight
//     and read one longword past each 32-byte row of `$292BFA`'s table.
function d7Anim2943B0(ram, a6) {
  const M = W82_MUTATE.value;
  const t = ram.u8(a6 + 0xae);                         // $2943B0 subq.b #$1
  ram.setU8(a6 + 0xae, (t - 1) & 0xff);
  // `subq.b` sets C on BORROW, so `bcc` is taken while the OLD value was
  // non-zero.  `d7-bcc-inverted` is the reading that ticks on every frame BUT
  // the one the ROM acts on.
  if (M === 'd7-bcc-inverted' ? t === 0 : t !== 0) return;   // $2943B4 bcc.w
  const per = ram.u8(a6 + 0xaf);
  ram.setU8(a6 + 0xae, per);                           // $2943B8 move.b
  // `$2943C8 blt.w` is SIGNED, so the compare is on the byte as a signed value.
  // It only differs from the unsigned reading for `$AF >= $80`, which nothing
  // in the ladder produces -- but `blt` is what the ROM wrote and an unsigned
  // `<` would send exactly those values down the OTHER arm.  `d7-unsigned-per`
  // is that reading, kept as a named wrong port.
  const sper = M === 'd7-unsigned-per' ? per : (per << 24) >> 24;
  if (M !== 'd7-no-ramp') {                            // $2943BE cmpi.b #$2
    if (sper > 2) ram.setU8(a6 + 0xaf, (per - 1) & 0xff);      // $2943CC subq.b
    else if (sper < 2) ram.setU8(a6 + 0xaf, (per + 1) & 0xff); // $2943D4 addq.b
  }
  const c = u16(ram.u16(a6 + 0xaa) + (M === 'd7-step-one' ? 1 : 4));  // $2943D8
  ram.setU16(a6 + 0xaa, c);
  // `blt` keeps values STRICTLY below $1C; `d7-wrap-ble` is the off-by-one that
  // admits $1C and reads the eighth longword of every 32-byte row.
  const past = M === 'd7-wrap-ble' ? i16(c) > 0x1c : i16(c) >= 0x1c;
  if (past) ram.setU16(a6 + 0xaa, 0);                  // $2943DC cmpi + $2943E6
}
registerScript(0x2943b0, (ram, rom, ctx, a4) => {
  void a4; d7Anim2943B0(ram, bossA6(ctx, 0x2943b0));
});


// ======================================= THE A2 OBJECT LIST -- THE BOSS'S ART
//
// `$292932`'s seven routines are the boss's SPRITE EMITTERS, one per body part,
// and `$25962E`'s own walk at `$259682` runs the armed ones after every script
// pass.  W62 installed the list (so the slots exist and carry their pointers)
// and registered none of the bodies; this wave registers FOUR -- indices 2, 3, 4
// and 5, which are the four still armed once the boss is dead and therefore the
// four the stage's last two checkpoint rungs need.  Indices 0, 1 and 6 stay
// loud named throws (`$292972`, `$292B08`, `$292F4A`).
//
// **THEY ARE ALL ONE ROUTINE WITH DIFFERENT CONSTANTS**, and that routine is
// `$23E020`:
//
//   23E020: move.l A0,-(A7) / move.l D0,-(A7)
//   23E024: lea $805CC8,A0 / adda.w $80AFC4,A0     <- SPRITE BUCKET 2
//   23E030: move.l D1,D0 / asr.l #$6,D0
//   23E034: andi.l #$07FF03FF,D0 / ori.l #$80008000,D0
//   23E040: move.l D0,(A0)+ / move.l D2,(A0)+
//   23E044: move.w D3,(A0)+ / move.w D4,(A0)+
//   23E048: addi.w #$C,$80AFC4
//   23E050: move.l (A7)+,D0 / movea.l (A7)+,A0     <- **D0 SURVIVES**
//
// which is `spritequeue.js enqueueRegisters` on bucket 2 verbatim -- the same
// `asr.l #6` across BOTH axes, the same `$07FF03FF` mask and the same
// `$80008000` no-zoom encoding the file's TRAP 1..3 comments describe.  Nothing
// new is being modelled here; four callers are being wired to a mechanism the
// port has had since W10.
//
// **THE `move.l (A7)+,D0` AT `$23E050` IS LOAD-BEARING** and it is the reason
// `$292E3E` below works at all: that routine computes a base position ONCE into
// D0 and then calls `$23E020` four times, adding a different offset each time.
// A transcription that let the emitter clobber D0 would put all four sprites at
// the same place.  Only reading the routine's LAST TWO INSTRUCTIONS tells you.
//
// A6 is the boss's SUB-RECORD, exactly as for the A3 scripts: `$259682`'s walk
// touches A0/A3/A4/D7 and never A6, so what the object routines read is what
// `$292902` left there.  `bossA6` throws by address if that is ever untrue.
const OBJ_BUCKET = 2;                    // $805CC8 / $80AFC4 -- spritequeue.js

/** W82's mutation seam, the W79 `AUTOSHOT_MUTATE` pattern.  Named WRONG PORTS,
 *  written next to the right one so a reviewer reads both.  `tools/breakage.mjs`
 *  is the only writer; `null` is the shipped behaviour. */
export const W82_MUTATE = { value: null };

/** `$23E020` -- the bucket-2 register-convention enqueue.  See above. */
function emit23E020(ram, d1, d2, d3, d4) {
  return enqueueRegisters(ram, OBJ_BUCKET, d1 >>> 0, d2 >>> 0, d3, d4);
}

/** `$292952` -- OBJECT 2.  Six instructions and every operand is a literal
 *  except the position and the attribute word.  No table, no animation. */
function obj2_292952(ram, a6) {
  const d1 = (ram.u32(a6 + 0x02) + 0xe600f400) >>> 0;  // $292958/$29295C addi.l
  emit23E020(ram, d1, 0x0006539c,                      // $292952 move.l #$6539C
    0x1a60,                                            // $292962 move.w #$1A60
    W82_MUTATE.value === 'obj2-no-attr' ? 0
      : ram.u16(a6 + 0x1c));                           // $292966 move.w $1C(A6)
}

/**
 * `$292BFA` -- OBJECT 3, and **THE ONE THAT CONSUMES D-SCRIPT 7's CURSOR.**
 *
 *   292BFA: lea $292C2A(pc),A2
 *   292C00: move.w $AC(A6),D2 / addq.w #$7,D2 / lsl.w #$5,D2
 *   292C08: adda.w D2,A2 / adda.w $AA(A6),A2
 *   292C0E: move.l (A2),D2
 *
 * so the sprite longword is `$292C2A + ($AC(A6) + 7) * $20 + $AA(A6)`: a table
 * of 32-byte ROWS selected by `$AC`, indexed within the row by `$2943B0`'s
 * cursor.  **THE `addq.w #$7` IS A BIAS: ROW 0 IS `$AC` = -7**, so the `lea`'s
 * own address is the BOTTOM of the table and not its middle, and `$AC` is a
 * SIGNED offset running -7..+7 over fifteen rows.  [M] `$29578C moveq #$19,D1`
 * feeds `$242190` a target of `$19 - $20` = -7 through the `+$20`/`-$20` bias
 * pair, so it really does go negative; `$2948A6` (D-script 15) targets 0.
 *
 * **AND A CLAIM THIS WAVE HAD TO WITHDRAW.**  The first draft of this comment
 * said a port that read `$AC` as UNSIGNED would index past every row.  It would
 * not.  [M] over all 65,536 word values, `u16((u16($AC)+7)<<5)` and
 * `u16((i16($AC)+7)<<5)` differ on **0**: `i16(x) == x (mod 65536)`, the `lsl.w`
 * is a WORD shift, and `adda.w` sign-extends only afterwards -- so the two
 * readings are the same instruction.  `obj3-unsigned-ac` is kept as a mutation
 * and DECLARED EXPECTED-GREEN with that measurement (`W82_EXPECTED_GREEN`)
 * rather than deleted, because an unexplained no-op is the thing
 * `docs/knowledge/03` exists for.  The signedness still matters for the WINDOW
 * -- it is what makes `$292C2A` the base and fifteen the row count.
 *
 * The row is read out of the CARTRIDGE at the computed address rather than
 * transcribed as a JS literal, per W48's work-list item 4: a wrong extent then
 * shows up as a wrong sprite code, not as a silently truncated table.
 */
function obj3_292BFA(ram, rom, a6) {
  const M = W82_MUTATE.value;
  const ac = M === 'obj3-unsigned-ac' ? ram.u16(a6 + 0xac)
    : i16(ram.u16(a6 + 0xac));                         // $292C00 + $292C08 adda.w
  const row = ((M === 'obj3-no-bias' ? ac : ac + 7) << 5);  // $292C04/$292C06
  const at = (0x292c2a + i16(u16(row)) + i16(ram.u16(a6 + 0xaa))) & 0xffffff;
  const d1 = (ram.u32(a6 + 0xa2) + 0xf600f800) >>> 0;  // $292C10/$292C14
  emit23E020(ram, d1, rom.u32(at),                     // $292C0E move.l (A2),D2
    0x0a40,                                            // $292C1A move.w #$A40
    ram.u16(a6 + 0xbc));                               // $292C1E move.w $BC(A6)
}

/**
 * `$292E0A` -- OBJECT 4.  **THE TABLE IT LOADS IS NEVER INDEXED.**
 * `$292E10 move.l (A2),D2` has no displacement and no index register, so of the
 * three longwords at `$292E32..$292E3D` only the FIRST can ever be read.  The
 * other two are unreachable from this routine.  Transcribed as the constant it
 * is, with the address, rather than as a lookup that would imply a variable.
 *
 * TWO `addi.l`s, not one -- `$292E16 #$FC00FC00` then `$292E1C #$F2000000` --
 * and they do NOT collapse to one constant safely by hand: the sum wraps the
 * long, so it is written as the ROM writes it.
 */
function obj4_292E0A(ram, rom, a6) {
  let d1 = (ram.u32(a6 + 0x02) + 0xfc00fc00) >>> 0;    // $292E12/$292E16
  // `obj4-one-addi` is the transcription that folded the two `addi.l`s into one
  // by hand.  They do NOT collapse: the first sum carries out of the low word.
  if (W82_MUTATE.value !== 'obj4-one-addi') d1 = (d1 + 0xf2000000) >>> 0;  // $292E1C
  emit23E020(ram, d1, rom.u32(0x292e32 + (W82_MUTATE.value === 'obj4-index-1'
    ? 4 : 0)),                                         // $292E0A lea / $292E10
    0x0420,                                            // $292E22 move.w #$420
    0x0015);                                           // $292E26 move.w #$15
}

/**
 * `$292E3E` -- OBJECT 5.  FOUR sprites from ONE routine, and the four differ
 * only in which animation byte they read and which offset they add.
 *
 *   D2 = long at $292ECA + ((byte & $3E) * 2)     byte = $C6/$C7/$C8/$C9(A6)
 *   D3 = $418, D4 = $17                          set ONCE, at $292E4E/$292E52
 *   D0 = $2(A6) + $FC00FD00                      the shared base, at $292E60
 *   D1 = D0 + $09C00400 / $09BFFC40 / $0F400600 / $0F3FF9C0
 *
 * **`andi.w #$3E` MASKS THE LOW BIT OFF**, so the byte selects one of THIRTY-TWO
 * rows in steps of two and an odd value picks the same row as the even below it.
 * `add.w D2,D2` then turns that into a longword offset.  Written as the ROM
 * writes it because `(b & $3E) * 2` and `(b >> 1) * 4` agree only while the
 * byte stays under $40 and nothing here guarantees that.
 *
 * The first three calls are `jsr` and the fourth is `jmp` ($292EC2) -- a tail
 * call, not a fifth thing.
 */
const OBJ5_LIMBS = [
  // [the animation byte, the offset added to the shared base]
  [0xc6, 0x09c00400],                                  // $292E40 / $292E62
  [0xc7, 0x09bffc40],                                  // $292E70 / $292E80
  [0xc8, 0x0f400600],                                  // $292E8E / $292E9E
  [0xc9, 0x0f3ff9c0],                                  // $292EAC / $292EBC
];

function obj5_292E3E(ram, rom, a6) {
  const M = W82_MUTATE.value;
  const d0 = (ram.u32(a6 + 0x02) + 0xfc00fd00) >>> 0;  // $292E56/$292E5A/$292E60
  let running = d0;
  for (const [field, off] of OBJ5_LIMBS) {
    const mask = M === 'obj5-mask-3f' ? 0x3f : 0x3e;   // $292E44 andi.w #$3E
    const d2 = ((ram.u8(a6 + field) & mask) * 2) & 0xffff;   // $292E48 add.w
    // `obj5-d0-clobbered` is the port that did not read `$23E050 move.l
    // (A7)+,D0`: each limb offsets the PREVIOUS limb instead of the base.
    const base = M === 'obj5-d0-clobbered' ? running : d0;   // $292E7E move.l D0,D1
    running = (base + off) >>> 0;
    emit23E020(ram, running,
      rom.u32(0x292eca + d2),                          // $292E4A move.l $292ECA(pc,D2.w)
      0x0418,                                          // $292E4E move.w #$418
      0x0017);                                         // $292E52 move.w #$17
  }
}

registerScript(0x292952, (ram, rom, ctx, a4) => {
  void a4; obj2_292952(ram, bossA6(ctx, 0x292952));
});
registerScript(0x292bfa, (ram, rom, ctx, a4) => {
  void a4; obj3_292BFA(ram, rom, bossA6(ctx, 0x292bfa));
});
registerScript(0x292e0a, (ram, rom, ctx, a4) => {
  void a4; obj4_292E0A(ram, rom, bossA6(ctx, 0x292e0a));
});
registerScript(0x292e3e, (ram, rom, ctx, a4) => {
  void a4; obj5_292E3E(ram, rom, bossA6(ctx, 0x292e3e));
});

/** Exported for `tests/w82stageend.test.js`, which drives them against the
 *  listing above rather than against a run. */
export const W82 = {
  d7Anim2943B0, obj2_292952, obj3_292BFA, obj4_292E0A, obj5_292E3E, OBJ5_LIMBS,
};

/** Exported for `tests/w425bossexplosion.test.js` (DOCKET D58). D-script 6 is
 *  reachable only through `registerScript`/`runScript`, which the scheduler does
 *  not export, so the death animation's own step and its timer-D sound walk are
 *  published here the way `W82` publishes the object routines. */
export const W425 = {
  d6Step293E04, d6TimerDSound, D6, D6_TIMER_D_TABLE, D6_TIMER_D_MASK,
};

// ============================================================== $292902
/**
 * `$292902` -- THE STAGE-1 BOSS'S PER-FRAME HANDLER.  Ten instructions, every
 * one a dispatch, and W36 left it a loud named throw on purpose.  W62 makes it
 * real, and the reason it is only ten lines here is that nine of the ten go
 * somewhere this file or `src/stageend.js` owns.
 */
export function handlerBoss292902(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + BOSS.subRec);
  // A6 IS LIVE ACROSS THE WHOLE FRAME on the board (`$2410D6`/`$2410E2` keep
  // it), and every A3 script the scheduler dispatches reads `($22,A6)` or
  // `($62,A6)` out of it.  The port has no register file, so the handler
  // publishes it for the frame it owns and `bossA6` throws by address if a
  // script is ever dispatched when nothing did.
  ctx.bossSubRec = a6;
  ctx.bossRec = a5;                                    // W94 -- see bossA5
  bossDamage294AD8(ram, rom, ctx, a5, a6);             // $292902 jsr $294AD8
  if (ram.u16(a5 + BOSS.hitStop) !== 0) {              // $292908 tst.w/beq
    ram.setU16(a5 + BOSS.hitStop, u16(ram.u16(a5 + BOSS.hitStop) - 1));  // $29290E
    note(ctx, 0x243dd0);                               // $292912
  }
  const c = runScheduler25962E(ram, rom, ctx);         // $292918 jsr $25962E
  if (!c) return;                                      // $29291E bcc.w $292930
  ctx.bossEvent?.('advance', ram.u16(0x8130ce));
  runStageAdvance242952(ram, rom, ctx);                // $292922 jsr $242952
  freeEnemy(ram, a5);                                  // $292928 jmp $263762
}

export { SCHED as BOSS_SCHED };

// W94 -- THE MOVEMENT LAYER registers itself.  This import is for its SIDE
// EFFECT (four `registerScript` calls) and it is at the FOOT of the file on
// purpose: `src/bossscripts.js` imports `bossA5`/`bossA6` back out of here, and
// both are hoisted function declarations, so the cycle resolves whichever
// module the loader reaches first.  Anything that needed a `const` from this
// file would have to be passed in instead.
import './bossscripts.js';
// W95 -- THE STEADY STATE registers itself, the same way and for the same
// reason: twenty more `registerScript` calls (the ten script ids of W94 §3A's
// closed set, INIT and STEP).  It imports CONSTS out of `bossscripts.js`
// (`BS`, `dist242494`, `bodyTail29314C`, ...), so it must come AFTER that
// import -- ESM hoists both, and `bossscripts.js` is fully evaluated by the
// time this one's body runs.
import './bossphase.js';
// W95 -- and the THREE GUNS the steady state starts (E 3, E 4 and E 13), six
// more entry points, in their own file because E 13 is BULLET KIND 11 and the
// first execution of any of W27's 39 transcribed bodies.
import './bossguns.js';
// W96 -- THE ARRIVAL registers itself, last, for the same reason: OBJECT 0/1/6,
// F 0, MAIN 0 and D 0..3, plus the two emitters they reach.  It imports `BS`,
// `dist242494` and `bodyTail29314C` out of `bossscripts.js` and `bossA5`/
// `bossA6` back out of this file, so it comes after both.  **This import is
// what makes `$2926E2`'s two ACTIVATIONS safe to turn on**, which they now are
// -- see `src/initbody.js`.
import './bossarrival.js';
// W103 -- THE F 2/F 3 WAVE registers itself: the remaining 44 live-unported
// boss scheduler entries (MAIN 3/4/8, F 2/3, D 8..19, E 5/6/8/12/14), plus the
// type-$1E handler the carrier spawn reaches.  It imports `BS`,
// `dist242494`, `bodyTail29314C` and `pickWaypoint2933DE` out of
// `bossscripts.js`, and `bossA5`/`bossA6` back out of this file.
import './bossf23.js';
// W399 -- HIBACHI's OWN A4 chain registers itself, the same way and for the same reason.
// `bossEnding2A6D8C` below has ended in `a4Start25980C(ram, 1)` since W372 and every link it
// reached threw by address, because nothing had registered `$2A5886`'s scripts. This import
// is six `registerScript` calls (A4 1, 2 and 3, INIT and STEP) and it is what makes
// `$2A5D28`'s and `$2A61E0`'s external speed pushes reachable. It imports `bossA5`/`bossA6`
// back out of this file, both hoisted function declarations, so the cycle resolves.
import './hibachiend.js';
// W404 -- the A1 GUN table `$2A72C8` and the three A4 scripts that drive it (A4 $A, $B and $C).
// Same cycle, same resolution: four `registerScript` calls for A1 guns 5 and 6, six for the A4
// pair entries. Without it every A1 slot the ending chain starts threw by address, because
// `$2A4306`'s table had never had a single script registered against it.
import './hibachiguns.js';

// $2A4606 -- HIBACHI's handler, all 170 bytes of it. See TB0 for the structure and its four
// independent confirmations.
//
// It does exactly TWO things: run the boss body, and take the stage-clear path when the scheduler
// says the boss is finished. The other TWELVE calls in it are no-ops against bare `rts` stubs, and
// they are transcribed as comments rather than as calls -- eleven `$26331C` per-part hooks and one
// `$25A17A`, which is one of four adjacent `rts` bytes at `$25A17A..$25A182`.
//
// THE CARRY POLARITY IS NOT INFERRED. `boss.js:1141` is the same sequence and settles it:
//   const c = runScheduler25962E(...);  if (!c) return;  runStageAdvance242952(...);  freeEnemy(...)
// There `!c` returns because nothing follows. Here `$2A4612 bcc $2A4622` skips FORWARD to the part
// hooks, so `!c` falls through to them instead of returning. Same convention, different continuation.
//
// `runStageAdvance242952` was verified to be a FULL translation (zero note()/unreached() inside) before
// this was written, because a note-only stage advance would soft-lock the run at stage 5's end with a
// green suite and no error.
/** `$242922` -- the boss-clear INTERVENTION. 48 bytes.
 *
 *  The two `$FF` writes are the interesting part. `tst.w` each player record and `bpl` SKIPS the
 *  write, so the byte lands only for a player whose flag word is NEGATIVE -- and it goes to that
 *  record's `+$3E`, not to a global. A port that wrote both unconditionally, or wrote one shared
 *  flag, would intervene for a player the cartridge leaves alone.
 *
 *  **W425 (D58): `$28C170` IS A REAL POST AGAIN, AND THIS IS THE OWNER'S REPORT.** The history
 *  matters because both earlier readings were half right. W385 turned it from a throwing
 *  `soundPost` into a counted note, correctly: `$28C170` has no row in `sound.js`'s `WRAPPERS`
 *  and must never be given one -- it loads D0/D1 and calls `$28BBAC`, a DIFFERENT packer from the
 *  `$28BB04` every `WRAPPERS` row describes, with no id, no pan and no channel nibble. What W385
 *  could not do was post it at all, because no path existed. W423 built that path
 *  (`postBgmCommand`, the `$28BBAC` tier) and W425 wired `postWrapper` to dispatch to it, so
 *  `ctx.soundPost?.(0x28c170)` now enqueues $15000000 with NO `WRAPPERS` row invented. Both
 *  statements are true at once: no row, and no throw.
 *
 *  **THERE IS NO GATE ON THIS PATH.** `$28BBAC` branches straight to the ring enqueue `$28BAA0`;
 *  it never reaches `$28C02A`/`$28C0AE`, so nothing here consults `gatePasses`. Routing it
 *  through a gate would silence a boss clear whenever the gate happened to be down -- the defect
 *  D58 is about, reintroduced one layer lower.
 *
 *  **THIS IS NOT THE WHOLE OF THE OWNER'S REPORT.** They said "explosion"; this cue is the boss
 *  CLEAR. The repeated explosion rattle of the death animation is the timer-D dispatch off
 *  `$294134` (`d6Step293E04`, states 2 and 3) -- see `BOSS_NOTED` and the note there. */
export function bossClear242922(ram, ctx) {
  // $242922 jsr $28C170 -- the boss-clear BGM cue. $28C170 -> $28BBAC D0=$15, posted through
  // sound.js's second path (postBgmCommand), NOT through a WRAPPERS row. D58 / W425.
  ctx.soundPost?.(0x28c170);                                 // $242922 jsr $28C170
  ram.setU16(0x81296e, 1);                                   // $242928 move.w #$1,$81296E
  for (const [rec, at] of [[0x8103e6, 0x810424], [0x810448, 0x810486]]) {
    if ((ram.u16(rec) & 0x8000) === 0) continue;             // $242930/$242940 tst.w / bpl SKIPS
    ram.setU8(at, 0xff);                                     // $242938/$242948 -- rec + $3E
  }
}

/** `$253564` -- the `$811F8C` CLAMP. Twenty bytes: `cmpi.w #$14,$811F8C / bcs rts /
 *  move.w #$14,$811F8C`. `bcs` means BELOW $14 is left alone, so this clamps DOWN to $14 and never
 *  raises. Writing `$14` unconditionally would raise a smaller value, which is the inverse bug. */
export function clamp253564(ram) {
  if (ram.u16(0x811f8c) < 0x14) return;                      // $253564/$25356C cmpi.w / bcs
  ram.setU16(0x811f8c, 0x14);                                // $25356E
}

/** The EIGHT damage-bearing parts. Same list and same order that `$2A6E74` arms, that the handler's
 *  eleven-call chain opens with, and that all three of this body's loops walk -- `$1A0` EIGHTH in every
 *  one. The handler's other three (`$140`/`$160`/`$180`) are armed by `$2A6E98`/`$2A6EA6`, carry no
 *  damage, and appear only in the draw chain. "The eleven" is two groups with different jobs. */
const HIBACHI_PARTS = Object.freeze([0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0]);

/** Adapts Hibachi form 1 to the shared exit body and its own ending block. */
function bossForm1Exit(ram, rom, ctx, a5, a6) {
  /*
   * `$2A6EDC` -- the body's EXIT, reached by `jmp` from both arms of the phase check.
   *
   * **W403 CORRECTION, TWICE.** This routine is 52 bytes and it is BYTE-IDENTICAL to `$2A707E`
   * and `$2A7294`, the second form's two exits, but for the one word of `bra.w` displacement
   * that names each one's death block ($FE80 here, $FF5A and $FF6A there). Writing the second
   * form showed that the version shipped here since W372 had lost two of the three tests:
   *
   *   1. `$2A6EDC 4a79 008130d2 / 6600 002a` -- the FREEZE GATE. `($1A,A5)` is not counted down
   *      at all while `$8130D2` is set, and this counted it every frame.
   *   2. `$2A6EF6 6600 000c` targets `$2A6F04`, which is `move.w #$0,($10A,A6)` and then
   *      `$2A6F0A 6000 FE80` -> $2A6F0C - $180 = `$2A6D8C`, THE ENDING BLOCK. The port
   *      `return`ed instead, so the timeout route into HIBACHI's death did not exist.
   *
   * It is now `bossExitShared`, called with this site's own death block, so the three cannot
   * drift apart again.
   */
  bossExitShared(ram, ctx, a5, a6,
    () => bossEnding2A6D8C(ram, rom, a5, a6, ctx));           // $2A6F0A bra.w $2A6D8C
}

/** `$2A6D42` -- the phase check. Self-latching on `($10C,A6)`, first loop only, and below `$23000` it
 *  switches the boss's whole script set. Both arms exit through `$2A6EDC`. */
function bossPhase2A6D42(ram, rom, a5, a6, ctx) {
  if (ram.u8(a6 + 0x10c) === 0                               // $2A6D42 tst.b / bne
      && ram.u16(0x813098) === 0                             // $2A6D48 tst.w $813098 / bne
      && (u32(ram.u32(a5 + 0x16) - 0x23000) & 0x80000000) !== 0) {   // $2A6D52/$2A6D5C bpl
    a1Clear259B34(ram);                                      // $2A6D5E
    a4Clear2598A2(ram);                                      // $2A6D64
    a4Start25980C(ram, 0x0e);                                // $2A6D6A/$2A6D6C
    ram.setU16(a6 + 0x108, 1);                               // $2A6D72 bsr $2A6E28 -- INVULNERABLE
    ram.setU8(a6 + 0x10c, 1);                                // $2A6D78 -- and the latch
    armScreenClearMode(ram, ctx, 0, 'HIBACHI $23000 phase', 0xffff, 0x243dd0);   // $2A6D7E
  }
  bossForm1Exit(ram, rom, ctx, a5, a6);                       // $2A6D84 jmp $2A6EDC
}

/** `$2A6D8C` -- the ENDING block, reached only when `$2428A6` says a player is out. */
function bossEnding2A6D8C(ram, rom, a5, a6, ctx) {
  // $2A6D8C jsr $28C170 -- the ENDING block's BGM cue, the same $28BBAC-tier command
  // `bossClear242922` posts, through the same path. W425 / D58.
  ctx.soundPost?.(0x28c170);                                 // $2A6D8C jsr $28C170
  ctx.unported?.note(0x23c4d0, '$2A6D92 jsr $23C4D0 -- the $8039xx pause/flag block, noted in '
    + 'boss.js since W357 and still not ported');
  if (ram.u16(0x813098) === 0 && ram.u16(0x80393a) === 0) {  // $2A6D98/$2A6DA2
    ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x40);            // $2A6DAC bset #6 -- effects.js reads this
    ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x80);            // $2A6DB4 bset #7 -- BOTH bits
    bossClear242922(ram, ctx);                               // $2A6DBC
    ram.setU8(a6 + 0x1f, 1);                                 // $2A6DC2
  }
  clamp253564(ram);                                          // $2A6DD2
  armScreenClearMode(ram, ctx, 0, 'HIBACHI ending', 0xffff, 0x243dd0);   // $2A6DD8
  a1Clear259B34(ram);                                        // $2A6DDE
  a4Clear2598A2(ram);                                        // $2A6DE4
  ram.setU16(a6 + 0x106, 1);                                 // $2A6DEA bsr $2A6ED4 -- the body SWITCHES
                                                             //   ITSELF OFF: $2A6B94's entry guard
  for (const p of HIBACHI_PARTS) ram.setU16(a6 + p, 0x8000); // $2A6DF0 bsr $2A6E74 -- re-arm
  a3Stop2599EC(ram, 2);                                      // $2A6DF6/$2A6DF8
  ram.setU32(a5 + 0x16, 0xffffffff);                         // $2A6DFE -- the pool, dead
  [0x10, 0x11, 0x12, 0x16].forEach((v, i) => ram.setU8(a6 + 0xe6 + i, v));   // $2A6E06..
  a4Start25980C(ram, 1);                                     // $2A6E20 JMP -- a tail call
}

/** `$2A6B94` -- HIBACHI's entire behaviour, deferred behind a note() since W357.
 *
 *  It is a FLOW GRAPH: five arms converge on the phase check and two on the ending block, so it is
 *  written as three functions rather than one straight line. Transcribing the blocks in address order
 *  would run the phase check after paths the cartridge routes around it.
 *
 *  TWO HP thresholds in the whole routine. Most of the bytes are the per-part damage reduce and the
 *  four-byte sprite quad.
 */
export function bossBody2A6B94(ram, rom, a5, a6, ctx) {
  if (ram.u16(a6 + 0x106) !== 0) return;                     // $2A6B94 -- switched off by the ending

  // $2A6B9C tst.b ($10E,A6) / $2A6BA0 bne.w $2A6F12 -- THE SECOND FORM'S OWN BODY. W372
  // transcribed it into TB0 (`bodySecondGateSite`/`bodySecondGateTarget`) without ever
  // branching on it, W399's A4 script 2 made the byte reachable ($2A5F40 move.b #$1), and W403
  // PORTS the body: src/hibachi2.js, $2A6F12..$2A72C7, $3B6 bytes.
  //
  // W403 CORRECTION to the note this replaces: `$2A6F12` is not "the second form", it is a
  // `cmpi.b #$1,($10E,A6)` whose `bne.w` splits into TWO bodies -- phase A at $2A6F1C (parts
  // $140/$160, threshold $11800, death tail-jumps A4 3) and phase B at $2A70B4 (part $180,
  // threshold $15000, death tail-jumps A4 5). ($10E,A6) is a SELECTOR with three states, not
  // a flag, and $2A637A in A4 script 4 is what writes the second one.
  if (ram.u8(a6 + 0x10e) !== 0) {
    hibachiSecondForm2A6F12(ram, rom, ctx, a5, a6);
    return;
  }

  // $2A6BA2..$2A6BC6 -- OR every armed part's flags, mask $5C: ONE hit test across the whole boss.
  let hit = 0;
  for (const p of HIBACHI_PARTS) hit |= ram.u8(a6 + p);
  hit &= 0x5c;

  if (hit === 0) {
    [0x10, 0x11, 0x12, 0x16].forEach((v, i) => ram.setU8(a6 + 0xe6 + i, v));   // $2A6BC8
    // $2A6BE0/$2A6BEC -- below $EB33 the quad becomes ONE value in all four, not four different ones.
    if (ram.u32(a5 + 0x16) < 0xeb33 && ram.u16(0x8130ca) === 0) {
      for (let i = 0; i < 4; i++) ram.setU8(a6 + 0xe6 + i, 0x19);              // $2A6BF6..
    }
    bossPhase2A6D42(ram, rom, a5, a6, ctx);                  // both arms JOIN here
    return;
  }

  // $2A6C0E.. -- clear the bits with $A3. $4C uses the identical $5C/$A3 pair: test with one, clear
  // with the other.
  for (const p of HIBACHI_PARTS) ram.setU8(a6 + p, ram.u8(a6 + p) & 0xa3);
  ram.setU16(a6 + 0x10a, hit);                               // $2A6C2E
  scoreHit(ram, ctx, a6, hit);                               // $2A6C32 -- ONCE for the boss

  // $2A6C38..$2A6C7C -- read the quad back and write it out flashed.
  //
  // **W403 CORRECTION, from `$2A6F7A`'s three-byte copy of this exact block.** The comment that
  // stood here said "the first byte is REMAPPED $19 -> $10; the other three are XORed", and the
  // code did that. The ROM does neither half of it:
  //
  //   2a6c48  0c00 0019      cmpi.b #$19,D0        the test is on D0 = ($E6,A6) ALONE
  //   2a6c4c  6610           bne.s  $2A6C5E
  //   2a6c4e  103c 0010 / 143c 0011 / 163c 0012 / 183c 0016   ...and its arm reloads ALL FOUR
  //   2a6c5e  0a00 000f      eori.b #$0F,D0        <- ($E6,A6) IS XORed, with a FOURTH constant
  //   2a6c62  1d40 00e6
  //
  // so the port was dropping `$2A6C5E` entirely and leaving ($E7)/($E8)/($E9) unreloaded on the
  // arm that reloads them. TRAP 14 exactly: the comment claimed a shape the bytes do not have.
  let q0 = ram.u8(a6 + 0xe6);                                // $2A6C38
  let q1 = ram.u8(a6 + 0xe7);                                // $2A6C3C
  let q2 = ram.u8(a6 + 0xe8);                                // $2A6C40
  let q3 = ram.u8(a6 + 0xe9);                                // $2A6C44
  if (q0 === 0x19) {                                         // $2A6C48/$2A6C4C bne $2A6C5E
    q0 = 0x10; q1 = 0x11; q2 = 0x12; q3 = 0x16;              // $2A6C4E/52/56/5A
  }
  ram.setU8(a6 + 0xe6, q0 ^ 0x0f);                           // $2A6C5E/$2A6C62
  ram.setU8(a6 + 0xe7, q1 ^ 0x0e);                           // $2A6C66/$2A6C6A
  ram.setU8(a6 + 0xe8, q2 ^ 0x0d);                           // $2A6C6E/$2A6C72
  ram.setU8(a6 + 0xe9, q3 ^ 0x09);                           // $2A6C76/$2A6C7A

  // $2A6C7E..$2A6CC6 -- the MINIMUM of the parts' $18 accumulators, then all of them re-armed.
  // W403: `$2A6C86 6F04` is `ble.s`, so the seven compares are SIGNED. This was an unsigned
  // `<`, which disagrees the moment an accumulator passes $7FFF -- and $2A6FB8 in the second
  // form is the same `6F04` over two parts instead of eight.
  let lo = i16(ram.u16(a6 + 0x18));                          // $2A6C7E move.w ($18,A6),D4
  for (const p of HIBACHI_PARTS) {                           // $2A6C82 cmp.w / $2A6C86 ble.s
    const v = i16(ram.u16(a6 + p + 0x18));
    if (lo > v) lo = v;
  }
  for (const p of HIBACHI_PARTS) ram.setU16(a6 + p + 0x18, 0x7fff);

  // $2A6CEE -- damage taken, gated, off the 32-bit pool; death is a SIGN test, as in $4C.
  const dmg = u16(0x7fff - lo);
  if (ram.u16(a6 + 0x108) === 0) {                           // $2A6CF0 -- non-zero is INVULNERABLE
    ram.setU32(a5 + 0x16, (ram.u32(a5 + 0x16) - dmg) >>> 0); // $2A6CF6
    if ((ram.u32(a5 + 0x16) & 0x80000000) !== 0) {           // $2A6CFA bpl
      // $2A6CFC -- and "death" is a DECISION. NON-zero means a player is out and the fight ENDS;
      // zero refills the pool and it continues. Reading it the other way inverts the whole fight.
      if (livePlayers2428A6(ram) !== 0) {                    // $2A6D02 tst.w D0 / bne $2A6D10
        if (ram.u16(0x813098) === 0 && ram.u16(0x80393a) === 0) {          // $2A6D10/$2A6D1A
          ram.setU32(0x81b61a, 0x00070000);                  // $2A6D24
        } else {
          scoreKill(ram, rom, ctx, 0x00070000, ram.u16(a6 + 0x10a));      // $2A6D30..$2A6D3A
        }
        bossEnding2A6D8C(ram, rom, a5, a6, ctx);             // $2A6D2E/$2A6D40 both -> $2A6D8C
        return;
      }
      ram.setU32(a5 + 0x16, 0x200);                          // $2A6D06 -- REFILL, the fight goes on
    }
  }
  bossPhase2A6D42(ram, rom, a5, a6, ctx);                    // every remaining arm JOINS here
}

export function handler2A4606(ram, rom, a5, ctx) {
  // $2A4606 -- the whole boss. $2A6B94's first block is 666 bytes ending at $2A6E2E; it opens
  // `tst.w ($106,A6) / beq` over a single `rts`, so it does nothing unless ($106,A6) is zero, and its
  // $2A4606 jsr $2A6B94 -- HIBACHI's entire behaviour. W372 ported it: all twelve callees landed
  // ($242922, $253564, $2428A6, and $243DD0 which turned out to be a third entry of
  // armScreenClearMode), the flow graph was mapped rather than assumed, and the body is written as
  // three functions because five arms converge on the phase check and two on the ending block.
  // A6 is the sub-record, exactly as the per-frame driver hands it to every other handler. It was
  // not in scope here because this handler never needed it while the body was a note().
  const a6 = ram.u32(a5 + BOSS.subRec);
  // W399: A5 AND A6 ARE LIVE ACROSS THE WHOLE FRAME ON THE BOARD, exactly as they are for the
  // stage-1 boss, and `$25962E` two lines below dispatches A4 scripts that read both --
  // `$2A5EAC move.w #$6270,($1A,A5)` and `$2A5A40 move.l ($2,A6),($2,A0)`. The port has no
  // register file, so the handler publishes both for the frame it owns and `bossA5`/`bossA6`
  // throw by address if a script is ever dispatched when nothing did. Same line, same reason,
  // as `handlerBoss292902` above; it was simply never needed while the A4 table was unported.
  ctx.bossSubRec = a6;
  ctx.bossRec = a5;
  bossBody2A6B94(ram, rom, a5, a6, ctx);

  // $2A460C -- the clear test. Carry SET means the boss is done.
  const c = runScheduler25962E(ram, rom, ctx);            // $2A460C jsr $25962E
  if (c) {                                                // $2A4612 bcc $2A4622 -- inverted here
    runStageAdvance242952(ram, rom, ctx);                 // $2A4614 jsr $242952
    freeEnemy(ram, a5);                                   // $2A461A jmp $263762
    return;
  }

  // $2A4622..$2A46AA -- ELEVEN per-part `lea (part,A6),A0 / jsr $26331C` calls and one `$25A17A`,
  // every one of them reaching a bare `rts`. TB0.partOffsets holds the eleven in ROM ORDER, which is
  // NOT ascending: $1A0 is called seventh, between $C0 and $140, and $E0/$100/$120 are never called.
  // The list is transcribed as data on TB0 so that a future reader can see the order the cartridge
  // uses; nothing is called here because there is nothing to call.
  //
  //   2a4622  lea (A6),A0      / jsr $26331C      part $0
  //   2a462a  lea ($20,A6),A0  / jsr $26331C      part $20
  //   ...                                          $40 $60 $80 $A0 $C0
  //   2a4666  lea ($1A0,A6),A0 / jsr $26331C      part $1A0  <- OUT OF ORDER
  //   2a4670  lea ($140,A6),A0 / jsr $26331C      part $140
  //   ...                                          $160 $180
  //   2a469a  moveq #$0,D3 / move.w D0,D3 / move.w #$0,D0 / move.w #$0,D1 / move.w #$2,D2
  //   2a46aa  jsr $25A17A                          also a bare rts; the register setup above is DEAD
  //   2a46b0  rts
}
