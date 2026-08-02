// The Vic Viper. ROM: `sub_9FFC` ($9FFC-$A234), called once per game frame
// from $9A6A inside the mode-5 stage handler.
//
// SCOPE OF THIS FILE: $9FFC does six things -- speed, X, Y, the position ring
// and the Options, the tilt latch, and firing plus the missile/shot movement
// loops. This file is the FIRST FIVE, i.e. $A006-$A0DB, which is exactly what
// NOTES-player.md sections 3-8 proved with a free-running model.
//
// THE SIXTH IS src/weapons.js -- WAVE 6, and this header used to say "firing
// ($A0E9-$A234) is NOT here: the shot slot types $0123/$0126/$0129 are opaque
// and were never reversed" (rule 6: the note goes with the code). They are the
// three parameter tables at $A0E0/$A0E3/$A0E6 indexed by $44. There is no call
// between the two halves: $A0CB's `BMI $A0E9` is the exit of the Option
// animation loop below and the entry of the firing block, and $9FFC's own dead
// gate `JMP $A16F` lands in the MIDDLE of weapons.js -- past firing, into the
// two movement loops, which is why a shot keeps flying while the ship explodes.
//
// Everything below was measured on the running cartridge and then checked
// against the PRG bytes, and the model this file is a transcription of was
// free-run against the machine's RAM for 234 consecutive frames on two runs,
// exact on all 15 compared fields, with six negative controls each seen red
// (NOTES-player.md 11).

import { u8, RING_LEN } from './state.js';
import { weaponUpdate } from './weapons.js';

// --- clamps, straight out of the compare instructions --------------------
// $A028: C9 F0   X max  240   <-- PROBE.md's "[16, 220]" is WRONG. 220 was the
// $A03A: C9 10   X min   16       furthest one 160-frame hold got, not a wall;
// $A052: C9 C0   Y max  192       the ship has been driven to 240.
// $A06C: C9 10   Y min   16
export const X_MAX = 0xF0, X_MIN = 0x10, Y_MAX = 0xC0, Y_MIN = 0x10;

/**
 * `$A285` -- the 16-bit ADD, and the whole trick of page $0300 in one place.
 *
 *   A285: A5 98      LDA $98
 *   A287: 18         CLC
 *   A288: 79 40 03   ADC $0340,Y      <- Y = 0 vertical, Y = $40 horizontal
 *   A28B: 99 40 03   STA $0340,Y
 *   A28E: A5 99      LDA $99
 *   A290: 79 20 03   ADC $0320,Y
 *   A293: 99 20 03   STA $0320,Y
 *   A296: 60         RTS
 *
 * ONE subroutine services both axes because the four arrays are $20 apart and
 * Y is either 0 or $40. Returns the new INTEGER byte in A -- unclamped; the
 * caller overwrites it with the clamped one, and both writes are real and both
 * show up in a write hook.
 *
 * `axis` here is 'x' or 'y', which is the same selector spelled in JS.
 */
function add16(state, axis, step) {
  const o = state.obj;
  const int = axis === 'x' ? o.x : o.y;
  const frac = axis === 'x' ? o.xf : o.yf;
  const f = frac[0] + (step & 0xFF);
  frac[0] = u8(f);
  int[0] = u8(int[0] + (step >> 8) + (f > 0xFF ? 1 : 0));
  return int[0];
}

/** `$A297` -- the 16-bit SUBTRACT, the mirror image of the above. */
function sub16(state, axis, step) {
  const o = state.obj;
  const int = axis === 'x' ? o.x : o.y;
  const frac = axis === 'x' ? o.xf : o.yf;
  const f = frac[0] - (step & 0xFF);
  frac[0] = u8(f);
  int[0] = u8(int[0] - (step >> 8) - (f < 0 ? 1 : 0));
  return int[0];
}

/**
 * `$A006-$A01A` -- speed. Six instructions decide the entire feel of the game.
 *
 *   A006: A5 40   LDA $40        speed level
 *   A008: 18      CLC
 *   A009: 69 02   ADC #$02       <- 8-BIT, AND IT WRAPS
 *   A00B: C9 10   CMP #$10
 *   A00D: 90 02   BCC $A011
 *   A00F: A9 10   LDA #$10       ceiling
 *   A011: 85 99   STA $99
 *   A013: A9 00   LDA #$00
 *   A015: 85 98   STA $98        $99:$98 = raw * 256
 *   A017: 46 99   LSR $99
 *   A019: 66 98   ROR $98        $99:$98 = raw * 128
 *
 * step = min(($40 + 2) & $FF, $10) * 128, in 1/256 px per frame.
 *
 * MEASURED over 17 speed levels by forcing $40 and reading the 16-bit delta;
 * every one matched. Two things fall out that the listing alone would not
 * settle:
 *   * speed SATURATES at 8.0 px/frame from $40 = 14 -- `INC $40` at $89A1 has
 *     no cap of its own, the cap is the `CMP #$10` on the biased value;
 *   * at $40 = 255 the `ADC #$02` wraps to 1, so the ship moves at HALF speed
 *     (measured 128/frame). Keeping the 8-bit wrap is not pedantry.
 *
 * It is also why the first recon reported "0 or 1 px per frame, never 2": at
 * $40 = 0 the step is exactly $0100 = 1.00 px, so the fraction byte never
 * moves and the motion only LOOKS integral.
 */
