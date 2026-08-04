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

import { MODE_STAGE, u8, BTN, ENEMY_BASE } from './state.js';
import { readJoypad } from './input.js';
import { drainQueue, queueTerminator } from './vram.js';
import { hudTick } from './hud.js';
import { cannedPacket } from './hudpackets.js';
import { buildDisplayList, oamDma } from './oam.js';
import { updatePlayer } from './player.js';
import { advanceCamera, latchScroll, addCamera16 } from './camera.js';
import { streamBlock } from './terrain.js';
import { spawnEngine, enemyBullets, updateEnemies, clearSlot,
         armCensus, armDriver, armDriverGated } from './enemies.js';
import { introStep, pauseCheck, respawn, codeMatch, startPlay, sub9BF0,
         introReset, introPackets, introHud, introMeter, introTerrain } from './flow.js';
import { shotSweep, collision, sub_CDA5 } from './collision.js';
import { applyCapsule, computeRank } from './powerup.js';
import { addScore } from './score.js';
import { soundDriver, setBgm, setBgmCode, soundRequest, pulse1Dur, SND_BASE, OFF } from './sound.js';
import { chrBank } from './render/ppu.js';
import { modeDispatch } from './modes.js';

// $80D4 jt_80D4 -- the 7-entry GAME-MODE jump table, indexed by `$00` (the
// mode byte) after `$83E4`'s `ASL A`. Verified straight out of assets/prg.bin
// (it is FIXED ROM data, not a ported set -- it cannot go stale).
//
// W39 PORTED THE OTHER SIX. This constant used to end "Only entry 5 ($9650) is
// ported; 0-4,6 are the boot/title/attract/continue/high-score screens the port
// boots past (src/main.js sets mode 5 directly)" -- and the description was
// wrong twice over as well as out of date: there is no continue SCREEN and no
// high-score entry anywhere in this table. Entry 4 is three instructions
// ($1B := 0) and CONTINUE is `$970D` inside mode 5, which sets $00 := 4 to get
// back to it. The seven are boot/title-scroll, title menu, attract demo, start
// jingle, handover, PLAY, and $816C. src/modes.js is the transcription.
//
// The list stays here because it is what the out-of-range throw in
// src/modes.js prints, and because tests/modes.test.js checks it against
// assets/prg.bin rather than against this file.
export const MODE_TARGETS = [0x80E2, 0x8116, 0x8121, 0x8137, 0x8165, 0x9650, 0x816C];

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
  // ...and the register WRITE LOG (wave 13), cleared here for the same reason
  // and in the same place: it is the frame's own writes, and a dropped NMI made
  // none. src/main.js reads it immediately after this function returns, which is
  // why it is cleared at the top rather than at the bottom.
  state.apuLog.length = 0;

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
  // ...and the enemy-BULLET loop ($BC19), for the same reason: $9A67 is past
  // the pause jump too, so a paused frame runs zero iterations and must read
  // 0 rather than inheriting the last played frame's 10. It is an internal
  // assertion rather than a compared field -- objloop.lua does not count
  // $BC21 -- which is written down in 11-impl-enemy-bullets.md as the
  // cheapest real improvement left on that path.
  state.work.bulletSlots = 0;
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
  // res.enemyTables carries $8BF2/$8C02, the stage-5 arm HEAD tables $8C06
  // reads. Passed here rather than plumbed through `res` so that every existing
  // two-argument call site (the unit tests) keeps working and throws by name if
  // it ever reaches $19 == 4.
  buildDisplayList(state, res.metasprites, res.enemyTables);

  // $80AA: JSR $80BE -> INC $02, the $80C0 pre-dispatch, then jt_80D4 at $80D1.
  //
  // W39: this used to be `if (mode === 5) stagePlay(); else throw`, which was
  // the W28b loudness fix standing in for six unported modes. All seven entries
  // now run and the dispatch itself lives in src/modes.js, next to the six
  // handlers and the $80C0 gate that has to run BEFORE it.
  state.frame = (state.frame + 1) & 0xFF;         // $80BE INC $02
  modeDispatch(state, res, stagePlay);            // $80C0-$80D1

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

  // ---- $9663-$96A2: THE STAGE-5 HALF-RATE FRAME FORK. Wave 32b. -----------
  //
  //   9663  LDA $19 / CMP #$04 / BNE $96A5      stage 5 only
  //   9669  LDX #$00 / count $0600/$0630/$0660/$0690 nonzero into X
  //   9683  STX $5C / CPX #$02 / BCC $96A5      fewer than 2 arms -> normal
  //   9689  LDA $02 / LSR A / BCC $96A5         EVEN frame        -> normal
  //   968E  JSR $A2C0 / $CB91 / $ADAB / $BBB7 / $9FFC / $C0C7
  //   96A0  INC $5B / JMP $9A8C
  //
  // THIS IS THE DEVELOPERS' OWN SLOWDOWN MITIGATION, and it is the only place
  // in the game where one logical update is spread over two hardware frames.
  // With two or more arms alive, the ODD frame runs spawn + arms + enemies +
  // enemy bullets + THE PLAYER + player-vs-enemy collision and then jumps
  // straight to $9A8C, skipping the whole $1B sub-state machine, the scroll
  // latch and the wave stream; the EVEN frame takes the normal $96A5 ladder but
  // $9A5E's own `$5C >= 2` test then skips $A2C0/$BBB7/$9FFC/$ADAB. So the ship
  // moves at 30 Hz while two arms are on screen. It is visible, it is
  // deliberate, and it is not a bug to smooth out.
  //
  // IT DOES NOT SPAN TWO `nmi()` CALLS. $9650 is entered once per NMI from
  // $80D1 and $96A2's JMP lands inside the same NMI, so the frame's OUTER shape
  // -- one input sample at $80B5, one display list, one DMA -- is unchanged.
  // The recon (32-recon-destructible-terrain.md §8) named "whether src/nmi.js
  // can express a forked frame" as the wave's biggest unknown; it can, and the
  // shape it needs is the one the PAUSE jump twelve lines above has shipped
  // since wave 1: run a subset, then call mode5Tail() directly.
  //
  // THE ORDER IS NOT $9A5E'S ORDER. $968E runs $ADAB BEFORE $9FFC; $9A5E runs
  // $9FFC before $ADAB. So on a forked frame the fan ($B0AF sub-states 1 and 2,
  // which compare their own Y against $0320) sees LAST frame's player position
  // and on a normal frame it sees this frame's. Re-using mode5Body's order here
  // would be wrong on every stage-5 odd frame and no timing check could see it.
  if (state.zp19 === 4) {                         // $9663/$9665/$9667 BNE $96A5
    state.zp5C = armCensus(state);                // $9669-$9683 STX $5C
    // $9685 CPX #$02 / BCC $96A5 and $9689 LDA $02 / LSR A / BCC $96A5 -- the
    // LSR puts bit 0 of the frame counter in carry, so the fork is the ODD
    // frame. Both tests fall through to the SAME $96A5 ladder.
    if (state.zp5C >= 2 && (state.frame & 0x01) !== 0) {
      spawnEngine(state, res);                    // $968E JSR $A2C0
      armDriver(state, res.enemyTables);          // $9691 JSR $CB91 (NOT $CB8A --
                                                  //   the $5C gate is skipped here)
      updateEnemies(state, res);                  // $9694 JSR $ADAB
      enemyBullets(state, res);                   // $9697 JSR $BBB7
      updatePlayer(state, res);                   // $969A JSR $9FFC
      collision(state, res);                      // $969D JSR $C0C7 -- and $C04B
                                                  //   makes $BFE2 skip it on the
                                                  //   other parity, so it stays
                                                  //   once per logical frame
      state.zp5B = u8(state.zp5B + 1);            // $96A0 INC $5B
      mode5Tail(state, res);                      // $96A2 JMP $9A8C
      return;
    }
  }

  // ---- $96A5: the ladder. Order matters -- it is five tests in sequence, not
  // a switch, so $1B = $30 takes the bit-4 arm and never sees bit 5.
  const sub = state.substate;
  if (sub & 0x10) { nextStage(state, res); return; }   // $96A5-$96A9 -> $96CF (W27)
  if (sub & 0x20) { dyingArm(state, res); return; }        // $96AB-$96AF
  if (sub & 0x40) { gameOverArm(state, res); return; }     // $96B1-$96B5 -> $96FB
  if (sub & 0x80) { playArm(state, res); return; }         // $96B7-$96BB
  introStep(state, res);                          // $96BE -> jt_96C5
}

