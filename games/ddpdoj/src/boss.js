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

import { u16, i16 } from './ram.js';
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

/** Every emitter this wave COUNTS instead of running, with the instruction it
 *  stands at.  Exported so a test can assert the list rather than a number. */
export const BOSS_NOTED = Object.freeze({
  0x243dd0: '$292912/$294C68/$294D4C jsr $243DD0 -- the hit-stop / screen-shake '
    + 'driver (170 instructions, no reader in the stage-end chain)',
  0x289004: '$293E3A/$293E7E/$293F8C/$29403C jsr $289004 -- the D-script-6 '
    + 'EXPLOSION allocator (the $28Axxx effect family, deferred whole since W53)',
  0x2440e0: '$293EEC jsr $2440E0 -- impact pool A, exactly where W52/W53/W54 '
    + 'left it',
  0x246410: '$293F18 / $28D770 jsr $246410 -- the ANIMATION-OBJECT loader (286 '
    + 'instructions), the presentation tier',
  0x28c392: '$293EE6 jsr $28C392 -- SOUND (the $28Cxxx family, deferred whole)',
  0x28c2c2: '$293FDC/$29411E jsr $28C2C2 -- SOUND',
  0x28c2a8: '$2940A2 jsr $28C2A8 -- SOUND',
  0x28b4be: '$29409C jsr $28B4BE -- the big-explosion emitter',
  0x242ec2: '$294082 jsr $242EC2 -- a draw off the RNG family',
  0x2938ae: '$2940F0/$29412E bsr $2938AE -- D-script 6\'s own table-driven '
    + 'explosion burst (a boss-local emitter)',
  0x23c4d0: '$294DE4 jsr $23C4D0 -- the $8039xx pause/flag block',
  0x253564: '$294DEA jsr $253564 -- the $811F8C clamp (recon 49 4: two '
    + 'absolute-long references, both inside itself)',
  0x242922: '$294DF0 jsr $242922 -- $28C170 + the two $FF intervention bytes',
  0x2599ec: '$294E62.. jsr $2599EC -- A3 stops for the parts\' own scripts',
});

const note = (ctx, a) => ctx.unportedLog?.note(a, BOSS_NOTED[a] ?? 'W62 boss');

