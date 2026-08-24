// HIBACHI'S A2 OBJECTS 0..15, A0 ARRIVAL POSITION, A4 SCRIPT 0 AND ENDING SCRIPTS 1..6.
// W399, W403, W409, W552, W553, W555, W556, W557, W558, W559, W560, W561, W574, W575, W576.
//
// ============================================================================
// WHAT THIS FILE IS
// ============================================================================
// `$2A5D28` and `$2A61E0` are the last two unported `jsr $261100` sites inside the boss ROM.
// They are NOT enemy handlers: they are A4 SCRIPTS of HIBACHI, dispatched through
// `$2596C6`'s five-slot A4 walk off the table `$2A5886` that `src/initbody.js`'s `$2A42DC`
// body already installs.  `src/boss.js` has called `a4Start25980C(ram, 1)` from
// `bossEnding2A6D8C` (`$2A6E20`, a tail `jmp`) since W372 -- so the ENTRY to this chain has
// been live and every one of its links threw by address.  This file is those links.
//
// THE CHAIN, and every arrow is a `jsr $25980C` read out of the image:
//
//   $2A6E20  ending block      -> A4 1   (init $2A5A1C, step $2A5A28)
//   $2A5CB6  script 1, arm A   -> A4 $14 (init $2A6B7A, step $2A6B80)  the FIRST-LOOP exit
//   $2A5D30  script 1, arm B   -> A4 2   (init $2A5EA0, step $2A5EB8)  after PUSH $0010
//   $2A5F82  script 2          -> A4 $A  (init $2A689C, step $2A68A2)  COUNTED, not ported
//   $2A7076  phase-2 death     -> A4 3   (init $2A5F8E, step $2A5FA2)
//   $2A61E8  script 3          -> A4 4   (init $2A62FA, step $2A6312)  W403 ports it
//   $2A728C  phase B's death   -> A4 5   (init $2A6418, step $2A6458)  W409 ports it
//
// W409: the last line is the SECOND ending.  `$2A6466 jsr $2595E8` is A4 script 5's own
// suspend, so script 1's fork has an ending on BOTH arms -- $14 on the first-loop arm and
// this one on the other -- and the run no longer stops anywhere in the chain.
//
// ============================================================================
// THE PUSH IS NOT ON THE FIRST-LOOP PATH, AND THE BRIEF FOR THIS WAVE SAID IT WAS
// ============================================================================
// Script 1's one-shot block ends in a TWO-TEST fork whose arms are exclusive:
//
//   2a5c7a  4a79 00813098   tst.w $813098   / 2a5c80  6600 0092  bne $2a5d14
//   2a5c84  4a79 0080393a   tst.w $80393A   / 2a5c8a  6600 0088  bne $2a5d14
//
// Falling past BOTH -- loop 1 with `$80393A` clear, the ordinary first credit -- takes
// `$2A5C8E`: a sound, `$259924` (stop every A2 object), twenty-one `$289B22` pool-C spawns,
// and `a4Start($14)`.  A4 $14 is `$2A6B7A`: wait $80 frames, `jsr $2595E8`, and the stage
// SUSPENDS -- `handler2A4606`'s `bcc` then takes `$242952` and the game advances.  **No
// speed push happens on that path at all, and none is needed: the stage ends.**
//
// `$2A5D28` is the OTHER arm.  It runs when `$813098` (the loop word) or `$80393A` is
// non-zero, and it is the arm that keeps playing: push `$0010` into the background object
// and hand over to A4 2, which arms HIBACHI's SECOND FORM (`($10E,A6) := 1` at `$2A5F40`,
// which is exactly the byte `$2A6BA0 bne.w $2A6F12` tests).  `$2A61E0`'s `$0200` push is
// three scripts further on, after that second form dies.
//
// ============================================================================
// WHAT THE PUSH IS FOR -- THE STAGE-5 SCROLL PARK
// ============================================================================
// Internal stage 4's background script parks the scroll on its own record:
//
//   $261E88  t=$0346  op $08 SPEED $0000
//
// and the clock is driven BY the scroll (`$26131A cmpi.w #$200` on an accumulator fed by
// `($1C,A5)`), so nothing inside the VM can ever release it -- W398 measured 20,000 frames
// stuck at column 224 of 252.  The records the park hides are an ACCELERATION RAMP:
// $0347 $0010, $0348 $0015, $0349 $0020, $034A $0040, $034C $0080, $034E $00C0, $0350 $0100,
// and `$0010` is the value `$2A5D20`/`$2A5D24` load.  The boss's death is the release.
//
// ============================================================================
// 504 BYTES OF SCRIPT 3'S STEP ARE JUMPED OVER
// ============================================================================
// `$2A5FD0 6000 01fa` is an UNCONDITIONAL `bra` from $2A5FD2 + $1FA = $2A61CC, and the nine
// `$289004` allocations at `$2A5FD4..$2A61CB` are its shadow.  No `jsr`, no `jmp` and no
// Bcc anywhere in $2A2000..$2A9000 targets a byte of that block, so it is not "the arm this
// port does not take" -- it is unreachable code, and the port transcribes the `bra` rather
// than the block.  (TRAP 20 in a new shape: not a routine with zero callers, a BLOCK with
// zero entries.)
//
// ============================================================================
// TWO NEARLY-IDENTICAL PER-FRAME EMITTERS THAT DIFFER IN TWO PLACES
// ============================================================================
// `$2A5D3A` (script 1) and `$2A61F2` (script 3) are the same eleven-call shape off the same
// eight-word kind table `$2A5DC8`, and they are NOT the same routine:
//
//   $2A5DA6  jsr $24328E / move.w D0,D1 / asr.w #1,D1 / add.w D1,D0 / addi.w #-$800,D0
//   $2A625C  jsr $24328E / move.w D0,D1 /                            addi.w #-$800,D0
//
// Script 1 biases ($26,A0) by x + (x >> 1) - $800; script 3 by x - $800, and its `move.w
// D0,D1` is a DEAD STORE (TRAP 22 -- transcribed, not tidied).  Sharing one helper between
// them would be a 1.5x error on half the explosions, so they are written twice.
// `src/stage4type9f.js`'s `randomDeathEffect` is a THIRD sibling of the same shape with a
// third arithmetic (x * 1.75) and its own table `$27C808`.
//
// ============================================================================
// WHAT IS COUNTED RATHER THAN RUN
// ============================================================================
// `HIBACHI_END_NOTED` below, and every entry says which instruction it stands at.  The two
// that matter: `$289B22` (pool C's third allocator, only `$289AF4`/`$289B50` are ported) on
// the first-loop arm, and `$23C4D0` -- which `src/boss.js` has noted since W357 and
// `tests/w382stalenotes.test.js` asserts, so it stays a note here for consistency rather
// than being ported behind that test's back.

import { u16, i16 } from './ram.js';
import {
  registerScript, a4Start25980C, a2Stop25994A, a2Run2598E6, a2StopAll259924,
  a1Start259A18, a1Running259A4A, seqStart2598D0, seqStop2598BE, a3Start259962,
  suspend2595E8, fadeArm259B7E, fadeDone259B9E,
} from './scheduler.js';
import { pushExternalSpeed } from './background.js';
import { applyVelocityA6, scrollCompensate } from './movement.js';
import { loadAnimObjects246410, loadAnimObjects246520 } from './animobjects.js';
import { install24150A } from './palette.js';
import { spawnEffect, clearEffectPool, B } from './effects.js';
import {
  drawNegative242EC2, drawWord242EC2, drawByte2431F4, drawWord24328E, drawByte242B3C,
  drawByte242E24,
} from './rng.js';
import { finalBlast2440E0 } from './boss2.js';
import { finalBurst27CBB6 } from './stage4type9f.js';
import { bossA5, bossA6, bigBurst28B34A } from './boss.js';
import { enqueueRegistersThroughStub } from './spritequeue.js';
import { AimTables, aim64, slew64, slew64FromRecord, targetSelect } from './aim.js';

/** `$2A432E` installs this nineteen-object A2 list. Object 0 is armed immediately by
 *  `$2A4336 jsr $2598E6`; its six-frame art selector is advanced by A3 script 1. */
export const HIBACHI_A2 = Object.freeze({
  table: 0x2a46b2,
  objects: 19,
  object0: 0x2a4702,
  object0CodeEnd: 0x2a4772,
  object0Art: 0x2a4774,
  object0ArtFrames: 6,
  object1: 0x2a478c,
  object1CodeEnd: 0x2a47d4,
  object1Art: 0x00116768,
  object2: 0x2a47d6,
  object2CodeEnd: 0x2a4814,
  object2Art: 0x00101728,
  object3: 0x2a4816,
  object3CodeEnd: 0x2a4864,
  object3Art: 0x2a49f6,
  object3ArtFrames: 64,
  object4: 0x2a4866,
  object4CodeEnd: 0x2a48b4,
  object5: 0x2a48b6,
  object5CodeEnd: 0x2a4904,
  object6: 0x2a4906,
  object6CodeEnd: 0x2a4954,
  object7: 0x2a4956,
  object7CodeEnd: 0x2a49a4,
  object8: 0x2a49a6,
  object8CodeEnd: 0x2a49f4,
  object9: 0x2a4af6,
  object9CodeEnd: 0x2a4b3e,
  object9Art: 0x2a4b40,
  object9ArtFrames: 6,
  object10: 0x2a4c42,
  object10CodeEnd: 0x2a4c6a,
  object10Table: 0x2a4c6c,
  object10Rows: 24,
  object10Stride: 6,
  object11: 0x2a4b58,
  object11CodeEnd: 0x2a4b9e,
  object12: 0x2a4bc8,
  object12CodeEnd: 0x2a4c06,
  object13: 0x2a4ba0,
  object13CodeEnd: 0x2a4bc6,
  object14: 0x2a4c08,
  object14CodeEnd: 0x2a4c34,
  object14Art: 0x2a4c36,
  object14ArtFrames: 3,
  object15: 0x2a4af6,
  object16: 0x2a4cfc,
  object17: 0x2a4d5e,
  object18: 0x2a4de0,
});

/** `$2A4300` installs this main-sequencer table. It contains twelve init/step pairs;
 *  A4 script 0 starts id 0 on Hibachi's first scheduler frame. */
export const HIBACHI_A0 = Object.freeze({
  table: 0x2a4e56,
  pairs: 12,
  s0Init: 0x2a4f56,
  s0Step: 0x2a4f86,
  s1Init: 0x2a4f90,
  s1Step: 0x2a4fae,
  s1End: 0x2a5054,
  s1Next: 2,
  s1A3: Object.freeze([3, 4]),
  s1A2: Object.freeze([0x0a, 0x0e]),
  s2Init: 0x2a5054,
  s2Step: 0x2a506c,
  s2End: 0x2a50d0,
});

/** `$2A4312` installs this A3 scheduler table. It contains eight init/step pairs. */
export const HIBACHI_A3 = Object.freeze({
  table: 0x2a5492,
  pairs: 8,
  s0Init: 0x2a54d6, s0Step: 0x2a54e2, s0Selector: 0x0126,
  s1Init: 0x2a5502, s1Step: 0x2a550e, s1Selector: 0x0128,
  s2Init: 0x2a552e, s2Step: 0x2a5534,
  s3Init: 0x2a56a2, s3Step: 0x2a56ae, s3End: 0x2a56ce, s3Selector: 0x012a,
  s4Init: 0x2a56ce, s4Step: 0x2a56da, s4End: 0x2a56fa, s4Selector: 0x012c,
});

/** Every address in this file's flow that is real ROM data or a real ROM entry point, so a
 *  test can assert the map instead of a prose claim. */
export const HIBACHI_A4 = Object.freeze({
  table: 0x2a5886,                 // $2A4318 lea $2A5886,A4 -> $2A432E jsr $259554
  pairs: 21,                       // $2A5886 + 21*8 = $2A592E = entry [0].init, the table's end
  endScript: 1,                    // $2A6E20 jmp $25980C with D0 = 1
  s0Init: 0x2a592e, s0Step: 0x2a597c,       // W552 -- the opening script $2A4384 starts
  s0Frames: 0x0260, s0Hold: 0x0160, s0Next: 6,
  s1Init: 0x2a5a1c, s1Step: 0x2a5a28,
  s2Init: 0x2a5ea0, s2Step: 0x2a5eb8,
  s3Init: 0x2a5f8e, s3Step: 0x2a5fa2,
  s4Init: 0x2a62fa, s4Step: 0x2a6312,       // W403 -- the $11E bytes W399 counted
  s5Init: 0x2a6418, s5Step: 0x2a6458,       // W409 -- the $3AA W408 counted
  s6Init: 0x2a67c2, s6Step: 0x2a67d2,       // W561 -- opening attack handoff
  s7Init: 0x2a67e8, s7Step: 0x2a67ee,       // W562 -- gun 1 handoff
  s8Init: 0x2a6820, s8Step: 0x2a6826,       // W563 -- gun 2 handoff
  s9Init: 0x2a6858, s9Step: 0x2a6864,       // W564 -- gun 3 handoff
  sEInit: 0x2a69d0, sEStep: 0x2a6a00,       // W565 -- live HP interrupt and gun 4
  s14Init: 0x2a6b7a, s14Step: 0x2a6b80,     // W420 -- $18 of code, NOT the $1A counted
  // A4 5's own data, all four bases named by a `lea` that is decoded rather than assumed
  s5Emit: 0x2a6688, s5EmitRows: 16, s5EmitStride: 8,   // $2A657E and $2A6628, the SAME base
  s5EmitWrap: 0x0080,                       // $2A65CC / $2A6662 cmpi.w #$80,($8,A4)
  s5Anim410: 0x2a670a, s5Anim410Count: 6,   // $2A64BA lea, TRAP 4: $2A64BC + $24E
  s5Anim520: 0x2a676e, s5Anim520Count: 2,   // $2A6428 lea, TRAP 4: $2A642A + $344
  animNoFillStride: 12,                     // $246520's entry: family.w cur.w tgt.l n.w t.w
  s5DeadRow: 0x2a6760,                      // a SEVENTH $246410 record the count of 6 never reads
  s5Suspend: 0x2a6466,                      // jsr $2595E8 -- the SECOND site, not A4 $14's
  s5WhiteBank: 0x0e, s5WhiteSrc: 0x246bf8,  // $2A6418 moveq-shaped move.w #$E,D0 / $2A641C lea
  s0Anim: 0x2a6788, s0AnimCount: 4,          // $2A5A04 lea; 2 + 4*14 = $3A, ending at A4 6
  // the DATA the three of them read
  poolCTable: 0x2a5cc0, poolCRows: 21,      // $2A5C9A moveq #$14,D7 + dbra -- TRAP 2, N+1
  kindTable: 0x2a5dc8, kindEntries: 8,      // $2A5D62 andi.w #$7,D0 / $2A5D66 add.w D0,D0
  s1Anim: 0x2a5dda, s1AnimCount: 14,        // $2A5C6E lea, TRAP 4: $2A5C70 + $16A
  s3Anim: 0x2a627a, s3AnimCount: 9,         // $2A61CC lea, TRAP 4: $2A61CE + $AC
  animStride: 14,                           // $246410's entry: fill.w family.w cur.w tgt.l n.w t.w
  // the two pushes
  push1At: 0x2a5d28, push1Speed: 0x0010,
  push2At: 0x2a61e0, push2Speed: 0x0200,
  // the fork
  forkLoopWord: 0x813098, forkFlag: 0x80393a,
  freeze: 0x8130d4,
  firstLoopExit: 0x14,                      // $2A5CB4 moveq #$14 -> A4 $14 -> $2595E8 SUSPEND
  // script 3's shadow
  deadBlockFrom: 0x2a5fd4, deadBlockTo: 0x2a61cc,
});

