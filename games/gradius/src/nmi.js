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
// WHAT IS NOT PORTED, named rather than silently absent: every game mode
// except 5.
//
// THE SOUND DRIVER WAS ON THAT LIST AND IS NOT ANY MORE -- src/sound.js, wave
// 8. $80A1 JSR $ED02 runs below, in its own place in the order: after the frame
// lock and before the joypad.
//
// The power-up rank ($9AC4 JSR $9C45) and the capsule apply ($9A73 JSR $8974)
// WERE on that list and are not any more -- src/powerup.js, wave 7. The apply
// sits AFTER the collision sweep on purpose: $C1AF INCs $42 during $9A70 and
// $8974 consumes it three instructions later, in the same frame.
//
// $9A70 JSR $BFE2 WAS ON THAT LIST WITH THE WRONG DESCRIPTION and is not any
// more -- src/collision.js, wave 5. The old comment called it "the shot-vs-enemy
// sweep ... ten iterations of nothing"; it is NINE iterations (`LDX #$08`), and
// `$C052 JMP $C0C7` at its tail is the ONLY route on stage 1 into the whole
// collision subsystem, i.e. into the thing that kills the player. That is
// docs/knowledge/02 trap 1: what the routine falls into, not what it is called.
//
// MODE 5 ITSELF IS NO LONGER "$1B = $80 ONLY" -- wave 4 ported the $96A5 ladder
// below, the five stage-intro states and pause (src/flow.js). What is left
// unported inside mode 5 is named at each arm, as a throw carrying the ROM
// address the cartridge would have reached.
//
// The enemy spawn script and the enemy update ($9A64 JSR $A2C0 / $9A6D JSR
// $ADAB) WERE on that list and are not any more -- src/enemies.js, wave 3.
// $9A67 JSR $BBB7 (the enemy-bullet engine) went in with them, because it runs
// between the two on every frame and its $5D gate is the spawn engine's own
// counter.
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