/**
 * `$982A` -- the play arm. `LDA $1B / JSR $83E4` into the 16-entry table at
 * $982F. `$83E4` opens `ASL A`: the `$80` high bit leaves as carry-out and is
 * dropped, so the index is exactly **(low nibble of $1B) << 1**, 0-15. The
 * `$96A5` ladder guarantees that reaching here means bit 7 is set and bits 4-6
 * are clear, so `$1B` is `$80`-`$8F`.
 *
 * WAVE 24 MADE THE TABLE REAL. Before it the port refused any `$1B !== $80`
 * with one throw; now the dispatch is the cartridge's 16 entries and every arm
 * not yet ported throws with its ROM target. The stage-1-clear critical path is
 * 7 states ($80->$81->$82->$83->$84->$85->$86); W24 ports six of the bodies
 * plus the `$80` exit. `$86`/`$9904`, `$8B`-`$8D`, `$8E`/`$8F` and `$87`-`$8A`
 * stay throws (W27 / off the stage-1 clear path / intro-shared routines).
 *
 * The two convergence tails every arm ends in:
 *   `JMP $9A5B` = `setBgm` ($8357) then the mode-5 body ($9A5E falls through).
 *   `JMP $9A5E` = the mode-5 body only.
 */
function playArm(state, res) {
  switch (state.substate & 0x0F) {                  // $982C -> jt_982F, low nibble
    case 0x0: return st9A4D(state, res);            // [0]  $80 -> $9A4D
    case 0x1: return st9A0E(state, res);            // [1]  $81 -> $9A0E
    case 0x2: return st99E9(state, res);            // [2]  $82 -> $99E9
    case 0x3: return st99C0(state, res);            // [3]  $83 -> $99C0
    case 0x4: return st9982(state, res);            // [4]  $84 -> $9982
    case 0x5: return st997E(state, res);            // [5]  $85 -> $997E
    case 0x6: return st9904(state, res);            // [6]  $86 -> $9904 (W27);
    // ---- WAVE 38: THE END-OF-GAME CHAIN, arms 7-13 -------------------------
    // Arms 7-10 are the ORDINARY STAGE INTRO, reached through the PLAY
    // dispatcher instead of $96C5's. jt_$982F[7..10] and jt_$96C5[0..3] hold
    // the same four addresses; the difference is only the entry, and it is a
    // real difference: $96BE re-arms `$0D = 3` on every intro frame and $982A
    // does not, so the ending's four setup frames run with whatever blanking
    // $882C and $9BC5 leave. Delegating is the transcription -- these ARE the
    // same routines -- and the port calls them directly rather than through
    // introStep() for exactly that $0D reason.
    case 0x7: introReset(state, res);   return;      // [7]  $87 -> $9B3E
    case 0x8: introPackets(state, res); return;      // [8]  $88 -> $9BED
    case 0x9: introHud(state, res);     return;      // [9]  $89 -> $9C12
    case 0xA: introMeter(state, res);   return;      // [10] $8A -> $9C1E
    case 0xB: return st988C(state, res);             // [11] $8B -> $988C
    case 0xC: return st98DD(state, res);             // [12] $8C -> $98DD
    case 0xD: return st98E5(state, res);             // [13] $8D -> $98E5
    case 0xE:                                        // [14] $8E -> $984F (W27)
    case 0xF: return st984F(state, res);             // [15] $8F -> $984F (W27);
    default: throw new Error(`$982A: unreachable jt_$982F index ` // paranoia: 0x0F pins 0-15
      + `${state.substate & 0x0F}`);
  }
}

/**
 * `$9A4D` -- play sub-state $80 (index 0). The "scroll to the boss page" state;
 * its body has been live since wave 1. W24 ports its EXIT.
 *
 *   9A4D  A6 19 / A5 3F / DD 3D 9A / 90 05      $3F < $9A3D[$19] -> $9A5B (keep)
 *   9A56  BD 45 9A / 85 1B                      else $1B := $9A45[$19] = $81
 *   9A5B  20 57 83  JSR $8357                   setBgm, then $9A5E (convergence)
 *
 * `$9A45` is the constant `$81` for every stage (8 bytes, byte-verified off
 * rip/prg.asm). A literal is honest; `$81` is what every row holds. The two
 * paths converge at `$9A5B` (BCC-taken "keep playing" vs the advance) -- two
 * roads, one tail, NOT a fall-through trap.
 */
function st9A4D(state, res) {
  if (state.cam.hi >= res.stages[state.zp19].bossPage) {  // $9A4F-$9A54 CMP $9A3D,X / BCC $9A5B
    // $9A56 LDA $9A45,X / STA $1B. $9A45[$19] = $81 for all stages.
    state.substate = 0x81;                           // $9A59 STA $1B
  }
  setBgm(state, res);                               // $9A5B JSR $8357
  // ...and $8357 falls through into $9A5E.
  mode5Body(state, res);
}

/**
 * `$9A0E` -- play sub-state $81 (index 1). The 1-frame COUNTDOWN SETUP: loads
 * the 16-bit timer $4C:$4D and advances to $82.
 *
 *   9A0E  A6 17                       X = rank $17
 *   9A12  A5 19 / C9 06 / D0 08       stage != 6 -> $9A1E (the normal load)
 *   9A16  A9 01 / 85 4D               STAGE 7 ONLY: $4D := 1
 *   9A1A  A9 CA / D0 07               A := $CA, BNE $9A25 -- SKIPS $9A1E AND
 *                                     $9A23, so the $CA is what $9A25 stores
 *   9A1E  BD 35 9A / 85 4D            $4D := $9A35[$17]
 *   9A23  A9 00                       A := 0
 *   9A25  85 4C                       $4C := A   <- the SHARED store, and the
 *                                     reason $9A1C is a BNE and not a JMP
 *   9A27  E6 5B / E6 1B               INC $5B; $1B -> $82
 *   9A2D  A9 01 / 85 62               $62 := 1 (write-only flag, no PRG reader)
 *   9A2F  20 DF 99                    clear $63-$6F (sub_$99DF)
 *   9A32  4C 5B 9A                    JMP $9A5B (setBgm + body)
 *
 * `$9A35` is the rank-countdown table, exported as `stage.rankCountdown` (W24).
 * At rank 1 (the endchain run) `$9A35[1]` = `$03`, so `$00:$03` = 768 frames.
 */