/** Counted, not run.  Address -> the instruction that stands there. */
export const HIBACHI_END_NOTED = Object.freeze({
  0x289b22: '$2A5CAA jsr $289B22 -- pool C\'s THIRD allocator, twenty-one times off the '
    + '$2A5CC0 longword table. src/effects.js ports $289AF4 and $289B50; this one is a '
    + 'different entry and only the first-loop arm reaches it',
  0x23c4d0: '$2A5946/$2A5F66/$2A63F4 jsr $23C4D0 -- the $8039xx pause/flag block. It is '
    + '`clr.w $803934 / move.w #$1,$803936 / rts`, but src/boss.js has counted it since W357 '
    + 'and tests/w382stalenotes.test.js asserts that note, so it stays counted here too',
  0x24150a: '$2A6422 jsr $24150A -- A4 script 5\'s bank $E <- $246BF8 (32 x $7FFF, WHITE). '
    + 'RUN when ctx.palette is present and counted when it is not, exactly as '
    + 'src/background.js and src/bossarrival.js do at their own $24150A sites',
});

const note = (ctx, a) => (ctx.unported ?? ctx.unportedLog)?.note(a, HIBACHI_END_NOTED[a]
  ?? 'W399 HIBACHI ending');

// ---------------------------------------------------------------- the $8039xx setters
// Five three-instruction routines at $23C4A0/B0/C0/D0/E0, read out of the image this wave.
// `$23C4C0` has no caller here and is not written.
export const shakeMode23C4A0 = (ram) => {                       // $23C4A0
  ram.setU16(0x803934, 1);
  ram.setU16(0x803936, 0);
};
const shakeMode23C4B0 = (ram) => {                       // $23C4B0
  ram.setU16(0x803934, 6);
  ram.setU16(0x803936, 0);
};
const shakeOff23C4E0 = (ram) => { ram.setU16(0x803934, 0); };   // $23C4E0 -- ONE store, no $803936

/** `$260E36` -- arm screen-shake mode 1 and zero its cursor and both offsets. The same four
 *  stores `src/boss2.js`'s `finalBlast2440E0` ends with; written out here because script 1
 *  reaches `$260E36` on its own, without `$2440E0`. */
function shakeStart260E36(ram) {
  ram.setU16(0x813186, 1);                               // $260E36
  ram.setU16(0x813188, 0);                               // $260E3E
  ram.setU16(0x80b054, 0);                               // $260E46
  ram.setU16(0x80b056, 0);                               // $260E4E
}

/** One `$289004` allocation plus its field writes, in the ROM's order. `nudgeLo`, `speed`
 *  and `delay` are `null` where the block does not write them -- the FIRST of script 1's
 *  nine writes only four fields and a loop over a uniform row would invent three stores. */
function emit(ram, ctx, kind, pos, site, nudgeHi, nudgeLo, speed, sub12, sub14, delay) {
  const a0 = spawnEffect(ram, ctx, kind, site);          // $289004
  ram.setU32(a0 + B.pos, pos);                           // move.l ($2,A6),($2,A0)
  ram.setU16(a0 + B.bucket, 0x0010);                     // move.w #$10,($1E,A0)
  ram.setU16(a0 + B.nudge, nudgeHi);                     // move.w #...,($26,A0)
  if (nudgeLo !== null) ram.setU16(a0 + B.nudge + 2, nudgeLo);    // ($28,A0)
  if (speed !== null) ram.setU16(a0 + B.speed, speed);   // ($1A,A0)
  ram.setU16(a0 + B.sub12, sub12);                       // ($12,A0)
  ram.setU16(a0 + B.sub14, sub14);                       // ($14,A0)
  if (delay !== null) ram.setU16(a0 + B.delay, delay);   // ($18,A0)
  return a0;
}

/** Script 1's nine, `$2A5A36..$2A5C2C`, in the order the block writes them.  Rows are
 *  [kind, site, nudgeHi, nudgeLo, speed, sub12, sub14, delay]. */
const S1_ROWS = Object.freeze([
  [0x0d, 0x2a5a3a, 0x1400, null, null, 0x0000, 0x0400, null],
  [0x85, 0x2a5a62, 0x1400, 0x0600, 0x0658, 0x0000, 0x0000, 0x0002],
  [0x0d, 0x2a5a9c, 0x0c00, 0xfe00, 0x06a8, 0x0000, 0x0000, 0x0002],
  [0x85, 0x2a5ad6, 0x0400, 0xfc00, 0x0a88, 0x0000, 0x0400, 0x0006],
  [0x0d, 0x2a5b10, 0x0600, 0x0400, 0x0a78, 0x0000, 0x0400, 0x0004],
  [0x85, 0x2a5b4a, 0xf600, 0x0a00, 0x0a70, 0x0000, 0x0400, 0x000a],
  [0x0d, 0x2a5b84, 0xf000, 0xfe00, 0x0588, 0x0000, 0x0400, 0x0008],
  [0x85, 0x2a5bbe, 0xe000, 0xfc00, 0x04a0, 0x0000, 0x0400, 0x0008],
  [0x0d, 0x2a5bf8, 0xd800, 0x0400, 0x0460, 0x0000, 0x0400, 0x0008],
]);

/** `$2A5D3A` -- script 1's per-frame explosion.  `subq.b` + `bcc` is the UNDERFLOW
 *  convention, so the reload at `($5,A4)` lands on the frame AFTER the counter passes zero.
 *  `($4,A4)` and `($5,A4)` are the two halves of the init's ONE `move.w #$0303` (TRAP 3). */
function frameBurst2A5D3A(ram, rom, ctx, a4, a6) {
  const c = ram.u8(a4 + 0x04);
  ram.setU8(a4 + 0x04, u16(c - 1) & 0xff);               // $2A5D3A subq.b #1,($4,A4)
  if (c !== 0) return;                                   // $2A5D3E bcc -> the rts
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));               // $2A5D40 move.b ($5,A4),($4,A4)
  // $2A5D46/$2A5D4C/$2A5D52/$2A5D54/$2A5D5A -- A0 is $28C274 unless the draw is NEGATIVE.
  // W416/D48: NEGATIVE means bit 7 of the byte $242ED6 loaded, not bit 15 of the word.
  ctx.soundPost?.(drawNegative242EC2(ram, rom) ? 0x28c28e : 0x28c274);
  const kind = rom.u16(HIBACHI_A4.kindTable
    + (drawWord242EC2(ram, rom) & 7) * 2);               // $2A5D5C..$2A5D6E
  const a0 = spawnEffect(ram, ctx, kind, 0x2a5d72);      // $2A5D72 jsr $289004
  ram.setU32(a0 + B.pos, ram.u32(a6 + 0x02));            // $2A5D78
  ram.setU16(a0 + B.bucket, 0x0010);                     // $2A5D7E
  ram.setU16(a0 + B.sub12, 0);                           // $2A5D84
  ram.setU16(a0 + B.sub14, 0x0800);                      // $2A5D8A
  ram.setU8(a0 + B.speed, u16(drawByte2431F4(ram, rom) + 3) & 0xff);   // $2A5D90/$2A5D96/$2A5D98
  ram.setU8(a0 + B.angle, drawWord242EC2(ram, rom) & 0xff);            // $2A5D9C/$2A5DA2
  // $2A5DA6..$2A5DB6 -- x + (x >> 1) - $800. `asr.w #1` is ARITHMETIC, so a negative draw
  // halves toward minus infinity; `>> 1` on the sign-extended value is that.
  const x = i16(drawWord24328E(ram, rom));
  ram.setU16(a0 + B.nudge, u16(x + (x >> 1) - 0x800));
  // $2A5DBA..$2A5DC2 -- y >> 1, and NOTHING added. Script 3's copy differs here too.
  ram.setU16(a0 + B.nudge + 2, u16(i16(drawWord24328E(ram, rom)) >> 1));
}

/** `$2A61F2` -- script 3's per-frame explosion. Same eleven calls, TWO different lines. */
function frameBurst2A61F2(ram, rom, ctx, a4, a6) {
  const c = ram.u8(a4 + 0x04);
  ram.setU8(a4 + 0x04, u16(c - 1) & 0xff);               // $2A61F2 subq.b #1,($4,A4)
  if (c !== 0) return;                                   // $2A61F6 bcc -> the rts
  ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));               // $2A61F8
  // $2A61FE/$2A6204/$2A620A/$2A620C/$2A6212 -- script 1's fork, one instruction for one.
  ctx.soundPost?.(drawNegative242EC2(ram, rom) ? 0x28c28e : 0x28c274);
  const kind = rom.u16(HIBACHI_A4.kindTable
    + (drawWord242EC2(ram, rom) & 7) * 2);               // $2A6214..$2A6224
  const a0 = spawnEffect(ram, ctx, kind, 0x2a6228);      // $2A6228 jsr $289004
  ram.setU32(a0 + B.pos, ram.u32(a6 + 0x02));            // $2A622E
  ram.setU16(a0 + B.bucket, 0x0010);                     // $2A6234
  ram.setU16(a0 + B.sub12, 0);                           // $2A623A
  ram.setU16(a0 + B.sub14, 0x0800);                      // $2A6240
  ram.setU8(a0 + B.speed, u16(drawByte2431F4(ram, rom) + 3) & 0xff);   // $2A6246/$2A624C/$2A624E
  ram.setU8(a0 + B.angle, drawWord242EC2(ram, rom) & 0xff);            // $2A6252/$2A6258
  // $2A625C..$2A6268 -- x - $800. `move.w D0,D1` at $2A6262 writes D1 and NOTHING reads it
  // again: a dead store, kept as a comment rather than as JavaScript that does nothing.
  ram.setU16(a0 + B.nudge, u16(i16(drawWord24328E(ram, rom)) - 0x800));
  ram.setU16(a0 + B.nudge + 2, u16(i16(drawWord24328E(ram, rom)) >> 1));  // $2A626C..$2A6274
}

// ========================================================== A2 OBJECT 0 -- THE ROOT BODY
// `$2A4702..$2A4771` is straight-line code ending in a tail `jmp $23DFEA`.
// `$2A4772` is alignment and `$2A4774..$2A478B` is the six-longword art table.

/** `$2A4702`. Orbit four attached points around the root and enqueue the selected body art. */
export function a2Object0_2A4702(ram, rom, ctx) {
  const a6 = bossA6(ctx, HIBACHI_A2.object0);
  const angle = ram.u8(a6 + 0x13d);
  const { dy } = ctx.tables.shotVector(0x1a, angle);       // $2A4702..$2A470C jsr $241D34
  ram.setU8(a6 + 0x13d, (angle + 2) & 0xff);              // $2A4712 addq.b #2

  ram.setU16(a6 + 0x010, u16(0x1400 + dy));               // $2A4716..$2A471C
  ram.setU16(a6 + 0x012, u16(0x2200 - dy));               // $2A4720..$2A4726
  ram.setU16(a6 + 0x1b0, u16(0xde00 + dy));               // $2A472A..$2A4730
  ram.setU16(a6 + 0x1b2, u16(0x2600 - dy));               // $2A4734..$2A473A

  // The two cartridge additions are LONG operations. Carry from the low position
  // word into the high word is observable and must not be split into word adds.
  let d1 = ((u16(ram.u16(a6 + 0x02) + dy) << 16) | ram.u16(a6 + 0x04)) >>> 0;
  d1 = (d1 + 0xe6000000) >>> 0;                            // $2A474A
  d1 = (d1 + 0xea00f200) >>> 0;                            // $2A4750

  const art = rom.u32(HIBACHI_A2.object0Art + i16(ram.u16(a6 + 0x128)));
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1, art, 0x1670, ram.u8(a6 + 0xe8));
}

// ========================================================== A2 OBJECT 1 -- THE LOWER BODY
// `$2A478C..$2A47D3` is straight-line code ending in a tail `jmp $23DFEA`.
// `$2A47D4` is alignment and object 2 starts at `$2A47D6`.

/** `$2A478C`. Save the root vector and enqueue the lower body at its orbit position. */
export function a2Object1_2A478C(ram, rom, ctx) {
  const a6 = bossA6(ctx, HIBACHI_A2.object1);
  const angle = ram.u8(a6 + 0x1b);
  const { dy } = ctx.tables.shotVector(ram.u8(a6 + 0x1a), angle);
  ram.setU16(a6 + 0x1fa, u16(dy));                          // $2A479E
  ram.setU8(a6 + 0x1b, (angle + 2) & 0xff);                // $2A47A2

  // `$2A47B2/$2A47B8` are long additions, including low-word carry.
  let d1 = ((u16(ram.u16(a6 + 0x02) + dy) << 16) | ram.u16(a6 + 0x04)) >>> 0;
  d1 = (d1 + 0xfc000000) >>> 0;
  d1 = (d1 + 0xe000dc00) >>> 0;
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1,
    HIBACHI_A2.object1Art, 0x2120, ram.u8(a6 + 0xe7));
}

