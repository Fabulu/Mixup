// THE POWER-UP LOOP. ROM: `$894B` (the meter), `$8974`/`$8989` (apply) and
// `$9C45` (the rank `$17`).
//
// ======================= WHERE THE THREE OF THEM RUN ========================
//
//   9A70  20 E2 BF  JSR $BFE2   ... -> $C1AF -> $894B    the PICKUP
//   9A73  20 74 89  JSR $8974                            the APPLY
//   ...
//   9AC4  20 45 9C  JSR $9C45                            the RANK
//
// PICKUP PRECEDES APPLY IN THE SAME FRAME, which is the whole reason `$8974`
// tests `$07` (HELD) rather than `$05` (the edge): touch a capsule with B
// already down and `$42` is INC'd at `$9A70` and consumed at `$9A73`, so the
// power-up lands on the touch frame and `$42` is never observably non-zero.
//
// MEASURED as a controlled pair on the same capsule -- first by pow.py
// (00-recon-powerups.md 3, re-run this wave), then as two corpus scenarios whose
// scripts differ in ONE CHARACTER. From their own recorded artifacts, every
// watched transition in the two 299-frame windows is identical except this:
//
//   capsule-pickup   "300:A"   f647  w_0042 0 -> 1     w_0040 stays 0
//   capsule-consume  "300:AB"  f647  w_0042 stays 0    w_0040 0 -> 1
//
// (The recon's own run put the same capsule at f626, because it poked `$44` from
// frame 390 and the corpus pokes it from the align at 400 -- ten extra frames of
// laser move every kill. Both numbers are real; the artifact is the authority
// for the scenario.)
//
// ============================== THE SIX ARMS =================================
//
// `$8984 LDA $42 / JSR $83E4` with the inline word table at `$8989`:
//
//   $42  arm     bar label   effect                     already owned
//    0   $8983   --          RTS                        --
//    1   $89A1   SPEED UP    INC $40, $42=0, sfx, $8A30  NO TEST AT ALL
//    2   $89AF   MISSILE     INC $41, $42=0, sfx         $41 != 0  -> keep $42
//    3   $89BB   DOUBLE      $44=2,   $42=0, sfx         $44 == 2  -> keep $42
//    4   $89CF   LASER       $44=1,   $42=0, sfx         $44 == 1  -> keep $42
//    5   $89D3   OPTION      INC $45, $42=0, sfx         $45 >= 2  -> keep $42
//    6   $8997   ?/SHIELD    $46=5,   $42=0, sfx         $46 != 0  -> keep $42
//
// THE REFUSALS KEEP THE CAPSULE. Measured with B held for 20 consecutive frames
// per arm: `$42` held its value the whole time in all five owned cases. That is
// not a detail -- a port that consumed on refusal would clear a compared byte.
//
// SPEED UP HAS NO CAP AND NO OWNED TEST. `$40` is 8-bit and unbounded; the
// saturation a player feels is in `$A006`'s `min(($40+2)&$FF, $10)`, which wraps
// at `$40 = 254` and makes the ship STOP. src/player.js has that; this file must
// not "helpfully" clamp `$40` here.
//
// `$45` IS CAPPED AT 2 BY THE ARM ONLY (`$89D5 CMP #$02 / BCS`). Nothing else in
// the game bounds it.

import { u8 } from './state.js';
import { meterCursor } from './hud.js';
import { scoreCapsule, scoreCapsuleBonus, scoreDigit } from './score.js';