function st9A0E(state, res) {
  const rank = state.zp17;                           // $9A0E LDX $17
  if (state.zp19 === 6) {                            // $9A12 CMP #$06
    // W36. THIS THREW, AND THE REASON GIVEN WAS CIRCULAR. "$4D:=1, $4C:=$CA is
    // unreachable -- the port loads one stage" was true of the corpus when W24
    // wrote it and was read back as a claim about the cartridge. Stage 7 IS
    // `$19 == 6`, and `$81` is the sub-state `$9A4D` hands to the frame the
    // camera reaches `bossPage` -- so this sat on the ORDINARY stage-7 path
    // from the moment the stage was admitted. It is also invisible to
    // `stagesweep.mjs`, which seeds `$1B = $80` and drives 1400 frames at
    // 2 px/frame: page 12 needs 1536. Found by scanning `assets/prg.bin` for
    // every `$19` compare (21 sites; `$9906` and `$9A12` are the only two
    // against `#$06`), exactly as W35 found `$99C4`.
    //
    // $9A16 LDA #$01 / STA $4D / LDA #$CA / BNE $9A25 -- the BNE is taken on a
    // non-zero immediate, so it lands PAST $9A1E's rank read and $9A23's
    // `LDA #$00`, and $9A25 STA $4C stores the $CA. Stage 7's countdown is a
    // FIXED $01CA = 458 frames, the same at every rank; every other stage's is
    // `$9A35[$17] * 256` (768 at rank 0, 1536 at rank 5).
    state.zp4D = 0x01;                               // $9A16 LDA #$01 / $9A18 STA $4D
    state.zp4C = 0xCA;                               // $9A1A LDA #$CA / $9A25 STA $4C
  } else {
    state.zp4D = res.stages[state.zp19].rankCountdown[rank]; // $9A1E LDA $9A35,X / STA $4D
    state.zp4C = 0;                                  // $9A23/$9A25 STA $4C
  }
  state.zp5B = u8(state.zp5B + 1);                   // $9A27 INC $5B
  state.substate = u8(state.substate + 1);           // $9A29 INC $1B -> $82
  state.spawn.z62 = 1;                               // $9A2D STA $62 (no PRG reader)
  clearSpawnExt(state);                              // $9A2F JSR $99DF
  setBgm(state, res);                               // $9A32 JMP $9A5B
  mode5Body(state, res);
}

/**
 * `$99E9` -- play sub-state $82 (index 2). THE COUNTDOWN. 16-bit decrement of
 * $4C:$4D via `$840C` once per frame until both are 0; the camera is frozen
 * meanwhile (INC $5B -> $9A9C skips `$98EE`). Ends with $60 := 0 (spawn engine
 * to idle) and `INC $1B` -> $83.
 *
 *   99E9  E6 5B                       INC $5B
 *   99EB  A2 4C / A9 01 / 20 0C 84    ($4C:$4D) -= 1  via $840C
 *   99F2  A5 4C / 05 4D / D0 66       not zero -> JMP $9A5E (loop)
 *   99F8  85 60 / E6 1B               $60 := 0; $1B -> $83
 *   99FC  A5 19 / F0 06               stage 0 -> sfx $3F
 *   9A00  C9 03 / F0 02               stage 3 -> sfx $3F
 *   9A04  D0 58                       else -> JMP $9A5E
 *   9A06  A9 3F / 20 1E EC            sfx $3F, then JMP $9A5E
 *
 * `$840C` with A=1 is a 16-bit subtract-1: `EOR #$FF` -> $FE, `SEC`, `ADC` ->
 * the byte - 1; borrow DECs the high byte. At rank 1 the count is $00:$03 = 768.
 */
function st99E9(state, res) {
  state.zp5B = u8(state.zp5B + 1);                   // $99E9 INC $5B
  // $840C: 16-bit decrement of $4C:$4D (A=1). No-carry = no borrow; carry = DEC hi.
  if (state.zp4C !== 0) state.zp4C = u8(state.zp4C - 1);     // $840F/$8411
  else { state.zp4C = 0xFF; state.zp4D = u8(state.zp4D - 1); } // $8415 DEC $01,X
  if ((state.zp4C | state.zp4D) !== 0) {             // $99F2/$99F4 ORA / D0 $9A5E
    mode5Body(state, res);                           // $99F6 BNE target
    return;
  }
  state.spawn.z60 = 0;                               // $99F8 STA $60 (A = 0 here)
  state.substate = u8(state.substate + 1);           // $99FA INC $1B -> $83
  if (state.zp19 === 0 || state.zp19 === 3) {        // $99FC/$9A00 stage 0 or 3
    soundRequest(state, 0x3F);                        // $9A06/$9A08 JSR $EC1E
  }
  mode5Body(state, res);                             // $9A0B JMP $9A5E
}

/**
 * `$99C0` -- play sub-state $83 (index 3). The 1-frame transition. INC $1B
 * (-> $84), and on stages 6 and 7 an immediate re-write of `$1B` to `$86`.
 *
 *   99C0  E6 1B                       $1B -> $84
 *   99C2  A5 19 / C9 05 / 90 0B       stage < 5 -> $99D3
 *   99C8  D0 05                       stage > 5 -> $99CF (skip the sfx)
 *   99CA  A9 AC / 20 1E EC            stage == 5: sfx $AC
 *   99CF  A9 86 / 85 1B               $1B := $86      ...and FALLS INTO $99D3
 *   99D3  E6 5B / A9 02 / 85 62       INC $5B; $62 := 2
 *   99D9  20 DF 99                    clear $63-$6F
 *   99DC  4C 5E 9A                    JMP $9A5E
 *
 * W35 -- TWO CORRECTIONS, AND THE SECOND IS A FALL-THROUGH.
 *
 * 1. **This threw for `$19 >= 5` and stage 6 IS `$19 == 5`.** The message said
 *    "Unreachable: the port loads one stage", which was true when W24 wrote it
 *    and is a statement about the corpus, not about the cartridge. `$83` is
 *    reached the frame the `$82` countdown ends, so a stage-6 run walked into
 *    it the moment stage 6 was admitted. It is NOT reachable by
 *    `tools/oracle/stagesweep.mjs`, which seeds `$1B = $80` and never leaves
 *    the wave stream -- found by scanning `assets/prg.bin` for `$19` compares
 *    against 5, not by running anything.
 * 2. **`$99CF` FALLS INTO `$99D3`.** There is no branch and no RTS between
 *    `$99D1 STA $1B` and `$99D3 INC $5B`, so the stage-6/7 path does the
 *    `INC $5B` / `$62 := 2` / clear-`$63-$6F` tail as well. The docstring this
 *    replaces wrote "else INC $5B", which is exactly the reading
 *    docs/knowledge/02 trap 1 warns about, and would have left `$5B` and the
 *    spawn scratch wrong on the only two stages that take the shortcut.
 *
 * `$1B` IS WRITTEN TWICE ON PURPOSE: `INC` to `$84` first, then `$86` over the
 * top. Reproduced in that order because `$1B` is a compared field.
 */
function st99C0(state, res) {
  state.substate = u8(state.substate + 1);           // $99C0 INC $1B -> $84
  if (state.zp19 >= 5) {                             // $99C4 CMP #$05 / BCC $99D3
    // $99C8 BNE $99CF -- stage 7 ($19 = 6) skips the sound; stage 6 plays it.
    if (state.zp19 === 5) soundRequest(state, 0xAC); // $99CA LDA #$AC / JSR $EC1E
    state.substate = 0x86;                           // $99CF LDA #$86 / $99D1 STA $1B
    // ...and FALLS INTO $99D3. No `return` here, and that is the whole point.
  }
  state.zp5B = u8(state.zp5B + 1);                   // $99D3 INC $5B
  state.spawn.z62 = 2;                               // $99D7 STA $62 (no PRG reader)
  clearSpawnExt(state);                              // $99D9 JSR $99DF
  mode5Body(state, res);                             // $99DC JMP $9A5E
}