// ========================================================== A2 OBJECT 2 -- THE UPPER BODY
// `$2A47D6..$2A4813` is straight-line code ending in a tail `jmp $23DFEA`.
// `$2A4814` is alignment and object 3 starts at `$2A4816`.

/** `$2A47D6`. Enqueue the fixed upper body at the root's orbit position. */
export function a2Object2_2A47D6(ram, rom, ctx) {
  const a6 = bossA6(ctx, HIBACHI_A2.object2);
  const { dy } = ctx.tables.shotVector(0x1a, ram.u8(a6 + 0x13d));

  // `$2A47F2/$2A47F8` are long additions, including low-word carry.
  let d1 = ((u16(ram.u16(a6 + 0x02) + dy) << 16) | ram.u16(a6 + 0x04)) >>> 0;
  d1 = (d1 + 0xd0000000) >>> 0;
  d1 = (d1 + 0xf400f900) >>> 0;
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1,
    HIBACHI_A2.object2Art, 0x0c38, ram.u8(a6 + 0xe8));
}

// ========================================================== A2 OBJECT 3 -- LEFT OUTER PART
// `$2A4816..$2A4863` is straight-line code ending in a tail `jmp $23DFEA`.
// `$2A4864` is alignment and object 4 starts at `$2A4866`.

/** `$2A4816`. Update the left attachment offsets and enqueue its selected frame. */
export function a2Object3_2A4816(ram, rom, ctx) {
  const a6 = bossA6(ctx, HIBACHI_A2.object3);
  const vector = ram.u16(a6 + 0x1fa);
  ram.setU16(a6 + 0x070, u16(0x0a00 + vector));
  ram.setU16(a6 + 0x072, u16(0x0600 - vector));

  // The two `add.w D2,D2` instructions wrap before the signed word index is extended.
  const artOffset = i16(u16(ram.u16(a6 + 0x07a) * 4));
  const art = rom.u32(HIBACHI_A2.object3Art + artOffset);

  // `$2A484E` is a long addition, including carry from X into Y.
  let d1 = ((u16(ram.u16(a6 + 0x062) + vector) << 16) | ram.u16(a6 + 0x064)) >>> 0;
  d1 = (d1 + ram.u32(a6 + 0x066)) >>> 0;
  const d4 = (ram.u16(a6 + 0x07c) & 0xff00) | ram.u8(a6 + 0x0e9);
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1, art,
    ram.u16(a6 + 0x06e), d4);
}

// ============================================= A2 OBJECTS 4..8 -- THE SHARED PARTS
// Each routine is exactly $50 bytes including its trailing alignment nop. They differ only in
// which attached record they read and write, and all five index the same 64-longword art table.

function a2SharedPart(ram, rom, ctx, entryAddress, part) {
  const a6 = bossA6(ctx, entryAddress);
  const vector = ram.u16(a6 + 0x1fa);
  ram.setU16(a6 + part + 0x10, u16(0x0a00 + vector));
  ram.setU16(a6 + part + 0x12, u16(0x0600 - vector));

  // The two `add.w D2,D2` instructions wrap before the signed word index is extended.
  const artOffset = i16(u16(ram.u16(a6 + part + 0x1a) * 4));
  const art = rom.u32(HIBACHI_A2.object3Art + artOffset);

  // The record offset is added as a long, including carry from X into Y.
  let d1 = ((u16(ram.u16(a6 + part + 0x02) + vector) << 16)
    | ram.u16(a6 + part + 0x04)) >>> 0;
  d1 = (d1 + ram.u32(a6 + part + 0x06)) >>> 0;
  const d4 = (ram.u16(a6 + part + 0x1c) & 0xff00) | ram.u8(a6 + 0x0e9);
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1, art,
    ram.u16(a6 + part + 0x0e), d4);
}

/** `$2A4866`. Update and enqueue attached record `$40`. */
export function a2Object4_2A4866(ram, rom, ctx) {
  a2SharedPart(ram, rom, ctx, HIBACHI_A2.object4, 0x040);
}

/** `$2A48B6`. Update and enqueue attached record `$20`. */
export function a2Object5_2A48B6(ram, rom, ctx) {
  a2SharedPart(ram, rom, ctx, HIBACHI_A2.object5, 0x020);
}

/** `$2A4906`. Update and enqueue attached record `$C0`. */
export function a2Object6_2A4906(ram, rom, ctx) {
  a2SharedPart(ram, rom, ctx, HIBACHI_A2.object6, 0x0c0);
}

/** `$2A4956`. Update and enqueue attached record `$A0`. */
export function a2Object7_2A4956(ram, rom, ctx) {
  a2SharedPart(ram, rom, ctx, HIBACHI_A2.object7, 0x0a0);
}

/** `$2A49A6`. Update and enqueue attached record `$80`. */
export function a2Object8_2A49A6(ram, rom, ctx) {
  a2SharedPart(ram, rom, ctx, HIBACHI_A2.object8, 0x080);
}

// =========================================== A2 OBJECTS 9 THROUGH 15
// IDs 9 and 15 point to the same routine. IDs 16 through 18 index separate
// cartridge data that remains outside the exported ROM windows.

/** Shared orbit-vector and long-position arithmetic for the three new orbiting parts. */
function a2OrbitPart(ram, rom, ctx, spec) {
  const a6 = bossA6(ctx, spec.entry);
  const angle = ram.u8(a6 + spec.angleAt);
  const { dy } = ctx.tables.shotVector(spec.radius, angle);
  if (spec.angleStep !== 0) {
    ram.setU8(a6 + spec.angleAt, (angle + spec.angleStep) & 0xff);
  }

  let d1 = ((u16(ram.u16(a6 + 0x02) + dy) << 16) | ram.u16(a6 + 0x04)) >>> 0;
  d1 = (d1 + spec.bias1) >>> 0;
  d1 = (d1 + spec.bias2) >>> 0;
  const art = spec.artAt === null
    ? spec.art
    : rom.u32(spec.art + i16(ram.u16(a6 + spec.artAt)));
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1, art,
    spec.d3, ram.u8(a6 + spec.paletteAt));
}

/** `$2A4AF6`, shared by A2 ids 9 and 15. Advance heading `$131` and select one of six frames. */
export function a2Objects9And15_2A4AF6(ram, rom, ctx) {
  a2OrbitPart(ram, rom, ctx, {
    entry: HIBACHI_A2.object9,
    radius: 0x10,
    angleAt: 0x131,
    angleStep: 2,
    bias1: 0x00000000,
    bias2: 0xee00ec00,
    art: HIBACHI_A2.object9Art,
    artAt: 0x126,
    d3: 0x12a0,
    paletteAt: 0x0e6,
  });
}

/** `$2A4B58`. Advance heading `$13D` by three and reuse object 0's six-frame table. */
export function a2Object11_2A4B58(ram, rom, ctx) {
  a2OrbitPart(ram, rom, ctx, {
    entry: HIBACHI_A2.object11,
    radius: 0x1c,
    angleAt: 0x13d,
    angleStep: 3,
    bias1: 0xee000000,
    bias2: 0xea00f200,
    art: HIBACHI_A2.object0Art,
    artAt: 0x128,
    d3: 0x1670,
    paletteAt: 0x0e8,
  });
}

/** `$2A4BC8`. Reuse the root orbit heading and object 2's fixed upper-body art. */
export function a2Object12_2A4BC8(ram, rom, ctx) {
  a2OrbitPart(ram, rom, ctx, {
    entry: HIBACHI_A2.object12,
    radius: 0x1a,
    angleAt: 0x13d,
    angleStep: 0,
    bias1: 0xd8000000,
    bias2: 0xf400f900,
    art: HIBACHI_A2.object2Art,
    artAt: null,
    d3: 0x0c38,
    paletteAt: 0x0e8,
  });
}

/** `$2A4BA0`. Enqueue the fixed centre part with the cartridge's two long biases. */
export function a2Object13_2A4BA0(ram, rom, ctx) {
  const a6 = bossA6(ctx, HIBACHI_A2.object13);
  let d1 = (ram.u32(a6 + 0x02) + 0x0200ffc0) >>> 0;
  d1 = (d1 + 0xf200f400) >>> 0;
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1,
    0x0011796c, 0x0e60, ram.u8(a6 + 0x0e7));
}

/** `$2A4C08`. Select one of three lower-part frames and enqueue it with the live palette. */
export function a2Object14_2A4C08(ram, rom, ctx) {
  const a6 = bossA6(ctx, HIBACHI_A2.object14);
  const art = rom.u32(HIBACHI_A2.object14Art + i16(ram.u16(a6 + 0x12a)));
  let d1 = ram.u32(a6 + 0x02);
  d1 = (d1 + 0xf4000000) >>> 0;
  d1 = (d1 + 0xf000de00) >>> 0;
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1,
    art, 0x1110, ram.u8(a6 + 0x0ea));
}

/** `$2A4C42`. Select one of twenty-four six-byte upper-part rows and enqueue it. */
export function a2Object10_2A4C42(ram, rom, ctx) {
  const a6 = bossA6(ctx, HIBACHI_A2.object10);
  const row = HIBACHI_A2.object10Table + i16(ram.u16(a6 + 0x12c));
  const art = rom.u32(row);
  const palette = rom.u16(row + 4);
  let d1 = ram.u32(a6 + 0x02);
  d1 = (d1 + 0x0c000000) >>> 0;
  d1 = (d1 + 0xf200e000) >>> 0;
  enqueueRegistersThroughStub(ram, rom, 0x23dfea, d1,
    art, 0x0f00, palette);
}

// ========================================================== A0 MAIN SCRIPT 0 -- THE ARRIVAL POSITION
// `$2A4E56` entry 0 is {$2A4F56, $2A4F86}. The init has no rts, so its first
// dispatch falls through to the step. The step scroll-compensates the root and
// then runs the shared `$2A4EB6` body that attaches ten Hibachi parts to it.
const MAIN0_OFFSET_PARTS = Object.freeze([
  [0x020, 0x14c0, 0xf180],
  [0x040, 0xfb00, 0xee40],
  [0x060, 0xe880, 0xeec0],
  [0x080, 0x0740, 0x1040],
  [0x0a0, 0xf780, 0x14c0],
  [0x0c0, 0xe540, 0x1040],
]);
const MAIN0_ROOT_PARTS = Object.freeze([0x1a0, 0x140, 0x160, 0x180]);

/** `$2A4EB6`. Copy the root position into all ten attached part records. */
function placeMain0Parts2A4EB6(ram, a6) {
  const rootY = ram.u16(a6 + 0x02);
  const rootX = ram.u16(a6 + 0x04);
  for (const [off, dy, dx] of MAIN0_OFFSET_PARTS) {
    ram.setU16(a6 + off + 0x02, u16(rootY + dy));
    ram.setU16(a6 + off + 0x04, u16(rootX + dx));
  }
  const root = ram.u32(a6 + 0x02);
  for (const off of MAIN0_ROOT_PARTS) ram.setU32(a6 + off + 0x02, root);
}

/** `$2A4F56`. Seed the arrival position and three headings from one cartridge draw. */
export function main0Init2A4F56(ram, rom, ctx) {
  const a6 = bossA6(ctx, HIBACHI_A0.s0Init);
  ram.setU16(a6 + 0x02, 0xb000);                            // $2A4F56
  ram.setU16(a6 + 0x04, u16(0x1c00 - ram.u16(0x813172)));  // $2A4F5C..$2A4F68
  const heading = drawWord242EC2(ram, rom) & 0xff;          // $2A4F6C
  ram.setU8(a6 + 0x01b, heading);                           // $2A4F72
  ram.setU8(a6 + 0x131, u16(heading + 0x10) & 0xff);        // $2A4F76..$2A4F7A
  ram.setU8(a6 + 0x13d, u16(heading + 0x40) & 0xff);        // $2A4F7E..$2A4F82
}

/** `$2A4F86`. Apply the shared scroll delta and keep every attached part positioned. */
export function main0Step2A4F86(ram, _rom, ctx) {
  const a5 = bossA5(ctx, HIBACHI_A0.s0Step);
  const a6 = bossA6(ctx, HIBACHI_A0.s0Step);
  scrollCompensate(ram, a5);                               // $2A4F86 jsr $24179E
  placeMain0Parts2A4EB6(ram, a6);                          // $2A4F8C bra.w $2A4EB6
}

// =============================================================== A0 MAIN SCRIPT 1
// `$2A4E56` entry 1 is {$2A4F90, $2A4FAE}. Like main 0, its init has no RTS and
// falls through into the step. The opening word timer blocks movement for exactly
// $40 dispatches. Its expiry starts A3 ids 3 and 4 plus A2 ids $A and $E, arms
// the two second-form damage parts, and begins the out-and-back animation.

/** `$2A4F90..$2A4FAD`. Seed all three timers and clear speed and heading. */
export function main1Init2A4F90(ram, ctx, a4) {
  const a6 = bossA6(ctx, HIBACHI_A0.s1Init);
  ram.setU16(a4 + 0x02, 0x0000);                            // $2A4F90
  ram.setU16(a4 + 0x04, 0x0808);                            // $2A4F96
  ram.setU16(a4 + 0x06, 0x0040);                            // $2A4F9C
  ram.setU8(a6 + 0x1a, 0);                                 // $2A4FA2
  ram.setU8(a6 + 0x1b, 0);                                 // $2A4FA8
}

/** `$2A4FAE..$2A5053`. Spend the opening timer, move, animate out to frame 8,
 * return to frame 4, then hand the main sequencer to id 2. */