/**
 * `$894B` -- the meter takes a capsule. Reached from `$C1AF` only.
 *
 *   894B  E6 42     INC $42
 *   894D  A5 42     LDA $42 / C9 07 CMP #$07 / 90 16 BCC $8969
 *   8953  20 89 CE  JSR $CE89              A := ($07E5 + 4*$18) AND $0F
 *   8956  D0 04     BNE $895C
 *   8958  A9 04     LDA #$04 / 85 35 STA $35     RAPID FIRE: $35 20 -> 4
 *   895C  C9 05     CMP #$05 / D0 05 BNE $8965
 *   8960  A9 10     LDA #$10 / 20 55 84 JSR $8455    +$001000 -- a score bonus
 *   8965  A9 01     LDA #$01 / 85 42 STA $42    <- WRAPS TO 1, NOT TO 0
 *   8969  20 5B 84  JSR $845B                  +$0050, every capsule
 *   896C  A9 0D     LDA #$0D / 20 1E EC JSR $EC1E   sfx $0D. Wave 8.
 *   8971  4C 30 8A  JMP $8A30                  redraw the meter cursor
 *
 * THE SEVENTH CAPSULE'S BONUS IS GATED ON A DIGIT OF THE SCORE, and that is
 * semantically surprising enough that it was measured six ways rather than read
 * (00-recon-powerups.md 2): with `$42` forced to 6 so the INC lands on 7,
 * `$07E5 = $00` and `$07E5 = $10` both took the rapid-fire arm, `$07E5 = 7` took
 * neither, and `$07E5 = 5` took the score bonus and left `$35` at 20. It is the
 * LOW NIBBLE, and `$CE89` is `LDA $18 / ASL / ASL / TAY / LDA $07E5,Y`.
 *
 * The corpus reaches the rapid-fire arm without inventing anything. `capsule-die`
 * pokes `$42 = 6` at f626, during a laser run that is dropping capsules; the ship
 * touches the next one at f635 with `$07E5` still 0, so the INC lands on 7 and
 * takes the rapid-fire arm. MEASURED, from that scenario's own artifact: `$42`
 * 6 -> 1 and `$35` 20 -> 4 at f635, `$8960` (the `== 5` bonus) n = 0.
 *
 * The nine frames between the poke and the pickup are not slack -- they are
 * `$42 = 6` sitting in a compared byte with B not held, which is what the meter
 * looks like on a cartridge with six capsules and no thumb on B.
 *
 * `$8971 JMP $8A30` is a JUMP into the middle of `$89E3`'s tail, not a call to a
 * routine of its own -- see src/hud.js meterCursor().
 */
export function pickupCapsule(state, res) {
  const zp = state.zp;
  zp.meter = u8(zp.meter + 1);                    // $894B INC $42
  if (zp.meter >= 0x07) {                         // $894F CMP #$07 / $8951 BCC
    const digit = scoreDigit(state);              // $8953 JSR $CE89
    if (digit === 0) zp.autofire = 0x04;          // $8956 BNE / $8958 STA $35
    if (digit === 0x05) scoreCapsuleBonus(state); // $895C CMP #$05 / $8960/$8962
    zp.meter = 1;                                 // $8965/$8967 -- 1, not 0
  }
  scoreCapsule(state);                            // $8969 JSR $845B, +$0050
  state.sfx.push(0x0D);                           // $896C LDA #$0D / JSR $EC1E
  meterCursor(state, res.hudPackets);             // $8971 JMP $8A30
}

/**
 * `$8974` -- spend the meter, if B is HELD and the ship is exactly alive.
 *
 *   8974  AD 00 01  LDA $0100 / C9 01 CMP #$01 / D0 08 BNE $8983
 *   897B  A6 18     LDX $18 / B5 07 LDA $07,X / 29 40 AND #$40
 *   8981  D0 01     BNE $8984 ; else $8983 RTS
 *   8984  A5 42     LDA $42 / 20 E4 83 JSR $83E4 -> jt_8989
 *
 * `CMP #$01 / BNE` IS AN EQUALITY TEST, not `>= 1`: a dying ship ($0100 = 2) is
 * refused, and so is a slot that is somehow 0. And `$07,X` is the HELD byte --
 * `$05` is the edge one, seven bytes of zero page apart and one measurement
 * apart: with B held and `$42` poked to 1 on every frame, `$40` climbed by one
 * PER FRAME (22 increments in 21 frames). An edge port moves it once.
 */