export function speedStep(speedLevel) {
  let raw = u8(speedLevel + 2);              // $A009 ADC #$02, 8-bit
  if (raw >= 0x10) raw = 0x10;               // $A00B/$A00F
  return (raw * 256) >> 1;                   // $A017/$A019 LSR/ROR
}

/**
 * `sub_9FFC`. Runs once per frame from $9A6A while mode 5 is in its play
 * state. The caller is responsible for the gates -- see nmi.js.
 *
 * @returns {boolean} true if the movement half ran (i.e. the player is alive)
 */
export function updatePlayer(state, res) {
  const o = state.obj;
  // $A01D: LDX $18 / $A01F: B5 07 -- the held byte is $0007 + $18, so player 2
  // reads $0008. $18 was 0 on every frame ever measured here and two-player is
  // unmeasured (NOTES-player.md 12), so this port models P1 only and asserts
  // rather than inventing a second input byte.
  if (state.zp.player !== 0) throw new Error('$18 != 0: two-player is unmeasured');
  const held = state.input.held;             // $0007

  // $9FFC: AD 00 01 / C9 02 / 90 03 / 4C 6F A1
  // The dead gate. `JMP $A16F` jumps PAST movement, ring, tilt and firing
  // straight into the missile/shot movement loops -- so bullets keep flying
  // while the ship is exploding. PROVED BY INTERVENTION: forcing $0100 = 3
  // over 60 frames of an otherwise identical run produced ZERO writes to
  // $0360 from either of its two writers, and zero from $A095 to the ring.
  // Wave 6 gave the JMP its destination: the two loops run, the firing block
  // does not.
  if (o.status[0] >= 2) {
    weaponUpdate(state, res, false);         // $A003 JMP $A16F
    return false;
  }

  const step = speedStep(state.zp.speed);    // $A006-$A01A  -> $99:$98
  state.zp.step = step;

  // ---- X. $A01D-$A042, and it is NOT symmetric with Y --------------------
  if (held & 0x01) {                         // $A021 AND #$01  RIGHT
    let v = add16(state, 'x', step);         // $A025 JSR $A285
    if (v >= X_MAX) v = X_MAX;               // $A028 CMP #$F0 / $A02C LDA #$F0
    o.x[0] = v;                              // $A02E STA $0360
  }
  // $A031 is a FALL-THROUGH target, not an `else`. Holding L+R runs BOTH:
  // add step, clamp, subtract step, clamp. Away from the walls the net
  // displacement is zero -- exercised as direction combination $3 by the
  // free-running model and reproduced exactly.
  if (held & 0x02) {                         // $A033 AND #$02  LEFT
    let v = sub16(state, 'x', step);         // $A037 JSR $A297
    if (v < X_MIN) v = X_MIN;                // $A03A CMP #$10 / $A03E LDA #$10
    o.x[0] = v;                              // $A040 STA $0360
  }
  // There is NO PRE-CHECK on X. At the right wall the integer is re-clamped to
  // $F0 every frame while $0380 keeps accumulating, so the sub-pixel byte is
  // not frozen. Y behaves differently, and the difference is observable.

  // ---- Y. $A043-$A07F: a pre-check, a priority, and an asymmetry ---------
  let tilt = 1;                              // $A043 LDA #$01 -> $9B: level
  let moved = false;
  let ny = o.y[0];

  if (held & 0x04) {                         // $A04B AND #$04  DOWN
    // $A04F/$A052: the PRE-check. At the floor DOWN writes NOTHING AT ALL --
    // not the integer, not the sub-pixel byte, not even the tilt code -- and
    // falls through into the UP test below. So "DOWN wins over UP" is only
    // true because DOWN is tested first; at Y >= $C0 with both held, UP is
    // honoured. The model variant that gave DOWN unconditional priority went
    // red on frame 535 of run B.
    if (o.y[0] < Y_MAX) {                    // $A054 BCS $A063
      let v = add16(state, 'y', step);       // $A056 JSR $A285
      if (v >= Y_MAX) v = Y_MAX;             // $A059 CMP #$C0 / $A05D LDA #$C0
      tilt = 2;                              // $A05F LDY #$02  nose-down
      ny = v;
      moved = true;                          // $A061 BNE $A07B -- skips UP
    }
  }
  if (!moved && (held & 0x08)) {             // $A065 AND #$08  UP
    // The pre-checks are ASYMMETRIC: DOWN blocks AT the wall (`>= $C0`), UP
    // blocks only BELOW it (`< $10`), so UP still runs and still moves the
    // sub-pixel byte while the ship sits on Y == $10.
    if (o.y[0] >= Y_MIN) {                   // $A06E BCC $A080
      let v = sub16(state, 'y', step);       // $A070 JSR $A297
      if (v < Y_MIN) v = Y_MIN;              // $A073 CMP #$10 / $A077 LDA #$10
      tilt = 3;                              // $A079 LDY #$03  nose-up
      ny = v;
      moved = true;
    }
  }
  if (moved) {
    state.zp.tilt = tilt;                    // $A07B STY $9B
    o.y[0] = ny;                             // $A07D STA $0320
  } else {
    state.zp.tilt = 1;                       // the $A043 LDA #$01 still stands
  }

  // ---- diagonals: there is no diagonal arm anywhere in $9FFC -------------
  // X is done, then Y is done, each with the SAME $99:$98 step. RIGHT+DOWN
  // moves the full step on both axes, so diagonal speed is step * sqrt(2).
  // The `diag-norm` model variant (halve the step on a diagonal) diverged at
  // frame 440 of run A and 485 of run B.

  // ---- the position ring, and the Options that trail through it ----------
  // $A080: B5 07 / 29 0F / F0 27 -- the ring advances ONLY while a direction
  // is held. Standing still freezes the whole Option chain in place. The
  // variant that advanced it every frame diverged at frame 362.
  if (held & 0x0F) {                         // $A082 AND #$0F
    let c = state.ring.cursor + 1;           // $A08A ADC #$01
    if (c >= RING_LEN) c -= RING_LEN;        // $A08C CMP #$18 / $A090 SBC #$18
    state.ring.cursor = c;                   // $A092 STA $0160
    state.ring.x[c] = o.x[0];                // $A099 STA $07A0,Y
    state.ring.y[c] = o.y[0];                // $A09F STA $07C0,Y

    // $A0A7 / $A0AA: TWO calls to $A2A9, and they run UNCONDITIONALLY --
    // whatever $45 says. Slots 1 and 2 are maintained from stage start even
    // with no Options collected, which is why the RAM probe saw them trailing
    // before anything was drawn.
    let idx = c;
    for (let slot = 1; slot <= 2; slot++) {
      idx = idx - 0x0B;                      // $A2A9 SEC / SBC #$0B
      if (idx < 0) idx += RING_LEN;          // $A2AE ADC #$18 (carry clear)
      o.x[slot] = state.ring.x[idx];         // $A2B4 STA $0360,Y
      o.y[slot] = state.ring.y[idx];         // $A2BA STA $0320,Y
    }
    // So the Options trail by 11 and 22 RING ENTRIES, not by 11 and 22 frames
    // -- identical only while a direction is held every frame. `opt-lag-12`
    // (lag 12 instead of 11) diverged at frame 340.
  }

  // ---- the tilt latch. $A0AD-$A0C7 ---------------------------------------
  //   A0AD: EE 40 01   INC $0140
  //   A0B0: 10 05      BPL $A0B7
  //   A0B2: A9 10      LDA #$10 / STA $0140     <- see below
  //   A0B7: AD 40 01   LDA $0140
  //   A0BA: C9 08      CMP #$08
  //   A0BC: 90 0A      BCC $A0C8
  //   A0BE: A5 9B      LDA $9B / STA $0120      the ship's sprite index
  //   A0C3: A9 00      LDA #$00 / STA $0140
  //
  // THE SHIP'S TILT IS LATCHED ONLY EVERY 8 FRAMES, from whatever $9B happened
  // to be on the frame the counter reached 8. A one-frame tap of UP between
  // latches is invisible. $0120 was proved CAUSAL, not correlated, by forcing
  // it and hashing the framebuffer: 1/2/3 give three different pictures, each
  // still a real picture.
  o.timer[0] = u8(o.timer[0] + 1);           // $A0AD INC $0140
  if (o.timer[0] & 0x80) o.timer[0] = 0x10;  // $A0B0/$A0B2 -- unreachable while
                                             // the CMP #$08 reset below exists;
                                             // kept for shape, per NOTES 12.
  if (o.timer[0] >= 0x08) {                  // $A0BA CMP #$08
    o.anim[0] = state.zp.tilt;               // $A0BE/$A0C0
    o.timer[0] = 0;                          // $A0C3/$A0C5
  }

  // ---- the Options' own animation. $A0C8-$A0DB ---------------------------
  // X runs from $45 down to 1: INC $0141,X then
  // $0121,X = (($0141,X >> 3) & 1) + 4, i.e. frames 4 and 5 alternating every
  // 8 frames, free-running and independent of the ship's latch. Measured with
  // $45 forced to 2: $0141 = 100 -> 4, 104 -> 5, 112 -> 4.
  for (let s = state.zp.options; s >= 1; s--) {   // $A0C8 LDX $45 / DEX / BMI
    o.timer[s] = u8(o.timer[s] + 1);              // $A0CD INC $0141,X
    o.anim[s] = (((o.timer[s] >> 3) & 1) + 4);    // $A0D0-$A0DB
  }

  // $A0CB BMI $A0E9 -- the Option animation loop above exits INTO the firing
  // block. src/weapons.js, and it is a fall-through, not a call.
  weaponUpdate(state, res, true);            // $A0E9 -> $A16F -> $A1E6 -> $A234
  return true;
}