export function main1Step2A4FAE(ram, ctx, a4) {
  const a6 = bossA6(ctx, HIBACHI_A0.s1Step);

  if (ram.u16(a4 + 0x06) !== 0) {                           // $2A4FAE/$2A4FB2
    const left = u16(ram.u16(a4 + 0x06) - 1);               // $2A4FB4
    ram.setU16(a4 + 0x06, left);
    if (left !== 0) {                                       // $2A4FB8 bne.w $2A5050
      placeMain0Parts2A4EB6(ram, a6);
      return;
    }

    ctx.soundPost?.(0x28cb88);                              // $2A4FBC
    for (const id of HIBACHI_A0.s1A3) a3Start259962(ram, id); // $2A4FC2..$2A4FCC
    for (const id of HIBACHI_A0.s1A2) a2Run2598E6(ram, id); // $2A4FD2..$2A4FDC
    ram.setU16(a6 + 0x172, 0x1000);                         // $2A4FE2
    ram.setU16(a6 + 0x140, ram.u16(a6 + 0x140) | 0xa001);  // $2A4FE8 jsr $2A6E5C
    ram.setU16(a6 + 0x160, ram.u16(a6 + 0x160) | 0xa001);
    ram.setU16(a6 + 0x106, 0);                              // $2A4FEE jsr $2A6ECE
  }

  applyVelocityA6(ram, ctx.tables, a6);                     // $2A4FF4 jsr $2417DE
  if (ram.u16(a4 + 0x02) === 0) {                           // $2A4FFA
    const old = ram.u8(a4 + 0x04);
    ram.setU8(a4 + 0x04, (old - 1) & 0xff);                 // $2A5002 subq.b #1
    if (old === 0) {                                        // $2A5006 bcc skips on no borrow
      ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));              // $2A5008
      ram.setU8(a4 + 0x05, (ram.u8(a4 + 0x05) - 1) & 0xff); // $2A500E
      const frame = (ram.u8(a6 + 0x1a) + 1) & 0xff;         // $2A5012
      ram.setU8(a6 + 0x1a, frame);
      if (frame === 8) {                                    // $2A5016/$2A501C
        ram.setU16(a4 + 0x04, 0x0303);                      // $2A501E
        ram.setU16(a4 + 0x02, 1);                           // $2A5024
      }
    }
  } else {
    const old = ram.u8(a4 + 0x04);
    ram.setU8(a4 + 0x04, (old - 1) & 0xff);                 // $2A502E subq.b #1
    if (old === 0) {                                        // $2A5032 bcc skips on no borrow
      ram.setU8(a4 + 0x04, ram.u8(a4 + 0x05));              // $2A5034
      const frame = (ram.u8(a6 + 0x1a) - 1) & 0xff;         // $2A503A
      ram.setU8(a6 + 0x1a, frame);
      if (frame === 4) {                                    // $2A503E/$2A5044
        seqStart2598D0(ram, HIBACHI_A0.s1Next);             // $2A5046/$2A5048
        ram.setU16(a4, 0);                                  // $2A504E
      }
    }
  }
  placeMain0Parts2A4EB6(ram, a6);                          // $2A5050 bra.w $2A4EB6
}

// =============================================================== A0 MAIN SCRIPT 2
// `$2A4E56` entry 2 is {$2A5054, $2A506C}. The init falls through into a
// persistent roaming step. Movement uses the prior heading, then the script
// slews toward its prior target and draws a replacement target for the next frame.

/** `$2A5054`. Clear target state, set speed four, and seed the first heading. */
export function main2Init2A5054(ram, rom, ctx, a4) {
  const a6 = bossA6(ctx, HIBACHI_A0.s2Init);
  ram.setU8(a4, 0);                                          // $2A5054/$2A5056
  ram.setU8(a4 + 0x01, 0);                                   // $2A5058
  ram.setU8(a6 + 0x1a, 4);                                   // $2A505C
  ram.setU8(a6 + 0x1b, drawByte242E24(ram, rom));             // $2A5062/$2A5068
}

/** `$2A506C`. Move, turn toward the prior target, choose the next target, and
 * keep every attached part positioned. The centre-bottom strip consumes its
 * draw but deliberately preserves both target bytes. */
export function main2Step2A506C(ram, rom, ctx, a4) {
  const a6 = bossA6(ctx, HIBACHI_A0.s2Step);
  applyVelocityA6(ram, ctx.tables, a6);                       // $2A506C

  if (ram.u8(a4 + 0x01) !== 0) {                              // $2A5072
    const target = ram.u8(a4);
    const heading = slew64FromRecord(ram, a6, target);         // $2A5078/$2A507A
    ram.setU8(a6 + 0x1b, heading);                            // $24217E's store
    if (heading === target) ram.setU8(a4 + 0x01, 0);           // $2A5080..$2A5084
  }

  let target = drawByte242B3C(ram, rom);                      // $2A5088
  const x = u16(ram.u16(a6 + 0x04) + 0x2800);                 // $2A508E/$2A5092
  if (x < 0x3c00) {                                           // unsigned BCC boundary
    target = (target + 0x10) & 0xff;                          // $2A509C
  } else if (x >= 0x4c00) {                                   // unsigned BCS boundary
    target = (target + 0x30) & 0xff;                          // $2A50A8
  } else {
    const y = ram.u16(a6 + 0x02);                             // `$2A50AE swap D1`
    if (y >= 0x6000 && y < 0x6800) {                          // $2A50B0..$2A50BA
      placeMain0Parts2A4EB6(ram, a6);                        // $2A50CC bra.w
      return;
    }
    if (y >= 0x6800) target = (target + 0x20) & 0xff;         // $2A50BC
  }
  ram.setU8(a4, target & 0x3f);                               // $2A50C0/$2A50C4
  ram.setU8(a4 + 0x01, 1);                                   // $2A50C6
  placeMain0Parts2A4EB6(ram, a6);                            // $2A50CC bra.w
}

const HIBACHI_AIM_TABLES = new WeakMap();
function hibachiAimTables(rom) {
  let tables = HIBACHI_AIM_TABLES.get(rom);
  if (!tables) {
    tables = new AimTables(rom);
    HIBACHI_AIM_TABLES.set(rom, tables);
  }
  return tables;
}

// ======================================================= A3 SCRIPTS 0 THROUGH 4
/** Shared byte-underflow cadence for the selector-only A3 scripts. */
function a3SelectorStep(ram, ctx, a4, selector, entryAddress,
  increment = 4, resetAt = 0x0018, resetTo = 0) {
  const a6 = bossA6(ctx, entryAddress);
  const old = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, (old - 1) & 0xff);                  // subq.b #1,($2,A4)
  if (old !== 0) return;                                   // bcc.s -> rts
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));                // reload the current byte
  const next = u16(ram.u16(a6 + selector) + increment);
  ram.setU16(a6 + selector, next);
  if (next === resetAt) ram.setU16(a6 + selector, resetTo); // equality, not a range or modulo
}

/** `$2A54D6`. Seed cadence 1, clear A6+$126, then fall through into the step. */
export function a3s0Init2A54D6(ram, ctx, a4) {
  const a6 = bossA6(ctx, HIBACHI_A3.s0Init);
  ram.setU16(a4 + 0x02, 0x0001);
  ram.setU16(a6 + HIBACHI_A3.s0Selector, 0);
}

/** `$2A54E2`. Advance A6+$126 every two dispatches. */
export function a3s0Step2A54E2(ram, ctx, a4) {
  a3SelectorStep(ram, ctx, a4, HIBACHI_A3.s0Selector, HIBACHI_A3.s0Step);
}

/** `$2A5502`. Seed cadence 2, clear A6+$128, then fall through into the step. */
export function a3s1Init2A5502(ram, ctx, a4) {
  const a6 = bossA6(ctx, HIBACHI_A3.s1Init);
  ram.setU16(a4 + 0x02, 0x0002);
  ram.setU16(a6 + HIBACHI_A3.s1Selector, 0);
}

/** `$2A550E`. Advance A6+$128 every three dispatches. */
export function a3s1Step2A550E(ram, ctx, a4) {
  a3SelectorStep(ram, ctx, a4, HIBACHI_A3.s1Selector, HIBACHI_A3.s1Step);
}

const A3_S2_PARTS = Object.freeze([0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0]);

/** `$2A552E`. Seed a two-dispatch cadence, then fall through into the step. */
export function a3s2Init2A552E(ram, a4) {
  ram.setU16(a4 + 0x02, 0x0001);
}

/** `$2A5534`. Aim each enabled attached gun toward the selected live player. */
export function a3s2Step2A5534(ram, rom, ctx, a4) {
  const old = ram.u8(a4 + 0x02);
  ram.setU8(a4 + 0x02, (old - 1) & 0xff);
  if (old !== 0) return;
  ram.setU8(a4 + 0x02, ram.u8(a4 + 0x03));

  const a5 = bossA5(ctx, HIBACHI_A3.s2Step);
  const a6 = bossA6(ctx, HIBACHI_A3.s2Step);
  const selected = targetSelect(ram, a5);
  if (selected.carry) return;
  const targetY = ram.u16(selected.addr + 0x02);
  const targetX = ram.u16(selected.addr + 0x04);
  ram.setU16(a6 + 0x134, targetY);
  ram.setU16(a6 + 0x136, targetX);

  const tables = hibachiAimTables(rom);
  for (const part of A3_S2_PARTS) {
    if (ram.u8(a6 + part + 0x1f) !== 0 || ram.u8(a6 + part + 0x1e) !== 0) continue;
    const target = aim64(tables,
      ram.u16(a6 + part + 0x02), ram.u16(a6 + part + 0x04), targetY, targetX);
    ram.setU16(a6 + part + 0x1a, slew64(ram.u16(a6 + part + 0x1a), target));
    ram.setU8(a5 + 0x03, ram.u8(a5 + 0x03) ^ 1);
  }
}

/** `$2A56A2`. Seed a one-dispatch cadence and clear A6+$12A. */
export function a3s3Init2A56A2(ram, ctx, a4) {
  const a6 = bossA6(ctx, HIBACHI_A3.s3Init);
  ram.setU16(a4 + 0x02, 0x0000);
  ram.setU16(a6 + HIBACHI_A3.s3Selector, 0);
}

/** `$2A56AE`. Advance A6+$12A by four every dispatch and cycle at $0C. */
export function a3s3Step2A56AE(ram, ctx, a4) {
  a3SelectorStep(ram, ctx, a4, HIBACHI_A3.s3Selector, HIBACHI_A3.s3Step,
    4, 0x000c, 0);
}

/** `$2A56CE`. Seed a two-dispatch cadence and clear A6+$12C. */
export function a3s4Init2A56CE(ram, ctx, a4) {
  const a6 = bossA6(ctx, HIBACHI_A3.s4Init);
  ram.setU16(a4 + 0x02, 0x0001);
  ram.setU16(a6 + HIBACHI_A3.s4Selector, 0);
}

/** `$2A56DA`. Advance A6+$12C by six every two dispatches and reset $90 to $5A. */
export function a3s4Step2A56DA(ram, ctx, a4) {
  a3SelectorStep(ram, ctx, a4, HIBACHI_A3.s4Selector, HIBACHI_A3.s4Step,
    6, 0x0090, 0x005a);
}

// =============================================================== A4 SCRIPT 0 -- THE ARRIVAL
// W552. `$2A4384` starts this script after the Hibachi init body installs the scheduler tables.
// The A4 convention has no `rts` between `$2A592E` and `$2A597C`, so the init dispatch also runs
// the first timer step. The optional $160 hold enables the fight while the independent $260 timer
// continues to count. Its final frame arms the eight damage parts, starts A4 6, and frees this slot.
const S0_PARTS = Object.freeze([0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0, 0x1a0]);

/** `$2A592E`. Start both opening A3 scripts and main script 0, then seed the two timers. */
export function s0Init2A592E(ram, ctx, a4) {
  a3Start259962(ram, 0);                                  // $2A592E/$2A5930
  a3Start259962(ram, 1);                                  // $2A5936/$2A5938
  seqStart2598D0(ram, 0);                                 // $2A593E/$2A5940
  note(ctx, 0x23c4d0);                                    // $2A5946
  ram.setU16(a4 + 0x02, HIBACHI_A4.s0Frames);             // $2A594C
  ram.setU16(a4 + 0x04, 0);                               // $2A5952

  if (ram.u16(HIBACHI_A4.forkLoopWord) !== 0) return;      // $2A5956/$2A595C
  if (ram.u16(HIBACHI_A4.forkFlag) !== 0) {                // $2A5960/$2A5966
    ram.setU32(bossA5(ctx, 0x2a596a) + 0x16, 0x00062000); // $2A596A
    return;                                                // $2A5972 bra.w $2A597C
  }
  ram.setU16(a4 + 0x04, HIBACHI_A4.s0Hold);               // $2A5976
}

/** `$2A597C`. Enable the first-loop fight after $160 frames and finish the arrival at $260. */
export function s0Step2A597C(ram, rom, ctx, a4) {
  if (ram.u16(a4 + 0x04) !== 0) {                         // $2A597C tst.w / beq $2A59C0
    const hold = u16(ram.u16(a4 + 0x04) - 1);             // $2A5984 subq.w #1
    ram.setU16(a4 + 0x04, hold);
    if (hold === 0) {                                     // $2A5988 bne $2A59C0
      ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x01);       // $2A598C bset #0
      ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x04);       // $2A5994 bset #2
      ram.setU8(0x8130f9, ram.u8(0x8130f9) | 0x01);       // $2A599C bset #0
      const a5 = bossA5(ctx, 0x2a59a4);
      ram.setU32(a5 + 0x16, 0x00062000);                  // $2A59A4
      ram.setU32(0x81b626, 0x00000700);                   // $2A59AC
      ram.setU32(0x81b62a, a5 + 0x16);                    // $2A59B6/$2A59BA
    }
  }

  const left = u16(ram.u16(a4 + 0x02) - 1);               // $2A59C0 subq.w #1
  ram.setU16(a4 + 0x02, left);
  if (left !== 0) return;                                 // $2A59C4 bne.s $2A5A1A

  ram.setU16(0x81b6e4, 1);                               // $2A59C6
  if (ram.u16(HIBACHI_A4.forkLoopWord) === 0
    && ram.u16(HIBACHI_A4.forkFlag) === 0) {              // $2A59CE..$2A59DE
    ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x02);         // $2A59E2 bset #1
    ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x10);         // $2A59EA bset #4
  } else {
    ram.setU16(0x81309c, 1);                              // $2A59F6
  }

  const a6 = bossA6(ctx, 0x2a59fe);
  for (const off of S0_PARTS) {                           // $2A59FE jsr $2A6E38
    ram.setU16(a6 + off, ram.u16(a6 + off) | 0xa001);
  }
  loadAnimObjects246410(ram, rom, HIBACHI_A4.s0Anim);     // $2A5A04/$2A5A0A
  a4Start25980C(ram, HIBACHI_A4.s0Next);                  // $2A5A10/$2A5A12
  ram.setU16(a4, 0);                                     // $2A5A18 clr.w (A4)
}