import { MODE_STAGE, u8 } from './state.js';
import { readJoypad } from './input.js';
import { drainQueue, queueTerminator } from './vram.js';
import { hudTick } from './hud.js';
import { buildDisplayList, oamDma } from './oam.js';
import { updatePlayer } from './player.js';
import { advanceCamera, latchScroll } from './camera.js';
import { streamBlock } from './terrain.js';
import { spawnEngine, enemyBullets, updateEnemies } from './enemies.js';
import { introStep, pauseCheck, respawn } from './flow.js';
import { shotSweep } from './collision.js';
import { applyCapsule, computeRank } from './powerup.js';
import { soundDriver, setBgm } from './sound.js';
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
  // THE SOUND DRIVER'S FOUR SIGNALS ARE CLEARED ABOVE THE LOCK, and every other
  // per-frame counter in this function is cleared below it. That is deliberate.
  // docs/knowledge/06 asks for "did the sound driver step" as its own per-frame
  // signal, and on a frame the driver did not step the honest answer is 0 --
  // not "whatever the last frame that did step reported". The other counters sit
  // below the bail because a dropped NMI produces no sample on the cartridge at
  // all (objloop.lua's gframe only advances at $80B5), so the two placements
  // have never been distinguishable by measurement; this one is, through
  // `laginject`, and through tests/sound.test.js.
  state.work.audioTicks = 0;
  state.work.audioChannels = 0;
  state.work.apuWrites = 0;
  state.work.apuDigest = 0;

  // $8070: LDA $2002 -- clear the vblank flag.
  // $8073: LDY $04 / $8075: BNE $80B7 -- THE LOCK.
  if (lag || state.lock !== 0) {
    state.lagFrames++;
    return false;                       // $80B7: pull everything and RTI
  }
  // The previous frame's overrun is HISTORY once this one starts. It is counted
  // on the row of the frame that caused it, not on the row of the frame that
  // was dropped -- objloop.lua attributes it the same way, because gframe only
  // advances at $80B5 and a dropped NMI never gets there (src/state.js).
  state.frameDrops = 0;
  // ...and so is the enemy loop's iteration count. It is "$ADE5 entries THIS
  // frame", so a frame that never reaches $9A6D must report 0, not the previous
  // frame's 10. updateEnemies() zeroes it at its own top, which was enough
  // while every mode-5 frame ran it; wave 4 gave the port frames that do not
  // (the intro dispatch never reaches $9A5E, and a paused frame jumps past it).
  // MEASURED: the `pause` scenario's cartridge rows read enemySlots 0 on all 50
  // paused frames and the port read 10 -- the first divergence this field has
  // ever produced.
  state.work.enemySlots = 0;
  // ...and so is the SPLIT. `bandB.ran` is "did $9AA3 fire on THIS frame", not a
  // RAM byte, and mode5Tail() was its only writer -- so a frame that never
  // reaches $9A88 used to inherit the last played frame's record. An intro frame
  // is exactly that frame: $96C2's dispatcher pulls its own return address, so
  // every handler RTSes to $80AD and the whole of $9A5E-$9ACE is skipped.
  //
  // MEASURED, tools/oracle/out/scen/intro-respawn.json: frames 610-613 are
  // played frames with chrOffset 8192 and sprite0Hit 1, and frame 614 -- the
  // first intro frame -- reads chrOffset 0 and sprite0Hit 0, as do all 27 intro
  // frames. It could not bite while the port only entered the intro from a cold
  // state (both intro scenarios start from `ran = false`); wave 5's $979D is
  // what lets a PLAY frame become an intro frame, and without this line the six
  // death scenarios would each report the wrong band for 27 frames on two TIER 1
  // fields. Pinned as a knownFail by wave 4's test pass; retired here.
  state.bandB.ran = false;
  // ...and so are the frame's sound requests. `$EC1E` is called from nine
  // places this port reaches (both shot spawns, $BE93's kill, $C1D6's death,
  // $84F2's extra life, $896C/$89DD/$C18F for the power-ups, $9AFA's pause
  // jingle, and $83A1/$83A6/$83AB for the BGM). The list is not the driver's
  // state -- src/sound.js is, and it RUNS from $80A1 below since wave 8 -- it
  // is the record the weapon and power-up tests hold the CALL SITES to, which
  // matters more now than it did before: 73 of 83 shot requests are rejected on
  // priority, so "the driver did nothing" is the correct outcome of a call that
  // must still have happened. See src/state.js sfx.
  state.sfx.length = 0;

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
  // every frame of the play corpus, but NOT "never non-zero in any measured
  // run": the intro runs it and wave 4 made the port run the intro.
  //
  // MEASURED, boot script "200:,10:S,130:", $0D at the $80B5 sample:
  //   f283  6            $9BC5, after $882C had set it to $10 twice
  //   f284-f286  3       $96C0 re-arms it on every intro frame
  //   f287-f309  5       $9C24 re-arms it higher, 23 frames
  //   f310-f314  4,3,2,1,0    the countdown, once $1B = $80 stops re-arming it
  // and the sprite-0 split first fires on f314, the frame it reaches 0, always
  // at scanline 207. So the screen is blank for the whole intro AND for four
  // frames after it, which is the arm below and the $9A94 gate in mode5Tail().
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

  // $80A1: JSR $ED02 -- THE SOUND DRIVER, and its position is the point. It
  // runs after the frame lock goes up and BEFORE the joypad is read, so sound
  // advances before input and before any game logic; a request made by game
  // code later in this frame is not looked at until the NEXT tick, which is
  // why $EC63 seeds a new channel's duration with 1 instead of 0.
  //
  // THE LAG RULE LIVES IN WHERE THIS LINE IS. $8073's bail is above it, so a
  // dropped NMI drops a music tick -- the port returns at the top of this
  // function without ever reaching here. MEASURED: driverCalls == nmiEntries -
  // lagFrames (600 == 601 - 1 over 600 game frames).
  soundDriver(state, res);                        // $80A1 JSR $ED02

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
 * Game mode 5. ROM: `$9650` -> the `$96A5` ladder -> five different arms.
 *
 * THIS USED TO BE THE WHOLE OF MODE 5 AND IT IS NOT ANY MORE. Before wave 4 the
 * port implemented one value of $1B ($80) and returned early for every other,
 * so the stage intro, the death countdown and pause were all "the frame does
 * nothing". The ladder below is the cartridge's, in the cartridge's order, and
 * the arms this wave does not port throw with the address they would have
 * reached. src/flow.js is the intro and pause; the play and dying arms are here
 * because both of them re-enter this file's own mode-5 body.
 *
 * Measured for wave 4 with flowprobe.py: the boot intro is mode-5 frames
 * 283-309 and the respawn's is 614-640 -- 27 frames each, NOT the 28 and 26 the
 * plan carried. $9C24 exits on $57 rather than on a counter and the counts
 * agree only because $9B3E starts every intro from a zero streamer lead; see
 * the header of src/flow.js for the derivation.
 */
