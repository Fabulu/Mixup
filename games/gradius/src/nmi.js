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
import { spawnEngine, enemyBullets, updateEnemies, clearSlot } from './enemies.js';
import { introStep, pauseCheck, respawn, codeMatch, startPlay, sub9BF0 } from './flow.js';
import { shotSweep } from './collision.js';
import { applyCapsule, computeRank } from './powerup.js';
import { addScore } from './score.js';
import { soundDriver, setBgm, setBgmCode, soundRequest, pulse1Dur, SND_BASE, OFF } from './sound.js';
import { chrBank } from './render/ppu.js';

// $80D4 jt_80D4 -- the 7-entry GAME-MODE jump table, indexed by `$00` (the
// mode byte) after `$83E4`'s `ASL A`. Verified straight out of assets/prg.bin
// (it is FIXED ROM data, not a ported set -- it cannot go stale). Only entry 5
// ($9650) is ported; 0-4,6 are the boot/title/attract/continue/high-score
// screens the port boots past (src/main.js sets mode 5 directly). Named here so
// the else-throw below can cite the exact target the cartridge would have
// reached, instead of a silent no-op that produces a wrong frame.
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
  buildDisplayList(state, res.metasprites);

  // $80AA: JSR $80BE -> INC $02, then the mode dispatch at $80D1.
  state.frame = (state.frame + 1) & 0xFF;         // $80BE INC $02
  if (state.mode === MODE_STAGE) {
    stagePlay(state, res);
  } else {
    // THE LOUDNESS FIX (20-plan sec 5 / the W21 loudness note). The `$80D1
    // JSR $83E4` dispatches `$00` through jt_80D4 above; only mode 5 is
    // ported. Before this else, every non-mode-5 frame was a SILENT wrong
    // frame: the sweep measured 76 such windows in the title/attract run
    // (modes 0,1,2 -- 20-recon-sweep-harness.md) and the port said nothing.
    // The port boots straight to mode 5 and never transitions out, so reaching
    // here means a state the port does not model; throw the ROM address it
    // would have reached, not a quiet no-op. (Porting modes 0-3,6 is W36.)
    const tgt = MODE_TARGETS[state.mode];
    throw new Error(
      '$80D1: game mode ' + state.mode + ' is not ported -- jt_80D4 entry '
      + state.mode + (tgt ? (' -> $' + tgt.toString(16).toUpperCase().padStart(4, '0')
                            + ' (the title/attract/continue/high-score screen). ')
                          : ' is OUT OF the 7-entry jt_80D4 table. ')
      + 'Only mode 5 ($9650) is ported; the port boots to mode 5 and never '
      + 'leaves. Modes 0-4,6 are W36.');
  }

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
    case 0x7: throw new Error(                       // [7]  $87 -> $9B3E
        '$9B3E: jt_$982F arm 7 (full stage reset) reached through the play '
      + 'dispatch, not the intro dispatch $96C5. introReset is ported '
      + '(src/flow.js) but this entry through $982A is 0 hits in the endchain '
      + 'run; left as a throw. Delegate to introStep or leave for the '
      + 'stage-transition wave.');
    case 0x8: throw new Error(                       // [8]  $88 -> $9BED
        '$9BED: jt_$982F arm 8 (intro banner) reached through the play '
      + 'dispatch. introPackets is ported (src/flow.js) but this entry is '
      + '0 hits in the endchain run; left as a throw.');
    case 0x9: throw new Error(                       // [9]  $89 -> $9C12
        '$9C12: jt_$982F arm 9 (intro HUD) reached through the play dispatch. '
      + 'introHud is ported (src/flow.js) but this entry is 0 hits; left as a '
      + 'throw.');
    case 0xA: throw new Error(                       // [10] $8A -> $9C1E
        '$9C1E: jt_$982F arm 10 (intro meter) reached through the play '
      + 'dispatch. introMeter is ported (src/flow.js) but this entry is 0 hits; '
      + 'left as a throw.');
    case 0xB: throw new Error(                       // [11] $8B -> $988C
        '$988C: jt_$982F arm 11. $57->spawn 9 / else $9C24; INC $1B->$8C. '
      + '0 hits in the endchain run; off the stage-1 clear path.');
    case 0xC: throw new Error(                       // [12] $8C -> $98DD
        '$98DD: jt_$982F arm 12. INC $5B / JSR $ADAB / JMP $9A8C. 0 hits in '
      + 'the endchain run; off the stage-1 clear path.');
    case 0xD: throw new Error(                       // [13] $8D -> $98E5
        '$98E5: jt_$982F arm 13 (reset-to-intro). $1B := 0 / JMP $9B3E. 0 '
      + 'hits in the endchain run; off the stage-1 clear path.');
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
  if (state.cam.hi >= res.stage.bossPage) {         // $9A4F-$9A54 CMP $9A3D,X / BCC $9A5B
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
 *         (stage 6 special: $4D:=1, $4C:=$CA -- unreachable, one stage loaded)
 *   9A1E  BD 35 9A / 85 4D            $4D := $9A35[$17]
 *   9A23  A9 00 / 85 4C               $4C := 0
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
    throw new Error('$9A12: $19 = 6 (stage 6 special case). $4D:=1, $4C:=$CA '
                  + 'is unreachable -- the port loads one stage.');
  }
  state.zp4D = res.stage.rankCountdown[rank];        // $9A1E LDA $9A35,X / STA $4D
  state.zp4C = 0;                                    // $9A23/$9A25 STA $4C
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
 * (-> $84), and for stage >= 5 a shortcut to $86 (unreachable, one stage
 * loaded); else INC $5B, `$62 := 2`, clear $63-$6F, JMP $9A5E.
 *
 *   99C0  E6 1B                       $1B -> $84
 *   99C2  A5 19 / C9 05 / 90 0B       stage < 5 -> $99D3
 *   99C8  D0 05                       stage > 5 -> $99CF (skip the sfx)
 *   99CA  A9 AC / 20 1E EC            stage == 5: sfx $AC
 *   99CF  A9 86 / 85 1B               $1B := $86
 *   99D3  E6 5B / A9 02 / 85 62       INC $5B; $62 := 2
 *   99D9  20 DF 99                    clear $63-$6F
 *   99DC  4C 5E 9A                    JMP $9A5E
 */
