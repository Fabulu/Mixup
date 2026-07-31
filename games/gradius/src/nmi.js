// THE FRAME. ROM: the NMI handler at $806A.
//
// Gradius has NO MAIN LOOP. RESET ends at $8067 with `JMP $8067`, an empty
// spin, and every single thing the game does happens inside this handler. So
// this file is not "the game loop" by analogy -- it IS the ROM's control flow,
// and the order below is the order the cartridge runs in.
//
// The order is MEASURED, with execution hooks and the CPU cycle counter, on one
// gameplay frame (NOTES-player.md 10). Cycles are relative to the previous
// frame's $80B5:
//
//   +    0  sl 231  $80B5   previous frame ends (STA $04)
//   + 1107  sl 241  $806A   NMI entry
//   + 1170  sl 241  $8087   OAM DMA -- the PREVIOUS frame's display list
//   + 1697  sl 246  $8096   PPUMASK
//   + 1701  sl 246  $8099   JSR $8A51   the VRAM queue
//   + 2367  sl 252  $809C   JSR $8281   the scroll registers  <- BAND A
//   + 2420  sl 252  $809F   INC $04     the frame lock goes up
//   + 2431  sl 252  $ED02   sound
//   + 2897  sl 256  $80A4   JSR $81BF   JOYPAD
//   + 3327  sl 260  $8B10   the shadow-OAM display list
//   + 5502  sl  17  $80AA   JSR $80BE   the game state machine
//   + 5524  sl  17  $80D1   mode dispatch -> mode 5 -> $9650
//   + 6395  sl  25  $9FFC   THE PLAYER
//   + 7033  sl  31  $9A6D   enemies
//   + 8693  sl  45  $9A79   scroll copy $3E/$3F -> $12/$13/$10
//   + 8744  sl  46  $9AA0   JSR $98EE, then the sprite-0 spin begins
//   +27102  sl 207  $9AAA   the split fires -- 18,358 cycles of busy-wait
//   +28361  sl 218  $8641   last subsystem
//
// FOUR CONSEQUENCES THIS FILE ENCODES, each of which a port gets wrong by
// default:
//
//  1. INPUT LEAD IS ZERO. $81BF at $80A4, the state machine at $80AA -- same
//     NMI. Do not inherit the Game Boy's one-tick lead.
//  2. THE PICTURE IS TWO FRAMES BEHIND THE UPDATE. The display list is built
//     at $80A7, BEFORE the player moves at $80AA, and DMA'd at $8087 of the
//     frame after that.
//  3. THE SCROLL IS ONE FRAME BEHIND THE CAMERA. $9A79 latches $12 from $3E
//     during frame N; $8281 pushes it at the top of frame N+1.
//  4. A LAG FRAME SKIPS EVERYTHING, including the OAM DMA and the PPU writes.
//     $8073 reads $04 and bails at $80B7 if it is non-zero. On the NES that is
//     VISIBLE, unlike the Game Boy case where only internal updates dropped.
//
// WHAT IS NOT PORTED, named rather than silently absent: the sound driver
// ($ED02), the enemy spawn script and enemy update ($A2C0/$ADAB), the HUD
// packet producers ($8641), the shield, and every game mode except 5.

import { MODE_STAGE } from './state.js';
import { readJoypad } from './input.js';
import { drainQueue } from './vram.js';
import { buildDisplayList, oamDma } from './oam.js';
import { updatePlayer } from './player.js';
import { advanceCamera, latchScroll } from './camera.js';
import { streamBlock } from './terrain.js';
import { chrBank } from './render/ppu.js';

/**
 * One NMI. Call it once per 1/60.098814 s -- and read that number from
 * game.json, do not spell it here.
 *
 * @param {object} state
 * @param {number} buttons  the raw button mask for this frame
 * @param {object} res      {stage, metasprites} -- the loaded assets
 * @param {boolean} lag     force the $8073 bail, for the lag census
 */
