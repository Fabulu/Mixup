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
// ($ED02), the enemy spawn script and enemy update ($A2C0/$ADAB), the power-up
// rank $17 ($9AC4 JSR $9C45), the capsule apply ($9A73 JSR $8974), and every
// game mode except 5.
//
// The HUD tick ($9AC7 JSR $8898 -> $88B6/$88F6/$89E3/$892C) WAS on that list
// and is not any more -- src/hud.js. Its absence was the whole of the
// terrain-streams-at-double-rate divergence, because it shares the streamer's
// $0E gate and runs seven bytes above it.
//
// $8641 at $80B0 IS ported (it appends the queue's mode-0 terminator, one byte
// -- see src/vram.js). The comment that used to sit there called it "HUD
// packets", which sent the terrain knownFail's diagnosis at the wrong routine
// for the port's whole life.

import { MODE_STAGE } from './state.js';
import { readJoypad } from './input.js';
import { drainQueue, queueTerminator } from './vram.js';
import { hudTick } from './hud.js';
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
  //
  //   808A  A5 11  LDA $11 / 808C  A6 0D  LDX $0D / 808E  F0 06  BEQ $8096
  //   8090  C6 0D  DEC $0D / 8092  F0 02  BEQ $8096 / 8094  A9 00  LDA #$00
  //
  // so the LAST frame of the countdown already shows the picture. $0D is 0 on
  // all 3341 compared frames, but NOT "never non-zero in any measured run" as
  // this comment used to claim: the boot intro runs it 6,3,3,3,5x23,4,3,2,1,0
  // over frames 282-314 and a respawn runs it again (00-recon-flow.md 5). The
  // port cannot yet reproduce screen blanking because it has no intro -- that
  // is wave 4 -- but the arm itself is the cartridge's.
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

  // $80AD: JSR $8BAB -- blank the unused OAM slots. Folded into
  // buildDisplayList (it fills the shadow with $F4 up front instead).
  queueTerminator(state);                         // $80B0 JSR $8641

  state.lock = 0;                                 // $80B5 STA $04
  return true;
}

/**
 * Game mode 5, the stage-play path. ROM: $9650 -> ... -> $9A5E-$9ACE.
 *
 * $96A5 is a bitfield ladder on $1B, not a single test: bit 4 next-stage
 * ($96CF), bit 5 dying ($96EF), bit 6 game over ($96FB), bit 7 play -> the
 * low-nibble dispatch at $982F; none set -> the stage-intro dispatch at $96C5.
 * The port implements only the bit-7 arm, so `$1B = $80` is the one value that
 * behaves. Measured: mode 5 at game frame 282, $0100 becomes 1 at 283, and the
 * split first fires at 314 -- the intro window in which the ship does not move
 * even though the player is holding a direction. That looked like a ten-frame
 * input lag until it was measured from three different start frames. The
 * window is NOT a fixed 28 frames: the boot intro ran 282-314 and a respawn
 * intro ran 614-640 (26 frames), because $9C24 exits on $57, not on a counter
 * (00-recon-flow.md 3 and 5). The ladder and the intro are wave 4.
 */
