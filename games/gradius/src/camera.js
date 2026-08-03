// The camera, and the one-frame lag between it and the PPU.
//
// ROM: `$98EE`, called once per frame from $9AA0, and the scroll latch at
// $9A79 which runs BEFORE it. Both PROVEN over a 4000-frame attract-demo run
// (NOTES-terrain.md 1).

import { u8 } from './state.js';

/**
 * `$98EE` -- advance the camera by exactly 1/2 pixel.
 *
 *   98EE: A9 80     LDA #$80
 *   98F0: 18 65 3D  CLC / ADC $3D          the sub-pixel accumulator
 *   98F3: 85 3D     STA $3D
 *   98F5: A9 00 2A  LDA #$00 / ROL A       the carry out
 *   98F8: A2 3E     LDX #$3E
 *   98FA: 4C 02 84  JMP $8402              the house 16-bit add into $3E/$3F
 *
 * MEASURED, not read: `cam24 = $3D | $3E<<8 | $3F<<16` advanced by exactly $80
 * on all 3207 frames where $98EE ran and by exactly 0 on the 789 where it did
 * not, and $98EE never ran twice in one frame. A write census on $3D-$3F says
 * nothing else ever moves the camera except wholesale init wipes.
 *
 * There is a SECOND adder, `st_984F` (sub-state $1B = 14 or 15), which does
 * `LDA #$04 / JSR $8402` -- 4 px/frame. It fired 12 times in the same run and
 * is not ported: stage 1's normal path never uses it.
 */
export function advanceCamera(state) {
  const s = state.cam.sub + 0x80;            // $98EE/$98F0
  state.cam.sub = u8(s);                     // $98F3
  if (s > 0xFF) {                            // $98F5 ROL A -- the carry
    const lo = state.cam.lo + 1;             // $8402 CLC / ADC $00,X
    state.cam.lo = u8(lo);
    if (lo > 0xFF) state.cam.hi = u8(state.cam.hi + 1);   // $840B INC $01,X
  }
}

/**
 * `$8402` -- the house 16-bit add, `CLC / ADC $00,X / STA $00,X / BCC +2 / INC
 * $01,X`. With X = `$3E` it adds A to the camera's `$3E:$3F` (lo:hi), skipping
 * the sub-pixel `$3D`. The ONE caller on a ported path is the warp route:
 * `$9853 LDX #$3E / LDA #$04 / JSR $8402` -- 4 px/frame forced scroll. Every
 * other caller ($98EE above, $A3xx wave-cursor advances) goes through $98EE or
 * the spawn engine's own add; this is the direct entry the warp needs.
 */
export function addCamera16(state, a) {
  const lo = state.cam.lo + a;                        // $8402 CLC / ADC $00,X
  state.cam.lo = u8(lo);                              // $8405 STA $00,X
  if (lo > 0xFF) state.cam.hi = u8(state.cam.hi + 1); // $8407 BCC $840B / $8409 INC $01,X
}

/**
 * `$9A79` -- latch the camera into the PPU shadows for the NEXT frame.
 *
 *   9A79: A5 3E 85 12     LDA $3E / STA $12       PPUSCROLL X shadow
 *   9A7D: A5 3F 4A        LDA $3F / LSR A         carry = bit 0 of $3F
 *   9A80: A5 10 29 FC     LDA $10 / AND #$FC
 *   9A84: 69 00 85 10     ADC #$00 / STA $10      -> PPUCTRL bit 0
 *
 * THIS IS THE ONE-FRAME LAG, and it is the thing a port gets wrong by default.
 * $9A79 runs at scanline ~45 of frame N, BEFORE $9AA0 calls $98EE, and $8281
 * pushes $12/$13/$10 at the top of frame N+1. So the hardware scroll is always
 * one frame behind $3E.
 *
 * MEASURED: over 3206 consecutive scrolling frames, $12[N] == $3E[N-1] on
 * 3206/3206 and $12[N] == $3E[N] on only 1603/3206 -- the halves where the
 * fraction happened not to carry, which is exactly how a port with this wrong
 * can look almost right. `--neuter nolag` forces $12 = $3E and turns the check
 * red.
 *
 * The nametable bit is bit 0 of $3F, i.e. of the PAGE number, giving a
 * 512-pixel treadmill across the two nametables. NOTES-render.md 2 reports the
 * bit as "never observed set" -- true of ITS corpus, which is a driven run
 * that dies and restarts inside page 0. The attract-demo run reached page $06
 * and matched bit 0 of $3F[N-1] with 0 violations of 3207, and the streamer's
 * own address math ($9DB2: LDA $55 / AND #$01, selecting $2000 vs $2400) says
 * the same thing from the other side. Two independent derivations, one answer.
 */
export function latchScroll(state) {
  state.ppu.scrollX = state.cam.lo;                         // $9A7B STA $12
  state.ppu.ctrl = (state.ppu.ctrl & 0xFC) | (state.cam.hi & 1);   // $9A80-$9A86
}