export function nmi(state, buttons, res, lag = false) {
  // $8070: LDA $2002 -- clear the vblank flag.
  // $8073: LDY $04 / $8075: BNE $80B7 -- THE LOCK.
  if (lag || state.lock !== 0) {
    state.lagFrames++;
    return false;                       // $80B7: pull everything and RTI
  }

  // $8085: LDY #$02 / $8087: STY $4014.
  // Shadow OAM $0200 -> the PPU. This copies the display list built at $80A7 of
  // the PREVIOUS frame, which was itself built from positions the frame before
  // that. Two frames, and it is the ROM's own ordering, not a port artefact.
  oamDma(state);

  // $808A-$8096: PPUMASK <- $11, unless the blank countdown $0D is running.
  // $0D was never non-zero in any measured run, so the countdown arm is carried
  // for shape and the port cannot claim to reproduce screen blanking.
  if (state.ppu.blank !== 0 && --state.ppu.blank !== 0) state.bandA.mask = 0;
  else state.bandA.mask = state.ppu.mask;

  // $8099: JSR $8A51 -- drain the VRAM queue. Near the TOP, which is why a
  // terrain block queued during frame N appears on screen at the start of N+1.
  drainQueue(state);

  // $809C: JSR $8281 -- push $12/$13/$10 into $2005/$2005/$2000.
  // THIS WRITE IS WHAT DRAWS THE FRAME. Latch band A here and nowhere else:
  // $9A79 reloads $12 later in this same frame for the NEXT one, so a renderer
  // that reads $12 at the end of the frame is one frame early and looks almost
  // right (NOTES-render.md 1).
  state.bandA.ctrl = state.ppu.ctrl;              // $829D STX $2000
  state.bandA.scrollX = state.ppu.scrollX;        // $8293 STX $2005
  state.bandA.scrollY = state.ppu.scrollY;        // $8298 STX $2005
  state.bandA.chrBank = chrBank(state.ppu.chrSel);// $8A7D JSR $8A9C, LDY $2D

  state.lock = 1;                                 // $809F INC $04
  // $80A1: JSR $ED02 -- the sound driver. Not ported.

  readJoypad(state, buttons);                     // $80A4 JSR $81BF

  // $80A7: JSR $8B10 -- build the shadow-OAM display list, BEFORE the state
  // machine below moves anything. See consequence 2 above.
  buildDisplayList(state, res.metasprites);

  // $80AA: JSR $80BE -> INC $02, then the mode dispatch at $80D1.
  state.frame = (state.frame + 1) & 0xFF;         // $80BE INC $02
  if (state.mode === MODE_STAGE) stagePlay(state, res);

  // $80AD: JSR $8BAB (blank the unused OAM slots -- folded into
  // buildDisplayList) and $80B0: JSR $8641 (HUD packets -- not ported).

  state.lock = 0;                                 // $80B5 STA $04
  return true;
}

/**
 * Game mode 5, the stage-play path. ROM: $9650 -> ... -> $9A5E-$9ACE.
 *
 * $96B7: LDA $1B / BPL $96BE -- WHILE BIT 7 OF $1B IS CLEAR the handler runs
 * the stage-intro table at $96C5 instead of `JMP $982A`, and NOTHING here
 * happens. Measured: mode 5 at game frame 282, $0100 becomes 1 at 283, and
 * $9FFC first runs at 310 -- a 28-frame window in which the ship does not move
 * even though the player is holding a direction. That looked like a ten-frame
 * input lag until it was measured from three different start frames.
 *
 * This port boots straight into the played state ($1B = $80) rather than
 * modelling the intro sequence, because the sequence itself was not reversed.
 * The gate is kept so that the omission is visible in code.
 */
function stagePlay(state, res) {
  if (!(state.substate & 0x80)) return;           // $96B7 LDA $1B / BPL

  // $9A5E: LDA $5C / CMP #$02 / BCS $9A70 -- when $5C >= 2 the player update
  // is skipped ENTIRELY here and a different caller at $969A runs it on EVEN
  // frames only. $5C measured 0 throughout stage 1's opening; that whole path
  // has NEVER been executed under the oracle, so it is left unimplemented
  // rather than guessed at (NOTES-player.md 12, open question 1).
  if (state.zp5C >= 2) throw new Error('$5C >= 2: the half-rate player path is unmeasured');

  // $9A64: JSR $A2C0 -- the enemy spawn script. Not ported.
  updatePlayer(state);                            // $9A6A JSR $9FFC
  // $9A6D: JSR $ADAB -- the enemies. Not ported.

  latchScroll(state);                             // $9A79  -> $12 / $10
  advanceCamera(state);                           // $9AA0 JSR $98EE

  // $9AA3-$9AC1: the sprite-0 split. On hardware this is a busy-wait on
  // $2002 bit 6 followed by three writes; here it is a record of what band B
  // will be drawn with, because the renderer models the split as two bands
  // rather than as a spin. $9A98's two gates ($15 and $5B, both measured 0 on
  // every frame that mattered) decide whether it runs at all -- when they are
  // non-zero the frame has ONE band, which is why `ran` is a field and not a
  // constant.
  state.bandB.ran = state.zp15 === 0 && state.zp5B === 0;
  state.bandB.ctrl = state.bandA.ctrl & 0xFC;     // $9ABA AND #$FC
  state.bandB.chrBank = chrBank(2);               // $9ABF LDY #$02 -> bank 1

  streamBlock(state, res.stage);                  // $9ACE JSR $9D83
}