/**
 * `$9982` -- play sub-state $84 (index 4). THE BOSS-PAGE SCROLL. Two paths:
 *   $3F == $9A3D[$19] (== bossPage) -> `BEQ $99BA`: run the despawn sweep
 *       `sub_$994A` and stay (the ~512-frame crawl at 0.5 px/frame).
 *   else ($3F > bossPage) -> the ADVANCE path: two HUD packets, `$2D := 1`,
 *       allocate slot 9 and write the boss object, INC $5B, `INC $1B` -> $85,
 *       `$5E := #$3F`.
 * Both then `JMP $9A5E`. W24 ports the CREATION; the boss per-frame handler
 * (`$B914`) and the death chain are W26, so the field window ends at $84.
 */
function st9982(state, res) {
  if (state.cam.hi === res.stages[state.zp19].bossPage) {  // $9986 CMP $9A3D,X / BEQ $99BA
    sub994A(state);                                  // $99BA JSR $994A (the despawn)
    mode5Body(state, res);                           // $99BD JMP $9A5E
    return;
  }
  // $998B: the advance path (fires once, the frame $3F leaves the boss page).
  cannedPacket(state, res.hudPackets, 0x1E);         // $998B/$998D
  cannedPacket(state, res.hudPackets, 0x05);         // $9990/$9992
  state.ppu.chrSel = 1;                              // $9995/$9997 STA $2D
  clearSlot(state, 9);                              // $999D JSR $A527 ($A8 := 9)
  const bi = 9 + ENEMY_BASE;                         // $0315 = $0300 + $15 (slot 21)
  state.obj.type[bi] = 0x98;                         // $99A2 STA $0315 (boss type)
  state.obj.y[bi] = 0x80;                           // $99A7 STA $0335
  state.obj.x[bi] = 0xF0;                           // $99AC STA $0375
  state.zp5B = u8(state.zp5B + 1);                   // $99AF INC $5B
  state.substate = u8(state.substate + 1);           // $99B1 INC $1B -> $85
  state.spawn.z5E = 0x3F;                            // $99B3 LDA #$3F / STA $5E (cursor)
  mode5Body(state, res);                             // $99B7 JMP $9A5E
}

/**
 * `sub_$994A` -- THE DESPAWN SWEEP, called from `$9982`'s `BEQ` (this wave) and
 * `$9904`'s `$1C==$93` arm (W27). Walks the despawn cursor `$5E` down one per
 * frame, clearing 8 collision-map columns at the cursor and (when the cursor is
 * < $14) the enemy object bytes behind it.
 *
 *   994A  A6 3E / E0 D0 / 90 ..      THE GUARD: only when $3E (scroll low) >= $D0
 *   9950  A6 5E / 30 ..              cursor valid (not $80+)
 *   9954  C6 5E                      DEC $5E (X still holds the OLD cursor)
 *   9958-996D  clear $0600/$0640/$0680/$06C0/$0500/$0540/$0580/$05C0,X
 *   9970  E0 14 / B0 ..              old cursor >= $14: skip the object clear
 *   9974-997A  clear $010C,$012C,$030C,X  (status/anim/type at enemy slot 12+X)
 *
 * `$5E` is seeded to the IMMEDIATE `$3F` (not the register) at `$99B3` on the
 * $84->$85 transition and at `$9C0F` on every intro (src/flow.js clearAhead).
 */
function sub994A(state) {
  if (state.cam.lo < 0xD0) return;                   // $994C CPX #$D0 / BCC $997D
  const x = state.spawn.z5E;                         // $9950 LDX $5E
  if (x & 0x80) return;                              // $9952 BMI $997D
  state.spawn.z5E = u8(state.spawn.z5E - 1);         // $9954 DEC $5E
  const c = state.coll;                              // $0500-$06FF
  c[0x100 + x] = 0;                                  // $9958 STA $0600,X
  c[0x140 + x] = 0;                                  // $995B STA $0640,X
  c[0x180 + x] = 0;                                  // $995E STA $0680,X
  c[0x1C0 + x] = 0;                                  // $9961 STA $06C0,X
  c[0x000 + x] = 0;                                  // $9964 STA $0500,X
  c[0x040 + x] = 0;                                  // $9967 STA $0540,X
  c[0x080 + x] = 0;                                  // $996A STA $0580,X
  c[0x0C0 + x] = 0;                                  // $996D STA $05C0,X
  if (x >= 0x14) return;                             // $9970 CPX #$14 / BCS $997D
  const i = ENEMY_BASE + x;                          // $010C,X = $0100+$0C+X
  state.obj.status[i] = 0;                           // $9974 STA $010C,X
  state.obj.anim[i] = 0;                             // $9977 STA $012C,X
  state.obj.type[i] = 0;                             // $997A STA $030C,X
}

/**
 * `$997E` -- play sub-state $85 (index 5). THE BOSS FIGHT. The handler is two
 * instructions:
 *
 *   997E  E6 5B      INC $5B
 *   9980  D0 35      BNE $99B7      -> JMP $9A5E (continue)
 *
 * The `BNE` is ALWAYS taken: `$5B` is cleared every mode-5 frame at `$9658
 * STA $5B` (inside `stagePlay`, BEFORE the `$96A5` ladder reaches `$997E`), so
 * the `INC` makes it 1 and the test-for-nonzero always branches. The
 * fall-through into `st_9982` ($84) is STRUCTURALLY DEAD -- it would re-fire
 * the boss-page spawn every 256 frames. NOT ported; cited to `$9658`.
 *
 * `$85` exits via the boss-death `INC $1B` (->$86), which lives in the boss
 * death chain (`$B914`, W26) -- NOT here. `$997E` has no `$1B` writer.
 */
function st997E(state, res) {
  state.zp5B = u8(state.zp5B + 1);                   // $997E INC $5B
  // $9980 BNE $99B7 -- always taken ($5B was 0, now 1). Fall-through is DEAD.
  mode5Body(state, res);                             // $99B7 JMP $9A5E
}

/**
 * `$9904` -- play sub-state $86 (index 6). THE STAGE-END. Runs every frame the
 * boss is dead and the camera crawls the last page to the stage boundary; fires
 * the despawn sweep, watches the camera page against `stage.endPage[$19]`, and
 * the frame it arrives sets `$1B` to either `$90` (seamless next stage, the
 * `$39 == 0` path) or `$8E` (the `$39` warp route). Either way the mode-5 body
 * runs THIS frame; the actual stage swap is one frame later in `$96CF`.
 *
 *   9904  LDA $19 / CMP #$06 / D0 03 / JMP $9872     $19 == 6 -> ending (throw)
 *   990D  CMP #$05 / D0 03 / JSR $CDA5               $19 == 5 -> stage-6 arm (throw)
 *   9914  LDA $B2 / BNE $991D                         pulse1 OWNER; skip the seed-sound
 *   9918  LDX #$93 / JSR $839F                        setBgmCode($93): $1C := $93, sfx $7D,$93
 *   991D  LDA $1C / CMP #$93 / D0 03 / JSR $994A      $1C == $93 -> despawn sweep
 *   9926  LDY $19 / LDA $3F / CMP $98FD,Y / BCC $9947 cam.hi < endPage -> keep scrolling
 *   992F  LDA $1B / AND #$70 / BNE $9947              dying/game-over bits -> skip
 *   9935  LDA #$90 / LDX $39 / BEQ $9945              $39 == 0 -> $1B := $90 (next stage)
 *   993B  INC $19 / INC $3A / LDA #$00 / STA $3F / LDA #$8E   WARP: $1B := $8E
 *   9945  STA $1B
 *   9947  JMP $9A5E
 *
 * `$B2` is pulse1's OWNER byte (`$B0 + OFF.OWNER`); the seed only fires while
 * pulse1 is free, and `setBgmCode` de-dupes on `$1C` so the sfx lands once.
 * `$98FD` is `stage.endPage`, exported (W21); stage 1 ends at cam.hi `$0E`.
 */
