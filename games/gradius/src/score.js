// THE SCORE. ROM: `$8455`-`$850F`, and the BCD byte adder `$84A9` under it.
//
// Four entry points, all of which set up a 3-byte addend in `$99:$9A:$9B` and
// then FALL INTO the same adder at `$846F`. This is docs/knowledge/02 trap 1
// again -- they look like four routines and they are one, with four preambles:
//
//   $844B  LDA #$05 / BNE $8455           $9A = 5      (the type-$29 bonus)
//   $844F  LDA #$03 / BNE $8455           $9A = 3
//   $8453  LDA #$01                       $9A = 1
//   $8455  STA $9A / LDA #$00 / BEQ $8469 $99 = 0
//   $845B  LDA #$00 / STA $9A / LDA #$50  $99 = $50    the CAPSULE (wave 7)
//   $8463  LDA #$00 / STA $9A / LDA #$10  $99 = $10    THE KILL ($C0A6)
//   $8469  STA $99 / LDA #$00 / STA $9B
//   $846F  LDA $09 / BEQ $8474 / RTS      <- the ATTRACT DEMO scores nothing
//
// so the three bytes are `$99` (least significant), `$9A`, `$9B`, added to the
// three at `$07E4 + 4*$18` least-significant-first. Every kill in this corpus
// comes through `$8463`, i.e. `+$0010`.
//
// WHAT THIS RETIRES. src/state.js said of the score bytes: "the producers read
// six things the port does not yet COMPUTE ... $845B (wave 6) is the adder that
// will make them move". It moves them now, and the note is corrected in the
// same commit (rule 6). The HUD's row-29 digits are drawn by `$892C` from these
// same bytes, so a wrong adder is visible in `w_0700`-`w_074F` as well as in
// `w_07E4`-`w_07E6`.

import { u8 } from './state.js';

/** `$07E0` + this = the base of a 3-byte BCD score. $18 selects. */
const TOP = 0, P1 = 4;

/**
 * `$84A9` -- add one BCD byte, WITHOUT the 6502's decimal mode (the NES 2A03
 * has none). Transcribed instruction by instruction, carry included, because
 * every one of the three carries in it is load-bearing.
 *
 *   84A9  85 9F     STA $9F                 A = the byte already there
 *   84AB  29 F0     AND #$F0 / 85 9E STA $9E    high nibble
 *   84AF  45 9F     EOR $9F / 85 9F STA $9F     low nibble
 *   84B3  B5 98     LDA $98,X / 29 0F AND #$0F  the addend's low nibble
 *   84B7  65 9F     ADC $9F                     + carry IN
 *   84B9  C9 0A     CMP #$0A / 90 02 BCC $84BF
 *   84BD  69 05     ADC #$05        <- +5 AND the carry the CMP just set = +6
 *   84BF  65 9E     ADC $9E / 85 9E STA $9E
 *   84C3  B5 98     LDA $98,X / 29 F0 AND #$F0 / 65 9E ADC $9E
 *   84C9  B0 04     BCS $84CF
 *   84CB  C9 A0     CMP #$A0 / 90 03 BCC $84D2
 *   84CF  E9 A0     SBC #$A0 / 38 SEC
 *   84D2  60        RTS
 *
 * `$84BD ADC #$05` IS THE WHOLE OF THE DECIMAL ADJUST AND IT ADDS SIX. The
 * `CMP #$0A` that selected it leaves the carry SET, and `ADC` takes it in:
 * $0A + 5 + 1 = $10, which is the digit 0 and a carry into the high nibble.
 * A port that adds 5 turns 10 into $0F and every score with a carry is wrong.
 */
export function bcdByte(existing, addend, carryIn) {
  let hi = existing & 0xF0;                       // $84AB
  const lo = existing ^ hi;                       // $84AF EOR
  let a = (addend & 0x0F) + lo + (carryIn ? 1 : 0);   // $84B3-$84B7
  let c = a > 0xFF;
  a &= 0xFF;
  if (a >= 0x0A) {                                // $84B9 CMP #$0A
    a = a + 0x05 + 1;                             // $84BD ADC #$05, carry SET
    c = a > 0xFF;
    a &= 0xFF;
  } else {
    c = false;                                    // the CMP cleared it
  }
  a = a + hi + (c ? 1 : 0);                       // $84BF ADC $9E
  c = a > 0xFF;
  a &= 0xFF;
  a = (addend & 0xF0) + a + (c ? 1 : 0);          // $84C3-$84C7
  c = a > 0xFF;
  a &= 0xFF;
  if (!c && a < 0xA0) return { byte: a, carry: false };   // $84C9/$84CB/$84CD
  return { byte: u8(a - 0xA0), carry: true };     // $84CF SBC #$A0 / $84D1 SEC
}

/**
 * `$8463` -- the kill's `+$0010`, and `$845B` -- the capsule's `+$0050`.
 * Both fall into `$8469`/`$846F`/`$8474`.
 */
export function scoreKill(state) { addScore(state, 0x10, 0x00, 0x00); }   // $8463
export function scoreCapsule(state) { addScore(state, 0x50, 0x00, 0x00); }// $845B