// =============================================================== A4 SCRIPT 1 -- THE ENDING
/** `$2A5A1C`. Two stores, and the second is ONE word covering TWO byte fields (TRAP 3):
 *  `($4,A4)` = 3 is the explosion counter and `($5,A4)` = 3 is its reload. */
function s1Init2A5A1C(ram, a4) {
  ram.setU16(a4 + 0x02, 0x00c0);                         // $2A5A1C move.w #$C0,($2,A4)
  ram.setU16(a4 + 0x04, 0x0303);                         // $2A5A22 move.w #$303,($4,A4)
}

/** `$2A5A28`. 192 frames of explosions, then the one-shot block and the FORK. */
function s1Step2A5A28(ram, rom, ctx, a4) {
  // A6 only: $2A5A28's step reads ($2,A6) nine times and never touches A5. Script 2's init is
  // the one that needs A5 ($2A5EAC), so the guard belongs there and not here.
  const a6 = bossA6(ctx, 0x2a5a28);
  const left = u16(ram.u16(a4 + 0x02) - 1);              // $2A5A28 subq.w #1,($2,A4)
  ram.setU16(a4 + 0x02, left);
  if (left !== 0) { frameBurst2A5D3A(ram, rom, ctx, a4, a6); return; }   // $2A5A2C bne $2A5D3A

  clearEffectPool(ram);                                  // $2A5A30 jsr $288E0C
  const pos = ram.u32(a6 + 0x02);
  for (const [kind, site, nHi, nLo, spd, s12, s14, dly] of S1_ROWS) {
    emit(ram, ctx, kind, pos, site, nHi, nLo, spd, s12, s14, dly);
  }
  // $2A5C2E..$2A5C50 -- the position is nudged for TWO `$27CBB6` bursts and restored from
  // the stack as a LONG, so BOTH halves come back. `addi.w` on ($2,A6) and ($4,A6) is
  // per-word wrap, not a 32-bit add.
  const saved = ram.u32(a6 + 0x02);                      // $2A5C2E move.l ($2,A6),-(A7)
  ram.setU16(a6 + 0x02, u16(ram.u16(a6 + 0x02) + 0xf400));   // $2A5C32 addi.w #-$C00
  ram.setU16(a6 + 0x04, u16(ram.u16(a6 + 0x04) + 0xf100));   // $2A5C38 addi.w #-$F00
  finalBurst27CBB6(ram, ctx, a6);                        // $2A5C3E jsr $27CBB6
  ram.setU16(a6 + 0x04, u16(ram.u16(a6 + 0x04) + 0x1e00));   // $2A5C44 addi.w #$1E00
  finalBurst27CBB6(ram, ctx, a6);                        // $2A5C4A jsr $27CBB6
  ram.setU32(a6 + 0x02, saved);                          // $2A5C50 move.l (A7)+,($2,A6)

  ram.setU16(0x803930, 0x0014);                          // $2A5C54
  shakeStart260E36(ram);                                 // $2A5C5C jsr $260E36
  shakeOff23C4E0(ram);                                   // $2A5C62 jsr $23C4E0
  shakeMode23C4B0(ram);                                  // $2A5C68 jsr $23C4B0
  loadAnimObjects246410(ram, rom, HIBACHI_A4.s1Anim);    // $2A5C6E lea / $2A5C74 jsr $246410

  // ---- THE FORK. Both `bne`s go to the SAME target, so this is an OR, not a nest.
  if (ram.u16(HIBACHI_A4.forkLoopWord) !== 0            // $2A5C7A tst.w $813098 / bne
    || ram.u16(HIBACHI_A4.forkFlag) !== 0) {            // $2A5C84 tst.w $80393A / bne
    shakeMode23C4A0(ram);                                // $2A5D14 jsr $23C4A0
    ctx.soundPost?.(0x28c310);                           // $2A5D1A jsr $28C310
    // ================= $2A5D28 -- THE STAGE-5 SPEED PUSH =================
    pushExternalSpeed(ram, HIBACHI_A4.push1Speed, HIBACHI_A4.push1Speed);   // $2A5D20/24/28
    a4Start25980C(ram, 2);                               // $2A5D2E/$2A5D30
    ram.setU16(a4, 0);                                   // $2A5D36 clr.w (A4) -- 4254 is (A4)
    ctx.scrollEvent?.({ kind: 'hibachiPush', at: HIBACHI_A4.push1At,
      speed: HIBACHI_A4.push1Speed, next: 2 });
    return;                                              // $2A5D38 rts
  }
  // ---- the FIRST-LOOP arm: no push, and A4 $14 suspends the stage 128 frames later.
  ctx.soundPost?.(0x28c392);                             // $2A5C8E jsr $28C392
  a2StopAll259924(ram);                                  // $2A5C94 jsr $259924
  for (let i = 0; i < HIBACHI_A4.poolCRows; i++) {       // $2A5C9A moveq #$14,D7 + dbra: 21
    void rom.u32(HIBACHI_A4.poolCTable + i * 4);         // $2A5CA6 move.l (A3)+,D2
    note(ctx, 0x289b22);                                 // $2A5CAA jsr $289B22
  }
  a4Start25980C(ram, HIBACHI_A4.firstLoopExit);          // $2A5CB4/$2A5CB6
  ram.setU16(a4, 0);                                     // $2A5CBC clr.w (A4)
}

// =============================================================== A4 SCRIPT 2 -- THE HANDOVER
/** `$2A5EA0`. `($2,A4)` = 1, so the step's very first frame falls into the one-shot. */
function s2Init2A5EA0(ram, ctx, a4) {
  ram.setU16(a4 + 0x02, 0x0001);                         // $2A5EA0
  ram.setU16(a4 + 0x04, 0x0080);                         // $2A5EA6 -- a WORD here, not a pair
  ram.setU16(bossA5(ctx, 0x2a5eac) + 0x1a, 0x6270);      // $2A5EAC move.w #$6270,($1A,A5)
  shakeOff23C4E0(ram);                                   // $2A5EB2 jsr $23C4E0
}

/** `$2A5EB8`. Frame 1: retire the ten opening A2 objects, run four new ones, restart the
 *  main sequencer on script 1, and ARM THE SECOND FORM. Then $80 frames, then A4 $A. */
function s2Step2A5EB8(ram, rom, ctx, a4) {
  void rom;
  const a5 = bossA5(ctx, 0x2a5eb8);
  const a6 = bossA6(ctx, 0x2a5eb8);
  if (ram.u16(a4 + 0x02) !== 0) {                        // $2A5EB8 tst.w ($2,A4) / beq $2A5F78
    const left = u16(ram.u16(a4 + 0x02) - 1);            // $2A5EC0 subq.w #1,($2,A4)
    ram.setU16(a4 + 0x02, left);
    if (left !== 0) return;                              // $2A5EC4 bne -> the rts
    // $2A5EC8..$2A5F16 -- the SAME ten ids $2A4334 started, in the SAME non-sequential
    // order: 0 1 9 2 5 4 3 8 7 6. (The init body's order is 0 1 2 5 4 3 8 7 6 9 -- NOT the
    // same list read backwards, and not the same order. Both are transcribed as written.)
    for (const id of [0, 1, 9, 2, 5, 4, 3, 8, 7, 6]) a2Stop25994A(ram, id);
    for (const id of [0x0b, 0x0c, 0x0d, 0x0f]) a2Run2598E6(ram, id);   // $2A5F18..$2A5F36
    seqStart2598D0(ram, 1);                              // $2A5F38 moveq #1 / jsr $2598D0
    ram.setU8(a6 + 0x10e, 1);                            // $2A5F40 -- $2A6BA0's gate byte
    ram.setU16(a6 + 0x172, 0);                           // $2A5F46
    ram.setU32(a5 + 0x16, 0x0002bc00);                   // $2A5F4C -- the SECOND form's pool
    ram.setU16(a6 + 0x108, 0);                           // $2A5F54 jsr $2A6E30 -- vulnerable
    ram.setU16(a6 + 0x140, ram.u16(a6 + 0x140) | 0xa001);   // $2A5F5A jsr $2A6E5C
    ram.setU16(a6 + 0x160, ram.u16(a6 + 0x160) | 0xa001);   //   ...both parts of form two
    ram.setU16(a6 + 0x106, 0);                           // $2A5F60 jsr $2A6ECE -- body back ON
    note(ctx, 0x23c4d0);                                 // $2A5F66 jsr $23C4D0
    ram.setU16(0x81309c, 2);                             // $2A5F6C
    return;                                              // $2A5F74 bra -> the rts
  }
  const hold = u16(ram.u16(a4 + 0x04) - 1);              // $2A5F78 subq.w #1,($4,A4)
  ram.setU16(a4 + 0x04, hold);
  if (hold !== 0) return;                                // $2A5F7C bne -> the rts
  a4Start25980C(ram, 0x0a);                              // $2A5F80/$2A5F82
  ram.setU16(a4, 0);                                     // $2A5F88 clr.w (A4)
}

// ========================================== A4 SCRIPT 3 -- THE SECOND FORM'S DEATH, AND $0200
/** `$2A5F8E`. Same $C0 / $0303 pair as script 1's init, plus a main-sequencer restart. */
function s3Init2A5F8E(ram, a4) {
  ram.setU16(a4 + 0x02, 0x00c0);                         // $2A5F8E
  ram.setU16(a4 + 0x04, 0x0303);                         // $2A5F94 -- TRAP 3 again
  seqStart2598D0(ram, 3);                                // $2A5F9A/$2A5F9C
}

/** `$2A5FA2`. 192 frames of explosions, then FIVE calls and a `bra` over 504 dead bytes to
 *  the tail that pushes `$0200`. */
function s3Step2A5FA2(ram, rom, ctx, a4) {
  const a6 = bossA6(ctx, 0x2a5fa2);
  const left = u16(ram.u16(a4 + 0x02) - 1);              // $2A5FA2 subq.w #1,($2,A4)
  ram.setU16(a4 + 0x02, left);
  if (left !== 0) { frameBurst2A61F2(ram, rom, ctx, a4, a6); return; }   // $2A5FA6 bne $2A61F2

  ctx.soundPost?.(0x28c310);                             // $2A5FAA jsr $28C310
  // $2A5FB0..$2A5FC0 -- a WORD push/pop this time ($3F2E/$3D5F), not script 1's long, and
  // only ($2,A6) is touched, so a long restore would say something the ROM does not.
  const savedHi = ram.u16(a6 + 0x02);                    // $2A5FB0 move.w ($2,A6),-(A7)
  ram.setU16(a6 + 0x02, u16(savedHi + 0x1400));          // $2A5FB4 addi.w #$1400,($2,A6)
  finalBlast2440E0(ram, rom, ctx, a6);                   // $2A5FBA jsr $2440E0
  ram.setU16(a6 + 0x02, savedHi);                        // $2A5FC0 move.w (A7)+,($2,A6)
  shakeStart260E36(ram);                                 // $2A5FC4 jsr $260E36
  shakeMode23C4A0(ram);                                  // $2A5FCA jsr $23C4A0
  // $2A5FD0 bra $2A61CC -- OVER $2A5FD4..$2A61CB. See this file's header.
  loadAnimObjects246410(ram, rom, HIBACHI_A4.s3Anim);    // $2A61CC lea / $2A61D2 jsr $246410
  // ================= $2A61E0 -- THE SECOND SPEED PUSH =================
  pushExternalSpeed(ram, HIBACHI_A4.push2Speed, HIBACHI_A4.push2Speed);   // $2A61D8/DC/E0
  a4Start25980C(ram, 4);                                 // $2A61E6/$2A61E8
  ram.setU16(a4, 0);                                     // $2A61EE clr.w (A4)
  ctx.scrollEvent?.({ kind: 'hibachiPush', at: HIBACHI_A4.push2At,
    speed: HIBACHI_A4.push2Speed, next: 4 });
}

// =============================== A4 SCRIPT 4 -- THE HANDOVER TO THE SECOND FORM'S PHASE B
// W403. `$2A62FA..$2A6417`, $11E bytes, which W399 counted. It is the ONLY other writer of
// `($10E,A6)` in the whole 6 MB image, and what it writes is `2` -- so it is what makes
// `$2A6F12 cmpi.b #$1` take its `bne.w` and run `$2A70B4` instead of `$2A6F1C`. Without it
// `src/hibachi2.js`'s phase B is unreachable, which is why it is ported here and not counted.

/** `$2A62FA`. Four stores and NO `rts` -- see the registration note below. */
function s4Init2A62FA(ram, a4) {
  ram.setU16(a4 + 0x02, 0x0001);                         // $2A62FA
  ram.setU16(a4 + 0x04, 0x0080);                         // $2A6300 -- a WORD, as script 2's is
  ram.setU16(0x8130dc, 0);                               // $2A6306 clr.w $8130DC
  shakeOff23C4E0(ram);                                   // $2A630C jsr $23C4E0
}