function st9904(state, res) {
  if (state.zp19 === 6) {                            // $9906 CMP #$06
    loc9872(state);                                  // $990A JMP $9872
    return;                                          // $988B RTS -- no mode-5 body
  }
  if (state.zp19 === 5) {                            // $990D CMP #$05
    // W35. NOT a "5-line hook": $CDA5 is a bound test and TWO `JSR $CDB3`, and
    // $CDB3 is the routine -- see src/collision.js. It carves stage 6's exit
    // aperture, two cells a frame for 44 frames, out of the nametable and the
    // collision map together.
    sub_CDA5(state, res);                            // $9911 JSR $CDA5
  }
  // $9914 LDA $B2 / BNE $991D. $B2 = pulse1 OWNER; skip the stage-clear seed
  // while a sound owns pulse 1.
  if (state.snd[OFF.OWNER] === 0) {                  // $9916 BNE $991D
    setBgmCode(state, 0x93);                          // $9918 LDX #$93 / JSR $839F
  }
  // $991D LDA $1C / CMP #$93 / BNE $9926. The despawn sweep runs every frame the
  // stage-clear code ($93) is the current BGM -- sub_$994A is already ported.
  if (state.zp1C === 0x93) {                         // $991F CMP #$93 / BNE
    sub994A(state);                                   // $9923 JSR $994A
  }
  // $9926 LDY $19 / LDA $3F / CMP $98FD,Y / BCC $9947. res.stages[$19].endPage is
  // $98FD[$19] (stage 1: $0E, stage 2: $0E); $19 has not advanced yet.
  if (state.cam.hi < res.stages[state.zp19].endPage) {  // $992A CMP $98FD,Y / BCC $9947
    mode5Body(state, res);                            // $9947 JMP $9A5E
    return;
  }
  // $992F LDA $1B / AND #$70 / BNE $9947 -- defensive: dying/game-over bits.
  if (state.substate & 0x70) {                       // $9931 AND #$70
    mode5Body(state, res);                            // $9947 JMP $9A5E
    return;
  }
  // $9935 LDA #$90 / LDX $39 / BEQ $9945.
  if (state.zp39 === 0) {                            // $9939 BEQ $9945
    state.substate = 0x90;                            // $9935 A=$90 -> STA $1B (next stage)
  } else {
    // $993B INC $19 / INC $3A / LDA #$00 / STA $3F / LDA #$8E. The warp: $19
    // skips stage 2 here, $3A arms the warp rain, cam.hi resets, $1B := $8E.
    state.zp19 = u8(state.zp19 + 1);                  // $993B INC $19
    state.build.gate = u8(state.build.gate + 1);      // $993D INC $3A
    state.cam.hi = 0;                                 // $993F/$9941 LDA #$00 / STA $3F
    state.substate = 0x8E;                            // $9943 LDA #$8E -> STA $1B
  }
  mode5Body(state, res);                             // $9947 JMP $9A5E
}

// ======================= WAVE 38: THE END-OF-GAME CHAIN ======================
//
// Six sub-states, one enemy handler and one typewriter, and it is the LOOP
// WRAP: `$9889 INC $28,X` is the ONLY instruction in the whole 32 KB PRG that
// increments the loop counter, and `$9B72 LDA $28,X / $9B74 STA $1A` is the
// only thing that reads it back. Scanned this wave rather than inherited:
// eleven instructions in the PRG name `$1A`, none of them indexed, and `$28,X`
// has exactly three (`$97BF` STA, `$9889` INC, `$9B72` LDA).
//
// THE SHAPE THE PLAN DID NOT HAVE. `29-plan-whole-game.md` lists `$9872` ->
// `$8B` -> `$8C` -> `$8D` and skips FOUR states, which is why it also does not
// say that the ending plays over STAGE 1's terrain. `$9872`'s `INC $1B` lands
// on `$87`, and `jt_$982F[7..10]` is the stage-intro ladder:
//
//   $86  $9904  $19 == 6 -> JMP $9872
//        $9872  INC $1B; $2001 := 0; $3F := 0; $26,X := 0; $24,X := 0;
//               $22,X := ($42 ? 1 : 0); INC $28,X; RTS
//   $87  $9B3E  the full wipe -- and it restores $19 from $26,X (now 0, so
//               STAGE 1) and $1A from $28,X (now loop + 1)
//   $88  $9BED  $89  $9C12  $8A  $9C1E     the same three intro rungs
//   $8B  $988C  stream terrain until $57, THEN the brain
//   $8C  $98DD  objects only -- the scene
//   $8D  $98E5  $1B := 0 / JMP $9B3E -> the ordinary intro -> $1B := $80
//
// so the wrap is not a special "restart" path at all: it is the game's own
// stage intro, run twice, with the checkpoint bytes rewritten in between.

/**
 * `loc_$9872` -- THE LOOP WRAP. Reached only from `$9904` with `$19 == 6`.
 *
 *   9872  E6 1B        INC $1B                 $86 -> $87
 *   9874  A6 18        LDX $18
 *   9876  A9 00        LDA #$00
 *   9878  8D 01 20     STA $2001               PPUMASK off, MID-FRAME
 *   987B  85 3F        STA $3F                 camera page := 0
 *   987D  95 26        STA $26,X               the checkpoint STAGE := 0
 *   987F  95 24        STA $24,X               the checkpoint PAGE  := 0
 *   9881  A4 42        LDY $42
 *   9883  F0 02        BEQ $9887               ($42 == 0 leaves A = 0)
 *   9885  A9 01        LDA #$01
 *   9887  95 22        STA $22,X               $22,X := ($42 ? 1 : 0)
 *   9889  F6 28        INC $28,X               <-- THE LOOP COUNTER
 *   988B  60           RTS                     no mode-5 body this frame
 *
 * `$9878` IS A REGISTER WRITE, NOT `$11`. The NMI already pushed `$11` into
 * `$2001` at `$808A`, hundreds of cycles earlier in this same frame, so this
 * blanks the screen for the REST of the frame and leaves `$11` alone. The port
 * writes `bandA.mask` (what the renderer draws with) and not `ppu.mask` (`$11`,
 * which `$808A` reads next frame) for exactly that reason.
 *
 * `$22`/`$24`/`$26`/`$28` are the per-player checkpoint quartet `$979D` writes
 * on a death and `$9B62`-`$9B74` restores on an intro. Rewriting three of them
 * and incrementing the fourth is the whole of "start the game again, one loop
 * harder": stage 0, page 0, the meter cursor collapsed to 0-or-1, loop + 1.
 * LIVES (`$20,X`) are NOT touched, and neither is the score.
 */
function loc9872(state) {
  state.substate = u8(state.substate + 1);           // $9872 INC $1B  ($86->$87)
  const p = state.zp.player;                         // $9874 LDX $18
  if (p !== 0 && p !== 1) {
    throw new Error(`$18 = ${p}: $987D writes $26,X and $9889 INCs $28,X; `
                  + 'only 0 and 1 are player indices');
  }
  state.bandA.mask = 0;                              // $9878 STA $2001 (see above)
  state.cam.hi = 0;                                  // $987B STA $3F
  state.save26[p] = 0;                               // $987D STA $26,X
  state.save24[p] = 0;                               // $987F STA $24,X
  // $9881 LDY $42 / BEQ $9887 / LDA #$01 -- A is 0 from $9876 unless $42 is set.
  state.save22[p] = state.zp.meter !== 0 ? 1 : 0;    // $9887 STA $22,X
  state.save28[p] = u8(state.save28[p] + 1);         // $9889 INC $28,X
}