export function applyCapsule(state, res) {
  const zp = state.zp;
  if (state.obj.status[0] !== 1) return;          // $8974-$8979 BNE $8983
  const p = zp.player;                            // $897B LDX $18
  if (p !== 0 && p !== 1) {
    throw new Error(`$897D LDA $07,X with $18 = ${p}: only 0 and 1 are player `
                  + 'indices, and $07/$08 are the two held-button bytes');
  }
  // $897D LDA $07,X. The port keeps ONE held byte (player 1's $07); $18 is 0 on
  // every frame of every measured run and playerIndex() above is the tripwire.
  if ((state.input.held & 0x40) === 0) return;    // $897F AND #$40 / $8981 BNE
  switch (zp.meter) {                             // $8984 LDA $42 / JSR $83E4
    case 0: return;                                       // $8983 RTS
    case 1:                                               // $89A1 SPEED UP
      zp.speed = u8(zp.speed + 1);                // $89A1 INC $40 -- NO CAP
      zp.meter = 0;                               // $89A3/$89A5
      state.sfx.push(0x0E);                       // $89A7/$89A9 JSR $EC1E
      meterCursor(state, res.hudPackets);         // $89AC JMP $8A30
      return;
    case 2:                                               // $89AF MISSILE
      if (zp.missile !== 0) return;               // $89B1 BNE $8983 -- KEEP $42
      zp.missile = u8(zp.missile + 1);            // $89B3 INC $41
      break;                                      // $89B5 -> $89DD
    case 3:                                               // $89BB DOUBLE
      if (zp.weapon === 2) return;                // $89BF-$89C3 -- KEEP $42
      zp.weapon = 2;                              // $89C5/$89C7 ($98 = 2)
      break;                                      // $89C9 -> $89DD
    case 4:                                               // $89CF LASER
      // $89CF LDA #$01 / BNE $89BD -- the SAME three instructions as DOUBLE with
      // $98 = 1. One routine, two entry points; do not split them apart.
      if (zp.weapon === 1) return;                // $89BF-$89C3 -- KEEP $42
      zp.weapon = 1;                              // $89C5/$89C7
      break;
    case 5:                                               // $89D3 OPTION
      if (zp.options >= 2) return;                // $89D5/$89D7 BCS -- KEEP $42
      zp.options = u8(zp.options + 1);            // $89D9 INC $45
      break;                                      // $89DB -> $89C9 -> $89DD
    case 6:                                               // $8997 ?/SHIELD
      if (zp.shield !== 0) return;                // $8999 BNE $8983 -- KEEP $42
      zp.shield = 5;                              // $899B/$899D LDA #$05
      break;                                      // $899F -> $89B5 -> $89DD
    default:
      // $42 is 0..6 by construction ($894B wraps 7 to 1) but jt_8989 has only
      // seven entries, so a larger value would run $83E4 off the end of the
      // table and into `$8997`'s bytes. Loud rather than silently masked.
      throw new Error(`$8984: $42 = ${zp.meter}, but jt_8989 has seven entries `
                    + '(0..6). $83E4 would dispatch through whatever follows it.');
  }
  // $89B5/$89C9 (`$42 = 0`) and then $89DD (sfx $0E, RTS). Arms 2-6 share these
  // two tails and NONE of them redraws the cursor -- only SPEED UP jumps to
  // $8A30 -- so after a MISSILE/DOUBLE/LASER/OPTION/SHIELD the bar keeps showing
  // the old cursor until $8898's rotation comes round to $89E3 again.
  state.zp.meter = 0;                             // $89B5/$89B7 or $89C9/$89CB
  state.sfx.push(0x0E);                           // $89DD/$89DF JSR $EC1E
}

/**
 * `$9C45` -- the RANK. One byte, recomputed from scratch every frame at `$9AC4`.
 *
 *   9C45  A0 00     LDY #$00
 *   9C47  A6 44     LDX $44 / F0 01 BEQ $9C4C / C8 INY        ($44 != 0)
 *   9C4C  98        TYA / 18 CLC / 65 45 ADC $45 / A8 TAY     + $45
 *   9C51  A5 46     LDA $46 / F0 01 BEQ $9C56 / C8 INY        + ($46 != 0)
 *   9C56  A5 19     LDA $19 / F0 01 BEQ $9C5B / C8 INY        + ($19 != 0)
 *   9C5B  84 17     STY $17
 *
 * It is a pure function of four bytes with no accumulator and no hysteresis, so
 * it cannot drift: get the four inputs right and `$17` is right. Stage 1 can
 * reach 0..4 ($45 is capped at 2 and $19 is 0), and `capsule-sweep` drives it
 * 0,1,2,3,4 inside one 300-frame window.
 *
 * IT IS NOT WIPED BY THE DEATH. `$9B3E` clears `$3D-$97`, and `$17` is below
 * that range, so after a death `$17` keeps the value the last `$9AC4` computed
 * until the next mode-5 tail runs -- the intro states never reach `$9AC4`. The
 * port must therefore compute it in exactly one place, which is why this is not
 * folded into whoever writes `$44`/`$45`/`$46`.
 *
 * ITS CONSUMERS: 23 reads, and the plan's risk 5 names `$BBE5` (`$17 >= 3` makes
 * enemy fire timers count down by 2). MEASURED THIS WAVE, in the scenario that
 * crosses the threshold: `$BBE5` n = 0 with `$17` = 4, because `$BBC1 BEQ $BBEC`
 * jumps the whole ladder when `$19 | $1A` is 0 -- stage 1 loop 1 never gets
 * there. The stage-1 consumers that ARE live ($BCB8 aim, $BD5F/$BDB3 bullet
 * speed) sit behind `$BC59`, the enemy-bullet allocator, which is a loud throw.
 */
export function computeRank(state) {
  const zp = state.zp;
  let y = 0;                                      // $9C45 LDY #$00
  if (zp.weapon !== 0) y += 1;                    // $9C47/$9C49/$9C4B INY
  y = u8(y + zp.options);                         // $9C4C-$9C50 CLC / ADC $45
  if (zp.shield !== 0) y = u8(y + 1);             // $9C51/$9C53/$9C55 INY
  if (state.zp19 !== 0) y = u8(y + 1);            // $9C56/$9C58/$9C5A INY
  state.zp17 = y;                                 // $9C5B STY $17
}