function stagePlay(state, res) {
  if (!(state.substate & 0x80)) return;           // $96B7 LDA $1B / BPL

  // $9A5E: LDA $5C / CMP #$02 / BCS $9A70 -- when $5C >= 2 the player update
  // is skipped ENTIRELY here and a different caller at $969A runs it on EVEN
  // frames only. UNREACHABLE ON STAGE 1, and that is now settled rather than
  // merely unobserved: $9650 only computes $5C at all when the stage index
  // $19 == 4 (it counts the non-zero bytes at $0600/$0630/$0660/$0690), so on
  // every other stage $5C stays 0 (00-recon-flow.md 3, which closes
  // NOTES-player.md 12 open question 1). The throw stays because the port has
  // no stage 5.
  if (state.zp5C >= 2) throw new Error('$5C >= 2: the stage-5 half-rate player path is not ported ($9A5E/$969A)');

  // $9A64: JSR $A2C0 -- the enemy spawn script. Not ported.
  updatePlayer(state);                            // $9A6A JSR $9FFC
  // $9A6D: JSR $ADAB -- the enemies. Not ported.

  latchScroll(state);                             // $9A79  -> $12 / $10

  // ---- $9A88-$9AC1: the split, and the camera inside it -------------------
  //
  // THIS BLOCK WAS MODELLED BACKWARDS until wave 1. The port had
  //     state.bandB.ran = state.zp15 === 0 && state.zp5B === 0;
  // and called advanceCamera() unconditionally. The bytes say the opposite:
  //
  //   9A88  A5 1B     LDA $1B
  //   9A8A  10 38     BPL $9AC4    play sub-state only
  //   9A8C  A5 1E     LDA $1E
  //   9A8E  F0 34     BEQ $9AC4    no sprite-0 record selected
  //   9A90  A5 1F     LDA $1F
  //   9A92  F0 30     BEQ $9AC4    sprite 0 parked off-screen
  //   9A94  A5 0D     LDA $0D
  //   9A96  D0 2C     BNE $9AC4    screen blanking -> no split AND no camera
  //   9A98  A5 15     LDA $15
  //   9A9A  D0 07     BNE $9AA3
  //   9A9C  A5 5B     LDA $5B
  //   9A9E  D0 03     BNE $9AA3
  //   9AA0  20 EE 98  JSR $98EE    <- $15/$5B skip THIS, and land at $9AA3
  //   9AA3  AD 02 20  LDA $2002    <- the split, reached either way
  //
  // So the four gates above decide whether the frame is split at ALL, and
  // $15/$5B decide only whether the camera advances inside it. Measured from
  // the other side: the split first fires at game frame 314 -- the frame $0D
  // reaches 0 -- always at scanline 207, with $15 and $5B 0 throughout; and
  // pausing (START at f450, $15 = 1) froze $3E at 68 for 50 frames without
  // taking a band away (00-recon-flow.md 6 and 8).
  //
  // It never cost the corpus a frame, because $15/$5B/$0D are 0 and $1E/$1F
  // are 1/2 on all 3341 compared frames. That is docs/knowledge/03's shape 3
  // exactly: a field that is constant in the corpus carries a wrong model
  // indefinitely. It is fixed here so waves 4-5 (pause, the intro's $0D blank,
  // death) inherit the right one.
  // $9A88's own bit-7 test is redundant with stagePlay()'s early return TODAY,
  // and stops being redundant in wave 4: on the cartridge this block is also
  // reached from the stage-intro path, where bit 7 is clear and $9AC4 onward
  // (including the streamer) still runs. Written out rather than folded away.
  const split = (state.substate & 0x80) !== 0     // $9A88 LDA $1B / BPL $9AC4
             && state.zp1E !== 0                  // $9A8C LDA $1E / BEQ $9AC4
             && state.zp1F !== 0                  // $9A90 LDA $1F / BEQ $9AC4
             && state.ppu.blank === 0;            // $9A94 LDA $0D / BNE $9AC4
  if (split) {
    if (state.zp15 === 0 && state.zp5B === 0) {   // $9A98 / $9A9C
      advanceCamera(state);                       // $9AA0 JSR $98EE
    }
    // $9AA3-$9AC1: on hardware, a busy-wait on $2002 bit 6 and then three
    // writes. Here it is a record of what band B will be drawn with, because
    // the renderer models the split as two bands rather than as a spin.
    state.bandB.ctrl = state.bandA.ctrl & 0xFC;   // $9ABA AND #$FC
    state.bandB.chrBank = chrBank(2);             // $9ABF LDY #$02 -> bank 1
  }
  state.bandB.ran = split;

  // $9AC4: JSR $9C45 -- the power-up rank $17. Not ported (wave 7).

  // $9AC7: JSR $8898 -- THE HUD TICK, and the streamer's throttle. It shares
  // the $0E gate with $9D83 seven bytes below and runs FIRST, so on the odd
  // frames it produces 8/14/39 bytes the streamer is refused. Its absence was
  // the whole of the remaining terrain-streams-at-double-rate divergence:
  // starving the cartridge's own $0E gate turns its build histogram from
  // {0:196, 1:195} into {0:1, 1:390} -- i.e. into the port as it was -- while
  // emitting the same 140 blocks either way (00-recon-terrain.md 5).
  hudTick(state, res.hudPackets);                 // $9AC7 JSR $8898

  // $9ACA: LDA $5B / BNE $9AD1 -- $5B suppresses the streamer as well as the
  // camera. ZERO BEHAVIOUR CHANGE TODAY: $5B is 0 on every frame of every
  // measured run (00-recon-terrain.md 7), and it is uncharacterised -- eleven
  // INC sites, three readers. Written down as structure so that whoever
  // characterises it does not have to rediscover that the gate is here.
  if (state.zp5B === 0) {                         // $9ACA / $9ACC
    streamBlock(state, res.stage);                // $9ACE JSR $9D83
  }
}