/**
 * `st_$988C` -- play sub-state `$8B`, and the rung that decides whether the
 * intro ends in PLAY or in the ENDING.
 *
 *   988C  A5 57 / D0 03      $57 != 0 -> $9893
 *   9890  4C 24 9C           JMP $9C24        <- the intro's own terrain rung
 *   9893  A2 09 / 86 A8 / 20 27 A5      clearSlot(9)
 *   989A  C6 A8 / 20 27 A5               clearSlot(8)
 *   989F  A9 28 / 8D 15 03   $0315 = type[21] := $28  -> $AE1C entry 40, $BB0F
 *   98A4  A9 88 / 8D 35 03   $0335 = y[21]    := $88
 *   98A9  A9 A4 / 8D 75 03   $0375 = x[21]    := $A4
 *   98AE  A9 80 / 8D 34 03   $0334 = y[20]    := $80
 *   98B3  A9 74 / 8D 74 03   $0374 = x[20]    := $74
 *   98B8  A9 9E / 8D 34 01   $0134 = anim[20] := $9E
 *   98BD  A9 00 / 8D 20 01 / 8D 00 01    anim[0] := 0, status[0] := 0
 *   98C5  E6 1B              INC $1B -> $8C
 *   98C7  A9 03 / 8D 00 01   status[0] := 3   <- the ship, back on and INERT
 *   98CC  A9 E8 / 20 1E EC   sfx $E8
 *   98D1  E6 1F              INC $1F
 *   98D3  A9 21 / 20 E8 85   canned packet $21
 *   98D8  A9 05 / 4C E8 85   canned packet $05  (a JMP: $85E8's RTS ends here)
 *
 * `$57` IS THE TERRAIN STREAMER'S "far enough ahead" FLAG, not a timer, and it
 * is why the brain appears when it does: `$9B3E` set `$3F` and `$55` from the
 * same (now zero) checkpoint byte, so the lead is 0, and `$9C24` emits four
 * blocks a frame until `$9DA7` refuses on the 85th. On stage 1 that is 23
 * frames -- the same 23 the boot intro measures (src/flow.js) -- and `$9C24`
 * NEVER advances `$1B`, so `$988C` re-runs every one of them.
 *
 * SO `$9C24`'s OWN `$57 != 0` ARM ($9C38 -> $9C3C -> `$1B := $80`, i.e. PLAY)
 * IS UNREACHABLE FROM HERE: `$988C` tests `$57` first and diverts. Nothing is
 * clamped for it -- the port calls introTerrain() exactly as `$9890 JMP $9C24`
 * does, and the arm is dead by the CALLER's test.
 *
 * THE TWO `$0100` WRITES ARE BOTH KEPT. `$98C2` writes 0 and `$98C7` writes 3
 * with an `INC $1B` in between; the 0 never reaches a reader, and it is a real
 * store in the ROM's straight line (same call W36 made on `$B569`).
 *
 * AND 3 IS NOT "ALIVE" -- it is the DEAD side of every gate that reads `$0100`.
 * `$89E3 CMP #$02 / BCC` (the power meter), `$9FFC CMP #$02 / BCS -> $A16F`
 * (the player update jumps to the death animation) and `$C0C7` all treat
 * `>= 2` as dead. None of them runs during `$8C` -- `$98DD` calls only `$ADAB`
 * and `$9A8C` -- and `$98BF` has already set `$0120` to 0, so the Vic Viper is
 * not drawn at all. The ending is the only place in the game where the ship is
 * simultaneously marked dead and not exploding.
 */
function st988C(state, res) {
  if (state.build.ahead === 0) {                     // $988C LDA $57 / BNE $9893
    introTerrain(state, res);                        // $9890 JMP $9C24
    return;
  }
  const o = state.obj;
  clearSlot(state, 9);                               // $9893-$9897 LDX #$09 / JSR $A527
  clearSlot(state, 8);                               // $989A/$989C DEC $A8 / JSR $A527
  o.type[9 + ENEMY_BASE] = 0x28;                     // $989F/$98A1 STA $0315
  o.y[9 + ENEMY_BASE] = 0x88;                        // $98A4/$98A6 STA $0335
  o.x[9 + ENEMY_BASE] = 0xA4;                        // $98A9/$98AB STA $0375
  o.y[8 + ENEMY_BASE] = 0x80;                        // $98AE/$98B0 STA $0334
  o.x[8 + ENEMY_BASE] = 0x74;                        // $98B3/$98B5 STA $0374
  o.anim[8 + ENEMY_BASE] = 0x9E;                     // $98B8/$98BA STA $0134
  o.anim[0] = 0;                                     // $98BD/$98BF STA $0120
  o.status[0] = 0;                                   // $98C2 STA $0100
  state.substate = u8(state.substate + 1);           // $98C5 INC $1B -> $8C
  o.status[0] = 3;                                   // $98C7/$98C9 STA $0100
  soundRequest(state, 0xE8);                         // $98CC/$98CE JSR $EC1E
  state.zp1F = u8(state.zp1F + 1);                   // $98D1 INC $1F
  cannedPacket(state, res.hudPackets, 0x21);         // $98D3/$98D5 JSR $85E8
  cannedPacket(state, res.hudPackets, 0x05);         // $98D8/$98DA JMP $85E8
}

/**
 * `st_$98DD` -- play sub-state `$8C`. The whole ending SCENE runs here, and
 * what is remarkable is what it does NOT call.
 *
 *   98DD  E6 5B     INC $5B          suppresses the camera at $9A9C
 *   98DF  20 AB AD  JSR $ADAB        the object pass, and ONLY the object pass
 *   98E2  4C 8C 9A  JMP $9A8C        the tail, entered PAST the `LDA $1B/BPL`
 *
 * No `$A2C0` spawn engine, no `$9FFC` player, no `$C0C7` collision, no `$BBB7`
 * enemy bullets, no `$9D83` streamer. The brain (`$BB0F`, dispatch entry 40)
 * is the only thing alive, and it is the one that ends the state with its own
 * `INC $1B` at `$BB26`.
 *
 * `$9A8C` is entered one instruction PAST `$9A88 LDA $1B / BPL $9AC4`, which is
 * the `test1B = false` case mode5Tail() already models -- and here it matters
 * for the first time in this port, because `$1B` is `$8C` and bit 7 IS set, so
 * the two agree anyway. `INC $5B` is what stops the camera; the split still
 * runs (docs/knowledge: `$15`/`$5B` skip `JSR $98EE` and nothing else).
 */
function st98DD(state, res) {
  state.zp5B = u8(state.zp5B + 1);                   // $98DD INC $5B
  updateEnemies(state, res);                         // $98DF JSR $ADAB
  mode5Tail(state, res);                             // $98E2 JMP $9A8C
}

/**
 * `st_$98E5` -- play sub-state `$8D`. THE WRAP ITSELF, and it is three
 * instructions.
 *
 *   98E5  E6 5B     INC $5B
 *   98E7  A9 00 / 85 1B    $1B := 0     <- out of the play ladder entirely
 *   98EB  4C 3E 9B  JMP $9B3E           the ORDINARY intro, THIS frame
 *
 * `$9B3E` INCs `$1B` to 1, so the next frame takes `$96BE`'s intro dispatch
 * (`$0D = 3` re-armed every frame this time) and walks 1, 2, 3, 4 to `$9C24`,
 * whose `$57` arm now DOES fire -- `$9C3C` sets `$1B := $80` and loop 2 of
 * stage 1 begins. `$19` and `$1A` come back out of `$26,X`/`$28,X`, which
 * `$9872` set to 0 and loop + 1.
 */
function st98E5(state, res) {
  state.zp5B = u8(state.zp5B + 1);                   // $98E5 INC $5B
  state.substate = 0;                                // $98E7/$98E9 STA $1B
  introReset(state, res);                            // $98EB JMP $9B3E
}