/** `$2A6312`. Frame 1: hand the whole boss over to phase B. Then $80 frames, then A4 $F. */
function s4Step2A6312(ram, rom, ctx, a4) {
  void rom;
  const a5 = bossA5(ctx, 0x2a6312);
  const a6 = bossA6(ctx, 0x2a6312);
  if (ram.u16(a4 + 0x02) === 0) {                        // $2A6312 tst.w / $2A6316 beq $2A6404
    const hold = u16(ram.u16(a4 + 0x04) - 1);            // $2A6404 subq.w #1,($4,A4)
    ram.setU16(a4 + 0x04, hold);
    if (hold !== 0) return;                              // $2A6408 bne -> the rts
    a4Start25980C(ram, 0x0f);                            // $2A640C/$2A640E
    ram.setU16(a4, 0);                                   // $2A6414 clr.w (A4) -- 4254, the SLOT
    return;
  }
  const left = u16(ram.u16(a4 + 0x02) - 1);              // $2A631A subq.w #1,($2,A4)
  ram.setU16(a4 + 0x02, left);
  if (left !== 0) return;                                // $2A631E bne -> the rts

  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x02);          // $2A6322 bset #1 -- bit 1, mask $02
  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x10);          // $2A632A bset #4
  for (const id of [0x0b, 0x0c, 0x0d, 0x0f]) a2Stop25994A(ram, id);   // $2A6332..$2A634C
  a2Run2598E6(ram, 0x10);                                // $2A6352/$2A6354
  a3Start259962(ram, 6);                                 // $2A635A/$2A635C
  a3Start259962(ram, 7);                                 // $2A6362/$2A6364
  seqStop2598BE(ram);                                    // $2A636A/$2A636C -- D0 = 3 is IGNORED:
  //   $2598BE is `move.w #$FFFF,$81298A / rts` and reads no register at all.
  seqStart2598D0(ram, 4);                                // $2A6372/$2A6374
  ram.setU8(a6 + 0x10e, 2);                              // $2A637A -- PHASE B. THE selector.
  ram.setU16(0x81309c, 0xffff);                          // $2A6380
  // $2A6388 move.l #$46000,D0 -- ONE immediate into BOTH the pool and its shadow.
  ram.setU32(a5 + 0x16, 0x00046000);                     // $2A638E
  ram.setU32(a5 + 0x1c, 0x00046000);                     // $2A6392 -- what $2A7116 restores from
  ram.setU32(0x81b626, 0x00000500);                      // $2A6396
  ram.setU32(0x81b62a, a5 + 0x16);                       // $2A63A0 lea ($16,A5),A0 / $2A63A4
  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x01);          // $2A63AA bset #0,$8130F8
  ram.setU8(0x8130f8, ram.u8(0x8130f8) | 0x04);          // $2A63B2 bset #2,$8130F8
  ram.setU8(0x8130f9, ram.u8(0x8130f9) | 0x01);          // $2A63BA bset #0,$8130F9 -- the NEXT byte
  ram.setU16(a6 + 0x108, 0);                             // $2A63C2 jsr $2A6E30 -- vulnerable
  ram.setU16(a6 + 0x180, ram.u16(a6 + 0x180) | 0xa001);  // $2A63C8 jsr $2A6E6A -- part $180 only
  ram.setU16(a6 + 0x106, 0);                             // $2A63CE jsr $2A6ECE -- body back ON
  ram.setU16(0x81b414, 1);                               // $2A63D4
  ram.setU16(0x81b416, 1);                               // $2A63DC
  ram.setU16(0x81b418, 1);                               // $2A63E4
  ram.setU16(0x81b41a, 1);                               // $2A63EC
  note(ctx, 0x23c4d0);                                   // $2A63F4 jsr $23C4D0
  ctx.soundPost?.(0x28cc14);                             // $2A63FA jsr $28CC14
  // $2A6400 bra.w $2A6416 -- the shared rts.
}

// ================================ A4 SCRIPT 5 -- PHASE B'S DEATH TAIL, AND THE SECOND SUSPEND
//
// W409.  `$2A6418..$2A6687` is CODE and `$2A6688..$2A6787` is its own data; the `$3AA` W408
// counted entry-to-entry runs on to `$2A67C1` and the last `$3A` of it belong to A4 SCRIPT 0
// (`$2A5A04 lea` names `$2A6788`).  Three numbers, not one -- see the extents note below.
//
// **THE BRIEF FOR THIS WAVE SAID ONLY A4 `$14` REACHES `$2595E8`.  IT DOES NOT.**  A scan of
// every longword in `$2A4000..$2AB000` finds exactly TWO `4EB9 002595E8`:
//
//   $2A6B88   in A4 $14   -- script 1's FIRST-LOOP arm reaches it ($2A5CB4 moveq #$14)
//   $2A6466   HERE        -- and phase B's death tail reaches it ($2A728A moveq #$5)
//
// so this unit is not "one link past the loop", it is THE OTHER ENDING.  `$2A646C 4254` is
// `clr.w (A4)` (TRAP 5) immediately after, so the suspend fires exactly once.
//
// THE FIVE STATES, and `($2,A4)` is tested in the order 4, 3, 2, 1, 0 -- descending, so a
// state that has just been written is not re-entered on the same frame:
//
//   0  $2A65F2  16 spawns off $2A6688, one every ($6,A4)+1 frames, then arm state 1
//   1  $2A64E0  the long burn: a $28B34A blast every ($10,A4)+1, a ramp on ($7,A4)/($C,A4),
//               and 16 more spawns whose cadence ACCELERATES as ($7,A4) falls to 2
//   2  $2A64AA  wait for the fade state 1 armed, then load the $246410 chain
//   3  $2A6470  8 frames, then $2440E0 with ($2,A6) pushed DOWN $1400
//   4  $2A6458  $80 frames, then $2595E8 -- THE SUSPEND -- and clr.w (A4)
//
// `($13,A4)` LOOKS uninitialised and is not: `$2A6454 426C 0012` is `clr.w ($12,A4)`, a WORD,
// so it zeroes `($12,A4)` AND `($13,A4)` -- the same TRAP 3 the two `move.w #$0101` / `#$2020`
// stores play, one word over two byte fields.  `$2A656C subq.b #1,($13,A4)` therefore borrows
// on its FIRST use and reloads to 4, and the port must clear it as a word or that first cue
// would fire 256 spawns late.  ($4,A4) really is untouched by the init: states 2 and 3 write
// it before either of the two states that read it runs.
//
// THE EXTENT, THREE BOUNDS, and which kind each one is:
//   (1) POSITIVE: `4E75` sits AT `$2A6686` -- the last address, not one past it -- and it is
//       the target of the four widest forward branches in the routine ($2A65F8, $2A6600,
//       $2A6668, $2A6672 all resolve to $2A6686).
//   (2) POSITIVE: `$2A6688` is a table BASE, named twice by this routine's own
//       `lea (d16,PC),A1` -- $2A657E ($2A6580 + $108) and $2A6628 ($2A662A + $5E).
//   (3) CONSEQUENCE: every branch displacement in `$2A6418..$2A6686` was resolved and not one
//       lands outside it, so the aligned sweep's boundary set closes.
// and the DATA's far end is bounded by a fourth `lea` that belongs to a DIFFERENT unit:
// `$2A5A04 lea` (inside A4 script 0, `$2A592E..$2A5A1B`, still counted) names `$2A6788`, and
// `$2A676E + $1A` is exactly that.  So A4 5's data stops where script 0's begins.
//
// **AND `$2A6760..$2A676D` IS A SEVENTH `$246410` RECORD NOTHING READS.**  `$2A670A` holds
// `$0006` and `$24643C move.w (A0)+,D0` / `$2464E8 subq.w #1,D0 / beq` runs the body exactly
// six times, so the window is `$56` and the fourteen bytes after it -- structurally a
// perfect seventh record, `7FFF 0008 0740 00230220 001F 0006`, continuing the ascending
// target series -- are dead.  Left with NO window, like W408's `$2A8B10` orphan, and named
// here so the next reader does not "discover" it.

/** `$2A6688`'s row, read straight out of ROM by both emitters.  Four words: the effect KIND,
 *  a word whose LOW BYTE is `($1C,A0)`, and the `($26,A0)` nudge longword. */
const s5Row = (rom, base, index) => ({
  kind: rom.u16(base + index),
  f1c: rom.u16(base + index + 2) & 0xff,
  nudge: rom.u32(base + index + 4),
});

/** `subq.b #1,(d16,A4)` + `bcc`, the UNDERFLOW convention: the body runs on the frame the
 *  byte passes zero, i.e. every `reload + 1` frames. */
function dueByte5(ram, addr) {
  const old = ram.u8(addr);
  ram.setU8(addr, u16(old - 1) & 0xff);
  return old === 0;
}

/** `$2A6418`.  Two loads and seven stores, and NO `rts` -- `$2A6454 clr.w ($12,A4)` is four
 *  bytes and `$2A6458` is the step, so `$2596FA jsr (A0)` runs both on the first frame. */
export function s5Init2A6418(ram, rom, ctx, a4) {
  // $2A6418 move.w #$E,D0 / $2A641C lea $246BF8,A0 / $2A6422 jsr $24150A
  if (ctx.palette) {
    install24150A(ram, ctx.palette, HIBACHI_A4.s5WhiteBank,
      rom.bytes(HIBACHI_A4.s5WhiteSrc, 64), 0x2a6422, 'HIBACHI A4 5, phase B death tail');
  } else {
    note(ctx, 0x24150a);
  }
  // $2A6428 lea ($344,PC),A0 -> $2A676E / $2A642C nop / $2A642E jsr $246520 -- the NO-FILL
  // loader, whose entry is TWELVE bytes and not $246410's fourteen.
  loadAnimObjects246520(ram, rom, HIBACHI_A4.s5Anim520);
  ram.setU16(a4 + 0x02, 0);                              // $2A6434 clr.w ($2,A4) -- state 0
  ram.setU16(a4 + 0x06, 0x0101);                         // $2A6438 -- ONE word, TWO byte fields
  ram.setU16(a4 + 0x08, 0);                              // $2A643E
  ram.setU16(a4 + 0x0a, 1);                              // $2A6444
  ram.setU8(a4 + 0x0c, 0);                               // $2A644A clr.b ($C,A4) -- a BYTE
  ram.setU16(a4 + 0x10, 0x2020);                         // $2A644E -- again TWO byte fields
  ram.setU16(a4 + 0x12, 0);                              // $2A6454
}