/**
 * `$846F`-`$850F` -- add `$9B:$9A:$99` to the current player's score, then the
 * extra life and the TOP-score copy.
 *
 *   846F  A5 09     LDA $09 / F0 01 BEQ $8474 / 60 RTS
 *   8474  A9 E4     LDA #$E4 / A4 18 LDY $18 / F0 02 BEQ $847C / A9 E8 LDA #$E8
 *   847C  85 9C     STA $9C / A0 07 LDY #$07 / 84 9D STY $9D    -> $07E4 / $07E8
 *   8482  A2 01     LDX #$01 / A0 00 LDY #$00 / A9 03 LDA #$03 / 85 98 STA $98
 *   848A  18        CLC
 *   848B  B1 9C     LDA ($9C),Y / 20 A9 84 JSR $84A9 / 91 9C STA ($9C),Y
 *   8492  C8        INY / E8 INX / C6 98 DEC $98 / D0 F3 BNE $848B
 *   8498  90 39     BCC $84D3
 *   849A  A2 02     LDX #$02 / A9 99 LDA #$99 / 9D E0 07 STA $07E0,X / CA / 10 FA
 *
 * THE OVERFLOW ARM WRITES THE **TOP** SCORE, NOT THE PLAYER'S. `$849E STA
 * $07E0,X` fills $07E0-$07E2 with $99 and returns, leaving the player's own
 * three bytes wrapped. It looks like a bug and it is what the cartridge does;
 * it is ported literally and it is unreachable here (three BCD bytes is
 * 999999 x 10 points and the corpus's biggest score is $0110).
 */
export function addScore(state, lo, mid, hi) {
  // $846F: the attract demo does not score. $09 is 0 on every play frame and 1
  // through the demo, which this port does not run.
  if (state.zp09 !== 0) return;                   // $8471 BEQ $8474 / $8473 RTS
  const base = P1 + 4 * state.zp.player;          // $8474-$847C
  const add = [lo, mid, hi];                      // $99, $9A, $9B
  let carry = false;                              // $848A CLC
  for (let n = 0; n < 3; n++) {                   // $8482-$8496, three bytes
    const r = bcdByte(state.score[base + n], add[n], carry);
    state.score[base + n] = r.byte;               // $8490 STA ($9C),Y
    carry = r.carry;
  }
  if (carry) {                                    // $8498 BCC $84D3
    for (let i = 0; i < 3; i++) state.score[TOP + i] = 0x99;   // $849A-$84A2
    return;
  }
  extraLife(state, base);                         // $84D3
  copyTopScore(state, base);                      // $84F7
}

/**
 * `$84D3-$84F6` -- the extra life, and the only place `$20,X` goes UP.
 *
 *   84D3  A0 02     LDY #$02 / B1 9C LDA ($9C),Y      the score's HIGH byte
 *   84D7  A6 18     LDX $18 / D5 2A CMP $2A,X / 90 1A BCC $84F7
 *   84DD  A2 01     LDX #$01 / A4 18 LDY $18 / B9 2A 00 LDA $002A,Y / 18 CLC
 *   84E5  20 A5 84  JSR $84A5      <- $84A5 is `STX $98 / LDX #$00` and then
 *                                     FALLS INTO $84A9, so the addend byte is
 *                                     X = 1: the threshold goes up by BCD 1
 *   84E8  90 02     BCC $84EC / A9 FF LDA #$FF        it saturates at $FF
 *   84EC  A6 18     LDX $18 / 95 2A STA $2A,X
 *   84F0  F6 20     INC $20,X                          <- AN EXTRA LIFE
 *   84F2  A9 36     LDA #$36 / 20 1E EC JSR $EC1E      wave 8
 *
 * UNREACHED IN THIS CORPUS and ported anyway: `$2A` is $02 in the cartridge's
 * own seed (200000 points) and the biggest score any scenario here reaches is
 * $0110, so the compare at $84D9 always takes the BCC. It is ported because it
 * is the ONLY writer of `$20,X` other than the death's DEC, and `$20,X` is a
 * compared field that the HUD's lives producer renders.
 */
function extraLife(state, base) {
  const p = state.zp.player;
  if (state.score[base + 2] < state.extraLife[p]) return;   // $84D9 CMP $2A,X
  const r = bcdByte(state.extraLife[p], 1, false);          // $84E5 JSR $84A5
  state.extraLife[p] = r.carry ? 0xFF : r.byte;             // $84E8/$84EA/$84EE
  state.lives[p] = u8(state.lives[p] + 1);                  // $84F0 INC $20,X
  state.sfx.push(0x36);                                     // $84F2 JSR $EC1E
}

/**
 * `$84F7-$850F` -- copy the player's score into TOP if it is bigger.
 *
 *   84F7  A0 02     LDY #$02
 *   84F9  B9 E0 07  LDA $07E0,Y / D1 9C CMP ($9C),Y
 *   84FE  90 05     BCC $8505      TOP < player -> copy
 *   8500  D0 0D     BNE $850F      TOP > player -> done
 *   8502  88        DEY / 10 F4 BPL $84F9
 *   8505  A0 02     LDY #$02 / B1 9C LDA ($9C),Y / 99 E0 07 STA $07E0,Y / 88 / 10 F8
 *
 * The equal case falls out of the DEY loop with Y = $FF and COPIES -- a no-op,
 * and the reason there is no third arm. TOP is 00 50 00 (50000) in the seed of
 * every scenario, so the copy does not fire here either; both arms are ported
 * because `$07E0-$07E2` are compared fields the HUD's `$88F6` draws.
 */
function copyTopScore(state, base) {
  for (let y = 2; y >= 0; y--) {                  // $84F7-$8503
    const top = state.score[TOP + y];
    const mine = state.score[base + y];
    if (top < mine) break;                        // $84FE BCC $8505 -- copy
    if (top > mine) return;                       // $8500 BNE $850F -- done
  }
  for (let y = 2; y >= 0; y--) {                  // $8505-$850D
    state.score[TOP + y] = state.score[base + y];
  }
}