/**
 * `$96CF` -- the `$1B & $10` ladder arm, NEXT STAGE. Reached the frame after
 * `$9904` sets `$1B := $90` (seamless) or `$984F` sets `$1B := $90` (warp tail).
 * Increments the stage counter, clears the warp/camera state and `$50-$70`, and
 * runs the seamless transition: `$9BF0` (HUD packets) then `$9C3C` (`$60 := 1,
 * $1B := $80`). No `$882C` screen reload, no intro wait -- play continues into
 * the next stage immediately (MEASURED: one execution, stage 2 starts at once).
 *
 *   96CF  LDX $1B
 *   96D1  INC $19                                    stage counter ++
 *   96D3  LDA #$00 / STA $39 / STA $3A / STA $3F     clear warp flag/gate/cam.hi
 *   96DB  LDX #$20 / STA $50,X / DEX / BPL           clear $50-$70 (33 bytes)
 *   96E2  LDA #$01 / STA $55                         build.hi := 1 (streamer page)
 *   96E6  JSR $9BF0                                  HUD packets + INC $1B + clearAhead
 *   96E9  JSR $9C3C                                  startPlay: $60 := 1, $1B := $80
 *   96EC  JMP $9A5E                                  mode-5 body THIS frame
 *
 * `$9BF0` is called DIRECTLY (not `$9BED`): no `stopAllSound` prologue. Its
 * `INC $1B` is overwritten by `$9C3C`; its `clearAhead` (`$5E := $3F`) survives.
 */
function nextStage(state, res) {
  state.zp19 = u8(state.zp19 + 1);                   // $96D1 INC $19
  // $96D3 LDA #$00 (A stays 0 through the stores and the $50-$70 loop).
  state.zp39 = 0;                                    // $96D5 STA $39
  state.build.gate = 0;                              // $96D7 STA $3A
  state.cam.hi = 0;                                  // $96D9 STA $3F
  clearStageAdvanceZp(state);                        // $96DB-$96E1 clear $50-$70
  state.build.hi = 1;                                // $96E2/$96E4 LDA #$01 / STA $55
  sub9BF0(state, res);                               // $96E6 JSR $9BF0
  startPlay(state);                                  // $96E9 JSR $9C3C ($60 := 1, $1B := $80)
  mode5Body(state, res);                             // $96EC JMP $9A5E
}

/**
 * The `$96DD STA $50,X / DEX / BPL` loop (X = $20..$00) clears `$50-$70`
 * inclusive (33 bytes). Written out as the fields the port keeps for that
 * range; the addresses it does not model ($50-$53, $56, $59-$5A, $68, $70) are
 * RAM with no ported reader, named here so the gaps are visible. This is the
 * same set `clearZeroPage` (src/flow.js) wipes on a stage intro, minus $3D-$4F
 * which `$96CF` does not touch.
 */
function clearStageAdvanceZp(state) {
  // $50-$53, $56, $59-$5A, $68, $70: no ported field (RAM the port does not keep).
  state.build.lo = 0;                                // $54
  // $55 cleared here, re-seeded to 1 by the caller ($96E4).
  state.build.hi = 0;                                // $55
  state.build.ahead = 0;                             // $57
  state.build.prog = 0;                              // $58
  state.zp5B = 0;                                    // $5B
  state.zp5C = 0;                                    // $5C
  state.spawn.z5D = 0;                               // $5D
  state.spawn.z5E = 0;                               // $5E (re-seeded to $3F by sub9BF0's clearAhead)
  state.zp5F = 0;                                    // $5F
  state.spawn.z60 = 0;                               // $60
  state.spawn.z61 = 0;                               // $61
  state.spawn.z62 = 0;                               // $62
  state.spawn.z64 = 0; state.spawn.z65 = 0;          // $64-$67
  state.spawn.z66 = 0; state.spawn.z67 = 0;
  state.spawn.z69 = 0;                               // $69
  state.spawn.z6A = 0; state.spawn.z6B = 0;          // $6A:$6B (wave cursor)
  state.spawn.z6C = 0; state.spawn.z6D = 0;          // $6C-$6F
  state.spawn.z6E = 0; state.spawn.z6F = 0;
  state.spawn.z68 = 0;                             // $68 (the warp-rain counter)
}

/**
 * `$984F` -- play sub-states $8E/$8F (index 14/15). THE WARP ROUTE. Reached only
 * when `$9904` saw `$39 != 0` (the four-hatch-kill warp flag): 4 px/frame
 * forced scroll, the type-$A6 rain (spawned via the late spawner's `$3A` gate,
 * src/enemies.js), and at cam.hi `$11` a +$5000 score and `$1B := $90` -> the
 * `$96CF` next-stage arm (whose `INC $19` is the SECOND increment -- stage 2 is
 * skipped). On the endchain run `$39` is 0 (a TIMEOUT kill), so this is reached
 * only via the `$39` poke (W27 done-when 2, labelled per knowledge/09).
 *
 *   984F  LDA #$01 / STA $2D                         CHR selector := 1 (CNROM bank 2)
 *   9853  LDX #$3E / LDA #$04 / JSR $8402            cam.lo:hi += 4 (forced scroll)
 *   985A  LDA $3F / CMP #$11 / BCC $986F             cam.hi < $11 -> keep scrolling
 *   9860  LDA $1B / AND #$70 / BNE $986F             dying/game-over -> skip
 *   9866  LDA #$50 / JSR $8455                       score +$5000 ($9A := $50)
 *   986B  LDA #$90 / STA $1B                         -> $96CF next stage
 *   986F  JMP $9A5E
 */
function st984F(state, res) {
  state.ppu.chrSel = 1;                              // $984F/$9851 STA $2D
  addCamera16(state, 4);                             // $9853-$9857 LDA #$04 / JSR $8402
  // $985A LDA $3F / CMP #$11 / BCC $986F.
  if (state.cam.hi >= 0x11 && !(state.substate & 0x70)) {   // $985E/$9862/$9864
    addScore(state, 0x00, 0x50, 0x00);               // $9866 LDA #$50 / JSR $8455
    state.substate = 0x90;                            // $986B/$986D LDA #$90 / STA $1B
  }
  mode5Body(state, res);                             // $986F JMP $9A5E
}

/**
 * `sub_$99DF` -- clear `$63-$6F` (13 bytes, `LDX #$0C / STA $63,X / DEX / BPL`).
 * Called from `$81` ($9A2F) and `$83` ($99D9). Of the range, `$64-$67` and
 * `$69-$6F` are the spawn-engine zero page (modelled); `$63` and `$68` have no
 * ported reader (cleared on the cartridge, inert here).
 */
function clearSpawnExt(state) {
  state.spawn.z64 = 0; state.spawn.z65 = 0;          // $64-$67
  state.spawn.z66 = 0; state.spawn.z67 = 0;
  state.spawn.z69 = 0;                               // $69
  state.spawn.z6A = 0; state.spawn.z6B = 0;          // $6A:$6B
  state.spawn.z6C = 0; state.spawn.z6D = 0;          // $6C-$6F
  state.spawn.z6E = 0; state.spawn.z6F = 0;
}