export function stagePlay(state, res) {
  // ---- $9650-$965A: the mode-5 entry. Four stores, run on EVERY mode-5 frame
  // before the $1B ladder is even looked at:
  //
  //   9650  A9 0C  LDA #$0C / 9652  85 13  STA $13
  //   9654  A9 00  LDA #$00
  //   9656  85 5D  STA $5D / 9658  85 5B  STA $5B / 965A  85 5C  STA $5C
  //
  // WAVE 1 LEFT THIS OUT AND IT WAS THE WAVE'S ONE BLOCKING DEFECT: without
  // $9658 a $5B set from anywhere freezes the camera and the streamer FOREVER
  // instead of for one frame, because $5B is a WITHIN-FRAME flag -- it is only
  // ever raised by arms that immediately jump into the middle of this body
  // ($96A0, $98DD, $96FB, and $9B25 on the unpause), meaning "this frame's
  // update already ran".
  //
  // $9656 became load-bearing in wave 3: $BBB7 reads $5D ($9A67, seven
  // instructions after the spawn engine that INCs it), so a $5D that survived
  // the frame would send the enemy-bullet engine down the wrong arm on every
  // frame after the first wave fires.
  state.ppu.scrollY = 0x0C;                       // $9650 LDA #$0C / STA $13
  state.spawn.z5D = 0;                            // $9656 STA $5D
  state.zp5B = 0;                                 // $9658 STA $5B
  state.zp5C = 0;                                 // $965A STA $5C

  // $965C LDA $15 / BEQ $9663 / $9660 JMP $9A8C -- THE PAUSE JUMP. It lands
  // past $9663-$9A87, i.e. past the spawn engine, the enemy-bullet engine, THE
  // PLAYER, the enemy update, the shot sweep, the capsule apply AND the
  // $3E -> $12 scroll latch -- and past $9A88's own test of $1B bit 7. Wave 1
  // pinned this as a knownFail in tests/frame-gates.test.js because the port
  // only gated advanceCamera() on $15 and so kept flying the ship while paused;
  // the annotation retires with this line.
  if (state.zp15 !== 0) {                         // $965C/$965E
    mode5Tail(state, res);                        // $9660 JMP $9A8C
    return;
  }

  // $9663 LDA $19 / CMP #$04 / BNE $96A5 -- only stage 5 counts the four bytes
  // at $0600/$0630/$0660/$0690 into $5C and only stage 5 can then take the
  // half-rate arm at $9689. The port loads one stage's assets, so $19 == 4 is
  // a state it cannot be in; it throws rather than skip the arm silently.
  if (state.zp19 === 4) {
    throw new Error('$9663: $19 = 4 (stage 5). The $5C census at $9669-$9683 '
                  + 'and the half-rate arm at $9689-$96A2 are not ported.');
  }

  // ---- $96A5: the ladder. Order matters -- it is five tests in sequence, not
  // a switch, so $1B = $30 takes the bit-4 arm and never sees bit 5.
  const sub = state.substate;
  if (sub & 0x10) {                               // $96A5-$96A9
    throw new Error(`$96CF: $1B = $${sub.toString(16).toUpperCase()} has bit 4 `
                  + `set (NEXT STAGE). INC $19, the $50-$70 clear, $55 = 1, `
                  + `$9BF0 and $9C3C are not ported -- the port loads one `
                  + `stage's assets.`);
  }
  if (sub & 0x20) { dyingArm(state, res); return; }        // $96AB-$96AF
  if (sub & 0x40) {                               // $96B1-$96B5
    // $B0 IS the port's own state as of wave 8 -- it is pulse 1's duration
    // counter (src/sound.js), and "non-zero for 277 frames" is simply a channel
    // that was playing. What is still not ported is $96FB itself: the wave plan
    // excludes game over and continue, and nothing in this corpus reaches
    // either. The reason has been corrected rather than left standing.
    throw new Error(`$96FB: $1B = $${sub.toString(16).toUpperCase()} has bit 6 `
                  + `set (GAME OVER). $96FD gates both the timeout and START on `
                  + `$B0 -- pulse 1's duration counter, i.e. "wait until the `
                  + `game-over jingle has finished" -- and neither the timeout `
                  + `arm nor the continue screen is ported. Deliberately `
                  + `excluded by docs/worklog/gradius/00-plan.md.`);
  }
  if (sub & 0x80) { playArm(state, res); return; }         // $96B7-$96BB
  introStep(state, res);                          // $96BE -> jt_96C5
}