/** `$2A6458`.  The five-state machine, transcribed in the ROM's own test order. */
export function s5Step2A6458(ram, rom, ctx, a4) {
  const a6 = bossA6(ctx, 0x2a6458);
  const state = ram.u16(a4 + 0x02);

  // ---- STATE 4 ($2A6458) -- THE SUSPEND.  $80 frames, then the stage ends.
  if (state === 4) {                                     // $2A6458 cmpi.w #$4,($2,A4)
    const left = u16(ram.u16(a4 + 0x04) - 1);            // $2A6460 subq.w #1,($4,A4)
    ram.setU16(a4 + 0x04, left);
    if (left !== 0) return;                              // $2A6464 bne.s -> $2A646E, the rts
    suspend2595E8(ram);                                  // $2A6466 jsr $2595E8
    ram.setU16(a4, 0);                                   // $2A646C 4254 clr.w (A4) -- the SLOT
    ctx.bossEvent?.('suspend', 0x2a6466);
    return;
  }

  // ---- STATE 3 ($2A6470) -- eight frames, then the shared final blast.
  if (state === 3) {                                     // $2A6470 cmpi.w #$3,($2,A4)
    const left = u16(ram.u16(a4 + 0x04) - 1);            // $2A647A subq.w #1,($4,A4)
    ram.setU16(a4 + 0x04, left);
    if (left !== 0) return;                              // $2A647E bne.w -> falls to the rts
    // $2A6482 move.w ($2,A6),-(A7) is a WORD push, so only ($2,A6) -- Y -- is saved and
    // restored; ($4,A6) is untouched throughout.  $1400 DOWN the screen for the blast only.
    const savedY = ram.u16(a6 + 0x02);                   // $2A6482
    ram.setU16(a6 + 0x02, u16(savedY + 0x1400));         // $2A6486 addi.w #$1400,($2,A6)
    finalBlast2440E0(ram, rom, ctx, a6);                 // $2A648C jsr $2440E0
    ram.setU16(a6 + 0x02, savedY);                       // $2A6492 move.w (A7)+,($2,A6)
    ram.setU16(a4 + 0x04, 0x0080);                       // $2A6496
    ram.setU16(a4 + 0x02, 4);                            // $2A649C -- state 4
    ctx.soundPost?.(0x28c392);                           // $2A64A2 jsr $28C392
    return;
  }

  // ---- STATE 2 ($2A64AA) -- wait out the fade state 1 armed, then the SECOND chain.
  if (state === 2) {                                     // $2A64AA cmpi.w #$2,($2,A4)
    if (fadeDone259B9E(ram)) return;                     // $2A64B2 jsr $259B9E / $2A64B8 bcs.s
    // $2A64BA lea ($24E,PC),A0 -> $2A670A / $2A64BE nop / $2A64C0 jsr $246410 -- the WITH-FILL
    // loader this time, six records of fourteen bytes.
    loadAnimObjects246410(ram, rom, HIBACHI_A4.s5Anim410);
    a2StopAll259924(ram);                                // $2A64C6 jsr $259924
    ram.setU16(a4 + 0x0a, 1);                            // $2A64CC
    ram.setU16(a4 + 0x02, 3);                            // $2A64D2 -- state 3
    ram.setU16(a4 + 0x04, 8);                            // $2A64D8
    return;
  }

  // ---- STATE 1 ($2A64E0) -- THE BURN.  Three independent counters and one exit.
  if (state === 1) {                                     // $2A64E0 cmpi.w #$1,($2,A4)
    // (a) $2A64EA -- the $28B34A blast, every ($11,A4) + 1 frames.
    if (dueByte5(ram, a4 + 0x10)) {                      // $2A64EA subq.b / $2A64EE bcc.s
      ram.setU8(a4 + 0x10, ram.u8(a4 + 0x11));           // $2A64F0
      const angle = drawWord242EC2(ram, rom) & 0xff;     // $2A64F6 jsr / $2A64FC move.b D0,D1
      const root = ram.u32(a6 + 0x02);                   // $2A64FE move.l ($2,A6),D2
      const dx = i16(drawWord24328E(ram, rom)) >> 2;     // $2A6502 / $2A6508 asr.w #2 -- the LOW
      const dy = (i16(drawWord24328E(ram, rom)) >> 1) - 0x1000;  // $2A650E/$2A6514/$2A6518, HIGH
      const pos = ((u16((root >>> 16) + dy) << 16) | u16((root & 0xffff) + dx)) >>> 0;
      // $2A651E move.w #$8,D3 (the bucket) / $2A6522 move.w #$0,D0 -- and D0 is $28B34A's
      // `$28B35C moveq #$5,D0 / $28B35E lsr.w D6,D0` SHIFT.  Zero, so the eight speeds are the
      // table's own, which is what `bigBurst28B34A` transcribes.
      bigBurst28B34A(ram, rom, ctx, pos, angle, 8, 0x2a6526);   // $2A6526 jsr $28B34A
      if (ram.u8(a4 + 0x07) !== 2) {                     // $2A652C cmpi.b #$2,($7,A4) / beq.s
        ctx.soundPost?.(0x28c2c2);                       // $2A6534 jsr $28C2C2
      }
    }
    // (b) $2A653A -- the RAMP.  ($7,A4) walks $10 down to 2 and ($C,A4) walks up, and both
    // stop dead at 2 because the guard is `cmpi.b #$2` and not a `bne` on zero.
    if (dueByte5(ram, a4 + 0x0e)) {                      // $2A653A subq.b / $2A653E bcc.s
      ram.setU8(a4 + 0x0e, ram.u8(a4 + 0x0f));           // $2A6540
      if (ram.u8(a4 + 0x07) !== 2) {                     // $2A6546 / $2A654C beq.s
        ram.setU8(a4 + 0x07, u16(ram.u8(a4 + 0x07) - 1) & 0xff);   // $2A654E subq.b #1
        ram.setU8(a4 + 0x0c, u16(ram.u8(a4 + 0x0c) + 1) & 0xff);   // $2A6552 addq.b #1
      }
    }
    // (c) $2A6556 -- the SPAWN, whose reload is ($7,A4) itself, so (b) makes it accelerate.
    if (!dueByte5(ram, a4 + 0x06)) return;               // $2A655A bcc.w -> the rts
    ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));             // $2A655E
    if (ram.u8(a4 + 0x07) !== 2                          // $2A6564 / $2A656A beq.s $2A657E
      && dueByte5(ram, a4 + 0x13)) {                     // $2A656C subq.b / $2A6570 bcc.s
      ram.setU8(a4 + 0x13, 4);                           // $2A6572 -- an IMMEDIATE, not a reload
      ctx.soundPost?.(0x28c28e);                         // $2A6578 jsr $28C28E
    }
    {
      const row = s5Row(rom, HIBACHI_A4.s5Emit, ram.u16(a4 + 0x08));  // $2A657E lea / $2A6584
      const a0 = spawnEffect(ram, ctx, row.kind, 0x2a658a);    // $2A6588/$2A658A jsr $289004
      ram.setU8(a0 + B.f1c, row.f1c);                    // $2A6590/$2A6592 move.b -- LOW byte
      ram.setU32(a0 + B.nudge, row.nudge);               // $2A6596 move.l (A1)+,($26,A0)
      ram.setU32(a0 + B.pos, ram.u32(a6 + 0x02));        // $2A659A
      ram.setU16(a0 + B.bucket, 0x0008);                 // $2A65A0 -- EIGHT, not script 1's $10
      // $2A65A6..$2A65B8 -- all BYTE arithmetic, and both shifts are ARITHMETIC.
      const jitter = (drawByte242B3C(ram, rom) << 24) >> 24;      // $2A65A6 jsr $242B3C
      const ramp = (ram.u8(a4 + 0x0c) << 24) >> 24;              // $2A65B0 move.b ($C,A4),D1
      ram.setU8(a0 + B.speed, ((jitter >> 2) + 2 + (ramp >> 1)) & 0xff);   // $2A65AC/AE/B4/B6/B8
      ram.setU8(a0 + B.angle, drawWord242EC2(ram, rom) & 0xff);  // $2A65BC/$2A65C2
    }
    const next = u16(ram.u16(a4 + 0x08) + 8);            // $2A65C6 addi.w #$8,($8,A4)
    ram.setU16(a4 + 0x08, next);
    if (next !== HIBACHI_A4.s5EmitWrap) return;          // $2A65CC cmpi.w #$80 / $2A65D2 bne.s
    ram.setU16(a4 + 0x08, 0);                            // $2A65D4
    if (ram.u8(a4 + 0x07) !== 2) return;                 // $2A65D8 / $2A65DE bne.s -- the ONLY
    fadeArm259B7E(ram, 0x0e);                            // $2A65E0 move.w #$E,D0 / $2A65E4
    ram.setU16(a4 + 0x02, 2);                            // $2A65EA -- state 2
    return;
  }

  // ---- STATE 0 ($2A65F2) -- sixteen spawns and a two-arm sound cue.
  if (state !== 0) return;                               // $2A65F8 bne.w -> $2A6686, the rts
  if (!dueByte5(ram, a4 + 0x06)) return;                 // $2A65FC subq.b / $2A6600 bcc.w
  ram.setU8(a4 + 0x06, ram.u8(a4 + 0x07));               // $2A6604
  // $2A660A bchg #$0,($12,A4) is a BYTE operation on memory and Z is the bit BEFORE the
  // change, so `$2A6610 bne` skips when the bit WAS set: the cue fires every OTHER spawn.
  const toggle = ram.u8(a4 + 0x12);
  ram.setU8(a4 + 0x12, toggle ^ 1);
  if ((toggle & 1) === 0) {
    // $2A6612 lea $28C274,A0 / $2A6618 jsr $242EC2 / $2A661E bpl.s / $2A6620 lea $28C28E,A0.
    // **THE `bpl` READS BIT 7, NOT BIT 15.**  $242EC2 ends `move.b (A0,D0.w),D0` and then
    // `movea.l (A7)+,A0 / rts`, neither of which touches the CCR, so N at $2A661E is the MSB
    // of the TABLE BYTE.  Testing the returned word's sign instead tests a bit of `$803916`'s
    // high half that is always clear, and picks $28C274 every time.
    ctx.soundPost?.(drawNegative242EC2(ram, rom) ? 0x28c28e : 0x28c274);
  }
  {
    const row = s5Row(rom, HIBACHI_A4.s5Emit, ram.u16(a4 + 0x08));   // $2A6628 lea / $2A662E
    const a0 = spawnEffect(ram, ctx, row.kind, 0x2a6634);   // $2A6632/$2A6634 jsr $289004
    ram.setU8(a0 + B.f1c, row.f1c);                      // $2A663A/$2A663C
    ram.setU32(a0 + B.nudge, row.nudge);                 // $2A6640
    ram.setU32(a0 + B.pos, ram.u32(a6 + 0x02));          // $2A6644
    ram.setU16(a0 + B.bucket, 0x0008);                   // $2A664A
    ram.setU16(a0 + B.sub12, 0);                         // $2A6650 -- state 1's spawn writes
    ram.setU16(a0 + B.sub14, 0);                         // $2A6656 -- neither of these two
  }
  const next = u16(ram.u16(a4 + 0x08) + 8);              // $2A665C addi.w #$8,($8,A4)
  ram.setU16(a4 + 0x08, next);
  // $2A6668 is `65` BCS -- branch while the index is BELOW $80 -- where state 1's twin at
  // $2A65D2 is `66` BNE.  Same effect on this walk, different instruction, so it is written
  // as the ROM has it.
  if (next < HIBACHI_A4.s5EmitWrap) return;
  ram.setU16(a4 + 0x08, 0);                              // $2A666A
  const passes = u16(ram.u16(a4 + 0x0a) - 1);            // $2A666E subq.w #1,($A,A4)
  ram.setU16(a4 + 0x0a, passes);
  if (passes !== 0) return;                              // $2A6672 bne.s -> the rts
  ram.setU16(a4 + 0x06, 0x2010);                         // $2A6674 -- ($6,A4) $20, ($7,A4) $10
  ram.setU16(a4 + 0x0e, 0x1111);                         // $2A667A -- ($E,A4) and ($F,A4)
  ram.setU16(a4 + 0x02, 1);                              // $2A6680 -- state 1
}

// ============================================= A4 SCRIPT 6 -- THE OPENING ATTACK HANDOFF
// W561. The init has no `rts`, so its first dispatch starts A3 script 2 and A1 gun 0,
// then immediately runs the step. The step waits while any gun-0 slot exists. Once the gun
// retires, it starts A4 script 7 and frees its own slot in the same scheduler pass.

/** `$2A67C2`. Start A3 script 2 and one A1 gun-0 slot, then fall through to the step. */
export function s6Init2A67C2(ram) {
  a3Start259962(ram, 2);                                  // $2A67C2/$2A67C4 jsr $259962
  a1Start259A18(ram, 0);                                  // $2A67CA/$2A67CC jsr $259A18
}

/** `$2A67D2`. Wait for A1 gun 0 to retire, then hand over to A4 script 7. */
export function s6Step2A67D2(ram, a4) {
  if (a1Running259A4A(ram, 0)) return;                    // $2A67D2/$2A67D4/$2A67DA bcs.s
  a4Start25980C(ram, 7);                                  // $2A67DC/$2A67DE jsr $25980C
  ram.setU16(a4, 0);                                      // $2A67E4 clr.w (A4)
}

/** `$2A67E8`. Seed the 96-frame delay, then fall through into the step. */
export function s7Init2A67E8(ram, a4) {
  ram.setU16(a4 + 0x02, 0x0060);
}

/** `$2A67EE`. Start gun 1 after the freeze-aware delay, then wait and hand to A4 8. */
export function s7Step2A67EE(ram, a4) {
  if (ram.u16(a4 + 0x02) !== 0) {
    if (ram.u16(HIBACHI_A4.freeze) !== 0) return;
    const left = u16(ram.u16(a4 + 0x02) - 1);
    ram.setU16(a4 + 0x02, left);
    if (left !== 0) return;
    a1Start259A18(ram, 1);
  }
  if (a1Running259A4A(ram, 1)) return;
  a4Start25980C(ram, 8);
  ram.setU16(a4, 0);
}

/** `$2A6820`. Seed the 96-frame delay, then fall through into the step. */
export function s8Init2A6820(ram, a4) {
  ram.setU16(a4 + 0x02, 0x0060);
}

/** `$2A6826`. Start gun 2 after the freeze-aware delay, then wait and hand to A4 9. */
export function s8Step2A6826(ram, a4) {
  if (ram.u16(a4 + 0x02) !== 0) {
    if (ram.u16(HIBACHI_A4.freeze) !== 0) return;
    const left = u16(ram.u16(a4 + 0x02) - 1);
    ram.setU16(a4 + 0x02, left);
    if (left !== 0) return;
    a1Start259A18(ram, 2);
  }
  if (a1Running259A4A(ram, 2)) return;
  a4Start25980C(ram, 9);
  ram.setU16(a4, 0);
}

/** `$2A6858`. Seed the freeze-aware pre-delay and unguarded post-gun cooldown. */
export function s9Init2A6858(ram, a4) {
  ram.setU16(a4 + 0x02, 0x0060);
  ram.setU16(a4 + 0x04, 0x0040);
}

/** `$2A6864`. Start gun 3, wait for it, then cool down and restart A4 script 6. */
export function s9Step2A6864(ram, a4) {
  if (ram.u16(a4 + 0x02) !== 0) {
    if (ram.u16(HIBACHI_A4.freeze) !== 0) return;
    const left = u16(ram.u16(a4 + 0x02) - 1);
    ram.setU16(a4 + 0x02, left);
    if (left !== 0) return;
    a1Start259A18(ram, 3);
  }
  if (a1Running259A4A(ram, 3)) return;
  const cooldown = u16(ram.u16(a4 + 0x04) - 1);
  ram.setU16(a4 + 0x04, cooldown);
  if (cooldown !== 0) return;
  a4Start25980C(ram, 6);
  ram.setU16(a4, 0);
}

/** `$2A69D0`. Seed the live HP-interrupt timers and unlock all six attached parts. */
export function sEInit2A69D0(ram, a4, a6) {
  ram.setU16(a4 + 0x02, 0x0040);
  ram.setU16(a4 + 0x04, 0x0001);
  for (const part of A3_S2_PARTS) ram.setU8(a6 + part + 0x1e, 0);
}

/** `$2A6A00`. Start gun 4 after the guarded delay, then make the boss vulnerable. */
export function sEStep2A6A00(ram, a4, a6) {
  if (ram.u16(a4 + 0x02) !== 0) {
    if (ram.u16(HIBACHI_A4.freeze) !== 0) return;
    const left = u16(ram.u16(a4 + 0x02) - 1);
    ram.setU16(a4 + 0x02, left);
    if (left !== 0) return;
    a1Start259A18(ram, 4);
  }
  if (ram.u16(a4 + 0x04) === 0) return;
  const secondary = u16(ram.u16(a4 + 0x04) - 1);
  ram.setU16(a4 + 0x04, secondary);
  if (secondary !== 0) return;
  ram.setU16(a6 + 0x108, 0);
}

// ------------------------------------------------------------------------- the registrations
//
// **THE INIT IS NOT A ROUTINE OF ITS OWN.**  W403, and it was wrong in every one of W399's
// three scripts.  Not one of HIBACHI's twenty-one A4 pairs puts an `rts` between the init and
// the step: in all 21, `table[id].step - table[id].init` is exactly the init's instruction
// bytes and the word immediately before the step entry is the init's LAST OPERAND.
//
//   $2A5A1C  397C 00C0 0002 / 397C 0303 0004            then $2A5A28, the step
//   $2A5EA0  397C 0001 0002 / ... / 4EB9 0023C4E0       then $2A5EB8, the step
//   $2A62FA  397C 0001 0002 / ... / 4EB9 0023C4E0       then $2A6312, the step
//
// `$2596FA jsr (A0)` enters at the INIT pointer on the first frame, so the cartridge runs the
// init AND the step in that one call.  (Contrast the stage-1 boss's part scripts, `$29393A`
// and `$293B82`: the word before each of those steps IS `4E75`.  The convention is per-table,
// so this cannot be assumed either way -- it has to be read.)
//
// Every frame number in this chain moves by one because of it.
const initThenStep = (init, step) => (ram, rom, ctx, a4) => { init(ram, rom, ctx, a4); step(ram, rom, ctx, a4); };