function st99C0(state, res) {
  state.substate = u8(state.substate + 1);           // $99C0 INC $1B -> $84
  if (state.zp19 >= 5) {                             // $99C4 CMP #$05 / BCC $99D3
    throw new Error('$99C4: $19 = ' + state.zp19 + ' (>= 5). The stage>=5 '
                  + 'shortcut sets $1B := $86'
                  + (state.zp19 === 5 ? ' after sfx $AC ($99CA)' : '')
                  + ' ($99CF). Unreachable: the port loads one stage; $86/$9904 '
                  + 'is W27.');
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
  if (state.cam.hi === res.stage.bossPage) {         // $9986 CMP $9A3D,X / BEQ $99BA
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
    throw new Error('$9872: $19 = 6 -- the ending sequence. $1B -> $87, the '
                  + 'ending-chain state (the "$0100 := $03" path). Out of scope '
                  + '(one stage loaded); reached only past stage 7.');
  }
  if (state.zp19 === 5) {                            // $990D CMP #$05
    throw new Error('$9911 JSR $CDA5: $19 = 5 (stage-6 stage-end arm). Out of '
                  + 'scope (one stage loaded).');
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
  // $9926 LDY $19 / LDA $3F / CMP $98FD,Y / BCC $9947. res.stage.endPage is
  // $98FD[$19] for the loaded stage (stage 1: $0E); $19 has not advanced yet.
  if (state.cam.hi < res.stage.endPage) {            // $992A CMP $98FD,Y / BCC $9947
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