/**
 * `$96FB` -- the GAME-OVER arm (the `$1B & $40` ladder arm, not a jt_$982F
 * entry). Reached once `$97F1` sets `$1B := $C0` (the last life gone).
 * MEASURED: 794 executions across the 11 throwaudit recordings (397 in
 * deep-survivor + 397 in deep-autofire), the highest-traffic unported arm.
 *
 *   96FB  E6 5B                       INC $5B (freezes the camera for the hold)
 *   96FD  A5 B0 / D0 5C               $B0 != 0 (jingle playing) -> $975D
 *   9701  A5 0A / 29 03 / D0 0E       $0A != 0 (a player still in) -> $9715
 *   9707  A5 05 / 29 10 / F0 08       START not pressed -> $9715
 *   970D  20 D5 82 / A9 04 / 85 00    CONTINUE -> mode 4 (unported)
 *   975D  A2 00 / 20 65 97 / 4C 5E 9A codeMatch(0) + mode-5 body  ($975D tail)
 *   9715  A5 4C / D0 42               $4C != 0 -> $975B (DEC $4C, $975D tail)
 *         ($4C == 0: the continue window expired -> restart; throw)
 *
 * `$B0` is pulse 1's DUR byte (src/sound.js pulse1Dur): non-zero while the
 * game-over jingle `$AF` plays. `$0A` is "players still in the game"; `$97F1`
 * clears the dead player's bit, so a solo game-over leaves `$0A == 0`. `$4C`
 * is the 120-frame continue timeout seeded at `$9825`.
 *
 * The two tails that leave mode 5 -- CONTINUE (mode 4, `$970D`) and the
 * timeout-expired restart to title (mode 0, `$9751`) -- are unported and throw
 * loudly with their ROM address. The reproduced window is the `$B0`-gated hold
 * plus the `$4C` countdown.
 */
function gameOverArm(state, res) {
  state.zp5B = u8(state.zp5B + 1);                   // $96FB INC $5B
  if (pulse1Dur(state) !== 0) {                      // $96FD LDA $B0 / BNE $975D
    codeMatch(state, res, 0);                        // $975D LDX #$00 / JSR $9765
    mode5Body(state, res);                           // $9762 JMP $9A5E
    return;
  }
  // $9701: jingle done. $0A = players still in the game (bit per player).
  if (!(state.zp0A & 0x03)) {                        // $9701/$9703 (BNE $9715 if a player in)
    // $0A == 0 -- the solo game-over case (the dead player's bit was cleared at
    // $97F9). START here means CONTINUE.
    if (state.input.pressed & BTN.START) {           // $9707/$9709 AND #$10
      throw new Error('$970D: CONTINUE pressed on the game-over screen. JSR '
                    + '$82D5 then mode := 4 (the continue/respawn screen) is '
                    + 'not ported -- modes 0-4 are out of scope.');
    }
  }
  continueTimeout(state, res);                        // $9715
}

/** `$9715` -- the continue timeout / window-expired tail of `$96FB`. */
function continueTimeout(state, res) {
  if (state.zp4C !== 0) {                            // $9715/$9717 BNE $975B
    state.zp4C = u8(state.zp4C - 1);                 // $975B DEC $4C
    codeMatch(state, res, 0);                        // $975D LDX #$00 / JSR $9765
    mode5Body(state, res);                           // $9762 JMP $9A5E
    return;
  }
  // $9719: $4C == 0 -- the 120-frame continue window expired.
  if (state.zp33 === 0x0A) {                         // $971D CPY #$0A (Y = $33)
    throw new Error('$9721: continue cheat ($33 reached $0A). The lives restore '
                  + '($20,X := 3), $0A OR, score clear and JMP $97DD are not '
                  + 'ported.');
  }
  if (state.zp0A & 0x03) {                           // $974B/$974D AND #$03
    throw new Error('$97C5: multiplayer continue-timeout expired -- the player '
                  + 'switch ($97C5-$97DB) is not ported.');
  }
  // $9751: solo timeout expired -> restart to title. JSR $9B3E, mode := 0.
  throw new Error('$9751: game-over continue window expired -> restart to title '
                + '(JSR $9B3E then mode := 0, $1B := 0). $9B3E is ported but '
                + 'mode 0 (attract/title) is not; the restart-to-title is out '
                + 'of scope. REACHABLE on the cartridge: the deep-survivor and '
                + 'deep-autofire runs each sit in $96FB for ~397 frames.');
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
    // respawn() returns false on GAME OVER ($97F1 -> JMP $9A5E): the game-over
    // entry ends in the mode-5 body, so run it here. A normal respawn (true)
    // runs the intro and does NOT reach the body -- the next frame's dispatch
    // takes the intro states.
    if (!respawn(state, res)) mode5Body(state, res);  // $96F3 -> $979D / $9827 JMP $9A5E
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
  // $9A5E: LDA $5C / CMP #$02 / BCS $9A70 -- when $5C >= 2 the player update is
  // skipped ENTIRELY here and $969A runs it on the ODD frames instead. That is
  // the other half of $9663's fork, and W32b turned it from a throw into the
  // branch the cartridge has.
  //
  // IT REMAINS UNREACHABLE ON EVERY STAGE BUT 5, and that is settled by the
  // listing rather than merely unobserved: $965A clears $5C on every mode-5
  // frame and $9683 is the only other writer in the whole PRG, behind
  // `$19 == 4`. So stages 1-4 and 6-7 take the four calls below unconditionally
  // (00-recon-flow.md 3, which closes NOTES-player.md 12 open question 1).
  //
  // ---- $9A64-$9A6D: the enemies, in the cartridge's order -----------------
  // The spawn engine runs BEFORE the player moves and the update loop AFTER,
  // which matters for the fan ($B0AF sub-states 1 and 2 compare their own Y
  // against $0320, the player's, so they see THIS frame's player position) and
  // for the one-frame-old positions the display list at $80A7 already used.
  // $968E's fork runs the same four in a DIFFERENT order -- see the note there.
  if (state.zp5C < 2) {                           // $9A5E-$9A62 BCS $9A70
    spawnEngine(state, res);                      // $9A64 JSR $A2C0
    enemyBullets(state, res);                     // $9A67 JSR $BBB7
    updatePlayer(state, res);                     // $9A6A JSR $9FFC
    updateEnemies(state, res);                    // $9A6D JSR $ADAB
  }

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

  // $9A76: JSR $C772 -- `LDA $19 / CMP #$04 / BNE $C77B (RTS) / JMP $CB8A`.
  //
  // W32a MADE THIS LOUD. It was a COMMENT AND NOTHING ELSE: no call, no throw.
  // That is invisible today only because $9663 (above) throws on $19 == 4 before
  // this line is reached -- i.e. it is COVERED, not silent. But it is covered by
  // a throw W32b is going to DELETE, and the moment that happens the arm driver
  // $CB8A/$CB91 (the fire timer and the per-frame group walk) becomes a genuine
  // quiet no-op with nothing left to announce it. Put the throw in now, so
  // W32b's own gate cannot pass without wiring $C772.
  //
  // $C772 is one of FOUR stage-5 entry points that fire unconditionally every
  // frame ($9663, $8B8D->$8BD9, $C25D->$C267, $9A76->$C772). All four walk the
  // four $0600 arm-group headers and all four do nothing when the headers are 0
  // -- which is why "just open runEngine's scope guard" does not make stage 5
  // run one frame.
  // W32b WIRED IT. $C778 JMP $CB8A, and $CB8A is itself `LDA $5C / CMP #$02 /
  // BCC $CB91 / RTS` -- so on a two-arm frame THIS CALL DOES NOTHING and the
  // arms are driven from $9691, inside the fork. With 0 or 1 arms alive there
  // is no fork and this is the only driver call in the frame. Two callers, one
  // pass per logical frame either way.
  if (state.zp19 === 4) {                         // $C772 LDA $19 / CMP #$04
    armDriverGated(state, res.enemyTables);       // $C778 JMP $CB8A
  }                                               // $C77B RTS

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
    streamBlock(state, res.stages[state.zp19]);   // $9ACE JSR $9D83
  }

  // $9AD1: the pause handler, and it is INSIDE the tail rather than after it --
  // which is what lets an already-paused frame ($9660 JMP $9A8C) reach the
  // START test that unpauses it. src/flow.js.
  pauseCheck(state, res);                         // $9AD1 -> $9ADA / $9AFF
}