// ===========================================================================
// W420 -- A4 SCRIPT $14, `$2A6B7A`, HIBACHI'S **FIRST-LOOP** ENDING
// ===========================================================================
//
// Six instructions, and the whole of it:
//
//   $2A6B7A  39 7c 00 80 00 02   move.w #$80,($2,A4)    init: load 128
//   $2A6B80  53 6c 00 02         subq.w #1,($2,A4)      step: count down
//   $2A6B84  66 00 00 0a         bne.w  -> $2A6B90      ext word $2A6B86 + $0A
//   $2A6B88  4e b9 00 25 95 e8   jsr $2595E8            the ending store
//   $2A6B8E  42 54               clr.w (A4)             free the slot (TRAP: 4254)
//   $2A6B90  4e 75               rts
//
// **CODE IS `$18`**, `$2A6B7A..$2A6B91`.  `$2A6B92..$2A6B93` is two bytes of ALIGNMENT and
// `$2A6B94` is `bossBody2A6B94`, a unit ported long ago -- so the `$1A` this file used to
// count is `$18` + padding.  A third shape for that gap: W419's trailing bytes were the
// unit's own tables and W418's were the next unit's, and here it is neither.
//
// **Entry-to-entry cannot bound this one at all**: `$14` is the LAST table entry, and index
// 21 reads `$70004EB9` -- `moveq #0,D0 / jsr`, code and not a pointer, which is the same
// witness W403 used for "the table ends where its own first script begins".
//
// **THE TWO ENDINGS ARE NOT VARIANTS OF ONE ROUTINE.**  A scan of `$2A0000..$2AB000` for
// `moveq #$14` before a `jsr`/`jmp $25980C` finds exactly ONE starter, `$2A5CB4`, script 1's
// first-loop arm.  A4 script 5 -- the second-loop arm, W409 -- is `$270` of code that runs
// sixteen spawns, a `$28B34A` blast, three ramps, a `$246410` chain and a `($2,A6) += $1400`
// push BEFORE its own `$2595E8`.  This one waits and ends.  The cartridge gives loop one a
// bare beat and saves the finale for loop two.

/** `$2A6B7A`.  One store: the 128-frame beat. */
export function s14Init2A6B7A(ram, a4) {
  ram.setU16(a4 + 0x02, 0x0080);                         // $2A6B7A move.w #$80,($2,A4)
}

/** `$2A6B80`.  Count down; on zero suspend the stage and free the slot, both same frame. */
export function s14Step2A6B80(ram, a4) {
  const left = u16(ram.u16(a4 + 0x02) - 1);              // $2A6B80 subq.w #1,($2,A4)
  ram.setU16(a4 + 0x02, left);
  if (left !== 0) return;                                // $2A6B84 bne.w -> $2A6B90 (the rts)
  suspend2595E8(ram);                                    // $2A6B88 jsr $2595E8
  ram.setU16(a4, 0);                                     // $2A6B8E clr.w (A4) -- 4254, the SLOT
}

registerScript(HIBACHI_A2.object0, a2Object0_2A4702);
registerScript(HIBACHI_A2.object1, a2Object1_2A478C);
registerScript(HIBACHI_A2.object2, a2Object2_2A47D6);
registerScript(HIBACHI_A2.object3, a2Object3_2A4816);
registerScript(HIBACHI_A2.object4, a2Object4_2A4866);
registerScript(HIBACHI_A2.object5, a2Object5_2A48B6);
registerScript(HIBACHI_A2.object6, a2Object6_2A4906);
registerScript(HIBACHI_A2.object7, a2Object7_2A4956);
registerScript(HIBACHI_A2.object8, a2Object8_2A49A6);
registerScript(HIBACHI_A2.object9, a2Objects9And15_2A4AF6); // object 15 is the same pointer
registerScript(HIBACHI_A2.object10, a2Object10_2A4C42);
registerScript(HIBACHI_A2.object11, a2Object11_2A4B58);
registerScript(HIBACHI_A2.object12, a2Object12_2A4BC8);
registerScript(HIBACHI_A2.object13, a2Object13_2A4BA0);
registerScript(HIBACHI_A2.object14, a2Object14_2A4C08);

registerScript(HIBACHI_A0.s0Init, initThenStep(
  (ram, rom, ctx) => main0Init2A4F56(ram, rom, ctx),
  (ram, rom, ctx) => main0Step2A4F86(ram, rom, ctx)));
registerScript(HIBACHI_A0.s0Step,
  (ram, rom, ctx) => main0Step2A4F86(ram, rom, ctx));
registerScript(HIBACHI_A0.s1Init, initThenStep(
  (ram, _rom, ctx, a4) => main1Init2A4F90(ram, ctx, a4),
  (ram, _rom, ctx, a4) => main1Step2A4FAE(ram, ctx, a4)));
registerScript(HIBACHI_A0.s1Step,
  (ram, _rom, ctx, a4) => main1Step2A4FAE(ram, ctx, a4));
registerScript(HIBACHI_A0.s2Init, initThenStep(
  (ram, rom, ctx, a4) => main2Init2A5054(ram, rom, ctx, a4),
  (ram, rom, ctx, a4) => main2Step2A506C(ram, rom, ctx, a4)));
registerScript(HIBACHI_A0.s2Step,
  (ram, rom, ctx, a4) => main2Step2A506C(ram, rom, ctx, a4));

registerScript(HIBACHI_A3.s0Init, initThenStep(
  (ram, _rom, ctx, a4) => a3s0Init2A54D6(ram, ctx, a4),
  (ram, _rom, ctx, a4) => a3s0Step2A54E2(ram, ctx, a4)));
registerScript(HIBACHI_A3.s0Step,
  (ram, _rom, ctx, a4) => a3s0Step2A54E2(ram, ctx, a4));
registerScript(HIBACHI_A3.s1Init, initThenStep(
  (ram, _rom, ctx, a4) => a3s1Init2A5502(ram, ctx, a4),
  (ram, _rom, ctx, a4) => a3s1Step2A550E(ram, ctx, a4)));
registerScript(HIBACHI_A3.s1Step,
  (ram, _rom, ctx, a4) => a3s1Step2A550E(ram, ctx, a4));
registerScript(HIBACHI_A3.s2Init, initThenStep(
  (ram, _rom, _ctx, a4) => a3s2Init2A552E(ram, a4),
  (ram, rom, ctx, a4) => a3s2Step2A5534(ram, rom, ctx, a4)));
registerScript(HIBACHI_A3.s2Step,
  (ram, rom, ctx, a4) => a3s2Step2A5534(ram, rom, ctx, a4));
registerScript(HIBACHI_A3.s3Init, initThenStep(
  (ram, _rom, ctx, a4) => a3s3Init2A56A2(ram, ctx, a4),
  (ram, _rom, ctx, a4) => a3s3Step2A56AE(ram, ctx, a4)));
registerScript(HIBACHI_A3.s3Step,
  (ram, _rom, ctx, a4) => a3s3Step2A56AE(ram, ctx, a4));
registerScript(HIBACHI_A3.s4Init, initThenStep(
  (ram, _rom, ctx, a4) => a3s4Init2A56CE(ram, ctx, a4),
  (ram, _rom, ctx, a4) => a3s4Step2A56DA(ram, ctx, a4)));
registerScript(HIBACHI_A3.s4Step,
  (ram, _rom, ctx, a4) => a3s4Step2A56DA(ram, ctx, a4));

registerScript(HIBACHI_A4.s0Init, initThenStep(
  (ram, rom, ctx, a4) => s0Init2A592E(ram, ctx, a4),
  (ram, rom, ctx, a4) => s0Step2A597C(ram, rom, ctx, a4)));
registerScript(HIBACHI_A4.s0Step, (ram, rom, ctx, a4) => s0Step2A597C(ram, rom, ctx, a4));
registerScript(HIBACHI_A4.s1Init, initThenStep(
  (ram, rom, ctx, a4) => s1Init2A5A1C(ram, a4),
  (ram, rom, ctx, a4) => s1Step2A5A28(ram, rom, ctx, a4)));
registerScript(HIBACHI_A4.s1Step, (ram, rom, ctx, a4) => s1Step2A5A28(ram, rom, ctx, a4));
registerScript(HIBACHI_A4.s2Init, initThenStep(
  (ram, rom, ctx, a4) => s2Init2A5EA0(ram, ctx, a4),
  (ram, rom, ctx, a4) => s2Step2A5EB8(ram, rom, ctx, a4)));
registerScript(HIBACHI_A4.s2Step, (ram, rom, ctx, a4) => s2Step2A5EB8(ram, rom, ctx, a4));
registerScript(HIBACHI_A4.s3Init, initThenStep(
  (ram, rom, ctx, a4) => s3Init2A5F8E(ram, a4),
  (ram, rom, ctx, a4) => s3Step2A5FA2(ram, rom, ctx, a4)));
registerScript(HIBACHI_A4.s3Step, (ram, rom, ctx, a4) => s3Step2A5FA2(ram, rom, ctx, a4));
registerScript(HIBACHI_A4.s4Init, initThenStep(
  (ram, rom, ctx, a4) => s4Init2A62FA(ram, a4),
  (ram, rom, ctx, a4) => s4Step2A6312(ram, rom, ctx, a4)));
registerScript(HIBACHI_A4.s4Step, (ram, rom, ctx, a4) => s4Step2A6312(ram, rom, ctx, a4));
registerScript(HIBACHI_A4.s5Init, initThenStep(
  (ram, rom, ctx, a4) => s5Init2A6418(ram, rom, ctx, a4),
  (ram, rom, ctx, a4) => s5Step2A6458(ram, rom, ctx, a4)));
registerScript(HIBACHI_A4.s5Step, (ram, rom, ctx, a4) => s5Step2A6458(ram, rom, ctx, a4));
registerScript(HIBACHI_A4.s6Init, initThenStep(
  (ram) => s6Init2A67C2(ram),
  (ram, rom, ctx, a4) => s6Step2A67D2(ram, a4)));
registerScript(HIBACHI_A4.s6Step, (ram, rom, ctx, a4) => s6Step2A67D2(ram, a4));
registerScript(HIBACHI_A4.s7Init, initThenStep(
  (ram, rom, ctx, a4) => s7Init2A67E8(ram, a4),
  (ram, rom, ctx, a4) => s7Step2A67EE(ram, a4)));
registerScript(HIBACHI_A4.s7Step, (ram, rom, ctx, a4) => s7Step2A67EE(ram, a4));
registerScript(HIBACHI_A4.s8Init, initThenStep(
  (ram, rom, ctx, a4) => s8Init2A6820(ram, a4),
  (ram, rom, ctx, a4) => s8Step2A6826(ram, a4)));
registerScript(HIBACHI_A4.s8Step, (ram, rom, ctx, a4) => s8Step2A6826(ram, a4));
registerScript(HIBACHI_A4.s9Init, initThenStep(
  (ram, rom, ctx, a4) => s9Init2A6858(ram, a4),
  (ram, rom, ctx, a4) => s9Step2A6864(ram, a4)));
registerScript(HIBACHI_A4.s9Step, (ram, rom, ctx, a4) => s9Step2A6864(ram, a4));
registerScript(HIBACHI_A4.sEInit, initThenStep(
  (ram, rom, ctx, a4) => sEInit2A69D0(ram, a4, bossA6(ctx, HIBACHI_A4.sEInit)),
  (ram, rom, ctx, a4) => sEStep2A6A00(ram, a4, bossA6(ctx, HIBACHI_A4.sEStep))));
registerScript(HIBACHI_A4.sEStep, (ram, rom, ctx, a4) =>
  sEStep2A6A00(ram, a4, bossA6(ctx, HIBACHI_A4.sEStep)));
registerScript(HIBACHI_A4.s14Init, initThenStep(
  (ram, rom, ctx, a4) => s14Init2A6B7A(ram, a4),
  (ram, rom, ctx, a4) => s14Step2A6B80(ram, a4)));
registerScript(HIBACHI_A4.s14Step, (ram, rom, ctx, a4) => s14Step2A6B80(ram, a4));

/** The A4 ids whose init AND step this file registers. A test asserts this against the
 *  cartridge's own table rather than against the list above. */
export const HIBACHI_END_SCRIPTS = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0x0e, 0x14,
]);

/** Every A4 id the chain hands to that is NOT ported, with the byte extent each occupies
 *  between its table entry and the next one. Counted, with the numbers measured. */
export const HIBACHI_END_COUNTED = Object.freeze({
  // W565: $E is no longer omitted. This file runs its live HP-interrupt wrapper and gun-4 start.
  // W552: 0 is no longer here. `$2A4384` starts it and this file runs both entries.
  // W404/W405: $0A..$0D are no longer here -- `src/hibachiguns.js` ports all four, together
  // with A1 guns 5, 6, 7 and 8, and the real path now RUNS the {$A,$B,$C,$D} attack loop
  // rather than stopping inside it.
  // W420: $14 is no longer here -- this file runs it. Its $1A is $18 of CODE plus two
  // bytes of alignment before `bossBody2A6B94`, not another unit's data.
  // W406: $0F is no longer here -- `src/hibachiguns.js` runs it, together with A1 gun 9, and
  // the real path now takes the whole `$F -> gun 9` link instead of stopping in front of it.
  // W407: $10 and $11 are no longer here -- `src/hibachiguns.js` runs both, together with A1
  // gun $B, so two of phase B's three links are live and the stop has moved on to gun $A.
  0x12: { init: 0x2a6afc, step: 0x2a6b08, bytes: 0x004c, why: 'the same shape over A1 gun $C, '
    + 'and it hands to $F ($2A6B34) -- but NO `moveq #$12 / jsr $25980C` exists anywhere in '
    + '$2A4000..$2AB000, so nothing in the boss ROM starts it. It is an ENTRY, not a link' },
  // W409: 5 is no longer here -- this file runs it. Its $3AA entry-to-entry is $270 of code,
  // $100 of its own data and $3A that belong to A4 script 0 ($2A5A04's lea names $2A6788).
  0x13: { init: 0x2a6b48, step: 0x2a6b56, bytes: 0x0032, why: 'phase B\'s $23000 phase check '
    + 'starts it ($2A71EE), alongside main sequencer $B' },
});