/**
 * `$982A` -- the play arm. `LDA $1B / JSR $83E4` into the 16-entry table at
 * $982F, indexed by ($1B * 2) AND $FF, i.e. by the low nibble.
 *
 * Entry 0 is `st_9A4D`:
 *
 *   9A4D  A6 19 / A5 3F / DD 3D 9A / 90 05      $3F < $9A3D[$19] -> $9A5B
 *   9A56  BD 45 9A / 85 1B                      else $1B := $9A45[$19] = $81
 *   9A5B  20 57 83  JSR $8357                   the CHR bank + the BGM request
 *
 * $9A3D[0] = $0C, which assets/terrain/stages.json already carries as
 * `bossPage` -- the same byte, read by the same instruction. Stage 1 therefore
 * ends at world X >= 3072, which no scenario in this corpus reaches (the
 * furthest is camera page 0).
 *
 * `$9A5B JSR $8357` IS PORTED as of wave 8 (src/sound.js setBgm) and used to
 * be on this file's not-ported list with the note "its only non-sound effect is
 * $2D". That was true and it was not the whole routine: $8363-$839D is the
 * background-music selector, gated on `$3E == 0` -- the two frames in every 512
 * where the camera's low byte is zero, and the first play frame after any stage
 * intro, because $9B3E zeroes $3E. That is where the stage BGM the recon
 * measured starting at game frame 310 comes from, and without it the port's
 * channel-owner bytes would never leave the values they were seeded with.
 */
function playArm(state, res) {
  if (state.substate !== 0x80) {                  // $982C -> jt_982F
    throw new Error(`$982A: play sub-state $1B = $${state.substate.toString(16)
      .toUpperCase()}. Only $80 (st_9A4D) is ported; $81-$8F are the `
      + `end-of-stage and boss-approach chain ($9A0E, $99E9, $99C0, $9982, `
      + `$997E, $9904, $988C, $98DD, $98E5, $984F) and the intro states the `
      + `table shares with jt_96C5.`);
  }
  if (state.cam.hi >= res.stage.bossPage) {       // $9A4F-$9A54 CMP $9A3D,X
    throw new Error(`$9A56 LDA $9A45,X: $3F reached ${state.cam.hi} `
                  + `(>= $9A3D[${state.zp19}] = ${res.stage.bossPage}), so the `
                  + `cartridge would set $1B = $81 and start the end-of-stage `
                  + `chain. Not ported.`);
  }
  setBgm(state, res);                             // $9A5B JSR $8357
  // ...and $8357 falls through into $9A5E.
  mode5Body(state, res);
}

/**
 * `$96EF` -- the dying arm. LIVE since wave 5: `$C1D6` (src/collision.js) is
 * what sets $1B = $A0, and `$979D` (src/flow.js respawn) is what ends it.
 *
 *   96EF  A5 4C / D0 03     $4C != 0 -> $96F6
 *   96F3  4C 9D 97  JMP $979D        the respawn -- and $979D ends `JMP $9B3E`,
 *                                    so this arm runs the whole stage intro and
 *                                    returns to $80AD WITHOUT touching $9A5E
 *   96F6  C6 4C     DEC $4C
 *   96F8  4C 5E 9A  JMP $9A5E        <- the FULL body, not the tail: a dying
 *                                       frame still spawns and updates enemies
 *                                       and still calls the player ($9FFC bails
 *                                       at its own $0100 >= 2 gate)
 *
 * MEASURED on "200:,10:S,190:,300:R": $C1D6 fired once at f493, $4C stepped 120
 * -> 0 over f494-f613, and $979D ran on f614 -- 120 frames exactly. Note the
 * asymmetry the two JMPs encode: the 120 counting frames run the mode-5 BODY
 * (so the camera keeps scrolling and the squadrons keep flying past the wreck,
 * which the corpus compares frame by frame), and the 121st runs the INTRO.
 */
function dyingArm(state, res) {
  if (state.zp4C === 0) {                         // $96EF/$96F1
    respawn(state, res);                          // $96F3 JMP $979D -> $9B3E
    return;
  }
  state.zp4C = u8(state.zp4C - 1);                // $96F6 DEC $4C
  mode5Body(state, res);                          // $96F8 JMP $9A5E
}

/**
 * `$9A5E-$9A86`, then the fall-through into `$9A88`. Reached from the play arm,
 * from the dying arm, and (on the cartridge) from six more tails that all
 * `JMP $9A5E`.
 */