// ---------------------------------------------------------------- $2428A6
/** `$2428A6` -- IS ANY PLAYER ALIVE?  `$10` for P1 and `+$8` for P2, and the
 *  test is "record word NEGATIVE and bit 0 CLEAR" for each.  Non-zero iff at
 *  least one is playable, which is what `$294F44` branches on. */
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
  note(ctx, 0x2599ec);
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
  note(ctx, 0x2599ec);
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
  note(ctx, 0x253564);                                 // $294DEA
  note(ctx, 0x242922);                                 // $294DF0
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
      scoreHit(ram, ctx, a6, d1);                      // $294BC8 -- A6 IS STILL
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
      scoreHit(ram, ctx, a6, d1);                      // $294CAC
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
  const d1 = ram.u16(a6 + BOSS.hitMask);               // $294C40
  scoreKill(ram, rom, ctx, 0x1000, d1);                // $294C44/$294C4A
  // $294C50 `moveq #$C,D0 / btst #4,D1 / bne / moveq #$14,D0` -- the item kind
  // is P1's hyper ($C) when the killing hit was P1's, P2's ($14) otherwise.
  // BOTH ARE THE KINDS `src/items.js` REFUSES AT THE ALLOCATOR (W61 2), so
  // `spawnItem` returns null and counts the refusal with the stock it did not
  // grant.  That refusal is what keeps this newly-reachable path off the rank
  // ledger; see docs/worklog/ddpdoj/62 5.
  const d0 = (d1 & 0x10) !== 0 ? 0x0c : 0x14;          // $294C50..$294C58
  spawnItem(ram, rom, ctx, d0, a6 + mine, 0x294c5e);   // $294C5A lea $20(A6),A6
  note(ctx, 0x243dd0);                                 // $294C68
  ram.setU16(a5 + BOSS.hitStop, 0x6e);                 // $294C6E
  if (ram.u16(a6 + BOSS.itemGate2) !== 0) {            // $294C74 tst.w $114(A6)
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
  // ---- the two emitter timers ($293E20 / $293E64), both gated on $3(a4)'s bits
  if ((ram.u8(a4 + D6.flags) & 2) !== 0) {             // $293E20 btst #$1
    if (!decByteBcc(ram, a4 + D6.tB)) {                // $293E2A subq.b/bcc
      ram.setU8(a4 + D6.tB, ram.u8(a4 + D6.tBr));      // $293E32
      note(ctx, 0x289004);                             // $293E3A + $293E4C $242B3C
    }
  }
  if ((ram.u8(a4 + D6.flags) & 1) !== 0) {             // $293E64 btst #$0
    if (!decByteBcc(ram, a4 + D6.tA)) {                // $293E6E
      ram.setU8(a4 + D6.tA, ram.u8(a4 + D6.tAr));      // $293E76
      note(ctx, 0x289004);                             // $293E7E and $293EAA -- TWO
    }
  }
  // ---- state 5 ($293ED4)
  if (st() === 5) {
    const n = u16(ram.u16(a4 + D6.wait) - 1);          // $293EDE
    ram.setU16(a4 + D6.wait, n);
    if (n === 0) {
      note(ctx, 0x28c392);                             // $293EE6
      note(ctx, 0x2440e0);                             // $293EEC
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
      note(ctx, 0x2938ae);                             // $293F66 jsr (a0) off $294134
      ram.setU16(a4 + D6.cursor14, u16(ram.u16(a4 + D6.cursor14) + 4) & 0x1f);
    }
    if (!decByteBcc(ram, a4 + D6.tC)) {                // $293F72
      ram.setU8(a4 + D6.tC, ram.u8(a4 + D6.tCr));      // $293F7A
      note(ctx, 0x289004);                             // $293F8C
      const e = u16(ram.u16(a4 + D6.cursorE) + 0x10);  // $293FB8 addi.w #$10
      ram.setU16(a4 + D6.cursorE, e);
      if (e === 0x100) {                               // $293FBE cmpi.w #$100
        ram.setU16(a4 + D6.cursorE, 0);                // $293FC8
        ram.setU8(a4 + D6.state, 4);                   // $293FCC
        fadeArm259B7E(ram, 0x12);                      // $293FD2/$293FD6
        note(ctx, 0x28c2c2);                           // $293FDC
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
        note(ctx, 0x2938ae);                           // $294016
        ram.setU16(a4 + D6.cursor14, u16(ram.u16(a4 + D6.cursor14) + 4) & 0x1f);
      }
      if (!decByteBcc(ram, a4 + D6.tC)) {              // $294022
        ram.setU8(a4 + D6.tC, ram.u8(a4 + D6.tCr));    // $29402A
        note(ctx, 0x289004);                           // $29403C
        // $294068 -- EVERY SECOND emission also fires the big one.
        const t = u16(ram.u16(a4 + D6.toggle) + 1) & 1;
        ram.setU16(a4 + D6.toggle, t);
        if (t === 0) {
          note(ctx, 0x246410);                         // $29407C
          note(ctx, 0x242ec2);                         // $294082
          note(ctx, 0x28b4be);                         // $29409C
          note(ctx, 0x28c2a8);                         // $2940A2
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
      note(ctx, 0x2938ae);                             // $2940F0
      ram.setU8(a4 + D6.state, 2);                     // $2940F4
      ram.setU16(a4 + D6.wait, 0x80);                  // $2940FA -- **NOT 32**
      ram.setU8(a4 + D6.flags, ram.u8(a4 + D6.flags) | 2);   // $294100 bset #$1
      a2Stop25994A(ram, 3);                            // $294106/$294108
    }
  }
  // ---- state 0 ($29410E)
  if (st() === 0) {
    ram.setU8(a4 + D6.state, 1);                       // $294118
    note(ctx, 0x28c2c2);                               // $29411E
    note(ctx, 0x2938ae);                               // $29412E
  }
  void rom;
}


// ============================================== A3 SCRIPTS 4 AND 5 -- THE PARTS
//
// `$294E88 moveq #$4 / jmp $259962` and `$294EDE moveq #$5` start these, so
// `$294DD4` arms THREE A3 scripts, not one, and a port that registered only
// D-script 6 stops on the very frame the boss dies.  They are the two side
// parts falling off the bottom of the screen.
//
// **BOTH OF THEM CARRY A LARGE BLOCK OF EMITTER CODE THAT CANNOT RUN**, and for
// two different reasons, which is worth writing down because they read as the
// same routine:
//
//   * script 4's step BEGINS `$293970 bra.w $293A44`, jumping OVER
//     `$293974..$293A42` -- three `$3(a4)`-gated spark bursts -- to the state
//     machine.  Nothing branches back.  Sixty-nine instructions of dead code.
//   * script 5's step has no such jump and reaches the same three blocks, but
//     each is `btst.b #$n,$3(a4) / beq`, `$293B88 move.b #$0,$3(a4)` is the
//     init, and NOTHING in either script sets a bit of `$3(a4)`.  So they are
//     gated shut instead of jumped over.
//
// Their state machines are identical up to the field offsets: state 0 arms,
// state 1 walks the part down by `$800` a tick until its Y goes negative, state
// 2 emits once and `clr.w (a4)` RETIRES THE SLOT.

const PART = {   // the two parts' sub-record fields
  4: { pos: 0x22, scrollY: 0x24, fallX: 0x46, fallY: 0x48, stopId: 0 },
  5: { pos: 0x62, scrollY: 0x64, fallX: 0x86, fallY: 0x88, stopId: 1 },
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

function partScriptStep(ram, ctx, a4, a6, id) {
  const f = PART[id];
  ram.setU16(a6 + f.scrollY, u16(ram.u16(a6 + f.scrollY)
    - ram.u16(0x813176)));                             // $293966/$29396C
  if (ram.u8(a4 + 0x02) === 2) {                       // $293A44 / $293C88
    note(ctx, 0x28c2a8);                               // $293A4E
    note(ctx, 0x2938ae);                               // $293A5E bsr $2938F2
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
    note(ctx, 0x28c2c2);                               // $293AD0
    note(ctx, 0x2938ae);                               // $293AE0 bsr $2938AE
  }
  ram.setU16(a6 + f.pos, u16(ram.u16(a6 + f.pos)
    - ram.u16(a4 + 0x0c)));                            // $293AE4/$293AE8
}

function bossA6(ctx, addr) {
  if (ctx.bossSubRec === undefined || ctx.bossSubRec === null) {
    unreached(addr, 'a boss A3 part script was dispatched with no A6 published '
      + 'by $292902 -- the scheduler ran outside the boss handler\'s frame');
  }
  return ctx.bossSubRec;
}

registerScript(0x29393a, (ram, rom, ctx, a4) => partScriptInit(ram, a4));
registerScript(0x293966, (ram, rom, ctx, a4) =>
  partScriptStep(ram, ctx, a4, bossA6(ctx, 0x293966), 4));
registerScript(0x293b82, (ram, rom, ctx, a4) => partScriptInit(ram, a4));
registerScript(0x293bae, (ram, rom, ctx, a4) =>
  partScriptStep(ram, ctx, a4, bossA6(ctx, 0x293bae), 5));


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