function mode5Body(state, res) {
  // $9A5E: LDA $5C / CMP #$02 / BCS $9A70 -- when $5C >= 2 the player update
  // is skipped ENTIRELY here and a different caller at $969A runs it on EVEN
  // frames only. UNREACHABLE ON STAGE 1, and that is now settled rather than
  // merely unobserved: $9650 only computes $5C at all when the stage index
  // $19 == 4 (it counts the non-zero bytes at $0600/$0630/$0660/$0690), so on
  // every other stage $5C stays 0 (00-recon-flow.md 3, which closes
  // NOTES-player.md 12 open question 1). The throw stays because the port has
  // no stage 5. It is UNREACHABLE from here now that $965A's clear is ported --
  // only the $19 == 4 arm at $9683 can put a non-zero value back, and that arm
  // now throws at $9663 -- and it is kept as a tripwire for whoever ports it.
  if (state.zp5C >= 2) throw new Error('$5C >= 2: the stage-5 half-rate player path is not ported ($9A5E/$969A)');

  // ---- $9A64-$9A6D: the enemies, in the cartridge's order -----------------
  // The spawn engine runs BEFORE the player moves and the update loop AFTER,
  // which matters for the fan ($B0AF sub-states 1 and 2 compare their own Y
  // against $0320, the player's, so they see THIS frame's player position) and
  // for the one-frame-old positions the display list at $80A7 already used.
  spawnEngine(state, res);                        // $9A64 JSR $A2C0
  enemyBullets(state, res);                       // $9A67 JSR $BBB7
  updatePlayer(state, res);                       // $9A6A JSR $9FFC
  updateEnemies(state, res);                      // $9A6D JSR $ADAB

  // $9A70: JSR $BFE2 -- and this is the whole collision subsystem, not just the
  // shot sweep. $BFE2's nine-iteration outer loop over $0123,X (object slots
  // 3-11, all empty until wave 6) ends at $C04B/$C052 with `JMP $C0C7`, which is
  // the player-vs-enemy sweep, the death, the explosion walk and the terrain
  // probe. MEASURED: hook.BFE2 == hook.C052 == hook.C0C7 == 363 on a 700-frame
  // boot-play-die-respawn run, and $BFE6 fired 3267 times = 363 x 9 exactly.
  shotSweep(state, res);                          // $9A70 JSR $BFE2 -> $C0C7
  // $9A73: JSR $8974 -- the capsule apply, and it is AFTER the sweep on purpose.
  // The pickup at $C1AF INCs $42 during $9A70 and this consumes it in the same
  // frame, which is the whole reason $8974 tests $07 (HELD) and not $05 (edge):
  // touch a capsule with B down and the power-up lands on the touch frame.
  // MEASURED, same capsule, two runs: "380:A" gives $42 = 1 at f627 and $40 = 0;
  // "380:AB" gives $42 = 0 and $40 = 1 (src/powerup.js).
  applyCapsule(state, res);                       // $9A73 JSR $8974
  // $9A76: JSR $C772 -- `LDA $19 / CMP #$04 / BNE / RTS`: stage 5 only.

  latchScroll(state);                             // $9A79  -> $12 / $10
  mode5Tail(state, res, true);                    // falls through into $9A88
}

/**
 * `$9A88-$9ACE` -- the split, the camera inside it, the HUD and the streamer.
 *
 * SPLIT OUT AS ITS OWN FUNCTION BECAUSE THE ROM SPLITS IT OUT: `$9A8C` is a
 * real jump target, reached from `$9660` (pause), `$96A2` (the stage-5
 * half-rate arm, right after `INC $5B`) and `$98E2`. Every one of them enters
 * HERE with the body above already skipped or already run -- which is exactly
 * what makes `$5B` a within-frame flag. Calling it directly is therefore not
 * an invented entry point; it is the one three ROM arms use.
 *
 * `test1B` is the ONE instruction that separates the two entries: `$9A88
 * LDA $1B / BPL $9AC4`. The fall-through from $9A79 executes it; the three
 * `JMP $9A8C` arms do not. It is `false` by default because a direct call is by
 * definition one of those arms -- a paused frame reaches here with $1B = $80
 * anyway, so the two agree today and stop agreeing the moment anything jumps
 * to $9A8C with bit 7 clear.
 */
export function mode5Tail(state, res, test1B = false) {
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
  const split = (!test1B || (state.substate & 0x80) !== 0)  // $9A88 / BPL $9AC4
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

  // $9AC4: JSR $9C45 -- THE POWER-UP RANK. Recomputed from scratch here and
  // nowhere else, which is what makes it drift-proof and what makes it survive
  // a death: $9B3E wipes $3D-$97 and $17 is below that, and no intro state
  // reaches this line, so $17 holds its last value across the whole respawn.
  computeRank(state);                             // $9AC4 JSR $9C45

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

  // $9AD1: the pause handler, and it is INSIDE the tail rather than after it --
  // which is what lets an already-paused frame ($9660 JMP $9A8C) reach the
  // START test that unpauses it. src/flow.js.
  pauseCheck(state, res);                         // $9AD1 -> $9ADA / $9AFF
}
